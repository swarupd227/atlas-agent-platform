/**
 * Permissions-aware retrieval — role-to-sensitivity access control.
 * getMaxKbSensitivity/canAccessKbSensitivity gate what a role may retrieve
 * from a knowledge base. Proves: the R0/R1/R2 grouping maps to the right
 * tiers, unrecognized/missing classification defaults to "public" (never
 * hides pre-existing unclassified content), and an absent role (e.g. an
 * unattended scheduled run) gets a safe middle tier — never full access.
 */
import { describe, it, expect } from "vitest";
import { getMaxKbSensitivity, canAccessKbSensitivity, type RoleId } from "../server/permissions";

describe("getMaxKbSensitivity", () => {
  it("R0 roles (admin, compliance_security) get the highest tier: restricted", () => {
    expect(getMaxKbSensitivity("admin")).toBe("restricted");
    expect(getMaxKbSensitivity("compliance_security")).toBe("restricted");
  });

  it("R1 roles (agent_engineer, ops_sre, expert_validator) get confidential", () => {
    expect(getMaxKbSensitivity("agent_engineer")).toBe("confidential");
    expect(getMaxKbSensitivity("ops_sre")).toBe("confidential");
    expect(getMaxKbSensitivity("expert_validator")).toBe("confidential");
  });

  it("R2 roles (outcome_owner, finance, domain_expert) get internal", () => {
    expect(getMaxKbSensitivity("outcome_owner")).toBe("internal");
    expect(getMaxKbSensitivity("finance")).toBe("internal");
    expect(getMaxKbSensitivity("domain_expert")).toBe("internal");
  });

  it("an absent role (e.g. unattended scheduled run) gets internal, never full access", () => {
    expect(getMaxKbSensitivity(undefined)).toBe("internal");
    expect(getMaxKbSensitivity(null)).toBe("internal");
  });
});

describe("canAccessKbSensitivity", () => {
  it("every role can access public content", () => {
    (["admin", "finance", "domain_expert", undefined] as Array<RoleId | undefined>).forEach(role => {
      expect(canAccessKbSensitivity(role, "public")).toBe(true);
    });
  });

  it("R2 roles cannot access confidential or restricted content", () => {
    expect(canAccessKbSensitivity("finance", "confidential")).toBe(false);
    expect(canAccessKbSensitivity("finance", "restricted")).toBe(false);
    expect(canAccessKbSensitivity("finance", "internal")).toBe(true);
  });

  it("R1 roles can access confidential but not restricted content", () => {
    expect(canAccessKbSensitivity("agent_engineer", "confidential")).toBe(true);
    expect(canAccessKbSensitivity("agent_engineer", "restricted")).toBe(false);
  });

  it("R0 roles can access everything including restricted content", () => {
    expect(canAccessKbSensitivity("admin", "restricted")).toBe(true);
    expect(canAccessKbSensitivity("compliance_security", "restricted")).toBe(true);
  });

  it("an unrecognized or missing sensitivity value defaults to public — never accidentally hidden", () => {
    expect(canAccessKbSensitivity("finance", null)).toBe(true);
    expect(canAccessKbSensitivity("finance", undefined)).toBe(true);
    expect(canAccessKbSensitivity("finance", "not-a-real-level")).toBe(true);
  });

  it("a missing role cannot access restricted content, even though it also can't access confidential", () => {
    expect(canAccessKbSensitivity(undefined, "restricted")).toBe(false);
    expect(canAccessKbSensitivity(undefined, "confidential")).toBe(false);
    expect(canAccessKbSensitivity(undefined, "internal")).toBe(true);
  });
});
