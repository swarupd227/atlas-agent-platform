/**
 * Databricks MCP Server — 9 read-only tools using the SQL Statement Execution API
 * (v2.0) and Unity Catalog API (v2.1). Mirrors server/integrations/snowflake/mcp-server.ts's
 * shape exactly; see that file's header for the family pattern.
 * Auth: Personal Access Token (PAT), Bearer, stored in the Atlas credential vault.
 * Mounted at /api/integrations/databricks
 * Read-only enforcement: guardReadOnly() blocks all DDL/DML/maintenance verbs before any
 * network call reaches the workspace.
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { DatabricksClient, type DatabricksCredentials } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  db_execute_query,
  db_list_catalogs,
  db_list_schemas,
  db_list_tables,
  db_describe_table,
  db_preview_table,
  db_search_tables,
  db_get_column_stats,
  db_list_jobs,
} from "./tools";

export class DatabricksMcpServer extends RealMcpBase {
  readonly integrationId = "databricks";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "db_execute_query",
      description: "Execute a read-only SQL SELECT query against a Databricks SQL warehouse and return structured rows with column types. DDL/DML/maintenance statements are blocked. Results are truncated at 1,000 rows — use LIMIT and WHERE filters.",
      inputSchema: {
        type: "object",
        properties: {
          sql:      { type: "string", description: "Read-only SQL SELECT statement (required)" },
          max_rows: { type: "number", description: "Maximum rows to return (default 1000, max 1000)" },
        },
        required: ["sql"],
      },
    },
    {
      name: "db_list_catalogs",
      description: "List all Unity Catalog catalogs accessible in this Databricks workspace.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "db_list_schemas",
      description: "List schemas within a Unity Catalog catalog.",
      inputSchema: {
        type: "object",
        properties: {
          catalog: { type: "string", description: "Catalog name (required)" },
        },
        required: ["catalog"],
      },
    },
    {
      name: "db_list_tables",
      description: "List tables and views in a given catalog and schema, with table type and storage format.",
      inputSchema: {
        type: "object",
        properties: {
          catalog: { type: "string", description: "Catalog name (required)" },
          schema:  { type: "string", description: "Schema name (required)" },
        },
        required: ["catalog", "schema"],
      },
    },
    {
      name: "db_describe_table",
      description: "Full column-level schema for a table (from Unity Catalog metadata) plus a 5-row sample.",
      inputSchema: {
        type: "object",
        properties: {
          catalog: { type: "string", description: "Catalog name (required)" },
          schema:  { type: "string", description: "Schema name (required)" },
          table:   { type: "string", description: "Table name (required)" },
        },
        required: ["catalog", "schema", "table"],
      },
    },
    {
      name: "db_preview_table",
      description: "Return the first N rows of a Databricks table for agent orientation (default 20, max 50).",
      inputSchema: {
        type: "object",
        properties: {
          catalog: { type: "string", description: "Catalog name (required)" },
          schema:  { type: "string", description: "Schema name (required)" },
          table:   { type: "string", description: "Table name (required)" },
          limit:   { type: "number", description: "Rows to preview (default 20, max 50)" },
        },
        required: ["catalog", "schema", "table"],
      },
    },
    {
      name: "db_search_tables",
      description: "Fuzzy-search for table names matching a keyword, optionally scoped to one catalog (else searched workspace-wide via system.information_schema).",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against table names (required)" },
          catalog: { type: "string", description: "Optional catalog to scope the search to" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "db_get_column_stats",
      description: "Compute basic statistics for a column: min, max, avg, null count, and null percentage.",
      inputSchema: {
        type: "object",
        properties: {
          catalog: { type: "string", description: "Catalog name (required)" },
          schema:  { type: "string", description: "Schema name (required)" },
          table:   { type: "string", description: "Table name (required)" },
          column:  { type: "string", description: "Column name (required)" },
        },
        required: ["catalog", "schema", "table", "column"],
      },
    },
    {
      name: "db_list_jobs",
      description: "List Databricks Jobs (workflows) in this workspace: name, creator, schedule. Read-only — does not trigger or modify any job.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of jobs to return (default 20, max 100)" },
        },
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const host = credentials.host;
    if (!host) return this.err("Databricks workspace URL is not configured. Connect your Databricks workspace via the Integrations settings.");

    const creds: DatabricksCredentials = {
      host,
      token: credentials.token ?? "",
      warehouse_id: credentials.warehouse_id ?? "",
      catalog: credentials.catalog,
      schema: credentials.schema,
    };

    const fetcher = (url: string, options?: RequestInit) =>
      this.fetchWithAuth(url, { ...options, orgId, timeoutMs: 60_000 });

    const client = new DatabricksClient(creds, fetcher);

    switch (toolName) {
      case "db_execute_query":    return db_execute_query(client, args);
      case "db_list_catalogs":    return db_list_catalogs(client, args);
      case "db_list_schemas":     return db_list_schemas(client, args);
      case "db_list_tables":      return db_list_tables(client, args);
      case "db_describe_table":   return db_describe_table(client, args);
      case "db_preview_table":    return db_preview_table(client, args);
      case "db_search_tables":    return db_search_tables(client, args);
      case "db_get_column_stats": return db_get_column_stats(client, args);
      case "db_list_jobs":        return db_list_jobs(client, args);
      default: return this.err(`Unknown Databricks tool: ${toolName}`);
    }
  }
}

export const databricksMcpServer = new DatabricksMcpServer();

export function createDatabricksRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "databricks", tools: databricksMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: databricksMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await databricksMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await databricksMcpServer.getCredentials(orgId);
    if (!credentials?.host) {
      return res.json({ connected: false, error: "No credentials configured. Provide the workspace host, a Personal Access Token, and a SQL warehouse_id." });
    }
    try {
      const creds: DatabricksCredentials = {
        host: credentials.host,
        token: credentials.token ?? "",
        warehouse_id: credentials.warehouse_id ?? "",
        catalog: credentials.catalog,
        schema: credentials.schema,
      };
      const fetcher = (url: string, options?: RequestInit) =>
        databricksMcpServer["fetchWithAuth"](url, { ...options, orgId, timeoutMs: 15_000 });
      const client = new DatabricksClient(creds, fetcher);
      const result = await client.executeQuery("SELECT current_user() AS user, current_catalog() AS catalog, current_schema() AS schema_name");
      res.json({
        connected: true,
        integration: "databricks",
        context: result.rows?.[0] ?? {},
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
