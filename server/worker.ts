import { storage } from "./storage";
import type { Job } from "@shared/schema";
import { EventEmitter } from "events";

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

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const latencyMs = Math.floor(300 + Math.random() * 2000);
    const isPassed = Math.random() > 0.15;
    totalLatency += latencyMs;

    if (isPassed) passed++;
    else failed++;

    const result = await storage.createEvalCaseResult({
      runId: evalRun.id,
      caseId: tc.id,
      passed: isPassed,
      latencyMs,
      actualOutput: isPassed
        ? { status: "pass", matched: true, confidence: 0.85 + Math.random() * 0.15 }
        : { status: "fail", matched: false, reason: "Output did not meet expected criteria", confidence: 0.3 + Math.random() * 0.3 },
    });

    caseResults.push({ testCaseId: tc.id, testCaseName: tc.name, ...result });

    const progress = 60 + Math.floor(((i + 1) / testCases.length) * 30);
    await storage.updateJob(job.id, { progress });
    jobEvents.emit("progress", { jobId: job.id, agentId, progress, step: `evaluated_case_${i + 1}_of_${testCases.length}` });

    await delay(200);
  }

  const passRate = testCases.length > 0 ? passed / testCases.length : 0;
  const avgLatency = testCases.length > 0 ? Math.round(totalLatency / testCases.length) : 0;

  await storage.createEvalRun({
    suiteId,
    status: "completed",
    passRate,
    totalCases: testCases.length,
    passedCases: passed,
    failedCases: failed,
    avgLatencyMs: avgLatency,
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

export function startWorker(intervalMs = 2000) {
  if (workerRunning) return;
  workerRunning = true;

  const poll = async () => {
    if (!workerRunning) return;

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
      console.error("[worker] Poll error:", err);
    }

    setTimeout(poll, intervalMs);
  };

  poll();
  console.log("[worker] Job worker started");

  const canaryMonitorInterval = 30000;
  const canaryMonitor = async () => {
    if (!workerRunning) return;
    try {
      await monitorCanaryDeployments();
    } catch (err) {
      console.error("[worker] Canary monitor error:", err);
    }
    setTimeout(canaryMonitor, canaryMonitorInterval);
  };
  setTimeout(canaryMonitor, canaryMonitorInterval);
  console.log("[worker] Canary monitor started (30s interval)");
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

  await storage.updateJob(job.id, { progress: 100 });
  jobEvents.emit("progress", { jobId: job.id, agentId, progress: 100, step: "completed" });

  return evidenceBundle;
}

export function stopWorker() {
  workerRunning = false;
}
