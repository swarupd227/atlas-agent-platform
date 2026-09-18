/**
 * Astra services for the Deploy & Operate pack. Changes go through
 * server/deployment-actions.ts -- the same gates and approvals as the classic
 * deployment routes -- never through routes that skip them. Health is
 * computed from the agent's own recent run traces only; generated figures
 * (blast radius, projected impact) aren't used.
 */
import { storage } from "../storage";
import { changeRoutingAction, checkDeploymentFreeze, createDeploymentAction, promoteDeploymentAction, rollbackDeploymentAction } from "../deployment-actions";

const ENV_ORDER = ["staging", "pilot", "prod"];
const FINISHED = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);

const depView = (d: any) => ({
  id: d.id,
  agentId: d.agentId,
  agentName: d.agentName ?? null,
  environment: d.environment,
  status: d.status,
  version: d.version ?? null,
  canaryPercent: d.canaryPercent ?? 0,
  shadowEnabled: !!d.shadowEnabled,
  rolloutStrategy: d.rolloutStrategy ?? null,
  createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
});

async function depInOrg(orgId: string, id: string) {
  const d = await storage.getDeployment(id, orgId);
  return d && d.organizationId === orgId ? d : null;
}

/** Deployments in the organization, newest first, with any approval still waiting on each. */
async function listDeployments(orgId: string, agentId?: string, includeFinished = false) {
  const [all, approvals] = await Promise.all([storage.getDeployments(orgId), storage.getApprovals(orgId)]);
  const pendingByDeployment = new Map(
    approvals.filter((a) => a.objectType === "deployment" && a.status === "pending" && a.objectId).map((a) => [a.objectId as string, { id: a.id, type: a.type }]),
  );
  return all
    .filter((d) => d.organizationId === orgId && (!agentId || d.agentId === agentId) && (includeFinished || !FINISHED.has(d.status)))
    .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 30)
    .map((d) => ({ ...depView(d), pendingApproval: pendingByDeployment.get(d.id) ?? null }));
}

async function getDeploymentView(orgId: string, id: string) {
  const d = await depInOrg(orgId, id);
  if (!d) return null;
  const agent = await storage.getAgent(d.agentId, orgId);
  const approvals = (await storage.getApprovals(orgId)).filter((a) => a.objectType === "deployment" && a.objectId === d.id && a.status === "pending");
  return { ...depView(d), riskTier: agent?.riskTier ?? null, nextEnvironment: ENV_ORDER[ENV_ORDER.indexOf(d.environment) + 1] ?? null, pendingApproval: approvals[0] ? { id: approvals[0].id, type: approvals[0].type } : null };
}

/** An agent's health from its most recent run traces -- measured, with the sample size. */
async function agentHealth(orgId: string, agentId: string, sample = 30) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent || agent.organizationId !== orgId) return null;
  const traces = (await storage.getTracesByAgent(agentId, orgId)).filter((t) => t.environment !== "dry-run").slice(0, sample);
  const failed = traces.filter((t) => t.status === "failed" || t.status === "error").length;
  const withLatency = traces.filter((t) => typeof t.latencyMs === "number");
  const violations = traces.reduce((n, t) => n + ((t.policyChecks as any)?.violations?.length ?? 0), 0);
  return {
    agent: { id: agent.id, name: agent.name },
    runs: traces.length,
    successRate: traces.length ? (traces.length - failed) / traces.length : null,
    avgLatencyMs: withLatency.length ? Math.round(withLatency.reduce((s, t) => s + (t.latencyMs ?? 0), 0) / withLatency.length) : null,
    policyViolations: violations,
    costUsd: traces.length ? Math.round(traces.reduce((s, t) => s + (t.costUsd ?? 0), 0) * 10000) / 10000 : null,
  };
}

async function listIncidents(orgId: string, agentId?: string) {
  return (await storage.getIncidents(orgId))
    .filter((i: any) => i.organizationId === orgId && (!agentId || i.agentId === agentId) && i.status !== "closed")
    .slice(0, 20)
    .map((i: any) => ({ id: i.id, agentName: i.agentName ?? null, severity: i.severity, status: i.status, sourceMetric: i.sourceMetric ?? null, deploymentId: i.deploymentId ?? null, createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null }));
}

async function deploymentFreeze(orgId: string, agentId: string) {
  return checkDeploymentFreeze(orgId, agentId);
}

async function deployAgentAs(orgId: string, agentId: string, environment: "staging" | "pilot" | "prod", rolloutStrategy: string | undefined) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent || agent.organizationId !== orgId) throw new Error("No agent with that id in this organization.");
  // Always created pending, never with a bypass flag: activation goes through its approval or a rollout change.
  return createDeploymentAction({ orgId }, {
    agentId: agent.id,
    agentName: agent.name,
    environment,
    status: "pending",
    version: (agent as any).currentVersion || "1.0.0",
    ...(rolloutStrategy ? { rolloutStrategy } : {}),
  });
}

async function promoteDeploymentAs(orgId: string, id: string) {
  if (!(await depInOrg(orgId, id))) throw new Error("No deployment with that id in this organization.");
  return promoteDeploymentAction({ orgId }, id, {});
}

async function changeRolloutAs(orgId: string, id: string, action: string, canaryPercent?: number) {
  if (!(await depInOrg(orgId, id))) throw new Error("No deployment with that id in this organization.");
  return changeRoutingAction({ orgId }, id, { action, ...(canaryPercent != null ? { canaryPercent } : {}) });
}

async function rollbackDeploymentAs(orgId: string, id: string, reason: string) {
  if (!(await depInOrg(orgId, id))) throw new Error("No deployment with that id in this organization.");
  return rollbackDeploymentAction({ orgId }, id, { reason });
}

export const deployServices = {
  listDeployments,
  getDeploymentView,
  agentHealth,
  listIncidents,
  deploymentFreeze,
  deployAgentAs,
  promoteDeploymentAs,
  changeRolloutAs,
  rollbackDeploymentAs,
};
