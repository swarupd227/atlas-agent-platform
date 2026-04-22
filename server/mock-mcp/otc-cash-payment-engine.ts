import { Router, type Request, type Response } from "express";

const router = Router();

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Scenario 1: Month-End Batch ──────────────────────────────────────────────

// GET /ingest-payment-batch
router.get("/ingest-payment-batch", async (_req: Request, res: Response) => {
  await delay(1200);
  const now = new Date();
  res.json({
    batch: {
      batch_id:        "BATCH-2026-0328-ME",
      processing_date: now.toISOString().slice(0, 10),
      batch_status:    "INGESTED",
      total_amount:    42_313_847.22,
      total_payments:  387,
      by_channel: [
        { channel: "Wire Transfer", count:  89, amount: 28_741_200.00, pct_of_total: 67.9 },
        { channel: "ACH",           count: 156, amount:  8_920_100.00, pct_of_total: 21.1 },
        { channel: "Check",         count:  87, amount:  3_475_300.00, pct_of_total:  8.2 },
        { channel: "EDI 820",       count:  55, amount:  1_177_247.22, pct_of_total:  2.8 },
      ],
      by_currency: [
        { currency: "USD", count: 374, amount: 41_801_247.22 },
        { currency: "CAD", count:  13, amount:    512_600.00 },
      ],
      top_payments: [
        { customer: "GlobalTech Corp",       wire_ref:  "WF-20260328-7742",   amount: 2_300_847.00, channel: "Wire",  remittance: "EDI 820 attached",   complexity: "HIGH"   },
        { customer: "Meridian Manufacturing", wire_ref:  "WF-20260328-1142",   amount: 1_890_200.00, channel: "Wire",  remittance: "Clean",              complexity: "LOW"    },
        { customer: "CoreTech Systems",       wire_ref:  "WF-20260328-2891",   amount: 1_420_700.00, channel: "Wire",  remittance: "Clean",              complexity: "LOW"    },
        { customer: "Vertex Systems",         ach_ref:   "ACH-2026-0328-0447", amount:   487_200.00, channel: "ACH",   remittance: "Reference mismatch", complexity: "MEDIUM" },
        { customer: "Regional Supply Co",     check_ref: "CHK-2026-77421",     amount:   127_000.00, channel: "Check", remittance: "No remittance data", complexity: "MEDIUM" },
      ],
      ingested_at: now.toISOString(),
    },
  });
});

// POST /run-auto-matching
router.post("/run-auto-matching", async (_req: Request, res: Response) => {
  await delay(2000);
  res.json({
    matching_result: {
      run_id:                "MATCH-2026-0328-ME",
      total_payments:        387,
      total_amount:          42_313_847.22,
      matched_amount:        39_826_847.22,
      matched_payments:      373,
      match_rate_pct:        94.1,
      match_rate_amount_pct: 94.1,
      funnel: [
        { tier: "Perfect Match",            description: "Exact invoice ref + amount + customer",          payments: 298, amount: 31_202_400.00, confidence_floor: 99, color: "green"       },
        { tier: "High-Confidence Match",     description: "Fuzzy name + amount within tolerance",           payments:  52, amount:  8_624_447.22, confidence_floor: 92, color: "light_green" },
        { tier: "Low-Confidence Suggested",  description: "Partial reference match — human confirmation",  payments:  23, amount:  1_796_800.00, confidence_floor: 75, color: "amber"       },
        { tier: "Unmatched",                 description: "No match found — exception queue",              payments:  14, amount:    690_200.00, confidence_floor:  0, color: "red"         },
      ],
      summary_metrics: {
        auto_posted:                 350,
        pending_confirm:              23,
        exception_queue:              14,
        manual_review_amount:   2_487_000.00,
        deductions_identified_amount: 890_200.00,
        deductions_payment_count:     47,
        unidentified_amount:         127_000.00,
        unidentified_count:            3,
      },
      algorithm_version: "NovaTech-CashMatch-v4.2",
      run_time_ms:       2_847,
      completed_at:      new Date().toISOString(),
    },
  });
});

