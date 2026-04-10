import { storage } from "./storage";
import { executeWorkerAgent } from "./agent-runtime";
import type { DagExecutionPlan, DagStateSchema, TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

export interface WaveNode {
  wave_number: number;
  nodes: string[];
  dependencies: string[];
}

export interface ComputedWavePlan {
  waves: WaveNode[];
  edgeMap: Record<string, string[]>;
  nodeConfig: Record<string, NodePlanConfig>;
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
  label: string;
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
  teamAgentRuntimeConfig?: Record<string, any>;
  onNodeStart?: (nodeId: string, wave: number) => void;
  onNodeComplete?: (nodeId: string, wave: number, result: NodeExecutionResult) => void;
  onWaveComplete?: (wave: number, state: Record<string, any>) => Promise<void>;
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
      label: node.label,
    };
  }

  const edgeMap: Record<string, string[]> = {};
  for (const [k, v] of adj.entries()) {
    edgeMap[k] = v;
  }

  return {
    waves,
    edgeMap,
    nodeConfig,
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

    for (const wave of config.executionPlan.waves) {
      const waveStart = Date.now();

      const nodePromises = wave.nodes.map((nodeId) => {
        config.onNodeStart?.(nodeId, wave.wave_number);
        return this.executeNode(nodeId, currentState, config);
      });

      let nodeResults: NodeExecutionResult[];

      if (config.errorStrategy === "fail_fast") {
        nodeResults = await Promise.all(nodePromises);
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
        nodeResults = settled.map((s, i) => {
          if (s.status === "fulfilled") return s.value;
          const nc = config.executionPlan.nodeConfig[wave.nodes[i]];
          return {
            nodeId: wave.nodes[i],
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
        if (nodeResults.some((r) => r.status === "failed")) success = false;
      }

      for (const nr of nodeResults) {
        config.onNodeComplete?.(nr.nodeId, wave.wave_number, nr);
        totalPromptTokens += nr.promptTokens;
        totalCompletionTokens += nr.completionTokens;
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
    }

    return { finalState: currentState, waveResults, totalPromptTokens, totalCompletionTokens, success };
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
      onWaveComplete: config.onWaveComplete,
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
        error: (result as any).success ? undefined : `Agent execution failed`,
        promptTokens: 0,
        completionTokens: 0,
        traceId: (result as any).step?.id || "",
      };
    } catch (err: any) {
      return { success: false, output: "", error: err.message };
    }
  }
}
