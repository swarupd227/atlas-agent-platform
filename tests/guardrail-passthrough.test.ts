/**
 * Guardrails on every step (Phase 2, item 4).
 *
 * The soft-policy judge has always run after every agent step of a team run,
 * inside executePromptWithMcp; its verdicts reached an audit event and a trace
 * column and stopped there, because executeWorkerAgent did not return them and
 * the engine's rebuild of the worker's result dropped what it did not list.
 * Now a step's verdicts ride on its wave result as `judgments`, the next step is
 * told which policies the step before it broke, the run event carries a flag
 * count, and the monitor shows a Guardrails block on the step.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { computeWaves, DAGExecutionEngine, upstreamGuardrailNotice } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const workerCalls: Array<{ agentId: string; input: string }> = [];
const verdictsByAgent: Record<string, unknown[] | undefined> = {};
vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(async (agentId: string, _team: unknown, input: string) => {
    workerCalls.push({ agentId, input });
    return { success: true, output: `output of ${agentId}`, ...(verdictsByAgent[agentId] ? { softPolicyViolations: verdictsByAgent[agentId] } : {}) };
  }),
  waitForApproval: vi.fn().mockResolvedValue({ approved: true, decidedBy: "admin", approvalId: "a1" }),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));
vi.mock("../server/decision-provider", () => ({ decide: vi.fn() }));

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
const plan = () => computeWaves(
  [
    node({ id: "quote", label: "Quote the risk", stateKey: "quote", refAgentId: "agent-quote" }),
    node({ id: "bind", label: "Bind the policy", stateKey: "bind", refAgentId: "agent-bind" }),
    node({ id: "notify", label: "Notify the broker", stateKey: "notify", refAgentId: "agent-notify" }),
  ],
  [edge({ id: "e1", sourceNodeId: "quote", targetNodeId: "bind" }), edge({ id: "e2", sourceNodeId: "bind", targetNodeId: "notify" })],
);
const run = () => new DAGExecutionEngine().execute({ executionPlan: plan(), stateSchema: {}, initialState: { request: "bind it" }, errorStrategy: "best_effort", teamAgentId: "team-1" } as any);
const nodeResult = (result: any, id: string) => result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === id);

const broke = { policyId: "pol-fee", policyName: "Broker fee disclosure", enforcement: "soft", domain: "insurance", compliant: false, violatedRequirements: ["State the broker fee"], evidence: "The fee is not mentioned.", severity: "medium" };
const kept = { policyId: "pol-pii", policyName: "No personal data in summaries", enforcement: "soft", domain: "privacy", compliant: true, violatedRequirements: [], evidence: "No identifiers present.", severity: "low" };

beforeEach(() => { workerCalls.length = 0; for (const k of Object.keys(verdictsByAgent)) delete verdictsByAgent[k]; });

describe("a step's verdicts ride on its wave result", () => {
  it("as one judgment per policy, compliant ones included", async () => {
    verdictsByAgent["agent-quote"] = [broke, kept];
    const result = await run();
    expect(nodeResult(result, "quote").judgments).toEqual([
      { kind: "policy", subject: "Broker fee disclosure", ok: false, severity: "medium", evidence: "The fee is not mentioned.", detail: ["State the broker fee"] },
      { kind: "policy", subject: "No personal data in summaries", ok: true, severity: "low", evidence: "No identifiers present." },
    ]);
    expect(nodeResult(result, "bind").judgments).toBeUndefined();
  });

  it("tells the next step which policy the step before it broke, and only that step", async () => {
    verdictsByAgent["agent-quote"] = [broke, kept];
    await run();
    const bindInput = workerCalls.find((c) => c.agentId === "agent-bind")!.input;
    expect(bindInput).toContain("GUARDRAIL FLAGS ON THE STEPS BEFORE YOU");
    expect(bindInput).toContain('"Quote the risk" broke the policy "Broker fee disclosure" (medium): The fee is not mentioned. It did not: State the broker fee.');
    expect(bindInput).not.toContain("No personal data in summaries");
    // Two steps on, the breach was the previous step's to answer.
    const notifyInput = workerCalls.find((c) => c.agentId === "agent-notify")!.input;
    expect(notifyInput).not.toContain("GUARDRAIL FLAGS");
  });

  it("says nothing when every policy was honoured", async () => {
    verdictsByAgent["agent-quote"] = [kept];
    await run();
    expect(workerCalls.find((c) => c.agentId === "agent-bind")!.input).not.toContain("GUARDRAIL FLAGS");
  });
});

describe("upstreamGuardrailNotice", () => {
  const p = plan();
  it("names direct predecessors' breaches only, never compliant verdicts", () => {
    const judgments = new Map([
      ["quote", [{ kind: "policy" as const, subject: "Broker fee disclosure", ok: false, severity: "high", evidence: "Missing." }]],
      ["bind", [{ kind: "policy" as const, subject: "Something else", ok: true }]],
    ]);
    expect(upstreamGuardrailNotice("bind", p, judgments)).toContain('"Quote the risk" broke the policy "Broker fee disclosure" (high): Missing.');
    expect(upstreamGuardrailNotice("notify", p, judgments)).toBeUndefined();
    expect(upstreamGuardrailNotice("quote", p, judgments)).toBeUndefined();
    expect(upstreamGuardrailNotice("bind", p, new Map())).toBeUndefined();
  });
});

describe("the seams that carry it", () => {
  it("the worker returns the verdicts the judge already produced", () => {
    const runtime = read("server", "agent-runtime.ts");
    expect(runtime).toContain("softPolicyViolations?: SoftPolicyComplianceResult[];\n}> {");
    expect(runtime).toContain("softPolicyViolations: result.softPolicyViolations,");
  });

  it("the engine carries them through the rebuild, and the event counts the flags", () => {
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine).toContain("softPolicyViolations: (result as any).softPolicyViolations ?? null,");
    expect(engine).toContain("...(judgments.length ? { judgments } : {}),");
    expect(engine).toContain("...(r.judgments?.some((j) => !j.ok) ? { flags: r.judgments.filter((j) => !j.ok).length } : {}),");
    expect(read("server", "dag-run-events.ts")).toContain("flags?: number;");
  });

  it("the monitor shows a Guardrails block on the step", () => {
    const monitor = read("client", "src", "pages", "dag-run-monitor.tsx");
    expect(monitor).toContain("data-testid={`panel-guardrails-${step.id}`}");
    expect(monitor).toContain("of {all.length} honoured");
    expect(monitor).toContain("data-testid={`text-guardrail-flag-${step.id}-${i}`}");
  });
});
