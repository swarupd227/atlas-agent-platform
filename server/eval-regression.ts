/**
 * The eval regression rule, shared by the eval worker's gate and the Astra
 * Workspace: a run's baseline is the agent's most recent other completed run
 * with a pass rate, in the same organization; a drop of more than the window
 * (in percentage points) is a regression. Pure.
 */

export interface RunForRegression {
  id: string;
  status: string;
  passRate: number | null;
  completedAt?: Date | string | null;
  startedAt?: Date | string | null;
}

export function pickRegressionBaseline<T extends RunForRegression>(runs: T[], runId: string): T | null {
  const time = (r: RunForRegression) => new Date(r.completedAt ?? r.startedAt ?? 0).getTime();
  return (
    runs
      .filter((r) => r.id !== runId && r.status === "completed" && r.passRate != null)
      .sort((a, b) => time(b) - time(a))[0] ?? null
  );
}

/** Drop in percentage points from the baseline (positive = worse), and whether it exceeds the window. */
export function regressionCheck(baselinePassRate: number | null | undefined, passRate: number | null | undefined, windowPct: number) {
  if (baselinePassRate == null || passRate == null) return { dropPct: null, regressed: false };
  const dropPct = (baselinePassRate - passRate) * 100;
  return { dropPct, regressed: windowPct > 0 && dropPct > windowPct };
}
