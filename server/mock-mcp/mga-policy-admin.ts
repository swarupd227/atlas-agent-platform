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

/**
 * Corrections recorded in this process, by period and policy number.
 *
 * A correction is remembered so that re-pulling the transactions returns the
 * corrected rows: that re-read is the only thing that proves the correction
 * landed, and a loop whose exit condition cannot change is not a loop. The
 * same rule as the adjusting journal on the billing side.
 */
interface Correction {
  policyNumber: string;
  fields: Record<string, number | string | null>;
  correctedBy: string;
  reason: string;
  correctedAt: string;
}
const corrections = new Map<PeriodId, Map<string, Correction>>();

/** The period's rows with any recorded correction applied. */
function correctedRisksFor(periodId: PeriodId) {
  const byPolicy = corrections.get(periodId);
  const rows = risksFor(periodId);
  if (!byPolicy?.size) return rows;
  return rows.map((r) => {
    const c = byPolicy.get(r.policyNumber);
    if (!c) return r;
    const next = { ...r, ...c.fields } as typeof r;
    // A corrected building value changes what the risk is worth, not what was
    // charged for it. Re-rating a bound policy is a different process with its
    // own authority, so grossPremium is deliberately left alone -- and leaving
    // it alone is also what keeps the three-way match honest.
    if (Object.prototype.hasOwnProperty.call(c.fields, "buildingValue")) {
      next.totalInsuredValue = money(Number(next.buildingValue) + Number(next.contentsValue));
    }
    return next;
  });
}

const CORRECTABLE = new Set(["buildingValue", "contentsValue", "isoConstructionClass", "windstormDeductiblePct"]);

const badPeriod = (res: Response, got: unknown) =>
  res.status(422).json({
    error: `Unknown reporting period "${String(got)}".`,
    availablePeriods: Object.keys(PERIODS),
  });

/** Aggregates first: what the period holds, without the rows. */
router.get("/period-summary", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const rows = correctedRisksFor(periodId);
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
  const all = correctedRisksFor(periodId);
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  // 100, not 50: a reporting period here runs to 63 transactions, and a close
  // that validated the first 50 of them would report clean on a page it never
  // read. Paging still works; the cap is just above a period's real size.
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25) || 25));
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
    correctionsApplied: (corrections.get(periodId)?.size ?? 0),
    retrievedAt: now(),
    guidance:
      "These rows are returned exactly as the policy system holds them, including values a real extract would carry through unaltered, plus any correction already recorded against this period. Validate them; do not assume they are clean, and never repair one silently -- a corrected row needs an owner and a reason.",
  });
});

/**
 * Record corrections against a period's transactions. Ownership is not optional.
 *
 * The mirror of the billing side's adjusting journal: a named person, a stated
 * reason, the before and after values kept, and the correction visible to the
 * next read. Without that last part a data-quality loop can never clear, which
 * would make the whole review a formality.
 *
 * A BATCH, because that is what operations actually submits. One row per call
 * looked reasonable until a real close was run against it: a period with ten bad
 * rows and a loop bounded at two rounds could never come clean, so the close
 * carried its defects all the way to the carrier. A correction route that can
 * only ever fix one row is a route that cannot do its job.
 *
 * The single-row form ({ policyNumber, fields }) still works; it is the same
 * call with one entry.
 */
