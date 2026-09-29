/**
 * The approval router's shadow risk score (Phase 2, item 8).
 *
 * evaluateActionPolicy decides as it always did; beside every decision one
 * decision_audit row on "approval_risk" records the rules' decision as a
 * run / review / block level and the decision model's score of the same
 * call. The site never routes, the call is not awaited, and a model that
 * never answers cannot delay a dispatch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "shadow" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown> | "hang"> = [];
const jevCalls: Array<Record<string, unknown>> = [];
const audits: Record<string, unknown>[] = [];

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn().mockResolvedValue({}),
    getAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Billing Agent", description: "Raises and adjusts invoices for the billing team.", riskTier: "MEDIUM", autonomyMode: "supervised", organizationId: "org-1" }),
    getAarConfig: vi.fn().mockResolvedValue(null),
    createAarActionDecision: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({ id: "approval-1" }),
    getLatestApprovalDecision: vi.fn().mockResolvedValue(undefined),
    getMcpServer: vi.fn().mockResolvedValue(null),
    getMcpServerTools: vi.fn().mockResolvedValue([]),
    listAgentTaskClasses: vi.fn().mockResolvedValue([]),
    getActiveWarrant: vi.fn().mockResolvedValue(undefined),
    getAgentTeamMembers: vi.fn().mockResolvedValue([]),
    getSkillsByIds: vi.fn().mockResolvedValue([]),
    updateSkill: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../server/mcp-client", () => ({ isRealMcpServer: vi.fn().mockReturnValue(false), mcpListTools: vi.fn().mockResolvedValue([]), mcpCallTool: vi.fn(), buildMcpAuthHeaders: vi.fn() }));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));
vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async (_state: unknown, questions: Record<string, unknown>) => {
    jevCalls.push(questions);
    const next = jevAnswers.shift();
    if (next === "hang") return new Promise(() => {});
    if (!next) throw new Error("Jev HTTP 529");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 300, output_tokens: 0 } }, latencyMs: 150 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", () => ({ completeWithFallback: vi.fn(async () => { throw new Error("the incumbent is known; the generic prompt must not run"); }) }));

import { evaluateActionPolicy, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";
import { callJev } from "../server/decision-shadow";
import { approvalRiskOfDecision, APPROVAL_RISK_LEVELS } from "../server/approval-risk-shadow";

const TOOL: AvailableTool = { serverId: "srv-1", serverName: "Billing", serverUrl: "http://localhost:9999", toolName: "issue_refund", toolDescription: "Issues a refund to a customer", toolInputSchema: {}, toolEndpoint: "/refunds", toolMethod: "POST" };
const settled = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => { route.mode = "shadow"; jevAnswers.length = 0; jevCalls.length = 0; audits.length = 0; process.env.TYPESAFE_API_KEY = "test-key"; vi.mocked(callJev).mockClear(); vi.mocked(storage.getAarConfig).mockResolvedValue(null); });

describe("the level of a decision", () => {
  it("maps the four decisions onto run, review and block", () => {
    expect(APPROVAL_RISK_LEVELS).toEqual(["run", "review", "block"]);
    expect(approvalRiskOfDecision("ALLOW")).toBe(0);
    expect(approvalRiskOfDecision("ALERT_AND_ALLOW")).toBe(1);
    expect(approvalRiskOfDecision("REQUIRE_APPROVAL")).toBe(1);
    expect(approvalRiskOfDecision("BLOCK")).toBe(2);
  });
});

describe("evaluateActionPolicy with the shadow score", () => {
  it("decides exactly as before and writes one score row with the rules as the incumbent", async () => {
    jevAnswers.push({ risk: { type: "score", score: 1.0, legend: {}, probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 }, confidence: 0.8 } });
    const r = await evaluateActionPolicy("agent-1", TOOL);
    expect(r).toMatchObject({ decision: "ALLOW", reason: "Action passed all constraint checks" });
    await settled();
    const row = audits.find((a) => a.site === "approval_risk");
    expect(row).toMatchObject({ questionKind: "score", mode: "shadow", engine: "llm", llmModel: "aar-rules:allow", llmAnswer: { answer: 0 }, jevAnswer: { answer: 1 }, agree: false, subject: "Billing Agent: issue_refund" });
    expect(Object.keys(jevCalls[0])).toEqual(["risk"]);
    // The model sees what a reviewer would: the tool, its side-effect class, the agent's tier and mode.
    expect((jevCalls[0].risk as { criteria: string[] }).criteria).toHaveLength(3);
  });

  it("a require-approval decision still creates the approval, and is level 1 on the row", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ requireApprovalTools: ["issue_refund"] } as never);
    jevAnswers.push({ risk: { type: "score", score: 1.0, legend: {}, probabilities: { "0": 0.05, "1": 0.9, "2": 0.05 }, confidence: 0.9 } });
    const r = await evaluateActionPolicy("agent-1", TOOL);
    expect(r).toMatchObject({ decision: "REQUIRE_APPROVAL", approvalId: "approval-1" });
    expect(storage.createApproval).toHaveBeenCalled();
    await settled();
    expect(audits.find((a) => a.site === "approval_risk")).toMatchObject({ llmAnswer: { answer: 1 }, jevAnswer: { answer: 1 }, agree: true, llmModel: "aar-rules:require_approval" });
  });

  it("a blocked call is level 2, and blocked", async () => {
    vi.mocked(storage.getAarConfig).mockResolvedValue({ deniedTools: ["issue_refund"] } as never);
    jevAnswers.push({ risk: { type: "score", score: 2.0, legend: {}, probabilities: { "0": 0.02, "1": 0.08, "2": 0.9 }, confidence: 0.9 } });
    const r = await evaluateActionPolicy("agent-1", TOOL);
    expect(r.decision).toBe("BLOCK");
    await settled();
    expect(audits.find((a) => a.site === "approval_risk")).toMatchObject({ llmAnswer: { answer: 2 }, agree: true });
  });

  it("returns without waiting for a model that never answers, and records a model that fails", async () => {
    jevAnswers.push("hang");
    const t0 = Date.now();
    const r = await evaluateActionPolicy("agent-1", TOOL);
    expect(r.decision).toBe("ALLOW");
    expect(Date.now() - t0).toBeLessThan(1000);
    await settled(); // the hanging call has been made by now; the next one finds no answer queued
    jevAnswers.length = 0;
    const r2 = await evaluateActionPolicy("agent-1", TOOL);
    expect(r2.decision).toBe("ALLOW");
    await settled();
    expect(audits.filter((a) => a.site === "approval_risk" && a.error === "Jev HTTP 529")).toHaveLength(1);
  });

  it("writes the row without asking the model under the kill switch", async () => {
    route.mode = "llm";
    const r = await evaluateActionPolicy("agent-1", TOOL);
    expect(r.decision).toBe("ALLOW");
    await settled();
    expect(callJev).not.toHaveBeenCalled();
    expect(audits.find((a) => a.site === "approval_risk")).toMatchObject({ mode: "llm", engine: "llm", llmAnswer: { answer: 0 } });
  });
});

describe("the seams that carry it", () => {
  it("the dispatcher fires the shadow after its decision and keeps the parity pins", () => {
    const src = read("server", "tool-dispatcher.ts");
    expect(src).toContain("void shadowApprovalRisk({");
    expect(src).toMatch(/export async function evaluateActionPolicy\(/);
    expect(src.indexOf("void shadowApprovalRisk({")).toBeGreaterThan(src.indexOf("export async function evaluateActionPolicy("));
    expect(src.indexOf("void shadowApprovalRisk({")).toBeLessThan(src.indexOf("await storage.createAarActionDecision({"));
  });
});
