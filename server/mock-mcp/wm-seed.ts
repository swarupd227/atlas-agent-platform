/**
 * One wealth book, six systems: Harborview Wealth Partners (fictional).
 *
 * The Wealth Management journeys -- tax-aware rebalancing, annual review
 * prep, digital onboarding -- read a portfolio management and trading system,
 * a custodian, a planning tool, a CRM, an onboarding and compliance system and
 * a performance and billing system. They have to agree with each other, so all
 * six are generated from this file.
 *
 * What the seed holds is RAW data only: households, accounts, lots,
 * transactions, models, restrictions, plans, CRM records, onboarding documents
 * and the performance the reporting system computed. No drift, wash sale,
 * suitability verdict, next-best action or explanation is precomputed.
 *
 * EVERYTHING HERE IS A FIXTURE. The firm, people, securities and figures are
 * synthetic and illustrative; none is a real client, product or Envestnet data.
 *
 * Record ids use the ACCT- prefix so the platform's Intelligence Context can
 * anchor decision records on them: households ACCT-HHLD-<NAME>-NNN, accounts
 * ACCT-NNNN, onboarding cases ACCT-ONB-<NAME>-NNN.
 */

export const MODE = "fixture" as const;
export const TENANT_ID = "tenant-harborview-wealth-demo";
export const FIRM = "Harborview Wealth Partners";
export const FIXTURE_NOTICE =
  "Fixture mode: Harborview Wealth Partners is fictional; households, securities and figures are synthetic for design validation. Not client, product or vendor data.";
export const AS_OF = "2026-10-26";

export const now = () => new Date().toISOString();
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);

// ── Security master ─────────────────────────────────────────────────────────

export interface Security { symbol: string; name: string; assetClass: "us_equity" | "intl_equity" | "fixed_income" | "cash" | "single_stock" | "multi_asset"; price: number; identicalGroup: string; issuer?: string; tobacco?: boolean }

/**
 * `identicalGroup`: securities in one group are substantially identical for
 * the wash-sale rule (same fund, or funds tracking the same index). A
 * replacement must come from a different group.
 */
export const SECURITIES: Security[] = [
  { symbol: "HVUS", name: "Harbor US Total Market Index ETF", assetClass: "us_equity", price: 100, identicalGroup: "IDX-US-TOTAL" },
  { symbol: "HVIX", name: "Harbor International Developed Index ETF", assetClass: "intl_equity", price: 50, identicalGroup: "IDX-INTL-DEV" },
  { symbol: "HVID", name: "Harbor International Developed Index Fund (mutual fund share class)", assetClass: "intl_equity", price: 25, identicalGroup: "IDX-INTL-DEV" },
  { symbol: "HVXM", name: "Harbor Developed ex-US Multifactor ETF", assetClass: "intl_equity", price: 40, identicalGroup: "IDX-INTL-MULTIFACTOR" },
  { symbol: "HVBD", name: "Harbor Core Bond ETF", assetClass: "fixed_income", price: 50, identicalGroup: "IDX-US-AGG" },
  { symbol: "HVTB", name: "Harbor Treasury Bill ETF", assetClass: "fixed_income", price: 100, identicalGroup: "IDX-US-TBILL" },
  { symbol: "NVLX", name: "Novalux Systems Inc. common stock", assetClass: "single_stock", price: 120, identicalGroup: "ISSUER-NVLX", issuer: "Novalux Systems Inc." },
  { symbol: "TBCO", name: "Tri-Basin Tobacco Corp. common stock", assetClass: "single_stock", price: 40, identicalGroup: "ISSUER-TBCO", issuer: "Tri-Basin Tobacco Corp.", tobacco: true },
  { symbol: "HV2032", name: "Harbor 529 Age-Based 2032 Portfolio", assetClass: "multi_asset", price: 20, identicalGroup: "529-AGE-2032" },
  { symbol: "CASH", name: "Cash sweep", assetClass: "cash", price: 1, identicalGroup: "CASH" },
];
export const security = (s: unknown) => SECURITIES.find((x) => x.symbol === String(s ?? "").trim().toUpperCase());
/** Equity exposure counts single stocks with equities. */
export const isEquity = (ac: string) => ac === "us_equity" || ac === "intl_equity" || ac === "single_stock";

// ── Models ──────────────────────────────────────────────────────────────────

