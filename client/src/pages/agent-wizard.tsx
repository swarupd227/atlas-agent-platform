import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AgentTemplate, OutcomeContract, KpiDefinition } from "@shared/schema";
import { useIndustry, type IndustryId } from "@/components/industry-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Headphones,
  FileText,
  TrendingUp,
  Shield,
  BookOpen,
  Scale,
  Bot,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Check,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
  Library,
  Loader2,
  Gauge,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  ShieldCheck,
  Info,
  FlaskConical,
  Rocket,
  RotateCcw,
  Activity,
  Bell,
  Target,
  ListChecks,
  PlugZap,
  Database,
  PhoneForwarded,
  Settings,
  Eye,
  Building2,
  X,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  CheckCircle,
  Lock,
  Square,
  CheckSquare,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  headphones: Headphones,
  "file-text": FileText,
  "trending-up": TrendingUp,
  shield: Shield,
  "book-open": BookOpen,
  scale: Scale,
  bot: Bot,
};

const STEPS = [
  { number: 0, label: "Define Agent" },
  { number: 1, label: "Start Path" },
  { number: 2, label: "Choose Blueprint" },
  { number: 3, label: "Configure Tools" },
  { number: 4, label: "Governance" },
  { number: 5, label: "Memory & Context" },
  { number: 6, label: "Eval Suite" },
  { number: 7, label: "Rollout Plan" },
  { number: 8, label: "Review & Create" },
];

interface ToolParam {
  name: string;
  description: string;
  type?: string;
  required?: boolean;
  enrichedFrom?: string;
}

interface ToolConfig {
  name: string;
  description: string;
  permissionScope?: string;
  dataClasses?: string[];
  failureModes?: string[];
  rateLimit?: string;
  costPerCall?: number;
  accessTier?: string;
  writeAccess?: boolean;
  parameters?: ToolParam[];
}

const TOOL_CATALOG: ToolConfig[] = [
  { name: "search_knowledge_base", description: "Search internal knowledge base articles", permissionScope: "READ", dataClasses: ["internal_docs"], failureModes: ["timeout", "index_unavailable"], rateLimit: "100/min", costPerCall: 0.001, accessTier: "OPEN", parameters: [{ name: "query", description: "Search query string", type: "string", required: true }, { name: "patient_mrn", description: "Patient medical record number", type: "string" }, { name: "document_type", description: "Type of document to search", type: "string" }] },
  { name: "query_database", description: "Execute read-only database queries", permissionScope: "READ", dataClasses: ["customer_data", "product_data"], failureModes: ["connection_error", "query_timeout"], rateLimit: "50/min", costPerCall: 0.002, accessTier: "STANDARD", parameters: [{ name: "sql_query", description: "SQL query to execute", type: "string", required: true }, { name: "customer_cif", description: "Customer identifier", type: "string" }, { name: "account_number", description: "Account number for lookup", type: "string" }, { name: "portfolio_id", description: "Portfolio identifier", type: "string" }] },
  { name: "send_email", description: "Send emails to customers or internal teams", permissionScope: "WRITE", dataClasses: ["contact_info", "pii"], failureModes: ["smtp_error", "rate_limit"], rateLimit: "20/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true, parameters: [{ name: "recipient", description: "Email recipient address", type: "string", required: true }, { name: "subject", description: "Email subject line", type: "string", required: true }, { name: "body", description: "Email body content", type: "string", required: true }] },
  { name: "update_crm_record", description: "Create or update CRM records", permissionScope: "WRITE", dataClasses: ["customer_data", "sales_data"], failureModes: ["api_error", "validation_error"], rateLimit: "30/min", costPerCall: 0.003, accessTier: "RESTRICTED", writeAccess: true, parameters: [{ name: "record_id", description: "CRM record identifier", type: "string", required: true }, { name: "customer_cif", description: "Customer identifier", type: "string" }, { name: "field_updates", description: "Fields to update", type: "object", required: true }] },
  { name: "create_ticket", description: "Create support tickets in ticketing system", permissionScope: "WRITE", dataClasses: ["support_data"], failureModes: ["api_error", "duplicate_detection"], rateLimit: "40/min", costPerCall: 0.002, accessTier: "STANDARD", writeAccess: true, parameters: [{ name: "title", description: "Ticket title", type: "string", required: true }, { name: "description", description: "Ticket description", type: "string", required: true }, { name: "priority", description: "Ticket priority level", type: "string" }, { name: "assignee", description: "Assigned team or person", type: "string" }] },
  { name: "web_search", description: "Search the web for current information", permissionScope: "READ", dataClasses: ["public_data"], failureModes: ["api_quota", "timeout"], rateLimit: "30/min", costPerCall: 0.01, accessTier: "OPEN", parameters: [{ name: "query", description: "Search query", type: "string", required: true }, { name: "max_results", description: "Maximum number of results", type: "number" }] },
  { name: "execute_code", description: "Execute sandboxed code for data analysis", permissionScope: "EXECUTE", dataClasses: ["computed_data"], failureModes: ["sandbox_error", "timeout", "memory_limit"], rateLimit: "10/min", costPerCall: 0.02, accessTier: "RESTRICTED", parameters: [{ name: "code", description: "Code to execute", type: "string", required: true }, { name: "language", description: "Programming language", type: "string", required: true }, { name: "timeout_ms", description: "Execution timeout in milliseconds", type: "number" }] },
  { name: "deploy_model", description: "Deploy or update ML model endpoints", permissionScope: "ADMIN", dataClasses: ["model_artifacts", "infrastructure"], failureModes: ["deployment_error", "resource_limit"], rateLimit: "5/min", costPerCall: 0.05, accessTier: "CRITICAL", writeAccess: true, parameters: [{ name: "model_id", description: "Model identifier", type: "string", required: true }, { name: "environment", description: "Target deployment environment", type: "string", required: true }, { name: "version", description: "Model version to deploy", type: "string" }] },
  { name: "process_payment", description: "Process financial transactions", permissionScope: "ADMIN", dataClasses: ["financial_data", "pii"], failureModes: ["payment_declined", "fraud_detection"], rateLimit: "10/min", costPerCall: 0.03, accessTier: "CRITICAL", writeAccess: true, parameters: [{ name: "amount", description: "Payment amount", type: "number", required: true }, { name: "currency", description: "Currency code", type: "string", required: true }, { name: "customer_cif", description: "Customer identifier", type: "string", required: true }, { name: "payment_method", description: "Payment method type", type: "string", required: true }] },
  { name: "extract_document", description: "Extract structured data from documents", permissionScope: "READ", dataClasses: ["document_data"], failureModes: ["ocr_error", "format_unsupported"], rateLimit: "20/min", costPerCall: 0.015, accessTier: "STANDARD", parameters: [{ name: "document_url", description: "URL or path to document", type: "string", required: true }, { name: "output_format", description: "Desired output format", type: "string" }, { name: "fields", description: "Specific fields to extract", type: "string[]" }] },
];

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  config?: {
    prompt?: string;
    model?: string;
    temperature?: number;
    maxRetries?: number;
    timeoutMs?: number;
    costBudget?: number;
    logLevel?: string;
    redactFields?: string[];
    fallbackModel?: string;
    targetSystem?: string;
    policyId?: string;
    escalationOwner?: string;
  };
}

interface WorkflowConnection {
  from: string;
  to: string;
  edgeType?: string;
  retries?: number;
  backoffMs?: number;
  condition?: string;
}

interface OntologyTag {
  conceptId: string;
  conceptLabel: string;
  relevanceScore?: number;
  reasoning?: string;
}

interface WizardState {
  name: string;
  description: string;
  owner: string;
  riskTier: string;
  autonomyMode: string;
  outcomeId: string;
  ontologyTags: OntologyTag[];
  department: string;
  modelProvider: string;
  modelName: string;
  maxToolIterations: number;
  toolsConfig: ToolConfig[];
  permissionsConfig: {
    dataAccess: string[];
    apiAccess: string[];
    writeAccess: string[];
  };
  memoryRagEnabled: boolean;
  memoryRagConfig: {
    vectorStore: string;
    retrievalStrategy: string;
    chunkSize: number;
    topK: number;
  };
  workflowNodes: WorkflowNode[];
  workflowConnections: WorkflowConnection[];
  policyBindings: Array<{ policyId: string; policyName: string; enforcement: string; domain?: string; description?: string }>;
  evalBindings: string[];
  rollbackPlan: string;
  guardrailsConfig: {
    policyBundleIds: string[];
    stopConditions: string[];
    escalationTriggers: string[];
    forbiddenOutputs: string[];
    allowedActions: string[];
  };
  evalSuiteConfig: {
    baselineSuiteIds: string[];
    customCases: Array<{ name: string; input: string; expectedOutput: string }>;
    pilotThreshold: number;
    prodThreshold: number;
  };
  rolloutConfig: {
    shadowModeDuration: string;
    canarySteps: number[];
    autoRollbackTriggers: string[];
    rollbackStrategy: string;
    healthCheckInterval: string;
  };
  industryId: string;
  contextBudget: Array<{ category: string; pct: number; tokens: number }>;
  memoryGovernanceRules: Array<{ rule: string; regulation: string; type: string }>;
  blueprintId: string | null;
  blueprintName: string | null;
  industryAutoApplied: boolean;
  templateSkills: {
    required: Array<{ skillId: string; skillName: string; domain: string; executionOrder: number }>;
    optional: Array<{ skillId: string; skillName: string; domain: string; executionOrder: number }>;
    selectedOptional: string[];
    templateId: string | null;
  };
}

interface DynamicPresetAdjustment {
  field: string;
  from: string;
  to: string;
  reason: string;
  source: "ontology" | "outcome";
}

