import { Router, type Request, type Response } from "express";
import {
  CLASS_RULES, CLASS_RULE_VERSION, CLASS_TITLES, DURATION_BENCHMARKS, FIXTURE_NOTICE, MODE, SUBMISSIONS, TENANT_ID,
  daysBetween, findSubmissionByInsured, now,
} from "./wc-seed";
import { resetWcState } from "./wc-state";

/**
 * Simulated classification and bureau services for WC underwriting (fixture).
 *
 * - Classification rule excerpts by jurisdiction, effective date and candidate
 *   code. Paraphrased for design validation; NOT licensed manual content. They
 *   tell a reviewer what each code requires -- they never decide which applies.
 * - The experience rating worksheet on file for an insured and period. Reading
 *   it is not verifying it: verification is a person's act, recorded in the
 *   workbench.
 * - Prior-carrier claim updates, approved operations sources and a descriptive
 *   duration benchmark. A source that could not be reached comes back
 *   "unavailable", never as a clean result.
 */
const router = Router();

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

router.get("/classification-rules", (req: Request, res: Response) => {
  const jurisdiction = String(req.query.jurisdiction || "").trim().toUpperCase();
  const effectiveDate = String(req.query.effectiveDate || "").trim();
  const codes = String(req.query.candidateCodes || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!jurisdiction || !effectiveDate || !codes.length) {
    return res.status(422).json(envelope({ error: "jurisdiction, effectiveDate and candidateCodes are all required.", guidance: "Rules apply by state and date; a rule read without them is a rule applied out of context." }));
  }
  const rules = codes.map((code) => {
    const found = (CLASS_RULES[code] || []).filter((r) => (r.jurisdiction === "ALL" || r.jurisdiction === jurisdiction) && r.effectiveFrom <= effectiveDate);
    return { classCode: code, classTitle: CLASS_TITLES[code] ?? null, available: found.length > 0, rules: found, ...(found.length ? {} : { note: `No rule content for ${code} in ${jurisdiction} at ${effectiveDate} in this fixture. Treat as unavailable, not as no requirement.` }) };
  });
  res.json(envelope({
    jurisdiction, effectiveDate, ruleVersion: CLASS_RULE_VERSION, results: rules,
    applicabilityNote: "These excerpts state prerequisites. Whether an employee group meets them is a finding a reviewer proposes with evidence and a person decides. A rule marked nonOverridable cannot be set aside by a free-text override; it must be resolved or referred.",
  }));
});

router.get("/mod-worksheet", (req: Request, res: Response) => {
  const s = findSubmissionByInsured(req.query.insuredRef);
  if (!s) return res.status(404).json(envelope({ error: `No insured "${String(req.query.insuredRef ?? "")}".`, knownInsureds: Object.values(SUBMISSIONS).map((x) => x.insuredId) }));
  const effectiveDate = String(req.query.effectiveDate || s.proposedEffectiveDate).trim();
  const w = s.modWorksheet;
  if (!w) return res.json(envelope({ insuredId: s.insuredId, status: "not_on_file", note: "No worksheet on file. Request one; do not assume a unity mod." }));
  const coversPeriod = w.ratingEffectiveDate <= effectiveDate && effectiveDate < w.expirationDate;
  const entityMatch = w.entityName === s.legalName && w.fein === s.fein;
  res.json(envelope({
    insuredId: s.insuredId, legalName: s.legalName, requestedEffectiveDate: effectiveDate,
    worksheet: w,
    checks: { entityMatch, coversRequestedPeriod: coversPeriod },
    status: entityMatch && coversPeriod ? "on_file_unverified" : "on_file_mismatch",
    note: entityMatch && coversPeriod
      ? "Worksheet on file for this entity and period. It still needs an underwriter's verification before quote-ready rating."
      : "The worksheet on file does not match the entity or does not cover the requested period. It cannot support quote-ready rating.",
  }));
});

router.get("/claim-updates", (req: Request, res: Response) => {
  const priorPolicyRef = String(req.query.priorPolicyRef || "").trim();
  const claimRef = String(req.query.claimRef || "").trim();
  const s = Object.values(SUBMISSIONS).find((x) => x.priorPolicyRefs.includes(priorPolicyRef));
  if (!s) return res.status(404).json(envelope({ error: `No prior policy "${priorPolicyRef}".`, guidance: "Claims belong to the PRIOR policy they occurred under, never to the proposed policy." }));
  const claims = s.lossRuns.filter((l) => l.priorPolicyRef === priorPolicyRef).flatMap((l) => l.claims.map((c) => ({ ...c, valuationDate: l.valuationDate, lossRunDocumentId: l.documentId })));
  const selected = claimRef ? claims.filter((c) => c.claimRef === claimRef) : claims;
  if (claimRef && !selected.length) return res.status(404).json(envelope({ error: `Claim ${claimRef} is not on ${priorPolicyRef}.` }));
  res.json(envelope({
    priorPolicyRef, insuredId: s.insuredId,
    claims: selected.map((c) => ({
      ...c,
      daysOpenAtValuation: c.status === "open" ? daysBetween(c.reportedDate, c.valuationDate) : null,
      reserveHistory: null,
      reserveHistoryNote: "The prior carrier supplied no reserve history, only the current valuation. Reserve volatility cannot be measured from this.",
    })),
  }));
});

router.get("/operations-evidence", (req: Request, res: Response) => {
  const s = findSubmissionByInsured(req.query.insuredRef);
  if (!s) return res.status(404).json(envelope({ error: `No insured "${String(req.query.insuredRef ?? "")}".` }));
  const wanted = String(req.query.approvedSources || "").split(",").map((x) => x.trim()).filter(Boolean);
  const sources = s.operationsEvidence.filter((e) => !wanted.length || wanted.includes(e.source));
  res.json(envelope({
    insuredId: s.insuredId, legalName: s.legalName,
    sources,
    unavailableSources: sources.filter((x) => x.status === "unavailable").map((x) => x.source),
    note: "Optional enrichment. An unavailable source is unknown, not clean. Each observation carries its URL, retrieval time and how the entity was matched.",
  }));
});

router.get("/duration-benchmark", (req: Request, res: Response) => {
  const cohort = String(req.query.cohort || "").trim();
  const b = DURATION_BENCHMARKS[cohort];
  if (!b) return res.json(envelope({ cohort, status: "unavailable", availableCohorts: Object.keys(DURATION_BENCHMARKS), note: "No compatible benchmark for that cohort. Report the comparison as unavailable rather than borrowing another cohort's figure." }));
  res.json(envelope({ cohortKey: cohort, status: "available", ...b, interpretation: "Compare a claim's days open to this median as a descriptive signal only. A longer duration is not a cost increase and not evidence of reserve inadequacy." }));
});

router.post("/reset", (_req, res) => { resetWcState(); res.json({ reset: true, scope: "all five WC fixture systems", resetAt: now(), mode: MODE }); });

export default router;
