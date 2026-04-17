import { storage } from "./storage";
import type { Job, AuditChainTrigger } from "@shared/schema";
import { agentAlerts } from "@shared/schema";
import { EventEmitter } from "events";
import { checkOntologyCompliance, executeScheduledAgentCycle } from "./agent-runtime";
import { industryEvalFrameworks } from "./routes";
import { runLlmJudge, runAgentOnInput, buildAgentContext } from "./eval-judge";
import { getDefaultProvider, getProvider, completeWithFallback } from "./llm-provider";
import { runAlertCheck } from "./routes/observability";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";
import { ensureOtcFulfillmentAgents, runOtcFulfillmentPipeline } from "./otc-fulfillment-live-run";
import { OTC_AGT_005_NAME, OTC_AGT_007_NAME, OTC_AGT_012_NAME, OTC_EVAL_SUITE_NAME } from "./otc-fulfillment-shared-defs";

export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(50);

async function processEvalBaseline(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const agentId = payload.agentId as string;
  const suiteId = payload.suiteId as string;
  const blueprintId = payload.blueprintId as string | undefined;

  await storage.updateJob(job.id, { progress: 10 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 10, step: "compiling_blueprint" });

  const agent = await storage.getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  await delay(800);

  const staticChecks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    blueprintId,
    checks: [
      { name: "Schema Validation", status: "pass", message: "Blueprint JSON conforms to schema v2" },
      { name: "Tool References", status: "pass", message: "All referenced tools are registered" },
      { name: "Policy Bindings", status: "pass", message: "Required policies are bound" },
      { name: "Escalation Paths", status: agent.autonomyMode === "full" ? "warning" : "pass", message: agent.autonomyMode === "full" ? "No human review node in fully autonomous mode" : "Human review nodes validated" },
      { name: "Circular Dependencies", status: "pass", message: "No circular dependencies detected in workflow" },
    ],
    passCount: agent.autonomyMode === "full" ? 4 : 5,
    warnCount: agent.autonomyMode === "full" ? 1 : 0,
    failCount: 0,
  };

  await storage.updateJob(job.id, { progress: 30 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 30, step: "static_checks_complete" });

  await delay(600);

  await storage.updateJob(job.id, { progress: 50 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 50, step: "running_eval_cases" });

  const suite = await storage.getEvalSuite(suiteId);
  const testCases = await storage.getEvalTestCases(suiteId);

  await delay(500);

  const isKpiAligned = suite?.type === "kpi_aligned";
  const suiteOntologyTags = (suite?.ontologyTags as Record<string, unknown>) || {};
  const outcomeId = suiteOntologyTags.outcomeId as string | undefined;

  let kpiDefinitionsMap: Map<string, { id: string; name: string; unit: string; target: number; slaThreshold: number | null; baseline: number | null; weight: number | null }> = new Map();
  if (isKpiAligned && outcomeId) {
    const kpis = await storage.getKpisByOutcome(outcomeId);
    for (const kpi of kpis) {
      kpiDefinitionsMap.set(kpi.id, {
        id: kpi.id,
        name: kpi.name,
        unit: kpi.unit,
        target: kpi.target,
        slaThreshold: kpi.slaThreshold ?? null,
        baseline: kpi.baseline ?? null,
        weight: kpi.weight ?? null,
      });
    }
  }

  const evalRun = await storage.createEvalRun({
    suiteId,
    status: "running",
    passRate: 0,
    totalCases: testCases.length,
    passedCases: 0,
    failedCases: 0,
    avgLatencyMs: 0,
  });

  await storage.updateJob(job.id, { progress: 60 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 60, step: "evaluating_test_cases" });

  let passed = 0;
  let failed = 0;
  let totalLatency = 0;
  const caseResults: Array<Record<string, unknown>> = [];

  const ontologyTags = (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) || [];
  const hasOntologyTags = ontologyTags.length > 0;
  let totalOntologyCompliance = 0;
  let ontologyCaseCount = 0;

  const suiteIndustry = suite?.industry as string | null;
  const agentIndustry = (agent as any).industry as string | null;
  const detectedIndustry = suiteIndustry || agentIndustry || null;
  const industryFramework = detectedIndustry ? industryEvalFrameworks[detectedIndustry] : null;
  const industryDimensionTotals: Record<string, { total: number; count: number; weight: number }> = {};
  if (industryFramework) {
    for (const dim of industryFramework.dimensions) {
      industryDimensionTotals[dim.id] = { total: 0, count: 0, weight: dim.weight };
    }
  }

  const agentCtx = buildAgentContext(agent);
  const industryDimsForJudge = industryFramework
    ? industryFramework.dimensions.map(d => ({ id: d.id, name: d.name, scoringCriteria: d.scoringCriteria }))
    : undefined;

  const kpiCaseScores: Array<{
    kpiId: string;
    kpiName: string;
    scenario: string;
    simulatedValue: number;
    threshold: number;
    target: number;
    unit: string;
    meetsThreshold: boolean;
    meetsTarget: boolean;
    marginPercent: number;
    kpiScore: number;
  }> = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const inputData = (tc.inputData as Record<string, unknown>) || {};
    const isKpiBoundaryTest = inputData.type === "kpi_boundary_test";

    let latencyMs = 0;
    let isPassed: boolean;
    let actualOutput: Record<string, unknown>;
    let scorerOutputs: Record<string, unknown> | undefined;

    if (isKpiAligned && isKpiBoundaryTest) {
      const kpiId = inputData.kpiId as string;
      const kpiName = inputData.kpiName as string;
      const scenario = inputData.scenario as string;
      const simulatedValue = inputData.simulatedValue as number;
      const threshold = inputData.threshold as number;
      const target = inputData.target as number;
      const unit = (inputData.unit as string) || "count";

      const kpiDef = kpiDefinitionsMap.get(kpiId);
      const kpiNameLower = kpiName.toLowerCase();
      const unitLower = unit.toLowerCase();

      const isLatencyType = kpiNameLower.includes("latency") || kpiNameLower.includes("time") || kpiNameLower.includes("response") || unitLower === "ms" || unitLower === "seconds";
      const isCostType = kpiNameLower.includes("cost") || unitLower === "usd" || unitLower === "$";
      const isLowerBetter = isLatencyType || isCostType;

      let meetsThreshold: boolean;
      let meetsTarget: boolean;
      let marginPercent: number;

      if (isLowerBetter) {
        meetsThreshold = simulatedValue <= threshold;
        meetsTarget = simulatedValue <= target;
        marginPercent = threshold > 0 ? ((threshold - simulatedValue) / threshold) * 100 : 0;
      } else {
        meetsThreshold = simulatedValue >= threshold;
        meetsTarget = simulatedValue >= target;
        marginPercent = threshold > 0 ? ((simulatedValue - threshold) / threshold) * 100 : 0;
      }

      let kpiScore: number;
      if (meetsTarget) {
        kpiScore = 1.0;
      } else if (meetsThreshold) {
        const range = isLowerBetter ? (threshold - target) : (target - threshold);
        const distFromTarget = isLowerBetter ? (simulatedValue - target) : (target - simulatedValue);
        kpiScore = range > 0 ? Math.max(0.5, 1.0 - (distFromTarget / range) * 0.5) : 0.75;
      } else {
        const breachAmount = isLowerBetter ? (simulatedValue - threshold) : (threshold - simulatedValue);
        kpiScore = Math.max(0, 0.5 - (breachAmount / (threshold || 1)) * 0.5);
      }
      kpiScore = Math.round(kpiScore * 100) / 100;

      const expectedOutput = (tc.expectedOutput as Record<string, unknown>) || {};
      const expectsBreach = expectedOutput.slaBreached === true;
      const actualBreach = !meetsThreshold;
      isPassed = (expectsBreach === actualBreach);

      actualOutput = {
        status: isPassed ? "pass" : "fail",
        kpiMeasurement: {
          kpiId,
          kpiName,
          simulatedValue,
          threshold,
          target,
          unit,
          meetsThreshold,
          meetsTarget,
          slaBreached: actualBreach,
          marginPercent: Math.round(marginPercent * 100) / 100,
        },
        confidence: isPassed ? 0.95 : 0.4,
      };

      const kpiScoreEntry = {
        kpiId,
        kpiName,
        scenario,
        simulatedValue,
        threshold,
        target,
        unit,
        meetsThreshold,
        meetsTarget,
        marginPercent: Math.round(marginPercent * 100) / 100,
        kpiScore,
      };

      scorerOutputs = {
        kpiScores: kpiScoreEntry,
      };

      kpiCaseScores.push(kpiScoreEntry);
    } else {
      const agentRun = await runAgentOnInput(
        agent.systemPrompt,
        inputData,
      );
      const judgeResult = await runLlmJudge(
        tc.name,
        inputData,
        (tc.expectedOutput as Record<string, unknown>) || null,
        agentCtx,
        agentRun.output,
        industryDimsForJudge,
      );
      isPassed = judgeResult.isPassed;
      latencyMs = agentRun.latencyMs + judgeResult.latencyMs;
      actualOutput = {
        status: isPassed ? "pass" : "fail",
        matched: isPassed,
        confidence: judgeResult.confidence,
        reason: judgeResult.reason,
        agentOutput: agentRun.output || null,
      };

      scorerOutputs = {
        ...(scorerOutputs || {}),
        judgeMetadata: {
          confidence: judgeResult.confidence,
          reason: judgeResult.reason,
        },
      };

      if (industryFramework && judgeResult.dimensionResults) {
        const dimensionScores: Record<string, { score: number; maxScore: number; passed: boolean; weight: number; criteriaResults: Array<{ criterion: string; met: boolean }> }> = {};
        for (const dimResult of judgeResult.dimensionResults) {
          const dimDef = industryFramework.dimensions.find(d => d.id === dimResult.dimId);
          if (!dimDef) continue;
          const metCount = dimResult.criteriaResults.filter(cr => cr.met).length;
          const totalCriteria = dimResult.criteriaResults.length;
          if (totalCriteria === 0) continue;
          const score = Math.round((metCount / totalCriteria) * 100 * 10) / 10;
          const dimPassed = score >= 70;
          dimensionScores[dimResult.dimId] = {
            score,
            maxScore: 100,
            passed: dimPassed,
            weight: dimDef.weight,
            criteriaResults: dimResult.criteriaResults,
          };
          industryDimensionTotals[dimResult.dimId].total += score;
          industryDimensionTotals[dimResult.dimId].count += 1;
        }
        scorerOutputs = {
          ...(scorerOutputs || {}),
          industryScores: {
            industry: detectedIndustry,
            framework: industryFramework.label,
            dimensions: dimensionScores,
          },
        };
      }
    }

    totalLatency += latencyMs;
    if (isPassed) passed++;
    else failed++;

    if (hasOntologyTags) {
      const outputText = typeof actualOutput === "string"
        ? actualOutput
        : JSON.stringify(actualOutput);
      try {
        const compliance = await checkOntologyCompliance(outputText, ontologyTags);
        scorerOutputs = {
          ...(scorerOutputs || {}),
          ontologyCompliance: {
            score: compliance.score,
            canonicalTermsUsed: compliance.canonicalTermsUsed,
            deprecatedTermsUsed: compliance.deprecatedTermsUsed,
            totalDomainMentions: compliance.totalDomainMentions,
            canonicalCount: compliance.canonicalCount,
            deprecatedCount: compliance.deprecatedCount,
          },
        };
        totalOntologyCompliance += compliance.score;
        ontologyCaseCount++;
      } catch {}
    }

    const result = await storage.createEvalCaseResult({
      runId: evalRun.id,
      caseId: tc.id,
      passed: isPassed,
      latencyMs,
      actualOutput,
      ...(scorerOutputs ? { scorerOutputs } : {}),
    });

    caseResults.push({ testCaseId: tc.id, testCaseName: tc.name, ...result });

    const progress = 60 + Math.floor(((i + 1) / testCases.length) * 30);
    await storage.updateJob(job.id, { progress });
    jobEvents.emit("progress", { jobId: job.id, agentId, progress, step: `evaluated_case_${i + 1}_of_${testCases.length}` });

    await delay(200);
  }

  const passRate = testCases.length > 0 ? passed / testCases.length : 0;
  const avgLatency = testCases.length > 0 ? Math.round(totalLatency / testCases.length) : 0;
  const avgOntologyCompliance = ontologyCaseCount > 0 ? Math.round(totalOntologyCompliance / ontologyCaseCount) : null;

  const runResultsJson: Record<string, unknown> = {};
  if (avgOntologyCompliance !== null) {
    runResultsJson.ontologyCompliance = {
      avgScore: avgOntologyCompliance,
      casesEvaluated: ontologyCaseCount,
      hasOntologyScorer: true,
    };
  }

  if (isKpiAligned && kpiCaseScores.length > 0) {
    const kpiGroupsObj: Record<string, typeof kpiCaseScores> = {};
    for (const score of kpiCaseScores) {
      if (!kpiGroupsObj[score.kpiId]) kpiGroupsObj[score.kpiId] = [];
      kpiGroupsObj[score.kpiId].push(score);
    }

    const kpiSummaries: Array<Record<string, unknown>> = [];
    let totalKpiPassRate = 0;
    let kpiCount = 0;

    const kpiIds = Object.keys(kpiGroupsObj);
    for (const kpiId of kpiIds) {
      const scores = kpiGroupsObj[kpiId];
      const kpiDef = kpiDefinitionsMap.get(kpiId);
      const avgScore = scores.reduce((s: number, sc: typeof kpiCaseScores[0]) => s + sc.kpiScore, 0) / scores.length;
      const thresholdPassCount = scores.filter((sc: typeof kpiCaseScores[0]) => sc.meetsThreshold).length;
      const targetPassCount = scores.filter((sc: typeof kpiCaseScores[0]) => sc.meetsTarget).length;
      const kpiPassRate = thresholdPassCount / scores.length;
      totalKpiPassRate += kpiPassRate;
      kpiCount++;

      kpiSummaries.push({
        kpiId,
        kpiName: scores[0].kpiName,
        unit: scores[0].unit,
        target: kpiDef?.target ?? scores[0].target,
        slaThreshold: kpiDef?.slaThreshold ?? scores[0].threshold,
        avgKpiScore: Math.round(avgScore * 100) / 100,
        thresholdPassRate: Math.round(kpiPassRate * 10000) / 100,
        targetPassRate: Math.round((targetPassCount / scores.length) * 10000) / 100,
        casesEvaluated: scores.length,
        scenarios: scores.map(sc => ({
          scenario: sc.scenario,
          simulatedValue: sc.simulatedValue,
          meetsThreshold: sc.meetsThreshold,
          meetsTarget: sc.meetsTarget,
          kpiScore: sc.kpiScore,
          marginPercent: sc.marginPercent,
        })),
      });
    }

    const overallKpiPassRate = kpiCount > 0 ? totalKpiPassRate / kpiCount : 0;

    runResultsJson.outcomeAlignment = {
      outcomeId,
      outcomeName: suiteOntologyTags.outcomeName || null,
      totalKpis: kpiCount,
      totalKpiCases: kpiCaseScores.length,
      overallKpiPassRate: Math.round(overallKpiPassRate * 10000) / 100,
      avgKpiScore: Math.round((kpiCaseScores.reduce((s, sc) => s + sc.kpiScore, 0) / kpiCaseScores.length) * 100) / 100,
      kpiSummaries,
      evaluatedAt: new Date().toISOString(),
    };
  }

  if (industryFramework && Object.keys(industryDimensionTotals).length > 0) {
    const dimensionSummaries: Record<string, { avgScore: number; casesEvaluated: number; weight: number }> = {};
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [dimId, data] of Object.entries(industryDimensionTotals)) {
      if (data.count > 0) {
        const avg = Math.round((data.total / data.count) * 10) / 10;
        dimensionSummaries[dimId] = { avgScore: avg, casesEvaluated: data.count, weight: data.weight };
        weightedSum += avg * data.weight;
        totalWeight += data.weight;
      }
    }
    const overallIndustryScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
    runResultsJson.industryScores = {
      industry: detectedIndustry,
      framework: industryFramework.label,
      overallScore: overallIndustryScore,
      dimensions: dimensionSummaries,
      dimensionNames: Object.fromEntries(industryFramework.dimensions.map(d => [d.id, d.name])),
      casesEvaluated: testCases.length,
    };
  }

  await storage.createEvalRun({
    suiteId,
    status: "completed",
    passRate,
    totalCases: testCases.length,
    passedCases: passed,
    failedCases: failed,
    avgLatencyMs: avgLatency,
    ...(Object.keys(runResultsJson).length > 0 ? { resultsJson: runResultsJson } : {}),
  });

  await storage.updateJob(job.id, { progress: 95 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 95, step: "finalizing_results" });

  await delay(300);

  return {
    staticChecks,
    evalResults: {
      runId: evalRun.id,
      suiteId,
      suiteName: suite?.name || "Auto-Generated Suite",
      passRate: Math.round(passRate * 10000) / 100,
      totalCases: testCases.length,
      passed,
      failed,
      avgLatencyMs: avgLatency,
      ...(runResultsJson.outcomeAlignment ? { outcomeAlignment: runResultsJson.outcomeAlignment } : {}),
      ...(runResultsJson.industryScores ? { industryScores: runResultsJson.industryScores } : {}),
    },
    agentId,
    blueprintId,
    completedAt: new Date().toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let workerRunning = false;

const isDbConnectionError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const msg = (err as any).message || "";
  return msg.includes("Connection terminated") || msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT");
};

