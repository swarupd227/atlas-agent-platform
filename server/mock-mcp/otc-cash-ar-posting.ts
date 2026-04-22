import { Router, type Request, type Response } from "express";

const router = Router();

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Scenario 1: GlobalTech AR Posting ───────────────────────────────────────

// POST /validate-policy
router.post("/validate-policy", async (_req: Request, res: Response) => {
  await delay(1100);
  res.json({
    policy_validation: {
      payment_ref:   "WF-20260328-7742",
      customer:      "GlobalTech Corp",
      validated_at:  new Date().toISOString(),
      policy_matrix: "NovaTech Deduction Authority Matrix v3.1 (SOX-compliant)",
      rulings: [
        {
          code: "FRGT-DMG", amount: 28_500.00, policy_ruling: "AUTO_APPROVE",
          policy_basis:  "Freight claims ≤$50K with carrier POD damage notation auto-approved per Section 4.2",
          documentation: ["BOL-2026-SHP77201 (damage noted)", "Carrier claim #CLM-2026-0298"],
          posting_gl:    "5400-FREIGHT-CLAIMS", recoverable: true,
          recovery_action: "File carrier claim for $28,500 recovery",
        },
        {
          code: "EPD-2PCT", amount: 14_200.00, policy_ruling: "AUTO_APPROVE",
          policy_basis:  "Early pay discounts auto-approved when: (1) payment within discount window, (2) contract terms confirmed, (3) calculation verified. All three met.",
          documentation: ["PO-GT-2026-8821 (2/10 Net 45)", "Payment timestamp confirms Day 9"],
          posting_gl:    "4050-SALES-DISCOUNTS", recoverable: false, recovery_action: null,
        },
        {
          code: "QTY-SHT", amount: 7_400.00, policy_ruling: "HOLD_PENDING_INVESTIGATION",
          policy_basis:  "Short-ship deductions require WMS-delivery receipt reconciliation. WMS shows 55 shipped, DR shows 50 received. Cannot approve until carrier trace complete.",
          documentation: ["DR-2026-0318-44705 (50 units)", "WMS pick record #PICK-CHI-2026-0318 (55 units)"],
          posting_gl:    null, recoverable: "TBD",
          recovery_action: "Open carrier trace with DG-Freight — target resolution April 4, 2026",
        },
      ],
      overall_status: "PROCEED_WITH_PARTIAL",
      proceed_amount: 42_700.00,
      hold_amount:     7_400.00,
    },
  });
});

// POST /post-ar-entries
router.post("/post-ar-entries", async (_req: Request, res: Response) => {
  await delay(1800);
  res.json({
    ar_posting: {
      posting_id: "JE-2026-CA-0328-GT", payment_ref: "WF-20260328-7742",
      customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      posted_at: new Date().toISOString(), posted_by: "OTC-AGT-006",
      journal_entries: [
        { je_ref: "JE-001", type: "CASH_RECEIPT",       debit_account: "1000-BANK-OPERATING",  credit_account: "1200-ACCOUNTS-RECEIVABLE", amount: 2_262_747.00, description: "Cash receipt — GlobalTech Corp wire WF-20260328-7742 — 47 invoices" },
        { je_ref: "JE-002", type: "DEDUCTION_FREIGHT",  debit_account: "5400-FREIGHT-CLAIMS",  credit_account: "1200-ACCOUNTS-RECEIVABLE", amount:    28_500.00, description: "Freight damage deduction — carrier claim CLM-2026-0298 — BOL-SHP77201" },
        { je_ref: "JE-003", type: "DEDUCTION_DISCOUNT", debit_account: "4050-SALES-DISCOUNTS", credit_account: "1200-ACCOUNTS-RECEIVABLE", amount:    14_200.00, description: "Early pay discount 2% — INV-44721/44722 — PO-GT-2026-8821 2/10N45" },
        { je_ref: "JE-004", type: "CREDIT_MEMO",        debit_account: "1200-ACCOUNTS-RECEIVABLE", credit_account: "2500-CUSTOMER-CREDITS", amount:    38_100.00, description: "Credit memo CM-2026-0328-GT — overpayment credit to CUST-GTECH-001" },
      ],
      posting_summary: { total_posted: 2_262_747.00, deductions_posted: 42_700.00, credit_memo_posted: 38_100.00, on_hold: 7_400.00, on_hold_reason: "QTY-SHT deduction pending carrier investigation" },
      audit_trail: {
        approval_reference: "CTRL-APPR-2026-0328-007",
        approved_by:        "Treasury Controller (one-click confirmation)",
        sox_control:        "SOX-CA-001 — Dual authorization for AR postings > $1M",
        posting_system:     "NovaTech ERP — AR Module v8.4.1",
      },
      status: "POSTED",
    },
  });
});

