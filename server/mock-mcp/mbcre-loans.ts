import { Router, type Response } from "express";
import {
  BANKS, FACILITIES, FIXTURE_NOTICE, MODE, POLICIES, REVIEW_DATE, TENANT_ID,
  citationExists, documentById, documentIdsFor, facilityById, now, publicFacility, RENT_ROLLS, type BankId, type Facility,
} from "./mbcre-seed";
import { creBook, list, logCre, nextCreId, resetCreState, reviewOf, type ReviewState } from "./mbcre-state";

/**
 * Simulated Mutual Bancorp commercial loan system (fixture mode): every CRE
 * facility of Cape Cod 5, Fidelity Bank and Bluestone Bank, each owned by one
 * bank, and the system of record for the annual review -- the document
 * request, spreads, covenant tests, stress results, proposed and final
 * ratings, the review memo, the concentration rollup, early warnings and the
 * relationship manager's actions.
 *
 * Rules it enforces rather than trusts:
 *  - Borrower-level detail (borrower, guarantor, property name, RM) is shown
 *    only to the owning bank. The holding company and the sister banks see
 *    de-identified facility data; the data-sharing rule that would allow more
 *    is not approved.
 *  - A spread line copies a source cell: its value must equal the cell it
 *    cites, unless it is marked as an adjustment with a reason.
 *  - A proposed or final grade must exist on the owning bank's own scale.
 *    Only a credit officer OF THE OWNING BANK sets the final rating.
 *  - A memo figure is traced only if every source it cites exists and, for a
 *    loan-system field, matches it.
 */
const router = Router();
const VIEWERS = new Set(["CC5", "FID", "BLU", "HOLDCO"]);
const WARNING_TYPES = new Set(["dscr_decline", "tenant_expiry", "maturity", "rate_reset", "covenant_breach", "stale_appraisal"]);

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

function viewer(v: unknown, res: Response): string | null {
  const id = String(v ?? "").trim().toUpperCase();
  if (!VIEWERS.has(id)) { res.status(422).json(envelope({ error: "viewerBankId is required: CC5, FID, BLU or HOLDCO (the holding company's shared services view)." })); return null; }
  return id;
}

function facilityOr404(id: unknown, res: Response): Facility | null {
  const f = facilityById(id);
  if (!f) { res.status(404).json(envelope({ error: `No facility "${String(id ?? "")}".` })); return null; }
  return f;
}

function reviewOr409(f: Facility, res: Response): ReviewState | null {
  const r = reviewOf(f.facilityId);
  if (!r) { res.status(409).json(envelope({ error: `${f.facilityId} is not due for annual review.`, dueForReview: FACILITIES.filter((x) => x.dueForReview).map((x) => x.facilityId) })); return null; }
  return r;
}

function person(b: Record<string, any>, res: Response, roles: string[]): { actorId: string; actorRole: string; approvalId: string } | null {
  const actorId = String(b.actorId || b.decidedBy || "").trim();
  const actorRole = String(b.actorRole || "").trim();
  const approvalId = String(b.approvalId || "").trim();
  if (!actorId || !actorRole || !approvalId) { res.status(422).json(envelope({ error: "A decision needs actorId, actorRole and approvalId -- the identity and approval recorded by the approval step." })); return null; }
  if (/agent|bot|assistant|copilot|orchestrator|automation/i.test(actorRole) || !roles.includes(actorRole)) {
    res.status(403).json(envelope({ error: `Role "${actorRole}" cannot make this decision.`, allowedRoles: roles, guidance: "Agents prepare the review; credit officers keep the rating and relationship managers act with the borrower." }));
    return null;
  }
  return { actorId, actorRole, approvalId };
}

/** Resolve one memo/spread source: a document cell, a loan-system field, or a policy field. */
function sourceValue(raw: string, f: Facility): { ok: boolean; value?: number } {
  const s = raw.trim();
  if (citationExists(s)) {
    const m = s.toUpperCase().match(/^([A-Z0-9-]+)!([LR]\d{2})(?:@(.+))?$/)!;
    const d = documentById(m[1]);
    if (d) {
      if (d.facilityId !== f.facilityId) return { ok: false };
      const line = d.lines.find((l) => l.ref === m[2])!;
      const periods = Object.keys(line.values);
      const period = m[3] ? periods.find((p) => p.toUpperCase() === m[3].trim()) : periods.length === 1 ? periods[0] : undefined;
      return { ok: true, value: period ? line.values[period] : undefined };
    }
    const rr = RENT_ROLLS[m[1]];
    if (rr.facilityId !== f.facilityId) return { ok: false };
    return { ok: true, value: rr.rows.find((r) => r.ref === m[2])!.annualBaseRent };
  }
  const ls = s.match(/^LS:([A-Z0-9-]+)\.([a-zA-Z.]+)$/);
  if (ls && ls[1].toUpperCase() === f.facilityId) {
    const v = ls[2].split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), f as any);
    return typeof v === "number" ? { ok: true, value: v } : { ok: false };
  }
  const pol = s.match(/^POL:(CC5|FID|BLU)\.([a-zA-Z.]+)$/);
  if (pol && pol[1] === f.bankId) {
    const v = pol[2].split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), POLICIES[pol[1] as BankId] as any);
    return typeof v === "number" ? { ok: true, value: v } : { ok: false };
  }
  return { ok: false };
}

