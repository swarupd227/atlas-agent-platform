import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview, ConfirmWarning, ProofEnvelope } from "../types";

/**
 * Build the team a proposal describes, in the caller's organization: the
 * team agent and its workers, connector links, the team blueprint with its
 * approval gates, and baseline eval suites. Does not deploy or run anything.
 * Waits for the outcome's review to be approved first.
 */

type Input = { proposalId: string; excludeWorkers?: string[] };

interface Loaded {
  proposal: { id: string; status: string; orchestrator: any; workers: any[]; pipeline: any };
  /** Null for a plan made from a description of the work: there is no outcome behind it. */
  outcome: { id: string; name: string; status: string; riskTier: string } | null;
  pendingReviewApprovalId: string | null;
  processFlowSteps?: any[];
  hash: string;
}

const lower = (s: string) => s.trim().toLowerCase();

/** The plan without excluded workers, including their places in the pipeline. */
export function withoutWorkers(plan: { workers: any[]; pipeline: any }, exclude: string[]) {
  const drop = new Set(exclude.map(lower));
  const keep = (name?: string) => !name || !drop.has(lower(name));
  const workers = plan.workers.filter((w) => keep(w.name));
  // Bridge each removed step: whatever led into it now leads to whatever followed it.
  let edges: any[] = plan.pipeline?.edges ?? [];
  for (const name of Array.from(drop)) {
    const into = edges.filter((e) => e.to && lower(e.to) === name);
    const outOf = edges.filter((e) => e.from && lower(e.from) === name);
    const rest = edges.filter((e) => !into.includes(e) && !outOf.includes(e));
    const bridged = into.flatMap((i) => outOf.map((o) => ({ ...o, from: i.from })));
    edges = [...rest, ...bridged.filter((b) => !rest.some((r) => lower(r.from ?? "") === lower(b.from ?? "") && lower(r.to ?? "") === lower(b.to ?? "")))];
  }
  const pipeline = plan.pipeline
    ? {
        ...plan.pipeline,
        edges: edges.filter((e: any) => keep(e.from) && keep(e.to)),
        parallelGroups: (plan.pipeline.parallelGroups ?? []).map((g: string[]) => g.filter(keep)).filter((g: string[]) => g.length > 0),
        executionGraph: (plan.pipeline.executionGraph ?? []).map((st: any) => ({ ...st, agents: (st.agents ?? []).filter(keep) })).filter((st: any) => st.agents.length > 0),
        agentDependencyMatrix: (plan.pipeline.agentDependencyMatrix ?? [])
          .filter((d: any) => keep(d.agent))
          .map((d: any) => ({ ...d, dependsOn: (d.dependsOn ?? []).filter(keep) })),
        humanCheckpoints: (plan.pipeline.humanCheckpoints ?? []).filter((h: any) => keep(h.agentName)),
      }
    : plan.pipeline;
  return { workers, pipeline };
}

async function load(ctx: AstraToolContext, input: Input): Promise<{ refuse: string } | { loaded: Loaded; workers: any[]; pipeline: any }> {
  const loaded: Loaded | null = await ctx.services.getProposalForBuild(ctx.orgId, input.proposalId);
  if (!loaded) return { refuse: "No team proposal with that id in this organization. Use propose_team first." };
  if (loaded.proposal.status === "created") return { refuse: "This proposal has already been built into a team." };
  if (loaded.outcome?.status === "pending_review") {
    return {
      refuse: `The outcome "${loaded.outcome!.name}" is still pending review, so its team can't be built yet.${loaded.pendingReviewApprovalId ? ` Its review approval is ${loaded.pendingReviewApprovalId}; decide it with decide_approval.` : ""}`,
    };
  }
  const exclude = input.excludeWorkers ?? [];
  const names = new Set(loaded.proposal.workers.map((w) => lower(w.name ?? "")));
  const unknown = exclude.filter((n) => !names.has(lower(n)));
  if (unknown.length) return { refuse: `The proposal has no worker named ${unknown.map((n) => `"${n}"`).join(", ")}.` };
  const { workers, pipeline } = withoutWorkers(loaded.proposal, exclude);
  if (workers.length === 0) return { refuse: "That would leave the team with no workers." };
  if (!loaded.proposal.orchestrator) return { refuse: "The proposal has no orchestrator, so it can't be built. Propose the team again." };
  return { loaded, workers, pipeline };
}

