/**
 * Which authored step each proposed agent covers, when the proposal does not say.
 *
 * Everything that turns a drawn flow into a team hangs on one field the
 * drafting model is asked to echo: `flowStepLabels`, the step each agent
 * covers. The flow's connections become the team's edges through it, a step
 * the author configured (an expression, a tool, a classify or score decision)
 * becomes the node that configuration describes through it, and the blueprint
 * node's correlation to its step, which is what lets a later sync find it, is
 * written from it.
 *
 * The model does not always echo it. Live 2026-10-03: a drafted team named
 * every agent after its step ("Summarise the Loss Agent", "Score Severity
 * Agent") and declared no flowStepLabels at all. No edge was derived, no
 * authored step reached the build, two classify and score decisions were
 * built as agents that re-described them, no node carried its step, and the
 * sync could only offer to rebuild the whole team. The names it chose carried
 * the answer the whole time.
 *
 * So a missing claim, or one that names no step, is inferred from the agent's
 * name: an agent whose name covers enough of a step's words covers that step.
 * Only one step per agent and one agent per step, best match first, and a tie
 * claims nothing, because a wrong claim wires a rule to the wrong step, which
 * is worse than the honest warning an unclaimed step already produces.
 */
export interface ClaimableStep {
  id?: string;
  label?: string;
  type?: string;
}

export interface StepClaimer {
  name?: string;
  flowStepLabels?: unknown;
}

/** How much of a step's name an agent's name has to cover to be taken as covering the step. */
export const CLAIM_COVERAGE = 0.6;

const STOP = new Set(["agent", "the", "a", "an", "and", "of", "for", "to", "in", "on", "at", "by", "with", "step"]);
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: unknown) => norm(s).split(" ").filter((w) => w && !STOP.has(w));

/**
 * The same word in two forms: summarise and summarization, classify and
 * classifier, score and scoring, assign and assignment. A shared start of
 * four letters that is the whole of the shorter word, or of at least four
 * letters between two words of five or more.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  const shorter = Math.min(a.length, b.length);
  return p >= 4 && (p === shorter || (a.length >= 5 && b.length >= 5));
}

/** The share of the step's words the agent's name carries, 0 to 1. */
export function nameCoverage(agentName: unknown, stepLabel: unknown): number {
  const step = words(stepLabel);
  const agent = words(agentName);
  if (step.length === 0 || agent.length === 0) return 0;
  let hit = 0;
  for (const w of step) if (agent.some((v) => sameWord(v, w))) hit++;
  return hit / step.length;
}

/**
 * The agents with a step claimed for each one that had none, plus what was
 * inferred, so the caller can say so. An agent that already names a real step
 * is left as it is; a claim that names no step counts as none.
 */
export function inferStepClaims<T extends StepClaimer>(
  agents: T[],
  steps: ClaimableStep[],
): { agents: T[]; inferred: Array<{ agent: string; step: string }> } {
  const labels = new Map<string, string>();
  for (const s of steps) if (s?.label) labels.set(norm(s.label), String(s.label));
  const explicit = agents.map((a) =>
    Array.isArray(a?.flowStepLabels) ? a.flowStepLabels.filter((l): l is string => typeof l === "string" && labels.has(norm(l))) : [],
  );
  const claimed = new Set<string>();
  for (const ls of explicit) for (const l of ls) claimed.add(norm(l));

  const pairs: Array<{ i: number; key: string; score: number }> = [];
  agents.forEach((a, i) => {
    if (explicit[i].length > 0 || !a?.name) return;
    for (const key of Array.from(labels.keys())) {
      if (claimed.has(key)) continue;
      const score = nameCoverage(a.name, key);
      if (score >= CLAIM_COVERAGE) pairs.push({ i, key, score });
    }
  });
  pairs.sort((x, y) => y.score - x.score);

  const pick = new Map<number, string>();
  const taken = new Set<string>();
  pairs.forEach((p, k) => {
    if (pick.has(p.i) || taken.has(p.key)) return;
    // Two steps this agent covers equally well, or two agents covering this
    // step equally well: ambiguous, and claimed by nobody.
    const tie = pairs.some((q, j) => j !== k && q.score === p.score && !pick.has(q.i) && !taken.has(q.key) && (q.i === p.i || q.key === p.key));
    if (tie) {
      pick.set(p.i, "");
      return;
    }
    pick.set(p.i, p.key);
    taken.add(p.key);
  });

  const inferred: Array<{ agent: string; step: string }> = [];
  const out = agents.map((a, i) => {
    const key = pick.get(i);
    if (!key) return a;
    const label = labels.get(key)!;
    inferred.push({ agent: String(a.name), step: label });
    return { ...a, flowStepLabels: [label] };
  });
  return { agents: out, inferred };
}
