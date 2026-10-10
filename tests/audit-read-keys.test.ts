/**
 * Reading the audit log from outside (server/audit-read-keys.ts, server/routes/audit-read.ts).
 *
 * The properties that matter: a key unlocks one thing (this organization's audit events, in order, from
 * a position), it is shown once and never stored in the clear, every kind of bad key is answered the
 * same way, a key cannot reach another organization, and administering keys needs an administrator.
 * The routers are the real ones over real Express; an in-memory store stands in for the database,
 * which tests/../.workbench/outbound/check-real-audit-read.mts checks against a real Postgres.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({ audit: [] as any[] }));
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/storage", () => ({ storage: { createAuditEvent: vi.fn(async (e: any) => { h.audit.push(e); return e; }) } }));
vi.mock("../server/audit-signing", () => ({
  getPublicKeyInfo: vi.fn(async () => ({ keyId: "key-1", publicKeyPem: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----", algorithm: "Ed25519", source: "env" })),
  // A key since replaced: known by its id only.
  getPublicKeyById: vi.fn(async (id: string) => id === "0123456789abcdef" ? { keyId: id, publicKeyPem: "-----BEGIN PUBLIC KEY-----\nold\n-----END PUBLIC KEY-----", algorithm: "Ed25519" } : null),
}));

import { auditPullRouter, auditReadKeysRouter } from "../server/routes/audit-read";
import { AUDIT_KEY_PREFIX, MAX_ACTIVE_KEYS_PER_ORG, hashAuditReadKey, parsePaging, setAuditReadStoreForTests, type AuditReadStore } from "../server/audit-read-keys";
import { setDefaultOrgId } from "../server/auth";

// ── An in-memory stand-in for the database ──────────────────────────────────
type Key = any;
const mem = {
  keys: [] as Key[],
  events: [] as any[],
  calls: { byHash: 0, update: 0 },
  failLookups: false,
};
const store: AuditReadStore = {
  async insertKey(row) {
    const k = { id: `k${mem.keys.length + 1}`, createdAt: new Date(), lastUsedAt: null, revokedAt: null, revokedBy: null, expiresAt: null, createdBy: null, ...row } as Key;
    mem.keys.push(k);
    return k;
  },
  async listKeys(org) { return mem.keys.filter((k) => k.organizationId === org).slice().reverse(); },
  async findKeyById(org, id) { return mem.keys.find((k) => k.id === id && k.organizationId === org); },
  async findKeyByHash(hash) {
    mem.calls.byHash++;
    if (mem.failLookups) throw new Error("db down");
    return mem.keys.find((k) => k.keyHash === hash);
  },
  async updateKey(id, patch) { mem.calls.update++; Object.assign(mem.keys.find((k) => k.id === id)!, patch); },
  async eventsAfter(org, after, limit) {
    return mem.events.filter((e) => e.organizationId === org && e.sequenceNum != null && e.sequenceNum > after).sort((a, b) => a.sequenceNum - b.sequenceNum).slice(0, limit);
  },
};
const event = (org: string, seq: number | null, over: Record<string, unknown> = {}) => ({
  id: `e-${org}-${seq}`, organizationId: org, sequenceNum: seq, createdAt: new Date(Date.UTC(2026, 9, 9, 10, 0, seq ?? 0)),
  actorType: "user", actorId: "u1", action: "agent.updated", objectType: "agent", objectId: "a1", details: JSON.stringify({ n: seq }),
  previousHash: `h${(seq ?? 1) - 1}`, eventHash: `h${seq}`, signature: `sig${seq}`, signerKeyId: "key-1", correlationId: null, traceId: null,
  industryId: null, complianceFrameworks: null, ontologyTags: null, ...over,
});

let server: Server;
let base = "";
beforeAll(async () => {
  setDefaultOrgId("org-A");
  const app = express();
  app.use(auditPullRouter);
  app.use(express.json());
  app.use(auditReadKeysRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const saved = { lock: process.env.ASTRA_LOCKDOWN, mode: process.env.SECURITY_MODE };
beforeEach(() => {
  delete process.env.ASTRA_LOCKDOWN;
  delete process.env.SECURITY_MODE;
  mem.keys = []; mem.events = []; mem.calls = { byHash: 0, update: 0 }; mem.failLookups = false; h.audit.length = 0;
  setAuditReadStoreForTests(store);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (saved.lock === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = saved.lock;
  if (saved.mode === undefined) delete process.env.SECURITY_MODE; else process.env.SECURITY_MODE = saved.mode;
  vi.restoreAllMocks();
});

const api = async (method: string, p: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) => {
  const r = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...opts.headers }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* ndjson or empty */ }
  return { status: r.status, body, text, headers: r.headers };
};
const mint = async (name = "siem", extra: Record<string, unknown> = {}) => {
  const r = await api("POST", "/api/audit-read-keys", { body: { name, ...extra } });
  return { ...r, raw: r.body?.key as string };
};
const pull = (raw: string | undefined, q = "", headers: Record<string, string> = {}) =>
  api("GET", `/api/v1/audit-events${q}`, { headers: { ...(raw ? { Authorization: `Bearer ${raw}` } : {}), ...headers } });
