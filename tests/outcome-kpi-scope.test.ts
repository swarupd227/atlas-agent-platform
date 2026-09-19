/**
 * Outcomes and KPIs stay within their organization (server/tenant-scope.ts):
 * every /api/outcomes/:id route answers 404 for another organization's
 * outcome, a KPI belongs to its outcome's organization, and the KPI list only
 * holds the caller's. Outcome and KPI writes need create_modify_outcomes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = { outcomes: new Map<string, any>(), kpis: new Map<string, any>() };

vi.mock("../server/storage", () => ({
  storage: {
    getOutcome: async (id: string) => rows.outcomes.get(id),
    getKpi: async (id: string) => rows.kpis.get(id),
    getOutcomes: async (orgId?: string) => Array.from(rows.outcomes.values()).filter((o) => o.organizationId === (orgId ?? DEFAULT_ORG)),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { outcomeScope, kpiScope, filterKpisForOrg } from "../server/tenant-scope";

function req(org: string, opts: { method?: string; id?: string; path?: string; body?: any } = {}) {
  return {
    authUser: { organizationId: org, role: "outcome_owner", userId: "u", username: "u" },
    method: opts.method ?? "GET",
    params: opts.id ? { id: opts.id } : {},
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
  rows.outcomes.clear();
  rows.kpis.clear();
  rows.outcomes.set("out-a", { id: "out-a", organizationId: ORG_A });
  rows.outcomes.set("out-b", { id: "out-b", organizationId: ORG_B });
  rows.outcomes.set("out-legacy", { id: "out-legacy", organizationId: null });
  rows.kpis.set("kpi-a", { id: "kpi-a", outcomeId: "out-a" });
  rows.kpis.set("kpi-b", { id: "kpi-b", outcomeId: "out-b" });
});

describe("outcomeScope", () => {
  it("lets the owner through and answers 404 to anyone else", async () => {
    expect(await run(outcomeScope, req(ORG_A, { id: "out-a" }))).toBe("next");
    expect(await run(outcomeScope, req(ORG_B, { id: "out-a" }))).toBe(404);
    expect(await run(outcomeScope, req(ORG_B, { id: "out-a", method: "PATCH" }))).toBe(404);
  });

  it("treats a legacy outcome with no organization as the default org's", async () => {
    expect(await run(outcomeScope, req(DEFAULT_ORG, { id: "out-legacy" }))).toBe("next");
    expect(await run(outcomeScope, req(ORG_A, { id: "out-legacy" }))).toBe(404);
  });

  it("leaves reserved words and unknown ids to the routes", async () => {
    expect(await run(outcomeScope, req(ORG_B, { id: "intelligence" }))).toBe("next");
    expect(await run(outcomeScope, req(ORG_B, { id: "no-such-outcome" }))).toBe("next");
  });
});

describe("kpiScope", () => {
  it("checks a KPI through its outcome", async () => {
    expect(await run(kpiScope, req(ORG_A, { method: "PATCH", path: "/kpi-a" }))).toBe("next");
    expect(await run(kpiScope, req(ORG_B, { method: "DELETE", path: "/kpi-a" }))).toBe(404);
  });

  it("won't create a KPI on, or move one to, another org's outcome", async () => {
    expect(await run(kpiScope, req(ORG_B, { method: "POST", body: { outcomeId: "out-a" } }))).toBe(404);
    expect(await run(kpiScope, req(ORG_A, { method: "POST", body: { outcomeId: "out-a" } }))).toBe("next");
    expect(await run(kpiScope, req(ORG_A, { method: "PATCH", path: "/kpi-a", body: { outcomeId: "out-b" } }))).toBe(404);
  });

  it("filters the KPI list to the org's outcomes", async () => {
    const all = Array.from(rows.kpis.values());
    expect((await filterKpisForOrg(all, ORG_A)).map((k) => k.id)).toEqual(["kpi-a"]);
    expect((await filterKpisForOrg(all, ORG_B)).map((k) => k.id)).toEqual(["kpi-b"]);
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  it("mounts the scopes and guards every outcome and KPI write", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('app.use("/api/outcomes/:id", outcomeScope);');
    expect(routes).toContain('app.use("/api/kpis", kpiScope);');
    const src = read("server", "routes", "outcomes.ts");
    for (const route of [
      'router.patch("/api/outcomes/:id", checkPermission("create_modify_outcomes")',
      'router.post("/api/outcomes/:id/versions", checkPermission("create_modify_outcomes")',
      'router.post("/api/outcomes/:id/regenerate-constraint-graph", checkPermission("create_modify_outcomes")',
      'router.post("/api/outcomes/:id/sync-eval-feedback", checkPermission("create_modify_outcomes")',
      'router.post("/api/kpis", checkPermission("create_modify_outcomes")',
      'router.patch("/api/kpis/:id", checkPermission("create_modify_outcomes")',
      'router.delete("/api/kpis/:id", checkPermission("create_modify_outcomes")',
    ]) expect(src).toContain(route);
    expect(src).toContain("filterKpisForOrg(await storage.getKpis(), resolveRequestOrgId(req))");
  });
});
