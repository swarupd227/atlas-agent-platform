/**
 * Summit Equipment Group — real Postgres schema.
 *
 * This is a genuine relational schema with real constraints, not a fixture
 * store. Agents reach it through the platform's existing read-only Postgres
 * connector (server/integrations/sql/), so every "get_*" tool in the VitalEdge
 * journeys is an actual SQL SELECT against these tables.
 *
 * Two deliberate properties:
 *
 *  - **Referential integrity is real.** The Ridgeline payment spans three
 *    branches because three branches genuinely issued those invoices. Nothing
 *    is pre-aggregated; totals the agents report are totals they compute.
 *
 *  - **Governance is defence-in-depth.** The connection carries an
 *    `allowedTables` list enforced by ScopedSqlConnector, AND the database
 *    role below is granted only on this schema. An agent that somehow escaped
 *    the allowlist still hits a Postgres permission error.
 *
 * Everything lives in the `summit` schema so it is trivially separable from
 * platform tables and can be dropped and rebuilt without touching them.
 */

export const SUMMIT_SCHEMA = "summit";

/** Order matters — children after parents. */
export const SUMMIT_TABLES = [
  "branches",
  "customer_accounts",
  "oem_programs",
  "labour_standards",
  "fleet_assets",
  "invoices",
  "invoice_lines",
  "payments",
  "remittance_advices",
  "disputes",
  "work_orders",
  "work_order_lines",
  "warranty_claims",
  "rental_contracts",
  "telematics_readings",
  "condition_reports",
  "rebate_programs",
  "auction_comparables",
  "deals",
  "trade_ins",
  "credit_memos",
  "credit_holds",
  "journal_entries",
  "research_queue",
] as const;

export const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS ${SUMMIT_SCHEMA};`;

export const DDL_SQL = `
-- ── Organisation ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.branches (
  branch_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  division        TEXT NOT NULL CHECK (division IN ('construction','agriculture','compact','forestry')),
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  controller_name TEXT NOT NULL,
  -- Credit memo ceiling this branch's controller may approve unaided.
  controller_authority_usd NUMERIC(12,2) NOT NULL DEFAULT 100000
);

CREATE TABLE IF NOT EXISTS summit.customer_accounts (
  account_id       TEXT PRIMARY KEY,
  legal_name       TEXT NOT NULL,
  -- Payer strings seen on inbound payments: DBAs, subsidiaries, truncations.
  -- Payer resolution is a real fuzzy match against this array.
  known_payer_names TEXT[] NOT NULL DEFAULT '{}',
  account_tier     TEXT NOT NULL CHECK (account_tier IN ('standard','strategic','oem_affiliated')),
  credit_limit_usd NUMERIC(12,2) NOT NULL,
  payment_terms    TEXT NOT NULL,
  settlement_discount_pct NUMERIC(5,3) NOT NULL DEFAULT 0,
  settlement_discount_days INTEGER NOT NULL DEFAULT 0,
  -- Freight is dealer-absorbed above this invoice value under contract.
  freight_absorption_threshold_usd NUMERIC(12,2),
  credit_status    TEXT NOT NULL DEFAULT 'good' CHECK (credit_status IN ('good','watch','hold','legal')),
  primary_division TEXT,
  annual_parts_service_spend_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  seasonal_pattern TEXT,
  onboarded_on     DATE NOT NULL
);

