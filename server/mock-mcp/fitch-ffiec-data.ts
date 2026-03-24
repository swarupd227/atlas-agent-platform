import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const BANK_NAMES = [
  "First National Community Bancorp",
  "Silicon Valley Bank",
  "Pacific Western Bank",
  "Signature Bank",
  "Heartland Financial",
  "Columbia Banking System",
  "Banner Bank",
  "Banner Financial Group",
  "Glacier Bancorp",
  "Renasant Corporation",
];

const BANK_IDS = [
  "RSSD-3232316",
  "RSSD-3511777",
  "RSSD-1029867",
  "RSSD-1462895",
  "RSSD-2928050",
  "RSSD-3116158",
  "RSSD-1012081",
  "RSSD-2712984",
  "RSSD-1423540",
  "RSSD-3052616",
];

function getBankIndex(bankId?: string): number {
  if (!bankId) return 0;
  const idx = BANK_IDS.indexOf(bankId);
  return idx >= 0 ? idx : 0;
}

router.get("/call-report-data", (req: Request, res: Response) => {
  const { bank_id, reporting_period, metric_category, limit: limitStr } = req.query;
  const bIdx = getBankIndex(bank_id as string);
  const rng = seededRng(bIdx * 97 + 1234);
  const limit = Math.min(parseInt(limitStr as string) || 20, 50);

  const periods = ["2023-Q1","2023-Q2","2023-Q3","2023-Q4","2024-Q1","2024-Q2","2024-Q3","2024-Q4"];
  const periodsToReturn = reporting_period ? [reporting_period as string] : periods.slice(-6);

  const categories = metric_category
    ? [metric_category as string]
    : ["capital_adequacy", "asset_quality", "earnings", "liquidity", "sensitivity"];

  const data: any[] = [];
  for (const period of periodsToReturn.slice(0, limit)) {
    for (const cat of categories) {
      const record: any = {
        bank_id: bank_id || BANK_IDS[bIdx],
        bank_name: BANK_NAMES[bIdx],
        reporting_period: period,
        metric_category: cat,
        filed_date: `${period.split("-")[0]}-${["01","04","07","10"][parseInt(period.split("Q")[1]) - 1]}-01`,
        source: "FFIEC Call Report (FR Y-9C)",
      };

      if (cat === "capital_adequacy") {
        record.tier1_capital_ratio = +(8.2 + rng() * 4).toFixed(2);
        record.total_capital_ratio  = +(11.5 + rng() * 3).toFixed(2);
        record.cet1_ratio           = +(7.8 + rng() * 3).toFixed(2);
        record.leverage_ratio       = +(7.1 + rng() * 2).toFixed(2);
        record.risk_weighted_assets_mm = +(2000 + rng() * 8000).toFixed(0);
      } else if (cat === "asset_quality") {
        record.npl_ratio            = +(0.3 + rng() * 3.5).toFixed(2);
        record.nco_ratio            = +(0.1 + rng() * 1.2).toFixed(2);
        record.provision_coverage   = +(110 + rng() * 80).toFixed(1);
        record.past_due_90_ratio    = +(0.2 + rng() * 2.1).toFixed(2);
        record.classified_assets_mm = +(50 + rng() * 800).toFixed(0);
        record.oreo_mm              = +(2 + rng() * 40).toFixed(1);
      } else if (cat === "earnings") {
        record.roa                  = +(0.5 + rng() * 1.5).toFixed(3);
        record.roe                  = +(5.0 + rng() * 12).toFixed(2);
        record.nim                  = +(2.5 + rng() * 2.0).toFixed(2);
        record.efficiency_ratio     = +(55 + rng() * 25).toFixed(1);
        record.noninterest_income_pct = +(10 + rng() * 25).toFixed(1);
        record.net_income_mm        = +(10 + rng() * 200).toFixed(1);
      } else if (cat === "liquidity") {
        record.loans_to_deposits    = +(65 + rng() * 30).toFixed(1);
        record.liquid_assets_ratio  = +(15 + rng() * 20).toFixed(1);
        record.wholesale_funding_pct = +(10 + rng() * 35).toFixed(1);
        record.htv_securities_pct   = +(5 + rng() * 25).toFixed(1);
        record.unrealized_loss_equity_pct = +((-25) + rng() * 30).toFixed(1);
      } else {
        record.rate_sensitivity_gap = +((-8) + rng() * 16).toFixed(2);
        record.duration_gap         = +((-3) + rng() * 6).toFixed(2);
        record.evt_equity_pct       = +((-15) + rng() * 20).toFixed(1);
        record.cre_concentration_pct = +(100 + rng() * 300).toFixed(0);
        record.c_and_d_concentration = +(30 + rng() * 120).toFixed(0);
      }
      data.push(record);
    }
  }

  res.json({
    status: "ok",
    bank_id: bank_id || BANK_IDS[bIdx],
    bank_name: BANK_NAMES[bIdx],
    record_count: data.length,
    periods_included: periodsToReturn.length,
    data,
  });
});

