/**
 * One book, four systems.
 *
 * The binder period close is a reconciliation workflow: its whole point is that
 * the policy system, the billing ledger and the claims file are compared and
 * either agree or are made to. So they must be generated from ONE source, with
 * every disagreement deliberate and exact. Four independently seeded systems
 * would disagree by accident, and a demo whose variance is an artefact of
 * random data cannot show a reconciliation catching anything.
 *
 * Everything here is deterministic: the same period always produces the same
 * risks, the same premium and the same defects, so a figure quoted in a
 * presenter pack is still true next month.
 */

export const BINDER_ID = "CP-2026-17";
export const CARRIER_CODE = "CARRIER-A";
export const CARRIER_NAME = "Carrier A Specialty Insurance Company";

/** Binder commission and the treaty-year capacity the aggregates roll into. */
export const BINDER_TERMS = {
  binderId: BINDER_ID,
  carrierCode: CARRIER_CODE,
  carrierName: CARRIER_NAME,
  treatyYear: 2026,
  lineOfBusiness: "Commercial Property (E&S)",
  binderCommissionPct: 12.0,
  profitCommissionPct: 5.0,
  profitCommissionLossRatioThresholdPct: 62.0,
  // Per-risk and per-submission authority mirror the deal journey's treaty
  // (see insurity-rating.ts) so the two demos tell one continuous story.
  singleRiskLimit: 25_000_000,
  minWindstormDeductiblePct: 5,
  // The treaty YEAR capacity, which the per-submission referral limit sits
  // inside: a submission over 50M refers, and the year as a whole is capped.
  coastalTier1TreatyYearCap: 250_000_000,
  capacityWarningPct: 80,
  reportingDeadlineDays: 20,
  bordereauTemplateVersion: "CARRIER-A-BDX-v4.1",
  permittedStates: ["FL", "TX", "AL", "LA", "MA", "RI", "OK"],
} as const;

/** Tolerances the close is judged against. Decisions A and B read these. */
export const CLOSE_TOLERANCES = {
  exceptionRatePct: 2.0,
  premiumVarianceAbsolute: 1_000,
  premiumVariancePctOfGwp: 0.10,
  maxCorrectionRounds: 2,
} as const;

/**
 * The binder's reporting calendar: the whole 2026 treaty year.
 *
 * The close demo exercises the first four. The rest exist because a treaty year
 * has twelve reporting periods whether or not a demo closes them, and because
 * the underwriting journey binds risks with effective dates later in the year:
 * asked for the treaty position at 2026-11 the register used to answer
 * "Unknown reporting period", which reads as a broken connector rather than as
 * a calendar that stopped in April.
 */
export type PeriodId =
  | "2026-01" | "2026-02" | "2026-03" | "2026-04"
  | "2026-05" | "2026-06" | "2026-07" | "2026-08"
  | "2026-09" | "2026-10" | "2026-11" | "2026-12";

export interface RiskRow {
  policyNumber: string;
  submissionId: string;
  insuredName: string;
  transactionType: "new_business" | "endorsement" | "cancellation";
  effectiveDate: string;
  expiryDate: string;
  homeState: string;
  isoConstructionClass: number | null;
  buildingValue: number;
  contentsValue: number;
  totalInsuredValue: number;
  largestLocationTiv: number;
  coastalTier1Tiv: number;
  windstormDeductiblePct: number;
  grossPremium: number;
  /** Set only where a period seeds a defect; never random. */
  defect?: string;
}

