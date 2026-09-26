/**
 * Changing a process flow by describing the change.
 *
 * Drawing a flow from a description was the easy half. The half people
 * actually live in is coming back to one and saying "put a fraud check before
 * the payout" — and the naive way to do that, regenerating the whole flow from
 * an amended description, is wrong twice over: it throws away the positions
 * somebody arranged on the canvas, and it rewrites steps nobody asked to
 * change.
 *
 * So a revision is a change set applied to the stored graph. Untouched nodes
 * keep their ids and their coordinates; only what was asked for moves. The
 * change set is also what the confirm card shows, which means a model that
 * misread "before the payout" is caught by the person reading the card rather
 * than by them noticing their flow is wrong a week later.
 */
import { callClaude, stripJsonFences } from "./claude";
import { FLOW_NODE_TYPES } from "./process-flow-draft";
import type { ProcessFlowGraph, ProcessNode, ProcessEdge } from "@shared/process-flow";

export interface ChangeSet {
  addNodes?: Array<{ label: string; type?: string; actor?: string; description?: string; after?: string; before?: string }>;
  removeNodes?: string[];
  renameNodes?: Array<{ node: string; label: string }>;
  addEdges?: Array<{ from: string; to: string; label?: string; condition?: string }>;
  removeEdges?: Array<{ from: string; to: string }>;
  setConditions?: Array<{ from: string; to: string; condition: string }>;
}

export class ReviseError extends Error {}

/** A node by id, or by label — the model refers to steps the way a person does. */
export function findNode(graph: ProcessFlowGraph, ref: string | undefined): ProcessNode | undefined {
  if (!ref) return undefined;
  const wanted = ref.trim().toLowerCase();
  return graph.nodes.find((n) => n.id.toLowerCase() === wanted) ?? graph.nodes.find((n) => (n.label ?? "").toLowerCase() === wanted);
}

/** An id that isn't taken, for a step being added. */
function freeId(graph: ProcessFlowGraph, taken: Set<string>): string {
  let i = graph.nodes.length + 1;
  while (taken.has(`n${i}`)) i += 1;
  taken.add(`n${i}`);
  return `n${i}`;
}

/**
 * Apply the change set. Returns the new graph and a line per change, in the
 * words the card shows — including, deliberately, the steps it could NOT find,
 * because "I couldn't see which step you meant" is the failure worth surfacing.
 */
