import { Router } from "express";

const router = Router();

const PP_DEALER_ID   = "PP-2847";
const PP_DEALER_NAME = "Pacific Powersports";

function floorplanStatus() {
  return {
    dealer_id:         PP_DEALER_ID,
    dealer_name:       PP_DEALER_NAME,
    total_units:       23,
    total_balance:     847200,
    next_audit_window: "2026-06-03",
    units: [
      { vin: "1KAWSAKI24ZX61234",  make_model_year: "2024 Kawasaki Ninja ZX-6R",    days_on_floor: 12, balance: 9800,  curtailment_due: "2026-05-30", curtailment_amount: 980,  overdue_flag: false },
      { vin: "1HONDA024CBR11111",  make_model_year: "2024 Honda CBR1000RR-R",        days_on_floor: 47, balance: 18200, curtailment_due: "2026-05-14", curtailment_amount: 1820, overdue_flag: true  },
      { vin: "1YAMA024MT0922222",  make_model_year: "2024 Yamaha MT-09",             days_on_floor: 53, balance: 8600,  curtailment_due: "2026-05-14", curtailment_amount: 860,  overdue_flag: true  },
      { vin: "1SUZU024GSXR33333",  make_model_year: "2024 Suzuki GSX-R750",         days_on_floor: 8,  balance: 10100, curtailment_due: "2026-06-05", curtailment_amount: 1010, overdue_flag: false },
      { vin: "1KAWA024KX45044444", make_model_year: "2024 Kawasaki KX450",          days_on_floor: 21, balance: 7200,  curtailment_due: "2026-05-28", curtailment_amount: 720,  overdue_flag: false },
    ],
  };
}

function unitDetails(vin: string) {
  const units: Record<string, any> = {
    "1KAWSAKI24ZX61234": {
      vin:                  "1KAWSAKI24ZX61234",
      make_model_year:      "2024 Kawasaki Ninja ZX-6R",
      dealer_id:            PP_DEALER_ID,
      original_advance:     10500,
      current_balance:      9800,
      interest_rate:        6.75,
      days_on_floor:        12,
      advance_date:         "2026-05-01",
      next_curtailment:     { date: "2026-05-30", amount: 980 },
      curtailment_schedule: [
        { date: "2026-05-30", amount: 980,  type: "scheduled" },
        { date: "2026-06-30", amount: 980,  type: "scheduled" },
        { date: "2026-07-31", amount: 9800, type: "payoff_window" },
      ],
    },
    "1HONDA024CBR11111": {
      vin:              "1HONDA024CBR11111",
      make_model_year:  "2024 Honda CBR1000RR-R",
      dealer_id:        PP_DEALER_ID,
      original_advance: 19500,
      current_balance:  18200,
      interest_rate:    6.75,
      days_on_floor:    47,
      advance_date:     "2026-03-27",
      next_curtailment: { date: "2026-05-14", amount: 1820 },
    },
  };
  return units[vin] ?? { vin, error: "Unit not found in floorplan" };
}

function payoffQuote(vin: string, dealerId: string, payoffDate: string) {
  const unit    = unitDetails(vin);
  if (unit.error) return unit;
  const balance  = unit.current_balance ?? 9800;
  const rate     = (unit.interest_rate ?? 6.75) / 100 / 365;
  const perDiem  = parseFloat((balance * rate).toFixed(2));
  const days     = 5;
  const accrued  = parseFloat((perDiem * days).toFixed(2));
  const quoteId  = `PQ-${Date.now().toString(36).toUpperCase()}`;
  return {
    vin,
    dealer_id:        dealerId,
    make_model_year:  unit.make_model_year,
    current_balance:  balance,
    per_diem:         perDiem,
    days_to_payoff:   days,
    accrued_interest: accrued,
    total_payoff:     parseFloat((balance + accrued).toFixed(2)),
    payoff_date:      payoffDate || "2026-05-16",
    quote_id:         quoteId,
    quote_expiry:     "2026-05-21",
    wire_instructions: {
      bank:      "Solifi Finance Bank",
      routing:   "021000021",
      account:   "78432900",
      reference: `${vin}-${quoteId}`,
      memo:      `Payoff ${unit.make_model_year} — ${vin}`,
    },
  };
}

