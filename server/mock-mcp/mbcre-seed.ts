/**
 * One commercial real estate book, three banks, three systems.
 *
 * Journey 2 of the Mutual Bancorp demo (CRE annual review and concentration
 * watch) reads a commercial loan system, a borrower financials repository and
 * a credit policy and portfolio risk library. The loan system holds every CRE
 * facility of Cape Cod 5, Fidelity Bank and Bluestone Bank; three of them are
 * due for annual review and have operating statements and rent rolls behind
 * them. All three systems are generated from this file so they agree.
 *
 * What the seed holds is RAW data only: loan terms, the last review's NOI,
 * statements, rent rolls, policies and scenario definitions. No spread, ratio,
 * stress result, rating, rollup or warning is precomputed; the agents and the
 * flow's own deterministic steps derive them.
 *
 * EVERYTHING HERE IS A FIXTURE. Borrowers, properties, figures, capital levels
 * and policies are synthetic and illustrative; none is a Mutual Bancorp,
 * Cape Cod 5, Fidelity Bank or Bluestone Bank figure or policy.
 */

export const MODE = "fixture" as const;
export const TENANT_ID = "tenant-mutual-bancorp-demo";
export const FIXTURE_NOTICE =
  "Fixture mode: a synthetic CRE book and illustrative credit policies for design validation. Not Mutual Bancorp, Cape Cod 5, Fidelity Bank or Bluestone Bank data or policy.";
export const REVIEW_DATE = "2026-10-22";

export const now = () => new Date().toISOString();
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type BankId = "CC5" | "FID" | "BLU";

export interface Bank {
  bankId: BankId;
  name: string;
  legalName: string;
  totalRiskBasedCapital: number;
  /** Total CRE (non-owner-occupied CRE, multifamily, construction and land) 36 months before the review date. */
  creBalance36MonthsAgo: number;
}

export const BANKS: Record<BankId, Bank> = {
  CC5: { bankId: "CC5", name: "Cape Cod 5", legalName: "Cape Cod Five Cents Savings Bank", totalRiskBasedCapital: 610_000_000, creBalance36MonthsAgo: 640_000_000 },
  FID: { bankId: "FID", name: "Fidelity Bank", legalName: "Fidelity Co-operative Bank", totalRiskBasedCapital: 148_000_000, creBalance36MonthsAgo: 188_000_000 },
  BLU: { bankId: "BLU", name: "Bluestone Bank", legalName: "Bluestone Bank", totalRiskBasedCapital: 152_000_000, creBalance36MonthsAgo: 318_000_000 },
};

// ── Credit policy ────────────────────────────────────────────────────────────

export interface RatingGrade { grade: string; label: string; groupGrade: string; minDscr: number | null; maxLtv: number | null }

export interface BankPolicy {
  bankId: BankId;
  policyVersion: string;
  dscrMinimum: number;
  ltvMaximum: number;
  /** An appraisal older than this at annual review is stale and must be flagged. */
  appraisalMaxAgeMonths: number;
  ratingScale: RatingGrade[];
  /** Grades at or worse than this need the credit officer's written workout assessment. */
  watchGrade: string;
  memoSections: string[];
  earlyWarning: { dscrFloor: number; tenantShareOfIncome: number; horizonMonths: number };
}

const SECTIONS = ["relationshipSummary", "propertyAndCollateral", "financialPerformance", "rentRollAndTenancy", "covenantCompliance", "stressTesting", "riskRatingRationale", "recommendation"];

