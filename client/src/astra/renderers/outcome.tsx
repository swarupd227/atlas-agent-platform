import { Link } from "wouter";
import { Label, StatusDot, human } from "./parts";

type Kpi = {
  name: string;
  unit?: string;
  target?: number;
  targetOperator?: string | null;
  baseline?: number | null;
  current?: { value: number | null; source: string; updatedAt?: string | null } | null;
};

const SOURCE: Record<string, string> = { agent_runs: "from agent runs · proxy", manual: "entered manually" };

function KpiRows({ kpis }: { kpis: Kpi[] }) {
  if (!kpis?.length) return <p className="text-sm text-muted-foreground">No KPIs yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1 pr-3 font-normal">KPI</th>
            <th className="py-1 pr-3 font-normal">Target</th>
            <th className="py-1 pr-3 font-normal">Baseline</th>
            <th className="py-1 font-normal">Current</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {kpis.map((k, i) => (
            <tr key={i} className="border-t border-border align-top">
              <td className="py-1.5 pr-3">{k.name}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {k.target != null ? `${k.targetOperator ?? ""} ${k.target} ${k.unit ?? ""}`.trim() : "—"}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{k.baseline != null ? k.baseline : <span className="italic text-muted-foreground">not given</span>}</td>
              <td className="py-1.5">
                {k.current ? (
                  <span>
                    {k.current.value ?? "—"}
                    <span className="block font-mono text-[10px] text-muted-foreground">{SOURCE[k.current.source] ?? k.current.source}</span>
                  </span>
                ) : (
                  <span className="italic text-muted-foreground">not measured</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OutcomeDraft({ props }: { props: Record<string, any> }) {
  const draft = props.draft ?? {};
  const g = props.grounding ?? {};
  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label>Draft · not created yet</Label>
        <p>{draft.description}</p>
        {draft.riskTier && <p className="mt-1 font-mono text-xs text-muted-foreground">risk {draft.riskTier}</p>}
      </div>

      {g.possibleDuplicates?.length > 0 && (
        <div className="rounded border border-[hsl(var(--astra-warn)/0.35)] bg-[hsl(var(--astra-warn)/0.08)] p-3">
          <Label>Similar outcomes already exist</Label>
          <ul className="space-y-1">
            {g.possibleDuplicates.map((o: any) => (
              <li key={o.id} className="flex items-center gap-2">
                <StatusDot status={o.status} />
                <Link href={`~/outcomes/${o.id}`} className="truncate underline-offset-2 hover:underline">{o.name}</Link>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{human(o.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.kpiNames?.length > 0 && (
        <div>
          <Label>KPIs drafted</Label>
          <ul className="list-disc pl-5">{draft.kpiNames.map((k: string) => <li key={k}>{k}</li>)}</ul>
        </div>
      )}

      <div>
        <Label>Industry</Label>
        {g.industry?.pack ? (
          <div className="space-y-2">
            <p>{g.industry.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.industry.regulatoryFrameworks.map((f: string) => (
                <span key={f} className="rounded border border-border px-1.5 py-0.5 text-xs">{f}</span>
              ))}
            </div>
            {g.industry.kpiDimensions?.length > 0 && (
              <p className="text-xs text-muted-foreground">KPI dimensions: {g.industry.kpiDimensions.map((k: any) => k.label).join(" · ")}</p>
            )}
          </div>
        ) : (
          <p className="italic text-muted-foreground">{g.industry?.selected ? "No industry pack for this industry" : "No industry selected"}</p>
        )}
      </div>

      {g.toolCoverage?.length > 0 && (
        <div>
          <Label>Systems the work needs</Label>
          <ul className="space-y-1">
            {g.toolCoverage.map((t: any) => (
              <li key={t.proposed} className="flex gap-2">
                <StatusDot status={t.status === "exists" ? "connected" : t.status === "partial" ? "pending" : "failed"} />
                <span className="min-w-0 flex-1">{t.proposed}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.matched ? `${t.status} · ${t.matched}` : "not on the platform"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.similarAgents?.some((r: any) => r.matches.length) && (
        <div>
          <Label>Agents you already have</Label>
          <ul className="space-y-1">
            {g.similarAgents.flatMap((r: any) => r.matches).slice(0, 8).map((a: any) => (
              <li key={a.id} className="flex items-center gap-2">
                <StatusDot status={a.status} />
                <Link href={`~/agents/${a.id}`} className="truncate hover:underline">{a.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Policies that apply</Label>
          {g.policies?.length ? <ul className="space-y-0.5">{g.policies.map((p: any) => <li key={p.id} className="truncate">{p.name}</li>)}</ul> : <p className="text-muted-foreground">None matched</p>}
        </div>
        <div>
          <Label>Composite risk</Label>
          <p className="font-medium">{g.compositeRisk?.level ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{g.compositeRisk?.rationale?.join("; ")}</p>
        </div>
      </div>
    </div>
  );
}

export function OutcomeCard({ props }: { props: Record<string, any> }) {
  const o = props.outcome ?? {};
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={o.status} />
        <span className="font-mono text-xs text-muted-foreground">
          {[human(o.status), o.riskTier && `risk ${o.riskTier}`, o.agentCount != null && `${o.agentCount} agents`].filter(Boolean).join(" · ")}
        </span>
      </div>
      {o.pendingReviewApprovalId && <p className="text-muted-foreground">Waiting for its outcome review.</p>}
      {o.description && <p className="text-muted-foreground">{o.description}</p>}
      {o.kpis && (
        <div>
          <Label>KPIs</Label>
          <KpiRows kpis={o.kpis} />
        </div>
      )}
    </div>
  );
}

export function OutcomeList({ props }: { props: Record<string, any> }) {
  const rows: any[] = props.outcomes ?? [];
  return (
    <div>
      <Label>
        {rows.length} of {props.total ?? rows.length}
      </Label>
      <ul className="divide-y divide-border">
        {rows.map((o) => (
          <li key={o.id} className="py-2.5 text-sm">
            <Link href={`~/outcomes/${o.id}`} className="group block">
              <div className="flex items-center gap-2">
                <StatusDot status={o.status} />
                <span className="truncate font-medium group-hover:underline">{o.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{human(o.status)}</span>
              </div>
              <div className="mt-0.5 pl-3.5 font-mono text-[11px] text-muted-foreground">
                {[o.riskTier && `risk ${o.riskTier}`, `${o.kpis?.length ?? 0} KPIs`, `${o.agentCount ?? 0} agents`].filter(Boolean).join(" · ")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