export interface Model { modelId: string; name: string; riskBand: string; sleeves: Array<{ sleeve: "equity" | "fixed_income" | "cash"; targetPct: number; tolerancePct: number; vehicles: string[] }> }
export const MODELS: Model[] = [
  { modelId: "MDL-GROWTH-7030", name: "Growth 70/30", riskBand: "Growth", sleeves: [{ sleeve: "equity", targetPct: 70, tolerancePct: 5, vehicles: ["HVUS", "HVIX", "HVXM"] }, { sleeve: "fixed_income", targetPct: 28, tolerancePct: 5, vehicles: ["HVBD", "HVTB"] }, { sleeve: "cash", targetPct: 2, tolerancePct: 2, vehicles: ["CASH"] }] },
  { modelId: "MDL-CONS-4060", name: "Conservative 40/60", riskBand: "Conservative", sleeves: [{ sleeve: "equity", targetPct: 40, tolerancePct: 5, vehicles: ["HVUS", "HVIX"] }, { sleeve: "fixed_income", targetPct: 57, tolerancePct: 5, vehicles: ["HVBD", "HVTB"] }, { sleeve: "cash", targetPct: 3, tolerancePct: 2, vehicles: ["CASH"] }] },
];
export const modelById = (id: unknown) => MODELS.find((m) => m.modelId === String(id ?? "").trim().toUpperCase());

// ── Households, accounts, lots, transactions ────────────────────────────────

export interface Lot { lotId: string; symbol: string; quantity: number; costBasis: number; acquiredDate: string }
export interface Account {
  accountId: string; householdId: string; registration: string; owners: string[]; taxStatus: "taxable" | "tax_deferred" | "tax_exempt";
  discretion: "discretionary" | "non_discretionary"; modelId: string | null; custodian: string; inIps: boolean; status: "open" | "pending" | "closed";
  restrictions: Array<{ type: "esg_exclusion"; detail: string; symbols: string[] }>; cash: number; lots: Lot[];
}
export interface Transaction { txnId: string; accountId: string; date: string; type: "buy" | "sell" | "auto_invest" | "dividend_reinvest" | "deposit" | "withdrawal"; symbol: string; quantity: number; amount: number; note?: string }
export interface Household {
  householdId: string; name: string; members: Array<{ clientId: string; name: string; age: number; role: string }>; advisorId: string; segment: string;
  modelId: string; ips: { targetAllocation: Record<string, number>; driftBandPct: number; singleStockCapPct: number; annualTaxBudget: number; benchmark: string; uniquePreferences: string[] };
  heldAway: Array<{ description: string; owner: string; value: number }>; lastReviewDate: string; reviewCadence: "annual" | "semi_annual";
}

const lot = (lotId: string, symbol: string, quantity: number, costBasis: number, acquiredDate: string): Lot => ({ lotId, symbol, quantity, costBasis, acquiredDate });

export const HOUSEHOLDS: Household[] = [
  {
    householdId: "ACCT-HHLD-HART-001", name: "Hartman household", advisorId: "ADV-ELLIS", segment: "Mass affluent to HNW", modelId: "MDL-GROWTH-7030",
    members: [{ clientId: "CL-HART-D", name: "Daniel Hartman", age: 52, role: "primary" }, { clientId: "CL-HART-P", name: "Priya Hartman", age: 50, role: "spouse" }],
    ips: { targetAllocation: { equity: 70, fixed_income: 28, cash: 2 }, driftBandPct: 5, singleStockCapPct: 10, annualTaxBudget: 25000, benchmark: "70% MSCI ACWI IMI / 30% Bloomberg US Aggregate (blended)", uniquePreferences: [] },
    heldAway: [{ description: "Daniel's current employer 401(k) (Novalux Systems)", owner: "CL-HART-D", value: 260000 }], lastReviewDate: "2025-08-20", reviewCadence: "annual",
  },
  {
    householdId: "ACCT-HHLD-OKAF-002", name: "Okafor household", advisorId: "ADV-ELLIS", segment: "HNW", modelId: "MDL-CONS-4060",
    members: [{ clientId: "CL-OKAF-G", name: "Grace Okafor", age: 75, role: "primary" }],
    ips: { targetAllocation: { equity: 40, fixed_income: 57, cash: 3 }, driftBandPct: 5, singleStockCapPct: 10, annualTaxBudget: 15000, benchmark: "40/60 blended", uniquePreferences: ["Exclude tobacco producers"] },
    heldAway: [], lastReviewDate: "2026-04-10", reviewCadence: "semi_annual",
  },
  {
    householdId: "ACCT-HHLD-LIND-003", name: "Lindqvist household (control: wash-sale window missed by a day)", advisorId: "ADV-RAO", segment: "Mass affluent", modelId: "MDL-GROWTH-7030",
    members: [{ clientId: "CL-LIND-A", name: "Anna Lindqvist", age: 44, role: "primary" }],
    ips: { targetAllocation: { equity: 70, fixed_income: 28, cash: 2 }, driftBandPct: 5, singleStockCapPct: 10, annualTaxBudget: 20000, benchmark: "70/30 blended", uniquePreferences: [] },
    heldAway: [], lastReviewDate: "2026-06-01", reviewCadence: "annual",
  },
  {
    householdId: "ACCT-HHLD-MBEK-004", name: "Mbeki household (control: drift exactly at the band edge)", advisorId: "ADV-RAO", segment: "Mass affluent", modelId: "MDL-GROWTH-7030",
    members: [{ clientId: "CL-MBEK-T", name: "Thabo Mbeki-Ross", age: 58, role: "primary" }],
    ips: { targetAllocation: { equity: 70, fixed_income: 28, cash: 2 }, driftBandPct: 5, singleStockCapPct: 10, annualTaxBudget: 20000, benchmark: "70/30 blended", uniquePreferences: [] },
    heldAway: [], lastReviewDate: "2026-03-15", reviewCadence: "annual",
  },
];
export const householdById = (id: unknown) => HOUSEHOLDS.find((h) => h.householdId === String(id ?? "").trim().toUpperCase());