export const POLICIES: Record<BankId, BankPolicy> = {
  CC5: {
    bankId: "CC5", policyVersion: "CC5-CRE-2026.1", dscrMinimum: 1.25, ltvMaximum: 75, appraisalMaxAgeMonths: 36, watchGrade: "6",
    ratingScale: [
      { grade: "3", label: "Pass - strong", groupGrade: "G2", minDscr: 1.6, maxLtv: 60 },
      { grade: "4", label: "Pass - satisfactory", groupGrade: "G3", minDscr: 1.35, maxLtv: 70 },
      { grade: "5", label: "Pass - acceptable", groupGrade: "G3", minDscr: 1.25, maxLtv: 75 },
      { grade: "6", label: "Special mention (watch)", groupGrade: "G4", minDscr: 1.1, maxLtv: 85 },
      { grade: "7", label: "Substandard", groupGrade: "G5", minDscr: 1.0, maxLtv: null },
      { grade: "8", label: "Doubtful", groupGrade: "G6", minDscr: null, maxLtv: null },
    ],
    memoSections: SECTIONS,
    earlyWarning: { dscrFloor: 1.25, tenantShareOfIncome: 0.25, horizonMonths: 12 },
  },
  FID: {
    bankId: "FID", policyVersion: "FID-CRE-2025.4", dscrMinimum: 1.2, ltvMaximum: 75, appraisalMaxAgeMonths: 36, watchGrade: "7",
    ratingScale: [
      { grade: "4", label: "Pass - strong", groupGrade: "G2", minDscr: 1.5, maxLtv: 60 },
      { grade: "5", label: "Pass - satisfactory", groupGrade: "G3", minDscr: 1.3, maxLtv: 70 },
      { grade: "6", label: "Pass - acceptable", groupGrade: "G3", minDscr: 1.2, maxLtv: 75 },
      { grade: "7", label: "Watch", groupGrade: "G4", minDscr: 1.05, maxLtv: 85 },
      { grade: "8", label: "Substandard", groupGrade: "G5", minDscr: 1.0, maxLtv: null },
      { grade: "9", label: "Doubtful", groupGrade: "G6", minDscr: null, maxLtv: null },
    ],
    memoSections: SECTIONS.filter((s) => s !== "stressTesting").concat(["stressTesting"]),
    earlyWarning: { dscrFloor: 1.2, tenantShareOfIncome: 0.3, horizonMonths: 12 },
  },
  BLU: {
    bankId: "BLU", policyVersion: "BLU-CREPOL-7", dscrMinimum: 1.2, ltvMaximum: 80, appraisalMaxAgeMonths: 24, watchGrade: "C",
    ratingScale: [
      { grade: "A", label: "Pass - strong", groupGrade: "G2", minDscr: 1.5, maxLtv: 65 },
      { grade: "B+", label: "Pass - satisfactory", groupGrade: "G3", minDscr: 1.3, maxLtv: 75 },
      { grade: "B", label: "Pass - acceptable", groupGrade: "G3", minDscr: 1.2, maxLtv: 80 },
      { grade: "C", label: "Watch", groupGrade: "G4", minDscr: 1.05, maxLtv: 90 },
      { grade: "D", label: "Substandard", groupGrade: "G5", minDscr: 1.0, maxLtv: null },
      { grade: "E", label: "Doubtful", groupGrade: "G6", minDscr: null, maxLtv: null },
    ],
    memoSections: SECTIONS,
    earlyWarning: { dscrFloor: 1.2, tenantShareOfIncome: 0.25, horizonMonths: 12 },
  },
};

export const GROUP_SCALE = [
  { groupGrade: "G1", label: "Minimal risk" }, { groupGrade: "G2", label: "Pass - strong" }, { groupGrade: "G3", label: "Pass" },
  { groupGrade: "G4", label: "Special mention / watch" }, { groupGrade: "G5", label: "Substandard" }, { groupGrade: "G6", label: "Doubtful" }, { groupGrade: "G7", label: "Loss" },
];

export const STRESS_SCENARIOS = [
  { scenarioId: "STR-RATE-200", name: "Rates +200bp", rateShockBp: 200, vacancyIncreasePts: 0, capRateIncreaseBp: 0, appliesRateShockTo: "floating rate, and fixed rate resetting or maturing within 24 months" },
  { scenarioId: "STR-RATE-200-VAC-5", name: "Rates +200bp and vacancy +5 points", rateShockBp: 200, vacancyIncreasePts: 5, capRateIncreaseBp: 50, appliesRateShockTo: "floating rate, and fixed rate resetting or maturing within 24 months" },
  { scenarioId: "STR-SEVERE", name: "Severe: rates +300bp, vacancy +10 points, cap rates +100bp", rateShockBp: 300, vacancyIncreasePts: 10, capRateIncreaseBp: 100, appliesRateShockTo: "floating rate, and fixed rate resetting or maturing within 24 months" },
];

export const CONCENTRATION_GUIDANCE = {
  source: "Interagency Guidance on Concentrations in Commercial Real Estate Lending, Sound Risk Management Practices (2006) -- illustrative summary",
  criteria: [
    { criterionId: "CRE-300-50", text: "Total CRE loans (non-owner-occupied CRE, multifamily, construction and land) represent 300% or more of total risk-based capital, AND the CRE portfolio has increased by 50% or more during the prior 36 months." },
    { criterionId: "CLD-100", text: "Construction, land development and other land loans represent 100% or more of total risk-based capital." },
  ],
  note: "Meeting a criterion does not cap lending; it identifies a bank that may receive further supervisory analysis and should have heightened risk management. Each bank is measured against its own capital.",
};

