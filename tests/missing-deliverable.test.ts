/**
 * A step that tried to produce a file and never did.
 *
 * Live: a deck assembler's fill_document_template calls were both rejected, its
 * revision pass made no tool call at all, the reviewer after it returned "PASS
 * -- the deck now exists", and the run ended "completed" with no deck. Now the
 * engine remembers the failed attempt, tells every later step that no file
 * exists, and fails the run unless a file from that step reaches shared state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeWaves,
  deriveRunStatus,
  DAGExecutionEngine,
  missingDeliverableError,
  upstreamFailureNotice,
  MISSING_FILE_STATUS,
} from "../server/dag-execution-engine";
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

const plan = () =>
  computeWaves(
    [
      node({ id: "assembler", label: "Deck Assembler", refAgentId: "ag-assembler", stateKey: "deck" }),
      node({ id: "qa", label: "QA", refAgentId: "ag-qa", stateKey: "qa" }),
    ],
    [edge("assembler", "qa")],
  );

const REJECTED = "fill_document_template: Invalid template fill spec. (slides: Expected array, received string)";

describe("missingDeliverableError", () => {
  it("reports a step whose attempts failed and that has no file in state", () => {
    const attempts = new Map([["assembler", ["first", REJECTED]]]);
    expect(missingDeliverableError("assembler", plan(), attempts, {})).toBe(REJECTED);
  });

  it("is satisfied once a file from that step is in state, even after failed attempts", () => {
    const attempts = new Map([["assembler", [REJECTED]]]);
    expect(missingDeliverableError("assembler", plan(), attempts, { deck_files: [{ id: "f1" }] })).toBeUndefined();
  });

  it("expects nothing of a step that never tried to produce a file", () => {
    expect(missingDeliverableError("qa", plan(), new Map(), {})).toBeUndefined();
  });

  it("tells a later step plainly that the file does not exist", () => {
    const text = upstreamFailureNotice("qa", plan(), new Map([["assembler", { status: MISSING_FILE_STATUS, error: REJECTED }]]))!;
    expect(text).toContain('"Deck Assembler"');
    expect(text).toContain("never produced it");
    expect(text).toContain("Expected array, received string");
  });
});

describe("DAGExecutionEngine: missing deliverables", () => {
  let executeWorkerAgent: any;
  beforeEach(async () => {
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
  });

  const run = () =>
    new DAGExecutionEngine().execute({
      executionPlan: plan(),
      stateSchema: {},
      initialState: { request: "build the deck" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

  it("fails the run and warns the reviewer when the file was never made", async () => {
    const qaInputs: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-assembler") return { success: true, output: "## STATE: deck_fill_map ...", failedFileAttempts: [REJECTED] };
      qaInputs.push(input);
      return { success: true, output: "## QA Result: PASS" };
    });

    const result = await run();

    expect(qaInputs[0]).toContain("## UPSTREAM STEPS THAT PRODUCED NOTHING");
    expect(qaInputs[0]).toContain("never produced it");
    expect(result.success).toBe(false);
    expect(result.missingDeliverableNodeIds).toEqual(["assembler"]);
    expect(deriveRunStatus(result)).toBe("failed");
    // The step's own text still counts as completed work.
    expect(result.waveResults[0].nodes[0].status).toBe("completed");
  });

  it("completes normally when a retry inside the step produced the file", async () => {
    const qaInputs: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-assembler") {
        return {
          success: true,
          output: "built",
          failedFileAttempts: [REJECTED],
          generatedFiles: [{ id: "f1", filename: "deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }],
        };
      }
      qaInputs.push(input);
      return { success: true, output: "## QA Result: PASS" };
    });

    const result = await run();

    expect(qaInputs[0]).not.toContain("never produced it");
    expect(result.success).toBe(true);
    expect(result.missingDeliverableNodeIds).toBeUndefined();
    expect(deriveRunStatus(result)).toBe("completed");
  });

  it("leaves runs with no file-producing step exactly as before", async () => {
    executeWorkerAgent.mockImplementation(async () => ({ success: true, output: "text" }));
    const result = await run();
    expect(result.success).toBe(true);
    expect(result.missingDeliverableNodeIds).toBeUndefined();
  });
});
