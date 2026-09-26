/**
 * What a step in a run is, in the reader's words.
 *
 * The run monitor derived this from a two-valued kind -- gate, or everything
 * else -- so every step that was not an approval read "Agent". A treaty limit
 * compared against a connector's own figures, running no model, in thirty
 * milliseconds, displayed as "Completed · 30ms · Agent".
 *
 * That is wrong in the direction that matters most. Someone looking at a figure
 * and deciding whether to trust it wants to know whether a model produced it or
 * arithmetic did, and this screen is where they look. It also made a 30ms step
 * look like a model call somebody paid for.
 *
 * Kept here rather than in the page so it can be tested directly, and so any
 * other surface that lists steps says the same words about the same node.
 */
export interface StepKindInput {
  /** The monitor's two-valued kind. It stays two-valued: several branches of
   *  that page key off `kind === "gate"`, and a step that is neither gate nor
   *  agent must keep taking the non-gate branch in every one of them. */
  kind: "agent" | "gate";
  /** The blueprint node's type, when the run's node config carries one. */
  nodeType?: string;
}

export function stepKindLabel(step: StepKindInput): string {
  if (step.kind === "gate") return "Approval step";
  switch (step.nodeType) {
    case "expression": return "Calculation";
    case "tool_call": return "System call";
    case "knowledge_base": return "Knowledge lookup";
    case "skill": return "Skill";
    default: return "Agent";
  }
}

/**
 * True for a step that runs without a model, and therefore without cost.
 *
 * A knowledge lookup is deliberately not included: it embeds its query, so it
 * is cheap rather than free, and claiming otherwise on screen would be the same
 * kind of overstatement this function exists to correct.
 */
export function runsWithoutAModel(step: StepKindInput): boolean {
  return step.kind !== "gate" && (step.nodeType === "expression" || step.nodeType === "tool_call");
}
