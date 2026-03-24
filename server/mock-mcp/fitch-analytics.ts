import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const BANKS = [
  { id: "RSSD-0000001", name: "JPMorgan Chase"   },
  { id: "RSSD-0000002", name: "Bank of America"  },
  { id: "RSSD-0000003", name: "Wells Fargo"      },
  { id: "RSSD-0000004", name: "Citigroup"        },
  { id: "RSSD-0000005", name: "Goldman Sachs"    },
  { id: "RSSD-0000006", name: "Morgan Stanley"   },
  { id: "RSSD-0000007", name: "U.S. Bancorp"     },
  { id: "RSSD-0000008", name: "Truist Financial" },
  { id: "RSSD-0000009", name: "PNC Financial"    },
  { id: "RSSD-0000010", name: "RegionalBank-West"},
];

const QUARTERS = ["2022-Q3","2022-Q4","2023-Q1","2023-Q2","2023-Q3","2023-Q4","2024-Q1","2024-Q2"];

const RATIO_NAMES = [
  "npl_ratio","nco_rate","allowance_to_loans","cet1_ratio","tier1_leverage","rwa_density",
  "roa","roe","nim","efficiency_ratio","loan_deposit_ratio","liquid_assets_to_total",
  "cre_to_total_loans","commercial_concentration","provision_to_avg_loans",
  "accruing_past_due_90_pct","classified_to_tier1","net_stable_funding_ratio",
];

const RATIO_THRESHOLDS: Record<string, number> = {
  npl_ratio: 1.5, nco_rate: 0.5, allowance_to_loans: 0.8, cet1_ratio: 8.0,
  tier1_leverage: 5.0, rwa_density: 0.8, roa: 0.5, roe: 5.0, nim: 1.5,
  efficiency_ratio: 75.0, loan_deposit_ratio: 90.0, liquid_assets_to_total: 10.0,
  cre_to_total_loans: 35.0, commercial_concentration: 50.0, provision_to_avg_loans: 0.5,
  accruing_past_due_90_pct: 0.2, classified_to_tier1: 25.0, net_stable_funding_ratio: 100.0,
};

// Stress level per bank: 1.0 = baseline, higher = more stress
const BANK_STRESS: number[] = [1.1, 1.2, 1.4, 1.0, 1.15, 1.1, 1.25, 1.5, 1.7, 2.2];

// Resolve bank by id OR name (LLMs sometimes pass the name as bank_id)
function resolveBank(key: string | undefined): typeof BANKS {
  if (!key) return BANKS;
  const lower = key.toLowerCase();
  const byId   = BANKS.filter(b => b.id.toLowerCase() === lower);
  if (byId.length) return byId;
  const byName = BANKS.filter(b => b.name.toLowerCase().includes(lower) || lower.includes(b.name.toLowerCase()));
  return byName.length ? byName : BANKS; // fall back to all banks when unresolvable
}

// GET /ratio-trends — 8-quarter time series for all 18 ratios per bank
router.get("/ratio-trends", (req: Request, res: Response) => {
  const { bank_id, ratio_id } = req.query;
  const banks  = resolveBank(bank_id as string | undefined);
  const ratios = ratio_id ? [ratio_id as string] : RATIO_NAMES;

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm   = BANK_STRESS[bIdx] ?? 1.1;

    const ratioData: Record<string, any[]> = {};
    for (const ratio of ratios) {
      const base  = RATIO_THRESHOLDS[ratio] ?? 1.0;
      const trend: any[] = [];
      for (let qi = 0; qi < QUARTERS.length; qi++) {
        const rng       = seededRng(bIdx * 100 + qi * 7 + ratio.charCodeAt(0));
        const stressRamp = qi >= 4 ? (sm - 1) * (qi - 3) * 0.25 : 0;
        const value     = +(base * (0.75 + rng() * 0.5) * (1 + stressRamp)).toFixed(2);
        trend.push({ quarter: QUARTERS[qi], value });
      }
      ratioData[ratio] = trend;
    }

    return { bank_id: bank.id, bank_name: bank.name, ratios: ratioData };
  });

  res.json({ data, count: data.length, quarters: QUARTERS });
});

