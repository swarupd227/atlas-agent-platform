/**
 * What a run actually did, as the service surface Astra's tools call.
 *
 * Thin by design: every one of these is the same function the /runs page's own
 * routes call, so the answer in a conversation and the answer on the page cannot
 * disagree about the same run. See server/run-actions.ts for what each measures.
 */
import { compareRuns, explainRun, runsNeedingAttention, runsOverview, stepsNeverRun } from "../run-actions";

async function explainRunFor(orgId: string, runId: string) {
  return explainRun(orgId, runId);
}

async function runsNeedingAttentionFor(orgId: string, limit?: number) {
  return runsNeedingAttention(orgId, limit);
}

async function runsOverviewFor(orgId: string, limit?: number) {
  return runsOverview(orgId, limit);
}

async function stepsNeverRunFor(orgId: string, teamAgentId: string, limit?: number) {
  return stepsNeverRun(orgId, teamAgentId, limit);
}

async function compareRunsFor(orgId: string, runId: string, againstRunId?: string) {
  return compareRuns(orgId, runId, againstRunId);
}

export const runServices = {
  explainRun: explainRunFor,
  runsNeedingAttention: runsNeedingAttentionFor,
  runsOverview: runsOverviewFor,
  stepsNeverRun: stepsNeverRunFor,
  compareRuns: compareRunsFor,
};
