/**
 * Phase 6 — Production eval datasets + suites for OTC-AGT-008 and OTC-AGT-009
 * Usage: node scripts/create-otc-evals-prod.mjs <BASE_URL> <DISPUTE_AGENT_ID> <CASH_AGENT_ID>
 */

const BASE_URL        = process.argv[2] || "http://localhost:5000";
const DISPUTE_AGENT_ID = process.argv[3];
const CASH_AGENT_ID    = process.argv[4];

if (!DISPUTE_AGENT_ID || !CASH_AGENT_ID) {
  console.error("Usage: node create-otc-evals-prod.mjs <BASE_URL> <DISPUTE_AGENT_ID> <CASH_AGENT_ID>");
  process.exit(1);
}

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
    throw new Error(`API error ${res.status}`);
  }
  return json;
}

const disputeTestCases = [
  {
    name: "Pricing Error — Standard Customer — Full Credit",
    inputScenario: "Customer ABC Corp disputes invoice INV-2024-1201 for $8,500. PO #PO-88721 specifies unit price of $85.00 per unit × 100 units = $8,500. Invoice shows $95.00 per unit = $9,500. Customer has deducted $1,000 from payment. Customer email attached stating price discrepancy.",
    expectedBehavior: "Classify as pricing_error with confidence ≥0.95. Root cause: price master mismatch (ERP loaded $95 instead of $85 per contract). Recommend full credit of $1,000. Amount ≤$5,000 so supervisor notification only, no explicit approval block. Issue credit memo and communicate resolution within 1 business day.",
    evaluationCriteria: [
      { criterion: "Correct dispute classification", weight: 0.30, passMark: "pricing_error" },
      { criterion: "Root cause identification", weight: 0.25, passMark: "price master mismatch" },
      { criterion: "Correct credit amount", weight: 0.25, passMark: "$1,000" },
      { criterion: "Correct approval threshold applied", weight: 0.20, passMark: "auto-approve permitted" },
    ],
    difficultyTier: "routine", scenarioCategory: "happy_path",
    tags: ["pricing_error", "full_credit", "standard_customer"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Unauthorized Deduction — Strategic Customer — Reject with Evidence",
    inputScenario: "Strategic customer MegaRetail Inc takes $12,000 deduction coded 'PROMO-X99' on payment for invoice INV-2024-1890 ($75,000). Deduction code PROMO-X99 does not exist in approved promotion schedule for this customer or period. Customer claims it was for Q4 end-cap promotion.",
    expectedBehavior: "Classify as unauthorized_deduction with confidence ≥0.90. Flag as CRITICAL priority (strategic customer + amount > $10K). Route to Sales team. Reject deduction with evidence package showing PROMO-X99 not in approved schedule. Activate Customer Relationship at Risk runbook. Notify VP Finance and account executive. Do not issue credit.",
    evaluationCriteria: [
      { criterion: "Correct dispute classification", weight: 0.25, passMark: "unauthorized_deduction" },
      { criterion: "CRITICAL priority assignment", weight: 0.20, passMark: "CRITICAL" },
      { criterion: "Correct routing to Sales", weight: 0.20, passMark: "Sales" },
      { criterion: "Evidence-based rejection (no credit)", weight: 0.20, passMark: "reject_with_evidence" },
      { criterion: "Relationship risk runbook activated", weight: 0.15, passMark: "Customer Relationship at Risk" },
    ],
    difficultyTier: "challenging", scenarioCategory: "edge_cases",
    tags: ["unauthorized_deduction", "strategic_customer", "rejection"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Duplicate Invoice — Full Credit Auto-Approved",
    inputScenario: "Customer Globex Ltd submits dispute for invoice INV-2024-2244 ($3,200) claiming they were charged twice for the same order. Order #ORD-55123 placed once on Oct 15. AR records show INV-2024-2244 ($3,200) dated Oct 15 and INV-2024-2251 ($3,200) dated Oct 16 — both reference ORD-55123.",
    expectedBehavior: "Classify as duplicate_invoice with confidence ≥0.99. Identify INV-2024-2251 as the duplicate (same order, generated next day). Issue full credit of $3,200. Amount < $5,000 so auto-approve is permitted. Void INV-2024-2251 in billing system. File IT ticket for billing system audit.",
    difficultyTier: "routine", scenarioCategory: "happy_path",
    tags: ["duplicate_invoice", "auto_resolution", "billing_error"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Quality Dispute — Partial Credit with Evidence Gathering",
    inputScenario: "Customer TechBuild Corp disputes invoice INV-2024-3301 for $22,000 (Order #ORD-67810). Claims 40 of 200 units arrived damaged (SKU: HDMI-4K-Pro). Provides photos of damaged packaging. Delivery was Oct 20 via FedEx freight.",
    expectedBehavior: "Classify as quality_dispute with confidence ≥0.90. Route to Quality team. Gather POD, FedEx carrier damage report, packing slip, and customer photos. Estimate credit for 40 units × $110 = $4,400. Amount > $500 requires supervisor notification. Issue partial credit of $4,400 upon evidence confirmation.",
    evaluationCriteria: [
      { criterion: "Correct classification as quality_dispute", weight: 0.25, passMark: "quality_dispute" },
      { criterion: "Evidence gathering plan identifies POD and carrier report", weight: 0.30, passMark: "POD and carrier damage report" },
      { criterion: "Correct partial credit amount", weight: 0.25, passMark: "$4,400" },
      { criterion: "Correct approval routing", weight: 0.20, passMark: "supervisor notification" },
    ],
    difficultyTier: "challenging", scenarioCategory: "edge_cases",
    tags: ["quality_dispute", "partial_credit", "carrier_damage"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Aging Dispute — SLA Breach Risk at Day 28",
    inputScenario: "Dispute DIS-2024-0445 for customer NordTech ($15,000 pricing error) has been open for 28 days. Resolution proposed Day 10 but awaiting director approval — no response received in 18 days.",
    expectedBehavior: "Identify SLA breach risk (2 days to 30-day limit). Activate Aging Dispute Alert runbook. Escalate stuck approval to AR Director immediately with urgency flag. Send interim status update to customer NordTech. If no approval within 24 hours, escalate to VP Finance.",
    evaluationCriteria: [
      { criterion: "SLA breach risk identified (2 days)", weight: 0.25, passMark: "2 days to breach" },
      { criterion: "Aging runbook activated", weight: 0.20, passMark: "Aging Dispute Alert runbook" },
      { criterion: "Director escalation initiated", weight: 0.30, passMark: "escalate to Director" },
      { criterion: "Customer update communication planned", weight: 0.25, passMark: "interim update to NordTech" },
    ],
    difficultyTier: "challenging", scenarioCategory: "compliance_critical",
    tags: ["aging_dispute", "sla_breach", "escalation"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Systematic Pattern — 8 Same Root Cause Disputes in 30 Days",
    inputScenario: "Prevention Analytics identifies 8 disputes in the last 30 days all classified as pricing_error with root cause 'incorrect price tier applied for distributor segment'. Total dispute value: $45,000 across 8 customers. All originated from invoices generated the week of Oct 7-11.",
    expectedBehavior: "Confirm systemic error pattern (8 disputes, same root cause, same origin period — triggers systemic threshold of ≥5). Activate Systematic Error Pattern Investigation runbook. Notify IT and operations immediately. Run impact assessment on all Oct 7-11 distributor invoices. Plan batch credit processing. Initiate proactive outreach to all 8 affected customers. File emergency IT ticket for ERP price tier correction.",
    evaluationCriteria: [
      { criterion: "Systemic pattern correctly identified", weight: 0.25, passMark: "systemic error pattern" },
      { criterion: "Systematic Error runbook activated", weight: 0.20, passMark: "Systematic Error Pattern Investigation runbook" },
      { criterion: "IT notification for system correction", weight: 0.20, passMark: "IT notification" },
      { criterion: "Batch resolution plan formulated", weight: 0.20, passMark: "batch credit" },
      { criterion: "Proactive customer communication planned", weight: 0.15, passMark: "proactive outreach" },
    ],
    difficultyTier: "expert", scenarioCategory: "adversarial",
    tags: ["systematic_error", "mass_resolution", "prevention_analytics"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
];

const cashAppTestCases = [
  {
    name: "EDI 820 — Consolidated Payment Covering 12 Invoices",
    inputScenario: "Payment received $145,230.00 from customer Wholesale Partners Inc via EDI 820. Remittance contains 12 invoice references (INV-2024-0801 through INV-2024-0812) with individual amounts totaling $145,230.00. All 12 invoices are open in AR for Wholesale Partners Inc.",
    expectedBehavior: "Parse EDI 820 with ≥98% confidence. Extract all 12 invoice references and amounts correctly. Match each to corresponding open AR invoice — all 12 exact matches found. Auto-apply full payment ($145,230.00) to all 12 invoices. Post 12 cash receipts. Mark all 12 invoices as paid/closed. Zero unapplied balance. No exceptions generated.",
    evaluationCriteria: [
      { criterion: "EDI 820 parsing accuracy", weight: 0.25, passMark: "confidence ≥0.98" },
      { criterion: "All 12 invoices extracted", weight: 0.25, passMark: "12 line items" },
      { criterion: "All 12 invoices matched and applied", weight: 0.30, passMark: "all 12 matched" },
      { criterion: "No exceptions generated", weight: 0.20, passMark: "zero exceptions" },
    ],
    difficultyTier: "routine", scenarioCategory: "happy_path",
    tags: ["EDI_820", "consolidated_payment", "exact_match"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "PDF Remittance — Partial Payment with Valid Trade Promo Deduction",
    inputScenario: "Payment $48,500 received from FoodMart Corp. PDF remittance shows: Invoice INV-2024-1500 billed $50,000 — deduction $1,500 coded 'PROMO-FALL-2024'. Deduction code PROMO-FALL-2024 exists in approved promotion schedule for FoodMart Corp for Q4 2024, approved amount $1,500.",
    expectedBehavior: "Parse PDF via OCR+NLP with confidence ≥0.85. Match $48,500 to INV-2024-1500 (open $50,000). Validate PROMO-FALL-2024 against promotion schedule — found for FoodMart Corp Q4, $1,500 approved. Apply $48,500 to invoice. Offset $1,500 deduction against Trade Promo Accrual account. Invoice fully settled. Auto-apply.",
    evaluationCriteria: [
      { criterion: "PDF parsing with adequate confidence", weight: 0.20, passMark: "confidence ≥0.85" },
      { criterion: "Correct invoice match", weight: 0.25, passMark: "INV-2024-1500 matched" },
      { criterion: "Deduction validated as valid", weight: 0.30, passMark: "PROMO-FALL-2024 valid" },
      { criterion: "Correct offset account used", weight: 0.25, passMark: "Trade Promo Accrual" },
    ],
    difficultyTier: "challenging", scenarioCategory: "edge_cases",
    tags: ["PDF_parsing", "partial_payment", "trade_deduction"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Invalid Deduction — Route to Dispute Resolution Agent",
    inputScenario: "Payment $95,200 from BuildRight Inc for invoice INV-2024-2100 ($100,000). Deduction $4,800 coded 'SHORTAGE-OCT'. POD shows delivery of full order quantity confirmed with customer signature. No shortage claim filed via quality system. No approved shortage allowance in contract.",
    expectedBehavior: "Match $95,200 to INV-2024-2100. Validate SHORTAGE-OCT — POD confirms full delivery signed. Mark deduction INVALID. Apply $95,200 to invoice, leave $4,800 open balance. Create dispute record for unauthorized_deduction and route to OTC-AGT-008 Dispute Resolution Agent. Do not write off the $4,800.",
    evaluationCriteria: [
      { criterion: "Payment correctly matched to invoice", weight: 0.20, passMark: "$95,200 applied to INV-2024-2100" },
      { criterion: "Deduction correctly classified as invalid", weight: 0.30, passMark: "SHORTAGE-OCT invalid" },
      { criterion: "Dispute record created for $4,800", weight: 0.25, passMark: "dispute created" },
      { criterion: "Routed to Dispute Resolution Agent", weight: 0.25, passMark: "OTC-AGT-008" },
    ],
    difficultyTier: "challenging", scenarioCategory: "edge_cases",
    tags: ["invalid_deduction", "dispute_creation", "cross_agent"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Bank Reconciliation — Deposit in Transit and Unrecorded Bank Fee",
    inputScenario: "Bank statement (BAI2) Oct 31 shows ending balance $2,850,000. ERP cash receipts for October total $3,100,000. Bank shows $500 service charge not in ERP. One ERP deposit of $250,000 posted Oct 31 does not appear on Oct 31 bank statement.",
    expectedBehavior: "Identify $250K ERP posting not on bank = deposit in transit (timing difference, will appear Nov 1, no error). Identify $500 bank service charge = unrecorded expense requiring journal entry. After timing adjustment ERP $3,100,000 - $250,000 = $2,850,000 matches bank. Post $500 bank fee journal entry. Provide SOX-compliant reconciliation workpaper.",
    evaluationCriteria: [
      { criterion: "Deposit in transit correctly identified", weight: 0.25, passMark: "$250,000 deposit in transit" },
      { criterion: "Bank fee correctly identified as unrecorded", weight: 0.30, passMark: "$500 bank fee unrecorded" },
      { criterion: "Correct next action (journal entry)", weight: 0.25, passMark: "post $500 journal entry" },
      { criterion: "SOX documentation requirement addressed", weight: 0.20, passMark: "reconciliation workpaper" },
    ],
    difficultyTier: "challenging", scenarioCategory: "compliance_critical",
    tags: ["bank_reconciliation", "deposit_in_transit", "SOX"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Exception Prioritization — Mixed Aging and Tier Queue",
    inputScenario: "Unmatched payment queue: (A) $250,000 from strategic customer GlobalMfg, 1 day old, no remittance. (B) $12,000 from standard customer SmallCo, 8 days old, period end tomorrow. (C) $500 from standard customer TinyCo, 15 days old. (D) $85,000 from preferred customer RegionalDistrib, 3 days old, contains unvalidated deduction $5,000.",
    expectedBehavior: "Prioritize: (1) GlobalMfg $250K — Critical (strategic + high amount, contact immediately for remittance). (2) RegionalDistrib $85K — Critical (high amount + deduction risk). (3) SmallCo $12K — High (period-end cutoff risk, process today). (4) TinyCo $500 — Low (process tomorrow). Notify AR supervisor of two Critical items.",
    evaluationCriteria: [
      { criterion: "GlobalMfg ranked first as Critical", weight: 0.25, passMark: "GlobalMfg first / Critical" },
      { criterion: "RegionalDistrib ranked second due to deduction risk", weight: 0.25, passMark: "RegionalDistrib second" },
      { criterion: "SmallCo period-end urgency recognized", weight: 0.25, passMark: "SmallCo High / period-end" },
      { criterion: "Supervisor notification triggered", weight: 0.25, passMark: "supervisor notification" },
    ],
    difficultyTier: "challenging", scenarioCategory: "edge_cases",
    tags: ["exception_prioritization", "queue_management", "period_end"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
  {
    name: "Cross-Currency EUR Wire — FX Variance Above Threshold",
    inputScenario: "Wire payment EUR 42,000 received from EuroTech GmbH. Open invoice INV-2024-EUR-055 shows USD 45,150 (EUR 42,000 × contract rate 1.0750 on Oct 1). Payment received Oct 28, ECB rate 1.0820.",
    expectedBehavior: "Convert EUR 42,000 at Oct 28 rate 1.0820 = USD 45,444. Invoice USD 45,150. FX variance $294 (0.65%) exceeds 0.5% auto-match threshold. Flag for review — variance is FX movement not customer underpayment (customer paid correct EUR amount). Queue for 1-click confirmation with FX gain/loss journal entry suggested.",
    evaluationCriteria: [
      { criterion: "Correct USD conversion at payment date rate", weight: 0.25, passMark: "$45,444 at 1.0820" },
      { criterion: "FX variance correctly calculated (0.65%)", weight: 0.25, passMark: "0.65% variance" },
      { criterion: "Correctly flagged above 0.5% threshold", weight: 0.25, passMark: "queued for confirmation" },
      { criterion: "FX gain/loss journal entry suggested (not open balance)", weight: 0.25, passMark: "FX journal entry" },
    ],
    difficultyTier: "expert", scenarioCategory: "adversarial",
    tags: ["cross_currency", "FX_variance", "international"], status: "active", aiGenerated: false, contributorOrg: "Order-to-Cash Team",
  },
];

async function run() {
  console.log("=".repeat(60));
  console.log("Phase 6: Prod Eval Datasets & Suites");
  console.log(`Target:         ${BASE_URL}`);
  console.log(`Dispute Agent:  ${DISPUTE_AGENT_ID}`);
  console.log(`Cash Agent:     ${CASH_AGENT_ID}`);
  console.log("=".repeat(60));

  // ── OTC-AGT-008 ─────────────────────────────────────────────────
  console.log("\n[6a] OTC-AGT-008 Dispute Resolution Dataset...");
  const dd = await api("POST", "/api/golden-datasets", {
    name: "OTC-AGT-008 Dispute Resolution Evaluation Dataset",
    description: "Evaluation dataset covering classification accuracy, root cause analysis, resolution appropriateness, communication quality, and SLA compliance across all dispute types and customer tiers.",
    industry: "enterprise", useCase: "Dispute Classification and Resolution",
    version: "1.0", status: "active", qualityCoverage: 0.92,
    tags: ["dispute-resolution", "order-to-cash", "credit-memo", "classification"],
    scenarioCategories: { "Pricing Error": 20, "Quantity Discrepancy": 15, "Quality Dispute": 15, "Duplicate Invoice": 10, "Unauthorized Deduction": 20, "High-Value Dispute": 10, "Aging Dispute SLA": 10 },
    benchmarkAvg: 0.93, benchmarkRange: { low: 0.85, high: 0.98 },
    performanceBenchmarks: { classificationAccuracy: 0.95, rootCauseAccuracy: 0.88, resolutionAppropriateness: 0.92, cycleTimeTarget: 10 },
    aiGenerated: false, contributorCount: 1, contributors: ["Order-to-Cash Team"],
  });
  console.log(`  ✓ Dataset: ${dd.id}`);

  for (const tc of disputeTestCases) {
    await api("POST", `/api/golden-datasets/${dd.id}/test-cases`, tc);
  }
  console.log(`  ✓ Added ${disputeTestCases.length} test cases`);

  const ds = await api("POST", "/api/evals", {
    agentId: DISPUTE_AGENT_ID, goldenDatasetId: dd.id,
    name: "OTC-AGT-008 Dispute Resolution Core Regression Suite",
    type: "regression", industry: "enterprise", totalCases: disputeTestCases.length, passRate: 0,
    thresholdConfig: { minPassRate: 0.92, classificationAccuracy: 0.95, resolutionAccuracy: 0.90 },
    coverageTags: ["dispute_classification", "root_cause_analysis", "resolution_recommendation", "sla_compliance"],
    ontologyTags: ["dispute", "credit-memo", "order-to-cash"],
  });
  console.log(`  ✓ Eval suite: ${ds.id}`);

  // ── OTC-AGT-009 ─────────────────────────────────────────────────
  console.log("\n[6b] OTC-AGT-009 Cash Application Dataset...");
  const cd = await api("POST", "/api/golden-datasets", {
    name: "OTC-AGT-009 Cash Application & Reconciliation Evaluation Dataset",
    description: "Evaluation covering remittance parsing accuracy, invoice matching rates, deduction classification, bank reconciliation completeness, and exception prioritization. Includes complex multi-invoice payments, cross-currency scenarios, and period-end close cases.",
    industry: "enterprise", useCase: "Cash Application and Bank Reconciliation",
    version: "1.0", status: "active", qualityCoverage: 0.93,
    tags: ["cash-application", "order-to-cash", "remittance", "bank-reconciliation"],
    scenarioCategories: { "Exact Match": 20, "Consolidated Payment": 15, "Partial Payment": 15, "Deduction Classification": 20, "Bank Reconciliation": 15, "Exception Handling": 15 },
    benchmarkAvg: 0.92, benchmarkRange: { low: 0.85, high: 0.99 },
    performanceBenchmarks: { autoMatchRate: 0.90, remittanceParsingAccuracy: 0.92, deductionClassificationAccuracy: 0.90, reconciliationCompleteness: 0.98 },
    aiGenerated: false, contributorCount: 1, contributors: ["Order-to-Cash Team"],
  });
  console.log(`  ✓ Dataset: ${cd.id}`);

  for (const tc of cashAppTestCases) {
    await api("POST", `/api/golden-datasets/${cd.id}/test-cases`, tc);
  }
  console.log(`  ✓ Added ${cashAppTestCases.length} test cases`);

  const cs = await api("POST", "/api/evals", {
    agentId: CASH_AGENT_ID, goldenDatasetId: cd.id,
    name: "OTC-AGT-009 Cash Application Core Regression Suite",
    type: "regression", industry: "enterprise", totalCases: cashAppTestCases.length, passRate: 0,
    thresholdConfig: { minPassRate: 0.90, autoMatchRateTarget: 0.90, parsingAccuracyTarget: 0.92 },
    coverageTags: ["remittance_parsing", "invoice_matching", "deduction_coding", "bank_reconciliation"],
    ontologyTags: ["cash-application", "remittance", "order-to-cash"],
  });
  console.log(`  ✓ Eval suite: ${cs.id}`);

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("PROD MIGRATION COMPLETE — ALL 7 PHASES");
  console.log("=".repeat(60));
  console.log("\nOTC-AGT-008 Dispute Resolution Agent");
  console.log(`  Agent ID:      ${DISPUTE_AGENT_ID}`);
  console.log(`  Eval Dataset:  ${dd.id}`);
  console.log(`  Eval Suite:    ${ds.id}`);
  console.log("\nOTC-AGT-009 Cash Application & Reconciliation Agent");
  console.log(`  Agent ID:      ${CASH_AGENT_ID}`);
  console.log(`  Eval Dataset:  ${cd.id}`);
  console.log(`  Eval Suite:    ${cs.id}`);

  const fs = await import("fs");
  const prodIds = {
    target: BASE_URL,
    disputeAgent: { id: DISPUTE_AGENT_ID, evalDataset: dd.id, evalSuite: ds.id },
    cashAgent: { id: CASH_AGENT_ID, evalDataset: cd.id, evalSuite: cs.id },
  };
  fs.writeFileSync("./scripts/otc-agents-prod-ids.json", JSON.stringify(prodIds, null, 2));
  console.log("\n✓ Prod IDs saved to scripts/otc-agents-prod-ids.json");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
