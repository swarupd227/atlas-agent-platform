import { Hand } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Label, StatusDot, human } from "./parts";

export function TeamRun({ props }: { props: Record<string, any> }) {
  const run = props.run ?? {};
  const steps: any[] = run.steps ?? [];
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={run.status} />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {[human(run.status), run.totalWaves ? `stage ${run.currentWave} of ${run.totalWaves}` : null, typeof run.costUsd === "number" ? `$${run.costUsd.toFixed(4)}` : null].filter(Boolean).join(" · ")}
        </span>
      </div>

      {run.pending && (
        <div className="flex gap-2 rounded border border-primary/50 p-3">
          <Hand className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">Waiting for approval{run.pending.label ? `: ${run.pending.label}` : ""}</div>
            {run.pending.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-4">{run.pending.description}</p>}
          </div>
        </div>
      )}

      {run.error && <p className="rounded border border-[hsl(var(--astra-fail)/0.4)] p-3 text-xs">{run.error}</p>}

      {steps.length > 0 && (
        <div>
          <Label>Steps</Label>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5"><StatusDot status={s.status === "skipped" ? "skipped" : s.status} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <span className="truncate">{s.label}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{human(s.status)}</span>
                  </div>
                  {s.error && <div className="text-xs text-muted-foreground">{s.error}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {run.answer && (
        <div>
          <Label>Answer</Label>
          <Markdown text={run.answer} className="astra-md" />
        </div>
      )}
    </div>
  );
}
