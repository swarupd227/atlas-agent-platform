/**
 * Outcomes — one page: what the organization is trying to achieve, how far
 * each one got, and what is actually measured.
 *
 * Most outcomes never start: live, 55 of 67 are still waiting for a team or a
 * review. The old page led with attainment percentages and value figures that
 * made every one of them look under way, so this leads with where each stands
 * and what it is measured by.
 *
 * Truthfulness: a KPI's current value comes from matching its name against
 * run statistics (recomputeOutcomeKpis in server/routes/helpers.ts). That is
 * a proxy, and every KPI here says so or says it isn't measured. The old
 * page's "value generated", uptime and compliance lights, industry benchmarks
 * and the rule that counted a targetless KPI as fully attained are gone.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowUpRight, Inbox, Search, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/ui-vocab";
import { formatDateTime } from "@/lib/format";
import type { Agent, KpiDefinition, OutcomeContract } from "@shared/schema";

// ── Pure helpers (tests/outcomes-home.test.ts) ──────────────────────────────

export type Stage = "live" | "waiting_for_a_team" | "waiting_for_review" | "paused" | "done";

/** Where an outcome stands, in words rather than a status code. */
export function stageOf(status: string | null | undefined): Stage {
  switch (String(status)) {
    case "active":
    case "agents_assigned":
      return "live";
    case "pending_review":
      return "waiting_for_review";
    case "paused":
      return "paused";
    case "completed":
    case "certified":
      return "done";
    default:
      return "waiting_for_a_team";
  }
}

export const STAGE_LABEL: Record<Stage, string> = {
  live: "Live",
  waiting_for_a_team: "Waiting for a team",
  waiting_for_review: "Waiting for review",
  paused: "Paused",
  done: "Done",
};

/** What one KPI can honestly say about itself. */
export function kpiLine(kpi: Pick<KpiDefinition, "name" | "unit" | "target" | "currentValue" | "valueSource">): string {
  const unit = kpi.unit ? ` ${kpi.unit}` : "";
  const target = kpi.target ? `target ${kpi.target}${unit}` : "no target set";
  if (kpi.currentValue == null) return `${target} · not measured yet`;
  const source = kpi.valueSource === "agent_runs" ? " (from agent runs, a proxy)" : "";
  return `${kpi.currentValue}${unit} against ${target}${source}`;
}

export function outcomeCounts(outcomes: Array<Pick<OutcomeContract, "id" | "status">>, kpis: Array<Pick<KpiDefinition, "outcomeId" | "currentValue">>) {
  const measured = new Set(kpis.filter((k) => k.currentValue != null).map((k) => k.outcomeId));
  const by = (s: Stage) => outcomes.filter((o) => stageOf(o.status) === s).length;
  return {
    live: by("live"),
    waitingForTeam: by("waiting_for_a_team"),
    waitingForReview: by("waiting_for_review"),
    measured: outcomes.filter((o) => measured.has(o.id)).length,
  };
}

/** Live first, then the ones waiting on a person, then the rest; newest within each. */
export function outcomeOrder(a: OutcomeContract, b: OutcomeContract): number {
  const rank: Record<Stage, number> = { live: 0, waiting_for_review: 1, waiting_for_a_team: 2, paused: 3, done: 4 };
  return rank[stageOf(a.status)] - rank[stageOf(b.status)] || new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
}

const STAGE_CLS: Record<Stage, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  waiting_for_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  waiting_for_a_team: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
  done: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <div className="flex min-w-[9rem] flex-col gap-0.5 px-4 py-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

