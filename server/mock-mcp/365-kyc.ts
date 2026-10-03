/**
 * Mock "365 Retail Salesforce KYC" and "365 Retail Teams" -- the two systems UC09
 * writes to that no demo can reach. Salesforce here is the KYC form object, the
 * review case and the risk status; Teams is the notification channel.
 *
 * It behaves like a system of record rather than a permissive stub:
 *  - reads return tax IDs and bank accounts MASKED (last four only); the design
 *    says they are masked for every model call and compared only in
 *    deterministic steps, so the exact comparison happens HERE, behind
 *    /match-signals, and only its verdict and masked values come back;
 *  - a review case can only be opened for a Medium or High result;
 *  - clearing a High result is an override and is refused without a reason and
 *    evidence;
 *  - there is no endpoint to approve KYC, block an account, change bank details
 *    or activate payments. Those stay human actions, so no agent can reach them
 *    through this connector.
 * Every write, and every refused write, lands in /audit. State is in memory and
 * resets with POST /reset.
 */
import { Router, type Request, type Response } from "express";
import {
  seedKycForms,
  type KycForm, type KycReviewCase, type KycRiskStatus, type KycAuditEvent,
} from "./365-kyc-data";
import { SILVER_CUSTOMERS, CROSSWALK } from "./365-data-lake-data";

const router = Router();
export const teamsRouter = Router();
const now = () => new Date().toISOString();

let FORMS: KycForm[] = seedKycForms();
let CASES: KycReviewCase[] = [];
let STATUSES: KycRiskStatus[] = [];
let AUDIT: KycAuditEvent[] = [];
let MESSAGES: Array<{ messageId: string; channel: string; to: string; text: string; sentAt: string }> = [];
let caseSeq = 1;

export function resetKycWorld(): void {
  FORMS = seedKycForms();
  CASES = [];
  STATUSES = [];
  AUDIT = [];
  MESSAGES = [];
  caseSeq = 1;
}

// ── masking ──────────────────────────────────────────────────────────────────

export const maskTaxId = (v: string | null): string | null => (v ? `***${v.replace(/[^0-9A-Za-z]/g, "").slice(-4)}` : null);
export const maskAccount = (v: string | null): string | null => (v ? `****${v.slice(-4)}` : null);

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
const normAddress = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function publicForm(f: KycForm) {
  return {
    formId: f.formId, requestType: f.requestType, brand: f.brand, customerRecordId: f.customerRecordId,
    legalName: f.legalName, country: f.country, stateOrProvince: f.stateOrProvince,
    billingAddress: f.billingAddress, phone: f.phone,
    taxIdMasked: maskTaxId(f.taxId), bankAccountMasked: maskAccount(f.bankAccount),
    previousBankLast4: f.previousBankLast4, bankChangedDaysAgo: f.bankChangedDaysAgo,
    workflowStatus: f.workflowStatus, deviceCount: f.deviceCount, expectedMonthlyRevenue: f.expectedMonthlyRevenue,
    productCategory: f.productCategory, accountAgeDays: f.accountAgeDays, priorFailedSubmissions: f.priorFailedSubmissions,
    submittedBy: f.submittedBy, notes: f.notes,
    documents: f.documents.map((d) => ({
      docId: d.docId, type: d.type, name: d.name, expiresOn: d.expiresOn,
      // The printed tax ID is masked too; the text is what an outside party wrote.
      extractedText: d.printedTaxId ? d.extractedText.split(d.printedTaxId).join(maskTaxId(d.printedTaxId)!) : d.extractedText,
    })),
  };
}

const masterKeyOf = (recordId: string | null) => (recordId ? CROSSWALK.find((c) => c.recordId === recordId)?.masterKey ?? null : null);

// ── exact-match signals ──────────────────────────────────────────────────────

export interface MatchSignal {
  signal: string;
  detail: string;
  matches: Array<{ kind: "kyc_form" | "customer_record"; id: string; brand: string; masked?: string }>;
}

