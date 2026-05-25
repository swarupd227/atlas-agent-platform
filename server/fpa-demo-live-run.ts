/**
 * FP&A Financial Variance Agent Demo
 * Cross-system: Snowflake (actuals) → Workday GL (budget) → compute variance → Slack summary
 *
 * Steps:
 *  1. sf_execute_query     — Query Snowflake FINANCE.GL.ACTUALS for Q2 actuals by cost center
 *  2. wd_get_gl_summary    — Pull Workday GL budget for same cost center + period
 *  3. wd_get_financial_period — Get current fiscal period metadata from Workday
 *  4. sf_get_column_stats  — Stats on the actuals_amount column for data quality check
 *  5. slack_post_message   — Post formatted variance summary to #fp-and-a-alerts Slack channel
 */

import { getDefaultOrgId } from "./auth";

export interface FpaDemoStep {
  id: number;
  title: string;
  tool: string;
  integration: string;
  status: "pending" | "running" | "complete" | "error";
  input?: Record<string, unknown>;
  output?: unknown;
  elapsedMs?: number;
  mode: "live" | "demo";
}

export interface FpaDemoState {
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null;
  completedAt: string | null;
  steps: FpaDemoStep[];
  summary: FpaDemoSummary | null;
  elapsedMs: number;
}

export interface FpaDemoSummary {
  costCenter: string;
  period: string;
  actuals: number;
  budget: number;
  variance: number;
  variancePct: number;
  status: "favorable" | "unfavorable" | "on-target";
  slackChannel: string;
  slackTs: string | null;
  note: string;
}

let _state: FpaDemoState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  steps: [],
  summary: null,
  elapsedMs: 0,
};

const DEMO_COST_CENTER = "CC-1042";
const DEMO_PERIOD = "Q2-2026";
const DEMO_SLACK_CHANNEL = "#fp-and-a-alerts";

function resetState(): void {
  _state = {
    status: "idle",
    startedAt: null,
    completedAt: null,
    steps: [],
    summary: null,
    elapsedMs: 0,
  };
}

function initStep(id: number, title: string, tool: string, integration: string, input: Record<string, unknown>): FpaDemoStep {
  return { id, title, tool, integration, status: "pending", input, mode: "demo" };
}

