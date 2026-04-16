import { Router, type Request, type Response } from "express";

const router = Router();

// GET /analytics-dashboard — KPI summary across the OneSpan Digital Agreements platform
router.get("/analytics-dashboard", (_req: Request, res: Response) => {
  const now = new Date();

  res.json({
    dashboard: {
      period: "rolling_30d",
      as_of:  now.toISOString(),
      kpis: {
        total_transactions:        284,
        completion_rate_pct:       88.3,
        completion_rate_benchmark: 92.5,
        completion_rate_gap:       -4.2,
        avg_time_to_complete_hours: 18.4,
        benchmark_time_hours:       12.0,
        decline_rate_pct:          4.2,
        decline_rate_benchmark:    1.8,
        stall_count:               7,
        stall_benchmark:           2,
        revenue_at_risk_usd:       340000,
        csat_score:                4.1,
        csat_benchmark:            4.6,
        nps:                       38,
      },
      trend_vs_prior_30d: {
        completion_rate_delta_ppt: -2.1,
        avg_time_delta_hours:      +4.2,
        decline_rate_delta_ppt:    +1.4,
        stall_count_delta:         +4,
      },
      top_decline_reasons: [
        { reason: "Document version mismatch", count: 5, pct: 41.7, correctable: true },
        { reason: "Signer authentication failure", count: 4, pct: 33.3, correctable: true },
        { reason: "Incorrect signer info", count: 2, pct: 16.7, correctable: true },
        { reason: "Signer refused", count: 1, pct: 8.3, correctable: false },
      ],
      product_breakdown: [
        { product: "Commercial Loan",  transactions: 84, completion_pct: 86.9, avg_hours: 21.2 },
        { product: "Mortgage",         transactions: 71, completion_pct: 89.4, avg_hours: 16.8 },
        { product: "Credit Facility",  transactions: 63, completion_pct: 90.5, avg_hours: 14.1 },
        { product: "Line of Credit",   transactions: 38, completion_pct: 92.1, avg_hours: 11.4 },
        { product: "Term Loan",        transactions: 28, completion_pct: 82.1, avg_hours: 26.3 },
      ],
    },
    generated_at: now.toISOString(),
  });
});

// GET /peer-completion-benchmarks — industry peer benchmarks for digital agreement completion
router.get("/peer-completion-benchmarks", (_req: Request, res: Response) => {
  res.json({
    benchmarks: {
      data_source:  "OneSpan Platform Anonymized Benchmarks — Q1 2026",
      peer_group:   "North American Commercial Banks (AUM > $10B)",
      peer_count:   47,
      our_metrics: {
        completion_rate_pct: 88.3,
        avg_time_hours:      18.4,
        decline_rate_pct:    4.2,
        stall_rate_pct:      2.5,
        mobile_completion_pct: 61.2,
      },
      peer_percentiles: {
        completion_rate: { p25: 85.1, p50: 91.2, p75: 94.7, p90: 96.8, our_percentile: 32 },
        avg_time_hours:  { p25: 8.4,  p50: 13.1, p75: 19.6, p90: 28.4, our_percentile: 69 },
        decline_rate:    { p25: 1.1,  p50: 2.1,  p75: 3.4,  p90: 5.2,  our_percentile: 78 },
        stall_rate:      { p25: 0.8,  p50: 1.4,  p75: 2.2,  p90: 3.8,  our_percentile: 81 },
      },
      top_quartile_practices: [
        "Pre-send document version validation gate",
        "Signer email validation before envelope dispatch",
        "Automated 48h nudge with mobile-optimized link",
        "RM notification on VIP transaction stall (>4h)",
        "Real-time version mismatch detection and correction",
      ],
      gap_to_p75_completion: 6.4,
      estimated_revenue_impact_usd: 340000,
    },
    generated_at: new Date().toISOString(),
  });
});

