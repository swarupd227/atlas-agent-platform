import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { feedbackItems } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ── POST /api/feedback ────────────────────────────────────────────────────────
router.post("/api/feedback", async (req, res) => {
  try {
    const schema = z.object({
      feedbackType: z.enum(["bug", "enhancement", "question", "general"]).default("general"),
      featureArea: z.string().min(1),
      subFeature: z.string().optional().nullable(),
      feedbackText: z.string().min(1),
      screenshotData: z.string().optional().nullable(),
      screenshotFilename: z.string().optional().nullable(),
      submittedBy: z.string().optional().nullable(),
    });
    const body = schema.parse(req.body);
    const [created] = await db.insert(feedbackItems).values({
      ...body,
      status: "open",
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/feedback ─────────────────────────────────────────────────────────
router.get("/api/feedback", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let rows;
    if (status && status !== "all") {
      rows = await db.select().from(feedbackItems)
        .where(eq(feedbackItems.status, status))
        .orderBy(desc(feedbackItems.submittedAt));
    } else {
      rows = await db.select().from(feedbackItems)
        .orderBy(desc(feedbackItems.submittedAt));
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/feedback/:id ─────────────────────────────────────────────────────
router.get("/api/feedback/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(feedbackItems)
      .where(eq(feedbackItems.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/feedback/:id ───────────────────────────────────────────────────
// Used to resolve, reopen, or update status
router.patch("/api/feedback/:id", async (req, res) => {
  try {
    const schema = z.object({
      status: z.enum(["open", "in_progress", "resolved"]).optional(),
      resolvedBy: z.string().optional().nullable(),
      resolvedComment: z.string().optional().nullable(),
    });
    const body = schema.parse(req.body);
    const updatePayload: Record<string, any> = { ...body };
    if (body.status === "resolved" && !updatePayload.resolvedAt) {
      updatePayload.resolvedAt = new Date();
    }
    if (body.status === "open" || body.status === "in_progress") {
      updatePayload.resolvedAt = null;
    }
    const [updated] = await db.update(feedbackItems)
      .set(updatePayload)
      .where(eq(feedbackItems.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/feedback/:id ──────────────────────────────────────────────────
router.delete("/api/feedback/:id", async (req, res) => {
  try {
    const [deleted] = await db.delete(feedbackItems)
      .where(eq(feedbackItems.id, req.params.id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
