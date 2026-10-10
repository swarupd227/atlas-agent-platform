/**
 * Sign in with Microsoft Entra ID (server/sso.ts, server/routes/sso.ts).
 *
 * The routes, the middleware and the protocol are real: a mock Entra (tests/support/mock-entra.ts)
 * issues real RS256 tokens and checks the client secret, the redirect and the PKCE verifier over real HTTP,
 * and the "browser" below follows the redirects by hand. The two stand-ins are the database (an in-memory
 * store with the same uniqueness rules) and the audit log.
 *
 * What it proves: a forged, replayed, mis-addressed or stale sign-in is refused and leaves no session;
 * a genuine one gives the same cookie a password gives; the person is who Entra says, not who an e-mail
 * address says; and the password form is unaffected (see tests/auth-local.test.ts for that, pinned
 * before SSO existed).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startMockEntra, unsignedToken, type MockEntra } from "./support/mock-entra";

const h = vi.hoisted(() => ({ audit: [] as any[], rows: [] as any[] }));
vi.mock("../server/db", () => ({
  pool: {},
  db: {
    select: () => ({
      from: () => ({
        then: (res: any, rej: any) => Promise.resolve(h.rows.slice()).then(res, rej),
        where: (cond: any) => {
          const vals: unknown[] = [];
          const walk = (n: any) => { if (!n || typeof n !== "object") return; if (n.constructor?.name === "Param") vals.push(n.value); if (Array.isArray(n)) n.forEach(walk); else if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(walk); };
          walk(cond);
          return Promise.resolve(h.rows.filter((r) => vals.includes(r.username) || vals.includes(r.id)));
        },
      }),
    }),
    insert: () => ({ values: (v: any) => ({ returning: async () => { const row = { id: `u${h.rows.length + 1}`, email: null, role: null, organizationId: null, ...v }; h.rows.push(row); return [row]; } }) }),
    update: () => ({ set: () => ({ where: () => ({ catch: () => {} }) }) }),
  },
}));
vi.mock("../server/storage", () => ({
  storage: {
    seedDefaultOrganization: vi.fn(async () => ({ id: "org-default" })),
    createAuditEvent: vi.fn(async (e: any) => { h.audit.push(e); return e; }),
  },
}));
vi.mock("../server/rate-limits", () => ({ authRateLimiter: (_q: any, _s: any, next: any) => next() }));

import authRouter from "../server/routes/auth";
import ssoRouter, { setSsoUserStoreForTests } from "../server/routes/sso";
import { authMiddleware, setDefaultOrgId, comparePassword } from "../server/auth";
import {
  NO_PASSWORD, beginSignIn, describeSso, emailAllowed, readSsoConfig, resetSsoForTests, resolveUser, roleFor, safeReturnTo, seal, ssoPublicView, unseal, validateSsoEnv,
  type SsoUser, type SsoUserStore,
} from "../server/sso";

// ── An in-memory people table with the real uniqueness rules ────────────────
const people: SsoUser[] = [];
const memStore: SsoUserStore = {
  async findByExternalId(id) { return people.find((p) => p.externalId === id); },
  async usernameTaken(name) { return people.some((p) => p.username === name) || h.rows.some((r) => r.username === name); },
  async create(row) {
    if (people.some((p) => p.username === row.username) || h.rows.some((r) => r.username === row.username)) throw new Error('duplicate key value violates unique constraint "users_username_unique"');
    if (people.some((p) => p.externalId === row.externalId)) throw new Error('duplicate key value violates unique constraint "idx_users_external_id"');
    const u: SsoUser = { id: `sso-${people.length + 1}`, authSource: "sso", ...row };
    people.push(u);
    return u;
  },
  async update(id, patch) { const u = people.find((p) => p.id === id)!; Object.assign(u, patch); return u; },
  async defaultOrganizationId() { return "org-default"; },
};

let idp: MockEntra;
let appServer: Server;
let appBase = "";
const ENV_KEYS = ["ASTRA_SSO", "ASTRA_SSO_FILE", "ASTRA_SSO_CLIENT_SECRET", "ASTRA_SSO_CLIENT_SECRET_FILE", "SECURITY_MODE", "JWT_SECRET", "NODE_ENV", "ASTRA_OUTBOUND_POLICY", "PORT"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

const ssoConfig = (over: Record<string, unknown> = {}) => ({
  tenantId: idp.tenantId, clientId: idp.clientId, authority: idp.authority, redirectUri: `${appBase}/api/auth/sso/callback`,
  roles: { map: { "Astra.Admin": "admin", "Astra.Engineer": "agent_engineer", "Astra.Finance": "finance" } },
  ...over,
});
const configure = (over: Record<string, unknown> = {}) => {
  process.env.ASTRA_SSO = JSON.stringify(ssoConfig(over));
  process.env.ASTRA_SSO_CLIENT_SECRET = idp.clientSecret;
  resetSsoForTests();
};

beforeAll(async () => {
  idp = await startMockEntra();
  setDefaultOrgId("org-default");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authMiddleware);
  app.use(authRouter);
  app.use(ssoRouter);
  app.get("/api/protected", (req, res) => res.json({ user: req.authUser }));
  await new Promise<void>((r) => { appServer = app.listen(0, "127.0.0.1", r); });
  appBase = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  setSsoUserStoreForTests(memStore);
});
afterAll(async () => {
  setSsoUserStoreForTests(null);
  await idp.close();
  await new Promise<void>((r) => appServer.close(() => r()));
});
beforeEach(() => {
  process.env.SECURITY_MODE = "production";
  process.env.JWT_SECRET = "sso-test-jwt-secret";
  delete process.env.ASTRA_OUTBOUND_POLICY;
  people.length = 0; h.audit.length = 0; h.rows.length = 0;
  idp.profile = { oid: "00000000-0000-0000-0000-000000000001", email: "ana@hilti.example", upn: "ana@hilti.example", name: "Ana Example", roles: ["Astra.Admin"], amr: ["pwd", "mfa"] };
  idp.mutateClaims = undefined; idp.forge = undefined; idp.tokenError = undefined; idp.authorizeError = undefined;
  idp.keyRequests = 0; idp.tokenRequests.length = 0; idp.authorizeRequests.length = 0;
  configure();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetSsoForTests();
  vi.restoreAllMocks();
});

// ── The browser ─────────────────────────────────────────────────────────────
const get = (url: string, cookie?: string) => fetch(url, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
const cookieOf = (res: Response, name: string): string | undefined => {
  const all = (res.headers as any).getSetCookie?.() as string[] | undefined;
  const hit = (all ?? [res.headers.get("set-cookie") ?? ""]).find((c) => c.startsWith(`${name}=`));
  return hit?.split(";")[0];
};
const flagsOf = (res: Response, name: string): string => ((res.headers as any).getSetCookie?.() as string[]).find((c) => c.startsWith(`${name}=`)) ?? "";

interface Journey { login: Response; authorize: Response; callback: Response; txn?: string; session?: string; location: string }
/** Click "Sign in with Microsoft" and come back. `tamper` can change what the browser carries back. */
async function signIn(opts: { returnTo?: string; txnCookie?: (c: string) => string | undefined; callbackQuery?: (q: URLSearchParams) => void } = {}): Promise<Journey> {
  const login = await get(`${appBase}/api/auth/sso/login${opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : ""}`);
  const txn = cookieOf(login, "sso_txn");
  const authorize = await get(login.headers.get("location")!);
  const back = new URL(authorize.headers.get("location")!);
  opts.callbackQuery?.(back.searchParams);
  const sendTxn = txn ? (opts.txnCookie ? opts.txnCookie(txn) : txn) : undefined;
  const callback = await get(`${appBase}${back.pathname}?${back.searchParams.toString()}`, sendTxn);
  return { login, authorize, callback, txn, session: cookieOf(callback, "auth_token"), location: callback.headers.get("location") ?? "" };
}
const denied = (j: Journey, code: string) => { expect(j.callback.status).toBe(302); expect(j.location).toBe(`/login?sso_error=${code}`); expect(j.session).toBeUndefined(); expect(h.audit.some((e) => e.action === "auth.sso_denied" && JSON.parse(e.details).code === code)).toBe(true); expect(people.length).toBe(0); };

