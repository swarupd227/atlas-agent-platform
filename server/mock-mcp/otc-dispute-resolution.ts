import { Router } from "express";

const router = Router();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Static scenario data ─────────────────────────────────────────────────────

const APEX_DISPUTES = [
  { id: "DISP-2026-AX-001", invoice: "INV-54201", amount: 28400, date: "2026-02-14", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7200", "IC-8100"] },
  { id: "DISP-2026-AX-002", invoice: "INV-54318", amount: 31200, date: "2026-02-19", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7250", "IC-9000"] },
  { id: "DISP-2026-AX-003", invoice: "INV-54427", amount: 26700, date: "2026-02-24", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7200", "IC-8150"] },
  { id: "DISP-2026-AX-004", invoice: "INV-54519", amount: 33100, date: "2026-02-28", category: "Pricing Discrepancy", status: "Open", skus: ["IC-8100", "IC-9000"] },
  { id: "DISP-2026-AX-005", invoice: "INV-54603", amount: 29800, date: "2026-03-04", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7200"] },
  { id: "DISP-2026-AX-006", invoice: "INV-54712", amount: 35600, date: "2026-03-07", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7250", "IC-8100", "IC-8150"] },
  { id: "DISP-2026-AX-007", invoice: "CRN-2026-AX-0005", amount: 24900, date: "2026-03-10", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7200", "IC-9000"], legalHold: true },
  { id: "DISP-2026-AX-008", invoice: "INV-54891", amount: 31700, date: "2026-03-13", category: "Pricing Discrepancy", status: "Open", skus: ["IC-8100"] },
  { id: "DISP-2026-AX-009", invoice: "INV-54972", amount: 27300, date: "2026-03-17", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7250", "IC-8150"] },
  { id: "DISP-2026-AX-010", invoice: "INV-55089", amount: 38200, date: "2026-03-21", category: "Pricing Discrepancy", status: "Open", skus: ["IC-9000"] },
  { id: "DISP-2026-AX-011", invoice: "INV-55147", amount: 42100, date: "2026-03-25", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7200", "IC-8100", "IC-9000"] },
  { id: "DISP-2026-AX-012", invoice: "INV-55208", amount: 31000, date: "2026-03-28", category: "Pricing Discrepancy", status: "Open", skus: ["IC-7250"] },
];

const HISTORICAL_DISPUTE_BASELINE = {
  customer: "Apex Industries",
  accountTier: "Tier 1",
  annualRevenue: 12000000,
  sinceYear: 2019,
  historicalDisputes: [
    { quarter: "Q1 2025", count: 1, amount: 4200, category: "Quantity Short" },
    { quarter: "Q2 2025", count: 0, amount: 0,    category: null },
    { quarter: "Q3 2025", count: 1, amount: 3800, category: "Delivery Dispute" },
    { quarter: "Q4 2025", count: 1, amount: 5100, category: "Pricing Discrepancy" },
  ],
  baselineDisputesPerQuarter: 0.75,
  baselineAmountPerQuarter:   4367,
};

// ─── GET /dispute-queue ───────────────────────────────────────────────────────
router.get("/dispute-queue", async (_req, res) => {
  await sleep(1800);
  const totalAmount = APEX_DISPUTES.reduce((s, d) => s + d.amount, 0);
  res.json({
    customer:          "Apex Industries",
    customerTier:      "Tier 1",
    annualRevenue:     "$12M",
    disputes:          APEX_DISPUTES,
    summary: {
      totalDisputes:   APEX_DISPUTES.length,
      totalAmount,
      dateRange:       { from: "2026-02-14", to: "2026-03-28" },
      daysSpan:        45,
      statusBreakdown: { Open: 12, InReview: 0, Resolved: 0 },
    },
    anomalyFlag: {
      detected:        true,
      severity:        "CRITICAL",
      message:         `${APEX_DISPUTES.length} disputes in 45 days — historical baseline: 1 per quarter. Volume increase: 400%+.`,
    },
    historicalBaseline: HISTORICAL_DISPUTE_BASELINE.historicalDisputes,
  });
});

// ─── POST /dispute-patterns ──────────────────────────────────────────────────
router.post("/dispute-patterns", async (_req, res) => {
  await sleep(2200);
  res.json({
    analysisDate:        "2026-03-28",
    customer:            "Apex Industries",
    patternFound:        true,
    patternSeverity:     "CRITICAL",
    findings: {
      timelineClustering: {
        detected:        true,
        eventDate:       "2026-02-12",
        eventType:       "Contract Effective Date",
        eventRef:        "MSA-2025-1104",
        disputesBefore:  0,
        disputesAfter:   12,
        conclusion:      "100% of disputes filed after MSA-2025-1104 effective date. High probability of contract-related root cause.",
      },
      categoryConcentration: {
        detected:        true,
        primaryCategory: "Pricing Discrepancy",
        pct:             100,
        secondaryCategories: [],
        conclusion:      "All 12 disputes cite Pricing Discrepancy — single category dominance is a strong systemic signal.",
      },
      productConcentration: {
        detected:        true,
        category:        "Category C — Industrial Controls",
        pct:             100,
        skus:            ["IC-7200", "IC-7250", "IC-8100", "IC-8150", "IC-9000"],
        conclusion:      "100% of disputed invoices include Category C SKUs. No other product categories disputed.",
      },
      volumeAnomaly: {
        currentPeriod:   { disputes: 12, amount: 380000, days: 45 },
        baseline:        { disputesPerQuarter: 0.75, amountPerQuarter: 4367 },
        volumeMultiple:  16,
        amountMultiple:  21.8,
        pValueEstimate:  0.0001,
        conclusion:      "Dispute frequency and value are statistically extreme — consistent with a systematic billing error, not normal dispute variance.",
      },
    },
    systemicClassification: {
      verdict:         "SYSTEMIC",
      confidence:      0.97,
      requiresAction:  "halt_individual_resolution",
      nextStep:        "classify_dispute_root_cause",
    },
    portfolioRiskFlag: {
      triggered:       true,
      message:         "If root cause is systemic, additional NovaTech customers on similar Category C contracts may be affected — portfolio scan required after root cause confirmation.",
    },
  });
});

// ─── POST /root-cause ─────────────────────────────────────────────────────────
router.post("/root-cause", async (_req, res) => {
  await sleep(2800);
  res.json({
    investigation: {
      step1: { desc: "Classified 12 disputes",        result: "All Type: Pricing Discrepancy (100%)" },
      step2: { desc: "Identified common factor",      result: "All involve Category C — Industrial Controls" },
      step3: { desc: "Cross-referenced contract",     result: "MSA-2025-1104 effective Feb 12, 2026" },
      step4: { desc: "Compared contracted vs invoiced rates", result: "Systematic 4.7% overcharge on all Category C products" },
      step5: { desc: "Root cause identified",         result: "ERP price list PL-2024-C remained active; PL-2025-C-APEX (per MSA-2025-1104) was never activated" },
    },
    rootCause: {
      verdict:         "PRICE_LIST_ACTIVATION_ERROR",
      confidence:      0.98,
      contract:        "MSA-2025-1104",
      effectiveDate:   "2026-02-12",
      correctPriceList: "PL-2025-C-APEX",
      activePriceList:  "PL-2024-C",
      overchargeRate:   "4.7%",
      description:     "Contract MSA-2025-1104 went live Feb 12, 2026 with new Category C pricing (lower rates negotiated). The ERP team activated the contract in the system but failed to switch the active price list from PL-2024-C to PL-2025-C-APEX. All invoices since Feb 12 have been generated at 2024 rates — an average 4.7% overcharge on every Category C line item.",
    },
    impactEstimate: {
      apexInvoicesAffected:   34,
      apexTotalBilled:        814000,
      apexOvercharged:        38300,
      portfolioRisk:          "HIGH",
      portfolioNote:          "Other customers on similar MSA structures with Category C pricing may have the same price list error.",
    },
    recommendedActions: [
      "1. Immediately escalate to Contract Management to confirm PL-2024-C vs PL-2025-C-APEX discrepancy",
      "2. Run portfolio scan (identify_affected_customers) to find all customers on similar contracts",
      "3. Calculate total systemic exposure (calculate_systemic_exposure)",
      "4. Check legal hold status on all disputed invoices before credit recommendation",
      "5. Recommend bulk credit issuance once exposure is fully quantified",
    ],
  });
});

// ─── GET /dispute-invoices ────────────────────────────────────────────────────
router.get("/dispute-invoices", async (_req, res) => {
  await sleep(1500);
  const invoiceDetails = [
    { invoice: "INV-54201", date: "2026-02-14", contractedTotal: 27060, invoicedTotal: 28400, creditRequired: 1340, skus: [{ sku: "IC-7200", qty: 120, contractedPrice: 112.75, invoicedPrice: 118.05, variance: 4.7 }, { sku: "IC-8100", qty: 200, contractedPrice: 94.30, invoicedPrice: 98.73, variance: 4.7 }] },
    { invoice: "INV-54318", date: "2026-02-19", contractedTotal: 29793, invoicedTotal: 31200, creditRequired: 1407, skus: [{ sku: "IC-7250", qty: 180, contractedPrice: 102.50, invoicedPrice: 107.32, variance: 4.7 }, { sku: "IC-9000", qty: 85,  contractedPrice: 64.80, invoicedPrice: 67.85, variance: 4.7 }] },
    { invoice: "INV-54427", date: "2026-02-24", contractedTotal: 25501, invoicedTotal: 26700, creditRequired: 1199, skus: [{ sku: "IC-7200", qty: 100, contractedPrice: 112.75, invoicedPrice: 118.05, variance: 4.7 }, { sku: "IC-8150", qty: 140, contractedPrice: 74.30, invoicedPrice: 77.79, variance: 4.7 }] },
    { invoice: "INV-54519", date: "2026-02-28", contractedTotal: 31601, invoicedTotal: 33100, creditRequired: 1499, skus: [{ sku: "IC-8100", qty: 220, contractedPrice: 94.30, invoicedPrice: 98.73, variance: 4.7 }, { sku: "IC-9000", qty: 120, contractedPrice: 64.80, invoicedPrice: 67.85, variance: 4.7 }] },
  ];
  res.json({
    customer:         "Apex Industries",
    totalDisputed:    APEX_DISPUTES.length,
    totalInvoices:    34,
    disputedInvoices: invoiceDetails,
    summary: {
      overchargeRate:    "4.7%",
      averageOvercharge: 1361,
      totalOvercharge:   38300,
      creditRequired:    38300,
      skuBreakdown: [
        { sku: "IC-7200", contractedPrice: 112.75, invoicedPrice: 118.05, variance: "4.7%", affectedInvoices: 18 },
        { sku: "IC-7250", contractedPrice: 102.50, invoicedPrice: 107.32, variance: "4.7%", affectedInvoices: 14 },
        { sku: "IC-8100", contractedPrice: 94.30,  invoicedPrice: 98.73,  variance: "4.7%", affectedInvoices: 22 },
        { sku: "IC-8150", contractedPrice: 74.30,  invoicedPrice: 77.79,  variance: "4.7%", affectedInvoices: 10 },
        { sku: "IC-9000", contractedPrice: 64.80,  invoicedPrice: 67.85,  variance: "4.7%", affectedInvoices: 16 },
      ],
    },
  });
});

// ─── POST /bulk-resolution ────────────────────────────────────────────────────
router.post("/bulk-resolution", async (_req, res) => {
  await sleep(2500);
  res.json({
    recommendation: {
      title:       "Bulk Resolution Plan — Systemic Pricing Error (MSA-2025-1104)",
      totalCredits: 165300,
      invoicesAffected: 123,
      customersAffected: 4,
      estimatedProcessingHours: 2,
      steps: [
        { seq: 1, action: "Issue credit memos for all 123 overcharged invoices totalling $165,300", owner: "OTC-AGT-006", eta: "Same day" },
        { seq: 2, action: "Correct ERP price list: replace PL-2024-C with PL-2025-C-APEX for Apex Industries and equivalents for 3 other customers", owner: "IT / Contract Management", eta: "48-hour staging" },
        { seq: 3, action: "Rebill: apply correct rates to any open purchase orders", owner: "Billing Team", eta: "Next billing cycle" },
        { seq: 4, action: "Send proactive apology and credit notification to all 4 affected customers (Apex, Meridian, Cascade, Stonebridge)", owner: "OTC-AGT-006 + AR VP", eta: "Within 24 hours" },
        { seq: 5, action: "Implement contract pricing validation rule: alert if variance exceeds 1% on first 10 invoices after new contract effective date", owner: "Product / IT", eta: "2-week sprint" },
      ],
    },
    creditBreakdown: [
      { customer: "Apex Industries",       invoices: 34, creditAmount: 38300,  status: "Pending — 1 invoice on legal hold (CRN-2026-AX-0005, REF-LEGAL-2026-047)" },
      { customer: "Meridian Manufacturing", invoices: 31, creditAmount: 54000,  status: "Ready to issue" },
      { customer: "Cascade Dynamics",       invoices: 26, creditAmount: 38000,  status: "Ready to issue" },
      { customer: "Stonebridge Industries", invoices: 32, creditAmount: 35000,  status: "Ready to issue" },
    ],
    approvalRequired: {
      needed: true,
      level:  "VP Finance",
      reason: "Batch credits totalling $165,300 exceed $100K threshold requiring executive sign-off",
      contact: "Jordan Silva, VP Finance (approval already escalated per systemic issue protocol)",
    },
    preventionRule: {
      description: "Contract Pricing Verification Agent Rule",
      specification: "When a new contract is loaded, automatically compare invoiced prices against contracted rates for the first 10 invoices. Alert AR team if variance exceeds 1%. Prevents recurrence of PL activation errors.",
    },
  });
});

// ─── GET /legal-hold ──────────────────────────────────────────────────────────
router.get("/legal-hold", async (_req, res) => {
  await sleep(1200);
  res.json({
    checkDate:     "2026-03-28",
    invoicesChecked: APEX_DISPUTES.length,
    holdsFound:    1,
    legalHolds: [
      {
        invoice:     "CRN-2026-AX-0005",
        disputeId:   "DISP-2026-AX-007",
        holdRef:     "REF-LEGAL-2026-047",
        holdType:    "ACTIVE_LITIGATION",
        holdDate:    "2026-03-09",
        holdReason:  "Invoice disputed as part of broader contract performance claim filed by Apex Industries. Legal hold placed by NovaTech Legal (Jennifer Park, Sr. Counsel) pending case resolution.",
        creditBlocked: true,
        clearanceWorkflow: "Legal must issue written clearance referencing REF-LEGAL-2026-047 before credit memo can be issued for this invoice ($24,900 credit amount).",
        estimatedResolution: "2026-04-15 (pending mediation schedule)",
      },
    ],
    clearedInvoices: APEX_DISPUTES.filter(d => !d.legalHold).map(d => d.invoice),
    guidance: "Issue credits for 11 invoices immediately. Exclude CRN-2026-AX-0005 ($24,900) from batch — route to Legal for REF-LEGAL-2026-047 clearance. Total creditable today: $355,100.",
  });
});

export default router;
