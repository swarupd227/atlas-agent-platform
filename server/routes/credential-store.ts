/**
 * The administrator's view of, and control over, where connector credentials are kept (server/credential-store.ts):
 *
 *   GET  /api/admin/credential-store/status    how many credentials of each kind are in the database and in the
 *                                              secret store, and how the store has been behaving. Counts only.
 *   POST /api/admin/credential-store/migrate   move existing credentials to the store or back (credential-migration.ts).
 *                                              Changes nothing unless the body says "dryRun": false.
 *
 * Both are for whoever may manage platform settings: the credentials of every organization are involved.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { checkPermission, platformOnly } from "../permissions";
import { storage } from "../storage";
import { getOrgId, getDefaultOrgId } from "../auth";
import { CREDENTIAL_KINDS } from "../secret-store";
import { MAX_MIGRATION_LIMIT, MigrationError, credentialStoreStatus, migrateCredentials } from "../credential-migration";

const router = Router();

router.get("/api/admin/credential-store/status", platformOnly(checkPermission("manage_platform_settings")), async (_req: Request, res: Response) => {
  try {
    res.json(await credentialStoreStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const migrateSchema = z.object({
  direction: z.enum(["to-store", "to-database"]),
  // A request that forgets to say is a rehearsal, not a change.
  dryRun: z.boolean().default(true),
  kinds: z.array(z.enum(CREDENTIAL_KINDS)).min(1).optional(),
  limit: z.number().int().min(1).max(MAX_MIGRATION_LIMIT).optional(),
}).strict();

router.post("/api/admin/credential-store/migrate", platformOnly(checkPermission("manage_platform_settings")), async (req: Request, res: Response) => {
  const parsed = migrateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.flatten() });
  try {
    const report = await migrateCredentials(parsed.data);
    if (!parsed.data.dryRun) {
      // What was done and how much, never which credentials.
      const moved = Object.values(report.byKind).reduce((n, k) => n + (k?.moved ?? 0), 0);
      const failed = Object.values(report.byKind).reduce((n, k) => n + (k?.failed ?? 0), 0);
      storage.createAuditEvent({
        organizationId: getOrgId(req) ?? getDefaultOrgId(),
        actorType: "user",
        actorId: (req as any).authUser?.username ?? "unknown",
        action: "credential_store_migrate",
        objectType: "credential_store",
        objectId: parsed.data.direction,
        details: JSON.stringify({ direction: parsed.data.direction, kinds: Object.keys(report.byKind), moved, failed, remaining: report.remaining, stoppedEarly: report.stoppedEarly }),
      }).catch(() => {});
    }
    res.json(report);
  } catch (err: any) {
    if (err instanceof MigrationError) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
