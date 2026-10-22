import { Router } from "express";
import {
  APPROVED_MARKET_SOURCES, BANKS, CONCENTRATION_GUIDANCE, FIXTURE_NOTICE, GROUP_SCALE, MARKET_DATA, MODE, MODEL_REGISTER, POLICIES,
  STRESS_SCENARIOS, TENANT_ID, now, type BankId,
} from "./mbcre-seed";
import { resetCreState } from "./mbcre-state";

/**
 * Simulated credit policy and portfolio risk library (fixture mode): each
 * bank's CRE credit policy and rating scale, the mapping of those scales to
 * the group scale (mapped, not merged), the registered stress scenarios and
 * model register, the 2006 interagency concentration criteria, the approved
 * external market data source and the holding company's data-sharing rules.
 * It states policy; it never rates a loan or decides an outcome.
 */
const router = Router();
const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

router.get("/policy", (req, res) => {
  const b = String(req.query.bankId ?? "").trim().toUpperCase() as BankId;
  if (!POLICIES[b]) return res.status(404).json(envelope({ error: "bankId must be CC5, FID or BLU." }));
  res.json(envelope({ bank: BANKS[b].name, policy: POLICIES[b] }));
});

router.get("/rating-map", (_req, res) => res.json(envelope({
  groupScale: GROUP_SCALE,
  banks: Object.fromEntries((Object.keys(POLICIES) as BankId[]).map((b) => [b, POLICIES[b].ratingScale.map((g) => ({ grade: g.grade, label: g.label, groupGrade: g.groupGrade }))])),
  rule: "Rating scales are mapped, not merged: a loan is rated on its own bank's scale by that bank's credit officer, and the group grade is read from this map.",
})));

router.get("/stress-scenarios", (_req, res) => res.json(envelope({ scenarios: STRESS_SCENARIOS, model: MODEL_REGISTER[0], horizonForRateShock: "24 months" })));

router.get("/concentration-guidance", (_req, res) => res.json(envelope({ guidance: CONCENTRATION_GUIDANCE })));

router.get("/market-data", (req, res) => {
  const source = String(req.query.source ?? APPROVED_MARKET_SOURCES[0]).trim();
  if (!APPROVED_MARKET_SOURCES.includes(source)) return res.status(403).json(envelope({ error: `"${source}" is not on the approved external data source list.`, approvedSources: APPROVED_MARKET_SOURCES }));
  const sub = String(req.query.subMarket ?? "").trim();
  const rows = MARKET_DATA[sub];
  if (!rows) return res.status(404).json(envelope({ error: `No market data for sub-market "${sub}".`, subMarkets: Object.keys(MARKET_DATA) }));
  res.json(envelope({ source, subMarket: sub, asOf: "2026-09-30", data: rows }));
});

router.get("/model-register", (_req, res) => res.json(envelope({ models: MODEL_REGISTER })));

router.get("/data-sharing-rules", (_req, res) => res.json(envelope({
  rules: [
    { ruleId: "DS-AGG-01", status: "approved", text: "The holding company view uses data aggregated by bank, property type and sub-market, and facility data without borrower identity." },
    { ruleId: "DS-BORR-01", status: "not_approved", text: "Borrower-level data (borrower, guarantor, property name) of one bank shown to another bank or to the holding company. Needs legal approval before it is switched on." },
  ],
})));

router.post("/reset", (_req, res) => { resetCreState(); res.json({ reset: true, scope: "all three Mutual Bancorp CRE fixture systems", resetAt: now(), mode: MODE }); });

export default router;