// GET /policy-compliance-status — compliance status of outstanding transactions
router.get("/policy-compliance-status", (_req: Request, res: Response) => {
  res.json({
    compliance: {
      overall_status: "ISSUES_DETECTED",
      policy_framework: "OneSpan Enterprise Agreement Policy v3.2",
      checks: [
        { policy: "Document Version Currency",      status: "VIOLATION", severity: "HIGH",   affected_txns: ["TXN-2026-00847"], detail: "TXN-2026-00847 sent with deprecated document version v1.2; v1.4 required per 2026-Q1 regulatory update" },
        { policy: "VIP Transaction SLA (4h alert)", status: "VIOLATION", severity: "HIGH",   affected_txns: ["TXN-2026-00847"], detail: "VIP transaction stalled 14h without RM notification" },
        { policy: "Signer Inactivity Alert (48h)",  status: "VIOLATION", severity: "MEDIUM", affected_txns: ["TXN-2026-00831","TXN-2026-00784"], detail: "2 transactions exceed 48h inactivity threshold without nudge" },
        { policy: "AML Attestation Clause",          status: "VIOLATION", severity: "CRITICAL", affected_txns: ["TXN-2026-00847"], detail: "Commercial loan >$500K must use v1.4 containing mandatory AML attestation (2026-Q1)" },
        { policy: "Envelope Audit Trail Completeness", status: "PASS",   severity: "N/A",    affected_txns: [], detail: "All envelopes have complete audit trails" },
        { policy: "eSignature Legal Validity",       status: "PASS",     severity: "N/A",    affected_txns: [], detail: "All completed agreements use OneSpan certified eSignature" },
      ],
      critical_violations: 1,
      high_violations:     2,
      medium_violations:   1,
      remediation_priority: "IMMEDIATE — AML attestation gap in active VIP loan is regulatory risk",
    },
    generated_at: new Date().toISOString(),
  });
});

// POST /generate-ops-report — generate portfolio operations intelligence report
router.post("/generate-ops-report", (req: Request, res: Response) => {
  const {
    include_recommendations = true,
    include_benchmarks      = true,
    period                  = "rolling_30d",
  } = req.body || {};

  res.json({
    report: {
      report_id:  `OPS-RPT-${Date.now().toString(36).toUpperCase()}`,
      title:      "Digital Agreements Portfolio Health Report — ATLAS Intelligence",
      period,
      generated_at: new Date().toISOString(),
      executive_summary: "Portfolio completion rate 88.3% is 4.2 ppt below the 92.5% peer benchmark. Seven active stalls and one VIP declined transaction (TXN-2026-00847, $1.2M commercial loan) represent $340K in revenue at risk. Root cause: document version mismatch policy gap — v1.2 templates dispatched for loans requiring v1.4 (2026-Q1 AML update). Immediate intervention initiated.",
      key_findings: [
        "VIP decline TXN-2026-00847 correctable — automated resend with v1.4 initiated by AGR-003",
        "Document version validation gate absent in pre-send workflow — systemic root cause",
        "Completion rate 4.2 ppt below peer median — rank 32nd percentile of 47 peer institutions",
        "Stall count 7 vs benchmark 2 — signer nudge automation not deployed",
        "AML attestation clause gap in commercial loans >$500K — regulatory risk",
      ],
      recommendations: include_recommendations ? [
        { priority: "IMMEDIATE", action: "Implement pre-send document version validation gate", impact: "Eliminates version mismatch class of declines (~42% of declines)" },
        { priority: "HIGH",      action: "Deploy automated 48h signer nudge (SMS + email)", impact: "Expected to resolve 4–5 of 7 active stalls" },
        { priority: "HIGH",      action: "Activate VIP transaction RM alert at 4h stall threshold", impact: "Protects high-value deals with proactive human intervention" },
        { priority: "MEDIUM",    action: "Integrate document library version management into sender UI", impact: "Reduces operator error for template selection" },
      ] : [],
      benchmarks_included: include_benchmarks,
      compliance_flags: 4,
      pipeline_status:  "COMPLETE",
    },
    generated_at: new Date().toISOString(),
  });
});

export default router;
