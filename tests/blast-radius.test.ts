/**
 * Figures shown on a promotion or incident must be counted, not invented.
 *
 * Before this: "runs per day" was the last 30-50 traces multiplied by 24/168
 * as if they spanned a week; "people affected" was that count times 30;
 * rollback time fell back to "~15m"; a canary analysis asked a model for KPI
 * values, customer counts and revenue and SAVED them onto the deployment; an
 * incident's business impact was £250k/£125k/£50k by severity; and an agent
 * with no runs was reported at health 85 with a 95% success rate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runsPerDay, buildBlastRadius } from "../server/blast-radius";

const NOW = new Date("2026-09-20T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("runsPerDay", () => {
  it("counts the runs in the last 24 hours when there is a day of history", () => {
    const traces = [hoursAgo(1), hoursAgo(5), hoursAgo(23), hoursAgo(30), hoursAgo(40)].map((startedAt) => ({ startedAt }));
    expect(runsPerDay(traces, NOW)).toMatchObject({ value: 3, basis: "last_24h" });
  });

  it("refuses to state a daily rate from a shorter window", () => {
    const traces = [hoursAgo(0.5), hoursAgo(1), hoursAgo(2)].map((startedAt) => ({ startedAt }));
    const r = runsPerDay(traces, NOW);
    expect(r.basis).toBe("not_enough_history");
    expect(r.value).toBe(3);
    expect(r.historyHours).toBe(2);
  });

  it("reports nothing rather than zero-as-a-fact when there are no runs", () => {
    expect(runsPerDay([], NOW)).toEqual({ value: 0, basis: "not_enough_history", historyHours: null });
  });
});

describe("buildBlastRadius", () => {
  const base = {
    environment: "prod",
    traces: [hoursAgo(1), hoursAgo(10), hoursAgo(40)].map((startedAt) => ({ startedAt })),
    boundOutcomes: [{ id: "o1", name: "Invoice cycle time", riskTier: "HIGH" }],
    revenueExposureUsd: 12_000,
    rollbackCooldownMinutes: 10,
  };

  it("reports what it counted", () => {
    const r = buildBlastRadius(base);
    expect(r).toMatchObject({ runsLast24h: 2, runsBasis: "last_24h", revenueExposure: "$12,000", rollbackTimeEstimate: "10m" });
    expect(r.boundOutcomes).toEqual(["Invoice cycle time"]);
  });

  it("never reports how many people are affected", () => {
    const r = buildBlastRadius(base);
    expect(JSON.stringify(r)).not.toMatch(/userCount|totalUsersAffected|affectedUsers/);
    expect(r.notMeasured.join(" ")).toContain("people affected");
  });

  it("says what is missing instead of filling it in", () => {
    const r = buildBlastRadius({ ...base, revenueExposureUsd: null, rollbackCooldownMinutes: null });
    expect(r.revenueExposure).toBeNull();
    expect(r.rollbackTimeEstimate).toBeNull();
    expect(r.notMeasured.join(" ")).toContain("revenue exposure");
    expect(r.notMeasured.join(" ")).toContain("rollback time");
    expect(r.riskSummary).toContain("no rollback window configured");
  });
});

describe("the rest of the invented figures are gone", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

  it("no route projects runs per day from a short trace window", () => {
    for (const f of [["server", "routes", "agents.ts"], ["server", "deployment-actions.ts"]]) {
      expect(read(...f)).not.toContain("24 / Math.max(1, 168)");
    }
  });

  it("the canary analysis neither asks for nor saves invented numbers", () => {
    const src = read("server", "routes", "shadow-canary.ts");
    expect(src).toContain("Do NOT invent numbers.");
    expect(src).not.toContain("kpiBaseline: analysis.kpiBaseline");
    expect(src).not.toContain("blastRadius: analysis.blastRadius");
  });

  it("an agent with no runs has no health score or success rate", () => {
    const src = read("server", "routes", "governance.ts");
    expect(src).not.toContain("agent.healthScore || 85");
    expect(src).not.toContain("agent.successRate || 0.95");
    expect(src).not.toContain("kpi.confidence || 0.85");
  });

  it("a canary only steps up when auto-promote was asked for, and its audit events carry the organization", () => {
    const src = read("server", "worker.ts");
    expect(src).toContain("if (!autopromote?.enabled) {");
    const monitor = src.slice(src.indexOf("async function monitorCanaryDeployments"));
    expect(monitor.match(/organizationId: dep\.organizationId \?\? undefined/g)?.length).toBe(2);
  });
});
