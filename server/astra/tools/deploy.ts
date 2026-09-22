import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview, ProofEnvelope } from "../types";
import { resolveAgentRef } from "./refs";

/**
 * Deploy & Operate studio pack. Every change uses the same gates and
 * approvals as the classic deployment routes (server/deployment-actions.ts):
 * deployment freeze, the eval, ontology and policy gates, and the approval a
 * hop creates, which decide_approval then decides. Anything touching
 * production also needs the deploy_prod permission, checked here.
 */

const PACK = "deploy";
const ENVS = ["staging", "pilot", "prod"] as const;

const prodAllowed = (ctx: AstraToolContext) => !!ctx.can?.(ctx.role, "deploy_prod");
const prodRefusal = (ctx: AstraToolContext) => ({ refuse: `The ${ctx.role} role can't change production deployments (it needs deploy_prod).` });

/** A deployment by id, or an agent's current deployment by the agent's name (refuses when several are live). */
async function resolveDeployment(ctx: AstraToolContext, ref: string): Promise<{ deployment: any } | { refuse: string }> {
  const byId = await ctx.services.getDeploymentView(ctx.orgId, ref);
  if (byId) return { deployment: byId };
  const agent = await resolveAgentRef(ctx, ref);
  if ("refuse" in agent) return { refuse: `No deployment "${ref}", and ${agent.refuse.charAt(0).toLowerCase()}${agent.refuse.slice(1)}` };
  const current: any[] = await ctx.services.listDeployments(ctx.orgId, agent.item.id);
  if (current.length === 0) return { refuse: `${agent.item.name} has no current deployment.` };
  if (current.length > 1) return { refuse: `${agent.item.name} has ${current.length} current deployments: ${current.map((d) => `${d.environment} ${d.status} (${d.id})`).join("; ")}. Say which one.` };
  return { deployment: await ctx.services.getDeploymentView(ctx.orgId, current[0].id) };
}

/** A blocked or refused action comes back as a result the model can explain, not a failure. */
function outcomeOf(r: { status: number; body: any }): { ok: boolean; [key: string]: any } {
  if (r.status >= 400) {
    return {
      ok: false,
      blocked: true,
      reason: r.body?.reason ?? (r.body?.frozen ? "deployment_freeze" : r.body?.evalGateBlocked ? "eval_gate" : "refused"),
      message: r.body?.message ?? "The action was refused.",
      ...(r.body?.failingChecks ? { failingChecks: r.body.failingChecks } : {}),
      ...(r.body?.failingSuites ? { failingSuites: r.body.failingSuites } : {}),
      ...(r.body?.lowAlignmentTools ? { lowAlignmentTools: r.body.lowAlignmentTools } : {}),
      ...(r.body?.autoRollback ? { autoRollback: true } : {}),
    };
  }
  return { ok: true };
}

