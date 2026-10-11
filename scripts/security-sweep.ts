/**
 * Authorization sweep: a live check, against a throwaway copy of the platform (production security mode, an empty Postgres), that
 * the HTTP surface keeps its tenant and role boundaries. It reads the route list out of the source, fills the database with one row
 * per table for the default organization (A), signs in as three callers, and asks every route what each of them may do:
 *
 *   S1  no session           every route must refuse (401), apart from the ones listed in the baseline.
 *   S2  admin of another org (B)   a list must not return A's rows; a read of an id that A can read must not succeed for B.
 *   S3  B, writing           PATCH/PUT/DELETE/POST at A's ids must not succeed, and A's object must not change afterwards.
 *   S4  finance (lowest role, in A)  a mutating route that succeeds unless the baseline says it may is reported as a warning only:
 *       which id a route is tried with is partly luck, so this pass differs a little from run to run and cannot fail the build.
 *
 * What it finds is compared with scripts/security-sweep-baseline.json: the findings already known and accepted, each with a reason.
 * A finding that is not there fails the run; one that is there but no longer happens is reported, so the file can be trimmed.
 * The run also fails if it can probe fewer routes than the baseline's floor, so a sweep that quietly stopped reaching routes cannot
 * pass.
 *
 * Run from the repository root, with the app already running against an empty, migrated database:
 *
 *   BASE_URL=http://127.0.0.1:5000 ADMIN_PASSWORD=... DATABASE_URL=postgres://... npx tsx scripts/security-sweep.ts
 *   ... --update-baseline     write what was found as the new baseline (review the diff before committing it)
 *   ... --update-baseline --merge   keep the entries already in the baseline and add what was found: run it on a few fresh
 *                                   deployments so that the baseline holds everything the sweep can find, not one run's share
 *
 * It writes to the database and issues destructive requests on purpose: never point it at a deployment with real data.
 */
import pg from "pg";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "../shared/schema";
import {
  NOT_SWEPT, baseRoute, diffBaseline, fillRoute, findingKey, hasParams, isIdLike, nameTokens, paramSlots, rankTables, scanRoutes,
  succeeded, valueForColumn,
  type Baseline, type FindingKind, type RouteEntry,
} from "./security-sweep-lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:5000").replace(/\/+$/, "");
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const REPORT = process.env.SWEEP_REPORT ?? "security-sweep-report.json";
const BASELINE_PATH = process.env.SWEEP_BASELINE ?? path.join(HERE, "security-sweep-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");
const MERGE = process.argv.includes("--merge");
const MARKER = "sweep-was-here";
if (!ADMIN_PASSWORD || !DATABASE_URL) { console.error("ADMIN_PASSWORD and DATABASE_URL are required"); process.exit(2); }

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Res { status: number; text: string; json: any }
const stats: Record<string, number> = { requests: 0, rateLimited: 0, timedOut: 0 };

