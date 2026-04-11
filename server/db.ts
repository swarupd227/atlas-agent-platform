import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
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
    // Set conservative timeouts so DDL that blocks on a lock fails fast
    // rather than hanging the deployment health-check indefinitely.
    await client.query("SET lock_timeout = '15s'");
    await client.query("SET statement_timeout = '90s'");
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
      CREATE TABLE IF NOT EXISTS agent_alerts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id VARCHAR,
        agent_id VARCHAR NOT NULL,
        agent_name TEXT NOT NULL,
        alert_type TEXT NOT NULL DEFAULT 'success_rate_drop',
        severity TEXT NOT NULL DEFAULT 'warning',
        message TEXT NOT NULL,
        current_value REAL,
        baseline_value REAL,
        triggered_at TIMESTAMP DEFAULT NOW(),
        acknowledged_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_alerts_agent_id ON agent_alerts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_alerts_triggered_at ON agent_alerts(triggered_at);
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
      ALTER TABLE aar_configs ADD COLUMN IF NOT EXISTS allowed_tools JSONB;
      ALTER TABLE aar_configs ADD COLUMN IF NOT EXISTS denied_tools JSONB;
      ALTER TABLE aar_configs ADD COLUMN IF NOT EXISTS require_approval_tools JSONB;
      ALTER TABLE aar_configs ADD COLUMN IF NOT EXISTS rate_limits JSONB;
      CREATE TABLE IF NOT EXISTS aar_action_decisions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES agents(id),
        org_id VARCHAR,
        tool_name TEXT NOT NULL,
        server_id VARCHAR,
        decision TEXT NOT NULL,
        reason TEXT,
        policies_evaluated JSONB,
        rules_triggered JSONB,
        risk_level TEXT,
        approval_id VARCHAR,
        evaluation_time_us INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_aar_action_decisions_agent_id ON aar_action_decisions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_aar_action_decisions_created_at ON aar_action_decisions(created_at);
      CREATE TABLE IF NOT EXISTS aar_agent_state_reports (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES agents(id),
        org_id VARCHAR,
        report_type TEXT NOT NULL DEFAULT 'heartbeat',
        payload JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_aar_agent_state_reports_agent_id ON aar_agent_state_reports(agent_id);

      ALTER TABLE run_traces ADD COLUMN IF NOT EXISTS soft_policy_violations JSONB;

      CREATE TABLE IF NOT EXISTS workflow_state_schemas (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_id     VARCHAR NOT NULL REFERENCES agent_pipelines(id) ON DELETE CASCADE,
        schema_version  INTEGER NOT NULL DEFAULT 1,
        fields          JSONB NOT NULL DEFAULT '{}',
        reducers        JSONB NOT NULL DEFAULT '{}',
        initial_values  JSONB NOT NULL DEFAULT '{}',
        sanitization    JSONB DEFAULT '{}',
        created_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(pipeline_id, schema_version)
      );

      CREATE TABLE IF NOT EXISTS workflow_state_checkpoints (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_run_id       VARCHAR NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
        checkpoint_number     INTEGER NOT NULL,
        trigger               VARCHAR NOT NULL,
        trigger_stage_id      VARCHAR,
        trigger_node_id       VARCHAR,
        state_json            JSONB NOT NULL,
        state_hash            VARCHAR NOT NULL,
        interrupt_id          VARCHAR,
        interrupt_payload     JSONB,
        interrupt_node        VARCHAR,
        interrupt_responded   BOOLEAN NOT NULL DEFAULT FALSE,
        interrupt_response    JSONB,
        created_at            TIMESTAMP DEFAULT NOW(),
        created_by            VARCHAR,
        UNIQUE(pipeline_run_id, checkpoint_number)
      );

      CREATE INDEX IF NOT EXISTS idx_wsc_run ON workflow_state_checkpoints(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_wsc_interrupt ON workflow_state_checkpoints(interrupt_id)
        WHERE interrupt_id IS NOT NULL;

      ALTER TABLE agent_pipelines ADD COLUMN IF NOT EXISTS state_schema_id VARCHAR;
      ALTER TABLE agent_pipelines ADD COLUMN IF NOT EXISTS state_enabled BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS state_schema_id VARCHAR;
      ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS current_state JSONB DEFAULT '{}';
      ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS active_interrupt_id VARCHAR;
      ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS state_version INTEGER NOT NULL DEFAULT 0;

      DO $$ BEGIN
        ALTER TABLE workflow_state_schemas ADD CONSTRAINT fk_wss_pipeline_id
          FOREIGN KEY (pipeline_id) REFERENCES agent_pipelines(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE workflow_state_checkpoints ADD CONSTRAINT fk_wsc_pipeline_run_id
          FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE agent_pipelines ADD CONSTRAINT fk_ap_state_schema_id
          FOREIGN KEY (state_schema_id) REFERENCES workflow_state_schemas(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        ALTER TABLE pipeline_runs ADD CONSTRAINT fk_pr_state_schema_id
          FOREIGN KEY (state_schema_id) REFERENCES workflow_state_schemas(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS export_jobs (
        id          VARCHAR(36)  PRIMARY KEY,
        files_json  TEXT         NOT NULL,
        expires_at  TIMESTAMPTZ  NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_export_jobs_expires_at ON export_jobs(expires_at);

      -- GAP3 schema v2: action-centric interrupt definitions.
      -- Drop old tables if they have the old flat response_schema layout.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'interrupt_definitions' AND column_name = 'response_schema'
        ) THEN
          DROP TABLE IF EXISTS interrupt_instances;
          DROP TABLE IF EXISTS interrupt_definitions;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS interrupt_definitions (
        id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_id      VARCHAR NOT NULL,
        stage_id         VARCHAR NOT NULL,
        name             TEXT NOT NULL,
        title            TEXT,
        description      TEXT,
        interrupt_type   TEXT NOT NULL DEFAULT 'approval',
        context_fields   JSONB NOT NULL DEFAULT '[]',
        allowed_actions  JSONB NOT NULL DEFAULT '[]',
        loop_back_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        max_loops        INTEGER NOT NULL DEFAULT 3,
        enabled          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_interrupt_defs_pipeline ON interrupt_definitions(pipeline_id);
      CREATE INDEX IF NOT EXISTS idx_interrupt_defs_stage    ON interrupt_definitions(pipeline_id, stage_id);

      CREATE TABLE IF NOT EXISTS interrupt_instances (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        definition_id     VARCHAR NOT NULL,
        pipeline_run_id   VARCHAR NOT NULL,
        checkpoint_id     VARCHAR,
        status            TEXT NOT NULL DEFAULT 'pending',
        loop_iteration    INTEGER NOT NULL DEFAULT 0,
        fired_at          TIMESTAMP DEFAULT NOW(),
        responded_at      TIMESTAMP,
        responded_action  TEXT,
        response_data     JSONB,
        routing_outcome   TEXT,
        validation_errors JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_interrupt_instances_run ON interrupt_instances(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_interrupt_instances_def ON interrupt_instances(definition_id);
    `);
    console.log("[db] Startup migrations complete");
  } catch (err: any) {
    console.error("[db] Startup migration FAILED:", err.message);
    throw err; // Propagate so callers can fail-fast or log at higher severity
  } finally {
    client.release();
  }
}
