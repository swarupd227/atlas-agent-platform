export interface PolicyPackPolicy {
  name: string;
  domain: string;
  description: string;
  policyJson: Record<string, unknown>;
}

export interface PolicyPack {
  id: string;
  name: string;
  description: string;
  industry: string;
  framework: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  policies: PolicyPackPolicy[];
}

export const POLICY_PACKS: PolicyPack[] = [
  {
    id: "hipaa-pack",
    name: "HIPAA Compliance Pack",
    description: "Essential policies for HIPAA compliance including PHI handling, access controls, and audit requirements",
    industry: "healthcare",
    framework: "HIPAA",
    riskLevel: "critical",
    policies: [
      { name: "PHI Data Handling", domain: "data_handling", description: "Restrict processing of Protected Health Information (PHI) to authorized agents only", policyJson: { rules: [{ type: "data_class_restriction", classes: ["PHI", "ePHI"], action: "require_encryption" }] } },
      { name: "Clinical Access Controls", domain: "tool_permissions", description: "Enforce role-based access to clinical data systems (EHR, lab results)", policyJson: { rules: [{ type: "tool_scope", scope: "clinical_data", requires: "clinical_lead_approval" }] } },
      { name: "HIPAA Audit Logging", domain: "logging", description: "Mandatory logging of all PHI access events with full attribution", policyJson: { rules: [{ type: "audit_requirement", level: "comprehensive", retention_days: 2190 }] } },
      { name: "Minimum Necessary Rule", domain: "allowed_actions", description: "Agents must only access the minimum necessary PHI for their task", policyJson: { rules: [{ type: "data_minimization", principle: "minimum_necessary" }] } },
    ],
  },
  {
    id: "clinical-safety-pack",
    name: "Clinical Safety Pack",
    description: "Safety policies for agents operating in clinical decision support and patient care workflows",
    industry: "healthcare",
    framework: "FDA AI/ML Guidance",
    riskLevel: "critical",
    policies: [
      { name: "Clinical Decision Guardrails", domain: "content_boundaries", description: "Prevent agents from making autonomous clinical decisions without human validation", policyJson: { rules: [{ type: "human_in_loop", triggers: ["diagnosis", "treatment_recommendation", "medication_change"] }] } },
      { name: "Patient Safety Escalation", domain: "allowed_actions", description: "Auto-escalate to clinical staff when patient safety signals are detected", policyJson: { rules: [{ type: "escalation", triggers: ["adverse_event_signal", "contraindication_detected"] }] } },
    ],
  },
  {
    id: "mifid2-pack",
    name: "MiFID II Compliance Pack",
    description: "Policies for Markets in Financial Instruments Directive II compliance",
    industry: "financial_services",
    framework: "MiFID II",
    riskLevel: "critical",
    policies: [
      { name: "Best Execution Logging", domain: "logging", description: "Record all execution decisions with rationale for best execution obligation", policyJson: { rules: [{ type: "audit_requirement", level: "comprehensive", includes: ["execution_venue", "price_rationale", "timing"] }] } },
      { name: "Client Suitability Checks", domain: "allowed_actions", description: "Enforce suitability assessment before any investment recommendation", policyJson: { rules: [{ type: "pre_action_check", action: "investment_recommendation", requires: "suitability_assessment" }] } },
      { name: "Transaction Reporting", domain: "logging", description: "Mandatory transaction reporting within T+1 for regulatory compliance", policyJson: { rules: [{ type: "reporting_requirement", deadline: "T+1", regulator: "NCA" }] } },
    ],
  },
  {
    id: "sox-pack",
    name: "SOX Compliance Pack",
    description: "Sarbanes-Oxley policies for financial reporting and internal controls",
    industry: "financial_services",
    framework: "SOX",
    riskLevel: "high",
    policies: [
      { name: "Financial Data Integrity", domain: "data_handling", description: "Ensure integrity and non-tampering of financial data processed by agents", policyJson: { rules: [{ type: "data_integrity", requires: ["hash_verification", "immutable_audit_trail"] }] } },
      { name: "Segregation of Duties", domain: "tool_permissions", description: "Enforce separation between agent roles that create, approve, and execute financial transactions", policyJson: { rules: [{ type: "role_separation", actions: ["create_transaction", "approve_transaction", "execute_transaction"] }] } },
    ],
  },
  {
    id: "anti-fraud-pack",
    name: "Anti-Fraud Detection Pack",
    description: "Policies for detecting and preventing fraudulent activities by agents",
    industry: "financial_services",
    framework: "FCA Regulations",
    riskLevel: "high",
    policies: [
      { name: "Anomaly Detection Triggers", domain: "allowed_actions", description: "Flag unusual transaction patterns or data access for human review", policyJson: { rules: [{ type: "anomaly_detection", thresholds: { transaction_volume: "3x_baseline", access_frequency: "5x_baseline" } }] } },
      { name: "Anti-Money Laundering Checks", domain: "allowed_actions", description: "Enforce AML screening for all financial transactions above threshold", policyJson: { rules: [{ type: "pre_action_check", action: "financial_transaction", requires: "aml_screening", threshold: 10000 }] } },
    ],
  },
  {
    id: "sec-17g-credit-rating-pack",
    name: "Credit Rating / SEC Compliance Pack",
    description: "Comprehensive SEC Rule 17g compliance for Nationally Recognized Statistical Rating Organizations (NRSROs) covering record retention, conflict management, rating methodology governance, and disclosure controls",
    industry: "financial_services",
    framework: "SEC Rule 17g (NRSRO)",
    riskLevel: "critical",
    policies: [
      { name: "17g-2 Record Retention", domain: "logging", description: "Maintain all rating action records, internal communications, compliance reports, and revenue records for minimum 10 years in easily accessible format per SEC Rule 17g-2", policyJson: { rules: [{ type: "record_retention", retention_years: 10, record_types: ["rating_actions", "methodologies", "communications", "compliance_reports", "revenue_records"], format: "easily_accessible", enforcement: "block" }] } },
      { name: "17g-3 Annual Financial Reporting", domain: "financial_reporting", description: "Require annual submission of audited financial statements, revenue breakdowns by rating category, and material governance changes to the SEC per Rule 17g-3", policyJson: { rules: [{ type: "financial_reporting", frequency: "annual", reports: ["audited_financial_statements", "revenue_by_category", "governance_changes", "analyst_compensation_summary", "compliance_officer_report"], submission_to: "SEC", requires: ["independent_audit", "board_approval"], enforcement: "require_approval" }] } },
      { name: "17g-5 Conflict of Interest Controls", domain: "allowed_actions", description: "Prevent analyst participation in fee discussions, enforce look-back reviews when analysts join rated entities, and ensure rating shopping disclosure per SEC Rule 17g-5", policyJson: { rules: [{ type: "conflict_prevention", prohibitions: ["analyst_fee_discussion", "rating_shopping_concealment"], requires: ["look_back_review", "conflict_disclosure"], enforcement: "block" }] } },
      { name: "17g-6 Prohibited Conduct Prevention", domain: "content_boundaries", description: "Block unfair, coercive, or abusive practices including conditional ratings, rating threats, and commercially-motivated unsolicited ratings per SEC Rule 17g-6", policyJson: { rules: [{ type: "action_blocklist", actions: ["conditional_rating", "rating_threat", "coercive_practice", "tying_arrangement"], severity: "critical", enforcement: "block" }] } },
      { name: "17g-7 Disclosure Controls", domain: "logging", description: "Ensure publication of rating performance statistics, methodology documentation, rating histories, and annual NRSRO certifications per SEC Rule 17g-7", policyJson: { rules: [{ type: "disclosure_requirement", disclosures: ["performance_statistics", "methodology_docs", "rating_histories", "annual_certification"], frequency: "annual", public: true, enforcement: "require_approval" }] } },
      { name: "17g-8 Internal Controls Framework", domain: "tool_permissions", description: "Establish and enforce documented policies for credit rating process management, methodology application, and violation prevention per SEC Rule 17g-8", policyJson: { rules: [{ type: "internal_controls", scope: "rating_process", requires: ["documented_policies", "methodology_compliance", "violation_prevention", "annual_review"], enforcement: "block" }] } },
      { name: "Rating Committee Governance", domain: "allowed_actions", description: "Enforce proper rating committee composition, quorum requirements, voting procedures, and documentation of dissenting opinions for all rating actions", policyJson: { rules: [{ type: "committee_governance", requires: ["quorum_check", "voting_record", "dissent_documentation", "chair_approval"], scope: "rating_actions", enforcement: "require_approval" }] } },
    ],
  },
  {
    id: "isa95-pack",
    name: "ISA-95 Safety Pack",
    description: "Policies for industrial control system safety and operational technology governance",
    industry: "manufacturing",
    framework: "ISA-95",
    riskLevel: "critical",
    policies: [
      { name: "OT Network Isolation", domain: "tool_permissions", description: "Restrict agent access to operational technology networks with strict boundaries", policyJson: { rules: [{ type: "network_boundary", zones: ["enterprise", "dmz", "control", "field"], default_access: "enterprise_only" }] } },
      { name: "Safety Interlock Override Prevention", domain: "allowed_actions", description: "Prevent agents from overriding safety interlocks in manufacturing systems", policyJson: { rules: [{ type: "action_blocklist", actions: ["override_safety_interlock", "bypass_emergency_stop", "disable_alarm"] }] } },
      { name: "Production Change Control", domain: "allowed_actions", description: "Require approval for any production parameter changes beyond normal operating ranges", policyJson: { rules: [{ type: "change_control", scope: "production_parameters", requires: "plant_manager_approval" }] } },
    ],
  },
  {
    id: "quality-pack",
    name: "Quality Management Pack",
    description: "ISO 9001 aligned policies for quality assurance in manufacturing operations",
    industry: "manufacturing",
    framework: "ISO 9001",
    riskLevel: "medium",
    policies: [
      { name: "Quality Record Retention", domain: "logging", description: "Maintain comprehensive quality records for all agent-assisted inspections", policyJson: { rules: [{ type: "audit_requirement", level: "comprehensive", retention_days: 1825 }] } },
      { name: "Non-Conformance Escalation", domain: "allowed_actions", description: "Auto-escalate quality non-conformances detected by agents", policyJson: { rules: [{ type: "escalation", triggers: ["quality_defect", "out_of_spec", "calibration_due"] }] } },
    ],
  },
  {
    id: "pci-dss-pack",
    name: "PCI DSS Compliance Pack",
    description: "Payment Card Industry Data Security Standard policies for retail operations",
    industry: "retail",
    framework: "PCI DSS",
    riskLevel: "critical",
    policies: [
      { name: "Cardholder Data Protection", domain: "data_handling", description: "Restrict storage and processing of cardholder data with encryption requirements", policyJson: { rules: [{ type: "data_class_restriction", classes: ["PAN", "CVV", "cardholder_data"], action: "require_encryption_and_masking" }] } },
      { name: "Payment Tool Access Control", domain: "tool_permissions", description: "Limit agent access to payment processing systems with strict authentication", policyJson: { rules: [{ type: "tool_scope", scope: "payment_processing", requires: "mfa_and_approval" }] } },
    ],
  },
  {
    id: "gdpr-retail-pack",
    name: "GDPR Consumer Data Pack",
    description: "GDPR compliance policies for customer data handling in retail and e-commerce",
    industry: "retail",
    framework: "GDPR",
    riskLevel: "high",
    policies: [
      { name: "Consent-Based Processing", domain: "data_handling", description: "Ensure agents only process customer data with valid consent basis", policyJson: { rules: [{ type: "consent_check", requires: ["explicit_consent", "legitimate_interest_assessment"] }] } },
      { name: "Right to Erasure Enforcement", domain: "allowed_actions", description: "Agents must honor data deletion requests within regulatory timeframes", policyJson: { rules: [{ type: "data_subject_rights", rights: ["erasure", "rectification", "portability"], sla_hours: 720 }] } },
      { name: "Cross-Border Data Transfer Controls", domain: "data_handling", description: "Enforce data residency and transfer mechanisms for international operations", policyJson: { rules: [{ type: "data_residency", requires: ["adequacy_decision", "standard_contractual_clauses"] }] } },
    ],
  },
  {
    id: "naic-insurance-pack",
    name: "NAIC Model Audit Pack",
    description: "Policies aligned to NAIC Model Audit Rule for claims processing, underwriting governance, and actuarial validation",
    industry: "insurance",
    framework: "NAIC Model Laws",
    riskLevel: "critical",
    policies: [
      { name: "Actuarial Model Validation", domain: "data_handling", description: "All pricing and reserving models validated against Solvency II and NAIC standards before production use", policyJson: { rules: [{ type: "model_validation", frameworks: ["solvency_ii", "naic"], requires: "actuarial_sign_off" }] } },
      { name: "Claims Fraud Detection", domain: "allowed_actions", description: "Automated fraud pattern analysis on all claims above materiality threshold", policyJson: { rules: [{ type: "fraud_screening", trigger: "claim_submission", threshold: "materiality", action: "flag_for_review" }] } },
      { name: "Policyholder Privacy", domain: "data_handling", description: "PII redaction enforced on all data exports and agent outputs per state privacy laws", policyJson: { rules: [{ type: "data_class_restriction", classes: ["PII", "PHI", "SSN"], action: "require_redaction" }] } },
      { name: "Underwriting Audit Trail", domain: "logging", description: "Complete audit logging of all agent actions and underwriting decisions with full attribution and rationale", policyJson: { rules: [{ type: "audit_requirement", level: "comprehensive", scope: "all_agent_actions", retention_days: 2555 }] } },
      { name: "Confidence Threshold Enforcement", domain: "allowed_actions", description: "No auto-execution below 0.75 confidence score for underwriting and claims decisions", policyJson: { rules: [{ type: "confidence_gate", threshold: 0.75, scope: ["underwriting", "claims"], action: "require_human_review" }] } },
    ],
  },
  {
    id: "solvency2-insurance-pack",
    name: "Solvency II Compliance Pack",
    description: "Risk management and capital adequacy policies for Solvency II directive compliance",
    industry: "insurance",
    framework: "Solvency II",
    riskLevel: "high",
    policies: [
      { name: "Risk Capital Monitoring", domain: "allowed_actions", description: "Continuous SCR and MCR monitoring with automated escalation on threshold breaches", policyJson: { rules: [{ type: "threshold_monitoring", metrics: ["SCR_ratio", "MCR_ratio"], escalation: "CRO" }] } },
      { name: "ORSA Integration", domain: "logging", description: "Own Risk and Solvency Assessment reporting with full model lineage", policyJson: { rules: [{ type: "reporting_requirement", report: "ORSA", frequency: "annual", requires: "board_approval" }] } },
    ],
  },
  {
    id: "soc2-tech-pack",
    name: "SOC 2 Type II Compliance Pack",
    description: "Trust service criteria policies for SaaS security, availability, processing integrity, and confidentiality",
    industry: "technology_saas",
    framework: "SOC 2 Type II",
    riskLevel: "high",
    policies: [
      { name: "Package Integrity Verification", domain: "data_handling", description: "Checksum verification required before any software deployment to endpoints", policyJson: { rules: [{ type: "data_integrity", requires: ["sha256_checksum", "signature_validation"], scope: "deployment_artifacts" }] } },
      { name: "Sandbox-First Validation", domain: "allowed_actions", description: "No package reaches production endpoints without passing sandbox validation first", policyJson: { rules: [{ type: "pre_action_check", action: "deploy_package", requires: "sandbox_validation_pass", environments: ["sandbox"] }] } },
      { name: "Tenant Isolation Enforcement", domain: "data_handling", description: "Zero cross-tenant data exposure enforced across all agent operations", policyJson: { rules: [{ type: "data_boundary", principle: "tenant_isolation", enforcement: "strict", action: "block_cross_tenant" }] } },
      { name: "Change Management Logging", domain: "logging", description: "Complete audit trail of all agent actions, deployment, and configuration changes with attribution", policyJson: { rules: [{ type: "audit_requirement", level: "comprehensive", scope: "all_agent_actions", retention_days: 365 }] } },
      { name: "Confidence Threshold Enforcement", domain: "allowed_actions", description: "No auto-execution below 0.70 confidence score for deployment and operational decisions", policyJson: { rules: [{ type: "confidence_gate", threshold: 0.70, scope: ["deployment", "configuration_change"], action: "require_human_review" }] } },
    ],
  },
  {
    id: "eu-ai-act-tech-pack",
    name: "EU AI Act Compliance Pack",
    description: "Policies for EU AI Act compliance including risk classification, transparency, and human oversight requirements",
    industry: "technology_saas",
    framework: "EU AI Act",
    riskLevel: "critical",
    policies: [
      { name: "AI Risk Classification", domain: "allowed_actions", description: "Classify all AI agent operations by risk level per EU AI Act Annex III categories", policyJson: { rules: [{ type: "classification", framework: "eu_ai_act", annex: "III", requires: "risk_assessment" }] } },
      { name: "Transparency & Explainability", domain: "logging", description: "Mandatory transparency reporting for all high-risk AI system decisions", policyJson: { rules: [{ type: "transparency", requires: ["decision_explanation", "data_provenance", "model_card"] }] } },
      { name: "Human Oversight Controls", domain: "allowed_actions", description: "Human-in-the-loop requirement for high-risk AI operations per Article 14", policyJson: { rules: [{ type: "human_in_loop", triggers: ["high_risk_decision", "automated_decision_with_legal_effect"] }] } },
    ],
  },
];

export function findPolicyPackName(policyName: string, policyDomain: string): string | null {
  for (const pack of POLICY_PACKS) {
    for (const pol of pack.policies) {
      if (pol.name === policyName && pol.domain === policyDomain) {
        return pack.name;
      }
    }
  }
  return null;
}
