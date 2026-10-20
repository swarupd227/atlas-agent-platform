/**
 * Human-approval gate nodes in the team-blueprint DAG engine.
 * Proves: computeWaves correctly carries a node's gateType into its plan
 * config (the wiring point executeNode's `nc.nodeType === "edge_gate" ||
 * nc.gateType` check depends on) and that a rejected gate halts the run
 * even under errorStrategy "best_effort", since there is no sensible
 * "continue anyway" for a decision nobody made.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine, DagRunSupersededError } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

// A branch decision calls the decision provider. Mocked so the walk-back test
// below can put a real decision step in the chain, which is the shape every
// live journey has and the shape no fixture had until 2026-10-17.
vi.mock("../server/decision-provider", () => ({
  decide: async () => ({ answer: "Exception required", probabilities: null, confidence: 0.9, engine: "llm", model: "claude-sonnet-4-5", inputTokens: 0, costUsd: 0 }),
}));

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
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

describe("computeWaves — approval gate wiring", () => {
  it("carries gateType through into nodeConfig for an edge_gate node", () => {
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off" });
    const plan = computeWaves([gateNode], []);

    expect(plan.nodeConfig["gate-1"].nodeType).toBe("edge_gate");
    expect(plan.nodeConfig["gate-1"].gateType).toBe("approval");
  });

  it("defaults gateType to null for non-gate nodes", () => {
    const agentNode = node({ id: "agent-1", nodeType: "internal_agent", refAgentId: "agent-xyz" });
    const plan = computeWaves([agentNode], []);

    expect(plan.nodeConfig["agent-1"].gateType).toBeNull();
  });
});

describe("DAGExecutionEngine — approval gate execution", () => {
  it("halts the run when a gate is rejected, even under best_effort", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: false, reason: "Rejected by reviewer" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(false);
    // executeGateNode forwards a 7th arg (config.resumePendingApprovalId, for
    // resuming a paused run into the same in-flight approval) -- unset here,
    // so undefined -- and an 8th (approvalMeta: the human-readable name and
    // description for the Approvals page). toHaveBeenCalledWith requires an
    // exact arg-count match, so this must list all 8 positions or the
    // assertion fails regardless of whether the first 6 are individually
    // correct.
    expect(waitForApproval).toHaveBeenCalledWith(
      "team-1",
      "Manager Sign-off",
      "approval",
      expect.any(String),
      expect.any(Number),
      expect.any(Function),
      undefined,
      expect.objectContaining({ objectName: expect.any(String), description: expect.any(String) }),
    );
  });

  it("continues past an approved gate and merges its result into state", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(true);
    // toMatchObject: an approved gate also writes decidedOn, approvedOutput and a standing sentence saying what was approved.
    expect(result.finalState.gate_result).toMatchObject({ approved: true, decidedBy: "user-1" });
  });

  it("carries the approval's own id into state, so a later write can cite it", async () => {
    // A connector that demands proof of approval before it will change a record
    // has to be given something real. With only { approved, decidedBy } in
    // state, the writing agent either invents a reference or refuses to write,
    // and the run finishes having changed nothing -- seen live on a CMDB
    // ownership run that approved three items and wrote none of them.
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1", approvalId: "apr-77" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: computeWaves([gateNode], []),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.finalState.gate_result).toMatchObject({ approved: true, decidedBy: "user-1", approvalId: "apr-77" });
  });

  it("falls back to the id the gate was created with when the wait doesn't report one", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-123");
      return { approved: true, decidedBy: "user-1" };
    });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: computeWaves([gateNode], []),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.finalState.gate_result).toMatchObject({ approved: true, decidedBy: "user-1", approvalId: "approval-123" });
  });

  it("fires onApprovalPending with the node id and created approval id before the wait resolves", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-123");
      return { approved: true, decidedBy: "user-1" };
    });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const plan = computeWaves([gateNode], []);

    const onApprovalPending = vi.fn();
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalPending,
    });

    expect(onApprovalPending).toHaveBeenCalledWith("gate-1", "approval-123");
  });

  it("routes past a gate via a deterministic edge rule whose field doesn't match the gate's actual output shape", async () => {
    // Reproduces a live bug: an edge synced from Process Flow Studio carried
    // a deterministic rule authored against the gate's natural-language
    // condition ("Order confirmed by advisor" -> field "confirmed"), but
    // executeGateNode always emits {approved, decidedBy} -- never
    // "confirmed". The rule silently evaluated false forever, skipping
    // every wave downstream of an approval that had actually succeeded.
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "Expert Validator" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "dispatched" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Service Advisor Confirmation", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const mismatchedEdge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null,
      condition: "Order confirmed by advisor",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "confirmed", operator: "==", value: true }] },
      config: null,
    } as unknown as TeamBlueprintEdge;

    const plan = computeWaves([gateNode, downstream], [mismatchedEdge]);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    const nodes = result.waveResults.flatMap(w => w.nodes);
    expect(nodes.find(n => n.nodeId === "next-1")?.status).toBe("completed");
    expect(result.success).toBe(true);
  });

  it("skips past a gate via a deterministic edge rule whose field doesn't match, when the gate was rejected", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: false, decidedBy: "Expert Validator" });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "should not run" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Service Advisor Confirmation", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const mismatchedEdge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null,
      condition: "Order confirmed by advisor",
      evaluationMode: "deterministic",
      rule: { combinator: "AND", conditions: [{ field: "confirmed", operator: "==", value: true }] },
      config: null,
    } as unknown as TeamBlueprintEdge;

    const plan = computeWaves([gateNode, downstream], [mismatchedEdge]);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan,
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect(result.success).toBe(false);
  });
});

describe("DAGExecutionEngine — approval identity on the Approvals page", () => {
  // Live 2026-09-08: three pending gates from three runs of the same blueprint
  // all read "Manual Review Approval Gate", and the reviewer could not tell
  // which was which ("I can't make out with the IDs"). The name now carries
  // the team, the request and the run; the description leads with the artifact
  // being approved rather than a flat dump of the whole state.
  it("names the approval with team, request and run, and leads the description with the upstream output", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "the outline" });

    // A real label, because what this asserts is that the card names the step
    // the way its author did and never shows the key it writes under.
    const producer = node({ id: "arch", refAgentId: "agent-arch", stateKey: "slide_outline", label: "Draft the slide outline" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manual Review", stateKey: "gate_result" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "arch", targetNodeId: "gate-1", label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([producer, gateNode], [edge]),
      stateSchema: {},
      initialState: { request: "Campaign brief — Operation Power Play.\nMarkets: DE/AT." },
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      teamAgentName: "Marcom Deck Team",
      dagRunId: "9721c414-d419-4d73-8c10-d88b9620638c",
    });

    const meta = (waitForApproval as any).mock.calls.at(-1)[7];
    expect(meta.objectName).toBe("Manual Review · Marcom Deck Team · Campaign brief — Operation Power Play. · run 9721c414");
    // The thing being decided comes first, before any other state.
    expect(meta.description).toContain("--- For your decision: Draft the slide outline ---");
    expect(meta.description.indexOf("For your decision")).toBeLessThan(meta.description.indexOf("Everything else from this run") === -1 ? Infinity : meta.description.indexOf("Everything else from this run"));
    expect(meta.description).toContain("the outline");
    expect(meta.description).toContain("Reference: run 9721c414-d419-4d73-8c10-d88b9620638c");

    // And it is read by whoever has to decide, who may never have heard of this
    // platform: no internal vocabulary, and the step's storage key stays out of
    // the words even though its content is the subject of the card.
    expect(meta.description).not.toContain("HITL");
    expect(meta.description).not.toContain("Pipeline");
    expect(meta.description.split("\n")[0]).toBe("Manual Review — waiting for your decision");
    // Including the keys the engine derives beside a step's own. These are kept
    // -- "connector calls were not recorded" is something an approver should
    // weigh -- but named, not shown as slide_outline_verified.
    expect(meta.description).not.toContain("slide_outline_verified");
    expect(meta.description).toContain("Draft the slide outline — connector calls recorded");

    // Structured evidence (evidenceJson) alongside the text description, so the Approvals UI can render a real
    // run summary (client/src/components/gate-evidence.tsx) instead of only the flattened text blob above.
    expect(meta.evidenceJson.runId).toBe("9721c414-d419-4d73-8c10-d88b9620638c");
    expect(meta.evidenceJson.teamAgentId).toBe("team-1");
    expect(meta.evidenceJson.teamAgentName).toBe("Marcom Deck Team");
    expect(meta.evidenceJson.gateLabel).toBe("Manual Review");
    expect(meta.evidenceJson.upstreamSteps).toEqual([
      {
        label: "Draft the slide outline",
        stateKey: "slide_outline",
        preview: "the outline",
        // Whether the step's claims rested on a connector call, in front of the
        // person deciding rather than only in the flattened text.
        verified: { captured: false, why: expect.any(String) },
      },
    ]);
  });

  it("captures a PASS/FAIL verdict line from an upstream step's output in the gate's evidenceJson", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "## Deck Build QA: PASS\nEvery slide checked." });

    const qaNode = node({ id: "qa", refAgentId: "agent-qa", label: "Deck Build QA", stateKey: "qa_result" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Sign-off", stateKey: "gate_result" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "qa", targetNodeId: "gate-1", label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([qaNode, gateNode], [edge]),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      teamAgentName: "Deck Studio",
      dagRunId: "run-2",
    });

    const evidence = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson;
    expect(evidence.upstreamSteps).toEqual([
      {
        label: "Deck Build QA", stateKey: "qa_result",
        preview: "## Deck Build QA: PASS\nEvery slide checked.", verdict: "## Deck Build QA: PASS",
        verified: { captured: false, why: expect.any(String) },
      },
    ]);
  });

  /**
   * What the gate rests on, in front of the person deciding.
   *
   * Live 2026-10-16: a gate asked for approval of a placement where the step
   * before it had emitted {evaluated: 0, verdict: "UNDETERMINED: the ratings
   * step did not report any carriers"}. The card showed a 600-character prose
   * preview and a green tick beside every step, including ones whose own
   * record said no connector call had been made. The fields and the
   * verification record were both already in state; neither reached the card.
   */
  it("puts an upstream step's own fields on the evidence, not just its prose", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    // An agent answers in text; the engine parses the JSON out of it. An
    // Expression stores the object directly. Both reach the card the same way.
    (executeWorkerAgent as any).mockResolvedValue({
      success: true,
      output: JSON.stringify({ evaluated: 0, exceptionRequired: false, verdict: "UNDETERMINED: the ratings step did not report any carriers" }),
    });

    // The shared mock returns null for every parse, which is right for the other
    // tests here and would make this one assert nothing. Pointed at real parsing
    // for this test, and put back afterwards so no later test inherits it.
    const { extractStructuredOutput } = await import("../server/agent-runtime");
    const parseReal = (t: unknown) => { try { return typeof t === "string" ? JSON.parse(t) : null; } catch { return null; } };
    (extractStructuredOutput as any).mockImplementation(parseReal);

    const check = node({ id: "chk", refAgentId: "agent-chk", label: "Rating Floor Check", stateKey: "rating_floor_check" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Placement Approval", stateKey: "gate_result" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "chk", targetNodeId: "gate-1", label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([check, gateNode], [edge]),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      teamAgentName: "Insurer Selection",
      dagRunId: "run-3",
    });

    const [step] = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    // The number that decides whether this gate should have been raised at all.
    expect(step.fields).toMatchObject({ evaluated: "0", exceptionRequired: "false" });
    expect(String(step.fields.verdict)).toContain("UNDETERMINED");
    // And the prose preview stays, so nothing an approver had before is lost.
    expect(step.preview).toBeDefined();
    (extractStructuredOutput as any).mockReturnValue(null);
  });

  it("does not claim a step was verified when nothing recorded a connector call", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "a conclusion resting on nothing recorded" });

    const producer = node({ id: "p", refAgentId: "agent-p", label: "Analyst", stateKey: "analysis" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Sign-off", stateKey: "gate_result" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "p", targetNodeId: "gate-1", label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([producer, gateNode], [edge]),
      stateSchema: {}, initialState: {}, errorStrategy: "best_effort",
      teamAgentId: "team-1", teamAgentName: "Team", dagRunId: "run-4",
    });

    const [step] = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    expect(step.verified.captured).toBe(false);
    // The reason travels with it: "not verified" without why is not actionable.
    expect(typeof step.verified.why).toBe("string");
    expect(step.verified.why.length).toBeGreaterThan(0);
  });

  it("falls back to the bare gate label when the caller supplies no run identity", async () => {
    const { waitForApproval } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });

    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([gateNode], []),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
    });

    expect((waitForApproval as any).mock.calls.at(-1)[7].objectName).toBe("Manager Sign-off");
  });
});

