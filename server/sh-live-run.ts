/**
 * Self-Healing Live-Run SSE Handler
 * GET /demo-api/sh-healing/stream?scenario=healthcare|financial|manufacturing|retail|energy|insurance
 *
 * Runs the real SH agent through 4 healing phases, emitting live SSE events at each step.
 * Scripted healing-step events (skill invocations, runbook triggers, policy checks)
 * are emitted while the LLM thinks, creating a rich real-time trace.
 */

import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive } from "./agent-runtime";

// ─── Scenario definitions ─────────────────────────────────────────────────────

export interface SHPhase {
  key: string;
  label: string;
  icon: string;
  prompt: string;
  fallbackSummary: string;
  skillsInvoked: Array<{ name: string; finding: string; duration: string }>;
  runbooksTriggered: Array<{ name: string; result: string }>;
  policiesChecked: Array<{ name: string; rule: string; outcome: string }>;
}

export interface SHScenarioDef {
  key: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  industry: string;
  incidentTitle: string;
  incidentSeverity: "critical" | "high";
  incidentType: string;
  incidentSummary: string;
  triggerMetric: { label: string; before: string; after: string; unit: string };
  phases: SHPhase[];
  resolution: {
    headline: string;
    autonomousActions: string[];
    metricsRestored: Array<{ label: string; value: string }>;
  };
}

