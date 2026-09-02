import { Router } from "express";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { buildAgentSystemPrompt } from "./helpers";
import { callClaude, stripJsonFences } from "../claude";

const router = Router();

/**
 * Golden dataset execution.
 *
 * Golden datasets existed as content but nothing could run them: eval_suites
 * carries a goldenDatasetId column that exactly one place READ (the manifest
 * export in runtime.ts) and nothing anywhere ever WROTE, and no code path
 * executed a golden case against an agent. So a dataset's benchmark figures
 * could only ever be whatever someone seeded them as.
 *
 * SCOPE, stated plainly because it determines what a passing score means:
 * this is a PROMPT-LEVEL evaluation. Each case is run against the agent's real
 * assembled system prompt -- which carries its ontology glossary, its bound
 * policies and their enforcement labels, and its preloaded skills -- and the
 * response is then judged against the case's expectedBehavior and
 * evaluationCriteria. It does NOT dispatch tools or execute a team graph, so
 * it verifies conduct, reasoning and policy adherence, not tool wiring or
 * end-to-end orchestration. Every run records mode: "prompt_level" so a score
 * is never mistaken for a full integration result.
 */

interface JudgedCase {
  caseId: string;
  name: string;
  passed: boolean;
  score: number;
  criteriaMet: string[];
  criteriaMissed: string[];
  reasoning: string;
  actualOutput: string;
  latencyMs: number;
}

async function judgeCase(params: {
  systemPrompt: string;
  scenario: string;
  expectedBehavior: string;
  criteria: string[];
  passingScore: number;
}): Promise<Omit<JudgedCase, "caseId" | "name" | "latencyMs">> {
  // Step 1: the agent answers, under its own real system prompt.
  const actualOutput = await callClaude({
    system: params.systemPrompt,
    user: params.scenario,
    maxTokens: 1500,
  });

  // Step 2: a separate judging call scores that answer against the case's own
  // criteria. The judge is deliberately told to fail on omission -- a fluent
  // answer that silently skips a required disclosure is the exact failure mode
  // these datasets exist to catch, and a lenient judge would pass it.
  const judgeRaw = await callClaude({
    system: `You are a strict insurance compliance examiner scoring an AI agent's response against required behaviour.

Score ONLY against the listed criteria. A response that is fluent, confident or plausible but OMITS a required element FAILS that criterion -- omission is the failure mode that matters here, so do not give credit for what the response merely implies.

Return JSON: {"criteriaMet": ["exact criterion text"], "criteriaMissed": ["exact criterion text"], "reasoning": "one or two sentences citing what was present or absent"}`,
    user: `EXPECTED BEHAVIOUR:
${params.expectedBehavior}

REQUIRED CRITERIA:
${params.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

AGENT RESPONSE:
${actualOutput}`,
    maxTokens: 1200,
    jsonMode: true,
  });

  let met: string[] = [];
  let missed: string[] = [];
  let reasoning = "";
  try {
    const parsed = JSON.parse(stripJsonFences(judgeRaw));
    met = Array.isArray(parsed.criteriaMet) ? parsed.criteriaMet : [];
    missed = Array.isArray(parsed.criteriaMissed) ? parsed.criteriaMissed : [];
    reasoning = String(parsed.reasoning || "");
  } catch (err: any) {
    // An unparseable judge response must not silently become a pass. Fail the
    // case and say why, rather than scoring 0 criteria met as a 0% that reads
    // like a genuine behavioural failure.
    return {
      passed: false,
      score: 0,
      criteriaMet: [],
      criteriaMissed: params.criteria,
      reasoning: `Judge response could not be parsed (${err?.message}); scored as failed rather than assumed passing.`,
      actualOutput,
    };
  }

  const score = params.criteria.length > 0 ? met.length / params.criteria.length : 0;
  return {
    passed: score >= params.passingScore,
    score,
    criteriaMet: met,
    criteriaMissed: missed,
    reasoning,
    actualOutput,
  };
}

/**
 * POST /api/evals/:suiteId/run-golden
 * Executes the suite's linked golden dataset against the suite's agent.
 */
