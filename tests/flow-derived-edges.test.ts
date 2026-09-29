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

/**
 * A flow whose routing steps nobody claims, which is every flow: a proposer
 * names a worker for "Pull Transactions", never for "Variance Within Tolerance"
 * or "Gather Data in Parallel", because those are not somebody doing a job.
 */
const routingSteps = [
  { id: "s1", label: "Reconcile", type: "take_action" },
  { id: "s2", label: "Variance Within Tolerance", type: "make_decision" },
  { id: "s3", label: "Accounting Approves", type: "expert_approval" },
  { id: "s4", label: "Sweep Authority", type: "expression" },
  { id: "s5", label: "Gather In Parallel", type: "parallel" },
  { id: "s6", label: "Read Claims", type: "get_info" },
  { id: "s7", label: "Read Treaty", type: "get_info" },
];
const routingAgents = [
  { name: "Reconciler", flowStepLabels: ["Reconcile"] },
  { name: "Accounting Checkpoint", flowStepLabels: ["Accounting Approves"] },
  { name: "Authority Sweeper", flowStepLabels: ["Sweep Authority"] },
  { name: "Claims Reader", flowStepLabels: ["Read Claims"] },
  { name: "Treaty Reader", flowStepLabels: ["Read Treaty"] },
];

describe("deriveEdgesFromFlow — routing steps nobody claims", () => {
  it("walks through an unclaimed decision, carrying each branch's condition", () => {
    // Live 2026-09-29: every edge touching a decision was dropped, so a binder
    // close built with all four decisions and all eight conditions gone, and
    // every gated path ran unconditionally.
    const derived = deriveEdgesFromFlow(routingAgents, routingSteps, [
      { from: "s1", to: "s2" },
      { from: "s2", to: "s3", condition: "reconcile.withinTolerance == false", label: "Outside tolerance" },
      { from: "s2", to: "s4", condition: "reconcile.withinTolerance == true", label: "Within tolerance" },
    ]);

    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Reconciler -> Accounting Checkpoint",
      "Reconciler -> Authority Sweeper",
    ]);
    expect(derived[0]).toMatchObject({
      type: "conditional",
      condition: "reconcile.withinTolerance == false",
      branchCondition: "reconcile.withinTolerance == false",
      label: "Outside tolerance",
    });
    expect(derived[1]).toMatchObject({ type: "conditional", condition: "reconcile.withinTolerance == true" });
  });

  it("walks through an unclaimed parallel fan-out to every branch", () => {
    const derived = deriveEdgesFromFlow(routingAgents, routingSteps, [
      { from: "s4", to: "s5" },
      { from: "s5", to: "s6" },
      { from: "s5", to: "s7" },
    ]);
    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Authority Sweeper -> Claims Reader",
      "Authority Sweeper -> Treaty Reader",
    ]);
    // Nothing conditional about a fan-out: both branches always run.
    expect(derived.every((e) => e.type === "handoff")).toBe(true);
  });

  it("carries a condition through a fan-out that sits behind a branch", () => {
    const derived = deriveEdgesFromFlow(routingAgents, routingSteps, [
      { from: "s1", to: "s2" },
      { from: "s2", to: "s5", condition: "reconcile.withinTolerance == true" },
      { from: "s5", to: "s6" },
      { from: "s5", to: "s7" },
    ]);
    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Reconciler -> Claims Reader",
      "Reconciler -> Treaty Reader",
    ]);
    expect(derived.every((e) => e.condition === "reconcile.withinTolerance == true")).toBe(true);
  });

  it("restores the back-edge a dropped decision had hidden", () => {
    // The loop only IS a loop once the decision's edges exist: with them gone
    // the target had no outgoing edge, so the rework edge looked like an
    // ordinary handoff and was built as one, losing its round limit.
    const steps = [
      { id: "q1", label: "Check Quality", type: "expression" },
      { id: "q2", label: "Quality Assessment", type: "make_decision" },
      { id: "q3", label: "Fix It", type: "take_action" },
      { id: "q4", label: "Carry On", type: "take_action" },
    ];
    const agents = [
      { name: "Quality Checker", flowStepLabels: ["Check Quality"] },
      { name: "Fixer", flowStepLabels: ["Fix It"] },
      { name: "Carrier On", flowStepLabels: ["Carry On"] },
    ];
    const derived = deriveEdgesFromFlow(agents, steps, [
      { from: "q1", to: "q2" },
      { from: "q2", to: "q3", condition: "check_quality.needsCorrection == true" },
      { from: "q2", to: "q4", condition: "check_quality.needsCorrection == false" },
      { from: "q3", to: "q1", maxRounds: 2 },
    ]);
    expect(derived.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Quality Checker -> Fixer",
      "Quality Checker -> Carrier On",
      "Fixer -> Quality Checker",
    ]);
    expect(derived.find((e) => e.from === "Fixer")).toMatchObject({ maxRounds: 2, type: "handoff" });
  });

  it("still drops an edge into a step that is unclaimed and is not routing", () => {
    // The original guarantee: a partial mapping yields fewer edges, never
    // wrong ones. An unclaimed step that does real work is not walked through.
    const steps = [
      { id: "a", label: "First", type: "take_action" },
      { id: "b", label: "Unclaimed Work", type: "take_action" },
      { id: "c", label: "Third", type: "take_action" },
    ];
    const agents = [{ name: "A", flowStepLabels: ["First"] }, { name: "C", flowStepLabels: ["Third"] }];
    expect(deriveEdgesFromFlow(agents, steps, [{ from: "a", to: "b" }, { from: "b", to: "c" }])).toEqual([]);
  });

  it("does not hang on routing steps that point at each other", () => {
    const steps = [
      { id: "x", label: "Start Here", type: "take_action" },
      { id: "y", label: "Loop A", type: "parallel" },
      { id: "z", label: "Loop B", type: "parallel" },
    ];
    const agents = [{ name: "Starter", flowStepLabels: ["Start Here"] }];
    expect(deriveEdgesFromFlow(agents, steps, [
      { from: "x", to: "y" }, { from: "y", to: "z" }, { from: "z", to: "y" },
    ])).toEqual([]);
  });

  it("is unchanged for steps that carry no type at all", () => {
    // Every existing caller's shape: without a type nothing is routing, so an
    // unclaimed step is dropped exactly as before.
    const derived = deriveEdgesFromFlow(
      [{ name: "A", flowStepLabels: ["One"] }, { name: "C", flowStepLabels: ["Three"] }],
      [{ id: "1", label: "One" }, { id: "2", label: "Two" }, { id: "3", label: "Three" }],
      [{ from: "1", to: "2" }, { from: "2", to: "3" }],
    );
    expect(derived).toEqual([]);
  });
});

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

    // branchCondition is the name team-build's resolveEdgeRuleFromSpec reads.
    // Without it the edge is built unconditional and the decision takes every
    // branch, which is not a branch at all.
    expect(breach!.branchCondition).toBe("Treaty limit breached");
    expect(derived.find((e) => e.to === "Treaty Limit Evaluator")).not.toHaveProperty("branchCondition");
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
      {
        from: "Contract Certainty Reviewer",
        to: "Pricing & Drafting Agent",
        label: "Endorsement rejected",
        condition: "Endorsement rejected",
        branchCondition: "Endorsement rejected",
        type: "conditional",
      },
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
