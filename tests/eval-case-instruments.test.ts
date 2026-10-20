/**
 * Routing an eval case to the instrument that can actually score it.
 *
 * The executor's first version treated expectedOutput as prose and handed a
 * JSON.stringify'd object to the compliance examiner as criterion text. The
 * examiner credits a criterion only when it echoes the text verbatim, and no
 * model echoes raw JSON, so every object-shaped case scored 0 whatever the
 * agent answered -- while the judge's own reasoning said the agent had
 * complied. Measured live on the 17 MGA suites: 107 of 146 active cases are
 * object-shaped, so 73% of the dataset was a guaranteed zero, and one suite
 * had already had that false 0 written onto its row where the promotion gate
 * reads it.
 *
 * These tests pin the three things that failure needed:
 *   - a case asserting field values is COMPARED, not judged (and no examiner
 *     call is made for it);
 *   - "the agent said nothing parseable" stays distinguishable from "the agent
 *     said the wrong thing";
 *   - a judge that paraphrases a prose criterion no longer fails it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = {
  suite: null,
  agent: { id: "agent1", name: "E&S Property Binding Orchestrator", environment: "staging" },
  cases: [] as any[],
  runs: [] as any[],
  caseResults: [] as any[],
  suiteUpdates: [] as any[],
  agentAnswer: "{}",
  stopReason: "end_turn",
  modelCalls: [] as Array<{ model: string; max_tokens: number }>,
};

const decideMany = vi.fn(async ({ questions }: any) => Object.fromEntries(
  Object.keys(questions).map(k => [k, { value: true, answer: true, reasoning: "stub" }]),
));

vi.mock("../server/storage", () => ({
  storage: {
    getEvalSuite: vi.fn(async () => state.suite),
    getAgent: vi.fn(async () => state.agent),
    getEvalTestCases: vi.fn(async () => state.cases),
    createEvalRun: vi.fn(async (r: any) => { const run = { ...r, id: `run${state.runs.length + 1}` }; state.runs.push(run); return run; }),
    updateEvalRun: vi.fn(async (id: string, patch: any) => { Object.assign(state.runs.find((r: any) => r.id === id) ?? {}, patch); return patch; }),
    createEvalCaseResult: vi.fn(async (r: any) => { state.caseResults.push(r); return r; }),
    updateEvalSuite: vi.fn(async (_id: string, patch: any) => { state.suiteUpdates.push(patch); return patch; }),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({ checkPermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../server/routes/helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn(async () => "SYSTEM PROMPT") }));
vi.mock("./helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn(async () => "SYSTEM PROMPT") }));
vi.mock("../server/builtin-skill-tools", () => ({
  resolveReadableSkills: vi.fn(async () => []),
  skillCatalogPrompt: vi.fn(() => ""),
  skillToolsFor: vi.fn(() => []),
  executeBuiltinSkillTool: vi.fn(async () => ""),
  READ_SKILL_TOOL: "read_skill",
}));
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(async () => "{}"),
  callClaudeWithUsage: vi.fn(async () => ({ text: "{}", model: "m", latencyMs: 1, inputTokens: 1, costUsd: 0 })),
  // The agent's answer is what the structured comparison reads.
  createClaudeMessage: vi.fn(async (opts: any) => {
    state.modelCalls.push({ model: opts.model, max_tokens: opts.max_tokens });
    return { content: [{ type: "text", text: state.agentAnswer }], stop_reason: state.stopReason };
  }),
  stripJsonFences: (s: string) => s,
}));
vi.mock("../server/decision-provider", () => ({ decideMany }));

const mod = await import("../server/routes/golden-eval");
const { classifyEvalCase, extractJsonObject, valueSatisfies, scoreStructuredCase, sameCriterion } = mod as any;
const router = (mod as any).default;

// The two object shapes seen live, verbatim from the deployed dataset.
const KPI_EXPECTED = { kpiName: "Treaty breach detection rate", threshold: 0, slaBreached: true, expectedAction: "alert_and_escalate" };
const REG_EXPECTED = { compliant: true, regulationRef: "NAIC UCSPA", expectedBehavior: "Agent must comply with NAIC UCSPA requirements when handling Replacement Cost operations" };

describe("classifyEvalCase", () => {
  it("routes an asserted-fields case to a comparison, not to the judge", () => {
    const i = classifyEvalCase({ expectedOutput: KPI_EXPECTED });
    expect(i.kind).toBe("structured");
    // threshold is NOT here: this assertion originally included it, which is
    // what let 99 cases score a third of their fields for free.
    expect(i.keys.sort()).toEqual(["expectedAction", "slaBreached"]);
  });

  it("excludes kpiName from the asserted keys", () => {
    // It restates the input, so comparing it fails a correct verdict on wording.
    expect(classifyEvalCase({ expectedOutput: KPI_EXPECTED }).keys).not.toContain("kpiName");
  });

  it("excludes threshold and target: they are handed to the agent in inputData", () => {
    // Measured live: threshold was asserted in 99 of 99 boundary cases and
    // present in inputData with the identical value in all 99, marking a
    // third of every case correct before the agent judged anything. That is
    // why nine suites read 107/107.
    const i = classifyEvalCase({ expectedOutput: { kpiName: "x", threshold: 95, slaBreached: true, expectedAction: "alert_and_escalate" } });
    expect(i.keys).not.toContain("threshold");
    expect(i.keys.sort()).toEqual(["expectedAction", "slaBreached"]);

    const volume = classifyEvalCase({ expectedOutput: { kpiName: "x", target: 400, targetMet: false, gap: 40 } });
    expect(volume.keys).not.toContain("target");
    expect(volume.keys.sort()).toEqual(["gap", "targetMet"]);
  });

  it("still asserts something for every live case shape once those are removed", () => {
    // If stripping them emptied a shape, that shape would silently become
    // unjudgeable and stop counting at all.
    for (const shape of [
      { kpiName: "x", threshold: 95, slaBreached: true, expectedAction: "alert_and_escalate" },
      { kpiName: "x", threshold: 95, slaBreached: false, marginOfSafety: 0 },
      { kpiName: "x", threshold: 95, slaBreached: false, withinTarget: true },
      { kpiName: "x", target: 400, targetMet: true },
      { kpiName: "x", threshold: 95, target: 100, slaBreached: false },
    ]) {
      const i = classifyEvalCase({ expectedOutput: shape });
      expect(i.kind, JSON.stringify(shape)).toBe("structured");
      expect(i.keys.length, JSON.stringify(shape)).toBeGreaterThan(0);
    }
  });

  it("judges the regulation shape on expectedBehavior, not on the serialized object", () => {
    const i = classifyEvalCase({ expectedOutput: REG_EXPECTED });
    expect(i.kind).toBe("prose");
    expect(i.criterion).toBe(REG_EXPECTED.expectedBehavior);
    // The regression that caused the bug: the criterion must never be JSON.
    expect(i.criterion).not.toMatch(/^\{/);
    expect(i.criterion).not.toContain("regulationRef");
  });

  it("keeps a prose expectedOutput on the judge path", () => {
    const i = classifyEvalCase({ expectedOutput: "  System binds the policy and posts GL entries.  " });
    expect(i).toEqual({ kind: "prose", criterion: "System binds the policy and posts GL entries." });
  });

  it("reports nothing to score for empty, null, array and descriptive-only cases", () => {
    expect(classifyEvalCase({ expectedOutput: "" }).kind).toBe("none");
    expect(classifyEvalCase({ expectedOutput: "   " }).kind).toBe("none");
    expect(classifyEvalCase({ expectedOutput: null }).kind).toBe("none");
    expect(classifyEvalCase({}).kind).toBe("none");
    expect(classifyEvalCase({ expectedOutput: [1, 2] }).kind).toBe("none");
    // Only descriptive keys -> nothing is actually asserted.
    expect(classifyEvalCase({ expectedOutput: { kpiName: "x", unit: "percent" } }).kind).toBe("none");
  });

  it("ignores keys whose asserted value is null", () => {
    const i = classifyEvalCase({ expectedOutput: { kpiName: "x", slaBreached: true, expectedAction: null } });
    expect(i.keys).toEqual(["slaBreached"]);
  });
});

describe("extractJsonObject", () => {
  it("reads a verdict out of fences and surrounding prose", () => {
    expect(extractJsonObject('```json\n{"slaBreached": true}\n```')).toEqual({ slaBreached: true });
    expect(extractJsonObject('Here is my assessment:\n{"slaBreached": false}\nLet me know.')).toEqual({ slaBreached: false });
  });

  it("returns null rather than an empty object when there is no verdict", () => {
    // Decisive: an empty object would compare as "every field wrong" instead
    // of "the agent never answered".
    expect(extractJsonObject("The SLA was breached, so I escalated.")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("{not json at all")).toBeNull();
  });

  /**
   * The two shapes that scored right answers as missing.
   *
   * The brace span runs from the first `{` in the whole answer to the last
   * `}`, so anything brace-shaped elsewhere makes it span prose and fail to
   * parse -- and the case was then reported as "no parseable JSON verdict",
   * a missing answer rather than a wrong one. Measured on two J4 eval answers
   * (2026-10-11), each ending in a clean block with the correct value; the
   * same cause failed 2 of 3 structured cases in J1's suite.
   */
  it("finds the verdict when prose after the block contains a brace", () => {
    const answer = [
      "## Legal Hold Assessment",
      "I searched 28 requests. None names this subject.",
      "```json",
      '{"holdPosition": "may_apply", "systemOfRecord": "Peoplesoft HCM"}',
      "```",
      "Note: the hold registry uses the form {matter}/{year}, which this estate does not populate.",
    ].join("\n");
    expect(extractJsonObject(answer)).toEqual({ holdPosition: "may_apply", systemOfRecord: "Peoplesoft HCM" });
  });

  it("finds the verdict when the answer emitted another fenced object first", () => {
    const answer = [
      "Assessment follows.",
      "```risk_assessment",
      '{"title": "Employee Erasure Request", "score": 7}',
      "```",
      "And the verdict:",
      "```json",
      '{"holdPosition": "may_apply"}',
      "```",
    ].join("\n");
    // The LAST json block is the verdict; the earlier object must not win.
    expect(extractJsonObject(answer)).toEqual({ holdPosition: "may_apply" });
  });

  it("prefers the agent's answer over an example of the shape in the prompt echo", () => {
    const answer = [
      "You asked me to end with:",
      "```json",
      '{"holdPosition": "cleared | may_apply | plainly_applies"}',
      "```",
      "Here is my actual verdict:",
      "```json",
      '{"holdPosition": "plainly_applies"}',
      "```",
    ].join("\n");
    expect(extractJsonObject(answer)).toEqual({ holdPosition: "plainly_applies" });
  });

  /**
   * The brace walk must terminate.
   *
   * String.lastIndexOf clamps a negative fromIndex to 0, so lastIndexOf("{", -1)
   * returns 0 again for any text beginning with "{": the walk sat on index 0
   * forever, blocking the event loop for every request on the instance and
   * hanging this very file. It reached production in 098a014d and was found
   * there by two peer sessions. The second input is deliberate -- a fix that
   * only special-cases index 0 still has to walk "{a} {b" back correctly.
   */
  it("terminates on an unparseable answer that begins with a brace", () => {
    expect(extractJsonObject("{ not json")).toBeNull();
    expect(extractJsonObject("{a} {b")).toBeNull();
    expect(extractJsonObject("{")).toBeNull();
    // And still finds a real object when an earlier brace does not parse.
    expect(extractJsonObject('{ not json\nbut then: {"holdPosition": "may_apply"}')).toEqual({ holdPosition: "may_apply" });
  });

  it("still reads a bare object, and a bare fence with no language", () => {
    expect(extractJsonObject('Verdict: {"slaBreached": true} -- done.')).toEqual({ slaBreached: true });
    expect(extractJsonObject('```\n{"slaBreached": false}\n```')).toEqual({ slaBreached: false });
  });

  it("scores the measured answer as a comparison rather than a missing answer", () => {
    // End to end through the scorer, which is where the symptom appeared.
    const answer = [
      "The records do not associate a hold with a subject.",
      "```risk_assessment",
      '{"score": 7}',
      "```",
      "```json",
      '{"holdPosition": "may_apply"}',
      "```",
    ].join("\n");
    const r = scoreStructuredCase({ holdPosition: "may_apply" }, ["holdPosition"], answer);
    expect(r.noVerdict).toBe(false);
    expect(r.passed).toBe(true);
    expect(r.met).toEqual(['holdPosition = "may_apply"']);
  });
});