const received = (r: ReviewState, ref: string) => r.documentsReceived.includes(ref.split("!")[0].trim().toUpperCase());

// ── Book ─────────────────────────────────────────────────────────────────────

router.get("/facilities", (req, res) => {
  const v = viewer(req.query.viewerBankId, res); if (!v) return;
  const bank = String(req.query.bankId ?? "").trim().toUpperCase();
  const rows = FACILITIES.filter((f) => !bank || f.bankId === bank).map((f) => publicFacility(f, v === f.bankId));
  res.json(envelope({ viewerBankId: v, count: rows.length, facilities: rows, dataSharing: v === "HOLDCO" ? "Holding-company view: facility data without borrower identity. Borrower-level sharing across banks is not approved." : undefined }));
});

router.get("/facility", (req, res) => {
  const v = viewer(req.query.viewerBankId, res); if (!v) return;
  const f = facilityOr404(req.query.facilityId, res); if (!f) return;
  if (String(req.query.includeBorrower ?? "") === "true" && v !== f.bankId) {
    return res.status(403).json(envelope({ error: `Borrower-level detail of a ${BANKS[f.bankId].name} facility is not shared with ${v === "HOLDCO" ? "the holding company" : BANKS[v as BankId].name}.`, rule: "Borrower data from one bank is shown to another only where the holding company's data-sharing rules allow it; that rule is not approved." }));
  }
  res.json(envelope({ viewerBankId: v, facility: publicFacility(f, v === f.bankId), review: reviewOf(f.facilityId) ? { status: reviewOf(f.facilityId)!.status } : null }));
});

router.get("/bank-profile", (req, res) => {
  const b = BANKS[String(req.query.bankId ?? "").trim().toUpperCase() as BankId];
  if (!b) return res.status(404).json(envelope({ error: "bankId must be CC5, FID or BLU." }));
  res.json(envelope({ bank: b, asOf: REVIEW_DATE }));
});

router.get("/review", (req, res) => {
  const f = facilityOr404(req.query.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  res.json(envelope({ facilityId: f.facilityId, owningBank: BANKS[f.bankId].name, review: r }));
});

// ── Annual review ────────────────────────────────────────────────────────────

router.post("/document-request/draft", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const items = list(req.body?.items);
  if (!items.length || !String(req.body?.message ?? "").trim()) return res.status(422).json(envelope({ error: "items (the documents requested) and message (the request the RM will send) are required." }));
  const draftId = nextCreId("DRQ");
  r.requestDrafts.push({ draftId, at: now(), items, message: String(req.body.message), draftedBy: String(req.body?.draftedBy ?? "agent") });
  logCre("agent", "document_request_drafted", `${f.facilityId} ${draftId}: ${items.length} item(s)`);
  res.json(envelope({ facilityId: f.facilityId, draftId, status: "draft", note: "Drafted for the relationship manager to send. Nothing has been sent to the borrower." }));
});

router.post("/document-request/send", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const who = person(req.body ?? {}, res, ["relationship_manager"]); if (!who) return;
  const requestId = nextCreId("SRQ");
  r.requestSent = { requestId, at: now(), sentBy: who.actorId, approvalId: who.approvalId, draftId: r.requestDrafts.at(-1)?.draftId ?? null };
  // Fixture mode: the borrower's package arrives as soon as the request goes out.
  const docs = documentIdsFor(f.facilityId);
  r.documentsReceived = docs;
  r.status = "documents_received";
  logCre(who.actorId, "document_request_sent", `${f.facilityId} ${requestId}; ${docs.length} document(s) received`);
  res.json(envelope({ facilityId: f.facilityId, requestId, sentBy: who.actorId, documentsReceived: docs, note: "Fixture mode: the borrower's statements and rent roll arrived in the financials repository at once." }));
});

