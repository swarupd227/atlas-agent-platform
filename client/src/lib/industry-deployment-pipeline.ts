export type IndustryId = "healthcare" | "financial_services" | "manufacturing" | "insurance" | "retail" | "technology_saas" | "legal_services";

export const industryLabels: Record<IndustryId, string> = {
  healthcare: "Healthcare",
  financial_services: "Financial Services",
  manufacturing: "Manufacturing",
  insurance: "Insurance",
  retail: "Retail",
  technology_saas: "Technology / SaaS",
  legal_services: "Legal Services",
};

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  order: number;
  requiredArtifacts: string[];
  attestationType: "auto" | "manual" | "review";
}

export interface IndustryRollbackTrigger {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: "below" | "above" | "any_event";
  threshold?: number;
  unit?: string;
  severity: "critical" | "high" | "medium";
  autoRollback: boolean;
}

export interface EvidenceItem {
  id: string;
  name: string;
  description: string;
  source: string;
  required: boolean;
  regulation?: string;
}

export const mandatoryPipelineStages: Record<IndustryId, PipelineStage[]> = {
  healthcare: [
    {
      id: "clinical_safety_review",
      name: "Clinical Safety Review",
      description: "Independent clinical safety assessment of agent behavior in patient-facing scenarios",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["clinical_safety_report", "patient_scenario_results"],
      attestationType: "review",
    },
    {
      id: "hipaa_compliance_attestation",
      name: "HIPAA Compliance Attestation",
      description: "Formal attestation that agent complies with HIPAA Privacy and Security Rules",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["hipaa_audit_log", "phi_handling_report"],
      attestationType: "manual",
    },
    {
      id: "shadow_replay_patient_safety",
      name: "Shadow Replay (Patient Safety)",
      description: "Production trace replay scored with patient safety scorer to validate zero harm",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "patient_safety_score"],
      attestationType: "auto",
    },
    {
      id: "golden_dataset_validation",
      name: "Golden Dataset Validation",
      description: "Evaluation against industry golden dataset with clinical accuracy thresholds",
      mandatory: false,
      order: 4,
      requiredArtifacts: ["eval_results"],
      attestationType: "auto",
    },
  ],
  financial_services: [
    {
      id: "regulatory_compliance_attestation",
      name: "Regulatory Compliance Attestation",
      description: "Attestation that agent complies with BSA/AML, FCRA, and applicable financial regulations",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["compliance_report", "regulation_mapping"],
      attestationType: "manual",
    },
    {
      id: "suitability_testing",
      name: "Suitability Testing",
      description: "Validation that agent recommendations meet suitability requirements for customer profiles",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["suitability_test_results", "customer_profile_coverage"],
      attestationType: "review",
    },
    {
      id: "shadow_replay_compliance",
      name: "Shadow Replay (Compliance Scorer)",
      description: "Production trace replay scored with regulatory compliance scorer",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "compliance_score"],
      attestationType: "auto",
    },
    {
      id: "aml_screening_check",
      name: "AML Screening Validation",
      description: "Verify agent correctly applies anti-money laundering screening rules",
      mandatory: false,
      order: 4,
      requiredArtifacts: ["aml_screening_results"],
      attestationType: "auto",
    },
    {
      id: "rating_model_validation",
      name: "Rating Model Validation",
      description: "Independent validation of credit rating models against SEC Rule 17g-7 requirements and methodology transparency standards",
      mandatory: true,
      order: 5,
      requiredArtifacts: ["model_validation_report", "methodology_documentation", "backtesting_results"],
      attestationType: "review",
    },
    {
      id: "conflict_of_interest_check",
      name: "Conflict of Interest Assessment",
      description: "Systematic review for issuer-paid model conflicts, analytical independence, and firewall compliance per IOSCO Code",
      mandatory: true,
      order: 6,
      requiredArtifacts: ["conflict_assessment_report", "firewall_compliance_log"],
      attestationType: "manual",
    },
    {
      id: "rating_committee_governance",
      name: "Rating Committee Governance Gate",
      description: "Verify agent outputs are subject to rating committee oversight as required by EU CRA Regulation Art. 8",
      mandatory: true,
      order: 7,
      requiredArtifacts: ["committee_review_record", "voting_record"],
      attestationType: "manual",
    },
    {
      id: "methodology_transparency_review",
      name: "Methodology Transparency Review",
      description: "Ensure rating methodology documentation meets SEC 17g-7 and EU CRA transparency requirements for public disclosure",
      mandatory: false,
      order: 8,
      requiredArtifacts: ["methodology_disclosure_doc", "public_transparency_report"],
      attestationType: "review",
    },
  ],
  manufacturing: [
    {
      id: "safety_review",
      name: "Safety Review",
      description: "Occupational safety assessment ensuring agent operations comply with OSHA standards",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["safety_assessment_report", "hazard_analysis"],
      attestationType: "review",
    },
    {
      id: "quality_validation",
      name: "Quality Validation",
      description: "ISO 9001 quality management validation of agent measurement and control accuracy",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["quality_test_results", "measurement_accuracy_report"],
      attestationType: "manual",
    },
    {
      id: "shadow_replay_measurement",
      name: "Shadow Replay (Measurement Accuracy)",
      description: "Production trace replay scored with measurement accuracy scorer",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "measurement_accuracy_score"],
      attestationType: "auto",
    },
    {
      id: "equipment_integration_test",
      name: "Equipment Integration Test",
      description: "Validate agent integration with manufacturing equipment systems",
      mandatory: false,
      order: 4,
      requiredArtifacts: ["integration_test_results"],
      attestationType: "auto",
    },
  ],
  insurance: [
    {
      id: "actuarial_review",
      name: "Actuarial Review",
      description: "Review of agent risk assessment models by actuarial team",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["actuarial_review_report"],
      attestationType: "review",
    },
    {
      id: "claims_accuracy_validation",
      name: "Claims Accuracy Validation",
      description: "Validation of claims processing accuracy and fairness",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["claims_accuracy_report", "fairness_assessment"],
      attestationType: "manual",
    },
    {
      id: "shadow_replay_claims",
      name: "Shadow Replay (Claims Processing)",
      description: "Production trace replay with claims processing scorer",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "claims_accuracy_score"],
      attestationType: "auto",
    },
  ],
  retail: [
    {
      id: "consumer_protection_review",
      name: "Consumer Protection Review",
      description: "Review of agent compliance with consumer protection regulations",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["consumer_protection_report"],
      attestationType: "review",
    },
    {
      id: "pricing_fairness_validation",
      name: "Pricing Fairness Validation",
      description: "Validation that agent pricing recommendations are fair and non-discriminatory",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["pricing_fairness_report"],
      attestationType: "manual",
    },
    {
      id: "shadow_replay_customer",
      name: "Shadow Replay (Customer Experience)",
      description: "Production trace replay with customer experience scorer",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "customer_experience_score"],
      attestationType: "auto",
    },
  ],
  technology_saas: [
    {
      id: "soc2_control_validation",
      name: "SOC 2 Control Validation",
      description: "Verify agent behavior complies with SOC 2 Type II trust service criteria",
      mandatory: true,
      order: 1,
      requiredArtifacts: ["soc2_control_report", "access_log_audit"],
      attestationType: "auto",
    },
    {
      id: "data_privacy_review",
      name: "Data Privacy Review (GDPR/CCPA)",
      description: "Validate data handling, consent management, and PII protection",
      mandatory: true,
      order: 2,
      requiredArtifacts: ["privacy_impact_assessment", "data_flow_map"],
      attestationType: "manual",
    },
    {
      id: "shadow_replay_api",
      name: "Shadow Replay (API & Integration)",
      description: "Production trace replay with API reliability and latency scorers",
      mandatory: true,
      order: 3,
      requiredArtifacts: ["shadow_replay_results", "api_performance_report"],
      attestationType: "auto",
    },
    {
      id: "chaos_engineering_gate",
      name: "Chaos Engineering Gate",
      description: "Validate resilience under failure injection scenarios",
      mandatory: false,
      order: 4,
      requiredArtifacts: ["chaos_test_results", "blast_radius_report"],
      attestationType: "auto",
    },
  ],
};

