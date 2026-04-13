import { Router, type Request, type Response } from "express";

const router = Router();

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const ISSUERS = [
  { id: "AAPL",  name: "Apple Inc.",               sector: "Technology",       rating: "AA+",  stress: 1.0 },
  { id: "BA",    name: "Boeing Co.",                sector: "Aerospace",        rating: "BBB-", stress: 1.8 },
  { id: "F",     name: "Ford Motor Company",        sector: "Auto",             rating: "BB+",  stress: 1.6 },
  { id: "GE",    name: "GE Aerospace",              sector: "Industrials",      rating: "BBB+", stress: 1.2 },
  { id: "GM",    name: "General Motors",            sector: "Auto",             rating: "BBB",  stress: 1.4 },
  { id: "KHC",   name: "Kraft Heinz Co.",           sector: "Consumer Staples", rating: "BBB-", stress: 1.5 },
  { id: "LCII",  name: "LCI Industries",            sector: "Consumer Disc.",   rating: "BB",   stress: 1.7 },
  { id: "MPW",   name: "Medical Properties Trust", sector: "REIT",             rating: "BB-",  stress: 2.1 },
  { id: "NCLH",  name: "Norwegian Cruise Line",     sector: "Leisure",          rating: "B+",   stress: 2.4 },
  { id: "T",     name: "AT&T Inc.",                 sector: "Telecom",          rating: "BBB-", stress: 1.3 },
];

function resolveIssuer(id: string | undefined): typeof ISSUERS[0] | null {
  if (!id) return null;
  const q = id.toLowerCase();
  return ISSUERS.find(i => i.id.toLowerCase() === q || i.name.toLowerCase().includes(q)) || null;
}

const PERIODS = ["FY2022","FY2023","FY2024","Q1-2025","Q2-2025","Q3-2025","Q4-2025","Q1-2026"];

// GET /filing-extracts — 10-K / 10-Q / 8-K summaries with key accounting items
router.get("/filing-extracts", (req: Request, res: Response) => {
  const issuerQ  = req.query.issuer_id as string | undefined;
  const typeQ    = (req.query.filing_type as string) || "10-K";
  const issuer   = resolveIssuer(issuerQ);
  const targets  = issuer ? [issuer] : ISSUERS;

  const data = targets.map(iss => {
    const iIdx  = ISSUERS.findIndex(i => i.id === iss.id);
    const rng   = seededRng(iIdx * 321 + typeQ.charCodeAt(0));
    const baseRev = 5_000 + rng() * 195_000;
    const ebitdaMargin = +(0.08 + (2 - iss.stress) * 0.08 + rng() * 0.06).toFixed(3);
    const grossDebt = +(baseRev * (0.5 + iss.stress * 0.4 + rng() * 0.2)).toFixed(0);
    const netDebt   = +(grossDebt - baseRev * 0.08 * (1 - rng() * 0.3)).toFixed(0);
    const interestExp = +(grossDebt * (0.04 + iss.stress * 0.01)).toFixed(0);
    const ebitda    = +(baseRev * ebitdaMargin).toFixed(0);
    const ebit      = +(ebitda * 0.7).toFixed(0);

    const k8Events  = typeQ === "8-K" ? [
      { event_type: iss.stress > 1.5 ? "credit_agreement_amendment" : "earnings_release", date: `2026-0${1 + (iIdx % 3)}-15`, material: true },
    ] : [];

    return {
      issuer_id:   iss.id,
      issuer_name: iss.name,
      sector:      iss.sector,
      filing_type: typeQ,
      period:      PERIODS[PERIODS.length - 1],
      filed_at:    `2026-0${1 + (iIdx % 3)}-${10 + (iIdx % 20)}`,
      financials: {
        revenue_mm:       +baseRev.toFixed(0),
        ebitda_mm:        +ebitda.toFixed(0),
        ebitda_margin:    ebitdaMargin,
        ebit_mm:          +ebit.toFixed(0),
        interest_expense_mm: +interestExp.toFixed(0),
        gross_debt_mm:    +grossDebt.toFixed(0),
        net_debt_mm:      +netDebt.toFixed(0),
        net_debt_to_ebitda: +(netDebt / ebitda).toFixed(2),
        ebit_interest_coverage: +(ebit / interestExp).toFixed(2),
        fcf_mm:           +(ebitda * (0.3 + rng() * 0.3) - interestExp).toFixed(0),
      },
      k8_events: k8Events,
      auditor_opinion: iss.stress > 2.0 ? "going_concern_emphasis" : "unqualified",
    };
  });

  res.json({ data, count: data.length, filing_type: typeQ });
});

