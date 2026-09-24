import { describe, it, expect } from "vitest";
import { REWORK_REQUESTED_RULE } from "../server/team-build";
import { evaluateRule } from "../server/rule-evaluator";

/**
 * The rule that decides whether a reviewing step has sent work back.
 *
 * decideRevision (server/dag-execution-engine.ts) evaluates it against the
 * reviewer's structured output merged with { output: <raw text> }, so these
 * facts are shaped the same way.
 */
const facts = (structured: Record<string, unknown>, output = "review complete") => ({ ...structured, output });

describe("REWORK_REQUESTED_RULE", () => {
  it("fires on the shapes a reviewer actually uses to ask for a redraft", () => {
    // The live one: a contract-certainty review that rejected an endorsement
    // and asked for round 1 of 2. The old rule matched only the text "fail",
    // so this never triggered the loop and the rest of the journey skipped.
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ accepted: false, escalate: false, redraft: true })).result).toBe(true);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ accepted: false })).result).toBe(true);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ approved: false })).result).toBe(true);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ rejected: true })).result).toBe(true);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ requiresRevision: true })).result).toBe(true);
    // Still matches the original text signal.
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({}, "clause check failed on two clauses")).result).toBe(true);
  });

  it("does not fire when the reviewer is content", () => {
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ accepted: true, redraft: false })).result).toBe(false);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({ approved: true })).result).toBe(false);
    // An approval gate emits {approved: true} and nothing else: the absent
    // fields must not read as a request for rework.
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({})).result).toBe(false);
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({}, "endorsement accepted, no findings")).result).toBe(false);
  });

  it("treats an absent field as absent, not as false", () => {
    // The hazard in an OR of equality checks: if a missing "accepted" read as
    // false, every step with a revision policy would loop on its first pass.
    const r = evaluateRule(REWORK_REQUESTED_RULE, { output: "done" });
    expect(r.result).toBe(false);
  });
});
