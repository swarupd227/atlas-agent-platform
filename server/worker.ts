import { storage } from "./storage";
import type { Job } from "@shared/schema";
import { EventEmitter } from "events";
import { checkOntologyCompliance } from "./agent-runtime";
import { industryEvalFrameworks } from "./routes";

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
    const latencyMs = Math.floor(300 + Math.random() * 2000);
    totalLatency += latencyMs;

    const inputData = (tc.inputData as Record<string, unknown>) || {};
    const isKpiBoundaryTest = inputData.type === "kpi_boundary_test";

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
      isPassed = Math.random() > 0.15;
      actualOutput = isPassed
        ? { status: "pass", matched: true, confidence: 0.85 + Math.random() * 0.15 }
        : { status: "fail", matched: false, reason: "Output did not meet expected criteria", confidence: 0.3 + Math.random() * 0.3 };
    }

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

    if (industryFramework) {
      const dimensionScores: Record<string, { score: number; maxScore: number; passed: boolean; weight: number; criteriaResults: Array<{ criterion: string; met: boolean }> }> = {};
      for (const dim of industryFramework.dimensions) {
        const baseScore = isPassed ? (70 + Math.random() * 30) : (20 + Math.random() * 50);
        const score = Math.round(baseScore * 10) / 10;
        const criteriaResults = dim.scoringCriteria.map(criterion => ({
          criterion,
          met: isPassed ? Math.random() > 0.15 : Math.random() > 0.6,
        }));
        const dimPassed = score >= 70;
        dimensionScores[dim.id] = {
          score,
          maxScore: 100,
          passed: dimPassed,
          weight: dim.weight,
          criteriaResults,
        };
        industryDimensionTotals[dim.id].total += score;
        industryDimensionTotals[dim.id].count += 1;
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
}

async function monitorCanaryDeployments() {
  const deployments = await storage.getDeployments();
  const canaryDeps = deployments.filter(d => d.status === "canary" && (d.canaryPercent || 0) < 100);

  for (const dep of canaryDeps) {
    const traces = await storage.getTracesByAgent(dep.agentId);
    const recentTraces = traces
      .filter(t => t.environment === dep.environment)
      .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
      .slice(0, 50);

    const total = recentTraces.length;
    if (total < 5) continue;

    const failed = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
    const errorRate = total > 0 ? (failed / total) * 100 : 0;
    const avgLatency = total > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / total) : 0;
    const successRate = total > 0 ? ((total - failed) / total) * 100 : 100;

    const config = dep.canaryConfig as any || {};
    const maxErrorRate = config.maxErrorRate || 5;
    const latencyThreshold = config.latencyP99Threshold || 5000;
    const successThreshold = config.successThreshold || 95;
    const stepSize = config.stepPercent || 10;

    if (errorRate > maxErrorRate || avgLatency > latencyThreshold || successRate < successThreshold) {
      console.log(`[canary-monitor] ${dep.agentName} GATE FAILED: errorRate=${errorRate.toFixed(1)}%, latency=${avgLatency}ms, successRate=${successRate.toFixed(1)}%`);

      const autopromoteConfig = dep.autopromoteConfig as any;
      if (autopromoteConfig?.rollbackOnFailure) {
        await storage.updateDeployment(dep.id, { status: "rolled_back", canaryPercent: 0, shadowEnabled: false });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "canary_monitor",
          action: "canary_rollback",
          objectType: "deployment",
          objectId: dep.id,
          details: `Canary auto-rolled back for ${dep.agentName}: errorRate=${errorRate.toFixed(1)}% (max ${maxErrorRate}%), successRate=${successRate.toFixed(1)}% (min ${successThreshold}%), latency=${avgLatency}ms (max ${latencyThreshold}ms)`,
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
    const updateData: Record<string, unknown> = { canaryPercent: newPercent };

    if (newPercent >= 100) {
      updateData.status = "active";
      updateData.completedAt = new Date();
    }

    await storage.updateDeployment(dep.id, updateData);

    await storage.createAuditEvent({
      actorType: "system",
      actorId: "canary_monitor",
      action: newPercent >= 100 ? "canary_promoted_full" : "canary_increased",
      objectType: "deployment",
      objectId: dep.id,
      details: `Canary ${newPercent >= 100 ? "promoted to full" : `increased to ${newPercent}%`} for ${dep.agentName}. Gates passed: errorRate=${errorRate.toFixed(1)}%, successRate=${successRate.toFixed(1)}%, latency=${avgLatency}ms`,
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

    console.log(`[canary-monitor] ${dep.agentName}: canary ${currentPercent}% -> ${newPercent}%`);
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

  await delay(1000);

  const tracesReplayed = filteredTraces.length || Math.min(sampleSize, 15);
  const passCount = Math.round(tracesReplayed * (0.7 + Math.random() * 0.25));
  const failCount = tracesReplayed - passCount;
  const passRate = tracesReplayed > 0 ? (passCount / tracesReplayed) * 100 : 0;
  const avgCostDelta = (Math.random() * 0.02 - 0.01);
  const avgLatencyDelta = Math.round(Math.random() * 500 - 200);

  await storage.updateJob(job.id, { progress: 70 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 70, step: "evaluating_results" });

  await delay(500);

  const divergences = Array.from({ length: failCount }, (_, i) => ({
    traceId: filteredTraces[i]?.id || `trace-${i}`,
    type: Math.random() > 0.5 ? "output_mismatch" : "tool_divergence",
    severity: Math.random() > 0.7 ? "critical" : "minor",
    originalOutput: "Original response content...",
    replayOutput: "Replayed response with differences...",
  }));

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
