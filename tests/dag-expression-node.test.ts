/**
 * "expression" node execution in DAGExecutionEngine -- a JSONata transform
 * against shared DAG state, no LLM call. Covers the success path (merges the
 * evaluated result into state under the node's stateKey), the failure path
 * (a syntactically invalid expression fails the node instead of throwing out
 * of the wave), and that it can read fields an upstream node produced.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  // Real extractStructuredOutput parses a JSON-fenced or raw-JSON agent
  // answer so mergeWaveOutputs can flatten its fields into currentState --
  // a plain JSON.parse is enough to exercise that path here.
  extractStructuredOutput: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
  buildPipelineState: (outputs: Map<string, string>, labels: Map<string, string>) => {
    const state: Record<string, any> = {};
    for (const [nodeId, text] of Array.from(outputs.entries())) {
      const label = labels.get(nodeId) || nodeId;
      try {
        const parsed = JSON.parse(text);
        Object.assign(state, parsed);
        state[label] = parsed;
      } catch {
        state[label] = text;
      }
    }
    return state;
  },
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(),
    getTeamBlueprintNodes: vi.fn(),
    getTeamBlueprintEdges: vi.fn(),
    getDagStateSchemaByTeamAgent: vi.fn(async () => null),
  },
}));

import { executeWorkerAgent } from "../server/agent-runtime";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import type { TeamBlueprintNode } from "@shared/schema";

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
    refTeamAgentId: null,
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
    outputContractId: null,
    refSkillId: null,
    refKnowledgeBaseId: null,
    ...overrides,
  } as TeamBlueprintNode;
}

describe("DAGExecutionEngine — expression node", () => {
  it("evaluates a JSONata expression against initial state and merges the result under stateKey", async () => {
    const exprNode = node({
      id: "calc", nodeType: "expression", stateKey: "totals",
      config: { expression: '{ "total": amount + tax }' },
    });
    const plan = computeWaves([exprNode], []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: { amount: 100, tax: 8 },
      errorStrategy: "best_effort", teamAgentId: "team-x",
    });

    expect(result.success).toBe(true);
    const nodeResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "calc");
    expect(nodeResult?.status).toBe("completed");
    expect((result.finalState as any).totals).toEqual({ total: 108 });
  });

  it("fails the node (not the whole run) on a syntactically invalid expression", async () => {
    const exprNode = node({
      id: "bad", nodeType: "expression", stateKey: "bad_output",
      config: { expression: "{ this is not valid jsonata (((" },
    });
    const plan = computeWaves([exprNode], []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-x",
    });

    const nodeResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "bad");
    expect(nodeResult?.status).toBe("failed");
    expect(nodeResult?.error).toMatch(/invalid expression/i);
  });

  it("reads a field an upstream agent node produced", async () => {
    vi.mocked(executeWorkerAgent).mockResolvedValueOnce({
      success: true,
      output: JSON.stringify({ riskTier: "high", score: 0.92 }),
    } as any);

    const agentNode = node({ id: "assess", nodeType: "internal_agent", refAgentId: "agent-1", stateKey: "assessment" });
    const exprNode = node({
      id: "route", nodeType: "expression", stateKey: "routing",
      config: { expression: '{ "escalate": riskTier = "high" }' },
    });
    const edges = [{ id: "e1", blueprintId: "bp1", sourceNodeId: "assess", targetNodeId: "route", label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null, failureMode: "escalate", retryPolicy: null, condition: null, config: null, createdAt: new Date(), evaluationMode: "ai", rule: null }] as any;

    const plan = computeWaves([agentNode, exprNode], edges);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-x",
    });

    expect(result.success).toBe(true);
    const routeResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "route");
    expect(routeResult?.status).toBe("completed");
    expect((result.finalState as any).routing).toEqual({ escalate: true });
  });
});
