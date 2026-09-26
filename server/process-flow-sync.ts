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
import type { ProcessFlowGraph, ProcessNode } from "@shared/process-flow";

export { HUMAN_CHECKPOINT_NODE_TYPES, STRUCTURAL_NODE_TYPES };

/** The correlation a blueprint node carries for the step it came from. */
const processNodeConfig = (n: ProcessNode) => stepCorrelation(n as any);

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

  // First sync of a blueprint whose nodes don't record which step they came
  // from: any match would be a guess presented as certainty. Partial
  // correlation counts as none -- see the header.
  if (!forceFullRebuild && diff.existingProcessNodes.length > 0 && diff.uncorrelated.length > 0) {
    return {
      blueprintId,
      blueprint,
      existingEdges,
      diff,
      block: {
        kind: "legacy_blueprint" as const,
        message: diff.uncorrelated.length === diff.existingProcessNodes.length
          ? `"${teamAgent.name}" was built before its steps were tracked, so its agents can't be matched to the flow's steps. It can be rebuilt fully -- every step gets a fresh agent and the current ones are superseded -- or left as it is.`
          : `${diff.uncorrelated.length} of ${diff.existingProcessNodes.length} agents in "${teamAgent.name}" can't be matched to a step, so a step-by-step sync would leave them in place and add their steps again. It can be rebuilt fully instead, or left as it is.`,
      },
    };
  }

  return { blueprintId, blueprint, existingEdges, diff };
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
    drafts: 0,
    rebuild: forceFullRebuild,
  };
  if (!("diff" in loaded) || !loaded.diff) return { ...base, block: loaded.block };
  const { diff } = loaded;

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
    // Gates, expressions and sub-flows are built from the step itself; only an
    // agent step costs a model call.
    drafts: toCreate.filter((pn) => !HUMAN_CHECKPOINT_NODE_TYPES.has(pn.type) && pn.type !== "sub_flow" && pn.type !== "expression").length,
    ...(loaded.block ? { block: loaded.block } : {}),
  };
}

export interface SyncSummary {
  unchanged: number;
  changed: string[];
  added: string[];
  superseded: Array<{ label: string; agentId: string }>;
  draftFailures: Array<{ label: string; error: string }>;
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
  const { teamAgent, graph } = target;
  const industryId = (teamAgent as any).industry || "general";
  const outcomeId = target.outcomeId ?? teamAgent.outcomeId ?? null;

  const superseded: Array<{ label: string; agentId: string }> = [];
  const nodeIdMap = new Map<string, string>(); // ProcessNode.id -> new/kept teamBlueprintNode.id
  for (const n of diff.unchanged) nodeIdMap.set((n.config as any).sourceProcessNodeId, n.id);

  // Delete removed + changed-old blueprint nodes, superseding (not retiring --
  // that's a real, optionally approval-gated workflow this sync shouldn't
  // short-circuit) their now-orphaned agents.
  for (const node of [...diff.removedNodes, ...diff.changedOldNodes]) {
    const refAgentId = (node as any).refAgentId as string | null;
    if (refAgentId) {
      const agent = await storage.getAgent(refAgentId, orgId);
      if (agent) superseded.push({ label: labelOf(node), agentId: refAgentId });
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
          stateKey: pn.id.replace(/-/g, "_"),
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
          stateKey: pn.id.replace(/-/g, "_"),
          config: { ...processNodeConfig(pn), expression },
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
        config: processNodeConfig(pn),
      } as any);
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
  const runEdges = graph.edges.filter((e) => diff.runNodeIds.has(e.from) && diff.runNodeIds.has(e.to));
  const keptPairKeys = new Set<string>();
  for (const e of runEdges) {
    const key = `${e.from}::${e.to}`;
    const srcNodeId = nodeIdMap.get(e.from);
    const tgtNodeId = nodeIdMap.get(e.to);
    if (!srcNodeId || !tgtNodeId) continue; // endpoint failed to draft -- already reported
    const existingEdge = oldEndpointsByPnPair.get(key);
    // Endpoints both unchanged AND an edge already connects them: leave it
    // alone. This is what preserves an evaluationMode "deterministic" rule an
    // admin hardened after creation; recreating the edge would downgrade it.
    if (existingEdge && existingEdge.sourceNodeId === srcNodeId && existingEdge.targetNodeId === tgtNodeId) {
      keptPairKeys.add(key);
      continue;
    }
    if (existingEdge) await storage.deleteTeamBlueprintEdge(existingEdge.id);
    await storage.createTeamBlueprintEdge({
      blueprintId,
      sourceNodeId: srcNodeId,
      targetNodeId: tgtNodeId,
      label: e.label || undefined,
      condition: e.condition || undefined,
      failureMode: "escalate",
    } as any);
    keptPairKeys.add(key);
  }
  for (const [key, edge] of Array.from(oldEndpointsByPnPair.entries())) {
    if (!keptPairKeys.has(key)) await storage.deleteTeamBlueprintEdge(edge.id);
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
    },
  };
}
