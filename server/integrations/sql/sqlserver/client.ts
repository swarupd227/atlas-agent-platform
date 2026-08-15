/**
 * SQL Server connector client (via `mssql`/Tedious). One ConnectionPool
 * per tool call, closed by the caller -- same lifecycle convention as the
 * Postgres and MySQL clients in this directory. Uses an explicit
 * `new sql.ConnectionPool(...)` rather than the package's global
 * `sql.connect()` singleton, since the singleton is shared/mutated process-
 * wide and would break isolation between concurrent calls using different
 * credentials.
 *
 * Default schema is "dbo" (SQL Server's default), not Postgres's "public".
 * Parameters are bound via named @-params (mssql's convention), not
 * positional placeholders.
 */

import sql from "mssql";
import { guardReadOnly, assertSafeIdentifier, truncate } from "../shared";
import { resolveConnectionTarget, type Tunnel } from "../tunnel";
import type { SqlConnector, SqlCredentials, SqlResult, SqlColumn } from "../types";

const STATEMENT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const SYSTEM_SCHEMAS = ["sys", "INFORMATION_SCHEMA", "guest", "db_owner", "db_accessadmin", "db_securityadmin", "db_ddladmin", "db_backupoperator", "db_datareader", "db_datawriter", "db_denydatareader", "db_denydatawriter"];

function columnsFromRecordset(recordset: sql.IRecordSet<any> | undefined): SqlColumn[] {
  if (!recordset?.columns) return [];
  return Object.values(recordset.columns).map((c: any) => ({ name: c.name, type: c.type?.declaration ?? String(c.type) }));
}

function buildOptions(mode: string | undefined): { encrypt: boolean; trustServerCertificate: boolean } {
  if (!mode || mode === "disable") return { encrypt: false, trustServerCertificate: true };
  if (mode === "verify-full") return { encrypt: true, trustServerCertificate: false };
  return { encrypt: true, trustServerCertificate: true }; // "require" / "prefer"
}

export class SqlServerClient implements SqlConnector {
  readonly dialect = "sqlserver";
  private poolPromise: Promise<sql.ConnectionPool> | null = null;
  private tunnel: Tunnel | null = null;

