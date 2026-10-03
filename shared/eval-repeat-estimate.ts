/**
 * What asking Eval Studio to answer each golden several times will take.
 *
 * Shown in the start-run card before anything is queued: how many answers the
 * run comes to, whether that passes the limit the server will enforce, and,
 * when an earlier run of the same agent on the same dataset says what an answer
 * cost, about what this run will cost. The figure is an estimate and says where
 * it came from; with no earlier run there is no figure rather than an invented
 * one. Shared by the screen and its tests so the screen cannot disagree with
 * the rule it is warning about.
 */
import { MAX_STUDIO_ATTEMPTS } from "./eval-stability";

export interface PriorRunForEstimate {
  id: string;
  status: string;
  agentId: string;
  datasetId: string;
  costUsd?: number | null;
  totalGoldens?: number | null;
  repeats?: number | null;
  completedAt?: string | Date | null;
  startedAt?: string | Date | null;
}

export interface RepeatEstimate {
  /** Answers the run comes to: goldens times repeats. */
  attempts: number;
  limit: number;
  /** Only a repeated run can pass the limit; one answer per golden never does. */
  overLimit: boolean;
  /** About what the run will cost, from an earlier run's cost per answer. null when there is nothing to base it on. */
  estimatedCostUsd: number | null;
  basedOnRunId: string | null;
}

const when = (r: PriorRunForEstimate) => new Date(r.completedAt ?? r.startedAt ?? 0).getTime();

export function estimateRepeatedRun(input: {
  goldenCount: number;
  repeats: number;
  agentId: string;
  datasetId: string;
  priorRuns: PriorRunForEstimate[];
}): RepeatEstimate {
  const goldens = Math.max(0, Math.floor(input.goldenCount) || 0);
  const repeats = Math.max(1, Math.floor(input.repeats) || 1);
  const attempts = goldens * repeats;
  const overLimit = repeats > 1 && attempts > MAX_STUDIO_ATTEMPTS;

  const basis = input.priorRuns
    .filter(r => r.status === "completed" && r.agentId === input.agentId && r.datasetId === input.datasetId
      && (r.costUsd ?? 0) > 0 && (r.totalGoldens ?? 0) > 0)
    .sort((a, b) => when(b) - when(a))[0];
  if (!basis) return { attempts, limit: MAX_STUDIO_ATTEMPTS, overLimit, estimatedCostUsd: null, basedOnRunId: null };

  const answersThen = (basis.totalGoldens as number) * Math.max(1, basis.repeats ?? 1);
  const perAnswer = (basis.costUsd as number) / answersThen;
  return {
    attempts,
    limit: MAX_STUDIO_ATTEMPTS,
    overLimit,
    estimatedCostUsd: Math.round(perAnswer * attempts * 10000) / 10000,
    basedOnRunId: basis.id,
  };
}
