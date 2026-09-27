/**
 * Databricks REST API client — SQL Statement Execution API v2.0 (SQL warehouses) +
 * Unity Catalog API v2.1 (catalogs/schemas/tables metadata) + Jobs API v2.1 (read-only listing).
 * Auth: Personal Access Token (PAT) as a Bearer token — Databricks' standard, simplest auth mode
 * (unlike Snowflake, there's no key-pair JWT to build here).
 * Base URL: the workspace's own URL, e.g. https://adb-xxxx.NN.azuredatabricks.net or
 * https://xxxx.cloud.databricks.com — this is a full URL already, not a bare account
 * identifier like Snowflake's, so no URL construction beyond stripping a trailing slash.
 *
 * READ-ONLY enforcement: every SQL statement is checked for DDL/DML keywords (plus
 * Databricks-specific maintenance verbs like OPTIMIZE/VACUUM) before submission, mirroring
 * server/integrations/snowflake/client.ts's guardReadOnly().
 */

const POLL_MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;

const BLOCKED_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|TRUNCATE|MERGE|REPLACE|GRANT|REVOKE|ALTER|COPY\s+INTO|OPTIMIZE|VACUUM|MSCK|ANALYZE)\b/i;

export function guardReadOnly(sql: string): void {
  if (BLOCKED_KEYWORDS.test(sql)) {
    const match = sql.match(BLOCKED_KEYWORDS)?.[0]?.toUpperCase() ?? "DML/DDL";
    throw new Error(
      `Read-only enforcement: ${match} statements are blocked. ` +
      "Databricks via Astra Agents is configured for read-only access. Use SELECT queries only."
    );
  }
}

export interface DatabricksCredentials {
  host: string;
  token: string;
  warehouse_id: string;
  catalog?: string;
  schema?: string;
}

export interface DatabricksRow {
  [col: string]: unknown;
}

export interface DatabricksResult {
  rows: DatabricksRow[];
  columns: { name: string; type: string }[];
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
  statement_id?: string;
}

type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

async function parseDatabricks(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Databricks API non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const msg = body?.message ?? body?.error?.message ?? body?.error_code ?? `HTTP ${res.status}`;
    throw new Error(`Databricks API error: ${msg}`);
  }
  return body;
}

function buildBaseUrl(host: string): string {
  return host.replace(/\/+$/, "");
}

/** Converts the Statement Execution API's manifest/result payload into {rows, columns} --
 *  values come back as manifest.schema.columns (name + type_text/type_name) and
 *  result.data_array (rows of positional string values, JSON_ARRAY format). */
function rowsFromStatementResult(payload: any): { rows: DatabricksRow[]; columns: { name: string; type: string }[] } {
  const columns: { name: string; type: string }[] = (payload?.manifest?.schema?.columns ?? []).map((c: any) => ({
    name: c.name,
    type: c.type_text ?? c.type_name ?? "STRING",
  }));
  const rawRows: unknown[][] = payload?.result?.data_array ?? [];
  const rows: DatabricksRow[] = rawRows.map((row) => {
    const obj: DatabricksRow = {};
    columns.forEach((col, i) => { obj[col.name] = row[i] ?? null; });
    return obj;
  });
  return { rows, columns };
}

export class DatabricksClient {
  private readonly baseUrl: string;

  constructor(
    private readonly creds: DatabricksCredentials,
    private readonly fetch: Fetcher
  ) {
    if (!creds.host) throw new Error("Databricks workspace host is not configured.");
    this.baseUrl = buildBaseUrl(creds.host);
  }

  private get authHeaders(): Record<string, string> {
    if (!this.creds.token) throw new Error("No Databricks Personal Access Token configured.");
    return { Authorization: `Bearer ${this.creds.token}` };
  }

