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

export async function sf_list_databases(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const result = await client.listDatabases();
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_list_tables ──────────────────────────────────────────────────────

export async function sf_list_tables(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  if (!database) return err("database is required");
  try {
    const result = await client.listTables(database, schema);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: sf_describe_table ───────────────────────────────────────────────────

export async function sf_describe_table(client: SnowflakeClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const database = String(args.database ?? "");
  const schema = String(args.schema ?? "PUBLIC");
  const table = String(args.table ?? "");
  if (!database || !table) return err("database and table are required");
  try {
    const result = await client.describeTable(database, schema, table);
    return ok(result);
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