/** Everything that needs the real values, decided here and reported as verdicts. */
export function matchSignalsFor(form: KycForm): MatchSignal[] {
  const out: MatchSignal[] = [];
  const otherForms = FORMS.filter((f) => f.formId !== form.formId && !(form.customerRecordId && f.customerRecordId === form.customerRecordId));
  const otherRecords = SILVER_CUSTOMERS.filter((r) => r.recordId !== form.customerRecordId);
  const brandOf = (source: string) => (source === "cantaloupe_salesforce" ? "Cantaloupe" : "365");

  if (form.taxId) {
    const m: MatchSignal["matches"] = [];
    for (const f of otherForms) if (f.taxId && f.taxId === form.taxId) m.push({ kind: "kyc_form", id: f.formId, brand: f.brand, masked: maskTaxId(f.taxId)! });
    for (const r of otherRecords) if (r.taxId && r.taxId === form.taxId) m.push({ kind: "customer_record", id: r.recordId, brand: brandOf(r.source), masked: maskTaxId(r.taxId)! });
    if (m.length) out.push({ signal: "tax_id_shared", detail: "The same tax ID is held by another customer record.", matches: m });
  }
  if (form.bankAccount) {
    const m = otherForms.filter((f) => f.bankAccount === form.bankAccount).map((f) => ({ kind: "kyc_form" as const, id: f.formId, brand: f.brand, masked: maskAccount(f.bankAccount)! }));
    if (m.length) out.push({ signal: "bank_account_shared", detail: "The same bank account is on another customer's KYC form.", matches: m });
  }
  if (form.billingAddress) {
    const a = normAddress(form.billingAddress);
    const m: MatchSignal["matches"] = [];
    for (const f of otherForms) if (f.billingAddress && normAddress(f.billingAddress) === a) m.push({ kind: "kyc_form", id: f.formId, brand: f.brand });
    for (const r of otherRecords) if (normAddress(r.billingAddress) === a) m.push({ kind: "customer_record", id: r.recordId, brand: brandOf(r.source) });
    if (m.length) out.push({ signal: "address_shared", detail: "The same billing address is held by another customer record.", matches: m });
  }
  if (form.phone) {
    const p = digits(form.phone);
    const m: MatchSignal["matches"] = [];
    for (const f of otherForms) if (digits(f.phone) === p) m.push({ kind: "kyc_form", id: f.formId, brand: f.brand });
    for (const r of otherRecords) if (digits(r.phone) === p) m.push({ kind: "customer_record", id: r.recordId, brand: brandOf(r.source) });
    if (m.length) out.push({ signal: "phone_shared", detail: "The same phone number is held by another customer record.", matches: m });
  }
  const key = masterKeyOf(form.customerRecordId);
  if (key) {
    const m = CROSSWALK.filter((c) => c.masterKey === key && c.recordId !== form.customerRecordId)
      .map((c) => ({ kind: "customer_record" as const, id: c.recordId, brand: brandOf(c.source) }));
    if (m.length) out.push({ signal: "same_master_key_other_brand", detail: `UC02 has keyed this customer together with another record (${key}).`, matches: m });
  }
  if (form.bankChangedDaysAgo !== null && form.bankChangedDaysAgo <= 30) {
    out.push({ signal: "recent_bank_change", detail: `The bank account changed ${form.bankChangedDaysAgo} day(s) ago (previously ending ${form.previousBankLast4}).`, matches: [] });
  }
  if (form.accountAgeDays <= 90 && form.expectedMonthlyRevenue > 0) {
    const perThousand = Math.round((form.deviceCount / (form.expectedMonthlyRevenue / 1000)) * 10) / 10;
    if (perThousand >= 3) out.push({ signal: "many_devices_new_account", detail: `${form.deviceCount} devices on a ${form.accountAgeDays}-day-old account with $${form.expectedMonthlyRevenue} expected monthly revenue (${perThousand} devices per $1,000).`, matches: [] });
  }
  if (form.priorFailedSubmissions >= 2) {
    out.push({ signal: "repeated_failures", detail: `${form.priorFailedSubmissions} earlier submissions for this customer failed.`, matches: [] });
  }
  for (const d of form.documents) {
    if (d.printedTaxId && form.taxId && d.printedTaxId !== form.taxId) {
      out.push({ signal: "document_value_mismatch", detail: `${d.name} prints a tax ID ending ${maskTaxId(d.printedTaxId)!.slice(-4)} but the form says ending ${maskTaxId(form.taxId)!.slice(-4)}.`, matches: [] });
    }
    if (d.expiresOn && d.expiresOn < now().slice(0, 10)) {
      out.push({ signal: "document_expired", detail: `${d.name} expired on ${d.expiresOn}.`, matches: [] });
    }
  }
  return out;
}

