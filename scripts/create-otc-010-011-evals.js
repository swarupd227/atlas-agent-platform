/**
 * Create eval datasets + suites for OTC-AGT-010 and OTC-AGT-011
 * Agents are already created — this adds the missing eval components.
 */
const BASE_URL = process.argv[2] || "http://localhost:5000";
const ORG_ID   = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";
const RETURNS_AGENT_ID  = process.argv[3] || "d9a2e568-7a29-4376-a7fd-3580a2c012b0";
const CONTRACT_AGENT_ID = process.argv[4] || "ffcce490-9c78-4130-a128-ded11a1b2d19";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-organization-id": ORG_ID },
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

async function main() {
  console.log("Creating eval datasets for OTC-AGT-010 and OTC-AGT-011...\n");

  // ── OTC-AGT-010 Returns & Refund Processing ─────────────────────────────
  console.log("[1] OTC-AGT-010 Returns & Refund Processing Eval Dataset...");
  const returnsDataset = await api("POST", "/api/golden-datasets", {
    name: "OTC-AGT-010 Returns & Refund Processing Evaluation Dataset",
    description: "Evaluation dataset covering eligibility validation, RMA generation, refund calculation accuracy, disposition routing, fraud detection, regulatory compliance (Regulation Z, consumer protection), cross-border returns, and carrier damage claims.",
    industry: "enterprise",
    useCase: "Returns and Refund Processing — Post-Sale Order-to-Cash",
    version: "1.0",
    status: "active",
    tags: ["returns", "refund", "RMA", "order-to-cash", "regulation-z", "fraud"],
    scenarioCategories: {
      "Eligibility Validation": 20,
      "RMA Generation": 15,
      "Refund Calculation": 20,
      "Inspection and Disposition": 15,
      "Fraud Detection": 10,
      "Regulatory Compliance": 10,
      "Cross-Border Returns": 10,
    },
    coverageDimensions: ["return_type", "eligibility_edge_case", "refund_accuracy", "disposition_routing", "fraud_pattern", "regulatory_scenario"],
    qualityCoverage: 0.97,
    performanceBenchmarks: [
      { name: "rmaProcessingTimeSLA", target: "1 business day" },
      { name: "refundInitiationTimeSLA", target: "1 business day post-inspection" },
      { name: "regulationZComplianceRate", target: 1.0 },
    ],
  });
  console.log(`  ✓ Dataset created: ${returnsDataset.id}`);

  const returnsTestCases = [
    {
      name: "Standard Return — Within Window, Full Refund",
      inputScenario: "Customer CUST-882 requesting return of 2 units of SKU ELEC-450 (laptop, $899/unit) purchased 18 days ago via online channel. Reason: changed mind. Items unopened in original packaging. Order ONL-2024-88412. Return window: 30 days.",
      expectedBehavior: "Confirm eligibility (18/30 days). Generate RMA with insured UPS Ground label (value >$500). Route to CRC. No restocking fee (Grade A anticipated). Full refund $1,798.00 to original payment within 1 business day of receipt. Send customer RMA confirmation.",
      evaluationCriteria: ["eligibility_confirmed", "rma_generated", "correct_refund_amount", "correct_refund_method", "regulation_z_compliant"],
      difficultyTier: "routine",
      scenarioCategory: "happy_path",
      tags: ["standard_return", "full_refund", "grade_a", "within_window"],
      status: "active",
    },
    {
      name: "Return Beyond Window — Strategic Customer Exception",
      inputScenario: "Strategic customer CUST-001 (GlobalCorp, $2.4M annual spend, tier=strategic) requesting return of 5 units SKU FURN-220 ($450/unit) purchased 45 days ago. Return policy is 30 days. Items unopened. Reason: project cancelled.",
      expectedBehavior: "Beyond 30-day window (EP-01). Do not auto-deny strategic tier. Escalate to VP Customer Service for exception approval. If approved: generate RMA with 15% restocking fee. Net refund = $2,250 - $337.50 = $1,912.50. Communicate decision within 1 business day.",
      evaluationCriteria: ["beyond_window_recognized", "strategic_tier_applied", "exception_escalated", "restocking_fee_calculated", "communication_timely"],
      difficultyTier: "moderate",
      scenarioCategory: "edge_case",
      tags: ["beyond_window", "strategic_customer", "exception", "escalation"],
      status: "active",
    },
    {
      name: "Defective Product — Regulation Z Deadline Test",
      inputScenario: "Customer returned defective SKU APPL-110 (blender, $89.99) received at facility today (Day 0). RMA-2024-11-000388. Inspection: MFGR-DEFECT motor failure on first use. Original payment: Visa credit card. Today is Thursday.",
      expectedBehavior: "MFGR-DEFECT confirmed. No restocking fee. Full refund $89.99 + tax to original Visa. Regulation Z: initiate within 7 business days (next Wednesday). Initiate today. Assess CPSC: if 3+ same defects escalate to Product Safety.",
      evaluationCriteria: ["no_restocking_fee_for_defect", "regulation_z_deadline_computed", "refund_initiated_day_zero", "cpsc_assessment_triggered"],
      difficultyTier: "moderate",
      scenarioCategory: "compliance_critical",
      tags: ["defective_product", "regulation_z", "mfgr_defect", "cpsc_assessment"],
      status: "active",
    },
    {
      name: "Refund Calculation — Grade B Electronics with Restocking Fee and Missing Parts",
      inputScenario: "Return for SKU ELEC-220 (tablet, $599.99 + tax $49.50). Purchased 12 days ago. Inspection: Grade B (functional, light scratches). Missing: USB-C cable ($15) and charger ($20). Standard 10% restocking fee applies to Grade B electronics.",
      expectedBehavior: "Grade B. Missing parts deduction: $35. Calculation: $599.99 - 10% restocking ($60.00) - missing parts ($35.00) = $504.99 net item. Tax refund: ($504.99/$599.99) × $49.50 = $41.63. Net refund: $546.62. Provide itemised breakdown to customer.",
      evaluationCriteria: ["grade_b_restocking_fee_applied", "missing_parts_deducted", "tax_refund_prorated", "net_amount_correct", "itemised_breakdown_provided"],
      difficultyTier: "moderate",
      scenarioCategory: "edge_case",
      tags: ["refund_calculation", "restocking_fee", "missing_parts", "grade_b"],
      status: "active",
    },
    {
      name: "Fraud Detection — Item Switching Pattern",
      inputScenario: "Return from CUST-991 for gaming console (SKU ELEC-500, $499.99). Item received: weight 2.1 lbs vs original 8.3 lbs. Inspection: console missing, box contains rocks. Customer lifetime return rate: 28%. Third electronics return this quarter.",
      expectedBehavior: "FRAUD CONFIRMED: Item switching. 75% weight deficit. Console absent. Fraud score high. Actions: deny refund (item not returned), preserve evidence, notify Loss Prevention immediately, flag account for permanent return block, consider law enforcement referral. Communicate decline without revealing investigation details.",
      evaluationCriteria: ["fraud_detected", "fraud_type_identified", "refund_denied", "loss_prevention_notified", "evidence_preserved", "account_flagged"],
      difficultyTier: "complex",
      scenarioCategory: "adversarial",
      tags: ["fraud", "item_switching", "loss_prevention", "deny_refund"],
      status: "active",
    },
    {
      name: "Cross-Border Return — EU Distance Selling Regulations",
      inputScenario: "EU customer CUST-DE-204 (Germany) returning online clothing order (€285) placed 10 days ago citing 14-day EU right to cancel. Items unopened. Original payment: SEPA debit. Company standard return policy: 30 days with restocking fee.",
      expectedBehavior: "EU Distance Selling Right unconditionally supersedes company policy. 14-day right applies (10 days used, 4 remain). Generate DHL Express label with customs docs. Full refund €285 + original shipping to SEPA within 14 days of receipt. VAT refunded in full. Non-compliance creates legal exposure.",
      evaluationCriteria: ["eu_law_applied_over_company_policy", "regulatory_override_documented", "shipping_label_appropriate", "full_refund_including_shipping", "compliance_timeline_met"],
      difficultyTier: "complex",
      scenarioCategory: "compliance_critical",
      tags: ["cross_border", "EU_distance_selling", "regulatory_override"],
      status: "active",
    },
  ];

  console.log("  Adding test cases...");
  for (const tc of returnsTestCases) {
    await api("POST", `/api/golden-datasets/${returnsDataset.id}/test-cases`, tc);
  }
  console.log(`  ✓ ${returnsTestCases.length} test cases added`);

  const returnsSuite = await api("POST", "/api/evals", {
    agentId: RETURNS_AGENT_ID,
    name: "OTC-AGT-010 Returns & Refund Processing Core Regression Suite",
    type: "regression",
    goldenDatasetId: returnsDataset.id,
    industry: "enterprise",
    totalCases: returnsTestCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.95, refundCalculationAccuracy: 0.99, regulatoryComplianceRate: 1.0, fraudDetectionRate: 0.90 },
    coverageTags: ["eligibility_validation", "rma_generation", "refund_calculation", "fraud_detection", "regulatory_compliance"],
    ontologyTags: ["returns", "RMA", "refund", "order-to-cash"],
  });
  console.log(`  ✓ Eval suite created: ${returnsSuite.id}\n`);

  // ── OTC-AGT-011 Contract & Pricing Compliance ────────────────────────────
  console.log("[2] OTC-AGT-011 Contract & Pricing Compliance Eval Dataset...");
  const contractDataset = await api("POST", "/api/golden-datasets", {
    name: "OTC-AGT-011 Contract & Pricing Compliance Evaluation Dataset",
    description: "Evaluation dataset covering contract parsing accuracy, real-time pricing deviation detection, rebate calculation precision, contract expiration monitoring, audit reporting, and regulatory compliance (Robinson-Patman, FAR/DFARS, ASC 606).",
    industry: "enterprise",
    useCase: "Contract and Pricing Compliance — Order-to-Cash Governance",
    version: "1.0",
    status: "active",
    tags: ["contract", "pricing", "compliance", "rebate", "governance", "order-to-cash"],
    scenarioCategories: {
      "Contract Parsing": 15,
      "Pricing Deviation Detection": 25,
      "Rebate Calculation": 20,
      "Contract Expiration": 15,
      "Regulatory Compliance": 15,
      "Audit Reporting": 10,
    },
    coverageDimensions: ["deviation_type", "rebate_tier", "regulatory_rule", "contract_type", "expiry_urgency"],
    qualityCoverage: 0.98,
    performanceBenchmarks: [
      { name: "deviationDetectionLatencyMs", target: 500 },
      { name: "contractActivationTimeDays", target: 5 },
      { name: "rebateAccrualAccuracy", target: 0.99 },
    ],
  });
  console.log(`  ✓ Dataset created: ${contractDataset.id}`);

  const contractTestCases = [
    {
      name: "Pricing Deviation — Unauthorised Discount Over Threshold",
      inputScenario: "Order ORD-2024-19922 for CUST-441 (contract CTR-2024-0089, max discount 15%). SKU IND-220, 800 units. Contract tier price: $41.50/unit. Applied price: $35.00/unit (15.7% discount). Sales rep override code SR-OVERRIDE-019 not in approved log.",
      expectedBehavior: "FAIL: 15.7% discount exceeds 15% maximum. Override code not approved. BLOCK transaction. Create compliance exception EXC-2024-19922. Escalate to Sales VP and Finance Director. Order must not release until VP provides written authorisation or price corrected to minimum $35.28 (15% off contract).",
      evaluationCriteria: ["deviation_detected", "deviation_percentage_accurate", "transaction_blocked", "exception_created", "escalation_triggered", "minimum_correct_price_stated"],
      difficultyTier: "moderate",
      scenarioCategory: "compliance_critical",
      tags: ["unauthorized_discount", "block", "escalation"],
      status: "active",
    },
    {
      name: "Robinson-Patman — Same SKU Different Prices Competing Customers",
      inputScenario: "CUST-200 and CUST-201 both in Distributor segment, same volume range 500-999 units, SKU IND-220. CUST-200 price: $41.50/unit (CTR-2024-0089). CUST-201 price: $38.00/unit (side agreement). Both compete directly in Midwest market. No cost justification documented.",
      expectedBehavior: "ROBINSON-PATMAN HIGH RISK. Same SKU, same tier, same customer class, competing customers, no cost justification. IMMEDIATE: Notify General Counsel; hold CUST-201 side-agreement orders; freeze further transactions at differential price; assemble documentation for legal review.",
      evaluationCriteria: ["rp_risk_identified", "competing_customers_confirmed", "cost_justification_absent_noted", "legal_counsel_notified", "orders_held", "transactions_frozen"],
      difficultyTier: "complex",
      scenarioCategory: "compliance_critical",
      tags: ["robinson_patman", "legal_escalation", "regulatory"],
      status: "active",
    },
    {
      name: "Rebate Calculation — Q3 Volume Tier Attainment",
      inputScenario: "CUST-441, CTR-2024-0089 Q3 rebate. Tier: 80-89% attainment = 1.5% rebate on eligible revenue. Annual commitment $2M. Q3 actual $412,000 (annualised $1.648M = 82.4% of commitment). Prior Q1+Q2 rebate accrual $18,000.",
      expectedBehavior: "Q3 attainment 82.4% → 1.5% tier. Earned: $412,000 × 1.5% = $6,180. Journal: Dr. Rebate Expense $6,180 / Cr. Rebate Payable $6,180. YTD accrual: $24,180. ASC 606: 80-89% tier is most likely outcome — constraint appropriate at current run-rate.",
      evaluationCriteria: ["attainment_percentage_correct", "correct_tier_selected", "earned_rebate_correct", "journal_entry_correct", "asc_606_constraint_applied"],
      difficultyTier: "moderate",
      scenarioCategory: "happy_path",
      tags: ["rebate_calculation", "volume_tier", "asc_606"],
      status: "active",
    },
    {
      name: "Contract Expiration — 14-Day Emergency, No Renewal Signed",
      inputScenario: "Contract CTR-2024-0089 for CUST-441 ($2.4M ARR) expires in 13 days. Renewal status: in_negotiation — no signed agreement. New orders arriving daily at contract pricing.",
      expectedBehavior: "EMERGENCY: 13 days to expiry, no renewal. Actions: (1) CFO/VP Sales/Account VP call to customer within 24 hours; (2) Prepare fall-through pricing for activation on expiry date; (3) Customer notification of pricing change; (4) Flag in-flight orders for pricing re-evaluation post-expiry. If signed before expiry activate immediately and retroactively apply to gap orders.",
      evaluationCriteria: ["emergency_level_set", "executive_escalation_immediate", "fallthrough_pricing_prepared", "customer_notified", "inflight_orders_flagged"],
      difficultyTier: "complex",
      scenarioCategory: "adversarial",
      tags: ["contract_expiry", "emergency_escalation", "fallthrough_pricing"],
      status: "active",
    },
    {
      name: "Over-Pricing Detection — Customer Charged Above Contract Rate",
      inputScenario: "Invoice INV-2024-44210 for CUST-441, SKU IND-220, 1200 units. Contract price for ≥1000 units: $41.50/unit. Invoice applied: $45.00/unit. Overcharge: $3.50 × 1200 = $4,200. No override recorded.",
      expectedBehavior: "Over-pricing $4,200 confirmed (wrong tier applied). Actions: (1) Issue credit memo $4,200 immediately; (2) Notify customer within 1 business day; (3) Raise IT ticket for price-tier logic fix; (4) Audit last 30 days same customer+SKU. Close exception as resolved-auto-corrected.",
      evaluationCriteria: ["over_pricing_detected", "overcharge_amount_correct", "credit_memo_issued", "customer_notified", "it_ticket_raised", "audit_triggered"],
      difficultyTier: "moderate",
      scenarioCategory: "edge_case",
      tags: ["over_pricing", "credit_memo", "price_tier_error"],
      status: "active",
    },
    {
      name: "Contract Parsing — New Customer Agreement Activation",
      inputScenario: "New PDF contract for CUST-550 (RegionalDistrib Inc): 3-year term 2025-01-01 to 2027-12-31. Pricing tiers: 0-499 units $52.00; 500-999 $48.50; 1000+ $45.00. Annual commitment $800,000. Q4 growth rebate 1.8% if YoY growth >15%. Max discount 12%. Net 30. Auto-renew with 60-day notice.",
      expectedBehavior: "Parse at 95% confidence. 3 tiers validated (monotonically decreasing). Growth rebate is variable consideration under ASC 606 — constrain until probable. Max discount 12% loaded. Auto-renew with 60-day notice. Set expiry alerts at 90/60/30/14 days before 2027-12-31. Route for dual-approval before activation.",
      evaluationCriteria: ["three_tiers_extracted", "max_discount_loaded", "asc_606_variable_consideration_noted", "expiry_alerts_set", "dual_approval_required", "auto_renew_configured"],
      difficultyTier: "routine",
      scenarioCategory: "happy_path",
      tags: ["contract_parsing", "new_contract", "asc_606"],
      status: "active",
    },
  ];

  console.log("  Adding test cases...");
  for (const tc of contractTestCases) {
    await api("POST", `/api/golden-datasets/${contractDataset.id}/test-cases`, tc);
  }
  console.log(`  ✓ ${contractTestCases.length} test cases added`);

  const contractSuite = await api("POST", "/api/evals", {
    agentId: CONTRACT_AGENT_ID,
    name: "OTC-AGT-011 Contract & Pricing Compliance Core Regression Suite",
    type: "regression",
    goldenDatasetId: contractDataset.id,
    industry: "enterprise",
    totalCases: contractTestCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.97, deviationDetectionRate: 0.99, regulatoryFlagAccuracy: 1.0, rebateCalculationAccuracy: 0.99 },
    coverageTags: ["pricing_compliance", "contract_parsing", "rebate_calculation", "regulatory_compliance"],
    ontologyTags: ["contract", "pricing", "compliance", "order-to-cash"],
  });
  console.log(`  ✓ Eval suite created: ${contractSuite.id}\n`);

  // ── Save IDs ──────────────────────────────────────────────────────────────
  const ids = {
    returnsAgent:  { id: RETURNS_AGENT_ID,  evalDatasetId: returnsDataset.id,  evalSuiteId: returnsSuite.id  },
    contractAgent: { id: CONTRACT_AGENT_ID, evalDatasetId: contractDataset.id, evalSuiteId: contractSuite.id },
  };
  const fs = await import("fs");
  fs.writeFileSync("./scripts/otc-agt-010-011-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("=".repeat(60));
  console.log("EVAL CREATION COMPLETE");
  console.log("  OTC-AGT-010 dataset:", returnsDataset.id, "| suite:", returnsSuite.id);
  console.log("  OTC-AGT-011 dataset:", contractDataset.id, "| suite:", contractSuite.id);
  console.log("  IDs saved to: scripts/otc-agt-010-011-dev-ids.json");
  console.log("=".repeat(60));
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
