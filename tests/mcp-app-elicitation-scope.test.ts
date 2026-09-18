/**
 * Tenant scoping for MCP apps and MCP elicitations (server/tenant-scope.ts).
 * Neither table has an organization column: an app belongs to its MCP
 * server's owner, an elicitation to its agent's organization (else its
 * server's owner, else the default org). Other organizations' rows are 404.
 *
 * Storage and auth are mocked; the real permissions module runs in production
 * security mode, so the signed-in user's role decides manage_security.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = {
  servers: new Map<string, any>(),
  agents: new Map<string, any>(),
  apps: new Map<string, any>(),
  consents: new Map<string, any[]>(),
  sessions: new Map<string, any>(),
  elicitations: new Map<string, any>(),
};

vi.mock("../server/storage", () => ({
  storage: {
    getMcpServer: async (id: string) => rows.servers.get(id),
    getAgent: async (id: string) => rows.agents.get(id),
    getMcpApp: async (id: string) => rows.apps.get(id),
    getMcpAppConsents: async (appId: string) => rows.consents.get(appId) ?? [],
    getMcpAppSession: async (id: string) => rows.sessions.get(id),
    getMcpElicitation: async (id: string) => rows.elicitations.get(id),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { mcpAppScope, mcpElicitationScope, filterMcpAppsForOrg, filterElicitationsForOrg } from "../server/tenant-scope";

function fakeReq(opts: { org: string; role?: string; method?: string; path?: string; body?: any }) {
  return {
    authUser: { organizationId: opts.org, role: opts.role ?? "agent_engineer", userId: "u", username: "u" },
    method: opts.method ?? "GET",
    params: {},
    path: opts.path ?? "/",
    query: {},
    body: opts.body ?? {},
    headers: {},
  } as any;
}

async function run(mw: any, req: any) {
  const res: any = { statusCode: 200 };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  const next = vi.fn();
  await mw(req, res, next);
  return { status: next.mock.calls.length ? "next" : res.statusCode };
}

beforeEach(() => {
  for (const m of Object.values(rows)) m.clear();
  rows.servers.set("srv-a", { id: "srv-a", organizationId: ORG_A, integrationId: "salesforce" });
  rows.servers.set("srv-b", { id: "srv-b", organizationId: ORG_B, integrationId: "salesforce" });
  rows.servers.set("srv-catalog", { id: "srv-catalog", organizationId: null, integrationId: "hubspot" });
  rows.agents.set("ag-a", { id: "ag-a", organizationId: ORG_A });
  rows.agents.set("ag-legacy", { id: "ag-legacy", organizationId: null });
  rows.apps.set("app-a", { id: "app-a", serverId: "srv-a" });
  rows.apps.set("app-catalog", { id: "app-catalog", serverId: "srv-catalog" });
  rows.apps.set("app-orphan", { id: "app-orphan", serverId: "srv-gone" });
  rows.consents.set("app-a", [{ id: "consent-a", appId: "app-a" }]);
  rows.sessions.set("sess-a", { id: "sess-a", appId: "app-a" });
  rows.sessions.set("sess-catalog", { id: "sess-catalog", appId: "app-catalog" });
  rows.elicitations.set("el-agent", { id: "el-agent", agentId: "ag-a", serverId: "srv-catalog" });
  rows.elicitations.set("el-server", { id: "el-server", agentId: null, serverId: "srv-a" });
  rows.elicitations.set("el-catalog", { id: "el-catalog", agentId: null, serverId: "srv-catalog" });
  rows.elicitations.set("el-legacy-agent", { id: "el-legacy-agent", agentId: "ag-legacy", serverId: null });
});

describe("MCP apps", () => {
  it("are visible to their server's org and to everyone for catalog servers", async () => {
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, path: "/app-a" }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, path: "/app-a" }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, path: "/app-a/resource" }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, path: "/app-catalog" }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, path: "/app-orphan" }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: DEFAULT_ORG, path: "/app-orphan" }))).status).toBe("next");
  });

  it("filters the list the same way", async () => {
    const all = Array.from(rows.apps.values());
    expect((await filterMcpAppsForOrg(all, ORG_B)).map((a) => a.id)).toEqual(["app-catalog"]);
    expect((await filterMcpAppsForOrg(all, ORG_A)).map((a) => a.id)).toEqual(["app-a", "app-catalog"]);
  });

  it("guards create, edit and moving an app to another server", async () => {
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "POST", body: { serverId: "srv-a" } }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, method: "POST", body: { serverId: "srv-a" } }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, method: "POST", body: { serverId: "srv-catalog" } }))).status).toBe(403);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, role: "admin", method: "POST", body: { serverId: "srv-catalog" } }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "PATCH", path: "/app-catalog" }))).status).toBe(403);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, method: "PATCH", path: "/app-a", body: { serverId: "srv-b" } }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, method: "DELETE", path: "/app-a" }))).status).toBe("next");
  });

  it("lets anyone who can see a catalog app consent to and use it", async () => {
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "POST", path: "/app-catalog/consent" }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "POST", path: "/app-catalog/sessions" }))).status).toBe("next");
  });

  it("only acts on consents and sessions of the app in the path", async () => {
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, method: "DELETE", path: "/app-a/consent/consent-a" }))).status).toBe("next");
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "DELETE", path: "/app-catalog/consent/consent-a" }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "POST", path: "/app-catalog/bridge", body: { sessionId: "sess-a" } }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, method: "POST", path: "/app-catalog/bridge", body: { sessionId: "sess-catalog" } }))).status).toBe("next");
  });

  it("scopes by-server lists", async () => {
    expect((await run(mcpAppScope, fakeReq({ org: ORG_B, path: "/by-server/srv-a" }))).status).toBe(404);
    expect((await run(mcpAppScope, fakeReq({ org: ORG_A, path: "/by-server/srv-a" }))).status).toBe("next");
  });
});

describe("MCP elicitations", () => {
  it("belong to the agent's org first, then the server's, then the default org", async () => {
    const all = Array.from(rows.elicitations.values());
    expect((await filterElicitationsForOrg(all, ORG_A)).map((e) => e.id)).toEqual(["el-agent", "el-server"]);
    expect((await filterElicitationsForOrg(all, DEFAULT_ORG)).map((e) => e.id)).toEqual(["el-catalog", "el-legacy-agent"]);
    expect(await filterElicitationsForOrg(all, ORG_B)).toEqual([]);
  });

  it("return 404 to other orgs on every per-elicitation route", async () => {
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_A, path: "/el-agent" }))).status).toBe("next");
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, path: "/el-agent" }))).status).toBe(404);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, method: "PATCH", path: "/el-server/respond" }))).status).toBe(404);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, method: "POST", path: "/el-server/url-complete" }))).status).toBe(404);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, path: "/pending" }))).status).toBe("next");
  });

  it("can't be created for another org's agent or server", async () => {
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, method: "POST", body: { agentId: "ag-a" } }))).status).toBe(404);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_B, method: "POST", body: { serverId: "srv-a" } }))).status).toBe(404);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_A, method: "POST", body: { agentId: "ag-missing" } }))).status).toBe(400);
    expect((await run(mcpElicitationScope, fakeReq({ org: ORG_A, method: "POST", body: { agentId: "ag-a", serverId: "srv-catalog" } }))).status).toBe("next");
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  it("mounts both scopes ahead of the feature routers and filters both lists", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('app.use("/api/mcp-apps", mcpAppScope);');
    expect(routes).toContain('app.use("/api/mcp-elicitations", mcpElicitationScope);');
    expect(routes.indexOf("mcpElicitationScope);")).toBeLessThan(routes.indexOf("registerKnowledgeBaseRoutes(app);"));
    const runtime = read("server", "routes", "runtime.ts");
    expect(runtime).toContain("filterMcpAppsForOrg(await storage.getMcpApps(), resolveRequestOrgId(req))");
    expect(runtime).toContain('filterElicitationsForOrg(await storage.getMcpElicitationsByStatus("pending"), resolveRequestOrgId(req))');
  });
});