const seed = (org: string, n: number) => { for (let i = 1; i <= n; i++) mem.events.push(event(org, i)); };

describe("minting a key", () => {
  it("returns the key once, and keeps only its hash", async () => {
    const r = await mint("Hilti SIEM");
    expect(r.status).toBe(201);
    expect(r.raw.startsWith(AUDIT_KEY_PREFIX)).toBe(true);
    expect(r.raw.length).toBe(AUDIT_KEY_PREFIX.length + 64);
    expect(r.body).toMatchObject({ name: "Hilti SIEM", scopes: ["audit:read"], active: true, endpoint: "/api/v1/audit-events" });
    expect(r.body.keyPrefix).toBe(r.raw.slice(0, AUDIT_KEY_PREFIX.length + 6));
    const [row] = mem.keys;
    expect(row.keyHash).toBe(hashAuditReadKey(r.raw));
    expect(JSON.stringify(row)).not.toContain(r.raw);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("makes every key different", async () => {
    const a = await mint("a"); const b = await mint("b");
    expect(a.raw).not.toBe(b.raw);
  });

  it("expires after a year unless told otherwise, and never offers a key that does not expire", async () => {
    const r = await mint("default");
    const days = (new Date(r.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364); expect(days).toBeLessThan(366);
    const short = await mint("short", { expiresInDays: 30 });
    expect((new Date(short.body.expiresAt).getTime() - Date.now()) / 86_400_000).toBeLessThan(31);
    for (const bad of [0, -1, 1096, 1.5, "30", null]) expect((await mint("x", { expiresInDays: bad })).status, String(bad)).toBe(400);
  });

  it.each([[""], ["   "], [undefined]])("needs a name (%j)", async (name) => {
    expect((await api("POST", "/api/audit-read-keys", { body: { name } })).status).toBe(400);
    expect(mem.keys).toHaveLength(0);
  });

  it("is for administrators only", async () => {
    for (const role of ["ops_sre", "compliance_security", "agent_engineer", "finance"]) {
      const r = await api("POST", "/api/audit-read-keys", { body: { name: "x" }, headers: { "x-role": role } });
      expect(r.status, role).toBe(403);
    }
    expect(mem.keys).toHaveLength(0);
  });

  it("records who created it, without the key", async () => {
    const r = await mint("audited");
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "audit_read_key.created", objectType: "audit_read_key", objectId: r.body.id, organizationId: "org-A" });
    expect(JSON.stringify(h.audit[0])).not.toContain(r.raw);
    expect(JSON.parse(h.audit[0].details)).toMatchObject({ name: "audited", keyPrefix: r.body.keyPrefix });
  });

  it("stops at the limit of active keys, and revoking one makes room", async () => {
    for (let i = 0; i < MAX_ACTIVE_KEYS_PER_ORG; i++) expect((await mint(`k${i}`)).status).toBe(201);
    expect((await mint("one too many")).status).toBe(409);
    await api("DELETE", `/api/audit-read-keys/${mem.keys[0].id}`);
    expect((await mint("fits now")).status).toBe(201);
  });

  it("is refused when the deployment has turned the public API off", async () => {
    process.env.ASTRA_LOCKDOWN = '{"apiKeys":{"publicApi":"off"}}';
    const r = await mint("blocked");
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("platform_lockdown");
    expect(mem.keys).toHaveLength(0);
  });
});

describe("listing and revoking", () => {
  it("lists this organization's keys, without a hash or a key", async () => {
    const a = await mint("mine");
    mem.keys.push({ id: "other", organizationId: "org-B", name: "theirs", keyHash: "x", keyPrefix: "astra_audit_zzzzzz", scopes: ["audit:read"], isActive: true, createdAt: new Date() });
    const r = await api("GET", "/api/audit-read-keys");
    expect(r.status).toBe(200);
    expect(r.body.map((k: any) => k.name)).toEqual(["mine"]);
    expect(r.text).not.toContain(a.raw);
    expect(r.text).not.toMatch(/keyHash|key_hash/);
  });

  it("revokes a key at once: the next pull is refused", async () => {
    const k = await mint("to revoke");
    seed("org-A", 2);
    expect((await pull(k.raw)).status).toBe(200);
    const d = await api("DELETE", `/api/audit-read-keys/${k.body.id}`);
    expect(d.status).toBe(200);
    expect(d.body.key).toMatchObject({ active: false });
    expect((await pull(k.raw)).status).toBe(401);
  });

  it("records the revocation once, and says so when it was already revoked", async () => {
    const k = await mint("twice");
    h.audit.length = 0;
    await api("DELETE", `/api/audit-read-keys/${k.body.id}`);
    const again = await api("DELETE", `/api/audit-read-keys/${k.body.id}`);
    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/already revoked/);
    expect(h.audit.filter((e) => e.action === "audit_read_key.revoked")).toHaveLength(1);
  });

  it("cannot revoke another organization's key, or an unknown one", async () => {
    mem.keys.push({ id: "other", organizationId: "org-B", name: "theirs", keyHash: "x", keyPrefix: "p", scopes: ["audit:read"], isActive: true, createdAt: new Date() });
    expect((await api("DELETE", "/api/audit-read-keys/other")).status).toBe(404);
    expect((await api("DELETE", "/api/audit-read-keys/nope")).status).toBe(404);
    expect(mem.keys[0].isActive).toBe(true);
  });

  it("is for administrators only", async () => {
    const k = await mint("guarded");
    expect((await api("GET", "/api/audit-read-keys", { headers: { "x-role": "ops_sre" } })).status).toBe(403);
    expect((await api("DELETE", `/api/audit-read-keys/${k.body.id}`, { headers: { "x-role": "ops_sre" } })).status).toBe(403);
    expect(mem.keys[0].isActive).toBe(true);
  });
});

