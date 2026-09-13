/**
 * Tenant scoping for the MCP server catalog and blueprints (server/tenant-scope.ts).
 *
 * Regression cover for the cross-tenant findings of 13 Sep 2026:
 *  - GET /api/mcp-servers/:id/auth returned another tenant's DECRYPTED
 *    connector credentials to any signed-in user;
 *  - every /api/mcp-servers/:id (and tool/resource/prompt) route, and every
 *    /api/blueprints/:id and team-graph route, acted on any tenant's row.
 *
 * Storage and auth are mocked, so this runs without a database. The real
 * permissions module is used, with production security mode, so the role on
 * the signed-in user decides manage_security exactly as it does live.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = {
  servers: new Map<string, any>(),
  tools: new Map<string, any>(),
  resources: new Map<string, any>(),
  prompts: new Map<string, any>(),
  blueprints: new Map<string, any>(),
  nodes: new Map<string, any>(),
  edges: new Map<string, any>(),
};

vi.mock("../server/storage", () => ({
  storage: {
    getMcpServer: async (id: string) => rows.servers.get(id),
    getMcpServerToolById: async (id: string) => rows.tools.get(id),
    getMcpServerResourceById: async (id: string) => rows.resources.get(id),
    getMcpServerPromptById: async (id: string) => rows.prompts.get(id),
    getBlueprint: async (id: string) => rows.blueprints.get(id),
    getTeamBlueprintNode: async (id: string) => rows.nodes.get(id),
    getTeamBlueprintEdge: async (id: string) => rows.edges.get(id),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import {
  isMcpServerVisibleToOrg,
  isBlueprintVisibleToOrg,
  sanitizeMcpServerAuth,
  mcpServerScope,
  mcpServerChildScope,
  blueprintScope,
  teamGraphElementScope,
} from "../server/tenant-scope";

function fakeReq(opts: { org: string; role?: string; method?: string; params?: Record<string, string>; path?: string; query?: any; body?: any }) {
  return {
    authUser: { organizationId: opts.org, role: opts.role ?? "agent_engineer", userId: "u", username: "u" },
    method: opts.method ?? "GET",
    params: opts.params ?? {},
    path: opts.path ?? "/",
    query: opts.query ?? {},
    body: opts.body ?? {},
    headers: {},
  } as any;
}

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

async function run(mw: any, req: any) {
  const res = fakeRes();
  const next = vi.fn();
  await mw(req, res, next);
  return { res, next };
}

beforeEach(() => {
  for (const m of Object.values(rows)) m.clear();
  rows.servers.set("srv-a", { id: "srv-a", organizationId: ORG_A, integrationId: "salesforce" });
  rows.servers.set("srv-catalog", { id: "srv-catalog", organizationId: null, integrationId: "hubspot" });
  rows.servers.set("srv-legacy", { id: "srv-legacy", organizationId: null, integrationId: null });
  rows.tools.set("tool-a", { id: "tool-a", serverId: "srv-a" });
  rows.resources.set("res-a", { id: "res-a", serverId: "srv-a" });
  rows.prompts.set("prm-a", { id: "prm-a", serverId: "srv-a" });
  rows.blueprints.set("bp-a", { id: "bp-a", organizationId: ORG_A });
  rows.blueprints.set("bp-legacy", { id: "bp-legacy", organizationId: null });
  rows.nodes.set("node-a", { id: "node-a", blueprintId: "bp-a" });
  rows.edges.set("edge-a", { id: "edge-a", blueprintId: "bp-a" });
});

describe("visibility rules", () => {
  it("an org-owned connector is visible only to its owner", () => {
    const s = { organizationId: ORG_A, integrationId: "salesforce" };
    expect(isMcpServerVisibleToOrg(s, ORG_A)).toBe(true);
    expect(isMcpServerVisibleToOrg(s, ORG_B)).toBe(false);
    expect(isMcpServerVisibleToOrg(s, undefined)).toBe(false);
  });

  it("an unclaimed seeded enterprise connector is platform catalog, visible to every tenant", () => {
    const s = { organizationId: null, integrationId: "hubspot" };
    expect(isMcpServerVisibleToOrg(s, ORG_A)).toBe(true);
    expect(isMcpServerVisibleToOrg(s, ORG_B)).toBe(true);
  });

  it("a legacy unowned connector belongs to the default org, not to everyone", () => {
    const s = { organizationId: null, integrationId: null };
    expect(isMcpServerVisibleToOrg(s, DEFAULT_ORG)).toBe(true);
    expect(isMcpServerVisibleToOrg(s, ORG_B)).toBe(false);
  });

  it("blueprints are visible only to their owner; legacy NULL ones to the default org", () => {
    expect(isBlueprintVisibleToOrg({ organizationId: ORG_A }, ORG_A)).toBe(true);
    expect(isBlueprintVisibleToOrg({ organizationId: ORG_A }, ORG_B)).toBe(false);
    expect(isBlueprintVisibleToOrg({ organizationId: null }, DEFAULT_ORG)).toBe(true);
    expect(isBlueprintVisibleToOrg({ organizationId: null }, ORG_B)).toBe(false);
  });
});

describe("sanitizeMcpServerAuth", () => {
  const secrets = { accessToken: "ya29.super-secret-access-token", refreshToken: "1//refresh-secret", keyValue: "sk-live-12345", expiresAt: "2026-10-01T00:00:00Z" };

  it("never includes a credential value, from an encrypted row's decrypted config", () => {
    const auth: any = { serverId: "srv-a", authType: "oauth2", config: null, configEncrypted: "blob", lastRotated: null, createdAt: null };
    const out = sanitizeMcpServerAuth(auth, secrets);
    const json = JSON.stringify(out);
    for (const value of [secrets.accessToken, secrets.refreshToken, secrets.keyValue, "blob"]) {
      expect(json).not.toContain(value);
    }
    expect(out).not.toHaveProperty("config");
    expect(out).not.toHaveProperty("configEncrypted");
    expect(out.configuredFields).toEqual(["accessToken", "expiresAt", "keyValue", "refreshToken"]);
    expect(out.hasCredentials).toBe(true);
    expect(out.expiresAt).toBe(secrets.expiresAt);
    expect(out.authType).toBe("oauth2");
  });

  it("never includes a value from a legacy row that still holds plaintext config", () => {
    const auth: any = { serverId: "srv-a", authType: "bearer_token", config: { token: "plaintext-bearer-token" }, configEncrypted: null };
    const json = JSON.stringify(sanitizeMcpServerAuth(auth));
    expect(json).not.toContain("plaintext-bearer-token");
    expect(json).toContain("token");
  });

  it("reports no auth when there is no record", () => {
    expect(sanitizeMcpServerAuth(undefined)).toMatchObject({ authType: "none", hasCredentials: false, configuredFields: [] });
  });

  it("is what the GET and PUT auth routes send (static guard against a revert)", () => {
    const src = readFileSync(join(__dirname, "..", "server", "routes", "runtime.ts"), "utf8");
    const getStart = src.indexOf('router.get("/api/mcp-servers/:id/auth"');
    const putStart = src.indexOf('router.put("/api/mcp-servers/:id/auth"');
    expect(getStart).toBeGreaterThan(-1);
    expect(putStart).toBeGreaterThan(getStart);
    const getHandler = src.slice(getStart, putStart);
    expect(getHandler).toContain('checkPermission("manage_mcp_servers")');
    expect(getHandler).toContain("sanitizeMcpServerAuth(");
    expect(getHandler).not.toMatch(/res\.json\(\s*auth\b/);
    const putHandler = src.slice(putStart, src.indexOf("router.", putStart + 10));
    expect(putHandler).toContain("sanitizeMcpServerAuth(");
  });
});

describe("mcpServerScope (/api/mcp-servers/:id/*)", () => {
  it("answers 404 for another tenant's connector, including its auth route", async () => {
    const { res, next } = await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "srv-a" } }));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it("lets the owner through", async () => {
    const { next } = await run(mcpServerScope, fakeReq({ org: ORG_A, params: { id: "srv-a" }, method: "DELETE" }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("lets any tenant read a platform catalog connector", async () => {
    const { next } = await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "srv-catalog" } }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("refuses to change a platform catalog connector without manage_security", async () => {
    const { res, next } = await run(mcpServerScope, fakeReq({ org: ORG_B, role: "agent_engineer", method: "PATCH", params: { id: "srv-catalog" } }));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("allows a security admin to change a platform catalog connector", async () => {
    const { next } = await run(mcpServerScope, fakeReq({ org: ORG_B, role: "admin", method: "PATCH", params: { id: "srv-catalog" } }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("hides legacy unowned connectors from tenants other than the default org", async () => {
    const other = await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "srv-legacy" } }));
    expect(other.res.statusCode).toBe(404);
    const owner = await run(mcpServerScope, fakeReq({ org: DEFAULT_ORG, params: { id: "srv-legacy" } }));
    expect(owner.next).toHaveBeenCalledOnce();
  });

  it("passes unknown ids and literal sub-paths through to the route", async () => {
    expect((await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "does-not-exist" } }))).next).toHaveBeenCalledOnce();
    expect((await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "tools" } }))).next).toHaveBeenCalledOnce();
    expect((await run(mcpServerScope, fakeReq({ org: ORG_B, params: { id: "oauth" } }))).next).toHaveBeenCalledOnce();
  });
});

describe("mcpServerChildScope (tools, resources, prompts by id)", () => {
  it.each([
    ["tool", "tool-a"],
    ["resource", "res-a"],
    ["prompt", "prm-a"],
  ] as const)("answers 404 for another tenant's %s", async (kind, id) => {
    const { res, next } = await run(mcpServerChildScope(kind), fakeReq({ org: ORG_B, params: { id } }));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it("lets the owner's tool through and skips reserved literals", async () => {
    expect((await run(mcpServerChildScope("tool"), fakeReq({ org: ORG_A, params: { id: "tool-a" } }))).next).toHaveBeenCalledOnce();
    expect((await run(mcpServerChildScope("tool", ["by-risk"]), fakeReq({ org: ORG_B, params: { id: "by-risk" } }))).next).toHaveBeenCalledOnce();
  });
});

describe("blueprintScope and teamGraphElementScope", () => {
  it("answers 404 for another tenant's blueprint and lets the owner through", async () => {
    const other = await run(blueprintScope, fakeReq({ org: ORG_B, params: { id: "bp-a" } }));
    expect(other.res.statusCode).toBe(404);
    const owner = await run(blueprintScope, fakeReq({ org: ORG_A, params: { id: "bp-a" } }));
    expect(owner.next).toHaveBeenCalledOnce();
  });

  it("gives legacy NULL blueprints to the default org only", async () => {
    expect((await run(blueprintScope, fakeReq({ org: ORG_B, params: { id: "bp-legacy" } }))).res.statusCode).toBe(404);
    expect((await run(blueprintScope, fakeReq({ org: DEFAULT_ORG, params: { id: "bp-legacy" } }))).next).toHaveBeenCalledOnce();
  });

  it("refuses a node or edge addressed by id when it hangs off another tenant's blueprint", async () => {
    const node = await run(teamGraphElementScope("node"), fakeReq({ org: ORG_B, method: "PATCH", path: "/node-a" }));
    expect(node.res.statusCode).toBe(404);
    const edge = await run(teamGraphElementScope("edge"), fakeReq({ org: ORG_B, method: "DELETE", path: "/edge-a" }));
    expect(edge.res.statusCode).toBe(404);
  });

  it("refuses listing another tenant's graph by ?blueprintId=", async () => {
    const { res } = await run(teamGraphElementScope("node"), fakeReq({ org: ORG_B, path: "/", query: { blueprintId: "bp-a" } }));
    expect(res.statusCode).toBe(404);
  });

  it("refuses creating or moving an element into another tenant's blueprint", async () => {
    rows.blueprints.set("bp-b", { id: "bp-b", organizationId: ORG_B });
    rows.nodes.set("node-b", { id: "node-b", blueprintId: "bp-b" });
    const create = await run(teamGraphElementScope("node"), fakeReq({ org: ORG_B, method: "POST", path: "/", body: { blueprintId: "bp-a" } }));
    expect(create.res.statusCode).toBe(404);
    const move = await run(teamGraphElementScope("node"), fakeReq({ org: ORG_B, method: "PATCH", path: "/node-b", body: { blueprintId: "bp-a" } }));
    expect(move.res.statusCode).toBe(404);
    const ownCreate = await run(teamGraphElementScope("node"), fakeReq({ org: ORG_B, method: "POST", path: "/", body: { blueprintId: "bp-b" } }));
    expect(ownCreate.next).toHaveBeenCalledOnce();
  });
});

describe("route wiring (static guard against a revert)", () => {
  it("mounts every scope before the feature routers", () => {
    const src = readFileSync(join(__dirname, "..", "server", "routes.ts"), "utf8");
    const firstFeatureRouter = src.indexOf("app.use(toolConnectorsRouter)");
    for (const mount of [
      'app.use("/api/mcp-servers/:id", mcpServerScope)',
      'app.use("/api/mcp-tools/:id", mcpServerChildScope("tool", ["by-risk"]))',
      'app.use("/api/tool-catalog/:id", mcpServerChildScope("tool"))',
      'app.use("/api/mcp-resources/:id", mcpServerChildScope("resource"))',
      'app.use("/api/mcp-prompts/:id", mcpServerChildScope("prompt"))',
      'app.use("/api/blueprints/:id", blueprintScope)',
      'app.use("/api/team-blueprint-nodes", teamGraphElementScope("node"))',
      'app.use("/api/team-blueprint-edges", teamGraphElementScope("edge"))',
    ]) {
      const at = src.indexOf(mount);
      expect(at, mount).toBeGreaterThan(-1);
      expect(at, mount).toBeLessThan(firstFeatureRouter);
    }
  });
});