async function req(cookie: string | null, method: string, route: string, body?: unknown, timeoutMs = 10000): Promise<Res> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  stats.requests++;
  try {
    const res = await fetch(BASE + route, {
      method, redirect: "manual", signal: ctl.signal,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if ((res.headers.get("content-type") ?? "").includes("event-stream")) { ctl.abort(); return { status: res.status, text: "", json: null }; }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (res.status === 429) stats.rateLimited++;
    return { status: res.status, text, json };
  } catch {
    stats.timedOut++;
    return { status: 0, text: "", json: null };
  } finally { clearTimeout(timer); }
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  for (const c of ((res.headers as any).getSetCookie?.() ?? []) as string[]) { const m = /auth_token=([^;]+)/.exec(c); if (m) return `auth_token=${m[1]}`; }
  throw new Error(`sign-in as ${username} failed: HTTP ${res.status}`);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const listOf = (json: any): any[] | null => Array.isArray(json) ? json : json && typeof json === "object" ? (Object.values(json).find((v) => Array.isArray(v)) as any[] | undefined) ?? null : null;
const bodyFor = (verb: string) => (verb === "DELETE" ? undefined : { name: MARKER, title: MARKER, description: MARKER, content: MARKER });

// ── the route inventory ──────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(HERE, "..");
function sourceFiles(dir: string, out: Array<{ path: string; source: string }> = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules") sourceFiles(p, out); }
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push({ path: path.relative(ROOT, p).replace(/\\/g, "/"), source: readFileSync(p, "utf8") });
  }
  return out;
}
const routes: RouteEntry[] = scanRoutes(sourceFiles(path.join(ROOT, "server"))).filter((r) => !NOT_SWEPT.test(r.route));
const getRoutes = new Set(routes.filter((r) => r.verb === "GET").map((r) => r.route));
console.log(`route inventory: ${routes.length} routes under /api`);

// ── setup: A is the default organization's admin; B is the admin of another organization; F is a finance user in A ──

const db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
const cookieA = await login(ADMIN_USER, ADMIN_PASSWORD);
const me = await req(cookieA, "GET", "/api/auth/me");
const orgA: string = me.json?.user?.organizationId ?? me.json?.organizationId;
if (!orgA) throw new Error("could not read the admin's organization from /api/auth/me");
const orgB = (await db.query(`INSERT INTO organizations (name, slug, plan, status) VALUES ('Sweep org B','sweep-org-b','starter','active') ON CONFLICT (slug) DO UPDATE SET status='active' RETURNING id`)).rows[0].id as string;
async function makeUser(role: string, org: string | null) {
  const username = `sweep-${role}-${randomBytes(3).toString("hex")}`; const password = randomBytes(12).toString("base64url");
  const reg = await req(cookieA, "POST", "/api/auth/register", { username, password, role });
  if (reg.status >= 300) throw new Error(`could not create the ${role} user: HTTP ${reg.status} ${reg.text.slice(0, 120)}`);
  if (org) await db.query(`UPDATE users SET organization_id=$1 WHERE id=$2`, [org, reg.json?.user?.id]);
  return login(username, password);
}
const cookieB = await makeUser("admin", orgB);
const cookieF = await makeUser("finance", null);
console.log(`org A ${orgA}  org B ${orgB}`);

// The server fills in its built-in data (agents, skills, catalogues) after it starts listening: wait until that stops growing.
{
  let last = -1, steady = 0;
  for (let i = 0; i < 45 && steady < 3; i++) {
    const n = listOf((await req(cookieA, "GET", "/api/agents")).json)?.length ?? 0;
    steady = n > 0 && n === last ? steady + 1 : 0; last = n;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log(`built-in data settled at ${last} agents`);
}

// ── seed: one row in every table, for A, so that routes that take an id have an object to be asked about ───────────

const tables = (Object.values(schema).filter((v) => is(v as any, PgTable)) as PgTable[]).map((t) => getTableConfig(t));
const byName = new Map(tables.map((t) => [t.name, t]));
const SKIP_SEED = new Set(["organizations"]);
const seededIds = new Map<string, string>();
const inProgress = new Set<string>();
const seedFailures: string[] = [];

/** The table a `<thing>_id` column points at: a declared foreign key if there is one, else a table named for the longest tail of the name. */
/** Foreign keys as the database has them: some are made by the server at start-up, so the schema file does not list them. */
const dbForeignKeys = new Map<string, string>();
for (const r of (await db.query(`SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confrelid::regclass::text AS ftbl FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`)).rows) dbForeignKeys.set(`${String(r.tbl).replace(/"/g, "")}.${r.col}`, String(r.ftbl).replace(/"/g, ""));
function targetTable(cfg: ReturnType<typeof getTableConfig>, column: string): string | undefined {
  const declared = dbForeignKeys.get(`${cfg.name}.${column}`);
  if (declared && declared !== cfg.name) return declared;
  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference();
    if (ref.columns.some((c) => c.name === column)) return getTableConfig(ref.foreignTable as PgTable).name;
  }
  const tokens = nameTokens(column);
  for (let k = 0; k < tokens.length; k++) {
    const tail = tokens.slice(k).join(" ");
    const hit = tables.find((t) => nameTokens(t.name).join(" ") === tail);
    if (hit && hit.name !== cfg.name) return hit.name;
  }
  return undefined;
}

async function ensureRow(name: string): Promise<string | undefined> {
  if (seededIds.has(name)) return seededIds.get(name);
  if (inProgress.has(name) || SKIP_SEED.has(name)) return undefined;
  const cfg = byName.get(name); if (!cfg) return undefined;
  const pk = cfg.columns.find((c) => c.primary && c.name === "id") ?? cfg.columns.find((c) => c.primary);
  inProgress.add(name);
  try {
    const hasOrg = cfg.columns.some((c) => c.name === "organization_id");
    const existing = await db.query(`SELECT ${pk ? `"${pk.name}"` : "1"} AS id FROM "${name}" ${hasOrg ? `WHERE organization_id = $1` : ""} ${pk ? `ORDER BY "${pk.name}"` : ""} LIMIT 1`, hasOrg ? [orgA] : []).catch(() => null);
    if (existing?.rows[0]) { if (pk) { seededIds.set(name, String(existing.rows[0].id)); return String(existing.rows[0].id); } return undefined; }
    const cols: string[] = []; const vals: unknown[] = [];
    for (const col of cfg.columns) {
      if (col.columnType === "PgCustomColumn") continue;
      let linked: string | undefined;
      if ((col.name.endsWith("_id") || dbForeignKeys.has(`${name}.${col.name}`)) && col.name !== "organization_id") { const t = targetTable(cfg, col.name); if (t) linked = await ensureRow(t); }
      const v = valueForColumn(
        { name: col.name, columnType: col.columnType, notNull: col.notNull, hasDefault: col.hasDefault, primary: col.primary, enumValues: (col as any).enumValues },
        { organizationId: orgA, idFor: () => linked },
      );
      if (v === undefined) continue;
      cols.push(`"${col.name}"`);
      vals.push(col.columnType === "PgJsonb" || col.columnType === "PgJson" ? JSON.stringify(v) : v);
    }
    const sql = cols.length
      ? `INSERT INTO "${name}" (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING ${pk ? `"${pk.name}"` : "1"} AS id`
      : `INSERT INTO "${name}" DEFAULT VALUES RETURNING ${pk ? `"${pk.name}"` : "1"} AS id`;
    const row = await db.query(sql, vals);
    if (pk) { seededIds.set(name, String(row.rows[0].id)); return String(row.rows[0].id); }
  } catch (e: any) {
    seedFailures.push(`${name}: ${String(e?.message ?? e).split("\n")[0]}`);
  } finally { inProgress.delete(name); }
  return undefined;
}
for (const t of tables) await ensureRow(t.name);
console.log(`seeded ${seededIds.size} of ${tables.length} tables (${seedFailures.length} could not be filled)`);
const tablesWithIds = [...seededIds.keys()];
// ── findings ─────────────────────────────────────────────────────────────────────────────────────────────────────

const found: Record<FindingKind, Set<string>> = {
  unauthenticated: new Set(), listLeak: new Set(), readLeak: new Set(), writeAccepted: new Set(), writeChanged: new Set(), lowRoleWrite: new Set(),
};
const detail: Record<string, unknown> = {};

// ── S1: no session ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const res = await pool(routes, 10, async (r) => ({ r, res: await req(null, r.verb, fillRoute(r.route, ["x"]), r.verb === "GET" ? undefined : {}, 8000) }));
  for (const { r, res: x } of res) if (x.status !== 401 && x.status !== 404 && x.status !== 0 && x.status !== 429) found.unauthenticated.add(findingKey(r.verb, r.route));
  console.log(`S1: ${found.unauthenticated.size} of ${routes.length} routes answered a caller with no session with something other than 401/404`);
}

// ── S2a: B's lists must not show A's rows ─────────────────────────────────────────────────────────────────────────
const lists = routes.filter((r) => r.verb === "GET" && !hasParams(r.route));
/** The ids in A's lists: an object can be asked about by id even where the API has no read-by-id route. */
const listIds = new Map<string, string[]>();
const tableOfId = new Map([...seededIds].map(([table, id]) => [id, table]));
const hasOrgColumn = (table: string) => !!byName.get(table)?.columns.some((c) => c.name === "organization_id");
/** What kind of row a finding was about, so that a finding on a row with no owner column is told apart from one on a row that has one. */
const ownership: Record<string, string> = {};
const note = (kind: FindingKind, key: string, values: string[]) => {
  const table = tableOfId.get(values[0] ?? "");
  ownership[`${kind} ${key}`] = table ? (hasOrgColumn(table) ? `${table}` : `${table} (no organization column)`) : "an id taken from a list";
};
{
  const rows = await pool(lists, 10, async (r) => ({ r, a: await req(cookieA, "GET", r.route), b: await req(cookieB, "GET", r.route) }));
  let withRows = 0;
  for (const { r, a, b } of rows) {
    const al = a.status === 200 ? listOf(a.json) : null;
    if (al?.length) {
      withRows++;
      const ids = al.filter((e) => e && typeof e.id === "string").slice(0, 3).map((e) => e.id as string);
      if (ids.length) listIds.set(r.route, ids);
    }
    const bl = b.status === 200 ? listOf(b.json) : null; if (!bl) continue;
    const aIds = new Set((al ?? []).filter((e) => e && typeof e.id === "string").map((e) => e.id as string));
    const owned = bl.filter((e) => e && e.organizationId === orgA);
    const shared = bl.filter((e) => e && typeof e.id === "string" && aIds.has(e.id) && (al ?? []).some((x) => x?.id === e.id && x.organizationId === orgA));
    if (owned.length || shared.length) found.listLeak.add(findingKey("GET", r.route));
  }
  stats.listsWithRows = withRows; stats.lists = lists.length;
  console.log(`S2a: ${found.listLeak.size} lists show A's rows to B (${withRows} of ${lists.length} lists had rows to leak)`);
}

// ── binding path parameters to real objects ───────────────────────────────────────────────────────────────────────
const NAMES = ["salesforce", "hubspot", "servicenow", "github", "jira", "slack", "default", "sweep"];
const bogus = () => randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5");

function candidatesFor(route: string): string[][] {
  return paramSlots(route).map((slot) => {
    if (!isIdLike(slot)) return NAMES;
    const ids = rankTables(tablesWithIds, slot).slice(0, 6).map((t) => seededIds.get(t)!);
    return ids.length ? ids : [seededIds.get("agents") ?? "x"];
  });
}

interface Binding { values: string[]; validated: boolean; idAgnostic: boolean }
const bound = new Map<string, Binding | null>();
async function bindGet(route: string): Promise<Binding | null> {
  if (bound.has(route)) return bound.get(route)!;
  bound.set(route, null);
  const slots = candidatesFor(route);
  // The parent's validated values first, then each candidate in turn (the first parameter varying slowest), within a budget.
  const tries: string[][] = [];
  const parent = [...getRoutes].filter((g) => g !== route && hasParams(g) && route.startsWith(g + "/")).sort((a, b) => b.length - a.length)[0];
  const parentBinding = parent ? await bindGet(parent) : null;
  const build = (prefix: string[], i: number) => {
    if (tries.length >= 40) return;
    if (i === slots.length) { tries.push(prefix); return; }
    for (const c of slots[i].slice(0, i === 0 ? 8 : 3)) build([...prefix, c], i + 1);
  };
  if (parentBinding?.validated) {
    const n = paramSlots(parent!).length;
    const rest = slots.slice(n);
    const extend = (prefix: string[], i: number) => { if (tries.length >= 20) return; if (i === rest.length) { tries.push(prefix); return; } for (const c of rest[i].slice(0, 3)) extend([...prefix, c], i + 1); };
    extend(parentBinding.values.slice(0, n), 0);
  }
  build([], 0);
  for (const values of tries) {
    const a = await req(cookieA, "GET", fillRoute(route, values));
    if (a.status === 200 && a.text.length > 2) {
      const control = await req(cookieA, "GET", fillRoute(route, values.map((v) => (/^[0-9a-f-]{36}$/.test(v) ? bogus() : v + "-no-such-object"))));
      const b: Binding = { values, validated: true, idAgnostic: control.status === 200 && control.text.length > 2 };
      bound.set(route, b); return b;
    }
  }
  return null;
}

/** What a write is aimed at: the values for its path, and how to see the object it is aimed at (a read by id, or A's list). */
interface Target { values: string[]; stateUrl: string | null; entryId: string | null; validated: boolean }
async function targetFor(route: string): Promise<Target> {
  const slots = candidatesFor(route);
  if (!slots.length) return { values: [], stateUrl: null, entryId: null, validated: false };
  const base = baseRoute(route);
  const ancestor = getRoutes.has(route) ? route : [...getRoutes].filter((g) => hasParams(g) && route.startsWith(g + "/")).sort((a, b) => b.length - a.length)[0];
  const g = ancestor ? await bindGet(ancestor) : null;
  const rest = (from: number) => slots.slice(from).map((s) => s[0]);
  if (g?.validated && getRoutes.has(base)) {
    const values = [...g.values.slice(0, paramSlots(ancestor!).length), ...rest(paramSlots(ancestor!).length)];
    return { values, stateUrl: fillRoute(base, [values[0]]), entryId: null, validated: true };
  }
  const cut = route.slice(0, route.indexOf("/:"));
  const ids = listIds.get(cut);
  if (ids?.length) return { values: [ids[0], ...rest(1)], stateUrl: cut, entryId: ids[0], validated: true };
  const values = g ? [...g.values.slice(0, paramSlots(ancestor!).length), ...rest(paramSlots(ancestor!).length)] : rest(0);
  return { values, stateUrl: null, entryId: null, validated: false };
}
/** A's view of the object a write is aimed at; null when A cannot see it (it does not exist, or the read fails). */
async function stateOf(t: Target): Promise<string | null> {
  if (!t.stateUrl) return null;
  const r = await req(cookieA, "GET", t.stateUrl);
  if (r.status !== 200) return null;
  if (t.entryId === null) return r.text;
  const entry = listOf(r.json)?.find((x) => x?.id === t.entryId);
  return entry ? JSON.stringify(entry) : null;
}

// ── S2b: B reads objects A can read ───────────────────────────────────────────────────────────────────────────────
const paramGets = routes.filter((r) => r.verb === "GET" && hasParams(r.route));
let armed = 0, agnostic = 0;
{
  await pool(paramGets, 8, async (r) => {
    const b = await bindGet(r.route);
    if (!b) return;
    armed++;
    if (b.idAgnostic) { agnostic++; return; }
    const path = fillRoute(r.route, b.values);
    const a = await req(cookieA, "GET", path);
    const x = await req(cookieB, "GET", path);
    if (a.status !== 200 || x.status !== 200 || x.text.length <= 2) return;
    if (x.text === a.text || b.values.some((v) => x.text.includes(v))) { const key = findingKey("GET", r.route); found.readLeak.add(key); note("readLeak", key, b.values); }
  });
  stats.paramGetRoutes = paramGets.length; stats.paramGetArmed = armed; stats.paramGetIdAgnostic = agnostic;
  console.log(`S2b: ${found.readLeak.size} reads of A's objects succeeded for B (${armed} of ${paramGets.length} routes with an id could be bound to a real object; ${agnostic} answer for any id)`);
}

// ── S3: B writes at A's objects ──────────────────────────────────────────────────────────────────────────────────
// A write counts only when A could see the object just before it. It is a finding when it succeeds AND A's view of the object
// differs afterwards (changed, or gone). A POST that succeeds is listed apart, as an action B could take, whether or not the object shows it.
// The write passes run one request at a time and in a fixed order: some routes depend on what an earlier one left behind.
const NEVER_WRITE = /^\/api\/auth\//;
const writes = routes.filter((r) => r.verb !== "GET" && !NEVER_WRITE.test(r.route));
const order = (r: RouteEntry) => (r.verb === "DELETE" ? 1 : 0);
const targets = new Map<string, Target>();
let s3Tested = 0, s3Untested = 0;
{
  const withParams = writes.filter((r) => hasParams(r.route)).sort((a, b) => order(a) - order(b));
  await pool(withParams, 8, async (r) => { targets.set(r.route, await targetFor(r.route)); });
  for (const phase of [0, 1]) {
    await pool(withParams.filter((r) => order(r) === phase), 1, async (r) => {
      const t = targets.get(r.route)!;
      const before = await stateOf(t);
      if (before === null) { s3Untested++; return; }
      s3Tested++;
      const res = await req(cookieB, r.verb, fillRoute(r.route, t.values), bodyFor(r.verb));
      if (!succeeded(res.status)) return;
      const after = await stateOf(t);
      const key = findingKey(r.verb, r.route);
      if (r.verb === "POST") { found.writeAccepted.add(key); note("writeAccepted", key, t.values); }
      else if (after !== before) { found.writeChanged.add(key); note("writeChanged", key, t.values); }
    });
  }
  stats.writeRoutesWithId = withParams.length; stats.s3Tested = s3Tested; stats.s3Untested = s3Untested;
  console.log(`S3: B changed or removed A's object through ${found.writeChanged.size} routes, and could run ${found.writeAccepted.size} more actions on it (${s3Tested} of ${withParams.length} write routes with an id were tried on a real object)`);
}

// ── S4: the lowest role, in A ────────────────────────────────────────────────────────────────────────────────────
{
  const ordered = [...writes].sort((a, b) => order(a) - order(b));
  const codes: Record<string, number> = {};
  const results: Record<string, number> = {};
  for (const phase of [0, 1]) {
    await pool(ordered.filter((r) => order(r) === phase), 1, async (r) => {
      const t = hasParams(r.route) ? (targets.get(r.route) ?? (await targetFor(r.route))) : null;
      const res = await req(cookieF, r.verb, t ? fillRoute(r.route, t.values) : r.route, bodyFor(r.verb));
      codes[String(res.status)] = (codes[String(res.status)] ?? 0) + 1;
      results[findingKey(r.verb, r.route)] = res.status;
      if (succeeded(res.status)) found.lowRoleWrite.add(findingKey(r.verb, r.route));
    });
  }
  detail.lowRoleStatuses = codes;
  detail.lowRoleResults = results;
  console.log(`S4: finance succeeded at ${found.lowRoleWrite.size} of ${writes.length} mutating routes`);
}
detail.ownership = ownership;

// ── verdict ──────────────────────────────────────────────────────────────────────────────────────────────────────

const baseline: Baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};
const diff = diffBaseline(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]])) as Record<FindingKind, string[]>, baseline);
const probed = armed + s3Tested;
const floor = baseline.coverage?.probedRoutesFloor ?? 0;
const coverageOk = probed >= floor;
/** Findings that fail the run; the lowest-role pass only warns. */
const blocking = diff.newFindings.filter((f) => f.kind !== "lowRoleWrite");
const advisory = diff.newFindings.filter((f) => f.kind === "lowRoleWrite");
writeFileSync(REPORT, JSON.stringify({ base: BASE, stats, coverage: { probed, armed, s3Tested, floor }, seedFailures, found: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v].sort()])), diff, detail }, null, 1));

