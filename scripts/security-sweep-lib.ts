/**
 * The parts of the authorization sweep (scripts/security-sweep.ts) that need no server or database, so they can be tested:
 * reading the route inventory out of the source, naming the path parameters, guessing which table a parameter's id comes
 * from, building a row for a table, and comparing what the sweep found with the findings already accepted.
 */

// ── route inventory ──────────────────────────────────────────────────────────────────────────────────────────────

export type Verb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface RouteEntry { verb: Verb; route: string; file: string; line: number }

const REGISTRATION = /\b(router|app|[A-Za-z]+Router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]+)\3/g;

/** Every `router.get("/api/...")`-style registration in the given sources, once per verb and path. */
export function scanRoutes(files: Array<{ path: string; source: string }>): RouteEntry[] {
  const seen = new Set<string>();
  const out: RouteEntry[] = [];
  for (const f of files) {
    const src = f.source.replace(/\r\n/g, "\n");
    for (const m of src.matchAll(REGISTRATION)) {
      const route = m[4];
      if (!route.startsWith("/api/")) continue;
      const verb = m[2].toUpperCase() as Verb;
      const key = `${verb} ${route}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ verb, route, file: f.path, line: src.slice(0, m.index).split("\n").length });
    }
  }
  return out.sort((a, b) => (a.route === b.route ? a.verb.localeCompare(b.verb) : a.route.localeCompare(b.route)));
}

/** Routes the sweep leaves alone: signing in and out, and streams that never end. */
export const NOT_SWEPT = /^\/api\/auth\/(login|logout|register)|\/stream$|\/events$|\/sse|\/subscribe/;

// ── path parameters ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ParamSlot { name: string; /** the static path segment just before it, e.g. "dag-runs" in /api/dag-runs/:id */ before: string }

export function paramSlots(route: string): ParamSlot[] {
  const slots: ParamSlot[] = [];
  let before = "";
  for (const seg of route.split("/")) {
    if (!seg) continue;
    if (seg.startsWith(":")) slots.push({ name: seg.slice(1).replace(/\?$/, ""), before });
    else before = seg;
  }
  return slots;
}

export const hasParams = (route: string) => /:[A-Za-z_]/.test(route);

/** The route with each parameter replaced, in order, by the given values (the last value repeats if there are fewer). */
export function fillRoute(route: string, values: string[]): string {
  let i = 0;
  return route.replace(/:[A-Za-z_]+\??/g, () => values[Math.min(i++, values.length - 1)] ?? "x");
}

/** The part of the route up to and including its first parameter: the object the rest of the path hangs off. */
export function baseRoute(route: string): string {
  const cut = route.search(/\/:[A-Za-z_]/);
  if (cut < 0) return route;
  const rest = route.slice(cut + 1);
  const end = rest.indexOf("/");
  return end < 0 ? route : route.slice(0, cut + 1 + end);
}

// ── which table does this id come from ──────────────────────────────────────────────────────────────────────────

const GENERIC = new Set(["id", "ids", "by", "the"]);

export function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/** "dag-runs", "dag_runs" and "dagRuns" all become ["dag", "run"]. */
export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !GENERIC.has(t))
    .map(singular);
}

const overlap = (a: string[], b: string[]) => a.filter((t) => b.includes(t)).length;

/** How likely it is that an id in this path position belongs to this table (0 = no reason to think so). */
export function tableAffinity(table: string, slot: ParamSlot): number {
  const t = nameTokens(table);
  if (!t.length) return 0;
  const named = nameTokens(slot.name);
  const before = nameTokens(slot.before);
  let score = 3 * overlap(t, named) + 2 * overlap(t, before);
  if (before.length && before.length === t.length && overlap(t, before) === t.length) score += 6;
  if (named.length && named.length === t.length && overlap(t, named) === t.length) score += 6;
  return score;
}

/** Table names, best first, for this parameter: only those with some reason to match, then by shorter name. */
export function rankTables(tables: string[], slot: ParamSlot): string[] {
  return tables
    .map((t) => ({ t, s: tableAffinity(t, slot) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.length - b.t.length || a.t.localeCompare(b.t))
    .map((x) => x.t);
}

/** A parameter that is a name, not an id (`/integrations/:integrationId/status` takes "salesforce"). */
export const isIdLike = (slot: ParamSlot) => /(^|[a-z])Id$|^id$|_id$|^ids?$/.test(slot.name);

// ── building a row for a table ──────────────────────────────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string;
  columnType: string;
  notNull: boolean;
  hasDefault: boolean;
  primary: boolean;
  enumValues?: string[];
}

export interface RowContext {
  organizationId: string;
  /** The id of the row to use for a column named `<thing>_id`, or undefined when no table matches. */
  idFor(column: string): string | undefined;
}

/** A value for a column the sweep must fill: undefined means leave it to the database default (or null). */
export function valueForColumn(col: ColumnInfo, ctx: RowContext): unknown {
  if (col.name === "organization_id") return ctx.organizationId;
  const linked = ctx.idFor(col.name);
  if (linked !== undefined) return linked;
  if (col.primary || (col.hasDefault && !col.notNull)) return undefined;
  if (!col.notNull) return undefined;
  if (col.hasDefault) return undefined;
  if (col.enumValues?.length) return col.enumValues[0];
  switch (col.columnType) {
    case "PgVarchar":
    case "PgText": {
      if (/url|endpoint|webhook|host|uri/i.test(col.name)) return "http://127.0.0.1:9/sweep";
      return `sweep-${col.name}`;
    }
    case "PgInteger": case "PgSerial": case "PgBigInt53": case "PgSmallInt": return 1;
    case "PgReal": case "PgDoublePrecision": case "PgNumeric": return 0.5;
    case "PgBoolean": return false;
    case "PgTimestamp": case "PgDate": return new Date();
    case "PgJsonb": case "PgJson": return {};
    case "PgArray": return [];
    default: return undefined;
  }
}

// ── comparing findings with the accepted ones ───────────────────────────────────────────────────────────────────

/** One finding is a verb and a route pattern, never an id, so it reads the same on every run. */
export const findingKey = (verb: string, route: string) => `${verb} ${route}`;

export type FindingKind = "unauthenticated" | "listLeak" | "readLeak" | "writeAccepted" | "writeChanged" | "lowRoleWrite";
export type Baseline = Partial<Record<FindingKind, Record<string, string>>> & { coverage?: { probedRoutesFloor?: number } };

export interface Diff { newFindings: Array<{ kind: FindingKind; key: string }>; stale: Array<{ kind: FindingKind; key: string }> }

export function diffBaseline(found: Record<FindingKind, Iterable<string>>, baseline: Baseline): Diff {
  const newFindings: Diff["newFindings"] = [];
  const stale: Diff["stale"] = [];
  for (const kind of Object.keys(found) as FindingKind[]) {
    const have = new Set(found[kind]);
    const accepted = baseline[kind] ?? {};
    for (const key of [...have].sort()) if (!(key in accepted)) newFindings.push({ kind, key });
    for (const key of Object.keys(accepted).sort()) if (!have.has(key)) stale.push({ kind, key });
  }
  return { newFindings, stale };
}

/** Whether an answer shows the request got past authorization and did something. */
export const succeeded = (status: number) => status >= 200 && status < 300;
