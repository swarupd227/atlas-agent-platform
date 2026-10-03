/**
 * POST /api/evals/:id/execute with a repeat count.
 *
 * The case that motivated repeats: an agent asked to assign a severity gives
 * High on one run and Medium on the next, and a single run cannot tell. These
 * tests pin what repeats do for suites whose cases live in eval_test_cases:
 *   - a case asserting field values is compared on EVERY attempt, passes only
 *     if all of them match, and a label that changed is named in the failure;
 *   - a case that fails the same way every time is a failure, not "flaky";
 *   - an attempt with no parseable verdict is a failed attempt, not a crash;
 *   - prose cases repeat through the judge the same way;
 *   - a case with nothing to judge against is not repeated;
 *   - no repeat count is exactly today's run;
 *   - a bad or oversized request is refused before any run row exists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = {
  suite: null,
  agent: { id: "agent1", name: "Governance Synthesis Agent", environment: "staging" },
  cases: [] as any[],
  runs: [] as any[],
  caseResults: [] as any[],
  suiteUpdates: [] as any[],
  answers: [] as string[],
  answerCalls: 0,
  jobs: [] as any[],
  failCreateJob: false,
};

// A prose criterion is met when the agent's answer says GOOD.
const decideMany = vi.fn(async ({ questions, state: s }: any) => Object.fromEntries(
  Object.keys(questions).map(k => {
    const ok = String(s.agent_response).includes("GOOD");
    return [k, { value: ok, answer: ok, engine: "llm", reasoning: "stub" }];
  }),
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
    createJob: vi.fn(async (j: any) => {
      if (state.failCreateJob) throw new Error("queue unavailable");
      const job = { ...j, id: `job${state.jobs.length + 1}` };
      state.jobs.push(job);
      return job;
    }),
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
  createClaudeMessage: vi.fn(async () => {
    state.answerCalls++;
    const next = state.answers.length > 0 ? state.answers.shift() : '{"severity":"High"}';
    return { content: [{ type: "text", text: next }], stop_reason: "end_turn" };
  }),
  stripJsonFences: (s: string) => s,
}));
vi.mock("../server/decision-provider", () => ({ decideMany }));

const mod = await import("../server/routes/golden-eval");
const router = (mod as any).default;

let server: Server;
let base = "";
const post = async (path: string, body: any = {}) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

/** A repeated run answers 202 and runs in the job; finish it as the worker would and return what the run produced. */
const postAndFinish = async (path: string, body: any = {}) => {
  const r = await post(path, body);
  if (r.status !== 202) return r;
  return { status: 200, body: await (mod as any).runEvalRepeatJob(state.jobs[state.jobs.length - 1].payload) };
};

const sev = (v: string) => `{"severity":"${v}"}`;
const severityCase = (over: any = {}) => ({
  id: `c${Math.random().toString(36).slice(2, 7)}`,
  name: "Restricted file shared beyond Internal",
  status: "active",
  inputData: { prompt: "Classify the finding for this file." },
  expectedOutput: { severity: "High" },
  ...over,
});
const proseCase = (over: any = {}) => severityCase({ name: "Cites the policy", expectedOutput: "Declines and cites the policy.", ...over });

