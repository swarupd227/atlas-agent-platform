export const GL_SYNC_AGENT_IDS = {
  A0_ORCHESTRATOR:   "a0000000-0000-4000-8000-000000000000",
  A1_CATALOG:        "a1000000-0000-4000-8000-000000000001",
  A2_EXTRACTION:     "a2000000-0000-4000-8000-000000000002",
  A3_TRANSFORMATION: "a3000000-0000-4000-8000-000000000003",
  A4_DIMENSION:      "a4000000-0000-4000-8000-000000000004",
  A5_POSTING:        "a5000000-0000-4000-8000-000000000005",
  A6_RECONCILIATION: "a6000000-0000-4000-8000-000000000006",
} as const;

export const GL_SYNC_MCP_IDS = {
  KINECTIVE_GATEWAY_GL:   "c1000000-0000-4000-8000-000000000001",
  SAGE_INTACCT:           "c2000000-0000-4000-8000-000000000002",
  RECONCILIATION_LEDGER:  "c3000000-0000-4000-8000-000000000003",
  FILE_DELIVERY:          "c4000000-0000-4000-8000-000000000004",
  NOTIFICATION:           "c5000000-0000-4000-8000-000000000005",
} as const;

export const GL_SYNC_CONFIG = {
  institution:  "Cascade Ridge Credit Union",
  assets:       "$1.8B",
  branches:     14,
  coreSystem:   "Symitar (Episys)",
  glSystem:     "Sage Intacct",
  syncSchedule: "Daily at 06:30 ET",
  streamPath:   "/demo-api/kinective-gl/stream",
  resetPath:    "/demo-api/kinective-gl/reset",
} as const;

export const GL_SYNC_SCENARIOS = {
  happy: {
    label: "Happy Path",
    description: "All 1,742 entries extracted, transformed, dimensioned, and posted",
    subLabel: "Control totals balance — $47.4M",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  dimension_mismatch: {
    label: "Dimension Mismatch",
    description: "47 commercial entries missing Kirkland branch (BR-14) dimension",
    subLabel: "Exception queue — human review required",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  control_total_variance: {
    label: "Control Total Variance",
    description: "FX rate divergence creates $1,000 variance between Symitar & Intacct",
    subLabel: "GL Controller escalation — PENDING_REVIEW",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
  },
} as const;

export type GlSyncScenarioKey = keyof typeof GL_SYNC_SCENARIOS;

export const GL_SYNC_AGENT_COLORS: Record<number, string> = {
  0: "bg-violet-600",
  1: "bg-blue-600",
  2: "bg-cyan-600",
  3: "bg-teal-600",
  4: "bg-amber-600",
  5: "bg-emerald-600",
  6: "bg-indigo-600",
};

export const GL_SYNC_TOOL_AGENT_MAP: Record<string, number> = {
  get_watermark:              0,
  check_idempotency_key:      0,
  set_watermark:              6,
  record_posting:             6,
  get_gl_account_catalog:     1,
  list_gl_accounts:           1,
  get_prior_day_gl_entries:   2,
  get_control_total:          2,
  list_dimensions:            4,
  post_journal_entry:         5,
  get_journal_entry_status:   5,
  deliver_file:               6,
  send_notification:          6,
  get_notification_history:   6,
  get_delivery_status:        6,
};
