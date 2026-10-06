/**
 * The scale of an eval pass rate in the promotion gates.
 *
 * Every suite pass rate on production is a 0-1 fraction (55 of 55 suites that have run; the maximum is
 * exactly 1.0), and a promotion threshold is a percentage (80 for production, 60 otherwise, or the agent's
 * own). The gates compared them directly, so `0.9 < 80` held for every suite and none could ever pass.
 * These pin the conversion, the float rounding that would otherwise fail a suite sitting exactly on the
 * threshold, the run-level rate that does not trust a stored unit, and that every gate goes through it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { percentOf, meetsThreshold, runPassFraction } from "../server/eval-threshold";
import { suitePassFraction, suitePassPercent, isSuiteMeasured, aggregateSuitePassPercent } from "../shared/eval-threshold";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("percentOf", () => {
  it("turns a 0-1 fraction into a percentage", () => {
    expect(percentOf(0)).toBe(0);
    expect(percentOf(0.5)).toBe(50);
    expect(percentOf(0.9)).toBe(90);
    expect(percentOf(1)).toBe(100);
  });

  it("rounds to two decimals so a 4-byte float on the threshold still meets it", () => {
    // pass_rate is a REAL (float4): 7 of 10 is stored, and read back, as 0.699999988...
    const stored = Math.fround(0.7);
    expect(stored).toBeLessThan(0.7);
    expect(percentOf(stored)).toBe(70);
    expect(percentOf(Math.fround(0.8))).toBe(80);
    expect(percentOf(Math.fround(11 / 12))).toBe(91.67);
  });

  it("reads a missing or odd value as zero, not NaN", () => {
    for (const v of [null, undefined, NaN, Infinity, "0.9" as any]) expect(percentOf(v as any)).toBe(0);
  });
});

describe("meetsThreshold", () => {
  it("compares a fraction with a threshold in percent, at the boundary", () => {
    expect(meetsThreshold(0.9, 80)).toBe(true);
    expect(meetsThreshold(0.8, 80)).toBe(true);
    expect(meetsThreshold(0.79, 80)).toBe(false);
    expect(meetsThreshold(0.5, 40)).toBe(true);
    expect(meetsThreshold(Math.fround(0.7), 70)).toBe(true);
  });

  it("is what the broken comparison got wrong: a perfect suite used to read 'below 80'", () => {
    expect(1 < 80).toBe(true); // the old comparison
    expect(meetsThreshold(1, 80)).toBe(true);
    expect(meetsThreshold(1, 100)).toBe(true);
  });

  it("treats no pass rate as not meeting a real threshold, and anything as meeting zero", () => {
    expect(meetsThreshold(null, 60)).toBe(false);
    expect(meetsThreshold(0, 60)).toBe(false);
    expect(meetsThreshold(0, 0)).toBe(true);
  });
});

describe("runPassFraction: a run's rate, whichever unit its runner stored", () => {
  it("prefers the case counts, which no runner scales differently", () => {
    expect(runPassFraction({ passedCases: 9, totalCases: 10, passRate: 0.9 })).toBe(0.9);
    // the skill-eval route stores its rate as a percentage; the counts still give the fraction
    expect(runPassFraction({ passedCases: 9, totalCases: 10, passRate: 90 })).toBe(0.9);
    expect(runPassFraction({ passedCases: 0, totalCases: 5, passRate: 0 })).toBe(0);
  });

  it("falls back to the stored rate when there are no counts, and to zero when there is nothing", () => {
    expect(runPassFraction({ passRate: 0.75 })).toBe(0.75);
    expect(runPassFraction({ passedCases: null, totalCases: 0, passRate: 0.6 })).toBe(0.6);
    expect(runPassFraction({})).toBe(0);
    expect(runPassFraction({ passRate: null })).toBe(0);
  });
});

describe("every gate goes through it", () => {
  it("the promotion gate compares in percent and reports failing suites in percent", () => {
    const s = src("server/deployment-actions.ts");
    expect(s).toContain('import { meetsThreshold, percentOf } from "./eval-threshold";');
    expect(s).toContain("if (!meetsThreshold(suite.passRate, configuredEvalThreshold)) {");
    expect(s).toContain("failingSuites.push({ name: suite.name, passRate: percentOf(suite.passRate) });");
    expect(s).not.toContain("if (passRate < configuredEvalThreshold)");
  });

  it("the readiness check compares and shows percent, over MEASURED suites only", () => {
    const s = src("server/routes/agents.ts");
    expect(s).toContain("? percentOf(Math.min(...measuredSuites.map(s => suitePassFraction(s)!)))");
    expect(s).toContain("measuredSuites.filter(s => !meetsThreshold(suitePassFraction(s), evalPassThreshold))");
    // The old forms coalesced an unmeasured suite to 0, which dragged the
    // minimum to 0% and listed the suite as failing. Neither may come back.
    expect(s).not.toContain("Math.min(...agentSuites.map(s => s.passRate ?? 0))");
    expect(s).not.toContain("agentSuites.filter(s => !meetsThreshold(s.passRate,");
  });

  it("auto-promote reads each run's rate from its case counts, in percent", () => {
    const s = src("server/routes/agents.ts");
    expect(s).toContain("latestPassRate = Math.max(latestPassRate, percentOf(runPassFraction(sorted[0])));");
    expect(s).not.toMatch(/latestPassRate = Math\.max\(latestPassRate, sorted\[0\]\.passRate/);
  });

  it("both canary health checks average only the suites that were measured", () => {
    for (const p of ["server/worker.ts", "server/routes/shadow-canary.ts"]) {
      const s = src(p);
      expect(s, p).toContain("aggregateSuitePassPercent(evalSuitesList)");
      // The old form divided a sum of measured rates by EVERY suite, so one
      // suite at 95% among nine unrun ones reported 9.5% canary health. Matched
      // on the reduce, not on the fragment: `e.passRate || 0` also appears in
      // the comment explaining what was wrong, and a check that forbids
      // describing a defect is a check that deletes the explanation.
      expect(s, p).not.toMatch(/reduce\(\(s, e\) => s \+ \(e\.passRate \|\| 0\)/);
      // An agent with suites nobody ran must not pass the gate on a null.
      expect(s, p).toContain("evalSuitesList.length === 0");
    }
  });
});

/**
 * "Never measured" must be a state the column can hold.
 *
 * eval_suites.pass_rate carried `.default(0)`, so a suite nobody had run was
 * stored as 0% rather than as absent. Measured against the live database on
 * 2026-10-06: 630 of 690 suites sat at exactly 0 having never run, and ZERO
 * suites held a 0 that a run had produced. So every `passRate || 0` reader was
 * reporting "failed every case" about suites nobody had executed.
 */
