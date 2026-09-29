/**
 * The name a step's result is stored under in run state.
 *
 * This is a contract, not an implementation detail, which is why it lives in
 * shared/ rather than inside the engine. The moment an author can write a
 * deterministic gate -- `credit_check.approved == true` on an edge -- the key
 * that gate names has to be something they can know while authoring, before
 * anything has been built or run. Rule fields resolve by exact dotted path
 * from the top of state (see server/rule-evaluator.ts), so a key that differs
 * by one character from what the author expected resolves to undefined and
 * BOTH branches of the decision go unsatisfied: the run dead-ends, having
 * spent every step before it.
 *
 * So the rule is: the step's own label, lowercased, non-alphanumerics collapsed
 * to underscores. "Evaluate Treaty Limits" -> evaluate_treaty_limits.
 */
export function stateKeyForLabel(label: string): string {
  return (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * The key a blueprint node's result actually lands under at run time.
 *
 * A node that holds a key uses it. One that holds none is filed by the engine
 * under a slug of its LABEL (dag-execution-engine.ts computeWaves), else its
 * id -- and for an agent drafted from a flow step the label is the name a model
 * chose, not the step's name the author's conditions use. That gap is how a
 * team's branches all went unsatisfied while every surface reported success
 * (live 2026-09-29: "Endorsement Accepted? Agent" wrote
 * endorsement_accepted_agent; the rules read endorsement_accepted). Anything
 * that reasons about what a rule can read must reason about THIS key, not the
 * stored one.
 */
export function effectiveStateKey(node: { id?: string | null; label?: string | null; stateKey?: string | null }): string {
  return String(node.stateKey ?? "").trim() || stateKeyForLabel(node.label ?? "") || String(node.id ?? "").replace(/-/g, "_");
}
