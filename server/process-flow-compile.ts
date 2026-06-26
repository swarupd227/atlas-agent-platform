// Compile a business ProcessFlowGraph into an executable plan using the same
// wave-based DAG engine that runs team blueprints. This is the bridge from
// "authored" to "executable": it computes parallel waves, surfaces conditional
// branches, and isolates loop (back) edges so the graph can run.

import { computeWaves } from "./dag-execution-engine";
import type { ProcessFlowGraph, ProcessEdge } from "@shared/process-flow";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

export interface CompiledWave {
  wave: number;
  parallel: boolean;
  nodes: Array<{ id: string; label: string; type: string }>;
}

export interface CompiledBranch {
  nodeId: string;
  label: string;
  outgoing: Array<{ to: string; toLabel: string; label?: string; condition?: string }>;
}

export interface CompiledFlow {
  valid: boolean;
  message?: string;
  totalNodes: number;
  totalEdges: number;
  totalWaves: number;
  maxParallelism: number;
  parallelWaveCount: number;
  waves: CompiledWave[];
  branches: CompiledBranch[];
  loops: Array<{ from: string; to: string; label?: string; condition?: string }>;
  warnings: string[];
}

/** DFS back-edge detection — edges that close a cycle (loop / retry). */
function findBackEdgeIds(graph: ProcessFlowGraph): Set<string> {
  const adj = new Map<string, Array<{ id: string; to: string }>>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.from)?.push({ id: e.id, to: e.to });

  const color = new Map<string, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  for (const n of graph.nodes) color.set(n.id, 0);
  const back = new Set<string>();

  const visit = (u: string) => {
    color.set(u, 1);
    for (const e of adj.get(u) || []) {
      const c = color.get(e.to);
      if (c === 1) back.add(e.id);              // edge into the recursion stack → back edge
      else if (c === 0) visit(e.to);
    }
    color.set(u, 2);
  };
  for (const n of graph.nodes) if (color.get(n.id) === 0) visit(n.id);
  return back;
}

export function compileProcessFlow(graph: ProcessFlowGraph): CompiledFlow {
  const warnings: string[] = [];
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  const base: CompiledFlow = {
    valid: false, totalNodes: graph.nodes.length, totalEdges: graph.edges.length,
    totalWaves: 0, maxParallelism: 0, parallelWaveCount: 0, waves: [], branches: [], loops: [], warnings,
  };

  if (graph.nodes.length === 0) return { ...base, message: "Flow has no steps to compile." };

  // Edges to non-existent nodes are dropped (and flagged).
  const validEdges = graph.edges.filter(e => {
    const ok = nodeById.has(e.from) && nodeById.has(e.to);
    if (!ok) warnings.push(`Dropped dangling connection ${e.from} → ${e.to}.`);
    return ok;
  });

  // Loops (back edges) become runtime retries, not DAG dependencies.
  const backIds = findBackEdgeIds({ ...graph, edges: validEdges });
  const loops = validEdges.filter(e => backIds.has(e.id)).map(e => ({
    from: e.from, to: e.to, label: e.label, condition: e.condition,
  }));
  const forwardEdges = validEdges.filter(e => !backIds.has(e.id));

  // Conditional branches: a node with >1 outgoing edge is a decision/fork.
  const outByNode = new Map<string, ProcessEdge[]>();
  for (const e of validEdges) {
    if (!outByNode.has(e.from)) outByNode.set(e.from, []);
    outByNode.get(e.from)!.push(e);
  }
  const branches: CompiledBranch[] = [];
  for (const [nodeId, outs] of Array.from(outByNode.entries())) {
    if (outs.length > 1) {
      const n = nodeById.get(nodeId);
      branches.push({
        nodeId,
        label: n?.label || nodeId,
        outgoing: outs.map(e => ({ to: e.to, toLabel: nodeById.get(e.to)?.label || e.to, label: e.label, condition: e.condition })),
      });
      if (n && n.type !== "make_decision" && n.type !== "parallel") {
        warnings.push(`"${n.label}" has multiple outgoing paths but isn't a Decision or Parallel node.`);
      }
    }
  }

  // Map to the team-blueprint shape the DAG engine consumes, then compute waves.
  const bpNodes = graph.nodes.map(n => ({
    id: n.id, nodeType: n.type, label: n.label, stateKey: n.id.replace(/-/g, "_"),
    refAgentId: null, refTeamAgentId: null, outputSchema: null, fallbackOutput: null,
    timeoutMs: 30000, retryPolicy: { max_attempts: 2, backoff_ms: [1000, 2000] },
  })) as unknown as TeamBlueprintNode[];
  const bpEdges = forwardEdges.map(e => ({
    sourceNodeId: e.from, targetNodeId: e.to,
  })) as unknown as TeamBlueprintEdge[];

  try {
    const plan = computeWaves(bpNodes, bpEdges);
    const waves: CompiledWave[] = plan.waves.map(w => ({
      wave: w.wave_number,
      parallel: w.nodes.length > 1,
      nodes: w.nodes.map(id => ({ id, label: nodeById.get(id)?.label || id, type: nodeById.get(id)?.type || "" })),
    }));
    return {
      valid: true,
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      totalWaves: plan.totalWaves,
      maxParallelism: plan.maxParallelism,
      parallelWaveCount: waves.filter(w => w.parallel).length,
      waves,
      branches,
      loops,
      warnings,
    };
  } catch (err: any) {
    return { ...base, message: err?.message || "Could not compute an execution plan (unresolved cycle).", branches, loops };
  }
}
