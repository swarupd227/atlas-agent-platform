/**
 * Turning a description of a process into a flow graph.
 *
 * This was the body of POST /api/ai/generate-process-flow, reachable only from
 * the Studio's "Describe workflow" panel. Astra Cowork needs the same thing --
 * and a conversation is a better place for it, because the clarifying
 * questions the Studio asks in a modal are just talking, and Astra already
 * knows the organization's outcomes, agents and industry.
 *
 * So it lives here, called by both. The prompt is the part that matters: it
 * has been tuned for branches that are really branches, parallel work that
 * isn't serialized, and conditions a machine can actually evaluate. Two
 * callers generating flows from two prompts would drift apart within a month.
 */
import { callClaude, stripJsonFences } from "./claude";
import { buildSourceDocuments } from "./attachment-context";
import { formatClarifications, type Clarification } from "./process-flow-clarify";

export interface FlowDraft {
  name: string;
  nodes: Array<{ id: string; type: string; label: string; description: string; actor: string }>;
  edges: Array<{ id: string; from: string; to: string; label?: string; condition?: string }>;
}

export class FlowDraftError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const FLOW_NODE_TYPES = ["trigger", "get_info", "ai_reasoning", "make_decision", "parallel", "expert_approval", "take_action", "send_notification", "end"];

