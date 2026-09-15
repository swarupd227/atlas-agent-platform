/**
 * Structural checks for a team blueprint's graph: node types, each node's
 * required reference, edges pointing at real nodes, disconnected nodes, and
 * an approval gate for high and critical risk teams.
 *
 * Moved unchanged from POST /api/blueprints/:id/compile
 * (server/routes/evaluations.ts), which now calls this, so the Astra
 * Workspace's wiring check applies exactly the same rules. Pure.
 */
import type { TeamBlueprintEdge, TeamBlueprintNode } from "@shared/schema";

export interface TeamGraphFinding {
  type: string;
  severity: string;
  message: string;
  nodeId?: string;
}

export function validateTeamGraph(
  team: { riskTier?: string | null },
  teamNodes: TeamBlueprintNode[],
  teamEdges: TeamBlueprintEdge[],
): { errors: TeamGraphFinding[]; warnings: TeamGraphFinding[] } {
  const teamErrors: TeamGraphFinding[] = [];
  const teamWarnings: TeamGraphFinding[] = [];

  if (teamNodes.length === 0) {
    teamErrors.push({ type: "schema", severity: "error", message: "Team blueprint must contain at least one node" });
  } else {
    // Was missing "knowledge_base" (a pre-existing gap -- every KB node in
    // a real blueprint failed compile validation with a false "invalid
    // type" error), "sub_flow", and "expression".
    const validTeamNodeTypes = ["internal_agent", "tool_set", "edge_gate", "remote_agent", "skill", "knowledge_base", "sub_flow", "expression"];
    for (const node of teamNodes) {
      if (!validTeamNodeTypes.includes(node.nodeType)) {
        teamErrors.push({ type: "schema", severity: "error", message: `Node '${node.label}' has invalid type '${node.nodeType}'`, nodeId: node.id });
        continue;
      }
      if (node.nodeType === "internal_agent" && !node.refAgentId && !node.refTeamAgentId) {
        teamErrors.push({ type: "schema", severity: "error", message: `Internal Agent node '${node.label}' has no agent selected`, nodeId: node.id });
      }
      if (node.nodeType === "remote_agent" && !node.refRemoteAgentId) {
        teamErrors.push({ type: "schema", severity: "error", message: `Remote Agent node '${node.label}' has no remote agent selected`, nodeId: node.id });
      }
      if (node.nodeType === "skill" && !node.refSkillId) {
        teamErrors.push({ type: "schema", severity: "error", message: `Skill node '${node.label}' has no skill selected`, nodeId: node.id });
      }
      if (node.nodeType === "knowledge_base" && !(node as any).refKnowledgeBaseId) {
        teamErrors.push({ type: "schema", severity: "error", message: `Knowledge Base node '${node.label}' has no knowledge base selected`, nodeId: node.id });
      }
      if (node.nodeType === "sub_flow" && !node.refTeamAgentId) {
        teamErrors.push({ type: "schema", severity: "error", message: `Sub-Flow node '${node.label}' has no flow selected`, nodeId: node.id });
      }
      if (node.nodeType === "expression" && !(node.config as any)?.expression) {
        teamErrors.push({ type: "schema", severity: "error", message: `Expression node '${node.label}' has no expression written`, nodeId: node.id });
      }
      if (node.nodeType === "edge_gate" && !node.gateType) {
        teamWarnings.push({ type: "schema", severity: "warning", message: `Edge Gate node '${node.label}' has no gate type selected`, nodeId: node.id });
      }
      if (node.nodeType === "tool_set" && (!node.refToolIds || node.refToolIds.length === 0)) {
        teamWarnings.push({ type: "schema", severity: "warning", message: `Tool Set node '${node.label}' has no tools selected`, nodeId: node.id });
      }
    }

    const nodeIds = teamNodes.map(n => n.id);
    const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      teamErrors.push({ type: "schema", severity: "error", message: `Duplicate node IDs: ${Array.from(new Set(duplicateIds)).join(", ")}` });
    }

    const nodeIdSet = new Set(nodeIds);
    for (const edge of teamEdges) {
      if (!nodeIdSet.has(edge.sourceNodeId)) {
        teamErrors.push({ type: "schema", severity: "error", message: `Edge references non-existent source node '${edge.sourceNodeId}'` });
      }
      if (!nodeIdSet.has(edge.targetNodeId)) {
        teamErrors.push({ type: "schema", severity: "error", message: `Edge references non-existent target node '${edge.targetNodeId}'` });
      }
    }

    if (teamNodes.length > 1) {
      const connectedNodes = new Set<string>();
      for (const edge of teamEdges) {
        connectedNodes.add(edge.sourceNodeId);
        connectedNodes.add(edge.targetNodeId);
      }
      for (const node of teamNodes) {
        if (!connectedNodes.has(node.id)) {
          teamWarnings.push({ type: "schema", severity: "warning", message: `Node '${node.label}' is disconnected from the workflow`, nodeId: node.id });
        }
      }
    }

    if (team.riskTier === "HIGH" || team.riskTier === "CRITICAL") {
      const hasApprovalGate = teamNodes.some(n => n.nodeType === "edge_gate" && n.gateType === "approval");
      if (!hasApprovalGate) {
        teamWarnings.push({ type: "policy", severity: "warning", message: "High/Critical risk team agents should include at least one Edge Gate node with gate type 'approval'" });
      }
    }
  }

  return { errors: teamErrors, warnings: teamWarnings };
}