// ── reads ────────────────────────────────────────────────────────────────────

router.get("/kyc-forms", (req: Request, res: Response) => {
  const { status, brand, request_type } = req.query as Record<string, string | undefined>;
  const rows = FORMS.filter((f) => (!status || f.workflowStatus === status) && (!brand || f.brand === brand) && (!request_type || f.requestType === request_type))
    .map((f) => ({ formId: f.formId, requestType: f.requestType, brand: f.brand, legalName: f.legalName, workflowStatus: f.workflowStatus, customerRecordId: f.customerRecordId }));
  res.json({ count: rows.length, rows });
});

router.get("/kyc-form", (req: Request, res: Response) => {
  const f = FORMS.find((x) => x.formId === String(req.query.form_id || ""));
  if (!f) { res.status(404).json({ error: `No KYC form matches "${req.query.form_id ?? ""}".` }); return; }
  res.json({ ...publicForm(f), retrievedAt: now() });
});

router.get("/match-signals", (req: Request, res: Response) => {
  const f = FORMS.find((x) => x.formId === String(req.query.form_id || ""));
  if (!f) { res.status(404).json({ error: `No KYC form matches "${req.query.form_id ?? ""}".` }); return; }
  const signals = matchSignalsFor(f);
  res.json({
    formId: f.formId,
    masterKey: masterKeyOf(f.customerRecordId),
    signalCount: signals.length,
    signals,
    note: "Exact comparisons were made on the real values inside this system; only verdicts and masked values are returned.",
  });
});

router.get("/documents-expiring", (req: Request, res: Response) => {
  const within = Math.min(Math.max(Number(req.query.within_days) || 30, 1), 365);
  const today = now().slice(0, 10);
  const horizon = new Date(); horizon.setUTCDate(horizon.getUTCDate() + within);
  const limit = horizon.toISOString().slice(0, 10);
  const rows = FORMS.flatMap((f) => f.documents
    .filter((d) => d.expiresOn && d.expiresOn >= today && d.expiresOn <= limit)
    .map((d) => ({
      formId: f.formId, account: f.legalName, customerRecordId: f.customerRecordId, brand: f.brand,
      docId: d.docId, document: d.name, expiresOn: d.expiresOn,
      daysLeft: Math.round((new Date(d.expiresOn as string).getTime() - new Date(today).getTime()) / 86_400_000),
      owner: f.submittedBy,
    })))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  res.json({ withinDays: within, count: rows.length, rows });
});

router.get("/audit", (_req: Request, res: Response) => {
  res.json({ events: AUDIT, reviewCases: CASES, riskStatuses: STATUSES });
});

// ── writes: a review case and a risk status, nothing else ───────────────────

