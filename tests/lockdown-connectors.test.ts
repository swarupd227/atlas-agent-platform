/**
 * The connector allow-list of the platform lockdown (connectors.allow): a connector of a type the
 * deployment does not allow is not offered to a model, cannot be called, cannot be created or
 * edited, and is never deleted. Storage is mocked; the dispatcher, the gates and Express routing
 * are the real ones.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const db = vi.hoisted(() => ({
  servers: new Map<string, any>(),
  marketplace: new Map<string, any>(),
  failLookups: false,
  getMcpServerCalls: 0,
}));

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn().mockResolvedValue({}),
    recordToolInvocation: vi.fn().mockResolvedValue({}),
    getAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Test Agent", riskTier: "LOW", autonomyMode: "autonomous", organizationId: null }),
    getAarConfig: vi.fn().mockResolvedValue(null),
    createAarActionDecision: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({ id: "approval-1" }),
    getLatestApprovalDecision: vi.fn().mockResolvedValue(undefined),
    getMcpServer: vi.fn(async (id: string) => { db.getMcpServerCalls++; if (db.failLookups) throw new Error("db down"); return db.servers.get(id); }),
    getMcpServerAuth: vi.fn().mockResolvedValue(undefined),
    getMcpServerTools: vi.fn().mockResolvedValue([]),
    getMarketplaceServer: vi.fn(async (id: string) => db.marketplace.get(id)),
    listAgentTaskClasses: vi.fn().mockResolvedValue([]),
    getActiveWarrant: vi.fn().mockResolvedValue(undefined),
    getAgentTeamMembers: vi.fn().mockResolvedValue([]),
    getSkillsByIds: vi.fn().mockResolvedValue([]),
    updateSkill: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../server/mcp-client", () => ({
  isRealMcpServer: vi.fn().mockReturnValue(false),
  mcpListTools: vi.fn().mockResolvedValue([]),
  mcpCallTool: vi.fn(),
  buildMcpAuthHeaders: vi.fn().mockResolvedValue({}),
}));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));

import { dispatchToolCall, executeTool, gatherAvailableTools, type AvailableTool } from "../server/tool-dispatcher";
import { storage } from "../server/storage";
import { LockdownError } from "../server/lockdown";
import {
  blockedConnectorKind, connectorCreateGate, exactly, marketplaceInstallGate, mcpServerMutationGate, registerServerGate,
} from "../server/connector-lockdown";

// The dispatcher tests stub the global fetch; the Express tests below need the real one.
const realFetch = globalThis.fetch;
const saved = process.env.ASTRA_LOCKDOWN;
const lock =(cfg: unknown) => { process.env.ASTRA_LOCKDOWN = JSON.stringify(cfg); };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete process.env.ASTRA_LOCKDOWN;
  db.servers.clear(); db.marketplace.clear(); db.failLookups = false; db.getMcpServerCalls = 0;
  db.servers.set("srv-mcp", { id: "srv-mcp", name: "Some MCP", url: "http://localhost:9999", transportType: "streamable-http", integrationId: null });
  db.servers.set("srv-api", { id: "srv-api", name: "Imported API", url: "http://localhost:9998", transportType: "rest-proxy", integrationId: null });
  db.servers.set("srv-jira", { id: "srv-jira", name: "Jira", url: "http://localhost:9997", transportType: "streamable-http", integrationId: "jira" });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ created: true }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(storage.createAuditEvent).mockClear();
});
afterEach(() => { if (saved === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = saved; vi.unstubAllGlobals(); });

const tool = (serverId: string): AvailableTool => ({
  serverId, serverName: serverId, serverUrl: "http://localhost:9999", toolName: "create_ticket", toolDescription: "x", toolInputSchema: {}, toolEndpoint: "/tickets", toolMethod: "POST",
});
const bundle = () => ({ appliedPolicies: [], blockedTools: [], toolAllowlist: [], monitorBlockedTools: [], blockedToolsToPolicyIds: {}, redactPatterns: [], guardrails: [] }) as any;

describe("blockedConnectorKind", () => {
  it("is null, and asks nothing, when connectors are not restricted", async () => {
    expect(await blockedConnectorKind("srv-mcp")).toBeNull();
    expect(db.getMcpServerCalls).toBe(0);
  });

  it("names the type when it is not allowed, and is null when it is", async () => {
    lock({ connectors: { allow: ["jira"] } });
    expect(await blockedConnectorKind("srv-mcp")).toBe("mcp");
    expect(await blockedConnectorKind("srv-api")).toBe("openapi");
    expect(await blockedConnectorKind("srv-jira")).toBeNull();
  });

  it("is null for a tool that is not a connector's (a built-in tool has no row)", async () => {
    lock({ connectors: { allow: [] } });
    expect(await blockedConnectorKind("builtin:document")).toBeNull();
  });

  it("blocks when the lookup itself fails: a lockdown does not wave a call through on an error", async () => {
    lock({ connectors: { allow: ["jira"] } });
    db.failLookups = true;
    expect(await blockedConnectorKind("srv-jira")).toBe("unverified");
  });
});

describe("calling a connector", () => {
  it("is refused when its type is not allowed: the call never runs, and it is recorded", async () => {
    lock({ connectors: { allow: ["jira"] } });
    const res = await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-mcp"), args: { title: "x" }, policyBundle: bundle() });
    expect(res).toMatchObject({ outcome: "gate_blocked_lockdown", ok: false });
    expect(res.reason).toMatch(/"mcp" connector type is disabled by this deployment's platform policy/);
    expect(fetchMock).not.toHaveBeenCalled();
    const audit = vi.mocked(storage.createAuditEvent).mock.calls.map((c) => c[0] as any).find((e) => e.action === "tool_blocked_lockdown");
    expect(audit).toMatchObject({ actorId: "platform_lockdown", objectId: "agent-1" });
    expect(JSON.parse(audit.details)).toMatchObject({ connectorKind: "mcp", toolName: "create_ticket" });
  });

  it("is refused before the other gates look at it", async () => {
    lock({ connectors: { allow: [] } });
    const b = bundle(); b.blockedTools = ["create_ticket"];
    const res = await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-mcp"), args: {}, policyBundle: b, skillAllowlist: new Set(["other"]) });
    expect(res.outcome).toBe("gate_blocked_lockdown");
  });

  it("goes ahead when the type is allowed", async () => {
    lock({ connectors: { allow: ["mcp"] } });
    const res = await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-mcp"), args: { title: "x" }, policyBundle: bundle() });
    expect(res.outcome).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an imported API is allowed or refused on its own type", async () => {
    lock({ connectors: { allow: ["mcp"] } });
    expect((await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-api"), args: {}, policyBundle: bundle() })).outcome).toBe("gate_blocked_lockdown");
    lock({ connectors: { allow: ["openapi"] } });
    expect((await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-api"), args: {}, policyBundle: bundle() })).outcome).toBe("success");
  });

  it("is untouched when nothing is restricted", async () => {
    const res = await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-mcp"), args: {}, policyBundle: bundle() });
    expect(res.outcome).toBe("success");
  });

  it("executeTool refuses too, for callers that do not go through the dispatcher", async () => {
    lock({ connectors: { allow: ["jira"] } });
    await expect(executeTool(tool("srv-mcp"), {}, null, "agent-1")).rejects.toThrow(LockdownError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed lookup stops the call", async () => {
    lock({ connectors: { allow: ["jira"] } });
    db.failLookups = true;
    const res = await dispatchToolCall({ agentId: "agent-1", tool: tool("srv-jira"), args: {}, policyBundle: bundle() });
    expect(res.outcome).toBe("gate_blocked_lockdown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("offering tools to a model", () => {
  it("leaves out a connector of a type that is not allowed", async () => {
    db.servers.get("srv-mcp").url = "http://localhost:9999";
    const { storage: st } = await import("../server/storage");
    vi.mocked(st.getMcpServerTools).mockImplementation(async (id: string) => [{ name: `tool_of_${id}`, description: "", inputSchema: {}, annotations: {} }] as any);
    expect((await gatherAvailableTools(["srv-mcp", "srv-api", "srv-jira"])).map((t) => t.serverId).sort()).toEqual(["srv-api", "srv-jira", "srv-mcp"]);
    lock({ connectors: { allow: ["jira", "openapi"] } });
    expect((await gatherAvailableTools(["srv-mcp", "srv-api", "srv-jira"])).map((t) => t.serverId).sort()).toEqual(["srv-api", "srv-jira"]);
    lock({ connectors: { allow: [] } });
    expect(await gatherAvailableTools(["srv-mcp", "srv-api", "srv-jira"])).toEqual([]);
  });
});

describe("the gates", () => {
  const run = async (mw: any, req: any) => {
    const res: any = { code: 200, body: undefined };
    res.status = (c: number) => { res.code = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    const next = vi.fn();
    await mw({ body: {}, params: {}, method: "POST", ...req }, res, next);
    return { res, next, passed: next.mock.calls.length > 0 };
  };

  it("connectorCreateGate closes a type that is not allowed, with a 403 that says why", async () => {
    lock({ connectors: { allow: ["jira"] } });
    const gate = connectorCreateGate((req) => String(req.params.id));
    expect((await run(gate, { params: { id: "jira" } })).passed).toBe(true);
    const refused = await run(gate, { params: { id: "salesforce" } });
    expect(refused.passed).toBe(false);
    expect(refused.res).toMatchObject({ code: 403, body: { reason: "platform_lockdown", surface: 'Connector type "salesforce"' } });
  });

  it("connectorCreateGate does nothing when connectors are not restricted", async () => {
    expect((await run(connectorCreateGate(() => "salesforce"), {})).passed).toBe(true);
  });

  describe("registering a server by hand", () => {
    it("is an mcp connector, or an openapi one when its transport is rest-proxy", async () => {
      lock({ connectors: { allow: ["mcp"] } });
      expect((await run(registerServerGate, { body: { name: "x", transportType: "streamable-http" } })).passed).toBe(true);
      expect((await run(registerServerGate, { body: { name: "x" } })).passed).toBe(true);
      expect((await run(registerServerGate, { body: { name: "x", transportType: "rest-proxy" } })).res.code).toBe(403);
    });

    it("cannot name itself an allowed integration: the platform assigns integrationId", async () => {
      lock({ connectors: { allow: ["jira"] } });
      const r = await run(registerServerGate, { body: { name: "x", transportType: "streamable-http", integrationId: "jira" } });
      expect(r.passed).toBe(false);
      expect(r.res.code).toBe(403);
      expect(r.res.body.message).toMatch(/integrationId/);
    });

    it("is untouched when nothing is restricted, integrationId included", async () => {
      expect((await run(registerServerGate, { body: { integrationId: "jira" } })).passed).toBe(true);
    });
  });

  describe("changing an existing connector", () => {
    beforeEach(() => lock({ connectors: { allow: ["jira"] } }));

    it("is refused for every change to a disallowed one", async () => {
      for (const method of ["POST", "PUT", "PATCH"]) {
        expect((await run(mcpServerMutationGate, { method, params: { id: "srv-mcp" } })).res.code, method).toBe(403);
      }
    });

    it("leaves reading and removing alone, whatever the type", async () => {
      for (const method of ["GET", "DELETE", "HEAD"]) expect((await run(mcpServerMutationGate, { method, params: { id: "srv-mcp" } })).passed, method).toBe(true);
    });

    it("lets an allowed connector be changed", async () => {
      expect((await run(mcpServerMutationGate, { method: "POST", params: { id: "srv-jira" } })).passed).toBe(true);
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-jira" }, body: { name: "renamed" } })).passed).toBe(true);
    });

    it("refuses turning an allowed connector into a type that is not allowed", async () => {
      lock({ connectors: { allow: ["mcp"] } });
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-mcp" }, body: { transportType: "rest-proxy" } })).res.code).toBe(403);
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-mcp" }, body: { transportType: "sse" } })).passed).toBe(true);
      lock({ connectors: { allow: ["mcp", "openapi"] } });
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-mcp" }, body: { transportType: "rest-proxy" } })).passed).toBe(true);
    });

    it("keeps a platform connector where it is: its url and transport cannot be edited", async () => {
      for (const body of [{ url: "http://elsewhere.example/mcp" }, { transportType: "rest-proxy" }, { command: "node" }, { args: ["x"] }]) {
        const r = await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-jira" }, body });
        expect(r.res.code, JSON.stringify(body)).toBe(403);
        expect(r.res.body.message).toMatch(/platform connector's/);
      }
    });

    it("lets a platform connector's other fields change, and an unchanged address be sent back", async () => {
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-jira" }, body: { name: "Jira (prod)", riskTier: "HIGH" } })).passed).toBe(true);
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-jira" }, body: { url: "http://localhost:9997", transportType: "streamable-http" } })).passed).toBe(true);
    });

    it("passes a connector that does not exist, for the route to answer", async () => {
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "nope" } })).passed).toBe(true);
    });

    it("refuses when it cannot tell what the connector is", async () => {
      db.failLookups = true;
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-jira" } })).res.code).toBe(403);
    });

    it("asks nothing when connectors are not restricted", async () => {
      delete process.env.ASTRA_LOCKDOWN;
      db.getMcpServerCalls = 0;
      expect((await run(mcpServerMutationGate, { method: "PATCH", params: { id: "srv-mcp" } })).passed).toBe(true);
      expect(db.getMcpServerCalls).toBe(0);
    });
  });

  describe("installing from the marketplace", () => {
    beforeEach(() => {
      db.marketplace.set("m-mcp", { id: "m-mcp", sourceKind: "mcp" });
      db.marketplace.set("m-api", { id: "m-api", sourceKind: "openapi" });
      db.marketplace.set("m-native", { id: "m-native", sourceKind: "native" });
    });
    it("an MCP entry needs mcp, an OpenAPI entry needs openapi, a built-in one is not decided here", async () => {
      lock({ connectors: { allow: ["openapi"] } });
      expect((await run(marketplaceInstallGate, { params: { id: "m-mcp" } })).res.code).toBe(403);
      expect((await run(marketplaceInstallGate, { params: { id: "m-api" } })).passed).toBe(true);
      expect((await run(marketplaceInstallGate, { params: { id: "m-native" } })).passed).toBe(true);
      lock({ connectors: { allow: ["mcp"] } });
      expect((await run(marketplaceInstallGate, { params: { id: "m-mcp" } })).passed).toBe(true);
      expect((await run(marketplaceInstallGate, { params: { id: "m-api" } })).res.code).toBe(403);
    });
    it("an entry that does not exist is for the route to answer", async () => {
      lock({ connectors: { allow: [] } });
      expect((await run(marketplaceInstallGate, { params: { id: "missing" } })).passed).toBe(true);
    });
  });
});

describe("the mounts in routes.ts, over real Express routing", () => {
  const src = readFileSync("server/routes.ts", "utf8").replace(/\r\n/g, "\n");
  const handlers = { connectorCreateGate, registerServerGate, marketplaceInstallGate, mcpServerMutationGate, exactly };
  // Each connector gate is mounted on its own line: app.use("<path>", <handler expression>);
  const parse = () => [...src.matchAll(/^\s*app\.use\("([^"]+)", (.+)\);$/gm)]
    .filter((m) => m[2].startsWith("exactly(") || m[2] === "mcpServerMutationGate")
    .map((m) => ({ path: m[1], expr: m[2], handler: new Function(...Object.keys(handlers), `return ${m[2]}`)(...Object.values(handlers)) }));
  let server: Server; let base = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    for (const m of parse()) app.use(m.path, m.handler);
    app.all(/^\/api\/.*/, (req, res) => res.json({ reached: `${req.method} ${req.path}` }));
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  const call = async (method: string, p: string, body?: unknown) => {
    const r = await realFetch(base + p, { method, headers: { "content-type": "application/json" }, body: body && !["GET", "HEAD"].includes(method) ? JSON.stringify(body) : undefined });
    const j: any = await r.json().catch(() => null);
    return { status: r.status, closed: r.status === 403 && j?.reason === "platform_lockdown", j };
  };

  it("found every connector mount", () => {
    expect(parse().map((m) => m.path).sort()).toEqual([
      "/api/integrations/:id/connect", "/api/marketplace/install-requests/:id/approve", "/api/marketplace/servers/:id/install",
      "/api/mcp-servers", "/api/mcp-servers/:id", "/api/openapi-import/create",
    ]);
  });

  it("they are middleware, not route handlers, so the authorization ratchet does not count them as routes", () => {
    expect(src).not.toMatch(/app\.(post|patch|put|delete)\("\/api\/(integrations\/:id\/connect|openapi-import\/create|mcp-servers|marketplace\/(servers|install-requests))/);
  });

  it("a gate meant for registering a server does not fire for the sub-paths of /api/mcp-servers", async () => {
    lock({ connectors: { allow: ["jira"] } });
    const r = await call("POST", "/api/mcp-servers/srv-jira/initialize", { integrationId: "jira", name: "x" });
    expect(r.closed).toBe(false);
    expect(r.j?.reached).toBe("POST /api/mcp-servers/srv-jira/initialize");
  });

  it("every one of them lets a request through when nothing is restricted", async () => {
    for (const [m, p] of [["POST", "/api/integrations/jira/connect"], ["POST", "/api/openapi-import/create"], ["POST", "/api/mcp-servers"], ["PATCH", "/api/mcp-servers/srv-mcp"], ["PATCH", "/api/marketplace/install-requests/r1/approve"]]) {
      expect((await call(m, p, {})).j?.reached, `${m} ${p}`).toBe(`${m} ${p}`);
    }
  });

  it("closes what is not allowed, by path, verb and sub-path", async () => {
    lock({ connectors: { allow: ["jira"] } });
    expect((await call("POST", "/api/integrations/salesforce/connect", {})).closed).toBe(true);
    expect((await call("POST", "/api/integrations/jira/connect", {})).closed).toBe(false);
    expect((await call("POST", "/api/openapi-import/create", {})).closed).toBe(true);
    expect((await call("POST", "/api/mcp-servers", { name: "x" })).closed).toBe(true);
    expect((await call("POST", "/api/mcp-servers", { name: "x", integrationId: "jira" })).closed).toBe(true);
    expect((await call("PATCH", "/api/marketplace/install-requests/r1/approve", {})).closed).toBe(true);
    for (const [m, p] of [["PATCH", "/api/mcp-servers/srv-mcp"], ["POST", "/api/mcp-servers/srv-mcp/initialize"], ["POST", "/api/mcp-servers/srv-mcp/tools"], ["PUT", "/api/mcp-servers/srv-mcp/auth"]]) {
      expect((await call(m, p, {})).closed, `${m} ${p}`).toBe(true);
    }
    for (const [m, p] of [["GET", "/api/mcp-servers/srv-mcp"], ["DELETE", "/api/mcp-servers/srv-mcp"], ["POST", "/api/mcp-servers/srv-jira/initialize"]]) {
      expect((await call(m, p, {})).closed, `${m} ${p}`).toBe(false);
    }
  });

  it("only the creating request is gated: reading the same paths is not", async () => {
    lock({ connectors: { allow: [] } });
    for (const p of ["/api/mcp-servers", "/api/integrations/salesforce/connect", "/api/openapi-import/create", "/api/marketplace/servers/m1/install"]) {
      expect((await call("GET", p)).closed, `GET ${p}`).toBe(false);
    }
    expect((await call("PATCH", "/api/mcp-servers", {})).closed).toBe(false);          // only POST registers a server
    expect((await call("POST", "/api/marketplace/install-requests/r1/approve", {})).closed).toBe(false); // only PATCH approves
  });

  it("an empty list closes them all", async () => {
    lock({ connectors: { allow: [] } });
    for (const p of ["/api/integrations/jira/connect", "/api/openapi-import/create", "/api/mcp-servers"]) expect((await call("POST", p, {})).closed, p).toBe(true);
  });
});

