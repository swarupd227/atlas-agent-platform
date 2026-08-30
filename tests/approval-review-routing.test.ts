import { describe, it, expect } from "vitest";
import { canDecideApproval, hasPermission } from "../server/permissions";

/**
 * canDecideApproval (server/permissions.ts) is what PATCH /api/approvals/:id
 * (server/routes/governance.ts) uses to decide who may approve/reject one
 * approval. The behavior split it must get right:
 *
 *  - No requiredReviewerRole (every approval before this feature, and every
 *    type that hasn't opted in): identical to the general approve_changes
 *    permission check this route always used -- a pure regression guard.
 *  - A requiredReviewerRole set: ONLY that role or admin, even for a role
 *    that would otherwise sail through on blanket approve_changes, and even
 *    FOR a role that's normally denied approve_changes outright.
 */

describe("canDecideApproval: no requiredReviewerRole (legacy/unrouted approvals)", () => {
  it("matches hasPermission(role, 'approve_changes') for every role", () => {
    const roles = ["admin", "outcome_owner", "agent_engineer", "ops_sre", "compliance_security", "expert_validator", "finance", "domain_expert"] as const;
    for (const role of roles) {
      const decision = canDecideApproval(role, null);
      expect(decision.allowed).toBe(hasPermission(role, "approve_changes"));
    }
  });

  it("denies a role with no approve_changes access, same message shape as before", () => {
    const decision = canDecideApproval("ops_sre", undefined);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Permission denied");
  });

  it("allows a role with full approve_changes access", () => {
    expect(canDecideApproval("expert_validator", null).allowed).toBe(true);
  });
});

describe("canDecideApproval: routed approvals (requiredReviewerRole set)", () => {
  it("allows the exact matching role", () => {
    expect(canDecideApproval("ops_sre", "ops_sre").allowed).toBe(true);
  });

  it("allows admin regardless of the required role", () => {
    expect(canDecideApproval("admin", "ops_sre").allowed).toBe(true);
  });

  it("unlocks a role that is normally denied approve_changes entirely, when it's the routed role", () => {
    // ops_sre has approve_changes: "denied" in PERMISSION_MATRIX -- routing
    // must still let it through for an approval explicitly sent to it.
    expect(hasPermission("ops_sre", "approve_changes")).toBe(false);
    expect(canDecideApproval("ops_sre", "ops_sre").allowed).toBe(true);
  });

  it("refuses a role with full blanket approve_changes access when it isn't the routed role", () => {
    // expert_validator has approve_changes: "full" -- routing is stricter
    // than the blanket permission, not just additive to it.
    expect(hasPermission("expert_validator", "approve_changes")).toBe(true);
    const decision = canDecideApproval("expert_validator", "ops_sre");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("ops_sre");
  });

  it("refuses an unrelated role entirely", () => {
    expect(canDecideApproval("finance", "compliance_security").allowed).toBe(false);
  });
});
