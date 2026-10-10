/**
 * A stand-in for the drizzle database that evaluates real conditions by column, so a test can tell one row from
 * its sibling: eq, ne, and, isNull, isNotNull over the table's own columns; orderBy with asc and desc; limit;
 * insert with the table's defaults; update and delete with returning; and a transaction that runs its callback.
 *
 * It is a model of what the code under test needs from Postgres, not Postgres: anything it does not know it
 * refuses loudly rather than guess, so a query that changes shape fails a test instead of passing it.
 */
import crypto from "node:crypto";
import { getTableColumns, getTableName } from "drizzle-orm";

type Cond = { prop: string; op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "null" | "notnull"; val?: unknown };

/** The column conditions in a where clause, however deeply and/eq/ne/isNull are nested. */
export function conditionsOf(node: any, table: any): Cond[] {
  const byDbName = new Map<string, string>();
  for (const [prop, col] of Object.entries(getTableColumns(table))) byDbName.set((col as any).name, prop);
  const out: Cond[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n.queryChunks)) {
      let column: string | null = null;
      let op: Cond["op"] | null = null;
      for (const c of n.queryChunks) {
        if (c?.constructor?.name === "PgText" || c?.constructor?.name?.startsWith("Pg")) {
          column = byDbName.get(c.name) ?? null;
          if (column === null) throw new Error(`fake-drizzle: a condition on ${getTableName(table)} uses a column it does not know (${c.name})`);
          op = null;
        } else if (c?.constructor?.name === "StringChunk") {
          const text = (c.value as string[]).join("").toLowerCase();
          if (text.includes("is not null")) { if (column) out.push({ prop: column, op: "notnull" }); }
          else if (text.includes("is null")) { if (column) out.push({ prop: column, op: "null" }); }
          else if (text.includes("<>")) op = "ne";
          else if (text.includes("<=")) op = "lte";
          else if (text.includes(">=")) op = "gte";
          else if (text.includes("<")) op = "lt";
          else if (text.includes(">")) op = "gt";
          else if (text.includes("=")) op = "eq";
          else if (text.includes(" like ") || text.includes(" in ")) throw new Error(`fake-drizzle: an operator it does not model: ${text.trim()}`);
        } else if (c?.constructor?.name === "Param") {
          if (column && op) { out.push({ prop: column, op, val: c.value }); op = null; }
        } else if (Array.isArray(c?.queryChunks)) {
          walk(c);
        }
      }
    }
  };
  walk(node);
  return out;
}

const matches = (row: any, conds: Cond[]) => conds.every((c) => {
  const v = row[c.prop];
  switch (c.op) {
    case "eq": return v === c.val;
    case "ne": return v !== c.val;
    // A missing value is never less or greater than anything, as in SQL.
    case "lt": return v != null && v < (c.val as any);
    case "lte": return v != null && v <= (c.val as any);
    case "gt": return v != null && v > (c.val as any);
    case "gte": return v != null && v >= (c.val as any);
    case "null": return v === null || v === undefined;
    case "notnull": return v !== null && v !== undefined;
  }
});

function sortKeys(args: any[], table: any): Array<{ prop: string; desc: boolean }> {
  const byDbName = new Map<string, string>();
  for (const [prop, col] of Object.entries(getTableColumns(table))) byDbName.set((col as any).name, prop);
  return args.map((a) => {
    if (a?.name && byDbName.has(a.name)) return { prop: byDbName.get(a.name)!, desc: false };
    const col = (a?.queryChunks ?? []).find((c: any) => c?.name && byDbName.has(c.name));
    const text = (a?.queryChunks ?? []).filter((c: any) => c?.constructor?.name === "StringChunk").map((c: any) => c.value.join("")).join("").toLowerCase();
    if (!col) throw new Error("fake-drizzle: an orderBy it does not model");
    return { prop: byDbName.get(col.name)!, desc: text.includes("desc") };
  });
}

const compare = (a: any, b: any) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a > b ? 1 : -1);

function withDefaults(table: any, values: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [prop, col] of Object.entries<any>(getTableColumns(table))) {
    if (values[prop] !== undefined) { row[prop] = values[prop]; continue; }
    if (typeof col.defaultFn === "function") row[prop] = col.defaultFn();
    else if (col.default !== undefined && !col.default?.queryChunks) row[prop] = col.default;
    else if (col.default?.queryChunks) row[prop] = prop === "id" ? crypto.randomUUID() : new Date();
    else row[prop] = null;
  }
  return row;
}

