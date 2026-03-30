#!/usr/bin/env bash
# =============================================================================
# ATLAS — Order Validation & Promise Agent (OTC-AGT-002) — Dev Provisioning
# Generated: 2026-03-30
#
# SINGLE COMMAND TO RUN (from Replit workspace):
#   bash provision_otc_agt_002_dev.sh
#
# REQUIREMENTS: curl, jq
# =============================================================================

set -euo pipefail

BASE_URL="http://localhost:5000"

echo ""
echo "=================================================="
echo " ATLAS — OTC-AGT-002 Order Validation & Promise Agent"
echo " Target: $BASE_URL  (dev / staging)"
echo "=================================================="
echo ""

if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required."
  echo "  macOS:  brew install jq"
  echo "  Linux:  sudo apt-get install jq"
  exit 1
fi

# Helper: POST to endpoint, print label to stderr, return ID on stdout
post_api() {
  local label="$1" endpoint="$2" payload_file="$3"
  local response id
  response=$(curl -s -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d @"${payload_file}")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "  ✗ FAILED: $label" >&2
    echo "    Response: $response" >&2
    exit 1
  fi
  echo "  ✓ $label → $id" >&2
  echo "$id"
}

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

# =============================================================================
# STEP 1: Create 6 Skills
# =============================================================================
echo "STEP 1: Creating 6 Skills..." >&2

cat > "$WORK/s1.json" <<'ENDJSON'
{
  "name": "Customer Credit Check",
  "description": "Real-time credit limit and exposure calculation against ERP financial data. Retrieves current credit limit, outstanding balance, aged receivables, dunning level, and payment terms for the customer account. Returns a credit decision (approve, conditional, hold) with supporting rationale and exposure metrics to enable the agent to determine whether the order can proceed, require a deposit, or must be placed on credit hold.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["erp-credit-api", "accounts-receivable-service", "dunning-engine"],
  "tags": ["order-validation", "credit-check", "erp", "accounts-receivable", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "credit.check_limit",
    "credit.get_exposure",
    "credit.get_payment_terms",
    "credit.get_dunning_level",
    "credit.request_manual_override"
  ],
  "markdownBody": "# Customer Credit Check Skill\n\n## Purpose\nProvides real-time credit limit and exposure assessment for a given customer account, enabling the Order Validation & Promise Agent to make an informed credit decision before committing an order.\n\n## Process\n1. Look up customer account ID in ERP to fetch current credit limit\n2. Query accounts receivable for outstanding balance and aged receivables buckets (0-30, 31-60, 61-90, 90+ days)\n3. Check dunning level (e.g., D0=good standing, D1=first notice, D2=final notice, D3=collections)\n4. Calculate credit exposure: outstanding + pending unshipped orders + current order value\n5. Compute available credit: credit limit minus total exposure\n6. Apply credit decision logic:\n   - Approve: exposure < 80% of limit, dunning D0/D1, no holds\n   - Conditional: exposure 80-100% of limit (require partial prepayment or manager approval)\n   - Hold: exposure > 100% of limit OR dunning D2/D3 OR existing credit hold flag\n7. Return decision with rationale, exact exposure figures, and recommended action\n\n## Fallback Behavior\n- If ERP credit API is unavailable: apply cached credit data with 20% haircut to last-known limit (see Runbook: Credit Check Service Down)\n- Log staleness warning on order record; notify credit manager\n\n## Outputs\n- creditDecision: approve | conditional | hold\n- creditLimit: number (USD)\n- totalExposure: number (USD)\n- availableCredit: number (USD)\n- dunningLevel: D0 | D1 | D2 | D3\n- recommendedAction: string\n- dataSource: live | cached\n- cacheAgeMinutes: number (null if live)\n\n## Compliance Notes\n- SOX: All credit decisions logged with actor, timestamp, and supporting data\n- GDPR: Financial data accessed under legitimate interest (B2B pre-contractual); minimized to required fields only",
  "status": "active"
}
ENDJSON
S1=$(post_api "Customer Credit Check Skill" "/api/skills" "$WORK/s1.json")

cat > "$WORK/s2.json" <<'ENDJSON'
{
  "name": "Address Validation",
  "description": "Validates, standardizes, and enriches shipping and billing addresses against authoritative address databases (USPS CASS, Google Address Validation API, or Loqate). Returns a standardized address with delivery confirmation, tax jurisdiction code, residential/commercial flag, and carrier accessibility indicators. Supports international address formats and PO Box / military APO/FPO address handling.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["address-validation-api", "usps-cass-service", "loqate-api", "tax-jurisdiction-db"],
  "tags": ["order-validation", "address", "usps", "tax-jurisdiction", "shipping", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "address.validate",
    "address.standardize",
    "address.get_tax_jurisdiction",
    "address.check_carrier_accessibility",
    "address.verify_po_box"
  ],
  "markdownBody": "# Address Validation Skill\n\n## Purpose\nValidates and standardizes ship-to and bill-to addresses to ensure deliverability, accurate tax jurisdiction assignment, and carrier accessibility before committing an order.\n\n## Process\n1. Normalize raw address input (handle abbreviations, missing suite numbers, transposed zip codes)\n2. Submit to USPS CASS certification service for domestic US addresses\n3. For international addresses: route to Loqate or Google Address Validation API\n4. Validate deliverability (physical location exists and accepts carrier delivery)\n5. Detect special address types:\n   - PO Boxes: flag if carrier restrictions apply for the selected service level\n   - Military APO/FPO: apply military mail routing rules\n   - Residential vs. Commercial: apply correct carrier surcharges\n6. Resolve tax jurisdiction code (state, county, city) from standardized coordinates / ZIP+4\n7. Check carrier accessibility for preferred carrier on the order\n8. Return standardized address with confidence score\n\n## Validation Outcomes\n- VALID: Address confirmed deliverable, standardized\n- VALID_WITH_CORRECTION: Corrected and confirmed deliverable\n- UNDELIVERABLE: Cannot be confirmed, requires manual review\n- MISSING_UNIT: Valid building but unit/suite/apt missing\n\n## Fallback Behavior\n- If all validation APIs fail: queue order for manual address review (see Runbook: Address Validation Failure)\n- Apply partial validation warning on order; do not block unless address completely unresolvable\n\n## Outputs\n- validationStatus: VALID | VALID_WITH_CORRECTION | UNDELIVERABLE | MISSING_UNIT\n- standardizedAddress: object {line1, line2, city, state, zip, country, zip4}\n- taxJurisdictionCode: string (e.g., 'CA_LOS_ANGELES_COUNTY')\n- residentialFlag: boolean\n- poBoxFlag: boolean\n- militaryFlag: boolean\n- confidenceScore: number (0.0 to 1.0)\n- carrierAccessible: boolean",
  "status": "active"
}
ENDJSON
S2=$(post_api "Address Validation Skill" "/api/skills" "$WORK/s2.json")

cat > "$WORK/s3.json" <<'ENDJSON'
{
  "name": "Tax Calculation",
  "description": "Calculates applicable taxes for an order based on ship-from and ship-to jurisdiction, product tax codes, and customer tax exemption status. Integrates with Avalara AvaTax, Vertex O Series, or native ERP tax engine. Handles multi-jurisdiction scenarios, nexus rules, economic nexus thresholds, tax holiday periods, and exempt customer certificates. Returns line-item tax breakdown required for compliant order creation and revenue recognition.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["avalara-avatax-api", "vertex-tax-api", "erp-tax-engine", "exemption-certificate-store"],
  "tags": ["order-validation", "tax", "avalara", "vertex", "sales-tax", "nexus", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "tax.calculate",
    "tax.get_jurisdiction_rules",
    "tax.check_exemption",
    "tax.verify_nexus",
    "tax.apply_holiday_period"
  ],
  "markdownBody": "# Tax Calculation Skill\n\n## Purpose\nDetermines the correct tax obligation for each order line based on ship-from/ship-to jurisdiction, product taxability, and customer exemption status, supporting accurate order creation and revenue recognition.\n\n## Process\n1. Resolve ship-from nexus: confirm seller has tax collection obligation in ship-to jurisdiction\n2. Look up customer tax exemption: check exemption certificate repository by state/jurisdiction\n3. Verify exemption validity (expiry date, certificate type: resale, government, 501c3)\n4. Determine product taxability: look up product tax code (PTC) per jurisdiction rules\n5. Check for active tax holidays (e.g., back-to-school, emergency relief periods)\n6. Submit to tax engine (Avalara AvaTax preferred, fallback to Vertex or ERP native)\n7. Receive line-item tax breakdown with jurisdiction breakdown\n8. Apply exemption if valid certificate exists: set tax amount to $0.00 with exemption code\n9. Flag high-value orders for finance review if multi-state tax applies\n\n## Nexus Rules\n- Physical nexus: seller has physical presence in state\n- Economic nexus: seller exceeded $100K revenue or 200 transactions in state (post-South Dakota v. Wayfair)\n- Track nexus exposure for new shipping destinations\n\n## Fallback Behavior\n- If tax engine times out: apply default state tax rate for ship-to jurisdiction (reconciliation flag set)\n- Log reconciliation flag for finance team review (see Runbook: Tax Engine Timeout)\n\n## Outputs\n- lineItemTaxes: array of {lineId, taxableAmount, taxRate, taxAmount, jurisdictions: [{level, name, rate, amount}]}\n- totalTax: number\n- exemptionApplied: boolean\n- exemptionCode: string | null\n- nexusApplied: string[]\n- reconciliationFlagRequired: boolean\n- taxEngineUsed: string",
  "status": "active"
}
ENDJSON
S3=$(post_api "Tax Calculation Skill" "/api/skills" "$WORK/s3.json")

