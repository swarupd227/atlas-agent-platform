/**
 * Deploy & Operate: a deployment belongs to one organization, and the routes
 * that put an agent in front of real traffic are guarded.
 *
 * Before this: start-runtime and run-pipeline read a deployment without its
 * organization, stop-runtime stopped another organization's runtime before
 * checking, promote and rollback had no permission check at all, deploy_prod
 * existed but was never checked on the server, a raw PATCH could set any
 * status or move a deployment between environments, and auto-promote created
 * a live pilot deployment with no approval.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { hasPermission, type RoleId } from "../server/permissions";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = { deployments: new Map<string, any>() };

vi.mock("../server/storage", () => ({
  storage: { getDeployment: async (id: string) => rows.deployments.get(id) },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { deploymentScope } from "../server/tenant-scope";

function req(org: string, id: string, method = "POST") {
  return { authUser: { organizationId: org, role: "ops_sre", userId: "u" }, method, params: { id }, path: "/", query: {}, body: {}, headers: {} } as any;
}

async function run(mw: any, r: any) {
  const res: any = { statusCode: 200 };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = () => res;
  const next = vi.fn();
  await mw(r, res, next);
  return next.mock.calls.length ? "next" : res.statusCode;
}

beforeEach(() => {
  rows.deployments.clear();
  rows.deployments.set("dep-a", { id: "dep-a", organizationId: ORG_A, environment: "staging" });
  rows.deployments.set("dep-legacy", { id: "dep-legacy", organizationId: null, environment: "staging" });
});

describe("deploymentScope", () => {
  it("answers 404 for another organization's deployment", async () => {
    expect(await run(deploymentScope, req(ORG_A, "dep-a"))).toBe("next");
    expect(await run(deploymentScope, req(ORG_B, "dep-a"))).toBe(404);
  });

  it("leaves the collection routes and unknown ids alone", async () => {
    expect(await run(deploymentScope, req(ORG_B, "freeze"))).toBe("next");
    expect(await run(deploymentScope, req(ORG_B, "health", "GET"))).toBe("next");
    expect(await run(deploymentScope, req(ORG_B, "no-such-deployment"))).toBe("next");
  });

  it("treats a legacy deployment with no organization as the default org's", async () => {
    expect(await run(deploymentScope, req(DEFAULT_ORG, "dep-legacy"))).toBe("next");
    expect(await run(deploymentScope, req(ORG_A, "dep-legacy"))).toBe(404);
  });
});

describe("deploy_prod", () => {
  const ROLES: RoleId[] = ["admin", "outcome_owner", "agent_engineer", "ops_sre", "compliance_security", "expert_validator", "finance", "domain_expert"];
  it("is a real permission that some roles do not hold", () => {
    expect(ROLES.filter((r) => hasPermission(r, "deploy_prod")).length).toBeGreaterThan(0);
    expect(ROLES.filter((r) => !hasPermission(r, "deploy_prod")).length).toBeGreaterThan(0);
  });
});

describe("route guards", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  const agents = () => read("server", "routes", "agents.ts");
  const canary = () => read("server", "routes", "shadow-canary.ts");

  it("guards every deployment write with deploy_staging_pilot", () => {
    const src = agents() + canary();
    for (const route of [
      '/api/deployments/:id", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/initialize-pipeline", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/advance-stage", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/collect-evidence", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/promote", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/rollback", checkPermission("deploy_staging_pilot")',
      '/api/deployments/freeze", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/auto-promote", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/run-pipeline", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/start-runtime", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/stop-runtime", checkPermission("deploy_staging_pilot")',
      '/api/deployments/:id/execute-now", checkPermission("deploy_staging_pilot")',
    ]) expect(src).toContain(route);
  });

  it("checks deploy_prod before a promotion reaches production", () => {
    expect(agents()).toContain('if (target === "prod" && !hasPermission(getRequestRole(req), "deploy_prod"))');
    expect(agents()).toContain('if (goesLive && existing.environment === "prod" && !hasPermission(getRequestRole(req), "deploy_prod"))');
  });

  it("stops a raw edit from moving a deployment between environments", () => {
    expect(agents()).toContain("Use promote to move a deployment between environments.");
  });

  it("records the signed-in person on a pipeline stage, not the request's claim", () => {
    expect(agents()).toContain("completedBy: getRequestActorLabel(req)");
    expect(agents()).not.toContain('completedBy: completedBy || "system"');
  });

  it("creates an auto-promoted pilot pending, so its approval still has to be decided", () => {
    const src = agents();
    const block = src.slice(src.indexOf('router.post("/api/deployments/:id/auto-promote"'));
    const created = block.slice(block.indexOf("createDeployment({"), block.indexOf("createDeployment({") + 600);
    expect(created).toContain('status: "pending"');
    expect(created).not.toContain('status: "deployed"');
  });

  it("reads every deployment with the caller's organization, and checks before stopping a runtime", () => {
    const src = canary();
    expect(src).not.toMatch(/getDeployment\(req\.params\.id as string\)\s*;/);
    const stop = src.slice(src.indexOf('router.post("/api/deployments/:id/stop-runtime"'));
    const handler = stop.slice(0, stop.indexOf("\n  });"));
    expect(handler.indexOf("getDeployment")).toBeLessThan(handler.indexOf("stopAgentRuntime"));
  });
});