describe("DAGExecutionEngine — approval resume ownership (double-fire guard)", () => {
  // Reproduces a live bug: after a human approved a gate, the PATCH
  // fast-path resumed the run in a fresh strand while the original
  // in-process waiter (10s polling) also woke up and continued. Both
  // strands ran the downstream nodes; the loser then overwrote the
  // winner's "completed" with "failed". The engine now asks
  // onApprovalDecided whether this strand still owns the run and stands
  // down (DagRunSupersededError) when it doesn't.
  function gatePlan() {
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Manager Sign-off", stateKey: "gate_result" });
    const downstream = node({ id: "next-1", nodeType: "internal_agent", refAgentId: "agent-next", stateKey: "next_out" });
    const edge = {
      id: "e1", blueprintId: "bp1", sourceNodeId: "gate-1", targetNodeId: "next-1",
      label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
      failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge;
    return computeWaves([gateNode, downstream], [edge]);
  }

  it("stands down without running downstream nodes when another strand already claimed the resume, even under best_effort", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-777");
      return { approved: true, decidedBy: "user-1" };
    });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "should not run" });

    const onApprovalDecided = vi.fn().mockResolvedValue(false);
    const engine = new DAGExecutionEngine();
    await expect(engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalDecided,
    })).rejects.toBeInstanceOf(DagRunSupersededError);

    expect(onApprovalDecided).toHaveBeenCalledWith("gate-1", "approval-777");
    expect(executeWorkerAgent).not.toHaveBeenCalled();
  });

  it("continues normally when this strand wins the claim", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockImplementation(async (_a: any, _b: any, _c: any, _d: any, _e: any, onCreated: (id: string) => void) => {
      onCreated("approval-778");
      return { approved: true, decidedBy: "user-1" };
    });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "ran" });

    const onApprovalDecided = vi.fn().mockResolvedValue(true);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      onApprovalDecided,
    });

    expect(result.success).toBe(true);
    expect(executeWorkerAgent).toHaveBeenCalledTimes(1);
  });

  it("does not re-claim on a resumed strand, which already owns the run by construction", async () => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockClear();
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "ran" });

    const onApprovalDecided = vi.fn().mockResolvedValue(false);
    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: gatePlan(),
      stateSchema: {},
      initialState: {},
      errorStrategy: "best_effort",
      teamAgentId: "team-1",
      resumeFromWave: 1,
      resumePendingApprovalId: "approval-779",
      onApprovalDecided,
    });

    expect(onApprovalDecided).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

