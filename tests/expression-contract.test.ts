/**
 * An Expression step's output contract, derived from its own source.
 *
 * The gap this closes, measured on the live fleet 2026-09-28: NO node of any
 * team declares an output schema, so every "can this branch ever be true?"
 * question fell back to run history — which needs three runs and supports
 * "never observed", not "cannot happen". An Expression step needs neither: its
 * output is a JSONata object constructor and the keys are in the source.
 *
 * What these tests mostly pin is the REFUSAL to answer. A partial key list is
 * worse than none, because a caller treats the keys as complete and would
 * report a live branch as dead. So every shape this cannot see whole must come
 * back null.
 */
import { describe, it, expect } from "vitest";
import { expressionOutputKeys, expressionOutputSchema, nodeOutputSchema } from "../server/expression-contract";

const block = (verdict: string) => `(
  $rows := [1,2,3];
  $heaviest := $rows[0];
  {
    "zoneCount": $count($rows),
    "concentrationBreached": ${verdict}
  }
)`;

describe("reading the keys an expression promises", () => {
  it("reads them from a block that ends in an object", () => {
    expect(expressionOutputKeys(block("$heaviest > 2"))).toEqual(["zoneCount", "concentrationBreached"]);
  });

  it("reads a bare object with no block around it", () => {
    expect(expressionOutputKeys('{ "ok": true, "count": 3 }')).toEqual(["ok", "count"]);
  });

  it("ignores object constructors nested inside the expression", () => {
    // The live CAT step builds a per-zone object inside $each; only the keys of
    // the object the step RETURNS are its contract.
    const expr = `(
      $rows := $each($zones, function($v, $k) {{ "zone": $k, "tiv": $v.tiv }});
      { "zoneCount": $count($rows), "zones": $rows }
    )`;
    expect(expressionOutputKeys(expr)).toEqual(["zoneCount", "zones"]);
  });

  it("shapes the keys as a schema the condition checks already accept", () => {
    expect(expressionOutputSchema('{ "a": 1, "b": 2 }')).toEqual({ type: "object", properties: { a: {}, b: {} } });
  });
});

describe("refusing to answer rather than answering partly", () => {
  const unknown = [
    ["a computed key", '{ "fixed": 1, ($dynamic): 2 }'],
    ["a conditional returning different objects", '$flag ? { "a": 1 } : { "b": 2 }'],
    ["a merge of objects built elsewhere", '$merge([{ "a": 1 }, $other])'],
    ["an expression that returns something other than an object", "$count($rows)"],
    ["an expression that does not parse", '{ "a": '],
    ["nothing at all", "   "],
  ] as const;

  for (const [why, expr] of unknown) {
    it(`answers null for ${why}`, () => {
      expect(expressionOutputKeys(expr)).toBeNull();
      expect(expressionOutputSchema(expr)).toBeNull();
    });
  }

  it("answers null for an empty object, which promises nothing", () => {
    expect(expressionOutputKeys("{}")).toBeNull();
  });
});

describe("which schema a node's checks should use", () => {
  it("prefers a declared schema over anything derived", () => {
    const declared = { type: "object", properties: { declared: {} } };
    const node = { nodeType: "expression", outputSchema: declared, config: { expression: '{ "derived": 1 }' } };
    expect(nodeOutputSchema(node)).toBe(declared);
  });

  it("derives one for an expression step that declares none", () => {
    const node = { nodeType: "expression", outputSchema: null, config: { expression: '{ "passed": true }' } };
    expect(nodeOutputSchema(node)).toEqual({ type: "object", properties: { passed: {} } });
  });

  it("derives nothing for an agent step, whose output is not in any source", () => {
    expect(nodeOutputSchema({ nodeType: "agent", outputSchema: null, config: { expression: '{ "passed": true }' } })).toBeUndefined();
    expect(nodeOutputSchema(null)).toBeUndefined();
  });

  it("says nothing about a key being PRESENT, only about it being buildable", () => {
    // The distinction that matters: JSONata omits a key whose value works out
    // to nothing, so this contract lists a key the step can build, not one every
    // run reports. The conditional_output_field check owns the difference.
    const expr = block("$exists($missing) and $missing.share > 35");
    expect(expressionOutputKeys(expr)).toContain("concentrationBreached");
  });
});

/**
 * The shapes actually in production.
 *
 * Surveyed across all 198 teams on 2026-09-29: 18 deterministic rule fields are
 * produced by Expression steps, from 10 distinct expressions. These four carry
 * the constructs most likely to defeat a parser — a nested object constructor
 * inside the returned one, the descendant operator, and backtick-quoted field
 * names. A wrong key list here is not a missing warning, it is a live branch
 * reported as dead, so the real shapes are pinned rather than reasoned about.
 */
describe("the expression shapes live teams actually use", () => {
  it("takes the returned object, not the one built inside $each (CAT Accumulation by Zone)", () => {
    const expr = `(
  $zones := fetch_submission_schedule.scheduleSummary.byCatZone;
  $rows := $each($zones, function($v, $k) {{
    "zone": $k,
    "tier1Tiv": $v.tier1Tiv
  }});
  $withTier1 := $rows[tier1Tiv > 0];
  $heaviest := ($withTier1^(>tier1Tiv))[0];
  {
    "zoneCount": $count($rows),
    "coastalZoneCount": $count($withTier1),
    "heaviestZone": $heaviest,
    "concentrationBreached": $exists($heaviest) and $heaviest.shareOfCoastalLimitPct > 35,
    "zones": ($withTier1^(>tier1Tiv))
  }
)`;
    const keys = expressionOutputKeys(expr);
    expect(keys).toEqual(["zoneCount", "coastalZoneCount", "heaviestZone", "concentrationBreached", "zones"]);
    // "zone" and "tier1Tiv" belong to the inner rows, not to this step's output.
    expect(keys).not.toContain("zone");
    expect(keys).not.toContain("tier1Tiv");
  });

  it("handles object constructors used as a mapping operator (Binding Authority Sweep)", () => {
    const expr = `(
  $over := $rows[largestLocationTiv > 25000000];
  {
    "overSingleRiskLimit": $over.{"policyNumber": policyNumber, "largestLocationTiv": largestLocationTiv},
    "flaggedCount": $count($over),
    "anyFlagged": $count($over) > 0
  }
)`;
    expect(expressionOutputKeys(expr)).toEqual(["overSingleRiskLimit", "flaggedCount", "anyFlagged"]);
  });

  it("handles backtick-quoted field names (Treaty Limit Evaluator)", () => {
    const expr = `(
  $treaty := fetch_treaty_terms;
  $aggBreach := true;
  {
    "breached": $aggBreach,
    "clauseText": $append($aggBreach ? [$treaty.clauses.\`4.3\`] : [], []),
    "treatyId": $treaty.treatyId
  }
)`;
    expect(expressionOutputKeys(expr)).toEqual(["breached", "clauseText", "treatyId"]);
  });

  it("handles the descendant operator and a conditional basis (Confidence and Mandatory Fields)", () => {
    const expr = `(
  $ext := **.extraction;
  $rec := $ext[0];
  $known := $exists($rec.overallConfidence);
  {
    "evaluated": $known,
    "needsReview": $not($known),
    "missingFields": $rec.missingFields.field,
    "basis": $known ? "read from the record" : "nothing found, so a person decides"
  }
)`;
    expect(expressionOutputKeys(expr)).toEqual(["evaluated", "needsReview", "missingFields", "basis"]);
  });
});
