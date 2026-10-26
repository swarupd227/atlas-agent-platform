import { Router, type Response } from "express";
import { AS_OF, FIXTURE_NOTICE, MODE, TENANT_ID, accountById, accountValue, now, security } from "./wm-seed";
import { REQUIRED_DOCUMENTS, onboardingCaseById } from "./wm-onboarding-seed";
import { caseOf, humanActor, logWm, nextWmId, resetWmState } from "./wm-state";
import { caseDocuments } from "./wm-onboarding";

/**
 * Simulated custodian (fixture mode) for Harborview Wealth Partners: positions
 * and cash as the custodian holds them, account opening and asset transfers.
 *
 * Rules it enforces rather than trusts:
 *  - An account opens only when the onboarding case has every required
 *    document complete, identity verified for every trustee, every party
 *    screened and dispositioned, a compliance decision where a PEP or an
 *    escalated hit is involved, and the advisor's confirmed profile.
 *  - A transfer whose receiving title does not match the delivering firm's
 *    account title is rejected, as a real ACAT would be.
 */
const router = Router();
const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });
const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json(envelope({ error, ...extra }));
const normTitle = (t: string) => t.toLowerCase().replace(/\bdtd\b.*$/, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

router.get("/positions", (req, res) => {
  const a = accountById(req.query.accountId);
  if (!a) return fail(res, 404, `No account "${String(req.query.accountId ?? "")}".`);
  res.json(envelope({ accountId: a.accountId, asOf: AS_OF, positions: a.lots.map((l) => ({ symbol: l.symbol, quantity: l.quantity, price: security(l.symbol)!.price })), cash: a.cash, value: accountValue(a) }));
});

router.get("/statement", (req, res) => {
  const a = accountById(req.query.accountId);
  if (!a) return fail(res, 404, `No account "${String(req.query.accountId ?? "")}".`);
  res.json(envelope({ accountId: a.accountId, registration: a.registration, periodEnd: "2026-09-30", value: accountValue(a), custodian: a.custodian }));
});

export function openingGaps(caseId: string): string[] {
  const c = onboardingCaseById(caseId)!, st = caseOf(caseId)!;
  const gaps: string[] = [];
  const docs = caseDocuments(c, st);
  for (const r of REQUIRED_DOCUMENTS[c.registration] ?? []) {
    const d = docs.find((x) => x.type === r.type);
    if (!d) gaps.push(`Missing ${r.type}: ${r.rule}.`);
    else if (d.pagesReceived.length < d.totalPagesStated) gaps.push(`${d.documentId} has ${d.pagesReceived.length} of ${d.totalPagesStated} pages.`);
  }
  for (const p of c.parties.filter((x) => x.role !== "beneficiary")) {
    if (st.cip[p.partyId]?.result !== "verified") gaps.push(`Identity not verified for ${p.name}.`);
    if (!st.screenings[p.partyId]) gaps.push(`${p.name} has not been screened and dispositioned.`);
  }
  const needsCompliance = c.parties.some((p) => p.truth.pep) || Object.values(st.screenings).some((s) => s.disposition === "escalated");
  if (needsCompliance && st.amlDisposition?.outcome !== "approved_with_edd") gaps.push("Enhanced due diligence is required (PEP or escalated hit) and compliance has not approved.");
  if (!st.suitability.confirmed) gaps.push("The advisor has not confirmed the suitability profile.");
  return gaps;
}

router.post("/accounts/open", (req, res) => {
  const who = humanActor(req.body ?? {}, ["operations", "advisor"]); if (!who.ok) return fail(res, who.status, who.error);
  const caseId = String(req.body?.caseId ?? "").trim().toUpperCase();
  const c = onboardingCaseById(caseId), st = caseOf(caseId);
  if (!c || !st) return fail(res, 404, `No onboarding case "${caseId}".`);
  if (st.accountsOpened.length) return res.json(envelope({ caseId, accountId: st.accountsOpened[0], note: "Already open." }));
  const gaps = openingGaps(caseId);
  if (gaps.length) return fail(res, 422, "Account not opened.", { gaps });
  const accountId = "ACCT-5001";
  st.accountsOpened.push(accountId); st.stage = "funding";
  logWm(who.actorId, "account_opened", `${caseId} -> ${accountId} (${c.legalTitle})`);
  res.json(envelope({ caseId, accountId, title: c.legalTitle, registration: c.registration, modelId: st.suitability.confirmed!.modelId, openedBy: who.actorId }));
});

router.post("/transfers/initiate", (req, res) => {
  const who = humanActor(req.body ?? {}, ["operations", "client_service_associate"]); if (!who.ok) return fail(res, who.status, who.error);
  const caseId = String(req.body?.caseId ?? "").trim().toUpperCase();
  const c = onboardingCaseById(caseId), st = caseOf(caseId);
  if (!c || !st) return fail(res, 404, `No onboarding case "${caseId}".`);
  if (!st.accountsOpened.length) return fail(res, 409, "Open the receiving account before initiating a transfer.");
  const title = String(req.body?.receivingTitle ?? c.legalTitle);
  const match = normTitle(title) === normTitle(c.transfer.contraTitle);
  const t = { transferId: nextWmId("XFR"), accountId: st.accountsOpened[0], method: c.transfer.method, contraFirm: c.transfer.contraFirm, titleSubmitted: title, status: match ? "pending" as const : "rejected" as const, rejectReason: match ? null : `TITLE_MISMATCH: receiving title "${title}" does not match the delivering account title "${c.transfer.contraTitle}" at ${c.transfer.contraFirm}.`, history: [{ at: now(), status: match ? "pending" : "rejected", note: match ? "Accepted by the contra firm" : "Rejected by the contra firm" }] };
  st.transfers.push(t);
  logWm(who.actorId, "transfer_initiated", `${caseId} ${t.transferId}: ${t.status}`);
  res.json(envelope({ caseId, transfer: t }));
});

router.get("/transfers/status", (req, res) => {
  const caseId = String(req.query.caseId ?? "").trim().toUpperCase();
  const st = caseOf(caseId);
  if (!st) return fail(res, 404, `No onboarding case "${caseId}".`);
  res.json(envelope({ caseId, transfers: st.transfers }));
});

router.post("/transfers/resubmit", (req, res) => {
  const who = humanActor(req.body ?? {}, ["operations", "client_service_associate"]); if (!who.ok) return fail(res, who.status, who.error);
  const caseId = String(req.body?.caseId ?? "").trim().toUpperCase();
  const c = onboardingCaseById(caseId), st = caseOf(caseId);
  if (!c || !st) return fail(res, 404, `No onboarding case "${caseId}".`);
  const t = st.transfers.find((x) => x.transferId === String(req.body?.transferId ?? "").trim().toUpperCase());
  if (!t) return fail(res, 404, `No transfer "${req.body?.transferId}".`);
  const correction = String(req.body?.correction ?? "").trim();
  if (!["letter_of_authorization", "match_contra_title"].includes(correction)) return fail(res, 422, "correction must be letter_of_authorization (trustees authorise delivery to the differently titled account) or match_contra_title.");
  t.status = "completed"; t.rejectReason = null;
  t.history.push({ at: now(), status: "completed", note: `Resubmitted with ${correction}; assets delivered in kind.` });
  st.stage = "welcome";
  logWm(who.actorId, "transfer_resubmitted", `${caseId} ${t.transferId}: ${correction}`);
  res.json(envelope({ caseId, transfer: t }));
});

router.post("/reset", (_req, res) => { resetWmState(); res.json({ reset: true, scope: "all six Harborview Wealth Partners fixture systems", resetAt: now(), mode: MODE }); });

export default router;
