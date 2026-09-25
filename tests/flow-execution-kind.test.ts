/**
 * What a business step costs, and when a branch condition can be decided without
 * a model. Both are the platform's answer to "every step becomes an LLM call":
 * the engine has always had free node types, and the conversion could not reach
 * them.
 */
import { describe, it, expect } from "vitest";
import { classifyStep, costsTokens, estimateFlowCost, explainKind } from "../shared/flow-execution-kind";
import { parseConditionToRule } from "../shared/condition-to-rule";
import { evaluateRule } from "../server/rule-evaluator";
import type { ProcessNode } from "../shared/process-flow";

const step = (type: string, config?: Record<string, unknown>): Pick<ProcessNode, "type" | "config"> =>
  ({ type: type as ProcessNode["type"], config });

describe("how a step will execute", () => {
  it("runs an authored expression in-process, not through a model", () => {
    expect(classifyStep(step("expression", { expression: "$sum(items.amount)" }))).toBe("expression");
    expect(costsTokens("expression")).toBe(false);
  });

  it("leaves an unconfigured expression step as an agent rather than failing the run", () => {
    // The engine fails an expression node with no expression, so demoting it
    // would turn an unfinished step into a broken one.
    expect(classifyStep(step("expression", {}))).toBe("agent");
    expect(classifyStep(step("expression", { expression: "   " }))).toBe("agent");
  });

  it("answers a bound-knowledge lookup by retrieval", () => {
    expect(classifyStep(step("get_info", { kbId: "kb-1", kbName: "Policies" }))).toBe("knowledge_base");
  });

  it("keeps the agent when a skill is bound too -- the skill shapes judgement", () => {
    expect(classifyStep(step("get_info", { kbId: "kb-1", skillId: "sk-1" }))).toBe("agent");
  });

  it("calls a bound tool directly", () => {
    expect(classifyStep(step("take_action", { toolName: "snow_add_work_note", toolServerId: "srv-1" }))).toBe("tool_call");
    expect(classifyStep(step("send_notification", { toolName: "send_email", toolServerId: "srv-1" }))).toBe("tool_call");
  });

  it("needs a tool's server as well as its name, so a half-configured step stays an agent", () => {
    expect(classifyStep(step("take_action", { toolName: "snow_add_work_note" }))).toBe("agent");
  });

  it("honours the author's explicit deterministic switch, and nothing less", () => {
    expect(classifyStep(step("ai_reasoning", { skillId: "sk-1" }))).toBe("agent");
    expect(classifyStep(step("ai_reasoning", { skillId: "sk-1", deterministic: true }))).toBe("skill");
    expect(classifyStep(step("ai_reasoning", { skillId: "sk-1", deterministic: "yes" }))).toBe("agent");
  });

  it("treats markers as structural and approvals as human", () => {
    expect(classifyStep(step("trigger"))).toBe("structural");
    expect(classifyStep(step("end"))).toBe("structural");
    expect(classifyStep(step("expert_approval"))).toBe("gate");
  });

  it("leaves genuine judgement alone", () => {
    expect(classifyStep(step("ai_reasoning", {}))).toBe("agent");
    expect(classifyStep(step("make_decision", {}))).toBe("agent");
    expect(explainKind(step("ai_reasoning", {}))).toContain("one model call");
  });
});