router.post("/spread", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  if (!r.documentsReceived.length) return res.status(409).json(envelope({ error: "No borrower documents received yet: the relationship manager has not sent the request." }));
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const problems: string[] = [];
  for (const l of lines) {
    const ref = String(l?.sourceRef ?? "");
    if (!l?.line || !Number.isFinite(Number(l?.value))) { problems.push(`Line ${JSON.stringify(l).slice(0, 80)} needs line, value and sourceRef.`); continue; }
    if (!citationExists(ref) || !received(r, ref)) { problems.push(`${l.line}: "${ref}" is not a cell of a document received for ${f.facilityId}. Cite <documentId>!<line>@<period>.`); continue; }
    const src = sourceValue(ref, f);
    if (!src.ok) { problems.push(`${l.line}: "${ref}" belongs to another facility.`); continue; }
    if (src.value !== undefined && Math.abs(src.value - Number(l.value)) > 0.5 && !String(l?.adjustment ?? "").trim()) problems.push(`${l.line}: value ${l.value} does not match ${ref} (${src.value}). Copy the cell, or mark the line as an adjustment with the reason.`);
  }
  if (!lines.length) problems.push("lines is required.");
  if (problems.length) return res.status(422).json(envelope({ error: "Spread not recorded.", problems }));
  const spreadId = nextCreId("SPR");
  r.spreads.push({ spreadId, at: now(), period: String(req.body?.period ?? ""), lines: lines.map((l: any) => ({ line: String(l.line), value: Number(l.value), sourceRef: String(l.sourceRef), ...(l.adjustment ? { adjustment: String(l.adjustment) } : {}) })), ratios: req.body?.ratios ?? {}, spreadBy: String(req.body?.spreadBy ?? "agent") });
  r.status = "spread";
  logCre("agent", "spread_recorded", `${f.facilityId} ${spreadId}: ${lines.length} line(s)`);
  res.json(envelope({ facilityId: f.facilityId, spreadId, lines: lines.length, ratiosAsRecorded: req.body?.ratios ?? {} }));
});

router.post("/covenant-tests", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  const problems = results.filter((x: any) => !f.covenants.some((c) => c.covenantId === x?.covenantId) || !["pass", "breach"].includes(x?.result) || !Number.isFinite(Number(x?.value)))
    .map((x: any) => `Covenant result ${JSON.stringify(x).slice(0, 100)} needs a covenantId of this facility, a numeric value and result pass or breach.`);
  const missing = f.covenants.filter((c) => !results.some((x: any) => x?.covenantId === c.covenantId)).map((c) => c.covenantId);
  if (missing.length) problems.push(`Untested covenants: ${missing.join(", ")}.`);
  if (problems.length) return res.status(422).json(envelope({ error: "Covenant tests not recorded.", problems }));
  const testId = nextCreId("CVT");
  const breaches = results.filter((x: any) => x.result === "breach").map((x: any) => x.covenantId);
  r.covenantTests.push({ testId, at: now(), results: results.map((x: any) => ({ covenantId: x.covenantId, value: Number(x.value), threshold: f.covenants.find((c) => c.covenantId === x.covenantId)!.threshold, result: x.result, evidenceRefs: list(x.evidenceRefs) })), breachesRoutedToHuman: breaches });
  logCre("agent", "covenants_tested", `${f.facilityId} ${testId}: ${breaches.length} breach(es)`);
  res.json(envelope({ facilityId: f.facilityId, testId, breaches, note: breaches.length ? "Breaches go to the credit officer; the agent does not waive or cure them." : undefined }));
});

router.post("/stress-results", (req, res) => {
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  if (!results.length) return res.status(422).json(envelope({ error: "results is required." }));
  const unknown = results.filter((x: any) => !facilityById(x?.facilityId)).map((x: any) => x?.facilityId);
  if (unknown.length) return res.status(422).json(envelope({ error: `Unknown facilities: ${unknown.slice(0, 5).join(", ")}.` }));
  const resultId = nextCreId("STR");
  for (const x of results) { const r = reviewOf(x.facilityId); if (r) r.stressResults.push({ resultId, at: now(), results: [x] }); }
  logCre(String(req.body?.recordedBy ?? "flow"), "stress_results_recorded", `${resultId}: ${results.length} facility result(s)`);
  res.json(envelope({ resultId, recorded: results.length }));
});