// GET /financial-ratios — 8-period time series of credit ratios
router.get("/financial-ratios", (req: Request, res: Response) => {
  const issuerQ  = req.query.issuer_id as string | undefined;
  const issuer   = resolveIssuer(issuerQ);
  const targets  = issuer ? [issuer] : ISSUERS;

  const RATIO_DEFS = [
    { key: "net_debt_ebitda",     label: "Net Debt / EBITDA",         base: 2.0,  stressMultiplier:  0.8, higherIsWorse: true  },
    { key: "ebit_interest_cover", label: "EBIT Interest Coverage",     base: 5.0,  stressMultiplier: -1.5, higherIsWorse: false },
    { key: "fcf_debt_pct",        label: "FCF / Gross Debt (%)",       base: 12.0, stressMultiplier: -3.0, higherIsWorse: false },
    { key: "gross_margin_pct",    label: "Gross Margin (%)",           base: 35.0, stressMultiplier: -5.0, higherIsWorse: false },
    { key: "ebitda_margin_pct",   label: "EBITDA Margin (%)",          base: 18.0, stressMultiplier: -3.0, higherIsWorse: false },
    { key: "current_ratio",       label: "Current Ratio",              base: 1.4,  stressMultiplier: -0.2, higherIsWorse: false },
  ];

  const data = targets.map(iss => {
    const iIdx = ISSUERS.findIndex(i => i.id === iss.id);

    const ratios: Record<string, any[]> = {};
    for (const rd of RATIO_DEFS) {
      ratios[rd.key] = PERIODS.map((period, pi) => {
        const rng  = seededRng(iIdx * 200 + pi * 17 + rd.key.charCodeAt(0));
        const drift = pi >= 4 ? rd.stressMultiplier * (iss.stress - 1) * (pi - 3) * 0.3 : 0;
        const val  = +(rd.base + drift + (rng() - 0.4) * Math.abs(rd.base * 0.12)).toFixed(2);
        return { period, value: val, label: rd.label };
      });
    }

    return {
      issuer_id:   iss.id,
      issuer_name: iss.name,
      sector:      iss.sector,
      current_rating: iss.rating,
      periods: PERIODS,
      ratios,
    };
  });

  res.json({ data, count: data.length, periods: PERIODS });
});

