import { Router, type Request, type Response } from "express";
import {
  BINDER_TERMS, PERIODS, isPeriod, now, money, sum, risksFor, gwpFor, type PeriodId,
} from "./mga-close-seed";

/**
 * Simulated policy administration: every transaction bound under the binder in
 * a reporting period.
 *
 * This is the system of record for what was written. The close reads it, maps
 * it onto the carrier's template, and reconciles it against billing. It
 * returns transactions with their real defects intact -- a negative building
 * value, an absent construction class -- because the point of the validator
 * downstream is to catch them. A source that quietly cleaned its own data
 * would make the whole workflow a formality.
 *
 * Rows are paginated. The period aggregates come back on the summary so a step
 * can reconcile totals without pulling fifty rows through the pipeline, the
 * same rule the deal journey follows for its location schedule.
 */
const router = Router();

const badPeriod = (res: Response, got: unknown) =>
  res.status(422).json({
    error: `Unknown reporting period "${String(got)}".`,
    availablePeriods: Object.keys(PERIODS),
  });

/** Aggregates first: what the period holds, without the rows. */
router.get("/period-summary", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const rows = risksFor(periodId);
  const byType = { new_business: 0, endorsement: 0, cancellation: 0 } as Record<string, number>;
  const byState: Record<string, { count: number; grossPremium: number; totalInsuredValue: number }> = {};
  for (const r of rows) {
    byType[r.transactionType]++;
    byState[r.homeState] = byState[r.homeState] || { count: 0, grossPremium: 0, totalInsuredValue: 0 };
    byState[r.homeState].count++;
    byState[r.homeState].grossPremium = money(byState[r.homeState].grossPremium + r.grossPremium);
    byState[r.homeState].totalInsuredValue += Math.max(0, r.totalInsuredValue);
  }
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    label: PERIODS[periodId].label,
    transactionCount: rows.length,
    transactionsByType: byType,
    grossWrittenPremium: gwpFor(periodId),
    totalInsuredValue: sum(rows.map((r) => Math.max(0, r.totalInsuredValue))),
    coastalTier1Tiv: sum(rows.map((r) => r.coastalTier1Tiv)),
    byState,
    retrievedAt: now(),
    guidance:
      "Reconcile against grossWrittenPremium rather than re-adding the rows: this figure is what the policy system says it wrote, and a three-way match is only meaningful if each leg reports its own total. Pull rows only where a step needs row detail, such as assembling the bordereau or naming a failing record.",
  });
});

/** The rows themselves, paginated, defects and all. */
router.get("/transactions", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const all = risksFor(periodId);
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 25) || 25));
  const type = String(req.query.transactionType || "").trim();
  const filtered = type ? all.filter((r) => r.transactionType === type) : all;
  const page = filtered.slice(offset, offset + limit);
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    totalMatching: filtered.length,
    offset,
    limit,
    returned: page.length,
    transactions: page.map((r) => ({
      policyNumber: r.policyNumber,
      submissionId: r.submissionId,
      insuredName: r.insuredName,
      transactionType: r.transactionType,
      effectiveDate: r.effectiveDate,
      expiryDate: r.expiryDate,
      homeState: r.homeState,
      isoConstructionClass: r.isoConstructionClass,
      buildingValue: r.buildingValue,
      contentsValue: r.contentsValue,
      totalInsuredValue: r.totalInsuredValue,
      largestLocationTiv: r.largestLocationTiv,
      coastalTier1Tiv: r.coastalTier1Tiv,
      windstormDeductiblePct: r.windstormDeductiblePct,
      grossPremium: r.grossPremium,
    })),
    retrievedAt: now(),
    guidance:
      "These rows are returned exactly as the policy system holds them, including values a real extract would carry through unaltered. Validate them; do not assume they are clean, and never repair one silently -- a corrected row needs an owner and a reason.",
  });
});

/**
 * The binding authority evidence for one risk, which the post-bind sweep needs
 * to tell a breach from a breach somebody already approved.
 */
router.get("/authority-evidence", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  const policyNumber = String(req.query.policyNumber || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const row = risksFor(periodId).find((r) => r.policyNumber === policyNumber);
  if (!row) {
    return res.status(404).json({ error: `No policy ${policyNumber} in period ${periodId}.` });
  }
  const seeded = PERIODS[periodId].breaches ?? [];
  const idx = risksFor(periodId).findIndex((r) => r.policyNumber === policyNumber);
  const referral = seeded.find((b) => b.policyIndex === idx && b.priorReferral);
  res.json({
    policyNumber,
    periodId,
    boundAt: `${row.effectiveDate}T09:12:00Z`,
    boundBy: "admin",
    largestLocationTiv: row.largestLocationTiv,
    coastalTier1Tiv: row.coastalTier1Tiv,
    windstormDeductiblePct: row.windstormDeductiblePct,
    homeState: row.homeState,
    // A referral the carrier granted BEFORE the risk was bound ratifies what
    // would otherwise be a breach. A sweep that does not check this reports
    // false positives, and a compliance team that gets false positives stops
    // reading the report.
    priorCarrierReferral: referral
      ? { reference: referral.priorReferral, grantedAt: "2026-02-14", grantedBy: BINDER_TERMS.carrierName, scope: "Named storm deductible below the treaty minimum for this risk only" }
      : null,
    retrievedAt: now(),
    guidance:
      "Check priorCarrierReferral before classifying a breach. A risk the carrier already approved is ratified, not notifiable, and reporting it as a breach damages the MGA's standing for no reason.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  res.json({ reset: true, periods: Object.keys(PERIODS).length, resetAt: now() });
});

export default router;
