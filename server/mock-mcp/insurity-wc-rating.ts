import { Router, type Request, type Response } from "express";
import {
  AUTHORITY, CLASS_TITLES, FIXTURE_NOTICE, FORECAST_MODEL, MODE, RATES, RATE_TABLE_VERSION, SCHEDULE_PLAN, TENANT_ID,
  cents, findSubmissionByInsured, getSubmission, money, now,
} from "./wc-seed";
import { hashOf, nextId, ratingStore, resetWcState, stateOf } from "./wc-state";

/**
 * Simulated WC rating engine and advisory mod forecast (fixture mode).
 *
 * Rating is deterministic decimal arithmetic in a fixed order:
 *   subject premium = sum(payroll / 100 x rate) over the CURRENT allocations
 *   modified premium = subject premium x the VERIFIED current mod
 *   total = modified premium x (1 + schedule% / 100)
 * each step rounded half-up to the cent. The engine reads the allocations and
 * the verified mod from the workbench rather than from the request, so a caller
 * cannot price a payroll nobody approved or a mod nobody verified -- and the
 * forecast mod has no path into the calculation at all.
 *
 * The rate table is a fixture chosen so the design specification's acceptance
 * figures are exact. It is not a filed rate.
 */
const router = Router();
export const ENGINE_VERSION = "insurity-wc-rating-fixture-1.3";

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

router.get("/schedule-rating-plan", (_req, res) => {
  res.json(envelope({
    ...SCHEDULE_PLAN,
    authority: AUTHORITY.scheduleAuthority,
    note: "A schedule adjustment is a documented rating input, not a slider position: it needs criteria from this plan and a rationale, must sit inside the plan range, and beyond the underwriter's authority needs an approved referral.",
  }));
});

/** Validate a requested schedule adjustment; returns the problems, empty when it is acceptable. */
export function scheduleProblems(sched: Record<string, any> | undefined, referralApproved: boolean): string[] {
  if (!sched) return [];
  const pct = Number(sched.percent);
  if (!Number.isFinite(pct)) return ["scheduleAdjustment.percent must be a number"];
  if (pct === 0) return [];
  const problems: string[] = [];
  if (pct < SCHEDULE_PLAN.minPct || pct > SCHEDULE_PLAN.maxPct) problems.push(`${pct}% is outside the plan range ${SCHEDULE_PLAN.minPct}% to +${SCHEDULE_PLAN.maxPct}%`);
  const rationale = String(sched.rationale || "").trim();
  if (!rationale) problems.push("a rationale is required for any non-zero schedule adjustment");
  const criteria: string[] = Array.isArray(sched.criteria) ? sched.criteria.map(String) : String(sched.criteria || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!criteria.length) problems.push("name the plan criteria the adjustment relies on");
  const unknown = criteria.filter((c) => !(c in SCHEDULE_PLAN.criteria));
  if (unknown.length) problems.push(`criteria not in plan ${SCHEDULE_PLAN.planVersion}: ${unknown.join(", ")}`);
  for (const d of SCHEDULE_PLAN.disallowedReasons) if (new RegExp(d.pattern, "i").test(rationale)) problems.push(`rationale relies on "${d.pattern}": ${d.why}`);
  const role = String(sched.authorityRole || "underwriter");
  if (/agent|bot|assistant|copilot|orchestrator/i.test(role)) problems.push(`role "${role}" cannot set a schedule adjustment`);
  if (Math.abs(pct) > AUTHORITY.scheduleAuthority.underwriterMaxAbsPct && !referralApproved) problems.push(`${pct}% exceeds the underwriter's ${AUTHORITY.scheduleAuthority.underwriterMaxAbsPct}% authority and no referral is approved`);
  if (!String(sched.approvedBy || "").trim()) problems.push("scheduleAdjustment.approvedBy is required");
  return problems;
}

