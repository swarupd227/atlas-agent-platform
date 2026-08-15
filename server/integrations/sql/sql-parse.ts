/**
 * Extracts the real table names referenced by an arbitrary SQL statement,
 * shared by the table-allowlist governance check (scoped-connector.ts) and
 * the "haven't inspected this table yet" advisory nudge (tools.ts).
 *
 * A regex over FROM/JOIN keywords is not reliable enough for either use:
 * CTEs, subqueries, quoted/schema-qualified identifiers, and dialect
 * differences (TOP vs LIMIT, brackets vs backticks) all break naive
 * patterns. node-sql-parser gives a real per-dialect AST instead.
 */

// node-sql-parser is published CJS-only; under Node's native ESM loader
// (this project runs with "type": "module") it exposes everything as a
// single default export rather than proper named exports, unlike under
// Vitest's esbuild-transformed test environment where `import { Parser }`
// works fine -- this discrepancy is exactly why this needs a real running
// server to catch, not just the unit tests.
import pkg from "node-sql-parser";
const { Parser } = pkg;

const DIALECT_MAP: Record<string, string> = {
  postgres: "postgresql",
  mysql: "mysql",
  sqlserver: "transactsql",
};

export interface TableExtractionResult {
  /** Lowercase, deduped, unqualified table names. CTE aliases are excluded. */
  tables: string[];
  /** false if the SQL couldn't be parsed for this dialect -- callers doing
   *  enforcement (not just an advisory nudge) should fail closed on this. */
  parsedOk: boolean;
}

function collectCteNames(stmt: unknown, out: Set<string>): void {
  if (!stmt || typeof stmt !== "object") return;
  const withClause = (stmt as { with?: unknown }).with;
  if (Array.isArray(withClause)) {
    for (const cte of withClause) {
      const name = (cte as { name?: { value?: string } })?.name?.value;
      if (name) out.add(name.toLowerCase());
      // CTEs can reference earlier CTEs in the same WITH chain, and can
      // themselves contain nested WITH clauses -- recurse into the body.
      collectCteNames((cte as { stmt?: unknown })?.stmt, out);
    }
  }
}

export interface EqualityPredicate {
  /** Lowercase, resolved table name (alias already resolved). */
  table: string;
  /** Column name as written in the query. */
  column: string;
  literal: string;
}

interface FromContext {
  tables: string[]; // lowercase
  byAlias: Map<string, string>; // lowercase alias -> lowercase table
}

function buildFromContext(from: unknown): FromContext {
  const tables: string[] = [];
  const byAlias = new Map<string, string>();
  if (Array.isArray(from)) {
    for (const entry of from) {
      const table = (entry as { table?: unknown })?.table;
      if (typeof table === "string") {
        const lower = table.toLowerCase();
        tables.push(lower);
        const alias = (entry as { as?: unknown })?.as;
        if (typeof alias === "string") byAlias.set(alias.toLowerCase(), lower);
      }
    }
  }
  return { tables, byAlias };
}

/** Resolves a column_ref's table qualifier (or, if unqualified, the query's
 *  sole table) to a real table name. Returns null when ambiguous -- an
 *  unqualified column in a multi-table query -- rather than guessing. */
function resolveTable(colRef: { table?: unknown }, ctx: FromContext): string | null {
  const qualifier = colRef.table;
  if (typeof qualifier === "string") {
    const lower = qualifier.toLowerCase();
    return ctx.byAlias.get(lower) ?? (ctx.tables.includes(lower) ? lower : null);
  }
  return ctx.tables.length === 1 ? ctx.tables[0] : null;
}

function columnNameFromNode(node: unknown): string | null {
  const n = node as { type?: string; column?: unknown } | null;
  if (!n || n.type !== "column_ref") return null;
  const col = n.column;
  if (typeof col === "string") return col;
  const nested = (col as { expr?: { value?: unknown } } | null)?.expr?.value;
  return typeof nested === "string" ? nested : null;
}