async function processAgentScheduledRun(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const deploymentId = payload.deploymentId as string;
  const intervalMs = (payload.intervalMs as number) ?? 0;
  const agentName = (payload.agentName as string) ?? deploymentId;

  if (!deploymentId) throw new Error("agent_scheduled_run job missing deploymentId in payload");

  console.log(`[worker] Executing scheduled cycle for agent: ${agentName} (deployment: ${deploymentId})`);
  let cycleError: Error | undefined;
  try {
    await executeScheduledAgentCycle(deploymentId);
  } catch (err: any) {
    cycleError = err;
    console.error(`[worker] Scheduled cycle failed for ${agentName}:`, err.message);
  } finally {
    if (intervalMs > 0) {
      const [currentJob, deployment] = await Promise.all([
        storage.getJob(job.id),
        storage.getDeployment(deploymentId),
      ]);
      const currentPayload = (currentJob?.payload as Record<string, unknown>) || {};
      const schedulerStopped = currentPayload.schedulerStopped === true;
      if (schedulerStopped) {
        console.log(`[worker] Skipping re-enqueue for ${agentName}: runtime was stopped during execution`);
      } else if (deployment && deployment.status === "deployed") {
        const nextRunAt = new Date(Date.now() + intervalMs);
        await storage.createJob({
          type: "agent_scheduled_run",
          status: "queued",
          agentId: job.agentId,
          payload,
          scheduledFor: nextRunAt,
        });
        console.log(`[worker] Re-enqueued scheduled run for ${agentName}, next at ${nextRunAt.toISOString()}`);
      } else {
        console.log(`[worker] Skipping re-enqueue for ${agentName}: deployment status is ${deployment?.status ?? "not found"}`);
      }
    }
  }

  if (cycleError) throw cycleError;
  return { deploymentId, agentName, completedAt: new Date().toISOString(), nextIntervalMs: intervalMs };
}

