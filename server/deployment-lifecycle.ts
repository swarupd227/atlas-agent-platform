/**
 * The deployment lifecycle, enforced on the server.
 *
 * A deployment is created pending and goes live only by passing through the same checks, whichever
 * route or tool asks: it is not frozen, it is not finished, an approval that is waiting or refused
 * has been settled, and, for production, the person holds deploy_prod and an approved launch
 * readiness approval exists. These rules used to be spread across the routes (some had them, some
 * did not), so the same deployment could be taken live through one route that another refused.
 * They live here so the routes, the shared actions in deployment-actions.ts and Astra's tools
 * cannot disagree.
 *
 * A freeze never blocks the way out: stopping and rolling back are always allowed, because an
 * emergency stop that a freeze can block is not an emergency stop.
 */
import { storage } from "./storage";

export interface LifecycleContext {
  orgId: string | undefined;
  /** The signed-in person, for the audit trail. Never a name taken from a request body. */
  actor?: string;
  /**
   * Whether the caller holds deploy_prod. A route always sets it. Astra's tools check the role
   * themselves before they get here and leave it unset, which this layer takes to mean "already
   * checked by the caller".
   */
  canDeployProd?: boolean;
}

export type GateVerdict = { ok: true } | { ok: false; status: number; body: Record<string, unknown> };

/** Production is spelled "prod" by promotion and "production" by the Deploy dialog and the provisioning scripts. */
export const isProdEnv = (env: string | null | undefined): boolean => {
  const e = String(env ?? "").trim().toLowerCase();
  return e === "prod" || e === "production";
};

/** Serving traffic (or shadowing it). */
export const LIVE_STATUSES = new Set(["deployed", "active", "canary", "shadow"]);
/** Over for good: such a deployment is replaced, never restarted. */
export const FINISHED_STATUSES = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);
/** Has not been live yet, so whatever approval it needs has not been given by going live before. */
const NEVER_LIVE_STATUSES = new Set(["pending", "awaiting_approval", "pipeline_failed"]);

/**
 * Approval statuses that are still waiting on a decision: the same set as OPEN_APPROVAL_STATUSES in
 * approval-decision.ts (a test holds them equal; it is not imported so this module stays light).
 * An approval that expired, or was sent back for changes, can still be decided on the approval
 * pages, so a deployment holding one is awaiting a decision, not refused.
 */
export const OPEN_APPROVAL_STATUSES = new Set(["pending", "changes_requested", "expired"]);

/** Routing actions that put a deployment in front of traffic. The others (shadow off, rollback) take it out. */
export const GOES_LIVE_ACTIONS = new Set(["shadow_on", "canary_start", "canary_increase", "full_rollout"]);

export async function checkDeploymentFreeze(orgId: string | undefined, agentId: string | undefined): Promise<{ frozen: boolean; reason?: string; scope?: string }> {
  const auditEvents = await storage.getAuditEvents(orgId);
  const freezeEvents = auditEvents.filter((e) => e.action === "deployment_freeze" || e.action === "deployment_unfreeze");
  const statusMap: Record<string, { frozen: boolean; reason?: string; scope?: string }> = {};
  for (const evt of freezeEvents) {
    try {
      const details = JSON.parse(evt.details || "{}");
      const key = details.targetId || details.scope || "unknown";
      if (evt.action === "deployment_freeze") {
        statusMap[key] = { frozen: true, reason: details.reason, scope: details.scope };
      } else {
        delete statusMap[key];
      }
    } catch { /* an unreadable event says nothing about a freeze */ }
  }
  if (statusMap["org"]?.frozen) return statusMap["org"];
  if (agentId && statusMap[agentId]?.frozen) return statusMap[agentId];
  return { frozen: false };
}

/** The newest approval filed against a deployment, or null. */
export async function latestApprovalFor(deploymentId: string, orgId: string | undefined) {
  const all = await storage.getApprovals(orgId);
  const mine = all.filter((a) => a.objectType === "deployment" && a.objectId === deploymentId);
  mine.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  return mine[0] ?? null;
}

