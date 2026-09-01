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

// A structured, node/edge-anchored finding from validation, so the canvas can
// badge the exact offending step rather than the author having to read a wall
// of prose in the dialog. `warnings` (the flat string list) is derived from
// these for backward compatibility.
export interface CompiledIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
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
  /** Structured findings; `warnings` above is `issues.map(i => i.message)`. */
  issues: CompiledIssue[];
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
  const issues: CompiledIssue[] = [];
  const warn = (code: string, message: string, extra?: { nodeId?: string; edgeId?: string }) =>
    issues.push({ severity: "warning", code, message, ...extra });
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  // `warnings` (the flat string list some consumers still read) is derived
  // from the structured `issues` at return time via finalize().
  const finalize = (flow: Omit<CompiledFlow, "warnings" | "issues">): CompiledFlow => ({
    ...flow, issues, warnings: issues.map(i => i.message),
  });

  const base = {
    valid: false, totalNodes: graph.nodes.length, totalEdges: graph.edges.length,
    totalWaves: 0, maxParallelism: 0, parallelWaveCount: 0, waves: [] as CompiledWave[],
    branches: [] as CompiledBranch[], loops: [] as CompiledFlow["loops"],
  };

  if (graph.nodes.length === 0) return finalize({ ...base, message: "Flow has no steps to compile." });

  // Edges to non-existent nodes are dropped (and flagged).
  const validEdges = graph.edges.filter(e => {
    const ok = nodeById.has(e.from) && nodeById.has(e.to);
    if (!ok) warn("dangling_edge", `Dropped dangling connection ${e.from} → ${e.to}.`, { edgeId: e.id });
    return ok;
  });

  // ---- Business well-formedness checks (the "Validate" the button implies) ----
  // Previously the compiler only computed a wave plan and never checked whether
  // the flow made sense as a process, so a green "valid" was returned for flows
  // that misroute or dead-end at runtime. These are non-blocking warnings: the
  // plan is still computed and previewable, but the author sees the problem.
  const triggers = graph.nodes.filter(n => n.type === "trigger");
  const ends = graph.nodes.filter(n => n.type === "end");
  if (triggers.length === 0) {
    warn("no_trigger", "Flow has no Trigger step, so nothing defines when it starts. Add a Trigger as the entry point.");
  } else if (triggers.length > 1) {
    warn("multiple_triggers", `Flow has ${triggers.length} Trigger steps (${triggers.map(t => `"${t.label}"`).join(", ")}). A flow normally has a single entry point.`);
  }
  if (ends.length === 0) {
    warn("no_end", "Flow has no End step, so it has no defined completion. Add an End step where the process finishes.");
  }

  // Incoming-edge count per node (from valid edges), used for reachability and
  // orphan detection below.
  const incoming = new Map<string, number>(graph.nodes.map(n => [n.id, 0]));
  for (const e of validEdges) incoming.set(e.to, (incoming.get(e.to) || 0) + 1);

  // Reachability from the trigger(s): a step that can't be reached by following
  // edges from a trigger will never run. Only meaningful once a trigger exists
  // (otherwise "no_trigger" already covers it, and everything would be flagged).
  if (triggers.length > 0) {
    const adj = new Map<string, string[]>();
    for (const e of validEdges) adj.set(e.from, [...(adj.get(e.from) || []), e.to]);
    const reachable = new Set<string>();
    const stack = triggers.map(t => t.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const nxt of adj.get(id) || []) stack.push(nxt);
    }
    for (const n of graph.nodes) {
      if (!reachable.has(n.id)) {
        warn("unreachable", `"${n.label}" can't be reached from a Trigger, so it will never run. Connect it into the flow.`, { nodeId: n.id });
      }
    }
  }

  // Loops (back edges) become runtime retries, not DAG dependencies.
  const backIds = findBackEdgeIds({ ...graph, edges: validEdges });
  const loops = validEdges.filter(e => backIds.has(e.id)).map(e => ({
    from: e.from, to: e.to, label: e.label, condition: e.condition,
  }));
  const forwardEdges = validEdges.filter(e => !backIds.has(e.id));

  // Conditional branches: a node with >1 outgoing edge is a decision/fork.
  // Only forward (non-loop) edges count toward a branch — a back edge is a
  // retry, not an alternative path.
  const outByNode = new Map<string, ProcessEdge[]>();
  for (const e of forwardEdges) {
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
      const nodeLabel = n?.label || nodeId;
      const indistinct = outs.filter(e => !e.condition?.trim() && !e.label?.trim());
      // The genuinely dangerous case: a fork whose branches can't be told
      // apart, so routing between them is undefined at runtime. This only
      // matters when the intent is to pick ONE path:
      //   - A Parallel node runs every branch, so unconditioned edges are fine.
      //   - A fork whose branches are ALL conditioned/labelled is well-formed
      //     regardless of the node's type (a trigger, ai_reasoning, or decision
      //     that fans out to distinguishable paths all route correctly).
      //   - A single unconditioned branch alongside conditioned ones is a valid
      //     "else"/default, so we only flag when 2+ branches are indistinct.
      // An unconditioned fan-out on a non-Parallel node is treated as parallel
      // (every branch runs) — a legitimate pattern, so it is NOT flagged.
      if (n && n.type === "make_decision" && indistinct.length >= 2) {
        warn("ambiguous_decision", `Decision "${nodeLabel}" has ${indistinct.length} branches with no condition, so routing between them is undefined. Add a condition to each branch.`, { nodeId });
        for (const e of indistinct) {
          warn("branch_no_condition", `Branch from "${nodeLabel}" to "${nodeById.get(e.to)?.label || e.to}" has no condition.`, { edgeId: e.id });
        }
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
    return finalize({
      valid: true,
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      totalWaves: plan.totalWaves,
      maxParallelism: plan.maxParallelism,
      parallelWaveCount: waves.filter(w => w.parallel).length,
      waves,
      branches,
      loops,
    });
  } catch (err: any) {
    return finalize({ ...base, message: err?.message || "Could not compute an execution plan (unresolved cycle).", branches, loops });
  }
}
