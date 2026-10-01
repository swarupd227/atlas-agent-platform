/**
 * Before/after on the real flows.
 *
 * The positions stored on a saved flow were produced by the previous layout, so
 * comparing them against a fresh layoutGraph() of the same graph is a genuine
 * before-and-after rather than a synthetic one.
 *
 *   node .workbench/mga-close/dump-graphs.mjs      (writes C:/tmp/flow-graphs.json)
 *   npx tsx scripts/measure-flow-layout.ts
 */
import fs from "node:fs";
import { layoutGraph, countLayoutCrossings, countEdgeNodeOverlaps, type ProcessNode, type ProcessEdge } from "../shared/process-flow";

const SRC = process.argv[2] ?? "C:/tmp/flow-graphs.json";
const data: Record<string, { name: string; nodes: ProcessNode[]; edges: ProcessEdge[] }> =
  JSON.parse(fs.readFileSync(SRC, "utf8"));

for (const [, flow] of Object.entries(data)) {
  const { name, nodes, edges } = flow;
  const stored = nodes.filter(n => n.position);
  if (stored.length !== nodes.length) {
    console.log(`\n${name}: only ${stored.length}/${nodes.length} nodes carry a stored position; skipping`);
    continue;
  }
  const before = countLayoutCrossings(nodes, edges);
  const after = countLayoutCrossings(layoutGraph(nodes, edges), edges);
  const pct = before === 0 ? 0 : Math.round(((before - after) / before) * 100);
  console.log(`\n${name}`);
  console.log(`  ${nodes.length} steps, ${edges.length} edges`);
  console.log(`  crossings before (stored layout): ${before}`);
  console.log(`  crossings after  (new layout):    ${after}   ${pct >= 0 ? `-${pct}%` : `+${-pct}%`}`);

  const obBefore = countEdgeNodeOverlaps(nodes, edges);

  const obAfter = countEdgeNodeOverlaps(layoutGraph(nodes, edges), edges);

  console.log(`  edges drawn THROUGH a node box:   ${obBefore} -> ${obAfter}`);
}
