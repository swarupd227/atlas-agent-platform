/**
 * Governance stays within its organization (server/tenant-scope.ts): a policy
 * and everything hanging off it, a policy exception through its policy, and
 * compliance reports through the organization recorded when they are created.
 * Policy exceptions, test cases and reports need create_modify_policies, and
 * the audit chain is verified with the writer's own canonicalization.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORG_A = "org-a";
const ORG_B = "org-b";
const DEFAULT_ORG = "org-default";

const rows = { policies: new Map<string, any>(), exceptions: [] as any[], agents: new Map<string, any>() };

vi.mock("../server/storage", () => ({
  storage: {
    getPolicy: async (id: string) => rows.policies.get(id),
    getPolicyExceptions: async () => rows.exceptions,
    getAgent: async (id: string) => rows.agents.get(id),
  },
}));

vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production",
  getDefaultOrgId: () => DEFAULT_ORG,
  getOrgId: (req: any) => req.authUser?.organizationId,
}));

import { policyScope, policyExceptionScope, filterPolicyExceptionsForOrg, filterComplianceReportsForOrg, complianceReportOrgId } from "../server/tenant-scope";

function req(org: string, opts: { method?: string; params?: Record<string, string>; path?: string; body?: any } = {}) {
  return {
    authUser: { organizationId: org, role: "compliance_security", userId: "u" },
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
  rows.policies.clear();
  rows.agents.clear();
  rows.policies.set("pol-a", { id: "pol-a", organizationId: ORG_A });
  rows.policies.set("pol-b", { id: "pol-b", organizationId: ORG_B });
  rows.policies.set("pol-legacy", { id: "pol-legacy", organizationId: null });
  rows.agents.set("ag-a", { id: "ag-a", organizationId: ORG_A });
  rows.exceptions = [
    { id: "exc-a", policyId: "pol-a" },
    { id: "exc-b", policyId: "pol-b" },
    { id: "exc-orphan", policyId: "pol-gone" },
  ];
});

describe("policyScope", () => {
  it("answers 404 for another organization's policy, on the policy and everything under it", async () => {
    expect(await run(policyScope, req(ORG_A, { params: { id: "pol-a" }, path: "/test-cases" }))).toBe("next");
    expect(await run(policyScope, req(ORG_B, { params: { id: "pol-a" }, path: "/test-cases" }))).toBe(404);
    expect(await run(policyScope, req(ORG_B, { method: "POST", params: { id: "pol-a" }, path: "/bind-outcome" }))).toBe(404);
    expect(await run(policyScope, req(ORG_B, { params: { id: "no-such-policy" } }))).toBe("next");
  });
});

describe("policy exceptions", () => {
  it("follow their policy's organization", async () => {
    expect((await filterPolicyExceptionsForOrg(rows.exceptions, ORG_A)).map((e) => e.id)).toEqual(["exc-a"]);
    expect((await filterPolicyExceptionsForOrg(rows.exceptions, ORG_B)).map((e) => e.id)).toEqual(["exc-b"]);
    expect((await filterPolicyExceptionsForOrg(rows.exceptions, DEFAULT_ORG)).map((e) => e.id)).toEqual(["exc-orphan"]);
  });

  it("can't be updated or created across organizations", async () => {
    expect(await run(policyExceptionScope, req(ORG_A, { method: "PATCH", path: "/exc-a" }))).toBe("next");
    expect(await run(policyExceptionScope, req(ORG_B, { method: "PATCH", path: "/exc-a" }))).toBe(404);
    expect(await run(policyExceptionScope, req(ORG_B, { method: "POST", body: { policyId: "pol-a" } }))).toBe(404);
    expect(await run(policyExceptionScope, req(ORG_B, { method: "POST", body: { policyId: "pol-b", agentId: "ag-a" } }))).toBe(404);
    expect(await run(policyExceptionScope, req(ORG_A, { method: "POST", body: { policyId: "pol-a", agentId: "ag-a" } }))).toBe("next");
  });

  it("scopes the per-agent list to the caller's agent", async () => {
    expect(await run(policyExceptionScope, req(ORG_A, { path: "/agent/ag-a" }))).toBe("next");
    expect(await run(policyExceptionScope, req(ORG_B, { path: "/agent/ag-a" }))).toBe(404);
  });
});

describe("compliance reports", () => {
  const reports = [
    { id: "r-a", evidencePackage: { organizationId: ORG_A } },
    { id: "r-b", evidencePackage: { organizationId: ORG_B } },
    { id: "r-legacy", evidencePackage: { probes: 3 } },
  ];
  it("belong to the organization recorded in the evidence package, legacy ones to the default", () => {
    expect(complianceReportOrgId(reports[0])).toBe(ORG_A);
    expect(complianceReportOrgId(reports[2])).toBe(DEFAULT_ORG);
    expect(filterComplianceReportsForOrg(reports, ORG_A).map((r) => r.id)).toEqual(["r-a"]);
    expect(filterComplianceReportsForOrg(reports, DEFAULT_ORG).map((r) => r.id)).toEqual(["r-legacy"]);
  });
});

describe("wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  const gov = () => read("server", "routes", "governance.ts");

  it("mounts both scopes", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('app.use("/api/policies/:id", policyScope);');
    expect(routes).toContain('app.use("/api/policy-exceptions", policyExceptionScope);');
  });

  it("guards exception, test-case and report writes", () => {
    for (const route of [
      'router.post("/api/policies/:id/test-cases", checkPermission("create_modify_policies")',
      'router.post("/api/policies/:id/test-cases/:testId/run", checkPermission("create_modify_policies")',
      'router.post("/api/policy-exceptions", checkPermission("create_modify_policies")',
      'router.patch("/api/policy-exceptions/:id", checkPermission("create_modify_policies")',
      'router.post("/api/compliance-reports", checkPermission("create_modify_policies")',
    ]) expect(gov()).toContain(route);
  });

  it("validates an exception update instead of writing the raw body", () => {
    expect(gov()).toContain("insertPolicyExceptionSchema.partial().parse(req.body)");
    expect(gov()).not.toContain("updatePolicyException(req.params.id, req.body)");
  });

  it("verifies the audit chain with the writer's canonicalization, scoped to the organization", () => {
    const src = gov();
    const route = src.slice(src.indexOf('router.get("/api/audit-events/verify-chain"'));
    const handler = route.slice(0, route.indexOf("\n  });"));
    expect(handler).toContain("storage.verifyAuditChainIntegrity(resolveRequestOrgId(req))");
    // The old hand-rolled hash (fewer fields than the writer signs) is gone.
    expect(handler).not.toContain("createHash");
    expect(src).not.toContain("verify-chain-legacy");
  });

  it("records the organization on a new compliance report", () => {
    expect(gov()).toContain("organizationId: resolveRequestOrgId(req) ?? null");
  });
});
