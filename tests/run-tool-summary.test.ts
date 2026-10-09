import { describe, it, expect } from "vitest";
import { summarizeRunToolCalls } from "../server/run-tool-summary";
import { stripVerifiedLedger, isEmptyFactCapture } from "../client/src/lib/agent-output";

const plan = {
  waves: [{ nodes: ["n1"] }, { nodes: ["n2"] }, { nodes: ["n3"] }, { nodes: ["gate"] }],
  nodeConfig: {
    n1: { stateKey: "inventory", label: "Site Content Inventory" },
    n2: { stateKey: "remediation", label: "Access Remediation" },
    n3: { stateKey: "report", label: "Governance Report" },
    gate: { stateKey: "leadReview", label: "Review Gate" },
  },
};
const ledger = (lines: string[]) => `narrative\n\n---\nPLATFORM-VERIFIED TOOL CALL LOG (ground truth, generated directly from the dispatcher's own records -- NOT the model's narrative above):\n${lines.join("\n")}`;

describe("summarizeRunToolCalls", () => {
  const state = {
    inventory: ledger(['1. get_site_by_name [OK] args={} -> "x"', '2. get_site_drive [OK] args={} -> "y"']),
    remediation: ledger(['1. get_item_permissions [OK] args={} -> "a"', '2. revoke_sharing_permission [OK] args={} -> "HTTP 204"', '3. revoke_sharing_permission [FAILED] args={} -> ERROR: boom']),
    report: "report text\n\n---\nPLATFORM-VERIFIED TOOL CALL LOG (ground truth, not the model's narrative): no tool calls were dispatched by this step and no sandbox code ran in it.",
    leadReview: { approved: true, decidedBy: "admin" },
  };

  it("lists each step's calls, counts failures, and shows the report step made none", () => {
    const out = summarizeRunToolCalls(state, plan);
    expect(out).toContain("5 in total");
    expect(out).toContain("- Site Content Inventory: get_site_by_name x1, get_site_drive x1");
    expect(out).toContain("- Access Remediation: get_item_permissions x1, revoke_sharing_permission x2 (1 failed)");
    expect(out).toContain("- Governance Report: no tool calls");
    expect(out).not.toContain("Review Gate");
  });

  it("returns nothing when no step carries a ledger", () => {
    expect(summarizeRunToolCalls({ inventory: "plain text" }, plan)).toBe("");
    expect(summarizeRunToolCalls(null, plan)).toBe("");
  });
});

/**
 * The same ledger, from the other side: what a person reading a step should
 * see. It is written for the next agent -- it is what stops a step trusting a
 * predecessor's prose, and it caught a step reporting notificationSent: true
 * while dispatching nothing -- but it was also rendered inline on the run page,
 * where the commonest case (a step that legitimately calls no tools) produced
 * the longest and least informative text in the pane.
 */
describe("what a reader sees of the ledger", () => {
  it("folds the ledger away but keeps the step's own words", () => {
    const withCalls = ledger(['1. search_accounts [OK] args={} -> "x"']);
    expect(stripVerifiedLedger(withCalls)).toBe("narrative");
    const none = "report text\n\n---\nPLATFORM-VERIFIED TOOL CALL LOG (ground truth, not the model's narrative): no tool calls were dispatched by this step and no sandbox code ran in it.";
    expect(stripVerifiedLedger(none)).toBe("report text");
  });

  it("leaves output that has no ledger exactly as it is", () => {
    expect(stripVerifiedLedger("just the report")).toBe("just the report");
    // A divider of the step's own is not the ledger's divider.
    expect(stripVerifiedLedger("part one\n\n---\n\npart two")).toBe("part one\n\n---\n\npart two");
  });

  it("hides a fact-capture record that captured nothing, and keeps one that did", () => {
    expect(isEmptyFactCapture("notify_account_status_verified", { captured: false, why: "no connector calls were dispatched by this step (5 step(s) recorded)" })).toBe(true);
    // Real captured source values are the point of the key, so they stay.
    expect(isEmptyFactCapture("search_duplicate_check_verified", { captured: true, values: { accountId: "ACCT-319189" } })).toBe(false);
    // Not a capture key at all.
    expect(isEmptyFactCapture("search_duplicate_check", { captured: false })).toBe(false);
  });
});
