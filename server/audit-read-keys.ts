/**
 * Keys for a system OUTSIDE the platform that reads an organization's audit log: a SIEM, a
 * compliance archive.
 *
 * It is the one thing such a key can do, and it is not an agent key: those belong to an agent and
 * unlock invoking it; this belongs to an organization and unlocks reading that organization's audit
 * events, in order, from a position the caller remembers (`after_seq`). The events are returned as
 * stored, with the hash and signature that make them verifiable, so the reader can prove it holds
 * what was written.
 *
 * A key is shown once, when it is minted. Only its SHA-256 is kept (the key itself carries 256 bits
 * of randomness, so a fast hash is the right one), with a short prefix so it can be recognised in a
 * list. It can expire and be revoked; both are checked on every request.
 */
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "./db";
import { auditEvents, orgApiKeys, type AuditEvent, type OrgApiKey } from "@shared/schema";
import { getLockdown } from "./lockdown";

export const AUDIT_READ_SCOPE = "audit:read";
export const AUDIT_KEY_PREFIX = "astra_audit_";
export const MAX_ACTIVE_KEYS_PER_ORG = 25;
export const MAX_PAGE = 1000;
export const DEFAULT_PAGE = 500;
const TOUCH_INTERVAL_MS = 60_000;

// ─── Storage ─────────────────────────────────────────────────────────────────

/** Everything the module needs from the database, so it can be exercised without one. */
export interface AuditReadStore {
  insertKey(row: typeof orgApiKeys.$inferInsert): Promise<OrgApiKey>;
  listKeys(organizationId: string): Promise<OrgApiKey[]>;
  findKeyById(organizationId: string, id: string): Promise<OrgApiKey | undefined>;
  findKeyByHash(keyHash: string): Promise<OrgApiKey | undefined>;
  updateKey(id: string, patch: Partial<OrgApiKey>): Promise<void>;
  eventsAfter(organizationId: string, afterSeq: number, limit: number): Promise<AuditEvent[]>;
}

const drizzleStore: AuditReadStore = {
  async insertKey(row) {
    const [created] = await db.insert(orgApiKeys).values(row).returning();
    return created;
  },
  listKeys(organizationId) {
    return db.select().from(orgApiKeys).where(eq(orgApiKeys.organizationId, organizationId)).orderBy(desc(orgApiKeys.createdAt));
  },
  async findKeyById(organizationId, id) {
    const [row] = await db.select().from(orgApiKeys).where(and(eq(orgApiKeys.id, id), eq(orgApiKeys.organizationId, organizationId)));
    return row;
  },
  async findKeyByHash(keyHash) {
    const [row] = await db.select().from(orgApiKeys).where(eq(orgApiKeys.keyHash, keyHash));
    return row;
  },
  async updateKey(id, patch) {
    await db.update(orgApiKeys).set(patch).where(eq(orgApiKeys.id, id));
  },
  eventsAfter(organizationId, afterSeq, limit) {
    return db.select().from(auditEvents)
      .where(and(eq(auditEvents.organizationId, organizationId), gt(auditEvents.sequenceNum, afterSeq)))
      .orderBy(asc(auditEvents.sequenceNum))
      .limit(limit);
  },
};

let store: AuditReadStore = drizzleStore;
export function setAuditReadStoreForTests(s: AuditReadStore | null): void {
  store = s ?? drizzleStore;
  lastTouched.clear();
}

// ─── Keys ────────────────────────────────────────────────────────────────────

export function hashAuditReadKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export class KeyLimitError extends Error {
  constructor() {
    super(`An organization can have at most ${MAX_ACTIVE_KEYS_PER_ORG} active audit-read keys: revoke one first.`);
    this.name = "KeyLimitError";
  }
}

const isLive = (k: OrgApiKey, now = new Date()): boolean =>
  k.isActive !== false && !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now);

/** What a person or a list may see of a key: never the hash. */
export function describeKey(k: OrgApiKey) {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes ?? [AUDIT_READ_SCOPE],
    active: isLive(k),
    createdBy: k.createdBy ?? null,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt ?? null,
    lastUsedAt: k.lastUsedAt ?? null,
    revokedAt: k.revokedAt ?? null,
    revokedBy: k.revokedBy ?? null,
  };
}

