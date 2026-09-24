/**
 * A KPI now says what measures it.
 *
 * Before this, `recomputeOutcomeKpis` matched KPI *names* against keyword
 * lists and wrote whichever run statistic the keyword implied -- live, 121 of
 * 164 KPIs matched, including "Days from Work Order Close to Claim
 * Submission", which was filled with the agents' average run latency.
 *
 * The rules kept here: nothing is measured unless it was declared, a run
 * statistic is named rather than guessed, no runs means no value (never a
 * zero), and the old keyword matcher may only ever suggest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_WINDOW_DAYS,
  breachesThreshold,
  describeSource,
  parseMeasurementSource,
  statisticValue,
  suggestMeasurement,
  trendBetween,
  validateMeasurementSource,
  type AgentRunsSource,
} from "../server/kpi-measurement";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const helpers = read("server", "routes", "helpers.ts");
const routes = read("server", "routes", "outcomes.ts");
const db = read("server", "db.ts");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const recompute = (() => {
  const at = helpers.indexOf("export async function recomputeOutcomeKpis(");
  return helpers.slice(at, helpers.indexOf("\nexport ", at + 10));
})();

const runs = (source: Partial<AgentRunsSource> = {}): AgentRunsSource => ({ kind: "agent_runs", statistic: "success_rate", windowDays: 30, ...source });

describe("what a KPI declares", () => {
  it("reads a manual declaration and a named run statistic", () => {
    expect(parseMeasurementSource({ kind: "manual" })).toEqual({ kind: "manual" });
    expect(parseMeasurementSource({ kind: "agent_runs", statistic: "failure_rate", windowDays: 7 })).toEqual({ kind: "agent_runs", statistic: "failure_rate", windowDays: 7 });
  });

  it("treats anything it can't read as nothing measuring it", () => {
    expect(parseMeasurementSource(null)).toBeNull();
    expect(parseMeasurementSource({ kind: "vibes" })).toBeNull();
    // A statistic nobody computes would otherwise silently measure nothing.
    expect(parseMeasurementSource({ kind: "agent_runs", statistic: "profit" })).toBeNull();
  });

  it("falls back to a stated window rather than an unbounded one", () => {
    expect(parseMeasurementSource({ kind: "agent_runs", statistic: "run_count" })?.windowDays).toBe(DEFAULT_WINDOW_DAYS);
    expect(parseMeasurementSource({ kind: "agent_runs", statistic: "run_count", windowDays: 9999 })?.windowDays).toBe(365);
  });

  it("refuses a bad declaration with the reason", () => {
    const bad = validateMeasurementSource({ kind: "agent_runs", statistic: "profit" });
    expect(bad.ok).toBe(false);
    expect((bad as { error: string }).error).toContain("isn't a run statistic");
    expect(validateMeasurementSource(null)).toEqual({ ok: true, source: null });
  });

  it("says what measures it in words, including that runs are a proxy", () => {
    expect(describeSource(null)).toBe("Nothing measures this yet");
    expect(describeSource({ kind: "manual" })).toBe("Recorded by a person");
    expect(describeSource(runs({ statistic: "avg_latency", windowDays: 14 }))).toBe("Average time an agent run took, over the last 14 days (a proxy)");
  });
});

describe("the value a declared statistic has", () => {
  const window = { runs: 10, failed: 2, totalLatencyMs: 120_000, totalCostUsd: 1.5, events: 40 };

  it("counts what it says it counts", () => {
    expect(statisticValue(runs({ statistic: "success_rate" }), window, "%")).toBe(80);
    expect(statisticValue(runs({ statistic: "failure_rate" }), window, "%")).toBe(20);
    expect(statisticValue(runs({ statistic: "run_count" }), window, "count")).toBe(10);
    expect(statisticValue(runs({ statistic: "event_count" }), window, "count")).toBe(40);
    expect(statisticValue(runs({ statistic: "cost_usd" }), window, "usd")).toBe(1.5);
  });

  it("gives a duration in the KPI's own unit", () => {
    expect(statisticValue(runs({ statistic: "avg_latency" }), window, "seconds")).toBe(12);
    expect(statisticValue(runs({ statistic: "avg_latency" }), window, "minutes")).toBe(0.2);
    expect(statisticValue(runs({ statistic: "avg_latency" }), window, null)).toBe(12000);
  });

  it("with no runs is not measured, and never a zero", () => {
    const empty = { runs: 0, failed: 0, totalLatencyMs: 0, totalCostUsd: 0, events: 0 };
    for (const statistic of ["success_rate", "failure_rate", "avg_latency", "cost_usd"] as const) {
      expect(statisticValue(runs({ statistic }), empty, "%"), statistic).toBeNull();
    }
    // A count of runs genuinely is zero, and says so.
    expect(statisticValue(runs({ statistic: "run_count" }), empty, "count")).toBe(0);
  });
});

describe("a suggestion is only a suggestion", () => {
  it("proposes a statistic from the name, and says it is a guess", () => {
    const s = suggestMeasurement({ name: "Claim Auto-Submission Rate", unit: "%" });
    expect(s?.source.statistic).toBe("success_rate");
    expect(s?.because).toContain("guess from the KPI's name");
  });

  it("reads a rate of things going wrong as failures, not successes", () => {
    expect(suggestMeasurement({ name: "Exception Rate" })?.source.statistic).toBe("failure_rate");
  });

  it("declines the business durations the old rules swallowed", () => {
    // The old list matched any name containing "time" and filled this with the
    // agents' average run latency.
    expect(suggestMeasurement({ name: "Days from Work Order Close to Claim Submission" })).toBeNull();
    expect(suggestMeasurement({ name: "Effort Reduction" })).toBeNull();
    expect(suggestMeasurement({ name: "" })).toBeNull();
  });
});

describe("the recompute", () => {
  it("only touches KPIs that asked to be measured by runs", () => {
    expect(recompute).toContain('.filter((x): x is { kpi: typeof x.kpi; source: AgentRunsSource } => x.source?.kind === "agent_runs")');
    expect(code(recompute)).not.toMatch(/kpiNameLower|includes\("success"\)|includes\("latency"\)/);
  });

  it("keeps what it measures as readings, so a KPI has a history", () => {
    expect(recompute).toContain("await storage.createKpiReading({");
    expect(recompute).toContain('source: "agent_runs"');
    // A steady value still gets a point now and then, but not one per run.
    expect(recompute).toContain("if (moved || sinceLast > STEADY_READING_GAP_MS) {");
  });

  it("moves when-it-was-measured even when the number is unchanged", () => {
    expect(recompute).toContain("valueUpdatedAt: takenAt");
    // The old body skipped the write entirely on an unchanged value, so a KPI
    // measured every run still read as last measured whenever it last moved.
    expect(recompute.indexOf("await storage.updateKpi(")).toBeLessThan(recompute.indexOf("if (!moved) continue;"));
  });

  it("leaves a KPI unmeasured when the window holds no runs", () => {
    expect(recompute).toContain("if (newValue === null) continue;");
  });

  it("uses each KPI's own window rather than one fixed 30 days", () => {
    expect(recompute).toContain("const windowFor = (days: number): RunWindow =>");
    expect(recompute).toContain("windowFor(source.windowDays)");
  });
});

describe("recording a measurement", () => {
  it("is a guarded, audited route of its own", () => {
    expect(routes).toContain('router.post("/api/kpis/:id/readings", checkPermission("create_modify_outcomes")');
    expect(routes).toContain('action: "kpi_value_recorded"');
    expect(routes).toContain('router.put("/api/kpis/:id/measurement", checkPermission("create_modify_outcomes")');
    expect(routes).toContain('action: "kpi_measurement_declared"');
  });

  it("refuses to record against a run-measured KPI instead of losing the value", () => {
    expect(routes).toContain('if (source?.kind === "agent_runs") {');
    expect(routes).toContain("would be overwritten on the next run");
  });

  it("can't have its declaration set through the ordinary PATCH", () => {
    expect(routes).toContain("delete (data as any).measurementSource;");
  });

  it("keeps a value set through PATCH in the history too", () => {
    const at = routes.indexOf('router.patch("/api/kpis/:id"');
    const body = routes.slice(at, routes.indexOf("router.", at + 40));
    expect(body).toContain("await storage.createKpiReading({");
  });
});

describe("a reading against the KPI's own thresholds", () => {
  it("knows which side of an SLA is the bad side", () => {
    // Lower is better: a latency above the threshold is the breach.
    expect(breachesThreshold(12, 10, "<=")).toBe(true);
    expect(breachesThreshold(8, 10, "<=")).toBe(false);
    // Higher is better: falling below it is.
    expect(breachesThreshold(80, 90, ">=")).toBe(true);
    expect(breachesThreshold(95, 90, ">=")).toBe(false);
    expect(breachesThreshold(5, null, ">=")).toBe(false);
  });

  it("calls the first reading stable, not a rise from zero", () => {
    expect(trendBetween(null, 40)).toBe("stable");
    expect(trendBetween(30, 40)).toBe("up");
    expect(trendBetween(50, 40)).toBe("down");
  });
});

describe("the tables this needs", () => {
  it("are added at boot, additively, the way every other table here is", () => {
    expect(db).toContain("ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS measurement_source JSONB;");
    expect(db).toContain("CREATE TABLE IF NOT EXISTS kpi_readings (");
    expect(db).toContain("CREATE INDEX IF NOT EXISTS kpi_readings_kpi_taken_idx");
  });
});