const refuse = (status: number, reason: string, message: string, extra: Record<string, unknown> = {}): GateVerdict =>
  ({ ok: false, status, body: { blocked: true, reason, message, ...extra } });

const riskScoreFor = (tier: string | null | undefined) => (tier === "CRITICAL" ? 10 : tier === "HIGH" ? 8 : tier === "MEDIUM" ? 5 : 3);

/**
 * May this deployment be taken live (started, routed to traffic, switched on) right now? Nothing is
 * changed unless a production deployment has no launch readiness approval at all: then one is filed,
 * so there is a way forward, and the answer is still no until it is approved.
 */
export async function checkMayGoLive(deployment: { id: string; agentId: string; agentName?: string | null; version?: string | null; environment: string; status: string }, ctx: LifecycleContext): Promise<GateVerdict> {
  if (FINISHED_STATUSES.has(deployment.status)) {
    return refuse(409, "deployment_finished", `This deployment is ${deployment.status.replace(/_/g, " ")} and cannot be started again; create a new one.`);
  }

  const freeze = await checkDeploymentFreeze(ctx.orgId, deployment.agentId);
  if (freeze.frozen) {
    return { ok: false, status: 423, body: { message: `Deployments are frozen${freeze.reason ? `: ${freeze.reason}` : ""}`, frozen: true } };
  }

  const prod = isProdEnv(deployment.environment);
  if (prod && ctx.canDeployProd === false) {
    return refuse(403, "deploy_prod_required", "Taking a production deployment live needs deploy_prod.");
  }

  if (NEVER_LIVE_STATUSES.has(deployment.status)) {
    const approval = await latestApprovalFor(deployment.id, ctx.orgId);
    if (approval && OPEN_APPROVAL_STATUSES.has(approval.status)) {
      const state = approval.status === "pending" ? "is waiting for a decision" : approval.status === "expired" ? "expired without a decision (it can still be decided)" : "was sent back for changes";
      return refuse(409, "awaiting_approval", `This deployment's ${String(approval.type).replace(/_/g, " ")} approval ${state}; it goes live when that is approved.`, { approvalId: approval.id, approvalStatus: approval.status });
    }
    if (approval && approval.status !== "approved") {
      return refuse(409, "approval_not_granted", `This deployment's ${String(approval.type).replace(/_/g, " ")} approval was ${approval.status}; create a new deployment to ask again.`, { approvalId: approval.id, approvalStatus: approval.status });
    }
    if (prod && !approval) {
      const agent = await storage.getAgent(deployment.agentId, ctx.orgId);
      const filed = await storage.createApproval({
        organizationId: ctx.orgId,
        type: "launch_readiness",
        objectType: "deployment",
        objectId: deployment.id,
        objectName: `${deployment.agentName || agent?.name || "Agent"} v${deployment.version || "?"} → Production`,
        status: "pending",
        requestedBy: ctx.actor || "System (Release Creation)",
        agentId: deployment.agentId,
        environment: deployment.environment,
        description: "Production launch readiness review required before this deployment can go live.",
        riskScore: riskScoreFor(agent?.riskTier),
        evidenceJson: { agentName: deployment.agentName || agent?.name, version: deployment.version, environment: deployment.environment, deploymentId: deployment.id, riskTier: agent?.riskTier || "LOW" },
      });
      await recordLifecycleEvent(ctx, deployment.id, "deployment_approval_requested", { environment: deployment.environment, approvalId: filed.id, because: "went to start with no launch readiness approval on file" });
      return refuse(409, "awaiting_approval", "A production deployment needs an approved launch readiness approval. One has been filed; the deployment can go live when it is approved.", { approvalId: filed.id, approvalFiled: true });
    }
  }

  return { ok: true };
}

