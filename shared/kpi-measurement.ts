/**
 * What measures a KPI.
 *
 * Until now nothing did. `recomputeOutcomeKpis` matched a KPI's *name* against
 * keyword lists -- "rate", "time", "volume", "cost" -- and wrote whichever run
 * statistic the keyword implied. Live, that matched 121 of 164 KPIs, and it is
 * wrong for most of them: "Days from Work Order Close to Claim Submission"
 * contains "time", so it was filled with the agents' average run latency, and
 * "Effort Reduction" -- whose own note says "hours of manual staff time per
 * address change" -- is not something a run trace can see at all.
 *
 * So a KPI now says what measures it:
 *   - `manual`: a person records readings. Runs never overwrite it.
 *   - `agent_runs`: a NAMED statistic over the runs of the agents bound to the
 *     outcome, over a stated window. Still a proxy, and labelled as one, but a
 *     chosen proxy rather than a guessed one.
 *   - nothing declared: nothing measures it, and the page says so.
 *
 * The keyword rules survive as `suggestMeasurement`: a proposal shown to a
 * person, who accepts it or doesn't. They never write a value on their own.
 *
 * Everything here is pure -- no storage, no clock beyond what it is handed --
 * so the rules can be tested without a database.
 */

/** A run statistic a KPI can be measured by. */
export type RunStatistic = "success_rate" | "failure_rate" | "avg_latency" | "run_count" | "event_count" | "cost_usd";

export interface ManualSource {
  kind: "manual";
}

export interface AgentRunsSource {
  kind: "agent_runs";
  statistic: RunStatistic;
  /** Trailing window. A count over all time only ever grows against a fixed target. */
  windowDays: number;
}

export type MeasurementSource = ManualSource | AgentRunsSource;

export const RUN_STATISTICS: RunStatistic[] = ["success_rate", "failure_rate", "avg_latency", "run_count", "event_count", "cost_usd"];

export const DEFAULT_WINDOW_DAYS = 30;
const LONGEST_WINDOW_DAYS = 365;

/** What each statistic counts, in the words the confirm card and the panel use. */
export const STATISTIC_LABEL: Record<RunStatistic, string> = {
  success_rate: "Share of the outcome's agent runs that finished without failing",
  failure_rate: "Share of the outcome's agent runs that failed",
  avg_latency: "Average time an agent run took",
  run_count: "How many agent runs there were",
  event_count: "How many outcome events were recorded",
  cost_usd: "What the agent runs cost",
};

/** The unit a statistic produces, so a KPI measured in days isn't filled with a percentage. */
export const STATISTIC_UNIT: Record<RunStatistic, "percent" | "duration" | "count" | "currency"> = {
  success_rate: "percent",
  failure_rate: "percent",
  avg_latency: "duration",
  run_count: "count",
  event_count: "count",
  cost_usd: "currency",
};

/**
 * Read a stored declaration. Anything unrecognised reads as "nothing declared"
 * rather than throwing: a KPI with a damaged source is unmeasured, not broken.
 */
export function parseMeasurementSource(raw: unknown): MeasurementSource | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.kind === "manual") return { kind: "manual" };
  if (value.kind === "agent_runs") {
    const statistic = value.statistic as RunStatistic;
    if (!RUN_STATISTICS.includes(statistic)) return null;
    const days = Number(value.windowDays);
    const windowDays = Number.isFinite(days) && days > 0 ? Math.min(Math.round(days), LONGEST_WINDOW_DAYS) : DEFAULT_WINDOW_DAYS;
    return { kind: "agent_runs", statistic, windowDays };
  }
  return null;
}

/** Reject a declaration a caller sent, with a reason a person can act on. */
export function validateMeasurementSource(raw: unknown): { ok: true; source: MeasurementSource | null } | { ok: false; error: string } {
  // Null clears the declaration: the KPI goes back to nothing measuring it.
  if (raw === null) return { ok: true, source: null };
  if (!raw || typeof raw !== "object") return { ok: false, error: "A measurement source is an object with a kind of \"manual\" or \"agent_runs\"." };
  const value = raw as Record<string, unknown>;
  if (value.kind === "manual") return { ok: true, source: { kind: "manual" } };
  if (value.kind !== "agent_runs") return { ok: false, error: `"${String(value.kind)}" isn't a kind of measurement. Use "manual" or "agent_runs".` };
  if (!RUN_STATISTICS.includes(value.statistic as RunStatistic)) {
    return { ok: false, error: `"${String(value.statistic)}" isn't a run statistic. Use one of: ${RUN_STATISTICS.join(", ")}.` };
  }
  const parsed = parseMeasurementSource(value);
  return parsed ? { ok: true, source: parsed } : { ok: false, error: "That measurement source could not be read." };
}