/** Lots sized so every account's value is exact at seed prices (HVUS 100, HVIX 50, HVBD 50, NVLX 120, HV2032 20, HVTB 100). */
export const ACCOUNTS: Account[] = [
  { accountId: "ACCT-1001", householdId: "ACCT-HHLD-HART-001", registration: "Joint (JTWROS)", owners: ["CL-HART-D", "CL-HART-P"], taxStatus: "taxable", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 10000,
    lots: [lot("LOT-1001-01", "NVLX", 2600, 48000, "2014-05-12"), lot("LOT-1001-02", "HVUS", 1500, 96000, "2018-03-01"), lot("LOT-1001-03", "HVUS", 800, 71000, "2021-02-10"), lot("LOT-1001-04", "HVIX", 2400, 138400, "2025-02-18"), lot("LOT-1001-05", "HVBD", 1400, 74200, "2022-06-15")] },
  { accountId: "ACCT-1002", householdId: "ACCT-HHLD-HART-001", registration: "Traditional IRA", owners: ["CL-HART-D"], taxStatus: "tax_deferred", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 8000,
    lots: [lot("LOT-1002-01", "HVUS", 1600, 112000, "2016-01-04"), lot("LOT-1002-02", "HVIX", 1200, 54000, "2019-07-01"), lot("LOT-1002-03", "HVBD", 3800, 199000, "2020-09-10")] },
  { accountId: "ACCT-1003", householdId: "ACCT-HHLD-HART-001", registration: "Roth IRA", owners: ["CL-HART-P"], taxStatus: "tax_exempt", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 2000,
    lots: [lot("LOT-1003-01", "HVIX", 820, 37720, "2023-03-01"), lot("LOT-1003-02", "HVIX", 100, 5000, "2026-10-14"), lot("LOT-1003-03", "HVUS", 400, 32000, "2022-03-01"), lot("LOT-1003-04", "HVBD", 160, 8300, "2023-03-01")] },
  { accountId: "ACCT-1005", householdId: "ACCT-HHLD-HART-001", registration: "529 college savings (owner Priya, beneficiary Maya)", owners: ["CL-HART-P"], taxStatus: "tax_exempt", discretion: "discretionary", modelId: null, custodian: "Harborview Clearing", inIps: false, status: "open", restrictions: [], cash: 0,
    lots: [lot("LOT-1005-01", "HV2032", 7650, 118000, "2017-09-01")] },
  { accountId: "ACCT-2001", householdId: "ACCT-HHLD-OKAF-002", registration: "Traditional IRA", owners: ["CL-OKAF-G"], taxStatus: "tax_deferred", discretion: "discretionary", modelId: "MDL-CONS-4060", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 9100,
    lots: [lot("LOT-2001-01", "HVUS", 1800, 120000, "2015-04-01"), lot("LOT-2001-02", "HVIX", 1400, 63000, "2017-04-01"), lot("LOT-2001-03", "HVBD", 6600, 340000, "2018-04-01"), lot("LOT-2001-04", "HVTB", 280, 28000, "2025-01-10")] },
  { accountId: "ACCT-2002", householdId: "ACCT-HHLD-OKAF-002", registration: "Individual (TOD)", owners: ["CL-OKAF-G"], taxStatus: "taxable", discretion: "non_discretionary", modelId: "MDL-CONS-4060", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [{ type: "esg_exclusion", detail: "No tobacco producers", symbols: ["TBCO"] }], cash: 6000,
    lots: [lot("LOT-2002-01", "HVUS", 1300, 98000, "2019-05-01"), lot("LOT-2002-02", "HVBD", 5400, 275000, "2019-05-01")] },
  { accountId: "ACCT-3001", householdId: "ACCT-HHLD-LIND-003", registration: "Individual", owners: ["CL-LIND-A"], taxStatus: "taxable", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 3000,
    lots: [lot("LOT-3001-01", "HVUS", 900, 70000, "2020-01-15"), lot("LOT-3001-02", "HVIX", 600, 36000, "2025-03-03"), lot("LOT-3001-03", "HVBD", 600, 31000, "2021-01-15")] },
  { accountId: "ACCT-3002", householdId: "ACCT-HHLD-LIND-003", registration: "Roth IRA", owners: ["CL-LIND-A"], taxStatus: "tax_exempt", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 1000,
    lots: [lot("LOT-3002-01", "HVIX", 60, 3000, "2026-09-25"), lot("LOT-3002-02", "HVUS", 200, 15000, "2021-06-01")] },
  { accountId: "ACCT-4001", householdId: "ACCT-HHLD-MBEK-004", registration: "Individual", owners: ["CL-MBEK-T"], taxStatus: "taxable", discretion: "discretionary", modelId: "MDL-GROWTH-7030", custodian: "Harborview Clearing", inIps: true, status: "open", restrictions: [], cash: 4000,
    lots: [lot("LOT-4001-01", "HVUS", 1000, 80000, "2019-02-01"), lot("LOT-4001-02", "HVIX", 1000, 45000, "2019-02-01"), lot("LOT-4001-03", "HVBD", 920, 47000, "2019-02-01")] },
];
export const accountById = (id: unknown) => ACCOUNTS.find((a) => a.accountId === String(id ?? "").trim().toUpperCase());
export const accountsOf = (householdId: string) => ACCOUNTS.filter((a) => a.householdId === householdId);

