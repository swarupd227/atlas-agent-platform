/**
 * assessOutcomeIntelligence (server/outcome-intelligence.ts), moved unchanged
 * from GET /api/outcomes/intelligence.
 */
import { describe, it, expect } from "vitest";
import { assessOutcomeIntelligence, type OutcomeIntelligenceQuery } from "../server/outcome-intelligence";

const agent = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, description: "", department: "", status: "active", healthScore: 90, totalRuns: 12, autonomyMode: "assisted", riskTier: "MEDIUM", ...extra }) as any;

const snapshot = {
  agents: [agent("a1", "Collections Follow-up Agent"), agent("a2", "Warranty Claims Agent"), agent("a3", "Old Collections Bot", { status: "archived" })],
  templates: [
    { id: "t1", name: "Collections", industry: "financial_services", toolsConfig: [{ name: "send_email" }] },
    { id: "t2", name: "Generic triage", industry: "cross_industry", toolsConfig: [] },
    { id: "t3", name: "Claims", industry: "insurance", toolsConfig: [] },
  ] as any[],
  servers: [{ id: "s1", name: "Dealer Operations" }] as any[],
  tools: [
    { id: "x1", serverId: "s1", name: "get_open_ar", riskClassification: "low" },
    { id: "x2", serverId: "s1", name: "post_cash_receipt", riskClassification: "high" },
  ] as any[],
  policies: [
    { id: "p1", name: "[SOX] Financial controls", domain: "finance", status: "active", scopeType: "org", policyJson: { enforcement: "block" } },
    { id: "p2", name: "Draft policy", domain: "finance", status: "draft", scopeType: "org", policyJson: {} },
  ] as any[],
};

const query = (q: Partial<OutcomeIntelligenceQuery> = {}): OutcomeIntelligenceQuery => ({
  industry: "financial_services", toolNames: [], roleNames: [], autonomyModes: [], riskTiers: [], proposedApprovalGatesCount: null, ...q,
});

describe("assessOutcomeIntelligence", () => {
  it("matches live agents to proposed roles by keyword, ignoring archived ones", () => {
    const r = assessOutcomeIntelligence(snapshot, query({ roleNames: ["collections follow-up"] }));
    expect(r.matchedAgents[0].matches.map((m) => m.id)).toEqual(["a1"]);
  });

  it("offers the industry's templates plus cross-industry ones", () => {
    expect(assessOutcomeIntelligence(snapshot, query()).matchedTemplates.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("classifies proposed tools as existing, partial (by connector name) or missing", () => {
    const r = assessOutcomeIntelligence(snapshot, query({ toolNames: ["post_cash_receipt", "Dealer operations integration", "SAP posting"] }));
    expect(r.toolCoverage.map((t) => [t.proposedName, t.status])).toEqual([
      ["post_cash_receipt", "exists"],
      ["Dealer operations integration", "partial"],
      ["SAP posting", "missing"],
    ]);
    expect(r.summary.toolCoveragePercent).toBe(67);
  });

  it("raises composite risk for high-risk tools and applies only active policies", () => {
    const r = assessOutcomeIntelligence(snapshot, query({ toolNames: ["post_cash_receipt"], proposedApprovalGatesCount: 0 }));
    expect(r.matchedPolicies.map((p) => p.id)).toEqual(["p1"]);
    expect(r.matchedPolicies[0].policyPack).toBe("SOX Compliance Pack");
    expect(r.compositeRisk.level).toBe("HIGH");
    expect(r.summary.hasApprovalGapRisk).toBe(true);
  });

  it("falls back to industry agents when no roles are given", () => {
    const r = assessOutcomeIntelligence({ ...snapshot, agents: [agent("f1", "Financial Services Reconciler")] }, query());
    expect(r.matchedAgents[0]).toMatchObject({ role: "Industry Agents" });
  });
});
