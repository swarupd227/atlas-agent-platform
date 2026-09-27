/**
 * Databricks MCP tool implementations — 9 read-only tools, mirroring
 * server/integrations/snowflake/tools.ts's shape so the two data-warehouse
 * connectors present a consistent surface to agents.
 * All queries enforce read-only via guardReadOnly() in the client.
 */

import type { DatabricksClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ── Tool: db_execute_query ────────────────────────────────────────────────────

export async function db_execute_query(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const sql = String(args.sql ?? "");
  const maxRows = Math.min(Number(args.max_rows ?? 1000), 1000);
  if (!sql) return err("sql is required");
  try {
    const result = await client.executeQuery(sql, maxRows);
    return ok({ ...result, note: result.truncated ? `Results truncated to ${maxRows} rows. Use LIMIT/WHERE to narrow results.` : undefined });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_list_catalogs ────────────────────────────────────────────────────
// Unity Catalog's top-level namespace -- the rough equivalent of a Snowflake database.

export async function db_list_catalogs(client: DatabricksClient, _args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const catalogs = await client.listCatalogs();
    return ok({
      catalogs: catalogs.map((c: any) => ({ name: c.name, comment: c.comment, catalog_type: c.catalog_type, owner: c.owner })),
      catalog_count: catalogs.length,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_list_schemas ─────────────────────────────────────────────────────

export async function db_list_schemas(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const catalog = String(args.catalog ?? "");
  if (!catalog) return err("catalog is required");
  try {
    const schemas = await client.listSchemas(catalog);
    return ok({
      catalog,
      schemas: schemas.map((s: any) => ({ name: s.name, comment: s.comment, owner: s.owner })),
      schema_count: schemas.length,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_list_tables ──────────────────────────────────────────────────────

export async function db_list_tables(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const catalog = String(args.catalog ?? "");
  const schema = String(args.schema ?? "");
  if (!catalog || !schema) return err("catalog and schema are required");
  try {
    const tables = await client.listTables(catalog, schema);
    return ok({
      catalog,
      schema,
      tables: tables.map((t: any) => ({
        name: t.name,
        full_name: t.full_name,
        table_type: t.table_type,
        data_source_format: t.data_source_format,
        comment: t.comment,
        owner: t.owner,
      })),
      table_count: tables.length,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_describe_table ───────────────────────────────────────────────────
// Returns Unity Catalog's own column metadata PLUS up to 5 sample rows.

export async function db_describe_table(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const catalog = String(args.catalog ?? "");
  const schema = String(args.schema ?? "");
  const table = String(args.table ?? "");
  if (!catalog || !schema || !table) return err("catalog, schema, and table are required");
  try {
    const [infoResult, previewResult] = await Promise.allSettled([
      client.describeTable(catalog, schema, table),
      client.previewTable(catalog, schema, table, 5),
    ]);

    const info = infoResult.status === "fulfilled" ? infoResult.value : null;
    const preview = previewResult.status === "fulfilled" ? previewResult.value : null;

    return ok({
      catalog,
      schema,
      table,
      table_type: info?.table_type,
      data_source_format: info?.data_source_format,
      comment: info?.comment,
      columns: (info?.columns ?? []).map((c: any) => ({
        name: c.name,
        type: c.type_text ?? c.type_name,
        nullable: c.nullable,
        position: c.position,
        comment: c.comment,
      })),
      sample_rows: preview?.rows ?? [],
      sample_row_count: preview?.row_count ?? 0,
      info_error: infoResult.status === "rejected" ? (infoResult as any).reason?.message : undefined,
      sample_error: previewResult.status === "rejected" ? (previewResult as any).reason?.message : undefined,
    });
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_preview_table ────────────────────────────────────────────────────

export async function db_preview_table(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const catalog = String(args.catalog ?? "");
  const schema = String(args.schema ?? "");
  const table = String(args.table ?? "");
  const limit = Math.min(Number(args.limit ?? 20), 50);
  if (!catalog || !schema || !table) return err("catalog, schema, and table are required");
  try {
    const result = await client.previewTable(catalog, schema, table, limit);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_search_tables ────────────────────────────────────────────────────

export async function db_search_tables(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const keyword = String(args.keyword ?? "");
  const catalog = args.catalog ? String(args.catalog) : undefined;
  if (!keyword) return err("keyword is required");
  try {
    const result = await client.searchTables(keyword, catalog);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_get_column_stats ─────────────────────────────────────────────────

export async function db_get_column_stats(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const catalog = String(args.catalog ?? "");
  const schema = String(args.schema ?? "");
  const table = String(args.table ?? "");
  const column = String(args.column ?? "");
  if (!catalog || !schema || !table || !column) return err("catalog, schema, table, and column are required");
  try {
    const result = await client.getColumnStats(catalog, schema, table, column);
    return ok(result);
  } catch (e: any) { return err(e.message); }
}

// ── Tool: db_list_jobs ────────────────────────────────────────────────────────
// No Snowflake equivalent -- Databricks' own job/workflow orchestration.

export async function db_list_jobs(client: DatabricksClient, args: Record<string, unknown>): Promise<McpToolResult> {
  const limit = Math.min(Number(args.limit ?? 20), 100);
  try {
    const jobs = await client.listJobs(limit);
    return ok({
      jobs: jobs.map((j: any) => ({
        job_id: j.job_id,
        name: j.settings?.name,
        creator: j.creator_user_name,
        created_time: j.created_time,
        schedule: j.settings?.schedule?.quartz_cron_expression,
      })),
      job_count: jobs.length,
    });
  } catch (e: any) { return err(e.message); }
}
