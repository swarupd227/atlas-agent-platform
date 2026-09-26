/**
 * Astra services for syncing a process flow into the automation built from it.
 *
 * The reconciliation is server/process-flow-sync.ts, shared with the Studio's
 * own route, so a sync asked for in a conversation and one clicked in the Studio
 * cannot differ. What is added here is the resolution a conversation needs: the
 * user names a flow, not a blueprint, and the flow knows which team it became
 * (process_flows.team_agent_id, written by the build).
 */
import { storage } from "../storage";
import { applyFlowSync, planFlowSync } from "../process-flow-sync";
import { normalizeToGraph } from "@shared/process-flow";

async function resolve(orgId: string, flowId: string) {
  const flow = await storage.getProcessFlow(flowId, orgId);
  if (!flow) throw new Error("No process flow with that id in this organization.");
  const graph = normalizeToGraph(flow.graph, flow.name);
  if (!graph || graph.nodes.length === 0) throw new Error(`"${flow.name}" has no steps yet, so there is nothing to sync.`);
  const teamAgentId = (flow as any).teamAgentId as string | null;
  if (!teamAgentId) {
    throw new Error(`"${flow.name}" hasn't been turned into an automation yet, so there is nothing to sync it into. automate_process_flow builds one from it.`);
  }
  const teamAgent = await storage.getAgent(teamAgentId, orgId);
  if (!teamAgent) {
    throw new Error(`"${flow.name}" points at an automation that no longer exists. Build a new one from it with automate_process_flow.`);
  }
  return { flow, graph, teamAgent };
}

/** What syncing this flow into its automation would change, without changing it. */
async function planFlowSyncFor(orgId: string, flowId: string, forceFullRebuild?: boolean) {
  const { flow, graph, teamAgent } = await resolve(orgId, flowId);
  const plan = await planFlowSync(orgId, {
    graph,
    flowName: flow.name,
    teamAgent: teamAgent as any,
    outcomeId: (teamAgent as any).outcomeId ?? null,
  }, { forceFullRebuild });
  return { flow: { id: flow.id, name: flow.name }, ...plan };
}

/** Do it, and report what moved. */
async function applyFlowSyncFor(orgId: string, flowId: string, opts: { forceFullRebuild?: boolean; actor?: string } = {}) {
  const { flow, graph, teamAgent } = await resolve(orgId, flowId);
  const result = await applyFlowSync(orgId, {
    graph,
    flowName: flow.name,
    teamAgent: teamAgent as any,
    outcomeId: (teamAgent as any).outcomeId ?? null,
  }, { forceFullRebuild: opts.forceFullRebuild, via: `Astra Cowork${opts.actor ? ` (${opts.actor})` : ""}` });
  return { flow: { id: flow.id, name: flow.name }, team: { id: teamAgent.id, name: teamAgent.name }, ...result };
}

/** The automation a flow became, for anything that has to mention it. */
async function automationForFlow(orgId: string, flowId: string) {
  const flow = await storage.getProcessFlow(flowId, orgId);
  const teamAgentId = flow ? ((flow as any).teamAgentId as string | null) : null;
  if (!teamAgentId) return null;
  const teamAgent = await storage.getAgent(teamAgentId, orgId);
  return teamAgent ? { id: teamAgent.id, name: teamAgent.name, status: teamAgent.status } : null;
}

export const flowSyncServices = {
  planFlowSyncFor,
  applyFlowSyncFor,
  automationForFlow,
};
