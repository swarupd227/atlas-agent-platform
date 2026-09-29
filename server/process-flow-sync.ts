/**
 * Syncing a changed process flow into the automation built from it.
 *
 * Revising a flow and rebuilding the team are two different acts, and until now
 * only the Studio could do the second one: the reconciliation lived inside
 * POST /api/outcomes/:id/process-flow/sync-to-automation, outcome-scoped, and it
 * reported what it had changed only AFTER changing it. So a person who said
 * "the treaty limit is 50 million, not 40" in a conversation got a revised
 * drawing and an automation that still ran the old number -- the worst kind of
 * gap, because it looks like it worked.
 *
 * This module is that reconciliation, moved out whole, with one thing added:
 * planFlowSync computes the same diff WITHOUT writing anything, so a confirm
 * card can say which steps are added, changed and removed, and which agents are
 * superseded, before any of it happens.
 *
 * Two properties are worth stating because they are what make the diff safe:
 *
 * - Correlation is by a persisted `sourceProcessNodeId` on each blueprint node,
 *   never by matching labels. A blueprint whose nodes carry none cannot be
 *   diffed at all, and says so (`legacy_blueprint`) rather than guessing.
 * - A blueprint where only SOME process nodes correlate cannot be diffed
 *   either: the un-correlated ones would be left in place while their steps
 *   were re-added beside them, quietly doubling the team. Partial correlation is
 *   therefore treated the same as none.
 */
import { storage } from "./storage";
import { draftSingleAgent, resolveOntologyTags } from "./routes/helpers";
import { HUMAN_CHECKPOINT_NODE_TYPES, STRUCTURAL_NODE_TYPES, stepCorrelation, stepUnchanged } from "@shared/process-flow-correlation";
import { backEdgeKeys } from "@shared/graph-cycles";
import { edgeRuleForCondition } from "@shared/condition-to-rule";
import { rewriteStateKeyReferences } from "@shared/rule-fields";
import { effectiveStateKey, stateKeyForLabel } from "@shared/state-key";
import { isCurrentReworkRule, REWORK_REQUESTED_RULE } from "@shared/rework-rule";
import { checkBlueprintInvariants, type BlueprintCheck } from "./blueprint-invariants";
import type { ProcessFlowGraph, ProcessNode } from "@shared/process-flow";
import { classifyStep } from "@shared/flow-execution-kind";
import { getDecisionSettings } from "./decision-settings";

/**
 * Whether a step of this flow becomes a decision node: a make_decision step
 * with two or more labelled branches, when the platform flag or the step's own
 * config says so. The same classifier the build and the compiler use.
 */
async function decisionStepPredicate(graph: ProcessFlowGraph): Promise<(pn: ProcessNode) => boolean> {
  const decisionKind = (await getDecisionSettings().catch(() => null))?.stepKind ?? false;
  return (pn) => classifyStep(pn, { outgoingEdges: graph.edges.filter((e) => e.from === pn.id), decisionKind }) === "decision";
}

/**
 * A step whose KIND changed -- an agent that should now be a decision node, or
 * the reverse -- is a changed step even when its words did not change, or the
 * flag would never reach an existing team. Moved from `unchanged` to `changed`
 * so the ordinary supersede-and-rebuild path handles it.
 */
function promoteKindChanges(diff: Diff, graph: ProcessFlowGraph, isDecision: (pn: ProcessNode) => boolean): void {
  const keep: any[] = [];
  for (const existing of diff.unchanged) {
    const pn = graph.nodes.find((n) => n.id === (existing.config as any)?.sourceProcessNodeId);
    if (pn && isDecision(pn) !== (existing.nodeType === "decision")) {
      diff.changed.push(pn);
      diff.changedOldNodes.push(existing);
    } else {
      keep.push(existing);
    }
  }
  diff.unchanged = keep;
}

export { HUMAN_CHECKPOINT_NODE_TYPES, STRUCTURAL_NODE_TYPES };

/** The correlation a blueprint node carries for the step it came from. */
const processNodeConfig = (n: ProcessNode) => stepCorrelation(n as any);

/**
 * The key a step's result lands under: the step's own name (shared/state-key.ts),
 * which is what an author writes in a condition -- "endorsement_accepted.approved".
 *
 * Every node the sync writes gets it, whatever kind it is. An agent node used
 * to get none, so the engine filed its result under a slug of the name a model
 * drafted for the agent ("Endorsement Accepted? Agent" -> endorsement_accepted_agent)
 * and the author's rules, reading endorsement_accepted, read nothing: both
 * branches unsatisfied, every later step skipped, sync and deploy green (live
 * 2026-09-29). Expression, sub-flow and decision nodes got the step's ID, which
 * no author could know either.
 */
const stepStateKey = (pn: ProcessNode) => stateKeyForLabel(pn.label ?? "") || pn.id.replace(/-/g, "_");

/** A step whose result key changes under a sync, and the connections that read the old one. */
export interface StateKeyRename {
  step: string;
  from: string;
  to: string;
  connections: string[];
}

/**
 * Steps whose result key moves under this sync: a changed step whose old row
 * filed under another key (renamed, or keyed by an older convention), and a row
 * left in place that holds no key at all -- which ran under a slug of its
 * label -- now given the step's own. Read from the rows, so the plan and the
 * apply see the same moves.
 */