/**
 * A request to skip a gate (the eval pass rate, ontology alignment) is a decision to ship something
 * the gate would have stopped, so it needs deploy_prod, and it is recorded against the signed-in
 * person: a name in the request body is not evidence of who asked.
 */
export function bypassRefusal(ctx: LifecycleContext, gate: string): { status: number; body: Record<string, unknown> } | null {
  if (ctx.canDeployProd === false) {
    return { status: 403, body: { blocked: true, reason: "deploy_prod_required", message: `Bypassing the ${gate} needs deploy_prod.` } };
  }
  return null;
}

/** The person to record a decision against. */
export const actorOf = (ctx: LifecycleContext, fallback = "unknown"): string => ctx.actor || fallback;

export type FreezeRequest =
  | { ok: true; action: "freeze" | "unfreeze"; scope: "org" | "agent"; targetId: string; reason: string }
  | { ok: false; status: number; message: string };

/**
 * A freeze or unfreeze request, read strictly. The endpoint used to treat any action that was not
 * "freeze" as an unfreeze, and recorded an org-wide freeze under whatever target id came with it,
 * where the freeze check never looked for it. An org freeze is recorded as "org".
 */
export function parseFreezeRequest(body: Record<string, unknown> | undefined): FreezeRequest {
  const { action, scope, targetId, reason } = body ?? {};
  if (action !== "freeze" && action !== "unfreeze") return { ok: false, status: 400, message: 'action must be "freeze" or "unfreeze".' };
  if (scope !== "org" && scope !== "agent") return { ok: false, status: 400, message: 'scope must be "org" or "agent".' };
  if (scope === "agent" && (typeof targetId !== "string" || targetId.trim() === "")) {
    return { ok: false, status: 400, message: "An agent freeze needs the agent's id as targetId." };
  }
  return {
    ok: true,
    action,
    scope,
    targetId: scope === "org" ? "org" : String(targetId).trim(),
    reason: typeof reason === "string" ? reason.slice(0, 500) : "",
  };
}

/** One audit event for a lifecycle change, naming the signed-in person. */
export async function recordLifecycleEvent(ctx: LifecycleContext, deploymentId: string, action: string, details: Record<string, unknown>): Promise<void> {
  try {
    await storage.createAuditEvent({
      actorType: "user",
      actorId: ctx.actor || "system",
      action,
      objectType: "deployment",
      objectId: deploymentId,
      organizationId: ctx.orgId,
      details: JSON.stringify(details),
    });
  } catch (err) {
    // The change has happened; failing the request would not undo it. It is said loudly instead.
    console.error(`[deployment-lifecycle] audit event ${action} for ${deploymentId} failed:`, err);
  }
}

/**
 * The fields a client may set when creating a deployment. Everything else is the server's: the
 * status (a deployment starts pending and goes live through approval or a rollout change), who
 * approved it, when it was deployed or promoted, the signature hash, the pipeline and evidence
 * state, the incident and patch it answers. A body that asks for a status other than "pending" is
 * refused; the other server-owned fields are dropped, and named in the response.
 */
export const CLIENT_CREATE_FIELDS = [
  "agentId", "agentName", "environment", "version", "versionId", "rolloutStrategy",
  "canaryConfig", "rollbackConfig", "autopromoteConfig", "industry", "customization",
] as const;

export function sanitizeCreateBody(body: Record<string, unknown>): { fields: Record<string, unknown>; ignored: string[]; refusal?: string } {
  const allowed = new Set<string>(CLIENT_CREATE_FIELDS);
  const fields: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    // Not data about the deployment: the action reads these two itself.
    if (key === "bypassOntologyCheck" || key === "organizationId" || key === "status") continue;
    if (allowed.has(key)) fields[key] = value;
    else ignored.push(key);
  }
  if (body.status !== undefined && body.status !== null && body.status !== "pending") {
    return { fields, ignored, refusal: `A deployment is created pending (you sent status "${String(body.status)}"). It goes live when its approval is granted or its rollout is started.` };
  }
  return { fields, ignored };
}
