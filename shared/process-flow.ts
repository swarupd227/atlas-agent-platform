// Canonical process-flow graph model.
//
// A process flow is a DAG of typed nodes connected by (optionally conditional)
// edges. This supersedes the earlier flat, strictly-sequential step array, but
// stays backward compatible: a linear flow is just a graph whose edges form a
// single chain. Stored as JSON in outcome_contracts.process_flow (no migration).

export type ProcessNodeType =
  | "trigger"
  | "get_info"
  | "ai_reasoning"
  | "make_decision"
  | "expert_approval"
  | "take_action"
  | "send_notification"
  | "parallel"
  | "loop"
  | "n8n"
  | "sub_flow"
  | "expression"
  | "end";

export interface ProcessNode {
  id: string;
  type: ProcessNodeType;
  label: string;
  description?: string;
  actor?: string;
  estimatedMins?: number;
  /** Canvas position (React Flow). Optional — auto-laid-out when absent. */
  position?: { x: number; y: number };
  /** Node-type specific settings, e.g. loop: { maxIterations }. */
  config?: Record<string, unknown>;
}

export interface ProcessEdge {
  id: string;
  from: string;
  to: string;
  /** Short branch label shown on the edge, e.g. "Approved" / "Rejected". */
  label?: string;
  /** Optional human/machine-readable condition guarding this edge. */
  condition?: string;
}

export const PROCESS_FLOW_VERSION = 2 as const;

export interface ProcessFlowGraph {
  version: typeof PROCESS_FLOW_VERSION;
  name: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  updatedAt?: string;
}

/** Legacy linear step shape (process-flow v1 / pre-graph). */
export interface LegacyProcessStep {
  id?: string;
  type: string;
  label: string;
  description?: string;
  actor?: string;
  estimatedMins?: number;
  /** A step-bound skill (config.skillId/skillName on the source node), carried
   *  through flattening so agent-generation can ground its skill match in an
   *  explicit human choice instead of guessing from the step text alone. */
  config?: Record<string, unknown>;
}

export function isProcessFlowGraph(x: unknown): x is ProcessFlowGraph {
  return !!x && typeof x === "object"
    && Array.isArray((x as any).nodes)
    && Array.isArray((x as any).edges);
}

/**
 * A sensible starter flow seeded onto a new outcome so it's editable from day
 * one (rather than a blank canvas). High/critical risk gets a human approval.
 */
export function starterFlow(name: string, riskTier?: string | null): ProcessFlowGraph {
  const steps: LegacyProcessStep[] = [
    { type: "trigger", label: "Process triggered", description: "A business event starts the process", actor: "System" },
    { type: "get_info", label: "Gather information", description: "Collect the data needed to act", actor: "AI" },
    { type: "ai_reasoning", label: "Analyze & decide", description: "Assess the case and determine the action", actor: "AI" },
  ];
  if (riskTier === "HIGH" || riskTier === "CRITICAL") {
    steps.push({ type: "expert_approval", label: "Human approval", description: "Reviewer approves high-risk actions", actor: "Reviewer" });
  }
  steps.push(
    { type: "take_action", label: "Execute action", description: "Carry out the decided action", actor: "System" },
    { type: "send_notification", label: "Notify stakeholders", description: "Inform the relevant people", actor: "System" },
    { type: "end", label: "Complete", description: "Outcome recorded", actor: "System" },
  );
  return stepsToGraph(name, steps);
}

/** Build a graph from an ordered list of legacy steps (chain of edges). */
export function stepsToGraph(name: string, steps: LegacyProcessStep[]): ProcessFlowGraph {
  const nodes: ProcessNode[] = steps.map((s, i) => ({
    id: s.id || `n${i}`,
    type: (s.type as ProcessNodeType) || "take_action",
    label: s.label || `Step ${i + 1}`,
    description: s.description || "",
    actor: s.actor,
    estimatedMins: s.estimatedMins,
    position: { x: i * 240, y: 0 },
    config: s.config,
  }));
  const edges: ProcessEdge[] = nodes.slice(0, -1).map((n, i) => ({
    id: `e${i}`,
    from: n.id,
    to: nodes[i + 1].id,
  }));
  return { version: PROCESS_FLOW_VERSION, name: name || "Process Flow", nodes, edges };
}

/**
 * Accept any historical shape (graph, { name, steps }, or a bare steps array)
 * and return a normalized graph. Returns null for empty/invalid input.
 */
export function normalizeToGraph(input: unknown, fallbackName = "Process Flow"): ProcessFlowGraph | null {
  if (!input) return null;
  if (isProcessFlowGraph(input)) {
    const g = input as ProcessFlowGraph;
    return {
      version: PROCESS_FLOW_VERSION,
      name: g.name || fallbackName,
      nodes: g.nodes.map((n, i) => ({ ...n, id: n.id || `n${i}` })),
      edges: g.edges.map((e, i) => ({ ...e, id: e.id || `e${i}` })),
      updatedAt: g.updatedAt,
    };
  }
  const steps: LegacyProcessStep[] | null = Array.isArray(input)
    ? (input as LegacyProcessStep[])
    : (Array.isArray((input as any).steps) ? (input as any).steps as LegacyProcessStep[] : null);
  if (steps && steps.length > 0) {
    return stepsToGraph((input as any)?.name || fallbackName, steps);
  }
  return null;
}

/**
 * Flatten a graph to an ordered step list for prompts/agent-generation that
 * still expect a sequence. Uses a topological order (Kahn); falls back to node
 * order if the graph has cycles (loops). Branch/parallel structure is lost in
 * the flattening — callers that need structure should consume the graph.
 */
