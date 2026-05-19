import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { runLlmJudge, runAgentOnInput, buildAgentContext } from "../eval-judge";
import { evaluateGateTag } from "../worker";

// ── Secure upload registry ────────────────────────────────────────────────────
// Maps a server-issued UUID token → {filePath, orgId, extractedText, ext}.
// The token is returned to the client as `fileRef`; the actual disk path never
// leaves the server, preventing path-injection via the /run endpoint.
interface UploadRecord {
  filePath: string;
  orgId: string | undefined;
  extractedText: string;
  ext: string;
}
const uploadRegistry = new Map<string, UploadRecord>();

async function extractFileText(filePath: string, ext: string): Promise<string> {
  if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf-8");
  }
  if (ext === ".pdf") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const buf = fs.readFileSync(filePath);
    const result = await pdfParse(buf);
    return result.text;
  }
  if (ext === ".docx") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth") as { extractRawText: (opts: { path: string }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return "";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `synth-${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".txt", ".docx", ".md"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

const router = Router();

// ── Validation schemas ───────────────────────────────────────────────────────

const createMetricSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["agent", "rag", "conversational", "safety", "summarization", "general", "compliance", "operational"]).default("general"),
  metricType: z.string().default("g-eval"),
  description: z.string().optional(),
  criteria: z.string().default(""),
  evaluationParams: z.array(z.string()).default(["input", "actual_output"]),
  judgeModel: z.string().optional(),
  threshold: z.number().min(0).max(1).default(0.5),
  strictMode: z.boolean().default(false),
  asyncMode: z.boolean().default(true),
  dagConfig: z.any().optional(),
});

const updateMetricSchema = createMetricSchema.partial();

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
    metricType: z.string().optional(),
    threshold: z.number().min(0).max(1).optional(),
    strictMode: z.boolean().optional(),
  }).optional(),
  sampleInput: z.string().min(1),
  sampleActualOutput: z.string().optional(),
  sampleExpectedOutput: z.string().optional(),
});

