/**
 * The decision execution kind in DAGExecutionEngine: a "decision" node makes
 * ONE call to the decision seam over its labelled branches and exactly one of
 * its "decision" edges is satisfied. Before this, a drawn decision was an agent
 * call plus one model call per branch, judged independently, so zero or two
 * branches could fire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeWaves, DAGExecutionEngine } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
  waitForApproval: vi.fn().mockResolvedValue({ approved: true, decidedBy: "admin", approvalId: "a1" }),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));

const jevChoice = (answer: string, extra: Record<string, unknown> = {}) => ({
  kind: "choice", answer, probabilities: { Approve: answer === "Approve" ? 0.9 : 0.1, Reject: answer === "Reject" ? 0.9 : 0.1 },
  confidence: 0.9, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 210, inputTokens: 900, costUsd: 0.0000378, ...extra,
});
const decideMock = vi.fn(async (_req: any) => jevChoice("Approve"));
vi.mock("../server/decision-provider", () => ({ decide: (req: any) => decideMock(req) }));

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

const decisionConfig = (extra: Record<string, unknown> = {}) => ({
  decision: { question: "Was the endorsement accepted by the carrier?", options: [{ label: "Approve", description: "Endorsement approved" }, { label: "Reject", description: "Endorsement rejected" }], ...extra },
});

function graph(extra: { gate?: boolean; decisionExtra?: Record<string, unknown> } = {}) {
  const nodes = [
    node({ id: "intake", label: "Intake", stateKey: "intake", refAgentId: "agent-intake" }),
    node({ id: "decide", label: "Endorsement Accepted?", nodeType: "decision", refAgentId: null, stateKey: "endorsement_accepted", config: decisionConfig(extra.decisionExtra) as any }),
    node({ id: "approve", label: "Filing Lookup", stateKey: "filing", refAgentId: "agent-approve" }),
    node({ id: "reject", label: "Escalation", stateKey: "escalation", refAgentId: "agent-reject" }),
    ...(extra.gate ? [node({ id: "review", label: "Needs review", nodeType: "edge_gate", gateType: "approval", refAgentId: null, stateKey: "review" })] : []),
  ];
  const edges = [
    edge({ id: "e0", sourceNodeId: "intake", targetNodeId: "decide" }),
    edge({ id: "e1", sourceNodeId: "decide", targetNodeId: "approve", evaluationMode: "decision", label: "Approve", condition: "Endorsement approved" }),
    edge({ id: "e2", sourceNodeId: "decide", targetNodeId: "reject", evaluationMode: "decision", label: "Reject", condition: "Endorsement rejected" }),
    ...(extra.gate ? [edge({ id: "e3", sourceNodeId: "decide", targetNodeId: "review", evaluationMode: "decision", label: "Needs review" })] : []),
  ];
  return computeWaves(nodes, edges);
}
const run = (plan: ReturnType<typeof computeWaves>, extra: Record<string, unknown> = {}) =>
  new DAGExecutionEngine().execute({ executionPlan: plan, stateSchema: {}, initialState: { request: "bind the endorsement" }, errorStrategy: "best_effort", teamAgentId: "team-1", organizationId: "org-9", ...extra } as any);
const statuses = (result: any) => Object.fromEntries(result.waveResults.flatMap((w: any) => w.nodes).map((n: any) => [n.nodeId, n.status]));
const outputOf = (result: any, id: string) => result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === id)?.output;

beforeEach(() => { decideMock.mockReset(); decideMock.mockImplementation(async () => jevChoice("Approve")); });

describe("computeWaves — decision edges", () => {
  it("gates a decision edge and carries its label, whether or not it has a condition", () => {
    const plan = graph();
    const into = (id: string) => plan.incomingEdges[id][0];
    expect(into("approve")).toMatchObject({ isGating: true, evaluationMode: "decision", label: "Approve" });
    expect(into("reject")).toMatchObject({ isGating: true, evaluationMode: "decision", label: "Reject" });
    expect(plan.nodeConfig["decide"].decision).toMatchObject({ question: "Was the endorsement accepted by the carrier?" });
    expect(plan.nodeConfig["decide"].decision?.options.map((o) => o.label)).toEqual(["Approve", "Reject"]);
  });

  it("leaves a decision node with fewer than two branches without a decision config", () => {
    const plan = computeWaves([node({ id: "d", nodeType: "decision", refAgentId: null, config: { decision: { question: "q", options: [{ label: "Only" }] } } as any })], []);
    expect(plan.nodeConfig["d"].decision).toBeNull();
  });
});

describe("DAGExecutionEngine — a decision node", () => {
  it("makes one choice call and takes exactly the chosen branch", async () => {
    decideMock.mockImplementation(async () => jevChoice("Reject"));
    const result = await run(graph());
    expect(statuses(result)).toMatchObject({ intake: "completed", decide: "completed", approve: "skipped", reject: "completed" });
    expect(decideMock).toHaveBeenCalledTimes(1);
    const req = decideMock.mock.calls[0][0];
    expect(req).toMatchObject({ kind: "choice", site: "decision_step", orgId: "org-9", instructions: "Was the endorsement accepted by the carrier?", subject: "Endorsement Accepted?" });
    expect(req.criteria).toEqual({ Approve: "Endorsement approved", Reject: "Endorsement rejected" });
    expect(req.state.request).toBe("bind the endorsement");
    const out = outputOf(result, "decide").endorsement_accepted;
    expect(out).toMatchObject({ choice: "Reject", engine: "jev", model: "jev-1.13.0", confidence: 0.9, options: ["Approve", "Reject"] });
    expect(out.probabilities).toEqual({ Approve: 0.1, Reject: 0.9 });
    const decideNode = result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === "decide");
    expect(decideNode.costUsd).toBeCloseTo(0.0000378, 9);
    expect(decideNode.promptTokens).toBe(900);
  });

  it("still takes one branch when the LLM answered below threshold", async () => {
    decideMock.mockImplementation(async () => jevChoice("Approve", { engine: "llm", confidence: null, fallbackReason: "below_threshold", model: "gpt-4.1" }));
    const result = await run(graph());
    expect(statuses(result)).toMatchObject({ approve: "completed", reject: "skipped" });
    expect(outputOf(result, "decide").endorsement_accepted).toMatchObject({ choice: "Approve", engine: "llm", fallbackReason: "below_threshold" });
  });

  it("sends an unsure decision to the drawn approval branch when the step says so", async () => {
    decideMock.mockImplementation(async () => jevChoice("Approve", { engine: "llm", confidence: null, fallbackReason: "below_threshold" }));
    const result = await run(graph({ gate: true, decisionExtra: { unsure: "gate" } }));
    expect(statuses(result)).toMatchObject({ review: "completed", approve: "skipped", reject: "skipped" });
    expect(outputOf(result, "decide").endorsement_accepted).toMatchObject({ choice: "Needs review", routedToGate: true });
  });

  it("does not send a confident decision to the approval branch", async () => {
    decideMock.mockImplementation(async () => jevChoice("Reject"));
    const result = await run(graph({ gate: true, decisionExtra: { unsure: "gate" } }));
    expect(statuses(result)).toMatchObject({ reject: "completed", approve: "skipped", review: "skipped" });
  });

  it("fails the node when the seam cannot answer, rather than opening every branch", async () => {
    decideMock.mockRejectedValue(new Error("Jev HTTP 529"));
    const result = await run(graph());
    const decideNode = result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === "decide");
    expect(decideNode.status).toBe("failed");
    expect(decideNode.error).toContain("Decision failed");
    expect(statuses(result)).toMatchObject({ approve: "skipped", reject: "skipped" });
    expect(result.success).toBe(false);
  });

  it("passes the step's own threshold through to the seam", async () => {
    await run(graph({ decisionExtra: { threshold: 0.7 } }));
    expect(decideMock.mock.calls[0][0].threshold).toBe(0.7);
  });
});
