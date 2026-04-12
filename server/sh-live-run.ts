/**
 * Self-Healing Live-Run SSE Handler
 * GET /demo-api/sh-healing/stream?scenario=healthcare|financial|manufacturing|retail|energy|insurance
 *
 * Runs the real SH agent through 4 healing phases (detect → diagnose → remediate → validate),
 * emitting live SSE events at each step. Scripted healing-step events (skill invocations,
 * runbook triggers, policy checks) are emitted while the LLM thinks.
 */

import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

// ─── Scenario registry ────────────────────────────────────────────────────────

interface SHScenario {
  key: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  pipelineId: string;
  industry: string;
  incidentTitle: string;
  incidentSeverity: "critical" | "high";
  incidentType: string;
  incidentSummary: string;
  triggerMetric: { label: string; before: string; after: string; unit: string };
  phases: Array<{
    key: string;
    label: string;
    icon: string;
    prompt: string;
    fallbackSummary: string;
    skillsInvoked: Array<{ name: string; finding: string; duration: string }>;
    runbooksTriggered: Array<{ name: string; result: string }>;
    policiesChecked: Array<{ name: string; rule: string; outcome: string }>;
  }>;
  resolution: {
    headline: string;
    autonomousActions: string[];
    metricsRestored: Array<{ label: string; value: string }>;
  };
}

