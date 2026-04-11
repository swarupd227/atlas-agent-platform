/**
 * Patch script: Adds blueprintJson to the 5 self-healing agents that were
 * created without one, and normalises healing pipeline diagnosisDetails
 * to use skillsInvoked (with description field) instead of atlasSkillsInvoked.
 *
 * Usage: node scripts/patch-self-healing-agents.mjs [BASE_URL]
 *   BASE_URL defaults to http://localhost:5000
 */

const BASE_URL = process.argv[2] ?? "http://localhost:5000";

const manifest = (await import("./self-healing-dev-ids.json", { assert: { type: "json" } })).default;

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.substring(0, 300)}`);
  }
  return res.json();
}

// ─── Blueprint factory ─────────────────────────────────────────────────────────

function makeBlueprintJson({ triggerLabel, triggerMetric, triggerThreshold, nodes }) {
  const nodeIds = ["trigger", "detect", "diagnose", "assess", "remediate", "reconcile", "validate", "resolved"];
  return {
    edges: [
      { from: "trigger",   to: "detect"    },
      { from: "detect",    to: "diagnose"  },
      { from: "diagnose",  to: "assess"    },
      { from: "assess",    to: "remediate" },
      { from: "remediate", to: "reconcile" },
      { from: "reconcile", to: "validate"  },
      { from: "validate",  to: "resolved"  },
    ],
    nodes: [
      {
        id: "trigger", type: "trigger", label: triggerLabel,
        config: { triggerType: "metric_threshold", metric: triggerMetric, threshold: triggerThreshold },
      },
      { id: "detect",    type: "skill",    label: nodes.detect.label,    config: { skillId:   nodes.detect.id    } },
      { id: "diagnose",  type: "skill",    label: nodes.diagnose.label,  config: { skillId:   nodes.diagnose.id  } },
      { id: "assess",    type: "skill",    label: nodes.assess.label,    config: { skillId:   nodes.assess.id    } },
      { id: "remediate", type: "runbook",  label: nodes.remediate.label, config: { runbookId: nodes.remediate.id } },
      { id: "reconcile", type: "skill",    label: nodes.reconcile.label, config: { skillId:   nodes.reconcile.id } },
      { id: "validate",  type: "skill",    label: nodes.validate.label,  config: { skillId:   nodes.validate.id  } },
      { id: "resolved",  type: "terminal", label: "Healing Complete",    config: {}                               },
    ],
  };
}

// ─── Blueprints per scenario ──────────────────────────────────────────────────

const blueprints = {
  "SH-FIN-001": makeBlueprintJson({
    triggerLabel:    "Precision Drift Alert",
    triggerMetric:   "fraud_model_precision",
    triggerThreshold: 0.88,
    nodes: {
      detect:    { label: "Model Precision Monitoring",   id: manifest["SH-FIN-001"].skillIds[0] },
      diagnose:  { label: "Feature Drift Analysis",       id: manifest["SH-FIN-001"].skillIds[3] },
      assess:    { label: "Challenger Model Evaluation",  id: manifest["SH-FIN-001"].skillIds[1] },
      remediate: { label: "Model Precision Regression Alert", id: manifest["SH-FIN-001"].runbookIds[0] },
      reconcile: { label: "Shadow-Mode Traffic Splitting",id: manifest["SH-FIN-001"].skillIds[2] },
      validate:  { label: "Zero-Downtime Model Swap",     id: manifest["SH-FIN-001"].skillIds[4] },
    },
  }),
  "SH-MFG-001": makeBlueprintJson({
    triggerLabel:    "Vibration Threshold Alert",
    triggerMetric:   "bearing_vibration_rms_mm_s",
    triggerThreshold: 10.0,
    nodes: {
      detect:    { label: "IoT Vibration Signal Analysis", id: manifest["SH-MFG-001"].skillIds[0] },
      diagnose:  { label: "Bearing Wear Classification",  id: manifest["SH-MFG-001"].skillIds[1] },
      assess:    { label: "MTBF Prediction",              id: manifest["SH-MFG-001"].skillIds[4] },
      remediate: { label: "Vibration Threshold Breach Response", id: manifest["SH-MFG-001"].runbookIds[0] },
      reconcile: { label: "Maintenance Window Scheduling",id: manifest["SH-MFG-001"].skillIds[2] },
      validate:  { label: "Production Order Rerouting",   id: manifest["SH-MFG-001"].skillIds[3] },
    },
  }),
  "SH-RETAIL-001": makeBlueprintJson({
    triggerLabel:    "WMS API Health Alert",
    triggerMetric:   "wms_api_error_rate",
    triggerThreshold: 0.05,
    nodes: {
      detect:    { label: "WMS Health Monitoring",        id: manifest["SH-RETAIL-001"].skillIds[0] },
      diagnose:  { label: "Order Queue Preservation",     id: manifest["SH-RETAIL-001"].skillIds[1] },
      assess:    { label: "SLA Breach Escalation",        id: manifest["SH-RETAIL-001"].skillIds[4] },
      remediate: { label: "WMS Outage Response Protocol", id: manifest["SH-RETAIL-001"].runbookIds[0] },
      reconcile: { label: "Overflow Order Rerouting",     id: manifest["SH-RETAIL-001"].skillIds[2] },
      validate:  { label: "Customer Notification Dispatch", id: manifest["SH-RETAIL-001"].skillIds[3] },
    },
  }),
  "SH-ENERGY-001": makeBlueprintJson({
    triggerLabel:    "Frequency Deviation Alert",
    triggerMetric:   "grid_frequency_deviation_hz",
    triggerThreshold: 0.3,
    nodes: {
      detect:    { label: "Real-Time Grid Frequency Monitor", id: manifest["SH-ENERGY-001"].skillIds[0] },
      diagnose:  { label: "Generation Dispatch Optimizer",   id: manifest["SH-ENERGY-001"].skillIds[1] },
      assess:    { label: "Grid Restoration Sequence Planner", id: manifest["SH-ENERGY-001"].skillIds[4] },
      remediate: { label: "Generation Shortfall Emergency Response", id: manifest["SH-ENERGY-001"].runbookIds[0] },
      reconcile: { label: "Demand Response Coordinator",    id: manifest["SH-ENERGY-001"].skillIds[2] },
      validate:  { label: "NERC CIP Compliance Validator",  id: manifest["SH-ENERGY-001"].skillIds[3] },
    },
  }),
  "SH-INS-001": makeBlueprintJson({
    triggerLabel:    "FPR Threshold Breach",
    triggerMetric:   "claims_model_false_positive_rate",
    triggerThreshold: 0.08,
    nodes: {
      detect:    { label: "False-Positive Rate Monitoring",  id: manifest["SH-INS-001"].skillIds[0] },
      diagnose:  { label: "Claimant Impact Assessment",      id: manifest["SH-INS-001"].skillIds[3] },
      assess:    { label: "Model Threshold Recalibration",   id: manifest["SH-INS-001"].skillIds[2] },
      remediate: { label: "False-Positive Spike Response Protocol", id: manifest["SH-INS-001"].runbookIds[0] },
      reconcile: { label: "Claims Re-Routing to Human Review", id: manifest["SH-INS-001"].skillIds[1] },
      validate:  { label: "Regulatory Disclosure",           id: manifest["SH-INS-001"].skillIds[4] },
    },
  }),
};

// ─── Normalised skillsInvoked payloads for each healing pipeline ───────────────

const pipelineSkillsPatches = {
  "SH-HEALTH-001": {
    pipelineId: manifest["SH-HEALTH-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "Batch Anomaly Triage Skill", description: "Monitors FHIR batch ingestion error rates and classifies anomaly type using CUSUM change-point detection.", finding: "Error rate spike to 18.4% detected within 4 minutes. Pattern: schema_change (confidence 0.94)", duration: "4 minutes" },
      { skillName: "FHIR Schema Validation Skill", description: "Validates incoming FHIR R4 resources against HL7 schema and active value set versions.", finding: "1,847 MedicationRequest resources failing. Breaking change: RxNorm codes not found in active value set", duration: "8 minutes" },
      { skillName: "Drug-Interaction Cross-Check Skill", description: "Cross-checks patient medication lists against contraindication databases and interaction severity tiers.", finding: "312 patients with medication gaps. 3 contraindicated pairs — IMMEDIATE clinical alerts. 47 serious interactions for pharmacist review.", duration: "12 minutes" },
    ],
  },
  "SH-FIN-001": {
    pipelineId: manifest["SH-FIN-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "Model Precision Monitoring Skill", description: "Tracks real-time fraud model precision using rolling 4-hour windows with CUSUM alerting at configurable thresholds.", finding: "Precision collapsed from 94.2% to 71.8% over 6 hours. 340 false positives. BNPL merchant category over-represented at 340%.", duration: "Continuous — alert at 6h onset" },
      { skillName: "Feature Drift Analysis Skill", description: "Identifies which feature distributions have shifted to explain model performance degradation.", finding: "BNPL merchant category 340% over-represented in scoring cohort vs training distribution. Geographic Zone 7 FPR: 38%.", duration: "28 minutes" },
      { skillName: "Challenger Model Evaluation Skill", description: "Evaluates alternative model candidates against 30-day hold-out data to identify a suitable replacement.", finding: "Challenger v2.3.1 trained without Zone 7 bias. Precision: 93.6%. FPR: 2.8%. Approved for shadow deployment.", duration: "45 minutes" },
    ],
  },
  "SH-MFG-001": {
    pipelineId: manifest["SH-MFG-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "IoT Vibration Signal Analysis Skill", description: "Analyses real-time IoT sensor vibration signals using FFT spectrum analysis to detect mechanical anomalies.", finding: "CNC Mill #7 bearing vibration at 14.7 mm/s RMS — 340% above baseline (4.3 mm/s). ISO 10816-3 Zone C threshold breached.", duration: "Real-time — alert in 6 minutes" },
      { skillName: "Bearing Wear Classification Skill", description: "Classifies bearing degradation stage (early, advanced, critical) based on vibration spectrum and historical wear curves.", finding: "Advanced wear confirmed. Frequency signature matches inner-race defect. Stage: 3/4 (critical approaching).", duration: "12 minutes" },
      { skillName: "MTBF Prediction Skill", description: "Predicts mean-time-before-failure using degradation trajectory models and historical bearing failure data.", finding: "MTBF: 4.2 hours at current degradation rate. Catastrophic failure probability: 89% within 6 hours without intervention.", duration: "18 minutes" },
    ],
  },
  "SH-RETAIL-001": {
    pipelineId: manifest["SH-RETAIL-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "WMS Health Monitoring Skill", description: "Monitors WMS API health, response times, and queue depths via real-time API health checks and queue telemetry.", finding: "Error rate 87%. Queue depth 1,847. 312 same-day SLA at risk. $340K penalty exposure. Detected in 4 minutes.", duration: "4 minutes" },
      { skillName: "Order Queue Preservation Skill", description: "Captures and immutably persists all in-flight orders to durable queue storage during WMS degradation events.", finding: "1,847 orders captured to durable queue. 0 orders lost.", duration: "6 minutes" },
      { skillName: "SLA Breach Escalation Skill", description: "Calculates SLA breach exposure and triggers appropriate escalation workflows based on configurable thresholds.", finding: "Estimated exposure: $340K. Exceeds $100K escalation threshold. Operations VP briefed. Carrier documentation initiated.", duration: "10 minutes" },
    ],
  },
  "SH-ENERGY-001": {
    pipelineId: manifest["SH-ENERGY-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "Real-Time Grid Frequency Monitor Skill", description: "Monitors grid frequency across balancing areas using PMU data streams, alerting on NERC-defined deviation thresholds.", finding: "Frequency: 59.62 Hz (deviation: −0.38 Hz). NERC CIP-014 limit: ±0.5 Hz. 847 MW shortfall in Balancing Area West.", duration: "Real-time — alert in 3 minutes" },
      { skillName: "Generation Dispatch Optimizer Skill", description: "Calculates optimal re-dispatch of available generation assets to restore frequency within regulatory limits.", finding: "Optimal dispatch: 4 gas peakers — 892 MW combined in 8 minutes. Economic re-dispatch within FERC Order 881 limits.", duration: "8 minutes" },
      { skillName: "Grid Restoration Sequence Planner Skill", description: "Plans step-by-step grid restoration sequence to prevent cascading failure across interconnected balancing areas.", finding: "3-phase restoration: peaker dispatch → demand response → offshore reconnect. Cascading failure probability reduced from 34% to 3%.", duration: "22 minutes" },
    ],
  },
  "SH-INS-001": {
    pipelineId: manifest["SH-INS-001"].healingPipelineId,
    skillsInvoked: [
      { skillName: "False-Positive Rate Monitoring Skill", description: "Monitors fraud triage model FPR using CUSUM change-point detection with geographic and demographic stratification.", finding: "CUSUM alert at T+2h: FPR 22.7% (baseline 3.2%). 847 claims in 6-hour window. Zone 7 FPR: 68%. Systemic confirmed.", duration: "Continuous — alert at 2h onset" },
      { skillName: "Claimant Impact Assessment Skill", description: "Identifies and prioritises affected claimants, with special flagging of vulnerable populations and state filing thresholds.", finding: "620 misclassified. Avg delay: 8.4 days. $2.1M delayed. 47 vulnerable claimants. 12 state filing thresholds triggered.", duration: "35 minutes" },
      { skillName: "Model Threshold Recalibration Skill", description: "Evaluates alternative classification thresholds against fairness and performance criteria prior to recommending deployment.", finding: "Threshold 0.65: FPR 4.1%, FNR +1.8pp. Fairness audit required per NAIC-01 before deployment.", duration: "45 minutes" },
    ],
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  ATLAS Self-Healing Patch Script                            ║");
console.log("║  Adds blueprintJson to 5 agents + normalises pipeline fields║");
console.log(`╠══════════════════════════════════════════════════════════════╣`);
console.log(`║  Target: ${BASE_URL.padEnd(51)}║`);
console.log("╚══════════════════════════════════════════════════════════════╝\n");

let patched = 0;
let errors = 0;

for (const [code, blueprint] of Object.entries(blueprints)) {
  const agentId = manifest[code].agentId;
  process.stdout.write(`  [${code}] Patching blueprintJson on agent ${agentId.substring(0, 8)}... `);
  try {
    await api("PATCH", `/api/agents/${agentId}`, { blueprintJson: blueprint });
    console.log("✓");
    patched++;
  } catch (err) {
    console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    errors++;
  }
}

console.log("");

for (const [code, patch] of Object.entries(pipelineSkillsPatches)) {
  const pid = patch.pipelineId;
  process.stdout.write(`  [${code}] Normalising pipeline ${pid.substring(0, 8)} skillsInvoked... `);
  try {
    const existing = await api("GET", `/api/healing-pipelines/${pid}`);
    const updatedDiagnosis = {
      ...(existing.diagnosisDetails ?? {}),
      skillsInvoked: patch.skillsInvoked,
    };
    // Remove the old atlasSkillsInvoked key if present
    delete updatedDiagnosis.atlasSkillsInvoked;
    await api("PATCH", `/api/healing-pipelines/${pid}`, { diagnosisDetails: updatedDiagnosis });
    console.log("✓");
    patched++;
  } catch (err) {
    console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    errors++;
  }
}

console.log(`\nPatch complete: ${patched} succeeded, ${errors} failed.`);
