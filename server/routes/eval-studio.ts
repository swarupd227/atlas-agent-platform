import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { runLlmJudge, runAgentOnInput, buildAgentContext } from "../eval-judge";
import type {
  InsertEvalMetric,
  InsertEvalDataset,
  InsertEvalGolden,
  InsertEvalTestRun,
} from "@shared/schema";

const router = Router();

// ── Metric Catalog ──────────────────────────────────────────────────────────

router.get("/api/eval/metrics", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { category, source, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const metrics = await storage.getEvalMetrics({
      organizationId: orgId,
      category,
      source,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/metrics/:id", async (req, res) => {
  try {
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    res.json(metric);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const data: InsertEvalMetric = {
      ...req.body,
      organizationId: orgId,
      source: "tenant-private",
    };
    const metric = await storage.createEvalMetric(data);
    res.status(201).json(metric);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/metrics/:id", async (req, res) => {
  try {
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    if (metric.source !== "tenant-private") {
      return res.status(403).json({ message: "Only tenant-private metrics can be edited" });
    }
    const updated = await storage.updateEvalMetric(req.params.id, {
      ...req.body,
      version: (metric.version || 1) + 1,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/:id/attach", async (req, res) => {
  try {
    const { agentId, scope = "end-to-end" } = req.body;
    if (!agentId) return res.status(400).json({ message: "agentId is required" });
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });

    await storage.updateEvalMetric(req.params.id, {
      usageCount: (metric.usageCount || 0) + 1,
    });

    res.json({ success: true, metricId: req.params.id, agentId, scope });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/preview", async (req, res) => {
  try {
    const { metricConfig, sampleInput, sampleActualOutput, sampleExpectedOutput } = req.body;
    if (!sampleInput) return res.status(400).json({ message: "sampleInput is required" });

    const startMs = Date.now();
    const judgeResult = await runLlmJudge(
      metricConfig?.name || "Preview",
      { input: sampleInput },
      sampleExpectedOutput ? { expected: sampleExpectedOutput } : null,
      `Metric criteria: ${metricConfig?.criteria || "Evaluate the response quality"}`,
      sampleActualOutput || null,
    );

    res.json({
      score: judgeResult.isPassed ? judgeResult.confidence : 1 - judgeResult.confidence,
      pass: judgeResult.isPassed,
      reasoning: judgeResult.reason,
      latencyMs: Date.now() - startMs,
      estimatedCostUsd: 0.002,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Metric Collections ───────────────────────────────────────────────────────

router.get("/api/eval/metric-collections", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const collections = await storage.getEvalMetricCollections(orgId);
    res.json(collections);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metric-collections", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const collection = await storage.createEvalMetricCollection({
      ...req.body,
      organizationId: orgId,
    });
    res.status(201).json(collection);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Datasets ────────────────────────────────────────────────────────────────

router.get("/api/eval/datasets", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.query as Record<string, string>;
    const datasets = await storage.getEvalDatasets({ organizationId: orgId, agentId });
    res.json(datasets);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/datasets/:id", async (req, res) => {
  try {
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    res.json(dataset);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/datasets", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const data: InsertEvalDataset = { ...req.body, organizationId: orgId };
    const dataset = await storage.createEvalDataset(data);
    res.status(201).json(dataset);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/datasets/:id", async (req, res) => {
  try {
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    const updated = await storage.updateEvalDataset(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Goldens ──────────────────────────────────────────────────────────────────

router.get("/api/eval/datasets/:id/goldens", async (req, res) => {
  try {
    const { page = "1", limit = "50", search } = req.query as Record<string, string>;
    const goldens = await storage.getEvalGoldens({
      datasetId: req.params.id,
      page: parseInt(page),
      limit: parseInt(limit),
      search,
    });
    res.json(goldens);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/datasets/:id/goldens", async (req, res) => {
  try {
    const data: InsertEvalGolden = { ...req.body, datasetId: req.params.id };
    const golden = await storage.createEvalGolden(data);
    await storage.incrementEvalDatasetGoldenCount(req.params.id);
    res.status(201).json(golden);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/api/eval/datasets/:id/goldens/bulk", async (req, res) => {
  try {
    const { goldens } = req.body as { goldens: InsertEvalGolden[] };
    if (!Array.isArray(goldens) || goldens.length === 0) {
      return res.status(400).json({ message: "goldens array is required" });
    }
    const created = await storage.bulkCreateEvalGoldens(
      goldens.map(g => ({ ...g, datasetId: req.params.id }))
    );
    await storage.updateEvalDataset(req.params.id, { goldenCount: created.length });
    res.status(201).json({ created: created.length, goldens: created });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/goldens/:id", async (req, res) => {
  try {
    const golden = await storage.getEvalGolden(req.params.id);
    if (!golden) return res.status(404).json({ message: "Golden not found" });
    const updated = await storage.updateEvalGolden(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.delete("/api/eval/goldens/:id", async (req, res) => {
  try {
    const golden = await storage.getEvalGolden(req.params.id);
    if (!golden) return res.status(404).json({ message: "Golden not found" });
    await storage.deleteEvalGolden(req.params.id);
    await storage.decrementEvalDatasetGoldenCount(golden.datasetId);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Test Runs ────────────────────────────────────────────────────────────────

router.get("/api/eval/runs", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId, datasetId } = req.query as Record<string, string>;
    const runs = await storage.getEvalTestRuns({ organizationId: orgId, agentId, datasetId });
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/runs", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId, agentVersion, datasetId, datasetVersion, metricCollectionId, metricIds, judgeModelOverride, parallelism, cacheEnabled, tags, triggeredBy } = req.body;

    if (!agentId || !datasetId) {
      return res.status(400).json({ message: "agentId and datasetId are required" });
    }

    const dataset = await storage.getEvalDataset(datasetId);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });

    const run = await storage.createEvalTestRun({
      organizationId: orgId,
      agentId,
      agentVersion: agentVersion || "latest",
      datasetId,
      datasetVersion: datasetVersion || dataset.version,
      metricCollectionId: metricCollectionId || null,
      metricIds: metricIds || [],
      judgeModelOverride: judgeModelOverride || null,
      parallelism: parallelism || 5,
      cacheEnabled: cacheEnabled !== false,
      tags: tags || [],
      status: "pending",
      totalGoldens: dataset.goldenCount || 0,
      pendingCount: dataset.goldenCount || 0,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      triggeredBy: triggeredBy || "user",
    });

    await storage.createJob({
      type: "eval_test_run",
      status: "queued",
      agentId,
      payload: {
        runId: run.id,
        agentId,
        datasetId,
        metricIds: metricIds || [],
        judgeModelOverride: judgeModelOverride || null,
        parallelism: parallelism || 5,
      },
    });

    res.status(201).json(run);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/runs/:id", async (req, res) => {
  try {
    const run = await storage.getEvalTestRun(req.params.id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/runs/:id/traces", async (req, res) => {
  try {
    const { page = "1", limit = "50", passFail } = req.query as Record<string, string>;
    const traces = await storage.getEvalTraces({
      runId: req.params.id,
      page: parseInt(page),
      limit: parseInt(limit),
      passFail: passFail === "pass" ? true : passFail === "fail" ? false : undefined,
    });
    res.json(traces);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Trace Inspector ──────────────────────────────────────────────────────────

router.get("/api/eval/traces/:id", async (req, res) => {
  try {
    const trace = await storage.getEvalTrace(req.params.id);
    if (!trace) return res.status(404).json({ message: "Trace not found" });
    const spans = await storage.getEvalSpans(req.params.id);
    res.json({ ...trace, spans });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/api/eval/traces/:id", async (req, res) => {
  try {
    const trace = await storage.getEvalTrace(req.params.id);
    if (!trace) return res.status(404).json({ message: "Trace not found" });
    const updated = await storage.updateEvalTrace(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Eval Studio KPI summary ──────────────────────────────────────────────────

router.get("/api/eval/summary", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const runs = await storage.getEvalTestRuns({ organizationId: orgId });
    const datasets = await storage.getEvalDatasets({ organizationId: orgId });
    const metrics = await storage.getEvalMetrics({ organizationId: orgId, limit: 1000 });

    const completedRuns = runs.filter(r => r.status === "completed");
    const avgPassRate = completedRuns.length > 0
      ? completedRuns.reduce((s, r) => s + (r.passRate || 0), 0) / completedRuns.length
      : 0;

    const totalCostUsd = completedRuns.reduce((s, r) => s + (r.costUsd || 0), 0);

    const agentsUnderEval = new Set(runs.map(r => r.agentId)).size;
    const openRegressions = runs.filter(r => r.status === "completed" && (r.passRate || 0) < 0.7).length;

    res.json({
      agentsUnderEval,
      sevenDayPassRate: Math.round(avgPassRate * 100),
      openRegressions,
      productionAlerts: 0,
      totalRuns: runs.length,
      totalDatasets: datasets.length,
      totalMetrics: metrics.total,
      evalCostUsd: Math.round(totalCostUsd * 100) / 100,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
