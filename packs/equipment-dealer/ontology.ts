/**
 * VitalEdge / Equipment Dealer vertical — shared ontology, knowledge bases, and
 * governance policies.
 *
 * Scope note: these concepts model the DEALERSHIP's operating domain (the
 * customer of a dealer management system), not the software vendor's. The
 * demo persona is Summit Equipment Group, a 14-branch construction and
 * agriculture dealer running a dealer ERP alongside a rental system — i.e. the
 * shape of account a DMS vendor sells into.
 *
 * Every journey in vitaledge-journeys.ts binds its agents to concept labels
 * declared here. Keep labels stable: agent ontologyTags match on label, so
 * renaming a concept silently unbinds the agents that reference it.
 */

export const DEALER_INDUSTRY_ID = "equipment_dealer";
export const DEALER_ONTOLOGY_NAME = "AED Dealer Operations Ontology";
export const DEMO_TENANT_NAME = "Summit Equipment Group";

export const SUB_VERTICALS = {
  finance: "Dealer Finance & Back Office",
  partsService: "Parts & Service",
  rental: "Rental Operations",
  wholegoods: "Whole-goods Sales",
  warranty: "Warranty & OEM Programs",
} as const;

export interface OntologyConceptDef {
  id: string;
  label: string;
  category: "entity" | "process" | "document" | "metric" | "control";
  description: string;
  subVerticals: string[];
  properties: Array<{ name: string; type: string; description: string }>;
  relationships: Array<{ type: string; target: string; description: string }>;
  tags: string[];
  synonyms: string[];
  industryRelevance: string;
}

// ─── Core entities ────────────────────────────────────────────────────────────
const ENTITIES: OntologyConceptDef[] = [
  {
    id: "ed-fleet-asset",
    label: "Fleet Asset",
    category: "entity",
    description:
      "A single physical machine tracked by the dealership across its whole life: new inventory, rental fleet, customer-owned, or used/remarketed. Identity is the serial number or PIN, which must resolve to exactly one asset before any financial posting is made against it.",
    subVerticals: [SUB_VERTICALS.partsService, SUB_VERTICALS.rental, SUB_VERTICALS.wholegoods, SUB_VERTICALS.warranty],
    properties: [
      { name: "serialNumber", type: "string", description: "Manufacturer serial or PIN; unique only within an OEM, not globally" },
      { name: "make", type: "string", description: "Manufacturer, required to disambiguate colliding serial strings" },
      { name: "model", type: "string", description: "Model designation, e.g. 320 GC, 544P, S650" },
      { name: "meterHours", type: "number", description: "Current hour-meter reading, drives warranty coverage and rental billing" },
      { name: "ownershipStatus", type: "enum", description: "new_inventory | rental_fleet | customer_owned | used_inventory | sold" },
      { name: "branchId", type: "string", description: "Owning branch, determines which ledger a posting lands in" },
    ],
    relationships: [
      { type: "subject_of", target: "Work Order", description: "Service work is performed against a fleet asset" },
      { type: "subject_of", target: "Rental Contract", description: "A rental contract puts one asset on rent" },
      { type: "subject_of", target: "Warranty Claim", description: "Claims are filed against the asset that failed" },
      { type: "covered_by", target: "OEM Warranty Program", description: "Coverage is determined by the asset's delivery date and meter hours" },
    ],
    tags: ["asset", "serial-number", "fleet", "identity"],
    synonyms: ["Unit", "Machine", "Equipment Unit", "Iron"],
    industryRelevance: "The anchor entity of the entire dealership. Nearly every financial error in dealer operations traces back to work being posted against the wrong unit.",
  },
  {
    id: "ed-customer-account",
    label: "Customer Account",
    category: "entity",
    description:
      "A commercial customer of the dealership, frequently a contractor or farm operation with equipment across several branches. Account-level credit limits and holds apply across all branches, which is why single-branch reasoning about a payment or a hold is a recurring source of error.",
    subVerticals: [SUB_VERTICALS.finance, SUB_VERTICALS.partsService, SUB_VERTICALS.rental, SUB_VERTICALS.wholegoods],
    properties: [
      { name: "accountId", type: "string", description: "Master account identifier across all branches" },
      { name: "creditLimit", type: "number", description: "Approved credit exposure ceiling" },
      { name: "accountTier", type: "enum", description: "standard | strategic | oem_affiliated — drives escalation rules" },
      { name: "paymentTerms", type: "string", description: "e.g. Net 30, 2/10 Net 30" },
      { name: "creditStatus", type: "enum", description: "good | watch | hold | legal" },
    ],
    relationships: [
      { type: "owner_of", target: "Accounts Receivable Balance", description: "AR ages at account level, not branch level" },
      { type: "party_to", target: "Rental Contract", description: "Customer is the renting party" },
      { type: "subject_of", target: "Credit Hold", description: "Holds apply to the account across every branch" },
    ],
    tags: ["customer", "credit", "account", "multi-branch"],
    synonyms: ["Account", "Customer", "Buyer"],
    industryRelevance: "Dealer customers are usually multi-branch and multi-division; treating them as branch-local is the root of most misapplied cash.",
  },
  {
    id: "ed-branch",
    label: "Branch",
    category: "entity",
    description:
      "A physical dealership location with its own general ledger, service department, parts counter, and rental fleet. Financial postings are branch-scoped even when the customer relationship is enterprise-wide.",
    subVerticals: [SUB_VERTICALS.finance, SUB_VERTICALS.partsService, SUB_VERTICALS.rental, SUB_VERTICALS.wholegoods],
    properties: [
      { name: "branchId", type: "string", description: "Branch code used as the ledger dimension on every posting" },
      { name: "division", type: "enum", description: "construction | agriculture | compact | forestry" },
      { name: "controllerId", type: "string", description: "Approving authority for credit memos above agent limit" },
    ],
    relationships: [
      { type: "scope_of", target: "AR Journal Entry", description: "Every posting carries a branch dimension" },
      { type: "employs", target: "Service Writer", description: "Escalation target for ambiguous equipment identity" },
    ],
    tags: ["branch", "location", "ledger", "division"],
    synonyms: ["Store", "Location", "Rooftop"],
    industryRelevance: "Dealer groups measure absorption and margin per rooftop; a posting to the wrong branch corrupts the metric the branch manager is compensated on.",
  },
  {
    id: "ed-oem-program",
    label: "OEM Warranty Program",
    category: "entity",
    description:
      "A manufacturer's warranty scheme defining what is covered, for how long in both calendar months and meter hours, at what published labour standard times, and with what documentation. Terms differ per manufacturer and change without notice, so cached program terms must be revalidated before submission.",
    subVerticals: [SUB_VERTICALS.warranty, SUB_VERTICALS.partsService],
    properties: [
      { name: "programCode", type: "string", description: "Manufacturer program identifier" },
      { name: "coverageMonths", type: "number", description: "Calendar coverage from delivery date" },
      { name: "coverageHours", type: "number", description: "Meter-hour coverage ceiling" },
      { name: "labourStandardSource", type: "string", description: "Published standard repair time table reference" },
      { name: "requiresFailureNarrative", type: "boolean", description: "Whether a written failure story is mandatory" },
    ],
    relationships: [
      { type: "governs", target: "Warranty Claim", description: "Claim validity is judged against program terms" },
      { type: "covers", target: "Fleet Asset", description: "Coverage attaches to the asset from its delivery date" },
    ],
    tags: ["oem", "warranty", "program", "coverage"],
    synonyms: ["Manufacturer Warranty", "Factory Warranty", "Program Terms"],
    industryRelevance: "Program standing is a commercial asset. Repeated non-compliant claims put a dealer's warranty authority itself at risk, not just the individual claim.",
  },
];

