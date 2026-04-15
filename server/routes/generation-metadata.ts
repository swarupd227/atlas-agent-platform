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
    const records = await storage.getGenerationMetadataRecords({ limit: 1 });
    const record = records.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
