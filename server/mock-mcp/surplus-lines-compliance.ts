import { Router, type Request, type Response } from "express";

/**
 * Simulated surplus lines compliance service and carrier bordereau queue --
 * the two things that make an E&S placement filable and reportable.
 *
 * Manuscript wording is where E&S exposure is quietly created: a clause
 * outside the carrier's approved taxonomy, or a standard ISO form amended in
 * free text, can widen cover far beyond what was priced. So clause checking
 * here is a linter with a closed vocabulary -- an unapproved clause id is
 * rejected by name, and the clauses an exposure makes mandatory are reported
 * as missing rather than assumed present.
 *
 * Filing requirements are per state and current as filed: tax and stamping
 * rates, the stamping office, the filing deadline, and whether a diligent
 * effort search is required before a risk may be exported.
 *
 * The bordereau queue is the monthly reconciliation file the carrier reads.
 * A policy may be appended once per period; a second attempt is refused with
 * the row that already exists, because a double-counted policy is a
 * reconciliation break somebody spends a week finding.
 *
 * Deterministic and in-memory; resets on restart.
 */

const router = Router();

interface FilingRequirement {
  state: string;
  stampingOffice: string;
  premiumTaxPct: number;
  stampingFeePct: number;
  filingDeadlineDays: number;
  diligentEffortRequired: boolean;
  declinationsRequired: number;
  affidavitForm: string | null;
  notes: string;
}

const FILING_REQUIREMENTS: Record<string, FilingRequirement> = {
  FL: { state: "FL", stampingOffice: "Florida Surplus Lines Service Office (FSLSO)", premiumTaxPct: 4.94, stampingFeePct: 0.06, filingDeadlineDays: 30, diligentEffortRequired: true, declinationsRequired: 3, affidavitForm: "DFS-H2-503", notes: "Diligent effort of three declinations from admitted carriers required unless the risk is on the export list. Submit to FSLSO within 30 days of the effective date." },
  TX: { state: "TX", stampingOffice: "Surplus Lines Stamping Office of Texas (SLTX)", premiumTaxPct: 4.85, stampingFeePct: 0.075, filingDeadlineDays: 60, diligentEffortRequired: true, declinationsRequired: 5, affidavitForm: "SLTX-1", notes: "Policies must be filed with SLTX within 60 days of the effective date. Five declinations required unless the coverage is exempt commercial purchaser business." },
  AL: { state: "AL", stampingOffice: "Alabama Surplus Line Association (ALSLA)", premiumTaxPct: 6.0, stampingFeePct: 0.0, filingDeadlineDays: 30, diligentEffortRequired: true, declinationsRequired: 3, affidavitForm: "ALSLA-AF", notes: "Quarterly tax remittance; individual policies filed within 30 days." },
  LA: { state: "LA", stampingOffice: "Louisiana Surplus Line Association (LASLA)", premiumTaxPct: 4.85, stampingFeePct: 0.175, filingDeadlineDays: 45, diligentEffortRequired: true, declinationsRequired: 3, affidavitForm: "LA-SL-1", notes: "Stamping fee applies to premium and policy fees alike." },
  MA: { state: "MA", stampingOffice: "Massachusetts Division of Insurance", premiumTaxPct: 4.0, stampingFeePct: 0.0, filingDeadlineDays: 45, diligentEffortRequired: true, declinationsRequired: 3, affidavitForm: "SL-3", notes: "No stamping office fee; broker files directly with the Division." },
  RI: { state: "RI", stampingOffice: "Rhode Island Department of Business Regulation", premiumTaxPct: 4.0, stampingFeePct: 0.0, filingDeadlineDays: 30, diligentEffortRequired: true, declinationsRequired: 3, affidavitForm: "RI-SLB-1", notes: "Affidavit of diligent effort required with each filing." },
  OK: { state: "OK", stampingOffice: "Oklahoma Surplus Lines Division", premiumTaxPct: 6.0, stampingFeePct: 0.0, filingDeadlineDays: 30, diligentEffortRequired: false, declinationsRequired: 0, affidavitForm: null, notes: "Export list business does not require a diligent effort search." },
};

interface ClauseDefinition {
  clauseId: string;
  title: string;
  kind: "iso_standard" | "manuscript";
  amendable: boolean;
  requiredWhen?: "coastal_tier1" | "fema_high_hazard";
}

