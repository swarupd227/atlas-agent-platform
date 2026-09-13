import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingAction } from "./types";

/**
 * A change waiting for the user. Confirm runs exactly what the card shows
 * (the server froze it when the turn paused); Not now changes nothing.
 */
export function ConfirmCard({
  action,
  active,
  busy,
  onDecide,
}: {
  action: PendingAction;
  /** Only the thread's current pending action can be decided. */
  active: boolean;
  busy: boolean;
  onDecide: (decision: "confirm" | "cancel") => void;
}) {
  const decided = action.decision;
  const eyebrow = action.kind === "agent_approval" ? "Approval needed" : "Confirm this change";

  return (
    <div
      className={`rounded-md border bg-card p-4 ${active && !decided ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]" : "border-border"}`}
      data-testid="astra-confirm-card"
    >
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{eyebrow}</div>
      <div className="font-medium [font-family:var(--astra-display)]">{action.summary}</div>

      {action.details && action.details.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {action.details.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span className="min-w-0 break-words">{d}</span>
            </li>
          ))}
        </ul>
      )}

      {action.warnings && action.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {action.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded border border-[hsl(var(--astra-warn)/0.35)] bg-[hsl(var(--astra-warn)/0.08)] p-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--astra-warn))]" aria-hidden />
              <div className="min-w-0">
                <div className="font-medium">{w.title}</div>
                <div className="break-words text-muted-foreground">{w.detail}</div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Confirming records that you saw these warnings.</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {decided ? (
          <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${decided === "confirmed" ? "text-[hsl(var(--astra-ok))]" : "text-muted-foreground"}`}>
            {decided === "confirmed" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {decided === "confirmed" ? "Confirmed" : "Not now"}
          </span>
        ) : active ? (
          <>
            <Button size="sm" onClick={() => onDecide("confirm")} disabled={busy} data-testid="astra-confirm">
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDecide("cancel")} disabled={busy} data-testid="astra-not-now">
              Not now
            </Button>
          </>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">No longer pending</span>
        )}
      </div>
    </div>
  );
}
