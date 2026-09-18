/**
 * server/eval-regression.ts: the eval regression gate's baseline and drop rule,
 * and the worker using it within the run's organization.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { pickRegressionBaseline, regressionCheck } from "../server/eval-regression";

const runs = [
  { id: "r-new", status: "completed", passRate: 0.7, completedAt: "2026-09-18T10:00:00Z" },
  { id: "r-prev", status: "completed", passRate: 0.9, completedAt: "2026-09-17T10:00:00Z" },
  { id: "r-old", status: "completed", passRate: 0.95, completedAt: "2026-09-10T10:00:00Z" },
  { id: "r-failed", status: "failed", passRate: null, completedAt: "2026-09-18T09:00:00Z" },
  { id: "r-running", status: "running", passRate: null, startedAt: "2026-09-18T11:00:00Z" },
];

describe("pickRegressionBaseline", () => {
  it("is the most recent other completed run with a pass rate", () => {
    expect(pickRegressionBaseline(runs, "r-new")!.id).toBe("r-prev");
    expect(pickRegressionBaseline([runs[0]], "r-new")).toBeNull();
  });
});

describe("regressionCheck", () => {
  it("flags a drop beyond the window in percentage points", () => {
    const r = regressionCheck(0.9, 0.7, 5);
    expect(r.regressed).toBe(true);
    expect(r.dropPct).toBeCloseTo(20);
    expect(regressionCheck(0.9, 0.87, 5).regressed).toBe(false);
    expect(regressionCheck(0.9, 0.95, 5)).toMatchObject({ regressed: false });
    expect(regressionCheck(null, 0.5, 5)).toEqual({ dropPct: null, regressed: false });
  });
});

describe("eval worker regression gate", () => {
  it("looks up the baseline in the run's own organization", () => {
    const src = readFileSync(join(__dirname, "..", "server", "worker.ts"), "utf8");
    expect(src).toContain("storage.getEvalTestRuns({ agentId, organizationId: run.organizationId ?? undefined })");
    expect(src).toContain("pickRegressionBaseline(runHistory, runId)");
  });
});
