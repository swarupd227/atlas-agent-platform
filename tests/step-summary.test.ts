import { describe, it, expect } from "vitest";
import { stepSummary } from "../server/astra/services";

/**
 * The one-line account of what a step concluded, shown beside the conversation.
 *
 * Agents write a plain-English lead and then append machine parts: a JSON block
 * for routing, a STRUCTURED RECORDS section, and the platform's verified
 * tool-call log. The summary is that lead — taken, never generated, so it
 * cannot say anything the step did not.
 */
describe("stepSummary", () => {
  it("takes the business sentence and drops the machine parts", () => {
    // Verbatim shape from a live E&S underwriting run (2026-09-24).
    const output = {
      answer: [
        "Submission SUB-2026-8891 breaches treaty coastal Tier 1 aggregate limit by $22.4M (44.8% over $50M limit per clause 4.3), while single-risk limit compliance is confirmed.",
        "",
        "```json",
        '{ "breached": true, "clauseCitation": "4.3" }',
        "```",
        "",
        "---",
        "PLATFORM-VERIFIED TOOL CALL LOG (ground truth, not the model's narrative): get_treaty_terms, fetch_submission.",
      ].join("\n"),
    };
    expect(stepSummary(output)).toBe(
      "Submission SUB-2026-8891 breaches treaty coastal Tier 1 aggregate limit by $22.4M (44.8% over $50M limit per clause 4.3), while single-risk limit compliance is confirmed.",
    );
  });

  it("drops a STRUCTURED RECORDS section too", () => {
    const output = { answer: "Endorsement ME-2026-8891 approved with all four clauses verified.\n\n## STRUCTURED RECORDS FROM Contract Certainty Review\n| id | status |\n| -- | -- |" };
    expect(stepSummary(output)).toBe("Endorsement ME-2026-8891 approved with all four clauses verified.");
  });

  it("reads out a decision rather than showing nothing", () => {
    // This used to assert null, on the reasoning that a fragment of JSON dressed
    // up as a sentence is worse than an empty line. That was wrong in practice:
    // it left every step that runs without a model silent in Astra Cowork, and
    // those are the steps whose figures a person is being asked to act on.
    expect(stepSummary({ answer: '{"approved": true}' })).toBe("Approved: yes");
    // Fenced or bare is the same answer; how a step quoted it must not decide
    // whether it gets to speak.
    expect(stepSummary({ answer: "```json\n{\"accepted\": false}\n```" })).toBe("Accepted: no");
    // Nothing to read is still nothing to say.
    expect(stepSummary({})).toBeNull();
    expect(stepSummary(null)).toBeNull();
    expect(stepSummary({ answer: "   " })).toBeNull();
  });

  it("leaves a generated page to be opened rather than summarized", () => {
    expect(stepSummary({ page: "<!DOCTYPE html><html><body><h1>Quote</h1></body></html>" })).toBeNull();
  });

  it("caps a long sentence instead of flooding the panel", () => {
    const long = `The submission was assessed across ${"many considerations ".repeat(40)} and cleared.`;
    const summary = stepSummary({ answer: long })!;
    expect(summary.length).toBeLessThanOrEqual(220);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("falls back to the whole text when the lead has no full stop", () => {
    expect(stepSummary({ answer: "Risk quality scored at 62 out of 100" })).toBe("Risk quality scored at 62 out of 100");
  });
});

/**
 * A step whose answer is structured still has to say what it did.
 *
 * Only prose was ever summarised, so every step that runs WITHOUT a model -- a
 * calculation, a connector call -- said nothing while it worked. Live
 * 2026-09-26: four of thirty-one steps narrated themselves in Astra Cowork, and
 * the silent ones were the deterministic ones, whose figures are exactly what a
 * person is being asked to act on.
 */
describe("a step that answers in structured data", () => {
  it("reads out the step's own account of itself", () => {
    // Every expression this platform builds carries a `basis`.
    const treaty = {
      evaluate_treaty_limits: {
        breached: true, coastalTier1AggregateTiv: 72400000, coastalTier1AggregateLimit: 50000000,
        basis: "Compared the broker system's own schedule summary against the treaty in force. Arithmetic, not judgement: no model runs in this step.",
      },
    };
    expect(stepSummary(treaty)).toBe(
      "Compared the broker system's own schedule summary against the treaty in force. Arithmetic, not judgement: no model runs in this step.",
    );
  });

  it("composes one from the fields when there is no account to read", () => {
    // A connector's own reply. Decisions before numbers: the boolean is what a
    // reader wants first.
    const s = stepSummary({ check: { coastalTier1AggregateTiv: 72400000, breached: true, treatyId: "CP-2026-17" } })!;
    expect(s.startsWith("Breached: yes")).toBe(true);
    expect(s).toContain("72,400,000");
    expect(s).toContain("CP-2026-17");
  });

  it("reads a structured answer that arrived as a JSON string", () => {
    const s = stepSummary({ gate: '{"passed": false, "ratingId": "RTG-8FD741DC"}' })!;
    expect(s).toContain("Passed: no");
    expect(s).toContain("RTG-8FD741DC");
  });

  it("still prefers real prose over a composed line", () => {
    const s = stepSummary({ narrative: "The endorsement was redrafted and sent back for review.", data: { ok: true } });
    expect(s).toBe("The endorsement was redrafted and sent back for review.");
  });

  it("leaves out bookkeeping nobody reads", () => {
    const s = stepSummary({ r: { id: "abc", runId: "x", createdAt: "2026-09-26", approved: true } })!;
    expect(s).toBe("Approved: yes");
  });

  it("says nothing when there is genuinely nothing to say", () => {
    expect(stepSummary({})).toBeNull();
    expect(stepSummary({ a: {} })).toBeNull();
    expect(stepSummary(null)).toBeNull();
  });

  it("keeps a composed line short enough to read at a glance", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) wide[`field${i}`] = i * 1000;
    const s = stepSummary({ w: wide })!;
    expect(s.length).toBeLessThanOrEqual(220);
    expect(s.split(" · ").length).toBeLessThanOrEqual(4);
  });
});
