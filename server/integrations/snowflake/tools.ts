/**
 * Snowflake MCP tool implementations — 9 read-only tools.
 * All queries enforce read-only via guardReadOnly() in the client.
 * Results > 1000 rows are truncated with truncated: true flag.
 */

import type { SnowflakeClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ── Tool: sf_execute_query ────────────────────────────────────────────────────

export async function sf_execute_query(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const sql = String(args.sql ?? "");
  const maxRows = Math.min(Number(args.max_rows ?? 1000), 1000);
  if (!sql) return err("sql is required");
  try {
    const result = await client.executeQuery(sql, maxRows);
    return ok({ ...result, note: result.truncated ? `Results truncated to ${maxRows} rows. Use LIMIT/WHERE to narrow results.` : undefined });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_execute_warehouse_query ─────────────────────────────────────────

export async function sf_execute_warehouse_query(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const sql = String(args.sql ?? "");
  if (!sql) return err("sql is required");
  try {
    const result = await client.executeQuery(sql, 1000);
    return ok({ ...result, note: result.truncated ? "Results truncated to 1000 rows." : undefined });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_list_databases ───────────────────────────────────────────────────
// Returns databases AND their schemas (via SHOW TERSE SCHEMAS IN ACCOUNT).
// Falls back to database-only listing if SHOW SCHEMAS IN ACCOUNT is unavailable.

export async function sf_list_databases(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const [dbResult, schemaResult] = await Promise.allSettled([
      client.listDatabases(),
      client.listSchemasInAccount(),
    ]);

    const databases = dbResult.status === "fulfilled" ? dbResult.value : null;
    const schemas   = schemaResult.status === "fulfilled" ? schemaResult.value : null;

    return ok({
      databases: databases?.rows ?? [],
      databases_meta: databases ? { columns: databases.columns, row_count: databases.row_count } : null,
      schemas: schemas?.rows ?? [],
      schemas_meta: schemas ? { columns: schemas.columns, row_count: schemas.row_count } : null,
      note: !schemas ? "Schema enumeration unavailable (SHOW TERSE SCHEMAS IN ACCOUNT requires ACCOUNT_USAGE privilege). Use sf_list_tables per database." : undefined,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_list_tables ──────────────────────────────────────────────────────
// Returns tables with row counts AND a column summary (names + types) fetched
// in a single INFORMATION_SCHEMA.COLUMNS batch query, grouped by table.

export async function sf_list_tables(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  if (!database) return err("database is required");
  try {
    const [tableResult, colResult] = await Promise.allSettled([
      client.listTables(database, schema),
      client.executeQuery(
        `SELECT table_name, column_name, data_type, ordinal_position ` +
        `FROM "${database}".information_schema.columns ` +
        `WHERE table_schema = '${schema.toUpperCase()}' ` +
        `ORDER BY table_name, ordinal_position`
      ),
    ]);

    if (tableResult.status === "rejected") return err((tableResult as any).reason?.message ?? "Failed to list tables");

    const tables: Record<string, unknown>[] = (tableResult.value.rows ?? []) as Record<string, unknown>[];

    // Build a map from table_name → [{column_name, data_type}] from the column query
    const colsByTable = new Map<string, { column_name: string; data_type: string }[]>();
    if (colResult.status === "fulfilled") {
      for (const row of (colResult.value.rows ?? []) as Record<string, string>[]) {
        const tbl = (row.table_name ?? row.TABLE_NAME ?? "").toUpperCase();
        if (!colsByTable.has(tbl)) colsByTable.set(tbl, []);
        colsByTable.get(tbl)!.push({
          column_name: row.column_name ?? row.COLUMN_NAME ?? "",
          data_type:   row.data_type   ?? row.DATA_TYPE   ?? "",
        });
      }
    }

    const enriched = tables.map(t => {
      const tblKey = String(t.table_name ?? t.TABLE_NAME ?? "").toUpperCase();
      return { ...t, columns: colsByTable.get(tblKey) ?? [] };
    });

    return ok({
      database,
      schema,
      tables: enriched,
      table_count: enriched.length,
      columns_note: colResult.status === "rejected"
        ? "Column summaries unavailable (INFORMATION_SCHEMA.COLUMNS query failed)"
        : undefined,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_describe_table ───────────────────────────────────────────────────
// Returns column schema PLUS up to 5 sample rows to illustrate data shape.

export async function sf_describe_table(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  const table = String(args.table ?? "");
  if (!database || !table) return err("database and table are required");
  try {
    const [schemaResult, previewResult] = await Promise.allSettled([
      client.describeTable(database, schema, table),
      client.previewTable(database, schema, table, 5),
    ]);

    const columns = schemaResult.status === "fulfilled" ? schemaResult.value : null;
    const preview = previewResult.status === "fulfilled" ? previewResult.value : null;

    return ok({
      database,
      schema,
      table,
      columns: columns?.rows ?? [],
      columns_meta: columns ? { row_count: columns.row_count } : null,
      sample_rows: preview?.rows ?? [],
      sample_row_count: preview?.row_count ?? 0,
      sample_columns: preview?.columns ?? [],
      schema_error: schemaResult.status === "rejected" ? (schemaResult as any).reason?.message : undefined,
      sample_error: previewResult.status === "rejected" ? (previewResult as any).reason?.message : undefined,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_get_query_history ────────────────────────────────────────────────

export async function sf_get_query_history(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const limit = Math.min(Number(args.limit ?? 20), 100);
  try {
    const result = await client.getQueryHistory(limit);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_search_tables ────────────────────────────────────────────────────

export async function sf_search_tables(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const keyword = String(args.keyword ?? "");
  if (!keyword) return err("keyword is required");
  try {
    const result = await client.searchTables(keyword);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_get_column_stats ─────────────────────────────────────────────────

export async function sf_get_column_stats(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  const table = String(args.table ?? "");
  const column = String(args.column ?? "");
  if (!database || !table || !column) return err("database, table, and column are required");
  try {
    const result = await client.getColumnStats(database, schema, table, column);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_preview_table ────────────────────────────────────────────────────

export async function sf_preview_table(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  const table = String(args.table ?? "");
  const limit = Math.min(Number(args.limit ?? 20), 50);
  if (!database || !table) return err("database and table are required");
  try {
    const result = await client.previewTable(database, schema, table, limit);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}
