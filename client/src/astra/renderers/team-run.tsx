import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowUpRight, ExternalLink, Hand, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { openRunStepHtml } from "@/lib/agent-output";
import { getJson } from "../api";
import { Label, StatusDot, human } from "./parts";
import { gatePrompt } from "../decide-prompt";

const LIVE = new Set(["pending", "running", "waiting_approval"]);

/**
 * A team run beside the conversation. While the run is live it refreshes itself,
 * so the plan fills in step by step: waiting, running, done, and a pause for a
 * person at an approval step. A step that built a web page or email opens as a page.
 */
export function TeamRun({ props, onAsk, onDecide, activeActionId }: {
  props: Record<string, any>;
  onAsk?: (text: string) => void;
  onDecide?: (actionId: string, decision: "confirm" | "cancel") => void;
  activeActionId?: string | null;
}) {
  const initial = props.run ?? {};
  const { data } = useQuery<any>({
    queryKey: ["/api/astra/team-runs", initial.id],
    queryFn: () => getJson(`/api/astra/team-runs/${encodeURIComponent(initial.id)}`),
    enabled: !!initial.id,
    initialData: initial,
    // A result from an earlier turn may be stale; check once on open, then keep polling only while live.
    initialDataUpdatedAt: 0,
    refetchInterval: (q) => (LIVE.has(String((q.state.data as any)?.status)) ? 3000 : false),
  });
  const run = data ?? initial;
  const steps: any[] = run.steps ?? [];
  const live = LIVE.has(run.status);
  const done = steps.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-5 text-sm" data-testid="astra-team-run">
      <div className="flex items-center gap-2">
        {run.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden /> : <StatusDot status={run.status} />}
        <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="astra-team-run-status">
          {[human(run.status), run.totalWaves ? `stage ${Math.min(run.totalWaves, (run.currentWave ?? 0) + (run.status === "running" ? 1 : 0))} of ${run.totalWaves}` : null, typeof run.costUsd === "number" && run.costUsd > 0 ? `$${run.costUsd.toFixed(4)}` : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      {steps.length > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
        </div>
      )}

      {run.pending && (
        <div className="flex gap-2 rounded border border-primary/50 p-3" data-testid="astra-team-run-pending">
          <Hand className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Waiting for approval{run.pending.label ? `: ${run.pending.label}` : ""}</div>
            {run.pending.approvalId && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/*
                  Decide for real through the same pendingAction a message's own ConfirmCard uses
                  (onDecide -> thread.decide -> resolveAction), not onAsk: that path only posts a
                  freeform chat message asking Astra to approve, which can't resolve the gate by
                  itself -- decide_approval is itself confirm-gated, so a bare onAsk click could
                  only ever produce a second confirmation, never a decision. Fall back to onAsk
                  only if the caller hasn't wired a real action id (keeps this renderer usable
                  wherever else it might be mounted without that context).
                */}
                {onDecide && activeActionId ? (
                  <>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onDecide(activeActionId, "confirm")} data-testid="astra-team-run-approve">
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onDecide(activeActionId, "cancel")} data-testid="astra-team-run-reject">
                      Reject
                    </Button>
                  </>
                ) : onAsk && (
                  <>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onAsk(gatePrompt("approve", run.pending.approvalId, run.pending.label ?? null))} data-testid="astra-team-run-approve">
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAsk(gatePrompt("reject", run.pending.approvalId, run.pending.label ?? null))} data-testid="astra-team-run-reject">
                      Reject
                    </Button>
                  </>
                )}
                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                  <Link href={`~/approvals/${run.pending.approvalId}`} data-testid="astra-team-run-open-approval">
                    Full evidence <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {run.error && <p className="rounded border border-[hsl(var(--astra-fail)/0.4)] p-3 text-xs">{run.error}</p>}

      {steps.length > 0 && (
        <div>
          <Label>Steps</Label>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={`${s.nodeId ?? s.label}-${s.wave}-${s.revision ?? 0}-${i}`} className={`flex items-start gap-2 ${s.status === "waiting" ? "text-muted-foreground" : ""}`} data-testid="astra-team-run-step" data-status={s.status}>
                <span className="mt-1.5">
                  {s.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <StatusDot status={s.status === "skipped" ? "skipped" : s.status} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <span className="truncate">{s.label}{s.revision ? <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">· revision {s.revision}</span> : null}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{human(s.status)}</span>
                  </div>
                  {s.error && <div className="text-xs text-muted-foreground">{s.error}</div>}
                  {s.html && s.nodeId && (
                    <button type="button" onClick={() => openRunStepHtml(run.id, s.nodeId, s.wave, s.revision)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline" data-testid="astra-team-run-open-html">
                      <ExternalLink className="h-3 w-3" aria-hidden /> Open in browser
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {live && !run.pending && <p className="text-xs text-muted-foreground">Updates as the run goes.</p>}

      {run.answer && (
        <div>
          <Label>Answer</Label>
          <Markdown text={run.answer} className="astra-md" />
        </div>
      )}
    </div>
  );
}
