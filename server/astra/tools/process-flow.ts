import { z } from "zod";
import { draftKey, holdDraft, takeDraft } from "../flow-drafts";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Drawing a process flow from a description, in the conversation.
 *
 * The Studio has done this since it was built, behind a "Describe workflow"
 * panel; Cowork could talk about a process all day and not produce one. The
 * conversation is arguably the better place for it: the clarifying questions
 * the Studio asks in a modal are just talking, and Astra already knows the
 * organization's outcomes, agents and industry.
 *
 * One tool, not two, and the preview does the drawing. That way the card shows
 * the steps it is actually about to create, with whatever the compiler flags
 * about them.
 *
 * What the preview drew is held in flow-drafts.ts until the person confirms,
 * because a confirm card's frozen input is only what the card SHOWS -- `run`
 * is handed the model's original arguments. Drawing again on confirm would
 * risk saving a flow that differs from the one just read and agreed to.
 */

type Input = { description?: string; name?: string; fileIds?: string[] };

interface Drafted {
  name: string;
  nodes: Array<{ id: string; type: string; label: string; actor?: string }>;
  edges: Array<{ id: string; from: string; to: string; label?: string; condition?: string }>;
  /** What the compiler says about the draft: missing trigger, a decision with no condition… */
  warnings: string[];
}

