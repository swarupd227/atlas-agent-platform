import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Shield,
  Plus,
  Search,
  FileCode,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Calendar,
  BarChart2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  FileText,
  Target,
  XCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Ban,
  Scale,
  Sparkles,
  Check,
  BookOpen,
  Layers,
  Play,
  Trash2,
  Loader2,
  Pencil,
  Save,
  Wand2,
  Globe,
  ExternalLink,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useEvidenceDrawer } from "@/components/evidence-drawer";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Policy, AuditEvent, Approval, Agent, PolicyException, ComplianceReport, PolicyTestCase } from "@shared/schema";
import { useIndustry, type IndustryId } from "@/components/industry-provider";

const domainIcons: Record<string, typeof Shield> = {
  data_handling: Lock,
  tool_permissions: FileCode,
  logging: Eye,
  allowed_actions: CheckCircle,
  content_boundaries: AlertTriangle,
};

interface PolicyPackPolicy {
  name: string;
  domain: string;
  description: string;
  policyJson: Record<string, unknown>;
}

interface PolicyPack {
  id: string;
  name: string;
  description: string;
  industry: IndustryId;
  framework: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  policies: PolicyPackPolicy[];
}

const POLICY_PACKS: PolicyPack[] = [
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
];

function getEventDotColor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("violation") || a.includes("blocked")) return "bg-red-500";
  if (a.includes("delete") || a.includes("remove")) return "bg-red-500";
  if (a.includes("create")) return "bg-emerald-500";
  if (a.includes("update") || a.includes("modify")) return "bg-blue-500";
  return "bg-muted-foreground";
}

const frameworkColors: Record<string, string> = {
  SOC2: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  EU_AI_ACT: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  GDPR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

const toolAccessTiers = [
  {
    tier: "OPEN",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "Unrestricted access to low-risk, read-only tools. No approval needed.",
    tools: ["Web Search", "Documentation Lookup", "Public API Read", "Log Viewer", "Status Check"],
  },
  {
    tier: "STANDARD",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    description: "Access to general-purpose tools with basic audit logging. Standard approval flow.",
    tools: ["Database Read", "File Upload", "Email Send", "Notification Dispatch", "Report Generation"],
  },
  {
    tier: "RESTRICTED",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    description: "Elevated access requiring explicit approval. All actions are logged and reviewed.",
    tools: ["Database Write", "User Data Access", "Payment Processing", "External API Write", "Config Modify"],
  },
  {
    tier: "CRITICAL",
    color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    description: "Highest-risk tools with mandatory human-in-the-loop approval for every invocation.",
    tools: ["Data Deletion", "Production Deploy", "Secret Rotation", "Access Revocation", "Schema Migration"],
  },
];

interface EthicalRule {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium";
  enabled: boolean;
}

interface EthicalCategory {
  name: string;
  icon: typeof Shield;
  rules: EthicalRule[];
}

const initialEthicalBoundaries: EthicalCategory[] = [
  {
    name: "Content Boundaries",
    icon: Ban,
    rules: [
      { id: "cb-1", name: "Hate Speech Prevention", description: "Prohibit generation of content targeting protected groups", severity: "critical", enabled: true },
      { id: "cb-2", name: "Violence Restriction", description: "Block generation of violent or harmful content", severity: "critical", enabled: true },
      { id: "cb-3", name: "Personal Data Exposure", description: "Prevent leaking PII in agent outputs", severity: "critical", enabled: true },
      { id: "cb-4", name: "Misinformation Guard", description: "Flag and prevent generation of verifiably false claims", severity: "high", enabled: true },
    ],
  },
  {
    name: "Bias Detection",
    icon: Scale,
    rules: [
      { id: "bd-1", name: "Demographic Fairness", description: "Ensure equal treatment across demographic groups", severity: "critical", enabled: true },
      { id: "bd-2", name: "Representation Balance", description: "Monitor output diversity and representation metrics", severity: "high", enabled: true },
      { id: "bd-3", name: "Stereotyping Prevention", description: "Detect and block stereotypical associations in outputs", severity: "high", enabled: true },
      { id: "bd-4", name: "Language Neutrality", description: "Use inclusive and neutral language in all responses", severity: "medium", enabled: true },
    ],
  },
  {
    name: "Transparency Requirements",
    icon: Eye,
    rules: [
      { id: "tr-1", name: "AI Disclosure", description: "Agents must identify themselves as AI when asked", severity: "critical", enabled: true },
      { id: "tr-2", name: "Reasoning Provision", description: "Provide clear reasoning for decisions and recommendations", severity: "high", enabled: true },
      { id: "tr-3", name: "Source Citation", description: "Cite sources when making factual claims", severity: "medium", enabled: true },
      { id: "tr-4", name: "Confidence Indication", description: "Indicate confidence levels for uncertain outputs", severity: "medium", enabled: false },
    ],
  },
  {
    name: "Fairness Constraints",
    icon: Users,
    rules: [
      { id: "fc-1", name: "Equal Treatment", description: "Apply consistent standards regardless of user attributes", severity: "critical", enabled: true },
      { id: "fc-2", name: "Protected Attribute Handling", description: "Never use protected attributes for differential treatment", severity: "critical", enabled: true },
      { id: "fc-3", name: "Outcome Equity", description: "Monitor and ensure equitable outcomes across user groups", severity: "high", enabled: true },
    ],
  },
];

interface RegulationDetail {
  id: string;
  name: string;
  fullName: string;
  description: string;
  category: "privacy" | "financial" | "safety" | "quality" | "security" | "industry_specific";
  jurisdictions: string[];
  departments?: string[];
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    severity: "critical" | "high" | "medium" | "low";
    category: string;
  }>;
  policyDomains: string[];
}

