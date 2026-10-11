/**
 * Agents and skills belong to one organization, and every route under /api/agents/:id and /api/skills/:id is held to that by a
 * scope mounted once ahead of the routers (server/tenant-scope.ts), the way MCP servers and blueprints already are.
 *
 * Found by a cross-tenant sweep on 2026-10-11: the sub-resources of an agent (playground sessions and their messages, channels with
 * their webhook secret and bot token, triggers, evals, recommendations, autonomous actions, versions) and two skill routes
 * (run an eval, validate tags) looked the object up by the id in the URL and nothing else. A route that forgot the organization
 * was open; with the scope mounted ahead of the routers, a route that forgets it is still closed.
 *
 * An id that does not exist falls through, so the route answers exactly as it did. Another organization's object answers 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";
const agents = new Map<string, any>();
const skills = new Map<string, any>();
const lookups: string[] = [];

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: async (id: string, orgId?: string) => { lookups.push(`agent:${id}:${orgId ?? "-"}`); return agents.get(id); },
    getSkill: async (id: string, orgId?: string) => { lookups.push(`skill:${id}:${orgId ?? "-"}`); return skills.get(id); },
  },
}));
vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { agentScope, skillScope } from "../server/tenant-scope";

const req = (org: string | undefined, id: string | undefined, method = "GET", role = "admin") =>
  ({ authUser: org ? { organizationId: org, role, userId: "u", username: "u" } : undefined, method, params: id === undefined ? {} : { id }, headers: {}, path: "/", query: {}, body: {} }) as any;
async function run(mw: any, r: any) {
  let status = 200, body: any = null; const next = vi.fn();
  const res: any = { status(s: number) { status = s; return res; }, json(b: any) { body = b; return res; } };
  await mw(r, res, next);
  return { status, body, next };
}

beforeEach(() => {
  agents.clear(); skills.clear(); lookups.length = 0;
  agents.set("ag-a", { id: "ag-a", organizationId: ORG_A });
  agents.set("ag-legacy", { id: "ag-legacy", organizationId: null });
  skills.set("sk-a", { id: "sk-a", organizationId: ORG_A });
  skills.set("sk-shared", { id: "sk-shared", organizationId: null });
});

describe("agentScope (/api/agents/:id/*)", () => {
  it("answers 404 to another organization for every method, without saying the agent exists", async () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = await run(agentScope, req(ORG_B, "ag-a", method));
      expect(r.next, method).not.toHaveBeenCalled();
      expect(r.status, method).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain(ORG_A);
    }
  });

  it("lets the owning organization through, whatever the method", async () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) expect((await run(agentScope, req(ORG_A, "ag-a", method))).next, method).toHaveBeenCalledOnce();
  });

  it("lets an id that is not an agent fall through, so the route answers as it always did", async () => {
    expect((await run(agentScope, req(ORG_B, "wizard"))).next).toHaveBeenCalledOnce();
    expect((await run(agentScope, req(ORG_B, undefined))).next).toHaveBeenCalledOnce();
  });

  it("treats an agent with no organization as the default organization's", async () => {
    expect((await run(agentScope, req(DEFAULT_ORG, "ag-legacy"))).next).toHaveBeenCalledOnce();
    const other = await run(agentScope, req(ORG_B, "ag-legacy"));
    expect(other.status).toBe(404);
  });

  it("refuses a caller with no organization at all (it would otherwise be treated as the default one only when it is)", async () => {
    const r = await run(agentScope, req(undefined, "ag-a"));
    expect(r.status).toBe(404);
  });

  it("looks the agent up without an organization, so a stranger and a missing agent are told apart only inside the scope", async () => {
    await run(agentScope, req(ORG_B, "ag-a"));
    expect(lookups).toEqual(["agent:ag-a:-"]);
  });
});

describe("skillScope (/api/skills/:id/*)", () => {
  it("answers 404 to another organization for every method", async () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const r = await run(skillScope, req(ORG_B, "sk-a", method));
      expect(r.next, method).not.toHaveBeenCalled();
      expect(r.status, method).toBe(404);
    }
  });

  it("lets the owner through", async () => {
    expect((await run(skillScope, req(ORG_A, "sk-a", "POST"))).next).toHaveBeenCalledOnce();
  });

  it("lets an unknown id fall through", async () => {
    expect((await run(skillScope, req(ORG_B, "import"))).next).toHaveBeenCalledOnce();
  });

  it("a skill with no organization is the platform's: anyone may read it, only the platform's own organization may change it", async () => {
    expect((await run(skillScope, req(ORG_B, "sk-shared", "GET"))).next).toHaveBeenCalledOnce();
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const r = await run(skillScope, req(ORG_B, "sk-shared", method));
      expect(r.status, method).toBe(403);
      expect(r.next, method).not.toHaveBeenCalled();
    }
    expect((await run(skillScope, req(DEFAULT_ORG, "sk-shared", "PATCH"))).next).toHaveBeenCalledOnce();
  });
});

describe("wiring", () => {
  const src = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");

  it("both scopes are mounted ahead of the feature routers", () => {
    const routes = src("server/routes.ts");
    const firstFeatureRouter = routes.indexOf("app.use(toolConnectorsRouter)");
    for (const mount of ['app.use("/api/agents/:id", agentScope)', 'app.use("/api/skills/:id", skillScope)']) {
      const at = routes.indexOf(mount);
      expect(at, mount).toBeGreaterThan(-1);
      expect(at, mount).toBeLessThan(firstFeatureRouter);
    }
  });

  it("the two skill routes that looked a skill up by id alone now pass the organization as well", () => {
    const skillsSrc = src("server/routes/skills.ts");
    const validate = skillsSrc.slice(skillsSrc.indexOf('"/api/skills/:id/validate-ontology-tags"'));
    expect(validate.slice(0, 400)).toContain("storage.getSkill(req.params.id as string, getOrgId(req))");
    const evalRun = src("server/routes/agents.ts");
    const at = evalRun.indexOf('"/api/skills/:id/eval/run"');
    expect(evalRun.slice(at, at + 400)).toContain("storage.getSkill(skillId, getOrgId(req))");
  });

  it("deleting a skill that is not yours says so, instead of answering success", () => {
    const skillsSrc = src("server/routes/skills.ts");
    const at = skillsSrc.indexOf('router.delete("/api/skills/:id"');
    const body = skillsSrc.slice(at, at + 900);
    expect(body).toContain("getSkill(skillId, getOrgId(req))");
    expect(body.indexOf("getSkill(skillId")).toBeLessThan(body.indexOf("storage.getAgents"));
  });
});