/**
 * The verdict one hop further back.
 *
 * Gate evidence was built from incomingEdges alone, so a gate fed by a prose
 * summary showed the summary and nothing else. Live 2026-10-17: the card
 * carried "Placement Analyst - Quote Comparison" (markdown, no fields) while
 * the step behind it had emitted {evaluated: 0, verdict: "UNDETERMINED: the
 * ratings step did not report any carriers"}. A person was asked to approve a
 * placement where nothing had been evaluated, and the number saying so was one
 * step out of view.
 */
describe("a gate fed by prose, with the computed verdict behind it", () => {
  const parseReal = (t: unknown) => { try { return typeof t === "string" ? JSON.parse(t) : null; } catch { return null; } };

  const chain = () => {
    // check -> analyst(prose) -> gate
    const check = node({ id: "chk", refAgentId: "agent-chk", label: "Rating Floor Check", stateKey: "rating_floor_check" });
    const analyst = node({ id: "an", refAgentId: "agent-an", label: "Placement Analyst", stateKey: "compare_quotes" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Placement Approval", stateKey: "gate_result" });
    const e = (from: string, to: string) => ({
      id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge);
    return { nodes: [check, analyst, gateNode], edges: [e("chk", "an"), e("an", "gate-1")] };
  };

  it("walks back past the prose step and puts the computed fields on the card", async () => {
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockImplementation(parseReal);
    // executeWorkerAgent(agentId, teamAgent, input, ...) -- the agent id is what
    // distinguishes the two steps here.
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => {
      return agentId === "agent-chk"
        ? { success: true, output: JSON.stringify({ evaluated: 0, verdict: "UNDETERMINED: the ratings step did not report any carriers" }) }
        : { success: true, output: "# PLACEMENT ANALYSIS\nProse, no fields." };
    });

    const { nodes, edges } = chain();
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves(nodes, edges), stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1", teamAgentName: "Insurer Selection", dagRunId: "run-ind",
    });

    const steps = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    const direct = steps.find((x: any) => !x.indirect);
    const behind = steps.find((x: any) => x.indirect);
    // The direct input is still first and still shown: nothing is replaced.
    expect(direct.stateKey).toBe("compare_quotes");
    // And the verdict that decides whether this gate should exist is now there.
    expect(behind, "no earlier step was carried forward").toBeTruthy();
    expect(behind.stateKey).toBe("rating_floor_check");
    expect(behind.fields).toMatchObject({ evaluated: "0" });
    expect(String(behind.fields.verdict)).toContain("UNDETERMINED");
    (extractStructuredOutput as any).mockReturnValue(null);
  });

  it("terminates on a graph that loops back, instead of walking it forever", async () => {
    // A back edge has reached a real blueprint before and made the whole team
    // unrunnable, so the walk cannot assume a DAG. What guarantees this
    // terminates is the hop cap, not the revisit guard: removing `seen` and
    // running this still passes, which was worth checking rather than assuming.
    // The guard's own job is tested by the diamond below.
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockReturnValue(null);
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: "prose, no fields anywhere" });

    const a = node({ id: "a", refAgentId: "agent-a", label: "A", stateKey: "a_out" });
    const b = node({ id: "b", refAgentId: "agent-b", label: "B", stateKey: "b_out" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Gate", stateKey: "gate_result" });
    const e = (from: string, to: string) => ({
      id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge);

    // The gate's own plan is computed from the acyclic part; the loop a <-> b
    // is what the walk back has to survive.
    const plan = computeWaves([a, b, gateNode], [e("a", "b"), e("b", "gate-1")]);
    (plan as any).incomingEdges = { ...(plan as any).incomingEdges, a: [{ sourceNodeId: "b", targetNodeId: "a" }] };

    const engine = new DAGExecutionEngine();
    const run = engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1", teamAgentName: "T", dagRunId: "run-loop",
    });
    // If the walk did not terminate this never settles and the suite times out.
    await expect(run).resolves.toBeDefined();
    const steps = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    // Nothing emitted fields, so nothing is carried forward -- the point is that
    // it finished deciding that.
    expect(steps.filter((x: any) => x.indirect)).toHaveLength(0);
  });

  it("carries a shared ancestor once, not once per path into the gate", async () => {
    // Two direct steps, both prose, both fed by the same computed step. Without
    // the revisit guard that ancestor is added twice and the card repeats
    // itself. This is what `seen` is for -- the loop test above is about the
    // hop cap.
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockImplementation((t: unknown) => { try { return typeof t === "string" ? JSON.parse(t) : null; } catch { return null; } });
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) =>
      agentId === "agent-src"
        ? { success: true, output: JSON.stringify({ evaluated: 0 }) }
        : { success: true, output: "prose" });

    const src = node({ id: "src", refAgentId: "agent-src", label: "Rating Floor Check", stateKey: "floor_check" });
    const l = node({ id: "l", refAgentId: "agent-l", label: "Left", stateKey: "left_out" });
    const r = node({ id: "r", refAgentId: "agent-r", label: "Right", stateKey: "right_out" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Gate", stateKey: "gate_result" });
    const e = (from: string, to: string) => ({
      id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge);

    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([src, l, r, gateNode], [e("src", "l"), e("src", "r"), e("l", "gate-1"), e("r", "gate-1")]),
      stateSchema: {}, initialState: {}, errorStrategy: "best_effort",
      teamAgentId: "team-1", teamAgentName: "T", dagRunId: "run-diamond",
    });

    const steps = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    const behind = steps.filter((x: any) => x.indirect);
    expect(behind).toHaveLength(1);
    expect(behind[0].stateKey).toBe("floor_check");
    (extractStructuredOutput as any).mockReturnValue(null);
  });

  it("walks past a branch decision, which records how it chose rather than what about", async () => {
    // Live 2026-10-17: the walk stopped at "Floor Met?" and put
    // model: "claude-sonnet-4-5" and the prompt on the card, while the step one
    // hop further back held {evaluated: 0, verdict: "UNDETERMINED..."}. A branch
    // decision's output always parses, so "has fields" was true for the wrong
    // reason. Process metadata that looks substantive is worse than none.
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockImplementation((t: unknown) => { try { return typeof t === "string" ? JSON.parse(t) : null; } catch { return null; } });
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) =>
      agentId === "agent-chk"
        ? { success: true, output: JSON.stringify({ evaluated: 0, verdict: "UNDETERMINED: the ratings step did not report any carriers" }) }
        : { success: true, output: "# PLACEMENT ANALYSIS\nProse, no fields." });

    const check = node({ id: "chk", refAgentId: "agent-chk", label: "Rating Floor Check", stateKey: "rating_floor_check" });
    const decide = { ...node({ id: "dec", refAgentId: null, label: "Floor Met?", stateKey: "floor_met" }), nodeType: "decision", config: { decision: { question: "Did the rating floor check clear?", options: [{ label: "Floor met" }, { label: "Exception required" }] } } } as any;
    const analyst = node({ id: "an", refAgentId: "agent-an", label: "Placement Analyst", stateKey: "compare_quotes" });
    const gateNode = node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Placement Approval", stateKey: "gate_result" });
    const e = (from: string, to: string) => ({
      id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
      allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
    } as unknown as TeamBlueprintEdge);

    const callsBefore = (waitForApproval as any).mock.calls.length;
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves([check, decide, analyst, gateNode], [e("chk", "dec"), e("dec", "an"), e("an", "gate-1")]),
      stateSchema: {}, initialState: {}, errorStrategy: "best_effort",
      teamAgentId: "team-1", teamAgentName: "Insurer Selection", dagRunId: "run-dec-chain",
    });

    const calls = (waitForApproval as any).mock.calls;
    // Mocks are not cleared in this file: without this the assertions below
    // would read the previous test's gate and pass or fail for its reasons.
    expect(calls.length, "the gate in THIS run never asked for approval").toBe(callsBefore + 1);
    const steps = calls.at(-1)[7].evidenceJson.upstreamSteps;
    const behind = steps.filter((x: any) => x.indirect);
    expect(behind, "nothing was carried forward").toHaveLength(1);
    // The business verdict, not the decision's own record of how it chose.
    expect(behind[0].stateKey).toBe("rating_floor_check");
    expect(behind[0].fields).toMatchObject({ evaluated: "0" });
    expect(JSON.stringify(behind[0].fields)).not.toContain("claude-sonnet");
    (extractStructuredOutput as any).mockReturnValue(null);
  });

  it("adds nothing when the direct step already computed fields", async () => {
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockImplementation(parseReal);
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output: JSON.stringify({ evaluated: 4 }) });

    const { nodes, edges } = chain();
    const engine = new DAGExecutionEngine();
    await engine.execute({
      executionPlan: computeWaves(nodes, edges), stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1", teamAgentName: "T", dagRunId: "run-ind2",
    });

    const steps = (waitForApproval as any).mock.calls.at(-1)[7].evidenceJson.upstreamSteps;
    // The walk stops at the first step with fields, and the direct one has them,
    // so nothing further back is dragged onto the card.
    expect(steps.filter((x: any) => x.indirect)).toHaveLength(0);
    (extractStructuredOutput as any).mockReturnValue(null);
  });
});

