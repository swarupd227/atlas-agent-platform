/**
 * Conditional edge routing (deterministic rules + AI conditions) in
 * DAGExecutionEngine. Proves the gap this fills: computeWaves previously
 * built waves from pure graph topology and DAGExecutionEngine ran every node
 * in a wave unconditionally, silently ignoring TeamBlueprintEdge's
 * condition/evaluationMode/rule fields -- the same fields the graph editor's
 * EdgeConfigPanel lets a user configure. This mirrors the semantics already
 * proven in agent-runtime.ts's executeTeamPipeline: a node with no gating
 * incoming edges always runs; a node with gating edges runs if ANY of them
 * passes (OR), and is skipped (not failed) if none do.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: (outputs: Map<string, string>, labels: Map<string, string>) => {
    const state: Record<string, any> = {};
    for (const [nodeId, text] of Array.from(outputs.entries())) {
      const label = labels.get(nodeId) || nodeId;
      try {
        Object.assign(state, JSON.parse(text));
      } catch {
        state[label] = text;
      }
    }
    return state;
  },
}));

function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1",
    blueprintId: "bp1",
    nodeType: "internal_agent",
    label: "Node",
    positionX: 0,
    positionY: 0,
    refAgentId: "agent-1",
    refRemoteAgentId: null,
    refToolIds: [],
    refPolicyId: null,
    gateType: null,
    config: null,
    createdAt: new Date(),
    stateKey: "node_output",
    outputSchema: null,
    fallbackOutput: null,
    timeoutMs: 30000,
    retryPolicy: null,
    refTeamAgentId: null,
    outputContractId: null,
    refSkillId: null,
    ...overrides,
  } as TeamBlueprintNode;
}

function edge(overrides: Partial<TeamBlueprintEdge>): TeamBlueprintEdge {
  return {
    id: "e1",
    blueprintId: "bp1",
    sourceNodeId: "n1",
    targetNodeId: "n2",
    label: null,
    contentPartTypes: [],
    allowedMetadata: null,
    slaTimeoutMs: null,
    failureMode: null,
    retryPolicy: null,
    condition: null,
    evaluationMode: "ai",
    rule: null,
    config: null,
    ...overrides,
  } as unknown as TeamBlueprintEdge;
}

describe("computeWaves — incoming edge wiring", () => {
  it("marks an edge with a condition or deterministic rule as gating", () => {
    const a = node({ id: "a", stateKey: "a_out" });
    const b = node({ id: "b", stateKey: "b_out" });
    const gated = edge({ sourceNodeId: "a", targetNodeId: "b", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any });

    const plan = computeWaves([a, b], [gated]);
    expect(plan.incomingEdges["b"]).toHaveLength(1);
    expect(plan.incomingEdges["b"][0].sourceNodeId).toBe("a");
    expect(plan.incomingEdges["b"][0].isGating).toBe(true);
  });

  it("still records an unconditional edge (no condition, no rule), but marks it non-gating", () => {
    const a = node({ id: "a", stateKey: "a_out" });
    const b = node({ id: "b", stateKey: "b_out" });
    const plain = edge({ sourceNodeId: "a", targetNodeId: "b" });

    const plan = computeWaves([a, b], [plain]);
    expect(plan.incomingEdges["b"]).toHaveLength(1);
    expect(plan.incomingEdges["b"][0].isGating).toBe(false);
  });
});

describe("DAGExecutionEngine — conditional node execution", () => {
  it("runs a node whose deterministic gating rule passes", async () => {
    const amountCheck = node({ id: "check", stateKey: "check_out", refAgentId: "agent-check" });
    const gate = node({ id: "approval", stateKey: "approval_out", refAgentId: "agent-approval" });
    const highValueEdge = edge({
      sourceNodeId: "check", targetNodeId: "approval",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any,
    });
    const plan = computeWaves([amountCheck, gate], [highValueEdge]);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-check") return { success: true, output: JSON.stringify({ amount: 24750 }) };
      return { success: true, output: "approved" };
    });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    expect(result.success).toBe(true);
    const approvalNode = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "approval");
    expect(approvalNode?.status).toBe("completed");
  });

  it("skips (not fails) a node whose deterministic gating rule fails, and never calls its agent", async () => {
    const amountCheck = node({ id: "check", stateKey: "check_out", refAgentId: "agent-check" });
    const gate = node({ id: "approval", stateKey: "approval_out", refAgentId: "agent-approval" });
    const highValueEdge = edge({
      sourceNodeId: "check", targetNodeId: "approval",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any,
    });
    const plan = computeWaves([amountCheck, gate], [highValueEdge]);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-check") return { success: true, output: JSON.stringify({ amount: 4200 }) };
      return { success: true, output: "should not be called" };
    });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    expect(result.success).toBe(true);
    const approvalNode = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "approval");
    expect(approvalNode?.status).toBe("skipped");
    expect(executeWorkerAgent).not.toHaveBeenCalledWith("agent-approval", expect.anything(), expect.anything(), expect.anything());
  });

  it("runs a node when ANY of its multiple gating edges passes (OR semantics)", async () => {
    const a = node({ id: "a", stateKey: "a_out", refAgentId: "agent-a" });
    const b = node({ id: "b", stateKey: "b_out", refAgentId: "agent-b" });
    const target = node({ id: "target", stateKey: "target_out", refAgentId: "agent-target" });
    const edgeA = edge({ sourceNodeId: "a", targetNodeId: "target", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "flagA", operator: "==", value: true }] } as any });
    const edgeB = edge({ id: "e2", sourceNodeId: "b", targetNodeId: "target", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "flagB", operator: "==", value: true }] } as any });
    const plan = computeWaves([a, b, target], [edgeA, edgeB]);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-a") return { success: true, output: JSON.stringify({ flagA: false }) };
      if (agentId === "agent-b") return { success: true, output: JSON.stringify({ flagB: true }) };
      return { success: true, output: "ran" };
    });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    const targetNode = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "target");
    expect(targetNode?.status).toBe("completed");
  });

  it("always runs a node with no gating incoming edges", async () => {
    const root = node({ id: "root", stateKey: "root_out", refAgentId: "agent-root" });
    const plan = computeWaves([root], []);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "ran" });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    const rootNode = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "root");
    expect(rootNode?.status).toBe("completed");
  });

  it("runs a converging node via its unconditional edge even when its OTHER, unrelated gating edge fails", async () => {
    // The AP-invoice-demo topology: Amount Check branches to either the
    // approval gate (amount>10000) or directly to Payment (amount<=10000,
    // skipping the gate) -- and the gate ALSO points to Payment
    // unconditionally once approved. A high-value invoice must still reach
    // Payment via the gate's edge, even though its direct amount<=10000
    // edge into Payment independently evaluates false.
    const check = node({ id: "check", stateKey: "check_out", refAgentId: "agent-check" });
    const gate = node({ id: "gate", nodeType: "edge_gate", gateType: "approval", stateKey: "gate_out", label: "Approval Gate" });
    const payment = node({ id: "payment", stateKey: "payment_out", refAgentId: "agent-payment" });

    const highEdge = edge({ id: "e-high", sourceNodeId: "check", targetNodeId: "gate", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any });
    const lowEdge = edge({ id: "e-low", sourceNodeId: "check", targetNodeId: "payment", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: "<=", value: 10000 }] } as any });
    const gateToPayment = edge({ id: "e-gate-payment", sourceNodeId: "gate", targetNodeId: "payment" });

    const plan = computeWaves([check, gate, payment], [highEdge, lowEdge, gateToPayment]);

    const { executeWorkerAgent, waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-check") return { success: true, output: JSON.stringify({ amount: 24750 }) };
      return { success: true, output: "payment scheduled" };
    });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    const nodes = result.waveResults.flatMap(w => w.nodes);
    expect(nodes.find(n => n.nodeId === "gate")?.status).toBe("completed");
    expect(nodes.find(n => n.nodeId === "payment")?.status).toBe("completed");
    expect(result.success).toBe(true);
  });

  it("skips a converging node when BOTH its gating edge fails AND its unconditional edge's source was itself skipped", async () => {
    // Low-value invoice: the direct amount<=10000 edge should let Payment
    // run WITHOUT ever invoking the gate's agent.
    const check = node({ id: "check", stateKey: "check_out", refAgentId: "agent-check" });
    const gate = node({ id: "gate", nodeType: "edge_gate", gateType: "approval", stateKey: "gate_out", label: "Approval Gate" });
    const payment = node({ id: "payment", stateKey: "payment_out", refAgentId: "agent-payment" });

    const highEdge = edge({ id: "e-high", sourceNodeId: "check", targetNodeId: "gate", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any });
    const lowEdge = edge({ id: "e-low", sourceNodeId: "check", targetNodeId: "payment", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: "<=", value: 10000 }] } as any });
    const gateToPayment = edge({ id: "e-gate-payment", sourceNodeId: "gate", targetNodeId: "payment" });

    const plan = computeWaves([check, gate, payment], [highEdge, lowEdge, gateToPayment]);

    const { executeWorkerAgent, waitForApproval } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockClear();
    (waitForApproval as any).mockClear();
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-check") return { success: true, output: JSON.stringify({ amount: 4200 }) };
      return { success: true, output: "should not run for the gate" };
    });

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });

    const nodes = result.waveResults.flatMap(w => w.nodes);
    expect(nodes.find(n => n.nodeId === "gate")?.status).toBe("skipped");
    expect(nodes.find(n => n.nodeId === "payment")?.status).toBe("completed");
    expect(waitForApproval).not.toHaveBeenCalled();
  });
});