// GET /identify-exceptions
router.get("/identify-exceptions", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    exception_queue: {
      total_exceptions:  14,
      total_amount:     690_200.00,
      high_complexity:   1,
      medium_complexity: 5,
      low_complexity:    8,
      exceptions: [
        {
          rank: 1, customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
          payment_ref: "WF-20260328-7742", amount: 2_300_847.00, channel: "Wire",
          remittance: "EDI 820 — 47 invoices, 3 deduction codes",
          complexity: "HIGH", issue_type: "COMPLEX_MULTI_INVOICE",
          issue_detail: "47 invoices covered, 3 deductions ($50.1K), $38.1K overpayment",
          ai_suggestion: "Parse EDI 820, match all 47 invoices, validate freight claim + early pay discount, flag quantity short for investigation",
          confidence_pct: 99, estimated_resolution: "Seconds with agent deep dive",
          exception_subs: [
            { type: "deduction", label: "Freight Claim -$28,500",      code: "FRGT-DMG", status: "TO_VALIDATE" },
            { type: "deduction", label: "Early Pay Discount -$14,200",  code: "EPD-2PCT", status: "TO_VALIDATE" },
            { type: "deduction", label: "Quantity Short -$7,400",       code: "QTY-SHT",  status: "TO_VALIDATE" },
            { type: "overpay",   label: "Overpayment +$38,100",         code: "OVERPAY",  status: "TO_APPLY"    },
          ],
        },
        {
          rank: 2, customer: "Vertex Systems", customer_id: "CUST-VSYS-022",
          payment_ref: "ACH-2026-0328-0447", amount: 487_200.00, channel: "ACH",
          remittance: "Reference VS-2026-MAR",
          complexity: "MEDIUM", issue_type: "REFERENCE_MISMATCH",
          issue_detail: "ACH memo contains customer PO ref VS-2026-MAR — not matching any open invoice reference. Fuzzy match suggests INV-47210 through INV-47214 ($487.2K total).",
          ai_suggestion: "Auto-match to invoices INV-47210–47214 using customer PO cross-reference; confidence 91%",
          confidence_pct: 91, estimated_resolution: "Auto-confirm available",
          exception_subs: [],
        },
        {
          rank: 3, customer: "Regional Supply Co", customer_id: "CUST-RSC-087",
          payment_ref: "CHK-2026-77421", amount: 127_000.00, channel: "Check",
          remittance: "None",
          complexity: "MEDIUM", issue_type: "NO_REMITTANCE",
          issue_detail: "Check received with no remittance stub or reference. Customer has 8 open invoices totalling $143K. Likely partial payment.",
          ai_suggestion: "Apply to oldest open invoices (INV-45901, INV-45902) — covers $127K; contact customer for remittance confirmation",
          confidence_pct: 72, estimated_resolution: "Contact customer for remittance",
          exception_subs: [],
        },
      ],
      generated_at: new Date().toISOString(),
    },
  });
});

// GET /bank-reconciliation
router.get("/bank-reconciliation", async (_req: Request, res: Response) => {
  await delay(1000);
  res.json({
    reconciliation: {
      period:                  "March 2026",
      period_code:             "2026-03",
      bank_statement_balance:  84_721_447.22,
      gl_cash_balance:         84_697_847.22,
      unreconciled_diff:           23_600.00,
      match_rate_pct:              98.7,
      status:                  "IN_PROGRESS",
      reconciling_items: [
        { type: "timing_difference", description: "Outstanding check CHK-2026-77219 — mailed 3/26",         amount:  8_400.00, expected_clear: "Apr 2" },
        { type: "timing_difference", description: "Outstanding check CHK-2026-77380 — mailed 3/28",         amount:  6_200.00, expected_clear: "Apr 3" },
        { type: "timing_difference", description: "ACH deposit in-transit — received 3/31, bank next day",  amount:  7_800.00, expected_clear: "Apr 1" },
        { type: "timing_difference", description: "Wire WF-20260331-0091 — initiated EOD, bank posts 4/1", amount:  1_200.00, expected_clear: "Apr 1" },
        { type: "error",             description: "Bank charge $1,200 — under investigation (fee dispute)",  amount:  1_200.00, expected_clear: "TBD"   },
      ],
      timing_differences_total: 23_600.00,
      errors_total:              1_200.00,
      certified_at:              null,
      target_certified_by:      "April 3, 2026 17:00 CT",
    },
  });
});

