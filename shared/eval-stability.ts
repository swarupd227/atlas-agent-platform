/**
 * Whether an agent gives the same answer to the same input.
 *
 * An eval case run once says whether the agent got it right that time. Run the
 * same case several times and the question becomes whether it gets it right
 * every time, and whether a label it assigns (a severity, a tier, a decision)
 * stays put. These functions turn the attempts at one case into that answer,
 * and the cases of a run into the run's figures. They are pure: no model, no
 * storage, so the runners and the tests share one definition of "flaky".
 *
 * Scoring is strict on purpose. A case passes only if every attempt passed,
 * because the aim is consistency; a case that passes 3 times in 5 is reported
 * as inconsistent, not as a pass.
 */

export interface EvalAttempt {
  passed: boolean;
  score?: number;
  /** The agent's parsed JSON verdict, for cases that compare fields. null = nothing parseable. */
  verdict?: Record<string, unknown> | null;
}

export type CaseOutcome = "stable_pass" | "stable_fail" | "flaky" | "no_attempts";

export interface FieldDisagreement {
  key: string;
  /** Distinct values across the attempts, most common first. */
  values: Array<{ value: string; count: number }>;
  /** Share of attempts holding the most common value, 0..1. */
  agreement: number;
}

export interface CaseStability {
  attempts: number;
  passedAttempts: number;
  outcome: CaseOutcome;
  /** True only when every attempt passed. This is the case's pass/fail on the run. */
  passed: boolean;
  /** Share of attempts agreeing with the most common pass/fail outcome. null when nothing ran. */
  consistency: number | null;
  /** Checked keys whose value was not the same on every attempt. */
  unstableFields: FieldDisagreement[];
  /** Set only for a flaky case, so a reader sees "inconsistent", not "wrong". */
  failingReason: string | null;
}

export interface RunStability {
  /** Cases that had at least one attempt. */
  measuredCases: number;
  stablePass: number;
  stableFail: number;
  flakyCases: number;
  flakyCaseIds: string[];
  /** flakyCases / measuredCases. null when nothing was measured: "nothing ran" is not "nothing flipped". */
  flipRate: number | null;
  /** Mean of the cases' consistency. null when nothing was measured. */
  consistency: number | null;
}

export const MAX_REPEATS = 10;
export const MAX_ATTEMPTS = 100;

const MISSING = "(missing)";

/** Same slug the field comparison uses, so "High" and "high" are one label, not two. */
function normalizeLabel(value: unknown): string {
  if (value === undefined || value === null) return MISSING;
  if (typeof value === "string") {
    const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return slug || MISSING;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function fieldDisagreement(key: string, attempts: EvalAttempt[]): FieldDisagreement | null {
  const counts = new Map<string, number>();
  for (const a of attempts) {
    const label = normalizeLabel(a.verdict ? a.verdict[key] : undefined);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size <= 1) return null;
  const values = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((x, y) => y.count - x.count || x.value.localeCompare(y.value));
  return { key, values, agreement: values[0].count / attempts.length };
}

/**
 * The attempts at one case. `keys` names the verdict fields whose value must
 * agree across attempts; a field that is absent on some attempts counts as a
 * different value from one that is present.
 */
export function summarizeAttempts(attempts: EvalAttempt[], opts: { keys?: string[] } = {}): CaseStability {
  const n = attempts.length;
  if (n === 0) {
    return { attempts: 0, passedAttempts: 0, outcome: "no_attempts", passed: false, consistency: null, unstableFields: [], failingReason: null };
  }
  const passedAttempts = attempts.filter(a => a.passed).length;
  const outcome: CaseOutcome = passedAttempts === n ? "stable_pass" : passedAttempts === 0 ? "stable_fail" : "flaky";
  const unstableFields = (opts.keys ?? [])
    .map(k => fieldDisagreement(k, attempts))
    .filter((d): d is FieldDisagreement => d !== null);
  return {
    attempts: n,
    passedAttempts,
    outcome,
    passed: outcome === "stable_pass",
    consistency: Math.max(passedAttempts, n - passedAttempts) / n,
    unstableFields,
    failingReason: outcome === "flaky" ? `Inconsistent: passed ${passedAttempts} of ${n} attempts` : null,
  };
}

/** The cases of one run. */
export function summarizeRun(cases: Array<{ caseId: string; stability: CaseStability }>): RunStability {
  const measured = cases.filter(c => c.stability.outcome !== "no_attempts");
  const flaky = measured.filter(c => c.stability.outcome === "flaky");
  const consistencies = measured.map(c => c.stability.consistency ?? 0);
  return {
    measuredCases: measured.length,
    stablePass: measured.filter(c => c.stability.outcome === "stable_pass").length,
    stableFail: measured.filter(c => c.stability.outcome === "stable_fail").length,
    flakyCases: flaky.length,
    flakyCaseIds: flaky.map(c => c.caseId),
    flipRate: measured.length > 0 ? flaky.length / measured.length : null,
    consistency: measured.length > 0 ? consistencies.reduce((s, x) => s + x, 0) / measured.length : null,
  };
}

/** Checks a requested repeat count against the per-case and per-run limits. */
export function resolveRepeats(raw: unknown, caseCount: number): { ok: true; repeats: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, repeats: 1 };
  const repeats = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) {
    return { ok: false, error: `repeats must be a whole number from 1 to ${MAX_REPEATS}` };
  }
  if (caseCount * repeats > MAX_ATTEMPTS) {
    return { ok: false, error: `${caseCount} cases x ${repeats} repeats is ${caseCount * repeats} attempts; a run is limited to ${MAX_ATTEMPTS}` };
  }
  return { ok: true, repeats };
}
