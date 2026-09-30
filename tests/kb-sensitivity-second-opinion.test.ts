/**
 * The knowledge-base sensitivity second opinion (Phase 3, item 8): one choice
 * over the four levels with the keyword scan's level as the known incumbent.
 * It can raise a source's level and never lower it, and it now also runs where
 * the keyword scan never did: on URL sources, whose text exists only after the
 * fetch, and on reprocess.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const route = { mode: "shadow" as "llm" | "shadow" | "jev", threshold: 0.85, reason: "platform" as const };
const jevAnswers: Array<Record<string, unknown>> = [];
const jevCalls: Array<{ state: any; questions: Record<string, any> }> = [];
const audits: Record<string, unknown>[] = [];

vi.mock("../server/decision-settings", () => ({ resolveDecisionRoute: vi.fn(async () => ({ ...route })) }));
vi.mock("../server/decision-shadow", () => ({
  callJev: vi.fn(async (state: unknown, questions: Record<string, unknown>) => {
    jevCalls.push({ state, questions });
    const next = jevAnswers.shift();
    if (!next) throw new Error("Jev HTTP 529");
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 1200, output_tokens: 0 } }, latencyMs: 230 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", () => ({ completeWithFallback: vi.fn(async () => { throw new Error("the keyword scan is the incumbent; the generic prompt must not run"); }) }));

import { sensitivitySecondOpinion, SENSITIVITY_LEVELS } from "../server/kb-sensitivity";
import { callJev } from "../server/decision-shadow";

const record = "Discharge summary. 54-year-old admitted with chest pain; troponin elevated; started on heparin. Follow up with cardiology in two weeks.";
const says = (level: string, confidence = 0.93) => ({ level: { type: "choice", choice: level, probabilities: { [level]: confidence }, confidence } });
const settled = () => new Promise((r) => setTimeout(r, 15));

beforeEach(() => { route.mode = "shadow"; jevAnswers.length = 0; jevCalls.length = 0; audits.length = 0; process.env.TYPESAFE_API_KEY = "test-key"; vi.mocked(callJev).mockClear(); });

describe("in shadow", () => {
  it("keeps the keyword level and records both answers", async () => {
    jevAnswers.push(says("restricted"));
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "public", orgId: "org-a", subject: "kb-1:src-1" })).toEqual({ level: "public" });
    await settled();
    expect(audits.find((a) => a.site === "kb_sensitivity")).toMatchObject({ mode: "shadow", engine: "llm", llmModel: "keyword-scan", llmAnswer: { answer: "public" }, jevAnswer: { answer: "restricted" }, agree: false, subject: "kb-1:src-1" });
    expect(Object.keys(jevCalls[0].questions.level.criteria)).toEqual([...SENSITIVITY_LEVELS]);
  });
});

describe("on the jev route", () => {
  beforeEach(() => { route.mode = "jev"; });
  it("raises the level when the decision model is confident of a higher one, and says what it was", async () => {
    jevAnswers.push(says("restricted", 0.91));
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "public" })).toEqual({ level: "restricted", raisedFrom: "public", model: "jev-1.13.0", confidence: 0.91 });
    // "internal" is a level only the second opinion can reach: the keyword scan never assigns it.
    jevAnswers.push(says("internal"));
    expect((await sensitivitySecondOpinion({ text: "Q3 staffing plan for the claims team.", keywordLevel: "public" })).level).toBe("internal");
  });
  it("never lowers: a lower answer, an unsure one, or a failed call leaves the keyword level", async () => {
    jevAnswers.push(says("public"));
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "confidential" })).toEqual({ level: "confidential" });
    jevAnswers.push(says("restricted", 0.4));
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "confidential" })).toEqual({ level: "confidential" });
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "confidential" })).toEqual({ level: "confidential" }); // nothing queued
  });
  it("shows the model the head of a long source, not all of it", async () => {
    jevAnswers.push(says("public"));
    await sensitivitySecondOpinion({ text: "x".repeat(50_000), keywordLevel: "public" });
    expect(jevCalls[0].state.content).toHaveLength(12_000);
  });
});

describe("where there is nothing to ask", () => {
  it("a restricted source cannot go higher, an empty one has nothing to judge, and the kill switch asks nothing", async () => {
    route.mode = "jev";
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "restricted" })).toEqual({ level: "restricted" });
    expect(await sensitivitySecondOpinion({ text: "   ", keywordLevel: "public" })).toEqual({ level: "public" });
    route.mode = "llm";
    expect(await sensitivitySecondOpinion({ text: record, keywordLevel: "public" })).toEqual({ level: "public" });
    expect(callJev).not.toHaveBeenCalled();
  });
});

describe("the scan that carries it", () => {
  const src = read("server", "kb-routes.ts");
  it("stores the opinion's level, audits a raise, and keeps the keyword classifier as it was", () => {
    expect(src).toContain("const keywordLevel = classifySensitivityLevel(detectedClasses);");
    expect(src).toContain("const opinion = await sensitivitySecondOpinion({ text, keywordLevel, orgId, subject: sourceId ? `${kbId}:${sourceId}` : kbId });");
    expect(src).toContain("await storage.updateKnowledgeSource(sourceId, { sensitivityLevel: opinion.level });");
    expect(src).toContain('action: "knowledge.sensitivity_raised",');
    expect(src).toContain('if (detected.some(d => d.sensitivityClass === "PII")) return "confidential";');
  });
  it("also scans a URL source once its text is fetched, and any source on reprocess", () => {
    expect(src).toContain("async function processSourceInBackground(sourceId: string, kbId: string, rescan = false) {");
    expect(src).toContain("if (rescan) {");
    expect(src).toContain("processSourceInBackground(source.id, input.kb.id, true);");
    expect(src).toContain("processSourceInBackground(req.params.sourceId as string, req.params.id as string, true);");
  });
});