  constructor(private readonly creds: SqlCredentials) {
    if (!creds.host) throw new Error("SQL Server host is not configured. Connect via the Integrations settings.");
    if (!creds.database) throw new Error("SQL Server database name is not configured.");
    if (!creds.user) throw new Error("SQL Server user is not configured.");
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const target = await resolveConnectionTarget(this.creds, 1433);
        this.tunnel = target.tunnel;
        const pool = new sql.ConnectionPool({
          server: target.host,
          port: target.port,
          database: this.creds.database,
          user: this.creds.user,
          password: this.creds.password,
          // See PostgresClient's getClient() for why TLS is skipped when tunneled.
          options: target.tunnel ? { encrypt: false, trustServerCertificate: true } : buildOptions(this.creds.ssl),
          connectionTimeout: CONNECT_TIMEOUT_MS,
          requestTimeout: STATEMENT_TIMEOUT_MS,
        });
        await pool.connect();
        return pool;
      })();
    }
    return this.poolPromise;
  }

  getTunnelFingerprint(): string | undefined {
    return this.tunnel?.hostFingerprint;
  }

  private async query(sqlText: string, params?: Record<string, unknown>): Promise<SqlResult> {
    const start = Date.now();
    const pool = await this.getPool();
    const request = pool.request();
    for (const [key, value] of Object.entries(params ?? {})) {
      request.input(key, value);
    }
    const result = await request.query(sqlText);
    const rows = result.recordset ?? [];
    return {
      rows,
      columns: columnsFromRecordset(result.recordset),
      row_count: rows.length,
      truncated: false,
      elapsed_ms: Date.now() - start,
    };
  }

  async executeQuery(sqlText: string, maxRows = 1000): Promise<SqlResult> {
    guardReadOnly(sqlText);
    const result = await this.query(sqlText);
    const { rows, truncated } = truncate(result.rows, maxRows);
    return { ...result, rows, truncated };
  }

  async listSchemas(): Promise<SqlResult> {
    const placeholders = SYSTEM_SCHEMAS.map((_, i) => `@s${i}`).join(", ");
    const params = Object.fromEntries(SYSTEM_SCHEMAS.map((s, i) => [`s${i}`, s]));
    return this.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (${placeholders}) ORDER BY schema_name`,
      params
    );
  }

  async listTables(schema = "dbo"): Promise<SqlResult> {
    return this.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = @schema ORDER BY table_name`,
      { schema }
    );
  }

  async describeTable(schema: string | undefined = "dbo", table: string): Promise<SqlResult> {
    return this.query(
      `SELECT column_name, data_type, character_maximum_length, numeric_precision, is_nullable, column_default, ordinal_position
       FROM information_schema.columns WHERE table_schema = @schema AND table_name = @table ORDER BY ordinal_position`,
      { schema, table }
    );
  }

  async searchTables(keyword: string): Promise<SqlResult> {
    const placeholders = SYSTEM_SCHEMAS.map((_, i) => `@s${i}`).join(", ");
    const params: Record<string, unknown> = { kw: `%${keyword}%`, ...Object.fromEntries(SYSTEM_SCHEMAS.map((s, i) => [`s${i}`, s])) };
    return this.query(
      `SELECT TOP 50 table_schema, table_name, table_type FROM information_schema.tables
       WHERE table_name LIKE @kw AND table_schema NOT IN (${placeholders})
       ORDER BY table_schema, table_name`,
      params
    );
  }

  async getColumnStats(schema: string | undefined = "dbo", table: string, column: string): Promise<SqlResult> {
    const qualified = `[${assertSafeIdentifier(schema, "schema")}].[${assertSafeIdentifier(table, "table")}]`;
    const col = `[${assertSafeIdentifier(column, "column")}]`;

    const base = await this.query(
      `SELECT COUNT(*) AS total_rows, COUNT(${col}) AS non_null_count,
       (COUNT(*) - COUNT(${col})) AS null_count,
       ROUND(100.0 * (COUNT(*) - COUNT(${col})) / NULLIF(COUNT(*), 0), 2) AS null_pct,
       CAST(MIN(${col}) AS NVARCHAR(4000)) AS min_val, CAST(MAX(${col}) AS NVARCHAR(4000)) AS max_val
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

  async previewTable(schema: string | undefined = "dbo", table: string, limit = 20): Promise<SqlResult> {
    const qualified = `[${assertSafeIdentifier(schema, "schema")}].[${assertSafeIdentifier(table, "table")}]`;
    return this.query(`SELECT TOP (${Math.min(Math.max(limit, 1), 50)}) * FROM ${qualified}`);
  }

  async sampleDistinctValues(schema: string | undefined = "dbo", table: string, column: string, limit: number): Promise<string[]> {
    const qualified = `[${assertSafeIdentifier(schema, "schema")}].[${assertSafeIdentifier(table, "table")}]`;
    const col = `[${assertSafeIdentifier(column, "column")}]`;
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.query(
      `SELECT DISTINCT TOP (@lim) CAST(${col} AS NVARCHAR(4000)) AS v
       FROM (SELECT TOP (5000) ${col} FROM ${qualified}) AS sub`,
      { lim: boundedLimit }
    );
    return result.rows.map(r => String(r.v));
  }

  async valueExistsInColumn(schema: string | undefined = "dbo", table: string, column: string, literal: string): Promise<boolean> {
    const qualified = `[${assertSafeIdentifier(schema, "schema")}].[${assertSafeIdentifier(table, "table")}]`;
    const col = `[${assertSafeIdentifier(column, "column")}]`;
    const result = await this.query(
      `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified} WHERE LOWER(CAST(${col} AS NVARCHAR(4000))) = LOWER(@lit)) THEN 1 ELSE 0 END AS found`,
      { lit: literal }
    );
    return Boolean(Number(result.rows[0]?.found));
  }

  async close(): Promise<void> {
    if (this.poolPromise) {
      const pool = await this.poolPromise;
      await pool.close();
    }
    await this.tunnel?.close();
  }
}
