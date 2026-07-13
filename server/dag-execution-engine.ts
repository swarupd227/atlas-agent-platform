import { storage } from "./storage";
import { executeWorkerAgent, waitForApproval, evaluateCondition, buildPipelineState } from "./agent-runtime";
import { evaluateRule } from "./rule-evaluator";
import type { DagExecutionPlan, DagExecutionRun, DagStateSchema, TeamBlueprintNode, TeamBlueprintEdge, RuleGroup } from "@shared/schema";

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

export interface NodePlanConfig {
  agentId: string | null;
  stateKey: string;
  outputSchema: Record<string, any> | null;
  fallbackOutput: Record<string, any> | null;
  timeoutMs: number;
  retryPolicy: { max_attempts: number; backoff_ms: number[] };
  nodeType: string;
  refTeamAgentId: string | null;
  refSkillId: string | null;
  label: string;
  gateType: string | null;
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
  // Fired the moment a gate node creates its approval record -- before the
  // (potentially long) wait for a human decision begins.
  onApprovalPending?: (nodeId: string, approvalId: string) => void;
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
  success: boolean;
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

  const nodeConfig: Record<string, NodePlanConfig> = {};
  for (const node of nodes) {
    nodeConfig[node.id] = {
      agentId: node.refAgentId || null,
      stateKey: node.stateKey || node.id.replace(/-/g, "_"),
      outputSchema: (node.outputSchema as Record<string, any>) || null,
      fallbackOutput: (node.fallbackOutput as Record<string, any>) || null,
      timeoutMs: node.timeoutMs || 30000,
      retryPolicy: (node.retryPolicy as any) || { max_attempts: 2, backoff_ms: [1000, 2000] },
      nodeType: node.nodeType,
      refTeamAgentId: node.refTeamAgentId || null,
      refSkillId: (node as any).refSkillId || null,
      label: node.label,
      gateType: node.gateType || null,
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
    const isGating = !!edge.condition || hasRule;
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

/**
 * Build the structured text input for an agent node.
 * The agent receives the full accumulated state so it can read prior wave outputs.
 */
function buildAgentInput(
  nodeId: string,
  currentState: Record<string, any>,
  nodeConfig: NodePlanConfig,
  userInput?: string,
): string {
  const sections: string[] = [];
  sections.push(`## DAG EXECUTION CONTEXT`);
  sections.push(`Node: ${nodeId}`);
  sections.push(`Role: ${nodeConfig.label}`);
  sections.push(`Output Key: ${nodeConfig.stateKey}`);
  sections.push(``);

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

    for (const wave of config.executionPlan.waves) {
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
        if (nr.status === "skipped") skippedNodeIds.add(nr.nodeId);
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
    }

    return { finalState: currentState, waveResults, totalPromptTokens, totalCompletionTokens, success };
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

    if (nc.nodeType === "edge_gate" || nc.gateType) {
      return this.executeGateNode(nodeId, nc, currentState, config, start);
    }

    if (nc.refTeamAgentId) {
      return this.executeTeamReferenceNode(nodeId, nc, currentState, config, start);
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

    const agentInput = buildAgentInput(nodeId, currentState, nc, currentState["request"] as string | undefined);

    const workerResult = await this.invokeAgentWithTimeout(nc.agentId, agentInput, config, nc.timeoutMs);

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
      traceId: workerResult.traceId || "",
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
      traceId: "",
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
  ): Promise<{ success: boolean; output: string; error?: string; promptTokens?: number; completionTokens?: number; traceId?: string }> {
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

    const workerPromise = executeWorkerAgent(agentId, mockTeamAgent as any, contextInput, 0);

    try {
      const result = await Promise.race([workerPromise, timeoutPromise]);
      return {
        success: (result as any).success,
        output: (result as any).output || "",
        error: (result as any).success ? undefined : ((result as any).step?.error || `Agent execution failed`),
        promptTokens: 0,
        completionTokens: 0,
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
}

// Looks up a team agent's blueprint nodes/edges, computes the wave plan, and
// persists the "pending run" row up front -- split out from execution so a
// caller can hand the dagRunId to a client to watch BEFORE the (potentially
// 30-minute, if a gate is hit) execution finishes. Throws "Blueprint has no
// nodes to run" before anything is persisted if the blueprint is empty.
async function setupTeamAgentDagRun(teamAgentId: string, blueprintId: string, request: string): Promise<DagRunSetup> {
  const [nodes, edges] = await Promise.all([
    storage.getTeamBlueprintNodes(blueprintId),
    storage.getTeamBlueprintEdges(blueprintId),
  ]);
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

  return { dagRun, wavePlan, stateSchema, initialState, nodeWave };
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
  const { dagRun, wavePlan, stateSchema, initialState, nodeWave } = setup;
  const engine = new DAGExecutionEngine();
  try {
    const result = await engine.execute({
      executionPlan: wavePlan,
      stateSchema,
      initialState,
      errorStrategy: opts?.errorStrategy || "best_effort",
      teamAgentId,
      onNodeStart: (nodeId, wave) => opts?.onNodeStart?.(nodeId, wave, wavePlan.nodeConfig[nodeId]?.label || nodeId, wavePlan.totalWaves),
      onNodeComplete: (nodeId, wave, r) => opts?.onNodeComplete?.(nodeId, wave, wavePlan.nodeConfig[nodeId]?.label || nodeId, r, wavePlan.totalWaves),
      onApprovalPending: (nodeId, approvalId) => {
        // Marks the row so a polling monitoring view can distinguish "stuck
        // waiting on a person" from an ordinary in-flight wave -- cleared
        // back to "running" below as soon as the wave (gate included)
        // finishes, since by then the decision has already been made.
        storage.updateDagExecutionRun(dagRun.id, { status: "waiting_approval" }).catch(() => {});
        opts?.onApprovalPending?.(nodeId, nodeWave[nodeId] ?? 0, wavePlan.nodeConfig[nodeId]?.label || nodeId, wavePlan.totalWaves, approvalId);
      },
      onWaveComplete: async (waveNum, state) => {
        await storage.updateDagExecutionRun(dagRun.id, { status: "running", currentWave: waveNum, currentState: state });
      },
    });

    await storage.updateDagExecutionRun(dagRun.id, {
      status: result.success ? "completed" : "failed",
      finalState: result.finalState,
      currentState: result.finalState,
      waveResults: result.waveResults as any,
      totalPromptTokens: result.totalPromptTokens,
      totalCompletionTokens: result.totalCompletionTokens,
      completedAt: new Date(),
    });

    return result;
  } catch (execErr: any) {
    const isDagError = execErr instanceof DAGExecutionError;
    await storage.updateDagExecutionRun(dagRun.id, {
      status: "failed",
      error: execErr.message,
      waveResults: isDagError ? (execErr.context.waveResults as any) : [],
      completedAt: new Date(),
    });
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

// Reads the last wave's node output(s) out of a finished run's finalState --
// the natural "answer" for a caller (like Workspace chat) that wants one
// piece of text summarizing the whole pipeline rather than the full
// per-node wave trace.
export function extractFinalOutputText(result: DAGExecutionResult, wavePlan: ComputedWavePlan): string {
  const lastWave = wavePlan.waves[wavePlan.waves.length - 1];
  if (!lastWave) return result.success ? "Team pipeline completed with no output." : "Team pipeline failed.";
  const parts = lastWave.nodes.map((nodeId) => {
    const nc = wavePlan.nodeConfig[nodeId];
    const value = nc ? result.finalState[nc.stateKey] : undefined;
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }).filter((v): v is string => !!v);
  if (parts.length === 0) return result.success ? "Team pipeline completed with no text output." : "Team pipeline failed.";
  return parts.join("\n\n---\n\n");
}
