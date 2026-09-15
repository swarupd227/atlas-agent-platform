import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";

/**
 * Propose an agent team for an outcome, narrating progress while the planner
 * works (it can take a few minutes). The plan is saved as the outcome's draft
 * proposal -- the same draft the Outcome page shows -- and nothing is built
 * until build_team is confirmed. Connector bindings are checked against the
 * organization's real connectors and tools.
 */

type Input = { outcomeId: string; feedback?: string };

export const proposeTeamTool: AstraTool<Input> = {
  name: "propose_team",
  description:
    "Propose an agent team (orchestrator, workers, pipeline, approval gates) for one of the organization's outcomes. Takes up to a few minutes and narrates progress. Saves the plan as the outcome's draft proposal, replacing any earlier draft; builds nothing. Reports connector bindings that won't work. Pass the user's requirements for the team in feedback -- especially steps a person must approve -- both the first time and to revise a proposal.",
  input: z.object({
    outcomeId: z.string().min(1).describe("The outcome's id (from list_outcomes or create_outcome)."),
    feedback: z.string().max(2000).optional().describe("The user's requirements for the team, or what to change about the previous proposal, in their words (e.g. 'a person approves before any equipment moves')."),
  }),
  permission: "create_modify_blueprints",
  confirm: false,
  run: async (ctx, input) => {
    const said = new Set<string>();
    const r = await ctx.services.proposeTeamForOutcome(ctx.orgId, input.outcomeId, ctx.industryId ?? null, input.feedback, (message: string) => {
      if (said.has(message)) return;
      said.add(message);
      ctx.onProgress?.({ type: "working", label: message.replace(/\.\.\.$/, "") });
    });
    if (!r.ok) {
      return { payload: { proposed: false, error: r.error, ...(r.likelyTooLarge || r.timeout ? { tip: "Describe a smaller team, or split the outcome into stages." } : {}) } };
    }

    const plan = r.plan;
    const workers: any[] = plan.agents;
    const byAgent = new Map<string, { connectors: string[]; issues: Array<{ message: string; code: string }> }>(
      r.bindings.agents.map((a: any) => [a.name, a]),
    );
    const gates = workers.filter((w) => w.isHumanCheckpoint).map((w) => w.name);
    const concepts = Array.from(new Set(workers.flatMap((w) => w.matchedOntologyConcepts ?? []))) as string[];

    const payload = {
      proposed: true,
      proposalId: r.proposalId,
      ...(r.proposalId ? {} : { note: "The plan couldn't be saved as a draft, so it can't be built from here." }),
      outcome: r.outcome,
      orchestrator: plan.orchestrator?.name ?? null,
      pattern: plan.pipeline?.pattern ?? null,
      workers: workers.map((w) => ({
        name: w.name,
        role: w.role,
        ...(w.isHumanCheckpoint ? { approvalGate: true } : {}),
        connectors: byAgent.get(w.name)?.connectors ?? [],
        issues: (byAgent.get(w.name)?.issues ?? []).map((i) => i.message),
      })),
      approvalGates: gates,
      bindingIssues: r.bindings.issues.length,
      ...(r.outcome.status === "pending_review" ? { outcomeReview: "The outcome is still pending review; it must be approved before build_team." } : {}),
    };

    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: `${gates.length} approval ${gates.length === 1 ? "gate" : "gates"} in the plan · ${r.bindings.issues.length} connector binding ${r.bindings.issues.length === 1 ? "issue" : "issues"}`,
      },
      context: { status: "measured", summary: `Bindings checked against ${r.bindings.connectorsChecked} connectors and their tools` },
      industry: concepts.length
        ? { status: "measured", summary: concepts.slice(0, 4).join(" · ") }
        : { status: "not_measured", reason: "The plan names no industry concepts." },
    };

    return {
      payload,
      artifact: {
        kind: "teamProposal",
        title: plan.orchestrator?.name ?? `Team for ${r.outcome.name}`,
        props: {
          outcome: r.outcome,
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
            // The planner's own claim, not a measurement.
            estimatedImpact: w.estimatedImpact || null,
          })),
        },
        fullViewHref: `/outcomes/${r.outcome.id}`,
      },
      proof,
    };
  },
};