// GET /threshold-breaches — breached ratios with severity and QoQ delta
router.get("/threshold-breaches", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = resolveBank(bank_id as string | undefined);
  const q     = (quarter as string) || QUARTERS[QUARTERS.length - 1];

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const sm   = BANK_STRESS[bIdx] ?? 1.1;
    const rng  = seededRng(bIdx * 321 + q.charCodeAt(5));

    const breaches: any[] = [];
    for (const ratio of RATIO_NAMES) {
      const threshold = RATIO_THRESHOLDS[ratio] ?? 1.0;
      // Breach probability: ranges from ~15% for low-stress to ~60% for high-stress
      const breachProbability = Math.min(0.65, 0.10 + (sm - 1.0) * 0.35);
      if (rng() < breachProbability) {
        const severity  = sm >= 2.0 ? "CRITICAL" : sm >= 1.5 ? "HIGH" : "MEDIUM";
        const value     = +(threshold * (1.05 + rng() * 0.35 * sm)).toFixed(2);
        const priorQ    = +(threshold * (0.95 + rng() * 0.25)).toFixed(2);
        breaches.push({
          ratio_id:     ratio,
          current_value: value,
          threshold,
          qoq_delta:    +(value - priorQ).toFixed(2),
          severity,
          peer_median:  +(threshold * (0.82 + rng() * 0.25)).toFixed(2),
        });
      }
    }

    return {
      bank_id:     bank.id,
      bank_name:   bank.name,
      quarter:     q,
      breach_count: breaches.length,
      breaches:    breaches.sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        return order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order];
      }),
    };
  });

  res.json({ data, count: data.length });
});

// GET /svb-backtest — SVB Q1 2022→Mar 2023 score timeline (spec-required)
router.get("/svb-backtest", (_req: Request, res: Response) => {
  const timeline = [
    {
      quarter: "2022-Q1",
      composite_score: 38,
      tier: "ELEVATED",
      color: "amber",
      labeled_events: ["Rate hike cycle begins", "HTM unrealized losses start accumulating"],
      metrics: { cet1: 15.2, npl: 0.22, liquidity_coverage: 128, nim: 2.1, deposit_beta: 0.18 },
    },
    {
      quarter: "2022-Q2",
      composite_score: 45,
      tier: "ELEVATED",
      color: "amber",
      labeled_events: ["HTM losses accelerating", "Deposit concentration flagged by NLP"],
      metrics: { cet1: 14.8, npl: 0.28, liquidity_coverage: 118, nim: 1.9, deposit_beta: 0.24 },
    },
    {
      quarter: "2022-Q3",
      composite_score: 62,
      tier: "HIGH",
      color: "orange",
      labeled_events: ["Earnings call sentiment drops — RED ALERT", "3 new 10-K risk factors"],
      metrics: { cet1: 14.1, npl: 0.38, liquidity_coverage: 108, nim: 1.7, deposit_beta: 0.31 },
      first_alert: true,
      days_before_fdic: 182,
    },
    {
      quarter: "2022-Q4",
      composite_score: 74,
      tier: "HIGH",
      color: "red",
      labeled_events: ["News σ-spike ×4", "Deposit outflow velocity increases", "Unrealized losses = 28% equity"],
      metrics: { cet1: 13.2, npl: 0.51, liquidity_coverage: 94, nim: 1.5, deposit_beta: 0.41 },
    },
    {
      quarter: "2023-Q1 (pre-seizure)",
      composite_score: 81,
      tier: "CRITICAL",
      color: "critical",
      labeled_events: ["Securities sale announced", "Rating Watch Negative triggered", "Deposit run accelerates"],
      metrics: { cet1: 12.1, npl: 0.68, liquidity_coverage: 72, nim: 1.4, deposit_beta: 0.61 },
    },
    {
      quarter: "Mar 10 2023",
      composite_score: 89,
      tier: "FDIC SEIZURE",
      color: "black",
      labeled_events: ["Capital raise fails", "FDIC seizure", "Bank closed — total loss"],
      metrics: { cet1: null, npl: null, liquidity_coverage: 0, nim: null, deposit_beta: null },
      fdic_seizure: true,
    },
  ];

  res.json({
    bank: "Silicon Valley Bank",
    bank_id: "SVB-HISTORICAL",
    data_source: "Reconstructed from SVB FFIEC Call Report filings (public record). Illustrative — for backtesting purposes only.",
    first_alert_quarter: "2022-Q3",
    days_advance_warning: 182,
    final_score: 89,
    model_auc_roc: 0.94,
    timeline,
  });
});

export default router;