// ═══════════════════════════════════════════════════════════════════════════
describe("configuration", () => {
  const env = (over: Record<string, unknown> | string, secret: string | null = "s3cret") => {
    const e: NodeJS.ProcessEnv = { ASTRA_SSO: typeof over === "string" ? over : JSON.stringify(ssoConfig(over)) };
    if (secret !== null) e.ASTRA_SSO_CLIENT_SECRET = secret;
    return e;
  };

  it("is off when nothing is set, and says so", () => {
    expect(readSsoConfig({})).toBeNull();
    for (const k of ENV_KEYS) delete process.env[k];
    resetSsoForTests();
    expect(validateSsoEnv()).toEqual([]);
    expect(describeSso()).toBe("sso=off");
    expect(ssoPublicView()).toBeNull();
  });

  it("reads a good one, with defaults: local login stays on, eight hours, no MFA requirement", () => {
    const c = readSsoConfig(env({}))!;
    expect(c).toMatchObject({ tenantId: idp.tenantId, clientId: idp.clientId, clientSecret: "s3cret", localLogin: "on", sessionHours: 8, requireMfa: false, defaultRole: null, organizationId: null, allowedEmailDomains: null, buttonLabel: "Sign in with Microsoft" });
    expect(c.scopes).toEqual(["openid", "profile", "email"]);
    expect(c.authority).toBe(idp.authority);
    expect(readSsoConfig(env({ authority: undefined }))!.authority).toBe("https://login.microsoftonline.com");
  });

  it("takes everything it offers", () => {
    const c = readSsoConfig(env({ localLogin: "admins-only", sessionHours: 4, requireMfa: true, allowedEmailDomains: ["@Hilti.com", "corp.hilti.com"], organizationId: "org-9", scopes: ["offline_access"], buttonLabel: "Hilti sign-in", roles: { map: { A: "admin" }, default: "finance" } }))!;
    expect(c).toMatchObject({ localLogin: "admins-only", sessionHours: 4, requireMfa: true, allowedEmailDomains: ["hilti.com", "corp.hilti.com"], organizationId: "org-9", defaultRole: "finance", buttonLabel: "Hilti sign-in" });
    expect(c.scopes).toContain("offline_access");
  });

  it("reads the secret from a file, and refuses both the variable and the file", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sso-"));
    const f = path.join(dir, "secret"); writeFileSync(f, "from-file\n");
    expect(readSsoConfig({ ASTRA_SSO: JSON.stringify(ssoConfig()), ASTRA_SSO_CLIENT_SECRET_FILE: f })!.clientSecret).toBe("from-file");
    expect(() => readSsoConfig({ ASTRA_SSO: JSON.stringify(ssoConfig()), ASTRA_SSO_CLIENT_SECRET: "x", ASTRA_SSO_CLIENT_SECRET_FILE: f })).toThrow(/not both/);
    const cf = path.join(dir, "config.json"); writeFileSync(cf, JSON.stringify(ssoConfig()));
    expect(readSsoConfig({ ASTRA_SSO_FILE: cf, ASTRA_SSO_CLIENT_SECRET: "x" })!.clientId).toBe(idp.clientId);
    expect(() => readSsoConfig({ ASTRA_SSO: "{}", ASTRA_SSO_FILE: cf, ASTRA_SSO_CLIENT_SECRET: "x" })).toThrow(/not both/);
  });

  it.each([
    ["JSON that is not JSON", () => ({ ASTRA_SSO: "{nope", ASTRA_SSO_CLIENT_SECRET: "s" })],
    ["no secret", () => env({}, null)],
    ["a tenant that is not a GUID", () => env({ tenantId: "common" })],
    ["a tenant name", () => env({ tenantId: "hilti.onmicrosoft.com" })],
    ["no client id", () => env({ clientId: "" })],
    ["a redirect that is not https", () => env({ redirectUri: "http://astra.hilti.com/api/auth/sso/callback" })],
    ["a redirect that is not the callback", () => env({ redirectUri: "https://astra.hilti.com/somewhere" })],
    ["an authority that is not https", () => env({ authority: "http://login.example.com" })],
    ["a role that does not exist", () => env({ roles: { map: { A: "superuser" } } })],
    ["no role to give anybody", () => env({ roles: { map: {} } })],
    ["a setting it does not have", () => env({ provisioning: "auto" })],
    ["a local login policy it does not have", () => env({ localLogin: "off" })],
    ["a session of zero hours", () => env({ sessionHours: 0 })],
    ["a session of a week", () => env({ sessionHours: 168 })],
    ["MFA as text", () => env({ requireMfa: "yes" })],
  ])("refuses %s, which would leave sign-in half set up", (_n, make) => {
    const e = make();
    expect(() => readSsoConfig(e)).toThrow();
    process.env.ASTRA_SSO = e.ASTRA_SSO;
    if (e.ASTRA_SSO_CLIENT_SECRET) process.env.ASTRA_SSO_CLIENT_SECRET = e.ASTRA_SSO_CLIENT_SECRET; else delete process.env.ASTRA_SSO_CLIENT_SECRET;
    resetSsoForTests();
    expect(validateSsoEnv()).toHaveLength(1);
    expect(describeSso()).toBe("sso=invalid");
  });

  it("allows http for localhost only", () => {
    expect(readSsoConfig(env({ redirectUri: "http://localhost:5000/api/auth/sso/callback" }))).not.toBeNull();
    expect(() => readSsoConfig(env({ redirectUri: "http://127.0.0.2:5000/api/auth/sso/callback" }))).toThrow();
  });

  it("describes itself without the secret or the whole tenant", () => {
    const line = describeSso();
    expect(line).toMatch(/^sso=entra tenant=11111111… local-login=on session=8h$/);
    expect(line).not.toContain(idp.clientSecret);
  });

  it("tells the sign-in page what it may offer, and nothing else", () => {
    expect(ssoPublicView()).toEqual({ enabled: true, loginUrl: "/api/auth/sso/login", label: "Sign in with Microsoft", localLogin: "on" });
  });
});