export const APPROVED_MARKET_SOURCES = ["MB Approved CRE Market Data (fixture)"];

/** Sub-market vacancy and cap rates from the approved source. */
export const MARKET_DATA: Record<string, { propertyType: string; vacancyPct: number; capRatePct: number }[]> = {};

export const MODEL_REGISTER = [
  { modelId: "MB-CRE-STRESS-01", name: "Group CRE stress scenarios", version: "2026.1", owner: "Group Model Risk", lastValidated: "2026-05-30", status: "approved", scope: "STR-RATE-200, STR-RATE-200-VAC-5, STR-SEVERE applied loan by loan" },
  { modelId: "MB-CRE-RATING-MAP-01", name: "Bank rating scales mapped to the group scale", version: "2026.1", owner: "Group Credit Risk", lastValidated: "2026-06-15", status: "approved", scope: "Mapping only; each bank's scale and authority unchanged" },
];

// ── The book ─────────────────────────────────────────────────────────────────

export interface Covenant { covenantId: string; type: "min_dscr" | "max_ltv" | "min_occupancy"; threshold: number; testDate: string; testBasis: string }

export interface Facility {
  facilityId: string;
  bankId: BankId;
  relationshipId: string;
  borrowerName: string;
  guarantor: string | null;
  relationshipManager: string;
  propertyName: string;
  propertyType: "office" | "retail" | "multifamily" | "industrial" | "hospitality" | "mixed_use" | "construction_land";
  subMarket: string;
  balance: number;
  commitment: number;
  rateType: "fixed" | "floating";
  noteRatePct: number;
  resetDate: string | null;
  maturityDate: string;
  amortizationMonthsRemaining: number | null;
  interestOnly: boolean;
  annualDebtService: number;
  lastReview: { reviewDate: string; noi: number; occupancyPct: number; dscr: number; finalGrade: string };
  appraisal: { value: number; effectiveDate: string; type: "appraisal" | "evaluation" };
  covenants: Covenant[];
  dueForReview: boolean;
  ownerOccupied: boolean;
}

/** Annual debt service on the stated terms: amortizing payment x 12, or interest only. */
export function annualDebtService(balance: number, ratePct: number, amortMonths: number | null, interestOnly: boolean): number {
  const r = ratePct / 100 / 12;
  if (interestOnly || !amortMonths) return money(balance * ratePct / 100);
  return money(12 * balance * r / (1 - Math.pow(1 + r, -amortMonths)));
}

const SUBMARKETS: Record<BankId, string[]> = {
  CC5: ["Cape Cod - Hyannis", "Cape Cod - Falmouth", "Cape Cod - Outer Cape", "Plymouth County"],
  FID: ["Leominster / Fitchburg", "Worcester", "Nashoba Valley"],
  BLU: ["Taunton / Raynham", "Brockton", "Providence RI", "Southern NH"],
};
const TYPES: Facility["propertyType"][] = ["office", "retail", "multifamily", "industrial", "hospitality", "mixed_use", "construction_land"];
const RM: Record<BankId, string[]> = { CC5: ["Laura Nickerson", "Paul Doane"], FID: ["Marc Gagnon", "Joan Pelletier"], BLU: ["Kevin Sheehan", "Ana Furtado"] };
const CAP_RATE: Record<string, number> = { office: 8.25, retail: 7.75, multifamily: 6.0, industrial: 6.5, hospitality: 9.0, mixed_use: 7.25, construction_land: 9.5 };
const VACANCY: Record<string, number> = { office: 14, retail: 9, multifamily: 4, industrial: 5, hospitality: 30, mixed_use: 8, construction_land: 0 };

for (const b of Object.keys(SUBMARKETS) as BankId[]) for (const s of SUBMARKETS[b]) {
  MARKET_DATA[s] = TYPES.filter((t) => t !== "construction_land").map((t) => ({
    propertyType: t,
    vacancyPct: VACANCY[t] + (s.includes("Outer Cape") || s.includes("Brockton") ? 2 : s.includes("Providence") ? 1 : 0),
    capRatePct: money(CAP_RATE[t] + (s.includes("Providence") ? -0.25 : s.includes("Brockton") ? 0.25 : 0)),
  }));
}