export const listDeploymentsTool: AstraTool<{ agent?: string; includeFinished?: boolean }> = {
  name: "list_deployments",
  description: "The organization's current deployments (or one agent's): environment, status, canary percentage, shadow traffic, and any approval still waiting on each.",
  input: z.object({ agent: z.string().optional(), includeFinished: z.boolean().optional().describe("Also rolled-back and promoted ones.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    let agentId: string | undefined;
    if (input.agent) {
      const ref = await resolveAgentRef(ctx, input.agent);
      if ("refuse" in ref) throw new Error(ref.refuse);
      agentId = ref.item.id;
    }
    const deployments = await ctx.services.listDeployments(ctx.orgId, agentId, input.includeFinished ?? false);
    return {
      payload: { total: deployments.length, deployments },
      artifact: { kind: "deployments", title: "Deployments", props: { deployments }, fullViewHref: "/deployments" },
      proof: { compliance: { status: "measured", summary: `${deployments.length} deployments · ${deployments.filter((d: any) => d.pendingApproval).length} waiting on an approval` } },
    };
  },
};

export const agentHealthTool: AstraTool<{ agent: string }> = {
  name: "agent_health",
  description: "An agent's health from its most recent runs: success rate, average latency, policy violations and cost, with the number of runs it's based on. Nothing projected or estimated.",
  input: z.object({ agent: z.string().min(1) }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) throw new Error(ref.refuse);
    const h = await ctx.services.agentHealth(ctx.orgId, ref.item.id);
    if (!h) throw new Error("That agent isn't in this organization.");
    const proof: Partial<ProofEnvelope> = h.runs
      ? { compliance: { status: "measured", summary: `${Math.round((h.successRate ?? 0) * 100)}% success over the last ${h.runs} runs · ${h.policyViolations} policy violations` } }
      : { compliance: { status: "not_measured", reason: "No runs yet." } };
    return { payload: h, artifact: { kind: "agentHealth", title: `Health · ${h.agent.name}`, props: h, fullViewHref: `/agents/${h.agent.id}` }, proof };
  },
};

export const listIncidentsTool: AstraTool<{ agent?: string }> = {
  name: "list_incidents",
  description: "Open incidents in the organization (or for one agent): severity, status, the metric that raised them, the deployment involved.",
  input: z.object({ agent: z.string().optional() }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    let agentId: string | undefined;
    if (input.agent) {
      const ref = await resolveAgentRef(ctx, input.agent);
      if ("refuse" in ref) throw new Error(ref.refuse);
      agentId = ref.item.id;
    }
    const incidents = await ctx.services.listIncidents(ctx.orgId, agentId);
    return { payload: { total: incidents.length, incidents }, proof: { compliance: { status: "measured", summary: `${incidents.length} open incidents` } } };
  },
};

const approvalLine = (env: string, riskTier: string | null) => {
  const risk = riskTier ?? "LOW";
  const needs = env === "prod" || risk === "HIGH" || risk === "CRITICAL" || (env === "pilot" && (risk === "MEDIUM" || risk === "HIGH" || risk === "CRITICAL"));
  if (!needs) return "No approval is needed for this risk tier and environment; the deployment is created pending, and traffic starts with change_rollout.";
  return `A ${env === "prod" ? "launch readiness" : "deployment review"} approval is created; the deployment stays pending until it's approved (it can be decided here with decide_approval).`;
};

export const deployAgentTool: AstraTool<{ agent: string; environment: (typeof ENVS)[number]; rolloutStrategy?: "canary" | "shadow" | "full" }> = {
  name: "deploy_agent",
  description: "Create a deployment of an agent to staging, pilot or production, with its rollout strategy. It's created pending: the approval its risk and environment require (and, for production, the ontology gate) apply exactly as on the Deployments page.",
  input: z.object({
    agent: z.string().min(1),
    environment: z.enum(ENVS),
    rolloutStrategy: z.enum(["canary", "shadow", "full"]).optional().describe("Default canary."),
  }),
  permission: "deploy_staging_pilot",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    if (input.environment === "prod" && !prodAllowed(ctx)) return prodRefusal(ctx);
    const ref = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in ref) return ref;
    const freeze = await ctx.services.deploymentFreeze(ctx.orgId, ref.item.id);
    if (freeze.frozen) return { refuse: `Deployments are frozen${freeze.reason ? `: ${freeze.reason}` : ""}.` };
    const agent: any = await ctx.services.getAgent(ctx.orgId, ref.item.id);
    return {
      summary: `Deploy ${ref.item.name} to ${input.environment} (${input.rolloutStrategy ?? "canary"})`,
      details: [
        approvalLine(input.environment, agent?.riskTier ?? null),
        ...(input.environment === "prod" ? ["Production deployments are refused if the agent's tools are below 50% ontology alignment."] : []),
        "Recorded in the audit trail.",
      ],
      frozen: { agentId: ref.item.id, environment: input.environment, rolloutStrategy: input.rolloutStrategy ?? null },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { agentId: string; environment: "staging" | "pilot" | "prod"; rolloutStrategy: string | null } | undefined;
    if (!f) throw new Error("Deploying needs the confirmation card.");
    const r = await ctx.services.deployAgentAs(ctx.orgId, f.agentId, f.environment, f.rolloutStrategy ?? undefined);
    const o = outcomeOf(r);
    if (!o.ok) return { payload: o, proof: { compliance: { status: "measured", summary: `Blocked: ${o.message}` } } };
    return {
      payload: { deployed: true, deployment: { id: r.body.id, environment: r.body.environment, status: r.body.status }, approval: r.body.approval ? { id: r.body.approval.id, type: r.body.approval.type } : null, ...(r.body.strategyWarning ? { strategyWarning: r.body.strategyWarning } : {}) },
      proof: { compliance: { status: "measured", summary: `Deployment created (${r.body.status})${r.body.approval ? ` · ${r.body.approval.type.replace(/_/g, " ")} approval pending` : ""}` } },
    };
  },
};