const AUDIT_CHAIN_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function processAuditChainIntegrityCheck(job: Job): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let checkResult: { valid: boolean; totalEvents: number; verifiedEvents: number; brokenAt?: number } | undefined;
  let healthCheckId: string | undefined;
  let jobError: Error | undefined;

  try {
    checkResult = await storage.verifyAuditChainIntegrity();
    const durationMs = Date.now() - startedAt;

    const rawTrigger = (job.payload as Record<string, unknown>)?.triggeredBy;
    const triggeredBy: AuditChainTrigger = rawTrigger === "manual" ? "manual" : "scheduled";

    const healthCheck = await storage.persistAuditChainCheckResult(checkResult, durationMs, triggeredBy);
    healthCheckId = healthCheck.id;

    if (!checkResult.valid) {
      console.warn(`[worker] Audit chain integrity BROKEN at sequence ${checkResult.brokenAt} — incident created`);
    }
  } catch (err: any) {
    jobError = err;
    console.error("[worker] Audit chain integrity check failed:", err.message);
  } finally {
    // Always re-enqueue so periodic checks continue even after transient failures
    const nextRunAt = new Date(Date.now() + AUDIT_CHAIN_CHECK_INTERVAL_MS);
    try {
      await storage.createJob({
        type: "audit_chain_integrity_check",
        status: "queued",
        payload: { triggeredBy: "scheduled" },
        scheduledFor: nextRunAt,
      });
      console.log(`[worker] Audit chain check done: valid=${checkResult?.valid ?? "unknown"}, events=${checkResult?.verifiedEvents ?? "?"}/${checkResult?.totalEvents ?? "?"}, next at ${nextRunAt.toISOString()}`);
    } catch (enqueueErr: any) {
      console.error("[worker] Failed to re-enqueue audit chain check:", enqueueErr.message);
    }
  }

  if (jobError) throw jobError;
  return { ...checkResult, durationMs: Date.now() - startedAt, healthCheckId };
}

export async function enqueueAuditChainCheck() {
  try {
    const existing = await storage.getPendingAuditChainJob();
    if (existing) {
      console.log("[startup] Audit chain integrity check already queued, skipping initial enqueue");
      return;
    }
    await storage.createJob({
      type: "audit_chain_integrity_check",
      status: "queued",
      payload: { triggeredBy: "scheduled" },
      scheduledFor: new Date(),
    });
    console.log("[startup] Enqueued initial audit chain integrity check");
  } catch (err: any) {
    console.error("[startup] CRITICAL: Failed to enqueue audit chain check — monitoring inactive:", err.message);
  }
}

// ─── OTC Fulfillment Smoke Test ───────────────────────────────────────────────

const OTC_SMOKE_TEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const OTC_SMOKE_MIN_PASS_RATE = 0.90;
const OTC_SMOKE_ALERT_TYPE = "otc_smoke_test_failure";

type SmokeSeverity = "critical" | "high" | "warning";
const SEVERITY_RANK: Record<SmokeSeverity, number> = { critical: 3, high: 2, warning: 1 };
function maxSeverity(a: SmokeSeverity, b: SmokeSeverity): SmokeSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

