/**
 * Deliverables produced by one DAG node reach the nodes after it.
 * Reproduces the live 2026-09-08 gap: a QA node "passed" a deck it had never
 * opened, because nothing carried the assembler's .pptx to the reviewer --
 * it could only grade the assembler's own summary. Now a node's generated
 * files land in state under `<stateKey>_files` (so they survive an approval
 * pause) and every later node's worker is invoked with their ids.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine, collectUpstreamGeneratedFileIds, GENERATED_FILES_STATE_SUFFIX } from "../server/dag-execution-engine";
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
      try { Object.assign(state, JSON.parse(text)); } catch { state[label] = text; }
    }
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

const edge = (from: string, to: string): TeamBlueprintEdge => ({
  id: `${from}->${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
  allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
} as unknown as TeamBlueprintEdge);

const DECK = { id: "gf-deck-1", filename: "deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

describe("collectUpstreamGeneratedFileIds", () => {
  it("reads every *_files array in state, ignores other keys and malformed entries, and dedupes", () => {
    const ids = collectUpstreamGeneratedFileIds({
      request: "x",
      [`deck${GENERATED_FILES_STATE_SUFFIX}`]: [DECK, { id: "gf-2" }, { nope: true }, null],
      [`other${GENERATED_FILES_STATE_SUFFIX}`]: [{ id: "gf-2" }],
      files_not_suffix: [{ id: "gf-3" }],
      brief: "text",
    });
    expect(ids).toEqual(["gf-deck-1", "gf-2"]);
  });
});

describe("DAGExecutionEngine — generated files flow downstream", () => {
  it("records a producer's files in state and invokes the next worker with their ids", async () => {
    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockReset();
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      if (agentId === "agent-assembler") return { success: true, output: "built the deck", generatedFiles: [DECK] };
      return { success: true, output: "reviewed" };
    });

    const assembler = node({ id: "asm", refAgentId: "agent-assembler", stateKey: "deck" });
    const reviewer = node({ id: "qa", refAgentId: "agent-qa", stateKey: "qa_result" });
    const plan = computeWaves([assembler, reviewer], [edge("asm", "qa")]);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({ executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "fail_fast", teamAgentId: "team-1" });

    expect(result.success).toBe(true);
    expect(result.finalState[`deck${GENERATED_FILES_STATE_SUFFIX}`]).toEqual([DECK]);

    const calls = (executeWorkerAgent as any).mock.calls as any[][];
    const asmCall = calls.find(c => c[0] === "agent-assembler");
    const qaCall = calls.find(c => c[0] === "agent-qa");
    expect(asmCall?.[5]).toEqual([]);          // first node: nothing upstream
    expect(qaCall?.[5]).toEqual(["gf-deck-1"]); // reviewer gets the deck
  });

  it("does not add a *_files key when the worker produced nothing", async () => {
    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockReset();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "text only" });

    const only = node({ id: "solo", refAgentId: "agent-solo", stateKey: "solo_out" });
    const plan = computeWaves([only], []);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({ executionPlan: plan, stateSchema: {}, initialState: {}, errorStrategy: "fail_fast", teamAgentId: "team-1" });

    expect(result.finalState.solo_out).toBe("text only");
    expect(Object.keys(result.finalState).some(k => k.endsWith(GENERATED_FILES_STATE_SUFFIX))).toBe(false);
  });
});
