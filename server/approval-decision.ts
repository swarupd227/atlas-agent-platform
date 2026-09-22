/**
 * Deciding an approval, wherever it is decided.
 *
 * PATCH /api/approvals/:id (server/routes/governance.ts) and the Astra
 * Workspace share everything here, so a decision has the same effect on both
 * paths: who may decide, and what each kind of approval does once decided
 * (applyApprovalEffects). decideApproval is the whole decision for Astra.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { resumeTeamAgentDagRun } from "./dag-execution-engine";
import { resumeWorkspaceRun } from "./workspace-run";
import { promoteToBaseline } from "./services/screenshot-baseline";
import { canDecideApproval, type RoleId } from "./permissions";
import { workspaceRuns, type Approval } from "@shared/schema";

export type ApprovalDecision = "approved" | "rejected";


export class ApprovalDecisionError extends Error {
  constructor(message: string, readonly code: "not_found" | "not_pending" | "not_allowed" | "unsupported") {
    super(message);
    this.name = "ApprovalDecisionError";
  }
}

/** Who may decide this approval: its routed reviewer role (or admin), otherwise approve_changes. */
export function whoMayDecide(role: RoleId, approval: Pick<Approval, "requiredReviewerRole">) {
  return canDecideApproval(role, approval.requiredReviewerRole);
}

/**
 * An outcome review decision moves the outcome out of pending review:
 * approved → awaiting its agent plan, rejected → back to draft.
 * Returns the outcome's new status, or null when nothing changed.
 */
export async function applyOutcomeReviewDecision(
  approval: Pick<Approval, "objectType" | "objectId">,
  status: string | undefined,
  orgId: string | undefined,
): Promise<string | null> {
  if (approval.objectType !== "outcome_contract" || !approval.objectId) return null;
  if (status !== "approved" && status !== "rejected") return null;
  const outcome = await storage.getOutcome(approval.objectId, orgId);
  if (!outcome || outcome.status !== "pending_review") return null;
  const next = status === "approved" ? "awaiting_agent_plan" : "draft";
  await storage.updateOutcome(approval.objectId, { status: next }, orgId);
  return next;
}

/**
 * A team run waiting on this approval resumes right away, instead of on the
 * waiter's next poll. Finds the run by its pending approval id. Fire and forget.
 */
export function resumeTeamRunWaitingOn(approvalId: string): void {
  storage.listDagExecutionRunsByStatus("waiting_approval")
    .then(runs => {
      const match = runs.find(r => r.pendingApprovalId === approvalId);
      if (match) resumeTeamAgentDagRun(match.id).catch(err => console.error(`[dag-resume] fast-path resume of ${match.id} failed:`, err.message));
    })
    .catch(() => {});
}

/**
 * What a decision will do, in words, for a confirmation card. Kept next to
 * applyApprovalEffects so the two can't drift: every kind it acts on is
 * described here, and every other kind says only the approval changes.
 */
export function describeApprovalEffect(
  a: { type: string; objectType: string; objectName: string | null },
  decision: "approve" | "reject",
  names: { outcomeName?: string | null } = {},
): string {
  const approve = decision === "approve";
  const what = a.objectName ?? "it";
  if (a.objectType === "outcome_contract") {
    const name = names.outcomeName ?? a.objectName ?? "The outcome";
    return approve
      ? `${name} moves out of review and is ready for its agent plan: a team can be proposed and built.`
      : `${name} goes back to draft; it can be edited and submitted again.`;
  }
  if (a.objectType === "pipeline_gate") {
    return approve ? "The team run waiting at this step continues." : "The team run stops at this step (a rejected gate fails it).";
  }
  if (a.type === "tool-invocation") {
    return approve
      ? `The agent may call ${what}: a run waiting on it continues, and this agent's later calls to ${what} are allowed without asking again.`
      : `The agent is refused ${what}: a run waiting on it is told the step was denied. Later calls will ask again.`;
  }
  if (a.objectType === "deployment") {
    return approve
      ? `The deployment of ${what} goes live with its rollout strategy: shadow, a canary at its starting percentage, or full.`
      : "The deployment stays pending; nothing is activated.";
  }
  if (a.objectType === "patch") {
    return approve
      ? `The patch is approved and a pilot deployment is created from its rollout plan${what !== "it" ? ` (${what})` : ""}.`
      : "The patch is not deployed.";
  }
  if (a.objectType === "agent" && (a.type === "retirement_review" || a.type === "handover_review")) {
    return approve ? `${what === "it" ? "The agent" : what} is retired.` : "The agent is not retired.";
  }
  if (a.type === "code_execution_enablement") {
    return approve
      ? `Code execution is enabled for the skill ${what}, for every agent that uses it.`
      : "Code execution stays off for this skill.";
  }
  if (a.objectType === "ui_baseline_diff") {
    return approve
      ? "The new screenshot becomes the baseline that later runs are compared with."
      : "The current baseline stays; the new screenshot is not adopted.";
  }
  return `Only the approval is ${approve ? "approved" : "rejected"}; this kind of approval doesn't change anything else.`;
}

