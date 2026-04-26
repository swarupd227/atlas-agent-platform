import { Router } from "express";

const router = Router();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Contract pricing data ────────────────────────────────────────────────────

const CONTRACTED_RATES_MSA_2025_1104 = [
  { sku: "IC-7200", description: "Industrial Control Unit — Standard",  contractedPrice: 112.75, activePriceListPrice: 118.05, variance: 4.70, annualVolume: 4800 },
  { sku: "IC-7250", description: "Industrial Control Unit — Enhanced",  contractedPrice: 102.50, activePriceListPrice: 107.32, variance: 4.70, annualVolume: 3600 },
  { sku: "IC-8100", description: "Industrial Controller Module",        contractedPrice: 94.30,  activePriceListPrice: 98.73,  variance: 4.70, annualVolume: 6200 },
  { sku: "IC-8150", description: "Industrial Controller Module — Pro",  contractedPrice: 74.30,  activePriceListPrice: 77.79,  variance: 4.70, annualVolume: 2800 },
  { sku: "IC-9000", description: "Advanced Industrial Control System",  contractedPrice: 64.80,  activePriceListPrice: 67.85,  variance: 4.70, annualVolume: 5100 },
];

const AFFECTED_CUSTOMERS = [
  { name: "Apex Industries",        tier: "Tier 1", revenue: "$12M/year", contract: "MSA-2025-1104",  effectiveDate: "2026-02-12", invoices: 34, totalBilled: 814000, overcharge: 38300,  disputesFiled: 12, disputeAmount: 380000 },
  { name: "Meridian Manufacturing", tier: "Tier 2", revenue: "$4.2M/year", contract: "MSA-2025-1187", effectiveDate: "2026-02-01", invoices: 31, totalBilled: 568000, overcharge: 54000,  disputesFiled: 0,  disputeAmount: 0     },
  { name: "Cascade Dynamics",       tier: "Tier 2", revenue: "$3.1M/year", contract: "MSA-2025-1201", effectiveDate: "2026-02-19", invoices: 26, totalBilled: 432000, overcharge: 38000,  disputesFiled: 0,  disputeAmount: 0     },
  { name: "Stonebridge Industries", tier: "Tier 2", revenue: "$2.8M/year", contract: "MSA-2025-1219", effectiveDate: "2026-03-01", invoices: 32, totalBilled: 498000, overcharge: 35000,  disputesFiled: 0,  disputeAmount: 0     },
];

// ─── GET /contract-pricing ────────────────────────────────────────────────────
router.get("/contract-pricing", async (_req, res) => {
  await sleep(2000);
  res.json({
    contract:      "MSA-2025-1104",
    customer:      "Apex Industries",
    effectiveDate: "2026-02-12",
    expiryDate:    "2027-02-11",
    pricingCategory: "Category C — Industrial Controls",
    contractedPriceList: "PL-2025-C-APEX",
    activePriceList:     "PL-2024-C",
    priceListMismatch:   true,
    skuComparison: CONTRACTED_RATES_MSA_2025_1104,
    complianceStatus: {
      verdict:         "NON_COMPLIANT",
      severity:        "HIGH",
      finding:         "ERP is invoicing at PL-2024-C rates. Contract MSA-2025-1104 requires PL-2025-C-APEX rates effective Feb 12, 2026. Systematic 4.7% overcharge confirmed on all 5 Category C SKUs.",
      rootCauseConfirmed: true,
    },
    financialImpact: {
      overchargePct:     4.70,
      apexInvoicesSince: "2026-02-12",
      estimatedOvercharge: 38300,
    },
  });
});

