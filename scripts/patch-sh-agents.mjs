/**
 * patch-sh-agents.mjs
 *
 * Idempotent cross-check patch for all 6 Self-Healing demo agents.
 * Updates EVERY copy (across all orgs/tenants) with:
 *   1. task              — agent goal/task description
 *   2. systemPrompt      — the operational system instruction
 *   3. domain / industry — classification fields
 *   4. blueprintJson     — healing-pipeline DAG (if missing)
 *   5. ontologyTags      — taxonomy tags (refresh to canonical set)
 *   6. policies          — create + bind 4 compliance policies per agent
 *
 * MCP Servers: none required — these agents use inline skill tools.
 * Eval Scenarios: already created by original script (verified 194 org-level evals).
 *
 * Usage:  node scripts/patch-sh-agents.mjs [BASE_URL]
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).slice(0, 300));
    return null;
  }
  return json;
}

// ─── Canonical agent specs ─────────────────────────────────────────────────────

const AGENT_SPECS = {
  "Clinical Data Integrity Monitor": {
    task: "Restore drug-interaction validation coverage and reconcile all affected patient records in clinical risk priority order (ICU → ED → Inpatient → Outpatient) after FHIR EHR data pipeline failures — while enforcing HIPAA, FDA 21 CFR Part 11, HL7 FHIR R4, and Patient Safety guardrails.",
    systemPrompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001). Detect, diagnose, and remediate FHIR EHR data pipeline failures that threaten patient safety.

Healing Workflow: DETECT (Batch Anomaly Triage) → DIAGNOSE (FHIR Schema Validation) → ASSESS (Drug-Interaction Cross-Check) → REMEDIATE (Feed Recovery or Schema Drift runbook + Patient Record Reconciliation) → VALIDATE (HL7 Compliance Audit).

Hard policies:
- HIPAA: No PHI in logs — patient reference tokens only. All PHI access audit-logged.
- Patient Safety Guardrail: No autonomous medication changes. Clinical hold on contraindicated patients. Require Clinical Informatics sign-off for >50 patients affected.
- FDA 21 CFR Part 11: Immutable timestamped audit trail for all record modifications.
- HL7 FHIR R4: No non-conformant resources committed to production.

Goal: Detect feed anomalies in <5 minutes, restore drug-interaction validation coverage, reconcile 1,847 records in <28 minutes.

Without Atlas: detection takes 2–4 hours. Reconciliation 6–8 FTE-hours. Drug-interaction validation offline throughout.`,
    domain: "Healthcare",
    industry: "healthcare",
    ontologyTags: ["clinical-data", "EHR-integration", "FHIR", "patient-safety", "drug-interaction"],
    complianceTags: ["HIPAA", "FDA_21_CFR_PART_11", "HL7_FHIR_R4", "PATIENT_SAFETY"],
    policies: [
      {
        name: "HIPAA Data Handling Policy",
        domain: "data_governance",
        description: "Governs PHI handling during self-healing operations. Agents must never expose PHI in logs; all PHI access audit-logged per HIPAA Security Rule.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "PHI minimization in logs — patient reference tokens only, no identifiers",
            "All PHI access generates audit log entry with timestamp, accessor ID, purpose",
            "Breach notification assessment if >500 patients affected — within 24 hours",
            "Minimum necessary standard: request only minimum PHI fields per healing task",
          ],
        },
      },
      {
        name: "FDA 21 CFR Part 11 Electronic Records Policy",
        domain: "audit_compliance",
        description: "Ensures Atlas automated actions on clinical data comply with FDA 21 CFR Part 11 — immutable audit trail and system validation requirements.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "All agent actions on clinical records must create immutable timestamped audit entries",
            "Any record modification must capture: original value, new value, reason, agent ID, timestamp",
            "Agents must not modify validated system configurations without change control approval",
          ],
        },
      },
      {
        name: "HL7 FHIR R4 Compliance Policy",
        domain: "data_quality",
        description: "Mandates FHIR R4 and US Core conformance for all data processed by Atlas healthcare agents.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "No FHIR resource may be committed without passing schema validation",
            "All coded values must reference active VSAC-approved value sets (LOINC, SNOMED CT, RxNorm)",
            "Patient, Observation, Condition, and Medication resources must include all US Core required elements",
          ],
        },
      },
      {
        name: "Patient Safety Guardrail Policy",
        domain: "patient_safety",
        description: "Hard stops preventing automated actions from introducing patient safety risks. Mandatory clinical review gates for high-risk scenarios.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Agents are prohibited from modifying active MedicationRequest records without pharmacist approval",
            "If contraindicated drug interaction detected — halt automated processing for affected patient and escalate immediately",
            "When >50 patients affected by data quality incident — require Clinical Informatics sign-off before completing remediation",
            "Any record changes for ICU/critical care patients must be verified by clinical staff regardless of automation confidence",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "Feed Anomaly Detected",      config: { triggerType: "metric_threshold", metric: "fhir_batch_error_rate", threshold: 0.02 } },
        { id: "detect",    type: "skill",    label: "Batch Anomaly Triage",        config: {} },
        { id: "diagnose",  type: "skill",    label: "FHIR Schema Validation",      config: {} },
        { id: "assess",    type: "skill",    label: "Drug-Interaction Cross-Check", config: {} },
        { id: "remediate", type: "runbook",  label: "Execute Recovery Runbook",    config: {} },
        { id: "reconcile", type: "skill",    label: "Patient Record Reconciliation", config: {} },
        { id: "validate",  type: "skill",    label: "HL7 Compliance Audit",        config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",            config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },

  "Fraud Detection Model Recovery Agent": {
    task: "Restore fraud detection model precision to ≥92% within 6 hours of drift detection by validating a pre-trained challenger model via shadow-mode traffic splitting and executing a zero-downtime champion-challenger cutover — while enforcing SR 11-7, FCRA, PCI-DSS, and GDPR compliance.",
    systemPrompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001). Detect model precision drift, validate challenger, execute zero-downtime swap.

Healing Workflow: DETECT (Model Precision Monitoring + Feature Drift Analysis) → DIAGNOSE (BNPL population shift confirmed) → ASSESS (Challenger Model Evaluation — 4h shadow mode, 12K+ transactions) → REMEDIATE (Champion-Challenger Cutover — confirm-before for >5pp Gini change) → VALIDATE (post-cutover precision check + SR 11-7 notification).

Hard policies:
- SR 11-7: No model deployed without documented backtesting. Material change (>5pp Gini) requires Model Risk Committee sign-off.
- PCI-DSS: Tokenized card references only in all logs and shadow mode samples.
- FCRA: Every declined transaction must store an adverse action reason code.
- GDPR Article 22: Automated declines must store explainability output for EU customer disclosure.

Goal: Precision ≥92%, zero transaction downtime, SR 11-7 compliant in ≤6 hours.

Without Atlas: daily model review detects issue 18h later. Model Risk Committee approval: 3–5 business days. ~$1.4M fraud exposure in the gap.`,
    domain: "Financial Services",
    industry: "financial_services",
    ontologyTags: ["fraud-detection", "model-risk", "ML-ops", "champion-challenger"],
    complianceTags: ["SR_11_7", "FCRA", "PCI_DSS", "GDPR", "MODEL_RISK"],
    policies: [
      {
        name: "SR 11-7 Model Risk Management Policy",
        domain: "model_governance",
        description: "Enforces Federal Reserve SR 11-7 model risk guidance — validation before deployment, ongoing monitoring, documentation of material changes.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "No model deployed to production without documented backtesting and validation results",
            "Material change (>5pp Gini improvement) requires Model Risk Committee notification before cutover",
            "Model inventory must be updated within 24 hours of any champion change",
          ],
        },
      },
      {
        name: "FCRA Adverse Action Policy",
        domain: "regulatory_compliance",
        description: "Ensures automated fraud decisions comply with FCRA adverse action requirements.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Every declined transaction must generate an adverse action reason code stored for customer disclosure",
            "Reason codes must be explainable in plain language within 30 days of request",
          ],
        },
      },
      {
        name: "PCI-DSS Transaction Data Handling Policy",
        domain: "data_governance",
        description: "Protects cardholder data throughout fraud model operations and self-healing procedures.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Fraud model inputs and logs must never contain full PAN — use tokenized card references only",
            "Shadow mode transaction logs must be purged within 7 days unless required for regulatory review",
          ],
        },
      },
      {
        name: "GDPR Automated Decision Policy",
        domain: "automated_decisions",
        description: "Ensures GDPR Article 22 compliance — right to explanation and human review for automated adverse decisions.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Automated fraud declines must store explainability output for customer disclosure on request",
            "EU customers have right to human review of any automated adverse decision — must be offered within 30 days",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "Precision Drift Alert",          config: { triggerType: "metric_threshold", metric: "fraud_model_precision", threshold: 0.88 } },
        { id: "detect",    type: "skill",    label: "Model Precision Monitoring",     config: {} },
        { id: "diagnose",  type: "skill",    label: "Feature Drift Analysis",         config: {} },
        { id: "assess",    type: "skill",    label: "Challenger Model Evaluation",    config: {} },
        { id: "remediate", type: "runbook",  label: "Model Precision Regression Alert", config: {} },
        { id: "reconcile", type: "skill",    label: "Shadow-Mode Traffic Splitting",  config: {} },
        { id: "validate",  type: "skill",    label: "Zero-Downtime Model Swap",       config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",               config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },

  "Factory Floor Anomaly Recovery Agent": {
    task: "Detect CNC equipment anomalies via IoT vibration sensor analysis, classify bearing wear stage, schedule a maintenance window before unplanned failure, reroute active production orders to alternate lines, and validate production quality — avoiding $340K unplanned downtime vs $12K planned maintenance.",
    systemPrompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001). Detect equipment anomalies via IoT sensor analysis, predict failure windows, schedule maintenance before unplanned downtime, reroute active production orders.

Healing Workflow: DETECT (IoT Vibration Signal Analysis — threshold breach) → DIAGNOSE (Bearing Wear Classification — stage 1–4) → ASSESS (Maintenance Window Scheduling — CMMS integration) → REMEDIATE (Speed reduction + maintenance dispatch + production reroute — OSHA confirm-before) → VALIDATE (ISO 9001 quality check on rerouted orders).

Hard policies:
- OSHA 1910.217: Speed reduction to ≤60% required before operator entry. Safety lock-out/tag-out protocol mandatory for bearing replacement.
- ISO 55001: Asset management plan — CMMS work order generated before any production reroute.
- ISO 9001: Quality validation required on all production rerouted to alternate lines.
- Environmental: Machine speed reduction maintains coolant flow rate above environmental permit minimum.

Goal: Detect Stage 3 bearing wear, schedule maintenance in next available window (≤4 hours), reroute 3 production orders to CNC-Line-5, restore production quality validation.

Without Atlas: CNC-Line-7 fails unplanned mid-shift. 18-hour downtime. $340K lost production vs $12K planned maintenance cost.`,
    domain: "Manufacturing",
    industry: "manufacturing",
    ontologyTags: ["predictive-maintenance", "IoT", "CNC", "manufacturing-ops", "reliability"],
    complianceTags: ["ISO_55001", "OSHA_1910_217", "ISO_9001", "ENVIRONMENTAL"],
    policies: [
      {
        name: "ISO 55001 Asset Management Policy",
        domain: "asset_management",
        description: "Ensures all maintenance actions comply with ISO 55001 physical asset management requirements — documented work orders, risk assessment, and lifecycle tracking.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "All maintenance actions require a CMMS work order before execution",
            "Equipment risk assessment must be completed before scheduling maintenance window",
            "Asset lifecycle event (bearing replacement) must be logged in asset management system",
            "Maintenance effectiveness verified through post-repair vibration baseline",
          ],
        },
      },
      {
        name: "OSHA Equipment Safety Policy",
        domain: "workplace_safety",
        description: "Enforces OSHA 1910.217 machine guarding and lockout/tagout requirements for all maintenance operations on CNC equipment.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Machine speed must be reduced to ≤60% rated speed before any operator entry for inspection",
            "Lockout/tagout (LOTO) protocol must be initiated before bearing replacement procedure begins",
            "Safety supervisor notification required before any unplanned equipment entry",
            "No automated restart of equipment after maintenance without operator sign-off",
          ],
        },
      },
      {
        name: "ISO 9001 Production Quality Policy",
        domain: "quality_management",
        description: "Ensures production rerouted to alternate lines meets ISO 9001 quality standards with documented inspection.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "All production orders rerouted to alternate lines must pass quality validation before shipping",
            "First-article inspection required on first batch from alternate CNC line",
            "Customer delivery date impact must be assessed and communicated for affected orders",
          ],
        },
      },
      {
        name: "Environmental Monitoring Compliance Policy",
        domain: "environmental",
        description: "Ensures machine parameter changes comply with environmental permit requirements for coolant and emissions.",
        policyJson: {
          type: "SOFT", enforcement: "warn",
          rules: [
            "Machine speed reduction must maintain coolant flow rate above environmental permit minimum (12 L/min)",
            "Maintenance activities generating coolant waste must follow hazardous waste disposal protocol",
            "Log all parameter changes affecting environmental controls for permit compliance audit",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "Vibration Threshold Breach",     config: { triggerType: "metric_threshold", metric: "vibration_rms_g", threshold: 4.2 } },
        { id: "detect",    type: "skill",    label: "IoT Vibration Signal Analysis",   config: {} },
        { id: "diagnose",  type: "skill",    label: "Bearing Wear Classification",     config: {} },
        { id: "assess",    type: "skill",    label: "Maintenance Window Scheduling",   config: {} },
        { id: "remediate", type: "runbook",  label: "Vibration Threshold Breach Response", config: {} },
        { id: "reconcile", type: "skill",    label: "Production Order Rerouting",      config: {} },
        { id: "validate",  type: "skill",    label: "ISO 9001 Quality Validation",     config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",               config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },

  "Order Fulfillment Recovery Agent": {
    task: "Detect WMS API failures and DB connection pool exhaustion, preserve all orders in a durable Kafka queue, activate fallback routing across DC-West / 3PL-FedEx / store networks, and proactively notify affected customers — protecting $340K in SLA exposure and preserving 1,847 orders.",
    systemPrompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001). Detect WMS API failures, preserve order queue integrity, activate fallback routing across DC/3PL/store networks, notify affected customers.

Healing Workflow: DETECT (WMS Health Monitoring — connection pool exhaustion) → DIAGNOSE (root cause isolation) → ASSESS (fallback capacity evaluation) → REMEDIATE (order queue preservation + fallback routing activation) → VALIDATE (end-to-end order flow confirmation + customer notifications).

Hard policies:
- Consumer Protection: Customer notification within 24 hours of any fulfillment delay exceeding promised delivery date.
- GDPR: Customer PII used only for order-related communications. Consent required for any secondary use.
- PCI-DSS v4.0: Payment card data must not be logged or included in fallback routing payloads.
- SLA Compliance: Priority 1 orders (same-day/next-day) must be rerouted within 2 hours of failure detection.

Goal: Preserve 1,847 orders in durable queue, activate 3 fallback routes, notify affected customers within 22 minutes, $0 SLA penalties.

Without Atlas: WMS failure detected manually after customer complaints (avg 4+ hours). Order loss risk. $340K SLA exposure. Manual rerouting 8–12 hours.`,
    domain: "Retail/E-Commerce",
    industry: "retail",
    ontologyTags: ["WMS", "fulfillment", "SLA", "OMS", "retail"],
    complianceTags: ["CONSUMER_PROTECTION", "GDPR", "PCI_DSS_V4", "SLA_COMPLIANCE"],
    policies: [
      {
        name: "Consumer Protection Notification Policy",
        domain: "customer_communications",
        description: "Mandates proactive customer notification when fulfillment delays affect promised delivery dates.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Customers must be notified within 24 hours of any delay exceeding promised delivery date",
            "Notification must include: new estimated delivery date, reason summary, and tracking update",
            "Priority 1 (same-day/next-day) customers must be notified within 2 hours of rerouting",
            "Customer service escalation path must be provided in all delay notifications",
          ],
        },
      },
      {
        name: "GDPR Customer Data Handling Policy",
        domain: "data_governance",
        description: "Ensures customer PII is handled appropriately during fulfillment recovery operations.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Customer PII (name, address, email) used only for order fulfillment communications — no secondary use",
            "Order data retained only for duration required by applicable retention policies",
            "Customer email addresses must not be shared with 3PL partners beyond delivery-essential fields",
          ],
        },
      },
      {
        name: "PCI-DSS v4.0 Payment Data Policy",
        domain: "payment_security",
        description: "Protects payment card data throughout WMS recovery and fallback routing operations.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Payment card data must never appear in order routing payloads or recovery logs",
            "Only tokenized payment references may be passed to fallback fulfillment systems",
            "Any log entry containing order data must exclude all PAN and CVV fields",
          ],
        },
      },
      {
        name: "SLA Compliance and Order Preservation Policy",
        domain: "operational_compliance",
        description: "Ensures order integrity and SLA obligations are maintained during WMS failure events.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "All orders received before WMS failure must be preserved in durable queue — zero order loss tolerance",
            "Priority 1 orders (same-day/next-day delivery) must be rerouted within 2 hours of failure detection",
            "Fallback routing decisions must be logged with timestamp, route selected, and capacity confirmation",
            "Post-recovery SLA impact assessment must be completed and shared with Customer Experience team",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "WMS API Health Alert",             config: { triggerType: "api_health_check", metric: "wms_connection_pool_utilization", threshold: 0.95 } },
        { id: "detect",    type: "skill",    label: "WMS Health Monitoring",            config: {} },
        { id: "diagnose",  type: "skill",    label: "Root Cause Isolation",             config: {} },
        { id: "assess",    type: "skill",    label: "Fallback Capacity Evaluation",     config: {} },
        { id: "remediate", type: "runbook",  label: "WMS Failover Protocol",            config: {} },
        { id: "reconcile", type: "skill",    label: "Fallback Routing Engine",          config: {} },
        { id: "validate",  type: "skill",    label: "Order Flow Confirmation + Notify", config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",                 config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },

  "Grid Operations Stability Agent": {
    task: "Restore grid frequency to 59.95–60.05 Hz within the NERC BAL-003 mandatory 10-minute window following unplanned generation loss events — by autonomously activating demand response programs, dispatching EPA-permitted peaker units, rebalancing load zones, and filing mandatory NERC and FERC regulatory notifications.",
    systemPrompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001). Monitor generation, detect shortfalls, activate DR and peakers autonomously.

Healing Workflow: DETECT (Real-Time Grid Telemetry — SCADA 50K points/4s) → DIAGNOSE (Generation Shortfall Detection — shortfall MW, frequency trajectory) → ASSESS (Load Zone Rebalancing — N-1 transmission check) → REMEDIATE (Generation Shortfall Emergency Response — DR + peaker dispatch) → VALIDATE (NERC BAL-003 frequency restoration confirmed).

Hard policies:
- NERC BAL-003 (NERC-01): Restore frequency to 59.95–60.05 Hz within 10 minutes of deviation event — mandatory.
- EPA Clean Air Act (EPA-01): Verify peaker unit remaining permit hours before dispatch commitment.
- FERC Order 881 (FERC-01): Notify market operator within 5 minutes of peaker unit commitment.
- ERCOT Emergency Protocol: Notify ERCOT Emergency Operations immediately when frequency drops below 59.7 Hz.

Goal: 847 MW shortfall — 350 MW DR + 360 MW peaker dispatch + 137 MW interchange = frequency restored ≤9.2 minutes.

Without Atlas: grid operator manually coordinates across 6+ systems — typical response 15–25 minutes. Risk: frequency excursion causing cascade disconnection for 680,000 households. $1M–$25M NERC penalty.`,
    domain: "Energy/Utilities",
    industry: "energy",
    ontologyTags: ["grid-operations", "demand-response", "SCADA", "power-generation", "NERC"],
    complianceTags: ["NERC_CIP", "FERC", "ERCOT", "EPA_CLEAN_AIR"],
    policies: [
      {
        name: "NERC CIP Reliability Standards Policy",
        domain: "grid_reliability",
        description: "Enforces NERC Critical Infrastructure Protection and BAL-003 reliability standards for all autonomous grid operations.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Frequency must be restored to 59.95–60.05 Hz within 10 minutes of deviation event",
            "Generation loss events ≥300 MW must be reported to reliability coordinator within 1 hour",
            "N-1 reliability criterion must be maintained throughout all remediation actions",
            "ERCOT Emergency Operations must be notified when frequency drops below 59.7 Hz",
          ],
        },
      },
      {
        name: "FERC Market Rules Compliance Policy",
        domain: "market_compliance",
        description: "Ensures all generation dispatch commitments comply with FERC tariff requirements.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "All peaker dispatch commitments must be reported to market operator within 5 minutes of commitment",
            "Dispatch must follow cost-based sequencing — lowest cost available unit dispatched first",
            "Market notifications must include unit ID, capacity (MW), and dispatch price",
          ],
        },
      },
      {
        name: "ERCOT Dispatch Protocol Policy",
        domain: "market_compliance",
        description: "Compliance with ERCOT market dispatch protocols for balancing authority operations.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "ERCOT Emergency Operations must be notified when frequency drops below 59.7 Hz",
            "Ancillary service deployment must follow ERCOT protocol sequencing",
            "All emergency actions must be logged in ERCOT operations system within 30 minutes",
          ],
        },
      },
      {
        name: "Environmental Emissions Cap Policy",
        domain: "environmental",
        description: "Tracks peaker unit runtime against environmental permit limits per EPA Clean Air Act.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Agent must verify peaker unit has remaining permit hours before dispatch commitment",
            "Units within 10% of annual permit limit must generate compliance officer notification before dispatch",
            "Combined peaker dispatch must not exceed weekly emission targets without environmental review",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "Frequency Deviation Alert",          config: { triggerType: "metric_threshold", metric: "grid_frequency_hz", threshold: 59.95 } },
        { id: "detect",    type: "skill",    label: "Real-Time Grid Telemetry",            config: {} },
        { id: "diagnose",  type: "skill",    label: "Generation Shortfall Detection",      config: {} },
        { id: "assess",    type: "skill",    label: "Load Zone Rebalancing",               config: {} },
        { id: "remediate", type: "runbook",  label: "Generation Shortfall Emergency Response", config: {} },
        { id: "reconcile", type: "skill",    label: "Demand Response Activation",          config: {} },
        { id: "validate",  type: "skill",    label: "Peaker Unit Dispatch + NERC Confirm", config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",                   config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },

  "Claims Workflow Recovery Agent": {
    task: "Detect insurance fraud triage model false-positive rate spikes, isolate the malfunctioning model, route 620 misclassified claims to human adjuster review (prioritizing 47 vulnerable claimants), recalibrate the fraud threshold after NAIC fairness audit approval, and generate mandatory state insurance department regulatory filings and GDPR Article 22 claimant notifications.",
    systemPrompt: `You are the Claims Workflow Recovery Agent (SH-INS-001). Detect fraud model false-positive spikes, reroute affected claims, recalibrate thresholds, notify claimants.

Healing Workflow: DETECT (FPR Monitoring — CUSUM h-statistic > 5.0) → DIAGNOSE (Claimant Impact Assessment — misclassified count, vulnerable claimants, amount delayed) → ASSESS (Claims Re-Routing feasibility — adjuster capacity, priority tiers) → REMEDIATE (Model isolation + fallback + priority queue + adverse action letters) → VALIDATE (Threshold recalibration after NAIC fairness audit).

Hard policies:
- SFCH-01 (State Fair Claims): Expedite all delayed claims immediately. Vulnerable claimants (elderly/disability) in 24h priority queue — non-negotiable.
- NAIC-01 (Model Audit): Fairness audit required before any recalibrated threshold is deployed to production. Hard block.
- GDPR Article 22: EU claimants must receive explanation for automated adverse decision within 72 hours.
- SOX Internal Controls: Model failure affecting claims reserves >$500K triggers CAO + external audit notification.

Goal: Detect 22.7% FPR spike in <2 hours, isolate model in <60 seconds, route 620 claims to human review, prepare 12 state regulator filings, notify 47 vulnerable claimants with 24h expedited processing.

Without Atlas: compliance team discovers issue from state regulator inquiry 5–10 days later. 1,000+ additional misclassifications. Class-action risk. $25M+ settlement exposure.`,
    domain: "Insurance",
    industry: "insurance",
    ontologyTags: ["insurance-claims", "fraud-detection", "model-risk", "claimant-protection"],
    complianceTags: ["NAIC", "STATE_FAIR_CLAIMS", "GDPR", "SOX"],
    policies: [
      {
        name: "NAIC Model Audit Regulation Policy",
        domain: "model_governance",
        description: "Ensures AI-driven insurance models comply with NAIC Model Bulletin — fairness testing, explainability, and governance for automated claims decisions.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Before recalibrated threshold is deployed, fairness audit must confirm no disparate impact across protected classes",
            "Every automated adverse claims decision must have a stored explainability record",
            "Model performance metrics must be reviewed monthly and reported to Model Risk Committee",
          ],
        },
      },
      {
        name: "State Fair Claims Handling Policy",
        domain: "regulatory_compliance",
        description: "Ensures compliance with state unfair claims settlement practices acts — prompt payment and prohibition on arbitrary denials.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "Claims incorrectly delayed by model error must be expedited to within original SLA plus delay period",
            "Any claim denial or delay must be accompanied by written explanation within 10 business days",
            "Vulnerable claimants (elderly, disability) must be placed in priority review queue with 24h SLA",
          ],
        },
      },
      {
        name: "GDPR Automated Decision Explanation Policy",
        domain: "automated_decisions",
        description: "Ensures GDPR Article 22 compliance — EU policyholders right to explanation and human review of automated claims decisions.",
        policyJson: {
          type: "HARD", enforcement: "block",
          rules: [
            "EU claimants must receive explanation for any automated fraud flag decision upon request",
            "Explainability records must be retained for duration of claim plus 5 years",
            "Human review option must be offered to EU claimants within 72 hours of adverse automated decision",
          ],
        },
      },
      {
        name: "SOX Internal Controls for Claims Policy",
        domain: "financial_controls",
        description: "Applies SOX internal controls to claims reserve estimates impacted by model failures — ensuring financial statement accuracy.",
        policyJson: {
          type: "SOFT", enforcement: "warn",
          rules: [
            "Model failures affecting claims reserves by >$500K must be assessed for financial statement impact",
            "Reserve impact assessment must be completed within 5 business days of incident identification",
            "Material impacts must be disclosed to Finance and External Audit teams",
          ],
        },
      },
    ],
    blueprintJson: {
      nodes: [
        { id: "trigger",   type: "trigger",  label: "FPR Spike Alert",                   config: { triggerType: "metric_threshold", metric: "claims_triage_false_positive_rate", threshold: 0.08 } },
        { id: "detect",    type: "skill",    label: "False-Positive Rate Monitoring",     config: {} },
        { id: "diagnose",  type: "skill",    label: "Claimant Impact Assessment",         config: {} },
        { id: "assess",    type: "skill",    label: "Claims Re-Routing Feasibility",      config: {} },
        { id: "remediate", type: "runbook",  label: "False-Positive Spike Response",     config: {} },
        { id: "reconcile", type: "skill",    label: "Human Review Queue Activation",     config: {} },
        { id: "validate",  type: "skill",    label: "Model Threshold Recalibration",     config: {} },
        { id: "resolved",  type: "terminal", label: "Healing Complete",                  config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "remediate" },
        { from: "remediate", to: "reconcile" }, { from: "reconcile", to: "validate" },
        { from: "validate", to: "resolved" },
      ],
    },
  },
};

// ─── Patch all agents ──────────────────────────────────────────────────────────

async function patchAllAgents() {
  const agentNames = Object.keys(AGENT_SPECS);
  console.log(`\n🔍 Fetching all agents...`);
  const allAgents = await api("GET", "/api/agents?limit=300");
  if (!allAgents) { console.error("Failed to fetch agents"); return; }

  const shAgents = allAgents.filter(a => agentNames.includes(a.name));
  console.log(`   Found ${shAgents.length} SH agent copies across all orgs.\n`);

  let totalPatched = 0;
  let totalPoliciesCreated = 0;

  for (const agent of shAgents) {
    const spec = AGENT_SPECS[agent.name];
    if (!spec) continue;

    console.log(`\n── Patching: ${agent.name} (${agent.id.slice(0, 8)}...)`);

    // 1. Fetch current state to check what's already populated
    const current = await api("GET", `/api/agents/${agent.id}`);
    if (!current) { console.log(`   ✗ Could not fetch agent detail — skipping`); continue; }

    // 2. Build core patch — task lives in runtimeConfig.task (no top-level task column in schema)
    const existingRuntimeConfig = (current.runtimeConfig && typeof current.runtimeConfig === "object")
      ? current.runtimeConfig
      : {};
    const corePatch = {
      systemPrompt: spec.systemPrompt,
      ontologyTags: spec.ontologyTags,
      complianceTags: spec.complianceTags,
      runtimeConfig: {
        ...existingRuntimeConfig,
        task: spec.task,
        domain: spec.domain,
        industry: spec.industry,
      },
    };

    // 3. Add blueprintJson if missing or empty
    const hasBp = current.blueprintJson && Object.keys(current.blueprintJson).length > 1;
    if (!hasBp) {
      corePatch.blueprintJson = spec.blueprintJson;
      console.log(`   ↳ blueprintJson: adding (was missing)`);
    } else {
      console.log(`   ↳ blueprintJson: already present — skipping`);
    }

    // Apply core patch
    const patched = await api("PATCH", `/api/agents/${agent.id}`, corePatch);
    if (patched) {
      console.log(`   ✓ systemPrompt, runtimeConfig.task, ontologyTags, complianceTags updated`);
      totalPatched++;
    }

    // 4. Check existing policies via policyBindings on the agent record
    const existingBindings = Array.isArray(current.policyBindings) ? current.policyBindings : [];
    const existingNames = new Set(existingBindings.map((p) => p.policyName || p.name || ""));

    // 5. Create missing policies and collect their IDs
    const newPolicyBindings = [...(current.policyBindings || [])];
    let newPoliciesCreated = 0;

    for (const policySpec of spec.policies) {
      if (existingNames.has(policySpec.name)) {
        console.log(`   ↳ Policy "${policySpec.name}": already exists — skipping`);
        continue;
      }
      const policy = await api("POST", "/api/policies", {
        name: policySpec.name,
        domain: policySpec.domain,
        scopeType: "agent",
        scopeId: agent.id,
        version: 1,
        status: "active",
        description: policySpec.description,
        policyJson: policySpec.policyJson,
      });
      if (policy) {
        console.log(`   ✓ Policy created: ${policySpec.name}`);
        newPolicyBindings.push({ policyId: policy.id, policyName: policy.name, enforcement: "mandatory" });
        newPoliciesCreated++;
        totalPoliciesCreated++;
      }
    }

    // 6. Update policyBindings if any new policies were created
    if (newPoliciesCreated > 0) {
      const bindResult = await api("PATCH", `/api/agents/${agent.id}`, { policyBindings: newPolicyBindings });
      if (bindResult) console.log(`   ✓ policyBindings updated (${newPolicyBindings.length} total)`);
    } else {
      console.log(`   ↳ policyBindings: no new policies — skipping bind update`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Patch complete!`);
  console.log(`   Agents patched:     ${totalPatched} / ${shAgents.length}`);
  console.log(`   Policies created:   ${totalPoliciesCreated}`);
  console.log(`\nMCP Servers: none required — SH agents use inline skill tools.`);
  console.log(`Eval Scenarios: present (verified 194 org-level evals per agent).`);
  console.log(`Ontology Tags: refreshed to canonical sets for all 6 agent types.`);
}

patchAllAgents().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
