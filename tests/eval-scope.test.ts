/**
 * Evaluation stays within its organization (server/tenant-scope.ts). None of
 * the legacy eval tables has an organization column, so ownership is derived:
 * a suite belongs to its agent's organization, a run to its own agent or its
 * suite's, and both lists are filtered. Golden datasets are a shared benchmark
 * library, so only their writes are guarded. Eval Studio no longer treats a
 * record with no organization as everyone's.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = { agents: new Map<string, any>(), suites: new Map<string, any>(), runs: [] as any[] };

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: async (id: string) => rows.agents.get(id),
    getAgentOrgMap: async () => new Map(Array.from(rows.agents.values()).map((a: any) => [a.id, a.organizationId ?? null])),
    getEvalSuite: async (id: string) => rows.suites.get(id),
    getAllEvalRuns: async () => rows.runs,
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { evalSuiteScope, evalRunScope, filterEvalSuitesForOrg, filterEvalRunsForOrg } from "../server/tenant-scope";

function req(org: string, id?: string, method = "GET") {
  return { authUser: { organizationId: org, role: "agent_engineer", userId: "u" }, method, params: id ? { id } : {}, path: "/", query: {}, body: {}, headers: {} } as any;
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
  rows.agents.clear();
  rows.suites.clear();
  rows.agents.set("ag-a", { id: "ag-a", organizationId: ORG_A });
  rows.agents.set("ag-b", { id: "ag-b", organizationId: ORG_B });
  rows.agents.set("ag-legacy", { id: "ag-legacy", organizationId: null });
  rows.suites.set("suite-a", { id: "suite-a", agentId: "ag-a" });
  rows.suites.set("suite-b", { id: "suite-b", agentId: "ag-b" });
  rows.suites.set("suite-legacy", { id: "suite-legacy", agentId: "ag-legacy" });
  rows.runs = [
    { id: "run-a", agentId: "ag-a", suiteId: "suite-a" },
    { id: "run-b", agentId: null, suiteId: "suite-b" },
    { id: "run-legacy", agentId: null, suiteId: "suite-legacy" },
  ];
});

describe("evalSuiteScope", () => {
  it("follows the suite's agent", async () => {
    expect(await run(evalSuiteScope, req(ORG_A, "suite-a"))).toBe("next");
    expect(await run(evalSuiteScope, req(ORG_B, "suite-a"))).toBe(404);
    expect(await run(evalSuiteScope, req(ORG_B, "suite-a", "POST"))).toBe(404);
    expect(await run(evalSuiteScope, req(ORG_B, "unknown-suite"))).toBe("next");
    expect(await run(evalSuiteScope, req(DEFAULT_ORG, "suite-legacy"))).toBe("next");
  });

  it("filters the suite list", async () => {
    const all = Array.from(rows.suites.values());
    expect((await filterEvalSuitesForOrg(all, ORG_A)).map((s) => s.id)).toEqual(["suite-a"]);
    expect((await filterEvalSuitesForOrg(all, DEFAULT_ORG)).map((s) => s.id)).toEqual(["suite-legacy"]);
  });
});

describe("evalRunScope", () => {
  it("uses the run's agent, or its suite's agent when the run has none", async () => {
    expect(await run(evalRunScope, req(ORG_A, "run-a"))).toBe("next");
    expect(await run(evalRunScope, req(ORG_B, "run-a"))).toBe(404);
    expect(await run(evalRunScope, req(ORG_B, "run-b"))).toBe("next");
    expect(await run(evalRunScope, req(ORG_A, "run-b"))).toBe(404);
  });

  it("filters the run list", async () => {
    expect((await filterEvalRunsForOrg(rows.runs, ORG_A)).map((r) => r.id)).toEqual(["run-a"]);
    expect((await filterEvalRunsForOrg(rows.runs, ORG_B)).map((r) => r.id)).toEqual(["run-b"]);
    expect((await filterEvalRunsForOrg(rows.runs, DEFAULT_ORG)).map((r) => r.id)).toEqual(["run-legacy"]);
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

  it("mounts both scopes and filters both lists", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('app.use("/api/evals/:id", evalSuiteScope);');
    expect(routes).toContain('app.use("/api/eval-runs/:id", evalRunScope);');
    const agents = read("server", "routes", "agents.ts");
    expect(agents).toContain("filterEvalSuitesForOrg(await storage.getEvalSuites(), resolveRequestOrgId(req))");
    expect(agents).toContain("filterEvalRunsForOrg(await storage.getAllEvalRuns(), resolveRequestOrgId(req))");
  });

  it("creates a suite only against the caller's own agent", () => {
    const agents = read("server", "routes", "agents.ts");
    expect(agents).toContain('router.post("/api/evals", checkPermission("create_modify_blueprints")');
    expect(agents).toContain("await storage.getAgent(data.agentId, getOrgId(req))");
  });

  it("guards golden-dataset and eval writes", () => {
    const skills = read("server", "routes", "skills.ts");
    const writes = skills.match(/router\.(post|patch|delete)\("\/api\/golden[^"]*",[^\n]*/g) ?? [];
    const unguarded = writes.filter((l) => !l.includes('checkPermission('));
    expect(unguarded.map((l) => l.match(/"([^"]+)"/)![1])).toEqual([
      "/api/golden-datasets/:id/promote-production-cases",
      "/api/golden-datasets/seed",
    ]);
    const evals = read("server", "routes", "evaluations.ts");
    for (const r of ['router.post("/api/evals/:id/test-cases"', 'router.post("/api/evals/:id/runs"', 'router.post("/api/eval-runs/:runId/case-results"']) {
      expect(evals).toContain(`${r}, checkPermission("create_modify_blueprints")`);
    }
  });

  it("no longer hands a record with no organization to every organization", () => {
    const studio = read("server", "routes", "eval-studio.ts");
    expect(studio).toContain("const owner = entityOrgId ?? getDefaultOrgId();");
    expect(studio).not.toContain("if (!entityOrgId) return;");
  });
});
