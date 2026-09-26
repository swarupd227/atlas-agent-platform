/**
 * The node types a team blueprint may contain.
 *
 * This list exists in one place because maintaining it by hand has failed three
 * times, each the same way: a node type ships, the engine executes it happily,
 * and a validator that nobody thought to update rejects it as "invalid type".
 * The comment this replaces recorded two of those -- knowledge_base ("every KB
 * node in a real blueprint failed compile validation with a false invalid-type
 * error"), then sub_flow and expression.
 *
 * The third was tool_call, and it was the worst of them, because the failure
 * was not visible where the team was built. A team of six connector calls ran
 * perfectly through the run API and was refused by Astra Cowork with "the
 * team's wiring has 6 blocking errors", since Cowork asks this validator first.
 * Live 2026-09-26: an underwriting journey that had just bound a policy could
 * not be started from the surface a customer would actually use.
 *
 * So: when the engine learns to execute a new node type, add it here, and the
 * validator, the compiler and the wiring check all learn it at once. The
 * authority is the dispatch in DAGExecutionEngine.executeNode.
 */

/** Every node type DAGExecutionEngine.executeNode dispatches on. */
export const TEAM_NODE_TYPES = [
  /** A language model call. The default, and the only kind that costs tokens. */
  "internal_agent",
  /** A person decides. */
  "edge_gate",
  /** JSONata over run state, under a 5s ceiling. No model. */
  "expression",
  /** One bound tool, arguments mapped from run state. No model. */
  "tool_call",
  /** A bundle of tools offered to a neighbouring agent. */
  "tool_set",
  /** A skill's procedure text injected into state. */
  "skill",
  /** A pgvector search whose chunks land in state. */
  "knowledge_base",
  /** Another team, run as one step. */
  "sub_flow",
  /** An agent running somewhere else. */
  "remote_agent",
] as const;

export type TeamNodeType = (typeof TEAM_NODE_TYPES)[number];

export function isTeamNodeType(nodeType: string | null | undefined): boolean {
  return !!nodeType && (TEAM_NODE_TYPES as readonly string[]).includes(nodeType);
}

/** The type's name as a person reading an error would write it. */
export function nodeTypeLabel(nodeType: string): string {
  switch (nodeType) {
    case "internal_agent": return "Internal Agent";
    case "remote_agent": return "Remote Agent";
    case "edge_gate": return "Edge Gate";
    case "tool_set": return "Tool Set";
    case "tool_call": return "Tool Call";
    case "knowledge_base": return "Knowledge Base";
    case "sub_flow": return "Sub-Flow";
    case "expression": return "Expression";
    case "skill": return "Skill";
    default: return nodeType;
  }
}

/**
 * What a node of this type must carry to be runnable, as a human-readable
 * requirement. Null when the type needs nothing beyond itself.
 *
 * A validator that accepts a type but not its requirements is half a check: a
 * tool_call with no tool bound is exactly as unrunnable as an unknown type, and
 * saying so at build time is the difference between a clear message and a run
 * that dies partway through.
 */
export function missingRequirement(node: {
  nodeType: string;
  refAgentId?: string | null;
  refTeamAgentId?: string | null;
  refRemoteAgentId?: string | null;
  refSkillId?: string | null;
  refKnowledgeBaseId?: string | null;
  config?: Record<string, any> | null;
}): string | null {
  const cfg = node.config ?? {};
  switch (node.nodeType) {
    case "internal_agent":
      return node.refAgentId || node.refTeamAgentId ? null : "has no agent selected";
    case "remote_agent":
      return node.refRemoteAgentId ? null : "has no remote agent selected";
    case "skill":
      return node.refSkillId ? null : "has no skill selected";
    case "knowledge_base":
      return node.refKnowledgeBaseId ? null : "has no knowledge base selected";
    case "sub_flow":
      return node.refTeamAgentId ? null : "has no flow selected";
    case "expression":
      return typeof cfg.expression === "string" && cfg.expression.trim() ? null : "has no expression written";
    case "tool_call":
      return typeof cfg.toolName === "string" && cfg.toolName.trim() && typeof cfg.toolServerId === "string" && cfg.toolServerId.trim()
        ? null
        : "has no tool bound";
    default:
      return null;
  }
}