export const industryRollbackTriggers: Record<IndustryId, IndustryRollbackTrigger[]> = {
  healthcare: [
    {
      id: "patient_safety_event",
      name: "Patient Safety Event",
      description: "Any event that could impact patient safety triggers immediate rollback",
      metric: "patient_safety_events",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "hipaa_violation",
      name: "HIPAA Violation Detected",
      description: "Any potential HIPAA Privacy or Security Rule violation",
      metric: "hipaa_violations",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "clinical_accuracy_drop",
      name: "Clinical Accuracy Drop",
      description: "Clinical accuracy falls below safety threshold",
      metric: "clinical_accuracy",
      condition: "below",
      threshold: 95,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
  ],
  financial_services: [
    {
      id: "regulatory_compliance_breach",
      name: "Regulatory Compliance Breach",
      description: "Compliance rate falls below regulatory threshold",
      metric: "regulatory_compliance_rate",
      condition: "below",
      threshold: 99,
      unit: "%",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "aml_screening_failure",
      name: "AML Screening Failure",
      description: "Anti-money laundering screening false negative detected",
      metric: "aml_screening_failures",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "suitability_violation",
      name: "Suitability Violation",
      description: "Agent recommendation violates suitability requirements",
      metric: "suitability_violations",
      condition: "above",
      threshold: 0,
      severity: "high",
      autoRollback: true,
    },
    {
      id: "rating_accuracy_drift",
      name: "Rating Accuracy Drift",
      description: "Credit rating prediction accuracy deviates beyond acceptable threshold vs historical default rates",
      metric: "rating_accuracy",
      condition: "below",
      threshold: 92,
      unit: "%",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "conflict_of_interest_detected",
      name: "Conflict of Interest Detected",
      description: "Issuer-paid model conflict or analytical independence violation detected per IOSCO Code of Conduct",
      metric: "conflict_events",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "methodology_deviation",
      name: "Methodology Deviation Alert",
      description: "Agent deviates from published credit rating methodology beyond permitted tolerance",
      metric: "methodology_deviation_score",
      condition: "above",
      threshold: 5,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
  ],
  manufacturing: [
    {
      id: "safety_incident",
      name: "Safety Incident",
      description: "Any workplace safety incident or OSHA violation",
      metric: "safety_incidents",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "quality_metric_breach",
      name: "Quality Metric Breach",
      description: "ISO 9001 quality metrics fall below acceptable threshold",
      metric: "quality_score",
      condition: "below",
      threshold: 98,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
    {
      id: "measurement_drift",
      name: "Measurement Accuracy Drift",
      description: "Measurement accuracy deviates beyond tolerance",
      metric: "measurement_accuracy",
      condition: "below",
      threshold: 99,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
  ],
  insurance: [
    {
      id: "claims_accuracy_drop",
      name: "Claims Accuracy Drop",
      description: "Claims processing accuracy falls below threshold",
      metric: "claims_accuracy",
      condition: "below",
      threshold: 97,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
    {
      id: "fairness_violation",
      name: "Fairness Violation",
      description: "Discriminatory pattern detected in claims or underwriting",
      metric: "fairness_violations",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
  ],
  retail: [
    {
      id: "pricing_anomaly",
      name: "Pricing Anomaly",
      description: "Significant pricing deviation from expected ranges",
      metric: "pricing_anomalies",
      condition: "above",
      threshold: 5,
      severity: "high",
      autoRollback: true,
    },
    {
      id: "consumer_complaint_spike",
      name: "Consumer Complaint Spike",
      description: "Sudden increase in consumer complaints related to agent",
      metric: "consumer_complaints",
      condition: "above",
      threshold: 10,
      unit: "/hour",
      severity: "medium",
      autoRollback: false,
    },
  ],
  technology_saas: [
    {
      id: "sla_breach",
      name: "SLA Breach",
      description: "Service level objective breached for uptime or latency",
      metric: "slo_compliance",
      condition: "below",
      threshold: 99.9,
      unit: "%",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "data_leak_detection",
      name: "Data Leak Detection",
      description: "PII or sensitive data exposed in logs, responses, or external calls",
      metric: "data_leak_events",
      condition: "any_event",
      severity: "critical",
      autoRollback: true,
    },
    {
      id: "error_rate_spike",
      name: "Error Rate Spike",
      description: "API error rate exceeds acceptable threshold",
      metric: "error_rate",
      condition: "above",
      threshold: 5,
      unit: "%",
      severity: "high",
      autoRollback: true,
    },
  ],
};

export const evidencePackageItems: Record<IndustryId, EvidenceItem[]> = {
  healthcare: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with patient safety scorer", source: "shadow_replay_studio", required: true, regulation: "EU AI Act Art. 9" },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against clinical golden dataset", source: "eval_studio", required: true, regulation: "EU AI Act Art. 15" },
    { id: "hipaa_attestation", name: "HIPAA Compliance Attestation", description: "Signed HIPAA compliance attestation", source: "governance", required: true, regulation: "HIPAA §164.312" },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true, regulation: "EU AI Act Art. 14" },
    { id: "clinical_safety_report", name: "Clinical Safety Report", description: "Independent clinical safety assessment", source: "manual_upload", required: true },
  ],
  financial_services: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with compliance scorer", source: "shadow_replay_studio", required: true, regulation: "EU AI Act Art. 9" },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against financial golden dataset", source: "eval_studio", required: true, regulation: "EU AI Act Art. 15" },
    { id: "regulatory_attestation", name: "Regulatory Compliance Attestation", description: "BSA/AML and FCRA compliance attestation", source: "governance", required: true, regulation: "BSA/AML" },
    { id: "suitability_report", name: "Suitability Test Report", description: "Suitability testing results for customer profiles", source: "eval_studio", required: true, regulation: "FINRA 2111" },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true, regulation: "EU AI Act Art. 14" },
    { id: "rating_model_validation", name: "Rating Model Validation Report", description: "Independent validation of credit rating models per SEC Rule 17g-7", source: "eval_studio", required: true, regulation: "SEC Rule 17g-7" },
    { id: "conflict_assessment", name: "Conflict of Interest Assessment", description: "IOSCO-compliant conflict of interest review and firewall assessment", source: "governance", required: true, regulation: "IOSCO Code of Conduct" },
    { id: "methodology_transparency", name: "Methodology Transparency Documentation", description: "Public disclosure documentation for rating methodology per EU CRA Regulation", source: "manual_upload", required: true, regulation: "EU CRA Regulation Art. 8" },
  ],
  manufacturing: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with measurement accuracy scorer", source: "shadow_replay_studio", required: true, regulation: "EU AI Act Art. 9" },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against manufacturing golden dataset", source: "eval_studio", required: true, regulation: "EU AI Act Art. 15" },
    { id: "safety_attestation", name: "Safety Review Attestation", description: "OSHA compliance and safety review attestation", source: "governance", required: true, regulation: "OSHA" },
    { id: "quality_report", name: "Quality Validation Report", description: "ISO 9001 quality management validation", source: "eval_studio", required: true, regulation: "ISO 9001" },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true, regulation: "EU AI Act Art. 14" },
  ],
  insurance: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with claims processing scorer", source: "shadow_replay_studio", required: true },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against insurance golden dataset", source: "eval_studio", required: true },
    { id: "actuarial_review", name: "Actuarial Review Report", description: "Actuarial team review of risk assessment models", source: "manual_upload", required: true },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true },
  ],
  retail: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with customer experience scorer", source: "shadow_replay_studio", required: true },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against retail golden dataset", source: "eval_studio", required: true },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true },
  ],
  technology_saas: [
    { id: "shadow_replay", name: "Shadow Replay Results", description: "Production trace replay with API reliability scorer", source: "shadow_replay_studio", required: true },
    { id: "canary_performance", name: "Canary Performance Data", description: "Canary deployment metrics and SLO comparison", source: "canary_console", required: true },
    { id: "golden_dataset_eval", name: "Golden Dataset Evaluation", description: "Evaluation results against SaaS golden dataset", source: "eval_studio", required: true },
    { id: "soc2_attestation", name: "SOC 2 Compliance Attestation", description: "SOC 2 Type II control validation report", source: "governance", required: true, regulation: "SOC 2" },
    { id: "privacy_impact", name: "Privacy Impact Assessment", description: "GDPR/CCPA data privacy impact assessment", source: "manual_upload", required: true, regulation: "GDPR" },
    { id: "approval_chain", name: "Approval Chain", description: "Full approval chain with reviewer signatures", source: "approvals", required: true },
  ],
};

