/**
 * Runs — what actually happened, not what the status word says.
 *
 * The measurement this exists for (2026-09-28, the 85 most recent team runs):
 * 536 of 1,501 steps never ran, 61 of 85 runs skipped at least one step, and
 * only 14 completed cleanly. The worst ran 4 of its 27 steps. Nearly all of
 * them were recorded `completed_with_skips` — a word that reads as success, on
 * runs where the step that binds the policy never executed.
 *
 * So this page never shows a status alone. Every run reads "Completed — 4 of 22
 * steps ran", and every skipped step carries WHY it was skipped, from the three
 * causes the engine now distinguishes: its predecessor never ran, its condition
 * was false, or its condition read a field nothing produces. Those need
 * different responses, and one sentence for all of them is how 536 skips went
 * unexamined.
 *
 * Built beside /monitor and /dag-runs/:id rather than replacing them.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Activity, AlertTriangle, CheckCircle2, Clock, PauseCircle, Search, Sparkles, ArrowUpRight, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueryBoundary } from "@/components/ui-vocab";
import { formatDateTime } from "@/lib/format";
import {
  durationWords, effortWords, isProblemCause, runHeadline, runTone,
  skipCauseAdvice, skipCauseLabel, type SkipCause,
} from "@shared/run-words";

interface RunSummary {
  id: string;
  team: { id: string | null; name: string };
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  steps: { total: number; ran: number; skipped: number; failed: number };
  costUsd: number | null;
  stuck: boolean;
  problemSkips: number;
  waitingOnApproval: boolean;
}

interface Overview {
  runs: RunSummary[];
  counts: {
    runs: number; cleanRuns: number; runsWithSkips: number; failed: number;
    running: number; stuck: number; waitingOnApproval: number;
    steps: number; stepsSkipped: number; costUsd: number;
  };
}

interface StepOutcome {
  nodeId: string;
  label: string;
  stateKey: string | null;
  status: string;
  cause: SkipCause | null;
  detail: string | null;
  durationMs: number | null;
  costUsd: number | null;
  toolCalls: number | null;
}

interface Explain {
  run: RunSummary;
  steps: StepOutcome[];
  byCause: Record<string, number>;
  planKnown: boolean;
}

type Facet = "all" | "attention" | "skipped" | "running";

const TONE_TEXT: Record<"good" | "warn" | "bad", string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-[10rem]" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** A run needs a person when it is stuck, failed, waiting, or skipped on a defect. */
function needsAttention(r: RunSummary): boolean {
  return r.stuck || r.status === "failed" || r.waitingOnApproval || r.problemSkips > 0;
}

