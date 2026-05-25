/**
 * Snowflake SQL REST API v2 client
 * Auth: JWT key-pair (RSA) via Node crypto or username+password (basic auth).
 * Base URL: https://{account}.snowflakecomputing.com
 *
 * The Snowflake SQL REST API is async:
 *  POST /api/v2/statements              → returns { statementHandle, status }
 *  GET  /api/v2/statements/{handle}     → poll until status != "running"
 *  GET  /api/v2/statements/{handle}?partition=N → paginate
 *
 * READ-ONLY enforcement:
 *  - Every SQL statement is checked for DDL/DML keywords before execution.
 *  - The role field in every statement submission is ALWAYS hardcoded to
 *    "readonly_atlas_role" — it is never configurable from credentials.
 */

import { createPrivateKey, createPublicKey, createHash, createSign } from "crypto";

const POLL_MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 800;
const READ_ONLY_ROLE = "readonly_atlas_role";

const BLOCKED_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|TRUNCATE|MERGE|REPLACE|GRANT|REVOKE|ALTER|COPY\s+INTO)\b/i;

export function guardReadOnly(sql: string): void {
  if (BLOCKED_KEYWORDS.test(sql)) {
    const match = sql.match(BLOCKED_KEYWORDS)?.[0]?.toUpperCase() ?? "DML/DDL";
    throw new Error(
      `Read-only enforcement: ${match} statements are blocked. ` +
      "Snowflake via Atlas is configured for read-only access. Use SELECT queries only."
    );
  }
}

/**
 * Build a Snowflake JWT from an RSA private key in PEM format.
 * Snowflake requires:
 *   iss = {ACCOUNT_LOCATOR}.{USERNAME}.SHA256:{base64(sha256(spki_der))}
 *   sub = {ACCOUNT_LOCATOR}.{USERNAME}
 *   alg = RS256, exp = now + 3600s
 */
function buildSnowflakeJwt(account: string, username: string, privateKeyPem: string): string {
  const privKey = createPrivateKey(privateKeyPem);
  const pubKey  = createPublicKey(privKey);
  const pubDer  = pubKey.export({ type: "spki", format: "der" }) as Buffer;
  const fingerprint = createHash("sha256").update(pubDer).digest("base64");

  const accountLocator = account.toUpperCase().split(".")[0];
  const user = username.toUpperCase();

  const header  = { alg: "RS256", typ: "JWT" };
  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `${accountLocator}.${user}.SHA256:${fingerprint}`,
    sub: `${accountLocator}.${user}`,
    iat: now,
    exp: now + 3600,
  };

  const hdr = Buffer.from(JSON.stringify(header)).toString("base64url");
  const pld = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${hdr}.${pld}`;
  const sign = createSign("RSA-SHA256");
  sign.update(input);
  const sig = sign.sign(privateKeyPem, "base64url");
  return `${input}.${sig}`;
}

export interface SnowflakeCredentials {
  account: string;
  username: string;
  private_key?: string;
  password?: string;
  warehouse?: string;
  database?: string;
  access_token?: string;
}

export interface SnowflakeRow {
  [col: string]: unknown;
}

export interface SnowflakeResult {
  rows: SnowflakeRow[];
  columns: { name: string; type: string }[];
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
  query_id?: string;
}

type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

async function parseSnowflake(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Snowflake API non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const msg = (body as any)?.message ?? (body as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(`Snowflake API error: ${msg}`);
  }
  return body;
}

function buildBaseUrl(account: string): string {
  const norm = account.toLowerCase().replace(/_/g, "-");
  return `https://${norm}.snowflakecomputing.com`;
}

function rowsFromPayload(payload: any): { rows: SnowflakeRow[]; columns: { name: string; type: string }[] } {
  const resultSetMetaData = payload?.resultSetMetaData;
  const columns: { name: string; type: string }[] = (resultSetMetaData?.rowType ?? []).map((c: any) => ({
    name: c.name,
    type: c.type ?? "TEXT",
  }));
  const rawData: string[][] = payload?.data ?? [];
  const rows: SnowflakeRow[] = rawData.map((row) => {
    const obj: SnowflakeRow = {};
    columns.forEach((col, i) => { obj[col.name] = row[i] ?? null; });
    return obj;
  });
  return { rows, columns };
}

export class SnowflakeClient {
  private readonly baseUrl: string;
  private readonly warehouse: string;
  private readonly database: string | undefined;
  private _jwt: string | null = null;
  private _jwtExpiry = 0;

  constructor(
    private readonly creds: SnowflakeCredentials,
    private readonly fetch: Fetcher
  ) {
    this.baseUrl  = buildBaseUrl(creds.account);
    this.warehouse = creds.warehouse ?? "COMPUTE_WH";
    this.database  = creds.database;
  }

