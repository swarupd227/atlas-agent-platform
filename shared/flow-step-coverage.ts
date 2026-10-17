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
/** An authored connection, in either of the two shapes a flow graph uses. */
export interface FlowEdgeLike { from?: string; to?: string; source?: string; target?: string }
const edgeEnds = (e: FlowEdgeLike): [string, string] => [String(e.from ?? e.source ?? ""), String(e.to ?? e.target ?? "")];

/**
 * The pairs of steps that must end up connected in a built team.
 *
 * Not simply the flow's edges: a routing step becomes no node of its own, so an
 * edge that lands on one has to be followed through to the next step that does
 * have a node. A flow drawn trigger -> fetch -> decide -> end should connect
 * fetch to decide and nothing else.
 *
 * `hasNode` answers whether a step id was built as a node. Steps it rejects are
 * walked through, and a cycle among them cannot hang this: each is visited once.
 */
export function connectedStepPairs(
  edges: FlowEdgeLike[],
  hasNode: (stepId: string) => boolean,
): Array<[string, string]> {
  const out = new Map<string, [string, string]>();
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const [from, to] = edgeEnds(e);
    if (!from || !to) continue;
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  for (const from of Array.from(next.keys())) {
    if (!hasNode(from)) continue;
    const seen = new Set<string>([from]);
    const queue = [...(next.get(from) ?? [])];
    while (queue.length) {
      const step = queue.shift()!;
      if (seen.has(step)) continue;
      seen.add(step);
      if (hasNode(step)) { out.set(`${from}->${step}`, [from, step]); continue; }
      // No node of its own: the connection carries on through it.
      queue.push(...(next.get(step) ?? []));
    }
  }
  return Array.from(out.values());
}

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