router.post("/rating/propose", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const scale = POLICIES[f.bankId].ratingScale;
  const g = scale.find((x) => x.grade === String(req.body?.grade ?? "").trim());
  if (!g) return res.status(422).json(envelope({ error: `"${req.body?.grade}" is not a grade on ${BANKS[f.bankId].name}'s scale.`, scale: scale.map((x) => `${x.grade} ${x.label}`), guidance: "Each loan is rated on its own bank's scale; the group grade is a mapping, not a substitute." }));
  if (!String(req.body?.rationale ?? "").trim()) return res.status(422).json(envelope({ error: "rationale is required." }));
  const proposalId = nextCreId("RTP");
  r.proposedRatings.push({ proposalId, at: now(), grade: g.grade, groupGrade: g.groupGrade, rationale: String(req.body.rationale), evidenceRefs: list(req.body?.evidenceRefs) });
  r.status = "rating_proposed";
  logCre("agent", "rating_proposed", `${f.facilityId} ${proposalId}: ${g.grade} (${g.groupGrade})`);
  res.json(envelope({ facilityId: f.facilityId, proposalId, grade: g.grade, label: g.label, groupGrade: g.groupGrade, status: "proposed", note: "Only a credit officer of the owning bank sets the final rating." }));
});

router.post("/memo", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const sections = (req.body?.sections && typeof req.body.sections === "object") ? req.body.sections as Record<string, string> : {};
  const figures = Array.isArray(req.body?.figures) ? req.body.figures : [];
  const required = POLICIES[f.bankId].memoSections;
  const missingSections = required.filter((s) => !String(sections[s] ?? "").trim());
  const checked = figures.map((x: any) => {
    const refs = list(x?.sourceRefs ?? x?.sourceRef);
    const resolved = refs.map((ref) => ({ ref, ...sourceValue(ref, f), receivedOk: !citationExists(ref) || received(r, ref) }));
    const single = resolved.length === 1 ? resolved[0] : null;
    const valueMatches = !single || single.value === undefined || Math.abs(single.value - Number(x?.value)) <= 0.5 || !!x?.derived;
    const traced = refs.length > 0 && resolved.every((z) => z.ok && z.receivedOk) && valueMatches;
    return { label: String(x?.label ?? ""), value: Number(x?.value), sourceRef: refs.join(", "), traced };
  });
  const tracedPct = checked.length ? Math.round(1000 * checked.filter((x: any) => x.traced).length / checked.length) / 10 : 0;
  const version = r.memos.length + 1;
  r.memos.push({ version, at: now(), sections, figures: checked, tracedPct, missingSections });
  r.status = "memo_drafted";
  logCre("agent", "memo_saved", `${f.facilityId} v${version}: ${tracedPct}% of ${checked.length} figure(s) traced; ${missingSections.length} section(s) missing`);
  res.json(envelope({ facilityId: f.facilityId, version, tracedPct, untraced: checked.filter((x: any) => !x.traced), missingSections, note: missingSections.length || tracedPct < 100 ? "Fix the untraced figures and missing sections and save again: the memo goes to the credit officer as saved." : undefined }));
});

router.post("/rating/final", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const who = person(req.body ?? {}, res, ["credit_officer", "chief_credit_officer"]); if (!who) return;
  const actorBankId = String(req.body?.actorBankId ?? "").trim().toUpperCase();
  if (actorBankId !== f.bankId) return res.status(403).json(envelope({ error: `Only a credit officer of ${BANKS[f.bankId].name} can rate ${f.facilityId}; actorBankId was "${actorBankId || "(none)"}".`, rule: "Risk ratings stay with the credit officer who holds the authority at the owning bank." }));
  const proposed = r.proposedRatings.at(-1);
  const gradeIn = String(req.body?.grade ?? proposed?.grade ?? "").trim();
  const g = POLICIES[f.bankId].ratingScale.find((x) => x.grade === gradeIn);
  if (!g) return res.status(422).json(envelope({ error: `No grade "${gradeIn}" on ${BANKS[f.bankId].name}'s scale (and no proposal to accept).` }));
  r.finalRating = { grade: g.grade, groupGrade: g.groupGrade, at: now(), setBy: who.actorId, actorBankId, approvalId: who.approvalId, rationale: String(req.body?.rationale ?? (req.body?.grade ? "" : "Accepted the proposed grade.")) };
  r.status = "rated";
  logCre(who.actorId, "final_rating_set", `${f.facilityId}: ${g.grade} (${g.groupGrade})${proposed && proposed.grade !== g.grade ? `, proposal was ${proposed.grade}` : ""}`);
  res.json(envelope({ facilityId: f.facilityId, finalRating: r.finalRating, proposed: proposed ? { grade: proposed.grade, groupGrade: proposed.groupGrade } : null }));
});

