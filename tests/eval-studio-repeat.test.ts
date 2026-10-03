/**
 * Eval Studio answering each golden several times.
 *
 * The scheduling and the settling are tested here with the answering faked; the
 * worker wiring that uses them is pinned at the end. What matters:
 *   - one attempt per golden settles exactly as a run always did (the pass,
 *     the per-metric rates, the lastScore, the progress figures);
 *   - with repeats a golden passes only if EVERY attempt passed, and settles
 *     once its last attempt lands;
 *   - concurrency does not multiply with the repeat count;
 *   - a metric holds for a golden only if it held on every attempt that scored it;
 *   - an attempt that throws is a failed attempt, not a lost golden;
 *   - a repeated run never sets a gate tag, never regresses, and is never a baseline.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildAttemptTasks,
  settleGolden,
  runGoldenAttempts,
  type AttemptOutcome,
} from "../server/eval-studio-repeat";
import { pickRegressionBaseline } from "../server/eval-regression";

const ok = (overall = 0.9, extra: Record<string, number> = {}): AttemptOutcome => ({
  passed: true, scores: { overall, ...extra }, thresholds: { overall: 0.5, ...Object.fromEntries(Object.keys(extra).map(k => [k, 0.5])) },
});
const bad = (overall = 0.1, extra: Record<string, number> = {}): AttemptOutcome => ({
  passed: false, scores: { overall, ...extra }, thresholds: { overall: 0.5, ...Object.fromEntries(Object.keys(extra).map(k => [k, 0.5])) },
});
const golden = (n: number) => ({ id: `g${n}` });
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("buildAttemptTasks", () => {
  it("lists a golden's attempts together, numbered from 1", () => {
    const tasks = buildAttemptTasks([golden(1), golden(2)], 3);
    expect(tasks.map(t => `${t.golden.id}#${t.attempt}`)).toEqual(["g1#1", "g1#2", "g1#3", "g2#1", "g2#2", "g2#3"]);
  });

  it("is one task per golden for a run with no repeats", () => {
    expect(buildAttemptTasks([golden(1), golden(2)], 1).map(t => t.attempt)).toEqual([1, 1]);
  });
});

describe("settleGolden", () => {
  it("settles on the single attempt when there is one, as a run always did", () => {
    const pass = settleGolden([ok(0.8, { accuracy: 0.7 })]);
    expect(pass).toMatchObject({ passed: true, attempts: 1, meanOverall: 0.8, metricPasses: { overall: true, accuracy: true } });
    expect(pass.stability.outcome).toBe("stable_pass");
    const fail = settleGolden([bad(0.2, { accuracy: 0.3 })]);
    expect(fail).toMatchObject({ passed: false, meanOverall: 0.2, metricPasses: { overall: false, accuracy: false } });
  });

  it("passes a golden only if every attempt passed", () => {
    expect(settleGolden([ok(), ok(), ok()]).passed).toBe(true);
    const flaky = settleGolden([ok(), bad(), ok()]);
    expect(flaky.passed).toBe(false);
    expect(flaky.stability).toMatchObject({ outcome: "flaky", passedAttempts: 2, attempts: 3 });
    expect(flaky.stability.consistency).toBeCloseTo(2 / 3);
  });

  it("calls a golden that fails every time a failure, not flaky", () => {
    expect(settleGolden([bad(), bad()]).stability.outcome).toBe("stable_fail");
  });

  it("holds a metric for a golden only if it held on every attempt that scored it", () => {
    const s = settleGolden([ok(0.9, { tone: 0.8 }), ok(0.9, { tone: 0.4 }), ok(0.9, { tone: 0.9 })]);
    expect(s.metricPasses).toEqual({ overall: true, tone: false });
  });

  it("ignores an attempt that never scored a metric rather than failing the metric on it", () => {
    const s = settleGolden([ok(0.9, { tone: 0.8 }), { passed: false, scores: {}, thresholds: {} }]);
    expect(s.metricPasses.tone).toBe(true);
    expect(s.passed).toBe(false);
  });

  it("holds a metric with no recorded threshold to 0.5", () => {
    expect(settleGolden([{ passed: true, scores: { x: 0.5 }, thresholds: {} }]).metricPasses.x).toBe(true);
    expect(settleGolden([{ passed: true, scores: { x: 0.49 }, thresholds: {} }]).metricPasses.x).toBe(false);
  });

  it("averages the overall score across attempts, counting a missing one as 0", () => {
    expect(settleGolden([ok(0.9), ok(0.5)]).meanOverall).toBeCloseTo(0.7);
    expect(settleGolden([ok(0.8), { passed: false, scores: {}, thresholds: {} }]).meanOverall).toBeCloseTo(0.4);
  });

  it("reports no metrics when nothing was scored, so the caller can leave the golden alone", () => {
    expect(settleGolden([{ passed: false, scores: {}, thresholds: {} }]).metricPasses).toEqual({});
  });

  it("refuses to settle nothing", () => {
    expect(() => settleGolden([])).toThrow(/at least one attempt/);
  });
});

describe("runGoldenAttempts", () => {
  const collect = () => {
    const settled: Array<{ id: string; passed: boolean }> = [];
    const batches: Array<[number, number, number]> = [];
    return {
      settled, batches,
      onGolden: (g: { id: string }, s: { passed: boolean }) => { settled.push({ id: g.id, passed: s.passed }); },
      onBatch: (p: { tasksStarted: number; tasksTotal: number; goldensSettled: number }) => { batches.push([p.tasksStarted, p.tasksTotal, p.goldensSettled]); },
    };
  };

  it("runs a run with no repeats exactly as batches of goldens: same settling, same progress", async () => {
    const c = collect();
    await runGoldenAttempts({
      goldens: [1, 2, 3, 4, 5].map(golden), repeats: 1, concurrency: 2,
      runAttempt: async (g) => (g.id === "g3" ? bad() : ok()),
      onGolden: c.onGolden, onBatch: c.onBatch,
    });
    expect(c.settled).toEqual([
      { id: "g1", passed: true }, { id: "g2", passed: true }, { id: "g3", passed: false }, { id: "g4", passed: true }, { id: "g5", passed: true },
    ]);
    expect(c.batches).toEqual([[2, 5, 2], [4, 5, 4], [5, 5, 5]]);
  });

  it("settles a golden once its last attempt lands, and not before", async () => {
    const calls: string[] = [];
    const settledAt: Record<string, number> = {};
    await runGoldenAttempts({
      goldens: [golden(1), golden(2)], repeats: 3, concurrency: 2,
      runAttempt: async (g, attempt) => { calls.push(`${g.id}#${attempt}`); return ok(); },
      onGolden: (g) => { settledAt[g.id] = calls.length; },
    });
    expect(calls).toEqual(["g1#1", "g1#2", "g1#3", "g2#1", "g2#2", "g2#3"]);
    // g1's third attempt is the 3rd call, but it runs in the 2nd batch (calls 3-4).
    expect(settledAt.g1).toBe(4);
    expect(settledAt.g2).toBe(6);
  });

  it("fails a golden that is right some of the time", async () => {
    const answers: Record<string, AttemptOutcome[]> = { g1: [ok(), ok(), ok()], g2: [ok(), bad(), ok()] };
    const c = collect();
    await runGoldenAttempts({
      goldens: [golden(1), golden(2)], repeats: 3, concurrency: 4,
      runAttempt: async (g, attempt) => answers[g.id][attempt - 1],
      onGolden: c.onGolden,
    });
    expect(c.settled.find(s => s.id === "g1")?.passed).toBe(true);
    expect(c.settled.find(s => s.id === "g2")?.passed).toBe(false);
  });

  it("does not multiply the concurrency limit by the repeat count", async () => {
    let inFlight = 0, peak = 0;
    await runGoldenAttempts({
      goldens: [1, 2, 3, 4].map(golden), repeats: 5, concurrency: 3,
      runAttempt: async () => { inFlight++; peak = Math.max(peak, inFlight); await delay(3); inFlight--; return ok(); },
      onGolden: () => {},
    });
    expect(peak).toBe(3);
  });

  it("counts an attempt whose run throws as a failed attempt and carries on", async () => {
    const errors: string[] = [];
    const c = collect();
    await runGoldenAttempts({
      goldens: [golden(1), golden(2)], repeats: 2, concurrency: 2,
      runAttempt: async (g, attempt) => { if (g.id === "g1" && attempt === 2) throw new Error("trace store down"); return ok(); },
      onGolden: c.onGolden,
      onError: (g, attempt, reason) => { errors.push(`${g.id}#${attempt}: ${(reason as Error).message}`); },
    });
    expect(errors).toEqual(["g1#2: trace store down"]);
    expect(c.settled).toEqual([{ id: "g1", passed: false }, { id: "g2", passed: true }]);
  });

  it("settles a golden whose only attempt threw as failed, as a crashed golden always was", async () => {
    const c = collect();
    await runGoldenAttempts({
      goldens: [golden(1)], repeats: 1, concurrency: 5,
      runAttempt: async () => { throw new Error("boom"); },
      onGolden: c.onGolden,
    });
    expect(c.settled).toEqual([{ id: "g1", passed: false }]);
  });

  it("reports progress by attempts started, never past the total", async () => {
    const c = collect();
    await runGoldenAttempts({
      goldens: [golden(1), golden(2), golden(3)], repeats: 2, concurrency: 4,
      runAttempt: async () => ok(), onGolden: c.onGolden, onBatch: c.onBatch,
    });
    expect(c.batches).toEqual([[4, 6, 2], [6, 6, 3]]);
  });

  it("does nothing for a dataset with no goldens", async () => {
    const c = collect();
    await runGoldenAttempts({ goldens: [], repeats: 3, concurrency: 5, runAttempt: async () => ok(), onGolden: c.onGolden, onBatch: c.onBatch });
    expect(c.settled).toEqual([]);
    expect(c.batches).toEqual([]);
  });
});

describe("a repeated run and the regression baseline", () => {
  const run = (id: string, passRate: number, completedAt: string, repeats?: number) => ({ id, status: "completed", passRate, completedAt, repeats });

  it("never serves as the baseline, even when it is the most recent", () => {
    const runs = [run("single", 0.9, "2026-10-01T00:00:00Z"), run("repeated", 0.6, "2026-10-02T00:00:00Z", 5)];
    expect(pickRegressionBaseline(runs, "new")?.id).toBe("single");
  });

  it("finds no baseline when only repeated runs exist", () => {
    expect(pickRegressionBaseline([run("repeated", 0.6, "2026-10-02T00:00:00Z", 3)], "new")).toBeNull();
  });

  it("still takes a run recorded before repeats existed, or recorded as 1", () => {
    const runs = [run("old", 0.8, "2026-09-01T00:00:00Z", undefined), run("one", 0.85, "2026-09-02T00:00:00Z", 1)];
    expect(pickRegressionBaseline(runs, "new")?.id).toBe("one");
    expect(pickRegressionBaseline([{ id: "legacy", status: "completed", passRate: 0.7, repeats: null }], "new")?.id).toBe("legacy");
  });
});

describe("the worker", () => {
  const worker = readFileSync("server/worker.ts", "utf8");
  const start = worker.indexOf("async function processEvalTestRun");
  const body = worker.slice(start, worker.indexOf("export function startWorker", start));

  it("reads the count from the run row and treats anything but 1 to 10 as a run as it was", () => {
    expect(body).toContain("(run as { repeats?: number | null }).repeats ?? payload.repeats ?? 1");
    expect(body).toMatch(/asked >= 1 && asked <= 10 \? asked : 1/);
  });

  it("fails a run past the attempt limit before spending an attempt, whatever the route saw", () => {
    const cap = body.indexOf("goldens.length * repeats > MAX_STUDIO_ATTEMPTS");
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(body.indexOf("runGoldenAttempts({"));
    expect(body).toMatch(/status: "failed", completedAt: new Date\(\)/);
  });

  it("writes one trace per attempt, numbered", () => {
    expect(body).toMatch(/createEvalTrace\(\{\s*runId,\s*goldenId: golden\.id,\s*attempt,/);
  });

  it("keeps a repeated run out of the gate and the regression window", () => {
    expect(body).toContain("if (repeats === 1 && passRate !== null) {");
    expect(body).toContain("if (repeats === 1 && passRate !== null && regressionWindowPct > 0) {");
  });

  it("averages latency per answer, not per golden", () => {
    expect(body).toContain("totalLatencyMs / (goldens.length * repeats)");
  });

  it("records the flaky figures only for a repeated run", () => {
    expect(body).toContain("repeats > 1 ? summarizeRun(settledStability) : null");
    expect(body).toContain("...(repeated ? { flakyCount: repeated.flakyCases, consistency: repeated.consistency } : {})");
  });

  it("no longer answers goldens one by one outside the scheduler", () => {
    expect(body).not.toContain("processGolden");
    expect(body).not.toMatch(/while \(cursor < goldens\.length\)/);
  });
});