describe("the pieces", () => {
  it("only ever returns to a path on this site", () => {
    for (const [given, want] of [
      ["/agents", "/agents"], ["/a/b?c=d#e", "/a/b?c=d#e"], ["/", "/"],
      ["https://evil.example/x", "/"], ["//evil.example", "/"], ["/\\evil.example", "/"], ["\\\\evil", "/"], ["javascript:alert(1)", "/"],
      ["/ok\r\nSet-Cookie: x=1", "/"], ["", "/"], [undefined, "/"], [["/a"], "/"], [123, "/"], ["/" + "a".repeat(600), "/"],
      ["/login", "/"], ["/api/auth/sso/login", "/"], ["/api/auth/sso/callback?x=1", "/"],
    ] as Array<[unknown, string]>) expect(safeReturnTo(given), String(given)).toBe(want);
  });

  it("seals what it needs for the callback, and refuses anything altered, expired or foreign", () => {
    const t = { s: "state", n: "nonce", v: "verifier", r: "/x", exp: Date.now() + 60_000 };
    const sealed = seal(t);
    expect(unseal(sealed)).toEqual(t);
    expect(unseal(undefined)).toBeNull();
    expect(unseal("")).toBeNull();
    expect(unseal("garbage")).toBeNull();
    const [body, mac] = sealed.split(".");
    expect(unseal(`${body}.${mac.slice(0, -2)}xx`)).toBeNull();
    expect(unseal(`${Buffer.from(JSON.stringify({ ...t, r: "https://evil" })).toString("base64url")}.${mac}`)).toBeNull();
    expect(unseal(`${sealed}.extra`)).toBeNull();
    expect(unseal(seal({ ...t, exp: Date.now() - 1 }))).toBeNull();
    process.env.JWT_SECRET = "a-different-secret";
    expect(unseal(sealed)).toBeNull();
  });

  it("a sealed value is not a session, and a session is not a sealed value", () => {
    const sealed = seal({ s: "s", n: "n", v: "v", r: "/", exp: Date.now() + 60_000 });
    expect(jwt.decode(sealed)).toBeNull();
    const session = jwt.sign({ userId: "u", username: "u", role: "admin", email: null, organizationId: "o" }, "sso-test-jwt-secret");
    expect(unseal(session)).toBeNull();
  });

  it("builds the authorize address with state, nonce and an S256 challenge, and seals the verifier", () => {
    const cfg = readSsoConfig(process.env)!;
    const { url, transaction } = beginSignIn(cfg, "/agents");
    const q = new URL(url).searchParams;
    expect(new URL(url).origin + new URL(url).pathname).toBe(`${idp.authority}/${idp.tenantId}/oauth2/v2.0/authorize`);
    expect(Object.fromEntries(q)).toMatchObject({ client_id: idp.clientId, response_type: "code", redirect_uri: cfg.redirectUri, response_mode: "query", scope: "openid profile email", code_challenge_method: "S256" });
    const t = unseal(transaction)!;
    expect(q.get("state")).toBe(t.s);
    expect(q.get("nonce")).toBe(t.n);
    expect(q.get("code_challenge")).toBe(crypto.createHash("sha256").update(t.v).digest("base64url"));
    expect(t.v.length).toBeGreaterThanOrEqual(43);
    expect(t.r).toBe("/agents");
    expect(url).not.toContain(idp.clientSecret);
    const again = beginSignIn(cfg, "/");
    expect(new URL(again.url).searchParams.get("state")).not.toBe(q.get("state"));
  });

  it("gives a person the most privileged of the roles they hold, the default if they hold none that is mapped, and nothing otherwise", () => {
    const cfg = readSsoConfig(process.env)!;
    expect(roleFor(cfg, ["Astra.Finance", "Astra.Admin", "Astra.Engineer"])).toBe("admin");
    expect(roleFor(cfg, ["Astra.Finance", "Astra.Engineer"])).toBe("agent_engineer");
    expect(roleFor(cfg, ["Unmapped"])).toBeNull();
    expect(roleFor(cfg, [])).toBeNull();
    expect(roleFor(cfg, ["__proto__", "constructor", "toString"])).toBeNull();
    expect(roleFor({ ...cfg, defaultRole: "finance" }, ["Unmapped"])).toBe("finance");
  });

  it("checks the e-mail domain when asked to, from the e-mail or the sign-in name", () => {
    const cfg = { ...readSsoConfig(process.env)!, allowedEmailDomains: ["hilti.com"] };
    const c = (email: string | null, upn: string | null) => ({ tenantId: "t", oid: "o", email, upn, name: null, roles: [], amr: [] });
    expect(emailAllowed(cfg, c("a@hilti.com", null))).toBe(true);
    expect(emailAllowed(cfg, c(null, "a@hilti.com"))).toBe(true);
    expect(emailAllowed(cfg, c("a@evil.com", "a@hilti.com"))).toBe(false);
    expect(emailAllowed(cfg, c("a@sub.hilti.com", null))).toBe(false);
    expect(emailAllowed(cfg, c(null, null))).toBe(false);
    expect(emailAllowed({ ...cfg, allowedEmailDomains: null }, c(null, null))).toBe(true);
  });
});