const validateCodeSchema = z.object({
  code: z.string().min(1).max(20_000),
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

router.post("/api/eval/metrics/:id/clone", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const original = await storage.getEvalMetric(req.params.id);
    if (!original) return res.status(404).json({ message: "Metric not found" });
    assertOrgOwnership(original.organizationId, orgId);
    const customName: string | undefined = req.body?.name;
    const cloned = await storage.createEvalMetric({
      name: customName || `${original.name} (Clone)`,
      category: original.category,
      metricType: original.metricType,
      source: "tenant-private",
      description: original.description ?? undefined,
      criteria: original.criteria ?? undefined,
      evaluationParams: original.evaluationParams ?? [],
      judgeModel: original.judgeModel ?? undefined,
      threshold: original.threshold,
      strictMode: original.strictMode ?? false,
      asyncMode: original.asyncMode ?? true,
      version: 1,
      usageCount: 0,
      isActive: true,
      organizationId: orgId ?? undefined,
    });
    res.status(201).json(cloned);
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
    // Snapshot current state before overwriting (immutable history)
    await storage.createEvalMetricVersion({
      metricId: metric.id,
      version: metric.version ?? 1,
      criteria: metric.criteria,
      dagConfig: metric.dagConfig,
      judgeModel: metric.judgeModel,
      threshold: metric.threshold,
      strictMode: metric.strictMode,
      asyncMode: metric.asyncMode,
      evaluationParams: metric.evaluationParams,
      metricType: metric.metricType,
      createdBy: metric.createdBy,
    });
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

router.get("/api/eval/metrics/:id/versions", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    assertOrgOwnership(metric.organizationId, orgId);
    const versions = await storage.getEvalMetricVersions(req.params.id);
    res.json(versions);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/:id/attach", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const attachSchema = z.object({
      agentId: z.string().min(1),
      scope: z.string().default("end-to-end"),
      threshold: z.number().min(0).max(1).optional(),
    });
    const { agentId, scope, threshold } = attachSchema.parse(req.body);

    // Validate metric ownership
    const metric = await storage.getEvalMetric(req.params.id);
    if (!metric) return res.status(404).json({ message: "Metric not found" });
    assertOrgOwnership(metric.organizationId, orgId);

    // Validate agent belongs to the caller's org before writing eval_gates
    const agent = await storage.getAgent(agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);

    // Use provided threshold or fall back to the metric's default threshold
    const effectiveThreshold = threshold ?? metric.threshold ?? 0.5;

    // Persist real metric-to-agent attachment mapping in eval_gates (with threshold override)
    const attachment = await storage.attachMetricToAgent(agentId, req.params.id, orgId, effectiveThreshold);

    // Also bump usage count for catalog analytics
    await storage.updateEvalMetric(req.params.id, {
      usageCount: (metric.usageCount || 0) + 1,
    });

    res.json({
      success: true,
      metricId: req.params.id,
      agentId,
      scope,
      threshold: effectiveThreshold,
      attachedMetricIds: attachment.metricIds,
      updatedAt: attachment.updatedAt,
    });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/gates", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const gates = await storage.getEvalGates(orgId ?? undefined);
    res.json(gates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/preview", async (req, res) => {
  try {
    const body = previewMetricSchema.parse(req.body);
    const startMs = Date.now();
    const criteria = body.metricConfig?.criteria || "Evaluate the response quality";
    const threshold = body.metricConfig?.threshold ?? 0.5;
    const strictMode = body.metricConfig?.strictMode ?? false;
    const judgeResult = await runLlmJudge(
      body.metricConfig?.name || "Preview",
      { input: body.sampleInput },
      body.sampleExpectedOutput ? { expected: body.sampleExpectedOutput } : null,
      `Metric criteria:\n${criteria}`,
      body.sampleActualOutput || null,
    );
    // Map judge confidence onto [0,1] score anchored around the configured threshold
    const rawScore = judgeResult.isPassed
      ? threshold + judgeResult.confidence * (1 - threshold)
      : threshold * (1 - judgeResult.confidence);
    const score = Math.max(0, Math.min(1, rawScore));
    // In strict mode the score must be exactly 1.0 to pass; otherwise use threshold
    const pass = strictMode ? score === 1 : score >= threshold;
    // Rough token estimates: criteria + sample texts → prompt; judge response → completion
    const promptTokens = Math.round((criteria.length + body.sampleInput.length + (body.sampleActualOutput?.length ?? 0) + (body.sampleExpectedOutput?.length ?? 0)) / 4);
    const completionTokens = Math.round((judgeResult.reason?.length ?? 100) / 4);
    res.json({
      score,
      pass,
      reasoning: judgeResult.reason,
      latencyMs: Date.now() - startMs,
      estimatedCostUsd: 0.002 + (criteria.length / 10_000) * 0.01,
      tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/metrics/validate-code", async (req, res) => {
  try {
    const { code } = validateCodeSchema.parse(req.body);
    const issues: string[] = [];

    if (!code.includes("BaseMetric")) issues.push("Class must extend BaseMetric");
    if (!code.includes("def measure")) issues.push("Missing required method: measure(self, test_case)");
    if (!code.includes("is_successful")) issues.push("Missing required method: is_successful(self)");
    if (!code.includes("self.threshold")) issues.push("Consider defining self.threshold for pass/fail evaluation");
    if (!code.includes("self.score")) issues.push("measure() should set self.score before returning");
    if (code.length < 80) issues.push("Implementation appears incomplete");

    // Warn on common mistakes
    if (code.includes("import os") || code.includes("import subprocess")) {
      issues.push("Security: avoid os/subprocess imports in metric code");
    }

    res.json({ valid: issues.length === 0, issues });
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

router.post("/api/eval/datasets/:id/goldens/bulk-tag", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);
    const { tags, mode } = z.object({
      tags: z.array(z.string()),
      mode: z.enum(["add", "replace"]),
    }).parse(req.body);
    // Paginate through all goldens so bulk-tag applies to datasets larger than any single-fetch limit
    const PAGE = 500;
    let page = 1;
    let updated = 0;
    while (true) {
      const batch = await storage.getEvalGoldens({ datasetId: req.params.id, page, limit: PAGE });
      for (const g of batch) {
        const newTags = mode === "replace" ? tags : Array.from(new Set([...(g.tags ?? []), ...tags]));
        await storage.updateEvalGolden(g.id, { tags: newTags });
        updated++;
      }
      if (batch.length < PAGE) break;
      page++;
    }
    res.json({ updated });
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

// ── Dataset Versioning ────────────────────────────────────────────────────────

router.post("/api/eval/datasets/:id/versions", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const dataset = await storage.getEvalDataset(req.params.id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);

    // Compute nextVersion from the highest existing sibling version (same name + agentId)
    // so forking an older version never creates a duplicate or regression.
    const siblings = await storage.getEvalDatasets({ organizationId: orgId, agentId: dataset.agentId ?? undefined });
    const maxSiblingVersion = siblings
      .filter((d) => d.name === dataset.name && d.agentId === dataset.agentId)
      .reduce((max, d) => Math.max(max, d.version ?? 1), 0);
    const nextVersion = maxSiblingVersion + 1;

    const newDataset = await storage.createEvalDataset({
      organizationId: orgId,
      agentId: dataset.agentId ?? undefined,
      name: dataset.name,
      description: dataset.description ?? undefined,
      version: nextVersion,
      goldenCount: 0,
      tags: (dataset.tags ?? []) as string[],
      isBaseline: false,
      createdBy: dataset.createdBy ?? undefined,
    });

    // Paginate through ALL source goldens — avoids silent data loss for datasets > 1 000 rows
    const PAGE = 500;
    let page = 1;
    const allGoldens: Awaited<ReturnType<typeof storage.getEvalGoldens>> = [];
    while (true) {
      const batch = await storage.getEvalGoldens({ datasetId: dataset.id, page, limit: PAGE });
      allGoldens.push(...batch);
      if (batch.length < PAGE) break;
      page++;
    }

    if (allGoldens.length > 0) {
      const copies = allGoldens.map((g) => ({
        organizationId: orgId,
        datasetId: newDataset.id,
        input: g.input,
        expectedOutput: g.expectedOutput ?? undefined,
        retrievalContext: (g.retrievalContext ?? []) as string[],
        expectedTools: g.expectedTools ?? undefined,
        tags: (g.tags ?? []) as string[],
        provenance: g.provenance ?? undefined,
        author: g.author ?? undefined,
      }));
      const created = await storage.bulkCreateEvalGoldens(copies);
      await storage.updateEvalDataset(newDataset.id, { goldenCount: created.length });
      res.status(201).json({ ...newDataset, goldenCount: created.length });
    } else {
      res.status(201).json(newDataset);
    }
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
    const { page = "1", limit = "50", passFail, goldenId } = req.query as Record<string, string>;
    const traces = await storage.getEvalTraces({
      runId: req.params.id,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      passFail: passFail === "pass" ? true : passFail === "fail" ? false : undefined,
      goldenId: goldenId || undefined,
    });
    res.json(traces);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/goldens/:id", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const golden = await storage.getEvalGolden(req.params.id);
    if (!golden) return res.status(404).json({ message: "Golden not found" });
    assertOrgOwnership(golden.organizationId, orgId);
    res.json(golden);
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
      pinned: z.boolean().optional(),
      pinnedBy: z.string().optional(),
    });
    const raw = patchSchema.parse(req.body);
    const patchBody = { ...raw, isPinned: raw.isPinned ?? raw.pinned };
    if (patchBody.isPinned === true) {
      const userRole =
        (req.authUser?.role) ??
        (req.headers["x-role"] as string | undefined) ??
        "";
      if (userRole !== "compliance_security") {
        return res.status(403).json({ message: "Only the Compliance role may pin traces as evidence" });
      }
    }
    const updated = await storage.updateEvalTrace(req.params.id, {
      isPinned: patchBody.isPinned,
      pinnedBy: patchBody.isPinned
        ? (req.authUser?.role ?? (req.headers["x-role"] as string) ?? "compliance_security")
        : patchBody.pinnedBy,
      pinnedAt: patchBody.isPinned ? new Date() : undefined,
    });
    res.json(updated);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(400).json({ message: err.message });
  }
});

// ── Golden Synthesizer ───────────────────────────────────────────────────────

const synthEstimateSchema = z.object({
  count: z.number().int().min(1).max(1000).default(50),
  sourceTextLength: z.number().int().min(0).default(0),
  model: z.string().default("claude-sonnet-4-5"),
  evolution: z.object({
    reasoning: z.boolean().default(false),
    multiContext: z.boolean().default(false),
    hypothetical: z.boolean().default(false),
    comparative: z.boolean().default(false),
  }).optional(),
});

const synthRunSchema = z.object({
  sourceType: z.enum(["text", "seeds", "file"]).default("text"),
  sourceText: z.string().default(""),
  seedGoldens: z.string().default(""),
  fileRef: z.string().optional(),
  count: z.number().int().min(1).max(1000).default(50),
  model: z.string().default("claude-sonnet-4-5"),
  distribution: z.object({
    happy: z.number().default(40),
    variation: z.number().default(30),
    edge: z.number().default(20),
    adversarial: z.number().default(10),
  }).default({}),
  evolution: z.object({
    reasoning: z.boolean().default(false),
    multiContext: z.boolean().default(false),
    hypothetical: z.boolean().default(false),
    comparative: z.boolean().default(false),
  }).default({}),
  style: z.string().default("formal"),
});

router.post("/api/eval/synthesizer/estimate", async (req, res) => {
  try {
    const body = synthEstimateSchema.parse(req.body);
    const { count, sourceTextLength, model, evolution } = body;

    const evolveMultiplier = evolution
      ? 1 + [evolution.reasoning, evolution.multiContext, evolution.hypothetical, evolution.comparative].filter(Boolean).length * 0.25
      : 1;

    const contextChunks = Math.ceil(sourceTextLength / 2000) || Math.ceil(count / 5);
    const tokensPerGolden = 800;
    const generationTokens = count * tokensPerGolden * evolveMultiplier;
    const contextTokens = contextChunks * 500;
    const totalTokens = Math.round(generationTokens + contextTokens);

    const costPer1k = model.includes("opus") ? 0.015 : model.includes("gpt-4o") ? 0.010 : 0.003;
    const estimatedCostUsd = Math.round((totalTokens / 1000) * costPer1k * 100) / 100;

    const estimatedMinutes = Math.round(count / 10 * evolveMultiplier * 0.5 * 10) / 10;

    res.json({ totalTokens, estimatedCostUsd, estimatedMinutes, count, evolveMultiplier });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

// ── File upload for synthesizer source (multipart) ───────────────────────────
// Returns a server-issued UUID token as `fileRef`; the actual disk path is
// kept in uploadRegistry and never sent to the client (prevents path injection).
router.post("/api/eval/synthesizer/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded or unsupported type" });
    const orgId = getOrgId(req);
    const { path: filePath, originalname, mimetype, size } = req.file;
    const ext = path.extname(originalname).toLowerCase();

    // Extract text from all supported formats immediately on upload
    let extractedText = "";
    try {
      extractedText = await extractFileText(filePath, ext);
    } catch (extractErr: any) {
      // Non-fatal: extraction failure is surfaced in the response so the client
      // can fall back to manual text entry rather than silently breaking synthesis.
      extractedText = "";
      console.warn("[synthesizer upload] text extraction failed:", extractErr.message);
    }

    // Mint a server-issued token and register the upload
    const token = randomUUID();
    uploadRegistry.set(token, { filePath, orgId, extractedText: extractedText.slice(0, 200_000), ext });

    // Auto-expire token after 2 hours to avoid unbounded memory/disk usage
    setTimeout(() => {
      const rec = uploadRegistry.get(token);
      if (rec) {
        uploadRegistry.delete(token);
        try { fs.unlinkSync(rec.filePath); } catch { /* already gone */ }
      }
    }, 2 * 60 * 60 * 1000);

    res.json({
      fileRef: token,          // UUID token — safe to pass to client
      originalName: originalname,
      mimeType: mimetype,
      size,
      extractedText: extractedText.slice(0, 200_000),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/api/eval/synthesizer/run", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = synthRunSchema.parse(req.body);

    // If sourceType=file, resolve the UUID token to extracted text via the server-side
    // upload registry.  We NEVER trust the client to supply a file path directly.
    let sourceText = body.sourceText || "";
    if (body.sourceType === "file") {
      if (!body.fileRef) {
        return res.status(400).json({ message: "fileRef is required when sourceType is 'file'" });
      }
      const record = uploadRegistry.get(body.fileRef);
      if (!record) {
        return res.status(400).json({ message: "Upload token not found or expired. Please re-upload the file." });
      }
      // Validate the upload belongs to the same org (undefined orgId is demo-mode, allowed)
      if (record.orgId && orgId && record.orgId !== orgId) {
        return res.status(403).json({ message: "Upload token does not belong to this organisation." });
      }
      sourceText = record.extractedText;
      if (!sourceText.trim()) {
        return res.status(400).json({ message: "No text could be extracted from the uploaded file. Please paste the text directly instead." });
      }
    }

    const job = await storage.createJob({
      type: "synthesizer_run",
      status: "queued",
      payload: { ...body, sourceText, orgId },
      scheduledFor: new Date(),
    });

    res.status(201).json({ jobId: job.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/synthesizer/:jobId/status", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const job = await storage.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.type !== "synthesizer_run") return res.status(400).json({ message: "Not a synthesizer job" });
    // Org ownership check — payload.orgId is set at job creation time
    const jobOrgId = (job.payload as Record<string, unknown>)?.orgId as string | undefined;
    assertOrgOwnership(jobOrgId, orgId);

    const jobResult = job.result as Record<string, unknown> | null | undefined;
    const result = job.status === "completed" ? jobResult : null;
    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      goldens: result?.goldens ?? [],
      // currentStep is persisted on every emitStage call (including during running)
      currentStep: (jobResult?.currentStep as string | null | undefined) ?? null,
      error: job.status === "failed" ? jobResult?.error : null,
      // Generation quality signals — present when there were degraded batches
      warnings: (result?.warnings as string[] | undefined) ?? [],
      lowFidelityCount: (result?.lowFidelityCount as number | undefined) ?? 0,
      degraded: (result?.degraded as boolean | undefined) ?? false,
    });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Conversation Simulator ────────────────────────────────────────────────────

const simRunSchema = z.object({
  agentId: z.string().min(1),
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    goals: z.string(),
    knowledgeLevel: z.string().default("medium"),
    emotionalState: z.string().default("neutral"),
    communicationStyle: z.string().default("formal"),
    adversarialLevel: z.number().int().min(1).max(5).default(1),
    industry: z.string().optional(),
  })).min(1),
  scenarios: z.array(z.string().min(1)).min(1),
  maxTurns: z.number().int().min(1).max(20).default(5),
  stopConditions: z.array(z.string()).default([]),
  model: z.string().default("claude-sonnet-4-5"),
  metricCollectionId: z.string().optional(),
});

router.post("/api/eval/simulations", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = simRunSchema.parse(req.body);

    const agent = await storage.getAgent(body.agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    assertOrgOwnership(agent.organizationId, orgId);

    const job = await storage.createJob({
      type: "simulator_run",
      status: "queued",
      agentId: body.agentId,
      payload: { ...body, orgId },
      scheduledFor: new Date(),
    });

    res.status(201).json({ jobId: job.id });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

// ── Persist simulator conversation traces ─────────────────────────────────────
const persistTracesSchema = z.object({
  jobId: z.string().min(1),
  conversationIds: z.array(z.string()).min(1),
});

router.post("/api/eval/simulations/persist-traces", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const body = persistTracesSchema.parse(req.body);

    const job = await storage.getJob(body.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.type !== "simulator_run") return res.status(400).json({ message: "Not a simulator job" });
    const jobOrgId = (job.payload as Record<string, unknown>)?.orgId as string | undefined;
    assertOrgOwnership(jobOrgId, orgId);

    const result = (job.result as Record<string, unknown>) || {};
    const conversations: Array<Record<string, unknown>> = Array.isArray(result.conversations) ? result.conversations : [];

    // Store each selected conversation as a lightweight job artifact (simulator_trace type)
    const persistedIds: string[] = [];
    for (const conv of conversations.filter((c) => body.conversationIds.includes(c.id as string))) {
      const traceJob = await storage.createJob({
        type: "simulator_trace",
        status: "completed",
        agentId: (job.payload as any).agentId,
        payload: {
          orgId,
          sourceJobId: job.id,
          conversation: conv,
        },
        scheduledFor: new Date(),
      });
      persistedIds.push(traceJob.id);
    }

    res.status(201).json({ persistedCount: persistedIds.length, traceIds: persistedIds });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
    res.status(500).json({ message: err.message });
  }
});

router.get("/api/eval/simulations/:jobId/status", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const job = await storage.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.type !== "simulator_run") return res.status(400).json({ message: "Not a simulator job" });
    // Org ownership check — payload.orgId is set at job creation time
    const jobOrgId = (job.payload as Record<string, unknown>)?.orgId as string | undefined;
    assertOrgOwnership(jobOrgId, orgId);

    const result = job.status === "completed" ? (job.result as Record<string, unknown>) : null;
    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      conversations: result?.conversations ?? [],
      totalConversations: result?.totalConversations ?? 0,
      error: job.status === "failed" ? (job.result as any)?.error : null,
    });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const completedRuns = runs.filter(r => r.status === "completed");
    const recentCompletedRuns = completedRuns.filter(r => r.startedAt && new Date(r.startedAt) >= sevenDaysAgo);
    const avgPassRate = recentCompletedRuns.length > 0
      ? recentCompletedRuns.reduce((s, r) => s + (r.passRate || 0), 0) / recentCompletedRuns.length
      : completedRuns.length > 0
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

// ── Per-metric aggregates for regression detail ────────────────────────────────
// Aggregates trace-level scores into per-metric pass rates for a given run.
router.get("/api/eval/runs/:id/metric-summary", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const run = await storage.getEvalTestRun(req.params.id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    assertOrgOwnership(run.organizationId, orgId);

    // Fetch all traces (up to 500 — enough for meaningful aggregation)
    const traces = await storage.getEvalTraces({ runId: run.id, limit: 500 });

    // Aggregate per-metric scores from trace.scores (Record<string, number>)
    const metricBuckets = new Map<string, { total: number; passed: number; scoreSum: number }>();
    for (const trace of traces) {
      const scores = trace.scores as Record<string, number> | null;
      if (!scores) continue;
      for (const [metric, score] of Object.entries(scores)) {
        if (typeof score !== "number") continue;
        const bucket = metricBuckets.get(metric) ?? { total: 0, passed: 0, scoreSum: 0 };
        bucket.total++;
        bucket.scoreSum += score;
        if (score >= 0.5) bucket.passed++;
        metricBuckets.set(metric, bucket);
      }
    }

    const summary = Array.from(metricBuckets.entries()).map(([metric, b]) => ({
      metric,
      total: b.total,
      passed: b.passed,
      passRate: b.total > 0 ? b.passed / b.total : null,
      avgScore: b.total > 0 ? Math.round((b.scoreSum / b.total) * 1000) / 1000 : null,
    }));

    // Put "overall" last, sort rest alphabetically
    summary.sort((a, b) => {
      if (a.metric === "overall") return 1;
      if (b.metric === "overall") return -1;
      return a.metric.localeCompare(b.metric);
    });

    res.json({ runId: run.id, metrics: summary, traceCount: traces.length });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Alias routes: /api/eval/agents/:agentId/gates ──────────────────────────────
// These provide the documented path alongside the existing /api/eval/gates/:agentId.

// Shared upsert handler used by both POST and PUT alias routes
async function agentGateUpsert(
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.params;
    const agent = await storage.getAgent(agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);

    const body = req.body as {
      datasetId?: string;
      metricCollectionId?: string;
      thresholdOverrides?: Record<string, number>;
      regressionWindowPct?: number;
      isActive?: boolean;
    };

    const gate = await storage.upsertEvalGate({
      agentId,
      organizationId: orgId ?? undefined,
      datasetId: body.datasetId ?? null,
      metricCollectionId: body.metricCollectionId ?? null,
      thresholdOverrides: body.thresholdOverrides ?? null,
      regressionWindowPct: body.regressionWindowPct ?? 5,
      isActive: body.isActive !== false,
    });

    res.json(gate);
  } catch (err: unknown) {
    if (isForbiddenError(err)) { res.status(403).json({ message: "Forbidden" }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg });
  }
}

router.get("/api/eval/agents/:agentId/gates", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const gate = await storage.getEvalGate(req.params.agentId);
    if (!gate) return res.status(404).json({ message: "No gate configured for this agent" });
    assertOrgOwnership(gate.organizationId, orgId);
    res.json(gate);
  } catch (err: unknown) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg });
  }
});

