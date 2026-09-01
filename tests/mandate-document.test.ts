import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * server/mandate-document.ts (PRD S1.1.4): read-only regulatory-ceiling
 * lookup and the version-history diff computation. Both pure/testable with
 * mocked storage, mirroring mandate-lint.ts's shape.
 */

let mockPoliciesById: Record<string, any> = {};
let mockRegulationsById: Record<string, any> = {};

vi.mock("../server/storage", () => ({
  storage: {
    getPolicy: vi.fn(async (id: string) => mockPoliciesById[id]),
    getRegulation: vi.fn(async (id: string) => mockRegulationsById[id]),
  },
}));

const { getRegulatoryCeilings, computeMandateHistoryDiff, snapshotMandateForAudit } = await import("../server/mandate-document");

beforeEach(() => {
  mockPoliciesById = {};
  mockRegulationsById = {};
});

function agentWithBindings(bindings: Array<{ policyId?: string }>) {
  return { policyBindings: bindings } as any;
}

describe("getRegulatoryCeilings", () => {
  it("returns nothing when the agent has no policy bindings", async () => {
    const result = await getRegulatoryCeilings(agentWithBindings([]));
    expect(result).toEqual([]);
  });

  it("extracts only regulatory_enforcement rules, skipping other rule types on the same policy", async () => {
    mockPoliciesById["policy-1"] = {
      id: "policy-1",
      policyJson: {
        rules: [
          { type: "regulatory_enforcement", description: "Never release a wire over $10k unattended.", articleRef: "Art. 9", severity: "high", sourceRegulation: "EU AI Act", sourceRegulationId: "reg-1" },
          { type: "rate_limit", description: "Not a regulatory rule" },
        ],
      },
    };
    mockRegulationsById["reg-1"] = { id: "reg-1", fullName: "EU Artificial Intelligence Act", jurisdiction: "EU" };

    const result = await getRegulatoryCeilings(agentWithBindings([{ policyId: "policy-1" }]));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: "Never release a wire over $10k unattended.",
      articleRef: "Art. 9",
      sourceRegulation: "EU AI Act",
      regulationFullName: "EU Artificial Intelligence Act",
      jurisdiction: "EU",
      severity: "high",
    });
  });

  it("checks every rule in a policy with multiple rules, not just the first", async () => {
    mockPoliciesById["policy-1"] = {
      policyJson: {
        rules: [
          { type: "regulatory_enforcement", description: "Rule A", articleRef: "Art. 1", severity: "high", sourceRegulation: "Reg A" },
          { type: "regulatory_enforcement", description: "Rule B", articleRef: "Art. 2", severity: "medium", sourceRegulation: "Reg A" },
        ],
      },
    };
    const result = await getRegulatoryCeilings(agentWithBindings([{ policyId: "policy-1" }]));
    expect(result).toHaveLength(2);
    expect(result.map(r => r.description)).toEqual(["Rule A", "Rule B"]);
  });

  it("skips a binding whose policy no longer exists, without throwing", async () => {
    const result = await getRegulatoryCeilings(agentWithBindings([{ policyId: "gone" }]));
    expect(result).toEqual([]);
  });

  it("skips a binding with no policyId", async () => {
    const result = await getRegulatoryCeilings(agentWithBindings([{}]));
    expect(result).toEqual([]);
  });

  it("handles a policy with no rules array at all", async () => {
    mockPoliciesById["policy-1"] = { policyJson: {} };
    const result = await getRegulatoryCeilings(agentWithBindings([{ policyId: "policy-1" }]));
    expect(result).toEqual([]);
  });
});

describe("computeMandateHistoryDiff", () => {
  const baseSnapshot = { whatItDoes: "Processes wires.", mustNever: "Never exceed $10k.", status: "draft", version: 1 };

  it("returns an empty array for no events", () => {
    expect(computeMandateHistoryDiff([])).toEqual([]);
  });

  it("marks the first entry as created, with no prior to diff against", () => {
    const events = [{ id: "1", action: "mandate_saved", actorId: "u1", createdAt: new Date("2026-01-01"), details: JSON.stringify(baseSnapshot), eventHash: "h1" } as any];
    const entries = computeMandateHistoryDiff(events);
    expect(entries).toHaveLength(1);
    expect(entries[0].diff).toEqual([{ field: "mandate", from: "—", to: "created" }]);
    expect(entries[0].actorId).toBe("u1");
    expect(entries[0].eventHash).toBe("h1");
  });

  it("produces correct field-level diffs between two snapshots, in chronological order regardless of input order", () => {
    const v1 = { id: "1", action: "mandate_saved", actorId: "u1", createdAt: new Date("2026-01-01"), details: JSON.stringify({ ...baseSnapshot, version: 1 }), eventHash: "h1" } as any;
    const v2 = { id: "2", action: "mandate_approved", actorId: "u2", createdAt: new Date("2026-01-02"), details: JSON.stringify({ ...baseSnapshot, status: "active", version: 2, approvedBy: "u2" }), eventHash: "h2" } as any;

    const entries = computeMandateHistoryDiff([v2, v1]); // deliberately out of order
    expect(entries).toHaveLength(2);
    expect(entries[0].version).toBe(1);
    expect(entries[1].version).toBe(2);
    const fields = entries[1].diff.map(d => d.field).sort();
    expect(fields).toEqual(["approvedBy", "status", "version"]);
    expect(entries[1].diff.find(d => d.field === "status")).toEqual({ field: "status", from: "draft", to: "active" });
  });

  it("skips events whose details fail to parse, without throwing", () => {
    const events = [{ id: "1", action: "mandate_saved", actorId: "u1", createdAt: new Date(), details: "not json", eventHash: "h1" } as any];
    expect(computeMandateHistoryDiff(events)).toEqual([]);
  });
});

describe("snapshotMandateForAudit", () => {
  it("only carries content fields, excluding identity/bookkeeping columns", () => {
    const snapshot = snapshotMandateForAudit({
      id: "m1", agentId: "a1", organizationId: "org1", createdAt: "2026-01-01", updatedAt: "2026-01-02",
      whatItDoes: "Does things.", mustNever: "Never that.", status: "draft", version: 1,
    });
    expect(snapshot).not.toHaveProperty("id");
    expect(snapshot).not.toHaveProperty("agentId");
    expect(snapshot).not.toHaveProperty("createdAt");
    expect(snapshot.whatItDoes).toBe("Does things.");
    expect(snapshot.status).toBe("draft");
  });
});
