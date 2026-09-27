/**
 * Seeing what is running, stopping an automation, and cancelling a run.
 *
 * The third gap an outside-in look found, and the one with the sharpest edge:
 * nothing in the conversation could answer "what's running right now?", and
 * nothing could stop anything. For someone operating a live automation
 * mid-renewal that is the missing seatbelt.
 *
 * Three different acts, kept apart because they do different things and the
 * difference is what a person needs to know:
 *
 * - CANCEL a run: the run in flight stops, its live execution is aborted and an
 *   approval it was waiting on is rejected. Reuses the engine's own
 *   cancelTeamAgentDagRun, which already audits and aborts.
 * - STOP an automation: its deployments' runtimes stop, so it no longer fires on
 *   a schedule or a trigger, and scheduled runs are cancelled. It does NOT
 *   cancel a run already in flight, and it does NOT prevent a person starting
 *   one by hand -- there is no status the run paths check. Anything that shows
 *   this has to say so, or "stopped" means something it doesn't.
 * - Neither of them retires or rolls back a deployment. That is a separate,
 *   gated act (deployment-actions.ts).
 */
import { storage } from "./storage";
import { cancelTeamAgentDagRun } from "./dag-execution-engine";
import { isRuntimeActive, stopAgentRuntime } from "./agent-runtime";
import { listWorkspaceRuns } from "./workspace-run";

export class AutomationControlError extends Error {}

/** A dag run has no `request` column: the engine puts it in initialState. */
const requestOf = (run: any): string | null => {
  const state = (run.initialState ?? run.currentState) as Record<string, any> | null;
  const request = state?.request;
  return typeof request === "string" ? request : null;
};
/** startedAt is set when a run actually begins; createdAt is when it was queued. */
const startedAt = (run: any): string | null => {
  const at = run.startedAt ?? run.createdAt;
  return at ? new Date(at).toISOString() : null;
};

const RUNNING_DAG = new Set(["running", "waiting_approval"]);
const RUNNING_WORKSPACE = new Set(["running", "awaiting_approval"]);
const FINISHED_DEPLOYMENT = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);

export interface RunningWork {
  teamRuns: Array<{
    id: string;
    team: string | null;
    teamAgentId: string | null;
    status: string;
    waitingOnApprovalId: string | null;
    startedAt: string | null;
    request: string | null;
  }>;
  agentRuns: Array<{ id: string; agent: string | null; agentId: string | null; status: string; startedAt: string | null; request: string | null }>;
}

/** Everything in flight in this organization: team runs and single-agent runs. */
export async function runningWork(orgId: string | undefined): Promise<RunningWork> {
  const [dagRuns, wsRuns] = await Promise.all([
    storage.listDagExecutionRunsByOrg(orgId, 100).catch(() => []),
    listWorkspaceRuns(orgId, undefined, 100).catch(() => []),
  ]);

  const inFlight = (dagRuns as any[]).filter((r) => RUNNING_DAG.has(String(r.status)));
  const inFlightAgentRuns = (wsRuns as any[]).filter((r) => RUNNING_WORKSPACE.has(String(r.status)));

  // Names are resolved only for what is actually in flight: a person asking
  // "what's running" wants six rows, not four hundred agent lookups.
  const names = new Map<string, string>();
  for (const id of [...inFlight.map((r) => r.teamAgentId), ...inFlightAgentRuns.map((r) => r.agentId)]) {
    if (!id || names.has(id)) continue;
    const agent = await storage.getAgent(id, orgId).catch(() => undefined);
    if (agent) names.set(id, agent.name);
  }

  return {
    teamRuns: inFlight.map((r) => ({
      id: r.id,
      team: r.teamAgentId ? names.get(r.teamAgentId) ?? null : null,
      teamAgentId: r.teamAgentId ?? null,
      status: String(r.status),
      waitingOnApprovalId: r.pendingApprovalId ?? null,
      startedAt: startedAt(r),
      request: requestOf(r),
    })),
    agentRuns: inFlightAgentRuns.map((r) => ({
      id: r.id,
      agent: r.agentId ? names.get(r.agentId) ?? null : null,
      agentId: r.agentId ?? null,
      status: String(r.status),
      // Already an ISO string on the workspace run view.
      startedAt: r.createdAt ?? null,
      request: typeof r.requestText === "string" ? r.requestText : null,
    })),
  };
}

export interface TeamRunRow {
  id: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  minutes: number | null;
  request: string | null;
  waitingOnApprovalId: string | null;
  error: string | null;
  steps: { done: number; total: number } | null;
}

/**
 * A team's recent runs, newest first: what it was asked, how it ended, how long
 * it took. This is the run HISTORY, which nothing in the conversation could reach
 * -- list_runs answers "what is running", and get_team_run needs an id a person
 * does not have. It cannot be searched by a business fact (a policy number lives
 * in a step's output, not in a run column), so the caller lists and recognises.
 */
