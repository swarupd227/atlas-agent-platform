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

/**
 * Every `<old>.<property>` a condition or rule reads, rewritten to
 * `<new>.<property>`, when a step's result key moves.
 *
 * A key moves when the step is renamed (its key is its name) or when a row
 * that never held a key is given the step's own one. The conditions that named
 * the old key were written by the author against the flow; left alone they
 * would read nothing and the branch behind them would be dead, with nothing
 * saying so until a run skipped it. The prefix is matched whole -- `treaty`
 * does not touch `treaty_check.x` -- and only where a dot follows, so a bare
 * field of the same spelling is left alone.
 *
 * Returns which old keys were actually found, so the caller can say so.
 */
export function rewriteStateKeyReferences<R>(args: {
  condition?: string | null;
  rule?: R;
  renames: ReadonlyMap<string, string>;
}): { condition: string | null | undefined; rule: R | undefined; rewrote: string[] } {
  const { condition, rule, renames } = args;
  const rewrote = new Set<string>();
  if (renames.size === 0) return { condition, rule, rewrote: [] };

  const rewriteField = (field: string): string => {
    const dot = field.indexOf(".");
    if (dot <= 0) return field;
    const prefix = field.slice(0, dot);
    const to = renames.get(prefix);
    if (!to || to === prefix) return field;
    rewrote.add(prefix);
    return `${to}${field.slice(dot)}`;
  };

  let text = condition;
  if (typeof condition === "string" && condition) {
    text = condition;
    for (const [from, to] of Array.from(renames.entries())) {
      if (!from || from === to) continue;
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\.)`, "g");
      if (pattern.test(text)) {
        rewrote.add(from);
        text = text.replace(pattern, `$1${to}`);
      }
    }
  }

  const walk = (group: unknown): unknown => {
    const g = group as RuleGroup | null;
    if (!g || typeof g !== "object" || !Array.isArray(g.conditions)) return group;
    return {
      ...g,
      conditions: g.conditions.map((c) => {
        const leaf = c as { field?: unknown; conditions?: unknown[] };
        if (Array.isArray(leaf?.conditions)) return walk(leaf);
        if (typeof leaf?.field === "string") return { ...leaf, field: rewriteField(leaf.field) };
        return c;
      }),
    };
  };

  return { condition: text, rule: rule === undefined ? undefined : (walk(rule) as R), rewrote: Array.from(rewrote) };
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
  /**
   * The output schema of the step the EDGE comes from, for a bare field.
   *
   * A bare field names no step, so nothing in the blueprint says who produces
   * it — but the engine resolves one against the source step's own output
   * before falling back to merged state (withRoutedRecordValues in
   * dag-execution-engine.ts). So the source step is the producer, and when it
   * declares what it produces the answer is decisive. Measured 2026-09-30: 10
   * of 16 bare-field edges on the fleet come from an agent step, which is
   * where the missing contract actually bites.
   */
  sourceSchema?: unknown;
}): ConditionVerdict {
  const { field, stateKeys, producerSchema, observedPaths, runsObserved = 0, minRuns = 3, sourceSchema } = args;
  const dot = field.indexOf(".");
  if (dot <= 0) {
    // Decisive or silent, never evidential: a bare field can also be satisfied
    // from a record nested inside the source's output, which the run-state
    // paths do not index — so "not seen in recent runs" would be wrong here in
    // a way it is not for a dotted field.
    const declaredBySource = schemaProperties(sourceSchema);
    if (!declaredBySource) return { basis: "unknown", satisfiable: true };
    return declaredBySource.includes(field)
      ? { basis: "schema", satisfiable: true }
      : { basis: "schema", satisfiable: false, declared: declaredBySource };
  }
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
