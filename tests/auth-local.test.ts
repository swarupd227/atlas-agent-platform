/**
 * Local sign-in, as it behaves today (server/routes/auth.ts, server/auth.ts).
 *
 * This file PINS it. It was written and passed against the code before single sign-on was added, so
 * nothing that follows can change how a person signs in with a user name and password, registers,
 * or is recognised on the next request. Real Express, the real routes and the real middleware; only
 * the database is a stand-in.
 */
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({ rows: [] as any[] }));

/** The values bound into a drizzle condition, e.g. the user name in eq(users.username, name). */
function paramsOf(node: any, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  if (node.constructor?.name === "Param") out.push(node.value);
  if (Array.isArray(node)) node.forEach((n) => paramsOf(n, out));
  else if (Array.isArray(node.queryChunks)) node.queryChunks.forEach((n: any) => paramsOf(n, out));
  return out;
}

vi.mock("../server/db", () => ({
  pool: {},
  db: {
    select: () => ({
      from: () => {
        const all = () => Promise.resolve(h.rows.slice());
        return {
          then: (res: any, rej: any) => all().then(res, rej),
          where: (cond: any) => {
            const vals = paramsOf(cond);
            return Promise.resolve(h.rows.filter((r) => vals.includes(r.username) || vals.includes(r.id)));
          },
        };
      },
    }),
    insert: () => ({
      values: (v: any) => ({
        returning: async () => {
          if (h.rows.some((r) => r.username === v.username)) throw new Error('duplicate key value violates unique constraint "users_username_unique"');
          const row = { id: `u${h.rows.length + 1}`, email: null, role: null, organizationId: null, ...v };
          h.rows.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ catch: () => {} }) }) }),
  },
}));
vi.mock("../server/storage", () => ({ storage: { seedDefaultOrganization: vi.fn(async () => ({ id: "org-1" })) } }));
// The limiter has its own file (auth-rate-limit.test.ts); here it must not get in the way.
vi.mock("../server/rate-limits", () => ({ authRateLimiter: (_q: any, _s: any, next: any) => next() }));