/** The text of a drizzle sql`...` with its parameters after it: "SELECT f(...) [a,b]". */
export function sqlTextOf(node: any): string {
  let text = "";
  const params: unknown[] = [];
  const walk = (n: any) => {
    // A JS string interpolated into sql`` arrives as a bare string in the chunks.
    if (typeof n === "string") { params.push(n); text += "?"; return; }
    if (!n || typeof n !== "object") return;
    if (n.constructor?.name === "StringChunk") text += (n.value as string[]).join("");
    else if (n.constructor?.name === "Param") { params.push(n.value); text += "?"; }
    else if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(walk);
  };
  walk(node);
  return `${text.replace(/\s+/g, " ").trim()} [${params.join(",")}]`;
}

export interface FakeDb {
  tables: Record<string, any[]>;
  /** What the code under test asked for, in order: "select integration_connections", "update ...". */
  ops: string[];
  db: any;
  rows(name: string): any[];
}

/**
 * `strict` names the tables whose conditions must all be understood (default: every table). A table not listed is
 * lenient: a condition the model cannot evaluate matches every row, which is right for tables a test does not look at.
 */
export function makeFakeDb(opts: { strict?: string[] } = {}): FakeDb {
  const tables: Record<string, any[]> = {};
  const ops: string[] = [];
  const rowsOf = (t: any) => (tables[getTableName(t)] ??= []);
  const conditionsFor = (cond: any, t: any): Cond[] => {
    try { return conditionsOf(cond, t); } catch (e) {
      if (!opts.strict || opts.strict.includes(getTableName(t))) throw e;
      return [];
    }
  };

  const select = (projection?: Record<string, any>) => ({
    from: (t: any) => {
      let conds: Cond[] = [];
      let sorts: Array<{ prop: string; desc: boolean }> = [];
      let max = Infinity;
      const run = () => {
        ops.push(`select ${getTableName(t)}`);
        let out = rowsOf(t).filter((r) => matches(r, conds));
        if (sorts.length) out = [...out].sort((a, b) => { for (const s of sorts) { const c = compare(a[s.prop], b[s.prop]); if (c !== 0) return s.desc ? -c : c; } return 0; });
        out = out.slice(0, max).map((r) => ({ ...r }));
        if (projection) {
          const props = Object.entries(projection).map(([k, col]: [string, any]) => [k, Object.entries(getTableColumns(t)).find(([, c]: any) => c.name === col.name)?.[0]] as const);
          return out.map((r) => Object.fromEntries(props.map(([k, p]) => [k, p ? r[p] : undefined])));
        }
        return out;
      };
      const q: any = {
        where: (cond: any) => { conds = conditionsFor(cond, t); return q; },
        orderBy: (...args: any[]) => { sorts = sortKeys(args, t); return q; },
        limit: (n: number) => { max = n; return q; },
        then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej),
      };
      return q;
    },
  });

  const insert = (t: any) => ({
    values: (v: any) => {
      const run = () => { ops.push(`insert ${getTableName(t)}`); const row = withDefaults(t, v); rowsOf(t).push(row); return [{ ...row }]; };
      return { returning: async () => run(), then: (res: any, rej: any) => Promise.resolve().then(run).then(() => undefined).then(res, rej) };
    },
  });

  const update = (t: any) => ({
    set: (v: any) => ({
      where: (cond: any) => {
        const run = () => {
          ops.push(`update ${getTableName(t)}`);
          const hit = rowsOf(t).filter((r) => matches(r, conditionsFor(cond, t)));
          for (const r of hit) for (const [k, val] of Object.entries(v)) if (val !== undefined) r[k] = val;
          return hit.map((r) => ({ ...r }));
        };
        return { returning: async () => run(), then: (res: any, rej: any) => Promise.resolve().then(run).then(() => undefined).then(res, rej) };
      },
    }),
  });

  const del = (t: any) => ({
    where: (cond: any) => {
      const run = (projection?: Record<string, any>) => {
        ops.push(`delete ${getTableName(t)}`);
        const conds = conditionsFor(cond, t);
        const hit = rowsOf(t).filter((r) => matches(r, conds));
        tables[getTableName(t)] = rowsOf(t).filter((r) => !hit.includes(r));
        return hit.map((r) => (projection ? Object.fromEntries(Object.keys(projection).map((k) => [k, r[k]])) : { ...r }));
      };
      return { returning: async (p?: Record<string, any>) => run(p), then: (res: any, rej: any) => Promise.resolve().then(() => run()).then(() => undefined).then(res, rej) };
    },
  });

  // A raw statement (an advisory lock, say) is not run; it is recorded with its parameters so a test can see it was asked for.
  const execute = async (q: any) => { ops.push(`execute ${sqlTextOf(q)}`); return []; };
  const db: any = { select, insert, update, delete: del, execute, transaction: async (cb: (tx: any) => Promise<unknown>) => cb(db) };
  return { tables, ops, db, rows: (name) => tables[name] ?? [] };
}
