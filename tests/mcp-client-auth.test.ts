/**
 * A credential configured on an MCP server has to reach the server on every call.
 *
 * mcp-client.ts took the auth record as an optional last argument and sent
 * credentials only when it was passed. The health scan passed it; agent tool
 * calls, Initialize and catalog sync did not, so a Bearer token or API key
 * configured on a streamable-HTTP server went out on health probes and on
 * nothing else. These tests stand up a real HTTP server and read the headers
 * that actually arrive, so they check what the server received, not what the
 * code meant to send.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const getMcpServerAuth = vi.fn();
vi.mock("../server/storage", () => ({ storage: { getMcpServerAuth: (...a: unknown[]) => getMcpServerAuth(...a) } }));

import { buildMcpAuthHeaders, mcpCallTool, mcpInitialize, mcpListPrompts, mcpListResources, mcpListTools } from "../server/mcp-client";

let http: Server;
let url = "";
let seen: Array<Record<string, string | string[] | undefined>> = [];
let nextId = 0;

beforeAll(async () => {
  http = createServer((req, res) => {
    seen.push(req.headers);
    req.resume();
    // Every request is refused, so each call rejects. Only the headers matter.
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => { await new Promise<void>((r) => http.close(() => r())); });
beforeEach(() => { seen = []; getMcpServerAuth.mockReset(); });

// A fresh id per test: the client caches one connection per server id.
const server = () => ({ id: `srv-${++nextId}`, name: "t", url, transportType: "streamable-http" }) as any;
const auth = (authType: string, config: Record<string, unknown>) => ({ serverId: "x", authType, config }) as any;
const sent = (name: string) => seen.map((h) => h[name]).filter(Boolean);

const calls: Array<[string, (s: any) => Promise<unknown>]> = [
  ["mcpListTools", (s) => mcpListTools(s)],
  ["mcpCallTool", (s) => mcpCallTool(s, "t", {})],
  ["mcpInitialize", (s) => mcpInitialize(s)],
  ["mcpListResources", (s) => mcpListResources(s)],
  ["mcpListPrompts", (s) => mcpListPrompts(s)],
];

describe("a credential configured on the server is sent when the caller passes no auth record", () => {
  for (const [name, call] of calls) {
    it(`${name} sends the stored Bearer token`, async () => {
      getMcpServerAuth.mockResolvedValue(auth("bearer", { token: "tok-123" }));
      await expect(call(server())).rejects.toThrow();
      expect(sent("authorization")).toContain("Bearer tok-123");
    });
  }

  it("sends a stored API key under its configured header name", async () => {
    getMcpServerAuth.mockResolvedValue(auth("api_key", { headerName: "x-api-key", value: "key-abc" }));
    await expect(mcpListTools(server())).rejects.toThrow();
    expect(sent("x-api-key")).toContain("key-abc");
  });

  it("looks the record up by the server's own id", async () => {
    getMcpServerAuth.mockResolvedValue(auth("bearer", { token: "t" }));
    const s = server();
    await expect(mcpListTools(s)).rejects.toThrow();
    expect(getMcpServerAuth).toHaveBeenCalledWith(s.id);
  });

  it("sends no credential, and does not fail on the lookup, for a server with none stored", async () => {
    getMcpServerAuth.mockResolvedValue(undefined);
    await expect(mcpListTools(server())).rejects.toThrow(/401|unauthor/i);
    expect(sent("authorization")).toEqual([]);
    expect(sent("x-api-key")).toEqual([]);
  });
});

describe("a caller that does pass auth keeps control of it", () => {
  it("an explicit record is used and nothing is looked up", async () => {
    await expect(mcpListTools(server(), auth("bearer", { token: "explicit" }))).rejects.toThrow();
    expect(sent("authorization")).toContain("Bearer explicit");
    expect(getMcpServerAuth).not.toHaveBeenCalled();
  });

  it("an explicit null means no credential and is not replaced by the stored one", async () => {
    getMcpServerAuth.mockResolvedValue(auth("bearer", { token: "stored" }));
    await expect(mcpListTools(server(), null)).rejects.toThrow();
    expect(sent("authorization")).toEqual([]);
    expect(getMcpServerAuth).not.toHaveBeenCalled();
  });
});

describe("credentials saved by the server detail page before it was fixed still resolve", () => {
  const s = { id: "s", url } as any;

  it("bearer_token with a token", async () => {
    expect(await buildMcpAuthHeaders(s, auth("bearer_token", { token: "old-tok" }))).toEqual({ Authorization: "Bearer old-tok" });
  });

  it("api_key saved as keyName / keyValue", async () => {
    expect(await buildMcpAuthHeaders(s, auth("api_key", { keyName: "X-Custom", keyValue: "old-key" }))).toEqual({ "X-Custom": "old-key" });
  });

  it("api_key keeps X-API-Key when no name was given", async () => {
    expect(await buildMcpAuthHeaders(s, auth("api_key", { value: "v" }))).toEqual({ "X-API-Key": "v" });
  });

  it("the current shapes win over the old ones", async () => {
    expect(await buildMcpAuthHeaders(s, auth("api_key", { headerName: "H", value: "new", keyName: "OLD", keyValue: "old" }))).toEqual({ H: "new" });
  });

  it("an empty value sends nothing", async () => {
    expect(await buildMcpAuthHeaders(s, auth("api_key", { keyName: "X", keyValue: "" }))).toEqual({});
    expect(await buildMcpAuthHeaders(s, auth("bearer", { token: "" }))).toEqual({});
  });
});

describe("the server detail page saves the shapes the client reads", () => {
  const page = readFileSync("client/src/pages/mcp-server-detail.tsx", "utf8");

  it("offers bearer, not bearer_token", () => {
    expect(page).toContain('<SelectItem value="bearer">');
    expect(page).not.toContain('value="bearer_token"');
  });

  it("saves bearer as {token} and api_key as {headerName, value}", () => {
    expect(page).toContain('authType === "bearer") config = { token: authToken }');
    expect(page).toContain("config = { headerName: authKeyName, value: authKeyValue }");
    expect(page).not.toContain("keyName: authKeyName");
  });
});
