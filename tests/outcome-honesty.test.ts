/**
 * Outcomes: what's shown is what was counted.
 *
 * The pages carried a lot that nothing measured: a KPI chart that drew a
 * straight line from baseline to current value when there was no data, a "30d
 * Projected" figure extrapolated from that drawn line and coloured as a
 * pass/fail, "value delivered" per agent (the outcome's revenue split by share
 * of run counts), an agent health score built from magic constants that gave
 * any agent with a single run 24 free points, an "Uptime" light (seeded health
 * x 1.1, defaulting to 99 with no agents bound), a "Policy Compliance" light
 * hardcoded green, and industry benchmarks attributed to Gartner, ACSI and
 * McKinsey with no source behind the numbers.
 *
 * Drift alerts compared real runs against agents.successRate -- a seed column
 * no runtime path updates -- so an agent with no history still "drifted".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const route = read("server", "routes", "outcomes.ts");
const detail = read("client", "src", "pages", "outcome-detail.tsx");
const list = read("client", "src", "pages", "outcomes.tsx");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the KPI chart", () => {
  it("has no point for a day with no runs, and draws no line to fill the gap", () => {
    const at = route.indexOf('router.get("/api/outcomes/:id/evidence"');
    const body = route.slice(at, at + 4000);
    expect(body).not.toContain("const progress = baseline + ((current - baseline)");
    expect(body).toContain("let value: number | null = null;");
    expect(body).toContain('basis: "agent_runs"');
    expect(body).toContain("measuredDays");
  });

  it("the page plots only the days that had runs", () => {
    expect(detail).toContain("const measured = (points ?? []).filter((p): p is { date: string; value: number } => p.value !== null);");
    expect(detail).toContain('if (withRuns.length < 2) return "Not enough days with runs";');
  });

  it("no projection is extrapolated from it", () => {
    expect(code(detail)).not.toMatch(/projected30d|projectedDailyRate|30d Projected/);
  });
});

describe("what each agent contributed", () => {
  const at = route.indexOf('router.get("/api/outcomes/:id/agent-contributions"');
  const body = route.slice(at, at + 4000);

  it("is counted work, not attributed value", () => {
    expect(code(body)).not.toMatch(/deliveredValue|valueShare|healthScore|capabilities|isUnderperforming/);
    expect(body).toContain("runShare");
    expect(body).toContain("Value is not attributed to individual agents.");
  });

  it("says nothing about an agent that never ran", () => {
    expect(body).toContain("successRate: totalRuns > 0 ? Math.round(successRate * 10) / 10 : null");
    expect(body).toContain("avgLatency: totalRuns > 0 ? avgLatency : null");
  });

  it("and the page shows those, not a value split", () => {
    expect(code(detail)).not.toMatch(/deliveredValue|costToServe|\bagent\.healthScore\b/);
    expect(detail).toContain("Share of runs");
    expect(detail).toContain("{agent.runShare}% of runs");
  });
});

describe("drift", () => {
  it("is measured against the agent's own earlier runs, not a seeded column", () => {
    const at = route.indexOf('router.get("/api/outcomes/:id/kill-chain-alerts"');
    const body = route.slice(at, at + 4000);
    expect(body).toContain("const ENOUGH_FOR_A_BASELINE = 5;");
    expect(body).toContain("const haveBaseline = earlierTraces.length >= ENOUGH_FOR_A_BASELINE;");
    expect(code(body)).not.toMatch(/agent\.successRate|agent\.avgLatencyMs/);
  });
});

describe("the lights and the benchmarks", () => {
  it("no always-green compliance light, no invented uptime", () => {
    expect(code(list)).not.toMatch(/label: "Policy Compliance"|avgHealth \* 1\.1/);
  });

  it("no benchmarks attributed to research nobody has", () => {
    for (const page of [list, detail]) {
      expect(page).not.toContain("getIndustryBenchmark");
      // The comment explaining what was removed names them; the code must not.
      expect(code(page)).not.toMatch(/Gartner|ACSI|McKinsey|HubSpot|Monetate|J\.D\. Power|HEDIS|Nilson/);
    }
  });

  it("a KPI with no target no longer counts as fully attained", () => {
    expect(list).toContain("const measurable = outcomeKpis.filter((k) => k.target > 0);");
    expect(code(list)).not.toContain("((k.currentValue || 0) / k.target) * 100 : 100");
  });
});

describe("what these pages load", () => {
  it("KPIs come from this organization's outcomes, not every organization's", () => {
    const at = route.indexOf('router.get("/api/kpis"');
    const body = route.slice(at, at + 600);
    expect(body).toContain("storage.getKpisByOutcomeIds(outcomes.map((o) => o.id))");
    expect(body).not.toContain("filterKpisForOrg(await storage.getKpis()");
  });

  it("evidence, contributions and alerts read each agent's runs, not the whole organization's", () => {
    // Each route's own body: the next route begins where this one ends.
    const bodyOf = (marker: string) => {
      const at = route.indexOf(marker);
      const next = route.indexOf("router.", at + marker.length);
      return route.slice(at, next > 0 ? next : undefined);
    };
    for (const marker of ['router.get("/api/outcomes/:id/evidence"', 'router.get("/api/outcomes/:id/agent-contributions"', 'router.get("/api/outcomes/:id/kill-chain-alerts"']) {
      const body = bodyOf(marker);
      expect(body, marker).toContain("storage.getTracesByAgent(");
      expect(body, marker).not.toContain("storage.getTraces(getOrgId(req))");
    }
  });
});
