import { Router } from "express";
import {
  BANKS, BANK_CLOSURES_2026, FEDERAL_HOLIDAYS_2026, FIXTURE_NOTICE, GUIDELINES, MASSACHUSETTS_HOLIDAYS_2026, MODE, TENANT_ID,
  getLoan, now, ruleById, type BankId,
} from "./mb-mortgage-seed";
import { resetMortgageState } from "./mb-mortgage-state";

/**
 * Simulated investor and bank guidelines library (fixture mode).
 *
 * Investor rule excerpts are illustrative paraphrases keyed to Selling Guide
 * section numbers, and the overlays are each bank's own. The library enforces
 * the bank boundary itself: overlays are served for a LOAN, resolved to the
 * bank that owns it, and a request for another bank's overlays on that loan is
 * refused. It states rules; it never decides whether a file meets them.
 */
const router = Router();

const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });

router.get("/rules", (req, res) => {
  const investor = String(req.query.investor ?? "Fannie Mae").trim();
  const topic = String(req.query.topic ?? "").trim().toLowerCase();
  if (!/fannie/i.test(investor)) {
    return res.json(envelope({ investor, rules: [], unavailable: `${investor} guides are not loaded in fixture mode. Only Fannie Mae excerpts are available; do not apply another investor's rules in their place.` }));
  }
  const rules = GUIDELINES.filter((r) => r.investor === "Fannie Mae" && (!topic || r.topic === topic));
  res.json(envelope({ investor: "Fannie Mae", topics: [...new Set(GUIDELINES.filter((r) => r.investor).map((r) => r.topic))], rules }));
});

router.get("/rule", (req, res) => {
  const r = ruleById(req.query.ruleId);
  if (!r) return res.status(404).json(envelope({ error: `No rule "${String(req.query.ruleId ?? "")}".` }));
  res.json(envelope({ rule: r }));
});

router.get("/overlays", (req, res) => {
  const l = getLoan(req.query.loanId);
  if (!l) return res.status(422).json(envelope({ error: "loanId is required: overlays are served for a loan, under the bank that owns it." }));
  const asked = String(req.query.bankId ?? "").trim().toUpperCase();
  if (asked && asked !== l.bankId) {
    return res.status(403).json(envelope({ error: `${l.loanId} is owned by ${BANKS[l.bankId].name}. It is checked only against ${BANKS[l.bankId].name}'s overlays, never ${BANKS[asked as BankId]?.name ?? asked}'s.`, owningBank: l.bankId }));
  }
  res.json(envelope({ loanId: l.loanId, owningBank: { bankId: l.bankId, name: BANKS[l.bankId].name }, overlays: GUIDELINES.filter((r) => r.overlay && r.bankId === l.bankId) }));
});

router.get("/calendar", (req, res) => {
  const year = Number(req.query.year ?? 2026);
  const bankId = String(req.query.bankId ?? "").trim().toUpperCase() as BankId;
  if (year !== 2026) return res.json(envelope({ year, unavailable: "Only the 2026 calendar is loaded in fixture mode." }));
  res.json(envelope({
    year,
    federalLegalPublicHolidays: FEDERAL_HOLIDAYS_2026,
    massachusettsHolidays: MASSACHUSETTS_HOLIDAYS_2026,
    bankClosures: BANKS[bankId] ? { bank: BANKS[bankId].name, officeDays: BANKS[bankId].officeDays, closedDates: BANK_CLOSURES_2026[bankId] } : Object.fromEntries((Object.keys(BANKS) as BankId[]).map((b) => [b, { bank: BANKS[b].name, officeDays: BANKS[b].officeDays, closedDates: BANK_CLOSURES_2026[b] }])),
    businessDayDefinitions: {
      general: "A day on which the creditor's offices are open to the public for carrying on substantially all business functions (Regulation Z 1026.2(a)(6)). Used for delivering the initial Loan Estimate within three business days of application, and a revised Loan Estimate within three business days of a changed circumstance.",
      precise: "All calendar days except Sundays and the federal legal public holidays in 5 U.S.C. 6103(a). Used for the Closing Disclosure: the consumer must receive it no later than three business days before consummation, and one sent without confirmed receipt is presumed received three business days after it is sent. Saturdays count.",
    },
  }));
});

router.post("/reset", (_req, res) => { resetMortgageState(); res.json({ reset: true, scope: "all three Mutual Bancorp mortgage fixture systems", resetAt: now(), mode: MODE }); });

export default router;
