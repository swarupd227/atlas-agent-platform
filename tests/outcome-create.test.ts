/**
 * prepareOutcomeFromProposal (server/outcome-create.ts): how a proposal becomes
 * an outcome and its KPIs before anything is written.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/routes/helpers", () => ({ computeConstraintGraph: vi.fn(), resolveOntologyTags: vi.fn() }));

import { OutcomeInputError, prepareOutcomeFromProposal } from "../server/outcome-create";

const outcome = { name: "Reduce DSO", description: "Collect receivables faster", riskTier: "HIGH" };

describe("prepareOutcomeFromProposal", () => {
  it("always starts the outcome pending review, whatever status the proposal carried", () => {
    const p = prepareOutcomeFromProposal({ outcome: { ...outcome, status: "active" } }, { baselineWhenMissing: 0 });
    expect(p.parsedOutcome.status).toBe("pending_review");
  });

  it("needs an outcome", () => {
    expect(() => prepareOutcomeFromProposal({}, { baselineWhenMissing: 0 })).toThrow(OutcomeInputError);
  });

  it("stores the baseline the caller asks for when a KPI has none", () => {
    const kpis = [{ name: "DSO", target: "45", unit: "days" }];
    expect(prepareOutcomeFromProposal({ outcome, kpis }, { baselineWhenMissing: 0 }).parsedKpis[0].baseline).toBe(0);
    expect(prepareOutcomeFromProposal({ outcome, kpis }, { baselineWhenMissing: null }).parsedKpis[0].baseline).toBeNull();
  });

  it("converts numbers given as text and keeps a given baseline, SLA threshold and weight", () => {
    const [kpi] = prepareOutcomeFromProposal(
      { outcome, kpis: [{ name: "DSO", target: "45", baseline: "62", slaThreshold: "50", weight: "2", unit: "days" }] },
      { baselineWhenMissing: null },
    ).parsedKpis;
    expect(kpi).toMatchObject({ target: 45, baseline: 62, slaThreshold: 50, weight: 2 });
  });

  it("falls back to currentBaseline when the proposal names it that way", () => {
    const [kpi] = prepareOutcomeFromProposal({ outcome, kpis: [{ name: "DSO", target: 45, currentBaseline: 60 }] }, { baselineWhenMissing: null }).parsedKpis;
    expect(kpi.baseline).toBe(60);
  });

  it("doesn't let a proposal claim where a KPI's current value came from", () => {
    const [kpi] = prepareOutcomeFromProposal(
      { outcome, kpis: [{ name: "DSO", target: 45, currentValue: 50, valueSource: "agent_runs" }] },
      { baselineWhenMissing: null },
    ).parsedKpis;
    expect(kpi).not.toHaveProperty("valueSource");
  });

  it("maps risk tier to the review's risk score and merges constraints into the SLA config", () => {
    const p = prepareOutcomeFromProposal({ outcome: { ...outcome, riskTier: "MEDIUM", slaConfig: { responseHours: 4 } }, constraints: ["No payment plans over 90 days"] }, { baselineWhenMissing: 0 });
    expect(p.riskScore).toBe(5);
    expect(p.parsedOutcome.slaConfig).toEqual({ constraints: ["No payment plans over 90 days"], responseHours: 4 });
  });

  it("lifts discovery policy matches out of the outcome and keeps only string agent ids", () => {
    const p = prepareOutcomeFromProposal(
      { outcome: { ...outcome, matchedPolicyIds: ["pol-1"], discoveryPolicies: [{ id: "pol-1" }] }, acceptedAgentIds: ["ag-1", 7, null] },
      { baselineWhenMissing: 0 },
    );
    expect(p.matchedPolicyIds).toEqual(["pol-1"]);
    expect(p.parsedOutcome).not.toHaveProperty("matchedPolicyIds");
    expect(p.agentIds).toEqual(["ag-1"]);
  });
});
