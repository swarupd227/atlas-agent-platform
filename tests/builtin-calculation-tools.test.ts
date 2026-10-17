import { describe, it, expect } from "vitest";
import {
  BUILTIN_CALCULATION_SERVER_ID,
  LOSS_FORECAST_TOOL,
  skillGrantsCalculationTools,
  calculationToolsForSkills,
  isBuiltinCalculationTool,
  executeBuiltinCalculationTool,
  probabilityOfLoss,
  combineProbabilities,
  linearRegression,
  normalInterval,
  asFraction,
} from "../server/builtin-calculation-tools";

const skill = (markdownBody: string, status = "active") => ({ id: "s1", name: "Loss Forecasting", status, markdownBody } as any);
const ctx = { orgId: "org", agentId: "agent" };

describe("granting: a skill grants loss_forecast by naming it", () => {
  it("offers the tool only when an active skill names it", () => {
    expect(skillGrantsCalculationTools(skill("Step 3: call loss_forecast with method=regression."))).toBe(true);
    expect(skillGrantsCalculationTools(skill("Forecast the losses in prose."))).toBe(false);
    expect(skillGrantsCalculationTools(skill("call loss_forecast", "draft"))).toBe(false);
    expect(skillGrantsCalculationTools(skill("loss_forecasting is a discipline"))).toBe(false);
    expect(calculationToolsForSkills([skill("prose only")])).toEqual([]);
    const tools = calculationToolsForSkills([skill("prose only"), skill("use loss_forecast")]);
    expect(tools.map((t) => t.toolName)).toEqual([LOSS_FORECAST_TOOL]);
    expect(tools[0].serverId).toBe(BUILTIN_CALCULATION_SERVER_ID);
    expect(isBuiltinCalculationTool(tools[0])).toBe(true);
    expect(isBuiltinCalculationTool({ ...tools[0], serverId: "builtin:document" })).toBe(false);
  });
});

describe("probability analysis (the chapter's figures)", () => {
  it("P = X / N: 100 damaged vehicles out of 500 is 0.2", () => {
    const r = probabilityOfLoss(100, 500);
    expect("probability" in r && r.probability).toBe(0.2);
    expect("arithmetic" in r && r.arithmetic[0]).toContain("100 / 500 = 0.2");
  });
  it("refuses more events than exposure units and a zero base", () => {
    expect("error" in probabilityOfLoss(600, 500)).toBe(true);
    expect("error" in probabilityOfLoss(1, 0)).toBe(true);
  });
  it("independent events multiply: 0.05 x 0.04 = 0.002", () => {
    const r = combineProbabilities("independent_product", [0.05, 0.04]);
    expect("probability" in r && r.probability).toBe(0.002);
  });
  it("dependent events use the conditional probability, not the unconditional one: 0.05 x 0.24 = 0.012", () => {
    const r = combineProbabilities("conditional_product", [0.05, 0.04], 0.24);
    expect("probability" in r && r.probability).toBe(0.012);
    expect("arithmetic" in r && r.arithmetic.join("\n")).toContain("0.05 x 0.04 = 0.002 would understate");
    expect("error" in combineProbabilities("conditional_product", [0.05])).toBe(true);
  });
  it("mutually exclusive events add: 0.01 + 0.02 = 0.03, and a sum over 1 is refused", () => {
    const r = combineProbabilities("exclusive_sum", [0.01, 0.02]);
    expect("probability" in r && r.probability).toBe(0.03);
    expect("error" in combineProbabilities("exclusive_sum", [0.6, 0.7])).toBe(true);
  });
  it("at least one of two independent events subtracts the overlap: 0.04 + 0.03 - 0.0012 = 0.0688", () => {
    const r = combineProbabilities("union", [0.04, 0.03]);
    expect("probability" in r && r.probability).toBe(0.0688);
    expect("arithmetic" in r && r.arithmetic.join("\n")).toContain("double count");
    const three = combineProbabilities("union", [0.5, 0.5, 0.5]);
    expect("probability" in three && three.probability).toBe(0.875);
  });
  it("reads 5 as 5 percent and says so; refuses 150", () => {
    expect(asFraction(5, "p")).toEqual({ value: 0.05, note: "p 5 read as 5 percent (0.05)." });
    expect("error" in asFraction(150, "p")).toBe(true);
    const r = combineProbabilities("independent_product", [5, 4]);
    expect("probability" in r && r.probability).toBe(0.002);
  });
});