function stateKeyMoves(diff: Diff): Array<{ pn: ProcessNode; row: any; from: string; to: string }> {
  const moves: Array<{ pn: ProcessNode; row: any; from: string; to: string }> = [];
  for (const pn of diff.changed) {
    const row = diff.byProcessNodeId.get(pn.id);
    if (!row) continue;
    const from = effectiveStateKey(row);
    const to = stepStateKey(pn);
    if (from !== to) moves.push({ pn, row, from, to });
  }
  for (const row of diff.unchanged) {
    if (String(row.stateKey ?? "").trim()) continue;
    const pn = diff.runNodes.find((n) => n.id === (row.config as any)?.sourceProcessNodeId);
    if (!pn) continue;
    const from = effectiveStateKey(row);
    const to = stepStateKey(pn);
    if (from !== to) moves.push({ pn, row, from, to });
  }
  return moves;
}

/** `"From step" → "To step"`, by the flow's labels, for a card or a summary. */
function pairTextFor(diff: Diff): (from: string, to: string) => string {
  const labelFor = (pnId: string) =>
    diff.runNodes.find((n) => n.id === pnId)?.label ?? (diff.byProcessNodeId.get(pnId) ? labelOf(diff.byProcessNodeId.get(pnId)) : pnId);
  return (from, to) => `"${labelFor(from)}" → "${labelFor(to)}"`;
}

/**
 * What a sync would do about moved keys, without doing it: the moves, and for
 * each the connections whose condition or rule names the old key -- the ones
 * the apply rewrites. The same function feeds the plan's card and the apply's
 * summary, so the card cannot promise a rewrite the apply does not make.
 */
function planStateKeyRenames(graph: ProcessFlowGraph, diff: Diff, existingEdges: any[]): StateKeyRename[] {
  const moves = stateKeyMoves(diff);
  if (moves.length === 0) return [];
  const renames = new Map(moves.map((m) => [m.from, m.to] as const));
  const out: StateKeyRename[] = moves.map((m) => ({ step: m.pn.label, from: m.from, to: m.to, connections: [] }));
  const pairText = pairTextFor(diff);
  const note = (rewrote: string[], text: string) => {
    for (const from of rewrote) {
      const r = out.find((o) => o.from === from);
      if (r && !r.connections.includes(text)) r.connections.push(text);
    }
  };
  // The flow's own conditions, which the apply writes onto new connections …
  const { forward } = desiredConnections(graph, diff.runNodeIds, diff.runNodes);
  for (const e of forward) note(rewriteStateKeyReferences({ condition: e.condition, renames }).rewrote, pairText(e.from, e.to));
  // … and the rules already on the team's connections, which stay and are rewritten in place.
  const orchestratorId = diff.orchestratorNode?.id;
  for (const e of existingEdges) {
    if (e.sourceNodeId === orchestratorId || e.targetNodeId === orchestratorId) continue;
    const s = (diff.existingProcessNodes.find((n) => n.id === e.sourceNodeId)?.config as any)?.sourceProcessNodeId;
    const t = (diff.existingProcessNodes.find((n) => n.id === e.targetNodeId)?.config as any)?.sourceProcessNodeId;
    if (!s || !t) continue;
    note(rewriteStateKeyReferences({ condition: e.condition, rule: e.rule, renames }).rewrote, pairText(s, t));
  }
  return out;
}

export interface SyncTarget {
  /** The flow as it is drawn now. */
  graph: ProcessFlowGraph;
  flowName: string;
  /** The team agent the flow was built into. */
  teamAgent: { id: string; name: string; blueprintId?: string | null; industry?: string | null; outcomeId?: string | null; organizationId?: string | null };
  /** Set when the flow belongs to an outcome, so agents created here join it too. */
  outcomeId?: string | null;
}

export type SyncBlock =
  | { kind: "no_steps"; message: string }
  | { kind: "no_blueprint"; message: string }
  | { kind: "run_in_flight"; message: string; runId: string; runStatus: string }
  | { kind: "legacy_blueprint"; message: string };

export interface SyncPlan {
  team: { id: string; name: string };
  blueprintId: string | null;
  /** Steps whose blueprint node is left exactly as it is. */
  unchanged: number;
  changed: string[];
  added: string[];
  removed: string[];
  /** Agents that stop being part of the team, by the step they came from. */
  supersedes: Array<{ label: string; agentId: string; agentName: string }>;
  /**
   * How the connections differ, which a step-by-step diff cannot see. A flow
   * whose steps are all unchanged can still have had four conditions removed,
   * and that has to be syncable -- and visible on the card before it happens.
   */
  connections: { added: string[]; removed: string[]; changed: string[]; loopsAdded: string[]; loopsRemoved: string[] };
  /**
   * Steps whose result key moves, and the connections that read the old key
   * and are rewritten. A renamed step's conditions in the FLOW still say the
   * old name; the card says so, because the next change to that step would
   * bring it back.
   */
  stateKeyRenames: StateKeyRename[];
  /** How many agents a model will have to write from scratch. */
  drafts: number;
  /** This plan replaces every process node, because none could be correlated. */
  rebuild: boolean;
  /** When set, applying as asked is refused; `legacy_blueprint` can be forced. */
  block?: SyncBlock;
}

interface Diff {
  runNodes: ProcessNode[];
  runNodeIds: Set<string>;
  byProcessNodeId: Map<string, any>;
  existingProcessNodes: any[];
  orchestratorNode: any | undefined;
  unchanged: any[];
  changed: ProcessNode[];
  added: ProcessNode[];
  removedNodes: any[];
  changedOldNodes: any[];
  /** Process nodes carrying no correlation key at all. */
  uncorrelated: any[];
}

