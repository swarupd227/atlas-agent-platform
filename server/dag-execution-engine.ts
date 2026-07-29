import { storage } from "./storage";
import { executeWorkerAgent, waitForApproval, evaluateCondition, buildPipelineState, extractStructuredOutput } from "./agent-runtime";
import { publishDagRunEvent, previewOutput } from "./dag-run-events";
import { evaluateRule } from "./rule-evaluator";
import { searchKnowledgeBaseChunks } from "./embeddings";
import type { DagExecutionPlan, DagExecutionRun, DagStateSchema, TeamBlueprintNode, TeamBlueprintEdge, RuleGroup } from "@shared/schema";

// Turns a node label like "Brief Approval Agent" into "brief_approval_agent"
// -- a state key a person building a deterministic rule can actually guess,
// instead of the node's random database id.
function slugifyLabel(label: string): string {
  return (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// Handoff pattern: instead of a pre-declared condition/rule, the SOURCE
// node's own structured output names which downstream node it hands off to
// (a handoff_to/handoffTo/next field, naming the target by label or state
// key). Tries a JSON parse first (the common case), falling back to a
// regex scan for models that wrap JSON in prose or markdown fences.
function extractHandoffTarget(sourceOutputText: string): string | null {
  try {
    const parsed = JSON.parse(sourceOutputText);
    const raw = parsed?.handoff_to ?? parsed?.handoffTo ?? parsed?.next ?? null;
    if (typeof raw === "string" && raw.trim()) return raw;
  } catch {}
  const match = sourceOutputText.match(/"?(?:handoff_to|handoffTo|next)"?\s*[:=]\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

function isHandoffTarget(sourceOutputText: string, targetLabel: string): boolean {
  const named = extractHandoffTarget(sourceOutputText);
  if (!named) return false;
  return slugifyLabel(named) === slugifyLabel(targetLabel);
}

export interface WaveNode {
  wave_number: number;
  nodes: string[];
  dependencies: string[];
}

// One incoming edge into a node, as seen from the target's side. isGating
// is false for a plain structural edge (no condition, no rule) -- it exists
// only to order execution, and always counts as a satisfied path once its
// source has actually run (see filterGatedNodes). isGating is true for an
// edge carrying a condition or deterministic rule, which must itself
// evaluate true to count as satisfied.
export interface IncomingEdgeInfo {
  sourceNodeId: string;
  isGating: boolean;
  evaluationMode: string;
  condition: string | null;
  rule: RuleGroup | null;
}

export interface ComputedWavePlan {
  waves: WaveNode[];
  edgeMap: Record<string, string[]>;
  nodeConfig: Record<string, NodePlanConfig>;
  // Every node with at least one incoming edge appears as a key here (both
  // gating and plain edges). Absence means "no incoming edges -- always
  // runs" (a root node in the graph).
  incomingEdges: Record<string, IncomingEdgeInfo[]>;
  totalNodes: number;
  totalWaves: number;
  maxParallelism: number;
}

// Names the shape computeWaves() already produces, matching the reusable
// orchestration patterns other agent frameworks ship as named primitives
// (e.g. Sequential / Concurrent). This engine has executed both shapes
// natively since waves were introduced -- a wave's nodes always run
// concurrently (Promise.all/allSettled) and waves themselves always run
// sequentially -- this just gives that existing behavior a name so it's
// selectable/visible instead of only inferable from raw wave counts.
export type OrchestrationPattern = "sequential" | "concurrent" | "mixed" | "single" | "magentic";

export function inferOrchestrationPattern(totalNodes: number, totalWaves: number, maxParallelism: number): OrchestrationPattern {
  if (totalNodes <= 1) return "single";
  if (totalWaves <= 1) return "concurrent"; // one wave, every node runs in parallel
  if (maxParallelism <= 1) return "sequential"; // every wave has exactly one node -- a linear chain
  return "mixed"; // multiple waves, and at least one wave runs nodes concurrently
}

export interface NodePlanConfig {
  agentId: string | null;
  stateKey: string;
  outputSchema: Record<string, any> | null;
  fallbackOutput: Record<string, any> | null;
  timeoutMs: number;
  retryPolicy: { max_attempts: number; backoff_ms: number[] };
  nodeType: string;
  refTeamAgentId: string | null;
  refRemoteAgentId: string | null;
  refSkillId: string | null;
  refKnowledgeBaseId: string | null;
  kbQuery: string | null;
  label: string;
  gateType: string | null;
  refToolIds: string[] | null;
}

export interface StateFieldDef {
  type: string;
  writable_by: string[];
  reducer: "last_wins" | "append" | "merge_object" | "sum";
  sanitize?: boolean;
  ephemeral?: boolean;
  enum?: string[];
  schema_ref?: string;
  item_schema_ref?: string;
}

export interface DAGExecutionConfig {
  executionPlan: ComputedWavePlan;
  stateSchema: Record<string, StateFieldDef>;
  initialState: Record<string, any>;
  errorStrategy: "fail_fast" | "best_effort";
  teamAgentId: string;
  teamAgentRuntimeConfig?: Record<string, any>;
  onNodeStart?: (nodeId: string, wave: number) => void;
  onNodeComplete?: (nodeId: string, wave: number, result: NodeExecutionResult) => void;
  onWaveComplete?: (wave: number, state: Record<string, any>) => Promise<void>;
  // Fired with the full WaveExecutionResult (and everything accumulated so
  // far) right after each wave -- lets the caller persist the timeline
  // incrementally instead of only on the final write, so a mid-run page
  // refresh or a post-crash resume still shows completed waves.
  onWaveResult?: (wave: WaveExecutionResult, allSoFar: WaveExecutionResult[]) => Promise<void>;
  // Fired the moment a gate node creates its approval record -- before the
  // (potentially long) wait for a human decision begins.
  onApprovalPending?: (nodeId: string, approvalId: string) => void;
  // Resumability (see resumeTeamAgentDagRun): when set, execute() skips every
  // wave before resumeFromWave -- their results are supplied via
  // resumePriorWaveResults instead of being re-run -- and starts real
  // execution at resumeFromWave itself (the wave a gate node paused inside;
  // re-running it in full is intentional, see resumeTeamAgentDagRun's doc
  // comment on why that's safe here).
  resumeFromWave?: number;
  resumePriorWaveResults?: WaveExecutionResult[];
  // The approval id the run was parked on before the restart (dagRun.pendingApprovalId).
  // Threaded into executeGateNode so re-running the paused wave's gate node
  // reuses/short-circuits on this exact approval instead of creating a new one.
  resumePendingApprovalId?: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  agentId: string;
  status: "completed" | "failed" | "skipped" | "timeout";
  output: Record<string, any>;
  error?: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  traceId: string;
  // Only set on Team Reference nodes whose nested team itself skipped one or
  // more of its own nodes -- lets the outer run's status honestly reflect a
  // nested skip even though this wrapper node otherwise "completed" fine.
  childSkippedCount?: number;
  costUsd?: number;
  toolCallCount?: number;
}

export interface WaveExecutionResult {
  waveNumber: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodes: NodeExecutionResult[];
}

export interface DAGExecutionResult {
  finalState: Record<string, any>;
  waveResults: WaveExecutionResult[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  totalToolCalls: number;
  success: boolean;
  // Ids of every node (at this level, or a Team Reference node whose nested
  // team had skips of its own) that didn't run because no incoming edge
  // condition was satisfied. Non-empty does NOT mean something went wrong --
  // untaken branches are normal -- but a caller reporting "Completed" without
  // surfacing this hides the difference between "the whole pipeline ran" and
  // "only some of it did," which is exactly what deriveRunStatus is for.
  skippedNodeIds: string[];
}

// The one place that decides what a finished run's DB status should say.
// Used by both entry points (executeTeamAgentDagRun below, and the composite
// pipeline-stage runner in routes/runtime.ts) so they can't drift on when a
// run gets to call itself "completed" outright vs. "completed_with_skips".
export function deriveRunStatus(result: Pick<DAGExecutionResult, "success" | "skippedNodeIds">): "completed" | "completed_with_skips" | "failed" {
  if (!result.success) return "failed";
  return result.skippedNodeIds.length > 0 ? "completed_with_skips" : "completed";
}

export class DAGExecutionError extends Error {
  constructor(
    message: string,
    public readonly context: { waveNumber: number; nodeId: string; waveResults: WaveExecutionResult[] },
  ) {
    super(message);
    this.name = "DAGExecutionError";
  }
}

/**
 * Compute execution waves from team blueprint nodes + edges using Kahn's algorithm.
 * A wave is a maximal set of nodes whose dependencies are all satisfied by earlier waves.
 */
export function computeWaves(
  nodes: TeamBlueprintNode[],
  edges: TeamBlueprintEdge[],
): ComputedWavePlan {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const targets = adj.get(edge.sourceNodeId);
    if (targets) targets.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
  }

  const waves: WaveNode[] = [];
  const remaining = new Set(nodes.map((n) => n.id));
  const placed = new Set<string>();

  while (remaining.size > 0) {
    const readyNodes: string[] = [];
    for (const nodeId of remaining) {
      if ((inDegree.get(nodeId) || 0) === 0) {
        readyNodes.push(nodeId);
      }
    }

    if (readyNodes.length === 0) {
      throw new Error("Cycle detected in team graph — cannot compute execution waves");
    }

    const waveNumber = waves.length + 1;
    const dependencies = waveNumber > 1 ? Array.from(placed) : [];

    waves.push({ wave_number: waveNumber, nodes: readyNodes, dependencies });

    for (const nodeId of readyNodes) {
      remaining.delete(nodeId);
      placed.add(nodeId);
      for (const downstream of adj.get(nodeId) || []) {
        inDegree.set(downstream, (inDegree.get(downstream) || 0) - 1);
      }
    }
  }

  // Nodes created through the AI team-builder (create-team-from-proposals)
  // never set an explicit stateKey, so it used to silently fall back to the
  // node's own random database id (e.g. "4d88a042_261e_4063_97a2_...") --
  // a value nobody building a deterministic gate could predict or discover.
  // Fall back to a slug of the node's own label instead, so "Brief Approval
  // Agent" reliably becomes "brief_approval_agent" every time the blueprint
  // runs, on every team, whether the node was AI-generated or hand-built.
  // Guard against two sibling nodes sharing a label (rare, but would
  // otherwise silently collide) by suffixing a short id fragment on repeats.
  const usedStateKeys = new Set<string>();
  const nodeConfig: Record<string, NodePlanConfig> = {};
  for (const node of nodes) {
    let derivedStateKey = node.stateKey;
    if (!derivedStateKey) {
      const slug = slugifyLabel(node.label);
      derivedStateKey = slug || node.id.replace(/-/g, "_");
      if (usedStateKeys.has(derivedStateKey)) {
        derivedStateKey = `${derivedStateKey}_${node.id.replace(/-/g, "").slice(0, 6)}`;
      }
    }
    usedStateKeys.add(derivedStateKey);
    nodeConfig[node.id] = {
      agentId: node.refAgentId || null,
      stateKey: derivedStateKey,
      outputSchema: (node.outputSchema as Record<string, any>) || null,
      fallbackOutput: (node.fallbackOutput as Record<string, any>) || null,
      timeoutMs: node.timeoutMs || 30000,
      retryPolicy: (node.retryPolicy as any) || { max_attempts: 2, backoff_ms: [1000, 2000] },
      nodeType: node.nodeType,
      refTeamAgentId: node.refTeamAgentId || null,
      refRemoteAgentId: node.refRemoteAgentId || null,
      refSkillId: (node as any).refSkillId || null,
      refKnowledgeBaseId: (node as any).refKnowledgeBaseId || null,
      kbQuery: (node.config as any)?.kbQuery || null,
      label: node.label,
      gateType: node.gateType || null,
      refToolIds: (node.refToolIds as string[] | null) || null,
    };
  }

  const edgeMap: Record<string, string[]> = {};
  for (const [k, v] of adj.entries()) {
    edgeMap[k] = v;
  }

  // Every edge is recorded here, gating or not -- a node with a mix of both
  // (e.g. a direct "skip if small" edge alongside an unconditional edge from
  // an approval gate) must still run when the unconditional path is
  // satisfied, even if its other, unrelated gating edge fails. Excluding
  // plain edges entirely (as an earlier version of this did) broke exactly
  // that convergence: a node fed by both a failing conditional short-circuit
  // and an approved gate needs the gate's unconditional edge to count.
  const incomingEdges: Record<string, IncomingEdgeInfo[]> = {};
  for (const edge of edges) {
    const hasRule = edge.evaluationMode === "deterministic" && !!edge.rule;
    // A "handoff" edge has no condition/rule of its own -- the routing
    // signal comes from the SOURCE node's own structured output (which
    // downstream node it names as the handoff target), evaluated per-
    // candidate in filterGatedNodes. Still gating: it must be judged, not
    // treated as an always-satisfied plain edge.
    const isGating = !!edge.condition || hasRule || edge.evaluationMode === "handoff";
    if (!incomingEdges[edge.targetNodeId]) incomingEdges[edge.targetNodeId] = [];
    incomingEdges[edge.targetNodeId].push({
      sourceNodeId: edge.sourceNodeId,
      isGating,
      evaluationMode: edge.evaluationMode || "ai",
      condition: edge.condition ?? null,
      rule: (edge.rule as RuleGroup | null) ?? null,
    });
  }

  return {
    waves,
    edgeMap,
    nodeConfig,
    incomingEdges,
    totalNodes: nodes.length,
    totalWaves: waves.length,
    maxParallelism: waves.length > 0 ? Math.max(...waves.map((w) => w.nodes.length)) : 0,
  };
}

// For a Handoff-mode edge, the routing decision comes from the SOURCE
// node's own output naming its target -- but the agent can only do that if
// it's told which target labels are valid. Looks up, for a given node,
// which of its outgoing edges (via edgeMap) are handoff edges, returning
// the target nodes' labels.
function getHandoffTargetLabels(nodeId: string, plan: ComputedWavePlan): string[] {
  const targets = plan.edgeMap[nodeId] || [];
  const labels: string[] = [];
  for (const targetId of targets) {
    const incoming = plan.incomingEdges[targetId] || [];
    const isHandoffEdge = incoming.some((e) => e.sourceNodeId === nodeId && e.evaluationMode === "handoff");
    if (isHandoffEdge) labels.push(plan.nodeConfig[targetId]?.label || targetId);
  }
  return labels;
}

/**
 * Build the structured text input for an agent node.
 * The agent receives the full accumulated state so it can read prior wave outputs.
 */
function buildAgentInput(
  nodeId: string,
  currentState: Record<string, any>,
  nodeConfig: NodePlanConfig,
  userInput?: string,
  handoffTargets?: string[],
): string {
  const sections: string[] = [];
  sections.push(`## DAG EXECUTION CONTEXT`);
  sections.push(`Node: ${nodeId}`);
  sections.push(`Role: ${nodeConfig.label}`);
  sections.push(`Output Key: ${nodeConfig.stateKey}`);
  sections.push(``);

  if (handoffTargets && handoffTargets.length > 0) {
    sections.push(`## HANDOFF ROUTING`);
    sections.push(`This step can route to one of the following next steps. To do so, include a "handoff_to" field in your JSON output naming the exact step below:`);
    for (const label of handoffTargets) sections.push(`- "${label}"`);
    sections.push(``);
  }

  if (userInput) {
    sections.push(`## USER REQUEST`);
    sections.push(userInput);
    sections.push(``);
  }

  for (const [key, value] of Object.entries(currentState)) {
    if (value === null || value === undefined) continue;
    sections.push(`## STATE: ${key}`);
    sections.push(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
    sections.push(``);
  }

  return sections.join("\n");
}

/**
 * Apply reducer semantics when merging a node's output into shared state.
 */
export function applyReducer(
  current: any,
  incoming: any,
  reducer: StateFieldDef["reducer"],
): any {
  switch (reducer) {
    case "append": {
      const existing = Array.isArray(current) ? current : [];
      const next = Array.isArray(incoming) ? incoming : [incoming];
      return [...existing, ...next];
    }
    case "merge_object":
      return { ...(current || {}), ...(incoming || {}) };
    case "sum":
      return (current || 0) + (incoming || 0);
    case "last_wins":
    default:
      return incoming;
  }
}

/**
 * Merge all node outputs from a wave into the current shared state.
 */
function mergeWaveOutputs(
  currentState: Record<string, any>,
  nodeResults: NodeExecutionResult[],
  stateSchema: Record<string, StateFieldDef>,
): Record<string, any> {
  const merged = { ...currentState };

  for (const result of nodeResults) {
    for (const [key, value] of Object.entries(result.output)) {
      const fieldDef = stateSchema[key];

      if (fieldDef?.writable_by && fieldDef.writable_by.length > 0) {
        const allowed = fieldDef.writable_by;
        if (!allowed.includes("*") && !allowed.includes(result.nodeId)) {
          console.warn(
            `[UWS] Node "${result.nodeId}" cannot write field "${key}" (writable_by: [${allowed.join(", ")}]). Skipping.`,
          );
          continue;
        }
      }

      const reducer: StateFieldDef["reducer"] = fieldDef?.reducer || "last_wins";
      merged[key] = applyReducer(merged[key], value, reducer);

      // An agent's raw text answer often contains a fenced JSON block with
      // semantically-named fields the LLM itself chose (e.g. writing
      // `{"briefApproved": true}` because its instructions asked for that
      // field). Previously those fields only ever existed in the *ephemeral*
      // pipelineState computed for this team's own gating (buildPipelineState)
      // and never made it into currentState/finalState -- so a PARENT team
      // referencing this one as a Team Reference node could never see them,
      // since only finalState gets passed up (see executeTeamReferenceNode).
      // Promoting them here means they survive into finalState and keep
      // working once nested one or more levels deep.
      if (typeof value === "string") {
        const extracted = extractStructuredOutput(value);
        if (extracted) {
          for (const [extractedKey, extractedValue] of Object.entries(extracted)) {
            if (extractedKey === key) continue; // don't clobber the raw-text field with its own parse
            const extractedFieldDef = stateSchema[extractedKey];
            if (extractedFieldDef?.writable_by && extractedFieldDef.writable_by.length > 0) {
              const allowed = extractedFieldDef.writable_by;
              if (!allowed.includes("*") && !allowed.includes(result.nodeId)) continue;
            }
            const extractedReducer: StateFieldDef["reducer"] = extractedFieldDef?.reducer || "last_wins";
            merged[extractedKey] = applyReducer(merged[extractedKey], extractedValue, extractedReducer);
          }
        }
      }
    }
  }

  return merged;
}

/**
 * Core DAG Execution Engine.
 * Runs a team blueprint as a wave-based parallel DAG with shared typed state.
 */
export class DAGExecutionEngine {
  /**
   * Execute the full DAG wave by wave.
   * Returns the merged final state.
   */
  async execute(config: DAGExecutionConfig): Promise<DAGExecutionResult> {
    let currentState = { ...config.initialState };
    const waveResults: WaveExecutionResult[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;
    let totalToolCalls = 0;
    let success = true;

    // Accumulates every completed node's raw output text across the whole
    // run (not just the current wave) so a later wave's gating edges can
    // reference any earlier node's output, not only the immediately
    // preceding one -- computeWaves builds arbitrary DAGs, not fixed tiers.
    const nodeOutputText = new Map<string, string>();
    const nodeLabelById = new Map<string, string>(
      Object.entries(config.executionPlan.nodeConfig).map(([id, nc]) => [id, nc.label]),
    );
    // A node fed only by a skipped node's unconditional edge has no real
    // trigger and should itself be skipped -- see filterGatedNodes.
    const skippedNodeIds = new Set<string>();

    // Resuming after a restart: replay already-completed waves' bookkeeping
    // (bumping the same totals/maps the main loop below updates) without
    // re-executing anything. currentState itself is NOT recomputed here --
    // it comes in via config.initialState already reflecting these waves,
    // since onWaveComplete persists it after every wave in the original run.
    if (config.resumePriorWaveResults) {
      for (const wr of config.resumePriorWaveResults) {
        waveResults.push(wr);
        for (const nr of wr.nodes) {
          totalPromptTokens += nr.promptTokens;
          totalCompletionTokens += nr.completionTokens;
          totalCostUsd += nr.costUsd || 0;
          totalToolCalls += nr.toolCallCount || 0;
          if (nr.status === "skipped") skippedNodeIds.add(nr.nodeId);
          if (nr.childSkippedCount && nr.childSkippedCount > 0) skippedNodeIds.add(nr.nodeId);
          const nc = config.executionPlan.nodeConfig[nr.nodeId];
          if (nc && nr.status === "completed") {
            const value = nr.output[nc.stateKey];
            if (value != null) nodeOutputText.set(nr.nodeId, typeof value === "string" ? value : JSON.stringify(value));
          }
        }
      }
    }

    for (const wave of config.executionPlan.waves) {
      if (config.resumeFromWave && wave.wave_number < config.resumeFromWave) continue;
      const waveStart = Date.now();

      const { eligibleNodeIds, skippedResults } = await this.filterGatedNodes(
        wave.nodes,
        config.executionPlan.incomingEdges,
        currentState,
        nodeOutputText,
        nodeLabelById,
        skippedNodeIds,
      );

      const nodePromises = eligibleNodeIds.map((nodeId) => {
        config.onNodeStart?.(nodeId, wave.wave_number);
        return this.executeNode(nodeId, currentState, config);
      });

      let nodeResults: NodeExecutionResult[];

      if (config.errorStrategy === "fail_fast") {
        nodeResults = [...skippedResults, ...(await Promise.all(nodePromises))];
        const failed = nodeResults.find((r) => r.status === "failed");
        if (failed) {
          const waveResult: WaveExecutionResult = {
            waveNumber: wave.wave_number,
            startedAt: new Date(waveStart).toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - waveStart,
            nodes: nodeResults,
          };
          waveResults.push(waveResult);
          throw new DAGExecutionError(
            `Node ${failed.nodeId} failed in wave ${wave.wave_number}: ${failed.error}`,
            { waveNumber: wave.wave_number, nodeId: failed.nodeId, waveResults },
          );
        }
      } else {
        const settled = await Promise.allSettled(nodePromises);
        const executedResults = settled.map((s, i) => {
          if (s.status === "fulfilled") return s.value;
          const nc = config.executionPlan.nodeConfig[eligibleNodeIds[i]];
          return {
            nodeId: eligibleNodeIds[i],
            agentId: nc?.agentId || "",
            status: "failed" as const,
            output: nc?.fallbackOutput ? { [nc.stateKey]: nc.fallbackOutput } : {},
            error: (s as PromiseRejectedResult).reason?.message || "Unknown error",
            durationMs: 0,
            promptTokens: 0,
            completionTokens: 0,
            traceId: "",
          };
        });
        nodeResults = [...skippedResults, ...executedResults];
        if (nodeResults.some((r) => r.status === "failed")) success = false;
      }

      // Skipped and executed results were assembled as two separate lists --
      // restore wave.nodes' original order so the wave display doesn't jumble
      // gated nodes to the front.
      const resultByNodeId = new Map(nodeResults.map((r) => [r.nodeId, r]));
      nodeResults = wave.nodes.map((id) => resultByNodeId.get(id)!);

      for (const nr of nodeResults) {
        config.onNodeComplete?.(nr.nodeId, wave.wave_number, nr);
        totalPromptTokens += nr.promptTokens;
        totalCompletionTokens += nr.completionTokens;
        totalCostUsd += nr.costUsd || 0;
        totalToolCalls += nr.toolCallCount || 0;
        if (nr.status === "skipped") skippedNodeIds.add(nr.nodeId);
        if (nr.childSkippedCount && nr.childSkippedCount > 0) skippedNodeIds.add(nr.nodeId);
        const nc = config.executionPlan.nodeConfig[nr.nodeId];
        if (nc && nr.status === "completed") {
          const value = nr.output[nc.stateKey];
          if (value != null) nodeOutputText.set(nr.nodeId, typeof value === "string" ? value : JSON.stringify(value));
        }
      }

      currentState = mergeWaveOutputs(currentState, nodeResults, config.stateSchema);

      const waveResult: WaveExecutionResult = {
        waveNumber: wave.wave_number,
        startedAt: new Date(waveStart).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - waveStart,
        nodes: nodeResults,
      };
      waveResults.push(waveResult);

      if (config.onWaveComplete) {
        await config.onWaveComplete(wave.wave_number, currentState);
      }
      if (config.onWaveResult) {
        await config.onWaveResult(waveResult, waveResults);
      }

      // A rejected/timed-out approval gate always halts the pipeline, even
      // under errorStrategy "best_effort" -- unlike an ordinary failed node,
      // there is no sensible "continue anyway" for a decision nobody made.
      // (fail_fast already halts on any failure via the throw above.)
      const rejectedGate = nodeResults.find(
        (nr) => nr.status === "failed" && config.executionPlan.nodeConfig[nr.nodeId]?.gateType,
      );
      if (rejectedGate) {
        success = false;
        break;
      }

      // Aggregate run-level budget (Gap 3b): distinct from the per-agent-node
      // cost cap enforced inside executePromptWithMcp -- this catches a
      // pipeline whose individual nodes are each cheap but which adds up
      // across many waves/nodes. Opt-in via the team agent's own
      // runtimeConfig, checked once per completed wave (not per-node) since
      // that's the only point totals are known without extra DB round-trips.
      const maxTotalCostUsd = config.teamAgentRuntimeConfig?.maxTotalCostUsd;
      const maxTotalToolCalls = config.teamAgentRuntimeConfig?.maxTotalToolCallsPerRun;
      let budgetBreach: string | null = null;
      if (typeof maxTotalCostUsd === "number" && totalCostUsd >= maxTotalCostUsd) {
        budgetBreach = `Run-level cost budget exceeded: $${totalCostUsd.toFixed(4)} >= $${maxTotalCostUsd} for team agent ${config.teamAgentId}`;
      } else if (typeof maxTotalToolCalls === "number" && totalToolCalls >= maxTotalToolCalls) {
        budgetBreach = `Run-level tool-call budget exceeded: ${totalToolCalls} >= ${maxTotalToolCalls} for team agent ${config.teamAgentId}`;
      }
      if (budgetBreach) {
        storage.createAuditEvent({
          actorType: "system",
          actorId: "dag-run-budget-gate",
          action: "dag_run_throttled_budget_exceeded",
          objectType: "agent",
          objectId: config.teamAgentId,
          details: JSON.stringify({ reason: budgetBreach, maxTotalCostUsd, maxTotalToolCalls, totalCostUsd, totalToolCalls, wave: wave.wave_number }),
        }).catch(() => {});
        success = false;
        break;
      }
    }

    return { finalState: currentState, waveResults, totalPromptTokens, totalCompletionTokens, totalCostUsd, totalToolCalls, success, skippedNodeIds: Array.from(skippedNodeIds) };
  }

  /**
   * Splits a wave's node ids into those actually eligible to run and those
   * gated out, synthesizing a "skipped" result for the latter so they still
   * show up in the wave's timeline. A node with no incoming edges always
   * runs (root). A node with incoming edges runs if ANY of them is
   * satisfied (OR across all incoming edges, gating or not):
   *   - a plain (non-gating) edge is satisfied as long as its source
   *     actually ran (wasn't itself skipped) -- it exists only to order
   *     execution and must not block the node it points to just because
   *     ANOTHER, unrelated gating edge into the same node failed. This is
   *     what makes a "direct skip if small" edge and an "unconditional edge
   *     from an approval gate" converge correctly on one downstream node.
   *   - a gating edge is satisfied only if its condition/rule evaluates true.
   * Mirrors executeTeamPipeline's conditional-edge-filtering semantics
   * (agent-runtime.ts) for the gating half; the plain-edge half is this
   * engine's own addition since computeWaves supports arbitrary DAGs, not
   * just executeTeamPipeline's fixed linear tiers.
   */
  private async filterGatedNodes(
    nodeIds: string[],
    incomingEdges: Record<string, IncomingEdgeInfo[]>,
    currentState: Record<string, any>,
    nodeOutputText: Map<string, string>,
    nodeLabelById: Map<string, string>,
    skippedNodeIds: Set<string>,
  ): Promise<{ eligibleNodeIds: string[]; skippedResults: NodeExecutionResult[] }> {
    if (nodeIds.every((id) => (incomingEdges[id]?.length ?? 0) === 0)) {
      return { eligibleNodeIds: nodeIds, skippedResults: [] };
    }

    // Built once per wave, not per node -- shared across every gating check.
    const pipelineState = buildPipelineState(nodeOutputText, nodeLabelById);

    const eligibleNodeIds: string[] = [];
    const skippedResults: NodeExecutionResult[] = [];

    for (const nodeId of nodeIds) {
      const incoming = incomingEdges[nodeId];
      if (!incoming || incoming.length === 0) {
        eligibleNodeIds.push(nodeId);
        continue;
      }

      const outcomes = await Promise.all(incoming.map(async (edge) => {
        if (!edge.isGating) return !skippedNodeIds.has(edge.sourceNodeId);
        if (edge.evaluationMode === "deterministic" && edge.rule) {
          return evaluateRule(edge.rule, pipelineState).result;
        }
        // An edge with an unresolved (skipped) source has no output to
        // judge a condition against -- treat it as not satisfied rather
        // than defaulting open, so a skip doesn't silently cascade approval.
        const sourceOutput = nodeOutputText.get(edge.sourceNodeId);
        if (sourceOutput == null) return false;
        if (edge.evaluationMode === "handoff") {
          return isHandoffTarget(sourceOutput, nodeLabelById.get(nodeId) || "");
        }
        return evaluateCondition(edge.condition || "", sourceOutput);
      }));

      if (outcomes.some(Boolean)) {
        eligibleNodeIds.push(nodeId);
      } else {
        skippedResults.push({
          nodeId,
          agentId: "",
          status: "skipped",
          output: {},
          error: "No incoming edge condition was satisfied",
          durationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          traceId: "",
        });
      }
    }

    return { eligibleNodeIds, skippedResults };
  }

  /**
   * Execute a single node.
   * If the node has a refTeamAgentId (team_reference), it recursively executes
   * that team's blueprint as a nested DAG — passing the current state as the
   * child's initialState and merging the child's finalState back.
   */
  private async executeNode(
    nodeId: string,
    currentState: Record<string, any>,
    config: DAGExecutionConfig,
  ): Promise<NodeExecutionResult> {
    const nc = config.executionPlan.nodeConfig[nodeId];
    if (!nc) {
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: {},
        error: `Node config not found for ${nodeId}`,
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const start = Date.now();

    if (nc.nodeType === "skill" && nc.refSkillId) {
      return this.executeSkillNode(nodeId, nc, start);
    }

    if (nc.nodeType === "knowledge_base" && nc.refKnowledgeBaseId) {
      return this.executeKnowledgeBaseNode(nodeId, nc, start);
    }

    if (nc.nodeType === "edge_gate" || nc.gateType) {
      return this.executeGateNode(nodeId, nc, currentState, config, start);
    }

    if (nc.refTeamAgentId) {
      return this.executeTeamReferenceNode(nodeId, nc, currentState, config, start);
    }

    if (nc.refRemoteAgentId) {
      return this.executeRemoteAgentNode(nodeId, nc, currentState, start);
    }

    if (nc.nodeType === "tool_set") {
      return this.executeToolSetNode(nodeId, nc, start);
    }

    if (!nc.agentId) {
      return {
        nodeId,
        agentId: "",
        status: "skipped",
        output: {},
        error: "No agentId or refTeamAgentId configured",
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const handoffTargets = getHandoffTargetLabels(nodeId, config.executionPlan);
    const agentInput = buildAgentInput(nodeId, currentState, nc, currentState["request"] as string | undefined, handoffTargets);

    // A Tool Set node directly upstream of this agent node scopes which MCP
    // tools it may call -- resolved to tool names (not ids) so it can be
    // enforced the same way the whole-agent skill gate is, in executeWorkerAgent.
    const toolSetSourceIds = (config.executionPlan.incomingEdges[nodeId] || [])
      .map(e => e.sourceNodeId)
      .filter(sourceId => config.executionPlan.nodeConfig[sourceId]?.nodeType === "tool_set");
    let toolAllowlist: string[] | undefined;
    if (toolSetSourceIds.length > 0) {
      const toolIds = toolSetSourceIds.flatMap(sourceId => config.executionPlan.nodeConfig[sourceId]?.refToolIds || []);
      if (toolIds.length > 0) {
        toolAllowlist = await this.resolveToolNames(toolIds);
      }
    }

    const workerResult = await this.invokeAgentWithTimeout(nc.agentId, agentInput, config, nc.timeoutMs, toolAllowlist);

    const durationMs = Date.now() - start;

    if (!workerResult.success) {
      if (nc.fallbackOutput) {
        return {
          nodeId,
          agentId: nc.agentId,
          status: "failed",
          output: { [nc.stateKey]: nc.fallbackOutput },
          error: workerResult.error,
          durationMs,
          promptTokens: 0,
          completionTokens: 0,
          traceId: "",
        };
      }
      return {
        nodeId,
        agentId: nc.agentId,
        status: "failed",
        output: {},
        error: workerResult.error,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    return {
      nodeId,
      agentId: nc.agentId,
      status: "completed",
      output: { [nc.stateKey]: workerResult.output },
      durationMs,
      promptTokens: workerResult.promptTokens || 0,
      completionTokens: workerResult.completionTokens || 0,
      costUsd: workerResult.costUsd || 0,
      toolCallCount: workerResult.toolCallCount || 0,
      traceId: workerResult.traceId || "",
    };
  }

  /** Resolves team_blueprint_nodes.refToolIds (mcp_server_tools.id values) to tool NAME strings, the same key the whole-agent skill gate in agent-runtime.ts filters availableTools by. */
  private async resolveToolNames(toolIds: string[]): Promise<string[]> {
    if (toolIds.length === 0) return [];
    const allTools = await storage.getAllMcpServerTools();
    const idSet = new Set(toolIds);
    return allTools.filter(t => idSet.has(t.id)).map(t => t.name.toLowerCase());
  }

  /**
   * Execute a "tool_set" node. Like a skill node, this isn't a standalone
   * runnable unit -- it's a scoping declaration. Resolving refToolIds and
   * writing them to state lets a business user see which tools were selected
   * on this run, and (unlike before) any internal_agent node directly
   * downstream of this node actually has its available MCP tools restricted
   * to this set -- enforced in executeNode's default branch via
   * resolveToolNames + executeWorkerAgent's dagToolAllowlist gate. A node
   * with no incoming/outgoing tool_set relationship is otherwise a no-op
   * that must still "complete" (not skip) so it doesn't cascade-skip
   * downstream nodes reachable only through it.
   */
  private async executeToolSetNode(
    nodeId: string,
    nc: NodePlanConfig,
    start: number,
  ): Promise<NodeExecutionResult> {
    const toolIds = nc.refToolIds || [];
    const toolNames = await this.resolveToolNames(toolIds);
    return {
      nodeId,
      agentId: "",
      status: "completed",
      output: { [nc.stateKey]: { toolIds, toolNames } },
      durationMs: Date.now() - start,
      promptTokens: 0,
      completionTokens: 0,
      traceId: "",
    };
  }

  /**
   * Execute a "skill" node. Skills are prompt-content overlays in this codebase
   * (agents.preloadedSkills works the same way for a whole agent — see
   * agent-runtime.ts's skill gate) rather than standalone runnable units, so
   * "executing" one means resolving its content and merging it into shared DAG
   * state under the node's stateKey. buildAgentInput already dumps every state
   * key into downstream agent nodes' prompts, so no changes are needed there —
   * a skill node placed before an agent node in the graph makes its content
   * appear in that agent's context automatically. This is advisory content
   * injection only: unlike the whole-agent skill gate, allowedTools from a
   * skill node is not enforced as a hard tool-call allowlist here.
   */
  private async executeSkillNode(
    nodeId: string,
    nc: NodePlanConfig,
    start: number,
  ): Promise<NodeExecutionResult> {
    const skill = await storage.getSkill(nc.refSkillId!);
    if (!skill) {
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: {},
        error: `Skill ${nc.refSkillId} not found`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const toolsNote = skill.allowedTools?.length ? `\n\nAllowed tools: ${skill.allowedTools.join(", ")}` : "";
    const content = `# ${skill.name}\n${skill.description}${toolsNote}\n\n${skill.markdownBody || ""}`.trim();

    return {
      nodeId,
      agentId: "",
      status: "completed",
      output: { [nc.stateKey]: content },
      durationMs: Date.now() - start,
      promptTokens: 0,
      completionTokens: 0,
      traceId: "",
    };
  }

  /**
   * Execute a "knowledge_base" node: run a real pgvector search (the same
   * searchKnowledgeBaseChunks agent-runtime.ts uses for a whole agent's
   * explicit KB bindings) and merge the retrieved chunks into shared DAG
   * state under the node's stateKey, so downstream agent nodes pick them up
   * automatically via buildAgentInput's state dump -- same content-injection
   * mechanism as executeSkillNode above, just backed by a live search instead
   * of static content. kbQuery is a fixed string set in the node inspector
   * (this is advisory retrieval scoped to the graph, not a conversational
   * agent that can reformulate its own query).
   */
  private async executeKnowledgeBaseNode(
    nodeId: string,
    nc: NodePlanConfig,
    start: number,
  ): Promise<NodeExecutionResult> {
    const kb = await storage.getKnowledgeBase(nc.refKnowledgeBaseId!);
    if (!kb) {
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: {},
        error: `Knowledge base ${nc.refKnowledgeBaseId} not found`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const query = nc.kbQuery?.trim() || nc.label;
    const chunks = await searchKnowledgeBaseChunks(kb.id, query, 5, 0.3);
    const content = chunks.length > 0
      ? `# ${kb.name} (retrieved for: "${query}")\n\n${chunks.map(c => c.content).join("\n\n---\n\n")}`
      : `# ${kb.name}\nNo results above the relevance threshold for: "${query}"`;

    return {
      nodeId,
      agentId: "",
      status: "completed",
      output: { [nc.stateKey]: content },
      durationMs: Date.now() - start,
      promptTokens: 0,
      completionTokens: 0,
      traceId: "",
    };
  }

  /**
   * Outbound call to an external agent, described by a remoteAgents row --
   * the A2A "Agent Card" vocabulary that table already models (agentCardUrl,
   * trustTier, allowedSkills, defaultInputModes/OutputModes). Sends a
   * best-effort A2A-shaped message request to the card's message endpoint.
   * NOTE: this wire format has not been verified against a live third-party
   * A2A server -- treat it as a reasonable default to adjust once a real
   * external target is available, not a guaranteed-compliant client. Pairs
   * with this platform's own inbound adapter (POST /api/a2a/v1/agents/:id/message).
   */
  private async executeRemoteAgentNode(
    nodeId: string,
    nc: NodePlanConfig,
    currentState: Record<string, any>,
    start: number,
  ): Promise<NodeExecutionResult> {
    const remote = await storage.getRemoteAgent(nc.refRemoteAgentId!);
    if (!remote || !remote.agentCardUrl) {
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: {},
        error: `Remote agent ${nc.refRemoteAgentId} not found or has no agentCardUrl configured`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    // Trust gate (Gap 3d): a static tier floor -- mirrors the same
    // trustTierOrder threshold the older, simulated governance-proxy.ts A2A
    // path already enforces, so "untrusted" is blocked the same way
    // everywhere -- plus a rolling-score floor computed from this node's own
    // outcome history (recorded below on every call), once there's enough of
    // a track record to trust the score over the cold-start default (0.5).
    const trustTierOrder: Record<string, number> = { untrusted: 0, basic: 1, verified: 2, trusted: 3, privileged: 4 };
    const currentTier = trustTierOrder[remote.trustTier || "basic"] ?? 1;
    const invocationCount = remote.invocationCount ?? 0;
    const trustScore = remote.trustScore ?? 0.5;
    const MIN_SAMPLE_SIZE = 3;
    const MIN_TRUST_SCORE = 0.2;
    let trustBlockReason: string | null = null;
    if (currentTier < 1) {
      trustBlockReason = `Trust tier "${remote.trustTier}" is below minimum (basic)`;
    } else if (invocationCount >= MIN_SAMPLE_SIZE && trustScore < MIN_TRUST_SCORE) {
      trustBlockReason = `Trust score ${trustScore.toFixed(2)} is below minimum (${MIN_TRUST_SCORE}) after ${invocationCount} prior calls`;
    }
    if (trustBlockReason) {
      storage.createAuditEvent({
        actorType: "agent",
        actorId: nc.agentId || "dag-orchestrator",
        action: "a2a_outbound_blocked",
        objectType: "remote_agent",
        objectId: remote.id,
        details: JSON.stringify({ reason: trustBlockReason, trustTier: remote.trustTier, trustScore, invocationCount }),
      }).catch(() => {});
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: nc.fallbackOutput ? { [nc.stateKey]: nc.fallbackOutput } : {},
        error: `Remote agent "${remote.agentCardUrl}" blocked by trust gate: ${trustBlockReason}`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    // Fire-and-forget outcome recording, shared by every return path below --
    // recomputes a simple all-time success ratio (mirrors skills.performanceScore's
    // update-after-use pattern) rather than batch-scoring separately.
    const recordOutcome = (success: boolean, failureReason?: string) => {
      const nextInvocationCount = invocationCount + 1;
      const nextSuccessCount = (remote.successCount ?? 0) + (success ? 1 : 0);
      storage.updateRemoteAgent(remote.id, {
        invocationCount: nextInvocationCount,
        successCount: nextSuccessCount,
        trustScore: nextSuccessCount / nextInvocationCount,
        lastInvokedAt: new Date(),
        ...(failureReason ? { lastFailureReason: failureReason } : {}),
      } as any).catch(() => {});
      storage.createAuditEvent({
        actorType: "agent",
        actorId: nc.agentId || "dag-orchestrator",
        action: "a2a_outbound_call",
        objectType: "remote_agent",
        objectId: remote.id,
        details: JSON.stringify({ success, failureReason, agentCardUrl: remote.agentCardUrl }),
      }).catch(() => {});
    };

    const messageText = buildAgentInput(nodeId, currentState, nc, currentState["request"] as string | undefined);
    // Agent Card URLs conventionally point at the card document itself
    // (e.g. .../.well-known/agent.json); the message endpoint lives at the
    // same base with that suffix swapped out.
    const invokeUrl = remote.agentCardUrl.replace(/\/\.well-known\/agent\.json$/, "/message");

    try {
      const res = await fetch(invokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { role: "user", parts: [{ type: "text", text: messageText }] } }),
        signal: AbortSignal.timeout(nc.timeoutMs || 30000),
      });
      if (!res.ok) {
        recordOutcome(false, `HTTP ${res.status}`);
        return {
          nodeId,
          agentId: "",
          status: "failed",
          output: nc.fallbackOutput ? { [nc.stateKey]: nc.fallbackOutput } : {},
          error: `Remote agent "${remote.agentCardUrl}" returned ${res.status}`,
          durationMs: Date.now() - start,
          promptTokens: 0,
          completionTokens: 0,
          traceId: "",
        };
      }
      const data: any = await res.json();
      const text = data?.message?.parts?.find((p: any) => p?.type === "text")?.text
        ?? data?.message?.parts?.[0]?.text
        ?? (typeof data === "string" ? data : JSON.stringify(data));
      recordOutcome(true);
      return {
        nodeId,
        agentId: "",
        status: "completed",
        output: { [nc.stateKey]: text },
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: data?.taskId || "",
      };
    } catch (err: any) {
      recordOutcome(false, err.message);
      return {
        nodeId,
        agentId: "",
        status: "failed",
        output: nc.fallbackOutput ? { [nc.stateKey]: nc.fallbackOutput } : {},
        error: `Remote agent call failed: ${err.message}`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }
  }

  /**
   * Real human-in-the-loop gate. Creates a genuine row in the existing
   * `approvals` table (same one the Approvals page already reads/writes) and
   * blocks this wave until a person approves or rejects it -- reusing
   * waitForApproval(), the exact mechanism the older executeTeamPipeline
   * engine already relies on, rather than a role-played "Manager Approval"
   * LLM call pretending to be a human decision.
   */
  private async executeGateNode(
    nodeId: string,
    nc: NodePlanConfig,
    currentState: Record<string, any>,
    config: DAGExecutionConfig,
    start: number,
  ): Promise<NodeExecutionResult> {
    // Human decision time, not LLM-call time -- the generic 30s node default
    // (meant for LLM timeouts) would expire a gate almost immediately, so a
    // gate always gets at least the same 30-minute floor the old engine used.
    const timeoutMs = Math.max(nc.timeoutMs, 30 * 60 * 1000);
    const context = Object.entries(currentState)
      .filter(([k]) => k !== "request")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n") || (currentState.request as string) || "";

    let approvalId = "";
    const result = await waitForApproval(
      config.teamAgentId,
      nc.label || "Approval Gate",
      nc.gateType || "approval",
      context,
      timeoutMs,
      (id) => {
        approvalId = id;
        config.onApprovalPending?.(nodeId, id);
      },
      config.resumePendingApprovalId,
    );

    return {
      nodeId,
      agentId: "",
      status: result.approved ? "completed" : "failed",
      output: result.approved ? { [nc.stateKey]: { approved: true, decidedBy: result.decidedBy } } : {},
      error: result.approved ? undefined : (result.reason || "Approval gate rejected or timed out"),
      durationMs: Date.now() - start,
      promptTokens: 0,
      completionTokens: 0,
      traceId: approvalId,
    };
  }

  /**
   * Recursive execution for team_reference nodes.
   * The child team's blueprint is loaded, waves are computed, and the DAG engine
   * calls itself recursively with the current shared state as the child's initialState.
   * The child's finalState is merged back into the parent via the node's stateKey.
   */
  private async executeTeamReferenceNode(
    nodeId: string,
    nc: NodePlanConfig,
    currentState: Record<string, any>,
    config: DAGExecutionConfig,
    start: number,
  ): Promise<NodeExecutionResult> {
    const teamAgentId = nc.refTeamAgentId!;

    const teamAgent = await storage.getAgent(teamAgentId);
    if (!teamAgent) {
      return {
        nodeId,
        agentId: teamAgentId,
        status: "failed",
        output: {},
        error: `Team agent ${teamAgentId} not found`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const blueprintId = (teamAgent as any).blueprintId;
    if (!blueprintId) {
      return {
        nodeId,
        agentId: teamAgentId,
        status: "failed",
        output: {},
        error: `Team agent ${teamAgentId} has no blueprintId`,
        durationMs: Date.now() - start,
        promptTokens: 0,
        completionTokens: 0,
        traceId: "",
      };
    }

    const childNodes = await storage.getTeamBlueprintNodes(blueprintId);
    const childEdges = await storage.getTeamBlueprintEdges(blueprintId);

    const childPlan = computeWaves(childNodes, childEdges);

    const existingSchema = await storage.getDagStateSchemaByTeamAgent(teamAgentId);
    const childSchema: Record<string, StateFieldDef> = existingSchema
      ? (existingSchema.fields as Record<string, StateFieldDef>)
      : {};

    const childResult = await this.execute({
      executionPlan: childPlan,
      stateSchema: childSchema,
      initialState: { ...currentState },
      errorStrategy: config.errorStrategy,
      teamAgentId,
      teamAgentRuntimeConfig: (teamAgent.runtimeConfig as Record<string, any>) || {},
      onWaveComplete: config.onWaveComplete,
      onApprovalPending: config.onApprovalPending,
    });

    const durationMs = Date.now() - start;

    return {
      nodeId,
      agentId: teamAgentId,
      status: childResult.success ? "completed" : "failed",
      output: { [nc.stateKey]: childResult.finalState },
      durationMs,
      promptTokens: childResult.totalPromptTokens,
      completionTokens: childResult.totalCompletionTokens,
      costUsd: childResult.totalCostUsd,
      toolCallCount: childResult.totalToolCalls,
      traceId: "",
      childSkippedCount: childResult.skippedNodeIds.length,
    };
  }

  /**
   * Invoke an agent via the existing executeWorkerAgent infrastructure.
   * Wraps it with a timeout race.
   */
  private async invokeAgentWithTimeout(
    agentId: string,
    contextInput: string,
    config: DAGExecutionConfig,
    timeoutMs: number,
    toolAllowlist?: string[],
  ): Promise<{ success: boolean; output: string; error?: string; promptTokens?: number; completionTokens?: number; traceId?: string; costUsd?: number; toolCallCount?: number }> {
    const mockTeamAgent = {
      deploymentId: undefined,
      agentId: "__dag_orchestrator__",
      agentName: "DAG Orchestrator",
      mcpServerIds: [],
      intervalMs: 0,
      industry: config.teamAgentRuntimeConfig?.industry,
      prompt: contextInput,
      agentType: "team" as const,
      runtimeConfig: config.teamAgentRuntimeConfig || {},
    };

    const timeoutPromise = new Promise<{ success: boolean; output: string; error: string }>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error(`Agent ${agentId} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
    );

    const workerPromise = executeWorkerAgent(agentId, mockTeamAgent as any, contextInput, 0, toolAllowlist);

    try {
      const result = await Promise.race([workerPromise, timeoutPromise]);
      return {
        success: (result as any).success,
        output: (result as any).output || "",
        error: (result as any).success ? undefined : ((result as any).step?.error || `Agent execution failed`),
        promptTokens: (result as any).promptTokens || 0,
        completionTokens: (result as any).completionTokens || 0,
        costUsd: (result as any).costUsd || 0,
        toolCallCount: (result as any).toolCallCount || 0,
        traceId: (result as any).step?.id || "",
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }
}

export interface RunTeamAgentDagOptions {
  errorStrategy?: "fail_fast" | "best_effort";
  onNodeStart?: (nodeId: string, wave: number, label: string, totalWaves: number) => void;
  onNodeComplete?: (nodeId: string, wave: number, label: string, result: NodeExecutionResult, totalWaves: number) => void;
  onApprovalPending?: (nodeId: string, wave: number, label: string, totalWaves: number, approvalId: string) => void;
}

interface DagRunSetup {
  dagRun: DagExecutionRun;
  wavePlan: ComputedWavePlan;
  stateSchema: Record<string, StateFieldDef>;
  initialState: Record<string, any>;
  nodeWave: Record<string, number>;
  teamAgentRuntimeConfig: Record<string, any>;
  resumeFromWave?: number;
  resumePriorWaveResults?: WaveExecutionResult[];
  resumePendingApprovalId?: string;
}

// Looks up a team agent's blueprint nodes/edges, computes the wave plan, and
// persists the "pending run" row up front -- split out from execution so a
// caller can hand the dagRunId to a client to watch BEFORE the (potentially
// 30-minute, if a gate is hit) execution finishes. Throws "Blueprint has no
// nodes to run" before anything is persisted if the blueprint is empty.
async function setupTeamAgentDagRun(teamAgentId: string, blueprintId: string, request: string): Promise<DagRunSetup> {
  const [nodes, edges, teamAgent] = await Promise.all([
    storage.getTeamBlueprintNodes(blueprintId),
    storage.getTeamBlueprintEdges(blueprintId),
    storage.getAgent(teamAgentId),
  ]);
  const teamAgentRuntimeConfig = (teamAgent?.runtimeConfig as Record<string, any>) || {};
  if (nodes.length === 0) throw new Error("Blueprint has no nodes to run");

  const wavePlan = computeWaves(nodes, edges);
  const nodeWave: Record<string, number> = {};
  for (const wave of wavePlan.waves) {
    for (const nodeId of wave.nodes) nodeWave[nodeId] = wave.wave_number;
  }

  const existingSchema = await storage.getDagStateSchemaByTeamAgent(teamAgentId);
  const stateSchema: Record<string, StateFieldDef> = existingSchema
    ? (existingSchema.fields as Record<string, StateFieldDef>)
    : {};

  const initialState: Record<string, any> = { request };

  const dagRun = await storage.createDagExecutionRun({
    teamAgentId,
    pipelineRunId: null,
    pipelineStageId: null,
    executionPlanId: null,
    stateSchemaId: existingSchema?.id || null,
    initialState,
    currentState: initialState,
    finalState: null,
    status: "running",
    currentWave: 0,
    totalWaves: wavePlan.totalWaves,
    startedAt: new Date(),
    waveResults: [],
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  });

  return { dagRun, wavePlan, stateSchema, initialState, nodeWave, teamAgentRuntimeConfig };
}

// Drives DAGExecutionEngine against an already-persisted run row, keeping
// currentWave/currentState (and, mid-wave, a "waiting_approval" status) live
// in the DB as it goes, then writes the final status/state. Shared by both
// the awaited (runTeamAgentDag) and fire-and-forget (startTeamAgentDagRun)
// entry points so the two never drift on what "finished" writes to the row.
async function executeTeamAgentDagRun(
  setup: DagRunSetup,
  teamAgentId: string,
  opts?: RunTeamAgentDagOptions,
): Promise<DAGExecutionResult> {
  const { dagRun, wavePlan, stateSchema, initialState, nodeWave, teamAgentRuntimeConfig, resumeFromWave, resumePriorWaveResults, resumePendingApprovalId } = setup;
  const engine = new DAGExecutionEngine();
  try {
    const result = await engine.execute({
      executionPlan: wavePlan,
      stateSchema,
      initialState,
      errorStrategy: opts?.errorStrategy || "best_effort",
      teamAgentId,
      teamAgentRuntimeConfig,
      resumeFromWave,
      resumePriorWaveResults,
      resumePendingApprovalId,
      onNodeStart: (nodeId, wave) => {
        const label = wavePlan.nodeConfig[nodeId]?.label || nodeId;
        publishDagRunEvent(dagRun.id, { type: "node_start", nodeId, label, wave, totalWaves: wavePlan.totalWaves });
        opts?.onNodeStart?.(nodeId, wave, label, wavePlan.totalWaves);
      },
      onNodeComplete: (nodeId, wave, r) => {
        const label = wavePlan.nodeConfig[nodeId]?.label || nodeId;
        publishDagRunEvent(dagRun.id, {
          type: "node_complete", nodeId, label, wave, totalWaves: wavePlan.totalWaves,
          status: r.status, durationMs: r.durationMs,
          outputPreview: previewOutput(r.output), error: r.error,
        });
        opts?.onNodeComplete?.(nodeId, wave, label, r, wavePlan.totalWaves);
      },
      onApprovalPending: (nodeId, approvalId) => {
        // Marks the row (status AND which approval it's stuck on) so a
        // polling monitoring view can distinguish "stuck waiting on a
        // person" from an ordinary in-flight wave, and so dag-resume-poller
        // can find its way back to this exact approval after a restart --
        // cleared back to "running"/null below as soon as the wave (gate
        // included) finishes, since by then the decision has already been made.
        storage.updateDagExecutionRun(dagRun.id, { status: "waiting_approval", pendingApprovalId: approvalId }).catch(() => {});
        const label = wavePlan.nodeConfig[nodeId]?.label || nodeId;
        publishDagRunEvent(dagRun.id, { type: "approval_pending", nodeId, label, wave: nodeWave[nodeId] ?? 0, totalWaves: wavePlan.totalWaves, approvalId });
        opts?.onApprovalPending?.(nodeId, nodeWave[nodeId] ?? 0, label, wavePlan.totalWaves, approvalId);
      },
      onWaveComplete: async (waveNum, state) => {
        await storage.updateDagExecutionRun(dagRun.id, { status: "running", currentWave: waveNum, currentState: state, pendingApprovalId: null });
        publishDagRunEvent(dagRun.id, { type: "wave_complete", wave: waveNum, totalWaves: wavePlan.totalWaves });
      },
      // Persist the timeline as it happens -- previously waveResults was only
      // written on the final update, so a mid-run refresh (or a post-crash
      // resume) had an empty wave-by-wave view.
      onWaveResult: async (_wave, allSoFar) => {
        await storage.updateDagExecutionRun(dagRun.id, { waveResults: allSoFar as any }).catch(() => {});
      },
    });

    await storage.updateDagExecutionRun(dagRun.id, {
      status: deriveRunStatus(result),
      finalState: result.finalState,
      currentState: result.finalState,
      waveResults: result.waveResults as any,
      totalPromptTokens: result.totalPromptTokens,
      totalCompletionTokens: result.totalCompletionTokens,
      totalCostUsd: result.totalCostUsd,
      totalToolCalls: result.totalToolCalls,
      completedAt: new Date(),
    });
    publishDagRunEvent(dagRun.id, { type: "run_complete", runStatus: deriveRunStatus(result), totalWaves: wavePlan.totalWaves });

    return result;
  } catch (execErr: any) {
    const isDagError = execErr instanceof DAGExecutionError;
    await storage.updateDagExecutionRun(dagRun.id, {
      status: "failed",
      error: execErr.message,
      waveResults: isDagError ? (execErr.context.waveResults as any) : [],
      completedAt: new Date(),
    });
    publishDagRunEvent(dagRun.id, { type: "run_complete", runStatus: "failed", error: execErr.message });
    // Callers (the run-dag route) still want to point the user at the failed
    // run record even though the promise rejected -- attach it rather than
    // making every caller thread a separate try/catch around each awaited step.
    execErr.dagRunId = dagRun.id;
    throw execErr;
  }
}

// Shared bootstrap for "run this team agent's real graph right now" --
// looks up its blueprint's nodes/edges, computes the wave plan, and drives
// DAGExecutionEngine, awaiting the full run before returning. The Workspace
// team-run path (workspace-run.ts) uses this variant because it needs the
// final answer to build one chat response.
export async function runTeamAgentDag(
  teamAgentId: string,
  blueprintId: string,
  request: string,
  opts?: RunTeamAgentDagOptions,
): Promise<{ dagRunId: string; result: DAGExecutionResult; wavePlan: ComputedWavePlan }> {
  const setup = await setupTeamAgentDagRun(teamAgentId, blueprintId, request);
  const result = await executeTeamAgentDagRun(setup, teamAgentId, opts);
  return { dagRunId: setup.dagRun.id, result, wavePlan: setup.wavePlan };
}

// Same underlying run, but returns as soon as the run row exists instead of
// waiting for the (possibly 30-minute, if a gate is hit) execution to finish
// -- so a caller like POST /api/team-agents/:id/run-dag can hand the
// dagRunId straight to the UI and let it watch the run live via
// GET /api/dag-execution-runs/:id/waves, rather than the request hanging
// for the full duration. Execution errors are swallowed here (already
// persisted onto the run row by executeTeamAgentDagRun) since there is no
// caller left awaiting this promise to report them to.
export async function startTeamAgentDagRun(
  teamAgentId: string,
  blueprintId: string,
  request: string,
  opts?: RunTeamAgentDagOptions,
): Promise<{ dagRunId: string; wavePlan: ComputedWavePlan }> {
  const setup = await setupTeamAgentDagRun(teamAgentId, blueprintId, request);
  executeTeamAgentDagRun(setup, teamAgentId, opts).catch((err) => {
    console.error(`[dag-run] ${setup.dagRun.id} failed:`, err.message);
  });
  return { dagRunId: setup.dagRun.id, wavePlan: setup.wavePlan };
}

// Rebuilds a DagRunSetup for a run that's sitting at "waiting_approval" --
// from the persisted row alone, not from any in-memory state (there isn't
// any; the process that started this run may not even be the one calling
// this). currentState/waveResults/currentWave are exactly what
// executeTeamAgentDagRun's onWaveComplete/onApprovalPending left behind, so
// resuming from them is equivalent to the original run having paused right
// here rather than crashed.
async function setupResumeForDagRun(dagRun: DagExecutionRun): Promise<DagRunSetup> {
  if (!dagRun.teamAgentId) throw new Error(`Dag run ${dagRun.id} has no teamAgentId, cannot resume`);
  const teamAgent = await storage.getAgent(dagRun.teamAgentId);
  if (!teamAgent) throw new Error(`Team agent ${dagRun.teamAgentId} not found, cannot resume run ${dagRun.id}`);
  const blueprintId = (teamAgent as any).blueprintId;
  if (!blueprintId) throw new Error(`Team agent ${dagRun.teamAgentId} has no blueprintId, cannot resume run ${dagRun.id}`);

  const [nodes, edges] = await Promise.all([
    storage.getTeamBlueprintNodes(blueprintId),
    storage.getTeamBlueprintEdges(blueprintId),
  ]);
  const wavePlan = computeWaves(nodes, edges);
  const nodeWave: Record<string, number> = {};
  for (const wave of wavePlan.waves) {
    for (const nodeId of wave.nodes) nodeWave[nodeId] = wave.wave_number;
  }

  const existingSchema = await storage.getDagStateSchemaByTeamAgent(dagRun.teamAgentId);
  const stateSchema: Record<string, StateFieldDef> = existingSchema
    ? (existingSchema.fields as Record<string, StateFieldDef>)
    : {};

  return {
    dagRun,
    wavePlan,
    stateSchema,
    initialState: (dagRun.currentState as Record<string, any>) || {},
    nodeWave,
    teamAgentRuntimeConfig: (teamAgent.runtimeConfig as Record<string, any>) || {},
    // currentWave is the last wave that fully completed before the pause --
    // resume at the very next one, which is the wave the gate node is in
    // (it never got a WaveExecutionResult persisted, so it's re-run in full;
    // see the module doc comment on resumeTeamAgentDagRun for why that's safe).
    resumeFromWave: (dagRun.currentWave || 0) + 1,
    resumePriorWaveResults: (dagRun.waveResults as unknown as WaveExecutionResult[]) || [],
    // The approval the run was parked on -- lets the re-run of the paused
    // wave's gate node recognize its own already-decided approval instead of
    // creating a duplicate (see waitForApproval's existingApprovalId param).
    resumePendingApprovalId: dagRun.pendingApprovalId || undefined,
  };
}

/**
 * Resumes a DAG run stuck at "waiting_approval" -- the counterpart to the
 * in-process wait inside waitForApproval, for when that wait didn't survive
 * (server restart) to see the decision itself. Called from two places:
 * dag-resume-poller.ts's periodic scan (the real safety net) and, as a fast
 * path, directly from the approvals PATCH route the moment a pipeline_gate
 * approval is decided, so a resume doesn't have to wait for the next scan
 * tick when the server that owns the run is still up.
 *
 * Race-safety: claimDagExecutionRunForResume does an atomic
 * waiting_approval -> running transition (a WHERE-guarded UPDATE) before
 * anything else runs -- if that returns false, either the run already
 * resumed (the in-process waiter got there first, or a duplicate scan/PATCH
 * call raced this one) or it isn't actually waiting anymore, and this
 * returns immediately without touching anything.
 *
 * Correctness note: the paused wave is re-run in full, including any
 * sibling nodes alongside the gate node -- there's no cheaper way to resume
 * a Promise.all'd wave that never got the chance to record partial results
 * before the process died. This is safe here because side-effectful tool
 * calls already carry idempotency keys (see tool-dispatcher.ts) -- a
 * repeated call is deduplicated, not re-executed for real -- and the gate
 * node itself is made idempotent the same way: setupResumeForDagRun carries
 * dagRun.pendingApprovalId forward as resumePendingApprovalId, which
 * executeGateNode passes into waitForApproval's existingApprovalId param --
 * that already-decided approval is returned immediately instead of a new
 * one being created, so the re-run doesn't ask for approval a second time.
 */
export async function resumeTeamAgentDagRun(dagRunId: string): Promise<void> {
  const claimed = await storage.claimDagExecutionRunForResume(dagRunId);
  if (!claimed) return;

  const dagRun = await storage.getDagExecutionRun(dagRunId);
  if (!dagRun) return;

  try {
    const setup = await setupResumeForDagRun(dagRun);
    console.log(`[dag-resume] Resuming run ${dagRunId} from wave ${setup.resumeFromWave}/${setup.wavePlan.totalWaves}`);
    await executeTeamAgentDagRun(setup, dagRun.teamAgentId!, {});
  } catch (err: any) {
    console.error(`[dag-resume] Failed to resume run ${dagRunId}:`, err.message);
    await storage.updateDagExecutionRun(dagRunId, { status: "failed", error: `Resume failed: ${err.message}`, completedAt: new Date() }).catch(() => {});
  }
}

// Reads the last wave's node output(s) out of a finished run's finalState --
// the natural "answer" for a caller (like Workspace chat) that wants one
// piece of text summarizing the whole pipeline rather than the full
// per-node wave trace.
export function extractFinalOutputText(result: DAGExecutionResult, wavePlan: ComputedWavePlan): string {
  // A run can be "successful" (no node errored) yet still have produced
  // nothing usable, because every node that would have written the final
  // wave's output was skipped -- e.g. a gate whose condition never matched.
  // Callers like the Workspace chat surface must say so plainly rather than
  // report a bare "completed" that reads as "your request was handled."
  const skipNote = result.skippedNodeIds.length > 0
    ? `\n\n(Note: ${result.skippedNodeIds.length} step${result.skippedNodeIds.length !== 1 ? "s" : ""} in this run didn't execute because no incoming condition was met -- check the run's monitoring view for details.)`
    : "";
  const lastWave = wavePlan.waves[wavePlan.waves.length - 1];
  if (!lastWave) return (result.success ? "Team pipeline completed with no output." : "Team pipeline failed.") + skipNote;
  const parts = lastWave.nodes.map((nodeId) => {
    const nc = wavePlan.nodeConfig[nodeId];
    const value = nc ? result.finalState[nc.stateKey] : undefined;
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }).filter((v): v is string => !!v);
  if (parts.length === 0) return (result.success ? "Team pipeline completed with no text output." : "Team pipeline failed.") + skipNote;
  return parts.join("\n\n---\n\n") + skipNote;
}