// POST /parse-edi-remittance
router.post("/parse-edi-remittance", async (_req: Request, res: Response) => {
  await delay(1400);
  res.json({
    edi_820: {
      transaction_ref: "EDI820-GT-2026-0328",
      payer: "GlobalTech Corp", payer_id: "CUST-GTECH-001",
      payment_method: "Wire", wire_ref: "WF-20260328-7742",
      payment_date: "2026-03-28", payment_amount: 2_300_847.00,
      remittance_completeness_pct: 99.8, parse_confidence_pct: 99.9,
      invoice_references: {
        count: 47, total_invoiced: 2_372_000.00, total_paid: 2_312_847.00,
        date_range: "INV-44680 through INV-44726",
        sample: [
          { invoice: "INV-44680", amount:  87_400.00, payment_amount:  87_400.00 },
          { invoice: "INV-44710", amount:  42_100.00, payment_amount:  42_100.00 },
          { invoice: "INV-44720", amount:  28_300.00, payment_amount:  28_300.00 },
          { invoice: "INV-44721", amount:  38_200.00, payment_amount:  37_452.00, note: "EPD applied" },
          { invoice: "INV-44722", amount:  32_800.00, payment_amount:  32_148.00, note: "EPD applied" },
          { invoice: "INV-44726", amount:  22_100.00, payment_amount:  22_100.00 },
        ],
      },
      deductions: [
        { seq: 1, code: "FRGT-DMG", description: "Freight damage — carrier claim SHP-77201",                       amount: 28_500.00, reference: "BOL-2026-SHP77201"         },
        { seq: 2, code: "EPD-2PCT", description: "2% early pay discount — INV-44721, INV-44722",                   amount: 14_200.00, reference: "PO-GT-2026-8821 terms 2/10 net 45" },
        { seq: 3, code: "QTY-SHT", description: "Quantity short — 50 units received vs 55 ordered on INV-44705",  amount:  7_400.00, reference: "DR-2026-0318-44705"          },
      ],
      overpayment: { amount: 38_100.00, description: "Remittance total $2,339,047 exceeds correct net; $38,100 applied as overpayment", customer_instruction: "Apply as credit to account" },
      parsed_at: new Date().toISOString(),
    },
  });
});

// POST /match-invoices
router.post("/match-invoices", async (_req: Request, res: Response) => {
  await delay(1600);
  res.json({
    invoice_matching: {
      payment_ref: "WF-20260328-7742", customer: "GlobalTech Corp",
      payment_amount: 2_300_847.00, invoices_matched: 47, invoices_open_total: 47,
      match_confidence_pct: 99.2, match_algorithm: "EDI-820-Reference-Exact",
      waterfall: {
        open_invoices_total: 2_372_000.00, matched_gross: 2_312_847.00,
        deductions_total: 50_100.00, net_after_deductions: 2_262_747.00,
        overpayment: 38_100.00, net_check: 2_300_847.00,
      },
      invoice_sample: [
        { invoice: "INV-44680", original:  87_400.00, applied:  87_400.00, status: "WILL_CLOSE" },
        { invoice: "INV-44705", original:  52_000.00, applied:  44_600.00, status: "DEDUCTION_APPLIED", deduction: "QTY-SHT -$7,400" },
        { invoice: "INV-44721", original:  38_200.00, applied:  37_452.00, status: "DEDUCTION_APPLIED", deduction: "EPD-2PCT -$748" },
        { invoice: "INV-44726", original:  22_100.00, applied:  22_100.00, status: "WILL_CLOSE" },
      ],
      all_invoices_will_close: true,
      matched_at: new Date().toISOString(),
    },
  });
});

