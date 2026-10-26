import { Router, type Response } from "express";
import { CRM, FEE_SCHEDULES, FIXTURE_NOTICE, HOUSEHOLDS, MODE, PERFORMANCE, PLANS, RISK_PROFILES, SCENARIOS, TENANT_ID, accountsOf, householdById, now } from "./wm-seed";
import { humanActor, logWm, nextWmId, resetWmState, wm } from "./wm-state";

/**
 * Three small Harborview Wealth Partners fixture systems in one module, each
 * mounted at its own path: financial planning, CRM and advisor desktop, and
 * performance and billing. The planning tool computes scenarios and the
 * performance system computes returns; agents request and explain, never
 * compute or alter. A client communication is sent only by the advisor, and
 * only after it passed the Marketing Rule pre-check.
 */
const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });
const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json(envelope({ error, ...extra }));
function household(id: unknown, res: Response) {
  const h = householdById(id);
  if (!h) { fail(res, 404, `No household "${String(id ?? "")}".`, { households: HOUSEHOLDS.map((x) => x.householdId) }); return null; }
  return h;
}
const reset = (_req: unknown, res: Response) => { resetWmState(); res.json({ reset: true, scope: "all six Harborview Wealth Partners fixture systems", resetAt: now(), mode: MODE }); };

// ── Planning ─────────────────────────────────────────────────────────────────
export const planning = Router();
planning.get("/plan", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  const p = PLANS[h.householdId];
  if (!p) return fail(res, 404, `No plan for ${h.householdId}.`);
  res.json(envelope({ plan: p }));
});
planning.get("/risk-profile", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  res.json(envelope({ riskProfile: RISK_PROFILES[h.householdId] ?? null }));
});
planning.get("/ips", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  res.json(envelope({ householdId: h.householdId, modelId: h.modelId, ips: h.ips }));
});
planning.post("/scenario", (req, res) => {
  const h = household(req.body?.householdId, res); if (!h) return;
  const table = SCENARIOS[h.householdId] ?? {};
  const name = String(req.body?.scenario ?? "").trim();
  if (!table[name]) return fail(res, 422, `No scenario "${name}" for ${h.householdId}.`, { scenarios: Object.keys(table) });
  logWm("agent", "scenario_run", `${h.householdId} ${name}`);
  res.json(envelope({ householdId: h.householdId, scenario: name, ...table[name], baseProbabilityOfSuccess: (PLANS[h.householdId] as any)?.probabilityOfSuccess, computedBy: "Harborview planning tool (fixture), seeded Monte Carlo" }));
});
planning.post("/reset", reset);

// ── CRM ──────────────────────────────────────────────────────────────────────
export const crm = Router();
crm.get("/profile", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  res.json(envelope({ profile: CRM.profiles[h.householdId] ?? null, members: h.members, lastReviewDate: h.lastReviewDate, reviewCadence: h.reviewCadence }));
});
crm.get("/life-events", (req, res) => { const h = household(req.query.householdId, res); if (!h) return; res.json(envelope({ lifeEvents: CRM.lifeEvents.filter((e) => e.householdId === h.householdId) })); });
crm.get("/service-items", (req, res) => { const h = household(req.query.householdId, res); if (!h) return; res.json(envelope({ serviceItems: CRM.serviceItems.filter((e) => e.householdId === h.householdId) })); });
crm.get("/reviews", (req, res) => { const h = household(req.query.householdId, res); if (!h) return; res.json(envelope({ reviews: CRM.reviews.filter((e) => e.householdId === h.householdId), lastReviewDate: h.lastReviewDate, reviewCadence: h.reviewCadence })); });
crm.get("/beneficiaries", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  res.json(envelope({ householdId: h.householdId, accounts: accountsOf(h.householdId).map((a) => ({ accountId: a.accountId, registration: a.registration, designations: CRM.beneficiaries.find((b) => b.accountId === a.accountId)?.designations ?? [] })) }));
});
crm.post("/activity", (req, res) => {
  const h = household(req.body?.householdId, res); if (!h) return;
  if (!String(req.body?.subject ?? "").trim() || !String(req.body?.body ?? "").trim()) return fail(res, 422, "subject and body are required.");
  const activityId = nextWmId("ACT");
  wm().activities.push({ activityId, householdId: h.householdId, type: String(req.body?.type ?? "note"), subject: String(req.body.subject), body: String(req.body.body), by: String(req.body?.by ?? "agent"), at: now() });
  logWm(String(req.body?.by ?? "agent"), "crm_activity", `${h.householdId} ${activityId}`);
  res.json(envelope({ activityId }));
});
crm.post("/task", (req, res) => {
  const h = household(req.body?.householdId, res); if (!h) return;
  if (!String(req.body?.subject ?? "").trim()) return fail(res, 422, "subject is required.");
  const taskId = nextWmId("TSK");
  wm().tasks.push({ taskId, householdId: h.householdId, subject: String(req.body.subject), dueDate: req.body?.dueDate ?? null, owner: String(req.body?.owner ?? "advisor"), at: now() });
  res.json(envelope({ taskId }));
});
crm.get("/activities", (req, res) => { const h = household(req.query.householdId, res); if (!h) return; res.json(envelope({ activities: wm().activities.filter((a) => a.householdId === h.householdId), tasks: wm().tasks.filter((t) => t.householdId === h.householdId), communications: wm().communications.filter((c) => c.householdId === h.householdId) })); });
crm.post("/communication/send", (req, res) => {
  const who = humanActor(req.body ?? {}, ["advisor"]); if (!who.ok) return fail(res, who.status, who.error);
  const h = household(req.body?.householdId, res); if (!h) return;
  const review = wm().marketingReviews.get(String(req.body?.marketingReviewId ?? "").trim());
  if (!review || review.verdict !== "pass") return fail(res, 422, "A client communication needs a Marketing Rule pre-check that passed (marketingReviewId).", { review: review ?? null });
  const communicationId = nextWmId("COM");
  wm().communications.push({ communicationId, householdId: h.householdId, subject: String(req.body?.subject ?? ""), body: String(req.body?.body ?? ""), sentBy: who.actorId, approvalId: who.approvalId, marketingReviewId: review.reviewId, at: now() });
  logWm(who.actorId, "client_communication_sent", `${h.householdId} ${communicationId}`);
  res.json(envelope({ communicationId, sentBy: who.actorId }));
});
crm.post("/reset", reset);

// ── Performance and billing ──────────────────────────────────────────────────
export const performance = Router();
performance.get("/performance", (req, res) => {
  const h = household(req.query.householdId, res); if (!h) return;
  const p = PERFORMANCE[h.householdId];
  if (!p) return fail(res, 404, `No performance computed for ${h.householdId}.`);
  res.json(envelope({ performance: p }));
});
performance.get("/fee-schedule", (req, res) => res.json(envelope({ schedules: FEE_SCHEDULES })));
performance.post("/reset", reset);