// ─── Documents ────────────────────────────────────────────────────────────────
const DOCUMENTS: OntologyConceptDef[] = [
  {
    id: "ed-remittance-advice",
    label: "Remittance Advice",
    category: "document",
    description:
      "Customer documentation explaining how a payment should be applied. In dealer operations it arrives mostly as unstructured PDF or email rather than EDI, frequently spans branches and revenue lines, and is often absent altogether on cheque payments.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "format", type: "enum", description: "pdf | email_body | edi_820 | none" },
      { name: "invoiceReferences", type: "array", description: "Invoice numbers the payer intends to settle" },
      { name: "deductionCodes", type: "array", description: "Claimed reasons for any shortfall" },
      { name: "completenessScore", type: "number", description: "How much of the payment the advice actually accounts for" },
    ],
    relationships: [
      { type: "explains", target: "Customer Payment", description: "Advice is the allocation instruction for a payment" },
      { type: "input_to", target: "Cash Application", description: "Parsing quality drives the touchless rate" },
    ],
    tags: ["remittance", "document", "unstructured", "cash-application"],
    synonyms: ["Remittance Stub", "Payment Advice", "Check Stub"],
    industryRelevance: "Unlike large manufacturers, dealer customers rarely send EDI 820. Extraction from messy PDFs is the single biggest lever on touchless cash application in this vertical.",
  },
  {
    id: "ed-work-order",
    label: "Work Order",
    category: "document",
    description:
      "The record of a service job against a fleet asset: complaint, cause, correction, labour lines, parts consumed, and the technician's failure narrative. It is simultaneously the customer billing source and the evidence package for a warranty claim.",
    subVerticals: [SUB_VERTICALS.partsService, SUB_VERTICALS.warranty],
    properties: [
      { name: "workOrderId", type: "string", description: "Work order number" },
      { name: "segments", type: "array", description: "Job segments, each billable to customer, internal, or warranty" },
      { name: "labourHours", type: "number", description: "Actual technician hours booked" },
      { name: "failureNarrative", type: "string", description: "Complaint/cause/correction text required by most OEM programs" },
      { name: "causalPart", type: "string", description: "The part whose failure caused the repair" },
    ],
    relationships: [
      { type: "performed_on", target: "Fleet Asset", description: "Every work order targets one asset" },
      { type: "source_of", target: "Warranty Claim", description: "Claims are assembled from work order content" },
      { type: "source_of", target: "Service Invoice", description: "Customer-pay segments become invoice lines" },
    ],
    tags: ["work-order", "service", "labour", "warranty-evidence"],
    synonyms: ["WO", "Repair Order", "Service Order", "Job"],
    industryRelevance: "A work order split across customer-pay, internal, and warranty segments is the normal case, and mis-segmenting it is both a margin leak and a warranty compliance risk.",
  },
  {
    id: "ed-rental-contract",
    label: "Rental Contract",
    category: "document",
    description:
      "The agreement putting an asset on rent: rate structure, minimum term, included hours, overage rates, delivery and pickup charges, damage waiver, and any rental-purchase option. Its terms are the yardstick against which every cycle invoice must be checked.",
    subVerticals: [SUB_VERTICALS.rental],
    properties: [
      { name: "contractId", type: "string", description: "Rental contract number" },
      { name: "rateStructure", type: "object", description: "Daily, weekly, and monthly rates with included hours" },
      { name: "overageRatePerHour", type: "number", description: "Charge for hours beyond the included allowance" },
      { name: "offRentDate", type: "date", description: "Date rent stops accruing — the most disputed field in rental" },
      { name: "hasPurchaseOption", type: "boolean", description: "Triggers ASC 842 lease-classification review" },
    ],
    relationships: [
      { type: "governs", target: "Rental Invoice", description: "Cycle billing must conform to contract terms" },
      { type: "puts_on_rent", target: "Fleet Asset", description: "One contract, one asset" },
      { type: "verified_by", target: "Telematics Reading", description: "Utilisation evidence for overage and off-rent disputes" },
    ],
    tags: ["rental", "contract", "rpo", "off-rent"],
    synonyms: ["Rental Agreement", "RA", "Rental Ticket"],
    industryRelevance: "Rental revenue leakage concentrates in three fields: unbilled overage hours, backdated off-rent dates, and uncharged damage or fuel.",
  },
  {
    id: "ed-warranty-claim",
    label: "Warranty Claim",
    category: "document",
    description:
      "A reimbursement request submitted to a manufacturer for a repair performed under warranty. Must fall inside the coverage window on both calendar time and meter hours, claim labour at or below the published standard, and carry a causal part and failure narrative.",
    subVerticals: [SUB_VERTICALS.warranty],
    properties: [
      { name: "claimId", type: "string", description: "Claim identifier" },
      { name: "claimedLabourHours", type: "number", description: "Labour hours requested" },
      { name: "standardLabourHours", type: "number", description: "Published standard time for the repair" },
      { name: "claimStatus", type: "enum", description: "draft | submitted | approved | denied | resubmitted" },
      { name: "denialReason", type: "string", description: "Manufacturer's stated reason when denied" },
    ],
    relationships: [
      { type: "assembled_from", target: "Work Order", description: "Claim content derives from the work order" },
      { type: "judged_against", target: "OEM Warranty Program", description: "Validity determined by program terms" },
      { type: "produces", target: "Warranty Receivable", description: "An approved claim becomes a receivable from the OEM" },
    ],
    tags: ["warranty", "claim", "oem", "reimbursement"],
    synonyms: ["Warranty Submission", "Factory Claim"],
    industryRelevance: "Warranty is a receivable the dealer has already funded in labour and parts. Every denial is cash the dealership has already spent and will not get back.",
  },
  {
    id: "ed-credit-memo",
    label: "Credit Memo",
    category: "document",
    description:
      "An instrument crediting a customer account for an overpayment, a valid dispute, or a billing correction. Above the branch authority threshold it requires documented human approval, and the agent that proposes it may not be the actor that posts it.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "memoId", type: "string", description: "Credit memo identifier" },
      { name: "amount", type: "number", description: "Credit value" },
      { name: "approvalLevel", type: "enum", description: "agent_auto | branch_controller | regional_cfo" },
      { name: "supportingEvidence", type: "array", description: "Documents justifying the credit" },
    ],
    relationships: [
      { type: "resolves", target: "Customer Dispute", description: "A credit memo is a common dispute outcome" },
      { type: "gated_by", target: "Approval Authority Limit", description: "Value determines the required approver" },
    ],
    tags: ["credit-memo", "adjustment", "approval", "sox"],
    synonyms: ["CM", "Credit Note", "Adjustment"],
    industryRelevance: "The most common SOX finding in dealer groups is credit memos issued without evidence of approval at the right level.",
  },
];