describe("a suite nobody ran holds no rate", () => {
  const ran = { passRate: 0.95, lastRunAt: new Date("2026-10-01T00:00:00Z") };

  it("returns the rate when a run produced it", () => {
    expect(suitePassFraction(ran)).toBe(0.95);
    expect(suitePassPercent(ran)).toBe(95);
    expect(isSuiteMeasured(ran)).toBe(true);
  });

  it("returns null, not 0, when nobody has run it", () => {
    expect(suitePassFraction({ passRate: null, lastRunAt: null })).toBeNull();
    expect(suitePassPercent({ passRate: null, lastRunAt: null })).toBeNull();
    expect(isSuiteMeasured({ passRate: null, lastRunAt: null })).toBe(false);
  });

  it("keeps a REAL zero, which is a measurement and must not read as absent", () => {
    // The whole point of the distinction. None exist on production today, but
    // a suite that genuinely fails every case has to be able to say so.
    const failedEverything = { passRate: 0, lastRunAt: new Date("2026-10-01T00:00:00Z") };
    expect(suitePassFraction(failedEverything)).toBe(0);
    expect(suitePassPercent(failedEverything)).toBe(0);
    expect(isSuiteMeasured(failedEverything)).toBe(true);
  });

  it("refuses a rate no run produced, which is the other direction of the disagreement", () => {
    // Four demo live-run scripts wrote a hardcoded 0.92-0.95 onto suites that
    // were never executed. Those rows still exist, and would otherwise read as
    // 95% in the UI while the deploy gate skipped them as unevaluated.
    expect(suitePassFraction({ passRate: 0.95, lastRunAt: null })).toBeNull();
    expect(isSuiteMeasured({ passRate: 0.95, lastRunAt: null })).toBe(false);
  });

  it("averages the measured suites and says how many it skipped", () => {
    const suites = [
      { passRate: 0.9, lastRunAt: new Date() },
      { passRate: 1.0, lastRunAt: new Date() },
      { passRate: null, lastRunAt: null },
      { passRate: 0.95, lastRunAt: null },
    ];
    // Not (0.9 + 1.0 + 0 + 0.95) / 4 = 71.25, and not 0.9+1.0 over 4 = 47.5.
    expect(aggregateSuitePassPercent(suites)).toEqual({ percent: 95, measured: 2, unmeasured: 2 });
  });

  it("reports null rather than 0% when nothing at all was measured", () => {
    expect(aggregateSuitePassPercent([{ passRate: null, lastRunAt: null }]))
      .toEqual({ percent: null, measured: 0, unmeasured: 1 });
    expect(aggregateSuitePassPercent([])).toEqual({ percent: null, measured: 0, unmeasured: 0 });
  });
});