/** Deterministic pseudo-random sequence so the book is the same on every boot. */
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NAMES = ["Harborview", "Main Street", "Old Colony", "Bayside", "Pilgrim", "Mill River", "Granite", "Canal", "Riverside", "Commonwealth", "Pleasant Street", "Route 44", "Taunton Green", "Union", "Elm", "Kingston", "Summit", "Beacon"];
const SUFFIX: Record<string, string> = { office: "Office Park", retail: "Plaza", multifamily: "Apartments", industrial: "Logistics Center", hospitality: "Inn", mixed_use: "Block", construction_land: "Development Site" };

/** The book's total CRE balance per bank (the targets the generator lands on, to the dollar). */
export const CRE_TARGET: Record<BankId, { total: number; constructionLand: number; count: number }> = {
  CC5: { total: 705_000_000, constructionLand: 62_000_000, count: 18 },
  FID: { total: 212_000_000, constructionLand: 18_000_000, count: 12 },
  BLU: { total: 498_000_000, constructionLand: 96_000_000, count: 16 },
};

function generated(bankId: BankId, reviewed: Facility[]): Facility[] {
  const rand = rng(bankId === "CC5" ? 501 : bankId === "FID" ? 1401 : 1601);
  const t = CRE_TARGET[bankId];
  const reviewedTotal = reviewed.reduce((s, f) => s + f.balance, 0);
  const reviewedCld = reviewed.filter((f) => f.propertyType === "construction_land").reduce((s, f) => s + f.balance, 0);
  const n = t.count - reviewed.length;
  const out: Facility[] = [];
  const cldCount = 2;
  const cldEach = Math.round((t.constructionLand - reviewedCld) / cldCount / 1000) * 1000;
  const otherTotal = t.total - reviewedTotal - cldEach * cldCount;
  const weights = Array.from({ length: n - cldCount }, () => 0.5 + rand());
  const wsum = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const isCld = i >= n - cldCount;
    const type: Facility["propertyType"] = isCld ? "construction_land" : TYPES[Math.floor(rand() * 6)];
    let balance = isCld ? cldEach : Math.round((otherTotal * weights[i]) / wsum / 1000) * 1000;
    if (!isCld && i === n - cldCount - 1) balance = otherTotal - allocated;
    if (!isCld) allocated += balance;
    const sub = SUBMARKETS[bankId][Math.floor(rand() * SUBMARKETS[bankId].length)];
    const floating = isCld || rand() < 0.35;
    const rate = money(floating ? 6.1 + rand() * 1.1 : 4.0 + rand() * 2.2);
    const amort = isCld ? null : 180 + Math.floor(rand() * 120);
    const ds = annualDebtService(balance, rate, amort, isCld);
    const dscr = isCld ? 0 : money(1.32 + rand() * 0.6);
    const noi = isCld ? 0 : Math.round(ds * dscr);
    const capRate = CAP_RATE[type] / 100;
    const value = isCld ? Math.round(balance / 0.62) : Math.round(noi / capRate);
    const year = 2027 + Math.floor(rand() * 6);
    const maturity = `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-01`;
    const reset = !floating && rand() < 0.3 ? `${2027 + Math.floor(rand() * 3)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-01` : null;
    const id = `FAC-${bankId}-${String(1100 + i).padStart(4, "0")}`;
    const name = `${NAMES[Math.floor(rand() * NAMES.length)]} ${SUFFIX[type]}`;
    out.push({
      facilityId: id, bankId, relationshipId: `REL-${bankId}-${String(500 + i).padStart(4, "0")}`, borrowerName: `${name.split(" ")[0]} ${type === "multifamily" ? "Residential" : "Realty"} LLC`,
      guarantor: rand() < 0.6 ? "Principal guaranty" : null, relationshipManager: RM[bankId][i % 2], propertyName: name, propertyType: type, subMarket: sub,
      balance, commitment: isCld ? Math.round(balance * 1.4 / 1000) * 1000 : balance, rateType: floating ? "floating" : "fixed", noteRatePct: rate, resetDate: reset, maturityDate: maturity,
      amortizationMonthsRemaining: amort, interestOnly: isCld, annualDebtService: ds,
      lastReview: { reviewDate: `2025-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-15`, noi, occupancyPct: isCld ? 0 : Math.round(85 + rand() * 13), dscr, finalGrade: POLICIES[bankId].ratingScale[1 + Math.floor(rand() * 2)].grade },
      appraisal: { value, effectiveDate: `${2023 + Math.floor(rand() * 3)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-10`, type: "appraisal" },
      covenants: isCld ? [] : [{ covenantId: `${id}-COV1`, type: "min_dscr", threshold: POLICIES[bankId].dscrMinimum, testDate: "2026-12-31", testBasis: "fiscal year NOI / annual debt service" }],
      dueForReview: false, ownerOccupied: false,
    });
  }
  return out;
}

