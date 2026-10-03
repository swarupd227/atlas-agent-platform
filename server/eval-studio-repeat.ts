/**
 * Answering each golden of an Eval Studio run more than once.
 *
 * The runner (processEvalTestRun in worker.ts) answered each golden once, in
 * batches. With a repeat count it answers each N times: every golden-and-attempt
 * pair is one task, tasks go through the same batches (so the concurrency limit
 * does not multiply), and a golden is settled once all its attempts are in. It
 * passes only if every attempt passed, so a golden that is right 3 times in 5 is
 * reported as inconsistent rather than as a pass. With one attempt a golden
 * settles on its single outcome, which is how a run has always worked.
 *
 * The scheduling and the settling live here, with the answering injected, so
 * they can be tested without the worker's many dependencies.
 */
import { summarizeAttempts, type CaseStability } from "@shared/eval-stability";

/** What one answer to a golden came to. */
export interface AttemptOutcome {
  /** Answered, and judged to pass. A failed agent run is a failed attempt. */
  passed: boolean;
  /** Metric name to score, including "overall". Empty when the attempt never got as far as scoring. */
  scores: Record<string, number>;
  /** The bar each scored metric had to reach. A metric without one is held to 0.5. */
  thresholds: Record<string, number>;
}

export interface SettledGolden {
  /** Passed every attempt. With one attempt, that attempt's own result. */
  passed: boolean;
  stability: CaseStability;
  /** Per metric: held on every attempt that scored it. */
  metricPasses: Record<string, boolean>;
  /** Mean "overall" score across attempts; an attempt without one counts as 0. */
  meanOverall: number;
  attempts: number;
}

export function buildAttemptTasks<G>(goldens: G[], repeats: number): Array<{ golden: G; attempt: number }> {
  const tasks: Array<{ golden: G; attempt: number }> = [];
  for (const golden of goldens) {
    for (let attempt = 1; attempt <= repeats; attempt++) tasks.push({ golden, attempt });
  }
  return tasks;
}

export function settleGolden(outcomes: AttemptOutcome[]): SettledGolden {
  if (outcomes.length === 0) throw new Error("settleGolden needs at least one attempt");
  const stability = summarizeAttempts(outcomes.map(o => ({ passed: o.passed })));
  const names: string[] = [];
  for (const o of outcomes) for (const name of Object.keys(o.scores)) if (!names.includes(name)) names.push(name);
  const metricPasses: Record<string, boolean> = {};
  for (const name of names) {
    const scored = outcomes.filter(o => typeof o.scores[name] === "number");
    if (scored.length === 0) continue;
    metricPasses[name] = scored.every(o => o.scores[name] >= (o.thresholds[name] ?? 0.5));
  }
  const overall = outcomes.map(o => o.scores["overall"] ?? 0);
  return {
    passed: stability.passed,
    stability,
    metricPasses,
    meanOverall: overall.reduce((s, x) => s + x, 0) / overall.length,
    attempts: outcomes.length,
  };
}

export interface BatchProgress {
  /** Tasks started so far, counting the batch just finished. */
  tasksStarted: number;
  tasksTotal: number;
  goldensSettled: number;
}

/**
 * Runs every golden-and-attempt pair, `concurrency` at a time, and settles each
 * golden when its last attempt lands. An attempt whose run throws is a failed
 * attempt, so one bad call does not lose the golden or the run.
 */
export async function runGoldenAttempts<G extends { id: string }>(opts: {
  goldens: G[];
  repeats: number;
  concurrency: number;
  runAttempt: (golden: G, attempt: number) => Promise<AttemptOutcome>;
  onGolden: (golden: G, settled: SettledGolden) => Promise<void> | void;
  onBatch?: (progress: BatchProgress) => Promise<void> | void;
  onError?: (golden: G, attempt: number, reason: unknown) => void;
}): Promise<void> {
  const tasks = buildAttemptTasks(opts.goldens, opts.repeats);
  const pending = new Map<string, AttemptOutcome[]>();
  const width = Math.max(1, opts.concurrency);
  let cursor = 0;
  let settledGoldens = 0;

  while (cursor < tasks.length) {
    const batch = tasks.slice(cursor, cursor + width);
    const results = await Promise.allSettled(batch.map(t => opts.runAttempt(t.golden, t.attempt)));
    for (let i = 0; i < results.length; i++) {
      const { golden, attempt } = batch[i];
      const result = results[i];
      let outcome: AttemptOutcome;
      if (result.status === "fulfilled") {
        outcome = result.value;
      } else {
        opts.onError?.(golden, attempt, result.reason);
        outcome = { passed: false, scores: {}, thresholds: {} };
      }
      const list = pending.get(golden.id) ?? [];
      list.push(outcome);
      if (list.length < opts.repeats) {
        pending.set(golden.id, list);
        continue;
      }
      pending.delete(golden.id);
      await opts.onGolden(golden, settleGolden(list));
      settledGoldens++;
    }
    cursor += width;
    await opts.onBatch?.({ tasksStarted: Math.min(cursor, tasks.length), tasksTotal: tasks.length, goldensSettled: settledGoldens });
  }
}