const SH_SCENARIOS: Record<string, SHScenario> = {
  healthcare: {
    key: "healthcare",
    agentId: "5db8101f-4ea0-4c10-ae54-2038081a5e0a",
    agentName: "Clinical Data Integrity Monitor",
    agentCode: "SH-HEALTH-001",
    pipelineId: "1ee20f24-1242-4434-af37-b52c5b2d2f4e",
    industry: "Healthcare",
    incidentTitle: "FHIR EHR Feed Schema Drift Detected",
    incidentSeverity: "critical",
    incidentType: "Schema Drift",
    incidentSummary:
      "EHR vendor pushed undocumented RxNorm code system version change at 02:17 UTC. FHIR MedicationRequest resources now contain unrecognized code system URIs — drug-interaction validation silently failing for 847 inpatient records across 3 hospitals.",
    triggerMetric: {
      label: "Drug Interaction Validation Success Rate",
      before: "99.8%",
      after: "0%",
      unit: "of 847 records",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Anomaly",
        icon: "activity",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001), an Atlas AI agent responsible for HIPAA-compliant EHR data integrity.

INCIDENT DETECTED:
At 02:17 UTC, the EHR vendor pushed an undocumented RxNorm code system version change. FHIR MedicationRequest resources now contain unrecognized code system URIs (urn:oid:2.16.840.1.113883.6.88 vs expected http://www.nlm.nih.gov/research/umls/rxnorm). Drug-interaction validation is silently failing for 847 inpatient records across St. Mary's, General Hospital, and Children's Medical.

TASK: As the monitoring agent, analyze this schema drift event. Confirm:
1. The scope: which FHIR resource types are affected
2. Which patients are at risk (847 inpatient records)
3. The clinical risk level (drug-interaction validation failure → patient safety issue)
4. Why this is HIPAA-reportable

Respond with your detection analysis as an Atlas monitoring agent.`,
        fallbackSummary:
          "FHIR MedicationRequest schema drift confirmed. 847 inpatient records affected across 3 hospitals. Drug-interaction validation pipeline at 0% — critical patient safety risk. HIPAA Breach Notification Rule triggered (PHI exposure window). Atlas detection latency: 4 minutes vs 2.5-hour manual baseline.",
        skillsInvoked: [
          {
            name: "FHIR Schema Validation Skill",
            finding: "RxNorm code system URI mismatch in 847 MedicationRequest resources. Expected: http://www.nlm.nih.gov/research/umls/rxnorm. Received: urn:oid:2.16.840.1.113883.6.88 (legacy OID format).",
            duration: "3.8 min",
          },
          {
            name: "Clinical Risk Assessment Skill",
            finding: "Drug-interaction validation: 0% of 847 records passing. 12 critical patients on high-risk polypharmacy flagged for immediate pharmacist review.",
            duration: "1.2 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "HIPAA Breach Notification Policy",
            rule: "HIPAA-BN-001: PHI Exposure >500 Records",
            outcome: "TRIGGERED — breach notification window: 60 days",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Diagnose Root Cause",
        icon: "brain",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001).

PRIOR DETECTION: FHIR schema drift confirmed — 847 inpatient records with invalid RxNorm code system URIs. Drug-interaction validation at 0%.

TASK: Diagnose the root cause. The EHR vendor (Epic Systems) pushed an undocumented upgrade from RxNorm HTTP URIs to legacy OID format. The FHIR validator (Smile CDR) does not recognize the OID format.

Diagnose:
1. Root cause: EHR vendor version bump without change notification
2. Impact propagation: FHIR → drug-interaction engine → pharmacist workflow → patient safety
3. Why the standard monitoring did not catch this earlier
4. Which runbooks should be activated for remediation

Respond with your root cause analysis.`,
        fallbackSummary:
          "Root cause: Epic Systems v8.4.2 upgrade changed RxNorm code system from HTTP URI to OID format without FHIR change notification. Smile CDR FHIR validator does not support OID-format RxNorm. Impact chain: 847 records → 0 drug-interaction checks → 12 critical polypharmacy patients unmonitored. Remediation plan: URI normalization layer + re-validation pipeline.",
        skillsInvoked: [
          {
            name: "Drug Interaction Pattern Analyzer Skill",
            finding: "12 patients on 5+ concurrent medications with no interaction check in 4 hours. Highest-risk: Warfarin + NSAIDs (3 patients), Digoxin + Amiodarone (2 patients).",
            duration: "2.1 min",
          },
          {
            name: "EHR Audit Trail Skill",
            finding: "Epic v8.4.2 upgrade deployed at 01:58 UTC — 19 minutes before first anomaly detected. No change notification received. Changelog: 'RxNorm terminology updates for ICD-11 compatibility.'",
            duration: "0.8 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "FHIR Schema Drift Response Runbook",
            result: "Initiated: URI normalization layer activated between Epic and FHIR validator. Estimated fix time: 22 minutes.",
          },
        ],
        policiesChecked: [
          {
            name: "FDA 21 CFR Part 11 Audit Policy",
            rule: "21CFR-11-001: Automated system change audit required",
            outcome: "COMPLIANT — audit trail captured at T+4 min",
          },
        ],
      },
      {
        key: "remediate",
        label: "Execute Remediation",
        icon: "wrench",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001).

ROOT CAUSE CONFIRMED: Epic v8.4.2 OID-format RxNorm URIs breaking Smile CDR FHIR validator. 847 records need reprocessing.

TASK: Execute the autonomous remediation plan:
1. Activate URI normalization layer (OID → HTTP URI translation for RxNorm codes)
2. Re-route the 847 flagged MedicationRequest records through the corrected validation pipeline
3. Re-run drug-interaction checks for all 847 records
4. Escalate the 12 critical polypharmacy patients to on-call pharmacist
5. Send HIPAA-compliant incident notification to compliance team

Describe each remediation action as you execute it.`,
        fallbackSummary:
          "Remediation complete in 22 minutes. URI normalization layer active — translating OID to HTTP URI format in real-time. 847 records reprocessed through corrected validation pipeline. Drug-interaction checks restored: 834/847 passed (13 flagged for pharmacist review, 12 critical escalated). HIPAA incident notification sent to compliance team. Epic notified via vendor portal.",
        skillsInvoked: [
          {
            name: "Automated Schema Remediation Skill",
            finding: "URI normalization layer deployed. 847 MedicationRequest records re-routed through normalization middleware. Processing rate: 38 records/second. ETA: 22 minutes.",
            duration: "22 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Clinical Safety Escalation Runbook",
            result: "12 critical polypharmacy patients escalated to on-call pharmacist (Dr. Chen). Automated HIPAA breach notification queued for compliance team. Vendor incident #INC-2026-04-12-001 opened with Epic.",
          },
          {
            name: "Data Re-Validation Pipeline Runbook",
            result: "847 records re-validated. 834 passed drug-interaction check. 13 flagged for manual review (no high-risk interactions found — conservative flagging applied). Pipeline restored to 98.5% pass rate.",
          },
        ],
        policiesChecked: [
          {
            name: "HL7 FHIR R4 Compliance Policy",
            rule: "FHIR-R4-001: Resource validation before clinical use",
            outcome: "RESTORED — 98.5% of records now passing FHIR validation",
          },
          {
            name: "HIPAA Minimum Necessary Standard",
            rule: "HIPAA-MN-001: PHI access limited to clinical need",
            outcome: "COMPLIANT — remediation access logged and scoped to affected records only",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & Close",
        icon: "shield-check",
        prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001).

REMEDIATION EXECUTED:
- URI normalization layer active and processing
- 847 records re-validated (834 passed, 13 pharmacist-reviewed)
- Critical escalations complete
- HIPAA notification sent

TASK: Validate that the self-healing is complete and the system is stable:
1. Confirm drug-interaction validation pipeline is restored
2. Confirm no further patient safety issues
3. Confirm HIPAA compliance is maintained
4. Produce the incident post-mortem summary (automated)
5. Recommend preventive controls for future schema drift

Provide your validation summary and close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. Drug-interaction validation restored to 98.5% (baseline: 99.8% — 1.3% delta from conservative flagging; pharmacist-reviewed, no adverse events). Patient safety confirmed — 0 clinical incidents resulted from the 4-minute detection window. HIPAA breach notification filed (no patient harm, notification within required window). Atlas autonomous resolution: 22 minutes vs estimated 4.5-hour manual baseline. Preventive control added: EHR vendor change notification webhook + pre-production schema validation gate.",
        skillsInvoked: [
          {
            name: "Compliance Verification Skill",
            finding: "Post-healing compliance audit complete. All HIPAA, FDA 21 CFR Part 11, and HL7 FHIR R4 controls verified. Incident documentation generated and filed. No regulatory violations.",
            duration: "3.2 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Incident Post-Mortem Runbook",
            result: "Automated post-mortem generated: timeline, root cause, remediation steps, business impact, preventive controls. Sent to CMO, CTO, Compliance Officer. Follow-up action: Epic SLA review meeting scheduled.",
          },
        ],
        policiesChecked: [
          {
            name: "US Core 6.1 Data Quality Policy",
            rule: "USCORE-DQ-001: Continuous data quality monitoring",
            outcome: "COMPLIANT — monitoring reinstated with enhanced schema change alerting",
          },
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
        "Epic Systems notified and vendor incident opened",
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
    pipelineId: "49e8484f-4cd9-4b05-a66c-06c2d9cc3255",
    industry: "Financial Services",
    incidentTitle: "Fraud Model Precision Collapse — BNPL Population Shift",
    incidentSeverity: "critical",
    incidentType: "Model Drift",
    incidentSummary:
      "BNPL merchant-category population shift caused fraud detection model precision to collapse from 94.2% to 71.8% over 6 hours — generating 340 false positives and blocking $1.2M in legitimate BNPL transactions. SR 11-7 model risk guardrails triggered.",
    triggerMetric: {
      label: "Fraud Model Precision",
      before: "94.2%",
      after: "71.8%",
      unit: "on BNPL transactions",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Drift",
        icon: "activity",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001), an Atlas AI agent managing production fraud model health under SR 11-7 model risk guidelines.

INCIDENT:
Over 6 hours, the production fraud detection model (FDM-v3.2) precision has dropped from 94.2% to 71.8% on BNPL transactions. 340 false positives generated, blocking $1.2M in legitimate BNPL transactions. A BNPL merchant-category population shift appears to be the driver.

TASK: Analyze and confirm the model drift event:
1. Confirm the precision drop and its statistical significance
2. Identify BNPL merchant-category population shift as root cause
3. Assess false positive impact on customers
4. Determine if SR 11-7 model risk escalation thresholds are breached

Respond with your drift detection analysis.`,
        fallbackSummary:
          "Fraud model precision collapse confirmed: 94.2% → 71.8% (22.4 percentage point drop). BNPL merchant category now 34% of transaction volume (up from 12% in training data). 340 false positives generated in 6 hours — blocking $1.2M legitimate transactions. SR 11-7 escalation threshold breached (>15pp precision drop requires immediate action). Challenger model SH-FIN-CHAL-001 activated for shadow comparison.",
        skillsInvoked: [
          {
            name: "Model Drift Detection Skill",
            finding: "Production model FDM-v3.2 precision: 94.2% → 71.8% on BNPL segment. PSI (Population Stability Index): 0.34 (threshold: 0.25). BNPL merchant category: 34% of volume vs 12% in training data. Drift confirmed — BNPL population shift.",
            duration: "4.2 min",
          },
          {
            name: "False Positive Pattern Analyzer Skill",
            finding: "340 false positives in 6 hours. Customer impact: $1.2M legitimate transactions blocked. Predominantly: BNPL installment payments (Affirm, Klarna, Afterpay). 87% of false positives are first-time BNPL transactions by existing verified customers.",
            duration: "2.8 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "SR 11-7 Model Risk Policy",
            rule: "SR11-7-002: Precision drop >15pp requires immediate escalation",
            outcome: "TRIGGERED — 22.4pp drop exceeds threshold. Model Risk Committee notified.",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Diagnose & Shadow Test",
        icon: "brain",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001).

DRIFT CONFIRMED: FDM-v3.2 precision 94.2% → 71.8%. BNPL PSI 0.34. 340 false positives. SR 11-7 threshold breached.

TASK: Diagnose root cause and run shadow challenger model validation:
1. Confirm root cause: BNPL merchant category underrepresented in training data (12% vs 34% live)
2. The challenger model (FDM-v3.2-CHAL) was trained with 30-day holdout data including BNPL expansion — run it on the last 6 hours of transactions
3. Compare challenger precision vs production on BNPL segment
4. Determine if challenger is ready for zero-downtime swap under FCRA/SR 11-7

Provide your diagnosis and challenger model validation results.`,
        fallbackSummary:
          "Root cause confirmed: Training data BNPL representation gap (12% training vs 34% live volume). Challenger model FDM-v3.2-CHAL validated on 30-day holdout: precision 93.8% on BNPL segment (vs 71.8% production). Zero-downtime swap approved under SR 11-7 Model Risk Policy — challenger outperforms production by 22pp on the affected segment. FCRA adverse action notices queued for the 340 false positives.",
        skillsInvoked: [
          {
            name: "Champion-Challenger Validation Skill",
            finding: "FDM-v3.2-CHAL (30-day holdout training): BNPL precision 93.8% (vs 71.8% production). Overall precision: 95.1% (vs 93.4% production). Challenger approved for zero-downtime model swap.",
            duration: "8.4 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Model Swap Preparation Runbook",
            result: "Zero-downtime swap package prepared. Traffic routing: 100% → challenger. Rollback checkpoint: FDM-v3.2 state preserved for 72 hours. Swap window: off-peak (02:00-04:00 UTC).",
          },
        ],
        policiesChecked: [
          {
            name: "FCRA Adverse Action Policy",
            rule: "FCRA-AA-001: Customers declined must receive adverse action notice within 30 days",
            outcome: "TRIGGERED — 340 FCRA notices queued for same-day delivery",
          },
        ],
      },
      {
        key: "remediate",
        label: "Execute Model Swap",
        icon: "wrench",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001).

CHALLENGER VALIDATED: FDM-v3.2-CHAL precision 93.8% on BNPL segment. Zero-downtime swap approved.

TASK: Execute the zero-downtime model swap:
1. Route 100% of fraud scoring traffic to FDM-v3.2-CHAL
2. Re-score the 340 false positives from the last 6 hours
3. Release blocked legitimate transactions
4. Send FCRA adverse action notices for any remaining declines
5. Notify the fraud operations team and Model Risk Committee of the completed swap

Describe each action as you execute the model swap.`,
        fallbackSummary:
          "Model swap executed: FDM-v3.2-CHAL live at 02:14 UTC. 340 false positives re-scored — 312 released (legitimate), 28 confirmed fraud (blocked appropriately). $1.12M in blocked legitimate transactions released. 28 FCRA adverse action notices sent (confirmed fraud declines). Fraud precision restored to 93.8%. Model Risk Committee notified. SR 11-7 model swap documentation filed.",
        skillsInvoked: [
          {
            name: "Production Traffic Router Skill",
            finding: "Traffic routing: 100% → FDM-v3.2-CHAL at T+0:00. Zero-downtime achieved — no transaction scoring gap. Rollback threshold: >2pp precision drop in 15 minutes.",
            duration: "0.3 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "False Positive Release Runbook",
            result: "340 transactions re-scored under FDM-v3.2-CHAL. 312 released (precision confirmed legitimate). 28 remain blocked (true fraud confirmed). $1.12M customer funds released. Customer notification: 312 re-authorization messages sent.",
          },
          {
            name: "Regulatory Notification Runbook",
            result: "28 FCRA adverse action notices sent (legal requirement for confirmed fraud declines). SR 11-7 model swap documentation submitted to Model Risk Committee. OCC notification prepared if precision doesn't stabilize within 4 hours.",
          },
        ],
        policiesChecked: [
          {
            name: "SR 11-7 Model Swap Protocol",
            rule: "SR11-7-004: Zero-downtime swap with 72h rollback window",
            outcome: "COMPLIANT — swap executed within protocol. Rollback checkpoint active.",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & Monitor",
        icon: "shield-check",
        prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001).

MODEL SWAP COMPLETE: FDM-v3.2-CHAL live. 312 false positives released. Precision restored to 93.8%.

TASK: Validate the swap is stable and close the incident:
1. Confirm FDM-v3.2-CHAL precision is stable over the last 30 minutes
2. Confirm no new false positive clusters forming
3. Confirm FCRA compliance for all 340 original false positives
4. Generate SR 11-7 model incident report
5. Recommend BNPL data pipeline improvements to prevent recurrence

Provide your post-swap validation and close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. FDM-v3.2-CHAL stable at 93.8% precision for 30 minutes post-swap. No new false positive clusters. All FCRA obligations met. Atlas prevented: $1.2M customer harm, 340 wrongful declines, OCC model risk citation. Total resolution time: 47 minutes (vs 8-12 hour manual model retraining + deployment). Recommended: BNPL merchant-category retraining monthly + real-time PSI alerting at 0.20.",
        skillsInvoked: [
          {
            name: "Post-Swap Model Monitor Skill",
            finding: "FDM-v3.2-CHAL: Precision 93.8% (stable ±0.2pp over 30 min). False positive rate: 3.1% (baseline: 5.8%). No anomalous patterns. BNPL segment precision: 93.1%. System health: GREEN.",
            duration: "30 min monitoring",
          },
        ],
        runbooksTriggered: [
          {
            name: "SR 11-7 Incident Documentation Runbook",
            result: "Model risk incident report generated: timeline, root cause (training data gap), champion-challenger results, swap execution, business impact, FCRA compliance summary. Submitted to Chief Model Risk Officer and Board Risk Committee.",
          },
        ],
        policiesChecked: [
          {
            name: "FCRA Ongoing Monitoring Policy",
            rule: "FCRA-OM-001: 30-day monitoring post adverse action event",
            outcome: "COMPLIANT — 30-day monitoring window initiated for 340 affected customers",
          },
        ],
      },
    ],
    resolution: {
      headline: "Fraud Model Restored — $1.12M Customer Transactions Released",
      autonomousActions: [
        "Precision collapse detected in real-time (94.2% → 71.8%)",
        "BNPL population shift identified as root cause via PSI analysis",
        "Challenger model FDM-v3.2-CHAL validated on 30-day holdout",
        "Zero-downtime model swap executed — no transaction scoring gap",
        "312 false-positive customer transactions released ($1.12M)",
        "28 FCRA adverse action notices sent (confirmed fraud)",
        "SR 11-7 model incident report filed with Model Risk Committee",
      ],
      metricsRestored: [
        { label: "Fraud Model Precision", value: "93.8% (restored)" },
        { label: "False Positive Rate", value: "3.1% (vs 28.2% peak)" },
        { label: "Transactions Released", value: "$1.12M (312 customers)" },
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
    pipelineId: "2b4f6e7f-ee1a-4f2b-8f87-a675e0681d69",
    industry: "Manufacturing",
    incidentTitle: "CNC Mill #7 Bearing Failure Imminent — ISO 10816-3 Zone C",
    incidentSeverity: "critical",
    incidentType: "Equipment Anomaly",
    incidentSummary:
      "CNC Mill #7 bearing vibration has crossed ISO 10816-3 Zone C at 14.7 mm/s RMS — a 340% surge from baseline — predicting imminent bearing failure within 4 hours. $2.1M weekly production output at risk.",
    triggerMetric: {
      label: "Vibration RMS (CNC Mill #7)",
      before: "3.4 mm/s",
      after: "14.7 mm/s",
      unit: "ISO 10816-3 Zone C exceeded",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Anomaly",
        icon: "activity",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001), an Atlas AI agent managing predictive maintenance under ISO 55001 asset management standards.

SENSOR ALERT:
CNC Mill #7 (Serial: CNC-M7-2019-004) at Detroit Plant 2:
- Current vibration: 14.7 mm/s RMS (ISO 10816-3 Zone C — Machine Damage Zone)
- Baseline: 3.4 mm/s RMS (measured 72 hours ago)
- Rate of increase: 11.3 mm/s over 6 hours (340% surge)
- Bearing temperature: 87°C (up from 62°C baseline)
- Acoustic emission: 94 dB (threshold: 85 dB)

TASK: Analyze this sensor data. Predict:
1. Bearing failure probability and time-to-failure window
2. ISO 10816-3 zone classification and action required
3. Impact on $2.1M weekly production output if unplanned failure occurs
4. OSHA safety risk assessment`,
        fallbackSummary:
          "CNC Mill #7 bearing failure imminent. Vibration at 14.7 mm/s RMS (ISO 10816-3 Zone C — Damage Zone). Predicted MTBF: 4 hours (±1 hour). Production impact: 14-hour unplanned downtime if no intervention = $2.1M output risk. OSHA 29 CFR 1910.212 machine guarding standard requires immediate action. Atlas prediction confidence: 94.2%.",
        skillsInvoked: [
          {
            name: "Vibration Pattern Analyzer Skill",
            finding: "CNC Mill #7: 14.7 mm/s RMS. FFT analysis: dominant frequency at 3× bearing race frequency (BPFO). Inner race defect pattern confirmed. Predicted failure window: 3.5–4.5 hours. Confidence: 94.2%.",
            duration: "1.8 min",
          },
          {
            name: "Production Impact Modeler Skill",
            finding: "Unplanned failure scenario: 14-hour downtime, 3 production orders delayed ($2.1M weekly output). Planned 90-minute window: zero order delays, $0 lost output. Risk-adjusted savings: $1.85M.",
            duration: "1.4 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "ISO 55001 Asset Management Policy",
            rule: "ISO55001-AM-007: Zone C vibration requires immediate maintenance action",
            outcome: "TRIGGERED — predictive maintenance window initiated within 2 hours",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Pre-Stage Spares & Schedule",
        icon: "brain",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001).

BEARING FAILURE CONFIRMED: 4-hour MTBF window. OSHA action required. $2.1M output at risk.

TASK: Coordinate the pre-maintenance actions:
1. Check spare parts inventory for CNC Mill #7 bearing (SKF 6311-2Z)
2. Schedule 90-minute emergency maintenance window (next 2 hours)
3. Reroute 3 active production orders (ORD-2026-4401, -4402, -4403) to CNC Mills #3 and #8
4. Dispatch maintenance crew (Tech Lead: Mike Ramirez) with parts pre-staged
5. Confirm OSHA machine safety lockout/tagout procedure is queued

Coordinate all pre-maintenance actions.`,
        fallbackSummary:
          "Pre-staging complete. SKF 6311-2Z bearing confirmed in Plant 2 inventory (Bin: A-12-B, Qty: 3). Emergency maintenance window scheduled: 14:30–16:00 UTC. Production orders ORD-2026-4401, -4402, -4403 rerouted to CNC Mills #3 and #8 — zero delivery impact. Maintenance crew dispatched: Tech Lead Mike Ramirez + 2 technicians, parts pre-staged at machine. OSHA LOTO procedure initiated.",
        skillsInvoked: [
          {
            name: "Inventory & Logistics Skill",
            finding: "SKF 6311-2Z bearing: In stock (Bin A-12-B, Qty 3). Bearing grease: Sufficient. Estimated parts staging: 15 minutes. No external procurement required.",
            duration: "0.6 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Emergency Maintenance Scheduling Runbook",
            result: "Maintenance window confirmed: 14:30–16:00 UTC today. Crew dispatched. Production orders rerouted. LOTO procedure queued. Supervisor Larry Sims notified via EAM system.",
          },
          {
            name: "Production Order Rerouting Runbook",
            result: "ORD-2026-4401: CNC #3 (available capacity: 73%, ETA unchanged). ORD-2026-4402: CNC #8 (available capacity: 61%, 45-min delay — within SLA). ORD-2026-4403: Queued post-maintenance. Zero customer SLA breach.",
          },
        ],
        policiesChecked: [
          {
            name: "OSHA 29 CFR 1910.147 Lockout/Tagout Policy",
            rule: "LOTO-001: Authorized lockout before bearing replacement",
            outcome: "INITIATED — LOTO procedure queued for 14:30 UTC maintenance window",
          },
        ],
      },
      {
        key: "remediate",
        label: "Execute Maintenance",
        icon: "wrench",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001).

PRE-STAGING COMPLETE: Bearing replacement window at 14:30 UTC. Crew dispatched. Orders rerouted.

TASK: Monitor the maintenance execution and confirm successful completion:
1. Confirm LOTO lockout applied (machine isolated from energy sources)
2. Bearing replacement in progress — SKF 6311-2Z installed
3. Post-installation vibration check: confirm return to Zone A (<2.3 mm/s RMS)
4. Confirm LOTO removed and machine brought back online
5. Verify production orders resume on CNC Mill #7

Report the maintenance completion.`,
        fallbackSummary:
          "Bearing replacement complete at 15:58 UTC (88 minutes — within 90-minute window). LOTO applied and released per OSHA procedure. Post-installation vibration: 2.1 mm/s RMS (ISO 10816-3 Zone A — Good). Temperature normalized to 58°C. CNC Mill #7 returned to production at 16:02 UTC. ORD-2026-4403 resumed. All 3 production orders on track — zero customer SLA breach.",
        skillsInvoked: [
          {
            name: "Post-Maintenance Validation Skill",
            finding: "Post-bearing replacement: vibration 2.1 mm/s RMS (Zone A), temperature 58°C (baseline: 62°C), acoustic emission 76 dB. All sensors in normal range. Machine cleared for production.",
            duration: "0.5 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Machine Recommissioning Runbook",
            result: "CNC Mill #7 recommissioned: LOTO removed, power restored, test cycle run (10 minutes), all parameters normal. Production order ORD-2026-4403 resumed at 16:05 UTC.",
          },
        ],
        policiesChecked: [
          {
            name: "ISO 10816-3 Post-Maintenance Standard",
            rule: "ISO10816-003: Post-maintenance vibration must return to Zone A",
            outcome: "COMPLIANT — 2.1 mm/s RMS confirmed Zone A. Machine cleared.",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & Update CMMS",
        icon: "shield-check",
        prompt: `You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001).

MAINTENANCE COMPLETE: CNC Mill #7 bearing replaced. Vibration: 2.1 mm/s RMS (Zone A). Production resumed.

TASK: Close out the incident:
1. Update CMMS (Computerized Maintenance Management System) with work order completion
2. Update predictive maintenance schedule for CNC Mill #7 (next inspection: 30 days)
3. Analyze which other CNC mills may have similar bearing wear (preventive scan)
4. Generate incident report for plant manager
5. Recommend enhanced vibration monitoring threshold for BNPL segment

Provide your post-maintenance validation and close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. CNC Mill #7 operating normally at Zone A. CMMS work order WO-2026-04-12-M7 closed. Next inspection scheduled: May 12, 2026. Preventive scan: CNC Mills #3 and #5 show early Zone B indicators — scheduled for inspection within 14 days. Atlas prevented: $2.1M unplanned downtime, OSHA recordable incident, 3 customer SLA breaches. Resolution: 88 minutes (vs 14-hour unplanned failure scenario).",
        skillsInvoked: [
          {
            name: "Fleet Health Assessment Skill",
            finding: "Preventive scan complete: 14 CNC mills evaluated. Mills #3 (4.1 mm/s) and #5 (4.8 mm/s) in Zone B — schedule inspection within 14 days. 12 mills in Zone A — normal. Updated PM schedule generated.",
            duration: "3.6 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "CMMS Update & PM Scheduling Runbook",
            result: "Work order WO-2026-04-12-M7 closed. Parts used: 1× SKF 6311-2Z bearing, 0.5L bearing grease. Next PM: May 12, 2026. Mills #3 and #5 inspection scheduled: April 26, 2026.",
          },
        ],
        policiesChecked: [
          {
            name: "ISO 55001 Asset Lifecycle Policy",
            rule: "ISO55001-AL-003: Post-maintenance CMMS update within 24 hours",
            outcome: "COMPLIANT — work order closed and PM schedule updated at T+2 hours",
          },
        ],
      },
    ],
    resolution: {
      headline: "Bearing Replaced in 88 min — $2.1M Output Protected",
      autonomousActions: [
        "Bearing failure predicted 4 hours before failure (Zone C detection)",
        "Production orders rerouted to CNC #3 and #8 — zero SLA breach",
        "Spare parts pre-staged from Plant 2 inventory (Bin A-12-B)",
        "90-minute emergency maintenance window scheduled",
        "OSHA LOTO procedure coordinated autonomously",
        "CNC Mill #7 returned to Zone A (2.1 mm/s RMS)",
        "Preventive scan identified Mills #3 and #5 for upcoming inspection",
      ],
      metricsRestored: [
        { label: "Vibration RMS", value: "2.1 mm/s (Zone A restored)" },
        { label: "Production Output Protected", value: "$2.1M weekly output" },
        { label: "Downtime Avoided", value: "14 hr unplanned → 90 min planned" },
        { label: "Resolution Time", value: "88 min (within maintenance window)" },
        { label: "Customer SLA Breaches", value: "0" },
      ],
    },
  },

  retail: {
    key: "retail",
    agentId: "56ef232d-8d91-428d-8e81-d8ef03c6ecfa",
    agentName: "Order Fulfillment Recovery Agent",
    agentCode: "SH-RETAIL-001",
    pipelineId: "9ac7e395-4f4f-4ad3-8076-0b0ad66975bb",
    industry: "Retail / E-Commerce",
    incidentTitle: "Primary WMS API Down — 1,847 Orders Queued, $340K SLA Exposure",
    incidentSeverity: "critical",
    incidentType: "System Failure",
    incidentSummary:
      "Primary Warehouse Management System API went offline during peak shopping event. Error rate hit 87% with 1,847 orders queued — including 312 same-day delivery commitments at $340K SLA exposure. PCI-DSS cardholder data scope active.",
    triggerMetric: {
      label: "WMS API Error Rate",
      before: "0.3%",
      after: "87%",
      unit: "1,847 orders queued",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Outage",
        icon: "activity",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001), an Atlas AI agent managing e-commerce fulfillment operations under PCI-DSS compliance.

INCIDENT:
Primary WMS API (Warehouse Management System) went offline at 11:23 UTC during Black Friday event:
- WMS API error rate: 87% (vs baseline 0.3%)
- Orders queued: 1,847 (unable to confirm with warehouse)
- Same-day delivery at risk: 312 orders ($340K SLA exposure)
- PCI-DSS cardholder data in the order queue — scope is active
- 3 backup WMS endpoints available: WMS-BACKUP-1, WMS-BACKUP-2, WMS-BACKUP-3

TASK: Analyze the outage scope and immediate risk:
1. Confirm the WMS API failure and scope
2. Identify which orders are at SLA risk (same-day: 312)
3. Assess PCI-DSS implications of orders in the queue
4. Confirm availability of 3 backup WMS endpoints`,
        fallbackSummary:
          "WMS API primary endpoint confirmed offline at 11:23 UTC. 1,847 orders queued (312 same-day, $340K SLA). Root cause: AWS us-east-1 availability zone disruption affecting primary WMS cluster. PCI-DSS scope active — cardholder data in queue, no breach (data encrypted at rest). 3 backup endpoints confirmed available (WMS-BACKUP-1: EU-WEST, WMS-BACKUP-2: AP-SOUTHEAST, WMS-BACKUP-3: US-WEST).",
        skillsInvoked: [
          {
            name: "WMS Health Monitor Skill",
            finding: "Primary WMS: DOWN (11:23 UTC, AWS us-east-1 AZ failure). Error rate: 87%. Queue depth: 1,847 orders. WMS-BACKUP-1 (EU-WEST): UP 99.2%. WMS-BACKUP-2 (AP-SOUTHEAST): UP 98.7%. WMS-BACKUP-3 (US-WEST): UP 99.8%.",
            duration: "0.8 min",
          },
          {
            name: "SLA Risk Calculator Skill",
            finding: "SLA exposure: 312 same-day delivery orders. Cutoff: 14:00 UTC (2.6 hours). Financial exposure: $340K SLA penalties + $890K revenue at risk (abandoned carts). Priority queue: ORD-20260412-001 to ORD-20260412-312 escalated to P1.",
            duration: "1.1 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "PCI-DSS Data Protection Policy",
            rule: "PCI-DSS-003: Cardholder data in queues must be encrypted and access-controlled",
            outcome: "COMPLIANT — queue data encrypted at rest (AES-256). No cardholder data exposure.",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Activate Backup Routing",
        icon: "brain",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001).

WMS OUTAGE CONFIRMED: 1,847 orders queued, 312 same-day at SLA risk. 3 backup endpoints available.

TASK: Design the failover routing strategy:
1. Distribute 1,847 orders across WMS-BACKUP-1, -2, -3 based on capacity
2. Priority route same-day orders (312) to the highest-capacity backup
3. Estimate order clearance time across the 3 backup endpoints
4. Confirm PCI-DSS data handling during backup routing
5. Plan customer notification for any orders that will miss same-day SLA

Provide your failover routing plan.`,
        fallbackSummary:
          "Failover routing plan: WMS-BACKUP-3 (US-WEST, highest performance): 312 same-day priority orders + 600 standard. WMS-BACKUP-1 (EU-WEST): 700 standard orders. WMS-BACKUP-2 (AP-SOUTHEAST): 235 remaining. Estimated clearance: 22 minutes for same-day, 47 minutes for all 1,847. 8 same-day orders cannot meet 14:00 UTC cutoff — customer notification queued. PCI-DSS backup routing confirmed compliant.",
        skillsInvoked: [
          {
            name: "Fulfillment Capacity Optimizer Skill",
            finding: "Optimal routing: BACKUP-3 (US-WEST, 58 orders/min) → 312 same-day. BACKUP-1 (EU-WEST, 45 orders/min) → 700 standard. BACKUP-2 (AP-SOUTHEAST, 32 orders/min) → 235 remaining. 4 minutes to all backups active.",
            duration: "2.3 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "WMS Failover Activation Runbook",
            result: "Traffic routing switched: 0% primary, 100% across 3 backups. DNS TTL reduced to 30 seconds. Order routing service updated. 4 minutes to full failover.",
          },
          {
            name: "SLA Breach Prevention Runbook",
            result: "304 of 312 same-day orders routable within SLA (97.4%). 8 orders flagged for customer notification (late by 30-90 minutes). $340K SLA exposure reduced to $9.2K.",
          },
        ],
        policiesChecked: [
          {
            name: "PCI-DSS Backup System Policy",
            rule: "PCI-DSS-007: Backup systems must maintain equivalent security controls",
            outcome: "COMPLIANT — backup endpoints certified PCI-DSS Level 1. TLS 1.3 enforced.",
          },
        ],
      },
      {
        key: "remediate",
        label: "Process Orders & Notify",
        icon: "wrench",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001).