interface DynamicPresetResponse {
  preset: {
    riskTier: string;
    autonomyMode: string;
    guardrailsConfig: {
      stopConditions: string[];
      escalationTriggers: string[];
      forbiddenOutputs: string[];
      allowedActions: string[];
    };
  };
  contextConfig: {
    recommendedModel: { provider: string; model: string };
    memoryGovernance: Array<{ rule: string; regulation: string; type: string }>;
    contextBudget: Array<{ category: string; pct: number; tokens: number }>;
  };
  contextPriority: string[];
  adjustments: DynamicPresetAdjustment[];
  ontologyGuardrails: Array<{ text: string; type: string; source: string; conceptLabel: string; regulation: string }>;
  isDynamic: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TemplateMatch {
  id: string;
  matchScore: number;
  reasoning: string;
}

type CreationPath = "manual" | "template" | "ai" | null;

const defaultWizardState: WizardState = {
  name: "",
  description: "",
  owner: "",
  riskTier: "MEDIUM",
  autonomyMode: "assisted",
  outcomeId: "",
  ontologyTags: [],
  department: "",
  modelProvider: "openai",
  modelName: "gpt-4.1",
  maxToolIterations: 5,
  toolsConfig: [],
  permissionsConfig: { dataAccess: [], apiAccess: [], writeAccess: [] },
  memoryRagEnabled: false,
  memoryRagConfig: {
    vectorStore: "pinecone",
    retrievalStrategy: "similarity",
    chunkSize: 512,
    topK: 5,
  },
  workflowNodes: [],
  workflowConnections: [],
  policyBindings: [],
  evalBindings: [],
  rollbackPlan: "",
  guardrailsConfig: {
    policyBundleIds: [],
    stopConditions: [],
    escalationTriggers: [],
    forbiddenOutputs: [],
    allowedActions: [],
  },
  evalSuiteConfig: {
    baselineSuiteIds: [],
    customCases: [],
    pilotThreshold: 80,
    prodThreshold: 90,
  },
  rolloutConfig: {
    shadowModeDuration: "7d",
    canarySteps: [5, 25, 50, 100],
    autoRollbackTriggers: [],
    rollbackStrategy: "immediate",
    healthCheckInterval: "5m",
  },
  industryId: "",
  contextBudget: [],
  memoryGovernanceRules: [],
  blueprintId: null,
  blueprintName: null,
  industryAutoApplied: false,
  templateSkills: {
    required: [],
    optional: [],
    selectedOptional: [],
    templateId: null,
  },
};

const INDUSTRY_PRESETS: Record<string, {
  label: string;
  riskTier: string;
  autonomyMode: string;
  stopConditions: string[];
  escalationTriggers: string[];
  forbiddenOutputs: string[];
  allowedActions: string[];
}> = {
  financial_services: {
    label: "Financial Services Defaults",
    riskTier: "HIGH",
    autonomyMode: "assisted",
    stopConditions: ["PII detected in output", "Transaction amount exceeds threshold", "Regulatory compliance check failed"],
    escalationTriggers: ["Write to production trading system", "Customer complaint escalation", "Fraud detection signal"],
    forbiddenOutputs: ["Raw account numbers", "Unmasked SSN or tax IDs", "Investment advice without disclaimers"],
    allowedActions: ["Read customer records", "Generate compliance reports", "Query market data feeds"],
  },
  healthcare: {
    label: "Healthcare Defaults",
    riskTier: "HIGH",
    autonomyMode: "manual",
    stopConditions: ["PHI detected outside secure boundary", "Clinical decision without validation", "Patient safety signal detected"],
    escalationTriggers: ["Adverse event signal", "Medication interaction warning", "Abnormal lab result flagged"],
    forbiddenOutputs: ["Unredacted PHI", "Autonomous clinical diagnoses", "Treatment recommendations without clinician review"],
    allowedActions: ["Read de-identified patient data", "Generate clinical summaries", "Query formulary database"],
  },
  manufacturing: {
    label: "Manufacturing Defaults",
    riskTier: "MEDIUM",
    autonomyMode: "assisted",
    stopConditions: ["Safety interlock override attempted", "Production parameter out of range", "Equipment fault detected"],
    escalationTriggers: ["Quality non-conformance detected", "Emergency stop triggered", "Calibration overdue"],
    forbiddenOutputs: ["Override safety interlocks", "Bypass quality hold", "Modify emergency stop configuration"],
    allowedActions: ["Read sensor data", "Generate production reports", "Query maintenance schedules"],
  },
  retail: {
    label: "Retail Defaults",
    riskTier: "MEDIUM",
    autonomyMode: "autonomous",
    stopConditions: ["Payment card data detected in output", "Price manipulation detected", "Inventory discrepancy above threshold"],
    escalationTriggers: ["High-value refund request", "Suspected fraud pattern", "Customer data deletion request"],
    forbiddenOutputs: ["Unmasked credit card numbers", "Raw customer passwords", "Competitor price comparisons without context"],
    allowedActions: ["Read product catalog", "Update order status", "Query inventory levels"],
  },
  insurance: {
    label: "Insurance Defaults",
    riskTier: "HIGH",
    autonomyMode: "assisted",
    stopConditions: ["Policyholder PII exposed", "Claim amount exceeds authority limit", "Regulatory filing deadline missed"],
    escalationTriggers: ["Suspected fraudulent claim", "Coverage dispute escalation", "Underwriting exception required"],
    forbiddenOutputs: ["Unredacted policyholder SSN", "Unauthorized coverage commitments", "Claims decisions without adjuster review"],
    allowedActions: ["Read policy records", "Generate loss reports", "Query claims history"],
  },
  technology_saas: {
    label: "Technology / SaaS Defaults",
    riskTier: "MEDIUM",
    autonomyMode: "autonomous",
    stopConditions: ["API key or secret detected in output", "Rate limit threshold exceeded", "Data residency violation detected"],
    escalationTriggers: ["Security incident detected", "SLA breach approaching", "Customer data export request"],
    forbiddenOutputs: ["Raw API keys or tokens", "Internal infrastructure details", "Customer data without consent"],
    allowedActions: ["Read application metrics", "Query user analytics", "Generate usage reports"],
  },
  cross_industry: {
    label: "Cross-Industry Defaults",
    riskTier: "MEDIUM",
    autonomyMode: "assisted",
    stopConditions: ["PII detected in output", "Unauthorized data access attempted", "Output quality below threshold"],
    escalationTriggers: ["Compliance check failed", "High-risk action detected", "Anomalous behavior pattern"],
    forbiddenOutputs: ["Unredacted personal data", "Unvalidated external content", "Actions outside defined scope"],
    allowedActions: ["Read authorized data sources", "Generate reports", "Query knowledge bases"],
  },
};

const INDUSTRY_CONTEXT_CONFIG: Record<string, {
  defaultSkills: string[];
  recommendedModel: { provider: string; model: string; reasoning: string };
  modelBenchmarks: Array<{ model: string; provider: string; score: number; reasoning: string }>;
  compliancePrerequisites: string[];
  mcpTools: ToolConfig[];
  dataSensitivityClasses: string[];
  contentFilters: string[];
  memoryGovernance: Array<{ rule: string; regulation: string; type: string }>;
  contextBudgetPreset: Array<{ category: string; pct: number; tokens: number }>;
  costBenchmarks: Record<string, { label: string; low: number; high: number; unit: string }>;
}> = {
  financial_services: {
    defaultSkills: ["KYC Verification", "AML Screening", "Risk Assessment", "Regulatory Reporting", "Trade Reconciliation"],
    recommendedModel: { provider: "openai", model: "gpt-4.1", reasoning: "Best accuracy for financial document analysis and regulatory compliance" },
    modelBenchmarks: [
      { model: "gpt-4.1", provider: "openai", score: 94, reasoning: "Highest accuracy on financial reasoning benchmarks" },
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 91, reasoning: "Strong compliance text analysis" },
      { model: "gpt-4o", provider: "openai", score: 87, reasoning: "Good cost/accuracy balance for routine queries" },
    ],
    compliancePrerequisites: ["GLBA Privacy Compliance Review", "E-SIGN Act Consent Framework", "BSA/AML CIP Identity Verification", "Reg CC Funds Availability Disclosure", "Reg DD Truth in Savings Disclosure", "BSA/AML Training Certification", "KYC Policy Acknowledgment", "Data Classification Review", "Model Risk Management (SR 11-7) Review", "Fair Lending Impact Assessment"],
    mcpTools: [
      { name: "core_banking_api", description: "Connect to core banking system for account data", permissionScope: "READ", dataClasses: ["financial_data", "pii"], failureModes: ["connection_error", "auth_failure"], rateLimit: "100/min", costPerCall: 0.003, accessTier: "RESTRICTED" },
      { name: "market_data_feed", description: "Real-time and historical market data access", permissionScope: "READ", dataClasses: ["market_data"], failureModes: ["feed_delay", "data_stale"], rateLimit: "200/min", costPerCall: 0.001, accessTier: "STANDARD" },
      { name: "regulatory_database", description: "Query regulatory requirements and compliance rules", permissionScope: "READ", dataClasses: ["regulatory_data"], failureModes: ["index_unavailable"], rateLimit: "50/min", costPerCall: 0.002, accessTier: "STANDARD" },
      { name: "credit_bureau_api", description: "Credit check and scoring through major bureaus", permissionScope: "READ", dataClasses: ["pii", "financial_data", "credit_data"], failureModes: ["bureau_timeout", "consent_missing"], rateLimit: "20/min", costPerCall: 0.05, accessTier: "CRITICAL" },
      { name: "sanctions_screening", description: "Screen against OFAC, EU, and UN sanctions lists", permissionScope: "READ", dataClasses: ["pii", "sanctions_data"], failureModes: ["list_update_pending"], rateLimit: "100/min", costPerCall: 0.01, accessTier: "RESTRICTED" },
      { name: "transaction_ledger", description: "Write transaction records to the general ledger", permissionScope: "WRITE", dataClasses: ["financial_data"], failureModes: ["write_conflict", "validation_error"], rateLimit: "30/min", costPerCall: 0.005, accessTier: "CRITICAL", writeAccess: true },
    ],
    dataSensitivityClasses: ["PII", "PCI", "Financial Data", "Credit Data", "Sanctions Data"],
    contentFilters: ["Detect and decline unauthorized financial advice", "Flag potential market manipulation language", "Block unvalidated investment recommendations", "Detect insider trading indicators"],
    memoryGovernance: [
      { rule: "Retain BSA/AML records for 5 years minimum", regulation: "BSA/AML", type: "retention" },
      { rule: "Customer identity records retained for 5 years after account closure", regulation: "CIP", type: "retention" },
      { rule: "Erase personal data within 30 days of valid GDPR request", regulation: "GDPR", type: "erasure" },
      { rule: "Transaction logs immutable once committed", regulation: "SOX", type: "immutability" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 20, tokens: 1640 },
      { category: "Industry Ontology", pct: 22, tokens: 1802 },
      { category: "Regulatory Context", pct: 18, tokens: 1475 },
      { category: "Skill Instructions", pct: 14, tokens: 1147 },
      { category: "Conversation History", pct: 10, tokens: 819 },
      { category: "Retrieved Knowledge", pct: 10, tokens: 819 },
      { category: "Tool Descriptions", pct: 6, tokens: 490 },
    ],
    costBenchmarks: {
      kyc_verification: { label: "KYC Verification", low: 0.65, high: 1.20, unit: "per verification" },
      aml_screening: { label: "AML Screening", low: 0.40, high: 0.85, unit: "per screening" },
      trade_reconciliation: { label: "Trade Reconciliation", low: 0.15, high: 0.45, unit: "per trade" },
      regulatory_report: { label: "Regulatory Report", low: 2.50, high: 8.00, unit: "per report" },
    },
  },
  healthcare: {
    defaultSkills: ["Clinical Documentation", "ICD-10 Coding", "Prior Authorization", "Drug Interaction Check", "Patient Triage"],
    recommendedModel: { provider: "openai", model: "gpt-4.1", reasoning: "Highest accuracy for clinical terminology and medical reasoning" },
    modelBenchmarks: [
      { model: "gpt-4.1", provider: "openai", score: 92, reasoning: "Best medical terminology comprehension" },
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 90, reasoning: "Strong clinical reasoning and safety" },
      { model: "gemini-1.5-pro", provider: "google", score: 85, reasoning: "Good multimodal for medical imaging support" },
    ],
    compliancePrerequisites: ["HIPAA BAA Executed", "PHI Handling Training", "Clinical Validation Protocol", "IRB Review (if research)", "State Medical Privacy Law Review"],
    mcpTools: [
      { name: "ehr_connector", description: "Connect to EHR system (Epic, Cerner) for patient records", permissionScope: "READ", dataClasses: ["phi", "clinical_data"], failureModes: ["hl7_parse_error", "auth_failure"], rateLimit: "50/min", costPerCall: 0.005, accessTier: "CRITICAL" },
      { name: "payer_system", description: "Insurance verification and claims submission", permissionScope: "WRITE", dataClasses: ["phi", "financial_data", "insurance_data"], failureModes: ["claim_rejected", "eligibility_timeout"], rateLimit: "30/min", costPerCall: 0.01, accessTier: "CRITICAL", writeAccess: true },
      { name: "drug_database", description: "Drug interaction and formulary lookup (First Databank)", permissionScope: "READ", dataClasses: ["clinical_data", "drug_data"], failureModes: ["database_stale"], rateLimit: "100/min", costPerCall: 0.002, accessTier: "STANDARD" },
      { name: "clinical_guidelines", description: "Evidence-based clinical practice guidelines database", permissionScope: "READ", dataClasses: ["clinical_data"], failureModes: ["guideline_not_found"], rateLimit: "60/min", costPerCall: 0.003, accessTier: "STANDARD" },
      { name: "lab_results_api", description: "Query laboratory results and reference ranges", permissionScope: "READ", dataClasses: ["phi", "lab_data"], failureModes: ["result_pending"], rateLimit: "80/min", costPerCall: 0.002, accessTier: "RESTRICTED" },
    ],
    dataSensitivityClasses: ["PHI", "PII", "Clinical Data", "Genomic Data", "Mental Health Records"],
    contentFilters: ["Detect and handle mental health crisis indicators", "Block autonomous clinical diagnoses", "Flag adverse event signals for immediate review", "Detect medication safety concerns"],
    memoryGovernance: [
      { rule: "Retain medical records for minimum 6 years (varies by state)", regulation: "HIPAA", type: "retention" },
      { rule: "PHI must be encrypted at rest and in transit", regulation: "HIPAA Security Rule", type: "encryption" },
      { rule: "Right to access personal health records within 30 days", regulation: "HIPAA", type: "access" },
      { rule: "Minimum necessary standard for PHI disclosure", regulation: "HIPAA Privacy Rule", type: "access_control" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 18, tokens: 1475 },
      { category: "Industry Ontology", pct: 20, tokens: 1638 },
      { category: "Regulatory Context", pct: 20, tokens: 1638 },
      { category: "Skill Instructions", pct: 15, tokens: 1229 },
      { category: "Conversation History", pct: 10, tokens: 819 },
      { category: "Retrieved Knowledge", pct: 12, tokens: 983 },
      { category: "Tool Descriptions", pct: 5, tokens: 410 },
    ],
    costBenchmarks: {
      clinical_summary: { label: "Clinical Summary", low: 0.80, high: 2.50, unit: "per summary" },
      icd_coding: { label: "ICD-10 Coding", low: 0.30, high: 0.90, unit: "per encounter" },
      prior_auth: { label: "Prior Authorization", low: 1.50, high: 4.00, unit: "per request" },
      drug_check: { label: "Drug Interaction Check", low: 0.10, high: 0.35, unit: "per check" },
    },
  },
  manufacturing: {
    defaultSkills: ["Quality Inspection", "Predictive Maintenance", "SPC Monitoring", "Supply Chain Optimization", "Work Order Management"],
    recommendedModel: { provider: "openai", model: "gpt-4o", reasoning: "Good balance of speed and accuracy for real-time manufacturing decisions" },
    modelBenchmarks: [
      { model: "gpt-4o", provider: "openai", score: 89, reasoning: "Fast inference for real-time quality decisions" },
      { model: "gpt-4.1", provider: "openai", score: 92, reasoning: "Best root cause analysis accuracy" },
      { model: "llama-3.1-70b", provider: "custom", score: 84, reasoning: "On-premise deployment for air-gapped facilities" },
    ],
    compliancePrerequisites: ["ISO 9001 QMS Audit", "Safety Interlock Review", "ITAR Classification (if defense)", "Environmental Compliance Check"],
    mcpTools: [
      { name: "plc_scada_connector", description: "Connect to PLC/SCADA systems for sensor data", permissionScope: "READ", dataClasses: ["operational_data", "sensor_data"], failureModes: ["connection_timeout", "data_latency"], rateLimit: "200/min", costPerCall: 0.001, accessTier: "RESTRICTED" },
      { name: "mes_system", description: "Manufacturing Execution System for production tracking", permissionScope: "WRITE", dataClasses: ["production_data"], failureModes: ["sync_error"], rateLimit: "50/min", costPerCall: 0.003, accessTier: "RESTRICTED", writeAccess: true },
      { name: "cmms_maintenance", description: "Maintenance management and work order system", permissionScope: "WRITE", dataClasses: ["maintenance_data", "asset_data"], failureModes: ["scheduling_conflict"], rateLimit: "30/min", costPerCall: 0.005, accessTier: "STANDARD", writeAccess: true },
      { name: "quality_management", description: "QMS for non-conformance and CAPA tracking", permissionScope: "WRITE", dataClasses: ["quality_data"], failureModes: ["workflow_error"], rateLimit: "40/min", costPerCall: 0.003, accessTier: "STANDARD", writeAccess: true },
      { name: "erp_connector", description: "ERP system for inventory and procurement data", permissionScope: "READ", dataClasses: ["inventory_data", "financial_data"], failureModes: ["api_timeout"], rateLimit: "60/min", costPerCall: 0.002, accessTier: "STANDARD" },
    ],
    dataSensitivityClasses: ["Operational Data", "Trade Secrets", "ITAR Controlled", "Safety Critical"],
    contentFilters: ["Block safety interlock override commands", "Detect out-of-spec production parameters", "Flag equipment fault patterns"],
    memoryGovernance: [
      { rule: "Retain quality records per ISO 9001 (minimum 3 years)", regulation: "ISO 9001", type: "retention" },
      { rule: "Safety incident records retained for 10 years", regulation: "OSHA", type: "retention" },
      { rule: "Production batch records retained for product lifecycle", regulation: "GMP", type: "retention" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 22, tokens: 1802 },
      { category: "Industry Ontology", pct: 18, tokens: 1475 },
      { category: "Regulatory Context", pct: 12, tokens: 983 },
      { category: "Skill Instructions", pct: 18, tokens: 1475 },
      { category: "Conversation History", pct: 8, tokens: 655 },
      { category: "Retrieved Knowledge", pct: 14, tokens: 1147 },
      { category: "Tool Descriptions", pct: 8, tokens: 655 },
    ],
    costBenchmarks: {
      quality_inspection: { label: "Quality Inspection", low: 0.20, high: 0.60, unit: "per inspection" },
      predictive_maintenance: { label: "Predictive Maintenance Alert", low: 0.50, high: 1.80, unit: "per alert" },
      spc_analysis: { label: "SPC Analysis", low: 0.05, high: 0.15, unit: "per data point" },
    },
  },
  insurance: {
    defaultSkills: ["Claims Processing", "Underwriting Analysis", "Policy Comparison", "Fraud Detection", "Risk Scoring"],
    recommendedModel: { provider: "anthropic", model: "claude-3.5-sonnet", reasoning: "Excellent document analysis for policy and claims documents" },
    modelBenchmarks: [
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 93, reasoning: "Best at long document analysis for policies" },
      { model: "gpt-4.1", provider: "openai", score: 91, reasoning: "Strong actuarial reasoning" },
      { model: "gpt-4o", provider: "openai", score: 86, reasoning: "Cost-effective for routine claims" },
    ],
    compliancePrerequisites: ["Solvency II Data Quality Review", "GDPR Data Processing Agreement", "Anti-Fraud Protocol Review", "ACORD Data Standard Compliance"],
    mcpTools: [
      { name: "policy_admin_system", description: "Policy lifecycle management and endorsements", permissionScope: "WRITE", dataClasses: ["policy_data", "pii"], failureModes: ["endorsement_conflict"], rateLimit: "40/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true },
      { name: "claims_management", description: "Claims intake, adjudication, and payment processing", permissionScope: "WRITE", dataClasses: ["claims_data", "pii", "financial_data"], failureModes: ["adjudication_error"], rateLimit: "30/min", costPerCall: 0.008, accessTier: "CRITICAL", writeAccess: true },
      { name: "actuarial_models", description: "Risk scoring and premium calculation models", permissionScope: "READ", dataClasses: ["actuarial_data", "risk_data"], failureModes: ["model_stale"], rateLimit: "50/min", costPerCall: 0.01, accessTier: "RESTRICTED" },
      { name: "fraud_detection", description: "SIU fraud indicator screening and scoring", permissionScope: "READ", dataClasses: ["claims_data", "pii"], failureModes: ["false_positive"], rateLimit: "60/min", costPerCall: 0.005, accessTier: "RESTRICTED" },
    ],
    dataSensitivityClasses: ["PII", "Claims Data", "Actuarial Data", "Medical Records (health insurance)"],
    contentFilters: ["Detect unfair claims denial patterns", "Flag potential bad faith indicators", "Block unauthorized policy modifications"],
    memoryGovernance: [
      { rule: "Claims records retained for statute of limitations + 3 years", regulation: "State Insurance Laws", type: "retention" },
      { rule: "Underwriting records retained for policy lifetime + 7 years", regulation: "NAIC Model Laws", type: "retention" },
      { rule: "GDPR erasure within 30 days for EU policyholders", regulation: "GDPR", type: "erasure" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 20, tokens: 1638 },
      { category: "Industry Ontology", pct: 20, tokens: 1638 },
      { category: "Regulatory Context", pct: 18, tokens: 1475 },
      { category: "Skill Instructions", pct: 14, tokens: 1147 },
      { category: "Conversation History", pct: 10, tokens: 819 },
      { category: "Retrieved Knowledge", pct: 12, tokens: 983 },
      { category: "Tool Descriptions", pct: 6, tokens: 490 },
    ],
    costBenchmarks: {
      claims_processing: { label: "Claims Processing", low: 1.20, high: 3.50, unit: "per claim" },
      underwriting_analysis: { label: "Underwriting Analysis", low: 2.00, high: 6.00, unit: "per application" },
      fraud_screening: { label: "Fraud Screening", low: 0.30, high: 0.80, unit: "per claim" },
    },
  },
  retail: {
    defaultSkills: ["Product Recommendation", "Inventory Optimization", "Customer Sentiment Analysis", "Pricing Strategy", "Returns Processing"],
    recommendedModel: { provider: "openai", model: "gpt-4o", reasoning: "Fast response times critical for real-time customer interactions" },
    modelBenchmarks: [
      { model: "gpt-4o", provider: "openai", score: 90, reasoning: "Best latency for real-time recommendations" },
      { model: "gpt-4o-mini", provider: "openai", score: 82, reasoning: "Most cost-effective for high-volume queries" },
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 88, reasoning: "Superior product description generation" },
    ],
    compliancePrerequisites: ["PCI DSS Scope Assessment", "CCPA Data Mapping", "Cookie Consent Implementation", "ADA Accessibility Audit"],
    mcpTools: [
      { name: "product_catalog", description: "Product information, pricing, and availability", permissionScope: "READ", dataClasses: ["product_data"], failureModes: ["catalog_sync_error"], rateLimit: "200/min", costPerCall: 0.001, accessTier: "OPEN" },
      { name: "order_management", description: "Order creation, modification, and tracking", permissionScope: "WRITE", dataClasses: ["order_data", "pii", "pci"], failureModes: ["inventory_conflict", "payment_declined"], rateLimit: "50/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true },
      { name: "customer_profile", description: "Customer preferences, history, and loyalty data", permissionScope: "READ", dataClasses: ["pii", "behavioral_data"], failureModes: ["profile_not_found"], rateLimit: "100/min", costPerCall: 0.002, accessTier: "STANDARD" },
      { name: "inventory_system", description: "Real-time inventory levels across locations", permissionScope: "READ", dataClasses: ["inventory_data"], failureModes: ["count_discrepancy"], rateLimit: "150/min", costPerCall: 0.001, accessTier: "STANDARD" },
      { name: "payment_processor", description: "Payment tokenization and transaction processing", permissionScope: "WRITE", dataClasses: ["pci", "financial_data"], failureModes: ["payment_declined", "fraud_hold"], rateLimit: "30/min", costPerCall: 0.02, accessTier: "CRITICAL", writeAccess: true },
    ],
    dataSensitivityClasses: ["PII", "PCI", "Behavioral Data", "Loyalty Data"],
    contentFilters: ["Block display of raw payment card data", "Detect price manipulation attempts", "Flag discriminatory pricing patterns"],
    memoryGovernance: [
      { rule: "PCI data must not be stored after transaction completion", regulation: "PCI DSS", type: "deletion" },
      { rule: "Customer data erasure within 45 days of CCPA request", regulation: "CCPA", type: "erasure" },
      { rule: "Behavioral tracking data retained max 13 months", regulation: "GDPR/ePrivacy", type: "retention" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 20, tokens: 1638 },
      { category: "Industry Ontology", pct: 15, tokens: 1229 },
      { category: "Regulatory Context", pct: 10, tokens: 819 },
      { category: "Skill Instructions", pct: 18, tokens: 1475 },
      { category: "Conversation History", pct: 15, tokens: 1229 },
      { category: "Retrieved Knowledge", pct: 14, tokens: 1147 },
      { category: "Tool Descriptions", pct: 8, tokens: 655 },
    ],
    costBenchmarks: {
      product_recommendation: { label: "Product Recommendation", low: 0.02, high: 0.08, unit: "per recommendation" },
      customer_inquiry: { label: "Customer Inquiry", low: 0.10, high: 0.35, unit: "per inquiry" },
      returns_processing: { label: "Returns Processing", low: 0.25, high: 0.75, unit: "per return" },
    },
  },
  technology_saas: {
    defaultSkills: ["API Management", "Incident Response", "Usage Analytics", "Feature Flagging", "Customer Onboarding"],
    recommendedModel: { provider: "openai", model: "gpt-4o", reasoning: "Strong code understanding and fast response for developer tooling" },
    modelBenchmarks: [
      { model: "gpt-4o", provider: "openai", score: 92, reasoning: "Excellent code comprehension and API reasoning" },
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 90, reasoning: "Superior technical documentation generation" },
      { model: "gpt-4o-mini", provider: "openai", score: 84, reasoning: "Cost-effective for high-volume support queries" },
    ],
    compliancePrerequisites: ["SOC 2 Type II Audit", "GDPR Data Processing Assessment", "CCPA Privacy Impact Analysis", "ISO 27001 Gap Review"],
    mcpTools: [
      { name: "application_monitoring", description: "APM metrics, traces, and error tracking", permissionScope: "READ", dataClasses: ["telemetry_data"], failureModes: ["agent_offline", "data_lag"], rateLimit: "200/min", costPerCall: 0.001, accessTier: "STANDARD" },
      { name: "deployment_pipeline", description: "CI/CD pipeline status and deployment triggers", permissionScope: "WRITE", dataClasses: ["infrastructure_data"], failureModes: ["pipeline_blocked", "approval_pending"], rateLimit: "20/min", costPerCall: 0.01, accessTier: "RESTRICTED", writeAccess: true },
      { name: "customer_usage_api", description: "Product usage analytics and feature adoption metrics", permissionScope: "READ", dataClasses: ["behavioral_data", "pii"], failureModes: ["query_timeout"], rateLimit: "100/min", costPerCall: 0.002, accessTier: "STANDARD" },
      { name: "incident_management", description: "Create and manage incidents, runbooks, and post-mortems", permissionScope: "WRITE", dataClasses: ["incident_data"], failureModes: ["escalation_loop"], rateLimit: "50/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true },
    ],
    dataSensitivityClasses: ["PII", "API Credentials", "Infrastructure Secrets", "Usage Data"],
    contentFilters: ["Block exposure of API keys or secrets", "Detect infrastructure vulnerability details", "Flag unauthorized access patterns"],
    memoryGovernance: [
      { rule: "API keys and secrets must never be persisted in conversation memory", regulation: "SOC 2", type: "exclusion" },
      { rule: "Customer usage data anonymized after 90 days", regulation: "GDPR", type: "anonymization" },
      { rule: "Incident post-mortem data retained for 2 years", regulation: "SOC 2", type: "retention" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 18, tokens: 1475 },
      { category: "Industry Ontology", pct: 15, tokens: 1229 },
      { category: "Regulatory Context", pct: 10, tokens: 819 },
      { category: "Skill Instructions", pct: 18, tokens: 1475 },
      { category: "Conversation History", pct: 15, tokens: 1229 },
      { category: "Retrieved Knowledge", pct: 16, tokens: 1311 },
      { category: "Tool Descriptions", pct: 8, tokens: 655 },
    ],
    costBenchmarks: {
      incident_triage: { label: "Incident Triage", low: 0.15, high: 0.50, unit: "per incident" },
      api_support: { label: "API Support Query", low: 0.08, high: 0.25, unit: "per query" },
      usage_report: { label: "Usage Report Generation", low: 0.30, high: 1.00, unit: "per report" },
    },
  },
  cross_industry: {
    defaultSkills: ["Document Analysis", "Data Extraction", "Report Generation", "Workflow Automation", "Knowledge Retrieval"],
    recommendedModel: { provider: "openai", model: "gpt-4o", reasoning: "Versatile general-purpose model suitable for cross-industry applications" },
    modelBenchmarks: [
      { model: "gpt-4o", provider: "openai", score: 91, reasoning: "Best overall versatility across domains" },
      { model: "claude-3.5-sonnet", provider: "anthropic", score: 89, reasoning: "Strong reasoning and document analysis" },
      { model: "gpt-4o-mini", provider: "openai", score: 83, reasoning: "Cost-effective for routine tasks" },
    ],
    compliancePrerequisites: ["Data Privacy Impact Assessment", "Security Baseline Review", "Acceptable Use Policy Acknowledgment"],
    mcpTools: [
      { name: "document_processor", description: "Parse and extract data from various document formats", permissionScope: "READ", dataClasses: ["document_data"], failureModes: ["format_unsupported", "ocr_failure"], rateLimit: "100/min", costPerCall: 0.003, accessTier: "STANDARD" },
      { name: "knowledge_base", description: "Query internal knowledge bases and documentation", permissionScope: "READ", dataClasses: ["knowledge_data"], failureModes: ["index_stale"], rateLimit: "150/min", costPerCall: 0.002, accessTier: "STANDARD" },
      { name: "workflow_engine", description: "Trigger and manage automated workflows", permissionScope: "WRITE", dataClasses: ["workflow_data"], failureModes: ["step_failed", "approval_required"], rateLimit: "30/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true },
    ],
    dataSensitivityClasses: ["PII", "Business Confidential", "Internal Only"],
    contentFilters: ["Block personal data exposure", "Detect confidential information leakage", "Flag unauthorized scope expansion"],
    memoryGovernance: [
      { rule: "Personal data erasure within 30 days of request", regulation: "GDPR", type: "erasure" },
      { rule: "Business records retained per organizational policy", regulation: "Internal Policy", type: "retention" },
      { rule: "Confidential data must not persist in shared memory", regulation: "Internal Policy", type: "exclusion" },
    ],
    contextBudgetPreset: [
      { category: "System Instructions", pct: 20, tokens: 1638 },
      { category: "Industry Ontology", pct: 15, tokens: 1229 },
      { category: "Regulatory Context", pct: 12, tokens: 983 },
      { category: "Skill Instructions", pct: 16, tokens: 1311 },
      { category: "Conversation History", pct: 15, tokens: 1229 },
      { category: "Retrieved Knowledge", pct: 14, tokens: 1147 },
      { category: "Tool Descriptions", pct: 8, tokens: 655 },
    ],
    costBenchmarks: {
      document_analysis: { label: "Document Analysis", low: 0.10, high: 0.40, unit: "per document" },
      report_generation: { label: "Report Generation", low: 0.20, high: 0.60, unit: "per report" },
      workflow_execution: { label: "Workflow Execution", low: 0.05, high: 0.20, unit: "per execution" },
    },
  },
};