function diffFlowAgainstBlueprint(graph: ProcessFlowGraph, existingNodes: any[], forceFullRebuild: boolean): Diff {
  const orchestratorNode = existingNodes.find((n) => (n.config as any)?.role === "orchestrator");
  const existingProcessNodes = existingNodes.filter((n) => n.id !== orchestratorNode?.id);
  const uncorrelated = existingProcessNodes.filter((n) => !(n.config as any)?.sourceProcessNodeId);

  const runNodes = graph.nodes.filter((n) => !STRUCTURAL_NODE_TYPES.has(n.type));
  const runNodeIds = new Set(runNodes.map((n) => n.id));

  const byProcessNodeId = new Map<string, any>();
  if (!forceFullRebuild) {
    for (const n of existingProcessNodes) {
      const srcId = (n.config as any)?.sourceProcessNodeId;
      if (srcId) byProcessNodeId.set(srcId, n);
    }
  }

  const unchanged: any[] = [];
  const changed: ProcessNode[] = [];
  const added: ProcessNode[] = [];
  for (const pn of runNodes) {
    const existing = byProcessNodeId.get(pn.id);
    if (!existing) { added.push(pn); continue; }
    if (stepUnchanged(existing.config, pn as any)) unchanged.push(existing);
    else changed.push(pn);
  }

  // forceFullRebuild deliberately leaves byProcessNodeId empty (nothing
  // correlates), so "removed" there means every existing process node, not
  // "nodes byProcessNodeId knows about that vanished" -- the latter would
  // silently leave every legacy node in place forever.
  const removedNodes = forceFullRebuild
    ? existingProcessNodes
    : Array.from(byProcessNodeId.entries()).filter(([pnId]) => !runNodeIds.has(pnId)).map(([, node]) => node);

  // A "changed" node's old blueprint row is mechanically identical to a removed
  // one -- deleted, its agent superseded, then rebuilt fresh below. New identity
  // for the new role, not an in-place prompt rewrite, so each agent's own trace
  // and audit history keeps meaning what it says.
  const changedOldNodes = changed.map((pn) => byProcessNodeId.get(pn.id)).filter((n): n is any => !!n);

  return { runNodes, runNodeIds, byProcessNodeId, existingProcessNodes, orchestratorNode, unchanged, changed, added, removedNodes, changedOldNodes, uncorrelated };
}

const labelOf = (node: any) => (node.config as any)?.sourceLabel || node.label;

/**
 * What the flow says the team's connections should be: ordinary edges, and loops
 * expressed as revision rules rather than edges.
 *
 * One function, used by the plan and by the apply. The whole point of this module
 * is that the card cannot describe something different from what then happens, and
 * a second copy of this decision is exactly how that drifts -- it is what let the
 * apply write a loop as an edge while the plan said "nothing to sync".
 */
function desiredConnections(graph: ProcessFlowGraph, runNodeIds: Set<string>, runNodes: ProcessNode[]) {
  const runEdges = graph.edges.filter((e) => runNodeIds.has(e.from) && runNodeIds.has(e.to));
  const loopKeys = backEdgeKeys(runNodes.map((n) => n.id), runEdges.map((e) => ({ from: e.from, to: e.to })));
  const loops = new Map<string, { to: string; maxRounds: number }>();
  for (const e of runEdges) {
    if (loopKeys.has(`${e.from}::${e.to}`)) {
      loops.set(e.from, { to: e.to, maxRounds: Math.min(3, Math.max(1, Number(e.maxRounds) || 1)) });
    }
  }
  return { runEdges, loopKeys, loops, forward: runEdges.filter((e) => !loopKeys.has(`${e.from}::${e.to}`)) };
}

/**
 * How the team's connections differ from the flow's, in the words a card can use.
 *
 * Without this the plan compared STEPS only, so removing four edge conditions from
 * a flow was answered with "already matches the flow step for step, nothing to
 * sync" while the automation still carried all four -- the same drift this module
 * exists to close, with a hole in it (live 2026-09-27).
 */