router.post("/rate-quote", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const s = getSubmission(b.submissionId);
  const st = stateOf(b.submissionId);
  if (!s || !st) return res.status(404).json(envelope({ error: `No submission "${String(b.submissionId ?? "")}".` }));
  const revision = Number(b.revision);
  if (revision !== st.revision) {
    return res.status(409).json(envelope({ error: `Stale rating request: revision ${b.revision ?? "(none)"} against current revision ${st.revision}.`, currentRevision: st.revision }));
  }
  for (const k of ["mod", "modValue", "experienceMod", "forecastMod"]) {
    if (b[k] !== undefined) {
      return res.status(422).json(envelope({ error: `"${k}" is not a rating input.`, guidance: "The engine takes the current mod from the workbench's verification record. The forecast mod is advisory and never enters pricing." }));
    }
  }
  const preliminary = b.preliminary === true || b.preliminary === "true";
  const warnings: string[] = [];
  const mv = st.modVerification;
  if (!mv && !preliminary) {
    return res.status(422).json(envelope({ error: "The current experience mod has not been verified for this submission.", guidance: "Quote-ready rating is blocked on an unverified mod. Verify the worksheet first, or request a preliminary estimate (preliminary: true), which is labelled non-quotable." }));
  }
  if (s.acordStatedPayroll !== st.allocations.reduce((n, a) => n + a.payroll, 0) && !preliminary) {
    return res.status(422).json(envelope({ error: "Payroll does not reconcile to the application total; the submission is not rating-ready.", acordStatedPayroll: s.acordStatedPayroll, scheduledPayroll: st.allocations.reduce((n, a) => n + a.payroll, 0) }));
  }
  const referralApproved = !!(st.referral && st.referral.outcome === "approved" && st.referral.revision === st.revision);
  const sched = b.scheduleAdjustment && typeof b.scheduleAdjustment === "object" ? b.scheduleAdjustment : undefined;
  const sp = scheduleProblems(sched, referralApproved);
  if (sp.length) return res.status(422).json(envelope({ error: "Schedule adjustment rejected.", problems: sp, planVersion: SCHEDULE_PLAN.planVersion }));

  const lines = [];
  for (const a of st.allocations) {
    const rate = RATES[`${a.state}:${a.classCode}`];
    if (rate === undefined) return res.status(422).json(envelope({ error: `No rate for ${a.state} ${a.classCode} in ${RATE_TABLE_VERSION}.` }));
    lines.push({ allocationId: a.allocationId, state: a.state, classCode: a.classCode, classTitle: CLASS_TITLES[a.classCode] ?? null, payroll: a.payroll, ratePer100: rate, premium: money((a.payroll / 100) * rate) });
  }
  const subjectPremiumCents = lines.reduce((n, l) => n + cents(l.premium), 0);
  const subjectPremium = subjectPremiumCents / 100;
  const modValue = mv ? mv.modValue : 1;
  if (!mv) warnings.push("Preliminary: no verified mod; a unity mod was applied for illustration only. Not quotable.");
  const modifiedPremium = money(subjectPremium * modValue);
  const pct = sched ? Number(sched.percent) || 0 : 0;
  const scheduleAmount = money(modifiedPremium * (pct / 100));
  const total = money(modifiedPremium + scheduleAmount);
  const request = { submissionId: s.submissionId, revision, effectiveDate: s.proposedEffectiveDate, allocations: st.allocations, modVerificationId: mv?.verificationId ?? null, schedulePct: pct, rateTableVersion: RATE_TABLE_VERSION, planVersion: SCHEDULE_PLAN.planVersion };
  const ratingId = nextId("RTG-WC");
  const result = {
    ratingId, submissionId: s.submissionId, revision, quotable: !preliminary && !!mv,
    engineVersion: ENGINE_VERSION, rateTableVersion: RATE_TABLE_VERSION, schedulePlanVersion: SCHEDULE_PLAN.planVersion,
    requestHash: hashOf(request), currency: "USD", roundingBasis: "half-up to the cent at each step: line premium, subject premium, modified premium, schedule amount",
    lines,
    subjectPremium,
    currentMod: { value: modValue, source: mv ? `verification ${mv.verificationId} of worksheet ${mv.worksheetId}` : "none (preliminary)", verifiedBy: mv?.verifiedBy ?? null },
    modifiedPremium,
    scheduleAdjustment: { percent: pct, amount: scheduleAmount, criteria: sched?.criteria ?? [], rationale: sched?.rationale ?? null, approvedBy: sched?.approvedBy ?? null },
    totalEstimatedAnnualPremium: total,
    excludedComponents: "Taxes, assessments, fees, expense constants and premium discount depend on the production engine and plan and are not included in this fixture.",
    forecastUsed: false,
    warnings,
    ratedAt: now(),
  };
  ratingStore.put({ ratingId, submissionId: s.submissionId, revision, requestHash: result.requestHash, quotable: result.quotable, result, ratedAt: result.ratedAt });
  if (result.quotable && ["rating_ready", "risk_review", "received"].includes(st.status)) st.status = "rated";
  res.json(envelope(result));
});

router.get("/rating", (req: Request, res: Response) => {
  const r = ratingStore.get(req.query.ratingId);
  if (!r) return res.status(404).json(envelope({ error: `No rating "${String(req.query.ratingId ?? "")}".` }));
  const st = stateOf(r.submissionId)!;
  res.json(envelope({ ...r.result, stale: r.revision !== st.revision, currentRevision: st.revision }));
});

/**
 * Advisory forecast of the next experience mod. Fixture model, not validated.
 * Unavailable is a real answer: the authority gateway must then require a
 * manual review rather than treat the gap as a pass.
 */
router.post("/forecast-mod", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const s = getSubmission(b.submissionId) ?? findSubmissionByInsured(b.insuredRef);
  if (!s) return res.status(404).json(envelope({ error: "No submission or insured matched." }));
  const f = s.forecast;
  const base = { submissionId: s.submissionId, insuredId: s.insuredId, modelId: FORECAST_MODEL.modelId, modelVersion: FORECAST_MODEL.modelVersion, validationStatus: FORECAST_MODEL.validationStatus, horizon: FORECAST_MODEL.horizon, usage: "Advisory input to the authority gateway only. Never a pricing input." };
  if (f.status === "unavailable") return res.json(envelope({ ...base, status: "unavailable", value: null, reason: f.reason, consequence: AUTHORITY.missingForecastRule }));
  res.json(envelope({ ...base, status: "available", value: f.value, interval: { low: f.interval[0], high: f.interval[1], note: "Illustrative band, not a calibrated interval." }, assumptions: FORECAST_MODEL.assumptions, referralThreshold: AUTHORITY.forecastModReferralThreshold, exceedsThreshold: f.value > AUTHORITY.forecastModReferralThreshold }));
});

router.post("/reset", (_req, res) => { resetWcState(); res.json({ reset: true, scope: "all five WC fixture systems", resetAt: now(), mode: MODE }); });

export default router;
