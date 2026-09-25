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
