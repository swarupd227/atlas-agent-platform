/**
 * The `tool_call` node: one bound tool, arguments taken from the run's state, no
 * model anywhere in the path.
 *
 * This is the primitive the platform was missing. Tool dispatch only ever
 * happened inside an agent's tool loop, so a step that was purely "post this
 * work note" had to be an agent -- paying for a model call, and leaving the model
 * free to skip the call or invent its arguments. What must stay true is that
 * skipping the model does not skip the governance: the call goes through the same
 * dispatcher, with the team agent's policy bundle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dispatchToolCall = vi.fn();
const gatherAvailableTools = vi.fn();
const resolvePolicyBundle = vi.fn();

vi.mock("../server/agent-runtime", () => ({
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  detectTranscriptionDrift: vi.fn().mockReturnValue(null),
  buildPipelineState: (outputs: Map<string, string>, labels: Map<string, string>) => {
    const state: Record<string, any> = {};
    for (const [nodeId, text] of Array.from(outputs.entries())) {
      const label = labels.get(nodeId) || nodeId;
      try { Object.assign(state, JSON.parse(text)); } catch { state[label] = text; }
    }
    return state;
  },
}));
vi.mock("../server/tool-dispatcher", () => ({ dispatchToolCall, gatherAvailableTools }));
vi.mock("../server/routes/helpers", () => ({
  recomputeOutcomeKpis: vi.fn(),
  resolvePolicyBundle,
}));

const { computeWaves, DAGExecutionEngine } = await import("../server/dag-execution-engine");
import type { TeamBlueprintNode } from "@shared/schema";

const NOTE_TOOL = {
  serverId: "srv-1", serverName: "ServiceNow CMDB", serverUrl: "http://x", toolName: "snow_add_work_note",
  toolDescription: "", toolInputSchema: {},
};

function toolCallNode(config: Record<string, unknown>): TeamBlueprintNode {
  return {
    id: "call-1", blueprintId: "bp1", nodeType: "tool_call", label: "Post the note",
    positionX: 0, positionY: 0, refAgentId: null, refRemoteAgentId: null, refToolIds: [],
    refPolicyId: null, gateType: null, config, stateKey: "posted", outputSchema: null,
    fallbackOutput: null, timeoutMs: 30000, retryPolicy: null, refTeamAgentId: null,
    outputContractId: null, refSkillId: null, refKnowledgeBaseId: null, createdAt: new Date(),
  } as unknown as TeamBlueprintNode;
}

const run = (node: TeamBlueprintNode, initialState: Record<string, any> = {}) =>
  new DAGExecutionEngine().execute({
    executionPlan: computeWaves([node], []),
    stateSchema: {},
    initialState,
    errorStrategy: "best_effort",
    teamAgentId: "team-1",
    dagRunId: "run-1",
  });

beforeEach(() => {
  vi.clearAllMocks();
  gatherAvailableTools.mockResolvedValue([NOTE_TOOL]);
  resolvePolicyBundle.mockResolvedValue({ blockedTools: [], toolAllowlist: [], appliedPolicies: [], redactPatterns: [] });
  dispatchToolCall.mockResolvedValue({ outcome: "success", result: { number: "CHG0025001", updated: true } });
});

describe("a tool_call node", () => {
  it("calls the bound tool and puts its result in state, with no tokens spent", async () => {
    const result = await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note", toolArgs: { table: "change_request" } }));

    expect(result.success).toBe(true);
    expect(dispatchToolCall).toHaveBeenCalledTimes(1);
    expect(result.finalState.posted).toEqual({ number: "CHG0025001", updated: true });
    const node = result.waveResults[0].nodes[0];
    expect(node.promptTokens).toBe(0);
    expect(node.completionTokens).toBe(0);
    expect(node.agentId).toBe("");
  });

  it("takes arguments from state where the author asked for it, and literally where not", async () => {
    await run(
      toolCallNode({
        toolServerId: "srv-1",
        toolName: "snow_add_work_note",
        toolArgs: { table: "change_request", ci: { $expr: "assessment.targetSysId" }, note: { $expr: "assessment.summary" } },
      }),
      { assessment: { targetSysId: "c0063", summary: "7 services exposed" } },
    );

    expect(dispatchToolCall.mock.calls[0][0].args).toEqual({
      table: "change_request",
      ci: "c0063",
      note: "7 services exposed",
    });
  });

  it("passes the team agent's policy bundle, so a free step is not an ungoverned one", async () => {
    await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note" }));

    expect(resolvePolicyBundle).toHaveBeenCalledWith("team-1", undefined);
    const req = dispatchToolCall.mock.calls[0][0];
    expect(req.agentId).toBe("team-1");
    expect(req.policyBundle).not.toBeNull();
    // One logical run, so a retried wave cannot double-post.
    expect(req.idempotencyScope).toBe("run-1");
  });

  it("fails the step, and names what the connector does have, when the tool is gone", async () => {
    gatherAvailableTools.mockResolvedValue([{ ...NOTE_TOOL, toolName: "snow_create_task" }]);

    const result = await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note" }));

    expect(result.success).toBe(false);
    expect(result.waveResults[0].nodes[0].error).toContain("snow_create_task");
    expect(dispatchToolCall).not.toHaveBeenCalled();
  });

  it("writes nothing to state when the dispatcher refuses the call", async () => {
    dispatchToolCall.mockResolvedValue({ outcome: "blocked_by_policy", reason: "write tools are blocked for this agent" });

    const result = await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note" }));

    expect(result.success).toBe(false);
    expect(result.finalState.posted).toBeUndefined();
    expect(result.waveResults[0].nodes[0].error).toContain("write tools are blocked");
  });

  it("reports a deduplicated call as done rather than failed", async () => {
    // At-least-once delivery: the same call in the same run already succeeded.
    dispatchToolCall.mockResolvedValue({ outcome: "deduplicated", result: { number: "CHG0025001" } });

    const result = await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note" }));

    expect(result.success).toBe(true);
    expect(result.finalState.posted).toEqual({ number: "CHG0025001" });
  });

  it("fails cleanly when an argument expression is nonsense, before anything is called", async () => {
    const result = await run(toolCallNode({ toolServerId: "srv-1", toolName: "snow_add_work_note", toolArgs: { ci: { $expr: "((" } } }));

    expect(result.success).toBe(false);
    expect(result.waveResults[0].nodes[0].error).toContain("arguments");
    expect(dispatchToolCall).not.toHaveBeenCalled();
  });

  it("stays an agent node when the connector is missing, rather than dispatching blind", async () => {
    // classifyStep refuses to demote a half-configured step; the engine agrees --
    // without a server id this is not a tool_call it can execute.
    const result = await run(toolCallNode({ toolName: "snow_add_work_note" }));

    expect(dispatchToolCall).not.toHaveBeenCalled();
    expect(result.waveResults[0].nodes[0].status).toBe("skipped");
  });
});
