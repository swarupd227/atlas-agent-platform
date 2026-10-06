/**
 * The scale of an eval pass rate, so a gate compares like with like.
 *
 * Every pass rate the platform stores is a fraction from 0 to 1 (eval_suites.pass_rate, and the run
 * rows the runners write). A promotion threshold is a percentage a person sets, 0 to 100, 80 by
 * default (agent runtimeConfig.promotionGateOverrides.minEvalPassRate, its input on the agent page).
 * The gates compared the two directly, so `0.9 < 80` was always true and no suite could ever meet
 * a threshold: every promotion needed a bypass. Compare in percent, through these.
 */

/**
 * A fraction as a percentage, rounded to two decimals. The rounding is not cosmetic: pass_rate is a
 * 4-byte float, so exactly 70% comes back as 0.69999999 and would fall short of a threshold of 70.
 */
export function percentOf(fraction: number | null | undefined): number {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return 0;
  return Math.round(fraction * 10000) / 100;
}

/** Whether a pass rate (a fraction) reaches a threshold set in percent. */
export function meetsThreshold(fraction: number | null | undefined, thresholdPercent: number): boolean {
  return percentOf(fraction) >= thresholdPercent;
}

/**
 * A run's pass rate as a fraction. Counts are unit-free and every runner fills them in, so they are
 * preferred; the stored rate is the fallback. (One runner, the skill-eval route in agents.ts, writes
 * its run's rate as a percentage, against the 0 to 1 contract, so the stored rate alone is not safe
 * to read as a fraction for every run.)
 */
export function runPassFraction(run: { passRate?: number | null; passedCases?: number | null; totalCases?: number | null }): number {
  const { passedCases, totalCases } = run;
  if (typeof passedCases === "number" && typeof totalCases === "number" && totalCases > 0) return passedCases / totalCases;
  return typeof run.passRate === "number" && Number.isFinite(run.passRate) ? run.passRate : 0;
}
