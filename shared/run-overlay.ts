/**
 * A run, painted onto the flow it ran.
 *
 * The team-graph editor draws the blueprint and the run monitor draws the
 * timeline, and neither shows the other: the editor's node cards carry one
 * "last run" line, and the monitor has no graph. This derives, from a stored
 * run and the blueprint's nodes and edges, the state of every step and the
 * branch every link did or did not carry -- so the editor can show a run on
 * the graph (the path taken in green, the rest dimmed) and the monitor can
 * say which option a decision step chose and how sure it was.
 *
 * Pure, so it is tested directly. A decision edge is taken when the source's
 * recorded choice names it, by the edge's label or the target's label: the
 * same match the engine makes (decisionEdgeSatisfied in
 * server/dag-execution-engine.ts), through the same slug.
 */
import { stateKeyForLabel } from "./state-key";

export type OverlayState = "completed" | "failed" | "skipped" | "running" | "waiting" | "pending";

export interface OverlayNodeResult {
  nodeId: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
  output?: unknown;
}
export interface OverlayRunInput {
  id: string;
  status: string;
  waveResults?: Array<{ waveNumber: number; nodes: OverlayNodeResult[] }> | null;
}
export interface OverlayNodeInput { id: string; label: string; nodeType?: string | null }
export interface OverlayEdgeInput {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string | null;
  evaluationMode?: string | null;
}
export interface OverlayPlanInput { waves?: Array<{ wave_number: number; nodes: string[] }> | null }

/** What a decision step recorded (executeDecisionNode's output under the step's state key). */
export interface DecisionOutcome {
  choice: string;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  question?: string;
  options?: string[];
  engine?: string;
  model?: string;
  fallbackReason?: string;
  routedToGate?: boolean;
}

export interface OverlayNode {
  state: OverlayState;
  durationMs?: number | null;
  error?: string | null;
  decision?: DecisionOutcome | null;
}
export interface OverlayEdge {
  /** The run went down this link: its source finished and its target ran (or, for a decision, was chosen). */
  taken: boolean;
  /** For a branch out of a decision step: the probability the step gave this option. */
  probability?: number;
}
export interface RunOverlay {
  runId: string;
  runStatus: string;
  /** Still changing: the overlay should be rebuilt as the run is polled. */
  live: boolean;
  nodes: Record<string, OverlayNode>;
  edges: Record<string, OverlayEdge>;
}

const LIVE_STATUSES = new Set(["pending", "running", "waiting_approval"]);

/** The decision recorded in a step's output: the first value that carries a string `choice`. */
export function decisionOutcomeOf(output: unknown): DecisionOutcome | null {
  if (!output || typeof output !== "object") return null;
  for (const v of Object.values(output as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.choice !== "string" || !o.choice.trim()) continue;
    const probabilities = o.probabilities && typeof o.probabilities === "object"
      ? Object.fromEntries(Object.entries(o.probabilities as Record<string, unknown>).filter(([, p]) => typeof p === "number")) as Record<string, number>
      : null;
    return {
      choice: o.choice,
      probabilities,
      confidence: typeof o.confidence === "number" ? o.confidence : null,
      ...(typeof o.question === "string" ? { question: o.question } : {}),
      ...(Array.isArray(o.options) ? { options: o.options.filter((x): x is string => typeof x === "string") } : {}),
      ...(typeof o.engine === "string" ? { engine: o.engine } : {}),
      ...(typeof o.model === "string" ? { model: o.model } : {}),
      ...(typeof o.fallbackReason === "string" ? { fallbackReason: o.fallbackReason } : {}),
      ...(o.routedToGate === true ? { routedToGate: true } : {}),
    };
  }
  return null;
}

/** Whether a choice names this branch: by the link's label, or the target's label when the link has none. */
export function branchMatchesChoice(choice: string, edgeLabel: string | null | undefined, targetLabel: string | null | undefined): boolean {
  const chosen = stateKeyForLabel(choice);
  if (!chosen) return false;
  return (!!edgeLabel && stateKeyForLabel(edgeLabel) === chosen) || (!!targetLabel && stateKeyForLabel(targetLabel) === chosen);
}

/** The probability a decision gave the option this branch carries, under whatever spelling the model used. */
export function branchProbability(outcome: DecisionOutcome, edgeLabel: string | null | undefined, targetLabel: string | null | undefined): number | undefined {
  if (!outcome.probabilities) return undefined;
  for (const [option, p] of Object.entries(outcome.probabilities)) {
    if (branchMatchesChoice(option, edgeLabel, targetLabel)) return p;
  }
  return undefined;
}

export function buildRunOverlay(
  run: OverlayRunInput,
  nodes: OverlayNodeInput[],
  edges: OverlayEdgeInput[],
  plan?: OverlayPlanInput | null,
): RunOverlay {
  const labelOf = new Map(nodes.map((n) => [n.id, n.label] as const));
  const typeOf = new Map(nodes.map((n) => [n.id, n.nodeType ?? undefined] as const));
  const out: Record<string, OverlayNode> = {};

  let lastWave = 0;
  for (const w of run.waveResults ?? []) {
    lastWave = Math.max(lastWave, w.waveNumber);
    for (const n of w.nodes) {
      const state: OverlayState = n.status === "failed" ? "failed" : n.status === "skipped" ? "skipped" : "completed";
      // Only a decision step's output is read as a decision: an agent may well
      // write a `choice` field of its own, and that is prose, not a branch.
      const isDecision = typeOf.get(n.nodeId) === "decision";
      out[n.nodeId] = { state, durationMs: n.durationMs ?? null, error: n.error ?? null, decision: isDecision ? decisionOutcomeOf(n.output) : null };
    }
  }

  const live = LIVE_STATUSES.has(run.status);
  if (live && plan?.waves?.length) {
    const current = lastWave + 1;
    for (const w of plan.waves) {
      for (const id of w.nodes) {
        if (out[id]) continue;
        if (w.wave_number !== current) { out[id] = { state: "pending" }; continue; }
        // A run parked at an approval is not doing anything: the gate waits and
        // the rest of its wave has not started.
        if (run.status === "waiting_approval") out[id] = { state: typeOf.get(id) === "edge_gate" ? "waiting" : "pending" };
        else out[id] = { state: "running" };
      }
    }
  }
  for (const n of nodes) if (!out[n.id]) out[n.id] = { state: "pending" };

  const edgeStates: Record<string, OverlayEdge> = {};
  for (const e of edges) {
    const src = out[e.sourceNodeId];
    const dst = out[e.targetNodeId];
    const srcDone = src?.state === "completed";
    const dstRan = !!dst && dst.state !== "pending" && dst.state !== "skipped";
    let taken = srcDone && dstRan;
    let probability: number | undefined;
    if (src?.decision) {
      const targetLabel = labelOf.get(e.targetNodeId);
      taken = srcDone && branchMatchesChoice(src.decision.choice, e.label, targetLabel);
      probability = branchProbability(src.decision, e.label, targetLabel);
    }
    edgeStates[e.id] = { taken, ...(probability !== undefined ? { probability } : {}) };
  }

  return { runId: run.id, runStatus: run.status, live, nodes: out, edges: edgeStates };
}