// POST creates/replaces the gate (upsert semantics — same as PUT)
router.post("/api/eval/agents/:agentId/gates", agentGateUpsert);

// PUT updates the gate (upsert semantics)
router.put("/api/eval/agents/:agentId/gates", agentGateUpsert);

// ── Regression Hub: Gate Definition Upsert ────────────────────────────────────
router.put("/api/eval/gates/:agentId", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.params;

    // Confirm agent belongs to caller's org
    const agent = await storage.getAgent(agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);

    const body = req.body as {
      datasetId?: string;
      metricCollectionId?: string;
      thresholdOverrides?: Record<string, number>;
      regressionWindowPct?: number;
      isActive?: boolean;
    };

    const gate = await storage.upsertEvalGate({
      agentId,
      organizationId: orgId ?? undefined,
      datasetId: body.datasetId ?? null,
      metricCollectionId: body.metricCollectionId ?? null,
      thresholdOverrides: body.thresholdOverrides ?? null,
      regressionWindowPct: body.regressionWindowPct ?? 5,
      isActive: body.isActive !== false,
    });

    res.json(gate);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Regression Hub: Gate-triggered CI run ─────────────────────────────────────
// Accepts only agentId so CI pipelines don't need to know the dataset/metrics.
// The gate definition supplies all required parameters.
router.post("/api/eval/gates/:agentId/trigger", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.params;

    const gate = await storage.getEvalGate(agentId);
    if (!gate?.datasetId) {
      return res.status(400).json({
        message: "Gate has no dataset configured. Open the Regression Hub → Gate Definition panel and set a dataset first.",
      });
    }

    const dataset = await storage.getEvalDataset(gate.datasetId);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });
    assertOrgOwnership(dataset.organizationId, orgId);

    const targetAgent = await storage.getAgent(agentId);
    if (targetAgent) assertOrgOwnership(targetAgent.organizationId, orgId);

    // Resolve metric IDs: prefer explicitly attached list, fall back to metric collection
    let metricIds = (gate.attachedMetricIds as string[] | null) ?? [];
    if (metricIds.length === 0 && gate.metricCollectionId) {
      const collection = await storage.getEvalMetricCollection(gate.metricCollectionId);
      if (collection?.metricIds) {
        metricIds = (collection.metricIds as string[]).filter(Boolean);
      }
    }

    const run = await storage.createEvalTestRun({
      organizationId: orgId,
      agentId,
      agentVersion: "latest",
      datasetId: gate.datasetId,
      datasetVersion: dataset.version,
      metricCollectionId: gate.metricCollectionId ?? null,
      metricIds,
      judgeModelOverride: null,
      parallelism: 5,
      cacheEnabled: true,
      tags: ["triggered_by:ci"],
      status: "pending",
      totalGoldens: dataset.goldenCount || 0,
      pendingCount: dataset.goldenCount || 0,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      triggeredBy: "ci",
    });

    await storage.createJob({
      type: "eval_test_run",
      status: "queued",
      agentId,
      payload: {
        runId: run.id,
        agentId,
        datasetId: gate.datasetId,
        metricIds,
        parallelism: 5,
        organizationId: orgId,
      },
    });

    res.status(201).json(run);
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