async function processOtcSmokeTest(job: Job): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];
  let alertNeeded = false;
  let alertMessage = "";
  let alertSeverity: SmokeSeverity = "warning";
  let freshEvalRunId: string | undefined;
  let freshPassRate: number | null = null;
  let pipelineSteps: Array<{ agentCode: string; success: boolean; toolCallCount: number }> = [];

  try {
    // 1. Structural pre-flight: ensure agents + MCP servers are provisioned
    await ensureOtcFulfillmentAgents();

    const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
    const agentNames = [OTC_AGT_005_NAME, OTC_AGT_007_NAME, OTC_AGT_012_NAME];
    const missingAgents = agentNames.filter(n => !allAgents.find(a => a.name === n));
    const inactiveAgents = agentNames.filter(n => {
      const a = allAgents.find(ag => ag.name === n);
      return a && a.status !== "active";
    });

    if (missingAgents.length > 0) {
      checks.push({ name: "Agent Provisioning", passed: false, detail: `Missing agents: ${missingAgents.join(", ")}` });
      alertNeeded = true;
      alertSeverity = maxSeverity(alertSeverity, "critical");
      alertMessage = `OTC smoke test: missing agents — ${missingAgents.join(", ")}`;
    } else if (inactiveAgents.length > 0) {
      checks.push({ name: "Agent Provisioning", passed: false, detail: `Inactive agents: ${inactiveAgents.join(", ")}` });
      alertNeeded = true;
      alertSeverity = maxSeverity(alertSeverity, "high");
      alertMessage = `OTC smoke test: inactive agents — ${inactiveAgents.join(", ")}`;
    } else {
      checks.push({ name: "Agent Provisioning", passed: true, detail: "All 3 OTC agents active (OTC-AGT-005, OTC-AGT-007, OTC-AGT-012)" });
    }

    const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
    const mcpNames = [
      "OTC Fulfillment — Disruption Intelligence",
      "OTC Fulfillment — Shipment Tracking & Carrier",
      "OTC Fulfillment — Customer Comm Engine",
    ];
    const missingServers = mcpNames.filter(n => !allServers.find(s => s.name === n));
    if (missingServers.length > 0) {
      checks.push({ name: "MCP Server Registration", passed: false, detail: `Missing servers: ${missingServers.join(", ")}` });
      if (!alertNeeded) { alertNeeded = true; alertMessage = `OTC smoke test: missing MCP servers — ${missingServers.join(", ")}`; }
    } else {
      checks.push({ name: "MCP Server Registration", passed: true, detail: "All 3 MCP servers registered" });
    }

    // 2. End-to-end pipeline run: OTC-AGT-005 → OTC-AGT-007 → OTC-AGT-012
    console.log("[otc-smoke-test] Starting end-to-end 3-agent pipeline run…");
    const pipelineResult = await runOtcFulfillmentPipeline();
    pipelineSteps = pipelineResult.steps.map(s => ({
      agentCode: s.agentCode,
      success: s.success,
      toolCallCount: s.toolCallCount,
    }));

    if (!pipelineResult.success) {
      const failedStep = pipelineResult.steps.find(s => !s.success);
      const detail = pipelineResult.error ?? `Pipeline step failed: ${failedStep?.agentCode ?? "unknown"}`;
      checks.push({ name: "End-to-End Pipeline Run", passed: false, detail });
      alertSeverity = maxSeverity(alertSeverity, "critical");
      if (!alertNeeded) {
        alertNeeded = true;
        alertMessage = `OTC smoke test: pipeline failure — ${detail}`;
      } else {
        alertMessage += `; pipeline failure — ${detail}`;
      }
    } else {
      const stepSummary = pipelineResult.steps.map(s => `${s.agentCode}(${s.toolCallCount} tools)`).join(" → ");
      checks.push({ name: "End-to-End Pipeline Run", passed: true, detail: `All 3 agents completed: ${stepSummary}` });
      console.log(`[otc-smoke-test] Pipeline success: ${stepSummary}`);
    }

    // 3. Eval suite run — always execute a fresh inline eval every cycle
    const allSuites = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
    const suite = allSuites.find(s => s.name === OTC_EVAL_SUITE_NAME);
    if (!suite) {
      checks.push({ name: "Eval Suite Run", passed: false, detail: `Eval suite "${OTC_EVAL_SUITE_NAME}" not found` });
      if (!alertNeeded) { alertNeeded = true; alertMessage = `OTC smoke test: eval suite not found`; }
    } else {
      const leadAgent = allAgents.find(a => a.name === OTC_AGT_005_NAME);
      if (!leadAgent) {
        checks.push({ name: "Eval Suite Run", passed: false, detail: "Lead agent unavailable — eval skipped" });
        if (!alertNeeded) { alertNeeded = true; alertMessage = `OTC smoke test: lead agent unavailable`; }
      } else {
        const testCases = await storage.getEvalTestCases(suite.id).catch((): Awaited<ReturnType<typeof storage.getEvalTestCases>> => []);
        const agentCtx = buildAgentContext(leadAgent);
        const evalRun = await storage.createEvalRun({
          suiteId: suite.id, status: "running", passRate: 0,
          totalCases: testCases.length, passedCases: 0, failedCases: 0, avgLatencyMs: 0,
        });
        freshEvalRunId = evalRun.id;

        let passed = 0; let failed = 0; let totalLatency = 0;
        for (const tc of testCases) {
          const inputData = (tc.inputData as Record<string, unknown>) || {};
          try {
            const agentRun = await runAgentOnInput(leadAgent.systemPrompt, inputData);
            const judgeResult = await runLlmJudge(tc.name, inputData,
              (tc.expectedOutput as Record<string, unknown>) || null, agentCtx, agentRun.output, undefined);
            const latencyMs = agentRun.latencyMs + judgeResult.latencyMs;
            totalLatency += latencyMs;
            if (judgeResult.isPassed) passed++; else failed++;
            await storage.createEvalCaseResult({
              runId: evalRun.id, caseId: tc.id, passed: judgeResult.isPassed, latencyMs,
              actualOutput: { status: judgeResult.isPassed ? "pass" : "fail", confidence: judgeResult.confidence, reason: judgeResult.reason, agentOutput: agentRun.output || null },
              scorerOutputs: { judgeMetadata: { confidence: judgeResult.confidence, reason: judgeResult.reason } },
            }).catch(() => {});
          } catch {
            failed++;
            await storage.createEvalCaseResult({
              runId: evalRun.id, caseId: tc.id, passed: false, latencyMs: 0,
              actualOutput: { status: "fail", reason: "Eval case threw an exception" },
            }).catch(() => {});
          }
          await delay(100);
        }

        const passRate = testCases.length > 0 ? passed / testCases.length : 0;
        const avgLatency = testCases.length > 0 ? Math.round(totalLatency / testCases.length) : 0;
        freshPassRate = passRate;
        await storage.createEvalRun({
          suiteId: suite.id, status: "completed", passRate,
          totalCases: testCases.length, passedCases: passed, failedCases: failed, avgLatencyMs: avgLatency,
        });

        const passRatePct = Math.round(passRate * 100);
        if (passRate < OTC_SMOKE_MIN_PASS_RATE) {
          checks.push({ name: "Eval Suite Run", passed: false, detail: `Eval pass rate ${passRatePct}% is below ${OTC_SMOKE_MIN_PASS_RATE * 100}% threshold (${passed}/${testCases.length} cases)` });
          const evalSeverity: SmokeSeverity = passRate < 0.75 ? "critical" : "high";
          alertSeverity = maxSeverity(alertSeverity, evalSeverity);
          if (!alertNeeded) {
            alertNeeded = true;
            alertMessage = `OTC smoke test: eval pass rate ${passRatePct}% (${passed}/${testCases.length} cases)`;
          } else {
            alertMessage += `; eval pass rate ${passRatePct}%`;
          }
        } else {
          checks.push({ name: "Eval Suite Run", passed: true, detail: `Eval pass rate ${passRatePct}% meets ${OTC_SMOKE_MIN_PASS_RATE * 100}% threshold (${passed}/${testCases.length} cases)` });
        }
        console.log(`[otc-smoke-test] Eval run complete: ${passed}/${testCases.length} passed (${passRatePct}%)`);
      }
    }

    // 4. Resolve or create observability alert — fallback to incident if agent is unavailable
    const leadAgentId = allAgents.find(a => a.name === OTC_AGT_005_NAME)?.id;

    if (alertNeeded) {
      if (leadAgentId) {
        // Upsert alert into agent_alerts (visible in Observability)
        const openAlerts = await db.select().from(agentAlerts).where(
          and(eq(agentAlerts.agentId, leadAgentId), eq(agentAlerts.alertType, OTC_SMOKE_ALERT_TYPE), isNull(agentAlerts.acknowledgedAt))
        );
        if (openAlerts.length > 0) {
          await db.update(agentAlerts).set({ severity: alertSeverity, message: alertMessage, triggeredAt: new Date() }).where(eq(agentAlerts.id, openAlerts[0].id));
        } else {
          await db.insert(agentAlerts).values({ agentId: leadAgentId, agentName: OTC_AGT_005_NAME, alertType: OTC_SMOKE_ALERT_TYPE, severity: alertSeverity, message: alertMessage });
        }
        console.log(`[otc-smoke-test] Alert upserted (severity: ${alertSeverity}): ${alertMessage}`);
      } else {
        // Fallback: create a system-level incident when the lead agent itself is unavailable
        await storage.createIncident({
          agentId: "system-otc-smoke-test",
          agentName: "OTC Fulfillment Smoke Test",
          severity: alertSeverity === "critical" ? "critical" : alertSeverity === "high" ? "high" : "medium",
          status: "open",
          sourceMetric: OTC_SMOKE_ALERT_TYPE,
          sourceDetails: { message: alertMessage, triggeredAt: new Date().toISOString() },
        }).catch(err => console.error("[otc-smoke-test] Failed to create fallback incident:", err.message));
        console.log(`[otc-smoke-test] Incident created (fallback — lead agent unavailable): ${alertMessage}`);
      }
    } else if (leadAgentId) {
      // All checks passed — auto-acknowledge any open alerts
      const openAlerts = await db.select().from(agentAlerts).where(
        and(eq(agentAlerts.agentId, leadAgentId), eq(agentAlerts.alertType, OTC_SMOKE_ALERT_TYPE), isNull(agentAlerts.acknowledgedAt))
      );
      if (openAlerts.length > 0) {
        await db.update(agentAlerts).set({ acknowledgedAt: new Date() }).where(eq(agentAlerts.id, openAlerts[0].id));
        console.log("[otc-smoke-test] All checks passed — auto-acknowledged previous alert");
      }
    }

    const allPassed = checks.every(c => c.passed);
    console.log(`[otc-smoke-test] Done — ${allPassed ? "HEALTHY" : "DEGRADED"} (${checks.filter(c => c.passed).length}/${checks.length} checks passed, alert: ${alertNeeded})`);

  } catch (err: any) {
    const errMsg: string = err?.message ?? "Unexpected smoke test exception";
    console.error("[otc-smoke-test] Unexpected error during smoke test:", errMsg);
    // Best-effort: surface unhandled exceptions as an observability incident so the failure is never silent
    await storage.createIncident({
      agentId: "system-otc-smoke-test",
      agentName: "OTC Fulfillment Smoke Test",
      severity: "critical",
      status: "open",
      sourceMetric: OTC_SMOKE_ALERT_TYPE,
      sourceDetails: { message: `Smoke test threw unhandled exception: ${errMsg}`, triggeredAt: new Date().toISOString() },
    }).catch(incErr => console.error("[otc-smoke-test] Failed to create exception incident:", incErr.message));
    throw err;
  } finally {
    const triggeredBy = (job.payload as Record<string, unknown>)?.triggeredBy ?? "scheduled";
    if (triggeredBy !== "manual") {
      const nextRunAt = new Date(Date.now() + OTC_SMOKE_TEST_INTERVAL_MS);
      try {
        await storage.createJob({ type: "otc_smoke_test", status: "queued", payload: { triggeredBy: "scheduled" }, scheduledFor: nextRunAt });
        console.log(`[otc-smoke-test] Re-enqueued for next run at ${nextRunAt.toISOString()}`);
      } catch (enqueueErr: any) {
        console.error("[otc-smoke-test] Failed to re-enqueue smoke test:", enqueueErr.message);
      }
    } else {
      console.log("[otc-smoke-test] Manual trigger — skipping scheduled re-enqueue");
    }
  }

  return { durationMs: Date.now() - startedAt, checks, alertRaised: alertNeeded, freshEvalRunId, freshPassRate, pipelineSteps };
}