export type StageStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export interface DeploymentStageRecord {
  stageId: string;
  status: StageStatus;
  completedAt?: string;
  completedBy?: string;
  attestation?: string;
  artifacts?: string[];
}

export interface DeploymentEvidenceRecord {
  itemId: string;
  collected: boolean;
  collectedAt?: string;
  sourceLink?: string;
  summary?: string;
}

export function getIndustryFromAgent(agent: any): IndustryId | null {
  if (!agent) return null;
  const dept = agent.department?.toLowerCase() || "";
  const tags = Array.isArray(agent.ontologyTags) ? agent.ontologyTags.join(" ").toLowerCase() : "";
  const combined = `${dept} ${tags}`;
  if (combined.includes("health") || combined.includes("clinical") || combined.includes("hipaa")) return "healthcare";
  if (combined.includes("financ") || combined.includes("banking") || combined.includes("aml")) return "financial_services";
  if (combined.includes("manufactur") || combined.includes("industrial") || combined.includes("osha")) return "manufacturing";
  if (combined.includes("insurance") || combined.includes("actuarial") || combined.includes("claims")) return "insurance";
  if (combined.includes("retail") || combined.includes("ecommerce") || combined.includes("consumer")) return "retail";
  if (combined.includes("saas") || combined.includes("software") || combined.includes("devops") || combined.includes("sre") || combined.includes("technology")) return "technology_saas";
  return null;
}

export function getPipelineCompletion(stages: DeploymentStageRecord[], industryStages: PipelineStage[]): { completed: number; total: number; mandatoryComplete: boolean; percent: number } {
  const mandatoryStages = industryStages.filter(s => s.mandatory);
  const completed = stages.filter(s => s.status === "completed").length;
  const mandatoryComplete = mandatoryStages.every(ms => stages.find(s => s.stageId === ms.id)?.status === "completed");
  const total = industryStages.length;
  return { completed, total, mandatoryComplete, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export function getEvidenceCompletion(evidence: DeploymentEvidenceRecord[], industryEvidence: EvidenceItem[]): { collected: number; total: number; requiredComplete: boolean; percent: number } {
  const requiredItems = industryEvidence.filter(e => e.required);
  const collected = evidence.filter(e => e.collected).length;
  const requiredComplete = requiredItems.every(ri => evidence.find(e => e.itemId === ri.id)?.collected);
  const total = industryEvidence.length;
  return { collected, total, requiredComplete, percent: total > 0 ? Math.round((collected / total) * 100) : 0 };
}
