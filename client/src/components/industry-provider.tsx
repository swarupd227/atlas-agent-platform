import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Landmark,
  HeartPulse,
  Factory,
  ShoppingCart,
  Settings2,
  Shield,
  Monitor,
  Scale,
  type LucideIcon,
} from "lucide-react";

export type IndustryId =
  | "financial_services"
  | "insurance"
  | "healthcare"
  | "manufacturing"
  | "retail"
  | "technology_saas"
  | "legal_services"
  | "custom";

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface IntegrationSystem {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface WorkspaceConfig {
  subVerticals: string[];
  jurisdictions: string[];
  integrations: string[];
  departments: string[];
  dataClassificationDefault: DataClassification;
}

export interface GovernancePolicy {
  label: string;
  description: string;
}

export interface IndustryProfile {
  id: IndustryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  color: string;
  ontology: string;
  agentSkills: number;
  regulatoryFrameworks: string[];
  goldenTemplates: number;
  subVerticals: string[];
  jurisdictions: string[];
  integrationSystems: IntegrationSystem[];
  departments: string[];
  defaultGovernancePolicies: GovernancePolicy[];
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    id: "financial_services",
    label: "Financial Services",
    shortLabel: "FinServ",
    description: "Banking, capital markets, credit rating, and wealth management with pre-loaded FIBO ontology and regulatory frameworks",
    icon: Landmark,
    color: "hsl(220 70% 50%)",
    ontology: "FIBO (Financial Industry Business Ontology) + Credit Rating Ontology",
    agentSkills: 128,
    regulatoryFrameworks: ["EU AI Act", "MiFID II", "PSD2", "GDPR", "Basel III", "SOX", "SEC Rule 17g (NRSRO)", "EU CRA Regulation", "IOSCO Code of Conduct", "Dodd-Frank Title IX"],
    goldenTemplates: 28,
    subVerticals: ["Credit Rating", "Retail Banking", "Capital Markets", "Wealth Management", "Payments", "Corporate Banking"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "fis", name: "FIS", category: "Core Banking", description: "Core banking and payment processing platform" },
      { id: "temenos", name: "Temenos", category: "Core Banking", description: "Banking software for wealth and retail banking" },
      { id: "bloomberg", name: "Bloomberg Terminal", category: "Market Data", description: "Financial data, analytics, and trading platform" },
      { id: "refinitiv", name: "Refinitiv Eikon", category: "Market Data", description: "Financial analysis and market data platform" },
      { id: "murex", name: "Murex", category: "Trading", description: "Capital markets trading and risk management" },
      { id: "calypso", name: "Calypso", category: "Trading", description: "Cross-asset treasury and capital markets platform" },
      { id: "moodys_analytics", name: "Moody's Analytics", category: "Credit Rating", description: "Credit risk modeling, structured finance analytics, and rating tools" },
      { id: "sp_capital_iq", name: "S&P Capital IQ", category: "Credit Rating", description: "Financial intelligence and credit analytics platform" },
      { id: "fitch_connect", name: "Fitch Connect", category: "Credit Rating", description: "Credit ratings, research, and analytics portal" },
      { id: "creditedge", name: "Moody's CreditEdge", category: "Credit Rating", description: "Public firm credit risk measurement and monitoring" },
    ],
    departments: ["Treasury", "Risk Management", "Compliance", "Trading", "Client Services", "Finance & Accounting", "Marketing", "HR", "IT & Operations", "Legal", "Rating Analytics", "Structured Finance", "Rating Committee"],
    defaultGovernancePolicies: [
      { label: "Model Risk Management", description: "All AI models validated against SR 11-7 / SS1/23 before production use" },
      { label: "Fair Lending Compliance", description: "Automated bias detection on all credit decisioning outputs" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability for regulatory examination" },
      { label: "Data Lineage", description: "Complete provenance tracking for all data inputs and model outputs" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.80 confidence score for financial decisions" },
    ],
  },
  {
    id: "insurance",
    label: "Insurance",
    shortLabel: "Insurance",
    description: "P&C, life, health, and reinsurance with ACORD standards, Solvency II compliance, and claims automation",
    icon: Shield,
    color: "hsl(200 65% 45%)",
    ontology: "ACORD (Association for Cooperative Operations Research and Development)",
    agentSkills: 86,
    regulatoryFrameworks: ["Solvency II", "IFRS 17", "NAIC Model Laws", "GDPR", "EU AI Act", "ORSA"],
    goldenTemplates: 16,
    subVerticals: ["Property & Casualty", "Life & Annuities", "Health Insurance", "Reinsurance", "InsurTech"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "guidewire", name: "Guidewire", category: "Core Insurance", description: "Insurance core system platform for policy, billing, and claims" },
      { id: "duck_creek", name: "Duck Creek", category: "Core Insurance", description: "SaaS insurance platform for policy and billing" },
      { id: "majesco", name: "Majesco", category: "Core Insurance", description: "Cloud-based insurance platform for P&C and L&A" },
      { id: "sapiens", name: "Sapiens", category: "Core Insurance", description: "Insurance software for digital transformation" },
      { id: "verisk", name: "Verisk Analytics", category: "Data & Analytics", description: "Insurance data analytics, risk assessment, and actuarial modeling" },
      { id: "lexisnexis_ins", name: "LexisNexis Risk Solutions", category: "Data & Analytics", description: "Risk data and analytics for underwriting and claims" },
      { id: "shift_technology", name: "Shift Technology", category: "Fraud Detection", description: "AI-powered fraud detection for insurance claims" },
      { id: "earnix", name: "Earnix", category: "Pricing & Rating", description: "Dynamic pricing and rating engine for insurance products" },
    ],
    departments: ["Underwriting", "Claims", "Actuarial", "Policy Administration", "Risk Management", "Compliance & Regulatory", "Finance & Accounting", "Distribution & Sales", "IT & Digital", "Legal"],
    defaultGovernancePolicies: [
      { label: "Actuarial Model Validation", description: "All pricing and reserving models validated against Solvency II standards" },
      { label: "Claims Fraud Detection", description: "Automated fraud pattern analysis on all claims above threshold" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability for regulatory review" },
      { label: "Policyholder Privacy", description: "PII redaction enforced on all data exports and agent outputs" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.75 confidence score for underwriting decisions" },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare & Life Sciences",
    shortLabel: "Health",
    description: "Clinical operations, pharmaceutical, and life sciences with SNOMED CT ontology and HIPAA compliance",
    icon: HeartPulse,
    color: "hsl(150 60% 40%)",
    ontology: "SNOMED CT (Clinical Terms)",
    agentSkills: 118,
    regulatoryFrameworks: ["HIPAA", "FDA AI/ML Guidance", "21 CFR Part 11", "HITECH", "GxP"],
    goldenTemplates: 22,
    subVerticals: ["Hospital Systems", "Pharmaceuticals", "Medical Devices", "Clinical Research", "Payer/Insurance"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "epic", name: "Epic", category: "EHR", description: "Electronic health records and clinical workflow" },
      { id: "cerner", name: "Cerner (Oracle Health)", category: "EHR", description: "Health information technology solutions" },
      { id: "meditech", name: "MEDITECH", category: "EHR", description: "Healthcare information system" },
      { id: "veeva", name: "Veeva Systems", category: "Life Sciences", description: "Cloud solutions for life sciences" },
      { id: "iqvia", name: "IQVIA", category: "Clinical Research", description: "Clinical research and analytics platform" },
      { id: "medidata", name: "Medidata Solutions", category: "Clinical Research", description: "Clinical trial management platform" },
      { id: "labcorp", name: "LabCorp/Covance", category: "Diagnostics", description: "Laboratory diagnostics and drug development" },
      { id: "allscripts", name: "Allscripts", category: "EHR", description: "Healthcare IT solutions" },
    ],
    departments: ["Clinical Operations", "Pharmacy", "Research & Development", "Finance & Billing", "Marketing & Outreach", "Human Resources", "IT & Health Informatics", "Supply Chain", "Quality & Safety", "Legal & Compliance"],
    defaultGovernancePolicies: [
      { label: "PHI Protection", description: "HIPAA-compliant data handling with automatic PII/PHI detection and redaction" },
      { label: "Clinical Validation", description: "All clinical decision support outputs require physician review" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability for regulatory audit" },
      { label: "FDA Compliance", description: "AI/ML models follow FDA guidance for Software as a Medical Device (SaMD)" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.85 confidence score for clinical decisions" },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing & Supply Chain",
    shortLabel: "Mfg",
    description: "Production optimization, supply chain, and quality management with ISA-95 ontology",
    icon: Factory,
    color: "hsl(30 70% 50%)",
    ontology: "ISA-95 (Enterprise-Control Integration)",
    agentSkills: 96,
    regulatoryFrameworks: ["ISO 9001", "ISO 27001", "REACH", "RoHS", "ITAR"],
    goldenTemplates: 18,
    subVerticals: ["Discrete Manufacturing", "Process Manufacturing", "Automotive", "Aerospace & Defense", "Electronics"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "sap_erp", name: "SAP S/4HANA", category: "ERP", description: "Enterprise resource planning and manufacturing" },
      { id: "oracle_mfg", name: "Oracle Manufacturing Cloud", category: "ERP", description: "Cloud manufacturing management" },
      { id: "siemens_plm", name: "Siemens Teamcenter", category: "PLM", description: "Product lifecycle management platform" },
      { id: "ptc_windchill", name: "PTC Windchill", category: "PLM", description: "Product data and lifecycle management" },
      { id: "rockwell", name: "Rockwell FactoryTalk", category: "MES/SCADA", description: "Industrial automation and control" },
      { id: "aveva", name: "AVEVA", category: "MES/SCADA", description: "Industrial software for operations" },
      { id: "sap_ibp", name: "SAP IBP", category: "Supply Chain", description: "Integrated business planning for supply chain" },
      { id: "kinaxis", name: "Kinaxis RapidResponse", category: "Supply Chain", description: "Supply chain planning and analytics" },
    ],
    departments: ["Production", "Quality Assurance", "Supply Chain & Logistics", "Engineering", "Finance & Accounting", "Marketing & Sales", "HR & Safety", "IT & Automation", "Maintenance", "Legal & Compliance"],
    defaultGovernancePolicies: [
      { label: "Quality Assurance", description: "All production changes validated against ISO 9001 quality standards" },
      { label: "Safety Compliance", description: "Automated safety impact analysis before any process modification" },
      { label: "Audit Trail", description: "Every agent action logged with full traceability for regulatory inspection" },
      { label: "Supply Chain Integrity", description: "Vendor and material verification required for all procurement actions" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.75 confidence score for production decisions" },
    ],
  },
  {
    id: "retail",
    label: "Retail & E-Commerce",
    shortLabel: "Retail",
    description: "Customer experience, inventory, and commerce with GS1 standards and PCI compliance",
    icon: ShoppingCart,
    color: "hsl(280 60% 50%)",
    ontology: "GS1 (Global Standards)",
    agentSkills: 108,
    regulatoryFrameworks: ["PCI DSS", "CCPA/CPRA", "GDPR", "FTC Guidelines", "ADA Compliance"],
    goldenTemplates: 24,
    subVerticals: ["Omnichannel Retail", "D2C E-Commerce", "Grocery & FMCG", "Luxury & Fashion", "Marketplace"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "shopify", name: "Shopify", category: "E-Commerce", description: "E-commerce platform and POS" },
      { id: "salesforce_commerce", name: "Salesforce Commerce Cloud", category: "E-Commerce", description: "Enterprise e-commerce platform" },
      { id: "sap_cx", name: "SAP Commerce Cloud", category: "E-Commerce", description: "Enterprise commerce and CX platform" },
      { id: "oracle_retail", name: "Oracle Retail", category: "Retail Ops", description: "Retail management and merchandising" },
      { id: "manhattan", name: "Manhattan Associates", category: "Supply Chain", description: "Supply chain and omnichannel solutions" },
      { id: "blue_yonder", name: "Blue Yonder", category: "Supply Chain", description: "AI-driven supply chain management" },
      { id: "algolia", name: "Algolia", category: "Search", description: "AI-powered search and discovery" },
      { id: "stripe", name: "Stripe", category: "Payments", description: "Payment processing infrastructure" },
    ],
    departments: ["Merchandising", "E-Commerce", "Marketing & Advertising", "Customer Service", "Supply Chain & Fulfillment", "Finance & Accounting", "HR & Training", "IT & Digital", "Loss Prevention", "Legal & Compliance"],
    defaultGovernancePolicies: [
      { label: "PCI Compliance", description: "Payment card data handling follows PCI DSS Level 1 requirements" },
      { label: "Customer Privacy", description: "CCPA/GDPR-compliant customer data processing and consent management" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability for compliance review" },
      { label: "Inventory Accuracy", description: "All inventory modifications require dual verification before execution" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.70 confidence score for pricing decisions" },
    ],
  },
  {
    id: "technology_saas",
    label: "Technology / SaaS",
    shortLabel: "Tech",
    description: "Software, cloud infrastructure, and SaaS platforms with SOC 2, GDPR, and CCPA compliance built in",
    icon: Monitor,
    color: "hsl(250 65% 55%)",
    ontology: "ITIL / SRE (IT Service Management & Site Reliability)",
    agentSkills: 104,
    regulatoryFrameworks: ["SOC 2 Type II", "GDPR", "CCPA/CPRA", "ISO 27001", "HIPAA BAA", "FedRAMP"],
    goldenTemplates: 20,
    subVerticals: ["B2B SaaS", "Developer Tools", "Cloud Infrastructure", "FinTech", "HealthTech", "Software Deployment & Patch Management"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "zendesk", name: "Zendesk", category: "Customer Support", description: "Customer service and engagement platform" },
      { id: "stripe_tech", name: "Stripe", category: "Billing & Payments", description: "Payment processing and subscription billing" },
      { id: "pagerduty", name: "PagerDuty", category: "Incident Management", description: "Digital operations and incident response" },
      { id: "datadog", name: "Datadog", category: "Observability", description: "Cloud monitoring and security platform" },
      { id: "salesforce_crm", name: "Salesforce", category: "CRM", description: "Customer relationship management" },
      { id: "hubspot", name: "HubSpot", category: "CRM & Marketing", description: "Inbound marketing and CRM platform" },
      { id: "jira", name: "Jira", category: "Project Management", description: "Agile project management and issue tracking" },
      { id: "github", name: "GitHub", category: "DevOps", description: "Code hosting and CI/CD platform" },
      { id: "rest_api_connector", name: "REST API Connector", category: "Endpoint Management", description: "Generic REST API integration for device and endpoint management platforms" },
      { id: "web_scraper", name: "Web Scraper", category: "Endpoint Management", description: "Automated web content extraction for vendor release notes and package metadata" },
      { id: "sandbox_env", name: "Sandbox Environment", category: "Endpoint Management", description: "Isolated validation environment for package testing before deployment" },
      { id: "package_repository", name: "Package Repository", category: "Endpoint Management", description: "Software package storage and distribution system for deployment artifacts" },
    ],
    departments: ["Engineering", "Product", "Customer Success", "Sales", "Marketing", "Finance & Billing", "DevOps / SRE", "Security & Compliance", "People Ops", "Legal"],
    defaultGovernancePolicies: [
      { label: "Package Integrity", description: "Checksum verification required before any software deployment" },
      { label: "Sandbox-First Validation", description: "No package reaches endpoints without passing sandbox validation" },
      { label: "Tenant Isolation", description: "Zero cross-tenant data exposure enforced across all operations" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.70 confidence score" },
    ],
  },
  {
    id: "legal_services",
    label: "Legal Services",
    shortLabel: "Legal",
    description: "Law firms, corporate legal departments, and compliance teams with matter management, contract lifecycle automation, and eDiscovery workflows",
    icon: Scale,
    color: "hsl(220 35% 40%)",
    ontology: "LKIF (Legal Knowledge Interchange Format) + SALI LMSS",
    agentSkills: 94,
    regulatoryFrameworks: ["ABA Model Rules", "GDPR", "CCPA/CPRA", "FCPA", "SOX", "FRCP eDiscovery", "EU AI Act", "HIPAA BAA (for health law)"],
    goldenTemplates: 16,
    subVerticals: ["Litigation & eDiscovery", "Corporate M&A", "Contract Management", "Intellectual Property", "Employment & Labor", "Compliance & Regulatory"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [
      { id: "clio", name: "Clio", category: "Practice Management", description: "Cloud-based legal practice management software" },
      { id: "imanage", name: "iManage", category: "Document Management", description: "Document and email management platform for legal teams" },
      { id: "netdocuments", name: "NetDocuments", category: "Document Management", description: "Cloud document management for law firms" },
      { id: "relativity", name: "Relativity", category: "eDiscovery", description: "Legal document review and eDiscovery platform" },
      { id: "lexisnexis_law", name: "LexisNexis", category: "Legal Research", description: "Legal research, analytics, and workflow solutions" },
      { id: "westlaw", name: "Westlaw", category: "Legal Research", description: "Legal research platform with case law and statutes" },
      { id: "litera", name: "Litera", category: "Contract Lifecycle", description: "Document drafting, comparison, and contract lifecycle management" },
      { id: "onit", name: "Onit", category: "Contract Lifecycle", description: "Enterprise legal management and contract automation" },
    ],
    departments: ["Litigation", "Corporate & M&A", "Contracts & Procurement", "Intellectual Property", "Employment & Labor", "Compliance & Regulatory", "Finance & Billing", "Operations", "IT & Knowledge Management", "Business Development"],
    defaultGovernancePolicies: [
      { label: "Attorney-Client Privilege", description: "All AI outputs and agent actions screened to protect privileged communications" },
      { label: "Confidentiality Enforcement", description: "Matter data access restricted by role, client, and engagement; no cross-matter data leakage" },
      { label: "Audit Trail", description: "Every agent action logged with full explainability for bar compliance and client reporting" },
      { label: "PII Redaction", description: "Automatic redaction of client PII and sensitive matter data in all external outputs" },
      { label: "Confidence Thresholds", description: "No auto-execution below 0.85 confidence score for legal research and drafting decisions" },
    ],
  },
  {
    id: "custom",
    label: "Cross-Industry",
    shortLabel: "Cross-Industry",
    description: "Cross-industry workspace for agents and templates that span multiple verticals — Order-to-Cash, DevOps, HR workflows, and more. Build your own ontology, policies, and templates from scratch.",
    icon: Settings2,
    color: "hsl(0 0% 50%)",
    ontology: "Cross-Industry Ontology",
    agentSkills: 0,
    regulatoryFrameworks: [],
    goldenTemplates: 0,
    subVerticals: [],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    integrationSystems: [],
    departments: [],
    defaultGovernancePolicies: [],
  },
];

export interface OutcomeTemplateKpi {
  name: string;
  target: number;
  unit: string;
  baseline: number | null;
  slaThreshold?: number;
  weight?: number;
}

export interface OutcomeTemplate {
  id: string;
  name: string;
  description: string;
  industry: IndustryId;
  subVertical?: string;
  riskTier: string;
  pricingModel: string;
  pricePerUnit: number;
  riskThreshold: number;
  maxDriftPercent: number;
  kpis: OutcomeTemplateKpi[];
  slaDescription: string;
  tools?: string[];
  complexity?: "simple" | "moderate" | "complex";
  complianceCertifications?: string[];
}

export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  {
    id: "software-package-automation",
    name: "Autonomous Application Packaging & Deployment",
    description: "Automatically discover outdated applications across endpoints, build deployment packages, validate in sandbox, and deploy to production endpoints — with admin gates for critical apps. Achieve 95% packaging success with zero untested deployments.",
    industry: "technology_saas",
    subVertical: "Software Deployment & Patch Management",
    riskTier: "HIGH",
    complexity: "complex",
    tools: ["Intune", "SCCM", "Ansible", "ServiceNow", "Jenkins", "Puppet"],
    complianceCertifications: ["SOC 2", "ISO 27001"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 2.50,
    riskThreshold: 0.70,
    maxDriftPercent: 5,
    kpis: [
      { name: "Packaging Success Rate", target: 95, unit: "percent", baseline: null, slaThreshold: 90, weight: 1.5 },
      { name: "Sandbox Validation Pass Rate", target: 95, unit: "percent", baseline: null, slaThreshold: 90, weight: 1.2 },
      { name: "First-Attempt Deployment Success", target: 90, unit: "percent", baseline: null, slaThreshold: 85, weight: 1.3 },
      { name: "False Positive Rate", target: 5, unit: "percent", baseline: null, slaThreshold: 8, weight: 1.0 },
      { name: "Zero Untested Deployments", target: 100, unit: "percent", baseline: null, slaThreshold: 100, weight: 2.0 },
      { name: "Mean Time Discovery to Deployment", target: 30, unit: "minutes", baseline: null, slaThreshold: 45, weight: 1.0 },
    ],
    slaDescription: "95% packaging success rate measured monthly",
  },
  {
    id: "saas-incident-resolution",
    name: "Automated Incident Detection & Resolution",
    description: "Detect, diagnose, and remediate production incidents automatically with AI-driven root cause analysis. Reduce MTTR and minimize customer impact through autonomous healing workflows.",
    industry: "technology_saas",
    riskTier: "HIGH",
    complexity: "complex",
    tools: ["PagerDuty", "Datadog", "Slack", "Zendesk", "GitHub", "AWS CloudWatch"],
    complianceCertifications: ["SOC 2", "ISO 27001"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 5.00,
    riskThreshold: 0.80,
    maxDriftPercent: 10,
    kpis: [
      { name: "Mean Time to Resolution", target: 15, unit: "minutes", baseline: null, slaThreshold: 30 },
      { name: "Auto-Resolution Rate", target: 70, unit: "percent", baseline: null, slaThreshold: 60 },
      { name: "False Alarm Rate", target: 5, unit: "percent", baseline: null, slaThreshold: 10 },
      { name: "Customer Impact Score", target: 2, unit: "score", baseline: null, slaThreshold: 3 },
    ],
    slaDescription: "70% auto-resolution rate with <15min MTTR measured weekly",
  },
  {
    id: "kyc-onboarding-acceleration",
    name: "Accelerated KYC Onboarding",
    description: "Automate KYC document verification, risk scoring, and compliance checks to reduce onboarding time from days to hours while maintaining full BSA/AML regulatory compliance.",
    industry: "financial_services",
    riskTier: "HIGH",
    complexity: "complex",
    tools: ["Plaid", "Jumio", "Salesforce", "DocuSign", "Alloy", "Stripe Identity"],
    complianceCertifications: ["BSA/AML", "SOC 2", "GLBA"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 8.00,
    riskThreshold: 0.80,
    maxDriftPercent: 5,
    kpis: [
      { name: "Onboarding Cycle Time", target: 24, unit: "hours", baseline: null, slaThreshold: 48 },
      { name: "Document Verification Accuracy", target: 98, unit: "percent", baseline: null, slaThreshold: 95 },
      { name: "Regulatory Compliance Rate", target: 100, unit: "percent", baseline: null, slaThreshold: 100 },
      { name: "False Positive Screening Rate", target: 10, unit: "percent", baseline: null, slaThreshold: 20 },
    ],
    slaDescription: "98% document verification accuracy with <24hr onboarding measured monthly",
  },
  {
    id: "claims-processing-automation",
    name: "Straight-Through Claims Processing",
    description: "Automate claims intake, adjudication, and settlement for standard claims with AI-driven fraud detection and compliance checks. Achieve straight-through processing for majority of claims.",
    industry: "insurance",
    riskTier: "HIGH",
    complexity: "complex",
    tools: ["Guidewire", "Duck Creek", "Salesforce", "DocuSign", "Verisk", "ISO ClaimSearch"],
    complianceCertifications: ["SOC 2", "NAIC Model Laws"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 4.00,
    riskThreshold: 0.75,
    maxDriftPercent: 8,
    kpis: [
      { name: "Straight-Through Processing Rate", target: 60, unit: "percent", baseline: null, slaThreshold: 50 },
      { name: "Average Cycle Time", target: 3, unit: "days", baseline: null, slaThreshold: 5 },
      { name: "Fraud Detection Accuracy", target: 95, unit: "percent", baseline: null, slaThreshold: 90 },
      { name: "Claims Leakage Reduction", target: 25, unit: "percent", baseline: null, slaThreshold: 15 },
    ],
    slaDescription: "60% straight-through processing with <3 day cycle time measured monthly",
  },
  {
    id: "clinical-documentation-improvement",
    name: "Clinical Documentation Improvement",
    description: "Automate clinical documentation completeness scoring, gap identification, and coding accuracy to improve quality reporting and reduce claim denials.",
    industry: "healthcare",
    riskTier: "HIGH",
    complexity: "complex",
    tools: ["Epic", "Cerner", "Nuance DAX", "3M CDI", "HealthHelp", "Optum"],
    complianceCertifications: ["HIPAA", "SOC 2"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 3.50,
    riskThreshold: 0.85,
    maxDriftPercent: 5,
    kpis: [
      { name: "Documentation Completeness Score", target: 95, unit: "percent", baseline: null, slaThreshold: 90 },
      { name: "Coding Accuracy Rate", target: 98, unit: "percent", baseline: null, slaThreshold: 95 },
      { name: "Claim Denial Rate Reduction", target: 50, unit: "percent", baseline: null, slaThreshold: 30 },
      { name: "Query Response Time", target: 4, unit: "hours", baseline: null, slaThreshold: 8 },
    ],
    slaDescription: "95% documentation completeness with 98% coding accuracy measured monthly",
  },
  {
    id: "predictive-maintenance",
    name: "Predictive Equipment Maintenance",
    description: "Predict equipment failures 48+ hours in advance using sensor data analysis, reduce unplanned downtime, and optimize maintenance scheduling for maximum OEE.",
    industry: "manufacturing",
    riskTier: "MEDIUM",
    complexity: "moderate",
    tools: ["OSIsoft PI", "Siemens MindSphere", "PTC ThingWorx", "SAP PM", "GE Predix"],
    complianceCertifications: ["ISO 9001"],
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 6.00,
    riskThreshold: 0.75,
    maxDriftPercent: 10,
    kpis: [
      { name: "Failure Prediction Accuracy", target: 90, unit: "percent", baseline: null, slaThreshold: 85 },
      { name: "Prediction Lead Time", target: 48, unit: "hours", baseline: null, slaThreshold: 24 },
      { name: "Unplanned Downtime Reduction", target: 60, unit: "percent", baseline: null, slaThreshold: 40 },
      { name: "OEE Improvement", target: 85, unit: "percent", baseline: null, slaThreshold: 80 },
    ],
    slaDescription: "90% failure prediction accuracy with 48hr lead time measured monthly",
  },
  {
    id: "demand-forecasting-optimization",
    name: "AI-Driven Demand Forecasting",
    description: "Optimize demand forecasting accuracy using AI to reduce overstock and stockout rates, lower inventory carrying costs, and improve fill rates across all channels.",
    industry: "retail",
    riskTier: "MEDIUM",
    complexity: "moderate",
    tools: ["SAP IBP", "Oracle Demand Mgmt", "Salesforce Commerce", "Shopify", "NetSuite"],
    complianceCertifications: [],
    pricingModel: "FIXED_MONTHLY",
    pricePerUnit: 2000.00,
    riskThreshold: 0.70,
    maxDriftPercent: 10,
    kpis: [
      { name: "Forecast Accuracy", target: 90, unit: "percent", baseline: null, slaThreshold: 85 },
      { name: "Overstock Rate Reduction", target: 50, unit: "percent", baseline: null, slaThreshold: 30 },
      { name: "Stockout Rate", target: 2, unit: "percent", baseline: null, slaThreshold: 5 },
      { name: "Inventory Carrying Cost Reduction", target: 25, unit: "percent", baseline: null, slaThreshold: 15 },
    ],
    slaDescription: "90% forecast accuracy with <2% stockout rate measured monthly",
  },
];

type TermKey =
  | "outcomes"
  | "outcome"
  | "agents"
  | "agent"
  | "kpis"
  | "kpi"
  | "blueprints"
  | "blueprint"
  | "deployments"
  | "deployment"
  | "monitor"
  | "governance"
  | "approvals"
  | "billing"
  | "templates"
  | "template"
  | "incidents"
  | "incident"
  | "evaluation"
  | "evaluations"
  | "outcome_owner"
  | "sla"
  | "drift"
  | "remediation";

type TerminologyMap = Record<TermKey, string>;

const DEFAULT_TERMS: TerminologyMap = {
  outcomes: "Outcomes",
  outcome: "Outcome",
  agents: "Agents",
  agent: "Agent",
  kpis: "KPIs",
  kpi: "KPI",
  blueprints: "Blueprints",
  blueprint: "Blueprint",
  deployments: "Deployments",
  deployment: "Deployment",
  monitor: "Monitor",
  governance: "Governance",
  approvals: "Approvals",
  billing: "Billing",
  templates: "Templates",
  template: "Template",
  incidents: "Incidents",
  incident: "Incident",
  evaluation: "Evaluation",
  evaluations: "Evaluations",
  outcome_owner: "Outcome Owner",
  sla: "SLA",
  drift: "Drift",
  remediation: "Remediation",
};

const INDUSTRY_TERMS: Record<IndustryId, Partial<TerminologyMap>> = {
  financial_services: {
    outcomes: "Service Commitments",
    outcome: "Service Commitment",
    kpis: "Performance Covenants",
    kpi: "Performance Covenant",
    incidents: "Risk Events",
    incident: "Risk Event",
    outcome_owner: "Portfolio Manager",
    sla: "Service Covenant",
    drift: "Variance",
    remediation: "Corrective Action",
    evaluation: "Compliance Check",
    evaluations: "Compliance Checks",
  },
  insurance: {
    outcomes: "Policy Performance Targets",
    outcome: "Policy Performance Target",
    kpis: "Loss Ratios",
    kpi: "Loss Ratio",
    incidents: "Claims Events",
    incident: "Claims Event",
    outcome_owner: "Book Manager",
    sla: "Coverage Commitment",
    drift: "Reserve Variance",
    remediation: "Claims Adjustment",
    evaluation: "Actuarial Review",
    evaluations: "Actuarial Reviews",
  },
  healthcare: {
    outcomes: "Patient Throughput Targets",
    outcome: "Patient Throughput Target",
    kpis: "Clinical Metrics",
    kpi: "Clinical Metric",
    incidents: "Care Events",
    incident: "Care Event",
    outcome_owner: "Clinical Lead",
    sla: "Care Standard",
    drift: "Protocol Deviation",
    remediation: "Corrective Protocol",
    evaluation: "Clinical Validation",
    evaluations: "Clinical Validations",
  },
  manufacturing: {
    outcomes: "Production Targets",
    outcome: "Production Target",
    kpis: "OEE Metrics",
    kpi: "OEE Metric",
    incidents: "Downtime Events",
    incident: "Downtime Event",
    outcome_owner: "Plant Manager",
    sla: "Production Standard",
    drift: "Process Deviation",
    remediation: "Corrective Maintenance",
    evaluation: "Quality Inspection",
    evaluations: "Quality Inspections",
  },
  retail: {
    outcomes: "Revenue Targets",
    outcome: "Revenue Target",
    kpis: "Commerce Metrics",
    kpi: "Commerce Metric",
    incidents: "Fulfillment Issues",
    incident: "Fulfillment Issue",
    outcome_owner: "Category Manager",
    sla: "Service Promise",
    drift: "Forecast Deviation",
    remediation: "Recovery Action",
    evaluation: "Conversion Audit",
    evaluations: "Conversion Audits",
  },
  technology_saas: {
    outcomes: "Service Objectives",
    outcome: "Service Objective",
    kpis: "Platform Metrics",
    kpi: "Platform Metric",
    incidents: "Incidents",
    incident: "Incident",
    outcome_owner: "Service Owner",
    sla: "SLO",
    drift: "Regression",
    remediation: "Hotfix",
    evaluation: "Release Validation",
    evaluations: "Release Validations",
  },
  custom: {},
};

const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  subVerticals: [],
  jurisdictions: [],
  integrations: [],
  departments: [],
  dataClassificationDefault: "internal",
};

interface IndustryContextType {
  industry: IndustryProfile | null;
  setIndustry: (id: IndustryId) => void;
  clearIndustry: () => void;
  isSelected: boolean;
  term: (key: TermKey) => string;
  allIndustries: IndustryProfile[];
  workspaceConfig: WorkspaceConfig;
  setWorkspaceConfig: (config: WorkspaceConfig) => void;
  activeFrameworks: string[];
  activeDepartments: string[];
}

const JURISDICTION_FRAMEWORKS: Record<string, Record<string, string[]>> = {
  financial_services: {
    US: ["SOX", "Basel III", "SEC Rule 17g (NRSRO)", "Dodd-Frank Title IX"],
    EU: ["EU AI Act", "MiFID II", "PSD2", "GDPR", "EU CRA Regulation"],
    UK: ["FCA Regulations"],
    APAC: ["MAS Guidelines"],
    Global: ["IOSCO Code of Conduct"],
  },
  insurance: {
    US: ["NAIC Model Laws", "State Insurance Regulations"],
    EU: ["Solvency II", "IFRS 17", "GDPR", "EU AI Act"],
    UK: ["PRA Solvency II", "FCA Insurance Conduct"],
    APAC: ["IRDAI Guidelines", "MAS Insurance Regulations"],
    Global: ["ORSA"],
  },
  healthcare: {
    US: ["HIPAA", "HITECH", "FDA AI/ML Guidance"],
    EU: ["EU MDR", "GDPR", "EMA Guidelines"],
    UK: ["NHS Data Security"],
    APAC: ["PMDA Guidelines"],
    Global: ["21 CFR Part 11", "GxP"],
  },
  manufacturing: {
    US: ["ITAR", "OSHA"],
    EU: ["REACH", "RoHS", "EU Machinery Regulation"],
    UK: ["UK REACH"],
    APAC: ["CCC Certification"],
    Global: ["ISO 9001", "ISO 27001"],
  },
  retail: {
    US: ["CCPA/CPRA", "FTC Guidelines", "ADA Compliance"],
    EU: ["GDPR", "Digital Services Act"],
    UK: ["UK GDPR"],
    APAC: ["PDPA"],
    Global: ["PCI DSS"],
  },
  custom: {},
};

const DEPARTMENT_FRAMEWORKS: Record<string, Record<string, string[]>> = {
  financial_services: {
    "Treasury": ["Basel III", "SOX"],
    "Risk Management": ["Basel III", "EU AI Act"],
    "Compliance": ["SOX", "MiFID II", "FCA Regulations"],
    "Trading": ["MiFID II", "FCA Regulations"],
    "Finance & Accounting": ["SOX", "Basel III"],
    "Marketing": ["FTC Guidelines", "GDPR"],
    "Legal": ["GDPR", "EU AI Act"],
    "Rating Analytics": ["SEC Rule 17g (NRSRO)", "EU CRA Regulation", "IOSCO Code of Conduct"],
    "Structured Finance": ["SEC Rule 17g (NRSRO)", "Dodd-Frank Title IX", "EU CRA Regulation"],
    "Rating Committee": ["SEC Rule 17g (NRSRO)", "IOSCO Code of Conduct", "EU AI Act"],
  },
  insurance: {
    "Underwriting": ["Solvency II", "NAIC Model Laws", "ORSA"],
    "Claims": ["NAIC Model Laws", "State Insurance Regulations", "IFRS 17"],
    "Actuarial": ["Solvency II", "IFRS 17", "ORSA"],
    "Policy Administration": ["NAIC Model Laws", "State Insurance Regulations"],
    "Risk Management": ["Solvency II", "ORSA", "EU AI Act"],
    "Compliance & Regulatory": ["Solvency II", "NAIC Model Laws", "GDPR", "EU AI Act"],
    "Finance & Accounting": ["IFRS 17", "Solvency II"],
    "Distribution & Sales": ["State Insurance Regulations", "FCA Insurance Conduct"],
    "IT & Digital": ["GDPR", "EU AI Act"],
    "Legal": ["GDPR", "NAIC Model Laws"],
  },
  healthcare: {
    "Clinical Operations": ["HIPAA", "FDA AI/ML Guidance", "21 CFR Part 11"],
    "Pharmacy": ["FDA AI/ML Guidance", "21 CFR Part 11", "GxP"],
    "Research & Development": ["21 CFR Part 11", "GxP", "FDA AI/ML Guidance"],
    "Finance & Billing": ["SOX", "HIPAA"],
    "Marketing & Outreach": ["FDA AI/ML Guidance", "FTC Guidelines", "HIPAA"],
    "Human Resources": ["HIPAA", "GDPR"],
    "IT & Health Informatics": ["HIPAA", "HITECH", "21 CFR Part 11"],
    "Supply Chain": ["GxP", "FDA AI/ML Guidance"],
    "Quality & Safety": ["FDA AI/ML Guidance", "GxP", "21 CFR Part 11"],
    "Legal & Compliance": ["HIPAA", "HITECH", "GDPR"],
  },
  manufacturing: {
    "Production": ["ISO 9001", "OSHA", "ISA-95"],
    "Quality Assurance": ["ISO 9001", "ISO 27001"],
    "Supply Chain & Logistics": ["ITAR", "REACH", "RoHS"],
    "Engineering": ["ISA-95", "ISO 9001"],
    "Finance & Accounting": ["SOX", "ISO 27001"],
    "Marketing & Sales": ["FTC Guidelines", "GDPR"],
    "HR & Safety": ["OSHA", "GDPR"],
    "IT & Automation": ["ISO 27001", "ISA-95"],
    "Maintenance": ["OSHA", "ISO 9001"],
    "Legal & Compliance": ["ITAR", "REACH", "GDPR"],
  },
  retail: {
    "Merchandising": ["FTC Guidelines", "PCI DSS"],
    "E-Commerce": ["PCI DSS", "CCPA/CPRA", "GDPR"],
    "Marketing & Advertising": ["FTC Guidelines", "CCPA/CPRA", "GDPR"],
    "Customer Service": ["CCPA/CPRA", "GDPR", "ADA Compliance"],
    "Supply Chain & Fulfillment": ["FTC Guidelines"],
    "Finance & Accounting": ["SOX", "PCI DSS"],
    "IT & Digital": ["PCI DSS", "ISO 27001"],
    "Loss Prevention": ["PCI DSS", "CCPA/CPRA"],
    "Legal & Compliance": ["GDPR", "CCPA/CPRA", "FTC Guidelines"],
  },
  custom: {},
};

const IndustryContext = createContext<IndustryContextType | null>(null);

export function IndustryProvider({ children }: { children: ReactNode }) {
  const [industryId, setIndustryId] = useState<IndustryId | null>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-industry") as IndustryId) || null;
    }
    return null;
  });

  const [workspaceConfig, setWorkspaceConfigState] = useState<WorkspaceConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("almp-workspace-config");
      if (saved) {
        try { return JSON.parse(saved); } catch { /* ignore */ }
      }
    }
    return DEFAULT_WORKSPACE_CONFIG;
  });

  const industry = useMemo(
    () => (industryId ? INDUSTRIES.find((i) => i.id === industryId) || null : null),
    [industryId],
  );

  const setIndustry = useCallback((id: IndustryId) => {
    setIndustryId(id);
    localStorage.setItem("almp-industry", id);
  }, []);

  const clearIndustry = useCallback(() => {
    setIndustryId(null);
    localStorage.removeItem("almp-industry");
    localStorage.removeItem("almp-workspace-config");
    setWorkspaceConfigState(DEFAULT_WORKSPACE_CONFIG);
  }, []);

  const setWorkspaceConfig = useCallback((config: WorkspaceConfig) => {
    setWorkspaceConfigState(config);
    localStorage.setItem("almp-workspace-config", JSON.stringify(config));
  }, []);

  const activeFrameworks = useMemo(() => {
    if (!industryId || industryId === "custom") return [];
    const frameworkMap = JURISDICTION_FRAMEWORKS[industryId] || {};
    const jurisdictionFrameworks = new Set<string>();
    for (const j of workspaceConfig.jurisdictions) {
      for (const fw of (frameworkMap[j] || [])) {
        jurisdictionFrameworks.add(fw);
      }
    }
    const departments = workspaceConfig.departments || [];
    if (departments.length === 0) return Array.from(jurisdictionFrameworks);
    const deptMap = DEPARTMENT_FRAMEWORKS[industryId] || {};
    const deptRelevant = new Set<string>();
    for (const dept of departments) {
      for (const fw of (deptMap[dept] || [])) {
        if (jurisdictionFrameworks.has(fw)) {
          deptRelevant.add(fw);
        }
      }
    }
    return Array.from(deptRelevant);
  }, [industryId, workspaceConfig.jurisdictions, workspaceConfig.departments]);

  const activeDepartments = workspaceConfig.departments || [];

  const term = useCallback(
    (key: TermKey): string => {
      if (!industryId) return DEFAULT_TERMS[key];
      return INDUSTRY_TERMS[industryId]?.[key] || DEFAULT_TERMS[key];
    },
    [industryId],
  );

  return (
    <IndustryContext.Provider
      value={{
        industry,
        setIndustry,
        clearIndustry,
        isSelected: industryId !== null,
        term,
        allIndustries: INDUSTRIES,
        workspaceConfig,
        setWorkspaceConfig,
        activeFrameworks,
        activeDepartments,
      }}
    >
      {children}
    </IndustryContext.Provider>
  );
}

export function useIndustry() {
  const ctx = useContext(IndustryContext);
  if (!ctx) throw new Error("useIndustry must be used within an IndustryProvider");
  return ctx;
}

export function useTerm(key: TermKey): string {
  const { term } = useIndustry();
  return term(key);
}