export function applyChangeSet(graph: ProcessFlowGraph, changes: ChangeSet): { graph: ProcessFlowGraph; changed: string[]; skipped: string[] } {
  const nodes: ProcessNode[] = graph.nodes.map((n) => ({ ...n }));
  let edges: ProcessEdge[] = graph.edges.map((e) => ({ ...e }));
  const working: ProcessFlowGraph = { ...graph, nodes, edges };
  const taken = new Set(nodes.map((n) => n.id));
  const changed: string[] = [];
  const skipped: string[] = [];
  let edgeSeq = edges.length;
  const newEdgeId = () => `e${(edgeSeq += 1)}`;

  for (const add of changes.addNodes ?? []) {
    const anchor = findNode(working, add.after) ?? findNode(working, add.before);
    if ((add.after || add.before) && !anchor) {
      skipped.push(`Couldn't add "${add.label}": there's no step called "${add.after ?? add.before}".`);
      continue;
    }
    const id = freeId(working, taken);
    const node: ProcessNode = {
      id,
      type: (FLOW_NODE_TYPES.includes(add.type ?? "") ? add.type : "take_action") as ProcessNode["type"],
      label: add.label,
      description: add.description ?? "",
      actor: add.actor ?? "System",
      // Placed beside the step it attaches to, so the arrangement around it
      // survives; a node with no position at all would be laid out from
      // scratch and could land anywhere.
      ...(anchor?.position ? { position: { x: anchor.position.x + (add.before ? -220 : 220), y: anchor.position.y + 60 } } : {}),
    };
    nodes.push(node);

    if (anchor && add.after) {
      // Splice it in: everything that left the anchor now leaves the new step.
      const outgoing = edges.filter((e) => e.from === anchor.id);
      for (const e of outgoing) e.from = id;
      edges.push({ id: newEdgeId(), from: anchor.id, to: id });
      changed.push(`Adds "${add.label}" after "${anchor.label}".`);
    } else if (anchor && add.before) {
      const incoming = edges.filter((e) => e.to === anchor.id);
      for (const e of incoming) e.to = id;
      edges.push({ id: newEdgeId(), from: id, to: anchor.id });
      changed.push(`Adds "${add.label}" before "${anchor.label}".`);
    } else {
      changed.push(`Adds "${add.label}" (not connected to anything yet).`);
    }
  }

  for (const ref of changes.removeNodes ?? []) {
    const node = findNode(working, ref);
    if (!node) {
      skipped.push(`Couldn't remove "${ref}": no step by that name.`);
      continue;
    }
    // Heal the gap: what led to it now leads where it led.
    const incoming = edges.filter((e) => e.to === node.id);
    const outgoing = edges.filter((e) => e.from === node.id);
    edges = edges.filter((e) => e.from !== node.id && e.to !== node.id);
    for (const into of incoming) {
      for (const out of outgoing) {
        edges.push({ id: newEdgeId(), from: into.from, to: out.to, ...(into.condition ? { condition: into.condition, label: into.label } : {}) });
      }
    }
    const at = nodes.findIndex((n) => n.id === node.id);
    if (at >= 0) nodes.splice(at, 1);
    changed.push(`Removes "${node.label}"${incoming.length && outgoing.length ? ", joining up what it sat between" : ""}.`);
  }

  for (const rename of changes.renameNodes ?? []) {
    const node = nodes.find((n) => n.id === findNode(working, rename.node)?.id);
    if (!node) {
      skipped.push(`Couldn't rename "${rename.node}": no step by that name.`);
      continue;
    }
    changed.push(`Renames "${node.label}" to "${rename.label}".`);
    node.label = rename.label;
  }

  for (const add of changes.addEdges ?? []) {
    const from = findNode(working, add.from);
    const to = findNode(working, add.to);
    if (!from || !to) {
      skipped.push(`Couldn't connect "${add.from}" to "${add.to}": one of them isn't there.`);
      continue;
    }
    // Splicing a step in already connects it, and the model tends to ask for
    // those same connections explicitly as well. Adding them a second time
    // produced duplicate paths -- which read fine on the canvas and would show
    // a decision as having branches it doesn't.
    const already = edges.find((e) => e.from === from.id && e.to === to.id);
    if (already) {
      if (add.condition && already.condition !== add.condition) {
        already.condition = add.condition;
        changed.push(`Changes when "${from.label}" goes to "${to.label}": ${add.condition}.`);
      }
      continue;
    }
    edges.push({ id: newEdgeId(), from: from.id, to: to.id, ...(add.label ? { label: add.label } : {}), ...(add.condition ? { condition: add.condition } : {}) });
    changed.push(`Connects "${from.label}" to "${to.label}"${add.condition ? ` when ${add.condition}` : ""}.`);
  }

  for (const drop of changes.removeEdges ?? []) {
    const from = findNode(working, drop.from);
    const to = findNode(working, drop.to);
    const before = edges.length;
    edges = edges.filter((e) => !(e.from === from?.id && e.to === to?.id));
    if (edges.length === before) skipped.push(`Couldn't remove the path from "${drop.from}" to "${drop.to}": there isn't one.`);
    else changed.push(`Removes the path from "${from!.label}" to "${to!.label}".`);
  }

  for (const set of changes.setConditions ?? []) {
    const from = findNode(working, set.from);
    const to = findNode(working, set.to);
    const edge = edges.find((e) => e.from === from?.id && e.to === to?.id);
    if (!edge) {
      skipped.push(`Couldn't set a condition on the path from "${set.from}" to "${set.to}": there isn't one.`);
      continue;
    }
    changed.push(`Changes when "${from!.label}" goes to "${to!.label}": ${set.condition}.`);
    edge.condition = set.condition;
  }

  // Whatever the change set asked for, a flow never has the same path twice.
  const seen = new Set<string>();
  const deduped = edges.filter((e) => {
    const key = `${e.from}->${e.to}|${e.condition ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { graph: { ...graph, nodes, edges: deduped }, changed, skipped };
}

/** Ask for a change set, not a new flow. */
export async function proposeChangeSet(graph: ProcessFlowGraph, instruction: string): Promise<ChangeSet> {
  const steps = graph.nodes.map((n) => `- ${n.id}: "${n.label}" (${n.type}${n.actor ? `, ${n.actor}` : ""})`).join("\n");
  const paths = graph.edges
    .map((e) => `- ${e.from} -> ${e.to}${e.condition ? ` when ${e.condition}` : ""}`)
    .join("\n");

  const prompt = `A business process flow is below. The user asked for a change. Return ONLY the change, as JSON — never a new flow.

Steps:
${steps}

Paths:
${paths}

The user asked: "${instruction}"

Return a JSON object with any of these keys (omit the ones you don't need):
- "addNodes": [{ "label": "…", "type": one of ${FLOW_NODE_TYPES.join("|")}, "actor": "…", "after": "<step id or label>" }] — use "before" instead of "after" to put it earlier
- "removeNodes": ["<step id or label>"]
- "renameNodes": [{ "node": "<step id or label>", "label": "new label" }]
- "addEdges": [{ "from": "<step>", "to": "<step>", "condition": "plain-English guard, only for a branch" }]
- "removeEdges": [{ "from": "<step>", "to": "<step>" }]
- "setConditions": [{ "from": "<step>", "to": "<step>", "condition": "…" }]

Rules:
- Change only what was asked. Leave every other step and path exactly as it is.
- Refer to existing steps by their id from the list above.
- A condition must be answerable YES or NO from the output of the step the path leaves.
- If the request is ambiguous about which step it means, choose the one the words fit best; the user will see your choice before it is applied.
- If nothing in the request corresponds to a change, return {}.

Respond ONLY with valid JSON, no markdown fences.`;

  const raw = await callClaude({ model: "claude-haiku-4-5", system: "", user: prompt, maxTokens: 2000, jsonMode: true });
  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    return typeof parsed === "object" && parsed ? (parsed as ChangeSet) : {};
  } catch {
    throw new ReviseError("I couldn't read the change that came back. Say it a different way and I'll try again.");
  }
}
