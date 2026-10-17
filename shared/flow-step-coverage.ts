/**
 * Which of a flow's steps a plan actually covers.
 *
 * Pure, and deliberately dependency-free. It lives in shared/ rather than
 * beside the proposer because the BUILD has to ask the same question before it
 * writes anything, and importing the proposer to ask it widened the build's
 * module graph far enough to reach optional runtime packages -- a fresh
 * checkout then failed to load the build's own tests over a dependency the
 * question has nothing to do with.
 */

/**
 * Steps that route rather than work.
 *
 * A routing step nobody claims is fine: deriveEdgesFromFlow walks through it.
 */
export const ROUTING_STEP_TYPES = new Set(["trigger", "end", "parallel", "make_decision"]);

/**
 * The steps that do real work and that no agent said it covers.
 *
 * A step that DOES something and that nobody claims is not built at all, and
 * its connections disappear with it. That was silent until the build began
 * refusing on it, and it is how a close shipped without four of its six
 * approval gates.
 */
export function unclaimedWorkSteps(
  agents: Array<{ flowStepLabels?: unknown }>,
  steps: Array<{ label?: string; type?: string }>,
): string[] {
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const claimed = new Set<string>();
  for (const a of agents) {
    if (!Array.isArray(a?.flowStepLabels)) continue;
    for (const l of a.flowStepLabels) claimed.add(norm(l));
  }
  const out: string[] = [];
  for (const s of steps) {
    if (!s?.label) continue;
    if (ROUTING_STEP_TYPES.has(norm(s.type))) continue;
    if (!claimed.has(norm(s.label))) out.push(s.label);
  }
  return out;
}
