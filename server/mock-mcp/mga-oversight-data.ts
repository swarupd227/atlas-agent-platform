/**
 * Simulated carrier-side oversight data for the Delegated Authority Review journey: what a carrier knows about an
 * MGA it has delegated authority to.
 *
 * It behaves like a system that enforces its own scope, because the review's safeguards cannot live in a prompt:
 *  - every read names a reviewer and one MGA, and is refused (403) unless that reviewer may see that MGA;
 *  - context is filtered BEFORE it is ranked: by MGA, by document permission, and by the evidence cutoff, so a
 *    document written after the cutoff is never returned as if it had been available then, only labelled as
 *    subsequent context, and a restricted or other-MGA document is not returned at all;
 *  - an MGA's documents are never reachable through another MGA's review, including by opening a source directly;
 *  - what it withholds is reported as counts, so "nothing found" and "found but not yours or not yet" read
 *    differently;
 *  - a missing limit stays missing and a zero denominator stays zero. Nothing is guessed.
 * The authority and performance arithmetic is NOT done here: this system returns the records and the review's own
 * rule steps evaluate them, so the rules and their versions are visible in the run.
 *
 * State is in memory and resets with POST /reset. /admin/* exists for tests (revoke a source, simulate an outage).
 */
import { Router, type Request, type Response } from "express";
import {
  REVIEWERS, MGAS, AGREEMENT_VERSIONS, HARB_PREMIUM_FEB, HARB_PREMIUM_MAR, HARB_CLAIMS_FEB, METRIC, PERFORMANCE_INPUTS, SOURCES,
  isMga, mgaOf, nowIso, type SourceDoc,
} from "./mga-oversight-seed";

const router = Router();
let revoked = new Set<string>();
let outage = false;
let lastGoodSnapshotAt: string | null = null;

export function resetOversightData(): void { revoked = new Set(); outage = false; lastGoodSnapshotAt = null; }

type Denial = { status: number; error: string; code: string };
const deny = (res: Response, d: Denial) => res.status(d.status).json({ error: d.error, code: d.code });

/** Identity and scope for one read. The reviewer is whoever the caller says; the prototype cannot verify it. */
function scopeFor(req: Request): { ok: true; reviewer: (typeof REVIEWERS)[string]; mgaId: string } | { ok: false; denial: Denial } {
  const reviewerId = String(req.query.reviewer ?? req.body?.reviewer ?? "").trim();
  const mgaId = String(req.query.mga_id ?? req.body?.mga_id ?? "").trim();
  if (!reviewerId) return { ok: false, denial: { status: 401, code: "identity_missing", error: "A reviewer identity is required." } };
  const reviewer = REVIEWERS[reviewerId];
  if (!reviewer) return { ok: false, denial: { status: 403, code: "access_denied", error: `"${reviewerId}" is not a known reviewer.` } };
  if (!mgaId) return { ok: false, denial: { status: 422, code: "mga_missing", error: "An MGA is required." } };
  if (!isMga(mgaId)) return { ok: false, denial: { status: 404, code: "mga_unknown", error: `No MGA matches "${mgaId}".` } };
  if (!reviewer.mgaScope.includes(mgaId)) return { ok: false, denial: { status: 403, code: "access_denied", error: `${reviewerId} has no access to ${mgaId}.` } };
  return { ok: true, reviewer, mgaId };
}

const mayRead = (reviewer: (typeof REVIEWERS)[string], doc: SourceDoc) => doc.acl === "carrier_reviewer" || reviewer.roles.includes(doc.acl);
const endOfDay = (d: string) => `${d}T23:59:59Z`;

/** Reads are refused during a simulated outage, with the last good snapshot named so staleness is visible. */
function outageGuard(res: Response): boolean {
  if (!outage) return false;
  res.status(503).json({ error: "The oversight source is unavailable.", code: "source_unavailable", lastSuccessfulSnapshotAt: lastGoodSnapshotAt, freshnessWarning: "Anything shown from before this outage is not newly fetched." });
  return true;
}

router.get("/mgas", (_req: Request, res: Response) => {
  res.json({ count: MGAS.length, mgas: MGAS.map((m) => ({ id: m.id, name: m.name, agreementId: m.agreementId, line: m.line })) });
});

/** The review's scope check: identity, MGA, agreement, period, as-of and cutoff all present, and the agreement belongs to the MGA. */
router.get("/review-scope", (req: Request, res: Response) => {
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const agreementId = String(req.query.agreement_id ?? "");
  const period = String(req.query.period ?? "");
  const cutoff = String(req.query.evidence_cutoff ?? "");
  const mga = mgaOf(s.mgaId)!;
  const errors: string[] = [];
  if (!agreementId) errors.push("agreement_id is missing");
  else if (agreementId !== mga.agreementId) errors.push(`${agreementId} is not an agreement of ${mga.id}; its agreement is ${mga.agreementId}`);
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)) errors.push("period must look like 2026-02");
  if (!/^20\d\d-\d\d-\d\d$/.test(cutoff)) errors.push("evidence_cutoff must be a date like 2026-02-28");
  res.json({ ok: errors.length === 0, errors, reviewer: s.reviewer.id, mga: { id: mga.id, name: mga.name, line: mga.line }, agreementId, period, evidenceCutoff: cutoff });
});

