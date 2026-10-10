// Sign in with Microsoft Entra ID (server/sso.ts). Two routes, both 404 unless SSO is configured:
//
//   GET /api/auth/sso/login     sends the browser to Microsoft, with a sealed 10-minute cookie that lets the
//                               callback recognise its own sign-in
//   GET /api/auth/sso/callback  where Microsoft sends it back: checks everything, finds or creates the person,
//                               and gives them the same session cookie a password sign-in gives
//
// The user name and password routes (routes/auth.ts) are not touched by any of this.
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { generateToken, getDefaultOrgId, getSecurityMode, setAuthCookie } from "../auth";
import {
  NO_PASSWORD, beginSignIn, completeSignIn, resolveUser, ssoOrNull, type SsoErrorCode, type SsoUser, type SsoUserStore,
} from "../sso";

const router = Router();
const TXN_COOKIE = "sso_txn";
const TXN_PATH = "/api/auth/sso";

/**
 * Its own limit, not the password one: a sign-in here takes two requests, and a whole office signing in
 * behind one address in the morning must not lock itself (or the password form) out. Generous, because the
 * credential being protected is not guessable here: there is nothing to guess without Microsoft.
 */
const ssoLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again in a few minutes." },
});
const limit = (req: Request, res: Response, next: () => void) => ssoLimiter(req, res, next);

// ─── The people table ────────────────────────────────────────────────────────

const asUser = (r: typeof users.$inferSelect): SsoUser => ({
  id: r.id, username: r.username, role: r.role, email: r.email, organizationId: r.organizationId, externalId: r.externalId, authSource: r.authSource, active: r.active,
});

const drizzleStore: SsoUserStore = {
  async findByExternalId(externalId) {
    const [row] = await db.select().from(users).where(eq(users.externalId, externalId));
    return row ? asUser(row) : undefined;
  },
  async usernameTaken(username) {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows.length > 0;
  },
  async create(row) {
    const [created] = await db.insert(users).values({ ...row, password: NO_PASSWORD, authSource: "sso" }).returning();
    return asUser(created);
  },
  async update(id, patch) {
    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    return asUser(updated);
  },
  async defaultOrganizationId() {
    return getDefaultOrgId() ?? (await storage.seedDefaultOrganization()).id ?? null;
  },
};

let store: SsoUserStore = drizzleStore;
export function setSsoUserStoreForTests(s: SsoUserStore | null): void { store = s ?? drizzleStore; }

// ─── Routes ──────────────────────────────────────────────────────────────────

const notEnabled = (res: Response) => res.status(404).json({ message: "Single sign-on is not enabled" });
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: TXN_PATH });

router.get("/api/auth/sso/login", limit, (req, res) => {
  const cfg = getSecurityMode() === "demo" ? null : ssoOrNull();
  if (!cfg) return notEnabled(res);
  const { url, transaction } = beginSignIn(cfg, req.query.returnTo);
  res.cookie(TXN_COOKIE, transaction, { ...cookieOptions(), maxAge: 10 * 60_000 });
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url);
});

function audit(action: string, user: SsoUser | null, details: Record<string, unknown>): void {
  storage.createAuditEvent({
    actorType: user ? "user" : "system", actorId: user?.id ?? "sso", action, objectType: "user", objectId: user?.id,
    organizationId: user?.organizationId ?? undefined, details: JSON.stringify(details),
  }).catch((e: any) => console.error("[sso] could not record the sign-in:", e?.message ?? e));
}

const refuse = (res: Response, code: SsoErrorCode, detail?: string) => {
  // The page shows a short fixed message for the code; the reason goes to the log and the audit trail, not the address bar.
  if (detail) console.warn(`[sso] sign-in refused (${code}): ${detail}`);
  audit("auth.sso_denied", null, { code });
  res.redirect(302, `/login?sso_error=${code}`);
};

router.get("/api/auth/sso/callback", limit, async (req, res) => {
  const cfg = getSecurityMode() === "demo" ? null : ssoOrNull();
  if (!cfg) return notEnabled(res);
  const txnCookie = req.cookies?.[TXN_COOKIE] as string | undefined;
  res.clearCookie(TXN_COOKIE, cookieOptions());
  res.setHeader("Cache-Control", "no-store");
  try {
    const done = await completeSignIn(cfg, req.query, txnCookie);
    if (!done.ok) return refuse(res, done.code, done.detail);
    const resolved = await resolveUser(cfg, done.claims, store);
    if (!resolved.ok) return refuse(res, resolved.code, resolved.detail);
    const { user, created } = resolved;
    const token = generateToken(
      { userId: user.id, username: user.username, role: user.role || "agent_engineer", email: user.email, organizationId: user.organizationId ?? undefined, src: "sso" },
      `${cfg.sessionHours}h`,
    );
    setAuthCookie(res, token, cfg.sessionHours * 60 * 60 * 1000);
    audit("auth.sso_login", user, { created, role: user.role, provider: "entra" });
    return res.redirect(302, done.returnTo);
  } catch (e: any) {
    console.error("[sso] callback failed:", e?.message ?? e);
    return refuse(res, "provisioning_failed", String(e?.message ?? e).slice(0, 200));
  }
});

export default router;
