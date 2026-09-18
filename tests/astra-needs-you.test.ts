/**
 * server/astra/needs-you.ts: whether an item is decided in the conversation,
 * or on which page and why.
 */
import { describe, it, expect } from "vitest";
import { decisionRoute } from "../server/astra/needs-you";

const approval = (over: Partial<{ status: string; objectType: string; requiredReviewerRole: string | null }> = {}) => ({
  status: "pending",
  objectType: "outcome_contract",
  requiredReviewerRole: null,
  ...over,
});

describe("decisionRoute", () => {
  it("decides a pending approval of a kind Astra can finish, for a role allowed to", () => {
    expect(decisionRoute({ source: "approval", category: "approval", sourceId: "a1", approval: approval(), allowed: { allowed: true, reason: "" } }))
      .toEqual({ canDecideHere: true, requiredReviewerRole: null, elsewhere: null });
  });

  it("sends a routed approval to its page and names the role it is routed to", () => {
    const r = decisionRoute({
      source: "approval", category: "approval", sourceId: "a 2",
      approval: approval({ requiredReviewerRole: "compliance_security" }),
      allowed: { allowed: false, reason: "routed" },
    });
    expect(r).toEqual({
      canDecideHere: false,
      requiredReviewerRole: "compliance_security",
      elsewhere: { href: "/approvals/a%202", page: "Approvals", reason: "Routed to the compliance security role." },
    });
  });

  it("decides every kind of pending approval here, since the decision has the same effects as on the Approvals page", () => {
    for (const objectType of ["deployment", "patch", "mcp-tool", "agent", "ui_baseline_diff"]) {
      expect(decisionRoute({ source: "approval", category: "approval", sourceId: "a3", approval: approval({ objectType }), allowed: { allowed: true, reason: "" } }).canDecideHere).toBe(true);
    }
  });

  it("says a role without the permission can't decide", () => {
    const r = decisionRoute({ source: "approval", category: "approval", sourceId: "a4", approval: approval(), allowed: { allowed: false, reason: "Permission denied" } });
    expect(r.elsewhere!.reason).toBe("Your role can't decide approvals.");
  });

  it("sends alerts and recommendations to My Actions", () => {
    expect(decisionRoute({ source: "alert", category: "alert", sourceId: "x", approval: null, allowed: null }).elsewhere)
      .toEqual({ href: "/my-actions", page: "My Actions", reason: "Alerts are handled in My Actions." });
    expect(decisionRoute({ source: "recommendation", category: "recommendation", sourceId: "y", allowed: null }).elsewhere!.reason)
      .toBe("Recommendations are handled in My Actions.");
  });
});