function stringLiteralFromNode(node: unknown): string | null {
  const n = node as { type?: string; value?: unknown } | null;
  if (!n) return null;
  if (n.type === "single_quote_string" || n.type === "string" || n.type === "double_quote_string") {
    return typeof n.value === "string" ? n.value : null;
  }
  return null;
}

/** AND-chains only: an OR branch's zero-result doesn't cleanly implicate
 *  any single predicate inside it, so we don't descend into OR. */
function walkWhereForEquality(node: unknown, ctx: FromContext, out: EqualityPredicate[]): void {
  const n = node as { type?: string; operator?: string; left?: unknown; right?: unknown } | null;
  if (!n || n.type !== "binary_expr") return;

  const op = typeof n.operator === "string" ? n.operator.toUpperCase() : "";
  if (op === "AND") {
    walkWhereForEquality(n.left, ctx, out);
    walkWhereForEquality(n.right, ctx, out);
    return;
  }
  if (op === "=") {
    const column = columnNameFromNode(n.left);
    const literal = stringLiteralFromNode(n.right);
    if (column && literal != null) {
      const table = resolveTable(n.left as { table?: unknown }, ctx);
      if (table) out.push({ table, column, literal });
    }
    return;
  }
  if (op === "IN") {
    const column = columnNameFromNode(n.left);
    const list = (n.right as { type?: string; value?: unknown } | null);
    if (column && list?.type === "expr_list" && Array.isArray(list.value)) {
      const table = resolveTable(n.left as { table?: unknown }, ctx);
      if (table) {
        for (const item of list.value) {
          const literal = stringLiteralFromNode(item);
          if (literal != null) out.push({ table, column, literal });
        }
      }
    }
  }
  // Any other operator (!=, >, LIKE, OR, ...) carries no useful signal for
  // this specific check and is left alone.
}

/**
 * Extracts `column = 'literal'` and `column IN ('a', 'b')` equality
 * predicates from a SELECT's WHERE clause -- the exact shape of the
 * "wrong column, plausible name" failure mode: a syntactically valid
 * filter that returns zero rows because the literal doesn't belong to
 * that column at all. Used by sql_execute_query (tools.ts) to run a
 * targeted existence check only when a query actually returns nothing.
 *
 * Only AND-connected predicates are extracted (see walkWhereForEquality),
 * and an unqualified column in a multi-table query is skipped rather than
 * guessed at -- silence here just means no signal, never a wrong one.
 */
export function extractEqualityPredicates(sql: string, dialect: string): EqualityPredicate[] {
  const parser = new Parser();
  const opt = { database: DIALECT_MAP[dialect] ?? "postgresql" };

  let ast: unknown;
  try {
    ast = parser.astify(sql, opt);
  } catch {
    return [];
  }

  const predicates: EqualityPredicate[] = [];
  for (const stmt of Array.isArray(ast) ? ast : [ast]) {
    const s = stmt as { type?: string; where?: unknown; from?: unknown } | null;
    if (!s || s.type !== "select" || !s.where) continue;
    const ctx = buildFromContext(s.from);
    walkWhereForEquality(s.where, ctx, predicates);
  }
  return predicates;
}

export function extractReferencedTables(sql: string, dialect: string): TableExtractionResult {
  const parser = new Parser();
  const opt = { database: DIALECT_MAP[dialect] ?? "postgresql" };

  let cteNames: Set<string>;
  try {
    const ast = parser.astify(sql, opt);
    cteNames = new Set<string>();
    for (const stmt of Array.isArray(ast) ? ast : [ast]) {
      collectCteNames(stmt, cteNames);
    }
  } catch {
    return { tables: [], parsedOk: false };
  }

  let rawList: string[];
  try {
    // Each entry looks like "select::schema::table" or "select::null::table".
    rawList = parser.tableList(sql, opt);
  } catch {
    return { tables: [], parsedOk: false };
  }

  const tables = new Set<string>();
  for (const entry of rawList) {
    const parts = entry.split("::");
    const name = parts[parts.length - 1];
    if (name && !cteNames.has(name.toLowerCase())) tables.add(name.toLowerCase());
  }
  return { tables: Array.from(tables), parsedOk: true };
}