describe("where the connector allow-list is applied", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

  it("the dispatcher refuses before the skill gate, executeTool refuses again, and a model is not offered the tools", () => {
    const src = read("server/tool-dispatcher.ts");
    expect(src).toContain('outcome: "gate_blocked_lockdown"');
    expect(src.indexOf("await blockedConnectorKind(tool.serverId);\n  if (lockedKind)")).toBeGreaterThan(-1);
    expect(src.indexOf("if (lockedKind)")).toBeLessThan(src.indexOf("// 1. Skill allowlist gate"));
    const exec = src.slice(src.indexOf("export async function executeTool("), src.indexOf("async function executeToolUnwrapped"));
    expect(exec.indexOf("blockedConnectorKind")).toBeGreaterThan(-1);
    expect(exec.indexOf("blockedConnectorKind")).toBeLessThan(exec.indexOf("executeToolUnwrapped(tool"));
    expect(src).toContain("if (!connectorAllowed(connectorKindOf(server))) continue;");
  });

  it("the tenant check runs before the connector gate, so another tenant's connector is a 404", () => {
    const src = read("server/routes.ts");
    expect(src.indexOf('app.use("/api/mcp-servers/:id", mcpServerScope);')).toBeLessThan(src.indexOf('app.use("/api/mcp-servers/:id", mcpServerMutationGate);'));
  });

  it("the connect catalogue offers only what is allowed, in all three listings", () => {
    const src = read("server/routes/enterprise-integrations.ts");
    expect(src).toContain("INTEGRATION_REGISTRY.filter((def) => connectorAllowed(def.id)), industryQuery");
    expect(src).toContain("INTEGRATION_REGISTRY.filter((def) => connectorAllowed(def.id)).map((def) => {\n      const conn = connMap.get(def.id);");
    expect(src).toContain("const platforms = INTEGRATION_REGISTRY.filter((def) => connectorAllowed(def.id)).map(");
  });

  it("nothing in the allow-list code writes to the database", () => {
    const src = read("server/connector-lockdown.ts");
    expect(src).not.toMatch(/storage\.(create|update|delete|upsert|insert)/);
  });
});