async function runFpaDemo(orgId: string): Promise<void> {
  const start = Date.now();
  _state.status = "running";
  _state.startedAt = new Date().toISOString();

  const steps: FpaDemoStep[] = [
    initStep(1, "Query Snowflake actuals for cost center Q2", "sf_execute_query", "snowflake", {
      sql: `SELECT cost_center, SUM(amount) AS actuals_total, COUNT(*) AS transaction_count FROM FINANCE.GL.ACTUALS WHERE cost_center = '${DEMO_COST_CENTER}' AND period = '${DEMO_PERIOD}' GROUP BY cost_center`,
    }),
    initStep(2, "Pull Workday GL budget summary", "wd_get_gl_summary", "workday", {
      cost_center: DEMO_COST_CENTER,
      period: DEMO_PERIOD,
    }),
    initStep(3, "Get Workday financial period metadata", "wd_get_financial_period", "workday", {}),
    initStep(4, "Column stats on actuals amount (data quality)", "sf_get_column_stats", "snowflake", {
      database: "FINANCE",
      schema: "GL",
      table: "ACTUALS",
      column: "AMOUNT",
    }),
    initStep(5, "Post variance summary to Slack #fp-and-a-alerts", "slack_post_message", "slack", {
      channel: DEMO_SLACK_CHANNEL,
      text: "FP&A variance alert",
    }),
  ];
  _state.steps = steps;

  // Attempt live tool calls; fall back to representative mock data per step

  // ── Step 1: Snowflake actuals ────────────────────────────────────────────
  steps[0].status = "running";
  let actualsAmount = 4_820_500;
  try {
    const { snowflakeMcpServer } = await import("./integrations/snowflake/mcp-server");
    const t0 = Date.now();
    const result = await snowflakeMcpServer.callTool("sf_execute_query", steps[0].input!, orgId);
    steps[0].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[0].output = JSON.parse(result.content[0].text);
      steps[0].mode = "live";
      const rows = (steps[0].output as any)?.rows;
      if (rows?.[0]?.ACTUALS_TOTAL) actualsAmount = parseFloat(rows[0].ACTUALS_TOTAL);
    } else {
      steps[0].output = { rows: [{ cost_center: DEMO_COST_CENTER, actuals_total: actualsAmount, transaction_count: 1247 }], row_count: 1, truncated: false };
    }
  } catch {
    steps[0].elapsedMs = 0;
    steps[0].output = { rows: [{ cost_center: DEMO_COST_CENTER, actuals_total: actualsAmount, transaction_count: 1247 }], row_count: 1, truncated: false };
  }
  steps[0].status = "complete";

  // ── Step 2: Workday GL budget ────────────────────────────────────────────
  steps[1].status = "running";
  let budgetAmount = 5_000_000;
  try {
    const { workdayMcpServer } = await import("./integrations/workday/mcp-server");
    const t0 = Date.now();
    const result = await workdayMcpServer.callTool("wd_get_gl_summary", steps[1].input!, orgId);
    steps[1].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[1].output = JSON.parse(result.content[0].text);
      steps[1].mode = "live";
      const data = steps[1].output as any;
      if (data?.budgetTotal) budgetAmount = parseFloat(data.budgetTotal);
    } else {
      steps[1].output = {
        costCenter: DEMO_COST_CENTER,
        period: DEMO_PERIOD,
        budgetTotal: budgetAmount,
        glAccounts: [
          { account: "6100 — Salaries & Wages", budget: 3_200_000, actuals: 3_108_000 },
          { account: "6200 — Benefits",          budget:   640_000, actuals:   621_600 },
          { account: "6300 — Travel & Expense",  budget:   360_000, actuals:   488_400 },
          { account: "6400 — Software & Licenses", budget: 800_000, actuals: 602_500 },
        ],
      };
    }
  } catch {
    steps[1].elapsedMs = 0;
    steps[1].output = { costCenter: DEMO_COST_CENTER, period: DEMO_PERIOD, budgetTotal: budgetAmount };
  }
  steps[1].status = "complete";

  // ── Step 3: Workday financial period ─────────────────────────────────────
  steps[2].status = "running";
  try {
    const { workdayMcpServer } = await import("./integrations/workday/mcp-server");
    const t0 = Date.now();
    const result = await workdayMcpServer.callTool("wd_get_financial_period", {}, orgId);
    steps[2].elapsedMs = Date.now() - t0;
    if (!result.isError) { steps[2].output = JSON.parse(result.content[0].text); steps[2].mode = "live"; }
    else steps[2].output = { currentPeriod: DEMO_PERIOD, fiscalYear: "FY2026", periodStatus: "Open", periodEnd: "2026-06-30" };
  } catch {
    steps[2].elapsedMs = 0;
    steps[2].output = { currentPeriod: DEMO_PERIOD, fiscalYear: "FY2026", periodStatus: "Open", periodEnd: "2026-06-30" };
  }
  steps[2].status = "complete";

  // ── Step 4: Snowflake column stats ───────────────────────────────────────
  steps[3].status = "running";
  try {
    const { snowflakeMcpServer } = await import("./integrations/snowflake/mcp-server");
    const t0 = Date.now();
    const result = await snowflakeMcpServer.callTool("sf_get_column_stats", steps[3].input!, orgId);
    steps[3].elapsedMs = Date.now() - t0;
    if (!result.isError) { steps[3].output = JSON.parse(result.content[0].text); steps[3].mode = "live"; }
    else steps[3].output = { total_rows: 18420, non_null_count: 18420, null_count: 0, null_pct: 0, min_val: -12500, max_val: 847300, avg_val: 3871.42 };
  } catch {
    steps[3].elapsedMs = 0;
    steps[3].output = { total_rows: 18420, non_null_count: 18420, null_count: 0, null_pct: 0, avg_val: 3871.42 };
  }
  steps[3].status = "complete";

  // ── Compute variance ─────────────────────────────────────────────────────
  const variance = actualsAmount - budgetAmount;
  const variancePct = budgetAmount > 0 ? Math.round((variance / budgetAmount) * 10000) / 100 : 0;
  const varStatus: "favorable" | "unfavorable" | "on-target" =
    Math.abs(variancePct) < 2 ? "on-target" : variance < 0 ? "favorable" : "unfavorable";
  const varEmoji = varStatus === "favorable" ? "✅" : varStatus === "unfavorable" ? "⚠️" : "✳️";
  const varSign = variance >= 0 ? "+" : "";

  // ── Step 5: Slack post ────────────────────────────────────────────────────
  steps[4].status = "running";
  const slackText =
    `*FP&A Variance Report — ${DEMO_COST_CENTER} / ${DEMO_PERIOD}*\n\n` +
    `${varEmoji} *Status:* ${varStatus.toUpperCase()}\n` +
    `• Actuals:  $${actualsAmount.toLocaleString()}\n` +
    `• Budget:   $${budgetAmount.toLocaleString()}\n` +
    `• Variance: ${varSign}$${Math.abs(variance).toLocaleString()} (${varSign}${variancePct}%)\n\n` +
    `_Source: Snowflake FINANCE.GL.ACTUALS × Workday GL Summary | Period: ${DEMO_PERIOD}_`;

  let slackTs: string | null = null;
  try {
    const { slackMcpServer } = await import("./integrations/slack/mcp-server");
    const t0 = Date.now();
    const result = await slackMcpServer.callTool("slack_post_message", {
      channel: DEMO_SLACK_CHANNEL,
      text: slackText,
      agent_name: "Financial Variance Agent",
    }, orgId);
    steps[4].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[4].output = JSON.parse(result.content[0].text);
      steps[4].mode = "live";
      slackTs = (steps[4].output as any)?.ts ?? null;
    } else {
      steps[4].output = { ok: true, channel: DEMO_SLACK_CHANNEL, ts: "1748000000.000001", message: slackText, attribution_added: true };
    }
  } catch {
    steps[4].elapsedMs = 0;
    steps[4].output = { ok: true, channel: DEMO_SLACK_CHANNEL, ts: "1748000000.000001", message: slackText };
  }
  steps[4].status = "complete";

  _state.summary = {
    costCenter: DEMO_COST_CENTER,
    period: DEMO_PERIOD,
    actuals: actualsAmount,
    budget: budgetAmount,
    variance,
    variancePct,
    status: varStatus,
    slackChannel: DEMO_SLACK_CHANNEL,
    slackTs,
    note: "Cross-system join: Snowflake actuals × Workday GL budget — variance computed in-agent without BI layer",
  };

  _state.status = "complete";
  _state.completedAt = new Date().toISOString();
  _state.elapsedMs = Date.now() - start;
}

export function fpaTriggerHandler(req: any, res: any): void {
  if (_state.status === "running") {
    res.json({ message: "FP&A demo already running", status: "running" });
    return;
  }
  resetState();
  const orgId = (req as any).orgId ?? getDefaultOrgId();
  runFpaDemo(orgId).catch(err => {
    _state.status = "error";
    _state.completedAt = new Date().toISOString();
  });
  res.json({ message: "FP&A Financial Variance demo started", status: "running" });
}

export function fpaStatusHandler(_req: any, res: any): void {
  res.json(_state);
}

export function fpaResetHandler(_req: any, res: any): void {
  resetState();
  res.json({ message: "FP&A demo reset", status: "idle" });
}
