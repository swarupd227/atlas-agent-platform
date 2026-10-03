/**
 * The executor for suites whose cases live in eval_test_cases.
 *
 * Until it existed, POST /api/evals/:id/runs inserted a run row and nothing ran
 * it, and run-golden only covers suites linked to a golden dataset. Measured on
 * this platform: of the 17 suites covering the two MGA journeys, 0 had a golden
 * dataset and none had ever been executed, so the promotion gate was refusing
 * production on pass rates nobody had ever produced.
 *
 * These cover the guards rather than the judging: that a suite with nothing to
 * measure produces no run at all, that a malformed case is not quietly skipped,
 * and that the figure the promotion gate reads is written in the contract's
 * 0-1 fraction rather than 0-100.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = {
  suite: null,
  agent: { id: "agent1", name: "Binder Period Close Orchestrator", environment: "staging" },
  cases: [] as any[],
  runs: [] as any[],
  caseResults: [] as any[],
  suiteUpdates: [] as any[],
};

vi.mock("../server/storage", () => ({
  storage: {
    getEvalSuite: vi.fn(async () => state.suite),
    getAgent: vi.fn(async () => state.agent),
    getEvalTestCases: vi.fn(async () => state.cases),
    createEvalRun: vi.fn(async (r: any) => { const run = { ...r, id: `run${state.runs.length + 1}` }; state.runs.push(run); return run; }),
    updateEvalRun: vi.fn(async (id: string, patch: any) => { Object.assign(state.runs.find(r => r.id === id) ?? {}, patch); return patch; }),
    createEvalCaseResult: vi.fn(async (r: any) => { state.caseResults.push(r); return r; }),
    updateEvalSuite: vi.fn(async (id: string, patch: any) => { state.suiteUpdates.push(patch); return patch; }),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({ checkPermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("./helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn(async () => "SYSTEM PROMPT") }));
vi.mock("../server/routes/helpers", () => ({ buildAgentSystemPromptWithGovernance: vi.fn(async () => "SYSTEM PROMPT") }));
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
  createClaudeMessage: vi.fn(async () => ({ content: [{ type: "text", text: "an answer" }], stop_reason: "end_turn" })),
  stripJsonFences: (s: string) => s,
}));
// The judge itself is exercised by the golden-dataset path; here it is stubbed
// so these tests measure the executor's own decisions, not the model's.
vi.mock("../server/decision-provider", () => ({
  decideMany: vi.fn(async ({ questions }: any) => Object.fromEntries(
    Object.keys(questions).map(k => [k, { value: state.judgeVerdict ?? true, reasoning: "stub" }]),
  )),
}));

const { default: router } = await import("../server/routes/golden-eval");

let server: Server;
let base = "";
const post = async (path: string, body: any = {}) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

beforeEach(async () => {
  state.suite = { id: "s1", name: "Binder Period Close Orchestrator - Baseline Suite", agentId: "agent1", goldenDatasetId: null };
  state.cases = [];
  state.runs = [];
  state.caseResults = [];
  state.suiteUpdates = [];
  state.judgeVerdict = true;
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(router);
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

const testCase = (over: any = {}) => ({
  id: `c${Math.random().toString(36).slice(2, 7)}`,
  name: "Standard Binder Period Close",
  status: "active",
  inputData: { prompt: "Initiate monthly binder period close for April 2024.", context: "Period: April 2024" },
  expectedOutput: "Agent should execute period lock and calculate ceded premium.",
  ...over,
});

describe("POST /api/evals/:id/execute", () => {
  it("refuses a suite with no cases instead of scoring an empty denominator", async () => {
    state.cases = [];
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no active test cases/i);
    // The decisive part: no run row, so nothing can later read 100% from it.
    expect(state.runs).toHaveLength(0);
    expect(state.suiteUpdates).toHaveLength(0);
  });

  it("counts a case with no expectedOutput as failed, not skipped", async () => {
    // Skipping it would raise the pass rate on the well-formed cases.
    state.cases = [testCase({ expectedOutput: "" }), testCase()];
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(200);
    expect(r.body.totalCases).toBe(2);
    expect(r.body.unjudgeableCases).toBe(1);
    expect(r.body.passRate).toBeLessThan(1);
    const unjudged = state.caseResults.find(c => c.scorerOutputs?.unjudgeable);
    expect(unjudged.passed).toBe(false);
    expect(unjudged.failingReason).toMatch(/fix the case, not the agent/i);
  });

  it("writes passRate as a 0-1 fraction, which is what the promotion gate reads", async () => {
    state.cases = [testCase(), testCase()];
    const r = await post("/api/evals/s1/execute");
    expect(r.body.passRate).toBeLessThanOrEqual(1);
    expect(state.suiteUpdates[0].passRate).toBe(r.body.passRate);
  });

  it("sets lastRunAt, so the gate can tell this from never evaluated", async () => {
    state.cases = [testCase()];
    await post("/api/evals/s1/execute");
    expect(state.suiteUpdates[0].lastRunAt).toBeInstanceOf(Date);
  });

  it("sends golden-dataset suites to the other executor rather than scoring them twice", async () => {
    state.suite.goldenDatasetId = "gd1";
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/run-golden/);
    expect(state.runs).toHaveLength(0);
  });

  it("refuses a suite not bound to an agent", async () => {
    state.suite.agentId = null;
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not bound to an agent/i);
  });

  it("404s on a suite that does not exist", async () => {
    state.suite = null;
    const r = await post("/api/evals/nope/execute");
    expect(r.status).toBe(404);
  });

  it("ignores archived cases", async () => {
    state.cases = [testCase({ status: "archived" }), testCase()];
    const r = await post("/api/evals/s1/execute");
    expect(r.body.totalCases).toBe(1);
  });

  it("honours a limit and never runs more than 25", async () => {
    state.cases = Array.from({ length: 40 }, () => testCase());
    const capped = await post("/api/evals/s1/execute", {});
    expect(capped.body.totalCases).toBe(25);
    const limited = await post("/api/evals/s1/execute", { limit: 3 });
    expect(limited.body.totalCases).toBe(3);
  });

  it("records mode prompt_level so a score is not read as an integration result", async () => {
    state.cases = [testCase()];
    const r = await post("/api/evals/s1/execute");
    expect(r.body.mode).toBe("prompt_level");
    expect(state.runs[0].resultsJson.source).toBe("eval_test_cases");
  });
});