export function flattenGraphToSteps(g: ProcessFlowGraph): LegacyProcessStep[] {
  const nodes = g.nodes;
  const byId = new Map<string, ProcessNode>(nodes.map(n => [n.id, n] as [string, ProcessNode]));
  const indeg = new Map<string, number>(nodes.map(n => [n.id, 0] as [string, number]));
  for (const e of g.edges) {
    if (byId.has(e.to)) indeg.set(e.to, (indeg.get(e.to) || 0) + (byId.has(e.from) ? 1 : 0));
  }
  const queue = nodes.filter(n => (indeg.get(n.id) || 0) === 0).map(n => n.id);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const e of g.edges) {
      if (e.from === id && byId.has(e.to)) {
        indeg.set(e.to, (indeg.get(e.to) || 1) - 1);
        if ((indeg.get(e.to) || 0) <= 0) queue.push(e.to);
      }
    }
  }
  // Append any nodes not reached (cycles / disconnected) preserving node order.
  for (const n of nodes) if (!seen.has(n.id)) order.push(n.id);
  return order.map(id => byId.get(id)!).filter(Boolean).map(n => ({
    id: n.id, type: n.type, label: n.label, description: n.description, actor: n.actor, estimatedMins: n.estimatedMins, config: n.config,
  }));
}

/**
 * Assign clean left-to-right positions to every node via longest-path layering
 * — a dependency-free DAG layout so a generated / loaded / re-tidied flow reads
 * as a proper process diagram instead of an index-based grid. Column x = a
 * node's longest-path depth from a root; row y is barycenter-ordered against
 * parents to reduce edge crossings, then each column is vertically centered.
 * Loop (back) edges are excluded from layering so cycles don't break it.
 */
export function layoutGraph(
  nodes: ProcessNode[],
  edges: ProcessEdge[],
  opts: { colWidth?: number; rowHeight?: number } = {},
): ProcessNode[] {
  const COL = opts.colWidth ?? 280;
  const ROW = opts.rowHeight ?? 120;
  if (nodes.length === 0) return nodes;

  const ids = new Set(nodes.map(n => n.id));
  const origIndex = new Map(nodes.map((n, i) => [n.id, i] as const));
  const simpleEdges = edges.filter(e => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);

  // Back-edge detection (DFS colors): edges closing a cycle are loops, not
  // layering dependencies — excluding them keeps depth finite.
  const adjAll = new Map<string, string[]>();
  nodes.forEach(n => adjAll.set(n.id, []));
  simpleEdges.forEach(e => adjAll.get(e.from)!.push(e.to));
  const color = new Map<string, 0 | 1 | 2>(); nodes.forEach(n => color.set(n.id, 0));
  const back = new Set<string>();
  const visit = (u: string) => {
    color.set(u, 1);
    for (const v of adjAll.get(u) || []) {
      const c = color.get(v);
      if (c === 1) back.add(`${u} ${v}`);
      else if (c === 0) visit(v);
    }
    color.set(u, 2);
  };
  nodes.forEach(n => { if (color.get(n.id) === 0) visit(n.id); });
  const fwd = simpleEdges.filter(e => !back.has(`${e.from} ${e.to}`));

  // Longest-path depth via Kahn over the forward DAG.
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const parents = new Map<string, string[]>();
  nodes.forEach(n => { adj.set(n.id, []); indeg.set(n.id, 0); parents.set(n.id, []); });
  fwd.forEach(e => { adj.get(e.from)!.push(e.to); indeg.set(e.to, (indeg.get(e.to) || 0) + 1); parents.get(e.to)!.push(e.from); });
  const depth = new Map<string, number>(); nodes.forEach(n => depth.set(n.id, 0));
  const q = nodes.filter(n => (indeg.get(n.id) || 0) === 0).map(n => n.id);
  const rem = new Map(indeg);
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) || []) {
      depth.set(v, Math.max(depth.get(v) || 0, (depth.get(u) || 0) + 1));
      rem.set(v, (rem.get(v) || 1) - 1);
      if ((rem.get(v) || 0) === 0) q.push(v);
    }
  }

  // Group into columns by depth, order each column by the average row of its
  // parents (barycenter), falling back to original order for parentless nodes.
  const cols = new Map<number, string[]>();
  nodes.forEach(n => { const d = depth.get(n.id) || 0; (cols.get(d) || cols.set(d, []).get(d)!).push(n.id); });
  const rowOf = new Map<string, number>();
  for (const d of Array.from(cols.keys()).sort((a, b) => a - b)) {
    const col = cols.get(d)!;
    const key = (id: string): number => {
      const rows = (parents.get(id) || []).map(p => rowOf.get(p)).filter((r): r is number => r !== undefined);
      return rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : (origIndex.get(id) ?? 0);
    };
    col.sort((a, b) => (key(a) - key(b)) || ((origIndex.get(a) ?? 0) - (origIndex.get(b) ?? 0)));
    col.forEach((id, i) => rowOf.set(id, i));
  }
  const maxRows = Math.max(...Array.from(cols.values()).map(c => c.length));

  return nodes.map(n => {
    const d = depth.get(n.id) || 0;
    const col = cols.get(d)!;
    const row = rowOf.get(n.id) ?? 0;
    // Center each column vertically against the tallest one.
    const yOffset = ((maxRows - col.length) / 2) * ROW;
    return { ...n, position: { x: d * COL, y: yOffset + row * ROW } };
  });
}
