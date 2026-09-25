import { describe, it, expect } from "vitest";
import { detectTranscriptionDrift } from "../server/agent-runtime";

/**
 * Catching a figure a step retyped wrongly from a connector's answer.
 *
 * The live case (2026-09-24): fetch_submission returned a largest single
 * location of $18,500,000 and the step wrote largestSingleLocationTiv:
 * 8947000. The aggregate next to it was copied correctly, so the output looked
 * consistent, and the treaty step then compared the wrong number against the
 * $25M single-risk limit and reported compliance with complete confidence.
 */
const submissionFacts = {
  fetch_submission: {
    submissionId: "SUB-2026-8891",
    scheduleSummary: {
      totalTiv: 386479000,
      locationCount: 120,
      largestSingleLocation: { locationId: "001", tiv: 18500000 },
      coastalTier1: { locationCount: 14, aggregateTiv: 72400000 },
    },
  },
};

describe("detectTranscriptionDrift", () => {
  it("catches the flattened figure that changed on the way into state", () => {
    const drift = detectTranscriptionDrift(
      { largestSingleLocationTiv: 8947000, coastalTier1AggregateTiv: 72400000, totalTiv: 386479000 },
      submissionFacts,
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ field: "largestSingleLocationTiv", wrote: 8947000, source: 18500000 });
    expect(drift[0].sourcePath).toContain("largestSingleLocation.tiv");
  });

  it("says nothing when the step copied faithfully", () => {
    expect(detectTranscriptionDrift(
      { largestSingleLocationTiv: 18500000, coastalTier1AggregateTiv: 72400000, locationCount: 120 },
      submissionFacts,
    )).toEqual([]);
  });

  it("ignores a figure the step worked out rather than copied", () => {
    // Nothing in the connector's answer is called "excessOverLimit", so this
    // is the step's own arithmetic, not a retyping to be second-guessed.
    expect(detectTranscriptionDrift({ excessOverLimit: 22400000, riskScore: 62 }, submissionFacts)).toEqual([]);
  });

  it("matches names however the step spelled them", () => {
    expect(detectTranscriptionDrift({ total_tiv: 1 }, submissionFacts)).toHaveLength(1);
    expect(detectTranscriptionDrift({ TotalTIV: 1 }, submissionFacts)).toHaveLength(1);
    expect(detectTranscriptionDrift({ "coastal-tier1-aggregate-tiv": 1 }, submissionFacts)).toHaveLength(1);
  });

  it("reads a number the step wrote as a string", () => {
    expect(detectTranscriptionDrift({ totalTiv: "8947000" }, submissionFacts)).toHaveLength(1);
    expect(detectTranscriptionDrift({ totalTiv: "386479000" }, submissionFacts)).toEqual([]);
  });

  it("accepts any reading when a tool was called more than once", () => {
    const facts = { get_policy: { premium: 1000 }, rate_risk: { premium: 2000 } };
    // The step reporting either of the two premiums it was told is not drift.
    expect(detectTranscriptionDrift({ premium: 2000 }, facts)).toEqual([]);
    expect(detectTranscriptionDrift({ premium: 1000 }, facts)).toEqual([]);
    expect(detectTranscriptionDrift({ premium: 1500 }, facts)).toHaveLength(1);
  });

  it("does not comb through payload rows", () => {
    // A row inside a returned list is not a headline figure, and matching
    // against 50 of them would report drift on any coincidence of name.
    const facts = { get_sov_locations: { locations: [{ tiv: 900000 }, { tiv: 800000 }] } };
    expect(detectTranscriptionDrift({ tiv: 18500000 }, facts)).toEqual([]);
  });

  it("catches a figure reported by a step that never fetched it", () => {
    // The live miss (2026-09-24): the treaty step called get_treaty_terms for
    // the LIMITS, then stated a coastal aggregate of $48M and concluded "no
    // breach" — against a true $72.4M that breaches. The aggregate came from
    // the submission system, called by an earlier step, so checking a step
    // against only its own calls said nothing about the one number the whole
    // control depends on. The engine pools every connector answer in the run.
    const runFacts = {
      ...submissionFacts,
      get_treaty_terms: { treatyId: "CP-2026-17", singleRiskLimit: 25000000, coastalTier1AggregateLimit: 50000000 },
    };
    const drift = detectTranscriptionDrift({ coastalTier1AggregateTiv: 48000000, breached: 0 }, runFacts);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ field: "coastalTier1AggregateTiv", wrote: 48000000, source: 72400000 });
  });

  it("is quiet when there is nothing to compare", () => {
    expect(detectTranscriptionDrift(null, submissionFacts)).toEqual([]);
    expect(detectTranscriptionDrift({ totalTiv: 1 }, null)).toEqual([]);
    expect(detectTranscriptionDrift({}, {})).toEqual([]);
  });
});
