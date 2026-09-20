/**
 * The Eval Studio home: one page listing the agents that are actually tested,
 * worst pass rate first, with the specialist tools as links. An agent with no
 * run says "no run" rather than showing a zero that reads like a score.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { pct, rateTone, runsOf, gateVerdict, gateThreshold } from "../client/src/pages/eval-studio-home";

const run = (id: string, agentId: string, passRate: number | null, startedAt: string) => ({ id, agentId, status: "completed", passRate, startedAt });

describe("pass rate display", () => {
  it("shows one decimal place, and a dash when there is no rate", () => {
    expect(pct(0.9123)).toBe("91.2%");
    expect(pct(1)).toBe("100%");
    expect(pct(0)).toBe("0%");
    expect(pct(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
  });

  it("colours by how good the rate is, and stays neutral when unknown", () => {
    expect(rateTone(0.95)).toContain("emerald");
    expect(rateTone(0.8)).toContain("amber");
    expect(rateTone(0.4)).toContain("red");
    expect(rateTone(null)).toBe("");
  });
});

describe("runsOf", () => {
  const runs = [
    run("r1", "ag-a", 0.5, "2026-09-18T10:00:00Z"),
    run("r2", "ag-a", 0.9, "2026-09-20T10:00:00Z"),
    run("r3", "ag-b", 0.7, "2026-09-19T10:00:00Z"),
  ];
  it("returns one agent's runs, newest first", () => {
    expect(runsOf(runs, "ag-a").map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(runsOf(runs, "ag-b").map((r) => r.id)).toEqual(["r3"]);
    expect(runsOf(runs, "ag-none")).toEqual([]);
  });
});

describe("gate reading", () => {
  it("takes the verdict the worker recorded on the run, not a guess from the pass rate", () => {
    expect(gateVerdict({ id: "r", agentId: "a", status: "completed", passRate: 0.2, tags: ["gate:fail"] })).toBe("fail");
    expect(gateVerdict({ id: "r", agentId: "a", status: "completed", passRate: 0.8, tags: ["gate:warn"] })).toBe("warn");
    expect(gateVerdict({ id: "r", agentId: "a", status: "completed", passRate: 0.99, tags: ["gate:pass"] })).toBe("pass");
    // A run from before the gate existed carries no verdict, and must not be read as a pass.
    expect(gateVerdict({ id: "r", agentId: "a", status: "completed", passRate: 0.99, tags: [] })).toBeNull();
    expect(gateVerdict(undefined)).toBeNull();
  });

  it("reads the gate's overall threshold from thresholdOverrides.passRate only", () => {
    expect(gateThreshold({ agentId: "a", thresholdOverrides: { passRate: 0.9, faithfulness: 0.7 } })).toBe(0.9);
    // Per-metric keys are separate rules, never the overall threshold.
    expect(gateThreshold({ agentId: "a", thresholdOverrides: { faithfulness: 0.7 } })).toBeNull();
    expect(gateThreshold(undefined)).toBeNull();
  });
});

describe("page wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  const page = () => read("client", "src", "pages", "eval-studio-home.tsx");

  it("has no tabs and keeps the classic hub reachable", () => {
    expect(page()).not.toContain("TabsTrigger");
    expect(page()).toContain('href="/evals/classic"');
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('const Evals = lazy(() => import("@/pages/eval-studio-home"));');
    expect(app).toContain('<Route path="/evals/classic" component={EvalsClassic} />');
  });

  it("keeps every specialist tool reachable from the header", () => {
    const src = page();
    for (const href of ["/evals/datasets", "/evals/metrics", "/evals/regression", "/evals/monitor", "/evals/synthesizer", "/evals/simulator", "/evals/redteam", "/evals/annotate", "/evals/reports", "/evals/prompts", "/evals/marketplace", "/evals/runs"]) {
      expect(src).toContain(href);
    }
  });

  it("reads the fields an Eval Studio run actually has", () => {
    const src = page();
    expect(src).toContain("last.passedCount ?? 0} of {last.totalGoldens ?? 0} cases passed");
    for (const wrong of ["totalCases", "passedCases", "failedCases", "minPassRate"]) expect(src).not.toContain(wrong);
  });

  it("says an agent has no run instead of showing it as zero", () => {
    expect(page()).toContain('{last ? pct(last.passRate) : "no run"}');
    expect(page()).toContain("This agent has never been evaluated.");
  });
});
