/**
 * Knowledge bases and skill versions stay within their organization
 * (server/tenant-scope.ts): every /api/knowledge-bases/:id route answers 404
 * for another organization's knowledge base, a source in the path must belong
 * to that knowledge base, linking needs the agent and the knowledge base in
 * the caller's organization, and a link can only be removed from its own
 * agent. A skill version follows its skill; a platform skill's versions are
 * shared but changing one needs manage_security. Every knowledge-base and
 * skill write needs create_modify_blueprints.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = {
  kbs: new Map<string, any>(),
  sources: new Map<string, any>(),
  agents: new Map<string, any>(),
  links: new Map<string, any[]>(),
  skills: new Map<string, any>(),
  versions: new Map<string, any>(),
};

vi.mock("../server/storage", () => ({
  storage: {
    getKnowledgeBase: async (id: string) => rows.kbs.get(id),
    getKnowledgeSource: async (id: string) => rows.sources.get(id),
    getAgent: async (id: string) => rows.agents.get(id),
    getAgentKnowledgeBases: async (agentId: string) => rows.links.get(agentId) ?? [],
    getSkill: async (id: string) => rows.skills.get(id),
    getSkillVersion: async (id: string) => rows.versions.get(id),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { knowledgeBaseScope, agentKnowledgeLinkScope, skillVersionScope } from "../server/tenant-scope";

function req(org: string, opts: { method?: string; params?: Record<string, string>; path?: string; body?: any; role?: string } = {}) {
  return {
    authUser: { organizationId: org, role: opts.role ?? "agent_engineer", userId: "u" },
    method: opts.method ?? "GET",
    params: opts.params ?? {},
    path: opts.path ?? "/",
    query: {},
    body: opts.body ?? {},
    headers: {},
  } as any;
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
  for (const m of Object.values(rows)) m.clear();
  rows.kbs.set("kb-a", { id: "kb-a", organizationId: ORG_A });
  rows.kbs.set("kb-a2", { id: "kb-a2", organizationId: ORG_A });
  rows.kbs.set("kb-b", { id: "kb-b", organizationId: ORG_B });
  rows.sources.set("src-a", { id: "src-a", knowledgeBaseId: "kb-a" });
  rows.agents.set("ag-a", { id: "ag-a", organizationId: ORG_A });
  rows.agents.set("ag-b", { id: "ag-b", organizationId: ORG_B });
  rows.links.set("ag-a", [{ id: "link-a", agentId: "ag-a", knowledgeBaseId: "kb-a" }]);
  rows.links.set("ag-b", [{ id: "link-b", agentId: "ag-b", knowledgeBaseId: "kb-b" }]);
  rows.skills.set("sk-a", { id: "sk-a", organizationId: ORG_A });
  rows.skills.set("sk-platform", { id: "sk-platform", organizationId: null });
  rows.versions.set("v-a", { id: "v-a", skillId: "sk-a" });
  rows.versions.set("v-platform", { id: "v-platform", skillId: "sk-platform" });
});

describe("knowledgeBaseScope", () => {
  it("answers 404 for another organization's knowledge base on any route", async () => {
    expect(await run(knowledgeBaseScope, req(ORG_A, { params: { id: "kb-a" } }))).toBe("next");
    expect(await run(knowledgeBaseScope, req(ORG_B, { params: { id: "kb-a" }, path: "/chunks" }))).toBe(404);
    expect(await run(knowledgeBaseScope, req(ORG_B, { method: "POST", params: { id: "kb-a" }, path: "/sources/text" }))).toBe(404);
  });

  it("only acts on a source of the knowledge base in the path", async () => {
    expect(await run(knowledgeBaseScope, req(ORG_A, { method: "DELETE", params: { id: "kb-a" }, path: "/sources/src-a" }))).toBe("next");
    expect(await run(knowledgeBaseScope, req(ORG_A, { method: "DELETE", params: { id: "kb-a2" }, path: "/sources/src-a" }))).toBe(404);
  });

  it("leaves the org-wide staleness check and unknown ids to the routes", async () => {
    expect(await run(knowledgeBaseScope, req(ORG_B, { method: "POST", params: { id: "check-all-staleness" } }))).toBe("next");
    expect(await run(knowledgeBaseScope, req(ORG_B, { params: { id: "no-such-kb" } }))).toBe("next");
  });
});

describe("agentKnowledgeLinkScope", () => {
  it("needs the agent in the caller's organization", async () => {
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { params: { agentId: "ag-a" } }))).toBe("next");
    expect(await run(agentKnowledgeLinkScope, req(ORG_B, { params: { agentId: "ag-a" } }))).toBe(404);
  });

  it("links only the caller's own knowledge bases", async () => {
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { method: "POST", params: { agentId: "ag-a" }, body: { knowledgeBaseId: "kb-a2" } }))).toBe("next");
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { method: "POST", params: { agentId: "ag-a" }, body: { knowledgeBaseId: "kb-b" } }))).toBe(404);
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { method: "POST", params: { agentId: "ag-a" }, body: {} }))).toBe(400);
  });

  it("removes a link only from its own agent", async () => {
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { method: "DELETE", params: { agentId: "ag-a" }, path: "/link-a" }))).toBe("next");
    expect(await run(agentKnowledgeLinkScope, req(ORG_A, { method: "DELETE", params: { agentId: "ag-a" }, path: "/link-b" }))).toBe(404);
  });
});

describe("skillVersionScope", () => {
  it("follows the skill's organization", async () => {
    expect(await run(skillVersionScope, req(ORG_A, { method: "PATCH", params: { id: "v-a" } }))).toBe("next");
    expect(await run(skillVersionScope, req(ORG_B, { params: { id: "v-a" } }))).toBe(404);
  });

  it("shares platform skill versions but needs manage_security to change one", async () => {
    expect(await run(skillVersionScope, req(ORG_B, { params: { id: "v-platform" } }))).toBe("next");
    expect(await run(skillVersionScope, req(ORG_B, { method: "PATCH", params: { id: "v-platform" } }))).toBe(403);
    expect(await run(skillVersionScope, req(ORG_B, { method: "PATCH", params: { id: "v-platform" }, role: "admin" }))).toBe("next");
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

  it("mounts the scopes before the knowledge-base routes are registered", () => {
    const routes = read("server", "routes.ts");
    for (const line of [
      'app.use("/api/knowledge-bases/:id", knowledgeBaseScope);',
      'app.use("/api/agents/:agentId/knowledge-bases", agentKnowledgeLinkScope);',
      'app.use("/api/skill-versions/:id", skillVersionScope);',
    ]) {
      expect(routes).toContain(line);
      expect(routes.indexOf(line)).toBeLessThan(routes.indexOf("registerKnowledgeBaseRoutes(app);"));
    }
  });

  it("guards every knowledge-base and skill write", () => {
    const kb = read("server", "kb-routes.ts");
    const writes = kb.match(/app\.(post|patch|delete)\("[^"]+",[^\n]*/g) ?? [];
    const unguarded = writes.filter((l) => !l.includes('checkPermission("create_modify_blueprints")'));
    // Search and query read a knowledge base; they change nothing.
    expect(unguarded.map((l) => l.match(/"([^"]+)"/)![1]).sort()).toEqual(["/api/knowledge-bases/:id/query", "/api/knowledge-bases/:id/search"]);
    const skills = read("server", "routes", "skills.ts");
    for (const r of ['router.patch("/api/skill-versions/:id"', 'router.post("/api/skill-chains"', 'router.patch("/api/skill-chains/:id"', 'router.delete("/api/skill-chains/:id"']) {
      expect(skills).toContain(`${r}, checkPermission("create_modify_blueprints")`);
    }
  });

  it("lists only the caller's knowledge bases for an agent and in the staleness sweep", () => {
    const kb = read("server", "kb-routes.ts");
    expect(kb).not.toContain("await storage.getKnowledgeBases();");
  });
});
