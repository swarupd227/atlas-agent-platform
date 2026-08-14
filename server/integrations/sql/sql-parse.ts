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
