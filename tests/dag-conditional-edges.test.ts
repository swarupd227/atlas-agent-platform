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
import { computeWaves, DAGExecutionEngine, getRoutingFieldSpecs, agentNodeTimeoutMs, AGENT_NODE_MIN_TIMEOUT_MS } from "../server/dag-execution-engine";
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

describe("routing fields — the step before a rule-gated branch is told what to emit", () => {
  const search = node({ id: "search", label: "Account Search", stateKey: "search_out", refAgentId: "agent-search" });
  const create = node({ id: "create", label: "Record Creation", stateKey: "create_out", refAgentId: "agent-create" });
  const screen = node({ id: "screen", label: "Risk Clearance", stateKey: "screen_out", refAgentId: "agent-screen" });
  const edges = [
    edge({ id: "e1", sourceNodeId: "search", targetNodeId: "create", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "resolutionDecision", operator: "==", value: "create" }] } as any }),
    edge({ id: "e2", sourceNodeId: "search", targetNodeId: "screen", evaluationMode: "deterministic", rule: { combinator: "OR", conditions: [{ combinator: "AND", conditions: [{ field: "resolutionDecision", operator: "==", value: "match" }] }] } as any }),
    edge({ id: "e3", sourceNodeId: "create", targetNodeId: "screen" }),
  ];

  it("collects every tested field, including nested groups, per source node", () => {
    const plan = computeWaves([search, create, screen], edges);
    const specs = getRoutingFieldSpecs("search", plan);
    expect(specs).toHaveLength(1);
    expect(specs[0].field).toBe("resolutionDecision");
    expect(specs[0].routes.map(r => `${r.targetLabel}:${r.value}`).sort()).toEqual(["Record Creation:create", "Risk Clearance:match"]);
    expect(getRoutingFieldSpecs("create", plan)).toEqual([]);
  });

  it("puts a ROUTING FIELDS section in the source agent's input only", async () => {
    const plan = computeWaves([search, create, screen], edges);
    const { executeWorkerAgent } = await import("../server/agent-runtime");
    const inputs = new Map<string, string>();
    (executeWorkerAgent as any).mockReset();
    (executeWorkerAgent as any).mockImplementation(async (agentId: string, _t: any, contextInput: string) => {
      inputs.set(agentId, contextInput);
      return { success: true, output: agentId === "agent-search" ? JSON.stringify({ resolutionDecision: "create" }) : "done" };
    });
    const result = await new DAGExecutionEngine().execute({ executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1" });
    expect(inputs.get("agent-search")).toContain("## ROUTING FIELDS (required)");
    expect(inputs.get("agent-search")).toContain('"resolutionDecision": runs "Record Creation" when == "create"');
    expect(inputs.get("agent-create") || "").not.toContain("ROUTING FIELDS");
    const nodes = result.waveResults.flatMap(w => w.nodes);
    expect(nodes.find(n => n.nodeId === "create")?.status).toBe("completed");
  });

  it("names the unproduced field when a branch is skipped", async () => {
    const plan = computeWaves([search, create], [edges[0]]);
    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockReset();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "No duplicates found, proceed." });
    const result = await new DAGExecutionEngine().execute({ executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1" });
    const skipped = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "create");
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.error).toContain("resolutionDecision");
  });
});

describe("agent node timeout floor", () => {
  it("lifts the 30s column default to the agent floor and keeps deliberate settings", () => {
    expect(agentNodeTimeoutMs(30000)).toBe(AGENT_NODE_MIN_TIMEOUT_MS);
    expect(agentNodeTimeoutMs(null)).toBe(AGENT_NODE_MIN_TIMEOUT_MS);
    expect(agentNodeTimeoutMs(600000)).toBe(600000);
    expect(agentNodeTimeoutMs(5000)).toBe(5000);
  });
});

describe("final answer when the last branch was skipped", () => {
  it("returns the latest step that ran, named, instead of 'no text output'", async () => {
    const { extractFinalOutputText } = await import("../server/dag-execution-engine");
    const screen = node({ id: "screen", label: "Risk Clearance", stateKey: "screen_out", refAgentId: "agent-screen" });
    const auth = node({ id: "auth", label: "Authorization", stateKey: "auth_out", refAgentId: "agent-auth" });
    const plan = computeWaves([screen, auth], [edge({ sourceNodeId: "screen", targetNodeId: "auth", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "riskClearanceStatus", operator: "!=", value: "CLEARED" }] } as any })]);
    const result: any = { finalState: { screen_out: "Account is cleared to quote." }, waveResults: [], skippedNodeIds: ["auth"], success: true };
    const text = extractFinalOutputText(result, plan);
    expect(text).toContain("Account is cleared to quote.");
    expect(text).toContain("Final answer from Risk Clearance");
    expect(text).not.toContain("no text output");
  });

  it("still says so when nothing produced output", async () => {
    const { extractFinalOutputText } = await import("../server/dag-execution-engine");
    const a = node({ id: "a", stateKey: "a_out" });
    const plan = computeWaves([a], []);
    expect(extractFinalOutputText({ finalState: {}, waveResults: [], skippedNodeIds: [], success: true } as any, plan)).toContain("no text output");
  });
});

describe("steps after yours — a step is told what has not run yet", () => {
  it("names every later step (transitively) for the first step, and none for the last", async () => {
    const { getLaterStepLabels } = await import("../server/dag-execution-engine");
    const orch = node({ id: "orch", label: "Orchestrator", stateKey: "orch_out", refAgentId: "agent-orch" });
    const search = node({ id: "search", label: "Search", stateKey: "search_out", refAgentId: "agent-search" });
    const screen = node({ id: "screen", label: "Screening", stateKey: "screen_out", refAgentId: "agent-screen" });
    const plan = computeWaves([orch, search, screen], [
      edge({ id: "e1", sourceNodeId: "orch", targetNodeId: "search" }),
      edge({ id: "e2", sourceNodeId: "search", targetNodeId: "screen" }),
    ]);
    expect(getLaterStepLabels("orch", plan).sort()).toEqual(["Screening", "Search"]);
    expect(getLaterStepLabels("screen", plan)).toEqual([]);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    const inputs = new Map<string, string>();
    (executeWorkerAgent as any).mockReset();
    (executeWorkerAgent as any).mockImplementation(async (agentId: string, _t: any, contextInput: string) => {
      inputs.set(agentId, contextInput);
      return { success: true, output: "done" };
    });
    await new DAGExecutionEngine().execute({ executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1" });
    expect(inputs.get("agent-orch")).toContain("## STEPS AFTER YOURS");
    expect(inputs.get("agent-orch")).toContain('"Search"');
    expect(inputs.get("agent-screen") || "").not.toContain("STEPS AFTER YOURS");
  });
});

describe("routing field instruction", () => {
  it("asks for the field at the top level, not only inside a records array", async () => {
    const { renderRoutingFields } = await import("../server/pipeline-guidance");
    const text = renderRoutingFields([{ field: "resolutionDecision", routes: [{ targetLabel: "Record Creation", operator: "==", value: "create" }] }]).join("\n");
    expect(text).toContain("TOP-LEVEL key");
    expect(text).toContain("records array");
  });
});
