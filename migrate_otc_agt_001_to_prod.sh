#!/usr/bin/env bash
# =============================================================================
# ATLAS — Quote & Configuration Agent (OTC-AGT-001) — Production Migration
# Generated: 2026-03-28
#
# SINGLE COMMAND TO RUN:
#   bash migrate_otc_agt_001_to_prod.sh
#
# REQUIREMENTS: curl, jq
# =============================================================================

set -euo pipefail

BASE_URL="https://agent-lifecycle-management-platform.replit.app"

echo ""
echo "=================================================="
echo " ATLAS — OTC-AGT-001 Quote & Configuration Agent"
echo " Target: $BASE_URL"
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
  "name": "Product Catalog Retrieval",
  "description": "Performs RAG-based retrieval over product master data, configuration rules, compatibility matrices, and Bill of Materials (BOM) to validate customer requests against available SKUs and bundle options. Surfaces upsell and cross-sell opportunities based on product family relationships.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["product-catalog-connector", "erp-master-data-api", "pgvector"],
  "tags": ["cpq", "product-catalog", "rag", "configuration", "bom", "order-to-cash"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["catalog.search_sku", "catalog.validate_config_rules", "catalog.get_bom", "catalog.list_compatible_products", "catalog.get_product_family"],
  "markdownBody": "# Product Catalog Retrieval Skill\n\n## Purpose\nRetrieves and validates product configurations against the enterprise product master, surfacing compatible options and identifying incompatible combinations before pricing.\n\n## Process\n1. Normalize requested SKUs against product master catalog\n2. Validate configuration rules (mandatory/optional options, incompatibility constraints)\n3. Identify compatible product families for upsell/cross-sell\n4. Retrieve BOM for each configured item\n5. Flag discontinued or region-restricted products\n\n## Outputs\n- Validated product configuration with BOM\n- List of compatible alternatives and upsell options\n- Configuration conflict warnings\n\n## Error Handling\n- If product stale: force refresh from ERP master (see Runbook: Product Catalog Stale Data)\n- If SKU not found: suggest nearest alternatives via semantic search\n- If config conflict: surface specific rule violation with remediation options",
  "status": "active"
}
ENDJSON
S1=$(post_api "Product Catalog Retrieval" "/api/skills" "$WORK/s1.json")