// ─── POST /invoice-scan ───────────────────────────────────────────────────────
router.post("/invoice-scan", async (_req, res) => {
  await sleep(2800);
  const invoiceSample = [
    { invoice: "INV-54201", date: "2026-02-14", contracted: 27060, invoiced: 28400, credit: 1340 },
    { invoice: "INV-54318", date: "2026-02-19", contracted: 29793, invoiced: 31200, credit: 1407 },
    { invoice: "INV-54427", date: "2026-02-24", contracted: 25501, invoiced: 26700, credit: 1199 },
    { invoice: "INV-54519", date: "2026-02-28", contracted: 31601, invoiced: 33100, credit: 1499 },
    { invoice: "INV-54603", date: "2026-03-04", contracted: 28459, invoiced: 29800, credit: 1341 },
    { invoice: "INV-54712", date: "2026-03-07", contracted: 34003, invoiced: 35600, credit: 1597 },
    { invoice: "CRN-2026-AX-0005", date: "2026-03-10", contracted: 23782, invoiced: 24900, credit: 1118, legalHold: true },
  ];
  res.json({
    customer:         "Apex Industries",
    scanPeriod:       { from: "2026-02-12", to: "2026-03-28" },
    invoicesScanned:  34,
    invoicesAffected: 34,
    totalBilled:      814000,
    totalContracted:  775700,
    totalOvercharge:  38300,
    overchargePct:    4.70,
    invoiceSample,
    remaining: 27,
    summary:          "All 34 invoices issued after MSA-2025-1104 effective date are overcharged at 4.7% on Category C SKUs. 1 invoice (CRN-2026-AX-0005) has a legal hold — exclude from credit batch.",
  });
});

// ─── GET /affected-customers ──────────────────────────────────────────────────
router.get("/affected-customers", async (_req, res) => {
  await sleep(3000);
  res.json({
    scanDate:          "2026-03-28",
    rootCause:         "ERP price list PL-2024-C active instead of contracted rates for Category C — Industrial Controls SKUs",
    affectedCustomers: AFFECTED_CUSTOMERS,
    portfolioSummary: {
      totalCustomers:    4,
      totalInvoices:     123,
      totalBilled:       2312000,
      totalOvercharge:   165300,
      customersWithDisputes:    1,
      customersWithoutDisputes: 3,
      proactiveOutreachRequired: true,
      proactiveOutreachNote:    "Meridian Manufacturing, Cascade Dynamics, and Stonebridge Industries have not filed disputes. Per NovaTech systemic risk policy, all must be notified and credited before discovering the error independently.",
    },
  });
});

// ─── POST /systemic-exposure ──────────────────────────────────────────────────
router.post("/systemic-exposure", async (_req, res) => {
  await sleep(2200);
  res.json({
    exposureDate:    "2026-03-28",
    totalExposure: {
      customers:       4,
      invoices:        123,
      totalBilled:     2312000,
      totalOvercharge: 165300,
      overchargePct:   4.70,
    },
    customerBreakdown: AFFECTED_CUSTOMERS.map(c => ({
      customer:       c.name,
      tier:           c.tier,
      invoices:       c.invoices,
      overcharge:     c.overcharge,
      disputesFiled:  c.disputesFiled,
      creditStatus:   c.disputesFiled > 0 ? "REACTIVE_RESOLUTION" : "PROACTIVE_REQUIRED",
    })),
    agingByMonth: [
      { month: "Feb 2026", overcharge: 41700, invoices: 28 },
      { month: "Mar 2026", overcharge: 123600, invoices: 95 },
    ],
    priorityRanking: [
      { rank: 1, customer: "Apex Industries",       reason: "Active disputes filed, Tier 1, largest relationship ($12M)" },
      { rank: 2, customer: "Meridian Manufacturing", reason: "Largest unreported exposure ($54K), 31 invoices" },
      { rank: 3, customer: "Cascade Dynamics",       reason: "$38K unreported, proactive outreach prevents escalation" },
      { rank: 4, customer: "Stonebridge Industries", reason: "$35K unreported, most recent contract effective date" },
    ],
    approvalRequired: {
      amount:   165300,
      threshold: 100000,
      level:    "VP Finance",
      contact:  "Jordan Silva, VP Finance",
      status:   "ESCALATION_INITIATED",
    },
  });
});

