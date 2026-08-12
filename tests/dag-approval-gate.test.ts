/**
 * Human-approval gate nodes in the team-blueprint DAG engine.
 * Proves: computeWaves correctly carries a node's gateType into its plan
 * config (the wiring point executeNode's `nc.nodeType === "edge_gate" ||
 * nc.gateType` check depends on) and that a rejected gate halts the run
 * even under errorStrategy "best_effort", since there is no sensible
 * "continue anyway" for a decision nobody made.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn(),
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
    refAgentId: null,
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

describe("computeWaves — approval gate wiring", () => {
  it("carries gateType through into nodeConfig for an edge_gate node", () => {
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off" });
    const plan = computeWaves([gateNode], []);

    expect(plan.nodeConfig["gate-1"].nodeType).toBe("edge_gate");
    expect(plan.nodeConfig["gate-1"].gateType).toBe("approval");
  });

  it("defaults gateType to null for non-gate nodes", () => {
    const agentNode = node({ id: "agent-1", nodeType: "internal_agent", refAgentId: "agent-xyz" });
    const plan = computeWaves([agentNode], []);

    expect(plan.nodeConfig["agent-1"].gateType).toBeNull();
  });
});

describe("DAGExecutionEngine — approval gate execution", () => {
  it("halts the run when a gate is rejected, even under best_effort", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: false, reason: "Rejected by reviewer" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(false);
    expect(waitForApproval).toHaveBeenCalledWith(
      "team-1",
      "Manager Sign-off",
      "approval",
      expect.any(String),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it("continues past an approved gate and merges its result into state", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(true);
    expect(result.finalState.gate_result).toEqual({ approved: true, decidedBy: "user-1" });
  });

  it("fires onApprovalPending with the node id and created approval id before the wait resolves", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-123");
      return { approved: true, decidedBy: "user-1" };
    });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const onApprovalPending = vi.fn();
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalPending,
    });

    expect(onApprovalPending).toHaveBeenCalledWith("gate-1", "approval-123");
  });

  it("routes past a gate via a deterministic edge rule whose field doesn't match the gate's actual output shape", async () => {
    // Reproduces a live bug: an edge synced from Process Flow Studio carried
    // a deterministic rule authored against the gate's natural-language
    // condition ("Order confirmed by advisor" -> field "confirmed"), but
    // executeGateNode always emits {approved, decidedBy} -- never
    // "confirmed". The rule silently evaluated false forever, skipping
    // every wave downstream of an approval that had actually succeeded.
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "Expert Validator" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "dispatched" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Service Advisor Confirmation", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const mismatchedEdge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null,
      condition: "Order confirmed by advisor",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "confirmed", operator: "==", value: true }] },
      config: null,
    } as unknown as TeamBlueprintEdge;

    const plan = computeWaves([gateNode, downstream], [mismatchedEdge]);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    const nodes = result.waveResults.flatMap(w => w.nodes);
    expect(nodes.find(n => n.nodeId === "next-1")?.status).toBe("completed");
    expect(result.success).toBe(true);
  });

  it("skips past a gate via a deterministic edge rule whose field doesn't match, when the gate was rejected", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: false, decidedBy: "Expert Validator" });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "should not run" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Service Advisor Confirmation", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const mismatchedEdge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null,
      condition: "Order confirmed by advisor",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "confirmed", operator: "==", value: true }] },
      config: null,
    } as unknown as TeamBlueprintEdge;

    const plan = computeWaves([gateNode, downstream], [mismatchedEdge]);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(false);
  });
});
