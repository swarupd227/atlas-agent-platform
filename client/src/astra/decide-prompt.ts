/**
 * The message a "Decide" button sends. It asks Astra to show the item with the
 * choices for its kind; the decision itself is then a confirmation card, so a
 * button never decides anything without the person seeing what it will do.
 */
export interface DecidableItem {
  source: string;
  sourceId: string;
  title: string;
}

export function decidePrompt(item: DecidableItem): string {
  switch (item.source) {
    case "recommendation":
      return `Show me the recommendation "${item.title}" (recommendation ${item.sourceId}) so I can accept or dismiss it.`;
    case "alert":
      return `Show me the alert "${item.title}" (alert ${item.sourceId}) so I can acknowledge it.`;
    case "governance":
      return `Show me the policy exception "${item.title}" (policy exception ${item.sourceId}) so I can approve or reject it.`;
    case "autonomy":
      return `Show me the tool request "${item.title}" (tool request ${item.sourceId}) so I can approve or decline it.`;
    default:
      return `Show me "${item.title}" (approval ${item.sourceId}) so I can approve or reject it.`;
  }
}

/** A team run's paused gate, decided from its card. */
export function gatePrompt(decision: "approve" | "reject", approvalId: string, label: string | null): string {
  const what = label ? `the "${label}" gate` : "the approval gate";
  return decision === "approve"
    ? `Approve ${what} (approval ${approvalId}) so the team run continues.`
    : `Reject ${what} (approval ${approvalId}). Ask me why first, and whether to open a follow-up task.`;
}