/** The shape of a flow in one line: what a person checks before saving. */
export function flowShape(nodes: Drafted["nodes"], edges: Drafted["edges"]): string {
  const of = (type: string) => nodes.filter((n) => n.type === type).length;
  const parts = [`${nodes.length} ${nodes.length === 1 ? "step" : "steps"}`];
  if (of("make_decision")) parts.push(`${of("make_decision")} decision${of("make_decision") === 1 ? "" : "s"}`);
  if (of("parallel")) parts.push(`${of("parallel")} parallel split${of("parallel") === 1 ? "" : "s"}`);
  if (of("expert_approval")) parts.push(`${of("expert_approval")} approval${of("expert_approval") === 1 ? "" : "s"}`);
  const conditioned = edges.filter((e) => e.condition).length;
  if (conditioned) parts.push(`${conditioned} conditional path${conditioned === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** The steps, in the order they were drawn, for the card. */
export function stepLines(nodes: Drafted["nodes"], limit = 12): string[] {
  const lines = nodes.slice(0, limit).map((n, i) => `${i + 1}. ${n.label}${n.actor ? ` — ${n.actor}` : ""}`);
  if (nodes.length > limit) lines.push(`…and ${nodes.length - limit} more`);
  return lines;
}

export const createProcessFlowTool: AstraTool<Input> = {
  name: "create_process_flow",
  description:
    "Draw a process flow from a description of how the work runs, and save it to the Process Flow library. Attached documents can be the description ('here is our SOP'). The user sees the steps and anything the compiler flags, and confirms before it is saved.",
  input: z.object({
    description: z.string().max(4000).optional().describe("How the process runs, in the user's own words. Optional only when a document is attached."),
    name: z.string().max(80).optional().describe("What to call the flow; one is drafted if you don't give it."),
    fileIds: z.array(z.string()).max(5).optional().describe("Attached process documents to derive the flow from."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    if (!input.description?.trim() && !(input.fileIds?.length)) {
      return { refuse: "Describe the process, or attach the document that describes it." };
    }
    let drafted: Drafted;
    try {
      drafted = await ctx.services.draftFlow(ctx.orgId, input);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (drafted.nodes.length === 0) {
      return { refuse: "I couldn't turn that into a flow. Say what starts it, what happens in between, and how it ends." };
    }

    const name = input.name?.trim() || drafted.name;
    // Held for the confirmation; run() gets the model's arguments, not this.
    holdDraft(draftKey(ctx.orgId, input), { name, graph: { name, nodes: drafted.nodes, edges: drafted.edges }, warnings: drafted.warnings });
    return {
      summary: `Create process flow "${name}"`,
      details: [
        flowShape(drafted.nodes, drafted.edges),
        ...stepLines(drafted.nodes),
        // The compiler's findings are the reason to look before saving.
        ...(drafted.warnings.length
          ? ["", "Worth checking before you run it:", ...drafted.warnings.map((w) => `• ${w}`)]
          : ["", "The compiler found nothing to flag."]),
        "",
        "It is saved to the library, where you can edit it. Nothing runs until you turn it into an automation.",
      ],
      // Shown on the card; the graph itself is held server-side.
      frozen: { name, steps: drafted.nodes.length },
    };
  },
  run: async (ctx, input) => {
    const frozen = takeDraft(draftKey(ctx.orgId, input));
    // Gone means the process restarted between the card and the click. Saying
    // so beats drawing a second flow and calling it the one they agreed to.
    if (!frozen?.graph?.nodes?.length) {
      throw new Error("The flow I drew is no longer held (the server restarted). Ask me to draw it again and I'll show you the steps.");
    }
    const saved = await ctx.services.saveFlow(ctx.orgId, frozen.name, frozen.graph);
    const proof: Partial<ProofEnvelope> = {
      context: frozen.warnings.length
        ? { status: "measured", summary: `Saved with ${frozen.warnings.length} thing${frozen.warnings.length === 1 ? "" : "s"} to check` }
        : { status: "measured", summary: "Saved; the compiler flagged nothing" },
    };
    return {
      payload: {
        created: true,
        id: saved.id,
        name: saved.name,
        steps: frozen.graph.nodes.length,
        openIn: `/process-flows?flowId=${saved.id}`,
        toCheck: frozen.warnings,
      },
      artifact: {
        kind: "text",
        title: saved.name,
        props: {
          text: [
            `**${saved.name}** — ${frozen.graph.nodes.length} steps.`,
            ...(frozen.warnings.length ? ["", "Worth checking:", ...frozen.warnings.map((w) => `- ${w}`)] : []),
          ].join("\n"),
        },
      },
      proof,
    };
  },
};

type ReviseInput = { flow: string; instruction: string };

interface RevisionPlan {
  flow: { id: string; name: string };
  changed: string[];
  skipped: string[];
  warnings: string[];
  graph: unknown | null;
}

export const listProcessFlowsTool: AstraTool<{ name?: string }> = {
  name: "list_process_flows",
  description: "The organization's process flows, with their ids — needed to change one.",
  input: z.object({ name: z.string().max(120).optional().describe("Only flows whose name contains this.") }),
  confirm: false,
  run: async (ctx, input) => {
    const flows = await ctx.services.findFlows(ctx.orgId, input.name);
    return {
      payload: {
        total: flows.length,
        flows: flows.map((f: { id: string; name: string; steps: number }) => ({ id: f.id, name: f.name, steps: f.steps, openIn: `/process-flows?flowId=${f.id}` })),
      },
    };
  },
};

export const reviseProcessFlowTool: AstraTool<ReviseInput> = {
  name: "revise_process_flow",
  description:
    "Change an existing process flow by describing the change ('put a fraud check before the payout'). Only what was asked for moves; everything else keeps its place on the canvas. The user sees exactly what will change, and can undo it afterwards.",
  input: z.object({
    flow: z.string().min(1).describe("The flow's id, from list_process_flows."),
    instruction: z.string().min(3).max(1000).describe("The change, in the user's own words."),
  }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    let plan: RevisionPlan;
    try {
      plan = await ctx.services.planFlowRevision(ctx.orgId, input.flow, input.instruction);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (!plan.graph || plan.changed.length === 0) {
      return {
        refuse: plan.skipped.length
          ? `I couldn't make that change: ${plan.skipped.join(" ")}`
          : "I couldn't see what to change from that. Name the step, and say what should happen before or after it.",
      };
    }

    holdDraft(reviseKey(ctx.orgId, input), { name: plan.flow.name, graph: plan.graph as HeldGraph, warnings: plan.warnings });
    return {
      summary: `Change "${plan.flow.name}"`,
      details: [
        ...plan.changed,
        // What it could not do belongs on the card too: a step it failed to
        // find is usually a step the person named differently.
        ...(plan.skipped.length ? ["", "What I couldn't do:", ...plan.skipped.map((sk) => `• ${sk}`)] : []),
        ...(plan.warnings.length
          ? ["", "Worth checking after this:", ...plan.warnings.map((w) => `• ${w}`)]
          : ["", "The compiler flags nothing about the result."]),
        "",
        "Everything not listed above keeps its place. You can undo this afterwards.",
      ],
      frozen: { flow: plan.flow.id, changes: plan.changed.length },
    };
  },
  run: async (ctx, input) => {
    const held = takeDraft(reviseKey(ctx.orgId, input));
    if (!held?.graph) {
      throw new Error("The change I worked out is no longer held (the server restarted). Ask for it again and I'll show you what it would do.");
    }
    const saved = await ctx.services.saveFlowRevision(ctx.orgId, input.flow, held.graph, input.instruction, await actorLabel(ctx));
    return {
      payload: { changed: true, flow: saved.name, openIn: `/process-flows?flowId=${saved.id}`, toCheck: held.warnings, undo: "Ask me to undo it and I will put the previous version back." },
      proof: { context: { status: "measured", summary: "The state it replaced was kept, so this can be undone" } },
    };
  },
};

