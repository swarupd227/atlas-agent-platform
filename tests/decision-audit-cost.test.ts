/**
 * Cost where it is spent, and one cap on live calls (Phase 2, item 2).
 *
 * Every judge on the platform discarded the provider's cost and the seam dropped
 * its own, so a before-and-after per judge could only be estimated. The audit
 * row now carries what each engine cost, the summary sums it per site, and the
 * seam's calls to the decision model share one queue of eight so a slow vendor
 * minute cannot fan out into a hundred open requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "jev" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const audits: Record<string, unknown>[] = [];
const inFlight = { now: 0, max: 0 };

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async (_state: unknown, questions: Record<string, unknown>) => {
    inFlight.now++;
    inFlight.max = Math.max(inFlight.max, inFlight.now);
    await new Promise((r) => setTimeout(r, 15));
    inFlight.now--;
    const answers: Record<string, unknown> = {};
    for (const k of Object.keys(questions)) answers[k] = { type: "noul", noul: 0.98 };
    return { response: { model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 0 } }, latencyMs: 15 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", () => ({
  completeWithFallback: vi.fn(async () => ({ content: "true", tokensUsed: { prompt: 800, completion: 5, total: 805 }, costUsd: 0.0017, actualModel: "gpt-4.1", toolCalls: [] })),
}));

import { decide, decideMany, decisionCallsInFlight, JEV_USD_PER_1K_INPUT } from "../server/decision-provider";

const noul = (subject: string) => ({ kind: "noul" as const, site: "evaluateCondition", state: { s: subject }, instructions: "Holds?", criteria: { true: "y", false: "n" }, subject });

beforeEach(() => { audits.length = 0; inFlight.now = 0; inFlight.max = 0; route.mode = "jev"; process.env.TYPESAFE_API_KEY = "test-key"; });

describe("the audit row carries what each engine cost", () => {
  it("prices the decision model's answer from its tokens", async () => {
    await decide(noul("a"));
    expect(audits[0]).toMatchObject({ engine: "jev", jevCostUsd: (1000 / 1000) * JEV_USD_PER_1K_INPUT, llmCostUsd: null, llmInputTokens: null });
  });

  it("prices the incumbent's answer from the provider's own cost and tokens", async () => {
    route.mode = "llm";
    await decide(noul("b"));
    expect(audits[0]).toMatchObject({ engine: "llm", llmCostUsd: 0.0017, llmInputTokens: 800, jevCostUsd: null });
  });

  it("attributes a set's decision-model cost once, on its first question", async () => {
    await decideMany({ site: "guardrails", state: {}, questions: { a: { kind: "noul", instructions: "A?" }, b: { kind: "noul", instructions: "B?" }, c: { kind: "noul", instructions: "C?" } } });
    const priced = audits.map((a) => Number(a.jevCostUsd ?? 0));
    expect(priced.reduce((s, x) => s + x, 0)).toBeCloseTo((1000 / 1000) * JEV_USD_PER_1K_INPUT, 10);
    expect(priced.filter((x) => x > 0)).toHaveLength(1);
  });

  it("is stored, and summed per site, in the columns the migration adds", () => {
    const db = read("server", "db.ts");
    for (const col of ["llm_input_tokens INTEGER", "llm_cost_usd REAL", "jev_cost_usd REAL"]) expect(db).toContain(`ALTER TABLE decision_audit ADD COLUMN IF NOT EXISTS ${col};`);
    const shadow = read("server", "decision-shadow.ts");
    expect(shadow).toContain("llm_input_tokens, llm_cost_usd, jev_cost_usd)");
    expect(shadow).toContain("${row.llmInputTokens ?? null}, ${row.llmCostUsd ?? null}, ${row.jevCostUsd ?? null})");
    const summary = read("server", "routes", "decision-audit.ts");
    expect(summary).toContain("COALESCE(SUM(llm_cost_usd), 0) AS llm_cost_usd");
    expect(summary).toContain("COALESCE(SUM(jev_cost_usd), 0) AS jev_cost_usd");
    expect(summary).toContain("cost: { llmUsd: Number(r.llm_cost_usd), jevUsd: Number(r.jev_cost_usd), llmInputTokens: r.llm_input_tokens, llmPricedRows: r.llm_priced_rows },");
  });
});

describe("one cap on live calls to the decision model", () => {
  it("never has more than eight calls open, and answers every caller", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => decide(noul(`q${i}`))));
    expect(results).toHaveLength(30);
    expect(results.every((r) => r.engine === "jev" && r.answer === true)).toBe(true);
    expect(inFlight.max).toBeLessThanOrEqual(8);
    expect(inFlight.max).toBeGreaterThan(1);
    expect(decisionCallsInFlight()).toBe(0);
  });

  it("counts a set as one call, however many questions it carries", async () => {
    const sets = Array.from({ length: 12 }, (_, i) => decideMany({ site: "guardrails", state: { i }, questions: { a: { kind: "noul", instructions: "A?" }, b: { kind: "noul", instructions: "B?" } } }));
    const out = await Promise.all(sets);
    expect(out.every((r) => r.a.engine === "jev" && r.b.engine === "jev")).toBe(true);
    expect(inFlight.max).toBeLessThanOrEqual(8);
    expect(decisionCallsInFlight()).toBe(0);
  });

  it("queues rather than drops: the shadow's drop counter is not what the seam uses", () => {
    const provider = read("server", "decision-provider.ts");
    expect(provider).toContain("const MAX_LIVE_IN_FLIGHT = 8;");
    expect(provider).toContain("if (liveInFlight >= MAX_LIVE_IN_FLIGHT) await new Promise<void>((resolve) => liveQueue.push(resolve));");
    expect(provider).not.toContain("stats.dropped");
  });
});
