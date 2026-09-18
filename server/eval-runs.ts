/**
 * Starting an Eval Studio run and summarising one, shared by the Eval Studio
 * routes and the Astra Workspace. Callers check that the dataset and agent
 * belong to the caller's organization before starting a run.
 */
import { storage } from "./storage";
import type { EvalDataset } from "@shared/schema";

export interface StartEvalRunInput {
  orgId: string | undefined;
  agentId: string;
  dataset: EvalDataset;
  agentVersion?: string;
  datasetVersion?: number;
  metricCollectionId?: string | null;
  metricIds?: string[];
  judgeModelOverride?: string | null;
  parallelism?: number;
  cacheEnabled?: boolean;
  tags?: string[];
  triggeredBy?: string;
}

/** Create the run (pending) and queue the eval_test_run job the worker executes. */
export async function startEvalRun(input: StartEvalRunInput) {
  const { dataset } = input;
  const run = await storage.createEvalTestRun({
    organizationId: input.orgId,
    agentId: input.agentId,
    agentVersion: input.agentVersion || "latest",
    datasetId: dataset.id,
    datasetVersion: input.datasetVersion || dataset.version,
    metricCollectionId: input.metricCollectionId || null,
    metricIds: input.metricIds,
    judgeModelOverride: input.judgeModelOverride || null,
    parallelism: input.parallelism,
    cacheEnabled: input.cacheEnabled,
    tags: input.tags,
    status: "pending",
    totalGoldens: dataset.goldenCount || 0,
    pendingCount: dataset.goldenCount || 0,
    runningCount: 0,
    passedCount: 0,
    failedCount: 0,
    triggeredBy: input.triggeredBy || "user",
  } as any);

  await storage.createJob({
    type: "eval_test_run",
    status: "queued",
    agentId: input.agentId,
    payload: {
      runId: run.id,
      agentId: input.agentId,
      datasetId: dataset.id,
      metricIds: input.metricIds,
      judgeModelOverride: input.judgeModelOverride || null,
      parallelism: input.parallelism,
      organizationId: input.orgId,
    },
  } as any);

  return run;
}

export interface MetricSummaryRow {
  metric: string;
  total: number;
  passed: number;
  passRate: number | null;
  avgScore: number | null;
}

/** Per-metric pass rates from a run's traces (a score of 0.5 or more passes). Pure. */
export function summarizeMetrics(traces: Array<{ scores: unknown }>): MetricSummaryRow[] {
  const buckets = new Map<string, { total: number; passed: number; scoreSum: number }>();
  for (const trace of traces) {
    const scores = trace.scores as Record<string, number> | null;
    if (!scores) continue;
    for (const [metric, score] of Object.entries(scores)) {
      if (typeof score !== "number") continue;
      const b = buckets.get(metric) ?? { total: 0, passed: 0, scoreSum: 0 };
      b.total++;
      b.scoreSum += score;
      if (score >= 0.5) b.passed++;
      buckets.set(metric, b);
    }
  }
  const summary = Array.from(buckets.entries()).map(([metric, b]) => ({
    metric,
    total: b.total,
    passed: b.passed,
    passRate: b.total > 0 ? b.passed / b.total : null,
    avgScore: b.total > 0 ? Math.round((b.scoreSum / b.total) * 1000) / 1000 : null,
  }));
  // "overall" last, the rest alphabetically.
  summary.sort((a, b) => (a.metric === "overall" ? 1 : b.metric === "overall" ? -1 : a.metric.localeCompare(b.metric)));
  return summary;
}
