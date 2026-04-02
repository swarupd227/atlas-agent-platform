#!/usr/bin/env node
/**
 * OTC-AGT-006 — Billing & Collections Agent
 * DEV ENVIRONMENT — SINGLE COMPREHENSIVE CREATION SCRIPT
 *
 * Creates ALL platform intelligence in ONE script in the correct order:
 *  ✅ eval schedule → string "weekly:Wednesday:06:00 UTC" (NOT object)
 *  ✅ outcome version → number 1 (NOT string "1.0")
 *  ✅ preloadedSkills → [{skillId, loadOrder}] (NOT bare IDs)
 *  ✅ ontologyTags → fetched dynamically from /api/ontology-concepts/all
 *  ✅ KB sources → POST /sources/text with `title` field
 *  ✅ Runbook agentId → PATCH /api/runbooks/:id {agentId}
 *  ✅ Policy scopeId → PATCH /api/policies/:id {scopeId, scopeType:"agent"}
 *  ✅ KB link → POST /api/agents/:id/knowledge-bases
 *  ✅ Eval + Outcome → PATCH /api/agents/:id {outcomeId, evalBindings:[...]}
 *  ✅ HTML response guard on every API call
 *
 * Usage:  node scripts/create-otc-agt-006-dev.js
 * Saves:  scripts/otc-agt-006-dev-ids.json
 */

import { writeFileSync } from "fs";

