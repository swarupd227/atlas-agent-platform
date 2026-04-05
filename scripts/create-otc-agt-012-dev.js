/**
 * OTC-AGT-012 — Customer Communication & Notification Agent
 * DEVELOPMENT ENVIRONMENT PROVISIONING SCRIPT
 *
 * Creates full platform intelligence:
 *   - 6 Skills (Event-Driven Notification, Template Rendering, Channel Orchestration,
 *               Preference Management, Communication Analytics, Self-Service Portal)
 *   - 1 Knowledge Base with 6 rich text sources
 *   - Agent with systemPrompt + runtimeConfig.prompt (agent task)
 *   - KB linked to Agent
 *   - 5 Policies (CAN-SPAM/GDPR/CASL, TCPA, Data Privacy, Records Retention, Circuit Breaker)
 *   - 1 Golden Dataset with 6 test cases
 *   - 1 Eval Suite
 *
 * Everything via REST API — zero direct DB writes.
 * Saves created IDs to: scripts/otc-agt-012-dev-ids.json
 *
 * Usage:  node scripts/create-otc-agt-012-dev.js [BASE_URL]
 * Default: http://localhost:5000
 */

import { writeFileSync } from "fs";

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ORG_ID   = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-organization-id": ORG_ID },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).substring(0, 600));
    throw new Error(`API error ${res.status} on ${method} ${path}`);
  }
  return json;
}

const step    = (n, t, msg) => console.log(`\nSTEP ${n}/${t}  ${msg}…`);
const ok      = (msg)       => console.log(`  ✓  ${msg}`);

