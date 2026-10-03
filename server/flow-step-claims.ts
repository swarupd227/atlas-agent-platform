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
 * So a missing claim, or one that names no step, is inferred from two things
 * the proposal does carry. First the agent's name: an agent whose name covers
 * enough of a step's words covers that step. Then the proposal's own edges:
 * the model repeats the flow's branch conditions and labels on the edges it
 * draws between its agents, so an edge carrying the flow's "fraud suspected"
 * condition names, at each end, the step that agent covers, even when the
 * agent is called "SIU Referral Agent" and the step "Refer to Special
 * Investigations". Only one step per agent and one agent per step, and a tie
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
  role?: string;
  flowStepLabels?: unknown;
}

/** A connection as the flow draws it (step ids) or as the proposal draws it (agent names). */
export interface ClaimEdge {
  from?: unknown;
  to?: unknown;
  condition?: unknown;
  branchCondition?: unknown;
  label?: unknown;
}

export interface ClaimSources {
  /** The flow's own connections, between step ids. */
  flowEdges?: ClaimEdge[];
  /** The proposal's connections, between agent names (or roles). */
  proposalEdges?: ClaimEdge[];
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
 * A condition as written by the author and as the model repeated it, read as
 * one: `If classify_claim_type == 'Fraud suspicion'` and
 * `classify_claim_type == "Fraud suspicion"` are the same condition.
 */
export function conditionKey(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/^\s*(?:if|when|where|only\s+if)\s+/, "")
    .replace(/[‘’“”`]/g, "'")
    .replace(/"/g, "'")
    .replace(/\s*(==|!=|>=|<=|>|<|=)\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The agents with a step claimed for each one that had none, plus what was
 * inferred, so the caller can say so. An agent that already names a real step
 * is left as it is; a claim that names no step counts as none.
 */
export function inferStepClaims<T extends StepClaimer>(
  agents: T[],
  steps: ClaimableStep[],
  sources: ClaimSources = {},
): { agents: T[]; inferred: Array<{ agent: string; step: string; by: "name" | "edge" }> } {
  const labels = new Map<string, string>();
  const labelOfStepId = new Map<string, string>();
  for (const s of steps) {
    if (!s?.label) continue;
    labels.set(norm(s.label), String(s.label));
    if (s.id !== undefined && s.id !== null) labelOfStepId.set(String(s.id), norm(s.label));
  }
  const explicit = agents.map((a) =>
    Array.isArray(a?.flowStepLabels) ? a.flowStepLabels.filter((l): l is string => typeof l === "string" && labels.has(norm(l))) : [],
  );
  const claimed = new Set<string>();
  for (const ls of explicit) for (const l of ls) claimed.add(norm(l));

  // pick: agent index -> the step key it was given ("" = settled with none).
  const pick = new Map<number, string>();
  const taken = new Set<string>(claimed);
  const inferred: Array<{ agent: string; step: string; by: "name" | "edge" }> = [];
  const open = (i: number) => explicit[i].length === 0 && !pick.has(i) && !!agents[i]?.name;

  // 1. Names. Every (open agent, unclaimed step) pair above the bar, best first.
  const pairs: Array<{ i: number; key: string; score: number }> = [];
  agents.forEach((a, i) => {
    if (!open(i)) return;
    for (const key of Array.from(labels.keys())) {
      if (taken.has(key)) continue;
      const score = nameCoverage(a.name, key);
      if (score >= CLAIM_COVERAGE) pairs.push({ i, key, score });
    }
  });
  pairs.sort((x, y) => y.score - x.score);
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
    inferred.push({ agent: String(agents[p.i].name), step: labels.get(p.key)!, by: "name" });
  });

  // 2. Edges. A proposal edge whose condition (or, failing that, label) is one
  // flow edge's names the steps at both ends. The ties settled above stay
  // settled: an edge can claim for an agent the names left open, not reopen one.
  const flowEdges = Array.isArray(sources.flowEdges) ? sources.flowEdges : [];
  const proposalEdges = Array.isArray(sources.proposalEdges) ? sources.proposalEdges : [];
  if (flowEdges.length && proposalEdges.length) {
    const agentIndex = new Map<string, number>();
    agents.forEach((a, i) => {
      for (const n of [a?.name, a?.role]) {
        const key = norm(n);
        if (key && !agentIndex.has(key)) agentIndex.set(key, i);
      }
    });
    const flowBy = (kind: "condition" | "label") => {
      const m = new Map<string, ClaimEdge[]>();
      for (const e of flowEdges) {
        const key = kind === "condition" ? conditionKey(e?.condition) : norm(e?.label);
        if (!key) continue;
        const list = m.get(key);
        if (list) list.push(e); else m.set(key, [e]);
      }
      return m;
    };
    const byCondition = flowBy("condition");
    const byLabel = flowBy("label");
    const unclaimedOpen = (i: number | undefined) => i !== undefined && (open(i) || pick.get(i) === "");
    const claimFromEdge = (i: number | undefined, stepId: unknown) => {
      const key = labelOfStepId.get(String(stepId ?? ""));
      if (!key || i === undefined || taken.has(key) || !unclaimedOpen(i)) return;
      pick.set(i, key);
      taken.add(key);
      inferred.push({ agent: String(agents[i].name), step: labels.get(key)!, by: "edge" });
    };
    for (const pe of proposalEdges) {
      const cond = conditionKey(pe?.branchCondition ?? pe?.condition);
      let matches = cond ? byCondition.get(cond) ?? [] : [];
      if (matches.length === 0) {
        const label = norm(pe?.label);
        matches = label ? byLabel.get(label) ?? [] : [];
      }
      // One flow edge, or nothing: the same condition on two branches says nothing about which is which.
      if (matches.length !== 1) continue;
      const fe = matches[0];
      claimFromEdge(agentIndex.get(norm(pe?.to)), fe.to);
      claimFromEdge(agentIndex.get(norm(pe?.from)), fe.from);
    }
  }

  const out = agents.map((a, i) => {
    const key = pick.get(i);
    if (!key) return a;
    return { ...a, flowStepLabels: [labels.get(key)!] };
  });
  return { agents: out, inferred };
}