// ─── Processes ────────────────────────────────────────────────────────────────
const PROCESSES: OntologyConceptDef[] = [
  {
    id: "ed-cash-application",
    label: "Cash Application",
    category: "process",
    description:
      "Matching an incoming customer payment to the specific open invoices it settles, splitting it correctly across branches and revenue lines, and posting it to the ledger. Anything not matched above the confidence floor routes to an exception queue rather than being force-applied.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "matchConfidence", type: "number", description: "Confidence the proposed allocation is correct" },
      { name: "touchlessRate", type: "number", description: "Share of payments applied with no human involvement" },
      { name: "residualAmount", type: "number", description: "Unallocated remainder after matching" },
    ],
    relationships: [
      { type: "consumes", target: "Remittance Advice", description: "Advice drives the allocation" },
      { type: "produces", target: "AR Journal Entry", description: "Successful application posts to the ledger" },
      { type: "escalates_to", target: "Exception Queue", description: "Low-confidence matches are routed, not guessed" },
    ],
    tags: ["cash-application", "matching", "ar", "touchless"],
    synonyms: ["Payment Application", "Cash Posting"],
    industryRelevance: "The primary driver of DSO and unapplied cash in a dealership, and the process most visibly improved by agents.",
  },
  {
    id: "ed-collections-triage",
    label: "Collections Triage",
    category: "process",
    description:
      "Prioritising the overdue AR portfolio by exposure, ageing, and recoverability, then choosing an action: dunning outreach, payment plan, credit hold, or escalation. Balances under active dispute must be excluded from hold calculations.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "agingBucket", type: "enum", description: "current | 30 | 60 | 90+" },
      { name: "disputedAmount", type: "number", description: "Portion under dispute and therefore hold-exempt" },
      { name: "recommendedAction", type: "enum", description: "dun | payment_plan | credit_hold | escalate" },
    ],
    relationships: [
      { type: "evaluates", target: "Accounts Receivable Balance", description: "Triage reads the aged portfolio" },
      { type: "may_produce", target: "Credit Hold", description: "Holds are one possible outcome" },
      { type: "constrained_by", target: "Collections Conduct Standard", description: "Language and escalation are policy-bound" },
    ],
    tags: ["collections", "triage", "aging", "credit-risk"],
    synonyms: ["AR Follow-up", "Dunning", "Credit Control"],
    industryRelevance: "Dealers sell to contractors with seasonal cash flow; over-aggressive holds cost far more in lost parts and service revenue than they recover.",
  },
  {
    id: "ed-warranty-adjudication",
    label: "Warranty Adjudication",
    category: "process",
    description:
      "Determining whether a repair qualifies for manufacturer reimbursement before submission: coverage window on calendar and meter hours, labour against published standard, causal part identified, and failure narrative adequate. Non-qualifying repairs route to goodwill or customer-pay rather than being submitted.",
    subVerticals: [SUB_VERTICALS.warranty, SUB_VERTICALS.partsService],
    properties: [
      { name: "coverageVerdict", type: "enum", description: "in_coverage | out_of_coverage | requires_goodwill_review" },
      { name: "labourVariance", type: "number", description: "Claimed hours minus published standard" },
      { name: "narrativeQuality", type: "enum", description: "adequate | insufficient" },
    ],
    relationships: [
      { type: "evaluates", target: "Work Order", description: "Adjudication reads work order content" },
      { type: "applies", target: "OEM Warranty Program", description: "Program terms are the decision criteria" },
      { type: "produces", target: "Warranty Claim", description: "Qualifying repairs become claims" },
    ],
    tags: ["warranty", "adjudication", "eligibility", "coverage"],
    synonyms: ["Warranty Eligibility Review", "Claim Screening"],
    industryRelevance: "Screening before submission protects OEM program standing, which is worth far more than any single claim.",
  },
  {
    id: "ed-rental-billing-reconciliation",
    label: "Rental Billing Reconciliation",
    category: "process",
    description:
      "Checking each rental cycle invoice against contract terms and actual machine utilisation before it goes out: included versus actual hours, off-rent date against telematics, and delivery, fuel, and damage charges.",
    subVerticals: [SUB_VERTICALS.rental],
    properties: [
      { name: "billedHours", type: "number", description: "Hours billed on the cycle invoice" },
      { name: "telematicsHours", type: "number", description: "Hours actually accrued per machine data" },
      { name: "leakageAmount", type: "number", description: "Revenue difference identified" },
    ],
    relationships: [
      { type: "compares", target: "Rental Contract", description: "Contract terms are the billing yardstick" },
      { type: "uses", target: "Telematics Reading", description: "Machine data is the independent evidence" },
      { type: "produces", target: "Rental Invoice", description: "Reconciled invoices are released for billing" },
    ],
    tags: ["rental", "billing", "reconciliation", "leakage"],
    synonyms: ["Cycle Billing Review", "Rental Revenue Assurance"],
    industryRelevance: "Rental is the highest-leakage revenue line in a dealership because billing depends on facts only the machine knows.",
  },
  {
    id: "ed-deal-margin-review",
    label: "Deal Margin Review",
    category: "process",
    description:
      "Assembling the true margin on a whole-goods deal before it is invoiced: unit cost, trade-in valuation, freight, pre-delivery inspection and prep, attachments, discount, and every manufacturer rebate or program credit the deal qualifies for.",
    subVerticals: [SUB_VERTICALS.wholegoods],
    properties: [
      { name: "grossMargin", type: "number", description: "Margin after all costs and captured programs" },
      { name: "unclaimedRebates", type: "array", description: "Programs the deal qualifies for but has not claimed" },
      { name: "discountAuthorityLevel", type: "enum", description: "Approver required for the discount offered" },
    ],
    relationships: [
      { type: "evaluates", target: "Whole-goods Deal", description: "Review reads the full deal structure" },
      { type: "gated_by", target: "Approval Authority Limit", description: "Discount depth determines the approver" },
      { type: "captures", target: "OEM Rebate Program", description: "Unclaimed programs are pure recovered margin" },
    ],
    tags: ["wholegoods", "margin", "rebate", "deal-desk"],
    synonyms: ["Deal Desk Review", "Margin Protection"],
    industryRelevance: "Rebate capture is often the difference between a profitable and an unprofitable unit sale, and it is routinely missed under quote-turnaround pressure.",
  },
];