const REGULATION_DATABASE: Record<string, RegulationDetail> = {
  "HIPAA": {
    id: "hipaa",
    name: "HIPAA",
    fullName: "Health Insurance Portability and Accountability Act",
    description: "Federal law establishing national standards for the protection of individually identifiable health information (PHI) in electronic, paper, and oral forms.",
    category: "privacy",
    jurisdictions: ["US"],
    requirements: [
      { id: "hipaa-1", title: "PHI Access Controls", description: "Implement technical safeguards to control access to electronic protected health information (ePHI) including unique user identification and automatic logoff", severity: "critical", category: "Access Control" },
      { id: "hipaa-2", title: "Audit Controls", description: "Implement hardware, software, and procedural mechanisms that record and examine activity in information systems containing ePHI", severity: "critical", category: "Audit" },
      { id: "hipaa-3", title: "Transmission Security", description: "Implement technical security measures to guard against unauthorized access to ePHI being transmitted over electronic communications networks", severity: "high", category: "Encryption" },
      { id: "hipaa-4", title: "Breach Notification", description: "Provide notification following a breach of unsecured PHI to affected individuals, HHS, and in certain cases, the media", severity: "critical", category: "Incident Response" },
      { id: "hipaa-5", title: "Minimum Necessary Standard", description: "Limit PHI disclosures to the minimum amount necessary to accomplish the intended purpose of the use or disclosure", severity: "high", category: "Data Minimization" },
    ],
    policyDomains: ["data_handling", "logging", "tool_permissions"],
    departments: ["Clinical Operations", "IT & Health Informatics", "Finance & Billing", "Human Resources", "Legal & Compliance"],
  },
  "HITECH": {
    id: "hitech",
    name: "HITECH",
    fullName: "Health Information Technology for Economic and Clinical Health Act",
    description: "Strengthens HIPAA enforcement, extends breach notification requirements, and promotes adoption of health information technology.",
    category: "privacy",
    jurisdictions: ["US"],
    requirements: [
      { id: "hitech-1", title: "Enhanced Penalty Structure", description: "Ensure compliance with tiered civil penalty structure for HIPAA violations based on level of negligence", severity: "critical", category: "Compliance" },
      { id: "hitech-2", title: "Business Associate Requirements", description: "Apply HIPAA security and privacy requirements directly to business associates handling PHI", severity: "high", category: "Third Party" },
      { id: "hitech-3", title: "Breach Notification Timelines", description: "Notify individuals of breaches within 60 days and report to HHS annually or immediately for breaches affecting 500+ individuals", severity: "critical", category: "Incident Response" },
      { id: "hitech-4", title: "Accounting of Disclosures", description: "Provide individuals with an accounting of disclosures of their PHI made through electronic health records", severity: "medium", category: "Transparency" },
    ],
    policyDomains: ["data_handling", "logging"],
    departments: ["IT & Health Informatics", "Clinical Operations", "Legal & Compliance"],
  },
  "GDPR": {
    id: "gdpr",
    name: "GDPR",
    fullName: "General Data Protection Regulation",
    description: "EU regulation on data protection and privacy establishing comprehensive rights for data subjects and obligations for data controllers and processors.",
    category: "privacy",
    jurisdictions: ["EU"],
    requirements: [
      { id: "gdpr-1", title: "Lawful Basis for Processing", description: "Establish and document a lawful basis (consent, contract, legal obligation, vital interests, public task, or legitimate interests) for all personal data processing", severity: "critical", category: "Legal Basis" },
      { id: "gdpr-2", title: "Data Subject Rights", description: "Implement mechanisms for data subjects to exercise rights including access, rectification, erasure, portability, and objection to processing", severity: "critical", category: "Rights Management" },
      { id: "gdpr-3", title: "Data Protection Impact Assessment", description: "Conduct DPIAs for processing operations likely to result in high risk to the rights and freedoms of natural persons", severity: "high", category: "Risk Assessment" },
      { id: "gdpr-4", title: "Data Breach Notification", description: "Notify the supervisory authority within 72 hours of becoming aware of a personal data breach and affected data subjects without undue delay", severity: "critical", category: "Incident Response" },
      { id: "gdpr-5", title: "Cross-Border Transfer Safeguards", description: "Ensure appropriate safeguards for international transfers of personal data including adequacy decisions, SCCs, or BCRs", severity: "high", category: "Data Transfer" },
      { id: "gdpr-6", title: "Privacy by Design", description: "Implement appropriate technical and organizational measures to integrate data protection into processing activities from the design stage", severity: "high", category: "Architecture" },
    ],
    policyDomains: ["data_handling", "allowed_actions", "logging"],
  },
  "SOX": {
    id: "sox",
    name: "SOX",
    fullName: "Sarbanes-Oxley Act",
    description: "Federal law mandating financial reporting accuracy, internal controls, and corporate accountability for publicly traded companies.",
    category: "financial",
    jurisdictions: ["US"],
    requirements: [
      { id: "sox-1", title: "Internal Controls over Financial Reporting", description: "Establish and maintain adequate internal controls over financial reporting and assess their effectiveness annually", severity: "critical", category: "Internal Controls" },
      { id: "sox-2", title: "Segregation of Duties", description: "Enforce separation of duties for financial transaction creation, approval, and execution to prevent fraud", severity: "critical", category: "Access Control" },
      { id: "sox-3", title: "Audit Trail Integrity", description: "Maintain immutable audit trails for all financial data modifications with complete attribution and timestamp verification", severity: "high", category: "Audit" },
      { id: "sox-4", title: "Management Assessment", description: "Management must assess and report on the effectiveness of internal controls over financial reporting", severity: "high", category: "Governance" },
      { id: "sox-5", title: "Record Retention", description: "Retain all audit and review workpapers, financial records, and communications for a minimum of 7 years", severity: "high", category: "Records Management" },
    ],
    policyDomains: ["data_handling", "tool_permissions", "logging"],
    departments: ["Finance & Accounting", "Legal & Compliance", "Treasury"],
  },
  "Basel III": {
    id: "basel-iii",
    name: "Basel III",
    fullName: "Basel III: International Regulatory Framework for Banks",
    description: "International regulatory framework strengthening bank capital requirements, stress testing, and market liquidity risk management.",
    category: "financial",
    jurisdictions: ["US"],
    requirements: [
      { id: "basel-1", title: "Capital Adequacy Monitoring", description: "Continuously monitor and report Common Equity Tier 1 (CET1), Tier 1, and Total Capital ratios against minimum thresholds", severity: "critical", category: "Capital" },
      { id: "basel-2", title: "Liquidity Coverage Ratio", description: "Maintain sufficient high-quality liquid assets to cover total net cash outflows over a 30-day stress scenario", severity: "critical", category: "Liquidity" },
      { id: "basel-3", title: "Risk-Weighted Asset Calculation", description: "Accurately calculate risk-weighted assets for credit, market, and operational risk using standardized or internal models", severity: "high", category: "Risk Management" },
      { id: "basel-4", title: "Leverage Ratio Compliance", description: "Maintain a minimum leverage ratio of 3% as a non-risk-based backstop to the risk-based capital framework", severity: "high", category: "Capital" },
      { id: "basel-5", title: "Stress Testing Framework", description: "Conduct regular stress tests to evaluate capital adequacy under adverse economic scenarios", severity: "high", category: "Stress Testing" },
    ],
    policyDomains: ["data_handling", "logging", "allowed_actions"],
    departments: ["Risk Management", "Treasury", "Compliance"],
  },
  "PCI DSS": {
    id: "pci-dss",
    name: "PCI DSS",
    fullName: "Payment Card Industry Data Security Standard",
    description: "Information security standard for organizations handling branded credit cards to reduce fraud through enhanced controls around cardholder data.",
    category: "security",
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
    requirements: [
      { id: "pci-1", title: "Cardholder Data Encryption", description: "Encrypt transmission of cardholder data across open public networks and protect stored cardholder data using strong cryptography", severity: "critical", category: "Encryption" },
      { id: "pci-2", title: "Access Control Measures", description: "Restrict access to cardholder data to authorized personnel only with unique IDs assigned to each person with computer access", severity: "critical", category: "Access Control" },
      { id: "pci-3", title: "Network Security", description: "Install and maintain a firewall configuration and do not use vendor-supplied defaults for system passwords and security parameters", severity: "high", category: "Network" },
      { id: "pci-4", title: "Vulnerability Management", description: "Maintain a vulnerability management program including regular system updates and anti-virus software deployment", severity: "high", category: "Security" },
      { id: "pci-5", title: "Monitoring and Testing", description: "Track and monitor all access to network resources and cardholder data and regularly test security systems and processes", severity: "high", category: "Monitoring" },
    ],
    policyDomains: ["data_handling", "tool_permissions", "logging"],
    departments: ["E-Commerce", "Finance & Accounting", "IT & Digital"],
  },
  "FDA AI/ML Guidance": {
    id: "fda-aiml",
    name: "FDA AI/ML Guidance",
    fullName: "FDA Artificial Intelligence/Machine Learning Action Plan",
    description: "Regulatory framework for AI/ML-based Software as a Medical Device (SaMD) ensuring safety, effectiveness, and continuous learning.",
    category: "safety",
    jurisdictions: ["US"],
    requirements: [
      { id: "fda-1", title: "Good Machine Learning Practice", description: "Follow GMLP principles including multi-disciplinary expertise, representative data, independent datasets, and reference standards", severity: "critical", category: "Development" },
      { id: "fda-2", title: "Predetermined Change Control Plan", description: "Establish a plan describing types of anticipated modifications and methodology for implementing changes in a controlled manner", severity: "critical", category: "Change Management" },
      { id: "fda-3", title: "Real-World Performance Monitoring", description: "Continuously monitor AI/ML device performance in real-world conditions and report any adverse events or malfunctions", severity: "high", category: "Monitoring" },
      { id: "fda-4", title: "Algorithm Transparency", description: "Provide clear documentation of algorithm design, training data characteristics, and performance metrics for regulatory review", severity: "high", category: "Transparency" },
      { id: "fda-5", title: "Clinical Validation", description: "Demonstrate clinical validity through appropriate clinical studies or real-world evidence before and after deployment", severity: "critical", category: "Validation" },
    ],
    policyDomains: ["allowed_actions", "content_boundaries", "logging"],
    departments: ["Clinical Operations", "Research & Development", "Quality & Safety", "Pharmacy"],
  },
  "21 CFR Part 11": {
    id: "21cfr11",
    name: "21 CFR Part 11",
    fullName: "21 CFR Part 11 - Electronic Records; Electronic Signatures",
    description: "FDA regulation establishing criteria for acceptance of electronic records and electronic signatures as equivalent to paper records and handwritten signatures.",
    category: "quality",
    jurisdictions: ["US", "Global"],
    requirements: [
      { id: "cfr-1", title: "Electronic Signature Validation", description: "Ensure electronic signatures are unique to one individual, verified before use, and cannot be reused or reassigned", severity: "critical", category: "Authentication" },
      { id: "cfr-2", title: "Audit Trail Requirements", description: "Generate secure, computer-generated, time-stamped audit trails that record the date, time, and operator identity for all record changes", severity: "critical", category: "Audit" },
      { id: "cfr-3", title: "System Validation", description: "Validate computerized systems to ensure accuracy, reliability, consistent intended performance, and ability to discern invalid records", severity: "high", category: "Validation" },
      { id: "cfr-4", title: "Record Protection", description: "Protect electronic records to enable accurate and ready retrieval throughout the record retention period", severity: "high", category: "Records Management" },
    ],
    policyDomains: ["logging", "data_handling", "tool_permissions"],
    departments: ["Research & Development", "Quality & Safety", "Pharmacy", "IT & Health Informatics"],
  },
  "GxP": {
    id: "gxp",
    name: "GxP",
    fullName: "Good Practice Regulations (GMP, GLP, GCP, GDP)",
    description: "Collection of quality guidelines and regulations covering manufacturing, laboratory, clinical, and distribution practices in regulated industries.",
    category: "quality",
    jurisdictions: ["US", "EU", "Global"],
    requirements: [
      { id: "gxp-1", title: "Documentation and Record Keeping", description: "Maintain comprehensive documentation for all processes including batch records, SOPs, and change control documentation", severity: "critical", category: "Documentation" },
      { id: "gxp-2", title: "Qualification and Validation", description: "Qualify equipment and validate processes, methods, and computer systems before use in regulated activities", severity: "critical", category: "Validation" },
      { id: "gxp-3", title: "Training and Competency", description: "Ensure all personnel are adequately trained and qualified for their assigned responsibilities", severity: "high", category: "Personnel" },
      { id: "gxp-4", title: "Change Control Procedures", description: "Implement formal change control procedures for all changes that may affect product quality or data integrity", severity: "high", category: "Change Management" },
      { id: "gxp-5", title: "Deviation and CAPA Management", description: "Investigate all deviations from approved procedures and implement corrective and preventive actions", severity: "high", category: "Quality" },
    ],
    policyDomains: ["logging", "allowed_actions", "data_handling"],
    departments: ["Research & Development", "Pharmacy", "Quality & Safety", "Supply Chain"],
  },
  "EU AI Act": {
    id: "eu-ai-act",
    name: "EU AI Act",
    fullName: "European Union Artificial Intelligence Act",
    description: "Comprehensive EU regulation establishing a risk-based framework for AI systems with requirements for transparency, human oversight, and safety.",
    category: "safety",
    jurisdictions: ["EU"],
    requirements: [
      { id: "euai-1", title: "Risk Classification", description: "Classify AI systems according to risk levels (unacceptable, high, limited, minimal) and apply corresponding requirements", severity: "critical", category: "Risk Assessment" },
      { id: "euai-2", title: "High-Risk System Requirements", description: "Implement risk management, data governance, technical documentation, transparency, human oversight, and accuracy requirements for high-risk AI", severity: "critical", category: "Compliance" },
      { id: "euai-3", title: "Transparency Obligations", description: "Ensure AI systems interacting with persons disclose their artificial nature and provide meaningful information about decision-making", severity: "high", category: "Transparency" },
      { id: "euai-4", title: "Human Oversight Mechanisms", description: "Design high-risk AI systems with appropriate human-machine interface tools enabling effective oversight by natural persons", severity: "critical", category: "Governance" },
      { id: "euai-5", title: "Conformity Assessment", description: "Conduct conformity assessments before placing high-risk AI systems on the market or putting them into service", severity: "high", category: "Certification" },
      { id: "euai-6", title: "Post-Market Monitoring", description: "Establish a post-market monitoring system proportionate to the nature and risks of the AI system", severity: "high", category: "Monitoring" },
    ],
    policyDomains: ["content_boundaries", "allowed_actions", "logging", "tool_permissions"],
    departments: ["IT & Operations", "Compliance", "Risk Management", "Legal"],
  },
  "MiFID II": {
    id: "mifid-ii",
    name: "MiFID II",
    fullName: "Markets in Financial Instruments Directive II",
    description: "EU legislative framework regulating financial markets and improving investor protection through enhanced transparency and conduct requirements.",
    category: "financial",
    jurisdictions: ["EU"],
    requirements: [
      { id: "mifid-1", title: "Best Execution Obligation", description: "Take all sufficient steps to obtain the best possible result for clients when executing orders considering price, costs, speed, and likelihood of execution", severity: "critical", category: "Trading" },
      { id: "mifid-2", title: "Client Suitability Assessment", description: "Assess suitability of investment services and financial instruments for clients based on their knowledge, experience, financial situation, and objectives", severity: "critical", category: "Client Protection" },
      { id: "mifid-3", title: "Transaction Reporting", description: "Report complete and accurate details of transactions to competent authorities as quickly as possible and no later than the close of the following working day", severity: "high", category: "Reporting" },
      { id: "mifid-4", title: "Pre- and Post-Trade Transparency", description: "Provide pre-trade and post-trade transparency for equity and non-equity instruments as required by regulation", severity: "high", category: "Transparency" },
      { id: "mifid-5", title: "Record Keeping Requirements", description: "Maintain records of all services, activities, and transactions sufficient to enable regulatory supervision for a minimum of 5 years", severity: "high", category: "Records Management" },
    ],
    policyDomains: ["logging", "allowed_actions", "data_handling"],
    departments: ["Trading", "Compliance", "Client Services"],
  },
  "PSD2": {
    id: "psd2",
    name: "PSD2",
    fullName: "Payment Services Directive 2",
    description: "EU directive regulating payment services and payment service providers, introducing strong customer authentication and open banking requirements.",
    category: "financial",
    jurisdictions: ["EU"],
    requirements: [
      { id: "psd2-1", title: "Strong Customer Authentication", description: "Apply strong customer authentication using two or more independent elements (knowledge, possession, inherence) for electronic payment transactions", severity: "critical", category: "Authentication" },
      { id: "psd2-2", title: "Secure Communication Standards", description: "Ensure secure communication channels for payment initiation and account information services using qualified certificates", severity: "critical", category: "Security" },
      { id: "psd2-3", title: "Third-Party Provider Access", description: "Provide regulated third-party payment service providers with access to payment accounts through secure APIs", severity: "high", category: "Open Banking" },
      { id: "psd2-4", title: "Fraud Monitoring", description: "Implement transaction monitoring mechanisms to detect unauthorized or fraudulent payment transactions in real time", severity: "high", category: "Fraud Prevention" },
    ],
    policyDomains: ["tool_permissions", "data_handling", "logging"],
    departments: ["Client Services", "IT & Operations"],
  },
  "ISO 9001": {
    id: "iso-9001",
    name: "ISO 9001",
    fullName: "ISO 9001:2015 Quality Management Systems",
    description: "International standard specifying requirements for a quality management system focusing on customer satisfaction, process approach, and continual improvement.",
    category: "quality",
    jurisdictions: ["Global"],
    requirements: [
      { id: "iso9-1", title: "Process Approach", description: "Establish, implement, maintain, and continually improve a QMS using a process approach including the PDCA cycle and risk-based thinking", severity: "high", category: "Process Management" },
      { id: "iso9-2", title: "Documented Information Control", description: "Maintain documented information required by the QMS including creation, updating, and control of documents and records", severity: "high", category: "Documentation" },
      { id: "iso9-3", title: "Nonconformity and Corrective Action", description: "React to nonconformities, evaluate the need for action to eliminate root causes, implement corrective actions, and review effectiveness", severity: "high", category: "Quality" },
      { id: "iso9-4", title: "Internal Audit Program", description: "Conduct internal audits at planned intervals to verify QMS conformity and effective implementation", severity: "medium", category: "Audit" },
      { id: "iso9-5", title: "Management Review", description: "Conduct management reviews at planned intervals to ensure continuing suitability, adequacy, effectiveness, and alignment with strategic direction", severity: "medium", category: "Governance" },
    ],
    policyDomains: ["logging", "allowed_actions"],
    departments: ["Quality Assurance", "Production", "Engineering"],
  },
  "ISO 27001": {
    id: "iso-27001",
    name: "ISO 27001",
    fullName: "ISO/IEC 27001:2022 Information Security Management",
    description: "International standard for establishing, implementing, maintaining, and continually improving an information security management system (ISMS).",
    category: "security",
    jurisdictions: ["Global"],
    requirements: [
      { id: "iso27-1", title: "Information Security Risk Assessment", description: "Define and apply a risk assessment process that identifies risks to confidentiality, integrity, and availability of information", severity: "critical", category: "Risk Management" },
      { id: "iso27-2", title: "Access Control Policy", description: "Establish, document, and review access control policies based on business and information security requirements", severity: "critical", category: "Access Control" },
      { id: "iso27-3", title: "Incident Management Process", description: "Establish responsibilities and procedures for managing information security incidents including reporting and response", severity: "high", category: "Incident Response" },
      { id: "iso27-4", title: "Asset Management", description: "Identify organizational assets and define appropriate protection responsibilities throughout their lifecycle", severity: "high", category: "Asset Management" },
      { id: "iso27-5", title: "Cryptographic Controls", description: "Develop and implement a policy on the use of cryptographic controls for protection of information", severity: "high", category: "Encryption" },
    ],
    policyDomains: ["data_handling", "tool_permissions", "logging"],
    departments: ["IT & Automation", "Finance & Accounting", "Legal & Compliance"],
  },
  "REACH": {
    id: "reach",
    name: "REACH",
    fullName: "Registration, Evaluation, Authorisation and Restriction of Chemicals",
    description: "EU regulation addressing the production and use of chemical substances and their potential impacts on human health and the environment.",
    category: "industry_specific",
    jurisdictions: ["EU"],
    requirements: [
      { id: "reach-1", title: "Substance Registration", description: "Register all chemical substances manufactured or imported in quantities of one tonne or more per year with ECHA", severity: "critical", category: "Registration" },
      { id: "reach-2", title: "Safety Data Sheet Management", description: "Provide and maintain up-to-date safety data sheets for all hazardous substances throughout the supply chain", severity: "high", category: "Documentation" },
      { id: "reach-3", title: "SVHC Notification", description: "Notify ECHA of Substances of Very High Concern present in articles above concentration and tonnage thresholds", severity: "high", category: "Compliance" },
      { id: "reach-4", title: "Supply Chain Communication", description: "Communicate risk management measures and substance information up and down the supply chain", severity: "medium", category: "Communication" },
    ],
    policyDomains: ["data_handling", "allowed_actions"],
    departments: ["Supply Chain & Logistics", "Engineering", "Legal & Compliance"],
  },
  "RoHS": {
    id: "rohs",
    name: "RoHS",
    fullName: "Restriction of Hazardous Substances Directive",
    description: "EU directive restricting the use of specific hazardous materials found in electrical and electronic products to protect human health and the environment.",
    category: "industry_specific",
    jurisdictions: ["EU"],
    requirements: [
      { id: "rohs-1", title: "Restricted Substance Compliance", description: "Ensure electrical and electronic equipment does not contain lead, mercury, cadmium, hexavalent chromium, PBBs, or PBDEs above maximum concentration values", severity: "critical", category: "Material Compliance" },
      { id: "rohs-2", title: "Technical Documentation", description: "Maintain technical documentation demonstrating conformity for at least 10 years after the product has been placed on the market", severity: "high", category: "Documentation" },
      { id: "rohs-3", title: "CE Marking and Declaration", description: "Affix CE marking and draw up EU declaration of conformity for compliant electrical and electronic equipment", severity: "high", category: "Certification" },
      { id: "rohs-4", title: "Supply Chain Due Diligence", description: "Verify compliance of components and materials from suppliers through testing, certificates of compliance, or supplier declarations", severity: "medium", category: "Supply Chain" },
    ],
    policyDomains: ["data_handling", "allowed_actions"],
    departments: ["Supply Chain & Logistics", "Engineering", "Legal & Compliance"],
  },
  "ITAR": {
    id: "itar",
    name: "ITAR",
    fullName: "International Traffic in Arms Regulations",
    description: "US regulation controlling the export and import of defense-related articles and services on the US Munitions List to safeguard national security.",
    category: "security",
    jurisdictions: ["US"],
    requirements: [
      { id: "itar-1", title: "Export License Compliance", description: "Obtain proper export licenses or authorizations before exporting or transferring defense articles, services, or technical data", severity: "critical", category: "Export Control" },
      { id: "itar-2", title: "Access Restriction to US Persons", description: "Restrict access to ITAR-controlled technical data and defense articles to US persons only unless authorized", severity: "critical", category: "Access Control" },
      { id: "itar-3", title: "Registration Requirements", description: "Register with the Directorate of Defense Trade Controls (DDTC) as a manufacturer or exporter of defense articles or services", severity: "high", category: "Registration" },
      { id: "itar-4", title: "Record Keeping", description: "Maintain records of all ITAR-related transactions, licenses, and technical data transfers for a minimum of 5 years", severity: "high", category: "Records Management" },
      { id: "itar-5", title: "Violation Reporting", description: "Report known or suspected ITAR violations to DDTC including unauthorized exports or disclosures of technical data", severity: "critical", category: "Compliance" },
    ],
    policyDomains: ["tool_permissions", "data_handling", "logging"],
    departments: ["Supply Chain & Logistics", "Engineering", "Legal & Compliance"],
  },
  "CCPA/CPRA": {
    id: "ccpa-cpra",
    name: "CCPA/CPRA",
    fullName: "California Consumer Privacy Act / California Privacy Rights Act",
    description: "California state laws granting consumers rights over their personal information and imposing obligations on businesses that collect consumer data.",
    category: "privacy",
    jurisdictions: ["US"],
    requirements: [
      { id: "ccpa-1", title: "Right to Know", description: "Provide consumers the right to know what personal information is collected, used, shared, or sold and for what purposes", severity: "critical", category: "Transparency" },
      { id: "ccpa-2", title: "Right to Delete", description: "Honor consumer requests to delete personal information collected from them, with specified exceptions", severity: "critical", category: "Rights Management" },
      { id: "ccpa-3", title: "Right to Opt-Out", description: "Provide consumers the right to opt-out of the sale or sharing of their personal information", severity: "high", category: "Consent" },
      { id: "ccpa-4", title: "Data Minimization", description: "Limit collection and use of personal information to what is reasonably necessary and proportionate for the disclosed purposes", severity: "high", category: "Data Minimization" },
      { id: "ccpa-5", title: "Privacy Notice Requirements", description: "Provide clear and conspicuous privacy notices at or before the point of collection describing data practices", severity: "high", category: "Transparency" },
    ],
    policyDomains: ["data_handling", "allowed_actions", "content_boundaries"],
    departments: ["Marketing & Advertising", "E-Commerce", "Customer Service", "IT & Digital"],
  },
  "FTC Guidelines": {
    id: "ftc-guidelines",
    name: "FTC Guidelines",
    fullName: "Federal Trade Commission Consumer Protection Guidelines",
    description: "FTC regulations and guidelines governing unfair or deceptive business practices, advertising standards, and consumer data protection.",
    category: "industry_specific",
    jurisdictions: ["US"],
    requirements: [
      { id: "ftc-1", title: "Truth in Advertising", description: "Ensure all advertising and marketing claims are truthful, not misleading, and substantiated with evidence before dissemination", severity: "critical", category: "Advertising" },
      { id: "ftc-2", title: "Endorsement Disclosures", description: "Clearly disclose material connections between endorsers and the company in all endorsement and testimonial content", severity: "high", category: "Transparency" },
      { id: "ftc-3", title: "AI Transparency", description: "Disclose when AI is used in consumer-facing decisions and ensure AI-driven recommendations do not constitute unfair or deceptive practices", severity: "high", category: "AI Governance" },
      { id: "ftc-4", title: "Data Security Standards", description: "Implement reasonable security measures to protect consumer personal information from unauthorized access or disclosure", severity: "high", category: "Security" },
    ],
    policyDomains: ["content_boundaries", "allowed_actions"],
    departments: ["Marketing & Advertising", "Merchandising", "Legal & Compliance"],
  },
  "ADA Compliance": {
    id: "ada-compliance",
    name: "ADA Compliance",
    fullName: "Americans with Disabilities Act - Digital Accessibility",
    description: "Requirements for ensuring digital services and AI-powered interactions are accessible to individuals with disabilities under ADA Title III.",
    category: "industry_specific",
    jurisdictions: ["US"],
    requirements: [
      { id: "ada-1", title: "WCAG 2.1 Conformance", description: "Ensure all digital content and interfaces meet WCAG 2.1 Level AA success criteria for perceivable, operable, understandable, and robust content", severity: "critical", category: "Accessibility" },
      { id: "ada-2", title: "Alternative Text and Descriptions", description: "Provide text alternatives for non-text content and audio descriptions for multimedia content", severity: "high", category: "Content" },
      { id: "ada-3", title: "Keyboard Navigation", description: "Ensure all functionality is operable through a keyboard interface without requiring specific timings for individual keystrokes", severity: "high", category: "Interaction" },
      { id: "ada-4", title: "Assistive Technology Compatibility", description: "Ensure AI-driven interfaces are compatible with screen readers, voice control, and other assistive technologies", severity: "high", category: "Compatibility" },
    ],
    policyDomains: ["content_boundaries", "allowed_actions"],
    departments: ["E-Commerce", "Customer Service", "IT & Digital"],
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  privacy: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  financial: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  safety: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  quality: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  security: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  industry_specific: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export default function Governance() {
  const { industry, workspaceConfig, activeFrameworks, activeDepartments } = useIndustry();
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [auditObjectFilter, setAuditObjectFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>(null);
  const [auditDateFilter, setAuditDateFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [ethicalBoundaries, setEthicalBoundaries] = useState(initialEthicalBoundaries);
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [exportBundleOpen, setExportBundleOpen] = useState(false);
  const [exportType, setExportType] = useState("all_events");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportIncludeHashes, setExportIncludeHashes] = useState(false);
  const [exportObjectFilter, setExportObjectFilter] = useState("all");
  const [exportRedactionProfile, setExportRedactionProfile] = useState("none");
  const [selectedRegulationId, setSelectedRegulationId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [enhancedRegulations, setEnhancedRegulations] = useState<Record<string, any>>({});
  const [generatingPoliciesFor, setGeneratingPoliciesFor] = useState<string | null>(null);
  const { toast } = useToast();
  const evidenceDrawer = useEvidenceDrawer();
  const policyPerm = usePermission("create_modify_policies");

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: integrityCheck, refetch: refetchIntegrity } = useQuery<{
    valid: boolean;
    totalEvents: number;
    verifiedEvents: number;
    brokenAt?: number;
  }>({
    queryKey: ["/api/audit-events", "verify-integrity"],
  });
  const { data: complianceReports } = useQuery<ComplianceReport[]>({
    queryKey: ["/api/compliance-reports"],
  });
  const { data: policyExceptions } = useQuery<PolicyException[]>({
    queryKey: ["/api/policy-exceptions"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setCreateOpen(false);
      toast({ title: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const [activatedPacks, setActivatedPacks] = useState<Set<string>>(new Set());
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const selectedPack = selectedPackId ? POLICY_PACKS.find((p) => p.id === selectedPackId) || null : null;

  const [enhancedPackRules, setEnhancedPackRules] = useState<Record<string, Record<number, Record<string, unknown>>>>(() => {
    try {
      const stored = localStorage.getItem("almp-enhanced-pack-rules");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  function persistEnhancedRules(packId: string, policyIdx: number, rules: Record<string, unknown>) {
    setEnhancedPackRules((prev) => {
      const next = { ...prev, [packId]: { ...prev[packId], [policyIdx]: rules } };
      localStorage.setItem("almp-enhanced-pack-rules", JSON.stringify(next));
      return next;
    });
  }

  function getPackWithEnhancements(pack: PolicyPack): PolicyPack {
    const enhancements = enhancedPackRules[pack.id];
    if (!enhancements) return pack;
    return {
      ...pack,
      policies: pack.policies.map((p, idx) => ({
        ...p,
        policyJson: enhancements[idx] || p.policyJson,
      })),
    };
  }

  const activatePackMutation = useMutation({
    mutationFn: async (pack: PolicyPack) => {
      const policyList = pack.policies.map((p) => ({
        name: `[${pack.framework}] ${p.name}`,
        domain: p.domain,
        description: p.description,
        policyJson: p.policyJson,
        scopeType: "org",
        status: "active",
      }));
      const res = await apiRequest("POST", "/api/policies/bulk-create", { policies: policyList });
      return res.json();
    },
    onSuccess: (_data, pack) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setActivatedPacks((prev) => new Set(prev).add(pack.id));
      toast({ title: `${pack.name} activated`, description: `${pack.policies.length} policies created` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to activate policy pack", description: err.message, variant: "destructive" });
    },
  });

  const createExceptionMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policy-exceptions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-exceptions"] });
      setExceptionOpen(false);
      toast({ title: "Exception request submitted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create exception", description: err.message, variant: "destructive" });
    },
  });

  const updateExceptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/policy-exceptions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-exceptions"] });
      toast({ title: "Exception updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update exception", description: err.message, variant: "destructive" });
    },
  });

  const enhanceRegulationMutation = useMutation({
    mutationFn: async (regulation: RegulationDetail) => {
      const res = await apiRequest("POST", "/api/ai/enhance-regulation", {
        regulationName: regulation.name,
        industry: industry?.id,
        jurisdictions: workspaceConfig.jurisdictions,
        requirements: regulation.requirements,
      });
      return res.json();
    },
    onSuccess: (data, regulation) => {
      setEnhancedRegulations((prev) => ({ ...prev, [regulation.id]: data }));
      toast({ title: "Regulation enhanced", description: `AI analysis complete for ${regulation.name}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to enhance regulation", description: err.message, variant: "destructive" });
    },
  });

  const generateRegulationPoliciesMutation = useMutation({
    mutationFn: async (regulation: RegulationDetail) => {
      setGeneratingPoliciesFor(regulation.id);
      const res = await apiRequest("POST", "/api/ai/generate-regulation-policies", {
        regulationName: regulation.name,
        fullName: regulation.fullName,
        category: regulation.category,
        requirements: regulation.requirements,
        policyDomains: regulation.policyDomains,
        industry: industry?.id,
        jurisdictions: workspaceConfig.jurisdictions,
      });
      const data = await res.json();
      const policyList = (data.policies || []).map((p: any) => ({
        name: `[${regulation.name}] ${p.name}`,
        domain: p.domain || regulation.policyDomains[0] || "data_handling",
        description: p.description,
        policyJson: p.policyJson || p.rules || {},
        scopeType: "org",
        status: "active",
      }));
      const bulkRes = await apiRequest("POST", "/api/policies/bulk-create", { policies: policyList });
      return bulkRes.json();
    },
    onSuccess: (_data, regulation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setGeneratingPoliciesFor(null);
      toast({ title: "Compliance policies created", description: `Policies generated for ${regulation.name}` });
    },
    onError: (err: Error) => {
      setGeneratingPoliciesFor(null);
      toast({ title: "Failed to generate policies", description: err.message, variant: "destructive" });
    },
  });

  const detectedRegulations = useMemo(() => {
    return activeFrameworks
      .map((fw) => REGULATION_DATABASE[fw])
      .filter(Boolean) as RegulationDetail[];
  }, [activeFrameworks]);

  const filteredRegulations = useMemo(() => {
    if (!deptFilter) return detectedRegulations;
    return detectedRegulations.filter(
      (reg) => !reg.departments || reg.departments.length === 0 || reg.departments.includes(deptFilter)
    );
  }, [detectedRegulations, deptFilter]);

  const regulationSummary = useMemo(() => {
    const totalReqs = detectedRegulations.reduce((sum, r) => sum + r.requirements.length, 0);
    const allDomains = new Set(detectedRegulations.flatMap((r) => r.policyDomains));
    const coveredDomains = new Set(
      (policies || []).map((p) => p.domain).filter(Boolean)
    );
    const uncoveredDomains = Array.from(allDomains).filter((d) => !coveredDomains.has(d));
    return { totalRegs: detectedRegulations.length, totalReqs, allDomains: Array.from(allDomains), coveredDomains: Array.from(coveredDomains), uncoveredDomains };
  }, [detectedRegulations, policies]);

  const filtered = useMemo(() => {
    let result = policies || [];
    if (search) {
      result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (domainFilter !== "all") {
      result = result.filter((p) => p.domain === domainFilter);
    }
    return result;
  }, [policies, search, domainFilter]);

  const domainGroups = useMemo(() => {
    const groups: Record<string, Policy[]> = {};
    const domainOrder = ["data_handling", "tool_permissions", "logging", "allowed_actions", "content_boundaries"];
    domainOrder.forEach(d => { groups[d] = []; });
    filtered?.forEach((p) => {
      const domain = p.domain || "data_handling";
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(p);
    });
    return Object.entries(groups).filter(([_, policies]) => policies.length > 0);
  }, [filtered]);

  const domainLabels: Record<string, string> = {
    data_handling: "Data Handling",
    tool_permissions: "Tool Permissions",
    logging: "Logging & Redaction",
    allowed_actions: "Allowed Actions",
    content_boundaries: "Regulated Content Boundaries",
  };

  const violationCount = useMemo(() => {
    if (!auditEvents) return 0;
    return auditEvents.filter((e) => {
      const a = e.action.toLowerCase();
      return a.includes("violation") || a.includes("blocked");
    }).length;
  }, [auditEvents]);

  const approvalCompliance = useMemo(() => {
    if (!approvals) return 0;
    const decided = approvals.filter((a) => a.status === "approved" || a.status === "rejected");
    if (decided.length === 0) return 100;
    const approved = decided.filter((a) => a.status === "approved").length;
    return Math.round((approved / decided.length) * 100);
  }, [approvals]);

  const actionTypes = useMemo(() => {
    if (!auditEvents) return [];
    const counts: Record<string, number> = {};
    auditEvents.forEach((e) => {
      counts[e.action] = (counts[e.action] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([action]) => action);
  }, [auditEvents]);

  const filteredAuditEvents = useMemo(() => {
    if (!auditEvents) return [];
    let events = [...auditEvents];

    if (auditObjectFilter) {
      const q = auditObjectFilter.toLowerCase();
      events = events.filter(
        (e) =>
          (e.objectType && e.objectType.toLowerCase().includes(q)) ||
          (e.objectId && e.objectId.toLowerCase().includes(q))
      );
    }

    if (auditActionFilter) {
      events = events.filter((e) => e.action === auditActionFilter);
    }

    if (auditDateFilter !== "all") {
      const now = new Date();
      events = events.filter((e) => {
        if (!e.createdAt) return false;
        const eventDate = new Date(e.createdAt);
        if (auditDateFilter === "today") {
          return (
            eventDate.getFullYear() === now.getFullYear() &&
            eventDate.getMonth() === now.getMonth() &&
            eventDate.getDate() === now.getDate()
          );
        }
        if (auditDateFilter === "7days") {
          const diff = now.getTime() - eventDate.getTime();
          return diff <= 7 * 24 * 60 * 60 * 1000;
        }
        if (auditDateFilter === "30days") {
          const diff = now.getTime() - eventDate.getTime();
          return diff <= 30 * 24 * 60 * 60 * 1000;
        }
        return true;
      });
    }

    return events;
  }, [auditEvents, auditObjectFilter, auditActionFilter, auditDateFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (auditObjectFilter) count++;
    if (auditActionFilter) count++;
    if (auditDateFilter !== "all") count++;
    return count;
  }, [auditObjectFilter, auditActionFilter, auditDateFilter]);

  const enforcementData = useMemo(() => {
    if (!policies || !auditEvents) return [];
    return policies.map((policy) => {
      const matchCount = auditEvents.filter((e) => {
        const detailsMatch = e.details && e.details.toLowerCase().includes(policy.id.toLowerCase());
        const objectMatch = e.objectId && e.objectId.toLowerCase() === policy.id.toLowerCase();
        const nameMatch = e.action.toLowerCase().includes(policy.name.toLowerCase());
        const domainMatch = e.objectType === "policy";
        return detailsMatch || objectMatch || nameMatch || domainMatch;
      }).length;
      return { policy, matchCount };
    });
  }, [policies, auditEvents]);

  const maxEnforcement = useMemo(() => {
    return Math.max(1, ...enforcementData.map((d) => d.matchCount));
  }, [enforcementData]);

  const complianceStats = useMemo(() => {
    if (!complianceReports) return { total: 0, avgScore: 0, frameworks: 0, issueFindings: 0 };
    const total = complianceReports.length;
    const avgScore = total > 0 ? Math.round(complianceReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / total) : 0;
    const frameworks = new Set(complianceReports.map((r) => r.framework)).size;
    let issueFindings = 0;
    complianceReports.forEach((r) => {
      const findings = r.findings as Array<{ status: string }> | null;
      if (findings) {
        issueFindings += findings.filter((f) => f.status === "warning" || f.status === "fail").length;
      }
    });
    return { total, avgScore, frameworks, issueFindings };
  }, [complianceReports]);

  const exceptionStats = useMemo(() => {
    if (!policyExceptions) return { total: 0, pending: 0, approved: 0, expired: 0 };
    const total = policyExceptions.length;
    const pending = policyExceptions.filter((e) => e.status === "pending").length;
    const approved = policyExceptions.filter((e) => e.status === "approved").length;
    const expired = policyExceptions.filter((e) => {
      if (e.status !== "approved") return false;
      if (!e.expiresAt) return false;
      return new Date(e.expiresAt) < new Date();
    }).length;
    return { total, pending, approved, expired };
  }, [policyExceptions]);

  const policyMap = useMemo(() => {
    const map: Record<string, string> = {};
    policies?.forEach((p) => { map[p.id] = p.name; });
    return map;
  }, [policies]);

  const agentMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents?.forEach((a) => { map[a.id] = a.name; });
    return map;
  }, [agents]);

  const agentsByTier = useMemo(() => {
    const grouped: Record<string, Agent[]> = { open: [], standard: [], restricted: [], critical: [] };
    agents?.forEach((a) => {
      const tier = (a.toolAccessClass || "standard").toLowerCase();
      if (grouped[tier]) grouped[tier].push(a);
      else grouped.standard.push(a);
    });
    return grouped;
  }, [agents]);

  const ethicalSummary = useMemo(() => {
    let total = 0;
    let enabled = 0;
    ethicalBoundaries.forEach((cat) => {
      cat.rules.forEach((r) => {
        total++;
        if (r.enabled) enabled++;
      });
    });
    return { total, enabled, disabled: total - enabled, coverage: total > 0 ? Math.round((enabled / total) * 100) : 0 };
  }, [ethicalBoundaries]);

  const toggleEthicalRule = (categoryIndex: number, ruleId: string) => {
    setEthicalBoundaries((prev) =>
      prev.map((cat, ci) => {
        if (ci !== categoryIndex) return cat;
        return {
          ...cat,
          rules: cat.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
        };
      })
    );
  };

  const handleExportCsv = () => {
    const headers = ["Date", "Action", "Actor Type", "Actor ID", "Object Type", "Object ID", "Details"];
    const rows = filteredAuditEvents.map((e) => [
      e.createdAt ? new Date(e.createdAt).toISOString() : "",
      e.action,
      e.actorType,
      e.actorId || "",
      e.objectType,
      e.objectId || "",
      (e.details || "").replace(/"/g, '""'),
    ]);
    const csvString = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-events.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTimeRemaining = (expiresAt: string | Date) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const activePolicies = policies?.filter((p) => p.status === "active")?.length || 0;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-governance">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
          <p className="text-sm text-muted-foreground">
            Policy-as-code, compliance controls, and audit trail
          </p>
        </div>
        {!policyPerm.allowed ? (
          <Button disabled title="You do not have permission to create policies" data-testid="button-create-policy">
            <Plus className="w-4 h-4 mr-1.5" /> New Policy
          </Button>
        ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-policy">
              <Plus className="w-4 h-4 mr-1.5" /> New Policy
              {policyPerm.permission.access === "conditional" && policyPerm.permission.annotation && (
                <Badge variant="secondary" className="text-[10px] ml-1">{policyPerm.permission.annotation}</Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Policy</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  name: fd.get("name") as string,
                  domain: fd.get("domain") as string,
                  description: fd.get("description") as string,
                  scopeType: fd.get("scopeType") as string,
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label>Policy Name</Label>
                <Input name="name" required placeholder="e.g., No PII in Response" data-testid="input-policy-name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea name="description" placeholder="What does this policy enforce?" data-testid="input-policy-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Domain</Label>
                  <select name="domain" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="data_handling">
                    <option value="data_handling">Data Handling</option>
                    <option value="tool_permissions">Tool Permissions</option>
                    <option value="logging">Logging/Redaction</option>
                    <option value="allowed_actions">Allowed Actions</option>
                    <option value="content_boundaries">Content Boundaries</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Scope</Label>
                  <select name="scopeType" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="org">
                    <option value="org">Organization</option>
                    <option value="outcome">Outcome</option>
                    <option value="agent">Agent</option>
                    <option value="env">Environment</option>
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-policy">
                {createMutation.isPending ? "Creating..." : "Create Policy"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Policies" value={activePolicies} icon={Shield} variant="default" testId="stat-active-policies" />
        <StatCard title="Audit Events" value={auditEvents?.length || 0} icon={Eye} variant="default" testId="stat-audit-events" />
        <StatCard title="Policy Violations" value={violationCount} icon={AlertTriangle} variant={violationCount > 0 ? "danger" : "default"} testId="stat-violations" />
        <StatCard title="Approval Compliance" value={`${approvalCompliance}%`} icon={CheckCircle} variant="success" testId="stat-compliance" />
      </div>

      <Tabs defaultValue="policies" className="flex flex-col gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="policies" data-testid="tab-policies">Policy Library</TabsTrigger>
          <TabsTrigger value="enforcement" data-testid="tab-enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance Reports</TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">Policy Exceptions</TabsTrigger>
          <TabsTrigger value="tool-access" data-testid="tab-tool-access">Tool Access</TabsTrigger>
          <TabsTrigger value="ethics" data-testid="tab-ethics">Ethical Boundaries</TabsTrigger>
          <TabsTrigger value="policy-packs" data-testid="tab-policy-packs">Policy Packs</TabsTrigger>
          <TabsTrigger value="what-if" data-testid="tab-what-if">What-If Analysis</TabsTrigger>
          <TabsTrigger value="regulatory" data-testid="tab-regulatory">Regulatory Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-0 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search policies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-policies"
              />
            </div>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[220px]" data-testid="select-domain-filter">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                <SelectItem value="data_handling">Data Handling</SelectItem>
                <SelectItem value="tool_permissions">Tool Permissions</SelectItem>
                <SelectItem value="logging">Logging & Redaction</SelectItem>
                <SelectItem value="allowed_actions">Allowed Actions</SelectItem>
                <SelectItem value="content_boundaries">Content Boundaries</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {domainGroups.map(([domain, domainPolicies]) => {
            const DomainIcon = domainIcons[domain] || Shield;
            return (
              <div key={domain} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <DomainIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{domainLabels[domain] || domain.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-[10px]">{(domainPolicies as Policy[]).length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(domainPolicies as Policy[]).map((policy) => {
                    const DIcon = domainIcons[policy.domain] || Shield;
                    return (
                      <Card key={policy.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedPolicyId(policy.id)} data-testid={`card-policy-${policy.id}`}>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                <DIcon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-semibold truncate">{policy.name}</span>
                                <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")} | v{policy.version}</span>
                              </div>
                            </div>
                            <StatusBadge status={policy.status} />
                          </div>
                          {policy.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{policy.description}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{policy.scopeType}</Badge>
                            {(policy as any).versionHistory && Array.isArray((policy as any).versionHistory) && (
                              <Badge variant="secondary" className="text-[10px]">{((policy as any).versionHistory as any[]).length} prior versions</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto" data-testid={`text-policy-date-${policy.id}`}>
                              {(() => {
                                const vh = (policy as any).versionHistory;
                                if (vh && Array.isArray(vh) && vh.length > 0) {
                                  const last = vh[vh.length - 1];
                                  return `Updated ${last.changedAt ? new Date(last.changedAt).toLocaleDateString() : "N/A"}`;
                                }
                                return policy.createdAt ? `Created ${new Date(policy.createdAt).toLocaleDateString()}` : "";
                              })()}
                            </span>
                          </div>
                          {(policy as any).versionHistory && Array.isArray((policy as any).versionHistory) && ((policy as any).versionHistory as any[]).length > 0 && (
                            <div className="flex flex-col gap-1">
                              <button
                                className="text-[11px] text-muted-foreground underline cursor-pointer text-left"
                                onClick={() => setExpandedVersions(prev => ({...prev, [policy.id]: !prev[policy.id]}))}
                                data-testid={`button-version-history-${policy.id}`}
                              >
                                {expandedVersions[policy.id] ? "Hide version history" : `Show ${((policy as any).versionHistory as any[]).length} prior versions`}
                              </button>
                              {expandedVersions[policy.id] && (
                                <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted mt-1">
                                  {((policy as any).versionHistory as any[]).map((vh: any, i: number) => (
                                    <div key={i} className="text-[11px] text-muted-foreground">
                                      <span className="font-medium">v{vh.version}</span> - {vh.changedBy || "system"} - {vh.changedAt ? new Date(vh.changedAt).toLocaleDateString() : "N/A"}
                                      {vh.summary && <span className="ml-1">({vh.summary})</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Shield className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policies found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="enforcement" className="mt-0 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Per-Policy Enforcement Statistics</span>
          </div>

          <div className="flex flex-col gap-3">
            {enforcementData.map(({ policy, matchCount }) => {
              const DomainIcon = domainIcons[policy.domain] || Shield;
              const barWidth = maxEnforcement > 0 ? (matchCount / maxEnforcement) * 100 : 0;
              return (
                <Card key={policy.id} className="hover-elevate" data-testid={`enforcement-card-${policy.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <DomainIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold truncate">{policy.name}</span>
                          <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">hard_block</Badge>
                        <StatusBadge status={policy.status} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Enforcement events</span>
                        <span className="text-xs font-medium">{matchCount}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-blue-500 dark:bg-blue-400 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {enforcementData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <BarChart2 className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No enforcement data available</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-0 flex flex-col gap-4">
          {integrityCheck && (
            <Card data-testid="card-integrity-status">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {integrityCheck.valid ? (
                      <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold" data-testid="text-integrity-status">
                        {integrityCheck.valid ? "Chain Verified" : "Chain Broken"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {integrityCheck.totalEvents} total events, {integrityCheck.verifiedEvents} verified
                      </span>
                      {auditEvents && auditEvents.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {auditEvents[0]?.eventHash && (
                            <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-first-hash">
                              First: {auditEvents[0].eventHash.slice(0, 12)}
                            </span>
                          )}
                          {auditEvents[auditEvents.length - 1]?.eventHash && (
                            <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-last-hash">
                              Last: {auditEvents[auditEvents.length - 1].eventHash?.slice(0, 12)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchIntegrity()}
                    data-testid="button-verify-now"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Verify Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-active-filters">
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-export-csv">
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
              <Dialog open={exportBundleOpen} onOpenChange={setExportBundleOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-bundle">
                    <Layers className="w-4 h-4 mr-1.5" /> Export Bundle
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Export Audit Bundle</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Export Type</Label>
                      <Select value={exportType} onValueChange={setExportType}>
                        <SelectTrigger data-testid="select-export-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_events">All Events</SelectItem>
                          <SelectItem value="runs">All Runs for Time Window</SelectItem>
                          <SelectItem value="approvals">All Approvals</SelectItem>
                          <SelectItem value="policy_changes">All Policy Changes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} data-testid="input-export-start" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>End Date</Label>
                        <Input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} data-testid="input-export-end" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Object Filter</Label>
                      <Select value={exportObjectFilter} onValueChange={setExportObjectFilter}>
                        <SelectTrigger data-testid="select-export-object">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Objects</SelectItem>
                          <SelectItem value="agent">Agents Only</SelectItem>
                          <SelectItem value="policy">Policies Only</SelectItem>
                          <SelectItem value="deployment">Deployments Only</SelectItem>
                          <SelectItem value="approval">Approvals Only</SelectItem>
                          <SelectItem value="blueprint">Blueprints Only</SelectItem>
                          <SelectItem value="outcome">Outcomes Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Redaction Profile</Label>
                      <Select value={exportRedactionProfile} onValueChange={setExportRedactionProfile}>
                        <SelectTrigger data-testid="select-export-redaction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Redaction</SelectItem>
                          <SelectItem value="pii">Redact PII (names, emails, IDs)</SelectItem>
                          <SelectItem value="financial">Redact Financial Data</SelectItem>
                          <SelectItem value="full">Full Redaction (PII + Financial + Secrets)</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground">
                        {exportRedactionProfile === "none" && "Raw data, no fields redacted"}
                        {exportRedactionProfile === "pii" && "Actor IDs, user names, and email addresses will be masked"}
                        {exportRedactionProfile === "financial" && "Cost, revenue, and billing fields will be masked"}
                        {exportRedactionProfile === "full" && "All PII, financial data, and secret references will be masked"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={exportIncludeHashes} onCheckedChange={setExportIncludeHashes} data-testid="switch-include-hashes" />
                      <Label className="text-sm">Include cryptographic integrity (hash chain)</Label>
                    </div>
                    <Button
                      onClick={async () => {
                        const params = new URLSearchParams();
                        params.set("type", exportType);
                        if (exportStartDate) params.set("startDate", exportStartDate);
                        if (exportEndDate) params.set("endDate", exportEndDate);
                        if (exportIncludeHashes) params.set("includeHashes", "true");
                        if (exportObjectFilter !== "all") params.set("objectFilter", exportObjectFilter);
                        if (exportRedactionProfile !== "none") params.set("redaction", exportRedactionProfile);
                        params.set("format", "bundle");
                        try {
                          const res = await fetch(`/api/audit-events/export-bundle?${params.toString()}`);
                          const bundle = await res.json();

                          const jsonContent = JSON.stringify(bundle.json || bundle, null, 2);

                          const csvHeaders = bundle.csvHeaders || ["Date", "Action", "ActorType", "ActorID", "ObjectType", "ObjectID", "Details"];
                          const csvRows = (bundle.csvRows || (bundle.json?.records || bundle.records || []).map((r: any) => [
                            r.createdAt || r.startedAt || "",
                            r.action || r.status || "",
                            r.actorType || "",
                            r.actorId || "",
                            r.objectType || "",
                            r.objectId || r.id || "",
                            (r.details || "").replace(/"/g, '""'),
                          ]));
                          const csvContent = [
                            csvHeaders.join(","),
                            ...csvRows.map((row: any[]) => row.map((v: any) => `"${v}"`).join(",")),
                          ].join("\n");

                          const manifest = {
                            exportedAt: bundle.exportedAt || new Date().toISOString(),
                            exportType,
                            objectFilter: exportObjectFilter,
                            redactionProfile: exportRedactionProfile,
                            timeWindow: bundle.timeWindow || bundle.json?.timeWindow,
                            totalRecords: bundle.totalRecords || bundle.json?.totalRecords || 0,
                            integrityInfo: bundle.integrityInfo || bundle.json?.integrityInfo || null,
                            files: ["audit-data.json", "audit-data.csv", "manifest.json"],
                            signature: exportIncludeHashes ? (bundle.integrityInfo?.lastHash || bundle.json?.integrityInfo?.lastHash || "unsigned") : "unsigned",
                          };

                          const bundleDate = new Date().toISOString().split("T")[0];

                          const jsonBlob = new Blob([jsonContent], { type: "application/json" });
                          const jsonUrl = URL.createObjectURL(jsonBlob);
                          const jsonLink = document.createElement("a");
                          jsonLink.href = jsonUrl;
                          jsonLink.download = `audit-bundle-${bundleDate}.json`;
                          document.body.appendChild(jsonLink);
                          jsonLink.click();
                          document.body.removeChild(jsonLink);
                          URL.revokeObjectURL(jsonUrl);

                          const csvBlob = new Blob([csvContent], { type: "text/csv" });
                          const csvUrl = URL.createObjectURL(csvBlob);
                          const csvLink = document.createElement("a");
                          csvLink.href = csvUrl;
                          csvLink.download = `audit-bundle-${bundleDate}.csv`;
                          document.body.appendChild(csvLink);
                          csvLink.click();
                          document.body.removeChild(csvLink);
                          URL.revokeObjectURL(csvUrl);

                          const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
                          const manifestUrl = URL.createObjectURL(manifestBlob);
                          const manifestLink = document.createElement("a");
                          manifestLink.href = manifestUrl;
                          manifestLink.download = `audit-manifest-${bundleDate}.json`;
                          document.body.appendChild(manifestLink);
                          manifestLink.click();
                          document.body.removeChild(manifestLink);
                          URL.revokeObjectURL(manifestUrl);

                          setExportBundleOpen(false);
                          toast({ title: "Bundle exported", description: `${manifest.totalRecords} records exported as JSON + CSV + signed manifest` });
                        } catch (err) {
                          toast({ title: "Export failed", variant: "destructive" });
                        }
                      }}
                      data-testid="button-download-bundle"
                    >
                      <Download className="w-4 h-4 mr-1.5" /> Download Bundle
                    </Button>
                    <span className="text-[10px] text-muted-foreground text-center">
                      Downloads 3 files: JSON data, CSV spreadsheet, and signed manifest
                    </span>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="relative max-w-xs flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by object..."
                value={auditObjectFilter}
                onChange={(e) => setAuditObjectFilter(e.target.value)}
                className="pl-9"
                data-testid="input-filter-audit-object"
              />
            </div>
            <Select value={auditDateFilter} onValueChange={setAuditDateFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-audit-date">
                <Calendar className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-date-all">All Time</SelectItem>
                <SelectItem value="today" data-testid="select-date-today">Today</SelectItem>
                <SelectItem value="7days" data-testid="select-date-7days">Last 7 Days</SelectItem>
                <SelectItem value="30days" data-testid="select-date-30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {actionTypes.map((action) => (
              <Badge
                key={action}
                variant={auditActionFilter === action ? "default" : "outline"}
                className={`cursor-pointer text-[11px] toggle-elevate ${auditActionFilter === action ? "toggle-elevated" : ""}`}
                onClick={() => setAuditActionFilter(auditActionFilter === action ? null : action)}
                data-testid={`filter-action-${action}`}
              >
                {action}
              </Badge>
            ))}
          </div>

          <Card>
            <CardContent className="p-4">
              {filteredAuditEvents.length > 0 ? (
                <div className="flex flex-col">
                  {filteredAuditEvents.map((event, index) => {
                    const isLast = index === filteredAuditEvents.length - 1;
                    const isExpanded = expandedEvent === event.id;
                    return (
                      <div
                        key={event.id}
                        className="flex gap-3"
                        data-testid={`audit-event-${event.id}`}
                      >
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getEventDotColor(event.action)}`} />
                          {!isLast && <div className="flex-1 border-l border-border ml-px mt-1" />}
                        </div>
                        <div
                          className="flex flex-col gap-1 pb-4 min-w-0 flex-1 cursor-pointer hover-elevate rounded-md p-2 -ml-1"
                          onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium">{event.action}</span>
                              {event.eventHash && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Lock className="w-3 h-3 text-muted-foreground cursor-help" data-testid={`icon-hash-${event.id}`} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span className="font-mono text-xs">{event.eventHash.slice(0, 8)}</span>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {event.actorType}:{event.actorId} on {event.objectType}:{event.objectId}
                          </span>
                          {event.details && !isExpanded && (
                            <p className="text-[11px] text-muted-foreground/70 truncate">
                              {event.details.length > 100 ? event.details.slice(0, 100) + "..." : event.details}
                            </p>
                          )}
                          {event.details && isExpanded && (
                            <div className="flex flex-col gap-2 mt-1">
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                {event.details}
                              </p>
                              <div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    evidenceDrawer.open({
                                      type: "audit",
                                      title: event.action,
                                      subtitle: `${event.objectType}:${event.objectId}`,
                                      audit: {
                                        eventId: event.id,
                                        eventType: event.action,
                                        actor: `${event.actorType}:${event.actorId}`,
                                        timestamp: event.createdAt ? new Date(event.createdAt).toISOString() : "",
                                        description: event.details || undefined,
                                        hashChain: event.eventHash || undefined,
                                      },
                                    });
                                  }}
                                  data-testid={`button-view-audit-${event.id}`}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  View Details
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No audit events found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Reports" value={complianceStats.total} icon={FileText} variant="default" testId="stat-total-reports" />
            <StatCard title="Average Score" value={`${complianceStats.avgScore}%`} icon={Target} variant={complianceStats.avgScore >= 80 ? "success" : complianceStats.avgScore >= 60 ? "warning" : "danger"} testId="stat-avg-score" />
            <StatCard title="Frameworks Covered" value={complianceStats.frameworks} icon={Layers} variant="default" testId="stat-frameworks" />
            <StatCard title="Findings with Issues" value={complianceStats.issueFindings} icon={AlertTriangle} variant={complianceStats.issueFindings > 0 ? "warning" : "default"} testId="stat-issue-findings" />
          </div>

          <div className="flex flex-col gap-4">
            {complianceReports?.map((report) => {
              const findings = (report.findings as Array<{ control: string; title: string; status: string; evidence: string }>) || [];
              const evidencePackage = report.evidencePackage as Record<string, any> | null;
              const isExpanded = expandedFindings[report.id] || false;
              return (
                <Card key={report.id} data-testid={`card-report-${report.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium border ${frameworkColors[report.framework] || "bg-muted text-muted-foreground"}`}
                        data-testid={`badge-framework-${report.id}`}
                      >
                        {report.framework.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-sm font-semibold truncate">{report.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <StatusBadge status={report.status} />
                      <div className="flex items-center gap-1.5">
                        <div className="relative w-8 h-8">
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                            <circle
                              cx="18" cy="18" r="14" fill="none"
                              strokeWidth="3"
                              strokeDasharray={`${(report.overallScore || 0) * 0.88} 88`}
                              strokeLinecap="round"
                              className={
                                (report.overallScore || 0) >= 80
                                  ? "text-emerald-500"
                                  : (report.overallScore || 0) >= 60
                                  ? "text-amber-500"
                                  : "text-red-500"
                              }
                              stroke="currentColor"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold" data-testid={`text-score-${report.id}`}>
                            {report.overallScore || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() => setExpandedFindings((prev) => ({ ...prev, [report.id]: !prev[report.id] }))}
                      data-testid={`button-toggle-findings-${report.id}`}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      {findings.length} Findings
                    </Button>
                    {isExpanded && (
                      <div className="flex flex-col gap-2 ml-2">
                        {findings.map((finding, fi) => {
                          const evidenceKey = `${report.id}-${fi}`;
                          const showEvidence = expandedEvidence[evidenceKey] || false;
                          return (
                            <div key={fi} className="flex flex-col gap-1 p-2 rounded-md bg-muted/30" data-testid={`finding-${report.id}-${fi}`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-mono">{finding.control}</Badge>
                                  <span className="text-xs font-medium">{finding.title}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {finding.status === "pass" && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                  {finding.status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                  {finding.status === "fail" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                  <span className={`text-[11px] font-medium ${
                                    finding.status === "pass" ? "text-emerald-600 dark:text-emerald-400" :
                                    finding.status === "warning" ? "text-amber-600 dark:text-amber-400" :
                                    "text-red-600 dark:text-red-400"
                                  }`}>
                                    {finding.status}
                                  </span>
                                </div>
                              </div>
                              {finding.evidence && (
                                <div>
                                  <button
                                    className="text-[11px] text-muted-foreground underline cursor-pointer"
                                    onClick={() => setExpandedEvidence((prev) => ({ ...prev, [evidenceKey]: !prev[evidenceKey] }))}
                                    data-testid={`button-evidence-${report.id}-${fi}`}
                                  >
                                    {showEvidence ? "Hide evidence" : "Show evidence"}
                                  </button>
                                  {showEvidence && (
                                    <p className="text-[11px] text-muted-foreground mt-1">{finding.evidence}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex items-center justify-between gap-2 p-4 pt-0 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {evidencePackage && (
                        <span className="text-[11px] text-muted-foreground">
                          Evidence: {Object.keys(evidencePackage).length} items collected
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        Generated by {report.generatedBy} on {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`button-export-report-${report.id}`}>
                      <Download className="w-4 h-4 mr-1.5" /> Export Report
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {(!complianceReports || complianceReports.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No compliance reports found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="exceptions" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Exceptions" value={exceptionStats.total} icon={FileCode} variant="default" testId="stat-total-exceptions" />
            <StatCard title="Pending" value={exceptionStats.pending} icon={Clock} variant={exceptionStats.pending > 0 ? "warning" : "default"} testId="stat-pending-exceptions" />
            <StatCard title="Approved (Active)" value={exceptionStats.approved} icon={CheckCircle} variant="success" testId="stat-approved-exceptions" />
            <StatCard title="Expired" value={exceptionStats.expired} icon={AlertTriangle} variant={exceptionStats.expired > 0 ? "danger" : "default"} testId="stat-expired-exceptions" />
          </div>

          <div className="flex justify-end">
            <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-request-exception">
                  <Plus className="w-4 h-4 mr-1.5" /> Request Exception
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Policy Exception</DialogTitle>
                </DialogHeader>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    createExceptionMutation.mutate({
                      policyId: fd.get("policyId") as string,
                      agentId: (fd.get("agentId") as string) || undefined,
                      requestedBy: "current-user",
                      reason: fd.get("reason") as string,
                      justification: (fd.get("justification") as string) || undefined,
                      compensatingControls: (fd.get("compensatingControls") as string) || undefined,
                      scope: fd.get("scope") as string,
                      expiresAt: fd.get("expiresAt") ? new Date(fd.get("expiresAt") as string).toISOString() : undefined,
                    });
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label>Policy</Label>
                    <select name="policyId" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-exception-policy">
                      <option value="">Select a policy</option>
                      {policies?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Agent (optional)</Label>
                    <select name="agentId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-exception-agent">
                      <option value="">None</option>
                      {agents?.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Reason</Label>
                    <Textarea name="reason" required placeholder="Why is this exception needed?" data-testid="input-exception-reason" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Justification</Label>
                    <Textarea name="justification" placeholder="Business justification for this exception" data-testid="input-exception-justification" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Compensating Controls</Label>
                    <Textarea name="compensatingControls" placeholder="What compensating controls will be in place?" data-testid="input-exception-compensating" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Scope</Label>
                      <select name="scope" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="agent" data-testid="select-exception-scope">
                        <option value="agent">Agent</option>
                        <option value="org">Organization</option>
                        <option value="env">Environment</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Expiry Date</Label>
                      <Input type="date" name="expiresAt" data-testid="input-exception-expiry" />
                    </div>
                  </div>
                  <Button type="submit" disabled={createExceptionMutation.isPending} data-testid="button-submit-exception">
                    {createExceptionMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policyExceptions?.map((exception) => {
              const isExpired = exception.status === "approved" && exception.expiresAt && new Date(exception.expiresAt) < new Date();
              return (
                <Card key={exception.id} className="hover-elevate" data-testid={`card-exception-${exception.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className="text-sm font-semibold truncate" data-testid={`text-exception-policy-${exception.id}`}>
                          {policyMap[exception.policyId] || exception.policyId}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] capitalize">{exception.scope}</Badge>
                          {isExpired ? (
                            <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">Expired</Badge>
                          ) : (
                            <StatusBadge status={exception.status} />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        Requested by: {exception.requestedBy}
                      </span>
                      <p className="text-xs text-muted-foreground">{exception.reason}</p>
                      {exception.agentId && (
                        <span className="text-[11px] text-muted-foreground">
                          Agent: {agentMap[exception.agentId] || exception.agentId}
                        </span>
                      )}
                    </div>
                    {exception.status === "pending" && (
                      <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => updateExceptionMutation.mutate({ id: exception.id, data: { status: "approved", approvedBy: "current-user" } })}
                          disabled={updateExceptionMutation.isPending}
                          data-testid={`button-approve-${exception.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateExceptionMutation.mutate({ id: exception.id, data: { status: "rejected" } })}
                          disabled={updateExceptionMutation.isPending}
                          data-testid={`button-reject-${exception.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    {exception.status === "approved" && exception.expiresAt && (
                      <div className="flex items-center gap-1.5 pt-2 border-t flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground" data-testid={`text-expiry-${exception.id}`}>
                          {isExpired
                            ? `Expired on ${new Date(exception.expiresAt).toLocaleDateString()}`
                            : getTimeRemaining(exception.expiresAt)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(!policyExceptions || policyExceptions.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileCode className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policy exceptions found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tool-access" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {toolAccessTiers.map((tier) => {
              const tierAgents = agentsByTier[tier.tier.toLowerCase()] || [];
              return (
                <Card key={tier.tier} className="hover-elevate" data-testid={`card-tier-${tier.tier.toLowerCase()}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`text-[11px] font-semibold border ${tier.color}`} data-testid={`badge-tier-${tier.tier.toLowerCase()}`}>
                        {tier.tier}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{tierAgents.length} agents</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tier.description}</p>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Example Tools:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tier.tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-[10px]">{tool}</Badge>
                        ))}
                      </div>
                    </div>
                    {tierAgents.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t">
                        <span className="text-[11px] font-medium text-muted-foreground">Assigned Agents:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tierAgents.map((agent) => (
                            <Badge key={agent.id} variant="secondary" className="text-[10px]" data-testid={`badge-agent-tier-${agent.id}`}>
                              {agent.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-access-matrix">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Access Control Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 overflow-x-auto">
              {agents && agents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs">Tool Access</TableHead>
                      <TableHead className="text-xs">Autonomy Mode</TableHead>
                      <TableHead className="text-xs">Risk Tier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`}>
                        <TableCell className="text-xs font-medium">{agent.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border ${
                              toolAccessTiers.find((t) => t.tier.toLowerCase() === (agent.toolAccessClass || "standard").toLowerCase())?.color || ""
                            }`}
                          >
                            {(agent.toolAccessClass || "standard").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={agent.autonomyMode} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={agent.riskTier} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No agents found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ethics" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ethicalBoundaries.map((category, ci) => {
              const CategoryIcon = category.icon;
              return (
                <Card key={category.name} data-testid={`card-ethics-${ci}`}>
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <CategoryIcon className="w-4 h-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">{category.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {category.rules.map((rule) => (
                      <div key={rule.id} className="flex items-start justify-between gap-3" data-testid={`rule-${rule.id}`}>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium">{rule.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] border ${
                                rule.severity === "critical"
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                                  : rule.severity === "high"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              }`}
                            >
                              {rule.severity}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{rule.description}</p>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleEthicalRule(ci, rule.id)}
                          data-testid={`switch-${rule.id}`}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-ethics-summary">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Boundary Compliance Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Total Rules</span>
                  <span className="text-lg font-semibold" data-testid="text-total-rules">{ethicalSummary.total}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Enabled</span>
                  <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-enabled-rules">{ethicalSummary.enabled}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Disabled</span>
                  <span className="text-lg font-semibold text-muted-foreground" data-testid="text-disabled-rules">{ethicalSummary.disabled}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Coverage Score</span>
                  <span className="text-xs font-semibold" data-testid="text-coverage-score">{ethicalSummary.coverage}%</span>
                </div>
                <Progress value={ethicalSummary.coverage} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy-packs" className="mt-0 flex flex-col gap-4" data-testid="content-policy-packs">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Industry Policy Packs</h2>
            <p className="text-sm text-muted-foreground">
              Pre-configured policy bundles aligned to regulatory frameworks. Activate a pack to create all included policies at once.
            </p>
          </div>

          {industry && industry.id !== "custom" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <industry.icon className="h-4 w-4" style={{ color: industry.color }} />
                <h3 className="text-sm font-medium">Recommended for {industry.label}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {POLICY_PACKS.filter((p) => p.industry === industry.id).map((pack) => {
                  const isActivated = activatedPacks.has(pack.id);
                  const riskColors: Record<string, string> = {
                    critical: "text-red-600 dark:text-red-400",
                    high: "text-amber-600 dark:text-amber-400",
                    medium: "text-blue-600 dark:text-blue-400",
                    low: "text-green-600 dark:text-green-400",
                  };
                  return (
                    <Card key={pack.id} data-testid={`card-policy-pack-${pack.id}`}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="font-semibold text-sm">{pack.name}</h4>
                            <p className="text-xs text-muted-foreground">{pack.description}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${riskColors[pack.riskLevel]}`}>
                            {pack.riskLevel.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            {pack.framework}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{pack.policies.length} policies</span>
                        </div>
                        <div className="space-y-1.5">
                          {pack.policies.map((p, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {domainIcons[p.domain] ? (() => { const DIcon = domainIcons[p.domain]; return <DIcon className="h-3 w-3 text-muted-foreground shrink-0" />; })() : <Shield className="h-3 w-3 text-muted-foreground shrink-0" />}
                              <span>{p.name}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={isActivated || activatePackMutation.isPending}
                            onClick={() => activatePackMutation.mutate(getPackWithEnhancements(pack))}
                            data-testid={`button-activate-pack-${pack.id}`}
                          >
                            {isActivated ? (
                              <><Check className="h-3.5 w-3.5 mr-1.5" /> Activated</>
                            ) : activatePackMutation.isPending ? (
                              "Activating..."
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Activate Pack</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPackId(pack.id)}
                            data-testid={`button-view-pack-${pack.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {(!industry || industry.id === "custom") && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select an industry workspace from the header to see recommended policy packs, or browse all available packs below.
              </p>
            </div>
          )}

          <div className="space-y-3 mt-2">
            <h3 className="text-sm font-medium">All Available Packs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {POLICY_PACKS.filter((p) => !industry || industry.id === "custom" || p.industry !== industry.id).map((pack) => {
                const isActivated = activatedPacks.has(pack.id);
                const industryLabel: Record<string, string> = {
                  financial_services: "Financial Services",
                  healthcare: "Healthcare",
                  manufacturing: "Manufacturing",
                  retail: "Retail",
                };
                return (
                  <Card key={pack.id} data-testid={`card-policy-pack-${pack.id}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="space-y-1">
                        <h4 className="font-medium text-sm">{pack.name}</h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{pack.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{pack.framework}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{industryLabel[pack.industry] || pack.industry}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">{pack.policies.length} policies</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={isActivated || activatePackMutation.isPending}
                          onClick={() => activatePackMutation.mutate(getPackWithEnhancements(pack))}
                          data-testid={`button-activate-pack-${pack.id}`}
                        >
                          {isActivated ? (
                            <><Check className="h-3.5 w-3.5 mr-1.5" /> Activated</>
                          ) : (
                            "Activate"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPackId(pack.id)}
                          data-testid={`button-view-pack-all-${pack.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {selectedPack && (
            <PolicyPackDetailDialog
              pack={selectedPack}
              open={!!selectedPackId}
              onOpenChange={(open) => { if (!open) setSelectedPackId(null); }}
              isActivated={activatedPacks.has(selectedPack.id)}
              onActivate={(pack) => {
                activatePackMutation.mutate(pack);
                setSelectedPackId(null);
              }}
              activating={activatePackMutation.isPending}
              savedEnhancements={enhancedPackRules[selectedPack.id] || {}}
              onPersistEnhancement={(idx, rules) => persistEnhancedRules(selectedPack.id, idx, rules)}
            />
          )}
        </TabsContent>

        <TabsContent value="what-if" className="mt-0 flex flex-col gap-4">
          <WhatIfAnalysis policies={policies || []} />
        </TabsContent>

        <TabsContent value="regulatory" className="mt-0 flex flex-col gap-4" data-testid="content-regulatory">
          {!industry || activeFrameworks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <Shield className="w-12 h-12 text-muted-foreground" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold" data-testid="text-regulatory-empty-title">No Regulatory Frameworks Detected</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Configure your workspace industry and jurisdictions to automatically detect applicable regulatory frameworks and compliance requirements.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeDepartments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap" data-testid="dept-filter-row">
                  <span className="text-sm font-medium text-muted-foreground">Filter by Department:</span>
                  <Badge
                    variant={deptFilter === null ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setDeptFilter(null)}
                    data-testid="badge-dept-filter-all"
                  >
                    All
                  </Badge>
                  {activeDepartments.map((dept) => (
                    <Badge
                      key={dept}
                      variant={deptFilter === dept ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setDeptFilter(deptFilter === dept ? null : dept)}
                      data-testid={`badge-dept-filter-${dept.replace(/[\s\/&]/g, "-").toLowerCase()}`}
                    >
                      {dept}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRegulations.map((reg) => (
                  <Card key={reg.id} data-testid={`card-regulation-${reg.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap" data-testid={`text-regulation-name-${reg.id}`}>
                          <Shield className="w-4 h-4 shrink-0" />
                          {reg.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground truncate" data-testid={`text-regulation-fullname-${reg.id}`}>{reg.fullName}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${CATEGORY_COLORS[reg.category] || ""}`} data-testid={`badge-category-${reg.id}`}>
                        {reg.category.replace("_", " ")}
                      </Badge>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {reg.jurisdictions.map((j) => (
                          <Badge key={j} variant="outline" size="sm" data-testid={`badge-jurisdiction-${reg.id}-${j}`}>
                            <Globe className="w-3 h-3 mr-1" />
                            {j}
                          </Badge>
                        ))}
                        {reg.departments && reg.departments.length > 0 && reg.departments.map((dept) => (
                          <Badge key={dept} variant="outline" size="sm" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" data-testid={`badge-dept-${reg.id}-${dept.replace(/[\s\/&]/g, "-").toLowerCase()}`}>
                            <Building2 className="w-3 h-3 mr-1" />
                            {dept}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span data-testid={`text-req-count-${reg.id}`}>{reg.requirements.length} requirements</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setSelectedRegulationId(reg.id)} data-testid={`button-view-details-${reg.id}`}>
                          <ChevronRight className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                        <PermissionGate action="create_modify_policies">
                          <Button variant="outline" size="sm" onClick={() => enhanceRegulationMutation.mutate(reg)} disabled={enhanceRegulationMutation.isPending} data-testid={`button-ai-enhance-${reg.id}`}>
                            {enhanceRegulationMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                            AI Enhance
                          </Button>
                        </PermissionGate>
                        <PermissionGate action="create_modify_policies">
                          <Button size="sm" onClick={() => generateRegulationPoliciesMutation.mutate(reg)} disabled={generatingPoliciesFor === reg.id} data-testid={`button-generate-policies-${reg.id}`}>
                            {generatingPoliciesFor === reg.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                            Generate Policies
                          </Button>
                        </PermissionGate>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card data-testid="card-compliance-overview">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" data-testid="text-compliance-overview-title">
                    <ShieldCheck className="w-5 h-5" />
                    Compliance Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Detected Regulations</span>
                      <span className="text-2xl font-bold" data-testid="text-total-regulations">{regulationSummary.totalRegs}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Total Requirements</span>
                      <span className="text-2xl font-bold" data-testid="text-total-requirements">{regulationSummary.totalReqs}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Domain Coverage</span>
                      <span className="text-2xl font-bold" data-testid="text-domain-coverage">
                        {regulationSummary.coveredDomains.length}/{regulationSummary.allDomains.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Policy Domain Coverage</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {regulationSummary.allDomains.map((domain) => {
                        const covered = regulationSummary.coveredDomains.includes(domain);
                        return (
                          <Badge
                            key={domain}
                            variant="outline"
                            className={covered ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}
                            data-testid={`badge-domain-${domain}`}
                          >
                            {covered ? <Check className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                            {(domainLabels[domain] || domain).replace(/_/g, " ")}
                          </Badge>
                        );
                      })}
                    </div>
                    {regulationSummary.uncoveredDomains.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-uncovered-warning">
                        {regulationSummary.uncoveredDomains.length} domain(s) without active policies. Consider generating policies for full coverage.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {selectedRegulationId && (() => {
            const reg = detectedRegulations.find((r) => r.id === selectedRegulationId);
            if (!reg) return null;
            const enhanced = enhancedRegulations[reg.id];
            return (
              <Dialog open={!!selectedRegulationId} onOpenChange={(open) => { if (!open) setSelectedRegulationId(null); }}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-regulation-detail">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-dialog-regulation-name">
                      <Shield className="w-5 h-5" />
                      {reg.name}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground" data-testid="text-dialog-regulation-fullname">{reg.fullName}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={CATEGORY_COLORS[reg.category] || ""} data-testid="badge-dialog-category">
                        {reg.category.replace("_", " ")}
                      </Badge>
                      {reg.jurisdictions.map((j) => (
                        <Badge key={j} variant="outline" size="sm" data-testid={`badge-dialog-jurisdiction-${j}`}>
                          <Globe className="w-3 h-3 mr-1" />
                          {j}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm" data-testid="text-dialog-description">{reg.description}</p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <PermissionGate action="create_modify_policies">
                        <Button variant="outline" size="sm" onClick={() => enhanceRegulationMutation.mutate(reg)} disabled={enhanceRegulationMutation.isPending} data-testid="button-dialog-ai-enhance">
                          {enhanceRegulationMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          AI Enhance
                        </Button>
                      </PermissionGate>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Requirements ({reg.requirements.length})
                      </h4>
                      <div className="flex flex-col gap-2">
                        {reg.requirements.map((req) => (
                          <Card key={req.id} data-testid={`card-requirement-${req.id}`}>
                            <CardContent className="py-3 flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-medium" data-testid={`text-req-title-${req.id}`}>{req.title}</span>
                                <Badge variant="outline" size="sm" className={SEVERITY_COLORS[req.severity] || ""} data-testid={`badge-severity-${req.id}`}>
                                  {req.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground" data-testid={`text-req-desc-${req.id}`}>{req.description}</p>
                              <Badge variant="outline" size="sm" className="w-fit mt-1" data-testid={`badge-req-category-${req.id}`}>{req.category}</Badge>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {enhanced && (
                      <div className="flex flex-col gap-3" data-testid="section-enhanced-content">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          AI-Enhanced Analysis
                        </h4>
                        {enhanced.overview && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Overview</span>
                            <p className="text-sm" data-testid="text-enhanced-overview">{enhanced.overview}</p>
                          </div>
                        )}
                        {enhanced.keyRequirements && Array.isArray(enhanced.keyRequirements) && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Key Requirements</span>
                            {enhanced.keyRequirements.map((kr: any, idx: number) => (
                              <div key={idx} className="text-sm flex flex-col gap-0.5" data-testid={`text-key-req-${idx}`}>
                                <span className="font-medium">{kr.title || kr.name}</span>
                                {kr.implementationSteps && Array.isArray(kr.implementationSteps) && (
                                  <ul className="list-disc list-inside text-xs text-muted-foreground">
                                    {kr.implementationSteps.map((step: string, si: number) => (
                                      <li key={si}>{step}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {enhanced.complianceChecklist && Array.isArray(enhanced.complianceChecklist) && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Compliance Checklist</span>
                            <ul className="flex flex-col gap-1">
                              {enhanced.complianceChecklist.map((item: string, idx: number) => (
                                <li key={idx} className="text-sm flex items-center gap-2" data-testid={`text-checklist-${idx}`}>
                                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {enhanced.automationOpportunities && Array.isArray(enhanced.automationOpportunities) && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Automation Opportunities</span>
                            <ul className="flex flex-col gap-1">
                              {enhanced.automationOpportunities.map((item: string, idx: number) => (
                                <li key={idx} className="text-sm flex items-center gap-2" data-testid={`text-automation-${idx}`}>
                                  <Wand2 className="w-3 h-3 text-blue-500 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <PermissionGate action="create_modify_policies">
                      <Button className="w-full" onClick={() => generateRegulationPoliciesMutation.mutate(reg)} disabled={generatingPoliciesFor === reg.id} data-testid="button-dialog-generate-policies">
                        {generatingPoliciesFor === reg.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scale className="w-4 h-4 mr-2" />}
                        Generate Compliance Policies
                      </Button>
                    </PermissionGate>
                  </div>
                </DialogContent>
              </Dialog>
            );
          })()}
        </TabsContent>

        {selectedPolicyId && (
          <PolicyDetailDialog
            policyId={selectedPolicyId}
            open={!!selectedPolicyId}
            onOpenChange={(open) => { if (!open) setSelectedPolicyId(null); }}
          />
        )}
      </Tabs>
    </div>
  );
}

function PolicyDetailDialog({ policyId, open, onOpenChange }: { policyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { data: policy, isLoading: policyLoading } = useQuery<Policy>({
    queryKey: ['/api/policies', policyId],
    enabled: !!policyId && open,
  });
  const { data: testCases } = useQuery<PolicyTestCase[]>({
    queryKey: ['/api/policies', policyId, 'test-cases'],
    enabled: !!policyId && open,
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
  });

  const [editRules, setEditRules] = useState<Array<{ name: string; field: string; operator: string; value: string; action: string }>>([]);
  const [rulesInitialized, setRulesInitialized] = useState(false);
  const [isStructuredFormat, setIsStructuredFormat] = useState(false);
  const [structuredJsonEdit, setStructuredJsonEdit] = useState("");
  const [isEditingStructured, setIsEditingStructured] = useState(false);
  const [testRunResults, setTestRunResults] = useState<Record<string, any>>({});
  const [addTestOpen, setAddTestOpen] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestDescription, setNewTestDescription] = useState("");
  const [newTestExpected, setNewTestExpected] = useState("pass");
  const [newTestInput, setNewTestInput] = useState("{}");
  const [simAgentId, setSimAgentId] = useState("");
  const [simLimit, setSimLimit] = useState(50);
  const [simResult, setSimResult] = useState<any>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [runningAllTests, setRunningAllTests] = useState(false);

  if (policy && !rulesInitialized) {
    const pj = policy.policyJson as any;
    const rules = pj?.rules || [];
    const hasStructuredRules = rules.length > 0 && rules.some((r: any) => r.type && !r.name);
    setIsStructuredFormat(hasStructuredRules);
    if (hasStructuredRules) {
      setStructuredJsonEdit(JSON.stringify(pj, null, 2));
    } else {
      setEditRules(rules.map((r: any) => ({
        name: r.name || "",
        field: r.field || r.check || "",
        operator: r.operator || r.op || "equals",
        value: String(r.value ?? r.threshold ?? ""),
        action: r.action || "warn",
      })));
    }
    setRulesInitialized(true);
  }

  const saveRulesMutation = useMutation({
    mutationFn: async () => {
      let updatedJson;
      if (isStructuredFormat) {
        try {
          updatedJson = JSON.parse(structuredJsonEdit);
        } catch {
          throw new Error("Invalid JSON syntax");
        }
      } else {
        const pj = (policy?.policyJson as any) || {};
        updatedJson = {
          ...pj,
          rules: editRules.map((r) => ({
            name: r.name,
            field: r.field,
            operator: r.operator,
            value: r.value,
            action: r.action,
          })),
        };
      }
      const res = await apiRequest("PATCH", `/api/policies/${policyId}`, { policyJson: updatedJson });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies', policyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      setIsEditingStructured(false);
      toast({ title: "Rules saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save rules", description: err.message, variant: "destructive" });
    },
  });

  const addTestMutation = useMutation({
    mutationFn: async () => {
      let inputScenario = {};
      try { inputScenario = JSON.parse(newTestInput); } catch { inputScenario = {}; }
      const res = await apiRequest("POST", `/api/policies/${policyId}/test-cases`, {
        name: newTestName,
        description: newTestDescription,
        expectedOutcome: newTestExpected,
        inputScenario,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies', policyId, 'test-cases'] });
      setAddTestOpen(false);
      setNewTestName("");
      setNewTestDescription("");
      setNewTestExpected("pass");
      setNewTestInput("{}");
      toast({ title: "Test case added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add test case", description: err.message, variant: "destructive" });
    },
  });

  const runTestCase = async (testId: string) => {
    try {
      const res = await apiRequest("POST", `/api/policies/${policyId}/test-cases/${testId}/run`, {});
      const result = await res.json();
      setTestRunResults((prev) => ({ ...prev, [testId]: result }));
    } catch {
      toast({ title: "Failed to run test", variant: "destructive" });
    }
  };

  const runAllTests = async () => {
    if (!testCases) return;
    setRunningAllTests(true);
    for (const tc of testCases) {
      await runTestCase(tc.id);
    }
    setRunningAllTests(false);
  };

  const runSimulation = async () => {
    setSimRunning(true);
    try {
      const res = await apiRequest("POST", `/api/policies/${policyId}/simulate-traces`, {
        agentId: simAgentId || undefined,
        limit: simLimit,
      });
      const result = await res.json();
      setSimResult(result);
    } catch {
      toast({ title: "Simulation failed", variant: "destructive" });
    }
    setSimRunning(false);
  };

  const addRule = () => {
    setEditRules((prev) => [...prev, { name: "", field: "", operator: "equals", value: "", action: "warn" }]);
  };

  const removeRule = (index: number) => {
    setEditRules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, key: string, val: string) => {
    setEditRules((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: val } : r)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="dialog-policy-detail">
        {policyLoading ? (
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !policy ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Shield className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Policy not found</p>
          </div>
        ) : (
        <>
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle data-testid="text-policy-detail-name">{policy.name}</DialogTitle>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-policy-version">v{policy.version}</Badge>
            <Badge variant="outline" className="text-[10px] capitalize" data-testid="badge-policy-scope">{policy.scopeType}</Badge>
            <StatusBadge status={policy.status} />
            <Badge variant="secondary" className="text-[10px] capitalize" data-testid="badge-policy-domain">{policy.domain.replace(/_/g, " ")}</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="rules" className="mt-2">
          <TabsList data-testid="tabs-policy-detail">
            <TabsTrigger value="rules" data-testid="tab-rules">Rules</TabsTrigger>
            <TabsTrigger value="tests" data-testid="tab-tests">Unit Tests</TabsTrigger>
            <TabsTrigger value="simulate" data-testid="tab-simulate">Simulate on Traces</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4 flex flex-col gap-3">
            {isStructuredFormat ? (
              <div className="space-y-3">
                {isEditingStructured ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Advanced Rule Editor (JSON)</Label>
                    <Textarea
                      value={structuredJsonEdit}
                      onChange={(e) => setStructuredJsonEdit(e.target.value)}
                      className="font-mono text-[11px] min-h-[300px]"
                      data-testid="textarea-structured-rules"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button onClick={() => saveRulesMutation.mutate()} disabled={saveRulesMutation.isPending} data-testid="button-save-rules">
                        {saveRulesMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...</> : <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Rules</>}
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setStructuredJsonEdit(JSON.stringify(policy?.policyJson, null, 2));
                        setIsEditingStructured(false);
                      }} data-testid="button-cancel-structured-edit">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <PolicyRuleViewer rules={(policy?.policyJson as Record<string, unknown>) || {}} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <PermissionGate action="create_modify_policies">
                        <Button variant="outline" onClick={() => setIsEditingStructured(true)} data-testid="button-edit-structured-rules">
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Rules
                        </Button>
                      </PermissionGate>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {editRules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap" data-testid={`rule-row-${idx}`}>
                    <Input
                      value={rule.name}
                      onChange={(e) => updateRule(idx, "name", e.target.value)}
                      placeholder="Rule name"
                      className="flex-1 min-w-[120px]"
                      data-testid={`input-rule-name-${idx}`}
                    />
                    <Input
                      value={rule.field}
                      onChange={(e) => updateRule(idx, "field", e.target.value)}
                      placeholder="Field"
                      className="w-[120px]"
                      data-testid={`input-rule-field-${idx}`}
                    />
                    <Select value={rule.operator} onValueChange={(v) => updateRule(idx, "operator", v)}>
                      <SelectTrigger className="w-[130px]" data-testid={`select-rule-operator-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gt">gt</SelectItem>
                        <SelectItem value="lt">lt</SelectItem>
                        <SelectItem value="equals">equals</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="not_contains">not_contains</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={rule.value}
                      onChange={(e) => updateRule(idx, "value", e.target.value)}
                      placeholder="Value"
                      className="w-[100px]"
                      data-testid={`input-rule-value-${idx}`}
                    />
                    <Select value={rule.action} onValueChange={(v) => updateRule(idx, "action", v)}>
                      <SelectTrigger className="w-[120px]" data-testid={`select-rule-action-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="block">block</SelectItem>
                        <SelectItem value="hard_block">hard_block</SelectItem>
                        <SelectItem value="warn">warn</SelectItem>
                        <SelectItem value="log">log</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => removeRule(idx)} data-testid={`button-remove-rule-${idx}`}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" onClick={addRule} data-testid="button-add-rule">
                    <Plus className="w-4 h-4 mr-1" /> Add Rule
                  </Button>
                  <Button onClick={() => saveRulesMutation.mutate()} disabled={saveRulesMutation.isPending} data-testid="button-save-rules">
                    {saveRulesMutation.isPending ? "Saving..." : "Save Rules"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="tests" className="mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setAddTestOpen(!addTestOpen)} data-testid="button-toggle-add-test">
                <Plus className="w-4 h-4 mr-1" /> Add Test Case
              </Button>
              <Button variant="outline" onClick={runAllTests} disabled={runningAllTests || !testCases?.length} data-testid="button-run-all-tests">
                <Play className="w-4 h-4 mr-1" /> {runningAllTests ? "Running..." : "Run All"}
              </Button>
            </div>

            {addTestOpen && (
              <Card data-testid="card-add-test-form">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Name</Label>
                    <Input value={newTestName} onChange={(e) => setNewTestName(e.target.value)} placeholder="Test case name" data-testid="input-test-name" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Description</Label>
                    <Input value={newTestDescription} onChange={(e) => setNewTestDescription(e.target.value)} placeholder="Description" data-testid="input-test-description" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Expected Outcome</Label>
                    <Select value={newTestExpected} onValueChange={setNewTestExpected}>
                      <SelectTrigger data-testid="select-test-expected">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">pass</SelectItem>
                        <SelectItem value="block">block</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Input Scenario (JSON)</Label>
                    <Textarea value={newTestInput} onChange={(e) => setNewTestInput(e.target.value)} placeholder='{"field": "value"}' data-testid="input-test-scenario" />
                  </div>
                  <Button onClick={() => addTestMutation.mutate()} disabled={addTestMutation.isPending} data-testid="button-submit-test">
                    {addTestMutation.isPending ? "Adding..." : "Add Test Case"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Table data-testid="table-test-cases">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases?.map((tc) => {
                  const result = testRunResults[tc.id];
                  return (
                    <TableRow key={tc.id} data-testid={`row-test-${tc.id}`}>
                      <TableCell className="text-sm" data-testid={`text-test-name-${tc.id}`}>{tc.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]" data-testid={`badge-test-expected-${tc.id}`}>{tc.expectedOutcome}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tc.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-test-lastrun-${tc.id}`}>
                        {tc.lastRunAt ? new Date(tc.lastRunAt).toLocaleDateString() : "Never"}
                      </TableCell>
                      <TableCell>
                        {result && (
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${result.status === "passed" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}`}
                              data-testid={`badge-test-result-${tc.id}`}
                            >
                              {result.status}
                            </Badge>
                            {result.ruleResults?.filter((r: any) => r.triggered).length > 0 && (
                              <span className="text-[10px] text-muted-foreground" data-testid={`text-triggered-rules-${tc.id}`}>
                                {result.ruleResults.filter((r: any) => r.triggered).map((r: any) => r.rule).join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => runTestCase(tc.id)} data-testid={`button-run-test-${tc.id}`}>
                          <Play className="w-3.5 h-3.5 mr-1" /> Run
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {(!testCases || testCases.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-6">No test cases found</p>
            )}
          </TabsContent>

          <TabsContent value="simulate" className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Agent</Label>
                <Select value={simAgentId} onValueChange={setSimAgentId}>
                  <SelectTrigger className="w-[200px]" data-testid="select-sim-agent">
                    <SelectValue placeholder="All agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agents</SelectItem>
                    {agents?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Trace Limit</Label>
                <Input
                  type="number"
                  value={simLimit}
                  onChange={(e) => setSimLimit(Number(e.target.value) || 50)}
                  className="w-[100px]"
                  data-testid="input-sim-limit"
                />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <Label className="text-xs invisible">Run</Label>
                <Button onClick={runSimulation} disabled={simRunning} data-testid="button-run-simulation">
                  <Play className="w-4 h-4 mr-1" /> {simRunning ? "Running..." : "Run Simulation"}
                </Button>
              </div>
            </div>

            {simResult && (
              <>
                <Card data-testid="card-sim-summary">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted-foreground">Total Traces</span>
                        <span className="text-lg font-semibold" data-testid="text-sim-total">{simResult.totalTraces}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted-foreground">Blocked</span>
                        <span className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-sim-blocked">{simResult.blockedCount}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted-foreground">Passed</span>
                        <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-sim-passed">{simResult.passCount}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted-foreground">Block Rate</span>
                        <span className="text-lg font-semibold" data-testid="text-sim-rate">{simResult.blockRate}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Table data-testid="table-sim-results">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trace ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Would Block</TableHead>
                      <TableHead>Triggered Rules</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simResult.results?.map((r: any) => (
                      <TableRow key={r.traceId} data-testid={`row-sim-${r.traceId}`}>
                        <TableCell className="text-xs font-mono" data-testid={`text-sim-trace-${r.traceId}`}>
                          {r.traceId.length > 12 ? r.traceId.slice(0, 12) + "..." : r.traceId}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${r.wouldBlock ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"}`}
                            data-testid={`badge-sim-block-${r.traceId}`}
                          >
                            {r.wouldBlock ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-sim-rules-${r.traceId}`}>
                          {r.triggeredRules?.length > 0 ? r.triggeredRules.join(", ") : "None"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {!simResult && (
              <p className="text-sm text-muted-foreground text-center py-6">Run a simulation to see results</p>
            )}
          </TabsContent>
        </Tabs>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface WhatIfResult {
  affectedAgents: { id: string; name: string; currentStatus: string }[];
  tracesBlockedCount: number;
  totalTracesAnalyzed: number;
  estimatedCostImpact: number;
  riskAssessment: string;
}

function WhatIfAnalysis({ policies }: { policies: Policy[] }) {
  const [domain, setDomain] = useState("data_handling");
  const [thresholdField, setThresholdField] = useState("max_latency_ms");
  const [currentValue, setCurrentValue] = useState(5000);
  const [proposedValue, setProposedValue] = useState(3000);
  const [result, setResult] = useState<WhatIfResult | null>(null);

  const simulation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/governance/what-if", {
        policyDomain: domain,
        thresholdField,
        currentValue,
        proposedValue,
      });
      return res.json();
    },
    onSuccess: (data: WhatIfResult) => setResult(data),
  });

  const domainOptions = [
    { value: "data_handling", label: "Data Handling" },
    { value: "tool_permissions", label: "Tool Permissions" },
    { value: "logging", label: "Logging" },
    { value: "allowed_actions", label: "Allowed Actions" },
    { value: "content_boundaries", label: "Content Boundaries" },
  ];

  const thresholdOptions = [
    { value: "max_latency_ms", label: "Max Latency (ms)" },
    { value: "max_cost_per_run", label: "Max Cost per Run ($)" },
    { value: "min_success_rate", label: "Min Success Rate (%)" },
    { value: "max_error_rate", label: "Max Error Rate (%)" },
    { value: "max_drift_percent", label: "Max Drift (%)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Policy Impact Simulator</h3>
        <p className="text-xs text-muted-foreground">
          Preview the impact of policy threshold changes before enforcing them
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Policy Domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger data-testid="select-whatif-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {domainOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Threshold Field</Label>
              <Select value={thresholdField} onValueChange={setThresholdField}>
                <SelectTrigger data-testid="select-whatif-threshold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {thresholdOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Current Value</Label>
              <Input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(Number(e.target.value))}
                data-testid="input-whatif-current"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Proposed Value</Label>
              <Input
                type="number"
                value={proposedValue}
                onChange={(e) => setProposedValue(Number(e.target.value))}
                data-testid="input-whatif-proposed"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => simulation.mutate()}
              disabled={simulation.isPending}
              data-testid="button-run-simulation"
            >
              {simulation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              Run Simulation
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Analyzes historical traces and current agent configurations
            </span>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Traces Analyzed</span>
                <span className="text-lg font-semibold" data-testid="text-whatif-total-traces">
                  {result.totalTracesAnalyzed.toLocaleString()}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Would Be Blocked</span>
                <span className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-whatif-blocked">
                  {result.tracesBlockedCount.toLocaleString()}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost Impact</span>
                <span className="text-lg font-semibold text-amber-600 dark:text-amber-400" data-testid="text-whatif-cost">
                  ${result.estimatedCostImpact.toFixed(2)}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents Affected</span>
                <span className="text-lg font-semibold" data-testid="text-whatif-agents">
                  {result.affectedAgents.length}
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-sm font-medium">Risk Assessment</CardTitle>
              <Badge
                variant={result.riskAssessment === "low" ? "outline" : result.riskAssessment === "high" ? "destructive" : "secondary"}
                data-testid="badge-whatif-risk"
              >
                {result.riskAssessment} risk
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Impact Summary</span>
                <p className="text-xs text-muted-foreground">
                  Changing {thresholdField.replace(/_/g, " ")} from {currentValue} to {proposedValue} in the {domain.replace(/_/g, " ")} domain would
                  block {result.tracesBlockedCount} of {result.totalTracesAnalyzed} analyzed traces
                  ({result.totalTracesAnalyzed > 0 ? ((result.tracesBlockedCount / result.totalTracesAnalyzed) * 100).toFixed(1) : 0}%) and
                  affect {result.affectedAgents.length} agent{result.affectedAgents.length !== 1 ? "s" : ""}.
                </p>
              </div>

              {result.affectedAgents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium">Affected Agents</span>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4 px-2 py-1 border-b">
                      <span className="text-[10px] text-muted-foreground font-medium flex-1">Agent</span>
                      <span className="text-[10px] text-muted-foreground font-medium w-24">Status</span>
                    </div>
                    {result.affectedAgents.map((agent) => (
                      <div key={agent.id} className="flex items-center gap-4 px-2 py-1.5">
                        <span className="text-xs font-medium flex-1" data-testid={`text-whatif-agent-${agent.id}`}>{agent.name}</span>
                        <div className="w-24">
                          <StatusBadge status={agent.currentStatus} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function renderRuleValue(key: string, value: unknown): JSX.Element {
  if (Array.isArray(value)) {
    return (
      <div className="flex items-center gap-1 flex-wrap" data-testid={`rule-field-${key}`}>
        {value.map((item, i) => (
          <Badge key={i} variant="secondary" className="text-[10px]">
            {String(item).replace(/_/g, " ")}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-1.5 pl-3 border-l-2 border-muted" data-testid={`rule-field-${key}`}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="text-[10px] text-muted-foreground font-medium min-w-[80px] shrink-0 capitalize">{k.replace(/_/g, " ")}</span>
            {renderRuleValue(k, v)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "boolean") {
    return <Badge variant={value ? "default" : "outline"} className="text-[10px]">{value ? "Yes" : "No"}</Badge>;
  }
  if (typeof value === "number") {
    return <span className="text-xs font-mono font-medium" data-testid={`rule-field-${key}`}>{value.toLocaleString()}</span>;
  }
  return <span className="text-xs" data-testid={`rule-field-${key}`}>{String(value).replace(/_/g, " ")}</span>;
}

function PolicyRuleViewer({ rules }: { rules: Record<string, unknown> }) {
  const rulesList = (rules as { rules?: unknown[] }).rules;
  if (!rulesList || !Array.isArray(rulesList)) {
    return (
      <div className="space-y-2 bg-muted/30 rounded-md p-3">
        {Object.entries(rules).map(([key, value]) => (
          <div key={key} className="flex items-start gap-3">
            <span className="text-[11px] text-muted-foreground font-medium min-w-[90px] shrink-0 capitalize">{key.replace(/_/g, " ")}</span>
            {renderRuleValue(key, value)}
          </div>
        ))}
      </div>
    );
  }

  const ruleTypeLabels: Record<string, { label: string; color: string }> = {
    data_class_restriction: { label: "Data Classification", color: "text-purple-600 dark:text-purple-400" },
    tool_scope: { label: "Tool Access Scope", color: "text-blue-600 dark:text-blue-400" },
    audit_requirement: { label: "Audit Requirement", color: "text-amber-600 dark:text-amber-400" },
    data_minimization: { label: "Data Minimization", color: "text-teal-600 dark:text-teal-400" },
    human_in_loop: { label: "Human-in-the-Loop", color: "text-red-600 dark:text-red-400" },
    escalation: { label: "Escalation Rule", color: "text-orange-600 dark:text-orange-400" },
    pre_action_check: { label: "Pre-Action Check", color: "text-indigo-600 dark:text-indigo-400" },
    reporting_requirement: { label: "Reporting Requirement", color: "text-cyan-600 dark:text-cyan-400" },
    data_integrity: { label: "Data Integrity", color: "text-emerald-600 dark:text-emerald-400" },
    role_separation: { label: "Role Separation", color: "text-pink-600 dark:text-pink-400" },
    anomaly_detection: { label: "Anomaly Detection", color: "text-rose-600 dark:text-rose-400" },
    network_boundary: { label: "Network Boundary", color: "text-violet-600 dark:text-violet-400" },
    action_blocklist: { label: "Action Blocklist", color: "text-red-600 dark:text-red-400" },
    change_control: { label: "Change Control", color: "text-sky-600 dark:text-sky-400" },
    consent_check: { label: "Consent Check", color: "text-lime-600 dark:text-lime-400" },
    data_subject_rights: { label: "Data Subject Rights", color: "text-green-600 dark:text-green-400" },
    data_residency: { label: "Data Residency", color: "text-fuchsia-600 dark:text-fuchsia-400" },
  };

  return (
    <div className="space-y-2">
      {rulesList.map((rule, rIdx) => {
        const ruleObj = rule as Record<string, unknown>;
        const ruleType = ruleObj.type as string | undefined;
        const typeInfo = ruleType ? ruleTypeLabels[ruleType] : undefined;
        const otherFields = Object.entries(ruleObj).filter(([k]) => k !== "type");

        return (
          <div key={rIdx} className="bg-muted/30 rounded-md p-3 space-y-2" data-testid={`rule-card-${rIdx}`}>
            {ruleType && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${typeInfo?.color || ""}`}>
                  {typeInfo?.label || ruleType.replace(/_/g, " ")}
                </Badge>
              </div>
            )}
            <div className="space-y-1.5">
              {otherFields.map(([key, value]) => (
                <div key={key} className="flex items-start gap-3">
                  <span className="text-[11px] text-muted-foreground font-medium min-w-[90px] shrink-0 capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  {renderRuleValue(key, value)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PolicyPackDetailDialog({
  pack,
  open,
  onOpenChange,
  isActivated,
  onActivate,
  activating,
  savedEnhancements,
  onPersistEnhancement,
}: {
  pack: PolicyPack;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActivated: boolean;
  onActivate: (pack: PolicyPack) => void;
  activating: boolean;
  savedEnhancements: Record<number, Record<string, unknown>>;
  onPersistEnhancement: (idx: number, rules: Record<string, unknown>) => void;
}) {
  const { toast } = useToast();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editedRules, setEditedRules] = useState<Record<number, string>>({});
  const [localEnhancements, setLocalEnhancements] = useState<Record<number, Record<string, unknown>>>({});
  const [enhancingIdx, setEnhancingIdx] = useState<number | null>(null);

  const industryLabel: Record<string, string> = {
    financial_services: "Financial Services",
    healthcare: "Healthcare & Life Sciences",
    manufacturing: "Manufacturing & Supply Chain",
    retail: "Retail & E-Commerce",
  };

  function getEffectiveRules(idx: number): Record<string, unknown> {
    return localEnhancements[idx] || savedEnhancements[idx] || pack.policies[idx].policyJson;
  }

  function isEnhanced(idx: number): boolean {
    return !!localEnhancements[idx] || !!savedEnhancements[idx];
  }

  const enhanceMutation = useMutation({
    mutationFn: async ({ policy, idx }: { policy: PolicyPackPolicy; idx: number }) => {
      setEnhancingIdx(idx);
      const res = await apiRequest("POST", "/api/ai/enhance-policy-rules", {
        policyName: policy.name,
        domain: policy.domain,
        description: policy.description,
        framework: pack.framework,
        industry: industryLabel[pack.industry] || pack.industry,
        existingRules: getEffectiveRules(idx),
      });
      return { data: await res.json(), idx };
    },
    onSuccess: ({ data, idx }) => {
      const enhanced = data.enhancedRules;
      setLocalEnhancements((prev) => ({ ...prev, [idx]: enhanced }));
      onPersistEnhancement(idx, enhanced);
      setEnhancingIdx(null);
      toast({ title: "Policy rules enhanced and saved", description: "The enriched rules have been persisted" });
    },
    onError: (err: Error) => {
      setEnhancingIdx(null);
      toast({ title: "Enhancement failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSaveRules(idx: number) {
    try {
      const parsed = JSON.parse(editedRules[idx]);
      setLocalEnhancements((prev) => ({ ...prev, [idx]: parsed }));
      onPersistEnhancement(idx, parsed);
      setEditingIdx(null);
      toast({ title: "Rules saved", description: "Your changes have been persisted" });
    } catch {
      toast({ title: "Invalid JSON", description: "Please fix the JSON syntax before saving", variant: "destructive" });
    }
  }

  function handleActivateWithEnhancements() {
    const enhancedPack: PolicyPack = {
      ...pack,
      policies: pack.policies.map((p, idx) => ({
        ...p,
        policyJson: getEffectiveRules(idx),
      })),
    };
    onActivate(enhancedPack);
  }

  const hasAnyEnhancements = pack.policies.some((_, idx) => isEnhanced(idx));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>{pack.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">{pack.description}</p>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">
              <ShieldCheck className="h-3 w-3 mr-1" />
              {pack.framework}
            </Badge>
            <Badge variant="outline" className={`${
              pack.riskLevel === "critical" ? "text-red-600 dark:text-red-400" :
              pack.riskLevel === "high" ? "text-amber-600 dark:text-amber-400" :
              pack.riskLevel === "medium" ? "text-blue-600 dark:text-blue-400" :
              "text-green-600 dark:text-green-400"
            }`}>
              {pack.riskLevel.toUpperCase()} RISK
            </Badge>
            <Badge variant="outline">
              {pack.policies.length} {pack.policies.length === 1 ? "policy" : "policies"}
            </Badge>
            {hasAnyEnhancements && (
              <Badge variant="secondary" className="text-green-600 dark:text-green-400">
                <Wand2 className="h-3 w-3 mr-1" />
                Enhanced
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Included Policies</h4>
            {pack.policies.map((p, idx) => {
              const DIcon = domainIcons[p.domain] || Shield;
              const policyEnhanced = isEnhanced(idx);
              const isEditing = editingIdx === idx;
              const isEnhancing = enhancingIdx === idx;
              const currentRules = getEffectiveRules(idx);

              return (
                <Card key={idx} className={policyEnhanced ? "ring-1 ring-green-500/30" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <DIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{p.name}</span>
                      {policyEnhanced && (
                        <Badge variant="secondary" className="text-[10px] text-green-600 dark:text-green-400">
                          <Wand2 className="h-2.5 w-2.5 mr-0.5" /> AI Enhanced
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] ml-auto">{p.domain.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.description}</p>

                    {isEditing ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Advanced Rule Editor</Label>
                        <Textarea
                          value={editedRules[idx] || JSON.stringify(currentRules, null, 2)}
                          onChange={(e) => setEditedRules((prev) => ({ ...prev, [idx]: e.target.value }))}
                          className="font-mono text-[11px] min-h-[200px]"
                          data-testid={`textarea-policy-rules-${idx}`}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveRules(idx)}
                            data-testid={`button-save-rules-${idx}`}
                          >
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                            Save Rules
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingIdx(null)}
                            data-testid={`button-cancel-edit-${idx}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <PolicyRuleViewer rules={currentRules} />
                        <div className="flex items-center gap-2">
                          <PermissionGate action="create_modify_policies">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isEnhancing}
                              onClick={() => enhanceMutation.mutate({ policy: p, idx })}
                              data-testid={`button-ai-enhance-${idx}`}
                            >
                              {isEnhancing ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enhancing...</>
                              ) : (
                                <><Wand2 className="h-3.5 w-3.5 mr-1.5" /> AI Enhance</>
                              )}
                            </Button>
                          </PermissionGate>
                          <PermissionGate action="create_modify_policies">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditedRules((prev) => ({ ...prev, [idx]: JSON.stringify(currentRules, null, 2) }));
                                setEditingIdx(idx);
                              }}
                              data-testid={`button-edit-rules-${idx}`}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                              Edit
                            </Button>
                          </PermissionGate>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PermissionGate action="create_modify_policies">
            <Button
              className="w-full"
              disabled={isActivated || activating}
              onClick={handleActivateWithEnhancements}
              data-testid="button-activate-pack-dialog"
            >
              {isActivated ? (
                <><Check className="h-4 w-4 mr-2" /> Already Activated</>
              ) : activating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Activate Pack ({pack.policies.length} policies){hasAnyEnhancements ? " with Enhancements" : ""}</>
              )}
            </Button>
          </PermissionGate>
        </div>
      </DialogContent>
    </Dialog>
  );
}
