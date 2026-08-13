/**
 * PostgreSQL connector client. One TCP connection per tool call (opened
 * lazily, closed by the caller via close()) -- mirrors the stateless,
 * per-call construction Snowflake's connector already uses
 * (server/integrations/snowflake/mcp-server.ts constructs a fresh
 * SnowflakeClient per handleTool call), rather than introducing a
 * long-lived pool-per-credential-set to manage. A future optimization if
 * connection latency becomes a real cost; not needed for Phase 1.
 *
 * Schema/table filter VALUES are passed as bound parameters ($1, $2, ...)
 * wherever the driver allows it. Only true SQL identifiers (things that
 * must appear as `"schema"."table"` in the query text, which can't be
 * parameterized) go through assertSafeIdentifier first.
 */

import { Client, type QueryResult } from "pg";
import { guardReadOnly, assertSafeIdentifier, truncate } from "../shared";
import { resolveConnectionTarget, type Tunnel } from "../tunnel";
import type { SqlConnector, SqlCredentials, SqlResult, SqlColumn } from "../types";

const STATEMENT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

// Common OIDs -> friendly type names (subset of pg's internal pg-types
// registry, inverted). Falls back to the raw OID for anything uncommon.
const OID_TYPE_NAMES: Record<number, string> = {
  16: "bool", 20: "int8", 21: "int2", 23: "int4", 25: "text", 700: "float4",
  701: "float8", 1042: "bpchar", 1043: "varchar", 1082: "date", 1114: "timestamp",
  1184: "timestamptz", 1700: "numeric", 2950: "uuid", 3802: "jsonb", 114: "json",
  1000: "bool[]", 1005: "int2[]", 1007: "int4[]", 1009: "text[]",
};

function columnsFromResult(res: QueryResult): SqlColumn[] {
  return (res.fields ?? []).map(f => ({ name: f.name, type: OID_TYPE_NAMES[f.dataTypeID] ?? String(f.dataTypeID) }));
}

function buildSsl(mode: string | undefined): boolean | { rejectUnauthorized: boolean } {
  if (!mode || mode === "disable") return false;
  if (mode === "verify-full") return { rejectUnauthorized: true };
  return { rejectUnauthorized: false }; // "require" / "prefer"
}

export class PostgresClient implements SqlConnector {
  readonly dialect = "postgres";
  private clientPromise: Promise<Client> | null = null;
  private tunnel: Tunnel | null = null;

  constructor(private readonly creds: SqlCredentials) {
    if (!creds.host) throw new Error("PostgreSQL host is not configured. Connect via the Integrations settings.");
    if (!creds.database) throw new Error("PostgreSQL database name is not configured.");
    if (!creds.user) throw new Error("PostgreSQL user is not configured.");
  }

  private async getClient(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const target = await resolveConnectionTarget(this.creds, 5432);
        this.tunnel = target.tunnel;
        const client = new Client({
          host: target.host,
          port: target.port,
          database: this.creds.database,
          user: this.creds.user,
          password: this.creds.password,
          // A tunnel terminates in plaintext on our side (127.0.0.1) --
          // the SSH channel itself is already the encrypted transport, so
          // TLS-to-the-DB is neither necessary nor (usually) configured to
          // accept connections from an unexpected local port.
          ssl: target.tunnel ? false : buildSsl(this.creds.ssl),
          statement_timeout: STATEMENT_TIMEOUT_MS,
          query_timeout: STATEMENT_TIMEOUT_MS + 5_000,
          connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        });
        await client.connect();
        return client;
      })();
    }
    return this.clientPromise;
  }

  getTunnelFingerprint(): string | undefined {
    return this.tunnel?.hostFingerprint;
  }

  private async query(sql: string, params?: unknown[]): Promise<SqlResult> {
    const start = Date.now();
    const client = await this.getClient();
    const res = await client.query(sql, params);
    return {
      rows: res.rows,
      columns: columnsFromResult(res),
      row_count: res.rows.length,
      truncated: false,
      elapsed_ms: Date.now() - start,
    };
  }

  async executeQuery(sql: string, maxRows = 1000): Promise<SqlResult> {
    guardReadOnly(sql);
    const result = await this.query(sql);
    const { rows, truncated } = truncate(result.rows, maxRows);
    return { ...result, rows, truncated };
  }

  async listSchemas(): Promise<SqlResult> {
    return this.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema') ORDER BY schema_name`
    );
  }

  async listTables(schema: string | undefined = "public"): Promise<SqlResult> {
    return this.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [schema]
    );
  }

  async describeTable(schema: string | undefined = "public", table: string): Promise<SqlResult> {
    return this.query(
      `SELECT column_name, data_type, character_maximum_length, numeric_precision, is_nullable, column_default, ordinal_position
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table]
    );
  }

  async searchTables(keyword: string): Promise<SqlResult> {
    return this.query(
      `SELECT table_schema, table_name, table_type FROM information_schema.tables
       WHERE table_name ILIKE $1 AND table_schema NOT IN ('pg_catalog','information_schema')
       ORDER BY table_schema, table_name LIMIT 50`,
      [`%${keyword}%`]
    );
  }

  async getColumnStats(schema: string | undefined = "public", table: string, column: string): Promise<SqlResult> {
    const qualified = `"${assertSafeIdentifier(schema, "schema")}"."${assertSafeIdentifier(table, "table")}"`;
    const col = `"${assertSafeIdentifier(column, "column")}"`;

    const base = await this.query(
      `SELECT COUNT(*) AS total_rows, COUNT(${col}) AS non_null_count,
       (COUNT(*) - COUNT(${col})) AS null_count,
       ROUND(100.0 * (COUNT(*) - COUNT(${col})) / NULLIF(COUNT(*), 0), 2) AS null_pct,
       MIN(${col}::text) AS min_val, MAX(${col}::text) AS max_val
       FROM ${qualified}`
    );

    let avg_val: unknown = null;
    try {
      const avgResult = await this.query(`SELECT AVG(${col}) AS avg_val FROM ${qualified}`);
      avg_val = avgResult.rows[0]?.avg_val ?? null;
    } catch {
      // Non-numeric column -- average isn't meaningful, leave null.
    }

    return { ...base, rows: base.rows.map(r => ({ ...r, avg_val })) };
  }

  async previewTable(schema: string | undefined = "public", table: string, limit = 20): Promise<SqlResult> {
    const qualified = `"${assertSafeIdentifier(schema, "schema")}"."${assertSafeIdentifier(table, "table")}"`;
    return this.query(`SELECT * FROM ${qualified} LIMIT ${Math.min(Math.max(limit, 1), 50)}`);
  }

  async close(): Promise<void> {
    if (this.clientPromise) {
      const client = await this.clientPromise;
      await client.end();
    }
    await this.tunnel?.close();
  }
}
