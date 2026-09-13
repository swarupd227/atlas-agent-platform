/**
 * What a DAG worker actually receives.
 *
 * executeWorkerAgent assembles a worker's message from three parts:
 *
 *   `${workerPrompt}` + `## REQUEST\n${teamAgent.prompt}` + `## INPUT FROM PREVIOUS STAGE\n${previousContext}`
 *
 * For its non-DAG callers those are genuinely different things -- the team's
 * standing prompt, and the previous worker's output. The DAG engine used to
 * pass its fully-assembled context as BOTH, so every worker was handed its
 * role, the request, and every state key twice in a single call. That doubled
 * the input cost of every team run and halved the usable context: a five-step
 * journey holding ~73k tokens of state was rejected by the API at
 * 209,930 > 200,000 tokens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import { currentLlmAbortSignal } from "../server/llm-abort-context";
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

/** Mirrors executeWorkerAgent's assembly (server/agent-runtime.ts). */
function renderWorkerMessage(workerPrompt: string, teamAgent: any, previousContext: string): string {
  const requestBlock = teamAgent.prompt ? `\n\n## REQUEST\n${teamAgent.prompt}` : "";
  const upstreamBlock = previousContext ? `\n\n## INPUT FROM PREVIOUS STAGE\n${previousContext}` : "";
  return `${workerPrompt}${requestBlock}${upstreamBlock}`;
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("DAG worker input", () => {
  let executeWorkerAgent: any;
  beforeEach(async () => {
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
  });

  it("hands a worker its context once, not twice", async () => {
    const calls: Array<{ teamAgent: any; previousContext: string }> = [];
    executeWorkerAgent.mockImplementation(async (_id: string, teamAgent: any, previousContext: string) => {
      calls.push({ teamAgent, previousContext });
      return { success: true, output: "done" };
    });

    const plan = computeWaves(
      [
        node({ id: "first", label: "First", refAgentId: "ag-first", stateKey: "draft" }),
        node({ id: "second", label: "Second", refAgentId: "ag-second", stateKey: "review" }),
      ],
      [edge("first", "second")],
    );
    await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "THE-REQUEST-MARKER" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(calls).toHaveLength(2);
    const second = calls[1];

    // The engine's assembled context carries the request and the upstream
    // state, each once.
    expect(occurrences(second.previousContext, "THE-REQUEST-MARKER")).toBe(1);
    expect(occurrences(second.previousContext, "## STATE: draft")).toBe(1);

    // And it is NOT also passed as the team agent's own prompt -- that is what
    // duplicated it, because executeWorkerAgent renders both.
    expect(second.teamAgent.prompt).toBeFalsy();

    const message = renderWorkerMessage("Second's role", second.teamAgent, second.previousContext);
    expect(occurrences(message, "THE-REQUEST-MARKER")).toBe(1);
    expect(occurrences(message, "## STATE: draft")).toBe(1);
    expect(occurrences(message, "## DAG EXECUTION CONTEXT")).toBe(1);
  });

  it("cancels the worker's model calls when the node times out", async () => {
    let seen: AbortSignal | undefined;
    executeWorkerAgent.mockImplementation(() => {
      seen = currentLlmAbortSignal();
      return new Promise(() => {}); // a model call that never answers
    });

    const plan = computeWaves([node({ id: "slow", label: "Slow", refAgentId: "ag-slow", stateKey: "out", timeoutMs: 50 })], []);
    const result = await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "go" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.waveResults[0].nodes[0].status).toBe("failed");
    // The worker ran inside an abort scope, and the timeout cancelled it -- so
    // the provider stops the request instead of letting it run on unattended.
    expect(seen).toBeDefined();
    expect(seen!.aborted).toBe(true);
  });

  it("leaves a worker that finishes in time uncancelled", async () => {
    let seen: AbortSignal | undefined;
    executeWorkerAgent.mockImplementation(async () => {
      seen = currentLlmAbortSignal();
      return { success: true, output: "done" };
    });

    const plan = computeWaves([node({ id: "quick", label: "Quick", refAgentId: "ag-quick", stateKey: "out", timeoutMs: 5000 })], []);
    await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "go" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(seen?.aborted).toBe(false);
  });

  it("still reaches the first worker, which has no upstream output at all", async () => {
    const calls: Array<{ teamAgent: any; previousContext: string }> = [];
    executeWorkerAgent.mockImplementation(async (_id: string, teamAgent: any, previousContext: string) => {
      calls.push({ teamAgent, previousContext });
      return { success: true, output: "done" };
    });

    const plan = computeWaves([node({ id: "only", label: "Only", refAgentId: "ag-only", stateKey: "out" })], []);
    await new DAGExecutionEngine().execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: { request: "THE-REQUEST-MARKER" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    // Removing the duplicate must not leave a tier-0 worker with nothing: the
    // request reaches it inside the engine's own context, under "## USER REQUEST".
    const message = renderWorkerMessage("Only's role", calls[0].teamAgent, calls[0].previousContext);
    expect(message).toContain("## USER REQUEST");
    expect(occurrences(message, "THE-REQUEST-MARKER")).toBe(1);
  });
});
