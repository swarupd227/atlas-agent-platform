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
import { summarizeAttempts, type CaseStability } from "@shared/eval-stability";

/** Attempts of one case in flight at once. */
export const ATTEMPT_CONCURRENCY = 3;

/**
 * Most attempts a run may ask for while it is still answered inside the request
 * that started it. Azure cuts a request that is silent for about 230 seconds,
 * and an attempt takes tens of seconds, so a larger repeated run needs to run in
 * the background, which is not built yet.
 */
export const SYNC_ATTEMPT_LIMIT = 15;

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

/** Why a repeated run of this size cannot be answered in one request, or null when it can. */
export function syncLimitError(caseCount: number, repeats: number): string | null {
  if (repeats <= 1) return null;
  const attempts = caseCount * repeats;
  if (attempts <= SYNC_ATTEMPT_LIMIT) return null;
  return `${attempts} attempts is more than one request can wait for (${SYNC_ATTEMPT_LIMIT}); a repeated run that large needs the background mode, which is not available yet`;
}

export interface ScoredAttempt {
  passed: boolean;
  score: number;
}

/**
 * The attempts at one case as the case's single result. `representative` is
 * the first failing attempt, else the first, so a reader sees what went wrong
 * rather than a lucky pass; `score` is the mean across attempts.
 */
export function foldAttempts<T extends ScoredAttempt>(attempts: T[], opts: { keys?: string[]; verdict?: (a: T) => Record<string, unknown> | null } = {}): {
  representative: T;
  score: number;
  stability: CaseStability;
} {
  const stability = summarizeAttempts(
    attempts.map(a => ({ passed: a.passed, score: a.score, verdict: opts.verdict ? opts.verdict(a) : undefined })),
    { keys: opts.keys },
  );
  return {
    representative: attempts.find(a => !a.passed) ?? attempts[0],
    score: attempts.reduce((s, a) => s + a.score, 0) / attempts.length,
    stability,
  };
}
