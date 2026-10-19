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
  FINANCIAL_ANALYSIS_TOOL,
  calculationToolsGrantedBy,
  asRate,
  presentValue,
  futureValue,
  netPresentValue,
  internalRateOfReturn,
  compareCoverageBids,
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

  it("grants each tool by its own name, in a fixed order", () => {
    expect(calculationToolsGrantedBy(skill("call financial_analysis with method=npv"))).toEqual([FINANCIAL_ANALYSIS_TOOL]);
    expect(calculationToolsGrantedBy(skill("loss_forecast first, then financial_analysis"))).toEqual([LOSS_FORECAST_TOOL, FINANCIAL_ANALYSIS_TOOL]);
    expect(calculationToolsGrantedBy(skill("financial_analysis_report is a document"))).toEqual([]);
    expect(calculationToolsForSkills([skill("use financial_analysis")]).map((t) => t.toolName)).toEqual([FINANCIAL_ANALYSIS_TOOL]);
    expect(calculationToolsForSkills([skill("use financial_analysis"), skill("use loss_forecast")]).map((t) => t.toolName)).toEqual([LOSS_FORECAST_TOOL, FINANCIAL_ANALYSIS_TOOL]);
  });
});

describe("time value of money (the chapter's figures)", () => {
  it("reads a rate as a fraction or a percent", () => {
    expect(asRate(0.05)).toEqual({ value: 0.05 });
    expect(asRate(5)).toEqual({ value: 0.05, note: "rate 5 read as 5 percent (0.05)." });
    expect("error" in asRate(150)).toBe(true);
    expect("error" in asRate("x")).toBe(true);
  });
  it("discounts and compounds a single amount: $100 at 4 percent is $104, and $100,000 a year out at 5 percent is $95,238", () => {
    const fv = futureValue(100, 0.04, 1); expect(!("error" in fv) && fv.futureValue).toBe(104);
    const fv2 = futureValue(100, 0.04, 2); expect(!("error" in fv2) && fv2.futureValue).toBe(108.16);
    const pv = presentValue(100000, 0.05, 1); expect(!("error" in pv) && pv.presentValue).toBe(95238.1);
    expect(!("error" in pv) && pv.arithmetic[0]).toContain("100000 / (1 + 0.05)^1");
    expect("error" in presentValue(100, 0.05, -1)).toBe(true);
  });
  it("NPV of the surveillance system: $40,000 for three years at 8 percent is $103,084 against $85,000, NPV $18,084, accept", () => {
    const r = netPresentValue(0.08, 85000, [40000, 40000, 40000]);
    if ("error" in r) throw new Error(r.error);
    expect(r.presentValueOfCashFlows).toBeCloseTo(103083.88, 1);
    expect(r.npv).toBeCloseTo(18083.88, 1);
    expect(r.accept).toBe(true);
    expect(r.periods.map((p) => p.presentValue)).toEqual([37037.04, 34293.55, 31753.29]);
    const bad = netPresentValue(0.25, 85000, [40000, 40000, 40000]);
    expect(!("error" in bad) && bad.accept).toBe(false);
    expect("error" in netPresentValue(0.08, 85000, [])).toBe(true);
  });
  it("IRR of the same project is 19.44 percent, above the 8 percent required rate; a project that never repays has none", () => {
    const r = internalRateOfReturn(85000, [40000, 40000, 40000], 0.08);
    if ("error" in r) throw new Error(r.error);
    expect(r.irrPercent).toBe(19.44);
    expect(r.accept).toBe(true);
    expect(r.arithmetic.join("\n")).toContain("exceeds the required rate of 8 percent");
    const high = internalRateOfReturn(85000, [40000, 40000, 40000], 0.25);
    expect(!("error" in high) && high.accept).toBe(false);
    const none = internalRateOfReturn(85000, [20000, 20000, 20000]);
    expect(!("error" in none) && none.irr).toBeNull();
  });
  it("compares the two coverage bids: A $185,238 against B $168,333, so B", () => {
    const r = compareCoverageBids(0.05, [{ name: "Insurer A", premium: 90000, deductible: 5000 }, { name: "Insurer B", premium: 35000, deductible: 10000 }], [{ count: 12, size: 5000 }, { count: 6, size: 10000 }, { count: 2 }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.expectedLosses).toBe(20);
    expect(r.bids.map((b) => [b.name, b.deductibleOutflow, b.presentValueOfDeductibles, b.presentValueOfExpectedOutflows])).toEqual([["Insurer A", 100000, 95238.1, 185238.1], ["Insurer B", 140000, 133333.33, 168333.33]]);
    expect(r.recommended).toBe("Insurer B");
    expect(r.arithmetic.some((l) => l.includes("Insurer B: deductibles = 12 x 5000 + 6 x 10000 + 2 x 10000 = 140000"))).toBe(true);
    expect("error" in compareCoverageBids(0.05, [{ name: "only", premium: 1, deductible: 1 }], [{ count: 1 }])).toBe(true);
    expect("error" in compareCoverageBids(0.05, [{ name: "a", premium: 1, deductible: 1 }, { name: "b", premium: 1, deductible: 1 }], [])).toBe(true);
  });
  it("routes financial_analysis methods and returns, not throws, on a bad input", async () => {
    const bid = await executeBuiltinCalculationTool(FINANCIAL_ANALYSIS_TOOL, { method: "bid_comparison", rate: 5, bids: [{ name: "A", premium: 90000, deductible: 5000 }, { name: "B", premium: 35000, deductible: 10000 }], lossBands: [{ count: 12, size: 5000 }, { count: 6, size: 10000 }, { count: 2 }] }, ctx);
    expect(bid.ok).toBe(true);
    expect(bid.recommended).toBe("B");
    expect(bid.arithmetic[0]).toBe("rate 5 read as 5 percent (0.05).");
    const npv = await executeBuiltinCalculationTool(FINANCIAL_ANALYSIS_TOOL, { method: "npv", rate: 0.08, cost: 85000, cashFlows: ["40000", "40000", "40000"] }, ctx);
    expect(npv.ok).toBe(true);
    expect(npv.npv).toBeCloseTo(18083.88, 1);
    const irr = await executeBuiltinCalculationTool(FINANCIAL_ANALYSIS_TOOL, { method: "irr", cost: 85000, cashFlows: [40000, 40000, 40000] }, ctx);
    expect(irr.ok).toBe(true);
    expect(irr.irrPercent).toBe(19.44);
    expect(irr.accept).toBeUndefined();
    const noRate = await executeBuiltinCalculationTool(FINANCIAL_ANALYSIS_TOOL, { method: "npv", cost: 1, cashFlows: [1] }, ctx);
    expect(noRate.ok).toBe(false);
    const unknown = await executeBuiltinCalculationTool(FINANCIAL_ANALYSIS_TOOL, { method: "payback" }, ctx);
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toMatch(/method must be/);
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
