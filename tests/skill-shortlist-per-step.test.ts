import { describe, it, expect } from "vitest";
import { shortlistSkillsForFlow } from "../server/team-proposal";

type S = { id: string; name: string; description?: string | null };

/**
 * The real case this was written for. The E&S journey's outcome contract gives
 * the old scorer 145 keyword terms, and treaty-cession-classification still did
 * not reach its top 14 -- the outcome talks about treaty limits in prose the
 * skill's own text does not share. A step does share it.
 */
const library: S[] = [
  { id: "treaty", name: "treaty-cession-classification", description: "Classifies which cessions fall to a treaty and which are facultative." },
  { id: "stp", name: "straight-through-underwriting-validation", description: "Validates a submission can be bound without referral." },
  { id: "cope", name: "COPE Normalization and Extraction Confidence", description: "Normalises construction, occupancy, protection and exposure from a statement of values." },
  { id: "bdx", name: "Bordereau Composition and Reconciliation", description: "Assembles a bound policy into the carrier bordereau and reconciles to the ledger." },
  { id: "endo", name: "Manuscript Endorsement Clause Taxonomy", description: "Drafts endorsement wording within the approved clause taxonomy." },
  { id: "noise1", name: "Salesforce Case Automation", description: "Automates case routing in Salesforce." },
  { id: "noise2", name: "Behavioural Signal Processing", description: "Processes behavioural signals for marketing segmentation." },
  { id: "noise3", name: "Invoice Dispute Triage", description: "Triages invoice disputes for collections." },
];

// Ranked by the outcome's overall vocabulary, treaty does NOT come top: the
// generic underwriting skills score higher. That is the bug being fixed.
const outcomeRank = (a: S, b: S) => {
  const w = (s: S) => (s.id === "cope" ? 5 : s.id === "endo" ? 4 : s.id === "bdx" ? 3 : s.id === "stp" ? 2 : s.id === "noise1" ? 1 : 0);
  return w(b) - w(a);
};

describe("shortlistSkillsForFlow", () => {
  it("offers the skill a step is about, even when the outcome ranking buries it", () => {
    const steps = ["Compare the coastal Tier 1 treaty aggregate against the treaty limit and classify the cession"];
    const picked = shortlistSkillsForFlow(library, steps, [], outcomeRank, { cap: 4, floor: 0 });
    expect(picked.map(s => s.id)).toContain("treaty");
  });

  it("gives every step its own candidates rather than one global ranking", () => {
    const steps = [
      "Normalise the statement of values into a COPE model",
      "Compare the coastal Tier 1 treaty aggregate against the treaty limit",
      "Draft the manuscript endorsement wording",
    ];
    const ids = shortlistSkillsForFlow(library, steps, [], outcomeRank, { perStep: 1, floor: 0 }).map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining(["cope", "treaty", "endo"]));
  });

  it("always offers a skill the author bound to a step, whatever it scores", () => {
    // The prompt tells the model it MUST name this one, so it has to be offered.
    const steps = ["Do something entirely unrelated to any skill in the library"];
    const picked = shortlistSkillsForFlow(library, steps, ["Bordereau Composition and Reconciliation"], outcomeRank, { floor: 0 });
    expect(picked.map(s => s.id)).toContain("bdx");
  });

  it("matches a bound skill name case- and whitespace-insensitively", () => {
    const picked = shortlistSkillsForFlow(library, ["unrelated"], ["  TREATY-CESSION-CLASSIFICATION  "], outcomeRank, { floor: 0 });
    expect(picked.map(s => s.id)).toContain("treaty");
  });

  it("falls back to the outcome ranking when there are no steps", () => {
    // An outcome-only proposal has no per-step signal, so that path must behave
    // exactly as it did before this change.
    const picked = shortlistSkillsForFlow(library, [], [], outcomeRank, { fallbackCap: 3 });
    expect(picked.map(s => s.id)).toEqual(["cope", "endo", "bdx"]);
  });

  it("ignores blank step text instead of treating it as a step", () => {
    const picked = shortlistSkillsForFlow(library, ["", "   "], [], outcomeRank, { fallbackCap: 2 });
    expect(picked).toHaveLength(2);
  });

  it("tops up from the outcome ranking when the steps matched almost nothing", () => {
    const picked = shortlistSkillsForFlow(library, ["zzz nothing matches here"], [], outcomeRank, { floor: 5, fallbackCap: 5 });
    expect(picked.length).toBe(5);
  });

  it("never exceeds the cap", () => {
    const steps = library.map(s => s.description ?? s.name);
    const picked = shortlistSkillsForFlow(library, steps, [], outcomeRank, { cap: 3, floor: 0 });
    expect(picked.length).toBeLessThanOrEqual(3);
  });

  it("returns no duplicates when several steps want the same skill", () => {
    const steps = ["treaty cession classify", "classify the treaty cession", "treaty cession again"];
    const picked = shortlistSkillsForFlow(library, steps, [], outcomeRank, { floor: 0 });
    expect(new Set(picked.map(s => s.id)).size).toBe(picked.length);
  });

  it("does not mutate the library it was given", () => {
    const order = library.map(s => s.id);
    shortlistSkillsForFlow(library, [], [], outcomeRank);
    expect(library.map(s => s.id)).toEqual(order);
  });
});