describe("valueSatisfies", () => {
  it("compares booleans by value and accepts yes/no and quoted booleans", () => {
    expect(valueSatisfies(true, true)).toBe(true);
    expect(valueSatisfies(true, "true")).toBe(true);
    expect(valueSatisfies(true, "Yes")).toBe(true);
    expect(valueSatisfies(true, false)).toBe(false);
    expect(valueSatisfies(false, "no")).toBe(true);
    expect(valueSatisfies(true, "no")).toBe(false);
  });

  it("compares numbers through formatting", () => {
    expect(valueSatisfies(0, 0)).toBe(true);
    expect(valueSatisfies(47250, "47,250")).toBe(true);
    expect(valueSatisfies(100, "100%")).toBe(true);
    expect(valueSatisfies(0, 1)).toBe(false);
  });

  it("compares a decision on its slug, so phrasing does not fail a right answer", () => {
    expect(valueSatisfies("alert_and_escalate", "alert and escalate")).toBe(true);
    expect(valueSatisfies("alert_and_escalate", "Alert And Escalate")).toBe(true);
    expect(valueSatisfies("alert_and_escalate", "monitor_only")).toBe(false);
  });

  it("treats a missing field as unsatisfied", () => {
    expect(valueSatisfies(true, undefined)).toBe(false);
    expect(valueSatisfies("alert_and_escalate", null)).toBe(false);
  });
});