describe("the column itself, and the readers that used to flatten it", () => {
  it("eval_suites.pass_rate is nullable with NO default", () => {
    // The defect was one `.default(0)`. A test on the behaviour alone would
    // pass again the moment someone re-added it, so this reads the schema.
    const s = src("shared/schema.ts");
    const table = s.slice(s.indexOf('export const evalSuites = pgTable("eval_suites"'));
    const decl = table.slice(0, table.indexOf("});"));
    expect(decl).toContain('passRate: real("pass_rate"),');
    expect(decl).not.toContain('real("pass_rate").default(0)');
  });

  it("the startup migration drops the default and clears the fabricated zeroes", () => {
    const s = src("server/db.ts");
    expect(s).toContain("ALTER TABLE eval_suites ALTER COLUMN pass_rate DROP DEFAULT");
    // Scoped to rows that are provably the default: a 0 with no run. The four
    // rows holding a non-zero rate with no run are left alone -- they are a
    // different bug (demo scripts), and suitePassFraction already withholds
    // them without rewriting anyone's data.
    expect(s).toContain("UPDATE eval_suites SET pass_rate = NULL WHERE pass_rate = 0 AND last_run_at IS NULL");
  });

  it("no demo live-run script writes a pass rate onto a suite it never ran", () => {
    for (const p of [
      "server/advantive-support-live-run.ts", "server/fitch-rw-live-run.ts",
      "server/onespan-live-run.ts", "server/otc-fulfillment-live-run.ts",
    ]) {
      expect(src(p), p).not.toMatch(/passRate:\s*0\.\d/);
    }
  });

  it("no client page renders a suite rate through `?? 0` or `|| 0` any more", () => {
    // These are the readers that turned a null back into a fabricated 0%.
    for (const p of [
      "client/src/pages/agent-detail.tsx", "client/src/pages/approvals.tsx",
      "client/src/pages/approval-detail.tsx", "client/src/pages/eval-detail.tsx",
      "client/src/pages/agent-wizard.tsx",
    ]) {
      const s = src(p);
      expect(s, p).not.toMatch(/suite\.passRate \|\| 0/);
      expect(s, p).not.toMatch(/suite\.passRate \?\? 0/);
    }
  });
});

describe("one way to say it", () => {
  /**
   * There are now two helpers and they do different jobs: shared/eval-threshold
   * decides WHETHER a suite was measured (it needs both pass_rate and
   * last_run_at, and the promotion gates on the server need it too), while
   * client/src/lib/measured.ts decides HOW to say "not measured" and what
   * colour it is. The thing to prevent is a third answer -- four pages of mine
   * each invented their own string ("Not run", "not run", "not run yet") before
   * they were pointed at the shared constant.
   */
  it("every eval-suite reader uses the shared NOT_MEASURED string, not its own", () => {
    for (const p of [
      "client/src/pages/agent-detail.tsx", "client/src/pages/approvals.tsx",
      "client/src/pages/approval-detail.tsx", "client/src/pages/agent-wizard.tsx",
    ]) {
      const s = src(p);
      expect(s, p).toContain('from "@/lib/measured"');
      // The hand-rolled variants these replaced.
      expect(s, p).not.toMatch(/: "not run yet"/);
      expect(s, p).not.toMatch(/>Not run</);
    }
  });

  it("an unmeasured suite is never coloured red, because red is a claim", () => {
    // TONE_CLASS maps "unmeasured" to muted, and the pages that show a tone
    // take it from there rather than choosing a colour themselves.
    const lib = src("client/src/lib/measured.ts");
    expect(lib).toMatch(/unmeasured:\s*"bg-muted text-muted-foreground"/);
    for (const p of ["client/src/pages/approvals.tsx", "client/src/pages/agent-detail.tsx"]) {
      expect(src(p), p).toContain("measuredRate(suitePassFraction(suite)");
    }
  });
});
