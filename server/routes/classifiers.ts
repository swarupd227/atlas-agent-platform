/**
 * Named classifiers (Phase 3): one question an organization asks the decision
 * seam in more than one flow, defined once and bound to decision steps. A
 * bound step takes the classifier's question, options or levels and threshold
 * at build and sync time (server/team-build.ts, server/process-flow-sync.ts),
 * and the seam's audit subject names the classifier, so its agreement is one
 * line in the summary across every flow that uses it.
 *
 * Org-scoped like policies: reads are filtered to the caller's organization,
 * writes need create_modify_blueprints and are audited.
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getOrgId, getDefaultOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { handleZodError } from "./helpers";

const router = Router();

const optionSchema = z.union([
  z.string().min(1).max(120),
  z.object({ label: z.string().min(1).max(120), description: z.string().max(500).optional() }),
]);

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["choice", "score", "noul"]).default("choice"),
  question: z.string().min(1).max(2000),
  options: z.array(optionSchema).max(255).optional(),
  levels: z.array(z.string().min(1).max(200)).max(10).optional(),
  criteria: z.object({ true: z.string().max(500), false: z.string().max(500) }).optional(),
  threshold: z.number().min(0).max(1).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

/** What a classifier of each kind must carry to be askable, or the reason it cannot be. */
export function classifierShapeError(c: { kind: string; options?: unknown; levels?: unknown; criteria?: unknown }): string | null {
  const options = Array.isArray(c.options) ? c.options : [];
  const levels = Array.isArray(c.levels) ? c.levels : [];
  if (c.kind === "choice" && options.length < 2) return "A choice classifier needs at least two options.";
  if (c.kind === "score" && (levels.length < 2 || levels.length > 10)) return "A score classifier needs a ladder of two to ten levels.";
  if (c.kind === "noul" && !(c.criteria && typeof c.criteria === "object")) return "A yes/no classifier needs what true and false mean.";
  return null;
}

router.get("/api/classifiers", async (req, res) => {
  const rows = await storage.getDecisionClassifiers(getOrgId(req));
  res.json(rows);
});

router.post("/api/classifiers", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const data = bodySchema.parse(req.body);
    const shape = classifierShapeError(data);
    if (shape) return res.status(400).json({ error: shape });
    const created = await storage.createDecisionClassifier({
      ...data,
      options: data.options ?? [],
      levels: data.levels ?? [],
      organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined,
    } as any);
    await storage.createAuditEvent({
      organizationId: created.organizationId ?? undefined,
      actorType: "user",
      actorId: (req as any).authUser?.userId ?? undefined,
      action: "classifier_created",
      objectType: "classifier",
      objectId: created.id,
      details: `Classifier "${created.name}" (${created.kind}) created`,
    } as any).catch(() => {});
    res.status(201).json(created);
  } catch (e) {
    handleZodError(res, e);
  }
});

router.get("/api/classifiers/:id", async (req, res) => {
  const row = await storage.getDecisionClassifier(req.params.id as string, getOrgId(req));
  if (!row) return res.status(404).json({ error: "Classifier not found" });
  res.json(row);
});

router.patch("/api/classifiers/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const existing = await storage.getDecisionClassifier(req.params.id as string, orgId);
    if (!existing) return res.status(404).json({ error: "Classifier not found" });
    const data = bodySchema.partial().parse(req.body);
    const merged = { ...existing, ...data };
    const shape = classifierShapeError(merged);
    if (shape) return res.status(400).json({ error: shape });
    // A change to what the classifier asks is a new version; a rename or a
    // status change is not.
    const asks = ["kind", "question", "options", "levels", "criteria", "threshold"] as const;
    const changedAsk = asks.some((k) => k in data && JSON.stringify((data as any)[k]) !== JSON.stringify((existing as any)[k]));
    const updated = await storage.updateDecisionClassifier(existing.id, {
      ...data,
      ...(changedAsk ? { version: (existing.version ?? 1) + 1 } : {}),
      updatedAt: new Date(),
    } as any, orgId);
    await storage.createAuditEvent({
      organizationId: existing.organizationId ?? undefined,
      actorType: "user",
      actorId: (req as any).authUser?.userId ?? undefined,
      action: "classifier_updated",
      objectType: "classifier",
      objectId: existing.id,
      details: `Classifier "${updated?.name ?? existing.name}" updated${changedAsk ? ` (version ${(existing.version ?? 1) + 1}; bound steps take it on their next build or sync)` : ""}`,
    } as any).catch(() => {});
    res.json(updated);
  } catch (e) {
    handleZodError(res, e);
  }
});

router.delete("/api/classifiers/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
  const orgId = getOrgId(req);
  const existing = await storage.getDecisionClassifier(req.params.id as string, orgId);
  if (!existing) return res.status(404).json({ error: "Classifier not found" });
  const deleted = await storage.deleteDecisionClassifier(existing.id, orgId);
  if (!deleted) return res.status(404).json({ error: "Classifier not found" });
  await storage.createAuditEvent({
    organizationId: existing.organizationId ?? undefined,
    actorType: "user",
    actorId: (req as any).authUser?.userId ?? undefined,
    action: "classifier_deleted",
    objectType: "classifier",
    objectId: existing.id,
    details: `Classifier "${existing.name}" deleted; steps bound to it keep the copy they took at their last build or sync`,
  } as any).catch(() => {});
  res.json({ success: true });
});

export default router;
