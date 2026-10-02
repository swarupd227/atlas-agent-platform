/**
 * How a saved process flow finds the automation it became.
 *
 * The answer is `process_flows.team_agent_id`, written by the build
 * (server/team-build.ts) and cleared when the team is deleted
 * (server/team-removal.ts). It lives here, on its own, because two callers need
 * exactly the same answer and one of them used to guess:
 *
 * - Astra's sync tool resolved it from this field from the start.
 * - The Studio resolved it from the OUTCOME instead -- "any team on this
 *   outcome that has a blueprint" -- which is empty for a flow opened from the
 *   library, so the page offered to turn an already-automated flow into an
 *   automation, and the build obligingly made a second team from it.
 *
 * The problem cases are returned as codes, not sentences: the same four states
 * have to read differently in a conversation and on a button.
 */
import { storage } from "./storage";
import { normalizeToGraph, type ProcessFlowGraph } from "@shared/process-flow";

export type FlowSyncTargetProblem =
  | { code: "no_flow" }
  | { code: "no_steps"; flowName: string }
  | { code: "not_automated"; flowName: string }
  | { code: "team_missing"; flowName: string; teamAgentId: string };

/** The team agent shape process-flow-sync needs; kept structural so neither module owns the other. */
export interface FlowSyncTeamAgent {
  id: string;
  name: string;
  blueprintId?: string | null;
  industry?: string | null;
  outcomeId?: string | null;
  organizationId?: string | null;
}

export type FlowSyncTarget =
  | { ok: true; flow: { id: string; name: string }; graph: ProcessFlowGraph; teamAgent: FlowSyncTeamAgent }
  | { ok: false; problem: FlowSyncTargetProblem };

export async function resolveFlowSyncTarget(orgId: string | undefined, flowId: string): Promise<FlowSyncTarget> {
  const flow = await storage.getProcessFlow(flowId, orgId);
  if (!flow) return { ok: false, problem: { code: "no_flow" } };
  const graph = normalizeToGraph(flow.graph, flow.name);
  if (!graph || graph.nodes.length === 0) return { ok: false, problem: { code: "no_steps", flowName: flow.name } };
  const teamAgentId = (flow as any).teamAgentId as string | null;
  if (!teamAgentId) return { ok: false, problem: { code: "not_automated", flowName: flow.name } };
  const teamAgent = await storage.getAgent(teamAgentId, orgId);
  if (!teamAgent) return { ok: false, problem: { code: "team_missing", flowName: flow.name, teamAgentId } };
  return { ok: true, flow: { id: flow.id, name: flow.name }, graph, teamAgent: teamAgent as FlowSyncTeamAgent };
}