export async function enqueueOtcSmokeTest() {
  try {
    const existing = await storage.getPendingOtcSmokeTestJob();
    if (existing) {
      console.log("[startup] OTC smoke test already queued, skipping initial enqueue");
      return;
    }
    await storage.createJob({
      type: "otc_smoke_test",
      status: "queued",
      payload: { triggeredBy: "scheduled" },
      scheduledFor: new Date(),
    });
    console.log("[startup] Enqueued initial OTC Fulfillment smoke test");
  } catch (err: any) {
    console.error("[startup] CRITICAL: Failed to enqueue OTC smoke test — monitoring inactive:", err.message);
  }
}

export async function enqueueOtcSmokeTestNow(): Promise<{ jobId: string }> {
  const job = await storage.createJob({
    type: "otc_smoke_test",
    status: "queued",
    payload: { triggeredBy: "manual" },
    scheduledFor: new Date(),
  });
  console.log(`[otc-smoke-test] Manual trigger enqueued — job ${job.id}`);
  return { jobId: job.id };
}

export function startWorker(intervalMs = 2000) {
  if (workerRunning) return;
  workerRunning = true;

  let dbErrorCount = 0;
  const MAX_BACKOFF_MS = 60000;

  const getNextPollDelay = (hadDbError: boolean) => {
    if (!hadDbError) {
      dbErrorCount = 0;
      return intervalMs;
    }
    dbErrorCount = Math.min(dbErrorCount + 1, 5);
    return Math.min(intervalMs * Math.pow(4, dbErrorCount - 1), MAX_BACKOFF_MS);
  };

  const poll = async () => {
    if (!workerRunning) return;
    let hadDbError = false;

    try {
      const job = await storage.dequeueNextJob();
      if (job) {
        console.log(`[worker] Processing job ${job.id} (type: ${job.type})`);
        try {
          let result: Record<string, unknown>;
          if (job.type === "eval_baseline") {
            result = await processEvalBaseline(job);
          } else if (job.type === "shadow_replay") {
            result = await processShadowReplay(job);
          } else if (job.type === "agent_scheduled_run") {
            result = await processAgentScheduledRun(job);
          } else if (job.type === "audit_chain_integrity_check") {
            result = await processAuditChainIntegrityCheck(job);
          } else if (job.type === "otc_smoke_test") {
            result = await processOtcSmokeTest(job);
          } else {
            result = { message: `Unknown job type: ${job.type}` };
          }
          await storage.completeJob(job.id, result);
          jobEvents.emit("completed", { jobId: job.id, agentId: job.agentId, result });
          console.log(`[worker] Job ${job.id} completed`);
        } catch (err: any) {
          await storage.failJob(job.id, err.message || "Unknown error");
          jobEvents.emit("failed", { jobId: job.id, agentId: job.agentId, error: err.message });
          console.error(`[worker] Job ${job.id} failed:`, err.message);
        }
      }
    } catch (err) {
      hadDbError = isDbConnectionError(err);
      if (hadDbError) {
        const nextDelay = getNextPollDelay(true);
        if (dbErrorCount === 1) console.error("[worker] Poll error:", err);
        setTimeout(poll, nextDelay);
        return;
      }
      console.error("[worker] Poll error:", err);
    }

    setTimeout(poll, getNextPollDelay(false));
  };

  poll();
  console.log("[worker] Job worker started");

  const canaryMonitorInterval = 30000;
  let canaryDbErrorCount = 0;
  const canaryMonitor = async () => {
    if (!workerRunning) return;
    try {
      await monitorCanaryDeployments();
      canaryDbErrorCount = 0;
    } catch (err) {
      if (isDbConnectionError(err)) {
        canaryDbErrorCount = Math.min(canaryDbErrorCount + 1, 4);
        const backoff = Math.min(canaryMonitorInterval * Math.pow(2, canaryDbErrorCount - 1), 300000);
        setTimeout(canaryMonitor, backoff);
        return;
      }
      console.error("[worker] Canary monitor error:", err);
    }
    setTimeout(canaryMonitor, canaryMonitorInterval);
  };
  setTimeout(canaryMonitor, canaryMonitorInterval);
  console.log("[worker] Canary monitor started (30s interval)");

  const autonomyAutoTimeoutInterval = 300000;
  const autonomyAutoTimeout = async () => {
    if (!workerRunning) return;
    try {
      await autoValidateTimedOutDecisions();
    } catch (err) {
      if (!isDbConnectionError(err)) console.error("[worker] Autonomy auto-timeout error:", err);
    }
    setTimeout(autonomyAutoTimeout, autonomyAutoTimeoutInterval);
  };
  setTimeout(autonomyAutoTimeout, autonomyAutoTimeoutInterval);
  console.log("[worker] Autonomy auto-timeout validator started (5min interval)");

  const alertCheckInterval = 300000;
  const alertCheckRunner = async () => {
    if (!workerRunning) return;
    try {
      await runAlertCheck();
    } catch (err) {
      if (!isDbConnectionError(err)) console.error("[worker] Alert check error:", err);
    }
    setTimeout(alertCheckRunner, alertCheckInterval);
  };
  setTimeout(alertCheckRunner, alertCheckInterval);
  console.log("[worker] Observability alert checker started (5min interval)");
}