describe("regression analysis (payroll against claims)", () => {
  // The golden case's table: five years of payroll (thousands) and workers
  // compensation claims. Hand-checked: B1 0.0986, B0 -0.74, R-square 0.9976,
  // forecast at 2,000 = 196.5.
  const x = [1200, 1350, 1500, 1700, 1850];
  const y = [118, 131, 149, 166, 182];
  it("fits slope, intercept and R-square and forecasts the next year", () => {
    const r = linearRegression(x, y, [2000]);
    if ("error" in r) throw new Error(r.error);
    expect(r.slope).toBeCloseTo(0.0986, 4);
    expect(r.intercept).toBeCloseTo(-0.74, 2);
    expect(r.rSquare).toBeCloseTo(0.9976, 3);
    expect(r.predictions[0].forecast).toBeCloseTo(196.5, 1);
    expect(r.predictions[0].interval.lower).toBeLessThan(196.5);
    expect(r.predictions[0].interval.upper).toBeGreaterThan(196.5);
    expect(r.predictions[0].extrapolated).toBe(true);
    expect(r.fitQuality).toBe("close");
    expect(r.arithmetic.some((l) => l.includes("extrapolation"))).toBe(true);
  });
  it("calls a scattered relationship weak and refuses too few points or a flat x", () => {
    const r = linearRegression([1, 2, 3, 4, 5, 6], [10, 3, 9, 2, 8, 4]);
    expect(!("error" in r) && r.fitQuality).toBe("weak");
    expect("error" in linearRegression([1, 2], [1, 2])).toBe(true);
    expect("error" in linearRegression([3, 3, 3], [1, 2, 3])).toBe(true);
    expect("error" in linearRegression([1, 2, 3], [1, 2])).toBe(true);
  });
});

describe("distribution forecast", () => {
  it("95 percent of years fall within mean +/- 1.96 sd: 100 and 10 give 80.4 to 119.6", () => {
    const r = normalInterval(100, 10, 95, 2500, 10);
    if ("error" in r) throw new Error(r.error);
    expect(r.lower).toBe(80.4);
    expect(r.upper).toBe(119.6);
    expect(r.expectedLoss).toBe(250000);
    expect(r.lossInterval).toEqual({ lower: 201000, upper: 299000 });
    expect(r.arithmetic.join("\n")).toContain("small sample");
  });
  it("uses 1.645 at 90 and 2.576 at 99, and names a missing sample size", () => {
    const r90 = normalInterval(100, 10, 90);
    const r99 = normalInterval(100, 10, 99);
    expect(!("error" in r90) && [r90.lower, r90.upper]).toEqual([83.55, 116.45]);
    expect(!("error" in r99) && [r99.lower, r99.upper]).toEqual([74.24, 125.76]);
    expect(!("error" in r90) && r90.arithmetic.join("\n")).toContain("sample size not given");
    expect("error" in normalInterval(100, -1)).toBe(true);
  });
});

describe("the tool entry point", () => {
  it("routes each method and returns, not throws, on a bad input", async () => {
    const p = await executeBuiltinCalculationTool(LOSS_FORECAST_TOOL, { method: "probability", events: 100, exposureUnits: 500, rule: "union", probabilities: [0.04, 0.03] }, ctx);
    expect(p.ok).toBe(true);
    expect(p.probability).toBe(0.2);
    expect(p.combined.probability).toBe(0.0688);
    expect(p.arithmetic.length).toBeGreaterThanOrEqual(3);
    const r = await executeBuiltinCalculationTool(LOSS_FORECAST_TOOL, { method: "regression", x: ["1200", "1350", "1500", "1700", "1850"], y: [118, 131, 149, 166, 182], predictAt: [2000], confidence: 90 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.predictions[0].interval.confidence).toBe(90);
    const d = await executeBuiltinCalculationTool(LOSS_FORECAST_TOOL, { method: "distribution", mean: 100, standardDeviation: 10 }, ctx);
    expect(d.ok).toBe(true);
    expect(d.confidence).toBe(95);
    const bad = await executeBuiltinCalculationTool(LOSS_FORECAST_TOOL, { method: "probability" }, ctx);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/needs events and exposureUnits/);
    const none = await executeBuiltinCalculationTool(LOSS_FORECAST_TOOL, { method: "montecarlo" }, ctx);
    expect(none.ok).toBe(false);
    await expect(executeBuiltinCalculationTool("other_tool", {}, ctx)).rejects.toThrow(/Unknown calculation tool/);
  });
});
