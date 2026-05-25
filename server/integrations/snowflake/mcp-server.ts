/**
 * Snowflake MCP Server — 9 read-only tools using the Snowflake SQL REST API v2.
 * Auth: JWT key-pair (RSA) or username+password stored in Atlas credential vault.
 * Mounted at /api/integrations/snowflake
 * Read-only enforcement: guardReadOnly() blocks all DDL/DML before any network call.
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { SnowflakeClient, type SnowflakeCredentials } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  sf_execute_query,
  sf_execute_warehouse_query,
  sf_list_databases,
  sf_list_tables,
  sf_describe_table,
  sf_get_query_history,
  sf_search_tables,
  sf_get_column_stats,
  sf_preview_table,
} from "./tools";

export class SnowflakeMcpServer extends RealMcpBase {
  readonly integrationId = "snowflake";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "sf_execute_query",
      description: "Execute a read-only SQL SELECT query against Snowflake and return structured rows with column types. DDL/DML statements are blocked. Results are truncated at 1,000 rows — use LIMIT and WHERE filters.",
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
      name: "sf_list_databases",
      description: "Enumerate all accessible Snowflake databases and schemas in the account.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "sf_list_tables",
      description: "List tables and views in a given Snowflake database and schema with row counts.",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name (required)" },
          schema:   { type: "string", description: "Schema name (default: PUBLIC)" },
        },
        required: ["database"],
      },
    },
    {
      name: "sf_describe_table",
      description: "Full column-level schema for a Snowflake table: column names, data types, nullable, and default values.",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name (required)" },
          schema:   { type: "string", description: "Schema name (default: PUBLIC)" },
          table:    { type: "string", description: "Table or view name (required)" },
        },
        required: ["database", "table"],
      },
    },
    {
      name: "sf_get_query_history",
      description: "Recent query history for the Snowflake warehouse: query text, status, elapsed time, bytes scanned, and user.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of queries to return (default 20, max 100)" },
        },
      },
    },
    {
      name: "sf_execute_warehouse_query",
      description: "Execute a read-only SQL SELECT targeting the configured named virtual warehouse. Identical to sf_execute_query but semantically scoped to warehouse-level compute.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Read-only SQL SELECT statement (required)" },
        },
        required: ["sql"],
      },
    },
    {
      name: "sf_search_tables",
      description: "Fuzzy-search for table names matching a keyword across all accessible Snowflake databases.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against table names (required)" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "sf_get_column_stats",
      description: "Compute basic statistics for a numeric column: min, max, avg, null count, and null percentage.",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name (required)" },
          schema:   { type: "string", description: "Schema name (default: PUBLIC)" },
          table:    { type: "string", description: "Table name (required)" },
          column:   { type: "string", description: "Column name (required)" },
        },
        required: ["database", "table", "column"],
      },
    },
    {
      name: "sf_preview_table",
      description: "Return the first N rows of a Snowflake table for agent orientation (default 20, max 50).",
      inputSchema: {
        type: "object",
        properties: {
          database: { type: "string", description: "Database name (required)" },
          schema:   { type: "string", description: "Schema name (default: PUBLIC)" },
          table:    { type: "string", description: "Table name (required)" },
          limit:    { type: "number", description: "Rows to preview (default 20, max 50)" },
        },
        required: ["database", "table"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const account = credentials.account;
    if (!account) return this.err("Snowflake account identifier is not configured. Connect your Snowflake account via the Integrations settings.");

    const creds: SnowflakeCredentials = {
      account,
      username:     credentials.username ?? "",
      private_key:  credentials.private_key,
      password:     credentials.password,
      access_token: credentials.access_token,
      warehouse:    credentials.warehouse,
      database:     credentials.database,
      role:         credentials.role,
    };

    const fetcher = (url: string, options?: RequestInit) =>
      this.fetchWithAuth(url, { ...options, orgId, timeoutMs: 60_000 });

    const client = new SnowflakeClient(creds, fetcher);

    switch (toolName) {
      case "sf_execute_query":          return sf_execute_query(client, args);
      case "sf_execute_warehouse_query":return sf_execute_warehouse_query(client, args);
      case "sf_list_databases":         return sf_list_databases(client, args);
      case "sf_list_tables":            return sf_list_tables(client, args);
      case "sf_describe_table":         return sf_describe_table(client, args);
      case "sf_get_query_history":      return sf_get_query_history(client, args);
      case "sf_search_tables":          return sf_search_tables(client, args);
      case "sf_get_column_stats":       return sf_get_column_stats(client, args);
      case "sf_preview_table":          return sf_preview_table(client, args);
      default: return this.err(`Unknown Snowflake tool: ${toolName}`);
    }
  }
}

export const snowflakeMcpServer = new SnowflakeMcpServer();

export function createSnowflakeRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "snowflake", tools: snowflakeMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: snowflakeMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await snowflakeMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await snowflakeMcpServer.getCredentials(orgId);
    if (!credentials?.account) {
      return res.json({ connected: false, error: "No credentials configured. Provide account, username, and password (or access_token)." });
    }
    try {
      const creds: SnowflakeCredentials = {
        account: credentials.account,
        username: credentials.username ?? "",
        password: credentials.password,
        access_token: credentials.access_token,
        warehouse: credentials.warehouse,
      };
      const fetcher = (url: string, options?: RequestInit) =>
        snowflakeMcpServer["fetchWithAuth"](url, { ...options, orgId, timeoutMs: 15_000 });
      const client = new SnowflakeClient(creds, fetcher);
      const result = await client.executeQuery("SELECT CURRENT_USER() AS user, CURRENT_WAREHOUSE() AS warehouse, CURRENT_DATABASE() AS database, CURRENT_ROLE() AS role");
      res.json({
        connected: true,
        integration: "snowflake",
        context: result.rows?.[0] ?? {},
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
