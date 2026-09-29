import { Router, type Request, type Response } from "express";
import {
  BINDER_TERMS, PERIODS, isPeriod, now, money, sum, risksFor, gwpFor, type PeriodId,
} from "./mga-close-seed";

/**
 * Simulated premium ledger and general ledger: what was invoiced, what cash
 * arrived, and what was posted.
 *
 * This is the second and third legs of the three-way match. Both derive from
 * the same book as the policy system, so they agree to the cent EXCEPT where a
 * period seeds a break -- March, where an endorsement's additional premium was
 * booked against binder CP-2026-14 instead of CP-2026-17. That break is the
 * only disagreement in the whole book, which is what makes it findable: a
 * reconciliation demo over randomly different data proves nothing.
 *
 * A posted adjusting journal is remembered, so re-running the reconciliation
 * after the correction closes the variance. That is Loop B, and it only means
 * anything if the second pass really does come back clean.
 */
const router = Router();

/** Adjusting journals posted in this process, by period. */
const adjustments = new Map<PeriodId, Array<{ journalId: string; amount: number; account: string; postedAt: string; approvedBy: string; reason: string }>>();

const badPeriod = (res: Response, got: unknown) =>
  res.status(422).json({ error: `Unknown reporting period "${String(got)}".`, availablePeriods: Object.keys(PERIODS) });

function adjustedTotal(periodId: PeriodId) {
  return sum((adjustments.get(periodId) ?? []).map((a) => a.amount));
}

/** What billing invoiced for the period, and what cash it has collected. */
router.get("/premium-ledger", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const rows = risksFor(periodId);
  const policyGwp = gwpFor(periodId);
  const brk = PERIODS[periodId].billingBreak;

  // Billing agrees with the policy system except for the seeded break, which
  // is premium this binder was charged but that belongs to another one.
  const invoiced = money(policyGwp + (brk ? brk.amount : 0) - adjustedTotal(periodId));
  const commission = money(invoiced * (BINDER_TERMS.binderCommissionPct / 100));
  const cashReceived = money(invoiced * 0.94);

  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    invoicedPremium: invoiced,
    binderCommissionPct: BINDER_TERMS.binderCommissionPct,
    binderCommission: commission,
    netDueToCarrier: money(invoiced - commission),
    cashReceived,
    cashOutstanding: money(invoiced - cashReceived),
    invoiceCount: rows.length,
    retrievedAt: now(),
    guidance:
      "This is the billing leg of the three-way match. Compare it against the policy system's gross written premium and the general ledger; do not adjust it to agree. A difference is a finding, and a finding has a cause.",
  });
});

/** What the general ledger holds, which is the third leg. */
router.get("/general-ledger", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const policyGwp = gwpFor(periodId);
  const brk = PERIODS[periodId].billingBreak;
  const posted = money(policyGwp + (brk ? brk.amount : 0) - adjustedTotal(periodId));
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    accounts: [
      { account: "1200 Premium Receivable", debit: posted, credit: 0 },
      { account: "4000 Written Premium", debit: 0, credit: money(posted - posted * (BINDER_TERMS.binderCommissionPct / 100)) },
      { account: "6100 Binder Commission", debit: money(posted * (BINDER_TERMS.binderCommissionPct / 100)), credit: 0 },
    ],
    postedPremium: posted,
    adjustingJournals: adjustments.get(periodId) ?? [],
    balanced: true,
    retrievedAt: now(),
    guidance: "The ledger is the carrier's view of what the MGA owes. Where it disagrees with billing, the correcting entry belongs here and needs approval before it is posted.",
  });
});

/**
 * The three-way match itself, computed here so every leg reports its own
 * total and the comparison is arithmetic rather than a model's reading.
 */
router.get("/reconciliation", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const policyGwp = gwpFor(periodId);
  const brk = PERIODS[periodId].billingBreak;
  const billing = money(policyGwp + (brk ? brk.amount : 0) - adjustedTotal(periodId));
  const ledger = billing;
  const variance = money(billing - policyGwp);
  const variancePctOfGwp = policyGwp !== 0 ? Math.round((Math.abs(variance) / Math.abs(policyGwp)) * 10000) / 100 : 0;

  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    legs: {
      policyAdministration: policyGwp,
      billing,
      generalLedger: ledger,
    },
    variance,
    variancePctOfGwp,
    withinTolerance: Math.abs(variance) <= 1000 && variancePctOfGwp <= 0.10,
    adjustingJournalsApplied: (adjustments.get(periodId) ?? []).length,
    // Named only once a variance exists, and only as a candidate: the system
    // knows what it posted, not why somebody posted it there.
    ...(brk && Math.abs(variance) > 0
      ? { candidateCause: { description: brk.reason, amount: brk.amount, appearsAgainstBinder: brk.misbookedToBinder, correctBinder: BINDER_TERMS.binderId } }
      : {}),
    retrievedAt: now(),
    guidance:
      "Variance is billing minus policy administration. Within tolerance the close continues; outside it, investigate before adjusting. Post the correcting entry and call this again -- the second pass is what proves the correction worked.",
  });
});

/** Post an approved adjusting journal. Approval is not optional. */
router.post("/post-adjusting-journal", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const periodId = String(b.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const amount = Number(b.amount);
  const account = String(b.account || "").trim();
  const approvedBy = String(b.approvedBy || "").trim();
  const reason = String(b.reason || "").trim();

  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(422).json({ error: "amount is required and must be a non-zero number." });
  }
  if (!account) return res.status(422).json({ error: "account is required: a journal names the GL account it hits." });
  if (!approvedBy) {
    return res.status(422).json({
      error: "An adjusting journal needs a named approver.",
      guidance: "Premium accounting approves the specific lines -- amount, binder, account, period -- before anything is posted. A journal nobody approved is how a reconciliation is made to agree with itself.",
    });
  }
  const journalId = `ADJ-${periodId.replace("-", "")}-${String((adjustments.get(periodId)?.length ?? 0) + 1).padStart(2, "0")}`;
  const row = { journalId, amount: money(amount), account, postedAt: now(), approvedBy, reason: reason || "Reclassification" };
  adjustments.set(periodId, [...(adjustments.get(periodId) ?? []), row]);
  res.json({
    posted: true, ...row, binderId: BINDER_TERMS.binderId, periodId,
    guidance: "Re-run the reconciliation now. A correction that was not re-tested is a correction nobody has checked.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  adjustments.clear();
  res.json({ reset: true, adjustingJournals: 0, resetAt: now() });
});

export default router;
