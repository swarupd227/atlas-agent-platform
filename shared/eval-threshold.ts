/**
 * What "measured" means for an eval suite, in one place, because the platform
 * had it in fourteen and most of them were wrong.
 *
 * Lives in shared/ rather than server/ deliberately: the readers that got this
 * wrong were split between the two, and each one invented its own guard. A
 * single definition is the fix; `passRate || 0` at a dozen call sites is the
 * defect.
 */

/**
 * A suite's pass rate, or null when nobody has measured it.
 *
 * eval_suites.pass_rate used to carry `.default(0)`, so a suite nobody had run
 * was stored as 0% rather than as absent. Measured against the live database on
 * 2026-10-06: 630 of 690 suites sat at exactly 0 having never run, and NOT ONE
 * suite had ever recorded a real measured zero. So every reader doing
 * `passRate || 0` was reporting "this agent failed every case" about a suite
 * nobody had ever executed -- a different problem with a different fix. One
 * needs the agent improved; the other needs the suite run.
 *
 * It takes both fields because the two disagree in BOTH directions, which the
 * column default alone does not explain:
 *  - rate 0, no run  -> the default. 630 rows.
 *  - a rate, no run  -> four demo live-run scripts wrote a hardcoded 0.92-0.95
 *                       onto a suite that was never executed. Those scripts no
 *                       longer do, but the rows they wrote remain, and they
 *                       would otherwise read as 95% while the deploy gate
 *                       correctly skips them as unevaluated.
 *
 * So a rate counts as measured only when a run actually produced it. Anything
 * else is null, and a null must RENDER as "not run" -- never as 0%, and never
 * averaged in as a zero.
 */
export function suitePassFraction(suite: { passRate?: number | null; lastRunAt?: Date | string | null }): number | null {
  if (!suite.lastRunAt) return null;
  return typeof suite.passRate === "number" && Number.isFinite(suite.passRate) ? suite.passRate : null;
}

/** Whether anyone has actually measured this suite. */
export function isSuiteMeasured(suite: { passRate?: number | null; lastRunAt?: Date | string | null }): boolean {
  return suitePassFraction(suite) !== null;
}

/**
 * A suite's pass rate as a percentage for display, or null when unmeasured.
 * Rounded like percentOf: pass_rate is a 4-byte float, so exactly 70% comes
 * back as 0.69999999.
 */
export function suitePassPercent(suite: { passRate?: number | null; lastRunAt?: Date | string | null }): number | null {
  const f = suitePassFraction(suite);
  return f === null ? null : Math.round(f * 10000) / 100;
}

/**
 * The aggregate over a set of suites, counting only the measured ones and
 * saying how many it skipped.
 *
 * Every aggregate reader on this platform did `reduce((s, e) => s + (e.passRate
 * || 0)) / length`, which divides a sum of measured rates by a count that
 * includes unmeasured suites -- so one real suite at 95% among nine unrun ones
 * reported 9.5% "fleet health". Returning the skipped count means a caller can
 * say "95% across 1 of 10 suites" instead of inventing a number.
 */
export function aggregateSuitePassPercent(
  suites: Array<{ passRate?: number | null; lastRunAt?: Date | string | null }>,
): { percent: number | null; measured: number; unmeasured: number } {
  const rates = suites.map(suitePassFraction).filter((r): r is number => r !== null);
  const unmeasured = suites.length - rates.length;
  if (rates.length === 0) return { percent: null, measured: 0, unmeasured };
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return { percent: Math.round(mean * 10000) / 100, measured: rates.length, unmeasured };
}
