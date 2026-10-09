import { describe, it, expect } from "vitest";
import { REWORK_REQUESTED_RULE } from "../server/team-build";
import { isCurrentReworkRule, verdictFrom } from "../shared/rework-rule";
import { evaluateRule } from "../server/rule-evaluator";

/**
 * The rule that decides whether a reviewing step has sent work back.
 *
 * decideRevision (server/dag-execution-engine.ts) evaluates it against the
 * reviewer's structured output merged with { output: <raw text> }, so these
 * facts are shaped the same way.
 */
const facts = (structured: Record<string, unknown>, output = "review complete") => {
  const verdict = verdictFrom(output);
  return { ...structured, output, ...(verdict ? { verdict } : {}) };
};

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
    // A pronounced failure verdict in raw text is normalized before rule evaluation.
    expect(evaluateRule(REWORK_REQUESTED_RULE, facts({}, "FAIL - clause check found two defects")).result).toBe(true);
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

/**
 * Telling a stored matcher apart from the current one, which the flow sync asks
 * before deciding a loop needs no change. A rule with the right target and the
 * right number of rounds can still be the old text-only matcher, and then the
 * loop reads as configured, passes an invariant check and never fires.
 */
describe("recognising the current matcher", () => {
  const TEXT_ONLY = { combinator: "OR", conditions: [{ field: "output", operator: "contains", value: "fail" }] };

  it("accepts the current rule, whatever order its conditions are stored in", () => {
    expect(isCurrentReworkRule(REWORK_REQUESTED_RULE)).toBe(true);
    expect(isCurrentReworkRule({ combinator: "OR", conditions: [...REWORK_REQUESTED_RULE.conditions].reverse() })).toBe(true);
  });

  it("rejects the matcher that tested only the text, which is the one that silently never fired", () => {
    expect(isCurrentReworkRule(TEXT_ONLY)).toBe(false);
    // And a rule that is merely missing one of the vocabularies a reviewer uses.
    expect(isCurrentReworkRule({ combinator: "OR", conditions: REWORK_REQUESTED_RULE.conditions.slice(0, 4) })).toBe(false);
  });

  it("rejects nothing at all, rather than reading a missing rule as current", () => {
    for (const absent of [undefined, null, {}, { combinator: "OR" }, "fail"]) {
      expect(isCurrentReworkRule(absent)).toBe(false);
    }
  });
});
