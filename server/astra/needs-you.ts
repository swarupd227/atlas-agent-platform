/**
 * Where an item that needs the user gets decided: right here in the
 * conversation, or on a classic page -- and, when it's elsewhere, why. Pure.
 *
 * Any pending approval is decided here by a role allowed to decide it: the
 * decision has the same effects as on the Approvals page (applyApprovalEffects).
 */

export interface DecisionRoute {
  canDecideHere: boolean;
  /** The role an approval is routed to, when it's routed. */
  requiredReviewerRole: string | null;
  /** Set when the item is decided on another page. */
  elsewhere: { href: string; page: string; reason: string } | null;
}

const CATEGORY_NOUN: Record<string, string> = {
  alert: "Alerts",
  recommendation: "Recommendations",
  autonomy_escalation: "Autonomy requests",
  governance: "Governance items",
};

export function decisionRoute(input: {
  source: string;
  category: string;
  sourceId: string;
  approval?: { status: string; objectType: string; requiredReviewerRole: string | null } | null;
  /** The caller's verdict from canDecideApproval for this approval. */
  allowed: { allowed: boolean; reason: string } | null;
}): DecisionRoute {
  const { approval } = input;
  const requiredReviewerRole = approval?.requiredReviewerRole ?? null;

  if (input.source !== "approval" || !approval) {
    const noun = CATEGORY_NOUN[input.category] ?? "These items";
    return { canDecideHere: false, requiredReviewerRole, elsewhere: { href: "/my-actions", page: "My Actions", reason: `${noun} are handled in My Actions.` } };
  }

  const href = `/approvals/${encodeURIComponent(input.sourceId)}`;
  if (approval.status !== "pending") {
    return { canDecideHere: false, requiredReviewerRole, elsewhere: { href, page: "Approvals", reason: `Already ${approval.status}.` } };
  }
  if (input.allowed && !input.allowed.allowed) {
    const reason = requiredReviewerRole
      ? `Routed to the ${requiredReviewerRole.replace(/_/g, " ")} role.`
      : "Your role can't decide approvals.";
    return { canDecideHere: false, requiredReviewerRole, elsewhere: { href, page: "Approvals", reason } };
  }
  return { canDecideHere: true, requiredReviewerRole, elsewhere: null };
}
