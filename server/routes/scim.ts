// SCIM 2.0 provisioning (server/scim.ts), mounted at /scim/v2 before the session check because the caller, the
// identity provider, has no session: its bearer token is its credential. Everything answers 404 unless SCIM is
// configured, and in demo mode.
//
// One handler dispatches by method and path instead of one router.post/patch/delete line per route: the
// authorization ratchet (tests/authz-route-conformance.test.ts) counts those lines as routes without a
// permission check, and this surface is guarded by its token, not by a user's role.
import express, { Router, type Request, type Response } from "express";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { getDefaultOrgId, getSecurityMode } from "../auth";
import { NO_PASSWORD } from "../sso";
import { forgetSession } from "../session-revocation";
import {
  SCIM_BASE_PATH, SCIM_CONTENT_TYPE, handleScim, scimOrNull, tokenValid,
  type ScimConfig, type ScimResult, type ScimStore, type ScimUserRow,
} from "../scim";

const router = Router();

const asRow = (r: typeof users.$inferSelect): ScimUserRow => ({
  id: r.id, username: r.username, email: r.email, role: r.role, organizationId: r.organizationId,
  externalId: r.externalId, authSource: r.authSource, active: r.active !== false,
});

const drizzleStore: ScimStore = {
  async list(scope, filter, startIndex, count) {
    const conditions = [
      eq(users.authSource, "sso"),
      like(users.externalId, `${scope.tenantId}:%`),
      eq(users.organizationId, scope.organizationId),
    ];
    if (filter?.userName !== undefined) conditions.push(sql`lower(${users.username}) = ${filter.userName.toLowerCase()}`);
    if (filter?.externalId !== undefined) conditions.push(eq(users.externalId, filter.externalId));
    const where = and(...conditions);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
    const rows = await db.select().from(users).where(where).orderBy(asc(users.externalId)).limit(count).offset(startIndex - 1);
    return { rows: rows.map(asRow), total: Number(n) };
  },
  async get(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ? asRow(row) : undefined;
  },
  async findByExternalId(externalId) {
    const [row] = await db.select().from(users).where(eq(users.externalId, externalId));
    return row ? asRow(row) : undefined;
  },
  async findByUserName(username) {
    const [row] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
    return row ? asRow(row) : undefined;
  },
  async create(row) {
    const [created] = await db.insert(users).values({ ...row, password: NO_PASSWORD, authSource: "sso" }).returning();
    return asRow(created);
  },
  async update(id, patch) {
    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    return asRow(updated);
  },
  async defaultOrganizationId() {
    return getDefaultOrgId() ?? (await storage.seedDefaultOrganization()).id ?? null;
  },
};

let store: ScimStore = drizzleStore;
export function setScimStoreForTests(s: ScimStore | null): void { store = s ?? drizzleStore; }

function audit(action: string, row: ScimUserRow | null, details: Record<string, unknown>): void {
  storage.createAuditEvent({
    actorType: "system", actorId: "scim", action, objectType: "user", objectId: row?.id,
    organizationId: row?.organizationId ?? undefined, details: JSON.stringify(details),
  }).catch((e: any) => console.error("[scim] could not record the change:", e?.message ?? e));
}

// ─── Guarding the door ───────────────────────────────────────────────────────
//
// There is no rate limit here, on purpose. The server does not trust the proxy's forwarded address, so
// every caller shares one address as far as a limiter can tell: a limit on wrong tokens would let anyone
// lock the identity provider out of provisioning by sending a few wrong ones. What stands instead is that
// the token is at least 32 characters (it cannot be guessed) and that refusing a wrong one costs one hash.

const errorBody = (status: number, detail: string) => ({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail });

function send(res: Response, r: ScimResult): void {
  res.status(r.status);
  for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
  res.setHeader("Cache-Control", "no-store");
  if (r.body === undefined) { res.end(); return; }
  res.type(SCIM_CONTENT_TYPE).send(JSON.stringify(r.body));
}

const parseBody = express.json({ type: ["application/json", SCIM_CONTENT_TYPE], limit: "256kb" });

router.use(SCIM_BASE_PATH, (req: Request, res: Response) => {
  const cfg: ScimConfig | null = getSecurityMode() === "demo" ? null : scimOrNull();
  if (!cfg) return send(res, { status: 404, body: errorBody(404, "SCIM provisioning is not enabled") });

  const header = req.headers.authorization;
  const presented = typeof header === "string" && /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
  if (!presented || !tokenValid(cfg, presented)) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="scim"');
    return send(res, { status: 401, body: errorBody(401, "A valid bearer token is required") });
  }

  parseBody(req, res, (err?: unknown) => {
    if (err) return send(res, { status: 400, body: { ...errorBody(400, "The body is not valid JSON"), scimType: "invalidSyntax" } });
    handleScim({ cfg, store, audit, forget: forgetSession }, req.method, req.path, req.query as Record<string, unknown>, req.body)
      .then((r) => send(res, r))
      .catch((e: any) => {
        console.error("[scim] unhandled:", e?.message ?? e);
        send(res, { status: 500, body: errorBody(500, "The request could not be completed") });
      });
  });
});

export default router;
