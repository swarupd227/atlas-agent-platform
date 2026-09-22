/**
 * Where an item that needs the user gets decided: right here in the
 * conversation, or on a classic page -- and, when it's elsewhere, why. Pure.
 *
 * Any pending approval is decided here by a role allowed to decide it: the
 * decision has the same effects as on the Approvals page (applyApprovalEffects).
 * Recommendations (accept or dismiss), alerts (acknowledge), policy exceptions
 * (approve or reject) and agents' tool requests (approve or decline) are
 * decided here too (server/action-decisions.ts), by a role allowed to.
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
  autonomy_escalation: "Tool requests",
  governance: "Policy exceptions",
};

export function decisionRoute(input: {
  source: string;
  category: string;
  sourceId: string;
  approval?: { status: string; objectType: string; requiredReviewerRole: string | null } | null;
  /** Whether the caller may decide it: canDecideApproval for an approval, the role's permission otherwise. */
  allowed: { allowed: boolean; reason: string } | null;
}): DecisionRoute {
  const { approval } = input;
  const requiredReviewerRole = approval?.requiredReviewerRole ?? null;

  if (input.source === "recommendation" || input.source === "alert" || input.source === "governance" || input.source === "autonomy") {
    if (input.allowed?.allowed) return { canDecideHere: true, requiredReviewerRole: null, elsewhere: null };
    const noun = CATEGORY_NOUN[input.category] ?? "These items";
    return {
      canDecideHere: false,
      requiredReviewerRole: null,
      elsewhere: { href: "/my-actions/classic", page: "My Actions", reason: `Your role can't decide ${noun.toLowerCase()}.` },
    };
  }

  if (input.source !== "approval" || !approval) {
    const noun = CATEGORY_NOUN[input.category] ?? "These items";
    return { canDecideHere: false, requiredReviewerRole, elsewhere: { href: "/my-actions/classic", page: "My Actions", reason: `${noun} are handled in My Actions.` } };
  }

  const href = `/approvals/${encodeURIComponent(input.sourceId)}`;
  if (approval.status !== "pending" && approval.status !== "changes_requested") {
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
