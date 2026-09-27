/**
 * Astra services for seeing what runs and stopping it.
 *
 * The acts themselves are server/automation-control.ts, which reuses the
 * engine's own cancel (it aborts a live executor and rejects the approval the
 * run was waiting on) and the same org-checked runtime stop the Deployments
 * page uses. Nothing here retires or rolls back a deployment: that is gated
 * separately, and the cards say so.
 */
import { cancelRunAs, cancellableRun, planStopAutomation, runningWork, stopAutomationAs, teamRunHistory } from "../automation-control";

async function runningWorkFor(orgId: string) {
  return runningWork(orgId);
}

async function teamRunHistoryFor(orgId: string, teamAgentId: string, limit?: number) {
  return teamRunHistory(orgId, teamAgentId, limit);
}

async function cancellableRunFor(orgId: string, dagRunId: string) {
  return cancellableRun(orgId, dagRunId);
}

async function cancelRunFor(orgId: string, dagRunId: string, reason: string, actorLabel: string) {
  return cancelRunAs(orgId, dagRunId, reason, actorLabel);
}

async function planStopAutomationFor(orgId: string, agentId: string) {
  return planStopAutomation(orgId, agentId);
}

async function stopAutomationFor(orgId: string, agentId: string, actorLabel: string) {
  return stopAutomationAs(orgId, agentId, { actorLabel });
}

export const automationControlServices = {
  runningWork: runningWorkFor,
  teamRunHistory: teamRunHistoryFor,
  cancellableRun: cancellableRunFor,
  cancelRunAs: cancelRunFor,
  planStopAutomation: planStopAutomationFor,
  stopAutomationAs: stopAutomationFor,
};