  private async apiGet(path: string): Promise<any> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { ...this.authHeaders, Accept: "application/json" },
    });
    return parseDatabricks(res);
  }

  private async submitStatement(sql: string, waitSeconds = 30): Promise<any> {
    if (!this.creds.warehouse_id) throw new Error("Databricks SQL warehouse_id is not configured — set it on the connection (a SQL Warehouse must be running or auto-start-capable).");
    const body: Record<string, unknown> = {
      statement: sql,
      warehouse_id: this.creds.warehouse_id,
      wait_timeout: `${Math.min(Math.max(waitSeconds, 5), 50)}s`,
      on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY",
      disposition: "INLINE",
      row_limit: 1000,
    };
    if (this.creds.catalog) body.catalog = this.creds.catalog;
    if (this.creds.schema) body.schema = this.creds.schema;

    const res = await this.fetch(`${this.baseUrl}/api/2.0/sql/statements`, {
      method: "POST",
      headers: { ...this.authHeaders, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return parseDatabricks(res);
  }

  private async pollStatement(statementId: string): Promise<any> {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const payload = await this.apiGet(`/api/2.0/sql/statements/${statementId}`);
      const state: string = payload?.status?.state ?? "";
      if (state === "FAILED" || state === "CANCELED") {
        throw new Error(payload?.status?.error?.message ?? `Databricks statement ${state.toLowerCase()}`);
      }
      if (state === "SUCCEEDED") return payload;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Databricks query timed out waiting for results");
  }

  async executeQuery(sql: string, maxRows = 1000): Promise<DatabricksResult> {
    guardReadOnly(sql);
    const start = Date.now();

    let payload = await this.submitStatement(sql);
    const initialState: string = payload?.status?.state ?? "";
    if (initialState === "FAILED" || initialState === "CANCELED") {
      throw new Error(payload?.status?.error?.message ?? `Databricks statement ${initialState.toLowerCase()}`);
    }
    if (initialState !== "SUCCEEDED" && payload?.statement_id) {
      payload = await this.pollStatement(payload.statement_id);
    }

    const { rows, columns } = rowsFromStatementResult(payload);
    const totalRowCount: number = payload?.manifest?.total_row_count ?? rows.length;

    return {
      rows: rows.slice(0, maxRows),
      columns,
      row_count: rows.length,
      truncated: totalRowCount > rows.length || rows.length > maxRows,
      elapsed_ms: Date.now() - start,
      statement_id: payload?.statement_id,
    };
  }

  async listCatalogs(): Promise<any[]> {
    const payload = await this.apiGet("/api/2.1/unity-catalog/catalogs?max_results=100");
    return payload?.catalogs ?? [];
  }

  async listSchemas(catalog: string): Promise<any[]> {
    const payload = await this.apiGet(`/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}&max_results=100`);
    return payload?.schemas ?? [];
  }

  async listTables(catalog: string, schema: string): Promise<any[]> {
    const payload = await this.apiGet(
      `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}&max_results=50&omit_columns=true`
    );
    return payload?.tables ?? [];
  }

  /** Full Unity Catalog TableInfo -- columns, comment, table_type, data_source_format, etc. --
   *  richer than a DESCRIBE query, so returned as-is rather than reshaped into {rows,columns}. */
  async describeTable(catalog: string, schema: string, table: string): Promise<any> {
    const fullName = `${catalog}.${schema}.${table}`;
    return this.apiGet(`/api/2.1/unity-catalog/tables/${encodeURIComponent(fullName)}`);
  }

  async previewTable(catalog: string, schema: string, table: string, limit = 20): Promise<DatabricksResult> {
    return this.executeQuery(`SELECT * FROM \`${catalog}\`.\`${schema}\`.\`${table}\` LIMIT ${Math.min(limit, 50)}`, limit);
  }

  /** information_schema.tables is a real, documented Unity Catalog system table present in
   *  every catalog (and as system.information_schema for a cross-catalog view). */
  async searchTables(keyword: string, catalog?: string): Promise<DatabricksResult> {
    const scope = catalog ? `\`${catalog}\`.information_schema.tables` : "system.information_schema.tables";
    return this.executeQuery(
      `SELECT table_catalog, table_schema, table_name, table_type FROM ${scope} ` +
      `WHERE LOWER(table_name) LIKE LOWER('%${keyword.replace(/'/g, "''")}%') ` +
      `ORDER BY table_catalog, table_schema, table_name LIMIT 50`
    );
  }

  async getColumnStats(catalog: string, schema: string, table: string, column: string): Promise<DatabricksResult> {
    return this.executeQuery(
      `SELECT ` +
      `COUNT(*) AS total_rows, ` +
      `COUNT(\`${column}\`) AS non_null_count, ` +
      `(COUNT(*) - COUNT(\`${column}\`)) AS null_count, ` +
      `ROUND(100.0 * (COUNT(*) - COUNT(\`${column}\`)) / NULLIF(COUNT(*), 0), 2) AS null_pct, ` +
      `MIN(\`${column}\`) AS min_val, ` +
      `MAX(\`${column}\`) AS max_val, ` +
      `AVG(TRY_CAST(\`${column}\` AS DOUBLE)) AS avg_val ` +
      `FROM \`${catalog}\`.\`${schema}\`.\`${table}\``
    );
  }

  /** Read-only listing of Databricks Jobs (workflows) -- the one capability with no Snowflake
   *  equivalent, since job/pipeline orchestration is a first-class Databricks concept. */
  async listJobs(limit = 20): Promise<any[]> {
    const payload = await this.apiGet(`/api/2.1/jobs/list?limit=${Math.min(limit, 100)}`);
    return payload?.jobs ?? [];
  }
}
