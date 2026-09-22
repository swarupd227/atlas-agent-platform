import { z } from "zod";
import { describeApprovalEffect } from "../../approval-decision";
import type { AstraTool, ConfirmPreview, ProofEnvelope } from "../types";

/**
 * Approve or reject any pending approval from the conversation. The routed
 * reviewer role (or approve_changes) decides; the confirmation card says what
 * the decision will do, and it has exactly the effect of deciding it on the
 * Approvals page (server/approval-decision.ts). A rejection can open a
 * follow-up task on the same object, as the Approvals page does.
 */

type Input = { approvalId: string; decision: "approve" | "reject"; note?: string; followUp?: string };

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

function effect(a: ApprovalView, decision: Input["decision"]): string {
  return describeApprovalEffect(a, decision, { outcomeName: a.outcome?.name });
}

function kindOf(a: ApprovalView): string {
  if (a.objectType === "outcome_contract") return "outcome review";
  if (a.objectType === "pipeline_gate") return "approval gate";
  return a.type.replace(/[-_]/g, " ");
}

function label(a: ApprovalView) {
  const name = a.objectType === "outcome_contract" ? a.outcome?.name ?? a.objectName : a.objectName;
  return `${kindOf(a)}: ${name ?? a.id}`;
}

async function load(ctx: Parameters<NonNullable<AstraTool<Input>["preview"]>>[0], input: Input): Promise<{ refuse: string } | { approval: ApprovalView }> {
  const approval: ApprovalView | null = await ctx.services.getApprovalForDecision(ctx.orgId, ctx.role, input.approvalId);
  if (!approval) return { refuse: "No approval with that id in this organization." };
  if (approval.status !== "pending" && approval.status !== "changes_requested") return { refuse: `That approval is already ${approval.status}. Nothing to decide.` };
  if (!approval.canDecide.allowed) {
    return { refuse: `The ${ctx.role} role can't decide this approval${approval.requiredReviewerRole ? `: it is routed to the ${approval.requiredReviewerRole} role` : " (it needs approve_changes)"}.` };
  }
  return { approval };
}

export const decideApprovalTool: AstraTool<Input> = {
  name: "decide_approval",
  description:
    "Approve or reject any pending approval: an outcome review (so its team can be built), a team run waiting at an approval gate, a tool call an agent asked permission for, a deployment, a patch, an agent retirement, and others. The confirmation card says what the decision will do; the user confirms first. It has the same effect as deciding on the Approvals page.",
  input: z.object({
    approvalId: z.string().min(1).describe("The approval's id."),
    decision: z.enum(["approve", "reject"]).describe("approve or reject."),
    note: z.string().max(1000).optional().describe("A reason, recorded with the decision."),
    followUp: z.string().max(2000).optional().describe("Only when rejecting: what still has to be done. Opens a pending follow-up task on the same object."),
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
        ...(input.followUp && input.decision === "reject" ? [`Opens a follow-up task: ${input.followUp}`] : []),
        ...(input.followUp && input.decision === "approve" ? ["The follow-up is ignored: follow-ups are only opened on a rejection."] : []),
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
    const result = await ctx.services.decideApprovalAs(ctx.orgId, ctx.role, ctx.userId, decidedBy, input.approvalId, decision, input.note, decision === "rejected" ? input.followUp : undefined);
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
        kind: a.objectType === "outcome_contract" ? "outcome_review" : a.objectType === "pipeline_gate" ? "approval_gate" : a.type,
        effect: effect(a, input.decision),
        ...(result.followUpTaskId ? { followUpTaskId: result.followUpTaskId } : {}),
        ...(result.outcomeStatus ? { outcome: { id: a.outcome?.id, name: a.outcome?.name, status: result.outcomeStatus } } : {}),
      },
      ...(a.outcome ? { artifact: { kind: "outcome", title: a.outcome.name, props: { outcome: { ...a.outcome, status: result.outcomeStatus ?? a.outcome.status } }, fullViewHref: `/outcomes/${a.outcome.id}` } } : {}),
      proof,
    };
  },
};