export const promoteDeploymentTool: AstraTool<{ deployment: string }> = {
  name: "promote_deployment",
  description: "Promote a deployment to the next environment (staging → pilot → production). The gates run as on the Deployments page -- freeze, eval pass rate, ontology alignment and the policy gate -- and a blocked gate refuses with its reasons. The new deployment waits for its approval.",
  input: z.object({ deployment: z.string().min(1).describe("The deployment's id, or the agent's name for its current deployment.") }),
  permission: "deploy_staging_pilot",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const d = await resolveDeployment(ctx, input.deployment);
    if ("refuse" in d) return d;
    const dep = d.deployment;
    if (!dep.nextEnvironment) return { refuse: `${dep.agentName ?? "This deployment"} is already in ${dep.environment}; there's nowhere to promote it.` };
    if (dep.nextEnvironment === "prod" && !prodAllowed(ctx)) return prodRefusal(ctx);
    const freeze = await ctx.services.deploymentFreeze(ctx.orgId, dep.agentId);
    if (freeze.frozen) return { refuse: `Deployments are frozen${freeze.reason ? `: ${freeze.reason}` : ""}.` };
    return {
      summary: `Promote ${dep.agentName ?? "deployment"} ${dep.environment} → ${dep.nextEnvironment}`,
      details: [
        `Checks the gates first: eval pass rate (${dep.nextEnvironment === "prod" ? "production blocks below its threshold" : "a warning only below pilot's threshold"})${dep.nextEnvironment === "prod" ? ", ontology alignment" : ""}${dep.nextEnvironment === "prod" || dep.nextEnvironment === "staging" ? ", and the policy gate" : ""}. If one blocks, nothing changes.`,
        `Otherwise the ${dep.environment} deployment is marked promoted and a pending ${dep.nextEnvironment} deployment is created with a ${dep.nextEnvironment === "prod" ? "launch readiness" : "deployment review"} approval.`,
        "Recorded in the audit trail.",
      ],
      frozen: { deploymentId: dep.id, from: dep.environment, to: dep.nextEnvironment },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { deploymentId: string; to: string } | undefined;
    if (!f) throw new Error("Promoting needs the confirmation card.");
    if (f.to === "prod" && !prodAllowed(ctx)) throw new Error(prodRefusal(ctx).refuse);
    const r = await ctx.services.promoteDeploymentAs(ctx.orgId, f.deploymentId);
    const o = outcomeOf(r);
    if (!o.ok) return { payload: o, proof: { compliance: { status: "measured", summary: `Promotion blocked: ${o.message}` } } };
    const view = await ctx.services.getDeploymentView(ctx.orgId, r.body.id);
    return {
      payload: { promoted: true, deployment: view ?? { id: r.body.id, environment: r.body.environment, status: r.body.status }, ...(r.body.evalWarning ? { evalWarning: r.body.evalWarning } : {}) },
      proof: { compliance: { status: "measured", summary: `Promoted to ${r.body.environment} (pending)${view?.pendingApproval ? ` · ${view.pendingApproval.type.replace(/_/g, " ")} approval pending` : ""}` } },
    };
  },
};

const ROLLOUT_EFFECT: Record<string, string> = {
  shadow_on: "Turns on shadow traffic: the agent receives copies of real requests, and its answers aren't used.",
  shadow_off: "Turns shadow traffic off.",
  canary_start: "Starts a canary: this share of real traffic goes to the new version.",
  canary_increase: "Raises the canary share. First, the last 20 runs are checked: if errors exceed the configured threshold, the deployment is rolled back automatically instead.",
  full_rollout: "Sends all traffic to this deployment and makes it active; a linked incident is marked resolved.",
};

