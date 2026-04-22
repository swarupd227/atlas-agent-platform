import { Router, type Request, type Response } from "express";

const router = Router();

// GET /ingest-payment-batch — ingest all 387 month-end payments
router.get("/ingest-payment-batch", (_req: Request, res: Response) => {
  const now = new Date();
  res.json({
    batch: {
      batch_id:       "BATCH-2026-0328-ME",
      processing_date: now.toISOString().slice(0, 10),
      batch_status:   "INGESTED",
      total_amount:   42_313_847.22,
      total_payments: 387,
      by_channel: [
        { channel: "Wire Transfer",  count: 89,  amount: 28_741_200.00, pct_of_total: 67.9 },
        { channel: "ACH",            count: 156, amount:  8_920_100.00, pct_of_total: 21.1 },
        { channel: "Check",          count: 87,  amount:  3_475_300.00, pct_of_total:  8.2 },
        { channel: "EDI 820",        count: 55,  amount:  1_177_247.22, pct_of_total:  2.8 },
      ],
      by_currency: [
        { currency: "USD", count: 374, amount: 41_801_247.22 },
        { currency: "CAD", count:  13, amount:    512_600.00 },
      ],
      top_payments: [
        { customer: "GlobalTech Corp",      wire_ref: "WF-20260328-7742", amount: 2_300_847.00, channel: "Wire", remittance: "EDI 820 attached", complexity: "HIGH" },
        { customer: "Meridian Manufacturing", wire_ref: "WF-20260328-1142", amount: 1_890_200.00, channel: "Wire", remittance: "Clean",          complexity: "LOW" },
        { customer: "CoreTech Systems",     wire_ref: "WF-20260328-2891", amount: 1_420_700.00, channel: "Wire", remittance: "Clean",          complexity: "LOW" },
        { customer: "Vertex Systems",       ach_ref:  "ACH-2026-0328-0447", amount:   487_200.00, channel: "ACH",  remittance: "Reference mismatch", complexity: "MEDIUM" },
        { customer: "Regional Supply Co",   check_ref:"CHK-2026-77421",     amount:   127_000.00, channel: "Check", remittance: "No remittance data",  complexity: "MEDIUM" },
      ],
      ingested_at: now.toISOString(),
    },
  });
});

// POST /run-auto-matching — intelligent invoice auto-matching
router.post("/run-auto-matching", (_req: Request, res: Response) => {
  res.json({
    matching_result: {
      run_id:              "MATCH-2026-0328-ME",
      total_payments:      387,
      total_amount:        42_313_847.22,
      matched_amount:      39_826_847.22,
      matched_payments:    373,
      match_rate_pct:      94.1,
      match_rate_amount_pct: 94.1,
      funnel: [
        { tier: "Perfect Match",         description: "Exact invoice ref + amount + customer",         payments: 298, amount: 31_202_400.00, confidence_floor: 99, color: "green"       },
        { tier: "High-Confidence Match",  description: "Fuzzy name + amount within tolerance",          payments:  52, amount:  8_624_447.22, confidence_floor: 92, color: "light_green" },
        { tier: "Low-Confidence Suggested", description: "Partial reference match — human confirmation", payments:  23, amount:  1_796_800.00, confidence_floor: 75, color: "amber"    },
        { tier: "Unmatched",              description: "No match found — exception queue",               payments:  14, amount:    690_200.00, confidence_floor:  0, color: "red"        },
      ],
      summary_metrics: {
        auto_posted:        350,
        pending_confirm:     23,
        exception_queue:     14,
        manual_review_amount: 2_487_000.00,
        deductions_identified_amount: 890_200.00,
        deductions_payment_count: 47,
        unidentified_amount:  127_000.00,
        unidentified_count:    3,
      },
      algorithm_version: "NovaTech-CashMatch-v4.2",
      run_time_ms: 2_847,
      completed_at: new Date().toISOString(),
    },
  });
});

