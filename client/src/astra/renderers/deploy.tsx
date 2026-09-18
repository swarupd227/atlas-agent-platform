import { Label, StatusDot, human } from "./parts";

const ENV_LABEL: Record<string, string> = { staging: "Staging", pilot: "Pilot", prod: "Production" };

export function Deployments({ props }: { props: Record<string, any> }) {
  const rows: any[] = props.deployments ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No current deployments.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((d) => (
        <li key={d.id} className="py-2.5 text-sm">
          <div className="flex items-baseline gap-2">
            <StatusDot status={d.status} />
            <span className="min-w-0 flex-1 truncate">{d.agentName ?? d.agentId}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ENV_LABEL[d.environment] ?? d.environment}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 pl-3.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>{human(d.status)}</span>
            {d.canaryPercent > 0 && <span>canary {d.canaryPercent}%</span>}
            {d.shadowEnabled && <span>shadow on</span>}
            {d.version && <span>v{d.version}</span>}
            {d.pendingApproval && <span className="text-primary">{human(d.pendingApproval.type)} waiting</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AgentHealth({ props }: { props: Record<string, any> }) {
  if (!props.runs) return <p className="text-sm text-muted-foreground">No runs yet, so there's nothing to measure.</p>;
  return (
    <div className="space-y-3 text-sm">
      <Label>Last {props.runs} runs</Label>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">Success rate</dt>
        <dd className="text-lg font-semibold">{props.successRate == null ? "—" : `${Math.round(props.successRate * 1000) / 10}%`}</dd>
        <dt className="text-muted-foreground">Average latency</dt>
        <dd>{props.avgLatencyMs == null ? "—" : `${props.avgLatencyMs.toLocaleString()} ms`}</dd>
        <dt className="text-muted-foreground">Policy violations</dt>
        <dd className={props.policyViolations ? "text-[hsl(var(--astra-fail))]" : ""}>{props.policyViolations}</dd>
        <dt className="text-muted-foreground">Cost</dt>
        <dd>{props.costUsd == null ? "—" : `$${props.costUsd}`}</dd>
      </dl>
    </div>
  );
}