export const changeRolloutTool: AstraTool<{ deployment: string; action: "shadow_on" | "shadow_off" | "canary_start" | "canary_increase" | "full_rollout"; percent?: number }> = {
  name: "change_rollout",
  description: "Change how much real traffic a deployment gets: shadow on or off, start or raise a canary, or roll out fully. Production also needs deploy_prod.",
  input: z.object({
    deployment: z.string().min(1),
    action: z.enum(["shadow_on", "shadow_off", "canary_start", "canary_increase", "full_rollout"]),
    percent: z.number().int().min(1).max(100).optional().describe("Canary percentage for canary_start or canary_increase."),
  }),
  permission: "deploy_staging_pilot",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const d = await resolveDeployment(ctx, input.deployment);
    if ("refuse" in d) return d;
    const dep = d.deployment;
    if (dep.environment === "prod" && !prodAllowed(ctx)) return prodRefusal(ctx);
    if (dep.pendingApproval) return { refuse: `This deployment is still waiting on its ${dep.pendingApproval.type.replace(/_/g, " ")} approval (${dep.pendingApproval.id}); decide that first.` };
    const freeze = await ctx.services.deploymentFreeze(ctx.orgId, dep.agentId);
    if (freeze.frozen) return { refuse: `Deployments are frozen${freeze.reason ? `: ${freeze.reason}` : ""}.` };
    return {
      summary: `${input.action.replace(/_/g, " ")}: ${dep.agentName ?? "deployment"} in ${dep.environment}${input.percent ? ` (${input.percent}%)` : ""}`,
      details: [ROLLOUT_EFFECT[input.action], `Now: ${dep.status}, canary ${dep.canaryPercent}%${dep.shadowEnabled ? ", shadow on" : ""}.`, "Recorded in the audit trail."],
      frozen: { deploymentId: dep.id, action: input.action, percent: input.percent ?? null, environment: dep.environment },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { deploymentId: string; action: string; percent: number | null; environment: string } | undefined;
    if (!f) throw new Error("Changing a rollout needs the confirmation card.");
    if (f.environment === "prod" && !prodAllowed(ctx)) throw new Error(prodRefusal(ctx).refuse);
    const r = await ctx.services.changeRolloutAs(ctx.orgId, f.deploymentId, f.action, f.percent ?? undefined);
    const o = outcomeOf(r);
    if (!o.ok) return { payload: o, proof: { compliance: { status: "measured", summary: o.autoRollback ? "Canary rolled back automatically: unhealthy recent runs" : `Refused: ${o.message}` } } };
    return {
      payload: { changed: true, deployment: { id: r.body.id, status: r.body.status, canaryPercent: r.body.canaryPercent, shadowEnabled: r.body.shadowEnabled } },
      proof: { compliance: { status: "measured", summary: `${f.action.replace(/_/g, " ")} · now ${r.body.status}, canary ${r.body.canaryPercent ?? 0}%` } },
    };
  },
};

export const rollbackDeploymentTool: AstraTool<{ deployment: string; reason: string }> = {
  name: "rollback_deployment",
  description: "Roll a deployment back: it's marked rolled back, its runtime is stopped, and an incident record is written to the audit trail. Production also needs deploy_prod.",
  input: z.object({ deployment: z.string().min(1), reason: z.string().min(3).max(500) }),
  permission: "deploy_staging_pilot",
  pack: PACK,
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const d = await resolveDeployment(ctx, input.deployment);
    if ("refuse" in d) return d;
    const dep = d.deployment;
    if (dep.environment === "prod" && !prodAllowed(ctx)) return prodRefusal(ctx);
    return {
      summary: `Roll back ${dep.agentName ?? "deployment"} in ${dep.environment}`,
      details: [`Marks it rolled back and stops its runtime, so scheduled and triggered runs stop. Reason recorded: "${input.reason}".`, "Recorded in the audit trail as an incident."],
      warnings: dep.environment === "prod" ? [{ title: "Production", detail: "Production traffic stops being served by this deployment." }] : [],
      frozen: { deploymentId: dep.id, environment: dep.environment, reason: input.reason },
    };
  },
  run: async (ctx) => {
    const f = ctx.confirmation?.frozen as { deploymentId: string; environment: string; reason: string } | undefined;
    if (!f) throw new Error("Rolling back needs the confirmation card.");
    if (f.environment === "prod" && !prodAllowed(ctx)) throw new Error(prodRefusal(ctx).refuse);
    const r = await ctx.services.rollbackDeploymentAs(ctx.orgId, f.deploymentId, f.reason);
    const o = outcomeOf(r);
    if (!o.ok) return { payload: o };
    return { payload: { rolledBack: true, deployment: { id: r.body.id, status: r.body.status } }, proof: { compliance: { status: "measured", summary: "Rolled back · runtime stopped · audit recorded" } } };
  },
};

export const DEPLOY_TOOLS = [listDeploymentsTool, agentHealthTool, listIncidentsTool, deployAgentTool, promoteDeploymentTool, changeRolloutTool, rollbackDeploymentTool];