/** The sources a review may rely on: metadata only. Each carries whether it was available at the cutoff. */
router.get("/sources", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const cutoff = String(req.query.evidence_cutoff ?? "");
  if (!/^20\d\d-\d\d-\d\d$/.test(cutoff)) return res.status(422).json({ error: "evidence_cutoff must be a date like 2026-02-28", code: "validation_failed" });
  const own = SOURCES.filter((d) => d.mgaId === s.mgaId);
  const visible = own.filter((d) => mayRead(s.reviewer, d) && !revoked.has(d.sourceId));
  lastGoodSnapshotAt = nowIso();
  res.json({
    mgaId: s.mgaId, evidenceCutoff: cutoff, snapshotAt: lastGoodSnapshotAt,
    count: visible.length,
    sources: visible.map((d) => ({ sourceId: d.sourceId, version: d.version, hash: d.hash, kind: d.kind, title: d.title, authoredAt: d.authoredAt, ingestedAt: d.ingestedAt, label: "sample",
      classification: d.authoredAt <= endOfDay(cutoff) ? "contemporaneous" : "subsequent_context" })),
    withheld: { restrictedToOtherRoles: own.filter((d) => !mayRead(s.reviewer, d)).length, revoked: own.filter((d) => revoked.has(d.sourceId)).length },
  });
});

/** The bordereau rows for a period, each with its source and row coordinate. Missing values stay null. */
router.get("/bordereau", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const period = String(req.query.period ?? "");
  const kind = String(req.query.kind ?? "premium");
  let rows: unknown[] = []; let source = "";
  if (s.mgaId === "AGY-HARB-01" && period === "2026-02") {
    if (kind === "premium") { source = "SRC-HARB-BDX-PREM-2026-02"; rows = HARB_PREMIUM_FEB.map((r, i) => ({ ...r, source, sheet: "Premium", row: i + 2 })); }
    else { source = "SRC-HARB-BDX-CLM-2026-02"; rows = HARB_CLAIMS_FEB.map((r, i) => ({ ...r, source, sheet: "Claims", row: i + 2 })); }
  } else if (s.mgaId === "AGY-HARB-01" && period === "2026-03" && kind === "premium") {
    source = "SRC-HARB-BDX-PREM-2026-03"; rows = HARB_PREMIUM_MAR.map((r, i) => ({ ...r, source, sheet: "Premium", row: i + 2 }));
  } else if (s.mgaId === "AGY-CEDR-02" && period === "2026-02") {
    source = kind === "premium" ? "SRC-CEDR-BDX-PREM-2026-02" : "SRC-CEDR-BDX-CLM-2026-02";
    rows = kind === "premium"
      ? [{ riskId: "C-0201", insured: "Gulf Breeze Hotels", cls: "property", territory: "FL", limit: 450_000, writtenPremium: 12_000, earnedPremium: 0, transactionDate: "2026-02-27", source, sheet: "Premium", row: 2 }]
      : [{ claimId: "CL-9001", riskId: "C-0101", lossDate: "2026-01-30", paid: 10_000, reserve: 15_000, incurred: 25_000, source, sheet: "Claims", row: 2 }];
  }
  res.json({ mgaId: s.mgaId, period, kind, source: source || null, count: rows.length, rows, note: rows.length ? undefined : "No bordereau was reported for this period." });
});

/** Every agreement version, with the dates each applied. The review picks the one in force on each transaction date. */
router.get("/agreement-versions", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const agreementId = String(req.query.agreement_id ?? "");
  const mga = mgaOf(s.mgaId)!;
  if (agreementId !== mga.agreementId) return res.status(422).json({ error: `${agreementId || "(none)"} is not an agreement of ${mga.id}.`, code: "validation_failed" });
  const versions = AGREEMENT_VERSIONS.filter((v) => v.agreementId === agreementId);
  res.json({ agreementId, mgaId: s.mgaId, count: versions.length, versions });
});

/** The figures a governed metric needs, with the definition and its version. The ratio is calculated by the review's own rule step. */
router.get("/performance-inputs", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const period = String(req.query.period ?? "");
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)) return res.status(422).json({ error: "period must look like 2026-02", code: "validation_failed" });
  const [y, m] = period.split("-").map(Number);
  const prior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const byPeriod = PERFORMANCE_INPUTS[s.mgaId] ?? {};
  res.json({ mgaId: s.mgaId, metric: METRIC, period, priorPeriod: prior, current: byPeriod[period] ?? null, prior: byPeriod[prior] ?? null });
});