// ─── Metrics ──────────────────────────────────────────────────────────────────
const METRICS: OntologyConceptDef[] = [
  {
    id: "ed-dso",
    label: "Days Sales Outstanding",
    category: "metric",
    description: "Average number of days to collect receivables across parts, service, rental, and whole-goods. The headline finance metric a dealer CFO is measured on.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [{ name: "days", type: "number", description: "Rolling average collection period" }],
    relationships: [{ type: "improved_by", target: "Cash Application", description: "Faster, more accurate application reduces DSO directly" }],
    tags: ["dso", "kpi", "finance"],
    synonyms: ["Collection Period", "AR Days"],
    industryRelevance: "Every day of DSO in a mid-size dealer group is roughly a million dollars of working capital.",
  },
  {
    id: "ed-absorption-rate",
    label: "Absorption Rate",
    category: "metric",
    description: "Parts and service gross profit expressed as a percentage of total dealership fixed overhead. The defining health metric of an equipment dealership — at 100% the aftermarket alone covers the cost of keeping the doors open.",
    subVerticals: [SUB_VERTICALS.partsService, SUB_VERTICALS.finance],
    properties: [{ name: "percentage", type: "number", description: "Aftermarket gross profit over fixed overhead" }],
    relationships: [
      { type: "improved_by", target: "Warranty Adjudication", description: "Recovered warranty dollars land in aftermarket gross profit" },
      { type: "reported_by", target: "Branch", description: "Measured per rooftop" },
    ],
    tags: ["absorption", "kpi", "aftermarket"],
    synonyms: ["Service Absorption", "Aftermarket Absorption"],
    industryRelevance: "The single most quoted number in equipment dealer management. Using it correctly signals genuine domain fluency.",
  },
  {
    id: "ed-warranty-recovery-rate",
    label: "Warranty Recovery Rate",
    category: "metric",
    description: "Share of eligible warranty spend actually reimbursed by manufacturers, net of denials and labour-time write-downs.",
    subVerticals: [SUB_VERTICALS.warranty],
    properties: [{ name: "percentage", type: "number", description: "Reimbursed over eligible" }],
    relationships: [{ type: "improved_by", target: "Warranty Adjudication", description: "Pre-submission screening lifts recovery" }],
    tags: ["warranty", "recovery", "kpi"],
    synonyms: ["Claim Recovery", "Warranty Realisation"],
    industryRelevance: "Recovery below 90% usually indicates a process problem, not a manufacturer problem.",
  },
  {
    id: "ed-rental-leakage",
    label: "Rental Revenue Leakage",
    category: "metric",
    description: "Rental revenue earned under contract terms but never invoiced — unbilled overage hours, over-credited off-rent periods, and uncharged damage, fuel, and transport.",
    subVerticals: [SUB_VERTICALS.rental],
    properties: [{ name: "percentOfRentalRevenue", type: "number", description: "Leakage as a share of rental revenue" }],
    relationships: [{ type: "reduced_by", target: "Rental Billing Reconciliation", description: "Systematic reconciliation is the only reliable control" }],
    tags: ["rental", "leakage", "kpi", "revenue-assurance"],
    synonyms: ["Unbilled Rental Revenue", "Rental Slippage"],
    industryRelevance: "Typically 3-5% of rental revenue at dealers without systematic reconciliation.",
  },
];

