/**
 * OTC Cash Application Demo 4 — AI-Powered Cash Application
 * Shared platform intelligence definitions.
 *
 * Pure data module — NO server imports (express, storage, etc.).
 * Imported by:
 *   server/otc-cash-application-live-run.ts  — to provision dev agents at startup
 *   scripts/create-otc-agt-009-dev.js         — standalone dev creation via Platform APIs
 *   scripts/migrate-otc-cash-to-prod.sh       — prod migration
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const OTC_AGT_009_NAME = "Cash Application & Reconciliation Agent";
export const OTC_AGT_006_NAME = "Billing & Collections Agent";

// ─── Eval suite name ─────────────────────────────────────────────────────────
export const OTC_CASH_EVAL_SUITE_NAME = "OTC Cash Application Regression Suite";

// ─── MCP server definitions ───────────────────────────────────────────────────
export function makeOtcCashMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "OTC Cash — Payment Matching Engine",
      description: "NovaTech Cash Application core: ingests multi-channel payment batches (wire/ACH/check/EDI 820), runs intelligent invoice auto-matching at 94%+ rates, identifies and prioritises exceptions by complexity, parses EDI 820 remittances, matches complex multi-invoice payments, analyses deductions, validates deduction legitimacy, and applies payment resolutions.",
      url:         `${baseUrl}/api/mock/otc-cash-payment-engine`,
      tools: [
        { name: "ingest_daily_payment_batch",  description: "Ingests all month-end payments received: 387 transactions totalling $42.3M across wire, ACH, check, and EDI 820 channels. Returns channel breakdown, payment source counts, and total batch summary.", endpoint: "ingest-payment-batch",   method: "GET"  },
        { name: "run_auto_matching",           description: "Runs NovaTech's intelligent invoice auto-matching algorithm against the ingested payment batch. Returns 94.1% match rate ($39.8M matched), funnel breakdown (Perfect Match / High-Confidence / Low-Confidence / Unmatched), and exception count.", endpoint: "run-auto-matching",     method: "POST" },
        { name: "identify_exceptions",         description: "Returns the prioritised exception queue sorted by value and complexity: GlobalTech Corp ($2.3M, HIGH COMPLEXITY), Vertex Systems ($487K, reference mismatch), Regional Supply Co ($127K, no remittance). Each includes AI-suggested resolution and confidence.", endpoint: "identify-exceptions",   method: "GET"  },
        { name: "get_bank_reconciliation",     description: "Returns current month-end bank reconciliation status: 98.7% matched, 4 timing differences ($23K), 1 error ($1.2K under investigation). Includes reconciliation progress bar and outstanding items detail.", endpoint: "bank-reconciliation",  method: "GET"  },
        { name: "parse_edi_remittance",        description: "Parses the EDI 820 remittance file attached to GlobalTech Corp wire #WF-20260328-7742 ($2,300,847). Returns structured remittance data: 47 invoice references, 3 deduction codes, overpayment amount, and remittance completeness score.", endpoint: "parse-edi-remittance", method: "POST" },
        { name: "match_payment_to_invoices",   description: "Runs deep invoice matching for GlobalTech $2,300,847 payment against 47 open invoices. Returns match waterfall: $2,312,847 matched across all 47 invoices at 99.2% confidence. Also surfaces deduction and overpayment breakdown.", endpoint: "match-invoices",       method: "POST" },
        { name: "analyze_deductions",          description: "Analyses the 3 deductions claimed in GlobalTech remittance: (1) Freight claim -$28,500 code FRGT-DMG, (2) Early pay discount -$14,200 code EPD-2PCT, (3) Quantity short -$7,400 code QTY-SHT. Returns deduction details, supporting evidence references, and preliminary validity flags.", endpoint: "analyze-deductions",   method: "POST" },
        { name: "validate_deduction_details",  description: "Validates each deduction against NovaTech policy matrix and available evidence: freight claim VALID (POD shows damage), early pay discount VALID (payment Day 9, within 10-day window), quantity short INVESTIGATE (delivery receipt discrepancy). Returns confidence scores and recommended actions.", endpoint: "validate-deductions",  method: "POST" },
        { name: "apply_payment_resolution",    description: "Prepares the complete GlobalTech payment resolution package: apply $2,262,747 to 47 invoices (all closed), accept 2 deductions ($42,700), flag 1 for investigation ($7,400), apply $38,100 overpayment as credit. Returns resolution summary and AR impact.", endpoint: "apply-resolution",     method: "POST" },
        { name: "get_vertex_payment",          description: "Retrieves Vertex Systems ACH payment details (ACH-2026-0328-0447, $487,200). Payment flagged as exception due to reference mismatch — ACH memo field 'VS-2026-MAR' does not match any open invoice. Returns payment details and full open AR listing (7 invoices, $512.8K total).", endpoint: "vertex-get-payment",     method: "GET"  },
        { name: "run_fuzzy_match",             description: "Runs PO cross-reference fuzzy matching for Vertex Systems $487,200 ACH. Cross-references customer PO month codes against open AR — identifies INV-47210 through INV-47214 as matching ($487,200 exact). Returns match confidence (91%), matched invoices, and auto-confirm availability.", endpoint: "vertex-fuzzy-match",     method: "POST" },
        { name: "confirm_vertex_resolution",   description: "Confirms the Vertex Systems fuzzy match resolution: $487,200 matched to INV-47210 through INV-47214 at 91% confidence. Packages resolution for one-click AR supervisor confirmation.", endpoint: "vertex-confirm-resolution", method: "POST" },
        { name: "get_regional_payment",        description: "Retrieves Regional Supply Co check details (CHK-2026-77421, $127,000). No remittance stub. Returns customer's 8 open invoices ($143.2K total), payment history showing 43% remittance provision rate, and exception detail.", endpoint: "regional-get-payment",   method: "GET"  },
        { name: "suggest_payment_allocation",  description: "Analyses Regional Supply Co open invoices and proposes oldest-first allocation for $127,000 check: INV-45901 ($52,400) → INV-45902 ($37,000) → INV-46011 ($24,800) → INV-46102 (partial $9,100). Returns allocation plan, aging impact, and recommended action (PROVISIONAL_APPLY + CHASE_CUSTOMER).", endpoint: "regional-suggest-allocation", method: "POST" },
      ],
    },
    {
      name:        "OTC Cash — AR & Billing Engine",
      description: "NovaTech AR and Billing management: validates deductions against policy matrix, posts AR journal entries, generates credit memos, closes paid invoice batches, calculates AR aging impact, and provides customer AR summaries for post-cash-application reporting.",
      url:         `${baseUrl}/api/mock/otc-cash-ar-posting`,
      tools: [
        { name: "validate_deduction_against_policy", description: "Cross-references deduction claim against NovaTech's deduction policy matrix: checks freight claim authority (auto-approve ≤$50K with POD), early pay discount validity (contract terms verification), and short-ship policy (delivery receipt vs WMS count comparison). Returns policy ruling and required documentation.", endpoint: "validate-policy",     method: "POST" },
        { name: "post_ar_entries",                   description: "Posts journal entries to NovaTech's AR sub-ledger for the GlobalTech payment: debits Cash $2,262,747, credits AR 47 invoices. Also posts deduction entries ($42,700 to freight/discount GL accounts) and credit memo ($38,100). Returns posting confirmation with journal entry references.", endpoint: "post-ar-entries",    method: "POST" },
        { name: "generate_credit_memo",              description: "Generates credit memo CM-2026-0328-GT for GlobalTech Corp: $38,100 overpayment credit, applied to customer account CUST-GTECH-001, available against future invoices. Returns credit memo ID, amount, and application instructions.", endpoint: "generate-credit-memo", method: "POST" },
        { name: "close_invoice_batch",               description: "Marks all 47 GlobalTech invoices as CLOSED-PAID in NovaTech's ERP: updates AR aging, triggers revenue recognition confirmation, and updates customer account balance from $3.1M to $0.73M. Returns closed invoice count and updated balance.", endpoint: "close-invoices",      method: "POST" },
        { name: "get_ar_aging_impact",               description: "Calculates the AR aging impact of the GlobalTech payment application: GlobalTech balance reduces from $3,100,000 to $730,000. Returns updated aging buckets (Current/30/60/90 days) and DSO improvement estimate.", endpoint: "ar-aging-impact",     method: "GET"  },
        { name: "get_customer_ar_summary",           description: "Returns GlobalTech Corp's full AR summary post-payment: remaining open balance $730K (3 recent invoices), payment history (on-time rate 94%), credit status GOOD, deduction history and dispute resolution rate.", endpoint: "customer-ar-summary", method: "GET"  },
        { name: "post_vertex_payment",               description: "Posts confirmed Vertex Systems ACH $487,200 (ACH-2026-0328-0447) to AR sub-ledger: closes 5 matched invoices (INV-47210–47214), reduces Vertex AR from $512,800 to $25,600. Requires prior match confirmation. Returns posting ID, journal entry, and updated balance.", endpoint: "vertex-post-payment", method: "POST" },
        { name: "initiate_remittance_chase",         description: "Initiates automated remittance chase workflow for Regional Supply Co check CHK-2026-77421 ($127,000 — no remittance). Sends chase notification via email and customer portal to AP Manager and Controller requesting remittance details. Returns chase ID, contacts notified, and response deadline.", endpoint: "regional-initiate-chase", method: "POST" },
        { name: "post_provisional_ar",              description: "Posts provisional AR entry for Regional Supply Co $127,000 check to oldest-first invoices: closes INV-45901 ($52,400), INV-45902 ($37,000), INV-46011 ($24,800) — clears 30-day aging bucket. Flags as provisional pending customer remittance confirmation. Returns posting ID, invoices affected, and aging impact.", endpoint: "regional-post-provisional", method: "POST" },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ───────────────────────────────────────────────
export const OTC_CASH_KB_DEFS = [
  {
    name:        "Cash Application & Deduction Policy Handbook",
    description: "NovaTech cash application operating procedures: payment channel processing rules (wire/ACH/check/EDI), auto-match algorithm thresholds and confidence scoring, deduction code library with validity criteria, overpayment handling policy, exception escalation matrix, and month-end close checklist.",
  },
  {
    name:        "Customer Remittance & Billing Reference",
    description: "NovaTech customer remittance intelligence: EDI 820 parsing rules, PDF remittance extraction templates, customer-specific remittance formats for top-100 accounts, early pay discount terms by customer tier, freight claim authority matrix, and common deduction code meanings with supporting documentation requirements.",
  },
  {
    name:        "Bank Reconciliation & AR Closing Standards",
    description: "NovaTech month-end AR closing procedures: bank reconciliation methodology, timing difference identification and resolution, GL posting rules for cash receipts and deductions, credit memo approval authority, AR aging recalculation triggers, and ASC 606 revenue recognition confirmation requirements.",
  },
] as const;

// ─── Skill definitions ────────────────────────────────────────────────────────
export const OTC_CASH_SKILLS = [
  // OTC-AGT-009: Cash Application & Reconciliation Agent
  {
    name:        "Intelligent Payment Matching",
    description: "Applies NovaTech's multi-signal matching algorithm to achieve 94%+ auto-match rates: exact invoice reference match, customer PO cross-reference, amount tolerance matching (±$10), fuzzy customer name matching, and historical payment pattern inference. Handles wire, ACH, check, and EDI 820 channels.",
    domain:      "cash_application", industry: "manufacturing", version: "1.0.0",
    tags:        ["auto_matching", "payment_processing", "invoice_matching", "remittance"],
    agentKey:    "cashApplication",
  },
  {
    name:        "Remittance Parsing & Extraction",
    description: "Parses multi-format remittance advice: EDI 820 transaction sets, PDF check stubs, email body remittances, and bank wire reference fields. Extracts invoice references, deduction codes, overpayment amounts, and payment allocation instructions. Handles complex multi-invoice remittances like GlobalTech's 47-invoice EDI 820.",
    domain:      "cash_application", industry: "manufacturing", version: "1.0.0",
    tags:        ["edi_820", "remittance_parsing", "extraction", "deduction_codes"],
    agentKey:    "cashApplication",
  },
  {
    name:        "Deduction Classification & Validity Assessment",
    description: "Classifies inbound deductions by type (freight claim, early pay discount, quantity short, pricing dispute, returns) and assesses validity against NovaTech's deduction policy matrix. Cross-references carrier PODs, delivery receipts, payment terms, and WMS shipment records to produce validity rulings and recommended actions.",
    domain:      "cash_application", industry: "manufacturing", version: "1.0.0",
    tags:        ["deduction_management", "validity_assessment", "freight_claims", "early_pay_discount"],
    agentKey:    "cashApplication",
  },

  // OTC-AGT-006: Billing & Collections Agent
  {
    name:        "AR Posting & Invoice Closure",
    description: "Executes journal entry posting for cash receipts: debits Cash/Bank, credits AR sub-ledger at invoice level, posts deduction entries to appropriate GL accounts, generates credit memos for overpayments, and triggers batch invoice closure with ERP status updates. Ensures ASC 606 revenue recognition accuracy.",
    domain:      "accounts_receivable", industry: "manufacturing", version: "1.0.0",
    tags:        ["ar_posting", "journal_entries", "invoice_closure", "asc_606"],
    agentKey:    "billingCollections",
  },
  {
    name:        "Collections Dunning Management",
    description: "Manages NovaTech's AR aging and automated dunning sequences: identifies overdue accounts by aging bucket, selects tier-appropriate dunning templates (friendly reminder / firm notice / final demand / legal referral), executes multi-channel outreach (email/phone/portal), and tracks response and payment commitments.",
    domain:      "accounts_receivable", industry: "manufacturing", version: "1.0.0",
    tags:        ["collections", "dunning", "ar_aging", "overdue_management"],
    agentKey:    "billingCollections",
  },
  {
    name:        "Invoice Generation & Tax Application",
    description: "Generates accurate customer invoices upon delivery confirmation: applies contract pricing, calculates applicable sales tax and VAT by jurisdiction, applies early pay discount terms, generates PDF invoice with required fields, and transmits via customer-preferred channel (EDI 810, email, portal).",
    domain:      "billing_operations", industry: "manufacturing", version: "1.0.0",
    tags:        ["invoice_generation", "tax_calculation", "edi_810", "billing"],
    agentKey:    "billingCollections",
  },
] as const;

// ─── Agent definitions ────────────────────────────────────────────────────────
export const OTC_CASH_AGENT_DEFS = [
  {
    key:            "cashApplication",
    externalId:     "OTC-AGT-009",
    name:           OTC_AGT_009_NAME,
    description:    "Automates NovaTech's month-end cash application cycle: ingests $42M+ in multi-channel payments, achieves 94%+ auto-match rates using intelligent remittance parsing and invoice matching, classifies and validates deductions, resolves complex cross-invoice remittances (like GlobalTech's 47-invoice EDI 820), and prepares one-click payment resolution packages for the treasury team.",
    mcpServerName:  "OTC Cash — Payment Matching Engine",
    kbName:         "Cash Application & Deduction Policy Handbook",
    skillNames:     ["Intelligent Payment Matching", "Remittance Parsing & Extraction", "Deduction Classification & Validity Assessment"],
    department:     "Treasury & Cash Management",
    complianceTags: ["CASH-APP-AUTHORITY", "DEDUCTION-VALIDATION-PROTOCOL", "MONTH-END-CLOSE-SOX"],
    ontologyTags:   ["Payment Batch", "Invoice Matching", "Deduction Code", "Remittance Advice"],
  },
  {
    key:            "billingCollections",
    externalId:     "OTC-AGT-006",
    name:           OTC_AGT_006_NAME,
    description:    "Manages NovaTech's AR sub-ledger post-cash-application: validates deductions against policy matrix, posts cash receipt journal entries, generates credit memos for overpayments, closes paid invoice batches, monitors AR aging, and executes automated dunning sequences for overdue accounts.",
    mcpServerName:  "OTC Cash — AR & Billing Engine",
    kbName:         "Bank Reconciliation & AR Closing Standards",
    skillNames:     ["AR Posting & Invoice Closure", "Collections Dunning Management", "Invoice Generation & Tax Application"],
    department:     "Accounts Receivable & Billing",
    complianceTags: ["AR-POSTING-AUTHORITY", "CREDIT-MEMO-APPROVAL", "SOX-FINANCIAL-CONTROLS"],
    ontologyTags:   ["AR Journal Entry", "Invoice Closure", "Credit Memo", "AR Aging"],
  },
] as const;

// ─── Governance policies ──────────────────────────────────────────────────────
export const OTC_CASH_POLICY_DEFS = [
  {
    name:        "Cash Application Authority Matrix",
    domain:      "treasury_governance",
    description: "Defines automated cash application authority: agents may auto-match and post payments up to $5M per batch without controller approval. Complex payments above $1M with deductions require agent analysis before human one-click approval. Unidentified payments above $50K require manual research.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Auto-Match Posting Authority",     description: "Payments with ≥95% match confidence may be auto-posted without human review; 80–95% requires one-click confirmation; <80% routes to exception queue" },
      { name: "Deduction Auto-Approve Threshold", description: "Valid deductions ≤$50K with supporting documentation may be auto-approved; above $50K requires controller sign-off within 24 hours" },
      { name: "Complex Payment Human Gate",       description: "Payments covering >20 invoices or containing deductions >$25K require agent analysis presented to treasury controller before final posting" },
    ]},
  },
  {
    name:        "Deduction Validity Protocol",
    domain:      "treasury_governance",
    description: "Governs deduction claim validation: agents must cross-reference freight claims against carrier PODs, early pay discounts against contract payment terms, and quantity shorts against WMS delivery receipts before issuing validity rulings. Invalid deductions are automatically escalated to collections.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Freight Claim Evidence Requirement", description: "Freight deductions require carrier damage notation on POD or written carrier acknowledgement before VALID ruling is issued" },
      { name: "Early Pay Discount Verification",    description: "Payment must be received within the discount window (typically 10 days) AND invoices must qualify under contract terms; agent must verify both conditions" },
      { name: "Quantity Short Documentation",       description: "Short-ship deductions must be reconciled against WMS pick-and-ship records; discrepancy requires delivery receipt plus WMS audit trail before VALID ruling" },
    ]},
  },
  {
    name:        "Month-End Close SOX Controls",
    domain:      "financial_compliance",
    description: "SOX-compliant month-end AR close requirements: all cash receipts must be posted within 2 business days of receipt, bank reconciliation must reach 99%+ by business day 3, all deductions must be classified and documented, and credit memos require dual approval above $10K.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "48-Hour Posting Deadline",      description: "All received payments must be matched and posted within 2 business days; unmatched payments held beyond 48 hours require controller escalation" },
      { name: "Bank Reconciliation Standard",  description: "Month-end bank reconciliation must reach 99%+ matched by close of business day 3; timing differences must be documented with expected resolution dates" },
      { name: "Deduction Documentation Gate",  description: "No deduction may be posted to AR without a validity ruling (VALID / INVALID / INVESTIGATE) from the cash application agent, logged with supporting evidence references" },
    ]},
  },
] as const;

// ─── Ontology concepts ────────────────────────────────────────────────────────
export const OTC_CASH_ONTOLOGY_CONCEPTS = [
  { name: "Payment Batch",         description: "A collection of payments received in a single processing cycle: wire transfers, ACH, checks, and EDI 820 transactions processed together in NovaTech's cash application system.",                                     domain: "cash_management" },
  { name: "Invoice Matching",      description: "The process of associating a received payment (or portion thereof) to one or more open invoice records in NovaTech's AR sub-ledger, assigned a confidence score based on reference alignment and amount tolerance.", domain: "cash_management" },
  { name: "Deduction Code",        description: "A coded reason for a payment shortfall claimed by a customer: freight damage (FRGT-DMG), early pay discount (EPD-2PCT), quantity short (QTY-SHT), pricing dispute (PRICE-DSP), or returns (RTN-CREDIT).",         domain: "cash_management" },
  { name: "Remittance Advice",     description: "Documentation from a customer explaining how a payment should be applied: invoice reference numbers, amounts per invoice, deduction codes, and overpayment instructions. Formats include EDI 820, PDF, and email.", domain: "cash_management" },
  { name: "Auto-Match Rate",       description: "The percentage of incoming payment value that the cash application system matches to invoices without human intervention. NovaTech's target is ≥90%; achieving 94%+ represents best-in-class performance.",         domain: "cash_management" },
  { name: "Exception Queue",       description: "Payments that could not be auto-matched with sufficient confidence, prioritised by payment value and complexity for manual review by the treasury team.",                                                           domain: "cash_management" },
  { name: "AR Journal Entry",      description: "A double-entry bookkeeping record posting a cash receipt to the AR sub-ledger: debit to the bank/clearing account, credit to the open invoice(s) in accounts receivable.",                                         domain: "accounts_receivable" },
  { name: "Invoice Closure",       description: "The status transition of an invoice from open to CLOSED-PAID when the full outstanding amount has been received, matched, validated, and posted in the ERP system.",                                               domain: "accounts_receivable" },
  { name: "Credit Memo",           description: "A financial instrument issued to a customer for an overpayment, valid deduction, or return, crediting their account for use against future invoices.",                                                              domain: "accounts_receivable" },
  { name: "AR Aging",              description: "A classification of open AR balances by days outstanding (Current / 30 / 60 / 90+ days), used to monitor collection risk, calculate DSO, and prioritise dunning activity.",                                        domain: "accounts_receivable" },
  { name: "Bank Reconciliation",   description: "The month-end process of reconciling NovaTech's bank statement with its GL cash account, identifying timing differences (outstanding checks, in-transit deposits) and errors.",                                    domain: "treasury" },
  { name: "Cross-Invoice Remittance", description: "A single payment from a customer that covers multiple invoices simultaneously, often with deductions applied across invoice subsets, requiring remittance advice parsing to allocate correctly.",               domain: "cash_management" },
] as const;

// ─── Blueprint definitions ────────────────────────────────────────────────────
export const OTC_CASH_BLUEPRINTS = [
  {
    name:        "OTC Cash — Payment Ingestion & Auto-Match Blueprint",
    description: "Ingests month-end payment batch, runs intelligent auto-matching to achieve 94%+ match rate, identifies exception queue with AI-suggested resolutions, and reports bank reconciliation status.",
    steps: [
      { order: 1, label: "Ingest Payment Batch",    description: "Call ingest_daily_payment_batch to capture all $42.3M / 387 payments across wire, ACH, check, and EDI channels" },
      { order: 2, label: "Run Auto-Matching",        description: "Call run_auto_matching to apply intelligent matching — targets 94%+ match rate with confidence-tier breakdown" },
      { order: 3, label: "Identify Exceptions",      description: "Call identify_exceptions to prioritise unmatched/complex payments by value and complexity for exception queue" },
      { order: 4, label: "Check Reconciliation",     description: "Call get_bank_reconciliation to confirm month-end bank rec status and surface outstanding timing items" },
    ],
  },
  {
    name:        "OTC Cash — Complex Payment Resolution Blueprint",
    description: "Resolves GlobalTech Corp's $2.3M cross-invoice remittance: parses EDI 820, matches 47 invoices, validates 3 deductions, quantifies overpayment, and prepares one-click resolution package.",
    steps: [
      { order: 1, label: "Parse EDI 820 Remittance", description: "Call parse_edi_remittance to extract structured invoice references, deduction codes, and overpayment from GlobalTech EDI 820" },
      { order: 2, label: "Match 47 Invoices",         description: "Call match_payment_to_invoices to apply $2.3M across all 47 open GlobalTech invoices at 99.2% confidence" },
      { order: 3, label: "Analyse Deductions",        description: "Call analyze_deductions to identify freight claim (-$28.5K), early pay discount (-$14.2K), and quantity short (-$7.4K)" },
      { order: 4, label: "Validate Deductions",       description: "Call validate_deduction_details to issue VALID/INVESTIGATE rulings with supporting evidence for each deduction" },
      { order: 5, label: "Prepare Resolution",        description: "Call apply_payment_resolution to package the complete resolution: 47 invoices closed, 2 deductions accepted, 1 flagged, overpayment credited" },
    ],
  },
  {
    name:        "OTC Cash — AR Posting & Invoice Closure Blueprint",
    description: "Posts GlobalTech payment to AR sub-ledger: validates deductions against policy, posts journal entries, generates credit memo for overpayment, closes all 47 invoices, and reports AR aging impact.",
    steps: [
      { order: 1, label: "Policy Validation",        description: "Call validate_deduction_against_policy to confirm deduction authority and documentation requirements for all 3 deductions" },
      { order: 2, label: "Post AR Entries",           description: "Call post_ar_entries to post cash receipt journal entries: debit Bank $2,262,747, credit AR 47 invoices, post deduction GL entries" },
      { order: 3, label: "Generate Credit Memo",      description: "Call generate_credit_memo to issue CM-2026-0328-GT for $38,100 overpayment credit to GlobalTech account" },
      { order: 4, label: "Close Invoice Batch",       description: "Call close_invoice_batch to mark all 47 invoices CLOSED-PAID and update GlobalTech AR balance ($3.1M → $0.73M)" },
      { order: 5, label: "AR Aging Impact",           description: "Call get_ar_aging_impact to confirm DSO improvement and updated aging bucket distribution post-posting" },
    ],
  },
] as const;

// ─── System prompts ───────────────────────────────────────────────────────────
export const OTC_CASH_SYSTEM_PROMPTS: Record<string, string> = {
  "OTC-AGT-009": `You are the Cash Application & Reconciliation Agent (OTC-AGT-009) for NovaTech Industries.

You run NovaTech's month-end Cash Application Command Center. When month-end payments arrive, you are the first line of intelligence — ingesting batches, matching invoices, resolving exceptions, and turning a week-long manual process into a same-day close. Your goal is consistent 94%+ auto-match rates and rapid resolution of complex cross-invoice remittances.

KEY RESPONSIBILITIES:
1. Payment ingestion — capture all channels (wire, ACH, check, EDI 820) with full audit trail
2. Auto-matching — apply intelligent matching to achieve ≥90% match rate, targeting 94%+
3. Exception triage — identify and prioritise unmatched payments by value and complexity
4. Complex resolution — parse multi-invoice EDI 820 remittances, validate deductions, quantify overpayments
5. Deduction validity — issue VALID/INVALID/INVESTIGATE rulings backed by supporting evidence
6. Resolution packaging — prepare one-click resolution packages for treasury controller approval

DECISION AUTHORITY:
- You may auto-post payments with ≥95% match confidence without human review
- Payments 80–95% confidence: prepare for one-click controller confirmation
- Deductions ≤$50K with supporting documentation: issue VALID ruling autonomously
- Complex payments >$1M with deductions: present resolution package for human approval

TONE GUIDANCE:
Write with the precision and calm confidence of a senior treasury analyst. Lead with numbers (match rates, amounts, invoice counts). Surface insights proactively — the controller should understand the situation without asking follow-up questions. When flagging issues for investigation, always provide the available evidence and a recommended next step.`,

  "OTC-AGT-006": `You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries.

You are the AR execution layer: once OTC-AGT-009 has prepared the payment resolution package, you validate deductions against policy, post journal entries to the AR sub-ledger, generate credit memos, close invoice batches, and maintain AR aging accuracy. You also manage overdue collections through configurable dunning sequences.

KEY RESPONSIBILITIES:
1. Policy validation — cross-reference each deduction against NovaTech's authority matrix and documentation requirements
2. AR posting — execute journal entries: debit Bank, credit AR at invoice level, post deduction GL entries
3. Credit memo issuance — generate and route credit memos for overpayments with dual-approval above $10K
4. Invoice closure — mark all paid invoices CLOSED-PAID, trigger ERP status updates and ASC 606 revenue recognition
5. AR aging — recalculate customer aging buckets post-posting, report DSO impact
6. Collections — manage dunning sequences for remaining open balances

POSTING AUTHORITY:
- Individual cash receipt postings: autonomous up to $5M per batch
- Credit memos: autonomous up to $10K; above $10K requires controller e-approval
- Deduction write-offs: autonomous up to $5K with VALID ruling; above requires collections manager

TONE GUIDANCE:
Write as a precise AR specialist. Your outputs are the official financial record — be exact with amounts, GL account codes, journal entry references, and invoice numbers. Confirm every action taken and its audit reference. Flag anything that requires escalation with a clear action owner and deadline.`,
};
