/**
 * Shared abstraction for relational-database connectors (Postgres, MySQL,
 * SQL Server, ...). Mirrors llm-provider.ts's multi-provider pattern:
 * one capability interface, one client class per dialect, a generic
 * tools.ts/mcp-server.ts that only ever talks to the interface.
 *
 * Deliberately narrower than Snowflake's own client (server/integrations/
 * snowflake/client.ts): these dialects connect to ONE database per
 * connection (no cross-database fully-qualified queries the way
 * Snowflake's REST API allows), so "database" is a connection-time
 * credential, not a per-call parameter -- callers address schema.table,
 * not database.schema.table. Snowflake's own connector is intentionally
 * left as-is; this is a parallel abstraction for the three new dialects,
 * not a refactor of Snowflake onto a shared interface.
 */

export interface SqlColumn {
  name: string;
  type: string;
}

export interface SqlResult {
  rows: Record<string, unknown>[];
  columns: SqlColumn[];
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
  query_id?: string;
}

/**
 * Generic connection credentials. Every field is optional at the type
 * level because the vault stores an untyped string map (see
 * credential-vault.ts) -- each client validates the fields it actually
 * needs and throws a clear error if one is missing.
 */
export interface SqlCredentials {
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  password?: string;
  /** "require" | "disable" | "prefer" | "verify-full" -- Postgres-style values; MySQL/SQL Server clients interpret "require"/"disable" only. */
  ssl?: string;

  /** "direct" (default) | "ssh_tunnel" | "relay_agent" -- how the client reaches `host`. */
  connectionMode?: string;

  // ── ssh_tunnel mode ────────────────────────────────────────────────────
  sshHost?: string;
  sshPort?: string;
  sshUsername?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  sshPassword?: string;
  /** TOFU-pinned fingerprint from a prior connection; a mismatch on reconnect fails closed. */
  sshHostKeyFingerprint?: string;

  // ── relay_agent mode (Phase 3) ─────────────────────────────────────────
  relayAgentId?: string;

  /**
   * Comma-separated table names this connection is scoped to (case-
   * insensitive, unqualified). Empty/unset = no restriction. Enforced by
   * ScopedSqlConnector, not by the dialect clients themselves.
   */
  allowedTables?: string;
}

export interface SqlConnector {
  readonly dialect: string;

  executeQuery(sql: string, maxRows?: number): Promise<SqlResult>;
  listSchemas(): Promise<SqlResult>;
  /**
   * `schema` is optional and dialect-defaulted: Postgres defaults to
   * "public", MySQL/MariaDB default to the connected database (MySQL has
   * no separate "schema" concept), SQL Server defaults to "dbo".
   */
  listTables(schema?: string): Promise<SqlResult>;
  describeTable(schema: string | undefined, table: string): Promise<SqlResult>;
  searchTables(keyword: string): Promise<SqlResult>;
  getColumnStats(schema: string | undefined, table: string, column: string): Promise<SqlResult>;
  previewTable(schema: string | undefined, table: string, limit?: number): Promise<SqlResult>;

  /**
   * Up to `limit` distinct values of `column`, sampled from at most the
   * first few thousand rows (bounded cost regardless of table size) --
   * used to surface data-quality issues like case-variant duplicates
   * ("MEDIUM" vs "medium") before an agent builds a query around them.
   */
  sampleDistinctValues(schema: string | undefined, table: string, column: string, limit: number): Promise<string[]>;

  /** Release the underlying connection/pool (and any tunnel it opened). Always call in a finally block. */
  close(): Promise<void>;

  /** Set once a tunnel (ssh_tunnel/relay_agent mode) has connected. Undefined in direct mode. */
  getTunnelFingerprint?(): string | undefined;

  /**
   * Tables this connector has described or previewed so far (session-
   * scoped -- see session-cache.ts). Only ScopedSqlConnector implements
   * this; a raw dialect client doesn't track it.
   */
  getExploredTables?(): Set<string>;
}