function sendPayoffEmail(vin: string, dealerId: string, quoteId: string, recipientEmail: string) {
  return {
    success:         true,
    vin,
    dealer_id:       dealerId,
    quote_id:        quoteId,
    recipient_email: recipientEmail,
    email_status:    "delivered",
    sent_at:         new Date().toISOString(),
    subject:         `Payoff Quote ${quoteId} — ${vin}`,
    message:         `Payoff quote emailed successfully to ${recipientEmail}.`,
    human_gate:      {
      triggered:    true,
      type:         "email_confirmation",
      approved_by:  "Finance Manager Jordan Reeves",
      approved_at:  new Date().toISOString(),
    },
  };
}

function auditSchedule(dealerId: string) {
  return {
    dealer_id:        dealerId,
    dealer_name:      PP_DEALER_NAME,
    next_audit: {
      date:      "2026-06-03",
      type:      "routine",
      cycle:     "quarterly",
      inspector: "Solifi Field Audit Team — Pacific Region",
    },
    days_until_audit: 21,
    required_docs: [
      "Title documents for all financed units on lot",
      "Signed Dealer Floor Plan Agreement (current year)",
      "Insurance certificate (minimum $500K liability)",
      "Lot layout map with unit placements",
      "Payment history printout (last 90 days)",
      "Demo unit log with signed dealer acknowledgement",
    ],
    cycle_rules:         "Routine audits every 90 days. Special audits triggered by: 3+ missed curtailments, balance age > 180 days, or insurer request.",
    absent_unit_policy:  "Units not physically present at time of audit must be logged as SOLD (with buyer info) or DEMO (with signed demo agreement). Demo units absent during audit trigger a 5-business-day cure notice. Repeated absences without documentation may trigger a special audit and curtailment acceleration.",
  };
}

function creditApplicationStatus(dealerId: string, applicationId?: string) {
  const apps = [
    { application_id: "CA-2026-PP-0047", stage: "underwriting", ltv_ratio: 0.82, requested_advance: 14200, unit: "2024 Can-Am Spyder F3-S",   submitted_date: "2026-05-08", next_action: "Awaiting appraisal confirmation from Solifi underwriting" },
    { application_id: "CA-2026-PP-0051", stage: "approved",     ltv_ratio: 0.78, requested_advance: 9600,  unit: "2024 Kawasaki Z900",        submitted_date: "2026-05-10", next_action: "Advance ready — execute floor plan agreement to fund" },
  ];
  if (applicationId) {
    const app = apps.find(a => a.application_id === applicationId);
    return app ? { dealer_id: dealerId, application: app } : { error: "Application not found" };
  }
  return { dealer_id: dealerId, total_applications: apps.length, applications: apps };
}

function paymentHistory(dealerId: string, days: number = 30) {
  const payments = [
    { date: "2026-05-09", amount: 860,   type: "curtailment", vin: "1YAMA024MT0922222", make_model_year: "2024 Yamaha MT-09",         running_balance: 847200 },
    { date: "2026-05-05", amount: 1820,  type: "curtailment", vin: "1HONDA024CBR11111", make_model_year: "2024 Honda CBR1000RR-R",    running_balance: 848060 },
    { date: "2026-04-30", amount: 11400, type: "payoff",      vin: "2HONDA023CRF45678", make_model_year: "2023 Honda CRF450R",        running_balance: 849880 },
    { date: "2026-04-25", amount: 980,   type: "curtailment", vin: "1KAWSAKI24ZX61234", make_model_year: "2024 Kawasaki Ninja ZX-6R", running_balance: 861280 },
    { date: "2026-04-15", amount: 320,   type: "interest",    vin: "account",            make_model_year: "Account Interest",         running_balance: 862260 },
  ];
  return {
    dealer_id:   dealerId,
    period_days: days,
    total_paid:  payments.reduce((s, p) => s + p.amount, 0),
    payments,
  };
}

