import { Label, StatusDot, human } from "./parts";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);

function MetricBars({ metrics }: { metrics: Array<{ metric: string; passRate: number | null; total?: number; passed?: number }> }) {
  if (!metrics.length) return <p className="text-xs text-muted-foreground">No metric scores recorded yet.</p>;
  return (
    <ul className="space-y-2">
      {metrics.map((m) => (
        <li key={m.metric} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{human(m.metric)}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">{pct(m.passRate)}{m.total != null ? ` · ${m.passed}/${m.total}` : ""}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted" aria-hidden>
            <div className="h-full bg-primary" style={{ width: `${Math.round((m.passRate ?? 0) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EvalRun({ props }: { props: Record<string, any> }) {
  const run = props.run ?? {};
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-2">
        <StatusDot status={run.status} />
        <span>{human(run.status)}</span>
        {run.gate && <span className={`ml-auto font-mono text-[11px] uppercase ${run.gate === "gate:fail" ? "text-[hsl(var(--astra-fail))]" : "text-[hsl(var(--astra-ok))]"}`}>{run.gate}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">Pass rate</dt>
        <dd className="text-lg font-semibold">{pct(run.passRate)}</dd>
        <dt className="text-muted-foreground">Cases</dt>
        <dd>{run.passed} passed · {run.failed} failed of {run.totalGoldens}</dd>
        {props.dataset && (
          <>
            <dt className="text-muted-foreground">Dataset</dt>
            <dd className="truncate">{props.dataset.name}</dd>
          </>
        )}
      </dl>
      <div>
        <Label>By metric</Label>
        <MetricBars metrics={props.metrics ?? []} />
      </div>
    </div>
  );
}

export function EvalCompare({ props }: { props: Record<string, any> }) {
  const delta = props.passRateDeltaPct as number | null;
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-baseline gap-3 tabular-nums">
        <span className="text-lg font-semibold">{pct(props.run?.passRate)}</span>
        <span className="text-muted-foreground">vs {pct(props.baseline?.passRate)}</span>
        <span className={`ml-auto font-mono text-xs ${delta != null && delta < 0 ? "text-[hsl(var(--astra-fail))]" : "text-[hsl(var(--astra-ok))]"}`}>
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta} pp`}
        </span>
      </div>
      {props.regressed && <p className="text-xs text-[hsl(var(--astra-fail))]">A drop of more than {props.windowPct} points: this counts as a regression.</p>}
      {!props.sameDataset && <p className="text-xs text-muted-foreground">The two runs used different datasets, so the comparison is indicative only.</p>}
      <ul className="divide-y divide-border">
        {(props.metrics ?? []).map((m: any) => (
          <li key={m.metric} className="flex items-baseline gap-2 py-1.5 tabular-nums">
            <span className="min-w-0 flex-1 truncate">{human(m.metric)}</span>
            <span className="font-mono text-xs text-muted-foreground">{pct(m.baselinePassRate)} → {pct(m.passRate)}</span>
            <span className={`w-14 text-right font-mono text-xs ${m.deltaPct != null && m.deltaPct < 0 ? "text-[hsl(var(--astra-fail))]" : ""}`}>{m.deltaPct == null ? "—" : `${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvalFailures({ props }: { props: Record<string, any> }) {
  const cases: any[] = props.cases ?? [];
  if (!cases.length) return <p className="text-sm text-muted-foreground">No failed cases.</p>;
  return (
    <div className="space-y-4 text-sm">
      <Label>{cases.length} of {props.failedTotal} failed cases</Label>
      {cases.map((c) => (
        <div key={c.traceId} className="space-y-1.5 rounded border border-border p-3">
          {c.input && <p className="text-xs"><span className="text-muted-foreground">Input: </span>{c.input}</p>}
          {c.expectedOutput && <p className="text-xs"><span className="text-muted-foreground">Expected: </span>{c.expectedOutput}</p>}
          {c.agentFailed && <p className="text-xs text-[hsl(var(--astra-fail))]">The agent failed: {c.agentFailureReason ?? "no reason recorded"}</p>}
          {c.metrics.filter((m: any) => m.pass === false).map((m: any) => (
            <p key={m.metric} className="text-xs">
              <span className="font-mono text-[11px] text-[hsl(var(--astra-fail))]">{human(m.metric)} {m.score != null ? m.score.toFixed(2) : ""}</span>
              {m.reason && <span className="text-muted-foreground"> — {m.reason}</span>}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
