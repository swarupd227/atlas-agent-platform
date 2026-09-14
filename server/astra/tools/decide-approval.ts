import { z } from "zod";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Approve or reject an approval from the conversation: an outcome review, or
 * a team run waiting at an approval gate. Everything else stays on the
 * Approvals page. The routed reviewer role (or approve_changes) decides; the
 * decision is audited and has the same effect as deciding it on that page.
 */

type Input = { approvalId: string; decision: "approve" | "reject"; note?: string };

interface ApprovalView {
  id: string;
  type: string;
  objectType: string;
  objectName: string | null;
  status: string;
  description: string | null;
  requestedBy: string | null;
  createdAt: string | null;
  requiredReviewerRole: string | null;
  canDecide: { allowed: boolean; reason: string };
  outcome: { id: string; name: string; status: string } | null;
}

const DECIDABLE = new Set(["outcome_contract", "pipeline_gate"]);

function effect(a: ApprovalView, decision: Input["decision"]): string {
  if (a.objectType === "outcome_contract") {
    const name = a.outcome?.name ?? a.objectName ?? "The outcome";
    return decision === "approve"
      ? `${name} moves out of review and is ready for its agent plan: a team can be proposed and built.`
      : `${name} goes back to draft; it can be edited and submitted again.`;
  }
  return decision === "approve"
    ? "The team run waiting at this step continues."
    : "The team run stops at this step (a rejected gate fails it).";
}

function label(a: ApprovalView) {
  return a.objectType === "outcome_contract" ? `outcome review: ${a.outcome?.name ?? a.objectName ?? a.id}` : `approval gate: ${a.objectName ?? a.id}`;
}

async function load(ctx: Parameters<NonNullable<AstraTool<Input>["preview"]>>[0], input: Input): Promise<{ refuse: string } | { approval: ApprovalView }> {
  const approval: ApprovalView | null = await ctx.services.getApprovalForDecision(ctx.orgId, ctx.role, input.approvalId);
  if (!approval) return { refuse: "No approval with that id in this organization." };
  if (approval.status !== "pending") return { refuse: `That approval is already ${approval.status}. Nothing to decide.` };
  if (!DECIDABLE.has(approval.objectType)) return { refuse: "That kind of approval is decided on the Approvals page (/approvals), not in the conversation." };
  if (!approval.canDecide.allowed) {
    return { refuse: `The ${ctx.role} role can't decide this approval${approval.requiredReviewerRole ? `: it is routed to the ${approval.requiredReviewerRole} role` : " (it needs approve_changes)"}.` };
  }
  return { approval };
}

export const decideApprovalTool: AstraTool<Input> = {
  name: "decide_approval",
  description:
    "Approve or reject a pending approval: an outcome review (so its team can be built) or a team run waiting at an approval gate. The user confirms the decision first. Other kinds of approval are decided on the Approvals page.",
  input: z.object({
    approvalId: z.string().min(1).describe("The approval's id."),
    decision: z.enum(["approve", "reject"]).describe("approve or reject."),
    note: z.string().max(1000).optional().describe("A reason, recorded with the decision."),
  }),
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) return loaded;
    const a = loaded.approval;
    const verb = input.decision === "approve" ? "Approve" : "Reject";
    return {
      summary: `${verb} ${label(a)}`,
      details: [
        effect(a, input.decision),
        ...(a.requestedBy ? [`Requested by ${a.requestedBy}${a.createdAt ? ` on ${a.createdAt.slice(0, 10)}` : ""}.`] : []),
        ...(a.description ? [a.description.length > 300 ? `${a.description.slice(0, 300)}…` : a.description] : []),
        ...(input.note ? [`Your note: ${input.note}`] : []),
        "Recorded in the audit trail, the same as deciding it on the Approvals page.",
      ],
      frozen: { approvalId: a.id, objectType: a.objectType },
    };
  },
  run: async (ctx, input) => {
    const loaded = await load(ctx, input);
    if ("refuse" in loaded) throw new Error(loaded.refuse);
    const decidedBy = (await ctx.services.getUserDisplayName(ctx.userId)) ?? ctx.role;
    const decision = input.decision === "approve" ? "approved" : "rejected";
    const result = await ctx.services.decideApprovalAs(ctx.orgId, ctx.role, ctx.userId, decidedBy, input.approvalId, decision, input.note);
    const a = loaded.approval;
    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: `${decision === "approved" ? "Approved" : "Rejected"} as ${ctx.role}${a.requiredReviewerRole ? ` (routed to ${a.requiredReviewerRole})` : " (approve_changes)"} · audit recorded`,
      },
    };
    return {
      payload: {
        decided: true,
        approvalId: a.id,
        decision,
        kind: a.objectType === "outcome_contract" ? "outcome_review" : "approval_gate",
        ...(result.outcomeStatus ? { outcome: { id: a.outcome?.id, name: a.outcome?.name, status: result.outcomeStatus } } : {}),
      },
      ...(a.outcome ? { artifact: { kind: "outcome", title: a.outcome.name, props: { outcome: { ...a.outcome, status: result.outcomeStatus ?? a.outcome.status } }, fullViewHref: `/outcomes/${a.outcome.id}` } } : {}),
      proof,
    };
  },
};