// The three facilities due for review now, with documents behind them.
const TC_BAL = 14_200_000, TC_RATE = 6.6, TC_AMORT = 252;
const MS_BAL = 6_400_000, MS_RATE = 4.25, MS_AMORT = 189;
const ML_BAL = 7_400_000, ML_RATE = 4.1, ML_AMORT = 276;

export const REVIEW_FACILITIES: Facility[] = [
  {
    facilityId: "FAC-BLU-1007", bankId: "BLU", relationshipId: "REL-BLU-0207", borrowerName: "Taunton Commons Associates LLC", guarantor: "Raymond Medeiros (personal guaranty, 50%)", relationshipManager: "Kevin Sheehan",
    propertyName: "Taunton Commons", propertyType: "retail", subMarket: "Taunton / Raynham", balance: TC_BAL, commitment: TC_BAL, rateType: "floating", noteRatePct: TC_RATE, resetDate: null, maturityDate: "2029-06-30",
    amortizationMonthsRemaining: TC_AMORT, interestOnly: false, annualDebtService: annualDebtService(TC_BAL, TC_RATE, TC_AMORT, false),
    lastReview: { reviewDate: "2025-10-20", noi: 1_768_000, occupancyPct: 94, dscr: 1.43, finalGrade: "B+" },
    appraisal: { value: 23_500_000, effectiveDate: "2025-04-18", type: "appraisal" },
    covenants: [{ covenantId: "FAC-BLU-1007-COV1", type: "min_dscr", threshold: 1.2, testDate: "2026-06-30", testBasis: "trailing twelve months NOI / annual debt service" }, { covenantId: "FAC-BLU-1007-COV2", type: "min_occupancy", threshold: 85, testDate: "2026-06-30", testBasis: "leased square feet / gross leasable area" }],
    dueForReview: true, ownerOccupied: false,
  },
  {
    facilityId: "FAC-CC5-2011", bankId: "CC5", relationshipId: "REL-CC5-0311", borrowerName: "Main Street Medical Partners LLC", guarantor: "Dr. Helen Cabral (personal guaranty)", relationshipManager: "Laura Nickerson",
    propertyName: "Main Street Medical Building", propertyType: "office", subMarket: "Cape Cod - Hyannis", balance: MS_BAL, commitment: MS_BAL, rateType: "fixed", noteRatePct: MS_RATE, resetDate: "2027-07-01", maturityDate: "2032-07-01",
    amortizationMonthsRemaining: MS_AMORT, interestOnly: false, annualDebtService: annualDebtService(MS_BAL, MS_RATE, MS_AMORT, false),
    lastReview: { reviewDate: "2025-10-08", noi: 712_000, occupancyPct: 96, dscr: 1.28, finalGrade: "5" },
    appraisal: { value: 9_800_000, effectiveDate: "2024-03-12", type: "appraisal" },
    covenants: [{ covenantId: "FAC-CC5-2011-COV1", type: "min_dscr", threshold: 1.25, testDate: "2026-09-30", testBasis: "trailing twelve months NOI / annual debt service" }],
    dueForReview: true, ownerOccupied: false,
  },
  {
    facilityId: "FAC-FID-3004", bankId: "FID", relationshipId: "REL-FID-0404", borrowerName: "Mill Lofts Residential LLC", guarantor: null, relationshipManager: "Marc Gagnon",
    propertyName: "Leominster Mill Lofts", propertyType: "multifamily", subMarket: "Leominster / Fitchburg", balance: ML_BAL, commitment: ML_BAL, rateType: "fixed", noteRatePct: ML_RATE, resetDate: null, maturityDate: "2031-11-01",
    amortizationMonthsRemaining: ML_AMORT, interestOnly: false, annualDebtService: annualDebtService(ML_BAL, ML_RATE, ML_AMORT, false),
    lastReview: { reviewDate: "2025-11-03", noi: 768_000, occupancyPct: 97, dscr: 1.54, finalGrade: "5" },
    appraisal: { value: 14_500_000, effectiveDate: "2021-05-14", type: "appraisal" },
    covenants: [{ covenantId: "FAC-FID-3004-COV1", type: "min_dscr", threshold: 1.2, testDate: "2026-09-30", testBasis: "trailing twelve months NOI / annual debt service" }],
    dueForReview: true, ownerOccupied: false,
  },
];

