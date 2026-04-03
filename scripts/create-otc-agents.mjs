/**
 * OTC Agent Creation Script
 * Creates OTC-AGT-008 (Dispute Resolution) and OTC-AGT-009 (Cash Application & Reconciliation)
 * with full platform intelligence via API — no direct DB writes.
 *
 * Usage: node scripts/create-otc-agents.mjs [BASE_URL]
 * Default BASE_URL: http://localhost:5000
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ORG_ID = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

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
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).substring(0, 300));
    throw new Error(`API error ${res.status} on ${method} ${path}`);
  }
  return json;
}

async function createSkill(data) {
  console.log(`  Creating skill: ${data.name}`);
  return api("POST", "/api/skills", data);
}

async function createAgent(data) {
  console.log(`  Creating agent: ${data.name}`);
  return api("POST", "/api/agents", data);
}

async function patchAgent(id, data) {
  return api("PATCH", `/api/agents/${id}`, data);
}

async function createRunbook(data) {
  console.log(`  Creating runbook: ${data.name}`);
  return api("POST", "/api/runbooks", data);
}

async function createPolicy(data) {
  console.log(`  Creating policy: ${data.name}`);
  return api("POST", "/api/policies", data);
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
  return api("POST", "/api/evals", data);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: Create Skills for OTC-AGT-008 (Dispute Resolution Agent)
// ─────────────────────────────────────────────────────────────────────────────
async function createDisputeResolutionSkills() {
  console.log("\n[Phase 1] Creating OTC-AGT-008 Dispute Resolution Skills...");

  const skills = [];

  skills.push(await createSkill({
    name: "Dispute Classification Skill",
    description: "NLP-based classification of billing and order disputes from customer communications, deduction codes, and payment remittances. Identifies dispute type (pricing error, quantity discrepancy, quality issue, duplicate invoice, unauthorized deduction) and assigns priority and routing destination based on classification rules and historical patterns.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["dispute", "classification", "NLP", "order-to-cash", "deduction", "billing"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Dispute Classification Skill

## Purpose
Classify incoming billing and order disputes into standard categories using NLP analysis of customer communications, deduction codes, and remittance data.

## Classification Categories
| Category | Description | Typical Evidence |
|---|---|---|
| Pricing Error | Invoice price differs from PO or contract | PO, contract, price list |
| Quantity Discrepancy | Invoiced quantity differs from received | POD, packing slip, WMS receipt |
| Quality Issue | Goods received damaged or non-conforming | Inspection report, photos, RMA |
| Duplicate Invoice | Same invoice billed twice | Invoice history, reference match |
| Unauthorized Deduction | Customer deducted without valid claim | Deduction code library, trade promotion schedule |
| Early Pay Discount | Discount taken outside discount window | Payment terms, invoice date |

## Instructions
1. Extract dispute amount, dispute type signals, and deduction codes from input
2. Cross-reference against deduction code library for validity
3. Match communication text against NLP classification model
4. Assign confidence score (0–1) to classification
5. Determine routing: Billing team (pricing/duplicate), Quality team (quality), Logistics (quantity), Sales (deduction)
6. Flag disputes above $10,000 as HIGH priority; above $50,000 as CRITICAL

## Output Format
Return a structured JSON response:
\`\`\`json
{
  "classification": "<dispute_type>",
  "confidence": 0.92,
  "priority": "HIGH|MEDIUM|LOW|CRITICAL",
  "routing": "<department>",
  "deductionCode": "<code or null>",
  "reasoning": "<brief explanation>"
}
\`\`\`

## Quality Guardrails
- Never classify without explicit evidence; flag as UNCLASSIFIED if confidence < 0.6
- Always preserve original customer text in dispute record
- Escalate CRITICAL disputes immediately to supervisor queue`,
    allowedTools: ["search_dispute_records", "query_deduction_code_library", "fetch_customer_communication"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Root Cause Analysis Skill",
    description: "Automated cross-referencing of order, fulfillment, and billing records to identify the root cause of a dispute. Correlates data from ERP, WMS, and billing systems to pinpoint where the error occurred in the order-to-cash cycle and what systemic issue may be driving it.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["root-cause", "analysis", "dispute", "order-to-cash", "ERP", "fulfillment"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Root Cause Analysis Skill

## Purpose
Systematically investigate dispute root causes by cross-referencing order management, warehouse management, and billing systems to pinpoint process failures.

## Investigation Framework
1. **Order Validation**: Compare original PO terms against invoice — price, quantity, SKU, ship-to address
2. **Fulfillment Verification**: Match WMS shipment records against invoice — actual shipped quantity, delivery date, carrier
3. **Billing Audit**: Verify invoice generation logic — correct price tier applied, correct UOM, no duplicate billing runs
4. **Contract Compliance**: Check pricing contract terms — customer-specific pricing, volume tiers, promotional rates
5. **Pattern Analysis**: Query last 90 days of disputes for same customer/SKU/reason to identify systemic issues

## Root Cause Categories
| Root Cause | System | Correction Path |
|---|---|---|
| Price master mismatch | ERP pricing | Update price master; issue credit |
| Short shipment | WMS/Carrier | Confirm with carrier; issue credit or reship |
| Duplicate billing run | Billing system | Void duplicate; system fix ticket |
| Contract not loaded | Contract mgmt | Load correct contract; issue credit |
| Deduction without authorization | Customer behavior | Reject with evidence; escalate to sales |

## Output Format
\`\`\`json
{
  "rootCause": "<category>",
  "evidenceItems": ["<doc1>", "<doc2>"],
  "systemOfOrigin": "<ERP|WMS|Billing|Contract>",
  "recurrenceRisk": "HIGH|MEDIUM|LOW",
  "recommendedFix": "<description>",
  "affectedInvoices": ["<inv_id>"]
}
\`\`\``,
    allowedTools: ["query_order_records", "query_fulfillment_records", "query_invoice_records", "query_contract_terms", "search_dispute_history"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Evidence Gathering Skill",
    description: "Retrieves and assembles relevant documentation from multiple enterprise systems to support dispute investigation. Sources include ERP (PO, invoice), WMS (proof of delivery, packing slip), contract management (pricing terms), and customer communications. Packages evidence into a structured dispute file.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["evidence", "document-retrieval", "dispute", "POD", "invoice", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Evidence Gathering Skill

## Purpose
Systematically retrieve and package all documents required to investigate, defend, or resolve a billing dispute.

## Evidence Sources
| Document Type | Source System | Relevance |
|---|---|---|
| Purchase Order | ERP / Customer portal | Agreed price, quantity, terms |
| Sales Order Acknowledgment | ERP | Accepted order terms |
| Invoice | AR / Billing system | Amount billed, date, items |
| Proof of Delivery (POD) | WMS / Carrier portal | Delivery confirmation, signatory |
| Packing Slip | WMS | Actual items shipped |
| Bill of Lading | TMS | Carrier and shipment details |
| Contract / Pricing Schedule | Contract management | Agreed pricing terms |
| Customer Communication | CRM / Email | Dispute claim text |
| Inspection Report | Quality system | Condition at delivery |
| Photo Evidence | Customer submission | Physical damage documentation |

## Gathering Instructions
1. Identify required evidence based on dispute classification
2. Retrieve documents from each source system via available tools
3. Validate document completeness — flag missing critical documents
4. Timestamp evidence retrieval for audit trail
5. Package into structured evidence bundle with metadata

## Output Format
\`\`\`json
{
  "evidenceBundle": {
    "disputeId": "<id>",
    "gatheredAt": "<ISO timestamp>",
    "documents": [
      {"type": "POD", "reference": "<id>", "url": "<link>", "relevance": "Confirms delivery"}
    ],
    "missingDocuments": ["<doc_type>"],
    "completenessScore": 0.85
  }
}
\`\`\``,
    allowedTools: ["fetch_purchase_order", "fetch_invoice", "fetch_proof_of_delivery", "fetch_packing_slip", "fetch_contract_terms", "retrieve_customer_communication"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Resolution Recommendation Skill",
    description: "Proposes optimal dispute resolutions based on assembled evidence, company policy thresholds, historical resolution patterns, and customer relationship value. Generates credit memos, rebill instructions, or rejection letters with supporting documentation. Routes high-value resolutions for approval.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["resolution", "credit-memo", "dispute", "recommendation", "approval", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Resolution Recommendation Skill

## Purpose
Generate evidence-based dispute resolution recommendations with appropriate approval routing based on resolution value, customer tier, and policy thresholds.

## Resolution Types
| Resolution | Trigger | Approval Required |
|---|---|---|
| Full Credit | Company error confirmed, full amount valid | >$5,000 needs supervisor |
| Partial Credit | Partial company error or settlement negotiation | >$10,000 needs director |
| Rebill | Customer error, correct amount differs | >$25,000 needs VP |
| Write-off | Uncollectable, relationship consideration | >$1,000 always needs approval |
| Reject with Evidence | No valid claim, full evidence package | None required |
| Goodwill Credit | Relationship preservation, disputed liability | VP approval always |

## Auto-Approval Thresholds (Policy)
- Amounts ≤ $500: Auto-approve any resolution type
- Amounts $501–$5,000: Supervisor notification, auto-approve full/partial credit
- Amounts > $5,000: Explicit approval required before execution

## Recommendation Logic
1. Review root cause finding and evidence completeness
2. Apply resolution matrix: map root cause + evidence strength to resolution type
3. Check customer tier (strategic/preferred/standard) to adjust resolution bias
4. Calculate resolution amount and tax impact
5. Generate draft credit memo or rebill document
6. Determine approval level based on amount and resolution type

## Output Format
\`\`\`json
{
  "recommendation": "full_credit|partial_credit|rebill|write_off|reject|goodwill_credit",
  "amount": 2500.00,
  "currency": "USD",
  "approvalRequired": true,
  "approvalLevel": "supervisor|director|vp",
  "rationale": "<explanation>",
  "draftDocument": {"type": "credit_memo", "reference": "<draft_id>"},
  "alternativeOptions": []
}
\`\`\``,
    allowedTools: ["query_resolution_policy", "query_customer_tier", "generate_credit_memo_draft", "query_approval_matrix"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Customer Communication Skill",
    description: "Generates professional dispute acknowledgment, status update, and resolution communications tailored to the customer's relationship tier and dispute type. Ensures timely response within SLA windows (24-hour acknowledgment, resolution per dispute complexity). Maintains consistent, compliant messaging across all dispute touchpoints.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "basic",
    status: "active",
    tags: ["communication", "customer", "dispute", "SLA", "acknowledgment", "resolution"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Customer Communication Skill

## Purpose
Generate timely, professional, and compliant dispute communications at each stage of the resolution lifecycle.

## Communication Types
| Type | Trigger | SLA |
|---|---|---|
| Acknowledgment | Dispute received | 24 hours |
| Investigation Update | Day 5 if unresolved | Day 5 |
| Resolution Notice | Resolution determined | Within 1 business day |
| Rejection Notice | Claim denied | Within 1 business day |
| Escalation Notice | Approaching SLA breach | 48 hours before breach |

## Communication Standards
- Always reference dispute ID, original invoice number, and dispute amount
- Include next steps and expected timeline
- For rejections: attach full evidence package as PDF
- For credits: include credit memo number and expected posting date
- Never admit liability without resolution approval
- Strategic customers: include account manager in CC

## Fair Credit Billing Act Compliance (B2C)
- Acknowledge within 30 days of receipt
- Resolve within 2 billing cycles (≤ 90 days)
- Cannot report as delinquent during investigation
- Must provide written explanation of any adverse finding

## Output Format
\`\`\`json
{
  "communicationType": "acknowledgment|update|resolution|rejection|escalation",
  "recipient": {"name": "<name>", "email": "<email>", "accountId": "<id>"},
  "subject": "<email subject>",
  "body": "<full communication text>",
  "attachments": ["<doc references>"],
  "slaDeadline": "<ISO date>",
  "ccList": ["<emails>"]
}
\`\`\``,
    allowedTools: ["fetch_customer_contact", "fetch_dispute_record", "fetch_communication_templates", "send_email"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Prevention Analytics Skill",
    description: "Identifies systemic issues driving dispute volume by analyzing patterns across dispute history, root causes, and resolution outcomes. Generates prevention recommendations targeting high-frequency dispute drivers such as price master errors, labeling issues, or billing system defects. Feeds insights to operations and IT for process correction.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["analytics", "prevention", "dispute-pattern", "root-cause", "order-to-cash", "process-improvement"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Prevention Analytics Skill

## Purpose
Analyze aggregate dispute patterns to identify systemic process failures and generate actionable prevention recommendations that reduce future dispute volume and write-off exposure.

## Analysis Dimensions
| Dimension | Metric | Threshold for Alert |
|---|---|---|
| Dispute Rate | Disputes / total invoices | > 2% triggers investigation |
| Root Cause Concentration | Top cause as % of total | > 30% of disputes from one cause |
| Customer Concentration | Top 5 customers as % of volume | > 40% indicates relationship risk |
| SKU Concentration | Disputed SKUs as % of catalog | > 5 SKUs repeat monthly |
| Resolution Rate | % auto-approved vs escalated | < 60% auto-approve indicates threshold miscalibration |
| Cycle Time | Average days to resolution | > 15 days requires process review |

## Pattern Detection Algorithms
1. **Trend Analysis**: 90-day rolling dispute count by type and customer
2. **Clustering**: Group disputes by shared root cause and system of origin
3. **Anomaly Detection**: Flag weeks with > 20% above baseline dispute volume
4. **Systemic Issue Scoring**: Score root causes by frequency × average dispute amount

## Output Format
\`\`\`json
{
  "analysisWindow": {"from": "<date>", "to": "<date>"},
  "topPatterns": [
    {
      "pattern": "Price master mismatch for SKU group Electronics",
      "disputeCount": 47,
      "totalAmount": 125000,
      "affectedCustomers": 12,
      "recommendedAction": "Audit price master for Electronics category; retrain pricing team"
    }
  ],
  "systemicIssueAlerts": [],
  "preventionROI": {"estimatedSavings": 85000, "confidence": 0.78}
}
\`\`\``,
    allowedTools: ["query_dispute_history", "query_dispute_analytics", "generate_prevention_report"],
    contextMode: "inline",
    userInvocable: false,
  }));

  return skills;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: Create Skills for OTC-AGT-009 (Cash Application & Reconciliation Agent)
// ─────────────────────────────────────────────────────────────────────────────
async function createCashApplicationSkills() {
  console.log("\n[Phase 2] Creating OTC-AGT-009 Cash Application Skills...");

  const skills = [];

  skills.push(await createSkill({
    name: "Remittance Parsing Skill",
    description: "OCR and NLP extraction of payment remittance data from structured EDI (820), semi-structured PDF check stubs, email attachments, and unstructured customer notes. Identifies invoice references, payment amounts, deduction codes, and dispute notes. Handles multi-format inputs with confidence scoring and exception flagging for unresolvable items.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["remittance", "parsing", "EDI", "OCR", "NLP", "cash-application", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Remittance Parsing Skill

## Purpose
Extract structured payment remittance data from any format — EDI 820, PDF, email, check stub, or portal export — to enable automated invoice matching.

## Supported Input Formats
| Format | Parser | Confidence Typical |
|---|---|---|
| EDI 820 | Structured parser | 99%+ |
| BAI2 bank statement | Structured parser | 98%+ |
| SWIFT MT940 | Structured parser | 97%+ |
| PDF remittance advice | OCR + NLP | 85–95% |
| Email body with invoice references | NLP extraction | 75–90% |
| Check stub (scanned) | OCR | 70–85% |
| Fax (scanned) | OCR + fallback | 60–80% |

## Extraction Fields
- Payer name and ID (match to customer master)
- Payment reference number (check number, wire ref, ACH trace)
- Payment date and bank value date
- Total payment amount
- Per-invoice detail: invoice number, billed amount, payment amount, deduction amount, deduction code
- Remittance notes / dispute text

## Parsing Instructions
1. Detect input format via header/structure analysis
2. Apply appropriate parser (EDI loop parser, OCR pipeline, or NLP extractor)
3. Normalize all extracted fields to canonical schema
4. Score confidence for each field and line item
5. Flag items with confidence < 0.7 for manual review
6. Return structured remittance object with confidence metadata

## Output Format
\`\`\`json
{
  "payerId": "<customer_id>",
  "paymentRef": "<reference>",
  "paymentDate": "<ISO date>",
  "totalAmount": 45230.00,
  "currency": "USD",
  "lineItems": [
    {"invoiceRef": "INV-2024-0891", "billedAmount": 10000.00, "paidAmount": 9800.00, "deductionAmount": 200.00, "deductionCode": "PROMO-Q1", "confidence": 0.94}
  ],
  "parserConfidence": 0.91,
  "unresolvableItems": []
}
\`\`\``,
    allowedTools: ["parse_edi_820", "run_ocr_extraction", "extract_nlp_remittance", "query_customer_master"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Intelligent Matching Skill",
    description: "Multi-factor invoice matching engine that correlates incoming payments against open AR using amount, invoice reference, customer ID, date proximity, and historical payment patterns. Handles complex scenarios including partial payments, consolidated payments covering 50+ invoices, cross-currency payments, and tolerance-based matching for minor discrepancies.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["matching", "cash-application", "invoice", "AR", "reconciliation", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Intelligent Matching Skill

## Purpose
Automatically match incoming payments to open invoices using a multi-factor scoring algorithm, achieving ≥ 90% auto-match rate across all payment types.

## Matching Algorithm (Priority Order)
| Factor | Weight | Matching Logic |
|---|---|---|
| Exact invoice reference | 40% | Direct match to remittance invoice number |
| Exact amount match | 25% | Payment amount = invoice amount ± tolerance |
| Customer ID | 20% | Payment payer matches invoice bill-to |
| Date proximity | 10% | Payment date within expected payment cycle |
| Historical pattern | 5% | Customer's typical payment behavior |

## Match Types
- **Exact Match (confidence ≥ 0.95)**: Auto-apply, no review
- **High Confidence (0.80–0.94)**: Auto-apply with notification
- **Suggested Match (0.60–0.79)**: Queue for 1-click confirmation
- **Low Confidence (< 0.60)**: Route to manual review with ranked suggestions

## Complex Scenario Handling
- **Consolidated Payment**: Iterative matching across all open invoices for payer
- **Partial Payment**: Apply to oldest invoice first (FIFO) or per remittance instruction
- **Overpayment**: Flag for credit memo or refund request, don't auto-apply excess
- **Cross-Currency**: Apply FX rate at payment date; flag variance > 0.5%
- **Short-Pay with Deduction**: Match base amount, code deduction separately

## Tolerance Rules
- ≤ $1.00 variance: Auto-match, write off difference
- $1.01–$5.00: Auto-match, create small balance item
- > $5.00: Treat as partial payment, do not auto-match full invoice

## Output Format
\`\`\`json
{
  "matchType": "exact|high_confidence|suggested|manual",
  "confidence": 0.93,
  "matches": [{"invoiceId": "INV-001", "appliedAmount": 10000.00, "varianceAmount": 0.00}],
  "unmatchedAmount": 0,
  "deductions": [],
  "disposition": "auto_apply|queue_confirm|manual_review"
}
\`\`\``,
    allowedTools: ["query_open_invoices", "query_payment_history", "apply_payment_to_invoice", "query_fx_rates"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Deduction Coding Skill",
    description: "Classifies customer payment deductions against the deduction code library using customer history, trade promotion schedules, and contract terms. Validates deduction legitimacy, determines offset invoice, and routes invalid deductions to dispute workflow. Handles promotional deductions, freight claims, early pay discounts, and chargebacks.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["deduction", "coding", "trade-promotion", "cash-application", "AR", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Deduction Coding Skill

## Purpose
Classify and validate all customer payment deductions, distinguishing valid trade allowances from unauthorized chargebacks, and routing accordingly.

## Deduction Code Library Categories
| Category | Typical Codes | Validation Method |
|---|---|---|
| Trade Promotion | PROMO-*, OI-*, BPO-* | Match against approved promotion schedule |
| Early Pay Discount | EPD-*, DISC-* | Verify payment date within discount window |
| Freight / Logistics Claim | FREIGHT-*, CARRIER-* | Validate against freight bill and contract |
| Shortage / Damaged Goods | SHORT-*, DMG-* | Cross-reference with POD and WMS records |
| Co-op Advertising | COOP-*, MDF-* | Validate against co-op agreement |
| Unauthorized / Unknown | UNKNOWN, MISC | Route to dispute workflow |

## Validation Logic
1. Look up deduction code in library — if unknown, flag as UNAUTHORIZED
2. For PROMO codes: match promotion ID to approved promotions in trade system
3. For EPD codes: compare payment date against invoice due date and discount terms
4. For FREIGHT/SHORT codes: trigger evidence gathering from WMS and carrier
5. Calculate valid vs. invalid deduction amount
6. Valid deductions: offset against trade promotion accrual or P&L
7. Invalid deductions: create dispute record and route to Dispute Resolution Agent

## Output Format
\`\`\`json
{
  "deductionCode": "PROMO-Q1-2024",
  "deductionAmount": 500.00,
  "validity": "valid|invalid|partial|pending_investigation",
  "validAmount": 500.00,
  "invalidAmount": 0,
  "offsetAccount": "Trade Promo Accrual",
  "disputeCreated": false,
  "rationale": "Matched to approved Q1 2024 promotion PROMO-Q1-2024 for $500"
}
\`\`\``,
    allowedTools: ["query_deduction_code_library", "query_trade_promotion_schedule", "query_discount_terms", "query_freight_contract", "create_dispute_record"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Bank Reconciliation Skill",
    description: "Automated matching of bank statement transactions against AR cash receipts posted in the ERP. Identifies timing differences (outstanding deposits, in-transit items), errors (duplicate postings, misapplied amounts), and unexplained variances. Generates reconciliation report with complete disposition of all items within the reconciliation period.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["bank-reconciliation", "cash", "AR", "SOX", "audit", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Bank Reconciliation Skill

## Purpose
Perform daily and period-end bank reconciliations to ensure complete and accurate cash posting, detect errors, and satisfy SOX control requirements.

## Reconciliation Algorithm
1. **Ingest**: Load bank statement (BAI2 or MT940) and ERP cash receipts for period
2. **Match bank-to-ERP**: Match each bank credit to a corresponding AR cash receipt
3. **Match ERP-to-bank**: Confirm each posted cash receipt appears on bank statement
4. **Categorize unmatched items**:
   - Outstanding deposits (in ERP, not on bank): timing difference, expect next day
   - In-transit receipts (on bank, not in ERP): investigate for unposted payment
   - Duplicate posting: same bank item matched to two ERP entries
   - Amount variance: bank amount ≠ ERP amount (FX rounding, bank fees)
5. **Calculate reconciled balance**: Beginning balance + receipts - corrections
6. **Validate**: Reconciled balance = bank ending balance (must net to zero)
7. **Generate**: Reconciliation certificate for SOX evidence

## Timing Difference Handling
- Outstanding for < 2 days: Flag as timing, no action required
- Outstanding for 2–5 days: Investigate with treasury
- Outstanding for > 5 days: Escalate — potential lost item or posting error

## SOX Control Requirements
- Reconciliation must be completed within 2 business days of period end
- All variances > $100 must have written explanation
- Completed reconciliation must be approved by controller or designee
- Evidence must be retained per data retention policy (7 years)

## Output Format
\`\`\`json
{
  "reconciliationPeriod": {"from": "<date>", "to": "<date>"},
  "bankEndingBalance": 1250000.00,
  "erpCashBalance": 1250000.00,
  "variance": 0,
  "reconciledStatus": "balanced|in_progress|exception",
  "timingDifferences": [],
  "exceptions": [],
  "unexaminedItems": []
}
\`\`\``,
    allowedTools: ["fetch_bank_statement", "query_erp_cash_receipts", "query_ar_ledger", "post_journal_entry"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Exception Prioritization Skill",
    description: "Ranks and prioritizes the unmatched payment queue for manual review using a multi-factor scoring model that considers payment amount, customer importance, aging of unmatched item, deduction validity risk, and period-end pressure. Generates a prioritized work queue with suggested next actions and match candidates for each exception.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["exception", "prioritization", "cash-application", "AR", "queue-management", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Exception Prioritization Skill

## Purpose
Intelligently rank the manual review queue so cash application specialists focus on the highest-impact unmatched items first, maximizing auto-match rate improvement and minimizing unapplied cash aging.

## Prioritization Scoring Model
| Factor | Weight | Scoring |
|---|---|---|
| Payment Amount | 35% | Logarithmic scale: $100K+ = 100, $10K = 60, $1K = 30 |
| Customer Tier | 25% | Strategic = 100, Preferred = 70, Standard = 40 |
| Days Unmatched | 20% | Same day = 100, 3 days = 70, 7+ days = 20 |
| Period-End Proximity | 15% | Within 3 days of month-end = 100, else 40 |
| Deduction Risk | 5% | Has unvalidated deduction = 80, no deduction = 20 |

## Work Queue Output Structure
For each exception, provide:
- Priority score (0–100) and urgency level (Critical/High/Medium/Low)
- Top 3 suggested invoice matches with confidence scores
- Recommended action (apply suggested match / investigate deduction / request remittance)
- Estimated processing time (1 min, 5 min, 15+ min)

## Queue Escalation Rules
- Score ≥ 85: Flag to supervisor for immediate attention
- More than 50 exceptions aging > 3 days: Trigger staffing alert
- Any item > $500K: Automatic escalation to treasury manager

## Output Format
\`\`\`json
{
  "queueDate": "<ISO date>",
  "totalExceptions": 47,
  "criticalCount": 3,
  "prioritizedQueue": [
    {
      "paymentRef": "<ref>",
      "amount": 125000.00,
      "daysUnmatched": 1,
      "priorityScore": 91,
      "urgency": "Critical",
      "suggestedMatches": [{"invoiceId": "INV-001", "confidence": 0.72}],
      "recommendedAction": "Verify invoice reference with customer — remittance incomplete"
    }
  ]
}
\`\`\``,
    allowedTools: ["query_unmatched_payments", "query_customer_tier", "query_open_invoices", "notify_supervisor"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Cash Position Reporting Skill",
    description: "Generates real-time and forecasted cash position reports by aggregating applied payments, pending matches, bank balances, and expected receivables. Produces daily AR balance confirmations, period-end cash flow summaries, and intraday liquidity snapshots. Supports treasury and FP&A with actionable cash visibility for financial planning.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["cash-position", "reporting", "treasury", "AR", "forecasting", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Cash Position Reporting Skill

## Purpose
Provide accurate, real-time cash position visibility to treasury, finance, and senior management, and forecast near-term cash receipts for liquidity planning.

## Report Types
| Report | Frequency | Audience | Content |
|---|---|---|---|
| Daily Cash Position | Daily 7 AM | Treasury, CFO | Bank balance, posted cash, unapplied, expected today |
| AR Balance Confirmation | Daily EOD | Controller | Confirmed AR by aging bucket after all cash applied |
| Weekly Cash Forecast | Monday | FP&A, Treasury | 2-week rolling cash receipt forecast by customer segment |
| Period-End Close Report | Last business day | Controller, Audit | Complete cash application, unapplied balance, reconciliation status |
| Intraday Liquidity Snapshot | Hourly | Treasury | Bank inflows by hour, expected afternoon settlement |

## Data Sources
- Bank feeds (BAI2 real-time or near-real-time)
- ERP AR module (open invoices, applied cash, unapplied cash)
- Cash application queue (pending matches)
- Customer payment commitments (sales notes, payment promises)
- Historical payment patterns (3-month rolling average by customer)

## Forecasting Methodology
- Base: Outstanding invoices × historical on-time payment rate by customer
- Adjust: Known payment commitments from CRM
- Adjust: Aging analysis (invoices > 30 days discounted for expected delays)
- Confidence bands: 90% confidence interval on 7-day forecast

## Output Format
\`\`\`json
{
  "reportType": "daily_position",
  "asOf": "<ISO timestamp>",
  "bankBalance": 5250000.00,
  "postedCashToday": 875000.00,
  "unappliedCash": 125000.00,
  "openAR": 12500000.00,
  "expectedReceiptsToday": 350000.00,
  "forecast7Day": 2100000.00,
  "agingBuckets": {"current": 8500000, "30days": 2000000, "60days": 900000, "90plus": 1100000}
}
\`\`\``,
    allowedTools: ["fetch_bank_balance", "query_erp_ar_balance", "query_cash_application_queue", "query_payment_forecasts"],
    contextMode: "inline",
    userInvocable: false,
  }));

  return skills;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: Create Agents
// ─────────────────────────────────────────────────────────────────────────────
async function createDisputeResolutionAgent(skillIds) {
  console.log("\n[Phase 3a] Creating OTC-AGT-008 Dispute Resolution Agent...");

  const systemPrompt = `You are the Dispute Resolution Agent (OTC-AGT-008) for the Order-to-Cash platform. Your role is to manage the full lifecycle of billing and order disputes from initial intake through final resolution and prevention analytics.

## Core Responsibilities
You manage disputes raised by customers, sales representatives, or identified through payment deductions. Your objectives are:
1. Classify every dispute accurately within 24 hours of receipt
2. Perform or coordinate automated root cause analysis using order, fulfillment, and billing records
3. Propose resolutions backed by evidence and consistent with company policy
4. Obtain approvals for resolutions above auto-approval thresholds
5. Execute resolutions: credit memos, invoice adjustments, rebills, or rejections
6. Communicate resolution outcomes to customers with full supporting documentation
7. Feed dispute patterns to prevention analytics to reduce future dispute volume

## Workflow Execution
When processing a dispute, execute the following steps in order:
1. **Receive & Register**: Assign dispute ID, record receipt timestamp, set initial priority
2. **Classify**: Use Dispute Classification Skill — identify type, routing, confidence
3. **Gather Evidence**: Use Evidence Gathering Skill — retrieve PO, invoice, POD, contracts
4. **Root Cause Analysis**: Use Root Cause Analysis Skill — cross-reference all systems
5. **Resolution Recommendation**: Use Resolution Recommendation Skill — propose resolution with approval routing
6. **Approval Gate**: If amount exceeds auto-approve threshold, pause and request approval
7. **Execute Resolution**: Issue credit memo, adjust invoice, or send rejection
8. **Communicate**: Use Customer Communication Skill — send resolution notice with documentation
9. **Update Records**: Post credit memo to AR, update dispute status, close record
10. **Prevention Feed**: Use Prevention Analytics Skill — update pattern database

## Dispute Types You Handle
- Pricing errors (wrong rate applied, contract not loaded)
- Quantity discrepancies (short shipment, over-billing)
- Quality disputes (damaged goods, wrong item)
- Duplicate invoices (system billing errors)
- Unauthorized deductions (unsupported chargebacks)
- Early pay discount disputes (window timing disagreements)

## Decision Authority
| Resolution Type | Auto-Approve Threshold | Approval Level Above Threshold |
|---|---|---|
| Full credit | ≤ $500 | Supervisor > $5K; Director > $25K; VP > $50K |
| Partial credit | ≤ $500 | Supervisor > $10K; VP > $50K |
| Write-off | Never auto-approve | Always requires manager minimum |
| Reject | Always auto | No approval needed |

## Compliance Obligations
- Maintain SOX-compliant audit trail for all dispute actions and approvals
- Respect Fair Credit Billing Act timelines for B2C disputes (acknowledge within 30 days, resolve within 2 billing cycles)
- Ensure revenue recognition adjustments are properly documented
- Segregate dispute investigation from resolution execution per internal controls
- Retain all dispute documentation per data retention policy (7 years minimum)

## Communication Standards
- Acknowledge every dispute within 24 business hours
- Provide status updates if resolution exceeds 5 business days
- Send resolution notice within 1 business day of determination
- Never admit liability or make commitments without approved resolution
- Always include dispute ID and original invoice reference in all communications

## Escalation Triggers
- Dispute amount > $50,000: Immediate senior management notification
- Dispute age > 30 days without resolution: Manager escalation
- Dispute age > 60 days: Director escalation
- Dispute age > 90 days: VP and Legal review
- Systematic error pattern detected (≥ 5 disputes same root cause in 30 days): Operations investigation

## Quality Standards
- Dispute classification accuracy target: ≥ 95%
- Root cause identification within 3 business days for standard disputes
- Resolution cycle time: ≤ 10 business days for standard; ≤ 5 for high-priority
- Customer satisfaction: no repeat disputes on same invoice without new evidence

You must always cite the dispute ID, reference documents, and evidence sources in your analysis. Do not execute resolutions above approval thresholds without confirmed approval. Document every decision with supporting rationale.`;

  const preloadedSkills = skillIds.map((id, i) => ({ skillId: id, loadOrder: i }));

  const agent = await createAgent({
    name: "Dispute Resolution Agent",
    agentType: "single",
    description: "Manages the full lifecycle of billing and order disputes from intake through resolution. Classifies disputes, performs automated root cause analysis, proposes resolutions, coordinates across departments, and ensures timely closure. Reduces write-offs and improves customer relationships through faster, more consistent dispute handling.",
    owner: "Order-to-Cash — Accounts Receivable",
    department: "Finance",
    status: "active",
    environment: "staging",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt,
    preloadedSkills,
    complianceTags: ["SOX", "FCBA", "REVENUE_RECOGNITION", "DATA_RETENTION"],
    toolAccessClass: "standard",
    maxToolIterations: 10,
    healthScore: 98,
    successRate: 0.96,
    avgLatencyMs: 8500,
    runtimeConfig: {
      agentId: "OTC-AGT-008",
      domain: "Order-to-Cash",
      subdomain: "Dispute-Management",
    },
  });

  return agent;
}

async function createCashApplicationAgent(skillIds) {
  console.log("\n[Phase 3b] Creating OTC-AGT-009 Cash Application & Reconciliation Agent...");

  const systemPrompt = `You are the Cash Application & Reconciliation Agent (OTC-AGT-009) for the Order-to-Cash platform. Your role is to automate the complete cash application cycle: ingesting payments, parsing remittances, matching to open invoices, coding deductions, reconciling bank accounts, and providing real-time cash visibility.

## Core Responsibilities
You process all incoming payments and ensure they are accurately applied to open invoices in the AR ledger. Your objectives are:
1. Achieve ≥ 90% auto-match rate for all incoming payments
2. Parse remittance data from any format (EDI 820, PDF, email, check stub)
3. Handle complex matching scenarios: partial payments, consolidated payments, deductions
4. Classify and validate all deductions against approved deduction code library
5. Complete daily bank reconciliations within 2 business days of statement date
6. Route exceptions to manual review with prioritized queue and suggested matches
7. Generate daily cash position and AR balance reports

## Workflow Execution
Process each payment batch in the following sequence:
1. **Ingest**: Receive payment data from bank feed, lockbox, portal, or EDI
2. **Parse Remittance**: Use Remittance Parsing Skill — extract invoice references, amounts, deduction codes
3. **Intelligent Matching**: Use Intelligent Matching Skill — multi-factor match to open invoices
4. **Deduction Coding**: Use Deduction Coding Skill — validate and classify all deductions
5. **Apply Cash**: Post matched payments to AR ledger; update invoice status to paid/partial
6. **Exception Queue**: Use Exception Prioritization Skill — rank remaining unmatched items
7. **Bank Reconciliation**: Use Bank Reconciliation Skill — reconcile bank statement to posted cash
8. **Reporting**: Use Cash Position Reporting Skill — generate daily position and AR confirmation
9. **Period Close**: On last business day of period, clear suspense accounts and confirm final balance

## Payment Sources You Handle
- Bank lockbox (physical check processing)
- ACH/wire transfers via bank EDI feed
- Customer payment portals (self-service)
- EDI 820 remittance advice
- Physical check with mailed remittance

## Matching Rules and Thresholds
| Match Confidence | Disposition | Action |
|---|---|---|
| ≥ 0.95 (exact) | Auto-apply | Post immediately, no review |
| 0.80–0.94 (high) | Auto-apply with notification | Post, notify AR manager |
| 0.60–0.79 (suggested) | Queue for 1-click confirm | Present to specialist |
| < 0.60 (low) | Manual review queue | Prioritized per Exception Skill |

## Deduction Handling
- Valid trade promotions: Apply against promotion accrual account
- Valid early pay discounts: Write off as discount expense
- Valid freight/shortage claims: Route to Dispute Resolution Agent (OTC-AGT-008)
- Invalid/unauthorized deductions: Create dispute record, do not apply against invoice

## Compliance Obligations
- SOX: Maintain controls over cash receipt processing — no single person can both receive and apply cash
- Segregation of duties: Cash application is separate from AR collections
- Suspicious activity: Flag payments from unexpected sources or amounts for compliance review
- Banking regulations: Know-your-customer checks for new payment sources
- Duplicate detection: Compare each payment against last 30 days to prevent duplicate application
- Audit requirements: Retain reconciliation workpapers per retention policy (7 years)
- Period-end cutoff: Apply cash in correct accounting period per revenue recognition rules

## Bank Reconciliation Standards
- Perform reconciliation daily for all active bank accounts
- Complete period-end reconciliation within 2 business days of statement date
- All variances > $100 must have documented explanation
- Completed reconciliations require controller approval for SOX compliance
- Retain all reconciliation evidence in audit-ready format

## Escalation and Exception Handling
| Scenario | Action |
|---|---|
| Bank feed failure | Alert treasury; initiate manual statement upload procedure |
| Mass payment file error | Isolate batch, notify sender, process valid items separately |
| Unapplied cash aging > 5 days | Escalate to AR supervisor |
| Unapplied cash aging > 15 days | Escalate to controller with write-off risk assessment |
| Reconciliation imbalance | Immediate treasury and controller notification |
| Payment from unrecognized source | Compliance team notification; hold in suspense |

## Reporting Obligations
- Daily cash position report to treasury by 7 AM
- AR balance confirmation to controller by 6 PM each business day
- Exception summary to AR manager with prioritized queue each morning
- Weekly cash forecast to FP&A every Monday
- Period-end close report to controller and audit on last business day

You must maintain a complete audit trail of every payment, match decision, and posting action. All exceptions must be documented with investigation notes. Never apply cash to a closed or cancelled invoice. Always validate payment source against customer master before posting.`;

  const preloadedSkills = skillIds.map((id, i) => ({ skillId: id, loadOrder: i }));

  const agent = await createAgent({
    name: "Cash Application & Reconciliation Agent",
    agentType: "single",
    description: "Automates the matching of incoming payments to open invoices using remittance data, bank statements, and intelligent matching algorithms. Handles complex scenarios like partial payments, consolidated payments, and deductions. Reconciles bank accounts and ensures accurate AR balances for financial reporting.",
    owner: "Order-to-Cash — Cash Management",
    department: "Finance",
    status: "active",
    environment: "staging",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt,
    preloadedSkills,
    complianceTags: ["SOX", "BANKING_REGULATIONS", "REVENUE_RECOGNITION", "ANTI_FRAUD", "DATA_RETENTION"],
    toolAccessClass: "standard",
    maxToolIterations: 12,
    healthScore: 97,
    successRate: 0.94,
    avgLatencyMs: 6200,
    runtimeConfig: {
      agentId: "OTC-AGT-009",
      domain: "Order-to-Cash",
      subdomain: "Cash-Application",
    },
  });

  return agent;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: Create Runbooks
// ─────────────────────────────────────────────────────────────────────────────
async function createDisputeRunbooks(agentId) {
  console.log("\n[Phase 4a] Creating OTC-AGT-008 Runbooks...");

  const runbooks = [
    {
      name: "Dispute Volume Spike Response",
      description: "Triage procedure for handling unexpected surge in dispute volume, including temporary auto-resolution threshold adjustments and resource allocation.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "threshold",
      triggerConditions: [{ metric: "daily_dispute_count", operator: "gt", threshold: 150, window: "1d" }],
      severity: "high",
      estimatedDuration: "2-4 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Triage incoming disputes by amount and customer tier — prioritize strategic customers and amounts > $10K" },
        { order: 2, action: "Temporarily raise auto-resolution threshold from $500 to $2,000 for pricing and duplicate dispute types only" },
        { order: 3, action: "Notify AR manager and department heads of volume spike with root cause hypothesis" },
        { order: 4, action: "Run Prevention Analytics to check for systemic error driving spike" },
        { order: 5, action: "Allocate additional specialist capacity from deduction coding team if spike persists > 4 hours" },
        { order: 6, action: "Restore normal thresholds once volume returns to baseline; document incident and root cause" },
      ],
      approvalGates: [{ step: 2, approver: "AR Manager", reason: "Auto-resolution threshold increase requires manager authorization" }],
    },
    {
      name: "High-Value Dispute Escalation",
      description: "Procedure for managing disputes exceeding $50,000 including senior management notification, legal review triggers, and expedited investigation.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "threshold",
      triggerConditions: [{ field: "dispute_amount", operator: "gte", value: 50000 }],
      severity: "critical",
      estimatedDuration: "1-2 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Immediately notify VP of Finance and AR Director via priority alert" },
        { order: 2, action: "Assign senior dispute specialist as primary owner — do not process with general queue" },
        { order: 3, action: "Request legal review if dispute involves contract interpretation or potential litigation risk" },
        { order: 4, action: "Gather full evidence package within 4 hours — do not wait for scheduled evidence gathering" },
        { order: 5, action: "Schedule executive alignment call within 24 hours if customer is strategic tier" },
        { order: 6, action: "All resolution proposals require VP Finance approval — no exceptions" },
        { order: 7, action: "Log all actions and communications in dispute record with timestamps" },
      ],
      approvalGates: [{ step: 6, approver: "VP Finance", reason: "High-value dispute resolution requires VP sign-off" }],
    },
    {
      name: "Duplicate Dispute Detection and Merge",
      description: "Procedure for identifying, merging, and handling duplicate dispute submissions for the same underlying claim.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "new_dispute_created", check: "duplicate_match_score_gt_0.85" }],
      severity: "low",
      estimatedDuration: "30 minutes",
      autonomyLevel: "autonomous",
      status: "active",
      steps: [
        { order: 1, action: "Run duplicate detection: match on customer ID + invoice number + amount ± 5% within 30-day window" },
        { order: 2, action: "If match score ≥ 0.85, flag as potential duplicate and pause new dispute processing" },
        { order: 3, action: "Compare dispute details: if same claim, merge into existing dispute record and close new one" },
        { order: 4, action: "Notify customer: 'We have an existing dispute record for this claim — dispute ID [existing_id]'" },
        { order: 5, action: "If disputes differ in detail (different amounts, different evidence), keep both as separate disputes with cross-reference" },
      ],
      approvalGates: [],
    },
    {
      name: "Aging Dispute Alert and Escalation",
      description: "Escalation path for disputes approaching or exceeding SLA thresholds at 30, 60, and 90 day marks.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "scheduled",
      triggerConditions: [{ schedule: "daily_0700", filter: "dispute_age_gte_25_days" }],
      severity: "medium",
      estimatedDuration: "30 minutes per dispute",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Query all open disputes by age bucket: approaching 30 days, at 30-60 days, at 60-90 days, over 90 days" },
        { order: 2, action: "For disputes approaching 30 days: send internal alert to assigned specialist with 5-day warning" },
        { order: 3, action: "At 30-day mark: escalate to AR Manager; require resolution plan within 2 business days" },
        { order: 4, action: "At 60-day mark: escalate to AR Director; schedule management review meeting" },
        { order: 5, action: "At 90-day mark: escalate to VP Finance and Legal; assess write-off or litigation risk" },
        { order: 6, action: "Generate aging dispute report for weekly leadership review" },
      ],
      approvalGates: [{ step: 5, approver: "VP Finance", reason: "90-day disputes require VP awareness and write-off authority" }],
    },
    {
      name: "Systematic Error Pattern Investigation",
      description: "Root cause investigation and mass resolution procedure when 5 or more disputes share the same root cause within a 30-day window.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "threshold",
      triggerConditions: [{ metric: "disputes_same_root_cause_30d", operator: "gte", threshold: 5 }],
      severity: "high",
      estimatedDuration: "2-5 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Run Prevention Analytics Skill: identify all disputes with same root cause pattern" },
        { order: 2, action: "Notify operations team and IT of identified systemic error with detailed evidence" },
        { order: 3, action: "Initiate system correction with IT: price master fix, billing system patch, or process correction" },
        { order: 4, action: "Identify all affected invoices and customers — run full impact assessment" },
        { order: 5, action: "Process mass resolution: batch credit memos or rebills for all affected invoices" },
        { order: 6, action: "Customer communication: proactive outreach explaining error, resolution timeline, and corrective action" },
        { order: 7, action: "Post-resolution: monitor for recurrence over next 30 days" },
      ],
      approvalGates: [{ step: 5, approver: "AR Director", reason: "Mass resolution requires director approval due to financial impact" }],
    },
    {
      name: "Customer Relationship at Risk Protocol",
      description: "Priority handling for high-value customer disputes where relationship deterioration is a risk, including executive involvement and goodwill credit authority.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "manual",
      triggerConditions: [{ trigger: "sales_team_flag", customerTier: "strategic", relationshipRisk: "high" }],
      severity: "high",
      estimatedDuration: "1-3 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Assign to senior specialist; flag as relationship-priority; SLA halved from standard" },
        { order: 2, action: "Notify account executive and sales leadership of dispute and relationship risk flag" },
        { order: 3, action: "Schedule executive alignment: VP Finance + VP Sales + account exec within 24 hours" },
        { order: 4, action: "Perform expedited investigation: full evidence package within 4 business hours" },
        { order: 5, action: "Consider goodwill credit authority (up to $5,000 VP-authorized, $25,000 CFO-authorized) regardless of liability finding" },
        { order: 6, action: "Executive-level customer communication: VP or C-suite reaches out directly if strategic account" },
        { order: 7, action: "Relationship recovery plan: schedule quarterly AR review meeting with customer" },
      ],
      approvalGates: [{ step: 5, approver: "VP Finance", reason: "Goodwill credit requires VP authorization" }],
    },
  ];

  const created = [];
  for (const rb of runbooks) {
    created.push(await createRunbook(rb));
  }
  return created;
}

async function createCashApplicationRunbooks(agentId) {
  console.log("\n[Phase 4b] Creating OTC-AGT-009 Runbooks...");

  const runbooks = [
    {
      name: "Bank Feed Failure Recovery",
      description: "Procedure for maintaining cash application operations when automated bank feed fails, including manual upload and alternate feed activation.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "bank_feed_timeout", consecutiveFailures: 3 }],
      severity: "high",
      estimatedDuration: "1-2 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Alert treasury team and AR manager of bank feed failure with timestamp and error details" },
        { order: 2, action: "Attempt alternate feed connection: switch to BAI2 SFTP pickup if primary API fails" },
        { order: 3, action: "If alternate feed unavailable, initiate manual bank statement download from bank portal" },
        { order: 4, action: "Upload manual statement via Cash Application manual upload interface" },
        { order: 5, action: "Validate statement completeness: transaction count and total credits match bank's transaction summary" },
        { order: 6, action: "Process cash application on manual statement; flag batch as MANUAL_FEED for audit trail" },
        { order: 7, action: "Notify IT to investigate primary feed failure; document for SOX control evidence" },
      ],
      approvalGates: [{ step: 4, approver: "Treasury Manager", reason: "Manual statement upload requires treasury authorization" }],
    },
    {
      name: "Mass Payment File Error Handling",
      description: "Validation and partial processing procedure when a large payment file contains errors or fails validation checks.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "payment_file_validation_failure", errorRate: "gt_5_percent" }],
      severity: "critical",
      estimatedDuration: "2-4 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Quarantine failed payment file — do not process any items until investigation complete" },
        { order: 2, action: "Run file validation report: identify specific error types and count of affected records" },
        { order: 3, action: "Notify payer immediately of file issue with specific error details and resubmission instructions" },
        { order: 4, action: "Isolate valid records from invalid records — process valid portion immediately" },
        { order: 5, action: "For invalid records: attempt auto-correction if error is format/encoding; otherwise hold for resubmission" },
        { order: 6, action: "Document all items held in suspense with expected resolution date" },
        { order: 7, action: "Monitor for resubmitted file; apply corrected records on receipt" },
      ],
      approvalGates: [{ step: 4, approver: "AR Manager", reason: "Partial file processing requires manager approval for audit integrity" }],
    },
    {
      name: "Unapplied Cash Aging Escalation",
      description: "Escalation thresholds and investigation priorities for unapplied cash aging, with write-off authority levels.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "scheduled",
      triggerConditions: [{ schedule: "daily_0800", filter: "unapplied_cash_age_gte_5_days" }],
      severity: "medium",
      estimatedDuration: "1-2 hours",
      autonomyLevel: "autonomous",
      status: "active",
      steps: [
        { order: 1, action: "Query all unapplied cash items by age bucket: 5-15 days, 15-30 days, 30-60 days, over 60 days" },
        { order: 2, action: "For items 5-15 days: Re-run intelligent matching with expanded match parameters; request remittance from payer" },
        { order: 3, action: "For items 15-30 days: Escalate to AR supervisor; assign dedicated investigation resource" },
        { order: 4, action: "For items 30-60 days: Escalate to AR manager; consider refund to payer if customer requests" },
        { order: 5, action: "For items over 60 days: Escalate to controller; assess write-off ($500 limit) or return of funds" },
        { order: 6, action: "Write-off decisions require controller approval; document business rationale" },
      ],
      approvalGates: [{ step: 6, approver: "Controller", reason: "Write-off of unapplied cash requires controller authorization" }],
    },
    {
      name: "Bank Reconciliation Imbalance Investigation",
      description: "Step-by-step investigation checklist for bank reconciliation variances, covering common causes and systematic correction procedures.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "reconciliation_variance_detected", amount: "gt_0" }],
      severity: "high",
      estimatedDuration: "1-4 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Identify variance amount and direction: bank > ERP (deposit in transit or ERP error) or ERP > bank (timing or ERP over-posting)" },
        { order: 2, action: "Check for deposits in transit: look for ERP postings made same day as bank statement cutoff" },
        { order: 3, action: "Check for bank adjustments: bank fees, interest credits, NSF returns not reflected in ERP" },
        { order: 4, action: "Check for duplicate ERP postings: same reference number posted twice" },
        { order: 5, action: "Check for wrong amount posting: manual journal entries that hit bank account incorrectly" },
        { order: 6, action: "If cause identified: correct ERP posting via journal entry (with controller approval for entries > $1,000)" },
        { order: 7, action: "If cause unresolved after 2 hours: escalate to controller and treasury immediately" },
        { order: 8, action: "Document all investigation steps and resolution in reconciliation workpaper" },
      ],
      approvalGates: [{ step: 6, approver: "Controller", reason: "Journal entries correcting reconciliation variance require controller approval" }],
    },
    {
      name: "Period-End Close Cash Application",
      description: "Prioritization and cutoff procedures for completing cash application during period-end close crunch.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "scheduled",
      triggerConditions: [{ schedule: "last_3_business_days_of_month", priority: "critical" }],
      severity: "critical",
      estimatedDuration: "2-3 days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Day T-3: Identify all unmatched payments older than 3 days — assign to dedicated close team for resolution" },
        { order: 2, action: "Day T-2: Freeze auto-match parameters — require manual confirmation for all matches to prevent cross-period errors" },
        { order: 3, action: "Day T-2: Ensure all bank feeds received through last business day; manually retrieve any missing feeds" },
        { order: 4, action: "Day T-1: Complete all possible matches; route remaining exceptions to controller with business impact assessment" },
        { order: 5, action: "Day T-1: Obtain controller approval for any remaining items to post to suspense vs. prior period" },
        { order: 6, action: "Day T (close): Final cut-off — no further postings to closed period after 5 PM local time" },
        { order: 7, action: "Generate final period-end AR balance confirmation and reconciliation certificate" },
        { order: 8, action: "Clear all suspense accounts: transfer to next period or write-off per controller instruction" },
      ],
      approvalGates: [
        { step: 5, approver: "Controller", reason: "Period-end cutoff decisions require controller authorization" },
        { step: 8, approver: "Controller", reason: "Suspense account clearance requires controller sign-off for SOX compliance" },
      ],
    },
    {
      name: "Remittance Format Change Handling",
      description: "Procedure for handling when a customer changes their remittance format, including parser update, manual workaround, and customer notification.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "manual",
      triggerConditions: [{ trigger: "parsing_confidence_drop_below_0.70", customer: "any", consecutivePayments: 2 }],
      severity: "medium",
      estimatedDuration: "1-3 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Detect: consecutive low-confidence parsing from a specific payer indicates format change" },
        { order: 2, action: "Contact payer AR contact to request sample of new remittance format and any documentation" },
        { order: 3, action: "Manual workaround: process affected payments via manual matching until parser is updated" },
        { order: 4, action: "Submit IT ticket for Remittance Parsing Skill update with sample file and mapping requirements" },
        { order: 5, action: "Test updated parser against 5+ historical payments from payer before go-live" },
        { order: 6, action: "Notify payer of updated parsing capability and confirm they will not revert format" },
        { order: 7, action: "Monitor first 3 payment cycles post-update for confidence score ≥ 0.85" },
      ],
      approvalGates: [{ step: 5, approver: "IT Lead", reason: "Parser update requires technical validation before production deployment" }],
    },
  ];

  const created = [];
  for (const rb of runbooks) {
    created.push(await createRunbook(rb));
  }
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: Create Policies
// ─────────────────────────────────────────────────────────────────────────────
async function createDisputePolicies(agentId) {
  console.log("\n[Phase 5a] Creating OTC-AGT-008 Compliance Policies...");

  const policies = [
    {
      name: "Dispute Resolution SOX Audit Trail",
      domain: "audit_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Requires complete and immutable audit trail for all dispute resolutions including credit memo approvals and write-off authorizations per SOX Section 404 internal controls.",
      policyJson: {
        type: "HARD",
        rules: [
          "Every dispute action must be logged with actor ID, timestamp, and action type",
          "Credit memo issuance requires logged approval reference before execution",
          "Write-off decisions must include documented business rationale and approver ID",
          "All dispute records must be retained for minimum 7 years",
          "No retroactive modification of dispute records permitted without audit-logged override",
        ],
        enforcement: "block",
        auditFrequency: "continuous",
      },
    },
    {
      name: "Dispute Auto-Approval Threshold Control",
      domain: "financial_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces dollar-amount thresholds for automated vs. human-approved dispute resolutions. Prevents unauthorized financial adjustments without appropriate approval.",
      policyJson: {
        type: "HARD",
        rules: [
          "Credit memos ≤ $500 may be auto-approved for pricing errors and duplicate invoice disputes",
          "Credit memos $501–$5,000 require supervisor notification; auto-approve permitted",
          "Credit memos > $5,000 require explicit supervisor approval before issuance",
          "Credit memos > $25,000 require director approval",
          "Credit memos > $50,000 require VP Finance approval",
          "Write-offs of any amount require manager approval minimum",
          "Goodwill credits require VP approval regardless of amount",
        ],
        enforcement: "block",
        violationAction: "escalate_for_approval",
      },
    },
    {
      name: "Fair Credit Billing Act Compliance",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures agent complies with Fair Credit Billing Act requirements for B2C dispute acknowledgment and resolution timelines.",
      policyJson: {
        type: "HARD",
        applicability: "B2C_disputes",
        rules: [
          "Acknowledge every B2C dispute within 30 days of receipt",
          "Resolve every B2C dispute within 2 billing cycles (maximum 90 days)",
          "Do not report disputed amount as delinquent during active investigation",
          "Provide written explanation for any adverse determination",
          "Retain all FCBA-related dispute documentation for 3 years minimum",
        ],
        enforcement: "alert_and_block",
        slaMonitoring: "daily",
      },
    },
    {
      name: "Dispute Segregation of Duties",
      domain: "internal_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces segregation between dispute investigation (fact-finding) and dispute resolution (financial adjustment) to prevent fraud and maintain internal control integrity.",
      policyJson: {
        type: "HARD",
        rules: [
          "The agent or person investigating a dispute cannot also approve the resolution",
          "Automated resolution is permitted only within pre-approved auto-approval thresholds",
          "High-value disputes (> $5,000) must have separate reviewer from investigator",
          "Credit memo execution must occur in a separate step from recommendation",
        ],
        enforcement: "block",
        controlType: "preventive",
      },
    },
    {
      name: "Revenue Recognition Impact Policy",
      domain: "revenue_recognition",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures dispute credit memos and invoice adjustments are processed in the correct accounting period and properly documented for revenue recognition compliance.",
      policyJson: {
        type: "SOFT",
        rules: [
          "Credit memos must be posted in the period the resolution was approved, not when originally discovered",
          "Period-end credit memos > $10,000 require controller notification before posting",
          "Revenue reversal credits must be accompanied by revenue recognition memo",
          "Volume rebate adjustments must be coordinated with FP&A before execution",
        ],
        enforcement: "alert",
        reviewFrequency: "monthly",
      },
    },
    {
      name: "Dispute Data Retention and Privacy",
      domain: "data_governance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Governs retention of dispute documentation and customer data per regulatory and legal hold requirements.",
      policyJson: {
        type: "SOFT",
        rules: [
          "Dispute records and documentation must be retained for minimum 7 years",
          "Legal hold disputes must be flagged and excluded from routine purge cycles",
          "Customer PII in dispute records must be masked in non-production environments",
          "Evidence documents (photos, inspection reports) stored in document management system, not in agent memory",
        ],
        enforcement: "alert",
        retentionYears: 7,
      },
    },
  ];

  const created = [];
  for (const p of policies) {
    created.push(await createPolicy(p));
  }
  return created;
}

async function createCashApplicationPolicies(agentId) {
  console.log("\n[Phase 5b] Creating OTC-AGT-009 Compliance Policies...");

  const policies = [
    {
      name: "Cash Application SOX Controls",
      domain: "audit_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces SOX controls over cash receipt processing including segregation of duties, reconciliation requirements, and audit trail completeness.",
      policyJson: {
        type: "HARD",
        rules: [
          "No single individual or agent action may both receive and apply cash without secondary approval",
          "All cash postings must be traceable to a source bank transaction reference",
          "Bank reconciliations must be completed within 2 business days of statement date",
          "Reconciliation variances > $100 must have documented written explanation",
          "Completed reconciliations require controller or designee approval",
          "Reconciliation workpapers must be retained for 7 years",
        ],
        enforcement: "block",
        controlType: "preventive",
        auditFrequency: "continuous",
      },
    },
    {
      name: "Duplicate Payment Detection",
      domain: "anti_fraud",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Prevents duplicate cash application by detecting and blocking application of the same payment reference twice, including same-amount same-date patterns.",
      policyJson: {
        type: "HARD",
        rules: [
          "Before applying any payment, check last 30 days for identical bank reference number from same payer",
          "Block application if payment reference already exists in posted cash",
          "Flag same payer + same amount within 5 business days as potential duplicate — require confirmation",
          "Escalate suspected duplicate payments to AR manager immediately",
          "Document all duplicate detection decisions in payment processing log",
        ],
        enforcement: "block",
        lookbackDays: 30,
      },
    },
    {
      name: "Suspicious Payment Source Policy",
      domain: "banking_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Implements Know-Your-Customer controls for incoming payments from unexpected or new sources, supporting anti-money laundering and fraud prevention obligations.",
      policyJson: {
        type: "HARD",
        rules: [
          "Payments received from bank accounts not on file for the customer must be held in suspense",
          "New payment source must be verified by AR manager before application",
          "Payments from unrecognized entities not matching customer master must trigger compliance review",
          "Wire transfers > $25,000 from new sources require treasury pre-approval",
          "Suspicious activity must be reported to compliance officer within 24 hours",
        ],
        enforcement: "block_and_alert",
        complianceReviewRequired: true,
      },
    },
    {
      name: "Cash Posting Period Cutoff",
      domain: "revenue_recognition",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces proper accounting period cutoff for cash postings to maintain accurate period revenue and AR balance reporting.",
      policyJson: {
        type: "HARD",
        rules: [
          "Cash received before period cutoff must be posted to the current period, not the next",
          "Cash received after period close cannot be backdated without controller authorization",
          "Period-end suspension of auto-posting required in last 2 business days of month",
          "Any posting dated prior to current period requires controller approval",
          "Manual period adjustments must be documented with business justification",
        ],
        enforcement: "block",
        cutoffEnforcement: "strict",
      },
    },
    {
      name: "Unapplied Cash Escalation Thresholds",
      domain: "financial_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Defines escalation requirements and maximum holding periods for unapplied cash balances before write-off or return must be considered.",
      policyJson: {
        type: "SOFT",
        rules: [
          "Unapplied cash held > 5 days: Notify AR supervisor with investigation status",
          "Unapplied cash held > 15 days: Escalate to AR manager with risk assessment",
          "Unapplied cash held > 30 days: Controller notification required",
          "Unapplied cash held > 60 days: Consider refund or write-off; requires controller approval",
          "Total unapplied cash balance > $100,000: Daily reporting to controller and treasury",
        ],
        enforcement: "alert",
        writeOffAuthority: "controller",
      },
    },
    {
      name: "Remittance Data Privacy and Handling",
      domain: "data_governance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Governs secure handling of remittance data including bank account information, payment references, and customer financial data.",
      policyJson: {
        type: "HARD",
        rules: [
          "Bank account numbers in remittance data must be masked (last 4 digits only) in all logs",
          "Remittance files must not be stored in unencrypted form after processing",
          "Customer payment data must not be exported to non-production environments without data masking",
          "Remittance parsing output containing PII must be flagged for data classification",
          "Retain remittance source files for 7 years per audit requirement; mask PII after 90 days",
        ],
        enforcement: "block",
        dataClassification: "CONFIDENTIAL",
        retentionYears: 7,
      },
    },
  ];

  const created = [];
  for (const p of policies) {
    created.push(await createPolicy(p));
  }
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6: Create Golden Datasets + Eval Suites
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
    qualityCoverage: { classification: 1.0, rootCause: 0.90, resolution: 0.95, communication: 0.85, sla: 0.90 },
    performanceBenchmarks: {
      classificationAccuracy: 0.95,
      rootCauseAccuracy: 0.88,
      resolutionAppropriateness: 0.92,
      cycleTimeTarget: 10,
      customerSatisfactionTarget: 0.90,
    },
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
        rootCause: "Price master mismatch — $95 loaded instead of $85 per contract",
      }),
      goldenOutput: "Classify as pricing_error with high confidence. Root cause: price master error (ERP loaded wrong rate). Recommend full credit of $1,000. Amount ≤ $5,000 so supervisor notification only, no explicit approval needed. Issue credit memo. Communicate resolution within 1 business day.",
      tags: ["pricing_error", "full_credit", "standard_customer"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Unauthorized Deduction — Strategic Customer — Partial Reject",
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
      goldenOutput: "Classify as unauthorized_deduction (code not found in promotion schedule). Flag as CRITICAL due to strategic customer + amount > $10K. Route to Sales for relationship management. Reject deduction with evidence package showing no approved promotion PROMO-X99 for MegaRetail Q4. Activate Customer Relationship at Risk runbook. Notify VP and account executive.",
      tags: ["unauthorized_deduction", "strategic_customer", "rejection", "high_value"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Duplicate Invoice Detection",
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
      goldenOutput: "Classify as duplicate_invoice with near-certain confidence. INV-2024-2251 is the duplicate (same order, generated next day). Credit full amount of duplicate invoice ($3,200). Amount < $5,000 — auto-approve permitted. Void INV-2024-2251 in billing system. File IT ticket for billing system audit to prevent recurrence. Communicate resolution to Globex Ltd.",
      tags: ["duplicate_invoice", "auto_resolution", "billing_error"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Quality Dispute — Damaged Goods — Evidence Gathering",
      input: "Customer TechBuild Corp disputes invoice INV-2024-3301 for $22,000 (Order #ORD-67810). Customer claims 40 of 200 units arrived damaged (SKU: HDMI-4K-Pro). Provides photos of damaged packaging. Delivery was made Oct 20 via FedEx freight. Customer filed claim on Oct 22.",
      expectedOutput: JSON.stringify({
        classification: "quality_dispute",
        confidence: 0.93,
        priority: "HIGH",
        routing: "Quality",
        evidenceNeeded: ["POD", "carrier_damage_report", "inspection_photos", "packing_slip"],
        resolution: "partial_credit",
        estimatedAmount: 4400.00,
        approvalRequired: true,
        approvalLevel: "supervisor",
      }),
      goldenOutput: "Classify as quality_dispute (damage claim with photo evidence). Route to Quality team. Gather POD (check for noted damage at delivery), carrier damage report from FedEx, and packing slip. Estimated credit for 40 units × $110 = $4,400. Amount > $500 but < $5,000 — supervisor notification required but auto-approve permitted. Issue partial credit of $4,400 upon evidence confirmation.",
      tags: ["quality_dispute", "partial_credit", "evidence_gathering", "carrier_damage"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Aging Dispute — SLA Breach Risk at Day 28",
      input: "Dispute DIS-2024-0445 for customer NordTech ($15,000 pricing error) has been open for 28 days. Original classification confirmed pricing error. Evidence gathered on Day 3. Root cause confirmed on Day 8. Resolution recommendation made Day 10 but awaiting director approval. Director approval request sent Day 10, no response received.",
      expectedOutput: JSON.stringify({
        escalationRequired: true,
        escalationLevel: "director",
        daysToSLABreach: 2,
        approvalStatus: "pending_18_days",
        immediateAction: "escalate_approval_request",
        customerCommunicationDue: true,
      }),
      goldenOutput: "SLA breach in 2 days. Activate Aging Dispute Alert runbook. Escalate stuck approval to AR Director directly with urgency flag. Send interim update to customer NordTech acknowledging delay and committing to resolution by Day 30. Log escalation with timestamp. If no approval in 24 hours, escalate to VP Finance.",
      tags: ["aging_dispute", "sla_breach", "escalation", "approval_stuck"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Systematic Pattern — 8 Same Root Cause Disputes",
      input: "Prevention Analytics identifies 8 disputes in the last 30 days all classified as pricing_error with root cause 'incorrect price tier applied for distributor segment'. Total dispute value: $45,000 across 8 customers. All originated from invoices generated the same week of Oct 7-11.",
      expectedOutput: JSON.stringify({
        patternDetected: true,
        disputeCount: 8,
        totalAmount: 45000,
        rootCause: "Price tier misconfiguration in ERP for distributor segment",
        systemicIssueScore: 95,
        recommendedAction: "Activate Systematic Error Pattern runbook",
        affectedPeriod: "Oct 7-11",
        preventionROI: { estimatedSavings: 45000, confidence: 0.97 },
      }),
      goldenOutput: "Systemic error confirmed (8 disputes, same root cause, same period). Activate Systematic Error Pattern Investigation runbook. Notify IT and operations immediately. Run full impact assessment: how many invoices generated Oct 7-11 for distributor segment. Batch process credits for all confirmed affected invoices. Proactive customer outreach to all affected accounts. File IT emergency ticket for ERP price tier correction.",
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

  const suite = await createEvalSuite({
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

  return { dataset, suite };
}

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
    scenarioCategories: {
      "Exact Match": 20,
      "Consolidated Payment": 15,
      "Partial Payment": 15,
      "Deduction Classification": 20,
      "Bank Reconciliation": 15,
      "Exception Handling": 15,
    },
    coverageDimensions: ["match_type", "payment_complexity", "remittance_format", "deduction_type", "period_timing"],
    qualityCoverage: { remittanceParsing: 0.95, invoiceMatching: 0.90, deductionCoding: 0.90, bankReconciliation: 0.95, reporting: 0.85 },
    performanceBenchmarks: {
      autoMatchRate: 0.90,
      remittanceParsingAccuracy: 0.92,
      deductionClassificationAccuracy: 0.90,
      reconciliationCompleteness: 0.98,
      processingSpeedTarget: 500,
    },
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
        autoMatchRate: 1.0,
        disposition: "auto_apply",
      }),
      goldenOutput: "Parse EDI 820 with 99% confidence. Extract all 12 invoice references and amounts. Match each to open AR — all 12 exact matches found for Wholesale Partners Inc. Auto-apply full payment. Post 12 cash receipts to AR ledger. Close all 12 invoices. No exceptions. Generate confirmation to treasury.",
      tags: ["EDI_820", "consolidated_payment", "exact_match", "auto_apply"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "PDF Remittance — Partial Payment with Trade Promo Deduction",
      input: "Payment $48,500 from customer FoodMart Corp. PDF remittance shows: Invoice INV-2024-1500 billed $50,000 — deduction $1,500 coded 'PROMO-FALL-2024'. Deduction code PROMO-FALL-2024 exists in approved promotion schedule for FoodMart Corp, approved amount $1,500 for Q4 2024.",
      expectedOutput: JSON.stringify({
        parsingMethod: "PDF_OCR_NLP",
        parserConfidence: 0.91,
        matchType: "partial_with_deduction",
        invoiceMatched: "INV-2024-1500",
        paidAmount: 48500,
        deductionAmount: 1500,
        deductionCode: "PROMO-FALL-2024",
        deductionValidity: "valid",
        deductionOffset: "Trade Promo Accrual",
        disposition: "auto_apply",
      }),
      goldenOutput: "Parse PDF remittance via OCR+NLP at 91% confidence. Match $48,500 to INV-2024-1500 (open $50,000). Validate deduction PROMO-FALL-2024 — found in approved schedule for FoodMart Corp Q4, amount $1,500. Apply $48,500 to invoice, offset $1,500 deduction against Trade Promo Accrual. Invoice fully settled. Auto-apply — no manual review needed.",
      tags: ["PDF_parsing", "partial_payment", "trade_deduction", "valid_deduction"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Unauthorized Deduction — Route to Dispute Agent",
      input: "Payment $95,200 from customer BuildRight Inc for invoice INV-2024-2100 ($100,000). Deduction $4,800 coded 'SHORTAGE-OCT'. POD shows delivery of full order quantity confirmed with customer signature. No shortage claim filed via quality system. No approved shortage allowance in customer contract.",
      expectedOutput: JSON.stringify({
        matchType: "partial_with_invalid_deduction",
        invoiceMatched: "INV-2024-2100",
        paidAmount: 95200,
        deductionAmount: 4800,
        deductionCode: "SHORTAGE-OCT",
        deductionValidity: "invalid",
        disputeCreated: true,
        disputeType: "unauthorized_deduction",
        remainingBalanceOnInvoice: 4800,
      }),
      goldenOutput: "Parse remittance. Match $95,200 to INV-2024-2100 (open $100,000). Validate deduction SHORTAGE-OCT — POD shows full delivery signed by BuildRight Inc. No approved shortage allowance. Mark deduction INVALID. Apply $95,200 to invoice (leave $4,800 open balance). Create dispute record and route to OTC-AGT-008 Dispute Resolution Agent for unauthorized deduction handling.",
      tags: ["invalid_deduction", "dispute_creation", "cross_agent", "unauthorized"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Bank Reconciliation — Deposit in Transit and Bank Fee",
      input: "Bank statement (BAI2) for Oct 31 shows ending balance $2,850,000. ERP AR module shows posted cash receipts for October total $3,100,000. Opening balance was $250,000. Bank statement shows $500 bank service charge not in ERP. There is one deposit of $250,000 posted in ERP Oct 31 that does not appear on Oct 31 bank statement.",
      expectedOutput: JSON.stringify({
        bankEndingBalance: 2850000,
        erpCashBalance: 3100000,
        rawVariance: -250000,
        timingDifferences: [{ type: "deposit_in_transit", amount: 250000, erpDate: "2024-10-31" }],
        errors: [{ type: "bank_fee_not_in_erp", amount: 500, correction: "Post bank fee expense journal entry" }],
        adjustedVariance: -500,
        reconciledStatus: "exception",
        nextAction: "Post $500 bank fee journal entry in ERP then recheck",
      }),
      goldenOutput: "Bank balance $2,850,000. ERP balance $3,100,000 = raw variance ($250,000). Analysis: $250,000 deposit in transit (posted Oct 31 in ERP, will appear Nov 1 bank statement — timing difference, no error). $500 bank service charge on bank statement not yet in ERP — need journal entry. After timing difference adjustment: ERP $3,100,000 - $250,000 deposit in transit = $2,850,000 matches bank. Post $500 bank fee entry to complete reconciliation.",
      tags: ["bank_reconciliation", "deposit_in_transit", "bank_fee", "SOX"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Exception Prioritization — Mixed Aging Queue",
      input: "Unmatched payment queue: (A) $250,000 from strategic customer GlobalMfg, 1 day old. (B) $12,000 from standard customer SmallCo, 8 days old, period end tomorrow. (C) $500 from standard customer TinyCo, 15 days old. (D) $85,000 from preferred customer RegionalDistrib, 3 days old, contains deduction risk.",
      expectedOutput: JSON.stringify({
        prioritizedQueue: [
          { ref: "A", priorityScore: 95, urgency: "Critical", reason: "Strategic customer + high amount + period end proximity" },
          { ref: "D", priorityScore: 88, urgency: "Critical", reason: "High amount + deduction risk + preferred customer" },
          { ref: "B", priorityScore: 72, urgency: "High", reason: "Period end tomorrow + aging 8 days" },
          { ref: "C", priorityScore: 28, urgency: "Low", reason: "Small amount + aging acceptable" },
        ],
      }),
      goldenOutput: "Prioritize queue: (1) GlobalMfg $250K — Critical, strategic customer, investigate first — contact customer for remittance within 1 hour. (2) RegionalDistrib $85K — Critical, deduction risk requires validation before month-end. (3) SmallCo $12K — High, period-end cutoff risk, process today. (4) TinyCo $500 — Low, process tomorrow. Notify supervisor of critical items.",
      tags: ["exception_prioritization", "queue_management", "period_end", "strategic_customer"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Cross-Currency Payment — EUR to USD",
      input: "Wire payment EUR 42,000 received from European customer EuroTech GmbH. Open invoice INV-2024-EUR-055 shows USD 45,150 (EUR 42,000 at contract rate 1.0750 on invoice date Oct 1). Payment date is Oct 28. ECB rate on Oct 28 is 1.0820. Payment bank reference: WT-2024-1028-EUR42000.",
      expectedOutput: JSON.stringify({
        paymentCurrency: "EUR",
        paymentAmount: 42000,
        functionalCurrency: "USD",
        usdAtPaymentRate: 45444,
        invoiceUSD: 45150,
        fxVariance: 294,
        variancePercent: 0.65,
        flagged: true,
        reason: "FX variance 0.65% exceeds 0.5% threshold — requires review",
        disposition: "queue_confirm",
      }),
      goldenOutput: "Convert EUR 42,000 at Oct 28 rate 1.0820 = $45,444. Invoice amount $45,150. FX variance $294 (0.65%) — exceeds 0.5% auto-match threshold. Flag for review: variance driven by FX movement (invoice rate 1.0750 vs. payment date rate 1.0820). Suggest match with FX variance journal entry. Queue for 1-click confirmation by AR specialist. Note: EuroTech GmbH paid correct EUR amount per contract — USD variance is FX movement, not underpayment.",
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

  const suite = await createEvalSuite({
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

  return { dataset, suite };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(70));
  console.log("OTC Agent Creation Script");
  console.log(`Target: ${BASE_URL}`);
  console.log("=".repeat(70));

  const results = {
    disputeSkills: [],
    cashAppSkills: [],
    disputeAgent: null,
    cashAppAgent: null,
    disputeRunbooks: [],
    cashAppRunbooks: [],
    disputePolicies: [],
    cashAppPolicies: [],
    disputeEval: null,
    cashAppEval: null,
  };

  try {
    // Phase 1: Create Dispute Resolution Skills
    results.disputeSkills = await createDisputeResolutionSkills();
    console.log(`  ✓ Created ${results.disputeSkills.length} Dispute Resolution skills`);

    // Phase 2: Create Cash Application Skills
    results.cashAppSkills = await createCashApplicationSkills();
    console.log(`  ✓ Created ${results.cashAppSkills.length} Cash Application skills`);

    // Phase 3a: Create Dispute Resolution Agent (with skills linked)
    results.disputeAgent = await createDisputeResolutionAgent(results.disputeSkills.map(s => s.id));
    console.log(`  ✓ Created agent: ${results.disputeAgent.name} (id: ${results.disputeAgent.id})`);

    // Phase 3b: Create Cash Application Agent (with skills linked)
    results.cashAppAgent = await createCashApplicationAgent(results.cashAppSkills.map(s => s.id));
    console.log(`  ✓ Created agent: ${results.cashAppAgent.name} (id: ${results.cashAppAgent.id})`);

    // Phase 4: Create Runbooks
    results.disputeRunbooks = await createDisputeRunbooks(results.disputeAgent.id);
    console.log(`  ✓ Created ${results.disputeRunbooks.length} Dispute Resolution runbooks`);

    results.cashAppRunbooks = await createCashApplicationRunbooks(results.cashAppAgent.id);
    console.log(`  ✓ Created ${results.cashAppRunbooks.length} Cash Application runbooks`);

    // Phase 5: Create Policies
    results.disputePolicies = await createDisputePolicies(results.disputeAgent.id);
    console.log(`  ✓ Created ${results.disputePolicies.length} Dispute Resolution policies`);

    results.cashAppPolicies = await createCashApplicationPolicies(results.cashAppAgent.id);
    console.log(`  ✓ Created ${results.cashAppPolicies.length} Cash Application policies`);

    // Phase 6: Create Eval Datasets + Suites
    results.disputeEval = await createDisputeEvalDataset(results.disputeAgent.id);
    console.log(`  ✓ Created Dispute eval dataset (id: ${results.disputeEval.dataset.id}) + suite (id: ${results.disputeEval.suite.id})`);

    results.cashAppEval = await createCashApplicationEvalDataset(results.cashAppAgent.id);
    console.log(`  ✓ Created Cash App eval dataset (id: ${results.cashAppEval.dataset.id}) + suite (id: ${results.cashAppEval.suite.id})`);

  } catch (err) {
    console.error("\n✗ FATAL ERROR:", err.message);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Print summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("CREATION COMPLETE — SUMMARY");
  console.log("=".repeat(70));
  console.log("\nOTC-AGT-008: Dispute Resolution Agent");
  console.log(`  Agent ID:      ${results.disputeAgent.id}`);
  console.log(`  Agent Name:    ${results.disputeAgent.name}`);
  console.log(`  Skills:        ${results.disputeSkills.map(s => s.id).join(", ")}`);
  console.log(`  Runbooks:      ${results.disputeRunbooks.map(r => r.id).join(", ")}`);
  console.log(`  Policies:      ${results.disputePolicies.map(p => p.id).join(", ")}`);
  console.log(`  Eval Dataset:  ${results.disputeEval.dataset.id}`);
  console.log(`  Eval Suite:    ${results.disputeEval.suite.id}`);

  console.log("\nOTC-AGT-009: Cash Application & Reconciliation Agent");
  console.log(`  Agent ID:      ${results.cashAppAgent.id}`);
  console.log(`  Agent Name:    ${results.cashAppAgent.name}`);
  console.log(`  Skills:        ${results.cashAppSkills.map(s => s.id).join(", ")}`);
  console.log(`  Runbooks:      ${results.cashAppRunbooks.map(r => r.id).join(", ")}`);
  console.log(`  Policies:      ${results.cashAppPolicies.map(p => p.id).join(", ")}`);
  console.log(`  Eval Dataset:  ${results.cashAppEval.dataset.id}`);
  console.log(`  Eval Suite:    ${results.cashAppEval.suite.id}`);

  // Output machine-readable JSON for curl script generation
  const outputFile = "./scripts/otc-agents-created.json";
  const fs = await import("fs");
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Full results written to ${outputFile}`);
  console.log("  Run: node scripts/generate-prod-curl.mjs to create prod migration script");
}

main();