import authRouter from "../server/routes/auth";
import { authMiddleware, comparePassword, hashPassword, generateToken } from "../server/auth";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authMiddleware);
  app.use(authRouter);
  app.get("/api/protected", (req, res) => res.json({ user: req.authUser }));
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const saved = { mode: process.env.SECURITY_MODE, jwt: process.env.JWT_SECRET, node: process.env.NODE_ENV };
beforeEach(() => {
  process.env.SECURITY_MODE = "production";
  process.env.JWT_SECRET = "test-secret-for-local-auth";
  h.rows.length = 0;
});
afterEach(() => {
  for (const [k, v] of [["SECURITY_MODE", saved.mode], ["JWT_SECRET", saved.jwt], ["NODE_ENV", saved.node]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const call = async (method: string, p: string, opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) => {
  const r = await fetch(base + p, {
    method, redirect: "manual",
    headers: { "Content-Type": "application/json", ...(opts.cookie ? { Cookie: opts.cookie } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  const setCookie = r.headers.get("set-cookie");
  return { status: r.status, body, setCookie, cookie: setCookie?.split(";")[0] };
};
const addUser = async (u: Record<string, unknown>) => { h.rows.push({ id: `u${h.rows.length + 1}`, email: null, role: "agent_engineer", organizationId: "org-1", ...u }); };
const withPassword = async (username: string, password: string, extra: Record<string, unknown> = {}) =>
  addUser({ username, password: await hashPassword(password), ...extra });
const tokenOf = (setCookie: string | null) => jwt.decode(/auth_token=([^;]+)/.exec(setCookie ?? "")?.[1] ?? "") as any;

describe("the mode", () => {
  it("is production unless demo is asked for, and says nothing else", async () => {
    expect(await call("GET", "/api/auth/mode")).toMatchObject({ status: 200, body: { mode: "production" } });
    expect(Object.keys((await call("GET", "/api/auth/mode")).body)).toEqual(["mode"]);
    process.env.SECURITY_MODE = "demo";
    expect((await call("GET", "/api/auth/mode")).body).toEqual({ mode: "demo" });
    delete process.env.SECURITY_MODE;
    expect((await call("GET", "/api/auth/mode")).body).toEqual({ mode: "production" });
  });
});

describe("signing in with a user name and password", () => {
  it("asks for both", async () => {
    for (const body of [{}, { username: "a" }, { password: "p" }, { username: "", password: "p" }]) {
      expect(await call("POST", "/api/auth/login", { body })).toMatchObject({ status: 400, body: { message: "Username and password are required" } });
    }
  });

  it("refuses an unknown user and a wrong password in the same words", async () => {
    await withPassword("ana", "right");
    const unknown = await call("POST", "/api/auth/login", { body: { username: "nobody", password: "right" } });
    const wrong = await call("POST", "/api/auth/login", { body: { username: "ana", password: "wrong" } });
    expect(unknown).toMatchObject({ status: 401, body: { message: "Invalid credentials" }, setCookie: null });
    expect(wrong).toMatchObject({ status: 401, body: { message: "Invalid credentials" }, setCookie: null });
  });

  it("signs a person in: the user, and a 24-hour cookie that carries who they are", async () => {
    await withPassword("ana", "right", { email: "ana@example.com", role: "compliance_security", organizationId: "org-9" });
    const r = await call("POST", "/api/auth/login", { body: { username: "ana", password: "right" } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, user: { id: "u1", username: "ana", role: "compliance_security", email: "ana@example.com", organizationId: "org-9" } });
    const t = tokenOf(r.setCookie);
    expect(t).toMatchObject({ userId: "u1", username: "ana", role: "compliance_security", email: "ana@example.com", organizationId: "org-9" });
    expect(t.exp - t.iat).toBe(24 * 60 * 60);
    expect(Object.keys(t).sort()).toEqual(["email", "exp", "iat", "organizationId", "role", "userId", "username"]);
  });

  it("sets the cookie httpOnly, SameSite=Lax, for the whole site, for a day; Secure only in production builds", async () => {
    await withPassword("ana", "right");
    const flags = (await call("POST", "/api/auth/login", { body: { username: "ana", password: "right" } })).setCookie!;
    expect(flags).toMatch(/^auth_token=/);
    expect(flags).toMatch(/HttpOnly/i);
    expect(flags).toMatch(/SameSite=Lax/i);
    expect(flags).toMatch(/Path=\//);
    expect(flags).toMatch(/Max-Age=86400/);
    expect(flags).not.toMatch(/Secure/i);
    process.env.NODE_ENV = "production";
    expect((await call("POST", "/api/auth/login", { body: { username: "ana", password: "right" } })).setCookie).toMatch(/Secure/i);
  });

  it("gives a person with no role the default one", async () => {
    await withPassword("bo", "pw", { role: null });
    const r = await call("POST", "/api/auth/login", { body: { username: "bo", password: "pw" } });
    expect(tokenOf(r.setCookie).role).toBe("agent_engineer");
  });

  it("lets the cookie it sets be used on the next request", async () => {
    await withPassword("ana", "right");
    const login = await call("POST", "/api/auth/login", { body: { username: "ana", password: "right" } });
    const me = await call("GET", "/api/auth/me", { cookie: login.cookie });
    expect(me.status).toBe(200);
    expect(me.body.mode).toBe("production");
    expect(me.body.user).toMatchObject({ userId: "u1", username: "ana", role: "agent_engineer" });
    expect((await call("GET", "/api/protected", { cookie: login.cookie })).body.user.username).toBe("ana");
  });

  it("in demo mode answers with the demo user and sets no cookie", async () => {
    process.env.SECURITY_MODE = "demo";
    const r = await call("POST", "/api/auth/login", { body: {} });
    expect(r).toMatchObject({ status: 200, body: { success: true, user: { username: "demo", role: "admin", email: null } }, setCookie: null });
  });
});

describe("registering", () => {
  it("the first account is the administrator, whatever role it asks for, and is signed in", async () => {
    const r = await call("POST", "/api/auth/register", { body: { username: "first", password: "pw", email: "f@x.io", role: "finance" } });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: "first", role: "admin", email: "f@x.io", organizationId: "org-1" });
    expect(tokenOf(r.setCookie)).toMatchObject({ username: "first", role: "admin" });
    expect(h.rows[0].password).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it("after that only an administrator can add people", async () => {
    await withPassword("admin", "pw", { role: "admin" });
    await withPassword("eng", "pw", { role: "agent_engineer" });
    expect((await call("POST", "/api/auth/register", { body: { username: "new", password: "pw" } })).status).toBe(403);
    const engLogin = await call("POST", "/api/auth/login", { body: { username: "eng", password: "pw" } });
    expect((await call("POST", "/api/auth/register", { body: { username: "new", password: "pw" }, cookie: engLogin.cookie })).body).toEqual({ message: "Only admins can register new users" });
    expect(h.rows.map((r) => r.username)).toEqual(["admin", "eng"]);
  });

  it("an administrator adds a person with the role asked for, or the default", async () => {
    await withPassword("admin", "pw", { role: "admin" });
    const adm = await call("POST", "/api/auth/login", { body: { username: "admin", password: "pw" } });
    const a = await call("POST", "/api/auth/register", { body: { username: "n1", password: "pw", role: "finance" }, cookie: adm.cookie });
    const b = await call("POST", "/api/auth/register", { body: { username: "n2", password: "pw" }, cookie: adm.cookie });
    expect([a.status, a.body.user.role, b.status, b.body.user.role]).toEqual([200, "finance", 200, "agent_engineer"]);
  });

  it("refuses a name that is taken, and missing fields", async () => {
    await withPassword("admin", "pw", { role: "admin" });
    const adm = await call("POST", "/api/auth/login", { body: { username: "admin", password: "pw" } });
    expect(await call("POST", "/api/auth/register", { body: { username: "admin", password: "pw" }, cookie: adm.cookie })).toMatchObject({ status: 409, body: { message: "Username already exists" } });
    expect((await call("POST", "/api/auth/register", { body: { username: "x" }, cookie: adm.cookie })).status).toBe(400);
  });

  it("in demo mode answers with the demo user", async () => {
    process.env.SECURITY_MODE = "demo";
    expect((await call("POST", "/api/auth/register", { body: {} })).body).toEqual({ success: true, user: { username: "demo", role: "admin", email: null } });
  });
});

describe("being recognised, and signing out", () => {
  it("a request with no cookie is refused, except for the sign-in routes", async () => {
    expect(await call("GET", "/api/auth/me")).toMatchObject({ status: 401, body: { message: "Authentication required" } });
    expect(await call("GET", "/api/protected")).toMatchObject({ status: 401, body: { message: "Authentication required" } });
    expect((await call("GET", "/api/auth/mode")).status).toBe(200);
    expect((await call("POST", "/api/auth/login", { body: {} })).status).toBe(400);
  });

  it("a cookie that is not ours, or has expired, is refused", async () => {
    expect(await call("GET", "/api/protected", { cookie: "auth_token=garbage" })).toMatchObject({ status: 401, body: { message: "Invalid or expired token" } });
    const other = jwt.sign({ userId: "u", username: "u", role: "admin", email: null, organizationId: "o" }, "some-other-secret");
    expect((await call("GET", "/api/protected", { cookie: `auth_token=${other}` })).status).toBe(401);
    const expired = jwt.sign({ userId: "u", username: "u", role: "admin", email: null, organizationId: "o" }, "test-secret-for-local-auth", { expiresIn: -10 });
    expect((await call("GET", "/api/protected", { cookie: `auth_token=${expired}` })).status).toBe(401);
  });

  it("a token for someone with no organization is refused", async () => {
    const t = generateToken({ userId: "u", username: "u", role: "admin", email: null });
    expect(await call("GET", "/api/protected", { cookie: `auth_token=${t}` })).toMatchObject({ status: 403, body: { message: "User is not assigned to an organization" } });
  });

  it("in demo mode everything is open, and me answers with the role asked for", async () => {
    process.env.SECURITY_MODE = "demo";
    expect((await call("GET", "/api/protected")).status).toBe(200);
    expect((await call("GET", "/api/auth/me", { headers: { "x-role": "finance" } })).body).toEqual({ mode: "demo", user: { username: "demo", role: "finance", email: null } });
  });

  it("signing out clears the cookie (and, as today, needs a valid session to ask)", async () => {
    expect(await call("POST", "/api/auth/logout")).toMatchObject({ status: 401, body: { message: "Authentication required" } });
    await withPassword("ana", "right");
    const login = await call("POST", "/api/auth/login", { body: { username: "ana", password: "right" } });
    const r = await call("POST", "/api/auth/logout", { cookie: login.cookie });
    expect(r).toMatchObject({ status: 200, body: { success: true } });
    expect(r.setCookie).toMatch(/^auth_token=;/);
    expect(r.setCookie).toMatch(/Path=\//);
    expect(r.setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("passwords", () => {
  it("are stored as salt:hash and compared in full", async () => {
    const stored = await hashPassword("s3cret");
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await comparePassword("s3cret", stored)).toBe(true);
    expect(await comparePassword("s3cre", stored)).toBe(false);
    expect(await comparePassword("", stored)).toBe(false);
  });

  it("a stored value that is not salt:hash matches nothing, which is what lets an account be made that cannot sign in with a password", async () => {
    for (const unusable of ["!sso-no-password", "", "plain", ":", "abc:", ":abc"]) {
      expect(await comparePassword("anything", unusable), unusable).toBe(false);
      expect(await comparePassword("", unusable), unusable).toBe(false);
      expect(await comparePassword(unusable, unusable), unusable).toBe(false);
    }
  });
});
