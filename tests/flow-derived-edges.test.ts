import { describe, it, expect } from "vitest";
import { deriveEdgesFromFlow } from "../server/team-proposal";

/**
 * A business flow's connections becoming the team's execution order.
 *
 * Without this the drafting model had to rebuild the graph from prose, and
 * when it didn't, the team was built as a flat fan-out -- every agent in one
 * wave, decisions and sign-off ordering gone, and nothing saying so. Live
 * 2026-09-23: a 22-step E&S underwriting flow shipped as 17 agents that all
 * ran at once.
 */
const steps = [
  { id: "n1", label: "Read Submission" },
  { id: "n2", label: "Evaluate Treaty Limits" },
  { id: "n3", label: "Carrier Underwriter Approval" },
  { id: "n4", label: "Calculate Premium" },
  { id: "n5", label: "Draft Endorsement" },
  { id: "n6", label: "Contract Certainty Review" },
];

const agents = [
  { name: "Intake Agent", flowStepLabels: ["Read Submission"] },
  { name: "Treaty Limit Evaluator", flowStepLabels: ["Evaluate Treaty Limits"] },
  { name: "Carrier Approval Checkpoint", flowStepLabels: ["Carrier Underwriter Approval"] },
  // One agent covering two steps: the connection between them is internal.
  { name: "Pricing & Drafting Agent", flowStepLabels: ["Calculate Premium", "Draft Endorsement"] },
  { name: "Contract Certainty Reviewer", flowStepLabels: ["Contract Certainty Review"] },
];

describe("deriveEdgesFromFlow", () => {
  it("turns the flow's connections into agent-to-agent edges, keeping the conditions", () => {
    const derived = deriveEdgesFromFlow(agents, steps, [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3", condition: "Treaty limit breached" },
      { from: "n2", to: "n4", condition: "No limits breached" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
    ]);

    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Intake Agent -> Treaty Limit Evaluator",
      "Treaty Limit Evaluator -> Carrier Approval Checkpoint",
      "Treaty Limit Evaluator -> Pricing & Drafting Agent",
      "Pricing & Drafting Agent -> Contract Certainty Reviewer",
    ]);
    const breach = derived.find((e) => e.to === "Carrier Approval Checkpoint");
    expect(breach).toMatchObject({ type: "conditional", condition: "Treaty limit breached", label: "Treaty limit breached" });
    expect(derived.find((e) => e.to === "Treaty Limit Evaluator")).toMatchObject({ type: "handoff" });
  });

  it("drops a connection whose ends sit inside one agent", () => {
    // Calculate Premium -> Draft Endorsement is internal to Pricing & Drafting.
    const derived = deriveEdgesFromFlow(agents, steps, [{ from: "n4", to: "n5" }]);
    expect(derived).toEqual([]);
  });

  it("keeps a back-edge, which is how a rework loop reaches the builder", () => {
    const derived = deriveEdgesFromFlow(agents, steps, [
      { from: "n6", to: "n5", condition: "Endorsement rejected" },
    ]);
    expect(derived).toEqual([
      { from: "Contract Certainty Reviewer", to: "Pricing & Drafting Agent", label: "Endorsement rejected", condition: "Endorsement rejected", type: "conditional" },
    ]);
  });

  it("carries a loop's round limit through, so two rounds is built as two", () => {
    const [derived] = deriveEdgesFromFlow(agents, steps, [
      { from: "n6", to: "n5", condition: "Endorsement rejected", maxRounds: 2 },
    ]);
    expect(derived.maxRounds).toBe(2);
    // Absent stays absent rather than becoming 0 or NaN, so the builder's own
    // default applies instead of a bogus number.
    const [none] = deriveEdgesFromFlow(agents, steps, [{ from: "n6", to: "n5" }]);
    expect(none).not.toHaveProperty("maxRounds");
    const [bad] = deriveEdgesFromFlow(agents, steps, [{ from: "n6", to: "n5", maxRounds: "two" as any }]);
    expect(bad).not.toHaveProperty("maxRounds");
  });

  it("emits fewer edges rather than wrong ones when the mapping is partial", () => {
    const partial = [{ name: "Intake Agent", flowStepLabels: ["Read Submission"] }];
    const derived = deriveEdgesFromFlow(partial, steps, [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
    ]);
    expect(derived).toEqual([]);
  });

  it("returns nothing when no agent claims a step, so the caller can warn", () => {
    const unmapped = [{ name: "Some Agent" }, { name: "Another", flowStepLabels: "not an array" }];
    expect(deriveEdgesFromFlow(unmapped as any, steps, [{ from: "n1", to: "n2" }])).toEqual([]);
  });

  it("matches step labels regardless of case and surrounding space", () => {
    const sloppy = [
      { name: "A", flowStepLabels: ["  read submission "] },
      { name: "B", flowStepLabels: ["EVALUATE TREATY LIMITS"] },
    ];
    const derived = deriveEdgesFromFlow(sloppy, steps, [{ from: "n1", to: "n2" }]);
    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual(["A -> B"]);
  });

  it("does not emit the same connection twice", () => {
    const derived = deriveEdgesFromFlow(agents, steps, [
      { from: "n1", to: "n2" },
      { from: "n1", to: "n2" },
    ]);
    expect(derived).toHaveLength(1);
  });
});
