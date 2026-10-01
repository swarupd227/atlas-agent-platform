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
  /**
   * For a loop edge (one pointing back to an earlier step): how many times the
   * work may be sent back before the flow has to move on. Without it, "send it
   * back for a redraft, at most twice" was only ever a phrase in a label, and
   * the team built from the flow defaulted every loop to a single round.
   */
  maxRounds?: number;
}

/**
 * Edges carrying a condition while being the only way out of their step.
 *
 * Worth reporting, not worth rewriting. Such a condition still does something --
 * the engine treats it as gating, so a false answer stops the work rather than
 * choosing a branch -- and someone may well have meant exactly that. But it is
 * also what a model produces when it writes a sentence describing what the step
 * hands on into the condition field, and then every run pays a model call to
 * answer a question with one possible answer. Live 2026-09-27: four revisions
 * each wrote "Pass treaty clause citation to bordereau entry" and the like into
 * the condition of a single-exit edge.
 *
 * So the compiler says so and the author decides. Silently moving the text to
 * the label would have deleted a real gate wherever one was meant.
 */
export function conditionsWithNoChoice(edges: ProcessEdge[], exclude: Set<string> = new Set()): ProcessEdge[] {
  const exits = new Map<string, number>();
  for (const e of edges) exits.set(e.from, (exits.get(e.from) ?? 0) + 1);
  return edges.filter((e) => !!e.condition && !exclude.has(e.id) && exits.get(e.from) === 1);
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

/** True when a flow is still exactly the starter flow a new outcome was given (same steps, in order). */
export function isUntouchedStarterFlow(g: ProcessFlowGraph, name: string, riskTier?: string | null): boolean {
  const starter = starterFlow(name, riskTier);
  const sig = (graph: ProcessFlowGraph) => graph.nodes.map((n) => `${n.type}:${n.label}`).join("|");
  return g.nodes.length === starter.nodes.length && g.edges.length === starter.edges.length && sig(g) === sig(starter);
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
  // Node boxes render at a fixed 176px wide (flow-graph-canvas.tsx's w-44), so
  // the previous 280px column width left only ~104px between adjacent columns
  // -- not enough room for even a short edge-condition label's background chip
  // once zoomed in, so labels routinely overlapped both the node they left and
  // the one they entered. 380 leaves ~200px, confirmed live to clear a normal
  // 2-4 word label; rows widened to match so parallel branches get the same
  // breathing room vertically.
  const COL = opts.colWidth ?? 380;
  const ROW = opts.rowHeight ?? 150;
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

  // --- columns, with a dummy node per column an edge merely passes through ---
  //
  // An edge spanning several columns used to have no representation in the
  // columns between its ends, so nothing reserved space for it and it was drawn
  // as a straight chord across whatever sat in the way. Measured on the real
  // flows: 9 of 49 edges on the binder close span more than one column, the
  // longest crossing seven of them; the E&S flow has one spanning nine.
  //
  // Inserting a dummy per intervening column fixes that twice over: the dummy
  // takes a row slot, so real nodes are pushed out of the edge's path, and
  // every edge in the working graph now joins ADJACENT columns, which is what
  // makes crossing counting exact rather than approximate.
  const cols = new Map<number, string[]>();
  nodes.forEach(n => { const d = depth.get(n.id) || 0; (cols.get(d) || cols.set(d, []).get(d)!).push(n.id); });
  for (const col of cols.values()) col.sort((a, b) => (origIndex.get(a) ?? 0) - (origIndex.get(b) ?? 0));

  const isDummy = (id: string) => id.startsWith("\u0000dummy");
  const segs: Array<[string, string]> = [];
  let dummySeq = 0;
  for (const e of simpleEdges) {
    let a = e.from, b = e.to;
    let da = depth.get(a) ?? 0, db = depth.get(b) ?? 0;
    // A back edge is laid out as if it ran forwards. Excluding it entirely (as
    // before) left a loop's target unpulled towards its source, so the return
    // arrow swept the diagram; the E&S flow has three of these.
    if (db < da) { [a, b] = [b, a]; [da, db] = [db, da]; }
    if (db === da) continue;
    let prev = a;
    for (let d = da + 1; d < db; d++) {
      const dummy = `\u0000dummy${dummySeq++}`;
      (cols.get(d) || cols.set(d, []).get(d)!).push(dummy);
      segs.push([prev, dummy]);
      prev = dummy;
    }
    segs.push([prev, b]);
  }

  const depthOf = new Map<string, number>(depth);
  for (const [d, col] of cols) for (const id of col) if (isDummy(id)) depthOf.set(id, d);

  const predOf = new Map<string, string[]>();
  const succOf = new Map<string, string[]>();
  for (const [u, v] of segs) {
    (succOf.get(u) ?? succOf.set(u, []).get(u)!).push(v);
    (predOf.get(v) ?? predOf.set(v, []).get(v)!).push(u);
  }

  const order = new Map<number, string[]>();
  for (const [d, col] of cols) order.set(d, [...col]);
  const depths = Array.from(order.keys()).sort((a, b) => a - b);
  const posIn = (d: number) => {
    const m = new Map<string, number>();
    (order.get(d) ?? []).forEach((id, i) => m.set(id, i));
    return m;
  };

  // Crossings between adjacent columns. Every segment joins adjacent columns,
  // so this is the true count for the drawing, not an estimate.
  const crossings = (): number => {
    let total = 0;
    for (let i = 0; i < depths.length - 1; i++) {
      const a = posIn(depths[i]), b = posIn(depths[i + 1]);
      const pairs = segs
        .filter(([u, v]) => a.has(u) && b.has(v))
        .map(([u, v]) => [a.get(u)!, b.get(v)!] as const);
      for (let p = 0; p < pairs.length; p++) {
        for (let q = p + 1; q < pairs.length; q++) {
          const [u1, v1] = pairs[p], [u2, v2] = pairs[q];
          if ((u1 - u2) * (v1 - v2) < 0) total++;
        }
      }
    }
    return total;
  };

  // Alternating barycentre sweeps. The previous pass only ever read parents, so
  // a child could never pull its parent's row; sweeping both ways and keeping
  // the arrangement that actually measures fewest crossings does.
  const snapshot = () => new Map(Array.from(order, ([d, ids]) => [d, [...ids]] as const));
  let best = snapshot();
  let bestCrossings = crossings();
  const sweep = (down: boolean) => {
    const seq = down ? depths.slice(1) : depths.slice(0, -1).reverse();
    for (const d of seq) {
      const neighbour = posIn(d + (down ? -1 : 1));
      const rel = down ? predOf : succOf;
      const cur = posIn(d);
      const key = (id: string): number => {
        const rs = (rel.get(id) ?? []).map(x => neighbour.get(x)).filter((r): r is number => r !== undefined);
        return rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : (cur.get(id) ?? 0);
      };
      order.set(d, [...(order.get(d) ?? [])].sort((x, y) =>
        (key(x) - key(y)) || ((cur.get(x) ?? 0) - (cur.get(y) ?? 0))));
    }
  };
  for (let i = 0; i < 8; i++) {
    sweep(i % 2 === 0);
    const c = crossings();
    if (c < bestCrossings) { bestCrossings = c; best = snapshot(); }
  }
  for (const [d, ids] of best) order.set(d, ids);

  const rowOf = new Map<string, number>();
  for (const [, ids] of order) ids.forEach((id, i) => rowOf.set(id, i));
  const maxRows = Math.max(...Array.from(order.values()).map(c => c.length));

  return nodes.map(n => {
    const d = depth.get(n.id) || 0;
    const col = order.get(d) ?? [];
    const row = rowOf.get(n.id) ?? 0;
    // Center each column vertically against the tallest one.
    const yOffset = ((maxRows - col.length) / 2) * ROW;
    return { ...n, position: { x: d * COL, y: yOffset + row * ROW } };
  });
}

/**
 * Edges drawn straight through a node box.
 *
 * This is the one people actually see: a conditional edge that skips columns is
 * drawn as a chord, and anything sitting on that line gets a dashed arrow
 * through it. Crossing counts miss it entirely -- a flow can have zero edge
 * crossings and still look wrong for exactly this reason.
 */
export function countEdgeNodeOverlaps(
  nodes: ProcessNode[],
  edges: ProcessEdge[],
  opts: { colWidth?: number; rowHeight?: number } = {},
): number {
  const COL = opts.colWidth ?? 380;
  const ROW = opts.rowHeight ?? 150;
  const placed = nodes.filter(n => n.position);
  const colOf = new Map(placed.map(n => [n.id, Math.round(n.position!.x / COL)] as const));
  const yOf = new Map(placed.map(n => [n.id, n.position!.y] as const));
  const inCol = new Map<number, string[]>();
  for (const n of placed) {
    const c = colOf.get(n.id)!;
    (inCol.get(c) ?? inCol.set(c, []).get(c)!).push(n.id);
  }

  let hits = 0;
  for (const e of edges) {
    if (!colOf.has(e.from) || !colOf.has(e.to) || e.from === e.to) continue;
    let c0 = colOf.get(e.from)!, c1 = colOf.get(e.to)!;
    let y0 = yOf.get(e.from)!, y1 = yOf.get(e.to)!;
    if (c1 < c0) { [c0, c1] = [c1, c0]; [y0, y1] = [y1, y0]; }
    if (c1 - c0 < 2) continue;            // adjacent columns pass nothing
    for (let c = c0 + 1; c < c1; c++) {
      const y = y0 + (y1 - y0) * ((c - c0) / (c1 - c0));
      // A node box is ~half a row tall, so anything nearer than that is struck.
      if ((inCol.get(c) ?? []).some(id => Math.abs(yOf.get(id)! - y) < ROW * 0.5)) hits++;
    }
  }
  return hits;
}

/**
 * Edge crossings in a laid-out graph, counted between adjacent columns after
 * splitting every long edge at the columns it passes through. Exported so the
 * layout can be judged by a number in a test rather than by eye.
 */
export function countLayoutCrossings(
  nodes: ProcessNode[],
  edges: ProcessEdge[],
  opts: { colWidth?: number } = {},
): number {
  const COL = opts.colWidth ?? 380;
  const placed = nodes.filter(n => n.position);
  if (placed.length < 2) return 0;
  const colOf = new Map(placed.map(n => [n.id, Math.round(n.position!.x / COL)] as const));
  const yOf = new Map(placed.map(n => [n.id, n.position!.y] as const));

  // Rank within a column, so crossings are counted on order rather than pixels.
  const byCol = new Map<number, string[]>();
  for (const n of placed) {
    const c = colOf.get(n.id)!;
    (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(n.id);
  }
  for (const ids of byCol.values()) ids.sort((a, b) => (yOf.get(a)! - yOf.get(b)!));
  const rank = new Map<string, number>();
  for (const ids of byCol.values()) ids.forEach((id, i) => rank.set(id, i));

  // Split each edge at every column between its ends, interpolating its rank,
  // so an edge that merely passes through a column still counts against the
  // nodes and edges that are there.
  const segs: Array<{ c: number; a: number; b: number }> = [];
  for (const e of edges) {
    if (!colOf.has(e.from) || !colOf.has(e.to) || e.from === e.to) continue;
    let c0 = colOf.get(e.from)!, c1 = colOf.get(e.to)!;
    let r0 = rank.get(e.from)!, r1 = rank.get(e.to)!;
    if (c1 < c0) { [c0, c1] = [c1, c0]; [r0, r1] = [r1, r0]; }
    if (c1 === c0) continue;
    const span = c1 - c0;
    for (let c = c0; c < c1; c++) {
      const t0 = (c - c0) / span, t1 = (c + 1 - c0) / span;
      segs.push({ c, a: r0 + (r1 - r0) * t0, b: r0 + (r1 - r0) * t1 });
    }
  }

  let total = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].c !== segs[j].c) continue;
      const da = segs[i].a - segs[j].a, db = segs[i].b - segs[j].b;
      if (da * db < 0) total++;
    }
  }
  return total;
}
