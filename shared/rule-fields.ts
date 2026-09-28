/**
 * Whether a branch condition can ever be true.
 *
 * A deterministic edge rule routes on a field like `pre_bind_quality_check.passed`:
 * the part before the dot names the step whose output to read, the part after it
 * names a property inside that output. The blueprint validates neither against
 * anything — and measured on the live fleet 2026-09-28, four such conditions
 * tested a property that no run has ever produced. The branches behind them had
 * never once been taken, across 85 runs, and one of them guarded the step that
 * binds the policy.
 *
 * Why the existing `unreachable_rule_field` check misses them: it compares the
 * PREFIX with the team's state keys, and for nine of the thirteen dead edges the
 * prefix is a perfectly real step. What is missing is the property after the
 * dot, and there are only two honest ways to know it:
 *
 *   1. the producing step DECLARES an output schema -> decisive, before any run;
 *   2. it does not -> the run history is the only evidence, and it supports
 *      "never observed in N runs", which is a strong signal and not a proof.
 *
 * Both are offered here, and each finding says which one it rests on, because a
 * schema violation is a defect while an unobserved field is an observation.
 */

export interface RuleGroup {
  combinator?: string;
  conditions?: Array<RuleGroup | { field?: unknown; operator?: unknown; value?: unknown }>;
}

/** Every field a rule reads, including nested groups. */
export function ruleFields(rule: unknown, into: string[] = []): string[] {
  const group = rule as RuleGroup | null;
  if (!group || !Array.isArray(group.conditions)) return into;
  for (const c of group.conditions) {
    const leaf = c as { field?: unknown; conditions?: unknown[] };
    if (Array.isArray(leaf?.conditions)) ruleFields(leaf, into);
    else if (typeof leaf?.field === "string") into.push(leaf.field);
  }
  return into;
}

/** The property names a JSON Schema object declares at its top level. */
export function schemaProperties(schema: unknown): string[] | null {
  const s = schema as { type?: unknown; properties?: Record<string, unknown> } | null;
  if (!s || typeof s !== "object") return null;
  if (!s.properties || typeof s.properties !== "object") return null;
  return Object.keys(s.properties);
}

export type ConditionVerdict =
  /** The producing step's schema says this property does not exist. */
  | { basis: "schema"; satisfiable: false; declared: string[] }
  /** No schema, and the property has never appeared in the runs looked at. */
  | { basis: "observed"; satisfiable: false; runsObserved: number }
  /** Either the schema declares it, a run produced it, or there was nothing to judge against. */
  | { basis: "schema" | "observed" | "unknown"; satisfiable: true };

/**
 * Can `field` ever be true, given what its producing step declares or has
 * produced?
 *
 * Fails SAFE in both directions: with no schema and no runs it answers
 * "satisfiable", because absence of evidence is not evidence of a dead branch,
 * and a warning nobody can act on is worse than none.
 */
export function judgeConditionField(args: {
  field: string;
  /** State keys of every step in the team. */
  stateKeys: ReadonlySet<string>;
  /** Output schema of the step named by the field's prefix, when it declares one. */
  producerSchema?: unknown;
  /** Dotted paths seen in the final state of recent runs, e.g. "pre_bind_quality_check.passed". */
  observedPaths?: ReadonlySet<string>;
  /** How many runs those observations came from. Below the floor, observation says nothing. */
  runsObserved?: number;
  /** Runs needed before "never observed" is worth reporting. */
  minRuns?: number;
}): ConditionVerdict {
  const { field, stateKeys, producerSchema, observedPaths, runsObserved = 0, minRuns = 3 } = args;
  const dot = field.indexOf(".");
  // A bare field is read from the merged run state and cannot be traced to one
  // step from the blueprint alone; the prefix check owns the unknown-step case.
  if (dot <= 0) return { basis: "unknown", satisfiable: true };
  const prefix = field.slice(0, dot);
  const property = field.slice(dot + 1);
  if (!stateKeys.has(prefix)) return { basis: "unknown", satisfiable: true };

  const declared = schemaProperties(producerSchema);
  if (declared) {
    // Only a flat property can be judged against a top-level schema; a deeper
    // path (a.b.c) would need the nested schema, so leave it alone.
    if (property.includes(".")) return { basis: "schema", satisfiable: true };
    return declared.includes(property)
      ? { basis: "schema", satisfiable: true }
      : { basis: "schema", satisfiable: false, declared };
  }

  if (!observedPaths || runsObserved < minRuns) return { basis: "unknown", satisfiable: true };
  return observedPaths.has(field)
    ? { basis: "observed", satisfiable: true }
    : { basis: "observed", satisfiable: false, runsObserved };
}

/** Every dotted path in a run's final state, to two levels — which is what rules address. */
export function statePaths(state: unknown, maxDepth = 2): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (depth > maxDepth || value === null || typeof value !== "object" || Array.isArray(value)) return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      out.add(path);
      walk(v, path, depth + 1);
    }
  };
  walk(state, "", 1);
  return out;
}