FAILOVER ACTIVE: 3 backup WMS endpoints routing 1,847 orders. 304/312 same-day orders on track.

TASK: Execute the order processing and customer communication:
1. Confirm 1,847 orders are being processed across backup endpoints
2. Send proactive notifications to 8 customers whose same-day delivery will be late
3. Offer compensation to the 8 affected customers (credit/upgrade)
4. Monitor order clearance rate against 14:00 UTC cutoff
5. Report order clearance status

Provide order processing update.`,
        fallbackSummary:
          "Order processing underway: 1,234/1,847 orders processed in 22 minutes. 304 same-day orders confirmed on track for 14:00 UTC cutoff. 8 late notifications sent with $15 store credit + free upgrade to next-day delivery. Customer satisfaction maintained — 3 customers responded positively to proactive notification. Clearance rate: 56 orders/minute across 3 backups.",
        skillsInvoked: [
          {
            name: "Order Queue Processor Skill",
            finding: "Order clearance: 1,234/1,847 (66.8%) in 22 min. Same-day: 304/312 confirmed on time. Rate: 56 orders/min. ETA all orders: 47 min from failover activation.",
            duration: "22 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Customer Notification Runbook",
            result: "8 late-order notifications sent via email + SMS at 11:47 UTC (24 min after outage). Offer: $15 store credit + free upgrade to next-day. 3 customers responded positively. 0 chargebacks initiated.",
          },
        ],
        policiesChecked: [
          {
            name: "Consumer Protection Policy",
            rule: "CP-001: Customer notification within 30 minutes of SLA breach risk",
            outcome: "COMPLIANT — 8 customers notified at T+24 min (before cutoff time)",
          },
          {
            name: "PCI-DSS Transaction Integrity Policy",
            rule: "PCI-DSS-009: All transactions must be logged and reconciled",
            outcome: "COMPLIANT — all 1,847 order transactions logged in audit trail",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & Restore",
        icon: "shield-check",
        prompt: `You are the Order Fulfillment Recovery Agent (SH-RETAIL-001).

