/**
 * OTC-AGT-010 & OTC-AGT-011 Creation Script
 * Creates:
 *   OTC-AGT-010  Returns & Refund Processing Agent        (Post-Sale)
 *   OTC-AGT-011  Contract & Pricing Compliance Agent      (Governance)
 *
 * With full platform intelligence:
 *   - Skills (6 per agent)
 *   - Agent with systemPrompt + runtimeConfig.prompt (agent task)
 *   - Runbooks (6 per agent)
 *   - Policies (5 per agent)
 *   - Golden Dataset + Eval Suite (1 per agent)
 *
 * Everything via REST API — no direct DB writes.
 * Usage:  node scripts/create-otc-agt-010-011-dev.js [BASE_URL]
 * Default BASE_URL: http://localhost:5000
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ORG_ID   = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ─── API helper ───────────────────────────────────────────────────────────────
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

const createSkill        = (d)    => { console.log(`  Creating skill: ${d.name}`);        return api("POST", "/api/skills", d); };
const createAgent        = (d)    => { console.log(`  Creating agent: ${d.name}`);        return api("POST", "/api/agents", d); };
const createRunbook      = (d)    => { console.log(`  Creating runbook: ${d.name}`);      return api("POST", "/api/runbooks", d); };
const createPolicy       = (d)    => { console.log(`  Creating policy: ${d.name}`);       return api("POST", "/api/policies", d); };
const createGoldenDataset= (d)    => { console.log(`  Creating dataset: ${d.name}`);      return api("POST", "/api/golden-datasets", d); };
const createTestCase     = (id,d) =>                                                       api("POST", `/api/golden-datasets/${id}/test-cases`, d);
const createEvalSuite    = (d)    => { console.log(`  Creating eval suite: ${d.name}`);   return api("POST", "/api/evals", d); };

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — OTC-AGT-010  Skills
// ═══════════════════════════════════════════════════════════════════════════════
async function createReturnsSkills() {
  console.log("\n[Phase 1] Creating OTC-AGT-010 Returns & Refund Processing Skills...");
  const skills = [];

  skills.push(await createSkill({
    name: "Return Eligibility Validation Skill",
    description: "Validates return requests against policy rules, product category restrictions, purchase date/return window, warranty status, and order history. Handles exceptions such as hazardous materials, personalised items, digital downloads, and perishables. Outputs a structured eligibility decision with reason codes.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["returns", "eligibility", "policy", "warranty", "order-to-cash", "post-sale"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Return Eligibility Validation Skill

## Purpose
Determine whether an incoming return request meets the company's return policy criteria before authorising an RMA or incurring reverse-logistics cost.

## Validation Checks
| Check | Data Source | Pass Condition |
|---|---|---|
| Return Window | Order date + policy table | Purchase date ≤ (today − policy_window_days) |
| Product Category | Item master | Category not in excluded list (hazmat, software, food) |
| Item Condition | Customer declaration | Condition code within acceptable range (new, like-new, good) |
| Warranty Status | Warranty registry | Warranty active OR return type = warranty_claim |
| Fraud Indicators | Return history | Customer lifetime return rate ≤ threshold |
| Quantity | Original order | Return qty ≤ ordered qty |

## Policy Exception Codes
- \`EP-01\`: Beyond return window (grace allowed for strategic customers)
- \`EP-02\`: Non-returnable category
- \`EP-03\`: Return quantity exceeds ordered quantity
- \`EP-04\`: Suspected fraudulent return pattern
- \`EP-05\`: Warranty expired, no warranty coverage

## Output Format
\`\`\`json
{
  "eligible": true,
  "returnType": "refund | exchange | repair | warranty_claim",
  "policyWindow": 30,
  "daysFromPurchase": 12,
  "exceptionCode": null,
  "restockingFeeApplicable": false,
  "restockingFeePercent": 0,
  "reasoning": "Item within 30-day window, product category eligible, no fraud indicators"
}
\`\`\`

## Quality Guardrails
- Never deny based on system guess; always retrieve order data before ruling
- Strategic customers: flag borderline cases for human review rather than auto-deny
- All denials must include specific exception code and policy reference`,
    allowedTools: ["fetch_order_record", "query_return_policy", "query_warranty_registry", "check_return_fraud_indicators"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "RMA Generation Skill",
    description: "Creates Return Merchandise Authorizations, generates pre-paid return shipping labels with carrier selection logic, assigns receiving facility routing, and sets inspection priority. Supports multi-item returns, international returns with customs documentation, and in-store drop-off alternatives.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["RMA", "returns", "shipping-label", "reverse-logistics", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# RMA Generation Skill

## Purpose
Authorise and initiate the physical return by generating an RMA number, selecting the optimal return carrier and routing, and producing all required documentation.

## RMA Number Format
\`RMA-{YYYY}-{MM}-{SEQ6}\` — e.g. RMA-2024-11-000451

## Carrier Selection Logic
| Return Value | Weight | Carrier |
|---|---|---|
| > $500 | Any | UPS Ground (insured, signature) |
| $101–$500 | ≤ 5 lb | USPS Priority Mail |
| $101–$500 | > 5 lb | FedEx Ground |
| ≤ $100 | Any | USPS First Class / cheapest available |
| International | Any | DHL Express (customs docs included) |
| Hazardous | Any | Certified hazmat carrier only |

## Routing Logic
- Electronics / high-value: Central Returns Centre (CRC)
- Apparel, accessories: Regional DC nearest to customer
- Warranty claims: Manufacturer service centre
- Hazardous / battery: Licensed disposal partner
- Vendor return eligible: Direct to vendor location

## Output Format
\`\`\`json
{
  "rmaNumber": "RMA-2024-11-000451",
  "rmaType": "refund | exchange | repair | warranty_claim",
  "carrier": "UPS",
  "trackingNumber": "<pre-generated>",
  "labelUrl": "<signed-url>",
  "receivingFacility": "CRC-EAST-NJ",
  "inspectionPriority": "standard | expedited | hazmat",
  "estimatedReceiptDate": "<ISO date>",
  "customsDocumentUrl": null
}
\`\`\``,
    allowedTools: ["generate_rma_number", "select_return_carrier", "generate_shipping_label", "route_to_facility"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Inspection Guidance Skill",
    description: "Provides item-specific inspection checklists to receiving facility staff, captures inspection outcomes (condition grading, defect type, photos), and recommends disposition routing: restock, refurbish, scrap, vendor return, or customer keep. Generates inspection report for audit and financial processing.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["inspection", "returns", "disposition", "grading", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Inspection Guidance Skill

## Purpose
Standardise the physical inspection of returned items and drive consistent disposition decisions that maximise recovery value.

## Condition Grades
| Grade | Description | Typical Disposition |
|---|---|---|
| A — Like New | Unopened or indistinguishable from new | Restock (full price) |
| B — Good | Open-box, minor cosmetic marks, fully functional | Restock (open-box price) or Refurbish |
| C — Fair | Functional, visible wear or missing accessories | Refurbish or Vendor Return |
| D — Poor | Functional damage affecting usability | Scrap or Parts Recovery |
| F — Non-Functional | Failed power-on or critical defect | Scrap / Manufacturer Warranty Claim |

## Defect Type Codes
- \`DMG-TRANSIT\`: Damage caused during inbound or return shipping
- \`DMG-CUSTOMER\`: Customer-caused damage
- \`MFGR-DEFECT\`: Manufacturing defect (triggers warranty process)
- \`MISSING-PARTS\`: Incomplete return — accessories, manuals missing
- \`WRONG-ITEM\`: Item received differs from RMA-authorized SKU

## Disposition Decision Tree
1. Grade A → Restock immediately
2. Grade B + complete → Restock as open-box
3. Grade C or missing parts → Assess refurb cost vs. recovery value; route if cost < 40% of recovery value
4. Grade D/F + MFGR-DEFECT → Initiate manufacturer warranty claim
5. Grade D/F + DMG-TRANSIT → Initiate carrier damage claim
6. Grade F + customer damage → Scrap; update fraud indicator

## Output Format
\`\`\`json
{
  "rmaNumber": "RMA-2024-11-000451",
  "grade": "B",
  "defectType": null,
  "missingComponents": [],
  "disposition": "restock_open_box",
  "recoveryValue": 85.00,
  "refurbCostEstimate": null,
  "carrierClaimRequired": false,
  "warrantyClaimRequired": false,
  "photoCount": 3
}
\`\`\``,
    allowedTools: ["fetch_inspection_checklist", "record_inspection_outcome", "upload_inspection_photos", "query_refurb_cost_estimate"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Refund Calculation Skill",
    description: "Computes the precise refund amount considering original payment method, applicable restocking fees, return shipping charges, tax refund obligations by state/country, partial refunds for missing components, and promotional pricing adjustments. Generates a refund breakdown document for audit purposes.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["refund", "calculation", "tax", "restocking-fee", "returns", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Refund Calculation Skill

## Purpose
Calculate the exact refund or credit amount owed to the customer, accounting for all applicable fees, tax obligations, and deductions.

## Refund Calculation Formula
\`\`\`
Gross Refund Amount   = Original Item Price × Refund Quantity
Less: Restocking Fee  = Gross × Restocking Fee % (if applicable)
Less: Return Shipping = Outbound shipping cost (if policy requires)
Less: Missing Parts   = Replacement cost of missing accessories
Plus: Tax Refund      = Tax originally charged × Refund Ratio (nexus-aware)
Net Refund            = Gross − Restocking − Shipping − Missing + Tax
\`\`\`

## Restocking Fee Schedule
| Condition | Category | Fee % |
|---|---|---|
| Grade A | Any | 0% |
| Grade B | Electronics | 10% |
| Grade B | Other | 5% |
| Grade C | Electronics | 20% |
| Grade C | Other | 15% |
| Company error (wrong item, defective) | Any | 0% — fee waived |

## Refund Method Priority
1. Original payment method (card refund within Reg Z timelines)
2. Store credit (if original method unavailable or customer preference)
3. Check (if store credit declined, allow 14-day processing)

## Tax Refund Rules
- Sales tax refunded if nexus state requires it (most US states)
- VAT refunded in full for EU returns
- Cross-border: original customs duties not refundable by seller

## Output Format
\`\`\`json
{
  "rmaNumber": "RMA-2024-11-000451",
  "grossRefundAmount": 120.00,
  "restockingFee": 12.00,
  "returnShippingDeducted": 0,
  "missingPartsDeduction": 0,
  "taxRefund": 9.90,
  "netRefundAmount": 117.90,
  "refundMethod": "original_payment",
  "currency": "USD",
  "processingTimeDays": 5,
  "breakdown": [{"component": "Restocking fee 10%", "amount": -12.00}]
}
\`\`\``,
    allowedTools: ["fetch_original_order_pricing", "query_restocking_fee_schedule", "calculate_tax_refund", "query_refund_method_availability"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Return Pattern Analysis Skill",
    description: "Analyses aggregate return data to identify products with anomalous return rates, suppliers with quality issues, customers with potential return fraud patterns, and seasonal return trends. Generates product quality escalations and supplier scorecards. Feeds insights to merchandising, quality, and supplier teams.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["analytics", "returns", "fraud", "supplier", "product-quality", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Return Pattern Analysis Skill

## Purpose
Surface systemic quality and fraud issues from aggregate return data to drive product improvements, supplier accountability, and fraud prevention.

## Key Metrics
| Metric | Definition | Alert Threshold |
|---|---|---|
| SKU Return Rate | Returns / Units Sold (rolling 30d) | > 5% triggers quality review |
| Supplier Return Rate | Returns by supplier / Sold (rolling 90d) | > 8% triggers supplier scorecard |
| Customer Return Rate | Returns / Orders (lifetime) | > 30% triggers fraud review |
| Defect Concentration | MFGR-DEFECT returns / Total returns | > 15% triggers product safety review |
| Fraudulent Return Rate | Flagged fraud / Total returns | > 2% triggers policy tightening |

## Analysis Dimensions
1. **Product Dimension**: Which SKUs / categories have disproportionate return rates?
2. **Supplier Dimension**: Which suppliers generate the most defect-type returns?
3. **Customer Dimension**: Which accounts show return-fraud behavioural patterns?
4. **Channel Dimension**: Which sales channels (online, in-store, marketplace) have highest return rates?
5. **Temporal Dimension**: Seasonal spikes (post-holiday, promotional events)?

## Fraud Indicators
- Same-day purchase + return request
- Return of different item than purchased (item switching)
- Multiple high-value returns in short window
- Return of used consumables as "unused"
- Shipping weight significantly lower than original shipment

## Output Format
\`\`\`json
{
  "analysisWindow": {"from": "<date>", "to": "<date>"},
  "highReturnRateSkus": [{"sku": "ELEC-001", "returnRate": 0.12, "recommendedAction": "Quality investigation"}],
  "supplierEscalations": [{"supplierId": "SUP-042", "defectRate": 0.09, "action": "Scorecard + corrective action plan"}],
  "fraudAlerts": [{"customerId": "CUST-881", "returnRate": 0.38, "pattern": "High-value repeat returns"}],
  "seasonalTrend": {"nextPeakPeriod": "Dec 26–Jan 15", "forecastReturnVolume": 3200}
}
\`\`\``,
    allowedTools: ["query_return_history", "query_sales_data", "query_fraud_indicators", "generate_supplier_scorecard"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Return Customer Communication Skill",
    description: "Generates return-lifecycle communications: RMA confirmation with label and instructions, shipment receipt acknowledgment, inspection update, refund or exchange confirmation with timeline, and rejection notice with policy explanation. Maintains consistent messaging across all channels (email, SMS, portal).",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "basic",
    status: "active",
    tags: ["communication", "returns", "customer", "RMA", "refund-status", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Return Customer Communication Skill

## Purpose
Keep customers informed at every stage of the return lifecycle with clear, accurate, and empathetic communications that reduce WISMO-R (Where Is My Return/Refund) contacts.

## Communication Lifecycle
| Stage | Trigger | SLA | Channel |
|---|---|---|---|
| RMA Confirmed | RMA created | Immediate | Email + Portal |
| Shipment Received | Item scanned at facility | Within 1 hour | Email + SMS |
| Inspection Complete | Disposition determined | Within 4 business hours | Email |
| Refund Processed | Refund initiated | Immediate | Email |
| Exchange Shipped | Replacement dispatched | Immediate | Email + SMS |
| Return Denied | Ineligibility determination | Within 1 business day | Email |

## Communication Standards
- Always include RMA number, original order reference, and return reason
- Refund communications: include exact net amount, refund method, and expected posting date
- Denial communications: include specific policy reason, exception code, and appeal path
- Exchange communications: include new order number and tracking
- Never reference internal system errors or technical details

## Output Format
\`\`\`json
{
  "stage": "rma_confirmed | received | inspection_complete | refund_processed | denied",
  "recipient": {"name": "<name>", "email": "<email>", "phone": "<phone>"},
  "channel": ["email", "sms"],
  "subject": "<subject>",
  "body": "<full message>",
  "rmaNumber": "RMA-2024-11-000451",
  "refundAmount": 117.90,
  "refundMethod": "original_payment",
  "expectedDate": "<ISO date>"
}
\`\`\``,
    allowedTools: ["fetch_customer_contact", "fetch_rma_record", "send_email", "send_sms"],
    contextMode: "inline",
    userInvocable: false,
  }));

  return skills;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — OTC-AGT-011  Skills
// ═══════════════════════════════════════════════════════════════════════════════
async function createContractComplianceSkills() {
  console.log("\n[Phase 2] Creating OTC-AGT-011 Contract & Pricing Compliance Skills...");
  const skills = [];

  skills.push(await createSkill({
    name: "Contract Parsing Skill",
    description: "NLP-based extraction of pricing terms, volume commitments, rebate schedules, SLA obligations, effective dates, and special conditions from contract documents (PDF, Word, XML/EDI). Produces a structured contract object persisted to the contract repository. Supports version-controlled amendments and redline detection.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["contract", "parsing", "NLP", "pricing", "compliance", "order-to-cash", "governance"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Contract Parsing Skill

## Purpose
Convert unstructured or semi-structured contract documents into machine-readable, validated contract objects that can be used for real-time compliance checking.

## Supported Document Types
| Format | Parser | Accuracy |
|---|---|---|
| Structured XML / EDI 850 | Schema parser | 99%+ |
| PDF (machine-generated) | PDF extractor + NLP | 92–97% |
| PDF (scanned) | OCR + NLP | 80–90% |
| Word / DOCX | DOCX parser + NLP | 90–95% |
| Redlined DOCX (amendment) | Change-track parser | 85–93% |

## Extracted Fields
- Contract ID, type (master, order-specific, GPO), parties, effective dates, expiry date
- Pricing tiers: break quantities, unit prices, currency
- Volume commitments: annual / quarterly targets, measurement basis
- Rebate schedule: rebate type (volume, growth, mix), rates, calculation period, settlement method
- Discount authority: maximum discount %, approval level by tier
- SLA terms: delivery lead times, fill rate commitments, penalty schedule
- Renewal terms: auto-renewal window, notice period required

## Validation Rules
- Effective date must be ≥ contract sign date
- Pricing tiers must be monotonically ordered (higher volume = lower price)
- Rebate rates must not create negative net price after all adjustments

## Output Format
\`\`\`json
{
  "contractId": "CTR-2024-0089",
  "type": "master_pricing_agreement",
  "customerId": "CUST-441",
  "effectiveDate": "2024-01-01",
  "expiryDate": "2024-12-31",
  "pricingTiers": [{"minQty": 0, "maxQty": 999, "unitPrice": 45.00}, {"minQty": 1000, "unitPrice": 41.50}],
  "volumeCommitment": {"annualTarget": 500000, "currency": "USD"},
  "rebateSchedule": [{"type": "volume", "attainmentPct": 90, "rebatePct": 2.0}],
  "maxDiscountPct": 15.0,
  "renewalWindow": {"noticeDays": 60},
  "parseConfidence": 0.94,
  "extractedFields": 28,
  "flaggedClauses": []
}
\`\`\``,
    allowedTools: ["fetch_contract_document", "run_nlp_extraction", "validate_contract_structure", "persist_contract_record"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Real-Time Pricing Compliance Skill",
    description: "Validates every order and invoice line against the applicable contract or pricing agreement in real-time. Detects unauthorised discounts, wrong price tier, expired contract pricing, and Robinson-Patman Act pricing discrimination. Blocks or flags non-compliant transactions based on configured enforcement mode.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["pricing", "compliance", "real-time", "contract", "robinson-patman", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Real-Time Pricing Compliance Skill

## Purpose
Ensure every transaction is priced according to applicable contractual or list pricing agreements and that no pricing discrimination or unauthorised override occurs.

## Compliance Checks (executed per order line)
| Check | Rule | Action on Fail |
|---|---|---|
| Contract Price Match | Applied price = contract tier for ordered qty | Flag or Block |
| Discount Authority | Applied discount ≤ authorised level for order value | Block |
| Contract Validity | Contract effective date ≤ order date ≤ expiry date | Flag (expired) |
| Robinson-Patman | Same price to similarly-situated customers | Alert + Legal |
| Government Pricing (FAR) | Price ≤ most-favoured commercial price | Block + Alert |
| Price Deviation | Applied price deviates from contract by > 0.5% | Flag |

## Enforcement Modes
- \`block\`: Reject transaction; return 422 with compliance code
- \`flag\`: Allow transaction; create compliance exception record for review
- \`alert\`: Allow transaction; notify compliance officer; log for audit

## Pricing Deviation Classification
- \`OVER_PRICE\`: Customer charged more than contract → immediate credit required
- \`UNDER_PRICE\`: Customer charged less than contract → unauthorised discount → escalate
- \`WRONG_TIER\`: Correct price but wrong quantity-break tier applied
- \`EXPIRED_CONTRACT\`: Contract expired; fall-through to list price required

## Output Format
\`\`\`json
{
  "orderId": "ORD-2024-88412",
  "lineId": "LINE-003",
  "complianceStatus": "PASS | FAIL | FLAG",
  "appliedPrice": 43.00,
  "contractPrice": 41.50,
  "deviationPct": 3.6,
  "deviationType": "OVER_PRICE",
  "contractId": "CTR-2024-0089",
  "enforcementAction": "flag",
  "complianceCode": "PC-OVER-001",
  "remediation": "Issue credit memo for $1.50/unit overcharge"
}
\`\`\``,
    allowedTools: ["fetch_applicable_contract", "query_price_tier", "query_discount_authority", "create_compliance_exception"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Rebate Calculation Skill",
    description: "Computes earned rebates based on actual period volumes against rebate schedule tiers, accrues rebate liability monthly, and calculates final settlement amounts at period-end. Handles volume, growth, mix, and market-development-fund (MDF) rebate types. Produces rebate accrual journals and settlement instructions.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["rebate", "calculation", "accrual", "settlement", "volume-commitment", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Rebate Calculation Skill

## Purpose
Accurately calculate, accrue, and settle all rebate obligations under customer contracts, ensuring completeness and compliance with ASC 606 variable consideration requirements.

## Rebate Types
| Type | Calculation Basis | Accrual Method |
|---|---|---|
| Volume Rebate | Total $ purchased in period vs. tiered schedule | Progressive accrual at most-likely tier |
| Growth Rebate | YoY purchase growth % vs. baseline | Accrual when growth trajectory confirmed |
| Mix Rebate | % of purchases from qualifying product family | Monthly based on mix attainment |
| Market Dev Fund | Fixed $ allocation per contractual MDF budget | Straight-line over program period |
| Prompt Pay Discount | Days-to-pay compliance % | Applied at invoice level |

## Calculation Process
1. Aggregate actual purchases by rebate measurement period (month/quarter/year)
2. Identify applicable tier in rebate schedule
3. Calculate earned rebate: purchase amount × rebate rate for attained tier
4. Compare to prior-period accrual; compute true-up adjustment
5. Generate journal entry: Dr. Rebate Expense / Cr. Rebate Payable
6. At settlement: Dr. Rebate Payable / Cr. AR or Cash (per settlement method)

## ASC 606 Variable Consideration
- Use expected-value method for tiered volume rebates
- Constrain estimates: only recognise revenue if highly probable not to reverse
- Update estimate every reporting period based on actual run-rate

## Output Format
\`\`\`json
{
  "customerId": "CUST-441",
  "contractId": "CTR-2024-0089",
  "measurementPeriod": "2024-Q3",
  "actualVolume": 412000.00,
  "targetVolume": 500000.00,
  "attainmentPct": 82.4,
  "qualifiedTier": {"minAttainment": 80, "rebatePct": 1.5},
  "earnedRebate": 6180.00,
  "priorAccrual": 4500.00,
  "trueUpAdjustment": 1680.00,
  "settlementMethod": "credit_memo",
  "journalEntry": {"debit": "Rebate Expense", "credit": "Rebate Payable", "amount": 1680.00}
}
\`\`\``,
    allowedTools: ["query_actual_purchase_volume", "fetch_rebate_schedule", "calculate_rebate_tier", "post_rebate_accrual"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Contract Expiration Monitoring Skill",
    description: "Monitors all active contracts for approaching expiry dates and triggers renewal workflows at configurable lead times (90/60/30/14 days). Identifies contracts at risk of lapsing without renewal, activates fall-through pricing, and generates renewal analytics packages with historical performance data for negotiation support.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["contract", "expiration", "renewal", "monitoring", "governance", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Contract Expiration Monitoring Skill

## Purpose
Ensure no contract lapses without a managed renewal or transition, preventing uncontrolled pricing fall-through and protecting revenue.

## Monitoring Schedule
| Days to Expiry | Action | Recipient |
|---|---|---|
| 90 days | Renewal alert + performance package | Account Manager + Sales Leader |
| 60 days | Escalation: no renewal initiated | Sales VP + Finance |
| 30 days | Critical alert: contract near lapse | C-suite notification if strategic |
| 14 days | Emergency escalation; activate fall-through pricing in parallel | All stakeholders |
| 0 days | Contract expired: enforce fall-through pricing; block contract-specific discounts | Automatic |

## Fall-Through Pricing Logic
When contract expires without renewal:
1. Activate standard list price for the customer segment
2. Disable all contract-specific discounts and rebate accruals
3. Notify AR team to validate all open orders against new pricing
4. Alert customer: contract expired, new pricing in effect (regulatory requirement in some jurisdictions)

## Renewal Analytics Package Content
- Historical purchase volume by period vs. commitment targets
- Attainment % and rebate earned
- Pricing comparison: current contract vs. market rates
- Suggested renewal terms with rationale
- Revenue at risk if contract not renewed

## Output Format
\`\`\`json
{
  "contractId": "CTR-2024-0089",
  "customerId": "CUST-441",
  "expiryDate": "2024-12-31",
  "daysToExpiry": 45,
  "renewalStatus": "in_negotiation | not_started | renewed | expired",
  "alertLevel": "warning | critical | emergency",
  "fallThroughPriceActivated": false,
  "renewalPackageSent": true,
  "historicalAttainmentPct": 82.4
}
\`\`\``,
    allowedTools: ["query_contract_repository", "calculate_days_to_expiry", "send_renewal_alert", "activate_fallthrough_pricing"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Audit Report Generation Skill",
    description: "Produces compliance audit reports summarising pricing deviations, unauthorised discounts, rebate accuracy, contract coverage, and regulatory exposure. Generates exception-detail logs, trending analysis, and executive summaries in formats suitable for internal audit, external auditors, and regulatory submissions.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["audit", "report", "compliance", "pricing", "governance", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Audit Report Generation Skill

## Purpose
Provide audit-ready documentation of all compliance activities, exceptions, and resolutions to satisfy internal controls, external auditors, and regulatory requirements.

## Report Types
| Report | Frequency | Audience | Content |
|---|---|---|---|
| Pricing Compliance Summary | Weekly | Finance, Sales | Deviation count, $ impact, resolution status |
| Exception Detail Log | Daily | Compliance Team | All flagged transactions with evidence links |
| Rebate Accrual Reconciliation | Monthly | Controller | Accrual vs. settled amounts by contract |
| Contract Coverage Report | Monthly | Sales Leadership | Customers without active contracts, expired contracts |
| Regulatory Compliance Report | Quarterly | Legal, C-suite | Robinson-Patman, FAR, ASC 606 compliance status |
| Audit Trail Export | On-demand | Internal / External Audit | Full immutable event log with user, timestamp, action |

## Exception Detail Fields
- Exception ID, date, transaction reference
- Compliance check that failed, rule violated
- Deviation amount and percentage
- Resolution action and date
- Approval chain and sign-off

## Output Format
\`\`\`json
{
  "reportType": "pricing_compliance_summary",
  "period": {"from": "<date>", "to": "<date>"},
  "totalTransactionsChecked": 14250,
  "totalExceptions": 37,
  "exceptionRate": 0.0026,
  "totalDeviationAmount": 28500.00,
  "resolvedExceptions": 31,
  "openExceptions": 6,
  "topDeviationType": "UNDER_PRICE",
  "regulatoryFlags": [],
  "reportUrl": "<signed-pdf-url>"
}
\`\`\``,
    allowedTools: ["query_compliance_exceptions", "query_rebate_accruals", "query_audit_trail", "generate_pdf_report"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Negotiation Analytics Skill",
    description: "Provides data-driven analytics to support contract negotiations: historical purchase volume vs. commitment attainment, pricing benchmarks vs. market rates, rebate earned vs. programme cost, customer profitability analysis, and scenario modelling for alternative pricing structures. Produces negotiation readiness packages for sales and finance.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["negotiation", "analytics", "pricing", "contract", "profitability", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Negotiation Analytics Skill

## Purpose
Arm negotiators with data-backed insights that maximise contract value while maintaining competitive positioning and regulatory compliance.

## Analysis Components
| Component | Data Sources | Key Output |
|---|---|---|
| Volume Commitment Analysis | Sales history, contract targets | Attainment %, trend, gap |
| Price Benchmarking | Market data, peer contracts | Position vs. market median |
| Rebate Programme ROI | Rebate paid vs. volume incremental lift | Cost-of-rebate per $ volume |
| Customer Profitability | Revenue, COGS, logistics, rebate, returns | Net margin by customer |
| Scenario Modelling | Proposed terms + historical data | Revenue impact of proposed changes |
| Competitive Context | Win/loss data, competitive intel | Pricing pressure points |

## Scenario Modelling
For each proposed contract term change, calculate:
- Revenue impact (± $ and %) at current and projected volumes
- Rebate liability change
- Compliance risk change (e.g., new discount levels vs. RP Act exposure)
- Break-even volume for proposed pricing

## Output Format
\`\`\`json
{
  "customerId": "CUST-441",
  "negotiationId": "NEG-2024-Q4-441",
  "historicalAttainment": {"avg3Year": 0.84, "lastYear": 0.82},
  "pricePosition": {"vsMarketMedian": -3.2, "percentile": 42},
  "rebateProgramROI": {"costPct": 1.8, "incrementalLiftPct": 5.2},
  "customerNetMargin": 0.18,
  "scenarios": [
    {
      "label": "Proposed: 2% higher volume commit + 0.5% better price",
      "revenueImpact": 45000,
      "rebateLiabilityChange": -8000,
      "netImpact": 37000
    }
  ]
}
\`\`\``,
    allowedTools: ["query_historical_sales", "query_market_pricing_data", "calculate_rebate_roi", "query_customer_profitability"],
    contextMode: "inline",
    userInvocable: false,
  }));

  return skills;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Create Agents
// ═══════════════════════════════════════════════════════════════════════════════
async function createReturnsAgent(skillIds) {
  console.log("\n[Phase 3a] Creating OTC-AGT-010 Returns & Refund Processing Agent...");

  const systemPrompt = `You are the Returns & Refund Processing Agent (OTC-AGT-010) for the Order-to-Cash platform. Your role is to manage the complete reverse logistics process from return authorisation through final financial resolution, ensuring consistent policy application and high customer satisfaction.

## Core Responsibilities
You handle all inbound return requests and execute the complete returns lifecycle:
1. Validate every return request against the applicable return policy before committing to any RMA
2. Determine the correct return type: refund, exchange, repair, or warranty claim
3. Generate RMAs and coordinate return shipping logistics
4. Track return shipments and coordinate receiving facility inspection
5. Calculate precise refund amounts including all applicable fees, deductions, and tax obligations
6. Process financial resolution: refund to original payment, store credit, or exchange order
7. Update inventory for restocked and refurbished items
8. Communicate return status to customers at every stage
9. Analyse return patterns to surface product quality and fraud issues

## Workflow Execution
Process every return request in the following sequence:
1. **Receive & Validate**: Use Return Eligibility Validation Skill — check policy window, product category, condition, warranty, fraud indicators
2. **Authorise**: If eligible, determine return type; if ineligible, communicate denial with policy explanation
3. **Generate RMA**: Use RMA Generation Skill — create RMA number, select carrier, generate label, route to facility
4. **Customer Notification (RMA)**: Use Return Customer Communication Skill — send RMA confirmation with instructions
5. **Track Return Shipment**: Monitor carrier scan events; alert if shipment stalls beyond expected transit time
6. **Receive & Inspect**: Use Inspection Guidance Skill — grade condition, identify defects, recommend disposition
7. **Calculate Refund**: Use Refund Calculation Skill — apply all fees, deductions, and tax rules
8. **Execute Resolution**: Issue refund, generate exchange order, or initiate repair/warranty claim
9. **Customer Notification (Resolution)**: Communicate outcome with exact refund amount and expected date
10. **Inventory Update**: Notify WMS of disposition: restock, refurbish queue, scrap, or vendor return
11. **Pattern Analysis**: Use Return Pattern Analysis Skill — feed outcomes to aggregate analytics

## Return Types You Handle
- Standard refund (customer remorse, preference change)
- Wrong item shipped (seller error — no fees, priority processing)
- Defective / non-functional product (warranty and non-warranty)
- Damaged in transit (carrier claim coordination)
- Exchange for different size / colour / model
- Warranty repair or replacement
- Cross-border / international returns (customs and duty considerations)

## Decision Authority
| Decision | Auto-Process Threshold | Escalation Required Above |
|---|---|---|
| RMA Approval — standard | Any eligible item ≤ $500 | > $500 supervisor review |
| RMA Approval — defective/wrong item | Any amount | No threshold; always auto-approve |
| Refund Execution | ≤ $500 | > $500 confirm with AR manager |
| Goodwill refund (policy exception) | ≤ $50 | > $50 VP Customer Service |
| Carrier damage claim | Any amount | Claim > $1,000 requires manager |
| Return fraud block | Any | Always escalate to Loss Prevention |

## Compliance Obligations
- Consumer Protection: Honour state/federal cooling-off period rights regardless of company policy
- Regulation Z: Process card refunds within 5 business days of return receipt (7-day maximum)
- Environmental: Route hazardous materials (batteries, chemicals) only to licensed disposal partners
- Product Safety: Report defective product returns that indicate safety risk to CPSC within 24 hours
- Tax: Refund sales tax on all eligible returns per nexus state requirements
- Data Privacy: Erase customer data from returned electronic devices before resale or disposal

## Communication Standards
- Acknowledge return request within 1 business hour during business hours
- Provide RMA and label within 1 business day
- Notify customer within 4 business hours of item receipt at facility
- Communicate refund within 1 business day of inspection completion
- Never misrepresent timelines; if processing delayed, proactively notify customer

You must maintain a complete audit trail for every return, including policy validation evidence, inspection records, refund calculation breakdowns, and all customer communications. Never process a refund without a completed inspection record unless the return type is defective or wrong item.`;

  const runtimeTaskPrompt = `Analyse the return request or return lifecycle event presented. For new return requests: validate eligibility using return policy, product category rules, and fraud indicators; if eligible, determine correct return type and generate RMA with appropriate carrier and routing selection; if ineligible, prepare denial with specific exception code and policy reference. For inspection events: review condition grade and defect type; execute disposition routing logic; calculate net refund amount applying restocking fee schedule, tax refund rules, and any missing-parts deductions; initiate refund via original payment method within Regulation Z timeframes; update inventory disposition in WMS. For escalations: apply correct approval level based on refund amount or return type; do not release refund until approval is confirmed in the audit log. For cross-border returns: validate customs documentation requirements; do not issue carrier label until customs forms are complete. For carrier damage claims: collect photo evidence and inspection report; file claim with carrier; do not await claim resolution before issuing customer refund. Always generate customer communication at every stage transition. Flag any potential product safety defects for CPSC notification review immediately. Document all actions with timestamps and reference the RMA number in every record.`;

  const preloadedSkills = skillIds.map((id, i) => ({ skillId: id, loadOrder: i }));

  return await createAgent({
    name: "Returns & Refund Processing Agent",
    agentType: "single",
    description: "Manages the complete reverse logistics process from return authorisation through refund or replacement. Validates return eligibility, generates RMAs and return labels, tracks return shipments, coordinates inspection and disposition, calculates precise refund amounts, and processes financial resolutions. Ensures consistent return policy application while maintaining customer satisfaction and regulatory compliance.",
    owner: "Order-to-Cash — Customer Service & Returns",
    department: "Finance",
    status: "active",
    environment: "development",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt,
    preloadedSkills,
    complianceTags: ["CONSUMER_PROTECTION", "REGULATION_Z", "ENVIRONMENTAL_WEEE", "CPSC", "TAX_NEXUS", "DATA_PRIVACY"],
    toolAccessClass: "standard",
    maxToolIterations: 12,
    healthScore: 97,
    successRate: 0.95,
    avgLatencyMs: 7200,
    runtimeConfig: {
      agentId: "OTC-AGT-010",
      domain: "Order-to-Cash",
      subdomain: "Returns-and-Refunds",
      category: "Post-Sale",
      returnTypes: ["refund", "exchange", "repair", "warranty_claim"],
      autoApproveThresholdUSD: 500,
      refundMethodPriority: ["original_payment", "store_credit", "check"],
      carrierOptions: ["UPS", "FedEx", "USPS", "DHL_Express"],
      dispositionTypes: ["restock", "refurbish", "scrap", "vendor_return", "customer_keep"],
      complianceChecks: ["regulation_z_refund_timeline", "consumer_protection_cooling_off", "cpsc_safety_report", "hazmat_disposal", "data_erasure"],
      fraudIndicatorThreshold: 0.30,
      restockingFeeSchedule: {
        gradeA: 0, gradeBElectronics: 10, gradeBOther: 5, gradeCElectronics: 20, gradeCOther: 15
      },
      prompt: runtimeTaskPrompt,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "OTC-AGT-010",
      category: "Post-Sale",
      nodes: [
        { id: "receive_request", type: "trigger", label: "Receive Return Request (portal/call/email/in-store)" },
        { id: "eligibility_check", type: "skill", label: "Return Eligibility Validation" },
        { id: "eligible_gate", type: "condition", label: "Return Eligible?" },
        { id: "rma_generation", type: "skill", label: "RMA Generation + Label" },
        { id: "track_shipment", type: "action", label: "Track Return Shipment" },
        { id: "receive_inspect", type: "skill", label: "Receive & Inspect (Inspection Guidance)" },
        { id: "disposition_route", type: "action", label: "Route to Disposition" },
        { id: "refund_calculation", type: "skill", label: "Refund Calculation" },
        { id: "execute_resolution", type: "action", label: "Execute Resolution (Refund/Exchange/Repair)" },
        { id: "inventory_update", type: "action", label: "Update Inventory" },
        { id: "customer_communicate", type: "skill", label: "Customer Communication (all stages)" },
        { id: "pattern_analysis", type: "skill", label: "Return Pattern Analysis" },
        { id: "denial", type: "action", label: "Issue Denial Notice" },
      ],
      edges: [
        { from: "receive_request", to: "eligibility_check" },
        { from: "eligibility_check", to: "eligible_gate" },
        { from: "eligible_gate", to: "rma_generation", label: "Yes" },
        { from: "eligible_gate", to: "denial", label: "No" },
        { from: "rma_generation", to: "track_shipment" },
        { from: "track_shipment", to: "receive_inspect" },
        { from: "receive_inspect", to: "disposition_route" },
        { from: "disposition_route", to: "refund_calculation" },
        { from: "refund_calculation", to: "execute_resolution" },
        { from: "execute_resolution", to: "inventory_update" },
        { from: "execute_resolution", to: "customer_communicate" },
        { from: "customer_communicate", to: "pattern_analysis" },
      ],
    },
  });
}

async function createContractComplianceAgent(skillIds) {
  console.log("\n[Phase 3b] Creating OTC-AGT-011 Contract & Pricing Compliance Agent...");

  const systemPrompt = `You are the Contract & Pricing Compliance Agent (OTC-AGT-011) for the Order-to-Cash platform. Your role is to ensure all transactions comply with negotiated contract terms, pricing agreements, and trade policies, while maintaining audit-ready documentation and alerting stakeholders to contract lifecycle events.

## Core Responsibilities
You are the enforcement and monitoring engine for all pricing and contract compliance across the Order-to-Cash process:
1. Ingest and parse new or updated contracts, pricing agreements, and trade policies
2. Monitor every order and invoice for pricing compliance in real-time
3. Detect and flag deviations: unauthorised pricing, exceeded discounts, wrong tier, expired contracts
4. Track volume commitments against actuals for rebate qualification and tier management
5. Calculate earned rebates and manage period-end accrual and settlement
6. Alert stakeholders at 90/60/30/14 day marks before contract expiration
7. Generate compliance audit reports with exception details and regulatory status
8. Maintain a searchable, version-controlled contract repository
9. Provide negotiation analytics packages for contract renewals

## Workflow Execution
**For Contract Ingestion:**
1. Use Contract Parsing Skill — extract all pricing, commitment, and rebate terms
2. Validate parsed contract structure for completeness and logical consistency
3. Persist to contract repository with version control
4. Set expiration monitoring alerts in the monitoring schedule

**For Real-Time Transaction Compliance:**
1. Use Real-Time Pricing Compliance Skill — validate each order/invoice line
2. On deviation: classify deviation type (over-price, under-price, wrong tier, expired)
3. Apply enforcement action per configuration: block, flag, or alert
4. Create compliance exception record with full evidence
5. Route for correction: notify AR team, issue credit memo request, or escalate

**For Rebate Management:**
1. Use Rebate Calculation Skill — compute earned rebate based on actual volumes
2. Post monthly accrual entries; generate true-up at period-end
3. At settlement date: produce credit memo or cheque settlement instruction
4. Flag accrual discrepancies for controller review

**For Contract Expiration:**
1. Use Contract Expiration Monitoring Skill — run daily on full contract portfolio
2. At each alert threshold: notify appropriate stakeholders with renewal analytics package
3. If contract expires without renewal: activate fall-through pricing, disable discounts

**For Audit Reporting:**
1. Use Audit Report Generation Skill — produce scheduled and on-demand reports
2. Maintain complete, immutable audit trail of all compliance checks and actions
3. For regulatory audits: assemble response package within required timeline

## Pricing Deviation Authority
| Deviation Type | Auto-Correct | Escalation Required |
|---|---|---|
| Over-price ≤ $100 | Auto-credit memo | None |
| Over-price $101–$1,000 | Flag for AR review | AR Manager |
| Over-price > $1,000 | Block; require correction | Finance Director |
| Under-price (unauthorised discount) | Always block | Sales VP + Finance |
| Expired contract pricing | Flag + activate fall-through | Account Manager |
| Robinson-Patman potential violation | Immediate hold | Legal + C-suite |
| FAR/DFARS government pricing violation | Immediate block | Legal + CFO |

## Compliance Obligations
- Robinson-Patman Act: Monitor for price discrimination between similarly-situated customers; flag and report immediately
- Government Contract Pricing (FAR/DFARS): Ensure prices offered to government do not exceed most-favoured commercial price
- Anti-Kickback/Anti-Bribery: Detect pricing arrangements that could constitute disguised payments
- Revenue Recognition (ASC 606): Ensure contract modifications are properly accounted for; variable consideration constrained appropriately
- Trade Promotion Compliance: Validate all rebate and promotional programmes against applicable regulations
- Transfer Pricing: Monitor inter-company pricing for multinational compliance

## Reporting Obligations
- Real-time exception dashboard: always current
- Daily exception log to compliance team
- Weekly pricing compliance summary to Finance and Sales
- Monthly rebate accrual reconciliation to Controller
- Quarterly regulatory compliance report to Legal and C-suite
- Annual contract coverage report to Sales Leadership

You must never allow a transaction to bypass compliance checking. All pricing exceptions require documented evidence, classification, and resolution tracking. Regulatory violations must be escalated immediately regardless of amount.`;

  const runtimeTaskPrompt = `Analyse the compliance task presented. For contract ingestion: extract all pricing tiers, volume commitments, rebate schedules, and key dates using the Contract Parsing Skill; validate the parsed structure; persist to repository and schedule expiration alerts. For real-time transaction compliance: check each order or invoice line against the applicable contract using the Real-Time Pricing Compliance Skill; classify any deviation by type and severity; apply the configured enforcement action (block/flag/alert); create a compliance exception record with full evidence trail. For rebate calculation: aggregate actual purchase volumes for the stated period; identify qualifying tier in the rebate schedule; compute earned rebate and compare to prior accrual; generate true-up journal entry and settlement instruction. For contract expiration monitoring: evaluate all active contracts for proximity to expiry; dispatch alerts at 90/60/30/14-day thresholds to appropriate stakeholders; activate fall-through pricing for expired contracts. For regulatory compliance checks: apply Robinson-Patman, FAR/DFARS, ASC 606, and anti-kickback rules; escalate any potential violation to Legal immediately without waiting for resolution confirmation. For audit report requests: assemble the requested report type with full exception detail, trend analysis, and regulatory status; include only verified, auditable data; flag any data gaps. All actions must generate immutable audit log entries with actor, timestamp, action type, and relevant reference IDs.`;

  const preloadedSkills = skillIds.map((id, i) => ({ skillId: id, loadOrder: i }));

  return await createAgent({
    name: "Contract & Pricing Compliance Agent",
    agentType: "single",
    description: "Ensures all transactions comply with negotiated contract terms, pricing agreements, and trade policies. Monitors for pricing deviations, unauthorised discounts, expired contracts, and regulatory violations. Manages contract repository, rebate calculations, expiration alerts, and compliance audit reporting. Provides negotiation analytics for contract renewals.",
    owner: "Order-to-Cash — Contract Management & Compliance",
    department: "Finance",
    status: "active",
    environment: "development",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt,
    preloadedSkills,
    complianceTags: ["ROBINSON_PATMAN", "FAR_DFARS", "ASC_606", "ANTI_KICKBACK", "TRANSFER_PRICING", "SOX", "REVENUE_RECOGNITION"],
    toolAccessClass: "standard",
    maxToolIterations: 15,
    healthScore: 98,
    successRate: 0.97,
    avgLatencyMs: 9100,
    runtimeConfig: {
      agentId: "OTC-AGT-011",
      domain: "Order-to-Cash",
      subdomain: "Contract-Compliance",
      category: "Governance",
      pricingDeviationThresholdPct: 0.5,
      enforcementMode: "flag",
      contractExpiryAlertDays: [90, 60, 30, 14],
      rebateAccrualFrequency: "monthly",
      regulatoryChecks: ["robinson_patman", "far_dfars", "asc_606", "anti_kickback", "transfer_pricing"],
      autoCorrectOverPriceMaxUSD: 100,
      auditRetentionYears: 7,
      prompt: runtimeTaskPrompt,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "OTC-AGT-011",
      category: "Governance",
      nodes: [
        { id: "contract_ingest", type: "trigger", label: "Ingest New/Updated Contract" },
        { id: "contract_parse", type: "skill", label: "Contract Parsing" },
        { id: "contract_persist", type: "action", label: "Persist to Repository + Set Alerts" },
        { id: "order_monitor", type: "trigger", label: "Order/Invoice Transaction Event" },
        { id: "pricing_check", type: "skill", label: "Real-Time Pricing Compliance" },
        { id: "compliance_gate", type: "condition", label: "Compliant?" },
        { id: "exception_record", type: "action", label: "Create Exception Record + Enforce" },
        { id: "rebate_calc", type: "skill", label: "Rebate Calculation (Monthly)" },
        { id: "expiry_monitor", type: "skill", label: "Contract Expiration Monitoring (Daily)" },
        { id: "audit_report", type: "skill", label: "Audit Report Generation" },
        { id: "negotiation_analytics", type: "skill", label: "Negotiation Analytics (On-Demand)" },
      ],
      edges: [
        { from: "contract_ingest", to: "contract_parse" },
        { from: "contract_parse", to: "contract_persist" },
        { from: "order_monitor", to: "pricing_check" },
        { from: "pricing_check", to: "compliance_gate" },
        { from: "compliance_gate", to: "exception_record", label: "Non-Compliant" },
        { from: "rebate_calc", to: "audit_report" },
        { from: "expiry_monitor", to: "audit_report" },
      ],
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Runbooks
// ═══════════════════════════════════════════════════════════════════════════════
async function createReturnsRunbooks(agentId) {
  console.log("\n[Phase 4a] Creating OTC-AGT-010 Returns Runbooks...");
  const runbooks = [
    {
      name: "High-Volume Return Event Response",
      description: "Surge capacity and expedited processing procedure for high-volume return events such as product recalls, seasonal post-holiday spikes, or major product defect discoveries.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "threshold",
      triggerConditions: [{ metric: "daily_return_volume", operator: "gt", threshold: 500, window: "1d" }],
      severity: "high",
      estimatedDuration: "4–8 hours (surge management)",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Classify surge type: product recall (safety), defect batch, seasonal spike, or promotional return wave — response priority differs by type" },
        { order: 2, action: "For product recall: immediately notify Quality, Legal, and Product Safety; activate CPSC reporting process; do NOT wait for standard inspection — accept all returns unconditionally" },
        { order: 3, action: "Increase auto-approval RMA threshold temporarily from $500 to $2,000 for standard return types to reduce specialist queue" },
        { order: 4, action: "Activate overflow receiving at secondary DC; redirect 50% of return volume if primary CRC queue exceeds 48-hour SLA" },
        { order: 5, action: "Notify carrier partners of surge: request additional pickup windows; pre-purchase label blocks" },
        { order: 6, action: "Prioritise Regulation Z compliance: ensure no card refund exceeds 7-day processing window regardless of volume" },
        { order: 7, action: "Stand up customer communication surge response: proactive portal banner with realistic timelines; pre-build status update templates" },
        { order: 8, action: "Daily surge management stand-up until volume returns to baseline; document incident for post-mortem" },
      ],
      approvalGates: [
        { step: 3, approver: "VP Customer Service", reason: "Temporary threshold increase requires VP authorization" },
        { step: 4, approver: "VP Operations", reason: "Secondary DC activation requires operations sign-off" },
      ],
    },
    {
      name: "Fraudulent Return Detection and Investigation",
      description: "Investigation procedure, account flagging, and escalation process when return fraud indicators are detected: item switching, high-value repeat returns, stolen goods returns, or organized retail crime patterns.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "fraud_indicator_threshold_exceeded", fraudScore: "gt_0.30" }],
      severity: "high",
      estimatedDuration: "1–3 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Immediately pause all pending RMAs for the flagged customer account — do not issue labels or accept further returns pending investigation" },
        { order: 2, action: "Notify Loss Prevention and Asset Protection team with fraud score, transaction history, and specific indicator details" },
        { order: 3, action: "Pull return history: last 24 months of returns by this customer — document volume, value, return reasons, and inspection outcomes" },
        { order: 4, action: "Cross-reference returned items against purchase history — confirm item matching; flag item-switching cases with photo evidence" },
        { order: 5, action: "Loss Prevention determination: if fraud confirmed, place account on return-block list; document for potential law enforcement referral" },
        { order: 6, action: "If fraud not confirmed: release held RMAs with enhanced inspection requirement; increase monitoring level for 90 days" },
        { order: 7, action: "For organized retail crime patterns: coordinate with law enforcement and retailer association; do not alert customer to investigation" },
      ],
      approvalGates: [
        { step: 5, approver: "Loss Prevention Manager", reason: "Account block and law enforcement referral require Loss Prevention authorization" },
      ],
    },
    {
      name: "Refund Processing Failure Recovery",
      description: "Manual refund procedure, customer notification, and retry logic when automated refund processing fails due to payment processor error, closed account, expired card, or system outage.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "refund_processing_failed", retryCount: 2 }],
      severity: "high",
      estimatedDuration: "1–2 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Identify failure reason: payment processor decline, closed/expired card, account number change, system timeout, or currency mismatch" },
        { order: 2, action: "For closed/expired card: contact customer immediately to obtain alternative refund method; offer store credit if unable to reach within 24 hours" },
        { order: 3, action: "For payment processor error: wait 4 hours and retry once; if second failure, escalate to Treasury for manual wire or check issuance" },
        { order: 4, action: "For system outage: log all pending refunds in manual queue; process in batch once system restored; ensure Regulation Z deadline not breached" },
        { order: 5, action: "Notify customer of delay with honest explanation and revised refund date; per Regulation Z, refund must complete within 7 business days of return receipt" },
        { order: 6, action: "If Regulation Z 7-day deadline at risk: escalate to Finance Controller; authorise manual check issuance to meet regulatory obligation" },
        { order: 7, action: "Document all failed attempts, retry history, and final resolution method in the RMA audit trail" },
      ],
      approvalGates: [
        { step: 3, approver: "Treasury Manager", reason: "Manual wire or check issuance requires treasury authorization" },
        { step: 6, approver: "Finance Controller", reason: "Regulatory timeline override requires controller sign-off" },
      ],
    },
    {
      name: "Damaged in Transit Carrier Claim",
      description: "Carrier damage claim filing procedure and customer resolution process for items damaged during return shipment, covering evidence collection, claim submission, and customer resolution independent of claim status.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "inspection_defect_type", defectCode: "DMG-TRANSIT" }],
      severity: "medium",
      estimatedDuration: "5–30 business days (carrier claim timeline)",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Collect and preserve all evidence: inspection photos (minimum 8 photos showing all damage angles), packaging photos, weight at receipt, inspection report" },
        { order: 2, action: "File carrier damage claim within carrier's required window (UPS: 9 months; FedEx: 60 days; USPS: 60 days) — do not delay" },
        { order: 3, action: "Issue customer resolution immediately — do not wait for carrier claim outcome: full refund if item unreturnable; replacement ship if preferred" },
        { order: 4, action: "Retain damaged item at receiving facility in original packaging for carrier inspection — carrier has right to inspect for up to 30 days" },
        { order: 5, action: "For claims > $1,000: notify Logistics Manager; monitor claim status weekly; follow up with carrier at Day 7, Day 14, Day 30" },
        { order: 6, action: "On claim settlement: post recovery to Freight Claims clearing account; reconcile against cost of resolution issued to customer" },
        { order: 7, action: "If carrier denies claim: review denial reason; appeal if denial is procedural; escalate to carrier account manager if appeal needed" },
      ],
      approvalGates: [
        { step: 5, approver: "Logistics Manager", reason: "High-value carrier claims require logistics management oversight" },
      ],
    },
    {
      name: "Cross-Border Return Processing",
      description: "Customs considerations, duty refund procedures, and logistics coordination for international customer returns, including documentation requirements and restricted product categories.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "manual",
      triggerConditions: [{ trigger: "return_request_international", customerCountry: "non_domestic" }],
      severity: "medium",
      estimatedDuration: "7–21 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Validate product category is not export-controlled, CITES-restricted, or subject to destination country import restrictions before accepting return" },
        { order: 2, action: "Generate RMA with DHL Express or equivalent international carrier — include commercial invoice, return reason code, and customs declaration (HS code, value)" },
        { order: 3, action: "Advise customer: original customs duties and import taxes are not refundable by seller — only product price and domestic taxes" },
        { order: 4, action: "For EU returns under Distance Selling Regulations: customer has 14-day cooling-off right; seller must refund including original shipping within 14 days of return receipt" },
        { order: 5, action: "On receipt at customs clearance: verify customs documentation matches physical shipment before accepting into facility" },
        { order: 6, action: "Process refund in customer's original currency at the exchange rate used on the original invoice — do not expose company to FX risk on return" },
        { order: 7, action: "For hazardous or regulated products: verify country-specific disposal requirements; do not return to stock if import regulations prohibit resale" },
      ],
      approvalGates: [
        { step: 1, approver: "Trade Compliance Officer", reason: "Export-controlled or restricted product return requires trade compliance review" },
      ],
    },
    {
      name: "System Outage During Return Season",
      description: "Manual RMA process, offline tracking, and customer management procedure when core returns management systems are unavailable during high-volume return periods.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "manual",
      triggerConditions: [{ trigger: "returns_system_unavailable", impactLevel: "high" }],
      severity: "critical",
      estimatedDuration: "Duration of outage + 4-hour recovery",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Activate manual RMA log: Excel-based RMA register with sequential numbering starting from manual range (M-{YYYYMMDD}-{SEQ})" },
        { order: 2, action: "Notify customer-facing teams: portal return requests to be handled by phone/email; post portal banner estimating resolution time" },
        { order: 3, action: "Pre-generate carrier labels in batch using carrier's offline web portal for expected same-day volume" },
        { order: 4, action: "Assign manual tracking: each RMA entered in shared spreadsheet with customer name, item, expected carrier, and return window" },
        { order: 5, action: "On system restoration: batch-import all manual RMAs; verify no sequence gaps; validate all tracking numbers match carrier records" },
        { order: 6, action: "Prioritise Regulation Z compliance: identify any refunds that would breach 7-day window during outage; fast-track those for immediate processing post-restoration" },
        { order: 7, action: "Post-incident review: document outage duration, volume impact, and process gaps; update BCP with lessons learned" },
      ],
      approvalGates: [
        { step: 3, approver: "Operations Manager", reason: "Offline carrier label generation requires manager authorization for billing control" },
        { step: 5, approver: "IT Lead", reason: "Manual data import to production system requires IT sign-off" },
      ],
    },
  ];

  const created = [];
  for (const rb of runbooks) { created.push(await createRunbook(rb)); }
  return created;
}

async function createContractComplianceRunbooks(agentId) {
  console.log("\n[Phase 4b] Creating OTC-AGT-011 Contract & Pricing Compliance Runbooks...");
  const runbooks = [
    {
      name: "Pricing Override Alert Investigation",
      description: "Investigation procedure and authorisation verification workflow when a transaction is detected with a pricing deviation, covering root cause identification and correction.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "pricing_compliance_exception_created", deviationType: "any" }],
      severity: "medium",
      estimatedDuration: "1–4 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Retrieve exception record: identify transaction, deviation type, deviation amount, and applicable contract" },
        { order: 2, action: "Check if deviation was authorised: query discount approval log for this transaction, account, and approver" },
        { order: 3, action: "If authorised deviation: document authorisation reference in exception record; close exception as 'resolved-authorised'" },
        { order: 4, action: "If unauthorised: identify root cause — wrong contract loaded, price master error, manual override without approval, or system error" },
        { order: 5, action: "For over-pricing (customer charged too much): generate immediate credit memo for overcharge amount; notify customer within 1 business day" },
        { order: 6, action: "For under-pricing (unauthorised discount): notify Sales VP and account manager; assess whether to bill correction or absorb for relationship preservation" },
        { order: 7, action: "Root cause correction: submit IT ticket for price master fix, or retrain responsible team member; document corrective action in exception record" },
        { order: 8, action: "For Robinson-Patman risk: immediately notify Legal; halt further transactions with affected pricing structure pending legal review" },
      ],
      approvalGates: [
        { step: 6, approver: "Sales VP", reason: "Billing correction on unauthorised discount requires Sales VP decision" },
        { step: 8, approver: "General Counsel", reason: "Robinson-Patman pricing issue requires legal authorization before any action" },
      ],
    },
    {
      name: "Contract Data Load Failure Recovery",
      description: "Validation checks, manual entry fallback, and reconciliation process when contract ingestion fails, ensuring no transactions proceed without correct pricing governance.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "contract_parse_failure", parseConfidence: "lt_0.70" }],
      severity: "high",
      estimatedDuration: "2–4 hours",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Identify failure reason: document format not supported, required fields missing, logical inconsistency in pricing structure, or system error" },
        { order: 2, action: "Notify Contract Management team immediately: provide specific error details, affected contract ID, and customer impacted" },
        { order: 3, action: "Flag customer account in pricing system: apply 'PENDING CONTRACT' hold — route all new orders for manual pricing verification until contract loaded" },
        { order: 4, action: "Contract Management to review source document and correct issues: fix document structure, fill missing fields, or resolve pricing inconsistencies" },
        { order: 5, action: "Resubmit corrected contract for automated parsing; if second failure, initiate manual key entry by Contract Analyst with supervisor review" },
        { order: 6, action: "Post-load validation: verify 100% of extracted pricing tiers against contract PDF by spot-check (minimum 3 tiers)" },
        { order: 7, action: "Release PENDING CONTRACT hold; notify account manager that contract is active and compliant" },
        { order: 8, action: "Retroactive compliance check: review any transactions processed during the hold period against the now-loaded contract terms" },
      ],
      approvalGates: [
        { step: 5, approver: "Contract Analyst Supervisor", reason: "Manual contract key entry requires supervisor review to ensure accuracy" },
        { step: 6, approver: "Finance Manager", reason: "Post-load validation sign-off required before account hold release" },
      ],
    },
    {
      name: "Mass Pricing Error Response",
      description: "Impact assessment, correction options, and customer notification for systematic pricing errors affecting multiple customers or transactions (e.g., price master corruption, wrong tier loaded globally).",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "threshold",
      triggerConditions: [{ metric: "pricing_exceptions_same_root_cause", operator: "gte", threshold: 10, window: "24h" }],
      severity: "critical",
      estimatedDuration: "1–5 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "IMMEDIATE: Halt all new order pricing processing for affected contract group or price list; notify Order Management to queue new orders pending pricing correction" },
        { order: 2, action: "Assess full impact: query all transactions in scope (last 30 days) for same root cause; calculate total deviation amount and number of affected customers" },
        { order: 3, action: "Notify executive team (CFO, VP Sales, VP Finance) within 1 hour of mass error confirmation with impact assessment" },
        { order: 4, action: "IT emergency ticket: correct price master or contract data; test corrected data against 10 sample transactions before re-activating" },
        { order: 5, action: "Batch correction processing: generate credit memos for all over-pricing cases; determine correction approach for under-pricing (absorb vs. invoice)" },
        { order: 6, action: "Customer proactive notification: for over-pricing, notify all affected customers with credit memo details before customer discovery" },
        { order: 7, action: "Robinson-Patman assessment: if pricing error resulted in different prices for similar customers, engage Legal to assess discrimination exposure" },
        { order: 8, action: "Root cause documentation and control improvement: update price master change controls to require dual approval and automated validation" },
      ],
      approvalGates: [
        { step: 1, approver: "Finance Director", reason: "Order processing halt for pricing requires Finance Director authorization" },
        { step: 5, approver: "CFO", reason: "Batch correction for mass pricing error requires CFO approval due to financial impact" },
        { step: 7, approver: "General Counsel", reason: "Robinson-Patman assessment requires legal team activation" },
      ],
    },
    {
      name: "Rebate Accrual Discrepancy Investigation",
      description: "Investigation checklist, adjustment procedure, and audit documentation for discrepancies between rebate accruals and final settled amounts.",
      industry: "enterprise",
      category: "incident_response",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "rebate_settlement_variance_detected", varianceThreshold: "gt_500_usd" }],
      severity: "medium",
      estimatedDuration: "1–3 business days",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Identify discrepancy: accrual amount vs. settled amount, difference value, and affected contract and customer" },
        { order: 2, action: "Root cause investigation: (a) volume data discrepancy — were all eligible transactions included? (b) tier qualification change — did volume shift between tiers during period? (c) contract amendment not reflected in system? (d) calculation error in accrual logic?" },
        { order: 3, action: "Pull transaction detail: reconcile every eligible transaction against the accrual calculation; identify any missing or duplicated items" },
        { order: 4, action: "If additional rebate owed to customer: process supplemental credit memo with detailed calculation; notify customer with explanation" },
        { order: 5, action: "If over-accrual (less owed than accrued): reverse excess accrual via journal entry; notify Controller and document business reason" },
        { order: 6, action: "Update accrual calculation logic if systemic error identified; test corrected logic against last 3 periods to confirm resolution" },
        { order: 7, action: "Controller review and sign-off: all rebate accrual adjustments > $5,000 require controller approval per SOX controls" },
      ],
      approvalGates: [
        { step: 5, approver: "Controller", reason: "Accrual reversal requires controller approval for SOX compliance" },
        { step: 7, approver: "Controller", reason: "Rebate adjustments >$5,000 require controller sign-off" },
      ],
    },
    {
      name: "Contract Expiration Without Renewal",
      description: "Default pricing activation, sales notification, and customer communication when a contract expires without a successor contract being in place.",
      industry: "enterprise",
      category: "operational",
      agentId,
      triggerType: "automated",
      triggerConditions: [{ event: "contract_expired", renewalStatus: "not_renewed" }],
      severity: "high",
      estimatedDuration: "1 business day",
      autonomyLevel: "autonomous",
      status: "active",
      steps: [
        { order: 1, action: "Immediately activate fall-through pricing for the customer: standard list price for customer segment, zero contract-specific discounts or rebate accruals" },
        { order: 2, action: "Notify account manager, sales VP, and finance of contract expiration and fall-through pricing activation — include revenue impact estimate vs. expired contract pricing" },
        { order: 3, action: "Place alert on customer account: all new orders to display 'CONTRACT EXPIRED — LIST PRICE APPLIES' notification to order entry" },
        { order: 4, action: "Generate customer notification: inform of contract expiration and new pricing effective date — legal requirement in some jurisdictions and good practice universally" },
        { order: 5, action: "Check for any orders in flight at contract pricing: orders accepted but not yet invoiced may retain contract price per applicable law — flag for finance review" },
        { order: 6, action: "Escalate to Sales VP if customer is strategic tier: executive outreach required within 24 hours to manage relationship risk" },
        { order: 7, action: "Schedule daily renewal status check: if renewal finalised within 7 days, retroactively apply contract pricing to any fall-through transactions" },
      ],
      approvalGates: [
        { step: 5, approver: "Finance Director", reason: "In-flight order pricing decision requires finance authorization" },
      ],
    },
    {
      name: "Regulatory Pricing Audit Response",
      description: "Documentation assembly, response procedure, and timeline management for government or regulatory pricing audits including Robinson-Patman investigations, FAR compliance reviews, and transfer pricing examinations.",
      industry: "enterprise",
      category: "escalation",
      agentId,
      triggerType: "manual",
      triggerConditions: [{ trigger: "regulatory_audit_notification", regulatoryBody: "any" }],
      severity: "critical",
      estimatedDuration: "2–12 weeks",
      autonomyLevel: "confirm_before",
      status: "active",
      steps: [
        { order: 1, action: "Immediately notify General Counsel, CFO, and Chief Compliance Officer upon receipt of audit notice — do not respond to regulators without legal counsel involvement" },
        { order: 2, action: "Implement document hold: preserve all contracts, pricing records, transaction data, and communications relevant to audit scope — suspend normal retention deletion for affected records" },
        { order: 3, action: "Engage external counsel with relevant regulatory expertise (antitrust for Robinson-Patman; government contracts for FAR; transfer pricing specialists for TP audits)" },
        { order: 4, action: "Assemble response team: Legal, Finance, Contract Management, Compliance, IT — assign document collection responsibilities by system" },
        { order: 5, action: "Generate audit-ready data package: pricing records, customer transaction history, contract repository export, discount approval logs, rebate settlement records — for requested audit period" },
        { order: 6, action: "Legal review of all documents before production: privilege review, confidentiality protection, and accuracy verification" },
        { order: 7, action: "Coordinate regulator communication exclusively through Legal: no direct employee contact with regulators without legal counsel present" },
        { order: 8, action: "Weekly status update to C-suite with estimated exposure assessment, cooperation strategy, and resolution timeline" },
      ],
      approvalGates: [
        { step: 2, approver: "General Counsel", reason: "Document hold implementation requires legal direction to ensure privilege protection" },
        { step: 6, approver: "General Counsel", reason: "Document production to regulators requires legal sign-off on every submission" },
      ],
    },
  ];

  const created = [];
  for (const rb of runbooks) { created.push(await createRunbook(rb)); }
  return created;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Policies
// ═══════════════════════════════════════════════════════════════════════════════
async function createReturnsPolicies(agentId) {
  console.log("\n[Phase 5a] Creating OTC-AGT-010 Returns Policies...");
  const policies = [
    {
      name: "Regulation Z Refund Timeline Enforcement",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces the Fair Credit Billing Act (Regulation Z) requirement that credit card refunds must be processed within 5 business days of return receipt, with an absolute maximum of 7 business days.",
      policyJson: {
        type: "HARD",
        regulation: "Regulation_Z_12_CFR_Part_1026",
        rules: [
          "Card refund must be initiated within 5 business days of return item receipt at facility",
          "Card refund must complete (credit to customer account) within 7 business days maximum",
          "If refund processing failure occurs, escalate immediately — do not allow timeline to lapse",
          "Store credit may not be offered as substitute without explicit customer consent",
          "Refund amount must equal net refund calculated by Refund Calculation Skill — no rounding or truncation",
          "All refund transactions must be logged with receipt date, initiation date, and completion date",
        ],
        enforcement: "block",
        monitoringFrequency: "real-time",
        slaAlertDays: [3, 5],
      },
    },
    {
      name: "Consumer Protection Cooling-Off Period Policy",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures compliance with federal and state consumer protection cooling-off period rights, which may supersede company return policy in certain transaction types and jurisdictions.",
      policyJson: {
        type: "HARD",
        regulation: "FTC_Cooling_Off_Rule_16_CFR_429 + State_Laws",
        rules: [
          "Door-to-door or off-premises sales: unconditional 3-business-day right to cancel regardless of company policy",
          "Telemarketing sales: honour applicable state cooling-off periods",
          "Fitness club, timeshare, and similar regulated sales: check jurisdiction-specific period (up to 10 days in some states)",
          "Never deny a legally mandated cooling-off cancellation regardless of product condition or company policy restrictions",
          "Document the legal basis for any cooling-off acceptance that overrides standard return policy",
          "Refund for cooling-off period cancellations must process within 10 days of cancellation notice",
        ],
        enforcement: "block",
        geoScope: "United States",
      },
    },
    {
      name: "Product Safety Defect Reporting Policy",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Requires mandatory reporting to the Consumer Product Safety Commission (CPSC) within 24 hours when returned items reveal a potential product safety defect that could cause serious injury, illness, or death.",
      policyJson: {
        type: "HARD",
        regulation: "CPSA_15_USC_2064_Section_15",
        rules: [
          "Any returned item with defect code MFGR-DEFECT and safety risk indicator must trigger CPSC review within 24 hours",
          "Safety risk indicators: fire hazard, electrical shock risk, sharp edge/structural failure, chemical leakage, choking hazard (children's products)",
          "Preserve all defective units as evidence — do not destroy, scrap, or return to supplier until CPSC review complete",
          "Notify Legal and Product Safety team simultaneously with any CPSC report",
          "If CPSC notification required: file Section 15(b) report; cooperate fully with any resulting investigation",
          "Do not proactively destroy evidence of defective products without explicit Legal approval",
        ],
        enforcement: "block",
        reportingWindow: "24 hours",
        notifyRoles: ["legal", "product_safety", "quality"],
      },
    },
    {
      name: "Return Fraud Prevention Policy",
      domain: "internal_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Defines fraud detection thresholds, automatic holds, and investigation triggers for return fraud prevention including item switching, high-frequency high-value returns, and stolen goods returns.",
      policyJson: {
        type: "HARD",
        rules: [
          "Customer lifetime return rate > 30% by count OR > 40% by value: auto-flag for Loss Prevention review before RMA approval",
          "Three or more returns of same SKU within 90 days: flag for item-switching investigation",
          "Return value > $500 with no receipt or digital order record: require photo ID and manual approval",
          "Return item weight at receiving significantly lower than shipped weight (> 15% lighter): flag as potential item-switching",
          "Customer account on fraud watch list: require Loss Prevention approval for any RMA regardless of amount",
          "All returns from new customer accounts (< 30 days) over $200: enhanced verification required",
        ],
        enforcement: "block",
        fraudScoreThreshold: 0.30,
        holdActions: ["pause_rma", "notify_loss_prevention", "require_approval"],
      },
    },
    {
      name: "Environmental Hazardous Materials Disposal Policy",
      domain: "environmental_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures returned hazardous materials, batteries, and electronic waste are routed exclusively to licensed disposal partners in compliance with WEEE Directive, RoHS, and applicable EPA and state environmental regulations.",
      policyJson: {
        type: "HARD",
        regulation: "WEEE_Directive_2012/19/EU + EPA_RCRA + State_E-Waste_Laws",
        rules: [
          "All returned batteries (lithium, lead-acid, NiCd) must be routed to EPA-certified battery recycler — never to general waste",
          "Electronic devices containing hazardous materials (PCBs, CRTs, mercury switches): route to certified e-waste recycler only",
          "No hazardous returned item may be restocked, sold as-is, or placed in general scrap without environmental compliance review",
          "Carrier selection for hazardous return shipments: certified hazmat carrier only; standard carriers prohibited",
          "Return labels for hazardous items must include proper DOT hazmat class labelling",
          "Maintain disposal certificates for all hazardous returns for minimum 7 years (EPA requirement)",
          "Customer data erasure required for all returned electronic devices before any disposal or resale",
        ],
        enforcement: "block",
        disposalPartnerRequired: true,
        retentionYears: 7,
      },
    },
  ];

  const created = [];
  for (const p of policies) { created.push(await createPolicy(p)); }
  return created;
}

async function createContractCompliancePolicies(agentId) {
  console.log("\n[Phase 5b] Creating OTC-AGT-011 Contract & Pricing Compliance Policies...");
  const policies = [
    {
      name: "Robinson-Patman Price Discrimination Prevention Policy",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Enforces Robinson-Patman Act compliance by monitoring for price discrimination between similarly-situated customers purchasing the same grade/quality goods in interstate commerce.",
      policyJson: {
        type: "HARD",
        regulation: "Robinson_Patman_Act_15_USC_13",
        rules: [
          "Any pricing differential between similarly-situated customers must have documented cost justification (different delivery cost, different volume, different service level) before transaction is executed",
          "Promotional pricing must be functionally available to all competing customers on proportionally equal terms",
          "All price deviations from standard list or contract pricing must be logged with business justification",
          "When 5 or more pricing deviations to different customers in the same class occur in the same period, trigger Robinson-Patman analysis before approving further deviations",
          "Pricing to government customers cannot create discrimination exposure for commercial customers",
          "Legal must review any customer-specific pricing arrangement that exceeds 5% below the next-lowest price offered to a similarly-situated customer",
        ],
        enforcement: "alert_and_block",
        escalationPath: ["compliance_officer", "general_counsel"],
        legalReviewThreshold: 0.05,
      },
    },
    {
      name: "Government Contract Pricing FAR/DFARS Compliance Policy",
      domain: "regulatory_compliance",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures pricing offered under government contracts complies with Federal Acquisition Regulation (FAR) and Defense Federal Acquisition Regulation Supplement (DFARS), including most-favoured customer pricing requirements and disclosure obligations.",
      policyJson: {
        type: "HARD",
        regulation: "FAR_Part_15 + DFARS_Part_215",
        rules: [
          "Price offered to government must not exceed the price offered to the most-favoured commercial customer for similar quantities and conditions",
          "Any price reduction offered commercially after government contract award must be disclosed to contracting officer if contract has price reduction clause",
          "Certified cost or pricing data must be accurate, complete, and current as of the date of agreement",
          "Defective pricing (inaccurate certified data) must be immediately disclosed to contracting officer; do not wait for audit discovery",
          "Government-specific contract pricing cannot be offered commercially unless authorised by contracting officer",
          "All government pricing deviations from commercial schedule must be reviewed by Legal before transaction",
        ],
        enforcement: "block",
        applicableContractTypes: ["federal", "state", "defense", "gsa_schedule"],
        notifyRoles: ["legal", "government_contracts_manager"],
      },
    },
    {
      name: "Unauthorised Discount Block Policy",
      domain: "financial_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Prevents execution of any transaction where an unauthorised pricing discount has been applied, enforcing the discount approval matrix and protecting revenue integrity.",
      policyJson: {
        type: "HARD",
        rules: [
          "No transaction may be invoiced at a price below contract or approved list price without documented discount authorisation",
          "Discount authorisation must come from the approval level specified in the discount authority matrix for the deviation amount",
          "Discount authority matrix: Sales Rep up to 5%; Sales Manager up to 10%; Sales Director up to 15%; VP Sales up to 20%; CFO above 20%",
          "Spot discounts in excess of 5% require written authorisation (email or approval system) — verbal approval not accepted",
          "Emergency pricing overrides (competitive situations) require same approval level as standard discounts — urgency is not a waiver",
          "Discounts that would result in negative gross margin require CFO approval regardless of percentage",
          "All applied discounts are logged with approver ID, approval date, and business reason",
        ],
        enforcement: "block",
        violationAction: "hold_transaction_pending_approval",
        auditTrail: "required",
      },
    },
    {
      name: "Revenue Recognition Contract Modification Policy",
      domain: "revenue_recognition",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures contract modifications (amendments, price changes, scope changes) are properly identified, assessed for ASC 606 accounting treatment, and reflected in the contract repository and compliance monitoring before transaction processing resumes.",
      policyJson: {
        type: "SOFT",
        regulation: "ASC_606_Revenue_from_Contracts_with_Customers",
        rules: [
          "Every contract modification must be classified per ASC 606: (a) separate contract, (b) modification to existing contract — prospective, or (c) cumulative catch-up adjustment",
          "Price modifications applied to remaining undelivered performance obligations require revenue reallocation calculation before application",
          "Variable consideration elements (volume rebates, price escalators) must be estimated using expected-value method and constrained to amounts highly probable not to reverse",
          "Contract modifications > $50,000 revenue impact require Controller sign-off on ASC 606 treatment before the modified contract is activated in the compliance system",
          "New or modified rebate structures must be evaluated for variable consideration constraint before accrual method is set",
          "End-of-period: run variable consideration true-up for all active rebate programmes; adjust accruals and document constraint assessment",
        ],
        enforcement: "alert",
        controllerReviewThreshold: 50000,
        auditDocumentation: "required",
      },
    },
    {
      name: "Contract Repository Integrity and Version Control Policy",
      domain: "internal_controls",
      scopeType: "agent",
      scopeId: agentId,
      version: 1,
      status: "active",
      description: "Ensures the contract repository maintains a complete, searchable, and version-controlled record of all active and historical contracts, with access controls and change audit trails for SOX compliance.",
      policyJson: {
        type: "HARD",
        rules: [
          "Every executed contract and amendment must be loaded to the repository within 5 business days of signature",
          "No contract record may be deleted — expired contracts must be archived with full version history",
          "All contract edits must preserve prior versions with timestamp, editor ID, and change reason",
          "Contract repository changes require dual control: one person to edit, one person to approve and activate",
          "Parse confidence scores below 0.80 must not result in automatic contract activation — manual review required",
          "Contracts must be searchable by: customer ID, effective date, product category, pricing tier, and expiry date",
          "Quarterly audit: verify all active contracts in repository match executed documents in legal document management system",
          "Access to modify contract terms restricted to Contract Management team; Sales may view only",
        ],
        enforcement: "block",
        retentionPolicy: "7_years_post_expiry",
        accessControl: "role_based",
        auditFrequency: "quarterly",
      },
    },
  ];

  const created = [];
  for (const p of policies) { created.push(await createPolicy(p)); }
  return created;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Eval Datasets + Suites
// ═══════════════════════════════════════════════════════════════════════════════
async function createReturnsEvalDataset(agentId) {
  console.log("\n[Phase 6a] Creating OTC-AGT-010 Eval Dataset & Suite...");

  const dataset = await createGoldenDataset({
    name: "OTC-AGT-010 Returns & Refund Processing Evaluation Dataset",
    description: "Evaluation dataset for the Returns & Refund Processing Agent covering eligibility validation, RMA generation, refund calculation accuracy, disposition routing, fraud detection, regulatory compliance (Regulation Z, consumer protection), cross-border returns, and carrier damage claims. Includes edge cases such as cooling-off period overrides, borderline return windows, and strategic customer exceptions.",
    industry: "enterprise",
    useCase: "Returns and Refund Processing — Post-Sale Order-to-Cash",
    version: "1.0",
    status: "active",
    tags: ["returns", "refund", "RMA", "order-to-cash", "post-sale", "regulation-z", "fraud"],
    scenarioCategories: {
      "Eligibility Validation": 20,
      "RMA Generation": 15,
      "Refund Calculation": 20,
      "Inspection & Disposition": 15,
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
      { name: "customerCommunicationCompleteness", target: 0.99 },
    ],
  });

  const testCases = [
    {
      name: "Standard Return — Within Window, Full Refund",
      input: "Customer CUST-882 requesting return of 2 units of SKU ELEC-450 (laptop, $899/unit) purchased 18 days ago via online channel. Reason: changed mind. Customer states items are unopened in original packaging. Order ONL-2024-88412.",
      expectedOutput: JSON.stringify({
        eligible: true,
        returnType: "refund",
        policyWindow: 30,
        daysFromPurchase: 18,
        restockingFeeApplicable: false,
        grossRefundAmount: 1798.00,
        netRefundAmount: 1798.00,
        refundMethod: "original_payment",
      }),
      goldenOutput: "Eligibility confirmed: 18 days within 30-day window, product category eligible, no fraud indicators. Return type: refund. Generate RMA-2024-11-000XXX with UPS Ground label (value > $500, insured, signature). Route to CRC. No restocking fee: items unopened (Grade A anticipated). Gross refund $1,798.00. Tax refund per nexus state. Send RMA confirmation immediately. Inspect on receipt — if Grade A confirmed, initiate refund to original payment method within 1 business day.",
      tags: ["standard_return", "full_refund", "grade_a", "within_window"],
      difficulty: "easy",
      weight: 1,
      status: "active",
      origin: "manual",
    },
    {
      name: "Return Beyond Window — Strategic Customer Exception",
      input: "Strategic customer CUST-001 (GlobalCorp, $2.4M annual spend) requesting return of 5 units SKU FURN-220 ($450/unit, $2,250 total) purchased 45 days ago. Company return policy is 30 days. Customer states items were not used, still in original packaging. Reason: project cancelled.",
      expectedOutput: JSON.stringify({
        eligible: "exception_pending",
        exceptionCode: "EP-01",
        policyWindow: 30,
        daysFromPurchase: 45,
        customerTier: "strategic",
        escalationRequired: true,
        recommendedAction: "Flag for human review — strategic customer, borderline case",
      }),
      goldenOutput: "Beyond 30-day return window (EP-01). Customer is Strategic tier ($2.4M ARR). Policy exception evaluation: items unopened, project cancellation reason legitimate, customer relationship value high. Do not auto-deny. Escalate to VP Customer Service for exception approval. If approved: generate RMA with 15% restocking fee (Grade A expected but beyond standard window). Net refund = $2,250 - $337.50 restocking = $1,912.50. Communicate exception decision to customer within 1 business day.",
      tags: ["beyond_window", "strategic_customer", "exception", "escalation"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Defective Product Return — Regulation Z Timeline Test",
      input: "Customer CUST-554 returned defective SKU APPL-110 (blender, $89.99) received at CRC facility today (Day 0). RMA-2024-11-000388. Inspection confirms MFGR-DEFECT: motor failure on first use. Original payment: Visa credit card. Today is Thursday. Customer has been waiting since Day 0 for refund.",
      expectedOutput: JSON.stringify({
        defectType: "MFGR-DEFECT",
        disposition: "manufacturer_warranty_claim",
        restockingFee: 0,
        grossRefundAmount: 89.99,
        taxRefund: 7.42,
        netRefundAmount: 97.41,
        refundMethod: "original_payment",
        regulationZDeadline: "7 business days from today",
        daysTillDeadline: 7,
      }),
      goldenOutput: "Inspection confirms MFGR-DEFECT — motor failure. Disposition: initiate manufacturer warranty claim; preserve unit. No restocking fee (company-caused defect). Full refund: $89.99 + tax $7.42 = $97.41 to original Visa card. Regulation Z: must initiate refund by next Wednesday (7 business days). INITIATE REFUND TODAY — do not delay. Check product safety: motor failure on first use — assess if CPSC notification required (is this an isolated incident or pattern?). Query return history for APPL-110: if 3+ same defects, escalate to Product Safety for CPSC review.",
      tags: ["defective_product", "regulation_z", "mfgr_defect", "cpsc_assessment"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Refund Calculation — Grade B Electronics with Restocking Fee and Missing Accessory",
      input: "Return received for SKU ELEC-220 (tablet, $599.99). Customer purchased 12 days ago. RMA inspection: Grade B (functional, light scratches). Condition: tablet present and working, USB-C cable missing, no charger. Original price $599.99 + tax $49.50. Standard restocking fee applies for Grade B electronics.",
      expectedOutput: JSON.stringify({
        grade: "B",
        defectType: null,
        grossRefundAmount: 599.99,
        restockingFee: 60.00,
        missingPartsDeduction: 35.00,
        taxRefundAmount: 41.63,
        netRefundAmount: 546.62,
        refundMethod: "original_payment",
      }),
      goldenOutput: "Grade B inspection confirmed (functional, cosmetic wear). Missing parts: USB-C cable ($15 replacement cost) + charger ($20 replacement cost) = $35 deduction. Refund calculation: Gross $599.99 - Restocking 10% ($60.00) - Missing Parts ($35.00) = $504.99. Tax refund proportional to net refund = $504.99/$599.99 × $49.50 = $41.63. Net refund = $546.62 to original payment. Generate breakdown document for audit. Communicate to customer with itemized deductions.",
      tags: ["refund_calculation", "restocking_fee", "missing_parts", "grade_b"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Fraud Detection — Item Switching Pattern",
      input: "Return request from CUST-991 for SKU ELEC-500 (gaming console, $499.99). RMA authorized Day 1. Item received at facility — weight at receipt 2.1 lbs vs. original shipment weight 8.3 lbs. Inspection: box opened, console missing, box contains rocks and newspaper. Customer lifetime return rate: 28%. This is the 3rd return of an electronics item this quarter.",
      expectedOutput: JSON.stringify({
        fraudDetected: true,
        fraudType: "item_switching",
        indicators: ["weight_mismatch_significant", "item_not_present", "high_return_rate", "repeat_electronics_returns"],
        fraudScore: 0.95,
        actions: ["deny_refund", "preserve_evidence", "notify_loss_prevention", "account_flag"],
        customerRefund: 0,
      }),
      goldenOutput: "FRAUD CONFIRMED: Item switching. Weight received 2.1 lbs vs. shipped 8.3 lbs — 75% weight deficit. Inspection: console not present (rocks/newspaper). Three electronics returns this quarter. Fraud score 0.95. ACTIONS: (1) Deny refund immediately — customer did not return the purchased item; (2) Preserve all evidence (photos, weight log, inspection report) for law enforcement; (3) Notify Loss Prevention immediately; (4) Place account on permanent return block pending investigation; (5) Consider law enforcement referral for theft by deception. Communicate to customer: return declined (do not reveal full investigation details). Document in fraud case file.",
      tags: ["fraud", "item_switching", "loss_prevention", "deny_refund"],
      difficulty: "hard",
      weight: 3,
      status: "active",
      origin: "manual",
    },
    {
      name: "Cross-Border Return — EU Consumer, Distance Selling Regulations",
      input: "EU customer CUST-DE-204 (Germany) requesting return of order EUR-2024-0412 (clothing items, €285 total) placed online 10 days ago. Customer citing EU distance selling right to cancel within 14 days. Items unopened. Original payment: SEPA debit.",
      expectedOutput: JSON.stringify({
        eligible: true,
        legalBasis: "EU_Distance_Selling_14_Day_Right",
        overridesCompanyPolicy: true,
        daysFromPurchase: 10,
        daysRemaining: 4,
        refundAmountEUR: 285.00,
        refundMethod: "SEPA_debit_reversal",
        refundDeadlineDays: 14,
        customsDutyRefundable: false,
        originalShippingRefundable: true,
      }),
      goldenOutput: "EU Distance Selling Right applies — unconditional 14-day cancellation right supersedes any company return policy. Eligible: 10 days from purchase, 4 days remaining. Generate DHL Express return label with customs documentation (Reason: Customer Return, no duty on re-import). Full refund €285.00 + original shipping cost to SEPA debit within 14 days of return receipt. Tax: VAT refunded in full. Customs duties: not applicable (goods returning to EU seller, no re-import duty). Inform customer of exact refund amount and timeline. Process within 14-day regulatory deadline — non-compliance creates legal exposure under EU consumer law.",
      tags: ["cross_border", "EU_distance_selling", "regulatory_override", "SEPA"],
      difficulty: "hard",
      weight: 2,
      status: "active",
      origin: "manual",
    },
  ];

  console.log("  Adding test cases to dataset...");
  for (const tc of testCases) { await createTestCase(dataset.id, tc); }

  const suite = await createEvalSuite({
    agentId,
    name: "OTC-AGT-010 Returns & Refund Processing Core Regression Suite",
    type: "regression",
    goldenDatasetId: dataset.id,
    industry: "enterprise",
    totalCases: testCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.95, refundCalculationAccuracy: 0.99, regulatoryComplianceRate: 1.0, fraudDetectionRate: 0.90 },
    coverageTags: ["eligibility_validation", "rma_generation", "refund_calculation", "fraud_detection", "regulatory_compliance"],
    ontologyTags: ["returns", "RMA", "refund", "order-to-cash", "post-sale"],
  });

  return { dataset, suite };
}

async function createContractComplianceEvalDataset(agentId) {
  console.log("\n[Phase 6b] Creating OTC-AGT-011 Eval Dataset & Suite...");

  const dataset = await createGoldenDataset({
    name: "OTC-AGT-011 Contract & Pricing Compliance Evaluation Dataset",
    description: "Evaluation dataset for the Contract & Pricing Compliance Agent covering contract parsing accuracy, real-time pricing deviation detection, rebate calculation precision, contract expiration monitoring, audit report generation, and regulatory compliance checks (Robinson-Patman, FAR/DFARS, ASC 606). Includes known compliance violations, borderline discount scenarios, and complex rebate tier calculations.",
    industry: "enterprise",
    useCase: "Contract and Pricing Compliance — Order-to-Cash Governance",
    version: "1.0",
    status: "active",
    tags: ["contract", "pricing", "compliance", "rebate", "governance", "order-to-cash", "robinson-patman"],
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
      { name: "auditReportGenerationSLA", target: "4 hours" },
    ],
  });

  const testCases = [
    {
      name: "Pricing Deviation Detection — Unauthorised Discount Over Threshold",
      input: "Order ORD-2024-19922 for customer CUST-441 (active contract CTR-2024-0089, max discount 15%). Order line: SKU IND-220, quantity 800 units. Contract tier for 800 units: $41.50/unit. Applied price on order: $35.00/unit. Discount applied: 15.7%. Sales rep override code: SR-OVERRIDE-019.",
      expectedOutput: JSON.stringify({
        complianceStatus: "FAIL",
        appliedPrice: 35.00,
        contractPrice: 41.50,
        deviationPct: 15.7,
        deviationType: "UNDER_PRICE",
        maxAuthorizedDiscountPct: 15.0,
        enforcementAction: "block",
        escalationRequired: true,
        escalateTo: ["sales_vp", "finance_director"],
      }),
      goldenOutput: "Pricing deviation detected: applied price $35.00 vs contract price $41.50 = 15.7% discount. Contract CTR-2024-0089 maximum discount is 15%. Deviation of 0.7% above authorised limit. SR-OVERRIDE-019 does not appear in approved override log. BLOCK transaction. Create compliance exception EXC-2024-19922. Escalate to Sales VP and Finance Director: unauthorised discount exceeding authority. Do not release order until VP Sales provides written authorisation or price is corrected to minimum $35.28 (15% max discount off $41.50). Log override attempt with sales rep ID.",
      tags: ["unauthorized_discount", "price_deviation", "block", "escalation"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Robinson-Patman Potential Violation — Same SKU Different Prices",
      input: "Compliance review identifies: Customer A (CUST-200) and Customer B (CUST-201) both in Distributor segment, both purchasing SKU IND-220 in same quantity range (500–999 units). Contract CTR-2024-0089 prices CUST-200 at $41.50/unit. Separate side agreement for CUST-201 shows $38.00/unit for same SKU and quantity range. CUST-200 competes directly with CUST-201 in the Midwest market.",
      expectedOutput: JSON.stringify({
        robinsonPatmanRisk: "HIGH",
        priceDiscrepancy: 3.50,
        discrepancyPct: 8.4,
        costJustificationDocumented: false,
        competingCustomers: true,
        immediateAction: "hold_transactions_and_notify_legal",
        regulatoryExposure: "significant",
      }),
      goldenOutput: "ROBINSON-PATMAN HIGH RISK DETECTED. Same SKU (IND-220), same quantity tier (500-999 units), same customer class (Distributor), competing customers in same geography. Price difference: $3.50/unit (8.4%). No documented cost justification found for differential. IMMEDIATE ACTIONS: (1) Notify General Counsel immediately — do not wait for next business day; (2) Hold all new orders for CUST-201 under the side agreement pricing until legal review complete; (3) Freeze the side agreement — do not execute further transactions at differentiated price; (4) Assemble documentation package: transaction history, customer classification evidence, competitive relationship evidence. Legal must determine if cost justification defence exists or if pricing must be equalised.",
      tags: ["robinson_patman", "legal_escalation", "price_discrimination", "regulatory"],
      difficulty: "hard",
      weight: 3,
      status: "active",
      origin: "manual",
    },
    {
      name: "Rebate Calculation — Volume Tier Attainment at Period End",
      input: "Customer CUST-441, Contract CTR-2024-0089, Q3 2024 rebate calculation. Rebate schedule: 70–79% attainment = 1.0% rebate; 80–89% = 1.5% rebate; 90–100% = 2.0% rebate; >100% = 2.5%. Annual volume commitment: $2,000,000. Q3 actual purchases: $412,000 (annualised run-rate $1,648,000 = 82.4% of $2M target). Prior Q3 accrual balance: $18,000. Q3 eligible revenue: $412,000.",
      expectedOutput: JSON.stringify({
        measurementPeriod: "2024-Q3",
        actualVolume: 412000.00,
        annualisedRunRate: 1648000.00,
        attainmentPct: 82.4,
        qualifiedTierLabel: "80-89%",
        rebatePct: 1.5,
        earnedRebateQ3: 6180.00,
        priorAccrual: 18000.00,
        trueUpRequired: false,
        accrualJournalEntry: { debit: "Rebate Expense", credit: "Rebate Payable", amount: 6180.00 },
      }),
      goldenOutput: "Q3 actual: $412,000. Annualised $1,648,000 = 82.4% of $2M commitment. Qualified tier: 80-89% = 1.5% rebate rate. Q3 earned rebate: $412,000 × 1.5% = $6,180.00. Prior accrual balance $18,000 represents cumulative Q1+Q2 accruals; Q3 incremental accrual $6,180 is additive (not against prior balance — prior balance covers prior periods). Journal entry: Dr. Rebate Expense $6,180 / Cr. Rebate Payable $6,180. Year-to-date accrual now $24,180. ASC 606: at current run-rate, 80-89% tier is most likely outcome — constraint appropriate. Update at Q4 if run-rate changes.",
      tags: ["rebate_calculation", "volume_tier", "asc_606", "accrual"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Contract Expiration — 14-Day Emergency Alert, No Renewal",
      input: "Contract CTR-2024-0089 for strategic customer CUST-441 (account value $2.4M annually) expires in 13 days (Dec 18, 2024). Renewal status: in_negotiation — no signed agreement yet. No extension has been executed. New orders are arriving daily at contract pricing.",
      expectedOutput: JSON.stringify({
        daysToExpiry: 13,
        alertLevel: "emergency",
        renewalStatus: "in_negotiation",
        fallThroughPriceImpact: "estimated_increase_12_pct",
        immediateActions: ["executive_escalation", "parallel_fallthrough_prep", "customer_notification"],
        ordersAtRisk: true,
      }),
      goldenOutput: "EMERGENCY: Contract expiring in 13 days, no renewal signed. Strategic customer, $2.4M ARR. Actions required IMMEDIATELY: (1) Escalate to CFO, VP Sales, and Account VP — executive call to customer within 24 hours; (2) In parallel: prepare fall-through pricing configuration for Dec 19 activation (estimated 12% average price increase vs. current contract); (3) Customer notification required (some jurisdictions): inform CUST-441 of contract expiry and pricing change if not renewed, effective Dec 19; (4) All in-flight orders with expected delivery after Dec 18: flag for pricing re-evaluation post-expiry; (5) If contract signed before Dec 18: activate immediately, suppress fall-through, retroactively apply to any orders processed at list price during the gap.",
      tags: ["contract_expiry", "emergency_escalation", "fallthrough_pricing", "strategic_customer"],
      difficulty: "hard",
      weight: 3,
      status: "active",
      origin: "manual",
    },
    {
      name: "Over-Pricing Detection — Customer Charged Above Contract Rate",
      input: "Invoice INV-2024-44210 for customer CUST-441, SKU IND-220, quantity 1200 units. Contract CTR-2024-0089: for quantity ≥ 1000 units, price = $41.50/unit. Invoice shows $45.00/unit applied. Difference: $3.50/unit × 1200 = $4,200 total overcharge. No pricing override recorded.",
      expectedOutput: JSON.stringify({
        complianceStatus: "FAIL",
        deviationType: "OVER_PRICE",
        appliedPrice: 45.00,
        contractPrice: 41.50,
        deviationPerUnit: 3.50,
        totalOvercharge: 4200.00,
        deviationPct: 8.4,
        immediateAction: "issue_credit_memo",
        creditMemoAmount: 4200.00,
        customerNotificationRequired: true,
      }),
      goldenOutput: "Over-pricing confirmed: $45.00/unit applied vs contract $41.50/unit for 1200 units = $4,200 total overcharge (8.4% deviation). Root cause: wrong tier loaded — 1200 units qualifies for >1000 tier at $41.50, but system applied <1000 tier rate of $45.00. ACTIONS: (1) Immediate credit memo issuance for $4,200 to CUST-441; (2) Notify customer within 1 business day — proactive disclosure before customer discovery; (3) IT ticket: correct price tier logic for qty-break > 1000 in price master; (4) Audit last 30 days for same customer and same SKU for recurrence; (5) Compliance exception closed as 'resolved-auto-corrected'.",
      tags: ["over_pricing", "credit_memo", "price_tier_error", "auto_correct"],
      difficulty: "medium",
      weight: 2,
      status: "active",
      origin: "manual",
    },
    {
      name: "Contract Parsing — New Customer Agreement Extraction",
      input: "New PDF contract uploaded for CUST-550 (RegionalDistrib Inc). Contract is 28 pages, machine-generated PDF. Document contains: 3-year term (2025-01-01 to 2027-12-31), pricing tier table (0-499 units: $52.00; 500-999: $48.50; 1000+: $45.00), annual volume commitment $800,000, Q4 growth rebate 1.8% if YoY growth > 15%, maximum authorised discount 12%, 30-day payment terms, auto-renew if no notice 60 days prior.",
      expectedOutput: JSON.stringify({
        parseConfidence: 0.95,
        contractId: "CTR-2025-CUST550",
        effectiveDate: "2025-01-01",
        expiryDate: "2027-12-31",
        pricingTiersExtracted: 3,
        volumeCommitment: 800000,
        rebateScheduleExtracted: true,
        maxDiscountPct: 12.0,
        paymentTermsDays: 30,
        autoRenew: true,
        renewalNoticeDays: 60,
        flaggedClauses: [],
        readyForActivation: true,
      }),
      goldenOutput: "Contract parsed with 95% confidence. 3 pricing tiers extracted and validated (monotonically decreasing — passes validation). Volume commitment $800,000/year. Growth rebate: 1.8% if YoY growth > 15% — qualifies as variable consideration under ASC 606. Maximum discount 12% loaded to approval matrix. Payment terms: Net 30. Auto-renew: yes, 60-day notice required. Set expiration alerts: Day 547 (24 months to expiry), Day 638 (18 months), Day 730 (12 months), Day 804 (9 months), Day 913 (6 months), Day 1005 (90 days), Day 1035 (60 days), Day 1065 (30 days), Day 1079 (14 days). Contract ready for activation — route to Contract Analyst for dual-approval before going live.",
      tags: ["contract_parsing", "new_contract", "pricing_tiers", "alert_scheduling"],
      difficulty: "medium",
      weight: 1,
      status: "active",
      origin: "manual",
    },
  ];

  console.log("  Adding test cases to dataset...");
  for (const tc of testCases) { await createTestCase(dataset.id, tc); }

  const suite = await createEvalSuite({
    agentId,
    name: "OTC-AGT-011 Contract & Pricing Compliance Core Regression Suite",
    type: "regression",
    goldenDatasetId: dataset.id,
    industry: "enterprise",
    totalCases: testCases.length,
    passRate: 0,
    thresholdConfig: { minPassRate: 0.97, deviationDetectionRate: 0.99, regulatoryFlagAccuracy: 1.0, rebateCalculationAccuracy: 0.99 },
    coverageTags: ["pricing_compliance", "contract_parsing", "rebate_calculation", "regulatory_compliance", "contract_expiration"],
    ontologyTags: ["contract", "pricing", "compliance", "governance", "order-to-cash"],
  });

  return { dataset, suite };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("=".repeat(70));
  console.log("OTC-AGT-010 & OTC-AGT-011 Creation Script");
  console.log(`Target: ${BASE_URL}`);
  console.log("=".repeat(70));

  const results = {
    returnsSkills: [],
    contractSkills: [],
    returnsAgent: null,
    contractAgent: null,
    returnsRunbooks: [],
    contractRunbooks: [],
    returnsPolicies: [],
    contractPolicies: [],
    returnsEval: null,
    contractEval: null,
  };

  try {
    // Phase 1: Returns Skills
    results.returnsSkills = await createReturnsSkills();
    console.log(`  ✓ Created ${results.returnsSkills.length} Returns & Refund skills`);

    // Phase 2: Contract Compliance Skills
    results.contractSkills = await createContractComplianceSkills();
    console.log(`  ✓ Created ${results.contractSkills.length} Contract & Pricing Compliance skills`);

    // Phase 3a: Returns Agent
    results.returnsAgent = await createReturnsAgent(results.returnsSkills.map(s => s.id));
    console.log(`  ✓ Created agent: ${results.returnsAgent.name} (id: ${results.returnsAgent.id})`);

    // Phase 3b: Contract Compliance Agent
    results.contractAgent = await createContractComplianceAgent(results.contractSkills.map(s => s.id));
    console.log(`  ✓ Created agent: ${results.contractAgent.name} (id: ${results.contractAgent.id})`);

    // Phase 4: Runbooks
    results.returnsRunbooks = await createReturnsRunbooks(results.returnsAgent.id);
    console.log(`  ✓ Created ${results.returnsRunbooks.length} Returns runbooks`);

    results.contractRunbooks = await createContractComplianceRunbooks(results.contractAgent.id);
    console.log(`  ✓ Created ${results.contractRunbooks.length} Contract Compliance runbooks`);

    // Phase 5: Policies
    results.returnsPolicies = await createReturnsPolicies(results.returnsAgent.id);
    console.log(`  ✓ Created ${results.returnsPolicies.length} Returns policies`);

    results.contractPolicies = await createContractCompliancePolicies(results.contractAgent.id);
    console.log(`  ✓ Created ${results.contractPolicies.length} Contract Compliance policies`);

    // Phase 6: Eval Datasets + Suites
    results.returnsEval = await createReturnsEvalDataset(results.returnsAgent.id);
    console.log(`  ✓ Returns eval dataset (id: ${results.returnsEval.dataset.id}) + suite (id: ${results.returnsEval.suite.id})`);

    results.contractEval = await createContractComplianceEvalDataset(results.contractAgent.id);
    console.log(`  ✓ Contract eval dataset (id: ${results.contractEval.dataset.id}) + suite (id: ${results.contractEval.suite.id})`);

  } catch (err) {
    console.error("\n✗ FATAL ERROR:", err.message);
    process.exit(1);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("CREATION COMPLETE — SUMMARY");
  console.log("=".repeat(70));

  console.log("\nOTC-AGT-010: Returns & Refund Processing Agent");
  console.log(`  Agent ID:      ${results.returnsAgent.id}`);
  console.log(`  Agent Name:    ${results.returnsAgent.name}`);
  console.log(`  Skills:        ${results.returnsSkills.map(s => s.id).join(", ")}`);
  console.log(`  Runbooks:      ${results.returnsRunbooks.map(r => r.id).join(", ")}`);
  console.log(`  Policies:      ${results.returnsPolicies.map(p => p.id).join(", ")}`);
  console.log(`  Eval Dataset:  ${results.returnsEval.dataset.id}`);
  console.log(`  Eval Suite:    ${results.returnsEval.suite.id}`);

  console.log("\nOTC-AGT-011: Contract & Pricing Compliance Agent");
  console.log(`  Agent ID:      ${results.contractAgent.id}`);
  console.log(`  Agent Name:    ${results.contractAgent.name}`);
  console.log(`  Skills:        ${results.contractSkills.map(s => s.id).join(", ")}`);
  console.log(`  Runbooks:      ${results.contractRunbooks.map(r => r.id).join(", ")}`);
  console.log(`  Policies:      ${results.contractPolicies.map(p => p.id).join(", ")}`);
  console.log(`  Eval Dataset:  ${results.contractEval.dataset.id}`);
  console.log(`  Eval Suite:    ${results.contractEval.suite.id}`);

  // Save IDs for prod migration script generation
  const fs = await import("fs");
  const outputFile = "./scripts/otc-agt-010-011-dev-ids.json";
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Full results written to ${outputFile}`);
  console.log("  Run: node scripts/generate-otc-010-011-prod-curl.js to create prod migration script");
}

main();
