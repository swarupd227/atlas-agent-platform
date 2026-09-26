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
import { isTeamNodeType, missingRequirement, nodeTypeLabel } from "@shared/team-node-types";

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
    // The list lives in shared/team-node-types.ts, beside the engine dispatch it
    // mirrors. Maintaining it here by hand failed three times -- knowledge_base,
    // then sub_flow and expression, then tool_call -- each time rejecting a node
    // the engine runs perfectly as "invalid type". The last one was the worst:
    // it refused a team from Astra Cowork ("the team's wiring has 6 blocking
    // errors") while the same team bound a policy through the run API.
    for (const node of teamNodes) {
      if (!isTeamNodeType(node.nodeType)) {
        teamErrors.push({ type: "schema", severity: "error", message: `Node '${node.label}' has invalid type '${node.nodeType}'`, nodeId: node.id });
        continue;
      }
      // Accepting the type but not its requirements is half a check: a
      // tool_call with no tool bound is as unrunnable as an unknown type.
      const missing = missingRequirement(node as any);
      if (missing) {
        teamErrors.push({ type: "schema", severity: "error", message: `${nodeTypeLabel(node.nodeType)} node '${node.label}' ${missing}`, nodeId: node.id });
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