router.post("/correct-transaction", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const periodId = String(b.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const correctedBy = String(b.correctedBy || "").trim();
  const reason = String(b.reason || "").trim();

  const asObject = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v)) ? v as Record<string, any> : null;
  const batch: Array<{ policyNumber: string; fields: Record<string, any> | null }> = Array.isArray(b.corrections)
    ? b.corrections.map((c: any) => ({ policyNumber: String(c?.policyNumber || "").trim(), fields: asObject(c?.fields) }))
    : [{ policyNumber: String(b.policyNumber || "").trim(), fields: asObject(b.fields) }];

  if (!correctedBy) {
    return res.status(422).json({
      error: "A correction needs a named person.",
      guidance: "Operations owns the corrected value. A row that changed with nobody's name against it is indistinguishable from data the extract got wrong in the first place.",
    });
  }
  if (!reason) {
    return res.status(422).json({
      error: "A correction needs a reason.",
      guidance: "The carrier can ask why a bordereau row differs from the original extract, and the answer has to be on the record rather than in somebody's memory.",
    });
  }
  if (!batch.length || batch.every((c) => !c.policyNumber)) {
    return res.status(422).json({
      error: "Name the rows being corrected.",
      guidance: "Send corrections: [{ policyNumber, fields }, ...] -- one entry per failing row, which is what the data-quality check already listed.",
      correctableFields: [...CORRECTABLE],
    });
  }

  // Validate the whole batch before writing any of it: a half-applied
  // correction set is worse than a refused one, because the re-read then looks
  // partly clean and nobody knows which half is owned.
  const rows = risksFor(periodId);
  const problems: Array<{ policyNumber: string; error: string }> = [];
  for (const c of batch) {
    if (!c.policyNumber) { problems.push({ policyNumber: "(missing)", error: "policyNumber is required" }); continue; }
    if (!rows.some((r) => r.policyNumber === c.policyNumber)) { problems.push({ policyNumber: c.policyNumber, error: `no such policy in ${periodId}` }); continue; }
    if (!c.fields || !Object.keys(c.fields).length) { problems.push({ policyNumber: c.policyNumber, error: "fields is required: name the values being corrected" }); continue; }
    const unknown = Object.keys(c.fields).filter((k) => !CORRECTABLE.has(k));
    if (unknown.length) problems.push({ policyNumber: c.policyNumber, error: `not correctable through this route: ${unknown.join(", ")}` });
  }
  if (problems.length) {
    return res.status(422).json({
      error: `${problems.length} of ${batch.length} correction${batch.length === 1 ? "" : "s"} cannot be applied; none were.`,
      problems,
      correctableFields: [...CORRECTABLE],
      guidance: "Premium, policy number and dates are not data-entry fields -- changing one is an endorsement or a rerate, with its own authority, not a bordereau correction. Nothing was written: fix the batch and send it again.",
    });
  }

  const forPeriod = corrections.get(periodId) ?? new Map<string, Correction>();
  const applied = batch.map((c) => {
    const row = rows.find((r) => r.policyNumber === c.policyNumber)!;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(c.fields!)) before[k] = (row as any)[k];
    const entry: Correction = { policyNumber: c.policyNumber, fields: c.fields!, correctedBy, reason, correctedAt: now() };
    forPeriod.set(c.policyNumber, entry);
    return { policyNumber: c.policyNumber, before, after: c.fields };
  });
  corrections.set(periodId, forPeriod);

  res.json({
    corrected: true,
    periodId,
    correctionCount: applied.length,
    corrections: applied,
    correctedBy,
    reason,
    correctedAt: now(),
    correctionsInPeriod: forPeriod.size,
    guidance: "Re-pull the period's transactions now. A correction that was not re-read is a correction nobody has checked.",
  });
});

/** Every correction recorded against a period, for the close pack's audit trail. */
router.get("/corrections", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    corrections: [...(corrections.get(periodId)?.values() ?? [])],
    retrievedAt: now(),
    guidance: "This is what the close pack shows the carrier when a bordereau row differs from the original extract: who changed it, to what, and why.",
  });
});

/**
 * The binding authority evidence for the risks a sweep flagged, which is what
 * tells a breach from a breach somebody already approved.
 *
 * Takes as many policies as the sweep found, because a sweep finds as many as
 * it finds. Reading only the first was live on 2026-09-29: March flags two
 * risks and the SECOND is the one the carrier had already approved, so the
 * ratified breach was written up as notifiable -- the exact false positive the
 * referral check exists to prevent.
 */
router.get("/authority-evidence", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const asked = [
    ...String(req.query.policyNumbers || "").split(","),
    String(req.query.policyNumber || ""),
  ].map((s) => s.trim()).filter(Boolean);
  const wanted = [...new Set(asked)];
  if (!wanted.length) {
    return res.status(422).json({
      error: "Name the policies to check.",
      guidance: "Pass policyNumbers as a comma-separated list -- every risk the authority sweep flagged, not just the first. A risk that is not checked is a risk reported as a breach when the carrier may already have approved it.",
    });
  }

  const rows = correctedRisksFor(periodId);
  const seedOrder = risksFor(periodId);
  const seeded = PERIODS[periodId].breaches ?? [];
  const evidence: Array<Record<string, unknown>> = [];
  const notFound: string[] = [];
  for (const policyNumber of wanted) {
    const row = rows.find((r) => r.policyNumber === policyNumber);
    if (!row) { notFound.push(policyNumber); continue; }
    const idx = seedOrder.findIndex((r) => r.policyNumber === policyNumber);
    const referral = seeded.find((b) => b.policyIndex === idx && b.priorReferral);
    evidence.push({
      policyNumber,
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
    });
  }
  if (!evidence.length) {
    return res.status(404).json({ error: `None of those policies are in period ${periodId}.`, notFound });
  }

  res.json({
    periodId,
    requested: wanted,
    evidence,
    // The two lists the classification actually turns on, so no step has to
    // re-derive them from the rows.
    ratifiedPolicyNumbers: evidence.filter((e) => e.priorCarrierReferral).map((e) => e.policyNumber),
    withoutReferral: evidence.filter((e) => !e.priorCarrierReferral).map((e) => e.policyNumber),
    ...(notFound.length ? { notFound } : {}),
    retrievedAt: now(),
    guidance:
      "Check priorCarrierReferral for EVERY flagged risk before classifying any of them. A risk the carrier already approved is ratified, not notifiable, and reporting it as a breach damages the MGA's standing for no reason. Checking only the first flagged risk is how a ratified breach gets reported as one.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  corrections.clear();
  res.json({ reset: true, periods: Object.keys(PERIODS).length, corrections: 0, resetAt: now() });
});

export default router;
