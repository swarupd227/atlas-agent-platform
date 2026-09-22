/**
 * The Policy Engine is folded into Governance. Governance's list switches
 * between your policies and the regulation catalogue; a regulation shows the
 * policies you took from it, the rules you can still adopt and what it
 * requires. The catalogue is shared by every organization, so only an admin
 * may change it, and an adopted rule becomes a policy of the caller's own
 * organization, once.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { adoptedRuleIds, coverageCounts, policiesFromRegulation, regulationFromSearch } from "../client/src/pages/governance-overview";

const policy = (id: string, rules: any[]) => ({ id, name: id, policyJson: { rules } }) as any;

describe("which of your policies came from a regulation", () => {
  const policies = [
    policy("p1", [{ sourceRegulationId: "gdpr", sourcePolicyId: "r1" }]),
    policy("p2", [{ sourceRegulationId: "gdpr", sourcePolicyId: "r2" }, { description: "hand-written" }]),
    policy("p3", [{ sourceRegulationId: "sox", sourcePolicyId: "r9" }]),
    policy("p4", []),
    { id: "p5", name: "no json", policyJson: null } as any,
  ];

  it("matches on the regulation the rule was taken from", () => {
    expect(policiesFromRegulation(policies, "gdpr").map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(policiesFromRegulation(policies, "hipaa")).toEqual([]);
  });

  it("knows which catalogue rules are already adopted", () => {
    expect([...adoptedRuleIds(policies)].sort()).toEqual(["r1", "r2", "r9"]);
  });
});

describe("what a regulation requires", () => {
  it("counts requirements by the coverage the catalogue records", () => {
    expect(coverageCounts([{ coverageStatus: "full" }, { coverageStatus: "gap" }, { coverageStatus: "partial" }, { coverageStatus: "full" }])).toEqual({ full: 2, partial: 1, gap: 1 });
  });

  it("opens a regulation from a link", () => {
    expect(regulationFromSearch("?regulation=gdpr-1")).toBe("gdpr-1");
    expect(regulationFromSearch("?policy=x")).toBeNull();
  });
});

describe("the page", () => {
  const page = readFileSync(join(__dirname, "..", "client", "src", "pages", "governance-overview.tsx"), "utf8");

  it("has the regulations in Governance, not behind a link to another page", () => {
    expect(page).toContain('data-testid={`view-${v}`}');
    expect(page).toContain("function RegulationDetail(");
    expect(page).not.toContain("Regulations & change tracker");
  });

  it("links to the old catalogue editor only for admins", () => {
    expect(page).toMatch(/\{canEditCatalogue && <Button[^\n]*\/governance\/policy-engine/);
  });

  it("sends regulatory alerts to the Regulations list, not the old page", () => {
    expect(page).toContain('get("view") === "regulations"');
    const monitor = readFileSync(join(__dirname, "..", "client", "src", "pages", "monitor.tsx"), "utf8");
    expect(monitor).not.toContain('navigate("/governance/policy-engine")');
    expect(monitor).toContain('navigate("/governance?view=regulations")');
  });

  it("doesn't show the catalogue's encoded-policy count, which doesn't match its rules", () => {
    expect(page).not.toContain("encodedPolicyCount");
  });

  it("says coverage is the catalogue's record, not a check of your agents", () => {
    expect(page).toContain("This isn't checked against your agents.");
  });
});

describe("the catalogue's server routes", () => {
  const src = readFileSync(join(__dirname, "..", "server", "routes", "runtime.ts"), "utf8").replace(/\r\n/g, "\n");

  it.each([
    'router.post("/api/regulations", ',
    'router.patch("/api/regulations/:id", ',
    'router.post("/api/regulatory-policies", ',
    'router.patch("/api/regulatory-policies/:id", ',
    'router.post("/api/compliance-controls", ',
    'router.post("/api/regulatory-changes", ',
    'router.patch("/api/regulatory-changes/:id", ',
    'router.post("/api/regulations/seed", ',
  ])("%s is admin-only", (route) => {
    const at = src.indexOf(route);
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 160)).toContain('checkPermission("manage_platform_settings")');
  });

  it("adopting a rule makes a policy of the caller's organization, and only once", () => {
    const at = src.indexOf('router.post("/api/regulatory-policies/:id/push-to-governance"');
    const route = src.slice(at, at + 2600);
    expect(route).toContain("const orgId = resolveRequestOrgId(req);");
    expect(route).toContain("organizationId: orgId,");
    expect(route).toContain("res.status(409)");
  });
});
