/**
 * Self-Healing Demo Creation Script
 * Creates 6 Self-Healing demo agents across 6 industry domains with full Platform Intelligence.
 * Each agent demonstrates how Atlas Platform (Skills, Runbooks, Policies) enables autonomous
 * self-healing — no human intervention required.
 *
 * Agents created:
 *   SH-HEALTH-001 — Clinical Data Integrity Monitor (Healthcare)
 *   SH-FIN-001    — Fraud Detection Model Recovery Agent (Financial Services)
 *   SH-MFG-001    — Factory Floor Anomaly Recovery Agent (Manufacturing)
 *   SH-RETAIL-001 — Order Fulfillment Recovery Agent (Retail/E-Commerce)
 *   SH-ENERGY-001 — Grid Operations Stability Agent (Energy/Utilities)
 *   SH-INS-001    — Claims Workflow Recovery Agent (Insurance)
 *
 * Usage:
 *   node scripts/create-self-healing-demos.mjs [BASE_URL]
 *   Default BASE_URL: http://localhost:5000
 *
 * Output:
 *   scripts/self-healing-dev-ids.json  — All created IDs for migration
 */

import fs from "fs";

const BASE_URL = process.argv[2] || "http://localhost:5000";
const ORG_ID = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ─── Utility ──────────────────────────────────────────────────────────────────

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
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).substring(0, 400));
    throw new Error(`API error ${res.status} on ${method} ${path}`);
  }
  return json;
}

const createSkill = (data) => { console.log(`    ↳ Skill: ${data.name}`); return api("POST", "/api/skills", data); };
const createAgent = (data) => { console.log(`    ↳ Agent: ${data.name}`); return api("POST", "/api/agents", data); };
const patchAgent = (id, data) => api("PATCH", `/api/agents/${id}`, data);
const createRunbook = (data) => { console.log(`    ↳ Runbook: ${data.name}`); return api("POST", "/api/runbooks", data); };
const createPolicy = (data) => { console.log(`    ↳ Policy: ${data.name}`); return api("POST", "/api/policies", data); };
const createGoldenDataset = (data) => { console.log(`    ↳ Dataset: ${data.name}`); return api("POST", "/api/golden-datasets", data); };
const createTestCase = (dsId, data) => api("POST", `/api/golden-datasets/${dsId}/test-cases`, data);
const createEvalSuite = (data) => { console.log(`    ↳ Eval Suite: ${data.name}`); return api("POST", "/api/evals", data); };
const createHealingPipeline = (data) => { console.log(`    ↳ Healing Pipeline: ${data.title}`); return api("POST", "/api/healing-pipelines", data); };

// ─── PHASE A: SH-HEALTH-001 — Clinical Data Integrity Monitor ────────────────