/** Carrier A's approved clause taxonomy. Anything outside it is not bindable. */
const CARRIER_A_TAXONOMY: ClauseDefinition[] = [
  { clauseId: "CP-0010", title: "Causes of Loss - Special Form", kind: "iso_standard", amendable: false },
  { clauseId: "CP-0090", title: "Commercial Property Conditions", kind: "iso_standard", amendable: false },
  { clauseId: "CP-1030", title: "Causes of Loss - Broad Form", kind: "iso_standard", amendable: false },
  { clauseId: "CP-1218", title: "Windstorm or Hail Percentage Deductible", kind: "iso_standard", amendable: false, requiredWhen: "coastal_tier1" },
  { clauseId: "CP-1420", title: "Additional Covered Property", kind: "iso_standard", amendable: false },
  { clauseId: "ME-004", title: "Coastal Windstorm & Flood Provision", kind: "manuscript", amendable: true, requiredWhen: "coastal_tier1" },
  { clauseId: "ME-011", title: "Protective Safeguards Warranty", kind: "manuscript", amendable: true },
  { clauseId: "ME-017", title: "Named Storm Waiting Period", kind: "manuscript", amendable: true },
  { clauseId: "ME-022", title: "Unendorsed FEMA Zone V and AE Flood Exclusion", kind: "manuscript", amendable: false, requiredWhen: "fema_high_hazard" },
];

interface BordereauRow {
  policyNumber: string;
  submissionId: string;
  insuredName: string;
  effectiveDate: string;
  expiryDate: string;
  locationCount: number;
  treatyClassificationCode: string;
  grossPremium: number;
  netCarrierPremium: number;
  surplusLinesTax: number;
  stampingFee: number;
  statesOfExposure: string[];
  appendedAt: string;
}

const bordereaux = new Map<string, BordereauRow[]>();
const keyFor = (carrierCode: string, period: string) => `${carrierCode.toUpperCase()}|${period}`;

function now() { return new Date().toISOString(); }
const money = (n: number) => Math.round(Number(n || 0) * 100) / 100;

router.get("/filing-requirements", (req: Request, res: Response) => {
  const stateParam = String(req.query.state || "").trim().toUpperCase();
  if (!stateParam) {
    res.json({ states: Object.values(FILING_REQUIREMENTS), retrievedAt: now() });
    return;
  }
  const states = stateParam.split(",").map((s) => s.trim()).filter(Boolean);
  const found = states.map((s) => FILING_REQUIREMENTS[s]).filter(Boolean);
  const unknown = states.filter((s) => !FILING_REQUIREMENTS[s]);
  if (found.length === 0) {
    res.status(404).json({ error: `No filing requirements held for ${states.join(", ")}.`, availableStates: Object.keys(FILING_REQUIREMENTS) });
    return;
  }
  res.json({
    requirements: found,
    unknownStates: unknown,
    retrievedAt: now(),
    guidance: "File in every state where there is exposure, not only the insured's domicile. Deadlines run from the effective date, and a missed stamping filing is a fine against the broker, not the carrier.",
  });
});

router.post("/clause-check", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const carrierCode = String(b.carrierCode || "CARRIER-A").trim().toUpperCase();
  const clauseIds: string[] = Array.isArray(b.clauseIds) ? b.clauseIds.map((c: unknown) => String(c).trim().toUpperCase()) : [];
  const exposure = (b.exposure || {}) as { coastalTier1Tiv?: number; femaHighHazardLocationCount?: number };
  const amendedClauses: string[] = Array.isArray(b.amendedClauses) ? b.amendedClauses.map((c: unknown) => String(c).trim().toUpperCase()) : [];

  if (carrierCode !== "CARRIER-A") {
    res.status(404).json({ error: `No approved clause taxonomy held for carrier "${carrierCode}".`, availableCarriers: ["CARRIER-A"] });
    return;
  }
  if (clauseIds.length === 0) {
    res.status(400).json({ error: "clauseIds are required: name the clauses the endorsement attaches." });
    return;
  }

  const approvedIds = new Set(CARRIER_A_TAXONOMY.map((c) => c.clauseId));
  const unapproved = clauseIds.filter((id) => !approvedIds.has(id));

  const needsCoastal = Number(exposure.coastalTier1Tiv ?? 0) > 0;
  const needsFlood = Number(exposure.femaHighHazardLocationCount ?? 0) > 0;
  const required = CARRIER_A_TAXONOMY.filter((c) =>
    (c.requiredWhen === "coastal_tier1" && needsCoastal) || (c.requiredWhen === "fema_high_hazard" && needsFlood),
  );
  const missingRequired = required.filter((c) => !clauseIds.includes(c.clauseId));

  const illegallyAmended = amendedClauses
    .map((id) => CARRIER_A_TAXONOMY.find((c) => c.clauseId === id))
    .filter((c): c is ClauseDefinition => !!c && !c.amendable);

  const approved = unapproved.length === 0 && missingRequired.length === 0 && illegallyAmended.length === 0;
  res.status(approved ? 200 : 422).json({
    approved,
    carrierCode,
    checkedAt: now(),
    clausesChecked: clauseIds,
    unapprovedClauses: unapproved.map((id) => ({ clauseId: id, reason: "Not in this carrier's approved taxonomy." })),
    missingRequiredClauses: missingRequired.map((c) => ({ clauseId: c.clauseId, title: c.title, requiredBecause: c.requiredWhen })),
    unamendableClausesAmended: illegallyAmended.map((c) => ({ clauseId: c.clauseId, title: c.title, reason: "Standard form; wording may not be amended in a manuscript endorsement." })),
    approvedTaxonomy: CARRIER_A_TAXONOMY.map((c) => ({ clauseId: c.clauseId, title: c.title, kind: c.kind, amendable: c.amendable })),
    guidance: approved
      ? "Wording is within the approved taxonomy. Attach the clause ids to the binding request."
      : "Endorsement wording is not bindable as drafted. Use only approved clause ids, attach every clause the exposure makes mandatory, and leave standard forms unamended.",
  });
});

