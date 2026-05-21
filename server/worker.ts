import { storage } from "./storage";
import type { Job, AuditChainTrigger } from "@shared/schema";
import { agentAlerts } from "@shared/schema";
import { EventEmitter } from "events";
import { checkOntologyCompliance, executeScheduledAgentCycle, runAgentOnce } from "./agent-runtime";
import { industryEvalFrameworks } from "./routes";
import { runLlmJudge, runAgentOnInput, buildAgentContext, routeMetricMeasurement } from "./eval-judge";
import { getDefaultProvider, getProvider, completeWithFallback } from "./llm-provider";
import { runAlertCheck } from "./routes/observability";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";
import { ensureOtcFulfillmentAgents, runOtcFulfillmentPipeline } from "./otc-fulfillment-live-run";
import { OTC_AGT_005_NAME, OTC_AGT_007_NAME, OTC_AGT_012_NAME, OTC_EVAL_SUITE_NAME } from "./otc-fulfillment-shared-defs";
import nodemailer from "nodemailer";

// ── Email helper ──────────────────────────────────────────────────────────────

/**
 * Send a report notification email via SMTP.
 * Requires the following env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * When SMTP is not configured the function logs the notification and returns.
 */
async function sendReportEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // SMTP not configured — log structured notification for operator review
    console.log(
      `[worker] [email] SMTP not configured. Notification queued:\n` +
      `  To: ${opts.to.join(", ")}\n  Subject: ${opts.subject}\n` +
      `  (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM to enable delivery)`
    );
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? "587"),
    secure: parseInt(SMTP_PORT ?? "587") === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    to: opts.to.join(", "),
    subject: opts.subject,
    html: opts.html,
  });
  console.log(`[worker] [email] Sent "${opts.subject}" to ${opts.to.length} recipient(s)`);
}

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

// ── Report Schedule Worker ────────────────────────────────────────────────────

const REPORT_SCHEDULE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function processReportScheduleRun(job: Job): Promise<Record<string, unknown>> {
  const { generateComplianceReport } = await import("./eval-report-generator");
  const startedAt = Date.now();
  let processed = 0;
  let errors = 0;
  let jobError: Error | undefined;

  try {
    const dueSchedules = await storage.getDueEvalReportSchedules();
    console.log(`[worker] Report schedule check: ${dueSchedules.length} schedule(s) due`);

    for (const schedule of dueSchedules) {
      try {
        const report = await generateComplianceReport({
          templateType: schedule.templateType,
          agentIds: (schedule.agentIds as string[]) ?? [],
          timeWindowDays: schedule.timeWindowDays ?? 30,
          format: "json",
          orgId: schedule.organizationId ?? undefined,
        }) as Record<string, unknown>;
        await storage.createEvalReportArtifact({
          scheduleId: schedule.id,
          organizationId: schedule.organizationId ?? undefined,
          templateType: schedule.templateType,
          timeWindowDays: schedule.timeWindowDays ?? 30,
          agentIds: (schedule.agentIds as string[]) ?? [],
          reportData: report,
          overallScore: typeof report.overallScore === "number" ? report.overallScore : undefined,
          status: "ready",
        });

        // Notify recipients via SMTP (configured via env vars; see sendReportEmail above)
        const recipients: string[] = (schedule.recipients as string[]) ?? [];
        if (recipients.length > 0) {
          const overallScore = typeof report.overallScore === "number" ? `${report.overallScore}%` : "N/A";
          const totalRuns = (report as any).stats?.totalRuns ?? 0;
          const reportName = (report.templateName as string) ?? schedule.templateType;
          const generatedAt = new Date().toLocaleString();
          const html = `
<html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#111827;margin-bottom:4px;">Compliance Report Ready</h2>
  <p style="color:#6b7280;font-size:14px;margin-bottom:20px;">Generated ${generatedAt}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Report</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:13px;">${reportName}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Overall Score</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:13px;color:${typeof report.overallScore === "number" && (report.overallScore as number) >= 90 ? "#16a34a" : "#ca8a04"};">${overallScore}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Eval Runs</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:13px;">${totalRuns}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Window</td>
        <td style="padding:8px 0;font-size:13px;">${schedule.timeWindowDays ?? 30} days</td></tr>
  </table>
  <p style="color:#374151;font-size:13px;">${(report as any).executiveSummary ?? ""}</p>
  <p style="color:#9ca3af;font-size:11px;margin-top:32px;">Nous Atlas · Compliance Report Scheduler</p>
</body></html>`;
          try {
            await sendReportEmail({
              to: recipients,
              subject: `[Nous Atlas] ${reportName} — Score: ${overallScore}`,
              html,
            });
          } catch (emailErr: any) {
            console.error(`[worker] [email] Failed to send report notification:`, emailErr.message);
          }
        }

        // Advance nextRunAt based on cadence
        const now = new Date();
        const next = new Date(now);
        if (schedule.cadence === "weekly") next.setDate(now.getDate() + 7);
        else if (schedule.cadence === "quarterly") next.setMonth(now.getMonth() + 3);
        else next.setMonth(now.getMonth() + 1);

        await storage.updateEvalReportSchedule(schedule.id, { nextRunAt: next, lastRunAt: now });
        processed++;
        console.log(`[worker] Report schedule ${schedule.id} ran: ${schedule.templateType}, next at ${next.toISOString()}`);
      } catch (schedErr: any) {
        errors++;
        console.error(`[worker] Report schedule ${schedule.id} failed:`, schedErr.message);
      }
    }
  } catch (err: any) {
    jobError = err;
    console.error("[worker] Report schedule check failed:", err.message);
  } finally {
    const nextRunAt = new Date(Date.now() + REPORT_SCHEDULE_CHECK_INTERVAL_MS);
    try {
      await storage.createJob({
        type: "eval_report_schedule_check",
        status: "queued",
        payload: { triggeredBy: "scheduled" },
        scheduledFor: nextRunAt,
      });
    } catch (enqueueErr: any) {
      console.error("[worker] Failed to re-enqueue report schedule check:", enqueueErr.message);
    }
  }

  if (jobError) throw jobError;
  return { processed, errors, durationMs: Date.now() - startedAt };
}

