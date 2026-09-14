import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";

/**
 * What needs the user: pending decisions first (approvals, urgent alerts,
 * recommendations, policy exceptions, tool-use requests), then things to
 * know. Marks which approvals can be decided right here with decide_approval.
 */

type Input = { includeFyi?: boolean };

interface Item {
  id: string;
  source: string;
  category: string;
  sourceId: string;
  title: string;
  context: string;
  urgency: "urgent" | "today" | "this_week";
  businessImpact: string | null;
  agentAttribution: string | null;
  createdAt: string | null;
  approvalKind: string | null;
  canDecideHere: boolean;
}

const compact = (i: Item) => ({
  title: i.title,
  kind: i.category.replace(/_/g, " "),
  urgency: i.urgency.replace(/_/g, " "),
  ...(i.businessImpact ? { impact: i.businessImpact } : {}),
  ...(i.source === "approval" ? { approvalId: i.sourceId, canDecideHere: i.canDecideHere } : {}),
  createdAt: i.createdAt,
});

export const listNeedsMeTool: AstraTool<Input> = {
  name: "list_needs_me",
  description:
    "What needs the user's attention: pending approvals and decisions (urgent first), with approval ids and whether they can be decided here with decide_approval; optionally the things-to-know list too.",
  input: z.object({ includeFyi: z.boolean().optional().describe("Also list items that don't need a decision.") }),
  confirm: false,
  run: async (ctx, input) => {
    const data: { needsDecisionCount: number; fyiCount: number; completedTodayCount: number; needsDecision: Item[]; fyi: Item[] } =
      await ctx.services.needsMe(ctx.orgId, ctx.role);
    const decidableHere = data.needsDecision.filter((i) => i.canDecideHere).length;
    const payload = {
      needsDecision: data.needsDecisionCount,
      thingsToKnow: data.fyiCount,
      decidedToday: data.completedTodayCount,
      decidableHere,
      items: data.needsDecision.slice(0, 10).map(compact),
      ...(input.includeFyi ? { fyi: data.fyi.slice(0, 10).map(compact) } : {}),
    };
    const proof: Partial<ProofEnvelope> = {
      compliance: { status: "measured", summary: `${data.needsDecisionCount} waiting on a decision · ${decidableHere} decidable here by ${ctx.role}` },
    };
    return {
      payload,
      artifact: { kind: "needsMe", title: "Needs you", props: { ...data, needsDecision: data.needsDecision.slice(0, 25), fyi: data.fyi.slice(0, 25) }, fullViewHref: "/my-actions" },
      proof,
    };
  },
};