router.post("/review-case", (req: Request, res: Response) => {
  const { formId, riskResult, reasons, evidence, suggestedNextStep, createdBy } = req.body ?? {};
  const refuse = (code: number, msg: string) => {
    AUDIT.push({ at: now(), action: "write_refused", formId: String(formId ?? ""), by: String(createdBy ?? "unknown"), detail: msg });
    res.status(code).json({ error: msg });
  };
  if (!formId || !riskResult || !Array.isArray(reasons) || !reasons.length || !suggestedNextStep) {
    return refuse(400, "formId, riskResult, a non-empty reasons list and suggestedNextStep are required.");
  }
  const form = FORMS.find((f) => f.formId === formId);
  if (!form) return refuse(404, `No KYC form matches "${formId}".`);
  if (riskResult !== "Medium" && riskResult !== "High") return refuse(409, `A review case is only opened for a Medium or High result; this one is ${riskResult}. Low-risk records proceed without one.`);
  const existing = CASES.find((c) => c.formId === formId);
  if (existing) { res.json({ created: false, alreadyOpen: true, case: existing }); return; }
  const c: KycReviewCase = {
    caseId: `CASE-${String(caseSeq++).padStart(4, "0")}`, formId: String(formId), riskResult,
    reasons: reasons.map(String), evidence: Array.isArray(evidence) ? evidence.map(String) : [],
    suggestedNextStep: String(suggestedNextStep), createdAt: now(), createdBy: String(createdBy ?? "Risk Explainer"),
    assignedQueue: riskResult === "High" ? "Compliance" : "Payment operations",
  };
  CASES.push(c);
  AUDIT.push({ at: c.createdAt, action: "review_case_created", formId: c.formId, by: c.createdBy, detail: `${c.caseId} opened as ${riskResult} for ${c.assignedQueue}.` });
  res.json({ created: true, case: c });
});

router.post("/risk-status", (req: Request, res: Response) => {
  const { formId, riskResult, status, decidedBy, overrideReason, overrideEvidence } = req.body ?? {};
  const refuse = (code: number, msg: string) => {
    AUDIT.push({ at: now(), action: "write_refused", formId: String(formId ?? ""), by: String(decidedBy ?? "unknown"), detail: msg });
    res.status(code).json({ error: msg });
  };
  const STATUS = ["Proceed", "Held for review", "Cleared by reviewer", "Held by reviewer"];
  if (!formId || !riskResult || !status || !decidedBy) return refuse(400, "formId, riskResult, status and decidedBy are required.");
  if (!["Low", "Medium", "High"].includes(riskResult)) return refuse(400, `riskResult must be Low, Medium or High, not ${riskResult}.`);
  if (!STATUS.includes(status)) return refuse(400, `status must be one of: ${STATUS.join(", ")}. KYC approval, blocking and payment activation are not written here; they stay with people.`);
  if (!FORMS.some((f) => f.formId === formId)) return refuse(404, `No KYC form matches "${formId}".`);
  if (status === "Proceed" && riskResult !== "Low") return refuse(409, `A ${riskResult} result cannot proceed without a reviewer; use "Held for review".`);
  const isOverride = status === "Cleared by reviewer" && riskResult === "High";
  if (isOverride && (!overrideReason || !overrideEvidence)) return refuse(409, "Clearing a High result is an override and needs both an overrideReason and overrideEvidence.");
  const row: KycRiskStatus = {
    formId: String(formId), riskResult, status, decidedBy: String(decidedBy),
    overrideReason: isOverride ? String(overrideReason) : null, overrideEvidence: isOverride ? String(overrideEvidence) : null, writtenAt: now(),
  };
  STATUSES = STATUSES.filter((s) => s.formId !== row.formId);
  STATUSES.push(row);
  AUDIT.push({ at: row.writtenAt, action: "risk_status_written", formId: row.formId, by: row.decidedBy, detail: `${riskResult} → ${status}${isOverride ? " (override)" : ""}.` });
  res.json({ written: true, status: row });
});

router.post("/reset", (_req: Request, res: Response) => {
  resetKycWorld();
  res.json({ reset: true, resetAt: now(), forms: FORMS.length });
});

// ── Teams: send a message, read what was sent ───────────────────────────────

teamsRouter.post("/message", (req: Request, res: Response) => {
  const { channel, to, text } = req.body ?? {};
  if (!channel || !to || !text) { res.status(400).json({ error: "channel, to and text are required." }); return; }
  const m = { messageId: `MSG-${String(MESSAGES.length + 1).padStart(4, "0")}`, channel: String(channel), to: String(to), text: String(text), sentAt: now() };
  MESSAGES.push(m);
  res.json({ sent: true, message: m });
});

teamsRouter.get("/messages", (_req: Request, res: Response) => {
  res.json({ count: MESSAGES.length, messages: MESSAGES });
});

teamsRouter.post("/reset", (_req: Request, res: Response) => {
  MESSAGES = [];
  res.json({ reset: true });
});

export default router;
