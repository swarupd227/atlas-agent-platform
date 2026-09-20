/**
 * Eval Studio — one page: which agents are evaluated, how they are doing, and
 * what failed.
 *
 * The hub used to be four KPI tiles over three columns of cards, with the
 * specialist tools (synthesizer, simulator, regression, monitor, red team,
 * annotation, reports, prompts, marketplace) as equal-weight tiles. Those are
 * tools, not the daily view: the daily view is an agent, its last run and the
 * cases that failed. The tools are links in the header.
 *
 * Truthfulness: every figure is counted from real runs. An agent with no run
 * says so rather than showing a zero that reads like a score.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FlaskConical, Search, ArrowUpRight, Inbox, AlertTriangle, ChevronDown,
  ShieldCheck, ShieldAlert, CircleSlash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QueryBoundary } from "@/components/ui-vocab";
import { formatDateTime } from "@/lib/format";
import type { Agent } from "@shared/schema";

interface EvalRun {
  id: string;
  agentId: string | null;
  datasetId?: string | null;
  status: string;
  passRate: number | null;
  /** An Eval Studio run counts goldens, not "cases". */
  totalGoldens?: number | null;
  passedCount?: number | null;
  failedCount?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  costUsd?: number | null;
  /** The worker writes the gate verdict here: gate:pass, gate:warn or gate:fail. */
  tags?: string[] | null;
  isBaseline?: boolean | null;
  triggeredBy?: string | null;
}

interface EvalGate {
  agentId: string;
  isActive?: boolean | null;
  attachedMetricIds?: string[] | null;
  thresholdOverrides?: Record<string, number> | null;
  regressionWindowPct?: number | null;
}

/** The verdict the worker recorded on the run (evaluateGateTag in server/worker.ts). */
export function gateVerdict(run: EvalRun | undefined): "pass" | "warn" | "fail" | null {
  const tag = (run?.tags ?? []).find((t) => t.startsWith("gate:"));
  return tag === "gate:pass" ? "pass" : tag === "gate:warn" ? "warn" : tag === "gate:fail" ? "fail" : null;
}

/** The pass rate a gate demands overall, when it sets one. */
export function gateThreshold(gate: EvalGate | undefined): number | null {
  const overrides = gate?.thresholdOverrides ?? null;
  return overrides && typeof overrides.passRate === "number" ? overrides.passRate : null;
}

interface EvalSummary {
  agentsUnderEval: number;
  sevenDayPassRate: number;
  openRegressions: number;
  productionAlerts: number;
  totalRuns: number;
  totalDatasets: number;
  totalMetrics: number;
  evalCostUsd: number;
}

const TOOLS: Array<{ href: string; label: string; hint: string }> = [
  { href: "/evals/datasets", label: "Datasets", hint: "The cases agents are tested on" },
  { href: "/evals/metrics", label: "Metrics", hint: "How an answer is scored" },
  { href: "/evals/regression", label: "Regression", hint: "Compare a run against the last one" },
  { href: "/evals/monitor", label: "Monitor", hint: "Sampled checks on live traffic" },
  { href: "/evals/synthesizer", label: "Synthesizer", hint: "Generate new test cases" },
  { href: "/evals/simulator", label: "Simulator", hint: "Play a scenario against an agent" },
  { href: "/evals/redteam", label: "Red team", hint: "Adversarial prompts" },
  { href: "/evals/annotate", label: "Annotate", hint: "Label answers by hand" },
  { href: "/evals/reports", label: "Reports", hint: "Shareable summaries" },
  { href: "/evals/prompts", label: "Prompts", hint: "Judge prompt library" },
  { href: "/evals/marketplace", label: "Marketplace", hint: "Published datasets and metrics" },
];

export const pct = (rate: number | null | undefined) => (rate == null ? "—" : `${Math.round(rate * 1000) / 10}%`);
export const rateTone = (rate: number | null | undefined) =>
  rate == null ? "" : rate >= 0.9 ? "text-emerald-600 dark:text-emerald-400" : rate >= 0.75 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

