/**
 * Deciding the other things that need someone: improvement recommendations
 * (accept or dismiss), agent alerts (acknowledge), policy exceptions (approve
 * or reject) and agents' tool requests (approve or decline). The Recommendations page,
 * My Actions and the Astra Workspace all go through here, so a decision does
 * the same thing and leaves the same audit record wherever it is made.
 *
 * Accepting a recommendation is honest about its effect. Only a cost
 * optimization that downgrades the model changes anything automatically;
 * retraining and workflow changes are engineering work, so accepting records
 * the decision and says what is still to be done.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { agentAlerts, improvementRecommendations, mcpElicitations, policyExceptions, type ImprovementRecommendation } from "@shared/schema";
import { filterElicitationsForOrg, filterPolicyExceptionsForOrg } from "./tenant-scope";

/** The next cheaper model in the same family; a cost optimization's model downgrade uses it. */
export const MODEL_DOWNGRADE_MAP: Record<string, string> = {
  "gpt-4.1": "gpt-4.1-mini",
  "gpt-4.1-mini": "gpt-4.1-nano",
  "gpt-4o": "gpt-4o-mini",
  "claude-sonnet-4-5": "claude-haiku-4-5",
  "claude-3-5-sonnet-20241022": "claude-3-5-haiku-20241022",
  "gemini-2.5-pro": "gemini-2.5-flash",
};

export type RecommendationEffect =
  | { kind: "model_downgrade"; agentId: string; from: string; to: string }
  | { kind: "manual"; work: string };

const words = (s: string) => s.replace(/[_-]/g, " ");

/** What accepting a recommendation will do. Pure. */
export function recommendationEffect(
  rec: Pick<ImprovementRecommendation, "agentId" | "suggestedChanges">,
  agent: { modelName?: string | null } | null | undefined,
): RecommendationEffect {
  const changes = (rec.suggestedChanges ?? {}) as Record<string, unknown>;
  const action = typeof changes.action === "string" ? changes.action : null;
  const strategies = Array.isArray(changes.strategies) ? (changes.strategies as unknown[]).filter((s): s is string => typeof s === "string") : [];

  if (action === "cost_optimization" && strategies.includes("model_downgrade")) {
    const from = agent?.modelName ?? null;
    const to = from ? MODEL_DOWNGRADE_MAP[from] : undefined;
    if (from && to) return { kind: "model_downgrade", agentId: rec.agentId, from, to };
    return {
      kind: "manual",
      work: from
        ? `There is no cheaper model mapped for ${from}, so the agent's model isn't changed; choose one by hand.`
        : "The agent has no model set, so nothing can be downgraded automatically.",
    };
  }
  if (action === "retrain") {
    return {
      kind: "manual",
      work: "Retraining isn't automated: someone still has to improve the agent (its instructions, skills or examples) and re-run its evaluations.",
    };
  }
  if (action === "workflow_optimization") {
    return {
      kind: "manual",
      work: `Workflow changes aren't applied automatically${strategies.length ? ` (${strategies.map(words).join(", ")})` : ""}: someone still has to change the agent or its team.`,
    };
  }
  return { kind: "manual", work: "Nothing is changed automatically; accepting records the decision." };
}

export class ActionDecisionError extends Error {
  constructor(message: string, readonly code: "not_found" | "not_pending") {
    super(message);
    this.name = "ActionDecisionError";
  }
}

/**
 * Carry out what accepting a recommendation does. Returns the change made, or
 * null when nothing changes automatically.
 */
export async function applyRecommendationEffect(
  rec: ImprovementRecommendation,
  orgId: string | undefined,
): Promise<{ from: string; to: string } | null> {
  const agent = await storage.getAgent(rec.agentId, orgId);
  const effect = recommendationEffect(rec, agent);
  if (!agent || effect.kind !== "model_downgrade") return null;
  await storage.updateAgent(agent.id, { modelName: effect.to });
  await storage.createAuditEvent({
    organizationId: agent.organizationId ?? orgId ?? undefined,
    actorType: "system",
    actorId: "improvement-recommendations",
    action: "agent_model_downgraded",
    objectType: "agent",
    objectId: agent.id,
    details: JSON.stringify({ recommendationId: rec.id, from: effect.from, to: effect.to }),
  });
  return { from: effect.from, to: effect.to };
}

/** A recommendation, if it concerns an agent in this organization. */
export async function getRecommendationInOrg(recId: string, orgId: string) {
  const [rec] = await db.select().from(improvementRecommendations).where(eq(improvementRecommendations.id, recId));
  if (!rec) return null;
  const agent = await storage.getAgent(rec.agentId, orgId);
  if (!agent || agent.organizationId !== orgId) return null;
  return { rec, agent };
}

export interface ActorInput {
  orgId: string;
  /** Signed-in user id, for the audit record. */
  actorId: string;
  /** How the decider is named in the audit details. */
  actorLabel: string;
  /** Where the decision was made. */
  via: string;
}