cat > "$WORK/s2.json" <<'ENDJSON'
{
  "name": "Pricing Engine",
  "description": "Applies multi-tier pricing logic, volume discount stacking, contract-specific rate cards, promotional offer evaluation, and currency conversion to produce a validated line-item price for each configured product or bundle. Enforces Robinson-Patman and ASC 606 revenue recognition compliance constraints.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["pricing-rules-engine", "erp-price-list-api", "currency-conversion-service"],
  "tags": ["cpq", "pricing", "discounts", "revenue-recognition", "order-to-cash", "sox"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["pricing.get_base_price", "pricing.apply_volume_tiers", "pricing.apply_contract_rates", "pricing.apply_promotions", "pricing.convert_currency", "pricing.validate_discount_stack"],
  "markdownBody": "# Pricing Engine Skill\n\n## Purpose\nCalculates the validated, compliant price for each quote line item, applying all relevant pricing rules in the correct order of precedence.\n\n## Pricing Hierarchy\n1. Contract-specific rate card (if contract ID present)\n2. Volume tier pricing (based on quantity breaks in price list)\n3. Customer segment pricing (enterprise, SMB, government)\n4. Promotional calendar offers (time-bound)\n5. Manual discount (subject to approval thresholds)\n\n## Compliance Constraints\n- Robinson-Patman: Ensure no price discrimination for equivalent customers without documented justification\n- ASC 606 / IFRS 15: Apply correct transaction price allocation for bundles (SSP)\n- FCPA / UK Bribery: Flag excessive discounts >40% to government accounts for mandatory review\n\n## Error Handling\n- Pricing rule sync failure: fall back to last-synced cached prices, flag quote with staleness warning (see Runbook: Pricing Rule Sync Failure)",
  "status": "active"
}
ENDJSON
S2=$(post_api "Pricing Engine" "/api/skills" "$WORK/s2.json")

cat > "$WORK/s3.json" <<'ENDJSON'
{
  "name": "Approval Routing",
  "description": "Evaluates quote attributes against the discount approval matrix and non-standard term thresholds, determines the correct approver role(s), and routes the approval request with all supporting context. Manages escalation when approvers do not respond within SLA.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["approval-workflow-engine", "crm-user-directory", "notification-service"],
  "tags": ["cpq", "approvals", "discount-governance", "sox", "escalation", "order-to-cash"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["approval.evaluate_thresholds", "approval.lookup_approver", "approval.create_request", "approval.escalate", "notification.send_approval_request"],
  "markdownBody": "# Approval Routing Skill\n\n## Purpose\nDetermines whether a quote requires human approval based on discount depth or non-standard terms, routes to the correct approver, and manages SLA-based escalation.\n\n## Approval Thresholds\n| Discount Level | Approver Role |\n|---|---|\n| 0-10% | Auto-approved |\n| 10-20% | Deal Desk Manager |\n| 20-35% | VP of Sales |\n| 35%+ | CFO or Revenue Committee |\n| Government accounts >20% | Legal + CFO mandatory |\n| Non-standard payment terms | Finance Controller |\n| Non-standard legal terms | General Counsel |\n\n## SOX Compliance\n- All approval decisions logged with: approver identity, timestamp, decision rationale\n- Audit trail maintained for 7 years per SOX requirements\n\n## Error Handling\n- Approval timeout: escalate per matrix, log incident (see Runbook: Approval Timeout)\n- Approver unavailable: delegate to backup approver in directory",
  "status": "active"
}
ENDJSON
S3=$(post_api "Approval Routing" "/api/skills" "$WORK/s3.json")

cat > "$WORK/s4.json" <<'ENDJSON'
{
  "name": "Quote Document Generation",
  "description": "Produces formatted quote documents (PDF/DOCX) with itemized line items, configured pricing, applicable terms and conditions, validity period, and required signature blocks. Supports templates by industry, region, and customer segment with dynamic field population.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["document-generation-service", "template-library", "digital-signature-api"],
  "tags": ["cpq", "quote-generation", "documents", "pdf", "terms-conditions", "order-to-cash"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["doc.select_template", "doc.populate_line_items", "doc.apply_terms", "doc.generate_pdf", "doc.generate_docx", "doc.create_signature_block"],
  "markdownBody": "# Quote Document Generation Skill\n\n## Purpose\nAssembles a professionally formatted, legally compliant quote document from validated line items, pricing, and applicable terms — ready for customer delivery.\n\n## Template Selection Logic\n1. Match customer segment (enterprise, SMB, public sector, partner)\n2. Match region (NA, EMEA, APAC) for regional legal terms\n3. Match industry vertical for industry-specific clauses\n4. Apply custom branding if account-specific template exists\n\n## Document Sections\n- Header: Quote ID, version, validity date, sales rep details\n- Customer block: Billing address, contract reference, account manager\n- Line items table: SKU, description, quantity, unit price, discount, extended price\n- Bundle allocation: ASC 606 / IFRS 15 SSP allocation if bundled items\n- Terms and conditions: Payment terms, delivery SLA, warranty, governing law\n- Pricing notes: Discount justification reference, promotion codes applied\n- Signature block: Customer acceptance, internal approval stamp\n\n## Error Handling\n- If template not found: use default regional template, flag for review\n- If generation error: retry up to 3 times, then create incident ticket (see Runbook: Quote Generation Error)",
  "status": "active"
}
ENDJSON
S4=$(post_api "Quote Document Generation" "/api/skills" "$WORK/s4.json")

cat > "$WORK/s5.json" <<'ENDJSON'
{
  "name": "Customer Context",
  "description": "Retrieves a 360-degree customer profile including account history, active contracts, past quote win/loss data, credit tier, preferred pricing channel, and relationship manager details. Personalizes the quote strategy based on customer segment and deal history.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["crm-api-connector", "contract-management-system", "quote-history-db"],
  "tags": ["cpq", "customer-360", "crm", "personalization", "order-to-cash", "gdpr"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["crm.get_account", "crm.get_active_contracts", "crm.get_quote_history", "crm.get_credit_tier", "crm.get_preferred_channel"],
  "markdownBody": "# Customer Context Skill\n\n## Purpose\nRetrieves the comprehensive customer profile needed to personalize the quote, validate credit standing, and apply contract-specific pricing and terms.\n\n## Data Retrieved\n- Account profile: Segment, vertical, region, annual spend, relationship tier\n- Active contracts: MSA, framework agreements, rate cards, expiry dates\n- Quote history: Last 24 months — won/lost, average discount, preferred product families\n- Credit tier: A/B/C/D tier, credit limit, payment history\n- Preferred channel: Email, customer portal, EDI, API\n- Key contacts: Economic buyer, technical buyer, legal reviewer\n\n## GDPR Compliance\n- Data accessed only for active quote processing (documented legitimate interest)\n- Right to erasure: Customer data not retained in quote cache beyond document validity period\n- Data minimization: Only fields required for personalization are retrieved\n\n## Error Handling\n- If CRM unavailable: proceed with limited context, flag quote for manual review before send\n- If contract expired: surface renewal opportunity alongside quote",
  "status": "active"
}
ENDJSON
S5=$(post_api "Customer Context" "/api/skills" "$WORK/s5.json")

cat > "$WORK/s6.json" <<'ENDJSON'
{
  "name": "Channel Adaptation",
  "description": "Formats and delivers the completed quote through the customer preferred communication channel — email (formatted HTML), customer portal (structured JSON), EDI (ANSI X12 850/855), or REST API response. Adapts content format, file attachments, and metadata to channel requirements.",
  "industry": "enterprise",
  "domain": "Configure-Price-Quote",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["email-delivery-service", "portal-api", "edi-translator", "webhook-dispatcher"],
  "tags": ["cpq", "multi-channel", "edi", "email", "portal", "api", "order-to-cash"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": ["channel.send_email", "channel.push_to_portal", "channel.send_edi", "channel.post_api_response", "channel.track_delivery"],
  "markdownBody": "# Channel Adaptation Skill\n\n## Purpose\nDelivers the completed quote to the customer through their preferred channel, adapting format, structure, and metadata to channel-specific requirements.\n\n## Supported Channels\n| Channel | Format | Use Case |\n|---|---|---|\n| Email | HTML + PDF attachment | SMB, mid-market direct |\n| Customer Portal | Structured JSON | Enterprise self-service |\n| EDI (ANSI X12 855) | EDI transaction set | Large enterprise, retail |\n| REST API | JSON response | Partner integrations, marketplace |\n\n## Quote Status Lifecycle\ndrafted -> approved -> sent -> viewed -> accepted / expired / revised\n\n## Delivery Tracking\n- Each channel delivery generates a tracking event logged to quote audit trail\n- Email: delivery receipt + open tracking\n- Portal: view event on quote record\n- EDI: acknowledgment (997 FA) tracked\n- API: HTTP 200 confirmation logged\n\n## Error Handling\n- If primary channel fails: retry once, then fall back to email\n- Log delivery failure, notify sales rep for manual delivery",
  "status": "active"
}
ENDJSON
S6=$(post_api "Channel Adaptation" "/api/skills" "$WORK/s6.json")

echo "" >&2

# =============================================================================
# STEP 2: Create Knowledge Base
# =============================================================================
echo "STEP 2: Creating Knowledge Base..." >&2

cat > "$WORK/kb.json" <<'ENDJSON'
{
  "name": "Quote & Configuration Knowledge Base",
  "description": "Primary RAG knowledge base for the Quote & Configuration Agent (OTC-AGT-001). Covers product catalog configuration rules, pricing master data, contract library, quote templates, historical win/loss analysis, and competitor intelligence. Supports retrieval for product validation, pricing calculation, and quote personalization.",
  "industry": "enterprise",
  "status": "active",
  "vectorDbType": "pgvector",
  "vectorDbConfig": {"schema": "public", "table": "kb_chunks_otc_quote", "indexType": "ivfflat", "indexLists": 100},
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,
  "chunkSize": 512,
  "chunkOverlap": 64
}
ENDJSON
KB=$(post_api "Quote & Configuration Knowledge Base" "/api/knowledge-bases" "$WORK/kb.json")

echo "" >&2

# =============================================================================
# STEP 3: Create 5 Compliance Policies
# =============================================================================
echo "STEP 3: Creating 5 Compliance Policies..." >&2

cat > "$WORK/p1.json" <<'ENDJSON'
{
  "name": "SOX Pricing Audit Trail",
  "domain": "audit_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "SOX Section 302/906: All pricing decisions, discount approvals, and quote modifications must be logged with approver identity, timestamp, decision rationale, and supporting data. Audit records retained for 7 years.",
  "policyJson": {
    "regulation": "SOX",
    "sections": ["302", "404", "906"],
    "requirements": [
      "Log every pricing decision with: actor, timestamp, before/after values, justification",
      "Log all discount approvals with: approver ID, role, approval timestamp, discount amount, deal context",
      "Maintain immutable audit trail — no post-hoc modification of logged decisions",
      "Retention: 7 years minimum",
      "Audit report available on demand for internal/external auditors"
    ],
    "enforcement": "hard_block",
    "violationAction": "reject_and_alert_compliance_team"
  },
  "ontologyRefs": [{"entity": "Quote", "attribute": "approval", "regulationRef": "SOX"}]
}
ENDJSON
P1=$(post_api "SOX Pricing Audit Trail" "/api/policies" "$WORK/p1.json")

cat > "$WORK/p2.json" <<'ENDJSON'
{
  "name": "Robinson-Patman Price Discrimination Control",
  "domain": "pricing_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "Robinson-Patman Act: Prohibits price discrimination between competing customers purchasing commodities of like grade and quality. Requires documented justification for any differential pricing.",
  "policyJson": {
    "regulation": "Robinson-Patman Act (15 U.S.C. § 13)",
    "requirements": [
      "Do not offer different prices to competing customers for the same product without documented justification",
      "Acceptable justifications: cost-to-serve differential, meeting competitor price in good faith, functional discount",
      "Every differential pricing decision must include a Robinson-Patman justification code",
      "Flag quotes where competing customers in the same geography/segment receive materially different prices"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "require_legal_justification_before_send"
  },
  "ontologyRefs": [{"entity": "Discount", "attribute": "discriminatory_pricing"}]
}
ENDJSON
P2=$(post_api "Robinson-Patman Price Discrimination Control" "/api/policies" "$WORK/p2.json")

cat > "$WORK/p3.json" <<'ENDJSON'
{
  "name": "GDPR Customer Data Handling in Quotes",
  "domain": "data_privacy",
  "scopeType": "agent",
  "status": "active",
  "description": "GDPR Articles 5, 6, 17: Customer personal data used in quote generation must have a documented lawful basis. Data must not be retained beyond quote validity period. Customers may request erasure.",
  "policyJson": {
    "regulation": "GDPR",
    "articles": ["Art.5 (Data Minimization)", "Art.6 (Lawful Basis)", "Art.17 (Right to Erasure)"],
    "requirements": [
      "Lawful basis: Legitimate interest (B2B pre-contractual activity) — document in processing register",
      "Data minimization: retrieve only customer fields required for quote personalization",
      "Quote cache TTL: delete customer PII within 30 days of quote expiry unless contract signed",
      "Right to erasure: honor within 30 days, delete from all quote-related records",
      "No cross-border transfer of EU customer data outside EEA without SCCs or adequacy decision"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_and_notify_dpo"
  },
  "ontologyRefs": [{"entity": "Customer", "attribute": "personal_data"}]
}
ENDJSON
P3=$(post_api "GDPR Customer Data Handling in Quotes" "/api/policies" "$WORK/p3.json")

cat > "$WORK/p4.json" <<'ENDJSON'
{
  "name": "ASC 606 / IFRS 15 Revenue Recognition Compliance",
  "domain": "revenue_recognition",
  "scopeType": "agent",
  "status": "active",
  "description": "ASC 606 / IFRS 15: Transaction price must be allocated to each performance obligation based on Standalone Selling Price (SSP). Quote document must reflect correct per-element pricing for proper revenue recognition.",
  "policyJson": {
    "regulation": "ASC 606 / IFRS 15",
    "requirements": [
      "For bundled quotes: identify each distinct performance obligation",
      "Allocate total transaction price to each obligation using SSP (or residual approach if SSP unobservable)",
      "Quote document must show per-line allocation — not only blended bundle price",
      "Flag variable consideration (volume rebates, milestone payments) for finance review",
      "Revenue deferral schedule appended for multi-period contracts"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "require_finance_review_for_bundles"
  },
  "ontologyRefs": [{"entity": "Quote", "attribute": "bundle_allocation"}, {"entity": "Price List", "attribute": "ssp"}]
}
ENDJSON
P4=$(post_api "ASC 606 / IFRS 15 Revenue Recognition Compliance" "/api/policies" "$WORK/p4.json")

cat > "$WORK/p5.json" <<'ENDJSON'
{
  "name": "Anti-Bribery Discount Control (FCPA / UK Bribery Act)",
  "domain": "anti_bribery",
  "scopeType": "agent",
  "status": "active",
  "description": "FCPA and UK Bribery Act 2010: Excessive discounts to government entities or officials may constitute improper payments. Discounts exceeding 20% to government accounts require dual VP Sales + General Counsel approval.",
  "policyJson": {
    "regulation": "FCPA (15 U.S.C. § 78dd) / UK Bribery Act 2010",
    "requirements": [
      "Identify government and quasi-government customers (CRM segment flag: GOV, SOE)",
      "For GOV/SOE accounts: discount threshold is 20% (vs 35% for commercial)",
      "Discounts >20% to GOV/SOE: require VP Sales + General Counsel co-approval",
      "Co-approval must include written business justification referencing competitive context",
      "All GOV/SOE quotes with >10% discount logged to Anti-Bribery register",
      "No cash-equivalent discounts, gifts, or rebates to government officials"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_until_dual_approval_obtained"
  },
  "ontologyRefs": [{"entity": "Customer", "attribute": "government_flag"}, {"entity": "Discount", "attribute": "government_threshold"}]
}
ENDJSON
P5=$(post_api "Anti-Bribery Discount Control (FCPA / UK Bribery Act)" "/api/policies" "$WORK/p5.json")

echo "" >&2

# =============================================================================
# STEP 4: Create Agent (base fields)
# =============================================================================
echo "STEP 4: Creating Quote & Configuration Agent (OTC-AGT-001)..." >&2

cat > "$WORK/agent.json" <<'ENDJSON'
{
  "name": "Quote & Configuration Agent",
  "agentType": "single",
  "description": "OTC-AGT-001 | Pre-Order | Captures customer requirements, configures product or service bundles with valid options and trade-offs, applies pricing and discount rules, and drafts quotes with required approvals. Replaces manual CPQ (Configure-Price-Quote) workflows that vary by channel and are prone to pricing errors and revenue leakage. Operates within the Order-to-Cash Quote & Price stage.",
  "owner": "Order-to-Cash Platform Team",
  "status": "active",
  "riskTier": "HIGH",
  "autonomyMode": "assisted",
  "environment": "production",
  "modelProvider": "anthropic",
  "modelName": "claude-opus-4-5",
  "department": "Revenue Operations",
  "toolAccessClass": "standard",
  "complianceTags": ["SOX", "GDPR", "Robinson-Patman", "ASC606", "IFRS15", "FCPA", "UKBriberyAct"],
  "ontologyTags": {"process": "Order-to-Cash", "stage": "Quote & Price", "agentCode": "OTC-AGT-001", "category": "Pre-Order", "domain": "Configure-Price-Quote"},
  "systemPrompt": "You are the Quote & Configuration Agent (OTC-AGT-001) for the Order-to-Cash platform. Your role is to guide customers and internal sales teams through the complete quote generation process, from initial product request to approved, delivered quote.\n\n## Your Core Mission\nReplace manual CPQ (Configure-Price-Quote) workflows by intelligently:\n1. Capturing customer requirements and validating them against the product catalog\n2. Configuring valid product/service bundles with clear trade-off explanations\n3. Applying correct pricing with all applicable discounts, volume tiers, and contract rates\n4. Enforcing approval thresholds and routing for human approval when required\n5. Generating a professional quote document and delivering it via the customer preferred channel\n\n## Workflow Steps You Execute\n1. Receive customer request (products, quantities, delivery preferences, contract identifiers)\n2. Use Product Catalog Retrieval skill to match request to catalog and validate configuration rules\n3. Propose bundles with clear trade-offs, surfacing upsell and cross-sell opportunities\n4. Use Pricing Engine skill to apply pricing rules, volume discounts, contract-specific terms, and promotional offers\n5. Use Approval Routing skill to check approval thresholds — route for human approval if thresholds exceeded\n6. Pause and hand off to human approver if thresholds exceeded; resume upon approval\n7. Use Quote Document Generation skill to produce the quote document with all line items, terms, and validity period\n8. Use Channel Adaptation skill to deliver the quote via the customer preferred channel\n9. Track quote status and update CRM (pending -> sent -> accepted/expired/revised)\n10. Emit handoff event to Order Validation Agent (OTC-AGT-002) upon quote acceptance\n\n## Key Data Entities You Work With\n- Product: SKU, product family, configuration rules, Bill of Materials\n- Price List: base price, tier pricing, volume breaks, currency, effective dates\n- Discount: discount type (%, fixed, promotional), approval matrix, stacking rules\n- Quote: quote ID, line items, total, validity, status, version history\n- Customer: account ID, segment, contract ID, credit tier, preferred channel\n- Approval: threshold, approver role, escalation path, SLA\n\n## Compliance Requirements (Non-Negotiable)\n- SOX: Log every pricing decision and discount approval with full audit trail\n- Robinson-Patman: Never discriminate in pricing between competing customers without documented justification\n- GDPR: Minimize customer data access; purge from memory after quote validity expires\n- ASC 606 / IFRS 15: Allocate bundle prices by SSP for each distinct performance obligation\n- FCPA / UK Bribery Act: Government/SOE accounts require dual approval for discounts >20%\n\n## Human-in-the-Loop Gates\nYou MUST pause and request human approval when:\n- Discount exceeds approval threshold for customer segment\n- Non-standard payment terms, SLA, liability, or IP terms are requested\n- Government or SOE customer with discount >20%\n- Quote total exceeds pre-defined deal desk review threshold\n- Pricing rule sync failure has occurred and you are using cached prices",
  "toolsConfig": {
    "tools": [
      {"id": "catalog.search_sku", "name": "Product SKU Search", "description": "Full-text and semantic search over product master catalog", "rateLimit": 100, "timeout": 10000},
      {"id": "catalog.validate_config_rules", "name": "Configuration Rules Validator", "description": "Apply CPQ configuration rules engine to detect conflicts and missing mandatory options", "rateLimit": 50, "timeout": 15000},
      {"id": "catalog.get_bom", "name": "Bill of Materials Retrieval", "description": "Fetch BOM hierarchy for a given SKU", "rateLimit": 100, "timeout": 8000},
      {"id": "pricing.get_base_price", "name": "Base Price Lookup", "description": "Retrieve current base price from ERP price list", "rateLimit": 200, "timeout": 5000},
      {"id": "pricing.apply_volume_tiers", "name": "Volume Tier Pricing", "description": "Calculate tiered pricing from volume break tables", "rateLimit": 200, "timeout": 5000},
      {"id": "pricing.apply_contract_rates", "name": "Contract Rate Application", "description": "Override pricing with contract-specific negotiated rates", "rateLimit": 100, "timeout": 5000},
      {"id": "pricing.validate_discount_stack", "name": "Discount Stack Validator", "description": "Verify stacking rules, cap limits, and compliance constraints", "rateLimit": 100, "timeout": 8000},
      {"id": "approval.evaluate_thresholds", "name": "Approval Threshold Evaluator", "description": "Check quote attributes against discount and term approval matrix", "rateLimit": 50, "timeout": 5000},
      {"id": "approval.create_request", "name": "Approval Request Creator", "description": "Create and route approval request to correct approver with context", "rateLimit": 20, "timeout": 10000},
      {"id": "crm.get_account", "name": "CRM Account Lookup", "description": "Retrieve customer 360 profile including segment, credit tier, and contracts", "rateLimit": 100, "timeout": 8000},
      {"id": "crm.update_quote_status", "name": "Quote Status Updater", "description": "Update CRM quote lifecycle status and add audit event", "rateLimit": 100, "timeout": 5000},
      {"id": "doc.generate_pdf", "name": "PDF Quote Generator", "description": "Generate formatted PDF quote document from template", "rateLimit": 30, "timeout": 30000},
      {"id": "channel.send_email", "name": "Email Quote Delivery", "description": "Send quote via email with PDF attachment", "rateLimit": 50, "timeout": 15000},
      {"id": "channel.push_to_portal", "name": "Portal Quote Push", "description": "Push structured quote JSON to customer self-service portal", "rateLimit": 50, "timeout": 10000},
      {"id": "channel.send_edi", "name": "EDI Quote Transmission", "description": "Transmit quote via ANSI X12 855 EDI to trading partner", "rateLimit": 20, "timeout": 20000}
    ]
  },
  "rollbackPlan": {
    "version": "1.0.0",
    "procedure": "Void in-flight quotes, revert to manual CPQ workflow via Deal Desk, notify affected sales reps",
    "runbook": "See Production Runbooks section 2.6 — Rollback Procedure"
  }
}
ENDJSON
AGENT=$(post_api "Quote & Configuration Agent" "/api/agents" "$WORK/agent.json")

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
  --arg p4 "$P4" --arg p5 "$P5" \
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
        {policyId: $p5, enforcement: "active"}
      ]
    },
    memoryRagConfig: {
      primaryKnowledgeBase: $kb,
      embeddingModel: "text-embedding-3-small",
      topK: 8,
      scoreThreshold: 0.72,
      chunkStrategy: "fixed_with_overlap",
      sources: [{type: "knowledge_base", id: $kb, description: "Product catalog, pricing rules, contract library, quote templates"}]
    },
    runtimeConfig: {
      prompt: "Process an incoming customer quote request end-to-end through the CPQ (Configure-Price-Quote) workflow for the Order-to-Cash process.\n\n## What You Do On Each Invocation\n\nYou receive a structured quote request containing one or more of: product names or SKUs, requested quantities, required delivery date, target region, customer account identifier, contract reference, and any special pricing or configuration requests.\n\n## Step-by-Step Execution\n\n**Step 1 — Validate the Product Configuration**\nUse the Product Catalog Retrieval skill to:\n- Normalize requested product names to canonical SKUs from the enterprise product master\n- Validate all configuration rules (mandatory/optional options, incompatibility constraints, BOM requirements)\n- Identify discontinued or region-restricted products and surface alternatives\n- Suggest compatible upsell or cross-sell products from the same product family\n\n**Step 2 — Build Bundle Proposal**\nAnalyze the validated configuration and:\n- Propose the optimal product/service bundle that satisfies the customer stated needs\n- Present clear trade-offs between bundle options (e.g., standard vs. premium tier, single vs. multi-year)\n- Surface upsell opportunities with ROI justification where pricing data supports it\n- Flag any technically incompatible combinations before proceeding\n\n**Step 3 — Calculate Pricing**\nUse the Pricing Engine skill to apply the full pricing stack:\n1. Look up base price from ERP price list for each SKU\n2. Apply volume tier breaks if quantities qualify for discounted tiers\n3. Apply contract-specific rate card if a contract ID was provided (overrides list price)\n4. Apply active promotional calendar offers if applicable\n5. Apply any manually requested discount (flag if above approval threshold)\n6. Convert to target currency if multi-currency quote requested\n7. Calculate per-line extended price, blended effective discount rate, and total quote value\n8. For bundled items: allocate transaction price by Standalone Selling Price (SSP) per ASC 606/IFRS 15\n\n**Step 4 — Check Approval Requirements**\nUse the Approval Routing skill to evaluate:\n- Is the effective discount within the auto-approval limit? (0-10%: auto-approve)\n- Does the discount require Deal Desk approval? (10-20%)\n- Does the discount require VP Sales approval? (20-35%)\n- Does the discount require CFO/Revenue Committee approval? (35%+)\n- Is this a government or SOE account with discount >20%? Mandatory dual approval (VP Sales + General Counsel) per FCPA/UK Bribery Act\n- Are there non-standard payment terms, SLA modifications, liability caps, or IP terms? Finance Controller or General Counsel required\n\n**Step 5 — Route for Human Approval (if required)**\nIf any approval threshold is triggered:\n- Create an approval request with: quote summary, line items, pricing breakdown, discount justification, customer context\n- Notify the designated approver via their preferred channel (email/Slack/portal)\n- Pause processing and await approval decision\n- Log the approval request with full audit trail per SOX requirements\n- If no response within 4 business hours: escalate to the next approver level\n- Resume processing immediately upon approval; terminate if rejected (return rejection rationale)\n\n**Step 6 — Generate Quote Document**\nUse the Quote Document Generation skill to produce:\n- A formatted PDF quote with: Quote ID (format Q-YYYY-NNNNNN), validity period (default 30 days), itemized line items with per-line pricing, applied discount details, bundle SSP allocation, applicable terms and conditions matched to customer segment and region, and signature block\n- A DOCX version for negotiation if requested\n- A structured JSON summary for CRM ingestion\n\n**Step 7 — Deliver via Preferred Channel**\nUse the Channel Adaptation skill to deliver via customer configured preferred channel:\n- Email: formatted HTML email with PDF attachment, log delivery receipt\n- Customer Portal: push structured quote JSON for self-service viewing and acceptance\n- EDI: transmit ANSI X12 855, track 997 FA acknowledgment\n- REST API: return JSON response to calling system, log HTTP 200 confirmation\n\n**Step 8 — Update Quote Status and Track**\n- Update CRM quote status to sent with timestamp and channel confirmation\n- Set quote expiry reminder for T-7 days before validity expires\n- On acceptance: update CRM to accepted and emit quote.accepted event to Order Validation Agent (OTC-AGT-002)\n- On revision request: increment quote version and restart from Step 1 with revised parameters\n- On expiry: update CRM to expired, notify sales rep for re-engagement\n\n## Compliance Checkpoints (Non-Negotiable)\n- SOX: Every pricing decision, discount, and approval action written to immutable audit log\n- Robinson-Patman: Verify no materially identical customer receives different price without documented justification code\n- GDPR: Access only required customer PII fields; do not cache beyond quote validity period\n- ASC 606 / IFRS 15: Show explicit SSP-based allocation for all bundled line items\n- FCPA / UK Bribery Act: Enforce 20% hard limit for GOV/SOE customers; require dual approval above that threshold",
      scheduleIntervalMinutes: 0,
      maxToolIterations: 15,
      timeoutMs: 60000,
      latencyTargetMs: 30000,
      retryPolicy: {"maxRetries": 2, "backoffMs": 1000},
      humanInLoopEvents: ["approval_required", "pricing_rule_stale", "config_conflict_unresolvable"],
      auditLevel: "full"
    },
    blueprintJson: {
      nodes: [
        {id: "receive_request",     type: "input_capture",  label: "Receive Customer Request",          description: "Capture customer products, quantities, delivery preferences, contract identifiers"},
        {id: "catalog_validation",  type: "skill_invoke",   label: "Product Catalog Validation",        skillId: $s1, description: "Match request to catalog, validate configurability rules, identify compatible alternatives"},
        {id: "bundle_proposal",     type: "llm_generate",   label: "Bundle Proposal with Trade-offs",   description: "Propose product/service bundles with upsell/cross-sell options and trade-off analysis"},
        {id: "pricing_calculation", type: "skill_invoke",   label: "Pricing & Discount Calculation",    skillId: $s2, description: "Apply multi-tier pricing, volume discounts, contract rates, promotional offers, currency conversion"},
        {id: "approval_check",      type: "skill_invoke",   label: "Approval Threshold Check",          skillId: $s3, description: "Evaluate discount and term thresholds against approval matrix"},
        {id: "approval_gate",       type: "human_in_loop",  label: "Human Approval Gate",               description: "Route to approver if thresholds exceeded; block until approved", condition: "discountExceedsThreshold OR nonStandardTerms OR govAccountAbove20pct"},
        {id: "quote_generation",    type: "skill_invoke",   label: "Quote Document Generation",         skillId: $s4, description: "Produce formatted PDF/DOCX quote with line items, terms, validity period"},
        {id: "channel_delivery",    type: "skill_invoke",   label: "Channel Delivery",                  skillId: $s6, description: "Deliver quote via customer preferred channel (email, portal, EDI, API)"},
        {id: "status_tracking",     type: "tool_call",      label: "Quote Status Tracking",             tool: "crm.update_quote_status", description: "Update CRM quote status and track acceptance/expiry"},
        {id: "handoff_to_ovc",      type: "event_emit",     label: "Handoff to Order Validation Agent", event: "quote.accepted", target: "OTC-AGT-002", description: "Emit handoff event to Order Validation & Promise Agent on quote acceptance"}
      ],
      edges: [
        {from: "receive_request",     to: "catalog_validation"},
        {from: "catalog_validation",  to: "bundle_proposal"},
        {from: "bundle_proposal",     to: "pricing_calculation"},
        {from: "pricing_calculation", to: "approval_check"},
        {from: "approval_check",      to: "approval_gate"},
        {from: "approval_gate",       to: "quote_generation",  condition: "approved"},
        {from: "quote_generation",    to: "channel_delivery"},
        {from: "channel_delivery",    to: "status_tracking"},
        {from: "status_tracking",     to: "handoff_to_ovc",    condition: "quote.accepted"}
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
echo "  ✓ Agent wired with 6 skills, 5 policies, KB, and 10-node blueprint" >&2

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
# STEP 7: Create Evaluation Dataset
# =============================================================================
echo "STEP 7: Creating Evaluation Dataset..." >&2

cat > "$WORK/dataset.json" <<'ENDJSON'
{
  "name": "Quote & Configuration Agent Evaluation Dataset",
  "description": "Evaluation benchmark for OTC-AGT-001. Contains 500+ historical quote requests with known correct configurations and prices. Covers happy-path direct quotes, edge cases (discontinued products, cross-region pricing, multi-currency), approval boundary tests (at/above/below discount thresholds), bundle conflict scenarios (incompatible product combinations), and regression cases from previously mis-priced quotes. Latency benchmark: quote generation under 30 seconds.",
  "industry": "enterprise",
  "useCase": "configure_price_quote",
  "version": "1.0.0",
  "testCaseCount": 500,
  "scenarioCategories": {"happyPath": 200, "edgeCases": 150, "adversarial": 75, "complianceCritical": 75},
  "qualityCoverage": 0.94,
  "coverageDimensions": [
    {"dimension": "Product Configuration Accuracy", "description": "Agent correctly maps customer request to valid SKUs and configuration rules", "targetPassRate": 0.97},
    {"dimension": "Pricing Calculation Precision", "description": "Agent applies correct multi-tier pricing, discounts, and currency conversion", "targetPassRate": 0.99},
    {"dimension": "Approval Threshold Detection", "description": "Agent correctly identifies when approval is required vs auto-approved", "targetPassRate": 1.0},
    {"dimension": "Bundle Conflict Detection", "description": "Agent identifies incompatible product combinations before quote generation", "targetPassRate": 0.95},
    {"dimension": "Discontinued Product Handling", "description": "Agent correctly flags and substitutes discontinued products", "targetPassRate": 0.95},
    {"dimension": "Multi-Currency Quote Accuracy", "description": "Agent applies correct exchange rates and regional pricing for cross-currency quotes", "targetPassRate": 0.98},
    {"dimension": "Government Account Compliance", "description": "Agent applies FCPA/UK Bribery thresholds and dual-approval routing for GOV/SOE customers", "targetPassRate": 1.0},
    {"dimension": "Quote Latency SLA (30s)", "description": "Quote generation completes within 30-second target latency", "targetPassRate": 0.95}
  ],
  "benchmarkAvg": 0.97,
  "benchmarkRange": {"low": 0.93, "high": 1.0},
  "contributorCount": 3,
  "contributors": [
    {"role": "Deal Desk Manager", "contribution": "200 historical quote validations"},
    {"role": "Revenue Operations Analyst", "contribution": "150 pricing edge case annotations"},
    {"role": "Legal / Compliance", "contribution": "75 compliance-critical scenario annotations"}
  ],
  "performanceBenchmarks": [
    {"metric": "quote_generation_latency_p95", "target": 30000, "unit": "ms", "description": "95th percentile quote generation time under 30 seconds"},
    {"metric": "pricing_accuracy", "target": 0.99, "unit": "ratio", "description": "Pricing within 0.01% of ERP reference price"},
    {"metric": "config_validity_rate", "target": 0.97, "unit": "ratio", "description": "Proportion of configurations passing CPQ rules validation"},
    {"metric": "approval_routing_accuracy", "target": 1.0, "unit": "ratio", "description": "Correct approver identified and routed every time threshold exceeded"},
    {"metric": "false_approval_bypass_rate", "target": 0.0, "unit": "ratio", "description": "Zero tolerance: no quotes should bypass required approvals"}
  ],
  "dataRecordCount": 500,
  "tags": ["cpq", "order-to-cash", "quote", "pricing", "approval", "compliance", "otc-agt-001"],
  "aiGenerated": false,
  "status": "active"
}
ENDJSON
DS=$(post_api "Quote & Configuration Evaluation Dataset" "/api/golden-datasets" "$WORK/dataset.json")

echo "" >&2

# =============================================================================
# SUMMARY
# =============================================================================
echo "==================================================" >&2
echo " MIGRATION COMPLETE" >&2
echo "==================================================" >&2
echo "" >&2
echo "Resource Summary:" >&2
echo "  Agent (OTC-AGT-001):              $AGENT" >&2
echo "  Knowledge Base:                    $KB" >&2
echo "  Golden Evaluation Dataset:         $DS" >&2
echo "" >&2
echo "Skills (6):" >&2
echo "  Product Catalog Retrieval:         $S1" >&2
echo "  Pricing Engine:                    $S2" >&2
echo "  Approval Routing:                  $S3" >&2
echo "  Quote Document Generation:         $S4" >&2
echo "  Customer Context:                  $S5" >&2
echo "  Channel Adaptation:                $S6" >&2
echo "" >&2
echo "Policies (5):" >&2
echo "  SOX Pricing Audit Trail:           $P1" >&2
echo "  Robinson-Patman Control:           $P2" >&2
echo "  GDPR Customer Data Handling:       $P3" >&2
echo "  ASC 606 / IFRS 15 Compliance:      $P4" >&2
echo "  Anti-Bribery (FCPA/UK Bribery):    $P5" >&2
echo "" >&2
echo "All resources created at: $BASE_URL" >&2
echo "==================================================" >&2