router.post("/api/evals/:suiteId/run-golden", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const suite = await storage.getEvalSuite(req.params.suiteId as string);
    if (!suite) return res.status(404).json({ error: "Eval suite not found" });
    if (!suite.goldenDatasetId) {
      return res.status(400).json({ error: "This eval suite has no linked golden dataset. Set goldenDatasetId on the suite first." });
    }
    if (!suite.agentId) return res.status(400).json({ error: "This eval suite has no linked agent" });

    const agent = await storage.getAgent(suite.agentId, orgId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const dataset = await storage.getGoldenDataset(suite.goldenDatasetId);
    if (!dataset) return res.status(404).json({ error: "Linked golden dataset not found" });

    const allCases = (await storage.getGoldenTestCases(suite.goldenDatasetId)).filter(c => c.status === "active");
    if (allCases.length === 0) {
      return res.status(400).json({ error: "Linked golden dataset has no active test cases" });
    }
    const limit = Math.min(Number(req.body?.limit) || allCases.length, 25);
    const cases = allCases.slice(0, limit);

    const systemPrompt = buildAgentSystemPrompt(agent);

    const run = await storage.createEvalRun({
      suiteId: suite.id,
      agentId: agent.id,
      status: "running",
      totalCases: cases.length,
      triggeredBy: (req.body?.triggeredBy as string) || "manual",
      environment: (agent as any).environment || "staging",
    });

    const judged: JudgedCase[] = [];
    for (const tc of cases) {
      const started = Date.now();
      const criteria = Array.isArray(tc.evaluationCriteria) ? (tc.evaluationCriteria as string[]) : [];
      const rubric = (tc.rubricScoring as any) || {};
      const passingScore = typeof rubric.passingScore === "number" ? rubric.passingScore : 0.8;

      let result: Awaited<ReturnType<typeof judgeCase>>;
      try {
        result = await judgeCase({
          systemPrompt,
          scenario: tc.inputScenario,
          expectedBehavior: tc.expectedBehavior,
          criteria,
          passingScore,
        });
      } catch (err: any) {
        result = {
          passed: false, score: 0, criteriaMet: [], criteriaMissed: criteria,
          reasoning: `Execution failed: ${err?.message}`, actualOutput: "",
        };
      }
      const latencyMs = Date.now() - started;
      judged.push({ caseId: tc.id, name: tc.name, latencyMs, ...result });

      await storage.createEvalCaseResult({
        runId: run.id,
        caseId: tc.id,
        passed: result.passed,
        actualOutput: { response: result.actualOutput, scenarioCategory: tc.scenarioCategory, difficultyTier: tc.difficultyTier } as any,
        scorerOutputs: {
          score: result.score,
          passingScore,
          criteriaMet: result.criteriaMet,
          criteriaMissed: result.criteriaMissed,
          judgeReasoning: result.reasoning,
        } as any,
        failingReason: result.passed ? null : (result.criteriaMissed.join("; ") || result.reasoning),
        latencyMs,
      });
    }

    const passed = judged.filter(c => c.passed).length;
    // 0-1 fraction, matching insertEvalRunSchema's documented contract. The
    // skill-eval runner in agents.ts writes passedCount/total*100 through
    // updateEvalRun, which bypasses that validation -- do not copy it.
    const passRate = cases.length > 0 ? passed / cases.length : 0;
    const avgLatencyMs = cases.length > 0 ? Math.round(judged.reduce((a, c) => a + c.latencyMs, 0) / cases.length) : 0;

    await storage.updateEvalRun(run.id, {
      status: "completed",
      passedCases: passed,
      failedCases: cases.length - passed,
      passRate,
      avgLatencyMs,
      completedAt: new Date(),
      resultsJson: {
        mode: "prompt_level",
        note: "Scored against the agent's assembled system prompt (ontology, bound policies, preloaded skills). Tools were not dispatched and no team graph was executed.",
        goldenDatasetId: dataset.id,
        goldenDatasetName: dataset.name,
        byCategory: judged.reduce((acc: Record<string, { passed: number; total: number }>, c) => {
          const tc = cases.find(x => x.id === c.caseId);
          const cat = tc?.scenarioCategory || "unknown";
          acc[cat] = acc[cat] || { passed: 0, total: 0 };
          acc[cat].total++;
          if (c.passed) acc[cat].passed++;
          return acc;
        }, {}),
      } as any,
    });

    await storage.updateEvalSuite(suite.id, { passRate, lastRunAt: new Date() });

    res.json({
      runId: run.id,
      mode: "prompt_level",
      agent: { id: agent.id, name: agent.name },
      goldenDataset: { id: dataset.id, name: dataset.name },
      totalCases: cases.length,
      passed,
      failed: cases.length - passed,
      passRate,
      results: judged.map(c => ({
        name: c.name, passed: c.passed, score: c.score,
        criteriaMissed: c.criteriaMissed, reasoning: c.reasoning,
      })),
    });
  } catch (e: any) {
    console.error("[run-golden] failed:", e);
    res.status(500).json({ error: e.message || "Failed to run golden dataset" });
  }
});

/**
 * POST /api/golden-datasets/link-suites
 * Links eval suites to a golden dataset for agents in a given industry (and
 * optionally sub-vertical), so an existing suite gains a regression baseline
 * without hand-editing each one.
 */
router.post("/api/golden-datasets/link-suites", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { goldenDatasetId, agentIds } = req.body || {};
    if (!goldenDatasetId) return res.status(400).json({ error: "goldenDatasetId is required" });
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ error: "agentIds (array) is required" });
    }
    const dataset = await storage.getGoldenDataset(goldenDatasetId);
    if (!dataset) return res.status(404).json({ error: "Golden dataset not found" });

    const allSuites = await storage.getEvalSuites();
    const linked: Array<{ agentId: string; suiteId: string }> = [];
    const skipped: Array<{ agentId: string; reason: string }> = [];

    for (const agentId of agentIds) {
      const agent = await storage.getAgent(agentId, orgId);
      if (!agent) { skipped.push({ agentId, reason: "agent not found" }); continue; }
      const suites = allSuites.filter(s => s.agentId === agentId);
      if (suites.length === 0) { skipped.push({ agentId, reason: "no eval suite" }); continue; }
      for (const s of suites) {
        await storage.updateEvalSuite(s.id, { goldenDatasetId });
        linked.push({ agentId, suiteId: s.id });
      }
    }

    res.json({ goldenDataset: { id: dataset.id, name: dataset.name }, linkedCount: linked.length, linked, skipped });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to link suites" });
  }
});

export default router;
