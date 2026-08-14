/**
 * Generic MCP server + router shared by every relational-DB connector.
 * A dialect's mcp-server.ts (e.g. server/integrations/sql/postgres/
 * mcp-server.ts) only needs to supply integrationId, a display label, and a
 * buildConnector(credentials) factory -- tool wiring, credential handling
 * (via RealMcpBase), and the Express router are all here once.
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { getOrgId, getDefaultOrgId } from "../../auth";
import type { SqlConnector, SqlCredentials } from "./types";
import { getOrCreateSession, evictSession } from "./session-cache";
import { ScopedSqlConnector, parseAllowedTables } from "./scoped-connector";
import { explainConnectionError } from "./friendly-errors";
import {
  sql_execute_query,
  sql_list_schemas,
  sql_list_tables,
  sql_describe_table,
  sql_search_tables,
  sql_get_column_stats,
  sql_preview_table,
} from "./tools";

export function buildSqlToolDefs(dialectLabel: string): RealMcpToolDef[] {
  return [
    {
      name: "sql_execute_query",
      description: `Execute a read-only SQL SELECT query against the connected ${dialectLabel} database and return structured rows with column types. DDL/DML statements are blocked. Results are truncated at 1,000 rows — use LIMIT and WHERE filters. This connection may be scoped to a fixed set of tables (governance); a query outside that set is rejected, not silently filtered. Prefer running sql_describe_table on any table you haven't already inspected this session before querying it — text columns often have data-quality issues (inconsistent casing, stray whitespace) that a blind query will get wrong.`,
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Read-only SQL SELECT statement (required)" },
          max_rows: { type: "number", description: "Maximum rows to return (default 1000, max 1000)" },
        },
        required: ["sql"],
      },
    },
    {
      name: "sql_list_schemas",
      description: `Enumerate all accessible schemas in the connected ${dialectLabel} database.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "sql_list_tables",
      description: `List tables and views in a given ${dialectLabel} schema.`,
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Schema name (omit to use the database's default schema — e.g. 'public' for Postgres, 'dbo' for SQL Server, or the connected database itself for MySQL)" },
        },
      },
    },
    {
      name: "sql_describe_table",
      description: `Full column-level schema for a ${dialectLabel} table (names, types, nullable, defaults) plus a 5-row sample. Also profiles the first few text columns' actual distinct values (column_data_quality in the response) -- check case_variants_detected before writing a GROUP BY/WHERE on that column, since e.g. "MEDIUM" and "medium" being counted separately is a real, easy-to-miss mistake.`,
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Schema name (omit to use the database's default schema — e.g. 'public' for Postgres, 'dbo' for SQL Server, or the connected database itself for MySQL)" },
          table: { type: "string", description: "Table or view name (required)" },
        },
        required: ["table"],
      },
    },
    {
      name: "sql_search_tables",
      description: `Fuzzy-search for table names matching a keyword across all accessible schemas in the ${dialectLabel} database.`,
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against table names (required)" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "sql_get_column_stats",
      description: "Compute basic statistics for a column: row count, null count/percentage, min, max, and average (when numeric).",
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Schema name (omit to use the database's default schema — e.g. 'public' for Postgres, 'dbo' for SQL Server, or the connected database itself for MySQL)" },
          table: { type: "string", description: "Table name (required)" },
          column: { type: "string", description: "Column name (required)" },
        },
        required: ["table", "column"],
      },
    },
    {
      name: "sql_preview_table",
      description: "Return the first N rows of a table for agent orientation (default 20, max 50).",
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Schema name (omit to use the database's default schema — e.g. 'public' for Postgres, 'dbo' for SQL Server, or the connected database itself for MySQL)" },
          table: { type: "string", description: "Table name (required)" },
          limit: { type: "number", description: "Rows to preview (default 20, max 50)" },
        },
        required: ["table"],
      },
    },
  ];
}

export abstract class SqlMcpServerBase extends RealMcpBase {
  protected abstract readonly dialectLabel: string;
  protected abstract buildConnector(credentials: Record<string, string>): SqlConnector;

  /**
   * Reuses a connector (and, for ssh_tunnel/relay_agent modes, its tunnel)
   * across calls instead of opening and tearing one down every time --
   * see session-cache.ts for why. The ScopedSqlConnector wrapper (built
   * when the connection has an allowed-tables list) is constructed INSIDE
   * the cached build() closure, not per call: its exploredTables tracking
   * needs to persist across calls in the same session for the "you haven't
   * inspected this table yet" advisory nudge to ever actually go quiet --
   * rebuilding the wrapper per call (an earlier version of this code) reset
   * exploredTables every time, so the nudge fired on literally every query
   * forever, never converging. allowedTables is part of `credentials`, so
   * it's already folded into the session-cache key -- a changed allowlist
   * naturally builds a new wrapper rather than reusing a stale one.
   */
  private getClient(integrationId: string, orgId: string, credentials: SqlCredentials): SqlConnector {
    return getOrCreateSession(integrationId, orgId, credentials, () => {
      const raw = this.buildConnector(credentials as Record<string, string>);
      const allowedTables = parseAllowedTables(credentials.allowedTables);
      return allowedTables ? new ScopedSqlConnector(raw, allowedTables) : raw;
    });
  }

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    let client: SqlConnector;
    try {
      client = this.getClient(this.integrationId, orgId, credentials);
    } catch (e: any) {
      return this.err(e.message);
    }

    try {
      switch (toolName) {
        case "sql_execute_query":     return await sql_execute_query(client, args);
        case "sql_list_schemas":      return await sql_list_schemas(client);
        case "sql_list_tables":       return await sql_list_tables(client, args);
        case "sql_describe_table":    return await sql_describe_table(client, args);
        case "sql_search_tables":     return await sql_search_tables(client, args);
        case "sql_get_column_stats":  return await sql_get_column_stats(client, args);
        case "sql_preview_table":     return await sql_preview_table(client, args);
        default: return this.err(`Unknown ${this.dialectLabel} tool: ${toolName}`);
      }
    } catch (e: any) {
      // The cached connector may be poisoned (dead pool, dropped tunnel) --
      // evict it so the next call builds a fresh one instead of failing
      // repeatedly until the idle sweep happens to catch it.
      evictSession(this.integrationId, orgId, credentials as SqlCredentials);
      return this.err(e?.message ?? "Unknown error");
    }
  }

  /**
   * Used by /connection-test instead of the generic tool-dispatch path so
   * the response can surface a tunnel's host-key fingerprint (ssh_tunnel
   * mode) even on failure -- e.g. a fingerprint mismatch needs to show the
   * NEW fingerprint so the user can decide whether to trust and re-pin it.
   */
  async testConnection(credentials: Record<string, string>, orgId: string): Promise<{ ok: boolean; error?: string; friendlyError?: string; hostFingerprint?: string }> {
    let client: SqlConnector;
    try {
      client = this.getClient(this.integrationId, orgId, credentials);
    } catch (e: any) {
      return { ok: false, error: e.message, friendlyError: explainConnectionError(e.message) };
    }
    try {
      await client.executeQuery("SELECT 1 AS ok", 1);
      return { ok: true, hostFingerprint: client.getTunnelFingerprint?.() };
    } catch (e: any) {
      evictSession(this.integrationId, orgId, credentials as SqlCredentials);
      return { ok: false, error: e.message, friendlyError: explainConnectionError(e.message), hostFingerprint: client.getTunnelFingerprint?.() };
    }
  }
}

export function createSqlRouter(server: SqlMcpServerBase, integrationId: string): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: integrationId, tools: server.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: server.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const toolName = String(req.params.toolName);
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) return res.status(400).json({ error: "No organization context available." });
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await server.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) return res.json({ connected: false, error: "No organization context available." });
    const credentials = await server.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured. Connect this database via the Integrations settings." });
    }
    const result = await server.testConnection(credentials, orgId);
    if (!result.ok) {
      return res.json({
        connected: false, integration: integrationId,
        error: result.error ?? "Connection test failed",
        friendlyError: result.friendlyError,
        hostFingerprint: result.hostFingerprint,
      });
    }
    res.json({ connected: true, integration: integrationId, hostFingerprint: result.hostFingerprint });
  });

  return router;
}
