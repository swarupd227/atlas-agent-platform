/**
 * The key a step's result lands under, and what follows it when it moves.
 *
 * shared/state-key.ts names the contract: a step's result is filed under the
 * slug of the step's own label, so an author can write `treaty_check.breached`
 * before anything is built. Two things here keep that true after the build:
 * `effectiveStateKey`, which says what the engine actually files a node under
 * (a stored key, else the label's slug -- the difference that hid a dead
 * branch on a live team, 2026-09-29), and `rewriteStateKeyReferences`, which
 * moves every rule and condition along when a key changes.
 */
import { describe, it, expect } from "vitest";
import { effectiveStateKey, stateKeyForLabel } from "../shared/state-key";
import { rewriteStateKeyReferences } from "../shared/rule-fields";

describe("what a node's result is actually filed under", () => {
  it("is the stored key when there is one", () => {
    expect(effectiveStateKey({ id: "x", label: "Endorsement Accepted? Agent", stateKey: "endorsement_accepted" })).toBe("endorsement_accepted");
  });

  it("is the slug of the label when there is none -- the engine's own fallback", () => {
    expect(effectiveStateKey({ id: "x", label: "Endorsement Accepted? Agent", stateKey: null })).toBe("endorsement_accepted_agent");
    expect(effectiveStateKey({ id: "x", label: "Endorsement Accepted? Agent", stateKey: "  " })).toBe("endorsement_accepted_agent");
    expect(effectiveStateKey({ id: "x", label: "Treaty check" })).toBe(stateKeyForLabel("Treaty check"));
  });

  it("falls back to the id only when the label gives nothing", () => {
    expect(effectiveStateKey({ id: "4d88a042-261e", label: "???" })).toBe("4d88a042_261e");
  });
});

describe("moving the rules along when a key changes", () => {
  const renames = new Map([["treaty_check", "treaty_limit_check"], ["endorsement_accepted_agent", "endorsement_accepted"]]);

  it("rewrites the condition text and every rule field that starts with the old key", () => {
    const { condition, rule, rewrote } = rewriteStateKeyReferences({
      condition: "treaty_check.breached == true",
      rule: { combinator: "AND", conditions: [{ field: "treaty_check.breached", operator: "==", value: true }] },
      renames,
    });
    expect(condition).toBe("treaty_limit_check.breached == true");
    expect(rule).toEqual({ combinator: "AND", conditions: [{ field: "treaty_limit_check.breached", operator: "==", value: true }] });
    expect(rewrote).toEqual(["treaty_check"]);
  });

  it("reaches into nested groups and deeper paths", () => {
    const { rule } = rewriteStateKeyReferences({
      rule: { combinator: "OR", conditions: [
        { combinator: "AND", conditions: [{ field: "endorsement_accepted_agent.result.approved", operator: "==", value: true }] },
        { field: "other.x", operator: ">", value: 1 },
      ] },
      renames,
    });
    expect(rule).toEqual({ combinator: "OR", conditions: [
      { combinator: "AND", conditions: [{ field: "endorsement_accepted.result.approved", operator: "==", value: true }] },
      { field: "other.x", operator: ">", value: 1 },
    ] });
  });

  it("matches the key whole and only before a dot, so a bare field or a longer key is left alone", () => {
    const { condition, rule, rewrote } = rewriteStateKeyReferences({
      condition: "treaty_check_agent.x == 1 and treaty_check > 3 and mytreaty_check.y == 2",
      rule: { combinator: "AND", conditions: [{ field: "treaty_check", operator: ">", value: 3 }, { field: "treaty_check_agent.x", operator: "==", value: 1 }] },
      renames,
    });
    expect(condition).toBe("treaty_check_agent.x == 1 and treaty_check > 3 and mytreaty_check.y == 2");
    expect(rule).toEqual({ combinator: "AND", conditions: [{ field: "treaty_check", operator: ">", value: 3 }, { field: "treaty_check_agent.x", operator: "==", value: 1 }] });
    expect(rewrote).toEqual([]);
  });

  it("rewrites a key at the very start and after punctuation", () => {
    expect(rewriteStateKeyReferences({ condition: "(treaty_check.breached) or !treaty_check.ok", renames }).condition).toBe("(treaty_limit_check.breached) or !treaty_limit_check.ok");
  });

  it("hands back what it was given when there is nothing to rename", () => {
    const rule = { combinator: "AND", conditions: [{ field: "a.b", operator: "==", value: 1 }] };
    expect(rewriteStateKeyReferences({ condition: "a.b == 1", rule, renames: new Map() })).toEqual({ condition: "a.b == 1", rule, rewrote: [] });
    expect(rewriteStateKeyReferences({ condition: null, rule: null, renames })).toEqual({ condition: null, rule: null, rewrote: [] });
    expect(rewriteStateKeyReferences({ renames }).rule).toBeUndefined();
  });
});