// ── Regression Hub: Promote to Staging / Production ───────────────────────────
router.post("/api/eval/gates/:agentId/promote", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { agentId } = req.params;
    const { environment, overrideComment } = req.body as {
      environment: "staging" | "production";
      overrideComment?: string;
    };

    if (!environment || !["staging", "production"].includes(environment)) {
      return res.status(400).json({ message: "environment must be 'staging' or 'production'" });
    }

    // ── Gate status computed server-side — never trust client ────────────────
    const gate = await storage.getEvalGate(agentId);
    const recentRuns = await storage.getEvalTestRuns({ agentId });
    const completedRuns = recentRuns
      .filter(r => r.status === "completed")
      .sort((a, b) =>
        new Date(b.completedAt ?? b.startedAt ?? 0).getTime() -
        new Date(a.completedAt ?? a.startedAt ?? 0).getTime()
      );
    const latestRun = completedRuns[0] ?? null;

    let serverGateStatus: "pass" | "warn" | "fail" | "unknown" = "unknown";
    if (latestRun) {
      const tags = (latestRun.tags as string[] | null) ?? [];
      if (tags.includes("gate:pass")) serverGateStatus = "pass";
      else if (tags.includes("gate:warn")) serverGateStatus = "warn";
      else if (tags.includes("gate:fail")) serverGateStatus = "fail";
      else if (latestRun.passRate != null) {
        // Fallback: persisted tags unavailable — use evaluateGateTag with passRate only.
        // Per-metric data not available here; worker persists tags for the normal path.
        const tag = evaluateGateTag(latestRun.passRate, gate, {});
        if (tag === "gate:pass") serverGateStatus = "pass";
        else if (tag === "gate:warn") serverGateStatus = "warn";
        else serverGateStatus = "fail";
      }
    }

    const isGateRed = serverGateStatus === "fail";

    // Production promotion is blocked when gate is red unless override comment provided
    if (environment === "production" && isGateRed) {
      if (!overrideComment?.trim()) {
        return res.status(422).json({
          message: "Gate is failing. Provide an override comment to proceed.",
          requiresOverride: true,
        });
      }
    }

    const agent = await storage.getAgent(agentId);
    if (agent) assertOrgOwnership(agent.organizationId, orgId);

    // Audit-log the promote action
    await storage.createAuditEvent({
      action: isGateRed && overrideComment
        ? `eval.gate.promote_override.${environment}`
        : `eval.gate.promote.${environment}`,
      objectType: "agent",
      objectId: agentId,
      actorType: "user",
      organizationId: orgId ?? undefined,
      details: {
        environment,
        serverGateStatus,
        overrideComment: overrideComment?.trim() || null,
        agentName: agent?.name ?? agentId,
        latestRunId: latestRun?.id ?? null,
        latestRunPassRate: latestRun?.passRate ?? null,
        promotedAt: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      environment,
      serverGateStatus,
      overridden: isGateRed && !!overrideComment,
      promotedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (isForbiddenError(err)) return res.status(403).json({ message: "Forbidden" });
    res.status(500).json({ message: err.message });
  }
});

export default router;