/** Whether the model this needs is configured at all. */
export function flowDraftingConfigured(): boolean {
  return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function draftProcessFlow(input: {
  description?: string;
  /** Attached process documents; a document IS a description. */
  fileIds?: string[];
  orgId?: string;
  outcomeContext?: unknown;
  clarifications?: Clarification[];
}): Promise<FlowDraft> {
  if (!flowDraftingConfigured()) throw new FlowDraftError("Drafting a flow isn't configured on this deployment.", 503);

  const ids = (input.fileIds ?? []).filter((f) => typeof f === "string").slice(0, 5);
  const described = (input.description ?? "").trim();
  if (!ids.length && !described) throw new FlowDraftError("Describe the process, or attach a document that does.", 400);

  const sources = ids.length ? await buildSourceDocuments(ids, input.orgId) : null;
  if (ids.length && !sources?.names.length) throw new FlowDraftError("The attached document could not be read. Re-upload it and try again.", 400);

  const clarifications = input.clarifications ?? [];
  const outcomeContext = input.outcomeContext;

  const validTypes = ["trigger", "get_info", "ai_reasoning", "make_decision", "parallel", "expert_approval", "take_action", "send_notification", "end"];
  const contextLine = outcomeContext ? `\nOutcome context: ${JSON.stringify(outcomeContext)}` : "";

  // Ask for a real graph (nodes + edges), not a flat step list. A flat
  // list can never represent "if X then A else B" -- every generated
  // flow came out as a straight chain regardless of what the user
  // described, even when they explicitly described a branch, because
  // there was nowhere in the response shape to put one.
  const prompt = `You are a business process design assistant. Convert the following workflow description into a process flow GRAPH using only these step types: ${validTypes.join(", ")}.${contextLine}

Workflow description: "${described || "See the attached process document(s) below — derive the workflow from them."}"
${sources ? `\n${sources.text}\n` : ""}${formatClarifications(clarifications)}
Return a JSON object with:
- "name": a short name for this process (max 5 words)
- "nodes": an array of steps, each with: "id" (short unique string like "n1", "n2"), "type" (one of the valid types), "label" (plain English name max 5 words), "description" (1 sentence), "actor" (who does this: "System", "AI", "Customer", "Manager", or a relevant role)
- "edges": an array of connections between nodes, each with: "from" (a node id), "to" (a node id), and for branches only: "label" (short branch name, e.g. "High priority") and "condition" (plain-English guard, e.g. "urgency is high"). For a connection that points BACK to an earlier node (rework: "send it back to be redone"), also set "maxRounds" to the number of times the work may be sent back before the process must move on — use the number the description gives ("at most two rounds" is 2), or 1 when it gives none. A round limit written only in the label is lost: the automation built from this flow reads "maxRounds".

Rules:
- Always start with exactly one "trigger" node (no incoming edges) and end with at least one "end" node (no outgoing edges)
- Every node must be reachable by following edges from the trigger
- Include ${sources ? "as many nodes as the document actually describes (up to 25) — do not compress a documented process to fit a smaller number, and do not pad it either" : "5-10 nodes total"}
- Use "expert_approval" for any human sign-off steps, "ai_reasoning" for AI analysis, "make_decision" for branching points
- If the description mentions a condition, threshold, or "if X then... otherwise..." -- model it literally: a "make_decision" node with TWO OR MORE outgoing edges, each with its own "label" and "condition" describing when that branch is taken. Do not collapse a branch into a single linear path.
- If the description says steps happen "in parallel", "at the same time", "independently", or "while X happens, Y also happens" -- that is NOT a decision (nothing is being chosen between). Model it literally: a "parallel" node with TWO OR MORE outgoing edges and no "condition" on any of them (every branch always runs), then route each branch into the same downstream node once they converge. Do not serialize parallel work into a chain just because it has to be written down in some order.
- Every node has exactly one outgoing edge to the next step, UNLESS it is a "make_decision" node (each edge is a condition to choose between) or a "parallel" node (each edge is a branch that always runs) -- either may have multiple
- A "condition" must be answerable YES or NO from the output of the step the edge leaves, and nothing else. It is a routing test the automation evaluates against that step's own result -- not a caption describing the branch to a reader. Write "Endorsement approved" or "Confidence below 85%", not "Endorsement passed review within two rounds" or "Approved on the second attempt": the step reports what it decided, never how many attempts it took or what happened elsewhere. A condition that asks for something the step does not report is answered "no", so BOTH branches of the decision come out false and every step after it is skipped. Round counts belong in "maxRounds" on the rework edge, never in a condition.
- Keep labels under 5 words and in plain business language

Worked example of true parallelism (for shape only -- invent your own content from the description): a "parallel" node "p1" with edges p1->"check_access" and p1->"check_retention" (neither edge has a "condition"), and separately check_access->"merge" and check_retention->"merge" so both branches converge on the same next node.

Respond ONLY with valid JSON, no markdown fences.`;

  // 2000 was too tight for real multi-branch descriptions (5+ distinct
  // terminal outcomes, detailed system context) -- the model's JSON response
  // got cut off mid-object, JSON.parse threw, and the catch below silently
  // fell back to an empty graph with no visibility into why. Confirmed via
  // direct reproduction: a detailed 8-branch description returned 200 OK
  // with nodes:[] every time at the old cap.
  const rawFlow = await callClaude({ model: "claude-haiku-4-5", system: "", user: prompt, maxTokens: 6000, jsonMode: true });
  const content = stripJsonFences(rawFlow);
  let parsed: any = {};
  try { parsed = JSON.parse(content); } catch (e: any) {
    console.error("[generate-process-flow] JSON.parse failed -- likely a truncated/malformed model response:", e.message, "| raw length:", content.length);
  }

  // Validate defensively -- drop anything malformed rather than trusting
  // the LLM's structure outright, since a bad node/edge id reference
  // would silently produce a broken graph (this is exactly the failure
  // mode that made every previously-generated flow render with edges
  // that didn't visually connect).
  const rawNodes: any[] = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const seenIds = new Set<string>();
  const nodes = rawNodes.map((n, i) => {
    let id = typeof n?.id === "string" && n.id.trim() ? n.id.trim() : `n${i}`;
    if (seenIds.has(id)) id = `${id}_${i}`;
    seenIds.add(id);
    return {
      id,
      type: validTypes.includes(n?.type) ? n.type : "take_action",
      label: typeof n?.label === "string" && n.label ? n.label : `Step ${i + 1}`,
      description: typeof n?.description === "string" ? n.description : "",
      actor: typeof n?.actor === "string" && n.actor ? n.actor : "System",
    };
  });
  const nodeIds = new Set(nodes.map(n => n.id));
  const rawEdges: any[] = Array.isArray(parsed.edges) ? parsed.edges : [];
  // Typed explicitly: the chain-them-up fallback below sets no label or
  // condition, and inference from this first assignment would make those
  // required.
  let edges: FlowDraft["edges"] = rawEdges
    .filter(e => nodeIds.has(e?.from) && nodeIds.has(e?.to) && e.from !== e.to)
    .map((e, i) => ({
      id: `e${i}`,
      from: e.from as string,
      to: e.to as string,
      label: typeof e.label === "string" && e.label ? e.label : undefined,
      condition: typeof e.condition === "string" && e.condition ? e.condition : undefined,
    }));

  // Fallback: if the model produced nodes but no usable edges (or edges
  // that don't actually connect the graph), chain nodes in array order
  // rather than shipping a set of disconnected boxes.
  const reachable = new Set<string>();
  if (nodes.length > 0) {
    const adj = new Map<string, string[]>();
    for (const e of edges) adj.set(e.from, [...(adj.get(e.from) || []), e.to]);
    const stack = [nodes[0].id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of adj.get(id) || []) stack.push(next);
    }
  }
  if (nodes.length > 1 && (edges.length === 0 || reachable.size < nodes.length)) {
    edges = nodes.slice(0, -1).map((n, i) => ({ id: `e${i}`, from: n.id, to: nodes[i + 1].id }));
  }


  return { name: parsed.name || "Generated Flow", nodes, edges };
}
