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

  it("says nothing when a step produced no prose", () => {
    // A gate emits only its decision: there is no sentence to show, and a
    // fragment of JSON dressed up as one would be worse than an empty line.
    expect(stepSummary({ answer: '{"approved": true}' })).toBeNull();
    expect(stepSummary({ answer: "```json\n{\"accepted\": false}\n```" })).toBeNull();
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