// POST /generate-credit-memo
router.post("/generate-credit-memo", async (_req: Request, res: Response) => {
  await delay(900);
  res.json({
    credit_memo: {
      credit_memo_id: "CM-2026-0328-GT", customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      amount: 38_100.00, currency: "USD",
      reason: "Overpayment on wire WF-20260328-7742", source_payment: "WF-20260328-7742",
      memo_date: new Date().toISOString().slice(0, 10), expiry_date: "2027-03-28",
      status: "ISSUED",
      application_instructions: "Available for automatic application to next invoice(s) for GlobalTech Corp",
      approved_by:   "OTC-AGT-006 (autonomous — credit memo < $50K)",
      approval_basis: "Credit Memo Authority Matrix Section 2.1 — overpayment credits auto-approved",
      generated_at:  new Date().toISOString(),
    },
  });
});

// POST /close-invoices
router.post("/close-invoices", async (_req: Request, res: Response) => {
  await delay(1500);
  res.json({
    invoice_closure: {
      batch_id: "CLOSE-2026-GT-0328", customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      invoices_closed: 47, total_closed: 2_312_847.00,
      closed_at: new Date().toISOString(), closed_by: "OTC-AGT-006",
      sample_invoices: [
        { invoice: "INV-44680", original:  87_400.00, closed_amount:  87_400.00, status: "CLOSED-PAID" },
        { invoice: "INV-44705", original:  52_000.00, closed_amount:  44_600.00, status: "CLOSED-PAID", note: "QTY-SHT deduction on hold" },
        { invoice: "INV-44721", original:  38_200.00, closed_amount:  37_452.00, status: "CLOSED-PAID" },
        { invoice: "INV-44726", original:  22_100.00, closed_amount:  22_100.00, status: "CLOSED-PAID" },
      ],
      erp_confirmation: {
        system:    "NovaTech ERP — AR Module",
        batch_ref: "ERP-CLOSE-2026-0328-GT",
        asc_606:   "Revenue recognition confirmed — ship-and-bill treatment validated for all 47 invoices",
      },
      customer_balance_update: { balance_before: 3_100_000.00, closed_this_run: 2_370_000.00, balance_after: 730_000.00, remaining_open: 3 },
    },
  });
});

// GET /ar-aging-impact
router.get("/ar-aging-impact", async (_req: Request, res: Response) => {
  await delay(800);
  res.json({
    ar_aging_impact: {
      customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      calculated_at: new Date().toISOString(),
      before_posting: { total_open: 3_100_000.00, current: 1_900_000.00, days_30: 720_000.00, days_60: 340_000.00, days_90_plus: 140_000.00 },
      after_posting:  { total_open:   730_000.00, current:   730_000.00, days_30:       0.00, days_60:       0.00, days_90_plus:       0.00 },
      impact: { ar_reduction: 2_370_000.00, dso_improvement_days: 4.2, invoices_cleared: 47, aging_risk_eliminated: true },
      company_wide_impact: { total_ar_before: 42_313_847.22, total_posted_today: 39_826_847.22, total_ar_after: 2_487_000.00, match_rate_achieved: 94.1, manual_remaining: 2_487_000.00 },
    },
  });
});