// GET /risk-factors — extracted and classified risk factors from 10-K
router.get("/risk-factors", (req: Request, res: Response) => {
  const issuerQ = req.query.issuer_id as string | undefined;
  const issuer  = resolveIssuer(issuerQ);
  const targets = issuer ? [issuer] : ISSUERS;

  const RISK_TEMPLATES = [
    { category: "liquidity",    template: (n: string) => `${n} may be unable to refinance near-term maturities if credit markets tighten materially.` },
    { category: "operational",  template: (n: string) => `Supply chain disruptions could reduce ${n}'s production capacity and margins.` },
    { category: "regulatory",   template: (n: string) => `${n} is subject to evolving environmental regulations that may require significant capital expenditure.` },
    { category: "leverage",     template: (n: string) => `${n}'s leverage ratio may limit financial flexibility under adverse macroeconomic conditions.` },
    { category: "market",       template: (n: string) => `Interest rate increases could raise ${n}'s cost of floating-rate debt materially.` },
    { category: "litigation",   template: (n: string) => `Pending litigation against ${n} creates contingent liabilities with uncertain financial impact.` },
    { category: "counterparty", template: (n: string) => `Concentration of ${n}'s revenue in a limited number of customers increases counterparty risk.` },
    { category: "macro",        template: (n: string) => `A global recession could reduce demand for ${n}'s products, compressing revenues and EBITDA.` },
  ];

  const data = targets.map(iss => {
    const iIdx = ISSUERS.findIndex(i => i.id === iss.id);
    const rng  = seededRng(iIdx * 555 + 1);
    const riskCount  = Math.floor(3 + iss.stress * 2 + rng() * 2);
    const newRiskPct = +(iss.stress * 0.2 + rng() * 0.1).toFixed(2);

    const factors = RISK_TEMPLATES.slice(0, riskCount).map((rt, ri) => ({
      risk_id:  `RF-${iss.id}-${(ri + 1).toString().padStart(3, "0")}`,
      category: rt.category,
      severity: ri < 2 && iss.stress > 1.5 ? "HIGH" : ri < 4 ? "MEDIUM" : "LOW",
      text:     rt.template(iss.name),
      new_flag: ri === 0 && iss.stress > 1.5,
      year_first_appeared: ri === 0 && iss.stress > 1.5 ? "2026" : "2024",
    }));

    return {
      issuer_id:       iss.id,
      issuer_name:     iss.name,
      sector:          iss.sector,
      filing_period:   "FY2025",
      total_risk_count: riskCount,
      new_risk_pct:    newRiskPct,
      high_severity_count: factors.filter(f => f.severity === "HIGH").length,
      factors,
    };
  });

  res.json({ data, count: data.length });
});

// GET /management-discussion — MD&A tone, guidance, and key statements
router.get("/management-discussion", (req: Request, res: Response) => {
  const issuerQ = req.query.issuer_id as string | undefined;
  const issuer  = resolveIssuer(issuerQ);
  const targets = issuer ? [issuer] : ISSUERS;

  const TONE_TEMPLATES = [
    { stress_min: 0,   tone: "confident",  excerpt: (n: string) => `${n} management expects continued EBITDA expansion and strong free cash flow generation, reaffirming full-year guidance.` },
    { stress_min: 1.3, tone: "cautious",   excerpt: (n: string) => `${n} management highlighted near-term headwinds while expressing confidence in long-term fundamentals.` },
    { stress_min: 1.6, tone: "defensive",  excerpt: (n: string) => `${n} management acknowledged deteriorating market conditions and is actively reviewing cost reduction and asset optimization measures.` },
    { stress_min: 2.0, tone: "distressed", excerpt: (n: string) => `${n} management cautioned that covenant headroom is tightening and that liquidity management is a near-term priority.` },
  ];

  const data = targets.map(iss => {
    const iIdx = ISSUERS.findIndex(i => i.id === iss.id);
    const rng  = seededRng(iIdx * 888 + 3);
    const toneObj = [...TONE_TEMPLATES].reverse().find(t => iss.stress >= t.stress_min) || TONE_TEMPLATES[0];
    const guidanceChange = iss.stress > 1.5 ? "LOWERED" : iss.stress > 1.2 ? "MAINTAINED" : "RAISED";
    const forwardEbitda  = +(1 - (iss.stress - 1) * 0.1 + (rng() - 0.4) * 0.05).toFixed(3);

    return {
      issuer_id:        iss.id,
      issuer_name:      iss.name,
      sector:           iss.sector,
      filing_period:    "FY2025",
      tone:             toneObj.tone,
      tone_score:       +((2 - iss.stress) * 0.5 + rng() * 0.2).toFixed(2),
      key_excerpt:      toneObj.excerpt(iss.name),
      guidance_change:  guidanceChange,
      forward_ebitda_growth_est: forwardEbitda,
      debt_repayment_committed: iss.stress > 1.6,
      restructuring_mentioned:  iss.stress > 1.8,
      liquidity_emphasis:       iss.stress > 1.9,
    };
  });

  res.json({ data, count: data.length });
});

export default router;
