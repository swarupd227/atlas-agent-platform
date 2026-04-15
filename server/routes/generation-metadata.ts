import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

const filtersSchema = z.object({
  pipelineRunId: z.string().optional(),
  agentId: z.string().optional(),
  promptId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// GET /api/generation-metadata?agentId=xxx&pipelineRunId=yyy&limit=50
router.get("/api/generation-metadata", async (req, res) => {
  try {
    const filters = filtersSchema.safeParse(req.query);
    if (!filters.success) return res.status(400).json({ error: filters.error.flatten() });
    const records = await storage.getGenerationMetadataRecords(filters.data);
    res.json(records);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/generation-metadata/stats/:agentId
router.get("/api/generation-metadata/stats/:agentId", async (req, res) => {
  try {
    const stats = await storage.getGenerationMetadataStats(req.params.agentId);
    res.json(stats);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/generation-metadata/:id  (single record)
router.get("/api/generation-metadata/:id", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ limit: 500 });
    const record = records.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/pipeline-runs/:id/generation-metadata
// Returns all generation metadata records linked to a specific pipeline run
router.get("/api/pipeline-runs/:id/generation-metadata", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ pipelineRunId: req.params.id, limit: 500 });
    res.json(records);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/pipeline-runs/:id/generation-metadata/stats
router.get("/api/pipeline-runs/:id/generation-metadata/stats", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ pipelineRunId: req.params.id, limit: 500 });
    const passedCount = records.filter(r => r.validationStatus === "passed").length;
    const repairedCount = records.filter(r => r.validationStatus === "repaired").length;
    const failedCount = records.filter(r => r.validationStatus === "failed").length;
    const avgQuality = records.length > 0
      ? records.reduce((sum, r) => sum + (r.qualityScore ?? 0), 0) / records.length
      : 0;
    const avgLatencyMs = records.length > 0
      ? records.reduce((sum, r) => sum + (r.llmLatencyMs ?? 0), 0) / records.length
      : 0;
    res.json({ total: records.length, passedCount, repairedCount, failedCount, avgQuality, avgLatencyMs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/pipeline-runs/:id/token-usage
// Aggregated token usage for all LLM calls in a pipeline run
router.get("/api/pipeline-runs/:id/token-usage", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ pipelineRunId: req.params.id, limit: 500 });
    const totalPromptTokens = records.reduce((sum, r) => sum + (r.promptTokens ?? 0), 0);
    const totalCompletionTokens = records.reduce((sum, r) => sum + (r.completionTokens ?? 0), 0);
    const totalTokens = records.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);
    const totalLlmLatencyMs = records.reduce((sum, r) => sum + (r.llmLatencyMs ?? 0), 0);
    const perCall = records.map(r => ({
      id: r.id,
      promptId: r.promptId,
      promptVersion: r.promptVersion,
      model: r.model,
      provider: r.provider,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      llmLatencyMs: r.llmLatencyMs,
      validationStatus: r.validationStatus,
      createdAt: r.createdAt,
    }));
    res.json({
      pipelineRunId: req.params.id,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      totalLlmLatencyMs,
      callCount: records.length,
      perCall,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/pipeline-runs/:id/quality-scores
// Quality scores for all LLM calls in a pipeline run
router.get("/api/pipeline-runs/:id/quality-scores", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ pipelineRunId: req.params.id, limit: 500 });
    const scored = records.filter(r => r.qualityScore !== null && r.qualityScore !== undefined);
    const avgScore = scored.length > 0
      ? scored.reduce((sum, r) => sum + (r.qualityScore as number), 0) / scored.length
      : null;
    const perCall = records.map(r => ({
      id: r.id,
      promptId: r.promptId,
      promptVersion: r.promptVersion,
      model: r.model,
      qualityScore: r.qualityScore,
      qualityDetails: r.qualityDetails,
      validationStatus: r.validationStatus,
      repairAttempts: r.repairAttempts,
      createdAt: r.createdAt,
    }));
    res.json({
      pipelineRunId: req.params.id,
      avgQualityScore: avgScore,
      scoredCallCount: scored.length,
      totalCallCount: records.length,
      perCall,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/prompt-fingerprints?agentId=xxx&promptId=yyy&limit=100
// Returns SHA-256 fingerprints (promptSha256) for prompt version tracking
router.get("/api/prompt-fingerprints", async (req, res) => {
  try {
    const agentId = req.query.agentId as string | undefined;
    const promptId = req.query.promptId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string ?? "100", 10) || 100, 500);
    const records = await storage.getGenerationMetadataRecords({ agentId, promptId, limit });
    const fingerprints = records
      .filter(r => r.promptSha256 && r.promptSha256.length > 0)
      .map(r => ({
        sha256: r.promptSha256,
        promptId: r.promptId,
        promptVersion: r.promptVersion,
        agentId: r.agentId,
        model: r.model,
        provider: r.provider,
        recordedAt: r.createdAt,
      }));
    res.json(fingerprints);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/prompt-fingerprints/:sha256
// Get all records sharing a specific prompt SHA-256 fingerprint
router.get("/api/prompt-fingerprints/:sha256", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ limit: 500 });
    const matched = records.filter(r => r.promptSha256 === req.params.sha256);
    res.json(matched);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