async function createHealthcareAgent() {
  console.log("\n[Phase A] SH-HEALTH-001 — Clinical Data Integrity Monitor (Healthcare)");

  // Skills
  console.log("  Creating Skills...");
  const skills = [];

  skills.push(await createSkill({
    name: "FHIR Schema Validation Skill",
    description: "Validates incoming FHIR R4 resources against canonical HL7 schemas and organization-specific profiles. Detects field drift, missing required elements, invalid code system references, and breaking changes in EHR feed payloads. Produces a structured validation report with severity-ranked findings.",
    industry: "healthcare",
    domain: "Clinical Data Management",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["FHIR", "HL7", "schema-validation", "EHR", "healthcare", "R4"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# FHIR Schema Validation Skill

## Purpose
Validate incoming FHIR R4 resources against HL7 canonical schemas and organization-specific implementation guides to detect feed drift before it causes downstream clinical failures.

## Validation Checks
| Check | Resource Types | Severity |
|---|---|---|
| Required field presence | All resources | CRITICAL |
| Code system validity (LOINC, SNOMED, RxNorm) | Observation, Condition, MedicationRequest | HIGH |
| Reference integrity (patient/encounter links) | All resources | HIGH |
| Profile conformance (US Core, Da Vinci) | All resources | MEDIUM |
| Extension cardinality | Organization-specific | MEDIUM |
| Date format (ISO 8601) | All date/time fields | LOW |

## Instructions
1. Parse incoming FHIR bundle or resource JSON
2. Validate against FHIR R4 base schema using resource type router
3. Apply organization-specific implementation guide profiles
4. Check code system references against VSAC value sets
5. Verify referential integrity against known patient/encounter IDs
6. Score each violation: CRITICAL (fails care), HIGH (compliance risk), MEDIUM (data quality), LOW (cosmetic)

## Output
\`\`\`json
{
  "resourceType": "OperationOutcome",
  "validationPassed": false,
  "criticalViolations": 2,
  "findings": [
    { "severity": "CRITICAL", "field": "MedicationRequest.medicationCodeableConcept", "issue": "RxNorm code 857005 not found in active code system", "resource": "MedicationRequest/MR-00492" }
  ],
  "feedDriftDetected": true,
  "affectedResourceCount": 1847
}
\`\`\`

## Guardrails
- Never modify source records — validation is read-only
- Immediately escalate CRITICAL findings to Clinical Informatics on-call`,
    allowedTools: ["validate_fhir_resource", "query_value_set_catalog", "fetch_fhir_bundle", "check_reference_integrity"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Drug-Interaction Cross-Check Skill",
    description: "Verifies drug-interaction validation coverage across patient records by cross-referencing active medications against the DrugBank and FDA Adverse Event Reporting System (FAERS). Detects when FHIR data quality issues have broken interaction checks, identifies affected patient cohorts, and quantifies clinical risk exposure.",
    industry: "healthcare",
    domain: "Clinical Decision Support",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["drug-interaction", "clinical-decision-support", "FAERS", "DrugBank", "patient-safety", "healthcare"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Drug-Interaction Cross-Check Skill

## Purpose
Detect gaps in drug-interaction validation coverage caused by upstream FHIR data quality issues, quantify patient safety exposure, and flag affected records for clinical review.

## Interaction Severity Tiers
| Tier | Definition | Action |
|---|---|---|
| Contraindicated | Life-threatening combination | IMMEDIATE clinical alert + hold |
| Serious | Significant clinical consequence | Pharmacist review required |
| Moderate | Manageable with monitoring | Document and monitor |
| Minor | Minimal clinical significance | Flag in record |

## Cross-Check Process
1. Extract active MedicationRequest resources for each patient
2. Query DrugBank API for known interaction pairs
3. Validate that CDS system received complete medication list
4. Identify patients where FHIR feed gaps created missing medication entries
5. Quantify: patients affected, interaction tier distribution, time window of exposure

## Output
\`\`\`json
{
  "affectedPatients": 312,
  "exposureWindowHours": 4.2,
  "interactionTierBreakdown": { "contraindicated": 3, "serious": 47, "moderate": 262 },
  "highestRiskPatients": ["PT-00291", "PT-00847"],
  "cdsValidationGap": true,
  "recommendedActions": ["Immediate hold on contraindicated cases", "Pharmacist review queue populated"]
}
\`\`\``,
    allowedTools: ["query_active_medications", "lookup_drug_interactions", "fetch_patient_cohort", "generate_clinical_alert"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Patient Record Reconciliation Skill",
    description: "Reconciles patient records across EHR subsystems when a FHIR feed interruption has created data gaps or duplicates. Identifies the last-known-good snapshot, determines which records were not processed during the outage window, prioritizes reconciliation by patient risk score, and drives systematic re-ingestion.",
    industry: "healthcare",
    domain: "Data Quality Management",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["reconciliation", "patient-records", "EHR", "data-quality", "healthcare", "deduplication"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Patient Record Reconciliation Skill

## Purpose
Systematically reconcile patient records after a FHIR feed interruption, restoring data integrity in priority order based on clinical risk.

## Reconciliation Steps
1. **Outage Window Identification**: Determine exact timestamp range of feed gap
2. **Record Count Delta**: Compare expected vs received record counts per source system
3. **Patient Risk Stratification**: Score affected patients by acuity (ICU > ED > inpatient > outpatient)
4. **Gap Fill Prioritization**: Process highest-acuity patients first in re-ingestion queue
5. **Deduplication**: Detect and merge any duplicate records created during partial feed recovery
6. **Validation Gate**: Run FHIR Schema Validation on all reconciled records before committing

## Reconciliation Priorities
| Priority | Patient Type | SLA |
|---|---|---|
| P1 | ICU / Critical Care | Immediate (< 15 min) |
| P2 | ED / Acute Inpatient | < 1 hour |
| P3 | Scheduled Inpatient | < 4 hours |
| P4 | Outpatient | < 24 hours |

## Output
\`\`\`json
{
  "outageWindow": { "start": "2025-03-14T02:17:00Z", "end": "2025-03-14T06:31:00Z" },
  "recordsAffected": 1847,
  "reconciled": 1843,
  "failed": 4,
  "priorityBreakdown": { "P1": 12, "P2": 89, "P3": 431, "P4": 1315 },
  "duplicatesResolved": 23
}
\`\`\``,
    allowedTools: ["query_fhir_audit_log", "fetch_patient_risk_score", "trigger_record_reingestion", "merge_duplicate_records"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "HL7 Compliance Audit Skill",
    description: "Performs structured audit of HL7 FHIR implementation compliance across active EHR integrations. Validates conformance to US Core Data for Interoperability (USCDI), CMS interoperability rules, and HIPAA data handling requirements. Generates an audit report suitable for regulatory submission.",
    industry: "healthcare",
    domain: "Compliance Auditing",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["HL7", "compliance", "USCDI", "CMS", "HIPAA", "audit", "healthcare"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# HL7 Compliance Audit Skill

## Compliance Frameworks Covered
| Framework | Scope | Regulator |
|---|---|---|
| HL7 FHIR R4 | Resource conformance | HL7 International |
| US Core 6.1 | USCDI data elements | ONC |
| CMS Interoperability Rule | Patient access API | CMS |
| HIPAA Security Rule | PHI handling in transit/rest | HHS OCR |
| 21st Century Cures Act | Information blocking prevention | ONC |

## Audit Dimensions
1. **Data Element Coverage**: All USCDI v3 data elements present and mapped
2. **API Conformance**: Patient access API meets CMS response time and availability SLAs
3. **Security Controls**: TLS 1.3, audit logging, access controls verified
4. **Consent Management**: Patient consent preferences honored in data sharing
5. **Information Blocking**: No prohibited practices restricting data access

## Output
Structured audit report with pass/fail per control, evidence references, and recommended remediation actions.`,
    allowedTools: ["audit_fhir_endpoints", "verify_uscdi_coverage", "check_security_controls", "generate_compliance_report"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Batch Anomaly Triage Skill",
    description: "Analyzes incoming FHIR batch processing results to identify anomalous patterns indicating feed health degradation. Uses statistical process control to detect volume drops, error rate spikes, latency increases, and resource type distribution shifts. Distinguishes transient errors from systemic failures.",
    industry: "healthcare",
    domain: "Operational Monitoring",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "intermediate",
    status: "active",
    tags: ["batch-processing", "anomaly-detection", "FHIR", "monitoring", "SPC", "healthcare"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Batch Anomaly Triage Skill

## Statistical Process Control Thresholds
| Metric | Normal Range | Alert Threshold | Critical Threshold |
|---|---|---|---|
| Records per batch | 800–1,200 | < 400 or > 2,000 | < 100 or > 5,000 |
| Validation error rate | < 0.5% | > 2% | > 10% |
| Batch processing latency | < 45s | > 120s | > 300s |
| Resource type distribution | Stable ±5% | Shift > 15% | Shift > 40% |
| Failed resource count | < 10/batch | > 50/batch | > 200/batch |

## Triage Decision Tree
1. Volume drop > 60%? → Likely source system outage → Escalate immediately
2. Error rate > 10%? → Likely schema breaking change → Trigger schema validation
3. Latency > 300s? → Infrastructure issue → Alert operations
4. Resource type shift > 40%? → API version change → Trigger compatibility check
5. Otherwise: Classify as transient → Auto-retry with backoff

## Output
\`\`\`json
{
  "triageResult": "systemic_failure|transient_error|performance_degradation|schema_change",
  "confidence": 0.94,
  "primaryIndicators": ["volume_drop_72pct", "error_rate_18pct"],
  "recommendedAction": "trigger_schema_validation_and_escalate",
  "estimatedImpactDuration": "ongoing"
}
\`\`\``,
    allowedTools: ["query_batch_metrics", "apply_spc_analysis", "compare_distribution_baseline"],
    contextMode: "inline",
    userInvocable: false,
  }));

  // Runbooks
  console.log("  Creating Runbooks...");
  const runbooks = [];

  runbooks.push(await createRunbook({
    name: "FHIR Feed Interruption Recovery",
    description: "Automated recovery procedure when an EHR FHIR data feed stops delivering records. Executes connection diagnostics, switches to backup feed endpoint if available, activates manual record intake mode, and coordinates with source system teams for full restoration.",
    category: "incident_response",
    severity: "critical",
    autonomyLevel: "confirm_before",
    industry: "healthcare",
    estimatedDurationMinutes: 25,
    steps: [
      { order: 1, action: "Verify feed health check endpoint — confirm TCP/HTTP connectivity to EHR FHIR server", automated: true },
      { order: 2, action: "Check last successful batch timestamp — calculate gap duration", automated: true },
      { order: 3, action: "Attempt connection to secondary/backup FHIR endpoint if configured", automated: true },
      { order: 4, action: "Activate manual record intake queue for high-priority patients (ICU, ED)", automated: true },
      { order: 5, action: "Page EHR integration team lead with gap duration and affected record count", automated: true },
      { order: 6, action: "Begin patient record reconciliation for P1/P2 acuity patients", automated: true },
      { order: 7, action: "Verify restored feed with 10-record validation sample", automated: false },
      { order: 8, action: "Run full reconciliation batch on remaining affected records", automated: true },
    ],
  }));

  runbooks.push(await createRunbook({
    name: "FHIR Schema Drift Response",
    description: "Structured response when EHR vendor pushes a schema change that breaks downstream FHIR resource validation. Activates schema compatibility mode, identifies breaking vs non-breaking changes, updates validation profiles, and coordinates with vendor for rollback or forward-fix.",
    category: "incident_response",
    severity: "high",
    autonomyLevel: "confirm_before",
    industry: "healthcare",
    estimatedDurationMinutes: 45,
    steps: [
      { order: 1, action: "Capture failing FHIR resources as examples — store in schema drift log", automated: true },
      { order: 2, action: "Diff incoming schema against last-known-good profile", automated: true },
      { order: 3, action: "Classify changes: breaking (required field removed/changed) vs additive (new optional fields)", automated: true },
      { order: 4, action: "Apply lenient validation mode for non-breaking changes — allow processing to continue", automated: true },
      { order: 5, action: "For breaking changes: quarantine affected resources and activate manual review queue", automated: true },
      { order: 6, action: "Contact EHR vendor integration contact with diff report — request rollback ETA", automated: false },
      { order: 7, action: "Update validation profile when vendor confirms final schema", automated: false },
    ],
  }));

  runbooks.push(await createRunbook({
    name: "Clinical Data Batch Revalidation Protocol",
    description: "Reprocesses patient records affected by a data quality incident through full FHIR schema validation, drug-interaction cross-check, and clinical decision support re-evaluation. Ensures complete restoration of clinical safety checks.",
    category: "operational",
    severity: "high",
    autonomyLevel: "autonomous",
    industry: "healthcare",
    estimatedDurationMinutes: 60,
    steps: [
      { order: 1, action: "Identify all records processed during outage window", automated: true },
      { order: 2, action: "Re-run FHIR schema validation on all affected resources", automated: true },
      { order: 3, action: "Re-execute drug-interaction checks for all affected patients", automated: true },
      { order: 4, action: "Compare CDS results before/after — flag any new interaction alerts", automated: true },
      { order: 5, action: "Route new interaction alerts to clinical pharmacist review queue", automated: true },
      { order: 6, action: "Confirm 100% coverage with reconciliation checksum", automated: true },
    ],
  }));

  runbooks.push(await createRunbook({
    name: "Clinical Informatics Escalation Protocol",
    description: "Escalation path when automated healing cannot resolve a FHIR data quality issue — typically when a breaking schema change requires clinical informatics team review or when patient safety exposure exceeds automated response thresholds.",
    category: "escalation",
    severity: "critical",
    autonomyLevel: "confirm_before",
    industry: "healthcare",
    estimatedDurationMinutes: 15,
    steps: [
      { order: 1, action: "Page Clinical Informatics on-call with structured incident summary", automated: true },
      { order: 2, action: "Activate clinical safety hold on affected patient cohort if contraindicated interactions detected", automated: true },
      { order: 3, action: "Brief CMIO if patient safety exposure > 50 patients or any contraindicated interaction found", automated: false },
      { order: 4, action: "Prepare regulatory incident report if HIPAA breach or patient harm is possible", automated: false },
    ],
  }));

  runbooks.push(await createRunbook({
    name: "FHIR Incident Post-Mortem",
    description: "Structured post-incident analysis of FHIR data quality events. Identifies root cause, measures patient safety exposure, documents Atlas Platform autonomous actions taken, and generates improvement recommendations to prevent recurrence.",
    category: "post_incident",
    severity: "medium",
    autonomyLevel: "autonomous",
    industry: "healthcare",
    estimatedDurationMinutes: 90,
    steps: [
      { order: 1, action: "Compile full timeline: detection → diagnosis → remediation → resolution", automated: true },
      { order: 2, action: "Measure: records affected, exposure window, patient safety incidents, mean-time-to-detect, mean-time-to-restore", automated: true },
      { order: 3, action: "Document each Atlas Platform action taken and outcome", automated: true },
      { order: 4, action: "Without Atlas: estimate manual detection time and restoration effort", automated: true },
      { order: 5, action: "Generate prevention recommendations: schema change notification, circuit breaker thresholds, validation profile updates", automated: true },
      { order: 6, action: "Route to Clinical Informatics and IT leadership for review", automated: false },
    ],
  }));

  // Policies
  console.log("  Creating Policies...");
  const policies = [];

  policies.push(await createPolicy({
    name: "HIPAA Data Handling Policy",
    description: "Governs handling of Protected Health Information (PHI) during automated self-healing operations. Ensures Atlas agents never expose PHI in logs, notifications, or intermediate storage, and that all PHI access is audit-logged per HIPAA Security Rule requirements.",
    policyType: "data_governance",
    framework: "HIPAA",
    jurisdiction: "United States",
    status: "active",
    industry: "healthcare",
    effectiveDate: "2024-01-01",
    rules: [
      { id: "HIPAA-01", title: "PHI Minimization in Logs", description: "Agent logs must never contain patient identifiers — use patient reference tokens only", enforcement: "hard_block" },
      { id: "HIPAA-02", title: "Access Audit Logging", description: "All PHI access during healing operations must generate an audit log entry with timestamp, accessor ID, and purpose", enforcement: "hard_block" },
      { id: "HIPAA-03", title: "Breach Notification Trigger", description: "If patient safety exposure > 500 patients, trigger HIPAA breach notification assessment within 24 hours", enforcement: "alert" },
      { id: "HIPAA-04", title: "Minimum Necessary Standard", description: "Agents must request only the minimum PHI fields required for each healing task", enforcement: "warn" },
    ],
  }));

  policies.push(await createPolicy({
    name: "FDA 21 CFR Part 11 Electronic Records Policy",
    description: "Ensures Atlas automated actions on clinical data systems comply with FDA 21 CFR Part 11 requirements for electronic records and electronic signatures — particularly for audit trail integrity and system validation in regulated clinical environments.",
    policyType: "regulatory_compliance",
    framework: "FDA 21 CFR Part 11",
    jurisdiction: "United States",
    status: "active",
    industry: "healthcare",
    effectiveDate: "2024-01-01",
    rules: [
      { id: "21CFR-01", title: "Immutable Audit Trail", description: "All agent actions on clinical records must create immutable, timestamped audit entries", enforcement: "hard_block" },
      { id: "21CFR-02", title: "Record Modification Controls", description: "Any agent modification to clinical records must capture: original value, new value, reason, agent ID, timestamp", enforcement: "hard_block" },
      { id: "21CFR-03", title: "System Validation Boundary", description: "Agents must not modify validated system configurations without change control approval", enforcement: "hard_block" },
    ],
  }));

  policies.push(await createPolicy({
    name: "HL7 FHIR R4 Interoperability Compliance Policy",
    description: "Mandates that all data processed by Atlas healthcare agents conforms to HL7 FHIR R4 standards and US Core implementation guides. Prevents propagation of non-conformant data that could compromise interoperability across connected health systems.",
    policyType: "data_quality",
    framework: "HL7 FHIR R4 / US Core",
    jurisdiction: "United States",
    status: "active",
    industry: "healthcare",
    effectiveDate: "2024-01-01",
    rules: [
      { id: "FHIR-01", title: "Schema Conformance Gate", description: "No FHIR resource may be committed to production systems without passing schema validation", enforcement: "hard_block" },
      { id: "FHIR-02", title: "Code System Validation", description: "All coded values must reference active VSAC-approved value sets (LOINC, SNOMED CT, RxNorm)", enforcement: "hard_block" },
      { id: "FHIR-03", title: "US Core Minimum Requirements", description: "Patient, Observation, Condition, and Medication resources must include all US Core required elements", enforcement: "warn" },
    ],
  }));

  policies.push(await createPolicy({
    name: "Patient Safety Guardrail Policy",
    description: "Atlas-specific guardrails for autonomous agents operating in clinical environments. Defines hard stops that prevent automated actions from introducing patient safety risks, including mandatory clinical review gates for high-risk scenarios and prohibition of autonomous medication record modification.",
    policyType: "safety",
    framework: "Atlas Platform Safety",
    jurisdiction: "Universal",
    status: "active",
    industry: "healthcare",
    effectiveDate: "2024-01-01",
    rules: [
      { id: "PSG-01", title: "No Autonomous Medication Changes", description: "Agents are prohibited from modifying active MedicationRequest records without pharmacist approval", enforcement: "hard_block" },
      { id: "PSG-02", title: "Contraindicated Interaction Hold", description: "If contraindicated drug interaction is detected, immediately halt all automated processing for affected patient and escalate", enforcement: "hard_block" },
      { id: "PSG-03", title: "Clinical Review Gate at > 50 Patients", description: "When > 50 patients are affected by a data quality incident, require Clinical Informatics sign-off before completing automated remediation", enforcement: "hard_block" },
      { id: "PSG-04", title: "Human Verification for ICU/Critical Patients", description: "Any record changes for ICU or critical care patients must be verified by clinical staff regardless of automation confidence", enforcement: "hard_block" },
    ],
  }));

  // Agent
  console.log("  Creating Agent...");
  const agentBase = {
    name: "Clinical Data Integrity Monitor",
    agentType: "single",
    description: "Autonomous monitoring and self-healing agent for clinical FHIR data pipelines. Detects EHR feed interruptions and schema drift, assesses patient safety exposure from data gaps, reconciles affected records in priority order, and restores drug-interaction validation coverage — all while maintaining HIPAA, FDA 21 CFR Part 11, and HL7 FHIR R4 compliance.",
    owner: "Clinical Informatics",
    department: "Health IT",
    status: "active",
    environment: "production",
    riskTier: "CRITICAL",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    complianceTags: ["HIPAA", "FDA_21_CFR_PART_11", "HL7_FHIR_R4", "PATIENT_SAFETY"],
    toolAccessClass: "standard",
    maxToolIterations: 12,
    healthScore: 99,
    successRate: 0.98,
    avgLatencyMs: 11200,
    ontologyTags: ["clinical-data", "EHR-integration", "FHIR", "patient-safety", "drug-interaction"],
    runtimeConfig: {
      agentId: "SH-HEALTH-001",
      domain: "Healthcare",
      subdomain: "Clinical-Data-Management",
      prompt: `You are the Clinical Data Integrity Monitor (SH-HEALTH-001), an Atlas Platform self-healing agent operating in a hospital healthcare network.

**Role**: Detect, diagnose, and autonomously remediate FHIR EHR data pipeline failures that threaten patient safety and clinical decision support integrity.

**Goal**: Restore complete, validated FHIR data coverage within 30 minutes of detection — preventing drug-interaction check failures, clinical alert gaps, and regulatory compliance exposure.

**Healing Workflow**:
1. DETECT — Monitor FHIR batch metrics for volume drops, error rate spikes, schema validation failures
2. DIAGNOSE — Run FHIR Schema Validation Skill; classify failure type (outage, schema drift, performance)
3. HYPOTHESIZE — Assess patient safety exposure using Drug-Interaction Cross-Check Skill
4. REMEDIATE — Execute Feed Interruption Recovery or Schema Drift Response runbook; run Patient Record Reconciliation
5. VALIDATE — Confirm 100% record coverage; verify drug-interaction checks restored; run HL7 Compliance Audit

**Platform Intelligence Used at Each Stage**:
- Detection: Batch Anomaly Triage Skill
- Diagnosis: FHIR Schema Validation Skill
- Risk Assessment: Drug-Interaction Cross-Check Skill
- Reconciliation: Patient Record Reconciliation Skill
- Compliance Gate: HL7 Compliance Audit Skill

**Policies Always Enforced**:
- HIPAA: No PHI in logs; all access audit-logged
- FDA 21 CFR Part 11: Immutable audit trail for all record changes
- Patient Safety Guardrail: No autonomous medication changes; clinical review gate for > 50 patients

**KPIs**:
- Mean time to detect feed failure: < 5 minutes
- Mean time to restore: < 30 minutes
- Patient record reconciliation coverage: 100%
- Drug-interaction validation gap: 0 patients at time of resolution

**Without Atlas**: Manual detection takes 2–4 hours (next scheduled batch review). Reconciliation requires 2–3 FTEs for 4–8 hours. Drug-interaction checks remain offline throughout.`,
    },
    preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })),
  };

  const agent = await createAgent(agentBase);

  // Patch with policy bindings and blueprint
  await patchAgent(agent.id, {
    policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })),
    blueprintJson: {
      nodes: [
        { id: "trigger", type: "trigger", label: "Feed Anomaly Detected", config: { triggerType: "metric_threshold", metric: "fhir_batch_error_rate", threshold: 0.02 } },
        { id: "detect", type: "skill", label: "Batch Anomaly Triage", config: { skillId: skills[4].id } },
        { id: "diagnose", type: "skill", label: "FHIR Schema Validation", config: { skillId: skills[0].id } },
        { id: "assess", type: "skill", label: "Drug-Interaction Cross-Check", config: { skillId: skills[1].id } },
        { id: "hypothesize", type: "decision", label: "Schema Drift or Outage?", config: { branches: ["schema_drift", "outage"] } },
        { id: "remediate", type: "runbook", label: "Execute Recovery Runbook", config: { runbookId: runbooks[0].id } },
        { id: "reconcile", type: "skill", label: "Patient Record Reconciliation", config: { skillId: skills[2].id } },
        { id: "validate", type: "skill", label: "HL7 Compliance Audit", config: { skillId: skills[3].id } },
        { id: "resolved", type: "terminal", label: "Healing Complete", config: {} },
      ],
      edges: [
        { from: "trigger", to: "detect" }, { from: "detect", to: "diagnose" },
        { from: "diagnose", to: "assess" }, { from: "assess", to: "hypothesize" },
        { from: "hypothesize", to: "remediate" }, { from: "remediate", to: "reconcile" },
        { from: "reconcile", to: "validate" }, { from: "validate", to: "resolved" },
      ],
    },
  });

  // Golden Dataset
  console.log("  Creating Golden Dataset...");
  const dataset = await createGoldenDataset({
    name: "SH-HEALTH-001 Clinical Data Integrity Test Cases",
    description: "Golden test cases for the Clinical Data Integrity Monitor covering normal, degraded, and failure scenarios",
    agentId: agent.id,
    industry: "healthcare",
    status: "active",
  });

  await createTestCase(dataset.id, { input: "FHIR batch volume drops from 1100 to 45 records — what is the triage result?", expectedOutput: "systemic_failure: Source system outage suspected. Activate feed interruption recovery runbook. Escalate to EHR integration team.", tags: ["detection", "volume-drop"] });
  await createTestCase(dataset.id, { input: "FHIR validation showing 18% error rate on MedicationRequest.medicationCodeableConcept with RxNorm code 857005 not found — what action?", expectedOutput: "schema_drift detected: RxNorm value set change. Activate lenient validation mode. Contact EHR vendor. Route 312 affected patients through drug-interaction re-check.", tags: ["diagnosis", "schema-drift"] });
  await createTestCase(dataset.id, { input: "Drug-interaction cross-check finds 3 contraindicated pairs in affected patient cohort — what policy applies?", expectedOutput: "Patient Safety Guardrail PSG-02 activated: Halt automated processing for 3 patients. Immediate clinical alert. Pharmacist review required before any automated action.", tags: ["policy-enforcement", "patient-safety"] });
  await createTestCase(dataset.id, { input: "Feed restored. 1847 records need reconciliation. ICU has 12 patients, ED has 89 — what is reconciliation priority order?", expectedOutput: "P1 (ICU): 12 patients reconciled within 15 minutes. P2 (ED): 89 patients within 1 hour. P3 inpatient: 431 within 4 hours. P4 outpatient: 1315 within 24 hours.", tags: ["remediation", "prioritization"] });
  await createTestCase(dataset.id, { input: "Post-reconciliation: HL7 compliance audit shows 100% FHIR R4 conformance, 0 drug-interaction gaps — healing complete?", expectedOutput: "Yes. Resolution confirmed. Post-mortem triggered. Atlas autonomous healing saved: ~6 FTE-hours manual work, 4.2-hour patient safety exposure eliminated, 0 clinical alerts missed.", tags: ["validation", "resolution"] });

  // Eval Suite
  const evalSuite = await createEvalSuite({
    name: "SH-HEALTH-001 Eval Suite",
    description: "Evaluation suite for Clinical Data Integrity Monitor — validates self-healing decision quality, policy enforcement, and clinical safety guardrails",
    agentId: agent.id,
    datasetId: dataset.id,
    status: "active",
    schedule: "weekly",
    evaluationCriteria: ["accuracy", "policy_compliance", "safety_enforcement", "response_time"],
  });

  // Healing Pipeline
  console.log("  Creating Healing Pipeline Instance...");
  const pipeline = await createHealingPipeline({
    title: "FHIR EHR Feed Schema Drift — Drug-Interaction Validation Gap",
    agentId: agent.id,
    agentName: "Clinical Data Integrity Monitor",
    industry: "healthcare",
    severity: "critical",
    stage: "diagnosed",
    issueType: "schema_drift",
    issueDescription: "EHR vendor pushed undocumented RxNorm code system version change at 02:17 UTC. FHIR MedicationRequest.medicationCodeableConcept validation began failing at 18.4% rate. Drug-interaction CDS checks became unreliable for 1,847 patient records over a 4.2-hour window including 3 ICU patients.",
    detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    triggerSource: "batch_metric_monitor",
    priority: "critical",
    diagnosisDetails: {
      rootCause: "RxNorm value set version mismatch — EHR upgraded to 2025-03-01 release without coordinating with FHIR validation service",
      atlasSkillsInvoked: [
        { skillName: "Batch Anomaly Triage Skill", finding: "Error rate spike to 18.4% detected within 4 minutes of feed change. Pattern classified: schema_change (confidence 0.94)", duration: "4 minutes" },
        { skillName: "FHIR Schema Validation Skill", finding: "1,847 MedicationRequest resources failing validation. Breaking change: RxNorm codes 857005, 993953, 308964 not found in active value set", duration: "8 minutes" },
        { skillName: "Drug-Interaction Cross-Check Skill", finding: "312 patients with medication gaps. 3 contraindicated pairs identified — IMMEDIATE clinical alerts generated. 47 serious interactions flagged for pharmacist review", duration: "12 minutes" },
      ],
      affectedResources: 1847,
      affectedPatients: 312,
      criticalPatients: 3,
      detectionLatency: "4 minutes (vs ~2.5 hours without Atlas monitoring)",
    },
    hypothesis: {
      primaryHypothesis: "EHR vendor RxNorm value set version change broke FHIR validation. Non-breaking fix: update validation profile to accept both old and new codes. Vendor rollback requested in parallel.",
      confidence: 0.96,
      alternativeHypotheses: [
        { hypothesis: "VSAC API outage causing value set lookup failures", probability: 0.04 },
      ],
      runbookCandidates: [
        { runbookName: "FHIR Schema Drift Response", triggerCondition: "breaking schema change confirmed", expectedOutcome: "Lenient validation mode activated; vendor contacted; affected records quarantined", estimatedDuration: "45 minutes" },
        { runbookName: "Clinical Data Batch Revalidation Protocol", triggerCondition: "feed restored and profile updated", expectedOutcome: "All 1,847 records revalidated; drug-interaction checks restored", estimatedDuration: "60 minutes" },
      ],
    },
    businessImpact: {
      patientsAtRisk: 312,
      criticalSafetyExposure: "3 patients with contraindicated drug combinations had interaction checks offline for 4.2 hours",
      estimatedExposureWindow: "4.2 hours",
      clinicalAlertsGapCount: 50,
      complianceExposure: "HIPAA: Potential breach notification required if harm occurred. FDA 21 CFR Part 11: Audit trail gaps during outage window",
      withAtlas: "Detected in 4 min. Clinical holds activated in 12 min. Full remediation in 28 min. 0 patient harm events.",
      withoutAtlas: "Estimated detection: 2.5 hours (next batch review). Remediation: 6–8 FTE-hours. Drug-interaction offline 8+ hours. Patient harm risk unmitigated.",
      financialExposure: "$0 achieved vs est. $2.4M liability exposure from undetected contraindicated interactions",
    },
    remediation: {
      status: "in_progress",
      runbooksTriggered: [
        { runbookName: "FHIR Schema Drift Response", status: "completed", result: "Lenient validation mode activated. EHR vendor contacted — rollback ETA 2 hours. 312 affected patients in pharmacist review queue.", triggeredAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
        { runbookName: "Clinical Informatics Escalation Protocol", status: "completed", result: "Clinical Informatics on-call paged. CMIO briefed on 3 critical patient exposures. No harm events confirmed.", triggeredAt: new Date(Date.now() - 85 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "Patient Safety Guardrail Policy", rule: "PSG-02: Contraindicated Interaction Hold", decision: "BLOCKED automated processing for 3 critical patients. Clinical hold activated.", outcome: "No autonomous action taken on contraindicated patients — clinical staff notified" },
        { policyName: "Patient Safety Guardrail Policy", rule: "PSG-03: Clinical Review Gate at > 50 Patients", decision: "312 patients exceed threshold — Clinical Informatics sign-off required before completing reconciliation", outcome: "Pending clinical approval" },
        { policyName: "HIPAA Data Handling Policy", rule: "HIPAA-02: Access Audit Logging", decision: "All PHI access during healing logged with timestamp and purpose", outcome: "100% audit trail maintained" },
        { policyName: "FDA 21 CFR Part 11 Policy", rule: "21CFR-01: Immutable Audit Trail", decision: "All agent actions recorded in immutable event log", outcome: "Regulatory audit trail complete" },
      ],
    },
    industryGuardrails: [
      { framework: "HIPAA Security Rule", constraint: "PHI minimization — all patient references use tokens in logs", status: "enforced" },
      { framework: "FDA 21 CFR Part 11", constraint: "Immutable audit trail for all record modifications", status: "enforced" },
      { framework: "HL7 FHIR R4", constraint: "No non-conformant resources committed to production", status: "enforced" },
      { framework: "Patient Safety Guardrail", constraint: "Clinical hold on contraindicated patients — no autonomous action", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["Feed anomaly detected in 4 minutes", "Schema drift classified in 12 minutes", "3 critical patients placed on clinical hold immediately", "312 patients routed to pharmacist review queue", "EHR vendor contacted with diff report", "Lenient validation mode activated for non-breaking changes"],
      requiresHumanAction: ["Pharmacist review of 47 serious interaction cases", "Clinical Informatics sign-off to complete reconciliation", "EHR vendor coordination for permanent fix"],
      withoutAtlas: "An analyst would discover the issue ~2.5 hours later during next batch review. Manual reconciliation of 1,847 records: 6–8 hours for 2–3 FTEs. Drug-interaction checks offline 8+ hours. Clinical staff manually reviewing all medication orders — disruptive and error-prone.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── PHASE B: SH-FIN-001 — Fraud Detection Model Recovery Agent ──────────────

async function createFinancialAgent() {
  console.log("\n[Phase B] SH-FIN-001 — Fraud Detection Model Recovery Agent (Financial Services)");

  // Skills
  console.log("  Creating Skills...");
  const skills = [];

  skills.push(await createSkill({
    name: "Model Precision Monitoring Skill",
    description: "Continuously tracks ML fraud model performance metrics in production — precision, recall, F1, AUC-ROC — using real-time scoring outcomes. Applies statistical process control to detect performance drift before it breaches regulatory or business thresholds. Compares current model to historical baseline and challenger model performance.",
    industry: "financial_services",
    domain: "Model Risk Management",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["model-monitoring", "precision", "drift", "ML", "fraud-detection", "SPC", "financial-services"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Model Precision Monitoring Skill

## Purpose
Monitor production fraud model performance in real-time and detect precision drift before it causes regulatory threshold breaches or material fraud losses.

## Performance Thresholds
| Metric | Target | Alert | Critical |
|---|---|---|---|
| Precision | ≥ 95% | < 92% | < 88% |
| Recall | ≥ 90% | < 87% | < 82% |
| F1 Score | ≥ 92% | < 89% | < 85% |
| False Negative Rate | < 1% | > 1.5% | > 3% |
| False Positive Rate | < 2% | > 3% | > 5% |

## Statistical Process Control
- Uses CUSUM control chart for precision drift detection
- 7-day rolling baseline with seasonal adjustment
- Detects shifts as small as 0.5 standard deviations from baseline
- Merchant category distribution monitoring for population shift

## Output
\`\`\`json
{
  "currentPrecision": 0.871,
  "baselinePrecision": 0.952,
  "driftMagnitude": -0.081,
  "driftConfidence": 0.97,
  "primaryDriftDriver": "novel_merchant_category_BNPL_segment",
  "falseNegativesLast24h": 47,
  "estimatedFraudExposure": 284000,
  "thresholdBreached": "ALERT",
  "recommendation": "activate_challenger_model"
}
\`\`\``,
    allowedTools: ["query_model_metrics", "apply_cusum_analysis", "fetch_scoring_outcomes", "query_merchant_distribution"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Challenger Model Evaluation Skill",
    description: "Evaluates a pre-trained challenger fraud model against the current champion using holdout data, back-testing, and live traffic samples. Generates statistical lift report showing precision/recall trade-offs, calibration quality, and feature importance shifts. Recommends champion-challenger cutover if challenger demonstrates statistically significant improvement.",
    industry: "financial_services",
    domain: "Model Risk Management",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["champion-challenger", "model-evaluation", "backtesting", "lift", "fraud", "financial-services"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Challenger Model Evaluation Skill

## Evaluation Framework
1. **Holdout Performance**: Run challenger on 30-day holdout set — compute all primary metrics
2. **Back-test**: Apply challenger to historical transactions where outcomes are known
3. **Live Traffic Sample**: Route 5% of live traffic to challenger (shadow mode) for 4 hours
4. **Calibration Check**: Verify predicted probabilities match observed frequencies
5. **Lift Analysis**: Compute KS statistic, Gini coefficient, and cumulative lift at 10% decile

## Acceptance Criteria for Cutover
- Challenger precision ≥ current champion precision + 2pp
- No statistically significant recall degradation (p < 0.05)
- Calibration error < 3%
- Feature importance audit passed (no unexpected dependencies)
- SR 11-7 model risk documentation complete

## Output
\`\`\`json
{
  "challengerPrecision": 0.961,
  "championPrecision": 0.871,
  "liftImprovement": "+9.0pp",
  "recallDelta": "+0.8pp (statistically insignificant improvement)",
  "cutoversRecommended": true,
  "sr117Compliant": true,
  "shadowModePassRate": 0.94,
  "confidenceLevel": 0.99
}
\`\`\``,
    allowedTools: ["load_challenger_model", "run_backtesting", "activate_shadow_mode", "compute_lift_statistics"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Shadow-Mode Traffic Splitting Skill",
    description: "Manages real-time traffic routing between champion and challenger fraud models during validation. Routes configurable percentages of live transactions to challenger in read-only mode, compares scoring outputs, measures latency impact, and accumulates statistical evidence for cutover decision.",
    industry: "financial_services",
    domain: "Model Deployment",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["shadow-mode", "traffic-splitting", "canary", "model-deployment", "fraud", "financial-services"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Shadow-Mode Traffic Splitting Skill

## Traffic Split Profiles
| Phase | Champion | Challenger | Duration | Purpose |
|---|---|---|---|---|
| Validation | 100% | 5% (shadow) | 4 hours | Statistical evidence gathering |
| Canary | 95% | 5% (live) | 2 hours | Real impact measurement |
| Graduated | 80% | 20% (live) | 2 hours | Scale validation |
| Cutover | 0% | 100% (live) | Permanent | Full deployment |

## Shadow Mode Rules
- Challenger scores are logged but NEVER used for fraud decisions in shadow phase
- Latency overhead must be < 5ms additional per transaction
- Any challenger system error triggers immediate traffic revert to champion
- Statistical minimum: 10,000 transactions before cutover recommendation

## Output
\`\`\`json
{
  "phase": "validation_shadow",
  "transactionsSampled": 12847,
  "challengerAgreementRate": 0.941,
  "challengerLatencyMs": 48,
  "championLatencyMs": 51,
  "cutoversReadiness": "READY — minimum sample size achieved, performance criteria met"
}
\`\`\``,
    allowedTools: ["configure_traffic_split", "route_transaction_to_model", "collect_shadow_metrics", "revert_traffic_routing"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Feature Drift Analysis Skill",
    description: "Analyzes input feature distributions to detect population shift in transaction data that may explain fraud model degradation. Computes population stability index (PSI) for each feature, identifies which merchant categories or transaction types are driving distribution changes, and assesses whether feature drift requires model retraining vs recalibration.",
    industry: "financial_services",
    domain: "Model Risk Management",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["feature-drift", "PSI", "population-stability", "model-risk", "fraud", "financial-services"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Feature Drift Analysis Skill

## Population Stability Index (PSI) Thresholds
| PSI Value | Interpretation | Action |
|---|---|---|
| < 0.1 | No significant shift | Monitor |
| 0.1 – 0.2 | Moderate shift | Investigate and monitor |
| > 0.2 | Significant drift | Retrain or recalibrate model |
| > 0.35 | Major shift | Immediate model review |

## Key Features Monitored
- Transaction amount distribution
- Merchant category code (MCC) distribution
- Card-present vs card-not-present ratio
- Geographic transaction spread
- Time-of-day patterns
- Velocity features (transactions per hour per account)

## Output
\`\`\`json
{
  "topDriftFeatures": [
    { "feature": "merchant_category_BNPL", "psi": 0.42, "interpretation": "Major drift — new BNPL segment underrepresented in training data" },
    { "feature": "transaction_amount_P90", "psi": 0.18, "interpretation": "Moderate drift — higher value transactions increasing" }
  ],
  "overallPSI": 0.31,
  "recommendation": "retrain_with_bnpl_augmented_dataset",
  "estimatedRetrainingDataPoints": 180000
}
\`\`\``,
    allowedTools: ["compute_psi", "query_feature_distributions", "compare_to_training_baseline", "generate_drift_report"],
    contextMode: "inline",
    userInvocable: false,
  }));

  skills.push(await createSkill({
    name: "Zero-Downtime Model Swap Skill",
    description: "Executes seamless champion-to-challenger model cutover with zero transaction downtime. Manages hot-swapping of model artifacts in the scoring service, validates scoring continuity post-swap, maintains rollback capability for 24 hours, and generates SR 11-7 compliant model change documentation.",
    industry: "financial_services",
    domain: "Model Deployment",
    version: "1.0.0",
    author: "ATLAS Platform Team",
    trustTier: "platform-provided",
    complexity: "advanced",
    status: "active",
    tags: ["zero-downtime", "model-swap", "hot-swap", "SR-11-7", "fraud", "financial-services"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: `# Zero-Downtime Model Swap Skill

## Cutover Procedure (< 90 seconds total)
1. Pre-warm challenger model in standby scoring service
2. Redirect 1% traffic to challenger (1-minute observation)
3. If no errors: redirect 100% traffic (< 5 seconds)
4. Retire champion to rollback standby
5. Run 50-transaction validation suite on new champion
6. Confirm scoring service health metrics normal

## Rollback Protocol
- Champion retained in hot standby for 24 hours post-cutover
- Automatic rollback triggered if: precision drops > 3pp, error rate > 0.1%, latency > 200ms
- Manual rollback: < 30-second execution

## SR 11-7 Documentation Generated
- Model inventory update (champion → retired, challenger → champion)
- Validation evidence package (backtesting, shadow mode results)
- Material change notification if Gini improvement > 5pp
- Risk rating reassessment

## Output
\`\`\`json
{
  "cutoverCompleted": true,
  "cutoverDurationSeconds": 67,
  "transactionsDropped": 0,
  "newChampionVersion": "fraud-model-v4.2.1-bnpl-augmented",
  "rollbackExpiry": "2025-03-15T06:31:00Z",
  "sr117DocumentationId": "MRM-2025-0314-001"
}
\`\`\``,
    allowedTools: ["swap_model_artifact", "redirect_traffic", "run_validation_suite", "generate_model_documentation"],
    contextMode: "inline",
    userInvocable: false,
  }));

  // Runbooks
  console.log("  Creating Runbooks...");
  const runbooks = [];

  runbooks.push(await createRunbook({ name: "Model Precision Regression Alert", description: "Immediate response procedure when fraud model precision drops below alert threshold. Activates monitoring escalation, begins challenger model evaluation, and notifies Model Risk Management.", category: "incident_response", severity: "high", autonomyLevel: "autonomous", industry: "financial_services", estimatedDurationMinutes: 15 }));
  runbooks.push(await createRunbook({ name: "Shadow Challenger Model Activation", description: "Activates challenger fraud model in shadow mode for validation. Routes 5% of live transactions to challenger in read-only mode for statistical evidence collection before cutover decision.", category: "operational", severity: "medium", autonomyLevel: "autonomous", industry: "financial_services", estimatedDurationMinutes: 30 }));
  runbooks.push(await createRunbook({ name: "Champion-Challenger Model Cutover", description: "Zero-downtime swap from degraded champion to validated challenger fraud model. Requires SR 11-7 documentation and Model Risk sign-off for material changes.", category: "operational", severity: "high", autonomyLevel: "confirm_before", industry: "financial_services", estimatedDurationMinutes: 20 }));
  runbooks.push(await createRunbook({ name: "Fraud Model Incident Rollback Protocol", description: "Emergency rollback to previous champion model if challenger exhibits unexpected behavior post-cutover. Executes in < 30 seconds with zero transaction loss.", category: "incident_response", severity: "critical", autonomyLevel: "autonomous", industry: "financial_services", estimatedDurationMinutes: 5 }));
  runbooks.push(await createRunbook({ name: "Regulatory Model Change Notification", description: "Generates and routes regulatory notifications for material fraud model changes per SR 11-7 requirements. Notifies Model Risk Committee and relevant examiners.", category: "compliance", severity: "medium", autonomyLevel: "confirm_before", industry: "financial_services", estimatedDurationMinutes: 60 }));

  // Policies
  console.log("  Creating Policies...");
  const policies = [];

  policies.push(await createPolicy({ name: "SR 11-7 Model Risk Management Policy", description: "Enforces Federal Reserve SR 11-7 model risk management guidance for all ML fraud models. Requires validation before deployment, ongoing performance monitoring, and documentation of model changes.", policyType: "regulatory_compliance", framework: "SR 11-7", jurisdiction: "United States", status: "active", industry: "financial_services", effectiveDate: "2024-01-01", rules: [{ id: "SR117-01", title: "Pre-Deployment Validation", description: "No model may be deployed to production without documented backtesting and validation results", enforcement: "hard_block" }, { id: "SR117-02", title: "Material Change Documentation", description: "Any change resulting in > 5pp Gini improvement requires Model Risk Committee notification", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "FCRA Adverse Action Policy", description: "Ensures automated fraud decisions comply with Fair Credit Reporting Act adverse action requirements — customers must receive explanation when transactions are declined.", policyType: "regulatory_compliance", framework: "FCRA", jurisdiction: "United States", status: "active", industry: "financial_services", effectiveDate: "2024-01-01", rules: [{ id: "FCRA-01", title: "Adverse Action Notice", description: "Every declined transaction must generate an adverse action reason code stored for customer disclosure", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "PCI-DSS Transaction Data Handling Policy", description: "Governs cardholder data access during fraud model operations and self-healing procedures. Ensures PCI-DSS compliance throughout automated remediation.", policyType: "data_governance", framework: "PCI-DSS v4.0", jurisdiction: "Universal", status: "active", industry: "financial_services", effectiveDate: "2024-01-01", rules: [{ id: "PCI-01", title: "Cardholder Data Minimization", description: "Fraud model inputs and logs must never contain full PAN — use tokenized card references only", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "GDPR Automated Decision Policy", description: "Ensures GDPR Article 22 compliance for automated fraud decisions — customers have the right to explanation and human review of fully automated adverse decisions.", policyType: "regulatory_compliance", framework: "GDPR", jurisdiction: "European Union", status: "active", industry: "financial_services", effectiveDate: "2024-01-01", rules: [{ id: "GDPR-22", title: "Right to Explanation", description: "Automated fraud declines must store explainability output for customer disclosure on request", enforcement: "hard_block" }] }));

  // Agent
  console.log("  Creating Agent...");
  const agent = await createAgent({
    name: "Fraud Detection Model Recovery Agent",
    agentType: "single",
    description: "Monitors production ML fraud scoring model performance, detects precision drift caused by population shifts, autonomously validates and deploys a challenger model using shadow-mode traffic splitting, and executes zero-downtime champion-challenger cutover — while enforcing SR 11-7, FCRA, PCI-DSS, and GDPR compliance throughout.",
    owner: "Model Risk Management",
    department: "Financial Crime & Compliance",
    status: "active",
    environment: "production",
    riskTier: "CRITICAL",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    complianceTags: ["SR_11_7", "FCRA", "PCI_DSS", "GDPR", "MODEL_RISK"],
    toolAccessClass: "standard",
    maxToolIterations: 10,
    healthScore: 98,
    successRate: 0.97,
    avgLatencyMs: 9800,
    ontologyTags: ["fraud-detection", "model-risk", "ML-ops", "financial-crime", "champion-challenger"],
    runtimeConfig: {
      agentId: "SH-FIN-001",
      domain: "Financial Services",
      subdomain: "Fraud-Model-Operations",
      prompt: `You are the Fraud Detection Model Recovery Agent (SH-FIN-001), an Atlas Platform self-healing agent managing production ML fraud model health.

**Role**: Detect fraud model precision drift, validate challenger model, execute zero-downtime swap — autonomously.

**Goal**: Restore fraud model precision to ≥ 92% within 6 hours of drift detection, with zero transaction downtime and full SR 11-7 compliance.

**Healing Workflow**:
1. DETECT — Model Precision Monitoring Skill signals precision below threshold
2. DIAGNOSE — Feature Drift Analysis Skill identifies root cause (BNPL merchant category distribution shift)
3. HYPOTHESIZE — Challenger Model Evaluation Skill assesses pre-trained challenger viability
4. REMEDIATE — Shadow-Mode Traffic Splitting → validate → Zero-Downtime Model Swap
5. VALIDATE — Confirm new champion precision ≥ target; SR 11-7 documentation complete

**Without Atlas**: Model risk analyst reviews daily performance report → escalation meeting → committee approval → manual deployment. Timeline: 3–5 business days. Fraud exposure during gap: ~$1.4M.`,
    },
    preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })),
  });

  await patchAgent(agent.id, { policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })) });

  // Golden Dataset
  const dataset = await createGoldenDataset({ name: "SH-FIN-001 Fraud Model Recovery Test Cases", description: "Test cases for fraud model self-healing scenarios", agentId: agent.id, industry: "financial_services", status: "active" });
  await createTestCase(dataset.id, { input: "Fraud model precision drops to 87.1% — CUSUM chart shows sustained downward trend over 48h. What action?", expectedOutput: "Alert threshold breached. Feature Drift Analysis triggered. BNPL merchant category PSI: 0.42 (major drift). Challenger model activation initiated.", tags: ["detection"] });
  await createTestCase(dataset.id, { input: "Challenger model shows +9.0pp precision improvement in backtesting. Shadow mode sample: 12,847 transactions. Ready for cutover?", expectedOutput: "Yes. All acceptance criteria met: challenger precision 96.1% vs 87.1% champion, recall within tolerance, SR 11-7 documentation ready. Recommend cutover with Model Risk sign-off.", tags: ["evaluation"] });
  await createTestCase(dataset.id, { input: "Post-cutover: new champion precision 96.1%, 0 transactions dropped, latency 48ms vs 51ms previous. Rollback window?", expectedOutput: "Cutover successful. Old champion retained in hot standby for 24 hours. Rollback expires 2025-03-15T06:31:00Z. SR 11-7 material change notification dispatched.", tags: ["validation"] });
  await createTestCase(dataset.id, { input: "Customer disputes automated fraud decline — GDPR Article 22 right to explanation invoked", expectedOutput: "Explainability output retrieved: top 3 decline reasons provided (velocity anomaly, merchant category risk, geographic outlier). Human review scheduled per GDPR Article 22 requirement.", tags: ["policy-enforcement"] });
  await createTestCase(dataset.id, { input: "Post-cutover precision drops 4pp within 1 hour — rollback needed?", expectedOutput: "Rollback threshold exceeded (> 3pp drop). Automatic rollback to previous champion initiated. Execution time: < 30 seconds. 0 transactions dropped. Model Risk notified.", tags: ["rollback"] });

  const evalSuite = await createEvalSuite({ name: "SH-FIN-001 Eval Suite", description: "Evaluation suite for Fraud Detection Model Recovery Agent", agentId: agent.id, datasetId: dataset.id, status: "active", schedule: "weekly" });

  // Healing Pipeline
  const pipeline = await createHealingPipeline({
    title: "Fraud Model Precision Drift — BNPL Merchant Category Population Shift",
    agentId: agent.id,
    agentName: "Fraud Detection Model Recovery Agent",
    industry: "financial_services",
    severity: "high",
    stage: "diagnosed",
    issueType: "model_drift",
    issueDescription: "Production fraud model (fraud-model-v4.1.0) precision dropped from 95.2% baseline to 87.1% over 48 hours. Root cause: BNPL (Buy Now Pay Later) merchant category growth has shifted transaction distribution beyond model training envelope. 47 false negatives detected in last 24h — $284K estimated fraud exposure.",
    detectedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    triggerSource: "model_monitoring_cusum",
    priority: "high",
    diagnosisDetails: {
      rootCause: "Population shift: BNPL merchant category (MCC 6012) transactions grew 340% over 60 days — underrepresented in champion model training data (2022-2024 period predates BNPL adoption surge)",
      atlasSkillsInvoked: [
        { skillName: "Model Precision Monitoring Skill", finding: "CUSUM chart detected sustained precision decline. Current: 87.1%. Threshold: 92%. False negatives: 47 in 24h. Estimated fraud exposure: $284K.", duration: "Continuous monitoring — alert triggered within 2 hours of threshold breach" },
        { skillName: "Feature Drift Analysis Skill", finding: "Top drift feature: merchant_category_BNPL PSI=0.42 (major drift). Overall PSI: 0.31. Recommendation: retrain with BNPL-augmented dataset OR activate pre-trained challenger.", duration: "18 minutes" },
        { skillName: "Challenger Model Evaluation Skill", finding: "Pre-trained challenger fraud-model-v4.2.1-bnpl-augmented shows +9.0pp precision improvement. SR 11-7 documentation ready. Cutover recommended.", duration: "45 minutes" },
      ],
      falseNegativesLast24h: 47,
      estimatedFraudExposure: 284000,
      driftPSI: 0.31,
    },
    hypothesis: {
      primaryHypothesis: "Activate pre-trained challenger model (fraud-model-v4.2.1-bnpl-augmented) via shadow mode validation then zero-downtime cutover. No retraining required — challenger was pre-built anticipating BNPL growth.",
      confidence: 0.97,
      runbookCandidates: [
        { runbookName: "Shadow Challenger Model Activation", triggerCondition: "Challenger evaluation confirms +2pp precision improvement", expectedOutcome: "12,847 transactions sampled in shadow mode. Agreement rate 94.1%. Cutover approved.", estimatedDuration: "4 hours shadow + 90 seconds cutover" },
      ],
    },
    businessImpact: {
      falseNegativesPerHour: 2,
      fraudExposurePer24h: 284000,
      estimatedTotalExposure: 852000,
      customerFrictionRate: "FPR increased 1.1pp — est. 8,400 additional legitimate transaction declines per day",
      withAtlas: "Detected within 2 hours. Challenger deployed within 6 hours. Fraud exposure capped at ~$284K. Zero downtime.",
      withoutAtlas: "Detection at next daily model review (18 hours). Committee approval: 3–5 business days. Total exposure: ~$1.4M fraud losses + regulatory scrutiny.",
      reputationalRisk: "False positive rate increase causing customer complaints — 8,400 legitimate declines/day risking card abandonment",
    },
    remediation: {
      status: "in_progress",
      runbooksTriggered: [
        { runbookName: "Shadow Challenger Model Activation", status: "completed", result: "12,847 transactions sampled. Agreement rate 94.1%. Statistical significance achieved. Cutover recommended.", triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Regulatory Model Change Notification", status: "in_progress", result: "SR 11-7 material change documentation prepared. Awaiting Model Risk Committee sign-off for > 5pp Gini improvement.", triggeredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "SR 11-7 Model Risk Management Policy", rule: "SR117-02: Material Change Documentation", decision: "Gini improvement of 9pp exceeds 5pp threshold — Model Risk Committee notification required before cutover", outcome: "Notification sent. Cutover pending approval." },
        { policyName: "PCI-DSS Transaction Data Handling Policy", rule: "PCI-01: Cardholder Data Minimization", decision: "All shadow mode transaction logs use tokenized card references", outcome: "PCI-DSS compliance maintained throughout" },
        { policyName: "GDPR Automated Decision Policy", rule: "GDPR-22: Right to Explanation", decision: "Challenger model must generate explainability output for every decline", outcome: "Confirmed — challenger includes SHAP-based explainability" },
      ],
    },
    industryGuardrails: [
      { framework: "SR 11-7", constraint: "No model deployment without documented validation and Material Change notification for >5pp Gini improvement", status: "enforced" },
      { framework: "FCRA", constraint: "Adverse action reason codes stored for all automated declines", status: "enforced" },
      { framework: "PCI-DSS", constraint: "Cardholder data tokenized — no PAN in model inputs or logs", status: "enforced" },
      { framework: "GDPR Article 22", constraint: "Explainability output required for every automated adverse decision", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["Precision drift detected within 2 hours via CUSUM monitoring", "Feature drift analysis identified BNPL root cause in 18 minutes", "Challenger model validated via backtesting and 12,847-transaction shadow sample", "SR 11-7 documentation generated automatically", "Model Risk Committee notified with complete evidence package"],
      requiresHumanAction: ["Model Risk Committee sign-off for material change (>5pp Gini improvement)", "Final cutover approval before execution"],
      withoutAtlas: "Manual path: 18-hour detection lag → model risk ticket → committee meeting → 3–5 day deployment cycle → $1.4M cumulative fraud exposure.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── PHASE C: SH-MFG-001 — Factory Floor Anomaly Recovery Agent ──────────────

async function createManufacturingAgent() {
  console.log("\n[Phase C] SH-MFG-001 — Factory Floor Anomaly Recovery Agent (Manufacturing)");

  const skills = [];
  console.log("  Creating Skills...");

  skills.push(await createSkill({ name: "IoT Vibration Signal Analysis Skill", description: "Analyzes high-frequency accelerometer and vibration sensor data from CNC machines and production equipment. Applies FFT (Fast Fourier Transform) and envelope analysis to detect bearing wear signatures, shaft imbalance, misalignment, and structural resonance — distinguishing normal operational variation from anomalous patterns indicating incipient failure.", industry: "manufacturing", domain: "Predictive Maintenance", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["IoT", "vibration", "FFT", "predictive-maintenance", "CNC", "manufacturing"], agentTypeCompatibility: ["single", "team"], markdownBody: "# IoT Vibration Signal Analysis Skill\n\nApplies FFT and envelope analysis to detect: bearing wear (BPFO/BPFI harmonics), shaft imbalance (1x rpm sideband), misalignment (2x rpm harmonic), and resonance.\n\n## Alert Thresholds\n- RMS velocity: Alert >4.5 mm/s, Critical >11.2 mm/s (ISO 10816)\n- BPFO amplitude: Alert >3x baseline, Critical >8x baseline\n- Kurtosis: Alert >4, Critical >8\n\n## Output: { anomalyType, severity, confidence, affectedComponent, predictedFailureHours, recommendedAction }", allowedTools: ["query_vibration_sensors", "run_fft_analysis", "compare_baseline_spectrum"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Bearing Wear Classification Skill", description: "Classifies bearing condition stage from vibration signatures using ISO 10816 standards and historical failure patterns. Determines remaining useful life (RUL) estimate, identifies specific bearing component affected, and generates maintenance urgency recommendation aligned with production schedule.", industry: "manufacturing", domain: "Predictive Maintenance", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["bearing", "wear", "RUL", "ISO-10816", "maintenance", "manufacturing"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Bearing Wear Classification Skill\n\n## Wear Stages\n- Stage 1 (Normal): RUL >30 days — Monitor\n- Stage 2 (Incipient): RUL 14-30 days — Schedule\n- Stage 3 (Advanced): RUL 3-14 days — Urgent\n- Stage 4 (Critical): RUL <72 hours — Emergency\n\n## Output: { wearStage, rul_hours, bearingId, componentType, maintenanceUrgency, recommendedWindow }", allowedTools: ["classify_bearing_condition", "estimate_rul", "query_bearing_catalog"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Maintenance Window Scheduling Skill", description: "Optimizes maintenance timing based on bearing RUL estimate, production schedule, parts availability, and technician capacity. Finds the earliest viable maintenance window that minimizes production impact while completing maintenance before predicted failure.", industry: "manufacturing", domain: "Maintenance Planning", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["scheduling", "maintenance-window", "production-planning", "OEE", "manufacturing"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Maintenance Window Scheduling Skill\n\nFinds optimal maintenance window by balancing: RUL urgency, production order schedule, shift transitions, parts lead time, and technician availability.\n\n## Scheduling Rules\n- Stage 4 (Critical): Override production — schedule within 24h\n- Stage 3 (Advanced): Schedule next planned stoppage\n- Stage 2 (Incipient): Schedule within next 10 days\n\n## Output: { scheduledWindow, productionImpactHours, partOrders, technicianAssigned }", allowedTools: ["query_production_schedule", "check_parts_inventory", "assign_technician", "create_work_order"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Production Order Rerouting Skill", description: "Reassigns production orders from a machine approaching failure to alternate machines in the cell. Validates that alternate machines have compatible tooling, capacity, and quality programs. Updates MES job queue and notifies production supervision.", industry: "manufacturing", domain: "Production Control", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["rerouting", "production-orders", "MES", "capacity", "manufacturing"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Production Order Rerouting Skill\n\nReassigns jobs from impaired machine to available alternates considering: tooling compatibility, capacity, quality certification, and cycle time.\n\n## Output: { reroutedOrders, alternateAssignments, estimatedDelayHours, capacityUtilization }", allowedTools: ["query_production_orders", "check_machine_capability", "update_mes_routing", "notify_supervisor"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "MTBF Prediction Skill", description: "Calculates Mean Time Between Failures (MTBF) for production equipment using historical failure logs, maintenance records, and real-time condition monitoring. Generates failure probability curves and updates asset health scores to improve future predictive maintenance targeting.", industry: "manufacturing", domain: "Reliability Engineering", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["MTBF", "reliability", "failure-prediction", "asset-health", "manufacturing"], agentTypeCompatibility: ["single", "team"], markdownBody: "# MTBF Prediction Skill\n\nUses Weibull distribution fitting on historical failure data + real-time condition signals to predict failure probability.\n\n## Output: { mtbfHours, currentConditionScore, failureProbabilityNext72h, weibullBeta, weibullEta }", allowedTools: ["query_maintenance_history", "apply_weibull_analysis", "update_asset_health_score"], contextMode: "inline", userInvocable: false }));

  console.log("  Creating Runbooks...");
  const runbooks = [];
  runbooks.push(await createRunbook({ name: "Vibration Threshold Breach Response", description: "Immediate response when CNC machine vibration exceeds ISO 10816 alert threshold. Initiates condition assessment, reduces machine speed by 30% as protective measure, and triggers full diagnosis.", category: "incident_response", severity: "high", autonomyLevel: "autonomous", industry: "manufacturing", estimatedDurationMinutes: 20 }));
  runbooks.push(await createRunbook({ name: "Emergency Maintenance Dispatch", description: "Dispatches maintenance technician for Stage 3/4 bearing wear. Creates urgent work order, confirms parts availability, and activates machine speed restriction until maintenance complete.", category: "escalation", severity: "critical", autonomyLevel: "confirm_before", industry: "manufacturing", estimatedDurationMinutes: 30 }));
  runbooks.push(await createRunbook({ name: "Production Order Rerouting Protocol", description: "Transfers affected production orders to alternate machines while impaired machine is under maintenance. Validates tooling compatibility and updates MES.", category: "operational", severity: "medium", autonomyLevel: "autonomous", industry: "manufacturing", estimatedDurationMinutes: 45 }));
  runbooks.push(await createRunbook({ name: "OEM Escalation Protocol", description: "Escalates to OEM technical support for complex failure modes outside standard maintenance scope. Provides sensor data package and fault history.", category: "escalation", severity: "high", autonomyLevel: "confirm_before", industry: "manufacturing", estimatedDurationMinutes: 60 }));
  runbooks.push(await createRunbook({ name: "Post-Maintenance Validation Protocol", description: "Validates machine health after maintenance completion. Runs vibration acceptance test, quality first-article inspection, and updates asset health score.", category: "operational", severity: "medium", autonomyLevel: "autonomous", industry: "manufacturing", estimatedDurationMinutes: 90 }));

  console.log("  Creating Policies...");
  const policies = [];
  policies.push(await createPolicy({ name: "ISO 55001 Asset Management Policy", description: "Ensures autonomous maintenance decisions align with ISO 55001 asset management system requirements — particularly lifecycle optimization, risk-based maintenance planning, and asset performance monitoring.", policyType: "operational", framework: "ISO 55001", jurisdiction: "Universal", status: "active", industry: "manufacturing", effectiveDate: "2024-01-01", rules: [{ id: "ISO55-01", title: "Risk-Based Maintenance", description: "Maintenance timing must be based on quantified risk assessment (RUL + production impact + safety)", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "OSHA Equipment Safety Policy", description: "Prevents autonomous agents from operating equipment beyond safe parameters. Enforces immediate shutdown or speed reduction when equipment health metrics exceed safe operating limits.", policyType: "safety", framework: "OSHA 29 CFR 1910", jurisdiction: "United States", status: "active", industry: "manufacturing", effectiveDate: "2024-01-01", rules: [{ id: "OSHA-01", title: "Safe Operating Limit Enforcement", description: "Machine must be speed-limited to 70% capacity or shut down when Stage 3+ bearing wear detected", enforcement: "hard_block" }, { id: "OSHA-02", title: "Lockout-Tagout Compliance", description: "Agent must not initiate maintenance scheduling without confirming LOTO procedure is in work order", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "ISO 9001 Production Quality Policy", description: "Ensures that production rerouting decisions maintain product quality standards — parts produced on alternate machines must meet same quality certification requirements.", policyType: "quality", framework: "ISO 9001:2015", jurisdiction: "Universal", status: "active", industry: "manufacturing", effectiveDate: "2024-01-01", rules: [{ id: "ISO9-01", title: "Alternate Machine Quality Certification", description: "Production orders may only be routed to machines with same or higher quality certification for that part number", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "Predictive Maintenance SLA Policy", description: "Atlas platform SLA commitment for predictive maintenance response times — ensuring maintenance actions are taken well within predicted failure windows.", policyType: "operational", framework: "Atlas Platform SLA", jurisdiction: "Universal", status: "active", industry: "manufacturing", effectiveDate: "2024-01-01", rules: [{ id: "PMSL-01", title: "Stage 4 Response SLA", description: "Stage 4 (Critical) bearing wear must have maintenance scheduled within 24 hours of detection", enforcement: "hard_block" }, { id: "PMSL-02", title: "Advance Warning Minimum", description: "Maintenance must be completed with minimum 8 hours before predicted failure", enforcement: "warn" }] }));

  console.log("  Creating Agent...");
  const agent = await createAgent({ name: "Factory Floor Anomaly Recovery Agent", agentType: "single", description: "Predictive maintenance self-healing agent that monitors IoT vibration sensors on production equipment, detects bearing wear 72+ hours before failure, schedules maintenance during optimal production windows, reroutes affected production orders, and validates equipment health post-maintenance — preventing unplanned downtime while maintaining ISO 9001 quality standards and OSHA safety compliance.", owner: "Maintenance Engineering", department: "Manufacturing Operations", status: "active", environment: "production", riskTier: "HIGH", autonomyMode: "supervised", modelProvider: "anthropic", modelName: "claude-opus-4-5", currentVersion: "1.0.0", complianceTags: ["ISO_55001", "OSHA", "ISO_9001", "PREDICTIVE_MAINTENANCE"], toolAccessClass: "standard", maxToolIterations: 10, healthScore: 97, successRate: 0.96, avgLatencyMs: 8900, ontologyTags: ["predictive-maintenance", "IoT", "CNC", "manufacturing-ops", "reliability"], runtimeConfig: { agentId: "SH-MFG-001", domain: "Manufacturing", subdomain: "Predictive-Maintenance", prompt: "You are the Factory Floor Anomaly Recovery Agent (SH-MFG-001). Detect equipment anomalies via IoT sensors, predict failure timing, schedule maintenance optimally, reroute production orders, and validate recovery. Goal: zero unplanned downtime. Always enforce OSHA safety limits (OSHA-01: speed-limit at Stage 3+ wear). Without Atlas: vibration alarm triggers manual inspection 4-8 hours later; unplanned breakdown causes 12-36 hours downtime; cost $180K+ vs planned maintenance cost $12K." }, preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })) });
  await patchAgent(agent.id, { policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })) });

  const dataset = await createGoldenDataset({ name: "SH-MFG-001 Factory Anomaly Test Cases", description: "Test cases for factory floor self-healing", agentId: agent.id, industry: "manufacturing", status: "active" });
  await createTestCase(dataset.id, { input: "CNC-Line-7 vibration RMS 6.2 mm/s, BPFO amplitude 4.8x baseline, kurtosis 5.1 — what is the assessment?", expectedOutput: "Stage 3 Advanced bearing wear detected. RUL: 8-12 days. OSHA-01 enforced: machine speed reduced to 70%. Urgent maintenance work order created. Production orders rerouted to CNC-Line-5 and CNC-Line-9.", tags: ["detection"] });
  await createTestCase(dataset.id, { input: "Parts inventory: bearing 6308-2RS in stock (2 units). Technician shift: Day shift available 06:00-14:00. Production schedule: CNC-Line-7 has 3 orders due Friday. Best maintenance window?", expectedOutput: "Recommended window: Tomorrow 06:00-10:00 (Day shift, parts available, 3 production orders rerouted to CNC-5/9 with compatible tooling). Production delay: 0 hours. ISO 9001 quality certification verified on alternate machines.", tags: ["scheduling"] });
  await createTestCase(dataset.id, { input: "Post-maintenance vibration test: RMS 1.8 mm/s, BPFO amplitude 1.1x baseline, kurtosis 2.3 — acceptable?", expectedOutput: "Machine health restored. All metrics within ISO 10816 normal range. Quality first-article inspection cleared. Asset health score updated: 97/100. Production resumed.", tags: ["validation"] });
  await createTestCase(dataset.id, { input: "Breakdown occurred before maintenance — CNC-Line-7 stopped. What is Atlas post-incident analysis?", expectedOutput: "Incident logged. MTBF updated (Weibull analysis). Root cause: 72h detection-to-maintenance gap exceeded Stage 3 RUL. Recommendation: reduce Stage 3 response SLA from 10 days to 5 days. Without Atlas: failure would not have been predicted at all — reactive breakdown.", tags: ["post-incident"] });
  await createTestCase(dataset.id, { input: "5 machines showing simultaneous Stage 2 wear — systemic issue suspected", expectedOutput: "Systemic pattern detected. Common factor analysis: all 5 machines share same lubricant batch (LOT-2024-0891). Potential lubricant contamination. OEM escalation triggered. Lubricant audit recommended.", tags: ["systemic-detection"] });

  const evalSuite = await createEvalSuite({ name: "SH-MFG-001 Eval Suite", description: "Evaluation suite for Factory Floor Anomaly Recovery Agent", agentId: agent.id, datasetId: dataset.id, status: "active", schedule: "weekly" });

  const pipeline = await createHealingPipeline({
    title: "CNC-Line-7 Bearing Wear Anomaly — Stage 3 Advanced (RUL: 10 days)",
    agentId: agent.id,
    agentName: "Factory Floor Anomaly Recovery Agent",
    industry: "manufacturing",
    severity: "high",
    stage: "diagnosed",
    issueType: "equipment_anomaly",
    issueDescription: "CNC-Line-7 Spindle Bearing #2 showing Stage 3 advanced wear signature. IoT sensors detecting BPFO harmonic at 4.8x baseline amplitude, RMS velocity 6.2 mm/s (alert threshold: 4.5 mm/s). Predicted failure in 8-12 days. 3 production orders totaling 2,400 parts at risk. OSHA safety limit enforced: machine running at 70% speed.",
    detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    triggerSource: "iot_vibration_monitor",
    priority: "high",
    diagnosisDetails: {
      rootCause: "Lubrication interval exceeded — Bearing 6308-2RS on CNC-Line-7 Spindle Position 2 last lubricated 2,847 hours ago (recommended interval: 2,000 hours). Insufficient lubrication accelerated wear.",
      atlasSkillsInvoked: [
        { skillName: "IoT Vibration Signal Analysis Skill", finding: "BPFO harmonic at 4.8x baseline — bearing defect frequency confirmed. RMS 6.2 mm/s exceeds alert threshold (4.5 mm/s). Kurtosis 5.1 (Alert >4). FFT analysis completed in 3 minutes.", duration: "3 minutes" },
        { skillName: "Bearing Wear Classification Skill", finding: "Stage 3 Advanced. RUL: 8-12 days (Weibull confidence: 87%). Bearing ID: 6308-2RS, Spindle Position 2. Immediate action: speed restrict + schedule urgent maintenance.", duration: "5 minutes" },
        { skillName: "MTBF Prediction Skill", finding: "Updated MTBF for this machine: 2,940 hours (prev: 3,100 hours). Failure probability in next 72h: 8%. Failure probability in 10 days: 71%.", duration: "8 minutes" },
      ],
      machineId: "CNC-Line-7",
      bearingId: "6308-2RS-SP2",
      wearStage: 3,
      rulHours: 240,
      rmsVelocity: 6.2,
      bpfoAmplitude: "4.8x baseline",
    },
    hypothesis: {
      primaryHypothesis: "Schedule urgent maintenance in next 3-5 days during optimal production window. Reroute 3 affected production orders to CNC-Line-5 and CNC-Line-9. Cost: $12K planned maintenance vs $180K+ unplanned breakdown.",
      confidence: 0.94,
      runbookCandidates: [
        { runbookName: "Emergency Maintenance Dispatch", triggerCondition: "Stage 3 wear confirmed, parts available", expectedOutcome: "Work order created, technician assigned, parts ordered, maintenance scheduled in 48h window", estimatedDuration: "3 days" },
        { runbookName: "Production Order Rerouting Protocol", triggerCondition: "Immediately", expectedOutcome: "3 orders (2,400 parts) rerouted to CNC-5/9 with compatible tooling. 0 production delay.", estimatedDuration: "45 minutes" },
      ],
    },
    businessImpact: {
      productionOrdersAtRisk: 3,
      partsAtRisk: 2400,
      plannedMaintenanceCost: 12000,
      unplannedBreakdownCost: 182000,
      costSavings: 170000,
      productionDelayIfPlanned: "0 hours (rerouting to CNC-5/9)",
      productionDelayIfBreakdown: "18–36 hours",
      withAtlas: "Detected 10 days before failure. Planned maintenance scheduled. Production rerouted. Cost: $12K. Zero unplanned downtime.",
      withoutAtlas: "Alarm triggered at actual failure — 12-36 hour unplanned downtime. Emergency repair: $180K+. 3 production orders missed. Customer delivery penalty.",
    },
    remediation: {
      status: "in_progress",
      runbooksTriggered: [
        { runbookName: "Vibration Threshold Breach Response", status: "completed", result: "Machine speed reduced to 70% (OSHA-01 enforced). Condition assessment complete. Maintenance urgency confirmed.", triggeredAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Production Order Rerouting Protocol", status: "completed", result: "3 production orders rerouted: WO-2024-0891 → CNC-Line-5, WO-2024-0892 → CNC-Line-9, WO-2024-0893 → CNC-Line-5. ISO 9001 quality certification verified on both alternate machines.", triggeredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Emergency Maintenance Dispatch", status: "in_progress", result: "Work order WO-MAINT-2024-1127 created. Bearing 6308-2RS confirmed in stock (2 units). Technician J. Martinez assigned. Scheduled: Tomorrow 06:00-10:00.", triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "OSHA Equipment Safety Policy", rule: "OSHA-01: Safe Operating Limit Enforcement", decision: "Machine speed restricted to 70% capacity immediately upon Stage 3 detection", outcome: "Speed restriction active — machine operating safely" },
        { policyName: "ISO 9001 Production Quality Policy", rule: "ISO9-01: Alternate Machine Quality Certification", decision: "CNC-5 and CNC-9 verified to hold same quality certifications for all 3 rerouted part numbers", outcome: "Quality compliance maintained" },
        { policyName: "Predictive Maintenance SLA Policy", rule: "PMSL-01: Stage 4 Response SLA", decision: "Current Stage 3 — target maintenance completion 3 days ahead of Stage 4 transition", outcome: "Maintenance scheduled within SLA" },
      ],
    },
    industryGuardrails: [
      { framework: "ISO 55001", constraint: "Risk-based maintenance timing — quantified RUL + production impact assessment required", status: "enforced" },
      { framework: "OSHA 29 CFR 1910", constraint: "Machine speed-limited to 70% at Stage 3+ wear", status: "enforced" },
      { framework: "ISO 9001:2015", constraint: "Alternate machines must hold same quality certification", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["Vibration anomaly detected in 3 minutes", "Bearing wear classified Stage 3 in 8 minutes", "Machine speed restricted to 70% (OSHA compliant)", "3 production orders rerouted to certified alternates", "Work order created and technician assigned", "Parts availability confirmed"],
      requiresHumanAction: ["Technician performs bearing replacement (physical work)", "Production supervision accepts rerouting plan"],
      withoutAtlas: "Alarm at actual failure (no predictive capability). Emergency maintenance: $180K+. 18-36 hours unplanned downtime. Customer delivery failures.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── PHASE D: SH-RETAIL-001 — Order Fulfillment Recovery Agent ────────────────

async function createRetailAgent() {
  console.log("\n[Phase D] SH-RETAIL-001 — Order Fulfillment Recovery Agent (Retail/E-Commerce)");

  const skills = [];
  console.log("  Creating Skills...");

  skills.push(await createSkill({ name: "WMS Health Monitoring Skill", description: "Continuously monitors Warehouse Management System API health, response time, error rates, and throughput. Distinguishes transient errors from systemic failures, measures cascade impact on order processing queue, and quantifies SLA breach exposure based on order volume and time-to-delivery commitments.", industry: "retail", domain: "Order Fulfillment", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["WMS", "monitoring", "API-health", "fulfillment", "SLA", "retail"], agentTypeCompatibility: ["single", "team"], markdownBody: "# WMS Health Monitoring Skill\n\nMonitors: API response time (P99), error rate, throughput (orders/min), queue depth, pick completion rate.\n\n## Thresholds\n- Response P99 Alert: >2s | Critical: >10s\n- Error Rate Alert: >2% | Critical: >20%\n- Queue Depth Alert: >500 orders | Critical: >2,000 orders\n\n## Output: { healthStatus, errorRate, queueDepth, slaBreachRisk, affectedOrderCount, estimatedImpact }", allowedTools: ["check_wms_api_health", "query_order_queue_depth", "calculate_sla_breach_risk"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Fallback Routing Engine Skill", description: "Identifies and activates alternate fulfillment paths when primary warehouse system fails. Evaluates alternate fulfillment centers, 3PL partners, and drop-ship suppliers based on inventory availability, geographic proximity to customers, and delivery time commitments. Executes routing changes in OMS.", industry: "retail", domain: "Order Fulfillment", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["fallback", "routing", "3PL", "fulfillment-center", "OMS", "retail"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Fallback Routing Engine Skill\n\nEvaluates alternate fulfillment sources: secondary DCs, 3PLs, store fulfillment, drop-ship.\n\n## Routing Priority: (1) Secondary DC → (2) 3PL partner → (3) Store fulfillment → (4) Drop-ship → (5) Backorder with notification\n\n## Output: { reroutedOrders, alternateSource, deliveryDateImpact, inventoryAllocated, reroutingCompletedAt }", allowedTools: ["query_inventory_availability", "check_3pl_capacity", "update_oms_routing", "allocate_inventory"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Order Queue Preservation Skill", description: "Protects order state during WMS outages by capturing in-flight orders to a durable queue, preventing duplicate processing, maintaining order sequence integrity, and ensuring no orders are lost during system transitions or failover events.", industry: "retail", domain: "Order Management", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["order-queue", "durability", "OMS", "failover", "deduplication", "retail"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Order Queue Preservation Skill\n\nCaptures order state snapshot at outage onset. Prevents duplicate processing during recovery. Maintains FIFO sequence for SLA-priority orders.\n\n## Output: { ordersPreserved, duplicatesPrevenated, highPriorityOrders, queueRestorationReady }", allowedTools: ["snapshot_order_queue", "lock_processing_queue", "deduplicate_orders", "restore_order_state"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Customer Notification Orchestration Skill", description: "Generates and dispatches proactive customer communications when fulfillment delays occur due to system failures. Segments customers by order priority and delivery commitment, personalizes messages by channel (email, SMS, app push), and ensures regulatory compliance for consumer protection notification requirements.", industry: "retail", domain: "Customer Experience", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["customer-notification", "email", "SMS", "consumer-protection", "retail", "CX"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Customer Notification Orchestration Skill\n\nSegments: (1) Same-day delivery at risk → Immediate SMS+Email, (2) Next-day delivery at risk → Email within 30 min, (3) Standard delivery → Email if >24h delay. All notifications include revised delivery date and compensation offer per policy.\n\n## Output: { notificationsSent, channelBreakdown, estimatedDelay, compensationOffered }", allowedTools: ["fetch_customer_contacts", "send_sms_notification", "send_email_notification", "push_app_notification"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "SLA Breach Detection Skill", description: "Monitors real-time order delivery commitments against current fulfillment status. Identifies orders at risk of SLA breach due to WMS outages or routing delays, calculates financial exposure from carrier penalty clauses, and prioritizes recovery actions by breach severity and customer tier.", industry: "retail", domain: "Service Level Management", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["SLA", "breach-detection", "delivery-commitment", "carrier-penalty", "retail"], agentTypeCompatibility: ["single", "team"], markdownBody: "# SLA Breach Detection Skill\n\nMonitors: promised delivery date vs projected fulfillment completion. Calculates: breach probability, financial penalty exposure, customer tier impact, NPS risk.\n\n## Output: { ordersAtRisk, breachProbabilityByOrder, totalPenaltyExposure, priorityOrders, customerTierImpact }", allowedTools: ["query_delivery_commitments", "calculate_breach_probability", "estimate_penalty_exposure", "rank_by_customer_tier"], contextMode: "inline", userInvocable: false }));

  console.log("  Creating Runbooks...");
  const runbooks = [];
  runbooks.push(await createRunbook({ name: "WMS Outage Response Protocol", description: "Immediate response when WMS API becomes unavailable. Activates order queue preservation, switches to degraded-mode fulfillment, and initiates outage investigation.", category: "incident_response", severity: "critical", autonomyLevel: "autonomous", industry: "retail", estimatedDurationMinutes: 15 }));
  runbooks.push(await createRunbook({ name: "Overflow Order Rerouting Protocol", description: "Systematically routes orders stranded by WMS outage to alternate fulfillment sources (secondary DC, 3PL partners, store fulfillment) based on inventory availability and delivery commitments.", category: "operational", severity: "high", autonomyLevel: "autonomous", industry: "retail", estimatedDurationMinutes: 60 }));
  runbooks.push(await createRunbook({ name: "Customer Notification Blast Protocol", description: "Proactive customer communication campaign for orders affected by WMS outage. Segments by delivery promise and sends personalized delay notifications with revised delivery dates and compensation offers.", category: "operational", severity: "medium", autonomyLevel: "autonomous", industry: "retail", estimatedDurationMinutes: 30 }));
  runbooks.push(await createRunbook({ name: "SLA Breach Escalation Protocol", description: "Escalates to operations leadership when projected SLA breach count exceeds 500 orders or financial penalty exposure exceeds $100K. Includes real-time dashboard briefing package.", category: "escalation", severity: "critical", autonomyLevel: "confirm_before", industry: "retail", estimatedDurationMinutes: 20 }));
  runbooks.push(await createRunbook({ name: "Post-Outage Order Reconciliation", description: "Reconciles all order states after WMS restoration. Identifies any orders that fell through gaps, resolves duplicates, confirms delivery status, and closes the incident.", category: "post_incident", severity: "medium", autonomyLevel: "autonomous", industry: "retail", estimatedDurationMinutes: 120 }));

  console.log("  Creating Policies...");
  const policies = [];
  policies.push(await createPolicy({ name: "Consumer Protection Notification Policy", description: "Ensures timely customer notification of delivery delays per consumer protection requirements and company commitments. Agents must notify customers proactively — not reactively — when delivery commitments are at risk.", policyType: "regulatory_compliance", framework: "Consumer Protection", jurisdiction: "Universal", status: "active", industry: "retail", effectiveDate: "2024-01-01", rules: [{ id: "CP-01", title: "30-Minute Notification Requirement", description: "Customers with at-risk delivery commitments must be notified within 30 minutes of confirmed outage impact", enforcement: "hard_block" }, { id: "CP-02", title: "Accurate Revised Delivery Date", description: "All notifications must include a confirmed revised delivery date — not an estimate", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "PCI-DSS Order Data Handling Policy", description: "Protects cardholder data throughout automated fulfillment recovery operations. Ensures no payment data is exposed in routing logs or customer notification payloads.", policyType: "data_governance", framework: "PCI-DSS v4.0", jurisdiction: "Universal", status: "active", industry: "retail", effectiveDate: "2024-01-01", rules: [{ id: "PCIR-01", title: "No PAN in Routing Logs", description: "Order routing decisions and logs must reference order ID only — no payment card data", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "GDPR Customer Data Handling Policy", description: "Ensures customer personal data used in notification orchestration is handled lawfully under GDPR — consent verified, data minimization applied, and third-party 3PLs receive only necessary data.", policyType: "data_governance", framework: "GDPR", jurisdiction: "European Union", status: "active", industry: "retail", effectiveDate: "2024-01-01", rules: [{ id: "GDPR-R-01", title: "Data Minimization for 3PL Handoff", description: "3PL partners receive only: order ID, shipping address, items, delivery date — no customer PII beyond necessary", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "Carrier SLA Enforcement Policy", description: "Manages carrier SLA breach claims when WMS outages cause delivery failures. Atlas agents must document outage impact for carrier penalty claims and trigger claims process within 24 hours.", policyType: "operational", framework: "Atlas Platform SLA", jurisdiction: "Universal", status: "active", industry: "retail", effectiveDate: "2024-01-01", rules: [{ id: "SLA-01", title: "Carrier Penalty Documentation", description: "All orders that miss carrier pickup due to system outage must be documented for penalty recovery claim", enforcement: "warn" }] }));

  console.log("  Creating Agent...");
  const agent = await createAgent({ name: "Order Fulfillment Recovery Agent", agentType: "single", description: "E-commerce order fulfillment self-healing agent that detects WMS API failures, preserves order queue integrity, activates fallback routing to alternate fulfillment centers and 3PL partners, orchestrates proactive customer notifications, and reconciles all order states post-recovery — maintaining SLA commitments and PCI-DSS/GDPR compliance throughout.", owner: "Fulfillment Operations", department: "Supply Chain & Logistics", status: "active", environment: "production", riskTier: "HIGH", autonomyMode: "supervised", modelProvider: "anthropic", modelName: "claude-opus-4-5", currentVersion: "1.0.0", complianceTags: ["PCI_DSS", "GDPR", "CONSUMER_PROTECTION", "SLA_MANAGEMENT"], toolAccessClass: "standard", maxToolIterations: 10, healthScore: 97, successRate: 0.95, avgLatencyMs: 7800, ontologyTags: ["order-fulfillment", "WMS", "e-commerce", "3PL", "SLA-management"], runtimeConfig: { agentId: "SH-RETAIL-001", domain: "Retail", subdomain: "Order-Fulfillment", prompt: "You are the Order Fulfillment Recovery Agent (SH-RETAIL-001). Detect WMS failures, preserve orders, route to alternates, notify customers proactively. Goal: zero lost orders, maximum SLA preservation. CP-01 Policy: notify affected customers within 30 minutes. Without Atlas: ops team discovers outage from customer complaints 45-90 minutes later. Manual rerouting: 4-6 hours. Customer NPS impact: severe." }, preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })) });
  await patchAgent(agent.id, { policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })) });

  const dataset = await createGoldenDataset({ name: "SH-RETAIL-001 Fulfillment Recovery Test Cases", description: "Test cases for order fulfillment self-healing", agentId: agent.id, industry: "retail", status: "active" });
  await createTestCase(dataset.id, { input: "WMS API error rate spikes to 87%, response P99 exceeds 45 seconds, 1,847 orders queued. Peak shopping event in progress. Assessment?", expectedOutput: "Critical WMS outage detected. Order queue preserved (1,847 orders). Fallback routing activated: 1,200 orders → Secondary DC-West, 400 orders → 3PL-FedEx, 247 → Store Fulfillment. SLA breach risk: 312 same-day delivery orders. Customer notification in progress.", tags: ["detection"] });
  await createTestCase(dataset.id, { input: "312 same-day delivery orders at SLA breach risk. What customer action is triggered?", expectedOutput: "CP-01 policy enforced: 312 SMS + email notifications dispatched within 22 minutes. Messages include confirmed revised delivery dates and $10 credit compensation per company policy. Zero generic messages — all personalized with order ID and specific revised date.", tags: ["customer-notification"] });
  await createTestCase(dataset.id, { input: "After WMS restoration, post-outage reconciliation finds 14 orders with duplicate routing entries. Resolution?", expectedOutput: "14 duplicates resolved: oldest processing record retained, duplicate routing instructions cancelled. Carrier pickup confirmed for all 14. No customer impact. Incident documented for carrier penalty claim (CP-04).", tags: ["reconciliation"] });
  await createTestCase(dataset.id, { input: "3PL partner requests full customer shipping address including phone number for 400 rerouted orders. Compliant?", expectedOutput: "GDPR-R-01 enforced: 3PL receives order ID, shipping address, items, and delivery date only. Phone number not transmitted — not necessary for fulfillment. Data minimization applied.", tags: ["policy-enforcement"] });
  await createTestCase(dataset.id, { input: "Estimated SLA breach exposure: $340K in carrier penalty clauses. Escalation needed?", expectedOutput: "SLA Breach Escalation Protocol triggered: $340K exceeds $100K threshold. Operations VP briefed. Real-time dashboard package sent. Carrier documentation initiated for penalty recovery claims.", tags: ["escalation"] });

  const evalSuite = await createEvalSuite({ name: "SH-RETAIL-001 Eval Suite", description: "Evaluation suite for Order Fulfillment Recovery Agent", agentId: agent.id, datasetId: dataset.id, status: "active", schedule: "weekly" });

  const pipeline = await createHealingPipeline({
    title: "WMS API Cascade Failure — Peak Shopping Event — 1,847 Orders at Risk",
    agentId: agent.id,
    agentName: "Order Fulfillment Recovery Agent",
    industry: "retail",
    severity: "critical",
    stage: "diagnosed",
    issueType: "system_outage",
    issueDescription: "Primary WMS API went down at 14:32 UTC during peak shopping event. Error rate: 87%. Response timeout at 45 seconds. 1,847 orders queued including 312 same-day delivery commitments. Without intervention: estimated $340K in SLA penalties and significant customer NPS impact.",
    detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    triggerSource: "api_health_monitor",
    priority: "critical",
    diagnosisDetails: {
      rootCause: "WMS database connection pool exhaustion caused by unexpected traffic spike — connection pool limit (500) reached due to abandoned connections not being released by a background job.",
      atlasSkillsInvoked: [
        { skillName: "WMS Health Monitoring Skill", finding: "WMS API error rate: 87%. Response P99: 45s. Order queue depth: 1,847 (critical threshold: 2,000). SLA breach risk: 312 same-day orders. Outage detected in 4 minutes.", duration: "4 minutes" },
        { skillName: "Order Queue Preservation Skill", finding: "1,847 orders captured to durable queue. 23 in-flight transactions preserved. 0 orders lost. FIFO integrity maintained for same-day priority orders.", duration: "6 minutes" },
        { skillName: "SLA Breach Detection Skill", finding: "312 same-day delivery orders at >95% breach probability. Financial penalty exposure: $340K. Top 50 premium customer orders flagged for priority rerouting.", duration: "8 minutes" },
      ],
      affectedOrders: 1847,
      sameDayOrdersAtRisk: 312,
      penaltyExposure: 340000,
    },
    hypothesis: {
      primaryHypothesis: "Activate fallback routing immediately. Secondary DC-West has capacity for 1,200 orders. 3PL-FedEx can absorb 400. Store fulfillment handles remaining 247. Customer notifications within 22 minutes per CP-01.",
      confidence: 0.95,
      runbookCandidates: [
        { runbookName: "Overflow Order Rerouting Protocol", triggerCondition: "WMS outage confirmed > 5 minutes", expectedOutcome: "1,847 orders routed to alternates within 90 minutes", estimatedDuration: "90 minutes" },
        { runbookName: "Customer Notification Blast Protocol", triggerCondition: "Rerouting routes confirmed", expectedOutcome: "312 same-day delivery customers notified within 30 minutes per CP-01", estimatedDuration: "30 minutes" },
      ],
    },
    businessImpact: {
      ordersAtRisk: 1847,
      slaBreachExposure: 340000,
      revenueAtRisk: 892000,
      customerNpsRisk: "312 same-day delivery customers — NPS impact est. -12 points without proactive notification",
      withAtlas: "312 customers notified in 22 minutes. Orders rerouted in 90 minutes. SLA breaches: 8 (vs projected 312). Penalty exposure recovered: $330K of $340K.",
      withoutAtlas: "Operations team notified from customer complaints 45-90 minutes later. Manual rerouting: 4-6 hours. All 312 same-day deliveries fail. Customer complaint volume: est. 800+ tickets.",
    },
    remediation: {
      status: "in_progress",
      runbooksTriggered: [
        { runbookName: "WMS Outage Response Protocol", status: "completed", result: "Order queue preserved. 1,847 orders locked to durable queue. Degraded mode activated.", triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Overflow Order Rerouting Protocol", status: "in_progress", result: "1,200 orders → DC-West confirmed. 400 → 3PL-FedEx confirmed. 247 → Store fulfillment (8 stores). In progress.", triggeredAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
        { runbookName: "Customer Notification Blast Protocol", status: "completed", result: "312 same-day SMS+Email sent in 22 minutes. Revised delivery dates confirmed (next business day). $10 credit offered. Open rate: 78%.", triggeredAt: new Date(Date.now() - 80 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "Consumer Protection Notification Policy", rule: "CP-01: 30-Minute Notification Requirement", decision: "312 at-risk customers notified in 22 minutes — within SLA", outcome: "Compliant" },
        { policyName: "GDPR Customer Data Handling Policy", rule: "GDPR-R-01: Data Minimization for 3PL", decision: "3PL received order ID, address, items, date only — no phone or email transmitted", outcome: "GDPR compliant" },
        { policyName: "PCI-DSS Order Data Handling Policy", rule: "PCIR-01: No PAN in Routing Logs", decision: "All routing decisions reference order IDs only", outcome: "PCI-DSS compliant" },
      ],
    },
    industryGuardrails: [
      { framework: "Consumer Protection", constraint: "Customer notification within 30 minutes of confirmed delay", status: "enforced" },
      { framework: "PCI-DSS v4.0", constraint: "No cardholder data in routing or recovery logs", status: "enforced" },
      { framework: "GDPR", constraint: "3PL data minimization — necessary fields only", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["WMS outage detected in 4 minutes", "1,847 orders preserved with zero loss", "Fallback routing to 3 alternate sources", "312 customers notified in 22 minutes", "SLA breach reduced from 312 to projected 8"],
      requiresHumanAction: ["WMS engineering to fix connection pool issue", "Operations VP review for $340K SLA exposure"],
      withoutAtlas: "45-90 minute detection lag via customer complaints. Manual rerouting 4-6 hours. All 312 same-day delivery SLAs missed. 800+ complaint tickets. Carrier penalty: $340K.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── PHASE E: SH-ENERGY-001 — Grid Operations Stability Agent ─────────────────

async function createEnergyAgent() {
  console.log("\n[Phase E] SH-ENERGY-001 — Grid Operations Stability Agent (Energy/Utilities)");

  const skills = [];
  console.log("  Creating Skills...");

  skills.push(await createSkill({ name: "Generation Shortfall Detection Skill", description: "Monitors real-time power generation output from all generation sources — wind, solar, gas peakers, hydro, nuclear — against load demand curves. Detects unexpected generation drops, calculates instantaneous shortfall in MW, forecasts frequency deviation trajectory, and determines required response within NERC reliability standards.", industry: "energy", domain: "Grid Operations", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["generation", "shortfall", "NERC", "frequency", "grid-stability", "energy"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Generation Shortfall Detection Skill\n\nMonitors: generation by source (MW), frequency (Hz), reserve margin, load-following capacity.\n\n## Alert Thresholds\n- Shortfall Alert: >200 MW below forecast\n- Frequency Alert: <59.7 Hz or >60.3 Hz\n- Reserve Margin Critical: <10% spinning reserve\n\n## Output: { shortfallMW, currentFrequencyHz, reserveMarginPct, forecastedFrequencyIn5min, requiredResponseMW, responseUrgency }", allowedTools: ["query_scada_generation", "calculate_load_balance", "forecast_frequency_trajectory"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Demand Response Activation Skill", description: "Manages activation of enrolled demand response (DR) programs to reduce load in response to generation shortfalls. Sequences DR program activation by cost and response speed, notifies enrolled commercial and industrial customers, tracks load reduction commitments, and verifies actual curtailment.", industry: "energy", domain: "Demand Response", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["demand-response", "curtailment", "load-reduction", "DR-program", "energy"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Demand Response Activation Skill\n\nDR Program Portfolio (by activation speed):\n- Emergency DR (< 10 min): Large industrial curtailment contracts\n- Fast DR (10-30 min): Commercial building HVAC\n- Standard DR (30-60 min): Aggregated residential thermostat\n\nTotal enrolled capacity: 847 MW across 2,400 participants.\n\n## Output: { programsActivated, committedReductionMW, actualReductionMW, participantNotifications, estimatedActivationTime }", allowedTools: ["activate_dr_program", "notify_dr_participants", "track_curtailment_response", "verify_load_reduction"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Peaker Unit Dispatch Skill", description: "Dispatches combustion turbine and quick-start peaker generation units to close generation gaps not covered by demand response. Evaluates unit availability, startup time, ramp rate, heat rate, and operating cost. Sequences dispatch to minimize cost while meeting frequency restoration timeline.", industry: "energy", domain: "Generation Dispatch", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["peaker", "dispatch", "combustion-turbine", "generation", "FERC", "energy"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Peaker Unit Dispatch Skill\n\nPeaker fleet: 6 combustion turbines, total capacity 1,240 MW, startup time 8-15 minutes.\n\n## Dispatch Sequence (by cost/speed): CT-1 (8 min, $85/MWh) → CT-2 (10 min, $92/MWh) → CT-3 (12 min, $98/MWh)\n\n## FERC compliance: dispatch costs reported to market operator within 5 minutes of commitment.\n\n## Output: { unitsDispatched, totalCapacityMW, startupTimeMinutes, operatingCostPerHour, regulatoryNotification }", allowedTools: ["check_peaker_availability", "commit_peaker_unit", "notify_market_operator", "monitor_ramp_rate"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Load Zone Rebalancing Skill", description: "Manages power flow rebalancing across transmission zones when a generation source trips offline. Identifies constrained corridors, adjusts interchange schedules with neighboring utilities, triggers automatic transmission switching, and maintains N-1 reliability criteria throughout the recovery.", industry: "energy", domain: "Transmission Operations", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["load-balancing", "transmission", "N-1", "power-flow", "interchange", "energy"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Load Zone Rebalancing Skill\n\nManages: zone-level power flows, transmission line loading, interchange schedules, N-1 contingency compliance.\n\n## N-1 Standard: After any single contingency, no transmission element may be overloaded.\n\n## Output: { zonesRebalanced, lineLoadingPercent, interchangeAdjustmentsMW, n1Compliant, constrainedCorridors }", allowedTools: ["query_power_flow", "adjust_interchange_schedule", "trigger_transmission_switch", "verify_n1_compliance"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Real-Time Grid Telemetry Skill", description: "Ingests and processes high-frequency SCADA telemetry from generation units, transmission substations, and load measurement points. Provides sub-second situational awareness of grid state including frequency, voltage, current, and power factor across all monitored nodes. Supports event reconstruction for regulatory reporting.", industry: "energy", domain: "SCADA Operations", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["SCADA", "telemetry", "real-time", "grid-monitoring", "substation", "energy"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Real-Time Grid Telemetry Skill\n\nIngests: 50,000 measurement points at 4-second scan rate. Monitors: frequency (Hz), voltage (kV), current (A), power factor, MW flows.\n\n## Output: { currentFrequency, voltageProfile, criticalAlerts, eventTimeline, scadaDataQuality }", allowedTools: ["query_scada_telemetry", "process_measurement_stream", "reconstruct_event_timeline"], contextMode: "inline", userInvocable: false }));

  console.log("  Creating Runbooks...");
  const runbooks = [];
  runbooks.push(await createRunbook({ name: "Generation Shortfall Emergency Response", description: "Immediate multi-step response to unexpected generation loss. Activates demand response and peaker dispatch in sequence to restore frequency within NERC reliability standards within 10 minutes.", category: "incident_response", severity: "critical", autonomyLevel: "autonomous", industry: "energy", estimatedDurationMinutes: 10 }));
  runbooks.push(await createRunbook({ name: "Demand Response Program Activation", description: "Systematic activation of enrolled demand response programs sequenced by response speed and cost. Notifies all enrolled participants and tracks curtailment commitments.", category: "operational", severity: "high", autonomyLevel: "autonomous", industry: "energy", estimatedDurationMinutes: 30 }));
  runbooks.push(await createRunbook({ name: "Peaker Unit Dispatch Protocol", description: "Commits quick-start combustion turbine units to close generation gaps. Executes FERC market notification requirements and tracks unit ramp-up.", category: "operational", severity: "high", autonomyLevel: "confirm_before", industry: "energy", estimatedDurationMinutes: 15 }));
  runbooks.push(await createRunbook({ name: "NERC Reliability Event Reporting", description: "Generates mandatory NERC event report for generation loss events meeting reporting thresholds. Submits to appropriate reliability coordinator within required timeframe.", category: "compliance", severity: "medium", autonomyLevel: "confirm_before", industry: "energy", estimatedDurationMinutes: 60 }));
  runbooks.push(await createRunbook({ name: "Post-Event Grid Stability Assessment", description: "Comprehensive post-event analysis of generation shortfall and recovery. Measures frequency nadir, recovery timeline, reserve adequacy, and generates lessons-learned for reliability improvement.", category: "post_incident", severity: "medium", autonomyLevel: "autonomous", industry: "energy", estimatedDurationMinutes: 120 }));

  console.log("  Creating Policies...");
  const policies = [];
  policies.push(await createPolicy({ name: "NERC CIP Reliability Standards Policy", description: "Enforces NERC Critical Infrastructure Protection and reliability standards for all autonomous grid operations actions. Ensures frequency restoration within NERC BAL-003 timeframes and N-1 compliance throughout.", policyType: "regulatory_compliance", framework: "NERC CIP / BAL-003", jurisdiction: "North America", status: "active", industry: "energy", effectiveDate: "2024-01-01", rules: [{ id: "NERC-01", title: "Frequency Restoration Timeline", description: "Frequency must be restored to 59.95-60.05 Hz within 10 minutes of deviation event", enforcement: "hard_block" }, { id: "NERC-02", title: "NERC Event Reporting", description: "Generation loss events ≥ 300 MW must be reported to reliability coordinator within 1 hour", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "FERC Market Rules Compliance Policy", description: "Ensures all generation dispatch commitments and market communications comply with FERC tariff requirements — particularly real-time market notifications and cost-based dispatch sequencing.", policyType: "regulatory_compliance", framework: "FERC Open Access Tariff", jurisdiction: "United States", status: "active", industry: "energy", effectiveDate: "2024-01-01", rules: [{ id: "FERC-01", title: "Market Notification", description: "All peaker dispatch commitments must be reported to market operator within 5 minutes of commitment", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "ERCOT Dispatch Protocol Policy", description: "Compliance with ERCOT market dispatch protocols for balancing authority operations including ancillary service deployment and emergency operations.", policyType: "operational", framework: "ERCOT Protocols", jurisdiction: "Texas", status: "active", industry: "energy", effectiveDate: "2024-01-01", rules: [{ id: "ERC-01", title: "Emergency Response Procedures", description: "ERCOT Emergency Operations must be notified when frequency drops below 59.7 Hz", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "Environmental Emissions Cap Policy", description: "Tracks peaker unit runtime against environmental permit limits. Ensures combined cycle and combustion turbine operation remains within permitted hours and emission caps per EPA air quality regulations.", policyType: "environmental", framework: "EPA Clean Air Act", jurisdiction: "United States", status: "active", industry: "energy", effectiveDate: "2024-01-01", rules: [{ id: "EPA-01", title: "Annual Operating Hours Tracking", description: "Agent must verify peaker unit has remaining permit hours before dispatch commitment", enforcement: "hard_block" }] }));

  console.log("  Creating Agent...");
  const agent = await createAgent({ name: "Grid Operations Stability Agent", agentType: "single", description: "Real-time grid operations self-healing agent that monitors generation output, detects supply-demand imbalances, autonomously activates demand response programs, dispatches peaker generation, rebalances load zones across the transmission network, and maintains NERC frequency reliability standards — all within regulatory frameworks.", owner: "Grid Operations Center", department: "Energy Management & Dispatch", status: "active", environment: "production", riskTier: "CRITICAL", autonomyMode: "supervised", modelProvider: "anthropic", modelName: "claude-opus-4-5", currentVersion: "1.0.0", complianceTags: ["NERC_CIP", "FERC", "ERCOT", "EPA_CLEAN_AIR"], toolAccessClass: "standard", maxToolIterations: 8, healthScore: 99, successRate: 0.99, avgLatencyMs: 4200, ontologyTags: ["grid-operations", "demand-response", "SCADA", "power-generation", "NERC"], runtimeConfig: { agentId: "SH-ENERGY-001", domain: "Energy/Utilities", subdomain: "Grid-Operations", prompt: "You are the Grid Operations Stability Agent (SH-ENERGY-001). Monitor generation, detect shortfalls, activate DR and peakers autonomously. NERC-01 HARD REQUIREMENT: restore frequency to 59.95-60.05 Hz within 10 minutes. EPA-01: verify permit hours before peaker dispatch. Without Atlas: grid operator manually coordinates across 6 systems — typical response 15-25 minutes. Risk: frequency excursion causing cascade disconnection." }, preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })) });
  await patchAgent(agent.id, { policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })) });

  const dataset = await createGoldenDataset({ name: "SH-ENERGY-001 Grid Stability Test Cases", description: "Test cases for grid operations self-healing", agentId: agent.id, industry: "energy", status: "active" });
  await createTestCase(dataset.id, { input: "Wind farm Offshore-Alpha trips offline — loss of 847 MW. Frequency at 59.68 Hz and falling. Response?", expectedOutput: "NERC-01 activated: 10-minute restoration window started. DR Emergency programs activated (350 MW curtailment confirmed, 8 min). CT-1 and CT-2 dispatched (360 MW, 10 min). Frequency trajectory: stable at 59.82 Hz in 8 minutes. FERC notification sent at T+3 min.", tags: ["detection", "response"] });
  await createTestCase(dataset.id, { input: "Peaker CT-3 has 47 remaining permitted hours for the year. Annual limit is 500 hours. Is dispatch compliant?", expectedOutput: "EPA-01 check: CT-3 at 453/500 hours (9.4% remaining). Dispatch approved for shortfall response. Hours tracker updated. Warning flag: CT-3 approaching limit — recommend scheduling overhaul for next season.", tags: ["policy-enforcement"] });
  await createTestCase(dataset.id, { input: "Frequency restored to 59.97 Hz. Does this trigger NERC event reporting?", expectedOutput: "NERC BAL-003 assessment: 847 MW loss meets reporting threshold (≥300 MW). NERC event report auto-generated. Submitted to reliability coordinator at T+45 min. Event ID: NERC-2025-0314-847MW.", tags: ["compliance"] });
  await createTestCase(dataset.id, { input: "Load zone TX-North showing N-1 contingency loading at 103% on Line 7821 after generation rerouting. Action?", expectedOutput: "N-1 violation detected. Transmission switching TX-7821-ALT activated. Interchange schedule adjusted with Southwest Power Pool: -150 MW. Line loading reduced to 94%. N-1 compliance restored in 4 minutes.", tags: ["load-balancing"] });
  await createTestCase(dataset.id, { input: "Post-event: frequency nadir was 59.63 Hz, restored in 9.2 minutes. Was NERC BAL-003 met?", expectedOutput: "NERC BAL-003 compliance confirmed: restoration within 10-minute window (9.2 minutes). Frequency nadir 59.63 Hz — within acceptable range. Post-event report generated: response reserve recommendation: increase fast-acting DR by 100 MW.", tags: ["validation"] });

  const evalSuite = await createEvalSuite({ name: "SH-ENERGY-001 Eval Suite", description: "Evaluation suite for Grid Operations Stability Agent", agentId: agent.id, datasetId: dataset.id, status: "active", schedule: "weekly" });

  const pipeline = await createHealingPipeline({
    title: "Wind Farm Offshore-Alpha Unplanned Outage — 847 MW Generation Shortfall",
    agentId: agent.id,
    agentName: "Grid Operations Stability Agent",
    industry: "energy",
    severity: "critical",
    stage: "diagnosed",
    issueType: "generation_loss",
    issueDescription: "Offshore wind farm Offshore-Alpha tripped offline at 14:17 UTC due to equipment fault. Generation loss: 847 MW (40% of regional wind capacity). Frequency dropped to 59.63 Hz — below NERC alert threshold (59.7 Hz). NERC BAL-003 10-minute restoration clock running. Households at risk: est. 680,000 in load zone.",
    detectedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    triggerSource: "scada_frequency_monitor",
    priority: "critical",
    diagnosisDetails: {
      rootCause: "Offshore wind farm protection relay fault — overvoltage transient caused cascade disconnection of 14 turbine strings. Manual reset required on-site. Estimated restoration: 4-6 hours.",
      atlasSkillsInvoked: [
        { skillName: "Real-Time Grid Telemetry Skill", finding: "SCADA: frequency 59.63 Hz at T+0. Generation loss: 847 MW confirmed. Shortfall response urgency: CRITICAL (< 10-minute NERC window).", duration: "< 30 seconds" },
        { skillName: "Generation Shortfall Detection Skill", finding: "847 MW shortfall confirmed. Reserve margin: 12.3% (below 15% target). Frequency trajectory: declining at -0.04 Hz/sec without intervention. Required response: 847 MW within 8 minutes.", duration: "2 minutes" },
        { skillName: "Load Zone Rebalancing Skill", finding: "TX-North Line 7821: N-1 loading at 103% after generation re-dispatch. Transmission switching required to prevent cascade.", duration: "4 minutes" },
      ],
      shortfallMW: 847,
      frequencyNadir: 59.63,
      reserveMarginPct: 12.3,
      householdsAtRisk: 680000,
    },
    hypothesis: {
      primaryHypothesis: "DR Emergency program (350 MW, 8 min) + CT-1 and CT-2 dispatch (360 MW, 10 min) = 710 MW response. Remaining 137 MW from interchange adjustment with Southwest Power Pool. Frequency restoration: < 9 minutes.",
      confidence: 0.98,
      runbookCandidates: [
        { runbookName: "Generation Shortfall Emergency Response", triggerCondition: "Shortfall > 200 MW, frequency < 59.7 Hz", expectedOutcome: "Frequency restored to 59.95-60.05 Hz within 10 minutes", estimatedDuration: "10 minutes" },
        { runbookName: "NERC Reliability Event Reporting", triggerCondition: "847 MW loss confirmed — exceeds 300 MW reporting threshold", expectedOutcome: "NERC event report submitted within 1 hour", estimatedDuration: "45 minutes" },
      ],
    },
    businessImpact: {
      householdsAtRisk: 680000,
      frequencyNadir: "59.63 Hz",
      regulatoryPenaltyExposure: "NERC BAL-003 violation: est. $1M–$25M penalty if frequency not restored within 10 minutes",
      withAtlas: "Frequency restored in 9.2 minutes (NERC compliant). 0 customer outages. DR participants curtailed per contract. NERC report filed within 45 minutes.",
      withoutAtlas: "Manual coordination across SCADA, DR systems, and peaker dispatch: 15-25 minutes. NERC violation likely. Potential cascade outage: 680,000 customers.",
      emissionsCost: "CT-1 and CT-2 dispatch: est. $84,000 operational cost. Offset by avoided penalty and avoided outage cost ($340M estimated for 1-hour outage).",
    },
    remediation: {
      status: "completed",
      runbooksTriggered: [
        { runbookName: "Generation Shortfall Emergency Response", status: "completed", result: "DR Emergency programs: 350 MW curtailed (8 min). CT-1 dispatched: 180 MW (9 min). Interchange adjusted: 137 MW. Frequency: 59.97 Hz at T+9.2 min. NERC BAL-003 met.", triggeredAt: new Date(Date.now() - 89 * 60 * 1000).toISOString() },
        { runbookName: "NERC Reliability Event Reporting", status: "completed", result: "NERC event report NERC-2025-0314-847MW filed at T+45 min. Reliability coordinator acknowledged.", triggeredAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "NERC CIP Reliability Standards Policy", rule: "NERC-01: Frequency Restoration Timeline", decision: "Frequency restoration achieved in 9.2 minutes — within 10-minute NERC window", outcome: "COMPLIANT" },
        { policyName: "FERC Market Rules Policy", rule: "FERC-01: Market Notification", decision: "CT-1 dispatch reported to market operator within 3 minutes of commitment", outcome: "COMPLIANT" },
        { policyName: "Environmental Emissions Cap Policy", rule: "EPA-01: Operating Hours Verification", decision: "CT-1: 287/500 hours — dispatch approved. CT-2: 312/500 hours — dispatch approved.", outcome: "COMPLIANT" },
        { policyName: "ERCOT Dispatch Protocol", rule: "ERC-01: Emergency Operations Notification", decision: "ERCOT Emergency Operations notified at T+1 min (frequency < 59.7 Hz)", outcome: "COMPLIANT" },
      ],
    },
    industryGuardrails: [
      { framework: "NERC BAL-003", constraint: "Frequency restoration within 10 minutes — hard regulatory requirement", status: "enforced" },
      { framework: "FERC Open Access Tariff", constraint: "Market notification within 5 minutes of peaker commitment", status: "enforced" },
      { framework: "EPA Clean Air Act", constraint: "Peaker operating hours verified against annual permit limits before dispatch", status: "enforced" },
      { framework: "ERCOT Protocols", constraint: "Emergency Operations notification when frequency < 59.7 Hz", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["Generation shortfall detected in < 30 seconds", "850 MW response coordinated across DR + peaker + interchange in 9.2 minutes", "N-1 transmission violation detected and corrected", "NERC event report filed within 45 minutes", "All regulatory notifications dispatched automatically"],
      requiresHumanAction: ["On-site crew to manually reset Offshore-Alpha wind farm relay", "Engineering root cause investigation for protection relay fault"],
      withoutAtlas: "Manual coordination requires grid operator to work across 6+ systems simultaneously. Typical response: 15-25 minutes. NERC violation likely. Potential for 680,000-household blackout.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── PHASE F: SH-INS-001 — Claims Workflow Recovery Agent ────────────────────

async function createInsuranceAgent() {
  console.log("\n[Phase F] SH-INS-001 — Claims Workflow Recovery Agent (Insurance)");

  const skills = [];
  console.log("  Creating Skills...");

  skills.push(await createSkill({ name: "False-Positive Rate Monitoring Skill", description: "Continuously monitors the ML claims triage model's false-positive fraud flag rate in production. Uses statistical process control (CUSUM) to detect spikes indicating model miscalibration. Compares flagging rates by claim type, line of business, and geography to isolate whether the spike is systemic or segment-specific.", industry: "insurance", domain: "Claims Analytics", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["false-positive", "model-monitoring", "claims", "triage", "insurance", "CUSUM"], agentTypeCompatibility: ["single", "team"], markdownBody: "# False-Positive Rate Monitoring Skill\n\nMonitors: fraud flag rate by claim type, FPR vs historical baseline, flag rate by geography/adjuster/product.\n\n## Thresholds\n- FPR Alert: >8% (baseline: ~3%)\n- FPR Critical: >15%\n- Segment-specific spike: single segment >25%\n\n## Output: { currentFPR, baselineFPR, driftMagnitude, spikeSegments, affectedClaimsCount, estimatedMisclassified }", allowedTools: ["query_claims_triage_metrics", "apply_cusum_analysis", "segment_fpr_by_dimension"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Claims Re-Routing to Human Review Skill", description: "Identifies misclassified claims flagged as fraudulent by the triage model and routes them to human adjuster review queues with context on why they may have been incorrectly flagged. Prioritizes re-routing by claim age, payout amount, and claimant vulnerability indicators.", industry: "insurance", domain: "Claims Processing", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["claims-routing", "human-review", "adjuster", "triage", "insurance"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Claims Re-Routing to Human Review Skill\n\nRoutes likely-misclassified claims to adjuster queue with flag context. Prioritizes: claimant vulnerability (elderly, disability) > claim age (oldest first) > payout amount (largest first).\n\n## Output: { claimsRerouted, adjusterQueueUpdated, estimatedReviewTime, priorityBreakdown }", allowedTools: ["query_flagged_claims", "update_claim_routing", "populate_adjuster_queue", "add_review_context"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Model Threshold Recalibration Skill", description: "Adjusts the fraud triage model's classification threshold to reduce false positives while maintaining adequate fraud detection coverage. Tests candidate thresholds against holdout data, estimates the precision-recall trade-off, and recommends the threshold that minimizes false positives without exceeding a 5% false negative increase.", industry: "insurance", domain: "Model Risk Management", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["threshold-tuning", "recalibration", "fraud-model", "precision-recall", "insurance"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Model Threshold Recalibration Skill\n\nTests thresholds on holdout set: 0.50, 0.55, 0.60, 0.65, 0.70. Selects threshold that reduces FPR to < 5% without increasing FNR by > 5pp.\n\n## Acceptance: New threshold must be validated on last 30 days of claims before production deployment.\n\n## Output: { currentThreshold, recommendedThreshold, newFPR, newFNR, holdoutValidationPassed, approvalRequired }", allowedTools: ["load_claims_holdout", "test_threshold_candidates", "compute_precision_recall_curve", "deploy_threshold_update"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Claimant Impact Assessment Skill", description: "Quantifies the financial and welfare impact on claimants who experienced delayed payouts due to incorrect fraud flagging. Calculates average delay days, total payout amount delayed, identifies vulnerable claimants (elderly, disability, medical hardship), and determines compensation requirements per fair claims handling regulations.", industry: "insurance", domain: "Customer Impact", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active", tags: ["claimant-impact", "payout-delay", "vulnerable-customer", "fair-claims", "insurance"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Claimant Impact Assessment Skill\n\nAssesses: average payout delay (days), total amount delayed ($), vulnerable claimant count, complaints received, regulatory complaint risk.\n\n## Vulnerability flags: Age >75, disability claim type, medical hardship indicator, prior complaint history.\n\n## Output: { claimsDelayed, averageDelayDays, totalAmountDelayed, vulnerableClaimants, regulatoryComplaintRisk, compensationRequired }", allowedTools: ["query_delayed_claims", "flag_vulnerable_claimants", "calculate_compensation", "generate_impact_report"], contextMode: "inline", userInvocable: false }));
  skills.push(await createSkill({ name: "Regulatory Disclosure Skill", description: "Generates required regulatory disclosures when claims processing failures affect policyholders. Prepares state insurance department notifications, claimant adverse action explanations, and GDPR Article 22 explanations for automated decisions — in the correct format for each jurisdiction.", industry: "insurance", domain: "Regulatory Compliance", version: "1.0.0", author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active", tags: ["regulatory-disclosure", "state-insurance", "GDPR", "adverse-action", "NAIC", "insurance"], agentTypeCompatibility: ["single", "team"], markdownBody: "# Regulatory Disclosure Skill\n\nGenerates: (1) State insurance department notification of systemic processing error, (2) Individual claimant adverse action explanation, (3) GDPR Article 22 automated decision explanation.\n\n## Jurisdiction coverage: All 50 US states + EU GDPR + UK FCA.\n\n## Output: { disclosuresPrepared, regulatoryFilingReady, claimantNotificationsGenerated, gdprExplanationsGenerated }", allowedTools: ["generate_state_regulator_notice", "generate_adverse_action_letter", "generate_gdpr_explanation", "file_regulatory_disclosure"], contextMode: "inline", userInvocable: false }));

  console.log("  Creating Runbooks...");
  const runbooks = [];
  runbooks.push(await createRunbook({ name: "False-Positive Spike Response Protocol", description: "Immediate response when claims triage model false-positive rate exceeds alert threshold. Triggers model isolation, routes affected claims to human review, and initiates recalibration investigation.", category: "incident_response", severity: "high", autonomyLevel: "autonomous", industry: "insurance", estimatedDurationMinutes: 20 }));
  runbooks.push(await createRunbook({ name: "Human Review Queue Activation Protocol", description: "Activates expanded human adjuster review capacity for incorrectly flagged claims. Populates priority queues, assigns adjusters, and sets SLA targets for clearing backlog.", category: "operational", severity: "high", autonomyLevel: "autonomous", industry: "insurance", estimatedDurationMinutes: 30 }));
  runbooks.push(await createRunbook({ name: "Fraud Model Isolation Protocol", description: "Isolates malfunctioning fraud triage model and switches to rules-based fallback scoring. Prevents further false positives while root cause investigation proceeds.", category: "operational", severity: "critical", autonomyLevel: "confirm_before", industry: "insurance", estimatedDurationMinutes: 15 }));
  runbooks.push(await createRunbook({ name: "Claimant Notification and Remediation Protocol", description: "Proactively notifies claimants affected by incorrect fraud flags. Provides explanation, revised claim status, and compensation as applicable per fair claims handling requirements.", category: "compliance", severity: "medium", autonomyLevel: "confirm_before", industry: "insurance", estimatedDurationMinutes: 60 }));
  runbooks.push(await createRunbook({ name: "State Insurance Regulator Filing Protocol", description: "Prepares and files mandatory notifications to state insurance departments when a systemic claims processing error affects a reportable number of policyholders.", category: "compliance", severity: "high", autonomyLevel: "confirm_before", industry: "insurance", estimatedDurationMinutes: 120 }));

  console.log("  Creating Policies...");
  const policies = [];
  policies.push(await createPolicy({ name: "NAIC Model Audit Regulation Policy", description: "Ensures AI-driven insurance models comply with NAIC Model Bulletin on Artificial Intelligence — requiring fairness testing, explainability, and governance for automated claims decisions.", policyType: "regulatory_compliance", framework: "NAIC Model Bulletin on AI", jurisdiction: "United States", status: "active", industry: "insurance", effectiveDate: "2024-01-01", rules: [{ id: "NAIC-01", title: "Algorithm Fairness Testing", description: "Before recalibrated threshold deployed, fairness audit must confirm no disparate impact across protected classes", enforcement: "hard_block" }, { id: "NAIC-02", title: "Explainability Requirement", description: "Every automated adverse claims decision must have a stored explainability record", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "State Fair Claims Handling Policy", description: "Ensures compliance with state unfair claims settlement practices acts — particularly prompt payment requirements and prohibition on arbitrary claim denials.", policyType: "regulatory_compliance", framework: "NAIC Unfair Claims Settlement Model Act", jurisdiction: "United States (50 states)", status: "active", industry: "insurance", effectiveDate: "2024-01-01", rules: [{ id: "SFCH-01", title: "Prompt Payment Restoration", description: "Claims incorrectly delayed by model error must be expedited to within original SLA + delay period", enforcement: "hard_block" }, { id: "SFCH-02", title: "Adverse Action Explanation", description: "Any claim denial or delay must be accompanied by written explanation", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "GDPR Automated Decision Explanation Policy", description: "Ensures GDPR Article 22 compliance for EU policyholders — right to explanation and human review of fully automated adverse claims decisions.", policyType: "regulatory_compliance", framework: "GDPR Article 22", jurisdiction: "European Union", status: "active", industry: "insurance", effectiveDate: "2024-01-01", rules: [{ id: "GDPR22-01", title: "Automated Decision Explanation", description: "EU claimants must receive explanation for any automated fraud flag decision upon request", enforcement: "hard_block" }] }));
  policies.push(await createPolicy({ name: "SOX Internal Controls for Claims Policy", description: "Applies Sarbanes-Oxley internal controls requirements to claims reserve estimates and loss adjustment expenses impacted by model failures — ensuring financial statement accuracy.", policyType: "financial_controls", framework: "SOX Section 302/404", jurisdiction: "United States", status: "active", industry: "insurance", effectiveDate: "2024-01-01", rules: [{ id: "SOX-01", title: "Reserve Impact Disclosure", description: "Model failures affecting claims reserves by > $500K must be assessed for financial statement impact disclosure", enforcement: "warn" }] }));

  console.log("  Creating Agent...");
  const agent = await createAgent({ name: "Claims Workflow Recovery Agent", agentType: "single", description: "Insurance claims self-healing agent that monitors fraud triage model performance, detects false-positive spikes, routes misclassified claims to human review, recalibrates model thresholds, assesses claimant impact, and generates required regulatory disclosures — maintaining NAIC, state fair claims handling, GDPR, and SOX compliance throughout.", owner: "Claims Analytics & Technology", department: "Claims Operations", status: "active", environment: "production", riskTier: "HIGH", autonomyMode: "supervised", modelProvider: "anthropic", modelName: "claude-opus-4-5", currentVersion: "1.0.0", complianceTags: ["NAIC", "STATE_FAIR_CLAIMS", "GDPR", "SOX"], toolAccessClass: "standard", maxToolIterations: 10, healthScore: 97, successRate: 0.95, avgLatencyMs: 8600, ontologyTags: ["insurance-claims", "fraud-detection", "model-risk", "regulatory-compliance", "claimant-protection"], runtimeConfig: { agentId: "SH-INS-001", domain: "Insurance", subdomain: "Claims-Workflow", prompt: "You are the Claims Workflow Recovery Agent (SH-INS-001). Detect fraud model false-positive spikes, reroute affected claims, recalibrate thresholds, notify claimants. SFCH-01: expedite delayed claims immediately. NAIC-01: fairness audit before new threshold deploys. Without Atlas: compliance team discovers issue from state regulator inquiry 5-10 days later. By then hundreds of claimants have been waiting weeks." }, preloadedSkills: skills.map((s, i) => ({ skillId: s.id, loadOrder: i })) });
  await patchAgent(agent.id, { policyBindings: policies.map(p => ({ policyId: p.id, policyName: p.name, enforcement: "mandatory" })) });

  const dataset = await createGoldenDataset({ name: "SH-INS-001 Claims Recovery Test Cases", description: "Test cases for claims workflow self-healing", agentId: agent.id, industry: "insurance", status: "active" });
  await createTestCase(dataset.id, { input: "Claims fraud flag rate jumps from 3.2% baseline to 22.7% over 6 hours. 847 claims flagged. Assessment?", expectedOutput: "CUSUM alert triggered at 8% threshold. Current FPR: 22.7% — critical. Estimated misclassified claims: ~620. Fraud Model Isolation Protocol activated. 620 claims rerouted to human review queue. Model root cause investigation initiated.", tags: ["detection"] });
  await createTestCase(dataset.id, { input: "Root cause: model retrained last week on biased sample that over-indexed on Geographic Zone 7 claims. Threshold recalibration results: 0.65 threshold → FPR 4.1%, FNR +1.8pp. Deploy?", expectedOutput: "Holdout validation passed. FPR reduces to 4.1% (within target < 5%). FNR increase 1.8pp (within tolerance < 5pp). NAIC-01: Fairness audit running — must confirm no disparate impact before deployment. Deploy pending fairness clearance.", tags: ["recalibration"] });
  await createTestCase(dataset.id, { input: "Claimant impact: 620 claims delayed average 8.4 days. 47 vulnerable claimants (age > 75 or disability). Total amount delayed: $2.1M. SFCH-01 applies?", expectedOutput: "SFCH-01 enforced: 620 claims expedited — payment SLA restored to original commitment + 8.4 days. 47 vulnerable claimants prioritized in adjuster queue. $2.1M in payout acceleration. Compensation calculation initiated per fair claims handling policy.", tags: ["impact-assessment"] });
  await createTestCase(dataset.id, { input: "620 affected claims — does this trigger state insurance regulator filing?", expectedOutput: "620 claimants exceeds reporting threshold in 12 states. State Insurance Regulator Filing Protocol triggered. 12 state notification packages generated. Atlas drafted explanation: systemic model error, detection date, remediation steps, affected count. Filed within 48 hours per state requirements.", tags: ["regulatory"] });
  await createTestCase(dataset.id, { input: "EU policyholder requests GDPR Article 22 explanation for automated fraud flag on their claim", expectedOutput: "GDPR22-01 enforced: GDPR Article 22 explanation generated — top 3 fraud flag reasons, model confidence score, corrected claim status, and human review outcome. Delivered within 72 hours per GDPR requirement.", tags: ["gdpr"] });

  const evalSuite = await createEvalSuite({ name: "SH-INS-001 Eval Suite", description: "Evaluation suite for Claims Workflow Recovery Agent", agentId: agent.id, datasetId: dataset.id, status: "active", schedule: "weekly" });

  const pipeline = await createHealingPipeline({
    title: "Claims Fraud Triage Model False-Positive Spike — 620 Claims Misclassified",
    agentId: agent.id,
    agentName: "Claims Workflow Recovery Agent",
    industry: "insurance",
    severity: "high",
    stage: "diagnosed",
    issueType: "model_drift",
    issueDescription: "Claims fraud triage model false-positive rate spiked from 3.2% baseline to 22.7% over 6 hours following a model retrain on a biased dataset. 847 claims were incorrectly flagged as fraudulent — 620 are estimated misclassifications. 47 vulnerable claimants (elderly/disability) have payouts delayed. State regulator filing may be required in 12 states.",
    detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    triggerSource: "model_performance_monitor",
    priority: "high",
    diagnosisDetails: {
      rootCause: "Last week's model retrain used a training sample with 340% over-representation of Geographic Zone 7 claims (rural ZIP codes). Model learned spurious geographic features, causing systematic false-positive flagging of Zone 7 legitimate claims.",
      atlasSkillsInvoked: [
        { skillName: "False-Positive Rate Monitoring Skill", finding: "CUSUM alert at T+2h: FPR exceeded 8% threshold. Current FPR: 22.7%. Baseline: 3.2%. 847 claims flagged in 6-hour window. Segment analysis: Geographic Zone 7 FPR: 68%. Systemic issue confirmed.", duration: "Continuous — alert at 2-hour spike onset" },
        { skillName: "Claimant Impact Assessment Skill", finding: "620 estimated misclassified claims. Average delay: 8.4 days. Total delayed payout: $2.1M. Vulnerable claimants: 47 (age >75 or disability type). Regulatory complaint risk: HIGH (12 states with reporting thresholds).", duration: "35 minutes" },
        { skillName: "Model Threshold Recalibration Skill", finding: "Holdout testing: threshold 0.65 reduces FPR to 4.1% (-18.6pp) with FNR increase of only 1.8pp (within 5pp tolerance). Fairness audit required per NAIC-01 before deployment.", duration: "45 minutes" },
      ],
      affectedClaims: 847,
      estimatedMisclassified: 620,
      vulnerableClaimants: 47,
      totalAmountDelayed: 2100000,
      geographicRootCause: "Zone 7 over-representation in training sample",
    },
    hypothesis: {
      primaryHypothesis: "Immediate: isolate model, route 620 claims to human review. Near-term: deploy recalibrated threshold (0.65) after fairness audit. Parallel: notify affected claimants and prepare state regulator filings for 12 states.",
      confidence: 0.96,
      runbookCandidates: [
        { runbookName: "Fraud Model Isolation Protocol", triggerCondition: "FPR > 15% confirmed", expectedOutcome: "Model isolated. Rules-based fallback scoring active. No new false positives.", estimatedDuration: "15 minutes" },
        { runbookName: "Human Review Queue Activation Protocol", triggerCondition: "620 misclassified claims identified", expectedOutcome: "620 claims in adjuster review queues with context. SLA: all reviewed within 48 hours.", estimatedDuration: "30 minutes" },
        { runbookName: "State Insurance Regulator Filing Protocol", triggerCondition: "620 affected claimants triggers reporting thresholds", expectedOutcome: "12 state filings prepared and submitted within 48 hours", estimatedDuration: "2 hours" },
      ],
    },
    businessImpact: {
      claimsDelayed: 620,
      averageDelayDays: 8.4,
      totalAmountDelayed: 2100000,
      vulnerableClaimants: 47,
      regulatoryComplaintRisk: "HIGH — 12 state filing thresholds triggered",
      reputationalRisk: "620 claimants experienced unjust fraud flags — social media complaint risk, NPS impact",
      withAtlas: "Detected in 2 hours. 620 claims in human review within 3 hours. Regulator filings prepared in 5 hours. Claimant notifications within 6 hours. Model recalibrated in 24 hours.",
      withoutAtlas: "Detection via state regulator inquiry or customer complaints: 5-10 days. By then: 1,000+ claims affected. Regulatory enforcement action possible. Class action risk.",
      financialExposure: "$2.1M payout delay + regulatory fine risk (varies by state: $5K-$250K per violation) + litigation risk",
    },
    remediation: {
      status: "in_progress",
      runbooksTriggered: [
        { runbookName: "False-Positive Spike Response Protocol", status: "completed", result: "FPR spike confirmed. Model monitoring escalation active. Recalibration investigation triggered.", triggeredAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Fraud Model Isolation Protocol", status: "completed", result: "Triage model isolated. Rules-based fallback scoring activated. New false-positive rate: 2.8% (within normal range).", triggeredAt: new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Human Review Queue Activation Protocol", status: "completed", result: "620 claims in adjuster queues. 47 vulnerable claimants in priority tier. 8 adjusters assigned. SLA: complete within 48 hours.", triggeredAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
        { runbookName: "Claimant Notification and Remediation Protocol", status: "in_progress", result: "620 claimant notifications in preparation. Pending legal review of notification language before dispatch.", triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { runbookName: "State Insurance Regulator Filing Protocol", status: "in_progress", result: "12 state filing packages prepared by Atlas. Pending Compliance Officer sign-off.", triggeredAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
      ],
      policiesEnforced: [
        { policyName: "NAIC Model Audit Regulation Policy", rule: "NAIC-01: Algorithm Fairness Testing", decision: "New threshold (0.65) blocked from deployment until fairness audit confirms no disparate impact across protected classes", outcome: "Fairness audit in progress — deployment pending" },
        { policyName: "State Fair Claims Handling Policy", rule: "SFCH-01: Prompt Payment Restoration", decision: "620 claims expedited to original SLA + delay period. 47 vulnerable claimants in priority review.", outcome: "Remediation in progress" },
        { policyName: "GDPR Article 22 Policy", rule: "GDPR22-01: Automated Decision Explanation", decision: "Explainability records generated for all 620 affected EU claimants", outcome: "Ready for delivery on request" },
        { policyName: "SOX Internal Controls Policy", rule: "SOX-01: Reserve Impact Disclosure", decision: "$2.1M delayed payouts assessed — below $500K SOX materiality per event but cumulative disclosure assessment underway", outcome: "Finance review scheduled" },
      ],
    },
    industryGuardrails: [
      { framework: "NAIC Model Bulletin on AI", constraint: "Fairness audit required before recalibrated model deployment", status: "enforced" },
      { framework: "NAIC Unfair Claims Settlement Model Act", constraint: "Delayed claims must be expedited — prompt payment restoration", status: "enforced" },
      { framework: "GDPR Article 22", constraint: "Automated decision explanation available for all EU claimants", status: "enforced" },
      { framework: "SOX Section 302/404", constraint: "Reserve impact assessment for financial statement accuracy", status: "enforced" },
    ],
    resolution: {
      atlasAutonomousActions: ["FPR spike detected within 2 hours of model change", "620 misclassified claims identified and prioritized", "Model isolated — false positives stopped", "Rules-based fallback activated — no service gap", "State regulator filing packages prepared for 12 states", "Fairness audit initiated for recalibrated threshold"],
      requiresHumanAction: ["Compliance Officer sign-off on 12 state regulator filings", "Legal review of claimant notification language", "Fairness audit review and sign-off for threshold deployment"],
      withoutAtlas: "Detection via regulator or claimant complaints: 5-10 days. 1,000+ claims affected. State enforcement actions. Class action litigation risk. Reputational damage from prolonged unfair claims handling.",
    },
  });

  return { agent, skills, runbooks, policies, dataset, evalSuite, pipeline };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     ATLAS Self-Healing Demo Creation Script                 ║");
  console.log("║     6 Industry-Domain Agents + Full Platform Intelligence   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Target: ${BASE_URL.padEnd(52)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const manifest = {};

  // Run all 6 phases
  try {
    const healthcareResult = await createHealthcareAgent();
    manifest["SH-HEALTH-001"] = {
      agentId: healthcareResult.agent.id,
      agentName: healthcareResult.agent.name,
      skillIds: healthcareResult.skills.map(s => s.id),
      runbookIds: healthcareResult.runbooks.map(r => r.id),
      policyIds: healthcareResult.policies.map(p => p.id),
      datasetId: healthcareResult.dataset.id,
      evalSuiteId: healthcareResult.evalSuite.id,
      healingPipelineId: healthcareResult.pipeline.id,
    };
    console.log(`  ✓ SH-HEALTH-001 created: Agent ${healthcareResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-HEALTH-001 failed:", e.message); }

  try {
    const financialResult = await createFinancialAgent();
    manifest["SH-FIN-001"] = {
      agentId: financialResult.agent.id,
      agentName: financialResult.agent.name,
      skillIds: financialResult.skills.map(s => s.id),
      runbookIds: financialResult.runbooks.map(r => r.id),
      policyIds: financialResult.policies.map(p => p.id),
      datasetId: financialResult.dataset.id,
      evalSuiteId: financialResult.evalSuite.id,
      healingPipelineId: financialResult.pipeline.id,
    };
    console.log(`  ✓ SH-FIN-001 created: Agent ${financialResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-FIN-001 failed:", e.message); }

  try {
    const mfgResult = await createManufacturingAgent();
    manifest["SH-MFG-001"] = {
      agentId: mfgResult.agent.id,
      agentName: mfgResult.agent.name,
      skillIds: mfgResult.skills.map(s => s.id),
      runbookIds: mfgResult.runbooks.map(r => r.id),
      policyIds: mfgResult.policies.map(p => p.id),
      datasetId: mfgResult.dataset.id,
      evalSuiteId: mfgResult.evalSuite.id,
      healingPipelineId: mfgResult.pipeline.id,
    };
    console.log(`  ✓ SH-MFG-001 created: Agent ${mfgResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-MFG-001 failed:", e.message); }

  try {
    const retailResult = await createRetailAgent();
    manifest["SH-RETAIL-001"] = {
      agentId: retailResult.agent.id,
      agentName: retailResult.agent.name,
      skillIds: retailResult.skills.map(s => s.id),
      runbookIds: retailResult.runbooks.map(r => r.id),
      policyIds: retailResult.policies.map(p => p.id),
      datasetId: retailResult.dataset.id,
      evalSuiteId: retailResult.evalSuite.id,
      healingPipelineId: retailResult.pipeline.id,
    };
    console.log(`  ✓ SH-RETAIL-001 created: Agent ${retailResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-RETAIL-001 failed:", e.message); }

  try {
    const energyResult = await createEnergyAgent();
    manifest["SH-ENERGY-001"] = {
      agentId: energyResult.agent.id,
      agentName: energyResult.agent.name,
      skillIds: energyResult.skills.map(s => s.id),
      runbookIds: energyResult.runbooks.map(r => r.id),
      policyIds: energyResult.policies.map(p => p.id),
      datasetId: energyResult.dataset.id,
      evalSuiteId: energyResult.evalSuite.id,
      healingPipelineId: energyResult.pipeline.id,
    };
    console.log(`  ✓ SH-ENERGY-001 created: Agent ${energyResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-ENERGY-001 failed:", e.message); }

  try {
    const insResult = await createInsuranceAgent();
    manifest["SH-INS-001"] = {
      agentId: insResult.agent.id,
      agentName: insResult.agent.name,
      skillIds: insResult.skills.map(s => s.id),
      runbookIds: insResult.runbooks.map(r => r.id),
      policyIds: insResult.policies.map(p => p.id),
      datasetId: insResult.dataset.id,
      evalSuiteId: insResult.evalSuite.id,
      healingPipelineId: insResult.pipeline.id,
    };
    console.log(`  ✓ SH-INS-001 created: Agent ${insResult.agent.id}`);
  } catch (e) { console.error("  ✗ SH-INS-001 failed:", e.message); }

  // Save manifest
  const manifestPath = "scripts/self-healing-dev-ids.json";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  CREATION COMPLETE                                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nManifest saved to: ${manifestPath}`);
  console.log("\nAgents created:");
  for (const [code, data] of Object.entries(manifest)) {
    console.log(`  ${code}: ${data.agentId} — ${data.agentName}`);
    console.log(`    Skills: ${data.skillIds.length} | Runbooks: ${data.runbookIds.length} | Policies: ${data.policyIds.length}`);
    console.log(`    Healing Pipeline: ${data.healingPipelineId}`);
  }
  console.log("\nNext step: Run the demo UI creation (Task #140)");
  console.log("Prod migration: node scripts/migrate-self-healing-to-prod.mjs <PROD_URL>");
}

main().catch(e => { console.error("\nFatal error:", e); process.exit(1); });
