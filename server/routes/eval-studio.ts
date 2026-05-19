import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { runLlmJudge, runAgentOnInput, buildAgentContext } from "../eval-judge";

const router = Router();

// ── Validation schemas ───────────────────────────────────────────────────────

const createMetricSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["agent", "rag", "conversational", "safety", "summarization", "general", "compliance", "operational"]).default("general"),
  metricType: z.string().default("g-eval"),
  description: z.string().optional(),
  criteria: z.string().min(1),
  evaluationParams: z.array(z.string()).default(["input", "actual_output"]),
  judgeModel: z.string().optional(),
  threshold: z.number().min(0).max(1).default(0.5),
  strictMode: z.boolean().default(false),
  asyncMode: z.boolean().default(true),
  dagConfig: z.any().optional(),
});

const updateMetricSchema = createMetricSchema.partial().omit({ name: true });

const createDatasetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  agentId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  isBaseline: z.boolean().default(false),
  createdBy: z.string().optional(),
});

const createGoldenSchema = z.object({
  input: z.string().min(1),
  expectedOutput: z.string().optional(),
  retrievalContext: z.array(z.string()).default([]),
  expectedTools: z.any().optional(),
  tags: z.array(z.string()).default([]),
  provenance: z.any().optional(),
  author: z.string().optional(),
});

const bulkGoldensSchema = z.object({
  goldens: z.array(createGoldenSchema).min(1).max(500),
});

const updateGoldenSchema = createGoldenSchema.partial();

const createRunSchema = z.object({
  agentId: z.string().min(1),
  agentVersion: z.string().optional(),
  datasetId: z.string().min(1),
  datasetVersion: z.number().int().optional(),
  metricCollectionId: z.string().optional(),
  metricIds: z.array(z.string()).default([]),
  judgeModelOverride: z.string().optional(),
  parallelism: z.number().int().min(1).max(20).default(5),
  cacheEnabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  triggeredBy: z.string().optional(),
});

const createCollectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  scope: z.string().default("end-to-end"),
  metricIds: z.array(z.string()).default([]),
  createdBy: z.string().optional(),
});

