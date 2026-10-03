/**
 * A repeated run (each golden answered several times) has a STRICT pass rate: a golden passes only if every
 * answer does, so it runs lower than an ordinary run's and is not on the same scale. Anything that judges an
 * agent by averaging pass rates across runs must set repeated runs aside, or a consistency check drags a
 * headline number down, counts as a regression, shifts a compliance score and can raise a production alert.
 * Measured on production: one repeated run at 50% moved "Pass rate, 7 days" from 90% to 87% and "Open
 * regressions" from 14 to 15. These pin that it no longer does, that cost and run counts still count every run,
 * and that an ordinary run is figured exactly as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({ runs: [] as any[], traces: [] as any[] }));

vi.mock("../server/storage", () => ({
  storage: {
    getEvalTestRun: vi.fn(async (id: string) => db.runs.find((r) => r.id === id)),
    getEvalTestRuns: vi.fn(async (f: any) => db.runs.filter((r) => (!f.organizationId || r.organizationId === f.organizationId) && (!f.agentId || r.agentId === f.agentId))),
    getEvalTraces: vi.fn(async (f: any) => db.traces.filter((t) => t.runId === f.runId)),
    getEvalRedteamRuns: vi.fn(async () => []),
    getEvalRedteamResults: vi.fn(async () => []),
    getEvalDataset: vi.fn(async () => undefined),
    getAgent: vi.fn(async () => undefined),
  },
}));

import { evalSummaryFigures, alertWindowRates } from "../server/eval-run-figures";
import { evalServices } from "../server/astra/eval-services";
import { generateComplianceReport } from "../server/eval-report-generator";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
let n = 0;
const run = (over: Record<string, any> = {}) => ({
  id: `run-${++n}`, organizationId: "org-a", agentId: "ag-1", datasetId: "ds-1", status: "completed",
  passRate: 0.9, repeats: 1, costUsd: 0.1, startedAt: hoursAgo(2), completedAt: hoursAgo(1), tags: [], ...over,
});

describe("evalSummaryFigures: the home page's headline numbers", () => {
  it("does not let a repeated run drag the 7-day pass rate down or count as a regression", () => {
    const runs = [run({ passRate: 0.9 }), run({ passRate: 0.9 }), run({ passRate: 0.5, repeats: 3 })];
    const f = evalSummaryFigures(runs, NOW);
    expect(f.sevenDayPassRate).toBe(90); // not 77
    expect(f.openRegressions).toBe(0); // not 1
  });

  it("still counts an ordinary run under 70% as a regression", () => {
    const f = evalSummaryFigures([run({ passRate: 0.9 }), run({ passRate: 0.6 }), run({ passRate: 0.2, repeats: 4 })], NOW);
    expect(f.openRegressions).toBe(1);
    expect(f.sevenDayPassRate).toBe(75);
  });

  it("still counts what every completed run cost, repeated or not", () => {
    const f = evalSummaryFigures([run({ costUsd: 0.1 }), run({ costUsd: 0.25, repeats: 3 }), run({ costUsd: 9, status: "running" })], NOW);
    expect(f.evalCostUsd).toBe(0.35);
  });

  it("averages the last 7 days, and falls back to all ordinary runs when there are none", () => {
    const old = (rate: number) => run({ passRate: rate, startedAt: hoursAgo(24 * 20) });
    expect(evalSummaryFigures([run({ passRate: 0.8 }), old(0.2)], NOW).sevenDayPassRate).toBe(80);
    expect(evalSummaryFigures([old(0.6), old(0.8)], NOW).sevenDayPassRate).toBe(70);
  });

  it("is zero when there is no ordinary completed run, and ignores unfinished ones", () => {
    expect(evalSummaryFigures([], NOW)).toEqual({ sevenDayPassRate: 0, openRegressions: 0, evalCostUsd: 0 });
    expect(evalSummaryFigures([run({ repeats: 3, passRate: 0.4 })], NOW)).toMatchObject({ sevenDayPassRate: 0, openRegressions: 0 });
    expect(evalSummaryFigures([run({ status: "failed", passRate: 0.1 })], NOW).openRegressions).toBe(0);
  });

  it("treats a missing repeat count as an ordinary run", () => {
    expect(evalSummaryFigures([run({ repeats: null, passRate: 0.6 }), run({ repeats: undefined, passRate: 0.8 })], NOW).sevenDayPassRate).toBe(70);
  });
});

describe("alertWindowRates: what the pass-rate alert watches", () => {
  it("sees only ordinary runs, so a repeated run cannot raise a production alert", () => {
    expect(alertWindowRates([run({ repeats: 3, passRate: 0.2 })], NOW)).toBeNull();
    const r = alertWindowRates([run({ passRate: 0.9 }), run({ repeats: 3, passRate: 0.2 })], NOW)!;
    expect(r.windowRate).toBeCloseTo(0.9);
  });

  it("is the 24h mean against the mean of the 6 days before, and its own rate when there is no baseline", () => {
    const r = alertWindowRates([run({ passRate: 0.6 }), run({ passRate: 0.8 }), run({ passRate: 0.9, startedAt: hoursAgo(50) }), run({ passRate: 0.7, startedAt: hoursAgo(24 * 3) })], NOW)!;
    expect(r.windowRate).toBeCloseTo(0.7);
    expect(r.baselineRate).toBeCloseTo(0.8);
    expect(alertWindowRates([run({ passRate: 0.5 })], NOW)).toEqual({ windowRate: 0.5, baselineRate: 0.5 });
  });

  it("ignores runs older than 7 days, unfinished runs and runs with no pass rate", () => {
    expect(alertWindowRates([run({ passRate: 0.5, startedAt: hoursAgo(24 * 9) })], NOW)).toBeNull();
    expect(alertWindowRates([run({ status: "running" }), run({ passRate: null })], NOW)).toBeNull();
  });
});

describe("compliance reports", () => {
  beforeEach(() => { db.runs.length = 0; db.traces.length = 0; });
  const soc2 = () => generateComplianceReport({ templateType: "soc2", agentIds: ["ag-1"], timeWindowDays: 7, format: "json", orgId: "org-a" });
  // The generator reads the real clock, so these runs are dated relative to it.
  const recent = { startedAt: new Date(Date.now() - 3600_000).toISOString() };

  it("score a control on ordinary runs only: a consistency check does not turn a pass into a warning", async () => {
    db.runs.push(run({ passRate: 0.96, ...recent }), run({ passRate: 0.5, repeats: 3, ...recent }));
    const r = await soc2();
    const integrity = r.sections.find((s) => s.title.startsWith("Processing Integrity"))!;
    expect(integrity.score).toBe(96); // not 73
    expect(integrity.status).toBe("pass"); // not "warning"
    expect(r.stats.totalRuns).toBe(1); // "runs analyzed" describes the runs scored
    expect(r.evidenceTable.map((e) => e.runId)).toEqual([db.runs[0].id]);
  });

  it("are unchanged when no run was repeated", async () => {
    db.runs.push(run({ passRate: 0.96, costUsd: 0.2, ...recent }), run({ passRate: 0.9, costUsd: 0.3, ...recent }));
    const r = await soc2();
    expect(r.stats).toMatchObject({ totalRuns: 2, avgPassRate: 93, totalCostUsd: 0.5 });
  });
});

describe("Astra evaluation tools", () => {
  beforeEach(() => {
    db.runs.length = 0; db.traces.length = 0;
    db.runs.push(
      run({ id: "run-ord", passRate: 0.9, completedAt: "2026-10-02T10:00:00Z" }),
      run({ id: "run-rep", passRate: 0.4, repeats: 3, flakyCount: 2, consistency: 0.8, completedAt: "2026-10-03T10:00:00Z" }),
      run({ id: "run-rep2", passRate: 0.3, repeats: 3, flakyCount: 1, consistency: 0.9, completedAt: "2026-10-03T12:00:00Z" }),
    );
  });

  it("a run view says when the run was repeated and that its rate is strict; an ordinary view is unchanged", async () => {
    const rep = (await evalServices.getEvalRunSummary("org-a", "run-rep"))!.run as any;
    expect(rep).toMatchObject({ repeats: 3, flakyGoldens: 2, consistency: 0.8 });
    expect(rep.passRateBasis).toMatch(/strict/);
    const ord = (await evalServices.getEvalRunSummary("org-a", "run-ord"))!.run as any;
    for (const k of ["repeats", "flakyGoldens", "consistency", "passRateBasis"]) expect(ord).not.toHaveProperty(k);
  });

  it("gives no regression verdict for a repeated run against an ordinary one, whichever way it is asked", async () => {
    const auto = (await evalServices.compareEvalRuns("org-a", "run-rep")) as any; // baseline picked: the ordinary run
    expect(auto).toMatchObject({ comparable: false, baseline: { id: "run-ord" } });
    expect(auto.note).toMatch(/not on the same scale/);
    for (const k of ["regressed", "passRateDeltaPct", "metrics"]) expect(auto).not.toHaveProperty(k);
    const explicit = (await evalServices.compareEvalRuns("org-a", "run-ord", "run-rep")) as any;
    expect(explicit).toMatchObject({ comparable: false });
    expect(explicit).not.toHaveProperty("regressed");
  });

  it("still compares two runs that answered each case the same number of times", async () => {
    const r = (await evalServices.compareEvalRuns("org-a", "run-rep2", "run-rep")) as any;
    expect(r.comparable).toBeUndefined();
    expect(r.regressed).toBe(true); // 40% -> 30% is 10 points worse, past the 5-point window
    expect(r.passRateDeltaPct).toBeCloseTo(-10);
  });
});

describe("the routes", () => {
  const route = readFileSync(new URL("../server/routes/eval-studio.ts", import.meta.url), "utf8");

  it("the summary and the alert loop go through the figures", () => {
    expect(route).toContain("evalSummaryFigures(runs)");
    expect(route).toContain("alertWindowRates(await storage.getEvalTestRuns(");
    expect(route).not.toMatch(/sevenDaysAgo/);
  });

  it("both sparklines plot ordinary runs only", () => {
    expect((route.match(/gradedRuns\(await storage\.getEvalTestRuns\(\{ agentId(: agent\.id)?, organizationId/g) ?? []).length).toBe(2);
  });

  it("sampled traces count one per answer", () => {
    expect(route).toContain("(r.totalGoldens ?? 0) * (r.repeats ?? 1)");
  });

  it("the Astra comparison tool does not draw a chart for runs that are not comparable", () => {
    const tool = readFileSync(new URL("../server/astra/tools/evaluation.ts", import.meta.url), "utf8");
    expect(tool).toContain('"comparable" in r && r.comparable === false');
  });
});
