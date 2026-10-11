/**
 * Catalogues that every organization shares (the marketplace's trusted publishers and registry sources, the regulation
 * catalogue, agent templates, tool connectors, golden datasets, the platform catalogue of MCP servers, and the credential-store
 * administration) have no owner column, so a change to one is a change for all of them. A role permission is not enough to
 * guard that: every organization's `admin` holds every permission. These changes are limited to people of the platform's own
 * organization (the default one), and to users who hold the permission for the kind of change.
 *
 * Found by a cross-tenant sweep on 2026-10-11: an admin of a second organization, and in one case a user with the weakest role,
 * could edit or delete these.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_ORG = "org-default";
let mode: "production" | "demo" = "production";
let defaultOrg: string | undefined = DEFAULT_ORG;

vi.mock("../server/auth", () => ({
  getSecurityMode: () => mode,
  getDefaultOrgId: () => defaultOrg,
  getOrgId: (req: any) => (mode === "demo" ? (req.headers?.["x-organization-id"] || undefined) : req.authUser?.organizationId),
}));

import { checkPermission, isPlatformOperatorOrg, platformOnly, requirePlatformOperatorOrg } from "../server/permissions";

const user = (role: string, org: string | undefined) => ({ authUser: { role, organizationId: org }, headers: {} }) as any;
function run(req: any) {
  let status = 0, body: any = null, passed = false;
  const res: any = { status(s: number) { status = s; return res; }, json(b: any) { body = b; return res; } };
  requirePlatformOperatorOrg(req, res, () => { passed = true; });
  return { status, body, passed };
}

describe("isPlatformOperatorOrg", () => {
  it("is true for a user of the default organization", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(isPlatformOperatorOrg(user("admin", DEFAULT_ORG))).toBe(true);
  });

  it("is false for a user of any other organization, even an admin", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(isPlatformOperatorOrg(user("admin", "org-b"))).toBe(false);
  });

  it("is false for a caller with no organization", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(isPlatformOperatorOrg(user("admin", undefined))).toBe(false);
  });

  it("is true when no default organization exists at all: a deployment that has never seeded one has nothing to separate", () => {
    mode = "production"; defaultOrg = undefined;
    expect(isPlatformOperatorOrg(user("admin", "org-b"))).toBe(true);
    defaultOrg = DEFAULT_ORG;
  });

  it("is true in demo mode, which has no organizations to tell apart", () => {
    mode = "demo"; defaultOrg = DEFAULT_ORG;
    expect(isPlatformOperatorOrg({ headers: { "x-organization-id": "org-b" } } as any)).toBe(true);
    mode = "production";
  });
});

describe("requirePlatformOperatorOrg", () => {
  it("lets the platform's own organization through", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(run(user("admin", DEFAULT_ORG))).toMatchObject({ passed: true, status: 0 });
  });

  it("refuses another organization with 403 and says why, without naming any organization", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    const r = run(user("admin", "org-b"));
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toMatch(/shared by every organization/);
    expect(JSON.stringify(r.body)).not.toContain(DEFAULT_ORG);
  });
});

describe("platformOnly(checkPermission(...))", () => {
  const as = (role: string, org: string | undefined, action: any = "manage_security") => {
    let status = 0, passed = false;
    const res: any = { status(s: number) { status = s; return res; }, json() { return res; } };
    platformOnly(checkPermission(action))({ authUser: { role, organizationId: org }, headers: { "x-role": role } } as any, res, () => { passed = true; });
    return { status, passed };
  };

  it("passes an admin of the platform's own organization", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(as("admin", DEFAULT_ORG)).toEqual({ status: 0, passed: true });
  });

  it("refuses an admin of another organization, even though the role holds the permission", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(as("admin", "org-b")).toEqual({ status: 403, passed: false });
  });

  it("refuses a role without the permission, even in the platform's own organization", () => {
    mode = "production"; defaultOrg = DEFAULT_ORG;
    expect(as("domain_expert", DEFAULT_ORG)).toEqual({ status: 403, passed: false });
  });

  it("hands an error from the permission check on to the error handler, not on as success", () => {
    let seen: unknown = null, passed = false;
    platformOnly((_req, _res, next) => next(new Error("boom")))({ headers: {} } as any, {} as any, (e?: unknown) => { seen = e; passed = true; });
    expect(String(seen)).toContain("boom");
    expect(passed).toBe(true);
  });
});

// ── the routes that must use it ─────────────────────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, "..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

/** The text between a route's path and its handler: the middleware list. */
function middlewareOf(file: string, verb: string, route: string): string {
  const src = read(file);
  const at = src.indexOf(`.${verb}("${route}"`);
  if (at < 0) throw new Error(`${verb} ${route} not found in ${file}`);
  const after = src.slice(at + verb.length + route.length + 3);
  const cut = after.search(/async\s*\(|\(\s*req\s*[,)]/);
  return after.slice(0, cut < 0 ? 200 : cut);
}

const SHARED_WRITES: Array<[file: string, verb: string, route: string, permission: string]> = [
  ["server/routes/runtime.ts", "post", "/api/marketplace/registry-sources", "manage_security"],
  ["server/routes/runtime.ts", "patch", "/api/marketplace/registry-sources/:id", "manage_security"],
  ["server/routes/runtime.ts", "delete", "/api/marketplace/registry-sources/:id", "manage_security"],
  ["server/routes/runtime.ts", "post", "/api/marketplace/registry-sources/:id/sync", "manage_security"],
  ["server/routes/runtime.ts", "delete", "/api/marketplace/servers/:id", "manage_security"],
  ["server/routes/runtime.ts", "post", "/api/marketplace/trusted-publishers", "manage_security"],
  ["server/routes/runtime.ts", "patch", "/api/marketplace/trusted-publishers/:id", "manage_security"],
  ["server/routes/runtime.ts", "delete", "/api/marketplace/trusted-publishers/:id", "manage_security"],
  ["server/routes/runtime.ts", "patch", "/api/regulations/:id", "manage_platform_settings"],
  ["server/routes/runtime.ts", "patch", "/api/regulatory-policies/:id", "manage_platform_settings"],
  ["server/routes/evaluations.ts", "put", "/api/agent-templates/:id", "create_modify_blueprints"],
  ["server/routes/evaluations.ts", "delete", "/api/agent-templates/:id", "create_modify_blueprints"],
  ["server/routes/tool-connectors.ts", "patch", "/api/tool-connectors/:id", "create_modify_blueprints"],
  ["server/routes/tool-connectors.ts", "delete", "/api/tool-connectors/:id", "create_modify_blueprints"],
  ["server/routes/skills.ts", "patch", "/api/golden-datasets/:id", "create_modify_blueprints"],
  ["server/routes/skills.ts", "delete", "/api/golden-datasets/:id", "create_modify_blueprints"],
  ["server/routes/credential-store.ts", "get", "/api/admin/credential-store/status", "manage_platform_settings"],
  ["server/routes/credential-store.ts", "post", "/api/admin/credential-store/migrate", "manage_platform_settings"],
];

describe("changes to a shared catalogue need the permission AND the platform's own organization", () => {
  for (const [file, verb, route, permission] of SHARED_WRITES) {
    it(`${verb.toUpperCase()} ${route}`, () => {
      const mw = middlewareOf(file, verb, route);
      expect(mw, "permission and operator organization, in one middleware").toContain(`platformOnly(checkPermission("${permission}"))`);
    });
  }

  it("installing from the marketplace needs manage_mcp_servers (it was open to every role)", () => {
    expect(middlewareOf("server/routes/runtime.ts", "post", "/api/marketplace/servers/:id/install")).toContain('checkPermission("manage_mcp_servers")');
  });

  it("a platform catalogue MCP server is changed only from the platform's own organization (server/tenant-scope.ts)", () => {
    const src = read("server/tenant-scope.ts");
    const at = src.indexOf("mcpServerOwnerOrgId(server) === null");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at - 200, at + 300)).toContain("isPlatformOperatorOrg(req)");
  });
});