// ─── POST /validate-price-list ────────────────────────────────────────────────
router.post("/validate-price-list", async (_req, res) => {
  await sleep(2400);
  res.json({
    validationDate:    "2026-03-28",
    erpSystem:         "SAP S/4HANA",
    pricingCategory:   "Category C — Industrial Controls",
    validation: {
      currentActiveList: "PL-2024-C",
      correctList:       "PL-2025-C-APEX",
      mismatchConfirmed: true,
      activationDateRequired: "2026-02-12",
      activationDateActual:   null,
      finding:           "PL-2024-C has been active since 2024. PL-2025-C-APEX was created but never activated. Contract MSA-2025-1104 trigger date Feb 12, 2026 was not linked to price list activation.",
    },
    skuValidation: CONTRACTED_RATES_MSA_2025_1104.map(s => ({
      sku:        s.sku,
      currentERP: s.activePriceListPrice,
      correct:    s.contractedPrice,
      variance:   `${s.variance}%`,
      status:     "OVERCHARGING",
    })),
    openOrdersImpact: {
      openOrders:       8,
      affectedOrders:   8,
      totalValue:       142000,
      repricingRequired: true,
      note:             "8 open orders reference PL-2024-C. These must be re-priced to PL-2025-C-APEX before shipment to avoid further overcharging.",
    },
    changeRequestRequired: {
      id:          "CR-2026-PL-0047",
      description: "Replace PL-2024-C with PL-2025-C-APEX for Apex Industries MSA-2025-1104 and equivalent corrections for MSA-2025-1187, MSA-2025-1201, MSA-2025-1219",
      priority:    "HIGH",
      staging:     "48 hours",
    },
  });
});

// ─── POST /erp-correction ─────────────────────────────────────────────────────
router.post("/erp-correction", async (req, res) => {
  await sleep(2600);

  const scenario = (req.query.scenario as string) || "happy";

  if (scenario === "erp-fail") {
    res.json({
      changeRequestId: "CR-2026-PL-0047",
      status:          "VALIDATION_FAILED",
      failureReason:   "Open orders reference PL-2024-C. ERP validation rejected activation of PL-2025-C-APEX until all 8 open orders are re-priced or amended. Rollback procedure initiated.",
      rollback: {
        triggered:   true,
        priceListRestored: "PL-2024-C (unchanged)",
        openOrdersBlocking: 8,
        resolution:  "Contract Management must amend 8 open orders before price list switch can proceed. Estimated 3 business days.",
      },
      exception:       "ERP_VALIDATION_FAILED",
    });
    return;
  }

  res.json({
    changeRequestId: "CR-2026-PL-0047",
    status:          "SUBMITTED",
    details: {
      from:          "PL-2024-C",
      to:            "PL-2025-C-APEX",
      customers:     ["Apex Industries", "Meridian Manufacturing", "Cascade Dynamics", "Stonebridge Industries"],
      skusAffected:  5,
      openOrders:    8,
      repricingRequired: true,
      stagingPeriod: "48 hours",
    },
    approvalRouting: {
      step1: { approver: "Contract Management — Sarah Okonkwo",  status: "PENDING", sla: "4 hours" },
      step2: { approver: "IT Change Advisory Board",              status: "PENDING", sla: "24 hours" },
      step3: { approver: "ERP Production Deployment",             status: "PENDING", sla: "48-hour staging" },
    },
    openOrderAction: {
      action:     "REPRICE_IN_PARALLEL",
      note:       "8 open orders will be re-priced from PL-2024-C to PL-2025-C-APEX before next shipment. Buyers notified of price correction.",
      ordersCount: 8,
    },
    prevention: {
      ruleAdded:  "Contract Pricing Verification — alert on >1% variance for first 10 invoices after contract effective date",
      status:     "PENDING_IT_SPRINT",
      sprintTarget: "2026-04-18",
    },
  });
});

export default router;