const previewMetricSchema = z.object({
  metricConfig: z.object({
    name: z.string().optional(),
    criteria: z.string().optional(),
  }).optional(),
  sampleInput: z.string().min(1),
  sampleActualOutput: z.string().optional(),
  sampleExpectedOutput: z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertOrgOwnership(entityOrgId: string | null | undefined, reqOrgId: string | undefined): void {
  if (!entityOrgId) return;
  if (reqOrgId && entityOrgId !== reqOrgId) {
    throw new Error("FORBIDDEN");
  }
}

function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && err.message === "FORBIDDEN";
}

// ── Metric Catalog ──────────────────────────────────────────────────────────

router.get("/api/eval/metrics", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { category, source, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const metrics = await storage.getEvalMetrics({
      organizationId: orgId,
      category: category || undefined,
      source: source || undefined,
      search: search || undefined,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
    });
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Static sub-paths must be declared BEFORE /:id to avoid Express shadowing them
router.get("/api/eval/metrics/attached/:agentId", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    // Validate caller belongs to the same org as the agent
    const agent = await storage.getAgent(req.params.agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);
    const attachment = await storage.getAgentEvalMetricAttachments(req.params.agentId, orgId);
    res.json(attachment);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/metrics/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    assertOrgOwnership(metric.organizationId, orgId);
    res.json(metric);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/metrics/:id/agents", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const agentIds = await storage.getAgentsUsingMetric(req.params.id, orgId);
    const agents = await Promise.all(agentIds.map(id => storage.getAgent(id, orgId)));
    res.json(agents.filter(Boolean).map(a => ({ id: a!.id, name: a!.name, status: a!.status })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = createMetricSchema.parse(req.body);
    const metric = await storage.createEvalMetric({
      ...body,
      organizationId: orgId,
      source: "tenant-private",
    });
    res.status(201).json(metric);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/metrics/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    if (metric.source !== "tenant-private") {
      return res.status(403).json({ message: "Only tenant-private metrics can be edited" });
    }
    assertOrgOwnership(metric.organizationId, orgId);
    const body = updateMetricSchema.parse(req.body);
    const updated = await storage.updateEvalMetric(req.params.id, {
      ...body,
      version: (metric.version || 1) + 1,
    });
    res.json(updated);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/:id/attach", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const attachSchema = z.object({ agentId: z.string().min(1), scope: z.string().default("end-to-end") });
    const { agentId, scope } = attachSchema.parse(req.body);

    // Validate metric ownership
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    assertOrgOwnership(metric.organizationId, orgId);

    // Validate agent belongs to the caller's org before writing eval_gates
    const agent = await storage.getAgent(agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);

    // Persist real metric-to-agent attachment mapping in eval_gates
    const attachment = await storage.attachMetricToAgent(agentId, req.params.id, orgId);

    // Also bump usage count for catalog analytics
    await storage.updateEvalMetric(req.params.id, {
      usageCount: (metric.usageCount || 0) + 1,
    });

    res.json({
      success: true,
      metricId: req.params.id,
      agentId,
      scope,
      attachedMetricIds: attachment.metricIds,
      updatedAt: attachment.updatedAt,
    });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/preview", async (req, res) => {
  try {
    const body = previewMetricSchema.parse(req.body);
    const startMs = Date.now();
    const judgeResult = await runLlmJudge(
      body.metricConfig?.name || "Preview",
      { input: body.sampleInput },
      body.sampleExpectedOutput ? { expected: body.sampleExpectedOutput } : null,
      `Metric criteria: ${body.metricConfig?.criteria || "Evaluate the response quality"}`,
      body.sampleActualOutput || null,
    );
    res.json({
      score: judgeResult.isPassed ? judgeResult.confidence : 1 - judgeResult.confidence,
      pass: judgeResult.isPassed,
      reasoning: judgeResult.reason,
      latencyMs: Date.now() - startMs,
      estimatedCostUsd: 0.002,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
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
    const body = createCollectionSchema.parse(req.body);
    const collection = await storage.createEvalMetricCollection({
      ...body,
      organizationId: orgId,
    });
    res.status(201).json(collection);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

// ── Datasets ────────────────────────────────────────────────────────────────

router.get("/api/eval/datasets", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.query as Record<string, string>;
    const datasets = await storage.getEvalDatasets({ organizationId: orgId, agentId: agentId || undefined });
    res.json(datasets);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/datasets/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    res.json(dataset);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/datasets", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = createDatasetSchema.parse(req.body);
    const dataset = await storage.createEvalDataset({ ...body, organizationId: orgId });
    res.status(201).json(dataset);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/datasets/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    const body = createDatasetSchema.partial().parse(req.body);
    const updated = await storage.updateEvalDataset(req.params.id, body);
    res.json(updated);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

// ── Goldens ──────────────────────────────────────────────────────────────────

router.get("/api/eval/datasets/:id/goldens", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    const { page = "1", limit = "50", search } = req.query as Record<string, string>;
    const goldens = await storage.getEvalGoldens({
      datasetId: req.params.id,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 500),
      search: search || undefined,
    });
    res.json(goldens);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/datasets/:id/goldens", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    const body = createGoldenSchema.parse(req.body);
    const golden = await storage.createEvalGolden({ ...body, datasetId: req.params.id, organizationId: orgId });
    await storage.incrementEvalDatasetGoldenCount(req.params.id);
    res.status(201).json(golden);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.post("/api/eval/datasets/:id/goldens/bulk", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    const { goldens } = bulkGoldensSchema.parse(req.body);
    const created = await storage.bulkCreateEvalGoldens(
      goldens.map(g => ({ ...g, datasetId: req.params.id, organizationId: orgId }))
    );
    await storage.updateEvalDataset(req.params.id, { goldenCount: (dataset.goldenCount || 0) + created.length });
    res.status(201).json({ created: created.length, goldens: created });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.put("/api/eval/goldens/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const golden = await storage.getEvalGolden(req.params.id);
    if (!golden) return res.status(404).json({ message: "Golden not found" });
    assertOrgOwnership(golden.organizationId, orgId);
    const body = updateGoldenSchema.parse(req.body);
    const updated = await storage.updateEvalGolden(req.params.id, body);
    res.json(updated);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

router.delete("/api/eval/goldens/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const golden = await storage.getEvalGolden(req.params.id);
    if (!golden) return res.status(404).json({ message: "Golden not found" });
    assertOrgOwnership(golden.organizationId, orgId);
    await storage.deleteEvalGolden(req.params.id);
    await storage.decrementEvalDatasetGoldenCount(golden.datasetId);
    res.status(204).send();
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Test Runs ────────────────────────────────────────────────────────────────

router.get("/api/eval/runs", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId, datasetId } = req.query as Record<string, string>;
    const runs = await storage.getEvalTestRuns({
      organizationId: orgId,
      agentId: agentId || undefined,
      datasetId: datasetId || undefined,
    });
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/runs", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = createRunSchema.parse(req.body);

    const dataset = await storage.getEvalDataset(body.datasetId);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);

    // Validate that the target agent belongs to the caller's org — prevents cross-tenant eval execution
    const targetAgent = await storage.getAgent(body.agentId);
    if (targetAgent) assertOrgOwnership(targetAgent.organizationId, orgId);

    const run = await storage.createEvalTestRun({
      organizationId: orgId,
      agentId: body.agentId,
      agentVersion: body.agentVersion || "latest",
      datasetId: body.datasetId,
      datasetVersion: body.datasetVersion || dataset.version,
      metricCollectionId: body.metricCollectionId || null,
      metricIds: body.metricIds,
      judgeModelOverride: body.judgeModelOverride || null,
      parallelism: body.parallelism,
      cacheEnabled: body.cacheEnabled,
      tags: body.tags,
      status: "pending",
      totalGoldens: dataset.goldenCount || 0,
      pendingCount: dataset.goldenCount || 0,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      triggeredBy: body.triggeredBy || "user",
    });

    await storage.createJob({
      type: "eval_test_run",
      status: "queued",
      agentId: body.agentId,
      payload: {
        runId: run.id,
        agentId: body.agentId,
        datasetId: body.datasetId,
        metricIds: body.metricIds,
        judgeModelOverride: body.judgeModelOverride || null,
        parallelism: body.parallelism,
        organizationId: orgId,
      },
    });

    res.status(201).json(run);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/runs/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const run = await storage.getEvalTestRun(req.params.id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    assertOrgOwnership(run.organizationId, orgId);
    res.json(run);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/runs/:id/traces", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const run = await storage.getEvalTestRun(req.params.id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    assertOrgOwnership(run.organizationId, orgId);
    const { page = "1", limit = "50", passFail } = req.query as Record<string, string>;
    const traces = await storage.getEvalTraces({
      runId: req.params.id,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      passFail: passFail === "pass" ? true : passFail === "fail" ? false : undefined,
    });
    res.json(traces);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Trace Inspector ──────────────────────────────────────────────────────────

router.get("/api/eval/traces/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const trace = await storage.getEvalTrace(req.params.id);
    if (!trace) return res.status(404).json({ message: "Trace not found" });
    assertOrgOwnership(trace.organizationId, orgId);
    const flatSpans = await storage.getEvalSpans(req.params.id);

    // Build root→child span tree
    const spanMap = new Map(flatSpans.map(s => [s.id, { ...s, children: [] as any[] }]));
    const roots: any[] = [];
    for (const span of spanMap.values()) {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        spanMap.get(span.parentSpanId)!.children.push(span);
      } else {
        roots.push(span);
      }
    }
    // Sort children by startedAt within each node
    const sortChildren = (node: any) => {
      node.children.sort((a: any, b: any) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      node.children.forEach(sortChildren);
    };
    roots.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    roots.forEach(sortChildren);

    res.json({ ...trace, spans: flatSpans, spanTree: roots });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.patch("/api/eval/traces/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const trace = await storage.getEvalTrace(req.params.id);
    if (!trace) return res.status(404).json({ message: "Trace not found" });
    assertOrgOwnership(trace.organizationId, orgId);
    const patchSchema = z.object({
      isPinned: z.boolean().optional(),
      pinnedBy: z.string().optional(),
    });
    const body = patchSchema.parse(req.body);
    const updated = await storage.updateEvalTrace(req.params.id, {
      ...body,
      pinnedAt: body.isPinned ? new Date() : undefined,
    });
    res.json(updated);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

// ── Eval Studio KPI summary ──────────────────────────────────────────────────

router.get("/api/eval/summary", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const [runs, datasets, metricsResult] = await Promise.all([
      storage.getEvalTestRuns({ organizationId: orgId }),
      storage.getEvalDatasets({ organizationId: orgId }),
      storage.getEvalMetrics({ organizationId: orgId, limit: 1000 }),
    ]);

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
      totalMetrics: metricsResult.total,
      evalCostUsd: Math.round(totalCostUsd * 100) / 100,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
