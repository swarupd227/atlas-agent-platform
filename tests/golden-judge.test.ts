/**
 * The golden judge through the decision seam (Phase 2, item 6).
 *
 * judgeCase asks each criterion on the site "golden_judge". The strict examiner
 * prompt is the incumbent, unchanged: on the jev route it is called only when
 * the decision model is unsure about a criterion, which is where the saving is
 * on the most expensive judge in the platform; its reasoning is kept whenever
 * it was called. The skill sandbox asks its one judgment the same way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "jev" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown>> = [];
const audits: Record<string, unknown>[] = [];
const examinerReplies: string[] = [];
const examinerCalls: string[] = [];

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async () => {
    const next = jevAnswers.shift();
    if (!next) throw new Error("no jev answer queued");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 600, output_tokens: 0 } }, latencyMs: 190 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(),
  callClaudeWithUsage: vi.fn(async (opts: { user: string }) => { examinerCalls.push(opts.user); return { text: examinerReplies.shift() ?? "{}", model: "claude-opus-4-5", inputTokens: 2400, outputTokens: 120, costUsd: 0.015, latencyMs: 3200 }; }),
  createClaudeMessage: vi.fn(async () => ({ content: [{ type: "text", text: "The broker fee is $250, payable by the insured. Carrier: Lloyd's." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } })),
  stripJsonFences: (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
}));
vi.mock("../server/builtin-skill-tools", () => ({
  resolveReadableSkills: vi.fn(async () => []), skillCatalogPrompt: () => "", skillToolsFor: () => [], executeBuiltinSkillTool: vi.fn(), READ_SKILL_TOOL: { name: "read_skill" },
}));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/auth", () => ({ getOrgId: () => "org-1" }));
vi.mock("../server/permissions", () => ({ checkPermission: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../server/routes/helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn() }));

import { judgeCase } from "../server/routes/golden-eval";
import { callClaudeWithUsage } from "../server/claude";
import { callJev } from "../server/decision-shadow";

const criteria = ["States the broker fee", "Names the carrier", "Says who pays the fee"];
const params = { systemPrompt: "You are the account agent.", scenario: "Quote the risk.", expectedBehavior: "State the fee, the carrier and the payer.", criteria, passingScore: 0.8, agentId: "agent-1", orgId: "org-1", readableSkills: [] as any[] };

beforeEach(() => { route.mode = "jev"; jevAnswers.length = 0; audits.length = 0; examinerReplies.length = 0; examinerCalls.length = 0; process.env.TYPESAFE_API_KEY = "test-key"; vi.mocked(callClaudeWithUsage).mockClear(); vi.mocked(callJev).mockClear(); });

describe("on the jev route", () => {
  it("scores every criterion from the decision model and never calls the examiner when it is sure", async () => {
    jevAnswers.push({ c0: { type: "noul", noul: 0.97 }, c1: { type: "noul", noul: 0.95 }, c2: { type: "noul", noul: 0.04 } });
    const r = await judgeCase(params);
    expect(callClaudeWithUsage).not.toHaveBeenCalled();
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(r.criteriaMet).toEqual(["States the broker fee", "Names the carrier"]);
    expect(r.criteriaMissed).toEqual(["Says who pays the fee"]);
    expect(r.score).toBeCloseTo(2 / 3, 6);
    expect(r.passed).toBe(false);
    expect(r.reasoning).toContain("Decided by the decision model without the examiner");
    expect(r.reasoning).toContain("Says who pays the fee (missed, 4%)");
    expect(audits.filter((a) => a.site === "golden_judge")).toHaveLength(3);
  });

  it("calls the examiner once for the unsure criteria, keeps its reasoning, and its answer stands there", async () => {
    jevAnswers.push({ c0: { type: "noul", noul: 0.97 }, c1: { type: "noul", noul: 0.55 }, c2: { type: "noul", noul: 0.03 } });
    examinerReplies.push(JSON.stringify({ criteriaMet: ["States the broker fee", "Names the carrier"], criteriaMissed: ["Says who pays the fee"], reasoning: "The carrier is named at the end." }));
    const r = await judgeCase(params);
    expect(callClaudeWithUsage).toHaveBeenCalledTimes(1);
    expect(examinerCalls[0]).toContain("1. States the broker fee");
    expect(r.criteriaMet).toEqual(["States the broker fee", "Names the carrier"]);
    expect(r.reasoning).toBe("The carrier is named at the end.");
    const c1 = audits.find((a) => a.subject === "Names the carrier");
    expect(c1).toMatchObject({ engine: "llm", mode: "jev", fallbackReason: "below_threshold", llmInputTokens: 2400, llmCostUsd: 0.015 });
    // The examiner's price is attributed to the batch once, not once per criterion.
    expect(audits.filter((a) => a.site === "golden_judge" && (a.llmCostUsd as number) > 0)).toHaveLength(1);
  });

  it("fails the case, not passes it, when the examiner's reply cannot be parsed", async () => {
    jevAnswers.push({ c0: { type: "noul", noul: 0.5 }, c1: { type: "noul", noul: 0.5 }, c2: { type: "noul", noul: 0.5 } });
    examinerReplies.push("not json");
    const r = await judgeCase(params);
    expect(r).toMatchObject({ passed: false, score: 0, criteriaMet: [], criteriaMissed: criteria });
    expect(r.reasoning).toContain("could not be parsed");
  });
});

describe("on the llm route", () => {
  it("the examiner decides every criterion, exactly as before", async () => {
    route.mode = "llm";
    examinerReplies.push(JSON.stringify({ criteriaMet: ["States the broker fee"], criteriaMissed: ["Names the carrier", "Says who pays the fee"], reasoning: "Only the fee." }));
    const r = await judgeCase(params);
    expect(callJev).not.toHaveBeenCalled();
    expect(callClaudeWithUsage).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ criteriaMet: ["States the broker fee"], criteriaMissed: ["Names the carrier", "Says who pays the fee"], reasoning: "Only the fee.", passed: false });
    expect(r.score).toBeCloseTo(1 / 3, 6);
  });
});

describe("the seams that carry it", () => {
  it("the route lines the authz baseline pins are unchanged", () => {
    const src = read("server", "routes", "golden-eval.ts");
    expect(src).toContain('router.post("/api/evals/:suiteId/run-golden", checkPermission("create_modify_blueprints")');
    expect(src).toContain('site: "golden_judge"');
    expect(src).toContain("export async function judgeCase(");
  });

  it("the sandbox judge asks its one judgment on its own site, with the judge call's answer as the known incumbent", () => {
    const src = read("server", "routes", "skills.ts");
    expect(src).toContain('site: "sandbox_judge"');
    expect(src).toContain("incumbent: knownIncumbent({ activation: Boolean(judge.activationTriggered) }, judgeUsage),");
    expect(src).toContain("judgeUsage = { model: judged.model, latencyMs: judged.latencyMs, inputTokens: judged.inputTokens, costUsd: judged.costUsd };");
    expect(src).toContain("activationTriggered = decided.activation?.answer === true;");
  });

  it("the Claude helper that judges use reports its tokens", () => {
    const src = read("server", "claude.ts");
    expect(src).toContain("export async function callClaudeWithUsage(");
    expect(src).toContain("return (await callClaudeWithUsage(opts)).text;");
    expect(src).toContain("costUsd: priceTokens(usedModel, inputTokens, outputTokens),");
    expect(read("server", "routes", "golden-eval.ts")).toContain("inputTokens: r.inputTokens, costUsd: r.costUsd };");
  });
});
