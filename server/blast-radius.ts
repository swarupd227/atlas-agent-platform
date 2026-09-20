/**
 * What a deployment change would actually touch.
 *
 * The previous version invented most of it: "runs per day" was the count of
 * the last 30 (or 50) traces multiplied by 24/168, as if those traces had
 * spanned a week; "users affected" was that same count multiplied by 30; and
 * the rollback time fell back to "~15m" whenever no rollback window was
 * configured. None of those had any measurement behind them, and they were
 * shown on a promotion card as facts.
 *
 * Everything here is either counted from rows or reported as unknown.
 */

export interface TraceLike {
  startedAt?: Date | string | null;
  status?: string | null;
}

export interface RunsPerDay {
  /** Runs actually recorded in the last 24 hours. */
  value: number;
  /** Whether the trace history is long enough for that to mean anything. */
  basis: "last_24h" | "not_enough_history";
  /** How far back the traces we can see go, in hours. */
  historyHours: number | null;
}

const ms = (t: Date | string | null | undefined) => (t ? new Date(t).getTime() : NaN);

/** Runs in the last 24 hours, counted — never projected from a shorter window. */
export function runsPerDay(traces: TraceLike[], now: number = Date.now()): RunsPerDay {
  const times = traces.map((t) => ms(t.startedAt)).filter((n) => Number.isFinite(n));
  if (times.length === 0) return { value: 0, basis: "not_enough_history", historyHours: null };
  const oldest = Math.min(...times);
  const historyHours = Math.round(((now - oldest) / 3_600_000) * 10) / 10;
  const value = times.filter((t) => now - t <= 86_400_000).length;
  return { value, basis: historyHours >= 24 ? "last_24h" : "not_enough_history", historyHours };
}

export interface BlastRadiusInput {
  environment: string;
  traces: TraceLike[];
  boundOutcomes: Array<{ id: string; name: string; riskTier?: string | null }>;
  /** Invoiced amounts for those outcomes, summed by the caller. */
  revenueExposureUsd: number | null;
  downstreamAgents?: number | null;
  /** Minutes from the deployment's rollback config, when it has one. */
  rollbackCooldownMinutes?: number | null;
}

export interface BlastRadius {
  environment: string;
  runsLast24h: number;
  runsBasis: RunsPerDay["basis"];
  traceHistoryHours: number | null;
  revenueExposure: string | null;
  boundOutcomes: string[];
  affectedOutcomes: Array<{ name: string; riskTier: string }>;
  downstreamAgents: number | null;
  rollbackTimeEstimate: string | null;
  /** Named so nobody mistakes the absence of a figure for a zero. */
  notMeasured: string[];
  riskSummary: string;
}

export function buildBlastRadius(input: BlastRadiusInput): BlastRadius {
  const runs = runsPerDay(input.traces);
  const notMeasured: string[] = [];
  if (runs.basis === "not_enough_history") {
    notMeasured.push(runs.historyHours == null ? "runs per day (no runs recorded yet)" : `runs per day (only ${runs.historyHours}h of history)`);
  }
  // How many people a change reaches is not recorded anywhere, so it isn't reported.
  notMeasured.push("people affected (the platform does not record who a run serves)");
  if (input.revenueExposureUsd == null) notMeasured.push("revenue exposure (no invoices linked to these outcomes)");
  if (input.rollbackCooldownMinutes == null) notMeasured.push("rollback time (no rollback window configured)");

  const outcomes = input.boundOutcomes.slice(0, 5);
  return {
    environment: input.environment,
    runsLast24h: runs.value,
    runsBasis: runs.basis,
    traceHistoryHours: runs.historyHours,
    revenueExposure: input.revenueExposureUsd != null ? `$${input.revenueExposureUsd.toLocaleString()}` : null,
    boundOutcomes: outcomes.map((o) => o.name),
    affectedOutcomes: outcomes.slice(0, 3).map((o) => ({ name: o.name, riskTier: o.riskTier || "MEDIUM" })),
    downstreamAgents: input.downstreamAgents ?? null,
    rollbackTimeEstimate: input.rollbackCooldownMinutes != null ? `${input.rollbackCooldownMinutes}m` : null,
    notMeasured,
    riskSummary: [
      `${input.environment} deployment`,
      `${input.boundOutcomes.length} outcome${input.boundOutcomes.length === 1 ? "" : "s"} bound`,
      runs.basis === "last_24h" ? `${runs.value} run${runs.value === 1 ? "" : "s"} in the last 24 hours` : "not enough run history to state a daily rate",
      input.rollbackCooldownMinutes != null ? `rollback window ${input.rollbackCooldownMinutes}m` : "no rollback window configured",
    ].join(" · "),
  };
}
