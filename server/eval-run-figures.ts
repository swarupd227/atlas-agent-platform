/**
 * The pass-rate figures Eval Studio shows and alerts on, over an agent's or an
 * organization's runs. A repeated run (each golden answered several times) has a
 * strict pass rate, since a golden passes only if every answer does, so it runs
 * lower than an ordinary run's and is not on the same scale: averaged in, it
 * drags a headline figure down, counts as a regression, and can raise a
 * production alert. These take ordinary runs only (see eval-run-scope). Pure.
 */
import { gradedRuns, type RunForScope } from "./eval-run-scope";

type Dated = Date | string | null | undefined;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FigureRun extends RunForScope {
  passRate: number | null;
  startedAt?: Dated;
  costUsd?: number | null;
}

/**
 * The Eval Studio home's headline figures. Pass rates are averaged, and regressions counted,
 * over ordinary runs only. What the runs cost still counts every completed run, since the
 * money was spent. With no ordinary run in the last 7 days the average falls back to all of them.
 */
export function evalSummaryFigures<R extends FigureRun>(runs: R[], now: number = Date.now()): {
  sevenDayPassRate: number;
  openRegressions: number;
  evalCostUsd: number;
} {
  const completed = runs.filter((r) => r.status === "completed");
  const graded = gradedRuns(completed);
  const since = now - 7 * DAY_MS;
  const recent = graded.filter((r) => r.startedAt && new Date(r.startedAt).getTime() >= since);
  const pool = recent.length > 0 ? recent : graded;
  const avg = pool.length > 0 ? pool.reduce((s, r) => s + (r.passRate || 0), 0) / pool.length : 0;
  const cost = completed.reduce((s, r) => s + (r.costUsd || 0), 0);
  return {
    sevenDayPassRate: Math.round(avg * 100),
    openRegressions: graded.filter((r) => (r.passRate || 0) < 0.7).length,
    evalCostUsd: Math.round(cost * 100) / 100,
  };
}

/**
 * What the pass-rate alert watches for one agent: the mean pass rate of its ordinary completed
 * runs in the last 24 hours, and of those in the 6 days before (the baseline; the 24h rate
 * itself when there are none). null when nothing finished in the last 24 hours.
 */
export function alertWindowRates<R extends FigureRun>(runs: R[], now: number = Date.now()): { windowRate: number; baselineRate: number } | null {
  const since24h = now - DAY_MS;
  const since7d = now - 7 * DAY_MS;
  const scored = gradedRuns(runs).filter((r) => r.startedAt && r.status === "completed" && r.passRate != null);
  const at = (r: R) => new Date(r.startedAt as string | Date).getTime();
  const windowRuns = scored.filter((r) => at(r) >= since24h);
  const baselineRuns = scored.filter((r) => at(r) >= since7d && at(r) < since24h);
  if (windowRuns.length === 0) return null;
  const mean = (rs: R[]) => rs.reduce((s, r) => s + (r.passRate ?? 0), 0) / rs.length;
  const windowRate = mean(windowRuns);
  return { windowRate, baselineRate: baselineRuns.length > 0 ? mean(baselineRuns) : windowRate };
}