export const FACILITIES: Facility[] = (["CC5", "FID", "BLU"] as BankId[]).flatMap((b) => {
  const reviewed = REVIEW_FACILITIES.filter((f) => f.bankId === b);
  return [...reviewed, ...generated(b, reviewed)];
});

export const facilityById = (id: unknown) => FACILITIES.find((f) => f.facilityId === String(id ?? "").trim().toUpperCase());

// ── Borrower financials (review facilities only) ─────────────────────────────

export interface FinLine { ref: string; label: string; values: Record<string, number> }
export interface FinancialDocument { documentId: string; facilityId: string; kind: "operating_statement" | "rent_roll" | "tax_return_summary"; title: string; periods: string[]; lines: FinLine[]; onFileBeforeRequest: boolean; notes?: string }
export interface RentRollRow { ref: string; tenant: string; suite: string; sqft: number; annualBaseRent: number; leaseStart: string; leaseExpiry: string; status: "occupied" | "vacant" }

function statement(documentId: string, facilityId: string, title: string, periods: string[], rows: Array<[string, number[]]>, onFile: boolean, notes?: string): FinancialDocument {
  return { documentId, facilityId, kind: "operating_statement", title, periods, onFileBeforeRequest: onFile, notes,
    lines: rows.map(([label, vals], i) => ({ ref: `L${String(i + 1).padStart(2, "0")}`, label, values: Object.fromEntries(periods.map((p, j) => [p, vals[j]])) })) };
}

/** Rows: gross potential rent, vacancy and credit loss, reimbursements, EGI, opex lines, total opex, NOI -- every total is the sum of its lines. */
function opStatementRows(gpr: number[], vac: number[], reimb: number[], opex: Array<[string, number[]]>): Array<[string, number[]]> {
  const egi = gpr.map((g, i) => g - vac[i] + reimb[i]);
  const tot = gpr.map((_, i) => opex.reduce((s, [, v]) => s + v[i], 0));
  return [["Gross potential rent", gpr], ["Less vacancy and credit loss", vac], ["Expense reimbursements", reimb], ["Effective gross income", egi], ...opex, ["Total operating expenses", tot], ["Net operating income", egi.map((e, i) => e - tot[i])]];
}