/** Mints a key. The raw value is returned here and nowhere else. */
export async function mintAuditReadKey(input: { organizationId: string; name: string; expiresInDays: number; createdBy?: string | null }) {
  const live = (await store.listKeys(input.organizationId)).filter((k) => isLive(k));
  if (live.length >= MAX_ACTIVE_KEYS_PER_ORG) throw new KeyLimitError();
  const raw = `${AUDIT_KEY_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  const row = await store.insertKey({
    organizationId: input.organizationId,
    name: input.name,
    keyHash: hashAuditReadKey(raw),
    keyPrefix: raw.slice(0, AUDIT_KEY_PREFIX.length + 6),
    scopes: [AUDIT_READ_SCOPE],
    isActive: true,
    createdBy: input.createdBy ?? null,
    expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
  });
  return { key: row, raw };
}

export const listAuditReadKeys = (organizationId: string) => store.listKeys(organizationId);

/** Revokes a key of this organization. Revoking a revoked key is not an error; an unknown id is undefined. */
export async function revokeAuditReadKey(organizationId: string, id: string, by?: string | null): Promise<{ key: OrgApiKey; alreadyRevoked: boolean } | undefined> {
  const key = await store.findKeyById(organizationId, id);
  if (!key) return undefined;
  if (key.revokedAt || key.isActive === false) return { key, alreadyRevoked: true };
  const patch = { isActive: false, revokedAt: new Date(), revokedBy: by ?? null };
  await store.updateKey(id, patch);
  return { key: { ...key, ...patch }, alreadyRevoked: false };
}

// ─── Authentication ──────────────────────────────────────────────────────────

const lastTouched = new Map<string, number>();

/** The key behind a raw value, or null for anything that is not a live audit-read key. */
export async function authenticateAuditReadKey(raw: string | undefined): Promise<OrgApiKey | null> {
  if (!raw || raw.length > 200 || !raw.startsWith(AUDIT_KEY_PREFIX)) return null;
  const key = await store.findKeyByHash(hashAuditReadKey(raw));
  if (!key || !isLive(key) || !(key.scopes ?? []).includes(AUDIT_READ_SCOPE)) return null;
  const now = Date.now();
  if (now - (lastTouched.get(key.id) ?? 0) > TOUCH_INTERVAL_MS) {
    if (lastTouched.size > 1000) lastTouched.clear();
    lastTouched.set(key.id, now);
    store.updateKey(key.id, { lastUsedAt: new Date(now) }).catch(() => {});
  }
  return key;
}

function extractKey(req: Request): string | undefined {
  const header = req.headers["x-api-key"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const auth = typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  return (fromHeader || bearer || undefined)?.trim();
}

/**
 * Middleware for the pull routes. The request is answered the same way whatever is wrong with the
 * key (absent, unknown, expired, revoked): the caller learns nothing about which keys exist. A
 * database failure is a 503, never a pass.
 */
export async function requireAuditReadKey(req: Request, res: Response, next: NextFunction) {
  if (getLockdown().apiKeys.publicApi === "off") {
    return res.status(403).json({ message: "The public API is disabled by this deployment's platform policy.", reason: "platform_lockdown", surface: "The public API" });
  }
  try {
    const key = await authenticateAuditReadKey(extractKey(req));
    if (!key) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="astra-audit"');
      return res.status(401).json({ error: "Invalid or missing API key" });
    }
    (req as any).auditReadKey = key;
    next();
  } catch (e: any) {
    console.error("[audit-read] key lookup failed:", e?.message ?? e);
    res.status(503).json({ error: "The audit log is temporarily unavailable" });
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export function fetchAuditEventsAfter(organizationId: string, afterSeq: number, limit: number): Promise<AuditEvent[]> {
  return store.eventsAfter(organizationId, afterSeq, limit);
}

/** An event as a reader gets it: every field the signature and hash cover, exactly as stored. */
export function auditEventView(e: AuditEvent) {
  return {
    id: e.id,
    sequenceNum: e.sequenceNum,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
    organizationId: e.organizationId,
    actorType: e.actorType,
    actorId: e.actorId,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId,
    details: e.details,
    previousHash: e.previousHash,
    eventHash: e.eventHash,
    signature: e.signature,
    signerKeyId: e.signerKeyId,
    correlationId: e.correlationId,
    traceId: e.traceId,
    industryId: e.industryId,
    complianceFrameworks: e.complianceFrameworks,
    ontologyTags: e.ontologyTags,
  };
}

/** Parses the paging query. A bad value is an error the caller can fix, never silently replaced. */
export function parsePaging(query: Record<string, unknown>): { ok: true; afterSeq: number; limit: number; format: "json" | "ndjson" } | { ok: false; error: string } {
  for (const name of ["after_seq", "limit", "format"]) {
    if (Array.isArray(query[name])) return { ok: false, error: `${name} must be given once` };
  }
  const after = query.after_seq;
  const limit = query.limit;
  const format = query.format;
  let afterSeq = 0;
  if (after !== undefined && after !== "") {
    if (typeof after !== "string" || !/^\d{1,12}$/.test(after)) return { ok: false, error: "after_seq must be a whole number, 0 or more" };
    afterSeq = Number(after);
  }
  let n = DEFAULT_PAGE;
  if (limit !== undefined && limit !== "") {
    if (typeof limit !== "string" || !/^\d{1,6}$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_PAGE) return { ok: false, error: `limit must be a whole number from 1 to ${MAX_PAGE}` };
    n = Number(limit);
  }
  if (format !== undefined && format !== "" && format !== "json" && format !== "ndjson") return { ok: false, error: "format must be json or ndjson" };
  return { ok: true, afterSeq, limit: n, format: format === "ndjson" ? "ndjson" : "json" };
}