export interface ApprovalEffectsContext {
  /** The organization the decision is made in (the caller's, or the default one). */
  orgId: string | undefined;
  /** The organization resolved from the request, when there is one; lookups use it as the classic route always has. */
  requestOrgId: string | undefined;
  /** How the decider is shown on what the decision creates or activates. */
  decidedBy: string;
  /** Optional rollout constraints (maxCanaryPercent, shadowOnly) from the Approvals page. */
  constraintsJson?: unknown;
}

/**
 * What deciding an approval does beyond updating the approval itself, per
 * kind. Moved verbatim from PATCH /api/approvals/:id so the Approvals page and
 * the Astra Workspace can't drift apart. Returns the outcome's new status when
 * the approval was an outcome review.
 */
export async function applyApprovalEffects(approval: Approval, status: string | undefined, ctx: ApprovalEffectsContext): Promise<{ outcomeStatus: string | null }> {
  const { decidedBy, constraintsJson } = ctx as { decidedBy: string; constraintsJson: any };
  // Real governance gate: approving an outcome review advances the outcome
  // out of pending_review; rejecting it parks the outcome as a draft.
  // (Shared with the Astra Workspace: server/approval-decision.ts.)
  const outcomeStatus = await applyOutcomeReviewDecision(approval, status, ctx.orgId);

  // Real governance gate: approving a code-execution enablement request is
  // what actually flips skills.codeExecutionApproved -- mirrors
  // POST /api/mcp-servers/:id/enable-production, whose approval is
  // per-resource (skill) not per-attachment, so any agent using this
  // skill benefits once approved.
  if (approval.type === "code_execution_enablement" && approval.objectId && status === "approved") {
    await storage.updateSkill(approval.objectId, { codeExecutionApproved: true } as any);
  }

  // Fast path for a DAG approval-gate decision: resume the paused run right
  // away instead of waiting for either the in-process waitForApproval poll
  // (up to 10s) or the recovery scan's next tick (up to 60s). Finds the run
  // by pendingApprovalId rather than trusting any id threaded through the
  // request, since the client only ever sees the approval id, not the run's.
  if (approval.objectType === "pipeline_gate" && (status === "approved" || status === "rejected")) {
    resumeTeamRunWaitingOn(approval.id);
  }

  // Mirrors the pipeline_gate branch above -- a warrant/AAR-gated tool call
  // (server/tool-dispatcher.ts's dispatchToolCall, `gate_requires_approval`)
  // creates a `type: "tool-invocation"` approval and pauses the Workspace
  // run that made it (server/workspace-run.ts's Checkpoint/pendingToolIndex
  // mechanism -- already working correctly on its own). Nothing previously
  // told THIS route to resume that run once a human decides here; it only
  // ever updated the approval row, leaving the paused run stuck forever.
  // Finds the run by pendingApprovalId, same reasoning as the DAG branch:
  // the client only ever sees the approval id, not the paused run's id.
  // A no-op for any tool-invocation approval that isn't a paused Workspace
  // run (e.g. one from a DAG worker node) -- it simply won't match.
  if (approval.type === "tool-invocation" && (status === "approved" || status === "rejected")) {
    db.select().from(workspaceRuns)
      .where(and(eq(workspaceRuns.pendingApprovalId, approval.id), eq(workspaceRuns.status, "awaiting_approval")))
      .limit(1)
      .then(([match]) => {
        if (match) {
          resumeWorkspaceRun({
            runId: match.id,
            decision: status === "approved" ? "approve" : "deny",
            actorId: decidedBy,
            orgId: ctx.requestOrgId,
          }).catch(err => console.error(`[workspace-resume] fast-path resume of ${match.id} failed:`, err.message));
        }
      })
      .catch(() => {});
  }

  // A ui_baseline_diff approval (server/services/screenshot-baseline.ts,
  // created by tool-dispatcher.ts's captureFileBasedScreenshot when a new
  // screenshot differs from its stored baseline by more than the
  // threshold) means a human is deciding whether the new version IS the
  // correct one going forward. Approving it should actually promote that
  // capture to be the new baseline -- not just flip the approval's status
  // with no effect on future comparisons, which would make every
  // subsequent run flag the same "regression" forever.
  if (status === "approved" && approval.objectType === "ui_baseline_diff") {
    const evidence = (approval.evidenceJson || {}) as Record<string, any>;
    const { journeyName, stepName, newScreenshotFileId } = evidence;
    if (journeyName && stepName && newScreenshotFileId) {
      storage.getAgentGeneratedFile(newScreenshotFileId)
        .then(file => {
          if (file?.content) {
            return promoteToBaseline(journeyName, stepName, file.content as Buffer);
          }
        })
        .catch((err: any) => console.error(`[baseline-promote] failed for approval ${approval.id}:`, err.message));
    }
  }

  if (status === "approved" && approval.objectType === "patch" && approval.objectId) {
    const allPatches = await storage.getPatches();
    const patch = allPatches.find(p => p.id === approval.objectId);
    if (patch && (patch.status === "pending_approval" || patch.status === "proposed")) {
      await storage.updatePatch(patch.id, { status: "approved" });

      const rolloutPlan = patch.rolloutPlan as any;
      const strategy = rolloutPlan?.strategy || "canary";
      const startPercent = rolloutPlan?.startPercent || 10;
      const stepPercent = rolloutPlan?.stepPercent || 10;
      const maxErrorRate = rolloutPlan?.maxErrorRate || 5;
      const successThreshold = rolloutPlan?.successThreshold || 95;

      const deployment = await storage.createDeployment({
        agentId: patch.agentId,
        agentName: (await storage.getAgent(patch.agentId, ctx.requestOrgId))?.name || "agent",
        environment: "pilot",
        version: `patch-${patch.id.slice(0, 8)}`,
        status: "pending",
        rolloutStrategy: strategy,
        shadowEnabled: strategy === "shadow",
        patchId: patch.id,
        incidentId: patch.incidentId || undefined,
        canaryConfig: {
          startPercent,
          stepPercent,
          maxErrorRate,
          successThreshold,
        },
        rollbackConfig: {
          errorRateThreshold: maxErrorRate * 2,
          autoRollback: true,
        },
        autopromoteConfig: {
          enabled: true,
          stepPercent,
          rollbackOnFailure: true,
        },
      });

      if (patch.incidentId) {
        await storage.updateIncident(patch.incidentId, {
          deploymentId: deployment.id,
          status: "deploying",
        }, ctx.requestOrgId);
      }

      const depStrategy = deployment.rolloutStrategy || "canary";
      const depUpdate: Record<string, unknown> = {
        approvedBy: decidedBy || "Expert Validator",
      };

      if (depStrategy === "shadow") {
        depUpdate.shadowEnabled = true;
        depUpdate.status = "shadow";
      } else if (depStrategy === "canary") {
        depUpdate.canaryPercent = startPercent;
        depUpdate.status = "canary";
        depUpdate.deployedAt = new Date();
      } else {
        depUpdate.canaryPercent = 100;
        depUpdate.status = "active";
        depUpdate.deployedAt = new Date();
        depUpdate.completedAt = new Date();
      }

      if (constraintsJson) {
        try {
          const constraints = typeof constraintsJson === "string" ? JSON.parse(constraintsJson) : constraintsJson;
          if (constraints.maxCanaryPercent) {
            depUpdate.canaryPercent = Math.min(depUpdate.canaryPercent as number || 10, constraints.maxCanaryPercent);
          }
          if (constraints.shadowOnly) {
            depUpdate.shadowEnabled = true;
            depUpdate.status = "shadow";
            depUpdate.canaryPercent = 0;
          }
        } catch {}
      }

      await storage.updateDeployment(deployment.id, depUpdate, ctx.requestOrgId);

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "self_healing_service",
        action: "patch_deployment_created",
        objectType: "deployment",
        objectId: deployment.id,
        details: `Patch ${patch.title} approved → deployment created (${depUpdate.status}, canary: ${depUpdate.canaryPercent || 0}%)${patch.incidentId ? ` for incident ${patch.incidentId}` : ""}`,
      });
    }
  }

  if (status === "approved" && approval.objectType === "deployment" && approval.objectId) {
    const deployment = await storage.getDeployment(approval.objectId, ctx.requestOrgId);
    if (deployment && (deployment.status === "pending" || deployment.status === "awaiting_approval")) {
      const strategy = deployment.rolloutStrategy || "canary";
      const deployUpdate: Record<string, unknown> = {
        approvedBy: decidedBy || "Expert Validator",
      };

      if (strategy === "shadow" || deployment.shadowEnabled) {
        deployUpdate.shadowEnabled = true;
        deployUpdate.status = "shadow";
      } else if (strategy === "canary") {
        const startPercent = (deployment.canaryConfig as any)?.startPercent || 10;
        deployUpdate.canaryPercent = startPercent;
        deployUpdate.status = "canary";
        deployUpdate.deployedAt = new Date();
      } else {
        deployUpdate.canaryPercent = 100;
        deployUpdate.status = "active";
        deployUpdate.deployedAt = new Date();
        deployUpdate.completedAt = new Date();
      }

      if (constraintsJson) {
        try {
          const constraints = typeof constraintsJson === "string" ? JSON.parse(constraintsJson) : constraintsJson;
          if (constraints.maxCanaryPercent) {
            deployUpdate.canaryPercent = Math.min(deployUpdate.canaryPercent as number || 10, constraints.maxCanaryPercent);
          }
          if (constraints.shadowOnly) {
            deployUpdate.shadowEnabled = true;
            deployUpdate.status = "shadow";
            deployUpdate.canaryPercent = 0;
          }
        } catch {
        }
      }

      await storage.updateDeployment(deployment.id, deployUpdate, ctx.requestOrgId);

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "release_service",
        action: "deployment_activated",
        objectType: "deployment",
        objectId: deployment.id,
        details: `Deployment ${deployment.agentName || "agent"} activated after approval. Status: ${deployUpdate.status}, canary: ${deployUpdate.canaryPercent || 0}%, shadow: ${deployUpdate.shadowEnabled || false}`,
      });
    }
  }

  // initiate-retirement / complete-retirement (improvements.ts) create a
  // "retirement_review"/"handover_review" approval when requireApproval is
  // set, but only their *non*-approval branches actually change the
  // agent's status -- approving the request here previously did nothing,
  // so a retiring agent could sit in "Retiring" forever with no further
  // action to take (Complete Archival re-enters the same broken loop for
  // high-risk agents). Mirror what those endpoints' own non-approval
  // branches do.
  if (status === "approved" && approval.objectType === "agent" && approval.objectId) {
    if (approval.type === "retirement_review") {
      // Approving the retirement review IS the human decision to retire, so
      // it must finish the job -- move straight to "retired". Previously it
      // only advanced to the intermediate "retiring" state and waited on a
      // second handover_review the UI never surfaces, so the agent sat in
      // "Retiring" forever (test finding AG-004). A retired agent is skipped.
      const agent = await storage.getAgent(approval.objectId, ctx.requestOrgId);
      if (agent && agent.status !== "retired") {
        await storage.updateAgent(approval.objectId, { status: "retired" });
        await storage.createAuditEvent({
          organizationId: ctx.requestOrgId ?? undefined,
          actorType: "system",
          actorId: "system",
          action: "agent_retired",
          objectType: "agent",
          objectId: approval.objectId,
          details: JSON.stringify({ previousStatus: agent.status, retiredAt: new Date().toISOString(), approvedBy: decidedBy || "Expert Validator" }),
        });
      }
    } else if (approval.type === "handover_review") {
      const agent = await storage.getAgent(approval.objectId, ctx.requestOrgId);
      if (agent && agent.status !== "retired") {
        await storage.updateAgent(approval.objectId, { status: "retired" });
        await storage.createAuditEvent({
          organizationId: ctx.requestOrgId ?? undefined,
          actorType: "system",
          actorId: "system",
          action: "agent_retired",
          objectType: "agent",
          objectId: approval.objectId,
          details: JSON.stringify({ previousStatus: agent.status, archivedAt: new Date().toISOString(), approvedBy: decidedBy || "Expert Validator" }),
        });
      }
    }
  }

  return { outcomeStatus };
}

