import { describe, it, expect } from "vitest";
import { summarizeRunToolCalls } from "../server/run-tool-summary";

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