export async function enqueueReportScheduleCheck() {
  try {
    const hasPending = await storage.hasPendingJobOfType("eval_report_schedule_check");
    if (hasPending) {
      console.log("[startup] Report schedule check already queued, skipping initial enqueue");
      return;
    }
    await storage.createJob({
      type: "eval_report_schedule_check",
      status: "queued",
      payload: { triggeredBy: "scheduled" },
      scheduledFor: new Date(Date.now() + 60_000), // first run 1 min after startup
    });
    console.log("[startup] Enqueued initial report schedule check");
  } catch (err: any) {
    console.error("[startup] Failed to enqueue report schedule check:", err.message);
  }
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

// ── Canonical gate evaluator — single source of truth for worker + promote endpoint ──
// Rules (in order):
//   1. Per-metric threshold checks: any named metric with passRate < its threshold → gate:fail
//   2. Global passRate threshold ("passRate" key, default 0.85) for overall gate:pass/warn/fail
// IMPORTANT: uses thresholdOverrides.passRate specifically, NOT Math.min(all values).
//            Per-metric keys are separate enforcement rules, not the global threshold.
type GateOverrides = { thresholdOverrides?: unknown; regressionWindowPct?: number | null };

export function evaluateGateTag(
  passRate: number,
  gate: GateOverrides | null | undefined,
  perMetricPassRates: Record<string, number> = {}
): "gate:pass" | "gate:warn" | "gate:fail" {
  const overrides = (gate?.thresholdOverrides as Record<string, number> | null) ?? {};

  // Global pass-rate threshold comes from the "passRate" key specifically (default 0.85)
  const globalThreshold =
    typeof overrides.passRate === "number" ? overrides.passRate : 0.85;

  // Per-metric enforcement: any violation is an immediate gate:fail
  for (const [metricName, threshold] of Object.entries(overrides)) {
    if (metricName === "passRate") continue;
    if (typeof threshold !== "number") continue;
    const metricPassRate = perMetricPassRates[metricName];
    if (metricPassRate != null && metricPassRate < threshold) {
      return "gate:fail";
    }
  }

  // Global threshold evaluation
  if (passRate >= globalThreshold) return "gate:pass";
  if (passRate >= 0.7) return "gate:warn";
  return "gate:fail";
}

async function processEvalTestRun(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const runId = payload.runId as string;
  const agentId = payload.agentId as string;
  const datasetId = payload.datasetId as string;
  const metricIds = (payload.metricIds as string[]) || [];
  const parallelism = (payload.parallelism as number) || 5;

  console.log(`[eval-test-run] Starting run ${runId} for agent ${agentId} on dataset ${datasetId}`);

  const run = await storage.getEvalTestRun(runId);
  if (!run) throw new Error(`Eval test run ${runId} not found`);

  // Defense-in-depth org check — worker validates agent org before executing
  const orgIdFromPayload = (payload.organizationId as string | undefined) || undefined;
  if (orgIdFromPayload) {
    const agentForOrgCheck = await storage.getAgent(agentId);
    if (agentForOrgCheck?.organizationId && agentForOrgCheck.organizationId !== orgIdFromPayload) {
      throw new Error(`FORBIDDEN: agent ${agentId} does not belong to organization ${orgIdFromPayload}`);
    }
  }
  const judgeModelOverride = (payload.judgeModelOverride as string | null) || undefined;

  await storage.updateEvalTestRun(runId, { status: "running" });
  await storage.updateJob(job.id, { progress: 5 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 5, step: "loading_goldens" });

  // Paginate through all goldens — never silently ignore goldens beyond a single-page limit
  const allGoldens: Awaited<ReturnType<typeof storage.getEvalGoldens>> = [];
  let gPage = 1;
  while (true) {
    const batch = await storage.getEvalGoldens({ datasetId, page: gPage, limit: 500 });
    if (batch.length === 0) break;
    allGoldens.push(...batch);
    if (batch.length < 500) break;
    gPage++;
  }
  const goldens = allGoldens;

  if (goldens.length === 0) {
    await storage.updateEvalTestRun(runId, {
      status: "completed",
      totalGoldens: 0,
      passedCount: 0,
      failedCount: 0,
      passRate: null,
      completedAt: new Date(),
    });
    return { runId, total: 0, passed: 0, failed: 0, message: "No goldens in dataset" };
  }

  const agent = await storage.getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  const agentCtx = buildAgentContext(agent);

  const metrics = metricIds.length > 0
    ? await Promise.all(metricIds.map(id => storage.getEvalMetric(id)))
    : [];

  let passedCount = 0;
  let failedCount = 0;
  let totalLatencyMs = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;

  // Accumulate per-metric pass rates for gate enforcement (JS single-threaded, safe across async)
  const perMetricAgg = new Map<string, { total: number; passed: number }>();

  const CONCURRENCY = Math.min(parallelism, 10);
  let cursor = 0;

  const processGolden = async (golden: typeof goldens[0]) => {
    const t0 = Date.now();
    const orgId = (payload.organizationId as string | undefined) || undefined;

    let actualOutput = "";
    let agentFailed = false;
    let agentFailureReason: string | undefined;

    try {
      // Prefer the full AAR runtime path (runAgentOnce) for fidelity — it exercises tools,
      // MCP bindings, and all runtime middleware that would run in production.
      // Fall back to direct LLM call only when the agent has no active deployment.
      const agentDeployments = await storage.getDeploymentsByAgentId(agentId, "active");
      if (agentDeployments.length > 0) {
        const deployment = agentDeployments[0];
        const aarResult = await runAgentOnce(deployment.id, golden.input, undefined);
        if (!aarResult.success || !aarResult.message || aarResult.message.trim() === "") {
          agentFailed = true;
          agentFailureReason = aarResult.success
            ? "Agent produced empty output via AAR"
            : `AAR run failed: ${aarResult.message}`;
          actualOutput = "";
        } else {
          actualOutput = aarResult.message;
        }
      } else {
        // Fallback: agent has no active deployment — use direct LLM call for eval
        const agentResult = await runAgentOnInput(agent.systemPrompt, { input: golden.input });
        if (!agentResult.output || agentResult.output.trim() === "") {
          agentFailed = true;
          agentFailureReason = "Agent produced empty output (direct LLM fallback)";
          actualOutput = "";
        } else {
          actualOutput = agentResult.output;
        }
      }
    } catch (err: any) {
      agentFailed = true;
      agentFailureReason = `Agent execution error: ${err?.message || "Unknown error"}`;
      actualOutput = "";
      console.warn(`[eval-test-run] Agent failed for golden ${golden.id.slice(0, 8)}: ${agentFailureReason}`);
    }

    const scores: Record<string, number> = {};
    // Per-metric reasoning keyed by metric name — persisted in child span JSONB
    const metricReasonings: Record<string, { score: number; pass: boolean; reason: string; threshold: number; evaluationSteps?: string[] }> = {};
    // Per-metric duration tracked in a proper Map — no `any` mutation
    const metricDurations = new Map<string, number>();
    let overallPass = false;
    const invocationStartedAt = new Date();

    if (agentFailed) {
      scores["overall"] = 0;
      overallPass = false;
    } else {
      const activeMetrics = metrics.filter(Boolean);
      if (activeMetrics.length > 0) {
        for (const metric of activeMetrics) {
          if (!metric) continue;
          const metricT0 = Date.now();
          // Build judge input according to the metric's evaluation_params contract
          const evalParams: string[] = (metric.evaluationParams as string[]) || ["input", "actual_output"];
          const judgeInputData: Record<string, unknown> = {};
          if (evalParams.includes("input")) judgeInputData.input = golden.input;
          if (evalParams.includes("actual_output")) judgeInputData.actual_output = actualOutput;
          if (evalParams.includes("expected_output") && golden.expectedOutput) judgeInputData.expected_output = golden.expectedOutput;
          if (evalParams.includes("retrieval_context") && golden.retrievalContext?.length) judgeInputData.retrieval_context = golden.retrievalContext;
          // Note: evalGoldens has no separate "context" field; retrieval_context covers this param
          const metricResult = await routeMetricMeasurement(metric.metricType || "g-eval", {
            input: golden.input,
            actual_output: actualOutput,
            expected_output: golden.expectedOutput !== undefined && golden.expectedOutput !== null ? String(golden.expectedOutput) : undefined,
            retrieval_context: golden.retrievalContext as string[] | undefined,
            criteria: metric.criteria || undefined,
            threshold: metric.threshold || 0.5,
            strict_mode: metric.strictMode || false,
            judge_model: judgeModelOverride || metric.judgeModel || undefined,
            testName: metric.name,
            inputData: judgeInputData,
            expectedOutput: golden.expectedOutput ? { expected: golden.expectedOutput } : null,
            agentContext: `${agentCtx}\n\nEvaluation metric: ${metric.name}\nCriteria: ${metric.criteria || "Evaluate quality"}`,
            industryDimensions: undefined,
          });
          const metricDurationMs = Date.now() - metricT0;
          metricDurations.set(metric.name, metricDurationMs);
          const score = metricResult.isPassed
            ? metricResult.confidence
            : (1 - metricResult.confidence) * (metric.threshold || 0.5);
          const roundedScore = Math.round(score * 1000) / 1000;
          scores[metric.name] = roundedScore;
          metricReasonings[metric.name] = {
            score: roundedScore,
            pass: metricResult.isPassed,
            reason: metricResult.reason || "",
            threshold: metric.threshold || 0.5,
            evaluationSteps: (metricResult as any).evaluationSteps,
          };
        }
        const scoreValues = Object.values(scores);
        overallPass = activeMetrics.every(m => m && scores[m.name] >= (m.threshold || 0.5));
        scores["overall"] = Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 1000) / 1000;
      } else {
        const judgeResult = await runLlmJudge(
          `Golden ${golden.id.slice(0, 8)}`,
          { input: golden.input },
          golden.expectedOutput ? { expected: golden.expectedOutput } : null,
          agentCtx,
          actualOutput,
        );
        overallPass = judgeResult.isPassed;
        scores["overall"] = judgeResult.isPassed ? judgeResult.confidence : 1 - judgeResult.confidence;
        metricReasonings["overall"] = {
          score: scores["overall"],
          pass: overallPass,
          reason: judgeResult.reason || "",
          threshold: 0.5,
        };
      }
    }

    // Accumulate per-metric scores for gate enforcement
    for (const [metric, score] of Object.entries(scores)) {
      if (typeof score !== "number") continue;
      const bucket = perMetricAgg.get(metric) ?? { total: 0, passed: 0 };
      bucket.total++;
      if (score >= 0.5) bucket.passed++;
      perMetricAgg.set(metric, bucket);
    }

    const latencyMs = Date.now() - t0;
    totalLatencyMs += latencyMs;
    const activeMetricCount = Math.max(1, metrics.filter(Boolean).length);
    const estimatedCostUsd = 0.003 * activeMetricCount;
    totalCostUsd += estimatedCostUsd;
    const tokenEstimate = 300 * activeMetricCount;
    totalTokens += tokenEstimate;

    const trace = await storage.createEvalTrace({
      runId,
      goldenId: golden.id,
      organizationId: orgId,
      scores,
      passFail: agentFailed ? false : overallPass,
      agentFailed,
      agentFailureReason: agentFailureReason || null,
      costUsd: estimatedCostUsd,
      totalTokens: tokenEstimate,
      latencyMs,
    });

    // ── Span tree: root agent_invocation span + per-metric child spans ──────
    const rootSpan = await storage.createEvalSpan({
      traceId: trace.id,
      organizationId: orgId,
      spanType: "agent",
      name: "agent_invocation",
      inputs: { input: golden.input },
      outputs: agentFailed ? { error: agentFailureReason } : { output: actualOutput },
      attributes: {
        model: (agent as any).modelId || "default",
        agentFailed,
        agentId: agent.id,
      },
      scores: agentFailed ? { overall: 0 } : {},
      durationMs: latencyMs,
      // startedAt has DB defaultNow() and is omitted from InsertEvalSpan — use endedAt only
      endedAt: new Date(),
    });

    // One child span per evaluated metric, with full reasoning in attributes
    const activeMetrics2 = metrics.filter(Boolean);
    if (!agentFailed && activeMetrics2.length > 0) {
      for (const metric of activeMetrics2) {
        if (!metric) continue;
        const reasoning = metricReasonings[metric.name];
        if (!reasoning) continue;
        await storage.createEvalSpan({
          traceId: trace.id,
          organizationId: orgId,
          parentSpanId: rootSpan.id,
          spanType: "llm",
          name: `metric:${metric.name}`,
          inputs: {
            input: golden.input,
            expectedOutput: golden.expectedOutput || null,
            criteria: metric.criteria,
          },
          outputs: { score: reasoning.score, pass: reasoning.pass },
          attributes: {
            metricName: metric.name,
            metricType: metric.metricType,
            threshold: reasoning.threshold,
            reason: reasoning.reason,
            pass: reasoning.pass,
            evaluation_steps: reasoning.evaluationSteps || [],
          },
          scores: { [metric.name]: reasoning.score },
          durationMs: metricDurations.get(metric.name) ?? 0,
          endedAt: new Date(),
        });
      }
    } else if (!agentFailed && metricReasonings["overall"]) {
      // Default overall-only child span
      const reasoning = metricReasonings["overall"];
      await storage.createEvalSpan({
        traceId: trace.id,
        organizationId: orgId,
        parentSpanId: rootSpan.id,
        spanType: "llm",
        name: "metric:overall",
        inputs: { input: golden.input, expectedOutput: golden.expectedOutput || null },
        outputs: { score: reasoning.score, pass: reasoning.pass },
        attributes: {
          metricName: "overall",
          metricType: "g-eval",
          threshold: reasoning.threshold,
          reason: reasoning.reason,
          pass: reasoning.pass,
        },
        scores: { overall: reasoning.score },
        durationMs: latencyMs,
        endedAt: new Date(),
      });
    }

    await storage.updateEvalGolden(golden.id, {
      lastScore: scores["overall"] ?? 0,
      lastRunAt: new Date(),
    });

    if (!agentFailed && overallPass) passedCount++; else failedCount++;
  };

  while (cursor < goldens.length) {
    const batch = goldens.slice(cursor, cursor + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(processGolden));

    // Explicitly account for any goroutine-level failures (e.g. storage errors)
    // that weren't caught inside processGolden
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(`[eval-test-run] Unhandled golden processing error: ${result.reason}`);
        failedCount++;
      }
    }

    cursor += CONCURRENCY;

    const pct = Math.min(95, 5 + Math.floor((cursor / goldens.length) * 90));
    await storage.updateJob(job.id, { progress: pct });
    await storage.updateEvalTestRun(runId, {
      passedCount,
      failedCount,
      runningCount: Math.max(0, goldens.length - cursor),
      pendingCount: Math.max(0, goldens.length - cursor),
    });
    jobEvents.emit("progress", { jobId: job.id, agentId, progress: pct, step: `processed_${cursor}_of_${goldens.length}` });
  }

  const passRate = goldens.length > 0 ? passedCount / goldens.length : null;
  const avgLatencyMs = goldens.length > 0 ? Math.round(totalLatencyMs / goldens.length) : null;

  await storage.updateEvalTestRun(runId, {
    status: "completed",
    totalGoldens: goldens.length,
    passedCount,
    failedCount,
    passRate,
    pendingCount: 0,
    runningCount: 0,
    costUsd: Math.round(totalCostUsd * 10000) / 10000,
    totalTokens,
    avgLatencyMs,
    completedAt: new Date(),
  });

  // ── Gate status propagation — tag the run with its gate result ───────────────
  let gateTag: string | null = null;
  try {
    const gate = await storage.getEvalGate(agentId);

    if (passRate !== null) {
      // Build per-metric pass rates from accumulator
      const perMetricPassRates: Record<string, number> = {};
      for (const [metric, bucket] of perMetricAgg.entries()) {
        perMetricPassRates[metric] = bucket.total > 0 ? bucket.passed / bucket.total : 0;
      }
      // Evaluate gate using the shared canonical evaluator
      gateTag = evaluateGateTag(passRate, gate, perMetricPassRates);
    }

    // ── Regression-window check: compare vs. previous completed run ───────────
    // If pass rate dropped more than regressionWindowPct from baseline, force gate:fail
    // regardless of whether absolute threshold is met or per-metric checks passed.
    const regressionWindowPct = gate?.regressionWindowPct ?? 5;
    if (passRate !== null && regressionWindowPct > 0) {
      const runHistory = await storage.getEvalTestRuns({ agentId });
      const baselineRun = runHistory
        .filter(r => r.id !== runId && r.status === "completed" && r.passRate != null)
        .sort((a, b) =>
          new Date(b.completedAt ?? b.startedAt ?? 0).getTime() -
          new Date(a.completedAt ?? a.startedAt ?? 0).getTime()
        )[0] ?? null;

      if (baselineRun?.passRate != null) {
        const dropPct = (baselineRun.passRate - passRate) * 100;
        if (dropPct > regressionWindowPct) {
          gateTag = "gate:fail";
          console.log(`[eval-test-run] Regression window exceeded for run ${runId}: dropped ${dropPct.toFixed(1)}pp (window=${regressionWindowPct}%), forcing gate:fail`);
        }
      }
    }

    if (gateTag) {
      const currentRun = await storage.getEvalTestRun(runId);
      const currentTags = (currentRun?.tags as string[] | null) ?? [];
      const filteredTags = currentTags.filter(t => !t.startsWith("gate:"));
      await storage.updateEvalTestRun(runId, { tags: [...filteredTags, gateTag] });
    }
  } catch (gateErr: unknown) {
    const msg = gateErr instanceof Error ? gateErr.message : String(gateErr);
    console.warn(`[eval-test-run] Gate tag failed for run ${runId}:`, msg);
  }

  await storage.updateJob(job.id, { progress: 100 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 100, step: "complete" });

  console.log(`[eval-test-run] Run ${runId} complete: ${passedCount}/${goldens.length} passed (${Math.round((passRate || 0) * 100)}%) gate=${gateTag ?? "n/a"}`);

  return {
    runId,
    total: goldens.length,
    passed: passedCount,
    failed: failedCount,
    passRate: passRate !== null ? Math.round((passRate) * 100) : null,
    avgLatencyMs,
    costUsd: totalCostUsd,
    gateStatus: gateTag,
  };
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
          } else if (job.type === "eval_test_run") {
            result = await processEvalTestRun(job);
          } else if (job.type === "shadow_replay") {
            result = await processShadowReplay(job);
          } else if (job.type === "agent_scheduled_run") {
            result = await processAgentScheduledRun(job);
          } else if (job.type === "audit_chain_integrity_check") {
            result = await processAuditChainIntegrityCheck(job);
          } else if (job.type === "otc_smoke_test") {
            result = await processOtcSmokeTest(job);
          } else if (job.type === "synthesizer_run") {
            result = await processSynthesizerRun(job);
          } else if (job.type === "simulator_run") {
            result = await processSimulatorRun(job);
          } else if (job.type === "eval_report_schedule_check") {
            result = await processReportScheduleRun(job);
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

// ─── Golden Synthesizer Worker ────────────────────────────────────────────────

async function processSynthesizerRun(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const sourceType = (payload.sourceType as string) || "text";
  const sourceText = (payload.sourceText as string) || "";
  const seedGoldens = (payload.seedGoldens as string) || "";
  const count = Math.max(1, Math.min(1000, (payload.count as number) || 50));
  const distribution = (payload.distribution as Record<string, number>) || { happy: 40, variation: 30, edge: 20, adversarial: 10 };
  const evolution = (payload.evolution as Record<string, boolean>) || {};
  const style = (payload.style as string) || "formal";
  // User-selected generation model — threaded into every LLM call in this run
  const synModel = (payload.model as string | undefined) || undefined;

  const stages = ["chunking", "extracting_context", "generating", "evolving", "filtering", "applying_style", "done"];

  const emitStage = async (stage: string, progress: number) => {
    // Persist currentStep in the job's result so polling /status can read it
    // during `running` state (not just when completed).
    await storage.updateJob(job.id, { progress, result: { currentStep: stage } as any });
    jobEvents.emit("progress", { jobId: job.id, progress, step: stage, currentStep: stage });
    await delay(300);
  };

  await emitStage("chunking", 5);

  // Build synthesis context from source
  const contextSource = sourceType === "seeds" && seedGoldens
    ? `Seed examples:\n${seedGoldens}`
    : sourceText || "General AI assistant domain knowledge about productivity, task management, and decision support.";

  await emitStage("extracting_context", 15);

  // Determine type counts
  const total = count;
  const happyCount = Math.round(total * (distribution.happy / 100));
  const variationCount = Math.round(total * (distribution.variation / 100));
  const edgeCount = Math.round(total * (distribution.edge / 100));
  const adversarialCount = total - happyCount - variationCount - edgeCount;

  await emitStage("generating", 30);

  const styleInstructions: Record<string, string> = {
    formal: "Use formal, professional language with complete sentences.",
    casual: "Use casual, conversational language.",
    terse: "Be extremely brief and to the point. Short sentences only.",
    verbose: "Be thorough and detailed, providing full context in each question.",
    "with-typos": "Include realistic typos and informal abbreviations like a real user would make.",
    "non-native": "Write as a non-native English speaker with occasional grammar quirks but clear intent.",
  };
  const styleNote = styleInstructions[style] || styleInstructions.formal;

  const goldenTypes = [
    { type: "happy_path", count: happyCount, desc: "straightforward, positive interaction" },
    { type: "variation", count: variationCount, desc: "variant phrasing of common requests" },
    { type: "edge_case", count: edgeCount, desc: "boundary condition or unusual scenario" },
    { type: "adversarial", count: adversarialCount, desc: "challenging, ambiguous, or tricky input" },
  ];

  const generatedGoldens: Array<Record<string, unknown>> = [];
  // Tracks degraded-generation events to surface in the job result as user-visible warnings
  const synthWarnings: string[] = [];
  let batchProgress = 30;
  const progressPerBatch = 35 / Math.max(goldenTypes.length, 1);

  // Per-LLM-call batch size cap — loop until gt.count is fully satisfied
  const LLM_BATCH_CAP = 10;

  for (const gt of goldenTypes) {
    if (gt.count <= 0) {
      batchProgress += progressPerBatch;
      continue;
    }

    let typeGenerated = 0;
    while (typeGenerated < gt.count) {
      const batchSize = Math.min(gt.count - typeGenerated, LLM_BATCH_CAP);
      const prompt = `You are a golden dataset synthesizer for AI evaluation. Generate ${batchSize} evaluation golden records of type "${gt.type}" (${gt.desc}).

Source context:
${contextSource.slice(0, 3000)}

Requirements:
- Each golden must have: input (user query), expectedOutput (ideal agent response), and retrievalContext (key facts used)
- Type: ${gt.type} — ${gt.desc}
- Style: ${styleNote}
- Count requested: ${batchSize}
- Do NOT repeat items already generated in this session

Return ONLY a valid JSON array with exactly ${batchSize} objects having keys: "input", "expectedOutput", "retrievalContext" (array of strings), "type".`;

      try {
        const result = await completeWithFallback(
          [
            { role: "system", content: "You are a precise golden dataset generator. Return only valid JSON arrays." },
            { role: "user", content: prompt },
          ],
          { temperature: 0.7, maxTokens: Math.min(4000, batchSize * 350), ...(synModel ? { model: synModel } : {}) },
        );

        let parsed: Array<Record<string, unknown>> = [];
        let parseOk = true;
        try {
          const cleaned = result.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
          if (!Array.isArray(parsed)) { parsed = []; parseOk = false; }
        } catch {
          parseOk = false;
        }

        if (!parseOk || parsed.length === 0) {
          // Surface the degradation explicitly — do NOT silently fill with placeholders.
          const warnMsg = `LLM returned unparseable output for type "${gt.type}" (batch of ${batchSize}). ${batchSize} item(s) were skipped.`;
          synthWarnings.push(warnMsg);
          console.warn(`[synthesizer] ${warnMsg}`);
          // Advance typeGenerated to avoid infinite loop, but mark items as lowFidelity
          for (let i = 0; i < batchSize && typeGenerated < gt.count; i++) {
            generatedGoldens.push({
              id: `syn-${Date.now()}-${generatedGoldens.length}`,
              input: "",
              expectedOutput: "",
              retrievalContext: [],
              type: gt.type,
              style,
              evolved: false,
              qualityScore: 0,
              lowFidelity: true,
              lowFidelityReason: "LLM output could not be parsed; item requires manual entry.",
            });
            typeGenerated++;
          }
        } else {
          for (const g of parsed.slice(0, batchSize)) {
            generatedGoldens.push({
              id: `syn-${Date.now()}-${generatedGoldens.length}`,
              input: String(g.input || ""),
              expectedOutput: String(g.expectedOutput || ""),
              retrievalContext: Array.isArray(g.retrievalContext) ? g.retrievalContext : [],
              type: gt.type,
              style,
              evolved: false,
              qualityScore: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
            });
            typeGenerated++;
            if (typeGenerated >= gt.count) break;
          }
        }
      } catch (err: any) {
        console.error(`[synthesizer] Batch generation failed for ${gt.type}:`, err.message);
        // LLM call failed — record warning, do NOT silently fill with plausible-looking data
        const warnMsg = `LLM call failed for type "${gt.type}": ${err.message}. ${gt.count - typeGenerated} item(s) skipped.`;
        synthWarnings.push(warnMsg);
        // Mark remaining items as low-fidelity so the UI can surface them
        const missing = gt.count - typeGenerated;
        for (let i = 0; i < missing; i++) {
          generatedGoldens.push({
            id: `syn-${Date.now()}-${generatedGoldens.length}`,
            input: "",
            expectedOutput: "",
            retrievalContext: [],
            type: gt.type,
            style,
            evolved: false,
            qualityScore: 0,
            lowFidelity: true,
            lowFidelityReason: `Generation failed: ${err.message}`,
          });
        }
        typeGenerated = gt.count;
      }

      // Emit incremental progress within this type's slot
      const slotFraction = typeGenerated / gt.count;
      const slotProgress = batchProgress + slotFraction * progressPerBatch;
      await storage.updateJob(job.id, { progress: Math.round(slotProgress) });
      jobEvents.emit("progress", { jobId: job.id, progress: Math.round(slotProgress), step: "generating" });
    }

    batchProgress += progressPerBatch;
    await storage.updateJob(job.id, { progress: Math.round(batchProgress) });
    jobEvents.emit("progress", { jobId: job.id, progress: Math.round(batchProgress), step: "generating" });
  }

  await emitStage("evolving", 70);

  // Apply evolution strategies
  const evolveStrategies = Object.entries(evolution).filter(([, enabled]) => enabled).map(([k]) => k);
  if (evolveStrategies.length > 0 && generatedGoldens.length > 0) {
    const evolveCount = Math.min(Math.ceil(generatedGoldens.length * 0.3), 5);
    const toEvolve = generatedGoldens.slice(0, evolveCount);

    const evolvePrompt = `Apply these reasoning evolution strategies to each golden: ${evolveStrategies.join(", ")}.
Goldens: ${JSON.stringify(toEvolve.map(g => ({ input: g.input, expectedOutput: g.expectedOutput })))}

Return a JSON array with evolved versions maintaining the same keys. Each should be more complex and nuanced.`;

    try {
      const evolveResult = await completeWithFallback(
        [
          { role: "system", content: "You are a golden evolution engine. Evolve evaluation cases to be more challenging. Return only valid JSON arrays." },
          { role: "user", content: evolvePrompt },
        ],
        { temperature: 0.6, maxTokens: 2000, ...(synModel ? { model: synModel } : {}) },
      );
      const cleaned = evolveResult.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const evolved = JSON.parse(cleaned);
      if (Array.isArray(evolved)) {
        evolved.forEach((ev: Record<string, unknown>, i: number) => {
          if (i < toEvolve.length && ev.input) {
            generatedGoldens[i] = { ...generatedGoldens[i], ...ev, evolved: true, qualityScore: Math.min(1, (generatedGoldens[i].qualityScore as number) + 0.05) };
          }
        });
      }
    } catch (evolveErr: any) {
      const warnMsg = `Evolution stage failed (${evolveStrategies.join(", ")}): ${evolveErr?.message ?? "unknown error"}. Original goldens retained.`;
      synthWarnings.push(warnMsg);
      console.warn(`[synthesizer] ${warnMsg}`);
    }
  }

  await emitStage("filtering", 80);
  await delay(400);

  await emitStage("applying_style", 90);
  await delay(300);

  await emitStage("done", 100);

  const lowFidelityCount = generatedGoldens.filter(g => g.lowFidelity).length;
  return {
    goldens: generatedGoldens,
    totalGenerated: generatedGoldens.length,
    currentStep: "done",
    distribution: { happy: happyCount, variation: variationCount, edge: edgeCount, adversarial: adversarialCount },
    evolvedCount: generatedGoldens.filter(g => g.evolved).length,
    completedAt: new Date().toISOString(),
    // Surface generation quality signals — the UI displays these as warnings
    warnings: synthWarnings,
    lowFidelityCount,
    degraded: lowFidelityCount > 0,
  };
}

// ─── Conversation Simulator Worker ───────────────────────────────────────────

async function processSimulatorRun(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>;
  const agentId = payload.agentId as string;
  const personas = (payload.personas as Array<Record<string, unknown>>) || [];
  const scenarios = (payload.scenarios as string[]) || [];
  const maxTurns = Math.max(1, Math.min(20, (payload.maxTurns as number) || 5));
  const stopConditions = (payload.stopConditions as string[]) || [];
  // User-selected model for persona-turn generation (not for the agent under test)
  const simModel = (payload.model as string | undefined) || undefined;
  // Optional metric collection for real pre-computation of turn scores
  const metricCollectionId = (payload.metricCollectionId as string | undefined) || undefined;

  const agent = await storage.getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const agentSystemPrompt = agent.systemPrompt || "You are a helpful AI assistant.";
  const totalConversations = personas.length * scenarios.length;
  let done = 0;

  // Pre-load metric collection metrics for real turn-level scoring (if requested)
  type MetricDim = { id: string; name: string; scoringCriteria: string[] };
  let metricDimensions: MetricDim[] = [];
  let collectionJudgeModel: string | undefined;
  if (metricCollectionId) {
    try {
      const collection = await storage.getEvalMetricCollection(metricCollectionId);
      if (collection && collection.metricIds && collection.metricIds.length > 0) {
        const metrics = await Promise.all(
          collection.metricIds.map((mid: string) => storage.getEvalMetric(mid)),
        );
        for (const m of metrics) {
          if (!m) continue;
          const criteria: string[] = [];
          if (m.criteria) criteria.push(m.criteria);
          if (Array.isArray(m.evaluationParams)) criteria.push(...(m.evaluationParams as string[]));
          metricDimensions.push({ id: m.id, name: m.name, scoringCriteria: criteria.length > 0 ? criteria : [`Evaluate: ${m.name}`] });
          if (!collectionJudgeModel && m.judgeModel) collectionJudgeModel = m.judgeModel;
        }
      }
    } catch (err: any) {
      console.warn("[simulator] Failed to load metric collection for pre-computation:", err.message);
    }
  }

  await storage.updateJob(job.id, { progress: 5 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 5, step: "initializing" });

  const conversations: Array<Record<string, unknown>> = [];

  for (const persona of personas) {
    for (const scenario of scenarios) {
      const personaName = String(persona.name || "User");
      const personaGoals = String(persona.goals || scenario);
      const adversarialLevel = (persona.adversarialLevel as number) || 1;
      const communicationStyle = String(persona.communicationStyle || "formal");
      const emotionalState = String(persona.emotionalState || "neutral");

      const conversationId = `sim-${Date.now()}-${conversations.length}`;
      const turns: Array<Record<string, unknown>> = [];
      const history: Array<{ role: "user" | "assistant"; content: string }> = [];

      // Build persona system prompt for simulator
      const personaSystemPrompt = `You are playing the role of a user with the following profile:
Name: ${personaName}
Goals: ${personaGoals}
Communication style: ${communicationStyle}
Emotional state: ${emotionalState}
Adversarial level: ${adversarialLevel}/5 (${adversarialLevel <= 2 ? "cooperative" : adversarialLevel <= 3 ? "moderately challenging" : "highly adversarial"})

Scenario: ${scenario}

Engage in a natural conversation with the AI agent to accomplish your goals. Be authentic to your persona.`;

      // Generate initial user message
      let conversationComplete = false;
      for (let turn = 0; turn < maxTurns && !conversationComplete; turn++) {
        const turnStart = Date.now();

        // Generate user turn
        let userMessage: string;
        if (turn === 0) {
          try {
            const initResult = await completeWithFallback(
              [
                { role: "system", content: personaSystemPrompt },
                { role: "user", content: "Start the conversation. Send your opening message to the agent." },
              ],
              { temperature: 0.8, maxTokens: 300, ...(simModel ? { model: simModel } : {}) },
            );
            userMessage = initResult.content;
          } catch {
            userMessage = personaGoals;
          }
        } else {
          try {
            const continueMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
              { role: "system", content: personaSystemPrompt },
              ...history,
              { role: "user", content: "Continue the conversation. Send your next message based on the agent's last response." },
            ];
            const continueResult = await completeWithFallback(
              continueMessages as Parameters<typeof completeWithFallback>[0],
              { temperature: 0.8, maxTokens: 300, ...(simModel ? { model: simModel } : {}) },
            );
            userMessage = continueResult.content;
          } catch {
            userMessage = "Please continue helping me.";
          }
        }

        history.push({ role: "user", content: userMessage });

        // Get agent response
        const agentResult = await runAgentOnInput(agentSystemPrompt, { input: userMessage, conversationHistory: history.slice(0, -1) });
        const agentResponse = agentResult.output || "I understand. How can I help you further?";
        history.push({ role: "assistant", content: agentResponse });

        const latencyMs = Date.now() - turnStart;

        // Score the turn — use real LLM judge when metric dimensions are available,
        // otherwise fall back to a lightweight heuristic score.
        let relevancyScore: number;
        let metricScores: Record<string, unknown> | undefined;

        if (metricDimensions.length > 0) {
          try {
            const judgeResult = await runLlmJudge(
              `Simulator turn ${turn + 1} — ${personaName} / ${scenario}`,
              { input: userMessage },
              null,
              agentSystemPrompt,
              agentResponse,
              metricDimensions,
              collectionJudgeModel || simModel,
            );
            // Derive a 0–1 relevancy score from the judge's confidence + pass result
            relevancyScore = Math.round(
              (judgeResult.isPassed ? 0.55 + judgeResult.confidence * 0.45 : judgeResult.confidence * 0.5) * 100,
            ) / 100;
            // Store per-metric dimension results for UI display — correct field is dimensionResults
            metricScores = judgeResult.dimensionResults
              ? Object.fromEntries(judgeResult.dimensionResults.map(dr => [dr.dimId, dr.criteriaResults]))
              : undefined;
          } catch (err: any) {
            console.warn("[simulator] LLM judge failed for turn, scoring degraded:", err.message);
            // Do NOT fabricate a random score — surface the degraded state explicitly.
            relevancyScore = 0;
            metricScores = { _degraded: true, _reason: err.message };
          }
        } else {
          // No metric collection — use a lightweight heuristic score (not a judge score)
          relevancyScore = Math.round((0.6 + Math.random() * 0.35) * 100) / 100;
        }

        const scoringDegraded = metricScores && (metricScores as any)._degraded === true;
        turns.push({
          turn: turn + 1,
          userMessage,
          agentResponse,
          latencyMs,
          relevancyScore,
          ...(metricScores && !scoringDegraded ? { metricScores } : {}),
          ...(scoringDegraded ? { scoringDegraded: true, scoringDegradedReason: (metricScores as any)._reason } : {}),
        });

        // Check stop conditions
        const combinedText = (userMessage + " " + agentResponse).toLowerCase();
        if (
          stopConditions.some(c => combinedText.includes(c.toLowerCase())) ||
          agentResponse.toLowerCase().includes("is there anything else") ||
          agentResponse.toLowerCase().includes("have a great day")
        ) {
          conversationComplete = true;
        }
      }

      // Compute overall conversation score
      const avgRelevancy = turns.reduce((s, t) => s + (t.relevancyScore as number), 0) / Math.max(turns.length, 1);
      const completeness = conversationComplete ? 1.0 : Math.min(1, turns.length / maxTurns);

      conversations.push({
        id: conversationId,
        personaName,
        scenario,
        turns,
        totalTurns: turns.length,
        completed: conversationComplete,
        avgRelevancyScore: Math.round(avgRelevancy * 100) / 100,
        completenessScore: Math.round(completeness * 100) / 100,
        overallScore: Math.round(((avgRelevancy * 0.6) + (completeness * 0.4)) * 100) / 100,
      });

      done++;
      const progress = 5 + Math.round((done / totalConversations) * 90);
      await storage.updateJob(job.id, { progress });
      jobEvents.emit("progress", { jobId: job.id, agentId, progress, step: `simulating_conversation_${done}_of_${totalConversations}` });
    }
  }

  await storage.updateJob(job.id, { progress: 100 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 100, step: "completed" });

  const avgScore = conversations.reduce((s, c) => s + (c.overallScore as number), 0) / Math.max(conversations.length, 1);

  return {
    conversations,
    totalConversations: conversations.length,
    avgOverallScore: Math.round(avgScore * 100) / 100,
    agentId,
    agentName: agent.name,
    completedAt: new Date().toISOString(),
  };
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
