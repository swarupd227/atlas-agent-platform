/**
 * The conversion from a business flow to a runnable team could only ever emit
 * `internal_agent` and `edge_gate`, so an authored Expression step was handed to
 * a language model to do arithmetic. These are the rules that decide what a
 * worker proposal becomes instead, read off the module's own source and its
 * shared classifier -- the build itself needs a database, so the contract is
 * asserted where it is decided.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { teamAgentProposalSchema } from "../server/team-build";
import { classifyStep } from "../shared/flow-execution-kind";
import { parseConditionToRule } from "../shared/condition-to-rule";

const source = readFileSync(join(__dirname, "..", "server", "team-build.ts"), "utf8").replace(/\r\n/g, "\n");

describe("what a worker proposal may say about running without a model", () => {
  it("accepts each of the engine's zero-token kinds", () => {
    for (const execution of [
      { kind: "expression", expression: "$sum(items.amount)" },
      { kind: "knowledge_base", knowledgeBaseId: "kb-1", knowledgeBaseQuery: "retention policy" },
      { kind: "skill", skillId: "sk-1" },
      { kind: "tool_call", toolServerId: "srv-1", toolName: "snow_add_work_note", toolArgs: { ci: { $expr: "targetSysId" } } },
    ]) {
      const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", execution });
      expect(parsed.success, JSON.stringify(execution)).toBe(true);
    }
  });

  it("rejects a kind the engine has no node for, rather than building a dead node", () => {
    const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", execution: { kind: "http_request" } });
    expect(parsed.success).toBe(false);
  });

  it("keeps the flow step labels, which is how an authored step reaches the builder", () => {
    const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", flowStepLabels: ["Score the claim"] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.flowStepLabels).toEqual(["Score the claim"]);
  });
});

describe("the node a step becomes", () => {
  it("no longer hardcodes internal_agent at the worker node sites", () => {
    // Both worker-node paths (tiered and flat) must consult the descriptor.
    const hardcoded = source.match(/nodeType: isGate \? "edge_gate" : "internal_agent"/g) ?? [];
    expect(hardcoded).toHaveLength(0);
    expect(source.match(/nodeType: isGate \? "edge_gate" : det \? det\.nodeType : "internal_agent"/g) ?? []).toHaveLength(2);
  });

  it("holds no agent reference on a node that runs no agent", () => {
    expect(source).toContain("refAgentId: isGate || det ? null : worker.id");
    expect(source).toContain("refAgentId: isGate || det ? null : createdWorkers[i].id");
  });

  it("prefers the step the author configured over the proposal's prose", () => {
    expect(source).toContain("const exec = proposal?.execution ?? executionFromAuthoredStep(proposal, stepsByLabel);");
  });

  it("only derives from an authored step when the agent covers exactly that one", () => {
    expect(source).toContain("if (labels.length !== 1) return null;");
  });

  it("falls back to an agent when a descriptor is incomplete", () => {
    // An expression node with no expression fails the run; an agent merely costs
    // money. The cheap failure is the wrong one to choose.
    expect(source).toContain('text(exec.expression) ? { nodeType: "expression"');
    expect(source).toContain('text(exec.toolServerId) && text(exec.toolName)');
  });

  it("classifies the authored steps the derivation reads", () => {
    // The same classifier the compiler reports with, so the canvas's "free" badge
    // and the built node can never disagree.
    expect(classifyStep({ type: "expression", config: { expression: "a" } } as any)).toBe("expression");
    expect(classifyStep({ type: "take_action", config: { toolName: "t", toolServerId: "s" } } as any)).toBe("tool_call");
  });
});

describe("a branch the engine can decide for itself", () => {
  it("parses a comparison into a rule instead of paying a model per run", () => {
    expect(source).toContain("const parsed = parseConditionToRule(spec.branchCondition);");
    expect(source).toContain('if (parsed) return { condition: spec.branchCondition, evaluationMode: "deterministic", rule: parsed };');
  });

  it("still leaves judgement to the model", () => {
    expect(parseConditionToRule("the write-up reads as balanced")).toBeNull();
    expect(source).toContain('return { condition: spec.branchCondition, evaluationMode: "ai" };');
  });
});