router.get("/peer-benchmark", (req: Request, res: Response) => {
  const { bank_id, asset_size_tier, metric } = req.query;
  const bIdx = getBankIndex(bank_id as string);
  const rng = seededRng(bIdx * 53 + 999);
  const tier = (asset_size_tier as string) || "community_10_50B";

  const metrics = [
    { name: "npl_ratio",          p25: 0.32, p50: 0.71, p75: 1.42, unit: "%" },
    { name: "tier1_capital_ratio",p25: 9.8,  p50: 11.4, p75: 13.2, unit: "%" },
    { name: "roa",                p25: 0.72, p50: 1.01, p75: 1.38, unit: "%" },
    { name: "nim",                p25: 2.71, p50: 3.12, p75: 3.67, unit: "%" },
    { name: "efficiency_ratio",   p25: 58.2, p50: 63.4, p75: 71.8, unit: "%" },
    { name: "loans_to_deposits",  p25: 72.1, p50: 79.3, p75: 87.6, unit: "%" },
    { name: "cre_concentration_pct", p25: 178, p50: 247, p75: 332, unit: "%" },
  ];

  const filtered = metric ? metrics.filter(m => m.name === metric) : metrics;
  const benchmarks = filtered.map(m => ({
    metric: m.name,
    unit: m.unit,
    peer_group: tier,
    peer_count: 312,
    p25: m.p25,
    p50_median: m.p50,
    p75: m.p75,
    bank_value: +(m.p25 + rng() * (m.p75 - m.p25)).toFixed(2),
    percentile_rank: Math.floor(rng() * 100),
    as_of: "2024-Q4",
  }));

  res.json({
    status: "ok",
    bank_id: bank_id || BANK_IDS[bIdx],
    asset_tier: tier,
    benchmark_count: benchmarks.length,
    benchmarks,
  });
});

