/**
 * One set of words for what a run actually did, used by the Runs page and by
 * Cowork.
 *
 * The measurement behind it (2026-09-28, 85 runs on the live fleet): 536 of
 * 1,501 steps never ran, 61 of 85 runs skipped at least one step, and only 14
 * completed cleanly. The worst ran 4 of 27 steps — and was recorded, like most
 * of them, as `completed_with_skips`, a word that reads as success.
 *
 * So a status is never shown alone here. It is always "completed — 4 of 22 steps
 * ran", because the second half is the part that changes what a reader does. The
 * same rule as the connector health work: state what happened, name what
 * produced it, and never let one word carry two meanings.
 */

export type RunStatus =
  | "completed"
  | "completed_with_skips"
  | "failed"
  | "running"
  | "waiting_approval"
  | "cancelled"
  | string;

/**
 * Why a step did not run. These are not interchangeable and each points at a
 * different fix, which is exactly why the engine stopped using one sentence for
 * all of them (see skipReason in server/dag-execution-engine.ts).
 */
export type SkipCause =
  /** The step feeding it never ran, so its own condition was never evaluated. */
  | "predecessor_skipped"
  /** Its condition ran and was false: the data really did route elsewhere. */
  | "condition_false"
  /** Its condition read a field no upstream step produced. */
  | "missing_field"
  /** The edge carries no condition at all. */
  | "no_condition"
  /** Recorded before the causes were distinguished, or not recognisable. */
  | "unknown";

export const SKIP_CAUSES: SkipCause[] = ["predecessor_skipped", "condition_false", "missing_field", "no_condition", "unknown"];

/** What the cause means, in the reader's terms. */
export function skipCauseLabel(cause: SkipCause): string {
  switch (cause) {
    case "predecessor_skipped": return "The step before it never ran";
    case "condition_false": return "Its condition was false";
    case "missing_field": return "Its condition read a field nothing produced";
    case "no_condition": return "Its edge carries no condition";
    case "unknown": return "Cause not recorded";
  }
}

/** What to do about it — different for each, which is the point of separating them. */
export function skipCauseAdvice(cause: SkipCause): string {
  switch (cause) {
    case "predecessor_skipped": return "Look further upstream: the branch that stopped is above this step, not at it.";
    case "condition_false": return "Working as drawn. The data routed elsewhere; nothing to fix unless the route is wrong.";
    case "missing_field": return "A real defect: the condition names a field the producing step never emits, so that path can never be taken.";
    case "no_condition": return "Nobody wrote a condition on this edge. It will never be satisfied.";
    case "unknown": return "This run predates the platform recording why a step was skipped. A new run will say.";
  }
}

/** Causes worth a person's attention, as opposed to a branch working as drawn. */
export function isProblemCause(cause: SkipCause): boolean {
  return cause === "missing_field" || cause === "no_condition";
}

/**
 * Map a recorded skip message to a cause.
 *
 * Only a fallback: the cause is better computed from the run's own graph (were
 * this step's sources skipped too?), which works for runs recorded before the
 * engine distinguished them. See causeOfSkip in server/run-actions.ts.
 */
export function causeFromMessage(message: string | null | undefined): SkipCause {
  const m = String(message ?? "");
  if (!m) return "unknown";
  if (/^The steps? before it did not run/i.test(m)) return "predecessor_skipped";
  if (/^No condition to evaluate/i.test(m)) return "no_condition";
  if (/no upstream step output the routing field/i.test(m)) return "missing_field";
  if (/^No incoming edge condition was satisfied/i.test(m)) return "condition_false";
  return "unknown";
}

/**
 * The headline. Never the status on its own.
 *
 * `completed_with_skips` is the specific word this exists to defuse: it is how a
 * run that executed 4 of its 22 steps describes itself.
 */
export function runHeadline(status: RunStatus, ran: number, total: number): string {
  const of = total > 0 ? `${ran} of ${total} ${total === 1 ? "step" : "steps"} ran` : "no steps recorded";
  switch (status) {
    case "completed": return ran === total && total > 0 ? `Completed — every step ran` : `Completed — ${of}`;
    case "completed_with_skips": return `Completed — ${of}`;
    case "failed": return `Failed — ${of}`;
    case "running": return `Running — ${of} so far`;
    case "waiting_approval": return `Waiting for an approval — ${of} so far`;
    case "cancelled": return `Cancelled — ${of}`;
    default: return `${status} — ${of}`;
  }
}

/** Semantic role for a run, so no outcome falls through to a neutral colour. */
export function runTone(status: RunStatus, ran: number, total: number): "good" | "warn" | "bad" {
  if (status === "failed") return "bad";
  if (status === "running" || status === "waiting_approval") return "warn";
  if (total > 0 && ran < total) return "warn";
  return "good";
}

/** How long a run has been going, or took. */
export function durationWords(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** A run still going long after it should have finished. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;

export function isStuck(status: RunStatus, startedAt: string | null, heartbeatAt: string | null, now = Date.now()): boolean {
  if (status !== "running") return false;
  const last = heartbeatAt ?? startedAt;
  if (!last) return false;
  const t = new Date(last).getTime();
  return Number.isFinite(t) && now - t >= STUCK_AFTER_MS;
}

/**
 * What a run cost, against what it did — the two belong in one sentence. $0.55
 * for four of twenty-two steps is a different fact from $0.55 for a finished
 * piece of work.
 */
export function effortWords(costUsd: number | null, ran: number, total: number): string {
  const cost = costUsd != null && costUsd > 0 ? `$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}` : "no recorded cost";
  if (total === 0) return cost;
  return ran === total ? `${cost} for all ${total} steps` : `${cost} for ${ran} of ${total} steps`;
}
