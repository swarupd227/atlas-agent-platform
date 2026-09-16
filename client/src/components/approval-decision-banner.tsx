import { Lock, Clock } from "lucide-react";
import type { Approval } from "@shared/schema";

/** An approval still needs a decision if it's pending, or if its SLA passed with no decision recorded (expired
 * isn't a dead end -- see ApprovalExpiredNote below). Approved/rejected are final; changes_requested is awaiting
 * the requester's resubmission, not a fresh decision from this reviewer, so it isn't included here either.
 * The one place both approval pages agree on what "still decidable" means. */
export function isDecidable(status: string) {
  return status === "pending" || status === "expired";
}

/**
 * A decided (or expired) approval's outcome, shown in place of the action bar once there is nothing left to
 * decide -- both approval pages render the same banner from the same fields (decidedBy/decidedAt are now always
 * server-derived, never a client-supplied string; see server/routes/governance.ts's PATCH /api/approvals/:id).
 * Renders nothing for a still-decidable approval (pending, changes_requested, expired).
 */
export function ApprovalDecisionBanner({ approval }: { approval: Approval }) {
  if (approval.status !== "approved" && approval.status !== "rejected") return null;

  const note = (approval.constraintsJson as any)?.requestedChanges || (approval.constraintsJson as any)?.notes;
  const verb = approval.status === "approved" ? "Approved" : "Rejected";
  const tone = approval.status === "approved"
    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
    : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300";

  return (
    <div className={`flex items-start gap-2.5 px-6 py-3 border-b ${tone}`} data-testid={`decision-banner-${approval.id}`}>
      <Lock className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-semibold">
          {verb} by {approval.decidedBy || "someone"}
          {approval.decidedAt && <span className="font-normal opacity-80"> · {new Date(approval.decidedAt).toLocaleString()}</span>}
        </span>
        {note && <span className="text-xs opacity-85 truncate">&ldquo;{String(note)}&rdquo;</span>}
        <span className="text-[11px] opacity-70">This decision is final — it can't be made again from here.</span>
      </div>
    </div>
  );
}

/** For an approval whose SLA passed with no decision recorded (see agent-runtime.ts's expiry job). It can still be
 * decided -- the action bar stays visible for it, unlike ApprovalDecisionBanner's locked states. */
export function ApprovalExpiredNote({ approval }: { approval: Approval }) {
  if (approval.status !== "expired") return null;
  return (
    <div className="flex items-start gap-2.5 px-6 py-3 border-b bg-muted/40 text-muted-foreground" data-testid={`expired-note-${approval.id}`}>
      <Clock className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-foreground">Review window closed</span>
        <span className="text-[11px]">No decision was recorded before the deadline. It still needs one — decide it below.</span>
      </div>
    </div>
  );
}