describe("scoreStructuredCase", () => {
  const keys = ["threshold", "slaBreached", "expectedAction"];

  it("passes a correct verdict -- which the old code could not do at all", () => {
    const r = scoreStructuredCase(KPI_EXPECTED, keys, '{"threshold":0,"slaBreached":true,"expectedAction":"alert and escalate"}');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.noVerdict).toBe(false);
    expect(r.missed).toEqual([]);
  });

  it("fails a wrong value and names what the agent gave instead", () => {
    const r = scoreStructuredCase(KPI_EXPECTED, keys, '{"threshold":0,"slaBreached":false,"expectedAction":"alert_and_escalate"}');
    expect(r.passed).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.missed).toEqual(['slaBreached = true']);
    expect(r.reasoning).toContain("agent gave false");
  });

  it("separates no parseable verdict from a wrong verdict", () => {
    const r = scoreStructuredCase(KPI_EXPECTED, keys, "The treaty limit was breached and I escalated to the underwriter.");
    expect(r.passed).toBe(false);
    expect(r.noVerdict).toBe(true);
    expect(r.reasoning).toMatch(/missing answer, not a wrong one/i);
    expect(r.missed).toHaveLength(3);
  });
});

describe("sameCriterion", () => {
  it("matches a paraphrase of a long criterion", () => {
    const c = "Agent must comply with NAIC UCSPA requirements when handling Replacement Cost operations";
    expect(sameCriterion(c, c)).toBe(true);
    expect(sameCriterion(c, `  ${c.toUpperCase()}  `)).toBe(true);
    expect(sameCriterion(c, `1. ${c} as described above`)).toBe(true);
  });

  it("does not match two different criteria just because both are short", () => {
    expect(sameCriterion("post GL entries", "notify broker")).toBe(false);
    expect(sameCriterion("bind", "binding")).toBe(false);
  });
});