export const TRANSACTIONS: Transaction[] = [
  { txnId: "TXN-1003-AI-1014", accountId: "ACCT-1003", date: "2026-10-14", type: "auto_invest", symbol: "HVIX", quantity: 100, amount: 5000, note: "Monthly Roth auto-invest" },
  { txnId: "TXN-1003-AI-0914", accountId: "ACCT-1003", date: "2026-09-14", type: "auto_invest", symbol: "HVUS", quantity: 50, amount: 5000, note: "Monthly Roth auto-invest" },
  { txnId: "TXN-1001-DEP-0203", accountId: "ACCT-1001", date: "2026-02-03", type: "deposit", symbol: "CASH", quantity: 150000, amount: 150000, note: "Bonus and RSU proceeds deposited" },
  { txnId: "TXN-1002-DRIP-1001", accountId: "ACCT-1002", date: "2026-10-01", type: "dividend_reinvest", symbol: "HVBD", quantity: 20, amount: 1000 },
  { txnId: "TXN-3002-BUY-0925", accountId: "ACCT-3002", date: "2026-09-25", type: "buy", symbol: "HVIX", quantity: 60, amount: 3000, note: "31 days before the wave date" },
  { txnId: "TXN-2001-WD-0115", accountId: "ACCT-2001", date: "2026-01-15", type: "withdrawal", symbol: "CASH", quantity: 12000, amount: 12000, note: "Partial 2026 RMD taken early" },
];

export const RESTRICTED_LIST = [
  { entryId: "RL-NVLX-BLACKOUT", symbol: "NVLX", appliesTo: ["CL-HART-D"], householdId: "ACCT-HHLD-HART-001", reason: "insider_blackout", detail: "Quarterly insider blackout for Novalux Systems employees with access to results", windowStart: "2026-10-01", windowEnd: "2026-11-14" },
  { entryId: "RL-TBCO-ESG", symbol: "TBCO", appliesTo: ["ACCT-2002"], householdId: "ACCT-HHLD-OKAF-002", reason: "esg_exclusion", detail: "Client preference: no tobacco producers", windowStart: "2000-01-01", windowEnd: "2099-12-31" },
];

