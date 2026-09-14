/**
 * discover_outcome and list_outcomes (server/astra/tools), with fake services.
 */
import { describe, it, expect } from "vitest";
import { discoverOutcomeTool } from "../server/astra/tools/discover-outcome";
import { listOutcomesTool } from "../server/astra/tools/list-outcomes";
import { similarOutcomeNames } from "../server/astra/outcome-names";
import type { AstraToolContext } from "../server/astra/types";

const ctx = (services: Record<string, any>, extra: Partial<AstraToolContext> = {}): AstraToolContext =>
  ({ orgId: "org-a", userId: "u1", role: "admin", threadId: "t1", services, ...extra }) as AstraToolContext;

const grounding = (pack: boolean) => ({
  possibleDuplicates: [{ id: "o1", name: "Reduce DSO across branches", status: "active" }],
  industry: pack
    ? { selected: true, pack: true, id: "equipment_dealer", label: "Equipment Dealers & Distribution", regulatoryFrameworks: ["ASC 606", "SOX"], kpiDimensions: [{ label: "Days sales outstanding", description: "" }], regulatoryChecks: ["SOX 404: Controls"], policyPacks: [] }
    : { selected: false, pack: false, id: null },
  similarAgents: [{ role: "collections", matches: [{ id: "a1", name: "AR Notifications", status: "active", totalRuns: 4 }] }],
  templates: [{ id: "t1", name: "Collections", category: "finance" }],
  toolCoverage: [{ proposed: "dealer management system", status: "partial", matched: "Dealer Operations", risk: "low" }],
  policies: [{ id: "p1", name: "AR write-off approval", domain: "finance", enforcement: "auto" }],
  compositeRisk: { level: "MEDIUM", rationale: ["no high-risk tools detected"] },
  checked: { outcomes: 7, agents: 42, connectors: 9, policies: 30 },
});

describe("discover_outcome", () => {
  it("returns grounding with duplicates, pack context and proof, and a draft card", async () => {
    const out = await discoverOutcomeTool.run(
      ctx({ outcomeGrounding: async () => grounding(true) }, { industryId: "equipment_dealer" }),
      { name: "Reduce DSO", description: "Collect receivables faster across branches", roles: ["collections"] },
    );
    const payload = out.payload as any;
    expect(payload.possibleDuplicates).toHaveLength(1);
    expect(payload.industry).toMatchObject({ label: "Equipment Dealers & Distribution", regulatoryFrameworks: ["ASC 606", "SOX"] });
    expect(payload.policiesThatWouldApply).toEqual(["AR write-off approval"]);
    expect(out.artifact).toMatchObject({ kind: "outcomeDraft", title: "Reduce DSO" });
    expect(out.proof!.context).toMatchObject({ summary: "Checked 7 outcomes, 42 agents, 9 connectors and 30 policies" });
    expect(out.proof!.industry).toMatchObject({ status: "measured" });
  });

  it("never passes on catalog figures or health scores, and says when there's no industry pack", async () => {
    const out = await discoverOutcomeTool.run(ctx({ outcomeGrounding: async () => grounding(false) }), { name: "Reduce DSO", description: "Collect receivables faster" });
    const text = JSON.stringify(out.payload);
    expect(text).not.toMatch(/healthScore|deploymentCount|avgKpiDelivery|estimatedTimeToProd/);
    expect((out.payload as any).industry).toEqual({ note: "No industry selected." });
    expect(out.proof!.industry).toMatchObject({ status: "not_measured" });
  });
});

describe("list_outcomes", () => {
  const rows = [
    {
      id: "o1", name: "Reduce DSO", status: "pending_review", riskTier: "HIGH", pendingReviewApprovalId: "apr-1", agentCount: 0,
      kpis: [
        { name: "DSO", unit: "days", target: 45, targetOperator: "<=", baseline: null, current: null },
        { name: "Runs completed", unit: "count", target: 100, targetOperator: ">=", baseline: 0, current: { value: 12, source: "agent_runs", updatedAt: null } },
      ],
    },
    { id: "o2", name: "Warranty cycle time", status: "active", riskTier: "MEDIUM", pendingReviewApprovalId: null, agentCount: 3, kpis: [] },
  ];

  it("reports current values only with their source, and baselines nobody gave as not given", async () => {
    const out = await listOutcomesTool.run(ctx({ listOutcomes: async () => rows }), { search: "dso" });
    const [o] = (out.payload as any).outcomes;
    expect(o).toMatchObject({ pendingReviewApprovalId: "apr-1" });
    expect(o.kpis[0]).toMatchObject({ target: "<= 45 days", baseline: "not given", current: "not measured" });
    expect(o.kpis[1].current).toEqual({ value: 12, source: "derived from agent runs (a proxy, not a business measurement)" });
    expect(out.artifact).toMatchObject({ kind: "outcome", fullViewHref: "/outcomes/o1" });
    expect(out.proof!.context).toMatchObject({ status: "measured", summary: expect.stringContaining("1 of 2 KPI values") });
  });

  it("filters by status and shows a list card", async () => {
    const out = await listOutcomesTool.run(ctx({ listOutcomes: async () => rows }), { status: "active" });
    expect((out.payload as any).total).toBe(1);
    expect(out.artifact).toMatchObject({ kind: "outcome" });
    const all = await listOutcomesTool.run(ctx({ listOutcomes: async () => rows }), {});
    expect(all.artifact).toMatchObject({ kind: "outcomeList", fullViewHref: "/outcomes" });
  });
});

describe("similarOutcomeNames", () => {
  const outcomes = [
    { id: "1", name: "Reduce DSO across branches", status: "active" },
    { id: "2", name: "Warranty claim cycle time", status: "active" },
    { id: "3", name: "reduce dso", status: "draft" },
  ];
  it("finds exact and mostly-overlapping names, not unrelated ones", () => {
    expect(similarOutcomeNames("Reduce DSO", outcomes).map((o) => o.id)).toEqual(["3"]);
    expect(similarOutcomeNames("Reduce branches DSO", outcomes).map((o) => o.id)).toContain("1");
    expect(similarOutcomeNames("Improve rental utilization", outcomes)).toEqual([]);
  });
});
