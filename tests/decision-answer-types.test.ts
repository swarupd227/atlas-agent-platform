/**
 * Classify and Score as answer types of the decision step (Phase 3, item 1).
 *
 * The same node, a different answer: "classify" writes one of the step's own
 * options to state, "score" writes a level index on its ladder, and rules
 * downstream read the value as a plain field. Neither needs branches or the
 * platform flag; both keep their record under <key>_decision. The branch
 * answer type is exactly what it was.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { classifyStep, explainKind, decisionAnswerType, decisionOptionsFor, decisionLevelsFor } from "../shared/flow-execution-kind";
import { stepCorrelation, stepUnchanged } from "../shared/process-flow-correlation";
import { decisionOutcomeOf, buildRunOverlay } from "../shared/run-overlay";
import type { ProcessNode } from "../shared/process-flow";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
  waitForApproval: vi.fn().mockResolvedValue({ approved: true, decidedBy: "admin", approvalId: "a1" }),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: (text: Map<string, string>, _labels: Map<string, string>, keys: Map<string, string>) => {
    const state: Record<string, unknown> = {};
    for (const [id, t] of text) { try { const v = JSON.parse(t); state[keys.get(id) ?? id] = v; } catch { state[keys.get(id) ?? id] = t; } }
    return state;
  },
}));
const decideMock = vi.fn();
vi.mock("../server/decision-provider", () => ({ decide: (req: any) => decideMock(req) }));

const { computeWaves, DAGExecutionEngine, DECISION_RECORD_SUFFIX } = await import("../server/dag-execution-engine");

const step = (config: Record<string, unknown>): ProcessNode => ({ id: "d1", type: "make_decision", label: "Risk tier", description: "How risky is this submission?", config } as ProcessNode);
const classifyCfg = { answerType: "classify", options: [{ label: "low", description: "Nothing unusual" }, { label: "high", description: "Coastal, large TIV or prior losses" }] };
const scoreCfg = { answerType: "score", levels: ["clean", "minor issues", "serious issues"] };

describe("classifyStep — answer types", () => {
  it("makes a classify or score step a decision with no flag and no branches, given its options or levels", () => {
    expect(classifyStep(step(classifyCfg))).toBe("decision");
    expect(classifyStep(step(scoreCfg))).toBe("decision");
    expect(classifyStep(step({ answerType: "classify", options: ["only one"] }))).toBe("agent");
    expect(classifyStep(step({ answerType: "score", levels: ["one"] }))).toBe("agent");
    expect(decisionAnswerType(classifyCfg)).toBe("classify");
    expect(decisionAnswerType({})).toBe("branch");
    expect(decisionOptionsFor({ options: ["a", " b ", { label: "c", description: "see" }, "a"] })).toEqual([{ label: "a" }, { label: "b" }, { label: "c", description: "see" }]);
    expect(decisionLevelsFor({ levels: new Array(11).fill("x") })).toEqual([]);
  });

  it("is not read as decided-by-its-edges when its edges are rules over the value it writes", () => {
    const rules = [{ to: "a", condition: "risk_tier equals high" }, { to: "b", condition: "risk_tier equals low" }];
    expect(classifyStep(step(classifyCfg), { outgoingEdges: rules })).toBe("decision");
    // A branch decision with all-rule edges is still structural, as before.
    expect(classifyStep(step({ decisionKind: true }), { outgoingEdges: rules })).toBe("structural");
  });

  it("explains each answer type in its own words", () => {
    expect(explainKind(step(classifyCfg))).toContain("picks one of the answers and saves it on the file");
    expect(explainKind(step(scoreCfg))).toContain("picks a level on the scale and saves it on the file");
  });
});

describe("stepCorrelation — a decision's question is part of what changed", () => {
  const stored = (config: Record<string, unknown>) => stepCorrelation(step(config) as any);
  it("sees an edit confined to the answer type, question, options, levels or threshold", () => {
    const before = stored(classifyCfg);
    expect(stepUnchanged(before, step(classifyCfg) as any)).toBe(true);
    expect(stepUnchanged(before, step({ ...classifyCfg, question: "Which tier?" }) as any)).toBe(false);
    expect(stepUnchanged(before, step({ ...classifyCfg, options: [...classifyCfg.options, { label: "medium" }] }) as any)).toBe(false);
    expect(stepUnchanged(before, step({ ...classifyCfg, confidenceThreshold: 0.9 }) as any)).toBe(false);
    expect(stepUnchanged(before, step(scoreCfg) as any)).toBe(false);
  });
  it("leaves a legacy row without the field unchanged when the step has no decision config", () => {
    const legacy = { ...stored({}), sourceDecision: undefined } as any;
    delete legacy.sourceDecision;
    expect(stepUnchanged(legacy, step({}) as any)).toBe(true);
    expect(stored({}).sourceDecision).toBeNull();
  });
});

// ── the engine ──────────────────────────────────────────────────────────────
function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1", blueprintId: "bp1", nodeType: "internal_agent", label: "Node", positionX: 0, positionY: 0,
    refAgentId: "agent-1", refRemoteAgentId: null, refToolIds: [], refPolicyId: null, gateType: null, config: null,
    createdAt: new Date(), stateKey: "node_output", outputSchema: null, fallbackOutput: null, timeoutMs: 30000,
    retryPolicy: null, refTeamAgentId: null, outputContractId: null, refSkillId: null, ...overrides,
  } as TeamBlueprintNode;
}
function edge(overrides: Partial<TeamBlueprintEdge>): TeamBlueprintEdge {
  return {
    id: "e1", blueprintId: "bp1", sourceNodeId: "n1", targetNodeId: "n2", label: null, contentPartTypes: [], allowedMetadata: null,
    slaTimeoutMs: null, failureMode: null, retryPolicy: null, condition: null, evaluationMode: "ai", rule: null, config: null, ...overrides,
  } as unknown as TeamBlueprintEdge;
}
const rule = (field: string, value: unknown) => ({ combinator: "AND", conditions: [{ field, operator: "==", value }] });

function graph(decision: Record<string, unknown>, stateKey: string) {
  const nodes = [
    node({ id: "intake", label: "Intake", stateKey: "intake", refAgentId: "agent-intake" }),
    node({ id: "decide", label: "Risk tier", nodeType: "decision", refAgentId: null, stateKey, config: { decision } as any }),
    node({ id: "fast", label: "Fast track", stateKey: "fast", refAgentId: "agent-fast" }),
    node({ id: "slow", label: "Full review", stateKey: "slow", refAgentId: "agent-slow" }),
  ];
  const edges = [
    edge({ id: "e0", sourceNodeId: "intake", targetNodeId: "decide" }),
    edge({ id: "e1", sourceNodeId: "decide", targetNodeId: "fast", evaluationMode: "deterministic", condition: `${stateKey} equals low`, rule: rule(stateKey, decision.answerType === "score" ? 0 : "low") as any }),
    edge({ id: "e2", sourceNodeId: "decide", targetNodeId: "slow", evaluationMode: "deterministic", condition: `${stateKey} equals high`, rule: rule(stateKey, decision.answerType === "score" ? 2 : "high") as any }),
  ];
  return { nodes, edges, plan: computeWaves(nodes, edges) };
}
const run = (plan: ReturnType<typeof computeWaves>) =>
  new DAGExecutionEngine().execute({ executionPlan: plan, stateSchema: {}, initialState: { request: "coastal warehouse, 3 prior losses" }, errorStrategy: "best_effort", teamAgentId: "team-1", organizationId: "org-9" } as any);
const statuses = (result: any) => Object.fromEntries(result.waveResults.flatMap((w: any) => w.nodes).map((n: any) => [n.nodeId, n.status]));
const outputOf = (result: any, id: string) => result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === id)?.output;

beforeEach(() => { decideMock.mockReset(); });

describe("a classify node", () => {
  const decision = { answerType: "classify", question: "How risky is this submission?", options: classifyCfg.options, threshold: 0.8 };
  it("asks one choice on classify_step and writes the label under its key with the record beside it", async () => {
    decideMock.mockResolvedValue({ kind: "choice", answer: "high", probabilities: { low: 0.08, high: 0.92 }, confidence: 0.84, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 500, costUsd: 0.00002 });
    const { plan } = graph(decision, "risk_tier");
    const result = await run(plan);
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decideMock.mock.calls[0][0]).toMatchObject({ kind: "choice", site: "classify_step", instructions: "How risky is this submission?", criteria: { low: "Nothing unusual", high: "Coastal, large TIV or prior losses" }, threshold: 0.8, subject: "Risk tier", orgId: "org-9" });
    const out = outputOf(result, "decide");
    expect(out.risk_tier).toBe("high");
    expect(out[`risk_tier${DECISION_RECORD_SUFFIX}`]).toMatchObject({ answerType: "classify", answer: "high", choice: "high", options: ["low", "high"], confidence: 0.84, engine: "jev", question: "How risky is this submission?" });
  });

  it("its edges are ordinary rules over the written value: exactly the matching one is taken", async () => {
    decideMock.mockResolvedValue({ kind: "choice", answer: "high", probabilities: { low: 0.1, high: 0.9 }, confidence: 0.8, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 500, costUsd: 0.00002 });
    const { plan } = graph(decision, "risk_tier");
    // The plan gates on the rules, not on decision edges.
    expect(plan.incomingEdges.slow.every((e: any) => e.evaluationMode !== "decision")).toBe(true);
    const result = await run(plan);
    expect(statuses(result)).toMatchObject({ decide: "completed", slow: "completed", fast: "skipped" });
  });

  it("fails the node, not the run's meaning, when the seam throws", async () => {
    decideMock.mockRejectedValue(new Error("Jev HTTP 529"));
    const { plan } = graph(decision, "risk_tier");
    const result = await run(plan);
    expect(statuses(result).decide).toBe("failed");
    const failed = result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === "decide");
    expect(failed.error).toContain("Classification failed");
  });
});

describe("a score node", () => {
  const decision = { answerType: "score", question: "How serious are the findings?", levels: scoreCfg.levels };
  it("asks one score on score_step and writes the level index under its key with the ladder in the record", async () => {
    decideMock.mockResolvedValue({ kind: "score", answer: 2, probabilities: { "0": 0.05, "1": 0.15, "2": 0.8 }, confidence: 0.8, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 180, inputTokens: 400, costUsd: 0.00002 });
    const { plan } = graph(decision, "severity");
    const result = await run(plan);
    expect(decideMock.mock.calls[0][0]).toMatchObject({ kind: "score", site: "score_step", criteria: scoreCfg.levels, subject: "Risk tier" });
    const out = outputOf(result, "decide");
    expect(out.severity).toBe(2);
    expect(out[`severity${DECISION_RECORD_SUFFIX}`]).toMatchObject({ answerType: "score", answer: 2, level: "serious issues", choice: "serious issues", levels: scoreCfg.levels });
    expect(statuses(result)).toMatchObject({ slow: "completed", fast: "skipped" });
  });

  it("clamps an out-of-range answer onto the ladder and drops an 'unsure: gate' it cannot honour", async () => {
    decideMock.mockResolvedValue({ kind: "score", answer: 7, probabilities: {}, confidence: 0.5, engine: "llm", mode: "jev", model: "gpt-4.1", latencyMs: 900, inputTokens: 400, costUsd: 0.001, fallbackReason: "below_threshold" });
    const { plan } = graph({ ...decision, unsure: "gate" }, "severity");
    expect(plan.nodeConfig.decide.decision).not.toHaveProperty("unsure");
    const result = await run(plan);
    expect(outputOf(result, "decide").severity).toBe(2);
  });

  it("is not a decision node at all without a ladder of two or more", () => {
    const { plan } = graph({ answerType: "score", question: "q", levels: ["one"] }, "severity");
    expect(plan.nodeConfig.decide.decision).toBeNull();
  });
});

describe("the branch answer type is unchanged", () => {
  it("still writes {choice, ...} under the key and gates its decision edges", async () => {
    decideMock.mockResolvedValue({ kind: "choice", answer: "Approve", probabilities: { Approve: 0.9, Reject: 0.1 }, confidence: 0.9, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 210, inputTokens: 900, costUsd: 0.00004 });
    const nodes = [
      node({ id: "decide", label: "Endorsement Accepted?", nodeType: "decision", refAgentId: null, stateKey: "endorsement_accepted", config: { decision: { question: "Accepted?", options: [{ label: "Approve" }, { label: "Reject" }] } } as any }),
      node({ id: "approve", label: "Filing", stateKey: "filing", refAgentId: "a1" }),
      node({ id: "reject", label: "Escalation", stateKey: "escalation", refAgentId: "a2" }),
    ];
    const edges = [
      edge({ id: "e1", sourceNodeId: "decide", targetNodeId: "approve", evaluationMode: "decision", label: "Approve" }),
      edge({ id: "e2", sourceNodeId: "decide", targetNodeId: "reject", evaluationMode: "decision", label: "Reject" }),
    ];
    const plan = computeWaves(nodes, edges);
    expect(plan.nodeConfig.decide.decision).toMatchObject({ answerType: "branch" });
    const result = await run(plan);
    expect(decideMock.mock.calls[0][0]).toMatchObject({ kind: "choice", site: "decision_step" });
    expect(outputOf(result, "decide")).toEqual({ endorsement_accepted: expect.objectContaining({ choice: "Approve", options: ["Approve", "Reject"] }) });
    expect(statuses(result)).toMatchObject({ approve: "completed", reject: "skipped" });
  });
});

describe("the overlay and the monitor's reader", () => {
  it("carries the answer type, the answer and the ladder so the monitor can name a level", () => {
    const record = { answerType: "score", answer: 2, level: "serious issues", choice: "serious issues", levels: ["clean", "minor issues", "serious issues"], probabilities: { "0": 0.05, "1": 0.15, "2": 0.8 }, confidence: 0.8, engine: "jev" };
    expect(decisionOutcomeOf({ severity: 2, severity_decision: record })).toMatchObject({ choice: "serious issues", answerType: "score", answer: 2, levels: ["clean", "minor issues", "serious issues"] });
    expect(decisionOutcomeOf({ endorsement_accepted: { choice: "Approve", probabilities: null, confidence: 0.9 } })).not.toHaveProperty("answerType");
  });

  it("reads a classify record as an outcome, but does not treat its edges as chosen branches", () => {
    const output = { risk_tier: "high", risk_tier_decision: { answerType: "classify", answer: "high", choice: "high", options: ["low", "high"], probabilities: { low: 0.1, high: 0.9 }, confidence: 0.8 } };
    expect(decisionOutcomeOf(output)).toMatchObject({ choice: "high", options: ["low", "high"] });
    const nodes = [
      { id: "decide", label: "Risk tier", nodeType: "decision", config: { decision: { answerType: "classify" } } },
      { id: "fast", label: "Fast track", nodeType: "internal_agent" }, { id: "slow", label: "Full review", nodeType: "internal_agent" },
    ] as any[];
    const edges = [{ id: "e1", sourceNodeId: "decide", targetNodeId: "fast", label: null }, { id: "e2", sourceNodeId: "decide", targetNodeId: "slow", label: null }] as any[];
    const runRow = { id: "r1", status: "completed", waveResults: [
      { waveNumber: 1, nodes: [{ nodeId: "decide", status: "completed", output }] },
      { waveNumber: 2, nodes: [{ nodeId: "slow", status: "completed", output: {} }, { nodeId: "fast", status: "skipped", output: {} }] },
    ] } as any;
    const overlay = buildRunOverlay(runRow, nodes, edges, null);
    expect(overlay.nodes.decide.decision).toBeNull();
    expect(overlay.edges.e2.taken).toBe(true);
    expect(overlay.edges.e1.taken).toBe(false);
  });
});

describe("the seams that carry it", () => {
  it("build and sync mark an edge as a decision edge only out of a branch decision, and take a classify step's options from the step", () => {
    const build = read("server", "team-build.ts");
    expect(build).toContain('const decisionEdge = source.nodeType === "decision" && decisionAnswerType((source.config as any)?.decision) === "branch";');
    expect(build).toContain("const authored = answerType === \"classify\" ? { options: decisionOptionsFor(config) } : { levels: decisionLevelsFor(config) };");
    const sync = read("server", "process-flow-sync.ts");
    expect(sync).toContain('const decisionEdge = !!srcPn && isDecision(srcPn) && decisionAnswerType(srcPn.config) === "branch";');
    expect(sync).toContain('const wantDecision = !!srcPn && isDecision(srcPn) && decisionAnswerType(srcPn.config) === "branch";');
    expect(read("server", "blueprint-invariants.ts")).toContain('if (node.nodeType === "decision" && decisionAnswerType((node.config as any)?.decision) === "branch") continue;');
  });
});
