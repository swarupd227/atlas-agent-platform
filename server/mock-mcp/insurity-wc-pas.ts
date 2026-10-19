import { Router, type Request, type Response } from "express";
import { FIXTURE_NOTICE, MODE, TENANT_ID, getSubmission, now } from "./wc-seed";
import {
  hashOf, nextId, operationStore, quotePreconditions, quoteStore, ratingStore, resetWcState, stateOf, type Operation,
} from "./wc-state";

/**
 * Simulated WC policy administration system (fixture mode): quote write-back,
 * document attachment and binding.
 *
 * Every command carries an idempotency key and lands in an operation ledger.
 * The same key with the same request returns the original operation -- a
 * retried or duplicated event makes ONE quote, never two. The same key with a
 * different request is refused, because that is a caller bug, not a retry.
 *
 * Bound means the PAS says bound: a policy number and a binder reference come
 * back only from a successful bind. A quote, an accepted request or a document
 * produced locally is not binding. A fixture fault can simulate a timeout after
 * the remote side committed, so reconciliation through get_operation_status can
 * be exercised without creating a duplicate.
 */
const router = Router();

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

/** Replay or refuse when the idempotency key has been seen; undefined when it is new. */
function replay(kind: Operation["kind"], key: string, requestHash: string, res: Response): boolean {
  const prior = operationStore.byKey(kind, key);
  if (!prior) return false;
  if (prior.requestHash !== requestHash) {
    res.status(409).json(envelope({ error: `Idempotency key "${key}" was already used for a different ${kind} request.`, operationId: prior.operationId, guidance: "Use a new key for a new request. Reusing a key for a changed request is not a retry." }));
    return true;
  }
  res.json(envelope({ duplicate: true, operationId: prior.operationId, status: prior.status, externalRef: prior.externalRef, ...prior.response, note: "Same idempotency key and request: this is the original operation, not a new one." }));
  return true;
}

router.post("/quote/upsert", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const s = getSubmission(b.submissionId);
  const st = stateOf(b.submissionId);
  if (!s || !st) return res.status(404).json(envelope({ error: `No submission "${String(b.submissionId ?? "")}".` }));
  const key = String(b.idempotencyKey || "").trim();
  if (!key) return res.status(422).json(envelope({ error: "idempotencyKey is required.", guidance: "A non-idempotent write without a key cannot be safely retried." }));
  const request = { submissionId: s.submissionId, revision: Number(b.revision), ratingId: String(b.ratingId || "") };
  const requestHash = hashOf(request);
  if (replay("upsert_quote", key, requestHash, res)) return;
  if (request.revision !== st.revision) return res.status(409).json(envelope({ error: `Stale snapshot: revision ${b.revision ?? "(none)"} against current revision ${st.revision}.` }));
  const pre = quotePreconditions(st, request.ratingId);
  if (!pre.ok) return res.status(422).json(envelope({ error: "Quote write-back preconditions are not met; nothing was written.", gaps: pre.gaps }));
  const rating = pre.rating!;
  const existing = quoteStore.forSubmission(s.submissionId).find((q) => q.status === "quoted");
  const externalQuoteRef = existing?.externalQuoteRef ?? `Q-WC-${s.submissionId.slice(-4)}-${String(quoteStore.forSubmission(s.submissionId).length + 1).padStart(2, "0")}`;
  const premium = Number((rating.result as any).totalEstimatedAnnualPremium);
  quoteStore.put({ externalQuoteRef, submissionId: s.submissionId, revision: st.revision, ratingId: rating.ratingId, premium, status: "quoted", attachments: existing?.attachments ?? [], policyNumber: null, binderRef: null, boundAt: null, boundBy: null });
  st.status = "quote_confirmed";
  const response = { externalQuoteRef, submissionId: s.submissionId, revision: st.revision, ratingId: rating.ratingId, premium, processingStatus: "quoted", note: "Quote persisted. A quote is not a bound policy." };
  const faulted = String(b.fixtureFault || "") === "timeout_after_commit";
  const op: Operation = { operationId: nextId("OP"), kind: "upsert_quote", idempotencyKey: key, requestHash, status: faulted ? "pending_confirmation" : "completed", externalRef: externalQuoteRef, response, createdAt: now(), confirmedAt: faulted ? null : now() };
  operationStore.put(op);
  if (faulted) {
    return res.status(504).json(envelope({ operationId: op.operationId, status: "pending_confirmation", error: "Fixture fault: the PAS did not answer in time. The outcome is unknown to the caller.", guidance: "Do not resend a new request. Reconcile with get_operation_status, or retry with the SAME idempotency key." }));
  }
  res.json(envelope({ operationId: op.operationId, status: op.status, ...response }));
});

router.post("/quote/attach-document", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const q = quoteStore.get(b.externalQuoteRef);
  if (!q) return res.status(404).json(envelope({ error: `No quote "${String(b.externalQuoteRef ?? "")}".` }));
  const documentRef = String(b.documentRef || "").trim();
  const contentHash = String(b.contentHash || "").trim();
  if (!documentRef || !contentHash) return res.status(422).json(envelope({ error: "documentRef and contentHash are both required." }));
  const key = String(b.idempotencyKey || `${q.externalQuoteRef}:${documentRef}:${contentHash}`);
  const requestHash = hashOf({ externalQuoteRef: q.externalQuoteRef, documentRef, contentHash });
  if (replay("attach_document", key, requestHash, res)) return;
  const attachmentRef = nextId("ATT");
  q.attachments.push({ attachmentRef, documentRef, contentHash, at: now() });
  const response = { externalQuoteRef: q.externalQuoteRef, attachmentRef, documentRef, contentHash, attachmentCount: q.attachments.length };
  const op: Operation = { operationId: nextId("OP"), kind: "attach_document", idempotencyKey: key, requestHash, status: "completed", externalRef: q.externalQuoteRef, response, createdAt: now(), confirmedAt: now() };
  operationStore.put(op);
  res.json(envelope({ operationId: op.operationId, status: "completed", ...response }));
});

