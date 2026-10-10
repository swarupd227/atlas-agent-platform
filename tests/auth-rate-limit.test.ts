/**
 * The sign-in routes are rate limited, per client address: 20 attempts in 15 minutes across login and
 * register, then 429. Pinned before single sign-on was added so that adding another way to sign in
 * cannot loosen the way a password is protected from guessing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../server/db", () => ({
  pool: {},
  db: { select: () => ({ from: () => ({ then: (r: any) => Promise.resolve([]).then(r), where: () => Promise.resolve([]) }) }), insert: () => ({ values: () => ({ returning: async () => [] }) }) },
}));
vi.mock("../server/storage", () => ({ storage: { seedDefaultOrganization: vi.fn(async () => ({ id: "org-1" })) } }));

import authRouter from "../server/routes/auth";
import { authMiddleware } from "../server/auth";

let server: Server;
let base = "";
const saved = { mode: process.env.SECURITY_MODE, jwt: process.env.JWT_SECRET };
beforeAll(async () => {
  process.env.SECURITY_MODE = "production";
  process.env.JWT_SECRET = "rate-limit-test";
  const app = express();
  app.set("trust proxy", false);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authMiddleware);
  app.use(authRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  for (const [k, v] of [["SECURITY_MODE", saved.mode], ["JWT_SECRET", saved.jwt]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("the sign-in routes", () => {
  it("allow twenty attempts and then refuse, whichever of login and register they are", async () => {
    const attempt = (path: string) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "nobody", password: "wrong" }) });
    for (let i = 0; i < 20; i++) {
      const r = await attempt(i % 2 === 0 ? "/api/auth/login" : "/api/auth/register");
      expect(r.status, `attempt ${i + 1}`).not.toBe(429);
    }
    const blocked = await attempt("/api/auth/login");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ message: "Too many authentication attempts. Try again in a few minutes." });
    expect((await attempt("/api/auth/register")).status).toBe(429);
  });

  it("do not limit looking at the mode", async () => {
    expect((await fetch(base + "/api/auth/mode")).status).toBe(200);
  });
});
