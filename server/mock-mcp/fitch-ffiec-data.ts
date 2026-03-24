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
  { id: "RSSD-0000001", name: "JPMorgan Chase",     tier: "G-SIB" },
  { id: "RSSD-0000002", name: "Bank of America",     tier: "G-SIB" },
  { id: "RSSD-0000003", name: "Wells Fargo",         tier: "G-SIB" },
  { id: "RSSD-0000004", name: "Citigroup",           tier: "G-SIB" },
  { id: "RSSD-0000005", name: "Goldman Sachs",       tier: "G-SIB" },
  { id: "RSSD-0000006", name: "Morgan Stanley",      tier: "G-SIB" },
  { id: "RSSD-0000007", name: "U.S. Bancorp",        tier: "Regional" },
  { id: "RSSD-0000008", name: "Truist Financial",    tier: "Regional" },
  { id: "RSSD-0000009", name: "PNC Financial",       tier: "Regional" },
  { id: "RSSD-0000010", name: "RegionalBank-West",   tier: "Community" },
];

const QUARTERS = ["2022-Q3","2022-Q4","2023-Q1","2023-Q2","2023-Q3","2023-Q4","2024-Q1","2024-Q2"];

function getBankIdx(bankId?: string): number {
  if (!bankId) return 0;
  const idx = BANKS.findIndex(b => b.id === bankId);
  return idx >= 0 ? idx : 0;
}

// GET /call-report-schedules — RC-N/RC-C/RI-B/RC-R summary per bank
router.get("/call-report-schedules", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const quarters = quarter ? [quarter as string] : [QUARTERS[QUARTERS.length - 1]];

  const data = banks.flatMap(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    return quarters.map(q => {
      const rng = seededRng(bIdx * 1000 + q.charCodeAt(5) + q.charCodeAt(7));
      return {
        bank_id: bank.id,
        bank_name: bank.name,
        quarter: q,
        schedules: {
          "RC-N": { // Nonaccrual and Past Due Assets
            nonaccrual_loans_mm: +(200 + rng() * 1200 * (bIdx < 6 ? 8 : 2)).toFixed(0),
            past_due_30_89_mm:   +(100 + rng() * 800  * (bIdx < 6 ? 8 : 2)).toFixed(0),
            past_due_90_plus_mm: +(50  + rng() * 400  * (bIdx < 6 ? 8 : 2)).toFixed(0),
          },
          "RC-C": { // Loans and Lease Financing Receivables
            total_loans_mm:     +(50000 + rng() * 400000 * (bIdx < 6 ? 4 : 1)).toFixed(0),
            cre_loans_mm:       +(10000 + rng() * 80000  * (bIdx < 6 ? 4 : 1)).toFixed(0),
            commercial_loans_mm:+(20000 + rng() * 160000 * (bIdx < 6 ? 4 : 1)).toFixed(0),
          },
          "RI-B": { // Charge-offs and Recoveries
            gross_charge_offs_mm: +(80 + rng() * 600 * (bIdx < 6 ? 8 : 2)).toFixed(0),
            recoveries_mm:        +(20 + rng() * 150 * (bIdx < 6 ? 8 : 2)).toFixed(0),
          },
          "RC-R": { // Regulatory Capital
            cet1_ratio_pct:      +(11.2 + rng() * 3).toFixed(2),
            tier1_ratio_pct:     +(12.8 + rng() * 3).toFixed(2),
            total_capital_pct:   +(14.1 + rng() * 3).toFixed(2),
            leverage_ratio_pct:  +(7.2 + rng() * 2).toFixed(2),
          },
        },
      };
    });
  });

  res.json({ data, count: data.length, quarter_ref: quarters[0], source: "FFIEC Call Report" });
});

// GET /npa-schedule — Nonaccrual loans, 90+ PD per bank
router.get("/npa-schedule", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const q = (quarter as string) || QUARTERS[QUARTERS.length - 1];

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const rng = seededRng(bIdx * 777 + q.charCodeAt(5));
    const npl = +(0.2 + rng() * 2.8 * (bIdx >= 6 ? 1.5 : 0.8)).toFixed(2);
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      quarter: q,
      nonaccrual_loan_pct: npl,
      npa_90_plus_pct:     +(npl * 0.6 + rng() * 0.4).toFixed(2),
      classified_assets_mm:+(500 + rng() * 5000  * (bIdx < 6 ? 10 : 2)).toFixed(0),
      oreo_mm:             +(20  + rng() * 200   * (bIdx < 6 ? 10 : 2)).toFixed(0),
      npa_to_assets_pct:   +(0.1 + rng() * 0.8).toFixed(2),
      provision_coverage_pct: +(120 + rng() * 80).toFixed(1),
    };
  });

  res.json({ data, count: data.length });
});

