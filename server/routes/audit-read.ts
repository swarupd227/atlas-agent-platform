// Reading the audit log from outside the platform (a SIEM, a compliance archive).
//
// Two routers, because they are authenticated by different things:
//
//  - auditPullRouter: GET /api/v1/audit-events and /api/v1/audit-chain/public-key, called by the
//    external system with an audit-read key. Mounted BEFORE the session check (server/index.ts), the
//    way /ingest/otlp is, because the caller has no session: the key is its credential, and it
//    only works here.
//  - auditReadKeysRouter: /api/audit-read-keys, where an administrator mints, lists and revokes those
//    keys. An ordinary signed-in route.
import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { storage } from "../storage";
import { getOrgId, getDefaultOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { getLockdown } from "../lockdown";
import { getPublicKeyById, getPublicKeyInfo } from "../audit-signing";
import {
  KeyLimitError, auditEventView, describeKey, fetchAuditEventsAfter, listAuditReadKeys, mintAuditReadKey, parsePaging, requireAuditReadKey, revokeAuditReadKey,
} from "../audit-read-keys";

// ── Pull: called by the external system ─────────────────────────────────────

export const auditPullRouter = Router();

/**
 * Events after a position, oldest first. The caller remembers `nextAfterSeq` and asks again from
 * there; `hasMore` says whether to ask straight away. Only events in the key's own organization,
 * and only those in the hash chain (they carry a sequence number): that is what can be verified.
 */
auditPullRouter.get("/api/v1/audit-events", requireAuditReadKey, async (req: Request, res: Response) => {
  const paging = parsePaging(req.query);
  if (!paging.ok) return res.status(400).json({ error: paging.error });
  const key = (req as any).auditReadKey as { organizationId: string } | undefined;
  // Never reached without a key; if it ever were, the answer is "no", not a crash that happens to say 503.
  if (!key) return res.status(401).json({ error: "Invalid or missing API key" });
  try {
    const rows = await fetchAuditEventsAfter(key.organizationId, paging.afterSeq, paging.limit + 1);
    const hasMore = rows.length > paging.limit;
    const page = rows.slice(0, paging.limit);
    const nextAfterSeq = page.length > 0 ? (page[page.length - 1].sequenceNum ?? paging.afterSeq) : paging.afterSeq;
    res.setHeader("Cache-Control", "no-store");
    if (paging.format === "ndjson") {
      res.setHeader("X-Next-After-Seq", String(nextAfterSeq));
      res.setHeader("X-Has-More", String(hasMore));
      res.type("application/x-ndjson");
      return res.send(page.map((e) => JSON.stringify(auditEventView(e))).join("\n") + (page.length ? "\n" : ""));
    }
    res.json({ organizationId: key.organizationId, afterSeq: paging.afterSeq, nextAfterSeq, hasMore, count: page.length, events: page.map(auditEventView) });
  } catch (e: any) {
    console.error("[audit-read] read failed:", e?.message ?? e);
    res.status(503).json({ error: "The audit log is temporarily unavailable" });
  }
});

/**
 * The public key the events are signed with, for the reader to verify them offline. With ?keyId=<an event's
 * signerKeyId> it is the key that event names, which is how events signed before a key was replaced stay
 * verifiable: the keys are recorded when they are replaced, not thrown away.
 */
auditPullRouter.get("/api/v1/audit-chain/public-key", requireAuditReadKey, async (req: Request, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const wanted = req.query.keyId;
    if (wanted !== undefined) {
      if (typeof wanted !== "string" || !/^[0-9a-f]{16}$/.test(wanted)) return res.status(400).json({ error: "keyId must be the 16 hex characters an event records as signerKeyId" });
      const found = await getPublicKeyById(wanted);
      return found ? res.json(found) : res.status(404).json({ error: "No such signing key is known" });
    }
    res.json(await getPublicKeyInfo());
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Could not read the signing key" });
  }
});

// ── Keys: administered by a signed-in administrator ─────────────────────────

export const auditReadKeysRouter = Router();

const mintSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** A key that never expires is not offered: a credential for a system outside should be rotated. */
  expiresInDays: z.number().int().min(1).max(1095).optional().default(365),
});

function actor(req: Request): string | null {
  return ((req as any).authUser?.userId as string | undefined) ?? null;
}

function orgOf(req: Request): string | undefined {
  return getOrgId(req) ?? getDefaultOrgId() ?? undefined;
}

auditReadKeysRouter.post("/api/audit-read-keys", checkPermission("manage_platform_settings"), async (req: Request, res: Response) => {
  try {
    // An external API key is exactly what a deployment that turned the public API off does not want created.
    if (getLockdown().apiKeys.publicApi === "off") {
      return res.status(403).json({ message: "The public API is disabled by this deployment's platform policy.", reason: "platform_lockdown", surface: "The public API" });
    }
    const organizationId = orgOf(req);
    if (!organizationId) return res.status(400).json({ message: "No organization to mint a key for" });
    const { name, expiresInDays } = mintSchema.parse(req.body ?? {});
    const { key, raw } = await mintAuditReadKey({ organizationId, name, expiresInDays, createdBy: actor(req) });
    storage.createAuditEvent({
      actorType: "user", actorId: actor(req), action: "audit_read_key.created", objectType: "audit_read_key", objectId: key.id, organizationId,
      details: JSON.stringify({ name: key.name, keyPrefix: key.keyPrefix, expiresAt: key.expiresAt }),
    }).catch((e) => console.error("[audit-read] could not record key creation:", e?.message ?? e));
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      ...describeKey(key),
      key: raw,
      endpoint: "/api/v1/audit-events",
      message: "Store this key securely. It will not be shown again.",
    });
  } catch (e) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    if (e instanceof KeyLimitError) return res.status(409).json({ message: e.message });
    console.error("[audit-read] mint failed:", (e as any)?.message ?? e);
    res.status(500).json({ message: "Failed to create the key" });
  }
});

auditReadKeysRouter.get("/api/audit-read-keys", checkPermission("manage_platform_settings"), async (req: Request, res: Response) => {
  try {
    const organizationId = orgOf(req);
    if (!organizationId) return res.json([]);
    res.json((await listAuditReadKeys(organizationId)).map(describeKey));
  } catch (e) {
    console.error("[audit-read] list failed:", (e as any)?.message ?? e);
    res.status(500).json({ message: "Failed to list keys" });
  }
});

auditReadKeysRouter.delete("/api/audit-read-keys/:id", checkPermission("manage_platform_settings"), async (req: Request, res: Response) => {
  try {
    const organizationId = orgOf(req);
    if (!organizationId) return res.status(404).json({ message: "Key not found" });
    const result = await revokeAuditReadKey(organizationId, String(req.params.id), actor(req));
    if (!result) return res.status(404).json({ message: "Key not found" });
    if (!result.alreadyRevoked) {
      storage.createAuditEvent({
        actorType: "user", actorId: actor(req), action: "audit_read_key.revoked", objectType: "audit_read_key", objectId: result.key.id, organizationId,
        details: JSON.stringify({ name: result.key.name, keyPrefix: result.key.keyPrefix }),
      }).catch((e) => console.error("[audit-read] could not record key revocation:", e?.message ?? e));
    }
    res.json({ message: result.alreadyRevoked ? "Key was already revoked" : "Key revoked", key: describeKey(result.key) });
  } catch (e) {
    console.error("[audit-read] revoke failed:", (e as any)?.message ?? e);
    res.status(500).json({ message: "Failed to revoke the key" });
  }
});
