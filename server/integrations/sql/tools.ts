/**
 * Generic MCP tool implementations shared by every relational-DB connector
 * (Postgres, MySQL, SQL Server, ...). Each tool is a thin wrapper around
 * one SqlConnector method -- provider-specific logic lives entirely in the
 * client class each connector's mcp-server.ts constructs, not here.
 * Unlike Snowflake's tools.ts (server/integrations/snowflake/tools.ts),
 * tool names carry no provider prefix: each dialect is registered as its
 * own MCP server (integrationId "postgres"/"mysql"/"sqlserver"), so the
 * server identity already namespaces the tool.
 */

import type { SqlConnector } from "./types";
import type { McpToolResult } from "../../real-mcp-base";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

export async function sql_execute_query(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const sql = String(args.sql ?? "");
  const maxRows = Math.min(Number(args.max_rows ?? 1000), 1000);
  if (!sql) return err("sql is required");
  try {
    const result = await client.executeQuery(sql, maxRows);
    return ok({ ...result, note: result.truncated ? `Results truncated to ${maxRows} rows. Use LIMIT/WHERE to narrow results.` : undefined });
  } catch (e: any) { return err(e.message); }
}

export async function sql_list_schemas(client: SqlConnector): Promise<McpToolResult> {
  try {
    const result = await client.listSchemas();
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

export async function sql_list_tables(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const schema = args.schema ? String(args.schema) : undefined;
  try {
    const result = await client.listTables(schema);
    return ok({ schema, ...result });
  } catch (e: any) { return err(e.message); }
}

export async function sql_describe_table(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const schema = args.schema ? String(args.schema) : undefined;
  const table = String(args.table ?? "");
  if (!table) return err("table is required");
  try {
    const [schemaResult, previewResult] = await Promise.allSettled([
      client.describeTable(schema, table),
      client.previewTable(schema, table, 5),
    ]);

    const columns = schemaResult.status === "fulfilled" ? schemaResult.value : null;
    const preview = previewResult.status === "fulfilled" ? previewResult.value : null;

    return ok({
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

export async function sql_search_tables(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const keyword = String(args.keyword ?? "");
  if (!keyword) return err("keyword is required");
  try {
    const result = await client.searchTables(keyword);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

export async function sql_get_column_stats(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const schema = args.schema ? String(args.schema) : undefined;
  const table = String(args.table ?? "");
  const column = String(args.column ?? "");
  if (!table || !column) return err("table and column are required");
  try {
    const result = await client.getColumnStats(schema, table, column);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

export async function sql_preview_table(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const schema = args.schema ? String(args.schema) : undefined;
  const table = String(args.table ?? "");
  const limit = Math.min(Number(args.limit ?? 20), 50);
  if (!table) return err("table is required");
  try {
    const result = await client.previewTable(schema, table, limit);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}
