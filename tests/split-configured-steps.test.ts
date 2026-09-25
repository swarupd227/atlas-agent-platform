/**
 * A step the author already made deterministic must survive the draft.
 *
 * The builder derives a deterministic node from an authored step only when an
 * agent covers exactly that one step, so a drafting model that folds three
 * configured steps into one agent silently throws all three configurations
 * away: the tool calls never happen and an expression the author wrote never
 * runs. Live 2026-09-25, a treaty check drawn as fetch-schedule, fetch-treaty,
 * compare came back as a single agent carrying an expression the model wrote
 * itself -- over field names that exist in no system, comparing a coastal
 * aggregate against a single-risk limit. It would have run, looked
 * deterministic, and been wrong.
 */
import { describe, it, expect } from "vitest";
import { splitConfiguredSteps, deriveEdgesFromFlow } from "../server/team-proposal";

const STEPS = [
  { id: "n2", label: "Read Submission & Normalize COPE", type: "get_info", description: "Read the submission." },
  { id: "n3", label: "Confidence & Mandatory Fields Check", type: "make_decision", description: "Check the fields." },
  { id: "n6a", label: "Fetch Submission Schedule", type: "take_action", description: "Read the schedule from the broker system.", config: { toolName: "fetch_submission", toolServerId: "srv-bridge" } },
  { id: "n6b", label: "Fetch Treaty Terms", type: "take_action", description: "Read the treaty in force.", config: { toolName: "get_treaty_terms", toolServerId: "srv-insurity" } },
  { id: "n6", label: "Evaluate Treaty Limits", type: "expression", description: "Compare the aggregate against the limit.", config: { expression: "**.aggregateTiv > **.limit" } },
  { id: "n7", label: "Carrier Underwriter Approval", type: "expert_approval" },
];

describe("splitConfiguredSteps", () => {
  it("gives every configured step in a merged group its own agent", () => {
    const merged = [{
      name: "Treaty Evaluation Agent",
      description: "Fetches and evaluates.",
      flowStepLabels: ["Fetch Submission Schedule", "Fetch Treaty Terms", "Evaluate Treaty Limits"],
      execution: { kind: "expression", expression: "submissionSchedule.tier1CoastalAggregate > treatyTerms.singleRiskLimit" },
    }];
    const out = splitConfiguredSteps(merged, STEPS);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.flowStepLabels)).toEqual([["Fetch Submission Schedule"], ["Fetch Treaty Terms"], ["Evaluate Treaty Limits"]]);
    // Named for the step, so the split is legible on the canvas and in the run.
    expect(out.map((a) => a.name)).toEqual(["Fetch Submission Schedule", "Fetch Treaty Terms", "Evaluate Treaty Limits"]);
    // Each carries its own step's description, not the group's.
    expect(out[1].description).toBe("Read the treaty in force.");
  });

  it("drops the execution the model invented for the group", () => {
    // It was not written for any one of these steps, and for a configured step
    // the author's own binding is the better evidence.
    const out = splitConfiguredSteps(
      [{ name: "Treaty Evaluation Agent", flowStepLabels: ["Fetch Treaty Terms", "Evaluate Treaty Limits"], execution: { kind: "expression", expression: "wrong.field > other.field" } }],
      STEPS,
    );
    expect(out.every((a) => a.execution === undefined)).toBe(true);
  });

  it("leaves a merge of plain steps exactly as proposed", () => {
    // Folding prose steps together is good judgement, not a defect.
    const agents = [{ name: "COPE Normalization Agent", flowStepLabels: ["Read Submission & Normalize COPE", "Confidence & Mandatory Fields Check"] }];
    expect(splitConfiguredSteps(agents, STEPS)).toEqual(agents);
  });

  it("leaves an agent that already covers one step alone", () => {
    const agents = [{ name: "Treaty Check", flowStepLabels: ["Evaluate Treaty Limits"], execution: { kind: "expression", expression: "a > b" } }];
    expect(splitConfiguredSteps(agents, STEPS)).toEqual(agents);
  });

  it("does not collide with a name the plan already used", () => {
    const out = splitConfiguredSteps(
      [
        { name: "Fetch Treaty Terms", flowStepLabels: ["Carrier Underwriter Approval"] },
        { name: "Treaty Evaluation Agent", flowStepLabels: ["Fetch Treaty Terms", "Evaluate Treaty Limits"] },
      ],
      STEPS,
    );
    const names = out.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is safe on a plan with no flow steps to match", () => {
    const agents = [{ name: "A", flowStepLabels: ["Something Else", "And Another"] }];
    expect(splitConfiguredSteps(agents, [])).toEqual(agents);
    expect(splitConfiguredSteps([], STEPS)).toEqual([]);
  });
});

describe("the split agents, once the flow's connections are derived", () => {
  it("run in the order they were drawn, with the author's gate on the branch", () => {
    // The point of splitting before edge derivation: the flow wires the pieces
    // back up itself, and the branch keeps the condition the author wrote.
    const agents = splitConfiguredSteps(
      [
        { name: "Risk Quality Scoring Agent", flowStepLabels: ["Read Submission & Normalize COPE"] },
        { name: "Treaty Evaluation Agent", flowStepLabels: ["Fetch Submission Schedule", "Fetch Treaty Terms", "Evaluate Treaty Limits"] },
        { name: "Carrier Underwriter Approval Checkpoint", flowStepLabels: ["Carrier Underwriter Approval"] },
      ],
      STEPS,
    );
    const edges = deriveEdgesFromFlow(agents, STEPS, [
      { from: "n2", to: "n6a" },
      { from: "n6a", to: "n6b" },
      { from: "n6b", to: "n6" },
      { from: "n6", to: "n7", condition: "evaluate_treaty_limits.breached == true" },
    ]);
    expect(edges.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "Risk Quality Scoring Agent -> Fetch Submission Schedule",
      "Fetch Submission Schedule -> Fetch Treaty Terms",
      "Fetch Treaty Terms -> Evaluate Treaty Limits",
      "Evaluate Treaty Limits -> Carrier Underwriter Approval Checkpoint",
    ]);
    const branch = edges[3];
    expect(branch.condition).toBe("evaluate_treaty_limits.breached == true");
    // The name the builder actually reads when compiling the rule.
    expect((branch as any).branchCondition).toBe("evaluate_treaty_limits.breached == true");
    expect(branch.type).toBe("conditional");
  });

  it("would have emitted no connector steps at all before the split", () => {
    // The regression this guards: merged, both fetches are inside one agent, so
    // the flow's own connections between them are dropped as internal.
    const edges = deriveEdgesFromFlow(
      [
        { name: "Treaty Evaluation Agent", flowStepLabels: ["Fetch Submission Schedule", "Fetch Treaty Terms", "Evaluate Treaty Limits"] },
        { name: "Carrier Underwriter Approval Checkpoint", flowStepLabels: ["Carrier Underwriter Approval"] },
      ],
      STEPS,
      [{ from: "n6a", to: "n6b" }, { from: "n6b", to: "n6" }, { from: "n6", to: "n7", condition: "x == true" }],
    );
    expect(edges.map((e) => `${e.from} -> ${e.to}`)).toEqual(["Treaty Evaluation Agent -> Carrier Underwriter Approval Checkpoint"]);
  });
});