/**
 * What must hold before a person is asked at all.
 *
 * Live, three runs in a row: a gate asked for approval of a placement where
 * the upstream check had emitted {evaluated: 0, verdict: "UNDETERMINED: the
 * ratings step did not report any carriers"}. Showing that on the card tells
 * the approver; it does not stop the asking. A precondition does.
 *
 * Opt-in: a gate without one behaves exactly as before, which is why every
 * other test in this file is untouched.
 */
describe("a gate's precondition", () => {
  const gateWith = (precondition: unknown) => ({
    ...node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Placement Approval", stateKey: "gate_result" }),
    config: precondition ? { precondition } : {},
  });
  const producer = () => node({ id: "p", refAgentId: "agent-p", label: "Rating Floor Check", stateKey: "floor_check" });
  const link = {
    id: "e1", blueprintId: "bp1", sourceNodeId: "p", targetNodeId: "gate-1", label: null, contentPartTypes: [],
    allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
  } as unknown as TeamBlueprintEdge;
  const EVALUATED_AT_LEAST_ONE = { combinator: "and", conditions: [{ field: "evaluated", operator: ">=", value: 1 }] } as any;

  const runWith = async (precondition: unknown, output: string, dagRunId: string) => {
    const { waitForApproval, executeWorkerAgent, extractStructuredOutput } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (extractStructuredOutput as any).mockImplementation((t: unknown) => { try { return typeof t === "string" ? JSON.parse(t) : null; } catch { return null; } });
    (executeWorkerAgent as any).mockResolvedValue({ success: true, output });
    // Mocks are not cleared between tests in this file, so the only honest
    // measure is how many calls THIS run adds.
    const before = (waitForApproval as any).mock.calls.length;
    const engine = new DAGExecutionEngine();
    const res = await engine.execute({
      executionPlan: computeWaves([producer(), gateWith(precondition)], [link]),
      stateSchema: {}, initialState: {}, errorStrategy: "best_effort",
      teamAgentId: "team-1", teamAgentName: "Insurer Selection", dagRunId,
    });
    (extractStructuredOutput as any).mockReturnValue(null);
    const raised = (waitForApproval as any).mock.calls.length - before;
    return { res, waitForApproval, raised };
  };

  it("does not ask anyone when it is not met, and says what was missing", async () => {
    const { res, raised } = await runWith(
      EVALUATED_AT_LEAST_ONE,
      JSON.stringify({ evaluated: 0, verdict: "UNDETERMINED: the ratings step did not report any carriers" }),
      "run-pre-1",
    );
    // The point of the whole thing: no approval was raised by this run.
    expect(raised).toBe(0);
    // And the run says why, naming the gate and what the rule read, so this is
    // distinguishable from "somebody refused it".
    const gateStep = (res as any).nodeResults?.["gate-1"] ?? (res as any).results?.["gate-1"];
    const text = JSON.stringify(res);
    expect(text).toContain("precondition is not met");
    expect(text).toContain("evaluated");
    void gateStep;
  });

  it("asks as normal when it is met", async () => {
    const { raised } = await runWith(
      EVALUATED_AT_LEAST_ONE,
      JSON.stringify({ evaluated: 4, verdict: "Exception required" }),
      "run-pre-2",
    );
    expect(raised).toBe(1);
  });

  it("asks as normal when the gate has no precondition at all", async () => {
    const { raised } = await runWith(
      null,
      JSON.stringify({ evaluated: 0, verdict: "UNDETERMINED" }),
      "run-pre-3",
    );
    // Opt-in: the same state that fails the rule above must still raise a gate
    // on a gate that never declared one, or this would change every team.
    expect(raised).toBe(1);
  });
});

