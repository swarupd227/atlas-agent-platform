import { z } from "zod";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Accept or dismiss an improvement recommendation. The card says exactly what
 * accepting does: only a model downgrade changes the agent; retraining and
 * workflow changes are recorded as accepted and reported as work still to do.
 * The impact line is the generator's estimate, and is labelled that way.
 */

type Input = { recommendationId: string; decision: "accept" | "dismiss"; note?: string };

interface RecommendationView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string;
  estimatedImpact: string | null;
  agent: { id: string; name: string };
  effect: { kind: "model_downgrade"; from: string; to: string } | { kind: "manual"; work: string };
}

async function load(ctx: Parameters<NonNullable<AstraTool<Input>["preview"]>>[0], input: Input): Promise<{ refuse: string } | { rec: RecommendationView }> {
  const rec: RecommendationView | null = await ctx.services.getRecommendationForDecision(ctx.orgId, input.recommendationId);
  if (!rec) return { refuse: "No recommendation with that id for an agent in this organization." };
  if (rec.status !== "pending") return { refuse: `That recommendation was already ${rec.status}. Nothing to decide.` };
  return { rec };
}

function effectLine(rec: RecommendationView, decision: Input["decision"]): string {
  if (decision === "dismiss") return `The recommendation is dismissed; ${rec.agent.name} doesn't change.`;
  return rec.effect.kind === "model_downgrade"
    ? `${rec.agent.name}'s model changes from ${rec.effect.from} to ${rec.effect.to}.`
    : `Recorded as accepted, but nothing changes automatically. ${rec.effect.work}`;
}

export const decideRecommendationTool: AstraTool<Input> = {
  name: "decide_recommendation",
  description:
    "Accept or dismiss an improvement recommendation for one of the organization's agents (from list_needs_me). The confirmation card says what accepting really does: only a model downgrade changes the agent; other recommendations are recorded as accepted and the remaining work is named. The user confirms first.",
  input: z.object({
    recommendationId: z.string().min(1).describe("The recommendation's id."),
    decision: z.enum(["accept", "dismiss"]).describe("accept or dismiss."),
    note: z.string().max(1000).optional().describe("A reason, recorded with the decision."),
  }),
  permission: "approve_changes",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) return loaded;
    const rec = loaded.rec;
    return {
      summary: `${input.decision === "accept" ? "Accept" : "Dismiss"} recommendation: ${rec.title}`,
      details: [
        effectLine(rec, input.decision),
        ...(rec.estimatedImpact ? [`Estimated impact (the recommender's estimate, not measured): ${rec.estimatedImpact}`] : []),
        ...(input.note ? [`Your note: ${input.note}`] : []),
        "Recorded in the audit trail, the same as deciding it in My Actions.",
      ],
      frozen: { recommendationId: rec.id, effect: rec.effect.kind },
    };
  },
  run: async (ctx, input) => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) throw new Error(loaded.refuse);
    const actorLabel = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const result = await ctx.services.decideRecommendationAs(ctx.orgId, ctx.userId, actorLabel, input.recommendationId, input.decision, input.note);
    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: `${input.decision === "accept" ? "Accepted" : "Dismissed"} as ${ctx.role} · ${result.changed ? `model ${result.changed.from} → ${result.changed.to}` : "no automatic change"} · audit recorded`,
      },
    };
    return {
      payload: {
        decided: true,
        recommendationId: result.recommendation.id,
        decision: input.decision,
        agent: result.agent,
        changed: result.changed,
        stillToDo: result.stillToDo,
      },
      proof,
    };
  },
};
