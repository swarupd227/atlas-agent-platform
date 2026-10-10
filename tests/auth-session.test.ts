/**
 * What the session cookie costs and means today (server/auth.ts authMiddleware).
 *
 * This file PINS three properties of it. It was written and passed against the code before sessions
 * could be revoked, so adding revocation for people who sign in with Microsoft cannot quietly change
 * them for anyone else:
 *   - a request carrying a password-sign-in cookie reads nothing from the database;
 *   - the sign-in routes that are open to everyone still recognise a valid cookie, and only a valid one;
 *   - the token's claims reach the request exactly as they were signed.
 * Real Express, the real middleware; only the database is a stand-in that counts what is asked of it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({ queries: 0 }));

vi.mock("../server/db", () => {
  const ask = () => { h.queries++; return Promise.resolve([]); };
  const chain: any = { from: () => chain, where: () => chain, then: (res: any, rej: any) => ask().then(res, rej) };
  return { pool: {}, db: { select: () => chain, insert: () => ({ values: () => ({ returning: ask }) }), update: () => ({ set: () => ({ where: ask }) }) } };
});

import { authMiddleware, generateToken } from "../server/auth";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authMiddleware);
  app.get("/api/protected", (req, res) => res.json({ user: req.authUser ?? null }));
  // Stand-ins for the routes the middleware lets through without a session.
  app.get("/api/auth/mode", (req, res) => res.json({ user: req.authUser ?? null }));
  app.post("/api/auth/register", (req, res) => res.json({ user: req.authUser ?? null }));
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const saved = { mode: process.env.SECURITY_MODE, jwt: process.env.JWT_SECRET };
beforeEach(() => {
  process.env.SECURITY_MODE = "production";
  process.env.JWT_SECRET = "test-secret-for-sessions";
  h.queries = 0;
});
afterEach(() => {
  for (const [k, v] of [["SECURITY_MODE", saved.mode], ["JWT_SECRET", saved.jwt]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const get = async (p: string, cookie?: string, method = "GET") => {
  const r = await fetch(base + p, { method, headers: cookie ? { Cookie: cookie } : {} });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};
const person = { userId: "u1", username: "ana", role: "agent_engineer", email: "ana@example.com", organizationId: "org-1" };
const cookieFor = (claims: Record<string, unknown> = person) => `auth_token=${generateToken(claims as any)}`;

describe("a request with a valid cookie", () => {
  it("reads nothing from the database: the cookie alone says who the person is", async () => {
    for (const p of ["/api/protected", "/api/auth/mode"]) await get(p, cookieFor());
    await get("/api/auth/register", cookieFor(), "POST");
    expect(h.queries).toBe(0);
  });

  it("is believed even when the person is nowhere in the database (a local session is not revocable today)", async () => {
    // The database stand-in knows nobody at all; the session still stands.
    const r = await get("/api/protected", cookieFor());
    expect(r).toMatchObject({ status: 200, body: { user: { userId: "u1", username: "ana", role: "agent_engineer" } } });
  });

  it("arrives at the route with exactly the claims it was signed with, extra ones included", async () => {
    const r = await get("/api/protected", cookieFor({ ...person, role: "compliance_security", custom: "kept" }));
    const { iat, exp, ...claims } = r.body.user;
    expect(claims).toEqual({ ...person, role: "compliance_security", custom: "kept" });
    expect(typeof iat).toBe("number");
    expect(typeof exp).toBe("number");
  });
});

describe("the routes open to everyone", () => {
  it("recognise a valid cookie when there is one, so an administrator can add people", async () => {
    expect((await get("/api/auth/register", cookieFor({ ...person, role: "admin" }), "POST")).body.user).toMatchObject({ userId: "u1", role: "admin" });
    expect((await get("/api/auth/mode", cookieFor())).body.user).toMatchObject({ userId: "u1" });
  });

  it("answer a request with no cookie, a bad cookie or a cookie with no organization as anyone's, and never refuse it", async () => {
    const noOrg = `auth_token=${generateToken({ userId: "u", username: "u", role: "admin", email: null })}`;
    const forged = `auth_token=${jwt.sign(person, "some-other-secret")}`;
    for (const cookie of [undefined, "auth_token=garbage", forged, noOrg]) {
      expect(await get("/api/auth/register", cookie, "POST"), String(cookie)).toMatchObject({ status: 200, body: { user: null } });
      expect(await get("/api/auth/mode", cookie), String(cookie)).toMatchObject({ status: 200, body: { user: null } });
    }
    expect(h.queries).toBe(0);
  });
});

describe("a request that must be signed in", () => {
  it("is refused with the same words for no cookie, a bad one, and one with no organization", async () => {
    expect(await get("/api/protected")).toMatchObject({ status: 401, body: { message: "Authentication required" } });
    expect(await get("/api/protected", "auth_token=garbage")).toMatchObject({ status: 401, body: { message: "Invalid or expired token" } });
    const noOrg = `auth_token=${generateToken({ userId: "u", username: "u", role: "admin", email: null })}`;
    expect(await get("/api/protected", noOrg)).toMatchObject({ status: 403, body: { message: "User is not assigned to an organization" } });
    expect(h.queries).toBe(0);
  });

  it("in demo mode is let through with no cookie and no query", async () => {
    process.env.SECURITY_MODE = "demo";
    expect((await get("/api/protected")).status).toBe(200);
    expect(h.queries).toBe(0);
  });
});
