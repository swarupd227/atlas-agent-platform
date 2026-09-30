/**
 * The four small judgment sites through the decision seam (Phase 3, item 4):
 * template matching, entity resolution, citation tagging and healing root
 * cause. Each route keeps its own model call and prompt exactly as before, so
 * its response is what it was; the judgment inside the response is handed to
 * the seam as the known incumbent, which writes an audit row and, only once
 * the site is overridden to jev, lets the decision model's confident answer
 * replace it. A seam failure changes nothing.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import type { AddressInfo } from "net";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "shadow" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown>> = [];
const jevCalls: Array<Record<string, unknown>> = [];
const audits: Record<string, unknown>[] = [];
const claudeReplies: string[] = [];
const claudeCalls: Array<{ system: string; user: string; model?: string }> = [];

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })), validateDecisionSetting: () => null }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async (_state: unknown, questions: Record<string, unknown>) => {
    jevCalls.push(questions);
    const next = jevAnswers.shift();
    if (!next) throw new Error("Jev HTTP 529");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 400, output_tokens: 0 } }, latencyMs: 170 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", async () => {
  const real = await vi.importActual<typeof import("../server/llm-provider")>("../server/llm-provider");
  return { ...real, completeWithFallback: vi.fn(async () => { throw new Error("the incumbent is known; the generic prompt must not run"); }) };
});
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(),
  callClaudeWithUsage: vi.fn(async (opts: { system: string; user: string; model?: string }) => { claudeCalls.push(opts); return { text: claudeReplies.shift() ?? "{}", model: opts.model ?? "claude-opus-4-5", inputTokens: 800, outputTokens: 90, costUsd: 0.006, latencyMs: 1500 }; }),
  stripJsonFences: (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  parseAIJsonResponse: (s: string) => JSON.parse(s),
  AIResponseParseError: class extends Error {},
  friendlyAIErrorMessage: (e: any) => String(e?.message ?? e),
  getAnthropicClient: vi.fn(),
  createClaudeMessage: vi.fn(),
}));
vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string) => (id === "agent-1" ? { id, name: "Broker Agent", complianceTags: ["GDPR", "PCI-DSS"], policyBindings: [{ policyName: "Customer Privacy Policy" }], organizationId: "org-a" } : undefined)),
    createAuditEvent: vi.fn(async () => ({})),
  },
}));
vi.mock("../server/db", () => ({ db: { execute: vi.fn(), select: vi.fn() }, pool: {} }));
vi.mock("../server/embeddings", () => ({ searchKnowledgeBaseChunks: vi.fn(), generateEmbeddings: vi.fn(), isPgvectorAvailable: vi.fn(async () => false) }));
vi.mock("../server/routes/helpers", () => ({ handleZodError: vi.fn(), resolveOntologyTags: () => [], buildAgentSystemPromptWithGovernance: vi.fn() }));

let server: ReturnType<express.Express["listen"]> | undefined;
let base = "";
beforeAll(async () => {
  process.env.SECURITY_MODE = "demo";
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.TYPESAFE_API_KEY = "test-key";
  const { setDefaultOrgId } = await import("../server/auth");
  setDefaultOrgId("org-default");
  const { default: skillsRouter } = await import("../server/routes/skills");
  const { default: playgroundRouter } = await import("../server/routes/playground");
  const app = express(); app.use(express.json()); app.use(skillsRouter); app.use(playgroundRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);
afterAll(() => server?.close());
beforeEach(() => { route.mode = "shadow"; jevAnswers.length = 0; jevCalls.length = 0; audits.length = 0; claudeReplies.length = 0; claudeCalls.length = 0; });

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-role": "admin", "x-organization-id": "org-a" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const settled = () => new Promise((r) => setTimeout(r, 10));

describe("entity resolution", () => {
  const reply = { isMatch: true, confidence: 0.9, reasoning: "IBM is the abbreviation.", matchingAttributes: ["abbreviation"], differentiatingAttributes: [], canonicalName: "International Business Machines", category: "abbreviation" };
  it("returns what the incumbent said and writes two audit rows with its cost, in shadow", async () => {
    claudeReplies.push(JSON.stringify(reply));
    jevAnswers.push({ is_match: { type: "noul", noul: 0.96 }, category: { type: "choice", choice: "abbreviation", probabilities: { abbreviation: 0.9 }, confidence: 0.9 } });
    const r = await post("/api/ai/resolve-entities", { entityA: "IBM", entityB: "International Business Machines", industry: "technology" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual(reply);
    expect(claudeCalls[0].system).toContain("entity resolution");
    await settled();
    const rows = audits.filter((a) => a.site === "entity_resolution");
    expect(rows.map((a) => a.questionKind)).toEqual(["noul", "choice"]);
    expect(rows[0]).toMatchObject({ mode: "shadow", engine: "llm", llmDecision: true, jevDecision: true, agree: true, llmInputTokens: 800, llmCostUsd: 0.006 });
  });
  it("takes the decision model's confident answers on the jev route and keeps the incumbent's prose", async () => {
    route.mode = "jev";
    claudeReplies.push(JSON.stringify(reply));
    jevAnswers.push({ is_match: { type: "noul", noul: 0.03 }, category: { type: "choice", choice: "related_but_different", probabilities: { related_but_different: 0.92 }, confidence: 0.92 } });
    const r = await post("/api/ai/resolve-entities", { entityA: "IBM", entityB: "International Business Machines" });
    expect(r.json).toMatchObject({ isMatch: false, category: "related_but_different", reasoning: "IBM is the abbreviation.", canonicalName: "International Business Machines" });
  });
  it("is unchanged when the seam fails", async () => {
    claudeReplies.push(JSON.stringify(reply));
    const r = await post("/api/ai/resolve-entities", { entityA: "IBM", entityB: "International Business Machines" });
    expect(r.json).toEqual(reply);
    await settled();
    expect(audits.find((a) => a.site === "entity_resolution")).toMatchObject({ error: "Jev HTTP 529" });
  });
});

describe("citation tagging", () => {
  const citations = [{ title: "GDPR Article 17: right to erasure", url: "https://example.org/gdpr-17" }, { title: "Card data at rest", url: "https://example.org/pci" }];
  it("keeps the incumbent's tags and asks one yes/no per citation and framework, with the tags as the known answers", async () => {
    claudeReplies.push(JSON.stringify([{ index: 0, tags: ["GDPR"] }, { index: 1, tags: ["PCI-DSS"] }]));
    jevAnswers.push({ c0_f0: { type: "noul", noul: 0.95 }, c0_f1: { type: "noul", noul: 0.05 }, c0_f2: { type: "noul", noul: 0.4 }, c1_f0: { type: "noul", noul: 0.1 }, c1_f1: { type: "noul", noul: 0.9 }, c1_f2: { type: "noul", noul: 0.1 } });
    const r = await post("/api/agents/agent-1/playground/chat-annotate-citations", { citations });
    expect(r.status).toBe(200);
    expect(r.json.annotations.map((a: any) => a.tags)).toEqual([["GDPR"], ["PCI-DSS"]]);
    expect(Object.keys(jevCalls[0])).toEqual(["c0_f0", "c0_f1", "c0_f2", "c1_f0", "c1_f1", "c1_f2"]);
    await settled();
    const rows = audits.filter((a) => a.site === "citation_tags");
    expect(rows).toHaveLength(6);
    expect(rows.filter((a) => a.agree === true)).toHaveLength(6);
  });
  it("on the jev route, a confident yes or no becomes the tag", async () => {
    route.mode = "jev";
    claudeReplies.push(JSON.stringify([{ index: 0, tags: ["GDPR"] }, { index: 1, tags: [] }]));
    jevAnswers.push({ c0_f0: { type: "noul", noul: 0.95 }, c0_f1: { type: "noul", noul: 0.05 }, c0_f2: { type: "noul", noul: 0.5 }, c1_f0: { type: "noul", noul: 0.05 }, c1_f1: { type: "noul", noul: 0.97 }, c1_f2: { type: "noul", noul: 0.05 } });
    const r = await post("/api/agents/agent-1/playground/chat-annotate-citations", { citations });
    expect(r.json.annotations.map((a: any) => a.tags)).toEqual([["gdpr"], ["pci-dss"]]);
  });
});

describe("the seams that carry it", () => {
  it("template matching asks one choice with its first match as the incumbent and moves the model's confident pick to the top only on jev", () => {
    const src = read("server", "routes", "evaluations.ts");
    expect(src).toContain('site: "template_match"');
    expect(src).toContain("incumbent: knownIncumbent({ best: String(top) }, { model: matched.model, latencyMs: matched.latencyMs, inputTokens: matched.inputTokens, costUsd: matched.costUsd }),");
    expect(src).toContain('if (pick?.engine === "jev" && typeof pick.answer === "string" && pick.answer !== String(top)) {');
    expect(src).toContain(`model: "claude-opus-4-5",`);
  });
  it("healing root cause asks one choice over the ten categories with the model's own category as the incumbent, priced from the table", () => {
    const src = read("server", "routes", "runtime.ts");
    expect(src).toContain('site: "healing_root_cause"');
    expect(src).toContain('incumbent: knownIncumbent({ category: incumbentCategory }, { model: "gpt-4o-mini", latencyMs: Date.now() - classifyStart, inputTokens: usage?.prompt_tokens, costUsd: priceTokens("gpt-4o-mini", usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0) }),');
    expect(src).toContain('if (decided.category?.engine === "jev" && typeof decided.category.answer === "string") classification.category = decided.category.answer;');
    // The prompt and the model call are what they were.
    expect(src).toContain('{ role: "system", content: "You are a root cause analysis engine. Always respond with valid JSON." },');
  });
});
