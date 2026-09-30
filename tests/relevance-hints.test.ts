/**
 * Relevance hints (Phase 3, item 5): is each on-demand skill, or each linked
 * connector, needed for the task? In shadow the question is recorded after the
 * run with what the run actually loaded and called as the known incumbent; on
 * the jev route the confident answers become a hint before the run and nothing
 * is measured, because the hint has steered what the run used. The kill switch
 * silences both, and neither can fail a run.
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
    return { response: { model: "jev-1.13.0", answers: next, usage: { input_tokens: 350, output_tokens: 0 } }, latencyMs: 160 };
  }),
  recordDecisionAudit: vi.fn(async (row: Record<string, unknown>) => { audits.push(row); }),
}));
vi.mock("../server/llm-provider", () => ({ completeWithFallback: vi.fn(async () => { throw new Error("the incumbent is known; the generic prompt must not run"); }) }));

import { relevanceHint, recordRelevance, loadedSkillNames, MAX_RELEVANCE_ITEMS } from "../server/relevance-hints";
import { callJev } from "../server/decision-shadow";

const skills = [
  { name: "Broker fee disclosure", description: "State the fee, the payer and the carrier in every quote." },
  { name: "Surplus lines filing", description: "Which states need a filing and by when." },
  { name: "Claims triage", description: "Route a first notice of loss." },
];
const task = "Quote a $2M property risk for Northgate Storage and say what the broker fee is.";
const base = { site: "skill_relevance", task, items: skills, orgId: "org-a", noun: "skill" };
const settled = () => new Promise((r) => setTimeout(r, 15));

beforeEach(() => { route.mode = "shadow"; jevAnswers.length = 0; jevCalls.length = 0; audits.length = 0; process.env.TYPESAFE_API_KEY = "test-key"; vi.mocked(callJev).mockClear(); });

describe("recordRelevance, in shadow", () => {
  it("asks one yes/no per item after the run, with what the run loaded as the known incumbent", async () => {
    jevAnswers.push({ i0: { type: "noul", noul: 0.95 }, i1: { type: "noul", noul: 0.1 }, i2: { type: "noul", noul: 0.04 } });
    recordRelevance({ ...base, used: ["broker fee disclosure", "Surplus lines filing"] });
    await settled();
    expect(callJev).toHaveBeenCalledTimes(1);
    expect(jevCalls[0].state).toMatchObject({ task, skills: [{ name: "Broker fee disclosure" }, { name: "Surplus lines filing" }, { name: "Claims triage" }] });
    expect(jevCalls[0].questions.i0.instructions).toBe('Is the skill "Broker fee disclosure" needed to do this task?');
    const rows = audits.filter((a) => a.site === "skill_relevance");
    expect(rows.map((a) => [a.subject, a.llmDecision, a.jevDecision, a.agree])).toEqual([
      ["Broker fee disclosure", true, true, true],
      ["Surplus lines filing", true, false, false],
      ["Claims triage", false, false, true],
    ]);
    expect(rows[0]).toMatchObject({ mode: "shadow", engine: "llm", llmModel: "the-run" });
  });

  it("does nothing under the kill switch, and nothing once the site is hinted", async () => {
    route.mode = "llm";
    recordRelevance({ ...base, used: [] });
    route.mode = "jev";
    recordRelevance({ ...base, used: [] });
    await settled();
    expect(callJev).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it("asks nothing without a task or without items, and never throws when the model is unreachable", async () => {
    recordRelevance({ ...base, items: [], used: [] });
    recordRelevance({ ...base, task: "  ", used: [] });
    await settled();
    expect(callJev).not.toHaveBeenCalled();
    recordRelevance({ ...base, used: [] }); // no answer queued: the model call fails
    await settled();
    expect(audits.filter((a) => a.error === "Jev HTTP 529")).toHaveLength(3);
  });

  it("carries at most twenty items in one call", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Skill ${i}` }));
    jevAnswers.push(Object.fromEntries(many.slice(0, MAX_RELEVANCE_ITEMS).map((_, i) => [`i${i}`, { type: "noul", noul: 0.1 }])));
    recordRelevance({ ...base, items: many, used: [] });
    await settled();
    expect(Object.keys(jevCalls[0].questions)).toHaveLength(MAX_RELEVANCE_ITEMS);
  });
});

describe("relevanceHint", () => {
  it("says nothing in shadow and asks nothing", async () => {
    expect(await relevanceHint(base)).toEqual([]);
    expect(callJev).not.toHaveBeenCalled();
  });

  it("on the jev route, names only what the decision model is confident the task needs", async () => {
    route.mode = "jev";
    jevAnswers.push({ i0: { type: "noul", noul: 0.97 }, i1: { type: "noul", noul: 0.6 }, i2: { type: "noul", noul: 0.02 } });
    expect(await relevanceHint(base)).toEqual(["Broker fee disclosure"]);
    // The unsure one fell back to saying nothing, and the row says so.
    const unsure = audits.find((a) => a.subject === "Surplus lines filing");
    expect(unsure).toMatchObject({ engine: "llm", llmModel: "no-hint", llmDecision: false, fallbackReason: "below_threshold" });
  });

  it("is an empty hint, not an error, when the seam fails", async () => {
    route.mode = "jev";
    expect(await relevanceHint(base)).toEqual([]);
  });
});

describe("loadedSkillNames", () => {
  it("reads every name a successful read_skill call was given, once", () => {
    expect(loadedSkillNames([
      { toolName: "read_skill", args: { skills: ["A", "B"] } },
      { toolName: "read_skill", args: { skill: "B" } },
      { toolName: "read_skill", args: { skills: ["C"] }, error: "not yours" },
      { toolName: "create_ticket", args: { skill: "D" } },
    ])).toEqual(["A", "B"]);
  });
});

describe("the runtime's hooks", () => {
  const src = read("server", "agent-runtime.ts");
  it("names the likely skills under the catalog only through the hint, and leaves the tool list alone", () => {
    expect(src).toContain('const likely = await relevanceHint({ site: "skill_relevance", task: prompt, items: onDemandSkillItems, orgId, noun: "skill" });');
    expect(src).toContain("<skill_relevance>Likely needed for this task: ${likely.join(\", \")}. Load them with read_skill before you act, if that work is yours.</skill_relevance>");
  });
  it("records both sites after the run from what it loaded and called, the connector one only between two or more", () => {
    expect(src).toContain('recordRelevance({ site: "skill_relevance", task: prompt, items: onDemandSkillItems, used: loadedSkillNames(toolCallResults), orgId, noun: "skill" });');
    expect(src).toContain('if (connectorItems.length >= 2) recordRelevance({ site: "connector_preselect", task: prompt, items: connectorItems, used: toolCallResults.filter((r) => !r.error).map((r) => r.serverName), orgId, noun: "connector" });');
  });
});