export async function teamRunHistory(orgId: string | undefined, teamAgentId: string, limit = 20): Promise<TeamRunRow[]> {
  const team = await storage.getAgent(teamAgentId, orgId);
  if (!team) throw new AutomationControlError("No team with that id in this organization.");
  const runs = await storage.listDagExecutionRunsByTeamAgent(teamAgentId, Math.min(Math.max(limit, 1), 50)).catch(() => []);
  return (runs as any[]).map((r) => {
    const started = r.startedAt ?? r.createdAt ?? null;
    const finished = r.completedAt ?? null;
    return {
      id: r.id,
      status: String(r.status),
      startedAt: started ? new Date(started).toISOString() : null,
      finishedAt: finished ? new Date(finished).toISOString() : null,
      minutes: started ? Math.max(0, Math.round(((finished ? new Date(finished).getTime() : Date.now()) - new Date(started).getTime()) / 60000)) : null,
      request: requestOf(r),
      waitingOnApprovalId: r.pendingApprovalId ?? null,
      error: typeof r.error === "string" && r.error.trim() ? r.error : null,
      steps: typeof r.totalWaves === "number" && r.totalWaves > 0 ? { done: Number(r.currentWave ?? 0), total: Number(r.totalWaves) } : null,
    };
  });
}

/** One in-flight team run, only when its team belongs to the caller. */
export async function cancellableRun(orgId: string | undefined, dagRunId: string) {
  const run = await storage.getDagExecutionRun(dagRunId);
  const team = run?.teamAgentId ? await storage.getAgent(run.teamAgentId, orgId).catch(() => undefined) : undefined;
  if (!run || !team) throw new AutomationControlError("No run with that id in this organization.");
  return {
    run: {
      id: run.id,
      status: String(run.status),
      waitingOnApprovalId: (run as any).pendingApprovalId ?? null,
      startedAt: startedAt(run),
      request: requestOf(run),
    },
    team: { id: team.id, name: team.name },
    cancellable: RUNNING_DAG.has(String(run.status)),
  };
}

export async function cancelRunAs(orgId: string | undefined, dagRunId: string, reason: string, actorId: string) {
  const { run } = await cancellableRun(orgId, dagRunId);
  const outcome = await cancelTeamAgentDagRun(run.id, reason, actorId);
  if (!outcome.cancelled) {
    throw new AutomationControlError(`Only a running or waiting run can be cancelled; this one is ${outcome.status ?? "already finished"}.`);
  }
  return { cancelled: true as const, stoppedLiveExecution: outcome.stoppedLiveExecution, runId: run.id };
}

export interface StopPlan {
  agent: { id: string; name: string; agentType: string | null };
  /** Deployments whose runtime would be stopped, with whether a loop is actually live. */
  deployments: Array<{ id: string; environment: string; status: string; runtimeActive: boolean }>;
  /** Runs already in flight: stopping does not touch these. */
  inFlightRuns: Array<{ id: string; status: string }>;
}

export async function planStopAutomation(orgId: string | undefined, agentId: string): Promise<StopPlan> {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new AutomationControlError("No agent with that id in this organization.");
  const all = await storage.getDeployments(orgId).catch(() => []);
  const live = (all as any[]).filter((d) => d.agentId === agentId && !FINISHED_DEPLOYMENT.has(String(d.status)));
  const deployments = await Promise.all(
    live.map(async (d) => ({
      id: d.id,
      environment: String(d.environment),
      status: String(d.status),
      runtimeActive: await isRuntimeActive(d.id).catch(() => false),
    })),
  );
  const runs = await storage.listDagExecutionRunsByTeamAgent(agentId, 50).catch(() => []);
  return {
    agent: { id: agent.id, name: agent.name, agentType: agent.agentType ?? null },
    deployments,
    inFlightRuns: (runs as any[]).filter((r) => RUNNING_DAG.has(String(r.status))).map((r) => ({ id: r.id, status: String(r.status) })),
  };
}

/**
 * Stop the runtimes of this agent's live deployments. Each deployment is checked
 * against the organization BEFORE anything is stopped -- the runtime functions
 * themselves take a deployment id and check nothing.
 */
export async function stopAutomationAs(
  orgId: string | undefined,
  agentId: string,
  actor: { actorLabel: string; actorId?: string | null },
): Promise<{ agent: { id: string; name: string }; stopped: Array<{ id: string; environment: string; wasRunning: boolean }>; inFlightRuns: string[] }> {
  const plan = await planStopAutomation(orgId, agentId);
  const stopped: Array<{ id: string; environment: string; wasRunning: boolean }> = [];
  for (const dep of plan.deployments) {
    const owned = await storage.getDeployment(dep.id, orgId);
    if (!owned) continue;
    const result = await stopAgentRuntime(dep.id);
    if (result.stopped) await storage.updateDeployment(dep.id, { status: "inactive" } as any, orgId).catch(() => undefined);
    stopped.push({ id: dep.id, environment: dep.environment, wasRunning: result.stopped });
  }
  await storage.createAuditEvent({
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    action: "agent.runtime_stopped",
    objectType: "agent",
    objectId: plan.agent.id,
    organizationId: orgId,
    details: JSON.stringify({
      summary: `${actor.actorLabel} stopped "${plan.agent.name}": ${stopped.length} ${stopped.length === 1 ? "deployment" : "deployments"} no longer firing`,
      agentName: plan.agent.name,
      deployments: stopped,
      runsStillInFlight: plan.inFlightRuns.map((r) => r.id),
      via: "Astra Cowork",
    }),
  }).catch(() => {});
  return { agent: plan.agent, stopped, inFlightRuns: plan.inFlightRuns.map((r) => r.id) };
}