// GET /charge-off-schedule — Gross/net charge-offs per loan category
router.get("/charge-off-schedule", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const q = (quarter as string) || QUARTERS[QUARTERS.length - 1];

  const data = banks.map(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    const rng = seededRng(bIdx * 555 + q.charCodeAt(6));
    const scale = bIdx < 6 ? 10 : 2;
    return {
      bank_id: bank.id,
      bank_name: bank.name,
      quarter: q,
      categories: {
        commercial_real_estate: {
          gross_charge_offs_mm: +(10 + rng() * 80 * scale).toFixed(0),
          recoveries_mm:        +(2  + rng() * 15 * scale).toFixed(0),
          net_charge_off_rate:  +(0.01 + rng() * 0.12).toFixed(3),
        },
        consumer_loans: {
          gross_charge_offs_mm: +(20 + rng() * 120 * scale).toFixed(0),
          recoveries_mm:        +(5  + rng() * 25  * scale).toFixed(0),
          net_charge_off_rate:  +(0.02 + rng() * 0.18).toFixed(3),
        },
        commercial_industrial: {
          gross_charge_offs_mm: +(15 + rng() * 90 * scale).toFixed(0),
          recoveries_mm:        +(3  + rng() * 20 * scale).toFixed(0),
          net_charge_off_rate:  +(0.01 + rng() * 0.10).toFixed(3),
        },
        total_nco_rate: +(0.04 + rng() * 0.28).toFixed(3),
        allowance_to_loans_pct: +(0.8 + rng() * 1.4).toFixed(2),
      },
    };
  });

  res.json({ data, count: data.length });
});

// GET /capital-adequacy — CET1, RWA, ACL, tier 1 ratios
router.get("/capital-adequacy", (req: Request, res: Response) => {
  const { bank_id, quarter } = req.query;
  const banks = bank_id ? BANKS.filter(b => b.id === bank_id) : BANKS;
  const quarters = quarter ? [quarter as string] : QUARTERS.slice(-4);

  const data = banks.flatMap(bank => {
    const bIdx = BANKS.findIndex(b => b.id === bank.id);
    return quarters.map(q => {
      const rng = seededRng(bIdx * 333 + q.charCodeAt(5) * 2);
      const totalAssets = bIdx < 4 ? 3000000 : bIdx < 6 ? 1200000 : 500000;
      return {
        bank_id: bank.id,
        bank_name: bank.name,
        quarter: q,
        total_assets_mm: +(totalAssets * (0.95 + rng() * 0.1)).toFixed(0),
        rwa_mm: +(totalAssets * 0.7 * (0.9 + rng() * 0.2)).toFixed(0),
        cet1_ratio_pct:    +(10.5 + rng() * 4).toFixed(2),
        tier1_capital_pct: +(12.0 + rng() * 4).toFixed(2),
        total_capital_pct: +(13.8 + rng() * 4).toFixed(2),
        leverage_ratio_pct:+(7.0  + rng() * 2.5).toFixed(2),
        acl_to_loans_pct:  +(0.9  + rng() * 1.2).toFixed(2),
        sccl_pct:          +(8.5  + rng() * 3).toFixed(2),
        well_capitalized:  true,
      };
    });
  });

  res.json({ data, count: data.length });
});

// GET /peer-cohort-ratios — G-SIB median for each of 18 ratios
router.get("/peer-cohort-ratios", (req: Request, res: Response) => {
  const { quarter, cohort_tier } = req.query;
  const q = (quarter as string) || QUARTERS[QUARTERS.length - 1];
  const rng = seededRng(q.charCodeAt(5) * 123);

  const ratios = {
    npl_ratio:                   +(0.42 + rng() * 0.18).toFixed(2),
    nco_rate:                    +(0.22 + rng() * 0.10).toFixed(2),
    allowance_to_loans:          +(1.12 + rng() * 0.20).toFixed(2),
    cet1_ratio:                  +(12.8 + rng() * 1.5).toFixed(2),
    tier1_leverage:              +(8.2  + rng() * 0.8).toFixed(2),
    rwa_density:                 +(0.62 + rng() * 0.08).toFixed(2),
    roa:                         +(0.98 + rng() * 0.20).toFixed(2),
    roe:                         +(10.4 + rng() * 2.0).toFixed(2),
    nim:                         +(2.8  + rng() * 0.5).toFixed(2),
    efficiency_ratio:            +(61.2 + rng() * 6).toFixed(1),
    loan_deposit_ratio:          +(68.4 + rng() * 10).toFixed(1),
    liquid_assets_to_total:      +(18.2 + rng() * 5).toFixed(1),
    cre_to_total_loans:          +(22.4 + rng() * 8).toFixed(1),
    commercial_concentration:    +(38.2 + rng() * 10).toFixed(1),
    provision_to_avg_loans:      +(0.32 + rng() * 0.15).toFixed(2),
    accruing_past_due_90_pct:    +(0.08 + rng() * 0.06).toFixed(2),
    classified_to_tier1:         +(12.4 + rng() * 5).toFixed(1),
    net_stable_funding_ratio:    +(118  + rng() * 15).toFixed(0),
  };

  res.json({ quarter: q, cohort: cohort_tier || "G-SIB", medians: ratios, bank_count: 8 });
});

export default router;