// ── Portfolio ────────────────────────────────────────────────────────────────

router.post("/rollup", (req, res) => {
  const b = req.body ?? {};
  if (!b.byBank || !b.group) return res.status(422).json(envelope({ error: "byBank and group are required." }));
  const rollupId = nextCreId("ROL");
  creBook().rollups.push({ rollupId, at: now(), byBank: b.byBank, byPropertyType: b.byPropertyType ?? null, bySubMarket: b.bySubMarket ?? null, group: b.group, guidanceFlags: b.guidanceFlags ?? null, recordedBy: String(b.recordedBy ?? "agent") });
  logCre(String(b.recordedBy ?? "agent"), "rollup_recorded", rollupId);
  res.json(envelope({ rollupId }));
});

router.post("/early-warnings", (req, res) => {
  const ws = Array.isArray(req.body?.warnings) ? req.body.warnings : [];
  const problems = ws.filter((w: any) => !facilityById(w?.facilityId) || !WARNING_TYPES.has(w?.type) || !String(w?.detail ?? "").trim())
    .map((w: any) => `Warning ${JSON.stringify(w).slice(0, 100)} needs a known facilityId, a type (${[...WARNING_TYPES].join(", ")}) and detail.`);
  if (!ws.length || problems.length) return res.status(422).json(envelope({ error: "Warnings not recorded.", problems }));
  const ids: string[] = [];
  for (const w of ws) {
    const f = facilityById(w.facilityId)!;
    const warningId = nextCreId("EWS");
    creBook().earlyWarnings.push({ warningId, at: now(), facilityId: f.facilityId, bankId: f.bankId, type: w.type, severity: ["low", "medium", "high"].includes(w.severity) ? w.severity : "medium", detail: String(w.detail), evidenceRefs: list(w.evidenceRefs), dueBy: w.dueBy ?? null });
    ids.push(warningId);
  }
  logCre("agent", "early_warnings_recorded", `${ids.length} warning(s)`);
  res.json(envelope({ warningIds: ids, note: "Alerts only: the relationship manager of the owning bank decides what to do with each." }));
});

router.get("/early-warnings", (req, res) => {
  const bank = String(req.query.bankId ?? "").trim().toUpperCase();
  res.json(envelope({ warnings: creBook().earlyWarnings.filter((w) => !bank || w.bankId === bank) }));
});

router.post("/rm-action", (req, res) => {
  const f = facilityOr404(req.body?.facilityId, res); if (!f) return;
  const r = reviewOr409(f, res); if (!r) return;
  const who = person(req.body ?? {}, res, ["relationship_manager"]); if (!who) return;
  if (!String(req.body?.action ?? "").trim()) return res.status(422).json(envelope({ error: "action is required (what the RM will do with the borrower)." }));
  const actionId = nextCreId("RMA");
  r.rmActions.push({ actionId, at: now(), actorId: who.actorId, approvalId: who.approvalId, action: String(req.body.action), note: String(req.body?.note ?? "") });
  logCre(who.actorId, "rm_action_recorded", `${f.facilityId} ${actionId}`);
  res.json(envelope({ facilityId: f.facilityId, actionId }));
});

router.get("/group-position", (_req, res) => {
  const b = creBook();
  const warningsByBank: Record<string, Record<string, number>> = {};
  for (const w of b.earlyWarnings) { (warningsByBank[w.bankId] ??= {})[w.type] = ((warningsByBank[w.bankId] ?? {})[w.type] ?? 0) + 1; }
  res.json(envelope({
    asOf: REVIEW_DATE,
    latestRollup: b.rollups.at(-1) ?? null,
    earlyWarningsByBank: warningsByBank,
    reviews: [...b.reviews.values()].map((r) => ({ facilityId: r.facilityId, bankId: facilityById(r.facilityId)!.bankId, status: r.status, finalGroupGrade: r.finalRating?.groupGrade ?? null, proposedGroupGrade: r.proposedRatings.at(-1)?.groupGrade ?? null })),
    dataSharing: "Aggregated by bank, property type and sub-market; no borrower identities.",
  }));
});

router.get("/activity", (_req, res) => res.json(envelope({ activity: creBook().activity })));

router.post("/reset", (_req, res) => { resetCreState(); res.json({ reset: true, scope: "all three Mutual Bancorp CRE fixture systems", resetAt: now(), mode: MODE }); });

export default router;