describe("what a flow will cost per run", () => {
  const flow = {
    nodes: [
      { id: "n1", type: "trigger", label: "Change raised" },
      { id: "n2", type: "get_info", label: "Read the change", config: { kbId: "kb-1" } },
      { id: "n3", type: "expression", label: "Score it", config: { expression: "count" } },
      { id: "n4", type: "ai_reasoning", label: "Assess exposure" },
      { id: "n5", type: "expert_approval", label: "Review" },
      { id: "n6", type: "take_action", label: "Post the note", config: { toolName: "note", toolServerId: "s1" } },
      { id: "n7", type: "end", label: "Done" },
    ] as ProcessNode[],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n4", to: "n5", condition: "riskScore > 70" },
      { id: "e3", from: "n5", to: "n6", label: "Approved" },
    ],
  };

  it("counts only the steps that reach a model", () => {
    const cost = estimateFlowCost(flow);
    expect(cost.modelSteps).toBe(1);
    expect(cost.freeSteps).toBe(3);
    expect(cost.byKind.gate).toBe(1);
    expect(cost.byKind.structural).toBe(2);
  });

  it("counts a conditional edge as a model call only when its condition needs one", () => {
    // "riskScore > 70" is parsed into a rule at build time, so it never reaches a
    // model; the label-only "Approved" branch does. Counting both overstated the
    // cost of exactly the flows an author had phrased well.
    const cost = estimateFlowCost(flow);
    expect(cost.aiRoutedEdges).toBe(1);
    expect(cost.minModelCalls).toBe(2);
    expect(cost.approxUsdPerRun).toBeGreaterThan(0);
  });

  it("counts a branch that genuinely needs judging", () => {
    const judged = {
      ...flow,
      edges: [{ id: "e9", from: "n4", to: "n5", condition: "the write-up reads as balanced" }],
    };
    expect(estimateFlowCost(judged as any).aiRoutedEdges).toBe(1);
  });

  it("stops counting an edge once it carries a rule", () => {
    const withRule = {
      ...flow,
      edges: flow.edges.map((e) => (e.id === "e2" ? { ...e, rule: { combinator: "AND", conditions: [] } } : e)),
    };
    expect(estimateFlowCost(withRule as any).aiRoutedEdges).toBe(1);  // the label-only branch remains
  });

  it("prices a twenty-step judgement flow as the twenty model calls it is", () => {
    const twenty = {
      nodes: Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, type: "ai_reasoning", label: `Step ${i}` })) as ProcessNode[],
      edges: [],
    };
    const cost = estimateFlowCost(twenty);
    expect(cost.modelSteps).toBe(20);
    expect(cost.approxUsdPerRun).toBeGreaterThan(2);
  });
});

describe("a condition the engine can decide for itself", () => {
  const leaf = (rule: ReturnType<typeof parseConditionToRule>) => (rule!.conditions[0] as any);

  it("reads the symbolic comparisons", () => {
    expect(leaf(parseConditionToRule("amount > 50000"))).toEqual({ field: "amount", operator: ">", value: 50000 });
    expect(leaf(parseConditionToRule("riskScore >= 0.8"))).toEqual({ field: "riskScore", operator: ">=", value: 0.8 });
    expect(leaf(parseConditionToRule("status != Retired"))).toEqual({ field: "status", operator: "!=", value: "Retired" });
  });

  it("reads the way people actually write them", () => {
    expect(leaf(parseConditionToRule("if the invoice amount is greater than $50,000"))).toEqual({ field: "invoiceAmount", operator: ">", value: 50000 });
    expect(leaf(parseConditionToRule("when tier is at least 2"))).toEqual({ field: "tier", operator: ">=", value: 2 });
    expect(leaf(parseConditionToRule("description contains \"urgent\""))).toEqual({ field: "description", operator: "contains", value: "urgent" });
  });

  it("reads a bare boolean, which is what a gate's own output looks like", () => {
    expect(leaf(parseConditionToRule("approved"))).toEqual({ field: "approved", operator: "==", value: true });
    expect(leaf(parseConditionToRule("not approved"))).toEqual({ field: "approved", operator: "==", value: false });
    expect(leaf(parseConditionToRule("isEscalated"))).toEqual({ field: "isEscalated", operator: "==", value: true });
  });

  it("will not turn a branch name into a field no step writes", () => {
    // "Rejected" as a bare word would become `Rejected == true` -- a field
    // nothing sets, so the branch would silently never fire. A model call is
    // the better outcome.
    expect(parseConditionToRule("Rejected")).toBeNull();
    expect(parseConditionToRule("Needs rework")).toBeNull();
  });

  it("refuses genuine judgement, so the model keeps deciding", () => {
    expect(parseConditionToRule("the customer seems dissatisfied")).toBeNull();
    expect(parseConditionToRule("the assessment looks complete enough to send")).toBeNull();
    expect(parseConditionToRule("")).toBeNull();
    expect(parseConditionToRule(null)).toBeNull();
  });

  it("refuses a compound condition rather than routing on half of it", () => {
    expect(parseConditionToRule("amount > 50000 and region is EU")).toBeNull();
  });

  it("produces rules the engine's own evaluator accepts", () => {
    const rule = parseConditionToRule("amount > 50000")!;
    expect(evaluateRule(rule, { amount: 60000 }).result).toBe(true);
    expect(evaluateRule(rule, { amount: 10 }).result).toBe(false);
    const approved = parseConditionToRule("approved")!;
    expect(evaluateRule(approved, { approved: true }).result).toBe(true);
  });
});