cat > "$WORK/s4.json" <<'ENDJSON'
{
  "name": "ATP/Inventory Check",
  "description": "Queries real-time Available-to-Promise (ATP) quantities across multiple warehouse locations for each order line. Applies allocation logic, safety stock rules, and lead time constraints to determine earliest ship date, quantity available, and whether split shipment or backorder handling is required. Supports multi-location ATP aggregation, first-expiry/first-out (FEFO) allocation for perishables, and demand reservation to prevent double-allocation.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["erp-inventory-api", "warehouse-management-system", "demand-planning-engine", "logistics-routing-service"],
  "tags": ["order-validation", "inventory", "atp", "available-to-promise", "warehouse", "fulfillment", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "inventory.check_atp",
    "inventory.allocate",
    "inventory.get_lead_time",
    "inventory.get_safety_stock",
    "inventory.reserve_demand",
    "inventory.get_locations"
  ],
  "markdownBody": "# ATP/Inventory Check Skill\n\n## Purpose\nDetermines real-time product availability and earliest ship date for each order line, supporting delivery promise commitments and identifying split shipment or backorder requirements before order creation.\n\n## Process\n1. For each order line: query ATP by SKU across all eligible warehouse locations\n2. Filter locations by customer ship-to zone, carrier access, and product storage requirements\n3. Apply safety stock reserve: reduce ATP by safety stock quantity (do not promise safety stock)\n4. Determine best-fit location(s) for order: minimize shipping cost and transit time\n5. Check if full quantity is available from single location (preferred) vs. requires split shipment\n6. If insufficient ATP: check open purchase orders and production receipts for replenishment date\n7. Calculate earliest ship date based on ATP date + pick/pack lead time + carrier transit time\n8. Reserve demand in inventory system to prevent double-allocation (soft reservation, TTL: 30 min)\n9. Handle backorder scenario: offer customer a) wait for backorder fulfillment or b) partial immediate shipment\n\n## Allocation Logic\n- Standard products: FIFO allocation across locations\n- Perishables/expiry-managed: FEFO (First-Expiry, First-Out)\n- Lot-controlled: allocate per lot number from customer preference or regulatory requirement\n- Hazmat: only allocate from certified hazmat-compliant locations\n\n## Fallback Behavior\n- If inventory system unavailable or data stale > 15 minutes: alert with staleness flag; request manual ATP override (see Runbook: Inventory Sync Lag)\n\n## Outputs\n- lineAvailability: array of {lineId, requestedQty, availableQty, backorderQty, locationId, earliestShipDate}\n- overallStatus: FULL | PARTIAL | BACKORDER | UNAVAILABLE\n- splitShipmentRequired: boolean\n- softReservationId: string\n- reservationExpiresAt: datetime\n- dataFreshnessMinutes: number",
  "status": "active"
}
ENDJSON
S4=$(post_api "ATP/Inventory Check Skill" "/api/skills" "$WORK/s4.json")

cat > "$WORK/s5.json" <<'ENDJSON'
{
  "name": "Fraud Detection",
  "description": "Applies pattern-matching and anomaly detection rules to incoming orders to identify potential fraud signals before order acceptance. Checks velocity patterns (same customer, multiple orders in short window), ship-to address anomalies (new or mismatched billing/shipping), first-order risk profiles, unusual quantity spikes, denied party screening (EAR/ITAR/OFAC lists), and cross-references known fraud patterns from historical data. Returns a fraud risk score with supporting signals and recommended action.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["fraud-rules-engine", "ofac-screening-api", "denied-party-list", "velocity-check-service", "order-history-api"],
  "tags": ["order-validation", "fraud-detection", "ofac", "denied-party", "compliance", "ear", "itar", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "fraud.check_velocity",
    "fraud.check_address_anomaly",
    "fraud.screen_denied_party",
    "fraud.check_first_order_profile",
    "fraud.get_risk_score",
    "ofac.screen_customer",
    "ofac.screen_address"
  ],
  "markdownBody": "# Fraud Detection Skill\n\n## Purpose\nScreens incoming orders for fraud and compliance risk signals before commitment, protecting against financial loss, regulatory violations, and reputational harm.\n\n## Detection Checks (executed in parallel)\n\n### 1. Velocity Check\n- Same customer: >3 orders in 24 hours → elevated risk\n- Same ship-to address: >5 orders in 7 days from different customer accounts → high risk\n- Same product + quantity repeated: unusual pattern flag\n\n### 2. Address Anomaly Check\n- Bill-to / ship-to mismatch on first order: moderate risk\n- Ship-to address never used by account before + high order value: elevated risk\n- Freight forwarder or reshipping hub address: high risk for export-controlled products\n\n### 3. Denied Party Screening (EAR/ITAR/OFAC)\n- Screen customer name, company, and all associated contacts against:\n  - BIS Entity List (Export Administration Regulations)\n  - DDTC Debarred Parties (ITAR)\n  - OFAC Specially Designated Nationals (SDN) list\n  - UN Security Council Consolidated List\n- Full hard block if any match found — no override permitted without Legal sign-off\n\n### 4. OFAC Address Screening\n- Screen ship-to country and address against OFAC sanctioned territories\n- Block orders to embargoed countries (Cuba, Iran, North Korea, Syria, Russia-sanctioned regions)\n\n### 5. First-Order Profile\n- New customer (account created < 30 days) + order value > $10,000: elevated risk\n- Payment method mismatch vs. established payment terms: moderate risk\n\n### 6. Quantity Anomaly\n- Quantity ordered > 3x historical average for this SKU/customer: elevated risk\n- Dual-use product + unusual quantity: flag for export classification review\n\n## Risk Score Bands\n- LOW (0-30): Proceed with order normally\n- MODERATE (31-60): Log and monitor; apply secondary review on fulfillment\n- ELEVATED (61-80): Route to Order Operations for manual review before acceptance\n- HIGH (81-100): Hard block pending compliance/legal review\n- DENIED_PARTY_MATCH: Immediate block — no override without Legal VP sign-off\n\n## Outputs\n- riskScore: number (0-100)\n- riskBand: LOW | MODERATE | ELEVATED | HIGH | DENIED_PARTY_MATCH\n- riskSignals: array of {signal, severity, detail}\n- deniedPartyMatch: boolean\n- ofacMatch: boolean\n- recommendedAction: PROCEED | REVIEW | BLOCK\n- screenerVersion: string",
  "status": "active"
}
ENDJSON
S5=$(post_api "Fraud Detection Skill" "/api/skills" "$WORK/s5.json")

cat > "$WORK/s6.json" <<'ENDJSON'
{
  "name": "Order Enrichment",
  "description": "Auto-populates missing or incomplete order fields by retrieving defaults from the customer master record, product master data, contract terms, and organizational defaults. Ensures every order record is complete and consistent before entering the validation workflow, eliminating common data entry gaps that cause downstream processing failures. Applies contract-specific overrides for payment terms, pricing, and service levels.",
  "industry": "enterprise",
  "domain": "Order-Validation",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["crm-customer-api", "erp-customer-master", "contract-repository", "product-master-api", "org-defaults-service"],
  "tags": ["order-validation", "data-enrichment", "customer-master", "contract", "erp", "order-to-cash", "otc-agt-002"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "customer.get_master_record",
    "customer.get_contract_terms",
    "product.get_defaults",
    "order.apply_org_defaults",
    "order.validate_completeness"
  ],
  "markdownBody": "# Order Enrichment Skill\n\n## Purpose\nAuto-fills missing fields in an incoming order from authoritative master data sources, ensuring completeness before validation begins. Prevents orders from failing downstream due to missing data that can be inferred from customer master or contract terms.\n\n## Enrichment Sources and Priority\n| Priority | Source | Fields Provided |\n|---|---|---|\n| 1 (highest) | Active customer contract | Payment terms, special pricing, carrier preference, service level |\n| 2 | Customer master (ERP) | Bill-to address, contact, default ship-to, currency, language |\n| 3 | Product master | Unit of measure, minimum order quantity, shipping class, hazmat flag |\n| 4 | Org defaults | Default warehouse, default carrier, standard payment terms |\n\n## Fields Enriched\n- Payment terms (Net 30, Net 60, PIA, etc.) — from contract or customer master\n- Bill-to address — from ERP customer master if not provided\n- Default ship-to address — from customer master if not provided\n- Currency — from customer master or contract\n- Sales rep / account owner — from CRM assignment\n- Product unit of measure — from product master\n- Minimum order quantity validation — from product master\n- Shipping service level — from contract SLA or customer tier\n- Carrier preference — from customer master or contract\n- Order source channel enrichment (EDI partner ID, portal tenant, manual entry user)\n\n## Completeness Check\nAfter enrichment, validate that all required fields are populated. Required fields:\n- customer_id, bill_to_address, ship_to_address, currency, payment_terms\n- order_lines: [{sku, quantity, unit_of_measure, unit_price}]\n- requested_delivery_date OR allow_backorder flag\n\n## Outputs\n- enrichedOrder: object (fully populated order record)\n- fieldsEnriched: string[] (list of fields that were auto-filled)\n- enrichmentSources: object {fieldName: sourceName}\n- completenessScore: number (0.0 to 1.0)\n- missingRequiredFields: string[] (fields still missing after enrichment)\n- contractApplied: string | null (contract ID if contract terms applied)",
  "status": "active"
}
ENDJSON
S6=$(post_api "Order Enrichment Skill" "/api/skills" "$WORK/s6.json")

echo "" >&2

# =============================================================================
# STEP 2: Create Knowledge Base
# =============================================================================
echo "STEP 2: Creating Knowledge Base..." >&2

