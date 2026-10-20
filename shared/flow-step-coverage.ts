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
/** One thing wrong with what an agent says it covers. */
export interface ClaimProblem { agent: string; claim: string; problem: string }

/**
 * Claims that name something they should not.
 *
 * Coverage counts claims; nothing checked a claim was plausible. Three ways it
 * goes wrong, all silent today:
 *
 * - A claim on a trigger or an end step. Those are markers: a worker attached
 *   to one is attached to a step that does nothing, and whatever it was drafted
 *   to do is not being done by anybody. Measured on the licence journey, where
 *   the agent that writes the decision claimed "A licence request arrives".
 * - Two agents on one step. The build takes the last and drops the first
 *   without saying so.
 * - A claim naming no step in the flow at all — a near-miss or a typo, which
 *   today reads exactly like a worker that claimed nothing.
 *
 * Reported, never corrected. Choosing which step a mis-claimed agent really
 * meant is a judgement, and a builder that guesses hides the defect instead of
 * the author fixing it.
 */
export function implausibleClaims(
  agents: Array<{ name?: string; flowStepLabels?: unknown }>,
  steps: Array<{ label?: string; type?: string }>,
): ClaimProblem[] {
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const typeByLabel = new Map<string, string>();
  for (const s of steps) if (s?.label) typeByLabel.set(norm(s.label), norm(s.type));

  const out: ClaimProblem[] = [];
  const claimedBy = new Map<string, string[]>();
  for (const a of agents) {
    const name = String(a?.name ?? "an agent");
    const labels = Array.isArray(a?.flowStepLabels) ? a.flowStepLabels.filter((l): l is string => typeof l === "string") : [];
    for (const label of labels) {
      const key = norm(label);
      if (!typeByLabel.has(key)) {
        out.push({ agent: name, claim: label, problem: `names no step in this flow` });
        continue;
      }
      const type = typeByLabel.get(key)!;
      if (type === "trigger" || type === "end") {
        out.push({ agent: name, claim: label, problem: `is a ${type}, which is a marker rather than a step that does anything` });
        continue;
      }
      claimedBy.set(key, [...(claimedBy.get(key) ?? []), name]);
    }
  }
  for (const [key, names] of Array.from(claimedBy.entries())) {
    if (names.length < 2) continue;
    const label = steps.find((s) => norm(s.label) === key)?.label ?? key;
    out.push({ agent: names.join(" and "), claim: label, problem: `is claimed by ${names.length} agents, and only the last would be built` });
  }
  return out;
}

/** An authored connection, in either of the two shapes a flow graph uses. */
export interface FlowEdgeLike { from?: string; to?: string; source?: string; target?: string; condition?: string | null; label?: string | null }
const edgeEnds = (e: FlowEdgeLike): [string, string] => [String(e.from ?? e.source ?? ""), String(e.to ?? e.target ?? "")];

/** The branch a connection carries once the steps with no node are walked through. */
export interface CarriedBranch { condition?: string; label?: string }

/**
 * The same carry rule as deriveEdgesFromFlow (server/team-proposal.ts): a
 * branch's own condition and label replace the ones on the way in, because the
 * label into a decision names a hop that no longer exists.
 */
function carryBranch(e: FlowEdgeLike, prev: CarriedBranch): CarriedBranch {
  const own = String(e.condition ?? "").trim();
  const label = String(e.label ?? "").trim();
  const condition = own || prev.condition;
  const name = own ? (label || own) : (label || prev.label);
  return { ...(condition ? { condition } : {}), ...(name ? { label: name } : {}) };
}

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
): Array<[string, string, CarriedBranch]> {
  const out = new Map<string, [string, string, CarriedBranch]>();
  const next = new Map<string, FlowEdgeLike[]>();
  for (const e of edges) {
    const [from, to] = edgeEnds(e);
    if (!from || !to) continue;
    next.set(from, [...(next.get(from) ?? []), e]);
  }
  for (const from of Array.from(next.keys())) {
    if (!hasNode(from)) continue;
    const seen = new Set<string>([from]);
    const queue: Array<[string, CarriedBranch]> = (next.get(from) ?? []).map((e) => [edgeEnds(e)[1], carryBranch(e, {})]);
    while (queue.length) {
      const [step, branch] = queue.shift()!;
      if (seen.has(step)) continue;
      seen.add(step);
      if (hasNode(step)) { out.set(`${from}->${step}`, [from, step, branch]); continue; }
      // No node of its own: the connection carries on through it, and so does
      // the branch -- a decision's condition is what decides this hop.
      for (const e of next.get(step) ?? []) queue.push([edgeEnds(e)[1], carryBranch(e, branch)]);
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