describe("the sign-in page is told about it, and the password form is not changed", () => {
  it("the mode answer carries the SSO block only when it is configured", async () => {
    const on = await (await fetch(`${appBase}/api/auth/mode`)).json();
    expect(on).toEqual({ mode: "production", sso: { enabled: true, loginUrl: "/api/auth/sso/login", label: "Sign in with Microsoft", localLogin: "on" } });
    for (const k of ["ASTRA_SSO", "ASTRA_SSO_CLIENT_SECRET"]) delete process.env[k];
    resetSsoForTests();
    expect(await (await fetch(`${appBase}/api/auth/mode`)).json()).toEqual({ mode: "production" });
  });

  it("is not offered in demo mode", async () => {
    process.env.SECURITY_MODE = "demo";
    expect(await (await fetch(`${appBase}/api/auth/mode`)).json()).toEqual({ mode: "demo" });
    expect((await get(`${appBase}/api/auth/sso/login`)).status).toBe(404);
  });

  it("both routes answer 404 when SSO is not configured", async () => {
    for (const k of ["ASTRA_SSO", "ASTRA_SSO_CLIENT_SECRET"]) delete process.env[k];
    resetSsoForTests();
    for (const p of ["/api/auth/sso/login", "/api/auth/sso/callback?code=x&state=y"]) {
      const r = await get(appBase + p);
      expect(r.status, p).toBe(404);
      expect(await r.json()).toEqual({ message: "Single sign-on is not enabled" });
    }
  });

  it("both routes are reachable without a session, and the rest still is not", async () => {
    expect((await get(`${appBase}/api/auth/sso/login`)).status).toBe(302);
    expect((await get(`${appBase}/api/protected`)).status).toBe(401);
    expect((await get(`${appBase}/api/auth/sso/other`)).status).toBe(401);
  });
});