/** A small deterministic generator: same period, same book, every time. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

const INSUREDS = [
  "Gulf Coast Hospitality Group LLC", "Midland Logistics Warehousing Inc", "Beacon Street Properties LLC",
  "Tidewater Marine Services LLC", "Piedmont Retail Holdings Inc", "Bayou Industrial Park LP",
  "Coastal Grain Terminals Inc", "Lakeshore Storage Partners LLC", "Ridgeline Manufacturing Co",
  "Harbour Point Hotels LLC", "Delta Cold Chain Inc", "Sabine River Logistics LLC",
];
const STATES = ["FL", "TX", "AL", "LA"] as const;

/** What each period is FOR. The report designs four paths; this seeds them. */
export const PERIODS: Record<PeriodId, {
  periodId: PeriodId; label: string; riskCount: number; exercises: string;
  /** Billing is derived from the risks; a period may post a deliberate break. */
  billingBreak?: { amount: number; reason: string; misbookedToBinder: string };
  /** Authority breaches the sweep must find. */
  breaches?: Array<{ policyIndex: number; kind: "single_risk_limit" | "wind_deductible"; priorReferral?: string }>;
  /**
   * Tier 1 coastal TIV this period writes. Designed, not emergent: the
   * capacity scenario turns on the treaty year reaching 96.4% of its cap, and
   * a per-row percentage overshot it by 100M on the first attempt. The coastal
   * rows are scaled to hit this exactly.
   */
  coastalTier1Written: number;
}> = {
  "2026-01": { periodId: "2026-01", label: "January 2026", riskCount: 42, exercises: "clean close", coastalTier1Written: 43_400_000 },
  "2026-02": { periodId: "2026-02", label: "February 2026", riskCount: 51, exercises: "bordereau data quality (Loop A)", coastalTier1Written: 14_200_000 },
  "2026-03": {
    periodId: "2026-03", label: "March 2026", riskCount: 47, exercises: "premium break (Loop B) and authority breaches",
    billingBreak: { amount: 8_430, reason: "Mid-term endorsement additional premium booked against the wrong binder", misbookedToBinder: "CP-2026-14" },
    breaches: [
      { policyIndex: 11, kind: "single_risk_limit" },
      { policyIndex: 29, kind: "wind_deductible", priorReferral: "REF-2026-0214" },
    ],
    coastalTier1Written: 15_600_000,
  },
  "2026-04": { periodId: "2026-04", label: "April 2026", riskCount: 63, exercises: "capacity exhaustion (Decision D)", coastalTier1Written: 19_800_000 },
  // Open, and nothing written yet. Zero risks and zero coastal TIV, so the
  // treaty-year roll-forward is unchanged for the four periods the close
  // demonstrates: the position at any later period is April's position,
  // because nothing has been written since. That is also the true answer for
  // an underwriter asking what capacity is left in November.
  "2026-05": { periodId: "2026-05", label: "May 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-06": { periodId: "2026-06", label: "June 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-07": { periodId: "2026-07", label: "July 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-08": { periodId: "2026-08", label: "August 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-09": { periodId: "2026-09", label: "September 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-10": { periodId: "2026-10", label: "October 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
  "2026-11": { periodId: "2026-11", label: "November 2026", riskCount: 0, exercises: "open; the period E&S submissions bind into", coastalTier1Written: 0 },
  "2026-12": { periodId: "2026-12", label: "December 2026", riskCount: 0, exercises: "open, nothing written yet", coastalTier1Written: 0 },
};

/** Where the treaty year stood before any of these periods. */
export const TREATY_YEAR_OPENING_COASTAL_TIER1 = 148_000_000;
/**
 * Exported, because the binder register had its own copy of this list in two
 * places. A calendar kept in three spots is a calendar that will disagree with
 * itself the first time one of them is extended -- which is exactly what the
 * register did when it was asked for a period the seed knew nothing about.
 */
export const PERIOD_ORDER: PeriodId[] = [
  "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08",
  "2026-09", "2026-10", "2026-11", "2026-12",
];

/**
 * The aggregate BEFORE this period, derived by chaining rather than stated.
 *
 * Hardcoding each opening let them drift from what the periods actually write,
 * and a roll-forward whose periods do not chain is not a roll-forward. Now
 * April's opening IS January through March, by construction.
 */
export function openingCoastalTier1(periodId: PeriodId): number {
  let total = TREATY_YEAR_OPENING_COASTAL_TIER1;
  for (const p of PERIOD_ORDER) {
    if (p === periodId) return total;
    total += PERIODS[p].coastalTier1Written;
  }
  return total;
}

/** The period's book. Every other system derives from this. */
export function risksFor(periodId: PeriodId): RiskRow[] {
  const spec = PERIODS[periodId];
  const next = rng(`mga-close|${periodId}`);
  const rows: RiskRow[] = [];
  const month = Number(periodId.slice(5));

  for (let i = 0; i < spec.riskCount; i++) {
    const state = STATES[Math.floor(next() * STATES.length)];
    const coastal = next() < 0.42;
    const building = 400_000 + Math.round(next() * 5_600_000);
    const contents = 120_000 + Math.round(next() * 1_400_000);
    const tiv = building + contents;
    const txRoll = next();
    const transactionType = txRoll < 0.78 ? "new_business" : txRoll < 0.93 ? "endorsement" : "cancellation";
    const row: RiskRow = {
      policyNumber: `POL-2026-${String(9000 + month * 100 + i).padStart(4, "0")}-CP`,
      submissionId: `SUB-2026-${String(8000 + month * 100 + i).padStart(4, "0")}`,
      insuredName: INSUREDS[i % INSUREDS.length],
      transactionType,
      effectiveDate: `${periodId}-01`,
      expiryDate: `2027-${periodId.slice(5)}-01`,
      homeState: state,
      isoConstructionClass: [1, 2, 4, 5, 6][Math.floor(next() * 5)],
      buildingValue: building,
      contentsValue: contents,
      totalInsuredValue: tiv,
      largestLocationTiv: Math.round(tiv * (0.35 + next() * 0.4)),
      coastalTier1Tiv: coastal ? Math.round(tiv * (0.5 + next() * 0.5)) : 0,
      windstormDeductiblePct: coastal ? 5 : 2,
      grossPremium: Math.round(tiv * (0.0009 + next() * 0.0006) * 100) / 100,
    };
    // A cancellation returns premium; the ledger must agree on the sign.
    if (transactionType === "cancellation") row.grossPremium = -Math.abs(Math.round(row.grossPremium * 0.4 * 100) / 100);
    rows.push(row);
  }

  // --- deliberate defects, by period -------------------------------------
  if (periodId === "2026-02") {
    // The site's own demo ships negative building values and never notices.
    const negatives = [-37_789, -44_771, -39_431, -46_414, -41_075, -35_735];
    negatives.forEach((v, n) => {
      const r = rows[3 + n * 6];
      if (!r) return;
      r.buildingValue = v;
      r.totalInsuredValue = v + r.contentsValue;
      r.defect = "negative building value";
    });
    // Construction code the document never stated: raise it, never infer it.
    for (const idx of [7, 19, 31, 44]) {
      if (!rows[idx]) continue;
      rows[idx].isoConstructionClass = null;
      rows[idx].defect = "ISO construction class absent";
    }
  }
  if (periodId === "2026-03" && spec.breaches) {
    for (const b of spec.breaches) {
      const r = rows[b.policyIndex];
      if (!r) continue;
      if (b.kind === "single_risk_limit") {
        // A deliberate near-miss on the 25M per-risk cap.
        r.largestLocationTiv = 25_430_000;
        r.totalInsuredValue = Math.max(r.totalInsuredValue, 25_430_000 + r.contentsValue);
        r.defect = "single location above the per-risk limit";
      } else {
        r.coastalTier1Tiv = Math.max(r.coastalTier1Tiv, Math.round(r.totalInsuredValue * 0.6));
        r.windstormDeductiblePct = 3;
        r.defect = "named storm deductible below the treaty minimum";
      }
    }
  }
  // Scale the coastal rows so the period writes exactly what it is designed to.
  // Per-row percentages overshoot wildly -- the first attempt put April 100M
  // over a 250M treaty cap -- and the capacity scenario turns on the year
  // landing at a specific utilisation, so the total is the thing to control.
  const coastalRows = rows.filter((r) => r.coastalTier1Tiv > 0);
  const rawCoastal = coastalRows.reduce((a, r) => a + r.coastalTier1Tiv, 0);
  if (rawCoastal > 0) {
    const factor = spec.coastalTier1Written / rawCoastal;
    let running = 0;
    coastalRows.forEach((r, n) => {
      if (n === coastalRows.length - 1) r.coastalTier1Tiv = Math.round(spec.coastalTier1Written - running);
      else { r.coastalTier1Tiv = Math.round(r.coastalTier1Tiv * factor); running += r.coastalTier1Tiv; }
      // Coastal exposure must never exceed the risk's own total.
      r.coastalTier1Tiv = Math.min(r.coastalTier1Tiv, r.totalInsuredValue);
    });
  }
  return rows;
}

export const money = (n: number) => Math.round(n * 100) / 100;
export const sum = (xs: number[]) => money(xs.reduce((a, b) => a + b, 0));

/** Gross written premium as the POLICY system reports it for the period. */
export function gwpFor(periodId: PeriodId): number {
  return sum(risksFor(periodId).map((r) => r.grossPremium));
}

/** Tier 1 coastal written in the period, for the treaty-year roll-forward. */
export function coastalTier1For(periodId: PeriodId): number {
  return sum(risksFor(periodId).map((r) => r.coastalTier1Tiv));
}

export function isPeriod(v: unknown): v is PeriodId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PERIODS, v);
}
export const now = () => new Date().toISOString();
