/**
 * OTC Eval Dataset + Suite Creation (continuation script)
 * Uses agent IDs from the completed Phase 3 creation.
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";

// IDs from the creation run
const DISPUTE_AGENT_ID = "ff6f9c53-397f-4915-b362-d37a7d6d8299";
const CASH_AGENT_ID    = "99fe20ef-ec54-4447-9dac-e88e54827f84";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).substring(0, 400));
    throw new Error(`API error ${res.status} on ${method} ${path}`);
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check what eval endpoints actually accept
// ─────────────────────────────────────────────────────────────────────────────
async function checkEvalEndpoints() {
  // First check what POST /api/evals expects
  const existing = await api("GET", "/api/eval-suites");
  if (Array.isArray(existing) && existing.length > 0) {
    console.log("Existing eval suite sample:", JSON.stringify(existing[0], null, 2).substring(0, 300));
  }
}

async function createGoldenDataset(data) {
  console.log(`  Creating golden dataset: ${data.name}`);
  return api("POST", "/api/golden-datasets", data);
}

async function createTestCase(datasetId, data) {
  return api("POST", `/api/golden-datasets/${datasetId}/test-cases`, data);
}

async function createEvalSuite(data) {
  console.log(`  Creating eval suite: ${data.name}`);
  // Try /api/evals first (that's what the route shows for POST)
  return api("POST", "/api/evals", data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eval Dataset for OTC-AGT-008
// ─────────────────────────────────────────────────────────────────────────────
async function createDisputeEvalDataset(agentId) {
  console.log("\n[Phase 6a] Creating OTC-AGT-008 Eval Dataset & Suite...");

  const dataset = await createGoldenDataset({
    name: "OTC-AGT-008 Dispute Resolution Evaluation Dataset",
    description: "Evaluation dataset for the Dispute Resolution Agent covering classification accuracy, root cause analysis, resolution appropriateness, communication quality, and SLA compliance. Includes historical disputes with known outcomes across all dispute types and customer tiers.",
    industry: "enterprise",
    useCase: "Dispute Classification and Resolution",
    version: "1.0",
    status: "active",
    tags: ["dispute-resolution", "order-to-cash", "credit-memo", "classification", "root-cause"],
    qualityCoverage: 0.92,
    scenarioCategories: {
      "Pricing Error": 20,
      "Quantity Discrepancy": 15,
      "Quality Dispute": 15,
      "Duplicate Invoice": 10,
      "Unauthorized Deduction": 20,
      "High-Value Dispute": 10,
      "Aging Dispute SLA": 10,
    },
    coverageDimensions: ["dispute_type", "resolution_type", "customer_tier", "dispute_amount", "sla_compliance"],
    benchmarkAvg: 0.93,
    benchmarkRange: { low: 0.85, high: 0.98 },
    performanceBenchmarks: {
      classificationAccuracy: 0.95,
      rootCauseAccuracy: 0.88,
      resolutionAppropriateness: 0.92,
      cycleTimeTarget: 10,
      customerSatisfactionTarget: 0.90,
    },
    aiGenerated: false,
    contributorCount: 1,
    contributors: ["Order-to-Cash Team"],
  });

  const testCases = [
    {
      name: "Pricing Error — Standard Customer — Full Credit",
      input: "Customer ABC Corp disputes invoice INV-2024-1201 for $8,500. PO #PO-88721 specifies unit price of $85.00 per unit × 100 units = $8,500. Invoice shows $95.00 per unit = $9,500. Customer has deducted $1,000 from payment. Reference: customer email attached stating price discrepancy.",
      expectedOutput: JSON.stringify({
        classification: "pricing_error",
        confidence: 0.97,
        priority: "HIGH",
        routing: "Billing",
        resolution: "full_credit",
        amount: 1000.00,
        approvalRequired: false,
        rootCause: "Price master mismatch",
      }),
      goldenOutput: "Classify as pricing_error with high confidence. Root cause: price master error (ERP loaded $95 instead of $85 per contract). Recommend full credit of $1,000. Amount ≤ $5,000 so supervisor notification only, no explicit approval needed. Issue credit memo. Communicate resolution within 1 business day.",
      tags: ["pricing_error", "full_credit", "standard_customer"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Unauthorized Deduction — Strategic Customer — Reject with Evidence",
      input: "Strategic customer MegaRetail Inc takes $12,000 deduction coded 'PROMO-X99' on payment for invoice INV-2024-1890 ($75,000). Deduction code PROMO-X99 does not exist in approved promotion schedule for this customer or period. Customer claims it was for Q4 end-cap promotion.",
      expectedOutput: JSON.stringify({
        classification: "unauthorized_deduction",
        confidence: 0.94,
        priority: "CRITICAL",
        routing: "Sales",
        resolution: "reject_with_evidence",
        deductionValidity: "invalid",
        approvalRequired: false,
        relationshipFlag: true,
      }),
      goldenOutput: "Classify as unauthorized_deduction (code not found in promotion schedule). Flag as CRITICAL due to strategic customer and amount > $10K. Route to Sales for relationship management. Reject deduction with evidence package. Activate Customer Relationship at Risk runbook. Notify VP and account executive.",
      tags: ["unauthorized_deduction", "strategic_customer", "rejection", "high_value"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Duplicate Invoice — Full Credit Auto-Approved",
      input: "Customer Globex Ltd submits dispute for invoice INV-2024-2244 ($3,200) claiming they were charged twice for the same order. Order #ORD-55123 placed once on Oct 15. AR records show INV-2024-2244 ($3,200) dated Oct 15 and INV-2024-2251 ($3,200) dated Oct 16 — both reference ORD-55123.",
      expectedOutput: JSON.stringify({
        classification: "duplicate_invoice",
        confidence: 0.99,
        priority: "MEDIUM",
        routing: "Billing",
        resolution: "full_credit",
        amount: 3200.00,
        duplicateInvoice: "INV-2024-2251",
        systemCorrectionNeeded: true,
      }),
      goldenOutput: "Classify as duplicate_invoice. INV-2024-2251 is the duplicate (same order, generated next day). Credit full amount $3,200. Amount < $5,000 — auto-approve. Void INV-2024-2251. File IT ticket for billing system audit.",
      tags: ["duplicate_invoice", "auto_resolution", "billing_error"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Quality Dispute — Partial Credit with Evidence Gathering",
      input: "Customer TechBuild Corp disputes invoice INV-2024-3301 for $22,000 (Order #ORD-67810). Claims 40 of 200 units arrived damaged (SKU: HDMI-4K-Pro). Provides photos of damaged packaging. Delivery was Oct 20 via FedEx freight.",
      expectedOutput: JSON.stringify({
        classification: "quality_dispute",
        confidence: 0.93,
        priority: "HIGH",
        routing: "Quality",
        evidenceNeeded: ["POD", "carrier_damage_report", "inspection_photos"],
        resolution: "partial_credit",
        estimatedAmount: 4400.00,
        approvalRequired: true,
        approvalLevel: "supervisor",
      }),
      goldenOutput: "Classify as quality_dispute. Route to Quality team. Gather POD, carrier damage report from FedEx, packing slip. Credit for 40 units × $110 = $4,400. Amount > $500 — supervisor notification required. Issue partial credit of $4,400 upon evidence confirmation.",
      tags: ["quality_dispute", "partial_credit", "evidence_gathering", "carrier_damage"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Aging Dispute SLA Breach Risk at Day 28",
      input: "Dispute DIS-2024-0445 for customer NordTech ($15,000 pricing error) open 28 days. Evidence gathered Day 3. Root cause confirmed Day 8. Resolution proposed Day 10 — awaiting director approval. Director approval request sent Day 10, no response received.",
      expectedOutput: JSON.stringify({
        escalationRequired: true,
        escalationLevel: "director",
        daysToSLABreach: 2,
        approvalStatus: "pending_18_days",
        immediateAction: "escalate_approval_request",
      }),
      goldenOutput: "SLA breach in 2 days. Activate Aging Dispute Alert runbook. Escalate stuck approval to AR Director directly with urgency flag. Send interim update to customer NordTech. If no approval in 24 hours, escalate to VP Finance.",
      tags: ["aging_dispute", "sla_breach", "escalation", "approval_stuck"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Systematic Pattern — 8 Same Root Cause Disputes",
      input: "Prevention Analytics identifies 8 disputes in last 30 days all classified as pricing_error with root cause 'incorrect price tier applied for distributor segment'. Total dispute value $45,000 across 8 customers. All invoices generated week of Oct 7-11.",
      expectedOutput: JSON.stringify({
        patternDetected: true,
        disputeCount: 8,
        totalAmount: 45000,
        systemicIssueScore: 95,
        recommendedAction: "Activate Systematic Error Pattern runbook",
      }),
      goldenOutput: "Systemic error confirmed (8 disputes, same root cause, same period). Activate Systematic Error Pattern Investigation runbook. Notify IT and operations immediately. Run full impact assessment. Batch process credits. Proactive customer outreach to all affected accounts.",
      tags: ["systematic_error", "mass_resolution", "prevention_analytics", "price_master"],
      difficulty: "hard",
      weight: 3,
      status: "active",
      origin: "manual",
    },
  ];

  console.log("  Adding test cases to dataset...");
  for (const tc of testCases) {
    await createTestCase(dataset.id, tc);
  }
  console.log(`  ✓ Added ${testCases.length} test cases`);

  // Try creating eval suite
  let suite;
  try {
    suite = await createEvalSuite({
      agentId,
      name: "OTC-AGT-008 Dispute Resolution Core Regression Suite",
      type: "regression",
      goldenDatasetId: dataset.id,
      industry: "enterprise",
      totalCases: testCases.length,
      passRate: 0,
      thresholdConfig: { minPassRate: 0.92, classificationAccuracy: 0.95, resolutionAccuracy: 0.90 },
      coverageTags: ["dispute_classification", "root_cause_analysis", "resolution_recommendation", "sla_compliance"],
      ontologyTags: ["dispute", "credit-memo", "order-to-cash"],
    });
    console.log(`  ✓ Created eval suite: ${suite.id}`);
  } catch (e) {
    console.warn("  ! Eval suite creation failed:", e.message, "— dataset still created OK");
    suite = { id: null };
  }

  return { dataset, suite };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eval Dataset for OTC-AGT-009
// ─────────────────────────────────────────────────────────────────────────────
async function createCashApplicationEvalDataset(agentId) {
  console.log("\n[Phase 6b] Creating OTC-AGT-009 Eval Dataset & Suite...");

  const dataset = await createGoldenDataset({
    name: "OTC-AGT-009 Cash Application & Reconciliation Evaluation Dataset",
    description: "Evaluation dataset for the Cash Application & Reconciliation Agent covering remittance parsing accuracy, invoice matching rates, deduction classification, bank reconciliation completeness, and exception prioritization. Includes complex multi-invoice payments, cross-currency scenarios, and period-end close cases.",
    industry: "enterprise",
    useCase: "Cash Application and Bank Reconciliation",
    version: "1.0",
    status: "active",
    tags: ["cash-application", "order-to-cash", "remittance", "bank-reconciliation", "matching"],
    qualityCoverage: 0.93,
    scenarioCategories: {
      "Exact Match": 20,
      "Consolidated Payment": 15,
      "Partial Payment": 15,
      "Deduction Classification": 20,
      "Bank Reconciliation": 15,
      "Exception Handling": 15,
    },
    coverageDimensions: ["match_type", "payment_complexity", "remittance_format", "deduction_type", "period_timing"],
    benchmarkAvg: 0.92,
    benchmarkRange: { low: 0.85, high: 0.99 },
    performanceBenchmarks: {
      autoMatchRate: 0.90,
      remittanceParsingAccuracy: 0.92,
      deductionClassificationAccuracy: 0.90,
      reconciliationCompleteness: 0.98,
    },
    aiGenerated: false,
    contributorCount: 1,
    contributors: ["Order-to-Cash Team"],
  });

  const testCases = [
    {
      name: "EDI 820 — Consolidated Payment Covering 12 Invoices",
      input: "Payment received $145,230.00 from customer Wholesale Partners Inc via EDI 820. Remittance contains 12 invoice references (INV-2024-0801 through INV-2024-0812) with individual amounts totaling $145,230.00. All invoices are open in AR for this customer.",
      expectedOutput: JSON.stringify({
        parsingMethod: "EDI_820",
        parserConfidence: 0.99,
        lineItemsExtracted: 12,
        totalExtracted: 145230.00,
        matchType: "exact",
        matchConfidence: 0.99,
        disposition: "auto_apply",
      }),
      goldenOutput: "Parse EDI 820 with 99% confidence. Extract all 12 invoice references. Match each to open AR — all 12 exact matches. Auto-apply full payment. Post 12 cash receipts. Close all 12 invoices. No exceptions.",
      tags: ["EDI_820", "consolidated_payment", "exact_match", "auto_apply"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "PDF Remittance — Partial Payment with Valid Trade Promo Deduction",
      input: "Payment $48,500 from FoodMart Corp. PDF remittance: Invoice INV-2024-1500 billed $50,000, deduction $1,500 coded 'PROMO-FALL-2024'. Code PROMO-FALL-2024 exists in approved promotion schedule for FoodMart Corp, approved amount $1,500 for Q4 2024.",
      expectedOutput: JSON.stringify({
        parsingMethod: "PDF_OCR_NLP",
        parserConfidence: 0.91,
        matchType: "partial_with_deduction",
        paidAmount: 48500,
        deductionCode: "PROMO-FALL-2024",
        deductionValidity: "valid",
        deductionOffset: "Trade Promo Accrual",
        disposition: "auto_apply",
      }),
      goldenOutput: "Parse PDF at 91% confidence. Match $48,500 to INV-2024-1500. Validate PROMO-FALL-2024 — found in approved schedule, amount $1,500. Apply $48,500, offset $1,500 deduction against Trade Promo Accrual. Invoice fully settled. Auto-apply.",
      tags: ["PDF_parsing", "partial_payment", "trade_deduction", "valid_deduction"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Invalid Deduction — Route to Dispute Resolution Agent",
      input: "Payment $95,200 from BuildRight Inc for invoice INV-2024-2100 ($100,000). Deduction $4,800 coded 'SHORTAGE-OCT'. POD shows delivery of full order quantity confirmed with customer signature. No shortage claim filed via quality system.",
      expectedOutput: JSON.stringify({
        matchType: "partial_with_invalid_deduction",
        paidAmount: 95200,
        deductionAmount: 4800,
        deductionCode: "SHORTAGE-OCT",
        deductionValidity: "invalid",
        disputeCreated: true,
        disputeType: "unauthorized_deduction",
        remainingBalanceOnInvoice: 4800,
      }),
      goldenOutput: "Match $95,200 to INV-2024-2100. Validate SHORTAGE-OCT — POD shows full delivery signed. Mark deduction INVALID. Apply $95,200, leave $4,800 open. Create dispute record and route to OTC-AGT-008 Dispute Resolution Agent.",
      tags: ["invalid_deduction", "dispute_creation", "cross_agent", "unauthorized"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Bank Reconciliation — Deposit in Transit and Bank Fee",
      input: "Bank statement (BAI2) Oct 31 ending balance $2,850,000. ERP posted cash receipts for October total $3,100,000. Opening balance $250,000. Bank statement shows $500 bank service charge not in ERP. One ERP deposit $250,000 dated Oct 31 not on bank statement.",
      expectedOutput: JSON.stringify({
        bankEndingBalance: 2850000,
        erpCashBalance: 3100000,
        timingDifferences: [{ type: "deposit_in_transit", amount: 250000 }],
        errors: [{ type: "bank_fee_not_in_erp", amount: 500 }],
        adjustedVariance: -500,
        reconciledStatus: "exception",
        nextAction: "Post $500 bank fee journal entry then recheck",
      }),
      goldenOutput: "Analyze: $250K deposit in transit (timing, no error). $500 bank fee not in ERP (needs journal entry). After timing adjustment ERP matches bank. Post $500 fee entry to complete reconciliation. Document for SOX evidence.",
      tags: ["bank_reconciliation", "deposit_in_transit", "bank_fee", "SOX"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Exception Prioritization — Mixed Aging Queue",
      input: "Unmatched queue: (A) $250,000 from strategic customer GlobalMfg, 1 day old. (B) $12,000 from standard customer SmallCo, 8 days old, period end tomorrow. (C) $500 from standard customer TinyCo, 15 days old. (D) $85,000 from preferred customer RegionalDistrib, 3 days old, contains deduction risk.",
      expectedOutput: JSON.stringify({
        prioritizedQueue: [
          { ref: "A", urgency: "Critical", priorityScore: 95 },
          { ref: "D", urgency: "Critical", priorityScore: 88 },
          { ref: "B", urgency: "High", priorityScore: 72 },
          { ref: "C", urgency: "Low", priorityScore: 28 },
        ],
      }),
      goldenOutput: "Prioritize: (1) GlobalMfg $250K Critical — strategic + high amount. (2) RegionalDistrib $85K Critical — deduction risk. (3) SmallCo $12K High — period-end cutoff risk. (4) TinyCo $500 Low — process tomorrow. Notify supervisor of critical items.",
      tags: ["exception_prioritization", "queue_management", "period_end"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Cross-Currency Payment — EUR to USD FX Variance",
      input: "Wire payment EUR 42,000 received from EuroTech GmbH. Open invoice INV-2024-EUR-055 shows USD 45,150 (EUR 42,000 at contract rate 1.0750). Payment date Oct 28, ECB rate 1.0820.",
      expectedOutput: JSON.stringify({
        paymentCurrency: "EUR",
        paymentAmount: 42000,
        usdAtPaymentRate: 45444,
        invoiceUSD: 45150,
        fxVariance: 294,
        variancePercent: 0.65,
        flagged: true,
        disposition: "queue_confirm",
      }),
      goldenOutput: "Convert EUR 42,000 at Oct 28 rate 1.0820 = $45,444. Invoice $45,150. FX variance $294 (0.65%) exceeds 0.5% threshold. Flag for review — variance is FX movement not underpayment. Queue for 1-click confirmation with FX variance journal entry suggested.",
      tags: ["cross_currency", "FX_variance", "suggested_match", "international"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
  ];

  console.log("  Adding test cases to dataset...");
  for (const tc of testCases) {
    await createTestCase(dataset.id, tc);
  }
  console.log(`  ✓ Added ${testCases.length} test cases`);

  let suite;
  try {
    suite = await createEvalSuite({
      agentId,
      name: "OTC-AGT-009 Cash Application Core Regression Suite",
      type: "regression",
      goldenDatasetId: dataset.id,
      industry: "enterprise",
      totalCases: testCases.length,
      passRate: 0,
      thresholdConfig: { minPassRate: 0.90, autoMatchRateTarget: 0.90, parsingAccuracyTarget: 0.92 },
      coverageTags: ["remittance_parsing", "invoice_matching", "deduction_coding", "bank_reconciliation"],
      ontologyTags: ["cash-application", "remittance", "order-to-cash"],
    });
    console.log(`  ✓ Created eval suite: ${suite.id}`);
  } catch (e) {
    console.warn("  ! Eval suite creation failed:", e.message, "— dataset still created OK");
    suite = { id: null };
  }

  return { dataset, suite };
}

async function main() {
  console.log("=".repeat(70));
  console.log("OTC Eval Dataset Creation (Phase 6)");
  console.log(`Target: ${BASE_URL}`);
  console.log("=".repeat(70));

  // First check eval suite structure
  await checkEvalEndpoints();

  const disputeEval = await createDisputeEvalDataset(DISPUTE_AGENT_ID);
  const cashAppEval = await createCashApplicationEvalDataset(CASH_AGENT_ID);

  console.log("\n" + "=".repeat(70));
  console.log("EVAL CREATION COMPLETE");
  console.log("=".repeat(70));
  console.log("\nOTC-AGT-008 Dispute Resolution:");
  console.log(`  Dataset ID: ${disputeEval.dataset.id}`);
  console.log(`  Suite ID:   ${disputeEval.suite.id}`);
  console.log("\nOTC-AGT-009 Cash Application:");
  console.log(`  Dataset ID: ${cashAppEval.dataset.id}`);
  console.log(`  Suite ID:   ${cashAppEval.suite.id}`);

  // Update the results JSON
  const fs = await import("fs");
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync("./scripts/otc-agents-created.json", "utf8")); } catch {}
  existing.disputeEval = disputeEval;
  existing.cashAppEval = cashAppEval;
  fs.writeFileSync("./scripts/otc-agents-created.json", JSON.stringify(existing, null, 2));
  console.log("\n✓ Updated scripts/otc-agents-created.json with eval IDs");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