export default function Runs() {
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<Facet>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const overviewQ = useQuery<Overview>({ queryKey: ["/api/runs/overview"] });
  const counts = overviewQ.data?.counts;
  const runs = overviewQ.data?.runs ?? [];

  const inFacet = useMemo(() => {
    const byFacet = (r: RunSummary) => {
      switch (facet) {
        case "attention": return needsAttention(r);
        case "skipped": return r.steps.skipped > 0;
        case "running": return r.status === "running" || r.waitingOnApproval;
        default: return true;
      }
    };
    const q = query.trim().toLowerCase();
    return runs
      .filter(byFacet)
      .filter((r) => (q ? r.team.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) : true))
      .sort((a, b) => rank(a) - rank(b) || String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));
  }, [runs, facet, query]);

  const selected = runs.find((r) => r.id === selectedId) ?? inFacet[0] ?? null;
  const explainQ = useQuery<Explain>({
    queryKey: [`/api/runs/${selected?.id}/explain`],
    enabled: !!selected?.id,
  });

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-runs">
      <div className="border-b">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><Activity className="w-4 h-4" /> Runs</h1>
            <p className="text-sm text-muted-foreground">What actually happened, not what the status says.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild data-testid="link-classic-monitor">
              <Link href="/monitor">Monitor<ArrowUpRight className="w-3 h-3 ml-1" /></Link>
            </Button>
            <Button size="sm" onClick={() => navigate(`/astra?ask=${encodeURIComponent("Which of our runs need attention, and why were steps skipped?")}`)} data-testid="button-ask-astra">
              <Sparkles className="w-3.5 h-3.5 mr-1" />Ask Astra
            </Button>
          </div>
        </div>

        <div className="flex items-stretch gap-1 px-2 pb-1 flex-wrap divide-x">
          <Stat
            label="Ran every step"
            value={counts ? `${counts.cleanRuns} of ${counts.runs}` : "—"}
            hint={counts ? `${counts.runsWithSkips} skipped at least one` : undefined}
            tone={counts && counts.cleanRuns < counts.runs / 2 ? TONE_TEXT.warn : undefined}
          />
          <Stat
            label="Steps that never ran"
            value={counts ? `${counts.stepsSkipped} of ${counts.steps}` : "—"}
            hint="across these runs"
            tone={counts && counts.stepsSkipped > 0 ? TONE_TEXT.warn : undefined}
          />
          <Stat label="Failed" value={counts ? String(counts.failed) : "—"} tone={counts && counts.failed > 0 ? TONE_TEXT.bad : undefined} />
          {!!counts?.stuck && <Stat label="Stuck" value={String(counts.stuck)} hint="running with no progress for an hour" tone={TONE_TEXT.bad} />}
          {!!counts?.waitingOnApproval && <Stat label="Waiting on a person" value={String(counts.waitingOnApproval)} tone={TONE_TEXT.warn} />}
          <Stat label="Spent" value={counts ? `$${counts.costUsd.toFixed(2)}` : "—"} hint="on these runs" />
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2 border-b flex-wrap">
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by team" className="pl-8 h-8" data-testid="input-search-runs" />
        </div>
        {([
          ["attention", `Needs attention${counts ? ` · ${runs.filter(needsAttention).length}` : ""}`],
          ["skipped", `Skipped steps${counts ? ` · ${counts.runsWithSkips}` : ""}`],
          ["running", `In flight${counts ? ` · ${counts.running + counts.waitingOnApproval}` : ""}`],
          ["all", `All${counts ? ` · ${counts.runs}` : ""}`],
        ] as Array<[Facet, string]>).map(([id, label]) => (
          <Button key={id} size="sm" variant={facet === id ? "default" : "outline"} className="h-8" onClick={() => setFacet(id)} data-testid={`facet-${id}`}>
            {label}
          </Button>
        ))}
      </div>

      <QueryBoundary isLoading={overviewQ.isLoading} isError={overviewQ.isError} error={overviewQ.error} onRetry={() => overviewQ.refetch()}>
        <div className="flex-1 flex min-h-0">
          <ScrollArea className="flex-1 min-w-0">
            <div className="divide-y" data-testid="list-runs">
              {inFacet.map((r) => {
                const tone = runTone(r.status, r.steps.ran, r.steps.total);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left px-6 py-3 grid grid-cols-[2fr_1.6fr_1fr] gap-4 items-center hover:bg-muted/40 ${selected?.id === r.id ? "bg-muted/60" : ""}`}
                    data-testid={`row-run-${r.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.team.name}</span>
                        {r.stuck && <Badge variant="outline" className="text-[10px] border-red-500/40" data-testid={`badge-stuck-${r.id}`}><Clock className="w-2.5 h-2.5 mr-1" />Stuck</Badge>}
                        {r.waitingOnApproval && <Badge variant="outline" className="text-[10px]"><PauseCircle className="w-2.5 h-2.5 mr-1" />Waiting</Badge>}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">
                        {r.startedAt ? formatDateTime(r.startedAt) : "not started"} · {durationWords(r.durationMs)}
                      </div>
                    </div>
                    <div className={`text-sm ${TONE_TEXT[tone]}`}>{runHeadline(r.status, r.steps.ran, r.steps.total)}</div>
                    <div className="text-sm text-muted-foreground tabular-nums">
                      {r.problemSkips > 0 && <span className={TONE_TEXT.bad}>{r.problemSkips} to look at · </span>}
                      {effortWords(r.costUsd, r.steps.ran, r.steps.total).split(" for ")[0]}
                    </div>
                  </button>
                );
              })}
              {inFacet.length === 0 && <div className="px-6 py-8 text-sm text-muted-foreground">Nothing in this group.</div>}
            </div>
          </ScrollArea>

          {selected && (
            <div className="w-[30rem] shrink-0 border-l flex flex-col min-h-0" data-testid="detail-run">
              <ScrollArea className="flex-1">
                <div className="p-5 flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold">{selected.team.name}</h2>
                    <div className={`text-sm font-medium ${TONE_TEXT[runTone(selected.status, selected.steps.ran, selected.steps.total)]}`} data-testid="text-run-headline">
                      {runHeadline(selected.status, selected.steps.ran, selected.steps.total)}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {effortWords(selected.costUsd, selected.steps.ran, selected.steps.total)} · {durationWords(selected.durationMs)}
                    </div>
                  </div>

                  {selected.stuck && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm" data-testid="text-stuck">
                      <AlertTriangle className="w-4 h-4 inline mr-1 text-red-600 dark:text-red-400" />
                      No progress for over an hour. It is still marked running, so nothing has given up on it and nothing is watching it either.
                    </div>
                  )}

                  <QueryBoundary isLoading={explainQ.isLoading} isError={explainQ.isError} error={explainQ.error} onRetry={() => explainQ.refetch()}>
                    {explainQ.data && (
                      <>
                        {selected.steps.skipped > 0 && (
                          <div className="flex flex-col gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Why steps were skipped</span>
                            <div className="flex flex-col gap-1.5">
                              {Object.entries(explainQ.data.byCause).sort((a, b) => b[1] - a[1]).map(([cause, n]) => (
                                <div key={cause} className="rounded-md border p-2.5" data-testid={`cause-${cause}`}>
                                  <div className={`text-sm font-medium ${isProblemCause(cause as SkipCause) ? TONE_TEXT.bad : ""}`}>
                                    {n} · {skipCauseLabel(cause as SkipCause)}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{skipCauseAdvice(cause as SkipCause)}</p>
                                </div>
                              ))}
                            </div>
                            {!explainQ.data.planKnown && (
                              <p className="text-[11px] text-muted-foreground">
                                This team's graph could not be read, so each cause comes from what the run recorded rather than from the graph.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Every step</span>
                          <div className="flex flex-col divide-y rounded-md border">
                            {explainQ.data.steps.map((s) => (
                              <div key={s.nodeId} className="p-2.5 flex flex-col gap-0.5" data-testid={`step-${s.nodeId}`}>
                                <div className="flex items-center gap-2">
                                  {s.status === "skipped"
                                    ? <SkipForward className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                    : s.status === "completed"
                                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                      : <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />}
                                  <span className="text-sm truncate">{s.label}</span>
                                  <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">
                                    {s.status === "skipped" ? "skipped" : durationWords(s.durationMs)}
                                  </span>
                                </div>
                                {s.cause && (
                                  <div className={`text-xs ${isProblemCause(s.cause) ? TONE_TEXT.bad : "text-muted-foreground"}`}>
                                    {skipCauseLabel(s.cause)}
                                  </div>
                                )}
                                {s.detail && s.status !== "completed" && (
                                  <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </QueryBoundary>

                  <div className="flex flex-col gap-2 border-t pt-4">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/astra?ask=${encodeURIComponent(`Explain the run of ${selected.team.name} (${selected.id}): what ran, what was skipped and why?`)}`)} data-testid="button-ask-about-run">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />Ask Astra about this run
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/dag-runs/${selected.id}`}>Open the full run record<ArrowUpRight className="w-3 h-3 ml-1" /></Link>
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </QueryBoundary>
    </div>
  );
}

/** Stuck first, then failed, then waiting, then defect skips, then the rest. */
function rank(r: RunSummary): number {
  if (r.stuck) return 0;
  if (r.status === "failed") return 1;
  if (r.waitingOnApproval) return 2;
  if (r.problemSkips > 0) return 3;
  if (r.steps.skipped > 0) return 4;
  return 5;
}
