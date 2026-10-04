/**
 * The decision execution kind, everywhere it is named outside the engine:
 * the shared classifier and cost model, the compiler's warnings, the node-type
 * registry, the run monitor's words, and the blueprint invariants.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyStep, explainKind, estimateFlowCost, decisionBranchesFor } from "../shared/flow-execution-kind";
import { stepKindLabel, runsWithoutAModel } from "../shared/run-step-kind";
import { TEAM_NODE_TYPES, isTeamNodeType, missingRequirement, nodeTypeLabel } from "../shared/team-node-types";
import type { ProcessFlowGraph, ProcessNode } from "@shared/process-flow";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));
const db = vi.hoisted(() => ({ nodes: [] as any[], edges: [] as any[] }));
vi.mock("../server/storage", () => ({
  storage: {
    getTeamBlueprintNodes: vi.fn(async () => db.nodes),
    getTeamBlueprintEdges: vi.fn(async () => db.edges),
    listAgentsByBlueprintId: vi.fn(async () => []),
    listDagExecutionRunsByTeamAgent: vi.fn(async () => []),
  },
}));

const { compileProcessFlow } = await import("../server/process-flow-compile");
const { checkBlueprintInvariants } = await import("../server/blueprint-invariants");

const decision = (config: Record<string, unknown> = {}): ProcessNode => ({ id: "d1", type: "make_decision", label: "Endorsement Accepted?", description: "Was it accepted?", config } as ProcessNode);
const branches = [
  { id: "e1", from: "d1", to: "n2", label: "Approved", condition: "Endorsement approved" },
  { id: "e2", from: "d1", to: "n3", label: "Rejected", condition: "Endorsement rejected" },
];

describe("classifyStep — the decision kind", () => {
  it("is off unless the flag or the step opts in", () => {
    expect(classifyStep(decision(), { outgoingEdges: branches })).toBe("agent");
    expect(classifyStep(decision(), { outgoingEdges: branches, decisionKind: true })).toBe("decision");
    expect(classifyStep(decision({ decisionKind: true }), { outgoingEdges: branches })).toBe("decision");
    // The step's own word wins over the flag, both ways.
    expect(classifyStep(decision({ decisionKind: false }), { outgoingEdges: branches, decisionKind: true })).toBe("agent");
  });

  it("needs two or more labelled branches, and the branches to be known at all", () => {
    expect(classifyStep(decision(), { outgoingEdges: [branches[0]], decisionKind: true })).toBe("agent");
    expect(classifyStep(decision(), { decisionKind: true })).toBe("agent");
    expect(classifyStep(decision({ decisionKind: true }))).toBe("agent");
    // A branch with only a condition is named by it.
    expect(classifyStep(decision(), { outgoingEdges: [{ to: "a", condition: "approved" }, { to: "b", condition: "rejected" }], decisionKind: true })).toBe("decision");
    expect(decisionBranchesFor([{ to: "a", label: " Approved " }, { to: "b", condition: "rejected" }, { to: "c" }])).toEqual([
      { label: "Approved", to: "a" }, { label: "rejected", condition: "rejected", to: "b" },
    ]);
  });

  it("only applies to a drawn decision", () => {
    expect(classifyStep({ type: "ai_reasoning", config: {} } as ProcessNode, { outgoingEdges: branches, decisionKind: true })).toBe("agent");
    expect(explainKind(decision(), { outgoingEdges: branches, decisionKind: true })).toContain("exactly one branch");
  });
});

describe("estimateFlowCost — a decision step", () => {
  const flow: Pick<ProcessFlowGraph, "nodes" | "edges"> = {
    nodes: [
      { id: "n1", type: "trigger", label: "Start" }, decision(),
      { id: "n2", type: "take_action", label: "File" }, { id: "n3", type: "take_action", label: "Escalate" }, { id: "n9", type: "end", label: "Done" },
    ] as ProcessNode[],
    edges: [{ id: "e0", from: "n1", to: "d1" }, ...branches],
  };
  it("counts the step once and its branches not at all", () => {
    const off = estimateFlowCost(flow);
    expect(off.byKind.agent).toBe(3);
    expect(off.aiRoutedEdges).toBe(2);
    expect(off.decisionSteps).toBe(0);
    const on = estimateFlowCost(flow, { decisionKind: true });
    expect(on.byKind.decision).toBe(1);
    expect(on.byKind.agent).toBe(2);
    expect(on.aiRoutedEdges).toBe(0);
    expect(on.decisionSteps).toBe(1);
    expect(on.minModelCalls).toBe(2);
    expect(on.approxUsdPerRun).toBeLessThan(off.approxUsdPerRun);
  });
});

describe("compileProcessFlow — a decision step", () => {
  const graph = (config: Record<string, unknown> = {}): ProcessFlowGraph => ({
    version: 2, name: "Endorsement",
    nodes: [
      { id: "n1", type: "trigger", label: "Start", description: "", actor: "System" }, { ...decision(config), actor: "AI" },
      { id: "n2", type: "take_action", label: "File", description: "", actor: "System" }, { id: "n3", type: "take_action", label: "Escalate", description: "", actor: "System" },
      { id: "n9", type: "end", label: "Done", description: "", actor: "System" },
    ] as any,
    edges: [{ id: "e0", from: "n1", to: "d1" }, ...branches, { id: "e8", from: "n2", to: "n9" }, { id: "e9", from: "n3", to: "n9" }],
  } as ProcessFlowGraph);

  it("stops warning that its branches need a model, and reports the kind", () => {
    const off = compileProcessFlow(graph());
    expect(off.issues.filter((i) => i.code === "ai_routed_decision")).toHaveLength(2);
    expect(off.stepKinds.find((s) => s.nodeId === "d1")?.kind).toBe("agent");
    const on = compileProcessFlow(graph(), { decisionKind: true });
    expect(on.issues.filter((i) => i.code === "ai_routed_decision")).toHaveLength(0);
    expect(on.stepKinds.find((s) => s.nodeId === "d1")?.kind).toBe("decision");
    expect(on.cost.decisionSteps).toBe(1);
    // The step's own opt-in does the same without the flag.
    expect(compileProcessFlow(graph({ decisionKind: true })).stepKinds.find((s) => s.nodeId === "d1")?.kind).toBe("decision");
  });
});

describe("the node-type registry and the run monitor's words", () => {
  it("accepts a decision node and requires its branches", () => {
    expect(TEAM_NODE_TYPES).toContain("decision");
    expect(isTeamNodeType("decision")).toBe(true);
    expect(nodeTypeLabel("decision")).toBe("Decision");
    expect(missingRequirement({ nodeType: "decision", config: {} })).toBe("has fewer than two branches to decide between");
    expect(missingRequirement({ nodeType: "decision", config: { decision: { question: "q", options: [{ label: "A" }] } } })).toBe("has fewer than two branches to decide between");
    expect(missingRequirement({ nodeType: "decision", config: { decision: { question: "q", options: [{ label: "A" }, { label: "B" }] } } })).toBeNull();
    // A scale decision answers from its levels, not options (the live Score Completeness step was refused on this).
    expect(missingRequirement({ nodeType: "decision", config: { decision: { question: "q", answerType: "score", levels: ["Incomplete", "Partial", "Complete"] } } })).toBeNull();
    expect(missingRequirement({ nodeType: "decision", config: { decision: { question: "q", answerType: "score", levels: ["Only"] } } })).toBe("has fewer than two levels on its scale");
    expect(missingRequirement({ nodeType: "decision", config: { decision: { question: "q", answerType: "score", levels: Array.from({ length: 11 }, (_, i) => String(i)) } } })).toBe("has fewer than two levels on its scale");
  });

  it("calls a decision a decision, and does not claim it runs without a model", () => {
    expect(stepKindLabel({ kind: "agent", nodeType: "decision" })).toBe("Decision");
    expect(stepKindLabel({ kind: "gate", nodeType: "decision" })).toBe("Approval step");
    expect(runsWithoutAModel({ kind: "agent", nodeType: "decision" })).toBe(false);
  });
});

describe("checkBlueprintInvariants — a decision node", () => {
  beforeEach(() => {
    db.nodes = [
      { id: "d", label: "Endorsement Accepted?", nodeType: "decision", stateKey: "endorsement_accepted", config: { decision: { question: "q", options: [{ label: "Approved" }, { label: "Rejected" }] } } },
      { id: "a", label: "File it", nodeType: "internal_agent", stateKey: "file_it", config: {} },
      { id: "b", label: "Escalate", nodeType: "internal_agent", stateKey: "escalate", config: {} },
    ];
    db.edges = [
      { id: "d-a", sourceNodeId: "d", targetNodeId: "a", condition: "Endorsement approved", evaluationMode: "decision", rule: null, label: "Approved" },
      { id: "d-b", sourceNodeId: "d", targetNodeId: "b", condition: "Endorsement rejected", evaluationMode: "decision", rule: null, label: "Rejected" },
    ];
  });

  it("is not a decision with no way through: one branch is always taken", async () => {
    const check = await checkBlueprintInvariants("bp-1");
    expect(check.runnable).toBe(true);
    expect(check.findings.map((f) => f.kind)).not.toContain("no_fallback_branch");
    expect(check.findings.map((f) => f.kind)).not.toContain("branch_judged_by_model");
  });
});
