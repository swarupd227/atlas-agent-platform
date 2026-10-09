/**
 * The lockdown mounts against real Express 5 routing and real HTTP. The mounts are read out of
 * server/routes.ts, so this tests what is mounted there, and a path that does not match (a
 * parameterised mount, a sub-path, a different method) shows up as a request that got through.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { llmKeyEntryGate, lockdownGate, lockdownPublicView } from "../server/lockdown";

const routesSrc = readFileSync("server/routes.ts", "utf8");
const mounts = [...routesSrc.matchAll(/app\.use\("([^"]+)", (lockdownGate\("(\w+)"\)|llmKeyEntryGate)\);/g)].map((m) => ({
  path: m[1], gate: m[3] ? lockdownGate(m[3] as any) : llmKeyEntryGate,
}));

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  for (const m of mounts) app.use(m.path, m.gate);
  app.get("/api/platform/lockdown", (_req, res) => res.json(lockdownPublicView()));
  // Stand-ins for the real routes behind each mount: anything that reaches one says so.
  app.all(/^\/api\/.*/, (req, res) => res.json({ reached: `${req.method} ${req.path}` }));
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const saved = process.env.ASTRA_LOCKDOWN;
beforeEach(() => { delete process.env.ASTRA_LOCKDOWN; });
afterEach(() => { if (saved === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = saved; });

const call = async (method: string, p: string) => {
  const r = await fetch(base + p, { method });
  const body: any = await r.json().catch(() => null);
  return { status: r.status, closed: r.status === 403 && body?.reason === "platform_lockdown", body };
};

it("found every mount in routes.ts", () => {
  expect(mounts.map((m) => m.path).sort()).toEqual(["/api/a2a", "/api/admin/llm-provider-keys", "/api/agents/:agentId/api-keys", "/api/gateway", "/api/marketplace", "/api/v1"]);
});

describe("nothing closed: every path is reached", () => {
  const paths: Array<[string, string]> = [
    ["GET", "/api/marketplace/servers"], ["POST", "/api/marketplace/servers/s1/install"], ["POST", "/api/marketplace/registry-sources/r1/sync"],
    ["POST", "/api/v1/runs"], ["POST", "/api/gateway/v1/invoke/ag-1"], ["POST", "/api/a2a/v1/agents/ag-1/message"],
    ["POST", "/api/agents/ag-1/api-keys"], ["GET", "/api/agents/ag-1/api-keys"], ["DELETE", "/api/agents/ag-1/api-keys/k1"],
    ["POST", "/api/admin/llm-provider-keys/openai"],
  ];
  for (const [method, p] of paths) it(`${method} ${p}`, async () => { expect((await call(method, p)).body?.reached).toBe(`${method} ${p}`); });
});

describe("marketplace off", () => {
  beforeEach(() => { process.env.ASTRA_LOCKDOWN = '{"marketplace":"off"}'; });
  for (const [method, p] of [["GET", "/api/marketplace/servers"], ["POST", "/api/marketplace/servers/s1/install"], ["PATCH", "/api/marketplace/registry-sources/r1"], ["POST", "/api/marketplace/registry-sources/r1/sync"], ["GET", "/api/marketplace"]]) {
    it(`closes ${method} ${p}`, async () => { expect((await call(method, p)).closed).toBe(true); });
  }
  it("leaves the rest alone", async () => {
    for (const [method, p] of [["POST", "/api/v1/runs"], ["POST", "/api/gateway/v1/invoke/ag-1"], ["GET", "/api/agents/ag-1/api-keys"], ["GET", "/api/mcp-servers"], ["GET", "/api/marketplacefoo"]]) {
      expect((await call(method, p)).closed, `${method} ${p}`).toBe(false);
    }
  });
});

describe("agent API keys off", () => {
  beforeEach(() => { process.env.ASTRA_LOCKDOWN = '{"apiKeys":{"agent":"off"}}'; });
  for (const [method, p] of [
    ["POST", "/api/agents/ag-1/api-keys"], ["GET", "/api/agents/ag-1/api-keys"], ["DELETE", "/api/agents/ag-1/api-keys/k1"],
    ["POST", "/api/gateway/v1/invoke/ag-1"], ["GET", "/api/gateway/v1/agents/ag-1"], ["POST", "/api/a2a/v1/agents/ag-1/message"], ["GET", "/api/a2a/v1/agents/ag-1/card"],
  ]) {
    it(`closes ${method} ${p}`, async () => { expect((await call(method, p)).closed).toBe(true); });
  }
  it("leaves the public API, the marketplace and the rest of an agent alone", async () => {
    for (const [method, p] of [["POST", "/api/v1/runs"], ["GET", "/api/marketplace/servers"], ["GET", "/api/agents/ag-1"], ["GET", "/api/agents/ag-1/knowledge-bases"]]) {
      expect((await call(method, p)).closed, `${method} ${p}`).toBe(false);
    }
  });
});

describe("public API off", () => {
  beforeEach(() => { process.env.ASTRA_LOCKDOWN = '{"apiKeys":{"publicApi":"off"}}'; });
  it("closes /api/v1 in full and nothing else", async () => {
    for (const p of ["/api/v1/runs", "/api/v1/runs/r1", "/api/v1/knowledge-bases/kb1/search", "/api/v1/integrations/n8n/call"]) expect((await call("POST", p)).closed, p).toBe(true);
    for (const p of ["/api/gateway/v1/invoke/ag-1", "/api/agents/ag-1/api-keys", "/api/marketplace/servers"]) expect((await call("POST", p)).closed, p).toBe(false);
  });
});

describe("LLM keys env-only", () => {
  beforeEach(() => { process.env.ASTRA_LOCKDOWN = '{"llmKeys":"env-only"}'; });
  it("refuses entering a key and nothing else under that path", async () => {
    expect((await call("POST", "/api/admin/llm-provider-keys/openai")).closed).toBe(true);
    for (const [method, p] of [["GET", "/api/admin/llm-provider-keys"], ["DELETE", "/api/admin/llm-provider-keys/openai"], ["POST", "/api/admin/llm-provider-keys/openai/test"]]) {
      expect((await call(method, p)).closed, `${method} ${p}`).toBe(false);
    }
  });
});

describe("the endpoint the app reads", () => {
  it("reports what is closed", async () => {
    process.env.ASTRA_LOCKDOWN = '{"marketplace":"off","llmKeys":"env-only"}';
    expect((await call("GET", "/api/platform/lockdown")).body).toEqual({ active: true, marketplace: "off", apiKeys: { agent: "on", publicApi: "on" }, llmKeys: "env-only" });
  });
});