export const RENT_ROLLS: Record<string, { documentId: string; facilityId: string; asOf: string; gla: number; rows: RentRollRow[]; onFileBeforeRequest: boolean }> = {
  "RR-BLU-1007-2026-09": {
    documentId: "RR-BLU-1007-2026-09", facilityId: "FAC-BLU-1007", asOf: "2026-09-30", gla: 112_400, onFileBeforeRequest: false,
    rows: [
      { ref: "R01", tenant: "Harbor Fresh Grocery", suite: "A", sqft: 42_000, annualBaseRent: 874_000, leaseStart: "2012-07-01", leaseExpiry: "2027-06-30", status: "occupied" },
      { ref: "R02", tenant: "Raynham Fitness Club", suite: "B", sqft: 16_000, annualBaseRent: 288_000, leaseStart: "2019-03-01", leaseExpiry: "2029-02-28", status: "occupied" },
      { ref: "R03", tenant: "Coastal Pharmacy", suite: "C", sqft: 11_200, annualBaseRent: 252_000, leaseStart: "2016-09-01", leaseExpiry: "2031-08-31", status: "occupied" },
      { ref: "R04", tenant: "Bristol County Dental", suite: "D1", sqft: 4_800, annualBaseRent: 120_000, leaseStart: "2021-01-01", leaseExpiry: "2028-12-31", status: "occupied" },
      { ref: "R05", tenant: "Silver City Pizza", suite: "D2", sqft: 2_400, annualBaseRent: 64_800, leaseStart: "2020-05-01", leaseExpiry: "2027-04-30", status: "occupied" },
      { ref: "R06", tenant: "Taunton Credit Union branch", suite: "E", sqft: 3_600, annualBaseRent: 108_000, leaseStart: "2018-10-01", leaseExpiry: "2028-09-30", status: "occupied" },
      { ref: "R07", tenant: "Nails & Spa", suite: "F1", sqft: 1_800, annualBaseRent: 50_400, leaseStart: "2022-06-01", leaseExpiry: "2027-05-31", status: "occupied" },
      { ref: "R08", tenant: "Pet Supply Depot", suite: "G", sqft: 9_600, annualBaseRent: 182_400, leaseStart: "2017-02-01", leaseExpiry: "2030-01-31", status: "occupied" },
      { ref: "R09", tenant: "Mattress Outlet", suite: "H", sqft: 6_400, annualBaseRent: 147_200, leaseStart: "2023-04-01", leaseExpiry: "2028-03-31", status: "occupied" },
      { ref: "R10", tenant: "(vacant)", suite: "F2", sqft: 2_200, annualBaseRent: 0, leaseStart: "", leaseExpiry: "", status: "vacant" },
      { ref: "R11", tenant: "(vacant)", suite: "J", sqft: 12_400, annualBaseRent: 0, leaseStart: "", leaseExpiry: "", status: "vacant" },
    ],
  },
  "RR-CC5-2011-2026-09": {
    documentId: "RR-CC5-2011-2026-09", facilityId: "FAC-CC5-2011", asOf: "2026-09-30", gla: 38_000, onFileBeforeRequest: false,
    rows: [
      { ref: "R01", tenant: "Cape Cod Pediatrics", suite: "100", sqft: 9_200, annualBaseRent: 248_400, leaseStart: "2018-01-01", leaseExpiry: "2028-12-31", status: "occupied" },
      { ref: "R02", tenant: "Hyannis Orthopedics", suite: "200", sqft: 8_800, annualBaseRent: 246_400, leaseStart: "2017-06-01", leaseExpiry: "2027-05-31", status: "occupied" },
      { ref: "R03", tenant: "Barnstable Imaging", suite: "300", sqft: 6_400, annualBaseRent: 185_600, leaseStart: "2020-02-01", leaseExpiry: "2030-01-31", status: "occupied" },
      { ref: "R04", tenant: "Physical Therapy Partners", suite: "150", sqft: 4_400, annualBaseRent: 110_000, leaseStart: "2021-09-01", leaseExpiry: "2026-12-31", status: "occupied" },
      { ref: "R05", tenant: "(vacant -- Cape Dermatology vacated 2026-03-31)", suite: "250", sqft: 9_200, annualBaseRent: 0, leaseStart: "", leaseExpiry: "", status: "vacant" },
    ],
  },
  "RR-FID-3004-2026-09": {
    documentId: "RR-FID-3004-2026-09", facilityId: "FAC-FID-3004", asOf: "2026-09-30", gla: 64, onFileBeforeRequest: false,
    rows: [
      { ref: "R01", tenant: "1-bedroom units (28)", suite: "1BR", sqft: 28, annualBaseRent: 470_400, leaseStart: "various", leaseExpiry: "12-month leases", status: "occupied" },
      { ref: "R02", tenant: "2-bedroom units (30)", suite: "2BR", sqft: 30, annualBaseRent: 637_200, leaseStart: "various", leaseExpiry: "12-month leases", status: "occupied" },
      { ref: "R03", tenant: "Studio units (4)", suite: "ST", sqft: 4, annualBaseRent: 52_800, leaseStart: "various", leaseExpiry: "12-month leases", status: "occupied" },
      { ref: "R04", tenant: "Vacant units (2)", suite: "VAC", sqft: 2, annualBaseRent: 0, leaseStart: "", leaseExpiry: "", status: "vacant" },
    ],
  },
};