// GET /customer-ar-summary
router.get("/customer-ar-summary", async (_req: Request, res: Response) => {
  await delay(700);
  res.json({
    customer_ar_summary: {
      customer: "GlobalTech Corp", customer_id: "CUST-GTECH-001",
      segment: "Fortune 100 — Strategic Account",
      credit_limit: 5_000_000.00, current_balance: 730_000.00, available_credit: 4_270_000.00, credit_status: "GOOD",
      payment_history: { on_time_rate_pct: 94.2, average_days_to_pay: 8.7, last_12_months_volume: 28_400_000.00, deduction_rate_pct: 2.1 },
      open_invoices: [
        { invoice: "INV-44840", amount: 312_000.00, due: "2026-04-15", days_to_due: 18, status: "CURRENT" },
        { invoice: "INV-44892", amount: 248_000.00, due: "2026-04-22", days_to_due: 25, status: "CURRENT" },
        { invoice: "INV-44930", amount: 170_000.00, due: "2026-04-30", days_to_due: 33, status: "CURRENT" },
      ],
      credit_memos: [
        { memo: "CM-2026-0328-GT", amount: 38_100.00, available_until: "2027-03-28", status: "AVAILABLE" },
      ],
      deduction_history: { ytd_deductions: 92_400.00, ytd_accepted: 78_200.00, ytd_invalid_recovered: 14_200.00, open_disputes: 0 },
      next_collection_action: null,
      account_manager: "Jennifer Walsh",
      relationship_tier: "Tier 1 — Dedicated AM",
    },
  });
});

// ─── Scenario 2: Vertex AR Posting ────────────────────────────────────────────

// POST /vertex-post-payment
router.post("/vertex-post-payment", async (_req: Request, res: Response) => {
  await delay(1500);
  res.json({
    ar_posting: {
      posting_id:   "JE-2026-CA-0328-VS",
      payment_ref:  "ACH-2026-0328-0447",
      customer:     "Vertex Systems",
      customer_id:  "CUST-VSYS-022",
      posted_at:    new Date().toISOString(),
      posted_by:    "OTC-AGT-006",
      match_basis:  "Fuzzy PO cross-reference — OTC-AGT-009 confidence 91%",
      journal_entries: [
        { je_ref: "JE-001", type: "CASH_RECEIPT", debit_account: "1000-BANK-OPERATING", credit_account: "1200-ACCOUNTS-RECEIVABLE", amount: 487_200.00, description: "Cash receipt — Vertex Systems ACH ACH-2026-0328-0447 — 5 invoices (fuzzy-matched via VS-2026-MAR)" },
      ],
      invoices_closed: [
        { ref: "INV-47210", amount:  89_400.00, status: "CLOSED-PAID" },
        { ref: "INV-47211", amount:  98_700.00, status: "CLOSED-PAID" },
        { ref: "INV-47212", amount: 112_300.00, status: "CLOSED-PAID" },
        { ref: "INV-47213", amount: 102_800.00, status: "CLOSED-PAID" },
        { ref: "INV-47214", amount:  84_000.00, status: "CLOSED-PAID" },
      ],
      customer_balance_update: {
        balance_before: 512_800.00,
        closed_this_run: 487_200.00,
        balance_after: 25_600.00,
        remaining_invoices: 2,
        remaining_refs: ["INV-47198 ($15,300 — 30-day)", "INV-47102 ($10,300 — 60-day)"],
      },
      audit_trail: {
        approval_reference: "CTRL-APPR-2026-0328-012",
        approved_by:        "AR Supervisor (one-click — fuzzy match confirmation)",
        sox_control:        "SOX-CA-002 — Confirmed match required for non-exact reference postings",
        posting_system:     "NovaTech ERP — AR Module v8.4.1",
      },
      status: "POSTED",
      talking_point: "Vertex's ACH — flagged as exception due to reference mismatch — is now fully posted. 5 invoices closed, AR reduced by $487.2K, exception cleared. What would have been a day of back-and-forth with the customer took the agent under 30 seconds.",
    },
  });
});

// ─── Scenario 3: Regional Supply Chase + Provisional Posting ─────────────────

