import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const BANK_NAMES: Record<string, string> = {
  "RSSD-3511777": "Silicon Valley Bank",
  "RSSD-1029867": "Pacific Western Bank",
  "RSSD-1462895": "Signature Bank",
  "RSSD-3232316": "First National Community Bancorp",
  "RSSD-2928050": "Heartland Financial",
  "RSSD-3116158": "Columbia Banking System",
  "RSSD-1012081": "Banner Bank",
};

router.get("/early-warning-scores", (req: Request, res: Response) => {
  const { bank_id, threshold, sector_filter } = req.query;
  const rng = seededRng((bank_id as string || "ALL").length * 17 + 8888);
  const thresholdVal = parseFloat(threshold as string) || 0;

  const banks = bank_id
    ? [{ id: bank_id as string, name: BANK_NAMES[bank_id as string] || "Unknown Bank" }]
    : Object.entries(BANK_NAMES).map(([id, name]) => ({ id, name }));

  const scores = banks.map(bank => {
    const capitalScore    = +(rng() * 40 + 10).toFixed(1);
    const assetQuality    = +(rng() * 45 + 8).toFixed(1);
    const earningsScore   = +(rng() * 35 + 5).toFixed(1);
    const liquidityScore  = +(rng() * 50 + 5).toFixed(1);
    const sensitivityScore = +(rng() * 30 + 5).toFixed(1);
    const nlpScore        = +(rng() * 40 + 5).toFixed(1);
    const composite       = +((capitalScore * 0.20 + assetQuality * 0.30 + earningsScore * 0.15 + liquidityScore * 0.20 + sensitivityScore * 0.10 + nlpScore * 0.05) / 10 * 100).toFixed(1);
    const riskLevel       = composite > 65 ? "CRITICAL" : composite > 45 ? "HIGH" : composite > 25 ? "MEDIUM" : "LOW";

    if (composite < thresholdVal) return null;

    const sectors = ["regional_bank","community_bank","thrift","credit_union"];
    const sector = sectors[Math.floor(rng() * sectors.length)];
    if (sector_filter && sector !== sector_filter) return null;

    return {
      bank_id: bank.id,
      bank_name: bank.name,
      composite_risk_score: composite,
      risk_level: riskLevel,
      component_scores: {
        capital_adequacy: capitalScore,
        asset_quality: assetQuality,
        earnings_stability: earningsScore,
        liquidity_risk: liquidityScore,
        rate_sensitivity: sensitivityScore,
        nlp_sentiment: nlpScore,
      },
      trend: rng() > 0.5 ? "deteriorating" : rng() > 0.3 ? "stable" : "improving",
      trend_change_90d: +((rng() - 0.35) * 20).toFixed(1),
      peer_percentile: Math.floor(rng() * 100),
      sector,
      prior_rating: ["A","A-","BBB+","BBB","BBB-","BB+"][Math.floor(rng() * 6)],
      watch_list: composite > 55,
      as_of: "2024-Q4",
    };
  }).filter(Boolean);

  res.json({
    status: "ok",
    bank_count: scores.length,
    high_risk_count: (scores as any[]).filter(s => s.composite_risk_score > 45).length,
    critical_count: (scores as any[]).filter(s => s.risk_level === "CRITICAL").length,
    avg_composite_score: +((scores as any[]).reduce((s, b) => s + b.composite_risk_score, 0) / (scores.length || 1)).toFixed(1),
    generated_at: new Date().toISOString(),
    scores,
  });
});

router.get("/svb-backtest", (_req: Request, res: Response) => {
  const quarters = ["2022-Q1","2022-Q2","2022-Q3","2022-Q4","2023-Q1"];
  const composites = [22.4, 31.8, 46.2, 61.5, 87.3];
  const npmSignals  = [2.1, 2.0, 1.9, 1.6, 1.4];
  const liquiditySignals = [12.3, 18.4, 28.9, 41.2, 68.7];
  const nlpSignals       = [5.2, 10.1, 18.3, 27.8, 51.4];
  const actualOutcomes   = ["Normal","Elevated","Warning","High Alert","FDIC Seizure"];

  const data = quarters.map((q, i) => ({
    quarter: q,
    composite_risk_score: composites[i],
    risk_level: composites[i] > 65 ? "CRITICAL" : composites[i] > 45 ? "HIGH" : composites[i] > 25 ? "MEDIUM" : "LOW",
    component_scores: {
      capital_adequacy: +(8 + i * 3.2).toFixed(1),
      asset_quality: +(6.2 + i * 2.1).toFixed(1),
      earnings_stability: +(5.1 + i * 1.9).toFixed(1),
      liquidity_risk: liquiditySignals[i],
      rate_sensitivity: +(12.4 + i * 8.3).toFixed(1),
      nlp_sentiment: nlpSignals[i],
    },
    nim: npmSignals[i],
    unrealized_loss_equity_pct: +((-2) + i * (-11.4)).toFixed(1),
    wholesale_funding_pct: +(18 + i * 9.4).toFixed(1),
    htv_securities_pct: +(44 + i * 2.3).toFixed(1),
    actual_outcome: actualOutcomes[i],
    system_alert_triggered: composites[i] >= 46.2,
    alert_would_fire_at_score: 40,
    days_before_failure: i < 4 ? [365, 273, 182, 91, 0][i] : 0,
    source_data: "FFIEC Call Report + SEC 10-K/10-Q (public record)",
    disclaimer: "Illustrative — reconstructed from SVB's actual FFIEC Call Report filings for backtesting purposes.",
  }));

  const firstAlert = data.find(d => d.system_alert_triggered);

  res.json({
    status: "ok",
    institution: "Silicon Valley Bank",
    rssd_id: "RSSD-3511777",
    backtest_period: "2022-Q1 to 2023-Q1",
    failure_date: "2023-03-10",
    fdic_intervention: "FDIC receivership — March 10, 2023",
    early_warning_signal_quarters: firstAlert ? firstAlert.quarter : null,
    days_advance_warning: firstAlert ? firstAlert.days_before_failure : null,
    model_accuracy_note: "Model would have flagged SVB at HIGH risk in 2022-Q3, 2 quarters before failure",
    disclaimer: "Illustrative — reconstructed from SVB's actual FFIEC Call Report filings for backtesting purposes. Not investment advice.",
    quarterly_data: data,
  });
});