export const CASH_NEEDS = [
  { needId: "CN-2001-RMD-2026", accountId: "ACCT-2001", type: "rmd", amount: 38240, remaining: 26240, dueDate: "2026-12-31", note: "2026 required minimum distribution 38,240; 12,000 already taken on 2026-01-15" },
];

export const RECONCILIATION = [
  { accountId: "ACCT-1001", openBreaks: 0 }, { accountId: "ACCT-1002", openBreaks: 0 }, { accountId: "ACCT-1003", openBreaks: 0 }, { accountId: "ACCT-1005", openBreaks: 0 },
  { accountId: "ACCT-2001", openBreaks: 0 }, { accountId: "ACCT-2002", openBreaks: 0 }, { accountId: "ACCT-3001", openBreaks: 0 }, { accountId: "ACCT-3002", openBreaks: 0 }, { accountId: "ACCT-4001", openBreaks: 0 },
];

export function accountValue(a: Account): number {
  return money(a.cash + a.lots.reduce((s, l) => s + l.quantity * security(l.symbol)!.price, 0));
}

// ── Planning ────────────────────────────────────────────────────────────────

export const PLANS: Record<string, unknown> = {
  "ACCT-HHLD-HART-001": {
    planId: "PLAN-HART-2026", householdId: "ACCT-HHLD-HART-001", probabilityOfSuccess: 81, lastReview: { date: "2025-08-20", probabilityOfSuccess: 87, cmaVersion: "CMA-2025.2" },
    monteCarloRuns: 1000, cmaVersion: "CMA-2026.2", lastRunAt: "2026-10-20",
    assumptionChanges: [{ assumption: "college cost inflation", from: "5.0%", to: "6.5%", cmaVersion: "CMA-2026.2" }, { assumption: "US equity expected return", from: "6.8%", to: "6.9%", cmaVersion: "CMA-2026.2" }],
    goals: [
      { goalId: "G-HART-RET", type: "retirement", description: "Both retire at 60 (Daniel 2034)", targetDate: "2034-06-01", targetAmount: 180000, unit: "per year in today's dollars", priority: "needs" },
      { goalId: "G-HART-EDU", type: "education", description: "Maya, four-year private university", targetDate: "2032-09-01", targetAmount: 340000, priority: "wants" },
      { goalId: "G-HART-EXIT", type: "business_exit", description: "Priya's design studio sale, proceeds to retirement", targetDate: "2028-12-31", targetAmount: 400000, priority: "wishes" },
    ],
  },
  "ACCT-HHLD-OKAF-002": { planId: "PLAN-OKAF-2026", householdId: "ACCT-HHLD-OKAF-002", probabilityOfSuccess: 94, lastReview: { date: "2026-04-10", probabilityOfSuccess: 93, cmaVersion: "CMA-2026.1" }, monteCarloRuns: 1000, cmaVersion: "CMA-2026.2", lastRunAt: "2026-10-01", assumptionChanges: [], goals: [{ goalId: "G-OKAF-INC", type: "retirement", description: "Income for life", targetAmount: 60000, unit: "per year", priority: "needs" }] },
};

/** The planning tool's own scenario results (it computes them; agents request them). */
export const SCENARIOS: Record<string, Record<string, { probabilityOfSuccess: number; description: string }>> = {
  "ACCT-HHLD-HART-001": {
    retire_at_61: { probabilityOfSuccess: 86, description: "Both retire one year later (2035)" },
    roth_conversion_50k: { probabilityOfSuccess: 82, description: "Convert 50,000 of Daniel's IRA to Roth in 2026" },
    increase_529_10k: { probabilityOfSuccess: 85, description: "Add 10,000 a year to the 529 until 2032" },
    consolidate_401k: { probabilityOfSuccess: 82, description: "Roll Daniel's former-employer style held-away 401(k) under the IPS (asset location)" },
  },
};

export const RISK_PROFILES: Record<string, unknown> = {
  "ACCT-HHLD-HART-001": { householdId: "ACCT-HHLD-HART-001", riskToleranceScore: 68, riskToleranceBand: "Growth", riskCapacity: "moderate-high", timeHorizonYears: 8, liquidityNeed: "low", lastConfirmed: "2025-08-20" },
  "ACCT-HHLD-OKAF-002": { householdId: "ACCT-HHLD-OKAF-002", riskToleranceScore: 35, riskToleranceBand: "Conservative", riskCapacity: "moderate", timeHorizonYears: 12, liquidityNeed: "moderate (RMDs)", lastConfirmed: "2026-04-10" },
};

