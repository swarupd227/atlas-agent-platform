/**
 * Recovery scan for DAG runs stuck at "waiting_approval". This is the real
 * safety net behind the fast path in routes/governance.ts's approvals PATCH
 * handler -- that fast path only fires if the server that owns the run is
 * still the one handling the decision. If it restarted in between (the
 * scenario this whole mechanism exists for), nothing calls that fast path,
 * so this periodic scan is what actually notices the approval was decided
 * and calls resumeTeamAgentDagRun. Runs every minute, matching the
 * connector-poller/schedule-trigger-poller cadence.
 */
import { storage } from "./storage";
import { resumeTeamAgentDagRun, resumeInterruptedTeamAgentDagRun, DAG_RUN_STALE_AFTER_MS } from "./dag-execution-engine";
import { reconcileOrphanedTeamWorkspaceRuns } from "./workspace-run";

export async function pollWaitingApprovalDagRuns(): Promise<{ checked: number; resumed: number; errors: number }> {
  const runs = await storage.listDagExecutionRunsByStatus("waiting_approval");
  let checked = 0, resumed = 0, errors = 0;

  for (const run of runs) {
    if (!run.pendingApprovalId) continue;
    checked++;
    try {
      const approval = await storage.getApproval(run.pendingApprovalId);
      if (!approval || approval.status === "pending") continue; // still genuinely waiting -- nothing to do
      await resumeTeamAgentDagRun(run.id);
      resumed++;
    } catch (err: any) {
      errors++;
      console.error(`[dag-resume-poller] Unexpected error resuming run ${run.id}:`, err.message);
    }
  }

  return { checked, resumed, errors };
}

/**
 * Recovery scan for runs whose process died while they were "running" (a
 * deploy or restart): their heartbeat has gone stale. Each is resumed, or
 * failed with a reason when it is too old to resume -- see
 * resumeInterruptedTeamAgentDagRun. Runs without a heartbeat are never listed.
 */
export async function pollInterruptedDagRuns(now: Date = new Date()): Promise<{ checked: number; resumed: number; failed: number; errors: number }> {
  const staleBefore = new Date(now.getTime() - DAG_RUN_STALE_AFTER_MS);
  const runs = await storage.listStaleRunningDagExecutionRuns(staleBefore);
  let resumed = 0, failed = 0, errors = 0;

  for (const run of runs) {
    try {
      const outcome = await resumeInterruptedTeamAgentDagRun(run.id, now);
      if (outcome === "resumed") resumed++;
      else if (outcome === "failed_too_old") failed++;
    } catch (err: any) {
      errors++;
      console.error(`[dag-resume-poller] Unexpected error recovering interrupted run ${run.id}:`, err.message);
    }
  }

  // Workspace rows whose team run ended without them hearing (see
  // reconcileOrphanedTeamWorkspaceRuns). Same cadence, same safety-net role.
  try {
    const { finished } = await reconcileOrphanedTeamWorkspaceRuns();
    if (finished > 0) console.log(`[dag-resume-poller] finished ${finished} orphaned workspace run row(s)`);
  } catch (err: any) {
    console.error(`[dag-resume-poller] workspace reconciliation failed:`, err.message);
  }

  return { checked: runs.length, resumed, failed, errors };
}