// POST /analyze-deductions
router.post("/analyze-deductions", async (_req: Request, res: Response) => {
  await delay(1200);
  res.json({
    deduction_analysis: {
      payment_ref: "WF-20260328-7742", customer: "GlobalTech Corp",
      total_deductions_amount: 50_100.00, deduction_count: 3,
      deductions: [
        {
          seq: 1, code: "FRGT-DMG", label: "Freight Damage Claim", amount: 28_500.00,
          invoice_ref: "General — SHP-77201",
          evidence_found: ["BOL-2026-SHP77201 shows carrier damage notation at delivery", "Carrier DG-Freight confirmed claim #CLM-2026-0298", "POD signed with damage exception"],
          preliminary_validity: "LIKELY_VALID", auto_approve_eligible: true,
          authority_threshold: 50_000.00, required_action: "Confirm damage notation on POD — evidence in system",
        },
        {
          seq: 2, code: "EPD-2PCT", label: "Early Payment Discount", amount: 14_200.00,
          invoice_ref: "INV-44721, INV-44722",
          evidence_found: ["Payment date 2026-03-28, invoice date 2026-03-19 = Day 9", "Contract PO-GT-2026-8821 terms: 2/10 Net 45", "Calculation confirmed: 2% × $710,000 = $14,200"],
          preliminary_validity: "LIKELY_VALID", auto_approve_eligible: true,
          authority_threshold: 50_000.00, required_action: "Verify payment date is within 10-day window — confirmed Day 9",
          calculation_detail: "2% × $710,000 (qualifying invoices) = $14,200 — confirmed correct",
        },
        {
          seq: 3, code: "QTY-SHT", label: "Quantity Short", amount: 7_400.00,
          invoice_ref: "INV-44705",
          evidence_found: ["Delivery receipt DR-2026-0318-44705 shows 50 units received", "Invoice INV-44705 billed for 55 units at $148/unit", "WMS pick record shows 55 units shipped from Chicago DC"],
          preliminary_validity: "NEEDS_INVESTIGATION", auto_approve_eligible: false,
          required_action: "Reconcile 5-unit discrepancy: delivery receipt (50) vs WMS pick (55). Carrier loss-in-transit possible.",
          discrepancy_detail: "5 units × $148 = $740 per unit — total $7,400 deduction. WMS confirms full pick; carrier investigation warranted.",
        },
      ],
      overpayment: {
        amount: 38_100.00, description: "Customer remitted $38,100 more than net invoice + deduction total",
        options: [
          { id: "credit",  label: "Apply as credit to customer account (recommended)", recommended: true  },
          { id: "oldest",  label: "Apply to oldest open invoice",                      recommended: false },
          { id: "refund",  label: "Issue ACH refund to customer",                      recommended: false },
        ],
        customer_instruction: "Customer EDI 820 instructs: apply as credit",
      },
      analyzed_at: new Date().toISOString(),
    },
  });
});