const SH_SCENARIOS: Record<string, SHScenarioDef> = {
  healthcare: {
    key: "healthcare",
    agentId: "5db8101f-4ea0-4c10-ae54-2038081a5e0a",
    agentName: "Clinical Data Integrity Monitor",
    agentCode: "SH-HEALTH-001",
    industry: "Healthcare",
    incidentTitle: "FHIR EHR Feed Schema Drift Detected",
    incidentSeverity: "critical",
    incidentType: "Schema Drift",
    incidentSummary:
      "EHR vendor pushed undocumented RxNorm code system version change at 02:17 UTC. FHIR MedicationRequest resources now contain unrecognized code system URIs — drug-interaction validation silently failing for 847 inpatient records across 3 hospitals.",
    triggerMetric: { label: "Drug-Interaction Validation", before: "99.8%", after: "0%", unit: "on 847 records" },
    phases: [
      {
        key: "detect",
        label: "Detect Anomaly",
        icon: "activity",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001), an Atlas AI agent responsible for HIPAA-compliant EHR data integrity.

INCIDENT: At 02:17 UTC, the EHR vendor pushed an undocumented RxNorm code system version change. FHIR MedicationRequest resources now contain unrecognized code system URIs. Drug-interaction validation is silently failing for 847 inpatient records across 3 hospitals.

Analyze this schema drift event. Confirm scope, clinical risk, and HIPAA exposure. Respond as the Atlas monitoring agent.`,
        fallbackSummary: "FHIR MedicationRequest schema drift confirmed. 847 inpatient records affected. Drug-interaction validation at 0% — critical patient safety risk. HIPAA Breach Notification triggered. Atlas detection: 4 minutes vs 2.5-hour manual baseline.",
        skillsInvoked: [
          { name: "FHIR Schema Validation Skill", finding: "RxNorm code system URI mismatch in 847 MedicationRequest resources. Expected HTTP URI, received OID format (urn:oid:2.16.840.1.113883.6.88).", duration: "3.8 min" },
          { name: "Clinical Risk Assessment Skill", finding: "Drug-interaction validation: 0% of 847 records passing. 12 critical polypharmacy patients flagged.", duration: "1.2 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "HIPAA Breach Notification Policy", rule: "HIPAA-BN-001: PHI exposure >500 records", outcome: "TRIGGERED — breach notification window: 60 days" },
        ],
      },
      {
        key: "diagnose",
        label: "Diagnose Root Cause",
        icon: "brain",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001). FHIR schema drift confirmed — 847 records affected, drug validation at 0%.

Diagnose root cause: Epic v8.4.2 changed RxNorm from HTTP URI to OID format without change notification. Describe impact chain and runbooks to activate. Respond as the Atlas agent.`,
        fallbackSummary: "Root cause: Epic v8.4.2 RxNorm URI format change without FHIR change notification. Impact: 847 records → 0 drug-interaction checks → 12 polypharmacy patients unmonitored. Runbook: URI normalization layer + re-validation pipeline.",
        skillsInvoked: [
          { name: "Drug Interaction Pattern Analyzer Skill", finding: "12 patients on 5+ concurrent medications with no interaction check in 4 hours. Highest-risk: Warfarin+NSAIDs (3), Digoxin+Amiodarone (2).", duration: "2.1 min" },
          { name: "EHR Audit Trail Skill", finding: "Epic v8.4.2 upgrade at 01:58 UTC — 19 min before anomaly detected. No change notification received.", duration: "0.8 min" },
        ],
        runbooksTriggered: [
          { name: "FHIR Schema Drift Response Runbook", result: "URI normalization layer activated between Epic and FHIR validator. Estimated fix: 22 minutes." },
        ],
        policiesChecked: [
          { name: "FDA 21 CFR Part 11 Audit Policy", rule: "21CFR-11-001: Automated system change audit required", outcome: "COMPLIANT — audit trail captured at T+4 min" },
        ],
      },
      {
        key: "remediate",
        label: "Execute Remediation",
        icon: "wrench",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001). Root cause confirmed. Execute autonomous remediation: URI normalization layer, re-route 847 records, re-run drug-interaction checks, escalate 12 critical patients, send HIPAA notification. Describe each action.`,
        fallbackSummary: "Remediation in 22 minutes. URI normalization active. 847 records reprocessed: 834/847 passed (13 pharmacist-reviewed). HIPAA notification sent. Epic notified via vendor portal.",
        skillsInvoked: [
          { name: "Automated Schema Remediation Skill", finding: "URI normalization deployed. 847 records re-routed at 38 records/second. ETA: 22 minutes.", duration: "22 min" },
        ],
        runbooksTriggered: [
          { name: "Clinical Safety Escalation Runbook", result: "12 critical patients escalated to on-call pharmacist Dr. Chen. HIPAA breach notification queued. Epic vendor incident opened." },
          { name: "Data Re-Validation Pipeline Runbook", result: "847 records re-validated. 834 passed. 13 flagged for manual review. Pipeline restored to 98.5%." },
        ],
        policiesChecked: [
          { name: "HL7 FHIR R4 Compliance Policy", rule: "FHIR-R4-001: Resource validation before clinical use", outcome: "RESTORED — 98.5% of records passing FHIR validation" },
          { name: "HIPAA Minimum Necessary Standard", rule: "HIPAA-MN-001: PHI access limited to clinical need", outcome: "COMPLIANT — access scoped to affected records only" },
        ],
      },
      {
        key: "validate",
        label: "Validate & Close",
        icon: "shield-check",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001). Remediation complete: 847 records re-validated, 834 passed, 12 patients escalated. Validate system is stable, confirm HIPAA compliance, produce automated post-mortem, recommend preventive controls.`,
        fallbackSummary: "INCIDENT RESOLVED. Drug-interaction validation at 98.5%. 0 clinical incidents. HIPAA breach notification filed. Atlas resolution: 22 minutes vs 4.5-hour manual baseline. Preventive control added: EHR vendor change notification webhook + pre-production schema validation gate.",
        skillsInvoked: [
          { name: "Compliance Verification Skill", finding: "Post-healing audit complete. All HIPAA, FDA 21 CFR Part 11, and HL7 FHIR R4 controls verified. No regulatory violations.", duration: "3.2 min" },
        ],
        runbooksTriggered: [
          { name: "Incident Post-Mortem Runbook", result: "Automated post-mortem generated and sent to CMO, CTO, Compliance Officer. Epic SLA review scheduled." },
        ],
        policiesChecked: [
          { name: "US Core 6.1 Data Quality Policy", rule: "USCORE-DQ-001: Continuous data quality monitoring", outcome: "COMPLIANT — monitoring reinstated with enhanced schema change alerting" },
        ],
      },
    ],
    resolution: {
      headline: "Drug-Interaction Validation Restored — Zero Patient Harm",
      autonomousActions: [
        "FHIR schema drift detected in 4 minutes (vs 2.5-hour manual baseline)",
        "URI normalization layer deployed autonomously",
        "847 inpatient records re-validated through corrected pipeline",
        "12 critical polypharmacy patients escalated to pharmacist",
        "HIPAA breach notification filed within compliance window",
        "Automated post-mortem generated and distributed",
      ],
      metricsRestored: [
        { label: "Drug-Interaction Validation", value: "98.5% (restored)" },
        { label: "Patients at Risk", value: "0 — all escalated and reviewed" },
        { label: "Detection Latency", value: "4 min (vs 2.5 hr manual)" },
        { label: "Resolution Time", value: "22 min (vs 4.5 hr manual)" },
        { label: "Financial Exposure Avoided", value: "$340K regulatory risk" },
      ],
    },
  },

  financial: {
    key: "financial",
    agentId: "461e8ef7-5fb1-4ad3-8db1-215a1e59cfc3",
    agentName: "Fraud Detection Model Recovery Agent",
    agentCode: "SH-FIN-001",
    industry: "Financial Services",
    incidentTitle: "Fraud Model Precision Collapse — BNPL Population Shift",
    incidentSeverity: "critical",
    incidentType: "Model Drift",
    incidentSummary:
      "BNPL merchant-category population shift caused fraud detection model precision to collapse from 94.2% to 71.8% — generating 340 false positives and blocking $1.2M in legitimate transactions. SR 11-7 model risk guardrails triggered.",
    triggerMetric: { label: "Fraud Model Precision", before: "94.2%", after: "71.8%", unit: "on BNPL transactions" },
    phases: [
      {
        key: "detect",
        label: "Detect Drift",
        icon: "activity",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001) under SR 11-7 model risk guidelines. Production fraud model precision dropped from 94.2% to 71.8% on BNPL transactions. 340 false positives blocking $1.2M. Analyze and confirm the model drift event. Respond as the Atlas agent.`,
        fallbackSummary: "Fraud model precision collapse confirmed: 94.2% → 71.8%. BNPL merchant category now 34% of volume (up from 12% in training). 340 false positives blocking $1.2M. SR 11-7 escalation threshold breached. Challenger model activated.",
        skillsInvoked: [
          { name: "Model Drift Detection Skill", finding: "FDM-v3.2 precision: 94.2% → 71.8% on BNPL. PSI: 0.34 (threshold: 0.25). BNPL volume: 34% live vs 12% training. Drift confirmed.", duration: "4.2 min" },
          { name: "False Positive Pattern Analyzer Skill", finding: "340 false positives. $1.2M blocked. 87% are first-time BNPL transactions by existing verified customers.", duration: "2.8 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "SR 11-7 Model Risk Policy", rule: "SR11-7-002: Precision drop >15pp requires immediate escalation", outcome: "TRIGGERED — 22.4pp drop exceeds threshold. Model Risk Committee notified." },
        ],
      },
      {
        key: "diagnose",
        label: "Shadow Test Challenger",
        icon: "brain",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001). Drift confirmed: BNPL under-representation in training data. Run challenger model FDM-v3.2-CHAL on last 6 hours of transactions. Compare precision and determine if zero-downtime swap is approved. Respond as Atlas agent.`,
        fallbackSummary: "Root cause: training BNPL gap (12% vs 34% live). Challenger FDM-v3.2-CHAL: precision 93.8% on BNPL (vs 71.8% production). Zero-downtime swap approved under SR 11-7. FCRA adverse action notices queued for 340 false positives.",
        skillsInvoked: [
          { name: "Champion-Challenger Validation Skill", finding: "FDM-v3.2-CHAL: BNPL precision 93.8% (vs 71.8% production). Overall: 95.1% (vs 93.4%). Challenger approved.", duration: "8.4 min" },
        ],
        runbooksTriggered: [
          { name: "Model Swap Preparation Runbook", result: "Zero-downtime swap package prepared. Rollback checkpoint: FDM-v3.2 preserved for 72 hours." },
        ],
        policiesChecked: [
          { name: "FCRA Adverse Action Policy", rule: "FCRA-AA-001: Customers declined must receive adverse action notice within 30 days", outcome: "TRIGGERED — 340 FCRA notices queued for same-day delivery" },
        ],
      },
      {
        key: "remediate",
        label: "Execute Model Swap",
        icon: "wrench",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001). Challenger validated. Execute zero-downtime model swap: route 100% traffic to FDM-v3.2-CHAL, re-score 340 false positives, release legitimate transactions, send FCRA notices, notify Model Risk Committee. Describe each action.`,
        fallbackSummary: "Model swap executed. FDM-v3.2-CHAL live at 02:14 UTC. 340 re-scored: 312 released ($1.12M), 28 confirmed fraud. FCRA notices sent. Fraud precision restored to 93.8%. Model Risk Committee notified.",
        skillsInvoked: [
          { name: "Production Traffic Router Skill", finding: "Traffic routing: 100% → FDM-v3.2-CHAL. Zero-downtime achieved. Rollback threshold: >2pp precision drop in 15 minutes.", duration: "0.3 min" },
        ],
        runbooksTriggered: [
          { name: "False Positive Release Runbook", result: "312 transactions released ($1.12M). 28 confirmed fraud remain blocked. Customer re-authorization sent." },
          { name: "Regulatory Notification Runbook", result: "28 FCRA adverse action notices sent. SR 11-7 model swap docs filed with Model Risk Committee." },
        ],
        policiesChecked: [
          { name: "SR 11-7 Model Swap Protocol", rule: "SR11-7-004: Zero-downtime swap with 72h rollback window", outcome: "COMPLIANT — swap executed within protocol. Rollback checkpoint active." },
        ],
      },
      {
        key: "validate",
        label: "Validate & Monitor",
        icon: "shield-check",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001). Model swap complete. Validate precision is stable, no new false positive clusters, FCRA compliance met. Generate SR 11-7 incident report and recommend preventive controls.`,
        fallbackSummary: "INCIDENT RESOLVED. FDM-v3.2-CHAL stable at 93.8% for 30 minutes. All FCRA obligations met. Atlas prevented: $1.2M customer harm, OCC model risk citation. Resolution: 47 minutes vs 8-12 hour manual retraining.",
        skillsInvoked: [
          { name: "Post-Swap Model Monitor Skill", finding: "FDM-v3.2-CHAL: Precision 93.8% (±0.2pp over 30 min). No anomalous patterns. BNPL precision: 93.1%. System: GREEN.", duration: "30 min monitoring" },
        ],
        runbooksTriggered: [
          { name: "SR 11-7 Incident Documentation Runbook", result: "Model risk incident report generated and submitted to Chief Model Risk Officer and Board Risk Committee." },
        ],
        policiesChecked: [
          { name: "FCRA Ongoing Monitoring Policy", rule: "FCRA-OM-001: 30-day monitoring post adverse action event", outcome: "COMPLIANT — monitoring window initiated for 340 affected customers" },
        ],
      },
    ],
    resolution: {
      headline: "Fraud Model Restored — $1.12M Customer Transactions Released",
      autonomousActions: [
        "Precision collapse detected in real-time (94.2% → 71.8%)",
        "Challenger model FDM-v3.2-CHAL validated on 30-day holdout",
        "Zero-downtime model swap executed — no transaction scoring gap",
        "312 false-positive customer transactions released ($1.12M)",
        "28 FCRA adverse action notices sent",
        "SR 11-7 model incident report filed with Model Risk Committee",
      ],
      metricsRestored: [
        { label: "Fraud Model Precision", value: "93.8% (restored)" },
        { label: "Transactions Released", value: "$1.12M (312 customers)" },
        { label: "False Positive Rate", value: "3.1% (vs 28.2% peak)" },
        { label: "Resolution Time", value: "47 min (vs 8-12 hr manual)" },
        { label: "Regulatory Exposure Avoided", value: "OCC model risk citation" },
      ],
    },
  },

  manufacturing: {
    key: "manufacturing",
    agentId: "d7617be4-d35b-453e-86a8-04de00ebd8fe",
    agentName: "Factory Floor Anomaly Recovery Agent",
    agentCode: "SH-MFG-001",
    industry: "Manufacturing",
    incidentTitle: "CNC Mill #7 Bearing Failure Imminent — ISO 10816-3 Zone C",
    incidentSeverity: "critical",
    incidentType: "Equipment Anomaly",
    incidentSummary:
      "CNC Mill #7 bearing vibration crossed ISO 10816-3 Zone C at 14.7 mm/s RMS — 340% surge from baseline — predicting imminent bearing failure within 4 hours. $2.1M weekly production output at risk.",
    triggerMetric: { label: "Vibration RMS (CNC Mill #7)", before: "3.4 mm/s", after: "14.7 mm/s", unit: "ISO 10816-3 Zone C exceeded" },
    phases: [
      {
        key: "detect",
        label: "Detect Anomaly",
        icon: "activity",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001) managing predictive maintenance under ISO 55001. CNC Mill #7 vibration: 14.7 mm/s RMS (Zone C). Bearing temperature: 87°C. Predicted failure: 4 hours. $2.1M output at risk. Analyze and confirm. Respond as the Atlas agent.`,
        fallbackSummary: "Bearing failure imminent. Vibration 14.7 mm/s RMS (Zone C). MTBF: 4 hours. Unplanned failure = 14-hour downtime = $2.1M output risk. OSHA 29 CFR 1910.212 action required. Prediction confidence: 94.2%.",
        skillsInvoked: [
          { name: "Vibration Pattern Analyzer Skill", finding: "FFT: dominant at 3× bearing race frequency (BPFO). Inner race defect. Failure window: 3.5–4.5 hours. Confidence: 94.2%.", duration: "1.8 min" },
          { name: "Production Impact Modeler Skill", finding: "Unplanned failure: 14-hour downtime, $2.1M at risk. Planned 90-min window: zero order delays, $0 lost output.", duration: "1.4 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "ISO 55001 Asset Management Policy", rule: "ISO55001-AM-007: Zone C vibration requires immediate maintenance action", outcome: "TRIGGERED — predictive maintenance window initiated" },
        ],
      },
      {
        key: "diagnose",
        label: "Pre-Stage Spares & Schedule",
        icon: "brain",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001). Bearing failure confirmed: 4-hour MTBF. Coordinate: check spare parts inventory (SKF 6311-2Z), schedule 90-min emergency maintenance, reroute 3 production orders to CNC #3 and #8, dispatch crew. Respond as Atlas agent.`,
        fallbackSummary: "Pre-staging complete. SKF 6311-2Z in Plant 2 inventory (Bin A-12-B, Qty 3). Maintenance window: 14:30–16:00 UTC. Orders rerouted to CNC #3 and #8 — zero SLA breach. LOTO procedure initiated.",
        skillsInvoked: [
          { name: "Inventory & Logistics Skill", finding: "SKF 6311-2Z: In stock (Bin A-12-B, Qty 3). Staging: 15 minutes. No procurement needed.", duration: "0.6 min" },
        ],
        runbooksTriggered: [
          { name: "Emergency Maintenance Scheduling Runbook", result: "Maintenance window confirmed: 14:30–16:00 UTC. Crew dispatched. Supervisor notified via EAM system." },
          { name: "Production Order Rerouting Runbook", result: "ORD-2026-4401 → CNC #3, ORD-2026-4402 → CNC #8. ORD-2026-4403 queued post-maintenance. Zero SLA breach." },
        ],
        policiesChecked: [
          { name: "OSHA 29 CFR 1910.147 Lockout/Tagout Policy", rule: "LOTO-001: Authorized lockout before bearing replacement", outcome: "INITIATED — LOTO queued for 14:30 UTC" },
        ],
      },
      {
        key: "remediate",
        label: "Execute Maintenance",
        icon: "wrench",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001). 90-min maintenance window at 14:30 UTC. Monitor execution: LOTO applied, SKF 6311-2Z installed, post-install vibration check (target: Zone A < 2.3 mm/s), LOTO removed, machine back online. Report completion.`,
        fallbackSummary: "Bearing replacement complete at 15:58 UTC (88 minutes). LOTO applied and released per OSHA. Post-install vibration: 2.1 mm/s (Zone A). Temperature: 58°C. CNC Mill #7 back in production at 16:02 UTC.",
        skillsInvoked: [
          { name: "Post-Maintenance Validation Skill", finding: "Post-bearing: vibration 2.1 mm/s (Zone A), temp 58°C, acoustic 76 dB. All sensors normal. Machine cleared.", duration: "0.5 min" },
        ],
        runbooksTriggered: [
          { name: "Machine Recommissioning Runbook", result: "LOTO removed, power restored, test cycle run (10 min), all parameters normal. ORD-2026-4403 resumed at 16:05 UTC." },
        ],
        policiesChecked: [
          { name: "ISO 10816-3 Post-Maintenance Standard", rule: "ISO10816-003: Post-maintenance vibration must return to Zone A", outcome: "COMPLIANT — 2.1 mm/s confirmed Zone A. Machine cleared." },
        ],
      },
      {
        key: "validate",
        label: "Validate & Update CMMS",
        icon: "shield-check",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001). CNC Mill #7 bearing replaced, Zone A confirmed. Close out: update CMMS, schedule next PM, run preventive scan on other mills, generate plant manager report.`,
        fallbackSummary: "INCIDENT RESOLVED. CNC Mill #7 Zone A. CMMS WO-2026-04-12-M7 closed. Next PM: May 12. Fleet scan: Mills #3 and #5 in Zone B — inspections scheduled April 26. Atlas prevented: $2.1M downtime, OSHA recordable, 3 SLA breaches.",
        skillsInvoked: [
          { name: "Fleet Health Assessment Skill", finding: "14 CNC mills evaluated. Mills #3 (4.1 mm/s) and #5 (4.8 mm/s) Zone B — inspect within 14 days. 12 mills Zone A.", duration: "3.6 min" },
        ],
        runbooksTriggered: [
          { name: "CMMS Update & PM Scheduling Runbook", result: "WO-2026-04-12-M7 closed. Next PM: May 12. Mills #3 and #5 inspection: April 26." },
        ],
        policiesChecked: [
          { name: "ISO 55001 Asset Lifecycle Policy", rule: "ISO55001-AL-003: Post-maintenance CMMS update within 24 hours", outcome: "COMPLIANT — work order closed and PM schedule updated" },
        ],
      },
    ],
    resolution: {
      headline: "Bearing Replaced in 88 min — $2.1M Output Protected",
      autonomousActions: [
        "Bearing failure predicted 4 hours before failure (Zone C detection)",
        "Spare parts pre-staged from Plant 2 inventory",
        "3 production orders rerouted — zero SLA breach",
        "90-minute emergency maintenance window scheduled",
        "OSHA LOTO coordinated autonomously",
        "CNC Mill #7 returned to Zone A (2.1 mm/s RMS)",
        "Fleet scan identified Mills #3 and #5 for preventive inspection",
      ],
      metricsRestored: [
        { label: "Vibration RMS", value: "2.1 mm/s (Zone A restored)" },
        { label: "Production Output Protected", value: "$2.1M weekly output" },
        { label: "Downtime", value: "90 min planned (vs 14 hr unplanned)" },
        { label: "Customer SLA Breaches", value: "0" },
        { label: "Resolution Time", value: "88 min within maintenance window" },
      ],
    },
  },

  retail: {
    key: "retail",
    agentId: "56ef232d-8d91-428d-8e81-d8ef03c6ecfa",
    agentName: "Order Fulfillment Recovery Agent",
    agentCode: "SH-RETAIL-001",
    industry: "Retail / E-Commerce",
    incidentTitle: "Primary WMS API Down — 1,847 Orders Queued, $340K SLA Exposure",
    incidentSeverity: "critical",
    incidentType: "System Failure",
    incidentSummary:
      "Primary Warehouse Management System API went offline during peak shopping event. Error rate hit 87%. 1,847 orders queued including 312 same-day delivery commitments at $340K SLA exposure. PCI-DSS cardholder data scope active.",
    triggerMetric: { label: "WMS API Error Rate", before: "0.3%", after: "87%", unit: "1,847 orders queued" },
    phases: [
      {
        key: "detect",
        label: "Detect Outage",
        icon: "activity",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001) under PCI-DSS. Primary WMS API offline — 87% error rate. 1,847 orders queued, 312 same-day at $340K SLA risk. 3 backup WMS endpoints available. Confirm outage scope. Respond as the Atlas agent.`,
        fallbackSummary: "WMS API confirmed offline (AWS us-east-1 AZ failure). 1,847 queued (312 same-day, $340K SLA). PCI-DSS scope active — no breach (data encrypted). 3 backup endpoints available.",
        skillsInvoked: [
          { name: "WMS Health Monitor Skill", finding: "Primary WMS: DOWN (11:23 UTC, AWS AZ failure). WMS-BACKUP-1 (EU-WEST): UP 99.2%. WMS-BACKUP-2 (AP-SE): UP 98.7%. WMS-BACKUP-3 (US-WEST): UP 99.8%.", duration: "0.8 min" },
          { name: "SLA Risk Calculator Skill", finding: "312 same-day orders. Cutoff: 14:00 UTC (2.6 hours). Financial: $340K SLA + $890K revenue at risk.", duration: "1.1 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "PCI-DSS Data Protection Policy", rule: "PCI-DSS-003: Cardholder data encrypted in queues", outcome: "COMPLIANT — AES-256 encryption confirmed. No exposure." },
        ],
      },
      {
        key: "diagnose",
        label: "Activate Backup Routing",
        icon: "brain",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001). WMS outage confirmed. Design failover: distribute 1,847 orders across 3 backup WMS endpoints, priority-route 312 same-day orders, confirm PCI-DSS compliance during failover. Provide routing plan.`,
        fallbackSummary: "Routing plan: WMS-BACKUP-3 (US-WEST): 312 same-day priority + 600 standard. WMS-BACKUP-1: 700 standard. WMS-BACKUP-2: 235 remaining. Clearance: 22 min same-day, 47 min all orders. 8 same-day orders cannot meet cutoff — notification queued.",
        skillsInvoked: [
          { name: "Fulfillment Capacity Optimizer Skill", finding: "Optimal routing: BACKUP-3 (58 orders/min) → 312 same-day. BACKUP-1 (45/min) → 700 standard. BACKUP-2 (32/min) → 235 remaining.", duration: "2.3 min" },
        ],
        runbooksTriggered: [
          { name: "WMS Failover Activation Runbook", result: "Traffic switched: 100% across 3 backups. DNS TTL: 30 seconds. 4 minutes to full failover." },
          { name: "SLA Breach Prevention Runbook", result: "304/312 same-day routable within SLA (97.4%). 8 orders flagged for notification. $340K exposure → $9.2K." },
        ],
        policiesChecked: [
          { name: "PCI-DSS Backup System Policy", rule: "PCI-DSS-007: Backup systems must maintain equivalent security controls", outcome: "COMPLIANT — all 3 backups PCI-DSS Level 1 certified. TLS 1.3 enforced." },
        ],
      },
      {
        key: "remediate",
        label: "Process Orders & Notify",
        icon: "wrench",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001). Failover active. Execute: confirm 1,847 orders processing, notify 8 late customers proactively, offer compensation, monitor clearance. Provide status update.`,
        fallbackSummary: "1,234/1,847 orders processed (22 min). 304 same-day on track for 14:00 UTC. 8 late notifications sent with $15 credit + free delivery upgrade. Clearance: 56 orders/min across 3 backups.",
        skillsInvoked: [
          { name: "Order Queue Processor Skill", finding: "1,234/1,847 (66.8%) in 22 min. Same-day: 304/312 on time. Rate: 56 orders/min.", duration: "22 min" },
        ],
        runbooksTriggered: [
          { name: "Customer Notification Runbook", result: "8 late-order notifications sent (email + SMS) at T+24 min. Offer: $15 credit + next-day upgrade. 0 chargebacks." },
        ],
        policiesChecked: [
          { name: "Consumer Protection Policy", rule: "CP-001: Customer notification within 30 minutes of SLA breach risk", outcome: "COMPLIANT — 8 customers notified at T+24 min" },
          { name: "PCI-DSS Transaction Integrity", rule: "PCI-DSS-009: All transactions logged and reconciled", outcome: "COMPLIANT — 1,847 transactions in audit trail" },
        ],
      },
      {
        key: "validate",
        label: "Validate & Restore",
        icon: "shield-check",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001). 1,847 orders processed. Primary WMS recovering. Validate all orders complete, SLA met, PCI-DSS compliant. Generate post-mortem and recommend infrastructure improvements.`,
        fallbackSummary: "INCIDENT RESOLVED. 1,847/1,847 orders processed (47 min). 304/312 same-day met SLA. 8 customers compensated. Primary WMS restored at 13:42 UTC. No PCI-DSS exposure. Atlas prevented: $340K SLA exposure, $890K abandoned cart. Failover: 4 min vs 35 min manual.",
        skillsInvoked: [
          { name: "Post-Incident Compliance Audit Skill", finding: "PCI-DSS audit: no cardholder data exposure. All 1,847 orders reconciled. 0 unauthorized access events. Incident report ready.", duration: "4.1 min" },
        ],
        runbooksTriggered: [
          { name: "Primary WMS Restoration Runbook", result: "Primary WMS restored at 13:42 UTC. Traffic gradually shifted back 10→50→100% over 20 min." },
        ],
        policiesChecked: [
          { name: "Business Continuity Policy", rule: "BCP-001: Incident post-mortem within 24 hours", outcome: "COMPLIANT — post-mortem generated automatically at incident close" },
        ],
      },
    ],
    resolution: {
      headline: "1,847 Orders Processed — $340K SLA Exposure Reduced to $9.2K",
      autonomousActions: [
        "WMS API failure detected in 90 seconds (0.3% → 87% error rate)",
        "3 backup WMS endpoints activated in 4 minutes",
        "1,847 orders routed across backup endpoints — zero lost",
        "304/312 same-day orders met SLA cutoff",
        "8 customers proactively notified with compensation offers",
        "PCI-DSS compliance maintained — no data exposure",
        "Primary WMS restored and traffic gradually shifted back",
      ],
      metricsRestored: [
        { label: "Orders Processed", value: "1,847/1,847 (100%)" },
        { label: "Same-Day SLA Met", value: "304/312 (97.4%)" },
        { label: "SLA Exposure", value: "$9.2K (vs $340K at risk)" },
        { label: "Failover Time", value: "4 min (vs 35 min manual)" },
        { label: "Revenue Protected", value: "$890K (abandoned cart avoided)" },
      ],
    },
  },

  energy: {
    key: "energy",
    agentId: "88069f50-e374-4a16-ba9f-76a044fceca3",
    agentName: "Grid Operations Stability Agent",
    agentCode: "SH-ENERGY-001",
    industry: "Energy / Utilities",
    incidentTitle: "847 MW Wind Farm Trip — NERC BAL-003 Frequency Restoration Clock Running",
    incidentSeverity: "critical",
    incidentType: "Generation Loss",
    incidentSummary:
      "Offshore-Alpha wind farm tripped offline — 847 MW shortfall. Grid frequency dropped to 59.63 Hz, breaching NERC alert threshold. NERC BAL-003 10-minute restoration clock running. 680,000 households at risk.",
    triggerMetric: { label: "Grid Frequency", before: "60.02 Hz", after: "59.63 Hz", unit: "NERC limit: ±0.5 Hz" },
    phases: [
      {
        key: "detect",
        label: "Detect Frequency Deviation",
        icon: "activity",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001) under NERC CIP-014 and BAL-003. Offshore-Alpha (847 MW) tripped offline. Frequency: 59.63 Hz. NERC BAL-003 10-min clock running. 680,000 households at risk. 4 gas peakers available. Analyze the grid emergency. Respond as the Atlas agent.`,
        fallbackSummary: "Grid emergency confirmed. Frequency: 59.63 Hz (NERC alert zone). 847 MW shortfall. BAL-003 clock: T+3 min. Available: CT-1 (180 MW), CT-2 (210 MW), CT-3 (245 MW), CT-4 (257 MW) = 892 MW. Cascading failure probability: 34% without intervention.",
        skillsInvoked: [
          { name: "Real-Time Grid Frequency Monitor Skill", finding: "Frequency: 59.63 Hz (deviation: −0.39 Hz). RoC: −0.052 Hz/s. Predicted nadir: 59.41 Hz in 8 min without intervention. Cascading risk: 34%.", duration: "Real-time" },
          { name: "Generation Dispatch Optimizer Skill", finding: "Optimal dispatch: CT-1 (180 MW, 8 min) + CT-2 (210 MW, 9 min) + CT-4 (245 MW, 12 min) = 635 MW. Recovery: 59.97 Hz at T+9.2 min.", duration: "2.1 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "NERC CIP-014 Reliability Policy", rule: "NERC-BAL003-001: Frequency restoration within 10 minutes", outcome: "CLOCK RUNNING — 3 minutes elapsed, 7 minutes remaining" },
        ],
      },
      {
        key: "diagnose",
        label: "Dispatch Generation",
        icon: "brain",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001). BAL-003 clock T+3 min (7 min remaining). Dispatch CT-1, CT-2, CT-4. Notify FERC within 5 min. Verify EPA operating hours. Coordinate with neighboring balancing areas. Respond as Atlas agent.`,
        fallbackSummary: "Dispatch executed T+3 min: CT-1 (180 MW, 8 min), CT-2 (210 MW, 9 min), CT-4 (245 MW, 12 min). FERC notification sent T+4 min. EPA hours verified. No cascade risk from neighbors.",
        skillsInvoked: [
          { name: "Grid Restoration Sequence Planner Skill", finding: "Phase 1 (T+3-8): CT-1+CT-2 (390 MW). Phase 2 (T+8-12): CT-4 (245 MW). Cascading probability: 34% → 3% with dispatch.", duration: "1.4 min" },
        ],
        runbooksTriggered: [
          { name: "Generation Shortfall Emergency Runbook", result: "CT-1, CT-2, CT-4 dispatched. 635 MW online by T+9 min, 892 MW by T+12 min." },
        ],
        policiesChecked: [
          { name: "FERC Open Access Tariff Policy", rule: "FERC-OAT-001: Market notification within 5 min of peaker commitment", outcome: "COMPLIANT — FERC notified at T+4 min" },
          { name: "EPA Clean Air Act Policy", rule: "EPA-CAA-001: Annual operating hours cap", outcome: "COMPLIANT — CT-1: 287/500h, CT-2: 312/500h, CT-4: 412/500h. All approved." },
        ],
      },
      {
        key: "remediate",
        label: "Restore Frequency",
        icon: "wrench",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001). Dispatch active: CT-1, CT-2, CT-4 ramping. NERC clock T+7 min (3 min remaining). Monitor frequency recovery. Confirm NERC BAL-003 compliance when frequency returns above 59.7 Hz.`,
        fallbackSummary: "Frequency restored to 59.97 Hz at T+9.2 min (NERC BAL-003 COMPLIANT). CT-1+CT-2 online (390 MW). CT-4 at 68% (168 MW). No N-1 violations. NERC event notification filed at T+11 min.",
        skillsInvoked: [
          { name: "Real-Time Grid Frequency Monitor Skill", finding: "Recovery: T+5: 59.71 Hz, T+7: 59.84 Hz, T+9.2: 59.97 Hz (NERC compliant). Stability confirmed. No oscillation.", duration: "9.2 min real-time" },
        ],
        runbooksTriggered: [
          { name: "NERC Event Reporting Runbook", result: "BAL-003 event report filed at T+11 min. Nadir: 59.63 Hz, restoration: 59.97 Hz in 9.2 min. No violation." },
        ],
        policiesChecked: [
          { name: "NERC CIP-014 Reliability Policy", rule: "NERC-BAL003-001: Frequency must return above 59.7 Hz within 10 minutes", outcome: "COMPLIANT — 59.97 Hz at T+9.2 min (0.8 min within window)" },
        ],
      },
      {
        key: "validate",
        label: "Validate & File Report",
        icon: "shield-check",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001). Frequency restored. Validate stability (30 min), plan Offshore-Alpha reconnection, file complete NERC report. Recommend automated frequency response improvements.`,
        fallbackSummary: "INCIDENT RESOLVED. Grid stable at 60.01 Hz (±0.02 Hz over 30 min). Offshore-Alpha reconnection: 20:00 UTC. NERC report filed — no violation. Atlas prevented: 680,000-household blackout, $1M–$25M NERC fine. Response: 9.2 min vs 15-25 min manual.",
        skillsInvoked: [
          { name: "Generation Dispatch Optimizer Skill", finding: "CT-4 at full 245 MW by T+13 min. Offshore-Alpha: relay reset + 2h cool-down. Grid stability: 98/100.", duration: "30 min monitoring" },
        ],
        runbooksTriggered: [
          { name: "Grid Stability Monitoring Runbook", result: "30-min post-event monitoring: frequency stable 59.95–60.03 Hz. NERC event report finalized. Offshore-Alpha reconnection cleared for 20:00 UTC." },
        ],
        policiesChecked: [
          { name: "NERC Post-Event Reporting Policy", rule: "NERC-BAL003-003: Event report within 24 hours", outcome: "COMPLIANT — filed at T+11 min (automated, well within 24h window)" },
        ],
      },
    ],
    resolution: {
      headline: "Grid Frequency Restored in 9.2 min — NERC Compliant",
      autonomousActions: [
        "847 MW shortfall detected in <30 seconds",
        "892 MW peaker response calculated and dispatched",
        "FERC market notification filed at T+4 min",
        "Frequency restored: 59.97 Hz at T+9.2 min (NERC BAL-003 compliant)",
        "N-1 transmission scan: no violations",
        "NERC event report automatically filed at T+11 min",
      ],
      metricsRestored: [
        { label: "Grid Frequency", value: "59.97 Hz (restored)" },
        { label: "Generation Response", value: "558 MW online by T+9 min" },
        { label: "NERC Compliance", value: "BAL-003 met (9.2 min < 10 min)" },
        { label: "Households Protected", value: "680,000" },
        { label: "Regulatory Fine Avoided", value: "$1M–$25M NERC penalty" },
      ],
    },
  },

  insurance: {
    key: "insurance",
    agentId: "d7d45853-f644-4a4a-b134-d114413a7780",
    agentName: "Claims Workflow Recovery Agent",
    agentCode: "SH-INS-001",
    industry: "Insurance",
    incidentTitle: "Claims Fraud Triage FPR Spike — 620 Misclassified, 12 Regulators Triggered",
    incidentSeverity: "critical",
    incidentType: "Model Bias",
    incidentSummary:
      "Claims fraud triage model FPR spiked from 3.2% to 22.7% after biased retrain. 620 claims misclassified — 47 vulnerable claimants (elderly, disability) with delayed payouts. 12 state insurance regulators notified.",
    triggerMetric: { label: "Fraud Triage False Positive Rate", before: "3.2%", after: "22.7%", unit: "620 claims misclassified" },
    phases: [
      {
        key: "detect",
        label: "Detect Model Bias",
        icon: "activity",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001) under NAIC Model Act and GDPR Article 22. FTM-v2.1 retrained on non-representative data — FPR spiked 3.2% → 22.7%. 620 misclassified. 47 vulnerable claimants with delayed payouts. 12 regulators notified. Analyze. Respond as the Atlas agent.`,
        fallbackSummary: "Model bias confirmed. FTM-v2.1 FPR 3.2% → 22.7%. Affected: ages 65+ (FPR 34.2%), disability claimants (28.9%). NAIC Model Act violation: discriminatory claims handling. GDPR Art. 22 triggered for all 620. FTM-v2.1 suspended.",
        skillsInvoked: [
          { name: "Bias Detection & Fairness Audit Skill", finding: "FTM-v2.1 FPR by demographic: 65+ (34.2% vs 3.2% baseline), Disability (28.9%). p<0.001. Disparate impact confirmed — NAIC protected class violation.", duration: "3.8 min" },
          { name: "Claims Queue Analyzer Skill", finding: "620 misclassified. 47 in acute hardship. Average delay: 18 days. Total delayed payout: $2.3M.", duration: "2.1 min" },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          { name: "NAIC Model Act Compliance Policy", rule: "NAIC-MA-003: Discriminatory claims handling — immediate suspension", outcome: "TRIGGERED — FTM-v2.1 suspended pending bias review" },
        ],
      },
      {
        key: "diagnose",
        label: "Isolate Model & Prioritize",
        icon: "brain",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001). FTM-v2.1 suspended. Plan remediation: isolate from production, route 620 to human review, fast-track 47 vulnerable claimants to senior adjusters, prepare GDPR right-to-explanation responses, draft 12 state regulator responses.`,
        fallbackSummary: "Isolation complete. 620 re-triaged: 47 vulnerable fast-tracked to senior adjusters (SLA: 24h). 573 in manual review (72h). GDPR right-to-explanation template prepared. 12 state regulator responses drafted.",
        skillsInvoked: [
          { name: "Claims Priority Router Skill", finding: "620 re-routed: 47 to senior fast-track (vulnerability 8-10/10), 573 standard. 28 adjusters, 22 claims capacity each. ETA all reviewed: 72h.", duration: "1.2 min" },
        ],
        runbooksTriggered: [
          { name: "Vulnerable Claimant Priority Runbook", result: "47 fast-track assigned to 6 senior adjusters. SLA: 4 hours each. Expected payout: within 24h for all 47." },
          { name: "Regulatory Response Preparation Runbook", result: "12 state regulator packages drafted (MA, NY, CA, TX, FL, IL, PA, OH, GA, NC, MI, NJ). Legal review: 4h." },
        ],
        policiesChecked: [
          { name: "GDPR Article 22 Policy", rule: "GDPR-22-001: Right to explanation for automated decisions", outcome: "TRIGGERED — 620 right-to-explanation letters queued" },
        ],
      },
      {
        key: "remediate",
        label: "Process Claims & Notify",
        icon: "wrench",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001). Fast-track active. Execute: confirm senior adjusters processing 47 vulnerable claims, authorize payments for approved claims, send GDPR notices, notify 12 regulators, initiate FTM-v2.1 bias investigation.`,
        fallbackSummary: "31/47 vulnerable claims approved ($1.1M authorized, 5h). 620 GDPR letters sent. 12 regulators notified. FTM-v2.2 retrain initiated (2024 representative dataset, 14-day ETA).",
        skillsInvoked: [
          { name: "Payment Authorization Skill", finding: "31 vulnerable claims approved: $1.1M authorized. Avg review: 3.8h/claim. 573 standard: 68/573 approved ($340K). Total: $1.44M.", duration: "5h concurrent" },
        ],
        runbooksTriggered: [
          { name: "GDPR Notification Runbook", result: "620 right-to-explanation letters sent via certified mail + email. Response period: 30 days." },
          { name: "Regulator Notification Runbook", result: "12 state insurance department letters filed. Remediation timeline: 30 days. $250 hardship payment per affected claimant." },
        ],
        policiesChecked: [
          { name: "NAIC Unfair Trade Practices Policy", rule: "NAIC-UTP-001: Remediation payment within 30 days", outcome: "ON TRACK — 31/47 paid. Full remediation: 30-day window active." },
          { name: "State Insurance Department Policy", rule: "SID-001: Regulator notification within 72 hours", outcome: "COMPLIANT — 12 regulators notified at T+6h (within 72h)" },
        ],
      },
      {
        key: "validate",
        label: "Validate & Retrain",
        icon: "shield-check",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001). Remediation in progress: 31/47 vulnerable paid, GDPR notices sent, regulators notified. Confirm all 47 resolved within 24h SLA, GDPR obligations met, initiate bias-aware FTM-v2.2, generate NAIC report.`,
        fallbackSummary: "INCIDENT RESOLVED. 47/47 vulnerable within 24h SLA ($1.76M). 573/573 standard in review (420 approved). 620 GDPR notices sent. All 12 regulators satisfied — no enforcement. FTM-v2.2 retrain initiated (14 days). Atlas prevented: $10M+ fines, class action liability.",
        skillsInvoked: [
          { name: "Bias Detection & Fairness Audit Skill", finding: "FTM-v2.2 retrain dataset: 2024 claims (1.2M records), demographic representation verified. Bias score projected: FPR parity 0.98 (target >0.95). ETA: 14 days.", duration: "2.4 min" },
        ],
        runbooksTriggered: [
          { name: "Model Bias Remediation Runbook", result: "FTM-v2.2 retrain initiated. 22 fairness metrics. Champion-challenger validation required before production." },
        ],
        policiesChecked: [
          { name: "AI Ethics & Fairness Policy", rule: "AIEF-001: Bias-tested model required before re-deployment", outcome: "INITIATED — 22 fairness metrics active. Production blocked until all pass." },
        ],
      },
    ],
    resolution: {
      headline: "47 Vulnerable Claimants Paid Within 24 Hours — No Regulatory Enforcement",
      autonomousActions: [
        "FTM-v2.1 bias detected and suspended within 2 hours",
        "620 misclassified claims routed to human review",
        "47 vulnerable claimants fast-tracked to senior adjusters",
        "$1.76M in delayed payments authorized within 24 hours",
        "620 GDPR right-to-explanation letters dispatched",
        "12 state insurance regulators notified within 6 hours",
        "Bias-aware FTM-v2.2 retrain initiated",
      ],
      metricsRestored: [
        { label: "Vulnerable Claims Resolved", value: "47/47 within 24-hour SLA" },
        { label: "Payments Authorized", value: "$1.76M (vulnerable) + $340K (standard)" },
        { label: "Regulatory Enforcement", value: "0 — all 12 regulators satisfied" },
        { label: "GDPR Compliance", value: "620/620 notices sent" },
        { label: "Fine Exposure Avoided", value: "$10M+ potential fines" },
      ],
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureSHDeployment(agentId: string, agentName: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  const active = (deps as any[]).find((d: any) => d.status !== "rolled_back");
  if (active) return active.id;
  const dep = await storage.createDeployment({
    agentId,
    agentName,
    environment: "production",
    status: "pending",
    version: "1.0.0",
    rolloutStrategy: "direct",
    canaryPercent: 100,
    pipelineComplete: true,
    deployedAt: new Date(),
  } as any);
  return dep.id;
}

async function runSHPhase(deploymentId: string, prompt: string, fallback: string): Promise<string> {
  try {
    const result = await runAgentOnce(deploymentId, prompt, 3);
    return result.message && result.message.length > 60 ? result.message : fallback;
  } catch {
    return fallback;
  }
}

// ─── SSE Handler ─────────────────────────────────────────────────────────────

export async function shLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, payload: object) => {
    try { res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { /* ignore */ }
  };
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  let aborted = false;
  req.on("close", () => { aborted = true; });

  const key = (req.query.scenario as string) || "healthcare";
  const scenario = SH_SCENARIOS[key];

  if (!scenario) {
    send("error", { message: `Unknown scenario: ${key}` });
    return res.end();
  }

  try {
    send("run_start", {
      scenario: key,
      agentCode: scenario.agentCode,
      agentName: scenario.agentName,
      industry: scenario.industry,
      incidentTitle: scenario.incidentTitle,
      incidentSeverity: scenario.incidentSeverity,
      incidentType: scenario.incidentType,
      incidentSummary: scenario.incidentSummary,
      triggerMetric: scenario.triggerMetric,
    });

    await sleep(300);
    send("setup", { message: `Initialising ${scenario.agentName}...` });

    const deploymentId = await ensureSHDeployment(scenario.agentId, scenario.agentName);
    if (await isRuntimeActive(deploymentId)) await stopAgentRuntime(deploymentId);

    send("setup", { message: `Agent ready — deployment ${deploymentId.slice(0, 8)}` });
    await sleep(200);

    for (const phase of scenario.phases) {
      if (aborted) break;

      send("phase_start", {
        phase: phase.key,
        label: phase.label,
        icon: phase.icon,
        agentCode: scenario.agentCode,
        agentName: scenario.agentName,
      });

      await sleep(200);

      for (const skill of phase.skillsInvoked) {
        if (aborted) break;
        send("skill_invoked", { phase: phase.key, skillName: skill.name, finding: skill.finding, duration: skill.duration });
        await sleep(700);
      }

      const llmPromise = runSHPhase(deploymentId, phase.prompt, phase.fallbackSummary);

      for (const rb of phase.runbooksTriggered) {
        if (aborted) break;
        send("runbook_triggered", { phase: phase.key, runbookName: rb.name, result: rb.result });
        await sleep(800);
      }

      for (const pol of phase.policiesChecked) {
        if (aborted) break;
        send("policy_checked", { phase: phase.key, policyName: pol.name, rule: pol.rule, outcome: pol.outcome });
        await sleep(600);
      }

      const analysis = await llmPromise;
      send("phase_complete", { phase: phase.key, label: phase.label, analysis, success: true });
      await sleep(400);
    }

    if (!aborted) {
      send("run_complete", {
        scenario: key,
        agentCode: scenario.agentCode,
        headline: scenario.resolution.headline,
        autonomousActions: scenario.resolution.autonomousActions,
        metricsRestored: scenario.resolution.metricsRestored,
        success: true,
      });
    }
  } catch (err: any) {
    send("error", { message: err?.message || "Self-healing pipeline error" });
  } finally {
    res.end();
  }
}
