/**
 * OTC Order Demo 2 — shared platform intelligence definitions.
 *
 * Pure data module — NO server imports (express, storage, etc.).
 * Imported by:
 *   server/otc-order-live-run.ts   — to provision dev agents at startup
 *   scripts/migrate-otc-order-to-prod.ts — to provision prod agents
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const OTC_AGT_002_NAME = "Order Validation & Promise Agent";
export const OTC_AGT_003_NAME = "Customer Credit & Risk Assessment Agent";
export const OTC_AGT_004_NAME = "Inventory Availability & Promise Agent";

// ─── MCP server definitions (url is injected by caller) ──────────────────────
export function makeOtcOrderMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "OTC Order — OMS Validation Gateway",
      description: "NovaTech Order Management System: validates customer identity, resolves ship-to addresses, calculates taxes, runs compliance checks, and releases orders into ERP.",
      url:         `${baseUrl}/api/mock/otc-order-oms`,
      tools: [
        { name: "validate_customer_identity", description: "Validates Meridian Manufacturing customer identity, account standing, MSA contract, and OFAC sanctions screening.",         endpoint: "validate-customer-identity", method: "POST" },
        { name: "validate_ship_address",      description: "Resolves ship-to address discrepancy for ORD-2026-78432 using prior delivery history. Clears VAL-004.",                    endpoint: "validate-ship-address",       method: "POST" },
        { name: "calculate_taxes",            description: "Computes IL sales tax and confirms ASC 606 revenue recognition treatment for ORD-2026-78432.",                             endpoint: "calculate-taxes",             method: "POST" },
        { name: "check_compliance",           description: "Runs export control (EAR99), OFAC restricted-party, and ASC 606 checks for all order line items.",                         endpoint: "check-compliance",            method: "POST" },
        { name: "release_order",              description: "Releases order ORD-2026-78432 into ERP once all 8 validation holds are cleared. Returns deterministic ERP-TXN-2026-78432.", endpoint: "release",                    method: "POST" },
      ],
    },
    {
      name:        "OTC Order — Credit & Risk Engine",
      description: "NovaTech Credit Management: retrieves credit exposure, payment history, calculates composite risk scores, and approves temporary credit limit adjustments.",
      url:         `${baseUrl}/api/mock/otc-order-credit`,
      tools: [
        { name: "get_credit_exposure",  description: "Returns current credit exposure ($459,500 at 91.9%) and projected exposure to 177.8% if ORD-2026-78432 approved.",                endpoint: "get-credit-exposure",  method: "GET"  },
        { name: "get_payment_history",  description: "Returns Meridian EXCELLENT payment history, AR aging, 32-day avg pay, zero delinquency.",                                         endpoint: "get-payment-history",  method: "GET"  },
        { name: "calculate_risk_score", description: "Computes LOW composite risk score for Meridian and returns APPROVE_WITH_TEMP_LIMIT_INCREASE recommendation.",                     endpoint: "calculate-risk-score", method: "POST" },
        { name: "approve_credit_limit", description: "Approves 60-day temporary credit limit increase to $950K. Automated under pre-auth threshold for A+ customers. Clears VAL-002.", endpoint: "approve-credit-limit", method: "POST" },
      ],
    },
    {
      name:        "OTC Order — Inventory & Promise Engine",
      description: "NovaTech Warehouse Management: retrieves inventory by location, calculates ATP, evaluates shipping options, and reserves inventory for fulfillment.",
      url:         `${baseUrl}/api/mock/otc-order-inventory`,
      tools: [
        { name: "get_inventory_by_location", description: "Returns SKU-level inventory across Chicago DC and Atlanta Hub for ORD-2026-78432 (12 turbine units all available at Chicago).", endpoint: "get-inventory-by-location", method: "GET"  },
        { name: "calculate_atp",             description: "Computes Available-To-Promise date for all 13 units from Chicago DC. Returns ATP 2026-05-02 for all SKUs.",                    endpoint: "calculate-atp",             method: "GET"  },
        { name: "get_shipping_options",      description: "Returns 3 fulfillment options: Option A split-ship $1,840 (rec), Option B consolidated $2,120, Option C air express $3,400.", endpoint: "get-shipping-options",      method: "GET"  },
        { name: "reserve_inventory",         description: "Reserves all 13 units from Chicago DC under Option A. Issues pick tickets PT-CHI-7842-A/B/C, clears VAL-003.",               endpoint: "reserve-inventory",         method: "POST" },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ──────────────────────────────────────────────
export const OTC_ORDER_KB_DEFS = [
  { name: "Order Management Policy Library",    description: "NovaTech order management policies: RUSH order SLA definitions, MSA contract terms, credit limit pre-authorization thresholds, address validation rules, and ASC 606 revenue recognition guidance." },
  { name: "Credit & Risk Assessment Framework", description: "Customer credit assessment methodology: risk scoring models, payment history analysis, AR aging interpretation, temporary limit authority matrix, and A+/A/B-rated customer approval workflows." },
  { name: "Inventory & Fulfillment Playbook",   description: "Warehouse fulfillment strategies: ATP calculation rules, single vs. split-ship cost analysis, carbon footprint estimation models, CSAT prediction models, and carrier SLA definitions." },
] as const;

// ─── Skill definitions (3 per agent = 9 total) ───────────────────────────────
export const OTC_ORDER_SKILLS = [
  // Agent OTC-AGT-002: Order Validation & Promise Agent
  {
    name: "Order Validation Logic",
    description: "Applies NovaTech's 8-point order validation checklist: header completeness, credit hold, inventory allocation, address verification, pricing integrity, export compliance, RUSH prioritization, and ASC 606 treatment.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["order_validation", "checklist", "erp", "rush_order"],
    agentKey: "orderValidation",
  },
  {
    name: "Address Discrepancy Resolution",
    description: "Resolves ship-to address conflicts between ERP master records and inbound PO ship-to fields using prior delivery history, facility type classification, and confidence scoring.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["address_validation", "erp", "ship_to", "confidence_scoring"],
    agentKey: "orderValidation",
  },
  {
    name: "Order Release Orchestration",
    description: "Coordinates the final order release into ERP: sequences pick-ticket generation, warehouse notification, customer confirmation email, and invoice draft creation after all validation holds are cleared.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["order_release", "erp", "pick_ticket", "invoice"],
    agentKey: "orderValidation",
  },

  // Agent OTC-AGT-003: Customer Credit & Risk Assessment Agent
  {
    name: "Credit Exposure Analysis",
    description: "Quantifies credit exposure impact of inbound orders against credit limits, projects post-order exposure ratios, and determines whether temporary limit adjustment is within automated pre-authorization thresholds.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["credit_exposure", "risk_assessment", "credit_limit", "ar"],
    agentKey: "creditRisk",
  },
  {
    name: "Payment History Scoring",
    description: "Scores customer payment behavior using AR aging, days-to-pay average, NSF history, late payment frequency, and relationship tenure to produce a composite payment reliability rating.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["payment_history", "ar_aging", "risk_scoring", "relationship"],
    agentKey: "creditRisk",
  },
  {
    name: "Automated Credit Decision Engine",
    description: "Applies NovaTech's tiered credit approval matrix to recommend APPROVE, APPROVE_WITH_TEMP_LIMIT_INCREASE, ESCALATE_TO_CREDIT_COMMITTEE, or HOLD based on composite risk signals.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["credit_decision", "approval_matrix", "automation", "escalation"],
    agentKey: "creditRisk",
  },

  // Agent OTC-AGT-004: Inventory Availability & Promise Agent
  {
    name: "Available-to-Promise Calculation",
    description: "Computes ATP dates across warehouse network by netting on-hand against reservations, in-transit receipts, and pending orders to confirm earliest fulfillment commitment for RUSH orders.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["atp", "inventory", "warehouse", "fulfillment"],
    agentKey: "inventoryPromise",
  },
  {
    name: "Split-Ship Cost Analysis",
    description: "Evaluates fulfillment options across the warehouse network, computing total landed cost (shipping + surcharge + handling), carbon footprint, and CSAT impact to recommend the optimal fulfillment strategy.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["split_ship", "fulfillment", "cost_analysis", "carbon"],
    agentKey: "inventoryPromise",
  },
  {
    name: "Inventory Reservation & Pick-Ticket Generation",
    description: "Reserves confirmed inventory units at the selected warehouse, generates deterministic pick tickets, and updates warehouse management system with RUSH priority flag and carrier booking.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["reservation", "pick_ticket", "wms", "rush"],
    agentKey: "inventoryPromise",
  },
] as const;

// ─── Agent definitions (core metadata, no system prompts) ─────────────────────
export const OTC_ORDER_AGENT_DEFS = [
  {
    key:            "orderValidation",
    externalId:     "OTC-AGT-002",
    name:           OTC_AGT_002_NAME,
    description:    "Lead orchestrator for NovaTech's Order Validation & Promise pipeline. Validates 8-point order checklist, resolves ship-to address discrepancies, synthesises parallel agent outputs, and releases orders into ERP with full audit trail.",
    mcpServerName:  "OTC Order — OMS Validation Gateway",
    kbName:         "Order Management Policy Library",
    skillNames:     ["Order Validation Logic", "Address Discrepancy Resolution", "Order Release Orchestration"],
    department:     "Order Management",
    complianceTags: ["ASC-606", "EAR99", "OFAC-CLEAR"],
    ontologyTags:   ["Purchase Order", "RUSH Order", "Ship-To Address", "ERP Release"],
  },
  {
    key:            "creditRisk",
    externalId:     "OTC-AGT-003",
    name:           OTC_AGT_003_NAME,
    description:    "Assesses customer credit risk in real time for NovaTech's Order-to-Cash pipeline. Retrieves credit exposure, scores payment history, applies the automated credit decision matrix, and approves temporary limit adjustments within pre-authorization thresholds.",
    mcpServerName:  "OTC Order — Credit & Risk Engine",
    kbName:         "Credit & Risk Assessment Framework",
    skillNames:     ["Credit Exposure Analysis", "Payment History Scoring", "Automated Credit Decision Engine"],
    department:     "Credit Management",
    complianceTags: ["CECL", "SOX-AR-CONTROLS"],
    ontologyTags:   ["Credit Exposure", "Credit Limit", "Accounts Receivable"],
  },
  {
    key:            "inventoryPromise",
    externalId:     "OTC-AGT-004",
    name:           OTC_AGT_004_NAME,
    description:    "Resolves inventory availability and delivery promise for NovaTech RUSH orders. Runs ATP calculations across the warehouse network, evaluates split-ship vs. single-source trade-offs with carbon/CSAT scoring, and reserves inventory with pick-ticket generation.",
    mcpServerName:  "OTC Order — Inventory & Promise Engine",
    kbName:         "Inventory & Fulfillment Playbook",
    skillNames:     ["Available-to-Promise Calculation", "Split-Ship Cost Analysis", "Inventory Reservation & Pick-Ticket Generation"],
    department:     "Supply Chain & Logistics",
    complianceTags: ["GAAP-INVENTORY", "ASC-330"],
    ontologyTags:   ["Available-to-Promise", "Split-Ship", "Warehouse Network"],
  },
] as const;

// ─── Governance policy definitions ───────────────────────────────────────────
export const OTC_ORDER_POLICY_DEFS = [
  {
    name:        "RUSH Order SLA Enforcement",
    domain:      "order_governance",
    description: "Mandates that RUSH-classified orders are resolved and released within 4 hours of submission. All blocking validation holds must be cleared by agents within the automated resolution authority before human escalation.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "4-Hour Resolution Window", description: "RUSH orders must have all VAL holds cleared within 4 hours; breach triggers VP alert" },
      { name: "Automated First-Try",      description: "Agents must attempt automated resolution before any human escalation path" },
      { name: "Audit Trail Required",     description: "Every hold clearance must be logged with agent ID, method, timestamp, and rationale" },
    ]},
  },
  {
    name:        "Credit Pre-Authorization Matrix",
    domain:      "credit_governance",
    description: "Defines the tiered automated credit approval authority for order validation agents. A+ customers may receive up to $1M temporary limit extensions without human approval.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "A+ Automated Authority",    description: "Agents may approve temporary 60-day limit extensions up to $1M for A+ rated customers with zero delinquency" },
      { name: "Limit Memo Required",       description: "All automated limit extensions must generate a signed decision memo in the CRM credit record" },
      { name: "90-Day Normalization Rule", description: "Temporary limits may only be granted when inbound AR is projected to normalize exposure within 90 days" },
    ]},
  },
  {
    name:        "Inventory Promise Accuracy",
    domain:      "fulfillment_governance",
    description: "Requires that all delivery promises issued to customers are based on confirmed ATP dates with pick-ticket generation. No promise may be issued without confirmed inventory reservation.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "ATP-Based Promises Only",    description: "Delivery dates must be computed from confirmed ATP, not estimated; no buffer promises" },
      { name: "Reservation Before Promise", description: "Inventory must be reserved (pick tickets generated) before customer delivery promise is issued" },
      { name: "Carbon-Aware Routing",       description: "Fulfillment recommendations must include carbon footprint data; lowest-carbon option that meets SLA is preferred" },
    ]},
  },
] as const;

// ─── Ontology concepts (12 total) ─────────────────────────────────────────────
export const OTC_ORDER_ONTOLOGY_CONCEPTS = [
  { label: "Purchase Order",          category: "document",                  description: "Formal buyer-issued document committing to purchase goods at agreed price and terms; triggers order-to-cash validation pipeline.", tags: ["po", "order", "b2b"] },
  { label: "RUSH Order",              category: "order_classification",      description: "High-priority order classification requiring expedited processing and SLA-bound validation resolution within 4 hours.",               tags: ["rush", "priority", "sla"] },
  { label: "Credit Exposure",         category: "financial_metric",          description: "Total outstanding customer balance including open AR plus pending approved orders, expressed as a percentage of credit limit.",       tags: ["credit", "exposure", "ar"] },
  { label: "Credit Limit",            category: "credit_control",            description: "Maximum approved outstanding balance for a customer; may be temporarily increased via pre-authorization matrix.",                     tags: ["credit_limit", "approval", "temporary"] },
  { label: "Available-to-Promise",    category: "inventory_concept",         description: "Earliest date on which confirmed uncommitted inventory can be committed to a customer order.",                                        tags: ["atp", "inventory", "commitment"] },
  { label: "Split-Ship",              category: "fulfillment_strategy",      description: "Fulfillment method using multiple warehouse locations to satisfy a single order; incurs surcharges vs. single-source.",               tags: ["split_ship", "warehouse", "fulfillment"] },
  { label: "Ship-To Address",         category: "logistics_data",            description: "Physical delivery address for an order as specified in the PO; must be validated against ERP master and delivery history.",          tags: ["address", "ship_to", "logistics"] },
  { label: "Accounts Receivable",     category: "financial_metric",          description: "Outstanding invoiced amounts owed by a customer, classified by aging buckets to assess collection risk.",                             tags: ["ar", "aging", "receivable"] },
  { label: "ERP Release",             category: "process_event",             description: "The point at which a validated order is transmitted to ERP, triggering pick-ticket generation, warehouse notification, and invoice.", tags: ["erp", "release", "order_management"] },
  { label: "Warehouse Network",       category: "logistics_infrastructure",  description: "The set of fulfillment centers available to satisfy an order; evaluated by distance, transit time, inventory, and cost.",           tags: ["warehouse", "network", "dc"] },
  { label: "Carbon Footprint",        category: "sustainability_metric",     description: "CO2-equivalent emissions generated by a shipment, used to evaluate fulfillment options and support sustainability reporting.",        tags: ["carbon", "co2", "sustainability", "esg"] },
  { label: "Delivery Promise",        category: "commitment",                description: "Formal committed delivery date communicated to the customer, backed by confirmed inventory ATP and carrier booking.",                 tags: ["delivery", "promise", "commitment", "sla"] },
] as const;
