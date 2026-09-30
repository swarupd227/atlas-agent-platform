/**
 * Retrieval rerank (Phase 3, item 7): which retrieved passage best answers the
 * question. One choice over the head of the list, with cosine's first passage
 * as the known incumbent, so the audit measures top-1 agreement. In shadow the
 * order is untouched and nothing is awaited; on the jev route a confident,
 * different pick moves to the front and nothing is ever dropped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "shadow" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown> | "hang"> = [];
const jevCalls: Array<{ state: any; questions: Record<string, any> }> = [];
const audits: Record<string, unknown>[] = [];

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async (state: unknown, questions: Record<string, unknown>) => {
    jevCalls.push({ state, questions });
    const next = jevAnswers.shift();
    if (next === "hang") return new Promise(() => {});
    if (!next) throw new Error("Jev HTTP 529");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 900, output_tokens: 0 } }, latencyMs: 210 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", () => ({ completeWithFallback: vi.fn(async () => { throw new Error("cosine is the incumbent; the generic prompt must not run"); }) }));

import { rerankChunks, RERANK_MAX_PASSAGES } from "../server/retrieval-rerank";
import { callJev } from "../server/decision-shadow";

const chunks = [
  { id: "c1", content: "Surplus lines carriers are not admitted in the state.", similarity: 0.71 },
  { id: "c2", content: "The broker fee for a surplus lines placement is $250, payable by the insured.", similarity: 0.66 },
  { id: "c3", content: "Filing deadlines vary by state.", similarity: 0.52 },
];
const question = "What is the broker fee and who pays it?";
const pick = (k: string, confidence = 0.92) => ({ best: { type: "choice", choice: k, probabilities: { [k]: confidence }, confidence } });
const ids = (list: Array<{ id: string }>) => list.map((c) => c.id);
const settled = () => new Promise((r) => setTimeout(r, 15));

beforeEach(() => { route.mode = "shadow"; jevAnswers.length = 0; jevCalls.length = 0; audits.length = 0; process.env.TYPESAFE_API_KEY = "test-key"; vi.mocked(callJev).mockClear(); });

describe("in shadow", () => {
  it("returns cosine's order at once and records whether the model's top pick is cosine's", async () => {
    jevAnswers.push("hang");
    const t0 = Date.now();
    expect(ids(await rerankChunks(question, chunks, { orgId: "org-a" }))).toEqual(["c1", "c2", "c3"]);
    expect(Date.now() - t0).toBeLessThan(1000);

    jevAnswers.length = 0; jevAnswers.push(pick("p1"));
    await rerankChunks(question, chunks, { orgId: "org-a" });
    await settled();
    const row = audits.find((a) => a.site === "retrieval_rerank");
    expect(row).toMatchObject({ mode: "shadow", engine: "llm", questionKind: "choice", llmModel: "cosine", llmAnswer: { answer: "p0" }, jevAnswer: { answer: "p1" }, agree: false, subject: question });
    const call = jevCalls.at(-1)!;
    expect(call.state).toEqual({ question });
    expect(Object.keys(call.questions.best.criteria)).toEqual(["p0", "p1", "p2"]);
    expect(call.questions.best.criteria.p1).toContain("broker fee");
  });
});

describe("on the jev route", () => {
  beforeEach(() => { route.mode = "jev"; });
  it("moves a confident, different pick to the front and drops nothing", async () => {
    jevAnswers.push(pick("p1"));
    expect(ids(await rerankChunks(question, chunks))).toEqual(["c2", "c1", "c3"]);
  });
  it("keeps cosine's order when the model agrees, is unsure, or cannot be reached", async () => {
    jevAnswers.push(pick("p0"));
    expect(ids(await rerankChunks(question, chunks))).toEqual(["c1", "c2", "c3"]);
    jevAnswers.push(pick("p2", 0.4));
    expect(ids(await rerankChunks(question, chunks))).toEqual(["c1", "c2", "c3"]);
    expect(ids(await rerankChunks(question, chunks))).toEqual(["c1", "c2", "c3"]); // no answer queued: the call fails
  });
  it("asks about the head of a long list only, and leaves the tail behind it in order", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, content: `Passage ${i}`, similarity: 0.9 - i * 0.01 }));
    jevAnswers.push(pick("p5"));
    const out = ids(await rerankChunks(question, many));
    expect(Object.keys(jevCalls[0].questions.best.criteria)).toHaveLength(RERANK_MAX_PASSAGES);
    expect(out).toHaveLength(20);
    expect(out.slice(0, 3)).toEqual(["c5", "c0", "c1"]);
    expect(out.slice(12)).toEqual(many.slice(12).map((c) => c.id));
  });
});

describe("where there is nothing to ask", () => {
  it("under the kill switch, with fewer than two passages, with no question, or with no real similarity", async () => {
    route.mode = "llm";
    expect(await rerankChunks(question, chunks)).toBe(chunks);
    route.mode = "jev";
    expect(await rerankChunks(question, [chunks[0]])).toEqual([chunks[0]]);
    expect(await rerankChunks("  ", chunks)).toBe(chunks);
    const recency = chunks.map((c) => ({ ...c, similarity: null }));
    expect(await rerankChunks(question, recency)).toBe(recency);
    expect(await rerankChunks(question, undefined as any)).toBeUndefined();
    expect(callJev).not.toHaveBeenCalled();
  });
});

describe("the callers", () => {
  it("the agent runtime, the workspace run and the knowledge-base node all pass their passages through it", () => {
    expect(read("server", "agent-runtime.ts")).toContain("const chunks = await rerankChunks(prompt, found, { orgId });");
    expect(read("server", "workspace-run.ts")).toContain("const chunks = await rerankChunks(input, found, { orgId });");
    expect(read("server", "dag-execution-engine.ts")).toContain("const chunks = await rerankChunks(query, found, { orgId: (kb as { organizationId?: string | null }).organizationId ?? null });");
  });
});
