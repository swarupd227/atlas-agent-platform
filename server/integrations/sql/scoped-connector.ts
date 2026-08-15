/**
 * Wraps a raw dialect SqlConnector with two orthogonal, session-scoped
 * concerns neither belongs in the per-dialect clients:
 *
 *  - Table allowlist enforcement (governance): when a connection is
 *    configured with `allowedTables`, every tool that touches a specific
 *    table is checked against it, and sql_execute_query's raw SQL is
 *    parsed to check every table it references -- a determined-or-confused
 *    agent can't reach an unlisted table by writing SQL directly instead of
 *    going through the table-scoped tools.
 *  - Explored-table tracking: which tables this session has actually
 *    inspected via describeTable/previewTable, read by tools.ts to warn
 *    when sql_execute_query references a table the agent never looked at.
 *
 * Both need the SAME table-list-from-SQL parsing (sql-parse.ts), so they're
 * implemented together rather than as two separate wrappers.
 */

import type { SqlConnector, SqlResult } from "./types";
import { extractReferencedTables } from "./sql-parse";

export class ScopedSqlConnector implements SqlConnector {
  readonly dialect: string;
  private readonly exploredTables = new Set<string>();

  constructor(
    private readonly inner: SqlConnector,
    private readonly allowedTables: Set<string> | null // null = unrestricted
  ) {
    this.dialect = inner.dialect;
  }

  private checkAllowed(table: string): void {
    if (this.allowedTables && !this.allowedTables.has(table.toLowerCase())) {
      throw new Error(
        `Table "${table}" is not in this connection's allowed-tables list. ` +
        `Allowed: ${Array.from(this.allowedTables).join(", ") || "(none configured)"}.`
      );
    }
  }

  private filterToAllowed(result: SqlResult, tableField: string): SqlResult {
    if (!this.allowedTables) return result;
    const rows = result.rows.filter((r) => {
      const name = r[tableField];
      return typeof name === "string" && this.allowedTables!.has(name.toLowerCase());
    });
    return { ...result, rows, row_count: rows.length };
  }

  async executeQuery(sql: string, maxRows?: number): Promise<SqlResult> {
    if (this.allowedTables) {
      const { tables, parsedOk } = extractReferencedTables(sql, this.dialect);
      if (!parsedOk) {
        throw new Error(
          "This connection is scoped to an allowed-tables list, and the query couldn't be parsed to verify " +
          "which tables it touches -- refusing to run it. Simplify the query or contact an admin to widen the allowlist."
        );
      }
      const disallowed = tables.filter((t) => !this.allowedTables!.has(t));
      if (disallowed.length > 0) {
        throw new Error(
          `Query references table(s) not in this connection's allowed-tables list: ${disallowed.join(", ")}. ` +
          `Allowed: ${Array.from(this.allowedTables).join(", ")}.`
        );
      }
    }
    return this.inner.executeQuery(sql, maxRows);
  }

  async listSchemas(): Promise<SqlResult> {
    return this.inner.listSchemas();
  }

  async listTables(schema?: string): Promise<SqlResult> {
    const result = await this.inner.listTables(schema);
    return this.filterToAllowed(result, "table_name");
  }

  async describeTable(schema: string | undefined, table: string): Promise<SqlResult> {
    this.checkAllowed(table);
    const result = await this.inner.describeTable(schema, table);
    this.exploredTables.add(table.toLowerCase());
    return result;
  }

  async searchTables(keyword: string): Promise<SqlResult> {
    const result = await this.inner.searchTables(keyword);
    return this.filterToAllowed(result, "table_name");
  }

  async getColumnStats(schema: string | undefined, table: string, column: string): Promise<SqlResult> {
    this.checkAllowed(table);
    return this.inner.getColumnStats(schema, table, column);
  }

  async previewTable(schema: string | undefined, table: string, limit?: number): Promise<SqlResult> {
    this.checkAllowed(table);
    const result = await this.inner.previewTable(schema, table, limit);
    this.exploredTables.add(table.toLowerCase());
    return result;
  }

  async sampleDistinctValues(schema: string | undefined, table: string, column: string, limit: number): Promise<string[]> {
    this.checkAllowed(table);
    return this.inner.sampleDistinctValues(schema, table, column, limit);
  }

  async valueExistsInColumn(schema: string | undefined, table: string, column: string, literal: string): Promise<boolean> {
    this.checkAllowed(table);
    return this.inner.valueExistsInColumn(schema, table, column, literal);
  }

  async close(): Promise<void> {
    return this.inner.close();
  }

  getTunnelFingerprint(): string | undefined {
    return this.inner.getTunnelFingerprint?.();
  }

  getExploredTables(): Set<string> {
    return this.exploredTables;
  }
}

/** Parses the comma-separated `allowedTables` credential into a lookup set, or null if unset. */
export function parseAllowedTables(raw: string | undefined): Set<string> | null {
  if (!raw || !raw.trim()) return null;
  const names = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}