export const undoFlowChangeTool: AstraTool<{ flow: string }> = {
  name: "undo_flow_change",
  description: "Put a process flow back to how it was before the last change, whoever made it.",
  input: z.object({ flow: z.string().min(1).describe("The flow's id, from list_process_flows.") }),
  permission: "create_modify_outcomes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => ({
    summary: "Undo the last change to this flow",
    details: [
      "The flow goes back to the state before its last save.",
      "That state is itself kept, so this can be undone in turn.",
    ],
    frozen: { flow: input.flow },
  }),
  run: async (ctx, input) => {
    const restored = await ctx.services.undoFlowChange(ctx.orgId, input.flow, await actorLabel(ctx));
    return {
      payload: { undone: true, flow: restored.name, openIn: `/process-flows?flowId=${restored.id}` },
      proof: { context: { status: "measured", summary: "Restored from the recorded version history" } },
    };
  },
};

/**
 * Turning a flow into a running automation.
 *
 * The Studio has had this since it was built ("Turn into a live automation"),
 * but only from the Studio: Cowork could draw a flow, change it, and then had
 * nothing to say when the user asked how to make it run. It plans, it does not
 * build -- build_team does that, behind its own confirm card -- because a plan
 * is worth reading before six agents exist.
 *
 * "Live" is three separate things in this platform, and conflating them is the
 * overclaim to avoid: built, deployed, and run. This tool does the first only,
 * and the reply says so.
 */
type AutomateInput = { flow: string; feedback?: string };