// POST /validate-deductions
router.post("/validate-deductions", async (_req: Request, res: Response) => {
  await delay(1100);
  res.json({
    deduction_validation: {
      payment_ref: "WF-20260328-7742", customer: "GlobalTech Corp",
      validated_at: new Date().toISOString(),
      rulings: [
        {
          seq: 1, code: "FRGT-DMG", label: "Freight Claim — Carrier Damage", amount: 28_500.00,
          verdict: "VALID", confidence_pct: 97,
          rationale: "Carrier damage confirmed. POD #BOL-2026-SHP77201 bears damage notation at delivery. Carrier DG-Freight has acknowledged claim #CLM-2026-0298. Within auto-approve authority ($28.5K < $50K threshold).",
          recommendation: "Accept deduction. File carrier claim #CLM-2026-0298 for recovery. Post to GL 5400-FREIGHT-CLAIMS.",
          action_required: "ACCEPT", gl_account: "5400-FREIGHT-CLAIMS",
        },
        {
          seq: 2, code: "EPD-2PCT", label: "Early Payment Discount", amount: 14_200.00,
          verdict: "VALID", confidence_pct: 99,
          rationale: "Payment received Day 9. Contract PO-GT-2026-8821 specifies 2/10 Net 45 payment terms. Qualifying invoices confirmed ($710,000). Discount calculation correct: 2% × $710,000 = $14,200.",
          recommendation: "Accept deduction. Post to GL 4050-SALES-DISCOUNTS.",
          action_required: "ACCEPT", gl_account: "4050-SALES-DISCOUNTS",
        },
        {
          seq: 3, code: "QTY-SHT", label: "Quantity Short", amount: 7_400.00,
          verdict: "INVESTIGATE", confidence_pct: 45,
          rationale: "Delivery receipt shows 50 units received; WMS pick record confirms 55 units shipped. 5-unit discrepancy ($7,400) is unresolved. Carrier loss-in-transit is plausible but unconfirmed.",
          recommendation: "Hold deduction pending carrier trace. Open carrier investigation with DG-Freight for shipment SHP-77201. Target resolution within 5 business days.",
          action_required: "INVESTIGATE", gl_account: null,
          hold_reason: "WMS vs delivery receipt discrepancy — carrier investigation required",
          escalation_owner: "Freight Claims Team", target_resolution: "April 4, 2026",
        },
      ],
      summary: { accepted_amount: 42_700.00, accepted_count: 2, investigate_amount: 7_400.00, investigate_count: 1, invalid_amount: 0.00, invalid_count: 0 },
    },
  });
});

// POST /apply-resolution
router.post("/apply-resolution", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    resolution_package: {
      payment_ref: "WF-20260328-7742", customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      resolution_id: "RESOL-2026-GT-0328", prepared_by: "OTC-AGT-009",
      prepared_at: new Date().toISOString(),
      requires_human_approval: true,
      approval_reason: "Payment > $1M with deductions — one-click controller confirmation required per SOX controls",
      components: {
        invoice_posting: { invoices_to_close: 47, total_to_post: 2_262_747.00, status: "READY" },
        accepted_deductions: [
          { code: "FRGT-DMG", amount: 28_500.00, gl: "5400-FREIGHT-CLAIMS",  action: "Accept + file carrier claim" },
          { code: "EPD-2PCT", amount: 14_200.00, gl: "4050-SALES-DISCOUNTS", action: "Accept per contract terms" },
        ],
        investigated_deductions: [
          { code: "QTY-SHT", amount: 7_400.00, status: "ON_HOLD", action: "Open carrier trace SHP-77201" },
        ],
        overpayment: { amount: 38_100.00, action: "credit_to_account", credit_memo: "CM-2026-0328-GT", customer_instruction: "Per EDI 820 — apply as credit" },
      },
      ar_impact: { globaltech_ar_before: 3_100_000.00, amount_being_closed: 2_370_000.00, globaltech_ar_after: 730_000.00, invoices_closed: 47, remaining_open: 3 },
      talking_point: "That $2.3M payment covering 47 invoices with 3 deductions and an overpayment? The current team takes 4–6 hours. Atlas matched all 47 invoices in seconds, validated two deductions automatically, flagged one for investigation with evidence, and presented a one-click resolution.",
    },
  });
});

// ─── Scenario 2: Vertex Systems — Fuzzy Reference Match ───────────────────────

