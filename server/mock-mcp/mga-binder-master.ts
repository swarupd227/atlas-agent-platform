import { Router, type Request, type Response } from "express";
import {
  BINDER_TERMS, CLOSE_TOLERANCES, PERIODS, isPeriod, now, money,
  coastalTier1For, openingCoastalTier1, gwpFor, risksFor, PERIOD_ORDER, type PeriodId,
} from "./mga-close-seed";

/**
 * Simulated delegated-authority register: the binder itself, its reporting
 * periods, and the treaty-year aggregates a period rolls into.
 *
 * This is the system that says what the MGA is allowed to do and by when. A
 * close begins by reading it -- commission rate, tax basis, template version,
 * reporting deadline -- and ends by locking the period against further
 * posting. Both halves matter: a period that can still be posted to after it
 * was reported is how a carrier's bordereau and an MGA's ledger drift apart.
 *
 * The aggregates are a roll-forward, not a snapshot. Each period's opening IS
 * everything written before it, so utilisation and projected exhaustion are
 * arithmetic over the book rather than numbers someone typed.
 */
const router = Router();

/** Periods closed in this process. A close is refused twice. */
const closed = new Map<PeriodId, { closedAt: string; closedBy: string; submissionReference: string | null }>();
/** Packs submitted to the carrier portal. */
const submissions = new Map<PeriodId, { reference: string; submittedAt: string; documentCount: number; netDueToCarrier: number }>();

const badPeriod = (res: Response, got: unknown) =>
  res.status(422).json({
    error: `Unknown reporting period "${String(got)}".`,
    availablePeriods: Object.keys(PERIODS),
    guidance: "A close runs against a period this binder actually has. Do not invent one.",
  });

router.get("/binder", (_req: Request, res: Response) => {
  res.json({
    ...BINDER_TERMS,
    tolerances: CLOSE_TOLERANCES,
    periods: Object.values(PERIODS).map((p) => ({
      periodId: p.periodId, label: p.label, riskCount: p.riskCount,
      status: closed.has(p.periodId) ? "closed" : "open",
    })),
    retrievedAt: now(),
    guidance:
      "These are the terms the close is judged against: the commission rate the net-due figure uses, the tolerances that decide whether a variance is investigated, and the deadline the filing batch is measured against. Read them once at the start and carry the identifiers, not the whole record.",
  });
});

router.get("/period", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const spec = PERIODS[periodId];
  const closeRow = closed.get(periodId);
  const end = new Date(`${periodId}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const deadline = new Date(end);
  deadline.setUTCDate(deadline.getUTCDate() + BINDER_TERMS.reportingDeadlineDays);
  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    label: spec.label,
    status: closeRow ? "closed" : "open",
    transactionCount: spec.riskCount,
    periodEnd: end.toISOString().slice(0, 10),
    reportingDeadline: deadline.toISOString().slice(0, 10),
    bordereauTemplateVersion: BINDER_TERMS.bordereauTemplateVersion,
    binderCommissionPct: BINDER_TERMS.binderCommissionPct,
    ...(closeRow ? { closedAt: closeRow.closedAt, closedBy: closeRow.closedBy, submissionReference: closeRow.submissionReference } : {}),
    retrievedAt: now(),
    guidance:
      "Locking the transaction scope is what makes the rest of the close reproducible: every later step reports on the transactions this period held when it was opened, not on whatever the policy system holds now.",
  });
});

/**
 * The treaty-year position after this period, with the headroom and the date
 * the run rate exhausts it. Arithmetic over the book: no model needed, and
 * none should be used -- a capacity decision made on an invented number is
 * the worst outcome this workflow has.
 */
router.get("/treaty-aggregates", (req: Request, res: Response) => {
  const periodId = String(req.query.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const opening = openingCoastalTier1(periodId);
  const written = coastalTier1For(periodId);
  const closing = opening + written;
  const cap = BINDER_TERMS.coastalTier1TreatyYearCap;
  const utilisationPct = Math.round((closing / cap) * 1000) / 10;
  const headroom = cap - closing;

  // Run rate from the periods actually written this treaty year, not a guess.
  const order = PERIOD_ORDER;
  const upto = order.slice(0, order.indexOf(periodId) + 1);
  const recent = upto.slice(-3);
  const runRate = money(recent.reduce((a, p) => a + coastalTier1For(p), 0) / recent.length);
  const monthsRemaining = runRate > 0 ? headroom / runRate : null;
  let projectedExhaustion: string | null = null;
  if (monthsRemaining !== null && monthsRemaining >= 0 && monthsRemaining < 24) {
    const d = new Date(`${periodId}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1 + Math.floor(monthsRemaining));
    d.setUTCDate(Math.min(28, Math.max(1, Math.round((monthsRemaining % 1) * 30))));
    projectedExhaustion = d.toISOString().slice(0, 10);
  }

  res.json({
    binderId: BINDER_TERMS.binderId,
    periodId,
    peril: "Named windstorm, Tier 1 coastal",
    openingAggregateTiv: opening,
    writtenInPeriodTiv: written,
    closingAggregateTiv: closing,
    treatyYearCap: cap,
    utilisationPct,
    headroomTiv: headroom,
    warningThresholdPct: BINDER_TERMS.capacityWarningPct,
    aboveWarningThreshold: utilisationPct > BINDER_TERMS.capacityWarningPct,
    monthlyRunRateTiv: runRate,
    projectedExhaustion,
    retrievedAt: now(),
    guidance:
      "Utilisation is the closing aggregate over the treaty-year cap. Above the warning threshold this is a decision for the capacity manager -- restrict appetite, buy facultative, or request an increase -- and not a reason to stop the close.",
  });
});