// ─── Controls ─────────────────────────────────────────────────────────────────
const CONTROLS: OntologyConceptDef[] = [
  {
    id: "ed-approval-authority-limit",
    label: "Approval Authority Limit",
    category: "control",
    description: "The monetary ceiling below which an actor may approve a financial adjustment unaided. Above it, a named human at the correct level must approve, and the proposer may not also be the poster.",
    subVerticals: [SUB_VERTICALS.finance, SUB_VERTICALS.wholegoods],
    properties: [
      { name: "thresholdUsd", type: "number", description: "Ceiling for unaided approval" },
      { name: "escalationRole", type: "string", description: "Role required above the ceiling" },
    ],
    relationships: [
      { type: "gates", target: "Credit Memo", description: "Credit memo value determines the approver" },
      { type: "gates", target: "Deal Margin Review", description: "Discount depth determines the approver" },
    ],
    tags: ["sox", "approval", "authority", "segregation-of-duties"],
    synonyms: ["Delegation of Authority", "Approval Threshold", "DOA Matrix"],
    industryRelevance: "This is the control auditors test first, and the one agents are most likely to breach silently.",
  },
  {
    id: "ed-credit-hold",
    label: "Credit Hold",
    category: "control",
    description: "A block on further credit sales to an account. Applies across every branch, must be supported by documented ageing evidence, must exclude balances under active dispute, and on strategic or OEM-affiliated accounts always requires human review.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "justification", type: "string", description: "Documented ageing evidence supporting the hold" },
      { name: "disputeExclusionApplied", type: "boolean", description: "Whether disputed balances were excluded" },
    ],
    relationships: [
      { type: "applies_to", target: "Customer Account", description: "Holds are account-wide, not branch-local" },
      { type: "produced_by", target: "Collections Triage", description: "One possible triage outcome" },
    ],
    tags: ["credit-hold", "control", "collections"],
    synonyms: ["Credit Block", "Account Hold", "Stop Supply"],
    industryRelevance: "An unjustified hold on a large fleet customer can cost more in a week of lost parts and service than the overdue balance itself.",
  },
  {
    id: "ed-revenue-recognition-cutoff",
    label: "Revenue Recognition Cutoff",
    category: "control",
    description: "The rule that revenue is recognised when the performance obligation is satisfied rather than when the invoice is generated, and that rental contracts with purchase options are assessed for lease classification before posting.",
    subVerticals: [SUB_VERTICALS.finance, SUB_VERTICALS.rental, SUB_VERTICALS.wholegoods],
    properties: [
      { name: "standard", type: "enum", description: "ASC 606 | ASC 842" },
      { name: "obligationSatisfiedDate", type: "date", description: "When the obligation was actually met" },
    ],
    relationships: [
      { type: "constrains", target: "AR Journal Entry", description: "Governs which period a posting lands in" },
      { type: "triggers_review_of", target: "Rental Contract", description: "Purchase options force lease-classification review" },
    ],
    tags: ["asc606", "asc842", "revenue", "cutoff", "control"],
    synonyms: ["Period Cutoff", "Rev Rec Rule"],
    industryRelevance: "Month-end pressure to invoice creates constant cutoff risk, and rental-purchase options are a standing ASC 842 trap in this vertical.",
  },
  {
    id: "ed-collections-conduct-standard",
    label: "Collections Conduct Standard",
    category: "control",
    description: "Rules for customer-facing collections activity: approved dunning templates only, no repossession or legal threats without legal review, no assertion of fees not in the contract, and escalation proportionate to exposure.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [{ name: "approvedTemplates", type: "array", description: "Permitted outreach templates by ageing tier" }],
    relationships: [{ type: "constrains", target: "Collections Triage", description: "Bounds what triage may say and do" }],
    tags: ["collections", "conduct", "control", "customer-communication"],
    synonyms: ["Dunning Policy", "Collections Standard"],
    industryRelevance: "Dealer relationships are decades long and local; tone in collections is a commercial risk, not just a compliance one.",
  },
];