export const buildTeamTool: AstraTool<Input> = {
  name: "build_team",
  description:
    "Build the team from a saved proposal (from propose_team): creates the team and worker agents in the organization, links their connectors, creates the team blueprint with its approval gates and baseline eval suites. Does not deploy or run anything. The outcome's review must be approved first. Optionally leave workers out by name. The user confirms first.",
  input: z.object({
    proposalId: z.string().min(1).describe("The proposal id from propose_team."),
    excludeWorkers: z.array(z.string()).max(20).optional().describe("Worker names to leave out of the team."),
  }),
  permission: "create_modify_blueprints",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const r = await load(ctx, input);
    if ("refuse" in r) return r;
    const { loaded, workers } = r;
    const orchestrator = loaded.proposal.orchestrator;
    const bindings = await ctx.services.assessBindings(ctx.orgId, [orchestrator, ...workers]);
    const policies = await ctx.services.resolvePolicyNames(ctx.orgId, [orchestrator, ...workers].flatMap((a: any) => a.policyConstraints ?? []));
    const gates = workers.filter((w) => w.isHumanCheckpoint).map((w) => w.name);
    const connectors = Array.from(new Set(bindings.agents.flatMap((a: any) => a.connectors))) as string[];
    const notConnected = Array.from(new Set(bindings.issues.filter((i: any) => i.code === "server_not_connected").map((i: any) => i.server))) as string[];
    const unresolved = Array.from(new Set(bindings.issues.filter((i: any) => i.code === "server_unresolved").map((i: any) => i.server))) as string[];
    const missingTools = bindings.issues.filter((i: any) => i.code === "tool_not_on_server");

    const warnings: ConfirmWarning[] = [];
    if (notConnected.length) warnings.push({ title: `${notConnected.length} ${notConnected.length === 1 ? "connector isn't" : "connectors aren't"} connected`, detail: `${notConnected.join(", ")}: the steps that use ${notConnected.length === 1 ? "it" : "them"} will fail until connected. They are linked anyway.` });
    if (unresolved.length) warnings.push({ title: `${unresolved.length} named ${unresolved.length === 1 ? "connector doesn't" : "connectors don't"} exist here`, detail: `${unresolved.join(", ")}: not linked.` });
    if (missingTools.length) warnings.push({ title: `${missingTools.length} expected ${missingTools.length === 1 ? "tool is" : "tools are"} missing`, detail: missingTools.slice(0, 5).map((i: any) => `${i.tool} on ${i.server}`).join("; ") });
    if ((loaded.outcome?.riskTier === "HIGH" || loaded.outcome?.riskTier === "CRITICAL") && gates.length === 0) {
      warnings.push({ title: `No approval gate for a ${loaded.outcome.riskTier}-risk outcome`, detail: "Nothing in this team pauses for a person before acting." });
    }
    if (!loaded.outcome) {
      warnings.push({
        title: "No outcome behind this team",
        detail: "Nothing measures whether it works: no KPI targets, no review, and it won't appear under an outcome. Create one later and bind the team to it if you want that.",
      });
      if (gates.length === 0) warnings.push({ title: "Nothing pauses for a person", detail: "No step in this team waits for an approval." });
    }

    return {
      summary: `Build ${orchestrator.name} (${workers.length} ${workers.length === 1 ? "agent" : "agents"}) ${loaded.outcome ? `for ${loaded.outcome.name}` : "for the work described in this conversation"}`,
      details: [
        `Agents: ${workers.map((w) => `${w.name}${w.isHumanCheckpoint ? " (pauses for a person)" : ""}`).join(", ")}.`,
        ...(input.excludeWorkers?.length ? [`Left out: ${input.excludeWorkers.join(", ")}.`] : []),
        connectors.length ? `Links connectors: ${connectors.join(", ")}.` : "Links no connectors.",
        policies.resolved.length || policies.unresolved.length
          ? `Policies bound: ${policies.resolved.length ? policies.resolved.join(", ") : "none"}${policies.unresolved.length ? `; named but not found here: ${policies.unresolved.join(", ")}` : ""}.`
          : loaded.outcome ? "Binds the outcome's policies, if any." : "Binds no policies: there's no outcome to take them from.",
        "Creates a draft team blueprint and baseline eval suites. Does not deploy or run anything.",
      ],
      warnings,
      frozen: { hash: loaded.hash, excludeWorkers: (input.excludeWorkers ?? []).map(lower).sort() },
    };
  },
  run: async (ctx, input) => {
    const r = await load(ctx, input);
    if ("refuse" in r) throw new Error(r.refuse);
    if (ctx.confirmation?.frozen?.hash !== r.loaded.hash) {
      throw new Error("The proposal changed after the confirm card was shown (it was proposed again), so nothing was built. Show the new proposal first.");
    }
    const { loaded, workers, pipeline } = r;
    const body = {
      ...(loaded.outcome ? { outcomeId: loaded.outcome.id } : {}),
      ...(ctx.industryId ? { industry: ctx.industryId } : {}),
      orchestrator: loaded.proposal.orchestrator,
      workers,
      pipeline,
      ...(loaded.processFlowSteps ? { processFlowSteps: loaded.processFlowSteps } : {}),
    };

    let built: any;
    try {
      built = await ctx.services.buildTeam(ctx.orgId, body);
    } catch (err: any) {
      if (err?.name === "ZodError") throw new Error("The saved proposal is missing details a team needs (for example an agent description). Propose the team again.");
      throw err;
    }
    await ctx.services.markProposalBuilt(loaded.proposal.id).catch(() => {});

    const team = {
      id: built.teamAgent.id,
      name: built.teamAgent.name,
      pattern: pipeline?.pattern ?? null,
      blueprintId: built.blueprint?.id ?? null,
      workers: built.workers.map((w: any) => ({ id: w.id, name: w.name, status: w.status })),
      unconnectedBindings: built.unconnectedBindings,
      unresolvedBindings: built.unresolvedBindings,
    };
    const proof: Partial<ProofEnvelope> = {
      context: {
        status: "measured",
        summary: `Connectors: ${built.unconnectedBindings.length} not connected · ${built.unresolvedBindings.length} not found`,
      },
    };
    return {
      payload: {
        built: true,
        teamAgentId: team.id,
        team: team.name,
        agents: team.workers.map((w: any) => w.name),
        approvalGates: workers.filter((w) => w.isHumanCheckpoint).map((w) => w.name),
        unconnectedConnectors: team.unconnectedBindings,
        connectorsNotFound: team.unresolvedBindings,
        next: "Check the wiring with verify_wiring before running it.",
      },
      artifact: { kind: "team", title: team.name, props: { team }, fullViewHref: `/agents/${team.id}` },
      proof,
    };
  },
};
