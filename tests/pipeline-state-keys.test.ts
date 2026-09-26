/**
 * An edge rule must be able to name a step the way the author was told to.
 *
 * shared/state-key.ts tells an author that a step drawn as "Evaluate Treaty
 * Limits" stores its result under `evaluate_treaty_limits`, so the gate on its
 * outgoing edges is `evaluate_treaty_limits.breached == true`. That was true of
 * the state a node WRITES and false of the state a RULE is evaluated against:
 * buildPipelineState keyed only by the node's display label, plus a flattened
 * copy of the structured output's own fields.
 *
 * The consequence was silent and total. The qualified field resolved undefined,
 * so `== true` and `== false` were BOTH unsatisfied, and the engine skipped
 * every node downstream of the decision -- three runs of a twenty-wave journey
 * that stopped at wave three and still reported "completed_with_skips".
 *
 * These tests go through the real buildPipelineState deliberately. The reason
 * the contract shipped broken is that its first test hand-built the state
 * object it wished for instead of asking the engine what it actually builds.
 */
import { describe, it, expect } from "vitest";
import { buildPipelineState } from "../server/agent-runtime";
import { evaluateRule } from "../server/rule-evaluator";
import { parseConditionToRule } from "../shared/condition-to-rule";
import { stateKeyForLabel } from "../shared/state-key";

const LABEL = "Evaluate Treaty Limits";
const NODE = "node-abc";
const OUTPUT = JSON.stringify({ breached: true, coastalTier1AggregateTiv: 72_400_000, coastalTier1AggregateLimit: 50_000_000 });

const build = (label: string, output: string, withKey = true) =>
  buildPipelineState(
    new Map([[NODE, output]]),
    new Map([[NODE, label]]),
    withKey ? new Map([[NODE, stateKeyForLabel(label)]]) : undefined,
  );

describe("the names a routing rule can use for a step's result", () => {
  it("resolves the state key the author was told to write", () => {
    const state = build(LABEL, OUTPUT);
    const rule = parseConditionToRule("evaluate_treaty_limits.breached == true")!;
    expect(rule).not.toBeNull();
    expect(evaluateRule(rule, state).result).toBe(true);
    // And the opposite branch is correspondingly false, so exactly one fires.
    expect(evaluateRule(parseConditionToRule("evaluate_treaty_limits.breached == false")!, state).result).toBe(false);
  });

  it("still resolves the display label and the bare field", () => {
    // Both were already relied on; neither may regress.
    const state = build(LABEL, OUTPUT);
    expect(state[LABEL]).toEqual(JSON.parse(OUTPUT));
    expect(evaluateRule(parseConditionToRule("breached == true")!, state).result).toBe(true);
  });

  it("carries a non-JSON output under the state key too", () => {
    const state = build("Draft The Endorsement", "The endorsement was redrafted and sent for review.");
    expect(state.draft_the_endorsement).toContain("redrafted");
  });

  it("does not overwrite a label that already equals its own state key", () => {
    // A step literally called "summary" has label === stateKey; writing twice
    // must not turn the parsed object into something else.
    const state = build("summary", OUTPUT);
    expect(state.summary).toEqual(JSON.parse(OUTPUT));
  });

  it("keeps two steps that emit the same field apart", () => {
    // The reason a qualified name matters: flattening alone cannot tell two
    // `approved` fields apart, and last-writer-wins silently decides.
    const state = buildPipelineState(
      new Map([["n1", JSON.stringify({ approved: true })], ["n2", JSON.stringify({ approved: false })]]),
      new Map([["n1", "Underwriter Sign-Off"], ["n2", "Senior Underwriter Sign-Off"]]),
      new Map([["n1", "underwriter_sign_off"], ["n2", "senior_underwriter_sign_off"]]),
    );
    expect(evaluateRule(parseConditionToRule("underwriter_sign_off.approved == true")!, state).result).toBe(true);
    expect(evaluateRule(parseConditionToRule("senior_underwriter_sign_off.approved == true")!, state).result).toBe(false);
  });

  it("is unchanged for a caller that passes no state keys", () => {
    // executeTeamPipeline has no node config and must behave exactly as before.
    const before = build(LABEL, OUTPUT, false);
    expect(before[LABEL]).toEqual(JSON.parse(OUTPUT));
    expect(before.evaluate_treaty_limits).toBeUndefined();
    expect(before.breached).toBe(true);
  });
});