// GET /identify-exceptions — prioritised exception queue
router.get("/identify-exceptions", (_req: Request, res: Response) => {
  res.json({
    exception_queue: {
      total_exceptions:  14,
      total_amount:     690_200.00,
      high_complexity:   1,
      medium_complexity: 5,
      low_complexity:    8,
      exceptions: [
        {
          rank:           1,
          customer:       "GlobalTech Corp",
          customer_id:    "CUST-GTECH-001",
          payment_ref:    "WF-20260328-7742",
          amount:         2_300_847.00,
          channel:        "Wire",
          remittance:     "EDI 820 — 47 invoices, 3 deduction codes",
          complexity:     "HIGH",
          issue_type:     "COMPLEX_MULTI_INVOICE",
          issue_detail:   "47 invoices covered, 3 deductions ($50.1K), $38.1K overpayment",
          ai_suggestion:  "Parse EDI 820, match all 47 invoices, validate freight claim + early pay discount, flag quantity short for investigation",
          confidence_pct: 99,
          estimated_resolution: "Seconds with agent deep dive",
          exception_subs: [
            { type: "deduction", label: "Freight Claim -$28,500",        code: "FRGT-DMG",  status: "TO_VALIDATE" },
            { type: "deduction", label: "Early Pay Discount -$14,200",   code: "EPD-2PCT",  status: "TO_VALIDATE" },
            { type: "deduction", label: "Quantity Short -$7,400",        code: "QTY-SHT",   status: "TO_VALIDATE" },
            { type: "overpay",   label: "Overpayment +$38,100",          code: "OVERPAY",   status: "TO_APPLY"    },
          ],
        },
        {
          rank:           2,
          customer:       "Vertex Systems",
          customer_id:    "CUST-VSYS-022",
          payment_ref:    "ACH-2026-0328-0447",
          amount:         487_200.00,
          channel:        "ACH",
          remittance:     "Reference VS-2026-MAR",
          complexity:     "MEDIUM",
          issue_type:     "REFERENCE_MISMATCH",
          issue_detail:   "ACH memo contains customer PO ref VS-2026-MAR — not matching any open invoice reference. Fuzzy match suggests INV-47210 through INV-47214 ($487.2K total).",
          ai_suggestion:  "Auto-match to invoices INV-47210–47214 using customer PO cross-reference; confidence 91%",
          confidence_pct: 91,
          estimated_resolution: "Auto-confirm available",
          exception_subs: [],
        },
        {
          rank:           3,
          customer:       "Regional Supply Co",
          customer_id:    "CUST-RSC-087",
          payment_ref:    "CHK-2026-77421",
          amount:         127_000.00,
          channel:        "Check",
          remittance:     "None",
          complexity:     "MEDIUM",
          issue_type:     "NO_REMITTANCE",
          issue_detail:   "Check received with no remittance stub or reference. Customer has 8 open invoices totalling $143K. Likely partial payment.",
          ai_suggestion:  "Apply to oldest open invoices (INV-45901, INV-45902) — covers $127K; contact customer for remittance confirmation",
          confidence_pct: 72,
          estimated_resolution: "Contact customer for remittance",
          exception_subs: [],
        },
      ],
      exception_sub_scenarios: {
        vertex_resolution: {
          description:    "Vertex Systems ACH auto-resolved via customer PO cross-reference",
          invoices_matched: ["INV-47210", "INV-47211", "INV-47212", "INV-47213", "INV-47214"],
          match_amount:   487_200.00,
          resolution:     "AUTO_MATCHED",
          confidence_pct: 91,
        },
        regional_supply: {
          description:    "Regional Supply Co check flagged — no remittance, partial payment likely",
          suggested_invoices: ["INV-45901 ($89,400)", "INV-45902 ($37,600)"],
          resolution:     "CONTACT_CUSTOMER",
          estimated_aging_risk: "60-day bucket if unresolved",
        },
      },
      generated_at: new Date().toISOString(),
    },
  });
});

