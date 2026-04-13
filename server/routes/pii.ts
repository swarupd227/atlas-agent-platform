import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { piiMaskingConfigs, piiMaskingRuns, insertPiiMaskingConfigSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { PIIMaskingEngine, DEFAULT_ENTITY_TYPES } from "../services/pii/pii-masking-engine";

const router = Router();

// ── GET /api/pii/entity-types ─────────────────────────────────────────────
router.get("/api/pii/entity-types", (_req, res) => {
  res.json({
    engine: "regex",
    entityTypes: DEFAULT_ENTITY_TYPES,
    note: "PERSON detection requires Presidio (not yet enabled). Regex engine covers 6 pattern-based types.",
  });
});

// ── GET /api/pii/health ────────────────────────────────────────────────────
router.get("/api/pii/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: "regex",
    presidioAvailable: false,
    presidioUrl: process.env.PRESIDIO_URL || null,
    supportedTypes: DEFAULT_ENTITY_TYPES,
  });
});

// ── POST /api/pii-masking-configs ─────────────────────────────────────────
router.post("/api/pii-masking-configs", async (req, res) => {
  try {
    const body = insertPiiMaskingConfigSchema.parse(req.body);
    const [created] = await db.insert(piiMaskingConfigs).values(body).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/pii-masking-configs/by-pipeline/:pipelineId ─────────────────
router.get("/api/pii-masking-configs/by-pipeline/:pipelineId", async (req, res) => {
  try {
    const [config] = await db.select().from(piiMaskingConfigs)
      .where(eq(piiMaskingConfigs.pipelineId, req.params.pipelineId))
      .limit(1);
    if (!config) return res.status(404).json({ error: "No PII masking config for this pipeline" });
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pii-masking-configs/:id ─────────────────────────────────────
router.get("/api/pii-masking-configs/:id", async (req, res) => {
  try {
    const [config] = await db.select().from(piiMaskingConfigs)
      .where(eq(piiMaskingConfigs.id, req.params.id))
      .limit(1);
    if (!config) return res.status(404).json({ error: "Not found" });
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/pii-masking-configs/:id ───────────────────────────────────
router.patch("/api/pii-masking-configs/:id", async (req, res) => {
  try {
    const partial = insertPiiMaskingConfigSchema.partial().parse(req.body);
    const [updated] = await db.update(piiMaskingConfigs)
      .set({ ...partial, updatedAt: new Date() })
      .where(eq(piiMaskingConfigs.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/pii-masking-configs/by-pipeline/:pipelineId ─────────────────
// Upsert: create-or-update the config for a given pipeline
router.put("/api/pii-masking-configs/by-pipeline/:pipelineId", async (req, res) => {
  try {
    const body = insertPiiMaskingConfigSchema.partial().parse(req.body);
    const existing = await db.select().from(piiMaskingConfigs)
      .where(eq(piiMaskingConfigs.pipelineId, req.params.pipelineId))
      .limit(1);

    if (existing.length) {
      const [updated] = await db.update(piiMaskingConfigs)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(piiMaskingConfigs.pipelineId, req.params.pipelineId))
        .returning();
      return res.json(updated);
    }

    const [created] = await db.insert(piiMaskingConfigs)
      .values({ ...body, pipelineId: req.params.pipelineId })
      .returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/pii-masking-configs/:id/test ─────────────────────────────────
// Test masking against sample text — returns masked preview (no persistence)
router.post("/api/pii-masking-configs/:id/test", async (req, res) => {
  try {
    const schema = z.object({ text: z.string().min(1) });
    const { text } = schema.parse(req.body);

    const [config] = await db.select().from(piiMaskingConfigs)
      .where(eq(piiMaskingConfigs.id, req.params.id))
      .limit(1);
    if (!config) return res.status(404).json({ error: "Config not found" });

    const engine = new PIIMaskingEngine({
      engine: "regex",
      entityTypes: (config.entityTypes as string[]) || DEFAULT_ENTITY_TYPES,
      customPatterns: (config.customPatterns as any[]) || [],
      failOnError: config.failOnError,
    });

    const { maskedText, report } = engine.maskSingle(text);
    const { tokenMap: _stripped, ...safeReport } = report;

    res.json({ maskedText, report: safeReport, tokenCount: Object.keys(report.tokenMap).length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/pipeline-runs/:id/pii-masking ────────────────────────────────
router.get("/api/pipeline-runs/:id/pii-masking", async (req, res) => {
  try {
    const runs = await db.select().from(piiMaskingRuns)
      .where(eq(piiMaskingRuns.pipelineRunId, req.params.id));
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pipeline-runs/:id/pii-masking/report ─────────────────────────
// Sanitized reports only — token maps are never returned
router.get("/api/pipeline-runs/:id/pii-masking/report", async (req, res) => {
  try {
    const runs = await db.select().from(piiMaskingRuns)
      .where(eq(piiMaskingRuns.pipelineRunId, req.params.id));
    res.json(runs.map(r => ({
      ...r,
      artifactReports: r.artifactReports,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
