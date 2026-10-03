/**
 * Which Eval Studio runs the platform may judge an agent by.
 *
 * A run that answered each golden several times is a consistency check. It
 * scores a golden as passed only if every answer passed, so its pass rate is
 * strict and runs lower than an ordinary run's; the worker deliberately gives
 * it no gate tag and never makes it a regression baseline. Anything that takes
 * "the agent's latest run", or averages pass rates across runs, and does not
 * set repeated runs aside reads that strict rate as an ordinary one: a
 * consistency check can block a production promotion, and a promotion can be
 * waved through on a pass rate alone, without the per-metric checks the gate
 * exists to apply. Everything that judges an agent by its runs goes through
 * gradedRuns. Pure.
 */

export interface RunForScope {
  status: string;
  /** Times each golden was answered. Absent or 1 is a run as it has always been. */
  repeats?: number | null;
}

/** An ordinary run, the only kind that is judged against a gate, a baseline or a threshold. */
export const isGradedRun = (r: { repeats?: number | null }): boolean => (r.repeats ?? 1) <= 1;

/** The runs an agent may be judged by: repeated runs set aside. Order is kept. */
export function gradedRuns<T extends { repeats?: number | null }>(runs: T[]): T[] {
  return runs.filter(isGradedRun);
}

export type ServerGateStatus = "pass" | "warn" | "fail" | "unknown";

type Timed = { completedAt?: Date | string | null; startedAt?: Date | string | null };
const when = (r: Timed) => new Date(r.completedAt ?? r.startedAt ?? 0).getTime();

export interface GateRun extends RunForScope, Timed {
  passRate: number | null;
  tags?: unknown;
}

/**
 * The gate's state for an agent, from its most recent completed ordinary run.
 * The worker records the verdict as a gate: tag on the run; a run with no tag
 * (it predates the gate) is judged from its pass rate alone through `evaluate`,
 * the worker's own rule. An agent with no ordinary completed run is "unknown",
 * as one with no runs at all is: a repeated run does not stand in for the gate.
 */
export function deriveServerGateStatus<R extends GateRun, G>(
  runs: R[],
  gate: G,
  evaluate: (passRate: number, gate: G) => "gate:pass" | "gate:warn" | "gate:fail",
): { status: ServerGateStatus; latestRun: R | null } {
  const latestRun = gradedRuns(runs)
    .filter((r) => r.status === "completed")
    .sort((a, b) => when(b) - when(a))[0] ?? null;
  if (!latestRun) return { status: "unknown", latestRun: null };

  const tags = Array.isArray(latestRun.tags) ? (latestRun.tags as string[]) : [];
  if (tags.includes("gate:pass")) return { status: "pass", latestRun };
  if (tags.includes("gate:warn")) return { status: "warn", latestRun };
  if (tags.includes("gate:fail")) return { status: "fail", latestRun };
  if (latestRun.passRate == null) return { status: "unknown", latestRun };

  const tag = evaluate(latestRun.passRate, gate);
  return { status: tag === "gate:pass" ? "pass" : tag === "gate:warn" ? "warn" : "fail", latestRun };
}