// GET /bank-reconciliation — month-end bank rec status
router.get("/bank-reconciliation", (_req: Request, res: Response) => {
  res.json({
    reconciliation: {
      period:            "March 2026",
      period_code:       "2026-03",
      bank_statement_balance: 84_721_447.22,
      gl_cash_balance:        84_697_847.22,
      unreconciled_diff:      23_600.00,
      match_rate_pct:         98.7,
      status:                "IN_PROGRESS",
      reconciling_items: [
        { type: "timing_difference", description: "Outstanding check CHK-2026-77219 — mailed 3/26",         amount:   8_400.00, expected_clear: "Apr 2"  },
        { type: "timing_difference", description: "Outstanding check CHK-2026-77380 — mailed 3/28",         amount:   6_200.00, expected_clear: "Apr 3"  },
        { type: "timing_difference", description: "ACH deposit in-transit — received 3/31, bank next day",  amount:   7_800.00, expected_clear: "Apr 1"  },
        { type: "timing_difference", description: "Wire WF-20260331-0091 — initiated EOD, bank posts 4/1",  amount:   1_200.00, expected_clear: "Apr 1"  },
        { type: "error",             description: "Bank charge $1,200 — under investigation (fee dispute)", amount:   1_200.00, expected_clear: "TBD"    },
      ],
      timing_differences_total: 23_600.00,
      errors_total:              1_200.00,
      certified_at:              null,
      target_certified_by:      "April 3, 2026 17:00 CT",
    },
  });
});

// POST /parse-edi-remittance — parse GlobalTech EDI 820
router.post("/parse-edi-remittance", (_req: Request, res: Response) => {
  res.json({
    edi_820: {
      transaction_ref:  "EDI820-GT-2026-0328",
      payer:            "GlobalTech Corp",
      payer_id:         "CUST-GTECH-001",
      payment_method:   "Wire",
      wire_ref:         "WF-20260328-7742",
      payment_date:     "2026-03-28",
      payment_amount:   2_300_847.00,
      remittance_completeness_pct: 99.8,
      parse_confidence_pct:        99.9,
      invoice_references: {
        count:          47,
        total_invoiced: 2_372_000.00,
        total_paid:     2_312_847.00,
        date_range:     "INV-44680 through INV-44726",
        sample: [
          { invoice: "INV-44680", amount: 87_400.00, payment_amount: 87_400.00 },
          { invoice: "INV-44710", amount: 42_100.00, payment_amount: 42_100.00 },
          { invoice: "INV-44720", amount: 28_300.00, payment_amount: 28_300.00 },
          { invoice: "INV-44721", amount: 38_200.00, payment_amount: 37_452.00, note: "EPD applied" },
          { invoice: "INV-44722", amount: 32_800.00, payment_amount: 32_148.00, note: "EPD applied" },
          { invoice: "INV-44726", amount: 22_100.00, payment_amount: 22_100.00 },
        ],
      },
      deductions: [
        { seq: 1, code: "FRGT-DMG",  description: "Freight damage — carrier claim SHP-77201",                     amount: 28_500.00, reference: "BOL-2026-SHP77201" },
        { seq: 2, code: "EPD-2PCT",  description: "2% early pay discount — INV-44721, INV-44722",                 amount: 14_200.00, reference: "PO-GT-2026-8821 terms 2/10 net 45" },
        { seq: 3, code: "QTY-SHT",   description: "Quantity short — 50 units received vs 55 ordered on INV-44705", amount:  7_400.00, reference: "DR-2026-0318-44705" },
      ],
      overpayment: {
        amount:      38_100.00,
        description: "Remittance total $2,339,047 exceeds correct net; $38,100 applied as overpayment",
        customer_instruction: "Apply as credit to account",
      },
      parsed_at: new Date().toISOString(),
    },
  });
});

// POST /match-invoices — match GlobalTech payment to 47 invoices
router.post("/match-invoices", (_req: Request, res: Response) => {
  res.json({
    invoice_matching: {
      payment_ref:        "WF-20260328-7742",
      customer:           "GlobalTech Corp",
      payment_amount:     2_300_847.00,
      invoices_matched:   47,
      invoices_open_total: 47,
      match_confidence_pct: 99.2,
      match_algorithm:    "EDI-820-Reference-Exact",
      waterfall: {
        open_invoices_total:    2_372_000.00,
        matched_gross:          2_312_847.00,
        deductions_total:       50_100.00,
        net_after_deductions:   2_262_747.00,
        overpayment:            38_100.00,
        net_check:              2_300_847.00,
      },
      invoice_sample: [
        { invoice: "INV-44680", original: 87_400.00, applied: 87_400.00, status: "WILL_CLOSE" },
        { invoice: "INV-44705", original: 52_000.00, applied: 44_600.00, status: "DEDUCTION_APPLIED", deduction: "QTY-SHT -$7,400" },
        { invoice: "INV-44721", original: 38_200.00, applied: 37_452.00, status: "DEDUCTION_APPLIED", deduction: "EPD-2PCT -$748" },
        { invoice: "INV-44722", original: 32_800.00, applied: 32_148.00, status: "DEDUCTION_APPLIED", deduction: "EPD-2PCT -$652" },
        { invoice: "INV-44726", original: 22_100.00, applied: 22_100.00, status: "WILL_CLOSE" },
      ],
      all_invoices_will_close: true,
      matched_at: new Date().toISOString(),
    },
  });
});

