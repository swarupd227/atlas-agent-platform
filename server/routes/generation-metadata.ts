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

// GET /api/prompt-fingerprints?agentId=xxx&promptId=yyy
// Returns prompt fingerprints (SHA-256 hashes) for prompt version tracking
router.get("/api/prompt-fingerprints", async (req, res) => {
  try {
    const agentId = req.query.agentId as string | undefined;
    const promptId = req.query.promptId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string ?? "100", 10), 500);
    const records = await storage.getGenerationMetadataRecords({ agentId, promptId, limit });
    const fingerprints = records
      .filter(r => r.promptFingerprint)
      .map(r => ({
        fingerprint: r.promptFingerprint,
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

// GET /api/prompt-fingerprints/:fingerprint
// Get all records sharing a specific prompt fingerprint (same prompt text → same hash)
router.get("/api/prompt-fingerprints/:fingerprint", async (req, res) => {
  try {
    const records = await storage.getGenerationMetadataRecords({ limit: 500 });
    const matched = records.filter(r => r.promptFingerprint === req.params.fingerprint);
    res.json(matched);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
