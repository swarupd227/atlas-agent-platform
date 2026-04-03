/**
 * OTC Eval Phase — corrected field names
 * Continues from where create-otc-agents.mjs left off.
 * Dispute agent golden dataset already created: 6d9bd008-1c5a-4290-a0f2-224f224cae04
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";

const DISPUTE_AGENT_ID       = "ff6f9c53-397f-4915-b362-d37a7d6d8299";
const CASH_AGENT_ID          = "99fe20ef-ec54-4447-9dac-e88e54827f84";
const DISPUTE_DATASET_ID     = "6d9bd008-1c5a-4290-a0f2-224f224cae04"; // already created

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

const disputeTestCases = [
  {
    name: "Pricing Error — Standard Customer — Full Credit",
    inputScenario: "Customer ABC Corp disputes invoice INV-2024-1201 for $8,500. PO #PO-88721 specifies unit price of $85.00 per unit × 100 units = $8,500. Invoice shows $95.00 per unit = $9,500. Customer has deducted $1,000 from payment. Customer email attached stating price discrepancy.",
    expectedBehavior: "Classify as pricing_error with confidence ≥ 0.95. Identify root cause as price master mismatch (ERP loaded $95 instead of $85 per contract). Recommend full credit of $1,000. Amount ≤ $5,000 so supervisor notification only, no explicit approval block. Issue credit memo and communicate resolution within 1 business day.",
    evaluationCriteria: [
      { criterion: "Correct dispute classification", weight: 0.30, passMark: "pricing_error" },
      { criterion: "Root cause identification", weight: 0.25, passMark: "price master mismatch" },
      { criterion: "Correct credit amount", weight: 0.25, passMark: "$1,000" },
      { criterion: "Correct approval threshold applied", weight: 0.20, passMark: "auto-approve permitted" },
    ],
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["pricing_error", "full_credit", "standard_customer"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Unauthorized Deduction — Strategic Customer — Reject with Evidence",
    inputScenario: "Strategic customer MegaRetail Inc takes $12,000 deduction coded 'PROMO-X99' on payment for invoice INV-2024-1890 ($75,000). Deduction code PROMO-X99 does not exist in approved promotion schedule for this customer or the current period. Customer claims it was for Q4 end-cap promotion.",
    expectedBehavior: "Classify as unauthorized_deduction with confidence ≥ 0.90. Flag as CRITICAL priority (strategic customer + amount > $10K). Route to Sales team for relationship management. Reject deduction with evidence package showing PROMO-X99 not in approved schedule. Activate Customer Relationship at Risk runbook. Notify VP Finance and account executive. Do not issue credit.",
    evaluationCriteria: [
      { criterion: "Correct dispute classification", weight: 0.25, passMark: "unauthorized_deduction" },
      { criterion: "CRITICAL priority assignment", weight: 0.20, passMark: "CRITICAL" },
      { criterion: "Correct routing to Sales", weight: 0.20, passMark: "Sales" },
      { criterion: "Evidence-based rejection (no credit)", weight: 0.20, passMark: "reject_with_evidence" },
      { criterion: "Relationship risk runbook activated", weight: 0.15, passMark: "Customer Relationship at Risk" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "edge_cases",
    tags: ["unauthorized_deduction", "strategic_customer", "rejection", "high_value"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Duplicate Invoice — Full Credit Auto-Approved",
    inputScenario: "Customer Globex Ltd submits dispute for invoice INV-2024-2244 ($3,200) claiming they were charged twice for the same order. Order #ORD-55123 placed once on Oct 15. AR records show INV-2024-2244 ($3,200) dated Oct 15 and INV-2024-2251 ($3,200) dated Oct 16 — both reference ORD-55123.",
    expectedBehavior: "Classify as duplicate_invoice with confidence ≥ 0.99. Identify INV-2024-2251 as the duplicate (same order, generated next day). Issue full credit of $3,200. Amount < $5,000 so auto-approve is permitted. Void INV-2024-2251 in billing system. File IT ticket for billing system audit. Communicate resolution to Globex Ltd.",
    evaluationCriteria: [
      { criterion: "Correct duplicate identification", weight: 0.35, passMark: "INV-2024-2251 is duplicate" },
      { criterion: "Full credit amount correct", weight: 0.30, passMark: "$3,200" },
      { criterion: "Auto-approve correctly applied", weight: 0.20, passMark: "auto-approved" },
      { criterion: "System correction recommended", weight: 0.15, passMark: "IT ticket" },
    ],
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["duplicate_invoice", "auto_resolution", "billing_error"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Quality Dispute — Partial Credit with Evidence Gathering",
    inputScenario: "Customer TechBuild Corp disputes invoice INV-2024-3301 for $22,000 (Order #ORD-67810). Claims 40 of 200 units arrived damaged (SKU: HDMI-4K-Pro). Provides photos of damaged packaging. Delivery was Oct 20 via FedEx freight. Customer filed claim on Oct 22.",
    expectedBehavior: "Classify as quality_dispute with confidence ≥ 0.90. Route to Quality team. Gather required evidence: POD (check for noted damage at delivery), FedEx carrier damage report, packing slip, and customer photos. Estimate credit for 40 units × $110 = $4,400. Amount > $500 requires supervisor notification. Issue partial credit of $4,400 upon evidence confirmation.",
    evaluationCriteria: [
      { criterion: "Correct classification as quality_dispute", weight: 0.25, passMark: "quality_dispute" },
      { criterion: "Evidence gathering plan identifies POD and carrier report", weight: 0.30, passMark: "POD and carrier damage report" },
      { criterion: "Correct partial credit amount", weight: 0.25, passMark: "$4,400" },
      { criterion: "Correct approval routing (supervisor notification)", weight: 0.20, passMark: "supervisor notification" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "edge_cases",
    tags: ["quality_dispute", "partial_credit", "evidence_gathering", "carrier_damage"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Aging Dispute — SLA Breach Risk at Day 28",
    inputScenario: "Dispute DIS-2024-0445 for customer NordTech ($15,000 pricing error) has been open for 28 days. Classification confirmed Day 1. Evidence gathered Day 3. Root cause confirmed Day 8. Resolution recommendation made Day 10 but awaiting director approval. Director approval request sent Day 10 with no response received.",
    expectedBehavior: "Identify SLA breach risk (2 days to 30-day limit). Activate Aging Dispute Alert runbook. Immediately escalate the stuck approval request to AR Director with urgency flag and countdown notice. Send interim status update to customer NordTech acknowledging delay and committing to resolution by Day 30. Log escalation with timestamp. If no approval within 24 hours, escalate to VP Finance.",
    evaluationCriteria: [
      { criterion: "SLA breach risk identified correctly (2 days)", weight: 0.25, passMark: "2 days to breach" },
      { criterion: "Aging runbook activated", weight: 0.20, passMark: "Aging Dispute Alert runbook" },
      { criterion: "Director escalation initiated", weight: 0.30, passMark: "escalate to Director" },
      { criterion: "Customer update communication planned", weight: 0.25, passMark: "interim update to NordTech" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "compliance_critical",
    tags: ["aging_dispute", "sla_breach", "escalation", "approval_stuck"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Systematic Pattern — 8 Same Root Cause Disputes in 30 Days",
    inputScenario: "Prevention Analytics identifies 8 disputes in the last 30 days all classified as pricing_error with root cause 'incorrect price tier applied for distributor segment'. Total dispute value: $45,000 across 8 customers. All originated from invoices generated the same week of Oct 7-11.",
    expectedBehavior: "Confirm systemic error pattern (8 disputes, same root cause, same origin period triggers systemic threshold of ≥ 5). Activate Systematic Error Pattern Investigation runbook. Notify IT and operations immediately with full evidence. Run impact assessment on all invoices in distributor segment for Oct 7-11. Plan batch credit processing for all affected invoices. Initiate proactive customer outreach to all 8 affected customers. File emergency IT ticket for ERP price tier correction. Monitor for recurrence.",
    evaluationCriteria: [
      { criterion: "Systemic pattern correctly identified", weight: 0.25, passMark: "systemic error pattern" },
      { criterion: "Systematic Error runbook activated", weight: 0.20, passMark: "Systematic Error Pattern Investigation runbook" },
      { criterion: "IT notification for system correction", weight: 0.20, passMark: "IT notification" },
      { criterion: "Batch resolution plan formulated", weight: 0.20, passMark: "batch credit" },
      { criterion: "Proactive customer communication planned", weight: 0.15, passMark: "proactive outreach" },
    ],
    difficultyTier: "expert",
    scenarioCategory: "adversarial",
    tags: ["systematic_error", "mass_resolution", "prevention_analytics", "price_master"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
];

const cashAppTestCases = [
  {
    name: "EDI 820 — Consolidated Payment Covering 12 Invoices",
    inputScenario: "Payment received $145,230.00 from customer Wholesale Partners Inc via EDI 820. Remittance contains 12 invoice references (INV-2024-0801 through INV-2024-0812) with individual amounts totaling $145,230.00. All 12 invoices are open in AR for Wholesale Partners Inc.",
    expectedBehavior: "Parse EDI 820 with ≥ 98% confidence. Extract all 12 invoice references and amounts correctly. Match each to corresponding open AR invoice for Wholesale Partners Inc — all 12 exact matches found. Auto-apply full payment ($145,230.00) to all 12 invoices. Post 12 cash receipts to AR ledger. Mark all 12 invoices as paid/closed. Zero unapplied balance. No exceptions generated.",
    evaluationCriteria: [
      { criterion: "EDI 820 parsing accuracy", weight: 0.25, passMark: "confidence ≥ 0.98" },
      { criterion: "All 12 invoices extracted", weight: 0.25, passMark: "12 line items" },
      { criterion: "All 12 invoices matched and applied", weight: 0.30, passMark: "all 12 matched" },
      { criterion: "No exceptions generated", weight: 0.20, passMark: "zero exceptions" },
    ],
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["EDI_820", "consolidated_payment", "exact_match", "auto_apply"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "PDF Remittance — Partial Payment with Valid Trade Promo Deduction",
    inputScenario: "Payment $48,500 received from FoodMart Corp. PDF remittance attached showing: Invoice INV-2024-1500 billed $50,000 — deduction $1,500 coded 'PROMO-FALL-2024'. Deduction code PROMO-FALL-2024 exists in approved promotion schedule for FoodMart Corp for Q4 2024, approved amount $1,500.",
    expectedBehavior: "Parse PDF remittance via OCR+NLP with confidence ≥ 0.85. Match $48,500 to INV-2024-1500 (open balance $50,000). Validate deduction PROMO-FALL-2024 against promotion schedule — found for FoodMart Corp Q4, $1,500 approved. Apply $48,500 to invoice. Offset $1,500 deduction against Trade Promo Accrual account. Invoice fully settled (zero balance). Auto-apply — no manual review needed.",
    evaluationCriteria: [
      { criterion: "PDF parsing with adequate confidence", weight: 0.20, passMark: "confidence ≥ 0.85" },
      { criterion: "Correct invoice match", weight: 0.25, passMark: "INV-2024-1500 matched" },
      { criterion: "Deduction validated as valid", weight: 0.30, passMark: "PROMO-FALL-2024 valid" },
      { criterion: "Correct offset account used", weight: 0.25, passMark: "Trade Promo Accrual" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "edge_cases",
    tags: ["PDF_parsing", "partial_payment", "trade_deduction", "valid_deduction"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Invalid Deduction — Route to Dispute Resolution Agent",
    inputScenario: "Payment $95,200 received from BuildRight Inc for invoice INV-2024-2100 ($100,000). Deduction $4,800 coded 'SHORTAGE-OCT'. POD from WMS shows delivery of full order quantity (all 500 units) confirmed with customer signature on Oct 15. No shortage claim filed via quality system. No approved shortage allowance in BuildRight Inc contract.",
    expectedBehavior: "Match $95,200 to INV-2024-2100 (open $100,000). Validate deduction SHORTAGE-OCT — POD confirms full delivery signed by BuildRight Inc, no shortage in system, no contract allowance. Mark deduction INVALID. Apply $95,200 to invoice, leaving $4,800 open balance on INV-2024-2100. Create dispute record with classification 'unauthorized_deduction' and route to OTC-AGT-008 Dispute Resolution Agent for handling. Do not write off the $4,800.",
    evaluationCriteria: [
      { criterion: "Payment correctly matched to invoice", weight: 0.20, passMark: "$95,200 applied to INV-2024-2100" },
      { criterion: "Deduction correctly classified as invalid", weight: 0.30, passMark: "SHORTAGE-OCT invalid" },
      { criterion: "Dispute record created for $4,800", weight: 0.25, passMark: "dispute created" },
      { criterion: "Routed to Dispute Resolution Agent", weight: 0.25, passMark: "OTC-AGT-008" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "edge_cases",
    tags: ["invalid_deduction", "dispute_creation", "cross_agent", "unauthorized"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Bank Reconciliation — Deposit in Transit and Unrecorded Bank Fee",
    inputScenario: "Bank statement (BAI2 format) for Oct 31 shows ending balance $2,850,000. ERP AR cash receipts for October total $3,100,000 (opening balance $250,000 + receipts). Bank statement shows a $500 bank service charge not reflected in ERP. One ERP cash receipt of $250,000 posted Oct 31 does not appear on the Oct 31 bank statement.",
    expectedBehavior: "Identify: $250,000 ERP posting not on bank = deposit in transit (valid timing difference, will appear Nov 1 bank statement — no error). $500 bank charge on statement not in ERP = unrecorded expense requiring journal entry. After timing adjustment: ERP $3,100,000 - $250,000 deposit in transit = $2,850,000 = bank balance (balanced except for $500 bank fee). Resolution: post $500 bank service charge journal entry to ERP. Reconciliation status: exception (not balanced until bank fee posted). Provide SOX-compliant reconciliation workpaper with all items documented.",
    evaluationCriteria: [
      { criterion: "Deposit in transit correctly identified", weight: 0.25, passMark: "$250,000 deposit in transit" },
      { criterion: "Bank fee correctly identified as unrecorded", weight: 0.30, passMark: "$500 bank fee unrecorded" },
      { criterion: "Correct next action (journal entry)", weight: 0.25, passMark: "post $500 journal entry" },
      { criterion: "SOX documentation requirement addressed", weight: 0.20, passMark: "reconciliation workpaper" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "compliance_critical",
    tags: ["bank_reconciliation", "deposit_in_transit", "bank_fee", "SOX"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Exception Prioritization — Mixed Aging and Tier Queue",
    inputScenario: "Unmatched payment queue today: (A) $250,000 from strategic customer GlobalMfg, received yesterday, no remittance. (B) $12,000 from standard customer SmallCo, 8 days old, period end tomorrow. (C) $500 from standard customer TinyCo, 15 days old, no action taken. (D) $85,000 from preferred customer RegionalDistrib, 3 days old, contains unvalidated deduction $5,000.",
    expectedBehavior: "Prioritize queue: (1) GlobalMfg $250K — Critical priority (strategic customer, large amount, contact immediately for remittance). (2) RegionalDistrib $85K — Critical priority (high amount, deduction risk, must resolve before period end). (3) SmallCo $12K — High priority (period end tomorrow, must process today). (4) TinyCo $500 — Low priority (process tomorrow). Notify AR supervisor of two Critical items. Escalation threshold alert: two items requiring attention.",
    evaluationCriteria: [
      { criterion: "GlobalMfg ranked first as Critical", weight: 0.25, passMark: "GlobalMfg first / Critical" },
      { criterion: "RegionalDistrib ranked second due to deduction risk", weight: 0.25, passMark: "RegionalDistrib second" },
      { criterion: "SmallCo period-end urgency recognized", weight: 0.25, passMark: "SmallCo High priority period-end" },
      { criterion: "Supervisor notification triggered", weight: 0.25, passMark: "supervisor notification" },
    ],
    difficultyTier: "challenging",
    scenarioCategory: "edge_cases",
    tags: ["exception_prioritization", "queue_management", "period_end"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Cross-Currency Payment — EUR Wire with FX Variance Above Threshold",
    inputScenario: "Wire payment EUR 42,000 received from EuroTech GmbH (Germany). Open invoice INV-2024-EUR-055 shows USD 45,150.00 (invoiced at EUR 42,000 × contract rate 1.0750 on invoice date Oct 1). Payment received Oct 28. ECB published rate on Oct 28 is 1.0820. Bank reference: WT-2024-1028-EUR42000.",
    expectedBehavior: "Convert EUR 42,000 at Oct 28 ECB rate 1.0820 = USD 45,444.00. Invoice USD 45,150.00. FX variance: $294.00 = 0.65%. FX variance exceeds 0.5% auto-match threshold. Flag for review — this is FX movement, not customer underpayment (customer paid correct EUR amount). Queue for 1-click confirmation by AR specialist. Suggested action: match with FX variance journal entry to FX gain/loss account for $294. Do not treat as partial payment or open balance.",
    evaluationCriteria: [
      { criterion: "Correct USD conversion at payment date rate", weight: 0.25, passMark: "$45,444 at 1.0820" },
      { criterion: "FX variance correctly calculated (0.65%)", weight: 0.25, passMark: "0.65% variance" },
      { criterion: "Correctly flagged above 0.5% threshold", weight: 0.25, passMark: "queued for confirmation" },
      { criterion: "FX gain/loss journal entry suggested (not open balance)", weight: 0.25, passMark: "FX journal entry" },
    ],
    difficultyTier: "expert",
    scenarioCategory: "adversarial",
    tags: ["cross_currency", "FX_variance", "suggested_match", "international"],
    status: "active",
    aiGenerated: false,
    contributorOrg: "Order-to-Cash Team",
  },
];

async function addTestCases(datasetId, cases, label) {
  console.log(`\n  Adding ${cases.length} test cases to ${label} dataset (${datasetId})...`);
  let count = 0;
  for (const tc of cases) {
    await api("POST", `/api/golden-datasets/${datasetId}/test-cases`, tc);
    count++;
  }
  console.log(`  ✓ Added ${count} test cases`);
}

async function createEvalSuite(data, label) {
  console.log(`  Creating eval suite for ${label}...`);
  const suite = await api("POST", "/api/evals", data);
  console.log(`  ✓ Eval suite created: ${suite.id}`);
  return suite;
}

async function main() {
  console.log("=".repeat(70));
  console.log("OTC Eval Phase v2 — Correct Field Names");
  console.log("=".repeat(70));

  // Phase 6a: Add test cases to already-created Dispute dataset
  await addTestCases(DISPUTE_DATASET_ID, disputeTestCases, "OTC-AGT-008 Dispute Resolution");

  // Create eval suite for dispute agent
  const disputeSuite = await createEvalSuite({
    agentId: DISPUTE_AGENT_ID,
    name: "OTC-AGT-008 Dispute Resolution Core Regression Suite",
    type: "regression",
    goldenDatasetId: DISPUTE_DATASET_ID,
    industry: "enterprise",
    totalCases: disputeTestCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.92, classificationAccuracy: 0.95, resolutionAccuracy: 0.90 },
    coverageTags: ["dispute_classification", "root_cause_analysis", "resolution_recommendation", "sla_compliance"],
    ontologyTags: ["dispute", "credit-memo", "order-to-cash"],
  }, "OTC-AGT-008");

  // Phase 6b: Create Cash Application golden dataset
  console.log("\n[Phase 6b] Creating OTC-AGT-009 Cash Application Dataset...");
  const cashDataset = await api("POST", "/api/golden-datasets", {
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
  console.log(`  ✓ Created Cash Application dataset: ${cashDataset.id}`);

  await addTestCases(cashDataset.id, cashAppTestCases, "OTC-AGT-009 Cash Application");

  const cashSuite = await createEvalSuite({
    agentId: CASH_AGENT_ID,
    name: "OTC-AGT-009 Cash Application Core Regression Suite",
    type: "regression",
    goldenDatasetId: cashDataset.id,
    industry: "enterprise",
    totalCases: cashAppTestCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.90, autoMatchRateTarget: 0.90, parsingAccuracyTarget: 0.92 },
    coverageTags: ["remittance_parsing", "invoice_matching", "deduction_coding", "bank_reconciliation"],
    ontologyTags: ["cash-application", "remittance", "order-to-cash"],
  }, "OTC-AGT-009");

  // Save results
  const fs = await import("fs");
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync("./scripts/otc-agents-created.json", "utf8")); } catch {}
  existing.disputeEval = { dataset: { id: DISPUTE_DATASET_ID }, suite: disputeSuite };
  existing.cashAppEval = { dataset: cashDataset, suite: cashSuite };
  fs.writeFileSync("./scripts/otc-agents-created.json", JSON.stringify(existing, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log("ALL PHASES COMPLETE");
  console.log("=".repeat(70));
  console.log("\nOTC-AGT-008 Dispute Resolution Agent");
  console.log(`  Agent:          ${DISPUTE_AGENT_ID}`);
  console.log(`  Eval Dataset:   ${DISPUTE_DATASET_ID}`);
  console.log(`  Eval Suite:     ${disputeSuite.id}`);
  console.log("\nOTC-AGT-009 Cash Application & Reconciliation Agent");
  console.log(`  Agent:          ${CASH_AGENT_ID}`);
  console.log(`  Eval Dataset:   ${cashDataset.id}`);
  console.log(`  Eval Suite:     ${cashSuite.id}`);
  console.log("\n✓ Results saved to scripts/otc-agents-created.json");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
