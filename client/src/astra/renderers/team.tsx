import { Link } from "wouter";
import { AlertTriangle, Hand } from "lucide-react";
import { Label, StatusDot, human } from "./parts";

export function TeamProposal({ props }: { props: Record<string, any> }) {
  const workers: any[] = props.workers ?? [];
  const issues = workers.reduce((n, w) => n + (w.issues?.length ?? 0), 0);
  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label>Proposal · not built yet</Label>
        {props.orchestrator?.description && <p>{props.orchestrator.description}</p>}
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {[props.pipeline?.pattern && human(props.pipeline.pattern), `${workers.length} steps`, issues ? `${issues} connector issues` : "connectors check out"].filter(Boolean).join(" · ")}
        </p>
        {props.outcome && (
          <p className="mt-1 text-xs text-muted-foreground">
            For <Link href={`~/outcomes/${props.outcome.id}`} className="underline-offset-2 hover:underline">{props.outcome.name}</Link> ({human(props.outcome.status)})
          </p>
        )}
      </div>

      <ol className="space-y-3">
        {workers.map((w, i) => (
          <li key={i} className="rounded border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="font-medium">{w.name}</span>
              {w.isHumanCheckpoint && (
                <span className="ml-auto inline-flex items-center gap-1 rounded border border-primary/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                  <Hand className="h-3 w-3" aria-hidden /> pauses for a person
                </span>
              )}
            </div>
            {w.description && <p className="mt-1 text-xs text-muted-foreground">{w.description}</p>}
            {(w.connectors?.length > 0 || w.tools?.length > 0) && (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {[w.connectors?.length ? `uses ${w.connectors.join(", ")}` : null, w.tools?.length ? `${w.tools.length} tools` : null].filter(Boolean).join(" · ")}
              </p>
            )}
            {w.issues?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {w.issues.map((issue: any, j: number) => (
                  <li key={j} className="flex gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--astra-warn))]" aria-hidden />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {w.estimatedImpact && (
              <p className="mt-1.5 text-xs italic text-muted-foreground">Planner's estimate, not measured: {w.estimatedImpact}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TeamCard({ props }: { props: Record<string, any> }) {
  const t = props.team ?? {};
  const workers: any[] = t.workers ?? [];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={t.status ?? "active"} />
        <span className="font-mono text-xs text-muted-foreground">{[`${workers.length} agents`, t.pattern && human(t.pattern), "not run yet"].filter(Boolean).join(" · ")}</span>
      </div>
      <div>
        <Label>Agents</Label>
        <ul className="space-y-1">
          {workers.map((w) => (
            <li key={w.id} className="flex items-center gap-2">
              <StatusDot status={w.status ?? "active"} />
              <Link href={`~/agents/${w.id}`} className="truncate hover:underline">{w.name}</Link>
            </li>
          ))}
        </ul>
      </div>
      {(t.unconnectedBindings?.length > 0 || t.unresolvedBindings?.length > 0) && (
        <div className="rounded border border-[hsl(var(--astra-warn)/0.35)] bg-[hsl(var(--astra-warn)/0.08)] p-3 text-xs">
          {t.unconnectedBindings?.length > 0 && <p>Not connected yet: {t.unconnectedBindings.join(", ")}</p>}
          {t.unresolvedBindings?.length > 0 && <p>Not found in this organization: {t.unresolvedBindings.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