// ── CRM ─────────────────────────────────────────────────────────────────────

export const CRM = {
  profiles: {
    "ACCT-HHLD-HART-001": { householdId: "ACCT-HHLD-HART-001", advisor: "Jordan Ellis, CFP", serviceTeam: "Team Ellis", preferredContact: "email", trustedContactOnFile: true, occupation: { "CL-HART-D": "VP Engineering, Novalux Systems (insider)", "CL-HART-P": "Owner, Hartman Design Studio" } },
    "ACCT-HHLD-OKAF-002": { householdId: "ACCT-HHLD-OKAF-002", advisor: "Jordan Ellis, CFP", serviceTeam: "Team Ellis", preferredContact: "phone", trustedContactOnFile: true, occupation: { "CL-OKAF-G": "Retired" } },
  } as Record<string, unknown>,
  lifeEvents: [
    { eventId: "LE-HART-01", householdId: "ACCT-HHLD-HART-001", type: "business_sale", date: "2026-09-12", detectedFrom: "CRM note NOTE-HART-0912", detail: "Priya expects to sell the design studio in about two years." },
    { eventId: "LE-HART-02", householdId: "ACCT-HHLD-HART-001", type: "education", date: "2026-09-12", detectedFrom: "CRM note NOTE-HART-0912", detail: "Maya starts university in fall 2032; private schools on the list." },
  ],
  serviceItems: [{ itemId: "SVC-HART-07", householdId: "ACCT-HHLD-HART-001", type: "beneficiary_update", status: "open", opened: "2026-02-02", detail: "Daniel asked about naming the kids as contingent beneficiaries on his IRA; form not returned." }],
  reviews: [
    { reviewId: "REV-HART-2025", householdId: "ACCT-HHLD-HART-001", date: "2025-08-20", type: "annual", decisions: ["Keep Growth 70/30", "Start Roth auto-invest 5,000 a month", "Discuss Novalux concentration next year"] },
    { reviewId: "REV-OKAF-2026A", householdId: "ACCT-HHLD-OKAF-002", date: "2026-04-10", type: "semi_annual", decisions: ["Take RMD from IRA cash first"] },
  ],
  beneficiaries: [
    { accountId: "ACCT-1001", designations: [{ name: "Joint owner (survivorship)", type: "primary", sharePct: 100 }] },
    { accountId: "ACCT-1002", designations: [{ name: "Priya Hartman", type: "primary", sharePct: 100, perStirpes: false, lastConfirmed: "2016-01-04" }] },
    { accountId: "ACCT-1003", designations: [{ name: "Daniel Hartman", type: "primary", sharePct: 100, lastConfirmed: "2023-03-01" }, { name: "Maya Hartman", type: "contingent", sharePct: 50, lastConfirmed: "2023-03-01" }, { name: "Leo Hartman", type: "contingent", sharePct: 50, lastConfirmed: "2023-03-01" }] },
    { accountId: "ACCT-2001", designations: [{ name: "Okafor Family Trust", type: "primary", sharePct: 100, lastConfirmed: "2024-02-01" }] },
  ],
};

// ── Performance and billing ─────────────────────────────────────────────────

export const PERFORMANCE: Record<string, unknown> = {
  "ACCT-HHLD-HART-001": {
    householdId: "ACCT-HHLD-HART-001", period: "2025-10-01 to 2026-09-30", computedBy: "Harborview performance system (fixture)",
    twrGrossPct: 10.6, twrNetPct: 9.8, mwrNetPct: 7.1, benchmarkPct: 9.1, benchmark: "70% MSCI ACWI IMI / 30% Bloomberg US Aggregate (blended)",
    cashFlows: [{ date: "2026-02-03", amount: 150000, accountId: "ACCT-1001", type: "deposit" }],
    marketPath: [{ month: "2026-01", returnPct: 1.2 }, { month: "2026-02", returnPct: -0.8 }, { month: "2026-03", returnPct: -6.4 }, { month: "2026-04", returnPct: 2.1 }],
    feesPaid: 12940,
  },
};

export const FEE_SCHEDULES = [{ scheduleId: "FEE-STD-2026", tiers: [{ upTo: 1000000, ratePct: 1.0 }, { upTo: 3000000, ratePct: 0.8 }, { upTo: null, ratePct: 0.6 }], basis: "period_end", timing: "advance", householding: true, minimumAnnualFee: 5000 }];
