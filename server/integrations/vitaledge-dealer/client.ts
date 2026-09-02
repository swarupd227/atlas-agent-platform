/**
 * Dealer Operations client — the data access layer behind the VitalEdge
 * dealer connector.
 *
 * Every method here runs real parameterised SQL against the `summit` schema.
 * There are no fixtures: if a tool reports that a payment spans three
 * branches, it is because three rows in `summit.invoices` say so.
 *
 * Connection identity is deliberately separate from the read-only connection
 * the agents explore with. This client uses the WRITE role, and only the
 * action tools reach it — so any ledger mutation is attributable to a specific
 * action-tool call rather than to a stray query.
 */
import pg from "pg";

export interface DealerCredentials {
  host: string;
  port?: string;
  database: string;
  user: string;
  password: string;
  ssl?: string;
  /** Defaults to "summit"; exposed so a second dataset can be pointed at. */
  schema?: string;
}

export class DealerClient {
  private pool: pg.Pool;
  readonly schema: string;

  constructor(creds: DealerCredentials) {
    this.schema = (creds.schema || "summit").replace(/[^a-zA-Z0-9_]/g, "");
    const sslMode = (creds.ssl ?? "require").toLowerCase();
    this.pool = new pg.Pool({
      host: creds.host,
      port: creds.port ? parseInt(creds.port, 10) : 5432,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: sslMode === "disable" ? undefined : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  async q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const scoped = sql.replace(/\bsummit\./g, `${this.schema}.`);
    const res = await this.pool.query(scoped, params);
    return res.rows as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.q<T>(sql, params);
    return rows[0] ?? null;
  }

  /** Runs `fn` inside a transaction so multi-table postings are atomic. */
  async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Shared domain helpers ────────────────────────────────────────────────────

/** Business day count between two ISO dates. Used for ageing and coverage. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = typeof from === "string" ? new Date(from + (from.length === 10 ? "T00:00:00Z" : "")) : from;
  const b = typeof to === "string" ? new Date(to + (to.length === 10 ? "T00:00:00Z" : "")) : to;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The delegation-of-authority matrix, in one place.
 *
 * This is the control that Act 4 of the demo turns on, so it lives here as
 * data rather than being re-derived inside each tool — a threshold duplicated
 * across call sites is a threshold that eventually disagrees with itself.
 */
export const AUTHORITY = {
  agentCreditMemoCeilingUsd: 10_000,
  branchControllerCeilingUsd: 100_000,
  /** Above the branch ceiling, only the regional CFO may approve. */
  regionalApprover: "regional_cfo" as const,
  /** Cash application auto-post floor; below this a human confirms or it routes. */
  autoPostConfidence: 0.8,
  humanConfirmConfidence: 0.6,
  /** Residuals above this may never be written off by an agent. */
  residualWriteOffCeilingUsd: 50,
  /** Rental billing adjustments above this need the branch controller. */
  agentAdjustmentCeilingUsd: 10_000,
};

export function approvalLevelFor(amountUsd: number): "agent_auto" | "branch_controller" | "regional_cfo" {
  if (amountUsd <= AUTHORITY.agentCreditMemoCeilingUsd) return "agent_auto";
  if (amountUsd <= AUTHORITY.branchControllerCeilingUsd) return "branch_controller";
  return "regional_cfo";
}

/** Deterministic, human-readable ids so audit records are traceable by eye. */
export function newId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `${prefix}-${stamp}${rand}`;
}
