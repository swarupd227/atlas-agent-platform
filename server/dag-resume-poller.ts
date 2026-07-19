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
import { resumeTeamAgentDagRun } from "./dag-execution-engine";

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