describe("authenticating a pull", () => {
  it("answers every kind of bad key the same way", async () => {
    const live = await mint("live");
    const revoked = await mint("revoked"); await api("DELETE", `/api/audit-read-keys/${revoked.body.id}`);
    const expired = await mint("expired"); mem.keys.find((k) => k.id === expired.body.id)!.expiresAt = new Date(Date.now() - 1000);
    const noScope = await mint("noscope"); mem.keys.find((k) => k.id === noScope.body.id)!.scopes = ["something:else"];
    const unknown = `${AUDIT_KEY_PREFIX}${"0".repeat(64)}`;
    const answers = [];
    for (const raw of [undefined, "", "garbage", unknown, revoked.raw, expired.raw, noScope.raw, `astra_${"a".repeat(64)}`, "x".repeat(500)]) {
      const r = await pull(raw);
      answers.push([r.status, JSON.stringify(r.body), r.headers.get("www-authenticate")]);
    }
    expect(new Set(answers.map((a) => a.join("|"))).size).toBe(1);
    expect(answers[0][0]).toBe(401);
    expect((await pull(live.raw)).status).toBe(200);
  });

  it("refuses a key that either flag says is dead, whatever the other says", async () => {
    const a = await mint("revoked-only"); mem.keys.find((k) => k.id === a.body.id)!.revokedAt = new Date();
    const b = await mint("inactive-only"); mem.keys.find((k) => k.id === b.body.id)!.isActive = false;
    expect((await pull(a.raw)).status).toBe(401);
    expect((await pull(b.raw)).status).toBe(401);
  });

  it("does not even look up something that is not an audit-read key (an agent key, the shared key)", async () => {
    await pull(`astra_${"a".repeat(64)}`);
    await pull("a-shared-env-key");
    await pull(undefined);
    expect(mem.calls.byHash).toBe(0);
  });

  it("takes the key as a Bearer token or as X-API-Key", async () => {
    const k = await mint("both");
    seed("org-A", 1);
    expect((await api("GET", "/api/v1/audit-events", { headers: { Authorization: `Bearer ${k.raw}` } })).status).toBe(200);
    expect((await api("GET", "/api/v1/audit-events", { headers: { "X-API-Key": k.raw } })).status).toBe(200);
  });

  it("is not satisfied by a session or a role header", async () => {
    expect((await api("GET", "/api/v1/audit-events", { headers: { "x-role": "admin" } })).status).toBe(401);
  });

  it("fails closed when the database does: unavailable, not allowed", async () => {
    const k = await mint("db down");
    mem.failLookups = true;
    const r = await pull(k.raw);
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/events/);
  });

  it("is closed when the deployment has turned the public API off", async () => {
    const k = await mint("locked later");
    process.env.ASTRA_LOCKDOWN = '{"apiKeys":{"publicApi":"off"}}';
    const r = await pull(k.raw);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("platform_lockdown");
    expect((await api("GET", "/api/v1/audit-chain/public-key", { headers: { Authorization: `Bearer ${k.raw}` } })).status).toBe(403);
  });

  it("records when a key was last used, at most once a minute", async () => {
    const k = await mint("busy");
    seed("org-A", 1);
    mem.calls.update = 0;
    for (let i = 0; i < 5; i++) await pull(k.raw);
    await new Promise((r) => setTimeout(r, 20));
    expect(mem.calls.update).toBe(1);
    expect(mem.keys[0].lastUsedAt).toBeInstanceOf(Date);
  });
});