export const FINANCIAL_DOCUMENTS: FinancialDocument[] = [
  statement("OS-BLU-1007-FY2025", "FAC-BLU-1007", "Taunton Commons -- operating statement, fiscal year 2025", ["FY2024", "FY2025"],
    opStatementRows([2_310_000, 2_336_000], [92_400, 121_500], [418_000, 431_000], [["Real estate taxes", [240_000, 247_000]], ["Insurance", [82_000, 88_000]], ["Common area maintenance", [221_000, 228_000]], ["Utilities", [59_000, 61_000]], ["Management fee", [96_000, 97_000]], ["Repairs and maintenance", [77_000, 80_000]], ["General and administrative", [36_000, 37_000]]]), false),
  statement("OS-BLU-1007-T12-2026-06", "FAC-BLU-1007", "Taunton Commons -- trailing twelve months to 2026-06-30", ["T12 2026-06"],
    opStatementRows([2_342_000], [168_400], [424_000], [["Real estate taxes", [251_000]], ["Insurance", [92_000]], ["Common area maintenance", [231_000]], ["Utilities", [63_000]], ["Management fee", [95_000]], ["Repairs and maintenance", [82_000]], ["General and administrative", [38_000]]]), false,
    "Suite J (12,400 sf) vacated 2026-01-31 when Discount Home Goods closed."),
  statement("OS-CC5-2011-FY2025", "FAC-CC5-2011", "Main Street Medical Building -- operating statement, fiscal year 2025", ["FY2024", "FY2025"],
    opStatementRows([1_036_000, 1_064_000], [20_700, 31_900], [96_000, 99_000], [["Real estate taxes", [118_000, 123_000]], ["Insurance", [41_000, 47_000]], ["Utilities", [86_000, 89_000]], ["Janitorial and maintenance", [97_000, 101_000]], ["Management fee", [52_000, 53_000]], ["General and administrative", [18_000, 19_000]]]), false),
  statement("OS-CC5-2011-T12-2026-09", "FAC-CC5-2011", "Main Street Medical Building -- trailing twelve months to 2026-09-30", ["T12 2026-09"],
    opStatementRows([1_078_000], [157_100], [84_000], [["Real estate taxes", [110_000]], ["Insurance", [41_000]], ["Utilities", [72_000]], ["Janitorial and maintenance", [80_000]], ["Management fee", [40_000]], ["General and administrative", [9_000]]]), false,
    "Cape Dermatology (suite 250, 9,200 sf) vacated 2026-03-31 at lease expiry."),
  statement("OS-FID-3004-FY2025", "FAC-FID-3004", "Leominster Mill Lofts -- operating statement, fiscal year 2025", ["FY2024", "FY2025"],
    opStatementRows([1_142_000, 1_178_000], [45_700, 41_200], [0, 0], [["Real estate taxes", [96_000, 99_000]], ["Insurance", [38_000, 43_000]], ["Utilities", [61_000, 63_000]], ["Repairs and maintenance", [54_000, 57_000]], ["Payroll", [48_000, 50_000]], ["Management fee", [45_000, 47_000]], ["Replacement reserves", [16_000, 16_000]]]), false),
  statement("OS-FID-3004-T12-2026-09", "FAC-FID-3004", "Leominster Mill Lofts -- trailing twelve months to 2026-09-30", ["T12 2026-09"],
    opStatementRows([1_196_000], [36_400], [0], [["Real estate taxes", [101_000]], ["Insurance", [45_000]], ["Utilities", [64_000]], ["Repairs and maintenance", [58_000]], ["Payroll", [51_000]], ["Management fee", [48_000]], ["Replacement reserves", [16_000]]]), false),
];

export const documentById = (id: unknown) => FINANCIAL_DOCUMENTS.find((d) => d.documentId === String(id ?? "").trim().toUpperCase());

/** Every statement and rent roll the borrower sends for a facility under review. */
export const documentIdsFor = (facilityId: string): string[] => [
  ...FINANCIAL_DOCUMENTS.filter((d) => d.facilityId === facilityId).map((d) => d.documentId),
  ...Object.values(RENT_ROLLS).filter((r) => r.facilityId === facilityId).map((r) => r.documentId),
];

/** Every cell a spread or memo may cite: <documentId>!<lineRef>[@<period>] for statements, <documentId>!<rowRef> for rent rolls. */
export function citationExists(raw: unknown): boolean {
  const m = String(raw ?? "").trim().toUpperCase().match(/^([A-Z0-9-]+)!([LR]\d{2})(?:@(.+))?$/);
  if (!m) return false;
  const [, docId, ref, period] = m;
  const d = FINANCIAL_DOCUMENTS.find((x) => x.documentId === docId);
  if (d) {
    const line = d.lines.find((l) => l.ref === ref);
    return !!line && (!period || Object.keys(line.values).some((p) => p.toUpperCase() === period.trim()));
  }
  const rr = RENT_ROLLS[docId];
  return !!rr && rr.rows.some((r) => r.ref === ref);
}

export function publicFacility(f: Facility, borrowerLevel: boolean) {
  const base = {
    facilityId: f.facilityId, bankId: f.bankId, owningBank: BANKS[f.bankId].name, relationshipId: f.relationshipId, propertyType: f.propertyType, subMarket: f.subMarket,
    balance: f.balance, commitment: f.commitment, rateType: f.rateType, noteRatePct: f.noteRatePct, resetDate: f.resetDate, maturityDate: f.maturityDate,
    amortizationMonthsRemaining: f.amortizationMonthsRemaining, interestOnly: f.interestOnly, annualDebtService: f.annualDebtService,
    lastReview: f.lastReview, appraisal: f.appraisal, covenants: f.covenants, dueForReview: f.dueForReview, ownerOccupied: f.ownerOccupied,
  };
  return borrowerLevel ? { ...base, borrowerName: f.borrowerName, guarantor: f.guarantor, relationshipManager: f.relationshipManager, propertyName: f.propertyName } : base;
}
