/**
 * How a run's traces read when each golden was answered more than once.
 *
 * A run that asked for N answers per golden stores N traces per golden. The run
 * page needs them as one row per golden ("3 of 5 passed"), with the golden's own
 * verdict, and it needs the same single verdict when it compares two runs. The
 * verdict is the runner's: a golden passes only if every answer passed, and
 * mixed answers are flaky. The page and its tests share this so what the page
 * shows is what the runner scored.
 *
 * A run still in progress has goldens with some answers in. A golden whose
 * answers so far all agree is "pending" (its last answer could still split it);
 * one whose answers already disagree is flaky for certain, whatever remains.
 */
import { summarizeAttempts, type CaseStability } from "./eval-stability";

export interface TraceLike {
  id: string;
  goldenId: string;
  /** Which answer to the golden this is, from 1. Runs from before repeats have none. */
  attempt?: number | null;
  /** null while the answer is still being evaluated. */
  passFail?: boolean | null;
  scores?: unknown;
}

export type GoldenStatus = "pass" | "fail" | "flaky" | "pending";

export interface GoldenAttempts<T extends TraceLike> {
  goldenId: string;
  /** Every answer so far, in attempt order. */
  attempts: T[];
  /** Answers with a result. */
  finished: number;
  /** Answers the run asked for. */
  expected: number;
  stability: CaseStability;
  status: GoldenStatus;
}

export const isRepeatedRun = (run: { repeats?: number | null } | null | undefined): boolean => (run?.repeats ?? 1) > 1;

export interface RepeatedRunVerdict {
  label: "Inconsistent" | "Consistent";
  /** "warn" is amber. Never red or green: see repeatedRunVerdict. */
  tone: "warn" | "neutral";
}

/**
 * What a finished repeated run's badge says. An ordinary run is banded by its pass rate (85% and
 * up passes, 70% a warning, below that failed), but a repeated run's rate is strict (a golden
 * that misses one answer in three is a miss), so it is naturally lower, and the run sets no gate.
 * Calling it "Failed" would say something nobody decided. It measures consistency, so it says
 * that: inconsistent when any golden's answers disagreed, consistent when none did. Consistent is
 * neutral, not green, because a golden that fails every time is perfectly consistent and still
 * wrong, which the strict pass rate beside it says. A run that errored is not described here.
 */
export function repeatedRunVerdict(run: { flakyCount?: number | null }): RepeatedRunVerdict {
  return (run.flakyCount ?? 0) > 0
    ? { label: "Inconsistent", tone: "warn" }
    : { label: "Consistent", tone: "neutral" };
}

/** True when the run is a repeated run that finished, the only kind repeatedRunVerdict describes. */
export const hasRepeatedVerdict = (run: { status: string; repeats?: number | null } | null | undefined): boolean =>
  !!run && run.status === "completed" && isRepeatedRun(run);

/**
 * The run whose pass rate can be set beside `runs[0]`'s, for "points since the run before".
 * A repeated run's rate is strict (a golden must pass every answer), so it is not the same
 * measure as an ordinary run's: nothing is compared when the latest run is repeated, and a
 * repeated run is never the one compared against. `runs` is newest first.
 */
export function previousComparableRun<R extends { passRate?: number | null; repeats?: number | null }>(runs: R[]): R | undefined {
  const last = runs[0];
  if (!last || isRepeatedRun(last)) return undefined;
  return runs.find((r, i) => i > 0 && r.passRate != null && !isRepeatedRun(r));
}

/** Mean of a trace's numeric scores, or null when it has none. */
export function meanScore(scores: unknown): number | null {
  if (!scores || typeof scores !== "object") return null;
  const vals = Object.values(scores as Record<string, unknown>).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Groups traces by golden, keeping the order in which goldens first appear. */
export function groupTracesByGolden<T extends TraceLike>(traces: T[], expected: number): Array<GoldenAttempts<T>> {
  const want = Math.max(1, Math.floor(expected) || 1);
  const byGolden = new Map<string, Map<string, T>>();
  for (const t of traces) {
    const bucket = byGolden.get(t.goldenId) ?? new Map<string, T>();
    bucket.set(t.id, t); // a trace fetched twice (pages shift while a run writes) counts once
    byGolden.set(t.goldenId, bucket);
  }
  const rows: Array<GoldenAttempts<T>> = [];
  for (const [goldenId, bucket] of Array.from(byGolden.entries())) {
    const attempts = Array.from(bucket.values()).sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1) || a.id.localeCompare(b.id));
    const done = attempts.filter(a => typeof a.passFail === "boolean");
    const stability = summarizeAttempts(done.map(a => ({ passed: a.passFail === true })));
    let status: GoldenStatus;
    if (stability.outcome === "flaky") status = "flaky";
    else if (done.length === 0 || done.length < want) status = "pending";
    else status = stability.outcome === "stable_pass" ? "pass" : "fail";
    rows.push({ goldenId, attempts, finished: done.length, expected: want, stability, status });
  }
  return rows;
}

/** One verdict and one score per golden, for comparing two runs golden by golden. */
export function collapseByGolden<T extends TraceLike>(traces: T[], expected: number): Map<string, { passFail: boolean | null; avg: number | null }> {
  const out = new Map<string, { passFail: boolean | null; avg: number | null }>();
  for (const row of groupTracesByGolden(traces, expected)) {
    const scored = row.attempts.map(a => meanScore(a.scores)).filter((v): v is number => v !== null);
    out.set(row.goldenId, {
      passFail: row.status === "pass" ? true : row.status === "pending" ? null : false,
      avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    });
  }
  return out;
}

export type RowFilter = "all" | "pass" | "fail" | "flaky";

/** Failed means not passed, flaky ones included, as the run's own failed count is. */
export function filterGoldenRows<T extends TraceLike>(rows: Array<GoldenAttempts<T>>, filter: RowFilter): Array<GoldenAttempts<T>> {
  if (filter === "pass") return rows.filter(r => r.status === "pass");
  if (filter === "fail") return rows.filter(r => r.status === "fail" || r.status === "flaky");
  if (filter === "flaky") return rows.filter(r => r.status === "flaky");
  return rows;
}