describe("what a pull returns", () => {
  it("is this organization's events in order, with what is needed to verify them", async () => {
    const k = await mint("reader");
    seed("org-A", 3);
    seed("org-B", 5);
    const r = await pull(k.raw);
    expect(r.status).toBe(200);
    expect(r.body.organizationId).toBe("org-A");
    expect(r.body.events.map((e: any) => e.sequenceNum)).toEqual([1, 2, 3]);
    expect(r.body.events.every((e: any) => e.organizationId === "org-A")).toBe(true);
    expect(r.body.events[1]).toMatchObject({
      id: "e-org-A-2", action: "agent.updated", previousHash: "h1", eventHash: "h2", signature: "sig2", signerKeyId: "key-1",
      details: JSON.stringify({ n: 2 }), createdAt: "2026-10-09T10:00:02.000Z",
    });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves out an event that is not in the hash chain (no sequence number)", async () => {
    const k = await mint("reader");
    seed("org-A", 2);
    mem.events.push(event("org-A", null));
    expect((await pull(k.raw)).body.events.map((e: any) => e.sequenceNum)).toEqual([1, 2]);
  });

  it("pages from a position the caller remembers, with no event twice or missed", async () => {
    const k = await mint("pager");
    seed("org-A", 7);
    const seen: number[] = [];
    let after = 0; let pages = 0; let more = true;
    while (more) {
      const r = await pull(k.raw, `?after_seq=${after}&limit=3`);
      expect(r.status).toBe(200);
      seen.push(...r.body.events.map((e: any) => e.sequenceNum));
      expect(r.body.count).toBe(r.body.events.length);
      after = r.body.nextAfterSeq; more = r.body.hasMore; pages++;
      expect(pages).toBeLessThan(10);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pages).toBe(3);
  });

  it("says there is nothing more, and keeps the position, when asked past the end", async () => {
    const k = await mint("caught up");
    seed("org-A", 3);
    const r = await pull(k.raw, "?after_seq=3");
    expect(r.body).toMatchObject({ events: [], count: 0, hasMore: false, nextAfterSeq: 3, afterSeq: 3 });
  });

  it("does not say there is more when the page ends exactly at the end", async () => {
    const k = await mint("exact");
    seed("org-A", 4);
    expect((await pull(k.raw, "?limit=4")).body).toMatchObject({ count: 4, hasMore: false, nextAfterSeq: 4 });
    expect((await pull(k.raw, "?limit=3")).body).toMatchObject({ count: 3, hasMore: true, nextAfterSeq: 3 });
  });

  it("can be asked for one JSON object per line, with the position in headers", async () => {
    const k = await mint("ndjson");
    seed("org-A", 3);
    const r = await pull(k.raw, "?format=ndjson&limit=2");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(r.headers.get("x-next-after-seq")).toBe("2");
    expect(r.headers.get("x-has-more")).toBe("true");
    const lines = r.text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((e) => e.sequenceNum)).toEqual([1, 2]);
    const empty = await pull(k.raw, "?format=ndjson&after_seq=3");
    expect(empty.text).toBe("");
    expect(empty.headers.get("x-has-more")).toBe("false");
  });

  it.each([
    ["?after_seq=-1"], ["?after_seq=abc"], ["?after_seq=1.5"], ["?after_seq=99999999999999"],
    ["?limit=0"], ["?limit=1001"], ["?limit=abc"], ["?limit=-5"], ["?format=xml"], ["?after_seq=1&after_seq=2x"],
  ])("refuses a paging value it cannot honour: %s", async (q) => {
    const k = await mint("strict");
    seed("org-A", 2);
    const r = await pull(k.raw, q);
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
  });

  it("serves the key the events are signed with", async () => {
    const k = await mint("verifier");
    const r = await api("GET", "/api/v1/audit-chain/public-key", { headers: { Authorization: `Bearer ${k.raw}` } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ keyId: "key-1", algorithm: "Ed25519" });
    expect(r.body.publicKeyPem).toContain("PUBLIC KEY");
    expect((await api("GET", "/api/v1/audit-chain/public-key")).status).toBe(401);
  });

  it("serves the key an earlier event names, so events signed before a key was replaced stay verifiable", async () => {
    const k = await mint("verifier");
    const auth = { headers: { Authorization: `Bearer ${k.raw}` } };
    const old = await api("GET", "/api/v1/audit-chain/public-key?keyId=0123456789abcdef", auth);
    expect(old.status).toBe(200);
    expect(old.body).toEqual({ keyId: "0123456789abcdef", publicKeyPem: "-----BEGIN PUBLIC KEY-----\nold\n-----END PUBLIC KEY-----", algorithm: "Ed25519" });
    expect((await api("GET", "/api/v1/audit-chain/public-key?keyId=ffffffffffffffff", auth)).status).toBe(404);
    for (const bad of ["abc", "0123456789ABCDEF", "0123456789abcdef0", "../etc", ""]) {
      expect((await api("GET", `/api/v1/audit-chain/public-key?keyId=${encodeURIComponent(bad)}`, auth)).status, bad).toBe(400);
    }
    // Without keyId the answer is the active key, as it always was; and the key is still needed to ask.
    expect((await api("GET", "/api/v1/audit-chain/public-key", auth)).body.keyId).toBe("key-1");
    expect((await api("GET", "/api/v1/audit-chain/public-key?keyId=0123456789abcdef")).status).toBe(401);
  });
});

