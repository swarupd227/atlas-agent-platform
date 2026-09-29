/**
 * The decision seam (server/decision-provider.ts): which engine answers,
 * when the LLM takes over, that routing itself never calls a model, and that
 * every call leaves one audit row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const route = { mode: "llm" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Record<string, unknown>[] = [];
const audits: Record<string, unknown>[] = [];

vi.mock("../server/decision-settings", () => ({
  resolveDecisionRoute: vi.fn(async () => ({ ...route })),
}));

vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async () => {
    const next = jevAnswers.shift();
    if (next instanceof Error) throw next;
    // A single answer is keyed q (decide); a map without a type is a keyed set (decideMany).
    const answers = next && typeof next === "object" && !("type" in next) ? next : { q: next };
    return { response: { model: "jev-1.13.0", answers, usage: { input_tokens: 500, output_tokens: 10 } }, latencyMs: 200 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));

vi.mock("../server/llm-provider", () => ({
  completeWithFallback: vi.fn(async (messages: Array<{ content: string }>) => ({
    content: messages[0].content.includes("OPTIONS") ? '{"choice": "approve"}' : messages[0].content.includes("LEVELS") ? '{"level": 2}' : "true",
    tokensUsed: { prompt: 800, completion: 5, total: 805 },
    costUsd: 0.0017,
    actualModel: "gpt-4.1",
    toolCalls: [],
  })),
}));

import { decide, decideMany, JEV_USD_PER_1K_INPUT } from "../server/decision-provider";
import { callJev } from "../server/decision-shadow";
import { completeWithFallback } from "../server/llm-provider";

const noul = (site = "evaluateCondition") => ({
  kind: "noul" as const, site, state: { condition: "approved", worker_output: "APPROVED" },
  instructions: "Is the condition satisfied?", criteria: { true: "yes", false: "no" }, subject: "approved",
});

beforeEach(() => {
  route.mode = "llm"; route.threshold = 0.85;
  jevAnswers.length = 0; audits.length = 0;
  process.env.TYPESAFE_API_KEY = "test-key";
  vi.mocked(callJev).mockClear();
  vi.mocked(completeWithFallback).mockClear();
});

describe("decide — llm route", () => {
  it("answers with the LLM only, using the caller's exact prompt, and records the row", async () => {
    const r = await decide({ ...noul(), llmPrompt: "EXACT PROMPT true/false" });
    expect(r.engine).toBe("llm");
    expect(r.answer).toBe(true);
    expect(r.confidence).toBeNull();
    expect(r.model).toBe("gpt-4.1");
    expect(callJev).not.toHaveBeenCalled();
    expect(vi.mocked(completeWithFallback).mock.calls[0][0][0].content).toBe("EXACT PROMPT true/false");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ site: "evaluateCondition", questionKind: "noul", engine: "llm", mode: "llm", llmDecision: true, jevDecision: null });
    expect(audits[0].stateHash).toHaveLength(32);
  });

  it("marks the row when residency forced the LLM", async () => {
    (route as any).reason = "residency";
    const r = await decide(noul());
    expect(r.fallbackReason).toBe("residency");
    expect(audits[0].fallbackReason).toBe("residency");
    (route as any).reason = "platform";
  });
});

describe("decide — jev route", () => {
  it("returns the decision model's answer when its margin clears the threshold", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "noul", noul: 0.97 });
    const r = await decide(noul());
    expect(r.engine).toBe("jev");
    expect(r.answer).toBe(true);
    expect(r.confidence).toBeCloseTo(0.94);
    expect(r.costUsd).toBeCloseTo(0.5 * JEV_USD_PER_1K_INPUT);
    expect(completeWithFallback).not.toHaveBeenCalled();
    expect(audits[0]).toMatchObject({ engine: "jev", mode: "jev", jevDecision: true, margin: expect.closeTo(0.94, 5) });
  });

  it("falls back to the LLM below the threshold and says why", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "noul", noul: 0.6 });
    const r = await decide(noul());
    expect(r.engine).toBe("llm");
    expect(r.fallbackReason).toBe("below_threshold");
    expect(completeWithFallback).toHaveBeenCalledTimes(1);
    expect(audits[0]).toMatchObject({ engine: "llm", mode: "jev", jevDecision: true, llmDecision: true, fallbackReason: "below_threshold" });
  });

  it("honours a per-call threshold over the route's", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "noul", noul: 0.8 }); // margin 0.6
    const r = await decide({ ...noul(), threshold: 0.5 });
    expect(r.engine).toBe("jev");
  });

  it("falls back to the LLM when the decision model errors, and records the error", async () => {
    route.mode = "jev";
    jevAnswers.push(new Error("Jev HTTP 529: overloaded"));
    const r = await decide(noul());
    expect(r.engine).toBe("llm");
    expect(r.fallbackReason).toBe("jev_error");
    expect(audits[0].error).toContain("529");
  });

  it("falls back to the LLM when no key is configured", async () => {
    route.mode = "jev";
    delete process.env.TYPESAFE_API_KEY;
    const r = await decide(noul());
    expect(r.engine).toBe("llm");
    expect(r.fallbackReason).toBe("no_key");
    expect(callJev).not.toHaveBeenCalled();
  });

  it("answers a choice with the option key and its probabilities", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "choice", choice: "approve", probabilities: { approve: 0.9, reject: 0.1 }, confidence: 0.9 });
    const r = await decide({ kind: "choice", site: "handoff", state: "text", instructions: "Which?", criteria: { approve: "A", reject: "R" } });
    expect(r.answer).toBe("approve");
    expect(r.probabilities).toEqual({ approve: 0.9, reject: 0.1 });
    expect(audits[0]).toMatchObject({ questionKind: "choice", confidence: 0.9, margin: null });
  });

  it("rounds a score to its level", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "score", score: 1.6, legend: {}, probabilities: { "0": 0.1, "1": 0.3, "2": 0.6 }, confidence: 0.9 });
    const r = await decide({ kind: "score", site: "severity", state: "text", instructions: "How bad?", criteria: ["none", "low", "high"] });
    expect(r.answer).toBe(2);
  });
});

describe("decide — shadow route", () => {
  it("lets the LLM decide, asks the decision model afterwards, and records both", async () => {
    route.mode = "shadow";
    jevAnswers.push({ type: "noul", noul: 0.9 });
    const r = await decide(noul());
    expect(r.engine).toBe("llm");
    expect(r.mode).toBe("shadow");
    await new Promise(res => setTimeout(res, 10));
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ mode: "shadow", engine: "llm", jevDecision: true, llmDecision: true, agree: true });
  });

  it("records whether the two engines agreed on a choice, which has no boolean to compare", async () => {
    // Found in the rollout drill (2026-09-29): a decision step's shadow row
    // landed as "not compared", so the decision-step site could never show
    // agreement. The comparison is on the answer itself.
    route.mode = "shadow";
    jevAnswers.push({ type: "choice", choice: "approve", probabilities: { approve: 0.9, reject: 0.1 }, confidence: 0.9 });
    await decide({ kind: "choice", site: "decision_step", state: "text", instructions: "Which?", criteria: { approve: "A", reject: "R" } });
    await new Promise(res => setTimeout(res, 10));
    expect(audits[0]).toMatchObject({ questionKind: "choice", engine: "llm", agree: true, jevDecision: null, llmDecision: null });

    audits.length = 0;
    jevAnswers.push({ type: "choice", choice: "reject", probabilities: { approve: 0.2, reject: 0.8 }, confidence: 0.8 });
    await decide({ kind: "choice", site: "decision_step", state: "text", instructions: "Which?", criteria: { approve: "A", reject: "R" } });
    await new Promise(res => setTimeout(res, 10));
    expect(audits[0]).toMatchObject({ questionKind: "choice", agree: false });
  });

  it("leaves agreement open when only one engine answered", async () => {
    route.mode = "jev";
    jevAnswers.push({ type: "choice", choice: "approve", probabilities: { approve: 0.9, reject: 0.1 }, confidence: 0.9 });
    await decide({ kind: "choice", site: "decision_step", state: "text", instructions: "Which?", criteria: { approve: "A", reject: "R" } });
    expect(audits[0]).toMatchObject({ engine: "jev", agree: null });
  });
});

describe("decide — the LLM as a decision engine", () => {
  it("renders a generic choice prompt and parses the option key", async () => {
    const r = await decide({ kind: "choice", site: "handoff", state: { a: 1 }, instructions: "Which?", criteria: { approve: "A", reject: "R" } });
    expect(r.answer).toBe("approve");
    const prompt = vi.mocked(completeWithFallback).mock.calls[0][0][0].content;
    expect(prompt).toContain("OPTIONS:");
    expect(prompt).toContain("- approve: A");
  });

  it("renders a level list for a score and parses the level", async () => {
    const r = await decide({ kind: "score", site: "severity", state: "x", instructions: "How bad?", criteria: ["none", "low", "high"] });
    expect(r.answer).toBe(2);
  });
});

describe("decideMany — several questions about one state, one call", () => {
  const set = (site = "guardrails") => ({
    site,
    state: { output: "The quote cites the treaty clause and omits the broker fee." },
    questions: {
      pii: { kind: "noul" as const, instructions: "Does the output expose personal data?", criteria: { true: "yes", false: "no" }, subject: "pii" },
      fee: { kind: "noul" as const, instructions: "Does the output state the broker fee?", criteria: { true: "yes", false: "no" }, subject: "fee" },
      tone: { kind: "choice" as const, instructions: "Which tone?", criteria: { approve: "formal", reject: "casual" }, subject: "tone" },
    },
  });

  it("asks the decision model once for the whole set and takes every confident answer", async () => {
    route.mode = "jev";
    jevAnswers.push({ pii: { type: "noul", noul: 0.02 }, fee: { type: "noul", noul: 0.98 }, tone: { type: "choice", choice: "approve", probabilities: { approve: 0.95, reject: 0.05 }, confidence: 0.95 } });
    const r = await decideMany(set());
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(completeWithFallback).not.toHaveBeenCalled();
    expect(r.pii).toMatchObject({ answer: false, engine: "jev" });
    expect(r.fee).toMatchObject({ answer: true, engine: "jev" });
    expect(r.tone).toMatchObject({ answer: "approve", engine: "jev" });
    // One audit row per question, the call's tokens attributed once.
    expect(audits).toHaveLength(3);
    expect(audits.map((a) => a.subject).sort()).toEqual(["fee", "pii", "tone"]);
    expect(r.pii.inputTokens + r.fee.inputTokens + r.tone.inputTokens).toBe(500);
  });

  it("hands only the unsure questions to the incumbent, in the same set", async () => {
    route.mode = "jev";
    jevAnswers.push({ pii: { type: "noul", noul: 0.02 }, fee: { type: "noul", noul: 0.55 }, tone: { type: "choice", choice: "approve", probabilities: { approve: 0.6, reject: 0.4 }, confidence: 0.6 } });
    const r = await decideMany(set());
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(completeWithFallback).toHaveBeenCalledTimes(2);
    expect(r.pii).toMatchObject({ answer: false, engine: "jev" });
    expect(r.fee).toMatchObject({ engine: "llm", fallbackReason: "below_threshold" });
    expect(r.tone).toMatchObject({ answer: "approve", engine: "llm", fallbackReason: "below_threshold" });
    expect(audits.filter((a) => a.engine === "llm").map((a) => a.agree)).toEqual(expect.arrayContaining([true]));
  });

  it("treats a question the model left unanswered as an error for that question only", async () => {
    route.mode = "jev";
    jevAnswers.push({ pii: { type: "noul", noul: 0.02 } });
    const r = await decideMany(set());
    expect(r.pii.engine).toBe("jev");
    expect(r.fee).toMatchObject({ engine: "llm", fallbackReason: "jev_error" });
    expect(audits.find((a) => a.subject === "fee")?.error).toContain("fee");
  });

  it("in shadow mode the incumbent decides each question and the model is asked once, afterwards", async () => {
    route.mode = "shadow";
    jevAnswers.push({ pii: { type: "noul", noul: 0.02 }, fee: { type: "noul", noul: 0.98 }, tone: { type: "choice", choice: "approve", probabilities: { approve: 0.95, reject: 0.05 }, confidence: 0.95 } });
    const r = await decideMany(set());
    expect(Object.values(r).every((x) => x.engine === "llm" && x.mode === "shadow")).toBe(true);
    await new Promise((res) => setTimeout(res, 20));
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(3);
    expect(audits.find((a) => a.subject === "tone")).toMatchObject({ agree: true, jevAnswer: { answer: "approve" } });
  });

  it("never calls the model on the llm route, and returns nothing for an empty set", async () => {
    route.mode = "llm";
    const r = await decideMany(set());
    expect(callJev).not.toHaveBeenCalled();
    expect(Object.keys(r).sort()).toEqual(["fee", "pii", "tone"]);
    expect(await decideMany({ site: "guardrails", state: {}, questions: {} })).toEqual({});
  });
});
