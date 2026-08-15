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
import { extractReferencedTables, extractEqualityPredicates } from "./sql-parse";

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}
function err(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// Only the first few equality predicates in a WHERE clause are checked --
// bounds how many extra round-trips one zero-row query can trigger.
const MAX_LITERAL_CHECKS = 3;

/**
 * When a query returns zero rows, a literal-equality filter that doesn't
 * match anything COULD be a genuine zero, or it could be the "wrong column,
 * plausible name" failure mode: a syntactically valid filter on a real
 * column whose value domain never contained the literal at all (wrong
 * column, or a misspelled/mis-cased value). Runs a targeted existence check
 * per predicate and surfaces an advisory note -- never blocks, since a real
 * zero-result answer must still go through untouched.
 */
async function checkSuspiciousZeroResult(client: SqlConnector, sql: string): Promise<string | undefined> {
  const predicates = extractEqualityPredicates(sql, client.dialect).slice(0, MAX_LITERAL_CHECKS);
  if (predicates.length === 0) return undefined;

  const missing: { column: string; literal: string }[] = [];
  for (const p of predicates) {
    try {
      const exists = await client.valueExistsInColumn(undefined, p.table, p.column, p.literal);
      if (!exists) missing.push({ column: p.column, literal: p.literal });
    } catch {
      // Best-effort -- a failed check just means no signal, not an error for the user.
    }
  }
  if (missing.length === 0) return undefined;

  const parts = missing.map((m) => `${m.column} = '${m.literal}'`).join(", ");
  return `⚠ SUSPICIOUS ZERO: this query's result was empty, and the filter value(s) in (${parts}) don't appear anywhere in ` +
    `${missing.length === 1 ? "that column" : "those columns"} at all, under any casing. This may be the wrong column or a ` +
    `misspelled value -- double-check with sql_describe_table before treating this as a real zero.`;
}

export async function sql_execute_query(client: SqlConnector, args: Record<string, unknown>): Promise<McpToolResult> {
  const sql = String(args.sql ?? "");
  const maxRows = Math.min(Number(args.max_rows ?? 1000), 1000);
  if (!sql) return err("sql is required");
  try {
    const result = await client.executeQuery(sql, maxRows);
    const notes: string[] = [];
    if (result.truncated) {
      notes.push(
        `⚠ INCOMPLETE RESULT: only the first ${maxRows} rows are shown, there are more. ` +
        `Do not answer as if these rows are the whole answer -- add a WHERE filter, or use ` +
        `COUNT/SUM/AVG/etc. to get a complete aggregate instead of relying on the visible rows.`
      );
    }
    // Advisory only (never blocks the query) -- ScopedSqlConnector's
    // getExploredTables reflects what this session has actually described
    // or previewed, which a bare "table looks obviously named" guess skips.
    const explored = client.getExploredTables?.();
    if (explored) {
      const { tables, parsedOk } = extractReferencedTables(sql, client.dialect);
      const unexplored = parsedOk ? tables.filter((t) => !explored.has(t)) : [];
      if (unexplored.length > 0) {
        notes.push(
          `Note: this query references table(s) you haven't inspected yet this session (${unexplored.join(", ")}). ` +
          `If the results look unexpected, run sql_describe_table on them first -- column names/types and data-quality ` +
          `quirks (e.g. inconsistent casing in a status column) are easy to guess wrong.`
        );
      }
    }
    if (result.row_count === 0) {
      const suspiciousZeroNote = await checkSuspiciousZeroResult(client, sql);
      if (suspiciousZeroNote) notes.push(suspiciousZeroNote);
    }
    return ok({ ...result, note: notes.length > 0 ? notes.join(" ") : undefined });
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

// Text-ish columns beyond this count aren't profiled, to bound how many
// extra round-trips one describeTable call can trigger on a wide table.
const MAX_PROFILED_COLUMNS = 5;
const DISTINCT_SAMPLE_LIMIT = 21; // 20 shown + 1 to detect "more than 20 exist"

function looksTextual(dataType: unknown): boolean {
  return typeof dataType === "string" && /char|text/i.test(dataType);
}

function hasCaseVariants(values: string[]): boolean {
  const seen = new Map<string, string>(); // lowercased -> first original casing seen
  for (const v of values) {
    const key = v.toLowerCase();
    const prior = seen.get(key);
    if (prior !== undefined && prior !== v) return true;
    if (prior === undefined) seen.set(key, v);
  }
  return false;
}

/**
 * For the first few text-like columns, samples distinct values so
 * data-quality issues (case-variant duplicates like "MEDIUM"/"medium",
 * stray whitespace) are visible BEFORE an agent writes a query assuming
 * clean data -- found this the hard way live-testing a Data Agent against
 * production data, where a naive GROUP BY silently undercounted a category.
 */
async function profileTextColumns(
  client: SqlConnector, schema: string | undefined, table: string, columns: Record<string, unknown>[]
): Promise<Record<string, { distinct_values?: string[]; case_variants_detected?: boolean; high_cardinality?: boolean; profile_error?: string }>> {
  const candidates = columns.filter((c) => looksTextual(c.data_type)).slice(0, MAX_PROFILED_COLUMNS);
  const profile: Record<string, { distinct_values?: string[]; case_variants_detected?: boolean; high_cardinality?: boolean; profile_error?: string }> = {};

  await Promise.all(candidates.map(async (c) => {
    const columnName = String(c.column_name ?? "");
    if (!columnName) return;
    try {
      const values = await client.sampleDistinctValues(schema, table, columnName, DISTINCT_SAMPLE_LIMIT);
      if (values.length >= DISTINCT_SAMPLE_LIMIT) {
        profile[columnName] = { high_cardinality: true };
      } else {
        profile[columnName] = { distinct_values: values, case_variants_detected: hasCaseVariants(values) };
      }
    } catch (e: any) {
      profile[columnName] = { profile_error: e.message };
    }
  }));

  return profile;
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
    const columnProfile = columns?.rows ? await profileTextColumns(client, schema, table, columns.rows) : {};

    return ok({
      schema,
      table,
      columns: columns?.rows ?? [],
      columns_meta: columns ? { row_count: columns.row_count } : null,
      // Keyed by column_name; only present for columns cheap enough to profile.
      // case_variants_detected: true is a strong signal to normalize (LOWER/
      // TRIM) before GROUP BY/WHERE, not just cite the raw distinct values.
      column_data_quality: columnProfile,
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