/**
 * A gate downstream of a step that failed is not raised.
 *
 * Live 2026-10-19 (Workers' Comp journey, run 22762715, best_effort): the
 * class-verification agent timed out, nothing was recorded, and the run still
 * asked the underwriter to approve the class disposition -- then four more
 * gates over the same hole. Not opt-in: unlike a precondition, no author means
 * "ask anyway over a step that produced nothing".
 */
describe("a gate downstream of a failed step", () => {
  const gate = () => node({ id: "gate-1", nodeType: "edge_gate", gateType: "approval", label: "Underwriter Class Disposition", stateKey: "class_disposition" });
  const step = (id: string, label: string, extra: Partial<TeamBlueprintNode> = {}) => node({ id, refAgentId: `agent-${id}`, label, stateKey: id, ...extra });
  const link = (from: string, to: string) => ({
    id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, contentPartTypes: [],
    allowedMetadata: null, slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: null, rule: null, config: null,
  } as unknown as TeamBlueprintEdge);

  const runWith = async (nodes: TeamBlueprintNode[], edges: TeamBlueprintEdge[], failing: string[], extra: Record<string, unknown> = {}) => {
    const { waitForApproval, executeWorkerAgent } = await import("../server/agent-runtime");
    (waitForApproval as any).mockResolvedValue({ approved: true, decidedBy: "user-1" });
    (executeWorkerAgent as any).mockImplementation(async (agentId: string) => failing.includes(agentId)
      ? { success: false, output: "", step: { error: "Agent timed out after 180000ms" } }
      : { success: true, output: JSON.stringify({ findings: 1 }) });
    const before = (waitForApproval as any).mock.calls.length;
    const res = await new DAGExecutionEngine().execute({
      executionPlan: computeWaves(nodes, edges),
      stateSchema: {}, initialState: {}, errorStrategy: "best_effort",
      teamAgentId: "team-1", dagRunId: "run-hole-1", ...extra,
    });
    (executeWorkerAgent as any).mockReset();
    return { res, raised: (waitForApproval as any).mock.calls.length - before };
  };

  it("does not ask anyone when a step feeding it failed, says which step and why, and halts the run", async () => {
    const { res, raised } = await runWith(
      [step("verify", "Verify Class Assignment"), gate()],
      [link("verify", "gate-1")],
      ["agent-verify"],
    );
    expect(raised).toBe(0);
    expect(res.success).toBe(false);
    const g = res.waveResults.flatMap((w) => w.nodes).find((n) => n.nodeId === "gate-1");
    expect(g?.status).toBe("failed");
    expect(g?.error).toContain('"Underwriter Class Disposition" was not raised');
    expect(g?.error).toContain('"Verify Class Assignment" failed (Agent timed out after 180000ms)');
  });

  it("looks past the gate's direct input: a failure two steps back still stops it", async () => {
    const { raised, res } = await runWith(
      [step("verify", "Verify Class Assignment"), step("summary", "Summarize Findings"), gate()],
      [link("verify", "summary"), link("summary", "gate-1")],
      ["agent-verify"],
    );
    expect(raised).toBe(0);
    expect(res.success).toBe(false);
  });

  it("does not run what lies past the gate", async () => {
    const { res } = await runWith(
      [step("verify", "Verify Class Assignment"), gate(), step("record", "Record Class Acceptance")],
      [link("verify", "gate-1"), link("gate-1", "record")],
      ["agent-verify"],
    );
    expect(res.waveResults.flatMap((w) => w.nodes).find((n) => n.nodeId === "record")?.status).not.toBe("completed");
  });

  it("asks as normal when the failed step has a fallback output its author chose", async () => {
    const { raised } = await runWith(
      [step("verify", "Verify Class Assignment", { fallbackOutput: { findings: 0, note: "verification unavailable" } as any }), gate()],
      [link("verify", "gate-1")],
      ["agent-verify"],
    );
    expect(raised).toBe(1);
  });

  it("asks as normal when the failure is on a branch that does not feed it", async () => {
    const { raised } = await runWith(
      [step("verify", "Verify Class Assignment"), step("notify", "Notify Broker"), gate()],
      [link("verify", "gate-1")],
      ["agent-notify"],
    );
    expect(raised).toBe(1);
  });

  it("asks as normal when everything feeding it completed", async () => {
    const { raised } = await runWith([step("verify", "Verify Class Assignment"), gate()], [link("verify", "gate-1")], []);
    expect(raised).toBe(1);
  });
});