const BASE = "http://localhost:5000";
const ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`POST ${path} → HTML (route missing?): ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function patch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`PATCH ${path} → HTML: ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" } });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`GET ${path} → HTML`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, t, msg) => console.log(`\nSTEP ${n}/${t}  ${msg}…`);

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 SKILLS  (Section 7.4)
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Invoice Generation Skill",
    description: "Creates legally compliant, accurate invoices from delivery confirmation data received from the Fulfillment Agent. Constructs invoice header (billing address, ship-to, terms, due date), line items (quantities, unit prices, discounts, extended amounts), tax totals, and payment instructions. Validates against purchase order terms, contract pricing, and customer-specific billing arrangements. Supports standard invoices, credit memos, debit memos, and pro-forma invoices. Renders output in multiple formats (PDF, EDI 810, XML, JSON) and routes to customer-preferred delivery channel (email, EDI, AP portal, physical mail).",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["invoice-generation", "billing", "EDI-810", "tax-application", "credit-memo", "debit-memo", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_delivery_confirmation", "fetch_contract_pricing", "fetch_po_terms", "calculate_line_items", "apply_discounts", "generate_invoice_document", "validate_invoice", "route_to_delivery_channel", "log_invoice_record"],
    requiredMcpServers: ["order-management-mcp", "contract-management-mcp", "billing-system-mcp", "document-delivery-mcp"],
    requiredDataClassifications: ["order_data", "contract_data", "pricing_data", "customer_billing_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["invoice template by country and customer segment", "billing arrangement types", "EDI 810 transaction set requirements", "credit memo issuance rules", "invoice delivery channel preferences"],
    yamlFrontmatter: `name: Invoice Generation Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\ninvoice_types: [standard, credit_memo, debit_memo, pro_forma, recurring]\noutput_formats: [PDF, EDI_810, XML, JSON, HTML]\ndelivery_channels: [email, EDI, AP_portal, physical_mail, customer_portal]\nvalidation_checks: [po_match, contract_price_match, tax_accuracy, due_date_calculation]`,
    markdownBody: `# Invoice Generation Skill\n\n## Purpose\nAutomatically generates accurate, legally compliant invoices from delivery confirmation events. Serves as the primary billing execution component for OTC-AGT-006, transforming fulfillment data into customer-ready invoices with proper tax treatment, payment terms, and delivery routing.\n\n## Invoice Construction Process\n\n### Step 1 — Receive Delivery Confirmation\n- Ingest delivery confirmation from OTC-AGT-005 (Fulfillment Agent)\n- Extract: order ID, ship date, delivered items, quantities, serial/lot numbers\n- Validate confirmation completeness before proceeding\n\n### Step 2 — Retrieve Billing Context\n1. Fetch customer billing profile: billing address, payment terms, tax exemptions, currency\n2. Retrieve contract pricing for each line item (contract > list price hierarchy)\n3. Fetch purchase order reference number and validate against order\n4. Identify applicable billing arrangement (standard, milestone, project-based, subscription)\n\n### Step 3 — Build Invoice Structure\n\n#### Header Fields\n| Field | Source | Validation |\n|---|---|---|\n| Invoice Number | Auto-generated (sequential) | Uniqueness check |\n| Invoice Date | System date at generation | |\n| Due Date | Invoice date + payment terms | |\n| Bill-To Address | Customer master / PO override | |\n| Ship-To Address | Delivery confirmation | |\n| Currency | Customer master / contract | |\n| Payment Terms | Contract > Customer master | |\n| PO Reference | Customer PO number | Required for B2B |\n| Delivery Date | Confirmation timestamp | |\n\n#### Line Item Fields\n| Field | Calculation | Validation |\n|---|---|---|\n| Item Description | Product master | |\n| Quantity | Delivered quantity (not ordered) | Matches confirmation |\n| Unit Price | Contract price > list price | Price match to PO |\n| Discount % | Contract discount tiers | |\n| Extended Amount | Qty × Unit Price × (1 - Discount%) | |\n| Tax Amount | Tax Calculation Skill output | Jurisdiction validated |\n\n### Step 4 — Invoice Types\n\n#### Standard Invoice\n- Issued upon delivery confirmation\n- Contains all delivered line items\n- Tax applied per Tax Calculation Skill\n\n#### Credit Memo\n- Issued for: returns, pricing corrections, dispute resolutions, overpayments\n- References original invoice number\n- Reduces AR balance; may trigger refund if credit balance exists\n- Requires authorization: amounts <$1,000 (auto); $1,000-$10,000 (AR Manager); >$10,000 (CFO approval)\n\n#### Debit Memo\n- Issued for: price adjustments upward, additional charges, freight corrections\n- References original invoice\n- Adds to AR balance\n- Customer notification required before issuance\n\n### Step 5 — Validation Checks\n1. **PO Validation**: Invoice amounts match PO within ±2% tolerance (configurable)\n2. **Contract Price Validation**: Unit prices match active contract pricing\n3. **Tax Accuracy**: Tax calculation verified against jurisdiction rules\n4. **Duplicate Invoice Check**: Verify no duplicate invoice for same delivery event\n5. **Customer-Specific Formatting**: Apply country, segment, or customer-specific templates\n\n### Step 6 — Format and Deliver\n- Generate PDF for email/portal delivery\n- Generate EDI 810 for customers with EDI trading partner agreements\n- Generate XML/JSON for API-connected AP systems\n- Route via customer-preferred delivery channel\n- Log invoice in AR system with status "SENT"\n\n## Invoice Number Format\n\`INV-[YEAR][MONTH]-[SEQUENCE]\` — Example: INV-202403-004521\n\n## Error Handling\n- Missing contract pricing: flag for manual review; DO NOT issue at list price without approval\n- PO mismatch >2%: hold invoice; notify AR team and customer for resolution\n- Tax calculation failure: escalate to Tax Engine Down runbook\n- Delivery channel failure: retry 3x; fall back to email; log failed delivery attempt`,
  },
  {
    organizationId: ORG,
    name: "Tax Calculation Skill",
    description: "Performs multi-jurisdiction sales tax and VAT computation for invoice line items based on ship-from and ship-to addresses, product taxability classifications, customer tax exemption status, and applicable tax nexus. Handles US state and local sales tax, EU VAT (including reverse charge mechanism), Canadian GST/HST/PST, India GST (CGST/SGST/IGST), and Latin America e-invoicing tax requirements. Validates exemption certificates, applies product-level taxability overrides, and produces tax detail records suitable for tax compliance filing. Flags exceptions when tax rules cannot be confidently applied for manual review.",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Invoice Generation Skill"],
    tags: ["tax-calculation", "sales-tax", "VAT", "GST", "multi-jurisdiction", "tax-exemption", "e-invoicing", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "lookup_tax_jurisdiction", "apply_tax_rates", "validate_exemption_certificate", "apply_product_taxability", "calculate_vat_reverse_charge", "generate_tax_line_detail", "flag_tax_exception"],
    requiredMcpServers: ["tax-engine-mcp", "address-validation-mcp", "customer-master-mcp", "product-catalog-mcp"],
    requiredDataClassifications: ["tax_data", "customer_data", "product_data", "address_data", "exemption_certificate_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["sales tax rates by state and locality", "VAT rates by EU member state", "India GST CGST SGST IGST rules", "product taxability by category", "tax exemption certificate validation", "reverse charge mechanism rules"],
    yamlFrontmatter: `name: Tax Calculation Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\ntax_regimes: [US_sales_tax, EU_VAT, Canada_GST_HST_PST, India_GST, LatAm_e-invoice]\nexemption_validation: true\nnexus_check: true\nreverse_charge: true\nfallback_on_engine_down: true`,
    markdownBody: `# Tax Calculation Skill\n\n## Purpose\nComputes accurate sales tax, VAT, and indirect taxes for all invoice line items across jurisdictions. Ensures correct tax collection, remittance eligibility, and compliance with country-specific e-invoicing mandates.\n\n## Tax Calculation Logic by Regime\n\n### US Sales Tax\n1. Determine nexus: does seller have economic or physical nexus in ship-to state?\n2. Validate customer exemption certificate (if on file): certificate type, expiry, product applicability\n3. Determine product taxability: tangible personal property vs. SaaS vs. service vs. digital goods (state-specific rules)\n4. Look up combined tax rate: state + county + city + special district\n5. Apply rate to taxable line item extended amount\n6. Generate tax line detail: jurisdiction code, rate, taxable basis, tax amount\n\n**Economic Nexus Thresholds (key states)**:\n| State | Sales Threshold | Transaction Threshold |\n|---|---|---|\n| California | $500,000 | N/A |\n| Texas | $500,000 | N/A |\n| New York | $500,000 | 100 transactions |\n| Florida | $100,000 | 200 transactions |\n| All others (post-Wayfair) | $100,000 | 200 transactions (most states) |\n\n### EU VAT\n1. Determine transaction type: B2B or B2C; domestic, intra-EU, or export\n2. **B2B Intra-EU**: Apply reverse charge mechanism — VAT rate = 0%; buyer self-assesses\n   - Validate buyer's EU VAT number via VIES\n   - Invoice must state "Reverse Charge" and buyer's VAT number\n3. **B2C EU (OSS Threshold exceeded)**: Apply destination country VAT rate\n4. **Domestic**: Apply seller's country standard/reduced VAT rate by product category\n5. **Export outside EU**: Zero-rated (VAT = 0%)\n\n**Standard VAT Rates (key markets)**:\n| Country | Standard Rate | Reduced Rate | Digital Services |\n|---|---|---|---|\n| Germany | 19% | 7% | 19% |\n| France | 20% | 5.5%/10% | 20% |\n| UK (post-Brexit) | 20% | 5% | 20% |\n| Netherlands | 21% | 9% | 21% |\n\n### India GST\n1. Determine if inter-state (IGST) or intra-state (CGST + SGST) supply\n2. Look up HSN/SAC code for product/service\n3. Apply applicable GST rate slab: 0%, 5%, 12%, 18%, or 28%\n4. For inter-state: IGST = full rate\n5. For intra-state: CGST = rate/2; SGST = rate/2\n6. Generate invoice with mandatory GST fields for e-invoicing compliance (IRP portal)\n\n### Latin America E-Invoicing\n- **Mexico (CFDI)**: Generate CFDI 4.0 XML; register via PAC (authorized provider)\n- **Brazil (NF-e)**: Generate NF-e XML; validate via SEFAZ state portal\n- **Colombia**: CUFE generation; DIAN validation\n- **Chile**: Folio assignment; SII validation\n\n## Exemption Certificate Validation\n\n| Certificate Type | Required Fields | Expiry Check | Product Match |\n|---|---|---|---|\n| Resale Certificate | State issuer, buyer ID, resale declaration | Yes | Yes |\n| Government/Nonprofit | Exemption number, organization type | Yes | Yes |\n| Manufacturing Exemption | MFG activity certification | Yes | Yes (direct use) |\n| Direct Pay Permit | Permit number, issuing state | Yes | N/A |\n\n**Validation Steps**:\n1. Verify certificate is on file for customer in exemption certificate repository\n2. Confirm certificate covers ship-to state\n3. Check expiry date — reject if expired; flag for renewal if <60 days to expiry\n4. Confirm product category matches stated exemption purpose\n5. If invalid/missing: apply tax; generate exemption renewal request\n\n## Fallback Behavior (Tax Engine Down)\nWhen primary tax engine (MCP) is unavailable:\n1. Apply default tax rates from KB tax rate tables\n2. Flag all invoices generated during downtime with "TAX_RECONCILIATION_REQUIRED" status\n3. Queue for tax recalculation once engine restored\n4. Do NOT apply zero tax as default — apply known state base rate minimum\n5. Alert Tax Compliance team of potential under/over-collection during downtime period`,
  },
  {
    organizationId: ORG,
    name: "Cash Application Skill",
    description: "AI-powered matching engine that automatically applies incoming payments to open AR invoices using remittance advice data, payment references, and pattern recognition. Handles perfect remittance matches, partial payments, overpayments, unidentified payments, and batch lockbox processing. Uses configurable confidence scoring to determine auto-apply vs. manual review thresholds. Processes multiple payment types: ACH/wire transfers, check payments, credit card payments, and EDI 820 remittance. Generates cash application records, posts to the general ledger, and maintains complete audit trail for SOX compliance.",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Invoice Generation Skill"],
    tags: ["cash-application", "payment-matching", "remittance-processing", "AR-posting", "lockbox", "EDI-820", "SOX", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "ingest_remittance_advice", "match_payment_to_invoice", "score_match_confidence", "auto_apply_payment", "queue_for_manual_review", "handle_partial_payment", "handle_overpayment", "post_to_gl", "generate_cash_application_record"],
    requiredMcpServers: ["banking-integration-mcp", "ar-system-mcp", "gl-system-mcp", "remittance-parser-mcp"],
    requiredDataClassifications: ["payment_data", "remittance_data", "ar_data", "banking_data", "pci_dss_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["cash application matching rules", "confidence score thresholds", "lockbox processing procedures", "partial payment handling rules", "overpayment resolution procedures", "EDI 820 remittance processing"],
    yamlFrontmatter: `name: Cash Application Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\npayment_types: [ACH, wire, check, credit_card, EDI_820]\nmatch_types: [exact_invoice, partial_payment, batch_remittance, unidentified]\nauto_apply_confidence_threshold: 0.92\nmanual_review_threshold: 0.70\npci_dss_compliant: true`,
    markdownBody: `# Cash Application Skill\n\n## Purpose\nAutomates the process of matching incoming payments to open AR invoices, reducing manual cash application effort, accelerating cash posting, and improving AR accuracy. Maintains SOX-compliant audit trails for all payment application decisions.\n\n## Matching Algorithm\n\n### Priority Hierarchy for Payment Matching\n1. **Exact Invoice Number Match** (Confidence: 0.98-1.00)\n   - Remittance contains exact invoice number(s)\n   - Payment amount = sum of referenced invoices ± tolerance\n   - Auto-apply if confidence ≥ 0.92\n\n2. **PO Number Match** (Confidence: 0.88-0.96)\n   - Remittance references customer PO number\n   - Match open invoices with that PO reference\n   - Multiple invoices possible; validate total amount match\n\n3. **Oldest Invoice First (FIFO)** (Confidence: 0.75-0.85)\n   - No invoice reference in remittance\n   - Apply payment to oldest open invoices first\n   - Only auto-apply for single-invoice customers or when amount matches single invoice exactly\n\n4. **Pattern Recognition** (Confidence: 0.70-0.90)\n   - Machine learning model trained on customer's payment history\n   - Identifies recurring payment patterns (e.g., always pays invoices 45 days old)\n   - Confidence depends on historical accuracy for that customer\n\n5. **Manual Review Queue** (Confidence: <0.70 or exceptions)\n   - Unidentified payments\n   - Confidence below auto-apply threshold\n   - Payment amount doesn't reconcile to open invoices\n\n## Payment Scenario Handling\n\n### Perfect Match (Auto-Apply)\n- Invoice number in remittance; amount matches exactly\n- Post payment; update invoice status to PAID; post to GL\n- Generate cash application record; send remittance confirmation to customer\n\n### Partial Payment\n**Underpayment**: Payment < invoice amount\n1. Check if customer has short-pay history (dispute pattern)\n2. If difference ≤ $10 or ≤ 0.5%: apply as full settlement; write off difference\n3. If difference is exact early-pay discount amount (e.g., 2/10 net 30): apply if within discount period\n4. Otherwise: apply payment as partial; leave balance open; generate short-pay notice\n5. If customer has dispute history: flag for Dispute Investigation Skill\n\n**Overpayment**: Payment > invoice amount\n1. Apply to oldest open invoices\n2. If credit balance remains: create unapplied credit record\n3. Notify customer within 5 business days of credit balance\n4. Offer: apply to future invoices OR refund\n5. If refund requested: route to AP for check/ACH issuance within 30 days\n\n### Batch Remittance (EDI 820 / Lockbox)\n1. Parse remittance detail records (all invoice references and amounts)\n2. Validate sum of detail lines = payment total\n3. Match each detail line to open invoice\n4. Apply all matches; flag unmatched detail lines for review\n5. Post all auto-matched payments in single GL batch\n\n### Unidentified Remittances\n1. Place in unidentified payment suspense account\n2. Initiate customer outreach within 2 business days\n3. Escalation path if unresolved after 30 days (write-off authority table)\n4. Document all investigation steps for audit trail\n\n## Confidence Score Factors\n| Factor | Weight | High Confidence Indicator |\n|---|---|---|\n| Invoice number presence | 35% | Exact match to open invoice |\n| Amount match | 30% | Amount = invoice total ± tolerance |\n| Payment reference match | 15% | PO or order number match |\n| Historical payment pattern | 15% | Matches prior payment behavior |\n| Remittance completeness | 5% | All required fields present |\n\n## GL Posting Requirements (SOX)\n- Every payment application generates an immutable audit record\n- Record includes: payment ID, invoice(s) applied to, amounts, date/time, user/system ID, confidence score\n- Batch postings logged as single GL batch with individual line detail\n- Reversals require supervisor approval + reason code + linked to original posting`,
  },
  {
    organizationId: ORG,
    name: "Dunning Management Skill",
    description: "Manages configurable dunning sequences for overdue invoices, including automated reminder generation, escalation scheduling, customer communication orchestration, and external collections hand-off procedures. Supports multiple dunning tracks (standard, VIP, high-risk, disputed) with different timing, tone, and escalation paths. Monitors payment due dates, calculates aging buckets, and triggers dunning actions at configured intervals. Tracks all dunning communications, customer responses, and payment commitments. Pauses dunning automatically when a dispute is filed. Escalates to third-party collection agencies or legal action at defined thresholds.",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Cash Application Skill"],
    tags: ["dunning", "collections", "overdue-invoice", "payment-reminder", "escalation", "AR-aging", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "calculate_ar_aging", "determine_dunning_track", "generate_dunning_communication", "send_dunning_notice", "record_payment_commitment", "pause_dunning_for_dispute", "escalate_to_collections", "log_dunning_activity"],
    requiredMcpServers: ["ar-system-mcp", "crm-mcp", "communication-platform-mcp", "collections-agency-mcp"],
    requiredDataClassifications: ["ar_data", "customer_data", "communication_logs", "payment_history"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["dunning letter templates by severity", "dunning track assignment rules", "collection escalation thresholds", "payment commitment procedures", "FDCPA compliance requirements"],
    yamlFrontmatter: `name: Dunning Management Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\ndunning_tracks: [standard, VIP, high_risk, disputed]\naging_buckets: [current, 1_30, 31_60, 61_90, 91_120, 120_plus]\nauto_pause_on_dispute: true\ncollections_threshold_days: 90\nlegal_threshold_days: 120`,
    markdownBody: `# Dunning Management Skill\n\n## Purpose\nAutomates the entire collections communication lifecycle from first payment reminder through external collections hand-off. Ensures consistent, compliant outreach while adapting messaging tone and urgency to customer relationship tier and aging bucket.\n\n## Dunning Track Assignment\n\n| Track | Customer Criteria | Tone | Escalation Speed |\n|---|---|---|---|\n| VIP | Revenue >$1M/year or Strategic Account designation | Consultative; Account Manager involvement | Slower; relationship-first |\n| Standard | General B2B/B2C | Professional; firm | Standard timeline |\n| High-Risk | Credit hold flag or prior collections history | Firm; early escalation | Accelerated |\n| Disputed | Open billing dispute on account | Paused until resolution | N/A (paused) |\n\n## Standard Dunning Sequence\n\n| Level | Days Past Due | Action | Channel | Tone |\n|---|---|---|---|---|\n| Level 0 | Invoice sent (T+0) | Invoice delivery | Email / EDI / Portal | Informational |\n| Level 1 | T+3 days before due | Friendly reminder | Email | Friendly |\n| Level 2 | T+7 days past due | First overdue notice | Email | Polite, urgent |\n| Level 3 | T+21 days past due | Second overdue notice | Email + Phone | Firm |\n| Level 4 | T+45 days past due | Final notice — collections warning | Email + Phone + Letter | Very firm |\n| Level 5 | T+60 days past due | Collections hand-off notification | Certified letter | Formal |\n| Level 6 | T+90 days past due | External collections agency hand-off | Agency referral | External |\n| Level 7 | T+120 days past due | Legal review / write-off consideration | Legal/CFO escalation | Legal |\n\n## VIP Dunning Sequence (Modified)\n| Level | Days Past Due | Action |\n|---|---|---|\n| Level 1 | T+10 days before due | Personalized reminder from Account Manager |\n| Level 2 | T+14 days past due | Account Manager personal call |\n| Level 3 | T+30 days past due | Senior AR Manager + Account Manager joint outreach |\n| Level 4 | T+60 days past due | CFO/VP level escalation discussion |\n| Level 5 | T+90 days past due | Collections evaluation with relationship preservation protocol |\n\n## Dunning Communication Rules\n\n### Automatic Pause Conditions\n- Open billing dispute exists on the invoice → track paused until dispute resolved\n- Payment commitment recorded from customer → dunning paused for commitment period + 5 days\n- Account is under legal proceedings → all automated dunning halted; legal team manages\n- Account in bankruptcy/insolvency → immediate halt; route to legal\n\n### Payment Commitment Tracking\n1. Customer provides verbal or written promise to pay by specific date\n2. Record commitment: amount, date, contact who committed, channel\n3. Pause dunning until commitment date + 5 business days\n4. If payment received: close dunning sequence\n5. If promise broken: resume dunning at next level; flag account as "broken promise"\n6. Two broken promises → escalate to High-Risk track immediately\n\n## Collections Escalation Path\n\n### Internal Escalation (61-90 days)\n- AR Manager reviews account\n- Evaluate credit hold: block new orders until overdue balance resolved\n- Negotiate payment plan if customer demonstrates hardship\n- Payment plan terms: maximum 6 months; requires VP Finance approval for >$50K\n\n### External Collections (90+ days)\n- Transfer account file to approved collections agency\n- Cease all direct customer communication (FDCPA compliance)\n- Provide agency: invoice copies, proof of delivery, prior communication history\n- Track agency collections activity and remittance\n\n### Legal/Write-Off (120+ days)\n- Legal review: evaluate litigation economics vs. write-off\n- Write-off authority: <$5K (AR Manager); $5K-$50K (VP Finance); >$50K (CFO + Board notification)\n- Write-off creates bad debt expense entry; removes from AR\n\n## FDCPA Compliance (for Consumer Accounts)\n- Written notice of debt required within 5 days of first contact\n- 30-day dispute window after initial notice\n- No contact before 8 AM or after 9 PM\n- No contact at workplace if customer requests\n- Cease and desist requests must be honored immediately`,
  },
  {
    organizationId: ORG,
    name: "Dispute Investigation Skill",
    description: "Manages the complete billing dispute lifecycle from capture through resolution. Categorizes disputes by type (pricing error, quantity discrepancy, quality/returns, duplicate billing, tax error, freight charge), performs automated root cause analysis by cross-referencing invoice data against source documents (PO, contract, delivery confirmation, credit memo), determines appropriate resolution (credit memo, revised invoice, write-off, dispute rejection), and escalates disputes requiring manual investigation. Tracks dispute aging, resolution rates, and root cause patterns to support continuous improvement of billing accuracy. Ensures all dispute resolutions meet customer SLAs and internal authorization thresholds.",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Invoice Generation Skill", "Cash Application Skill"],
    tags: ["dispute-management", "billing-dispute", "root-cause-analysis", "credit-memo", "dispute-resolution", "deduction-management", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "capture_dispute", "classify_dispute_type", "fetch_source_documents", "cross_reference_invoice", "analyze_root_cause", "determine_resolution", "issue_credit_memo", "reject_dispute_with_documentation", "escalate_dispute", "track_dispute_aging"],
    requiredMcpServers: ["ar-system-mcp", "order-management-mcp", "contract-management-mcp", "billing-system-mcp", "crm-mcp"],
    requiredDataClassifications: ["ar_data", "order_data", "contract_data", "customer_data", "dispute_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["billing dispute classification rules", "dispute root cause decision tree", "credit memo authorization thresholds", "dispute resolution procedures by type", "deduction management policies"],
    yamlFrontmatter: `name: Dispute Investigation Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\ndispute_types: [pricing_error, quantity_discrepancy, quality_return, duplicate_billing, tax_error, freight_charge, contract_mismatch]\nresolution_types: [credit_memo, revised_invoice, dispute_rejected, write_off, payment_plan]\nauto_resolve_threshold_usd: 500\nescalation_threshold_usd: 10000`,
    markdownBody: `# Dispute Investigation Skill\n\n## Purpose\nProvides systematic, evidence-based resolution of billing disputes. Replaces manual investigation with automated cross-referencing of source documents, reducing dispute resolution time and improving accuracy of credit memo issuance.\n\n## Dispute Classification\n\n| Dispute Type | Description | Common Root Cause | Typical Resolution |\n|---|---|---|---|\n| Pricing Error | Invoice price ≠ PO or contract price | Contract not updated in billing system; manual pricing error | Credit memo for price difference |\n| Quantity Discrepancy | Invoiced qty > delivered qty | WMS/billing sync issue; short-ship not reflected | Credit memo for undelivered qty |\n| Quality/Return | Customer claims defective goods; requests credit | Shipping damage; product defect | Credit memo after return receipt |\n| Duplicate Billing | Same shipment invoiced twice | System error; manual rebilling | Cancel duplicate; credit memo |\n| Tax Error | Incorrect tax applied | Missing exemption cert; wrong jurisdiction | Credit memo for tax overcollection |\n| Freight Charge | Disputed freight charge | Verbal freight waiver not documented | Investigate; credit if waiver confirmed |\n| Contract Mismatch | Invoice terms differ from contract | Contract version mismatch in billing system | Revised invoice per contract |\n\n## Investigation Process\n\n### Step 1 — Dispute Capture and Categorization\n1. Receive dispute via: customer portal, email, EDI 812 transaction, phone\n2. Extract: dispute amount, invoice reference, stated reason, customer contact\n3. Classify dispute type (see table above)\n4. Assign priority: High (>$10K or VIP customer); Medium ($1K-$10K); Low (<$1K)\n5. Set SLA clock: High (2 business days); Medium (5 business days); Low (10 business days)\n\n### Step 2 — Automated Root Cause Analysis\n\n**For Pricing Disputes**:\n1. Retrieve contract pricing effective on invoice date for each disputed line item\n2. Compare invoice unit price vs. contract price\n3. If mismatch confirmed: classify as "Billing Error — Pricing"\n4. Calculate credit memo amount: (invoice price - contract price) × qty\n\n**For Quantity Disputes**:\n1. Retrieve delivery confirmation from OTC-AGT-005 for the invoice's shipment\n2. Compare invoiced qty vs. confirmed delivered qty by line item\n3. If invoiced > delivered: billing error confirmed\n4. Calculate credit: (invoiced qty - delivered qty) × unit price\n\n**For Duplicate Billing**:\n1. Search AR system for all invoices with same order ID / PO reference / delivery date\n2. If exact duplicate found: flag as duplicate; prepare cancellation of later-dated invoice\n3. Apply credits or reverse payment applications as needed\n\n**For Tax Disputes**:\n1. Invoke Tax Calculation Skill to recompute tax on disputed invoice\n2. Compare recalculated tax vs. billed tax\n3. Validate customer exemption certificate status on invoice date\n4. If overcharged: credit memo for tax difference\n\n### Step 3 — Resolution Determination\n\n| Finding | Auto-Resolve? | Action |\n|---|---|---|\n| Billing error confirmed, amount ≤$500 | Yes | Issue credit memo automatically |\n| Billing error confirmed, $500-$10K | No | AR Manager approval required |\n| Billing error confirmed, >$10K | No | VP Finance + review required |\n| Dispute rejected (no error found) | Yes | Send rejection with supporting documentation |\n| Insufficient evidence | No | Request additional documentation from customer |\n| Fraud suspected | No | Escalate to Finance Compliance immediately |\n\n### Step 4 — Documentation and Close\n- All dispute records retained 7 years (SOX requirement)\n- Root cause tagged for trend analysis\n- If systemic root cause identified (e.g., recurring pricing error pattern): trigger process improvement alert\n- Customer notified of resolution outcome within SLA\n\n## Dispute Trend Analysis\n- Weekly report: dispute volume by type, average resolution time, auto-resolve rate\n- Identify top 5 root causes by dollar value each month\n- Flag customers with dispute frequency >10% of invoices for account review\n- Track billing accuracy rate: (invoices without disputes / total invoices) × 100`,
  },
  {
    organizationId: ORG,
    name: "AR Reporting Skill",
    description: "Generates comprehensive accounts receivable analytics including AR aging reports, Days Sales Outstanding (DSO) analysis, collection effectiveness index (CEI), cash flow forecasts, and dunning effectiveness metrics. Produces executive-level dashboards and operational AR reports on configurable schedules. Supports period-end close reporting requirements with AR balance reconciliation to general ledger. Calculates bad debt reserve recommendations based on aging distribution and historical write-off rates. Provides customer-level AR analysis for credit review and collection prioritization. Exports reports in multiple formats for ERP integration and executive presentation.",
    industry: "order_to_cash",
    domain: "billing-collections",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "MEDIUM",
    dependencies: ["Cash Application Skill", "Dunning Management Skill"],
    tags: ["AR-reporting", "DSO", "AR-aging", "collection-effectiveness", "cash-forecast", "bad-debt-reserve", "OTC-AGT-006"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "calculate_ar_aging", "calculate_dso", "calculate_cei", "generate_cash_forecast", "calculate_bad_debt_reserve", "reconcile_ar_to_gl", "generate_report", "export_report", "schedule_distribution"],
    requiredMcpServers: ["ar-system-mcp", "gl-system-mcp", "analytics-platform-mcp", "reporting-mcp"],
    requiredDataClassifications: ["ar_data", "payment_data", "gl_data", "customer_data", "financial_analytics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["AR aging bucket definitions", "DSO calculation methodology", "collection effectiveness index formula", "bad debt reserve calculation methods", "AR to GL reconciliation procedures", "cash flow forecasting from AR"],
    yamlFrontmatter: `name: AR Reporting Skill\nversion: "1.0"\nagent_code: OTC-AGT-006\ndomain: billing-collections\nindustry: order_to_cash\ntrust_tier: MEDIUM\ncontext_mode: rag\nreport_types: [ar_aging, dso_trend, cei, cash_forecast, bad_debt_reserve, dispute_summary, dunning_effectiveness]\nreport_frequencies: [daily, weekly, monthly, quarterly]\nformat_outputs: [PDF, Excel, CSV, dashboard_widget, ERP_integration]\nperiod_end_close: true`,
    markdownBody: `# AR Reporting Skill\n\n## Purpose\nProvides complete AR visibility to Finance leadership, AR operations teams, and executive stakeholders. Automates period-end reporting, operational dashboards, and predictive cash flow analysis.\n\n## Core Reports\n\n### 1. AR Aging Report\n**Buckets**: Current | 1-30 days | 31-60 days | 61-90 days | 91-120 days | 120+ days\n**Produced**: Daily (operational); Monthly (executive)\n**Fields per customer**:\n- Customer name, account number, credit limit, credit available\n- Balance in each aging bucket\n- Total AR balance\n- Oldest invoice date and amount\n- Dunning level and next action date\n- Payment commitment (if any)\n\n**Sorting Options**: By total balance (default), by 90+ days, by customer, by collector\n\n### 2. Days Sales Outstanding (DSO)\n**Formula**: \`(Ending AR Balance / Total Credit Sales in Period) × Days in Period\`\n\n**Best-Possible DSO (BPDSO)**:\n\`(Current + Not Yet Due AR / Total Credit Sales) × Days in Period\`\n\n**Delinquent DSO = DSO - BPDSO** (measures collection efficiency beyond payment terms)\n\n**Targets**:\n| Customer Segment | Target DSO |\n|---|---|\n| Enterprise B2B (Net 30) | 35-38 days |\n| Mid-Market (Net 30) | 38-42 days |\n| Small Business (Net 30) | 40-45 days |\n| Consumer (Immediate/Net 15) | 15-20 days |\n\n### 3. Collection Effectiveness Index (CEI)\n**Formula**: \`[(Beginning AR + Credit Sales - Ending Total AR) / (Beginning AR + Credit Sales - Ending Current AR)] × 100\`\n\n- CEI of 100% = perfect collections (all collectable AR collected)\n- Benchmark target: ≥85% overall; ≥95% current AR segment\n\n### 4. Cash Flow Forecast from AR\n**Method**: Weighted probability by aging bucket and customer payment patterns\n\n| Aging Bucket | Base Collection Probability | Adjustment Factors |\n|---|---|---|\n| Current (not yet due) | 97% | Customer credit score; payment history |\n| 1-30 days | 93% | Dunning response rate |\n| 31-60 days | 82% | Dispute flag; payment commitment |\n| 61-90 days | 68% | Collections track; customer segment |\n| 91-120 days | 45% | Collections agency; legal status |\n| 120+ days | 22% | Write-off probability |\n\nOutput: Weekly 13-week rolling cash forecast by collection probability band\n\n### 5. Bad Debt Reserve Recommendation\n**Calculation Method**: Aging schedule method\n\n| Aging Bucket | Reserve % | Basis |\n|---|---|---|\n| Current | 0.5% | Historical loss rate |\n| 1-30 days | 1% | |\n| 31-60 days | 5% | |\n| 61-90 days | 15% | |\n| 91-120 days | 25% | |\n| 120+ days | 50% | |\n| In Collections | 75% | |\n| Legal/Litigation | 90% | |\n\nRecommended reserve = sum of (balance × reserve %) across all buckets\nCompare to current reserve balance; recommend adjustment if variance >10%\n\n### 6. Period-End AR Close Report\n- AR subledger to GL balance reconciliation\n- Unapplied cash report with aging\n- Credit memo and debit memo activity\n- Bad debt expense and reserve movement\n- Write-off activity with authorization documentation\n- New and resolved dispute summary\n- DSO and CEI vs. prior period and budget\n\n## Report Distribution\n- Daily AR Aging: AR Operations team + Collection Managers (automated email + portal)\n- Weekly DSO: Finance leadership + AR Director\n- Monthly Executive Summary: CFO + VP Finance + Board (if requested)\n- Period-End Close: Controller + External Auditors (as needed)`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 KB SOURCES  (Section 7.8)
// ══════════════════════════════════════════════════════════════════════════════

const KB_SOURCES = [
  {
    title: "Invoice Templates by Country, Customer Segment, and Billing Arrangement",
    tags: ["invoice-templates", "country-specific", "customer-segment", "billing-arrangements", "e-invoicing", "OTC-AGT-006"],
    metadata: { source: "Billing Operations Team", type: "invoice-reference", coverage: "global_invoice_templates", lastUpdated: "2024-01-01" },
    content: `# Invoice Templates by Country, Customer Segment, and Billing Arrangement\n\n## Template Naming Convention\n\`INV-TEMPLATE-[COUNTRY_CODE]-[SEGMENT]-[ARRANGEMENT]-[VERSION]\`\n\nExamples:\n- INV-TEMPLATE-US-B2B-STANDARD-V4\n- INV-TEMPLATE-DE-B2B-EDI-V2\n- INV-TEMPLATE-IN-B2B-GST-V3\n\n## US Invoice Templates\n\n### US Standard B2B Invoice\n**Required Fields**:\n- Seller: Legal name, address, EIN/Tax ID, DUNS number\n- Buyer: Legal name, billing address, ship-to address, tax ID (if tax exempt)\n- Invoice number, invoice date, payment due date\n- PO number (required), order number, contract reference\n- Line items: description, SKU, quantity, unit of measure, unit price, discount, extended amount\n- Subtotal, freight (if applicable), sales tax by jurisdiction, invoice total\n- Payment instructions: bank details, ACH routing, check payable to, online portal link\n- Payment terms (written: e.g., "Net 30 from invoice date")\n\n**Optional Fields**:\n- Project code, cost center (for B2B expense allocation)\n- Ship date, carrier, tracking number\n- Credit terms: "2/10 Net 30" calculation showing early pay discount amount\n\n### US B2C Invoice (Retail/Consumer)\n- Simplified format: customer name, billing address\n- Order summary with product descriptions, quantities, prices\n- Sales tax shown by line item or as lump sum\n- Payment method reference (last 4 digits of card; do NOT show full card number — PCI DSS)\n- Return policy reference and customer service contact\n\n## EU VAT Invoice (Germany, France, Netherlands, etc.)\n\n**Mandatory Legal Requirements** (EU VAT Directive):\n- Full name and address of taxable person (seller)\n- Buyer's name and address\n- Seller's VAT identification number\n- Sequential invoice number\n- Date of supply (delivery date) AND invoice date (if different)\n- Description of goods/services supplied\n- Quantity and unit price (net of VAT)\n- VAT rate applied and total VAT amount\n- Total amount payable (gross)\n- For reverse charge: "Reverse Charge" notation + buyer's VAT number\n- For exempt supply: reference to exemption provision\n\n**German Specific**: Steuernummer or USt-IdNr. required\n**French Specific**: SIRET number; mention légale for credit notes\n\n## India GST Invoice\n\n**Mandatory Fields** (CGST Rules, Rule 46):\n- GSTIN of supplier and recipient\n- HSN/SAC code for each line item\n- Tax invoice serial number (unique per financial year)\n- Date of issue\n- Name and address of recipient\n- Description of goods/services\n- Quantity, unit, taxable value\n- Rate of tax (CGST/SGST or IGST)\n- Amount of tax (CGST/SGST or IGST)\n- Total value of supply\n- Whether tax payable on reverse charge basis\n- E-way bill number (for goods movement >50km or >₹50,000)\n\n**E-Invoice (IRP) Requirement**: Mandatory for turnover >₹10 crore; generate IRN (Invoice Reference Number) via IRP portal; QR code on invoice.\n\n## Mexico CFDI 4.0 Invoice\n\n**Mandatory Fields**:\n- RFC (Registro Federal de Contribuyentes) of issuer and receiver\n- Fiscal regime of issuer\n- Purpose of CFDI (P01: acquisition of goods and services)\n- Place of issue (ZIP code)\n- Date and time of issue\n- Products/services: product key (ClaveProdServ), unit key, quantity, description, unit value\n- Tax breakdown: base, rate, amount for each applicable tax\n- UUID (Folio Fiscal) assigned by SAT after timbrado (digital sealing by PAC)\n\n## Billing Arrangement Types\n\n### Milestone-Based Billing\n- Invoice generated at completion of predefined project milestones\n- Milestone completion must be validated by customer before invoice generation\n- Invoice references milestone ID and deliverable description\n- Partial delivery invoicing: invoice for completed milestone only; remaining on separate future invoices\n\n### Subscription/Recurring Billing\n- Fixed monthly/quarterly/annual amount per contracted subscription\n- Auto-generated on billing cycle date; no delivery confirmation required\n- Usage-based component (if any): calculated from usage data for billing period\n- Pro-ration for mid-period starts/cancellations\n\n### Progress/Percentage-of-Completion\n- Invoices issued at agreed percentages of project total\n- E.g., 30% at contract execution, 40% at Phase 1 completion, 30% at final delivery\n- Requires project manager sign-off before invoice release\n\n### Retainer Billing\n- Fixed retainer amount invoiced at start of each period\n- Overage charges calculated and invoiced separately at period end\n- Credit for unused retainer per contract terms`,
  },
  {
    title: "Tax Rate Tables, Exemption Certificate Repository, and Nexus Documentation",
    tags: ["tax-rates", "sales-tax", "VAT", "exemption-certificates", "nexus", "tax-compliance", "OTC-AGT-006"],
    metadata: { source: "Tax Compliance Team", type: "tax-reference", coverage: "US_EU_India_LatAm", lastUpdated: "2024-01-01" },
    content: `# Tax Rate Tables, Exemption Certificate Repository, and Nexus Documentation\n\n## US Sales Tax — Key State Rates (2024)\n\n| State | State Rate | Avg Local | Max Combined | Notes |\n|---|---|---|---|---|\n| California | 7.25% | 1.57% | 10.75% | Highest state rate |\n| Texas | 6.25% | 1.94% | 8.25% | |\n| Florida | 6.00% | 1.02% | 7.50% | No local income tax |\n| New York | 4.00% | 4.52% | 8.875% | NYC 8.875% |\n| Illinois | 6.25% | 2.75% | 11.00% | Chicago 10.25% |\n| Washington | 6.50% | 2.75% | 10.40% | High rate |\n| Oregon | 0.00% | N/A | 0.00% | No sales tax |\n| Montana | 0.00% | N/A | 0.00% | No sales tax |\n| New Hampshire | 0.00% | N/A | 0.00% | No sales tax |\n| Delaware | 0.00% | N/A | 0.00% | No sales tax |\n\n**Note**: Always use real-time tax engine lookup — rates change frequently. These tables are for reference and fallback only.\n\n## EU VAT Rates (2024)\n\n| Country | Standard | Reduced | Super-Reduced | Zero |\n|---|---|---|---|---|\n| Germany | 19% | 7% | N/A | 0% |\n| France | 20% | 5.5% / 10% | 2.1% | 0% |\n| Italy | 22% | 10% / 5% | 4% | 0% |\n| Spain | 21% | 10% | 4% | 0% |\n| Netherlands | 21% | 9% | N/A | 0% |\n| Poland | 23% | 8% / 5% | N/A | 0% |\n| Sweden | 25% | 12% / 6% | N/A | 0% |\n| UK (post-Brexit) | 20% | 5% | N/A | 0% |\n| Ireland | 23% | 13.5% / 9% | 4.8% | 0% |\n\n## India GST Rate Slabs (2024)\n\n| GST Slab | Examples |\n|---|---|\n| 0% (Exempt) | Fresh vegetables, grains, milk, medical services, education |\n| 5% | Essential goods: tea, coffee, edible oils, domestic LPG, economy hotel rooms |\n| 12% | Processed food, computers, business hotels, work contracts |\n| 18% | Most goods/services: IT services, telecom, financial services, restaurants |\n| 28% | Luxury/sin goods: automobiles, ACs, tobacco, aerated drinks, casinos |\n\n**HSN Code Examples**:\n- 8471: Computers and related goods → 18%\n- 8517: Mobile phones → 12% (handsets); accessories 18%\n- 2106: Food preparations → 18% (branded) / 0% (unbranded)\n\n## Exemption Certificate Types and Validation Requirements\n\n### Resale Certificate\n- **Purpose**: Customer purchases for resale, not for own use\n- **Required Information**: State-specific form (e.g., Form ST-120 NY; Form ST-4 MA); buyer's sales tax permit number; buyer's business name; signature\n- **Validation**: Permit number active in state database; goods match buyer's business description\n- **Renewal**: Annually or upon expiry; blanket certificates valid until revoked\n\n### Manufacturing/Industrial Processing Exemption\n- **Purpose**: Equipment and supplies used directly in manufacturing process\n- **Required**: Manufacturer's exemption certificate; description of manufacturing activity; list of equipment/supplies covered\n- **Validation**: Customer must be registered manufacturer (NAICS codes 31-33); equipment must have direct production link\n- **Common States**: TX, CA, PA, OH, MI (major manufacturing states)\n\n### Government/Nonprofit Exemption\n- **Purpose**: Government entities and qualified nonprofits exempt from sales tax\n- **Required**: Government purchase order (sufficient in many states); nonprofit's exemption certificate with IRS determination letter\n- **Validation**: EIN match; organization type verification; expiry check\n\n### Agricultural Exemption\n- **Purpose**: Items used directly in agricultural production\n- **Required**: Agricultural exemption certificate; farm identification\n- **Validation**: Customer has active farm designation; items used for qualified agricultural purposes\n\n## Nexus Documentation\n\n### Physical Nexus Triggers\n- Office, warehouse, or distribution center in state\n- Sales employees or agents operating in state\n- Inventory stored in state (FBA/3PL)\n- Tradeshows or temporary sales presence (state-specific rules)\n\n### Economic Nexus Thresholds\nPost-South Dakota v. Wayfair (2018): virtually all states require collection above threshold:\n- **Standard threshold**: $100,000 in sales OR 200 transactions in 12 months\n- **California**: $500,000 (sales only; no transaction count)\n- **Texas**: $500,000 (sales only)\n- **Kansas**: No threshold (collect on first dollar)\n\n### Nexus Register Maintenance\n- Maintain nexus register: state, nexus type, trigger date, registration date, permit number\n- Review nexus positions quarterly as sales into new states may cross thresholds\n- New nexus: register within 30-60 days of threshold breach (varies by state)\n- Historic nexus (VDA — Voluntary Disclosure Agreement): engage prior to registering to limit lookback period`,
  },
  {
    title: "Payment Terms Library — Net 30, 2/10 Net 30, Milestone-Based, and Subscription Terms",
    tags: ["payment-terms", "net-30", "early-pay-discount", "milestone-billing", "subscription-billing", "credit-terms", "OTC-AGT-006"],
    metadata: { source: "Finance and Credit Team", type: "payment-terms-reference", coverage: "all_billing_arrangements", lastUpdated: "2024-01-01" },
    content: `# Payment Terms Library — Net 30, 2/10 Net 30, Milestone-Based, and Subscription Terms\n\n## Standard Payment Terms Codes\n\n| Code | Description | Due Date Calculation | Early Pay Discount |\n|---|---|---|---|\n| NET30 | Net 30 days from invoice date | Invoice date + 30 calendar days | None |\n| NET60 | Net 60 days from invoice date | Invoice date + 60 calendar days | None |\n| NET45 | Net 45 days from invoice date | Invoice date + 45 calendar days | None |\n| 2_10_NET30 | 2% discount if paid within 10 days; net 30 | Discount: Invoice date + 10 days; Full: + 30 days | 2% if paid ≤10 days |\n| 1_10_NET30 | 1% discount if paid within 10 days; net 30 | Discount: + 10 days; Full: + 30 days | 1% if paid ≤10 days |\n| COD | Cash on delivery | Upon delivery | None |\n| CIA | Cash in advance | Before shipment | None |\n| EOM | End of month | Last day of month invoice was issued | None |\n| MFI | Month following invoice | Last day of month following invoice month | None |\n| IMMEDIATE | Due on receipt | Invoice date | None |\n\n## Early Payment Discount Calculation\n\n### 2/10 Net 30 Example\n- Invoice Amount: $10,000.00\n- Invoice Date: March 1, 2024\n- Discount Deadline: March 11, 2024 (10 days)\n- Full Payment Deadline: March 31, 2024 (30 days)\n- Discount Amount: $10,000 × 2% = $200.00\n- Discounted Payment: $9,800.00\n\n**Cash Application Rule**: If payment received by discount deadline ± 1 business day grace:\n- Accept discounted amount as payment in full\n- Post $200 discount to "Sales Discount" GL account\n- Do NOT treat as short payment\n\n**Annualized Rate of Discount**: (2% / 20 days) × 365 = **36.5% APR**\n- Economically significant: customers should take the discount\n- Company can offer to incentivize early cash flow\n\n## Milestone-Based Payment Terms\n\n### Fixed Milestone Schedule\nExample: $500,000 software implementation contract\n| Milestone | % of Contract | Amount | Trigger Event |\n|---|---|---|---|\n| Contract Execution | 20% | $100,000 | Signed contract received |\n| Requirements Completion | 15% | $75,000 | Requirements sign-off |\n| Development Phase 1 Complete | 20% | $100,000 | Customer acceptance of Phase 1 |\n| UAT Completion | 25% | $125,000 | UAT sign-off received |\n| Go-Live | 15% | $75,000 | Production go-live confirmed |\n| 30-Day Post Go-Live | 5% | $25,000 | 30 days after go-live; no critical issues |\n\n**Invoice Trigger**: Invoice generated automatically when milestone completion event received from project management system; due 30 days from invoice date.\n\n## Subscription Billing Terms\n\n### Annual Subscription (Paid Monthly)\n- Monthly invoice on same calendar day as contract start date\n- Amount: (Annual contract value / 12) rounded to nearest cent\n- Auto-renew: invoice generated 30 days before renewal date with renewal notice\n- Cancellation: final invoice covers through end of current paid period; no refund for unused portion (per contract)\n\n### Usage-Based Component\n- Base fee: fixed monthly amount invoiced on billing cycle date\n- Usage component: calculated at end of billing period from usage data\n- Combined on single invoice: base fee + overage/usage charges\n- Usage tiers example:\n  - 0-1,000 API calls: $0 (included in base)\n  - 1,001-10,000 calls: $0.01 per call\n  - 10,001-100,000 calls: $0.008 per call\n  - 100,001+ calls: $0.005 per call\n\n## Credit and Payment Policy\n\n### Credit Limit Setting\n| Customer Annual Revenue | Typical Credit Limit | Review Frequency |\n|---|---|---|\n| <$100K | $10,000-$25,000 | Annually |\n| $100K-$1M | $25,000-$100,000 | Annually |\n| $1M-$10M | $100,000-$500,000 | Semi-annually |\n| >$10M | Custom; CFO approval | Quarterly |\n\n### Credit Hold Policy\n- Invoice overdue by >30 days AND amount >$5,000: automatic credit hold\n- All new orders blocked until overdue balance resolved\n- AR Manager can authorize temporary release for critical orders\n- Credit hold notification sent to customer at time of hold placement\n\n### Payment Method Acceptance\n| Method | Processing Time | Fees | Notes |\n|---|---|---|---|\n| ACH/EFT | 2-3 business days | Minimal (<$1) | Preferred for B2B |\n| Wire Transfer | Same/Next day | $15-$35 bank fee | For large amounts >$50K |\n| Check | 3-5 days (mail + clear) | None | Lockbox processing |\n| Credit Card | Instant authorization | 2.5-3.5% | Surcharge may apply |\n| EDI 820 | Per ACH timing | Minimal | Auto-applied |\n| Online Portal | Per method selected | Varies | Customer self-service |`,
  },
  {
    title: "Dunning Letter Templates by Severity Level and Customer Relationship",
    tags: ["dunning-letters", "collection-letters", "payment-reminders", "escalation-communications", "FDCPA", "OTC-AGT-006"],
    metadata: { source: "AR Collections Team", type: "communication-templates", coverage: "all_dunning_levels", lastUpdated: "2024-01-01" },
    content: `# Dunning Letter Templates by Severity Level and Customer Relationship\n\n## Template Naming Convention\n\`DUNNIN-[LEVEL]-[SEGMENT]-[VERSION]\`\n\nExamples:\n- DUNNIN-L1-B2B-V2 (Level 1, Business, Version 2)\n- DUNNIN-L4-VIP-V1 (Level 4, VIP, Version 1)\n\n---\n\n## DUNNIN-L1-B2B-V2 — Friendly Reminder (3 days before due date)\n\n**Subject**: Payment Reminder — Invoice #[INV_NUMBER] Due [DUE_DATE]\n\n**Body**:\nDear [CONTACT_NAME],\n\nThis is a friendly reminder that Invoice #[INV_NUMBER] for $[AMOUNT] is due on [DUE_DATE].\n\nFor your convenience, you may pay online at [PAYMENT_PORTAL_URL] or via ACH to the bank details on the invoice.\n\nIf you have already sent payment, please disregard this notice.\n\nThank you for your continued business.\n\nBest regards,\n[AR_REPRESENTATIVE_NAME]\nAccounts Receivable | [COMPANY_NAME]\n[EMAIL] | [PHONE]\n\n---\n\n## DUNNIN-L2-B2B-V2 — First Overdue Notice (7 days past due)\n\n**Subject**: Past Due Notice — Invoice #[INV_NUMBER] — $[AMOUNT] Overdue\n\n**Body**:\nDear [CONTACT_NAME],\n\nOur records show that Invoice #[INV_NUMBER] for $[AMOUNT], due on [DUE_DATE], remains unpaid.\n\nPayment details:\n- Invoice Number: [INV_NUMBER]\n- Invoice Date: [INV_DATE]\n- Due Date: [DUE_DATE]\n- Amount Due: $[AMOUNT]\n- Days Overdue: [DAYS_PAST_DUE]\n\nPlease arrange payment at your earliest convenience. If there is an issue with this invoice, please contact us immediately so we can resolve it promptly.\n\nPayment may be made at: [PAYMENT_PORTAL_URL]\n\nIf you have already sent payment, please send us your remittance details so we can apply it to your account.\n\nSincerely,\n[AR_REPRESENTATIVE_NAME]\nAccounts Receivable | [COMPANY_NAME]\n\n---\n\n## DUNNIN-L3-B2B-V2 — Second Overdue Notice (21 days past due)\n\n**Subject**: URGENT: Overdue Invoice #[INV_NUMBER] — Immediate Attention Required\n\n**Body**:\nDear [CONTACT_NAME],\n\nDespite our previous notice, Invoice #[INV_NUMBER] for $[AMOUNT] remains outstanding. This invoice is now [DAYS_PAST_DUE] days past due.\n\n**Your total outstanding balance is $[TOTAL_AR_BALANCE]**.\n\nWe request immediate payment or contact within 5 business days to discuss payment arrangements. Failure to respond may result in:\n- Suspension of your account credit privileges\n- Placement on credit hold (new orders may be blocked)\n- Referral to our collections department\n\nTo pay online: [PAYMENT_PORTAL_URL]\nTo discuss payment arrangements: [COLLECTIONS_MANAGER_PHONE]\n\nIf there is a dispute regarding this invoice, please submit it via [DISPUTE_PORTAL_URL] within 5 business days.\n\nRegards,\n[COLLECTIONS_MANAGER_NAME]\nCollections Manager | [COMPANY_NAME]\n\n---\n\n## DUNNIN-L4-B2B-V2 — Final Notice (45 days past due)\n\n**Subject**: FINAL NOTICE — Invoice #[INV_NUMBER] — Collections Action Pending\n\n**Body**:\nDear [CONTACT_NAME],\n\nThis is our final notice regarding Invoice #[INV_NUMBER] totaling $[AMOUNT], now [DAYS_PAST_DUE] days overdue.\n\nYour total outstanding balance is: **$[TOTAL_AR_BALANCE]**\n\nIf we do not receive payment in full or a signed payment agreement within **10 business days** of this notice ([RESPONSE_DEADLINE]), your account will be referred to our external collections agency. At that point, additional fees and interest may be assessed as permitted by law and per your contract terms.\n\nThis action may also be reported to commercial credit bureaus, which may impact your company's creditworthiness.\n\nTo avoid collections referral, please:\n1. Pay in full at [PAYMENT_PORTAL_URL], OR\n2. Contact [COLLECTIONS_DIRECTOR_NAME] at [PHONE] to arrange a payment plan\n\n**This matter requires your immediate attention.**\n\n[COLLECTIONS_DIRECTOR_NAME]\nDirector, Collections | [COMPANY_NAME]\n\n---\n\n## DUNNIN-L1-VIP-V1 — VIP Friendly Reminder (10 days before due date)\n\n**Subject**: Upcoming Invoice for Your Review — #[INV_NUMBER]\n\n**Body**:\nDear [CONTACT_NAME],\n\nI wanted to bring your attention to Invoice #[INV_NUMBER] for $[AMOUNT], which will be due on [DUE_DATE]. If you have any questions about this invoice or would like to discuss payment arrangements, I am happy to assist.\n\nThank you for your continued partnership with [COMPANY_NAME].\n\nWarm regards,\n[ACCOUNT_MANAGER_NAME]\nAccount Manager | [COMPANY_NAME]\nDirect: [PHONE] | [EMAIL]\n\n---\n\n## FDCPA Compliance Notes (Consumer Accounts)\n- Must include "Mini-Miranda" on first written communication: "This is an attempt to collect a debt. Any information obtained will be used for that purpose."\n- Provide consumer's right to dispute within 30 days\n- Do NOT contact before 8 AM or after 9 PM local time\n- Honor cease and desist requests immediately\n- Do NOT make false or misleading representations\n- These rules apply to third-party collectors; direct creditor communications are generally exempt but best practice to comply`,
  },
  {
    title: "Dispute Resolution Procedures and Decision Trees",
    tags: ["dispute-resolution", "decision-trees", "root-cause-analysis", "credit-authorization", "dispute-procedures", "OTC-AGT-006"],
    metadata: { source: "AR Operations Team", type: "dispute-procedures", coverage: "all_dispute_types", lastUpdated: "2024-01-01" },
    content: `# Dispute Resolution Procedures and Decision Trees\n\n## Dispute Receipt and Classification\n\n### Incoming Dispute Channels\n1. **Customer Portal**: Structured dispute form; auto-classifies dispute type\n2. **Email**: AR inbox monitoring; AI classifies and creates dispute record\n3. **EDI 812 (Credit/Debit Adjustment)**: Auto-processed; creates dispute from EDI transaction\n4. **Phone**: AR rep creates dispute record; captures customer details\n5. **Deduction (Short Payment)**: Cash Application detects short pay; auto-creates dispute record with deduction amount\n\n### Classification Decision Tree\n\n\`\`\`\nDispute Received\n├── Has invoice reference? \n│   ├── YES → Look up invoice\n│   │   ├── Invoice exists?\n│   │   │   ├── YES → Classify dispute type:\n│   │   │   │   ├── Amount dispute (price or qty) → Pricing or Quantity dispute\n│   │   │   │   ├── Service quality issue → Quality/Return dispute\n│   │   │   │   ├── Same invoice received twice → Duplicate Billing dispute\n│   │   │   │   ├── Tax dispute → Tax Error dispute\n│   │   │   │   └── Freight/shipping charge → Freight Charge dispute\n│   │   │   └── NO → Create investigation ticket; request invoice details from customer\n│   └── NO → Request invoice number; classify as "Unidentified Dispute" pending info\n└── No invoice reference → Unidentified; request details within 2 business days\n\`\`\`\n\n## Pricing Dispute Resolution Procedure\n\n**Trigger**: Customer claims invoice price ≠ agreed price\n\n**Step 1 — Retrieve Contract**: Fetch current active contract for customer; locate pricing for disputed line item\n\n**Step 2 — Price Comparison**:\n- Invoice unit price vs. contract unit price\n- If mismatch: identify source (wrong contract version; manual override; promotional price not applied)\n- If no contract: compare to quote/proposal provided to customer\n\n**Step 3 — Determination**:\n| Outcome | Resolution |\n|---|---|\n| Invoice price > contract price | Billing error: issue credit memo for difference |\n| Invoice price = contract price | Dispute rejected: send documentation showing contract price match |\n| Contract ambiguous | Escalate to Sales/Contracts team for contract interpretation |\n| Customer citing incorrect/expired contract | Dispute rejected: send evidence of correct contract in effect |\n\n**Step 4 — Communication**: Notify customer of resolution within SLA; provide supporting documentation\n\n## Quantity Dispute Resolution Procedure\n\n**Trigger**: Customer claims they received fewer items than invoiced\n\n**Step 1 — Retrieve Proof of Delivery**: Request POD from carrier; verify delivered quantities per carrier\n\n**Step 2 — Check Delivery Confirmation**: Review OTC-AGT-005 delivery confirmation data; confirm quantities\n\n**Step 3 — Comparison**:\n- Carrier POD qty vs. invoiced qty vs. customer claimed qty\n- Discrepancy patterns: is this customer a repeat short-delivery claimer?\n\n**Step 4 — Determination**:\n| Evidence | Resolution |\n|---|---|\n| POD confirms short delivery | Credit memo for undelivered qty; carrier claim filed |\n| POD confirms full delivery, customer still disputes | Request customer's receiving documentation; conduct joint investigation |\n| POD unavailable | Escalate to Transportation team; provisionally credit while investigating |\n\n## Duplicate Billing Dispute Resolution\n\n**Trigger**: Customer claims they received two invoices for the same order/delivery\n\n**Step 1 — Search**: Query AR system for all invoices referencing same order ID, delivery ID, or PO number\n\n**Step 2 — Comparison**: Compare line items, quantities, dates between potentially duplicate invoices\n\n**Step 3 — Determination**:\n| Finding | Resolution |\n|---|---|\n| Exact duplicate confirmed | Cancel later-dated invoice; credit if already paid; notify customer |\n| Same order, different shipments | Validate against delivery records; both may be valid |\n| System error created duplicates | Cancel all but original; implement system fix; notify IT |\n\n## Dispute Authorization Matrix\n\n| Dispute Amount | Investigation Required | Authorization Level |\n|---|---|---|\n| ≤ $500 | Basic cross-reference only | Auto-approve if error confirmed |\n| $501 - $5,000 | Full investigation + documentation | AR Manager |\n| $5,001 - $25,000 | Full investigation + source documents | VP Finance |\n| > $25,000 | Full investigation + legal review | CFO |\n\n## Customer Satisfaction Recovery for Disputes\n- Resolved within SLA: standard thank-you communication\n- Resolved after SLA breach: apology + $[X] goodwill credit (AR Manager discretion)\n- Systemic errors affecting customer multiple times: account review; offer preventive measures\n- Escalated disputes resolved favorably for customer: personal call from Senior AR Manager`,
  },
  {
    title: "Cash Application Matching Rules and Confidence Thresholds",
    tags: ["cash-application", "matching-rules", "confidence-scoring", "payment-matching", "remittance-processing", "unapplied-cash", "OTC-AGT-006"],
    metadata: { source: "Treasury and AR Team", type: "cash-application-procedures", coverage: "all_payment_types", lastUpdated: "2024-01-01" },
    content: `# Cash Application Matching Rules and Confidence Thresholds\n\n## Matching Rule Priority Order\n\n### Rule 1 — Exact Invoice Match (Priority 1)\n**Trigger**: Remittance contains invoice number(s) that exist in AR system\n\n**Matching Logic**:\n\`\`\`\nIF remittance.invoiceNumbers ∩ open_AR_invoices ≠ empty\nAND |payment.amount - sum(matched_invoices.balance)| ≤ tolerance\nTHEN match_type = "exact_invoice"\n     confidence = 0.98\n     action = "auto_apply"\n\`\`\`\n\n**Tolerance Thresholds**:\n| Invoice Size | Absolute Tolerance | Percentage Tolerance |\n|---|---|---|\n| < $1,000 | $10 | 1.0% |\n| $1,000 - $10,000 | $25 | 0.5% |\n| $10,001 - $100,000 | $50 | 0.25% |\n| > $100,000 | $100 | 0.10% |\n\nIf payment within tolerance AND difference = standard early-pay discount (2% or 1%): accept as discounted settlement.\n\n### Rule 2 — PO Number Match (Priority 2)\n**Trigger**: Remittance contains PO reference matching open AR invoices\n\n**Matching Logic**:\n\`\`\`\nIF remittance.poNumber exists in open_AR_invoices\nTHEN invoices_for_po = AR.getInvoicesByPO(remittance.poNumber)\n     IF sum(invoices_for_po.balance) ≈ payment.amount (within tolerance)\n     THEN match_type = "po_match"\n          confidence = 0.88 to 0.94 (higher if single invoice)\n          action = "auto_apply" if confidence ≥ 0.92\n\`\`\`\n\n### Rule 3 — Customer + Amount Match (Priority 3)\n**Trigger**: Payment identified to customer; amount matches single open invoice\n\n\`\`\`\nIF customer identified from bank account/check\nAND single open invoice with balance = payment.amount (within tolerance)\nTHEN match_type = "customer_amount_match"\n     confidence = 0.85\n     action = "auto_apply" if confidence ≥ 0.92 (escalate to manual review otherwise)\n\`\`\`\n\n### Rule 4 — FIFO Application (Priority 4)\n**Trigger**: Customer identified; multiple open invoices; amount doesn't match single invoice\n\n\`\`\`\nIF customer identified\nAND no invoice or PO reference\nAND payment.amount does not match single invoice\nTHEN sort_invoices_by_date(ascending)\n     apply_to_oldest_first()\n     match_type = "FIFO"\n     confidence = 0.72\n     action = "queue_for_manual_review" (FIFO confidence below auto threshold)\n\`\`\`\n\n### Rule 5 — Pattern Recognition (Priority 5)\n**Trigger**: ML model detects known payment pattern for customer\n\n\`\`\`\nIF ml_model.predict(customer, payment) returns confidence > 0.80\nTHEN apply model recommendation\n     match_type = "ml_pattern"\n     confidence = ml_model.confidence_score\n     action = "auto_apply" if confidence ≥ 0.92\n\`\`\`\n\n## Confidence Score Thresholds and Actions\n\n| Confidence Range | Action | Description |\n|---|---|---|\n| 0.95 - 1.00 | Auto-apply | High certainty; no review needed |\n| 0.92 - 0.94 | Auto-apply with notification | Apply and notify AR team log |\n| 0.80 - 0.91 | Manual review — suggested match | Present suggested match to AR rep for 1-click approval |\n| 0.70 - 0.79 | Manual review — possible match | Present possible match; AR rep must confirm or override |\n| < 0.70 | Manual investigation | No suggested match; AR rep investigates from scratch |\n\n## Special Case Handling\n\n### Early Payment Discount Processing\n1. Calculate: is the difference = standard discount (2% or 1% of invoice)?\n2. Verify: is payment date within discount period (usually 10 days from invoice)?\n3. If both YES: apply as discounted settlement; post discount to Sales Discount account\n4. If discount period expired: short-pay; initiate collection for discount amount unless AR Manager waives\n\n### Multi-Currency Payments\n1. Convert payment amount to invoice currency at transaction date exchange rate\n2. Post exchange rate difference to FX Gain/Loss account\n3. Revaluation at period end: mark open AR balances at closing rate; post revaluation entries\n\n### Lockbox File Processing (Bank Lockbox)\n1. Receive daily lockbox file from bank (BAI2 or custom format)\n2. Parse each remittance record: check number, amount, payer name, detail stubs\n3. Match each item against open AR using priority rules above\n4. Auto-apply matched items; flag exceptions for manual review\n5. Generate lockbox posting report: total items, total matched, total pending review, total amount\n\n### Unidentified Payment Suspense\n- Payment cannot be matched to any customer or invoice\n- Post to suspense account: "Unidentified Cash Receipts"\n- Initiate investigation: compare payer name to customer master; contact payer's bank if needed\n- If identified within 30 days: apply to correct customer/invoice; reverse suspense entry\n- If unidentified after 90 days: escalate to Controller; may require legal/escheatment procedures\n\n## Reporting and Audit Requirements\n\n### Daily Cash Application Report\n- Total payments received (count and $)\n- Auto-applied (count and $)\n- Manual review queue (count and $)\n- Unidentified suspense (count and $)\n- Match rate % (auto-applied / total)\n\n### SOX Compliance Requirements\n- Every application generates immutable audit record (cannot be deleted; only reversed with approval)\n- Reversal requires supervisor approval, reason code, and links to original transaction\n- Access controls: cash application posting requires "AR Processor" role minimum\n- Segregation of duties: person posting cash ≠ person creating invoices ≠ person approving write-offs`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 RUNBOOKS  (Section 7.6)
// ══════════════════════════════════════════════════════════════════════════════

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Invoice Generation Failure — Retry Logic and Manual Invoice Creation Procedure",
    description: "Emergency procedure for handling invoice generation failures caused by missing source data, billing system errors, or integration outages. Covers retry logic, fallback to manual invoice creation, customer communication during delays, and reconciliation steps after system restoration.",
    industry: "order_to_cash",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "invoice_generation_error", source: "billing_system_mcp", threshold: "3_consecutive_failures" },
      { type: "event", event: "billing_system_api_timeout", source: "integration_monitor", threshold: "timeout_gt_30s" },
    ],
    steps: [
      { id: "1", type: "action", action: "identify_failure_type", label: "Identify failure type: missing delivery data, contract pricing unavailable, billing system error, tax engine error, document generation error", order: 1 },
      { id: "2", type: "action", action: "auto_retry", label: "Execute automatic retry: 3 attempts with 5-minute intervals; log each attempt with error details", order: 2 },
      { id: "3", type: "condition", condition: "retry_success", label: "Did automatic retry succeed?", trueNext: "4", falseNext: "5", order: 3 },
      { id: "4", type: "action", action: "resume_normal", label: "Invoice generated successfully after retry: log resolution; continue normal processing", order: 4 },
      { id: "5", type: "action", action: "notify_ar_team", label: "Notify AR Operations team via alert: specify affected orders/customers, failure type, estimated impact", order: 5 },
      { id: "6", type: "condition", condition: "invoice_urgency", label: "Is invoice urgent (customer-requested or large value >$50K)?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "manual_invoice_creation", label: "AR Manager creates manual invoice using billing template: pull order data from OMS, apply contract pricing, calculate tax manually per KB rate tables, generate PDF invoice", order: 7 },
      { id: "8", type: "action", action: "queue_for_recovery", label: "Queue non-urgent invoices for automated recovery once system issue resolved; set SLA clock", order: 8 },
      { id: "9", type: "action", action: "customer_communication", label: "If invoice due date at risk: notify customer of delay; provide estimated invoice delivery date; offer interim invoice acknowledgment letter", order: 9 },
      { id: "10", type: "action", action: "system_recovery_reconciliation", label: "Upon system restoration: process queued invoices; reconcile manually created invoices to ensure no duplicates; audit tax calculations on manual invoices", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["ar_manager", "billing_system_admin"], autoApproveAfterHours: 2 },
    estimatedDuration: "30 minutes to 8 hours (system issue dependent)",
    tags: ["invoice-failure", "billing-system", "manual-invoice", "emergency", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Mass Payment File Processing Error — Partial Processing, Error Isolation, and Resubmission",
    description: "Procedure for handling failures in batch payment file processing including lockbox files, ACH batch files, and EDI 820 remittance files. Covers partial processing of valid records, isolation and quarantine of error records, reconciliation with bank reports, and safe resubmission procedures to prevent duplicate cash application.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "batch_payment_file_error", source: "banking_integration_mcp", threshold: "error_count_gt_0" },
      { type: "threshold", metric: "batch_processing_failure_rate", operator: "gte", value: 10, source: "cash_application_monitoring" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_error_scope", label: "Assess error scope: identify number of failed records vs. total; determine if systemic (all records failed) or partial (subset failed)", order: 1 },
      { id: "2", type: "action", action: "isolate_error_records", label: "Extract and quarantine error records to separate error file; log each with error code and description", order: 2 },
      { id: "3", type: "action", action: "process_valid_records", label: "Process all valid records in the batch that passed validation; post to AR; generate partial application report", order: 3 },
      { id: "4", type: "action", action: "bank_reconciliation", label: "Reconcile processed amount against bank statement total: total file amount = processed + error records; document variance", order: 4 },
      { id: "5", type: "action", action: "investigate_errors", label: "Investigate error records: common causes — invalid invoice references, currency mismatches, duplicate payment IDs, format errors in remittance detail", order: 5 },
      { id: "6", type: "condition", condition: "errors_correctable", label: "Can error records be corrected and resubmitted?", trueNext: "7", falseNext: "9", order: 6 },
      { id: "7", type: "approval_gate", label: "AR Manager reviews corrected records before resubmission to prevent duplicate cash application", approvalLevel: "confirm_before", order: 7 },
      { id: "8", type: "action", action: "resubmit_corrected", label: "Resubmit corrected records as separate batch; flag all as 'resubmission of [original batch ID]' to audit trail; apply only to invoices not yet fully paid", order: 8 },
      { id: "9", type: "action", action: "manual_cash_application", label: "For uncorrectable records: route to manual cash application queue; AR rep investigates each and applies manually with full documentation", order: 9 },
      { id: "10", type: "action", action: "post_incident_report", label: "Generate post-incident report: root cause, records affected, financial impact, corrective actions, timeline; distribute to Finance Controller and Treasury", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["ar_manager", "treasury_manager"], autoApproveAfterHours: null },
    estimatedDuration: "2-24 hours (error volume dependent)",
    tags: ["batch-payment", "lockbox", "EDI-820", "cash-application-error", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Tax Engine Down — Default Tax Rate Application with Reconciliation Flag",
    description: "Procedure for continuing invoice generation when the primary tax calculation engine (MCP) is unavailable. Covers application of default tax rates from KB reference tables, mandatory reconciliation flagging, customer communication, and post-restoration reconciliation procedures to correct any over/under-collection.",
    industry: "order_to_cash",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "tax_engine_mcp_unavailable", source: "integration_monitor", threshold: "unavailable_gt_5min" },
      { type: "event", event: "tax_calculation_timeout", source: "billing_system", threshold: "consecutive_timeout_3" },
    ],
    steps: [
      { id: "1", type: "action", action: "confirm_tax_engine_down", label: "Confirm tax engine unavailability: attempt secondary ping; check vendor status page; contact tax engine support if outage unannounced", order: 1 },
      { id: "2", type: "action", action: "notify_tax_compliance", label: "Alert Tax Compliance Manager: tax engine unavailable, fallback mode active, estimated impact (invoices in queue)", order: 2 },
      { id: "3", type: "action", action: "assess_invoice_urgency", label: "Categorize queued invoices: urgent (customer-committed due dates within 24h) vs. deferrable", order: 3 },
      { id: "4", type: "condition", condition: "defer_possible", label: "Can invoice issuance be deferred until tax engine restored?", trueNext: "5", falseNext: "6", order: 4 },
      { id: "5", type: "action", action: "defer_and_monitor", label: "Defer non-urgent invoices; monitor tax engine status every 15 minutes; resume when restored", order: 5 },
      { id: "6", type: "action", action: "apply_fallback_tax_rates", label: "Apply fallback tax rates from KB tax rate tables: use state base rate (no local component for unknown localities); apply highest applicable rate to avoid under-collection; flag every invoice with TAX_RECONCILIATION_REQUIRED", order: 6 },
      { id: "7", type: "action", action: "document_fallback_invoices", label: "Maintain list of all invoices issued under fallback: invoice number, customer, amount, tax applied, correct jurisdiction for recalculation", order: 7 },
      { id: "8", type: "action", action: "issue_invoices_with_flag", label: "Issue urgent invoices with fallback tax; do NOT delay critical invoices; customer will receive corrected credit/debit memo if needed after reconciliation", order: 8 },
      { id: "9", type: "action", action: "tax_engine_restoration", label: "Upon tax engine restoration: reprocess all TAX_RECONCILIATION_REQUIRED invoices through live tax engine", order: 9 },
      { id: "10", type: "action", action: "reconciliation_and_correction", label: "Compare fallback tax vs. correct tax for each invoice: if difference >$1: issue credit memo (over-collected) or debit memo (under-collected); notify Tax Compliance of correction amounts for filing purposes", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["tax_compliance_manager", "billing_manager"], autoApproveAfterHours: 1 },
    estimatedDuration: "30 minutes to 4 hours (plus post-restoration reconciliation)",
    tags: ["tax-engine", "fallback", "tax-reconciliation", "emergency", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Unmatched Payment Investigation — Escalation Path, Aging Thresholds, and Write-Off Authority",
    description: "Structured procedure for investigating and resolving unidentified or unmatched payments sitting in suspense accounts. Defines escalation path by aging thresholds, specifies investigation steps, documents write-off authority levels, and ensures compliance with unclaimed property (escheatment) regulations for truly unidentifiable payments.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "unmatched_payment_age_days", operator: "gte", value: 5, source: "cash_application_monitoring" },
      { type: "threshold", metric: "suspense_account_balance", operator: "gte", value: 10000, source: "gl_system" },
    ],
    steps: [
      { id: "1", type: "action", action: "initial_investigation", label: "Retrieve unmatched payment details: payer name, bank account, amount, date, reference number; search customer master for payer name match", order: 1 },
      { id: "2", type: "condition", condition: "customer_match_found", label: "Does payer name/bank account match a customer in AR system?", trueNext: "3", falseNext: "5", order: 2 },
      { id: "3", type: "action", action: "invoice_matching_attempt", label: "For matched customer: review all open invoices; check recent invoices paid; check if overpayment on recent payment; apply if confident; flag if still unclear", order: 3 },
      { id: "4", type: "action", action: "contact_known_customer", label: "Contact known customer's AP contact: confirm what invoice(s) the payment was intended for; request remittance details", order: 4 },
      { id: "5", type: "action", action: "bank_trace", label: "For unknown payer: request bank trace from own bank; obtain originator information from ACH or wire details; contact originating bank if necessary", order: 5 },
      { id: "6", type: "condition", condition: "payment_age", label: "Payment age — select appropriate escalation:", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "escalation_30_days", label: "30+ days unmatched: escalate to AR Manager; evaluate credit to unidentified customer account vs. continued investigation; consider return to sender (refund to originating bank)", order: 7 },
      { id: "8", type: "action", action: "escalation_90_days", label: "90+ days unmatched: escalate to Finance Controller; evaluate write-off vs. unclaimed property; assess escheatment obligation by state", order: 8 },
      { id: "9", type: "action", action: "write_off_or_escheat", label: "Write-off authorization by amount: <$500 (AR Manager); $500-$5K (Controller); >$5K (CFO). Escheatment: file with state unclaimed property office per state dormancy rules (1-5 years)", order: 9 },
      { id: "10", type: "action", action: "documentation", label: "Document all investigation steps: who contacted, responses, evidence reviewed, final resolution, GL posting with authority reference", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["ar_manager", "finance_controller"], autoApproveAfterHours: null },
    estimatedDuration: "5 business days to 90+ days (escalation dependent)",
    tags: ["unmatched-payment", "suspense", "write-off", "escheatment", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Dispute Backlog Surge — Triage Procedure, Prioritization by Amount, and Temporary Hold Policy",
    description: "Surge management procedure for handling abnormal volumes of billing disputes that exceed standard team capacity. Covers triage methodology, prioritization framework, temporary processing holds, additional resource activation, and SLA management during surge periods. Typically triggered by billing system errors, pricing contract updates, or post-audit dispute waves.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "open_dispute_count", operator: "gte", value: 150, source: "ar_dispute_management" },
      { type: "threshold", metric: "dispute_intake_rate_daily", operator: "gte", value: 30, source: "ar_dispute_management" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_surge_cause", label: "Identify surge root cause: system error creating mass billing errors? recent price list update? large contract audit? Customer-specific dispute wave? Root cause determines resolution priority.", order: 1 },
      { id: "2", type: "condition", condition: "systemic_billing_error", label: "Is surge caused by a systemic billing error affecting many customers?", trueNext: "3", falseNext: "4", order: 2 },
      { id: "3", type: "action", action: "systemic_fix_first", label: "If systemic billing error: fix root cause FIRST (correct billing system, re-issue invoices); disputes related to same error can be batch-resolved with single credit memo run after fix", order: 3 },
      { id: "4", type: "action", action: "triage_and_prioritize", label: "Triage all open disputes by priority: (1) >$50K disputes; (2) VIP/Strategic Account disputes regardless of amount; (3) $10K-$50K disputes; (4) <$10K disputes", order: 4 },
      { id: "5", type: "action", action: "temporary_hold_policy", label: "Apply temporary hold on new low-priority disputes (<$1K): acknowledge receipt within SLA; inform customer of extended resolution time (state reason); document all held disputes", order: 5 },
      { id: "6", type: "action", action: "resource_escalation", label: "Escalate to AR Director: request temporary staff augmentation (internal transfers, temp agencies); assign senior AR specialists to high-priority disputes", order: 6 },
      { id: "7", type: "action", action: "batch_resolution", label: "Identify disputes with identical root cause (same contract issue, same pricing error): resolve as batch with single approval; issue batch credit memos; notify customers collectively", order: 7 },
      { id: "8", type: "action", action: "customer_proactive_communication", label: "Communicate to affected customers: acknowledge backlog; provide estimated resolution date by priority tier; provide dedicated contact for high-value disputes", order: 8 },
      { id: "9", type: "action", action: "daily_burn_down_tracking", label: "Track daily dispute closure rate vs. intake rate; report to Finance leadership daily until backlog normalized (open disputes < 2x normal volume)", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["ar_director", "vp_finance"], autoApproveAfterHours: 4 },
    estimatedDuration: "1-4 weeks (volume dependent)",
    tags: ["dispute-backlog", "surge-management", "triage", "collections", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Month-End and Quarter-End Close — AR Cutoff, Accrual Processing, and Reconciliation Checklist",
    description: "Comprehensive period-end close procedure for the billing and AR function. Ensures proper revenue recognition cutoff, complete cash application, accurate dispute and reserve accounting, and AR-to-GL balance reconciliation. Supports both month-end and quarter-end (expanded) close procedures in compliance with ASC 606 and SOX requirements.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "scheduled",
    triggerConditions: [
      { type: "schedule", schedule: "monthly_last_business_day_minus_2", description: "Triggered 2 business days before month end" },
      { type: "event", event: "close_process_initiated", source: "finance_close_management_system" },
    ],
    steps: [
      { id: "1", type: "action", action: "invoice_cutoff", label: "Invoice cutoff: all delivery confirmations received before midnight on last business day of month must be invoiced by close; verify all pending invoices generated or in queue", order: 1 },
      { id: "2", type: "action", action: "cash_application_cutoff", label: "Cash application cutoff: all payments received in bank by last business day must be applied to AR; clear any items in manual review queue; process all lockbox files received", order: 2 },
      { id: "3", type: "action", action: "unapplied_cash_review", label: "Review all unapplied cash: investigate and apply or escalate any items sitting >48 hours; post unapplied to suspense with aging documentation", order: 3 },
      { id: "4", type: "action", action: "credit_memo_processing", label: "Process all approved credit memos: ensure all dispute resolutions approved before close are posted; verify all return credits are applied", order: 4 },
      { id: "5", type: "action", action: "bad_debt_reserve", label: "Calculate bad debt reserve: run AR Reporting Skill — AR Aging Report; apply reserve percentages per policy; compare to current reserve balance; prepare journal entry for adjustment", order: 5 },
      { id: "6", type: "action", action: "ar_to_gl_reconciliation", label: "Reconcile AR subledger to GL: AR subledger total = AR GL account balance; identify and resolve any differences; common causes: unposted items, timing differences, manual journal entries", order: 6 },
      { id: "7", type: "action", action: "revenue_recognition_check", label: "Revenue recognition review (ASC 606): confirm all invoiced amounts have corresponding revenue recognition events; flag any invoices issued without performance obligation completion", order: 7 },
      { id: "8", type: "action", action: "dispute_accrual", label: "Dispute accrual: for disputes >$10K pending resolution at close: accrue estimated credit memo amount; document in disclosure schedule", order: 8 },
      { id: "9", type: "action", action: "quarter_end_additional", label: "QUARTER-END ONLY: Prepare DSO and CEI analysis vs. prior quarter; update bad debt reserve policy estimate for board/audit committee; prepare AR aging disclosure for financial statements", order: 9 },
      { id: "10", type: "action", action: "close_sign_off", label: "AR Manager and Controller sign off on close checklist; archive all supporting documentation; submit AR balance to consolidation team by close deadline", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["ar_manager", "finance_controller", "vp_finance"], autoApproveAfterHours: null },
    estimatedDuration: "2-3 business days (month-end); 3-5 business days (quarter-end)",
    tags: ["month-end-close", "quarter-end-close", "AR-reconciliation", "revenue-recognition", "SOX", "OTC-AGT-006"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 GOVERNANCE POLICIES  (Section 7.7)
// ══════════════════════════════════════════════════════════════════════════════

const POLICIES = [
  {
    organizationId: ORG,
    name: "Revenue Recognition Policy — ASC 606 / IFRS 15 Compliance",
    description: "Governs the timing and measurement of revenue recognition for all invoices generated by OTC-AGT-006. Ensures invoices are generated only upon satisfaction of performance obligations as defined under ASC 606 (US GAAP) and IFRS 15. OTC-AGT-006 must validate that delivery confirmation represents genuine transfer of control to the customer before generating an invoice.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "rev-001", type: "MUST", description: "Invoice generation is only permitted upon receipt of delivery confirmation evidencing transfer of control to the customer per ASC 606 step 5" },
      { id: "rev-002", type: "MUST", description: "For milestone-based contracts: invoice only after customer acceptance of the specific milestone; project manager sign-off required as evidence of performance obligation satisfaction" },
      { id: "rev-003", type: "MUST", description: "For subscription arrangements: recognize revenue ratably over service period; invoice timing may differ from revenue recognition; maintain deferred revenue schedules" },
      { id: "rev-004", type: "MUST_NOT", description: "Do not generate invoices for goods not yet delivered or services not yet performed, even if customer requests early billing (channel stuffing risk)" },
      { id: "rev-005", type: "MUST", description: "Allocate transaction price to each distinct performance obligation in contracts with multiple deliverables using standalone selling price methodology" },
      { id: "rev-006", type: "SHOULD", description: "Flag for Controller review any invoice where delivery confirmation and invoice date are in different accounting periods — revenue cutoff verification required" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["ASC-606", "IFRS-15", "revenue-recognition", "performance-obligation", "regulatory", "OTC-AGT-006"],
  },
  {
    organizationId: ORG,
    name: "Sales Tax and VAT Compliance Policy — Collection, Remittance, and Filing",
    description: "Governs OTC-AGT-006's obligations for accurate sales tax and VAT calculation, collection, and remittance across all applicable jurisdictions. Requires proper tax determination, exemption certificate validation, and nexus-aware tax application. Prohibits under-collection of applicable taxes and requires flagging of any tax calculation exceptions for compliance team review.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "tax-001", type: "MUST", description: "Calculate and collect applicable sales tax or VAT on every invoice; zero tax is only valid when nexus does not exist, customer holds valid exemption, or product/service is legally exempt" },
      { id: "tax-002", type: "MUST", description: "Validate customer tax exemption certificates before applying zero-tax: certificate must be on file, unexpired, valid for the ship-to state, and applicable to the product category invoiced" },
      { id: "tax-003", type: "MUST", description: "For EU VAT: validate buyer VAT number via VIES before applying zero-rate reverse charge on B2B intra-EU transactions; failure to validate invalidates the reverse charge" },
      { id: "tax-004", type: "MUST_NOT", description: "Do not generate invoices with zero tax in states where we have nexus without a valid, validated exemption certificate on file; under-collection creates tax liability for the company" },
      { id: "tax-005", type: "MUST", description: "When tax engine is unavailable: apply fallback tax rates from KB rate tables; flag all invoices with TAX_RECONCILIATION_REQUIRED; reconcile within 5 business days of engine restoration" },
      { id: "tax-006", type: "SHOULD", description: "Retain all tax detail records (jurisdiction, rate, taxable basis, tax amount, exemption reference) for minimum 7 years to support tax audit defense" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["sales-tax", "VAT", "tax-compliance", "exemption-certificate", "nexus", "regulatory", "OTC-AGT-006"],
  },
  {
    organizationId: ORG,
    name: "E-Invoicing Mandate Compliance Policy — India GST, EU, and Latin America",
    description: "Governs compliance with mandatory electronic invoicing requirements in applicable jurisdictions. OTC-AGT-006 must generate e-invoices in prescribed formats and register them with government portals before or at time of invoice delivery to customers. Covers India IRP/IRN, EU Directive 2014/55/EU (Peppol), Mexico CFDI, Brazil NF-e, and other LatAm mandates.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "einv-001", type: "MUST", description: "For India: generate e-invoice IRN via IRP portal before delivering invoice to customer for all B2B transactions from businesses above the turnover threshold (currently ₹10 crore)" },
      { id: "einv-002", type: "MUST", description: "For Mexico: all invoices must be CFDI 4.0 format, digitally signed by a PAC (Authorized Certification Provider), and timestamped before delivery to customer" },
      { id: "einv-003", type: "MUST", description: "For Brazil: generate NF-e XML and obtain SEFAZ authorization (chave de acesso) for all product invoices; NFS-e for service invoices per municipal requirements" },
      { id: "einv-004", type: "MUST_NOT", description: "Do not deliver invoice to customer before completing mandatory government portal registration (IRP/SAT/SEFAZ) — unregistered invoices are not legally valid in these jurisdictions" },
      { id: "einv-005", type: "MUST", description: "For EU public sector customers: deliver invoices in EN16931-compliant electronic format via Peppol network or agreed portal where government e-invoicing is mandated" },
      { id: "einv-006", type: "SHOULD", description: "Maintain e-invoice archive (XML originals + acknowledgment responses) for statutory retention periods: India 8 years, Mexico 5 years, Brazil 5 years, EU 7-10 years by country" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["e-invoicing", "India-GST", "CFDI", "NF-e", "Peppol", "LatAm", "regulatory", "OTC-AGT-006"],
  },
  {
    organizationId: ORG,
    name: "SOX Internal Controls Policy — Invoice Generation, Payment Processing, and Journal Entries",
    description: "Defines Sarbanes-Oxley (SOX) internal controls that OTC-AGT-006 must maintain for financial reporting integrity. Covers segregation of duties for invoice generation and cash application, approval workflows for credit memos and write-offs, immutable audit trail requirements, access control enforcement, and IT general controls for billing system integrity.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "sox-001", type: "MUST", description: "Maintain segregation of duties: the agent or user who creates an invoice must not be the same who approves credit memos or write-offs; enforce via role-based access controls" },
      { id: "sox-002", type: "MUST", description: "All credit memos, write-offs, and debit memos require explicit human approval per the authorization matrix; agent may recommend but must not self-approve above its auto-approve threshold ($500)" },
      { id: "sox-003", type: "MUST", description: "Generate immutable audit trail for every invoice creation, payment application, credit/debit memo, and write-off; records must include timestamp, user/agent ID, action taken, and data before/after change" },
      { id: "sox-004", type: "MUST", description: "Cash application reversals require supervisor approval and documented reason code; system must prevent deletion of original application records (reversal only; not deletion)" },
      { id: "sox-005", type: "MUST_NOT", description: "Do not process journal entries to AR GL accounts without Controller approval except for system-generated postings from approved billing/cash application workflows" },
      { id: "sox-006", type: "SHOULD", description: "Produce quarterly AR reconciliation reports and attestations for external auditors; ensure all reconciling items are documented with resolution owners and target dates" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["SOX", "internal-controls", "segregation-of-duties", "audit-trail", "access-control", "OTC-AGT-006"],
  },
  {
    organizationId: ORG,
    name: "PCI-DSS Payment Card Data Security Policy",
    description: "Governs the secure handling, transmission, and storage of payment card data in compliance with PCI-DSS standards. OTC-AGT-006 must never store full card numbers, CVV codes, or magnetic stripe data. All card processing must occur through PCI-DSS compliant payment processors. Cardholder data appearing in invoices or communications must be masked per PCI-DSS requirements.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "pci-001", type: "MUST_NOT", description: "Never store, log, or transmit full payment card numbers (PAN) in any invoice, communication, database record, or log file; use only last 4 digits for reference" },
      { id: "pci-002", type: "MUST_NOT", description: "Never store CVV/CVC/CVV2 codes under any circumstances — not even for recurring billing; obtain fresh CVV at each transaction or use tokenization" },
      { id: "pci-003", type: "MUST", description: "All credit card payment processing must route exclusively through PCI-DSS Level 1 certified payment processors; OTC-AGT-006 must never be in the card data flow" },
      { id: "pci-004", type: "MUST", description: "On invoices and customer-facing documents: display only last 4 digits of card number with asterisk masking (e.g., **** **** **** 1234) and payment method type only" },
      { id: "pci-005", type: "MUST", description: "Tokenize card data for recurring billing: store only PCI-compliant token from processor; use token for subsequent charges; never store raw PAN" },
      { id: "pci-006", type: "SHOULD", description: "Log all payment card processing events (token used, transaction ID, amount, outcome) for reconciliation and dispute resolution; confirm logs contain no PAN data before archiving" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["PCI-DSS", "payment-card-security", "cardholder-data", "tokenization", "regulatory", "OTC-AGT-006"],
  },
  {
    organizationId: ORG,
    name: "Anti-Money Laundering Policy — Suspicious Payment Pattern Detection and Reporting",
    description: "Governs OTC-AGT-006's obligations to detect and report suspicious payment patterns that may indicate money laundering, structuring, or other financial crimes. Requires monitoring of unusual payment behaviors, maintaining customer payment profiles, and escalating suspicious activity for Compliance review and potential SAR (Suspicious Activity Report) filing.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "aml-001", type: "MUST", description: "Flag and escalate to Compliance any payment received from a third party not listed as the customer on the invoice or contract — potential layering/smurfing indicator" },
      { id: "aml-002", type: "MUST", description: "Detect and flag structuring patterns: multiple payments just below $10,000 (CTR threshold) from same customer within 24-hour period; escalate to Compliance within same business day" },
      { id: "aml-003", type: "MUST", description: "Flag unsolicited overpayments with refund requests: customer pays significantly more than invoice then requests refund by different method — classic money laundering pattern" },
      { id: "aml-004", type: "MUST", description: "Maintain customer payment behavior profiles: detect deviations from established payment patterns (new bank accounts, unusual payment timing, round-number payments) as AML red flags" },
      { id: "aml-005", type: "MUST_NOT", description: "Do not process refunds to payment methods different from the original payment source without Compliance approval; must review for money laundering risk" },
      { id: "aml-006", type: "SHOULD", description: "Retain payment monitoring records and any compliance escalations for minimum 5 years; support SAR filing requirements and regulatory examination readiness" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["AML", "anti-money-laundering", "suspicious-activity", "SAR", "financial-crime", "OTC-AGT-006"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — GOLDEN DATASET + 6 TEST CASES  (Section 7.5)
// ══════════════════════════════════════════════════════════════════════════════

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "OTC-AGT-006 Billing & Collections Agent — Golden Evaluation Dataset",
  description: "Curated evaluation dataset for validating OTC-AGT-006 accuracy across billing and collections scenarios: invoice generation accuracy, tax calculation correctness, cash application matching, dunning sequence management, dispute resolution, and AR reporting.",
  industry: "order_to_cash",
  useCase: "Billing & Collections Management",
  domain: "billing-collections",
  version: "1.0",
  tags: ["billing", "collections", "invoice-generation", "cash-application", "dispute-resolution", "tax-calculation", "OTC-AGT-006"],
  metadata: {
    agentCode: "OTC-AGT-006",
    category: "Financial",
    testDesign: "representative_billing_scenarios",
    evaluationCriteria: "invoice_accuracy + tax_correctness + cash_application_match_rate + dunning_compliance + dispute_resolution_accuracy",
  },
};

const TEST_CASES = [
  {
    name: "Invoice Generation — Multi-Line B2B Invoice with Contract Pricing and Tax",
    description: "Tests accurate invoice generation from delivery confirmation for a multi-line B2B order. Validates contract price application, line-level discount calculation, tax computation for a multi-state delivery, and EDI 810 output format for an EDI-enabled trading partner.",
    input: {
      deliveryConfirmation: {
        orderId: "ORD-20240315-0042",
        deliveryDate: "2024-03-15",
        customerId: "CUST-B2B-0187",
        customerName: "Acme Manufacturing Corp",
        deliveryAddress: { city: "Houston", state: "TX", zip: "77001", country: "US" },
        lineItems: [
          { sku: "IND-PUMP-XL200", description: "Industrial Pump XL200", qty: 5, unitListPrice: 2400.00 },
          { sku: "IND-SEAL-KIT-200", description: "Pump Seal Kit", qty: 10, unitListPrice: 85.00 },
        ],
      },
      contractPricing: {
        contractId: "CONTRACT-ACME-2024",
        items: [
          { sku: "IND-PUMP-XL200", contractPrice: 2160.00, discountPct: 10 },
          { sku: "IND-SEAL-KIT-200", contractPrice: 76.50, discountPct: 10 },
        ],
      },
      customerProfile: {
        paymentTerms: "NET30",
        taxExempt: false,
        taxJurisdiction: "TX",
        deliveryChannel: "EDI_810",
        poNumber: "ACME-PO-88921",
      },
    },
    expectedOutput: {
      invoiceGenerated: true,
      lineItems: [
        { sku: "IND-PUMP-XL200", qty: 5, unitPrice: 2160.00, discount: 10, extendedAmount: 9720.00 },
        { sku: "IND-SEAL-KIT-200", qty: 10, unitPrice: 76.50, discount: 10, extendedAmount: 688.50 },
      ],
      subtotal: 10408.50,
      taxJurisdiction: "TX",
      taxRate: 0.0825,
      taxAmount: 858.70,
      invoiceTotal: 11267.20,
      paymentTerms: "Net 30",
      dueDate: "2024-04-14",
      outputFormat: "EDI_810",
      poReference: "ACME-PO-88921",
    },
    tags: ["invoice-generation", "B2B", "contract-pricing", "EDI-810", "sales-tax"],
    metrics: { invoiceAccuracy: 1.0, taxAccuracy: 1.0, formatCompliance: 1.0 },
  },
  {
    name: "Tax Calculation — EU B2B Intra-EU Reverse Charge and Exemption",
    description: "Tests correct VAT treatment for an intra-EU B2B transaction where reverse charge applies. Validates VIES VAT number verification, zero-rate application, correct invoice notation, and comparison against a B2C transaction on the same invoice batch requiring standard German VAT.",
    input: {
      transactions: [
        {
          transactionId: "TXN-EU-B2B-001",
          type: "B2B_intra_EU",
          sellerCountry: "DE",
          buyerCountry: "FR",
          buyerVatNumber: "FR12345678901",
          vatNumberViesValid: true,
          lineItems: [{ description: "Software License", netAmount: 10000.00 }],
        },
        {
          transactionId: "TXN-EU-B2C-001",
          type: "B2C_intra_EU",
          sellerCountry: "DE",
          buyerCountry: "DE",
          buyerIsConsumer: true,
          lineItems: [{ description: "Hardware Component", netAmount: 500.00 }],
        },
      ],
    },
    expectedOutput: {
      b2b_result: {
        transactionId: "TXN-EU-B2B-001",
        vatRate: 0,
        vatAmount: 0,
        reverseChargeApplied: true,
        invoiceNotation: "Reverse Charge",
        buyerVatNumberOnInvoice: "FR12345678901",
        netAmount: 10000.00,
        grossAmount: 10000.00,
      },
      b2c_result: {
        transactionId: "TXN-EU-B2C-001",
        vatRate: 0.19,
        vatAmount: 95.00,
        reverseChargeApplied: false,
        netAmount: 500.00,
        grossAmount: 595.00,
      },
    },
    tags: ["VAT", "reverse-charge", "EU-B2B", "VIES-validation", "tax-calculation"],
    metrics: { taxAccuracy: 1.0, regulatoryCompliance: 1.0 },
  },
  {
    name: "Cash Application — Batch Remittance with Partial Pay and Early Discount",
    description: "Tests cash application for a complex lockbox batch containing: one exact match, one partial payment with valid early-pay discount, one unidentified payment, and one overpayment that creates a credit balance. Validates confidence scoring, auto-apply decisions, and correct GL posting.",
    input: {
      lockboxBatch: {
        batchId: "LOCKBOX-20240320-001",
        bankDate: "2024-03-20",
        payments: [
          {
            checkNumber: "CHK-10042",
            payerName: "Global Supplies Inc",
            amount: 14750.00,
            remittanceDetail: [{ invoiceNumber: "INV-202402-003421", amount: 14750.00 }],
          },
          {
            checkNumber: "CHK-10043",
            payerName: "Metro Retail Group",
            amount: 9800.00,
            remittanceDetail: [{ invoiceNumber: "INV-202402-003430", amount: 9800.00, discountTaken: 200.00 }],
          },
          {
            checkNumber: "CHK-10044",
            payerName: "Unknown Remitter",
            amount: 5000.00,
            remittanceDetail: [],
          },
          {
            checkNumber: "CHK-10045",
            payerName: "Summit Technologies",
            amount: 22400.00,
            remittanceDetail: [{ invoiceNumber: "INV-202402-003398", amount: 22400.00 }],
          },
        ],
      },
      openInvoices: [
        { invoiceId: "INV-202402-003421", customerId: "CUST-GLOBAL-001", balance: 14750.00, dueDate: "2024-03-25" },
        { invoiceId: "INV-202402-003430", customerId: "CUST-METRO-002", balance: 10000.00, dueDate: "2024-03-22", earlyPayDiscount: { rate: 0.02, deadline: "2024-03-22" } },
        { invoiceId: "INV-202402-003398", customerId: "CUST-SUMMIT-004", balance: 20000.00, dueDate: "2024-03-30" },
      ],
    },
    expectedOutput: {
      applications: [
        { checkNumber: "CHK-10042", matchType: "exact_invoice", confidence: 0.99, action: "auto_apply", invoiceId: "INV-202402-003421", amountApplied: 14750.00 },
        { checkNumber: "CHK-10043", matchType: "early_pay_discount", confidence: 0.97, action: "auto_apply", invoiceId: "INV-202402-003430", amountApplied: 9800.00, discountPosted: 200.00 },
        { checkNumber: "CHK-10044", matchType: "unidentified", confidence: 0, action: "queue_suspense", requiresManualInvestigation: true },
        { checkNumber: "CHK-10045", matchType: "overpayment", confidence: 0.97, action: "auto_apply_with_credit", invoiceId: "INV-202402-003398", amountApplied: 20000.00, creditBalance: 2400.00 },
      ],
      batchSummary: { totalItems: 4, autoApplied: 3, manualQueue: 1, suspense: 1, totalApplied: 44550.00 },
    },
    tags: ["cash-application", "lockbox", "partial-payment", "early-pay-discount", "overpayment"],
    metrics: { matchAccuracy: 1.0, autoApplyRate: 0.75, confidenceCalibration: 1.0 },
  },
  {
    name: "Dunning Management — Overdue Invoice Escalation with Payment Commitment",
    description: "Tests dunning sequence management for an overdue B2B invoice. Validates correct dunning level assignment at 21 days past due, customer response recording (payment commitment), dunning pause behavior, and escalation when the commitment is broken.",
    input: {
      invoice: {
        invoiceId: "INV-202401-002887",
        customerId: "CUST-B2B-0299",
        customerTier: "Standard",
        amount: 32500.00,
        invoiceDate: "2024-01-15",
        dueDate: "2024-02-14",
        currentDate: "2024-03-06",
        daysPastDue: 21,
        dunningHistory: [
          { level: 1, sentDate: "2024-02-11", channel: "email", response: "no_response" },
          { level: 2, sentDate: "2024-02-21", channel: "email", response: "no_response" },
        ],
      },
      customerResponse: {
        type: "payment_commitment",
        commitmentDate: "2024-03-15",
        commitmentAmount: 32500.00,
        contactName: "John Smith, AP Manager",
        contactDate: "2024-03-06",
      },
    },
    expectedOutput: {
      phase1: {
        dunningLevelAtContact: 3,
        level3ActionRequired: true,
        channelsUsed: ["email", "phone"],
        toneLevel: "firm",
        accountCreditHoldEvaluated: true,
      },
      phase2_after_commitment: {
        dunningPaused: true,
        pauseUntilDate: "2024-03-20",
        commitmentRecorded: true,
        monitoringActivated: true,
      },
      phase3_if_commitment_broken: {
        dunningResumed: true,
        newDunningLevel: 4,
        trackEscalated: "high_risk",
        brokenPromiseFlag: true,
        creditHoldRecommended: true,
      },
    },
    tags: ["dunning", "payment-commitment", "overdue", "escalation", "B2B"],
    metrics: { sequenceCompliance: 1.0, escalationCorrectness: 1.0, pauseAccuracy: 1.0 },
  },
  {
    name: "Dispute Investigation — Pricing Error Root Cause with Credit Memo Issuance",
    description: "Tests automated billing dispute investigation for a pricing error dispute. Validates contract price cross-reference, root cause identification, credit memo calculation, and authorization routing. Customer disputes invoice price against a contract rate they hold — tests whether the agent correctly confirms the billing error and issues the appropriate credit.",
    input: {
      dispute: {
        disputeId: "DISP-20240310-0088",
        invoiceId: "INV-202402-003105",
        customerId: "CUST-B2B-KEY-0072",
        customerTier: "Key Account",
        disputeType: "pricing_error",
        customerClaimedAmount: 1890.00,
        invoicedAmount: 21000.00,
        customerStatedContractPrice: 15750.00,
        disputeDetail: "Invoice shows $420/unit for 50 units; our contract ENTER-2024-007 states $315/unit for volumes 40+",
      },
      contractData: {
        contractId: "ENTER-2024-007",
        effectiveDate: "2024-01-01",
        expiryDate: "2024-12-31",
        pricingTiers: [
          { minQty: 1, maxQty: 39, unitPrice: 420.00 },
          { minQty: 40, maxQty: null, unitPrice: 315.00 },
        ],
      },
      invoice: {
        invoiceId: "INV-202402-003105",
        sku: "SOFT-LICENSE-ENT",
        qty: 50,
        unitPrice: 420.00,
        extendedAmount: 21000.00,
      },
    },
    expectedOutput: {
      billingErrorConfirmed: true,
      rootCause: "Volume tier price not applied — invoice used Tier 1 price ($420) instead of Tier 2 price ($315) for qty 50 which qualifies for 40+ tier",
      correctUnitPrice: 315.00,
      correctExtendedAmount: 15750.00,
      creditMemoAmount: 5250.00,
      creditMemoIssued: false,
      authorizationRequired: "AR_Manager",
      reason: "Credit memo amount $5,250 requires AR Manager approval (threshold: >$500 and ≤$10,000)",
      slaBreachRisk: false,
      customerNotificationRequired: true,
    },
    tags: ["dispute-investigation", "pricing-error", "credit-memo", "contract-price", "key-account"],
    metrics: { rootCauseAccuracy: 1.0, creditCalculationAccuracy: 1.0, authorizationCompliance: 1.0 },
  },
  {
    name: "Multi-Currency AR Reporting — DSO Calculation with FX Revaluation",
    description: "Tests AR reporting for a multi-currency scenario. Validates DSO calculation across USD, EUR, and GBP denominated AR, FX revaluation of open balances at period-end rates, and correct bad debt reserve recommendation based on aging distribution. Verifies the 13-week cash flow forecast output.",
    input: {
      arBalances: {
        reportDate: "2024-03-31",
        currencies: [
          {
            currency: "USD",
            agingBuckets: {
              current: 1250000.00,
              days_1_30: 380000.00,
              days_31_60: 145000.00,
              days_61_90: 62000.00,
              days_91_120: 28000.00,
              days_120_plus: 15000.00,
            },
            creditSalesLast30Days: 1820000.00,
          },
          {
            currency: "EUR",
            agingBuckets: { current: 425000.00, days_1_30: 112000.00, days_31_60: 38000.00, days_61_90: 18000.00, days_91_120: 7500.00, days_120_plus: 3200.00 },
            creditSalesLast30Days: 620000.00,
            fxRate: { toUSD: 1.085, date: "2024-03-31" },
            priorPeriodFxRate: { toUSD: 1.071, date: "2024-02-29" },
          },
        ],
      },
      reportRequirements: ["ar_aging", "dso", "bad_debt_reserve_recommendation", "cash_flow_forecast_13_week"],
    },
    expectedOutput: {
      arAgingReport: {
        totalARUSD: 2766987.50,
        totalCurrentUSD: 1711125.00,
        totalOverdueUSD: 1055862.50,
        percentCurrent: 61.8,
      },
      dso: {
        usd: { dso: 32.5, bpdso: 20.6, delinquentDso: 11.9 },
        eur: { dso: 35.0 },
        combined_days: 33.1,
      },
      fxRevaluation: {
        eurBalanceRevalued: true,
        revaluationGainLossUSD: 23544.00,
        glEntry: "FX Revaluation Gain — AR",
      },
      badDebtReserveRecommendation: {
        calculatedReserve: 71849.38,
        currentReserve: 65000.00,
        recommendedAdjustment: 6849.38,
        direction: "increase",
      },
    },
    tags: ["AR-reporting", "DSO", "multi-currency", "FX-revaluation", "bad-debt-reserve"],
    metrics: { calculationAccuracy: 1.0, reportCompleteness: 1.0, fxAccuracy: 1.0 },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — KPIs
// ══════════════════════════════════════════════════════════════════════════════

const KPIS = [
  {
    name: "Invoice Accuracy Rate",
    description: "Percentage of invoices generated by OTC-AGT-006 that are free from pricing, quantity, or tax errors requiring correction",
    type: "accuracy",
    targetValue: 99.5,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(invoices_without_disputes / total_invoices_generated) * 100",
    tags: ["invoice-accuracy", "billing-quality", "OTC-AGT-006"],
  },
  {
    name: "Cash Application Auto-Match Rate",
    description: "Percentage of incoming payments automatically applied to invoices without manual intervention",
    type: "efficiency",
    targetValue: 85,
    unit: "percentage",
    measurementFrequency: "daily",
    formula: "(auto_applied_payments / total_payments_received) * 100",
    tags: ["cash-application", "automation", "efficiency", "OTC-AGT-006"],
  },
  {
    name: "Days Sales Outstanding (DSO)",
    description: "Average number of days from invoice date to cash collection; measures AR collection efficiency",
    type: "performance",
    targetValue: 38,
    unit: "days",
    measurementFrequency: "monthly",
    formula: "(ending_ar_balance / credit_sales_in_period) * days_in_period",
    tags: ["DSO", "collection-efficiency", "AR-performance", "OTC-AGT-006"],
  },
  {
    name: "Dispute Resolution Cycle Time",
    description: "Average business days from dispute receipt to final resolution (credit memo issued or dispute rejected with documentation)",
    type: "performance",
    targetValue: 5,
    unit: "business_days",
    measurementFrequency: "weekly",
    formula: "avg(resolution_date - dispute_received_date) in business days",
    tags: ["dispute-resolution", "cycle-time", "customer-experience", "OTC-AGT-006"],
  },
  {
    name: "Tax Calculation Accuracy",
    description: "Percentage of invoice tax calculations that match expected tax amounts within a 0.1% tolerance (validated against tax engine recomputation or audit findings)",
    type: "accuracy",
    targetValue: 99.8,
    unit: "percentage",
    measurementFrequency: "monthly",
    formula: "(invoices_with_correct_tax / total_invoices) * 100",
    tags: ["tax-accuracy", "compliance", "OTC-AGT-006"],
  },
  {
    name: "Collection Effectiveness Index (CEI)",
    description: "Measures how effectively the agent collects receivables that become due; 100% = perfect collections",
    type: "quality",
    targetValue: 87,
    unit: "percentage",
    measurementFrequency: "monthly",
    formula: "((beginning_ar + credit_sales - ending_total_ar) / (beginning_ar + credit_sales - ending_current_ar)) * 100",
    tags: ["CEI", "collection-effectiveness", "AR-quality", "OTC-AGT-006"],
  },
  {
    name: "Dunning Response Rate",
    description: "Percentage of overdue customers who make payment or contact within 5 business days of receiving a dunning communication",
    type: "quality",
    targetValue: 62,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(customers_responded_within_5_days / total_dunning_notices_sent) * 100",
    tags: ["dunning", "collections", "response-rate", "OTC-AGT-006"],
  },
  {
    name: "Unapplied Cash as % of Total AR",
    description: "Percentage of total AR balance that is sitting in unapplied/suspense status — lower is better; indicates cash application efficiency",
    type: "efficiency",
    targetValue: 0.5,
    unit: "percentage",
    measurementFrequency: "daily",
    formula: "(unapplied_cash_balance / total_ar_balance) * 100",
    tags: ["unapplied-cash", "cash-application", "efficiency", "OTC-AGT-006"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PROMPTS
// ══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the Billing & Collections Agent (OTC-AGT-006) for an Order-to-Cash platform. Your purpose is to generate accurate invoices upon delivery confirmation, calculate and apply taxes across jurisdictions, process and apply incoming payments, manage overdue collections through configurable dunning sequences, investigate and resolve billing disputes, and provide AR reporting to Finance leadership.

WORKFLOW:
1. Receive delivery confirmation from Fulfillment Agent (OTC-AGT-005)
2. Generate invoice with correct line items, quantities, contract prices, and discounts
3. Calculate and apply taxes based on ship-to jurisdiction, product taxability, and customer exemption status
4. Validate invoice against PO, contract, and order terms before issuance
5. Deliver invoice via customer-preferred channel (email, EDI 810, portal, physical mail)
6. Monitor payment due dates and initiate dunning sequence for overdue invoices
7. Process incoming payments and match to open invoices (cash application)
8. Handle partial payments, overpayments, and unidentified remittances
9. Manage billing disputes: capture, investigate root cause, resolve, or escalate
10. Issue credit memos or debit memos as needed with appropriate authorization
11. Report on AR aging, DSO, and collection effectiveness on configured schedule

OPERATING CONSTRAINTS:
- SUPERVISED autonomy: credit memos >$500, write-offs of any amount, and debit memos require human approval per authorization matrix
- NEVER generate an invoice without a valid delivery confirmation or milestone completion event
- NEVER store full credit card numbers or CVV codes — PCI-DSS compliance is mandatory
- NEVER apply zero tax in a nexus state without a validated, unexpired exemption certificate on file
- NEVER issue revenue-generating invoices for undelivered goods or unperformed services (ASC 606)
- ALWAYS generate immutable audit records for every invoice, payment application, credit memo, and write-off
- ALWAYS pause dunning sequence when a billing dispute is opened on an invoice
- ALWAYS escalate suspicious payment patterns (structuring, third-party payments, overpayment refund requests) to Compliance within same business day

REGULATORY GUARDRAILS: ASC 606/IFRS 15 revenue recognition; Sales Tax/VAT multi-jurisdiction; E-Invoicing mandates (India IRP, Mexico CFDI, Brazil NF-e); SOX internal controls; PCI-DSS; Anti-Money Laundering`;

const RUNTIME_TASK_PROMPT = `Analyze the billing or collections task. For invoice generation: retrieve delivery confirmation data, apply contract pricing, calculate tax via Tax Calculation Skill, validate against PO/contract, generate in customer's preferred format and deliver via preferred channel. For cash application: parse remittance data, apply matching rules in priority order, auto-apply above confidence threshold, queue below threshold for review. For dunning: determine correct dunning track, retrieve appropriate template, send via configured channel, record activity. For disputes: classify type, retrieve source documents, cross-reference to identify root cause, determine resolution, route for approval if above auto-approve threshold. For reporting: calculate requested metrics from AR subledger, format for intended audience, distribute per schedule. All actions must generate audit trail entries. Flag any regulatory concerns immediately.`;

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  OTC-AGT-006 — Billing & Collections Agent");
  console.log("  DEV ENVIRONMENT — Single Comprehensive Creation Script");
  console.log(`  Target: ${BASE}`);
  console.log(`  Org:    ${ORG}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  const ids = {};

  // ── STEP 1: 6 SKILLS ─────────────────────────────────────────────────────────
  step("1", "11", "Creating 6 skills");
  ids.skillIds = [];
  for (const s of SKILLS) {
    const res = await post("/api/skills", s);
    ids.skillIds.push(res.id);
    log(`Skill → ${s.name.slice(0, 65)} [${res.id}]`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────────
  step("2", "11", "Creating knowledge base");
  const kb = await post("/api/knowledge-bases", {
    organizationId: ORG,
    name: "Billing & Collections Agent Knowledge Base",
    description: "Comprehensive knowledge base for OTC-AGT-006 covering invoice templates by country and segment, tax rate tables with exemption certificate procedures, payment terms library, dunning letter templates, dispute resolution decision trees, and cash application matching rules. Supports accurate billing, tax compliance, collections, and AR reporting across the Order-to-Cash scenario.",
    industry: "order_to_cash",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["billing", "collections", "invoicing", "tax-compliance", "cash-application", "dunning", "dispute-resolution", "AR-reporting", "OTC-AGT-006"],
  });
  ids.kbId = kb.id;
  log(`Knowledge Base → ${kb.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  step("3", "11", `Ingesting ${KB_SOURCES.length} knowledge base sources`);
  ids.kbSourceIds = [];
  for (const src of KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.kbId}/sources/text`, {
        title: src.title,
        content: src.content,
        tags: src.tags,
        metadata: src.metadata,
      });
      ids.kbSourceIds.push(res.id);
      if (res.name && res.name !== src.title) {
        try { await patch(`/api/knowledge-bases/${ids.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
      }
      log(`KB Source → ${src.title.slice(0, 70)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: 6 RUNBOOKS ───────────────────────────────────────────────────────
  step("4", "11", "Creating 6 runbooks");
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const res = await post("/api/runbooks", rb);
    ids.runbookIds.push(res.id);
    log(`Runbook → ${rb.name.slice(0, 65)} [${res.id}]`);
  }

  // ── STEP 5: 6 GOVERNANCE POLICIES ────────────────────────────────────────────
  step("5", "11", "Creating 6 governance policies");
  ids.policyIds = [];
  for (const p of POLICIES) {
    const res = await post("/api/policies", p);
    ids.policyIds.push(res.id);
    log(`Policy → ${p.name.slice(0, 65)} [${res.id}]`);
  }

  // ── STEP 6: AGENT ────────────────────────────────────────────────────────────
  step("6", "11", "Creating agent OTC-AGT-006");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Billing & Collections Agent",
    agentType: "operational",
    description: "Generates accurate invoices with proper tax application, manages payment capture and remittance processing, handles billing disputes, sends collection reminders, and reconciles incoming cash. Replaces manual invoicing that leads to errors, write-offs, and slow cash application. Supports OTC-AGT-006 in the Order-to-Cash scenario.",
    owner: "OTC Platform Team",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "development",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Finance — Accounts Receivable",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "OTC-AGT-006",
      category: "Financial",
      scenario: "Order to Cash",
      billingTriggers: ["delivery_confirmation", "milestone_completion", "subscription_cycle", "usage_period_end"],
      taxRegimes: ["US_sales_tax", "EU_VAT", "Canada_GST_HST_PST", "India_GST", "Mexico_CFDI", "Brazil_NFe"],
      paymentTypes: ["ACH", "wire", "check", "credit_card", "EDI_820", "online_portal"],
      dunningTracks: ["standard", "VIP", "high_risk", "disputed"],
      disputeTypes: ["pricing_error", "quantity_discrepancy", "quality_return", "duplicate_billing", "tax_error", "freight_charge", "contract_mismatch"],
      escalationTriggers: [
        "credit_memo_above_500",
        "write_off_any_amount",
        "dispute_above_10000",
        "aml_suspicious_payment",
        "tax_engine_down",
        "invoice_generation_failure_3x",
        "unmatched_payment_30_days",
        "dunning_level_5_collections_referral",
      ],
      complianceChecks: ["ASC_606_IFRS_15", "sales_tax_VAT", "e_invoicing_mandates", "SOX_controls", "PCI_DSS", "AML"],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "OTC-AGT-006",
      category: "Financial",
      nodes: [
        { id: "delivery_receive", type: "trigger", label: "Receive Delivery Confirmation from OTC-AGT-005" },
        { id: "invoice_gen", type: "skill", label: "Invoice Generation" },
        { id: "tax_calc", type: "skill", label: "Tax Calculation" },
        { id: "invoice_deliver", type: "action", label: "Invoice Delivery via Preferred Channel" },
        { id: "payment_monitoring", type: "skill", label: "Monitor Payment Due Dates" },
        { id: "cash_app", type: "skill", label: "Cash Application" },
        { id: "dunning_mgmt", type: "skill", label: "Dunning Management" },
        { id: "dispute_path", type: "condition", label: "Billing Dispute Filed?" },
        { id: "dispute_invest", type: "skill", label: "Dispute Investigation" },
        { id: "ar_reporting", type: "skill", label: "AR Reporting" },
        { id: "output", type: "output", label: "AR Balanced + Cash Applied + Disputes Resolved + Reports Delivered" },
      ],
      edges: [
        { from: "delivery_receive", to: "invoice_gen" },
        { from: "invoice_gen", to: "tax_calc" },
        { from: "tax_calc", to: "invoice_deliver" },
        { from: "invoice_deliver", to: "payment_monitoring" },
        { from: "payment_monitoring", to: "cash_app" },
        { from: "payment_monitoring", to: "dunning_mgmt" },
        { from: "cash_app", to: "dispute_path" },
        { from: "dispute_path", to: "dispute_invest" },
        { from: "dispute_invest", to: "ar_reporting" },
        { from: "dunning_mgmt", to: "ar_reporting" },
        { from: "ar_reporting", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: [
        "retrieve_kb", "fetch_delivery_confirmation", "fetch_contract_pricing", "fetch_po_terms",
        "calculate_line_items", "apply_discounts", "generate_invoice_document", "validate_invoice",
        "route_to_delivery_channel", "lookup_tax_jurisdiction", "apply_tax_rates",
        "validate_exemption_certificate", "ingest_remittance_advice", "match_payment_to_invoice",
        "score_match_confidence", "auto_apply_payment", "post_to_gl",
        "calculate_ar_aging", "determine_dunning_track", "generate_dunning_communication",
        "send_dunning_notice", "record_payment_commitment", "pause_dunning_for_dispute",
        "escalate_to_collections", "capture_dispute", "classify_dispute_type",
        "fetch_source_documents", "cross_reference_invoice", "analyze_root_cause",
        "determine_resolution", "issue_credit_memo", "calculate_dso", "calculate_cei",
        "generate_cash_forecast", "generate_report",
      ],
      mcpServers: ["order-management-mcp", "billing-system-mcp", "tax-engine-mcp", "banking-integration-mcp", "ar-system-mcp", "gl-system-mcp", "contract-management-mcp", "crm-mcp", "communication-platform-mcp"],
    },
    maxToolIterations: 15,
    complianceTags: ["ASC-606", "IFRS-15", "PCI-DSS", "SOX", "AML", "India-GST", "EU-VAT", "CFDI", "NF-e"],
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Billing & Collections Agent → ${agentRes.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────────
  step("7", "11", "Linking runbooks (agentId) and policies (scopeId) to agent");
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) {
      warn(`Runbook link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 runbooks: agentId set");
  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 policies: scopeId set");

  // ── STEP 8: LINK KB TO AGENT ──────────────────────────────────────────────────
  step("8", "11", "Linking knowledge base to agent");
  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId,
      priority: 1,
      retrievalConfig: {
        topK: 12,
        scoreThreshold: 0.68,
        rerankEnabled: true,
        citationMode: "full",
        taxJurisdictionFiltering: true,
        disputeTypeFiltering: true,
        dunningLevelFiltering: true,
      },
    });
    log(`Knowledge base linked to agent`);
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + 6 TEST CASES ────────────────────────────────────
  step("9", "11", "Creating golden dataset + 6 test cases");
  const dsRes = await post("/api/golden-datasets", GOLDEN_DATASET);
  ids.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);
  ids.testCaseIds = [];
  for (const tc of TEST_CASES) {
    try {
      const tcRes = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, {
        datasetId: ids.goldenDatasetId,
        name: tc.name,
        inputScenario: `${tc.description}\n\nInput: ${JSON.stringify(tc.input, null, 2)}`,
        expectedBehavior: `Expected output: ${JSON.stringify(tc.expectedOutput, null, 2)}`,
        evaluationCriteria: Object.entries(tc.metrics || {}).map(([k, v]) => ({ criterion: k, target: v })),
        rubricScoring: { dimensions: Object.keys(tc.metrics || {}), passingScore: 0.9 },
        difficultyTier: "complex",
        scenarioCategory: "happy_path",
        tags: tc.tags || [],
        status: "active",
      });
      ids.testCaseIds.push(tcRes.id);
      log(`Test Case → ${tc.name.slice(0, 65)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 10: EVAL SUITE ───────────────────────────────────────────────────────
  step("10", "11", "Creating evaluation suite");
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "OTC-AGT-006 Billing & Collections Agent Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      invoiceAccuracyRate: 0.995,
      taxCalculationAccuracy: 0.998,
      cashApplicationAutoMatchRate: 0.85,
      disputeResolutionCycleTimeDays: 5,
      collectionEffectivenessIndex: 0.87,
      overallPassRate: 0.92,
    },
    scorerConfig: {
      primary: "billing_accuracy_ground_truth",
      secondary: "tax_compliance_audit_correlation",
      rubric: "rubricScoring",
      taxComplianceCheck: true,
      sox_auditTrailVerification: true,
      amlPatternCheck: true,
      pciDssComplianceCheck: true,
    },
    coverageTags: ["invoice-generation", "tax-calculation", "cash-application", "dunning", "dispute-resolution", "AR-reporting", "multi-currency", "e-invoicing", "early-pay-discount"],
    environmentThresholds: {
      staging: { minPassRate: 0.90 },
      production: { minPassRate: 0.94 },
    },
    schedule: "weekly:Wednesday:06:00 UTC",
    industry: "order_to_cash",
    ontologyTags: ["Invoice Generation", "Tax Calculation", "Cash Application", "Dunning Management", "Dispute Investigation", "AR Reporting"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 11: OUTCOME CONTRACT + 8 KPIS ───────────────────────────────────────
  step("11", "11", "Creating outcome contract + 8 KPIs and linking all to agent");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Billing & Collections Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing OTC-AGT-006. Targets invoice accuracy, cash application automation, DSO reduction, dispute resolution speed, tax compliance, and collection effectiveness across the Order-to-Cash billing and AR function.",
      version: 1,
      status: "active",
      industry: "order_to_cash",
      agentCode: "OTC-AGT-006",
      category: "Financial",
      scenario: "Order to Cash",
      objectives: [
        "Achieve 99.5%+ invoice accuracy rate (invoices without pricing, quantity, or tax errors)",
        "Automate 85%+ of cash application without manual intervention",
        "Maintain DSO at or below 38 days across standard B2B payment terms portfolio",
        "Resolve billing disputes within 5 business days average cycle time",
        "Maintain tax calculation accuracy at 99.8%+ across all jurisdictions",
        "Achieve Collection Effectiveness Index (CEI) of 87%+ monthly",
      ],
      successCriteria: {
        primary: "Invoice accuracy ≥ 99.5% and cash application auto-match rate ≥ 85%",
        secondary: "DSO ≤ 38 days; dispute resolution ≤ 5 days avg; CEI ≥ 87%",
        guardrails: "Zero PCI-DSS violations; zero unauthorized revenue recognition; zero SOX control failures; zero AML escalations not reported within same business day",
      },
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        lookbackWindowDays: 90,
        minimumConfidenceThreshold: 0.80,
      },
      targetMetrics: {
        invoiceAccuracyRate: 0.995,
        cashApplicationAutoMatchRate: 0.85,
        dso: 38,
        disputeResolutionDays: 5,
        taxCalculationAccuracy: 0.998,
        collectionEffectivenessIndex: 0.87,
        dunningResponseRate: 0.62,
        unappliedCashPct: 0.005,
      },
      slaConfig: {
        responseTimeMs: 5000,
        availabilityTarget: 0.999,
        invoiceGenerationWithin: "4h of delivery confirmation",
        cashApplicationCutoff: "same_business_day",
        disputeResponseWithin: "2h of dispute receipt",
        dunningLevel1Within: "3_days_before_due",
      },
      criticalPath: ["delivery_confirmation_intake", "invoice_generation", "tax_calculation", "payment_monitoring", "cash_application", "dunning_sequence", "dispute_investigation", "ar_reporting"],
      roiEstimate: {
        invoiceErrorCostReduction: 275000,
        cashApplicationLaborSavings: 185000,
        dsoImprovementCashflowValue: 420000,
        disputeResolutionSpeedupSavings: 95000,
        collectionRateImprovement: 310000,
        badDebtReduction: 0.18,
      },
    },
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // Link outcome + eval to agent
  await patch(`/api/agents/${ids.agentId}`, {
    outcomeId: ids.outcomeId,
    evalBindings: [ids.evalSuiteId],
  });
  log("Outcome contract linked to agent (agent.outcomeId)");
  log("Eval suite linked to agent (agent.evalBindings)");

  // Ontology tags — dynamically fetched
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));

    // OTC-AGT-006 preferred ontology concepts — financial/billing/AR domain
    // Try known financial OTC IDs first; fallback to any OTC/GS1/ISA financial concepts
    const preferred = [
      "gs1-15",                    // Billing / Invoice (GS1 financial domain)
      "gs1-16",                    // Accounts Receivable
      "gs1-17",                    // Payment Processing
      "gs1-18",                    // Collections
      "isa-30",                    // Financial Management
      "otc-agt006-invoice",        // Invoice entity
    ];

    const tags = [];
    for (const id of preferred) {
      if (byId.has(id)) {
        const c = byId.get(id);
        tags.push({ conceptId: c.id, label: c.label, category: c.category });
      }
    }

    // Fill to 5-6 minimum from OTC/GS1/ISA/financial concepts if preferred missing
    if (tags.length < 5) {
      const used = new Set(tags.map(t => t.conceptId));
      const financialKeywords = ["bill", "invoice", "payment", "ar", "collect", "tax", "cash", "receivable", "financial", "revenue"];
      // First try financial keyword matches
      for (const c of allConcepts) {
        if (tags.length >= 6) break;
        if (used.has(c.id)) continue;
        const labelLower = (c.label || "").toLowerCase();
        if (financialKeywords.some(kw => labelLower.includes(kw))) {
          tags.push({ conceptId: c.id, label: c.label, category: c.category });
          used.add(c.id);
        }
      }
      // Then fill with any OTC/GS1/ISA concepts
      if (tags.length < 5) {
        for (const c of allConcepts.filter(x =>
          ["gs1", "isa", "otc"].some(prefix => x.id.startsWith(prefix)) && !used.has(x.id)
        )) {
          if (tags.length >= 6) break;
          tags.push({ conceptId: c.id, label: c.label, category: c.category });
          used.add(c.id);
        }
      }
    }

    await patch(`/api/agents/${ids.agentId}`, { ontologyTags: tags });
    log(`Ontology tags set (${tags.length}): ${tags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/otc-agt-006-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  OTC-AGT-006 — ALL 11 STEPS COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/otc-agt-006-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  DEV creation failed: ${err.message}`);
  process.exit(1);
});