  private getJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this._jwt && now < this._jwtExpiry - 60) return this._jwt;
    this._jwt = buildSnowflakeJwt(this.creds.account, this.creds.username, this.creds.private_key!);
    this._jwtExpiry = now + 3600;
    return this._jwt;
  }

  private get authHeader(): string {
    if (this.creds.access_token) {
      return `Snowflake Token="${this.creds.access_token}"`;
    }
    if (this.creds.private_key) {
      return `Bearer ${this.getJwt()}`;
    }
    if (this.creds.password) {
      const b64 = Buffer.from(`${this.creds.username}:${this.creds.password}`).toString("base64");
      return `Basic ${b64}`;
    }
    throw new Error("No valid Snowflake credentials: provide private_key (key-pair JWT), password (basic), or access_token.");
  }

  private get tokenTypeHeader(): string {
    if (this.creds.access_token) return "KEYPAIR_JWT";
    if (this.creds.private_key)   return "KEYPAIR_JWT";
    return "BASIC";
  }

  private async apiGet(path: string): Promise<unknown> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "X-Snowflake-Authorization-Token-Type": this.tokenTypeHeader,
        "Content-Type": "application/json",
      },
    });
    return parseSnowflake(res);
  }

  private async submitStatement(sql: string, params?: unknown[]): Promise<any> {
    const body: Record<string, unknown> = {
      statement: sql,
      timeout: 60,
      database: this.database,
      warehouse: this.warehouse,
      role: READ_ONLY_ROLE,
    };
    if (params?.length) body.bindings = params;

    const res = await this.fetch(`${this.baseUrl}/api/v2/statements`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Snowflake-Authorization-Token-Type": this.tokenTypeHeader,
      },
      body: JSON.stringify(body),
    });
    return parseSnowflake(res);
  }

  private async pollStatement(handle: string): Promise<any> {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const payload = await this.apiGet(`/api/v2/statements/${handle}`) as any;
      const status: string = payload?.status ?? "";
      if (status === "failed") {
        throw new Error(payload?.message ?? payload?.error ?? "Snowflake query failed");
      }
      if (status === "success" || payload?.data !== undefined || payload?.rows !== undefined) {
        return payload;
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Snowflake query timed out waiting for results");
  }

  async executeQuery(sql: string, maxRows = 1000): Promise<SnowflakeResult> {
    guardReadOnly(sql);
    const start = Date.now();

    let payload = await this.submitStatement(sql) as any;

    if (payload?.statementHandle && payload?.status === "running") {
      payload = await this.pollStatement(payload.statementHandle);
    }

    const { rows, columns } = rowsFromPayload(payload);
    const truncated = rows.length > maxRows;
    return {
      rows: rows.slice(0, maxRows),
      columns,
      row_count: rows.length,
      truncated,
      elapsed_ms: Date.now() - start,
      query_id: payload?.statementHandle ?? payload?.queryId,
    };
  }

  async listDatabases(): Promise<SnowflakeResult> {
    return this.executeQuery("SHOW DATABASES");
  }

  async listSchemas(database: string): Promise<SnowflakeResult> {
    return this.executeQuery(`SHOW SCHEMAS IN DATABASE "${database}"`);
  }

  async listTables(database: string, schema: string): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT table_name, table_type, row_count, bytes, last_altered ` +
      `FROM "${database}".information_schema.tables ` +
      `WHERE table_schema = '${schema.toUpperCase()}' ` +
      `ORDER BY table_name`
    );
  }

  async describeTable(database: string, schema: string, table: string): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT column_name, data_type, character_maximum_length, numeric_precision, ` +
      `is_nullable, column_default, ordinal_position ` +
      `FROM "${database}".information_schema.columns ` +
      `WHERE table_schema = '${schema.toUpperCase()}' AND table_name = '${table.toUpperCase()}' ` +
      `ORDER BY ordinal_position`
    );
  }

  async getQueryHistory(limit = 20): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT query_id, query_text, database_name, schema_name, query_type, ` +
      `execution_status, total_elapsed_time, bytes_scanned, rows_produced, ` +
      `warehouse_name, role_name, user_name, start_time ` +
      `FROM table(information_schema.query_history(result_limit => ${Math.min(limit, 100)})) ` +
      `ORDER BY start_time DESC`
    );
  }

  async searchTables(keyword: string): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT table_catalog, table_schema, table_name, table_type, row_count ` +
      `FROM information_schema.tables ` +
      `WHERE LOWER(table_name) LIKE LOWER('%${keyword.replace(/'/g, "''")}%') ` +
      `ORDER BY table_catalog, table_schema, table_name ` +
      `LIMIT 50`
    );
  }

  async getColumnStats(database: string, schema: string, table: string, column: string): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT ` +
      `COUNT(*) AS total_rows, ` +
      `COUNT("${column}") AS non_null_count, ` +
      `(COUNT(*) - COUNT("${column}")) AS null_count, ` +
      `ROUND(100.0 * (COUNT(*) - COUNT("${column}")) / NULLIF(COUNT(*), 0), 2) AS null_pct, ` +
      `MIN("${column}") AS min_val, ` +
      `MAX("${column}") AS max_val, ` +
      `ROUND(AVG(TRY_TO_DECIMAL("${column}"::TEXT, 18, 4)), 4) AS avg_val ` +
      `FROM "${database}"."${schema}"."${table}"`
    );
  }

  async previewTable(database: string, schema: string, table: string, limit = 20): Promise<SnowflakeResult> {
    return this.executeQuery(
      `SELECT * FROM "${database}"."${schema}"."${table}" LIMIT ${Math.min(limit, 50)}`
    );
  }
}