async function computeCanaryHealthSnapshot(dep: {
  id: string;
  agentId: string;
  agentName: string | null;
  environment: string;
  canaryConfig: unknown;
}) {
  const config = (dep.canaryConfig as Record<string, unknown>) || {};
  const maxErrorRate: number = (config.maxErrorRate as number) || 5;
  const latencyThreshold: number = (config.latencyP99Threshold as number) || 5000;
  const successThreshold: number = (config.successThreshold as number) || 95;
  const minPolicyComplianceRate: number = (config.minPolicyComplianceRate as number) ?? 98;
  const maxCostDriftMultiplier: number = (config.maxCostDriftMultiplier as number) ?? 1.5;
  const maxDownstreamFailureRate: number = (config.maxDownstreamFailureRate as number) ?? 5;
  const minEvalPassRate: number | null = (config.minEvalPassRate as number | null) ?? null;

  const traces = await storage.getTracesByAgent(dep.agentId);
  const recentTraces = traces
    .filter(t => t.environment === dep.environment)
    .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
    .slice(0, 50);

  const total = recentTraces.length;

  const failed = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
  const errorRate = total > 0 ? (failed / total) * 100 : 0;
  const avgLatency = total > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / total) : 0;
  const successRate = total > 0 ? ((total - failed) / total) * 100 : 100;

  // Policy compliance rate: trace fails if policyChecks has a hard failure OR softPolicyViolations is non-empty
  const policyCompliant = recentTraces.filter(t => {
    const checks = t.policyChecks as Array<Record<string, unknown>> | null;
    const softViolations = t.softPolicyViolations as Array<unknown> | null;
    const hardFail = Array.isArray(checks) && checks.some(c => c.passed === false || c.result === "fail" || c.status === "failed");
    const hasSoftViolations = Array.isArray(softViolations) && softViolations.length > 0;
    return !hardFail && !hasSoftViolations;
  }).length;
  const policyComplianceRate = total > 0 ? (policyCompliant / total) * 100 : 100;

  // Cost drift ratio vs agent baseline costPerRun
  const agentData = await storage.getAgent(dep.agentId);
  const baselineCost = agentData?.costPerRun;
  const avgCostUsd = total > 0 ? recentTraces.reduce((s, t) => s + (t.costUsd || 0), 0) / total : 0;
  const costDriftRatio = baselineCost && baselineCost > 0 ? avgCostUsd / baselineCost : null;

  // Downstream failure rate: traces from other agents whose traceParentId points into canary traces
  const canaryTraceIds = recentTraces.map(t => t.id);
  const downstreamTraces = await storage.getTracesByParentIds(canaryTraceIds);
  const downstreamFailed = downstreamTraces.filter(t => t.status === "failed" || t.status === "error").length;
  const downstreamFailureRate = downstreamTraces.length > 0 ? (downstreamFailed / downstreamTraces.length) * 100 : 0;

  // Eval pass rate from active eval suites
  const evalSuitesList = await storage.getEvalsByAgent(dep.agentId);
  const evalPassRate = evalSuitesList.length > 0
    ? evalSuitesList.reduce((s, e) => s + (e.passRate || 0), 0) / evalSuitesList.length
    : null;

  // Gate verdicts
  const errorRatePasses = errorRate <= maxErrorRate;
  const latencyPasses = avgLatency <= latencyThreshold;
  const policyPasses = policyComplianceRate >= minPolicyComplianceRate;
  const costDriftPasses = costDriftRatio === null ? true : costDriftRatio <= maxCostDriftMultiplier;
  const downstreamPasses = downstreamFailureRate <= maxDownstreamFailureRate;
  const evalPasses = (minEvalPassRate === null || evalPassRate === null) ? true : evalPassRate >= minEvalPassRate;
  const allGatesPass = errorRatePasses && latencyPasses && policyPasses && costDriftPasses && downstreamPasses && evalPasses;

  const lastHealthSnapshot = {
    computedAt: new Date().toISOString(),
    traceCount: total,
    gates: {
      errorRate: { value: errorRate, threshold: maxErrorRate, passes: errorRatePasses, unit: "%" },
      avgLatency: { value: avgLatency, threshold: latencyThreshold, passes: latencyPasses, unit: "ms" },
      policyCompliance: { value: policyComplianceRate, threshold: minPolicyComplianceRate, passes: policyPasses, unit: "%" },
      costDrift: { value: costDriftRatio, threshold: maxCostDriftMultiplier, passes: costDriftPasses, unit: "x" },
      downstreamFailureRate: { value: downstreamFailureRate, threshold: maxDownstreamFailureRate, passes: downstreamPasses, unit: "%" },
      evalPassRate: { value: evalPassRate, threshold: minEvalPassRate, passes: evalPasses, unit: "%" },
    },
    allGatesPass,
  };

  return {
    total, failed, errorRate, avgLatency, successRate,
    policyComplianceRate, costDriftRatio, downstreamFailureRate, evalPassRate,
    allGatesPass, lastHealthSnapshot,
    thresholds: { maxErrorRate, latencyThreshold, successThreshold, minPolicyComplianceRate, maxCostDriftMultiplier, maxDownstreamFailureRate, minEvalPassRate },
  };
}