function Stat({ label, value, hint, tone, to }: { label: string; value: string; hint?: string; tone?: string; to?: string }) {
  const body = (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-[9rem]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
  return to ? (
    <Link href={to} className="group rounded-md hover:bg-muted/50 transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="relative">{body}<ArrowUpRight className="w-3 h-3 absolute right-2 top-3 opacity-0 group-hover:opacity-60" /></div>
    </Link>
  ) : <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{body}</div>;
}

/** Runs of one agent, newest first. */
export function runsOf(runs: EvalRun[], agentId: string): EvalRun[] {
  return runs
    .filter((r) => r.agentId === agentId)
    .sort((a, b) => new Date(b.startedAt ?? b.completedAt ?? 0).getTime() - new Date(a.startedAt ?? a.completedAt ?? 0).getTime());
}

export default function EvalStudioHome() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summaryQ = useQuery<EvalSummary>({ queryKey: ["/api/eval/summary"] });
  const runsQ = useQuery<EvalRun[]>({ queryKey: ["/api/eval/runs"] });
  const agentsQ = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const gatesQ = useQuery<EvalGate[]>({ queryKey: ["/api/eval/gates"] });

  const runs = runsQ.data ?? [];
  const agents = agentsQ.data ?? [];
  const gates = gatesQ.data ?? [];
  const summary = summaryQ.data;

  const gateOf = useMemo(() => new Map(gates.map((g) => [g.agentId, g])), [gates]);
  const evaluated = useMemo(() => {
    const ids = new Set(runs.map((r) => r.agentId).filter(Boolean) as string[]);
    for (const g of gates) ids.add(g.agentId);
    return agents.filter((a) => ids.has(a.id));
  }, [agents, runs, gates]);

  const lastRunAt = runs.reduce<string | null>((latest, r) => {
    const at = r.completedAt ?? r.startedAt ?? null;
    return at && (!latest || new Date(at) > new Date(latest)) ? at : latest;
  }, null);

  const filtered = evaluated
    .filter((a) => (query ? a.name.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) => {
      const ra = runsOf(runs, a.id)[0]?.passRate ?? 2; // agents with no run sort last
      const rb = runsOf(runs, b.id)[0]?.passRate ?? 2;
      return ra - rb;
    });

  const selected = evaluated.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-eval-studio">
      <div className="border-b">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Eval Studio</h1>
            <p className="text-sm text-muted-foreground">Which agents are tested, how they are doing, and what failed.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" asChild data-testid="link-all-runs"><Link href="/evals/runs">All runs</Link></Button>
            <Button variant="outline" size="sm" asChild data-testid="link-datasets"><Link href="/evals/datasets">Datasets</Link></Button>
            <Button variant="outline" size="sm" asChild data-testid="link-metrics"><Link href="/evals/metrics">Metrics</Link></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-more-tools">More tools <ChevronDown className="w-3.5 h-3.5 ml-1" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {TOOLS.map((t) => (
                  <DropdownMenuItem key={t.href} asChild>
                    <Link href={t.href} className="flex flex-col items-start gap-0.5" data-testid={`tool-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <span className="text-sm">{t.label}</span>
                      <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/evals/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x px-2 pb-1 overflow-x-auto">
          <Stat label="Agents tested" value={`${evaluated.length}`} hint={agents.length ? `of ${agents.length} agents` : undefined} />
          <Stat
            label="Pass rate, 7 days"
            value={summary ? `${summary.sevenDayPassRate}%` : "—"}
            tone={summary ? rateTone(summary.sevenDayPassRate / 100) : ""}
            hint={summary ? `${summary.totalRuns} run${summary.totalRuns === 1 ? "" : "s"} recorded` : undefined}
          />
          <Stat label="Open regressions" value={summary ? `${summary.openRegressions}` : "—"} tone={summary?.openRegressions ? "text-amber-600 dark:text-amber-400" : ""} hint="a run below its baseline" to="/evals/regression" />
          <Stat label="Production alerts" value={summary ? `${summary.productionAlerts}` : "—"} tone={summary?.productionAlerts ? "text-red-600 dark:text-red-400" : ""} hint="from sampled live checks" to="/evals/monitor" />
          <Stat label="Last run" value={lastRunAt ? formatDateTime(lastRunAt) : "never"} hint={summary ? `$${(summary.evalCostUsd ?? 0).toFixed(2)} spent on evals` : undefined} />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-80 border-r flex flex-col min-h-0 shrink-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents" className="h-8 pl-7 text-xs" data-testid="input-search-agents" />
            </div>
          </div>
          <QueryBoundary isLoading={runsQ.isLoading || agentsQ.isLoading} isError={runsQ.isError} error={runsQ.error as Error | null} onRetry={() => runsQ.refetch()}>
            <ScrollArea className="flex-1">
              <div className="flex flex-col divide-y">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
                    <Inbox className="w-8 h-8 opacity-25" />
                    <p className="text-xs text-muted-foreground text-center">{evaluated.length === 0 ? "No agent has been evaluated yet" : "No agent matches your search"}</p>
                  </div>
                ) : filtered.map((a) => {
                  const agentRuns = runsOf(runs, a.id);
                  const last = agentRuns[0];
                  const gate = gateOf.get(a.id);
                  const verdict = gateVerdict(last);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${selectedId === a.id ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                      data-testid={`agent-row-${a.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium truncate leading-tight">{a.name}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${rateTone(last?.passRate)}`}>{last ? pct(last.passRate) : "no run"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-muted-foreground">
                        <span>{agentRuns.length} run{agentRuns.length === 1 ? "" : "s"}</span>
                        {last?.failedCount ? <span className="text-red-600 dark:text-red-400">{last.failedCount} failed</span> : null}
                        {verdict === "fail" && <span className="text-red-600 dark:text-red-400">gate failed</span>}
                        {verdict === "warn" && <span className="text-amber-600 dark:text-amber-400">gate warning</span>}
                        {verdict === "pass" && <span className="text-emerald-600 dark:text-emerald-400">gate passed</span>}
                        {!verdict && gate?.isActive && <span>gate set</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </QueryBoundary>
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          {selected ? (
            <AgentEvalDetail agent={selected} runs={runsOf(runs, selected.id)} gate={gateOf.get(selected.id)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FlaskConical className="w-10 h-10 opacity-25" />
              <p className="text-sm">Select an agent to see how it is doing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentEvalDetail({ agent, runs, gate }: { agent: Agent; runs: EvalRun[]; gate?: EvalGate }) {
  const last = runs[0];
  const previous = runs.find((r, i) => i > 0 && r.passRate != null);
  const delta = last?.passRate != null && previous?.passRate != null ? (last.passRate - previous.passRate) * 100 : null;
  const verdict = gateVerdict(last);
  const threshold = gateThreshold(gate);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-3xl">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">{agent.name}</h2>
            <Link href={`/agents/${agent.id}`} className="text-xs underline underline-offset-2 text-muted-foreground" data-testid="link-agent">Open agent</Link>
          </div>
          {agent.description && <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>}
        </div>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Last run</h3>
          {!last ? (
            <p className="text-sm text-muted-foreground">This agent has never been evaluated.</p>
          ) : (
            <div className="rounded border p-3 flex flex-col gap-2">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className={`text-2xl font-semibold tabular-nums ${rateTone(last.passRate)}`}>{pct(last.passRate)}</span>
                <span className="text-sm text-muted-foreground">
                  {last.passedCount ?? 0} of {last.totalGoldens ?? 0} cases passed
                  {delta != null && <> · {delta >= 0 ? "+" : ""}{Math.round(delta * 10) / 10} points since the run before</>}
                </span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {[last.status, last.completedAt ? formatDateTime(last.completedAt) : last.startedAt ? formatDateTime(last.startedAt) : null, last.costUsd != null ? `$${last.costUsd.toFixed(4)}` : null].filter(Boolean).join(" · ")}
              </div>
              {Array.isArray(last.tags) && last.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">{last.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild data-testid="link-run-detail"><Link href={`/evals/runs/${last.id}`}>Open run</Link></Button>
                {(last.failedCount ?? 0) > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild data-testid="link-failures"><Link href={`/evals/runs/${last.id}?passFail=fail`}>See the {last.failedCount} failures</Link></Button>
                )}
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Gate</h3>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-start gap-2">
              {!gate ? (
                <><CircleSlash className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">No gate for this agent, so an eval result never blocks its promotion.</span></>
              ) : verdict === "fail" ? (
                <><ShieldAlert className="w-3.5 h-3.5 mt-0.5 text-red-500 shrink-0" /><span>The last run failed the gate, so promotion is blocked until a run passes.</span></>
              ) : verdict === "warn" ? (
                <><ShieldAlert className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" /><span>The last run is under the gate's target but above the warning line.</span></>
              ) : verdict === "pass" ? (
                <><ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" /><span>The last run passed the gate.</span></>
              ) : (
                <><CircleSlash className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">A gate is set, but the last run recorded no verdict — it predates the gate or did not finish.</span></>
              )}
            </div>
            {gate && (
              <div className="font-mono text-[11px] text-muted-foreground">
                {[
                  `needs ${Math.round((threshold ?? 0.85) * 100)}% overall`,
                  gate.attachedMetricIds?.length ? `${gate.attachedMetricIds.length} metric${gate.attachedMetricIds.length === 1 ? "" : "s"} enforced` : null,
                  gate.regressionWindowPct != null ? `regression window ${gate.regressionWindowPct}%` : null,
                  gate.isActive === false ? "currently switched off" : null,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">History</h3>
          {runs.length <= 1 ? (
            <p className="text-sm text-muted-foreground">{runs.length === 0 ? "Nothing to show yet." : "Only one run so far, so there is no trend."}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {runs.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-2.5 text-sm" data-testid={`run-${r.id}`}>
                  <span className={`w-14 shrink-0 tabular-nums ${rateTone(r.passRate)}`}>{pct(r.passRate)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {[r.status, r.completedAt ? formatDateTime(r.completedAt) : r.startedAt ? formatDateTime(r.startedAt) : "not started"].filter(Boolean).join(" · ")}
                  </span>
                  {(r.failedCount ?? 0) > 0 && <span className="shrink-0 text-[11px] text-red-600 dark:text-red-400">{r.failedCount} failed</span>}
                  <Link href={`/evals/runs/${r.id}`} className="shrink-0 text-[11px] underline underline-offset-2">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(last?.failedCount ?? 0) > 0 && (
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            A failure means the judge scored the answer below the metric's threshold. Open the run to read the judge's reasoning for each case.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
