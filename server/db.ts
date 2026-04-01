import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30000,
  max: 10,
});

export const db = drizzle(pool, { schema });

/**
 * Run startup SQL migrations for tables that cannot be managed via db:push
 * (db:push is prohibited in this codebase because it drops the pgvector embedding column).
 * Use CREATE TABLE IF NOT EXISTS to make each migration idempotent.
 */
export async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_chain_health_checks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        checked_at TIMESTAMP DEFAULT NOW(),
        valid BOOLEAN NOT NULL,
        total_events INTEGER NOT NULL DEFAULT 0,
        verified_events INTEGER NOT NULL DEFAULT 0,
        broken_at INTEGER,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        triggered_by TEXT NOT NULL DEFAULT 'scheduled'
          CHECK (triggered_by IN ('scheduled', 'manual'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_chain_health_checks_checked_at
        ON audit_chain_health_checks (checked_at DESC);

      ALTER TABLE runbooks ADD COLUMN IF NOT EXISTS agent_id VARCHAR REFERENCES agents(id);
    `);
    console.log("[db] Startup migrations complete");
  } catch (err: any) {
    console.error("[db] Startup migration FAILED:", err.message);
    throw err; // Propagate so callers can fail-fast or log at higher severity
  } finally {
    client.release();
  }
}
