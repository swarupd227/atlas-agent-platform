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
  recordNodeFilePass,
  upstreamFailureNotice,
  MISSING_FILE_STATUS,
  type NodeFileHistory,
} from "../server/dag-execution-engine";
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

const plan = () =>
  computeWaves(
    [
      node({ id: "assembler", label: "Deck Assembler", refAgentId: "ag-assembler", stateKey: "deck" }),
      node({ id: "qa", label: "QA", refAgentId: "ag-qa", stateKey: "qa" }),
    ],
    [edge("assembler", "qa")],
  );

const REJECTED = "fill_document_template: Invalid template fill spec. (slides: Expected array, received string)";

const history = (h: Partial<NodeFileHistory>) =>
  new Map<string, NodeFileHistory>([["assembler", { passes: 1, producedFile: false, failedAttempts: [], withdrewStaleFile: false, ...h }]]);
const FILE = { id: "f1", filename: "deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

describe("missingDeliverableError", () => {
  it("reports a step whose attempts failed and that has no file in state", () => {
    expect(missingDeliverableError("assembler", plan(), history({ failedAttempts: ["first", REJECTED] }), {})).toBe(REJECTED);
  });

  it("is satisfied once a file from that step is in state, even after failed attempts", () => {
    expect(missingDeliverableError("assembler", plan(), history({ failedAttempts: [REJECTED] }), { deck_files: [FILE] })).toBeUndefined();
  });

  it("explains a file withdrawn because a later pass made no new one", () => {
    const text = missingDeliverableError("assembler", plan(), history({ passes: 2, producedFile: true, withdrewStaleFile: true }), {})!;
    expect(text).toContain("ran again after its inputs were revised");
    expect(text).toContain("withdrawn");
  });

  it("expects nothing of a step that never tried to produce a file", () => {
    expect(missingDeliverableError("qa", plan(), new Map(), {})).toBeUndefined();
  });

  it("tells a later step plainly that the file does not exist", () => {
    const text = upstreamFailureNotice("qa", plan(), new Map([["assembler", { status: MISSING_FILE_STATUS, error: REJECTED }]]))!;
    expect(text).toContain('"Deck Assembler"');
    expect(text).toContain("has no current file");
    expect(text).toContain("Expected array, received string");
  });
});

describe("recordNodeFilePass", () => {
  const pass = (output: Record<string, any>) => ({ nodeId: "assembler", status: "completed", output }) as any;

  it("keeps a file made on the step's only pass", () => {
    const h = new Map<string, NodeFileHistory>();
    const state = { deck: "built", deck_files: [FILE] };
    expect(recordNodeFilePass(pass({ deck: "built", deck_files: [FILE] }), plan(), h, state)).toBe(state);
    expect(h.get("assembler")).toMatchObject({ passes: 1, producedFile: true, withdrewStaleFile: false });
  });

  it("withdraws the earlier file when a re-run makes no new one", () => {
    const h = new Map<string, NodeFileHistory>();
    recordNodeFilePass(pass({ deck_files: [FILE] }), plan(), h, { deck_files: [FILE] });
    const next = recordNodeFilePass(pass({ deck: "the fill map, as text" }), plan(), h, { deck: "the fill map, as text", deck_files: [FILE] });
    expect(next.deck_files).toBeUndefined();
    expect(next.deck).toBe("the fill map, as text");
    expect(h.get("assembler")!.withdrewStaleFile).toBe(true);
  });

  it("is satisfied again when a re-run makes a new file", () => {
    const h = new Map<string, NodeFileHistory>();
    const NEW = { ...FILE, id: "f2" };
    recordNodeFilePass(pass({ deck_files: [FILE] }), plan(), h, {});
    const next = recordNodeFilePass(pass({ deck_files: [NEW] }), plan(), h, { deck_files: [NEW] });
    expect(next.deck_files).toEqual([NEW]);
    expect(missingDeliverableError("assembler", plan(), h, next)).toBeUndefined();
  });

  it("never expects a file from a step that has not made or attempted one", () => {
    const h = new Map<string, NodeFileHistory>();
    const state = { deck: "text" };
    recordNodeFilePass(pass({ deck: "text" }), plan(), h, state);
    expect(recordNodeFilePass(pass({ deck: "text again" }), plan(), h, state)).toBe(state);
    expect(missingDeliverableError("assembler", plan(), h, state)).toBeUndefined();
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
    expect(qaInputs[0]).toContain("has no current file");
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

    expect(qaInputs[0]).not.toContain("has no current file");
    expect(result.success).toBe(true);
    expect(result.missingDeliverableNodeIds).toBeUndefined();
    expect(deriveRunStatus(result)).toBe("completed");
  });

  it("does not let a revision pass that made no new file hide behind the old one", async () => {
    const FAILS = { combinator: "AND", conditions: [{ field: "output", operator: "contains", value: "FAIL" }] };
    const loopPlan = computeWaves(
      [
        node({ id: "architect", label: "Content Architect", refAgentId: "ag-architect", stateKey: "fill_map" }),
        node({ id: "assembler", label: "Deck Assembler", refAgentId: "ag-assembler", stateKey: "deck" }),
        node({
          id: "qa",
          label: "QA",
          refAgentId: "ag-qa",
          stateKey: "qa",
          config: { revision: { targetNodeId: "architect", when: FAILS, maxRounds: 1 } } as any,
        }),
      ],
      [edge("architect", "assembler"), edge("assembler", "qa")],
    );
    let assemblerPasses = 0;
    const qaInputs: string[] = [];
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => {
      if (agentId === "ag-architect") return { success: true, output: "fill map" };
      if (agentId === "ag-assembler") {
        assemblerPasses++;
        // First pass builds the deck; the revision pass only writes text.
        return assemblerPasses === 1
          ? { success: true, output: "built", generatedFiles: [{ ...FILE, id: "stale-deck-id" }] }
          : { success: true, output: "revised fill map, as text" };
      }
      qaInputs.push(input);
      return { success: true, output: qaInputs.length === 1 ? "FAIL: 8 shapes overflow" : "PASS: all overflow resolved" };
    });

    const result = await new DAGExecutionEngine().execute({
      executionPlan: loopPlan,
      stateSchema: {},
      initialState: { request: "build the deck" },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(assemblerPasses).toBe(2);
    expect(qaInputs).toHaveLength(2);
    // The first review saw the real deck...
    expect(qaInputs[0]).toContain("stale-deck-id");
    // ...the second is not handed the out-of-date one, and is told why.
    expect(qaInputs[1]).not.toContain("stale-deck-id");
    expect(qaInputs[1]).toContain("has no current file");
    expect(result.finalState.deck_files).toBeUndefined();
    expect(result.missingDeliverableNodeIds).toEqual(["assembler"]);
    expect(deriveRunStatus(result)).toBe("failed");
  });

  it("leaves runs with no file-producing step exactly as before", async () => {
    executeWorkerAgent.mockImplementation(async () => ({ success: true, output: "text" }));
    const result = await run();
    expect(result.success).toBe(true);
    expect(result.missingDeliverableNodeIds).toBeUndefined();
  });
});