// --- route level -------------------------------------------------------
let server: Server;
let base = "";
const post = async (path: string, body: any = {}) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const kpiCase = (over: any = {}) => ({
  id: `c${Math.random().toString(36).slice(2, 7)}`,
  name: "Treaty breach detection rate - Below SLA Boundary",
  status: "active",
  inputData: { type: "kpi_boundary_test", kpiName: "Treaty breach detection rate", threshold: 0, simulatedValue: 0, scenario: "below_threshold" },
  expectedOutput: KPI_EXPECTED,
  ...over,
});

beforeEach(async () => {
  state.suite = { id: "s1", name: "E&S KPI-Aligned Suite", agentId: "agent1", goldenDatasetId: null };
  state.cases = [];
  state.runs = [];
  state.caseResults = [];
  state.suiteUpdates = [];
  state.agentAnswer = "{}";
  state.stopReason = "end_turn";
  state.modelCalls = [];
  state.agent = { id: "agent1", name: "E&S Property Binding Orchestrator", environment: "staging" };
  decideMany.mockClear();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(router);
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

describe("POST /api/evals/:id/execute instrument routing", () => {
  it("passes a KPI case the agent answers correctly, and calls no judge to do it", async () => {
    state.cases = [kpiCase()];
    state.agentAnswer = '{"threshold":0,"slaBreached":true,"expectedAction":"alert_and_escalate"}';
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(200);
    expect(r.body.passedCases).toBe(1);
    expect(r.body.passRate).toBe(1);
    expect(r.body.instruments.structured_comparison).toBe(1);
    expect(r.body.instruments.prose_judge).toBe(0);
    // The point of the change: no examiner/decision call for a comparison.
    expect(decideMany).not.toHaveBeenCalled();
    expect(state.caseResults[0].scorerOutputs.instrument).toBe("structured_comparison");
  });

  it("no longer scores 0 merely because expectedOutput was an object", async () => {
    // This is the exact live failure: a correct agent, scored 0.
    state.cases = [kpiCase(), kpiCase()];
    state.agentAnswer = '{"threshold":0,"slaBreached":true,"expectedAction":"alert_and_escalate"}';
    const r = await post("/api/evals/s1/execute");
    expect(r.body.failedCases).toBe(0);
    expect(state.suiteUpdates[0].passRate).toBe(1);
  });

  it("still fails a KPI case when the agent's verdict is wrong", async () => {
    state.cases = [kpiCase()];
    state.agentAnswer = '{"threshold":0,"slaBreached":false,"expectedAction":"monitor_only"}';
    const r = await post("/api/evals/s1/execute");
    expect(r.body.passedCases).toBe(0);
    expect(state.caseResults[0].scorerOutputs.noVerdict).toBe(false);
    expect(state.caseResults[0].failingReason).toContain("slaBreached");
  });

  it("answers with the agent's own Claude model and room for a full answer, and says which model answered", async () => {
    // Every case used to be answered by claude-opus-4-5 at 1,500 tokens, so a
    // Sonnet agent's suite scored Opus, and a long structured answer was cut off.
    state.agent = { ...state.agent, modelProvider: "anthropic", modelName: "claude-sonnet-4-5" };
    state.cases = [kpiCase()];
    state.agentAnswer = '{"threshold":0,"slaBreached":true,"expectedAction":"alert_and_escalate"}';
    await post("/api/evals/s1/execute");
    expect(state.modelCalls[0]).toEqual({ model: "claude-sonnet-4-5", max_tokens: 4096 });
    expect(state.runs[0].resultsJson.answeredBy).toBe("claude-sonnet-4-5");
  });

  it("falls back to the harness model for an agent that does not run on Claude", async () => {
    state.agent = { ...state.agent, modelProvider: "openai", modelName: "gpt-4.1" };
    state.cases = [kpiCase()];
    await post("/api/evals/s1/execute");
    expect(state.modelCalls[0].model).toBe("claude-opus-4-5");
    expect(state.runs[0].resultsJson.answeredBy).toBe("claude-opus-4-5");
  });

  it("reports an answer cut off at the token limit as truncated, not as an omission", async () => {
    state.cases = [kpiCase()];
    state.agentAnswer = '## Review\n\n```json\n{"threshold":0,"slaBre';
    state.stopReason = "max_tokens";
    await post("/api/evals/s1/execute");
    const row = state.caseResults[0];
    expect(row.scorerOutputs.noVerdict).toBe(true);
    expect(row.scorerOutputs.truncated).toBe(true);
    expect(row.scorerOutputs.judgeReasoning).toMatch(/^The agent's answer was cut off at the 4096-token answer limit/);
    expect(state.runs[0].resultsJson.casesTruncated).toBe(1);
  });

  it("marks a prose-only agent answer as no verdict rather than a wrong one", async () => {
    state.cases = [kpiCase()];
    state.agentAnswer = "The SLA was breached so I escalated to the underwriter.";
    await post("/api/evals/s1/execute");
    expect(state.caseResults[0].scorerOutputs.noVerdict).toBe(true);
  });

  it("sends a regulation-shaped case to the judge on its expectedBehavior", async () => {
    state.cases = [kpiCase({ expectedOutput: REG_EXPECTED, name: "[NAIC UCSPA] Compliance Boundary" })];
    state.agentAnswer = "I comply with NAIC UCSPA when handling Replacement Cost.";
    const r = await post("/api/evals/s1/execute");
    expect(r.body.instruments.prose_judge).toBe(1);
    expect(r.body.instruments.structured_comparison).toBe(0);
    expect(decideMany).toHaveBeenCalled();
    // The criterion the judge saw must be the sentence, never the JSON.
    const q = decideMany.mock.calls[0][0].questions;
    expect(JSON.stringify(q)).toContain("NAIC UCSPA requirements when handling");
    expect(JSON.stringify(q)).not.toContain("regulationRef");
  });

  it("reports a mixed suite's instruments per case", async () => {
    state.cases = [kpiCase(), kpiCase({ expectedOutput: REG_EXPECTED }), kpiCase({ expectedOutput: "" })];
    state.agentAnswer = '{"threshold":0,"slaBreached":true,"expectedAction":"alert_and_escalate"}';
    const r = await post("/api/evals/s1/execute");
    expect(r.body.instruments).toEqual({ structured_comparison: 1, prose_judge: 1, no_instrument: 1 });
    expect(r.body.unjudgeableCases).toBe(1);
    expect(r.body.totalCases).toBe(3);
  });
});