export default function OutcomesHome() {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("selected")));
  const select = (id: string) => {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?selected=${encodeURIComponent(id)}`);
    } catch {
      /* the panel still opens */
    }
  };

  const outcomesQ = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const kpisQ = useQuery<KpiDefinition[]>({ queryKey: ["/api/kpis"] });
  const agentsQ = useQuery<Agent[]>({ queryKey: ["/api/agents?summary=1"] });
  const outcomes = outcomesQ.data ?? [];
  const kpis = kpisQ.data ?? [];
  const counts = outcomeCounts(outcomes, kpis);

  const kpisByOutcome = useMemo(() => {
    const m = new Map<string, KpiDefinition[]>();
    for (const k of kpis) m.set(k.outcomeId, [...(m.get(k.outcomeId) ?? []), k]);
    return m;
  }, [kpis]);

  const rows = useMemo(
    () =>
      outcomes
        .filter((o) => (stage === "all" ? true : stageOf(o.status) === stage))
        .filter((o) => (query ? `${o.name} ${o.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true))
        .sort(outcomeOrder),
    [outcomes, stage, query],
  );
  const selected = outcomes.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-outcomes">
      <div className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-1 pt-5">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-4 w-4" /> Outcomes</h1>
            <p className="text-sm text-muted-foreground">What this organization is trying to achieve, how far each one got, and what is measured.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" asChild data-testid="link-discover"><Link href="/outcomes/discover">Describe a goal</Link></Button>
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/outcomes/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x overflow-x-auto px-2 pb-1">
          <Stat label="Live" value={counts.live} hint="with agents working" tone={counts.live ? "ok" : undefined} />
          <Stat label="Waiting for a team" value={counts.waitingForTeam} hint="no agents built yet" tone={counts.waitingForTeam ? "warn" : undefined} />
          <Stat label="Waiting for review" value={counts.waitingForReview} hint="a person must approve" tone={counts.waitingForReview ? "warn" : undefined} />
          <Stat label="With a measured KPI" value={counts.measured} hint={`of ${outcomes.length} outcomes`} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r">
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search outcomes" className="h-8 pl-7 text-xs" data-testid="input-search-outcomes" />
            </div>
            <Select value={stage} onValueChange={(v) => setStage(v as "all" | Stage)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any stage</SelectItem>
                {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <QueryBoundary isLoading={outcomesQ.isLoading} isError={outcomesQ.isError} error={outcomesQ.error as Error | null} onRetry={() => outcomesQ.refetch()}>
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="flex flex-col divide-y">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                    <Inbox className="h-8 w-8 opacity-25" />
                    <p className="text-center text-xs text-muted-foreground">{outcomes.length === 0 ? "No outcomes yet. Describe a goal and Astra will draft one." : "Nothing matches."}</p>
                  </div>
                ) : rows.map((o) => {
                  const s = stageOf(o.status);
                  const own = kpisByOutcome.get(o.id) ?? [];
                  const measured = own.filter((k) => k.currentValue != null).length;
                  return (
                    <button
                      key={o.id}
                      onClick={() => select(o.id)}
                      className={`flex w-full flex-col gap-1.5 p-3 text-left transition-colors hover:bg-muted/40 ${selectedId === o.id ? "border-l-2 border-l-primary bg-muted/60" : "border-l-2 border-l-transparent"}`}
                      data-testid={`outcome-row-${o.id}`}
                    >
                      <span className="truncate text-xs font-medium leading-tight">{o.name}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${STAGE_CLS[s]}`}>{STAGE_LABEL[s]}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{own.length === 0 ? "no KPIs" : `${measured}/${own.length} KPIs measured`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </QueryBoundary>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {selected ? (
            <OutcomePane outcome={selected} kpis={kpisByOutcome.get(selected.id) ?? []} agents={(agentsQ.data ?? []).filter((a) => a.outcomeId === selected.id)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Target className="h-10 w-10 opacity-25" />
              <p className="text-sm">Select an outcome to see what it's measured by and who works on it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** What to do next, from where the outcome actually stands. */
export function nextStep(stage: Stage, agentCount: number): string {
  if (stage === "waiting_for_review") return "Someone has to approve its review before a team can be built.";
  if (stage === "waiting_for_a_team") return "No team yet. Ask Astra to propose one, or open it to plan the agents.";
  if (stage === "paused") return "It's paused: its agents aren't working on it.";
  if (agentCount === 0) return "It's live but no agent is bound to it, so nothing is working on it.";
  return "";
}

function OutcomePane({ outcome, kpis, agents }: { outcome: OutcomeContract; kpis: KpiDefinition[]; agents: Agent[] }) {
  const stage = stageOf(outcome.status);
  const next = nextStep(stage, agents.length);

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-3xl flex-col gap-6 p-6" data-testid={`outcome-pane-${outcome.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{outcome.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[STAGE_LABEL[stage], outcome.riskTier ? `${String(outcome.riskTier).toLowerCase()} risk` : null, outcome.createdAt ? `created ${formatDateTime(outcome.createdAt)}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" asChild data-testid="open-outcome"><Link href={`/outcomes/${outcome.id}`}>Open<ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
        </div>

        {next && <p className="rounded border bg-muted/30 px-3 py-2 text-sm" data-testid="next-step">{next}</p>}
        {outcome.description && <p className="text-sm leading-relaxed text-muted-foreground">{outcome.description}</p>}

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">What it's measured by</h3>
          {kpis.length === 0 ? (
            <p className="text-sm text-muted-foreground">No KPI is attached, so nothing measures whether it works.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border" data-testid="kpi-list">
              {kpis.map((k) => (
                <li key={k.id} className="p-2.5 text-sm">
                  <div className="truncate font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground">{kpiLine(k)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Who works on it</h3>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent is bound to it.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">
                    {a.name}<ArrowUpRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Elsewhere</h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Everything about it", `/outcomes/${outcome.id}`],
              ["Approvals", "/approvals"],
              ["Governance", "/governance"],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{label}<ArrowUpRight className="h-3 w-3" /></Link>
            ))}
            {outcome.status === "pending_review" && <Badge variant="outline" className="text-[10px]">Its review is waiting on a decision</Badge>}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
