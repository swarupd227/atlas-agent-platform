/**
 * Repeat-run evals: what counts as flaky.
 *
 * A case run once cannot show whether the agent answers the same way twice.
 * These tests pin the definitions the runners will share:
 *   - a case passes only if EVERY attempt passed (strict, so 3 of 5 is
 *     "inconsistent", never a pass);
 *   - one attempt behaves exactly like a run today;
 *   - "nothing ran" stays distinguishable from "nothing flipped" (null, not 0);
 *   - a label that changes between attempts is reported even when every
 *     attempt passed, and "High" / "high" is one label;
 *   - the repeat count and attempt total are bounded.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeAttempts,
  summarizeRun,
  resolveRepeats,
  MAX_REPEATS,
  MAX_ATTEMPTS,
} from "../shared/eval-stability";

const pass = (verdict?: Record<string, unknown> | null) => ({ passed: true, verdict });
const fail = (verdict?: Record<string, unknown> | null) => ({ passed: false, verdict });

describe("summarizeAttempts", () => {
  it("passes only when every attempt passed", () => {
    const s = summarizeAttempts([pass(), pass(), pass()]);
    expect(s).toMatchObject({ attempts: 3, passedAttempts: 3, outcome: "stable_pass", passed: true, consistency: 1, failingReason: null });
  });

  it("reports a case that always fails as a stable failure, not flaky", () => {
    const s = summarizeAttempts([fail(), fail()]);
    expect(s).toMatchObject({ outcome: "stable_fail", passed: false, consistency: 1, failingReason: null });
  });

  it("calls 3 passes in 5 inconsistent and fails the case", () => {
    const s = summarizeAttempts([pass(), fail(), pass(), pass(), fail()]);
    expect(s.outcome).toBe("flaky");
    expect(s.passed).toBe(false);
    expect(s.passedAttempts).toBe(3);
    expect(s.consistency).toBeCloseTo(0.6);
    expect(s.failingReason).toBe("Inconsistent: passed 3 of 5 attempts");
  });

  it("measures consistency against the more common outcome, so 1 pass in 5 is 0.8", () => {
    const s = summarizeAttempts([fail(), fail(), fail(), fail(), pass()]);
    expect(s.outcome).toBe("flaky");
    expect(s.consistency).toBeCloseTo(0.8);
  });

  it("treats a single attempt like a run today", () => {
    expect(summarizeAttempts([pass()])).toMatchObject({ outcome: "stable_pass", passed: true, consistency: 1, unstableFields: [] });
    expect(summarizeAttempts([fail()])).toMatchObject({ outcome: "stable_fail", passed: false, consistency: 1, unstableFields: [] });
  });

  it("says nothing ran when there are no attempts", () => {
    expect(summarizeAttempts([])).toEqual({
      attempts: 0, passedAttempts: 0, outcome: "no_attempts", passed: false, consistency: null, unstableFields: [], failingReason: null,
    });
  });

  describe("label stability", () => {
    it("checks no fields unless keys are given", () => {
      const s = summarizeAttempts([pass({ severity: "High" }), pass({ severity: "Low" })]);
      expect(s.unstableFields).toEqual([]);
    });

    it("reports a label that changed even though every attempt passed", () => {
      const s = summarizeAttempts(
        [pass({ severity: "High" }), pass({ severity: "Medium" }), pass({ severity: "High" }), pass({ severity: "High" })],
        { keys: ["severity"] },
      );
      expect(s.outcome).toBe("stable_pass");
      expect(s.unstableFields).toEqual([
        { key: "severity", values: [{ value: "high", count: 3 }, { value: "medium", count: 1 }], agreement: 0.75 },
      ]);
    });

    it("treats differences of case and spacing as the same label", () => {
      const s = summarizeAttempts(
        [pass({ action: "Notify owner" }), pass({ action: "notify_owner" }), pass({ action: " NOTIFY  OWNER " })],
        { keys: ["action"] },
      );
      expect(s.unstableFields).toEqual([]);
    });

    it("counts a missing field and an unparseable verdict as a different value", () => {
      const s = summarizeAttempts([pass({ severity: "High" }), pass({}), pass(null)], { keys: ["severity"] });
      expect(s.unstableFields).toHaveLength(1);
      expect(s.unstableFields[0].values).toEqual([
        { value: "(missing)", count: 2 },
        { value: "high", count: 1 },
      ]);
    });

    it("reports only the keys that moved", () => {
      const s = summarizeAttempts(
        [pass({ severity: "High", action: "Notify" }), pass({ severity: "Low", action: "Notify" })],
        { keys: ["severity", "action"] },
      );
      expect(s.unstableFields.map(f => f.key)).toEqual(["severity"]);
    });

    it("treats an object label as the same answer whatever order its keys come in", () => {
      const same = summarizeAttempts([pass({ tier: { a: 1, b: { c: 2, d: 3 } } }), pass({ tier: { b: { d: 3, c: 2 }, a: 1 } })], { keys: ["tier"] });
      expect(same.unstableFields).toEqual([]);
      const moved = summarizeAttempts([pass({ tier: { a: 1, b: 2 } }), pass({ tier: { a: 1, b: 3 } })], { keys: ["tier"] });
      expect(moved.unstableFields).toHaveLength(1);
    });

    it("compares numbers and booleans by value", () => {
      const same = summarizeAttempts([pass({ n: 2, ok: true }), pass({ n: 2, ok: true })], { keys: ["n", "ok"] });
      expect(same.unstableFields).toEqual([]);
      const moved = summarizeAttempts([pass({ n: 2 }), pass({ n: 3 })], { keys: ["n"] });
      expect(moved.unstableFields[0].values.map(v => v.value).sort()).toEqual(["2", "3"]);
    });
  });
});

describe("summarizeRun", () => {
  it("counts stable and flaky cases and names the flaky ones", () => {
    const run = summarizeRun([
      { caseId: "a", stability: summarizeAttempts([pass(), pass()]) },
      { caseId: "b", stability: summarizeAttempts([pass(), fail()]) },
      { caseId: "c", stability: summarizeAttempts([fail(), fail()]) },
      { caseId: "d", stability: summarizeAttempts([fail(), pass()]) },
    ]);
    expect(run).toMatchObject({ measuredCases: 4, stablePass: 1, stableFail: 1, flakyCases: 2, flakyCaseIds: ["b", "d"], flipRate: 0.5 });
    expect(run.consistency).toBeCloseTo((1 + 0.5 + 1 + 0.5) / 4);
  });

  it("returns null, not zero, when nothing was measured", () => {
    expect(summarizeRun([])).toEqual({ measuredCases: 0, stablePass: 0, stableFail: 0, flakyCases: 0, flakyCaseIds: [], flipRate: null, consistency: null });
  });

  it("leaves cases that never ran out of the figures", () => {
    const run = summarizeRun([
      { caseId: "a", stability: summarizeAttempts([pass(), pass()]) },
      { caseId: "b", stability: summarizeAttempts([]) },
    ]);
    expect(run).toMatchObject({ measuredCases: 1, flakyCases: 0, flipRate: 0, consistency: 1 });
  });

  it("reports a run of one attempt per case as fully consistent", () => {
    const run = summarizeRun([
      { caseId: "a", stability: summarizeAttempts([pass()]) },
      { caseId: "b", stability: summarizeAttempts([fail()]) },
    ]);
    expect(run).toMatchObject({ flakyCases: 0, flipRate: 0, consistency: 1 });
  });
});

describe("resolveRepeats", () => {
  it("defaults to one attempt when none is asked for", () => {
    for (const raw of [undefined, null, ""]) expect(resolveRepeats(raw, 5)).toEqual({ ok: true, repeats: 1 });
  });

  it("accepts a whole number up to the limit, as a number or a numeric string", () => {
    expect(resolveRepeats(5, 5)).toEqual({ ok: true, repeats: 5 });
    expect(resolveRepeats("3", 5)).toEqual({ ok: true, repeats: 3 });
    expect(resolveRepeats(MAX_REPEATS, 1)).toEqual({ ok: true, repeats: MAX_REPEATS });
  });

  it("refuses a count that is not a whole number from 1 to the limit", () => {
    for (const raw of [0, -1, 2.5, MAX_REPEATS + 1, "abc", NaN, {}, true]) {
      const r = resolveRepeats(raw, 5);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(`1 to ${MAX_REPEATS}`);
    }
  });

  it("refuses a run whose attempts would pass the total limit, and says the numbers", () => {
    expect(resolveRepeats(5, 20)).toEqual({ ok: true, repeats: 5 });
    const r = resolveRepeats(5, 21);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(`21 cases x 5 repeats is 105 attempts; a run is limited to ${MAX_ATTEMPTS}`);
  });
});

describe("resolveRepeats with a larger attempt limit", () => {
  it("defaults to the suite limit of 100 attempts", () => {
    expect(resolveRepeats(5, 21).ok).toBe(false);
    expect(resolveRepeats(5, 20).ok).toBe(true);
  });

  it("uses the limit it is given, and names it", () => {
    expect(resolveRepeats(5, 60, 300)).toEqual({ ok: true, repeats: 5 });
    const r = resolveRepeats(5, 61, 300);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("61 cases x 5 repeats is 305 attempts; a run is limited to 300");
  });

  it("keeps the per-case limit whatever the attempt limit", () => {
    const r = resolveRepeats(11, 1, 300);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1 to 10");
  });
});
