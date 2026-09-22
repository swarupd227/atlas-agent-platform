import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";

/**
 * Simulated carrier rating and predictive-analytics engine -- the side of an
 * MGA placement that must not be improvised.
 *
 * A premium is a calculation, not an opinion: the same risk at the same
 * deductibles and the same discretionary credit always rates to the same
 * number here, and every factor that moved it is returned alongside the
 * result so the figure can be defended to a carrier or an auditor. An agent
 * that "estimates" a premium instead of calling this is producing fiction,
 * which is why the rating step is configured to require the call.
 *
 * Three capabilities, deliberately separate:
 *   - rate_risk: the deterministic premium calculation, with statutory
 *     surplus lines tax and stamping fees allocated by state exposure.
 *   - score_risk: the predictive risk score, benchmarked against a peer
 *     cohort -- an input to judgement, never a limit.
 *   - get_treaty_terms: the carrier's delegated authority in force, so a
 *     referral can quote the clause and limit it breached rather than
 *     paraphrasing them.
 *
 * Refusals are the point: a discretionary credit outside the underwriter's
 * authority, an unknown construction class or a deductible outside the filed
 * range is rejected, not quietly clamped.
 */

const router = Router();

/** Rate per $100 of insured value; better construction rates lower. */
const BASE_RATE_BY_ISO_CLASS: Record<number, { rate: number; label: string }> = {
  1: { rate: 0.242, label: "Frame" },
  2: { rate: 0.185, label: "Joisted Masonry" },
  3: { rate: 0.146, label: "Non-Combustible" },
  4: { rate: 0.118, label: "Masonry Non-Combustible" },
  5: { rate: 0.095, label: "Modified Fire Resistive" },
  6: { rate: 0.082, label: "Fire Resistive" },
};

/** Statutory surplus lines charges by state, as filed. */
const SURPLUS_LINES_BY_STATE: Record<string, { taxPct: number; stampingPct: number; office: string }> = {
  FL: { taxPct: 4.94, stampingPct: 0.06, office: "FSLSO" },
  TX: { taxPct: 4.85, stampingPct: 0.075, office: "SLTX" },
  AL: { taxPct: 6.0, stampingPct: 0.0, office: "ALSLA" },
  LA: { taxPct: 4.85, stampingPct: 0.175, office: "LASLA" },
  MA: { taxPct: 4.0, stampingPct: 0.0, office: "MA DOI" },
  RI: { taxPct: 4.0, stampingPct: 0.0, office: "RI DBR" },
  OK: { taxPct: 6.0, stampingPct: 0.0, office: "OK SLD" },
};

const IRPM_AUTHORITY = { minPct: -25, maxPct: 25 };
const WIND_DEDUCTIBLE_RANGE = { minPct: 1, maxPct: 10 };
const BROKER_COMMISSION_PCT = 12;

const TREATIES: Record<string, Record<string, unknown>> = {
  "CP-2026-17": {
    treatyId: "CP-2026-17",
    carrierCode: "CARRIER-A",
    carrierName: "Carrier A Specialty Insurance Company",
    lineOfBusiness: "Commercial Property (E&S)",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    delegatedAuthority: {
      singleRiskLimit: 25_000_000,
      coastalTier1AggregateLimit: 50_000_000,
      maxPolicyTermMonths: 12,
      permittedStates: ["FL", "TX", "AL", "LA", "MA", "RI", "OK"],
    },
    clauses: {
      "4.2": "Single risk limit: the Managing General Agent shall not bind any single location whose total insured value exceeds USD 25,000,000 without prior written referral.",
      "4.3": "Coastal aggregate: the Managing General Agent shall not bind business where the aggregate total insured value of Tier 1 windstorm locations exceeds USD 50,000,000 without prior written referral.",
      "6.1": "Mandatory endorsement: any risk with Tier 1 windstorm exposure shall carry the approved coastal windstorm and flood provision, unamended.",
    },
    referralPath: { queue: "Carrier A Property Referrals", slaHours: 24, requires: ["breach summary", "exposure detail", "loss history", "requested exception"] },
    occupancyExclusions: ["Marina", "Pier / Over-water structure", "Vacant > 60 days"],
  },
};

function now() { return new Date().toISOString(); }
function idFrom(prefix: string, seed: string) {
  return `${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 8).toUpperCase()}`;
}
const money = (n: number) => Math.round(n * 100) / 100;

router.get("/treaty", (req: Request, res: Response) => {
  const id = String(req.query.treatyId || "CP-2026-17").trim();
  const treaty = TREATIES[id];
  if (!treaty) {
    res.status(404).json({ error: `No treaty "${id}" found.`, availableTreaties: Object.keys(TREATIES) });
    return;
  }
  res.json({
    ...treaty,
    retrievedAt: now(),
    guidance: "These limits are the carrier's delegated authority. Evaluate them deterministically: a breach is a referral, never an underwriting judgement call, and the clause number belongs in the referral packet.",
  });
});

