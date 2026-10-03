/**
 * A proposed agent's step, inferred from its name when the proposal does not say.
 *
 * Live 2026-10-03: the drafting model named every agent after its step and
 * declared no flowStepLabels, so the team built from a flow with two classify
 * and score decisions had no decision nodes, no state keys, no edges derived
 * from the flow and no correlation back to it; the sync could only offer a
 * full rebuild. These pin that the names carry the claim, that a clear match
 * is taken and an unclear one is not, and that both the drafting call and the
 * build apply it before anything reads the claims.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { inferStepClaims, nameCoverage, CLAIM_COVERAGE } from "../server/flow-step-claims";
import { deriveEdgesFromFlow, unclaimedWorkSteps } from "../server/team-proposal";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

/** The drill flow as drawn, and the agents the model proposed for it on 2026-10-03, with no claims. */
const steps = [
  { id: "t", type: "trigger", label: "FNOL Received" },
  { id: "intake", type: "ai_reasoning", label: "Summarise the Loss" },
  { id: "classify", type: "make_decision", label: "Classify Claim Type" },
  { id: "score", type: "make_decision", label: "Score Severity" },
  { id: "siu", type: "ai_reasoning", label: "Refer to Special Investigations" },
  { id: "senior", type: "ai_reasoning", label: "Assign Senior Adjuster" },
  { id: "fast", type: "ai_reasoning", label: "Fast-track Settlement" },
  { id: "end", type: "end", label: "Claim Routed" },
];
const renamed = [
  { name: "FNOL Intake Agent" },
  { name: "Loss Summarization Agent" },
  { name: "Claim Type Classifier Agent" },
  { name: "Loss Severity Scoring Agent" },
  { name: "SIU Referral Agent" },
  { name: "Senior Adjuster Assignment Agent" },
  { name: "Fast-Track Settlement Agent" },
  { name: "Claim Routing Agent" },
];
const claims = (r: ReturnType<typeof inferStepClaims>) => Object.fromEntries(r.agents.map((a: any) => [a.name, a.flowStepLabels ?? null]));

describe("how much of a step's name an agent's name carries", () => {
  it("counts a word in another form as the same word", () => {
    expect(nameCoverage("Loss Summarization Agent", "Summarise the Loss")).toBe(1);
    expect(nameCoverage("Claim Type Classifier Agent", "Classify Claim Type")).toBe(1);
    expect(nameCoverage("Loss Severity Scoring Agent", "Score Severity")).toBe(1);
    expect(nameCoverage("Senior Adjuster Assignment Agent", "Assign Senior Adjuster")).toBe(1);
  });

  it("does not count a word that merely shares a few letters", () => {
    expect(nameCoverage("Data Export Agent", "Date Check")).toBe(0);
    expect(nameCoverage("SIU Referral Agent", "Refer to Special Investigations")).toBeCloseTo(1 / 3);
    expect(nameCoverage("FNOL Intake Agent", "FNOL Received")).toBe(0.5);
    expect(CLAIM_COVERAGE).toBe(0.6);
  });
});

