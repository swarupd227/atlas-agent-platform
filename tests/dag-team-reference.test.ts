/**
 * Team-reference ("sub-flow") node execution in DAGExecutionEngine.
 *
 * executeTeamReferenceNode recurses -- this.execute() calling itself with a
 * child team-agent's own blueprint -- to run "call another flow, wait, merge
 * the result back" nodes. Nothing stopped a cycle (A -> B -> A) or unbounded
 * depth before this: it would recurse until the process hung or blew its
 * call stack. These tests prove the guard actually fires, and that it
 * doesn't false-positive on legitimate non-cyclic delegation.
 */
import { describe, it, expect, vi } from "vitest";

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

// vi.mock factories are hoisted above regular top-level statements, so this
// shared mutable state (read inside the storage mock below, written per-test)
// must go through vi.hoisted -- a bare `const` here would throw "Cannot
// access before initialization" when the factory runs.
const { blueprints, teamAgents } = vi.hoisted(() => ({
  blueprints: {} as Record<string, { nodes: any[]; edges: any[] }>,
  teamAgents: {} as Record<string, any>,
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string) => teamAgents[id]),
    getTeamBlueprintNodes: vi.fn(async (blueprintId: string) => blueprints[blueprintId]?.nodes ?? []),
    getTeamBlueprintEdges: vi.fn(async (blueprintId: string) => blueprints[blueprintId]?.edges ?? []),
    getDagStateSchemaByTeamAgent: vi.fn(async () => null),
  },
}));

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
    ...overrides,
  } as TeamBlueprintNode;
}

function setTeamAgent(id: string, blueprintId: string) {
  teamAgents[id] = { id, blueprintId, runtimeConfig: {} };
}

describe("DAGExecutionEngine — team-reference (sub-flow) cycle guard", () => {
  it("refuses a flow that references itself directly", async () => {
    setTeamAgent("team-a", "bp-a");
    blueprints["bp-a"] = {
      nodes: [node({ id: "call-a", refTeamAgentId: "team-a", stateKey: "a_result" })],
      edges: [],
    };

    const plan = computeWaves(blueprints["bp-a"].nodes, []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-a",
    });

    expect(result.success).toBe(false);
    const nodeResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "call-a");
    expect(nodeResult?.status).toBe("failed");
    expect(nodeResult?.error).toMatch(/cycle/i);
  });

  it("refuses a two-hop cycle (A -> B -> A) instead of recursing forever", async () => {
    setTeamAgent("team-a", "bp-a");
    setTeamAgent("team-b", "bp-b");
    blueprints["bp-a"] = {
      nodes: [node({ id: "call-b", refTeamAgentId: "team-b", stateKey: "b_result" })],
      edges: [],
    };
    blueprints["bp-b"] = {
      nodes: [node({ id: "call-a", refTeamAgentId: "team-a", stateKey: "a_result" })],
      edges: [],
    };

    const plan = computeWaves(blueprints["bp-a"].nodes, []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-a",
    });

    expect(result.success).toBe(false);
    const callBResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "call-b");
    expect(callBResult?.status).toBe("failed");
    // The cycle is caught one level down, inside B's own execution -- surfaces
    // as call-b failing because ITS child (call-a back to team-a) refused.
    expect(callBResult?.error).toBeTruthy();
  });

  it("allows legitimate non-cyclic delegation (A -> B, B has no further reference)", async () => {
    setTeamAgent("team-a", "bp-a2");
    setTeamAgent("team-b", "bp-b2");
    blueprints["bp-a2"] = {
      nodes: [node({ id: "call-b", refTeamAgentId: "team-b", stateKey: "b_result" })],
      edges: [],
    };
    blueprints["bp-b2"] = {
      nodes: [node({ id: "leaf-agent", refAgentId: "agent-leaf", stateKey: "leaf_output" })],
      edges: [],
    };

    const plan = computeWaves(blueprints["bp-a2"].nodes, []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-a",
    });

    expect(result.success).toBe(true);
    const callBResult = result.waveResults.flatMap(w => w.nodes).find(n => n.nodeId === "call-b");
    expect(callBResult?.status).toBe("completed");
  });
});