// ─── Supporting concepts ──────────────────────────────────────────────────────
const SUPPORTING: OntologyConceptDef[] = [
  {
    id: "ed-ar-balance",
    label: "Accounts Receivable Balance",
    category: "entity",
    description:
      "What a customer account owes the dealership across every branch and revenue line, aged into buckets. The raw figure is misleading on its own: balances under active dispute and unapplied cash sitting on the account both distort it.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "totalBalance", type: "number", description: "Gross open balance across all branches" },
      { name: "disputedPortion", type: "number", description: "Portion under active dispute, excluded from hold exposure" },
      { name: "unappliedCash", type: "number", description: "Received but unallocated cash netting against the balance" },
    ],
    relationships: [
      { type: "held_by", target: "Customer Account", description: "AR ages at account level across branches" },
      { type: "evaluated_by", target: "Collections Triage", description: "Triage reads the aged balance" },
      { type: "reduced_by", target: "Cash Application", description: "Successful application retires balance" },
    ],
    tags: ["ar", "aging", "balance", "exposure"],
    synonyms: ["Open AR", "Receivables", "Aged Balance"],
    industryRelevance: "The number most often misread in dealer collections, because disputed balances and unapplied cash are both buried inside it.",
  },
  {
    id: "ed-customer-payment",
    label: "Customer Payment",
    category: "entity",
    description:
      "An inbound receipt from a customer through ACH, cheque, lockbox, card or wire. The payer name on the payment frequently differs from the master account name, and one payment routinely settles invoices across several branches.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "channel", type: "enum", description: "ach | cheque | lockbox | card | wire" },
      { name: "payerString", type: "string", description: "Payer name as it appears on the payment, often a DBA or truncated" },
      { name: "amount", type: "number", description: "Payment value" },
    ],
    relationships: [
      { type: "explained_by", target: "Remittance Advice", description: "Advice carries the allocation intent" },
      { type: "input_to", target: "Cash Application", description: "Payments are what cash application allocates" },
    ],
    tags: ["payment", "receipt", "ach", "cheque"],
    synonyms: ["Receipt", "Remittance", "Payment"],
    industryRelevance: "Dealer payments arrive with weaker allocation data than in most industries, which is why extraction quality dominates the touchless rate.",
  },
  {
    id: "ed-exception-queue",
    label: "Exception Queue",
    category: "process",
    description:
      "Where payments that cannot be confidently allocated are routed, with the parsed remittance, ranked candidates and the specific ambiguity already attached — so the researcher's first action is a decision rather than a lookup.",
    subVerticals: [SUB_VERTICALS.finance],
    properties: [
      { name: "reasonCode", type: "string", description: "Why confidence fell short" },
      { name: "candidatesAttached", type: "number", description: "Ranked candidate allocations supplied to the researcher" },
    ],
    relationships: [
      { type: "receives_from", target: "Cash Application", description: "Low-confidence matches route here rather than being forced" },
    ],
    tags: ["exception", "research-queue", "human-handoff"],
    synonyms: ["Research Queue", "Unapplied Queue"],
    industryRelevance: "The quality of the exception package, not just the touchless rate, determines whether agents actually reduce finance headcount effort.",
  },
  {
    id: "ed-customer-dispute",
    label: "Customer Dispute",
    category: "entity",
    description:
      "A customer's contested invoice or line item. In dealer operations disputes cluster into a few shapes: stale price list, freight billed against an absorption clause, rental hours beyond the included allowance, warranty work billed as customer-pay, and duplicates.",
    subVerticals: [SUB_VERTICALS.finance, SUB_VERTICALS.rental],
    properties: [
      { name: "reasonCode", type: "string", description: "Classified dispute shape" },
      { name: "disputedAmount", type: "number", description: "Value under dispute, excluded from hold exposure" },
      { name: "clauseCited", type: "string", description: "Contract clause the resolution rests on" },
    ],
    relationships: [
      { type: "resolved_by", target: "Credit Memo", description: "A credit memo is a common resolution" },
      { type: "excluded_from", target: "Credit Hold", description: "Disputed balances never justify a hold" },
    ],
    tags: ["dispute", "contested", "credit", "resolution"],
    synonyms: ["Billing Dispute", "Contested Invoice", "Deduction"],
    industryRelevance: "An unresolved dispute masquerading as delinquency is the most common cause of a damaging credit hold.",
  },
  {
    id: "ed-telematics-reading",
    label: "Telematics Reading",
    category: "entity",
    description:
      "Machine-reported data under the AEMP / ISO 15143-3 standard: engine hours accrued, location history, idle versus working ratio, and fault codes. The independent witness that settles rental overage and off-rent disputes.",
    subVerticals: [SUB_VERTICALS.rental, SUB_VERTICALS.partsService],
    properties: [
      { name: "engineHours", type: "number", description: "Cumulative engine hours" },
      { name: "reportingGaps", type: "array", description: "Periods where the unit stopped reporting — never extrapolate across these" },
      { name: "idleRatio", type: "number", description: "Idle versus working time" },
    ],
    relationships: [
      { type: "verifies", target: "Rental Contract", description: "Corroborates claimed off-rent dates and overage hours" },
      { type: "corroborates", target: "Fleet Asset", description: "Confirms meter-hour plausibility for warranty coverage" },
    ],
    tags: ["telematics", "aemp", "iso-15143-3", "evidence"],
    synonyms: ["Machine Data", "Hour Meter", "AEMP Feed"],
    industryRelevance: "Turns rental billing disputes from arguments into evidence questions — and cuts both ways, which is what makes it trustworthy.",
  },
  {
    id: "ed-wholegoods-deal",
    label: "Whole-goods Deal",
    category: "entity",
    description:
      "A machine sale transaction: unit configuration, price, discount, trade-in, freight and prep, attachments, and the manufacturer programs it qualifies for. True margin is assembled from all of these, not read off the quote screen.",
    subVerticals: [SUB_VERTICALS.wholegoods],
    properties: [
      { name: "salePrice", type: "number", description: "Quoted sale price" },
      { name: "tradeAllowance", type: "number", description: "Allowance granted on the trade-in" },
      { name: "discountPct", type: "number", description: "Headline discount, which excludes trade over-allowance" },
    ],
    relationships: [
      { type: "evaluated_by", target: "Deal Margin Review", description: "Deal desk assesses true economics before commitment" },
      { type: "qualifies_for", target: "OEM Rebate Program", description: "Programs materially change true margin" },
      { type: "gated_by", target: "Approval Authority Limit", description: "Discount depth determines the approver" },
    ],
    tags: ["wholegoods", "deal", "quote", "trade-in"],
    synonyms: ["Machine Sale", "Unit Deal", "Equipment Sale"],
    industryRelevance: "Trade over-allowance is the standard way authority thresholds get circumvented, because it hides discount inside a valuation.",
  },
  {
    id: "ed-oem-rebate-program",
    label: "OEM Rebate Program",
    category: "entity",
    description:
      "A manufacturer incentive a deal may qualify for: retail rebate, fleet or volume program, floor plan interest credit, demo allowance, trade assistance, or seasonal promotion. Each carries eligibility conditions, a value, a claim deadline, and mutual-exclusion rules against other programs.",
    subVerticals: [SUB_VERTICALS.wholegoods],
    properties: [
      { name: "programType", type: "enum", description: "retail_rebate | volume | floor_plan_credit | demo_allowance | trade_assistance | seasonal" },
      { name: "value", type: "number", description: "Program value on this deal" },
      { name: "claimDeadline", type: "date", description: "After this date the value is unrecoverable" },
      { name: "exclusiveWith", type: "array", description: "Programs this one cannot be stacked with" },
    ],
    relationships: [
      { type: "captured_by", target: "Deal Margin Review", description: "Capture happens before margin is judged" },
      { type: "applies_to", target: "Whole-goods Deal", description: "Programs attach to qualifying deals" },
    ],
    tags: ["rebate", "program", "oem", "margin", "stacking"],
    synonyms: ["Manufacturer Program", "Incentive", "Rebate"],
    industryRelevance: "Claiming mutually exclusive programs triggers chargebacks worth more than the programs, so stacking rules matter as much as capture.",
  },
  {
    id: "ed-margin-protection",
    label: "Margin Protection",
    category: "metric",
    description: "Gross margin retained per whole-goods unit after discount, trade over-allowance, freight, prep and floor plan carry, and after all qualifying manufacturer programs have been captured.",
    subVerticals: [SUB_VERTICALS.wholegoods],
    properties: [
      { name: "marginPct", type: "number", description: "True margin after all adjustments and program capture" },
      { name: "rebateCaptureRate", type: "number", description: "Share of qualifying program value actually claimed" },
    ],
    relationships: [
      { type: "improved_by", target: "Deal Margin Review", description: "Visibility before commitment is the control" },
      { type: "depends_on", target: "OEM Rebate Program", description: "Capture rate directly moves true margin" },
    ],
    tags: ["margin", "kpi", "wholegoods", "rebate-capture"],
    synonyms: ["Deal Margin", "Unit Margin", "Gross Margin per Unit"],
    industryRelevance: "Whole-goods margin is thin enough that rebate capture alone often decides whether a unit sale was profitable.",
  },
  {
    id: "ed-warranty-receivable",
    label: "Warranty Receivable",
    category: "entity",
    description: "An approved warranty claim recorded as a receivable from the manufacturer, posted to the branch that performed the work in the period the repair obligation was satisfied.",
    subVerticals: [SUB_VERTICALS.warranty, SUB_VERTICALS.finance],
    properties: [
      { name: "approvedAmount", type: "number", description: "Amount the manufacturer approved" },
      { name: "labourWriteDown", type: "number", description: "Difference between claimed and approved labour" },
    ],
    relationships: [
      { type: "produced_by", target: "Warranty Claim", description: "Approved claims become receivables" },
      { type: "constrained_by", target: "Revenue Recognition Cutoff", description: "Posts to the period the obligation was satisfied" },
    ],
    tags: ["warranty", "receivable", "reimbursement"],
    synonyms: ["OEM Receivable", "Warranty AR"],
    industryRelevance: "Warranty receivables are cash the dealer has already outlaid in labour and parts, which is why recovery rate reads straight through to absorption.",
  },
];

