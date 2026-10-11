/**
 * What the rate limiters count, and who they count it against.
 *
 * Found by a sweep on 2026-10-11:
 *  - the sign-in limiter counted per client address, and the server is behind a proxy that makes every client the same address, so
 *    twenty bad logins from anyone locked everybody out;
 *  - the agent-run limiter's key contained the `x-role` request header, which the caller chooses, so a caller who changed it on
 *    every request was never limited. That limiter exists to cap what an organization can spend on language models.
 *
 * Now: sign-in is counted per (address, user name) with a higher cap per address as the spray limit; agent runs per signed-in
 * user (or per API key's agent); and the address is the real client's when the deployment says how many proxies sit in front
 * (ASTRA_TRUST_PROXY), with a port suffix such as some platforms add (1.2.3.4:5678) taken off, because a key that changes with
 * every connection limits nothing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

let mode: "production" | "demo" = "production";
vi.mock("../server/auth", () => ({ getSecurityMode: () => mode }));

import { clientAddress, trustProxyHops, validateTrustProxyEnv } from "../server/client-address";

describe("clientAddress", () => {
  it("is the address itself for a plain one", () => {
    expect(clientAddress({ ip: "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("drops the port some platforms append to the forwarded address, so the key does not change with every connection", () => {
    expect(clientAddress({ ip: "203.0.113.7:51234" })).toBe("203.0.113.7");
    expect(clientAddress({ ip: "203.0.113.7:51234" })).toBe(clientAddress({ ip: "203.0.113.7:60001" }));
    expect(clientAddress({ ip: "[2001:db8::1]:443" })).toBe(clientAddress({ ip: "2001:db8::1" }));
  });

  it("counts an IPv6 client as its /56, so changing the low bits does not dodge a limit", () => {
    expect(clientAddress({ ip: "2001:db8:0:1::1" })).toBe(clientAddress({ ip: "2001:db8:0:1::ffff" }));
    expect(clientAddress({ ip: "2001:db8:0:1::1" })).not.toBe(clientAddress({ ip: "2001:db9:0:1::1" }));
  });

  it("is a fixed word when there is no address, not undefined", () => {
    expect(clientAddress({})).toBe("unknown");
    expect(clientAddress({ ip: "" })).toBe("unknown");
  });
});

describe("ASTRA_TRUST_PROXY", () => {
  it("is off when unset or empty", () => {
    expect(trustProxyHops({})).toBeNull();
    expect(trustProxyHops({ ASTRA_TRUST_PROXY: "" })).toBeNull();
    expect(validateTrustProxyEnv({})).toEqual([]);
  });

  it("is a number of proxies, 1 to 5", () => {
    expect(trustProxyHops({ ASTRA_TRUST_PROXY: "1" })).toBe(1);
    expect(trustProxyHops({ ASTRA_TRUST_PROXY: " 2 " })).toBe(2);
    expect(trustProxyHops({ ASTRA_TRUST_PROXY: "5" })).toBe(5);
  });

  it("refuses everything else, including 'true', which would trust whatever a caller puts in X-Forwarded-For", () => {
    for (const bad of ["true", "0", "6", "-1", "1.5", "loopback", "10.0.0.0/8", "yes"]) {
      expect(validateTrustProxyEnv({ ASTRA_TRUST_PROXY: bad }).length, bad).toBe(1);
      expect(() => trustProxyHops({ ASTRA_TRUST_PROXY: bad }), bad).toThrow(/ASTRA_TRUST_PROXY/);
    }
  });
});

// ── the limiters, running ─────────────────────────────────────────────────────────────────────────────────────
let server: Server;
let base = "";
let mods: typeof import("../server/rate-limits");

async function start() {
  vi.resetModules();
  mods = await import("../server/rate-limits");
  const app = express();
  app.use(express.json());
  // Stands in for the sign-in: the user id and agent id come from headers the test sets.
  app.use((req, _res, next) => {
    const u = req.headers["x-test-user"];
    if (typeof u === "string") (req as any).authUser = { userId: u, username: u, role: "agent_engineer", ...(req.headers["x-test-agent"] ? { apiKeyAgentId: String(req.headers["x-test-agent"]) } : {}) };
    next();
  });
  app.post("/login", mods.authRateLimiter, (_req, res) => res.status(401).json({ message: "no" }));
  app.post("/run", mods.llmInvokeRateLimiter, (_req, res) => res.json({ ok: true }));
  app.post("/assist", mods.aiAssistRateLimiter, (_req, res) => res.json({ ok: true }));
  app.post("/mcp", mods.mcpToolCallRateLimiter, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const stop = () => new Promise<void>((r) => (server ? server.close(() => r()) : r()));
const post = (p: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const burst = async (n: number, send: (i: number) => Promise<Response>) => { let refused = 0; for (let i = 0; i < n; i++) if ((await send(i)).status === 429) refused++; return refused; };

describe("sign-in", () => {
  beforeEach(async () => { await stop(); mode = "production"; await start(); });
  afterAll(stop);

  it("one user name guessed at twenty-one times is refused on the twenty-first, as before", async () => {
    const refused = await burst(21, () => post("/login", {}, { username: "admin", password: "x" }));
    expect(refused).toBe(1);
  });

  it("and the next person signing in from the same address (the proxy's) is not locked out by it", async () => {
    await burst(25, () => post("/login", {}, { username: "admin", password: "x" }));
    expect((await post("/login", {}, { username: "someone-else", password: "x" })).status).toBe(401);
  });

  it("a user name is the same user whatever its case or spacing", async () => {
    const refused = await burst(21, (i) => post("/login", {}, { username: i % 2 ? " Admin " : "ADMIN", password: "x" }));
    expect(refused).toBe(1);
  });

  it("guessing many different user names from one address is still stopped, at a higher count", async () => {
    const refused = await burst(310, (i) => post("/login", {}, { username: `user-${i}`, password: "x" }));
    expect(refused).toBeGreaterThan(0);
    expect(refused).toBeLessThan(30);
  });

  it("a forged X-Forwarded-For does not give an attacker a fresh budget when no proxy is trusted", async () => {
    const refused = await burst(21, (i) => post("/login", { "X-Forwarded-For": `198.51.100.${i + 1}` }, { username: "admin", password: "x" }));
    expect(refused).toBe(1);
  });
});

describe("agent runs", () => {
  beforeEach(async () => { await stop(); mode = "production"; await start(); });
  afterAll(stop);

  it("are limited per signed-in user whatever x-role says: changing it on every request buys nothing", async () => {
    const constant = await burst(125, () => post("/run", { "x-test-user": "u1", "x-role": "fixed" }));
    expect(constant).toBe(5);
    await stop(); await start();
    const rotating = await burst(125, (i) => post("/run", { "x-test-user": "u1", "x-role": `r${i}` }));
    expect(rotating).toBe(5);
  });

  it("one user using up the budget does not use up another's, though they share an address", async () => {
    await burst(125, () => post("/run", { "x-test-user": "u1" }));
    expect((await post("/run", { "x-test-user": "u1" })).status).toBe(429);
    expect((await post("/run", { "x-test-user": "u2" })).status).toBe(200);
  });

  it("an API key is counted as its agent", async () => {
    await burst(125, () => post("/run", { "x-test-user": "apikey:k1", "x-test-agent": "agent-1" }));
    expect((await post("/run", { "x-test-user": "apikey:k2", "x-test-agent": "agent-1" })).status).toBe(429);
    expect((await post("/run", { "x-test-user": "apikey:k3", "x-test-agent": "agent-2" })).status).toBe(200);
  });

  it("in demo mode, which has no signed-in user, the role header still keeps demo roles from starving each other", async () => {
    await stop(); mode = "demo"; await start();
    await burst(125, () => post("/run", { "x-role": "admin" }));
    expect((await post("/run", { "x-role": "admin" })).status).toBe(429);
    expect((await post("/run", { "x-role": "finance" })).status).toBe(200);
  });
});

describe("AI assist", () => {
  beforeEach(async () => { await stop(); mode = "production"; await start(); });
  afterAll(stop);

  it("is counted per user, and an unsigned caller is counted per address however it sets x-role", async () => {
    const refused = await burst(205, (i) => post("/assist", { "x-role": `r${i}` }));
    expect(refused).toBe(5);
  });
});

describe("the keys themselves", () => {
  it("agent runs and AI assist count an unsigned caller by the cleaned address: a port suffix does not make a new client", async () => {
    const { spendKey } = await import("../server/rate-limits");
    mode = "production";
    expect(spendKey({ ip: "203.0.113.7:50001", headers: {} } as any)).toBe(spendKey({ ip: "203.0.113.7:50002", headers: { "x-role": "anything" } } as any));
    expect(spendKey({ ip: "203.0.113.7:50001", headers: {} } as any)).toBe("203.0.113.7");
  });

  it("MCP tool calls count the agent behind the key, else the cleaned address", async () => {
    const { mcpToolCallKey } = await import("../server/rate-limits");
    expect(mcpToolCallKey({ authUser: { apiKeyAgentId: "agent-9" }, ip: "203.0.113.7:1" } as any)).toBe("agent-9");
    expect(mcpToolCallKey({ ip: "203.0.113.7:50001" } as any)).toBe("203.0.113.7");
    expect(mcpToolCallKey({ ip: "203.0.113.7:50002" } as any)).toBe("203.0.113.7");
  });

  it("the AI assist and agent-run limiters both use spendKey, and MCP uses mcpToolCallKey", () => {
    const limits = readFileSync(path.join(__dirname, "..", "server", "rate-limits.ts"), "utf8").split("\r\n").join("\n");
    expect(limits.match(/keyGenerator: spendKey,/g)?.length).toBe(2);
    expect(limits).toContain("keyGenerator: mcpToolCallKey,");
  });
});

describe("wiring", () => {
  const src = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");

  it("the server trusts the number of proxies the deployment names, and nothing otherwise", () => {
    const index = src("server/index.ts");
    expect(index).toContain('app.set("trust proxy", trustHops)');
    expect(index).toContain("trustProxyHops(process.env)");
    expect(src("server/config.ts")).toContain("validateTrustProxyEnv()");
  });

  it("no limiter keys on a raw req.ip or on the x-role header outside demo mode", () => {
    const limits = src("server/rate-limits.ts");
    expect(limits).not.toMatch(/ipKeyGenerator\(req\.ip/);
    expect(limits.match(/x-role/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("the single sign-on and widget limits use the cleaned address too", () => {
    expect(src("server/routes/sso.ts")).toContain("keyGenerator: (req) => clientAddress(req)");
    expect(src("server/routes/runtime.ts")).toContain('const rateLimitKey = token + ":" + clientAddress(req);');
  });
});