// POST /regional-initiate-chase
router.post("/regional-initiate-chase", async (_req: Request, res: Response) => {
  await delay(1100);
  res.json({
    chase: {
      chase_id:       "CHASE-2026-RSC-0328",
      customer:       "Regional Supply Co",
      customer_id:    "CUST-RSC-087",
      payment_ref:    "CHK-2026-77421",
      chase_status:   "INITIATED",
      chase_channels: ["EMAIL", "CUSTOMER_PORTAL_MESSAGE"],
      contacts_notified: [
        { name: "Diane Howell",   title: "AP Manager",         email: "d.howell@regionalsupply.com",   method: "EMAIL" },
        { name: "Tom Reyes",      title: "Controller",          email: "t.reyes@regionalsupply.com",    method: "PORTAL" },
      ],
      message_sent: "Hello Diane — NovaTech received your check #77421 for $127,000 on March 28. We were unable to identify remittance information for this payment. Could you please provide the invoice allocation by COB March 31? In the meantime, we've provisionally applied the payment to your oldest open invoices (INV-45901, INV-45902, INV-46011). Sincerely, NovaTech AR Team (automated via OTC-AGT-006).",
      response_deadline: "2026-03-31T17:00:00Z",
      escalation_if_no_response: {
        escalation_to: "Account Manager — Jennifer Walsh",
        escalation_at: "2026-04-01T09:00:00Z",
        escalation_action: "Direct customer call + hold credit release",
      },
      initiated_at: new Date().toISOString(),
    },
  });
});

// POST /regional-post-provisional
router.post("/regional-post-provisional", async (_req: Request, res: Response) => {
  await delay(1500);
  res.json({
    provisional_posting: {
      posting_id:   "JE-2026-PROV-RSC-0328",
      payment_ref:  "CHK-2026-77421",
      customer:     "Regional Supply Co",
      customer_id:  "CUST-RSC-087",
      posted_at:    new Date().toISOString(),
      posted_by:    "OTC-AGT-006",
      posting_type: "PROVISIONAL",
      posting_note: "Provisional application per oldest-first policy — subject to revision upon customer remittance confirmation",
      journal_entries: [
        { je_ref: "JE-PROV-001", type: "CASH_RECEIPT_PROVISIONAL", debit_account: "1000-BANK-OPERATING", credit_account: "1200-ACCOUNTS-RECEIVABLE", amount: 127_000.00, description: "Provisional cash receipt — Regional Supply Co check #77421 — pending remittance confirmation" },
      ],
      invoices_affected: [
        { ref: "INV-45901", original: 52_400.00, applied: 52_400.00, status: "PROVISIONALLY-CLOSED", age_bucket: "30-day", aging_cleared: true },
        { ref: "INV-45902", original: 37_000.00, applied: 37_000.00, status: "PROVISIONALLY-CLOSED", age_bucket: "30-day", aging_cleared: true },
        { ref: "INV-46011", original: 24_800.00, applied: 24_800.00, status: "PROVISIONALLY-CLOSED", age_bucket: "Current", aging_cleared: false },
        { ref: "INV-46102", original: 11_200.00, applied:  9_100.00, status: "PARTIALLY-APPLIED",    age_bucket: "Current", aging_cleared: false, note: "Partial — $2,100 open" },
      ],
      unapplied_credit: {
        amount: 3_700.00,
        held_in: "2500-UNAPPLIED-CASH",
        note: "Remaining $3,700 held as unapplied credit pending customer remittance confirmation",
      },
      customer_balance_update: {
        balance_before: 143_200.00,
        provisional_reduction: 127_000.00,
        balance_after:   16_200.00,
        chase_status:   "ACTIVE — response due 2026-03-31",
      },
      aging_impact: {
        days_30_cleared: 89_400.00,
        days_30_after:         0.00,
        ar_risk_reduced: true,
        note: "Both overdue 30-day invoices cleared from aging. Customer no longer at risk of credit hold trigger.",
      },
      status: "POSTED_PROVISIONAL",
      talking_point: "Regional Supply's check — no remittance, sitting in manual queue — is now provisionally posted to clear their 30-day aging bucket. Customer has been automatically notified with a 3-day response deadline. The AM is on standby if they don't reply.",
    },
  });
});

export default router;