// GET /vertex-get-payment
router.get("/vertex-get-payment", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    payment: {
      payment_ref:     "ACH-2026-0328-0447",
      customer:        "Vertex Systems",
      customer_id:     "CUST-VSYS-022",
      amount:          487_200.00,
      channel:         "ACH",
      received_date:   "2026-03-28",
      memo_field:      "VS-2026-MAR",
      bank_account:    "NovaTech Operating — Wells Fargo XXXX-4821",
      status:          "EXCEPTION",
      issue_type:      "REFERENCE_MISMATCH",
      issue_detail:    "ACH memo 'VS-2026-MAR' does not match any open invoice reference in NovaTech AR. Cannot auto-post. Queued for manual review.",
      open_ar: {
        customer_total_open: 512_800.00,
        invoice_count: 7,
        invoices: [
          { ref: "INV-47210", amount:  89_400.00, due: "2026-04-05", days_to_due: 8,  age_bucket: "Current" },
          { ref: "INV-47211", amount:  98_700.00, due: "2026-04-05", days_to_due: 8,  age_bucket: "Current" },
          { ref: "INV-47212", amount: 112_300.00, due: "2026-04-10", days_to_due: 13, age_bucket: "Current" },
          { ref: "INV-47213", amount: 102_800.00, due: "2026-04-10", days_to_due: 13, age_bucket: "Current" },
          { ref: "INV-47214", amount:  84_000.00, due: "2026-04-15", days_to_due: 18, age_bucket: "Current" },
          { ref: "INV-47198", amount:  15_300.00, due: "2026-03-15", days_to_due: -13, age_bucket: "30-day" },
          { ref: "INV-47102", amount:  10_300.00, due: "2026-02-28", days_to_due: -28, age_bucket: "60-day" },
        ],
      },
      customer_po_history: {
        recent_pos: ["VS-2026-JAN", "VS-2026-FEB", "VS-2026-MAR"],
        pattern_note: "Customer uses internal PO month codes as ACH memo reference — this is a known pattern",
      },
    },
  });
});

// POST /vertex-fuzzy-match
router.post("/vertex-fuzzy-match", async (_req: Request, res: Response) => {
  await delay(1800);
  res.json({
    fuzzy_match: {
      payment_ref:     "ACH-2026-0328-0447",
      customer:        "Vertex Systems",
      payment_amount:  487_200.00,
      algorithm:       "PO-Cross-Reference-v3 + Amount-Waterfall",
      run_time_ms:     342,
      result:          "MATCH_FOUND",
      confidence_pct:  91,
      match_method:    "Customer PO month code 'VS-2026-MAR' cross-referenced to March AR invoices. Amount waterfall matches exactly to INV-47210 through INV-47214 ($487.2K total).",
      matched_invoices: [
        { ref: "INV-47210", amount:  89_400.00, status: "WILL_CLOSE", confidence: 91 },
        { ref: "INV-47211", amount:  98_700.00, status: "WILL_CLOSE", confidence: 91 },
        { ref: "INV-47212", amount: 112_300.00, status: "WILL_CLOSE", confidence: 91 },
        { ref: "INV-47213", amount: 102_800.00, status: "WILL_CLOSE", confidence: 91 },
        { ref: "INV-47214", amount:  84_000.00, status: "WILL_CLOSE", confidence: 91 },
      ],
      match_total:     487_200.00,
      variance:        0.00,
      resolution:      "AUTO_CONFIRM_AVAILABLE",
      resolution_note: "91% confidence exceeds NovaTech's 80% auto-confirm threshold. One-click confirmation available for controller. No deductions. No overpayment.",
      remaining_open_after: [
        { ref: "INV-47198", amount: 15_300.00, age_bucket: "30-day" },
        { ref: "INV-47102", amount: 10_300.00, age_bucket: "60-day" },
      ],
    },
  });
});

// POST /vertex-confirm-resolution
router.post("/vertex-confirm-resolution", async (_req: Request, res: Response) => {
  await delay(1000);
  res.json({
    resolution: {
      payment_ref:     "ACH-2026-0328-0447",
      customer:        "Vertex Systems",
      resolution_id:   "RESOL-2026-VS-0328",
      status:          "CONFIRMED",
      confirmed_by:    "OTC-AGT-009",
      confirmed_at:    new Date().toISOString(),
      invoices_to_close: 5,
      amount_to_post:  487_200.00,
      deductions:      0,
      overpayment:     0,
      ready_for_posting: true,
      talking_point:   "Vertex's ACH reference mismatch — which would have sat in a manual queue for hours — resolved in seconds via customer PO cross-reference fuzzy matching. 91% confidence, zero deductions, zero variance.",
    },
  });
});

// ─── Scenario 3: Regional Supply Co — No Remittance ───────────────────────────