ORDER PROCESSING: 1,847 orders cleared. Primary WMS recovering. 304 same-day orders on track.

TASK: Complete the incident resolution:
1. Confirm all 1,847 orders processed successfully
2. Confirm 304 same-day orders met 14:00 UTC SLA
3. Validate no PCI-DSS data exposure during the outage and failover
4. Generate the incident post-mortem
5. Recommend infrastructure improvements (multi-AZ WMS primary, automated failover)

Close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. 1,847/1,847 orders processed (47 min). 304/312 same-day orders met SLA cutoff. 8 customers compensated ($120 total). Primary WMS restored at 13:42 UTC. PCI-DSS audit: no cardholder data exposure. Atlas prevented: $340K SLA exposure, $890K abandoned cart revenue. Detection to full failover: 4 minutes (vs 35-minute manual baseline). Recommended: multi-AZ WMS primary + sub-2-minute automated failover.",
        skillsInvoked: [
          {
            name: "Post-Incident Compliance Audit Skill",
            finding: "PCI-DSS audit complete: No cardholder data exposure. All 1,847 orders logged and reconciled. 0 unauthorized access events. Backup routing audit trail complete. Incident report ready.",
            duration: "4.1 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Primary WMS Restoration Runbook",
            result: "Primary WMS restored at 13:42 UTC (AWS AZ recovered). Traffic gradually shifted back 10%→50%→100% over 20 minutes. All backup endpoints standing down. DNS TTL restored to 300 seconds.",
          },
        ],
        policiesChecked: [
          {
            name: "Business Continuity Policy",
            rule: "BCP-001: Incident post-mortem within 24 hours of resolution",
            outcome: "COMPLIANT — post-mortem generated automatically at incident close",
          },
        ],
      },
    ],
    resolution: {
      headline: "1,847 Orders Processed — $340K SLA Exposure Reduced to $9.2K",
      autonomousActions: [
        "WMS API failure detected in 90 seconds (0.3% → 87% error rate)",
        "3 backup WMS endpoints activated in 4 minutes",
        "1,847 orders routed across backup endpoints — zero lost",
        "304/312 same-day orders met 14:00 UTC SLA cutoff",
        "8 customers proactively notified with compensation offers",
        "PCI-DSS compliance maintained throughout — no data exposure",
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
    pipelineId: "5409183e-3be8-4021-82a4-41aa49cd25b2",
    industry: "Energy / Utilities",
    incidentTitle: "847 MW Wind Farm Trip — NERC BAL-003 Frequency Restoration Clock Running",
    incidentSeverity: "critical",
    incidentType: "Generation Loss",
    incidentSummary:
      "Offshore-Alpha wind farm tripped offline — 847 MW generation shortfall. Grid frequency dropped to 59.63 Hz, breaching NERC alert threshold (59.7 Hz). NERC BAL-003 10-minute restoration clock running. 680,000 households at risk if frequency drops below 59.5 Hz.",
    triggerMetric: {
      label: "Grid Frequency",
      before: "60.02 Hz",
      after: "59.63 Hz",
      unit: "NERC limit: ±0.5 Hz",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Frequency Deviation",
        icon: "activity",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001), an Atlas AI agent managing grid frequency under NERC CIP-014 and BAL-003 reliability standards.

GRID ALERT:
Offshore-Alpha wind farm (847 MW) tripped offline at 14:17 UTC due to equipment fault.
- Grid frequency: 60.02 Hz → 59.63 Hz (−0.39 Hz deviation)
- NERC CIP-014 alert threshold: ±0.5 Hz
- NERC BAL-003: 10-minute restoration clock started at 14:17 UTC
- Frequency nadir: 59.63 Hz (still above 59.5 Hz emergency threshold)
- 680,000 households at risk if frequency drops below 59.5 Hz
- Available generation response: 4 gas peakers (CT-1 through CT-4)

TASK: Analyze the grid emergency:
1. Confirm frequency deviation and NERC compliance status
2. Identify available generation resources for frequency response
3. Calculate MW shortfall and response requirement
4. Assess cascading failure risk`,
        fallbackSummary:
          "Grid emergency confirmed. Frequency: 59.63 Hz (NERC alert zone). 847 MW shortfall in Balancing Area West. NERC BAL-003 10-minute clock running (T+3 min). Available response: CT-1 (180 MW, 8 min), CT-2 (210 MW, 9 min), CT-3 (245 MW, 11 min), CT-4 (257 MW, 12 min) — 892 MW combined. Cascading failure probability: 34% if no response within 7 minutes. Atlas frequency response initiated.",
        skillsInvoked: [
          {
            name: "Real-Time Grid Frequency Monitor Skill",
            finding: "Frequency: 59.63 Hz (deviation: −0.39 Hz). Rate of change: −0.052 Hz/s. Predicted nadir: 59.41 Hz in 8 minutes without intervention. NERC BAL-003 restoration deadline: T+10 min (14:27 UTC). Cascading failure risk: 34%.",
            duration: "Real-time",
          },
          {
            name: "Generation Dispatch Optimizer Skill",
            finding: "Optimal dispatch: CT-1 (180 MW, 8 min ramp) + CT-2 (210 MW, 9 min ramp) + CT-4 (257 MW, partial — 245 MW requested) = 892 MW response. FERC Order 881 economic dispatch limits respected. Expected frequency recovery: 59.97 Hz at T+9.2 min.",
            duration: "2.1 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "NERC CIP-014 Reliability Policy",
            rule: "NERC-BAL003-001: Frequency restoration within 10 minutes of deviation",
            outcome: "CLOCK RUNNING — 3 minutes elapsed, 7 minutes remaining",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Dispatch Generation",
        icon: "brain",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001).

FREQUENCY: 59.63 Hz. 847 MW shortfall. NERC BAL-003 clock: T+3 min (7 min remaining). 892 MW peaker capacity available.

TASK: Execute the generation dispatch plan:
1. Issue dispatch instructions to CT-1 (180 MW), CT-2 (210 MW), CT-4 (245 MW requested)
2. Notify FERC market operator of emergency peaker commitment (within 5 min per FERC Open Access Tariff)
3. Verify EPA Clean Air Act operating hours before CT-1 and CT-4 dispatch
4. Monitor frequency as peakers respond
5. Coordinate with 3 neighboring balancing areas to avoid cascade

Provide dispatch execution status.`,
        fallbackSummary:
          "Dispatch executed at T+3 min: CT-1 dispatched (180 MW, 8 min ramp), CT-2 dispatched (210 MW, 9 min ramp), CT-4 dispatched (245 MW, partial, 12 min ramp). FERC market notification sent at T+4 min (within 5-min requirement). EPA hours verified: CT-1 (287/500h, approved), CT-2 (312/500h, approved), CT-4 (412/500h, approved). Neighboring balancing areas notified — no cascade risk.",
        skillsInvoked: [
          {
            name: "Grid Restoration Sequence Planner Skill",
            finding: "3-phase restoration: Phase 1 (T+3-8 min): CT-1 + CT-2 ramp (390 MW). Phase 2 (T+8-12 min): CT-4 ramp (245 MW). Phase 3 (T+12+): demand response if needed (350 MW available). Cascading failure probability: 34% → 3% with dispatch.",
            duration: "1.4 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Generation Shortfall Emergency Response Runbook",
            result: "CT-1: 180 MW dispatched (8 min ramp, confirmed). CT-2: 210 MW dispatched (9 min ramp, confirmed). CT-4: 245 MW dispatched (12 min ramp, confirmed). Total response: 635 MW online by T+9 min, 892 MW by T+12 min.",
          },
        ],
        policiesChecked: [
          {
            name: "FERC Open Access Tariff Policy",
            rule: "FERC-OAT-001: Market notification within 5 minutes of peaker commitment",
            outcome: "COMPLIANT — FERC notified at T+4 min (1 min to spare)",
          },
          {
            name: "EPA Clean Air Act Policy",
            rule: "EPA-CAA-001: Annual operating hours cap before dispatch",
            outcome: "COMPLIANT — CT-1: 287/500h, CT-2: 312/500h, CT-4: 412/500h. All approved.",
          },
        ],
      },
      {
        key: "remediate",
        label: "Restore Frequency",
        icon: "wrench",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001).

DISPATCH ACTIVE: CT-1 (180 MW ramp 8 min), CT-2 (210 MW ramp 9 min), CT-4 (245 MW ramp 12 min). NERC clock: T+7 min (3 min remaining).

TASK: Monitor frequency recovery and confirm NERC BAL-003 compliance:
1. Confirm frequency recovering above 59.7 Hz by T+9 min (NERC target)
2. Confirm no N-1 transmission violations as generation is added
3. Monitor for demand response activation if peakers don't fully respond
4. Confirm Offshore-Alpha restoration timeline from field crew
5. Report NERC BAL-003 compliance achievement

Provide frequency recovery status.`,
        fallbackSummary:
          "Frequency restored to 59.97 Hz at T+9.2 min (NERC BAL-003 COMPLIANT — within 10-min window). CT-1 + CT-2 fully online (390 MW). CT-4 at 68% ramp (168 MW, continuing). Total online: 558 MW. N-1 transmission scan: no violations. Demand response not activated (peakers sufficient). Offshore-Alpha relay repair: 4-6 hours (field crew dispatched). NERC event notification filed at T+11 min.",
        skillsInvoked: [
          {
            name: "Real-Time Grid Frequency Monitor Skill",
            finding: "Frequency recovery timeline: T+5 min: 59.71 Hz. T+7 min: 59.84 Hz. T+9.2 min: 59.97 Hz (NERC compliant). Rate of recovery: +0.034 Hz/min. Stability confirmed — no oscillation. NERC BAL-003: COMPLIANT.",
            duration: "9.2 min real-time",
          },
        ],
        runbooksTriggered: [
          {
            name: "NERC Event Reporting Runbook",
            result: "NERC BAL-003 event report filed at T+11 min (automatic). Report: frequency nadir 59.63 Hz, restoration to 59.97 Hz in 9.2 min, peaker dispatch 558 MW online. EIA-930 reporting triggered. No regulatory violation.",
          },
        ],
        policiesChecked: [
          {
            name: "NERC CIP-014 Reliability Policy",
            rule: "NERC-BAL003-001: Frequency must return above 59.7 Hz within 10 minutes",
            outcome: "COMPLIANT — 59.97 Hz achieved at T+9.2 min (0.8 min within window)",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & File Report",
        icon: "shield-check",
        prompt: `You are the Grid Operations Stability Agent (SH-ENERGY-001).

FREQUENCY RESTORED: 59.97 Hz at T+9.2 min. NERC BAL-003 compliant. 558 MW peaker generation online.

TASK: Close the grid emergency:
1. Confirm frequency stability (no oscillation over 30 minutes)
2. Plan Offshore-Alpha reconnection once relay repaired (4-6 hours)
3. File complete NERC BAL-003 event report
4. Assess peaker hour consumption and recommend demand response integration
5. Recommend automated frequency response improvements

Close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. Grid frequency stable at 60.01 Hz (±0.02 Hz over 30 minutes post-restoration). Offshore-Alpha estimated reconnection: 20:00 UTC. NERC BAL-003 event report filed — no violation. Atlas prevented: NERC violation ($1M–$25M fine risk), 680,000-household blackout, cascading failure across 3 balancing areas. Atlas response time: 9.2 min (vs 15-25 min manual). Recommended: automated frequency response pre-qualification of 4 additional peakers.",
        skillsInvoked: [
          {
            name: "Generation Dispatch Optimizer Skill",
            finding: "Post-event analysis: CT-4 ramping to full 245 MW by T+13 min. Offshore-Alpha reconnection plan: relay reset + 2-hour cool-down. Demand response reserve maintained for 6 hours. Grid stability score: 98/100.",
            duration: "30 min monitoring",
          },
        ],
        runbooksTriggered: [
          {
            name: "Grid Stability Monitoring Runbook",
            result: "30-minute post-event monitoring complete: frequency stable 59.95–60.03 Hz. No oscillation. CT-1/CT-2 optimal output. CT-4 ramping. Offshore-Alpha reconnection cleared for 20:00 UTC. NERC event report finalized and submitted.",
          },
        ],
        policiesChecked: [
          {
            name: "NERC CIP-014 Post-Event Reporting Policy",
            rule: "NERC-BAL003-003: Event report within 24 hours of frequency deviation",
            outcome: "COMPLIANT — report filed at T+11 min (automated, well within 24-hour window)",
          },
        ],
      },
    ],
    resolution: {
      headline: "Grid Frequency Restored in 9.2 min — NERC Compliant",
      autonomousActions: [
        "847 MW shortfall detected in <30 seconds (T+0)",
        "Generation dispatch optimized: 892 MW peaker response calculated",
        "CT-1 + CT-2 + CT-4 dispatched (635 MW online by T+9 min)",
        "FERC market notification filed at T+4 min (within 5-min requirement)",
        "Frequency restored: 59.97 Hz at T+9.2 min (NERC BAL-003 compliant)",
        "N-1 transmission scan: no violations",
        "NERC event report automatically filed at T+11 min",
      ],
      metricsRestored: [
        { label: "Grid Frequency", value: "59.97 Hz (restored)" },
        { label: "Generation Response", value: "558 MW online by T+9 min" },
        { label: "NERC Compliance", value: "BAL-003 met (9.2 min < 10 min limit)" },
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
    pipelineId: "b1e1acc7-620d-4d9b-9c76-f3d7138ae0ec",
    industry: "Insurance",
    incidentTitle: "Claims Fraud Triage FPR Spike — 620 Misclassified, 12 Regulators Triggered",
    incidentSeverity: "critical",
    incidentType: "Model Bias",
    incidentSummary:
      "Claims fraud triage model false positive rate spiked from 3.2% to 22.7% after biased retrain on non-representative dataset. 620 claims misclassified — 47 vulnerable claimants with delayed payouts, 12 state insurance regulators notified.",
    triggerMetric: {
      label: "Fraud Triage False Positive Rate",
      before: "3.2%",
      after: "22.7%",
      unit: "620 claims misclassified",
    },
    phases: [
      {
        key: "detect",
        label: "Detect Model Bias",
        icon: "activity",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001), an Atlas AI agent managing insurance claims processing under NAIC Model Act and GDPR Article 22 (automated decision-making) compliance.

INCIDENT:
Claims fraud triage model (FTM-v2.1) was retrained on a non-representative dataset that under-sampled minority claimant demographics. The false positive rate (legitimate claims flagged as fraud) spiked from 3.2% to 22.7% — 620 claims misclassified in 48 hours.
- 47 vulnerable claimants (elderly, disability) with delayed payouts
- 12 state insurance regulators received automated complaint reports
- GDPR Article 22 (automated decisions affecting individuals) — right-to-explanation required
- NAIC Model Act: discriminatory claims handling is a regulatory violation

TASK: Analyze the model bias event:
1. Confirm the FPR spike and identify which demographic groups are affected
2. Assess the regulatory exposure under NAIC and GDPR
3. Identify the 47 vulnerable claimants requiring priority remediation
4. Confirm if FTM-v2.1 should be immediately suspended`,
        fallbackSummary:
          "Model bias confirmed: FTM-v2.1 FPR 3.2% → 22.7%. Affected groups: Claimants aged 65+ (47% of false positives) and disability claimants (31% of false positives) — statistically significant bias against protected classes. NAIC Model Act violation: discriminatory claims handling. GDPR Art. 22 right-to-explanation triggered for all 620. 47 vulnerable claimants in acute financial hardship — priority review required. FTM-v2.1 suspended immediately.",
        skillsInvoked: [
          {
            name: "Bias Detection & Fairness Audit Skill",
            finding: "FTM-v2.1 FPR by demographic: Ages 65+ (FPR: 34.2% vs baseline 3.2%), Disability claimants (FPR: 28.9%), General population (FPR: 12.1%). Statistical significance: p<0.001. Disparate impact confirmed — NAIC protected class violation.",
            duration: "3.8 min",
          },
          {
            name: "Claims Queue Analyzer Skill",
            finding: "620 misclassified claims identified. 47 in acute hardship (65+, disability, single income). Average delay: 18 days. 12 regulators notified via automated complaint system. Total payout delay: $2.3M.",
            duration: "2.1 min",
          },
        ],
        runbooksTriggered: [],
        policiesChecked: [
          {
            name: "NAIC Model Act Compliance Policy",
            rule: "NAIC-MA-003: Discriminatory claims handling — immediate suspension and remediation",
            outcome: "TRIGGERED — FTM-v2.1 suspended pending bias review",
          },
        ],
      },
      {
        key: "diagnose",
        label: "Isolate Model & Prioritize",
        icon: "brain",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001).

BIAS CONFIRMED: FTM-v2.1 suspended. 620 claims misclassified. 47 vulnerable claimants in hardship. 12 regulators notified.

TASK: Plan the remediation:
1. Confirm FTM-v2.1 is isolated from production decision-making
2. Route all 620 claims to manual human review (triage by vulnerability level)
3. Fast-track the 47 vulnerable claimants (65+, disability) to senior claims adjusters
4. Prepare GDPR Article 22 right-to-explanation responses for all 620
5. Draft state regulator responses for 12 jurisdictions

Provide the remediation plan.`,
        fallbackSummary:
          "Isolation complete: FTM-v2.1 removed from production. All new claims routing to human review queue. 620 claims re-triaged: 47 vulnerable fast-tracked to senior adjuster pool (SLA: 24 hours). 573 standard claims in manual review (SLA: 72 hours). GDPR right-to-explanation template prepared for 620 claimants. 12 state regulator response packages drafted (MA, NY, CA, TX, FL, IL, PA, OH, GA, NC, MI, NJ).",
        skillsInvoked: [
          {
            name: "Claims Priority Router Skill",
            finding: "620 claims re-routed: 47 to senior adjuster fast-track (vulnerability score 8-10/10), 573 to standard manual review. Human review capacity: 28 adjusters, 22 claims/adjuster capacity. ETA all claims reviewed: 72 hours.",
            duration: "1.2 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Vulnerable Claimant Priority Runbook",
            result: "47 fast-track claims assigned to 6 senior adjusters. Average senior adjuster SLA: 4 hours. Expected payout authorization: within 24 hours for all 47. Social work referrals queued for 12 most acute cases.",
          },
          {
            name: "Regulatory Response Preparation Runbook",
            result: "12 state regulator response packages drafted. Content: bias incident summary, model suspension confirmation, remediation plan, affected claimant count, compensation framework. Legal review queued: 4 hours.",
          },
        ],
        policiesChecked: [
          {
            name: "GDPR Article 22 Policy",
            rule: "GDPR-22-001: Right to explanation for automated decisions — must be provided upon request",
            outcome: "TRIGGERED — 620 right-to-explanation letters queued for dispatch",
          },
        ],
      },
      {
        key: "remediate",
        label: "Process Claims & Notify",
        icon: "wrench",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001).

ISOLATION ACTIVE: 47 vulnerable claims fast-tracked. 573 in standard review. Regulator responses drafted.

TASK: Execute the remediation:
1. Confirm senior adjusters are processing the 47 vulnerable claims
2. Authorize payments for claims cleared by human review
3. Send GDPR right-to-explanation letters to all 620 affected claimants
4. Notify 12 state regulators with remediation plan and timeline
5. Initiate FTM-v2.1 bias investigation and retrain planning

Provide remediation execution status.`,
        fallbackSummary:
          "Remediation in progress: 31/47 vulnerable claims reviewed and approved by senior adjusters (66% complete, 5 hours). $1.1M in delayed payments authorized. 620 GDPR right-to-explanation letters sent. 12 state regulators notified with remediation plan. FTM-v2.1 root cause: training data sourced from 2019 fraud dataset with significant demographic underrepresentation. Bias-aware retrain initiated with representative 2024 dataset.",
        skillsInvoked: [
          {
            name: "Payment Authorization Skill",
            finding: "31 vulnerable claims approved: $1.1M authorized for payout. Average review time: 3.8 hours/claim. Remaining 16 vulnerable claims: 1-2 hours each. 573 standard claims: 68/573 approved ($340K). Total authorized: $1.44M.",
            duration: "5 hr concurrent",
          },
        ],
        runbooksTriggered: [
          {
            name: "GDPR Notification Runbook",
            result: "620 right-to-explanation letters sent via certified mail + email. Content: automated decision process, how it was applied, right to appeal, human review confirmation. Response period: 30 days.",
          },
          {
            name: "Regulator Notification Runbook",
            result: "12 state insurance department letters filed: bias incident details, model suspension, 620 affected claimants, $2.3M delayed payouts, remediation timeline (30 days), compensation framework ($250 per affected claimant hardship payment).",
          },
        ],
        policiesChecked: [
          {
            name: "NAIC Unfair Trade Practices Policy",
            rule: "NAIC-UTP-001: Remediation payment within 30 days of bias identification",
            outcome: "ON TRACK — 31/47 vulnerable claims paid. Full remediation: 30-day window active.",
          },
          {
            name: "State Insurance Department Compliance Policy",
            rule: "SID-001: Regulator notification within 72 hours of discriminatory practice discovery",
            outcome: "COMPLIANT — 12 regulators notified at T+6 hours (within 72-hour window)",
          },
        ],
      },
      {
        key: "validate",
        label: "Validate & Retrain",
        icon: "shield-check",
        prompt: `You are the Claims Workflow Recovery Agent (SH-INS-001).

REMEDIATION IN PROGRESS: 31/47 vulnerable claims paid. 620 GDPR notices sent. Regulators notified. Model suspended.

TASK: Complete the incident and begin rebuilding:
1. Confirm all 47 vulnerable claimant cases resolved within 24-hour SLA
2. Confirm all 620 GDPR right-to-explanation obligations met
3. Initiate bias-aware model retrain with representative 2024 dataset
4. Generate NAIC incident report
5. Recommend governance controls (bias testing in CI/CD, diverse dataset requirements)

Close the incident.`,
        fallbackSummary:
          "INCIDENT RESOLVED. 47/47 vulnerable claims processed within 24-hour SLA ($1.76M authorized). 573/573 standard claims in manual review (420/573 approved). 620 GDPR notices sent and acknowledged. All 12 regulators satisfied with remediation plan — no enforcement action initiated. Bias-aware FTM-v2.2 retrain initiated (ETA: 14 days). Atlas prevented: 12-state regulatory enforcement, $10M+ potential fines, class action liability. Recommended: mandatory bias testing gate in model CI/CD pipeline.",
        skillsInvoked: [
          {
            name: "Bias Detection & Fairness Audit Skill",
            finding: "FTM-v2.2 retrain dataset audit: 2024 claims (1.2M records), demographic representation verified against US census. Bias score projected: FPR parity ratio 0.98 (target: >0.95). Retrain ETA: 14 days with validation.",
            duration: "2.4 min",
          },
        ],
        runbooksTriggered: [
          {
            name: "Model Bias Remediation Runbook",
            result: "FTM-v2.2 retrain initiated with 2024 representative dataset. Bias testing suite: 22 fairness metrics. Champion-challenger validation required before production deployment. Estimated deployment: 14 days.",
          },
        ],
        policiesChecked: [
          {
            name: "AI Ethics & Fairness Policy",
            rule: "AIEF-001: Bias-tested model required before production re-deployment",
            outcome: "INITIATED — FTM-v2.2 bias testing suite activated. Production re-deployment blocked until all 22 fairness metrics pass.",
          },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureSHDeployment(agentId: string, agentName: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  if (deps.length > 0) {
    const active = deps.find((d: any) => d.status !== "rolled_back");
    if (active) return active.id;
  }
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

async function runSHPhase(
  deploymentId: string,
  prompt: string,
  maxIterations: number,
  fallback: string,
): Promise<string> {
  try {
    const result = await runAgentOnce(deploymentId, prompt, maxIterations);
    return result.message && result.message.length > 40 ? result.message : fallback;
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

  const scenarioKey = (req.query.scenario as string) || "healthcare";
  const scenario = SH_SCENARIOS[scenarioKey];

  const sendEvent = (type: string, payload: object) => {
    try { res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { /* ignore */ }
  };

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  let aborted = false;
  req.on("close", () => { aborted = true; });

  if (!scenario) {
    sendEvent("error", { message: `Unknown scenario: ${scenarioKey}` });
    res.end();
    return;
  }

  try {
    sendEvent("run_start", {
      scenario: scenarioKey,
      agentCode: scenario.agentCode,
      agentName: scenario.agentName,
      industry: scenario.industry,
      incidentTitle: scenario.incidentTitle,
      incidentSeverity: scenario.incidentSeverity,
      incidentType: scenario.incidentType,
      message: `${scenario.agentCode} activated — ${scenario.incidentTitle}`,
    });

    await sleep(400);
    sendEvent("setup", { message: `Initialising ${scenario.agentName}...` });

    const deploymentId = await ensureSHDeployment(scenario.agentId, scenario.agentName);
    if (await isRuntimeActive(deploymentId)) {
      await stopAgentRuntime(deploymentId);
    }

    sendEvent("setup", { message: `Agent ready — deployment ${deploymentId.slice(0, 8)}` });
    await sleep(300);

    // ── Run each healing phase ─────────────────────────────────────────────
    for (const phase of scenario.phases) {
      if (aborted) break;

      sendEvent("phase_start", {
        phase: phase.key,
        label: phase.label,
        icon: phase.icon,
        agentCode: scenario.agentCode,
        agentName: scenario.agentName,
        message: `${phase.label} — ${scenario.agentCode} executing...`,
      });

      await sleep(200);

      // Emit scripted skill invocations (before / during LLM thinking)
      for (const skill of phase.skillsInvoked) {
        if (aborted) break;
        sendEvent("skill_invoked", {
          phase: phase.key,
          skillName: skill.name,
          finding: skill.finding,
          duration: skill.duration,
        });
        await sleep(600);
      }

      // Start LLM call (non-blocking — scripted events fill the gap)
      const llmPromise = runSHPhase(deploymentId, phase.prompt, 3, phase.fallbackSummary);

      // Emit scripted runbook events while LLM thinks
      for (const rb of phase.runbooksTriggered) {
        if (aborted) break;
        sendEvent("runbook_triggered", {
          phase: phase.key,
          runbookName: rb.name,
          result: rb.result,
        });
        await sleep(800);
      }

      // Emit scripted policy checks
      for (const pol of phase.policiesChecked) {
        if (aborted) break;
        sendEvent("policy_checked", {
          phase: phase.key,
          policyName: pol.name,
          rule: pol.rule,
          outcome: pol.outcome,
        });
        await sleep(600);
      }

      // Await agent analysis
      const analysis = await llmPromise;

      sendEvent("phase_complete", {
        phase: phase.key,
        label: phase.label,
        analysis,
        success: true,
      });

      await sleep(500);
    }

    if (!aborted) {
      sendEvent("run_complete", {
        scenario: scenarioKey,
        agentCode: scenario.agentCode,
        headline: scenario.resolution.headline,
        autonomousActions: scenario.resolution.autonomousActions,
        metricsRestored: scenario.resolution.metricsRestored,
        success: true,
      });
    }
  } catch (err: any) {
    sendEvent("error", { message: err?.message || "Self-healing pipeline error" });
  } finally {
    res.end();
  }
}
