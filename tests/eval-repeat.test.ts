/**
 * Running one eval case more than once: the attempt runner and the fold.
 *
 *   - attempts come back in attempt order even when a later one finishes first;
 *   - no more than the concurrency limit are in flight at once;
 *   - one attempt reduces to the case's own result (so a run that asks for no
 *     repeats is unchanged);
 *   - the case a reader sees is the attempt that failed, not a lucky pass;
 *   - the job type a repeated run is queued under is the one the worker dispatches on.
 */
import { describe, it, expect } from "vitest";
import { runAttempts, foldAttempts, describeUnstableFields, meanLatencyMs, repeatedRowNotes, ATTEMPT_CONCURRENCY, EVAL_REPEAT_JOB } from "../server/eval-repeat";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("runAttempts", () => {
  it("returns results in attempt order even when a later attempt finishes first", async () => {
    const out = await runAttempts(3, async i => { await delay(i === 0 ? 30 : 1); return `a${i}`; });
    expect(out).toEqual(["a0", "a1", "a2"]);
  });

  it("never has more than the concurrency limit in flight", async () => {
    let inFlight = 0, peak = 0;
    await runAttempts(8, async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight--;
    }, 3);
    expect(peak).toBe(3);
  });

  it("uses the platform default when no limit is given", async () => {
    let inFlight = 0, peak = 0;
    await runAttempts(10, async () => { inFlight++; peak = Math.max(peak, inFlight); await delay(5); inFlight--; });
    expect(peak).toBe(ATTEMPT_CONCURRENCY);
  });

  it("runs a single attempt once, and passes the attempt index", async () => {
    const seen: number[] = [];
    const out = await runAttempts(1, async i => { seen.push(i); return "x"; });
    expect(out).toEqual(["x"]);
    expect(seen).toEqual([0]);
  });

  it("runs one at a time when the limit is 1", async () => {
    let inFlight = 0, peak = 0;
    await runAttempts(4, async () => { inFlight++; peak = Math.max(peak, inFlight); await delay(2); inFlight--; }, 1);
    expect(peak).toBe(1);
  });
});

describe("describeUnstableFields", () => {
  it("is empty when no label changed", () => {
    expect(describeUnstableFields([])).toBe("");
  });

  it("names each changed label with how often each value appeared", () => {
    const text = describeUnstableFields([
      { key: "severity", values: [{ value: "high", count: 3 }, { value: "medium", count: 1 }], agreement: 0.75 },
      { key: "action", values: [{ value: "notify_owner", count: 2 }, { value: "(missing)", count: 2 }], agreement: 0.5 },
    ]);
    expect(text).toBe("values changed: severity (high x3, medium x1); action (notify_owner x2, (missing) x2)");
  });
});

describe("foldAttempts", () => {
  const ok = (score = 1) => ({ passed: true, score, tag: "ok" });
  const bad = (score = 0, tag = "bad") => ({ passed: false, score, tag });

  it("reduces one attempt to that attempt's own result", () => {
    const { representative, score, stability } = foldAttempts([ok()]);
    expect(representative.tag).toBe("ok");
    expect(score).toBe(1);
    expect(stability).toMatchObject({ outcome: "stable_pass", passed: true });
    const failed = foldAttempts([bad(0.5)]);
    expect(failed.score).toBe(0.5);
    expect(failed.stability).toMatchObject({ outcome: "stable_fail", passed: false });
  });

  it("shows the first failing attempt rather than a lucky pass", () => {
    const { representative, stability } = foldAttempts([ok(), bad(0, "first-bad"), ok(), bad(0, "second-bad")]);
    expect(representative.tag).toBe("first-bad");
    expect(stability.outcome).toBe("flaky");
    expect(stability.passed).toBe(false);
  });

  it("scores the case as the mean across attempts", () => {
    expect(foldAttempts([ok(1), bad(0.5), ok(1), ok(1)]).score).toBeCloseTo(0.875);
  });

  it("passes the case only when every attempt passed", () => {
    expect(foldAttempts([ok(), ok(), ok()]).stability.passed).toBe(true);
    expect(foldAttempts([ok(), ok(), bad()]).stability.passed).toBe(false);
  });

  it("checks the named verdict keys across attempts when given a way to read them", () => {
    const withVerdict = (severity: string) => ({ passed: true, score: 1, verdict: { severity } });
    const { stability } = foldAttempts([withVerdict("High"), withVerdict("Medium")], { keys: ["severity"], verdict: a => a.verdict });
    expect(stability.passed).toBe(true);
    expect(stability.unstableFields.map(f => f.key)).toEqual(["severity"]);
  });
});

describe("EVAL_REPEAT_JOB", () => {
  it("is the job type the worker dispatches on", async () => {
    expect(EVAL_REPEAT_JOB).toBe("eval_repeat_run");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("server/worker.ts", "utf8")).toContain(`job.type === "${EVAL_REPEAT_JOB}"`);
  });
});

describe("meanLatencyMs", () => {
  it("is the mean time of one answer, not their sum", () => {
    expect(meanLatencyMs([{ latencyMs: 20 }, { latencyMs: 30 }, { latencyMs: 40 }])).toBe(30);
  });

  it("is that attempt's own time when there is one attempt", () => {
    expect(meanLatencyMs([{ latencyMs: 123 }])).toBe(123);
  });

  it("is zero when nothing ran", () => {
    expect(meanLatencyMs([])).toBe(0);
  });
});

describe("foldAttempts: which attempt it shows", () => {
  const ok = { passed: true, score: 1 };
  const bad = { passed: false, score: 0 };

  it("names the first failing attempt, or the first when none failed", () => {
    expect(foldAttempts([ok, ok, bad, bad]).representativeIndex).toBe(2);
    expect(foldAttempts([ok, ok]).representativeIndex).toBe(0);
    expect(foldAttempts([bad]).representativeIndex).toBe(0);
  });

  it("refuses to fold nothing rather than return a NaN score and no attempt", () => {
    expect(() => foldAttempts([])).toThrow(/at least one attempt/);
  });
});

describe("repeatedRowNotes", () => {
  it("adds nothing for a case answered once", () => {
    expect(repeatedRowNotes(1, 0)).toEqual({});
  });

  it("says the score is a mean and counts the attempt from 1", () => {
    expect(repeatedRowNotes(5, 2)).toEqual({ scoreBasis: "mean across 5 attempts", representativeAttempt: 3 });
  });
});