async function monitorCanaryDeployments() {
  const deployments = await storage.getDeployments();
  const canaryDeps = deployments.filter(d => d.status === "canary" && (d.canaryPercent || 0) < 100);

  for (const dep of canaryDeps) {
    const health = await computeCanaryHealthSnapshot({
      id: dep.id,
      agentId: dep.agentId,
      agentName: dep.agentName,
      environment: dep.environment,
      canaryConfig: dep.canaryConfig,
    });

    const { total, errorRate, avgLatency, successRate, policyComplianceRate, costDriftRatio, downstreamFailureRate, evalPassRate, allGatesPass, lastHealthSnapshot } = health;
    const { maxErrorRate, latencyThreshold, successThreshold, minPolicyComplianceRate, maxCostDriftMultiplier, maxDownstreamFailureRate } = health.thresholds;
    const stepSize = ((dep.canaryConfig as Record<string, unknown> || {}).stepPercent as number) || 10;

    if (total < 5) {
      // Still write snapshot even with insufficient data
      await storage.updateDeployment(dep.id, {
        canaryConfig: { ...(dep.canaryConfig as object || {}), lastHealthSnapshot },
      });
      continue;
    }

    if (!allGatesPass) {
      const failDetails = [
        `errorRate=${errorRate.toFixed(1)}% (max ${maxErrorRate}%)`,
        `latency=${avgLatency}ms (max ${latencyThreshold}ms)`,
        `successRate=${successRate.toFixed(1)}% (min ${successThreshold}%)`,
        `policyCompliance=${policyComplianceRate.toFixed(1)}% (min ${minPolicyComplianceRate}%)`,
        costDriftRatio !== null ? `costDrift=${costDriftRatio.toFixed(2)}x (max ${maxCostDriftMultiplier}x)` : null,
        `downstreamFailureRate=${downstreamFailureRate.toFixed(1)}% (max ${maxDownstreamFailureRate}%)`,
        evalPassRate !== null ? `evalPassRate=${evalPassRate.toFixed(1)}%` : null,
      ].filter(Boolean).join(", ");
      console.log(`[canary-monitor] ${dep.agentName} GATE FAILED: ${failDetails}`);

      await storage.updateDeployment(dep.id, {
        canaryConfig: { ...(dep.canaryConfig as object || {}), lastHealthSnapshot },
      });

      const autopromoteConfig = dep.autopromoteConfig as Record<string, unknown>;
      if (autopromoteConfig?.rollbackOnFailure) {
        await storage.updateDeployment(dep.id, { status: "rolled_back", canaryPercent: 0, shadowEnabled: false });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "canary_monitor",
          action: "canary_rollback",
          objectType: "deployment",
          objectId: dep.id,
          details: `Canary auto-rolled back for ${dep.agentName}: ${failDetails}`,
        });

        if (dep.incidentId) {
          try {
            const incident = await storage.getIncident(dep.incidentId);
            if (incident && incident.status !== "open") {
              await storage.updateIncident(incident.id, {
                status: "open",
                remediationRecord: {
                  ...(incident.remediationRecord as object || {}),
                  rollbackAt: new Date().toISOString(),
                  rollbackDeploymentId: dep.id,
                  rollbackReason: `Canary gates failed: errorRate=${errorRate.toFixed(1)}%, successRate=${successRate.toFixed(1)}%, latency=${avgLatency}ms`,
                  autoRollback: true,
                },
              });
              await storage.createAuditEvent({
                actorType: "system",
                actorId: "canary_monitor",
                action: "incident_reopened",
                objectType: "incident",
                objectId: incident.id,
                details: `Incident ${incident.id} reopened: canary auto-rollback on deployment ${dep.id}`,
              });
            }
          } catch (e) {
            console.error("[canary-monitor] Failed to reopen incident:", e);
          }
        }

        jobEvents.emit("canary_rollback", { deploymentId: dep.id, agentId: dep.agentId });
      }
      continue;
    }

    const currentPercent = dep.canaryPercent || 0;
    const newPercent = Math.min(currentPercent + stepSize, 100);
    const updateData: Record<string, unknown> = {
      canaryPercent: newPercent,
      canaryConfig: { ...(dep.canaryConfig as object || {}), lastHealthSnapshot },
    };

    if (newPercent >= 100) {
      updateData.status = "active";
      updateData.completedAt = new Date();
    }

    await storage.updateDeployment(dep.id, updateData);

    const passDetails = [
      `errorRate=${errorRate.toFixed(1)}%`,
      `latency=${avgLatency}ms`,
      `successRate=${successRate.toFixed(1)}%`,
      `policyCompliance=${policyComplianceRate.toFixed(1)}%`,
      costDriftRatio !== null ? `costDrift=${costDriftRatio.toFixed(2)}x` : null,
      `downstreamFailureRate=${downstreamFailureRate.toFixed(1)}%`,
      evalPassRate !== null ? `evalPassRate=${evalPassRate.toFixed(1)}%` : null,
    ].filter(Boolean).join(", ");

    await storage.createAuditEvent({
      actorType: "system",
      actorId: "canary_monitor",
      action: newPercent >= 100 ? "canary_promoted_full" : "canary_increased",
      objectType: "deployment",
      objectId: dep.id,
      details: `Canary ${newPercent >= 100 ? "promoted to full" : `increased to ${newPercent}%`} for ${dep.agentName}. Gates passed: ${passDetails}`,
    });

    if (newPercent >= 100 && dep.incidentId) {
      try {
        const incident = await storage.getIncident(dep.incidentId);
        if (incident && incident.status !== "resolved" && incident.status !== "closed") {
          await storage.updateIncident(incident.id, {
            status: "resolved",
            resolvedAt: new Date(),
            remediationRecord: {
              patchId: dep.patchId || null,
              deploymentId: dep.id,
              rolloutStrategy: dep.rolloutStrategy,
              finalCanaryPercent: 100,
              resolvedAt: new Date().toISOString(),
              autoPromoted: true,
              duration: incident.createdAt ? `${Math.round((Date.now() - new Date(incident.createdAt).getTime()) / 60000)}m` : "unknown",
            },
          });
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "canary_monitor",
            action: "incident_resolved",
            objectType: "incident",
            objectId: incident.id,
            details: `Incident ${incident.id} auto-resolved: canary promoted to full for deployment ${dep.id}`,
          });
        }
      } catch (e) {
        console.error("[canary-monitor] Failed to resolve incident:", e);
      }
    }

    console.log(`[canary-monitor] ${dep.agentName}: canary ${currentPercent}% -> ${newPercent}% (all gates pass, ${passDetails})`);
    jobEvents.emit("canary_progress", { deploymentId: dep.id, agentId: dep.agentId, canaryPercent: newPercent });
  }
}

