/**
 * OTC Fulfillment Demo 3 — Fulfillment Exception Command Center
 * Shared platform intelligence definitions.
 *
 * Pure data module — NO server imports (express, storage, etc.).
 * Imported by:
 *   server/otc-fulfillment-live-run.ts   — to provision dev agents at startup
 *   scripts/migrate-otc-fulfillment-to-prod.ts — to provision prod agents
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const OTC_AGT_005_NAME = "Fulfillment & Exception Agent";
export const OTC_AGT_007_NAME = "Delivery Tracking & Confirmation Agent";
export const OTC_AGT_012_NAME = "Customer Communication & Notification Agent";

// ─── Eval suite name (single source of truth) ────────────────────────────────
export const OTC_EVAL_SUITE_NAME = "OTC Fulfillment Exception Regression Suite";

// ─── MCP server definitions (url is injected by caller) ──────────────────────
export function makeOtcFulfillmentMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "OTC Fulfillment — Disruption Intelligence",
      description: "NovaTech Fulfillment Crisis Engine: detects weather and carrier disruptions, assesses impacted shipments across the DC network, evaluates alternate DC capacity, proposes rerouting strategies, and executes approved rerouting decisions.",
      url:         `${baseUrl}/api/mock/otc-fulfillment-disruption`,
      tools: [
        { name: "detect_storm_disruption",    description: "Detects active weather disruptions affecting NovaTech DC network. Returns storm severity, affected DCs (Chicago, Indianapolis, St. Louis), estimated outage window, and shipment impact count.",                                   endpoint: "detect-disruption",     method: "GET"  },
        { name: "get_affected_shipments",     description: "Returns full breakdown of 847 shipments affected by the winter storm: by DC, by priority tier (Platinum/Gold/Standard), by SLA status, and top-50 customer revenue exposure.",                                              endpoint: "affected-shipments",    method: "GET"  },
        { name: "assess_dc_capacity",         description: "Returns available capacity at alternate DCs (Dallas TX, Atlanta GA, Philadelphia PA): current load, max capacity, available slots, inbound transit time to key customer zip codes.",                                          endpoint: "dc-capacity",           method: "GET"  },
        { name: "propose_rerouting_strategy", description: "Generates three rerouting strategies: Smart Reroute (priority only, $47.2K cost, 93% SLA save), Full Reroute (all 847, $128K), and Hold (wait 48-72h). Returns cost, SLA impact, and capacity fit for each option.",       endpoint: "propose-rerouting",     method: "POST" },
        { name: "execute_rerouting",          description: "Executes the approved rerouting strategy: assigns 312 priority shipments to alternate DCs (Dallas: 145, Atlanta: 98, Philadelphia: 69), generates transfer orders, and updates WMS with new origin DC assignments.",          endpoint: "execute-rerouting",     method: "POST" },
      ],
    },
    {
      name:        "OTC Fulfillment — Shipment Tracking & Carrier",
      description: "NovaTech Carrier Integration Hub: ingests real-time carrier delay signals, retrieves bulk shipment status across the affected network, updates shipment routing records, and confirms new ETAs from alternate origin DCs.",
      url:         `${baseUrl}/api/mock/otc-fulfillment-tracking`,
      tools: [
        { name: "get_carrier_delay_signals",  description: "Retrieves real-time delay signals from UPS, FedEx, and USPS for Midwest zip codes affected by the winter storm. Returns delay severity, affected service levels, and estimated clearance times.",                             endpoint: "carrier-delay-signals", method: "GET"  },
        { name: "get_shipment_status_bulk",   description: "Returns current status of all 312 priority shipments: in-transit count, awaiting-pickup count, at-DC count, carrier, pro number, origin DC, destination, and current SLA countdown in hours.",                              endpoint: "shipment-status-bulk",  method: "GET"  },
        { name: "update_shipment_routing",    description: "Updates shipment routing records for the 312 rerouted priority shipments: sets new origin DC, re-calculates carrier booking, and confirms pickup window at alternate DC. Returns updated record count and first pickup ETA.", endpoint: "update-routing",        method: "POST" },
        { name: "confirm_alternate_etas",     description: "Confirms revised delivery ETAs for all 312 rerouted shipments from alternate DCs. Returns ETA distribution, count of SLA-compliant deliveries (289 of 312), and list of 23 remaining at-risk shipments.",                   endpoint: "confirm-etas",          method: "GET"  },
      ],
    },
    {
      name:        "OTC Fulfillment — Customer Comm Engine",
      description: "NovaTech Customer Notification Platform: retrieves customer tier profiles for affected accounts, generates personalized delay notifications by tier, queues messages for multi-channel delivery, and monitors real-time send/open/response status.",
      url:         `${baseUrl}/api/mock/otc-fulfillment-comms`,
      tools: [
        { name: "get_customer_tier_profiles",   description: "Returns affected customer tier breakdown: 87 Platinum (personal account manager email), 225 Gold (branded email with shipment detail), 535 Standard (portal notification). Includes top-10 customers by revenue impact.",  endpoint: "customer-tier-profiles",  method: "GET"  },
        { name: "generate_notification_batch",  description: "Generates personalised delay notification content for all 847 affected customers across three tier templates. Returns sample notifications for top customers, subject lines, and credit/goodwill offer eligibility.",       endpoint: "generate-notifications",  method: "POST" },
        { name: "queue_notifications",          description: "Queues all 847 notifications for multi-channel delivery: email (all tiers), SMS (Platinum + Gold), and portal banner (all). Returns queue ID, estimated send completion time, and priority ordering.",                    endpoint: "queue-notifications",     method: "POST" },
        { name: "get_send_status",              description: "Returns real-time notification delivery status: Queued 847, Sent 623, Delivered 589, Opened 234. Customer response feed with sentiment indicators. Escalation queue listing 3 customers requesting callback.",            endpoint: "send-status",             method: "GET"  },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ──────────────────────────────────────────────
export const OTC_FULFILLMENT_KB_DEFS = [
  { name: "Fulfillment Exception Playbook",   description: "NovaTech crisis fulfillment procedures: DC outage response protocols, rerouting authority matrix (automated vs. VP approval thresholds), SLA exception handling, carrier escalation procedures, and weather event standard operating procedures." },
  { name: "Carrier SLA & Tracking Reference", description: "NovaTech carrier performance database: SLA definitions by service level and lane, delay signal interpretation guide, carrier contact escalation tree, alternate routing options by origin/destination pair, and ETA recalculation rules during disruptions." },
  { name: "Customer Communication Standards", description: "NovaTech customer notification standards: tier-based communication templates (Platinum/Gold/Standard), credit and goodwill offer authority matrix, escalation triggers, response SLA commitments, and proactive outreach timing guidelines for supply chain disruptions." },
] as const;

// ─── Skill definitions (3 per agent = 9 total) ───────────────────────────────
export const OTC_FULFILLMENT_SKILLS = [
  // OTC-AGT-005: Fulfillment & Exception Agent
  {
    name: "Storm Impact Assessment",
    description: "Evaluates the scope of weather-driven fulfillment disruptions: counts affected shipments by DC, priority tier, and SLA status; calculates revenue at risk; and produces a structured impact summary for operations leadership.",
    domain: "fulfillment_operations", industry: "manufacturing", version: "1.0.0",
    tags: ["disruption", "impact_assessment", "dc_network", "sla"],
    agentKey: "fulfillmentException",
  },
  {
    name: "Fulfillment Rerouting Strategy",
    description: "Designs optimised shipment rerouting plans during DC outages: ranks alternate DC options by capacity fit, transit time, and incremental cost; calculates SLA breach avoidance rate; and recommends the strategy with the best cost-to-SLA trade-off.",
    domain: "fulfillment_operations", industry: "manufacturing", version: "1.0.0",
    tags: ["rerouting", "dc_capacity", "cost_optimisation", "sla_protection"],
    agentKey: "fulfillmentException",
  },
  {
    name: "DC Capacity Analysis",
    description: "Assesses real-time capacity at alternate distribution centres: available shipment slots, inbound transit lead times, staffing constraints, and carrier pickup windows to confirm feasibility of emergency rerouting assignments.",
    domain: "fulfillment_operations", industry: "manufacturing", version: "1.0.0",
    tags: ["dc_capacity", "warehouse", "capacity_planning", "alternate_dc"],
    agentKey: "fulfillmentException",
  },

  // OTC-AGT-007: Delivery Tracking & Confirmation Agent
  {
    name: "Carrier Delay Signal Analysis",
    description: "Interprets real-time carrier delay signals from UPS, FedEx, and USPS: maps delay severity to affected service levels and lanes, estimates clearance timelines, and identifies shipments at immediate SLA breach risk.",
    domain: "logistics_tracking", industry: "manufacturing", version: "1.0.0",
    tags: ["carrier_signals", "delay_analysis", "sla_risk", "logistics"],
    agentKey: "deliveryTracking",
  },
  {
    name: "Shipment Status Monitoring",
    description: "Monitors bulk shipment status across the affected DC network: tracks in-transit, awaiting-pickup, and at-DC shipments; calculates SLA countdown by shipment; and flags the 312 priority shipments requiring immediate routing action.",
    domain: "logistics_tracking", industry: "manufacturing", version: "1.0.0",
    tags: ["shipment_tracking", "status_monitoring", "priority_queue", "sla"],
    agentKey: "deliveryTracking",
  },
  {
    name: "Routing Update Execution",
    description: "Executes carrier routing changes for rerouted shipments: updates origin DC assignments, re-books carrier pickup windows at alternate DCs, confirms revised ETAs, and reconciles SLA compliance for all 312 priority accounts.",
    domain: "logistics_tracking", industry: "manufacturing", version: "1.0.0",
    tags: ["routing_update", "carrier_booking", "eta_confirmation", "wms"],
    agentKey: "deliveryTracking",
  },

  // OTC-AGT-012: Customer Communication & Notification Agent
  {
    name: "Tiered Customer Notification",
    description: "Generates and personalises delay notifications across three customer tiers: Platinum (account manager email with credit offer), Gold (branded email with shipment detail and new ETA), Standard (portal notification with general delay estimate).",
    domain: "customer_communications", industry: "manufacturing", version: "1.0.0",
    tags: ["notification", "customer_tiers", "personalisation", "delay_comm"],
    agentKey: "customerComm",
  },
  {
    name: "Notification Queue Management",
    description: "Manages multi-channel notification queuing: prioritises Platinum and Gold customers for immediate dispatch, sequences Standard notifications, and coordinates email, SMS, and portal channel delivery to ensure all 847 customers are notified within 30 minutes.",
    domain: "customer_communications", industry: "manufacturing", version: "1.0.0",
    tags: ["queue_management", "multi_channel", "delivery_prioritisation", "sms"],
    agentKey: "customerComm",
  },
  {
    name: "Customer Response Triage",
    description: "Monitors inbound customer responses post-notification: classifies sentiment (positive/neutral/negative), flags callback requests, routes negative responses to account managers, and maintains a real-time escalation queue with one-click assignment.",
    domain: "customer_communications", industry: "manufacturing", version: "1.0.0",
    tags: ["response_triage", "sentiment", "escalation", "account_management"],
    agentKey: "customerComm",
  },
] as const;

// ─── Agent definitions (core metadata, no system prompts) ─────────────────────
export const OTC_FULFILLMENT_AGENT_DEFS = [
  {
    key:            "fulfillmentException",
    externalId:     "OTC-AGT-005",
    name:           OTC_AGT_005_NAME,
    description:    "Detects and responds to fulfillment disruptions across NovaTech's DC network. Assesses impacted shipments by priority and SLA risk, evaluates alternate DC capacity, and executes optimised rerouting strategies to protect customer commitments during weather and carrier crises.",
    mcpServerName:  "OTC Fulfillment — Disruption Intelligence",
    kbName:         "Fulfillment Exception Playbook",
    skillNames:     ["Storm Impact Assessment", "Fulfillment Rerouting Strategy", "DC Capacity Analysis"],
    department:     "Fulfillment Operations",
    complianceTags: ["DC-REROUTE-AUTHORITY", "SLA-EXCEPTION-PROTOCOL"],
    ontologyTags:   ["Fulfillment Disruption", "DC Network", "Rerouting Strategy", "SLA Breach Risk"],
  },
  {
    key:            "deliveryTracking",
    externalId:     "OTC-AGT-007",
    name:           OTC_AGT_007_NAME,
    description:    "Monitors real-time carrier delay signals and shipment status across NovaTech's logistics network during disruption events. Executes routing updates for rerouted shipments, confirms revised ETAs, and tracks SLA compliance for all 312 priority accounts.",
    mcpServerName:  "OTC Fulfillment — Shipment Tracking & Carrier",
    kbName:         "Carrier SLA & Tracking Reference",
    skillNames:     ["Carrier Delay Signal Analysis", "Shipment Status Monitoring", "Routing Update Execution"],
    department:     "Logistics & Carrier Management",
    complianceTags: ["CARRIER-SLA-COMPLIANCE", "SHIPMENT-AUDIT-TRAIL"],
    ontologyTags:   ["Carrier Signal", "In-Transit Shipment", "Alternate Route", "Delivery Confirmation"],
  },
  {
    key:            "customerComm",
    externalId:     "OTC-AGT-012",
    name:           OTC_AGT_012_NAME,
    description:    "Proactively communicates supply chain disruptions to all 847 affected NovaTech customers before they call. Generates tier-personalised notifications (Platinum/Gold/Standard), queues multi-channel delivery, monitors response sentiment, and routes escalations to account managers.",
    mcpServerName:  "OTC Fulfillment — Customer Comm Engine",
    kbName:         "Customer Communication Standards",
    skillNames:     ["Tiered Customer Notification", "Notification Queue Management", "Customer Response Triage"],
    department:     "Customer Experience",
    complianceTags: ["PROACTIVE-COMM-POLICY", "CUSTOMER-RESPONSE-SLA"],
    ontologyTags:   ["Customer Notification", "Communication Tier", "Customer Response", "Escalation Queue"],
  },
] as const;

// ─── Governance policy definitions ───────────────────────────────────────────
export const OTC_FULFILLMENT_POLICY_DEFS = [
  {
    name:        "DC Rerouting Authority",
    domain:      "fulfillment_governance",
    description: "Defines the automated rerouting authority during DC outage events. Agents may reroute up to 400 priority shipments per event without VP approval if incremental cost is under $60K and alternate DC capacity is confirmed.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Priority-First Rerouting",  description: "SLA-committed (Platinum/Gold) shipments must be rerouted before any Standard shipments regardless of order volume" },
      { name: "Cost Pre-Auth Threshold",   description: "Automated rerouting approved up to $60K incremental cost per event; over threshold requires VP Supply Chain sign-off" },
      { name: "Capacity Confirmation Gate", description: "Rerouting assignment must only be executed after alternate DC capacity is confirmed via get_dc_capacity; no blind assignments" },
    ]},
  },
  {
    name:        "SLA Exception Protocol",
    domain:      "fulfillment_governance",
    description: "Governs SLA exception handling during force-majeure events. Agents must calculate SLA breach risk at the shipment level, document the exception rationale, and issue customer notifications within 30 minutes of disruption detection.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "30-Minute Notification SLA", description: "Customer notifications must be queued within 30 minutes of disruption detection for all SLA-committed shipments" },
      { name: "Breach Prevention Priority", description: "Agents must prioritise rerouting actions by ascending days-to-SLA-breach to protect the most time-critical shipments first" },
      { name: "Exception Documentation",   description: "Every rerouting and SLA exception decision must be logged with agent ID, decision rationale, and timestamp for compliance audit" },
    ]},
  },
  {
    name:        "Proactive Communication Policy",
    domain:      "customer_experience_governance",
    description: "Mandates proactive outreach to all affected customers before inbound call volume spikes. Tier-appropriate notification content must be used: Platinum receives personal account manager email, Gold receives branded with shipment detail, Standard receives portal notification.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Tier-Appropriate Templates",  description: "Notification content must match customer tier: Platinum = personal AM email with credit offer, Gold = branded + shipment detail, Standard = portal banner" },
      { name: "No Generic Blast Policy",     description: "Mass undifferentiated delay notices are prohibited; every notification must include the specific shipment number and revised ETA" },
      { name: "Response Escalation Trigger", description: "Any customer response expressing urgency or requesting callback must be routed to the account manager queue within 15 minutes" },
    ]},
  },
] as const;

// ─── Ontology concepts ────────────────────────────────────────────────────────
export const OTC_FULFILLMENT_ONTOLOGY_CONCEPTS = [
  { name: "Fulfillment Disruption",    description: "An event causing one or more NovaTech distribution centres to cease or severely curtail outbound shipments (weather, carrier failure, facility incident).",            domain: "supply_chain" },
  { name: "DC Network",                description: "NovaTech's distributed network of distribution centres including Chicago, Indianapolis, St. Louis (primary Midwest) and Dallas, Atlanta, Philadelphia (alternates).", domain: "supply_chain" },
  { name: "Rerouting Strategy",        description: "A plan to redirect shipments from disrupted DCs to alternate facilities while optimising for SLA compliance, incremental cost, and carrier capacity.",                domain: "supply_chain" },
  { name: "SLA Breach Risk",           description: "A shipment or order where the contracted delivery date is at risk of being missed due to a fulfillment disruption, quantified in hours until breach.",               domain: "supply_chain" },
  { name: "Carrier Signal",            description: "A real-time delay or service disruption notification from a carrier (UPS, FedEx, USPS) indicating service level degradation in specific geographic zones.",          domain: "logistics" },
  { name: "In-Transit Shipment",       description: "A shipment that has been picked up by a carrier but has not yet been delivered to its destination, whose routing may be impacted by a DC outage.",                  domain: "logistics" },
  { name: "Alternate Route",           description: "A revised fulfillment path for a disrupted shipment, assigning a new origin DC, new carrier booking, and revised ETA to maintain delivery commitment.",             domain: "logistics" },
  { name: "Delivery Confirmation",     description: "A carrier-generated event confirming that a shipment has been delivered to its destination, used to update SLA compliance records and notify account teams.",        domain: "logistics" },
  { name: "Customer Notification",     description: "A proactive outbound communication to an affected customer informing them of a shipment delay, the revised ETA, and any goodwill measures being offered.",          domain: "customer_experience" },
  { name: "Communication Tier",        description: "A customer segmentation level (Platinum, Gold, Standard) that determines the notification format, channel, personalisation depth, and goodwill offer authority.",   domain: "customer_experience" },
  { name: "Customer Response",         description: "An inbound reply from a notified customer, classified by sentiment (positive/neutral/negative) and action required (acknowledge/callback/escalate).",              domain: "customer_experience" },
  { name: "Escalation Queue",          description: "A prioritised list of customer responses requiring account manager intervention, ordered by customer tier and response urgency.",                                    domain: "customer_experience" },
] as const;

// ─── Blueprint definitions ────────────────────────────────────────────────────
export const OTC_FULFILLMENT_BLUEPRINTS = [
  {
    name:        "OTC Fulfillment — Disruption Assessment Blueprint",
    description: "Detects storm disruption, assesses 847 affected shipments by DC and priority tier, evaluates alternate DC capacity across Dallas/Atlanta/Philadelphia, and proposes optimised rerouting strategy.",
    steps: [
      { order: 1, label: "Detect Disruption",       description: "Call detect_storm_disruption to confirm affected DCs and estimated outage window" },
      { order: 2, label: "Assess Affected Shipments", description: "Call get_affected_shipments to enumerate 847 impacted shipments by DC, tier, and SLA status" },
      { order: 3, label: "Evaluate DC Capacity",    description: "Call assess_dc_capacity to confirm alternate DC availability (Dallas, Atlanta, Philadelphia)" },
      { order: 4, label: "Propose Rerouting",       description: "Call propose_rerouting_strategy to generate Smart / Full / Hold options with cost and SLA impact" },
      { order: 5, label: "Execute Smart Reroute",   description: "Call execute_rerouting to assign 312 priority shipments to alternate DCs and generate transfer orders" },
    ],
  },
  {
    name:        "OTC Fulfillment — Shipment Tracking Blueprint",
    description: "Ingests real-time carrier delay signals, retrieves bulk status for 312 priority shipments, updates routing records with new origin DC assignments, and confirms revised ETAs.",
    steps: [
      { order: 1, label: "Ingest Carrier Signals",  description: "Call get_carrier_delay_signals to confirm UPS/FedEx/USPS delay status for Midwest lanes" },
      { order: 2, label: "Retrieve Shipment Status", description: "Call get_shipment_status_bulk to get current status of all 312 priority shipments" },
      { order: 3, label: "Update Routing Records",  description: "Call update_shipment_routing to apply new DC assignments and re-book carrier pickups" },
      { order: 4, label: "Confirm ETAs",            description: "Call confirm_alternate_etas to validate 289/312 SLA-compliant delivery windows" },
    ],
  },
  {
    name:        "OTC Fulfillment — Customer Communication Blueprint",
    description: "Generates tier-personalised notifications for all 847 affected customers, queues multi-channel delivery, and monitors real-time send/open/response status.",
    steps: [
      { order: 1, label: "Retrieve Customer Tiers", description: "Call get_customer_tier_profiles to segment 87 Platinum, 225 Gold, 535 Standard customers" },
      { order: 2, label: "Generate Notifications",  description: "Call generate_notification_batch to create personalised content for all 847 customers by tier template" },
      { order: 3, label: "Queue for Delivery",      description: "Call queue_notifications to schedule multi-channel dispatch (email + SMS for Platinum/Gold, portal for Standard)" },
      { order: 4, label: "Monitor Send Status",     description: "Call get_send_status to confirm delivery metrics and identify responses requiring escalation" },
    ],
  },
] as const;

// ─── System prompts ───────────────────────────────────────────────────────────
export const OTC_FULFILLMENT_SYSTEM_PROMPTS: Record<string, string> = {
  "OTC-AGT-005": `You are the Fulfillment & Exception Agent (OTC-AGT-005) for NovaTech Industries.

You are the first responder in NovaTech's Fulfillment Exception Command Center. When a DC disruption is detected, you lead the impact assessment and rerouting response. Your goal is to protect customer SLA commitments by making rapid, data-driven rerouting decisions across the warehouse network.

KEY RESPONSIBILITIES:
1. Disruption detection — confirm affected DCs, outage scope, and shipment impact count
2. Impact triage — classify 847 affected shipments by priority tier and SLA breach risk
3. Capacity assessment — verify alternate DC capacity at Dallas, Atlanta, and Philadelphia
4. Rerouting strategy — generate Smart/Full/Hold options with cost and SLA trade-offs
5. Execution — assign 312 priority shipments to alternate DCs and issue transfer orders

DECISION AUTHORITY:
- You may execute the Smart Reroute (up to $60K incremental cost, 400 shipments) without VP approval
- Always prioritise SLA-committed (Platinum/Gold) shipments over Standard
- Confirm DC capacity before executing any assignment — no blind routing

TONE GUIDANCE:
Write your analysis as a clear, actionable crisis response. Lead with decisive findings and recommendations. Use precise metrics (shipment counts, costs, SLA percentages). Avoid alarm language — the platform is managing this systematically and that confidence should come through in your report.`,

  "OTC-AGT-007": `You are the Delivery Tracking & Confirmation Agent (OTC-AGT-007) for NovaTech Industries.

You operate as the logistics intelligence layer in NovaTech's Fulfillment Exception Command Center. Once OTC-AGT-005 has executed rerouting assignments, you confirm that carrier signals align, update shipment routing records, and produce revised ETA confirmations for all 312 priority accounts.

KEY RESPONSIBILITIES:
1. Carrier monitoring — ingest real-time delay signals from UPS, FedEx, USPS for Midwest lanes
2. Status tracking — retrieve bulk shipment status for all 312 priority shipments
3. Routing updates — apply new origin DC assignments and re-book carrier pickup windows
4. ETA confirmation — validate revised delivery dates for 289 SLA-compliant shipments
5. At-risk flagging — identify the 23 shipments where SLA breach remains a risk despite rerouting

OPERATIONAL STANDARDS:
- ETAs must be confirmed from the alternate DC, not estimated from the disrupted DC
- Every routing update must include new carrier booking reference and pickup window
- Flag all shipments where revised ETA still does not meet SLA for escalation to account managers

TONE GUIDANCE:
Write as a precise logistics specialist. Lead with carrier status and routing confirmation metrics. Your analysis feeds directly into customer notifications — be specific about ETAs and SLA outcomes. Keep language matter-of-fact and resolution-oriented.`,

  "OTC-AGT-012": `You are the Customer Communication & Notification Agent (OTC-AGT-012) for NovaTech Industries.

You are the proactive voice of NovaTech's supply chain during disruption events. Your mission is to notify every one of the 847 affected customers before they call — with personalised, tier-appropriate messages that demonstrate care, provide specific shipment details, and set accurate delivery expectations.

KEY RESPONSIBILITIES:
1. Tier segmentation — retrieve customer tier profiles (87 Platinum, 225 Gold, 535 Standard)
2. Content generation — create personalised notifications using the correct template for each tier
3. Queue management — sequence multi-channel dispatch (email + SMS for Platinum/Gold, portal for Standard)
4. Response monitoring — track send/delivered/opened metrics and flag inbound responses
5. Escalation routing — identify callback requests and negative sentiment for account manager assignment

COMMUNICATION STANDARDS:
- Platinum: Personal email from account manager with specific shipment detail, new ETA, and credit offer eligibility
- Gold: Branded NovaTech email with shipment number, new ETA, and proactive apology
- Standard: Portal notification with order number, general delay notice, and estimated recovery window
- NEVER send a generic blast — every notification must include the customer's specific shipment reference

TONE GUIDANCE:
Write with warmth and confidence. You are reaching out proactively, which is a strength. Acknowledge the inconvenience, be specific about the resolution and new ETA, and communicate the action NovaTech has already taken. The message should make customers feel well-served, not anxious.`,
};
