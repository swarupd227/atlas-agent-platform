/**
 * shared/policy-requirements.ts: the wizard's design-time policy check.
 */
import { describe, it, expect } from "vitest";
import { BUILT_IN_POLICY_REQUIREMENTS, checkPolicyRequirements, policyRequirementsFor } from "../shared/policy-requirements";
import { packPolicyPacks } from "../shared/industry-packs";

describe("policyRequirementsFor", () => {
  it("keeps the built-in verticals' requirements", () => {
    expect(policyRequirementsFor("healthcare")).toEqual(BUILT_IN_POLICY_REQUIREMENTS.healthcare);
    expect(BUILT_IN_POLICY_REQUIREMENTS.financial_services.map((r) => r.regulation)).toEqual(["PCI-DSS", "GLBA", "BSA/AML", "SOX", "REG_DD"]);
  });

  it("derives requirements from an industry pack's policy packs", () => {
    const pack = packPolicyPacks.find((p) => p.industry === "equipment_dealer")!;
    const reqs = policyRequirementsFor("equipment_dealer");
    expect(reqs.length).toBeGreaterThanOrEqual(pack.policies.length);
    expect(reqs).toContainEqual(expect.objectContaining({ regulation: pack.framework, policyName: pack.policies[0].name, domain: pack.policies[0].domain }));
  });
});

describe("checkPolicyRequirements", () => {
  const reqs = [
    { domain: "data_handling", regulation: "HIPAA", description: "PHI handling" },
    { domain: "tool_permissions", regulation: "SOX", description: "Posting approval", policyName: "Dealer posting authority" },
  ];

  it("says nothing was checked when no requirements are known, rather than passing silently", () => {
    const r = checkPolicyRequirements("aerospace", [], []);
    expect(r).toMatchObject({ checked: false, requirements: [] });
    expect(r.message).toMatch(/none were checked/);
  });

  it("matches by regulation in the policy's name or description, or by the pack policy's name, within the domain", () => {
    const r = checkPolicyRequirements("x", reqs, [
      { name: "HIPAA PHI guard", description: null, domain: "data_handling" },
      { name: "Dealer posting authority", description: null, domain: "tool_permissions" },
    ], "HIGH");
    expect(r).toMatchObject({ passed: true, checked: true });
    expect(r.requirements.every((x) => x.severity === "critical")).toBe(true);
  });

  it("reports what's missing", () => {
    const r = checkPolicyRequirements("x", reqs, [{ name: "HIPAA PHI guard", description: null, domain: "output_control" }]);
    expect(r.passed).toBe(false);
    expect(r.requirements.map((x) => x.status)).toEqual(["missing", "missing"]);
  });
});