/** The reason written beside a new baseline entry: none yet. The unit test refuses a baseline that still has this placeholder. */
const reasonFor = (_kind: FindingKind, _key: string) => "unclassified";

if (UPDATE) {
  const next: Baseline = { coverage: { probedRoutesFloor: Math.floor(probed * 0.9) } };
  for (const k of Object.keys(found) as FindingKind[]) {
    const keys = new Set([...found[k], ...(MERGE ? Object.keys(baseline[k] ?? {}) : [])]);
    next[k] = Object.fromEntries([...keys].sort().map((key) => [key, baseline[k]?.[key] ?? reasonFor(k, key)]));
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`baseline written to ${BASELINE_PATH}`);
  await db.end();
  process.exit(0);
}

console.log(`\ncoverage: ${probed} routes tried on a real object (${armed} reads, ${s3Tested} writes; floor ${floor})${coverageOk ? "" : "  <-- BELOW THE FLOOR"}`);
for (const f of advisory) console.log(`WARN ${f.kind.padEnd(14)} ${f.key}   (lowest-role pass: advisory)`);
for (const f of blocking) console.log(`NEW  ${f.kind.padEnd(14)} ${f.key}${ownership[`${f.kind} ${f.key}`] ? `   [${ownership[`${f.kind} ${f.key}`]}]` : ""}`);
for (const f of diff.stale) console.log(`gone ${f.kind.padEnd(14)} ${f.key}   (no longer found: remove it from the baseline)`);
if (blocking.length) console.log("\nA new finding means a route now lets a caller do something the baseline does not accept. Fix the route; if it is meant,\nre-run with --update-baseline against a scratch deployment, write the reason beside the entry, and have the diff reviewed.");
console.log(blocking.length === 0 && coverageOk ? `\nSWEEP PASSED (${diff.stale.length} accepted findings no longer occur, ${advisory.length} warnings)` : `\nSWEEP FAILED: ${blocking.length} new findings${coverageOk ? "" : ", coverage below the floor"}`);
await db.end();
process.exit(blocking.length === 0 && coverageOk ? 0 : 1);
