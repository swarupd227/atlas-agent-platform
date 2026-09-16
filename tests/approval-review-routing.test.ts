import { describe, it, expect, afterEach } from "vitest";
import { canDecideApproval, hasPermission, getRequestActorLabel } from "../server/permissions";
import type { Request } from "express";

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

/**
 * getRequestActorLabel (server/permissions.ts) is what PATCH /api/approvals/:id now uses to record WHO decided an
 * approval, instead of trusting a client-supplied "decidedBy" string (any caller could set that to anything --
 * every mutation on both approval pages used to hardcode it to "Expert Validator" regardless of who was really
 * acting). It must never fall back to the client's own claim.
 */
describe("getRequestActorLabel", () => {
  const originalMode = process.env.SECURITY_MODE;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.SECURITY_MODE;
    else process.env.SECURITY_MODE = originalMode;
  });

  function req(headers: Record<string, string> = {}, authUser?: Request["authUser"]): Request {
    return { headers, authUser } as unknown as Request;
  }

  it("in demo mode, labels the actor by the active demo role, not any authUser or client claim", () => {
    process.env.SECURITY_MODE = "demo";
    expect(getRequestActorLabel(req({ "x-role": "expert_validator" }))).toBe("Expert Validator");
    expect(getRequestActorLabel(req({ "x-role": "compliance_security" }))).toBe("Compliance & Security");
    // No X-Role header at all: getRequestRole's own demo-mode default (admin), not a made-up name.
    expect(getRequestActorLabel(req({}))).toBe("Admin");
  });

  it("in demo mode, ignores a real authUser if one is somehow present -- there is no real per-person identity in demo mode", () => {
    process.env.SECURITY_MODE = "demo";
    const withUser = req({ "x-role": "finance" }, { userId: "u1", username: "real.person", role: "admin", email: null, organizationId: "org1" });
    expect(getRequestActorLabel(withUser)).toBe("Finance");
  });

  it("in production mode, uses the real signed-in user's username", () => {
    process.env.SECURITY_MODE = "production";
    const authUser = { userId: "u1", username: "priya.n", role: "expert_validator", email: "priya@example.com", organizationId: "org1" };
    expect(getRequestActorLabel(req({}, authUser))).toBe("priya.n");
  });

  it("in production mode, falls back to the user id when a session somehow has no username", () => {
    process.env.SECURITY_MODE = "production";
    const authUser = { userId: "u1", username: "", role: "expert_validator", email: null, organizationId: "org1" };
    expect(getRequestActorLabel(req({}, authUser as any))).toBe("u1");
  });
});
