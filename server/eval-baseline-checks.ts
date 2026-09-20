/**
 * The static checks an eval baseline run reports.
 *
 * These used to be five hardcoded "pass" lines with invented messages
 * ("Blueprint JSON conforms to schema v2", "All referenced tools are
 * registered"), produced without looking at anything. A baseline that always
 * passes is worse than no baseline: it reads as evidence.
 *
 * Each check below either runs for real or says it was not checked, and says
 * why. Nothing here calls a model; these are structural checks over the
 * agent, its blueprint graph and the policies that resolve for it.
 */

export type CheckStatus = "pass" | "warning" | "fail" | "not_checked";

export interface BaselineCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface BaselineCheckResult {
  timestamp: string;
  blueprintId?: string;
  checks: BaselineCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  notCheckedCount: number;
}

interface GraphNode { id: string; nodeType?: string | null; label?: string | null; config?: unknown }
interface GraphEdge { fromNodeId?: string | null; toNodeId?: string | null; sourceNodeId?: string | null; targetNodeId?: string | null }

export interface BaselineCheckInputs {
  agent: { id: string; autonomyMode?: string | null; toolsConfig?: unknown; blueprintJson?: unknown };
  blueprintJson?: unknown;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  /** Policies that actually resolve for this agent (resolvePolicyBundle). */
  appliedPolicies?: Array<{ id?: string; name?: string }>;
  /** Connectors linked to the agent. */
  linkedConnectorCount?: number;
}

const edgeEnds = (e: GraphEdge) => ({ from: e.fromNodeId ?? e.sourceNodeId ?? null, to: e.toNodeId ?? e.targetNodeId ?? null });

/** Depth-first cycle detection over the blueprint graph. Returns the node ids on the first cycle found. */
export function findCycle(nodes: GraphNode[], edges: GraphEdge[]): string[] | null {
  const out = new Map<string, string[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) {
    const { from, to } = edgeEnds(e);
    if (!from || !to) continue;
    if (!out.has(from)) out.set(from, []);
    out.get(from)!.push(to);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on stack, 2 done
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    if (state.get(id) === 1) return stack.slice(stack.indexOf(id)).concat(id);
    if (state.get(id) === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const next of out.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of Array.from(out.keys())) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

const HUMAN_NODE_TYPES = ["human_approval", "approval", "human_review", "hitl", "human_checkpoint", "checkpoint"];

/** True when a node pauses the flow for a person. */
export function isHumanNode(node: GraphNode): boolean {
  const type = String(node.nodeType ?? "").toLowerCase();
  if (HUMAN_NODE_TYPES.some((t) => type.includes(t))) return true;
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  return cfg.isHumanCheckpoint === true || cfg.requiresApproval === true;
}

export function runBaselineStaticChecks(input: BaselineCheckInputs): BaselineCheckResult {
  const checks: BaselineCheck[] = [];
  const { agent, nodes, edges, appliedPolicies, linkedConnectorCount } = input;
  const blueprintJson = input.blueprintJson ?? agent.blueprintJson;
  const hasGraph = Array.isArray(nodes) && nodes.length > 0;

  // 1. Blueprint shape.
  if (blueprintJson == null) {
    checks.push({ name: "Blueprint", status: hasGraph ? "pass" : "not_checked", message: hasGraph ? `Graph has ${nodes!.length} nodes` : "This agent has no blueprint, so there was nothing to check" });
  } else if (typeof blueprintJson !== "object") {
    checks.push({ name: "Blueprint", status: "fail", message: "The blueprint is not an object" });
  } else {
    const bp = blueprintJson as Record<string, unknown>;
    const bpNodes = Array.isArray(bp.nodes) ? (bp.nodes as unknown[]) : null;
    checks.push(bpNodes === null
      ? { name: "Blueprint", status: "fail", message: "The blueprint has no nodes array" }
      : bpNodes.length === 0
        ? { name: "Blueprint", status: "warning", message: "The blueprint has no nodes" }
        : { name: "Blueprint", status: "pass", message: `The blueprint has ${bpNodes.length} node${bpNodes.length === 1 ? "" : "s"}` });
  }

  // 2. Cycles in the graph.
  if (!hasGraph) {
    checks.push({ name: "Circular dependencies", status: "not_checked", message: "No graph is stored for this agent, so its steps could not be walked" });
  } else {
    const cycle = findCycle(nodes!, edges ?? []);
    const labelOf = (id: string) => nodes!.find((n) => n.id === id)?.label ?? id;
    checks.push(cycle
      ? { name: "Circular dependencies", status: "fail", message: `Steps loop back on themselves: ${cycle.map(labelOf).join(" → ")}` }
      : { name: "Circular dependencies", status: "pass", message: `No loops across ${nodes!.length} steps` });
  }

  // 3. A person in the loop.
  if (!hasGraph) {
    checks.push({ name: "Human checkpoint", status: "not_checked", message: "No graph is stored for this agent, so its steps could not be walked" });
  } else {
    const humanNodes = nodes!.filter(isHumanNode);
    checks.push(humanNodes.length > 0
      ? { name: "Human checkpoint", status: "pass", message: `${humanNodes.length} step${humanNodes.length === 1 ? "" : "s"} wait for a person` }
      : agent.autonomyMode === "full"
        ? { name: "Human checkpoint", status: "warning", message: "This agent runs fully autonomously and no step waits for a person" }
        : { name: "Human checkpoint", status: "warning", message: "No step waits for a person; approvals depend on its policies and tool gates instead" });
  }

  // 4. Policies that actually resolve.
  if (appliedPolicies === undefined) {
    checks.push({ name: "Policies", status: "not_checked", message: "The policy bundle could not be read" });
  } else {
    checks.push(appliedPolicies.length > 0
      ? { name: "Policies", status: "pass", message: `${appliedPolicies.length} polic${appliedPolicies.length === 1 ? "y applies" : "ies apply"} to this agent` }
      : { name: "Policies", status: "warning", message: "No policy applies to this agent" });
  }

  // 5. Tools have somewhere to come from.
  const toolsConfigured = Array.isArray(agent.toolsConfig) ? (agent.toolsConfig as unknown[]).length : 0;
  if (linkedConnectorCount === undefined) {
    checks.push({ name: "Tools", status: "not_checked", message: "The agent's connectors could not be read" });
  } else if (toolsConfigured === 0) {
    checks.push({ name: "Tools", status: "not_checked", message: "No tools are configured on this agent" });
  } else {
    checks.push(linkedConnectorCount > 0
      ? { name: "Tools", status: "pass", message: `${toolsConfigured} tool${toolsConfigured === 1 ? "" : "s"} configured, ${linkedConnectorCount} connector${linkedConnectorCount === 1 ? "" : "s"} linked` }
      : { name: "Tools", status: "warning", message: `${toolsConfigured} tool${toolsConfigured === 1 ? "" : "s"} configured but no connector is linked, so none of them can be called` });
  }

  return {
    timestamp: new Date().toISOString(),
    blueprintId: undefined,
    checks,
    passCount: checks.filter((c) => c.status === "pass").length,
    warnCount: checks.filter((c) => c.status === "warning").length,
    failCount: checks.filter((c) => c.status === "fail").length,
    notCheckedCount: checks.filter((c) => c.status === "not_checked").length,
  };
}