const mkSkill    = (d)    => { console.log(`  Creating skill: ${d.name}`);    return api("POST", "/api/skills", d); };
const mkKB       = (d)    => { console.log(`  Creating KB: ${d.name}`);       return api("POST", "/api/knowledge-bases", d); };
const mkSource   = (id,d) =>                                                    api("POST", `/api/knowledge-bases/${id}/sources`, d);
const mkAgent    = (d)    => { console.log(`  Creating agent: ${d.name}`);    return api("POST", "/api/agents", d); };
const linkKB     = (aid,d)=>                                                    api("POST", `/api/agents/${aid}/knowledge-bases`, d);
const mkPolicy   = (d)    => { console.log(`  Creating policy: ${d.name}`);   return api("POST", "/api/policies", d); };
const mkGDS      = (d)    => { console.log(`  Creating dataset: ${d.name}`);  return api("POST", "/api/golden-datasets", d); };
const mkTC       = (id,d) => { console.log(`    Adding test case: ${d.name}`); return api("POST", `/api/golden-datasets/${id}/test-cases`, d); };
const mkEval     = (d)    => { console.log(`  Creating eval suite: ${d.name}`);return api("POST", "/api/evals", d); };

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Skills
// ═══════════════════════════════════════════════════════════════════════════════
async function createSkills() {
  step(1, 8, "Creating OTC-AGT-012 Skills");
  const skills = [];

  // Skill 1 — Event-Driven Notification
  skills.push(await mkSkill({
    name: "Event-Driven Notification Skill",
    description: "Subscribes to O2C lifecycle events (order confirmed, shipment dispatched, delivery confirmed, invoice issued, payment received, dispute opened) and triggers the appropriate notification workflows. Evaluates event payload against customer notification rules, determines timing offsets, deduplicates rapid-fire events, and enqueues notification jobs with full context.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["notification", "event-driven", "o2c-events", "order-to-cash", "otc-agt-012", "customer-communication"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Event-Driven Notification Skill

## Purpose
Subscribe to all Order-to-Cash lifecycle events and trigger customer notification workflows with correct context, timing, and deduplication logic.

## Supported O2C Events
| Event Type | Source System | Trigger Condition |
|---|---|---|
| order.confirmed | OMS | Order status transitions to CONFIRMED |
| order.modified | OMS | Line item / quantity / price change post-confirmation |
| shipment.dispatched | WMS/TMS | Carrier label created and first scan recorded |
| shipment.out_for_delivery | TMS | Carrier event: OUT_FOR_DELIVERY |
| delivery.confirmed | TMS | Carrier event: DELIVERED or POD captured |
| delivery.exception | TMS | Carrier event: FAILED_ATTEMPT, REFUSED, DAMAGED |
| invoice.issued | ERP/Billing | Invoice document generated and emailed |
| invoice.overdue | ERP/AR | Invoice past due date with outstanding balance |
| payment.received | ERP/AR | Payment applied to invoice |
| dispute.opened | CRM | Dispute case created against an order |
| dispute.resolved | CRM | Dispute case closed with resolution |

## Processing Logic
1. Consume event from event bus (Kafka topic: \`o2c.lifecycle.events\`)
2. Extract customer_id, order_id, and event metadata
3. Look up customer notification preferences (channel, language, quiet hours)
4. Evaluate notification eligibility rules:
   - Customer opted-in for this event type?
   - Not within quiet hours window?
   - Dedup check: same event not sent within dedup_window_minutes?
   - Frequency cap not exceeded for this customer today?
5. If eligible: select template, enqueue notification job with TTL
6. If ineligible: log reason, skip, emit \`notification.skipped\` audit event

## Deduplication
- Window: configurable per event type (default 60 minutes)
- Key: SHA-256(customer_id + event_type + order_id)
- Storage: Redis with TTL equal to dedup_window

## Output Schema
\`\`\`json
{
  "notificationJobId": "uuid",
  "customerId": "string",
  "orderId": "string",
  "eventType": "string",
  "templateId": "string",
  "channelSelected": "email | sms | push | portal | edi",
  "scheduledAt": "ISO8601",
  "skipReason": "null | opted_out | quiet_hours | dedup | frequency_cap"
}
\`\`\`

## Compliance Notes
- GDPR Art.6(1)(b): Transactional notifications are processed under contract performance basis
- CAN-SPAM / CASL: Transactional messages exempt from commercial opt-out requirements but must identify sender
- TCPA: SMS notifications require prior express written consent; check consent flag before any SMS dispatch`,
    allowedTools: [
      "events.subscribe_topic",
      "events.publish",
      "cache.get",
      "cache.set_with_ttl",
      "notifications.enqueue_job",
      "preferences.get_customer",
      "audit.log_event"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Event-Driven Notification Skill");

  // Skill 2 — Template Rendering
  skills.push(await mkSkill({
    name: "Template Rendering Skill",
    description: "Renders customer-facing notification messages from structured templates by injecting dynamic order context, customer personalisation data, and brand elements. Handles multi-language templates, HTML email rendering, plain-text fallback, SMS character truncation, and push notification payload formatting. Validates rendered output against brand guidelines and compliance rules before dispatch.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["template", "rendering", "personalisation", "email", "sms", "o2c", "otc-agt-012"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Template Rendering Skill

## Purpose
Transform template definitions and runtime context data into fully-rendered, channel-ready notification messages that comply with brand guidelines, legal requirements, and channel constraints.

## Template Resolution Order
1. Resolve template by: event_type + channel + customer_language + customer_segment
2. Fallback chain: language-specific → default language → plain-text fallback
3. Load template from Communication Templates Library KB

## Variable Injection
| Variable Token | Data Source | Example |
|---|---|---|
| {{customer.firstName}} | CRM/ERP | "Sarah" |
| {{order.orderNumber}} | OMS | "ORD-2024-00847" |
| {{order.totalAmount}} | OMS | "$1,247.50" |
| {{shipment.carrier}} | TMS | "FedEx" |
| {{shipment.trackingNumber}} | TMS | "7489238745894" |
| {{shipment.trackingUrl}} | TMS | "https://fedex.com/track?..." |
| {{invoice.invoiceNumber}} | ERP | "INV-2024-03812" |
| {{invoice.dueDate}} | ERP | "2024-02-15" |
| {{invoice.amountDue}} | ERP | "$892.00" |
| {{company.senderName}} | Config | "Acme Corp Customer Service" |
| {{company.unsubscribeUrl}} | Config | "https://..." |

## Channel-Specific Rendering Rules

### Email (HTML)
- Max size: 100KB total
- Embed images as CDN URLs (never inline base64)
- Include plain-text MIME alternative
- Must include List-Unsubscribe header
- Test rendering across Outlook, Gmail, Apple Mail viewports

### SMS
- Max 160 characters per segment (UTF-8) or 70 characters (Unicode/emoji)
- Truncate at 320 characters (2 segments max for transactional)
- No HTML; plain text only
- Include opt-out phrase: "Reply STOP to unsubscribe"

### Push Notification
- Title: max 50 characters
- Body: max 150 characters  
- Include deep link URL to order status page
- Badge count increment on iOS

### EDI (B2B)
- Render as ANSI X12 855/856 or EDIFACT ORDERS acknowledgement
- Map order fields to EDI segments per trading partner spec

## Compliance Validation (Pre-send Checks)
- CAN-SPAM: Verify physical mailing address present in email footer
- CASL: Confirm express/implied consent on file for commercial messages
- GDPR: No sensitive personal data in push notifications (visible on lock screen)
- Legal disclaimer text present for financial communications

## Output
\`\`\`json
{
  "renderedContent": { "html": "string", "text": "string" },
  "smsText": "string",
  "pushPayload": { "title": "string", "body": "string", "deepLink": "string" },
  "templateId": "string",
  "locale": "string",
  "renderDurationMs": 45,
  "complianceChecks": { "canSpam": true, "gdpr": true, "legalDisclaimer": true }
}
\`\`\``,
    allowedTools: [
      "templates.get_by_id",
      "templates.list_by_event_channel",
      "crm.get_customer_profile",
      "oms.get_order",
      "tms.get_shipment",
      "erp.get_invoice",
      "render.html_template",
      "render.validate_output"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Template Rendering Skill");

  // Skill 3 — Channel Orchestration
  skills.push(await mkSkill({
    name: "Channel Orchestration Skill",
    description: "Routes outbound customer notifications to the optimal communication channel based on customer preferences, message urgency, channel availability, and delivery cost hierarchy. Manages fallback channel selection when primary channel fails, tracks delivery attempts across channels, and applies circuit breakers for degraded channel providers.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["channel", "routing", "orchestration", "email", "sms", "push", "portal", "edi", "otc-agt-012"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Channel Orchestration Skill

## Purpose
Select and route notifications to the correct delivery channel, applying customer preference rules, urgency scoring, and automatic fallback when the primary channel fails or is unavailable.

## Channel Priority Matrix
| Channel | Urgency Threshold | Avg Delivery Time | Cost Tier |
|---|---|---|---|
| SMS | HIGH / CRITICAL | < 10 seconds | Medium |
| Push Notification | HIGH | < 30 seconds | Low |
| Email | MEDIUM / LOW | 1-5 minutes | Low |
| Self-Service Portal | ANY (passive) | Immediate | None |
| EDI | B2B only | Batch / real-time | Low |

## Routing Decision Logic
\`\`\`
1. Read customer.preferredChannel
2. If channel is available AND customer has consent for channel:
   → Route to preferred channel
3. Else apply urgency override:
   - CRITICAL urgency: SMS (if TCPA consent) → Push → Email
   - HIGH urgency:     Push → Email → Portal
   - MEDIUM urgency:   Email → Portal
   - LOW urgency:      Portal (log only, no active push)
4. Apply circuit breaker: if channel error_rate > 10% in last 5 min → skip to next fallback
5. Log routing decision and selected channel
\`\`\`

## Fallback Chain
Primary → Secondary → Tertiary → Portal (always last resort, always available)

## Circuit Breaker Parameters
- Window: 5 minutes rolling
- Open threshold: > 10% error rate OR > 5 consecutive failures
- Half-open probe: 1 request after 30 seconds cool-down
- Metrics: Published to observability stack (DataDog / Prometheus)

## SMS Gateway Failover
- Primary: Twilio
- Fallback: AWS SNS
- Last resort: Bandwidth.com
- Failover trigger: 3 consecutive send failures or gateway HTTP 5xx

## Delivery Attempt Tracking
\`\`\`json
{
  "notificationId": "uuid",
  "attempts": [
    { "channel": "email", "provider": "SendGrid", "attemptedAt": "ISO8601", "status": "bounced" },
    { "channel": "sms",   "provider": "Twilio",   "attemptedAt": "ISO8601", "status": "delivered" }
  ],
  "finalChannel": "sms",
  "deliveredAt": "ISO8601"
}
\`\`\``,
    allowedTools: [
      "channel.send_email",
      "channel.send_sms",
      "channel.send_push",
      "channel.post_to_portal",
      "channel.send_edi",
      "circuit_breaker.check_status",
      "circuit_breaker.record_outcome",
      "preferences.get_channel_consent"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Channel Orchestration Skill");

  // Skill 4 — Preference Management
  skills.push(await mkSkill({
    name: "Preference Management Skill",
    description: "Manages customer communication preferences including channel opt-in/opt-out, notification frequency caps, quiet hours enforcement, language selection, and event-type subscriptions. Processes preference update requests from self-service portal, email unsubscribe links, SMS STOP replies, and CRM agent updates. Maintains a full audit trail of preference changes for GDPR compliance.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["preferences", "opt-in", "opt-out", "gdpr", "tcpa", "frequency-cap", "quiet-hours", "otc-agt-012"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Preference Management Skill

## Purpose
Read, update, and enforce customer communication preferences across all channels and notification types in compliance with CAN-SPAM, GDPR, CASL, and TCPA regulations.

## Preference Data Model
\`\`\`json
{
  "customerId": "uuid",
  "channels": {
    "email":  { "optIn": true,  "consentDate": "2024-01-15", "consentMethod": "checkout_checkbox" },
    "sms":    { "optIn": true,  "consentDate": "2024-01-15", "consentMethod": "express_written" },
    "push":   { "optIn": false, "consentDate": null },
    "portal": { "optIn": true,  "consentDate": "always" }
  },
  "eventSubscriptions": {
    "order.confirmed":         true,
    "shipment.dispatched":     true,
    "delivery.confirmed":      true,
    "invoice.issued":          true,
    "invoice.overdue":         true,
    "payment.received":        false,
    "promotions":              false
  },
  "language": "en-US",
  "timezone": "America/New_York",
  "quietHours": { "enabled": true, "start": "21:00", "end": "08:00" },
  "frequencyCap": { "maxPerDay": 5, "maxPerWeek": 15 }
}
\`\`\`

## Opt-Out Processing
| Trigger | Action | Regulatory Basis |
|---|---|---|
| Email unsubscribe link click | Set email.optIn = false, log timestamp | CAN-SPAM §7 (10-day processing SLA) |
| SMS STOP reply | Set sms.optIn = false immediately | TCPA §64.1200 |
| GDPR erasure request | Delete all preference data + communication history | GDPR Art.17 |
| CASL withdrawal | Process within 10 business days | CASL S.11 |
| Portal self-service | Update specific channel/event subscriptions | All jurisdictions |

## Frequency Cap Enforcement
- Check daily and weekly counters per customer before each notification
- Increment counter on successful send
- Reset daily counter at midnight customer timezone
- Priority override: CRITICAL urgency ignores frequency cap

## Quiet Hours
- Convert notification scheduled time to customer local timezone
- If within quiet hours: defer to next available window (not suppress)
- Exception: CRITICAL notifications (delivery failure, fraud alert) bypass quiet hours

## Audit Trail Requirements
- Every preference change logged with: actor, timestamp, method, old_value, new_value
- Retention: 7 years (SOX/GDPR compliance)
- Immutable append-only log — no retroactive modification

## GDPR Data Subject Rights Handling
- Right of Access: Return full preference history + communication log
- Right to Rectification: Update preference record with audit entry
- Right to Erasure: Delete preferences, anonymise communication log, confirm within 30 days`,
    allowedTools: [
      "preferences.get_customer",
      "preferences.update_customer",
      "preferences.log_change",
      "preferences.check_frequency_cap",
      "preferences.increment_counter",
      "consent.verify_tcpa",
      "gdpr.process_erasure_request",
      "audit.log_preference_change"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Preference Management Skill");

  // Skill 5 — Communication Analytics
  skills.push(await mkSkill({
    name: "Communication Analytics Skill",
    description: "Tracks and analyses communication engagement metrics including delivery rates, open rates, click-through rates, bounce rates, and customer satisfaction correlations. Identifies underperforming templates, optimal send times per customer segment, and channel effectiveness. Generates recommendations for notification strategy improvements and flags anomalous patterns such as mass bounces or spam complaints.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["analytics", "engagement", "metrics", "open-rate", "delivery-rate", "csat", "otc-agt-012"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Communication Analytics Skill

## Purpose
Measure, analyse, and report on customer communication effectiveness across all channels and event types. Surface actionable insights to improve delivery rates, engagement, and customer satisfaction.

## Core Metrics Tracked
| Metric | Definition | Target Threshold |
|---|---|---|
| Delivery Rate | Sent / (Sent + Bounced + Failed) | > 98% email, > 99% SMS |
| Open Rate | Unique Opens / Delivered | > 35% transactional email |
| Click Rate | Unique Clicks / Delivered | > 15% for tracking links |
| Bounce Rate (Hard) | Hard Bounces / Sent | < 0.5% |
| Spam Complaint Rate | Complaints / Delivered | < 0.1% |
| Unsubscribe Rate | Unsubscribes / Delivered | < 0.5% |
| SMS Delivery Rate | Delivered / Sent | > 99% |
| Portal Visit Rate | Portal views / Notifications sent | > 20% |

## Event-Funnel Analysis
For each O2C event type, track the customer journey:
\`\`\`
Notification Sent → Delivered → Opened → Action Taken (click/portal visit) → CSAT Survey Response
\`\`\`

## CSAT Correlation
- Join communication events with CSAT survey scores (0-10 NPS scale)
- Segment: customers who received timely, correct notifications vs. those who did not
- Expected finding: on-time shipment notifications correlate with 15-20 point NPS improvement
- Report: weekly correlation analysis per event type

## Anomaly Detection
| Anomaly Pattern | Trigger | Response |
|---|---|---|
| Mass hard bounce | > 5% bounce rate in 1-hour window | Alert + pause campaign + ISP investigation |
| Spam complaint spike | > 0.2% complaint rate | Alert + template review + ISP reputation check |
| SMS gateway timeout storm | > 3% delivery timeout | Circuit breaker + failover to backup gateway |
| Delivery clock skew | Median delivery latency > 2x baseline | Alert + provider SLA review |

## Send-Time Optimisation
- Analyse historical open rates by: customer segment × hour-of-day × day-of-week
- Build per-segment optimal send window (top quartile of open rate)
- Apply to low-urgency notifications only (MEDIUM/LOW urgency)
- Re-evaluate model monthly with fresh data

## Output Reports
\`\`\`json
{
  "reportPeriod": "2024-Q1",
  "byChannel": { "email": { "sent": 125000, "delivered": 123450, "opened": 48000 } },
  "byEventType": { "shipment.dispatched": { "openRate": 0.42, "csat_correlation": 0.68 } },
  "anomalies": [],
  "recommendations": ["Shift invoice.issued emails to 9:00-11:00 AM customer timezone for 12% open rate uplift"]
}
\`\`\``,
    allowedTools: [
      "analytics.get_delivery_metrics",
      "analytics.get_engagement_metrics",
      "analytics.get_bounce_report",
      "csat.get_survey_scores",
      "analytics.run_correlation",
      "analytics.detect_anomalies",
      "analytics.get_send_time_optimisation",
      "reporting.generate_communication_report"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Communication Analytics Skill");

  // Skill 6 — Self-Service Portal
  skills.push(await mkSkill({
    name: "Self-Service Portal Skill",
    description: "Powers a customer-facing self-service portal providing real-time order status, shipment tracking, invoice access, and payment history. Enables customers to update communication preferences, download documents, initiate returns, and view their complete communication timeline. Integrates with OMS, TMS, ERP, and CRM to present a unified order-to-cash view.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["self-service", "portal", "tracking", "order-status", "real-time", "customer-experience", "otc-agt-012"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Self-Service Portal Skill

## Purpose
Aggregate real-time order-to-cash data from multiple backend systems and present a unified, customer-facing status experience through the self-service portal. Enable customers to act on their orders without requiring service team intervention.

## Portal Modules

### 1. Order Status Dashboard
- Live order status from OMS (CONFIRMED / IN_FULFILLMENT / SHIPPED / DELIVERED / CANCELLED)
- Estimated delivery date with carrier SLA
- Line-item level status for multi-line orders
- Order modification history (cancellations, quantity changes, address changes)

### 2. Shipment Tracking
- Real-time carrier tracking events (pulled from TMS every 15 minutes)
- Map-based visual tracking where carrier API supports it
- Proactive exception alerts (delay, failed attempt, address issue)
- Direct link to carrier's native tracking page

### 3. Invoice & Payment Centre
- PDF invoice download
- Outstanding balance and due date
- Payment history (paid invoices with payment reference)
- Dispute initiation for billing discrepancies

### 4. Communication Preferences Centre
- Channel subscription management (email / SMS / push / portal)
- Notification event subscriptions (which O2C events to receive)
- Language preference
- Quiet hours configuration
- Opt-out with confirmation and regulatory notice

### 5. Communication Timeline
- Unified log of all notifications sent to this customer
- Filterable by: channel, event type, date range
- Shows: sent, delivered, opened, clicked status per message
- Accessible by service team for support queries

## Authentication & Security
- OAuth2 / SAML SSO integration with customer identity provider
- Magic link email for passwordless access
- Rate limiting: 100 requests / minute per customer session
- PII display: mask payment card numbers, truncate sensitive fields

## API Data Sources
| Module | Primary API | Refresh Rate |
|---|---|---|
| Order Status | OMS /orders/{id}/status | Real-time (webhook) |
| Tracking Events | TMS /shipments/{id}/events | 15-minute polling |
| Invoices | ERP /invoices?customer={id} | Real-time |
| Communication Log | Platform /api/communication-log/{customerId} | Real-time |
| Preferences | Platform /api/preferences/{customerId} | Real-time |

## WCAG 2.1 AA Compliance
- All interactive elements keyboard accessible
- Screen reader compatible (ARIA labels, semantic HTML)
- Colour contrast ratio ≥ 4.5:1 for normal text
- Text resize support up to 200% without loss of functionality`,
    allowedTools: [
      "oms.get_order_status",
      "tms.get_tracking_events",
      "erp.get_invoices",
      "erp.get_payment_history",
      "preferences.get_customer",
      "preferences.update_customer",
      "communication_log.get_customer_timeline",
      "portal.generate_auth_link"
    ],
    requiredMcpServers: [],
    knowledgeQueries: [],
  }));
  ok("Self-Service Portal Skill");

  return skills;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Knowledge Base
// ═══════════════════════════════════════════════════════════════════════════════
async function createKnowledgeBase() {
  step(2, 8, "Creating OTC-AGT-012 Knowledge Base");

  const kb = await mkKB({
    name: "OTC Customer Communications Knowledge Base",
    description: "Reference corpus for the Customer Communication & Notification Agent covering communication templates by event type and channel, brand guidelines, channel specifications (email/SMS/push/EDI), customer segmentation for personalisation, communication best practices (send-time optimisation, frequency guidelines), and regulatory requirements by jurisdiction for transactional communications (CAN-SPAM, GDPR, CASL, TCPA, WCAG, FDA pharma, FINRA financial).",
    industry: "enterprise",
    vectorDbType: "pgvector",
    embeddingModel: "text-embedding-3-small",
    chunkSize: 512,
    chunkOverlap: 50,
    stalenessThresholdDays: 90,
  });
  ok(`KB created: ${kb.id}`);

  const sources = [
    {
      name: "O2C Communication Templates Library",
      sourceType: "text",
      description: "Templates for all O2C event notification types across email, SMS, push, and portal channels",
      content: `# O2C Communication Templates Library

## Order Confirmed — Email Template (en-US)
Subject: Your Order {{order.orderNumber}} Is Confirmed ✓
---
Hi {{customer.firstName}},

Great news — we've received your order and it's being processed.

**Order Summary**
Order Number: {{order.orderNumber}}
Order Date: {{order.orderDate}}
Total Amount: {{order.totalAmount}}
Estimated Ship Date: {{order.estimatedShipDate}}

[View Order Details] → {{order.portalUrl}}

If you have questions, reply to this email or call {{company.servicePhone}}.

{{company.senderName}}
{{company.physicalAddress}}
[Unsubscribe] | [Manage Preferences]

---

## Shipment Dispatched — Email Template (en-US)
Subject: Your Order {{order.orderNumber}} Has Shipped 🚚
---
Hi {{customer.firstName}},

Your order is on its way!

**Shipping Details**
Carrier: {{shipment.carrier}}
Tracking Number: {{shipment.trackingNumber}}
Estimated Delivery: {{shipment.estimatedDeliveryDate}}

[Track Your Package] → {{shipment.trackingUrl}}

[View Order] → {{order.portalUrl}}

---

## Shipment Dispatched — SMS Template (en-US)
---
{{company.shortName}}: Your order {{order.shortOrderNumber}} shipped via {{shipment.carrier}}. Track: {{shipment.shortTrackingUrl}} Reply STOP to unsubscribe.

---

## Delivery Confirmed — Email Template (en-US)
Subject: Your Order {{order.orderNumber}} Has Been Delivered ✓
---
Hi {{customer.firstName}},

Your order was delivered on {{delivery.deliveredAt}} to:
{{delivery.deliveryAddress}}

If you have any issues with your delivery, please contact us within 48 hours.

[Rate Your Experience] → {{csat.surveyUrl}}
[View Order] → {{order.portalUrl}}

---

## Invoice Issued — Email Template (en-US)
Subject: Invoice {{invoice.invoiceNumber}} for Order {{order.orderNumber}}
---
Hi {{customer.firstName}},

Please find your invoice for order {{order.orderNumber}}.

**Invoice Details**
Invoice Number: {{invoice.invoiceNumber}}
Invoice Date: {{invoice.invoiceDate}}
Due Date: {{invoice.dueDate}}
Amount Due: {{invoice.amountDue}}

[Download Invoice PDF] → {{invoice.downloadUrl}}
[Pay Online] → {{invoice.paymentUrl}}

---

## Invoice Overdue — Email Template (en-US)
Subject: Payment Reminder: Invoice {{invoice.invoiceNumber}} Past Due
---
Hi {{customer.firstName}},

This is a friendly reminder that invoice {{invoice.invoiceNumber}} for {{invoice.amountDue}} was due on {{invoice.dueDate}}.

To avoid service interruption, please arrange payment at your earliest convenience.

[Pay Now] → {{invoice.paymentUrl}}
[Contact Us] → {{company.contactUrl}}

---

## Payment Received — Email Template (en-US)
Subject: Payment Confirmed for Invoice {{invoice.invoiceNumber}}
---
Hi {{customer.firstName}},

We've received your payment of {{payment.amount}} for invoice {{invoice.invoiceNumber}}.

Payment Reference: {{payment.referenceNumber}}
Payment Date: {{payment.receivedAt}}

Thank you for your business.
`,
    },
    {
      name: "Brand Guidelines and Communication Standards",
      sourceType: "text",
      description: "Tone of voice, visual identity, legal disclaimer requirements, and brand-consistent formatting standards",
      content: `# Brand Guidelines — Customer Communications

## Tone of Voice
- **Professional but warm**: Write as a knowledgeable, helpful colleague — not a robot or a call centre script
- **Proactive**: Anticipate questions; include the information customers need before they ask
- **Clear and concise**: Short sentences. Active voice. No jargon. Maximum 150-word email bodies for transactional notifications
- **Honest**: If there's a problem (delay, exception), acknowledge it directly and state what we're doing

## Voice Attributes
| Attribute | Do | Don't |
|---|---|---|
| Confident | "Your order has shipped" | "It appears your order may have shipped" |
| Helpful | "Track your package here: [link]" | "You can check status if you want" |
| Human | "Hi Sarah" | "Dear Valued Customer" |
| Action-oriented | "Pay now to avoid service interruption" | "Please be advised payment is outstanding" |

## Sender Identity
- From Name: [Brand Name] Customer Care
- From Email: noreply@[brand].com (monitored alias)
- Reply-To: support@[brand].com (actively monitored)
- SMS Sender: Short code or verified 10DLC number

## Legal Disclaimers Required
Every outbound email MUST include in footer:
- Physical mailing address (CAN-SPAM requirement)
- Unsubscribe link (functional within 10 days)
- Company legal name and jurisdiction
- Privacy Policy link

Transactional emails are exempt from CAN-SPAM's commercial message opt-out requirement BUT must still identify the sender and include the physical address.

## Logo Usage
- Email: Use hosted CDN URL (not embedded base64)
- Minimum width: 150px; maximum width: 300px
- Dark backgrounds: Use white reverse logo variant
- Always include alt text: "[Brand Name] logo"

## Colour Palette
- Primary Blue: #1B4F8A (hex) — use for CTA buttons
- Text Body: #333333
- Background: #FFFFFF
- Footer background: #F5F5F5
- Success green: #2E7D32
- Warning amber: #E65100
- Error red: #C62828
`,
    },
    {
      name: "Channel Technical Specifications",
      sourceType: "text",
      description: "Email, SMS, push notification, and EDI channel size limits, encoding requirements, provider SLAs, and integration specifications",
      content: `# Channel Technical Specifications

## Email Channel
| Parameter | Specification |
|---|---|
| Max message size | 100KB (total MIME) |
| Max attachments | 10MB (invoice PDF only) |
| HTML version | HTML5, inline CSS only |
| Image hosting | CDN URLs, no base64 |
| Plain-text required | Yes (MIME alternative) |
| Unsubscribe header | List-Unsubscribe required |
| DKIM | Required (2048-bit key) |
| SPF | Required (strict -all) |
| DMARC | Required (p=quarantine minimum) |
| Provider | SendGrid (primary), AWS SES (backup) |
| Provider SLA | 99.9% uptime, < 5 minute queue drain |
| Delivery webhook | SendGrid Event Webhook — receive open/click/bounce events |

## SMS Channel
| Parameter | Specification |
|---|---|
| Encoding | GSM-7 (160 chars/segment) or UCS-2/Unicode (70 chars/segment) |
| Max segments | 2 (320 GSM-7 chars) for transactional |
| Opt-out keyword | STOP (mandatory response per TCPA) |
| Opt-in confirmation | Required for new subscribers |
| Sender type | 10DLC (A2P) or Short Code |
| Primary provider | Twilio |
| Fallback provider | AWS SNS |
| Last resort | Bandwidth.com |
| Provider SLA | 99.9% uptime, < 10 second delivery |
| Delivery receipt | Twilio status callback URL |

## Push Notification Channel
| Parameter | Specification |
|---|---|
| iOS title max | 50 characters |
| iOS body max | 150 characters |
| Android title max | 65 characters |
| Android body max | 240 characters |
| Badge count | Increment by 1 per notification |
| Sound | Default device sound for MEDIUM+, silent for LOW |
| Deep link format | app://orders/{orderId}/status |
| Provider | Firebase Cloud Messaging (FCM) |
| iOS gateway | Apple Push Notification Service (APNs) |
| Delivery receipt | FCM delivery reports |
| Expiry TTL | 86400 seconds (24 hours) for transactional |

## EDI Channel (B2B)
| Parameter | Specification |
|---|---|
| Standards supported | ANSI X12, EDIFACT, TRADACOMS |
| Key transaction sets | 855 (PO Acknowledgement), 856 (ASN), 810 (Invoice) |
| Connectivity | AS2, SFTP, VAN |
| Acknowledgement | 997 Functional Acknowledgement required within 24h |
| Trading partner setup | 30-day onboarding; contact EDI team |
| Error handling | CONTRL (EDIFACT) or 997 rejection with reason codes |

## Portal (Passive) Channel
| Parameter | Specification |
|---|---|
| Availability | 24/7/365, 99.9% SLA |
| Status refresh | Order: webhook; Tracking: 15-min polling |
| Session timeout | 30 minutes inactivity |
| Mobile support | Responsive, WCAG 2.1 AA |
| PDF generation | Server-side, max 2 seconds |
`,
    },
    {
      name: "Customer Segmentation for Communication Personalisation",
      sourceType: "text",
      description: "Customer segment definitions, communication personalisation rules, and segment-specific notification behaviour",
      content: `# Customer Segmentation for Communication Personalisation

## Segment Definitions
| Segment ID | Name | Criteria | Size Estimate |
|---|---|---|---|
| SEG-01 | Strategic / Enterprise | Annual revenue > $1M OR contract tier = PLATINUM | 2-5% of base |
| SEG-02 | Mid-Market | Annual revenue $100K-$1M | 15-25% of base |
| SEG-03 | SMB | Annual revenue < $100K | 50-65% of base |
| SEG-04 | New Customer | Account age < 90 days | Rolling cohort |
| SEG-05 | At-Risk | 2+ service incidents in 90 days OR NPS < 7 | Dynamic |
| SEG-06 | High-Frequency Buyer | > 20 orders per quarter | 5-10% of base |
| SEG-07 | B2B / EDI | Uses EDI channel, purchase order workflow | 10-20% of base |

## Personalisation Rules by Segment

### SEG-01 (Strategic)
- Dedicated account manager signature in all emails
- Phone escalation number included in failure notifications
- CSAT survey after every major event (not just delivery)
- Invoice emails CC'd to CFO contact on file
- Shipment delays: proactive call from account manager (not just email)

### SEG-04 (New Customer)
- Welcome email series: Days 1, 7, 30 post-first-order
- Additional explanation text in transactional emails ("Here's what happens next")
- Portal onboarding tour link included in first 3 notifications
- Simplified language (Flesch-Kincaid grade 8 target)

### SEG-05 (At-Risk)
- Every notification includes direct service contact (phone + email)
- Skip frequency cap — ensure all relevant updates are sent
- Flag to CRM for proactive outreach by service team
- CSAT survey with service recovery offer on delivery confirmation

### SEG-06 (High-Frequency)
- Consolidated daily digest option (replace individual order notifications)
- Bulk shipment summary (5+ active orders combined into one email)
- Opt-in to weekly performance report

## Language & Locale Handling
- Default language: en-US
- Supported languages: en-US, en-GB, es-ES, es-MX, fr-FR, fr-CA, de-DE, pt-BR, ja-JP, zh-CN
- Language source: customer.language field in CRM (fallback to account country default)
- Date/time format: Locale-specific (en-US: MM/DD/YYYY; en-GB: DD/MM/YYYY; ISO8601 for APIs)
- Currency: Always display in customer's billing currency from ERP
`,
    },
    {
      name: "Communication Best Practices and Send-Time Optimisation",
      sourceType: "text",
      description: "Industry best practices for notification frequency, send-time optimisation, subject line effectiveness, and A/B testing guidance",
      content: `# Communication Best Practices

## Send-Time Optimisation (STO)
Research-backed optimal send windows by event type:

### Transactional Notifications (Ship/Deliver)
- **Email**: Within 2 minutes of event (real-time) — customers expect immediate notification
- **SMS**: Within 1 minute of event — highest open rate for time-sensitive updates
- **Push**: Within 30 seconds of event if customer app installed

### Financial Notifications (Invoice/Payment)
- **Email**: 9:00 AM – 11:00 AM recipient local time (highest B2B email open rate window)
- Avoid: Monday mornings (inbox overload), Friday afternoons (ignored until Monday)
- **SMS**: Avoid for invoices unless explicitly opted in to financial SMS

### Reminder/Follow-up Notifications
- Day 0: Send at optimal time for segment
- Day 7 reminder: If no action (portal visit, payment, etc.)
- Day 14: Escalate channel (email → phone for SEG-01)
- Day 30: Escalate to collections workflow

## Frequency Guidelines
| Customer Segment | Max Daily Emails | Max Weekly SMS | Exception |
|---|---|---|---|
| Standard | 3 | 2 | Critical events bypass cap |
| New Customer | 2 | 1 | Welcome series exempt first 7 days |
| At-Risk | 5 | 3 | Additional support check-ins |
| Strategic | No cap | 5 | All events; no suppression |

## Subject Line Best Practices (Email)
- Include order number for easy inbox search
- Use ✓ or 🚚 emoji sparingly for shipped/delivered (A/B test: +8% open rate)
- Avoid spam trigger words: "FREE", "URGENT", "ACT NOW", "LIMITED TIME"
- Personalisation: Including customer name increases open rate by 22%
- Length: 40-50 characters for mobile preview optimisation

## A/B Testing Protocol
- Test one variable at a time
- Minimum sample: 1,000 recipients per variant
- Test duration: 48 hours minimum
- Statistical confidence: 95% before declaring winner
- Document results in template version history

## Anti-Spam Practices
- Honour opt-outs within 10 business days (CAN-SPAM); immediately for SMS (TCPA)
- Never purchase email lists
- Implement list hygiene: remove hard bounces immediately
- Warm-up new IP/domain gradually (ISP reputation)
- Monitor Sender Score and domain reputation weekly

## Communication Storm Prevention
- Circuit breaker: pause all non-critical notifications if send rate > 10,000/min
- Deduplication: 60-minute window per customer per event type
- System event loop detection: alert if same notification ID attempted > 3 times
- Human review gate: any bulk send > 50,000 recipients requires approval
`,
    },
    {
      name: "Regulatory Requirements for Customer Communications by Jurisdiction",
      sourceType: "text",
      description: "Comprehensive regulatory requirements for CAN-SPAM, GDPR, CASL, TCPA, WCAG, FDA pharma communications, and FINRA financial services communications",
      content: `# Regulatory Requirements for Customer Communications

## CAN-SPAM Act (United States)
Applies to: All commercial email to US recipients

**Requirements:**
- Don't use false or misleading header information
- Don't use deceptive subject lines
- Identify the message as an advertisement (if commercial, not transactional)
- Tell recipients where you're located (physical postal address in footer — mandatory)
- Tell recipients how to opt out of future emails
- Honour opt-out requests promptly (within 10 business days)
- Monitor what others are doing on your behalf (ESP compliance)

**Transactional Exception:** Order confirmations, shipping notifications, invoices = transactional. Exempt from opt-out requirement but MUST still include physical address and identify sender.

**Penalties:** Up to $51,744 per email violation.

---

## GDPR (European Union / EEA)
Applies to: Any communication involving EU/EEA resident personal data

**Legal Basis for Communication:**
- Transactional O2C notifications: Art.6(1)(b) — contract performance
- Marketing communications: Art.6(1)(a) — explicit consent required
- Invoice/legal notices: Art.6(1)(c) — legal obligation

**Data Subject Rights to honour:**
- Right to Access (Art.15): Provide communication history within 30 days
- Right to Erasure (Art.17): Delete or anonymise within 30 days; document exceptions
- Right to Restriction (Art.18): Stop processing while restriction is active
- Right to Portability (Art.20): Export preference data in machine-readable format

**Data Minimisation:** Only include personal data necessary for the communication purpose. Do not include payment card details in email or SMS bodies.

**Cross-Border Transfers:** Any communication system storing EU data in non-EEA country must use SCCs or adequacy decision.

---

## CASL — Canada's Anti-Spam Legislation
Applies to: Commercial electronic messages sent to/from Canadian recipients

**Express Consent Required for:**
- Any commercial message (marketing, promotional)
- Confirmation messages for subscriptions

**Implied Consent (time-limited):**
- Existing business relationship: 2 years from last purchase
- Must document basis and expiry date

**Transactional Exemption:**
- Order confirmations, invoices, shipping notices = exempt if relationship exists

**Unsubscribe Requirements:**
- Functional unsubscribe mechanism in every message
- Process unsubscribes within 10 business days

**Penalties:** Up to CAD $10M per violation for organisations.

---

## TCPA — Telephone Consumer Protection Act (United States)
Applies to: SMS/MMS and automated phone calls to US phone numbers

**Express Written Consent Required for:**
- All A2P (Application-to-Person) SMS messages to US numbers
- Even transactional messages require prior consent if sent via automated system

**Mandatory:**
- Provide clear opt-out instructions (STOP keyword)
- Process STOP replies immediately (within seconds)
- Keep consent records (date, method, content of consent disclosure)
- Honour opt-outs permanently (re-consent requires new explicit opt-in)

**Quiet Hours (TCPA Safe Harbour):**
- No SMS between 9 PM and 8 AM recipient local time
- Applies even with consent

**Penalties:** $500–$1,500 per violation (per text message). Class actions common.

---

## WCAG 2.1 AA — Web Content Accessibility Guidelines
Applies to: Self-service portal and HTML email templates

**Key Requirements:**
- Text contrast ratio ≥ 4.5:1 (normal text), ≥ 3:1 (large text)
- All images have descriptive alt text
- All functionality accessible via keyboard (no mouse-only interactions)
- Form inputs have visible labels
- Error messages are descriptive and suggest correction
- Page structure uses semantic HTML (h1, h2, nav, main, footer)
- Videos include captions; audio includes transcripts

---

## FDA — Pharmaceutical Communications (US)
Applies to: Communications from pharmaceutical/medical device companies

**Requirements:**
- Balance of benefits and risks in any product-related communication
- Fair balance: risk information must be proportional to benefit information
- No false or misleading statements
- Required statement for prescription drugs: "For full prescribing information, see [PI link]"
- Adverse event reporting reminders in patient-facing communications

---

## FINRA — Financial Services Communications (US)
Applies to: Communications from FINRA-regulated broker-dealers

**Requirements:**
- All customer communications must be fair, balanced, and not misleading
- Retail communications (non-institutional) require principal approval before use
- Keep records of all customer communications for 3 years (some 6 years)
- Complaints: Log and retain all customer complaints
- Social media: Same standards apply; specific guidance on real-time interactive content

---

## Records Retention Summary by Jurisdiction
| Jurisdiction | Communication Type | Retention Period |
|---|---|---|
| United States (SOX) | All financial communications | 7 years |
| United States (CAN-SPAM) | Opt-out records | 3 years minimum |
| United States (TCPA) | Consent records | Duration of relationship + 4 years |
| EU (GDPR) | Consent records | Duration of consent period |
| Canada (CASL) | Consent records | Duration of relationship |
| FDA | Product communications | 2 years post-product discontinuation |
| FINRA | Customer communications | 3-6 years |
`,
    },
  ];

  for (const src of sources) {
    await mkSource(kb.id, { sourceType: "text", name: src.name, description: src.description, content: src.content });
    ok(`KB source added: ${src.name}`);
  }

  return kb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Agent
// ═══════════════════════════════════════════════════════════════════════════════
async function createAgent(skills, kb) {
  step(3, 8, "Creating OTC-AGT-012 Agent");

  const agent = await mkAgent({
    name: "Customer Communication & Notification Agent",
    description: "Orchestrates all customer-facing communications across the order-to-cash lifecycle. Manages multi-channel notifications (email, SMS, push, portal, EDI), ensures consistent messaging, personalises communications based on customer preferences and segment, and provides a unified communication log for service teams. Subscribes to O2C events, evaluates notification eligibility, selects the optimal channel, renders personalised messages from templates, tracks delivery status, handles bounces with fallback channels, manages opt-in/opt-out preferences, and analyses communication effectiveness to continuously improve engagement.",
    department: "Finance",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    status: "active",
    agentType: "single",
    owner: "ATLAS Platform Team",
    complianceTags: [
      "CAN_SPAM",
      "GDPR",
      "CASL",
      "TCPA",
      "WCAG_ADA",
      "DATA_PRIVACY",
      "RECORDS_RETENTION",
      "FDA_PHARMA",
      "FINRA",
      "SOX"
    ],
    systemPrompt: `You are the Customer Communication & Notification Agent for the Order-to-Cash (O2C) platform, designated OTC-AGT-012. Your mission is to orchestrate all customer-facing communications across the full order-to-cash lifecycle — from order confirmation through delivery, invoicing, and payment — ensuring every customer receives timely, accurate, personalised, and compliant notifications through their preferred channels.

## Core Responsibilities
1. **Event Subscription & Eligibility**: Subscribe to O2C lifecycle events (order.confirmed, shipment.dispatched, delivery.confirmed, invoice.issued, invoice.overdue, payment.received, dispute.opened). For each event, determine whether a notification is eligible based on customer preferences, opt-in status, deduplication window, frequency caps, and quiet hours.

2. **Channel Selection**: Select the optimal communication channel (email, SMS, push, portal, EDI) per customer preference and message urgency. Apply fallback chain when primary channel is unavailable. Enforce circuit breakers for degraded channel providers.

3. **Message Personalisation & Rendering**: Personalise message content using customer data (name, segment, language, order context) and render from the appropriate template. Validate rendered output for brand compliance and regulatory requirements before dispatch.

4. **Delivery Tracking & Fallback**: Track delivery status (sent, delivered, opened, bounced, failed) for every notification. When primary channel bounces or fails, automatically route to fallback channel and log the attempt chain.

5. **Preference Management**: Honour all customer opt-in/opt-out requests immediately. Enforce frequency caps and quiet hours. Process GDPR erasure requests, TCPA STOP commands, and CASL withdrawal requests with full audit logging.

6. **Communication Log**: Maintain a unified, searchable communication timeline per customer. Make this available to service teams for support queries. Log every notification attempt with outcome.

7. **Analytics & Improvement**: Track engagement metrics (delivery rate, open rate, click rate, bounce rate) per template and channel. Surface anomalies (mass bounces, spam complaints). Generate recommendations for send-time optimisation and template improvements.

8. **Self-Service Portal**: Power the customer portal with real-time order status, shipment tracking, invoice access, and preference management. Ensure WCAG 2.1 AA accessibility compliance.

## Regulatory Constraints — STRICTLY ENFORCED
- **TCPA**: Never send SMS without prior express written consent on file. Process STOP replies within seconds.
- **CAN-SPAM**: Physical sender address in every email footer. Process unsubscribe requests within 10 business days.
- **GDPR**: Process data subject access and erasure requests within 30 days. Only collect and use communication data under the applicable legal basis.
- **CASL**: Verify consent basis before sending to Canadian recipients. Implied consent expires after 2 years.
- **Quiet Hours**: Never send SMS between 9 PM and 8 AM recipient local time.
- **Data Minimisation**: No sensitive personal data (payment card numbers, health data) in email or SMS body content.

## Escalation Protocol
- Mass bounce event (> 5% rate in 1 hour): Pause all non-critical email sends; alert deliverability team immediately
- SMS gateway failure: Activate fallback gateway; notify operations within 5 minutes
- GDPR erasure request: Escalate to DPO; log receipt timestamp; begin processing within 24 hours
- Communication storm detected: Activate circuit breaker; halt duplicate sends; alert engineering

## Decision Authority
- **Autonomous**: Send transactional notifications for eligible events where customer has active consent
- **Alert and Allow**: Send notifications for high-risk customers; log all sends to compliance audit trail
- **Require Approval**: Bulk sends > 50,000 recipients; any template change affecting legal disclaimers; marketing messages
- **Block**: SMS to customers without express written TCPA consent; email after CAN-SPAM opt-out; any channel after GDPR erasure`,

    runtimeConfig: {
      domain: "Customer Experience",
      category: "Order-to-Cash",
      subdomain: "Customer Communication",
      agentId: "OTC-AGT-012",
      channels: ["email", "sms", "push", "portal", "edi"],
      eventTypes: [
        "order.confirmed", "order.modified",
        "shipment.dispatched", "shipment.out_for_delivery",
        "delivery.confirmed", "delivery.exception",
        "invoice.issued", "invoice.overdue",
        "payment.received",
        "dispute.opened", "dispute.resolved"
      ],
      deduplicationWindowMinutes: 60,
      circuitBreakerErrorThresholdPct: 10,
      circuitBreakerWindowMinutes: 5,
      bulkSendApprovalThreshold: 50000,
      smsQuietHoursStart: "21:00",
      smsQuietHoursEnd: "08:00",
      maxDailyEmailsPerCustomer: 3,
      maxWeeklySmsPerCustomer: 2,
      deliveryRetentionDays: 2555,
      prompt: `Determine the incoming request type and execute the appropriate workflow:

**Transactional Notification Flow**
If an O2C lifecycle event is received:
1. Use the Event-Driven Notification Skill to evaluate eligibility (check opt-in status, dedup window, frequency cap, quiet hours)
2. If eligible: use the Channel Orchestration Skill to select the optimal channel based on customer preference and urgency
3. Use the Template Rendering Skill to personalise and render the message with full customer and order context
4. Dispatch via selected channel; if primary fails, apply fallback chain
5. Log delivery outcome (sent/delivered/bounced/failed) to the customer communication timeline
6. If ALERT_AND_ALLOW: log notification to compliance audit trail alongside standard logging

**Customer Preference Update**
If a preference update request is received (opt-out link click, SMS STOP, portal setting change, GDPR request):
1. Use the Preference Management Skill to update the customer's preference record immediately
2. Apply the change to all pending notifications in the queue for this customer
3. Log the preference change with actor, timestamp, and regulatory basis
4. Confirm the update to the customer via their remaining active channel(s)

**Communication Analytics Request**
If a metrics or analytics request is received:
1. Use the Communication Analytics Skill to retrieve engagement data for the requested period, channel, and event type
2. Identify anomalies (bounce spikes, complaint rate increases, delivery failures)
3. Generate recommendations for template or timing improvements
4. If a communication storm is detected: activate circuit breaker and alert operations team

**Customer Portal Data Request**
If the self-service portal requests order, shipment, invoice, or communication data:
1. Use the Self-Service Portal Skill to aggregate real-time data from OMS, TMS, ERP, and CRM
2. Apply data masking rules (truncate sensitive fields)
3. Return structured response to portal API
4. Log portal access event to customer activity timeline

**Regulatory / Compliance Request**
If a GDPR, TCPA, CASL, or CAN-SPAM compliance action is requested:
1. Use the Preference Management Skill to process the regulatory action (erasure, access, rectification, withdrawal)
2. Escalate to DPO / Legal if erasure request requires data deletion beyond preference records
3. Document all actions with timestamps and regulatory basis
4. Respond to requestor within required SLA (GDPR: 30 days; TCPA STOP: immediate; CAN-SPAM unsubscribe: 10 business days)`,
    },

    memoryRagConfig: {
      topK: 10,
      rerankEnabled: true,
      embeddingModel: "text-embedding-3-large",
      sources: [
        {
          type: "knowledge_base",
          description: "OTC Customer Communications KB: communication templates by event type and channel, brand guidelines, channel specifications (email/SMS/push/EDI size limits, encoding, provider SLAs), customer segmentation for personalisation, communication best practices (send-time optimisation, frequency guidelines, A/B testing), and regulatory requirements by jurisdiction (CAN-SPAM, GDPR, CASL, TCPA, WCAG 2.1 AA, FDA pharma, FINRA, SOX records retention)"
        }
      ]
    },

    preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })),
  });

  ok(`Agent created: ${agent.id}`);
  return agent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Link Knowledge Base to Agent
// ═══════════════════════════════════════════════════════════════════════════════
async function linkKBToAgent(agentId, kbId) {
  step(4, 8, "Linking Knowledge Base to Agent");
  const link = await linkKB(agentId, { knowledgeBaseId: kbId });
  ok(`KB ${kbId} linked to agent ${agentId}`);
  return link;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Policies
// ═══════════════════════════════════════════════════════════════════════════════
async function createPolicies(agentId) {
  step(5, 8, "Creating Policies");
  const policies = [];

  policies.push(await mkPolicy({
    name: "CAN-SPAM / GDPR / CASL Email Compliance",
    domain: "regulatory_compliance",
    scopeType: "agent",
    scopeId: agentId,
    description: "Enforces CAN-SPAM, GDPR, and CASL requirements for all outbound email communications including mandatory sender identification, physical address in footer, functional unsubscribe mechanism, and timely opt-out processing.",
    policyJson: {
      type: "HARD",
      enforcement: "block",
      rules: [
        "Every outbound email must include the sender's physical mailing address in the footer",
        "Every outbound email must include a functional unsubscribe link that processes within 10 business days",
        "Commercial emails must identify themselves as advertisements unless they are transactional (order/shipping/invoice)",
        "Email sender identity (From address, domain) must not be false or misleading",
        "GDPR: Email to EU/EEA residents requires documented legal basis (contract performance, consent, or legal obligation)",
        "CASL: Email to Canadian recipients requires express or implied consent with documented expiry date",
        "No email to addresses that have previously unsubscribed unless re-consent has been explicitly obtained",
        "Opt-out requests must be processed within 10 business days; no further emails until confirmed processed"
      ],
      auditFrequency: "per_send",
      retentionRequirement: "opt_out_records_3_years_minimum",
    },
  }));
  ok("Policy: CAN-SPAM / GDPR / CASL Email Compliance");

  policies.push(await mkPolicy({
    name: "TCPA SMS Consent and Quiet Hours Enforcement",
    domain: "regulatory_compliance",
    scopeType: "agent",
    scopeId: agentId,
    description: "Enforces TCPA requirements for all outbound SMS communications including prior express written consent verification, STOP reply processing, and quiet hours enforcement between 9 PM and 8 AM recipient local time.",
    policyJson: {
      type: "HARD",
      enforcement: "block",
      rules: [
        "BLOCK: Never send SMS to any US phone number without verified prior express written consent on file",
        "BLOCK: Never send SMS between 9:00 PM and 8:00 AM recipient local time (TCPA safe harbour)",
        "IMMEDIATE ACTION: Process STOP reply within seconds; add to opt-out list before any further sends",
        "Every SMS must include opt-out instruction (e.g., 'Reply STOP to unsubscribe')",
        "Consent records must be retained for duration of customer relationship plus 4 years",
        "Re-subscription after STOP requires new explicit opt-in; cannot be assumed from account reactivation",
        "A2P (Application-to-Person) messages must use registered 10DLC or Short Code sender",
        "No SMS containing health, financial, or sensitive personal data without additional consent layer"
      ],
      auditFrequency: "per_send",
      retentionRequirement: "consent_records_relationship_plus_4_years",
    },
  }));
  ok("Policy: TCPA SMS Consent");

  policies.push(await mkPolicy({
    name: "Customer Data Privacy and Communication Data Handling",
    domain: "data_privacy",
    scopeType: "agent",
    scopeId: agentId,
    description: "Governs how customer personal data is handled within the communication system including data minimisation in message content, secure handling of communication preferences, and processing of GDPR/CCPA data subject rights requests.",
    policyJson: {
      type: "HARD",
      enforcement: "block",
      rules: [
        "BLOCK: Never include payment card numbers, bank account details, or health data in email or SMS body content",
        "BLOCK: Never expose full customer PII in push notification body (visible on device lock screen)",
        "Data minimisation: only include personal data fields strictly necessary for the communication purpose",
        "GDPR erasure requests must be acknowledged within 72 hours and completed within 30 days",
        "Communication preference data must be protected with access controls; limit access to authorised systems and personnel",
        "Customer communication history must be anonymisable (not only deletable) to preserve aggregate analytics while honouring erasure rights",
        "Cross-border data transfers: EU/EEA customer data processed in non-EEA systems must use SCCs or adequacy decision",
        "All preference updates logged immutably with actor, timestamp, method, and old/new values"
      ],
      auditFrequency: "continuous",
      retentionRequirement: "gdpr_records_contract_duration_plus_3_years",
    },
  }));
  ok("Policy: Data Privacy");

  policies.push(await mkPolicy({
    name: "Communication Records Retention",
    domain: "audit_compliance",
    scopeType: "agent",
    scopeId: agentId,
    description: "Enforces minimum retention periods for communication logs, consent records, and preference histories in accordance with SOX, CAN-SPAM, TCPA, GDPR, and FINRA requirements.",
    policyJson: {
      type: "HARD",
      enforcement: "block",
      rules: [
        "All outbound communication logs (sent, delivered, opened, bounced) retained for minimum 7 years (SOX)",
        "Opt-out and unsubscribe records retained for minimum 3 years from opt-out date (CAN-SPAM)",
        "TCPA consent records retained for duration of customer relationship plus 4 years",
        "GDPR consent records retained for duration of consent plus 3 years",
        "FINRA-regulated communications retained for minimum 3 years; principal supervision records 6 years",
        "No retroactive modification of communication log records; corrections via append-only audit entries only",
        "Communication archive must be searchable by customer ID, date range, event type, and channel",
        "Backup and recovery: communication logs backed up daily; recovery point objective ≤ 24 hours"
      ],
      auditFrequency: "monthly",
      retentionRequirement: "sox_7_years_minimum",
    },
  }));
  ok("Policy: Records Retention");

  policies.push(await mkPolicy({
    name: "Communication Storm and Abuse Prevention Circuit Breaker",
    domain: "operational_resilience",
    scopeType: "agent",
    scopeId: agentId,
    description: "Prevents communication storms, duplicate sends, and system-generated excessive messaging through circuit breakers, deduplication windows, bulk send approval gates, and anomaly-triggered automatic pauses.",
    policyJson: {
      type: "HARD",
      enforcement: "block",
      rules: [
        "BLOCK: Any bulk send to > 50,000 recipients requires explicit human approval before execution",
        "BLOCK: If system detects same notification ID attempted > 3 times, halt and require manual review",
        "Automatic circuit breaker: pause all non-critical sends if send rate exceeds 10,000 per minute or error rate exceeds 10% in 5-minute window",
        "Deduplication: same customer / same event type / same order may not receive notification within 60-minute window",
        "Hard bounce: immediately remove address from active send lists; do not retry hard-bounced addresses",
        "Spam complaint rate > 0.1%: alert deliverability team and pause affected template pending review",
        "Mass bounce event > 5% in 1-hour window: pause all email sends and initiate ISP investigation protocol",
        "All circuit breaker activations must generate incident ticket and alert on-call operations team"
      ],
      auditFrequency: "real_time",
      retentionRequirement: "incident_records_2_years",
    },
  }));
  ok("Policy: Circuit Breaker");

  return policies;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Golden Dataset
// ═══════════════════════════════════════════════════════════════════════════════
async function createGoldenDataset(agentId) {
  step(6, 8, "Creating Golden Dataset");

  const gds = await mkGDS({
    name: "OTC-AGT-012 Customer Communication Evaluation Dataset",
    description: "Evaluation dataset for the Customer Communication & Notification Agent covering delivery rate validation, personalisation accuracy, timing appropriateness, preference adherence, template rendering correctness, and regulatory compliance scenarios.",
    industry: "enterprise",
    domain: "Order-to-Cash",
    agentId,
    tags: ["customer-communication", "notification", "o2c", "otc-agt-012"],
  });
  ok(`Golden dataset created: ${gds.id}`);

  const testCases = [
    {
      name: "Order Confirmed — Email Notification Eligibility and Rendering",
      input: JSON.stringify({
        event: "order.confirmed",
        customerId: "CUST-00847",
        orderId: "ORD-2024-00847",
        customer: {
          firstName: "Sarah",
          email: "sarah.chen@globaltech.com",
          preferredChannel: "email",
          language: "en-US",
          segment: "SEG-02",
          emailOptIn: true,
          emailConsentDate: "2024-01-15",
          quietHoursEnabled: true,
          quietHoursStart: "21:00",
          quietHoursEnd: "08:00",
          timezone: "America/New_York"
        },
        order: {
          orderNumber: "ORD-2024-00847",
          orderDate: "2024-01-20T14:30:00Z",
          totalAmount: "$1,247.50",
          estimatedShipDate: "2024-01-22",
          lineItems: 3
        },
        eventTimestamp: "2024-01-20T14:30:05Z"
      }),
      expectedOutput: JSON.stringify({
        notificationDispatched: true,
        channelSelected: "email",
        skipReason: null,
        templateId: "tmpl-order-confirmed-email-en-us",
        personalised: true,
        complianceChecks: { canSpam: true, gdpr: true, unsubscribeLink: true, physicalAddress: true },
        deliveryStatus: "sent"
      }),
      reasoning: "Customer has active email opt-in, is within business hours (14:30 EST), segment SEG-02 standard frequency cap not exceeded. Email should be dispatched immediately with order-confirmed template rendered with customer and order data. Compliance checks confirm CAN-SPAM footer and unsubscribe link present.",
      tags: ["order-confirmed", "email", "eligibility", "rendering"],
    },
    {
      name: "SMS Blocked — No TCPA Consent on File",
      input: JSON.stringify({
        event: "shipment.dispatched",
        customerId: "CUST-01122",
        orderId: "ORD-2024-01122",
        customer: {
          firstName: "James",
          phone: "+15551234567",
          email: "james.wilson@example.com",
          preferredChannel: "sms",
          smsOptIn: false,
          smsConsentDate: null,
          emailOptIn: true,
          timezone: "America/Chicago"
        },
        shipment: {
          carrier: "UPS",
          trackingNumber: "1Z999AA10123456784",
          estimatedDeliveryDate: "2024-01-23"
        },
        eventTimestamp: "2024-01-21T10:15:00Z"
      }),
      expectedOutput: JSON.stringify({
        smsBlocked: true,
        smsBlockReason: "NO_TCPA_CONSENT",
        channelFallback: "email",
        emailDispatched: true,
        policyEnforced: "TCPA SMS Consent and Quiet Hours Enforcement"
      }),
      reasoning: "Customer preferred channel is SMS but smsOptIn is false and no TCPA consent is recorded. Policy BLOCKS SMS dispatch. Agent correctly falls back to email channel (customer has emailOptIn=true). This validates the TCPA hard block policy and channel fallback logic.",
      tags: ["sms", "tcpa", "policy-block", "channel-fallback"],
    },
    {
      name: "Quiet Hours Deferral — Push Notification Deferred Not Suppressed",
      input: JSON.stringify({
        event: "invoice.overdue",
        customerId: "CUST-02234",
        orderId: "ORD-2024-02234",
        customer: {
          firstName: "Maria",
          preferredChannel: "push",
          pushOptIn: true,
          quietHoursEnabled: true,
          quietHoursStart: "21:00",
          quietHoursEnd: "08:00",
          timezone: "America/Los_Angeles"
        },
        invoice: { invoiceNumber: "INV-2024-01891", amountDue: "$432.00", dueDate: "2024-01-18" },
        eventTimestamp: "2024-01-20T23:45:00Z"
      }),
      expectedOutput: JSON.stringify({
        notificationDispatched: false,
        deferred: true,
        deferredUntil: "2024-01-21T08:00:00-08:00",
        skipReason: "quiet_hours",
        scheduledChannel: "push"
      }),
      reasoning: "Event arrives at 23:45 PST which is within quiet hours (21:00-08:00). Invoice overdue is MEDIUM urgency — does not bypass quiet hours. Notification is deferred (not suppressed) to next available window at 08:00 PST. This validates quiet hours deferral logic vs. suppression.",
      tags: ["quiet-hours", "deferral", "push", "invoice"],
    },
    {
      name: "GDPR Erasure Request Processing",
      input: JSON.stringify({
        requestType: "gdpr_erasure",
        customerId: "CUST-03891",
        requestSource: "self_service_portal",
        requestedAt: "2024-01-20T09:00:00Z",
        jurisdiction: "EU",
        customerEmail: "franz.muller@example.de"
      }),
      expectedOutput: JSON.stringify({
        acknowledged: true,
        acknowledgedAt: "2024-01-20T09:00:05Z",
        processingDeadline: "2024-02-19T09:00:00Z",
        actionsQueued: [
          "delete_communication_preferences",
          "anonymise_communication_log",
          "remove_from_all_send_lists",
          "cancel_pending_notifications",
          "notify_dpo"
        ],
        auditEntryCreated: true,
        confirmationEmailSent: true
      }),
      reasoning: "GDPR Art.17 erasure request must be acknowledged immediately and completed within 30 days. Agent correctly queues deletion of preferences, anonymisation (not deletion) of communication log to preserve analytics, removal from all send lists, cancellation of pending notifications, DPO notification, and sends confirmation to customer. Validates GDPR compliance flow.",
      tags: ["gdpr", "erasure", "data-privacy", "compliance"],
    },
    {
      name: "Communication Storm Circuit Breaker Activation",
      input: JSON.stringify({
        systemMetrics: {
          sendRatePerMinute: 12500,
          errorRatePct: 0.5,
          windowMinutes: 5,
          activeNotificationQueue: 85000
        },
        alertType: "send_rate_exceeded",
        timestamp: "2024-01-20T15:00:00Z"
      }),
      expectedOutput: JSON.stringify({
        circuitBreakerActivated: true,
        actionsTaken: [
          "paused_non_critical_sends",
          "critical_sends_continue",
          "incident_ticket_created",
          "oncall_team_alerted"
        ],
        queuedForReview: 85000,
        resumeCondition: "send_rate_below_10000_per_minute_for_5_minutes_AND_human_approval"
      }),
      reasoning: "Send rate of 12,500/min exceeds the 10,000/min threshold. Circuit breaker must activate immediately: pause non-critical sends, allow CRITICAL urgency notifications to continue, create incident ticket, and alert on-call team. Validates communication storm prevention policy. Queue of 85,000 pending requires human approval to resume.",
      tags: ["circuit-breaker", "communication-storm", "operational-resilience"],
    },
    {
      name: "Delivery Bounce — Fallback Channel and List Hygiene",
      input: JSON.stringify({
        notificationId: "notif-uuid-00847-01",
        originalChannel: "email",
        deliveryEvent: "hard_bounce",
        bounceType: "hard",
        bounceCode: "550",
        bounceMessage: "5.1.1 The email account does not exist",
        customerId: "CUST-00847",
        email: "old.address@example.com",
        alternativeChannels: { smsOptIn: true, pushOptIn: false },
        phone: "+15559876543",
        tcpaConsentOnFile: true
      }),
      expectedOutput: JSON.stringify({
        hardBounceRecorded: true,
        emailRemovedFromActiveLists: true,
        fallbackChannelSelected: "sms",
        smsDispatched: true,
        listHygieneAction: "hard_bounce_email_suppressed_immediately",
        deliverabilityAlertSent: false,
        bounceRateCheck: "within_threshold"
      }),
      reasoning: "Hard bounce (550 permanent failure) must result in immediate suppression of the bounced address — no retry. Agent correctly removes the address from active send lists and routes to SMS fallback (consent verified). No deliverability alert needed as single bounce is within threshold. Validates bounce handling, list hygiene, and fallback channel selection.",
      tags: ["bounce", "hard-bounce", "list-hygiene", "fallback", "channel-orchestration"],
    },
  ];

  for (const tc of testCases) {
    await mkTC(gds.id, tc);
    ok(`Test case added: ${tc.name}`);
  }

  return gds;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Eval Suite
// ═══════════════════════════════════════════════════════════════════════════════
async function createEvalSuite(agentId, goldenDatasetId) {
  step(7, 8, "Creating Eval Suite");

  const evalSuite = await mkEval({
    name: "OTC-AGT-012 Communication Agent Evaluation Suite",
    description: "Evaluates the Customer Communication & Notification Agent across 6 dimensions: delivery rate validation, personalisation accuracy, timing and SLA appropriateness, preference adherence, template rendering correctness, and regulatory compliance (CAN-SPAM, TCPA, GDPR, CASL). Benchmarks against communication delivery targets and CSAT correlation metrics.",
    agentId,
    goldenDatasetId,
    evalType: "functional",
    metrics: [
      { name: "Notification Eligibility Accuracy", description: "Correctly determines eligible/ineligible for each event+customer combination", weight: 0.20 },
      { name: "Channel Selection Accuracy", description: "Routes to correct channel per preference, urgency, and consent rules", weight: 0.15 },
      { name: "Regulatory Policy Compliance", description: "Blocks non-compliant sends (TCPA, CAN-SPAM, GDPR) 100% of the time", weight: 0.25 },
      { name: "Personalisation Accuracy", description: "Correct customer name, order details, status, and locale in rendered messages", weight: 0.15 },
      { name: "Timing Appropriateness", description: "Notification sent within SLA of triggering event; quiet hours respected", weight: 0.10 },
      { name: "Fallback and Bounce Handling", description: "Correct fallback channel selection and list hygiene on delivery failure", weight: 0.15 },
    ],
    passingThreshold: 0.90,
    tags: ["otc-agt-012", "communication", "notification", "compliance", "channel-routing"],
  });

  ok(`Eval suite created: ${evalSuite.id}`);
  return evalSuite;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — Save IDs
// ═══════════════════════════════════════════════════════════════════════════════
function saveIds(ids) {
  step(8, 8, "Saving DEV IDs to scripts/otc-agt-012-dev-ids.json");
  writeFileSync("scripts/otc-agt-012-dev-ids.json", JSON.stringify(ids, null, 2));
  ok("IDs saved to scripts/otc-agt-012-dev-ids.json");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  OTC-AGT-012  Customer Communication & Notification Agent        ║");
  console.log("║  DEV Environment Provisioning                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Org ID   : ${ORG_ID}`);

  try {
    const skills    = await createSkills();
    const kb        = await createKnowledgeBase();
    const agent     = await createAgent(skills, kb);
    const kbLink    = await linkKBToAgent(agent.id, kb.id);
    const policies  = await createPolicies(agent.id);
    const gds       = await createGoldenDataset(agent.id);
    const evalSuite = await createEvalSuite(agent.id, gds.id);

    const ids = {
      agentId:        agent.id,
      agentName:      agent.name,
      knowledgeBaseId: kb.id,
      skillIds:       skills.map((s, i) => ({ name: s.name, id: s.id, loadOrder: i })),
      policyIds:      policies.map(p => ({ name: p.name, id: p.id })),
      goldenDatasetId: gds.id,
      evalSuiteId:    evalSuite.id,
      createdAt:      new Date().toISOString(),
      environment:    "dev",
      orgId:          ORG_ID,
    };

    saveIds(ids);

    console.log("\n╔══════════════════════════════════════════════════════════════════╗");
    console.log("║  PROVISIONING COMPLETE                                           ║");
    console.log("╚══════════════════════════════════════════════════════════════════╝");
    console.log(`  Agent ID      : ${agent.id}`);
    console.log(`  KB ID         : ${kb.id}`);
    console.log(`  Skills        : ${skills.length}`);
    console.log(`  Policies      : ${policies.length}`);
    console.log(`  Test Cases    : 6`);
    console.log(`  Eval Suite ID : ${evalSuite.id}`);
    console.log(`\n  View agent at: http://localhost:5000/agents/${agent.id}`);
    console.log(`\n  Run migration to PROD: node scripts/migrate-otc-agt-012-to-prod.js`);

  } catch (err) {
    console.error("\n✗ PROVISIONING FAILED:", err.message);
    process.exit(1);
  }
}

main();