export default function AgentWizard() {
  const { industry } = useIndustry();
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>({ ...defaultWizardState });
  const [creationPath, setCreationPath] = useState<CreationPath>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [templateMatches, setTemplateMatches] = useState<TemplateMatch[]>([]);
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [postCreationAgent, setPostCreationAgent] = useState<{ id: string; name: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();

  const [jobProgress, setJobProgress] = useState<{
    agentId: string;
    agentName: string;
    jobId: string;
    suiteId: string;
    progress: number;
    step: string;
    status: "running" | "completed" | "failed";
    result?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Resolve template skill names against live skill catalog on template apply
  useEffect(() => {
    const templateId = wizardState.templateSkills.templateId;
    if (!templateId) return;

    fetch("/api/skills")
      .then((r) => r.json())
      .then((catalog: Array<{ id: string; name: string; domain: string }>) => {
        setWizardState((prev) => {
          if (prev.templateSkills.templateId !== templateId) return prev;

          function resolveEntries(
            entries: Array<{ skillId: string; skillName: string; domain: string; executionOrder: number }>
          ) {
            return entries.map((s) => {
              // Treat synthetic fallback IDs (e.g. "skill_0") as unresolved
              const isSynthetic = /^skill_\d+$/.test(s.skillId);
              if (s.skillId && !isSynthetic) return s;

              const sLower = s.skillName.toLowerCase();
              const sDomain = s.domain.toLowerCase();

              // Priority 1: exact name + exact domain match
              let match = catalog.find(
                (c) =>
                  c.name.toLowerCase() === sLower &&
                  c.domain.toLowerCase() === sDomain
              );
              // Priority 2: exact name, any domain
              if (!match) {
                match = catalog.find((c) => c.name.toLowerCase() === sLower);
              }
              // Priority 3: partial name within same domain
              if (!match && sDomain) {
                match = catalog.find(
                  (c) =>
                    c.domain.toLowerCase() === sDomain &&
                    (c.name.toLowerCase().includes(sLower) || sLower.includes(c.name.toLowerCase()))
                );
              }
              // Priority 4: partial name, any domain (lowest priority)
              if (!match) {
                match = catalog.find(
                  (c) =>
                    c.name.toLowerCase().includes(sLower) ||
                    sLower.includes(c.name.toLowerCase())
                );
              }

              if (!match) {
                console.warn(
                  `[template-skill-resolver] Unresolved skill "${s.skillName}" (domain: "${s.domain}") for template ${templateId} — will not be injected at runtime`
                );
                return { ...s, skillId: "" };
              }
              return { ...s, skillId: match.id };
            });
          }

          const resolvedRequired = resolveEntries(prev.templateSkills.required);
          const resolvedOptional = resolveEntries(prev.templateSkills.optional);

          // Update selectedOptional to use resolved IDs where possible
          const updatedSelected = prev.templateSkills.selectedOptional.map((sel) => {
            const opt = resolvedOptional.find(
              (o) => o.skillId === sel || o.skillName === sel
            );
            return opt ? opt.skillId || opt.skillName : sel;
          });

          return {
            ...prev,
            templateSkills: {
              ...prev.templateSkills,
              required: resolvedRequired,
              optional: resolvedOptional,
              selectedOptional: updatedSelected,
            },
          };
        });
      })
      .catch((err) => {
        console.warn("[template-skill-resolver] Failed to fetch skill catalog for template skill resolution:", err);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardState.templateSkills.templateId]);

  function startJobTracking(agentId: string, jobId: string, suiteId: string, agentName: string) {
    setJobProgress({ agentId, jobId, suiteId, agentName, progress: 0, step: "queued", status: "running" });

    const es = new EventSource(`/api/events/stream?agentId=${agentId}`);
    eventSourceRef.current = es;

    let errorRetries = 0;
    const maxRetries = 3;

    es.onmessage = (event) => {
      try {
        errorRetries = 0;
        const data = JSON.parse(event.data);
        if (data.type === "progress" && data.jobId === jobId) {
          setJobProgress((prev) => prev ? { ...prev, progress: data.progress, step: data.step } : prev);
        } else if (data.type === "completed" && data.jobId === jobId) {
          if (creationPath === "template") {
            es.close();
            setJobProgress(null);
            setPostCreationAgent({ id: agentId, name: agentName });
          } else {
            setJobProgress((prev) => prev ? { ...prev, progress: 100, step: "completed", status: "completed", result: data.result } : prev);
            es.close();
          }
        } else if (data.type === "failed" && data.jobId === jobId) {
          setJobProgress((prev) => prev ? { ...prev, status: "failed", error: data.error, step: "failed" } : prev);
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      errorRetries++;
      if (errorRetries >= maxRetries) {
        es.close();
        setJobProgress((prev) => prev ? { ...prev, status: "failed", error: "Lost connection to server. The evaluation may still be running in the background.", step: "connection_lost" } : prev);
        toast({ title: "Connection lost", description: "Progress tracking disconnected. You can check the agent status from the agents list.", variant: "destructive" });
      }
    };
  }

  const { data: templates, isLoading: templatesLoading } = useQuery<AgentTemplate[]>({
    queryKey: ["/api/agent-templates"],
  });

  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });


  const { data: ontologyConcepts } = useQuery<Array<{ id: string; label: string; category: string; description: string; synonyms: string[] | null }>>({
    queryKey: [`/api/ontology/concepts?industryId=${encodeURIComponent(wizardState.industryId || "")}`],
    enabled: !!wizardState.industryId,
  });

  const domainGlossary = useMemo(() => {
    if (!ontologyConcepts || ontologyConcepts.length === 0) return "";
    const grouped: Record<string, Array<{ label: string; description: string; synonyms: string[] | null }>> = {};
    for (const c of ontologyConcepts) {
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push({ label: c.label, description: c.description, synonyms: c.synonyms });
    }
    let text = "## Domain Terminology\n\nYou MUST use the following industry-standard terminology when reasoning about and responding to tasks in this domain. These terms define the precise meaning of concepts in your operating context.\n";
    for (const [category, concepts] of Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
      text += `\n### ${category}\n`;
      for (const c of concepts.sort((a, b) => a.label.localeCompare(b.label))) {
        text += `- **${c.label}**: ${c.description}`;
        if (c.synonyms && c.synonyms.length > 0) {
          text += ` (Also known as: ${c.synonyms.join(", ")})`;
        }
        text += "\n";
      }
    }
    return text.trim();
  }, [ontologyConcepts]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: (data: { id: string; name: string; suiteId?: string; jobId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      if (data.jobId && data.suiteId) {
        startJobTracking(data.id, data.jobId, data.suiteId, data.name || wizardState.name);
      } else if (creationPath === "template") {
        toast({ title: "Agent created successfully" });
        setPostCreationAgent({ id: data.id, name: data.name || wizardState.name });
      } else {
        toast({ title: "Agent created successfully" });
        navigate("/agents");
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create agent", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const [outcomeLockedFromUrl, setOutcomeLockedFromUrl] = useState(false);
  const [fromOutcome, setFromOutcome] = useState(false);
  const [outcomePrePopulated, setOutcomePrePopulated] = useState(false);
  const [dynamicAdjustments, setDynamicAdjustments] = useState<DynamicPresetAdjustment[]>([]);
  const [dynamicOntologyGuardrails, setDynamicOntologyGuardrails] = useState<Array<{ text: string; type: string; source: string; conceptLabel: string; regulation: string }>>([]);
  const [isDynamicPreset, setIsDynamicPreset] = useState(false);
  const [dynamicPresetLoading, setDynamicPresetLoading] = useState(false);
  const [adjustmentsExpanded, setAdjustmentsExpanded] = useState(false);

  const fetchAndApplyDynamicPresets = async (indId: string, ontTags: OntologyTag[], outcomeIdVal?: string) => {
    try {
      setDynamicPresetLoading(true);
      const tagParam = ontTags.map((t) => t.conceptId).join(",");
      const params = new URLSearchParams();
      if (tagParam) params.set("ontologyTags", tagParam);
      if (outcomeIdVal) params.set("outcomeId", outcomeIdVal);
      const res = await fetch(`/api/industries/${indId}/dynamic-presets?${params.toString()}`);
      if (!res.ok) return null;
      const data: DynamicPresetResponse = await res.json();
      return data;
    } catch {
      return null;
    } finally {
      setDynamicPresetLoading(false);
    }
  };

  const applyDynamicPreset = (data: DynamicPresetResponse, overrideIndustryId?: string) => {
    const ctx = INDUSTRY_CONTEXT_CONFIG[overrideIndustryId || wizardState.industryId || ""];
    const industryTools: ToolConfig[] = ctx?.mcpTools?.map((t) => ({ ...t })) || [];
    updateState({
      riskTier: data.preset.riskTier,
      autonomyMode: data.preset.autonomyMode,
      modelName: data.contextConfig.recommendedModel.model,
      modelProvider: data.contextConfig.recommendedModel.provider,
      guardrailsConfig: {
        ...wizardState.guardrailsConfig,
        stopConditions: data.preset.guardrailsConfig.stopConditions,
        escalationTriggers: data.preset.guardrailsConfig.escalationTriggers,
        forbiddenOutputs: data.preset.guardrailsConfig.forbiddenOutputs,
        allowedActions: data.preset.guardrailsConfig.allowedActions,
      },
      toolsConfig: [...wizardState.toolsConfig.filter((t) => !industryTools.some((it) => it.name === t.name)), ...industryTools],
      contextBudget: data.contextConfig.contextBudget,
      memoryGovernanceRules: data.contextConfig.memoryGovernance,
      industryAutoApplied: true,
    });
    setDynamicAdjustments(data.adjustments);
    setDynamicOntologyGuardrails(data.ontologyGuardrails || []);
    setIsDynamicPreset(data.isDynamic);
  };

  const outcomeIdForKpis = wizardState.outcomeId;
  const { data: outcomeKpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/outcomes", outcomeIdForKpis, "kpis"],
    queryFn: async () => {
      const res = await fetch(`/api/outcomes/${outcomeIdForKpis}/kpis`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outcomeIdForKpis && (fromOutcome || creationPath === "template"),
  });

  useEffect(() => {
    if (industry?.id && industry.id !== "custom" && industry.id !== "cross_industry" && wizardState.industryId !== industry.id) {
      const preset = INDUSTRY_PRESETS[industry.id];
      const ctx = INDUSTRY_CONTEXT_CONFIG[industry.id];
      if (preset && ctx && !wizardState.industryAutoApplied) {
        updateState({ industryId: industry.id });
        fetchAndApplyDynamicPresets(industry.id, wizardState.ontologyTags, wizardState.outcomeId || undefined).then((data) => {
          if (data) {
            applyDynamicPreset(data, industry.id);
          } else {
            const industryTools: ToolConfig[] = ctx.mcpTools.map((t) => ({ ...t }));
            updateState({
              riskTier: preset.riskTier,
              autonomyMode: preset.autonomyMode,
              modelName: ctx.recommendedModel.model,
              modelProvider: ctx.recommendedModel.provider,
              guardrailsConfig: {
                ...wizardState.guardrailsConfig,
                stopConditions: preset.stopConditions,
                escalationTriggers: preset.escalationTriggers,
                forbiddenOutputs: preset.forbiddenOutputs,
                allowedActions: preset.allowedActions,
              },
              toolsConfig: [...wizardState.toolsConfig, ...industryTools.filter((t) => !wizardState.toolsConfig.some((existing) => existing.name === t.name))],
              contextBudget: ctx.contextBudgetPreset,
              memoryGovernanceRules: ctx.memoryGovernance,
              industryAutoApplied: true,
            });
            setDynamicAdjustments([]);
            setIsDynamicPreset(false);
          }
        });
      } else {
        updateState({ industryId: industry.id });
      }
    } else if (industry?.id && wizardState.industryId !== industry.id) {
      updateState({ industryId: industry.id });
    }
  }, [industry?.id]);

  const ontologyTagsRef = useRef(JSON.stringify(wizardState.ontologyTags.map((t) => t.conceptId).sort()));
  const outcomeIdRef = useRef(wizardState.outcomeId);
  useEffect(() => {
    const currentTags = JSON.stringify(wizardState.ontologyTags.map((t) => t.conceptId).sort());
    const tagsChanged = currentTags !== ontologyTagsRef.current;
    const outcomeChanged = wizardState.outcomeId !== outcomeIdRef.current;
    ontologyTagsRef.current = currentTags;
    outcomeIdRef.current = wizardState.outcomeId;

    if ((tagsChanged || outcomeChanged) && wizardState.industryAutoApplied && wizardState.industryId && wizardState.industryId !== "custom" && wizardState.industryId !== "cross_industry") {
      fetchAndApplyDynamicPresets(wizardState.industryId, wizardState.ontologyTags, wizardState.outcomeId || undefined).then((data) => {
        if (data) {
          applyDynamicPreset(data, wizardState.industryId);
          if (data.adjustments.length > 0) {
            toast({ title: "Presets updated", description: `${data.adjustments.length} setting(s) adjusted based on your ontology tags and outcome requirements` });
          }
        }
      });
    }
  }, [JSON.stringify(wizardState.ontologyTags.map((t) => t.conceptId).sort()), wizardState.outcomeId]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const outcomeIdParam = params.get("outcomeId");
    const outcomeNameParam = params.get("outcomeName");
    const nameParam = params.get("name");
    const descParam = params.get("description");
    const riskParam = params.get("riskTier");
    const autonomyParam = params.get("autonomyMode");
    const fromOutcomeParam = params.get("fromOutcome");
    const industryIdParam = params.get("industryId");
    if (outcomeIdParam) {
      updateState({ outcomeId: outcomeIdParam });
      setOutcomeLockedFromUrl(true);
    }
    if (fromOutcomeParam === "true") {
      setFromOutcome(true);
    }
    if (nameParam) updateState({ name: nameParam });
    else if (outcomeNameParam && !wizardState.name) {
      updateState({ name: `${outcomeNameParam} Agent` });
    }
    if (descParam) updateState({ description: descParam });
    if (riskParam) updateState({ riskTier: riskParam });
    if (autonomyParam) updateState({ autonomyMode: autonomyParam });
    if (industryIdParam) updateState({ industryId: industryIdParam });
  }, [searchParams]);

  useEffect(() => {
    if (!fromOutcome || outcomePrePopulated || !outcomeKpis || !wizardState.outcomeId) return;
    const linkedOutcome = outcomes?.find((o) => o.id === wizardState.outcomeId);
    if (!linkedOutcome) return;

    setOutcomePrePopulated(true);

    const kpiSummary = outcomeKpis.map(k => `${k.name}: target ${k.target} ${k.unit}`).join("; ");
    const currentDesc = wizardState.description;
    const enrichedDesc = currentDesc
      ? `${currentDesc}\n\nKPI Targets: ${kpiSummary}`
      : `Agent for outcome "${linkedOutcome.name}". KPI Targets: ${kpiSummary}`;

    const slaConfig = linkedOutcome.slaConfig as Record<string, unknown> | null;
    const approvalGates = linkedOutcome.approvalGates as string[] | null;

    const outcomeStopConditions: string[] = [];
    const outcomeEscalationTriggers: string[] = [];

    if (linkedOutcome.riskTier === "HIGH" || linkedOutcome.riskTier === "CRITICAL") {
      outcomeStopConditions.push("Outcome KPI breach threshold exceeded");
      outcomeEscalationTriggers.push("Compliance or regulatory constraint violation");
    }
    if (linkedOutcome.maxDriftPercent && linkedOutcome.maxDriftPercent < 15) {
      outcomeStopConditions.push(`Drift exceeds ${linkedOutcome.maxDriftPercent}% from baseline`);
    }
    if (slaConfig && typeof slaConfig === "object") {
      if ((slaConfig as any).successRate) {
        outcomeEscalationTriggers.push(`Success rate drops below ${(slaConfig as any).successRate}%`);
      }
    }
    if (Array.isArray(approvalGates) && approvalGates.length > 0) {
      outcomeEscalationTriggers.push("Approval gate triggered — requires human review");
    }

    for (const kpi of outcomeKpis) {
      if (kpi.slaThreshold != null) {
        outcomeEscalationTriggers.push(`KPI "${kpi.name}" breaches SLA threshold (${kpi.slaThreshold} ${kpi.unit})`);
      }
    }

    const existingStop = wizardState.guardrailsConfig.stopConditions;
    const existingEscal = wizardState.guardrailsConfig.escalationTriggers;
    const mergedStop = [...new Set([...existingStop, ...outcomeStopConditions])];
    const mergedEscal = [...new Set([...existingEscal, ...outcomeEscalationTriggers])];

    const kpiThresholds = outcomeKpis
      .filter(k => k.slaThreshold != null)
      .map(k => k.slaThreshold!);
    const minThreshold = kpiThresholds.length > 0 ? Math.min(...kpiThresholds) : null;
    const pilotThreshold = minThreshold != null ? Math.max(Math.round(minThreshold * 0.9), 50) : wizardState.evalSuiteConfig.pilotThreshold;
    const prodThreshold = minThreshold != null ? Math.max(Math.round(minThreshold), 70) : wizardState.evalSuiteConfig.prodThreshold;

    updateState({
      description: enrichedDesc,
      guardrailsConfig: {
        ...wizardState.guardrailsConfig,
        stopConditions: mergedStop,
        escalationTriggers: mergedEscal,
      },
      evalSuiteConfig: {
        ...wizardState.evalSuiteConfig,
        pilotThreshold,
        prodThreshold,
      },
    });
  }, [fromOutcome, outcomeKpis, outcomes, wizardState.outcomeId, outcomePrePopulated]);

  useEffect(() => {
    if (outcomeLockedFromUrl && outcomes && wizardState.outcomeId && !wizardState.owner) {
      const linkedOutcome = outcomes.find((o) => o.id === wizardState.outcomeId);
      if (linkedOutcome) {
        updateState({ owner: `${linkedOutcome.name} Team` });
      }
    }
  }, [outcomes, outcomeLockedFromUrl, wizardState.outcomeId]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const templateId = params.get("templateId");
    if (templateId && templates) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        updateState({
          name: template.name,
          description: template.description || "",
          riskTier: template.defaultRiskTier || "MEDIUM",
          autonomyMode: template.defaultAutonomyMode || "assisted",
        });
        applyTemplate(template);
        setCreationPath("template");
        setSelectedTemplateId(templateId);
        setCurrentStep(2);
      }
    }
  }, [searchParams, templates]);

  function updateState(updates: Partial<WizardState>) {
    setWizardState((prev) => ({ ...prev, ...updates }));
  }

  function applyTemplate(template: AgentTemplate) {
    updateState({
      modelProvider: template.modelProvider || "openai",
      modelName: template.modelName || "gpt-4.1",
      toolsConfig: Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [],
      permissionsConfig: {
        dataAccess: [],
        apiAccess: [],
        writeAccess: [],
        ...(template.permissionsConfig as Record<string, string[]> || {}),
      },
      memoryRagEnabled: !!template.memoryRagConfig,
      memoryRagConfig: template.memoryRagConfig
        ? (template.memoryRagConfig as WizardState["memoryRagConfig"])
        : defaultWizardState.memoryRagConfig,
      workflowNodes: template.blueprintJson
        ? Array.isArray((template.blueprintJson as Record<string, unknown>).nodes)
          ? ((template.blueprintJson as Record<string, unknown>).nodes as WorkflowNode[])
          : []
        : [],
      policyBindings: Array.isArray(template.policyBindings)
        ? (template.policyBindings as unknown[]).map((p) => {
            if (typeof p === "string") return { policyId: p, policyName: p, enforcement: "soft" };
            const obj = p as Record<string, unknown>;
            return {
              policyId: (obj.policyId || obj.id || obj.policyName || "") as string,
              policyName: (obj.policyName || obj.name || "") as string,
              enforcement: (obj.enforcement || "soft") as string,
              domain: (obj.domain || "") as string,
              description: (obj.description || "") as string,
            };
          })
        : [],
      evalBindings: Array.isArray(template.evalBindings) ? (template.evalBindings as string[]) : [],
      rollbackPlan: template.rollbackPlan
        ? typeof template.rollbackPlan === "string"
          ? template.rollbackPlan
          : JSON.stringify(template.rollbackPlan)
        : "",
      blueprintId: template.defaultBlueprintId || null,
      blueprintName: null,
      templateSkills: (() => {
        const reqSkills = Array.isArray(template.requiredSkills)
          ? (template.requiredSkills as any[]).map((s: any, i: number) => ({
              skillId: s.skillId || "",
              skillName: s.skillName || "",
              domain: s.domain || "",
              executionOrder: s.executionOrder ?? i + 1,
            }))
          : [];
        const optSkills = Array.isArray(template.optionalSkills)
          ? (template.optionalSkills as any[]).map((s: any, i: number) => ({
              skillId: s.skillId || "",
              skillName: s.skillName || "",
              domain: s.domain || "",
              executionOrder: s.executionOrder ?? i + 1,
            }))
          : [];
        if (reqSkills.length === 0 && optSkills.length === 0 && Array.isArray(template.preloadedSkills)) {
          const fallbackOptional = (template.preloadedSkills as any[]).map((s: any, i: number) => ({
            // Use real IDs only — never synthesize fake ones; resolution effect will populate empties
            skillId: s.skillId || s.id || "",
            skillName: s.skillName || s.name || String(s),
            domain: s.domain || "",
            executionOrder: s.executionOrder ?? i + 1,
          }));
          return {
            required: [],
            optional: fallbackOptional,
            selectedOptional: fallbackOptional.map((s: any) => s.skillId || s.skillName),
            templateId: template.id,
          };
        }
        return {
          required: reqSkills,
          optional: optSkills,
          selectedOptional: optSkills.map((s: any) => s.skillId || s.skillName),
          templateId: template.id,
        };
      })(),
    });
    toast({ title: `Template "${template.name}" applied` });
  }

  async function runAiMatching() {
    if (!templates || templates.length === 0) return;
    setMatchingInProgress(true);
    setTemplateMatches([]);

    const linkedOutcome = outcomes?.find((o) => o.id === wizardState.outcomeId);

    try {
      const slimTemplates = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        industry: t.industry,
        tags: t.tags,
        complexity: t.complexity,
        defaultRiskTier: t.defaultRiskTier,
        defaultAutonomyMode: t.defaultAutonomyMode,
      }));
      const res = await apiRequest("POST", "/api/ai/match-templates", {
        basicInfo: {
          name: wizardState.name,
          description: wizardState.description,
          owner: wizardState.owner,
          riskTier: wizardState.riskTier,
          autonomyMode: wizardState.autonomyMode,
          outcomeName: linkedOutcome?.name || "",
        },
        templates: slimTemplates,
      });
      const data = await res.json();
      const rawMatches = data.matches || [];
      const seen = new Set<string>();
      const dedupedMatches = rawMatches.filter((m: any) => {
        if (seen.has(m.templateId)) return false;
        seen.add(m.templateId);
        return true;
      });
      setTemplateMatches(dedupedMatches);
    } catch {
      toast({ title: "Template matching failed", description: "Could not analyze templates. You can still select manually.", variant: "destructive" });
    } finally {
      setMatchingInProgress(false);
    }
  }

  async function sendAiMessage() {
    if (!aiInput.trim() || aiStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: aiInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setAiInput("");
    setAiStreaming(true);

    try {
      const res = await fetch("/api/ai/agent-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, wizardState }),
      });

      if (!res.ok) throw new Error("AI request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) {
                assistantContent += parsed.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." },
      ]);
    } finally {
      setAiStreaming(false);
    }
  }

  function handleCreate() {
    const composedSystemPrompt = domainGlossary
      ? `You are an AI agent operating in the ${industry?.label || "industry"} domain.\n\n${domainGlossary}`
      : undefined;

    const linkedOutcome = outcomes?.find((o) => o.id === wizardState.outcomeId);
    let autoPrompt = "";
    if (linkedOutcome) {
      const kpiNames = (linkedOutcome as any).kpis?.map((k: any) => k.name).join(", ") || "";
      autoPrompt = `As an AI agent for ${industry?.label || "the organization"}, ${linkedOutcome.description || linkedOutcome.name}. ${kpiNames ? `Track and report on: ${kpiNames}.` : ""} Analyze available data using connected tools and provide actionable insights with compliance considerations.`;
    }

    const payload: Record<string, unknown> = {
      name: wizardState.name,
      description: wizardState.description,
      owner: wizardState.owner,
      riskTier: wizardState.riskTier,
      autonomyMode: wizardState.autonomyMode,
      outcomeId: wizardState.outcomeId || undefined,
      modelProvider: wizardState.modelProvider,
      modelName: wizardState.modelName,
      maxToolIterations: wizardState.maxToolIterations,
      toolsConfig: wizardState.toolsConfig,
      permissionsConfig: wizardState.permissionsConfig,
      memoryRagConfig: wizardState.memoryRagEnabled ? wizardState.memoryRagConfig : null,
      blueprintId: wizardState.blueprintId || undefined,
      blueprintJson: wizardState.blueprintId ? undefined : { nodes: wizardState.workflowNodes },
      policyBindings: wizardState.policyBindings,
      evalBindings: wizardState.evalBindings,
      guardrailsConfig: wizardState.guardrailsConfig,
      evalSuiteConfig: wizardState.evalSuiteConfig,
      ontologyTags: wizardState.ontologyTags.length > 0 ? wizardState.ontologyTags : undefined,
      systemPrompt: composedSystemPrompt,
      department: wizardState.department || undefined,
      rolloutConfig: wizardState.rolloutConfig,
      rollbackPlan: wizardState.rolloutConfig ? {
        rollbackStrategy: wizardState.rolloutConfig.rollbackStrategy,
        healthCheckInterval: wizardState.rolloutConfig.healthCheckInterval,
        autoRollbackTriggers: wizardState.rolloutConfig.autoRollbackTriggers,
        shadowModeDuration: wizardState.rolloutConfig.shadowModeDuration,
        canarySteps: wizardState.rolloutConfig.canarySteps,
      } : null,
      runtimeConfig: autoPrompt ? { prompt: autoPrompt, scheduleIntervalMinutes: 5 } : undefined,
      memoryGovernanceRules: wizardState.memoryGovernanceRules.length > 0 ? wizardState.memoryGovernanceRules : undefined,
    };
    if (selectedTemplateId) {
      const existingRt = (payload.runtimeConfig as Record<string, any>) || {};
      payload.runtimeConfig = { ...existingRt, sourceTemplateId: selectedTemplateId };
    }

    const ts = wizardState.templateSkills;
    if (ts.required.length > 0 || ts.optional.length > 0) {
      const activeRequired = ts.required.sort((a, b) => a.executionOrder - b.executionOrder);
      const activeOptional = ts.optional
        .filter(s => ts.selectedOptional.includes(s.skillId || s.skillName))
        .sort((a, b) => a.executionOrder - b.executionOrder);

      const mergedSkills = [
        ...activeRequired.map(s => s.skillName),
        ...activeOptional.map(s => s.skillName),
      ];
      if (mergedSkills.length > 0) {
        const existingRt = (payload.runtimeConfig as Record<string, any>) || {};
        payload.runtimeConfig = { ...existingRt, matchedSkills: mergedSkills };
        (payload as any).agentSkills = mergedSkills;
      }

      // Carry resolved skill IDs so the runtime can inject Layer 3 context
      const resolvedPreloaded = [...activeRequired, ...activeOptional]
        .filter(s => s.skillId)
        .map(s => ({
          skillId: s.skillId,
          skillName: s.skillName,
          domain: s.domain,
          executionOrder: s.executionOrder,
        }));
      if (resolvedPreloaded.length > 0) {
        (payload as any).preloadedSkills = resolvedPreloaded;
      }
    }
    createMutation.mutate(payload);
  }

  function handleChoosePath(path: CreationPath) {
    setCreationPath(path);
    if (path === "template") {
      runAiMatching();
    } else if (path === "ai") {
      setAiPanelOpen(true);
      setCurrentStep(2);
    } else if (path === "manual") {
      setCurrentStep(2);
    }
  }

  function handleSelectTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    // Pre-fill name and description from template when the user has not yet entered them
    const patch: Partial<WizardState> = {};
    if (!wizardState.name) patch.name = template.name || "";
    if (!wizardState.description) patch.description = template.description || "";
    if (Object.keys(patch).length) updateState(patch);
    applyTemplate(template);
    // Do NOT auto-advance to Step 2 — stay on Step 1 so the user sees the outcome selector
    // and can optionally link a business outcome before proceeding.
  }

  const stepLabels: Record<string, string> = {
    queued: "Waiting in queue...",
    compiling_blueprint: "Compiling blueprint...",
    static_checks_complete: "Static checks passed",
    running_eval_cases: "Running evaluation cases...",
    evaluating_test_cases: "Evaluating test cases...",
    finalizing_results: "Finalizing results...",
    completed: "Baseline evaluation complete",
    failed: "Evaluation failed",
    connection_lost: "Connection lost",
  };

  function getStepLabel(step: string): string {
    if (stepLabels[step]) return stepLabels[step];
    const caseMatch = step.match(/evaluated_case_(\d+)_of_(\d+)/);
    if (caseMatch) return `Evaluated test case ${caseMatch[1]} of ${caseMatch[2]}`;
    return step.replace(/_/g, " ");
  }

  if (jobProgress) {
    const evalResults = jobProgress.result?.evalResults as { passRate?: number; totalCases?: number; passed?: number } | undefined;
    const passRate = evalResults?.passRate;
    const totalCases = evalResults?.totalCases;
    const passedCases = evalResults?.passed;

    return (
      <div className="flex flex-col gap-6 p-6 items-center justify-center min-h-[60vh]" data-testid="job-progress-panel">
        <div className="flex flex-col gap-6 w-full max-w-lg">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {jobProgress.status === "completed" ? "Agent Ready" : jobProgress.status === "failed" ? "Evaluation Failed" : "Setting Up Agent"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {jobProgress.status === "running"
                ? `Running baseline evaluation for "${jobProgress.agentName}"`
                : jobProgress.status === "completed"
                  ? `"${jobProgress.agentName}" passed baseline evaluation`
                  : `Baseline evaluation for "${jobProgress.agentName}" encountered an error`}
            </p>
          </div>

          <Card>
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{getStepLabel(jobProgress.step)}</span>
                <span className="text-sm text-muted-foreground">{jobProgress.progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden" data-testid="progress-bar">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    jobProgress.status === "failed"
                      ? "bg-destructive"
                      : jobProgress.status === "completed"
                        ? "bg-green-500"
                        : "bg-primary"
                  }`}
                  style={{ width: `${jobProgress.progress}%` }}
                />
              </div>

              {jobProgress.status === "running" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing baseline evaluation...</span>
                </div>
              )}

              {jobProgress.status === "completed" && passRate !== undefined && (
                <div className="flex flex-col gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Baseline established</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="result-pass-rate">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass Rate</span>
                      <span className="text-lg font-semibold">{passRate?.toFixed(1)}%</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="result-passed">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Passed</span>
                      <span className="text-lg font-semibold">{passedCases ?? "—"}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="result-total">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Cases</span>
                      <span className="text-lg font-semibold">{totalCases ?? "—"}</span>
                    </div>
                  </div>
                </div>
              )}

              {jobProgress.status === "failed" && jobProgress.error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm" data-testid="job-error">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-destructive">{jobProgress.error}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 justify-center">
            {jobProgress.status === "completed" && (
              <>
                <Button
                  onClick={() => navigate(`/agents/${jobProgress.agentId}`)}
                  data-testid="button-view-agent"
                >
                  View Agent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/agents")}
                  data-testid="button-go-to-agents"
                >
                  All Agents
                </Button>
              </>
            )}
            {jobProgress.status === "failed" && (
              <>
                <Button
                  onClick={() => navigate(`/agents/${jobProgress.agentId}`)}
                  data-testid="button-view-agent-failed"
                >
                  View Agent Anyway
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setJobProgress(null);
                    setCurrentStep(8);
                  }}
                  data-testid="button-back-to-wizard"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Back to Wizard
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (postCreationAgent) {
    const nextSteps = [
      {
        icon: PlugZap,
        title: "Link an MCP Server",
        description: "Connect a tool server so this agent can call APIs, query databases, and take actions.",
        href: "/integrations/mcp-servers",
        testId: "link-next-mcp-servers",
      },
      {
        icon: Layers,
        title: "Preview Context Layers",
        description: "Open Context Studio to see what knowledge, skills, and instructions the agent will receive at runtime.",
        href: "/context-studio",
        testId: "link-next-context-studio",
      },
      {
        icon: Rocket,
        title: "Activate the Agent",
        description: "Deploy this agent to start processing tasks. You can start in shadow mode to validate before going live.",
        href: `/agents/${postCreationAgent.id}?tab=lifecycle`,
        testId: "link-next-activate",
      },
      {
        icon: FlaskConical,
        title: "Run a Test Scenario",
        description: "Open the agent playground to run a test prompt and verify the agent responds correctly.",
        href: `/agents/${postCreationAgent.id}/playground`,
        testId: "link-next-playground",
      },
    ];

    return (
      <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto" data-testid="page-post-creation-guidance">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Agent created successfully</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{postCreationAgent.name}</span> is ready to be configured. Complete these steps to get it production-ready.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3" data-testid="next-steps-list">
          {nextSteps.map((step, i) => (
            <Card key={i} className="hover:border-primary/40 transition-colors" data-testid={`card-next-step-${i}`}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <step.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-sm font-medium">{step.title}</span>
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-primary"
                  onClick={() => navigate(step.href)}
                  data-testid={step.testId}
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => navigate(`/agents/${postCreationAgent.id}`)}
            data-testid="button-go-to-agent"
          >
            View Agent
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/agents")}
            data-testid="button-dismiss-next-steps"
          >
            All Agents
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 pb-20" data-testid="page-agent-wizard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Industry-Contextualized Agent Builder</h1>
          <p className="text-sm text-muted-foreground">Build industry-aware agents with pre-loaded regulatory context and golden templates</p>
        </div>
        {currentStep >= 1 && (
          <Button
            variant="outline"
            onClick={() => setAiPanelOpen(true)}
            data-testid="button-ai-assistant"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            AI Assistant
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 bg-background py-3 border-b -mx-6 px-6 sticky top-0 z-30">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center gap-2 flex-1" data-testid={`step-${step.number}`}>
            <button
              onClick={() => {
                if (step.number <= currentStep) setCurrentStep(step.number);
              }}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                currentStep === step.number
                  ? "text-foreground"
                  : currentStep > step.number
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 ${
                  currentStep === step.number
                    ? "bg-primary text-primary-foreground"
                    : currentStep > step.number
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > step.number ? <Check className="w-3.5 h-3.5" /> : step.number}
              </div>
              <span className="hidden md:inline whitespace-nowrap">{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-px ${currentStep > step.number ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {fromOutcome && wizardState.outcomeId && (() => {
        const lo = outcomes?.find((o) => o.id === wizardState.outcomeId);
        return lo ? (
          <Card className="border-primary/30 bg-primary/5 mb-4" data-testid="banner-outcome-context">
            <CardContent className="flex items-start gap-3 p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid="text-outcome-name">Creating agent for: {lo.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">Risk: {lo.riskTier}</Badge>
                  {outcomeKpis && outcomeKpis.length > 0 && (
                    <span className="text-[11px] text-muted-foreground" data-testid="text-outcome-kpi-count">
                      {outcomeKpis.length} KPI{outcomeKpis.length !== 1 ? "s" : ""}: {outcomeKpis.slice(0, 3).map(k => `${k.name} (${k.target} ${k.unit})`).join(", ")}{outcomeKpis.length > 3 ? ` +${outcomeKpis.length - 3} more` : ""}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Risk tier, guardrails, and evaluation thresholds have been pre-populated from the outcome contract.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      <div className="min-h-[400px]">
        {currentStep === 0 && (
          <Step1IndustryDefine state={wizardState} updateState={updateState} outcomes={outcomes} outcomeLockedFromUrl={outcomeLockedFromUrl} domainGlossary={domainGlossary} ontologyConceptCount={ontologyConcepts?.length || 0} isDynamicPreset={isDynamicPreset} dynamicAdjustments={dynamicAdjustments} setDynamicAdjustments={setDynamicAdjustments} setIsDynamicPreset={setIsDynamicPreset} dynamicPresetLoading={dynamicPresetLoading} fetchAndApplyDynamicPresets={fetchAndApplyDynamicPresets} applyDynamicPreset={applyDynamicPreset} adjustmentsExpanded={adjustmentsExpanded} setAdjustmentsExpanded={setAdjustmentsExpanded} />
        )}
        {currentStep === 1 && (
          <Step0GoldenTemplate
            creationPath={creationPath}
            onChoosePath={handleChoosePath}
            templates={templates}
            templatesLoading={templatesLoading}
            templateMatches={templateMatches}
            matchingInProgress={matchingInProgress}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onRunMatching={runAiMatching}
            wizardState={wizardState}
            outcomes={outcomes}
            onSelectOutcome={(outcomeId) => updateState({ outcomeId: outcomeId ?? "" })}
          />
        )}
        {currentStep === 2 && (
          <Step2ChooseBlueprint state={wizardState} updateState={updateState} />
        )}
        {currentStep === 3 && (
          <Step2IndustryTools state={wizardState} updateState={updateState} ontologyConcepts={ontologyConcepts || []} />
        )}
        {currentStep === 4 && (
          <Step3IndustryGovernance state={wizardState} updateState={updateState} ontologyGuardrails={dynamicOntologyGuardrails} />
        )}
        {currentStep === 5 && (
          <Step4MemoryContext state={wizardState} updateState={updateState} />
        )}
        {currentStep === 6 && (
          <Step6EvalSuite state={wizardState} updateState={updateState} />
        )}
        {currentStep === 7 && (
          <Step7RolloutPlan state={wizardState} updateState={updateState} />
        )}
        {currentStep === 8 && (
          <StepReview
            state={wizardState}
            onCreate={handleCreate}
            isPending={createMutation.isPending}
            outcomes={outcomes}
            domainGlossary={domainGlossary}
            glossaryConceptCount={ontologyConcepts?.length || 0}
            industryLabel={industry?.label || "Industry"}
            fromOutcome={fromOutcome}
            outcomeKpis={outcomeKpis}
            isDynamicPreset={isDynamicPreset}
            dynamicAdjustmentCount={dynamicAdjustments.length}
            onToggleOptionalSkill={(skillId: string) => {
              setWizardState(prev => {
                const sel = prev.templateSkills.selectedOptional;
                const newSel = sel.includes(skillId)
                  ? sel.filter(id => id !== skillId)
                  : [...sel, skillId];
                return { ...prev, templateSkills: { ...prev.templateSkills, selectedOptional: newSel } };
              });
            }}
          />
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-4 border-t pt-4 pb-4 px-6 bg-background z-50">
        <Button
          variant="outline"
          onClick={() => {
            setCurrentStep((s) => Math.max(0, s - 1));
          }}
          disabled={currentStep === 0}
          data-testid="button-back-step"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
        {currentStep < 8 ? (
          <Button
            onClick={() => {
              setCurrentStep((s) => Math.min(8, s + 1));
            }}
            disabled={currentStep === 0 && !wizardState.name}
            data-testid="button-next-step"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !wizardState.name}
            data-testid="button-create-agent"
          >
            {createMutation.isPending ? "Creating..." : "Create Agent"}
          </Button>
        )}
      </div>

      <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Assistant
            </SheetTitle>
            <SheetDescription>Get help designing your agent configuration</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-8">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Describe your agent use case and I'll help configure it.
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-md px-3 py-2 text-sm max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {msg.content}
                  {msg.role === "assistant" && msg.content === "" && aiStreaming && (
                    <span className="text-muted-foreground">Thinking...</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t p-4 flex items-center gap-2">
            <Input
              placeholder="Ask about agent design..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMessage()}
              disabled={aiStreaming}
              data-testid="input-ai-message"
            />
            <Button
              size="icon"
              onClick={sendAiMessage}
              disabled={aiStreaming || !aiInput.trim()}
              data-testid="button-send-ai-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface PromptVocabResult {
  valid: boolean;
  score: number;
  deprecatedTermsFound: Array<{ term: string; suggestedCanonical: string; conceptId: string }>;
  canonicalTermsUsed: string[];
}

function PromptVocabularyValidator({
  glossary,
  ontologyTags,
}: {
  glossary: string;
  ontologyTags: Array<{ conceptId: string; conceptLabel: string }>;
}) {
  const [result, setResult] = useState<PromptVocabResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastValidatedRef = useRef("");

  const runValidation = async () => {
    if (!glossary || ontologyTags.length === 0) return;
    const cacheKey = glossary + "||" + ontologyTags.map(t => t.conceptId).sort().join(",");
    if (cacheKey === lastValidatedRef.current) return;
    lastValidatedRef.current = cacheKey;
    setLoading(true);
    try {
      const res = await fetch("/api/validate-prompt-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: glossary, ontologyTags }),
      });
      if (res.ok) {
        const data: PromptVocabResult = await res.json();
        setResult(data);
      } else {
        setResult(null);
      }
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (glossary && ontologyTags.length > 0) {
      const timer = setTimeout(runValidation, 800);
      return () => clearTimeout(timer);
    }
  }, [glossary, JSON.stringify(ontologyTags.map(t => t.conceptId).sort())]);

  if (!glossary || ontologyTags.length === 0) return null;

  const deprecatedCount = result?.deprecatedTermsFound?.length || 0;
  const isAligned = result ? result.valid : null;

  return (
    <div className="flex flex-col gap-2" data-testid="prompt-vocabulary-validator">
      <div className="flex items-center gap-2 flex-wrap">
        {loading ? (
          <Badge variant="secondary" className="text-xs" data-testid="badge-prompt-vocab-loading">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />Validating vocabulary...
          </Badge>
        ) : isAligned === true ? (
          <Badge variant="default" className="text-xs bg-green-600" data-testid="badge-prompt-vocab-aligned">
            <CheckCircle className="w-3 h-3 mr-1" />Ontology Aligned
          </Badge>
        ) : isAligned === false ? (
          <Badge variant="secondary" className="text-xs bg-amber-500/80 text-white" data-testid="badge-prompt-vocab-deprecated">
            <AlertTriangle className="w-3 h-3 mr-1" />{deprecatedCount} deprecated term{deprecatedCount !== 1 ? "s" : ""}
          </Badge>
        ) : null}
        {result && result.canonicalTermsUsed.length > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="text-canonical-count">
            {result.canonicalTermsUsed.length} canonical term{result.canonicalTermsUsed.length !== 1 ? "s" : ""} used
          </span>
        )}
        {result && (
          <span className="text-xs text-muted-foreground" data-testid="text-vocab-score">
            Score: {result.score}%
          </span>
        )}
        {result && deprecatedCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-toggle-vocab-details"
            className="ml-auto"
          >
            <Info className="h-3.5 w-3.5 mr-1" />
            {expanded ? "Hide" : "Show"} Details
          </Button>
        )}
      </div>
      {expanded && result && deprecatedCount > 0 && (
        <div className="rounded-md border bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5" data-testid="vocab-deprecated-details">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Deprecated terms found in prompt vocabulary:</p>
          {result.deprecatedTermsFound.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" data-testid={`vocab-deprecated-term-${i}`}>
              <span className="text-amber-600 dark:text-amber-400 line-through">{d.term}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium">{d.suggestedCanonical}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground mt-1">
            These are soft warnings. The agent will still be created, but using canonical terms improves consistency.
          </p>
        </div>
      )}
    </div>
  );
}

function DomainTerminologyPreview({
  glossary,
  conceptCount,
  industryLabel,
  collapsed: initialCollapsed = true,
  ontologyTags,
}: {
  glossary: string;
  conceptCount: number;
  industryLabel: string;
  collapsed?: boolean;
  ontologyTags?: Array<{ conceptId: string; conceptLabel: string }>;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  if (!glossary) return null;

  return (
    <Card data-testid="card-domain-terminology">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Domain Terminology (Auto-injected)</p>
              <p className="text-xs text-muted-foreground">
                {conceptCount} {industryLabel} ontology terms will be embedded into this agent's system prompt
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs" data-testid="badge-glossary-status">
              <Check className="w-3 h-3 mr-1" />Active
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCollapsed(!collapsed)}
              data-testid="button-toggle-glossary-preview"
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              {collapsed ? "Preview" : "Hide"} Glossary
            </Button>
          </div>
        </div>
        {ontologyTags && ontologyTags.length > 0 && (
          <PromptVocabularyValidator glossary={glossary} ontologyTags={ontologyTags} />
        )}
        {!collapsed && (
          <div className="rounded-md border bg-muted/30 p-3 max-h-64 overflow-y-auto" data-testid="glossary-preview-content">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">{glossary}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OntologyTagSection({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (partial: Partial<WizardState>) => void;
}) {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [suggestedTags, setSuggestedTags] = useState<OntologyTag[]>([]);
  const [enrichedSkills, setEnrichedSkills] = useState<Array<{ originalSkill: string; enrichedDescription: string; ontologyConcepts: string[] }>>([]);

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/suggest-ontology-tags", {
        agentName: state.name,
        agentDescription: state.description,
        agentSkills: state.toolsConfig.map((t) => t.name),
        industry: industry?.label || "General",
        ontologyName: industry?.ontology || "industry standard",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSuggestedTags(data.suggestedTags || []);
      setEnrichedSkills(data.enrichedSkills || []);
      toast({ title: "Ontology tags suggested", description: `${(data.suggestedTags || []).length} concepts identified` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to suggest tags", description: err.message, variant: "destructive" });
    },
  });

  const addTag = (tag: OntologyTag) => {
    if (!state.ontologyTags.some((t) => t.conceptId === tag.conceptId)) {
      updateState({ ontologyTags: [...state.ontologyTags, tag] });
    }
  };

  const removeTag = (conceptId: string) => {
    updateState({ ontologyTags: state.ontologyTags.filter((t) => t.conceptId !== conceptId) });
  };

  if (!industry || industry.id === "custom") return null;

  return (
    <Card data-testid="card-ontology-tags">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Domain Ontology Tags</p>
              <p className="text-xs text-muted-foreground">
                Map this agent to {industry.ontology} concepts for domain-aware governance
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={suggestMutation.isPending || !state.name || !state.description}
            onClick={() => suggestMutation.mutate()}
            data-testid="button-suggest-ontology-tags"
          >
            {suggestMutation.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Suggest Tags</>
            )}
          </Button>
        </div>
        {(!state.name || !state.description) && (
          <p className="text-[11px] text-muted-foreground">Fill in agent name and description above to enable AI suggestions.</p>
        )}

        {state.ontologyTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="selected-ontology-tags">
            {state.ontologyTags.map((tag) => (
              <Badge
                key={tag.conceptId}
                variant="secondary"
                className="gap-1 cursor-pointer"
                onClick={() => removeTag(tag.conceptId)}
                data-testid={`badge-ontology-tag-${tag.conceptId}`}
              >
                {tag.conceptLabel}
                <Trash2 className="h-2.5 w-2.5" />
              </Badge>
            ))}
          </div>
        )}

        {suggestedTags.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Suggested Concepts</p>
            <div className="space-y-1.5">
              {suggestedTags
                .filter((st) => !state.ontologyTags.some((t) => t.conceptId === st.conceptId))
                .map((tag) => (
                  <div
                    key={tag.conceptId}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover-elevate"
                    onClick={() => addTag(tag)}
                    data-testid={`suggested-tag-${tag.conceptId}`}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium">{tag.conceptLabel}</span>
                      {tag.reasoning && (
                        <p className="text-[10px] text-muted-foreground truncate">{tag.reasoning}</p>
                      )}
                    </div>
                    {tag.relevanceScore != null && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {Math.round(tag.relevanceScore * 100)}%
                      </Badge>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {enrichedSkills.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Enriched Skill Descriptions</p>
            {enrichedSkills.map((skill, idx) => (
              <div key={idx} className="p-2 rounded-md bg-muted/30 space-y-1" data-testid={`enriched-skill-${idx}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{skill.originalSkill}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{skill.enrichedDescription}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {skill.ontologyConcepts.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Step1IndustryDefine({
  state,
  updateState,
  outcomes,
  outcomeLockedFromUrl,
  domainGlossary,
  ontologyConceptCount,
  isDynamicPreset,
  dynamicAdjustments,
  setDynamicAdjustments,
  setIsDynamicPreset,
  dynamicPresetLoading,
  fetchAndApplyDynamicPresets,
  applyDynamicPreset,
  adjustmentsExpanded,
  setAdjustmentsExpanded,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  outcomes: OutcomeContract[] | undefined;
  domainGlossary?: string;
  ontologyConceptCount?: number;
  outcomeLockedFromUrl?: boolean;
  isDynamicPreset: boolean;
  dynamicAdjustments: DynamicPresetAdjustment[];
  setDynamicAdjustments: (v: DynamicPresetAdjustment[]) => void;
  setIsDynamicPreset: (v: boolean) => void;
  dynamicPresetLoading: boolean;
  fetchAndApplyDynamicPresets: (indId: string, ontTags: OntologyTag[], outcomeIdVal?: string) => Promise<DynamicPresetResponse | null>;
  applyDynamicPreset: (data: DynamicPresetResponse, overrideIndustryId?: string) => void;
  adjustmentsExpanded: boolean;
  setAdjustmentsExpanded: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const linkedOutcome = outcomeLockedFromUrl && outcomes ? outcomes.find((o) => o.id === state.outcomeId) : null;
  const { data: llmProviders } = useQuery<Array<{ name: string; displayName: string; configured: boolean; models: Array<{ id: string; name: string; costPer1kInput: number; costPer1kOutput: number; contextWindow: number }> }>>({
    queryKey: ["/api/llm-providers"],
  });
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="text-lg font-medium">Define Your Agent</h2>
      <p className="text-sm text-muted-foreground">
        Describe your agent and optionally auto-configure it with industry-specific context, tools, and compliance rules.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-name">Agent Name *</Label>
          <Input
            id="wizard-name"
            value={state.name}
            onChange={(e) => updateState({ name: e.target.value })}
            placeholder="e.g., Customer Support Agent"
            data-testid="input-agent-name"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-desc">Description</Label>
          <Textarea
            id="wizard-desc"
            value={state.description}
            onChange={(e) => updateState({ description: e.target.value })}
            placeholder="What does this agent do? Describe the use case, goals, and expected outcomes..."
            data-testid="input-agent-description"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-owner">Owner</Label>
          <Input
            id="wizard-owner"
            value={state.owner}
            onChange={(e) => updateState({ owner: e.target.value })}
            placeholder="Team or person responsible"
            data-testid="input-agent-owner"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Risk Tier</Label>
            <Select value={state.riskTier} onValueChange={(v) => updateState({ riskTier: v })}>
              <SelectTrigger data-testid="select-risk-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Autonomy Mode</Label>
            <Select value={state.autonomyMode} onValueChange={(v) => updateState({ autonomyMode: v })}>
              <SelectTrigger data-testid="select-autonomy-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="assisted">Assisted</SelectItem>
                <SelectItem value="autonomous">Autonomous</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {industry && industry.id !== "custom" && INDUSTRY_PRESETS[industry.id] && (
          <Card data-testid="card-industry-preset" className={state.industryAutoApplied ? "ring-1 ring-green-500/30" : ""}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <industry.icon className="h-4 w-4 shrink-0" style={{ color: industry.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {state.industryAutoApplied ? `${industry.label} Defaults Active` : `Auto-Configure for ${industry.label}`}
                        {isDynamicPreset && dynamicAdjustments.length > 0 && (
                          <Badge variant="secondary" className="ml-2 text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" data-testid="badge-dynamic-adjustments-count">
                            {dynamicAdjustments.length} adjustment{dynamicAdjustments.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {state.industryAutoApplied
                          ? isDynamicPreset
                            ? "Dynamically tailored from ontology tags and outcome requirements"
                            : "Industry defaults were auto-applied on entry. Click to re-apply if you've customized."
                          : "Apply recommended model, industry MCP tools, compliance guardrails, context budget, and memory governance"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={state.industryAutoApplied ? "outline" : "default"}
                    disabled={dynamicPresetLoading}
                    onClick={async () => {
                      const data = await fetchAndApplyDynamicPresets(industry.id, state.ontologyTags, state.outcomeId || undefined);
                      if (data) {
                        applyDynamicPreset(data, industry.id);
                        toast({ title: data.isDynamic ? "Dynamic presets applied" : "Industry defaults applied", description: data.isDynamic ? `${data.adjustments.length} setting(s) tailored to your ontology and outcome context` : "Standard industry configuration applied" });
                      } else {
                        const preset = INDUSTRY_PRESETS[industry.id];
                        const ctx = INDUSTRY_CONTEXT_CONFIG[industry.id];
                        if (!ctx) return;
                        const industryTools: ToolConfig[] = ctx.mcpTools.map((t) => ({ ...t }));
                        updateState({
                          industryId: industry.id,
                          riskTier: preset.riskTier,
                          autonomyMode: preset.autonomyMode,
                          modelName: ctx.recommendedModel.model,
                          modelProvider: ctx.recommendedModel.provider,
                          guardrailsConfig: { ...state.guardrailsConfig, stopConditions: preset.stopConditions, escalationTriggers: preset.escalationTriggers, forbiddenOutputs: preset.forbiddenOutputs, allowedActions: preset.allowedActions },
                          toolsConfig: [...state.toolsConfig, ...industryTools.filter((t) => !state.toolsConfig.some((existing) => existing.name === t.name))],
                          contextBudget: ctx.contextBudgetPreset,
                          memoryGovernanceRules: ctx.memoryGovernance,
                          industryAutoApplied: true,
                        });
                        setDynamicAdjustments([]);
                        setIsDynamicPreset(false);
                      }
                    }}
                    data-testid="button-auto-configure-industry"
                  >
                    {dynamicPresetLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                    {state.industryAutoApplied ? "Re-apply Defaults" : "Auto-Configure from Industry"}
                  </Button>
                </div>
                {state.industryAutoApplied && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${isDynamicPreset ? "border-purple-500/30 text-purple-600 dark:text-purple-400" : "border-green-500/30 text-green-600 dark:text-green-400"}`}>
                      <Check className="w-2.5 h-2.5 mr-1" />
                      {isDynamicPreset ? "Dynamic presets active" : "Industry context applied"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{INDUSTRY_CONTEXT_CONFIG[industry.id]?.mcpTools.length || 0} tools</Badge>
                    <Badge variant="outline" className="text-[10px]">{INDUSTRY_CONTEXT_CONFIG[industry.id]?.memoryGovernance.length || 0} governance rules</Badge>
                    <Badge variant="outline" className="text-[10px]">{INDUSTRY_CONTEXT_CONFIG[industry.id]?.compliancePrerequisites.length || 0} compliance items</Badge>
                  </div>
                )}
                {state.industryAutoApplied && dynamicAdjustments.length > 0 && (
                  <div className="border-t pt-3" data-testid="section-preset-adjustments">
                    <button
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                      onClick={() => setAdjustmentsExpanded(!adjustmentsExpanded)}
                      data-testid="button-toggle-adjustments"
                    >
                      {adjustmentsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Preset Adjustments ({dynamicAdjustments.length})
                    </button>
                    {adjustmentsExpanded && (
                      <div className="mt-2 space-y-1.5">
                        {(() => {
                          const ontAdj = dynamicAdjustments.filter((a) => a.source === "ontology");
                          const outAdj = dynamicAdjustments.filter((a) => a.source === "outcome");
                          return (
                            <>
                              {ontAdj.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">From Ontology</p>
                                  {ontAdj.map((adj, i) => (
                                    <div key={`ont-${i}`} className="flex items-start gap-2 py-1 text-xs" data-testid={`adjustment-ontology-${i}`}>
                                      <ArrowRightLeft className="h-3 w-3 mt-0.5 text-purple-500 shrink-0" />
                                      <div className="min-w-0">
                                        <span className="font-medium">{adj.field}</span>
                                        <span className="text-muted-foreground"> {adj.from} → {adj.to}</span>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{adj.reason}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {outAdj.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">From Outcome Requirements</p>
                                  {outAdj.map((adj, i) => (
                                    <div key={`out-${i}`} className="flex items-start gap-2 py-1 text-xs" data-testid={`adjustment-outcome-${i}`}>
                                      <ArrowRightLeft className="h-3 w-3 mt-0.5 text-blue-500 shrink-0" />
                                      <div className="min-w-0">
                                        <span className="font-medium">{adj.field}</span>
                                        <span className="text-muted-foreground"> {adj.from} → {adj.to}</span>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{adj.reason}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                {state.industryAutoApplied && !isDynamicPreset && (
                  <div className="text-[10px] text-muted-foreground italic border-t pt-2">
                    Add ontology tags or bind an outcome to get tailored presets instead of static industry defaults
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {industry && industry.id !== "custom" && industry.departments.length > 0 && (
          <Card data-testid="card-agent-department">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Department</p>
                  <p className="text-xs text-muted-foreground">
                    Assign this agent to a department for targeted policy and regulation filtering
                  </p>
                </div>
              </div>
              <Select value={state.department || "_none"} onValueChange={(v) => updateState({ department: v === "_none" ? "" : v })}>
                <SelectTrigger data-testid="select-agent-department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {industry.departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
        <OntologyTagSection state={state} updateState={updateState} />
        {domainGlossary && (
          <DomainTerminologyPreview
            glossary={domainGlossary}
            conceptCount={ontologyConceptCount || 0}
            industryLabel={industry?.label || "Industry"}
            ontologyTags={state.ontologyTags}
          />
        )}
        {outcomeLockedFromUrl && linkedOutcome ? (
          <div className="flex flex-col gap-2">
            <Label>Linked Outcome</Label>
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border" data-testid="locked-outcome">
              <Target className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{linkedOutcome.name}</span>
              <Badge variant="secondary" className="ml-auto">Pre-linked</Badge>
            </div>
            <span className="text-xs text-muted-foreground">This agent is being created for a specific outcome contract.</span>
          </div>
        ) : outcomes && outcomes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Link to Outcome</Label>
            <Select value={state.outcomeId || "_none"} onValueChange={(v) => updateState({ outcomeId: v === "_none" ? "" : v })}>
              <SelectTrigger data-testid="select-outcome">
                <SelectValue placeholder="Select an outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {outcomes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Step0GoldenTemplate({
  creationPath,
  onChoosePath,
  templates,
  templatesLoading,
  templateMatches,
  matchingInProgress,
  selectedTemplateId,
  onSelectTemplate,
  onRunMatching,
  wizardState,
  outcomes,
  onSelectOutcome,
}: {
  creationPath: CreationPath;
  onChoosePath: (path: CreationPath) => void;
  templates: AgentTemplate[] | undefined;
  templatesLoading: boolean;
  templateMatches: TemplateMatch[];
  matchingInProgress: boolean;
  selectedTemplateId: string | null;
  onSelectTemplate: (t: AgentTemplate) => void;
  onRunMatching: () => void;
  wizardState: WizardState;
  outcomes: OutcomeContract[] | undefined;
  onSelectOutcome: (outcomeId: string | null) => void;
}) {
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  if (creationPath === "template") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-medium">Template Suggestions</h2>
            <p className="text-sm text-muted-foreground">
              {matchingInProgress
                ? "AI is analyzing your requirements against our template library..."
                : "AI-ranked templates based on your agent description and requirements"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              data-testid="button-toggle-all-templates"
            >
              {showAllTemplates ? "Show AI Suggestions" : "Browse All Templates"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChoosePath(null)}
              data-testid="button-change-path"
            >
              Change Path
            </Button>
          </div>
        </div>

        {matchingInProgress && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Analyzing your requirements...</p>
            <p className="text-xs text-muted-foreground">
              Matching "{wizardState.name}" against {templates?.length || 0} templates
            </p>
          </div>
        )}

        {!matchingInProgress && !showAllTemplates && templateMatches.length > 0 && (
          <div className="flex flex-col gap-3">
            {templateMatches.map((match) => {
              const template = templates?.find((t) => t.id === match.id);
              if (!template) return null;
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              const isSelected = selectedTemplateId === template.id;
              return (
                <Card
                  key={match.id}
                  className={`hover-elevate cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => onSelectTemplate(template)}
                  data-testid={`match-card-${match.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{template.name}</h3>
                          <Badge
                            variant={match.matchScore >= 80 ? "default" : match.matchScore >= 50 ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {match.matchScore}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {template.description}
                        </p>
                        <div className="mt-2 p-2 bg-muted/50 rounded-md">
                          <p className="text-xs text-muted-foreground">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            {match.reasoning}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
                        <Badge variant="outline" className="text-[10px]">{template.complexity}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!matchingInProgress && !showAllTemplates && templateMatches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Library className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No AI suggestions available. Browse templates manually or try again.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRunMatching} data-testid="button-retry-matching">
                Retry AI Matching
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAllTemplates(true)}>
                Browse All
              </Button>
            </div>
          </div>
        )}

        {!matchingInProgress && showAllTemplates && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templatesLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="animate-pulse flex flex-col gap-3">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-md bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                      <div className="h-8 bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            {templates?.map((template) => {
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              const match = templateMatches.find((m) => m.id === template.id);
              return (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => onSelectTemplate(template)}
                  data-testid={`template-card-${template.id}`}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{template.complexity}</Badge>
                      {match && (
                        <Badge variant="default" className="text-[10px] ml-auto">
                          {match.matchScore}% match
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selectedTemplateId && (
          <div className="flex flex-col gap-3" data-testid="outcome-selector-panel">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Link to a Business Outcome <span className="text-muted-foreground font-normal">(optional)</span></h3>
                <p className="text-xs text-muted-foreground">Connect this agent to a business goal so its performance is tracked against your KPI targets.</p>
              </div>
              {wizardState.outcomeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs shrink-0"
                  onClick={() => onSelectOutcome(null)}
                  data-testid="button-clear-outcome"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            {(outcomes?.filter((o) => o.status === "active") ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-no-outcomes">
                {!outcomes || outcomes.length === 0
                  ? "No outcomes configured yet. You can link one later from the agent detail page."
                  : "No active outcomes available. You can activate one from the Outcomes section and link it later."}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="outcome-option-list">
                {(outcomes?.filter((o) => o.status === "active") ?? []).map((outcome) => {
                  const isSelected = wizardState.outcomeId === outcome.id;
                  return (
                    <button
                      key={outcome.id}
                      type="button"
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:border-primary/40 ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background"}`}
                      onClick={() => onSelectOutcome(isSelected ? null : outcome.id)}
                      data-testid={`outcome-option-${outcome.id}`}
                    >
                      <div className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5 bg-background">
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{outcome.name}</p>
                        {outcome.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{outcome.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[9px]">{outcome.riskTier}</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-lg font-medium">Start Building Your Agent</h2>
      <p className="text-sm text-muted-foreground">
        Industry golden templates come pre-loaded with regulatory context, compliance guardrails, and domain-specific tools. Or start from scratch with full control.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="hover-elevate cursor-pointer ring-1 ring-primary/20"
          onClick={() => onChoosePath("template")}
          data-testid="path-template"
        >
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center">
              <Library className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Start from Industry Golden Template</h3>
              <p className="text-xs text-muted-foreground mt-1">
                AI matches your requirements to pre-built templates with industry context, compliance rules, and domain tools already configured
              </p>
            </div>
            <Badge className="text-[10px]">Recommended</Badge>
          </CardContent>
        </Card>

        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onChoosePath("manual")}
          data-testid="path-manual"
        >
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center">
              <Wrench className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Build from Scratch</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Full manual control over every setting. You can still auto-apply industry context later in the wizard.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">Advanced</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Step2ChooseBlueprint({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
}) {
  const { data: blueprints, isLoading } = useQuery<any[]>({
    queryKey: ["/api/blueprints"],
  });

  const PATTERN_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    linear_chain: { label: "Linear Chain", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: "arrow-right" },
    fan_out: { label: "Fan Out", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: "split" },
    orchestrator: { label: "Orchestrator", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: "network" },
    rag_pipeline: { label: "RAG Pipeline", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: "database" },
    human_in_loop: { label: "Human-in-Loop", color: "bg-rose-500/10 text-rose-600 border-rose-500/20", icon: "user" },
    custom: { label: "Custom", color: "bg-slate-500/10 text-slate-600 border-slate-500/20", icon: "settings" },
  };

  const availableBlueprints = (blueprints || []).filter(
    (bp: any) => bp.isShared || bp.status === "signed" || bp.status === "compiled"
  );

  const groupedByPattern = availableBlueprints.reduce((acc: Record<string, any[]>, bp: any) => {
    const pattern = bp.patternType || "custom";
    if (!acc[pattern]) acc[pattern] = [];
    acc[pattern].push(bp);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedPatterns = Object.keys(groupedByPattern).sort((a, b) => {
    const order = ["linear_chain", "orchestrator", "fan_out", "rag_pipeline", "human_in_loop", "custom"];
    return order.indexOf(a) - order.indexOf(b);
  });

  return (
    <div className="space-y-6" data-testid="step-choose-blueprint">
      <div>
        <h3 className="text-lg font-semibold">Choose a Blueprint</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select a shared blueprint to pre-configure this agent's workflow pattern, or skip to build from scratch.
        </p>
      </div>

      {state.blueprintId && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Selected: {state.blueprintName}</p>
            <p className="text-xs text-muted-foreground">Blueprint will be applied to this agent</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateState({ blueprintId: null, blueprintName: null })}
            data-testid="button-clear-blueprint"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : availableBlueprints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-2">
            <Layers className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No shared blueprints available yet</p>
            <p className="text-xs text-muted-foreground">Create and share blueprints in the Blueprint Library to see them here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {sortedPatterns.map((pattern) => {
            const patternInfo = PATTERN_LABELS[pattern] || PATTERN_LABELS.custom;
            const bps = groupedByPattern[pattern];
            return (
              <div key={pattern} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${patternInfo.color}`}>
                    {patternInfo.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{bps.length} blueprint{bps.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bps.map((bp: any) => {
                    const isSelected = state.blueprintId === bp.id;
                    const nodeCount = Array.isArray(bp.blueprintJson?.nodes) ? bp.blueprintJson.nodes.length : 0;
                    return (
                      <Card
                        key={bp.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                          isSelected ? "ring-2 ring-primary border-primary/30 shadow-sm" : "hover:border-primary/20"
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            updateState({ blueprintId: null, blueprintName: null });
                          } else {
                            updateState({ blueprintId: bp.id, blueprintName: bp.name });
                          }
                        }}
                        data-testid={`card-blueprint-${bp.id}`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{bp.name}</p>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{bp.description}</p>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {nodeCount > 0 && (
                              <Badge variant="secondary" className="text-[9px]">{nodeCount} nodes</Badge>
                            )}
                            <Badge variant="outline" className="text-[9px]">{bp.status}</Badge>
                            {bp.isShared && (
                              <Badge variant="outline" className="text-[9px] text-green-600 border-green-500/20">Shared</Badge>
                            )}
                            {bp.tags?.length > 0 && bp.tags.slice(0, 2).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-[9px]">{tag}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card
        className={`cursor-pointer transition-all duration-200 hover:shadow-md border-dashed ${
          !state.blueprintId ? "ring-2 ring-primary border-primary/30 shadow-sm" : "hover:border-primary/20"
        }`}
        onClick={() => updateState({ blueprintId: null, blueprintName: null })}
        data-testid="card-blueprint-blank"
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Start Blank</p>
            <p className="text-xs text-muted-foreground">Configure the agent workflow manually without a blueprint</p>
          </div>
          {!state.blueprintId && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Step2IndustryTools({
  state,
  updateState,
  ontologyConcepts,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  ontologyConcepts: Array<{ id: string; label: string; category: string; description: string; synonyms: string[] | null }>;
}) {
  const { toast } = useToast();
  const { data: llmProviders } = useQuery<Array<{ name: string; displayName: string; configured: boolean; models: Array<{ id: string; name: string; costPer1kInput: number; costPer1kOutput: number; contextWindow: number }> }>>({
    queryKey: ["/api/llm-providers"],
  });
  const [catalogFilter, setCatalogFilter] = useState<string>("all");
  const [showCatalog, setShowCatalog] = useState(false);
  const [expandedParams, setExpandedParams] = useState<Record<number, boolean>>({});
  const [addingParamIdx, setAddingParamIdx] = useState<number | null>(null);
  const [newParamName, setNewParamName] = useState("");
  const [newParamDesc, setNewParamDesc] = useState("");
  const [newParamType, setNewParamType] = useState("string");

  function addToolFromCatalog(catalogTool: ToolConfig) {
    const alreadyAdded = state.toolsConfig.some(t => t.name === catalogTool.name);
    if (!alreadyAdded) {
      updateState({ toolsConfig: [...state.toolsConfig, { ...catalogTool }] });
    }
  }

  function addCustomTool() {
    updateState({ toolsConfig: [...state.toolsConfig, { name: "", description: "", permissionScope: "READ", accessTier: "STANDARD", parameters: [] }] });
  }

  function removeTool(i: number) {
    updateState({ toolsConfig: state.toolsConfig.filter((_, idx) => idx !== i) });
  }

  function updateTool(i: number, field: keyof ToolConfig, value: string | number | boolean | string[] | ToolParam[]) {
    const updated = [...state.toolsConfig];
    updated[i] = { ...updated[i], [field]: value };
    updateState({ toolsConfig: updated });
  }

  function addParamToTool(toolIdx: number) {
    if (!newParamName.trim()) return;
    const params = [...(state.toolsConfig[toolIdx].parameters || [])];
    params.push({ name: newParamName.trim(), description: newParamDesc.trim(), type: newParamType });
    updateTool(toolIdx, "parameters", params);
    setNewParamName("");
    setNewParamDesc("");
    setNewParamType("string");
    setAddingParamIdx(null);
  }

  function removeParam(toolIdx: number, paramIdx: number) {
    const params = [...(state.toolsConfig[toolIdx].parameters || [])];
    params.splice(paramIdx, 1);
    updateTool(toolIdx, "parameters", params);
  }

  function updateParam(toolIdx: number, paramIdx: number, field: keyof ToolParam, value: string | boolean | undefined) {
    const params = [...(state.toolsConfig[toolIdx].parameters || [])];
    params[paramIdx] = { ...params[paramIdx], [field]: value };
    updateTool(toolIdx, "parameters", params);
  }

  function unenrichParam(toolIdx: number, paramIdx: number) {
    const params = [...(state.toolsConfig[toolIdx].parameters || [])];
    const param = params[paramIdx];
    if (!param.enrichedFrom) return;
    const conceptLabel = param.enrichedFrom;
    const enrichPattern = new RegExp(`\\s*\\(${conceptLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)\\s*$`);
    const cleanedDesc = param.description.replace(enrichPattern, "").trim();
    const altPattern = new RegExp(`\\s*\\([^)]*${conceptLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*\\)\\s*$`);
    const finalDesc = cleanedDesc || param.description.replace(altPattern, "").trim();
    params[paramIdx] = { ...param, description: finalDesc || param.description, enrichedFrom: undefined };
    updateTool(toolIdx, "parameters", params);
  }

  function enrichToolWithOntology(toolIdx: number) {
    if (!ontologyConcepts || ontologyConcepts.length === 0) {
      toast({ title: "No ontology loaded", description: "Configure your industry workspace to load domain terminology", variant: "destructive" });
      return;
    }
    const tool = state.toolsConfig[toolIdx];
    const params = tool.parameters || [];
    if (params.length === 0) {
      toast({ title: "No parameters", description: "Add parameters to this tool before enriching", variant: "destructive" });
      return;
    }

    let enrichedCount = 0;
    const enrichedParams = params.map((param) => {
      if (param.enrichedFrom) return param;

      const paramNameLower = param.name.toLowerCase().replace(/[_-]/g, " ");
      const paramWords = paramNameLower.split(" ");

      for (const concept of ontologyConcepts) {
        const labelLower = concept.label.toLowerCase();
        const synonymsLower = (concept.synonyms || []).map(s => s.toLowerCase());

        const labelWords = labelLower.split(/[\s_-]+/);
        const exactMatch = paramNameLower === labelLower || paramNameLower === labelLower.replace(/\s+/g, "_");
        const synonymMatch = synonymsLower.some(s => paramNameLower.includes(s.replace(/\s+/g, " ")) || s.replace(/\s+/g, "_") === param.name.toLowerCase());
        const substringMatch = paramWords.some(w => w.length > 2 && labelWords.some(lw => lw.length > 2 && (lw.includes(w) || w.includes(lw))));
        const acronymParts = param.name.split("_");
        const acronymMatch = acronymParts.some(part => {
          const partLower = part.toLowerCase();
          return partLower.length >= 2 && (
            labelLower === partLower ||
            synonymsLower.includes(partLower) ||
            labelWords.some(lw => lw === partLower)
          );
        });

        if (exactMatch || synonymMatch || substringMatch || acronymMatch) {
          const acronymStr = concept.synonyms && concept.synonyms.length > 0
            ? ` (${concept.synonyms[0]} = ${concept.label}`
            : ` (${concept.label}`;
          const enrichment = `${acronymStr}, ${concept.description})`;

          if (!param.description.includes(concept.label)) {
            enrichedCount++;
            const baseDesc = param.description || param.name.replace(/[_-]/g, " ");
            return {
              ...param,
              description: `${baseDesc} ${enrichment}`.trim(),
              enrichedFrom: concept.label,
            };
          }
        }
      }
      return param;
    });

    if (enrichedCount > 0) {
      updateTool(toolIdx, "parameters", enrichedParams);
      setExpandedParams(prev => ({ ...prev, [toolIdx]: true }));
      toast({ title: `${enrichedCount} parameter(s) enriched`, description: "Ontology definitions appended to parameter descriptions" });
    } else {
      toast({ title: "No matches found", description: "No parameter names matched ontology concepts. Try adding more concepts to your knowledge graph." });
    }
  }

  function updatePermission(field: "dataAccess" | "apiAccess" | "writeAccess", value: string) {
    updateState({
      permissionsConfig: {
        ...state.permissionsConfig,
        [field]: value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
  }

  const tierColors: Record<string, string> = {
    OPEN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    STANDARD: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    RESTRICTED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    CRITICAL: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  const scopeColors: Record<string, string> = {
    READ: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    WRITE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    EXECUTE: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    ADMIN: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  const filteredCatalog = catalogFilter === "all" ? TOOL_CATALOG : TOOL_CATALOG.filter(t => t.accessTier === catalogFilter);

  const { industry } = useIndustry();
  const industryCtx = industry && industry.id !== "custom" ? INDUSTRY_CONTEXT_CONFIG[industry.id] : null;

  const sensitivityColors: Record<string, string> = {
    phi: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    pci: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    pii: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    financial_data: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    credit_data: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    clinical_data: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    sanctions_data: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h2 className="text-lg font-medium">Model & Tools Configuration</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Model Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Model Provider</Label>
              <Select value={state.modelProvider} onValueChange={(v) => {
                updateState({ modelProvider: v });
                const prov = llmProviders?.find((p: any) => p.name === v);
                if (prov && prov.models.length > 0) {
                  updateState({ modelName: prov.models[0].id });
                }
              }}>
                <SelectTrigger data-testid="select-model-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {llmProviders?.filter((p: any) => p.models.length > 0).map((p: any) => (
                    <SelectItem key={p.name} value={p.name}>
                      <span className="flex items-center gap-2">
                        {p.displayName}
                        {p.configured ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">(not configured)</span>
                        )}
                      </span>
                    </SelectItem>
                  )) || (
                    <>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Model Name</Label>
              {(() => {
                const providerModels = llmProviders?.find((p: any) => p.name === state.modelProvider)?.models || [];
                return providerModels.length > 0 ? (
                  <Select value={state.modelName} onValueChange={(v: string) => updateState({ modelName: v })}>
                    <SelectTrigger data-testid="input-model-name">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            {m.name}
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ${m.costPer1kInput.toFixed(4)}/1K in
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={state.modelName}
                    onChange={(e: any) => updateState({ modelName: e.target.value })}
                    placeholder="e.g., gpt-4.1"
                    data-testid="input-model-name"
                  />
                );
              })()}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="max-tool-iterations">Max Tool Iterations</Label>
              <div className="group relative">
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2 rounded-md bg-popover text-popover-foreground text-xs border z-50">
                  Maximum number of tool-calling rounds the agent can perform per request. Higher values allow more complex multi-step reasoning but increase latency and cost.
                </div>
              </div>
            </div>
            <Input
              id="max-tool-iterations"
              type="number"
              min={1}
              max={20}
              value={state.maxToolIterations}
              onChange={(e: any) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  updateState({ maxToolIterations: Math.min(20, Math.max(1, val)) });
                }
              }}
              data-testid="input-max-tool-iterations"
            />
            <span className="text-[11px] text-muted-foreground">Range: 1–20 (default: 5)</span>
          </div>

          {industryCtx && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Industry Model Benchmarks</span>
              <div className="flex flex-col gap-1.5">
                {industryCtx.modelBenchmarks.map((bm) => (
                  <div key={bm.model} className="flex items-center gap-3 p-2 rounded-md border" data-testid={`benchmark-${bm.model}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-mono font-medium">{bm.model}</span>
                      <Badge variant="outline" className="text-[9px]">{bm.provider}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${bm.score}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8">{bm.score}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground max-w-[200px] truncate">{bm.reasoning}</p>
                    {bm.model === industryCtx.recommendedModel.model && (
                      <Badge variant="default" className="text-[9px]">Recommended</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">MCP Tool Registry</CardTitle>
            {state.toolsConfig.length > 0 && <Badge variant="outline" className="text-[10px]">{state.toolsConfig.length} selected</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCatalog(!showCatalog)} data-testid="button-toggle-catalog">
              <Library className="w-3.5 h-3.5 mr-1" /> {showCatalog ? "Hide" : "Browse"} Catalog
            </Button>
            <Button variant="outline" size="sm" onClick={addCustomTool} data-testid="button-add-custom-tool">
              <Plus className="w-3.5 h-3.5 mr-1" /> Custom Tool
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {showCatalog && (
            <div className="flex flex-col gap-3 pb-4 border-b">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Filter:</span>
                {["all", "OPEN", "STANDARD", "RESTRICTED", "CRITICAL"].map(tier => (
                  <Button
                    key={tier}
                    variant={catalogFilter === tier ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCatalogFilter(tier)}
                    data-testid={`button-filter-tier-${tier.toLowerCase()}`}
                  >
                    {tier === "all" ? "All" : tier}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredCatalog.map(tool => {
                  const isSelected = state.toolsConfig.some(t => t.name === tool.name);
                  return (
                    <div
                      key={tool.name}
                      className={`flex flex-col gap-2 p-3 rounded-md border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover-elevate"}`}
                      onClick={() => !isSelected && addToolFromCatalog(tool)}
                      data-testid={`catalog-tool-${tool.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium font-mono">{tool.name}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[9px] ${tierColors[tool.accessTier || "STANDARD"]}`}>
                            {tool.accessTier}
                          </Badge>
                          <Badge variant="outline" className={`text-[9px] ${scopeColors[tool.permissionScope || "READ"]}`}>
                            {tool.permissionScope}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tool.rateLimit}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${tool.costPerCall}/call</span>
                        {tool.parameters && tool.parameters.length > 0 && (
                          <span className="flex items-center gap-1"><Settings className="w-3 h-3" />{tool.parameters.length} params</span>
                        )}
                        {tool.writeAccess && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Write</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tool.dataClasses?.map(dc => {
                          const scKey = dc.toLowerCase();
                          const scColor = sensitivityColors[scKey] || "bg-muted text-muted-foreground";
                          return (
                            <Badge key={dc} variant="outline" className={`text-[9px] ${scColor}`}>{dc.toUpperCase()}</Badge>
                          );
                        })}
                      </div>
                      {isSelected && (
                        <Badge variant="default" className="text-[9px] w-fit">Selected</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {state.toolsConfig.length === 0 && !showCatalog && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tools configured. Browse the catalog or add a custom tool.
            </p>
          )}

          {state.toolsConfig.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Selected Tools</span>
              {state.toolsConfig.map((tool, i) => {
                const params = tool.parameters || [];
                const enrichedCount = params.filter(p => p.enrichedFrom).length;
                const isExpanded = expandedParams[i];
                return (
                <div key={i} className="flex flex-col gap-0 rounded-md border" data-testid={`selected-tool-${i}`}>
                  <div className="flex items-start gap-2 p-3">
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tool.name ? (
                          <span className="text-xs font-medium font-mono">{tool.name}</span>
                        ) : (
                          <Input
                            placeholder="Tool name"
                            value={tool.name}
                            onChange={(e) => updateTool(i, "name", e.target.value)}
                            className="h-7 text-xs w-48"
                            data-testid={`input-tool-name-${i}`}
                          />
                        )}
                        {tool.accessTier && (
                          <Badge variant="outline" className={`text-[9px] ${tierColors[tool.accessTier]}`}>
                            {tool.accessTier}
                          </Badge>
                        )}
                        {tool.permissionScope && (
                          <Badge variant="outline" className={`text-[9px] ${scopeColors[tool.permissionScope]}`}>
                            {tool.permissionScope}
                          </Badge>
                        )}
                        {enrichedCount > 0 && (
                          <Badge variant="secondary" className="text-[9px] text-emerald-600 dark:text-emerald-400">
                            <BookOpen className="w-3 h-3 mr-0.5" />
                            {enrichedCount} enriched
                          </Badge>
                        )}
                      </div>
                      {!tool.description && !TOOL_CATALOG.some(c => c.name === tool.name) ? (
                        <Input
                          placeholder="Tool description"
                          value={tool.description}
                          onChange={(e) => updateTool(i, "description", e.target.value)}
                          className="h-7 text-xs"
                          data-testid={`input-tool-desc-${i}`}
                        />
                      ) : (
                        <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {tool.rateLimit && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tool.rateLimit}</span>}
                        {tool.costPerCall !== undefined && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${tool.costPerCall}/call</span>}
                        {tool.failureModes && tool.failureModes.length > 0 && (
                          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{tool.failureModes.length} failure modes</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedParams(prev => ({ ...prev, [i]: !prev[i] }))}
                          data-testid={`button-toggle-params-${i}`}
                        >
                          <Settings className="w-3.5 h-3.5 mr-1" />
                          Parameters ({params.length})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => enrichToolWithOntology(i)}
                          disabled={ontologyConcepts.length === 0 || params.length === 0}
                          title={ontologyConcepts.length === 0 ? "Select an industry with ontology concepts to enable enrichment" : params.length === 0 ? "Add parameters to this tool before enriching" : "Match parameter names against domain ontology and append definitions"}
                          data-testid={`button-enrich-ontology-${i}`}
                        >
                          <BookOpen className="w-3.5 h-3.5 mr-1" />
                          Enrich with Ontology
                        </Button>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeTool(i)} data-testid={`button-remove-tool-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-3 pb-3 pt-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tool Parameters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setAddingParamIdx(addingParamIdx === i ? null : i); setNewParamName(""); setNewParamDesc(""); }}
                          data-testid={`button-add-param-${i}`}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      </div>

                      {params.length === 0 && addingParamIdx !== i && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">No parameters defined</p>
                      )}

                      {params.map((param, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2 p-2 rounded-md bg-muted/30" data-testid={`param-${i}-${pIdx}`}>
                          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Input
                                value={param.name}
                                onChange={(e) => updateParam(i, pIdx, "name", e.target.value)}
                                className="h-6 text-[11px] font-mono font-medium w-36"
                                data-testid={`input-param-name-${i}-${pIdx}`}
                              />
                              <Select value={param.type || "string"} onValueChange={(v) => updateParam(i, pIdx, "type", v)}>
                                <SelectTrigger className="w-20 h-6 text-[10px]" data-testid={`select-param-type-${i}-${pIdx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="string">string</SelectItem>
                                  <SelectItem value="number">number</SelectItem>
                                  <SelectItem value="boolean">boolean</SelectItem>
                                  <SelectItem value="object">object</SelectItem>
                                  <SelectItem value="string[]">string[]</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant={param.required ? "default" : "outline"}
                                size="sm"
                                className="h-6 text-[9px] px-2"
                                onClick={() => updateParam(i, pIdx, "required", !param.required)}
                                data-testid={`button-toggle-required-${i}-${pIdx}`}
                              >
                                {param.required ? "required" : "optional"}
                              </Button>
                              {param.enrichedFrom && (
                                <Badge variant="secondary" className="text-[9px] text-emerald-600 dark:text-emerald-400">
                                  <BookOpen className="w-2.5 h-2.5 mr-0.5" /> {param.enrichedFrom}
                                </Badge>
                              )}
                            </div>
                            <Input
                              value={param.description}
                              onChange={(e) => updateParam(i, pIdx, "description", e.target.value)}
                              placeholder="Parameter description"
                              className="h-6 text-[10px]"
                              data-testid={`input-param-desc-${i}-${pIdx}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            {param.enrichedFrom && (
                              <Button variant="ghost" size="icon" title="Remove ontology enrichment" onClick={() => unenrichParam(i, pIdx)} data-testid={`button-unenrich-${i}-${pIdx}`}>
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeParam(i, pIdx)} data-testid={`button-remove-param-${i}-${pIdx}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {addingParamIdx === i && (
                        <div className="flex flex-col gap-2 p-2 rounded-md border border-dashed">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Parameter name (e.g., customer_cif)"
                              value={newParamName}
                              onChange={(e) => setNewParamName(e.target.value)}
                              className="h-7 text-xs flex-1"
                              data-testid={`input-new-param-name-${i}`}
                            />
                            <Select value={newParamType} onValueChange={setNewParamType}>
                              <SelectTrigger className="w-24 h-7 text-xs" data-testid={`select-param-type-${i}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="number">number</SelectItem>
                                <SelectItem value="boolean">boolean</SelectItem>
                                <SelectItem value="object">object</SelectItem>
                                <SelectItem value="string[]">string[]</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            placeholder="Parameter description"
                            value={newParamDesc}
                            onChange={(e) => setNewParamDesc(e.target.value)}
                            className="h-7 text-xs"
                            data-testid={`input-new-param-desc-${i}`}
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" disabled={!newParamName.trim()} onClick={() => addParamToTool(i)} data-testid={`button-save-param-${i}`}>
                              <Plus className="w-3 h-3 mr-1" /> Add
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAddingParamIdx(null)} data-testid={`button-cancel-param-${i}`}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {industryCtx && (
        <CostModelingPanel industryCtx={industryCtx} industryLabel={industry?.label || ""} />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Permissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Data Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.dataAccess || []).join(", ")}
              onChange={(e) => updatePermission("dataAccess", e.target.value)}
              placeholder="e.g., customer_data, product_catalog"
              data-testid="input-data-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>API Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.apiAccess || []).join(", ")}
              onChange={(e) => updatePermission("apiAccess", e.target.value)}
              placeholder="e.g., search_api, email_api"
              data-testid="input-api-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Write Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.writeAccess || []).join(", ")}
              onChange={(e) => updatePermission("writeAccess", e.target.value)}
              placeholder="e.g., ticket_system, crm"
              data-testid="input-write-access"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CostModelingPanel({ industryCtx, industryLabel }: {
  industryCtx: {
    costBenchmarks: Record<string, { label: string; low: number; high: number; unit: string }>;
  };
  industryLabel: string;
}) {
  const benchmarks = Object.entries(industryCtx.costBenchmarks);

  return (
    <Card data-testid="card-cost-modeling">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Cost Modeling - {industryLabel} Benchmarks</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Estimated per-outcome costs compared to industry benchmarks. These are representative ranges for typical deployments.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {benchmarks.map(([key, bm]) => {
            const midpoint = (bm.low + bm.high) / 2;
            const estimatedCost = +(midpoint * (0.85 + Math.random() * 0.3)).toFixed(2);
            const inRange = estimatedCost >= bm.low && estimatedCost <= bm.high;
            const belowRange = estimatedCost < bm.low;
            const statusColor = belowRange
              ? "text-green-600 dark:text-green-400"
              : inRange
                ? "text-blue-600 dark:text-blue-400"
                : "text-amber-600 dark:text-amber-400";
            const statusLabel = belowRange ? "Below Range" : inRange ? "In Range" : "Above Range";
            const statusBg = belowRange
              ? "bg-green-500/10 border-green-500/30"
              : inRange
                ? "bg-blue-500/10 border-blue-500/30"
                : "bg-amber-500/10 border-amber-500/30";

            return (
              <div key={key} className="flex flex-col gap-1.5 p-3 rounded-md border" data-testid={`cost-benchmark-${key}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium">{bm.label}</span>
                  <Badge variant="outline" className={`text-[9px] ${statusBg} ${statusColor}`}>{statusLabel}</Badge>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-semibold ${statusColor}`}>${estimatedCost}</span>
                  <span className="text-[10px] text-muted-foreground">/ {bm.unit}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Benchmark: ${bm.low.toFixed(2)} - ${bm.high.toFixed(2)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted relative overflow-hidden">
                  <div
                    className="absolute h-full bg-muted-foreground/20 rounded-full"
                    style={{
                      left: `${(bm.low / (bm.high * 1.5)) * 100}%`,
                      width: `${((bm.high - bm.low) / (bm.high * 1.5)) * 100}%`,
                    }}
                  />
                  <div
                    className={`absolute h-full w-1.5 rounded-full ${belowRange ? "bg-green-500" : inRange ? "bg-blue-500" : "bg-amber-500"}`}
                    style={{ left: `${Math.min((estimatedCost / (bm.high * 1.5)) * 100, 98)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const NODE_TYPES: { type: string; label: string; icon: LucideIcon; color: string }[] = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { type: "llm_call", label: "LLM Call", icon: Sparkles, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { type: "tool_call", label: "Tool Call", icon: Wrench, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { type: "tool_proxy", label: "Tool Proxy", icon: PlugZap, color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" },
  { type: "condition", label: "Condition", icon: AlertTriangle, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  { type: "policy_check", label: "Policy Check", icon: Shield, color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  { type: "human_review", label: "Human Review", icon: ShieldCheck, color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  { type: "escalation", label: "Escalation", icon: PhoneForwarded, color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  { type: "writeback", label: "Writeback", icon: Database, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  { type: "classifier", label: "Classifier", icon: Gauge, color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20" },
  { type: "router", label: "Router", icon: ArrowRight, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  { type: "schema_validate", label: "Validate", icon: Check, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { type: "rag", label: "RAG", icon: BookOpen, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  { type: "output_format", label: "Output Format", icon: FileText, color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
];

function Step4MemoryContext({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  function addNodeToCanvas(type: string) {
    const count = state.workflowNodes.length;
    const newId = `node_${count + 1}`;
    const x = 40 + (count % 3) * 220;
    const y = 40 + Math.floor(count / 3) * 140;
    updateState({
      workflowNodes: [...state.workflowNodes, { id: newId, type, label: "", x, y, config: {} }],
    });
  }

  function removeNode(id: string) {
    updateState({
      workflowNodes: state.workflowNodes.filter(n => n.id !== id),
      workflowConnections: (state.workflowConnections || []).filter((c: WorkflowConnection) => c.from !== id && c.to !== id),
    });
    if (connectingFrom === id) setConnectingFrom(null);
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function updateNodeLabel(index: number, label: string) {
    const updated = [...state.workflowNodes];
    updated[index] = { ...updated[index], label };
    updateState({ workflowNodes: updated });
  }

  function updateNodeConfig(nodeId: string, configUpdate: Record<string, unknown>) {
    const updated = state.workflowNodes.map(n =>
      n.id === nodeId ? { ...n, config: { ...(n.config || {}), ...configUpdate } } : n
    );
    updateState({ workflowNodes: updated });
  }

  function updateEdgeConfig(edgeIdx: number, updates: Partial<WorkflowConnection>) {
    const conns = [...(state.workflowConnections || [])] as WorkflowConnection[];
    conns[edgeIdx] = { ...conns[edgeIdx], ...updates };
    updateState({ workflowConnections: conns });
  }

  function updateNodePosition(id: string, x: number, y: number) {
    const updated = state.workflowNodes.map(n => n.id === id ? { ...n, x, y } : n);
    updateState({ workflowNodes: updated });
  }

  function startConnection(nodeId: string) {
    setConnectingFrom(prev => prev === nodeId ? null : nodeId);
  }

  function completeConnection(nodeId: string) {
    if (!connectingFrom || connectingFrom === nodeId) return;
    const existing = (state.workflowConnections || []) as WorkflowConnection[];
    const alreadyExists = existing.some(c => c.from === connectingFrom && c.to === nodeId);
    if (!alreadyExists) {
      updateState({ workflowConnections: [...existing, { from: connectingFrom, to: nodeId, edgeType: "default", retries: 0, backoffMs: 1000 }] });
    }
    setConnectingFrom(null);
  }

  function removeConnection(from: string, to: string) {
    const existing = (state.workflowConnections || []) as WorkflowConnection[];
    updateState({ workflowConnections: existing.filter(c => !(c.from === from && c.to === to)) });
    setSelectedEdgeIdx(null);
  }

  const selectedNode = selectedNodeId ? state.workflowNodes.find(n => n.id === selectedNodeId) : null;
  const selectedEdge = selectedEdgeIdx !== null ? (state.workflowConnections as WorkflowConnection[])?.[selectedEdgeIdx] : null;

  const edgeTypeColors: Record<string, string> = {
    default: "hsl(var(--primary))",
    fallback: "hsl(var(--destructive))",
    human_gate: "hsl(130, 60%, 50%)",
    retry: "hsl(45, 90%, 50%)",
  };

  const { industry } = useIndustry();
  const industryCtx = industry && industry.id !== "custom" ? INDUSTRY_CONTEXT_CONFIG[industry.id] : null;
  const budgetCategories = state.contextBudget.length > 0 ? state.contextBudget : industryCtx?.contextBudgetPreset || [];
  const totalTokens = budgetCategories.reduce((sum, c) => sum + c.tokens, 0);

  const budgetColors = [
    "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500",
    "bg-rose-500", "bg-cyan-500", "bg-slate-500",
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h2 className="text-lg font-medium">Memory & Context</h2>

      {budgetCategories.length > 0 && (
        <Card data-testid="card-context-budget">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Context Budget Visualization</CardTitle>
              <Badge variant="outline" className="text-[10px] ml-auto">{totalTokens.toLocaleString()} tokens total</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex h-6 rounded-md overflow-hidden border">
              {budgetCategories.map((cat, i) => (
                <div
                  key={cat.category}
                  className={`${budgetColors[i % budgetColors.length]} transition-all`}
                  style={{ width: `${cat.pct}%` }}
                  title={`${cat.category}: ${cat.pct}% (${cat.tokens} tokens)`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {budgetCategories.map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-2 p-2 rounded-md border" data-testid={`budget-category-${i}`}>
                  <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${budgetColors[i % budgetColors.length]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium truncate">{cat.category}</p>
                    <p className="text-[10px] text-muted-foreground">{cat.pct}% / {cat.tokens} tokens</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {state.memoryGovernanceRules.length > 0 && (
        <Card data-testid="card-memory-governance">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Memory Governance Rules</CardTitle>
              <Badge variant="outline" className="text-[10px]">{state.memoryGovernanceRules.length} rules</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {state.memoryGovernanceRules.map((rule, i) => {
              const typeColors: Record<string, string> = {
                retention: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
                erasure: "bg-red-500/10 text-red-700 dark:text-red-400",
                encryption: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                access: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                access_control: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                immutability: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
                deletion: "bg-red-500/10 text-red-700 dark:text-red-400",
              };
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-md border" data-testid={`governance-rule-${i}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{rule.rule}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${typeColors[rule.type] || ""}`}>{rule.type}</Badge>
                  <Badge variant="outline" className="text-[9px] shrink-0">{rule.regulation}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Memory / RAG Configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Label>RAG Enabled</Label>
            <Select
              value={state.memoryRagEnabled ? "enabled" : "disabled"}
              onValueChange={(v) => updateState({ memoryRagEnabled: v === "enabled" })}
            >
              <SelectTrigger className="w-40" data-testid="select-rag-toggle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.memoryRagEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Vector Store</Label>
                <Select
                  value={state.memoryRagConfig.vectorStore}
                  onValueChange={(v) =>
                    updateState({ memoryRagConfig: { ...state.memoryRagConfig, vectorStore: v } })
                  }
                >
                  <SelectTrigger data-testid="select-vector-store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinecone">Pinecone</SelectItem>
                    <SelectItem value="chromadb">ChromaDB</SelectItem>
                    <SelectItem value="weaviate">Weaviate</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Retrieval Strategy</Label>
                <Select
                  value={state.memoryRagConfig.retrievalStrategy}
                  onValueChange={(v) =>
                    updateState({ memoryRagConfig: { ...state.memoryRagConfig, retrievalStrategy: v } })
                  }
                >
                  <SelectTrigger data-testid="select-retrieval-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="similarity">Similarity</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="mmr">MMR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Chunk Size</Label>
                <Input
                  type="number"
                  value={state.memoryRagConfig.chunkSize}
                  onChange={(e) =>
                    updateState({
                      memoryRagConfig: { ...state.memoryRagConfig, chunkSize: parseInt(e.target.value) || 512 },
                    })
                  }
                  data-testid="input-chunk-size"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Top K</Label>
                <Input
                  type="number"
                  value={state.memoryRagConfig.topK}
                  onChange={(e) =>
                    updateState({
                      memoryRagConfig: { ...state.memoryRagConfig, topK: parseInt(e.target.value) || 5 },
                    })
                  }
                  data-testid="input-top-k"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Visual Workflow</CardTitle>
            {state.workflowNodes.length > 0 && <Badge variant="outline" className="text-[10px]">{state.workflowNodes.length} nodes</Badge>}
          </div>
          {connectingFrom && (
            <Badge variant="outline" className="text-[10px] animate-pulse">
              Click a target node to connect
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Add:</span>
            {NODE_TYPES.map((nt) => (
              <Button
                key={nt.type}
                variant="outline"
                size="sm"
                onClick={() => addNodeToCanvas(nt.type)}
                data-testid={`button-add-${nt.type}`}
              >
                <nt.icon className="w-3 h-3 mr-1" />
                {nt.label}
              </Button>
            ))}
          </div>

          <div className="flex gap-3">
            <div
              ref={canvasRef}
              className="relative border rounded-md bg-muted/20 flex-1"
              style={{ minHeight: "400px", height: `${Math.max(400, (Math.floor(state.workflowNodes.length / 3) + 1) * 160 + 60)}px` }}
              data-testid="workflow-canvas"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const nodeId = e.dataTransfer.getData("nodeId");
                if (!nodeId || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const offsetX = parseInt(e.dataTransfer.getData("offsetX") || "0");
                const offsetY = parseInt(e.dataTransfer.getData("offsetY") || "0");
                const newX = Math.max(0, e.clientX - offsetX);
                const newY = Math.max(0, e.clientY - offsetY);
                const relX = Math.max(0, Math.min(newX - rect.left, rect.width - 200));
                const relY = Math.max(0, newY - rect.top);
                updateNodePosition(nodeId, relX, relY);
              }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {state.workflowConnections?.map((conn: WorkflowConnection, i: number) => {
                  const fromNode = state.workflowNodes.find(n => n.id === conn.from);
                  const toNode = state.workflowNodes.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) return null;
                  const fx = (fromNode.x || 0) + 100;
                  const fy = (fromNode.y || 0) + 55;
                  const tx = (toNode.x || 0) + 100;
                  const ty = (toNode.y || 0) + 15;
                  const midY = (fy + ty) / 2;
                  const edgeColor = edgeTypeColors[conn.edgeType || "default"] || edgeTypeColors.default;
                  const isDashed = conn.edgeType === "fallback" || conn.edgeType === "human_gate";
                  return (
                    <g key={i}>
                      <path
                        d={`M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth="2"
                        strokeOpacity={selectedEdgeIdx === i ? "0.9" : "0.4"}
                        strokeDasharray={isDashed ? "6 3" : "none"}
                        markerEnd="url(#arrowhead)"
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => setSelectedEdgeIdx(selectedEdgeIdx === i ? null : i)}
                      />
                      {conn.edgeType && conn.edgeType !== "default" && (
                        <text
                          x={(fx + tx) / 2 + 12}
                          y={(fy + ty) / 2 - 4}
                          fill={edgeColor}
                          fontSize="9"
                          className="pointer-events-none"
                        >{conn.edgeType}{conn.retries ? ` (${conn.retries}x)` : ""}</text>
                      )}
                      <circle
                        cx={(fx + tx) / 2}
                        cy={(fy + ty) / 2}
                        r="8"
                        fill="hsl(var(--destructive))"
                        fillOpacity="0.7"
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => removeConnection(conn.from, conn.to)}
                        data-testid={`button-remove-connection-${i}`}
                      />
                      <text
                        x={(fx + tx) / 2}
                        y={(fy + ty) / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="10"
                        className="pointer-events-none"
                      >x</text>
                    </g>
                  );
                })}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" fillOpacity="0.4" />
                  </marker>
                </defs>
              </svg>

              {state.workflowNodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Click a node type above to add it to the canvas</p>
                </div>
              )}
              {state.workflowNodes.map((node, i) => {
                const nodeType = NODE_TYPES.find(nt => nt.type === node.type) || NODE_TYPES[0];
                const NodeIcon = nodeType.icon;
                const isSelected = selectedNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    className={`absolute border rounded-md p-2.5 flex flex-col gap-1.5 w-[200px] cursor-move ${nodeType.color} ${connectingFrom === node.id ? "ring-2 ring-primary" : ""} ${isSelected ? "ring-2 ring-foreground" : ""}`}
                    style={{ left: node.x || 0, top: node.y || 0, zIndex: 2 }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("nodeId", node.id);
                      e.dataTransfer.setData("offsetX", String(e.clientX - (node.x || 0)));
                      e.dataTransfer.setData("offsetY", String(e.clientY - (node.y || 0)));
                    }}
                    data-testid={`workflow-node-${node.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <NodeIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{nodeType.label}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(isSelected ? null : node.id)} data-testid={`button-config-node-${node.id}`}>
                          <Settings className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeNode(node.id)} data-testid={`button-remove-node-${node.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={node.label}
                      onChange={(e) => updateNodeLabel(i, e.target.value)}
                      placeholder="Node label..."
                      className="h-7 text-xs"
                      data-testid={`input-node-label-${node.id}`}
                    />
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px]"
                        onClick={() => startConnection(node.id)}
                        data-testid={`button-connect-from-${node.id}`}
                      >
                        Connect
                      </Button>
                      {connectingFrom && connectingFrom !== node.id && (
                        <Button
                          variant="default"
                          size="sm"
                          className="text-[10px] animate-pulse"
                          onClick={() => completeConnection(node.id)}
                          data-testid={`button-connect-to-${node.id}`}
                        >
                          Link here
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {(selectedNode || selectedEdge) && (
              <div className="w-64 shrink-0 border rounded-md p-3 flex flex-col gap-3 bg-muted/10" data-testid="workflow-config-sidebar">
                {selectedNode && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Node Config</span>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(null)} data-testid="button-close-node-config">
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Prompt / Instructions</Label>
                      <Textarea
                        value={selectedNode.config?.prompt || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, { prompt: e.target.value })}
                        placeholder="System prompt or instructions..."
                        className="text-xs min-h-[60px]"
                        data-testid="input-node-prompt"
                      />
                    </div>
                    {(selectedNode.type === "llm_call" || selectedNode.type === "classifier" || selectedNode.type === "rag") && (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Model Override</Label>
                          <Input
                            value={selectedNode.config?.model || ""}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { model: e.target.value })}
                            placeholder="Default model"
                            className="h-7 text-xs"
                            data-testid="input-node-model"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Temperature</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={selectedNode.config?.temperature ?? 0.7}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                            className="h-7 text-xs"
                            data-testid="input-node-temperature"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Fallback Model</Label>
                          <Input
                            value={selectedNode.config?.fallbackModel || ""}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { fallbackModel: e.target.value })}
                            placeholder="e.g., gpt-4o-mini"
                            className="h-7 text-xs"
                            data-testid="input-node-fallback-model"
                          />
                        </div>
                      </>
                    )}
                    {(selectedNode.type === "writeback" || selectedNode.type === "tool_proxy") && (
                      <div className="flex flex-col gap-2">
                        <Label className="text-[10px]">Target System</Label>
                        <Input
                          value={selectedNode.config?.targetSystem || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { targetSystem: e.target.value })}
                          placeholder="e.g., CRM, ticket system"
                          className="h-7 text-xs"
                          data-testid="input-node-target-system"
                        />
                      </div>
                    )}
                    {selectedNode.type === "escalation" && (
                      <div className="flex flex-col gap-2">
                        <Label className="text-[10px]">Escalation Owner</Label>
                        <Input
                          value={selectedNode.config?.escalationOwner || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { escalationOwner: e.target.value })}
                          placeholder="Team or person"
                          className="h-7 text-xs"
                          data-testid="input-node-escalation-owner"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px]">Max Retries</Label>
                        <Input
                          type="number"
                          min="0"
                          value={selectedNode.config?.maxRetries ?? 3}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { maxRetries: parseInt(e.target.value) || 0 })}
                          className="h-7 text-xs"
                          data-testid="input-node-retries"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px]">Timeout (ms)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={selectedNode.config?.timeoutMs ?? 30000}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { timeoutMs: parseInt(e.target.value) || 30000 })}
                          className="h-7 text-xs"
                          data-testid="input-node-timeout"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Cost Budget ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={selectedNode.config?.costBudget ?? ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, { costBudget: parseFloat(e.target.value) || 0 })}
                        placeholder="Max cost per call"
                        className="h-7 text-xs"
                        data-testid="input-node-cost-budget"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Observability Log Level</Label>
                      <Select
                        value={selectedNode.config?.logLevel || "info"}
                        onValueChange={(v) => updateNodeConfig(selectedNode.id, { logLevel: v })}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid="select-node-log-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="warn">Warning</SelectItem>
                          <SelectItem value="error">Error Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {selectedEdge && selectedEdgeIdx !== null && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Edge Rules</span>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedEdgeIdx(null)} data-testid="button-close-edge-config">
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Edge Type</Label>
                      <Select
                        value={selectedEdge.edgeType || "default"}
                        onValueChange={(v) => updateEdgeConfig(selectedEdgeIdx, { edgeType: v })}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid="select-edge-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="fallback">Fallback Path</SelectItem>
                          <SelectItem value="retry">Retry Loop</SelectItem>
                          <SelectItem value="human_gate">Human Required Gate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(selectedEdge.edgeType === "retry" || selectedEdge.edgeType === "fallback") && (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Max Retries</Label>
                          <Input
                            type="number"
                            min="0"
                            value={selectedEdge.retries ?? 3}
                            onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { retries: parseInt(e.target.value) || 0 })}
                            className="h-7 text-xs"
                            data-testid="input-edge-retries"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Backoff (ms)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={selectedEdge.backoffMs ?? 1000}
                            onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { backoffMs: parseInt(e.target.value) || 1000 })}
                            className="h-7 text-xs"
                            data-testid="input-edge-backoff"
                          />
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Condition</Label>
                      <Input
                        value={selectedEdge.condition || ""}
                        onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { condition: e.target.value })}
                        placeholder="e.g., output.confidence > 0.8"
                        className="h-7 text-xs"
                        data-testid="input-edge-condition"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StringListCard({
  title,
  icon: Icon,
  items,
  onAdd,
  onRemove,
  placeholder,
  testIdPrefix,
  ontologyItems,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
  placeholder: string;
  testIdPrefix: string;
  ontologyItems?: Array<{ text: string; conceptLabel: string }>;
}) {
  const [inputVal, setInputVal] = useState("");
  const ontologyTexts = new Set((ontologyItems || []).map((o) => o.text));
  const ontologyMap = new Map((ontologyItems || []).map((o) => [o.text, o.conceptLabel]));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {ontologyItems && ontologyItems.length > 0 && (
          <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 ml-auto">
            {ontologyItems.length} from ontology
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputVal.trim()) {
                onAdd(inputVal.trim());
                setInputVal("");
              }
            }}
            data-testid={`input-${testIdPrefix}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (inputVal.trim()) {
                onAdd(inputVal.trim());
                setInputVal("");
              }
            }}
            data-testid={`button-add-${testIdPrefix}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No items added yet.</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span data-testid={`text-${testIdPrefix}-${i}`} className="truncate">{item}</span>
              {ontologyTexts.has(item) && (
                <Badge variant="secondary" className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 shrink-0" data-testid={`badge-ontology-${testIdPrefix}-${i}`}>
                  {ontologyMap.get(item) || "Ontology"}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(i)}
              data-testid={`button-remove-${testIdPrefix}-${i}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PolicyBindingsCard({
  state,
  updateState,
  policies,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  policies: Array<{ id: string; name: string; domain: string; description: string }>;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const boundPolicyIds = new Set(state.policyBindings.map((b) => b.policyId));
  const availablePolicies = policies.filter((p) => !boundPolicyIds.has(p.id));
  const filteredPolicies = availablePolicies.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function addBinding(policy: { id: string; name: string; domain: string; description: string }) {
    updateState({
      policyBindings: [
        ...state.policyBindings,
        { policyId: policy.id, policyName: policy.name, enforcement: "soft", domain: policy.domain, description: policy.description },
      ],
    });
    setShowSelector(false);
    setSearchQuery("");
  }

  function removeBinding(idx: number) {
    updateState({
      policyBindings: state.policyBindings.filter((_, i) => i !== idx),
    });
  }

  function updateEnforcement(idx: number, enforcement: string) {
    const updated = [...state.policyBindings];
    updated[idx] = { ...updated[idx], enforcement };
    updateState({ policyBindings: updated });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Policy Bindings</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {state.policyBindings.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.policyBindings.length === 0 && !showSelector && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No policies bound. Add policies from the library to enforce governance rules.
          </p>
        )}

        {state.policyBindings.map((binding, idx) => (
          <div key={binding.policyId} className="flex items-center gap-2 p-3 rounded-md bg-muted/30" data-testid={`policy-binding-${idx}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{binding.policyName}</span>
                {binding.domain && (
                  <Badge variant="outline" className="text-[9px]">{binding.domain}</Badge>
                )}
              </div>
              {binding.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{binding.description}</p>
              )}
            </div>
            <Select value={binding.enforcement} onValueChange={(val) => updateEnforcement(idx, val)}>
              <SelectTrigger className="w-[110px]" data-testid={`select-enforcement-${idx}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="soft">Soft</SelectItem>
                <SelectItem value="advisory">Advisory</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeBinding(idx)}
              data-testid={`button-remove-binding-${idx}`}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}

        {showSelector ? (
          <div className="flex flex-col gap-2 p-3 rounded-md border border-dashed">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search policies by name or domain..."
              data-testid="input-search-policies"
              autoFocus
            />
            <ScrollArea className="max-h-48">
              <div className="flex flex-col gap-1">
                {filteredPolicies.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {availablePolicies.length === 0 ? "All policies already bound" : "No matching policies found"}
                  </p>
                )}
                {filteredPolicies.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate"
                    onClick={() => addBinding(policy)}
                    data-testid={`select-policy-${policy.id}`}
                  >
                    <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">{policy.name}</span>
                        <Badge variant="outline" className="text-[9px]">{policy.domain}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{policy.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowSelector(false); setSearchQuery(""); }}
              data-testid="button-cancel-policy-search"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSelector(true)}
            className="w-full"
            data-testid="button-add-policy-binding"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Policy
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Step3IndustryGovernance({
  state,
  updateState,
  ontologyGuardrails,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  ontologyGuardrails?: Array<{ text: string; type: string; source: string; conceptLabel: string; regulation: string }>;
}) {
  const { data: policies, isLoading: policiesLoading } = useQuery<Array<{
    id: string;
    name: string;
    domain: string;
    description: string;
  }>>({
    queryKey: ["/api/policies"],
  });

  function togglePolicy(policyId: string) {
    const current = state.guardrailsConfig.policyBundleIds;
    const updated = current.includes(policyId)
      ? current.filter((id) => id !== policyId)
      : [...current, policyId];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, policyBundleIds: updated },
    });
  }

  function addItem(field: keyof typeof state.guardrailsConfig, val: string) {
    const current = state.guardrailsConfig[field] as string[];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, [field]: [...current, val] },
    });
  }

  function removeItem(field: keyof typeof state.guardrailsConfig, idx: number) {
    const current = state.guardrailsConfig[field] as string[];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, [field]: current.filter((_, i) => i !== idx) },
    });
  }

  const { industry } = useIndustry();
  const industryCtx = industry && industry.id !== "custom" ? INDUSTRY_CONTEXT_CONFIG[industry.id] : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Industry Governance</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Pre-populated safety policies, compliance prerequisites, and content filters based on your industry context.
      </p>

      {industryCtx && (
        <>
          <Card data-testid="card-compliance-prerequisites">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Compliance Prerequisites</CardTitle>
              <Badge variant="outline" className="text-[10px]">{industryCtx.compliancePrerequisites.length} items</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {industryCtx.compliancePrerequisites.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md border" data-testid={`compliance-prereq-${i}`}>
                  <Check className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-content-filters">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Industry Content Filters</CardTitle>
              <Badge variant="outline" className="text-[10px]">{industryCtx.contentFilters.length} filters</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {industryCtx.contentFilters.map((filter, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md border" data-testid={`content-filter-${i}`}>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs">{filter}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <ListChecks className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Policy Bundles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {policiesLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!policiesLoading && (!policies || policies.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No policies available.</p>
          )}
          {policies?.map((policy) => {
            const isSelected = state.guardrailsConfig.policyBundleIds.includes(policy.id);
            return (
              <div
                key={policy.id}
                className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover-elevate"
                }`}
                onClick={() => togglePolicy(policy.id)}
                data-testid={`toggle-policy-${policy.id}`}
              >
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-primary border-primary" : "border-border"
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{policy.name}</span>
                    <Badge variant="outline" className="text-[10px]">{policy.domain}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{policy.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <PolicyBindingsCard state={state} updateState={updateState} policies={policies || []} />

      <StringListCard
        title="Stop Conditions"
        icon={AlertTriangle}
        items={state.guardrailsConfig.stopConditions}
        onAdd={(val) => addItem("stopConditions", val)}
        onRemove={(idx) => removeItem("stopConditions", idx)}
        placeholder="e.g., PII detected in output"
        testIdPrefix="stop-condition"
        ontologyItems={(ontologyGuardrails || []).filter((g) => g.type === "stopCondition").map((g) => ({ text: g.text, conceptLabel: g.conceptLabel }))}
      />

      <StringListCard
        title="Escalation Triggers"
        icon={Bell}
        items={state.guardrailsConfig.escalationTriggers}
        onAdd={(val) => addItem("escalationTriggers", val)}
        onRemove={(idx) => removeItem("escalationTriggers", idx)}
        placeholder="e.g., Write action to production DB"
        testIdPrefix="escalation-trigger"
        ontologyItems={(ontologyGuardrails || []).filter((g) => g.type === "escalationTrigger").map((g) => ({ text: g.text, conceptLabel: g.conceptLabel }))}
      />

      <StringListCard
        title="Forbidden Outputs"
        icon={Shield}
        items={state.guardrailsConfig.forbiddenOutputs}
        onAdd={(val) => addItem("forbiddenOutputs", val)}
        onRemove={(idx) => removeItem("forbiddenOutputs", idx)}
        placeholder="e.g., Never output raw SQL queries"
        testIdPrefix="forbidden-output"
        ontologyItems={(ontologyGuardrails || []).filter((g) => g.type === "forbiddenOutput").map((g) => ({ text: g.text, conceptLabel: g.conceptLabel }))}
      />

      <StringListCard
        title="Allowed Actions"
        icon={Target}
        items={state.guardrailsConfig.allowedActions}
        onAdd={(val) => addItem("allowedActions", val)}
        onRemove={(idx) => removeItem("allowedActions", idx)}
        placeholder="e.g., Read from customer database"
        testIdPrefix="allowed-action"
      />
    </div>
  );
}

function Step6EvalSuite({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const { data: evalSuites, isLoading: suitesLoading } = useQuery<Array<{
    id: string;
    name: string;
    type: string;
    totalCases: number;
    passRate: number;
  }>>({
    queryKey: ["/api/eval-suites"],
  });

  const [newCase, setNewCase] = useState({ name: "", input: "", expectedOutput: "" });

  function toggleSuite(suiteId: string) {
    const current = state.evalSuiteConfig.baselineSuiteIds;
    const updated = current.includes(suiteId)
      ? current.filter((id) => id !== suiteId)
      : [...current, suiteId];
    updateState({
      evalSuiteConfig: { ...state.evalSuiteConfig, baselineSuiteIds: updated },
    });
  }

  function addCustomCase() {
    if (!newCase.name.trim() || !newCase.input.trim()) return;
    updateState({
      evalSuiteConfig: {
        ...state.evalSuiteConfig,
        customCases: [...state.evalSuiteConfig.customCases, { ...newCase }],
      },
    });
    setNewCase({ name: "", input: "", expectedOutput: "" });
  }

  function removeCustomCase(idx: number) {
    updateState({
      evalSuiteConfig: {
        ...state.evalSuiteConfig,
        customCases: state.evalSuiteConfig.customCases.filter((_, i) => i !== idx),
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Eval Suite</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Select baseline evaluation suites, add custom test cases, and set acceptance thresholds.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Baseline Suites</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {suitesLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!suitesLoading && (!evalSuites || evalSuites.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No eval suites available.</p>
          )}
          {evalSuites?.map((suite) => {
            const isSelected = state.evalSuiteConfig.baselineSuiteIds.includes(suite.id);
            return (
              <div
                key={suite.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover-elevate"
                }`}
                onClick={() => toggleSuite(suite.id)}
                data-testid={`toggle-suite-${suite.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    isSelected ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{suite.name}</span>
                      <Badge variant="outline" className="text-[10px]">{suite.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {suite.totalCases} cases | {suite.passRate}% pass rate
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">Custom Test Cases</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {state.evalSuiteConfig.customCases.length} cases
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 p-3 rounded-md bg-muted/30">
            <div className="flex flex-col gap-2">
              <Label>Case Name</Label>
              <Input
                value={newCase.name}
                onChange={(e) => setNewCase({ ...newCase, name: e.target.value })}
                placeholder="e.g., Happy path - basic query"
                data-testid="input-case-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Input</Label>
              <Textarea
                value={newCase.input}
                onChange={(e) => setNewCase({ ...newCase, input: e.target.value })}
                placeholder="Test input for the agent..."
                data-testid="input-case-input"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Expected Output</Label>
              <Textarea
                value={newCase.expectedOutput}
                onChange={(e) => setNewCase({ ...newCase, expectedOutput: e.target.value })}
                placeholder="Expected agent response..."
                data-testid="input-case-expected"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addCustomCase}
              disabled={!newCase.name.trim() || !newCase.input.trim()}
              data-testid="button-add-custom-case"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Case
            </Button>
          </div>
          {state.evalSuiteConfig.customCases.map((tc, i) => (
            <div key={i} className="flex items-start justify-between gap-2 p-3 rounded-md bg-muted/20">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" data-testid={`text-case-name-${i}`}>{tc.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">Input: {tc.input}</p>
                {tc.expectedOutput && (
                  <p className="text-xs text-muted-foreground line-clamp-1">Expected: {tc.expectedOutput}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCustomCase(i)}
                data-testid={`button-remove-case-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Acceptance Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Pilot Threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={state.evalSuiteConfig.pilotThreshold}
                onChange={(e) =>
                  updateState({
                    evalSuiteConfig: {
                      ...state.evalSuiteConfig,
                      pilotThreshold: parseInt(e.target.value) || 0,
                    },
                  })
                }
                data-testid="input-pilot-threshold"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Production Threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={state.evalSuiteConfig.prodThreshold}
                onChange={(e) =>
                  updateState({
                    evalSuiteConfig: {
                      ...state.evalSuiteConfig,
                      prodThreshold: parseInt(e.target.value) || 0,
                    },
                  })
                }
                data-testid="input-prod-threshold"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>0%</span>
              <span>Pilot: {state.evalSuiteConfig.pilotThreshold}%</span>
              <span>Prod: {state.evalSuiteConfig.prodThreshold}%</span>
              <span>100%</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-amber-500/60 transition-all"
                style={{ width: `${state.evalSuiteConfig.pilotThreshold}%` }}
              />
              <div
                className="h-full bg-green-500/60 transition-all"
                style={{ width: `${Math.max(0, state.evalSuiteConfig.prodThreshold - state.evalSuiteConfig.pilotThreshold)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Step7RolloutPlan({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const [newStepVal, setNewStepVal] = useState("");
  const [newTriggerVal, setNewTriggerVal] = useState("");

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Rocket className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Rollout Plan</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure shadow mode, canary deployment steps, and rollback strategies.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Shadow Mode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            In shadow mode, the agent runs alongside the existing system without affecting real traffic. Outputs are logged for comparison.
          </p>
          <div className="flex flex-col gap-2">
            <Label>Duration</Label>
            <Select
              value={state.rolloutConfig.shadowModeDuration}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, shadowModeDuration: v } })
              }
            >
              <SelectTrigger data-testid="select-shadow-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3d">3 days</SelectItem>
                <SelectItem value="7d">1 week</SelectItem>
                <SelectItem value="14d">2 weeks</SelectItem>
                <SelectItem value="30d">1 month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Canary Steps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Define the traffic percentage progression for canary deployment.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {state.rolloutConfig.canarySteps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="flex items-center gap-1 p-1.5 rounded-md bg-muted/50">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={step}
                    onChange={(e) => {
                      const updated = [...state.rolloutConfig.canarySteps];
                      updated[i] = parseInt(e.target.value) || 0;
                      updateState({ rolloutConfig: { ...state.rolloutConfig, canarySteps: updated } });
                    }}
                    className="w-16 text-center"
                    data-testid={`input-canary-step-${i}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      updateState({
                        rolloutConfig: {
                          ...state.rolloutConfig,
                          canarySteps: state.rolloutConfig.canarySteps.filter((_, idx) => idx !== i),
                        },
                      });
                    }}
                    data-testid={`button-remove-canary-${i}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {i < state.rolloutConfig.canarySteps.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={newStepVal}
              onChange={(e) => setNewStepVal(e.target.value)}
              placeholder="e.g., 75"
              className="w-24"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStepVal.trim()) {
                  const val = parseInt(newStepVal);
                  if (val > 0 && val <= 100) {
                    updateState({
                      rolloutConfig: {
                        ...state.rolloutConfig,
                        canarySteps: [...state.rolloutConfig.canarySteps, val].sort((a, b) => a - b),
                      },
                    });
                    setNewStepVal("");
                  }
                }
              }}
              data-testid="input-new-canary-step"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const val = parseInt(newStepVal);
                if (val > 0 && val <= 100) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      canarySteps: [...state.rolloutConfig.canarySteps, val].sort((a, b) => a - b),
                    },
                  });
                  setNewStepVal("");
                }
              }}
              data-testid="button-add-canary-step"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <RotateCcw className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Auto-Rollback Triggers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={newTriggerVal}
              onChange={(e) => setNewTriggerVal(e.target.value)}
              placeholder="e.g., Error rate > 5%"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTriggerVal.trim()) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: [...state.rolloutConfig.autoRollbackTriggers, newTriggerVal.trim()],
                    },
                  });
                  setNewTriggerVal("");
                }
              }}
              data-testid="input-rollback-trigger"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (newTriggerVal.trim()) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: [...state.rolloutConfig.autoRollbackTriggers, newTriggerVal.trim()],
                    },
                  });
                  setNewTriggerVal("");
                }
              }}
              data-testid="button-add-rollback-trigger"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
          {state.rolloutConfig.autoRollbackTriggers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No rollback triggers configured.</p>
          )}
          {state.rolloutConfig.autoRollbackTriggers.map((trigger, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm">
              <span data-testid={`text-rollback-trigger-${i}`}>{trigger}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: state.rolloutConfig.autoRollbackTriggers.filter((_, idx) => idx !== i),
                    },
                  })
                }
                data-testid={`button-remove-rollback-trigger-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Rollback Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={state.rolloutConfig.rollbackStrategy}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, rollbackStrategy: v } })
              }
            >
              <SelectTrigger data-testid="select-rollback-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="gradual">Gradual</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Health Check Interval</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={state.rolloutConfig.healthCheckInterval}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, healthCheckInterval: v } })
              }
            >
              <SelectTrigger data-testid="select-health-check-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Every 1 minute</SelectItem>
                <SelectItem value="5m">Every 5 minutes</SelectItem>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface GovernanceRequirement {
  domain: string;
  regulation: string;
  description: string;
  status: "satisfied" | "missing";
  matchingPolicy?: string;
  severity: string;
}

interface DesignTimeCheckResult {
  passed: boolean;
  requirements: GovernanceRequirement[];
}

function StepReview({
  state,
  onCreate,
  isPending,
  outcomes,
  domainGlossary,
  glossaryConceptCount,
  industryLabel,
  fromOutcome,
  outcomeKpis,
  isDynamicPreset,
  dynamicAdjustmentCount,
  onToggleOptionalSkill,
}: {
  state: WizardState;
  onCreate: () => void;
  isPending: boolean;
  outcomes: OutcomeContract[] | undefined;
  domainGlossary?: string;
  glossaryConceptCount?: number;
  industryLabel?: string;
  fromOutcome?: boolean;
  outcomeKpis?: KpiDefinition[];
  isDynamicPreset?: boolean;
  dynamicAdjustmentCount?: number;
  onToggleOptionalSkill?: (skillId: string) => void;
}) {
  const linkedOutcome = outcomes?.find((o) => o.id === state.outcomeId);
  const [governanceOverride, setGovernanceOverride] = useState(false);

  const { data: designTimeCheck, isLoading: designTimeLoading } = useQuery<DesignTimeCheckResult>({
    queryKey: ["/api/governance/design-time-check", state.industryId, state.riskTier],
    queryFn: async () => {
      if (!state.industryId || state.industryId === "cross_industry") {
        return { passed: true, requirements: [] };
      }
      const resp = await apiRequest("POST", "/api/governance/design-time-check", {
        industryId: state.industryId,
        riskTier: state.riskTier,
      });
      return resp.json();
    },
    enabled: !!state.industryId && state.industryId !== "cross_industry",
  });

  const hasMissingPolicies = designTimeCheck && !designTimeCheck.passed;
  const missingCount = designTimeCheck?.requirements.filter(r => r.status === "missing").length || 0;
  const satisfiedCount = designTimeCheck?.requirements.filter(r => r.status === "satisfied").length || 0;
  const canCreate = !hasMissingPolicies || governanceOverride;

  const handleCreate = () => {
    if (hasMissingPolicies && !governanceOverride) return;
    onCreate();
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h2 className="text-lg font-medium">Review & Create</h2>
      <p className="text-sm text-muted-foreground">
        Review your agent configuration before creating.
      </p>

      {designTimeLoading && state.industryId && state.industryId !== "cross_industry" && (
        <Card data-testid="card-governance-loading">
          <CardContent className="flex items-center gap-3 pt-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking governance readiness...</span>
          </CardContent>
        </Card>
      )}

      {designTimeCheck && designTimeCheck.requirements.length > 0 && (
        <Card
          className={`border ${designTimeCheck.passed ? "border-green-500/30 bg-green-500/5" : "border-amber-500/50 bg-amber-500/5"}`}
          data-testid="card-governance-readiness"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {designTimeCheck.passed ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
              Governance Readiness
              <Badge
                variant={designTimeCheck.passed ? "default" : "destructive"}
                className="text-[10px] ml-auto"
                data-testid="badge-governance-score"
              >
                {satisfiedCount}/{designTimeCheck.requirements.length} policies satisfied
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!designTimeCheck.passed && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 text-xs" data-testid="governance-warning-banner">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {missingCount} required {missingCount === 1 ? "policy is" : "policies are"} missing for {industryLabel || state.industryId}
                  </span>
                  <span className="text-muted-foreground">
                    Creating this agent without the required policies may violate compliance requirements.
                    Admin or compliance roles can override this gate.
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5 mt-1">
              {designTimeCheck.requirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" data-testid={`governance-req-${i}`}>
                  {req.status === "satisfied" ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span className={req.status === "satisfied" ? "text-muted-foreground" : "text-foreground font-medium"}>
                    {req.regulation}
                  </span>
                  <Badge variant="outline" className="text-[9px]">{req.domain}</Badge>
                  <span className="text-muted-foreground ml-auto text-right truncate max-w-[200px]">
                    {req.status === "satisfied" ? req.matchingPolicy : "No matching policy"}
                  </span>
                </div>
              ))}
            </div>
            {!designTimeCheck.passed && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <input
                  type="checkbox"
                  id="governance-override"
                  checked={governanceOverride}
                  onChange={(e) => setGovernanceOverride(e.target.checked)}
                  className="rounded border-amber-500"
                  data-testid="checkbox-governance-override"
                />
                <label htmlFor="governance-override" className="text-xs text-muted-foreground cursor-pointer">
                  I acknowledge the missing policies and accept responsibility for compliance gaps (requires admin/compliance role)
                </label>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {linkedOutcome && (
        <Card className="border-primary/30 bg-primary/5" data-testid="review-outcome-requirements">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Outcome Requirements Inherited
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Linked Outcome</span>
              <span className="font-medium">{linkedOutcome.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Outcome Risk Tier</span>
              <Badge variant="outline" className="text-[10px]">{linkedOutcome.riskTier}</Badge>
            </div>
            {outcomeKpis && outcomeKpis.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">KPI Targets</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {outcomeKpis.map((k) => (
                    <Badge key={k.id} variant="secondary" className="text-[10px] font-normal">
                      {k.name}: {k.target} {k.unit}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {state.guardrailsConfig.stopConditions.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Stop Conditions</span>
                <span className="font-medium text-right">{state.guardrailsConfig.stopConditions.length} inherited</span>
              </div>
            )}
            {state.guardrailsConfig.escalationTriggers.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Escalation Triggers</span>
                <span className="font-medium text-right">{state.guardrailsConfig.escalationTriggers.length} inherited</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Eval Thresholds</span>
              <span className="font-medium">Pilot: {state.evalSuiteConfig.pilotThreshold}% | Prod: {state.evalSuiteConfig.prodThreshold}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium" data-testid="review-name">{state.name || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Description</span>
            <span className="font-medium text-right max-w-xs truncate">{state.description || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Owner</span>
            <span className="font-medium">{state.owner || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Risk Tier</span>
            <Badge variant="outline" className="text-[10px]">{state.riskTier}</Badge>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Autonomy Mode</span>
            <Badge variant="outline" className="text-[10px]">{state.autonomyMode}</Badge>
          </div>
          {linkedOutcome && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Linked Outcome</span>
              <span className="font-medium">{linkedOutcome.name}</span>
            </div>
          )}
          {state.ontologyTags.length > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ontology Tags</span>
              <div className="flex items-center gap-1 flex-wrap justify-end" data-testid="review-ontology-tags">
                {state.ontologyTags.map((tag) => (
                  <Badge key={tag.conceptId} variant="secondary" className="text-[10px]">
                    {tag.conceptLabel}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {domainGlossary && (
        <DomainTerminologyPreview
          glossary={domainGlossary}
          conceptCount={glossaryConceptCount || 0}
          industryLabel={industryLabel || "Industry"}
          collapsed={true}
          ontologyTags={state.ontologyTags}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Model & Tools</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium">{state.modelProvider}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Model</span>
            <span className="font-medium">{state.modelName}</span>
          </div>
          {state.blueprintId && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Blueprint</span>
              <span className="font-medium flex items-center gap-1" data-testid="text-review-blueprint">
                <Layers className="w-3 h-3 text-primary" />
                {state.blueprintName || state.blueprintId}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Tools</span>
            <span className="font-medium">
              {state.toolsConfig.length > 0
                ? state.toolsConfig.map((t) => t.name).join(", ")
                : "None"}
            </span>
          </div>
          {((state.permissionsConfig?.dataAccess || []).length > 0 ||
            (state.permissionsConfig?.apiAccess || []).length > 0 ||
            (state.permissionsConfig?.writeAccess || []).length > 0) && (
            <>
              {(state.permissionsConfig?.dataAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Data Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.dataAccess || []).join(", ")}</span>
                </div>
              )}
              {(state.permissionsConfig?.apiAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">API Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.apiAccess || []).join(", ")}</span>
                </div>
              )}
              {(state.permissionsConfig?.writeAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Write Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.writeAccess || []).join(", ")}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {(state.templateSkills.required.length > 0 || state.templateSkills.optional.length > 0) && (
        <Card data-testid="card-template-skills">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Template Skills</CardTitle>
              {state.templateSkills.templateId && (
                <Badge variant="outline" className="text-[10px] ml-auto">From Template</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {state.templateSkills.required.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Required Skills</span>
                {[...state.templateSkills.required].sort((a, b) => a.executionOrder - b.executionOrder).map((skill, i) => (
                  <div key={skill.skillId || i} className="flex items-center gap-2 text-sm" data-testid={`review-required-skill-${i}`}>
                    <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{skill.skillName}</span>
                    {skill.domain && <Badge variant="outline" className="text-[9px]">{skill.domain}</Badge>}
                    {!skill.skillId && (
                      <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500/50" data-testid={`badge-unresolved-required-${i}`}>
                        Not in library
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[9px] ml-auto">#{skill.executionOrder}</Badge>
                  </div>
                ))}
              </div>
            )}
            {state.templateSkills.optional.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Optional Skills</span>
                {[...state.templateSkills.optional].sort((a, b) => a.executionOrder - b.executionOrder).map((skill, i) => {
                  const isSelected = state.templateSkills.selectedOptional.includes(skill.skillId || skill.skillName);
                  return (
                    <div
                      key={skill.skillId || i}
                      className="flex items-center gap-2 text-sm cursor-pointer hover-elevate rounded-md p-1 -m-1"
                      onClick={() => onToggleOptionalSkill?.(skill.skillId || skill.skillName)}
                      data-testid={`review-optional-skill-${i}`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={isSelected ? "font-medium" : "text-muted-foreground"}>{skill.skillName}</span>
                      {skill.domain && <Badge variant="outline" className="text-[9px]">{skill.domain}</Badge>}
                      {!skill.skillId && (
                        <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500/50" data-testid={`badge-unresolved-optional-${i}`}>
                          Not in library
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[9px] ml-auto">#{skill.executionOrder}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {state.memoryRagEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Memory / RAG</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Vector Store</span>
              <span className="font-medium">{state.memoryRagConfig.vectorStore}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Retrieval Strategy</span>
              <span className="font-medium">{state.memoryRagConfig.retrievalStrategy}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Chunk Size</span>
              <span className="font-medium">{state.memoryRagConfig.chunkSize}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Top K</span>
              <span className="font-medium">{state.memoryRagConfig.topK}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {state.workflowNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Workflow Nodes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {state.workflowNodes.map((node) => (
              <div key={node.id} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{node.id}</Badge>
                <Badge variant="secondary" className="text-[10px]">{node.type}</Badge>
                <span className="text-muted-foreground">{node.label || "Unlabeled"}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 flex-wrap">
              <span className="text-muted-foreground">Connections</span>
              <span>{state.workflowConnections?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {state.policyBindings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Policy Bindings ({state.policyBindings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {state.policyBindings.map((binding, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm" data-testid={`review-policy-${i}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{binding.policyName}</span>
                    {binding.domain && <Badge variant="outline" className="text-[9px]">{binding.domain}</Badge>}
                  </div>
                  <Badge variant={binding.enforcement === "hard" ? "destructive" : binding.enforcement === "advisory" ? "secondary" : "default"} className="text-[10px]">
                    {binding.enforcement}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {state.evalBindings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Eval Bindings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground flex flex-col gap-1">
              {state.evalBindings.map((e, i) => (
                <li key={i}>{typeof e === "object" ? `${(e as any).suiteName || ""} (${(e as any).schedule || "manual"})` : String(e)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {state.rollbackPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {typeof state.rollbackPlan === "object"
                ? `Triggers: ${((state.rollbackPlan as any)?.triggerConditions || []).join(", ")} | Target: ${(state.rollbackPlan as any)?.rollbackTargetVersion || "previous_stable"}`
                : String(state.rollbackPlan || "Not configured")}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Guardrails</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Policy Bundles</span>
            <span className="font-medium" data-testid="review-policy-count">{state.guardrailsConfig.policyBundleIds.length} selected</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Stop Conditions</span>
            <span className="font-medium" data-testid="review-stop-conditions-count">{state.guardrailsConfig.stopConditions.length} configured</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Escalation Triggers</span>
            <span className="font-medium" data-testid="review-escalation-count">{state.guardrailsConfig.escalationTriggers.length} configured</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Forbidden Outputs</span>
            <span className="font-medium">{state.guardrailsConfig.forbiddenOutputs.length} defined</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Allowed Actions</span>
            <span className="font-medium">{state.guardrailsConfig.allowedActions.length} defined</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Eval Suite</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Baseline Suites</span>
            <span className="font-medium" data-testid="review-suites-count">{state.evalSuiteConfig.baselineSuiteIds.length} selected</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Custom Cases</span>
            <span className="font-medium" data-testid="review-custom-cases-count">{state.evalSuiteConfig.customCases.length} cases</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Pilot Threshold</span>
            <span className="font-medium">{state.evalSuiteConfig.pilotThreshold}%</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Production Threshold</span>
            <span className="font-medium">{state.evalSuiteConfig.prodThreshold}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Rollout Plan</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Shadow Mode Duration</span>
            <span className="font-medium" data-testid="review-shadow-duration">{state.rolloutConfig.shadowModeDuration}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Canary Steps</span>
            <div className="flex items-center gap-1">
              {state.rolloutConfig.canarySteps.map((s, i) => (
                <span key={i} className="font-medium">
                  {s}%{i < state.rolloutConfig.canarySteps.length - 1 ? " \u2192 " : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Rollback Strategy</span>
            <Badge variant="outline" className="text-[10px]" data-testid="review-rollback-strategy">{state.rolloutConfig.rollbackStrategy}</Badge>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Health Check Interval</span>
            <span className="font-medium">{state.rolloutConfig.healthCheckInterval}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Auto-Rollback Triggers</span>
            <span className="font-medium">{state.rolloutConfig.autoRollbackTriggers.length} configured</span>
          </div>
        </CardContent>
      </Card>

      <PerformanceSimulation state={state} />

      {industryLabel && industryLabel !== "Custom" && industryLabel !== "Cross-Industry" && (() => {
        const iid = state.industryId || "";
        const preset = INDUSTRY_PRESETS[iid];
        const ctx = INDUSTRY_CONTEXT_CONFIG[iid];
        if (!preset || !ctx) return null;

        const checks: Array<{ label: string; met: boolean; detail: string }> = [];

        const riskOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        const riskMet = (riskOrder[state.riskTier] || 0) >= (riskOrder[preset.riskTier] || 0);
        checks.push({ label: "Risk Tier", met: riskMet, detail: riskMet ? `${state.riskTier} (meets ${preset.riskTier} baseline)` : `${state.riskTier} is below recommended ${preset.riskTier}` });

        const hasGuardrails = state.guardrailsConfig.stopConditions.length > 0 || state.guardrailsConfig.escalationTriggers.length > 0;
        checks.push({ label: "Guardrails", met: hasGuardrails, detail: hasGuardrails ? `${state.guardrailsConfig.stopConditions.length} stop conditions, ${state.guardrailsConfig.escalationTriggers.length} escalation triggers` : "No stop conditions or escalation triggers configured" });

        const hasOntology = state.ontologyTags.length > 0;
        checks.push({ label: "Ontology Tags", met: hasOntology, detail: hasOntology ? `${state.ontologyTags.length} domain concepts tagged` : "No domain ontology concepts assigned" });

        const industryToolNames = ctx.mcpTools.map(t => t.name.toLowerCase());
        const matchingTools = state.toolsConfig.filter(t => industryToolNames.includes(t.name.toLowerCase()));
        const hasTools = matchingTools.length > 0;
        checks.push({ label: "Industry Tools", met: hasTools, detail: hasTools ? `${matchingTools.length}/${ctx.mcpTools.length} industry tools configured` : `No industry-specific tools (${ctx.mcpTools.length} available)` });

        const hasMemGov = state.memoryGovernanceRules.length > 0;
        checks.push({ label: "Memory Governance", met: hasMemGov, detail: hasMemGov ? `${state.memoryGovernanceRules.length} governance rules active` : "No data retention or protection rules configured" });

        const hasBudget = state.contextBudget.length > 0;
        checks.push({ label: "Context Budget", met: hasBudget, detail: hasBudget ? `${state.contextBudget.length} budget allocations defined` : "No context budget allocation configured" });

        const metCount = checks.filter(c => c.met).length;
        const total = checks.length;
        const pct = Math.round((metCount / total) * 100);
        const isLow = pct < 50;

        return (
          <Card className={`border ${isLow ? "border-amber-500/50 bg-amber-500/5" : pct === 100 ? "border-green-500/30 bg-green-500/5" : "border-border"}`} data-testid="card-industry-compliance-readiness">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: pct === 100 ? "var(--color-green-500, #22c55e)" : "var(--color-amber-500, #f59e0b)" }} />
                {industryLabel} Compliance Readiness
                <Badge variant={pct === 100 ? "default" : isLow ? "destructive" : "outline"} className="text-[10px] ml-auto" data-testid="badge-compliance-score">
                  {metCount}/{total} met
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <Progress value={pct} className="h-1.5" />
              {isLow && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-compliance-warning">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  This agent may not meet {industryLabel} compliance standards
                </p>
              )}
              <div className="flex flex-col gap-1 mt-1">
                {checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-xs" data-testid={`check-${check.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {check.met ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className={check.met ? "text-muted-foreground" : "text-foreground font-medium"}>{check.label}</span>
                    <span className="text-muted-foreground ml-auto text-right">{check.detail}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs border-t pt-1 mt-1" data-testid="check-preset-source">
                  {isDynamicPreset ? (
                    <CheckCircle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={isDynamicPreset ? "text-purple-600 dark:text-purple-400 font-medium" : "text-muted-foreground"}>Preset Source</span>
                  <span className="text-muted-foreground ml-auto text-right">
                    {isDynamicPreset ? `Dynamic (${dynamicAdjustmentCount || 0} adjustments)` : "Static industry defaults"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1" data-testid="validation-gate-notice">
            <span className="text-sm font-medium">Expert Validation Required</span>
            <span className="text-xs text-muted-foreground">
              Creating this agent will automatically generate an evaluation suite with test cases derived from your tools and workflow,
              and submit a blueprint review to the expert validation queue. An expert validator must verify domain assumptions,
              regulatory constraints, and escalation paths before deployment.
            </span>
            {(state.riskTier === "HIGH" ||
              (state.permissionsConfig?.writeAccess || []).length > 0 ||
              state.outcomeId) && (
              <div className="flex flex-col gap-1 mt-2">
                {state.riskTier === "HIGH" && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>High risk tier requires enhanced review</span>
                  </div>
                )}
                {(state.permissionsConfig?.writeAccess || []).length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Tools have write access - elevated blast radius</span>
                  </div>
                )}
                {state.outcomeId && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Outcome linked to high-impact KPIs</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        onClick={handleCreate}
        disabled={isPending || !state.name || (hasMissingPolicies && !governanceOverride)}
        data-testid="button-create-agent-review"
      >
        {isPending ? "Creating Agent..." : hasMissingPolicies && !governanceOverride ? "Override Required to Create" : "Create Agent"}
      </Button>
    </div>
  );
}

function PerformanceSimulation({ state }: { state: WizardState }) {
  const toolCount = state.toolsConfig.filter(t => t.name).length;
  const nodeCount = state.workflowNodes.length;
  const hasRag = state.memoryRagEnabled;

  const modelLatencyBase: Record<string, number> = {
    "gpt-4.1": 800, "gpt-4": 900, "gpt-4o": 400, "gpt-4o-mini": 200,
    "gpt-3.5-turbo": 150, "claude-3.5-sonnet": 700, "claude-3-opus": 1200,
    "gemini-pro": 500, "gemini-1.5-pro": 600, "llama-3.1-70b": 350,
  };
  const modelCostBase: Record<string, number> = {
    "gpt-4.1": 0.03, "gpt-4": 0.06, "gpt-4o": 0.005, "gpt-4o-mini": 0.0003,
    "gpt-3.5-turbo": 0.002, "claude-3.5-sonnet": 0.015, "claude-3-opus": 0.075,
    "gemini-pro": 0.007, "gemini-1.5-pro": 0.014, "llama-3.1-70b": 0.009,
  };

  const baseLatency = modelLatencyBase[state.modelName] || 500;
  const baseCost = modelCostBase[state.modelName] || 0.01;

  const toolLatencyAdd = toolCount * 120;
  const ragLatencyAdd = hasRag ? 200 : 0;
  const nodeLatencyMultiplier = Math.max(1, nodeCount * 0.8);
  const estLatencyMs = Math.round((baseLatency + toolLatencyAdd + ragLatencyAdd) * nodeLatencyMultiplier);

  const toolCostAdd = toolCount * 0.002;
  const ragCostAdd = hasRag ? 0.005 : 0;
  const nodeCostMultiplier = Math.max(1, nodeCount * 0.7);
  const estCostPerRun = parseFloat(((baseCost + toolCostAdd + ragCostAdd) * nodeCostMultiplier).toFixed(4));

  const throughputPerMin = Math.max(1, Math.round(60000 / estLatencyMs));

  const riskFactors: string[] = [];
  if (state.riskTier === "HIGH") riskFactors.push("High risk tier requires enhanced monitoring");
  if (state.autonomyMode === "autonomous") riskFactors.push("Fully autonomous mode - no human checkpoint");
  if (toolCount > 3) riskFactors.push(`${toolCount} tools increase attack surface`);
  if (!hasRag && nodeCount > 3) riskFactors.push("Complex workflow without RAG may reduce accuracy");
  if (!state.rollbackPlan) riskFactors.push("No rollback plan configured");
  const hasWriteTools = state.toolsConfig.some(t => /write|send|delete|create/i.test(t.name));
  if (hasWriteTools) riskFactors.push("Write/send tools carry higher blast radius");

  const riskLevel = riskFactors.length >= 3 ? "high" : riskFactors.length >= 1 ? "medium" : "low";

  return (
    <Card data-testid="performance-simulation">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Performance Simulation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-latency">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Latency</span>
            </div>
            <span className="text-lg font-semibold">{estLatencyMs >= 1000 ? `${(estLatencyMs / 1000).toFixed(1)}s` : `${estLatencyMs}ms`}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-cost">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
            </div>
            <span className="text-lg font-semibold">${estCostPerRun}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-throughput">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Throughput</span>
            </div>
            <span className="text-lg font-semibold">{throughputPerMin}/min</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-risk">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Level</span>
            </div>
            <Badge
              variant={riskLevel === "high" ? "destructive" : riskLevel === "medium" ? "secondary" : "outline"}
              className="w-fit"
              data-testid="sim-risk-badge"
            >
              {riskLevel.toUpperCase()}
            </Badge>
          </div>
        </div>

        {riskFactors.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="sim-risk-factors">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Factors</span>
            {riskFactors.map((factor, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3 h-3 shrink-0" />
                <span>{factor}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Estimates based on model characteristics, tool count, workflow complexity, and RAG configuration. Actual performance may vary.
        </p>
      </CardContent>
    </Card>
  );
}
