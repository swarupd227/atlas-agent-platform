#!/usr/bin/env node
/**
 * OTC-AGT-007 — Delivery Tracking & Confirmation Agent
 * DEV ENVIRONMENT — SINGLE COMPREHENSIVE CREATION SCRIPT
 *
 * Creates ALL platform intelligence in ONE script in the correct order:
 *  ✅ eval schedule → string "weekly:Wednesday:07:00 UTC"
 *  ✅ outcome version → number 1
 *  ✅ preloadedSkills → [{skillId, loadOrder}]
 *  ✅ ontologyTags → fetched dynamically from /api/ontology-concepts/all
 *  ✅ KB sources → POST /sources/text with `title` field
 *  ✅ Runbook agentId → PATCH /api/runbooks/:id {agentId}
 *  ✅ Policy scopeId → PATCH /api/policies/:id {scopeId, scopeType:"agent"}
 *  ✅ KB link → POST /api/agents/:id/knowledge-bases
 *  ✅ Eval + Outcome → PATCH /api/agents/:id {outcomeId, evalBindings:[...]}
 *  ✅ HTML response guard on every API call
 *
 * Usage:  node scripts/create-otc-agt-007-dev.js
 * Saves:  scripts/otc-agt-007-dev-ids.json
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

// ── Content helpers (avoids backtick issues in template literals) ─────────────
// All content strings use this helper so inline-code and code-fence backticks
// are never adjacent to the template literal delimiter.
const BT = "\x60"; // backtick character via hex escape — safe inside template literals
const TBT = "\x60\x60\x60"; // triple backtick

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 SKILLS
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Multi-Carrier Tracking Aggregation Skill",
    description: "Integrates with major carrier APIs (UPS, FedEx, USPS, DHL Express, DHL eCommerce, OnTrac, LaserShip, regional LTL carriers) to continuously ingest raw tracking events and normalize them into a unified event schema. Handles carrier-specific authentication, API rate limits, polling schedules, and webhook registrations. Translates carrier-native status codes (UPS X1, FedEx OC, USPS Out for Delivery, DHL transit events) into a canonical tracking state model (CREATED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, ATTEMPTED, EXCEPTION, RETURNED). Deduplicates events, resolves event ordering conflicts from late-arriving carrier updates, and maintains a complete, ordered tracking timeline per shipment. Supports bulk tracking queries for high-volume shipment portfolios and exposes a unified tracking API consumed by all downstream skills and notification systems.",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["multi-carrier", "tracking-aggregation", "carrier-API", "event-normalization", "shipment-tracking", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "poll_carrier_api", "register_carrier_webhook", "normalize_tracking_event", "deduplicate_events", "update_shipment_timeline", "query_bulk_tracking", "resolve_carrier_auth", "handle_rate_limit_backoff", "log_tracking_activity"],
    requiredMcpServers: ["ups-carrier-mcp", "fedex-carrier-mcp", "usps-carrier-mcp", "dhl-carrier-mcp", "regional-carrier-mcp", "order-management-mcp"],
    requiredDataClassifications: ["shipment_data", "carrier_api_credentials", "tracking_event_data", "order_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["carrier API authentication procedures", "tracking status code normalization maps", "carrier polling schedules and rate limits", "webhook registration by carrier", "bulk tracking query limits by carrier"],
    yamlFrontmatter: `name: Multi-Carrier Tracking Aggregation Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nsupported_carriers: [UPS, FedEx, USPS, DHL_Express, DHL_eCommerce, OnTrac, LaserShip, regional_LTL]\nunified_status_model: [CREATED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, ATTEMPTED, EXCEPTION, RETURNED]\npolling_mode: webhook_primary_polling_fallback\nbulk_tracking: true\ndeduplication: true`,
    markdownBody: `# Multi-Carrier Tracking Aggregation Skill\n\n## Purpose\nProvides a single, unified source of truth for shipment tracking across all carrier networks. Eliminates the need for downstream systems to integrate with each carrier individually, normalizing disparate carrier data formats into a consistent event model that feeds customer notifications, ETA prediction, and delivery confirmation.\n\n## Carrier Integration Architecture\n\n### Carrier API Connection Methods\n| Carrier | Primary Method | Fallback Method | Auth Type | Rate Limit |\n|---|---|---|---|---|\n| UPS | Webhook (Quantum View) | REST polling | OAuth 2.0 | 100 req/min |\n| FedEx | Webhook (FedEx Notification) | REST polling | API Key + Secret | 100 req/min |\n| USPS | REST polling | SOAP polling | User ID + Password | 50 req/min |\n| DHL Express | Webhook (DHL Track) | REST polling | API Key | 150 req/min |\n| DHL eCommerce | REST polling | FTP file exchange | API Key | 100 req/min |\n| OnTrac | REST polling | — | API Key | 60 req/min |\n| LaserShip | REST polling | — | API Key | 60 req/min |\n| Regional LTL | EDI 214 / REST | EDI file processing | Varies | Varies |\n\n### Canonical Status Model\n\n| Canonical Status | Description | Carrier Trigger Examples |\n|---|---|---|\n| CREATED | Shipment label created; not yet picked up | UPS: MP, FedEx: OC, USPS: Label Created |\n| IN_TRANSIT | Moving through carrier network | UPS: I, FedEx: IT, USPS: In Transit |\n| OUT_FOR_DELIVERY | On delivery vehicle | UPS: O, FedEx: OD, USPS: Out for Delivery |\n| DELIVERED | Confirmed delivered | UPS: D, FedEx: DL, USPS: Delivered |\n| ATTEMPTED | Delivery attempted; not delivered | UPS: X1, FedEx: CA, USPS: Notice Left |\n| EXCEPTION | Delay, damage, or other exception | UPS: X3, FedEx: DE, USPS: Alert |\n| RETURNED | Package being returned to sender | UPS: RR, FedEx: RS, USPS: Return to Sender |\n\n## Event Processing Pipeline\n\n### Step 1 — Event Ingestion\n- Receive webhook push OR execute scheduled poll per carrier\n- Authenticate response: verify webhook signature (HMAC) or API response integrity\n- Extract raw events with carrier-native fields\n\n### Step 2 — Normalization\n1. Map carrier status code to canonical status\n2. Normalize timestamp to UTC ISO-8601\n3. Standardize location format: city, state, zip, country code\n4. Extract exception details (if applicable): damage code, customs hold code, weather delay flag\n5. Assign event confidence score: 1.0 (webhook real-time), 0.9 (near-real-time poll), 0.7 (batch poll)\n\n### Step 3 — Deduplication and Ordering\n- Hash key: carrier_id + tracking_number + event_timestamp + status_code\n- If hash exists: discard duplicate (log for monitoring)\n- If event arrives out of chronological order: insert at correct position in timeline; do not overwrite later confirmed events with earlier superseded ones\n\n### Step 4 — Timeline Maintenance\n- Append normalized event to shipment's ordered event log\n- Update shipment's current_status to the most recent event\n- Update estimated_delivery_date if carrier provides updated ETA\n- Trigger downstream skill notifications on status transitions: IN_TRANSIT to OUT_FOR_DELIVERY, OUT_FOR_DELIVERY to DELIVERED, any to EXCEPTION\n\n## Polling Schedule by Carrier and Shipment Age\n\n| Shipment Age | Poll Frequency (non-webhook carriers) | Rationale |\n|---|---|---|\n| Day 0-1 (just created) | Every 4 hours | Label created; may not be picked up yet |\n| Day 1-3 (active transit) | Every 1 hour | Active movement; customer expects updates |\n| Day 3+ (delayed or exception) | Every 30 minutes | Elevated monitoring for at-risk shipments |\n| Post-delivery | Once per day for 3 days | Verify no post-delivery exceptions |\n\n## Error Handling\n- Carrier API down: engage Carrier API Down Runbook; switch to polling fallback\n- Rate limit exceeded: implement exponential backoff; prioritize high-value and exception shipments\n- Authentication failure: alert integration team; use last-known tracking data; do not generate false status updates\n- Malformed carrier response: log raw payload for debugging; skip event; generate data quality alert`,
  },
  {
    organizationId: ORG,
    name: "Predictive ETA Skill",
    description: "Generates accurate, dynamically updated delivery ETA predictions by combining carrier-provided estimated delivery dates with real-time intelligence: current shipment location, historical carrier performance by lane and service level, live weather event data, regional operational disruptions, and time-of-day delivery patterns. Uses a weighted multi-factor model to produce ETA ranges with confidence intervals. Detects when carrier-provided ETAs are likely to be missed based on current transit velocity and flags at-risk shipments for proactive customer notification at least 4 hours before the original ETA. Continuously recalculates ETAs as new tracking events arrive and updates downstream systems. Benchmarks carrier-level ETA accuracy monthly to calibrate prediction weights by carrier and service type.",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Multi-Carrier Tracking Aggregation Skill"],
    tags: ["ETA-prediction", "delivery-forecast", "carrier-performance", "weather-intelligence", "at-risk-detection", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "get_shipment_tracking_timeline", "fetch_carrier_eta", "fetch_weather_events", "lookup_carrier_lane_performance", "calculate_transit_velocity", "compute_eta_confidence", "flag_at_risk_shipment", "update_shipment_eta", "generate_eta_accuracy_report"],
    requiredMcpServers: ["carrier-performance-mcp", "weather-intelligence-mcp", "order-management-mcp", "analytics-platform-mcp"],
    requiredDataClassifications: ["shipment_data", "carrier_performance_data", "weather_data", "historical_delivery_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["carrier on-time performance by lane and service level", "weather disruption impact on carrier networks", "transit velocity benchmarks by carrier and origin-destination pair", "ETA prediction model weights by carrier", "at-risk shipment detection thresholds"],
    yamlFrontmatter: `name: Predictive ETA Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\neta_model: weighted_multi_factor\nconfidence_interval: true\nat_risk_detection: true\nat_risk_lead_time_hours: 4\ncalibration_frequency: monthly\nweather_integration: true`,
    markdownBody: `# Predictive ETA Skill\n\n## Purpose\nEnhances carrier-provided ETAs with data-driven accuracy improvements, enabling proactive customer communication before missed deliveries occur. Reduces customer service contacts by anticipating delivery timing and communicating proactively.\n\n## ETA Prediction Model\n\n### Input Factors and Weights\n\n| Factor | Weight | Data Source | Update Frequency |\n|---|---|---|---|\n| Carrier-provided ETA | 35% | Carrier API / tracking event | Per tracking event |\n| Historical OTP by carrier + lane | 25% | Carrier performance database | Monthly calibration |\n| Current transit velocity | 20% | Tracking event sequence analysis | Per event |\n| Weather disruption impact | 10% | Weather intelligence MCP | Hourly |\n| Regional operational disruptions | 7% | Carrier operational alerts | Per carrier bulletin |\n| Time-of-day delivery pattern | 3% | Historical delivery time data | Monthly calibration |\n\n### Transit Velocity Calculation\n\n  transit_velocity = distance_traveled_miles / hours_elapsed_since_pickup\n  expected_velocity = historical_avg_miles_per_day_for_service_level / 24\n  velocity_ratio = transit_velocity / expected_velocity\n  IF velocity_ratio < 0.65: shipment is at HIGH risk of missing ETA\n  IF velocity_ratio < 0.80: shipment is at MEDIUM risk\n  IF velocity_ratio >= 0.95: shipment is ON TRACK\n\n### ETA Confidence Scoring\n\n| Confidence | Condition | ETA Window Presented to Customer |\n|---|---|---|\n| HIGH (>=0.85) | Carrier OTP >95%; no weather; velocity on track | Specific date |\n| MEDIUM (0.65-0.84) | Minor risk factors present | Date range (+/-1 day) |\n| LOW (<0.65) | Multiple risk factors or active exception | Broad window (2-3 day range) |\n\n## At-Risk Shipment Detection\n\n### Risk Escalation Rules\n1. Carrier ETA is today or tomorrow AND transit velocity < 70% of expected: CRITICAL\n2. No tracking events for >24h during active transit: HIGH\n3. EXCEPTION status event received: HIGH\n4. Weather disruption score >7/10 on delivery lane: HIGH\n5. Historical OTP for carrier+lane <75% on promised service level: MEDIUM\n\n### Alert Timing\n- CRITICAL: Alert triggered immediately; customer notification within 30 minutes\n- HIGH: Alert triggered; customer notification within 2 hours\n- MEDIUM: Flagged for monitoring; notify if status degrades\n\n## Carrier OTP Benchmarks (Calibration Reference)\n\n| Carrier | Service Level | Target OTP | Alert Threshold |\n|---|---|---|---|\n| UPS | Ground | 96% | <88% |\n| UPS | 2-Day Air | 98% | <94% |\n| FedEx | Ground | 95% | <87% |\n| FedEx | Express | 98% | <95% |\n| USPS | Priority Mail | 91% | <82% |\n| USPS | First Class | 87% | <75% |\n| DHL Express | International | 93% | <85% |\n\n## ETA Accuracy Reporting\n- Monthly: calculate MAPE (Mean Absolute Percentage Error) by carrier, service, and lane\n- Flag carriers where prediction MAPE >15% for weight recalibration\n- Report ETA accuracy trends to Operations leadership quarterly`,
  },
  {
    organizationId: ORG,
    name: "Delivery Anomaly Detection Skill",
    description: "Monitors the real-time tracking event stream and applies configurable detection rules to identify shipment anomalies: prolonged transit silence (no tracking events for configurable period), stalled shipments (multiple scans at same location), delivery exceptions (damage, address issues, refused delivery), abnormal route deviations, customs holds, failed delivery attempts exceeding threshold, and carrier-reported loss events. Classifies anomalies by severity (CRITICAL, HIGH, MEDIUM) and type. Initiates automated resolution workflows for standard anomaly types and escalates complex situations to human operations staff. Tracks anomaly resolution rates and mean time to resolution (MTTR) as operational KPIs. Feeds exception data back to the Carrier Performance database for SLA tracking and claim filing eligibility determination.",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Multi-Carrier Tracking Aggregation Skill", "Predictive ETA Skill"],
    tags: ["anomaly-detection", "exception-management", "delivery-exception", "carrier-alert", "customs-hold", "lost-shipment", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "monitor_tracking_stream", "evaluate_anomaly_rules", "classify_anomaly_severity", "trigger_resolution_workflow", "escalate_to_operations", "contact_carrier_exception_desk", "update_exception_record", "calculate_mttr", "feed_carrier_performance_db"],
    requiredMcpServers: ["order-management-mcp", "carrier-performance-mcp", "crm-mcp", "operations-alerting-mcp"],
    requiredDataClassifications: ["shipment_data", "tracking_event_data", "carrier_exception_data", "customer_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["delivery exception classification rules", "carrier exception code definitions", "anomaly severity thresholds", "lost shipment definition by carrier", "customs hold resolution procedures", "carrier claim filing eligibility"],
    yamlFrontmatter: `name: Delivery Anomaly Detection Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nanomaly_types: [transit_silence, stalled_shipment, delivery_exception, route_deviation, customs_hold, failed_attempt_threshold, carrier_loss]\nseverity_levels: [CRITICAL, HIGH, MEDIUM, LOW]\nauto_resolution: true\nescalation_to_human: true`,
    markdownBody: `# Delivery Anomaly Detection Skill\n\n## Purpose\nProvides early warning of delivery problems before they impact customer experience and SLA compliance. Enables proactive resolution — contacting carriers, updating ETAs, and notifying customers — before the customer contacts support.\n\n## Anomaly Detection Rules\n\n### Rule Set 1: Transit Silence\n| Silence Period | Shipment Stage | Severity | Action |\n|---|---|---|---|\n| >12 hours | Out for Delivery | CRITICAL | Immediate carrier contact + customer notification |\n| >24 hours | In Transit (domestic) | HIGH | Carrier contact within 2h |\n| >48 hours | In Transit (international) | HIGH | Carrier contact within 4h |\n| >72 hours | In Transit (any) | CRITICAL | Lost shipment investigation initiated |\n\n### Rule Set 2: Stalled Shipment\n- Same facility scan >3 times with no movement: HIGH\n- Same facility scan >5 times with no movement: CRITICAL (facility delay or stuck)\n- Resolution: contact carrier facility manager; check for operational holds\n\n### Rule Set 3: Failed Delivery Attempts\n| Attempts | Action |\n|---|---|\n| 1st attempt failed | Customer notification; confirm delivery instructions |\n| 2nd attempt failed | HIGH alert; contact customer; arrange redelivery or hold for pickup |\n| 3rd attempt failed | CRITICAL; return-to-sender initiated; customer and business operations notified |\n\n### Rule Set 4: Exception Events\n| Exception Type | Severity | Automated Response |\n|---|---|---|\n| Damage reported | CRITICAL | Carrier claim initiated; customer notified; replacement order flagged |\n| Address correction needed | HIGH | Contact customer for correct address; carrier redirect initiated |\n| Refused delivery | HIGH | Notify business operations; arrange return processing |\n| Customs hold | HIGH | Engage customs broker; notify customer; initiate documentation review |\n| Weather/natural disaster delay | MEDIUM | Update ETA; bulk customer notification |\n| Carrier operational delay | MEDIUM | Update ETA; customer notification |\n| Lost/missing (carrier reported) | CRITICAL | Claim filing initiated; customer notified; replacement assessment |\n\n## Anomaly Severity Response Matrix\n\n| Severity | Customer Notification | Operations Alert | Carrier Contact | Escalation |\n|---|---|---|---|---|\n| CRITICAL | Within 30 min | Immediate | Within 1h | Operations Manager |\n| HIGH | Within 2h | Within 1h | Within 4h | Logistics Supervisor |\n| MEDIUM | Within 4h | Within 4h | Next business day | Standard queue |\n| LOW | Monitoring only | Next-day digest | If persists >48h | None |\n\n## Carrier SLA Claim Eligibility Tracking\n- Record each exception with: carrier, service level, committed delivery date, exception date, exception type\n- Calculate SLA breach: delivered_date > committed_date AND not excused (weather, act of God, customer-caused)\n- Flag SLA breach as carrier claim filing eligible; feed to Carrier Performance DB\n- Monthly: generate SLA breach report by carrier and service level for claims recovery`,
  },
  {
    organizationId: ORG,
    name: "Customer Notification Skill",
    description: "Orchestrates proactive delivery status notifications to recipients across multiple channels (email, SMS, push notification, customer portal, EDI 214 for B2B trading partners) based on configurable milestone triggers and customer-stated channel preferences. Delivers notifications at key shipment milestones: order shipped confirmation (with tracking link), out-for-delivery alert, successful delivery confirmation, delivery exception alert, and redelivery scheduling. Supports branded notification templates with dynamic content insertion (tracking number, carrier, estimated delivery window, carrier tracking URL). Handles notification preference management (opt-in/opt-out for SMS, time-of-day delivery windows) and delivery receipt tracking. Ensures TCPA compliance for SMS and CAN-SPAM compliance for email. Generates notification effectiveness analytics (open rates, click-through on tracking links, customer satisfaction correlation).",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Multi-Carrier Tracking Aggregation Skill", "Delivery Anomaly Detection Skill"],
    tags: ["customer-notification", "delivery-alerts", "SMS", "email", "EDI-214", "TCPA", "CAN-SPAM", "tracking-link", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "get_customer_notification_preferences", "select_notification_template", "render_notification_content", "send_email_notification", "send_sms_notification", "send_push_notification", "post_to_customer_portal", "send_edi_214", "record_notification_delivery", "update_opt_out_preferences", "generate_notification_analytics"],
    requiredMcpServers: ["email-platform-mcp", "sms-gateway-mcp", "push-notification-mcp", "customer-portal-mcp", "crm-mcp", "edi-gateway-mcp"],
    requiredDataClassifications: ["customer_data", "shipment_data", "notification_preferences", "pii_recipient_data", "communication_logs"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["notification template by milestone and channel", "TCPA SMS compliance requirements", "CAN-SPAM email requirements", "EDI 214 transportation carrier shipment status", "notification timing windows by customer preference", "opt-out handling procedures"],
    yamlFrontmatter: `name: Customer Notification Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\nchannels: [email, SMS, push_notification, customer_portal, EDI_214]\nmilestone_triggers: [shipped, in_transit_update, out_for_delivery, delivered, attempted, exception, redelivery]\ntcpa_compliant: true\ncan_spam_compliant: true\nopt_out_management: true\nopen_rate_tracking: true`,
    markdownBody: `# Customer Notification Skill\n\n## Purpose\nDelivers timely, accurate, and branded delivery status communications that reduce customer service contact volume, improve recipient satisfaction, and meet regulatory compliance requirements for electronic communications.\n\n## Notification Milestone Triggers\n\n| Milestone | Trigger Condition | Priority | Default Channels |\n|---|---|---|---|\n| Order Shipped | Carrier scans label (CREATED to first IN_TRANSIT) | HIGH | Email + SMS (if opted-in) |\n| Out for Delivery | Status transition to OUT_FOR_DELIVERY | HIGH | SMS + Email |\n| Delivered | Status transition to DELIVERED | HIGH | Email + SMS + Portal |\n| Delivery Attempted | Status transition to ATTEMPTED | HIGH | SMS + Email |\n| Delivery Exception | Anomaly detected (CRITICAL or HIGH) | CRITICAL | All preferred channels |\n| ETA Updated | ETA changes by >4 hours from prior notification | MEDIUM | Email + Portal |\n| Customs Hold | CUSTOMS_HOLD anomaly detected | HIGH | Email + Phone (B2B) |\n| Redelivery Scheduled | Customer confirms new delivery attempt | MEDIUM | Email + SMS |\n\n## Notification Template Summary\n\n### Shipped Email\nSubject: Your order is on its way! Tracking # [TRACKING_NUMBER]\nBody: Great news! Your order #[ORDER_NUMBER] has been picked up by [CARRIER_NAME] and is on its way.\n\n### Out for Delivery SMS\n[BRAND_NAME]: Good news! Your package is out for delivery today. Track it live: [SHORT_TRACKING_URL] Reply STOP to opt out.\n\n### Delivered Email\nSubject: Your order has been delivered!\nBody: Your order #[ORDER_NUMBER] was delivered [DELIVERY_DATE] at [DELIVERY_TIME]. Delivered to: [DELIVERY_LOCATION_DESCRIPTION].\n\n### Exception Alert Email\nSubject: Important update about your delivery — Action may be needed\nBody: [CARRIER_NAME] has flagged an issue: [EXCEPTION_DESCRIPTION]. We are monitoring closely.\n\n## Channel-Specific Compliance Rules\n\n### SMS (TCPA)\n- Only send to customers who have opted-in via documented consent\n- Honor opt-out immediately (STOP keyword): remove from all future SMS within 24 hours\n- Send only during allowable hours: 8 AM - 9 PM recipient local time\n- Include business name and opt-out instruction in each message\n- Retain consent records for minimum 5 years\n\n### Email (CAN-SPAM)\n- Include physical mailing address of sender\n- Provide functioning unsubscribe link; honor within 10 business days\n- Transactional delivery notifications do not require opt-in BUT must not contain promotional content\n\n### EDI 214 (B2B Trading Partners)\n- Send EDI 214 at: pickup (AF/X1), in-transit milestones, delivery (D1), exception (X3/CD)\n- Use GS/GE envelope with partner-specific ISA/IEA credentials\n- Transmit within 30 minutes of tracking event receipt\n\n## Notification Effectiveness Metrics\n- Email open rate target: >45% (industry benchmark: 35%)\n- SMS delivery rate target: >97%\n- Tracking link click-through target: >60%\n- Notification-to-WISMO-call displacement: reduce WISMO (Where Is My Order) calls by 40%`,
  },
  {
    organizationId: ORG,
    name: "POD Capture & Validation Skill",
    description: "Captures, validates, and archives electronic proof of delivery (ePOD) records from carrier APIs, mobile delivery apps, and EDI 214 delivery confirmation transactions. Validates ePOD completeness: delivery timestamp, recipient name (signed or typed), GPS coordinates (if available from carrier), photo evidence (if carrier-supported), and carrier-authenticated confirmation code. Classifies delivery type: signed delivery (highest evidentiary value), received-at-door (contactless), delivered-to-neighbor (with neighbor name), and left-at-location deliveries. For regulated shipments (pharmaceuticals, high-value electronics, alcohol): enforces signature-required validation and escalates if unattended delivery occurs. Generates the authoritative delivery confirmation event that triggers OTC-AGT-006 (Billing Agent) invoice generation. Maintains chain-of-custody documentation for claim-eligible shipments.",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "HIGH",
    dependencies: ["Multi-Carrier Tracking Aggregation Skill"],
    tags: ["POD", "proof-of-delivery", "ePOD", "delivery-confirmation", "signature-capture", "chain-of-custody", "billing-trigger", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_carrier_pod_record", "validate_pod_completeness", "classify_delivery_type", "validate_signature_required", "archive_pod_document", "generate_delivery_confirmation_event", "trigger_billing_agent", "log_chain_of_custody", "escalate_invalid_pod"],
    requiredMcpServers: ["carrier-pod-mcp", "document-archive-mcp", "order-management-mcp", "billing-system-mcp"],
    requiredDataClassifications: ["pod_data", "shipment_data", "signature_data", "recipient_data", "chain_of_custody_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["POD validation requirements by carrier", "signature-required shipment categories", "ePOD completeness criteria", "chain of custody documentation requirements for regulated products", "delivery type classification rules", "billing trigger conditions on delivery confirmation"],
    yamlFrontmatter: `name: POD Capture & Validation Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: HIGH\ncontext_mode: rag\npod_types: [signed, contactless_at_door, delivered_to_neighbor, left_at_location]\nsignature_required_categories: [pharmaceuticals, high_value_electronics, alcohol, regulated_goods]\nbilling_trigger: true\nchain_of_custody: true\narchive_retention_years: 7`,
    markdownBody: `# POD Capture & Validation Skill\n\n## Purpose\nProvides authoritative, validated proof of delivery records that serve as the contractual trigger for invoice generation (OTC-AGT-006) and legal evidence for disputes, carrier claims, and customer chargebacks. Ensures every delivery has a defensible ePOD record.\n\n## POD Validation Criteria\n\n### Minimum POD Completeness Requirements\n\n| Field | Required | Validation Rule |\n|---|---|---|\n| Delivery Timestamp | Yes | Must be carrier-authenticated; not self-reported |\n| Carrier Confirmation Code | Yes | Unique per delivery; verifiable against carrier API |\n| Delivery Location (Address) | Yes | Must match ship-to address (+/-1 address correction allowed) |\n| Delivery Type Classification | Yes | One of: signed, contactless, neighbor, left_at_location |\n| Recipient Name | Required for signed only | As captured by driver device; may be typed or signed |\n| GPS Coordinates | If carrier-supported | Within 500m of delivery address |\n| Photo Evidence | If carrier-supported | JPG/PNG attachment from driver app |\n\n### POD Completeness Score\n- Signed delivery with GPS + photo: 100 points (Tier 1 — highest evidentiary value)\n- Signed delivery with GPS: 85 points (Tier 2)\n- Signed delivery, no GPS: 70 points (Tier 3)\n- Contactless delivery with GPS + photo: 80 points (Tier 4)\n- Contactless delivery with GPS: 65 points (Tier 5)\n- Left at location, no additional evidence: 40 points (Tier 6 — lowest; dispute-vulnerable)\n\n## Delivery Type Classification\n\n| Type | Description | Evidentiary Value | Typical Carriers |\n|---|---|---|---|\n| Signed Delivery | Recipient physically signed driver device | Highest | UPS, FedEx, DHL |\n| Contactless At-Door | Left at door; driver photo and GPS | High | All carriers |\n| Delivered to Neighbor | Neighbor signed; neighbor address recorded | Medium | USPS, regional |\n| Left at Location | Left in mailbox, porch, locker | Lower | USPS, last-mile |\n| Access Point / Locker | Deposited in secure pickup locker | Medium-High | FedEx Office, UPS Access Point |\n\n## Signature-Required Shipment Enforcement\n\n### Categories Requiring Adult Signature\n- Pharmaceuticals (Rx drugs): FDA/DEA requirement; no exceptions\n- High-value electronics (>$500 declared value): company policy\n- Alcohol and age-restricted products: state law compliance\n- Medical devices (Class II/III): FDA chain of custody\n- High-value jewelry or luxury goods (>$1,000): insurance requirement\n\n### Enforcement Rules\n1. If signature_required shipment delivered as contactless or left_at_location:\n   - Flag as INVALID_POD (CRITICAL severity)\n   - Notify customer immediately\n   - Initiate carrier investigation (was driver protocol followed?)\n   - Do NOT generate billing trigger until investigation resolves\n   - If confirmed misdelivered: initiate carrier liability claim\n\n## Billing Trigger Generation\n\nUpon successful POD validation:\n1. Generate DELIVERY_CONFIRMED event with: shipment_id, order_id, delivery_timestamp, pod_tier, carrier_confirmation_code, pod_archive_url\n2. Publish event to OTC-AGT-006 (Billing and Collections Agent) via event bus\n3. Log trigger in audit trail with: operator_id (OTC-AGT-007), timestamp, pod_score\n4. Mark shipment status as BILLING_TRIGGERED in order management system\n\n## Chain of Custody Archive\n- Retain all ePOD records for 7 years (aligned with carrier claim statute of limitations)\n- Archive includes: raw carrier API response, normalized POD record, photo evidence URLs, GPS data, validation assessment\n- Make accessible to: Billing Agent (claim support), Legal (dispute litigation), Compliance (regulatory audit)`,
  },
  {
    organizationId: ORG,
    name: "Delivery Analytics Skill",
    description: "Generates comprehensive delivery performance analytics for logistics operations, carrier management, and executive reporting. Produces: carrier on-time performance dashboards by lane and service level, delivery exception rate analysis with root cause breakdown, customer-facing delivery experience scores (using NPS correlation), ETA accuracy trends, POD capture rate reporting, and cost-per-delivery analysis by carrier and zone. Supports carrier contract negotiations with objective performance data. Identifies underperforming lanes and carrier service levels for routing optimization. Generates weekly operational dashboards and monthly executive delivery scorecards. Exports data to ERP, TMS (Transportation Management Systems), and BI platforms. Calculates carrier SLA breach volumes for claim filing program management.",
    industry: "order_to_cash",
    domain: "delivery-tracking",
    version: "1.0.0",
    author: "OTC Platform Team",
    trustTier: "MEDIUM",
    dependencies: ["Multi-Carrier Tracking Aggregation Skill", "Delivery Anomaly Detection Skill", "POD Capture & Validation Skill"],
    tags: ["delivery-analytics", "carrier-performance", "OTP", "exception-analysis", "ETA-accuracy", "POD-rate", "carrier-SLA", "OTC-AGT-007"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "calculate_on_time_performance", "calculate_exception_rate", "analyze_eta_accuracy", "calculate_pod_capture_rate", "calculate_cost_per_delivery", "identify_underperforming_lanes", "generate_carrier_scorecard", "generate_executive_dashboard", "export_to_tms", "schedule_report_distribution"],
    requiredMcpServers: ["analytics-platform-mcp", "tms-mcp", "carrier-performance-mcp", "bi-platform-mcp", "reporting-mcp"],
    requiredDataClassifications: ["shipment_data", "carrier_performance_data", "financial_analytics", "tracking_event_data", "pod_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["on-time performance calculation methodology", "carrier SLA definitions by service type", "delivery exception rate benchmarks by industry", "ETA accuracy measurement methods", "cost-per-delivery components", "carrier scorecard dimensions"],
    yamlFrontmatter: `name: Delivery Analytics Skill\nversion: "1.0"\nagent_code: OTC-AGT-007\ndomain: delivery-tracking\nindustry: order_to_cash\ntrust_tier: MEDIUM\ncontext_mode: rag\nreport_types: [carrier_otp, exception_rate, eta_accuracy, pod_capture_rate, cost_per_delivery, carrier_scorecard, executive_dashboard]\nreport_frequencies: [daily, weekly, monthly, quarterly]\nexport_formats: [PDF, Excel, CSV, BI_dashboard, TMS_integration]\nclaim_support: true`,
    markdownBody: `# Delivery Analytics Skill\n\n## Purpose\nTransforms raw tracking, exception, and POD data into actionable carrier performance intelligence. Supports data-driven carrier negotiations, routing optimization, and executive visibility into delivery operations quality.\n\n## Core Analytics Reports\n\n### 1. Carrier On-Time Performance (OTP) Report\nDefinition: % of shipments delivered on or before carrier-committed delivery date\nExclusions: Customer-caused delays, weather excused events (per carrier tariff), shipper error\nBreakdown: By carrier x service level x origin-destination lane x week/month\n\nTarget thresholds:\n| Service Level | Internal OTP Target | Carrier Contract SLA |\n|---|---|---|\n| Same Day | 93% | 90% |\n| Next Day Air | 97% | 95% |\n| 2-Day Air | 96% | 94% |\n| Ground (3-5 day) | 95% | 92% |\n| Economy (5-7 day) | 91% | 88% |\n| International Express | 91% | 88% |\n\n### 2. Delivery Exception Rate Report\nFormula: (shipments_with_exceptions / total_shipments) x 100\nTarget: <3.5% overall exception rate\n\nException Breakdown:\n| Exception Category | Target Max Rate | Primary Root Causes |\n|---|---|---|\n| Address issues | 0.8% | Data quality; customer input errors |\n| Delivery attempt failures | 1.0% | Recipient not home; access issues |\n| Damage | 0.3% | Packaging; carrier handling |\n| Weather delays | Variable | Seasonal; geographic |\n| Customs holds (international) | 0.5% | Documentation; prohibited items |\n| Lost/missing | 0.05% | Carrier liability threshold |\n| Refused delivery | 0.2% | Customer order issues |\n\n### 3. ETA Accuracy Report\nFormula: % of deliveries where actual delivery timestamp falls within predicted ETA window (+/-4 hours for ground; +/-2 hours for express)\nTarget: 88% of shipments within ETA window\n\n| Metric | Target | Current Period | Trend |\n|---|---|---|---|\n| Within ETA window (+/-4h) | 88% | Calculated | MoM |\n| Within ETA window (+/-8h) | 95% | Calculated | MoM |\n| Mean ETA prediction error | <6 hours | Calculated | MoM |\n| At-risk detection rate | >85% | Calculated | MoM |\n\n### 4. POD Capture Rate Report\nFormula: (shipments_with_validated_pod / total_delivered_shipments) x 100\nTarget: 98.5%\n\nPOD Quality Distribution:\n| Tier | Target % of PODs |\n|---|---|\n| Tier 1 (signed + GPS + photo) | >30% |\n| Tier 2-3 (signed) | >50% |\n| Tier 4-5 (contactless) | <20% |\n| Tier 6 (no evidence) | <5% |\n\n### 5. Carrier Scorecard (Monthly)\nDimensions: OTP, Exception Rate, ETA Accuracy, Claim Resolution Rate, Cost per Shipment, POD Quality\nOutput: A-F grade per carrier per service level; red/yellow/green visual dashboard\nUse: Carrier QBR (Quarterly Business Review) input; routing algorithm weight adjustment\n\n## Carrier SLA Claim Program Support\n- Monthly: identify all SLA-breach-eligible shipments by carrier\n- Calculate: claim value = shipping cost x carrier refund rate (per contract)\n- Generate: claim filing report with tracking numbers, committed dates, actual dates, breach type\n- Track: claim filing status; recovery rate; carrier dispute response times`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 KB SOURCES
// ══════════════════════════════════════════════════════════════════════════════

const KB_SOURCES = [
  {
    title: "Carrier API Integration Specifications and Authentication Reference",
    tags: ["carrier-API", "UPS", "FedEx", "USPS", "DHL", "authentication", "webhook", "polling", "OTC-AGT-007"],
    metadata: { source: "Logistics Integration Team", type: "technical-reference", coverage: "all_major_carriers", lastUpdated: "2024-01-01" },
    content: `# Carrier API Integration Specifications and Authentication Reference\n\n## UPS Carrier Integration\n\n### API Credentials and Authentication\n- Auth Type: OAuth 2.0 Client Credentials\n- Token Endpoint: https://wwwcie.ups.com/security/v1/oauth/token\n- Token Expiry: 14400 seconds (4 hours); refresh 5 minutes before expiry\n- Required Scopes: tracking, webhook_registration\n\n### UPS Tracking API\n- Endpoint: GET https://onlinetools.ups.com/api/track/v1/details/{trackingNumber}\n- Rate Limit: 100 requests/minute per account\n- Bulk Support: Up to 100 tracking numbers per request (InquiryNumber array)\n- Response Fields: Activity (array), Status.Code, Status.Description, ScheduledDelivery, ActualDelivery, SignatureRequired, DeliveredTo\n\n### UPS Webhook (Quantum View Notify)\n- Registration: POST https://onlinetools.ups.com/api/notificationservice/v1/webhook\n- Events: shipment_pickup, in_transit, out_for_delivery, delivery, exception, return\n- Signature Verification: HMAC-SHA256 with shared secret; verify X-UPS-Signature header\n- Retry Policy: 3 retries with exponential backoff (1min, 5min, 30min)\n\n### UPS Status Code Mapping\n| UPS Code | Description | Canonical Status |\n|---|---|---|\n| P | Pickup | CREATED |\n| I | In Transit | IN_TRANSIT |\n| O | Out For Delivery | OUT_FOR_DELIVERY |\n| D | Delivered | DELIVERED |\n| X1 | Delivery Attempt | ATTEMPTED |\n| X3 | Exception | EXCEPTION |\n| RR | Return to Sender | RETURNED |\n| RS | Return to Sender | RETURNED |\n| MV | Moving Through Facility | IN_TRANSIT |\n| M | Shipper Created Label | CREATED |\n\n---\n\n## FedEx Carrier Integration\n\n### API Credentials and Authentication\n- Auth Type: OAuth 2.0 Client Credentials\n- Token Endpoint: https://apis.fedex.com/oauth/token\n- Required: client_id, client_secret from FedEx Developer Portal\n- Token Expiry: 3600 seconds (1 hour)\n\n### FedEx Track API\n- Endpoint: POST https://apis.fedex.com/track/v1/trackingnumbers\n- Rate Limit: 100 requests/minute\n- Batch: Up to 30 tracking numbers per request\n- Key Response Fields: scanEvents (array), latestStatusDetail, estimatedDeliveryTimeWindow, deliverySignatureName, deliveryAttempts\n\n### FedEx Status Code Mapping\n| FedEx Code | Description | Canonical Status |\n|---|---|---|\n| OC | Order Created | CREATED |\n| IT | In Transit | IN_TRANSIT |\n| AR | Arrived at Facility | IN_TRANSIT |\n| OD | On FedEx Vehicle | OUT_FOR_DELIVERY |\n| DL | Delivered | DELIVERED |\n| CA | Delivery Exception - Not Attempted | ATTEMPTED |\n| DE | Delivery Exception | EXCEPTION |\n| RS | Return to Sender | RETURNED |\n| HL | Held at Location | EXCEPTION |\n| CH | Clearance in Progress (Customs) | EXCEPTION |\n\n---\n\n## USPS Carrier Integration\n\n### API Credentials and Authentication\n- Auth Type: OAuth 2.0 (new USPS API) or User ID + Password (legacy SOAP)\n- New API Base: https://api.usps.com\n- Token Endpoint: https://api.usps.com/oauth2/v3/token\n\n### USPS Tracking API (New)\n- Endpoint: GET https://api.usps.com/tracking/v3/tracking/{trackingNumber}\n- Rate Limit: 50 requests/minute; 10,000/day\n- No bulk support in new API: sequential or parallelized individual calls\n\n### USPS Status Code Mapping\n| USPS Event | Canonical Status |\n|---|---|\n| USPS in possession of item | CREATED |\n| In Transit to Next Facility | IN_TRANSIT |\n| Arrived at USPS Facility | IN_TRANSIT |\n| Out for Delivery | OUT_FOR_DELIVERY |\n| Delivered | DELIVERED |\n| Notice Left | ATTEMPTED |\n| Alert | EXCEPTION |\n| Dead Letter | EXCEPTION |\n| Return to Sender | RETURNED |\n\n---\n\n## DHL Express Integration\n\n### API Credentials\n- Auth Type: API Key in X-API-Key header\n- Base URL: https://api-eu.dhl.com\n- Service: Shipment Tracking\n\n### DHL Track API\n- Endpoint: GET https://api-eu.dhl.com/track/shipments?trackingNumber={number}\n- Rate Limit: 150 requests/minute\n- Batch: Not supported; individual calls required\n\n### DHL Status Code Mapping\n| DHL Status Code | Description | Canonical Status |\n|---|---|---|\n| transit | In Transit | IN_TRANSIT |\n| delivered | Delivered | DELIVERED |\n| failure | Delivery Failed | ATTEMPTED |\n| unknown | Unknown | EXCEPTION |\n| exception | Exception | EXCEPTION |\n\n---\n\n## Polling Schedule Reference\n\n| Shipment Age | Polling Interval | Priority |\n|---|---|---|\n| 0-24h (label created) | Every 4 hours | LOW |\n| 1-3 days (active transit) | Every 60 minutes | MEDIUM |\n| 3+ days delayed or exception | Every 30 minutes | HIGH |\n| Out for Delivery day | Every 15 minutes | CRITICAL |\n| Post-delivery | Once per day for 72h | LOW |`,
  },
  {
    title: "Tracking Status Normalization Map and Event Processing Reference",
    tags: ["status-normalization", "event-mapping", "canonical-status", "deduplication", "event-ordering", "OTC-AGT-007"],
    metadata: { source: "Logistics Data Team", type: "data-reference", coverage: "all_carriers_all_statuses", lastUpdated: "2024-01-01" },
    content: `# Tracking Status Normalization Map and Event Processing Reference\n\n## Canonical Status Model\n\n### Status Definitions\n\n| Canonical Status | Definition | Terminal? | Billable? |\n|---|---|---|---|\n| CREATED | Label printed or shipment record created; not yet picked up by carrier | No | No |\n| IN_TRANSIT | Package moving through carrier network; scanned at facilities | No | No |\n| OUT_FOR_DELIVERY | Package loaded on delivery vehicle for today's delivery | No | No |\n| DELIVERED | Package confirmed delivered by carrier | Yes (default) | Yes |\n| ATTEMPTED | Delivery attempted; recipient not available or access denied | No | No |\n| EXCEPTION | Active exception requiring attention (damage, loss, customs, weather delay) | No | No |\n| RETURNED | Package returned to sender or origin facility | Yes | No |\n\n### Status Transition Allowed Paths\n\n  CREATED -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED (normal path)\n  CREATED -> IN_TRANSIT -> EXCEPTION -> IN_TRANSIT -> DELIVERED (delay recovery)\n  OUT_FOR_DELIVERY -> ATTEMPTED -> OUT_FOR_DELIVERY (re-attempt same day)\n  OUT_FOR_DELIVERY -> ATTEMPTED -> RETURNED (after max attempts)\n  IN_TRANSIT -> EXCEPTION -> RETURNED (undeliverable)\n  Any -> RETURNED (final terminal)\n\n### Invalid Transitions (Reject and Log)\n- DELIVERED to any other status (delivery is final; cannot un-deliver)\n- RETURNED to DELIVERED (exception; requires manual review)\n- OUT_FOR_DELIVERY to CREATED (retrograde; indicates data error)\n\n## Deduplication Logic\n\n### Event Fingerprint\nfingerprint = SHA256 of: carrier_code + tracking_number + event_timestamp.toISOString() + canonical_status + event_location_zip\n\n### Duplicate Handling\n- If fingerprint exists in event log: SKIP (do not process or re-notify)\n- If fingerprint is new but timestamp is earlier than latest event in timeline: INSERT at correct chronological position; do NOT change current_status\n- Log: late-arriving event count by carrier (data quality metric)\n\n## Carrier-Specific Normalization Notes\n\n### UPS Normalization Notes\n- UPS sometimes sends duplicate webhook events: always apply deduplication\n- UPS I-code (In Transit) includes facility arrivals and departures: collapse sequential I events at same facility into one IN_TRANSIT entry (reduce noise)\n- UPS M code (Shipper Created Label): map to CREATED only if scan timestamp < pickup timestamp\n- UPS scheduled delivery window: ScheduledDelivery.Date + Time (combine for ETA)\n\n### FedEx Normalization Notes\n- FedEx sends scanEvents in reverse chronological order: reverse array before processing\n- FedEx OD (On Vehicle) is equivalent to OUT_FOR_DELIVERY\n- FedEx HL (Held at Location) is EXCEPTION with sub-type: HELD_AT_PICKUP_LOCATION\n- FedEx CH (Clearance in Progress): EXCEPTION with sub-type: CUSTOMS_HOLD\n\n### USPS Normalization Notes\n- USPS does not provide GPS on most deliveries: do not require GPS for USPS POD validation\n- USPS "Alert" events can mean many things: parse description for sub-type (weather, address, damage)\n- USPS delivery timestamps are often end-of-day approximations: use +/-4h confidence window\n- USPS Priority Mail Cubic: treat as Priority Mail for OTP purposes\n\n### DHL Normalization Notes\n- DHL international shipments may have gaps during customs: transit silence up to 72h is normal\n- DHL uses "failure" for both access denied and not-home: parse details for sub-classification\n- DHL POD includes photo evidence by default on most delivery types: extract photo URL from response\n\n## Location Normalization\n\n### Standardized Location Format\n  city: CHICAGO (uppercase, remove punctuation)\n  stateCode: IL (2-letter ISO code for US states; ISO 3166-2 for international)\n  countryCode: US (ISO 3166-1 alpha-2)\n  postalCode: strip trailing +4 from US ZIP; leading zero pad for short postal codes\n  facilityName: CHICAGO IL DISTRIBUTION CENTER\n\n### Transformation Rules\n- City: uppercase, remove punctuation\n- State: 2-letter ISO code (US states); or ISO 3166-2 code\n- Country: ISO 3166-1 alpha-2\n- Postal code: strip trailing +4 from US ZIP; leading zero pad for short postal codes\n- If location missing: use "UNKNOWN" — do not interpolate`,
  },
  {
    title: "Customer Notification Templates by Delivery Milestone and Communication Channel",
    tags: ["notification-templates", "email-templates", "SMS-templates", "delivery-milestones", "B2B", "B2C", "TCPA", "CAN-SPAM", "OTC-AGT-007"],
    metadata: { source: "Customer Experience Team", type: "communication-templates", coverage: "all_milestones_all_channels", lastUpdated: "2024-01-01" },
    content: `# Customer Notification Templates by Delivery Milestone and Communication Channel\n\n## Template Naming Convention\nNOTIF-[MILESTONE]-[CHANNEL]-[SEGMENT]-[VERSION]\n\nExamples:\n- NOTIF-SHIPPED-EMAIL-B2C-V3\n- NOTIF-EXCEPTION-SMS-B2B-V2\n- NOTIF-DELIVERED-PUSH-B2C-V1\n\n## B2C Templates\n\n---\n\n### NOTIF-SHIPPED-EMAIL-B2C-V3\nSubject: Your order is on the way! [ORDER_NUMBER]\nFrom: [BRAND_NAME] Shipping shipping@[BRAND_DOMAIN]\n\nBody:\nHi [RECIPIENT_FIRST_NAME],\n\nGreat news! Your order #[ORDER_NUMBER] has been picked up by [CARRIER_NAME] and is on its way to you.\n\nTracking Details:\n- Carrier: [CARRIER_NAME]\n- Tracking Number: [TRACKING_NUMBER]\n- Estimated Delivery: [ETA_DATE_RANGE]\n\n[TRACK_MY_ORDER_BUTTON linking to TRACKING_URL]\n\nIf you have any questions, visit our [HELP_CENTER_URL] or reply to this email.\n\nThank you for your order!\n[BRAND_NAME] Team\n\n---\n\n### NOTIF-OUT_FOR_DELIVERY-SMS-B2C-V2\n[BRAND_NAME]: Good news! Your package is out for delivery today. Track it live: [SHORT_TRACKING_URL] Reply STOP to opt out.\n\n---\n\n### NOTIF-DELIVERED-EMAIL-B2C-V3\nSubject: Your order has been delivered!\n\nHi [RECIPIENT_FIRST_NAME],\n\nYour order #[ORDER_NUMBER] was delivered [DELIVERY_DATE] at [DELIVERY_TIME].\n\nDelivery Details:\n- Delivered to: [DELIVERY_LOCATION_DESCRIPTION]\n- Carrier: [CARRIER_NAME]\n- Tracking: [TRACKING_NUMBER]\n\nWe hope you love your order! If anything is wrong, please contact us at [SUPPORT_URL] within [RETURN_WINDOW_DAYS] days.\n\n---\n\n### NOTIF-ATTEMPTED-EMAIL-B2C-V2\nSubject: We missed you — your delivery attempt failed\n\nHi [RECIPIENT_FIRST_NAME],\n\n[CARRIER_NAME] attempted to deliver your package today but was unable to complete the delivery.\n\nWhat happened: [ATTEMPT_REASON]\nNext attempt scheduled: [NEXT_ATTEMPT_DATE]\n\nYour options:\n1. No action needed — [CARRIER_NAME] will attempt delivery again on [NEXT_ATTEMPT_DATE]\n2. Schedule a redelivery: [CARRIER_REDELIVERY_URL]\n3. Hold for pickup at: [NEAREST_PICKUP_LOCATION] — available [PICKUP_START_DATE]\n\n---\n\n### NOTIF-EXCEPTION-EMAIL-B2C-V2\nSubject: Important update about your delivery — [ORDER_NUMBER]\n\nHi [RECIPIENT_FIRST_NAME],\n\nWe wanted to give you an update on your recent order. [CARRIER_NAME] has flagged an issue with your delivery.\n\nIssue: [EXCEPTION_DESCRIPTION]\nTracking Number: [TRACKING_NUMBER]\nCurrent Status: [CURRENT_STATUS_DESCRIPTION]\n\n[EXCEPTION_ACTION_INSTRUCTIONS]\n\nWe are monitoring this closely and will update you as soon as we have more information. You can also track your shipment directly: [TRACKING_URL]\n\n---\n\n## B2B Templates\n\n### NOTIF-SHIPPED-EMAIL-B2B-V2\nSubject: Shipment Dispatched — PO [PO_NUMBER] / Order [ORDER_NUMBER]\n\nDear [CONTACT_NAME],\n\nThis is to confirm that the following order has been dispatched and is en route to your facility.\n\nShipment Details:\n| Field | Value |\n|---|---|\n| PO Number | [PO_NUMBER] |\n| Order Number | [ORDER_NUMBER] |\n| Ship Date | [SHIP_DATE] |\n| Carrier | [CARRIER_NAME] |\n| Service Level | [SERVICE_LEVEL] |\n| Tracking Number | [TRACKING_NUMBER] |\n| Estimated Delivery | [ETA_DATE] |\n| Ship-To | [SHIP_TO_ADDRESS] |\n\nTrack your shipment: [TRACKING_URL]\n\n[COMPANY_NAME] Order Management\n\n### NOTIF-EXCEPTION-EMAIL-B2B-V2\nSubject: DELIVERY EXCEPTION — PO [PO_NUMBER] — Action Required\n\nDear [CONTACT_NAME],\n\nA delivery exception has been identified for your shipment.\n\nException Details:\n| Field | Value |\n|---|---|\n| PO Number | [PO_NUMBER] |\n| Tracking Number | [TRACKING_NUMBER] |\n| Exception Type | [EXCEPTION_TYPE] |\n| Exception Date | [EXCEPTION_DATE] |\n| Current Location | [CURRENT_LOCATION] |\n| Estimated Resolution | [ESTIMATED_RESOLUTION_DATE] |\n\nAction Required: [ACTION_REQUIRED_DESCRIPTION]\n\nPlease contact your account representative if you require immediate assistance.\n\n## TCPA/CAN-SPAM Compliance Notes\n\n### SMS Compliance\n- Obtain explicit written consent before sending marketing SMS\n- Transactional shipping notifications may be sent without prior express written consent but must include opt-out instruction\n- Honor STOP keyword: remove within 24 hours; send confirmation: "[BRAND] You are unsubscribed. No further messages will be sent."\n- Send only between 8:00 AM and 9:00 PM recipient local time\n- Maximum 4 transactional SMS per shipment (shipped, OFD, delivered, exception)\n\n### Email Compliance\n- Include physical mailing address: [COMPANY_ADDRESS] in every email footer\n- Provide unsubscribe link for marketing; transactional emails must not contain promotional content\n- Honor unsubscribe within 10 business days\n- Subject line must not be deceptive; must accurately describe email content\n\n### EDI 214 Milestone Codes\n| EDI 214 Code | Meaning | When to Send |\n|---|---|---|\n| AF | Carrier Departed Pickup Location | When carrier picks up |\n| X1 | Shipment Picked Up | Confirmed pickup scan |\n| AG | Estimated Delivery | Each ETA update |\n| D1 | Shipment Delivered | DELIVERED status |\n| P1 | Pickup Date Changed | If pickup rescheduled |\n| X3 | Customer Not Available | Delivery attempt failed |\n| CD | Carrier Delay | EXCEPTION with delay cause |`,
  },
  {
    title: "International Customs and Cross-Border Documentation Requirements",
    tags: ["customs", "cross-border", "AES", "EEI", "HS-codes", "import-compliance", "customs-broker", "INCOTERMS", "OTC-AGT-007"],
    metadata: { source: "Trade Compliance Team", type: "regulatory-reference", coverage: "global_cross_border", lastUpdated: "2024-01-01" },
    content: `# International Customs and Cross-Border Documentation Requirements\n\n## US Export Documentation\n\n### Electronic Export Information (EEI) / Automated Export System (AES)\nRequired when: Single commodity value >$2,500 per Schedule B code to any country; or shipment to embargoed countries; or export license required\n\nFiling Requirement:\n- Submit EEI via AES Direct or AES ACE before export\n- Obtain Internal Transaction Number (ITN) from AES\n- Include ITN on bill of lading and air waybill\n- Deadline: 24 hours before export for ocean; 2 hours before departure for air\n\nKey Data Elements:\n- Shipper EIN (Employer Identification Number)\n- Schedule B commodity classification code\n- Commodity description\n- Quantity and unit of measure\n- Value (selling price to buyer)\n- Country of destination and ultimate country of destination\n- Export license number (if applicable) or NOEEI citation\n\n### Common NOEEI Exemptions (No EEI Required)\n| Exemption | Condition |\n|---|---|\n| 30.36 | Exports to Canada (except military/firearms) |\n| 30.37(a) | Value equal to or less than $2,500 per commodity per Schedule B |\n| 30.37(h) | Gift parcels (value equal to or less than $100) |\n| 30.37(y) | Temporary exports returning within 1 year |\n\n## Harmonized System (HS) Code Reference\n\n### Common Commercial Goods\n| Product Category | HS Code (Chapter) | Import Duty Range |\n|---|---|---|\n| Computer equipment | 8471 | 0-2% most countries |\n| Mobile phones | 8517 | 0% (ITA Agreement) |\n| Electrical machinery | 8543 | 0-6% |\n| Clothing, apparel | 6101-6217 | 10-40% (highly variable) |\n| Footwear | 6401-6406 | 3-37% |\n| Industrial machinery | 8428-8479 | 0-5% |\n| Pharmaceuticals | 3001-3006 | 0-6% |\n| Medical devices | 9018-9022 | 0-4% |\n| Food products | 0101-2403 | Highly variable (0-100%+) |\n\n### Duty Calculation Reference\nDuty Amount = (CIF Value or FOB Value + Insurance + Freight) x Duty Rate\n\n## INCOTERMS 2020 Reference\n\n| Term | Risk Transfer | Import Duty Responsibility | Commonly Used For |\n|---|---|---|---|\n| EXW | At seller's premises | Buyer | Factory pickup |\n| FCA | When delivered to carrier | Buyer | Air/multimodal |\n| FOB | When loaded on vessel | Buyer | Ocean freight |\n| CIF | Destination port | Buyer | Ocean freight |\n| DAP | Ready for unloading at destination | Buyer | Door-to-door |\n| DDP | Delivered at destination | Seller | E-commerce; full service |\n\nDDP (Delivered Duty Paid): Seller (company) is responsible for import duties and customs clearance. The tracking system must flag DDP shipments for customs hold resolution — company must provide broker with PGA (Partner Government Agency) documents.\n\n## Customs Hold Resolution Procedures\n\n### Types of Customs Holds\n1. Documentation Incomplete: Missing invoice, packing list, or certificate of origin\n   - Resolution: Submit missing docs via broker within 24h; most released within 48h\n\n2. Examination/Inspection Selected: Customs selects for physical exam\n   - Resolution: Allow 2-10 business days; do not reship; notify customer of delay\n\n3. Prohibited/Restricted Goods: Item requires import license or is prohibited\n   - Resolution: Work with trade compliance team; may require abandonment or return\n\n4. Valuation Query: Customs questions declared value\n   - Resolution: Provide invoice + purchase order within 5 business days\n\n5. Duties Unpaid (DDP shipments): Customs payment not received\n   - Resolution: Broker issues payment; coordinate with AP team within 24h\n\n### Key Customs Broker Contacts by Region\n| Region | Broker Type | Escalation SLA |\n|---|---|---|\n| US Import | Licensed CHB (Customs House Broker) | 4 hours |\n| EU Import | Customs Declarant | 4 hours |\n| UK Import | Customs Agent (post-Brexit) | 4 hours |\n| India Import | CHA (Customs House Agent) | 8 hours |\n| China Import | Licensed Freight Forwarder | 8 hours |\n\n## Country-Specific Notes\n\n### European Union\n- EORI number required for all commercial shipments\n- Import Control System (ICS2) pre-arrival declaration required for air freight\n- VAT must be collected at point of sale for B2C e-commerce (OSS scheme)\n\n### United Kingdom (post-Brexit)\n- Customs declarations required for all UK-EU shipments\n- UK EORI required for imports\n- Rules of Origin documentation required for zero-duty under UK-EU Trade Cooperation Agreement\n\n### India\n- Import License (IEC) required for commercial imports\n- BIS certification required for electronics\n- FSSAI clearance required for food products\n\n### Brazil\n- Radar/Siscomex registration required for importer\n- NF-e must accompany goods in transit domestically\n- Import License (LI) required for many categories\n- High import duty (60%+ for many consumer goods via simplified regime)`,
  },
  {
    title: "Failed Delivery Resolution Procedures and Carrier Return Authorization",
    tags: ["failed-delivery", "return-to-sender", "redelivery", "carrier-hold", "undeliverable", "return-authorization", "OTC-AGT-007"],
    metadata: { source: "Logistics Operations Team", type: "operations-procedures", coverage: "all_failure_scenarios", lastUpdated: "2024-01-01" },
    content: `# Failed Delivery Resolution Procedures and Carrier Return Authorization\n\n## Failed Delivery Scenario Matrix\n\n| Failure Reason | First Response | Secondary Resolution | SLA |\n|---|---|---|---|\n| Recipient not home | Auto-notify customer; schedule redelivery | After 2nd attempt: hold at pickup point | 48h to contact |\n| Address undeliverable | Verify address; request carrier redirect | If uncorrectable: return to sender | 24h to correct |\n| Refused by recipient | Notify business operations; initiate return | Assess if replacement or order cancel | Same business day |\n| Access code/gate required | Contact customer for access info | Reschedule with instructions | 24h |\n| Business closed | Attempt next business day | After 2 attempts: contact customer | 1 business day |\n| Signature required — not home | Leave notice; schedule specific time | After 2 attempts: carrier hold | 48h |\n| Damaged — delivery refused | Initiate carrier claim immediately | Send replacement order assessment | Same business day |\n| Held by carrier — no reason | Contact carrier exception desk | Investigate; request release or RTS | 4h |\n\n## Customer Resolution Workflow\n\n### Step 1 — Immediate Notification (within 2h of failed delivery event)\n1. Send NOTIF-ATTEMPTED-EMAIL and NOTIF-ATTEMPTED-SMS to recipient\n2. Include:\n   - What happened and why (if reason is available)\n   - Carrier's next scheduled attempt date\n   - Option to schedule specific redelivery time\n   - Option to redirect to pickup location\n   - Contact information if they need assistance\n\n### Step 2 — Customer Action Collection\nOnline Resolution Portal (preferred):\n- Customer logs in with tracking number + zip code\n- Options: (a) Confirm delivery, attempt again; (b) Schedule specific time window; (c) Hold at carrier facility for pickup; (d) Redirect to alternate address (<=150 miles, same carrier zone)\n\nVia Customer Service:\n- Agent initiates carrier redirect or redelivery via Carrier Redelivery API\n- Document all changes with order notes\n\n### Step 3 — Carrier Redelivery Scheduling\n\n| Carrier | Redelivery Method | API Available? | Max Redirect Distance |\n|---|---|---|---|\n| UPS | UPS My Choice redirect | Yes (REST API) | Same zone |\n| FedEx | Delivery Manager | Yes (REST API) | Same zone |\n| USPS | USPS Delivery Instructions | Online form only | No redirect |\n| DHL | On Demand Delivery | Yes (REST API) | 50km |\n\n## Return to Sender (RTS) Procedures\n\n### RTS Triggers\n- 3rd failed delivery attempt (standard policy)\n- Undeliverable address (USPS NIXIE, FedEx UAA code)\n- Recipient refusal\n- Carrier hold exceeds max hold period (typically 7-10 business days)\n\n### RTS Process\n1. Carrier initiates return scan; status changes to RETURNED\n2. OTC-AGT-007 detects RETURNED status transition\n3. Notify customer of return (NOTIF-RETURNED email)\n4. Notify business operations:\n   - Order ID, shipment ID, carrier, tracking number, return reason\n   - Estimated return-to-origin date\n   - Flag if customer has not contacted us (potential abandoned order)\n5. On return receipt:\n   - Warehouse confirms return receipt\n   - OMS updates order status to RETURNED\n   - If original order was invoiced: trigger credit memo request to OTC-AGT-006\n   - If not yet invoiced: cancel billing trigger\n\n## Carrier-Specific Hold Periods and Pickup Locations\n\n| Carrier | Hold Period | Pickup Locations |\n|---|---|---|\n| UPS | 7 business days at UPS Store / Access Point | 40,000+ locations |\n| FedEx | 7 business days at FedEx Office | 12,000+ locations |\n| USPS | 15 days at Post Office | All US post offices |\n| DHL | 10 business days at DHL ServicePoint | 4,000+ locations |\n\n## Reshipping and Replacement Authorization\n\n### Reship Criteria\n- Customer has not received package AND carrier cannot locate shipment AND hold period expired\n- Carrier confirms loss or damage\n- ETA exceeded by >5 business days with no update\n\n### Reship Authorization Matrix\n| Order Value | Authorization Required | SLA to Approve |\n|---|---|---|\n| <$100 | Customer Service Rep | Immediate |\n| $100-$500 | Logistics Supervisor | 4 hours |\n| $500-$2,000 | Operations Manager | Same business day |\n| >$2,000 | VP Operations | Next business day |\n\n### Carrier Claim Filing (for lost or damaged shipments)\n- File claim within carrier window: UPS 9 months, FedEx 60 days, USPS 60 days, DHL 30 days\n- Required documentation: tracking number, declared value proof, original invoice, damage photos (if damage)\n- Claim values: up to $100 USPS without insurance; up to $100 UPS without declared value; FedEx up to $100`,
  },
  {
    title: "Carrier SLA Definitions, Performance Benchmarks, and Claim Filing Procedures",
    tags: ["carrier-SLA", "on-time-performance", "SLA-breach", "carrier-claims", "performance-benchmarks", "carrier-contracts", "OTC-AGT-007"],
    metadata: { source: "Logistics Procurement and Operations Team", type: "SLA-reference", coverage: "all_carriers_all_service_levels", lastUpdated: "2024-01-01" },
    content: `# Carrier SLA Definitions, Performance Benchmarks, and Claim Filing Procedures\n\n## Service Level Definitions\n\n### Domestic US Service Levels\n\n| Service | Carrier | Committed Transit | OTP Guarantee | Refund Type |\n|---|---|---|---|---|\n| Same Day | Courier/local | Same business day | Best effort | No SLA refund |\n| Next Day Air | UPS/FedEx | By end of next business day | Yes (99%) | Full freight refund |\n| 2-Day Air | UPS/FedEx | By end of 2nd business day | Yes (98%) | Full freight refund |\n| 3-Day Select | UPS | By end of 3rd business day | Yes (95%) | Full freight refund |\n| Ground (5-day) | UPS/FedEx | 1-5 business days | No (best effort) | No SLA refund |\n| Priority Mail | USPS | 1-3 business days | No guarantee | No refund |\n| First Class | USPS | 1-5 business days | No guarantee | No refund |\n\n### International Service Levels\n\n| Service | Carrier | Committed Transit | OTP Guarantee |\n|---|---|---|---|\n| International Express | DHL Express | 1-3 business days | Yes (95% customs-cleared) |\n| International Economy | DHL eCommerce | 4-8 business days | Best effort |\n| FedEx International Priority | FedEx | 1-3 business days | Yes (95%) |\n| FedEx International Economy | FedEx | 2-5 business days | Best effort |\n| UPS Worldwide Express | UPS | 1-3 business days | Yes (95%) |\n| USPS First Class International | USPS | 7-21 business days | No guarantee |\n\n## On-Time Performance (OTP) Measurement\n\n### OTP Formula\nOTP = (shipments_delivered_on_or_before_committed_date / total_eligible_shipments) x 100\n\nEligible shipments exclude:\n- Shipments delayed due to recipient-caused issues (wrong address, not home 3+ times)\n- Shipments with carrier-excused weather delays (per carrier tariff definition)\n- Shipments with shipper errors (incorrect address, prohibited item, insufficient packaging)\n- Customs delays (for international, if documentation was correct — carrier not at fault)\n\n### Internal OTP Reporting Thresholds\n| Service Level | GREEN | YELLOW | RED |\n|---|---|---|---|\n| Express (Next Day, 2-Day) | >=96% | 90-95.9% | <90% |\n| Ground (3-5 day) | >=93% | 87-92.9% | <87% |\n| Economy/Standard | >=88% | 82-87.9% | <82% |\n| International Express | >=90% | 84-89.9% | <84% |\n\n## Carrier Claim Filing Procedures\n\n### When to File a Carrier Claim\n1. Late Delivery (Express Only): Delivered after committed delivery date; carrier has OTP money-back guarantee\n2. Damage: Package arrived visibly damaged; carrier mishandling confirmed\n3. Loss: Package not delivered AND carrier cannot locate after investigation period (UPS: 10 days, FedEx: 7 days, USPS: 15 days for domestic)\n4. Short Delivery: Part of shipment missing on delivery (confirmed by POD and recipient)\n\n### Claim Filing Deadlines\n| Carrier | Damage Claim Deadline | Loss Claim Deadline | Late Delivery Claim Deadline |\n|---|---|---|---|\n| UPS | 60 days from delivery | 9 months from ship date | 15 days from delivery |\n| FedEx | 60 days from delivery | 60 days from ship date | 15 days from delivery |\n| USPS | 60 days from ship date | 60 days from ship date | Not guaranteed (no SLA) |\n| DHL Express | 21 days from delivery | 30 days from ship date | 21 days from delivery |\n\n### Required Documentation by Claim Type\n\nLate Delivery (Express):\n- Tracking number and proof of committed delivery date\n- Proof of actual delivery date (carrier's own tracking record)\n- Shipping invoice showing freight charge paid\n- Carrier guarantee terms applicable to service level\n\nDamage Claim:\n- Tracking number and delivery date\n- Photos of damaged merchandise and packaging\n- Original invoice showing declared value\n- Repair estimate or replacement cost documentation\n- All original packaging (kept by claimant until resolved)\n\nLoss Claim:\n- Tracking number and ship date\n- Proof of mailing (carrier receipt or bill of lading)\n- Declared value and proof of value (invoice)\n- Statement confirming item was never received\n- Carrier-issued tracer investigation reference number\n\n### Claim Filing API Endpoints\n| Carrier | Claim Portal | API Available? |\n|---|---|---|\n| UPS | ups.com/claims | Yes (UPS Claims REST API) |\n| FedEx | fedex.com/claimsportal | Yes (FedEx Claims API) |\n| USPS | usps.com/help/claims | No (web form only) |\n| DHL Express | dhl.com/claims | Varies by country |\n\n### Claim Recovery Program\n- OTC-AGT-007 generates monthly SLA breach file by carrier\n- Claims team reviews and files eligible claims within deadline\n- Track: claims filed, approved, denied, pending by carrier\n- Monthly: claim recovery rate as % of breach-eligible freight spend\n- Target: recover >=85% of eligible claim value annually`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 RUNBOOKS
// ══════════════════════════════════════════════════════════════════════════════

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Carrier API Down — Fallback Polling and Manual Tracking Update Procedure",
    description: "Emergency procedure for maintaining tracking visibility when a primary carrier API becomes unavailable due to outage, authentication failure, or rate limit exhaustion. Covers fallback to alternative data sources, polling adjustment, customer communication SLA management, and recovery steps when the API is restored. Ensures business continuity for high-value and time-sensitive shipments during outages.",
    industry: "order_to_cash",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "carrier_api_unavailable", source: "integration_monitor", threshold: "consecutive_failure_3" },
      { type: "event", event: "carrier_api_auth_failure", source: "integration_monitor", threshold: "consecutive_failure_2" },
      { type: "threshold", metric: "api_error_rate_percent", operator: "gte", value: 25, source: "api_gateway_monitor" },
    ],
    steps: [
      { id: "1", type: "action", action: "identify_outage_scope", label: "Identify which carrier API is affected and scope: full outage, authentication failure, rate limit, or partial degradation. Check carrier status page and integration monitor dashboard.", order: 1 },
      { id: "2", type: "action", action: "switch_to_fallback", label: "Enable fallback polling mode for affected carrier: increase polling interval to reduce API pressure; switch to secondary API endpoint if carrier provides one.", order: 2 },
      { id: "3", type: "condition", condition: "fallback_available", label: "Is a fallback data source available (secondary endpoint, EDI file exchange)?", trueNext: "4", falseNext: "5", order: 3 },
      { id: "4", type: "action", action: "activate_fallback_source", label: "Activate secondary data source for affected carrier. Log all events received via fallback with reduced_confidence flag. Continue normal downstream processing.", order: 4 },
      { id: "5", type: "action", action: "freeze_tracking_updates", label: "If no fallback available: freeze tracking status for affected shipments at last known state. Set transit_silence_alert timer to 4h for all OUT_FOR_DELIVERY and HIGH priority shipments.", order: 5 },
      { id: "6", type: "action", action: "triage_high_priority_shipments", label: "Identify shipments requiring immediate attention: OUT_FOR_DELIVERY today, EXCEPTION status, SLA at risk. Contact carrier operations center directly by phone for status on these specific shipments.", order: 6 },
      { id: "7", type: "action", action: "notify_operations_team", label: "Alert Logistics Operations Manager: carrier name, outage type, number of affected shipments, estimated customer impact, action plan and ETA for resolution.", order: 7 },
      { id: "8", type: "action", action: "manage_customer_slas", label: "For shipments where customer notification SLA will be breached: proactively contact affected customers with explanation and revised communication timeline.", order: 8 },
      { id: "9", type: "action", action: "monitor_restoration", label: "Monitor carrier API every 5 minutes for restoration. Check carrier status page for estimated restoration time. If outage exceeds 4h: escalate to Carrier Account Manager via phone.", order: 9 },
      { id: "10", type: "action", action: "post_restoration_reconciliation", label: "Upon API restoration: execute bulk tracking refresh for all shipments affected during outage period. Process any queued events. Resolve transit silence alerts. Send any delayed customer notifications. Generate outage impact report.", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["logistics_operations_manager"], autoApproveAfterHours: 1 },
    estimatedDuration: "30 minutes to 8 hours (carrier outage dependent)",
    tags: ["carrier-API", "outage", "fallback", "tracking-continuity", "emergency", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Mass Delivery Delay Event — Bulk ETA Update and Proactive Customer Notification",
    description: "Procedure for managing large-scale delivery disruptions caused by weather events, natural disasters, labor actions, infrastructure failures, or carrier-declared service disruptions affecting a significant volume of shipments simultaneously. Covers bulk ETA recalculation, prioritized customer notification, carrier communication coordination, and executive escalation for major events.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "shipments_with_weather_exception_pct", operator: "gte", value: 5, source: "anomaly_detection" },
      { type: "threshold", metric: "carrier_delay_advisory_impact_count", operator: "gte", value: 500, source: "carrier_feed" },
      { type: "event", event: "carrier_service_advisory_received", source: "carrier_mcp", threshold: "severity_high" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_disruption_scope", label: "Determine disruption scope: carrier, affected lanes/geographies, estimated delay duration, total shipments impacted. Pull carrier service advisory details. Identify which shipments are in the affected geography.", order: 1 },
      { id: "2", type: "action", action: "segment_by_priority", label: "Segment impacted shipments: (a) SLA-critical with customer commitments; (b) Express service level; (c) Ground shipments; (d) Shipments already in EXCEPTION status. Prioritize communications in order.", order: 2 },
      { id: "3", type: "action", action: "bulk_eta_recalculation", label: "Trigger bulk ETA recalculation for all affected shipments. Apply disruption delay factor from carrier advisory. Update all ETAs in OMS and tracking system simultaneously.", order: 3 },
      { id: "4", type: "action", action: "determine_communication_strategy", label: "Determine communication approach: (a) If <1,000 shipments: individual personalized notifications; (b) If >1,000: batch email with disruption advisory + individual tracking links; (c) Update tracking portal with service advisory banner.", order: 4 },
      { id: "5", type: "action", action: "execute_customer_notifications", label: "Execute customer notifications in priority order: SLA-critical, Express, Ground. Use NOTIF-EXCEPTION template with disruption-specific messaging. Include revised ETA if available.", order: 5 },
      { id: "6", type: "action", action: "b2b_partner_notification", label: "For B2B trading partners: send EDI 214 (CD code — Carrier Delay) with updated ETA. If partner has purchase order with SLA: notify account manager to proactively manage relationship.", order: 6 },
      { id: "7", type: "action", action: "monitor_recovery", label: "Monitor carrier network recovery: check for clearing event in tracking feed. Update ETAs as actual delivery dates become clearer. Send resolution notifications when deliveries complete.", order: 7 },
      { id: "8", type: "action", action: "carrier_sla_documentation", label: "Document all shipments affected by carrier-caused delay for SLA claim filing: carrier, service level, committed delivery date, new delivery date, cause code. File claims where carrier money-back guarantee applies.", order: 8 },
      { id: "9", type: "action", action: "post_event_report", label: "Generate post-event report: total shipments affected, delay duration distribution, customer satisfaction impact, carrier claim value, notification effectiveness metrics. Distribute to Operations leadership.", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["logistics_operations_manager", "customer_experience_lead"], autoApproveAfterHours: 2 },
    estimatedDuration: "Ongoing until disruption resolves (hours to days)",
    tags: ["mass-delay", "weather-event", "bulk-ETA", "customer-notification", "carrier-SLA", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "POD Dispute — Investigation and Carrier Claim Initiation Procedure",
    description: "Procedure for handling customer claims that a package was not received despite the carrier recording a delivery event. Covers POD evidence review, carrier investigation initiation, replacement shipment authorization, and carrier liability claim filing. Balances customer experience with fraud prevention, applying configurable risk-scoring to determine appropriate resolution speed.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "customer_non_receipt_claim", source: "crm_system", threshold: "any" },
      { type: "event", event: "pod_dispute_filed", source: "customer_portal", threshold: "any" },
    ],
    steps: [
      { id: "1", type: "action", action: "retrieve_pod_evidence", label: "Retrieve full POD record: delivery timestamp, GPS coordinates, photo evidence, signature (if applicable), delivery type classification, POD completeness score. Assess POD evidentiary strength (Tier 1-6).", order: 1 },
      { id: "2", type: "action", action: "evaluate_fraud_risk", label: "Apply fraud risk score: customer order history (1st claim vs. pattern), order value, POD strength, carrier-validated GPS match, prior claims in past 90 days. Low risk (<30): prioritize customer resolution. High risk (>70): escalate to fraud review.", order: 2 },
      { id: "3", type: "condition", condition: "high_fraud_risk", label: "Is fraud risk score >70?", trueNext: "4", falseNext: "5", order: 3 },
      { id: "4", type: "action", action: "fraud_review_escalation", label: "Escalate to Fraud Prevention team: share POD evidence, customer claim, fraud risk score, and order details. Do not authorize replacement until fraud review completes. Acknowledge customer and provide 2-business-day investigation timeline.", order: 4 },
      { id: "5", type: "action", action: "initiate_carrier_investigation", label: "File carrier tracer/investigation request: provide tracking number, claimed non-receipt date, delivery address, order value. Receive investigation reference number. Timeline: UPS 10 days, FedEx 7 days, USPS 15 days.", order: 5 },
      { id: "6", type: "condition", condition: "carrier_investigation_ongoing", label: "For low-risk customers with order value <$250: proceed to proactive replacement while carrier investigation continues. For high-value orders: await carrier investigation outcome before replacement.", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "proactive_replacement", label: "For low-risk, lower-value orders: authorize replacement shipment immediately. Notify customer of replacement dispatch. If carrier later confirms delivery: pursue fraud claim.", order: 7 },
      { id: "8", type: "action", action: "await_carrier_outcome", label: "Hold resolution pending carrier investigation. Update customer every 3 business days with status. Once carrier responds: (a) Carrier confirms loss: file carrier claim + ship replacement; (b) Carrier confirms delivery: escalate to fraud review.", order: 8 },
      { id: "9", type: "action", action: "file_carrier_claim", label: "Upon carrier confirmation of loss or non-delivery: file carrier liability claim within deadline (UPS: 9 months, FedEx: 60 days, USPS: 60 days). Include: tracking number, order invoice, declared value, investigation reference number.", order: 9 },
      { id: "10", type: "action", action: "billing_adjustment", label: "Notify OTC-AGT-006 of POD dispute resolution: if original order was invoiced: request credit memo if replacement was sent (avoid double-billing); if replacement shipped: generate new delivery confirmation event upon replacement delivery.", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["logistics_supervisor"], autoApproveAfterHours: 4 },
    estimatedDuration: "2-15 business days (carrier investigation dependent)",
    tags: ["POD-dispute", "non-receipt-claim", "carrier-investigation", "fraud-prevention", "carrier-claim", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Tracking Data Gap — Status Interpolation, Carrier Contact, and Escalation Procedure",
    description: "Procedure for investigating and resolving extended periods of missing tracking data (transit silence) for shipments in active transit. Covers automated detection of silence thresholds by shipment stage, carrier contact escalation path, status interpolation logic to maintain customer ETA communication, and transition to lost shipment investigation when silence exceeds critical thresholds.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "hours_since_last_tracking_event", operator: "gte", value: 24, source: "anomaly_detection" },
      { type: "threshold", metric: "hours_since_last_tracking_event_out_for_delivery", operator: "gte", value: 8, source: "anomaly_detection" },
    ],
    steps: [
      { id: "1", type: "action", action: "confirm_silence_threshold", label: "Confirm tracking silence is genuine (not a polling/integration lag). Verify last attempted API call timestamp. If API issue: engage Carrier API Down runbook instead. If genuine silence: proceed.", order: 1 },
      { id: "2", type: "action", action: "assess_silence_context", label: "Assess context: shipment stage (domestic vs. international transit), expected transit corridor, historical silence patterns for this carrier+lane (some corridors have normal 24h gaps).", order: 2 },
      { id: "3", type: "condition", condition: "normal_silence_pattern", label: "Is this silence duration within normal expected range for this carrier and lane?", trueNext: "4", falseNext: "5", order: 3 },
      { id: "4", type: "action", action: "monitor_and_log", label: "Normal silence: continue monitoring at elevated poll frequency (every 30 minutes). Log anomaly as LOW severity. No customer action yet. Set next escalation threshold at 1.5x normal silence duration.", order: 4 },
      { id: "5", type: "action", action: "contact_carrier_exception_desk", label: "Abnormal silence: contact carrier exception desk by phone or API. Provide tracking number, last scan details, ship-to address, ship date. Request expedited trace and status update. Log reference number.", order: 5 },
      { id: "6", type: "action", action: "apply_status_interpolation", label: "While awaiting carrier response: apply status interpolation to maintain ETA estimate. Use last known location and transit velocity to estimate current likely location. Update ETA with approximate flag; do not change canonical status without carrier confirmation.", order: 6 },
      { id: "7", type: "action", action: "customer_proactive_notification", label: "If silence has breached customer notification SLA or ETA is today: send proactive communication acknowledging delay, providing updated ETA estimate, and assuring monitoring is active.", order: 7 },
      { id: "8", type: "condition", condition: "silence_exceeds_loss_threshold", label: "Has silence exceeded lost shipment threshold? (Domestic: 72h; International: 120h)", trueNext: "9", falseNext: "8b", order: 8 },
      { id: "9", type: "action", action: "initiate_lost_shipment_investigation", label: "Declare shipment as potentially lost. Initiate carrier tracer investigation. Notify Operations Manager. Engage POD Dispute Runbook if customer reports non-receipt. Begin carrier claim preparation.", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["logistics_supervisor"], autoApproveAfterHours: 2 },
    estimatedDuration: "24-120 hours (escalation path dependent)",
    tags: ["transit-silence", "tracking-gap", "lost-shipment", "status-interpolation", "carrier-trace", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "International Customs Hold — Documentation, Customs Broker Escalation, and Customer Communication",
    description: "Procedure for resolving international shipments held in customs, covering identification of hold type, document collection and submission, customs broker engagement, customer communication with revised ETA, and duty payment processing. Handles holds caused by incomplete documentation, examination selection, valuation queries, and prohibited/restricted goods determinations.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "customs_hold_exception_detected", source: "anomaly_detection", threshold: "any" },
      { type: "event", event: "carrier_exception_code_customs", source: "carrier_mcp", threshold: "any" },
    ],
    steps: [
      { id: "1", type: "action", action: "classify_customs_hold_type", label: "Retrieve customs hold exception details from carrier: hold reason code, customs office, contact details. Classify: documentation incomplete, physical examination selected, valuation query, duties unpaid, prohibited/restricted goods.", order: 1 },
      { id: "2", type: "action", action: "notify_trade_compliance", label: "Alert Trade Compliance team immediately: tracking number, destination country, hold type, estimated resolution window. Trade Compliance determines document requirements and broker action plan.", order: 2 },
      { id: "3", type: "action", action: "engage_customs_broker", label: "Contact customs broker for destination country. Provide: tracking number, AWB/bill of lading, destination customs office reference, hold type. Confirm broker has all required documents.", order: 3 },
      { id: "4", type: "action", action: "document_gap_assessment", label: "Identify missing or disputed documents: commercial invoice, packing list, certificate of origin, import license, PGA documentation. Collect from shipper and transmit to broker within 4 business hours.", order: 4 },
      { id: "5", type: "condition", condition: "hold_type_is_duties_unpaid", label: "Is hold due to duties/taxes unpaid (DDP shipments)?", trueNext: "6", falseNext: "7", order: 5 },
      { id: "6", type: "action", action: "process_duty_payment", label: "For DDP shipments: broker calculates duty amount and invoices company. AP team processes broker invoice for duty payment within 24h. Broker pays customs authority. Confirm clearance expected within 1-2 business days of payment receipt.", order: 6 },
      { id: "7", type: "action", action: "customer_communication", label: "Notify customer/recipient of customs hold using NOTIF-EXCEPTION template. State: hold reason (general terms), estimated resolution timeline, any action required from them.", order: 7 },
      { id: "8", type: "action", action: "monitor_clearance", label: "Check with broker every 4 business hours for clearance update. Once cleared: update tracking status from EXCEPTION to IN_TRANSIT. Send customer update notification with revised ETA.", order: 8 },
      { id: "9", type: "condition", condition: "goods_prohibited_or_restricted", label: "Are goods determined to be prohibited or restricted in destination country?", trueNext: "10", falseNext: "9b", order: 9 },
      { id: "10", type: "action", action: "handle_prohibited_goods", label: "For prohibited goods: do NOT attempt re-export without legal review. Alert Legal and Trade Compliance immediately. Options: voluntary abandonment to customs; re-export back to origin with proper permits; destruction by customs authority. Notify customer and assess refund eligibility.", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["trade_compliance_manager", "logistics_operations_manager"], autoApproveAfterHours: 4 },
    estimatedDuration: "1-15 business days (hold type and country dependent)",
    tags: ["customs-hold", "international-shipping", "customs-broker", "trade-compliance", "duty-payment", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Delivery Exception Surge — Triage, Prioritization by Value, and Carrier Escalation Protocol",
    description: "Surge management procedure for handling abnormally high volumes of delivery exceptions that exceed standard operations team capacity. Typically triggered by major weather events, carrier network disruptions, or peak season overloads. Covers triage methodology, prioritization by order value and customer tier, carrier executive escalation, and stakeholder communication.",
    industry: "order_to_cash",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "active_exception_count", operator: "gte", value: 500, source: "anomaly_detection" },
      { type: "threshold", metric: "exception_rate_percent", operator: "gte", value: 8, source: "delivery_analytics" },
    ],
    steps: [
      { id: "1", type: "action", action: "assess_surge_cause", label: "Identify root cause of exception surge: single carrier network disruption, geographic weather event, peak volume overload, systematic carrier processing error, or multiple concurrent issues.", order: 1 },
      { id: "2", type: "action", action: "triage_and_prioritize", label: "Triage all exceptions by priority tier: Tier 1 — order value >$5,000 or VIP/Enterprise customers; Tier 2 — Express service level exceptions (SLA at risk); Tier 3 — order value $500-$5,000; Tier 4 — order value <$500 standard ground.", order: 2 },
      { id: "3", type: "action", action: "activate_surge_staffing", label: "Request additional logistics operations staff: internal reallocation from non-critical tasks; contact logistics support vendor for temporary augmentation. Assign senior staff to Tier 1 and Tier 2 exceptions exclusively.", order: 3 },
      { id: "4", type: "action", action: "carrier_executive_escalation", label: "Escalate to carrier account manager executive level: contact Carrier Account Director (not standard support line). Provide total exception count, impacted order value, and expected resolution timeline.", order: 4 },
      { id: "5", type: "action", action: "batch_customer_communication", label: "Execute batch customer communication strategy: affected customers grouped by exception type; branded service advisory email with disruption explanation; update tracking portal with service advisory banner.", order: 5 },
      { id: "6", type: "action", action: "executive_stakeholder_notification", label: "Notify internal leadership: VP Operations, Customer Experience VP, account managers for Enterprise customers. Provide: total shipments affected, estimated financial impact, carrier escalation status, customer communication plan.", order: 6 },
      { id: "7", type: "action", action: "daily_progress_tracking", label: "Track daily exception clearance rate vs. new exception intake rate. Report to leadership daily until exception rate normalizes (<3.5%). Update carrier on resolution expectations twice daily.", order: 7 },
      { id: "8", type: "action", action: "post_surge_sla_recovery", label: "After surge: identify all Express shipments that breached carrier SLA. File bulk carrier claims within deadline. Generate total claim value recovery report. Evaluate routing diversification to reduce carrier concentration risk.", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["vp_operations", "logistics_operations_manager"], autoApproveAfterHours: 2 },
    estimatedDuration: "Ongoing surge management (days to weeks)",
    tags: ["exception-surge", "triage", "carrier-escalation", "mass-exception", "peak-season", "OTC-AGT-007"],
    metadata: { lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 GOVERNANCE POLICIES
// ══════════════════════════════════════════════════════════════════════════════

const POLICIES = [
  {
    organizationId: ORG,
    name: "Consumer Shipment Notification Policy — FTC Compliance and Delivery Communication Standards",
    description: "Governs OTC-AGT-007 obligations for consumer-facing delivery notifications under FTC mail order rule requirements, TCPA for SMS communications, and CAN-SPAM for email. Mandates proactive notification at key delivery milestones, prohibits deceptive tracking communications, and requires timely exception disclosure. Ensures recipient communication meets regulatory and brand standards.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "notif-001", type: "MUST", description: "Notify consumers of shipping confirmation with tracking number within 24 hours of carrier pickup; delay notification violates FTC Mail Order Rule requirements and customer trust standards" },
      { id: "notif-002", type: "MUST", description: "Obtain documented, explicit consumer consent before sending any SMS delivery notifications; honor STOP opt-out requests within 24 hours; do not send SMS outside 8 AM - 9 PM recipient local time (TCPA compliance)" },
      { id: "notif-003", type: "MUST", description: "Include functional unsubscribe mechanism in all marketing-adjacent email notifications; transactional delivery notifications must not contain promotional content — mixing voids transactional exemption from CAN-SPAM opt-in requirements" },
      { id: "notif-004", type: "MUST_NOT", description: "Do not send notifications with ETAs that the agent has strong evidence are incorrect — communicating a known-inaccurate ETA is considered deceptive under FTC guidelines and destroys customer trust; use investigating language instead" },
      { id: "notif-005", type: "MUST", description: "Notify recipients of delivery exceptions within 4 hours of exception detection during business hours; within 8 hours for exceptions detected overnight; ensure exception notifications include next steps and estimated resolution timeline" },
      { id: "notif-006", type: "SHOULD", description: "Limit delivery notification volume to avoid notification fatigue: maximum 4 transactional notifications per shipment (shipped, out-for-delivery, delivered/attempted, exception if applicable)" },
    ],
    enforcement: "automatic",
    violationSeverity: "high",
    tags: ["FTC", "TCPA", "CAN-SPAM", "customer-notification", "consumer-protection", "delivery-communication", "OTC-AGT-007"],
  },
  {
    organizationId: ORG,
    name: "International Trade Documentation Policy — Export Compliance and Import Customs Requirements",
    description: "Governs OTC-AGT-007 obligations when processing international shipments. Requires validation of export documentation completeness before triggering carrier pickup confirmation, ensures AES/EEI filing completion is recorded for eligible shipments, mandates customs broker engagement for holds, and prohibits processing delivery confirmations for shipments with unresolved trade compliance flags.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "trade-001", type: "MUST", description: "For international shipments subject to AES/EEI filing requirements (single commodity value >$2,500): confirm ITN (Internal Transaction Number) is recorded in shipment record before processing delivery confirmation trigger to billing agent" },
      { id: "trade-002", type: "MUST", description: "Immediately engage customs broker and Trade Compliance team upon detection of a customs hold exception — do not attempt to self-resolve customs issues without licensed broker involvement; unauthorized customs communication creates compliance risk" },
      { id: "trade-003", type: "MUST_NOT", description: "Do not generate a DELIVERED confirmation event or billing trigger for shipments with an active customs hold or trade compliance flag — invoice generation for uncleared goods creates premature revenue recognition risk under ASC 606" },
      { id: "trade-004", type: "MUST", description: "Record the INCOTERMS applicable to each international shipment; for DDP (Delivered Duty Paid) shipments: flag for duty payment processing and ensure broker payment is completed before customs clearance; coordinate with Accounts Payable within 24 hours of customs hold notification" },
      { id: "trade-005", type: "MUST_NOT", description: "Do not route shipments to or from OFAC-sanctioned countries, entities, or individuals; validate origin and destination against OFAC SDN list as part of shipment intake; flag any matches for immediate Legal and Compliance review — do not proceed" },
      { id: "trade-006", type: "SHOULD", description: "Retain all customs documentation (commercial invoice, packing list, certificate of origin, AES ITN confirmation, customs entry summary) in the shipment archive for minimum 5 years to support CBP audit readiness and import/export record requirements" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["AES", "EEI", "customs", "OFAC", "INCOTERMS", "trade-compliance", "import-export", "OTC-AGT-007"],
  },
  {
    organizationId: ORG,
    name: "Tracking Data Retention and Shipment Record Governance Policy",
    description: "Defines retention periods, access controls, and data quality standards for all tracking events, delivery confirmations, and exception records managed by OTC-AGT-007. Ensures audit trail completeness for carrier claim filing, legal proceedings, and regulatory compliance. Aligns with federal record retention requirements and carrier claim statutes of limitations.",
    type: "operational",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "retain-001", type: "MUST", description: "Retain complete tracking event logs (all raw carrier events plus normalized events) for minimum 2 years from ship date to support carrier claim filing, customer dispute resolution, and logistics analysis" },
      { id: "retain-002", type: "MUST", description: "Retain POD records (electronic proof of delivery, signatures, photos, GPS data) for minimum 7 years from delivery date; POD records are the primary evidence document for billing disputes, legal proceedings, and carrier liability claims" },
      { id: "retain-003", type: "MUST", description: "Retain carrier claim documentation (claim filings, carrier responses, settlement records) for minimum 5 years from claim resolution date for financial audit and carrier dispute purposes" },
      { id: "retain-004", type: "MUST_NOT", description: "Do not purge tracking data for shipments with open disputes, carrier claims, legal holds, or regulatory investigations; data retention freezes must be honored regardless of standard retention policy timelines" },
      { id: "retain-005", type: "MUST", description: "Maintain complete, immutable event audit trail for each tracking event: do not overwrite events even when updating current shipment status; append-only event log required for audit defensibility" },
      { id: "retain-006", type: "SHOULD", description: "Archive tracking data in standard format (JSON or Parquet) to analytics data lake for historical performance analysis, carrier benchmarking, and routing optimization; ensure PII fields are appropriately masked in analytics exports" },
    ],
    enforcement: "automatic",
    violationSeverity: "high",
    tags: ["data-retention", "tracking-records", "POD-retention", "audit-trail", "carrier-claims", "OTC-AGT-007"],
  },
  {
    organizationId: ORG,
    name: "Recipient Personal Data and Geolocation Privacy Policy — GDPR and CCPA Compliance",
    description: "Governs the collection, processing, storage, and sharing of recipient personal data (name, address, contact information) and geolocation tracking data (GPS coordinates from delivery events) in compliance with GDPR, CCPA, and applicable state privacy laws. Defines lawful basis for processing, data minimization requirements, and third-party data sharing restrictions with carrier partners.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "privacy-001", type: "MUST", description: "Process recipient personal data only for the purpose of shipment delivery, delivery tracking, and delivery confirmation notification; do not use delivery address data for marketing profiling, geographic targeting, or secondary purposes without explicit consent" },
      { id: "privacy-002", type: "MUST", description: "For EU recipients under GDPR: identify and document the lawful basis for processing (Article 6 — legitimate interests for contract fulfillment); provide privacy notice at time of order that includes tracking data processing disclosure" },
      { id: "privacy-003", type: "MUST", description: "Honor GDPR right to erasure requests for recipient data: delete name, contact details, and precise address after carrier claim statute of limitations expires (generally 1 year post-delivery); retain anonymized tracking events for analytics" },
      { id: "privacy-004", type: "MUST_NOT", description: "Do not share recipient GPS delivery location data with third parties beyond the fulfilling carrier and customs broker where required; geolocation data is sensitive — prohibit use for any purpose beyond confirming delivery accuracy" },
      { id: "privacy-005", type: "MUST", description: "For California residents under CCPA: honor Do Not Sell My Personal Information requests; delivery data shared with carriers constitutes a service provider relationship (not a sale) — maintain appropriate data processing agreements with all carrier partners" },
      { id: "privacy-006", type: "SHOULD", description: "Apply data minimization to carrier API requests: request only tracking data fields necessary for the notification and POD validation purpose; do not request or store carrier fields containing unnecessary personal data beyond what is required for delivery operations" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["GDPR", "CCPA", "privacy", "PII", "geolocation", "data-minimization", "recipient-data", "OTC-AGT-007"],
  },
  {
    organizationId: ORG,
    name: "Chain of Custody Policy for Regulated and High-Value Shipments",
    description: "Mandates enhanced proof of delivery standards and continuous custody documentation for shipments containing regulated products (pharmaceuticals, medical devices, alcohol, age-restricted goods, hazardous materials) and high-value items above defined thresholds. Defines signature requirements, photo evidence mandates, temperature monitoring check-ins (for cold chain), and escalation procedures for chain-of-custody breaks.",
    type: "regulatory",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "coc-001", type: "MUST", description: "For pharmaceutical and medical device shipments: require adult signature upon delivery; reject contactless or left-at-location POD types; flag any deviation for immediate regulatory affairs review; failure may violate DEA or FDA supply chain requirements" },
      { id: "coc-002", type: "MUST", description: "For shipments with declared value >$1,000: capture and archive photo POD from carrier upon delivery; if carrier does not support photo POD, require adult signature as compensating control; do not accept Tier 6 (left at location, no evidence) POD for high-value items" },
      { id: "coc-003", type: "MUST", description: "For cold chain shipments (temperature-sensitive products including biologics, vaccines, certain food products): validate temperature excursion data from carrier or IoT sensors if available; flag any temperature breach for quality review before generating billing trigger" },
      { id: "coc-004", type: "MUST_NOT", description: "Do not generate a billing trigger (delivery confirmation to OTC-AGT-006) for regulated shipments where chain-of-custody documentation is incomplete, invalid POD type was used, or a chain-of-custody breach was detected — invoice generation for non-compliant delivery creates regulatory and liability risk" },
      { id: "coc-005", type: "MUST", description: "For alcohol shipments: confirm carrier recorded age verification during delivery (21+ signature required in applicable states); if carrier confirms delivery without age verification: flag immediately for state alcohol control board compliance review" },
      { id: "coc-006", type: "SHOULD", description: "Maintain chain-of-custody documentation in a format suitable for regulatory submission: FDA 21 CFR Part 11 electronic records requirements apply to pharmaceutical POD records; ensure electronic signatures and audit trails meet regulatory standards" },
    ],
    enforcement: "automatic",
    violationSeverity: "critical",
    tags: ["chain-of-custody", "pharmaceuticals", "medical-devices", "cold-chain", "age-verification", "high-value", "regulatory", "OTC-AGT-007"],
  },
  {
    organizationId: ORG,
    name: "Carrier SLA Enforcement and Claims Filing Policy",
    description: "Governs OTC-AGT-007 obligations to systematically monitor carrier service level adherence, document breaches, and file claims within carrier-specified deadlines. Requires carrier performance tracking at the service level and lane level, mandates timely claim filing for eligible Express service breaches, and defines escalation procedures when carrier performance falls below contractual thresholds.",
    type: "operational",
    status: "active",
    industry: "order_to_cash",
    effectiveDate: "2024-01-01",
    reviewDate: "2025-01-01",
    rules: [
      { id: "sla-001", type: "MUST", description: "Track and record carrier committed delivery date for every Express-service-level shipment at time of carrier acceptance; committed date is the carrier-provided estimate at manifest — this is the SLA measurement baseline" },
      { id: "sla-002", type: "MUST", description: "File carrier money-back-guarantee claims for all eligible Express shipments delivered after the committed date within carrier-specified filing deadlines: UPS 15 days, FedEx 15 days, DHL 21 days from delivery; missed deadlines forfeit claim eligibility permanently" },
      { id: "sla-003", type: "MUST_NOT", description: "Do not exclude shipments from SLA breach tracking solely based on carrier weather or act of God excuse without validating the excuse applies: carriers sometimes apply weather excuses broadly; validate that a documented weather event impacted the specific delivery lane on the specific date" },
      { id: "sla-004", type: "MUST", description: "Escalate to Carrier Account Manager when carrier rolling 30-day OTP falls below contractual threshold for any service level; provide documented SLA breach data; request carrier root cause analysis and corrective action plan within 5 business days" },
      { id: "sla-005", type: "MUST", description: "Maintain auditable records of all carrier claims filed, approved, denied, and under dispute; track total claim recovery as a financial KPI; report monthly to Finance on carrier SLA claim recovery amounts for P&L attribution" },
      { id: "sla-006", type: "SHOULD", description: "Evaluate carrier routing diversification when any carrier OTP for a service level falls below 85% for 3 consecutive months; carrier under-performance creates both customer experience and SLA claim costs that may justify routing change" },
    ],
    enforcement: "automatic",
    violationSeverity: "high",
    tags: ["carrier-SLA", "claims-filing", "OTP", "money-back-guarantee", "carrier-performance", "carrier-contract", "OTC-AGT-007"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — GOLDEN DATASET + 6 TEST CASES
// ══════════════════════════════════════════════════════════════════════════════

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "OTC-AGT-007 Delivery Tracking & Confirmation Agent — Golden Evaluation Dataset",
  description: "Curated evaluation dataset for validating OTC-AGT-007 accuracy across delivery tracking and confirmation scenarios: multi-carrier tracking normalization, ETA prediction accuracy, anomaly detection early warning, customer notification timing compliance, POD capture and validation, and failed delivery resolution effectiveness.",
  industry: "order_to_cash",
  useCase: "Delivery Tracking & Confirmation",
  domain: "delivery-tracking",
  version: "1.0",
  tags: ["delivery-tracking", "carrier-tracking", "ETA-prediction", "anomaly-detection", "POD", "customer-notification", "OTC-AGT-007"],
  metadata: {
    agentCode: "OTC-AGT-007",
    category: "Logistics",
    testDesign: "representative_delivery_tracking_scenarios",
    evaluationCriteria: "tracking_accuracy + eta_accuracy + anomaly_detection_rate + notification_compliance + pod_validation + resolution_effectiveness",
  },
};

const TEST_CASES = [
  {
    name: "Multi-Carrier Tracking Normalization — Five Carriers, Cross-Status Deduplication",
    description: "Tests the ability to ingest and normalize tracking events from four different carriers simultaneously for four concurrent shipments, apply correct status mappings, deduplicate a known duplicate webhook event, and maintain correct event ordering for a late-arriving event. Validates that the canonical status model is correctly populated and that downstream notifications are triggered only once per status transition.",
    input: {
      trackingEvents: [
        { carrier: "UPS", trackingNumber: "1Z999AA10123456784", events: [
          { rawCode: "M", timestamp: "2024-03-15T08:00:00Z", location: "CHICAGO IL" },
          { rawCode: "P", timestamp: "2024-03-15T10:30:00Z", location: "CHICAGO IL" },
          { rawCode: "I", timestamp: "2024-03-15T14:00:00Z", location: "GARY IN DISTRIBUTION CENTER" },
          { rawCode: "I", timestamp: "2024-03-16T06:00:00Z", location: "COLUMBUS OH HUB" },
        ]},
        { carrier: "FedEx", trackingNumber: "274899473831", events: [
          { rawCode: "OC", timestamp: "2024-03-15T09:00:00Z", location: "MEMPHIS TN" },
          { rawCode: "IT", timestamp: "2024-03-15T18:00:00Z", location: "MEMPHIS TN SORT" },
          { rawCode: "OD", timestamp: "2024-03-16T07:30:00Z", location: "ATLANTA GA" },
        ]},
        { carrier: "USPS", trackingNumber: "9400111899223397855209", events: [
          { rawStatus: "USPS in possession of item", timestamp: "2024-03-15T11:00:00Z", location: "DALLAS TX" },
          { rawStatus: "In Transit to Next Facility", timestamp: "2024-03-15T22:00:00Z", location: "FORT WORTH TX" },
          { rawStatus: "Delivered", timestamp: "2024-03-16T14:32:00Z", location: "DALLAS TX" },
        ]},
        { carrier: "DHL Express", trackingNumber: "1234567890", events: [
          { rawStatus: "transit", timestamp: "2024-03-15T06:00:00Z", location: "FRANKFURT DE" },
          { rawStatus: "transit", timestamp: "2024-03-15T16:00:00Z", location: "CINCINNATI OH" },
          { rawStatus: "transit", timestamp: "2024-03-16T04:00:00Z", location: "NEW YORK NY" },
        ]},
      ],
      duplicateEvent: { carrier: "UPS", trackingNumber: "1Z999AA10123456784", rawCode: "I", timestamp: "2024-03-15T14:00:00Z", location: "GARY IN DISTRIBUTION CENTER" },
      lateArrivingEvent: { carrier: "FedEx", trackingNumber: "274899473831", rawCode: "AR", timestamp: "2024-03-15T15:00:00Z", location: "MEMPHIS TN SORT", note: "Arrives after OD event but timestamp is earlier — must insert at correct position" },
    },
    expectedOutput: {
      normalizedShipments: [
        { trackingNumber: "1Z999AA10123456784", currentStatus: "IN_TRANSIT", eventCount: 4, lastLocation: "COLUMBUS OH HUB" },
        { trackingNumber: "274899473831", currentStatus: "OUT_FOR_DELIVERY", eventCount: 4, lastLocation: "ATLANTA GA" },
        { trackingNumber: "9400111899223397855209", currentStatus: "DELIVERED", eventCount: 3, lastLocation: "DALLAS TX" },
        { trackingNumber: "1234567890", currentStatus: "IN_TRANSIT", eventCount: 3, lastLocation: "NEW YORK NY" },
      ],
      duplicateRejected: true,
      lateEventInsertedCorrectly: true,
      notificationsTriggered: [
        { trackingNumber: "274899473831", milestone: "OUT_FOR_DELIVERY", count: 1 },
        { trackingNumber: "9400111899223397855209", milestone: "DELIVERED", count: 1 },
      ],
    },
    tags: ["multi-carrier", "normalization", "deduplication", "event-ordering", "status-mapping"],
    metrics: { normalizationAccuracy: 1.0, deduplicationCorrectness: 1.0, eventOrderingAccuracy: 1.0, notificationTriggering: 1.0 },
  },
  {
    name: "Predictive ETA Accuracy — At-Risk Shipment Detection Before Missed Delivery",
    description: "Tests ETA prediction for a UPS Ground shipment that is at risk of missing its committed delivery date due to below-expected transit velocity combined with an active weather advisory on the delivery lane. Validates that the at-risk flag is raised at least 4 hours before the original ETA, and that the ETA is updated with appropriate confidence interval.",
    input: {
      shipment: {
        trackingNumber: "1Z999AA10123456999",
        carrier: "UPS",
        serviceLevel: "ground",
        originCity: "LOS_ANGELES",
        destinationCity: "DENVER",
        pickupDate: "2024-03-11",
        carrierCommittedDeliveryDate: "2024-03-15",
        currentDate: "2024-03-14",
        currentTime: "08:00",
        lastScanLocation: "PHOENIX AZ",
        lastScanTimestamp: "2024-03-13T22:00:00Z",
      },
      transitVelocityData: {
        distanceTraveledMiles: 370,
        hoursElapsedSincePickup: 70,
        transitVelocityMph: 5.3,
        expectedVelocityMph: 8.5,
        velocityRatio: 0.62,
      },
      carrierPerformanceData: {
        carrierLaneOTP: 0.88,
        historicalTransitDaysLAtoDE: 4.2,
      },
      weatherAdvisory: {
        type: "winter_storm_warning",
        affectedStates: ["UT", "CO"],
        impactLevel: 8,
        expectedDelay: "24-48 hours",
      },
    },
    expectedOutput: {
      atRiskFlagRaised: true,
      atRiskSeverity: "CRITICAL",
      raisedAtLeastHoursBeforeETA: 4,
      predictedETA: { startDate: "2024-03-16", endDate: "2024-03-17" },
      etaConfidenceLevel: "LOW",
      confidenceScore: 0.52,
      factorsContributing: ["low_velocity_ratio", "weather_advisory_high_impact", "carrier_lane_otp_below_target"],
      customerNotificationTriggered: true,
      notificationTiming: "within_2h_of_at_risk_detection",
    },
    tags: ["ETA-prediction", "at-risk-detection", "weather-impact", "velocity-analysis", "UPS-ground"],
    metrics: { atRiskDetectionAccuracy: 1.0, etaAccuracy: 1.0, notificationTimingCompliance: 1.0, confidenceCalibration: 0.95 },
  },
  {
    name: "Delivery Anomaly Detection — Multi-Rule Exception Classification and Escalation",
    description: "Tests anomaly detection across three concurrent shipments, each triggering a different anomaly rule: (1) transit silence threshold breach for a domestic shipment, (2) failed delivery attempts reaching threshold, (3) carrier-reported damage exception. Validates correct severity classification, appropriate automated responses, and escalation routing for each anomaly type independently.",
    input: {
      shipments: [
        {
          id: "SHP-SILENCE-001",
          trackingNumber: "TRK-A-111",
          status: "IN_TRANSIT",
          lastEventTimestamp: "2024-03-13T18:00:00Z",
          currentTimestamp: "2024-03-15T20:00:00Z",
          hoursSinceLastEvent: 50,
          carrier: "FedEx",
          serviceLevel: "ground",
        },
        {
          id: "SHP-ATTEMPT-002",
          trackingNumber: "TRK-B-222",
          status: "ATTEMPTED",
          deliveryAttempts: 3,
          lastAttemptDate: "2024-03-15",
          carrier: "UPS",
          recipientContactAttempted: false,
        },
        {
          id: "SHP-DAMAGE-003",
          trackingNumber: "TRK-C-333",
          status: "EXCEPTION",
          exceptionCode: "DAMAGE",
          carrierDamageCode: "DE",
          damageReportedDate: "2024-03-15T11:00:00Z",
          orderValue: 1250.00,
          carrier: "DHL Express",
        },
      ],
    },
    expectedOutput: {
      anomaliesDetected: [
        {
          shipmentId: "SHP-SILENCE-001",
          anomalyType: "transit_silence",
          severity: "HIGH",
          ruleTriggered: "domestic_silence_gt_48h",
          automatedResponse: "carrier_contact_within_4h",
          escalationRequired: false,
        },
        {
          shipmentId: "SHP-ATTEMPT-002",
          anomalyType: "failed_attempt_threshold",
          severity: "CRITICAL",
          ruleTriggered: "3rd_attempt_failed",
          automatedResponse: "return_to_sender_initiated",
          customerNotificationRequired: true,
          businessOperationsNotified: true,
        },
        {
          shipmentId: "SHP-DAMAGE-003",
          anomalyType: "carrier_damage_reported",
          severity: "CRITICAL",
          ruleTriggered: "carrier_exception_damage",
          automatedResponse: "carrier_claim_initiated",
          customerNotificationRequired: true,
          replacementOrderFlagged: true,
          claimValue: 1250.00,
        },
      ],
    },
    tags: ["anomaly-detection", "transit-silence", "failed-attempts", "damage", "severity-classification"],
    metrics: { detectionAccuracy: 1.0, severityClassificationAccuracy: 1.0, responseCorrectness: 1.0 },
  },
  {
    name: "Customer Notification — Multi-Channel Milestone Delivery with TCPA and Opt-Out Compliance",
    description: "Tests customer notification orchestration for a shipment progressing through three milestones (shipped, out for delivery, delivered), validating: correct template selection, channel preference adherence (email + SMS opted-in), correct rendering of dynamic fields, TCPA timing compliance (within allowable hours), and correct handling of an SMS opt-out request received between the first and second notifications.",
    input: {
      shipment: {
        trackingNumber: "TRK-NOTIF-001",
        orderNumber: "ORD-20240315-0099",
        carrier: "FedEx",
        serviceLevel: "ground",
      },
      customerPreferences: {
        email: "jane.smith@example.com",
        smsNumber: "+15125551234",
        smsOptIn: true,
        preferredNotificationHours: { start: "08:00", end: "21:00", timezone: "America/Chicago" },
      },
      milestoneEvents: [
        { milestone: "SHIPPED", timestamp: "2024-03-15T10:00:00Z" },
        { milestone: "SMS_OPT_OUT_RECEIVED", timestamp: "2024-03-15T14:00:00Z", keyword: "STOP" },
        { milestone: "OUT_FOR_DELIVERY", timestamp: "2024-03-16T07:30:00Z" },
        { milestone: "DELIVERED", timestamp: "2024-03-16T13:45:00Z" },
      ],
    },
    expectedOutput: {
      notifications: [
        { milestone: "SHIPPED", email: true, sms: true, smsContent: "includes_tracking_url_and_opt_out", timing: "within_2h_of_pickup" },
        { milestone: "SMS_OPT_OUT_PROCESSING", smsRemovedFromFutureList: true, confirmationSmsSent: true, processedWithin24h: true },
        { milestone: "OUT_FOR_DELIVERY", email: true, sms: false, reason: "opted_out_after_shipped_notification" },
        { milestone: "DELIVERED", email: true, sms: false, reason: "opted_out_after_shipped_notification" },
      ],
      tcpaCompliance: { withinAllowableHours: true, optOutHonored: true, optOutProcessingTime: "within_24h" },
      canSpamCompliance: { unsubscribeLinkPresent: true, physicalAddressPresent: true },
    },
    tags: ["customer-notification", "TCPA", "opt-out", "multi-channel", "milestone-triggers"],
    metrics: { notificationAccuracy: 1.0, tcpaCompliance: 1.0, channelAdherence: 1.0, optOutCompliance: 1.0 },
  },
  {
    name: "POD Capture and Validation — Signature-Required Pharmaceutical Delivery with Billing Trigger",
    description: "Tests the complete POD capture and validation workflow for a pharmaceutical shipment requiring adult signature. Validates: correct signature-required enforcement, POD completeness scoring (Tier 1 signed delivery with GPS), successful billing trigger generation to OTC-AGT-006, and chain-of-custody archive creation. Also tests the negative case: rejection of an attempted contactless delivery for a signature-required pharmaceutical shipment.",
    input: {
      shipments: [
        {
          id: "SHP-RX-VALID-001",
          trackingNumber: "TRK-RX-001",
          productCategory: "pharmaceuticals",
          signatureRequired: true,
          carrier: "UPS",
          orderValue: 890.00,
          podRecord: {
            deliveryTimestamp: "2024-03-15T14:32:00Z",
            carrierConfirmationCode: "UPS-POD-123456789",
            deliveryType: "signed",
            recipientName: "J. Smith",
            gpsLatitude: 30.2672,
            gpsLongitude: -97.7431,
            photoEvidenceUrl: "https://ups.com/pod/photos/TRK-RX-001.jpg",
            deliveryAddress: "123 Main St, Austin TX 78701",
            shipToAddress: "123 Main St, Austin TX 78701",
          },
        },
        {
          id: "SHP-RX-INVALID-002",
          trackingNumber: "TRK-RX-002",
          productCategory: "pharmaceuticals",
          signatureRequired: true,
          carrier: "FedEx",
          podRecord: {
            deliveryTimestamp: "2024-03-15T15:00:00Z",
            deliveryType: "contactless_at_door",
            carrierConfirmationCode: "FEDEX-POD-987654",
            recipientName: null,
          },
        },
      ],
    },
    expectedOutput: {
      shipment1: {
        podTier: 1,
        podScore: 100,
        validationPassed: true,
        billingTriggerGenerated: true,
        billingTriggerEvent: {
          type: "DELIVERY_CONFIRMED",
          shipmentId: "SHP-RX-VALID-001",
          deliveryTimestamp: "2024-03-15T14:32:00Z",
          podTier: 1,
          carrierConfirmationCode: "UPS-POD-123456789",
        },
        chainOfCustodyArchived: true,
      },
      shipment2: {
        podTier: null,
        validationPassed: false,
        rejectionReason: "INVALID_POD_TYPE: signature-required pharmaceutical shipment cannot use contactless delivery",
        billingTriggerGenerated: false,
        alertSeverity: "CRITICAL",
        escalationRequired: true,
        customerNotified: true,
      },
    },
    tags: ["POD-validation", "signature-required", "pharmaceuticals", "billing-trigger", "chain-of-custody"],
    metrics: { podValidationAccuracy: 1.0, billingTriggerCorrectness: 1.0, chainOfCustodyCompleteness: 1.0, invalidPodRejectionRate: 1.0 },
  },
  {
    name: "Failed Delivery Resolution — Three-Attempt Failure to Return-to-Sender with Billing Adjustment",
    description: "Tests the complete failed delivery resolution workflow for a B2B shipment where three delivery attempts fail due to business being closed. Validates correct escalation at each attempt, return-to-sender initiation after third failure, customer and business operations notification, and coordination with OTC-AGT-006 to cancel the billing trigger (shipment not delivered).",
    input: {
      shipment: {
        id: "SHP-FAIL-001",
        trackingNumber: "TRK-FAIL-001",
        orderNumber: "ORD-20240310-0055",
        carrier: "UPS",
        serviceLevel: "ground",
        deliveryType: "B2B",
        recipientCompany: "Acme Corp",
        shipToAddress: "500 Commerce Dr, Austin TX 78731",
        orderValue: 3200.00,
        billingTriggered: false,
      },
      deliveryAttempts: [
        { attemptNumber: 1, date: "2024-03-13", time: "10:30", reason: "BUSINESS_CLOSED", noticeLeft: true },
        { attemptNumber: 2, date: "2024-03-14", time: "14:15", reason: "BUSINESS_CLOSED", noticeLeft: true },
        { attemptNumber: 3, date: "2024-03-15", time: "11:00", reason: "BUSINESS_CLOSED", noticeLeft: true, maxAttemptsReached: true },
      ],
    },
    expectedOutput: {
      attempt1Response: {
        customerNotified: true,
        redeliveryOptionsProvided: true,
        nextAttemptScheduled: "2024-03-14",
      },
      attempt2Response: {
        customerNotified: true,
        carrierHoldOffered: true,
        pickupLocationProvided: true,
        urgencyLevel: "HIGH",
      },
      attempt3Response: {
        returnToSenderInitiated: true,
        estimatedReturnDate: "2024-03-20",
        customerNotified: true,
        notificationType: "RETURNED",
        businessOperationsNotified: true,
        notificationDetails: { orderValue: 3200.00, returnReason: "max_delivery_attempts_exceeded", reshippingAssessmentRequired: true },
      },
      billingCoordination: {
        otcAgt006Notified: true,
        billingTriggerCancelled: true,
        reason: "shipment_returned_not_delivered",
      },
    },
    tags: ["failed-delivery", "return-to-sender", "B2B-delivery", "billing-cancellation", "delivery-attempts"],
    metrics: { escalationSequenceAccuracy: 1.0, returnToSenderTiming: 1.0, billingCoordinationAccuracy: 1.0, customerNotificationCompleteness: 1.0 },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — KPIs (8)
// ══════════════════════════════════════════════════════════════════════════════

const KPIS = [
  {
    name: "On-Time Delivery Rate (OTP)",
    description: "Percentage of shipments delivered on or before the carrier-committed delivery date, excluding customer-caused delays and carrier-excused weather events",
    type: "performance",
    targetValue: 96,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(shipments_delivered_on_or_before_committed_date / total_eligible_shipments) * 100",
    tags: ["OTP", "on-time-delivery", "carrier-performance", "OTC-AGT-007"],
  },
  {
    name: "POD Capture Rate",
    description: "Percentage of delivered shipments for which a validated electronic proof of delivery record is captured and archived within the required timeframe",
    type: "accuracy",
    targetValue: 98.5,
    unit: "percentage",
    measurementFrequency: "daily",
    formula: "(shipments_with_validated_pod / total_delivered_shipments) * 100",
    tags: ["POD", "proof-of-delivery", "capture-rate", "OTC-AGT-007"],
  },
  {
    name: "Delivery Exception Rate",
    description: "Percentage of total shipments that experience at least one delivery exception (damage, loss, failed attempts, customs hold, weather delay requiring customer notification)",
    type: "quality",
    targetValue: 3.5,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(shipments_with_exceptions / total_shipments) * 100",
    tags: ["exception-rate", "delivery-quality", "carrier-performance", "OTC-AGT-007"],
  },
  {
    name: "ETA Prediction Accuracy",
    description: "Percentage of shipments where the actual delivery timestamp falls within the predicted ETA window (+/-4 hours for ground; +/-2 hours for express services)",
    type: "accuracy",
    targetValue: 88,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(shipments_delivered_within_eta_window / total_tracked_shipments) * 100",
    tags: ["ETA-accuracy", "prediction-quality", "customer-experience", "OTC-AGT-007"],
  },
  {
    name: "Customer Notification Timeliness Rate",
    description: "Percentage of delivery milestone events (shipped, out-for-delivery, delivered, exception) for which the customer notification is sent within the required SLA window",
    type: "performance",
    targetValue: 99,
    unit: "percentage",
    measurementFrequency: "daily",
    formula: "(notifications_sent_within_sla / total_notification_triggers) * 100",
    tags: ["notification-timeliness", "customer-communication", "SLA-compliance", "OTC-AGT-007"],
  },
  {
    name: "At-Risk Shipment Detection Rate",
    description: "Percentage of shipments that ultimately missed their delivery date for which the at-risk flag was raised at least 4 hours before the original committed delivery date",
    type: "accuracy",
    targetValue: 85,
    unit: "percentage",
    measurementFrequency: "weekly",
    formula: "(late_shipments_flagged_4h_before_eta / total_late_shipments) * 100",
    tags: ["at-risk-detection", "proactive-alerting", "ETA-prediction", "OTC-AGT-007"],
  },
  {
    name: "Tracking Update Freshness",
    description: "Percentage of tracking events that are reflected in the unified tracking system within 2 hours of the carrier recording the event",
    type: "efficiency",
    targetValue: 95,
    unit: "percentage",
    measurementFrequency: "daily",
    formula: "(events_reflected_within_2h / total_tracking_events) * 100",
    tags: ["tracking-freshness", "data-latency", "carrier-integration", "OTC-AGT-007"],
  },
  {
    name: "Carrier SLA Claim Recovery Rate",
    description: "Percentage of eligible carrier SLA breach claim value that is successfully recovered through the claims filing program, measured monthly against total eligible breach freight spend",
    type: "efficiency",
    targetValue: 85,
    unit: "percentage",
    measurementFrequency: "monthly",
    formula: "(claim_value_recovered / total_eligible_claim_value) * 100",
    tags: ["carrier-claims", "SLA-recovery", "freight-recovery", "OTC-AGT-007"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PROMPTS
// ══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the Delivery Tracking & Confirmation Agent (OTC-AGT-007) for an Order-to-Cash platform. Your purpose is to provide real-time, unified delivery tracking across all carrier networks, predict and proactively communicate delivery ETAs, detect and resolve shipment anomalies before they impact customers, capture and validate proof of delivery records, and generate authoritative delivery confirmation events that trigger invoice generation by the Billing Agent (OTC-AGT-006).

WORKFLOW:
1. Receive shipment data from Fulfillment Agent (OTC-AGT-005) at time of carrier handoff
2. Register shipment for continuous tracking across all assigned carrier APIs (webhook + polling fallback)
3. Ingest, normalize, and deduplicate tracking events into unified canonical status model
4. Continuously calculate and update ETA predictions using multi-factor model (carrier data, velocity, weather, lane performance)
5. Send proactive customer notifications at configured delivery milestones (shipped, OFD, delivered, exception)
6. Monitor tracking stream for anomalies: silence, exceptions, failed attempts, damage, customs holds
7. Initiate automated resolution workflows for standard anomalies; escalate complex situations to operations
8. Capture and validate ePOD records upon delivery; enforce signature requirements for regulated shipments
9. Generate DELIVERY_CONFIRMED event to trigger OTC-AGT-006 invoice generation upon validated POD
10. Track carrier SLA performance; document breaches for claims program
11. Generate delivery analytics reports: OTP, exception rates, ETA accuracy, POD capture rates

OPERATING CONSTRAINTS:
- SUPERVISED autonomy: replacement shipment authorization >$250 requires operations approval; carrier claim filing >$5,000 requires logistics manager approval
- NEVER generate a DELIVERY_CONFIRMED billing trigger without a validated POD record meeting minimum completeness requirements
- NEVER generate a billing trigger for shipments with active customs holds or trade compliance flags
- NEVER send customer notifications with ETA estimates the system has strong evidence are materially incorrect
- NEVER store or log recipient SMS/phone content beyond what is required for delivery notification and opt-out management
- ALWAYS honor SMS opt-out (STOP) within 24 hours — non-compliance is a TCPA violation
- ALWAYS escalate signature-required regulated shipment POD failures immediately to operations
- ALWAYS document carrier SLA breaches within filing deadlines for claim recovery
- ALWAYS coordinate with OTC-AGT-006 to cancel billing triggers when shipments are returned to sender

REGULATORY GUARDRAILS: TCPA (SMS notifications); CAN-SPAM (email); FTC Mail Order Rule (shipping confirmation timing); GDPR/CCPA (recipient data privacy); US Export: AES/EEI filing compliance; OFAC sanctions screening; FDA 21 CFR Part 11 (pharmaceutical POD); Carrier tariff SLA enforcement`;

const RUNTIME_TASK_PROMPT = `Analyze the delivery tracking task. For tracking ingestion: identify carrier, normalize events to canonical status model, deduplicate, update timeline. For ETA prediction: combine carrier ETA with velocity analysis, weather data, and lane performance; raise at-risk flag minimum 4 hours before ETA if confidence is LOW or CRITICAL. For anomaly detection: evaluate all active shipments against configured rules by severity tier; trigger automated responses for standard anomalies; escalate complex cases. For customer notification: select correct template by milestone and channel; validate opt-in status for SMS; render dynamic fields; send within SLA window. For POD validation: retrieve carrier POD record; score completeness; enforce signature requirements for regulated shipments; archive; generate billing trigger if valid. For failed delivery: follow escalation path by attempt number; initiate RTS after max attempts; notify OTC-AGT-006 to cancel billing trigger for returned shipments. All actions must generate audit trail entries. Flag any regulatory or policy compliance concerns immediately.`;

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  OTC-AGT-007 — Delivery Tracking & Confirmation Agent");
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
    name: "Delivery Tracking & Confirmation Agent Knowledge Base",
    description: "Comprehensive knowledge base for OTC-AGT-007 covering carrier API integration specifications and authentication reference, tracking status normalization maps, customer notification templates by milestone and channel, international customs and cross-border documentation requirements, failed delivery resolution procedures, and carrier SLA definitions and claim filing procedures. Supports accurate multi-carrier tracking, customer communication, and delivery confirmation across the Order-to-Cash scenario.",
    industry: "order_to_cash",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["delivery-tracking", "carrier-APIs", "tracking-normalization", "customer-notification", "customs", "POD", "SLA-claims", "OTC-AGT-007"],
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
  step("6", "11", "Creating agent OTC-AGT-007");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Delivery Tracking & Confirmation Agent",
    agentType: "operational",
    description: "Provides real-time, unified delivery tracking across all carrier networks, predicts and proactively communicates delivery ETAs, detects and resolves shipment anomalies, captures and validates proof of delivery records, and generates authoritative delivery confirmation events that trigger invoice generation. Connects OTC-AGT-005 (Fulfillment) to OTC-AGT-006 (Billing) in the Order-to-Cash scenario.",
    owner: "OTC Platform Team",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "development",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Logistics — Delivery Operations",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "OTC-AGT-007",
      category: "Logistics",
      scenario: "Order to Cash",
      supportedCarriers: ["UPS", "FedEx", "USPS", "DHL_Express", "DHL_eCommerce", "OnTrac", "LaserShip", "Regional_LTL"],
      canonicalStatuses: ["CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "ATTEMPTED", "EXCEPTION", "RETURNED"],
      notificationChannels: ["email", "SMS", "push_notification", "customer_portal", "EDI_214"],
      notificationMilestones: ["shipped", "out_for_delivery", "delivered", "attempted", "exception", "eta_update"],
      anomalyTypes: ["transit_silence", "stalled_shipment", "failed_attempt_threshold", "damage", "customs_hold", "carrier_loss", "route_deviation"],
      escalationTriggers: [
        "replacement_shipment_above_250",
        "carrier_claim_above_5000",
        "regulated_shipment_invalid_pod",
        "ofac_sanctions_hit",
        "customs_hold_prohibited_goods",
        "signature_required_contactless_delivery",
        "3rd_delivery_attempt_failed",
        "transit_silence_exceeds_72h_domestic",
      ],
      complianceChecks: ["TCPA_SMS", "CAN_SPAM", "FTC_mail_order_rule", "GDPR_CCPA", "AES_EEI_export", "OFAC_screening", "FDA_21_CFR_11_pharma", "carrier_SLA"],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "OTC-AGT-007",
      category: "Logistics",
      nodes: [
        { id: "shipment_intake", type: "trigger", label: "Receive Shipment Data from OTC-AGT-005" },
        { id: "carrier_registration", type: "action", label: "Register for Carrier Tracking (Webhook + Polling)" },
        { id: "tracking_aggregation", type: "skill", label: "Multi-Carrier Tracking Aggregation" },
        { id: "eta_prediction", type: "skill", label: "Predictive ETA Calculation" },
        { id: "anomaly_detection", type: "skill", label: "Delivery Anomaly Detection" },
        { id: "customer_notification", type: "skill", label: "Customer Notification" },
        { id: "pod_capture", type: "skill", label: "POD Capture & Validation" },
        { id: "pod_valid_check", type: "condition", label: "POD Valid and Compliant?" },
        { id: "billing_trigger", type: "action", label: "Generate DELIVERY_CONFIRMED to OTC-AGT-006" },
        { id: "pod_escalation", type: "action", label: "Escalate Invalid POD to Operations" },
        { id: "delivery_analytics", type: "skill", label: "Delivery Analytics & Reporting" },
        { id: "output", type: "output", label: "Delivery Confirmed + Analytics Delivered + Carrier Claims Filed" },
      ],
      edges: [
        { from: "shipment_intake", to: "carrier_registration" },
        { from: "carrier_registration", to: "tracking_aggregation" },
        { from: "tracking_aggregation", to: "eta_prediction" },
        { from: "tracking_aggregation", to: "anomaly_detection" },
        { from: "eta_prediction", to: "customer_notification" },
        { from: "anomaly_detection", to: "customer_notification" },
        { from: "tracking_aggregation", to: "pod_capture" },
        { from: "pod_capture", to: "pod_valid_check" },
        { from: "pod_valid_check", to: "billing_trigger" },
        { from: "pod_valid_check", to: "pod_escalation" },
        { from: "billing_trigger", to: "delivery_analytics" },
        { from: "customer_notification", to: "delivery_analytics" },
        { from: "delivery_analytics", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: [
        "retrieve_kb", "poll_carrier_api", "register_carrier_webhook", "normalize_tracking_event",
        "deduplicate_events", "update_shipment_timeline", "query_bulk_tracking",
        "fetch_carrier_eta", "fetch_weather_events", "lookup_carrier_lane_performance",
        "calculate_transit_velocity", "compute_eta_confidence", "flag_at_risk_shipment",
        "monitor_tracking_stream", "evaluate_anomaly_rules", "classify_anomaly_severity",
        "trigger_resolution_workflow", "escalate_to_operations", "contact_carrier_exception_desk",
        "get_customer_notification_preferences", "select_notification_template",
        "send_email_notification", "send_sms_notification", "send_push_notification",
        "post_to_customer_portal", "send_edi_214", "update_opt_out_preferences",
        "fetch_carrier_pod_record", "validate_pod_completeness", "classify_delivery_type",
        "archive_pod_document", "generate_delivery_confirmation_event", "trigger_billing_agent",
        "log_chain_of_custody", "calculate_on_time_performance", "calculate_exception_rate",
        "analyze_eta_accuracy", "generate_carrier_scorecard", "generate_executive_dashboard",
      ],
      mcpServers: [
        "ups-carrier-mcp", "fedex-carrier-mcp", "usps-carrier-mcp", "dhl-carrier-mcp",
        "regional-carrier-mcp", "carrier-pod-mcp", "carrier-performance-mcp",
        "weather-intelligence-mcp", "email-platform-mcp", "sms-gateway-mcp",
        "push-notification-mcp", "customer-portal-mcp", "crm-mcp", "edi-gateway-mcp",
        "order-management-mcp", "document-archive-mcp", "operations-alerting-mcp",
        "analytics-platform-mcp", "tms-mcp",
      ],
    },
    maxToolIterations: 15,
    complianceTags: ["TCPA", "CAN-SPAM", "FTC-Mail-Order-Rule", "GDPR", "CCPA", "AES-EEI", "OFAC", "FDA-21-CFR-11", "Carrier-SLA"],
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Delivery Tracking & Confirmation Agent → ${agentRes.id}`);

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
        carrierFiltering: true,
        milestoneFiltering: true,
        exceptionTypeFiltering: true,
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
    name: "OTC-AGT-007 Delivery Tracking & Confirmation Agent Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      onTimeDeliveryRate: 0.96,
      podCaptureRate: 0.985,
      deliveryExceptionRate: 0.035,
      etaPredictionAccuracy: 0.88,
      notificationTimelinessRate: 0.99,
      atRiskDetectionRate: 0.85,
      overallPassRate: 0.92,
    },
    scorerConfig: {
      primary: "tracking_accuracy_ground_truth",
      secondary: "notification_compliance_audit",
      rubric: "rubricScoring",
      tcpaComplianceCheck: true,
      podValidationCheck: true,
      billingTriggerAccuracyCheck: true,
      chainOfCustodyVerification: true,
    },
    coverageTags: ["multi-carrier-tracking", "eta-prediction", "anomaly-detection", "customer-notification", "pod-validation", "failed-delivery", "customs-hold", "carrier-sla"],
    environmentThresholds: {
      staging: { minPassRate: 0.90 },
      production: { minPassRate: 0.94 },
    },
    schedule: "weekly:Wednesday:07:00 UTC",
    industry: "order_to_cash",
    ontologyTags: ["Multi-Carrier Tracking", "ETA Prediction", "Anomaly Detection", "Customer Notification", "Proof of Delivery", "Delivery Analytics"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 11: OUTCOME CONTRACT + 8 KPIs ───────────────────────────────────────
  step("11", "11", "Creating outcome contract + 8 KPIs and linking all to agent");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Delivery Tracking & Confirmation Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing OTC-AGT-007. Targets on-time delivery visibility, POD capture completeness, delivery exception minimization, ETA prediction accuracy, customer notification compliance, and carrier SLA claim recovery across the Order-to-Cash delivery confirmation function.",
      version: 1,
      status: "active",
      industry: "order_to_cash",
      agentCode: "OTC-AGT-007",
      category: "Logistics",
      scenario: "Order to Cash",
      objectives: [
        "Maintain on-time delivery rate at 96%+ across all carrier and service level combinations",
        "Capture validated electronic proof of delivery for 98.5%+ of all delivered shipments",
        "Keep delivery exception rate below 3.5% of total shipment volume",
        "Achieve 88%+ ETA prediction accuracy within +/-4h window for ground services",
        "Send customer milestone notifications within SLA window for 99%+ of triggering events",
        "Detect at-risk shipments at least 4 hours before ETA breach for 85%+ of late shipments",
        "Recover 85%+ of eligible carrier SLA breach claim value through automated claims program",
      ],
      successCriteria: {
        primary: "On-time delivery rate >=96% and POD capture rate >=98.5%",
        secondary: "Exception rate <=3.5%; ETA accuracy >=88%; notification timeliness >=99%",
        guardrails: "Zero unauthorized billing triggers (no validated POD); zero TCPA violations; zero OFAC sanctions misses; zero FDA-regulated delivery confirmation without signature; zero missed carrier claim deadlines on Express SLA breaches",
      },
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        lookbackWindowDays: 90,
        minimumConfidenceThreshold: 0.80,
      },
      targetMetrics: {
        onTimeDeliveryRate: 0.96,
        podCaptureRate: 0.985,
        deliveryExceptionRate: 0.035,
        etaPredictionAccuracy: 0.88,
        notificationTimelinessRate: 0.99,
        atRiskDetectionRate: 0.85,
        trackingUpdateFreshness: 0.95,
        carrierSlaClaimRecoveryRate: 0.85,
      },
      slaConfig: {
        responseTimeMs: 3000,
        availabilityTarget: 0.999,
        shippingNotificationWithin: "2h of carrier pickup scan",
        exceptionNotificationWithin: "4h of exception detection during business hours",
        podValidationWithin: "30min of carrier delivery scan",
        billingTriggerWithin: "30min of validated POD",
        carrierContactWithin: "4h of HIGH anomaly detection",
      },
      criticalPath: ["shipment_intake", "carrier_registration", "tracking_aggregation", "eta_prediction", "anomaly_detection", "customer_notification", "pod_capture_validation", "billing_trigger_generation", "delivery_analytics"],
      roiEstimate: {
        wismoCallReduction: 320000,
        proactiveExceptionResolutionSavings: 185000,
        carrierClaimRecovery: 240000,
        podDisputeReductionSavings: 95000,
        customerSatisfactionRetentionValue: 450000,
        carrierRoutingOptimizationSavings: 175000,
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

    const preferred = ["gs1-10", "gs1-11", "gs1-12", "gs1-13", "isa-25"];
    const tags = [];
    for (const id of preferred) {
      if (byId.has(id)) {
        const c = byId.get(id);
        tags.push({ conceptId: c.id, label: c.label, category: c.category });
      }
    }

    if (tags.length < 5) {
      const used = new Set(tags.map(t => t.conceptId));
      const logisticsKeywords = ["logistic", "delivery", "transport", "shipping", "carrier", "tracking", "fulfillment", "supply", "dispatch"];
      for (const c of allConcepts) {
        if (tags.length >= 6) break;
        if (used.has(c.id)) continue;
        const labelLower = (c.label || "").toLowerCase();
        if (logisticsKeywords.some(kw => labelLower.includes(kw))) {
          tags.push({ conceptId: c.id, label: c.label, category: c.category });
          used.add(c.id);
        }
      }
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
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/otc-agt-007-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ALL 11 STEPS COMPLETE — OTC-AGT-007");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/otc-agt-007-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n  FAILED: ${err.message}`);
  process.exit(1);
});