describe("signing in", () => {
  it("sends the browser to Microsoft with a sealed ten-minute cookie only the callback can read", async () => {
    const login = await get(`${appBase}/api/auth/sso/login`);
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toMatch(new RegExp(`^${idp.authority}/${idp.tenantId}/oauth2/v2.0/authorize\\?`));
    expect(login.headers.get("cache-control")).toBe("no-store");
    const flags = flagsOf(login, "sso_txn");
    expect(flags).toMatch(/HttpOnly/i);
    expect(flags).toMatch(/SameSite=Lax/i);
    expect(flags).toMatch(/Path=\/api\/auth\/sso/);
    expect(flags).toMatch(/Max-Age=600/);
  });

  it("a genuine sign-in gives the person a session like a password gives, for eight hours", async () => {
    const j = await signIn();
    expect(j.callback.status).toBe(302);
    expect(j.location).toBe("/");
    expect(j.session).toBeDefined();
    const token = jwt.decode(j.session!.split("=")[1]) as any;
    expect(token).toMatchObject({ userId: "sso-1", username: "ana@hilti.example", role: "admin", email: "ana@hilti.example", organizationId: "org-default" });
    expect(token.exp - token.iat).toBe(8 * 3600);
    expect(Object.keys(token).sort()).toEqual(["email", "exp", "iat", "organizationId", "role", "userId", "username"]);
    const flags = flagsOf(j.callback, "auth_token");
    expect(flags).toMatch(/HttpOnly/i); expect(flags).toMatch(/SameSite=Lax/i); expect(flags).toMatch(/Path=\//); expect(flags).toMatch(/Max-Age=28800/);
    expect(flagsOf(j.callback, "sso_txn")).toMatch(/sso_txn=;/);
    const me = await (await get(`${appBase}/api/auth/me`, j.session)).json();
    expect(me.user).toMatchObject({ username: "ana@hilti.example", role: "admin" });
    expect((await (await get(`${appBase}/api/protected`, j.session)).json()).user.userId).toBe("sso-1");
  });

  it("creates the person on their first sign-in, with no password that works", async () => {
    await signIn();
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ username: "ana@hilti.example", email: "ana@hilti.example", role: "admin", organizationId: "org-default", authSource: "sso", externalId: `${idp.tenantId}:00000000-0000-0000-0000-000000000001` });
    for (const attempt of ["", NO_PASSWORD, "anything", "ana@hilti.example"]) expect(await comparePassword(attempt, NO_PASSWORD)).toBe(false);
  });

  it("recognises them next time, and does not make a second account", async () => {
    await signIn();
    const again = await signIn();
    expect(again.session).toBeDefined();
    expect(people).toHaveLength(1);
  });

  it("works out the role again every time: Entra changing it changes it, and removing it removes access", async () => {
    await signIn();
    idp.profile = { ...idp.profile, roles: ["Astra.Finance"] };
    const demoted = await signIn();
    expect(jwt.decode(demoted.session!.split("=")[1]) as any).toMatchObject({ role: "finance" });
    expect(people[0].role).toBe("finance");
    idp.profile = { ...idp.profile, roles: [] };
    const out = await signIn();
    expect(out.location).toBe("/login?sso_error=no_role");
    expect(out.session).toBeUndefined();
  });

  it("uses the default role for a person with none that is mapped, when there is one", async () => {
    configure({ roles: { map: { "Astra.Admin": "admin" }, default: "domain_expert" } });
    idp.profile = { ...idp.profile, roles: [] };
    const j = await signIn();
    expect(jwt.decode(j.session!.split("=")[1]) as any).toMatchObject({ role: "domain_expert" });
  });

  it("puts new people in the organization it names", async () => {
    configure({ organizationId: "org-hilti" });
    const j = await signIn();
    expect(jwt.decode(j.session!.split("=")[1]) as any).toMatchObject({ organizationId: "org-hilti" });
  });

  it("lasts as long as it is set to", async () => {
    configure({ sessionHours: 2 });
    const j = await signIn();
    const t = jwt.decode(j.session!.split("=")[1]) as any;
    expect(t.exp - t.iat).toBe(2 * 3600);
    expect(flagsOf(j.callback, "auth_token")).toMatch(/Max-Age=7200/);
  });

  it("goes back to the page they asked for, but never to another site", async () => {
    expect((await signIn({ returnTo: "/agents?tab=runs" })).location).toBe("/agents?tab=runs");
    expect((await signIn({ returnTo: "https://evil.example/phish" })).location).toBe("/");
    expect((await signIn({ returnTo: "//evil.example" })).location).toBe("/");
  });

  it("records who signed in", async () => {
    await signIn();
    const e = h.audit.find((x) => x.action === "auth.sso_login")!;
    expect(e).toMatchObject({ actorType: "user", actorId: "sso-1", objectType: "user", objectId: "sso-1", organizationId: "org-default" });
    expect(JSON.parse(e.details)).toEqual({ created: true, role: "admin", provider: "entra" });
    expect(e.details).not.toContain("ana@hilti.example");
  });

  it("the token endpoint was asked with the secret and the verifier, once", async () => {
    await signIn();
    expect(idp.tokenRequests).toHaveLength(1);
    expect(idp.tokenRequests[0].body).toMatchObject({ grant_type: "authorization_code", client_id: idp.clientId, client_secret: idp.clientSecret });
    expect(idp.tokenRequests[0].body.code_verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("who they are is who Entra says, not what an address says", () => {
  it("is not linked to a local account with the same name or e-mail", async () => {
    h.rows.push({ id: "local-1", username: "ana@hilti.example", password: "salt:hash", email: "ana@hilti.example", role: "admin", organizationId: "org-default" });
    const j = await signIn();
    expect(j.session).toBeDefined();
    expect(people).toHaveLength(1);
    expect(people[0].id).not.toBe("local-1");
    expect(people[0].username).toMatch(/^ana@hilti\.example-[0-9a-f]{6}$/);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ id: "local-1", role: "admin" });
  });

  it("two people with the same e-mail are two accounts", async () => {
    await signIn();
    idp.profile = { ...idp.profile, oid: "00000000-0000-0000-0000-000000000002" };
    await signIn();
    expect(people.map((p) => p.externalId)).toEqual([`${idp.tenantId}:00000000-0000-0000-0000-000000000001`, `${idp.tenantId}:00000000-0000-0000-0000-000000000002`]);
    expect(new Set(people.map((p) => p.username)).size).toBe(2);
  });

  it("a person whose e-mail changes at Entra is still the same account", async () => {
    await signIn();
    idp.profile = { ...idp.profile, email: "ana.new@hilti.example", upn: "ana.new@hilti.example" };
    await signIn();
    expect(people).toHaveLength(1);
    expect(people[0].email).toBe("ana.new@hilti.example");
  });

  it("uses the object id for someone with no e-mail at all", async () => {
    idp.profile = { oid: "00000000-0000-0000-0000-0000000000aa", roles: ["Astra.Admin"], amr: ["mfa"] };
    const j = await signIn();
    expect(j.session).toBeDefined();
    expect(people[0].username).toBe("sso-00000000-0000-0000-0000-0000000000aa");
    expect(people[0].email).toBeNull();
  });

  it("two first sign-ins at the same moment make one account", async () => {
    const [a, b] = await Promise.all([signIn(), signIn()]);
    expect(a.session).toBeDefined();
    expect(b.session).toBeDefined();
    expect(people).toHaveLength(1);
  });

  it("two first sign-ins resolved at the very same instant make one account, and both are let in", async () => {
    const cfg = readSsoConfig(process.env)!;
    const claims = { tenantId: idp.tenantId, oid: "00000000-0000-0000-0000-000000000077", email: "race@hilti.example", upn: "race@hilti.example", name: null, roles: ["Astra.Admin"], amr: ["mfa"] };
    const [a, b] = await Promise.all([resolveUser(cfg, claims, memStore), resolveUser(cfg, claims, memStore)]);
    expect(a.ok && b.ok).toBe(true);
    expect(people).toHaveLength(1);
    expect([a, b].filter((r) => r.ok && r.created)).toHaveLength(1);
    expect((a as any).user.id).toBe((b as any).user.id);
  });
});

describe("a sign-in that is not genuine leaves no session and no account", () => {
  it("with no sign-in in progress (no cookie)", async () => { denied(await signIn({ txnCookie: () => undefined }), "invalid_state"); });
  it("with a cookie that has been altered", async () => { denied(await signIn({ txnCookie: (c) => c.slice(0, -3) + "AAA" }), "invalid_state"); });
  it("with a cookie from a different sign-in than the answer", async () => {
    const other = await get(`${appBase}/api/auth/sso/login`);
    const otherTxn = cookieOf(other, "sso_txn")!;
    denied(await signIn({ txnCookie: () => otherTxn }), "invalid_state");
  });
  it("with a state that is not the one sent", async () => { denied(await signIn({ callbackQuery: (q) => q.set("state", "forged-state-value") }), "invalid_state"); });
  it("with no state", async () => { denied(await signIn({ callbackQuery: (q) => q.delete("state") }), "invalid_state"); });
  it("with no code", async () => { denied(await signIn({ callbackQuery: (q) => q.delete("code") }), "invalid_state"); });
  it("with a cookie that has expired", async () => {
    const real = Date.now;
    const j = await signIn({ txnCookie: (c) => { vi.spyOn(Date, "now").mockImplementation(() => real() + 11 * 60_000); return c; } });
    vi.restoreAllMocks();
    expect(j.location).toBe("/login?sso_error=invalid_state");
    expect(j.session).toBeUndefined();
  });
  it("when Microsoft sends the person back with an error", async () => {
    idp.authorizeError = { error: "access_denied", description: "AADSTS50105: user not assigned a role" };
    denied(await signIn(), "idp_error");
  });
  it("when the code is replayed", async () => {
    let replay = "";
    await signIn({ callbackQuery: (q) => { replay = q.get("code")!; } });
    const second = await signIn({ callbackQuery: (q) => q.set("code", replay) });
    people.length = 0; h.audit.length = 0;
    expect(second.location).toBe("/login?sso_error=token_exchange_failed");
    expect(second.session).toBeUndefined();
  });
  it("when the client secret is wrong", async () => {
    process.env.ASTRA_SSO_CLIENT_SECRET = "not-the-secret";
    denied(await signIn(), "token_exchange_failed");
  });
  it("when Microsoft's token endpoint fails", async () => {
    idp.tokenError = { status: 500, body: { error: "server_error" } };
    denied(await signIn(), "token_exchange_failed");
  });

  const forged = (name: string, setup: () => void, code = "invalid_token") => it(`with an ID token that ${name}`, async () => { setup(); denied(await signIn(), code); });
  forged("is for another application", () => { idp.mutateClaims = (c) => ({ ...c, aud: "some-other-app" }); });
  forged("comes from another issuer", () => { idp.mutateClaims = (c) => ({ ...c, iss: "https://evil.example/" + idp.tenantId + "/v2.0" }); });
  forged("is for another tenant", () => { idp.mutateClaims = (c) => ({ ...c, tid: "99999999-9999-9999-9999-999999999999" }); });
  forged("has expired", () => { idp.mutateClaims = (c) => ({ ...c, exp: Math.floor(Date.now() / 1000) - 3600 }); });
  forged("is not valid yet", () => { idp.mutateClaims = (c) => ({ ...c, nbf: Math.floor(Date.now() / 1000) + 3600 }); });
  forged("answers a different nonce", () => { idp.mutateClaims = (c) => ({ ...c, nonce: "someone-elses-nonce" }); });
  forged("has no object id", () => { idp.mutateClaims = (c) => { const { oid, ...rest } = c; return rest; }; });
  forged("is signed with a key the tenant does not publish", () => { idp.forge = (c) => idp.signWithUnpublishedKey(c); });
  forged("has no signature", () => { idp.forge = (c) => unsignedToken(c); });
  forged("is signed with the public key as an HMAC secret", () => { idp.forge = (c) => jwt.sign(c, idp.publicKeyPem(), { algorithm: "HS256", keyid: "kid-1", noTimestamp: true }); });
  forged("is garbage", () => { idp.forge = () => "not.a.jwt"; });
  forged("has a payload altered after signing", () => {
    idp.forge = (c) => { const [h, , s] = idp.sign(c).split("."); return `${h}.${Buffer.from(JSON.stringify({ ...c, roles: ["Astra.Admin"], oid: "attacker" })).toString("base64url")}.${s}`; };
  });

  it("when MFA is required and the token does not show it", async () => {
    configure({ requireMfa: true });
    idp.profile = { ...idp.profile, amr: ["pwd"] };
    denied(await signIn(), "mfa_required");
  });
  it("lets the same person in when it does", async () => {
    configure({ requireMfa: true });
    expect((await signIn()).session).toBeDefined();
  });
  it("when the person has no role that is mapped", async () => {
    idp.profile = { ...idp.profile, roles: ["Unrelated"] };
    denied(await signIn(), "no_role");
  });
  it("when their e-mail is outside the allowed domains", async () => {
    configure({ allowedEmailDomains: ["hilti.com"] });
    denied(await signIn(), "domain_not_allowed");
  });
  it("and says why in the log, not in the address bar", async () => {
    idp.mutateClaims = (c) => ({ ...c, aud: "other" });
    const j = await signIn();
    expect(j.location).not.toMatch(/audience|aud/i);
    expect((console.warn as any).mock.calls.some((c: any[]) => /sign-in refused \(invalid_token\)/.test(String(c[0])))).toBe(true);
  });
});

describe("the tenant's signing keys", () => {
  it("are fetched once and reused", async () => {
    await signIn(); await signIn(); await signIn();
    expect(idp.keyRequests).toBe(1);
  });
  it("are fetched again when the tenant rotates to a key id we have not seen", async () => {
    await signIn();
    idp.rotateKey();
    // Within five minutes the refetch is not allowed, so the new key is not trusted yet...
    expect((await signIn()).location).toBe("/login?sso_error=invalid_token");
    expect(idp.keyRequests).toBe(1);
    // ...and after, it is.
    const real = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => real() + 6 * 60_000);
    people.length = 0; h.audit.length = 0;
    const j = await signIn();
    vi.restoreAllMocks();
    expect(j.session).toBeDefined();
    expect(idp.keyRequests).toBe(2);
  });
});

describe("the password form beside it", () => {
  it("is open to everyone by default", async () => {
    h.rows.push({ id: "u1", username: "eng", password: await (await import("../server/auth")).hashPassword("pw"), email: null, role: "agent_engineer", organizationId: "org-default" });
    const r = await fetch(`${appBase}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "eng", password: "pw" }) });
    expect(r.status).toBe(200);
  });

  it("leaves it to administrators when asked, and says so only after the password is right", async () => {
    configure({ localLogin: "admins-only" });
    const { hashPassword } = await import("../server/auth");
    h.rows.push({ id: "u1", username: "eng", password: await hashPassword("pw"), email: null, role: "agent_engineer", organizationId: "org-default" });
    h.rows.push({ id: "u2", username: "boss", password: await hashPassword("pw"), email: null, role: "admin", organizationId: "org-default" });
    const login = (username: string, password: string) => fetch(`${appBase}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const eng = await login("eng", "pw");
    expect(eng.status).toBe(403);
    expect((await eng.json()).message).toMatch(/limited to administrators/);
    expect(eng.headers.get("set-cookie")).toBeNull();
    expect((await login("eng", "wrong")).status).toBe(401);
    expect((await login("nobody", "pw")).status).toBe(401);
    expect((await login("boss", "pw")).status).toBe(200);
  });

  it("an SSO account cannot sign in with a password at all", async () => {
    await signIn();
    h.rows.push({ id: "x", username: people[0].username, password: NO_PASSWORD, email: null, role: "admin", organizationId: "org-default" });
    for (const password of [NO_PASSWORD, "", "password"]) {
      const r = await fetch(`${appBase}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: people[0].username, password: password || "x" }) });
      expect(r.status).toBe(401);
    }
  });
});

describe("it goes out under the outbound policy", () => {
  it("in enforce, a token endpoint outside the policy is refused and the sign-in fails closed", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.PORT = "9";
    const j = await signIn();
    expect(j.location).toBe("/login?sso_error=token_exchange_failed");
    expect(j.session).toBeUndefined();
    expect(idp.tokenRequests).toHaveLength(0);
  });
});

describe("it is wired in", () => {
  const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("the only paths that skip the session check are the sign-in routes and the two SSO ones", () => {
    const m = /const AUTH_EXEMPT_PATHS = \[([\s\S]*?)\];/.exec(src("server/auth.ts"))!;
    expect([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])).toEqual(["/auth/login", "/auth/register", "/auth/mode", "/auth/sso/login", "/auth/sso/callback"]);
  });

  it("is validated at boot and mounted beside, not instead of, the password routes", () => {
    expect(src("server/config.ts")).toContain("errors.push(...validateSsoEnv())");
    const r = src("server/routes.ts");
    expect(r.indexOf("app.use(authRouter);")).toBeGreaterThan(0);
    expect(r.indexOf("app.use(ssoRouter);")).toBeGreaterThan(r.indexOf("app.use(authRouter);"));
  });

  it("the password routes still call the same functions in the same order", () => {
    const a = src("server/routes/auth.ts");
    const login = a.slice(a.indexOf('router.post("/api/auth/login"'), a.indexOf('router.post("/api/auth/register"'));
    expect(login.indexOf("comparePassword(")).toBeLessThan(login.indexOf("admins-only"));
    expect(login.indexOf("admins-only")).toBeLessThan(login.indexOf("generateToken("));
  });

  it("the new columns are added without touching anyone who already exists", () => {
    const db = src("server/db.ts");
    expect(db).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_source TEXT NOT NULL DEFAULT 'local';");
    expect(db).toContain("ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;");
    expect(db).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id ON users (external_id) WHERE external_id IS NOT NULL;");
  });

  it("never logs the secret or an ID token", () => {
    const code = src("server/sso.ts") + src("server/routes/sso.ts");
    for (const m of code.matchAll(/console\.(warn|error|log)\(([^)]*)\)/g)) expect(m[2], m[0]).not.toMatch(/clientSecret|idToken|id_token|code_verifier|\.v\b/);
  });
});
