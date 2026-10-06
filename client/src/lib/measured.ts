/**
 * Reading a measurement that may never have been taken.
 *
 * `agents.health_score` and `agents.success_rate` are nullable on purpose: null
 * means nobody has measured this agent. Readers then wrote `agent.successRate
 * || 0`, which turns that null into a measured zero — and a zero is scored, so
 * the row renders "0.0%" in red, indistinguishable from an agent that fails
 * every single run.
 *
 * Measured on Azure 2026-10-06: of 1,096 agents, **975 have null for both**.
 * healthScore has ZERO genuine zeroes and successRate has six. So the monitor
 * showed a fleet that looked catastrophically broken, 89% of it never measured,
 * and the six agents that really did score zero were invisible in the noise.
 *
 * Same defect as a `.default(0)` column, one layer up: the schema preserved the
 * distinction and the reader destroyed it. The platform's own convention is to
 * say so out loud — the Dashboard's health card reads "across 21 of 173 KPIs
 * measured" rather than hiding the gap — so this says "not measured", not "—".
 */

export type MeasuredTone = "ok" | "warn" | "bad" | "unmeasured";

export interface MeasuredValue {
  /** What to show. Never "0.0%" for an absent value. */
  text: string;
  tone: MeasuredTone;
  /** False when nothing has been recorded, so a caller can skip a bar or a sort. */
  measured: boolean;
}

export const NOT_MEASURED = "not measured";

/**
 * A rate held as 0..1 (success rate), shown as a percentage.
 * `thresholds` are in percent, matching how the page already reads.
 */
export function measuredRate(value: number | null | undefined, thresholds: { ok: number; warn: number }): MeasuredValue {
  if (value == null) return { text: NOT_MEASURED, tone: "unmeasured", measured: false };
  const pct = value * 100;
  return { text: `${pct.toFixed(1)}%`, tone: pct >= thresholds.ok ? "ok" : pct >= thresholds.warn ? "warn" : "bad", measured: true };
}

/** A score already held as 0..100 (health score). */
export function measuredScore(value: number | null | undefined, thresholds: { ok: number; warn: number }): MeasuredValue {
  if (value == null) return { text: NOT_MEASURED, tone: "unmeasured", measured: false };
  return { text: `${value}%`, tone: value >= thresholds.ok ? "ok" : value >= thresholds.warn ? "warn" : "bad", measured: true };
}

/**
 * Tone to class. "unmeasured" is deliberately muted and NOT red: red is a claim
 * about the agent, and we have nothing to claim.
 */
export const TONE_CLASS: Record<MeasuredTone, string> = {
  ok: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/20 text-red-700 dark:text-red-300",
  unmeasured: "bg-muted text-muted-foreground",
};
