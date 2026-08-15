/**
 * MySQL / MariaDB connector client. One connection per tool call, same
 * lifecycle convention as the Postgres client in this directory.
 *
 * MySQL has no schema concept distinct from "database" -- a "schema" arg
 * here means "which database to query" and defaults to the database the
 * connection was opened against (creds.database), not a fixed name like
 * Postgres's "public".
 */

import mysql, { type Connection, type FieldPacket } from "mysql2/promise";
import { guardReadOnly, assertSafeIdentifier, truncate } from "../shared";
import { resolveConnectionTarget, type Tunnel } from "../tunnel";
import type { SqlConnector, SqlCredentials, SqlResult, SqlColumn } from "../types";

const STATEMENT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];

// MySQL binary-protocol column type codes -> friendly names (common subset).
const MYSQL_TYPE_NAMES: Record<number, string> = {
  0: "decimal", 1: "tinyint", 2: "smallint", 3: "int", 4: "float", 5: "double",
  6: "null", 7: "timestamp", 8: "bigint", 9: "mediumint", 10: "date", 11: "time",
  12: "datetime", 13: "year", 245: "json", 246: "decimal", 252: "blob/text",
  253: "varchar", 254: "char",
};

function columnsFromFields(fields: FieldPacket[] | undefined): SqlColumn[] {
  return (fields ?? []).map(f => ({ name: f.name, type: MYSQL_TYPE_NAMES[(f as any).type ?? -1] ?? String((f as any).type) }));
}

function buildSsl(mode: string | undefined): Record<string, unknown> | undefined {
  if (!mode || mode === "disable") return undefined;
  if (mode === "verify-full") return { rejectUnauthorized: true };
  return { rejectUnauthorized: false }; // "require" / "prefer"
}

export class MySqlClient implements SqlConnector {
  readonly dialect = "mysql";
  private connPromise: Promise<Connection> | null = null;
  private tunnel: Tunnel | null = null;

  constructor(private readonly creds: SqlCredentials) {
    if (!creds.host) throw new Error("MySQL host is not configured. Connect via the Integrations settings.");
    if (!creds.database) throw new Error("MySQL database name is not configured.");
    if (!creds.user) throw new Error("MySQL user is not configured.");
  }

  private async getConnection(): Promise<Connection> {
    if (!this.connPromise) {
      this.connPromise = (async () => {
        const target = await resolveConnectionTarget(this.creds, 3306);
        this.tunnel = target.tunnel;
        return mysql.createConnection({
          host: target.host,
          port: target.port,
          database: this.creds.database,
          user: this.creds.user,
          password: this.creds.password,
          // See PostgresClient's getClient() for why TLS is skipped when tunneled.
          ssl: target.tunnel ? undefined : buildSsl(this.creds.ssl),
          connectTimeout: CONNECT_TIMEOUT_MS,
        });
      })();
    }
    return this.connPromise;
  }

  getTunnelFingerprint(): string | undefined {
    return this.tunnel?.hostFingerprint;
  }

  private async query(sql: string, values?: unknown[]): Promise<SqlResult> {
    const start = Date.now();
    const conn = await this.getConnection();
    const [rows, fields] = await conn.query({ sql, values, timeout: STATEMENT_TIMEOUT_MS });
    const rowArray = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    return {
      rows: rowArray,
      columns: columnsFromFields(fields as FieldPacket[] | undefined),
      row_count: rowArray.length,
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
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (?, ?, ?, ?) ORDER BY schema_name`,
      SYSTEM_SCHEMAS
    );
  }

  async listTables(schema?: string): Promise<SqlResult> {
    return this.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [schema ?? this.creds.database]
    );
  }

  async describeTable(schema: string | undefined, table: string): Promise<SqlResult> {
    return this.query(
      `SELECT column_name, data_type, character_maximum_length, numeric_precision, is_nullable, column_default, ordinal_position
       FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
      [schema ?? this.creds.database, table]
    );
  }

  async searchTables(keyword: string): Promise<SqlResult> {
    return this.query(
      `SELECT table_schema, table_name, table_type FROM information_schema.tables
       WHERE table_name LIKE ? AND table_schema NOT IN (?, ?, ?, ?)
       ORDER BY table_schema, table_name LIMIT 50`,
      [`%${keyword}%`, ...SYSTEM_SCHEMAS]
    );
  }

  async getColumnStats(schema: string | undefined, table: string, column: string): Promise<SqlResult> {
    const qualified = `\`${assertSafeIdentifier(schema ?? this.creds.database!, "schema")}\`.\`${assertSafeIdentifier(table, "table")}\``;
    const col = `\`${assertSafeIdentifier(column, "column")}\``;

    const base = await this.query(
      `SELECT COUNT(*) AS total_rows, COUNT(${col}) AS non_null_count,
       (COUNT(*) - COUNT(${col})) AS null_count,
       ROUND(100.0 * (COUNT(*) - COUNT(${col})) / NULLIF(COUNT(*), 0), 2) AS null_pct,
       CAST(MIN(${col}) AS CHAR) AS min_val, CAST(MAX(${col}) AS CHAR) AS max_val
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

  async previewTable(schema: string | undefined, table: string, limit = 20): Promise<SqlResult> {
    const qualified = `\`${assertSafeIdentifier(schema ?? this.creds.database!, "schema")}\`.\`${assertSafeIdentifier(table, "table")}\``;
    return this.query(`SELECT * FROM ${qualified} LIMIT ${Math.min(Math.max(limit, 1), 50)}`);
  }

  async sampleDistinctValues(schema: string | undefined, table: string, column: string, limit: number): Promise<string[]> {
    const qualified = `\`${assertSafeIdentifier(schema ?? this.creds.database!, "schema")}\`.\`${assertSafeIdentifier(table, "table")}\``;
    const col = `\`${assertSafeIdentifier(column, "column")}\``;
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.query(
      `SELECT DISTINCT CAST(${col} AS CHAR) AS v FROM (SELECT ${col} FROM ${qualified} LIMIT 5000) sub LIMIT ?`,
      [boundedLimit]
    );
    return result.rows.map(r => String(r.v));
  }

  async valueExistsInColumn(schema: string | undefined, table: string, column: string, literal: string): Promise<boolean> {
    const qualified = `\`${assertSafeIdentifier(schema ?? this.creds.database!, "schema")}\`.\`${assertSafeIdentifier(table, "table")}\``;
    const col = `\`${assertSafeIdentifier(column, "column")}\``;
    const result = await this.query(
      `SELECT EXISTS(SELECT 1 FROM ${qualified} WHERE LOWER(CAST(${col} AS CHAR)) = LOWER(?)) AS found`,
      [literal]
    );
    return Boolean(Number(result.rows[0]?.found));
  }

  async close(): Promise<void> {
    if (this.connPromise) {
      const conn = await this.connPromise;
      await conn.end();
    }
    await this.tunnel?.close();
  }
}