// GET /regional-get-payment
router.get("/regional-get-payment", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    payment: {
      payment_ref:     "CHK-2026-77421",
      customer:        "Regional Supply Co",
      customer_id:     "CUST-RSC-087",
      amount:          127_000.00,
      channel:         "Check",
      check_number:    "77421",
      received_date:   "2026-03-28",
      deposited_date:  "2026-03-28",
      remittance:      "NONE",
      status:          "EXCEPTION",
      issue_type:      "NO_REMITTANCE",
      issue_detail:    "Check received with no remittance stub, no memo, no accompanying email. Customer has 8 open invoices totalling $143,200. Payment covers roughly 88.7% of open AR — likely a partial or monthly payment.",
      open_ar: {
        customer_total_open: 143_200.00,
        invoice_count: 8,
        invoices: [
          { ref: "INV-45901", amount:  52_400.00, due: "2026-02-28", days_overdue: 28, age_bucket: "30-day" },
          { ref: "INV-45902", amount:  37_000.00, due: "2026-03-05", days_overdue: 23, age_bucket: "30-day" },
          { ref: "INV-46011", amount:  24_800.00, due: "2026-03-15", days_overdue: 13, age_bucket: "Current" },
          { ref: "INV-46102", amount:  11_200.00, due: "2026-03-20", days_overdue:  8, age_bucket: "Current" },
          { ref: "INV-46201", amount:   8_900.00, due: "2026-04-01", days_overdue: -4, age_bucket: "Current" },
          { ref: "INV-46301", amount:   4_700.00, due: "2026-04-10", days_overdue:-13, age_bucket: "Current" },
          { ref: "INV-46390", amount:   3_100.00, due: "2026-04-15", days_overdue:-18, age_bucket: "Current" },
          { ref: "INV-46401", amount:   1_100.00, due: "2026-04-20", days_overdue:-23, age_bucket: "Current" },
        ],
      },
      payment_history: {
        previous_payments_12mo: 847_200.00,
        avg_payment_amount: 70_600.00,
        on_time_rate_pct: 71.4,
        remittance_provided_rate_pct: 43.0,
        note: "Customer historically provides remittance ~43% of the time. Partial check payments are common.",
      },
    },
  });
});

// POST /regional-suggest-allocation
router.post("/regional-suggest-allocation", async (_req: Request, res: Response) => {
  await delay(1200);
  res.json({
    allocation: {
      payment_ref:    "CHK-2026-77421",
      customer:       "Regional Supply Co",
      payment_amount: 127_000.00,
      method:         "OLDEST_FIRST",
      confidence_pct: 72,
      rationale:      "No remittance provided. Applying NovaTech's default allocation policy: oldest overdue invoices first, then current by due date. This removes $127K from the 30-day aging bucket and prevents further deterioration.",
      suggested_allocation: [
        { ref: "INV-45901", original:  52_400.00, apply: 52_400.00, will_close: true,  age_bucket: "30-day" },
        { ref: "INV-45902", original:  37_000.00, apply: 37_000.00, will_close: true,  age_bucket: "30-day" },
        { ref: "INV-46011", original:  24_800.00, apply: 24_800.00, will_close: true,  age_bucket: "Current" },
        { ref: "INV-46102", original:  11_200.00, apply:  9_100.00, will_close: false, age_bucket: "Current", note: "Partial — $2,100 of $11,200 open remains after payment" },
        { ref: "INV-46201", original:   8_900.00, apply:  0.00,     will_close: false, age_bucket: "Current", note: "Not covered by this payment" },
      ],
      invoices_closed: 3,
      invoices_partial: 1,
      total_applied: 123_300.00,
      unapplied: 3_700.00,
      unapplied_action: "Hold as unapplied credit pending remittance confirmation",
      aging_impact: {
        days_30_before: 89_400.00,
        days_30_after: 0.00,
        ar_reduction: 127_000.00,
      },
      action_required: "PROVISIONAL_APPLY + CHASE_CUSTOMER",
      status:          "PENDING_CONFIRMATION",
    },
  });
});

export default router;
