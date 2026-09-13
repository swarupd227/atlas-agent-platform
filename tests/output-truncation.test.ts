/**
 * A step whose final answer stopped at the model's output limit.
 *
 * It still counts as completed and its partial output flows downstream -- a
 * calendar that stops mid-table, briefs that end partway through. Nothing used
 * to mark it: in one live content-planning run three of four steps stopped at
 * exactly 16,384 tokens, and the reviewer after them never noticed. Now the
 * engine records the step as truncated and tells every later step, in its own
 * section, which upstream output is incomplete.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine, upstreamFailureNotice, upstreamTruncationNotice } from "../server/dag-execution-engine";
import { canonicalStopReason } from "../server/llm-provider";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: () => null,
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

describe("canonicalStopReason", () => {
  it("maps OpenAI's cut-off to the same signal Anthropic uses", () => {
    expect(canonicalStopReason("length")).toBe("max_tokens");
    expect(canonicalStopReason("stop")).toBe("end_turn");
    expect(canonicalStopReason("tool_calls")).toBe("tool_use");
    expect(canonicalStopReason("content_filter")).toBe("content_filter");
  });
});

describe("upstreamTruncationNotice", () => {
  const plan = computeWaves(
    [
      node({ id: "writer", label: "Writer", refAgentId: "ag-writer", stateKey: "draft" }),
      node({ id: "middle", label: "Middle", refAgentId: "ag-middle", stateKey: "middle_output" }),
      node({ id: "reviewer", label: "Reviewer", refAgentId: "ag-reviewer", stateKey: "review" }),
    ],
    [edge("writer", "middle"), edge("middle", "reviewer")],
  );

  it("names an ancestor whose output was cut off, so its fragment is not taken as the whole", () => {
    const text = upstreamTruncationNotice("reviewer", plan, new Map([["writer", { status: "truncated" }]]))!;
    expect(text).toContain('"Writer"');
    expect(text).toContain("`draft`");
    expect(text).toContain("CUT OFF at the model's output length limit");
    expect(text).toContain("never judge it complete");
  });

  it("is kept apart from the notice about steps that produced nothing", () => {
    const outcomes = new Map([["writer", { status: "truncated" }]]);
    expect(upstreamFailureNotice("reviewer", plan, outcomes)).toBeUndefined();
    const failed = new Map([["writer", { status: "failed", error: "timed out" }]]);
    expect(upstreamTruncationNotice("reviewer", plan, failed)).toBeUndefined();
  });

  it("only reports a node's own ancestors", () => {
    expect(upstreamTruncationNotice("writer", plan, new Map([["reviewer", { status: "truncated" }]]))).toBeUndefined();
  });
});

describe("DAGExecutionEngine: truncated steps", () => {
  let executeWorkerAgent: any;
  beforeEach(async () => {
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
  });

  it("keeps the partial output, marks the step, and tells the step after it", async () => {
    const reviewerInputs: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-writer") return { success: true, output: "| week | asset |\n| 1 | hero ema", truncated: true };
      reviewerInputs.push(input);
      return { success: true, output: "reviewed" };
    });

    const plan = computeWaves(
      [
        node({ id: "writer", label: "Calendar Writer", refAgentId: "ag-writer", stateKey: "calendar" }),
        node({ id: "reviewer", label: "Reviewer", refAgentId: "ag-reviewer", stateKey: "review" }),
      ],
      [edge("writer", "reviewer")],
    );
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "plan it" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    const writer = result.waveResults[0].nodes[0];
    // Still a completed step -- the partial work is real and is kept.
    expect(writer.status).toBe("completed");
    expect(writer.truncated).toBe(true);
    expect(result.finalState.calendar).toContain("hero ema");

    // ...but the reviewer is told plainly that it is only part of the calendar.
    expect(reviewerInputs[0]).toContain("## UPSTREAM STEPS WHOSE OUTPUT WAS CUT OFF");
    expect(reviewerInputs[0]).toContain('"Calendar Writer"');
    expect(reviewerInputs[0]).not.toContain("## UPSTREAM STEPS THAT PRODUCED NOTHING");
  });

  it("says nothing when every upstream step finished writing", async () => {
    const reviewerInputs: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-writer") return { success: true, output: "the whole calendar", truncated: false };
      reviewerInputs.push(input);
      return { success: true, output: "reviewed" };
    });

    const plan = computeWaves(
      [
        node({ id: "writer", label: "Calendar Writer", refAgentId: "ag-writer", stateKey: "calendar" }),
        node({ id: "reviewer", label: "Reviewer", refAgentId: "ag-reviewer", stateKey: "review" }),
      ],
      [edge("writer", "reviewer")],
    );
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "plan it" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.waveResults[0].nodes[0].truncated).toBeUndefined();
    expect(reviewerInputs[0]).not.toContain("## UPSTREAM STEPS WHOSE OUTPUT WAS CUT OFF");
  });
});
