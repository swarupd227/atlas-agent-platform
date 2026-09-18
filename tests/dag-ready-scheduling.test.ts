/**
 * Early admission in DAGExecutionEngine: a node starts as soon as every node
 * feeding it has settled, instead of waiting for its wave's barrier -- while
 * waves stay the unit of checkpointing and reporting.
 *
 * Live: a team "orchestrator" with no edges took 134s in wave 1 while the
 * search beside it finished in 35s; the three steps depending only on the
 * search waited the remaining 99s for nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: (text: string) => { try { return JSON.parse(text); } catch { return null; } },
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  buildPipelineState: (outputs: Map<string, string>) => {
    const state: Record<string, any> = {};
    for (const text of Array.from(outputs.values())) { try { Object.assign(state, JSON.parse(text)); } catch { /* prose */ } }
    return state;
  },
}));

function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1", blueprintId: "bp1", nodeType: "internal_agent", label: "Node", positionX: 0, positionY: 0,
    refAgentId: null, refRemoteAgentId: null, refToolIds: [], refPolicyId: null, gateType: null, config: null,
    createdAt: new Date(), stateKey: "node_output", outputSchema: null, fallbackOutput: null, timeoutMs: 30000,
    retryPolicy: null, refTeamAgentId: null, outputContractId: null, refSkillId: null, ...overrides,
  } as TeamBlueprintNode;
}
const edge = (source: string, target: string, rule?: any) =>
  ({ id: `${source}-${target}`, blueprintId: "bp1", sourceNodeId: source, targetNodeId: target, condition: null, evaluationMode: rule ? "deterministic" : null, rule: rule ?? null }) as unknown as TeamBlueprintEdge;

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

describe("DAGExecutionEngine early admission", () => {
  let executeWorkerAgent: any;
  beforeEach(async () => {
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
  });

  const plan = () => computeWaves(
    [
      node({ id: "orchestrator", label: "Orchestrator", refAgentId: "ag-orch", stateKey: "plan" }),
      node({ id: "search", label: "Search", refAgentId: "ag-search", stateKey: "search_out" }),
      node({ id: "record", label: "Record", refAgentId: "ag-record", stateKey: "record_out" }),
      node({ id: "screen", label: "Screen", refAgentId: "ag-screen", stateKey: "screen_out" }),
    ],
    [edge("search", "record"), edge("record", "screen")],
  );

  it("starts a node when its inputs have settled, while a slow unrelated node still runs", async () => {
    const orch = deferred<any>();
    const started: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string) => {
      started.push(agentId);
      if (agentId === "ag-orch") return orch.promise;
      return { success: true, output: `${agentId} done` };
    });
    const waveCompletes: number[] = [];
    const run = new DAGExecutionEngine().execute({
      executionPlan: plan(), stateSchema: {}, initialState: { request: "r" }, errorStrategy: "best_effort", teamAgentId: "team-1",
      onWaveComplete: async (w) => { waveCompletes.push(w); },
    });
    // Let search, then record, then screen run to completion while the orchestrator hangs.
    await vi.waitFor(() => expect(started).toEqual(["ag-orch", "ag-search", "ag-record", "ag-screen"]));
    expect(waveCompletes).toEqual([]); // wave 1 is still open: the orchestrator has not finished
    orch.resolve({ success: true, output: "plan done" });
    const result = await run;

    expect(result.success).toBe(true);
    expect(result.waveResults.map((w) => w.waveNumber)).toEqual([1, 2, 3]);
    expect(result.waveResults[0].nodes.map((n) => n.nodeId).sort()).toEqual(["orchestrator", "search"]);
    expect(result.waveResults[1].nodes.map((n) => n.nodeId)).toEqual(["record"]);
    expect(result.waveResults[2].nodes.map((n) => n.nodeId)).toEqual(["screen"]);
    expect(result.waveResults.flatMap((w) => w.nodes).every((n) => n.status === "completed")).toBe(true);
    expect(waveCompletes).toEqual([1, 2, 3]);
    // Bookkeeping happened once per node.
    expect(executeWorkerAgent).toHaveBeenCalledTimes(4);
  });

  it("gates an early node against the live state, and a skip settles its dependents too", async () => {
    const orch = deferred<any>();
    const started: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string) => {
      started.push(agentId);
      if (agentId === "ag-orch") return orch.promise;
      if (agentId === "ag-search") return { success: true, output: JSON.stringify({ resolutionDecision: "match" }) };
      return { success: true, output: `${agentId} done` };
    });
    const gated = computeWaves(
      [
        node({ id: "orchestrator", label: "Orchestrator", refAgentId: "ag-orch", stateKey: "plan" }),
        node({ id: "search", label: "Search", refAgentId: "ag-search", stateKey: "search_out" }),
        node({ id: "record", label: "Record", refAgentId: "ag-record", stateKey: "record_out" }),
        node({ id: "screen", label: "Screen", refAgentId: "ag-screen", stateKey: "screen_out" }),
      ],
      [
        edge("search", "record", { combinator: "AND", conditions: [{ field: "resolutionDecision", operator: "==", value: "create" }] }),
        edge("record", "screen"),
        edge("search", "screen", { combinator: "AND", conditions: [{ field: "resolutionDecision", operator: "==", value: "match" }] }),
      ],
    );
    const run = new DAGExecutionEngine().execute({
      executionPlan: gated, stateSchema: {}, initialState: {}, errorStrategy: "best_effort", teamAgentId: "team-1",
    });
    await vi.waitFor(() => expect(started).toContain("ag-screen"));
    expect(started).not.toContain("ag-record");
    orch.resolve({ success: true, output: "plan done" });
    const result = await run;
    const status = (id: string) => result.waveResults.flatMap((w) => w.nodes).find((n) => n.nodeId === id)?.status;
    expect(status("record")).toBe("skipped");
    expect(status("screen")).toBe("completed");
    expect(result.skippedNodeIds).toEqual(["record"]);
  });

  it("keeps the barrier under fail_fast", async () => {
    const orch = deferred<any>();
    const started: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string) => {
      started.push(agentId);
      if (agentId === "ag-orch") return orch.promise;
      return { success: true, output: `${agentId} done` };
    });
    const run = new DAGExecutionEngine().execute({
      executionPlan: plan(), stateSchema: {}, initialState: {}, errorStrategy: "fail_fast", teamAgentId: "team-1",
    });
    await vi.waitFor(() => expect(started).toContain("ag-search"));
    await new Promise((r) => setTimeout(r, 30));
    expect(started).not.toContain("ag-record");
    orch.resolve({ success: true, output: "plan done" });
    const result = await run;
    expect(result.waveResults.map((w) => w.waveNumber)).toEqual([1, 2, 3]);
  });
});