/**
 * Scoped retrieval. The order matters and is the point: scope, then permission, then cutoff, then relevance.
 * `subsequent=exclude` gives the reporting-period view; the default labels later material instead of hiding it.
 */
router.get("/context", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const cutoff = String(req.query.evidence_cutoff ?? "");
  if (!/^20\d\d-\d\d-\d\d$/.test(cutoff)) return res.status(422).json({ error: "evidence_cutoff must be a date like 2026-02-28", code: "validation_failed" });
  const subsequent = String(req.query.subsequent ?? "include");
  const query = String(req.query.query ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const own = SOURCES.filter((d) => d.mgaId === s.mgaId);
  const quarantined = SOURCES.filter((d) => d.quarantined).length;
  const permitted = own.filter((d) => mayRead(s.reviewer, d) && !revoked.has(d.sourceId));
  const timed = permitted.filter((d) => subsequent !== "exclude" || d.authoredAt <= endOfDay(cutoff));
  const items = timed.flatMap((d) => d.spans.map((sp, i) => ({
    evidenceId: `${d.sourceId}#${i + 1}`, sourceId: d.sourceId, version: d.version, kind: d.kind, title: d.title, locator: sp.locator, excerpt: sp.text,
    authoredAt: d.authoredAt, applicablePeriod: d.period,
    classification: d.authoredAt <= endOfDay(cutoff) ? "contemporaneous" : "subsequent_context",
    extractionConfidence: 0.97, sourceLabel: "sample",
    score: query.length ? query.filter((w) => sp.text.toLowerCase().includes(w) || d.title.toLowerCase().includes(w)).length : 0,
  })));
  const ranked = items.sort((a, b) => b.score - a.score || (a.authoredAt < b.authoredAt ? -1 : 1)).filter((i) => !query.length || i.score > 0 || String(req.query.all ?? "") === "1");
  lastGoodSnapshotAt = nowIso();
  res.json({
    mgaId: s.mgaId, evidenceCutoff: cutoff, view: subsequent === "exclude" ? "reporting_period_only" : "reporting_period_and_subsequent_context",
    status: ranked.length ? "found" : "no_accessible_context",
    message: ranked.length ? undefined : "No accessible context found.",
    count: ranked.length, items: ranked.slice(0, 25),
    withheld: {
      afterCutoffExcluded: subsequent === "exclude" ? permitted.length - timed.length : 0,
      restrictedToOtherRoles: own.filter((d) => !mayRead(s.reviewer, d)).length,
      revoked: own.filter((d) => revoked.has(d.sourceId)).length,
      quarantinedUnlinked: quarantined,
    },
    snapshotAt: lastGoodSnapshotAt,
  });
});

/** Opening one source re-checks everything: another MGA's document is refused even with a valid id. */
router.get("/source-excerpt", (req: Request, res: Response) => {
  if (outageGuard(res)) return;
  const s = scopeFor(req); if (!s.ok) return deny(res, s.denial);
  const sourceId = String(req.query.source_id ?? "");
  const doc = SOURCES.find((d) => d.sourceId === sourceId);
  if (!doc) return res.status(404).json({ error: `No source matches "${sourceId}".`, code: "source_unavailable" });
  if (doc.mgaId !== s.mgaId) return res.status(403).json({ error: `${sourceId} is not part of ${s.mgaId}'s review.`, code: "access_denied" });
  if (!mayRead(s.reviewer, doc)) return res.status(403).json({ error: `${s.reviewer.id} may not open ${sourceId}.`, code: "access_denied" });
  if (revoked.has(sourceId)) return res.status(403).json({ error: `Access to ${sourceId} was revoked.`, code: "access_denied" });
  const n = Number(req.query.span ?? 1);
  const sp = doc.spans[n - 1];
  if (!sp) return res.status(404).json({ error: `${sourceId} has no span ${n}.`, code: "source_unavailable" });
  res.json({ sourceId, version: doc.version, hash: doc.hash, title: doc.title, authoredAt: doc.authoredAt, locator: sp.locator, excerpt: sp.text });
});

// ── test-only controls ───────────────────────────────────────────────────────

router.post("/admin/revoke", (req: Request, res: Response) => { revoked.add(String(req.body?.source_id ?? "")); res.json({ revoked: Array.from(revoked) }); });
router.post("/admin/outage", (req: Request, res: Response) => { outage = !!req.body?.on; res.json({ outage }); });
router.post("/reset", (_req: Request, res: Response) => { resetOversightData(); res.json({ reset: true, resetAt: nowIso() }); });

export default router;