cat > "$WORK/kb.json" <<'ENDJSON'
{
  "name": "Order Validation & Promise Knowledge Base",
  "description": "Primary RAG knowledge base for the Order Validation & Promise Agent (OTC-AGT-002). Covers customer master data and credit records, product master with lead times and shipping restrictions, tax rate tables and exemption certificate repository, carrier rate cards and SLAs, order processing SOPs by channel and order type, and historical order exception logs with resolution patterns. Supports retrieval for order enrichment, credit assessment, tax calculation, ATP decisions, and fraud screening.",
  "industry": "enterprise",
  "status": "active",
  "vectorDbType": "pgvector",
  "vectorDbConfig": {"schema": "public", "table": "kb_chunks_otc_order_val", "indexType": "ivfflat", "indexLists": 100},
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,
  "chunkSize": 512,
  "chunkOverlap": 64
}
ENDJSON
KB=$(post_api "Order Validation & Promise Knowledge Base" "/api/knowledge-bases" "$WORK/kb.json")

echo "" >&2

# =============================================================================
# STEP 3: Create 6 Compliance Policies
# =============================================================================
echo "STEP 3: Creating 6 Compliance Policies..." >&2

cat > "$WORK/p1.json" <<'ENDJSON'
{
  "name": "Export Controls Compliance (EAR/ITAR)",
  "domain": "export_controls",
  "scopeType": "agent",
  "status": "active",
  "description": "EAR (15 CFR Parts 730-774) and ITAR (22 CFR Parts 120-130): All orders must be screened against denied party lists (BIS Entity List, DDTC Debarred Parties) and product export classification verified before order acceptance. No order may ship to a sanctioned destination or denied party without documented export license.",
  "policyJson": {
    "regulation": "EAR (15 CFR §730-774) / ITAR (22 CFR §120-130)",
    "requirements": [
      "Screen customer, end-user, and ship-to against BIS Entity List before order acceptance",
      "Screen against DDTC Debarred Parties and Debarred Persons List",
      "Verify product Export Control Classification Number (ECCN) for dual-use items",
      "Block orders to embargoed countries: Cuba (31 CFR 515), Iran (31 CFR 560), North Korea, Syria",
      "ITAR-controlled products: require confirmed US-person end-user or export license before order creation",
      "Log all export screening results with order record; retain 5 years per EAR recordkeeping requirements",
      "Any denied party match: immediate hard block — no manual override without Legal VP + Compliance Officer sign-off"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_order_and_alert_compliance_and_legal"
  },
  "ontologyRefs": [
    {"entity": "Customer", "attribute": "denied_party_status"},
    {"entity": "Order", "attribute": "export_classification"},
    {"entity": "Address", "attribute": "embargoed_destination"}
  ]
}
ENDJSON
P1=$(post_api "Export Controls Compliance (EAR/ITAR)" "/api/policies" "$WORK/p1.json")

cat > "$WORK/p2.json" <<'ENDJSON'
{
  "name": "OFAC Sanctions Screening",
  "domain": "sanctions_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "OFAC (Office of Foreign Assets Control) regulations require screening all customers, beneficial owners, and ship-to addresses against the SDN (Specially Designated Nationals) list and comprehensive country sanctions programs before accepting any order. Any match results in an immediate transaction block.",
  "policyJson": {
    "regulation": "OFAC (31 CFR Chapter V) — SDN List, Country Programs",
    "requirements": [
      "Screen customer legal name, DBA names, and all known aliases against current OFAC SDN list",
      "Screen beneficial owners and principals for corporate customers (ownership ≥ 25%) — OFAC 50% rule",
      "Screen ship-to address country against OFAC comprehensive sanctions programs",
      "Sanctioned programs that hard-block: Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk regions",
      "Fuzzy name matching: flag any ≥ 85% name similarity score for manual review",
      "Hard block on exact or high-confidence match — no exceptions without OFAC license",
      "Log all screening events with OFAC list version, match score, and disposition; retain 5 years",
      "Refresh SDN list cache daily from OFAC API; alert if list is > 24 hours stale"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_order_freeze_account_and_notify_compliance"
  },
  "ontologyRefs": [
    {"entity": "Customer", "attribute": "ofac_screening_status"},
    {"entity": "Address", "attribute": "sanctioned_territory"},
    {"entity": "Order", "attribute": "sanctions_check_timestamp"}
  ]
}
ENDJSON
P2=$(post_api "OFAC Sanctions Screening" "/api/policies" "$WORK/p2.json")

cat > "$WORK/p3.json" <<'ENDJSON'
{
  "name": "Sales Tax Nexus Compliance",
  "domain": "tax_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "South Dakota v. Wayfair (2018) and state economic nexus laws: Tax must be collected and remitted in any state where the seller has established economic nexus (typically >$100K revenue or >200 transactions per year). Orders must have correct tax applied based on current nexus status before creation.",
  "policyJson": {
    "regulation": "South Dakota v. Wayfair (2018) / State Economic Nexus Laws",
    "requirements": [
      "Before creating an order, verify that tax has been calculated for all jurisdictions where nexus exists",
      "Apply current economic nexus thresholds: $100K annual revenue OR 200 transactions in the state",
      "For each new ship-to state: verify nexus status before first order; block if nexus unknown and value > $10,000",
      "Exempt orders: require valid exemption certificate on file (verified, not expired) before zeroing tax",
      "Tax holiday periods: apply automatically when ship date falls within state-declared holiday window",
      "Document tax calculation engine used, tax rates applied, and jurisdiction breakdown per order",
      "Marketplace facilitator rule: if selling through a marketplace, confirm tax remittance responsibility"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "require_tax_review_before_order_creation"
  },
  "ontologyRefs": [
    {"entity": "Order", "attribute": "tax_calculated"},
    {"entity": "Address", "attribute": "tax_jurisdiction_code"},
    {"entity": "Tax", "attribute": "nexus_status"}
  ]
}
ENDJSON
P3=$(post_api "Sales Tax Nexus Compliance" "/api/policies" "$WORK/p3.json")

cat > "$WORK/p4.json" <<'ENDJSON'
{
  "name": "PCI-DSS Payment Data Handling",
  "domain": "payment_security",
  "scopeType": "agent",
  "status": "active",
  "description": "PCI-DSS v4.0: If payment information is captured at order entry, cardholder data must be handled in strict compliance with PCI-DSS requirements. The Order Validation Agent must never log, store, or transmit raw payment card data (PAN, CVV, expiry) outside a PCI-compliant tokenization service.",
  "policyJson": {
    "regulation": "PCI-DSS v4.0",
    "requirements": [
      "Never store, log, or cache raw PANs (Primary Account Numbers), CVV, or expiry dates in agent memory or trace logs",
      "Payment card data accepted at order entry must be immediately tokenized via PCI-compliant payment gateway before any processing",
      "Agent must receive only payment tokens (not raw card data) from upstream systems",
      "If raw card data is received by mistake: immediately purge from memory, log security event to SIEM, notify CISO",
      "Payment status fields on order record: only payment_token, payment_method_type, last4, and expiry_month/year",
      "Transmission of payment tokens: only over TLS 1.2+ encrypted channels",
      "Agent trace logs must be sanitized to remove any payment-related fields beyond allowed fields listed above"
    ],
    "enforcement": "hard_block",
    "violationAction": "purge_payment_data_log_security_event_and_alert_ciso"
  },
  "ontologyRefs": [
    {"entity": "Order", "attribute": "payment_token"},
    {"entity": "Customer", "attribute": "payment_method"}
  ]
}
ENDJSON
P4=$(post_api "PCI-DSS Payment Data Handling" "/api/policies" "$WORK/p4.json")

cat > "$WORK/p5.json" <<'ENDJSON'
{
  "name": "SOX Segregation of Duties — Order Entry",
  "domain": "audit_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "SOX Section 404 / COSO: Segregation of duties requires that the person or system creating an order cannot also be the approver of credit overrides or pricing exceptions on the same order. The Order Validation Agent must enforce this separation, routing exceptions to independent reviewers.",
  "policyJson": {
    "regulation": "SOX Section 404 / COSO Internal Controls Framework",
    "requirements": [
      "Order creation and credit limit override cannot be performed by the same person on the same order",
      "Agent must route credit override requests to an independent Credit Manager (not the account owner or sales rep)",
      "Pricing exceptions on validated orders must be approved by Finance Controller — not by the agent autonomously",
      "All agent-created order records must include: created_by identity, validation_timestamp, and audit_trail_id",
      "Order modification after initial creation requires second-party approval logged in audit trail",
      "Quarterly SOX testing: agent audit logs must be available for sampling within 24 hours of auditor request",
      "Hard segregation: agent cannot approve its own exception — escalation always routes to a human role"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_exception_and_route_to_independent_approver"
  },
  "ontologyRefs": [
    {"entity": "Order", "attribute": "created_by"},
    {"entity": "Customer", "attribute": "credit_override_approver"},
    {"entity": "Order", "attribute": "audit_trail_id"}
  ]
}
ENDJSON
P5=$(post_api "SOX Segregation of Duties — Order Entry" "/api/policies" "$WORK/p5.json")

cat > "$WORK/p6.json" <<'ENDJSON'
{
  "name": "KYC/AML Customer Verification",
  "domain": "kyc_aml",
  "scopeType": "agent",
  "status": "active",
  "description": "KYC (Know Your Customer) and AML (Anti-Money Laundering) requirements apply to high-value orders and regulated product categories. The agent must verify customer identity and beneficial ownership for orders above defined thresholds or involving regulated products, applying enhanced due diligence where required.",
  "policyJson": {
    "regulation": "Bank Secrecy Act / AML regulations / FinCEN CDD Rule (31 CFR 1010.230)",
    "requirements": [
      "For orders > $10,000 from new customers (account < 90 days): require KYC document verification before acceptance",
      "For orders involving regulated product categories (hazmat, dual-use, ITAR-adjacent): apply enhanced due diligence",
      "Beneficial ownership: for corporate customers, collect and verify ownership for individuals with ≥ 25% stake",
      "Flag and report suspicious activity patterns (structuring, unusual payment methods, incomplete identity) to Compliance",
      "Customer Identification Program (CIP): verify legal name, address, date of incorporation, and EIN for new accounts",
      "Politically Exposed Persons (PEP) screening: apply enhanced due diligence for PEP customers or associates",
      "Retain KYC documentation for 5 years after account closure per BSA recordkeeping requirements"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "require_compliance_review_for_high_value_new_customer_orders"
  },
  "ontologyRefs": [
    {"entity": "Customer", "attribute": "kyc_status"},
    {"entity": "Customer", "attribute": "beneficial_owner"},
    {"entity": "Order", "attribute": "aml_flag"}
  ]
}
ENDJSON
P6=$(post_api "KYC/AML Customer Verification" "/api/policies" "$WORK/p6.json")

echo "" >&2

# =============================================================================
# STEP 4: Create Agent (base fields)
# =============================================================================
echo "STEP 4: Creating Order Validation & Promise Agent (OTC-AGT-002)..." >&2

cat > "$WORK/agent.json" <<'ENDJSON'
{
  "name": "Order Validation & Promise Agent",
  "agentType": "single",
  "description": "OTC-AGT-002 | Order Processing | Validates incoming orders against customer data, credit limits, tax jurisdiction, and shipping addresses. Checks stock availability and delivery feasibility, commits delivery promises, and creates clean orders routed to fulfillment. Receives handoff from Quote & Configuration Agent (OTC-AGT-001) and routes to Fulfillment & Exception Agent (OTC-AGT-003). Replaces manual order entry that suffers from incomplete data, inconsistent validation, and delayed processing.",
  "owner": "Order-to-Cash Platform Team",
  "status": "active",
  "riskTier": "HIGH",
  "autonomyMode": "assisted",
  "environment": "staging",
  "modelProvider": "anthropic",
  "modelName": "claude-opus-4-5",
  "department": "Order Management",
  "toolAccessClass": "standard",
  "complianceTags": ["EAR", "ITAR", "OFAC", "SalesTaxNexus", "PCI-DSS", "SOX", "KYC", "AML"],
  "ontologyTags": {
    "process": "Order-to-Cash",
    "stage": "Order Processing",
    "agentCode": "OTC-AGT-002",
    "category": "Order Processing",
    "domain": "Order-Validation",
    "upstreamAgent": "OTC-AGT-001",
    "downstreamAgent": "OTC-AGT-003"
  },
  "systemPrompt": "You are the Order Validation & Promise Agent (OTC-AGT-002) for the Order-to-Cash platform. Your role is to validate every incoming order through a rigorous 11-step process, commit an accurate delivery promise, and create a clean, complete order record routed to fulfillment.\n\n## Your Core Mission\nReplace manual order entry by intelligently:\n1. Enriching incomplete orders with data from customer master and product master\n2. Validating customer creditworthiness and account standing\n3. Confirming real-time inventory availability and calculating the earliest delivery date\n4. Validating and standardizing the shipping address with correct tax jurisdiction\n5. Calculating applicable taxes with exemption handling\n6. Applying correct payment terms from contract or credit policy\n7. Screening every order for fraud signals, denied parties, and sanctions compliance\n8. Committing a delivery date based on ATP, lead time, and logistics\n9. Creating the clean, validated order record in ERP/OMS\n10. Sending order confirmation to the customer\n11. Routing the order to the Fulfillment & Exception Agent (OTC-AGT-003)\n\n## Workflow Steps You Execute\n1. Receive order from accepted quote (OTC-AGT-001 handoff), EDI partner, customer portal, or manual entry\n2. Use Order Enrichment Skill to auto-fill missing fields from customer master and product master\n3. Use Customer Credit Check Skill to validate credit standing and determine if order can proceed\n4. Use ATP/Inventory Check Skill to verify product availability, allocate inventory, and determine ship date\n5. Use Address Validation Skill to standardize ship-to address and resolve tax jurisdiction\n6. Use Tax Calculation Skill to compute taxes per jurisdiction with exemption handling\n7. Apply payment terms from contract or customer credit policy\n8. Use Fraud Detection Skill to screen for order anomalies, denied parties, and sanctions\n9. If any hold condition: route to appropriate human reviewer with full context before proceeding\n10. Commit delivery date based on ATP result, lead time, and logistics schedule\n11. Create order record in ERP/OMS with all validated data\n12. Send structured order confirmation to customer via preferred channel\n13. Emit handoff event to Fulfillment & Exception Agent (OTC-AGT-003)\n\n## Hold Conditions That Require Human Review\n- Credit hold (exposure > credit limit OR dunning D2/D3)\n- Fraud risk score ELEVATED or HIGH\n- Denied party or OFAC match (hard block — Legal VP required)\n- Address completely unresolvable after validation\n- Tax exemption certificate missing or expired for exempt customer\n- KYC required for high-value new customer order\n\n## Key Data Entities You Work With\n- Order: order ID, type, status, source channel, lines, delivery commitment\n- Customer: account, credit limit, credit exposure, payment terms, dunning level\n- Address: ship-to, bill-to, validation status, tax jurisdiction code\n- Inventory: location, ATP quantity, safety stock, lead time, reservation ID\n- Tax: jurisdiction, tax code, exemption certificate, nexus rules, calculated amount\n- Delivery Promise: requested date, committed date, carrier, service level\n\n## Compliance Non-Negotiables\n- Never create an order with a denied party or OFAC-sanctioned customer — always hard block\n- Never bypass credit hold without documented human approval in audit trail\n- Never store raw payment card data (PAN, CVV) in any log or trace\n- Always log every validation decision with timestamp, data source, and result for SOX compliance",
  "toolsConfig": {
    "tools": [
      {"id": "order.receive", "name": "Order Intake", "description": "Accept order payload from quote handoff, EDI, portal, or manual entry", "rateLimit": 200, "timeout": 10000},
      {"id": "customer.get_master_record", "name": "Customer Master Lookup", "description": "Retrieve full customer master record from ERP including account status, addresses, contracts", "rateLimit": 200, "timeout": 8000},
      {"id": "customer.get_contract_terms", "name": "Contract Terms Retrieval", "description": "Retrieve active contract for customer including payment terms, pricing, and service level", "rateLimit": 100, "timeout": 8000},
      {"id": "credit.check_limit", "name": "Credit Limit Check", "description": "Query real-time credit limit and available credit for customer account", "rateLimit": 200, "timeout": 10000},
      {"id": "credit.get_exposure", "name": "Credit Exposure Calculation", "description": "Calculate total credit exposure including outstanding AR, unshipped orders, and current order", "rateLimit": 200, "timeout": 10000},
      {"id": "credit.get_payment_terms", "name": "Payment Terms Lookup", "description": "Retrieve applicable payment terms from customer master or contract", "rateLimit": 200, "timeout": 5000},
      {"id": "inventory.check_atp", "name": "ATP Query", "description": "Query available-to-promise quantity across all warehouse locations for each order line", "rateLimit": 200, "timeout": 15000},
      {"id": "inventory.allocate", "name": "Inventory Allocation", "description": "Soft-allocate inventory for order lines with TTL reservation", "rateLimit": 100, "timeout": 15000},
      {"id": "inventory.get_lead_time", "name": "Lead Time Lookup", "description": "Retrieve pick-pack and transit lead times from fulfillment location to ship-to", "rateLimit": 200, "timeout": 8000},
      {"id": "address.validate", "name": "Address Validation", "description": "Validate and standardize ship-to address against USPS CASS / Loqate", "rateLimit": 200, "timeout": 10000},
      {"id": "address.get_tax_jurisdiction", "name": "Tax Jurisdiction Resolution", "description": "Resolve tax jurisdiction code from standardized ship-to address", "rateLimit": 200, "timeout": 5000},
      {"id": "tax.calculate", "name": "Tax Calculation", "description": "Calculate taxes by jurisdiction using Avalara AvaTax or fallback engine", "rateLimit": 200, "timeout": 15000},
      {"id": "tax.check_exemption", "name": "Tax Exemption Check", "description": "Verify customer tax exemption certificate validity by jurisdiction", "rateLimit": 200, "timeout": 8000},
      {"id": "fraud.check_velocity", "name": "Velocity Check", "description": "Check order velocity patterns for anomaly signals", "rateLimit": 200, "timeout": 5000},
      {"id": "fraud.screen_denied_party", "name": "Denied Party Screening", "description": "Screen customer against BIS Entity List, DDTC Debarred Parties, OFAC SDN list", "rateLimit": 200, "timeout": 15000},
      {"id": "fraud.get_risk_score", "name": "Fraud Risk Score", "description": "Aggregate fraud signals into composite risk score with recommendation", "rateLimit": 200, "timeout": 8000},
      {"id": "ofac.screen_customer", "name": "OFAC Customer Screen", "description": "Screen customer name and aliases against OFAC SDN and country programs", "rateLimit": 200, "timeout": 15000},
      {"id": "order.commit_delivery_date", "name": "Delivery Date Commitment", "description": "Compute and commit earliest delivery date based on ATP, lead time, and carrier schedule", "rateLimit": 100, "timeout": 10000},
      {"id": "order.create_in_erp", "name": "ERP Order Creation", "description": "Create validated order record in ERP/OMS with all enriched and validated data", "rateLimit": 50, "timeout": 30000},
      {"id": "order.send_confirmation", "name": "Order Confirmation Sender", "description": "Send structured order confirmation to customer via preferred channel", "rateLimit": 100, "timeout": 15000}
    ]
  },
  "rollbackPlan": {
    "version": "1.0.0",
    "procedure": "Cancel in-flight order creation, release soft inventory reservations, notify order entry team, revert to manual order validation workflow via Order Operations team",
    "runbook": "See Production Runbooks section — Order Stuck in Validation"
  }
}
ENDJSON
AGENT=$(post_api "Order Validation & Promise Agent (OTC-AGT-002)" "/api/agents" "$WORK/agent.json")

echo "" >&2

# =============================================================================
# STEP 5: PATCH agent with all dynamic IDs
# =============================================================================
echo "STEP 5: Wiring skills, policies, KB config, and blueprint to agent..." >&2

jq -n \
  --arg kb "$KB" \
  --arg s1 "$S1" --arg s2 "$S2" --arg s3 "$S3" \
  --arg s4 "$S4" --arg s5 "$S5" --arg s6 "$S6" \
  --arg p1 "$P1" --arg p2 "$P2" --arg p3 "$P3" \
  --arg p4 "$P4" --arg p5 "$P5" --arg p6 "$P6" \
  '{
    preloadedSkills: [
      {skillId: $s1, loadOrder: 1},
      {skillId: $s2, loadOrder: 2},
      {skillId: $s3, loadOrder: 3},
      {skillId: $s4, loadOrder: 4},
      {skillId: $s5, loadOrder: 5},
      {skillId: $s6, loadOrder: 6}
    ],
    policyBindings: {
      policies: [
        {policyId: $p1, enforcement: "active"},
        {policyId: $p2, enforcement: "active"},
        {policyId: $p3, enforcement: "active"},
        {policyId: $p4, enforcement: "active"},
        {policyId: $p5, enforcement: "active"},
        {policyId: $p6, enforcement: "active"}
      ]
    },
    memoryRagConfig: {
      primaryKnowledgeBase: $kb,
      embeddingModel: "text-embedding-3-small",
      topK: 8,
      scoreThreshold: 0.72,
      chunkStrategy: "fixed_with_overlap",
      sources: [{type: "knowledge_base", id: $kb, description: "Customer master, product master, tax tables, carrier SLAs, order processing SOPs, exemption certificates, historical exception log"}]
    },
    runtimeConfig: {
      prompt: "Validate an incoming order end-to-end through the Order Validation & Promise workflow for the Order-to-Cash process.\n\n## What You Do On Each Invocation\n\nYou receive an order payload from one of these sources: a quote acceptance handoff from OTC-AGT-001, an EDI 850 transaction from a trading partner, a customer portal order submission, or a manually entered order. The payload may be complete or partial — your first action is always enrichment.\n\n## Step-by-Step Execution\n\n**Step 1 — Enrich the Order**\nUse the Order Enrichment Skill to auto-populate any missing fields from customer master, product master, and contract terms. Confirm that all required fields are now populated before proceeding. If critical fields are still missing after enrichment, pause and request them from the order source.\n\n**Step 2 — Validate Customer Credit**\nUse the Customer Credit Check Skill to:\n- Retrieve current credit limit and total exposure (AR outstanding + in-flight orders + this order)\n- Check dunning level and any existing credit holds\n- Receive a credit decision: APPROVE / CONDITIONAL / HOLD\n- If HOLD: pause order, notify credit manager and account owner, route for credit override approval before continuing\n\n**Step 3 — Check Inventory Availability**\nUse the ATP/Inventory Check Skill to:\n- Query ATP for each order line across all eligible warehouse locations\n- Attempt to fulfill from single location (minimize split shipments)\n- If split shipment required: present options to customer before committing\n- Soft-reserve inventory with 30-minute TTL\n- Identify backorder lines and present customer options\n\n**Step 4 — Validate and Standardize Shipping Address**\nUse the Address Validation Skill to:\n- Standardize the ship-to address against USPS CASS / Loqate\n- Resolve tax jurisdiction code from standardized address\n- Flag residential addresses for carrier surcharge application\n- If address UNDELIVERABLE: queue for manual review (see Runbook: Address Validation Failure)\n\n**Step 5 — Calculate Taxes**\nUse the Tax Calculation Skill to:\n- Verify nexus status for ship-to jurisdiction\n- Check customer tax exemption certificate validity\n- Calculate line-item taxes for all applicable jurisdictions\n- If tax engine timeout: apply default rate with reconciliation flag (see Runbook: Tax Engine Timeout)\n\n**Step 6 — Apply Payment Terms**\nFrom credit check enrichment data:\n- Apply contract-specific payment terms if contract is active\n- Otherwise apply customer master default payment terms\n- Flag if payment terms differ from order request and notify sales rep\n\n**Step 7 — Screen for Fraud and Compliance Holds**\nUse the Fraud Detection Skill to run all checks in parallel:\n- Velocity check, address anomaly check, first-order profile, quantity anomaly\n- Denied party screening (BIS Entity List, DDTC, OFAC SDN)\n- OFAC country screening on ship-to address\n- If DENIED_PARTY_MATCH or OFAC_MATCH: immediate hard block — route to Legal VP + Compliance Officer\n- If ELEVATED or HIGH risk: pause order and route to Order Operations for manual review\n\n**Step 8 — Commit Delivery Date**\n- Use ATP result (earliestShipDate) + pick/pack lead time + carrier transit time from ship-to\n- Calculate committed delivery date\n- If requested delivery date is achievable: confirm it\n- If requested date not achievable: return earliest possible date with clear explanation\n\n**Step 9 — Create Order in ERP/OMS**\n- Submit fully validated and enriched order to ERP order creation API\n- Confirm order number returned from ERP\n- Attach all validation artifacts (credit check result, ATP reservation ID, tax calculation ID, fraud screening ID) to order record\n\n**Step 10 — Send Order Confirmation**\n- Send structured confirmation to customer via their preferred channel\n- Include: order number, committed delivery date, line items with quantities, total with taxes, payment terms\n\n**Step 11 — Handoff to Fulfillment**\n- Emit order.validated event to OTC-AGT-003 (Fulfillment & Exception Agent)\n- Pass order ID, ERP order number, ATP reservation ID, committed delivery date, and carrier service level",
      scheduleIntervalMinutes: 0,
      maxToolIterations: 20,
      timeoutMs: 120000,
      latencyTargetMs: 45000,
      retryPolicy: {"maxRetries": 3, "backoffMs": 2000},
      humanInLoopEvents: ["credit_hold", "fraud_elevated", "fraud_high", "denied_party_match", "ofac_match", "address_unresolvable", "kyc_required"],
      auditLevel: "full"
    },
    blueprintJson: {
      nodes: [
        {id: "receive_order",          type: "input_capture",  label: "Receive Order",                      description: "Accept order from quote handoff (OTC-AGT-001), EDI 850, customer portal, or manual entry"},
        {id: "enrich_order",           type: "skill_invoke",   label: "Order Enrichment",                   skillId: $s6, description: "Auto-fill missing fields from customer master, product master, contract terms, and org defaults"},
        {id: "credit_validation",      type: "skill_invoke",   label: "Customer Credit Validation",         skillId: $s1, description: "Check credit limit, exposure, dunning level, and payment terms; determine credit decision"},
        {id: "credit_hold_gate",       type: "human_in_loop",  label: "Credit Hold Review",                 description: "Route to Credit Manager for manual override if credit decision is CONDITIONAL or HOLD", condition: "creditDecision == CONDITIONAL OR creditDecision == HOLD"},
        {id: "inventory_check",        type: "skill_invoke",   label: "ATP / Inventory Check",              skillId: $s4, description: "Query ATP across locations, soft-allocate inventory, calculate earliest ship date"},
        {id: "address_validation",     type: "skill_invoke",   label: "Address Validation",                 skillId: $s2, description: "Standardize ship-to address, resolve tax jurisdiction, flag residential/PO box"},
        {id: "tax_calculation",        type: "skill_invoke",   label: "Tax Calculation",                    skillId: $s3, description: "Calculate taxes by jurisdiction, apply exemptions, handle nexus rules"},
        {id: "payment_terms",          type: "llm_generate",   label: "Apply Payment Terms",                description: "Apply contract or customer master payment terms; flag discrepancies from order request"},
        {id: "fraud_screening",        type: "skill_invoke",   label: "Fraud & Compliance Screening",       skillId: $s5, description: "Velocity check, address anomaly, denied party screening (BIS/DDTC/OFAC), OFAC country screening"},
        {id: "fraud_hold_gate",        type: "human_in_loop",  label: "Fraud / Compliance Hold Review",     description: "Route to Order Operations (ELEVATED/HIGH) or Legal+Compliance (DENIED_PARTY/OFAC match)", condition: "riskBand == ELEVATED OR riskBand == HIGH OR deniedPartyMatch OR ofacMatch"},
        {id: "commit_delivery_date",   type: "tool_call",      label: "Commit Delivery Date",               tool: "order.commit_delivery_date", description: "Calculate and commit delivery date from ATP ship date + lead time + transit time"},
        {id: "create_order_erp",       type: "tool_call",      label: "Create Order in ERP/OMS",            tool: "order.create_in_erp", description: "Submit fully validated order to ERP with all enrichment, validation artifacts attached"},
        {id: "send_confirmation",      type: "tool_call",      label: "Send Order Confirmation",            tool: "order.send_confirmation", description: "Send structured confirmation with order number, delivery date, line items, taxes, payment terms"},
        {id: "handoff_to_fulfillment", type: "event_emit",     label: "Handoff to Fulfillment Agent",       event: "order.validated", target: "OTC-AGT-003", description: "Emit handoff event to Fulfillment & Exception Agent with validated order ID and ATP reservation"}
      ],
      edges: [
        {from: "receive_order",          to: "enrich_order"},
        {from: "enrich_order",           to: "credit_validation"},
        {from: "credit_validation",      to: "credit_hold_gate"},
        {from: "credit_hold_gate",       to: "inventory_check",    condition: "credit_approved"},
        {from: "inventory_check",        to: "address_validation"},
        {from: "address_validation",     to: "tax_calculation"},
        {from: "tax_calculation",        to: "payment_terms"},
        {from: "payment_terms",          to: "fraud_screening"},
        {from: "fraud_screening",        to: "fraud_hold_gate"},
        {from: "fraud_hold_gate",        to: "commit_delivery_date", condition: "fraud_cleared"},
        {from: "commit_delivery_date",   to: "create_order_erp"},
        {from: "create_order_erp",       to: "send_confirmation"},
        {from: "send_confirmation",      to: "handoff_to_fulfillment"}
      ]
    }
  }' > "$WORK/agent_patch.json"

PATCH_RESP=$(curl -s -X PATCH "${BASE_URL}/api/agents/${AGENT}" \
  -H "Content-Type: application/json" \
  -d @"$WORK/agent_patch.json")
PATCH_ID=$(echo "$PATCH_RESP" | jq -r '.id // empty')
if [ -z "$PATCH_ID" ]; then
  echo "  ✗ FAILED: Agent PATCH" >&2
  echo "    Response: $PATCH_RESP" >&2
  exit 1
fi
echo "  ✓ Agent wired with 6 skills, 6 policies, KB, and 14-node blueprint" >&2

echo "" >&2

# =============================================================================
# STEP 6: Link Knowledge Base to Agent
# =============================================================================
echo "STEP 6: Linking Knowledge Base to Agent..." >&2

jq -n --arg kb "$KB" \
  '{knowledgeBaseId: $kb, priority: 1, retrievalConfig: {topK: 8, scoreThreshold: 0.72, hybridSearch: true, reranker: "cross-encoder"}}' \
  > "$WORK/kb_link.json"

KB_LINK=$(curl -s -X POST "${BASE_URL}/api/agents/${AGENT}/knowledge-bases" \
  -H "Content-Type: application/json" \
  -d @"$WORK/kb_link.json")
KB_LINK_ID=$(echo "$KB_LINK" | jq -r '.id // empty')
if [ -z "$KB_LINK_ID" ]; then
  echo "  ✗ FAILED: KB link" >&2
  echo "    Response: $KB_LINK" >&2
  exit 1
fi
echo "  ✓ Knowledge Base linked → $KB_LINK_ID" >&2

echo "" >&2

# =============================================================================
# STEP 7: Create Evaluation Golden Dataset
# =============================================================================
echo "STEP 7: Creating Evaluation Golden Dataset..." >&2

cat > "$WORK/dataset.json" <<'ENDJSON'
{
  "name": "Order Validation & Promise Agent Evaluation Dataset",
  "description": "Evaluation benchmark for OTC-AGT-002. Contains 1000+ historical order submissions with known validation outcomes (pass/fail with reasons). Covers happy-path standard orders, credit limit boundary cases (90%/100%/110% of limit), address edge cases (PO boxes, military APO/FPO, international formats), tax exemption scenarios (resale certificates, government entities, tax holidays), multi-location ATP split shipment scenarios, backorder triggers, and fraud pattern examples (velocity checks, address mismatch, first-order anomalies). Latency benchmark: full validation under 45 seconds.",
  "industry": "enterprise",
  "useCase": "order_validation",
  "version": "1.0.0",
  "testCaseCount": 1000,
  "scenarioCategories": {
    "happyPath": 300,
    "creditBoundaryCases": 120,
    "addressEdgeCases": 100,
    "taxExemptionScenarios": 100,
    "atpSplitShipment": 120,
    "fraudPatterns": 150,
    "complianceCritical": 110
  },
  "qualityCoverage": 0.95,
  "coverageDimensions": [
    {"dimension": "Credit Decision Accuracy", "description": "Agent correctly classifies orders as approve/conditional/hold based on exposure vs. credit limit and dunning status", "targetPassRate": 0.99},
    {"dimension": "Address Validation Accuracy", "description": "Agent correctly standardizes valid addresses and flags undeliverable/incomplete addresses", "targetPassRate": 0.97},
    {"dimension": "Tax Calculation Precision", "description": "Agent calculates correct tax within 0.1% of tax engine reference for all jurisdictions tested", "targetPassRate": 0.99},
    {"dimension": "ATP Check Accuracy", "description": "Agent correctly identifies full/partial/backorder availability and selects optimal fulfillment location", "targetPassRate": 0.98},
    {"dimension": "Denied Party Detection Rate", "description": "Agent correctly blocks 100% of orders to denied parties or OFAC-sanctioned destinations", "targetPassRate": 1.0},
    {"dimension": "Fraud Signal Detection", "description": "Agent correctly identifies ELEVATED or HIGH risk orders requiring review", "targetPassRate": 0.95},
    {"dimension": "Credit Hold Enforcement", "description": "Agent never creates an order that should be on credit hold without human approval", "targetPassRate": 1.0},
    {"dimension": "Delivery Date Accuracy", "description": "Agent commits to a delivery date that is achievable within ±1 business day vs. manual reference", "targetPassRate": 0.96},
    {"dimension": "Order Completeness After Enrichment", "description": "Agent successfully enriches orders to 100% field completeness before validation", "targetPassRate": 0.98},
    {"dimension": "Validation Latency SLA (45s)", "description": "Full 11-step validation completes within 45-second target latency", "targetPassRate": 0.95}
  ],
  "benchmarkAvg": 0.977,
  "benchmarkRange": {"low": 0.95, "high": 1.0},
  "contributorCount": 4,
  "contributors": [
    {"role": "Order Operations Manager", "contribution": "300 happy-path and credit boundary case annotations"},
    {"role": "Credit Manager", "contribution": "120 credit hold scenario validations"},
    {"role": "Tax Compliance Analyst", "contribution": "100 tax exemption and multi-jurisdiction scenario annotations"},
    {"role": "Compliance / Legal", "contribution": "110 export control, OFAC, and fraud pattern annotations"}
  ],
  "performanceBenchmarks": [
    {"metric": "validation_latency_p95", "target": 45000, "unit": "ms", "description": "95th percentile full validation time under 45 seconds"},
    {"metric": "credit_decision_accuracy", "target": 0.99, "unit": "ratio", "description": "Correct credit decision vs. manual credit manager reference"},
    {"metric": "tax_calculation_precision", "target": 0.99, "unit": "ratio", "description": "Tax within 0.1% of tax engine reference amount"},
    {"metric": "denied_party_detection", "target": 1.0, "unit": "ratio", "description": "Zero tolerance: 100% detection of denied party and OFAC matches"},
    {"metric": "credit_hold_false_negative_rate", "target": 0.0, "unit": "ratio", "description": "Zero tolerance: no orders in credit hold state created without human approval"},
    {"metric": "atp_accuracy", "target": 0.98, "unit": "ratio", "description": "Correct ATP availability determination vs. warehouse management system reference"}
  ],
  "dataRecordCount": 1000,
  "tags": ["order-validation", "order-to-cash", "credit-check", "atp", "address-validation", "tax", "fraud", "compliance", "otc-agt-002"],
  "aiGenerated": false,
  "status": "active"
}
ENDJSON
DS=$(post_api "Order Validation Evaluation Dataset" "/api/golden-datasets" "$WORK/dataset.json")

echo "" >&2

# =============================================================================
# STEP 8: Create 6 Operational Runbooks
# =============================================================================
echo "STEP 8: Creating 6 Operational Runbooks..." >&2

cat > "$WORK/rb1.json" <<'ENDJSON'
{
  "name": "Credit Check Service Down",
  "description": "Fallback and recovery procedure when the ERP credit checking service is unavailable. Ensures orders are not blocked indefinitely while maintaining credit risk controls through cached data with reduced limits and manual override workflow.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "automated",
  "triggerConditions": ["erp_credit_api_unavailable", "credit_service_timeout", "credit_data_connection_failed"],
  "steps": [
    {"id": "s1", "label": "Detect credit service outage",          "type": "detection",    "description": "Alert when credit API returns 5xx errors or times out after 3 attempts within 60 seconds; confirm ERP health endpoint status"},
    {"id": "s2", "label": "Activate cached credit fallback",       "type": "action",       "description": "Switch agent to use last-known cached credit data; apply 20% haircut to cached credit limits as risk buffer; set cache staleness flag on all decisions"},
    {"id": "s3", "label": "Flag all orders with staleness warning", "type": "action",       "description": "Attach CREDIT_DATA_STALE flag to every order processed during outage; log cache age in minutes on each order record"},
    {"id": "s4", "label": "Notify credit operations team",         "type": "notification", "description": "Send alert to credit-ops Slack channel and email distribution list; open P1 incident ticket in JIRA with ERP credit API health status"},
    {"id": "s5", "label": "Engage ERP support for diagnosis",      "type": "escalation",   "description": "Page ERP operations team; confirm whether outage is ERP-wide or credit module specific; check ERP maintenance calendar"},
    {"id": "s6", "label": "Manual override process for high-value", "type": "manual",       "description": "For orders > $50,000 during outage: route to Credit Manager for manual credit approval with offline data before order creation"},
    {"id": "s7", "label": "Restore live credit service",           "type": "remediation",  "description": "Confirm ERP credit API restored; run spot-check on 10 accounts to verify data integrity; clear staleness flag"},
    {"id": "s8", "label": "Re-validate stale-flagged orders",      "type": "validation",   "description": "Re-run credit checks on all orders flagged with CREDIT_DATA_STALE during outage; notify credit manager of any retroactive holds"},
    {"id": "s9", "label": "Close incident and post-mortem",        "type": "resolution",   "description": "Close JIRA incident ticket; document root cause, duration, orders affected, and corrective action in incident report"}
  ],
  "approvalGates": [
    {"step": "s6", "role": "Credit Manager", "required": true}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "high",
  "estimatedDuration": "30-90 minutes"
}
ENDJSON
RB1=$(post_api "Runbook: Credit Check Service Down" "/api/runbooks" "$WORK/rb1.json")

cat > "$WORK/rb2.json" <<'ENDJSON'
{
  "name": "Address Validation Failure",
  "description": "Procedure for handling orders where the shipping address cannot be validated by automated services. Ensures orders with problematic addresses are queued for manual review without blocking the entire order pipeline, while maintaining delivery promise accuracy.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "automated",
  "triggerConditions": ["address_validation_api_unavailable", "address_undeliverable", "address_confidence_below_threshold"],
  "steps": [
    {"id": "s1", "label": "Classify validation failure type",       "type": "detection",    "description": "Determine if failure is: API outage (service unavailable), address undeliverable (confirmed bad), or low-confidence (needs human review)"},
    {"id": "s2", "label": "Apply partial validation with warning",  "type": "action",       "description": "If API outage: mark address as PENDING_VALIDATION; allow order to proceed with ADDRESS_UNVERIFIED flag; notify fulfillment not to ship until cleared"},
    {"id": "s3", "label": "Queue for manual address review",        "type": "action",       "description": "Route order to Order Operations review queue with original address, suggested correction (if any), and confidence score"},
    {"id": "s4", "label": "Notify customer for address correction", "type": "notification", "description": "If address is clearly wrong or undeliverable: contact customer via preferred channel requesting corrected ship-to address; provide 24-hour response window"},
    {"id": "s5", "label": "Apply alternative address sources",      "type": "remediation",  "description": "Try secondary validation: if USPS fails, try Loqate or Google; if all fail, check customer master for previously used verified addresses"},
    {"id": "s6", "label": "Manual address resolution",              "type": "manual",       "description": "Order Operations specialist manually verifies address using carrier lookup tools or direct customer contact; updates order with corrected address"},
    {"id": "s7", "label": "Re-validate tax jurisdiction",           "type": "validation",   "description": "After address correction: re-run tax jurisdiction resolution and tax calculation; update order with corrected tax amounts"},
    {"id": "s8", "label": "Release order for fulfillment",          "type": "resolution",   "description": "Clear ADDRESS_UNVERIFIED flag; confirm delivery commitment date is still valid; release order to fulfillment agent"}
  ],
  "approvalGates": [
    {"step": "s6", "role": "Order Operations Specialist", "required": true}
  ],
  "autonomyLevel": "semi_autonomous",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "2-24 hours"
}
ENDJSON
RB2=$(post_api "Runbook: Address Validation Failure" "/api/runbooks" "$WORK/rb2.json")

cat > "$WORK/rb3.json" <<'ENDJSON'
{
  "name": "Tax Engine Timeout",
  "description": "Fallback procedure when the tax calculation engine (Avalara / Vertex) times out or returns errors. Applies default tax rates from the most recent cached rate tables with a reconciliation flag, ensuring orders are not blocked while maintaining tax compliance through post-processing reconciliation.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "automated",
  "triggerConditions": ["tax_engine_timeout", "avalara_api_error", "vertex_api_unavailable", "tax_calculation_failed"],
  "steps": [
    {"id": "s1", "label": "Detect tax engine failure",              "type": "detection",   "description": "Alert when tax API returns timeout or 5xx error after 2 retries with 3-second backoff; log error type and affected orders"},
    {"id": "s2", "label": "Apply default tax rates from cache",     "type": "action",      "description": "Apply most recently cached tax rates for ship-to jurisdiction; use state-level rate only (not county/city breakdown) as conservative fallback"},
    {"id": "s3", "label": "Set reconciliation flag on order",       "type": "action",      "description": "Attach TAX_RECONCILIATION_REQUIRED flag to order record; store estimated tax amount with fallback rate and cache timestamp"},
    {"id": "s4", "label": "Notify tax operations team",             "type": "notification","description": "Alert tax-ops team via Slack and email; open P2 incident ticket; include list of order IDs affected by fallback tax"},
    {"id": "s5", "label": "Escalate to tax engine vendor",          "type": "escalation",  "description": "Open urgent support ticket with Avalara/Vertex; provide error logs and affected volume; request ETA for restoration"},
    {"id": "s6", "label": "Restore tax engine and verify",          "type": "remediation", "description": "Confirm tax engine restored; run test calculation on 5 representative orders to verify results match expected rates"},
    {"id": "s7", "label": "Reconcile affected orders",              "type": "action",      "description": "Re-run tax calculation on all TAX_RECONCILIATION_REQUIRED orders; compare to fallback amounts; generate reconciliation report for Finance"},
    {"id": "s8", "label": "Issue corrected invoices if needed",     "type": "resolution",  "description": "If reconciliation reveals material variance (> $50 per order): issue corrected invoices; notify customers and update AR; document in tax reconciliation log"}
  ],
  "approvalGates": [
    {"step": "s8", "role": "Tax Compliance Manager", "required": true}
  ],
  "autonomyLevel": "semi_autonomous",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "1-4 hours"
}
ENDJSON
RB3=$(post_api "Runbook: Tax Engine Timeout" "/api/runbooks" "$WORK/rb3.json")

cat > "$WORK/rb4.json" <<'ENDJSON'
{
  "name": "Inventory Sync Lag",
  "description": "Procedure for handling inventory data staleness in the ATP check when the warehouse management system sync is delayed or interrupted. Ensures delivery promises are not over-committed while inventory data catches up, with manual ATP override capability for urgent orders.",
  "industry": "enterprise",
  "category": "data_management",
  "triggerType": "automated",
  "triggerConditions": ["inventory_sync_overdue", "atp_data_age_exceeds_threshold", "wms_sync_failed", "inventory_staleness_alert"],
  "steps": [
    {"id": "s1", "label": "Detect inventory data staleness",        "type": "detection",    "description": "Alert when ATP data age exceeds 15 minutes (configurable threshold); compare WMS sync timestamp against current time; check WMS health endpoint"},
    {"id": "s2", "label": "Apply staleness threshold limits",       "type": "action",       "description": "For stale ATP data: reduce available quantities by 10% safety buffer; flag all ATP decisions as STALE_DATA; set shorter soft-reservation TTL (15 min vs. 30 min)"},
    {"id": "s3", "label": "Alert fulfillment and logistics teams",  "type": "notification", "description": "Notify fulfillment ops and logistics coordinators of ATP data staleness; advise to check physical inventory before picking any orders flagged STALE_DATA"},
    {"id": "s4", "label": "Trigger emergency WMS resync",           "type": "remediation",  "description": "Request manual resync from WMS operations team; trigger API call to WMS to push current inventory snapshot to integration layer"},
    {"id": "s5", "label": "Manual ATP override for urgent orders",  "type": "manual",       "description": "For rush or P1 customer orders during sync lag: Fulfillment Coordinator confirms physical inventory via WMS UI and provides manual ATP override; document override reason on order"},
    {"id": "s6", "label": "Validate resync completeness",           "type": "validation",   "description": "After resync: compare inventory counts on 20 high-velocity SKUs against WMS physical snapshot; confirm sync age < 5 minutes"},
    {"id": "s7", "label": "Re-check reservations post-resync",      "type": "validation",   "description": "Re-evaluate all soft reservations made during staleness window; identify and resolve any over-allocation conflicts"},
    {"id": "s8", "label": "Clear staleness flags and normalize",    "type": "resolution",   "description": "Remove STALE_DATA flags from orders processed during lag; restore standard reservation TTL; log incident metrics (duration, SKUs affected, orders impacted)"}
  ],
  "approvalGates": [
    {"step": "s5", "role": "Fulfillment Coordinator", "required": true}
  ],
  "autonomyLevel": "semi_autonomous",
  "status": "active",
  "isPreBuilt": false,
  "severity": "high",
  "estimatedDuration": "30-120 minutes"
}
ENDJSON
RB4=$(post_api "Runbook: Inventory Sync Lag" "/api/runbooks" "$WORK/rb4.json")

cat > "$WORK/rb5.json" <<'ENDJSON'
{
  "name": "Bulk Order Ingestion Failure",
  "description": "Batch retry logic and partial processing procedure for handling failures during bulk order ingestion from EDI partners, portal imports, or overnight batch files. Ensures partial success is preserved, failed orders are retried or escalated, and customers are notified of any processing delays.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "automated",
  "triggerConditions": ["bulk_order_ingestion_failed", "edi_batch_processing_error", "batch_order_import_timeout", "partial_batch_failure"],
  "steps": [
    {"id": "s1", "label": "Detect batch failure and scope",         "type": "detection",    "description": "Identify failure point in batch: pre-validation (parsing failure), validation failure (business rules), or ERP submission failure; determine count of failed vs. successful orders"},
    {"id": "s2", "label": "Preserve successfully processed orders", "type": "action",       "description": "Commit all successfully validated and created orders immediately; do not roll back partial successes; log successful order IDs for customer notification"},
    {"id": "s3", "label": "Isolate and classify failed orders",     "type": "action",       "description": "Extract failed orders with error codes and line-level detail; classify by failure type: data error, validation failure, system error, timeout"},
    {"id": "s4", "label": "Generate partial processing report",     "type": "action",       "description": "Produce structured report: total submitted, successfully processed, failed with reasons, retry-eligible, requires-manual-review; attach to JIRA incident"},
    {"id": "s5", "label": "Auto-retry system-error failures",       "type": "remediation",  "description": "For orders failed due to transient system errors (timeouts, 5xx): retry automatically with exponential backoff; max 3 retries per order; 5 minute intervals"},
    {"id": "s6", "label": "Route data-error failures to operations","type": "escalation",   "description": "For orders failed due to data errors (missing fields, invalid SKUs, bad addresses): route to Order Operations queue with specific error detail for each order"},
    {"id": "s7", "label": "Notify affected customers or EDI partners","type": "notification","description": "Send structured notification to affected customers/EDI partners: orders received, orders processed, orders requiring correction with detail; provide resubmission instructions"},
    {"id": "s8", "label": "Process corrections and resubmissions",  "type": "action",       "description": "Accept corrected order resubmissions from customers/partners; process through normal validation workflow; confirm final order count to customer"},
    {"id": "s9", "label": "Close incident and reconcile",           "type": "resolution",   "description": "Confirm all eligible orders processed or formally closed; file incident report with root cause, duration, orders affected, and prevention recommendations"}
  ],
  "approvalGates": [
    {"step": "s4", "role": "Order Operations Manager", "required": true}
  ],
  "autonomyLevel": "semi_autonomous",
  "status": "active",
  "isPreBuilt": false,
  "severity": "high",
  "estimatedDuration": "2-8 hours"
}
ENDJSON
RB5=$(post_api "Runbook: Bulk Order Ingestion Failure" "/api/runbooks" "$WORK/rb5.json")

cat > "$WORK/rb6.json" <<'ENDJSON'
{
  "name": "Order Stuck in Validation",
  "description": "Timeout thresholds, auto-escalation, and manual release procedure for orders that are stuck in the validation workflow due to system hangs, human review queues exceeding SLA, or unresolvable validation loops. Prevents orders from being lost or indefinitely delayed without customer visibility.",
  "industry": "enterprise",
  "category": "escalation",
  "triggerType": "automated",
  "triggerConditions": ["order_validation_timeout", "human_review_sla_breached", "validation_step_hung", "order_stuck_in_queue_over_threshold"],
  "steps": [
    {"id": "s1", "label": "Detect stuck order via timeout monitor",  "type": "detection",    "description": "Alert when any order remains in VALIDATING status for > 30 minutes without state change; check which validation step is stuck"},
    {"id": "s2", "label": "Classify stuck reason",                   "type": "detection",    "description": "Determine root cause: system hang (validation service unresponsive), human review queue backlog (reviewer not actioning), or infinite retry loop (systematic error)"},
    {"id": "s3", "label": "Auto-resume if system hang detected",     "type": "action",       "description": "If validation service hang: kill and restart the stuck validation process; replay from last successful checkpoint; do not re-run completed validation steps"},
    {"id": "s4", "label": "Escalate human review SLA breach",        "type": "notification", "description": "If stuck due to human review queue: send reminder to assigned reviewer; if SLA breached > 2 hours, escalate to their manager with order context and business urgency"},
    {"id": "s5", "label": "Notify customer of delay",                "type": "notification", "description": "If validation stuck > 1 hour: send holding notification to customer acknowledging order received with estimated processing delay; provide order reference number"},
    {"id": "s6", "label": "Manual release by Order Operations",      "type": "manual",       "description": "If auto-resume fails or root cause unresolved within 2 hours: Order Operations Specialist manually reviews validation state, resolves blocking issue, and manually advances or resets order"},
    {"id": "s7", "label": "Release soft inventory reservations",     "type": "action",       "description": "If order has been stuck for > reservation TTL (30 min): explicitly release soft inventory reservations to prevent permanent inventory lockup; re-acquire on resume"},
    {"id": "s8", "label": "Complete validation or cancel order",     "type": "resolution",   "description": "After manual intervention: either complete remaining validation steps and create order, or formally cancel with documented reason and customer notification if unresolvable"},
    {"id": "s9", "label": "Post-mortem and automation fix",          "type": "resolution",   "description": "Document root cause of stuck order; if systematic issue: open engineering ticket for automation fix; update runbook with new detection thresholds if needed"}
  ],
  "approvalGates": [
    {"step": "s6", "role": "Order Operations Specialist", "required": true},
    {"step": "s8", "role": "Order Operations Manager", "required": true}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "1-4 hours"
}
ENDJSON
RB6=$(post_api "Runbook: Order Stuck in Validation" "/api/runbooks" "$WORK/rb6.json")

echo "" >&2

# =============================================================================
# STEP 9: Create Eval Suite and Set evalBindings on Agent
# =============================================================================
echo "STEP 9: Creating Eval Suite and wiring evalBindings to agent..." >&2

jq -n --arg agent "$AGENT" --arg ds "$DS" '{
  "agentId": $agent,
  "name": "OTC-AGT-002 Order Validation Regression Suite",
  "type": "regression",
  "industry": "enterprise",
  "goldenDatasetId": $ds,
  "schedule": "on_deploy",
  "thresholdConfig": {
    "minPassRate": 0.95,
    "criticalDimensions": ["denied_party_detection", "credit_hold_false_negative_rate"],
    "criticalMinPassRate": 1.0
  },
  "scorerConfig": {
    "primaryScorer": "exact_match",
    "fallbackScorer": "llm_judge",
    "taxTolerance": 0.001
  },
  "coverageTags": ["credit-check", "address-validation", "tax-calculation", "atp", "fraud-detection", "ofac", "order-enrichment", "compliance"],
  "environmentThresholds": {
    "production": {"minPassRate": 0.97},
    "staging": {"minPassRate": 0.93}
  }
}' > "$WORK/eval_suite.json"

EVAL_SUITE=$(post_api "OTC-AGT-002 Eval Suite" "/api/evals" "$WORK/eval_suite.json")

EVAL_PATCH=$(curl -s -X PATCH "${BASE_URL}/api/agents/${AGENT}" \
  -H "Content-Type: application/json" \
  -d "{\"evalBindings\": {\"suites\": [{\"suiteId\": \"${EVAL_SUITE}\", \"schedule\": \"on_deploy\", \"environment\": \"staging\"}]}}")
EVAL_PATCH_ID=$(echo "$EVAL_PATCH" | jq -r '.id // empty')
if [ -z "$EVAL_PATCH_ID" ]; then
  echo "  ✗ FAILED: evalBindings PATCH" >&2
  echo "    Response: $EVAL_PATCH" >&2
  exit 1
fi
echo "  ✓ evalBindings wired → suite $EVAL_SUITE" >&2

echo "" >&2

# =============================================================================
# SUMMARY
# =============================================================================
echo "==================================================" >&2
echo " DEV PROVISIONING COMPLETE" >&2
echo "==================================================" >&2
echo "" >&2
echo "Resource Summary (Dev):" >&2
echo "  Agent (OTC-AGT-002):              $AGENT" >&2
echo "  Knowledge Base:                    $KB" >&2
echo "  Golden Evaluation Dataset:         $DS" >&2
echo "" >&2
echo "Skills (6):" >&2
echo "  Customer Credit Check:             $S1" >&2
echo "  Address Validation:                $S2" >&2
echo "  Tax Calculation:                   $S3" >&2
echo "  ATP/Inventory Check:               $S4" >&2
echo "  Fraud Detection:                   $S5" >&2
echo "  Order Enrichment:                  $S6" >&2
echo "" >&2
echo "Policies (6):" >&2
echo "  Export Controls (EAR/ITAR):        $P1" >&2
echo "  OFAC Sanctions Screening:          $P2" >&2
echo "  Sales Tax Nexus Compliance:        $P3" >&2
echo "  PCI-DSS Payment Data:              $P4" >&2
echo "  SOX Segregation of Duties:         $P5" >&2
echo "  KYC/AML Customer Verification:     $P6" >&2
echo "" >&2
echo "Runbooks (6):" >&2
echo "  Credit Check Service Down:         $RB1" >&2
echo "  Address Validation Failure:        $RB2" >&2
echo "  Tax Engine Timeout:                $RB3" >&2
echo "  Inventory Sync Lag:                $RB4" >&2
echo "  Bulk Order Ingestion Failure:      $RB5" >&2
echo "  Order Stuck in Validation:         $RB6" >&2
echo "" >&2
echo "Evaluation:" >&2
echo "  Eval Suite (OTC-AGT-002 regression): $EVAL_SUITE" >&2
echo "  Golden Dataset:                       $DS" >&2
echo "" >&2
echo "All resources created at: $BASE_URL" >&2
echo "==================================================" >&2

# Export IDs for use by migration script
echo "OTC_AGT_002_AGENT=$AGENT"
echo "OTC_AGT_002_KB=$KB"
echo "OTC_AGT_002_DS=$DS"
echo "OTC_AGT_002_S1=$S1"
echo "OTC_AGT_002_S2=$S2"
echo "OTC_AGT_002_S3=$S3"
echo "OTC_AGT_002_S4=$S4"
echo "OTC_AGT_002_S5=$S5"
echo "OTC_AGT_002_S6=$S6"
echo "OTC_AGT_002_P1=$P1"
echo "OTC_AGT_002_P2=$P2"
echo "OTC_AGT_002_P3=$P3"
echo "OTC_AGT_002_P4=$P4"
echo "OTC_AGT_002_P5=$P5"
echo "OTC_AGT_002_P6=$P6"
echo "OTC_AGT_002_RB1=$RB1"
echo "OTC_AGT_002_RB2=$RB2"
echo "OTC_AGT_002_RB3=$RB3"
echo "OTC_AGT_002_RB4=$RB4"
echo "OTC_AGT_002_RB5=$RB5"
echo "OTC_AGT_002_RB6=$RB6"
echo "OTC_AGT_002_EVAL_SUITE=$EVAL_SUITE"
