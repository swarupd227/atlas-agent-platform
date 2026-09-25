import { describe, it, expect } from "vitest";
import { verifiedToolFacts, describeFactCapture } from "../server/agent-runtime";

/**
 * The connectors' own answers, kept verbatim beside a step's narrative.
 *
 * The failure this exists for (live 2026-09-24): the submission system
 * returned a largest single location of $18,500,000 and the step wrote
 * $8,947,000 into state. The aggregate beside it was copied correctly, every
 * later step reasoned on the wrong figure, and the run looked entirely
 * healthy — a confident treaty comparison against a number that was never
 * true. A figure a later step needs should come from here, not from a
 * retyping.
 */
const call = (tool: string, data: unknown, status = "completed") => ({ type: "api_call", mcpTool: tool, status, output: { data } });

describe("verifiedToolFacts", () => {
  it("keeps what each tool returned, unedited", () => {
    const summary = { totalTiv: 386479000, largestSingleLocation: { locationId: "001", tiv: 18500000 } };
    const facts = verifiedToolFacts([
      call("fetch_submission", { submissionId: "SUB-2026-8891", scheduleSummary: summary }),
      call("get_treaty_terms", { singleRiskLimit: 25000000, coastalTier1AggregateLimit: 50000000 }),
    ])!;
    // The exact figure a step later mis-transcribed is recoverable in full.
    expect((facts.fetch_submission as any).scheduleSummary.largestSingleLocation.tiv).toBe(18500000);
    expect((facts.get_treaty_terms as any).coastalTier1AggregateLimit).toBe(50000000);
  });

  it("records nothing when no tool was actually called", () => {
    expect(verifiedToolFacts([])).toBeNull();
    expect(verifiedToolFacts([{ type: "llm_call", status: "completed" }])).toBeNull();
    // A step whose narrative claims a lookup it never dispatched leaves no
    // facts behind, which is the point.
    expect(verifiedToolFacts([call("fetch_submission", { a: 1 }, "failed")])).toBeNull();
  });

  it("keeps the last answer when a tool was called more than once", () => {
    const facts = verifiedToolFacts([
      call("get_policy", { status: "bound_pending_ledger" }),
      call("get_policy", { status: "bound_active" }),
    ])!;
    expect((facts.get_policy as any).status).toBe("bound_active");
  });

  it("drops an oversized result rather than truncating it", () => {
    // Half a payload read as a fact is worse than no fact, and a result this
    // large is a payload the pipeline should not be carrying anyway.
    const huge = { rows: Array.from({ length: 2000 }, (_, i) => ({ i, address: `${i} Gulf Blvd, Panama City Beach FL` })) };
    const facts = verifiedToolFacts([call("get_sov_locations", huge), call("get_treaty_terms", { singleRiskLimit: 25000000 })]);
    expect(facts).not.toBeNull();
    expect(facts!.get_sov_locations).toBeUndefined();
    expect((facts!.get_treaty_terms as any).singleRiskLimit).toBe(25000000);
  });

  it("ignores a result that isn't structured data", () => {
    expect(verifiedToolFacts([call("some_tool", "just a string")])).toBeNull();
    expect(verifiedToolFacts([call("some_tool", null)])).toBeNull();
  });
});

describe("describeFactCapture", () => {
  /**
   * Absence is the failure mode that hides. For three runs no source values
   * appeared and, from outside the server, "the step called nothing", "the
   * results were too big" and "this code isn't running" looked identical.
   * Each now reads differently.
   */
  it("distinguishes the reasons nothing was captured", () => {
    expect(describeFactCapture([])).toMatch(/no connector calls were dispatched/);
    expect(describeFactCapture([{ type: "llm_call", status: "completed" }])).toMatch(/no connector calls were dispatched/);
    expect(describeFactCapture([call("fetch_submission", { a: 1 }, "failed")])).toMatch(/none completed/);
    expect(describeFactCapture([call("some_tool", "a string")])).toMatch(/not structured data/);
    expect(describeFactCapture([call("some_tool", null)])).toMatch(/result was null/);
  });

  it("names the tool and the size when a result was too large to keep", () => {
    const huge = { rows: Array.from({ length: 2000 }, (_, i) => ({ i, note: "a reasonably long line of padding" })) };
    const note = describeFactCapture([call("get_sov_locations", huge)]);
    expect(note).toContain("get_sov_locations");
    expect(note).toMatch(/over the \d+ limit/);
  });

  it("confirms plainly when capture did work", () => {
    expect(describeFactCapture([call("fetch_submission", { scheduleSummary: { totalTiv: 1 } })])).toMatch(/1 completed call\(s\) captured/);
  });
});