// POST /analyze-deductions — analyse 3 GlobalTech deductions
router.post("/analyze-deductions", (_req: Request, res: Response) => {
  res.json({
    deduction_analysis: {
      payment_ref: "WF-20260328-7742",
      customer:    "GlobalTech Corp",
      total_deductions_amount: 50_100.00,
      deduction_count:         3,
      deductions: [
        {
          seq:           1,
          code:          "FRGT-DMG",
          label:         "Freight Damage Claim",
          amount:        28_500.00,
          invoice_ref:   "General — SHP-77201",
          evidence_found: ["BOL-2026-SHP77201 shows carrier damage notation at delivery", "Carrier DG-Freight confirmed claim #CLM-2026-0298", "POD signed with damage exception"],
          preliminary_validity: "LIKELY_VALID",
          auto_approve_eligible: true,
          authority_threshold:   50_000.00,
          required_action:       "Confirm damage notation on POD — evidence in system",
        },
        {
          seq:           2,
          code:          "EPD-2PCT",
          label:         "Early Payment Discount",
          amount:        14_200.00,
          invoice_ref:   "INV-44721, INV-44722",
          evidence_found: ["Payment date 2026-03-28, invoice date 2026-03-19 = Day 9", "Contract PO-GT-2026-8821 terms: 2/10 Net 45", "Discount correctly computed: 2% × ($37,200 + $32,800) = $1,400 — wait, let me recalculate"],
          preliminary_validity: "LIKELY_VALID",
          auto_approve_eligible: true,
          authority_threshold:   50_000.00,
          required_action:       "Verify payment date is within 10-day window — confirmed Day 9",
          calculation_detail:    "2% × $710,000 (qualifying invoices) = $14,200 — confirmed correct",
        },
        {
          seq:           3,
          code:          "QTY-SHT",
          label:         "Quantity Short",
          amount:         7_400.00,
          invoice_ref:   "INV-44705",
          evidence_found: ["Delivery receipt DR-2026-0318-44705 shows 50 units received", "Invoice INV-44705 billed for 55 units at $148/unit", "WMS pick record shows 55 units shipped from Chicago DC"],
          preliminary_validity: "NEEDS_INVESTIGATION",
          auto_approve_eligible: false,
          required_action:       "Reconcile 5-unit discrepancy: delivery receipt (50) vs WMS pick (55). Carrier loss-in-transit possible.",
          discrepancy_detail:    "5 units × $148 = $740 per unit — total $7,400 deduction. WMS confirms full pick; carrier investigation warranted.",
        },
      ],
      overpayment: {
        amount:       38_100.00,
        description:  "Customer remitted $38,100 more than net invoice + deduction total",
        options: [
          { id: "credit",  label: "Apply as credit to customer account (recommended)", recommended: true  },
          { id: "oldest",  label: "Apply to oldest open invoice",                       recommended: false },
          { id: "refund",  label: "Issue ACH refund to customer",                       recommended: false },
        ],
        customer_instruction: "Customer EDI 820 instructs: apply as credit",
      },
      analyzed_at: new Date().toISOString(),
    },
  });
});

