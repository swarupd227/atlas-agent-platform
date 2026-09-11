/**
 * Revise-on-failure loops in the team-blueprint DAG engine. A reviewer node
 * whose output matches its policy sends the run back to an upstream node with
 * its findings; the nodes in between run again; the loop is bounded; and an
 * approval gate inside the loop asks a human again -- even on a run that was
 * resumed past an earlier approval, which must never be reused for new work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine, REVISION_STATE_KEY, revisionLoopNodes } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: (text: string) => {
    try {
      const v = JSON.parse(text);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  },
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  buildPipelineState: () => ({}),
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

const edge = (source: string, target: string) =>
  ({ id: `${source}-${target}`, blueprintId: "bp1", sourceNodeId: source, targetNodeId: target, condition: null, evaluationMode: null, rule: null }) as unknown as TeamBlueprintEdge;

const FAILS = { combinator: "AND", conditions: [{ field: "output", operator: "contains", value: "FAIL" }] };

const author = () => node({ id: "author", label: "Author", refAgentId: "ag-author", stateKey: "draft" });
const reviewer = (maxRounds: number) =>
  node({
    id: "reviewer",
    label: "Reviewer",
    refAgentId: "ag-reviewer",
    stateKey: "review",
    config: { revision: { targetNodeId: "author", when: FAILS, maxRounds } } as any,
  });

describe("revisionLoopNodes", () => {
  it("covers every node on a path from the target back to the reviewer, and nothing else", () => {
    const edgeMap = { a: ["b"], b: ["c", "side"], c: ["d"], side: [], d: [] };
    expect(revisionLoopNodes("b", "d", edgeMap)!.sort()).toEqual(["b", "c", "d"]);
    expect(revisionLoopNodes("d", "b", edgeMap)).toBeNull();
  });
});

describe("computeWaves -- revision policy", () => {
  it("reads a reviewer's policy from its config and caps the rounds", () => {
    const plan = computeWaves([author(), reviewer(9)], [edge("author", "reviewer")]);
    expect(plan.nodeConfig.reviewer.revision).toEqual({ targetNodeId: "author", when: FAILS, maxRounds: 3 });
    expect(plan.nodeConfig.author.revision).toBeNull();
  });

  it("ignores a policy it could not act on", () => {
    const unknownTarget = node({ id: "r1", config: { revision: { targetNodeId: "nobody", when: FAILS } } as any });
    const noRule = node({ id: "r2", config: { revision: { targetNodeId: "r1" } } as any });
    const plan = computeWaves([unknownTarget, noRule], []);
    expect(plan.nodeConfig.r1.revision).toBeNull();
    expect(plan.nodeConfig.r2.revision).toBeNull();
  });
});

describe("DAGExecutionEngine -- revise on failure", () => {
  let executeWorkerAgent: any;
  let waitForApproval: any;
  beforeEach(async () => {
    ({ executeWorkerAgent, waitForApproval } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
    waitForApproval.mockReset();
  });

  it("sends the work back with the findings and runs it again until the reviewer passes", async () => {
    const authorInputs: string[] = [];
    let reviews = 0;
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-author") {
        authorInputs.push(input);
        return { success: true, output: authorInputs.length === 1 ? "first draft" : "revised draft" };
      }
      reviews++;
      return { success: true, output: reviews === 1 ? "FAIL: the second box is too long" : "PASS: all good" };
    });

    const plan = computeWaves([author(), reviewer(2)], [edge("author", "reviewer")]);
    const persisted: Array<[number, Record<string, any>]> = [];
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "Write it" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onWaveComplete: async (wave, state) => {
        persisted.push([wave, state]);
      },
    });

    expect(result.success).toBe(true);
    expect(authorInputs).toHaveLength(2);
    expect(reviews).toBe(2);
    // The author was told what to fix, and saw its own previous version to fix it in.
    expect(authorInputs[1]).toContain("REVISION ROUND 1 of 2");
    expect(authorInputs[1]).toContain("FAIL: the second box is too long");
    expect(authorInputs[1]).toContain("first draft");
    // Engine bookkeeping is never shown to an agent.
    expect(authorInputs[1]).not.toContain(REVISION_STATE_KEY);

    expect(result.finalState.draft).toBe("revised draft");
    expect(result.finalState.review).toBe("PASS: all good");
    expect(result.finalState[REVISION_STATE_KEY]).toEqual({ rounds: { reviewer: 1 } });
    expect(result.waveResults.map((w) => [w.waveNumber, w.revisionRound ?? 0])).toEqual([[1, 0], [2, 0], [1, 1], [2, 1]]);
    // At the rewind the run is persisted as "before the author's wave", so a
    // restart re-runs the loop instead of skipping past it.
    expect(persisted.map(([wave]) => wave)).toEqual([1, 2, 0, 1, 2, 2]);
    expect(persisted[2][1][REVISION_STATE_KEY].active).toEqual({ sourceNodeId: "reviewer", nodeIds: ["author", "reviewer"], round: 1 });
  });

  it("stops after the round limit even if the reviewer still fails", async () => {
    executeWorkerAgent.mockImplementation(async (agentId: string) =>
      agentId === "ag-author" ? { success: true, output: "draft" } : { success: true, output: "FAIL: still wrong" },
    );
    const plan = computeWaves([author(), reviewer(1)], [edge("author", "reviewer")]);
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(executeWorkerAgent).toHaveBeenCalledTimes(4);
    expect(result.waveResults).toHaveLength(4);
    expect(result.finalState[REVISION_STATE_KEY]).toEqual({ rounds: { reviewer: 1 } });
  });

  it("asks for a fresh approval inside the loop, even on a run resumed past an earlier one", async () => {
    waitForApproval.mockResolvedValue({ approved: true, decidedBy: "reviewer-1" });
    let reviews = 0;
    executeWorkerAgent.mockImplementation(async (agentId: string) => {
      if (agentId === "ag-author") return { success: true, output: "revised draft" };
      reviews++;
      return { success: true, output: reviews === 1 ? "FAIL: fix it" : "PASS" };
    });

    const gate = node({ id: "gate", nodeType: "edge_gate", gateType: "approval", label: "Review gate", stateKey: "gate_result" });
    const plan = computeWaves([author(), gate, reviewer(1)], [edge("author", "gate"), edge("gate", "reviewer")]);
    const onApprovalDecided = vi.fn().mockResolvedValue(true);

    // Resumed at the gate's wave, as after a restart while the gate was pending.
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { draft: "first draft" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      resumeFromWave: 2,
      resumePriorWaveResults: [
        {
          waveNumber: 1,
          startedAt: "",
          completedAt: "",
          durationMs: 0,
          nodes: [{ nodeId: "author", agentId: "ag-author", status: "completed", output: { draft: "first draft" }, durationMs: 0, promptTokens: 0, completionTokens: 0, traceId: "" }],
        },
      ],
      resumePendingApprovalId: "approval-before-restart",
      onApprovalDecided,
    });

    expect(result.success).toBe(true);
    const calls = waitForApproval.mock.calls;
    expect(calls).toHaveLength(2);
    // The paused gate picks up its own pending approval...
    expect(calls[0][6]).toBe("approval-before-restart");
    // ...but the revised work needs a new decision, and this strand claims the run for it.
    expect(calls[1][6]).toBeUndefined();
    expect(onApprovalDecided).toHaveBeenCalledTimes(1);
    expect(result.finalState.draft).toBe("revised draft");
  });
});