describe("parsing the paging query", () => {
  it("has defaults", () => { expect(parsePaging({})).toEqual({ ok: true, afterSeq: 0, limit: 500, format: "json" }); });
  it("reads good values", () => { expect(parsePaging({ after_seq: "12", limit: "1000", format: "ndjson" })).toEqual({ ok: true, afterSeq: 12, limit: 1000, format: "ndjson" }); });
  it("treats an empty value as absent", () => { expect(parsePaging({ after_seq: "", limit: "", format: "" })).toMatchObject({ ok: true, afterSeq: 0, limit: 500 }); });
});

describe("it is wired in", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("mounts the pull routes before the session check, because the caller has no session", () => {
    const idx = src("server/index.ts");
    expect(idx).toContain("app.use(auditPullRouter);");
    expect(idx.indexOf("app.use(auditPullRouter);")).toBeLessThan(idx.indexOf('app.use("/api", authMiddleware);'));
  });

  it("mounts the key routes after it, and only the pull routes before it", () => {
    expect(src("server/routes.ts")).toContain("app.use(auditReadKeysRouter);");
    expect(src("server/index.ts")).not.toContain("auditReadKeysRouter");
    const routes = src("server/routes/audit-read.ts");
    const pullRoutes = [...routes.matchAll(/auditPullRouter\.(get|post|put|patch|delete)\("([^"]+)"[^)]*\)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(pullRoutes.sort()).toEqual(["get /api/v1/audit-chain/public-key", "get /api/v1/audit-events"]);
    for (const m of routes.matchAll(/auditPullRouter\.get\("[^"]+", ([^,]+),/g)) expect(m[1]).toBe("requireAuditReadKey");
  });

  it("every key route needs the administrator permission", () => {
    const routes = src("server/routes/audit-read.ts");
    const keyRoutes = [...routes.matchAll(/auditReadKeysRouter\.(get|post|put|patch|delete)\("([^"]+)", ([^,]+),/g)];
    expect(keyRoutes.map((m) => `${m[1]} ${m[2]}`).sort()).toEqual(["delete /api/audit-read-keys/:id", "get /api/audit-read-keys", "post /api/audit-read-keys"]);
    for (const m of keyRoutes) expect(m[3]).toBe('checkPermission("manage_platform_settings")');
  });

  it("creates the table and the index when the server starts, and declares the table", () => {
    const db = src("server/db.ts");
    expect(db).toMatch(/CREATE TABLE IF NOT EXISTS org_api_keys \([\s\S]{0,500}key_hash TEXT NOT NULL UNIQUE/);
    expect(db).toContain("CREATE INDEX IF NOT EXISTS idx_audit_events_org_seq ON audit_events (organization_id, sequence_num)");
    expect(src("shared/schema.ts")).toMatch(/export const orgApiKeys = pgTable\("org_api_keys"/);
  });

  it("hashes the key it is given with SHA-256, the same way the minting does", () => {
    expect(hashAuditReadKey("abc")).toBe(crypto.createHash("sha256").update("abc").digest("hex"));
  });
});
