/**
 * Revise-on-failure loops in the team-blueprint DAG engine. A reviewer node
 * whose output matches its policy sends the run back to an upstream node with
 * its findings; the nodes in between run again; the loop is bounded; and an
 * approval gate inside the loop asks a human again -- even on a run that was
 * resumed past an earlier approval, which must never be reused for new work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine, REVISION_STATE_KEY, revisionFraming, revisionLoopNodes, upstreamFailureNotice } from "../server/dag-execution-engine";
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

describe("revisionFraming", () => {
  const plan = computeWaves(
    [author(), node({ id: "middle", label: "Middle", refAgentId: "ag-middle", stateKey: "middle_output" }), reviewer(2)],
    [edge("author", "middle"), edge("middle", "reviewer")],
  );
  const inLoop = {
    [REVISION_STATE_KEY]: { rounds: { reviewer: 1 }, active: { sourceNodeId: "reviewer", targetNodeId: "author", nodeIds: ["author", "middle", "reviewer"], round: 1 } },
  };

  it("tells the node that was sent back that the findings are its own", () => {
    const text = revisionFraming("author", inLoop, plan)!;
    expect(text).toContain("Revision round 1.");
    expect(text).toContain('"Reviewer" reviewed your output and sent it back to you');
    expect(text).toContain("COMPLETE revised output");
  });

  it("tells a node that is merely downstream not to answer someone else's findings", () => {
    const text = revisionFraming("middle", inLoop, plan)!;
    expect(text).toContain('downstream of "Author"');
    expect(text).toContain("not to you: do not answer them");
    expect(text).toContain("Redo YOUR OWN job in full");
  });

  it("tells the reviewer to judge the revised work afresh", () => {
    expect(revisionFraming("reviewer", inLoop, plan)!).toContain("as if you were seeing it for the first time");
  });

  it("says nothing outside a loop", () => {
    expect(revisionFraming("author", {}, plan)).toBeUndefined();
    expect(revisionFraming("author", { [REVISION_STATE_KEY]: { rounds: {} } }, plan)).toBeUndefined();
    // a node that is not part of the loop at all
    const narrow = { [REVISION_STATE_KEY]: { rounds: {}, active: { sourceNodeId: "reviewer", targetNodeId: "middle", nodeIds: ["middle", "reviewer"], round: 1 } } };
    expect(revisionFraming("author", narrow, plan)).toBeUndefined();
  });

  it("still frames a loop persisted before the target was recorded", () => {
    const legacy = { [REVISION_STATE_KEY]: { rounds: {}, active: { sourceNodeId: "reviewer", nodeIds: ["author", "middle", "reviewer"], round: 2 } } };
    const text = revisionFraming("middle", legacy, plan)!;
    expect(text).toContain("Revision round 2.");
    expect(text).toContain("the step that was sent back");
  });
});

describe("upstreamFailureNotice", () => {
  const plan = computeWaves(
    [author(), node({ id: "middle", label: "Middle", refAgentId: "ag-middle", stateKey: "middle_output" }), reviewer(2)],
    [edge("author", "middle"), edge("middle", "reviewer")],
  );

  it("names an ancestor that produced nothing, so a reviewer cannot assume its work exists", () => {
    const outcomes = new Map([["author", { status: "failed", error: "timed out after 600000ms" }]]);
    const text = upstreamFailureNotice("reviewer", plan, outcomes)!;
    expect(text).toContain('"Author"');
    expect(text).toContain("`draft`");
    expect(text).toContain("produced NO output: timed out after 600000ms");
    expect(text).toContain("Never assume the missing content exists");
  });

  it("words a gated-out branch as a route not taken, not a defect", () => {
    const outcomes = new Map([["author", { status: "skipped" }]]);
    const text = upstreamFailureNotice("reviewer", plan, outcomes)!;
    expect(text).toContain("did not run on this path");
    expect(text).toContain("not a defect");
    expect(text).not.toContain("produced NO output");
  });

  it("only reports a node's own ancestors", () => {
    // the reviewer failing says nothing to the author, which runs before it
    const outcomes = new Map([["reviewer", { status: "failed", error: "boom" }]]);
    expect(upstreamFailureNotice("author", plan, outcomes)).toBeUndefined();
    expect(upstreamFailureNotice("middle", plan, outcomes)).toBeUndefined();
  });

  it("says nothing when every ancestor produced its output", () => {
    expect(upstreamFailureNotice("reviewer", plan, new Map())).toBeUndefined();
    expect(upstreamFailureNotice("reviewer", plan, new Map([["author", { status: "completed" }]]))).toBeUndefined();
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
    expect(persisted[2][1][REVISION_STATE_KEY].active).toEqual({ sourceNodeId: "reviewer", targetNodeId: "author", nodeIds: ["author", "reviewer"], round: 1 });
  });

  it("frames the revision per node, so a downstream step redoes its work instead of reporting on someone else's findings", async () => {
    const inputs: Record<string, string[]> = { "ag-author": [], "ag-middle": [] };
    let reviews = 0;
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-reviewer") {
        reviews++;
        return { success: true, output: reviews === 1 ? "FAIL: thin" : "PASS" };
      }
      inputs[agentId].push(input);
      return { success: true, output: `${agentId} output ${inputs[agentId].length}` };
    });

    const plan = computeWaves(
      [author(), node({ id: "middle", label: "Middle", refAgentId: "ag-middle", stateKey: "middle_output" }), reviewer(2)],
      [edge("author", "middle"), edge("middle", "reviewer")],
    );
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "Write it" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(true);
    // First pass carries no revision framing at all.
    expect(inputs["ag-middle"][0]).not.toContain("## REVISION");
    // On the re-run each node is told which position it is in.
    expect(inputs["ag-author"][1]).toContain("## REVISION");
    expect(inputs["ag-author"][1]).toContain("sent it back to you");
    expect(inputs["ag-middle"][1]).toContain("## REVISION");
    expect(inputs["ag-middle"][1]).toContain('downstream of "Author"');
    expect(inputs["ag-middle"][1]).toContain("Redo YOUR OWN job in full");
    // The downstream node still sees the findings; it is just told they are not its to answer.
    expect(inputs["ag-middle"][1]).toContain("FAIL: thin");
  });

  it("tells a later node that an upstream node produced nothing, and clears that once a revision re-run fills it", async () => {
    const reviewerInputs: string[] = [];
    let authorRuns = 0;
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-author") {
        authorRuns++;
        // fails first time, succeeds on the revision re-run
        return authorRuns === 1
          ? { success: false, output: "", step: { error: "timed out after 600000ms" } }
          : { success: true, output: "the real draft" };
      }
      reviewerInputs.push(input);
      return { success: true, output: reviewerInputs.length === 1 ? "FAIL: nothing to review" : "PASS" };
    });

    const plan = computeWaves([author(), reviewer(2)], [edge("author", "reviewer")]);
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "Write it" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    // First review: told plainly that the author gave it nothing.
    expect(reviewerInputs[0]).toContain("## UPSTREAM STEPS THAT PRODUCED NOTHING");
    expect(reviewerInputs[0]).toContain('"Author"');
    expect(reviewerInputs[0]).toContain("produced NO output");
    // After the revision round the author actually produced its draft, so the
    // notice is gone rather than reporting a hole that has since been filled.
    expect(reviewerInputs[1]).not.toContain("## UPSTREAM STEPS THAT PRODUCED NOTHING");
    expect(reviewerInputs[1]).toContain("the real draft");
    expect(result.finalState.draft).toBe("the real draft");
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