describe("inferring the claims the model left out", () => {
  it("claims the steps the names clearly cover, including the classify and score decisions, and leaves the rest unclaimed", () => {
    const r = inferStepClaims(renamed, steps);
    expect(claims(r)).toEqual({
      "FNOL Intake Agent": null,
      "Loss Summarization Agent": ["Summarise the Loss"],
      "Claim Type Classifier Agent": ["Classify Claim Type"],
      "Loss Severity Scoring Agent": ["Score Severity"],
      "SIU Referral Agent": null,
      "Senior Adjuster Assignment Agent": ["Assign Senior Adjuster"],
      "Fast-Track Settlement Agent": ["Fast-track Settlement"],
      "Claim Routing Agent": ["Claim Routed"],
    });
    expect(r.inferred).toHaveLength(6);
    // What is still unclaimed is reported as before, instead of being built flat in silence.
    expect(unclaimedWorkSteps(r.agents, steps)).toEqual(["Refer to Special Investigations"]);
  });

  it("claims every step when the model named each agent after its step", () => {
    const named = steps.map((s) => ({ name: `${s.label} Agent` }));
    const r = inferStepClaims(named, steps);
    expect(r.inferred).toHaveLength(steps.length);
    expect(unclaimedWorkSteps(r.agents, steps)).toEqual([]);
    // With the claims in place the flow's own connections become the team's edges.
    const edges = [
      { from: "t", to: "intake" }, { from: "intake", to: "classify" }, { from: "classify", to: "score" },
      { from: "classify", to: "siu", condition: 'classify_claim_type == "Fraud suspicion"' },
      { from: "score", to: "senior", condition: "score_severity >= 2" }, { from: "score", to: "fast", condition: "score_severity < 2" },
    ];
    const derived = deriveEdgesFromFlow(r.agents, steps, edges);
    expect(derived.map((e) => `${e.from} -> ${e.to}${e.condition ? ` [${e.condition}]` : ""}`)).toEqual([
      "FNOL Received Agent -> Summarise the Loss Agent",
      "Summarise the Loss Agent -> Classify Claim Type Agent",
      "Classify Claim Type Agent -> Score Severity Agent",
      'Classify Claim Type Agent -> Refer to Special Investigations Agent [classify_claim_type == "Fraud suspicion"]',
      "Score Severity Agent -> Assign Senior Adjuster Agent [score_severity >= 2]",
      "Score Severity Agent -> Fast-track Settlement Agent [score_severity < 2]",
    ]);
  });

  it("leaves an agent that already names a real step alone, and treats a claim naming no step as none", () => {
    const r = inferStepClaims([
      { name: "Anything", flowStepLabels: ["Summarise the Loss"] },
      { name: "Score Severity Agent", flowStepLabels: ["Severity Scoring (renamed)"] },
    ], steps);
    expect(claims(r)).toEqual({ Anything: ["Summarise the Loss"], "Score Severity Agent": ["Score Severity"] });
    expect(r.inferred).toEqual([{ agent: "Score Severity Agent", step: "Score Severity" }]);
  });

  it("never claims a step twice, and claims nothing on a tie", () => {
    const two = [{ id: "a", label: "Review Draft" }, { id: "b", label: "Review Final" }];
    // "Review Agent" covers both equally: ambiguous, so neither.
    expect(claims(inferStepClaims([{ name: "Review Agent" }], two))).toEqual({ "Review Agent": null });
    // "Draft Review Agent" covers one fully and the other by half: the full one.
    expect(claims(inferStepClaims([{ name: "Draft Review Agent" }], two))).toEqual({ "Draft Review Agent": ["Review Draft"] });
    // Two agents for one step: the better name takes it, the other stays unclaimed.
    const r = inferStepClaims([{ name: "Final Review Agent" }, { name: "Review Final Draft Agent" }], [two[1]]);
    expect(Object.values(claims(r)).filter(Boolean)).toHaveLength(1);
    // An agent that already holds a step is skipped, so its step is not handed to a namesake.
    const held = inferStepClaims([{ name: "Scoring", flowStepLabels: ["Score Severity"] }, { name: "Score Severity Agent" }], steps);
    expect(claims(held)["Score Severity Agent"]).toBeNull();
  });

  it("changes nothing when there are no steps or no names", () => {
    expect(inferStepClaims(renamed, [])).toEqual({ agents: renamed, inferred: [] });
    expect(inferStepClaims([{ name: "" }, {} as any], steps).inferred).toEqual([]);
  });
});

describe("where it is applied", () => {
  it("the drafting call infers the claims before it splits configured steps and derives the edges", () => {
    const src = read("server", "team-proposal.ts");
    const at = src.indexOf("const inferred = inferStepClaims(result.agents || [], processFlowSteps);");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf("const splitAgents = splitConfiguredSteps(result.agents || [], processFlowSteps);"));
  });

  it("the build infers them too, so a proposal saved without them still reaches its steps", () => {
    const src = read("server", "team-build.ts");
    const at = src.indexOf("const claimed = inferStepClaims(workers, authoredSteps);");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(src.indexOf("const authoredStepsByLabel = new Map<string, any>("));
    expect(at).toBeLessThan(src.indexOf("for (const worker of workers) {"));
  });
});
