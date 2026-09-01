import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * server/mandate-lint.ts (PRD S1.1.3): deterministic checks that block
 * warrant issuance for a vague or unapproved mandate. report.ok must be
 * true only when EVERY check passes -- severity ("error" vs "warning") is
 * for display, not a signal that some checks are optional to enforce.
 */

let mockConcepts: Array<{ label: string; synonyms: string[] | null }> = [];
let mockMandatesByAgent: Record<string, any> = {};

vi.mock("../server/storage", () => ({
  storage: {
    getAllOntologyConcepts: vi.fn(async () => mockConcepts),
    getAgentMandatesForAgents: vi.fn(async (agentIds: string[]) =>
      agentIds.map(id => mockMandatesByAgent[id]).filter(Boolean)
    ),
  },
}));

const { lintMandate, lintMandatesForAgents, invalidateMandateLintOntologyCache } = await import("../server/mandate-lint");

const approvedFullMandate = {
  status: "active",
  whatItDoes: "Processes wire transfer requests against the account ledger.",
  mustNever: "Never release a wire transfer over $10,000 without approval.",
  whenToStop: "Stop if the account is flagged for fraud review.",
  fallbackBehavior: null,
} as any;

beforeEach(() => {
  mockConcepts = [{ label: "wire transfer", synonyms: ["wire", "funds transfer"] }];
  mockMandatesByAgent = {};
  invalidateMandateLintOntologyCache();
});

describe("lintMandate: mandate_approved", () => {
  it("fails when the mandate is draft", async () => {
    const report = await lintMandate({ ...approvedFullMandate, status: "draft" });
    const check = report.checks.find(c => c.id === "mandate_approved")!;
    expect(check.ok).toBe(false);
    expect(check.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("passes when the mandate is active", async () => {
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.find(c => c.id === "mandate_approved")!.ok).toBe(true);
  });
});

describe("lintMandate: must_never_present", () => {
  it("fails on empty mustNever", async () => {
    const report = await lintMandate({ ...approvedFullMandate, mustNever: "" });
    expect(report.checks.find(c => c.id === "must_never_present")!.ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("fails on whitespace-only mustNever", async () => {
    const report = await lintMandate({ ...approvedFullMandate, mustNever: "   " });
    expect(report.checks.find(c => c.id === "must_never_present")!.ok).toBe(false);
  });

  it("passes when mustNever has real content", async () => {
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.find(c => c.id === "must_never_present")!.ok).toBe(true);
  });
});

describe("lintMandate: scope_names_ontology_entity", () => {
  it("fails when no real concept label or synonym appears in whatItDoes/mustNever", async () => {
    mockConcepts = [{ label: "insurance claim", synonyms: ["claim"] }];
    const report = await lintMandate(approvedFullMandate); // talks about wire transfers, not claims
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.ok).toBe(false);
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.severity).toBe("warning");
  });

  it("passes on an exact label match", async () => {
    const report = await lintMandate(approvedFullMandate); // mockConcepts has "wire transfer"
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.ok).toBe(true);
  });

  it("passes on a synonym match", async () => {
    mockConcepts = [{ label: "electronic funds movement", synonyms: ["wire transfer"] }];
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.ok).toBe(true);
  });

  it("is case-insensitive", async () => {
    mockConcepts = [{ label: "WIRE TRANSFER", synonyms: [] }];
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.ok).toBe(true);
  });
});

describe("lintMandate: termination_or_compensation_stated", () => {
  it("fails when both whenToStop and fallbackBehavior are empty", async () => {
    const report = await lintMandate({ ...approvedFullMandate, whenToStop: null, fallbackBehavior: null });
    expect(report.checks.find(c => c.id === "termination_or_compensation_stated")!.ok).toBe(false);
  });

  it("passes when only whenToStop is set", async () => {
    const report = await lintMandate({ ...approvedFullMandate, whenToStop: "Stop on fraud flag.", fallbackBehavior: null });
    expect(report.checks.find(c => c.id === "termination_or_compensation_stated")!.ok).toBe(true);
  });

  it("passes when only fallbackBehavior is set", async () => {
    const report = await lintMandate({ ...approvedFullMandate, whenToStop: null, fallbackBehavior: "Hand off to a human reviewer." });
    expect(report.checks.find(c => c.id === "termination_or_compensation_stated")!.ok).toBe(true);
  });
});

describe("lintMandate: overall report", () => {
  it("is ok only when every check passes, including warning-severity ones", async () => {
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.every(c => c.ok)).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("is not ok if only a warning-severity check fails, even when both error checks pass", async () => {
    mockConcepts = [{ label: "insurance claim", synonyms: [] }]; // scope check will fail
    const report = await lintMandate(approvedFullMandate);
    expect(report.checks.find(c => c.id === "mandate_approved")!.ok).toBe(true);
    expect(report.checks.find(c => c.id === "must_never_present")!.ok).toBe(true);
    expect(report.checks.find(c => c.id === "scope_names_ontology_entity")!.ok).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("fails the structural checks for a completely missing mandate, with no crash", async () => {
    const report = await lintMandate(undefined);
    expect(report.ok).toBe(false);
    expect(report.checks.find(c => c.id === "mandate_approved")!.ok).toBe(false);
    expect(report.checks.find(c => c.id === "must_never_present")!.ok).toBe(false);
  });
});

describe("lintMandatesForAgents", () => {
  it("returns an empty object for an empty agent list without querying storage", async () => {
    const result = await lintMandatesForAgents([]);
    expect(result).toEqual({});
  });

  it("returns a correct per-agent summary in one batched pass", async () => {
    mockMandatesByAgent = {
      "agent-good": { agentId: "agent-good", ...approvedFullMandate },
      "agent-bad": { agentId: "agent-bad", status: "draft", whatItDoes: "", mustNever: "", whenToStop: null, fallbackBehavior: null },
      // "agent-none" has no mandate at all -- absent from mockMandatesByAgent.
    };
    const result = await lintMandatesForAgents(["agent-good", "agent-bad", "agent-none"]);
    expect(result["agent-good"]).toEqual({ agentId: "agent-good", ok: true, hasMandate: true });
    expect(result["agent-bad"]).toEqual({ agentId: "agent-bad", ok: false, hasMandate: true });
    expect(result["agent-none"]).toEqual({ agentId: "agent-none", ok: false, hasMandate: false });
  });
});
