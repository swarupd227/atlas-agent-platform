/**
 * Which edges point back up the flow.
 *
 * A team's execution plan is computed with Kahn's algorithm (computeWaves in
 * server/dag-execution-engine.ts), which refuses a graph containing any cycle:
 * the run dies with "Cycle detected in team graph -- cannot compute execution
 * waves". A process flow, though, is deliberately DRAWN with loops -- "send it
 * back for a redraft" points at a step that already ran -- and the platform
 * expresses those as a revision rule on the reviewing step instead of as an edge.
 *
 * So both places that turn a flow into a team have to answer the same question,
 * and they used to answer it separately: the build walked only the edges it had
 * created so far, which made the answer depend on the order the edges happened to
 * be listed, and the flow sync never asked at all. That is how a team rebuilt
 * from a flow with three revision loops became unrunnable while build, deploy and
 * sync all reported success -- the failure surfaced only when someone pressed run
 * (live 2026-09-27).
 */

export interface DirectedEdge {
  from: string;
  to: string;
}

export const edgeKey = (from: string, to: string) => `${from}::${to}`;

/**
 * The keys of the edges that close a loop, which are the ones that have to
 * become revision rules rather than edges.
 *
 * A depth-first walk from each node in the order given: an edge arriving at a
 * node that is still on the current stack points back at something this path
 * came through, so it closes a loop. Removing exactly these leaves a graph
 * Kahn's algorithm accepts.
 *
 * Which edge of a loop is named the back edge depends on the order the caller
 * gives, so the same input always produces the same answer -- unlike deciding it
 * from the edges built so far, where one listing order made a loop a revision
 * rule and another made it an unrunnable team.
 */
export function backEdgeKeys(nodeIds: Iterable<string>, edges: DirectedEdge[]): Set<string> {
  const ids = Array.from(nodeIds);
  const known = new Set(ids);
  const outgoing = new Map<string, DirectedEdge[]>();
  for (const id of ids) outgoing.set(id, []);
  for (const e of edges) {
    // An edge with an endpoint outside this graph cannot close a loop inside it.
    if (!known.has(e.from) || !known.has(e.to)) continue;
    outgoing.get(e.from)!.push(e);
  }

  const back = new Set<string>();
  const UNSEEN = 0, ON_STACK = 1, DONE = 2;
  const state = new Map<string, number>();

  // Iterative, so a long flow cannot overflow the stack.
  for (const start of ids) {
    if ((state.get(start) ?? UNSEEN) !== UNSEEN) continue;
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    state.set(start, ON_STACK);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const edgesOut = outgoing.get(frame.id) ?? [];
      if (frame.next >= edgesOut.length) {
        state.set(frame.id, DONE);
        stack.pop();
        continue;
      }
      const edge = edgesOut[frame.next++];
      const seen = state.get(edge.to) ?? UNSEEN;
      if (seen === ON_STACK) back.add(edgeKey(edge.from, edge.to));
      else if (seen === UNSEEN) {
        state.set(edge.to, ON_STACK);
        stack.push({ id: edge.to, next: 0 });
      }
    }
  }
  return back;
}

/**
 * The same walk, answering with edge ids, for a caller that has to point at the
 * offending edge -- the flow compiler marks loop edges on the canvas this way.
 */
export function backEdgeIds<T extends DirectedEdge & { id: string }>(nodeIds: Iterable<string>, edges: T[]): Set<string> {
  const keys = backEdgeKeys(nodeIds, edges);
  const ids = new Set<string>();
  for (const e of edges) if (keys.has(edgeKey(e.from, e.to))) ids.add(e.id);
  return ids;
}

/** Does this graph contain a loop at all -- the one thing computeWaves refuses. */
export function hasCycle(nodeIds: Iterable<string>, edges: DirectedEdge[]): boolean {
  return backEdgeKeys(nodeIds, edges).size > 0;
}
