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
      ALTER TABLE runbooks ADD COLUMN IF NOT EXISTS agent_id VARCHAR REFERENCES agents(id);
      CREATE TABLE IF NOT EXISTS aar_configs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL UNIQUE,
        target_platform TEXT NOT NULL DEFAULT 'atlas-native',
        policy_bundle_version TEXT NOT NULL DEFAULT 'v1.0.0',
        module_config JSONB,
        health_summary JSONB,
        last_synced_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'aar_configs' AND constraint_name = 'aar_configs_agent_id_fkey'
        ) THEN
          ALTER TABLE aar_configs ADD CONSTRAINT aar_configs_agent_id_fkey
            FOREIGN KEY (agent_id) REFERENCES agents(id);
        END IF;
      END $$;
    `);
    console.log("[db] Startup migrations complete");
  } catch (err: any) {
    console.error("[db] Startup migration FAILED:", err.message);
    throw err; // Propagate so callers can fail-fast or log at higher severity
  } finally {
    client.release();
  }
}