export const DEALER_ONTOLOGY_CONCEPTS: OntologyConceptDef[] = [
  ...ENTITIES,
  ...DOCUMENTS,
  ...PROCESSES,
  ...METRICS,
  ...CONTROLS,
  ...SUPPORTING,
];

// ─── Knowledge bases ──────────────────────────────────────────────────────────
export const DEALER_KB_DEFS = [
  {
    name: "Dealer Cash Application & Remittance Handbook",
    description:
      "Summit Equipment Group cash application procedures: payment channel rules for ACH, cheque, lockbox and card; remittance advice formats for the top 200 accounts; multi-branch allocation rules; short-pay versus dispute decision tree; settlement discount terms by customer tier; confidence floors and exception routing; and the month-end posting calendar.",
  },
  {
    name: "Dealer Credit & Collections Policy",
    description:
      "Credit limit and hold authority by account tier; ageing evidence requirements for a hold; dispute exclusion rules; approved dunning templates by ageing bucket; strategic and OEM-affiliated account escalation rules; payment plan authority; and prohibited collections language.",
  },
  {
    name: "OEM Warranty Program Reference",
    description:
      "Per-manufacturer warranty program terms: coverage windows in calendar months and meter hours, published standard labour times, causal part and failure narrative requirements, claim type and program code selection, goodwill policy thresholds, resubmission rules after denial, and documentation retention requirements.",
  },
  {
    name: "Rental Contract & Billing Standards",
    description:
      "Rate structures and included-hour allowances by machine class; overage calculation rules; off-rent date evidence standards including telematics corroboration; delivery, pickup, fuel and damage charge schedules; damage waiver terms; rental-purchase option handling and the ASC 842 review trigger; and cycle billing calendar.",
  },
  {
    name: "Dealer Revenue Recognition & Financial Controls",
    description:
      "ASC 606 and ASC 842 application to dealer revenue lines; period cutoff rules for service, rental and whole-goods; multi-obligation contract splitting; approval authority matrix for credit memos and discounts; segregation of duties between proposing and posting actors; and the SOX evidence pack required for agent-initiated postings.",
  },
] as const;

