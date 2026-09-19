/**
 * Team agents and their runs stay within their organization
 * (server/tenant-scope.ts): a DAG run belongs to its team agent's
 * organization, so its detail, state, events, waves and explanation answer
 * 404 to anyone else, and the run list is filtered. Also: agents created by
 * a journey clone or a process-flow sync land in the caller's organization,
 * proposing a team needs create_modify_blueprints, and Deploy & Run only
 * touches staging and records skipped stages as skipped.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = { agents: new Map<string, any>(), runs: new Map<string, any>() };

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: async (id: string) => rows.agents.get(id),
    getDagExecutionRun: async (id: string) => rows.runs.get(id),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { dagRunScope, teamAgentScope, filterDagRunsForOrg } from "../server/tenant-scope";

function req(org: string, id: string) {
  return { authUser: { organizationId: org, role: "agent_engineer", userId: "u" }, method: "GET", params: { id }, path: "/", query: {}, body: {}, headers: {} } as any;
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
  rows.runs.clear();
  rows.agents.set("team-a", { id: "team-a", organizationId: ORG_A });
  rows.agents.set("team-legacy", { id: "team-legacy", organizationId: null });
  rows.runs.set("run-a", { id: "run-a", teamAgentId: "team-a" });
  rows.runs.set("run-legacy", { id: "run-legacy", teamAgentId: "team-legacy" });
  rows.runs.set("run-pipeline", { id: "run-pipeline", teamAgentId: null });
});

describe("dagRunScope", () => {
  it("lets the team agent's organization through and answers 404 to others", async () => {
    expect(await run(dagRunScope, req(ORG_A, "run-a"))).toBe("next");
    expect(await run(dagRunScope, req(ORG_B, "run-a"))).toBe(404);
  });

  it("treats runs of legacy agents and runs with no team agent as the default org's", async () => {
    expect(await run(dagRunScope, req(DEFAULT_ORG, "run-legacy"))).toBe("next");
    expect(await run(dagRunScope, req(ORG_A, "run-pipeline"))).toBe(404);
  });

  it("leaves 'recent' and unknown ids to the routes", async () => {
    expect(await run(dagRunScope, req(ORG_B, "recent"))).toBe("next");
    expect(await run(dagRunScope, req(ORG_B, "no-such-run"))).toBe("next");
  });

  it("filters the run list", async () => {
    const all = Array.from(rows.runs.values());
    expect((await filterDagRunsForOrg(all, ORG_A)).map((r) => r.id)).toEqual(["run-a"]);
    expect((await filterDagRunsForOrg(all, DEFAULT_ORG)).map((r) => r.id)).toEqual(["run-legacy", "run-pipeline"]);
  });
});

describe("teamAgentScope", () => {
  it("answers 404 for another organization's team agent", async () => {
    expect(await run(teamAgentScope, req(ORG_A, "team-a"))).toBe("next");
    expect(await run(teamAgentScope, req(ORG_B, "team-a"))).toBe(404);
    expect(await run(teamAgentScope, req(ORG_B, "unknown"))).toBe("next");
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

  it("mounts the scopes and filters the run list", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('app.use("/api/team-agents/:id", teamAgentScope);');
    expect(routes).toContain('app.use("/api/dag-execution-runs/:id", dagRunScope);');
    expect(routes).toContain('app.use("/api/dag-runs/:id", dagRunScope);');
    expect(read("server", "routes", "runtime.ts")).toContain("filterDagRunsForOrg(await storage.listDagExecutionRuns(pipelineRunId), resolveRequestOrgId(req))");
  });

  it("creates cloned and synced agents in the caller's organization", () => {
    expect(read("server", "routes", "journeys.ts")).toContain("organizationId: orgId ?? getDefaultOrgId() ?? undefined,");
    expect(read("server", "routes", "outcomes.ts")).toContain("organizationId: outcome.organizationId ?? orgId ?? undefined,");
  });

  it("needs create_modify_blueprints to propose a team", () => {
    expect(read("server", "routes", "improvements.ts")).toContain('router.post("/api/ai/propose-agents", checkPermission("create_modify_blueprints")');
  });

  it("keeps Deploy & Run to staging and records skipped stages honestly", () => {
    const src = read("server", "routes", "shadow-canary.ts");
    expect(src).toContain('router.post("/api/agents/:id/deploy-and-run", checkPermission("deploy_staging_pilot")');
    expect(src).toContain('d.environment === "staging" && (d.status === "deployed" || d.status === "pending")');
    expect(src).toContain('status: "skipped"');
    expect(src).not.toContain("Auto-approved by Deploy & Run");
  });
});