/**
 * Still waiting on a decision: pending, sent back for changes that the
 * reviewer then decides on, or expired -- a review window that closed without
 * anyone deciding is not a decision, and both approval pages still offer it.
 */
export const OPEN_APPROVAL_STATUSES = new Set(["pending", "changes_requested", "expired"]);

export interface DecideApprovalInput {
  orgId: string;
  role: RoleId;
  /** Signed-in user id, for the audit record. */
  userId: string | null;
  /** How the decider is shown on the approval. */
  decidedBy: string;
  approvalId: string;
  decision: ApprovalDecision;
  note?: string;
  /** Where the decision was made, recorded in the audit details. */
  via: string;
  /** On a rejection: open a follow-up task for the same object, so the work isn't just dropped. */
  followUp?: { description: string };
}

export async function decideApproval(input: DecideApprovalInput) {
  const approval = await storage.getApproval(input.approvalId, input.orgId);
  if (!approval) throw new ApprovalDecisionError("No approval with that id in this organization.", "not_found");
  if (!OPEN_APPROVAL_STATUSES.has(approval.status)) {
    throw new ApprovalDecisionError(`This approval was already ${approval.status}${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`, "not_pending");
  }
  const allowed = whoMayDecide(input.role, approval);
  if (!allowed.allowed) {
    throw new ApprovalDecisionError(`The ${input.role} role can't decide this approval (${allowed.reason}).`, "not_allowed");
  }

  // The same follow-up the Approvals page creates: a pending task on the same object, linked back.
  let followUpTaskId: string | null = null;
  if (input.decision === "rejected" && input.followUp?.description.trim()) {
    const followUp = await storage.createApproval({
      organizationId: approval.organizationId ?? input.orgId,
      type: "follow_up_task",
      objectType: approval.objectType,
      objectId: approval.objectId,
      objectName: `Follow-up: ${approval.objectName || approval.type}`,
      status: "pending",
      requestedBy: input.decidedBy,
      description: input.followUp.description.trim().slice(0, 2000),
      riskScore: approval.riskScore,
      agentId: approval.agentId,
      outcomeId: approval.outcomeId,
      environment: approval.environment,
      evidenceJson: { parentApprovalId: approval.id, reason: input.note ?? null },
    });
    followUpTaskId = followUp.id;
  }

  const updated = await storage.updateApproval(
    approval.id,
    { status: input.decision, decidedBy: input.decidedBy, decidedAt: new Date(), ...(followUpTaskId ? { followUpTaskId } : {}) },
    input.orgId,
  );

  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.userId ?? input.decidedBy,
    action: `approval_${input.decision}`,
    objectType: "approval",
    objectId: approval.id,
    details: `Approval "${approval.objectName || approval.type}" ${input.decision} by ${input.decidedBy} (via ${input.via})${input.note ? `: ${input.note}` : ""}${followUpTaskId ? `; follow-up task ${followUpTaskId} opened` : ""}`,
  });

  const { outcomeStatus } = await applyApprovalEffects(approval, input.decision, {
    orgId: input.orgId,
    requestOrgId: input.orgId,
    decidedBy: input.decidedBy,
  });

  return { approval: updated ?? { ...approval, status: input.decision }, outcomeStatus, followUpTaskId };
}
