/**
 * Is this team's graph one that can actually run?
 *
 * Until now the answer was only ever discovered by running it. computeWaves
 * rejects a cyclic graph, so a team whose blueprint holds one edge pointing
 * backwards dies with "Cycle detected in team graph" the first time anybody
 * presses run -- while the build said success, the sync said success and the
 * deployment went active. Live 2026-09-27: a 22-node team, three loops, zero
 * runs, and nothing on any surface saying why.
 *
 * Two things are checked, and the difference between them matters:
 *
 * - a loop left as an EDGE stops every run before its first step (blocksRun);
 * - a revision rule pointing at a step that is no longer in the team runs fine
 *   and silently never fires, which is worse to diagnose and not worth blocking a
 *   deployment over.
 *
 * Everything here is read from the stored rows, so a finding is measured, not
 * inferred from what a build intended to write.
 */
import { storage } from "./storage";
import { backEdgeKeys } from "@shared/graph-cycles";

export interface BlueprintFinding {
  kind: "cycle" | "dangling_revision";
  /** Sentence naming the steps involved and what to do, for a card or a route. */
  message: string;
  /** True when no run can start at all. */
  blocksRun: boolean;
  /** The step labels involved, for a caller that formats its own copy. */
  steps: string[];
}

export interface BlueprintCheck {
  /** False only when something stops a run from starting. */
  runnable: boolean;
  findings: BlueprintFinding[];
  checked: { nodes: number; edges: number };
}

const OK: BlueprintCheck = { runnable: true, findings: [], checked: { nodes: 0, edges: 0 } };

export async function checkBlueprintInvariants(blueprintId: string | null | undefined): Promise<BlueprintCheck> {
  if (!blueprintId) return OK;
  const nodes = (await storage.getTeamBlueprintNodes(blueprintId).catch(() => [])) as any[];
  const edges = (await storage.getTeamBlueprintEdges(blueprintId).catch(() => [])) as any[];
  if (nodes.length === 0) return { ...OK, checked: { nodes: 0, edges: edges.length } };

  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const findings: BlueprintFinding[] = [];

  const loops = backEdgeKeys(
    nodes.map((n) => n.id),
    edges.map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId })),
  );
  for (const key of Array.from(loops)) {
    const [from, to] = key.split("::");
    findings.push({
      kind: "cycle",
      blocksRun: true,
      steps: [labelOf(from), labelOf(to)],
      message: `"${labelOf(from)}" has a connection back to "${labelOf(to)}", so the team's steps form a loop and no run can start. Sending work back belongs on the reviewing step as a revision rule, which is what syncing the flow again writes.`,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const target = ((node.config as any)?.revision as { targetNodeId?: string } | undefined)?.targetNodeId;
    if (target && !nodeIds.has(target)) {
      findings.push({
        kind: "dangling_revision",
        blocksRun: false,
        steps: [node.label],
        message: `"${node.label}" sends work back to a step that is no longer part of this team, so that loop can never fire. It usually means the step it pointed at was replaced; syncing the flow again repoints it.`,
      });
    }
  }

  return { runnable: !findings.some((f) => f.blocksRun), findings, checked: { nodes: nodes.length, edges: edges.length } };
}