router.post("/bordereau", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const carrierCode = String(b.carrierCode || "CARRIER-A").trim().toUpperCase();
  const period = String(b.period || "").trim();
  const policyNumber = String(b.policyNumber || "").trim();

  if (!policyNumber) {
    res.status(400).json({ error: "policyNumber is required." });
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    res.status(400).json({ error: `period must be a reporting month formatted YYYY-MM; received "${period}".` });
    return;
  }

  const key = keyFor(carrierCode, period);
  const rows = bordereaux.get(key) || [];
  const duplicate = rows.find((r) => r.policyNumber === policyNumber);
  if (duplicate) {
    res.status(409).json({
      appended: false,
      error: `${policyNumber} is already on the ${carrierCode} bordereau for ${period}.`,
      existingRow: duplicate,
      guidance: "A policy appears once per reporting period. Appending again would double-count the premium and break reconciliation.",
    });
    return;
  }

  const row: BordereauRow = {
    policyNumber,
    submissionId: String(b.submissionId || ""),
    insuredName: String(b.insuredName || ""),
    effectiveDate: String(b.effectiveDate || ""),
    expiryDate: String(b.expiryDate || ""),
    locationCount: Number(b.locationCount ?? 0),
    treatyClassificationCode: String(b.treatyClassificationCode || "CP-E&S-TIER1"),
    grossPremium: money(b.grossPremium),
    netCarrierPremium: money(b.netCarrierPremium),
    surplusLinesTax: money(b.surplusLinesTax),
    stampingFee: money(b.stampingFee),
    statesOfExposure: Array.isArray(b.statesOfExposure) ? b.statesOfExposure.map((s: unknown) => String(s).toUpperCase()) : [],
    appendedAt: now(),
  };
  rows.push(row);
  bordereaux.set(key, rows);

  res.status(201).json({
    appended: true,
    carrierCode,
    period,
    row,
    rowCount: rows.length,
    guidance: "Queued for the carrier's monthly reconciliation. The bordereau is the carrier's view of what was bound on their paper: it must match the ledger exactly.",
  });
});

router.get("/bordereau", (req: Request, res: Response) => {
  const carrierCode = String(req.query.carrierCode || "CARRIER-A").trim().toUpperCase();
  const period = String(req.query.period || "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    res.status(400).json({ error: `period must be formatted YYYY-MM; received "${period}".` });
    return;
  }
  const rows = bordereaux.get(keyFor(carrierCode, period)) || [];
  res.json({
    carrierCode,
    period,
    rowCount: rows.length,
    rows,
    totals: {
      grossPremium: money(rows.reduce((s, r) => s + r.grossPremium, 0)),
      netCarrierPremium: money(rows.reduce((s, r) => s + r.netCarrierPremium, 0)),
      surplusLinesTax: money(rows.reduce((s, r) => s + r.surplusLinesTax, 0)),
      stampingFee: money(rows.reduce((s, r) => s + r.stampingFee, 0)),
      locationCount: rows.reduce((s, r) => s + r.locationCount, 0),
    },
    retrievedAt: now(),
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  bordereaux.clear();
  res.json({ reset: true, bordereaux: 0, resetAt: now() });
});

export default router;