/** The carrier's delegated-authority portal: where the pack is lodged. */
router.post("/submit-to-carrier", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const periodId = String(b.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  const documentCount = Number(b.documentCount ?? 0);
  const netDueToCarrier = Number(b.netDueToCarrier);
  const financeSignOffBy = String(b.financeSignOffBy || "").trim();

  if (!financeSignOffBy) {
    return res.status(422).json({
      error: "The pack cannot be lodged without finance sign-off.",
      guidance: "The net-due-to-carrier figure is what the settlement is made on; a person signs it before it leaves the building.",
    });
  }
  if (!Number.isFinite(netDueToCarrier)) {
    return res.status(422).json({ error: "netDueToCarrier is required and must be a number." });
  }
  if (documentCount < 1) {
    return res.status(422).json({ error: "The pack has no documents.", guidance: "Assemble the bordereaux, cash statement and breach log before submitting." });
  }
  if (submissions.has(periodId)) {
    const prior = submissions.get(periodId)!;
    return res.status(409).json({
      error: `Period ${periodId} was already submitted as ${prior.reference} on ${prior.submittedAt}.`,
      guidance: "A period is lodged once. A correction is a resubmission the carrier asks for, not a second first submission.",
    });
  }
  const reference = `DDM-${periodId.replace("-", "")}-${BINDER_TERMS.binderId.slice(-2)}`;
  const row = { reference, submittedAt: now(), documentCount, netDueToCarrier: money(netDueToCarrier) };
  submissions.set(periodId, row);
  res.json({
    submitted: true, ...row, binderId: BINDER_TERMS.binderId, carrierCode: BINDER_TERMS.carrierCode,
    guidance: "Record this reference against the period. It is the MGA's evidence that the binder was reported on time.",
  });
});

/** Close and lock. The period stops accepting postings. */
router.post("/close-period", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const periodId = String(b.periodId || "").trim();
  if (!isPeriod(periodId)) return badPeriod(res, periodId);
  if (closed.has(periodId)) {
    return res.status(409).json({ error: `Period ${periodId} is already closed.`, ...closed.get(periodId) });
  }
  const sub = submissions.get(periodId);
  if (!sub) {
    return res.status(422).json({
      error: `Period ${periodId} has not been submitted to the carrier.`,
      guidance: "Closing a period the carrier has not received is how a binder goes unreported. Submit the pack first.",
    });
  }
  const closedBy = String(b.closedBy || "").trim();
  if (!closedBy) return res.status(422).json({ error: "closedBy is required: a person closes a period." });
  const row = { closedAt: now(), closedBy, submissionReference: sub.reference };
  closed.set(periodId, row);
  const order = PERIOD_ORDER;
  const nextPeriod = order[order.indexOf(periodId) + 1] ?? null;
  res.json({
    closed: true, periodId, ...row, nextPeriodOpened: nextPeriod,
    guidance: "The period is locked against further posting. Anything found afterwards is a prior-period adjustment in the next close, never a quiet edit to this one.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  closed.clear();
  submissions.clear();
  res.json({ reset: true, closedPeriods: 0, submissions: 0, resetAt: now() });
});

export default router;
