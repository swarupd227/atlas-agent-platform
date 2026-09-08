/**
 * Human-approval gate nodes in the team-blueprint DAG engine.
 * Proves: computeWaves correctly carries a node's gateType into its plan
 * config (the wiring point executeNode's `nc.nodeType === "edge_gate" ||
 * nc.gateType` check depends on) and that a rejected gate halts the run
 * even under errorStrategy "best_effort", since there is no sensible
 * "continue anyway" for a decision nobody made.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine, DagRunSupersededError } from "../server/dag-execution-engine";
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
    // executeGateNode forwards a 7th arg (config.resumePendingApprovalId, for
    // resuming a paused run into the same in-flight approval) -- unset here,
    // so undefined -- and an 8th (approvalMeta: the human-readable name and
    // description for the Approvals page). toHaveBeenCalledWith requires an
    // exact arg-count match, so this must list all 8 positions or the
    // assertion fails regardless of whether the first 6 are individually
    // correct.
    expect(waitForApproval).toHaveBeenCalledWith(
      "team-1",
      "Manager Sign-off",
      "approval",
      expect.any(String),
      expect.any(Number),
      expect.any(Function),
      undefined,
      expect.objectContaining({ objectName: expect.any(String), description: expect.any(String) }),
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

describe("DAGExecutionEngine — approval identity on the Approvals page", () => {
  // Live 2026-09-08: three pending gates from three runs of the same blueprint
  // all read "Manual Review Approval Gate", and the reviewer could not tell
  // which was which ("I can't make out with the IDs"). The name now carries
  // the team, the request and the run; the description leads with the artifact
  // being approved rather than a flat dump of the whole state.
  it("names the approval with team, request and run, and leads the description with the upstream output", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "the outline" });

    const producer = node({ id: "arch", refAgentId: "agent-arch", stateKey: "slide_outline" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manual Review", stateKey: "gate_result" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "arch", targetNodeId: "gate-1", label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([producer, gateNode], [edge]),
      stateSchema: {},
      initialState: { request: "Campaign brief — Operation Power Play.\nMarkets: DE/AT." },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      teamAgentName: "Marcom Deck Team",
      dagRunId: "9721c414-d419-4d73-8c10-d88b9620638c",
    });

    const meta = (waitForApproval as any).mock.calls.at(-1)[7];
    expect(meta.objectName).toBe("Manual Review · Marcom Deck Team · Campaign brief — Operation Power Play. · run 9721c414");
    // The thing being decided comes first, before any other state.
    expect(meta.description).toContain("--- FOR APPROVAL: slide_outline ---");
    expect(meta.description.indexOf("FOR APPROVAL")).toBeLessThan(meta.description.indexOf("Other context") === -1 ? Infinity : meta.description.indexOf("Other context"));
    expect(meta.description).toContain("the outline");
    expect(meta.description).toContain("Run: 9721c414-d419-4d73-8c10-d88b9620638c");
  });

  it("falls back to the bare gate label when the caller supplies no run identity", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([gateNode], []),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect((waitForApproval as any).mock.calls.at(-1)[7].objectName).toBe("Manager Sign-off");
  });
});

describe("DAGExecutionEngine — approval resume ownership (double-fire guard)", () => {
  // Reproduces a live bug: after a human approved a gate, the PATCH
  // fast-path resumed the run in a fresh strand while the original
  // in-process waiter (10s polling) also woke up and continued. Both
  // strands ran the downstream nodes; the loser then overwrote the
  // winner's "completed" with "failed". The engine now asks
  // onApprovalDecided whether this strand still owns the run and stands
  // down (DagRunSupersededError) when it doesn't.
  function gatePlan() {
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;
    return computeWaves([gateNode, downstream], [edge]);
  }

  it("stands down without running downstream nodes when another strand already claimed the resume, even under best_effort", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-777");
      return { approved: true, decidedBy: "user-1" };
    });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "should not run" });

    const onApprovalDecided = vi.fn().mockResolvedValue(false);
    const engine = new DAGExecutionEngine();
    await expect(engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalDecided,
    })).rejects.toBeInstanceOf(DagRunSupersededError);

    expect(onApprovalDecided).toHaveBeenCalledWith("gate-1", "approval-777");
    expect(executeWorkerAgent).not.toHaveBeenCalled();
  });

  it("continues normally when this strand wins the claim", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-778");
      return { approved: true, decidedBy: "user-1" };
    });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "ran" });

    const onApprovalDecided = vi.fn().mockResolvedValue(true);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalDecided,
    });

    expect(result.success).toBe(true);
    expect(executeWorkerAgent).toHaveBeenCalledTimes(1);
  });

  it("does not re-claim on a resumed strand, which already owns the run by construction", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "ran" });

    const onApprovalDecided = vi.fn().mockResolvedValue(false);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      resumeFromWave: 1,
      resumePendingApprovalId: "approval-779",
      onApprovalDecided,
    });

    expect(onApprovalDecided).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
