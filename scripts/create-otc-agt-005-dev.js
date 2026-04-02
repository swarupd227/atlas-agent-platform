#!/usr/bin/env node
/**
 * OTC-AGT-005 — Fulfillment & Exception Agent
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
 * Usage:  node scripts/create-otc-agt-005-dev.js
 * Saves:  scripts/otc-agt-005-dev-ids.json
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
//  DATA — 6 SKILLS  (Section 6.4)
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Fulfillment Event Monitoring Skill",
    description: "Real-time tracking and analysis of WMS (Warehouse Management System) and carrier events across the end-to-end fulfillment lifecycle. Ingests pick, pack, ship, in-transit, delivered, and returned events from warehouse systems and carrier APIs. Detects event gaps, sequence anomalies, and SLA breaches. Correlates WMS events with carrier tracking milestones to produce a unified fulfillment timeline per order. Generates proactive alerts when events are delayed beyond configured thresholds and publishes event summaries for downstream exception detection.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["fulfillment-events", "WMS", "carrier-tracking", "real-time-monitoring", "event-correlation", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "poll_wms_events", "poll_carrier_api", "correlate_events", "detect_event_gap", "publish_fulfillment_timeline", "trigger_alert"],
    requiredMcpServers: ["wms-integration-mcp", "carrier-api-mcp", "order-management-mcp"],
    requiredDataClassifications: ["order_data", "shipment_data", "carrier_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["WMS event types and sequences", "carrier tracking milestones", "fulfillment SLA thresholds", "event gap detection rules", "shipment status codes"],
    yamlFrontmatter: `name: Fulfillment Event Monitoring Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nevent_types: [pick, pack, ship, in_transit, out_for_delivery, delivered, return_to_sender, returned]\nsla_alert_thresholds: [4h_pick, 2h_pack, 1h_ship_confirmation, 24h_carrier_scan]\ndata_sources: [WMS_API, carrier_tracking_API, order_management_system]`,
    markdownBody: `# Fulfillment Event Monitoring Skill\n\n## Purpose\nProvides real-time visibility into the complete fulfillment lifecycle by ingesting, correlating, and analyzing events from warehouse and carrier systems. Serves as the sensing layer for exception detection in OTC-AGT-005.\n\n## Event Taxonomy\n\n### WMS Events\n| Event | Trigger | Expected Duration from Prior Event |\n|---|---|---|\n| Order Released | Order Validation Agent approval | T+0 |\n| Pick Started | Warehouse floor scan | T+1h (standard) / T+4h (peak) |\n| Pick Complete | All lines confirmed picked | T+1h to T+6h depending on order size |\n| Pack Complete | Carton labeled and sealed | T+30min after pick complete |\n| Staged for Carrier | Moved to outbound dock | T+1h after pack |\n| Carrier Tendered | Carrier pickup confirmed | T+2h of staging |\n| Ship Confirmed | WMS shipment closed | T+30min of carrier pickup |\n\n### Carrier Tracking Events\n| Event | Expected Timing | SLA Breach Threshold |\n|---|---|---|\n| First Carrier Scan | Within 4h of ship confirmation | 8h |\n| In-Transit Scan | Daily updates minimum | 24h gap |\n| Out for Delivery | Day of delivery | N/A |\n| Delivery Confirmation | Scan or signature | Per service SLA |\n| Exception Event | Carrier-generated | Immediate alert |\n\n## Event Correlation Logic\n1. Match WMS shipment ID to carrier tracking number via order record\n2. Align WMS ship timestamp with first carrier scan timestamp\n3. Flag gap >4h between ship confirmation and first carrier scan\n4. Detect carrier event gaps >24h for in-transit shipments\n5. Correlate carrier delivery confirmation with customer delivery expectation\n\n## Alert Generation Rules\n- **Yellow Alert**: Event gap approaching SLA threshold (75% of threshold elapsed)\n- **Orange Alert**: Event gap at SLA threshold — exception detection triggered\n- **Red Alert**: No carrier update for 48h+ on in-transit shipment\n- **Critical Alert**: Return-to-sender scan detected; carrier damage claim filed\n\n## Integration Points\n- WMS: SAP EWM, Manhattan Associates, Blue Yonder, HighJump, Infor WMS\n- Carrier APIs: UPS, FedEx, USPS, DHL, OnTrac, regional LTL carriers\n- Order Management: SAP S/4HANA, Oracle OMS, Salesforce OMS, Blue Yonder OMS`,
  },
  {
    organizationId: ORG,
    name: "Exception Detection & Classification Skill",
    description: "Pattern recognition engine for fulfillment anomalies that identifies, classifies, and prioritizes fulfillment exceptions by type, severity, and required resolution path. Detects backorders (stock-out at pick time), short-ships (partial quantity fulfilled), substitution requirements (requested item unavailable), carrier delays (transit time SLA breach), address issues (undeliverable address, NCOA mismatch), picking errors (wrong item, wrong quantity), and delivery exceptions (damage, return-to-sender, refused delivery). Assigns severity scores and routes each exception to the appropriate resolution workflow.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Fulfillment Event Monitoring Skill"],
    tags: ["exception-detection", "classification", "backorder", "short-ship", "substitution", "carrier-delay", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "analyze_fulfillment_event", "classify_exception", "score_severity", "route_exception", "log_exception_record", "trigger_resolution_workflow"],
    requiredMcpServers: ["wms-integration-mcp", "order-management-mcp", "exception-management-mcp"],
    requiredDataClassifications: ["order_data", "inventory_data", "exception_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["exception type classification rules", "severity scoring matrix", "backorder detection patterns", "carrier delay thresholds", "picking error identification"],
    yamlFrontmatter: `name: Exception Detection & Classification Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nexception_types: [backorder, short_ship, substitution_required, carrier_delay, address_issue, picking_error, delivery_exception, return_to_sender, damage_claim]\nseverity_levels: [LOW, MEDIUM, HIGH, CRITICAL]\nauto_resolve_threshold: LOW\nescalation_threshold: CRITICAL`,
    markdownBody: `# Exception Detection & Classification Skill\n\n## Exception Type Taxonomy\n\n### Inventory Exceptions\n| Exception Type | Detection Trigger | Severity Default | Resolution Path |\n|---|---|---|---|\n| Backorder (Full) | Zero inventory at pick; entire order on hold | HIGH | Backorder resolution workflow |\n| Backorder (Partial) | Insufficient qty for one or more lines | MEDIUM | Split shipment or substitution evaluation |\n| Short-Ship | Picked qty < ordered qty; shipment closed | HIGH | Customer notification + resolution offer |\n| Substitution Required | Requested item unavailable; compatible alt exists | MEDIUM | Alternative product recommendation |\n| Discontinuation | Item permanently discontinued | HIGH | Mandatory substitution or cancel line |\n\n### Carrier & Shipping Exceptions\n| Exception Type | Detection Trigger | Severity Default | Resolution Path |\n|---|---|---|---|\n| Carrier Delay | Transit SLA breached by >1 day | MEDIUM | Proactive customer notification |\n| Carrier Delay (Critical) | Delivery date missed; customer-impacting | HIGH | Expedite or reship evaluation |\n| Address Issue | Carrier returns undeliverable; NCOA mismatch | HIGH | Address verification + reattempt |\n| Return to Sender | Carrier initiates RTS scan | HIGH | Customer contact for re-delivery or refund |\n| Damage Claim | Carrier damage notation; customer reports damage | HIGH | Carrier claim initiation + replacement |\n| Lost Shipment | No tracking update 5+ business days in transit | CRITICAL | Carrier tracer + replacement order |\n\n### Fulfillment Process Exceptions\n| Exception Type | Detection Trigger | Severity Default | Resolution Path |\n|---|---|---|---|\n| Picking Error | Wrong item scanned; wrong quantity confirmed | HIGH | Recall and correct pick; expedite |\n| Labeling Error | Incorrect address label applied | MEDIUM | Re-label before ship; intercept if shipped |\n| WMS System Outage | No WMS events for >2h on active orders | CRITICAL | Manual fulfillment runbook activation |\n\n## Severity Scoring Matrix\n- **CRITICAL**: Customer delivery date missed + high-value order; regulatory item; VIP account; mass carrier event\n- **HIGH**: Backorder full-hold; lost shipment; picking error shipped; damage claim; return to sender\n- **MEDIUM**: Partial backorder; carrier delay <3 days; substitution required with alternative\n- **LOW**: Minor address correction; carrier scan gap <24h; labeling clarification\n\n## Classification Output Structure\n\`\`\`json\n{\n  "exceptionId": "EXC-YYYYMMDD-NNNN",\n  "orderId": "...",\n  "shipmentId": "...",\n  "exceptionType": "backorder | short_ship | carrier_delay | ...",\n  "severity": "LOW | MEDIUM | HIGH | CRITICAL",\n  "detectedAt": "ISO8601",\n  "affectedLines": ["line1", "line2"],\n  "estimatedImpact": "delivery delay days or lost revenue",\n  "recommendedResolution": "...",\n  "requiresCustomerContact": true | false,\n  "escalationRequired": true | false\n}\n\`\`\``,
  },
  {
    organizationId: ORG,
    name: "Alternative Product Recommendation Skill",
    description: "Suggests substitute products for backorder and substitution exception scenarios based on product compatibility matrices, customer eligibility rules, inventory availability, and pricing parity constraints. Cross-references approved product substitution matrices maintained in the product catalog to identify technically compatible alternatives. Validates substitution eligibility against customer contract terms, pricing agreements, and regulatory restrictions. Presents ranked alternatives with compatibility scores, price deltas, and availability commitments for customer selection.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "MEDIUM",
    dependencies: ["Exception Detection & Classification Skill"],
    tags: ["product-substitution", "alternative-recommendation", "backorder-resolution", "substitution-matrix", "inventory-availability", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "query_substitution_matrix", "check_inventory_availability", "validate_customer_eligibility", "calculate_price_delta", "rank_alternatives", "present_options"],
    requiredMcpServers: ["product-catalog-mcp", "inventory-mcp", "pricing-mcp", "contract-management-mcp"],
    requiredDataClassifications: ["product_data", "inventory_data", "customer_contract_data", "pricing_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 91,
    knowledgeQueries: ["product substitution matrix", "compatibility rules by product category", "customer contract substitution restrictions", "inventory availability by SKU", "pricing parity rules"],
    yamlFrontmatter: `name: Alternative Product Recommendation Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: MEDIUM\ncontext_mode: rag\nsubstitution_criteria: [technical_compatibility, customer_eligibility, inventory_availability, price_delta_threshold]\nmax_alternatives_presented: 3\nprice_delta_threshold_pct: 10\ncustomer_approval_required: true`,
    markdownBody: `# Alternative Product Recommendation Skill\n\n## Purpose\nAutomates identification and presentation of approved product substitutes when ordered items are unavailable due to backorder or discontinuation. Ensures substitutions meet technical compatibility requirements, customer contract terms, and pricing constraints.\n\n## Substitution Eligibility Criteria\n\n### Technical Compatibility (Required)\n1. Same product category and functional specification\n2. Compatible dimensions, weight, and packaging if applicable\n3. Same or higher quality grade\n4. Regulatory compliance equivalency (same certifications)\n5. System/process compatibility (e.g., same part fitment, same formulation)\n\n### Customer Eligibility (Required)\n1. Customer account not restricted from substitute product\n2. Substitute product is in customer's approved product list (if applicable)\n3. No contractual restriction on substitutions without pre-approval\n4. Regulatory restrictions do not prohibit substitution (pharma, food, hazmat)\n\n### Commercial Constraints (Configurable)\n1. Price delta ≤ 10% above original (default; configurable by customer segment)\n2. Lead time delta ≤ customer's stated tolerance\n3. Minimum order quantity compatible with customer's order\n4. Packaging compatible with customer's receiving requirements\n\n## Ranking Algorithm\n| Factor | Weight | Description |\n|---|---|---|\n| Technical Match Score | 40% | Spec similarity to original item |\n| Inventory Availability | 30% | Immediate availability vs. lead time |\n| Price Delta | 20% | Closer to original price = higher rank |\n| Historical Acceptance Rate | 10% | Customer's past acceptance of this substitute |\n\n## Output Format\n\`\`\`json\n{\n  "originalSku": "SKU-12345",\n  "exceptionType": "backorder",\n  "alternatives": [\n    {\n      "rank": 1,\n      "sku": "SKU-12346",\n      "name": "Product Name Alt A",\n      "compatibilityScore": 97,\n      "inventoryQty": 500,\n      "availableDate": "immediate",\n      "priceDelta": "+2.3%",\n      "customerEligible": true,\n      "recommendationReason": "Highest compatibility; in stock; minimal price delta"\n    }\n  ],\n  "requiresCustomerApproval": true,\n  "approvalDeadline": "ISO8601"\n}\n\`\`\`\n\n## Regulatory Considerations\n- **Pharmaceutical**: Substitution requires pharmacist approval; therapeutic equivalence must be documented\n- **Food & Beverage**: Allergen compatibility must be verified; label changes may require regulatory filing\n- **Hazmat**: Same UN classification and packing group required\n- **Medical Devices**: FDA 510(k) equivalence documentation required for Class II+`,
  },
  {
    organizationId: ORG,
    name: "Customer Communication Skill",
    description: "Generates proactive, personalized customer notifications for fulfillment exceptions including backorders, partial shipments, carrier delays, and delivery issues. Produces multi-channel communications (email, SMS, portal notification) with clear exception descriptions, customer options (wait, substitute, cancel), and expected resolution timelines. Adapts tone and detail level to customer segment (B2B, B2C, VIP) and exception severity. Ensures all communications comply with FTC Mail/Telephone Order Rule delivery date promise regulations and include appropriate apology, transparency, and options for customer action.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Exception Detection & Classification Skill"],
    tags: ["customer-communication", "exception-notification", "delay-notice", "backorder-notification", "FTC-compliance", "multi-channel", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "generate_communication", "select_channel", "personalize_message", "validate_compliance", "send_notification", "log_customer_response"],
    requiredMcpServers: ["crm-mcp", "communication-platform-mcp", "order-management-mcp", "compliance-mcp"],
    requiredDataClassifications: ["customer_data", "order_data", "communication_logs", "pii"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["FTC Mail Order Rule requirements", "customer communication templates by exception type", "B2B vs B2C communication standards", "VIP escalation communication protocols", "accessible format requirements ADA WCAG"],
    yamlFrontmatter: `name: Customer Communication Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\ncommunication_channels: [email, SMS, portal_notification, EDI_856_amendment]\ncustomer_segments: [B2C_standard, B2C_VIP, B2B_standard, B2B_key_account]\nftc_compliance: true\naccessibility_compliant: true\nresponse_timeout_hours: 24`,
    markdownBody: `# Customer Communication Skill\n\n## Purpose\nEnsures customers receive timely, accurate, and actionable communications when fulfillment exceptions occur. Maintains customer trust through proactive outreach before customers discover issues independently.\n\n## Communication Triggers by Exception Type\n\n| Exception | Communication Trigger | Urgency | Channel Priority |\n|---|---|---|---|\n| Full Backorder | Exception detected | Within 2h | Email + Portal |\n| Partial Backorder | Exception detected | Within 2h | Email + Portal |\n| Carrier Delay (>1 day) | SLA breach detected | Within 4h | Email |\n| Carrier Delay (>3 days) | Continued delay | Daily update | Email + SMS |\n| Lost Shipment | 5+ days no tracking | Within 1h | Email + Phone (VIP) |\n| Return to Sender | RTS scan detected | Within 2h | Email + Phone |\n| Damage Claim | Customer report received | Within 1h | Email + Phone |\n| Substitution Offer | Alt product identified | Within 3h | Email + Portal |\n\n## Message Structure — Backorder Notification\n\`\`\`\nSubject: Update on Your Order #[ORDER_ID] — [PRODUCT_NAME]\n\nDear [CUSTOMER_NAME],\n\nWe're writing to let you know that [PRODUCT_NAME] (Qty: [QTY]) in your order\nplaced on [ORDER_DATE] is temporarily out of stock.\n\nExpected availability: [DATE] (if known) / We are actively working to fulfill\nyour order (if unknown)\n\nYour options:\n1. Wait for availability — we'll ship as soon as stock is available\n2. Accept a substitute — [ALTERNATIVE_PRODUCT] is available now at the same price\n3. Cancel this item — a full refund will be processed within 3-5 business days\n\nPlease reply or click below to select your preference by [RESPONSE_DEADLINE].\nIf we do not hear from you, we will [DEFAULT_ACTION — typically hold order].\n\nWe apologize for any inconvenience and appreciate your patience.\n\`\`\`\n\n## FTC Mail/Telephone Order Rule Compliance\n- **30-Day Rule**: Seller must have reasonable basis to believe order will ship within 30 days of order, or must state a specific shipment date\n- **Delay Notice**: If delay expected, customer must be notified and given option to consent to delay or cancel for full refund\n- **Renewed Delay**: If additional delay occurs, renewed consent required; customer has right to cancel\n- **Refund Timing**: Refunds must be processed within 7 business days (credit card) or 30 days (other methods) of cancellation\n\n## Accessibility Requirements (ADA/WCAG)\n- Email communications: minimum 14pt font; high contrast; alt text on images\n- Portal notifications: WCAG 2.1 AA compliance\n- Upon request: large print, audio format, accessible PDF\n- Plain language standard: 8th grade reading level maximum\n\n## B2B Key Account Protocol\n- All notifications CC'd to account manager\n- EDI 856 (ASN Amendment) sent for shipment changes\n- Phone call for CRITICAL exceptions involving orders >$10,000 or delivery-date-sensitive\n- Dedicated resolution timeline with named contact`,
  },
  {
    organizationId: ORG,
    name: "Carrier Performance Analysis Skill",
    description: "Tracks and analyzes carrier SLA adherence, on-time delivery rates, claim frequency, and damage rates across all active carrier relationships. Monitors performance by carrier, service level, lane (origin-destination pair), and time period. Identifies underperforming carriers and lanes, benchmarks against contracted SLAs, and generates data-driven recommendations for carrier selection changes, volume rebalancing, and contract renegotiation. Provides real-time carrier scorecards and triggers automatic carrier switch recommendations when SLA breach thresholds are exceeded.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "MEDIUM",
    dependencies: ["Fulfillment Event Monitoring Skill"],
    tags: ["carrier-performance", "SLA-adherence", "on-time-delivery", "carrier-scorecard", "lane-analysis", "carrier-selection", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_carrier_performance_data", "calculate_sla_adherence", "benchmark_carrier", "identify_underperforming_lanes", "generate_carrier_scorecard", "recommend_carrier_switch"],
    requiredMcpServers: ["carrier-api-mcp", "transportation-management-mcp", "contract-management-mcp"],
    requiredDataClassifications: ["carrier_data", "shipment_data", "contract_data", "performance_analytics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["carrier SLA benchmarks by service level", "on-time delivery calculation methodology", "carrier claim rate analysis", "lane performance evaluation", "carrier switch decision criteria"],
    yamlFrontmatter: `name: Carrier Performance Analysis Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: MEDIUM\ncontext_mode: rag\nperformance_metrics: [on_time_delivery_rate, claim_frequency, damage_rate, first_scan_compliance, exception_rate]\nevaluation_periods: [daily, weekly, monthly, quarterly]\nswitch_recommendation_threshold: 0.85_otd_below_3_weeks\nscorecard_format: carrier_id_service_level_lane`,
    markdownBody: `# Carrier Performance Analysis Skill\n\n## Carrier Scorecard Metrics\n\n### Primary Metrics (Contractual SLA)\n| Metric | Definition | Benchmark Target | Measurement Period |\n|---|---|---|---|\n| On-Time Delivery Rate (OTD) | Deliveries within promised window / total deliveries | ≥95% (standard) / ≥98% (premium) | Weekly |\n| First Carrier Scan Compliance | Shipments with scan within 4h of tender / total | ≥98% | Weekly |\n| Claim Frequency Rate | Damage/loss claims / total shipments | ≤0.5% (standard) |\n Monthly |\n| Damage Rate | Confirmed damage claims / total shipments | ≤0.3% | Monthly |\n| Exception Rate | Carrier-reported exceptions / total shipments | ≤2% | Weekly |\n\n### Secondary Metrics (Operational)\n| Metric | Definition | Target |\n|---|---|---|\n| Transit Time Adherence | Actual transit days vs. standard transit days | ±0.5 days avg |\n| Tracking Update Frequency | Average hours between tracking scans in-transit | ≤12h |\n| POD Availability | Proof of delivery available within 24h of delivery / total | ≥99% |\n| Claim Resolution Time | Average days from claim filing to resolution | ≤14 days |\n\n## Lane Performance Analysis\n- Rank lanes by OTD rate (origin-destination city pair + service level)\n- Flag lanes with OTD <90% for 2+ consecutive weeks → switch recommendation\n- Identify seasonal lane degradation patterns (Q4 peak; weather corridors)\n- Compare actual transit times to carrier's published transit time by lane\n\n## Carrier Switch Decision Logic\n1. OTD < 85% for 3+ consecutive weeks on a lane → **Automatic switch recommendation**\n2. Damage rate > 1% for 4+ consecutive weeks → **Volume reduction recommendation**\n3. Two or more CRITICAL exceptions (lost shipment) in 30 days → **Immediate review flag**\n4. Carrier claim resolution time > 21 days → **Escalation to carrier account manager**\n\n## Contracted SLA Enforcement\n- Track SLA credits owed per contract for OTD misses\n- Calculate credit accrual monthly and present to carrier for reconciliation\n- Flag contracts due for renewal with performance summary for renegotiation support\n- Document all carrier communications regarding SLA misses for contract enforcement`,
  },
  {
    organizationId: ORG,
    name: "Escalation Management Skill",
    description: "Routes critical fulfillment exceptions to appropriate teams with full exception context, resolution options, and urgency classification. Manages multi-level escalation paths based on exception severity, customer tier, order value, and SLA proximity. Tracks escalation lifecycle from initiation through resolution, measures escalation response time, and ensures no exception exceeds defined time-to-first-response thresholds. Triggers VIP handling procedures for key accounts, activates runbooks for mass exception events, and feeds resolution data back for continuous improvement.",
    industry: "order_to_cash",
    domain: "fulfillment-exception-management",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Exception Detection & Classification Skill"],
    tags: ["escalation-management", "exception-routing", "VIP-handling", "SLA-breach", "team-routing", "continuous-improvement", "OTC-AGT-005"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "classify_escalation_path", "notify_team", "activate_runbook", "track_escalation_lifecycle", "measure_response_time", "close_escalation", "feed_resolution_data"],
    requiredMcpServers: ["crm-mcp", "ticketing-system-mcp", "order-management-mcp", "notification-mcp"],
    requiredDataClassifications: ["exception_records", "customer_data", "escalation_logs", "resolution_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["escalation path by exception type and severity", "VIP customer handling procedures", "escalation response time SLAs", "runbook activation criteria", "resolution data feedback loops"],
    yamlFrontmatter: `name: Escalation Management Skill\nversion: "1.0"\nagent_code: OTC-AGT-005\ndomain: fulfillment-exception-management\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nescalation_levels: [L1_fulfillment_ops, L2_fulfillment_supervisor, L3_customer_success, L4_executive]\nvip_override: true\nresponse_time_sla: {CRITICAL: "15min", HIGH: "1h", MEDIUM: "4h", LOW: "24h"}\nrunbook_auto_activation: [mass_carrier_delay, wms_outage, returns_surge]`,
    markdownBody: `# Escalation Management Skill\n\n## Escalation Routing Matrix\n\n| Exception Severity | Customer Tier | Order Value | Escalation Level | Response Time SLA |\n|---|---|---|---|---|\n| CRITICAL | Any | Any | L3 Customer Success + L4 Executive | 15 minutes |\n| HIGH | VIP / Key Account | Any | L3 Customer Success | 1 hour |\n| HIGH | Standard | >$10,000 | L2 Fulfillment Supervisor | 1 hour |\n| HIGH | Standard | ≤$10,000 | L1 Fulfillment Ops | 2 hours |\n| MEDIUM | VIP / Key Account | Any | L2 Fulfillment Supervisor | 2 hours |\n| MEDIUM | Standard | Any | L1 Fulfillment Ops | 4 hours |\n| LOW | Any | Any | L1 Fulfillment Ops (queue) | 24 hours |\n\n## Escalation Context Package\nEvery escalation includes:\n1. Exception ID, type, severity, and detection timestamp\n2. Order ID, customer name/tier, order value, delivery commitment\n3. Affected shipment(s) and line items\n4. Timeline of events leading to exception\n5. Resolution options evaluated (with recommendation)\n6. Customer communication status (sent / pending)\n7. Recommended next action with time constraint\n8. Runbook reference if applicable\n\n## VIP / Key Account Handling\n- **Identification**: CRM tag 'VIP' or 'Key Account' or order value >$50,000\n- **Protocol**: Phone call within 15 minutes for HIGH/CRITICAL exceptions\n- **Ownership**: Named customer success manager owns resolution\n- **Update Frequency**: Every 2 hours until resolved\n- **Resolution Authority**: CS Manager can approve expedited shipping at cost\n- **Executive Visibility**: Auto-notify VP of Customer Success for CRITICAL\n\n## Mass Exception Event Handling\n**Triggers**: ≥10 exceptions of same type in 60-minute window\n- Auto-activates relevant operational runbook\n- Creates parent incident ticket linked to all child exceptions\n- Notifies Fulfillment Director and relevant carrier/warehouse contacts\n- Switches to bulk customer communication mode (batch notifications)\n- Generates mass exception dashboard for real-time tracking\n\n## Resolution Data Feedback Loop\nAfter each exception closed:\n1. Record: exception type, resolution action, cycle time, customer satisfaction score\n2. Track: which alternatives customers accepted vs. rejected\n3. Analyze: recurring exception patterns by warehouse, carrier, product category\n4. Report: weekly exception summary with trend analysis and process improvement recommendations\n5. Feed: resolution outcomes to Exception Detection skill for pattern model refinement`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 KB SOURCES  (Section 6.8)
// ══════════════════════════════════════════════════════════════════════════════

const KB_SOURCES = [
  {
    title: "Fulfillment Center Standard Operating Procedures — Pick, Pack, and Exception Handling Guides",
    tags: ["fulfillment-center", "SOPs", "pick-pack", "exception-handling", "WMS-procedures", "OTC-AGT-005"],
    metadata: { source: "OTC Operations Team", type: "operational-procedures", coverage: "fulfillment_center_ops", lastUpdated: "2024-01-01" },
    content: `# Fulfillment Center Standard Operating Procedures — Pick, Pack, and Exception Handling Guides\n\n## Order Pick Procedures\n\n### Standard Order Pick\n1. **Order Release**: Order Validation Agent releases order to WMS; order appears in pick queue\n2. **Pick Assignment**: WMS assigns order to picker based on zone, batch, or wave configuration\n3. **Pick Confirmation**: Picker scans location barcode and item barcode; WMS validates match\n4. **Quantity Verification**: System prompts for quantity; picker confirms or enters actual picked qty\n5. **Short-Pick Handling**: If item unavailable at location, picker selects 'Short' in WMS; triggers exception\n6. **Pick Complete**: All lines confirmed; WMS advances order to pack stage\n\n### Batch Pick Procedure (High-Volume)\n- Multiple orders picked simultaneously by zone\n- Sorter or put-wall separates items by order after zone pick\n- Exception: if item scans to wrong order in sort, creates picking error exception\n\n## Exception Handling at Pick\n\n### Inventory Discrepancy\n**Trigger**: Item not found at location or quantity less than WMS on-hand\n1. Picker attempts secondary location (overflow bin) if configured\n2. If still short: picker enters short-pick in WMS with quantity found\n3. WMS generates inventory discrepancy alert to inventory control team\n4. OTC-AGT-005 receives short-pick event; classifies as backorder or partial shipment\n5. Inventory control team performs cycle count within 4 hours\n6. If cycle count confirms shortage: inventory record corrected; agent proceeds with exception resolution\n\n### Wrong Item Scanned\n**Trigger**: Barcode scan returns item mismatch warning in WMS\n1. Picker does NOT confirm — selects 'Item Mismatch' in WMS\n2. Supervisor notified immediately; correct item located\n3. If correct item unavailable: exception escalated to OTC-AGT-005 as substitution required\n4. Picking error logged for quality metric tracking\n\n## Pack Procedures\n1. **Pack Station Assignment**: WMS routes tote/cart to pack station based on order attributes\n2. **Item Verification**: Pack scan confirms all items match pick list\n3. **Packing Material Selection**: System recommends box size based on items (dimweight optimization)\n4. **Fragile/Special Handling**: System flags special handling requirements (fragile sticker, cold pack)\n5. **Label Application**: WMS prints shipping label; packer applies to correct carton\n6. **Carton Seal**: Carton sealed; weight capture confirms within expected range\n7. **Pack Complete**: WMS advances to ship stage; carton moved to outbound staging\n\n## Exception Handling at Pack\n\n### Label Application Error\n- Detected by: barcode scan at staging confirms label matches order\n- If mismatch: carton pulled from line; relabeled under supervisor verification\n- Shipment delayed by pick-pack cycle time (typically 2-4 hours)\n\n### Overweight Carton\n- Trigger: scale weight exceeds carrier maximum (70 lbs standard; 150 lbs LTL)\n- Resolution: repack into multiple cartons; update WMS for multi-carton shipment\n- Carrier charge adjustment may be required`,
  },
  {
    title: "Carrier Service Guides — Transit Times, Restrictions, SLA Reference, and Claim Procedures",
    tags: ["carrier-service", "transit-times", "carrier-restrictions", "SLA", "claim-procedures", "OTC-AGT-005"],
    metadata: { source: "Transportation Management Team", type: "carrier-reference", coverage: "multi_carrier", lastUpdated: "2024-01-01" },
    content: `# Carrier Service Guides — Transit Times, Restrictions, SLA Reference, and Claim Procedures\n\n## Carrier Service Level Summary\n\n### UPS Service Levels\n| Service | Transit | Tracking | SLA Guarantee | Max Weight |\n|---|---|---|---|---|\n| UPS Ground | 1-5 business days | Yes | No (money back for certain services) | 150 lbs |\n| UPS 3 Day Select | 3 business days | Yes | Yes | 150 lbs |\n| UPS 2nd Day Air | 2 business days | Yes | Yes | 150 lbs |\n| UPS Next Day Air | Next business day | Yes | Yes | 150 lbs |\n| UPS SurePost | 2-7 business days | Yes (USPS last mile) | No | 70 lbs |\n\n### FedEx Service Levels\n| Service | Transit | Tracking | SLA Guarantee | Max Weight |\n|---|---|---|---|---|\n| FedEx Ground | 1-7 business days | Yes | No | 150 lbs |\n| FedEx Express Saver | 3 business days | Yes | Yes | 150 lbs |\n| FedEx 2Day | 2 business days | Yes | Yes | 150 lbs |\n| FedEx Overnight | Next business day | Yes | Yes | 150 lbs |\n| FedEx SmartPost | 2-7 business days | Yes (USPS last mile) | No | 70 lbs |\n\n## Carrier Restrictions\n\n### Common Restrictions (All Carriers)\n- No shipment to PO Boxes via UPS/FedEx Ground (USPS required)\n- Hazardous materials require special handling documentation and labeling\n- Lithium battery restrictions: specific packing instructions per IATA PI965-970\n- Perishables: carrier-specific guidelines; cold chain may require special services\n- High-value items (>$100): declared value/insurance recommended; carrier liability limits apply\n\n### Address Validation\n- All addresses should be validated against USPS Address Information System before shipment\n- NCOA (National Change of Address) check recommended for residential addresses\n- Commercial address delivery surcharge applies for residential misclassification\n\n## Claim Procedures\n\n### Loss Claim\n**Timeline**: File within 9 months of ship date (UPS/FedEx standard)\n1. Confirm delivery not received by customer (POD lookup first)\n2. File carrier tracer request online or via carrier account manager\n3. Carrier conducts internal investigation (5-10 business days)\n4. If confirmed lost: file formal loss claim with proof of value\n5. Carrier resolution: 5-30 business days depending on claim size\n6. Claim payout: up to declared value (standard liability: UPS $100 / FedEx $100 unless insured)\n\n### Damage Claim\n**Timeline**: Visible damage — file immediately; concealed damage — file within 21 days (UPS) / 15 days (FedEx)\n1. Document damage with photos at time of delivery (visible) or upon discovery (concealed)\n2. Retain all original packaging — carrier may inspect\n3. File claim online with photos and invoice showing product value\n4. Carrier inspection: may schedule in-person inspection for high-value claims\n5. Resolution: 5-30 business days\n\n### SLA Guarantee Claims (Money-Back)\n- UPS: automatic refund for guaranteed services delayed (request within 15 days)\n- FedEx: automatic refund for guaranteed services delayed (request within 15 days)\n- Exclusions: weather, recipient unavailable, incorrect address, force majeure`,
  },
  {
    title: "Product Substitution Matrix — Approved Alternatives by Product Category with Compatibility Rules",
    tags: ["substitution-matrix", "product-alternatives", "compatibility", "backorder-resolution", "product-catalog", "OTC-AGT-005"],
    metadata: { source: "Product Management Team", type: "substitution-reference", coverage: "full_product_catalog", lastUpdated: "2024-01-01" },
    content: `# Product Substitution Matrix — Approved Alternatives by Product Category with Compatibility Rules\n\n## Substitution Framework\n\n### Approval Tiers\n| Tier | Approval Required | Price Delta Allowed | Customer Consent Required |\n|---|---|---|---|\n| Tier 1 — Direct Substitute | None (pre-approved) | ±0% | No (auto-substitute) |\n| Tier 2 — Functional Equivalent | Category Manager | ±5% | Customer notification |\n| Tier 3 — Alternative | VP Operations | ±10% | Customer approval |\n| Tier 4 — Emergency | Executive | >10% | Customer approval + discount |\n\n### Tier 1 Direct Substitution Rules (Auto-Approved)\n- Same base product, different pack size (unit conversion applied to order qty)\n- Same product, different color/finish (when color not specified in order)\n- Updated version replacing discontinued version (identical function; same SKU family)\n- Private label equivalent of national brand (same specification, different label)\n\n## Category-Specific Compatibility Rules\n\n### Industrial/MRO Products\n- Substitute must meet or exceed original specification (grade, material, rating)\n- For safety-critical items: engineering approval required regardless of tier\n- For fasteners: same thread pitch, diameter, grade, and coating\n- For bearings: same inner/outer dimensions, load rating, seal type\n\n### Consumer Products\n- Size/volume substitution: nearest size, quantity adjusted to match unit value\n- Fragrance/flavor variants: only if original not specified in order\n- Organic/conventional: never auto-substitute; customer preference is explicit\n\n### Food & Beverage\n- Same allergen profile mandatory — no substitutions that introduce new allergens\n- Same dietary classification (kosher, halal, vegan, gluten-free) mandatory\n- Expiration date: substitute must have ≥same remaining shelf life as original\n- Temperature requirements: same cold chain classification required\n\n### Pharmaceutical/Healthcare\n- Generic substitution: only when generic equivalence is established and customer policy allows\n- Same active ingredient, strength, and dosage form required\n- Regulatory equivalence documentation required (FDA orange book reference)\n- NO automatic substitution — always requires explicit approval\n\n## Substitution Tracking Requirements\n1. Log original SKU, substitute SKU, exception ID, and approval tier\n2. Record customer response: accepted / rejected / cancel\n3. Track return rate for accepted substitutions (indicator of customer satisfaction)\n4. Report monthly: substitution acceptance rates by product category\n5. Flag high-rejection substitutes for product team review`,
  },
  {
    title: "Customer Communication Templates — Delay Notices, Backorder Options, and Exception Apologies",
    tags: ["communication-templates", "delay-notice", "backorder-notification", "exception-communication", "customer-service", "OTC-AGT-005"],
    metadata: { source: "Customer Experience Team", type: "communication-templates", coverage: "all_exception_types", lastUpdated: "2024-01-01" },
    content: `# Customer Communication Templates — Delay Notices, Backorder Options, and Exception Apologies\n\n## Template Library Overview\n\n### Template Naming Convention\n\`COMM-[EXCEPTION_TYPE]-[CUSTOMER_SEGMENT]-[VERSION]\`\n- Exception types: BACKORDER, DELAY, PARTIAL, SUBSTITUTE, LOST, DAMAGE, RTS (return-to-sender)\n- Customer segments: B2C, B2B, VIP\n- Example: COMM-BACKORDER-B2C-V3\n\n## COMM-BACKORDER-B2C-V3 — Full Backorder Notification (Consumer)\n\n**Subject**: Important Update on Your Order #[ORDER_ID]\n\n**Body**:\nDear [FIRST_NAME],\n\nThank you for your recent order. We want to make sure you have the most up-to-date information about your purchase.\n\nUnfortunately, [PRODUCT_NAME] (Qty: [QTY]) is temporarily out of stock. We're sorry for any inconvenience this may cause.\n\nHere's what we can offer you:\n\n**Option 1: Wait for Restocking**\nWe expect [PRODUCT_NAME] to be back in stock by approximately [RESTOCK_DATE]. Your order will ship as soon as it's available at no extra charge.\n\n**Option 2: Accept a Substitute** *(if applicable)*\n[SUBSTITUTE_PRODUCT_NAME] is a comparable option currently in stock. It's [PRICE_COMPARISON — same price / $X.XX more / $X.XX less]. [COMPATIBILITY_NOTE]\n\n**Option 3: Cancel This Item**\nIf you'd prefer not to wait, we can cancel this item and process a full refund to your original payment method within 3-5 business days.\n\nPlease let us know your preference by [RESPONSE_DATE] by clicking one of the buttons below, or replying to this email. If we don't hear from you by then, we will [DEFAULT_ACTION].\n\nWe value your business and appreciate your patience.\n\nSincerely,\n[CUSTOMER_SERVICE_REP_NAME]\nCustomer Service Team\n\n---\n\n## COMM-DELAY-B2B-V2 — Carrier Delay Notification (Business)\n\n**Subject**: Shipment Delay Notice — Order #[ORDER_ID] / PO #[CUSTOMER_PO]\n\n**Body**:\nDear [CONTACT_NAME],\n\nThis is to notify you that shipment [TRACKING_NUMBER] for Order #[ORDER_ID] (your PO #[CUSTOMER_PO]) is experiencing a carrier delay.\n\n**Original Delivery Commitment**: [ORIGINAL_DATE]\n**Updated Estimated Delivery**: [REVISED_DATE]\n**Carrier**: [CARRIER_NAME] | **Tracking**: [TRACKING_URL]\n\n**Reason**: [CARRIER_EXCEPTION_REASON — e.g., Weather delay in transit region / High volume processing delay]\n\nWe are actively monitoring this shipment and will notify you immediately if the delivery estimate changes further.\n\nIf this delay creates a business impact that requires escalation, please contact your account manager [NAME] at [EMAIL/PHONE] directly.\n\nWe apologize for any disruption to your operations.\n\nBest regards,\n[ACCOUNT_MANAGER_NAME]\nCustomer Success Team\n\n---\n\n## COMM-LOST-VIP-V1 — Lost Shipment (VIP Account)\n\n**Subject**: URGENT: Shipment Investigation — Order #[ORDER_ID]\n\nDear [FIRST_NAME],\n\nI'm reaching out personally regarding Order #[ORDER_ID]. Your shipment with tracking number [TRACKING_NUMBER] has not received a carrier scan update since [LAST_SCAN_DATE], which is outside normal transit windows.\n\nI have initiated a formal tracer investigation with [CARRIER_NAME] and our logistics team is actively working to locate your shipment.\n\n**What we're doing right now:**\n- Carrier investigation filed: Case #[CARRIER_CASE_NUMBER]\n- Estimated investigation timeline: [DAYS] business days\n- If not located, we will ship a replacement order by [REPLACEMENT_SHIP_DATE]\n\nYou will not be charged for any replacement shipment, and if the original shipment is later delivered, we will arrange its return at our expense.\n\nI will personally update you by [UPDATE_TIME] today. Please feel free to contact me directly at [DIRECT_CONTACT].\n\nSincerely,\n[SENIOR_CS_MANAGER_NAME]\nSenior Customer Success Manager`,
  },
  {
    title: "Exception Resolution Playbooks — Step-by-Step Guides by Exception Type",
    tags: ["resolution-playbooks", "exception-handling", "backorder-resolution", "damage-resolution", "carrier-claims", "OTC-AGT-005"],
    metadata: { source: "OTC Operations Team", type: "resolution-playbooks", coverage: "all_exception_types", lastUpdated: "2024-01-01" },
    content: `# Exception Resolution Playbooks — Step-by-Step Guides by Exception Type\n\n## Playbook Index\n| Playbook ID | Exception Type | Avg Resolution Time | Owner |\n|---|---|---|---|\n| PB-001 | Full Backorder | 1-7 days | Fulfillment Ops |\n| PB-002 | Partial Shipment / Short-Ship | 4-48 hours | Fulfillment Ops |\n| PB-003 | Substitution Required | 2-24 hours | Customer Service |\n| PB-004 | Carrier Delay | 1-5 days | Transportation |\n| PB-005 | Lost Shipment | 5-30 days | Transportation |\n| PB-006 | Damage Claim | 7-30 days | Transportation + CS |\n| PB-007 | Return to Sender | 2-5 days | Fulfillment Ops + CS |\n| PB-008 | Picking Error | 1-3 days | Fulfillment Ops |\n\n## PB-001: Full Backorder Resolution\n\n**Trigger**: OTC-AGT-005 detects zero inventory at pick for one or more lines; entire order on hold\n\n**Step 1 — Confirm Inventory Shortage** (Automated, T+0)\n- Query WMS on-hand quantity across all warehouse locations\n- Check in-transit inventory and expected receipt date from purchasing\n- Verify no pending receipt within customer's delivery tolerance window\n\n**Step 2 — Determine Expected Availability** (T+1h)\n- Query purchase order system for open POs for this item\n- Identify earliest PO receipt date; apply pick-pack-ship lead time\n- Calculate earliest possible ship date\n\n**Step 3 — Identify Alternatives** (T+1h, parallel with Step 2)\n- Invoke Alternative Product Recommendation Skill\n- If Tier 1 substitute available in stock: include in customer options\n- If no substitute: backorder-only options presented\n\n**Step 4 — Customer Notification** (T+2h from detection)\n- Invoke Customer Communication Skill with COMM-BACKORDER template\n- Present options: wait / substitute / cancel\n- Set response deadline: 24h (B2C) / 4h (B2B/VIP)\n\n**Step 5 — Customer Response Processing** (per response received)\n- Wait: hold order in WMS; set availability alert on item\n- Substitute: update order line in OMS; trigger new pick wave\n- Cancel: process cancellation in OMS; initiate refund per payment method\n\n**Step 6 — Resolution Documentation** (T+close)\n- Log exception ID, resolution action, cycle time, customer choice\n- If waited: flag order for priority pick on inventory receipt\n- Feed resolution data to continuous improvement tracker\n\n---\n\n## PB-004: Carrier Delay Resolution\n\n**Trigger**: Transit SLA breached; carrier tracking shows delivery date beyond committed date\n\n**Step 1 — Confirm Delay Scope** (T+0)\n- Retrieve carrier tracking data; confirm last scan location and timestamp\n- Calculate delay magnitude: days beyond committed delivery date\n- Determine if delay is isolated or part of broader carrier/weather event\n\n**Step 2 — Assess Business Impact** (T+0)\n- Check customer delivery commitment vs. current estimated delivery\n- Identify if shipment contains time-sensitive or date-specific items\n- Check customer tier (VIP/Key Account triggers elevated response)\n\n**Step 3 — Resolution Options** (T+1h)\n- Option A: Monitor and notify customer; allow carrier to complete delivery\n- Option B: Expedite with carrier if expedite service available on route\n- Option C: Intercept and reship via faster service if still in carrier network\n- Option D: Cancel carrier shipment and reship via overnight (severe delay + high-value)\n\n**Step 4 — Customer Communication** (T+4h for MEDIUM; T+1h for HIGH/CRITICAL)\n- Invoke Customer Communication Skill with COMM-DELAY template\n- Provide revised estimated delivery date\n- Offer options per resolution assessment\n\n**Step 5 — Carrier SLA Credit** (post-resolution)\n- If guaranteed service missed SLA: file money-back guarantee claim with carrier\n- Document for carrier performance scorecard\n- Credit customer account if delay caused demonstrable business impact (per policy)\n\n---\n\n## PB-005: Lost Shipment Resolution\n\n**Trigger**: No carrier tracking update for 5+ business days on in-transit shipment\n\n**Step 1 — Immediate Tracer** (T+0)\n- File formal tracer request with carrier (online portal or account manager)\n- Obtain carrier investigation case number\n- Set carrier investigation follow-up for T+3 business days\n\n**Step 2 — Customer Notification** (T+1h — CRITICAL priority)\n- Notify customer immediately with transparency on investigation status\n- Provide carrier case number and expected investigation timeline\n- For VIP: personal phone call within 15 minutes\n\n**Step 3 — Replacement Decision** (T+24h)\n- If carrier investigation inconclusive after 5 business days: authorize replacement\n- Create replacement order in OMS at no charge; expedite shipping\n- Notify customer of replacement ship date and new tracking\n\n**Step 4 — Carrier Claim** (T+ confirmation of loss)\n- File formal loss claim with carrier\n- Submit: original invoice, proof of shipment, carrier trace case number\n- Track claim to resolution (5-30 business days per carrier)\n- Record claim payout for financial reconciliation`,
  },
  {
    title: "Historical Exception Patterns, Seasonal Trends, and Resolution Outcome Analytics",
    tags: ["exception-patterns", "seasonal-trends", "resolution-analytics", "continuous-improvement", "performance-metrics", "OTC-AGT-005"],
    metadata: { source: "OTC Analytics Team", type: "analytics-reference", coverage: "historical_exception_data", lastUpdated: "2024-01-01" },
    content: `# Historical Exception Patterns, Seasonal Trends, and Resolution Outcome Analytics\n\n## Exception Volume and Distribution\n\n### By Exception Type (Annual Average)\n| Exception Type | Volume % | Avg Resolution Time | Customer Satisfaction | Cost Impact |\n|---|---|---|---|---|\n| Carrier Delay | 38% | 2.3 days | 3.8/5.0 | Low-Medium |\n| Backorder (Partial) | 22% | 4.1 days | 3.5/5.0 | Medium |\n| Backorder (Full) | 12% | 6.2 days | 3.2/5.0 | High |\n| Address Issue | 9% | 1.8 days | 4.1/5.0 | Low |\n| Substitution Required | 7% | 3.4 days | 3.6/5.0 | Medium |\n| Short-Ship | 5% | 2.9 days | 3.4/5.0 | Medium |\n| Return to Sender | 4% | 4.5 days | 3.1/5.0 | High |\n| Lost Shipment | 2% | 18.7 days | 2.8/5.0 | Very High |\n| Damage Claim | 1% | 14.2 days | 3.0/5.0 | High |\n\n## Seasonal Exception Patterns\n\n### Q4 Peak Season (October–December)\n- **Exception Volume Increase**: +45% to +70% vs. annual baseline\n- **Primary Drivers**: Inventory depletion (backorders +80%); carrier network congestion (delays +55%)\n- **Carrier Delay Profile**: FedEx and UPS Ground SLA adherence drops to 88-91% in peak weeks\n- **Backorder Surge**: Consumer electronics, toys, apparel — restock lead times extend 2-3x\n- **Recommended Actions**: Pre-position inventory; activate backup carriers; increase exception monitoring frequency\n\n### Q1 (January–February)\n- **Returns Surge**: +120% return volume in January from holiday gift returns\n- **Weather Delays**: Northeast and Midwest corridors; 15-25% delay increase in severe winter weeks\n- **Post-Holiday Inventory**: Overstocked items create substitution opportunity; understocked basics create backorders\n\n### Q2 (April–May)\n- **Spring Inventory Transitions**: Seasonal product changeovers create substitution exceptions\n- **Weather**: Tornado season (South/Midwest); some carrier routing delays\n- **Lowest Exception Volume Quarter**: Generally 15-20% below annual baseline\n\n## Substitution Acceptance Analytics\n\n### Acceptance Rate by Customer Segment\n| Segment | Acceptance Rate | Rejection Rate | Cancel Rate |\n|---|---|---|---|\n| B2C Standard | 58% | 22% | 20% |\n| B2C VIP | 45% | 30% | 25% |\n| B2B Standard | 62% | 18% | 20% |\n| B2B Key Account | 35% | 40% | 25% |\n\n### Key Finding: Substitution Quality Correlates with Acceptance\n- Tier 1 (direct substitute) acceptance rate: 78%\n- Tier 2 (functional equivalent) acceptance rate: 55%\n- Tier 3 (alternative) acceptance rate: 31%\n- Conclusion: Invest in Tier 1 substitution catalog expansion; reduce reliance on Tier 3\n\n## Resolution Outcome Continuous Improvement Metrics\n\n### KPIs Tracked Monthly\n1. **Exception Rate**: Total exceptions / total orders shipped (target: <3%)\n2. **Proactive Notification Rate**: Customers notified before contacting CS / total exceptions (target: >90%)\n3. **Time to First Communication**: Average hours from exception detection to customer notification (target: <4h)\n4. **First Resolution Rate**: Exceptions resolved in one resolution action / total (target: >75%)\n5. **Customer Satisfaction Score**: Average CSAT for exception-impacted orders (target: >3.8/5.0)\n6. **Escalation Rate**: Exceptions requiring L2+ escalation / total (target: <15%)\n7. **Substitution Acceptance Rate**: Customer accepts substitute / total offered (target: >55%)`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 RUNBOOKS  (Section 6.6)
// ══════════════════════════════════════════════════════════════════════════════

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "WMS Integration Down — Manual Fulfillment Status Polling and Warehouse Contact Procedure",
    description: "Emergency response procedure for WMS system unavailability. Covers manual fulfillment status polling, warehouse floor contact procedures, order prioritization during outage, and system restoration verification steps. Activated when WMS event feed to OTC-AGT-005 goes dark for more than 2 hours during active fulfillment windows.",
    industry: "order_to_cash",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "wms_event_gap", source: "fulfillment_event_monitoring_skill", threshold: "2h_no_events_during_active_window" },
      { type: "event", event: "wms_api_error_rate", source: "integration_monitor", threshold: "error_rate_gt_50pct_5min" },
    ],
    steps: [
      { id: "1", type: "action", action: "confirm_outage", label: "Confirm WMS outage: attempt API ping; check integration monitoring dashboard; verify with warehouse IT", order: 1 },
      { id: "2", type: "action", action: "notify_operations", label: "Notify Fulfillment Director and Warehouse Manager via phone and SMS; open incident ticket", order: 2 },
      { id: "3", type: "action", action: "halt_order_release", label: "Pause new order releases to warehouse until WMS connectivity restored to prevent orphaned orders", order: 3 },
      { id: "4", type: "action", action: "manual_status_poll", label: "Initiate manual status poll: contact warehouse floor leads for in-progress order status by phone/radio every 30 minutes", order: 4 },
      { id: "5", type: "condition", condition: "outage_duration", label: "Is outage expected to exceed 4 hours?", trueNext: "6", falseNext: "8", order: 5 },
      { id: "6", type: "action", action: "carrier_hold", label: "Request carrier hold on scheduled pickups to prevent pickup of unconfirmed shipments; coordinate with carrier account manager", order: 6 },
      { id: "7", type: "action", action: "customer_communication", label: "Identify at-risk orders with delivery commitment today; send delay notifications via Customer Communication Skill", order: 7 },
      { id: "8", type: "action", action: "system_restoration", label: "Upon WMS restoration: reconcile manual status with WMS; resume event monitoring; verify event backfill", order: 8 },
      { id: "9", type: "action", action: "post_incident_review", label: "Conduct post-incident review: root cause, orders impacted, SLA impact, corrective actions", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["fulfillment_director", "warehouse_manager"], autoApproveAfterHours: null },
    estimatedDuration: "2-8 hours (outage dependent)",
    tags: ["WMS-outage", "emergency", "manual-polling", "system-integration", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Mass Carrier Delay — Bulk Notification Procedure and Alternative Carrier Activation",
    description: "Procedure for managing mass carrier delay events caused by weather, labor actions, carrier network disruptions, or major holidays. Covers bulk customer notification, alternative carrier activation, volume rebalancing across carriers, and customer satisfaction recovery.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "carrier_delay_exceptions_per_hour", operator: "gte", value: 10, source: "exception_detection_skill" },
      { type: "event", event: "carrier_service_alert", source: "carrier_api", threshold: "network_disruption_declared" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_scope", label: "Quantify impact: number of affected shipments, carriers affected, geographic scope, expected delay duration", order: 1 },
      { id: "2", type: "action", action: "confirm_carrier_alert", label: "Obtain carrier advisory or service alert documentation; determine carrier's estimated resolution timeline", order: 2 },
      { id: "3", type: "action", action: "alternative_carrier_check", label: "Invoke Carrier Performance Analysis Skill: identify available alternative carriers for affected lanes with capacity", order: 3 },
      { id: "4", type: "approval_gate", label: "Fulfillment Director approves alternative carrier activation and volume rebalancing plan", approvalLevel: "confirm_before", order: 4 },
      { id: "5", type: "action", action: "carrier_activation", label: "Activate alternative carrier(s): update TMS routing rules; notify warehouse outbound team of new carrier lanes", order: 5 },
      { id: "6", type: "action", action: "bulk_notification", label: "Generate bulk customer delay notifications via Customer Communication Skill: segment by affected carrier, delay magnitude, customer tier", order: 6 },
      { id: "7", type: "action", action: "vip_direct_contact", label: "Identify VIP/Key Account orders in affected pool; initiate direct phone contact within 15 minutes", order: 7 },
      { id: "8", type: "action", action: "monitor_recovery", label: "Monitor carrier recovery daily; update customer ETAs as carrier provides revised timelines", order: 8 },
      { id: "9", type: "action", action: "sla_credit_filing", label: "Post-event: file SLA credit claims for guaranteed service failures with all affected carriers", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["fulfillment_director", "transportation_manager"], autoApproveAfterHours: 2 },
    estimatedDuration: "Ongoing until carrier delay resolved (1-14 days)",
    tags: ["mass-carrier-delay", "bulk-notification", "alternative-carrier", "weather-disruption", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Critical Customer Exception — VIP Handling and Expedited Resolution Procedure",
    description: "Elevated response procedure for fulfillment exceptions affecting VIP customers, key accounts, or orders with significant business impact. Ensures fastest possible resolution path with executive visibility, dedicated ownership, and proactive recovery actions including expedited reshipping and service recovery credits.",
    industry: "order_to_cash",
    category: "customer_escalation",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "exception_on_vip_order", source: "exception_detection_skill", threshold: "severity_high_or_critical" },
      { type: "event", event: "exception_on_high_value_order", source: "exception_detection_skill", threshold: "order_value_gt_10000" },
    ],
    steps: [
      { id: "1", type: "action", action: "vip_identification", label: "Confirm VIP status: check CRM tier, account revenue, and open contract commitments", order: 1 },
      { id: "2", type: "action", action: "assign_owner", label: "Assign dedicated Senior Customer Success Manager as exception owner; notify account manager", order: 2 },
      { id: "3", type: "action", action: "phone_contact", label: "Phone customer within 15 minutes: acknowledge exception, provide initial status, confirm preferred resolution", order: 3 },
      { id: "4", type: "action", action: "expedited_resolution", label: "Evaluate expedited resolution options: emergency reship overnight; warehouse intercept; same-day courier", order: 4 },
      { id: "5", type: "approval_gate", label: "VP Customer Success approves expedited resolution cost (if material); waives standard thresholds for VIP recovery", approvalLevel: "confirm_before", order: 5 },
      { id: "6", type: "action", action: "execute_resolution", label: "Execute approved resolution: create expedited replacement order; cancel original if needed; notify warehouse for priority pick", order: 6 },
      { id: "7", type: "action", action: "update_every_2h", label: "Provide customer updates every 2 hours until exception resolved; escalate if resolution delayed beyond plan", order: 7 },
      { id: "8", type: "action", action: "service_recovery", label: "Upon resolution: offer service recovery gesture (credit, discount, expedite waiver) per customer tier policy", order: 8 },
      { id: "9", type: "action", action: "executive_debrief", label: "Post-resolution: debrief with VP Customer Success and account manager; document lessons learned; review prevention measures", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["vp_customer_success", "senior_cs_manager"], autoApproveAfterHours: null },
    estimatedDuration: "2-24 hours (severity dependent)",
    tags: ["VIP-handling", "critical-exception", "expedited-resolution", "key-account", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Warehouse System Outage — Contingency Fulfillment from Alternate Location",
    description: "Contingency procedure for fulfilling orders from an alternate warehouse location when the primary fulfillment center experiences a system or operational outage. Covers inventory verification at alternate location, routing rule changes in OMS/TMS, and customer communication for revised delivery timelines.",
    industry: "order_to_cash",
    category: "emergency",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "warehouse_operational_outage", source: "warehouse_operations", threshold: "outage_exceeds_4h" },
      { type: "event", event: "warehouse_system_outage", source: "wms_integration", threshold: "outage_exceeds_2h_cannot_pick" },
    ],
    steps: [
      { id: "1", type: "action", action: "outage_assessment", label: "Assess outage scope: is it system (WMS/IT) or operational (physical access, equipment, staffing)? Estimated restoration time?", order: 1 },
      { id: "2", type: "action", action: "alternate_location_check", label: "Identify alternate fulfillment location(s) with inventory for affected order lines; verify pick-pack capacity", order: 2 },
      { id: "3", type: "action", action: "inventory_verification", label: "Confirm inventory availability at alternate location via alternate WMS or manual inventory count", order: 3 },
      { id: "4", type: "approval_gate", label: "Supply Chain Director approves alternate location routing; confirms cost impact of extended transit times", approvalLevel: "confirm_before", order: 4 },
      { id: "5", type: "action", action: "reroute_orders", label: "Update OMS routing rules to assign open orders to alternate location; notify alternate warehouse of inbound orders", order: 5 },
      { id: "6", type: "action", action: "customer_notification", label: "Notify customers with at-risk delivery commitments of revised delivery timeline due to fulfillment center issue", order: 6 },
      { id: "7", type: "action", action: "carrier_update", label: "Update carrier pickup schedules at alternate location; confirm carrier can service alternate location ZIP", order: 7 },
      { id: "8", type: "action", action: "restoration_transition", label: "Upon primary location restoration: suspend alternate routing; drain alternate location queue; restore primary routing", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["supply_chain_director", "fulfillment_director"], autoApproveAfterHours: 1 },
    estimatedDuration: "4-72 hours (outage dependent)",
    tags: ["warehouse-outage", "alternate-fulfillment", "contingency", "emergency", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Returns Surge — Capacity Management, Prioritization Rules, and Temporary Processing Procedures",
    description: "Procedure for managing surges in return volume (particularly post-holiday) that exceed standard returns processing capacity. Covers capacity assessment, prioritization of high-value and time-sensitive returns, temporary processing procedures, and refund timing management to meet customer expectations and regulatory obligations.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "daily_return_volume", operator: "gte", value: 200, source: "returns_management_system" },
      { type: "threshold", metric: "returns_processing_queue_hours", operator: "gte", value: 48, source: "returns_management_system" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_volume", label: "Quantify return surge: volume vs. daily capacity, queue backlog days, expected duration of surge", order: 1 },
      { id: "2", type: "action", action: "prioritization_rules", label: "Apply return prioritization: VIP customers first; high-value refunds ($500+) second; damaged/safety items third; standard last", order: 2 },
      { id: "3", type: "action", action: "temp_staff_activation", label: "Activate temporary staffing protocol: contact staffing agency for 24-48h lead; brief on return processing procedure", order: 3 },
      { id: "4", type: "action", action: "extended_processing_hours", label: "Authorize extended processing hours (2nd shift or weekend) with Warehouse Manager approval", order: 4 },
      { id: "5", type: "action", action: "customer_communication", label: "Update returns status communication: notify customers of extended processing times (5-10 days vs. standard 3-5); proactively set expectations", order: 5 },
      { id: "6", type: "action", action: "refund_compliance_check", label: "Verify refund processing SLA compliance: credit card refunds must complete within 7 business days of return receipt; monitor queue", order: 6 },
      { id: "7", type: "action", action: "inventory_disposition", label: "For high-volume return items: coordinate with inventory team on restocking vs. liquidation vs. vendor return decisions", order: 7 },
      { id: "8", type: "action", action: "recovery_ramp_down", label: "Monitor daily return volume; ramp down temporary capacity when volume returns to within 120% of standard capacity", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["warehouse_manager", "customer_service_director"], autoApproveAfterHours: 4 },
    estimatedDuration: "1-4 weeks (seasonal surge dependent)",
    tags: ["returns-surge", "capacity-management", "post-holiday", "refund-compliance", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Lost Shipment Investigation — Carrier Claim Process and Replacement Order Procedure",
    description: "End-to-end procedure for investigating and resolving lost shipment exceptions including carrier tracer filing, replacement order authorization, carrier claim submission, and financial reconciliation. Ensures customers receive timely resolution while protecting the company's rights to carrier claim reimbursement.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "no_tracking_update", source: "fulfillment_event_monitoring_skill", threshold: "5_business_days_in_transit" },
      { type: "event", event: "customer_reports_non_delivery", source: "crm", threshold: "customer_contact_event" },
    ],
    steps: [
      { id: "1", type: "action", action: "delivery_verification", label: "Verify delivery status: check carrier POD system; check with neighbors / leasing office if residential; confirm correct address used", order: 1 },
      { id: "2", type: "action", action: "file_tracer", label: "File carrier tracer investigation via online portal or account manager; obtain case number; document in exception record", order: 2 },
      { id: "3", type: "action", action: "customer_notification", label: "Notify customer immediately: acknowledge non-delivery, provide tracer case number, set expectation on investigation timeline (5-10 business days)", order: 3 },
      { id: "4", type: "condition", condition: "tracer_days", label: "Has carrier investigation exceeded 5 business days without resolution?", trueNext: "5", falseNext: "8", order: 4 },
      { id: "5", type: "approval_gate", label: "Supply Chain Manager authorizes replacement order shipment; waits no longer than 5 business days for carrier confirmation", approvalLevel: "confirm_before", order: 5 },
      { id: "6", type: "action", action: "replacement_order", label: "Create replacement order in OMS at no charge; expedite to next-day air; notify customer of replacement tracking number", order: 6 },
      { id: "7", type: "action", action: "carrier_claim", label: "File formal loss claim with carrier: submit invoice, POD absence, tracer case number, replacement cost documentation", order: 7 },
      { id: "8", type: "action", action: "claim_follow_up", label: "Follow up on carrier claim every 7 days until resolved; escalate to carrier account manager if claim exceeds carrier SLA (30 days)", order: 8 },
      { id: "9", type: "action", action: "financial_reconciliation", label: "Upon claim resolution: post carrier reimbursement to financial system; reconcile replacement order cost against claim recovery", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["supply_chain_manager", "transportation_manager"], autoApproveAfterHours: null },
    estimatedDuration: "5-30 days (carrier claim dependent)",
    tags: ["lost-shipment", "carrier-claim", "replacement-order", "investigation", "OTC-AGT-005"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 GOVERNANCE POLICIES  (Section 6.7)
// ══════════════════════════════════════════════════════════════════════════════

const POLICIES = [
  {
    organizationId: ORG,
    name: "FTC Mail/Telephone Order Rule — Delivery Promise Compliance Policy",
    description: "Governs compliance with FTC Mail/Telephone Order Rule requirements for delivery date promises, delay notifications, customer consent to delays, cancellation rights, and refund processing timelines. All customer-facing delivery date commitments and delay notifications generated by OTC-AGT-005 must comply with this policy.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "ftc-001", type: "MUST", description: "Customer must be notified of delivery delay within 24 hours of determining order cannot ship by promised date" },
      { id: "ftc-002", type: "MUST", description: "Delay notification must include: reason for delay, revised shipment date, and customer options (consent to delay or cancel for full refund)" },
      { id: "ftc-003", type: "MUST", description: "Customer cancellation due to delay must result in full refund within 7 business days (credit card) or 30 days (other methods)" },
      { id: "ftc-004", type: "MUST", description: "If revised delivery date cannot be provided, customer must be offered cancellation with full refund as the default option" },
      { id: "ftc-005", type: "MUST_NOT", description: "Agent must not commit to a specific delivery date unless there is a reasonable basis to believe the date can be met" },
      { id: "ftc-006", type: "SHOULD", description: "Track all delay notifications and customer responses for FTC audit trail; retain records for minimum 2 years" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["FTC", "delivery-promise", "consumer-protection", "regulatory", "OTC-AGT-005"],
  },
  {
    organizationId: ORG,
    name: "Hazardous Materials Shipping Compliance Policy — DOT and IATA Regulations",
    description: "Governs compliance with DOT (49 CFR) and IATA dangerous goods regulations for shipments containing hazardous materials. OTC-AGT-005 must validate hazmat classification, packaging, labeling, and documentation requirements before releasing hazmat shipments and must not substitute hazmat items with different UN classification.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "haz-001", type: "MUST", description: "Verify hazmat classification (UN number, hazard class, packing group) before releasing shipment to carrier" },
      { id: "haz-002", type: "MUST", description: "Ensure proper labeling and placarding per DOT 49 CFR §172 is documented before shipment" },
      { id: "haz-003", type: "MUST", description: "Confirm carrier is authorized for hazmat transport (carrier certification check) before routing hazmat shipment" },
      { id: "haz-004", type: "MUST_NOT", description: "Never auto-substitute hazmat items — substitutes must have same UN classification, hazard class, and packing group; requires safety review" },
      { id: "haz-005", type: "MUST_NOT", description: "Never release hazmat shipment via air (IATA) without verifying shipper's declaration and PI compliance" },
      { id: "haz-006", type: "MUST", description: "Product recall of hazmat items: halt all in-transit shipments immediately; notify DOT if required under 49 CFR §171.15-16" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["hazmat", "DOT", "IATA", "dangerous-goods", "regulatory", "OTC-AGT-005"],
  },
  {
    organizationId: ORG,
    name: "International Shipping Compliance Policy — Customs and Import Regulations",
    description: "Governs compliance with international shipping requirements including customs documentation accuracy, country-specific import restrictions, denied party screening, export control classification, and sanctions compliance for cross-border shipments processed by OTC-AGT-005.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "intl-001", type: "MUST", description: "Verify customs documentation completeness (commercial invoice, packing list, HTS code, country of origin) before releasing international shipments" },
      { id: "intl-002", type: "MUST", description: "Perform denied party screening (OFAC, BIS Entity List, EU sanctions) on all international shipments before release" },
      { id: "intl-003", type: "MUST", description: "Verify import restrictions for destination country on all product categories before committing delivery" },
      { id: "intl-004", type: "MUST_NOT", description: "Do not release international shipments to sanctioned countries (OFAC SDN list) regardless of order origin" },
      { id: "intl-005", type: "SHOULD", description: "For substitutions on international orders: re-validate HTS classification and country-specific import eligibility for substitute product" },
      { id: "intl-006", type: "MUST", description: "Maintain customs documentation records for 5 years per CBP record-keeping requirements (19 CFR §163)" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["international-shipping", "customs", "OFAC", "import-compliance", "regulatory", "OTC-AGT-005"],
  },
  {
    organizationId: ORG,
    name: "Cold Chain Compliance Policy — Temperature-Sensitive Product Shipping",
    description: "Governs compliance requirements for temperature-sensitive product shipments to ensure cold chain integrity from warehouse to delivery. OTC-AGT-005 must verify cold chain carrier capability and packaging for temperature-sensitive products and apply appropriate exception handling when cold chain breach is detected.",
    type: "operational",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "cold-001", type: "MUST", description: "Verify cold chain carrier service availability at origin and destination before releasing temperature-sensitive shipments" },
      { id: "cold-002", type: "MUST", description: "Confirm appropriate packaging (refrigerated, frozen, controlled room temperature) is specified in shipment before WMS release" },
      { id: "cold-003", type: "MUST_NOT", description: "Never auto-substitute temperature-sensitive items with products of different temperature classification (e.g., refrigerated vs. frozen)" },
      { id: "cold-004", type: "MUST", description: "For carrier delays involving temperature-sensitive shipments: immediately evaluate product viability; notify customer of potential product integrity impact" },
      { id: "cold-005", type: "MUST", description: "Maintain temperature logs and cold chain documentation for temperature-sensitive shipments; retain records per applicable regulatory requirements (FDA 21 CFR for food/pharma)" },
      { id: "cold-006", type: "SHOULD", description: "Flag cold chain exceptions as HIGH or CRITICAL severity regardless of delay duration — product viability risk" },
    ],
    enforcement: "automatic",
    violationSeverity: "high",
    tags: ["cold-chain", "temperature-sensitive", "food-safety", "pharma-compliance", "OTC-AGT-005"],
  },
  {
    organizationId: ORG,
    name: "Product Recall Fulfillment Halt Policy — Trace, Hold, and Notification Procedure",
    description: "Governs OTC-AGT-005 actions when a product recall is declared. Agent must immediately halt all in-transit and pending shipments for affected SKUs, identify customers who received the recalled product, and support outbound recall notification. No substitution or fulfillment of recalled product is permitted.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "rec-001", type: "MUST", description: "Upon recall declaration: immediately halt all pending and in-transit shipments for recalled SKU(s) — no exceptions" },
      { id: "rec-002", type: "MUST", description: "Generate full traceability report: all orders containing recalled SKU shipped in the relevant lot/date range, with customer contact information" },
      { id: "rec-003", type: "MUST_NOT", description: "Never fulfill recalled SKU — including as a substitute product — until recall is formally lifted and inventory cleared" },
      { id: "rec-004", type: "MUST", description: "For in-transit recalled shipments: file carrier intercept request; if intercept not possible, notify customer immediately upon delivery and instruct on return" },
      { id: "rec-005", type: "MUST", description: "Escalate recall event to CRITICAL severity regardless of exception volume; invoke executive notification runbook" },
      { id: "rec-006", type: "SHOULD", description: "Coordinate recall notification communications with legal and regulatory affairs before sending customer-facing messages" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["product-recall", "regulatory", "traceability", "halt-shipment", "OTC-AGT-005"],
  },
  {
    organizationId: ORG,
    name: "Customer Communication Accessibility Policy — ADA/WCAG Compliance",
    description: "Ensures all customer-facing fulfillment exception communications generated by OTC-AGT-005 comply with ADA and WCAG 2.1 AA accessibility requirements. Covers digital communication formats, alternative format availability, plain language standards, and response mechanism accessibility.",
    type: "operational",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "acc-001", type: "MUST", description: "All email communications must use minimum 14pt font, 4.5:1 contrast ratio, and include alt text for all images (WCAG 2.1 AA)" },
      { id: "acc-002", type: "MUST", description: "All digital communications must include a plain language summary readable at 8th grade level or below" },
      { id: "acc-003", type: "MUST", description: "Portal notifications and customer response interfaces must be navigable by keyboard and compatible with screen readers (ARIA standards)" },
      { id: "acc-004", type: "SHOULD", description: "Upon customer request: provide alternative format communications (large print, audio summary, accessible PDF) within 2 business days" },
      { id: "acc-005", type: "MUST_NOT", description: "Do not make time-sensitive customer response options available only via non-accessible channels (e.g., image-only email with no text fallback)" },
      { id: "acc-006", type: "SHOULD", description: "Maintain alternative communication format request records; proactively use preferred format for customers with documented accessibility needs" },
    ],
    enforcement: "advisory",
    violationSeverity: "medium",
    tags: ["ADA", "WCAG", "accessibility", "customer-communication", "OTC-AGT-005"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — GOLDEN DATASET + 6 TEST CASES  (Section 6.5)
// ══════════════════════════════════════════════════════════════════════════════

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "OTC-AGT-005 Fulfillment & Exception Agent — Golden Evaluation Dataset",
  description: "Curated evaluation dataset for validating OTC-AGT-005 accuracy across fulfillment exception types: backorder detection and resolution, partial shipment handling, carrier delay management, substitution recommendation, escalation routing, and customer communication compliance.",
  industry: "order_to_cash",
  useCase: "Fulfillment & Exception Management",
  domain: "fulfillment-exception-management",
  version: "1.0",
  tags: ["fulfillment", "exception-management", "backorder", "carrier-delay", "substitution", "OTC-AGT-005"],
  metadata: {
    agentCode: "OTC-AGT-005",
    category: "Fulfillment",
    testDesign: "representative_exception_scenarios",
    evaluationCriteria: "detection_accuracy + resolution_appropriateness + communication_compliance + escalation_correctness",
  },
};

const TEST_CASES = [
  {
    name: "Full Backorder — High-Value B2B Order with Substitute Available",
    description: "Tests backorder detection, alternative product recommendation, and B2B customer communication for a key account order where the ordered item is fully out of stock but a Tier 2 substitute is available.",
    input: {
      orderId: "ORD-20240315-7821",
      customerId: "CUST-B2B-KEY-0042",
      customerTier: "Key Account",
      orderValue: 18500,
      lineItems: [
        { sku: "IND-BEARING-6205-2RS", description: "Deep Groove Ball Bearing 6205-2RS", qty: 500, unitPrice: 37.00 }
      ],
      wmsEvent: { type: "short_pick", quantityFound: 0, locationScanned: "LOC-A-12-3", timestamp: "2024-03-15T09:23:00Z" },
      inventoryCheck: { onHand: 0, inTransit: 0, nextReceiptDate: "2024-03-22", nextReceiptQty: 300 },
      substituteAvailable: { sku: "IND-BEARING-6205-2RS-ALT", description: "Deep Groove Ball Bearing 6205-2RSH (equivalent)", onHand: 650, priceDelta: "+1.8%" },
    },
    expectedOutput: {
      exceptionType: "backorder_full",
      severity: "HIGH",
      substitutionPresented: true,
      customerContactWithin: "2h",
      communicationTemplate: "COMM-BACKORDER-B2B",
      escalationLevel: "L2_Fulfillment_Supervisor",
      optionsPresented: ["wait_restock_2024-03-22", "accept_substitute_sku", "cancel_line"],
    },
    tags: ["backorder", "B2B", "key-account", "substitution", "high-value"],
    metrics: { detectionAccuracy: 1.0, resolutionAppropriateness: 1.0, communicationCompliance: 1.0, escalationCorrectness: 1.0 },
  },
  {
    name: "Carrier Delay — Weather Event Affecting 45 Shipments with VIP in Pool",
    description: "Tests mass carrier delay detection, VIP escalation identification, bulk vs. individual communication differentiation, and alternative carrier recommendation when a winter storm causes widespread UPS Ground delays.",
    input: {
      carrierEvent: { carrier: "UPS", serviceLevel: "Ground", advisory: "Winter Storm Warning — Midwest corridor", affectedShipments: 45, averageDelayDays: 2.8 },
      vipShipmentsInPool: [
        { orderId: "ORD-20240118-0091", customerId: "CUST-VIP-0019", deliveryCommitment: "2024-01-19", orderValue: 52000 }
      ],
      alternativeCarrierAvailable: { carrier: "FedEx Ground", lanesAvailable: ["Chicago-Detroit", "Chicago-Cleveland"], capacityAvailable: true },
    },
    expectedOutput: {
      massExceptionDetected: true,
      exceptionCount: 45,
      runbookActivated: "Mass Carrier Delay",
      vipDirectContactInitiated: true,
      vipContactWithinMinutes: 15,
      bulkNotificationSent: true,
      alternativeCarrierRecommended: "FedEx Ground",
      slaCreditsToFile: true,
    },
    tags: ["mass-carrier-delay", "weather", "VIP", "bulk-notification", "alternative-carrier"],
    metrics: { detectionAccuracy: 1.0, escalationCorrectness: 1.0, communicationCompliance: 1.0 },
  },
  {
    name: "Partial Shipment — Short-Ship Calculating Split Economics",
    description: "Tests short-ship exception detection, split shipment economics calculation (cost of shipping partial now vs. holding for complete order), and customer option presentation with correct financial impact analysis.",
    input: {
      orderId: "ORD-20240301-4456",
      customerId: "CUST-B2C-0087234",
      customerTier: "Standard",
      lineItems: [
        { sku: "APPL-COOKWARE-SET-12PC", description: "12-Piece Cookware Set", qty: 3, unitPrice: 189.99 },
        { sku: "APPL-UTENSIL-SET-6PC", description: "6-Piece Utensil Set", qty: 3, unitPrice: 34.99 },
      ],
      wmsShortPick: { sku: "APPL-COOKWARE-SET-12PC", orderedQty: 3, pickedQty: 1, reason: "inventory_discrepancy" },
      splitShipCost: 8.95,
      holdCostPerDay: 0,
      restockDate: "2024-03-05",
    },
    expectedOutput: {
      exceptionType: "short_ship",
      severity: "MEDIUM",
      splitShipRecommended: true,
      splitShipEconomics: { shipNowQty: 1, shipLaterQty: 2, additionalCarrierCost: 8.95, restockDate: "2024-03-05" },
      customerOptionsPresented: ["ship_1_now_2_on_restock", "hold_complete_order_until_2024-03-05", "cancel_2_backordered"],
      communicationTemplate: "COMM-PARTIAL-B2C",
    },
    tags: ["short-ship", "partial-shipment", "split-economics", "B2C"],
    metrics: { detectionAccuracy: 1.0, resolutionAppropriateness: 1.0, communicationCompliance: 1.0 },
  },
  {
    name: "Substitution Rejected — Customer Cancels; FTC Refund Compliance Triggered",
    description: "Tests the full substitution offer and rejection flow. Customer rejects substitute and cancels the backordered item. Validates that FTC refund compliance requirements (7-day credit card refund) are correctly triggered and tracked.",
    input: {
      orderId: "ORD-20240210-3312",
      customerId: "CUST-B2C-0055671",
      exceptionType: "backorder_full",
      substitutionOffered: { tier: "Tier 2", sku: "TOOL-DRILL-X200", priceDelta: "+4.2%", customerResponse: "rejected" },
      customerDecision: "cancel_line",
      paymentMethod: "credit_card",
      orderValue: 249.00,
      cancellationTimestamp: "2024-02-10T14:30:00Z",
    },
    expectedOutput: {
      cancellationProcessed: true,
      refundAmount: 249.00,
      refundMethod: "credit_card",
      refundDeadline: "2024-02-19",
      ftcComplianceFlag: "refund_within_7_business_days",
      auditTrailCreated: true,
      customerNotified: true,
    },
    tags: ["substitution-rejection", "cancellation", "FTC-compliance", "refund", "B2C"],
    metrics: { resolutionAppropriateness: 1.0, communicationCompliance: 1.0 },
  },
  {
    name: "Lost Shipment Investigation — 6 Business Days No Tracking; Replacement Authorization",
    description: "Tests lost shipment detection workflow: confirms no tracking update after 6 business days, validates carrier tracer filing, tests replacement order authorization, and verifies customer notification with correct framing (investigation active + replacement authorized).",
    input: {
      orderId: "ORD-20240128-9903",
      customerId: "CUST-B2B-0033",
      customerTier: "Standard",
      shipmentId: "SHIP-20240128-001",
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS",
      lastTrackingEvent: { event: "In Transit", location: "Kansas City, MO", timestamp: "2024-01-29T11:00:00Z" },
      currentDate: "2024-02-06",
      businessDaysSinceLastScan: 6,
      orderValue: 3200,
    },
    expectedOutput: {
      exceptionType: "lost_shipment",
      severity: "CRITICAL",
      deliveryVerificationCompleted: true,
      carrierTracerFiled: true,
      customerNotifiedWithinHours: 1,
      replacementOrderAuthorized: true,
      carrierClaimToFile: true,
      runbookActivated: "Lost Shipment Investigation",
    },
    tags: ["lost-shipment", "carrier-investigation", "replacement-order", "critical-exception"],
    metrics: { detectionAccuracy: 1.0, escalationCorrectness: 1.0, communicationCompliance: 1.0 },
  },
  {
    name: "Post-Delivery Damage Claim — Resolution with Carrier Claim and Customer Replacement",
    description: "Tests post-delivery exception handling: customer reports damaged item on delivery. Validates damage documentation process, carrier claim filing timeline compliance, replacement order creation, and customer satisfaction recovery communication.",
    input: {
      orderId: "ORD-20240305-8821",
      customerId: "CUST-B2C-0091023",
      customerTier: "Standard",
      deliveryConfirmed: true,
      deliveryDate: "2024-03-07",
      customerDamageReport: { reportedDate: "2024-03-08", description: "Box crushed; product inside cracked and unusable", photosProvided: true },
      carrier: "FedEx",
      insuranceDeclared: false,
      standardLiabilityLimit: 100,
      productValue: 299.99,
    },
    expectedOutput: {
      exceptionType: "damage_claim",
      severity: "HIGH",
      damageDocumentationRequired: true,
      carrierClaimFilingDeadlineDays: 15,
      replacementOrderCreated: true,
      carrierClaimAmount: 100,
      outOfPocketExposure: 199.99,
      customerCommunicationSent: true,
      serviceRecoveryOffered: true,
      resolutionPlaybookActivated: "Damage Claim",
    },
    tags: ["damage-claim", "post-delivery", "carrier-liability", "replacement", "service-recovery"],
    metrics: { resolutionAppropriateness: 1.0, communicationCompliance: 1.0 },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — KPIs
// ══════════════════════════════════════════════════════════════════════════════

const KPIS = [
  {
    name: "Exception Detection Rate",
    description: "Percentage of actual fulfillment exceptions detected by OTC-AGT-005 before customer contact or manual discovery",
    type: "accuracy",
    targetValue: 95,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(agent_detected_exceptions / total_exceptions) * 100",
    tags: ["detection", "accuracy", "fulfillment", "OTC-AGT-005"],
  },
  {
    name: "Time to First Customer Communication",
    description: "Average hours from exception detection to first customer notification across all exception types",
    type: "performance",
    targetValue: 4,
    unit: "hours",
    measurementFrequency: "weekly",
    formula: "avg(customer_notification_timestamp - exception_detection_timestamp) in hours",
    tags: ["customer-communication", "speed", "SLA", "OTC-AGT-005"],
  },
  {
    name: "Proactive Notification Rate",
    description: "Percentage of exception-impacted customers notified before they contact customer service",
    type: "quality",
    targetValue: 90,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(proactive_notifications / total_exceptions_with_customer_impact) * 100",
    tags: ["proactive", "customer-experience", "OTC-AGT-005"],
  },
  {
    name: "Substitution Acceptance Rate",
    description: "Percentage of customers who accept the substitute product recommendation when a backorder substitution is offered",
    type: "quality",
    targetValue: 55,
    unit: "percentage",
    measurementFrequency: "monthly",
    formula: "(substitutions_accepted / substitutions_offered) * 100",
    tags: ["substitution", "acceptance", "backorder-resolution", "OTC-AGT-005"],
  },
  {
    name: "First Resolution Rate",
    description: "Percentage of exceptions fully resolved in a single resolution action without requiring rework or secondary exception",
    type: "quality",
    targetValue: 75,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(single_action_resolutions / total_closed_exceptions) * 100",
    tags: ["resolution-quality", "efficiency", "OTC-AGT-005"],
  },
  {
    name: "Carrier Delay Detection Accuracy",
    description: "Accuracy of carrier delay exception detection and notification timeliness relative to actual SLA breach moment",
    type: "accuracy",
    targetValue: 98,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(correctly_detected_delays / total_actual_delays) * 100",
    tags: ["carrier-delay", "detection", "accuracy", "OTC-AGT-005"],
  },
  {
    name: "Customer Satisfaction Score — Exception-Impacted Orders",
    description: "Average CSAT score for orders that experienced a fulfillment exception, measured post-resolution",
    type: "quality",
    targetValue: 3.8,
    unit: "score_out_of_5",
    measurementFrequency: "monthly",
    formula: "avg(csat_score) where order_had_exception = true",
    tags: ["customer-satisfaction", "CSAT", "exception-impact", "OTC-AGT-005"],
  },
  {
    name: "Escalation Rate",
    description: "Percentage of exceptions requiring L2 or higher human escalation versus auto-resolved or L1-resolved by agent",
    type: "efficiency",
    targetValue: 15,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(l2_plus_escalations / total_exceptions) * 100",
    tags: ["escalation", "automation", "efficiency", "OTC-AGT-005"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PROMPTS
// ══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the Fulfillment & Exception Agent (OTC-AGT-005) for an Order-to-Cash platform. Your purpose is to monitor the end-to-end fulfillment lifecycle from order release through delivery, detect and resolve exceptions, coordinate proactive customer communications, and manage escalations to prevent service failures.

WORKFLOW:
1. Receive released orders from the Order Validation Agent
2. Monitor pick, pack, and ship events from WMS and carrier systems
3. Detect exceptions: stock-outs, picking errors, carrier delays, address issues
4. For backorders: determine expected availability and offer wait/substitute/cancel options
5. For partial shipments: calculate split economics and present options to customer
6. For substitutions: identify eligible alternatives from approved substitution matrix and validate with customer
7. Update tracking and share proactively with customers
8. Monitor carrier tracking for delivery exceptions (delay, damage, return-to-sender)
9. Confirm delivery and trigger warranty/service activation if applicable
10. Resolve post-delivery issues (missing items, wrong items, damage claims)
11. Feed resolution data back for continuous improvement

OPERATING CONSTRAINTS:
- SUPERVISED autonomy for all customer-facing communications — escalate non-standard communications for review
- NEVER commit to a delivery date without verifiable carrier and WMS data backing
- NEVER auto-substitute hazmat, pharmaceutical, food allergen, or recalled products — always require approval
- ALWAYS apply FTC Mail Order Rule compliance for delay notifications and cancellation rights
- ALWAYS escalate CRITICAL exceptions (lost shipments, mass carrier events, product recalls) within 15 minutes
- Severity thresholds: CRITICAL = executive escalation + phone; HIGH = supervisor escalation; MEDIUM = queue + notification; LOW = auto-queue

REGULATORY GUARDRAILS: FTC Mail/Telephone Order Rule; DOT/IATA hazmat regulations; international customs and OFAC screening; FDA cold chain for food/pharma; ADA/WCAG communication accessibility`;

const RUNTIME_TASK_PROMPT = `Analyze the fulfillment event or exception request. For new exceptions: classify exception type and severity, identify resolution options, determine whether customer communication is required and what channel/template to use, assess whether escalation is needed, and initiate appropriate resolution workflow. For active exceptions: provide status update, adjust resolution path if circumstances changed, and ensure customer communication SLAs are being met. For tracking requests: retrieve latest carrier and WMS status, flag anomalies, and determine if an exception should be raised. All CRITICAL exceptions require immediate escalation regardless of time of day.`;

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  OTC-AGT-005 — Fulfillment & Exception Agent");
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
    name: "Fulfillment & Exception Agent Knowledge Base",
    description: "Comprehensive knowledge base for OTC-AGT-005 covering fulfillment center SOPs, carrier service guides and claim procedures, product substitution matrices, customer communication templates, exception resolution playbooks, and historical exception patterns and seasonal trends.",
    industry: "order_to_cash",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["fulfillment", "exceptions", "carrier-management", "customer-communication", "backorder", "substitution", "OTC-AGT-005"],
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
  step("6", "11", "Creating agent OTC-AGT-005");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Fulfillment & Exception Agent",
    agentType: "operational",
    description: "Monitors the end-to-end fulfillment lifecycle from order release through delivery. Detects and resolves exceptions including backorders, partial shipments, substitutions, and delivery delays. Coordinates proactive customer communications and manages escalations to prevent service failures. Supports OTC-AGT-005 in the Order-to-Cash scenario.",
    owner: "OTC Platform Team",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "development",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Fulfillment Operations",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "OTC-AGT-005",
      category: "Fulfillment",
      scenario: "Order to Cash",
      exceptionTypes: ["backorder", "short_ship", "substitution_required", "carrier_delay", "address_issue", "picking_error", "lost_shipment", "damage_claim", "return_to_sender"],
      severityLevels: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      escalationTriggers: [
        "critical_severity_exception",
        "vip_customer_exception",
        "mass_carrier_delay_10plus",
        "lost_shipment_detected",
        "product_recall_declared",
        "wms_outage_2h_plus",
        "returns_surge_threshold",
      ],
      complianceChecks: ["FTC_mail_order_rule", "DOT_IATA_hazmat", "OFAC_sanctions_screening", "cold_chain_requirements", "ADA_WCAG_communications"],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "OTC-AGT-005",
      category: "Fulfillment",
      nodes: [
        { id: "order_receive", type: "trigger", label: "Receive Released Order from Order Validation Agent" },
        { id: "event_monitor", type: "skill", label: "Fulfillment Event Monitoring" },
        { id: "exception_detect", type: "skill", label: "Exception Detection & Classification" },
        { id: "backorder_path", type: "condition", label: "Backorder / Short-Ship Path" },
        { id: "alt_product", type: "skill", label: "Alternative Product Recommendation" },
        { id: "carrier_delay_path", type: "condition", label: "Carrier Delay / Delivery Exception Path" },
        { id: "carrier_perf", type: "skill", label: "Carrier Performance Analysis" },
        { id: "customer_comm", type: "skill", label: "Customer Communication" },
        { id: "escalation", type: "skill", label: "Escalation Management" },
        { id: "resolution_close", type: "action", label: "Resolution Documentation & Feedback Loop" },
        { id: "output", type: "output", label: "Exception Resolved + Customer Notified + Data Fed Back" },
      ],
      edges: [
        { from: "order_receive", to: "event_monitor" },
        { from: "event_monitor", to: "exception_detect" },
        { from: "exception_detect", to: "backorder_path" },
        { from: "exception_detect", to: "carrier_delay_path" },
        { from: "backorder_path", to: "alt_product" },
        { from: "alt_product", to: "customer_comm" },
        { from: "carrier_delay_path", to: "carrier_perf" },
        { from: "carrier_perf", to: "customer_comm" },
        { from: "customer_comm", to: "escalation" },
        { from: "escalation", to: "resolution_close" },
        { from: "resolution_close", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: [
        "retrieve_kb", "poll_wms_events", "poll_carrier_api", "correlate_events",
        "classify_exception", "score_severity", "route_exception",
        "query_substitution_matrix", "check_inventory_availability", "rank_alternatives",
        "generate_communication", "send_notification", "log_customer_response",
        "query_carrier_performance_data", "calculate_sla_adherence", "recommend_carrier_switch",
        "classify_escalation_path", "notify_team", "activate_runbook",
        "track_escalation_lifecycle", "close_escalation", "feed_resolution_data",
      ],
      mcpServers: ["wms-integration-mcp", "carrier-api-mcp", "order-management-mcp", "crm-mcp", "product-catalog-mcp", "inventory-mcp"],
    },
    maxToolIterations: 12,
    complianceTags: ["FTC-Mail-Order-Rule", "DOT-Hazmat", "IATA-DG", "OFAC", "ADA-WCAG", "FDA-ColdChain", "CBP-Customs"],
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Fulfillment & Exception Agent → ${agentRes.id}`);

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
        exceptionTypeFiltering: true,
        carrierFiltering: true,
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
        ...tc,
        datasetId: ids.goldenDatasetId,
        organizationId: ORG,
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
    name: "OTC-AGT-005 Fulfillment & Exception Agent Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      exceptionDetectionRate: 0.95,
      proactiveNotificationRate: 0.90,
      substitutionAcceptanceRate: 0.55,
      firstResolutionRate: 0.75,
      escalationCorrectness: 0.95,
      communicationCompliance: 0.98,
      overallPassRate: 0.90,
    },
    scorerConfig: {
      primary: "fulfillment_ops_ground_truth",
      secondary: "customer_satisfaction_correlation",
      rubric: "rubricScoring",
      ftcComplianceCheck: true,
      escalationPathVerification: true,
      communicationTimingCheck: true,
    },
    coverageTags: ["backorder", "short-ship", "substitution", "carrier-delay", "lost-shipment", "damage-claim", "VIP-escalation", "FTC-compliance", "mass-exception"],
    environmentThresholds: {
      staging: { minPassRate: 0.88 },
      production: { minPassRate: 0.92 },
    },
    schedule: "weekly:Wednesday:06:00 UTC",
    industry: "order_to_cash",
    ontologyTags: ["Fulfillment Event Monitoring", "Exception Detection", "Alternative Recommendation", "Customer Communication", "Carrier Performance", "Escalation Management"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 11: OUTCOME CONTRACT + 8 KPIS ───────────────────────────────────────
  step("11", "11", "Creating outcome contract + 8 KPIs and linking all to agent");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Fulfillment & Exception Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing OTC-AGT-005. Targets exception detection rate, proactive notification speed, substitution acceptance, first resolution rate, and customer satisfaction for fulfillment exception management across the Order-to-Cash scenario.",
      version: 1,
      status: "active",
      industry: "order_to_cash",
      agentCode: "OTC-AGT-005",
      category: "Fulfillment",
      scenario: "Order to Cash",
      objectives: [
        "Detect 95%+ of fulfillment exceptions before customer contact or manual discovery",
        "Notify customers within 4 hours of exception detection for 90%+ of impacted orders",
        "Achieve 55%+ substitution acceptance rate when alternatives are offered for backorder exceptions",
        "Resolve 75%+ of exceptions in first resolution action without rework",
        "Maintain customer satisfaction score ≥ 3.8/5.0 for exception-impacted orders",
      ],
      successCriteria: {
        primary: "Exception detection rate ≥ 95% and proactive notification rate ≥ 90%",
        secondary: "First resolution rate ≥ 75%; customer satisfaction ≥ 3.8/5.0; escalation rate ≤ 15%",
        guardrails: "Zero FTC Mail Order Rule violations; zero unauthorized hazmat substitutions; zero unescalated CRITICAL exceptions",
      },
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        lookbackWindowDays: 90,
        minimumConfidenceThreshold: 0.80,
      },
      targetMetrics: {
        exceptionDetectionRate: 0.95,
        proactiveNotificationRate: 0.90,
        substitutionAcceptanceRate: 0.55,
        firstResolutionRate: 0.75,
        customerSatisfactionScore: 3.8,
        carrierDelayDetectionAccuracy: 0.98,
        escalationRate: 0.15,
      },
      slaConfig: {
        responseTimeMs: 5000,
        availabilityTarget: 0.999,
        criticalEscalationResponseMinutes: 15,
        highEscalationResponseHours: 1,
        customerNotificationHoursMax: 4,
      },
      criticalPath: ["event_monitoring", "exception_detection", "customer_communication", "resolution_workflow", "escalation_management"],
      roiEstimate: {
        proactiveNotificationCSSavings: 125000,
        substitutionRevenueRetention: 340000,
        escalationReductionSavings: 85000,
        carrierSLACreditRecovery: 45000,
        customerChurnReduction: 0.12,
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

    // OTC-AGT-005 preferred ontology concepts
    const preferred = [
      "gs1-12",                    // Order Fulfillment | Fulfillment
      "gs1-20",                    // Last Mile Delivery | Fulfillment
      "gs1-13",                    // Returns Processing | Fulfillment
      "otc-agt002-order-exception", // Order Exception | Compliance & Validation
      "isa-24",                    // Shipping and Logistics | Supply Chain
      "gs1-6",                     // Supply Chain Visibility | Supply Chain
    ];

    const tags = [];
    for (const id of preferred) {
      if (byId.has(id)) {
        const c = byId.get(id);
        tags.push({ conceptId: c.id, label: c.label, category: c.category });
      }
    }

    // Fill to 5 minimum from OTC/supply chain concepts if any preferred missing
    if (tags.length < 5) {
      const used = new Set(tags.map(t => t.conceptId));
      const fills = allConcepts.filter(x =>
        ["gs1", "isa", "otc"].some(prefix => x.id.startsWith(prefix)) && !used.has(x.id)
      );
      for (const c of fills) {
        if (tags.length >= 6) break;
        tags.push({ conceptId: c.id, label: c.label, category: c.category });
        used.add(c.id);
      }
    }

    await patch(`/api/agents/${ids.agentId}`, { ontologyTags: tags });
    log(`Ontology tags set (${tags.length}): ${tags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/otc-agt-005-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  OTC-AGT-005 — ALL 11 STEPS COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/otc-agt-005-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  DEV creation failed: ${err.message}`);
  process.exit(1);
});