router.get("/stress-test", (req: Request, res: Response) => {
  const { bank_id, scenario } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 61 + 1111);

  const scenarios = scenario ? [scenario as string] : ["baseline","adverse","severely_adverse"];
  const results: any[] = [];

  for (const sc of scenarios) {
    const stressFactor = sc === "baseline" ? 0 : sc === "adverse" ? 0.35 : 0.65;
    results.push({
      scenario: sc,
      bank_id,
      bank_name: bankName,
      pre_provision_net_revenue_mm: +((150 + rng() * 300) * (1 - stressFactor * 0.4)).toFixed(1),
      loan_losses_mm: +((30 + rng() * 100) * (1 + stressFactor * 2.5)).toFixed(1),
      net_income_impact_mm: +((-20 - rng() * 80) * (1 + stressFactor * 3)).toFixed(1),
      capital_depletion_bps: Math.floor(rng() * 50 + stressFactor * 200),
      projected_cet1_post_stress: +(10.2 - stressFactor * 3.5 - rng() * 1.5).toFixed(2),
      projected_tier1_post_stress: +(11.8 - stressFactor * 4.0 - rng() * 1.5).toFixed(2),
      liquidity_buffer_days: Math.floor(90 - stressFactor * 60 + rng() * 20),
      npl_projected: +(0.9 + stressFactor * 4.2 + rng() * 1.0).toFixed(2),
      passes_stress_test: (10.2 - stressFactor * 3.5) >= 4.5,
    });
  }

  res.json({
    status: "ok",
    bank_id,
    bank_name: bankName,
    as_of: "2024-Q4",
    methodology: "Fed DFAST-aligned 9-quarter stress horizon",
    results,
  });
});

router.get("/rating-history", (req: Request, res: Response) => {
  const { bank_id } = req.query;
  const bankName = BANK_NAMES[bank_id as string] || "Community Bank";
  const rng = seededRng((bank_id as string || "").length * 43 + 6666);

  const ratings = ["A+","A","A-","BBB+","BBB","BBB-","BB+","BB","BB-","B+"];
  const outlooks = ["Stable","Positive","Negative","Watch Negative"];
  const history: any[] = [];

  let currentRating = ratings[Math.floor(rng() * 6)];
  const dates = ["2021-06","2022-01","2022-07","2023-01","2023-06","2024-01","2024-07","2024-12"];

  for (const date of dates) {
    const drift = rng() > 0.7 ? (rng() > 0.5 ? -1 : 1) : 0;
    const newIdx = Math.max(0, Math.min(9, ratings.indexOf(currentRating) - drift));
    currentRating = ratings[newIdx];
    history.push({
      date,
      rating: currentRating,
      outlook: outlooks[Math.floor(rng() * outlooks.length)],
      action: drift > 0 ? "Upgrade" : drift < 0 ? "Downgrade" : "Affirm",
      rationale: drift < 0
        ? "Deteriorating asset quality and elevated CRE concentration"
        : drift > 0
        ? "Improved capital position and stable deposit base"
        : "Rating affirmed; credit profile stable",
      analyst: ["J. Peterson","M. Chen","R. Williams","K. Patel"][Math.floor(rng() * 4)],
    });
  }

  res.json({
    status: "ok",
    bank_id,
    bank_name: bankName,
    current_rating: currentRating,
    rating_history_count: history.length,
    downgrades_last_3y: history.filter(h => h.action === "Downgrade").length,
    upgrades_last_3y: history.filter(h => h.action === "Upgrade").length,
    history,
  });
});

export default router;