router.post("/rate", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const submissionId = String(b.submissionId || "").trim();
  const totalTiv = Number(b.totalTiv);
  const coastalTier1Tiv = Number(b.coastalTier1Tiv ?? 0);
  const isoClass = Number(b.predominantIsoClass);
  const windPct = Number(b.windstormDeductiblePct ?? 2);
  const aopDeductible = Number(b.aopDeductible ?? 10_000);
  const irpmPct = Number(b.irpmCreditPct ?? 0);
  const exposureByState = (b.exposureByState || {}) as Record<string, { tiv?: number } | number>;

  if (!submissionId || !Number.isFinite(totalTiv) || totalTiv <= 0) {
    res.status(400).json({ error: "submissionId and a positive totalTiv are required." });
    return;
  }
  if (!BASE_RATE_BY_ISO_CLASS[isoClass]) {
    res.status(422).json({ error: `Unknown ISO construction class "${b.predominantIsoClass}".`, allowedClasses: Object.keys(BASE_RATE_BY_ISO_CLASS).map(Number) });
    return;
  }
  if (irpmPct < IRPM_AUTHORITY.minPct || irpmPct > IRPM_AUTHORITY.maxPct) {
    res.status(422).json({
      error: `IRPM credit ${irpmPct}% is outside underwriting authority (${IRPM_AUTHORITY.minPct}% to ${IRPM_AUTHORITY.maxPct}%).`,
      authority: IRPM_AUTHORITY,
      guidance: "A credit beyond authority needs a documented exception from the carrier, not a re-rate at the boundary.",
    });
    return;
  }
  if (windPct < WIND_DEDUCTIBLE_RANGE.minPct || windPct > WIND_DEDUCTIBLE_RANGE.maxPct) {
    res.status(422).json({ error: `Windstorm deductible ${windPct}% is outside the filed range.`, filedRange: WIND_DEDUCTIBLE_RANGE });
    return;
  }

  const base = BASE_RATE_BY_ISO_CLASS[isoClass];
  const coastalShare = totalTiv > 0 ? Math.min(1, coastalTier1Tiv / totalTiv) : 0;
  const coastalLoadFactor = 1 + coastalShare * 0.85;
  const windCreditFactor = 1 - (windPct - 1) * 0.035;
  const aopCreditFactor = aopDeductible >= 25_000 ? 0.98 : aopDeductible >= 10_000 ? 1.0 : 1.03;
  const irpmFactor = 1 + irpmPct / 100;

  const technicalPremium = (totalTiv / 100) * base.rate * coastalLoadFactor * windCreditFactor * aopCreditFactor;
  const grossPremium = money(technicalPremium * irpmFactor);

  // Statutory charges follow the exposure: each state taxes its own share.
  const stateShares: Array<{ state: string; tiv: number; share: number; taxPct: number; stampingPct: number; office: string; tax: number; stamping: number }> = [];
  const entries = Object.entries(exposureByState).map(([state, v]) => [state, typeof v === "number" ? v : Number(v?.tiv ?? 0)] as const).filter(([, tiv]) => tiv > 0);
  const allocationBase = entries.reduce((sum, [, tiv]) => sum + tiv, 0) || totalTiv;
  const allocation = entries.length > 0 ? entries : [["FL", totalTiv] as const];
  for (const [state, tiv] of allocation) {
    const rules = SURPLUS_LINES_BY_STATE[state] || { taxPct: 5.0, stampingPct: 0.0, office: "UNKNOWN" };
    const share = tiv / allocationBase;
    stateShares.push({
      state,
      tiv,
      share: Math.round(share * 10000) / 10000,
      taxPct: rules.taxPct,
      stampingPct: rules.stampingPct,
      office: rules.office,
      tax: money(grossPremium * share * (rules.taxPct / 100)),
      stamping: money(grossPremium * share * (rules.stampingPct / 100)),
    });
  }

  const surplusLinesTax = money(stateShares.reduce((sum, s) => sum + s.tax, 0));
  const stampingFee = money(stateShares.reduce((sum, s) => sum + s.stamping, 0));
  const brokerCommission = money(grossPremium * (BROKER_COMMISSION_PCT / 100));
  const netCarrierPremium = money(grossPremium - brokerCommission);
  const totalPayableByInsured = money(grossPremium + surplusLinesTax + stampingFee);

  res.json({
    ratingId: idFrom("RTG", `${submissionId}|${totalTiv}|${coastalTier1Tiv}|${isoClass}|${windPct}|${aopDeductible}|${irpmPct}`),
    submissionId,
    ratedAt: now(),
    inputs: { totalTiv, coastalTier1Tiv, predominantIsoClass: isoClass, constructionType: base.label, windstormDeductiblePct: windPct, aopDeductible, irpmCreditPct: irpmPct },
    factors: [
      { factor: "base_rate_per_100", value: base.rate, basis: `ISO class ${isoClass} (${base.label})` },
      { factor: "coastal_tier1_load", value: Math.round(coastalLoadFactor * 10000) / 10000, basis: `${Math.round(coastalShare * 1000) / 10}% of TIV in Tier 1 windstorm` },
      { factor: "wind_deductible_credit", value: Math.round(windCreditFactor * 10000) / 10000, basis: `${windPct}% named storm deductible` },
      { factor: "aop_deductible_credit", value: aopCreditFactor, basis: `USD ${aopDeductible.toLocaleString("en-US")} all-other-perils deductible` },
      { factor: "irpm", value: Math.round(irpmFactor * 10000) / 10000, basis: `${irpmPct}% discretionary credit within authority` },
    ],
    premium: {
      technicalPremium: money(technicalPremium),
      grossPremium,
      surplusLinesTax,
      stampingFee,
      brokerCommissionPct: BROKER_COMMISSION_PCT,
      brokerCommission,
      netCarrierPremium,
      totalPayableByInsured,
      currency: "USD",
    },
    taxAllocation: stateShares,
    guidance: "Quote these figures as returned. The rating id must accompany the binding request: a policy cannot be bound against a premium this engine did not calculate.",
  });
});