function searchPolicyKb(query: string, category?: string) {
  const q = (query || "").toLowerCase();
  const entries: any[] = [
    {
      category:    "floorplan",
      title:       "Curtailment Deferral Policy",
      content:     "Curtailment deferrals up to $25,000 may be approved autonomously by the Dealer Experience Hub agent based on unit age and dealer payment history. Requests exceeding $25,000 require review by an assigned Solifi Account Manager within 1 business day. Deferral periods are limited to 30 calendar days. Seasonal inventory exceptions (e.g. snowmobiles, watercraft) are evaluated on a case-by-case basis.",
      match_score: q.includes("curtailment") || q.includes("deferral") || q.includes("threshold") || q.includes("limit") ? 0.97 : 0.1,
    },
    {
      category:    "audit",
      title:       "Absent Unit During Physical Audit",
      content:     "Units not physically present at time of audit must be documented as either SOLD (buyer name, date, Bill of Sale reference) or DEMO (signed Demo Unit Agreement, driver ID, return date). Demo units absent during audit trigger a 5-business-day cure notice. Units absent without documentation are flagged as UNLOCATED — the dealer receives a curtailment acceleration notice and must resolve within 10 business days or a special audit is scheduled.",
      match_score: q.includes("absent") || q.includes("not present") || q.includes("demo unit") || q.includes("locate") || q.includes("lot") ? 0.96 : 0.1,
    },
    {
      category:    "payoff",
      title:       "Payoff Quote Validity and Wire Instructions",
      content:     "Payoff quotes are valid for 5 business days from generation. Per-diem interest accrues daily based on the outstanding principal at the note rate. Wire transfers must reference the quote ID and VIN in the memo field. Payoffs received after quote expiry will be applied at the current rate but may require a new quote for exact calculation. ACH payoffs have a 1-business-day settlement delay.",
      match_score: q.includes("payoff") || q.includes("quote") || q.includes("wire") || q.includes("per diem") ? 0.94 : 0.1,
    },
    {
      category:    "floorplan",
      title:       "Overdue Unit Curtailment Process",
      content:     "Units flagged as overdue (past expected sale date by 15+ days) receive automated curtailment notices at days 15, 30, and 45. At day 60, the account manager is notified and a payment plan discussion is initiated. Dealers with strong payment history (< 2 late payments in 12 months) may qualify for a 7-day automatic grace extension. Curtailment amounts are calculated at 10% of the original advance.",
      match_score: q.includes("overdue") || q.includes("late") || q.includes("flag") ? 0.92 : 0.1,
    },
  ];
  const filtered = entries
    .filter(e => !category || e.category === category || e.match_score > 0.5)
    .filter(e => e.match_score > 0.2)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3);
  return { query, category, results: filtered, total_results: filtered.length };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/get-floorplan-status", (req, res) => {
  res.json(floorplanStatus());
});

router.get("/get-unit-details", (req, res) => {
  const vin = (req.query.vin as string) || "";
  res.json(unitDetails(vin));
});

router.post("/get-payoff-quote", (req, res) => {
  const { vin, dealer_id, payoff_date } = req.body || {};
  res.json(payoffQuote(vin || "", dealer_id || PP_DEALER_ID, payoff_date || ""));
});

router.post("/send-payoff-email", (req, res) => {
  const { vin, dealer_id, quote_id, recipient_email } = req.body || {};
  res.json(sendPayoffEmail(vin || "", dealer_id || PP_DEALER_ID, quote_id || "", recipient_email || ""));
});

router.get("/get-audit-schedule", (req, res) => {
  const dealerId = (req.query.dealer_id as string) || PP_DEALER_ID;
  res.json(auditSchedule(dealerId));
});

router.get("/get-credit-application-status", (req, res) => {
  const dealerId      = (req.query.dealer_id as string) || PP_DEALER_ID;
  const applicationId = (req.query.application_id as string) || undefined;
  res.json(creditApplicationStatus(dealerId, applicationId));
});

router.get("/get-payment-history", (req, res) => {
  const dealerId = (req.query.dealer_id as string) || PP_DEALER_ID;
  const days     = parseInt((req.query.days as string) || "30", 10);
  res.json(paymentHistory(dealerId, days));
});

router.get("/search-dealer-policy-kb", (req, res) => {
  const query    = (req.query.query as string) || "";
  const category = (req.query.category as string) || undefined;
  res.json(searchPolicyKb(query, category));
});

export default router;