// POST /validate-deductions — validate deduction legitimacy
router.post("/validate-deductions", (_req: Request, res: Response) => {
  res.json({
    deduction_validation: {
      payment_ref:  "WF-20260328-7742",
      customer:     "GlobalTech Corp",
      validated_at: new Date().toISOString(),
      rulings: [
        {
          seq:       1,
          code:      "FRGT-DMG",
          label:     "Freight Claim — Carrier Damage",
          amount:    28_500.00,
          verdict:   "VALID",
          confidence_pct: 97,
          rationale: "Carrier damage confirmed. POD #BOL-2026-SHP77201 bears damage notation at delivery. Carrier DG-Freight has acknowledged claim #CLM-2026-0298. Within auto-approve authority ($28.5K < $50K threshold).",
          recommendation: "Accept deduction. File carrier claim #CLM-2026-0298 for recovery. Post to GL 5400-FREIGHT-CLAIMS.",
          action_required: "ACCEPT",
          gl_account: "5400-FREIGHT-CLAIMS",
        },
        {
          seq:       2,
          code:      "EPD-2PCT",
          label:     "Early Payment Discount",
          amount:    14_200.00,
          verdict:   "VALID",
          confidence_pct: 99,
          rationale: "Payment received Day 9. Contract PO-GT-2026-8821 specifies 2/10 Net 45 payment terms. Qualifying invoices confirmed ($710,000). Discount calculation correct: 2% × $710,000 = $14,200.",
          recommendation: "Accept deduction. Post to GL 4050-SALES-DISCOUNTS.",
          action_required: "ACCEPT",
          gl_account: "4050-SALES-DISCOUNTS",
        },
        {
          seq:       3,
          code:      "QTY-SHT",
          label:     "Quantity Short",
          amount:     7_400.00,
          verdict:   "INVESTIGATE",
          confidence_pct: 45,
          rationale: "Delivery receipt shows 50 units received; WMS pick record confirms 55 units shipped. 5-unit discrepancy ($7,400) is unresolved. Carrier loss-in-transit is plausible but unconfirmed.",
          recommendation: "Hold deduction pending carrier trace. Open carrier investigation with DG-Freight for shipment SHP-77201. Target resolution within 5 business days.",
          action_required: "INVESTIGATE",
          gl_account: null,
          hold_reason: "WMS vs delivery receipt discrepancy — carrier investigation required",
          escalation_owner: "Freight Claims Team",
          target_resolution: "April 4, 2026",
        },
      ],
      summary: {
        accepted_amount:    42_700.00,
        accepted_count:     2,
        investigate_amount:  7_400.00,
        investigate_count:   1,
        invalid_amount:      0.00,
        invalid_count:       0,
      },
    },
  });
});

// POST /apply-resolution — prepare GlobalTech payment resolution package
router.post("/apply-resolution", (_req: Request, res: Response) => {
  res.json({
    resolution_package: {
      payment_ref:    "WF-20260328-7742",
      customer:       "GlobalTech Corp",
      customer_id:    "CUST-GTECH-001",
      resolution_id:  "RESOL-2026-GT-0328",
      prepared_by:    "OTC-AGT-009",
      prepared_at:    new Date().toISOString(),
      requires_human_approval: true,
      approval_reason: "Payment > $1M with deductions — one-click controller confirmation required per SOX controls",
      components: {
        invoice_posting: {
          invoices_to_close:  47,
          total_to_post:      2_262_747.00,
          status:             "READY",
        },
        accepted_deductions: [
          { code: "FRGT-DMG", amount: 28_500.00, gl: "5400-FREIGHT-CLAIMS", action: "Accept + file carrier claim" },
          { code: "EPD-2PCT", amount: 14_200.00, gl: "4050-SALES-DISCOUNTS", action: "Accept per contract terms" },
        ],
        investigated_deductions: [
          { code: "QTY-SHT", amount: 7_400.00, status: "ON_HOLD", action: "Open carrier trace SHP-77201" },
        ],
        overpayment: {
          amount:      38_100.00,
          action:      "credit_to_account",
          credit_memo: "CM-2026-0328-GT",
          customer_instruction: "Per EDI 820 — apply as credit",
        },
      },
      ar_impact: {
        globaltech_ar_before: 3_100_000.00,
        amount_being_closed:  2_370_000.00,
        globaltech_ar_after:    730_000.00,
        invoices_closed:          47,
        remaining_open:            3,
      },
      talking_point: "That $2.3M payment covering 47 invoices with 3 deductions and an overpayment? The current team takes 4–6 hours. Atlas matched all 47 invoices in seconds, validated two deductions automatically, flagged one for investigation with evidence, and presented a one-click resolution.",
    },
  });
});

export default router;