-- ── Equipment ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.oem_programs (
  program_code       TEXT PRIMARY KEY,
  manufacturer       TEXT NOT NULL,
  program_name       TEXT NOT NULL,
  coverage_months    INTEGER NOT NULL,
  coverage_hours     INTEGER NOT NULL,
  requires_failure_narrative BOOLEAN NOT NULL DEFAULT TRUE,
  requires_causal_part       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Some programs extend coverage on a component already replaced under warranty.
  repeat_failure_provision   BOOLEAN NOT NULL DEFAULT FALSE,
  goodwill_threshold_usd     NUMERIC(12,2) NOT NULL DEFAULT 2500,
  terms_last_verified_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS summit.labour_standards (
  id              SERIAL PRIMARY KEY,
  manufacturer    TEXT NOT NULL,
  model           TEXT NOT NULL,
  repair_code     TEXT NOT NULL,
  repair_desc     TEXT NOT NULL,
  standard_hours  NUMERIC(6,2) NOT NULL,
  UNIQUE (manufacturer, model, repair_code)
);

CREATE TABLE IF NOT EXISTS summit.fleet_assets (
  unit_id          TEXT PRIMARY KEY,
  -- NOT unique: serial strings are unique within a manufacturer only. The
  -- A1J02931 collision below is real data, not a seeding accident.
  serial_number    TEXT NOT NULL,
  manufacturer     TEXT NOT NULL,
  model            TEXT NOT NULL,
  machine_class    TEXT NOT NULL,
  meter_hours      INTEGER NOT NULL,
  ownership_status TEXT NOT NULL CHECK (ownership_status IN
                     ('new_inventory','rental_fleet','customer_owned','used_inventory','sold')),
  branch_id        TEXT NOT NULL REFERENCES summit.branches(branch_id),
  owner_account_id TEXT REFERENCES summit.customer_accounts(account_id),
  delivery_date    DATE,
  program_code     TEXT REFERENCES summit.oem_programs(program_code),
  -- Whole-goods costing
  invoice_cost_usd NUMERIC(12,2),
  freight_cost_usd NUMERIC(12,2) DEFAULT 0,
  prep_cost_usd    NUMERIC(12,2) DEFAULT 0,
  inventory_since  DATE,
  floor_plan_rate_pct NUMERIC(5,3) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fleet_serial ON summit.fleet_assets(serial_number);

-- ── Receivables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.invoices (
  invoice_id     TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  branch_id      TEXT NOT NULL REFERENCES summit.branches(branch_id),
  revenue_line   TEXT NOT NULL CHECK (revenue_line IN ('parts','service','rental','wholegoods')),
  invoice_date   DATE NOT NULL,
  due_date       DATE NOT NULL,
  original_amount_usd NUMERIC(12,2) NOT NULL,
  balance_usd    NUMERIC(12,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed_paid','partially_paid','written_off')),
  -- Set when the performance obligation was satisfied; ASC 606 cutoff is
  -- judged against this, not invoice_date.
  obligation_satisfied_on DATE,
  source_document TEXT
);
CREATE INDEX IF NOT EXISTS idx_inv_account ON summit.invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_inv_status  ON summit.invoices(status);

CREATE TABLE IF NOT EXISTS summit.invoice_lines (
  id           SERIAL PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES summit.invoices(invoice_id),
  line_type    TEXT NOT NULL CHECK (line_type IN
                 ('parts','labour','freight','environmental_fee','rental','damage','fuel','delivery','tax','equipment','prep','training','extended_coverage')),
  description  TEXT NOT NULL,
  amount_usd   NUMERIC(12,2) NOT NULL,
  unit_id      TEXT REFERENCES summit.fleet_assets(unit_id)
);
CREATE INDEX IF NOT EXISTS idx_invline_invoice ON summit.invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS summit.payments (
  payment_id     TEXT PRIMARY KEY,
  received_on    DATE NOT NULL,
  channel        TEXT NOT NULL CHECK (channel IN ('ach','cheque','lockbox','card','wire')),
  amount_usd     NUMERIC(12,2) NOT NULL,
  -- As it appears on the payment, NOT the account name. Resolution is the job.
  payer_string   TEXT NOT NULL,
  received_branch_id TEXT REFERENCES summit.branches(branch_id),
  status         TEXT NOT NULL DEFAULT 'unapplied'
                   CHECK (status IN ('unapplied','applied','partially_applied','in_research')),
  bank_reference TEXT
);

CREATE TABLE IF NOT EXISTS summit.remittance_advices (
  advice_id    TEXT PRIMARY KEY,
  payment_id   TEXT NOT NULL REFERENCES summit.payments(payment_id),
  format       TEXT NOT NULL CHECK (format IN ('pdf_scan','email_body','edi_820','none')),
  -- For pdf_scan the document itself lives here as bytes and is parsed at tool
  -- call time; raw_text is populated only for email_body. Storing the PDF in
  -- the database rather than on disk keeps it available to the deployed app,
  -- whose zip artifact contains only dist/ and node_modules/.
  file_ref     TEXT,
  file_bytes   BYTEA,
  raw_text     TEXT,
  page_count   INTEGER
);

CREATE TABLE IF NOT EXISTS summit.disputes (
  dispute_id     TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  invoice_id     TEXT REFERENCES summit.invoices(invoice_id),
  reason_code    TEXT NOT NULL CHECK (reason_code IN
                   ('pricing','freight','rental_overage','warranty_misbilled','duplicate','quantity','damage')),
  disputed_amount_usd NUMERIC(12,2) NOT NULL,
  raised_on      DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  contract_clause TEXT,
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispute_account ON summit.disputes(account_id);

-- ── Service & warranty ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.work_orders (
  work_order_id  TEXT PRIMARY KEY,
  unit_id        TEXT REFERENCES summit.fleet_assets(unit_id),
  -- Deliberately the raw string from the service writer. May be ambiguous.
  serial_entered TEXT NOT NULL,
  account_id     TEXT REFERENCES summit.customer_accounts(account_id),
  branch_id      TEXT NOT NULL REFERENCES summit.branches(branch_id),
  opened_on      DATE NOT NULL,
  completed_on   DATE,
  meter_hours_at_service INTEGER,
  repair_code    TEXT,
  -- Verbatim technician notes: terse, abbreviated, sometimes causeless.
  technician_notes TEXT,
  complaint      TEXT,
  cause          TEXT,
  correction     TEXT,
  causal_part    TEXT,
  labour_hours_booked NUMERIC(6,2) NOT NULL DEFAULT 0,
  segment        TEXT NOT NULL DEFAULT 'customer_pay'
                   CHECK (segment IN ('customer_pay','internal','warranty')),
  status         TEXT NOT NULL DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS summit.work_order_lines (
  id            SERIAL PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES summit.work_orders(work_order_id),
  line_type     TEXT NOT NULL CHECK (line_type IN ('labour','part','misc')),
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  amount_usd    NUMERIC(12,2) NOT NULL,
  is_causal_part BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS summit.warranty_claims (
  claim_id       TEXT PRIMARY KEY,
  work_order_id  TEXT NOT NULL REFERENCES summit.work_orders(work_order_id),
  unit_id        TEXT REFERENCES summit.fleet_assets(unit_id),
  program_code   TEXT REFERENCES summit.oem_programs(program_code),
  claimed_labour_hours NUMERIC(6,2),
  standard_labour_hours NUMERIC(6,2),
  claimed_parts_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  claimed_total_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','submitted','approved','denied','resubmitted','goodwill','blocked')),
  submitted_on   DATE,
  adjudicated_on DATE,
  approved_amount_usd NUMERIC(12,2),
  denial_reason_code TEXT,
  denial_reason_text TEXT,
  -- Populated when the pre-submission gate blocks it, so the block is auditable.
  gate_result    TEXT,
  gate_failures  TEXT[]
);

-- ── Rental ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.rental_contracts (
  contract_id      TEXT PRIMARY KEY,
  unit_id          TEXT NOT NULL REFERENCES summit.fleet_assets(unit_id),
  account_id       TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  branch_id        TEXT NOT NULL REFERENCES summit.branches(branch_id),
  start_date       DATE NOT NULL,
  claimed_off_rent_date DATE,
  actual_collected_date DATE,
  rate_period      TEXT NOT NULL CHECK (rate_period IN ('daily','weekly','monthly')),
  rate_usd         NUMERIC(12,2) NOT NULL,
  included_hours   INTEGER NOT NULL,
  overage_rate_per_hour_usd NUMERIC(10,2) NOT NULL,
  delivery_charge_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  pickup_charge_usd   NUMERIC(12,2) NOT NULL DEFAULT 0,
  fuel_policy      TEXT NOT NULL DEFAULT 'return_full',
  damage_waiver    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Presence of a purchase option forces ASC 842 classification review.
  has_purchase_option BOOLEAN NOT NULL DEFAULT FALSE,
  purchase_option_terms TEXT,
  -- Negotiated rates differ from branch standard; billing at standard is a leak.
  is_negotiated_rate BOOLEAN NOT NULL DEFAULT FALSE,
  cycle_billing_day INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'on_rent'
                     CHECK (status IN ('on_rent','off_rent','closed','disputed'))
);

CREATE TABLE IF NOT EXISTS summit.telematics_readings (
  id            SERIAL PRIMARY KEY,
  unit_id       TEXT NOT NULL REFERENCES summit.fleet_assets(unit_id),
  reading_date  DATE NOT NULL,
  engine_hours  NUMERIC(10,2) NOT NULL,
  idle_hours    NUMERIC(10,2) NOT NULL DEFAULT 0,
  location      TEXT,
  -- FALSE marks a genuine reporting gap. Agents must never extrapolate across
  -- these to manufacture a billable number.
  reported      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (unit_id, reading_date)
);
CREATE INDEX IF NOT EXISTS idx_telem_unit_date ON summit.telematics_readings(unit_id, reading_date);

CREATE TABLE IF NOT EXISTS summit.condition_reports (
  report_id     TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES summit.rental_contracts(contract_id),
  unit_id       TEXT NOT NULL REFERENCES summit.fleet_assets(unit_id),
  report_type   TEXT NOT NULL CHECK (report_type IN ('check_out','check_in')),
  report_date   DATE NOT NULL,
  meter_hours   INTEGER,
  fuel_level_pct INTEGER,
  findings      TEXT,
  -- Distinguishing normal wear from chargeable damage is the whole job.
  damage_claimed_usd NUMERIC(12,2) DEFAULT 0,
  photo_refs    TEXT[]
);

-- ── Whole-goods ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summit.rebate_programs (
  program_id     TEXT PRIMARY KEY,
  manufacturer   TEXT NOT NULL,
  program_type   TEXT NOT NULL CHECK (program_type IN
                   ('retail_rebate','volume','floor_plan_credit','demo_allowance','trade_assistance','seasonal')),
  name           TEXT NOT NULL,
  value_usd      NUMERIC(12,2) NOT NULL,
  eligibility    TEXT NOT NULL,
  claim_deadline DATE NOT NULL,
  -- Claiming two mutually exclusive programs triggers a manufacturer chargeback.
  exclusive_with TEXT[] NOT NULL DEFAULT '{}',
  applies_to_class TEXT
);

CREATE TABLE IF NOT EXISTS summit.auction_comparables (
  id             SERIAL PRIMARY KEY,
  manufacturer   TEXT NOT NULL,
  model          TEXT NOT NULL,
  year_built     INTEGER NOT NULL,
  meter_hours    INTEGER NOT NULL,
  condition_grade TEXT NOT NULL,
  sale_price_usd NUMERIC(12,2) NOT NULL,
  sale_date      DATE NOT NULL,
  auction_house  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comps_model ON summit.auction_comparables(manufacturer, model);

CREATE TABLE IF NOT EXISTS summit.deals (
  deal_id        TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  branch_id      TEXT NOT NULL REFERENCES summit.branches(branch_id),
  unit_id        TEXT NOT NULL REFERENCES summit.fleet_assets(unit_id),
  salesperson    TEXT NOT NULL,
  -- Discount depth the salesperson may grant unaided, as a percentage.
  salesperson_authority_pct NUMERIC(5,2) NOT NULL DEFAULT 6,
  branch_authority_pct      NUMERIC(5,2) NOT NULL DEFAULT 12,
  sale_price_usd NUMERIC(12,2) NOT NULL,
  headline_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  bundled_components TEXT[] NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'quoted'
                   CHECK (status IN ('quoted','desk_review','blocked_pending_authority','approved','invoiced','lost')),
  quoted_on      DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS summit.trade_ins (
  trade_id       TEXT PRIMARY KEY,
  deal_id        TEXT NOT NULL REFERENCES summit.deals(deal_id),
  manufacturer   TEXT NOT NULL,
  model          TEXT NOT NULL,
  year_built     INTEGER NOT NULL,
  meter_hours    INTEGER NOT NULL,
  condition_grade TEXT NOT NULL,
  allowance_usd  NUMERIC(12,2) NOT NULL,
  reconditioning_estimate_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  deferred_maintenance TEXT
);

-- ── Financial actions (written by agents, read by the audit trail) ───────────
CREATE TABLE IF NOT EXISTS summit.credit_memos (
  memo_id        TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  invoice_id     TEXT REFERENCES summit.invoices(invoice_id),
  dispute_id     TEXT REFERENCES summit.disputes(dispute_id),
  amount_usd     NUMERIC(12,2) NOT NULL,
  reason         TEXT NOT NULL,
  contract_clause TEXT,
  calculation    TEXT,
  required_approval_level TEXT NOT NULL
                   CHECK (required_approval_level IN ('agent_auto','branch_controller','regional_cfo')),
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'prepared'
                   CHECK (status IN ('prepared','pending_approval','approved','issued','declined')),
  proposed_by_agent TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summit.credit_holds (
  hold_id        TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES summit.customer_accounts(account_id),
  justification  TEXT NOT NULL,
  hold_eligible_exposure_usd NUMERIC(12,2) NOT NULL,
  disputed_excluded_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  relationship_cost_usd NUMERIC(12,2),
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by    TEXT,
  status         TEXT NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','pending_approval','applied','declined','released')),
  proposed_by_agent TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summit.journal_entries (
  entry_id       TEXT PRIMARY KEY,
  posted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branch_id      TEXT NOT NULL REFERENCES summit.branches(branch_id),
  account_id     TEXT REFERENCES summit.customer_accounts(account_id),
  invoice_id     TEXT REFERENCES summit.invoices(invoice_id),
  payment_id     TEXT REFERENCES summit.payments(payment_id),
  entry_type     TEXT NOT NULL CHECK (entry_type IN
                   ('cash_application','credit_memo','warranty_receivable','rental_adjustment','writeoff')),
  debit_account  TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  amount_usd     NUMERIC(12,2) NOT NULL,
  accounting_period TEXT NOT NULL,
  -- Every posting must name the document that justifies it.
  source_document TEXT NOT NULL,
  confidence     NUMERIC(4,3),
  posted_by_agent TEXT,
  approved_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_je_branch ON summit.journal_entries(branch_id);

CREATE TABLE IF NOT EXISTS summit.research_queue (
  item_id        TEXT PRIMARY KEY,
  payment_id     TEXT REFERENCES summit.payments(payment_id),
  reason_code    TEXT NOT NULL,
  ambiguity      TEXT NOT NULL,
  candidates     JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence     NUMERIC(4,3),
  residual_usd   NUMERIC(12,2),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  routed_by_agent TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * Read-only role for the agent connection. The connection's `allowedTables`
 * list is the first gate; this is the second, independent one — an agent that
 * escaped the allowlist still cannot write, and cannot see platform tables at
 * all. Password is supplied at setup time, never hard-coded.
 */
export function grantsSql(roleName: string): string {
  return `
GRANT USAGE ON SCHEMA ${SUMMIT_SCHEMA} TO ${roleName};
GRANT SELECT ON ALL TABLES IN SCHEMA ${SUMMIT_SCHEMA} TO ${roleName};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${SUMMIT_SCHEMA} GRANT SELECT ON TABLES TO ${roleName};
REVOKE ALL ON SCHEMA public FROM ${roleName};
`;
}

/**
 * The write role used by the VitalEdge dealer action connector. Separate from
 * the read role on purpose: the read connection the agents explore with
 * physically cannot mutate the ledger, so "the agent posted it" is always
 * attributable to a deliberate action-tool call rather than a stray query.
 */
export function writeGrantsSql(roleName: string): string {
  return `
GRANT USAGE ON SCHEMA ${SUMMIT_SCHEMA} TO ${roleName};
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ${SUMMIT_SCHEMA} TO ${roleName};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SUMMIT_SCHEMA} TO ${roleName};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${SUMMIT_SCHEMA}
  GRANT SELECT, INSERT, UPDATE ON TABLES TO ${roleName};
REVOKE ALL ON SCHEMA public FROM ${roleName};
`;
}

export const DROP_SCHEMA_SQL = `DROP SCHEMA IF EXISTS ${SUMMIT_SCHEMA} CASCADE;`;