router.post("/bind/request", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const q = quoteStore.get(b.externalQuoteRef);
  if (!q) return res.status(404).json(envelope({ error: `No quote "${String(b.externalQuoteRef ?? "")}".` }));
  const key = String(b.idempotencyKey || "").trim();
  if (!key) return res.status(422).json(envelope({ error: "idempotencyKey is required." }));
  const requestedBy = String(b.requestedBy || "").trim();
  const approvalRefs = String(Array.isArray(b.approvalRefs) ? b.approvalRefs.join(",") : (b.approvalRefs || "")).split(",").map((x) => x.trim()).filter(Boolean);
  const requestHash = hashOf({ externalQuoteRef: q.externalQuoteRef, approvalRefs });
  if (replay("request_bind", key, requestHash, res)) return;
  if (!requestedBy || !approvalRefs.length) return res.status(422).json(envelope({ error: "A bind needs an explicit, authorised request: requestedBy and approvalRefs.", guidance: "Binding is a separate decision from quoting. Name the approval that authorised it." }));
  if (/agent|bot|assistant|copilot|orchestrator/i.test(requestedBy)) return res.status(403).json(envelope({ error: `"${requestedBy}" cannot request a bind.` }));
  if (q.status === "bound") return res.json(envelope({ status: "bound", externalQuoteRef: q.externalQuoteRef, policyNumber: q.policyNumber, binderRef: q.binderRef, note: "Already bound." }));
  const s = getSubmission(q.submissionId)!;
  const st = stateOf(q.submissionId)!;
  const gaps: string[] = [];
  if (q.revision !== st.revision) gaps.push(`The quote was written at revision ${q.revision}; the submission is now at ${st.revision}. Re-quote first.`);
  const pre = quotePreconditions(st, q.ratingId);
  gaps.push(...pre.gaps);
  for (const x of st.subjectivities.filter((y) => y.dueStage === "pre_bind" && y.status === "open")) gaps.push(`Pre-bind subjectivity ${x.id} is open: ${x.requirement}`);
  if (gaps.length) {
    // Recorded for the audit trail, but NOT under the caller's key: nothing was
    // done, so the same key stays usable once the gaps are closed.
    const opId = nextId("OP");
    const op: Operation = { operationId: opId, kind: "request_bind", idempotencyKey: `${key}|rejected|${opId}`, requestHash, status: "rejected", externalRef: q.externalQuoteRef, response: { status: "rejected", gaps }, createdAt: now(), confirmedAt: now() };
    operationStore.put(op);
    st.status = "bind_pending";
    return res.status(422).json(envelope({ operationId: op.operationId, status: "rejected", externalQuoteRef: q.externalQuoteRef, gaps, note: "Not bound. Every gap above must be resolved, or waived where the carrier plan allows it, before a bind request can succeed." }));
  }
  q.status = "bound";
  q.policyNumber = s.proposedPolicyId;
  q.binderRef = `BND-${s.submissionId.slice(-4)}-${q.externalQuoteRef.slice(-2)}`;
  q.boundAt = now();
  q.boundBy = requestedBy;
  st.status = "bound";
  const response = { status: "bound", externalQuoteRef: q.externalQuoteRef, policyNumber: q.policyNumber, binderRef: q.binderRef, boundAt: q.boundAt, premium: q.premium, effectiveDate: s.proposedEffectiveDate };
  const op: Operation = { operationId: nextId("OP"), kind: "request_bind", idempotencyKey: key, requestHash, status: "completed", externalRef: q.externalQuoteRef, response, createdAt: now(), confirmedAt: now() };
  operationStore.put(op);
  res.json(envelope({ operationId: op.operationId, ...response, note: "Bound: confirmed by the PAS with a policy number and binder reference." }));
});

/** Reconcile an outcome the caller did not see: the PAS's own record of the operation. */
router.get("/operation-status", (req: Request, res: Response) => {
  const id = String(req.query.operationId || "").trim();
  const ref = String(req.query.externalRef || "").trim();
  const ops = id ? [operationStore.get(id)].filter(Boolean) as Operation[] : ref ? operationStore.byExternalRef(ref) : [];
  if (!ops.length) return res.status(404).json(envelope({ error: "No operation matched.", guidance: "Pass the operationId returned (or reported in a timeout), or the external quote reference." }));
  // A fixture timeout committed on the PAS side; reading it back confirms it.
  for (const o of ops) if (o.status === "pending_confirmation") { o.status = "completed"; o.confirmedAt = now(); }
  res.json(envelope({ operations: ops.map((o) => ({ operationId: o.operationId, kind: o.kind, status: o.status, externalRef: o.externalRef, idempotencyKey: o.idempotencyKey, requestHash: o.requestHash, createdAt: o.createdAt, confirmedAt: o.confirmedAt, response: o.response })) }));
});

router.get("/quote", (req: Request, res: Response) => {
  const q = quoteStore.get(req.query.externalQuoteRef) ?? quoteStore.byPolicy(req.query.policyNumber);
  if (!q) return res.status(404).json(envelope({ error: "No quote or policy matched." }));
  res.json(envelope({ ...q, rating: ratingStore.get(q.ratingId)?.result ?? null }));
});

router.post("/reset", (_req, res) => { resetWcState(); res.json({ reset: true, scope: "all five WC fixture systems", resetAt: now(), mode: MODE }); });

export default router;
