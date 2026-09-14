/**
 * Deciding an approval outside the Approvals page.
 *
 * The pieces PATCH /api/approvals/:id (server/routes/governance.ts) applies
 * for outcome reviews and team-run approval gates live here, and that route
 * calls them too, so both paths behave the same: who may decide, what an
 * outcome review decision does to the outcome, and resuming a team run that
 * was waiting on the decision. decideApproval is the whole decision for the
 * Astra Workspace.
 */
import { storage } from "./storage";
import { resumeTeamAgentDagRun } from "./dag-execution-engine";
import { canDecideApproval, type RoleId } from "./permissions";
import type { Approval } from "@shared/schema";

export type ApprovalDecision = "approved" | "rejected";

/** The approval kinds a conversation can decide today; everything else stays on the Approvals page. */
export const CONVERSATION_DECIDABLE_OBJECT_TYPES = ["outcome_contract", "pipeline_gate"] as const;

export class ApprovalDecisionError extends Error {
  constructor(message: string, readonly code: "not_found" | "not_pending" | "not_allowed" | "unsupported") {
    super(message);
    this.name = "ApprovalDecisionError";
  }
}

/** Who may decide this approval: its routed reviewer role (or admin), otherwise approve_changes. */
export function whoMayDecide(role: RoleId, approval: Pick<Approval, "requiredReviewerRole">) {
  return canDecideApproval(role, approval.requiredReviewerRole);
}

/**
 * An outcome review decision moves the outcome out of pending review:
 * approved → awaiting its agent plan, rejected → back to draft.
 * Returns the outcome's new status, or null when nothing changed.
 */
export async function applyOutcomeReviewDecision(
  approval: Pick<Approval, "objectType" | "objectId">,
  status: string | undefined,
  orgId: string | undefined,
): Promise<string | null> {
  if (approval.objectType !== "outcome_contract" || !approval.objectId) return null;
  if (status !== "approved" && status !== "rejected") return null;
  const outcome = await storage.getOutcome(approval.objectId, orgId);
  if (!outcome || outcome.status !== "pending_review") return null;
  const next = status === "approved" ? "awaiting_agent_plan" : "draft";
  await storage.updateOutcome(approval.objectId, { status: next }, orgId);
  return next;
}

/**
 * A team run waiting on this approval resumes right away, instead of on the
 * waiter's next poll. Finds the run by its pending approval id. Fire and forget.
 */
export function resumeTeamRunWaitingOn(approvalId: string): void {
  storage.listDagExecutionRunsByStatus("waiting_approval")
    .then(runs => {
      const match = runs.find(r => r.pendingApprovalId === approvalId);
      if (match) resumeTeamAgentDagRun(match.id).catch(err => console.error(`[dag-resume] fast-path resume of ${match.id} failed:`, err.message));
    })
    .catch(() => {});
}

export interface DecideApprovalInput {
  orgId: string;
  role: RoleId;
  /** Signed-in user id, for the audit record. */
  userId: string | null;
  /** How the decider is shown on the approval. */
  decidedBy: string;
  approvalId: string;
  decision: ApprovalDecision;
  note?: string;
  /** Where the decision was made, recorded in the audit details. */
  via: string;
}

export async function decideApproval(input: DecideApprovalInput) {
  const approval = await storage.getApproval(input.approvalId, input.orgId);
  if (!approval) throw new ApprovalDecisionError("No approval with that id in this organization.", "not_found");
  if (approval.status !== "pending") {
    throw new ApprovalDecisionError(`This approval was already ${approval.status}${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`, "not_pending");
  }
  if (!(CONVERSATION_DECIDABLE_OBJECT_TYPES as readonly string[]).includes(approval.objectType)) {
    throw new ApprovalDecisionError("This kind of approval is decided on the Approvals page.", "unsupported");
  }
  const allowed = whoMayDecide(input.role, approval);
  if (!allowed.allowed) {
    throw new ApprovalDecisionError(`The ${input.role} role can't decide this approval (${allowed.reason}).`, "not_allowed");
  }

  const updated = await storage.updateApproval(
    approval.id,
    { status: input.decision, decidedBy: input.decidedBy, decidedAt: new Date() },
    input.orgId,
  );

  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.userId ?? input.decidedBy,
    action: `approval_${input.decision}`,
    objectType: "approval",
    objectId: approval.id,
    details: `Approval "${approval.objectName || approval.type}" ${input.decision} by ${input.decidedBy} (via ${input.via})${input.note ? `: ${input.note}` : ""}`,
  });

  const outcomeStatus = await applyOutcomeReviewDecision(approval, input.decision, input.orgId);
  if (approval.objectType === "pipeline_gate") resumeTeamRunWaitingOn(approval.id);

  return { approval: updated ?? { ...approval, status: input.decision }, outcomeStatus };
}