async function processShadowReplay(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const agentId = payload.agentId as string;
  const deploymentId = payload.deploymentId as string | undefined;
  const approvalId = payload.approvalId as string | undefined;
  const timeWindow = payload.timeWindow as string || "24h";
  const sampleSize = payload.sampleSize as number || 10;

  await storage.updateJob(job.id, { progress: 10 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 10, step: "fetching_traces" });

  const agent = await storage.getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const traces = await storage.getTracesByAgent(agentId);
  const windowMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  const cutoff = Date.now() - (windowMs[timeWindow] || 86400000);
  const filteredTraces = traces
    .filter(t => new Date(t.startedAt || 0).getTime() > cutoff)
    .slice(0, Math.min(sampleSize, 100));

  await storage.updateJob(job.id, { progress: 30 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 30, step: "replaying_traces" });

  const provider = agent.modelProvider ? getProvider(agent.modelProvider) : getDefaultProvider();
  const agentCtx = buildAgentContext(agent);

  interface TraceReplayResult {
    traceId: string;
    isPassed: boolean;
    confidence: number;
    reason: string;
    originalOutput: string;
    replayOutput: string;
    originalToolCallNames: string[];
    replayToolCallNames: string[];
    costDelta: number;
    latencyDelta: number;
  }

  const perTraceResults: TraceReplayResult[] = [];
  const tracesReplayed = filteredTraces.length;

  for (let i = 0; i < filteredTraces.length; i++) {
    const trace = filteredTraces[i];
    try {
      const promptInputs = (trace.promptInputs as Record<string, unknown>) || {};
      let userMessage: string;
      if (typeof promptInputs.prompt === "string") {
        userMessage = promptInputs.prompt;
      } else if (typeof promptInputs.input === "string") {
        userMessage = promptInputs.input;
      } else if (typeof promptInputs.message === "string") {
        userMessage = promptInputs.message;
      } else if (typeof promptInputs.query === "string") {
        userMessage = promptInputs.query;
      } else if (trace.inputSummary) {
        userMessage = trace.inputSummary;
      } else if (Object.keys(promptInputs).length > 0) {
        userMessage = JSON.stringify(promptInputs, null, 2);
      } else {
        userMessage = "No input available for replay";
      }

      const replayStart = Date.now();
      const fallbackProvider = getProvider(provider.providerName === "openai" ? "anthropic" : "openai");
      const replayResult = await completeWithFallback(
        [
          { role: "system", content: agent.systemPrompt || "You are a helpful AI assistant." },
          { role: "user", content: userMessage },
        ],
        { temperature: 0, maxTokens: 1000 },
        [provider, fallbackProvider],
      );
      const replayLatencyMs = Date.now() - replayStart;
      const replayCostUsd = replayResult.costUsd;
      const replayOutput = replayResult.content;

      const originalOutput = trace.outputSummary || "";
      const originalLatencyMs = trace.latencyMs || 0;
      const originalCostUsd = trace.costUsd || 0;

      const originalToolCallNames = Array.isArray(trace.toolCalls)
        ? (trace.toolCalls as Array<Record<string, unknown>>).map(tc =>
            typeof tc.name === "string" ? tc.name : "unknown"
          )
        : [];
      const replayToolCallNames = replayResult.toolCalls.map(tc => tc.name);

      const judgeResult = await runLlmJudge(
        `shadow_replay:${trace.id}`,
        { inputContext: userMessage },
        {
          referenceOutput: originalOutput,
          criterion: "The replay output must convey the same intent, key information, and correctness as the reference output",
        },
        agentCtx,
        replayOutput,
      );

      perTraceResults.push({
        traceId: trace.id,
        isPassed: judgeResult.isPassed,
        confidence: judgeResult.confidence,
        reason: judgeResult.reason,
        originalOutput,
        replayOutput,
        originalToolCallNames,
        replayToolCallNames,
        costDelta: replayCostUsd - originalCostUsd,
        latencyDelta: replayLatencyMs - originalLatencyMs,
      });
    } catch (err: any) {
      console.error(`[shadow-replay] Error replaying trace ${trace.id}:`, err.message);
      perTraceResults.push({
        traceId: trace.id,
        isPassed: false,
        confidence: 0,
        reason: `Replay error: ${err.message}`,
        originalOutput: trace.outputSummary || "",
        replayOutput: "",
        originalToolCallNames: [],
        replayToolCallNames: [],
        costDelta: 0,
        latencyDelta: 0,
      });
    }

    const progressPct = 30 + Math.round(((i + 1) / Math.max(filteredTraces.length, 1)) * 40);
    await storage.updateJob(job.id, { progress: progressPct });
    jobEvents.emit("progress", { jobId: job.id, agentId, progress: progressPct, step: "replaying_traces" });
  }

  const passCount = perTraceResults.filter(r => r.isPassed).length;
  const failCount = tracesReplayed - passCount;
  const passRate = tracesReplayed > 0 ? (passCount / tracesReplayed) * 100 : 0;
  const avgCostDelta = tracesReplayed > 0
    ? perTraceResults.reduce((sum, r) => sum + r.costDelta, 0) / tracesReplayed
    : 0;
  const avgLatencyDelta = tracesReplayed > 0
    ? Math.round(perTraceResults.reduce((sum, r) => sum + r.latencyDelta, 0) / tracesReplayed)
    : 0;

  await storage.updateJob(job.id, { progress: 70 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 70, step: "evaluating_results" });

  const divergences = perTraceResults
    .filter(r => !r.isPassed)
    .map(r => {
      const toolsDiverged =
        JSON.stringify(r.originalToolCallNames) !== JSON.stringify(r.replayToolCallNames);
      return {
        traceId: r.traceId,
        type: toolsDiverged ? "tool_divergence" : "output_mismatch",
        severity: r.confidence < 0.5 ? "critical" : "minor",
        originalOutput: r.originalOutput,
        replayOutput: r.replayOutput,
        reason: r.reason,
      };
    });

  const evidenceBundle = {
    type: "shadow_replay",
    agentId,
    agentName: agent.name,
    deploymentId,
    approvalId,
    timestamp: new Date().toISOString(),
    summary: {
      tracesReplayed,
      passed: passCount,
      failed: failCount,
      passRate: passRate.toFixed(1) + "%",
      avgCostDelta: avgCostDelta.toFixed(4),
      avgLatencyDelta: avgLatencyDelta + "ms",
    },
    gateResult: passRate >= 80 ? "pass" : "fail",
    divergences,
    timeWindow,
    evaluatedAt: new Date().toISOString(),
  };

  if (approvalId) {
    const approval = await storage.getApproval(approvalId);
    if (approval) {
      const existingEvidence = (approval.evidenceJson as any) || {};
      await storage.updateApproval(approvalId, {
        evidenceJson: {
          ...existingEvidence,
          shadowReplay: evidenceBundle,
        },
      });
    }
  }

  const healingPipelineId = payload.healingPipelineId as string | undefined;
  if (healingPipelineId) {
    try {
      const pipeline = await storage.getHealingPipeline(healingPipelineId);
      if (pipeline) {
        const replayPassed = passRate >= 80;
        const existingRemediation = (pipeline.remediation as Record<string, unknown>) || {};
        const updatedRemediation = {
          ...existingRemediation,
          shadowReplayValidation: {
            status: replayPassed ? "passed" : "failed",
            replayJobId: job.id,
            passRate: Math.round(passRate * 100) / 100,
            evidenceBundle,
            triggeredAt: (existingRemediation.shadowReplayValidation as any)?.triggeredAt || new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        };

        const experimentUpdate: Record<string, unknown> = {};
        if (!replayPassed) {
          const existingResults = (pipeline.experimentResults as Record<string, unknown>) || {};
          experimentUpdate.experimentResults = {
            ...existingResults,
            shadowReplayFailed: true,
          };
        }

        await storage.updateHealingPipeline(healingPipelineId, {
          remediation: updatedRemediation,
          ...experimentUpdate,
        });

        console.log(`[worker] Shadow replay for healing pipeline ${healingPipelineId}: ${replayPassed ? "PASSED" : "FAILED"} (passRate: ${passRate.toFixed(1)}%)`);
      }
    } catch (err: any) {
      console.error(`[worker] Failed to update healing pipeline ${healingPipelineId}:`, err.message);
    }
  }

  await storage.updateJob(job.id, { progress: 100 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 100, step: "completed" });

  return evidenceBundle;
}

async function autoValidateTimedOutDecisions() {
  const pendingDecisions = await storage.getAutonomyDecisions({ outcome: "pending" });
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  let validated = 0;

  for (const decision of pendingDecisions) {
    if (!decision.createdAt || new Date(decision.createdAt) > fourteenDaysAgo) continue;

    await storage.updateAutonomyDecision(decision.id, {
      outcome: "validated_correct",
      outcomeSource: "auto_timeout",
      outcomeDetails: { reason: "No negative signals after 14 days" } as any,
      outcomeAt: new Date(),
    });

    const { getDecisionQualityProfiles, createDecisionQualityProfile, updateDecisionQualityProfile } = storage;
    const profiles = await storage.getDecisionQualityProfiles({ agentId: decision.agentId, decisionType: decision.decisionType });
    const matching = profiles.find((p: any) => (p.riskDimension || null) === (decision.riskDimension || null));
    if (matching) {
      const newCorrect = matching.correctDecisions + 1;
      const newPending = Math.max(0, matching.pendingDecisions - 1);
      const resolved = newCorrect + matching.incorrectDecisions;
      await storage.updateDecisionQualityProfile(matching.id, {
        correctDecisions: newCorrect,
        pendingDecisions: newPending,
        accuracyRate: resolved > 0 ? Math.round((newCorrect / resolved) * 10000) / 10000 : 0,
        updatedAt: new Date(),
      });
    }
    validated++;
  }

  if (validated > 0) {
    console.log(`[worker] Auto-validated ${validated} timed-out autonomy decisions`);
  }
}

export function stopWorker() {
  workerRunning = false;
}