router.post("/predict-score", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const submissionId = String(b.submissionId || "").trim();
  const totalTiv = Number(b.totalTiv);
  const coastalTier1Tiv = Number(b.coastalTier1Tiv ?? 0);
  const sprinkleredPct = Number(b.sprinkleredPct ?? 0);
  const occupancy = String(b.predominantOccupancy || "Unclassified");
  const lossRuns = Array.isArray(b.lossRuns) ? b.lossRuns : [];

  if (!submissionId || !Number.isFinite(totalTiv) || totalTiv <= 0) {
    res.status(400).json({ error: "submissionId and a positive totalTiv are required." });
    return;
  }
  if (lossRuns.length === 0) {
    res.status(422).json({ error: "lossRuns are required: a risk score without loss history is not an assessment.", guidance: "Read the loss runs from the submission and pass them, even when every year is clean." });
    return;
  }

  const years = lossRuns.length;
  const totalIncurred = lossRuns.reduce((sum: number, y: any) => sum + Number(y.incurred || 0), 0);
  const totalClaims = lossRuns.reduce((sum: number, y: any) => sum + Number(y.claimCount || 0), 0);
  const stormClaims = lossRuns.filter((y: any) => /storm|wind|hail/i.test(String(y.predominantCause || ""))).reduce((sum: number, y: any) => sum + Number(y.claimCount || 0), 0);

  const lossPenalty = Math.min(22, (totalIncurred / totalTiv) * 1000);
  const coastalShare = Math.min(1, coastalTier1Tiv / totalTiv);
  const coastalPenalty = coastalShare * 32;
  const frequencyPenalty = Math.min(9, (totalClaims / Math.max(1, years)) * 1.6);
  const stormPenalty = Math.min(6, stormClaims * 0.6);
  const protectionCredit = (sprinkleredPct / 100) * 6;

  const raw = 78 - lossPenalty - coastalPenalty - frequencyPenalty - stormPenalty + protectionCredit;
  const score = Math.max(1, Math.min(100, Math.round(raw)));

  const cohortByOccupancy: Record<string, number> = {
    "Hotel - Limited Service": 57, "Hotel - Full Service": 57, "Restaurant": 54,
    "Retail - Strip Center": 60, "Warehouse - General": 71, "Office - Low Rise": 68,
    "Self Storage": 69, "Apartments - Garden": 63, "Unclassified": 62,
  };
  const peerCohortMean = cohortByOccupancy[occupancy] ?? 62;
  const deltaVsPeerPct = Math.round(((score - peerCohortMean) / peerCohortMean) * 1000) / 10;

  res.json({
    scoringId: idFrom("PRD", `${submissionId}|${score}`),
    submissionId,
    scoredAt: now(),
    score,
    scale: "1-100, higher is better risk quality",
    peerCohort: { occupancy, mean: peerCohortMean, source: "Valen consortium, trailing 5 years", deltaVsPeerPct },
    drivers: [
      { driver: "loss_severity", impact: -Math.round(lossPenalty * 10) / 10, basis: `USD ${Math.round(totalIncurred).toLocaleString("en-US")} incurred over ${years} years against USD ${Math.round(totalTiv).toLocaleString("en-US")} TIV` },
      { driver: "coastal_concentration", impact: -Math.round(coastalPenalty * 10) / 10, basis: `${Math.round(coastalShare * 1000) / 10}% of TIV in Tier 1 windstorm` },
      { driver: "claim_frequency", impact: -Math.round(frequencyPenalty * 10) / 10, basis: `${totalClaims} claims over ${years} years` },
      { driver: "storm_claims", impact: -Math.round(stormPenalty * 10) / 10, basis: `${stormClaims} wind, hail or named storm claims` },
      { driver: "sprinkler_protection", impact: Math.round(protectionCredit * 10) / 10, basis: `${sprinkleredPct}% of locations sprinklered` },
    ],
    guidance: "This score is an input to underwriting judgement and to pricing discussion. It is not an authority limit: a score above the cohort never overrides a treaty breach.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  res.json({ reset: true, note: "Rating and scoring are pure calculations; there is no accumulated state to clear.", resetAt: now() });
});

export default router;
