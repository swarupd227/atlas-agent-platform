/**
 * Running one eval case more than once.
 *
 * The runners answer a case once and score it. With a repeat count they answer
 * it N times, a few at a time, and fold the attempts into the one result the
 * case has always had: the stability figures (shared/eval-stability.ts) decide
 * pass or fail, and the attempt that shows what went wrong is the one the
 * existing readers display. With one attempt this reduces to what the runners
 * did before, so a run that asks for no repeats is unchanged.
 */
import { summarizeAttempts, type CaseStability, type FieldDisagreement } from "@shared/eval-stability";

/** Attempts of one case in flight at once. */
export const ATTEMPT_CONCURRENCY = 3;

/**
 * The job type of a repeated run. A repeated run takes many times longer than a
 * request can wait (Azure cuts one that is silent for about 230 seconds), so the
 * route queues it for the job worker and the caller reads the run.
 */
export const EVAL_REPEAT_JOB = "eval_repeat_run";

/**
 * Runs `run` once per attempt, `concurrency` at a time, and returns the results
 * in attempt order. `run` must not throw: the caller turns an exception into a
 * failed attempt, so one bad attempt does not discard the others.
 */
export async function runAttempts<T>(repeats: number, run: (attempt: number) => Promise<T>, concurrency = ATTEMPT_CONCURRENCY): Promise<T[]> {
  const results = new Array<T>(repeats);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= repeats) return;
      results[i] = await run(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), repeats) }, worker));
  return results;
}

/** The labels that changed between attempts, in words: "severity (high x2, medium x1)". Empty when none did. */
export function describeUnstableFields(fields: FieldDisagreement[]): string {
  if (fields.length === 0) return "";
  return `values changed: ${fields.map(f => `${f.key} (${f.values.map(v => `${v.value} x${v.count}`).join(", ")})`).join("; ")}`;
}

export interface ScoredAttempt {
  passed: boolean;
  score: number;
}

/**
 * How long one answer took, on average across a case's attempts. Not the time
 * the case took on the wall clock: attempts run side by side, so that figure
 * grows with the repeat count and would read as a slowdown beside a run with
 * no repeats. With one attempt this is that attempt's own time.
 */
export function meanLatencyMs(attempts: Array<{ latencyMs: number }>): number {
  if (attempts.length === 0) return 0;
  return Math.round(attempts.reduce((s, a) => s + a.latencyMs, 0) / attempts.length);
}

/**
 * The attempts at one case as the case's single result. `representative` is
 * the first failing attempt, else the first, so a reader sees what went wrong
 * rather than a lucky pass; `representativeIndex` says which attempt that is,
 * because `score` is the mean across attempts and so describes a different
 * thing from the criteria and reasoning the representative carries.
 */
export function foldAttempts<T extends ScoredAttempt>(attempts: T[], opts: { keys?: string[]; verdict?: (a: T) => Record<string, unknown> | null } = {}): {
  representative: T;
  representativeIndex: number;
  score: number;
  stability: CaseStability;
} {
  if (attempts.length === 0) throw new Error("foldAttempts needs at least one attempt");
  const stability = summarizeAttempts(
    attempts.map(a => ({ passed: a.passed, score: a.score, verdict: opts.verdict ? opts.verdict(a) : undefined })),
    { keys: opts.keys },
  );
  const failing = attempts.findIndex(a => !a.passed);
  const representativeIndex = failing >= 0 ? failing : 0;
  return {
    representative: attempts[representativeIndex],
    representativeIndex,
    score: attempts.reduce((s, a) => s + a.score, 0) / attempts.length,
    stability,
  };
}

/**
 * What a reader needs to interpret a repeated case's row: the stored score is
 * the mean across attempts, and the criteria and reasoning beside it are those
 * of one named attempt (1-based). Empty for a case answered once.
 */
export function repeatedRowNotes(repeats: number, representativeIndex: number) {
  return repeats > 1 ? { scoreBasis: `mean across ${repeats} attempts`, representativeAttempt: representativeIndex + 1 } : {};
}