beforeEach(async () => {
  state.suite = { id: "s1", name: "Synthesis suite", agentId: "agent1", goldenDatasetId: null };
  state.cases = [severityCase()];
  state.runs = [];
  state.caseResults = [];
  state.suiteUpdates = [];
  state.answers = [];
  state.answerCalls = 0;
  state.jobs = [];
  state.failCreateJob = false;
  decideMany.mockClear();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(router);
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

describe("execute without a repeat count", () => {
  it("answers each case once and adds nothing to the row, the run or the response", async () => {
    const r = await post("/api/evals/s1/execute");
    expect(r.status).toBe(200);
    expect(state.answerCalls).toBe(1);
    expect(r.body.passedCases).toBe(1);
    expect(r.body).not.toHaveProperty("repeats");
    expect(r.body).not.toHaveProperty("stability");
    expect(r.body.cases[0]).not.toHaveProperty("attempts");
    expect(state.caseResults[0].scorerOutputs).not.toHaveProperty("stability");
    expect(state.caseResults[0].scorerOutputs).not.toHaveProperty("attempts");
    expect(state.caseResults[0].scorerOutputs).not.toHaveProperty("scoreBasis");
    expect(state.caseResults[0].scorerOutputs).not.toHaveProperty("representativeAttempt");
    expect(state.runs[0].resultsJson).not.toHaveProperty("repeats");
  });

  it("keeps a failing case's reason exactly as before", async () => {
    state.answers = [sev("Low")];
    await post("/api/evals/s1/execute");
    expect(state.caseResults[0].passed).toBe(false);
    expect(state.caseResults[0].failingReason).toMatch(/^Mismatched: severity = "High" \(agent gave "Low"\)\.$/);
  });
});

describe("execute with repeats: field-comparison cases", () => {
  it("passes a case whose every attempt matched", async () => {
    state.answers = [sev("High"), sev("high"), sev("HIGH")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    expect(r.status).toBe(200);
    expect(state.answerCalls).toBe(3);
    expect(r.body.passedCases).toBe(1);
    expect(r.body.repeats).toBe(3);
    expect(r.body.stability).toMatchObject({ measuredCases: 1, flakyCases: 0, consistency: 1 });
    expect(r.body.cases[0]).toMatchObject({ outcome: "stable_pass", attempts: 3, unstableFields: [] });
    expect(state.caseResults[0].scorerOutputs.attempts).toHaveLength(3);
    expect(state.caseResults[0].scorerOutputs.instrument).toBe("structured_comparison");
  });

  it("fails a case whose label changed, and names the label that moved", async () => {
    state.answers = [sev("High"), sev("Medium"), sev("High")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    expect(r.body.passedCases).toBe(0);
    expect(r.body.stability).toMatchObject({ flakyCases: 1, flipRate: 1 });
    expect(r.body.cases[0].outcome).toBe("flaky");
    expect(r.body.cases[0].unstableFields).toEqual([
      { key: "severity", values: [{ value: "high", count: 2 }, { value: "medium", count: 1 }], agreement: 2 / 3 },
    ]);
    const row = state.caseResults[0];
    expect(row.passed).toBe(false);
    expect(row.failingReason).toMatch(/^Inconsistent: passed 2 of 3 attempts; /);
    expect(row.failingReason).toContain("values changed: severity (high x2, medium x1)");
    // The reader sees the attempt that went wrong.
    expect(row.actualOutput.response).toBe(sev("Medium"));
    expect(row.scorerOutputs.attempts.map((a: any) => a.verdict.severity)).toEqual(["High", "Medium", "High"]);
  });

  it("calls a case that is wrong the same way every time a failure, not inconsistent", async () => {
    state.answers = [sev("Low"), sev("low"), sev("LOW")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    expect(r.body.cases[0].outcome).toBe("stable_fail");
    expect(r.body.stability).toMatchObject({ stableFail: 1, flakyCases: 0 });
    const reason = state.caseResults[0].failingReason;
    expect(reason).not.toContain("Inconsistent");
    expect(reason).not.toContain("values changed");
  });

  it("names every wrong value when the agent keeps changing its mind but is never right", async () => {
    state.answers = [sev("Low"), sev("Medium"), sev("Low")];
    await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    const reason = state.caseResults[0].failingReason;
    expect(reason).not.toContain("Inconsistent");
    expect(reason).toContain("values changed: severity (low x2, medium x1)");
  });

  it("treats an attempt with no parseable verdict as a failed attempt, not a crash", async () => {
    state.answers = [sev("High"), "I think it is high.", sev("High")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    expect(r.status).toBe(200);
    expect(r.body.cases[0]).toMatchObject({ outcome: "flaky", passedAttempts: 2 });
    const attempts = state.caseResults[0].scorerOutputs.attempts;
    expect(attempts.filter((a: any) => a.noVerdict)).toHaveLength(1);
  });
});

describe("execute with repeats: other case kinds", () => {
  it("repeats a prose case through the judge and fails it when one attempt misses", async () => {
    state.cases = [proseCase()];
    state.answers = ["GOOD answer", "off topic", "GOOD again"];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    expect(r.body.instruments.prose_judge).toBe(1);
    expect(r.body.cases[0]).toMatchObject({ outcome: "flaky", passedAttempts: 2 });
    expect(state.caseResults[0].failingReason).toMatch(/^Inconsistent: passed 2 of 3 attempts; /);
    expect(decideMany).toHaveBeenCalledTimes(3);
  });

  it("does not repeat a case with nothing to judge against, and leaves it out of the figures", async () => {
    state.cases = [severityCase({ expectedOutput: "" }), severityCase()];
    state.answers = [sev("High"), sev("High")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 2 });
    expect(state.answerCalls).toBe(2);
    expect(r.body.unjudgeableCases).toBe(1);
    expect(r.body.stability.measuredCases).toBe(1);
    const unjudged = state.caseResults.find((c: any) => c.scorerOutputs.unjudgeable);
    expect(unjudged.scorerOutputs).not.toHaveProperty("attempts");
  });

  it("scores the run by cases that passed every attempt", async () => {
    state.cases = [severityCase(), severityCase()];
    state.answers = [sev("High"), sev("High"), sev("High"), sev("Medium")];
    const r = await postAndFinish("/api/evals/s1/execute", { repeats: 2 });
    expect(r.body.passedCases).toBe(1);
    expect(r.body.passRate).toBe(0.5);
    expect(r.body.stability).toMatchObject({ flakyCases: 1, flipRate: 0.5 });
    expect(state.suiteUpdates[0].passRate).toBe(0.5);
  });
});

describe("execute refuses a bad repeat request before any run exists", () => {
  it.each([0, 11, 1.5, "many"])("rejects repeats = %s", async (repeats) => {
    const r = await post("/api/evals/s1/execute", { repeats });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/repeats must be a whole number from 1 to 10/);
    expect(state.runs).toHaveLength(0);
    expect(state.answerCalls).toBe(0);
  });

  it("rejects a run over the attempt limit, with the numbers", async () => {
    state.cases = Array.from({ length: 11 }, () => severityCase());
    const r = await post("/api/evals/s1/execute", { repeats: 10 });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("110 attempts");
    expect(state.runs).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
    expect(state.answerCalls).toBe(0);
  });
});

describe("a repeated run is queued, not answered in the request", () => {
  it("answers 202 with where to read the run, having done none of the work", async () => {
    state.cases = [severityCase(), severityCase()];
    const r = await post("/api/evals/s1/execute", { repeats: 5 });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ runId: "run1", jobId: "job1", status: "running", repeats: 5, totalCases: 2, attempts: 10 });
    expect(state.answerCalls).toBe(0);
    expect(state.runs[0].status).toBe("running");
    expect(state.caseResults).toHaveLength(0);
    expect(state.jobs[0]).toMatchObject({ type: "eval_repeat_run", status: "queued", payload: { mode: "execute", suiteId: "s1", runId: "run1", repeats: 5 } });
  });

  it("runs only the cases it was queued with", async () => {
    state.cases = [severityCase({ id: "ca" }), severityCase({ id: "cb" })];
    await post("/api/evals/s1/execute", { repeats: 2 });
    state.cases = [...state.cases, severityCase({ id: "cnew" })];
    const body = await (mod as any).runEvalRepeatJob(state.jobs[0].payload);
    expect(body.totalCases).toBe(2);
    expect(state.caseResults.map((c: any) => c.caseId)).toEqual(["ca", "cb"]);
  });

  it("fails the run row, not leaves it running, when the job cannot be queued", async () => {
    state.failCreateJob = true;
    const r = await post("/api/evals/s1/execute", { repeats: 3 });
    expect(r.status).toBe(500);
    expect(state.runs[0].status).toBe("failed");
    expect(state.answerCalls).toBe(0);
  });
});

describe("a repeated case's row says what it describes", () => {
  it("names the attempt its criteria come from, and that the score is a mean", async () => {
    state.answers = [sev("High"), sev("Medium"), sev("High")];
    await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    const out = state.caseResults[0].scorerOutputs;
    expect(out.scoreBasis).toBe("mean across 3 attempts");
    expect(out.representativeAttempt).toBe(2);
    expect(out.attempts[1].verdict.severity).toBe("Medium");
  });

  it("does the same for a prose case", async () => {
    state.cases = [proseCase()];
    state.answers = ["GOOD", "GOOD", "off topic"];
    await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
    const out = state.caseResults[0].scorerOutputs;
    expect(out.scoreBasis).toBe("mean across 3 attempts");
    expect(out.representativeAttempt).toBe(3);
  });

  it("records how long one answer took, for a field-comparison case and for a prose case", async () => {
    for (const cases of [[severityCase()], [proseCase()]]) {
      state.cases = cases;
      state.caseResults = [];
      state.answers = [];
      await postAndFinish("/api/evals/s1/execute", { repeats: 3 });
      const times: number[] = state.caseResults[0].scorerOutputs.attempts.map((a: any) => a.latencyMs);
      expect(state.caseResults[0].latencyMs).toBe(Math.round(times.reduce((s, t) => s + t, 0) / times.length));
    }
  });
});