export async function decideRecommendation(input: ActorInput & { recommendationId: string; decision: "accept" | "dismiss"; note?: string }) {
  const found = await getRecommendationInOrg(input.recommendationId, input.orgId);
  if (!found) throw new ActionDecisionError("No recommendation with that id for an agent in this organization.", "not_found");
  const { rec, agent } = found;
  if (rec.status !== "pending") throw new ActionDecisionError(`That recommendation was already ${rec.status}.`, "not_pending");

  const now = new Date();
  const accept = input.decision === "accept";
  await db
    .update(improvementRecommendations)
    .set(accept ? { status: "applied", appliedAt: now } : { status: "dismissed", dismissedAt: now })
    .where(eq(improvementRecommendations.id, rec.id));

  const changed = accept ? await applyRecommendationEffect(rec, input.orgId) : null;
  const effect = recommendationEffect(rec, agent);

  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: accept ? "recommendation_accepted" : "recommendation_dismissed",
    objectType: "recommendation",
    objectId: rec.id,
    details: `Recommendation "${rec.title}" for ${agent.name} ${accept ? "accepted" : "dismissed"} by ${input.actorLabel} (via ${input.via})${
      accept ? (changed ? `: model ${changed.from} → ${changed.to}` : ": nothing changed automatically") : ""
    }${input.note ? `. Note: ${input.note}` : ""}`,
  });

  return {
    recommendation: { id: rec.id, title: rec.title, status: accept ? "applied" : "dismissed" },
    agent: { id: agent.id, name: agent.name },
    changed,
    stillToDo: accept && !changed && effect.kind === "manual" ? effect.work : null,
  };
}

/** An agent alert, if it belongs to this organization. */
export async function getAlertInOrg(alertId: string, orgId: string) {
  const [alert] = await db.select().from(agentAlerts).where(eq(agentAlerts.id, alertId));
  return alert && alert.orgId === orgId ? alert : null;
}

/**
 * Approve or reject a requested policy exception. Recorded, audited and
 * decided once; an approved exception is a record of the decision, it doesn't
 * yet change what the runtime enforces, and the result says so.
 */
export async function decidePolicyException(input: ActorInput & { exceptionId: string; decision: "approve" | "reject"; note?: string }) {
  const [pe] = await db.select().from(policyExceptions).where(eq(policyExceptions.id, input.exceptionId));
  if (!pe || (await filterPolicyExceptionsForOrg([pe], input.orgId)).length === 0) {
    throw new ActionDecisionError("No policy exception with that id in this organization.", "not_found");
  }
  if (pe.status !== "pending") throw new ActionDecisionError(`That exception was already ${pe.status}.`, "not_pending");

  const approve = input.decision === "approve";
  await db
    .update(policyExceptions)
    .set({ status: approve ? "approved" : "rejected", approvedBy: approve ? input.actorLabel : null })
    .where(eq(policyExceptions.id, pe.id));
  const policy = await storage.getPolicy(pe.policyId);
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: approve ? "policy_exception_approved" : "policy_exception_rejected",
    objectType: "policy_exception",
    objectId: pe.id,
    details: `Exception to "${policy?.name ?? "a policy"}" ${approve ? "approved" : "rejected"} by ${input.actorLabel} (via ${input.via})${input.note ? `. Note: ${input.note}` : ""}`,
  });
  return {
    exception: { id: pe.id, policyName: policy?.name ?? null, status: approve ? "approved" : "rejected", reason: pe.reason },
    runtimeEffect: approve ? "Recorded only: the runtime doesn't read exceptions yet, so the policy is still enforced as before." : null,
  };
}

/**
 * Answer an agent's request to use a tool (an MCP elicitation). The same
 * statuses as the elicitation's own respond route, so an agent waiting on it
 * sees the answer, and a linked approval is closed with it.
 */
export async function respondToToolRequest(input: ActorInput & { elicitationId: string; decision: "approve" | "decline"; note?: string }) {
  const [el] = await db.select().from(mcpElicitations).where(eq(mcpElicitations.id, input.elicitationId));
  if (!el || (await filterElicitationsForOrg([el], input.orgId)).length === 0) {
    throw new ActionDecisionError("No tool request with that id in this organization.", "not_found");
  }
  if (el.status !== "pending") throw new ActionDecisionError(`That tool request was already ${el.status}.`, "not_pending");

  const status = input.decision === "approve" ? "approved" : "declined";
  const now = new Date();
  await db.update(mcpElicitations).set({ status, decidedBy: input.actorLabel, decidedAt: now }).where(eq(mcpElicitations.id, el.id));
  if (el.linkedApprovalId) await storage.updateApproval(el.linkedApprovalId, { status, decidedBy: input.actorLabel, decidedAt: now });
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: `elicitation_${input.decision}`,
    objectType: "mcp_elicitation",
    objectId: el.id,
    details: `Request to use ${el.toolName || "a tool"} on ${el.serverName || "a connector"} ${status} by ${input.actorLabel} (via ${input.via})${input.note ? `. Note: ${input.note}` : ""}`,
  });
  return { toolRequest: { id: el.id, toolName: el.toolName, serverName: el.serverName, status } };
}

export async function acknowledgeAlert(input: ActorInput & { alertId: string; note?: string }) {
  const alert = await getAlertInOrg(input.alertId, input.orgId);
  if (!alert) throw new ActionDecisionError("No alert with that id in this organization.", "not_found");
  if (alert.acknowledgedAt) throw new ActionDecisionError("That alert was already acknowledged.", "not_pending");

  await db.update(agentAlerts).set({ acknowledgedAt: new Date() }).where(eq(agentAlerts.id, alert.id));
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: "alert_acknowledged",
    objectType: "agent_alert",
    objectId: alert.id,
    details: `Alert "${alert.message}" on ${alert.agentName} acknowledged by ${input.actorLabel} (via ${input.via})${input.note ? `. Note: ${input.note}` : ""}`,
  });
  return { alert: { id: alert.id, agentName: alert.agentName, message: alert.message, acknowledged: true } };
}
