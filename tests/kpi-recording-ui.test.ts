/**
 * Recording a measurement, and the chart that plots it.
 *
 * P1 gave a KPI a declared source and a place to keep readings; this is the
 * part a person touches. The rules that matter: the picker offers exactly what
 * the platform can measure, a suggestion is offered rather than applied, a
 * KPI kept up to date by runs doesn't pretend you can type into it, and the
 * evidence chart plots measurements that were taken instead of re-deriving a
 * statistic from the KPI's name.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MEASURED_BY_OPTIONS, choiceFromSource, dateInputValue, readingLine, sourceFromChoice } from "../client/src/pages/kpi-measurement";
import { RUN_STATISTICS, DEFAULT_WINDOW_DAYS } from "../shared/kpi-measurement";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const panel = read("client", "src", "pages", "kpi-measurement.tsx");
const page = read("client", "src", "pages", "outcomes-home.tsx");
const detail = read("client", "src", "pages", "outcome-detail.tsx");
const routes = read("server", "routes", "outcomes.ts");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const evidence = (() => {
  const at = routes.indexOf('router.get("/api/outcomes/:id/evidence"');
  return routes.slice(at, routes.indexOf("router.", at + 40));
})();

describe("the picker", () => {
  it("offers a person, or a named run statistic, and nothing else", () => {
    expect(MEASURED_BY_OPTIONS[0]).toEqual({ value: "manual", label: "Recorded by a person" });
    expect(MEASURED_BY_OPTIONS.map((o) => o.value).slice(1)).toEqual(RUN_STATISTICS);
  });

  it("turns a choice into a declaration and back", () => {
    expect(sourceFromChoice("manual")).toEqual({ kind: "manual" });
    expect(sourceFromChoice("success_rate")).toEqual({ kind: "agent_runs", statistic: "success_rate", windowDays: DEFAULT_WINDOW_DAYS });
    expect(sourceFromChoice("none")).toBeNull();
    // Anything the platform can't measure declares nothing, rather than a broken source.
    expect(sourceFromChoice("profit")).toBeNull();
    expect(choiceFromSource(null)).toBe("none");
    expect(choiceFromSource({ kind: "manual" })).toBe("manual");
    expect(choiceFromSource({ kind: "agent_runs", statistic: "cost_usd", windowDays: 7 })).toBe("cost_usd");
  });
});

describe("a reading on one line", () => {
  it("says what it read, when, and who says so", () => {
    const line = readingLine({ value: 62.5, takenAt: "2026-09-24T12:00:00.000Z", source: "manual", statistic: null, recordedByName: "admin" }, "%");
    expect(line).toContain("62.5 %");
    expect(line).toContain("admin");
  });

  it("names the statistic when a run measured it, not a person", () => {
    const line = readingLine({ value: 80, takenAt: "2026-09-24T12:00:00.000Z", source: "agent_runs", statistic: "success_rate", recordedByName: null }, "%");
    expect(line).toContain("agent runs (success rate)");
    expect(line).not.toContain("a person");
  });

  it("offers today's date in the form, in the viewer's own day", () => {
    expect(dateInputValue(new Date(2026, 8, 24, 23, 30))).toBe("2026-09-24");
  });
});

describe("the panel", () => {
  it("records against the KPI's own route, and never invents the value", () => {
    expect(panel).toContain("`/api/kpis/${kpi.id}/readings`");
    expect(panel).toContain("value: Number(value)");
    expect(code(panel)).not.toMatch(/Math\.random|currentValue \|\| 0\.01/);
  });

  it("suggests, and waits to be told", () => {
    expect(panel).toContain("declare.mutate(view.data!.suggestion!.source)");
    // The suggestion's own wording says it is a guess; the panel just shows it.
    expect(panel).toContain("{view.data.suggestion.because}");
  });

  it("says why you can't type into a run-measured KPI, instead of hiding the form", () => {
    expect(panel).toContain("const canRecord = !source || source.kind === \"manual\";");
    expect(panel).toContain("Agent runs keep this up to date, so a recorded value would be overwritten.");
  });

  it("shows the author's own note about how it should be measured", () => {
    expect(panel).toContain("How it was meant to be measured:");
  });

  it("is on the outcomes page, under each KPI", () => {
    expect(page).toContain('import { KpiMeasurement } from "./kpi-measurement";');
    expect(page).toContain("<KpiMeasurement kpi={k} />");
  });
});

describe("the evidence chart", () => {
  it("plots readings, not a statistic guessed from the KPI's name", () => {
    expect(evidence).toContain("await storage.getKpiReadingsByOutcome(outcomeId)");
    expect(code(evidence)).not.toMatch(/kpiNameLower/);
  });

  it("no longer carries the current value forward through days nothing measured", () => {
    expect(code(evidence)).not.toContain("value = kpi.currentValue || kpi.baseline || 0;");
  });

  it("says what the points are", () => {
    expect(evidence).toContain('basis: source?.kind === "manual" ? "recorded" : source?.kind === "agent_runs" ? "agent_runs" : "not_measured"');
    expect(evidence).toContain("describes: describeSource(source)");
  });

  it("and the page counts measurements rather than days with runs", () => {
    expect(detail).toContain("Measurements");
    expect(detail).toContain('return "Not enough measurements";');
    expect(code(detail)).not.toContain("{measuredDays} of 7");
  });
});