router.get("/cre-concentration", (req: Request, res: Response) => {
  const { bank_id, segment } = req.query;
  const bIdx = getBankIndex(bank_id as string);
  const rng = seededRng(bIdx * 31 + 5678);

  const segments = [
    { type: "multifamily",         balance_mm: +(200 + rng() * 800), avg_ltv: +(55 + rng() * 25), delinquency_rate: +(0.1 + rng() * 1.2) },
    { type: "office",              balance_mm: +(150 + rng() * 600), avg_ltv: +(58 + rng() * 25), delinquency_rate: +(0.3 + rng() * 2.8) },
    { type: "retail",              balance_mm: +(100 + rng() * 400), avg_ltv: +(60 + rng() * 20), delinquency_rate: +(0.2 + rng() * 1.5) },
    { type: "industrial",          balance_mm: +(80 + rng() * 300),  avg_ltv: +(52 + rng() * 20), delinquency_rate: +(0.1 + rng() * 0.8) },
    { type: "construction_land",   balance_mm: +(50 + rng() * 250),  avg_ltv: +(65 + rng() * 20), delinquency_rate: +(0.4 + rng() * 3.2) },
    { type: "hotel_hospitality",   balance_mm: +(30 + rng() * 150),  avg_ltv: +(62 + rng() * 22), delinquency_rate: +(0.5 + rng() * 2.5) },
  ];

  const data = segment ? segments.filter(s => s.type === segment) : segments;
  const totalBalance = data.reduce((s, d) => s + d.balance_mm, 0);
  const totalAssets = +(3000 + rng() * 15000);

  res.json({
    status: "ok",
    bank_id: bank_id || BANK_IDS[bIdx],
    bank_name: BANK_NAMES[bIdx],
    reporting_period: "2024-Q4",
    total_cre_balance_mm: +totalBalance.toFixed(1),
    total_assets_mm: +totalAssets.toFixed(1),
    cre_to_assets_pct: +((totalBalance / totalAssets) * 100).toFixed(1),
    concentration_to_capital_pct: +((totalBalance / (totalAssets * 0.1)) * 100).toFixed(0),
    regulatory_threshold_pct: 300,
    segments: data.map(d => ({ ...d, balance_mm: +d.balance_mm.toFixed(1), avg_ltv: +d.avg_ltv.toFixed(1), delinquency_rate: +d.delinquency_rate.toFixed(2) })),
  });
});

router.get("/loan-tape", (req: Request, res: Response) => {
  const { bank_id, portfolio, min_balance, limit: limitStr } = req.query;
  const bIdx = getBankIndex(bank_id as string);
  const rng = seededRng(bIdx * 71 + 3333);
  const limit = Math.min(parseInt(limitStr as string) || 25, 100);
  const portfolios = ["commercial_re", "c_and_i", "consumer", "residential_mortgage"];
  const targetPortfolios = portfolio ? [portfolio as string] : portfolios;
  const minBalance = parseFloat(min_balance as string) || 0;

  const loans: any[] = [];
  let loanIdx = 0;
  while (loans.length < limit) {
    const port = targetPortfolios[loanIdx % targetPortfolios.length];
    const balance = +(500 + rng() * 50000);
    if (balance >= minBalance) {
      loans.push({
        loan_id: `LOAN-${BANK_IDS[bIdx].split("-")[1]}-${(++loanIdx).toString().padStart(5,"0")}`,
        portfolio: port,
        balance_mm: +balance.toFixed(1),
        rate_type: rng() > 0.45 ? "fixed" : "floating",
        coupon_rate: +(3.5 + rng() * 4.5).toFixed(3),
        origination_date: `${2019 + Math.floor(rng() * 5)}-${String(Math.ceil(rng() * 12)).padStart(2,"0")}-01`,
        maturity_date: `${2025 + Math.floor(rng() * 7)}-${String(Math.ceil(rng() * 12)).padStart(2,"0")}-01`,
        ltv_ratio: +(45 + rng() * 40).toFixed(1),
        dscr: +(0.9 + rng() * 0.9).toFixed(2),
        risk_rating: Math.ceil(rng() * 5),
        past_due_days: rng() > 0.85 ? Math.floor(rng() * 90) + 30 : 0,
        nonaccrual: rng() > 0.92,
        geography: ["CA","TX","NY","FL","WA","OR","AZ","NV","CO","GA"][Math.floor(rng() * 10)],
      });
    } else {
      loanIdx++;
    }
    if (loanIdx > 500) break;
  }

  res.json({
    status: "ok",
    bank_id: bank_id || BANK_IDS[bIdx],
    loan_count: loans.length,
    total_balance_mm: +loans.reduce((s, l) => s + l.balance_mm, 0).toFixed(1),
    as_of: "2024-Q4",
    loans,
  });
});

export default router;