// ─── Governance policies ──────────────────────────────────────────────────────
export const DEALER_POLICY_DEFS = [
  {
    name: "Cash Application Authority & Confidence Floor",
    domain: "financial_controls",
    description:
      "Governs how far a cash application agent may act unaided. Payments are auto-applied only above the confidence floor; multi-branch payments must be split to the originating branch ledgers; and any unallocated residual routes to the exception queue rather than being forced onto an invoice.",
    policyJson: {
      enforcement: "hard",
      rules: [
        { name: "Confidence Floor", description: "Auto-apply only at 0.80 confidence or above; 0.60-0.80 requires one-click human confirmation; below 0.60 routes to the exception queue" },
        { name: "Multi-Branch Split Mandate", description: "A payment covering invoices from more than one branch must be split per invoice to the originating branch ledger; single-branch application of a multi-branch payment is prohibited" },
        { name: "Residual Handling", description: "Any unallocated residual above $50 must be routed to the exception queue with the parsed remittance attached; residuals may never be written off by the agent" },
        { name: "Source Document Requirement", description: "No ledger posting without a linked source document — remittance advice, bank record, or an explicit human instruction" },
      ],
    },
  },
  {
    name: "Credit Memo & Discount Approval Authority",
    domain: "financial_controls",
    description:
      "Implements the dealership delegation-of-authority matrix for agent-initiated adjustments, and enforces segregation of duties between the actor that proposes an adjustment and the actor that posts it.",
    policyJson: {
      enforcement: "hard",
      rules: [
        { name: "Agent Authority Ceiling", description: "Agents may auto-approve credit memos up to $10,000; $10,000-$100,000 requires branch controller approval; above $100,000 requires regional CFO approval" },
        { name: "Segregation of Duties", description: "The agent that proposes an adjustment may not be the agent that posts it to the ledger; proposal and posting must be separate actors with separate audit entries" },
        { name: "Evidence Pack Requirement", description: "Every credit memo above the agent ceiling must carry supporting evidence: the disputed invoice, the contract clause or policy relied on, and the calculation" },
        { name: "Discount Depth Gate", description: "Whole-goods discounts beyond the published branch threshold require the corresponding authority level before the quote may be issued" },
      ],
    },
  },
  {
    name: "OEM Warranty Submission Guard",
    domain: "warranty_compliance",
    description:
      "Blocks non-compliant warranty submissions before they reach a manufacturer portal, protecting the dealership's program standing rather than optimising any individual claim.",
    policyJson: {
      enforcement: "hard",
      rules: [
        { name: "Coverage Window Check", description: "Claims must fall inside the program coverage window on both calendar months and meter hours; out-of-window repairs route to goodwill review or customer-pay, never to submission" },
        { name: "Labour Standard Cap", description: "Claimed labour may not exceed the published standard repair time; overage requires documented justification and goodwill routing" },
        { name: "Equipment Identity Verification", description: "Serial or PIN must resolve to exactly one fleet asset, corroborated by make and model, before a claim is assembled; ambiguity escalates to the service writer" },
        { name: "Narrative Completeness", description: "Programs requiring a failure narrative must have complaint, cause and correction present with a named causal part before submission" },
      ],
    },
  },
  {
    name: "Revenue Recognition Controls (ASC 606 / ASC 842)",
    domain: "financial_compliance",
    description:
      "Keeps agent-initiated revenue postings inside ASC 606 and ASC 842, with particular attention to period cutoff and to rental contracts carrying purchase options.",
    policyJson: {
      enforcement: "hard",
      rules: [
        { name: "Obligation-Based Cutoff", description: "Revenue is recognised in the period the performance obligation was satisfied, not the invoice date; cross-period postings are flagged for accounting review rather than forced" },
        { name: "Purchase Option Review Trigger", description: "Any rental contract containing a purchase option is routed for ASC 842 lease-classification review before revenue posting" },
        { name: "Multi-Obligation Split", description: "Contracts bundling equipment, delivery, prep and extended coverage must be split into separate performance obligations with allocated consideration" },
      ],
    },
  },
  {
    name: "Collections Conduct & Credit Hold Standard",
    domain: "customer_conduct",
    description:
      "Bounds what a collections agent may say and do, so that recovery activity never costs more in damaged dealer relationships than it returns in cash.",
    policyJson: {
      enforcement: "hard",
      rules: [
        { name: "Hold Justification", description: "A credit hold requires documented ageing evidence; without it the account escalates to the credit manager rather than being held" },
        { name: "Dispute Exclusion", description: "Balances under active dispute are excluded from the exposure used to justify a hold" },
        { name: "Approved Language Only", description: "Customer-facing collections messages must use approved templates; repossession threats, legal threats, and assertion of fees not in the contract are prohibited" },
        { name: "Strategic Account Guard", description: "Credit holds on strategic or OEM-affiliated accounts always require human approval regardless of exposure" },
      ],
    },
  },
] as const;
