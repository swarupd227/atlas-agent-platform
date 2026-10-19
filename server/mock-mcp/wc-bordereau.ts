import { Router, type Request, type Response } from "express";
import { FIXTURE_NOTICE, MODE, PROGRAM, TENANT_ID, cents, findSubmissionByInsured, getSubmission, money, now } from "./wc-seed";
import { nextId, quoteStore, ratingStore, reportStore, resetWcState, stateOf } from "./wc-state";

/**
 * Simulated WC premium bordereau queue for the carrier program (fixture mode).
 *
 * A preview can be drawn at any time and is labelled a draft. Only a
 * transaction the PAS has confirmed as bound can enter the reporting queue, and
 * it can enter once. Commission is computed here from the program's agreed rate
 * and the totals are reconciled before anything is queued; "queued" is not
 * "sent", and "sent" is not "acknowledged" -- each is its own status.
 * Corrections are separate versioned records, never an overwrite.
 */
const router = Router();

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

function recordFor(submissionId: string) {
  const s = getSubmission(submissionId);
  const st = stateOf(submissionId);
  if (!s || !st) return { error: `No submission "${submissionId}".` };
  const q = quoteStore.forSubmission(submissionId).at(-1);
  const rating = q ? ratingStore.get(q.ratingId) : ratingStore.forSubmission(submissionId).filter((r) => r.revision === st.revision).at(-1);
  if (!rating) return { error: "No rating to report from." };
  const gross = Number((rating.result as any).totalEstimatedAnnualPremium);
  const commission = money(gross * PROGRAM.commissionPct / 100);
  const net = (cents(gross) - cents(commission)) / 100;
  const byStateClass = st.allocations.reduce((m: Record<string, number>, a) => { const k = `${a.state} ${a.classCode}`; m[k] = (m[k] || 0) + a.payroll; return m; }, {});
  return {
    record: {
      carrierCode: PROGRAM.carrierCode, programId: PROGRAM.programId, insuredId: s.insuredId, insuredName: s.legalName,
      policyNumber: q?.policyNumber ?? null, transactionId: q?.policyNumber ? `TXN-${q.policyNumber}-NB` : null, transactionType: "new_business",
      effectiveDate: s.proposedEffectiveDate, expirationDate: `${Number(s.proposedEffectiveDate.slice(0, 4)) + 1}${s.proposedEffectiveDate.slice(4)}`,
      jurisdictions: s.jurisdictions, payrollByStateAndClass: byStateClass,
      grossPremium: gross, commissionBasis: "gross written premium", commissionRatePct: PROGRAM.commissionPct, commission, netPremium: net,
      currency: PROGRAM.currency, sourceRevision: st.revision, ratingId: rating.ratingId,
    },
    bound: q?.status === "bound",
  };
}

const REQUIRED = ["carrierCode", "programId", "insuredId", "insuredName", "policyNumber", "transactionId", "transactionType", "effectiveDate", "expirationDate", "grossPremium", "commissionRatePct", "commission", "netPremium", "currency", "sourceRevision"];

router.post("/preview", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const r = recordFor(String(b.submissionId || "").trim());
  if ("error" in r) return res.status(404).json(envelope({ error: r.error }));
  res.json(envelope({ status: "draft_preview", bound: r.bound, record: r.record, templateVersion: PROGRAM.bordereauTemplateVersion, note: "Draft preview only. Not queued, not sent. Net premium is gross minus commission; it is not a customer discount, and taxes and fees follow the carrier's specification." }));
});

router.post("/submit", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const ids = (Array.isArray(b.submissionIds) ? b.submissionIds : String(b.submissionIds || b.submissionId || "").split(",")).map((x: unknown) => String(x).trim()).filter(Boolean);
  if (!ids.length) return res.status(422).json(envelope({ error: "submissionIds is required." }));
  const records: Array<Record<string, any>> = [];
  const problems: string[] = [];
  const queued = new Set(reportStore.all().filter((x) => x.status !== "rejected").flatMap((x) => x.records.map((rec) => String(rec.transactionId))));
  for (const id of ids) {
    const r = recordFor(id);
    if ("error" in r) { problems.push(`${id}: ${r.error}`); continue; }
    if (!r.bound) { problems.push(`${id}: not bound in the PAS. Only confirmed bound transactions enter the bordereau.`); continue; }
    const missing = REQUIRED.filter((k) => (r.record as any)[k] === null || (r.record as any)[k] === undefined || (r.record as any)[k] === "");
    if (missing.length) { problems.push(`${id}: missing ${missing.join(", ")}`); continue; }
    if (queued.has(String(r.record.transactionId)) || records.some((x) => x.transactionId === r.record.transactionId)) { problems.push(`${id}: transaction ${r.record.transactionId} is already in the reporting queue`); continue; }
    if (cents(r.record.grossPremium) - cents(r.record.commission) !== cents(r.record.netPremium)) { problems.push(`${id}: commission does not reconcile`); continue; }
    records.push(r.record);
  }
  if (problems.length) return res.status(422).json(envelope({ error: "Nothing was queued.", problems }));
  const totals = {
    grossPremium: records.reduce((n, r) => n + cents(r.grossPremium), 0) / 100,
    commission: records.reduce((n, r) => n + cents(r.commission), 0) / 100,
    netPremium: records.reduce((n, r) => n + cents(r.netPremium), 0) / 100,
  };
  const reportId = String(b.reportId || "").trim() || nextId(`BDX-${PROGRAM.carrierCode}`);
  if (reportStore.get(reportId)) return res.status(409).json(envelope({ error: `Report ${reportId} already exists; corrections are new versioned records.` }));
  reportStore.put({ reportId, status: "queued", records, totals, receiptId: null, history: [{ status: "queued", at: now() }] });
  for (const r of records) { const sub = findSubmissionByInsured(r.insuredId); const st = sub && stateOf(sub.submissionId); if (st) st.status = "reporting_queued"; }
  res.json(envelope({ reportId, status: "queued", recordCount: records.length, totals, templateVersion: PROGRAM.bordereauTemplateVersion, note: "Queued for reporting. Not yet transmitted to the carrier." }));
});

/** Fixture carrier channel: transmits and returns the carrier's acknowledgement. */
router.post("/transmit", (req: Request, res: Response) => {
  const r = reportStore.get((req.body || {}).reportId);
  if (!r) return res.status(404).json(envelope({ error: "No such report." }));
  if (r.status !== "queued") return res.status(409).json(envelope({ error: `Report ${r.reportId} is ${r.status}; only a queued report is transmitted.` }));
  r.status = "sent";
  r.history.push({ status: "sent", at: now() });
  r.status = "acknowledged";
  r.receiptId = `RCPT-${r.reportId}`;
  r.history.push({ status: "acknowledged", at: now(), note: "Fixture carrier channel acknowledged receipt synchronously." });
  res.json(envelope({ reportId: r.reportId, status: r.status, receiptId: r.receiptId, history: r.history }));
});

router.get("/report", (req: Request, res: Response) => {
  const r = reportStore.get(req.query.reportId);
  if (!r) return res.status(404).json(envelope({ error: "No such report.", reports: reportStore.all().map((x) => ({ reportId: x.reportId, status: x.status })) }));
  res.json(envelope({ ...r }));
});

router.post("/reset", (_req, res) => { resetWcState(); res.json({ reset: true, scope: "all five WC fixture systems", resetAt: now(), mode: MODE }); });

export default router;
