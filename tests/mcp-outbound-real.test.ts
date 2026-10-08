/**
 * The MCP client under each ASTRA_OUTBOUND_POLICY mode, against a real HTTP server and the real
 * undici, with nothing mocked but the credential store. What the server receives is the evidence:
 * under "enforce" a refused target must not be contacted at all.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../server/storage", () => ({ storage: { getMcpServerAuth: async () => undefined } }));

import { mcpListTools } from "../server/mcp-client";

let http: Server;
let port = 0;
let url = "";
let requests = 0;
let nextId = 0;

beforeAll(async () => {
  http = createServer((req, res) => {
    requests++;
    req.resume();
    res.writeHead(401, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  port = (http.address() as AddressInfo).port;
  url = `http://127.0.0.1:${port}/mcp`;
});
afterAll(async () => { await new Promise<void>((r) => http.close(() => r())); });

const KEYS = ["ASTRA_OUTBOUND_POLICY", "PORT", "SECURITY_MODE"] as const;
const saved: Record<string, string | undefined> = {};
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  requests = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

// A fresh id per call: the client caches one connection per server id.
const list = () => mcpListTools({ id: `srv-${++nextId}`, url, transportType: "streamable-http" } as any);
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("the MCP client against a loopback server on a port that is not this server's own", () => {
  it("enforce: is refused before any connection is made", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.PORT = String(port + 1);
    await expect(list()).rejects.toThrow(/own port/);
    expect(requests).toBe(0);
  });

  it("enforce: connects when it is this server's own port", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.PORT = String(port);
    await expect(list()).rejects.toThrow();     // the test server answers 401; the point is that it was asked
    expect(requests).toBeGreaterThan(0);
  });

  it("enforce: connects on any port in demo mode", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "enforce";
    process.env.PORT = String(port + 1);
    process.env.SECURITY_MODE = "demo";
    await expect(list()).rejects.toThrow();
    expect(requests).toBeGreaterThan(0);
  });

  it("audit (the default): connects anyway, and says what enforce would have refused", async () => {
    process.env.PORT = String(port + 1);
    await expect(list()).rejects.toThrow();
    expect(requests).toBeGreaterThan(0);
    await flush();
    const said = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[outbound-policy] audit"));
    expect(said.length).toBeGreaterThan(0);
    expect(said[0]).toContain(`127.0.0.1:${port}`);
    expect(said[0]).toMatch(/mcp:srv-\d+/);
  });

  it("off: connects, and says nothing", async () => {
    process.env.ASTRA_OUTBOUND_POLICY = "off";
    process.env.PORT = String(port + 1);
    await expect(list()).rejects.toThrow();
    expect(requests).toBeGreaterThan(0);
    await flush();
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("[outbound-policy]"))).toEqual([]);
  });
});