/** How the source reads on a page: short, and honest about the proxy. */
export function describeSource(source: MeasurementSource | null): string {
  if (!source) return "Nothing measures this yet";
  if (source.kind === "manual") return "Recorded by a person";
  return `${STATISTIC_LABEL[source.statistic]}, over the last ${source.windowDays} days (a proxy)`;
}

/** The run figures a statistic is computed from. Counted by the caller, passed in here. */
export interface RunWindow {
  runs: number;
  failed: number;
  totalLatencyMs: number;
  totalCostUsd: number;
  events: number;
}

/**
 * The value a declared run statistic has over this window, or null when there
 * is nothing to compute it from. Null means "no runs yet", which stays "not
 * measured" -- it never becomes a zero.
 */
export function statisticValue(source: AgentRunsSource, window: RunWindow, unit: string | null | undefined): number | null {
  const { runs, failed, totalLatencyMs, totalCostUsd, events } = window;
  switch (source.statistic) {
    case "success_rate":
      return runs > 0 ? round(((runs - failed) / runs) * 100, 2) : null;
    case "failure_rate":
      return runs > 0 ? round((failed / runs) * 100, 2) : null;
    case "avg_latency": {
      if (runs === 0) return null;
      const ms = totalLatencyMs / runs;
      const u = (unit || "").toLowerCase();
      if (u === "minutes" || u === "min" || u === "mins") return round(ms / 60_000, 2);
      if (u === "seconds" || u === "sec" || u === "secs" || u === "s") return round(ms / 1000, 1);
      if (u === "hours" || u === "hrs" || u === "hr") return round(ms / 3_600_000, 2);
      if (u === "days") return round(ms / 86_400_000, 3);
      return Math.round(ms);
    }
    case "run_count":
      return runs;
    case "event_count":
      return events;
    case "cost_usd":
      return runs > 0 ? round(totalCostUsd, 4) : null;
  }
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Whether a new reading is above or below the one before it. */
export function trendBetween(previous: number | null | undefined, next: number): "up" | "down" | "stable" {
  if (previous === null || previous === undefined) return "stable";
  if (next > previous) return "up";
  if (next < previous) return "down";
  return "stable";
}

/**
 * Whether a value breaches the KPI's SLA threshold. Which side is bad depends
 * on the target operator the KPI already carries: "<=" means lower is better.
 */
export function breachesThreshold(value: number, slaThreshold: number | null | undefined, targetOperator: string | null | undefined): boolean {
  if (slaThreshold === null || slaThreshold === undefined) return false;
  const lowerIsBetter = (targetOperator || ">=").startsWith("<");
  return lowerIsBetter ? value > slaThreshold : value < slaThreshold;
}

export interface Suggestion {
  source: AgentRunsSource;
  /** Why this was suggested, said plainly, including that it is a guess from the name. */
  because: string;
}

const INVERSE_WORDS = ["exception", "error", "failure", "defect", "escalation", "churn", "dispute", "breach", "violation", "complaint"];
const RATE_WORDS = ["success", "accuracy", "rate"];
const DURATION_WORDS = ["latency", "response time", "turnaround", "cycle time"];
const COUNT_WORDS = ["volume", "count", "throughput", "processed", "moderated", "qualified", "invoices", "resolution"];

/**
 * A proposal, from the KPI's name, for what might measure it. This is the old
 * keyword matcher, kept only to suggest: a person accepts it or doesn't, and
 * nothing is written until they do.
 *
 * It deliberately declines more than the old rules did. The old list treated
 * any name containing "time" as latency, which swallowed "Days from Work Order
 * Close to Claim Submission" -- a business duration no run trace measures.
 */
export function suggestMeasurement(kpi: { name?: string | null; unit?: string | null }): Suggestion | null {
  const name = (kpi.name || "").toLowerCase();
  if (!name) return null;
  const suggest = (statistic: RunStatistic, because: string): Suggestion => ({
    source: { kind: "agent_runs", statistic, windowDays: DEFAULT_WINDOW_DAYS },
    because: `${because} This is a guess from the KPI's name; check it before accepting.`,
  });

  if (INVERSE_WORDS.some((w) => name.includes(w)) && name.includes("rate")) {
    return suggest("failure_rate", "The name reads as a rate of things going wrong, which agent runs can count as failures.");
  }
  if (RATE_WORDS.some((w) => name.includes(w)) && !INVERSE_WORDS.some((w) => name.includes(w))) {
    return suggest("success_rate", "The name reads as a success or accuracy rate, which agent runs can count.");
  }
  if (DURATION_WORDS.some((w) => name.includes(w))) {
    return suggest("avg_latency", "The name reads as how long something takes, which is close to how long an agent run takes.");
  }
  if (COUNT_WORDS.some((w) => name.includes(w))) {
    return suggest("run_count", "The name reads as a quantity of work, which agent runs can count.");
  }
  if (name.includes("cost") || name.includes("spend")) {
    return suggest("cost_usd", "The name reads as money spent, and agent runs carry a cost.");
  }
  return null;
}
