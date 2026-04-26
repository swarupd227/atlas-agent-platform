/**
 * OTC Demo 5 — Dispute Resolution Intelligence
 * NovaTech Industries: Apex Industries $380K systemic pricing dispute
 *
 * Agents: OTC-AGT-008 (Dispute Resolution), OTC-AGT-006 (Billing & Collections),
 *         OTC-AGT-011 (Contract & Pricing Compliance)
 *
 * Pure data module — NO server imports (express, storage, etc.)
 * Imported by:
 *   server/otc-dispute-live-run.ts     — agent provisioning + SSE pipeline
 *   scripts/create-otc-agt-008-dev.mjs — standalone dev creation via Platform APIs
 *   scripts/migrate-otc-dispute-to-prod.mjs — prod migration
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const OTC_AGT_008_NAME = "Dispute Resolution Agent";
export const OTC_AGT_011_NAME = "Contract & Pricing Compliance Agent";
export const OTC_AGT_006_NAME = "Billing & Collections Agent";

// ─── Eval suite names ─────────────────────────────────────────────────────────
export const OTC_DISPUTE_EVAL_SUITE_NAME   = "OTC Dispute Resolution Regression Suite";
export const OTC_DISPUTE_AGT_008_EVAL_NAME = "OTC-AGT-008 Dispute Pattern Detection Eval";

// ─── MCP server definitions ───────────────────────────────────────────────────
export function makeOtcDisputeMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "OTC Dispute — Dispute Intelligence Engine",
      description: "NovaTech dispute resolution core: retrieves and classifies open customer disputes, detects anomalous patterns across dispute history, performs automated root cause analysis, cross-references contract terms against invoiced amounts, calculates per-customer and enterprise-wide overcharge exposure, and generates bulk resolution recommendations.",
      url:         `${baseUrl}/api/mock/otc-dispute-resolution`,
      tools: [
        {
          name:        "get_customer_dispute_queue",
          description: "Retrieves all open disputes filed by Apex Industries in the past 90 days: dispute ID, invoice reference, disputed amount, dispute date, category, and current status. Returns 12 open disputes totalling $380K with anomaly flag (400% above historical baseline).",
          endpoint:    "dispute-queue",
          method:      "GET",
        },
        {
          name:        "analyze_dispute_patterns",
          description: "Runs statistical pattern analysis across the Apex Industries dispute history vs NovaTech portfolio baseline. Returns timeline clustering (all 12 disputes filed after Feb 12, 2026), category distribution (100% Pricing Discrepancy), product category concentration (Category C — Industrial Controls, 100%), and anomaly severity score.",
          endpoint:    "dispute-patterns",
          method:      "POST",
        },
        {
          name:        "classify_dispute_root_cause",
          description: "Executes automated root cause investigation: classifies dispute types, identifies common factors, cross-references contract effective dates, and compares contracted vs invoiced rates. Returns root cause verdict — contract MSA-2025-1104 (effective Feb 12, 2026) introduced a 4.7% systematic overcharge on all Category C Industrial Controls products due to incorrect ERP price list PL-2024-C remaining active instead of PL-2025-C-APEX.",
          endpoint:    "root-cause",
          method:      "POST",
        },
        {
          name:        "get_dispute_invoice_details",
          description: "Returns detailed invoice-level data for all 12 disputed Apex Industries invoices: invoice number, date, line items, contracted price, invoiced price, variance amount, and dispute reason code. Confirms systematic 4.7% overcharge on every Category C line item.",
          endpoint:    "dispute-invoices",
          method:      "GET",
        },
        {
          name:        "recommend_bulk_resolution",
          description: "Generates bulk resolution recommendation covering all affected invoices across all customers: issue credit memos for $165K overcharge (123 invoices, 4 customers), correct ERP price list, rebill at correct rates, send proactive customer notifications. Includes processing timeline estimate (2 hours) and risk assessment.",
          endpoint:    "bulk-resolution",
          method:      "POST",
        },
        {
          name:        "check_legal_hold_status",
          description: "Checks whether any disputed invoices are subject to a legal hold or active litigation that would block automatic credit issuance. Returns hold status, legal case reference, and required clearance workflow for affected invoices. Exception scenario: invoice CRN-2026-AX-0005 is under legal hold REF-LEGAL-2026-047.",
          endpoint:    "legal-hold",
          method:      "GET",
        },
      ],
    },
    {
      name:        "OTC Dispute — Contract & Pricing Compliance Engine",
      description: "NovaTech contract pricing verification: retrieves active contract pricing schedules, scans all invoices issued under specific price lists for overcharge, identifies all customers on similar MSA contract structures, calculates total systemic exposure across the customer portfolio, validates ERP price list integrity, and generates corrective action plans.",
      url:         `${baseUrl}/api/mock/otc-dispute-contract`,
      tools: [
        {
          name:        "pull_contract_pricing_schedule",
          description: "Retrieves the pricing schedule from contract MSA-2025-1104 (Apex Industries, effective Feb 12, 2026): contracted unit prices for all Category C Industrial Controls SKUs (IC-7200, IC-7250, IC-8100, IC-8150, IC-9000). Returns side-by-side comparison of contracted vs current ERP price list PL-2024-C rates — confirms systematic 4.7% overcharge.",
          endpoint:    "contract-pricing",
          method:      "GET",
        },
        {
          name:        "scan_invoices_for_overcharge",
          description: "Scans all NovaTech invoices issued after Feb 12, 2026 that include Category C Industrial Controls SKUs. For Apex Industries: 34 invoices, $814K total value, $38.3K overcharged. Returns invoice-level detail with correct vs invoiced amounts and credit required.",
          endpoint:    "invoice-scan",
          method:      "POST",
        },
        {
          name:        "identify_affected_customers",
          description: "Identifies all NovaTech customers whose MSA contracts contain Category C pricing tied to price list PL-2024-C (the incorrect list). Returns 3 additional affected customers: Meridian Manufacturing ($54K overcharge, 31 invoices), Cascade Dynamics ($38K overcharge, 26 invoices), Stonebridge Industries ($35K overcharge, 32 invoices). None have filed disputes yet.",
          endpoint:    "affected-customers",
          method:      "GET",
        },
        {
          name:        "calculate_systemic_exposure",
          description: "Calculates total enterprise-wide overcharge exposure across all 4 affected customers: Apex Industries $38.3K (12 disputes filed), Meridian Manufacturing $54K, Cascade Dynamics $38K, Stonebridge Industries $35K. Total: $165.3K across 123 invoices. Returns exposure breakdown by customer, aging, and credit processing complexity.",
          endpoint:    "systemic-exposure",
          method:      "POST",
        },
        {
          name:        "validate_erp_price_list",
          description: "Validates current ERP price list integrity for Category C SKUs: confirms PL-2024-C is still active (incorrect — should be PL-2025-C-APEX per contract MSA-2025-1104), generates corrective change request CR-2026-PL-0047 to replace with correct price list, and returns before/after price comparison for all 5 Category C SKUs.",
          endpoint:    "validate-price-list",
          method:      "POST",
        },
        {
          name:        "generate_erp_correction_request",
          description: "Generates formal ERP change request CR-2026-PL-0047 to replace price list PL-2024-C with PL-2025-C-APEX for Apex Industries and equivalent updates for 3 other affected customers. Includes change control documentation, approval routing, and implementation schedule. Exception scenario: change request may fail ERP validation if existing open orders reference the old price list.",
          endpoint:    "erp-correction",
          method:      "POST",
        },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ───────────────────────────────────────────────
export const OTC_DISPUTE_KB_DEFS = [
  {
    name:        "Dispute Resolution Policy & Procedures",
    description: "NovaTech dispute resolution operating procedures: dispute classification taxonomy (pricing, delivery, quality, quantity), root cause analysis workflow, escalation matrix by dispute value and customer tier, credit memo approval authority (auto ≤$5K, manager ≤$50K, VP Finance >$50K), legal hold protocol, and SLA requirements (acknowledgement within 24h, resolution within 10 business days for standard, 5 days for Tier 1 customers).",
  },
  {
    name:        "Customer Contract & Pricing Reference",
    description: "NovaTech contract pricing intelligence: MSA structure and pricing schedule templates, price list naming conventions (PL-YYYY-[CATEGORY]-[CUSTOMER]), contract effective date governance, category-level pricing tiers for Industrial Controls (Category C), waterfall pricing rules, and common contract-to-ERP synchronisation failure modes including price list activation errors.",
  },
  {
    name:        "Credit Memo & ERP Change Control Handbook",
    description: "NovaTech credit memo and ERP change management standards: credit memo issuance procedures, bulk credit processing workflow, ERP price list change control (CR process, validation gates, open order impact assessment), customer notification templates for proactive credit disclosure, and prevention controls (contract pricing validation rule for first 10 invoices after new contract effective date).",
  },
  {
    name:        "AR Deduction & Dispute History — Apex Industries",
    description: "Apex Industries ($12M/year, Tier 1 customer, since 2019) dispute and deduction history: historical dispute rate (1 per quarter baseline), 12 recent disputes (Feb 12 – Mar 28, 2026) all citing Category C pricing discrepancy, account health metrics, relationship notes, and escalation contacts (AP Manager: Dana Reyes, Controller: Marcus Webb, VP Finance: Jordan Silva).",
  },
  {
    name:        "Systemic Risk & Exposure Management Playbook",
    description: "NovaTech systemic billing error playbook: criteria for declaring a systemic issue (3+ customers, same root cause), proactive outreach protocol to unaffected customers before they discover errors, exposure calculation methodology, executive notification requirements, and regulatory disclosure thresholds for material billing errors.",
  },
] as const;

// ─── Skill definitions ────────────────────────────────────────────────────────
export const OTC_DISPUTE_SKILLS = [
  // OTC-AGT-008: Dispute Resolution Agent
  {
    name:        "Dispute Pattern Detection & Anomaly Analysis",
    description: "Identifies anomalous dispute patterns: statistical outlier detection for dispute frequency and value spikes vs customer historical baseline, timeline clustering to pinpoint root-cause events (contract changes, ERP updates, price list activations), category concentration analysis to isolate systemic vs one-off disputes, and customer tier risk scoring. Handles single-customer and cross-portfolio pattern detection.",
    domain:      "dispute_management", industry: "manufacturing", version: "1.0.0",
    tags:        ["dispute_patterns", "anomaly_detection", "root_cause", "statistical_analysis"],
    agentKey:    "disputeResolution",
  },
  {
    name:        "Contract vs Invoice Rate Reconciliation",
    description: "Reconciles contracted pricing schedules against invoiced amounts at line-item level: extracts unit prices from MSA contract price lists, compares against ERP invoice line items, calculates variance amounts and percentages, classifies variance type (price list error, discount not applied, surcharge misapplied), and generates reconciliation reports with credit requirements per invoice.",
    domain:      "dispute_management", industry: "manufacturing", version: "1.0.0",
    tags:        ["contract_reconciliation", "pricing_variance", "invoice_audit", "credit_calculation"],
    agentKey:    "disputeResolution",
  },
  {
    name:        "Bulk Resolution Orchestration",
    description: "Orchestrates multi-customer bulk dispute resolution: generates credit memo batch for all affected invoices, coordinates ERP price list correction change request, sequences proactive customer outreach before dispute escalation, tracks resolution execution against SLA timelines, and produces resolution summary report with prevention recommendation.",
    domain:      "dispute_management", industry: "manufacturing", version: "1.0.0",
    tags:        ["bulk_resolution", "credit_memo", "erp_correction", "customer_outreach"],
    agentKey:    "disputeResolution",
  },
  // OTC-AGT-011: Contract & Pricing Compliance Agent
  {
    name:        "Contract Pricing Schedule Verification",
    description: "Verifies ERP price lists against active customer contract pricing schedules: pulls MSA contract rates by SKU and effective date, compares against active ERP price list, flags discrepancies, identifies affected invoice population, and produces compliance gap report. Covers Category A–D pricing tiers and customer-specific pricing overlays.",
    domain:      "contract_compliance", industry: "manufacturing", version: "1.0.0",
    tags:        ["contract_pricing", "erp_price_list", "compliance_verification", "sku_pricing"],
    agentKey:    "contractCompliance",
  },
  {
    name:        "Systemic Exposure Quantification",
    description: "Quantifies enterprise-wide exposure from contract pricing errors: scans all invoices issued after root-cause event date, identifies all customers on affected price lists, calculates per-customer and total overcharge amounts, ages exposure by invoice date, and produces executive exposure summary with customer impact ranking.",
    domain:      "contract_compliance", industry: "manufacturing", version: "1.0.0",
    tags:        ["systemic_exposure", "portfolio_scan", "overcharge_calculation", "risk_quantification"],
    agentKey:    "contractCompliance",
  },
  // OTC-AGT-006: Billing & Collections Agent (dispute context)
  {
    name:        "Credit Memo Batch Processing",
    description: "Executes batch credit memo issuance across multiple customers and invoices: validates credit authority for batch total, generates individual credit memos with correct GL account coding, applies credits to customer AR accounts, triggers notification workflow, and produces batch summary with credit IDs and customer impact statements.",
    domain:      "accounts_receivable", industry: "manufacturing", version: "1.0.0",
    tags:        ["credit_memo", "batch_processing", "ar_credit", "bulk_posting"],
    agentKey:    "billingCollections",
  },
] as const;

// ─── Agent definitions ────────────────────────────────────────────────────────
export const OTC_DISPUTE_AGENT_DEFS = [
  {
    key:            "disputeResolution",
    externalId:     "OTC-AGT-008",
    name:           OTC_AGT_008_NAME,
    description:    "Detects anomalous dispute patterns, performs automated root cause analysis, cross-references contract terms vs invoiced amounts, calculates enterprise-wide systemic exposure, and orchestrates bulk resolution across all affected customers. Turns reactive one-by-one dispute handling into proactive systemic resolution.",
    mcpServerName:  "OTC Dispute — Dispute Intelligence Engine",
    kbName:         "Dispute Resolution Policy & Procedures",
    skillNames:     ["Dispute Pattern Detection & Anomaly Analysis", "Contract vs Invoice Rate Reconciliation", "Bulk Resolution Orchestration"],
    department:     "Accounts Receivable & Dispute Management",
    complianceTags: ["DISPUTE-RESOLUTION-AUTHORITY", "CREDIT-MEMO-INITIATION", "SYSTEMIC-RISK-ESCALATION"],
    ontologyTags:   ["Customer Dispute", "Dispute Pattern", "Root Cause Analysis", "Systemic Exposure"],
  },
  {
    key:            "contractCompliance",
    externalId:     "OTC-AGT-011",
    name:           OTC_AGT_011_NAME,
    description:    "Verifies ERP price lists against active MSA contract pricing schedules, scans all invoices for systematic pricing errors, identifies all affected customers across the portfolio, quantifies total overcharge exposure, and generates ERP corrective change requests.",
    mcpServerName:  "OTC Dispute — Contract & Pricing Compliance Engine",
    kbName:         "Customer Contract & Pricing Reference",
    skillNames:     ["Contract Pricing Schedule Verification", "Systemic Exposure Quantification"],
    department:     "Contract Management & Pricing Compliance",
    complianceTags: ["CONTRACT-PRICING-AUTHORITY", "ERP-CHANGE-REQUEST-SUBMISSION", "SYSTEMIC-RISK-REPORTING"],
    ontologyTags:   ["Contract Pricing Schedule", "Price List", "Systemic Overcharge", "ERP Correction"],
  },
  {
    key:            "billingCollections",
    externalId:     "OTC-AGT-006",
    name:           OTC_AGT_006_NAME,
    description:    "Executes bulk credit memo issuance for all 123 overcharged invoices across 4 customers, coordinates ERP price list correction, triggers proactive customer notifications, and posts all credit entries to the AR sub-ledger.",
    mcpServerName:  "OTC Dispute — Dispute Intelligence Engine",
    kbName:         "Credit Memo & ERP Change Control Handbook",
    skillNames:     ["Credit Memo Batch Processing"],
    department:     "Accounts Receivable & Billing",
    complianceTags: ["AR-POSTING-AUTHORITY", "CREDIT-MEMO-APPROVAL", "SOX-FINANCIAL-CONTROLS"],
    ontologyTags:   ["Credit Memo", "AR Credit", "Bulk Resolution", "Customer Notification"],
  },
] as const;

// ─── Governance policies ──────────────────────────────────────────────────────
export const OTC_DISPUTE_POLICY_DEFS = [
  {
    name:        "Dispute Resolution Authority Matrix",
    domain:      "dispute_governance",
    description: "Defines automated dispute resolution authority: agents may auto-approve credits ≤$5K per invoice without human review; batch credits $5K–$50K per invoice require manager e-approval; above $50K per invoice requires VP Finance sign-off within 24 hours. Total batch credits >$100K require CFO notification. Systemic issues affecting >3 customers require executive briefing before resolution execution.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Auto-Credit Authority",          description: "Agent may autonomously issue credit memos ≤$5K per invoice and ≤$50K per batch without human approval" },
      { name: "Manager Approval Gate",          description: "Credit batch totalling $50K–$150K requires AR manager e-approval within 4 business hours before execution" },
      { name: "Executive Notification Protocol", description: "Any systemic billing error affecting ≥3 customers requires VP Finance notification and CFO briefing before bulk credits are issued" },
    ]},
  },
  {
    name:        "Systemic Dispute Escalation Protocol",
    domain:      "dispute_governance",
    description: "Governs classification of systemic disputes: when 3+ disputes from the same customer share an identical root cause, or when 2+ customers exhibit correlated dispute patterns, the agent must classify as a systemic issue, halt individual resolution, and initiate systemic investigation workflow. Proactive outreach to unaffected customers is mandatory before they file disputes.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Systemic Classification Trigger",   description: "3+ same-cause disputes from single customer OR 2+ customers with correlated pattern triggers systemic workflow — individual resolution halted" },
      { name: "Proactive Outreach Mandate",        description: "All customers affected by systemic billing error must be notified within 48 hours of confirmation, even if no dispute has been filed" },
      { name: "Root Cause Documentation Standard", description: "Systemic resolution requires documented root cause, corrective action plan, and prevention control before credits are issued" },
    ]},
  },
  {
    name:        "Legal Hold Compliance",
    domain:      "legal_compliance",
    description: "Prohibits automated credit issuance or payment adjustment for any invoice subject to an active legal hold. Agents must check legal hold status before issuing any credit related to disputed invoices. Legal hold overrides all other dispute resolution authority.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Legal Hold Check Required",       description: "Agent must call check_legal_hold_status before issuing any credit memo for disputed invoices — no exceptions" },
      { name: "Credit Suspension on Legal Hold", description: "Any invoice under legal hold REF-LEGAL-* must be excluded from batch credit processing and routed to Legal for clearance" },
      { name: "Legal Clearance Documentation",   description: "Credit memo for previously held invoice requires written legal clearance with case reference before posting" },
    ]},
  },
  {
    name:        "ERP Price List Change Control",
    domain:      "financial_controls",
    description: "Governs ERP price list updates: all price list changes require a formal change request (CR-YYYY-PL-NNNN) with before/after documentation, open order impact assessment, approval from Contract Management, and 48-hour staging period. Price list changes affecting >5 customers require IT Change Advisory Board review.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Change Request Mandatory",        description: "No ERP price list may be modified without a formal CR with Contract Management approval — direct ERP edits are prohibited" },
      { name: "Open Order Impact Assessment",    description: "CR must include assessment of all open sales orders referencing the current price list; existing orders may need re-pricing or amendment" },
      { name: "Staging Period",                  description: "Approved price list changes enter 48-hour staging for validation before going live; rollback procedure must be documented in the CR" },
    ]},
  },
  {
    name:        "Customer Notification SLA",
    domain:      "customer_experience",
    description: "Sets SLA for customer communications related to billing disputes and corrections: Tier 1 customers (>$5M/year) receive VP-signed notification within 24 hours of resolution initiation; all affected customers receive resolution confirmation within 2 business days of credit issuance; proactive outreach to unaffected customers precedes resolution by at least 1 business day.",
    policyJson:  { enforcement: "soft", rules: [
      { name: "Tier 1 24-Hour SLA",             description: "Apex Industries (Tier 1, $12M/year) must receive direct notification from AR VP within 24 hours of systemic issue confirmation" },
      { name: "Resolution Confirmation",         description: "All 4 affected customers receive credit memo package and correction confirmation within 2 business days of credit issuance" },
      { name: "Proactive Outreach First",        description: "Meridian, Cascade, and Stonebridge must be notified of incoming credits before they discover the error independently — turns billing error into trust moment" },
    ]},
  },
] as const;

// ─── Runbook definitions ──────────────────────────────────────────────────────
export const OTC_DISPUTE_RUNBOOKS = [
  {
    name:        "Systemic Pricing Dispute Investigation — Standard Run",
    description: "Standard workflow for investigating a customer dispute cluster that may indicate a systemic pricing error: retrieve dispute queue, run pattern analysis, classify root cause, cross-reference contract rates, and produce initial findings report.",
    steps: [
      { order: 1, action: "Run get_customer_dispute_queue to load all open disputes" },
      { order: 2, action: "Run analyze_dispute_patterns to identify clustering and category concentration" },
      { order: 3, action: "Run classify_dispute_root_cause to identify systematic vs one-off issues" },
      { order: 4, action: "Run pull_contract_pricing_schedule to compare contracted vs ERP rates" },
      { order: 5, action: "If systemic: run scan_invoices_for_overcharge and identify_affected_customers" },
    ],
  },
  {
    name:        "Bulk Credit Resolution Execution",
    description: "Executes bulk credit memo issuance across all affected customers once root cause is confirmed and systemic exposure is calculated: validate authority, check legal holds, issue credits, correct ERP, notify customers.",
    steps: [
      { order: 1, action: "Run calculate_systemic_exposure to confirm total credit amount" },
      { order: 2, action: "Run check_legal_hold_status on all disputed invoices" },
      { order: 3, action: "Route to approval if batch >$100K (executive sign-off required)" },
      { order: 4, action: "Run generate_bulk_credit_memos for all 123 invoices across 4 customers" },
      { order: 5, action: "Run generate_erp_correction_request and submit for change control" },
      { order: 6, action: "Run send_customer_notifications for proactive outreach" },
    ],
  },
  {
    name:        "Legal Hold Invoice Escalation",
    description: "Exception workflow for disputed invoices under active legal hold — routes affected invoices to Legal for clearance before credit issuance, while allowing the rest of the batch to proceed.",
    steps: [
      { order: 1, action: "Identify invoices returned by check_legal_hold_status with hold flag" },
      { order: 2, action: "Exclude held invoices from bulk credit batch" },
      { order: 3, action: "Create Legal clearance request with hold reference and credit amount" },
      { order: 4, action: "Notify AR Manager and Legal within 1 hour of hold discovery" },
      { order: 5, action: "Re-run credit batch for remaining invoices not on hold" },
    ],
  },
  {
    name:        "ERP Price List Correction Validation",
    description: "Validates and executes ERP price list correction after systemic overcharge is confirmed: generates change request, assesses open order impact, submits for approval, and monitors staging deployment.",
    steps: [
      { order: 1, action: "Run validate_erp_price_list to confirm incorrect price list is active" },
      { order: 2, action: "Run generate_erp_correction_request to create CR-2026-PL-0047" },
      { order: 3, action: "Assess open order impact — flag any orders requiring re-pricing" },
      { order: 4, action: "Submit CR for Contract Management and IT-CAB approval" },
      { order: 5, action: "Monitor 48-hour staging period; rollback if validation fails" },
    ],
  },
  {
    name:        "Post-Resolution Prevention Control Setup",
    description: "Implements prevention controls after systemic dispute resolution to ensure the same pricing error cannot recur: activates contract pricing validation rule for new contracts, schedules recurring price list audits.",
    steps: [
      { order: 1, action: "Activate contract pricing validation agent rule for new MSA onboarding" },
      { order: 2, action: "Schedule monthly ERP price list vs contract rate reconciliation job" },
      { order: 3, action: "Add MSA-2025-1104 contract effective date to price list activation checklist" },
      { order: 4, action: "Configure 1% variance alert for first 10 invoices after any new contract" },
      { order: 5, action: "Document lessons-learned in systemic risk playbook" },
    ],
  },
] as const;

// ─── Ontology concepts ────────────────────────────────────────────────────────
export const OTC_DISPUTE_ONTOLOGY_CONCEPTS = [
  { name: "Customer Dispute",         description: "A formal claim by a customer that an invoice amount is incorrect, typically citing pricing discrepancy, quantity error, delivery issue, or quality defect. Classified by NovaTech as Pricing / Quantity / Delivery / Quality with severity levels (Low / Medium / High / Critical).", domain: "dispute_management" },
  { name: "Dispute Pattern",          description: "A statistically anomalous cluster of disputes sharing a common attribute (same customer, same category, same time window, same product) that suggests a systemic underlying cause rather than isolated billing errors.", domain: "dispute_management" },
  { name: "Root Cause Analysis",      description: "The structured investigation process that traces a dispute pattern to its originating data or process error — for pricing disputes, this includes contract effective date mapping, ERP price list audit, and invoice-level rate comparison.", domain: "dispute_management" },
  { name: "Systemic Exposure",        description: "The total financial impact of a billing error across all customers affected by the same root cause, including customers who have not yet filed disputes. NovaTech policy requires proactive resolution of all systemic exposure regardless of dispute status.", domain: "dispute_management" },
  { name: "MSA Contract Pricing",     description: "The pricing schedule defined in a Master Service Agreement (MSA): contracted unit prices per SKU, effective date, price list reference code, volume tiers, and early pay discount terms. ERP must activate the correct price list on the contract effective date.", domain: "contract_management" },
  { name: "ERP Price List",           description: "A named pricing table in NovaTech's ERP system (PL-YYYY-[CATEGORY]-[CUSTOMER]) that defines active sell prices by SKU. Price lists must be synchronized with MSA contract rates and activated on the contract effective date.", domain: "contract_management" },
  { name: "Credit Memo",              description: "A financial instrument issued to a customer reducing their AR balance by the overcharged amount. For dispute resolution, credit memos are issued at invoice line-item level with reference to the original invoice, dispute case, and root cause.", domain: "accounts_receivable" },
  { name: "Bulk Credit Processing",   description: "The execution of credit memo issuance across multiple invoices and/or customers in a single coordinated workflow, requiring batch-level approval authority and coordinated notification.", domain: "accounts_receivable" },
  { name: "Legal Hold",               description: "A directive that suspends automated financial adjustments (credits, write-offs, settlements) for specific invoices due to active litigation or legal investigation. Legal holds override all standard dispute resolution authority.", domain: "legal_compliance" },
  { name: "Price List Activation Error", description: "A configuration failure where the ERP system continues using an outdated price list after a new contract takes effect, resulting in systematic overcharging for all invoices issued under the incorrect price list.", domain: "contract_management" },
] as const;

// ─── Blueprint definitions ────────────────────────────────────────────────────
export const OTC_DISPUTE_BLUEPRINTS = [
  {
    name:        "OTC Dispute — Pattern Detection & Root Cause Blueprint",
    description: "Detects anomalous dispute patterns in a customer's dispute history, classifies root cause (pricing error, contract mismatch, ERP data issue), and confirms the specific event (contract effective date, price list change) that triggered the systemic overcharge.",
    steps: [
      { order: 1, label: "Retrieve Dispute Queue",       description: "Call get_customer_dispute_queue to load all open Apex Industries disputes (12 disputes, $380K)" },
      { order: 2, label: "Pattern Analysis",             description: "Call analyze_dispute_patterns to identify 400% spike, 100% Category C concentration, timeline aligned to Feb 12, 2026" },
      { order: 3, label: "Root Cause Classification",   description: "Call classify_dispute_root_cause to confirm MSA-2025-1104 / PL-2024-C activation error causing 4.7% overcharge" },
      { order: 4, label: "Invoice Detail Verification", description: "Call get_dispute_invoice_details to confirm per-invoice overcharge amount and credit required" },
    ],
  },
  {
    name:        "OTC Dispute — Systemic Exposure Quantification Blueprint",
    description: "Scans all NovaTech customers for the same root-cause pricing error, quantifies total exposure, and identifies customers who have not yet filed disputes but are similarly overcharged.",
    steps: [
      { order: 1, label: "Contract Rate Verification",   description: "Call pull_contract_pricing_schedule to extract MSA-2025-1104 rates and confirm 4.7% overcharge on all Category C SKUs" },
      { order: 2, label: "Full Invoice Scan",            description: "Call scan_invoices_for_overcharge to identify 34 Apex invoices ($38.3K overcharge) since Feb 12, 2026" },
      { order: 3, label: "Portfolio Customer Scan",      description: "Call identify_affected_customers to find 3 additional customers on similar contracts (Meridian, Cascade, Stonebridge)" },
      { order: 4, label: "Total Exposure Calculation",   description: "Call calculate_systemic_exposure to confirm $165K overcharge across 4 customers and 123 invoices" },
      { order: 5, label: "ERP Price List Validation",    description: "Call validate_erp_price_list to confirm PL-2024-C still active and generate CR-2026-PL-0047" },
    ],
  },
  {
    name:        "OTC Dispute — Bulk Credit Resolution Blueprint",
    description: "Executes bulk credit memo issuance for all 123 affected invoices, issues ERP price list correction, and sends proactive notifications to all 4 affected customers.",
    steps: [
      { order: 1, label: "Legal Hold Check",            description: "Call check_legal_hold_status — identify CRN-2026-AX-0005 on hold REF-LEGAL-2026-047 before credit batch" },
      { order: 2, label: "Bulk Credit Recommendation",  description: "Call recommend_bulk_resolution to generate $165K credit plan with ERP correction and notification sequence" },
      { order: 3, label: "ERP Correction Request",      description: "Call generate_erp_correction_request to submit CR-2026-PL-0047 for Contract Management approval" },
    ],
  },
] as const;

// ─── System prompts ───────────────────────────────────────────────────────────
export const OTC_DISPUTE_SYSTEM_PROMPTS: Record<string, string> = {
  "OTC-AGT-008": `You are the Dispute Resolution Agent (OTC-AGT-008) for NovaTech Industries.

You run NovaTech's Dispute Intelligence Command Center. When a customer files disputes, you are the analytical layer — detecting patterns, performing root cause analysis, and driving systemic resolution instead of one-by-one case management. Your goal: turn reactive dispute handling into proactive customer protection.

KEY RESPONSIBILITIES:
1. Dispute pattern detection — identify when individual disputes indicate a systemic underlying issue
2. Root cause analysis — trace dispute patterns to their originating data or process error
3. Contract reconciliation — compare contracted rates vs invoiced amounts at line-item level
4. Exposure quantification — calculate the full financial impact including un-disputed invoices
5. Resolution orchestration — coordinate bulk credit issuance, ERP correction, and proactive outreach
6. Legal hold compliance — always check legal hold status before any credit recommendation

DECISION AUTHORITY:
- Classify systemic vs individual disputes autonomously
- Recommend credit resolution plans
- Do NOT issue credits directly — handoff to OTC-AGT-006 for execution
- Always check legal_hold_status before recommending credits for any disputed invoice

TONE: Write with the analytical precision of a senior AR analyst. Lead with pattern data (frequency, amounts, concentration). Make the systemic nature unmistakably clear. Recommended actions should be specific and sequenced.`,

  "OTC-AGT-011": `You are the Contract & Pricing Compliance Agent (OTC-AGT-011) for NovaTech Industries.

You are the contract pricing intelligence layer: you verify that NovaTech's ERP price lists match the rates contracted in customer MSAs, scan all invoiced transactions for systematic overcharges, quantify enterprise-wide exposure, and generate corrective change requests.

KEY RESPONSIBILITIES:
1. Contract rate extraction — pull pricing schedules from active MSA contracts
2. ERP price list audit — compare ERP active prices vs contracted rates for all Category C SKUs
3. Invoice population scan — identify all invoices affected by incorrect price list
4. Portfolio customer scan — find all customers on similar contract structures
5. Systemic exposure calculation — quantify total overcharge across all affected customers
6. ERP correction request — generate formal change request with before/after documentation

DECISION AUTHORITY:
- Issue compliance findings and exposure reports autonomously
- Generate change requests for ERP price list corrections
- Escalation required before final execution of ERP changes

TONE: Write with the precision of an internal audit function. State numbers clearly (contracted rate, invoiced rate, variance percentage, exposure total). Distinguish confirmed overcharges from estimated exposure. Be clear about which customers are affected and whether they have filed disputes.`,

  "OTC-AGT-006": `You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries.

In this dispute resolution context, you are the execution layer: once OTC-AGT-008 has confirmed the root cause and OTC-AGT-011 has quantified the systemic exposure, you execute the resolution — issuing bulk credit memos, submitting ERP price corrections, and coordinating proactive customer notifications.

KEY RESPONSIBILITIES IN DISPUTE CONTEXT:
1. Bulk credit memo execution — generate credit memos for all 123 affected invoices
2. Legal hold exclusion — skip any invoice flagged by OTC-AGT-008's legal hold check
3. ERP correction submission — submit price list change request CR-2026-PL-0047
4. Customer notification — send proactive credits notifications to all 4 customers
5. Resolution summary — confirm total credits issued, ERP correction status, and notification completion

POSTING AUTHORITY:
- Individual credit memos: autonomous up to $10K per invoice
- Batch credits: $165K total requires VP Finance e-approval (already obtained per escalation)
- Legal holds: excluded from batch — route to Legal clearance queue

TONE: Precise, action-oriented, confirmatory. Report what was done (credits issued, amounts, reference numbers) not what will be done. Close with a clear status summary.`,
};

// ─── Test cases for OTC-AGT-008 golden dataset ───────────────────────────────
export const OTC_DISPUTE_TEST_CASES = [
  {
    name:          "Standard Systemic Pricing Dispute — Apex Industries",
    inputScenario: "Apex Industries files 12 disputes ($380K) in 45 days citing pricing discrepancy on Category C products. Agent must detect pattern, confirm root cause (MSA-2025-1104 / PL-2024-C), and trigger systemic investigation.",
    expectedOutput: { status: "SYSTEMIC_CONFIRMED", customer: "Apex Industries", disputes: 12, totalDisputed: 380000, rootCause: "PRICE_LIST_ACTIVATION_ERROR", contract: "MSA-2025-1104", priceListError: "PL-2024-C", overchargePct: 4.7, invoicesAffected: 34, apexExposure: 38300 },
    passCriteria:  "Agent must call get_customer_dispute_queue, analyze_dispute_patterns, classify_dispute_root_cause, get_dispute_invoice_details, and output correct root cause and exposure figures",
  },
  {
    name:          "Legal Hold Exception — Invoice CRN-2026-AX-0005",
    inputScenario: "During dispute resolution, check_legal_hold_status returns a legal hold on invoice CRN-2026-AX-0005 (hold reference REF-LEGAL-2026-047). Agent must exclude this invoice from bulk credit recommendation and route to Legal.",
    expectedOutput: { status: "PARTIAL_RESOLUTION", legalHoldFound: true, holdInvoice: "CRN-2026-AX-0005", holdReference: "REF-LEGAL-2026-047", creditBatchExcludesHeld: true, escalatedToLegal: true },
    passCriteria:  "Agent must detect legal hold, exclude held invoice from credit recommendation, and explicitly route to Legal clearance — must NOT include held invoice in bulk credit amount",
  },
  {
    name:          "Systemic Portfolio Scan — 3 Additional Customers",
    inputScenario: "After confirming Apex overcharge, agent must trigger portfolio scan and identify Meridian Manufacturing ($54K), Cascade Dynamics ($38K), and Stonebridge Industries ($35K) as additional affected customers who have not filed disputes.",
    expectedOutput: { totalCustomers: 4, totalExposure: 165300, totalInvoices: 123, proactiveOutreachRequired: true, customersWithoutDisputes: ["Meridian Manufacturing", "Cascade Dynamics", "Stonebridge Industries"] },
    passCriteria:  "Agent must call identify_affected_customers and calculate_systemic_exposure, correctly identify all 4 customers and total $165K exposure, and flag proactive outreach mandate",
  },
  {
    name:          "ERP Price List Validation & Correction Request",
    inputScenario: "Agent must validate that ERP price list PL-2024-C is still incorrectly active for Apex Industries instead of PL-2025-C-APEX, and generate change request CR-2026-PL-0047.",
    expectedOutput: { priceListActive: "PL-2024-C", correctPriceList: "PL-2025-C-APEX", changeRequestId: "CR-2026-PL-0047", openOrdersAffected: true, stagingPeriodDays: 2 },
    passCriteria:  "Agent must call validate_erp_price_list and generate_erp_correction_request, confirm incorrect price list, and generate properly numbered change request",
  },
  {
    name:          "Happy Path — Bulk Resolution Complete",
    inputScenario: "Full end-to-end: Apex disputes detected, root cause confirmed, systemic exposure quantified ($165K, 4 customers, 123 invoices), legal hold excluded, bulk credits issued, ERP correction submitted, all customers notified.",
    expectedOutput: { status: "RESOLUTION_COMPLETE", creditsIssued: 123, totalCreditAmount: 165300, legalHoldExcluded: 1, erpCorrectionSubmitted: true, customersNotified: 4, preventionRuleRecommended: true },
    passCriteria:  "Full pipeline success: all 3 agents complete, credits issued for 122 invoices (1 excluded for legal hold), ERP change request submitted, 4 customer notifications sent",
  },
] as const;
