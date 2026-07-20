import { describe, it, expect } from "vitest";
import { evaluateRule } from "../server/rule-evaluator";
import type { RuleGroup } from "@shared/schema";

describe("evaluateRule", () => {
  it("evaluates a single leaf comparison", () => {
    const rule: RuleGroup = { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] };
    const t = evaluateRule(rule, { amount: 12500 });
    expect(t.result).toBe(true);
    expect(t.inputs.amount).toBe(12500);
    expect(t.reason).toContain("amount");
  });

  it("evaluates AND compound rules", () => {
    const rule: RuleGroup = {
      combinator: "AND",
      conditions: [
        { field: "amount", operator: ">", value: 10000 },
        { field: "vendorApproved", operator: "==", value: true },
      ],
    };
    expect(evaluateRule(rule, { amount: 12000, vendorApproved: true }).result).toBe(true);
    expect(evaluateRule(rule, { amount: 12000, vendorApproved: false }).result).toBe(false);
    expect(evaluateRule(rule, { amount: 5000, vendorApproved: true }).result).toBe(false);
  });

  it("evaluates OR compound rules", () => {
    const rule: RuleGroup = {
      combinator: "OR",
      conditions: [
        { field: "amount", operator: ">", value: 10000 },
        { field: "duplicateInvoice", operator: "==", value: true },
      ],
    };
    expect(evaluateRule(rule, { amount: 500, duplicateInvoice: true }).result).toBe(true);
    expect(evaluateRule(rule, { amount: 500, duplicateInvoice: false }).result).toBe(false);
  });

  it("evaluates nested compound groups", () => {
    // (amount > 10000 AND NOT vendorApproved) OR duplicateInvoice == true
    const rule: RuleGroup = {
      combinator: "OR",
      conditions: [
        {
          combinator: "AND",
          conditions: [
            { field: "amount", operator: ">", value: 10000 },
            { field: "vendorApproved", operator: "==", value: false },
          ],
        },
        { field: "duplicateInvoice", operator: "==", value: true },
      ],
    };
    expect(evaluateRule(rule, { amount: 12000, vendorApproved: false, duplicateInvoice: false }).result).toBe(true);
    expect(evaluateRule(rule, { amount: 12000, vendorApproved: true, duplicateInvoice: false }).result).toBe(false);
    expect(evaluateRule(rule, { amount: 500, vendorApproved: true, duplicateInvoice: true }).result).toBe(true);
  });

  it("resolves dot-path fields into nested state", () => {
    const rule: RuleGroup = { combinator: "AND", conditions: [{ field: "extraction.vendorApproved", operator: "==", value: true }] };
    expect(evaluateRule(rule, { extraction: { vendorApproved: true } }).result).toBe(true);
  });

  it("handles missing fields without throwing", () => {
    const rule: RuleGroup = { combinator: "AND", conditions: [{ field: "nope.missing", operator: ">", value: 5 }] };
    const t = evaluateRule(rule, {});
    expect(t.result).toBe(false);
    expect(t.inputs["nope.missing"]).toBeUndefined();
  });

  it("supports contains/not_contains", () => {
    const rule: RuleGroup = { combinator: "AND", conditions: [{ field: "vendorName", operator: "contains", value: "acme" }] };
    expect(evaluateRule(rule, { vendorName: "Acme Corp" }).result).toBe(true);
    expect(evaluateRule(rule, { vendorName: "Other Corp" }).result).toBe(false);
  });

  // Regression: cloud UI E2E (claims triage) — the proposer wrote value "Low"
  // but the worker's structured output emitted "low"; case-sensitive equality
  // made BOTH decision branches unsatisfiable and skipped the entire flow.
  it("string equality ignores case and surrounding whitespace", () => {
    const low: RuleGroup = { combinator: "AND", conditions: [{ field: "fraudRiskLevel", operator: "==", value: "Low" }] };
    expect(evaluateRule(low, { fraudRiskLevel: "low" }).result).toBe(true);
    expect(evaluateRule(low, { fraudRiskLevel: " LOW " }).result).toBe(true);
    expect(evaluateRule(low, { fraudRiskLevel: "high" }).result).toBe(false);
    const notLow: RuleGroup = { combinator: "AND", conditions: [{ field: "fraudRiskLevel", operator: "!=", value: "Low" }] };
    expect(evaluateRule(notLow, { fraudRiskLevel: "low" }).result).toBe(false);
    expect(evaluateRule(notLow, { fraudRiskLevel: "high" }).result).toBe(true);
  });
});