function planConnections(graph: ProcessFlowGraph, diff: Diff, existingEdges: any[], isDecision: (pn: ProcessNode) => boolean = () => false): SyncPlan["connections"] {
  const { forward, loops } = desiredConnections(graph, diff.runNodeIds, diff.runNodes);
  const labelFor = (pnId: string) =>
    diff.runNodes.find((n) => n.id === pnId)?.label ?? (diff.byProcessNodeId.get(pnId) ? labelOf(diff.byProcessNodeId.get(pnId)) : pnId);
  const pairText = (from: string, to: string) => `"${labelFor(from)}" → "${labelFor(to)}"`;

  const orchestratorId = diff.orchestratorNode?.id;
  const byPair = new Map<string, any>();
  for (const e of existingEdges) {
    if (e.sourceNodeId === orchestratorId || e.targetNodeId === orchestratorId) continue;
    const src = diff.existingProcessNodes.find((n) => n.id === e.sourceNodeId);
    const tgt = diff.existingProcessNodes.find((n) => n.id === e.targetNodeId);
    const s = (src?.config as any)?.sourceProcessNodeId;
    const t = (tgt?.config as any)?.sourceProcessNodeId;
    if (s && t) byPair.set(`${s}::${t}`, e);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const wanted = new Set<string>();
  for (const e of forward) {
    const key = `${e.from}::${e.to}`;
    wanted.add(key);
    const existing = byPair.get(key);
    if (!existing) {
      added.push(pairText(e.from, e.to));
      continue;
    }
    // A branch out of a decision step is chosen by the step, not judged by its
    // condition; switching either way is a change the card must show.
    const srcPn = graph.nodes.find((n) => n.id === e.from);
    const wantDecision = !!srcPn && isDecision(srcPn);
    if (wantDecision !== (existing.evaluationMode === "decision")) {
      changed.push(wantDecision ? `${pairText(e.from, e.to)} is chosen by "${labelFor(e.from)}" itself` : `${pairText(e.from, e.to)} waits on its condition again`);
      continue;
    }
    const before = String(existing.condition ?? "").trim();
    const after = String(e.condition ?? "").trim();
    if (before === after) continue;
    changed.push(after ? `${pairText(e.from, e.to)} only when ${after}` : `${pairText(e.from, e.to)} no longer waits on a condition`);
  }
  for (const key of Array.from(byPair.keys())) {
    if (wanted.has(key)) continue;
    const [s, t] = key.split("::");
    // A pair that is now a loop is not removed: it becomes a revision rule, and
    // is reported as one below.
    if (loops.get(s)?.to === t) continue;
    removed.push(pairText(s, t));
  }

  const loopsAdded: string[] = [];
  const loopsRemoved: string[] = [];
  for (const [fromPn, loop] of Array.from(loops.entries())) {
    const row = diff.byProcessNodeId.get(fromPn);
    const targetRow = diff.byProcessNodeId.get(loop.to);
    const revision = (row?.config as any)?.revision as { targetNodeId?: string; maxRounds?: number } | undefined;
    const alreadyRight = !!row && !!targetRow && revision?.targetNodeId === targetRow.id && revision?.maxRounds === loop.maxRounds;
    if (!alreadyRight) loopsAdded.push(`"${labelFor(fromPn)}" sends work back to "${labelFor(loop.to)}"`);
  }
  for (const [pnId, row] of Array.from(diff.byProcessNodeId.entries())) {
    if ((row.config as any)?.revision && !loops.has(pnId)) loopsRemoved.push(`"${labelFor(pnId)}" stops sending work back`);
  }

  return { added, removed, changed, loopsAdded, loopsRemoved };
}

/** Drop this agent's membership of this team, if it has one. */
async function removeMembership(teamAgentId: string, memberAgentId: string) {
  const members = await storage.getAgentTeamMembers(teamAgentId).catch(() => []);
  for (const m of members as any[]) {
    if (m.memberAgentId === memberAgentId) await storage.deleteAgentTeamMember(m.id).catch(() => {});
  }
}

/** The blueprint and the guards, shared by the plan and the apply. */
async function load(orgId: string | undefined, target: SyncTarget, forceFullRebuild: boolean) {
  const { graph, teamAgent } = target;
  if (!graph || graph.nodes.length === 0) {
    return { block: { kind: "no_steps" as const, message: `"${target.flowName}" has no steps to sync.` } };
  }
  const blueprintId = teamAgent.blueprintId ?? null;
  if (!blueprintId) {
    return { block: { kind: "no_blueprint" as const, message: `"${teamAgent.name}" has no blueprint yet, so there is nothing to sync into.` } };
  }

  // An in-flight run reads the blueprint live at start and at resume with no
  // snapshot insulation, so mutating it underneath a running or approval-paused
  // run can execute the wrong node or resume against a stale approval. Block
  // instead of racing it.
  const recentRuns = await storage.listDagExecutionRunsByTeamAgent(teamAgent.id, 50);
  const inFlight = recentRuns.find((r: any) => r.status === "running" || r.status === "waiting_approval");
  if (inFlight) {
    return {
      block: {
        kind: "run_in_flight" as const,
        message: `"${teamAgent.name}" has a run in progress. Finish or cancel it before syncing.`,
        runId: inFlight.id,
        runStatus: inFlight.status,
      },
    };
  }

  const blueprint = await storage.getBlueprint(blueprintId);
  if (!blueprint) return { block: { kind: "no_blueprint" as const, message: "That automation's blueprint is missing." } };
  const [existingNodes, existingEdges] = await Promise.all([
    storage.getTeamBlueprintNodes(blueprintId),
    storage.getTeamBlueprintEdges(blueprintId),
  ]);
  const diff = diffFlowAgainstBlueprint(graph, existingNodes, forceFullRebuild);
  const isDecision = await decisionStepPredicate(graph);
  promoteKindChanges(diff, graph, isDecision);

  // First sync of a blueprint whose nodes don't record which step they came
  // from: any match would be a guess presented as certainty. Partial
  // correlation counts as none -- see the header.
  if (!forceFullRebuild && diff.existingProcessNodes.length > 0 && diff.uncorrelated.length > 0) {
    return {
      blueprintId,
      blueprint,
      existingEdges,
      diff,
      isDecision,
      block: {
        kind: "legacy_blueprint" as const,
        message: diff.uncorrelated.length === diff.existingProcessNodes.length
          ? `"${teamAgent.name}" was built before its steps were tracked, so its agents can't be matched to the flow's steps. It can be rebuilt fully -- every step gets a fresh agent and the current ones are superseded -- or left as it is.`
          : `${diff.uncorrelated.length} of ${diff.existingProcessNodes.length} agents in "${teamAgent.name}" can't be matched to a step, so a step-by-step sync would leave them in place and add their steps again. It can be rebuilt fully instead, or left as it is.`,
      },
    };
  }

  return { blueprintId, blueprint, existingEdges, diff, isDecision };
}

/** What a sync would do, without doing any of it. */
export async function planFlowSync(orgId: string | undefined, target: SyncTarget, opts: { forceFullRebuild?: boolean } = {}): Promise<SyncPlan> {
  const forceFullRebuild = !!opts.forceFullRebuild;
  const loaded = await load(orgId, target, forceFullRebuild);
  const base: SyncPlan = {
    team: { id: target.teamAgent.id, name: target.teamAgent.name },
    blueprintId: (loaded as any).blueprintId ?? null,
    unchanged: 0,
    changed: [],
    added: [],
    removed: [],
    supersedes: [],
    connections: { added: [], removed: [], changed: [], loopsAdded: [], loopsRemoved: [] },
    stateKeyRenames: [],
    drafts: 0,
    rebuild: forceFullRebuild,
  };
  if (!("diff" in loaded) || !loaded.diff) return { ...base, block: loaded.block };
  const { diff } = loaded;
  const isDecision = (loaded as any).isDecision ?? (() => false);

  const supersedes: SyncPlan["supersedes"] = [];
  for (const node of [...diff.removedNodes, ...diff.changedOldNodes]) {
    const refAgentId = (node as any).refAgentId as string | null;
    if (!refAgentId) continue;
    const agent = await storage.getAgent(refAgentId, orgId);
    if (agent) supersedes.push({ label: labelOf(node), agentId: refAgentId, agentName: agent.name });
  }
  const toCreate = [...diff.changed, ...diff.added];
  return {
    ...base,
    unchanged: diff.unchanged.length,
    changed: diff.changed.map((n) => n.label),
    added: diff.added.map((n) => n.label),
    removed: diff.removedNodes.map(labelOf),
    supersedes,
    connections: planConnections(target.graph, diff, (loaded as any).existingEdges ?? [], isDecision),
    stateKeyRenames: planStateKeyRenames(target.graph, diff, (loaded as any).existingEdges ?? []),
    // Gates, expressions, sub-flows and decision steps are built from the step
    // itself; only an agent step costs a model call.
    drafts: toCreate.filter((pn) => !HUMAN_CHECKPOINT_NODE_TYPES.has(pn.type) && pn.type !== "sub_flow" && pn.type !== "expression" && !isDecision(pn)).length,
    ...(loaded.block ? { block: loaded.block } : {}),
  };
}

export interface SyncSummary {
  unchanged: number;
  changed: string[];
  added: string[];
  superseded: Array<{ label: string; agentId: string }>;
  draftFailures: Array<{ label: string; error: string }>;
  /**
   * What became of the flow's loops, by the step each one leaves. Reported
   * because a loop is the one thing in a flow that is NOT built as drawn: it
   * becomes a rule on a step, and nothing else would tell anyone it is there.
   * `unresolved` is a loop left off because the step it sends work back to could
   * not be built.
   */
  revisionLoops: { set: string[]; cleared: string[]; unresolved: string[] };
  /** Steps whose result key moved, with the connections rewritten to read the new one. */
  stateKeyRenames: StateKeyRename[];
  /**
   * What the blueprint looks like AFTER the sync, read back from the rows. A
   * sync that leaves a team unable to run must not report success on its own
   * say-so -- that is exactly how an unrunnable team reached a demo.
   */
  invariants: BlueprintCheck;
}

/** Do it. The caller has established that the team and flow are the caller's. */
export async function applyFlowSync(
  orgId: string | undefined,
  target: SyncTarget,
  opts: { forceFullRebuild?: boolean; via?: string } = {},
): Promise<{ summary: SyncSummary } | { needsChoice: "legacy_blueprint"; message: string } | { blocked: SyncBlock }> {
  const forceFullRebuild = !!opts.forceFullRebuild;
  const loaded = await load(orgId, target, forceFullRebuild);
  if (loaded.block) {
    if (loaded.block.kind === "legacy_blueprint") return { needsChoice: "legacy_blueprint", message: loaded.block.message };
    return { blocked: loaded.block };
  }
  const { blueprintId, blueprint, existingEdges, diff } = loaded as Required<Awaited<ReturnType<typeof load>>> & { blueprintId: string };
  const isDecision: (pn: ProcessNode) => boolean = (loaded as any).isDecision ?? (() => false);
  const { teamAgent, graph } = target;
  const industryId = (teamAgent as any).industry || "general";
  const outcomeId = target.outcomeId ?? teamAgent.outcomeId ?? null;

  const superseded: Array<{ label: string; agentId: string }> = [];
  const nodeIdMap = new Map<string, string>(); // ProcessNode.id -> new/kept teamBlueprintNode.id
  for (const n of diff.unchanged) nodeIdMap.set((n.config as any).sourceProcessNodeId, n.id);

  // Result keys that move under this sync, and what is rewritten to follow
  // them. Computed from the rows before anything is written, the same way the
  // plan computed them for the card.
  const moves = stateKeyMoves(diff);
  const renames = new Map(moves.map((m) => [m.from, m.to] as const));
  const stateKeyRenames: StateKeyRename[] = moves.map((m) => ({ step: m.pn.label, from: m.from, to: m.to, connections: [] }));
  const pairText = pairTextFor(diff);
  const noteRewrite = (rewrote: string[], text: string) => {
    for (const from of rewrote) {
      const r = stateKeyRenames.find((o) => o.from === from);
      if (r && !r.connections.includes(text)) r.connections.push(text);
    }
  };
  // A row left in place that never held a key gets the step's own, so what it
  // writes and what the rules read are the same name from here on.
  for (const m of moves) {
    if (diff.unchanged.includes(m.row)) await storage.updateTeamBlueprintNode(m.row.id, { stateKey: m.to } as any);
  }

  // Delete removed + changed-old blueprint nodes, superseding (not retiring --
  // that's a real, optionally approval-gated workflow this sync shouldn't
  // short-circuit) their now-orphaned agents.
  for (const node of [...diff.removedNodes, ...diff.changedOldNodes]) {
    const refAgentId = (node as any).refAgentId as string | null;
    if (refAgentId) {
      const agent = await storage.getAgent(refAgentId, orgId);
      if (agent) superseded.push({ label: labelOf(node), agentId: refAgentId });
      // It stops being a member of the team, not just a node in its blueprint.
      // Membership is what planTeamRemoval and flowStepBehind read; leaving the
      // row behind would keep a superseded agent listed as part of the team.
      await removeMembership(teamAgent.id, refAgentId);
    }
    await storage.deleteTeamBlueprintNode(node.id);
  }

  // Draft/create changed + added nodes -- isolated failures, one node's draft
  // failing doesn't roll back the others.
  const toCreate = [...diff.changed, ...diff.added];
  const created = await Promise.all(toCreate.map(async (pn) => {
    try {
      if (HUMAN_CHECKPOINT_NODE_TYPES.has(pn.type)) {
        const node = await storage.createTeamBlueprintNode({
          blueprintId,
          nodeType: "edge_gate",
          gateType: "approval",
          label: pn.label,
          refAgentId: null,
          stateKey: stepStateKey(pn),
          config: processNodeConfig(pn),
        } as any);
        return { pn, node, ok: true as const };
      }
      if (pn.type === "sub_flow") {
        const refTeamAgentId = (pn.config as any)?.refTeamAgentId || null;
        if (!refTeamAgentId) {
          return { pn, node: null, ok: false as const, error: `"${pn.label}" has no flow selected -- pick one before syncing.` };
        }
        const node = await storage.createTeamBlueprintNode({
          blueprintId,
          nodeType: "sub_flow",
          label: pn.label,
          refAgentId: null,
          refTeamAgentId,
          stateKey: stepStateKey(pn),
          config: processNodeConfig(pn),
        } as any);
        return { pn, node, ok: true as const };
      }
      if (pn.type === "expression") {
        const expression = (pn.config as any)?.expression || null;
        if (!expression) {
          return { pn, node: null, ok: false as const, error: `"${pn.label}" has no expression -- write one before syncing.` };
        }
        const node = await storage.createTeamBlueprintNode({
          blueprintId,
          nodeType: "expression",
          label: pn.label,
          refAgentId: null,
          stateKey: stepStateKey(pn),
          config: { ...processNodeConfig(pn), expression },
        } as any);
        return { pn, node, ok: true as const };
      }
      if (isDecision(pn)) {
        // One decision-model call over the step's labelled branches; no agent is
        // drafted. The branches come from the flow's own edges, labels first.
        const options = graph.edges
          .filter((e) => e.from === pn.id)
          .map((e) => ({ label: String(e.label ?? "").trim() || String(e.condition ?? "").trim(), description: String(e.condition ?? "").trim() || String(e.label ?? "").trim() }))
          .filter((o) => o.label);
        const cfg = (pn.config ?? {}) as Record<string, any>;
        const threshold = Number(cfg.confidenceThreshold);
        const node = await storage.createTeamBlueprintNode({
          blueprintId,
          nodeType: "decision",
          label: pn.label,
          refAgentId: null,
          stateKey: stepStateKey(pn),
          config: {
            ...processNodeConfig(pn),
            decision: {
              question: String(cfg.question || pn.description || pn.label || "").trim() || `Which branch should "${pn.label}" take?`,
              options,
              ...(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? { threshold } : {}),
              ...(cfg.unsure === "gate" ? { unsure: "gate" } : {}),
            },
          },
        } as any);
        return { pn, node, ok: true as const };
      }
      const description = `${pn.label}${pn.description ? ": " + pn.description : ""}${pn.actor ? ` (performed by ${pn.actor})` : ""}`;
      const { draft } = await draftSingleAgent(description, industryId, orgId);
      const agent = await storage.createAgent({
        // The team's organization, not the default one createAgent falls back to.
        organizationId: teamAgent.organizationId ?? orgId ?? undefined,
        name: draft.name,
        description: draft.description,
        owner: "system",
        agentType: "single",
        ...(outcomeId ? { outcomeId } : {}),
        riskTier: draft.riskTier || "MEDIUM",
        autonomyMode: draft.autonomyMode || "assisted",
        systemPrompt: draft.systemPrompt || "",
        toolsConfig: draft.toolsConfig || [],
        // An ARRAY of bindings, not { policies: [names] }: everything that reads
        // this field expects an array, and the object shape made the MCP-link
        // route throw, so an agent created here could never be given tools.
        policyBindings: (draft.policyBindings ?? []).map((b: any) => ({
          policyId: b.policyId,
          policyName: b.policyName,
          name: b.policyName,
          domain: b.domain,
          enforcement: b.enforcement ?? "soft",
        })),
        ontologyTags: draft.ontologyTags || [],
        preloadedSkills: draft.preloadedSkills || [],
        runtimeConfig: { prompt: description, guardrailsConfig: draft.guardrailsConfig, evalSuiteConfig: draft.evalSuiteConfig },
      } as any);
      const node = await storage.createTeamBlueprintNode({
        blueprintId,
        nodeType: "internal_agent",
        label: agent.name,
        refAgentId: agent.id,
        // The step's key, not a slug of the drafted name: see stepStateKey.
        stateKey: stepStateKey(pn),
        config: processNodeConfig(pn),
      } as any);
      // The build writes this row for every worker it creates; without it here a
      // synced-in agent is in the blueprint but not in the team, so deleting the
      // team orphans it and the removal plan cannot even list it (live
      // 2026-09-27).
      await storage.createAgentTeamMember({ teamAgentId: teamAgent.id, memberAgentId: agent.id, role: "member" } as any).catch(() => {});
      return { pn, node, ok: true as const };
    } catch (err: any) {
      console.error(`[process-flow-sync] failed to draft node "${pn.label}":`, err?.message);
      return { pn, node: null, ok: false as const, error: err?.message ?? "draft failed" };
    }
  }));
  for (const c of created) if (c.ok && c.node) nodeIdMap.set(c.pn.id, c.node.id);
  const draftFailures = created.filter((c) => !c.ok).map((c) => ({ label: c.pn.label, error: (c as any).error }));

  // Rebuild ONLY edges between two real process nodes -- edges touching the
  // orchestrator are synthesized (dispatch/fork/return), never 1:1 from a
  // ProcessEdge, and are reconciled separately below by topology.
  const existingProcessEdges = existingEdges.filter((e: any) => e.sourceNodeId !== diff.orchestratorNode?.id && e.targetNodeId !== diff.orchestratorNode?.id);
  const oldEndpointsByPnPair = new Map<string, any>();
  for (const e of existingProcessEdges) {
    const srcPn = diff.existingProcessNodes.find((n) => n.id === e.sourceNodeId);
    const tgtPn = diff.existingProcessNodes.find((n) => n.id === e.targetNodeId);
    const srcId = (srcPn?.config as any)?.sourceProcessNodeId;
    const tgtId = (tgtPn?.config as any)?.sourceProcessNodeId;
    if (srcId && tgtId) oldEndpointsByPnPair.set(`${srcId}::${tgtId}`, e);
  }
  // A flow is drawn with loops; a team cannot run with one. computeWaves refuses
  // any cyclic graph, so an edge pointing back up the flow becomes a revision
  // rule on the step it leaves -- exactly what the build does. Until this, the
  // sync copied it as an edge and the team it produced could not run at all,
  // while the sync, the deploy and the build all reported success (live
  // 2026-09-27: three loops in the MGA journey, 22 nodes, zero runs).
  const { runEdges, loopKeys, loops: loopsByProcessNode } = desiredConnections(graph, diff.runNodeIds, diff.runNodes);
  const keptPairKeys = new Set<string>();
  for (const e of runEdges) {
    const key = `${e.from}::${e.to}`;
    const srcNodeId = nodeIdMap.get(e.from);
    const tgtNodeId = nodeIdMap.get(e.to);
    // A loop is registered even when an endpoint failed to draft, so it is
    // reported as unresolved below rather than looking like a loop the flow no
    // longer draws.
    if (loopKeys.has(key)) {
      // Any edge a previous sync wrote for this pair has to go with it: as an
      // edge it is what makes the graph cyclic. keptPairKeys stops the sweep
      // below from deleting it twice.
      const stale = oldEndpointsByPnPair.get(key);
      if (stale) await storage.deleteTeamBlueprintEdge(stale.id);
      keptPairKeys.add(key);
      continue;
    }
    if (!srcNodeId || !tgtNodeId) continue; // endpoint failed to draft -- already reported
    const existingEdge = oldEndpointsByPnPair.get(key);
    // A branch out of a decision step is chosen by the step's one call, so the
    // edge is a "decision" edge whatever its condition says.
    const srcPn = graph.nodes.find((n) => n.id === e.from);
    const decisionEdge = !!srcPn && isDecision(srcPn);
    // Endpoints both unchanged AND an edge already connects them: leave it
    // alone. This is what preserves an evaluationMode "deterministic" rule an
    // admin hardened after creation; recreating the edge would downgrade it.
    // Unless its kind changed: a decision edge and a judged edge are different things.
    if (existingEdge && existingEdge.sourceNodeId === srcNodeId && existingEdge.targetNodeId === tgtNodeId && (existingEdge.evaluationMode === "decision") === decisionEdge) {
      // Left alone -- except that a rule on it reading a key that moved under
      // this sync is rewritten to the new key, or it would read nothing.
      const kept = rewriteStateKeyReferences({ condition: existingEdge.condition, rule: existingEdge.rule, renames });
      if (kept.rewrote.length > 0) {
        await storage.updateTeamBlueprintEdge(existingEdge.id, { condition: kept.condition, rule: kept.rule } as any);
        noteRewrite(kept.rewrote, pairText(e.from, e.to));
      }
      keptPairKeys.add(key);
      continue;
    }
    if (existingEdge) await storage.deleteTeamBlueprintEdge(existingEdge.id);
    // The author's condition, with any key that moved under this sync renamed
    // to what the step writes now. The flow itself still says the old name;
    // the summary reports that.
    const written = rewriteStateKeyReferences({ condition: e.condition, renames });
    noteRewrite(written.rewrote, pairText(e.from, e.to));
    const condition = written.condition ?? undefined;
    await storage.createTeamBlueprintEdge({
      blueprintId,
      sourceNodeId: srcNodeId,
      targetNodeId: tgtNodeId,
      label: e.label || (decisionEdge ? condition : undefined) || undefined,
      // The same classification the build applies: a condition that states a
      // plain comparison becomes a rule the engine evaluates itself. Copying the
      // text and leaving evaluationMode unset made every conditional edge on a
      // synced team a model call per run.
      ...(decisionEdge ? { condition: condition || undefined, evaluationMode: "decision" } : edgeRuleForCondition(condition)),
      failureMode: "escalate",
    } as any);
    keptPairKeys.add(key);
  }
  for (const [key, edge] of Array.from(oldEndpointsByPnPair.entries())) {
    if (!keptPairKeys.has(key)) await storage.deleteTeamBlueprintEdge(edge.id);
  }

  // Revision rules, recomputed from the flow every sync rather than edited in
  // place. That is also the only thing that repoints a loop across a supersede:
  // a changed step's node is deleted and redrafted under a NEW id, and the
  // pointer on the reviewing step was left aimed at the retired node, so the loop
  // could never fire even once the cycle was gone. Live 2026-09-27: a revision
  // target naming a node that was not in the blueprint at all.
  const rowByProcessNode = new Map<string, any>();
  for (const n of diff.unchanged) rowByProcessNode.set((n.config as any).sourceProcessNodeId, n);
  for (const c of created) if (c.ok && c.node) rowByProcessNode.set(c.pn.id, c.node);
  const revisionLoops: SyncSummary["revisionLoops"] = { set: [], cleared: [], unresolved: [] };
  for (const pn of diff.runNodes) {
    const row = rowByProcessNode.get(pn.id);
    if (!row) continue;
    const config = { ...((row.config ?? {}) as Record<string, unknown>) };
    const wanted = loopsByProcessNode.get(pn.id);
    const existing = config.revision as { targetNodeId?: string; maxRounds?: number; when?: unknown } | undefined;
    if (wanted) {
      const targetNodeId = nodeIdMap.get(wanted.to);
      if (!targetNodeId) {
        // The step it sends work back to failed to draft; a pointer to nothing is
        // worse than no loop, so it is left off and reported.
        revisionLoops.unresolved.push(pn.label);
        continue;
      }
      // The matcher counts as much as the target: a rule written before the
      // rework matcher was widened tests only the text "fail", so it points at the
      // right step for the right number of rounds and never fires. Leaving it
      // alone because the target and rounds look right is how a stale matcher
      // survives every re-sync.
      const current = existing?.targetNodeId === targetNodeId
        && existing?.maxRounds === wanted.maxRounds
        && isCurrentReworkRule(existing?.when);
      if (current) continue;
      await storage.updateTeamBlueprintNode(row.id, {
        config: { ...config, revision: { targetNodeId, when: REWORK_REQUESTED_RULE, maxRounds: wanted.maxRounds } },
      } as any);
      revisionLoops.set.push(pn.label);
    } else if (existing) {
      // The loop was removed from the flow, so it stops being a rule on the step.
      delete config.revision;
      await storage.updateTeamBlueprintNode(row.id, { config } as any);
      revisionLoops.cleared.push(pn.label);
    }
  }

  // Reconcile the orchestrator's synthesized edges by topology (entry/terminal
  // nodes), not by copying ProcessEdge entries: the orchestrator has no
  // sourceProcessNodeId and its dispatch/return edges were never 1:1 with the
  // process graph. Execution readiness depends on connectivity, not on whether
  // an edge is labelled "dispatch" or "fork".
  if (diff.orchestratorNode) {
    const hasIncoming = new Set(runEdges.map((e) => e.to));
    const hasOutgoing = new Set(runEdges.map((e) => e.from));
    const entryNodeIds = diff.runNodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
    const isFanOutFanIn = (blueprint.blueprintJson as any)?.pattern === "fan_out_fan_in";
    const terminalNodeIds = isFanOutFanIn ? diff.runNodes.filter((n) => !hasOutgoing.has(n.id)).map((n) => n.id) : [];

    const existingDispatch = existingEdges.filter((e: any) => e.sourceNodeId === diff.orchestratorNode.id);
    const existingReturn = existingEdges.filter((e: any) => e.targetNodeId === diff.orchestratorNode.id);
    const dispatchTargets = new Set(entryNodeIds.map((id) => nodeIdMap.get(id)).filter(Boolean) as string[]);
    const returnSources = new Set(terminalNodeIds.map((id) => nodeIdMap.get(id)).filter(Boolean) as string[]);

    for (const e of existingDispatch) if (!dispatchTargets.has(e.targetNodeId)) await storage.deleteTeamBlueprintEdge(e.id);
    for (const e of existingReturn) if (!returnSources.has(e.sourceNodeId)) await storage.deleteTeamBlueprintEdge(e.id);
    const existingDispatchTargets = new Set(existingDispatch.map((e: any) => e.targetNodeId));
    const existingReturnSources = new Set(existingReturn.map((e: any) => e.sourceNodeId));
    for (const targetId of Array.from(dispatchTargets)) {
      if (!existingDispatchTargets.has(targetId)) {
        await storage.createTeamBlueprintEdge({ blueprintId, sourceNodeId: diff.orchestratorNode.id, targetNodeId: targetId, label: "dispatch", failureMode: "escalate" } as any);
      }
    }
    for (const sourceId of Array.from(returnSources)) {
      if (!existingReturnSources.has(sourceId)) {
        await storage.createTeamBlueprintEdge({ blueprintId, sourceNodeId: sourceId, targetNodeId: diff.orchestratorNode.id, label: "return results", failureMode: "escalate" } as any);
      }
    }
  }

  // Read back what was actually written, so "synced" cannot mean "left in a
  // state no run can start from".
  const invariants = await checkBlueprintInvariants(blueprintId);

  await storage.createAuditEvent({
    actorType: "system",
    actorId: "process_flow_sync",
    action: "outcome.process_flow_synced",
    objectType: "blueprint",
    objectId: blueprintId,
    organizationId: orgId,
    details: JSON.stringify({
      outcomeId,
      teamAgentId: teamAgent.id,
      flow: target.flowName,
      unchanged: diff.unchanged.length,
      changed: diff.changed.map((n) => n.label),
      added: diff.added.map((n) => n.label),
      removed: diff.removedNodes.map(labelOf),
      rebuilt: forceFullRebuild,
      draftFailures,
      revisionLoops,
      stateKeyRenames,
      runnable: invariants.runnable,
      findings: invariants.findings.map((f) => f.message),
      via: opts.via ?? "Studio",
    }),
    ontologyTags: resolveOntologyTags("outcome", "outcome.process_flow_synced"),
  });

  return {
    summary: {
      unchanged: diff.unchanged.length,
      changed: diff.changed.map((n) => n.label),
      added: diff.added.map((n) => n.label),
      superseded,
      draftFailures,
      revisionLoops,
      stateKeyRenames,
      invariants,
    },
  };
}