export const automateProcessFlowTool: AstraTool<AutomateInput> = {
  name: "automate_process_flow",
  description:
    "Plan the agent team that would run a saved process flow: one agent per step, the flow's own connections as the team's order, and its approval steps as gates a person must pass. Takes a few minutes and narrates progress. Plans only -- build_team then builds it, and the team is created attached to no outcome. Use the user's requirements as feedback.",
  input: z.object({
    flow: z.string().min(1).describe("The flow's id, from list_process_flows."),
    feedback: z.string().max(2000).optional().describe("The user's requirements for the team, or what to change about the previous plan, in their words."),
  }),
  permission: "create_modify_blueprints",
  confirm: false,
  run: async (ctx, input) => {
    const said = new Set<string>();
    const narrate = (message: string) => {
      if (said.has(message)) return;
      said.add(message);
      ctx.onProgress?.({ type: "working", label: message.replace(/\.\.\.$/, "") });
    };
    const r = await ctx.services.proposeTeamForFlow(ctx.orgId, ctx.threadId, input.flow, ctx.industryId ?? null, input.feedback, narrate);
    if (!r.ok) {
      return { payload: { planned: false, error: r.error, ...(r.likelyTooLarge || r.timeout ? { tip: "Split the flow into stages and automate each one." } : {}) } };
    }

    const plan = r.plan;
    const workers: any[] = plan.agents;
    const byAgent = new Map<string, { connectors: string[]; issues: Array<{ message: string; code: string }> }>(
      r.bindings.agents.map((a: any) => [a.name, a]),
    );
    const gates = workers.filter((w) => w.isHumanCheckpoint).map((w) => w.name);

    return {
      payload: {
        planned: true,
        proposalId: r.proposalId,
        ...(r.proposalId ? {} : { note: "The plan couldn't be saved as a draft, so it can't be built from here." }),
        flow: r.flow,
        orchestrator: plan.orchestrator?.name ?? null,
        pattern: plan.pipeline?.pattern ?? null,
        agents: workers.map((w) => ({
          name: w.name,
          role: w.role,
          ...(w.isHumanCheckpoint ? { approvalGate: true } : {}),
          // Which of the flow's steps this agent says it covers: the link
          // between the drawing and the team, and what the ordering rests on.
          covers: w.flowStepLabels ?? [],
          connectors: byAgent.get(w.name)?.connectors ?? [],
          issues: (byAgent.get(w.name)?.issues ?? []).map((i) => i.message),
        })),
        approvalGates: gates,
        ...(r.sequencing.ok
          ? { orderedFromTheFlow: true }
          : { orderedFromTheFlow: false, sequencing: r.sequencing.warning }),
        ...(r.flow.warnings.length ? { flowNeedsChecking: r.flow.warnings } : {}),
        bindingIssues: r.bindings.issues.length,
        next: "build_team with this proposal id creates the agents. It is attached to no outcome, so nothing measures it: attach_team_to_outcome afterwards if its runs should count towards one. Building is not deploying, and nothing runs until the user asks.",
      },
      artifact: {
        kind: "teamProposal",
        title: plan.orchestrator?.name ?? `Team for ${r.flow.name}`,
        props: {
          outcome: null,
          work: `The process flow "${r.flow.name}" (${r.flow.steps} steps)`,
          proposalId: r.proposalId,
          orchestrator: plan.orchestrator ? { name: plan.orchestrator.name, description: plan.orchestrator.description } : null,
          pipeline: plan.pipeline ? { pattern: plan.pipeline.pattern, description: plan.pipeline.description } : null,
          workers: workers.map((w) => ({
            name: w.name,
            role: w.role,
            description: w.description,
            isHumanCheckpoint: !!w.isHumanCheckpoint,
            tools: (w.tools ?? []).map((t: any) => t.name),
            connectors: byAgent.get(w.name)?.connectors ?? [],
            issues: byAgent.get(w.name)?.issues ?? [],
            estimatedImpact: w.estimatedImpact || null,
          })),
        },
        fullViewHref: `/process-flows?flowId=${r.flow.id}`,
      },
      proof: {
        compliance: {
          status: "measured",
          summary: `${gates.length} approval ${gates.length === 1 ? "gate" : "gates"} in the plan · ${r.bindings.issues.length} connector binding ${r.bindings.issues.length === 1 ? "issue" : "issues"}`,
        },
        context: r.sequencing.ok
          ? { status: "measured", summary: `Ordered by the flow's own ${r.flow.steps}-step design` }
          : { status: "not_measured", reason: "The plan carried no step coverage, so the flow's order could not be applied" },
      },
    };
  },
};

/** Who is asking, for the version history. */
async function actorLabel(ctx: { services: { getUserDisplayName?: (id: string | null) => Promise<string | null> }; userId: string | null; role: string }): Promise<string> {
  return (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
}

/** A revision is held by the flow and the words that described the change. */
function reviseKey(orgId: string, input: ReviseInput): string {
  return draftKey(orgId, { name: input.flow, description: input.instruction });
}

type HeldGraph = { name: string; nodes: unknown[]; edges: unknown[] };

export const PROCESS_FLOW_TOOLS: AstraTool[] = [createProcessFlowTool, listProcessFlowsTool, reviseProcessFlowTool, undoFlowChangeTool, automateProcessFlowTool] as AstraTool[];
