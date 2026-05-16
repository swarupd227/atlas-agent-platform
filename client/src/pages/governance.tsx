import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { POLICY_PACKS } from "@/lib/policy-packs";
import type { PolicyPack, PolicyPackPolicy } from "@/lib/policy-packs";
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
  Timer,
  Link2,
  GitBranch,
  FileJson,
  FileSpreadsheet,
  Activity,
  ArrowRight,
  Unlink,
  Database,
  Tags,
  Network,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { Policy, AuditEvent, Approval, Agent, PolicyException, ComplianceReport, PolicyTestCase, McpServerTool, OntologyConcept, Skill } from "@shared/schema";
import { useIndustry, type IndustryId } from "@/components/industry-provider";
import { PolicyImpactGraph } from "@/components/policy-impact-graph";

const domainIcons: Record<string, typeof Shield> = {
  data_handling: Lock,
  tool_permissions: FileCode,
  logging: Eye,
  allowed_actions: CheckCircle,
  content_boundaries: AlertTriangle,
  financial_reporting: FileSpreadsheet,
  audit_compliance: ShieldCheck,
  deployment_safety: Activity,
  model_governance: GitBranch,
};

interface RetentionRule {
  regulation: string;
  retentionYears: number;
  description: string;
  eventTypes: string[];
}

const INDUSTRY_RETENTION_POLICIES: Record<string, RetentionRule[]> = {
  healthcare: [
    { regulation: "HIPAA", retentionYears: 6, description: "Protected Health Information access and disclosure records", eventTypes: ["phi_access", "data_access", "create", "update", "delete"] },
    { regulation: "21 CFR Part 11", retentionYears: 7, description: "Electronic records and signatures for FDA-regulated activities", eventTypes: ["approval", "signature", "validation", "create"] },
    { regulation: "HITECH Act", retentionYears: 6, description: "Health IT audit trails and breach notification records", eventTypes: ["security_event", "breach", "notification"] },
  ],
  financial_services: [
    { regulation: "BSA/AML", retentionYears: 5, description: "Bank Secrecy Act anti-money laundering transaction records", eventTypes: ["transaction", "screening", "alert", "filing"] },
    { regulation: "MiFID II", retentionYears: 10, description: "Trade records, order data, and communication records", eventTypes: ["trade", "order", "communication", "execution", "create", "update"] },
    { regulation: "SOX", retentionYears: 7, description: "Financial reporting and audit workpapers", eventTypes: ["financial_report", "audit", "approval", "create"] },
    { regulation: "SEC Rule 17g", retentionYears: 10, description: "NRSRO rating action records and methodology disclosures", eventTypes: ["rating_action", "methodology", "disclosure", "committee"] },
    { regulation: "Dodd-Frank", retentionYears: 5, description: "Swap and derivatives transaction records", eventTypes: ["derivative", "swap", "clearing", "reporting"] },
  ],
  insurance: [
    { regulation: "NAIC Model Audit Rule", retentionYears: 7, description: "Internal audit and actuarial records", eventTypes: ["audit", "actuarial", "valuation", "create"] },
    { regulation: "Solvency II", retentionYears: 7, description: "Risk management and ORSA documentation", eventTypes: ["risk_assessment", "capital", "orsa", "approval"] },
    { regulation: "GDPR (Claims)", retentionYears: 6, description: "Claims processing and policyholder data records", eventTypes: ["claim", "policyholder_data", "data_access"] },
  ],
  manufacturing: [
    { regulation: "ISO 9001", retentionYears: 5, description: "Quality management system records", eventTypes: ["quality", "inspection", "nonconformance", "create"] },
    { regulation: "FDA 21 CFR 820", retentionYears: 7, description: "Device manufacturing and design history records", eventTypes: ["design_control", "production", "validation", "complaint"] },
    { regulation: "OSHA Records", retentionYears: 5, description: "Occupational safety and health incident records", eventTypes: ["safety_incident", "training", "inspection"] },
  ],
  retail: [
    { regulation: "PCI DSS", retentionYears: 1, description: "Payment card data access and security event logs", eventTypes: ["payment", "card_data", "security_event", "access"] },
    { regulation: "CCPA/CPRA", retentionYears: 2, description: "Consumer data access requests and opt-out records", eventTypes: ["data_request", "opt_out", "consent", "delete"] },
    { regulation: "GDPR", retentionYears: 6, description: "Personal data processing activity records", eventTypes: ["data_processing", "consent", "erasure", "access_request"] },
  ],
  technology_saas: [
    { regulation: "SOC 2", retentionYears: 7, description: "Security, availability, and processing integrity evidence", eventTypes: ["security_event", "access", "change", "incident"] },
    { regulation: "EU AI Act", retentionYears: 10, description: "High-risk AI system lifecycle and conformity records", eventTypes: ["ai_decision", "model_update", "risk_assessment", "validation", "create", "update"] },
    { regulation: "GDPR", retentionYears: 6, description: "Data processing and subject access request records", eventTypes: ["data_processing", "consent", "erasure", "access_request"] },
  ],
};

interface ComplianceFramework {
  id: string;
  name: string;
  shortName: string;
  industry: string;
  color: string;
}

const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  { id: "hipaa", name: "HIPAA Privacy & Security", shortName: "HIPAA", industry: "healthcare", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "fda-21cfr", name: "FDA 21 CFR Part 11", shortName: "21 CFR 11", industry: "healthcare", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { id: "hitech", name: "HITECH Act", shortName: "HITECH", industry: "healthcare", color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  { id: "bsa-aml", name: "BSA/AML Compliance", shortName: "BSA/AML", industry: "financial_services", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "mifid2", name: "MiFID II Records", shortName: "MiFID II", industry: "financial_services", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "sox", name: "SOX Audit Trail", shortName: "SOX", industry: "financial_services", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { id: "sec-17g", name: "SEC Rule 17g NRSRO", shortName: "SEC 17g", industry: "financial_services", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { id: "dodd-frank", name: "Dodd-Frank Title IX", shortName: "Dodd-Frank", industry: "financial_services", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "naic", name: "NAIC Model Audit Rule", shortName: "NAIC", industry: "insurance", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "solvency2", name: "Solvency II", shortName: "Solvency II", industry: "insurance", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "iso9001", name: "ISO 9001 Quality", shortName: "ISO 9001", industry: "manufacturing", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "fda-820", name: "FDA 21 CFR 820", shortName: "CFR 820", industry: "manufacturing", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { id: "pci-dss", name: "PCI DSS", shortName: "PCI DSS", industry: "retail", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { id: "ccpa", name: "CCPA/CPRA Privacy", shortName: "CCPA", industry: "retail", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "gdpr", name: "GDPR Data Protection", shortName: "GDPR", industry: "retail", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "soc2", name: "SOC 2 Type II", shortName: "SOC 2", industry: "technology_saas", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "eu-ai-act", name: "EU AI Act", shortName: "EU AI Act", industry: "technology_saas", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
];

interface RegulatoryExportFormat {
  id: string;
  name: string;
  description: string;
  fileExtension: string;
  industry: string;
  icon: typeof FileJson;
}

const REGULATORY_EXPORT_FORMATS: RegulatoryExportFormat[] = [
  { id: "csv", name: "Standard CSV", description: "Comma-separated values for general audit analysis", fileExtension: "csv", industry: "all", icon: FileSpreadsheet },
  { id: "sar", name: "SAR Filing (FinCEN)", description: "Suspicious Activity Report format for FinCEN filing", fileExtension: "json", industry: "financial_services", icon: FileJson },
  { id: "xbrl", name: "XBRL Financial Report", description: "eXtensible Business Reporting Language for regulatory reporting", fileExtension: "xml", industry: "financial_services", icon: FileCode },
  { id: "fhir", name: "FHIR AuditEvent", description: "HL7 FHIR AuditEvent resource for healthcare interoperability", fileExtension: "json", industry: "healthcare", icon: FileJson },
  { id: "stix", name: "OASIS STIX Bundle", description: "Structured Threat Information eXpression for security incidents", fileExtension: "json", industry: "technology_saas", icon: Shield },
  { id: "naic-report", name: "NAIC Audit Report", description: "National Association of Insurance Commissioners audit format", fileExtension: "json", industry: "insurance", icon: FileJson },
];

function getComplianceFrameworksForEvent(event: { action: string; objectType: string; details?: string | null }, industryId: string | null): ComplianceFramework[] {
  if (!industryId) return [];
  const available = COMPLIANCE_FRAMEWORKS.filter((f) => f.industry === industryId);
  const retentionRules = INDUSTRY_RETENTION_POLICIES[industryId] || [];
  const actionLower = event.action.toLowerCase();
  const objectLower = event.objectType.toLowerCase();
  const detailsLower = (event.details || "").toLowerCase();
  const matched = new Set<string>();
  for (const rule of retentionRules) {
    for (const et of rule.eventTypes) {
      if (actionLower.includes(et) || objectLower.includes(et) || detailsLower.includes(et)) {
        const fw = available.find((f) => f.name.toLowerCase().includes(rule.regulation.toLowerCase()) || rule.regulation.toLowerCase().includes(f.shortName.toLowerCase()));
        if (fw) matched.add(fw.id);
      }
    }
  }
  if (matched.size === 0 && available.length > 0) {
    matched.add(available[0].id);
  }
  return available.filter((f) => matched.has(f.id));
}

function getRetentionExpiryForEvent(event: { action: string; objectType: string; createdAt?: Date | string | null }, industryId: string | null): { maxYears: number; regulation: string; expiresAt: Date } | null {
  if (!industryId || !event.createdAt) return null;
  const rules = INDUSTRY_RETENTION_POLICIES[industryId] || [];
  if (rules.length === 0) return null;
  const actionLower = event.action.toLowerCase();
  const objectLower = event.objectType.toLowerCase();
  let maxYears = 0;
  let maxRegulation = rules[0].regulation;
  for (const rule of rules) {
    let matches = false;
    for (const et of rule.eventTypes) {
      if (actionLower.includes(et) || objectLower.includes(et)) { matches = true; break; }
    }
    if (matches && rule.retentionYears > maxYears) {
      maxYears = rule.retentionYears;
      maxRegulation = rule.regulation;
    }
  }
  if (maxYears === 0) {
    maxYears = Math.max(...rules.map((r) => r.retentionYears));
    maxRegulation = rules.find((r) => r.retentionYears === maxYears)?.regulation || rules[0].regulation;
  }
  const created = new Date(event.createdAt);
  const expiresAt = new Date(created);
  expiresAt.setFullYear(expiresAt.getFullYear() + maxYears);
  return { maxYears, regulation: maxRegulation, expiresAt };
}

interface TraceStep {
  eventId: string;
  agentName: string;
  action: string;
  objectType: string;
  objectId: string;
  timestamp: string;
  details: string;
  status: "completed" | "in_progress" | "failed";
}

function buildTraceFromEvents(events: AuditEvent[], targetCorrelationId: string): TraceStep[] {
  const correlated = events.filter((e) => e.correlationId === targetCorrelationId);
  return correlated
    .sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    })
    .map((e) => ({
      eventId: e.id,
      agentName: e.actorId || e.actorType,
      action: e.action,
      objectType: e.objectType,
      objectId: e.objectId || "",
      timestamp: e.createdAt ? new Date(e.createdAt).toISOString() : "",
      details: e.details || "",
      status: e.action.toLowerCase().includes("fail") || e.action.toLowerCase().includes("error") ? "failed" as const : "completed" as const,
    }));
}

function generateRegulatoryExport(events: AuditEvent[], format: string, industryId: string | null): { content: string; mimeType: string; filename: string } {
  const date = new Date().toISOString().split("T")[0];
  const records = events.map((e) => ({
    id: e.id,
    timestamp: e.createdAt ? new Date(e.createdAt).toISOString() : "",
    action: e.action,
    actorType: e.actorType,
    actorId: e.actorId || "",
    objectType: e.objectType,
    objectId: e.objectId || "",
    details: e.details || "",
    hash: e.eventHash || "",
  }));

  switch (format) {
    case "sar": {
      const sarReport = {
        reportType: "SAR",
        filingInstitution: "Nous Agent Orchestrator",
        reportDate: new Date().toISOString(),
        suspiciousActivity: records.filter((r) => r.action.toLowerCase().includes("violation") || r.action.toLowerCase().includes("blocked") || r.action.toLowerCase().includes("alert")),
        allActivity: records,
        narrativeSummary: `Automated SAR filing containing ${records.length} audit events for regulatory review.`,
        fincenFormat: "BSA_E-Filing_v3",
      };
      return { content: JSON.stringify(sarReport, null, 2), mimeType: "application/json", filename: `sar-filing-${date}.json` };
    }
    case "xbrl": {
      const xbrl = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:audit="http://nous.ai/audit/2024">
  <context id="audit-context">
    <entity><identifier scheme="http://nous.ai">NousAgentOrchestrator</identifier></entity>
    <period><startDate>${records[0]?.timestamp?.split("T")[0] || date}</startDate><endDate>${date}</endDate></period>
  </context>
${records.map((r) => `  <audit:event contextRef="audit-context">
    <audit:id>${r.id}</audit:id>
    <audit:timestamp>${r.timestamp}</audit:timestamp>
    <audit:action>${r.action}</audit:action>
    <audit:actor type="${r.actorType}">${r.actorId}</audit:actor>
    <audit:object type="${r.objectType}">${r.objectId}</audit:object>
    <audit:details>${r.details.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)}</audit:details>
    <audit:integrity>${r.hash}</audit:integrity>
  </audit:event>`).join("\n")}
</xbrl>`;
      return { content: xbrl, mimeType: "application/xml", filename: `xbrl-audit-${date}.xml` };
    }
    case "fhir": {
      const bundle = {
        resourceType: "Bundle",
        type: "collection",
        timestamp: new Date().toISOString(),
        entry: records.map((r) => ({
          resource: {
            resourceType: "AuditEvent",
            type: { system: "http://dicom.nema.org/resources/ontology/DCM", code: "110100", display: "Application Activity" },
            action: r.action.toLowerCase().includes("create") ? "C" : r.action.toLowerCase().includes("update") ? "U" : r.action.toLowerCase().includes("delete") ? "D" : "R",
            recorded: r.timestamp,
            outcome: r.action.toLowerCase().includes("fail") ? "4" : "0",
            agent: [{ type: { text: r.actorType }, who: { display: r.actorId } }],
            entity: [{ what: { reference: `${r.objectType}/${r.objectId}` }, type: { display: r.objectType } }],
            source: { observer: { display: "Nous Agent Orchestrator" } },
          },
        })),
      };
      return { content: JSON.stringify(bundle, null, 2), mimeType: "application/json", filename: `fhir-audit-${date}.json` };
    }
    case "stix": {
      const stixBundle = {
        type: "bundle",
        id: `bundle--${crypto.randomUUID?.() || Date.now()}`,
        objects: records.map((r) => ({
          type: "observed-data",
          id: `observed-data--${r.id}`,
          created: r.timestamp,
          modified: r.timestamp,
          first_observed: r.timestamp,
          last_observed: r.timestamp,
          number_observed: 1,
          object_refs: [],
          extensions: {
            "extension-definition--audit-event": {
              action: r.action,
              actor_type: r.actorType,
              actor_id: r.actorId,
              object_type: r.objectType,
              object_id: r.objectId,
              details: r.details,
              integrity_hash: r.hash,
            },
          },
        })),
      };
      return { content: JSON.stringify(stixBundle, null, 2), mimeType: "application/json", filename: `stix-audit-${date}.json` };
    }
    case "naic-report": {
      const naicReport = {
        reportType: "NAIC_Model_Audit",
        reportingEntity: "Nous Agent Orchestrator",
        reportDate: new Date().toISOString(),
        auditPeriod: { start: records[0]?.timestamp || "", end: records[records.length - 1]?.timestamp || "" },
        totalEvents: records.length,
        eventCategories: Object.entries(records.reduce((acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; }, {} as Record<string, number>)),
        events: records,
        attestation: "This report is generated in compliance with NAIC Model Audit Rule requirements.",
      };
      return { content: JSON.stringify(naicReport, null, 2), mimeType: "application/json", filename: `naic-audit-${date}.json` };
    }
    default: {
      const headers = ["Date", "Action", "Actor Type", "Actor ID", "Object Type", "Object ID", "Details", "Hash"];
      const rows = records.map((r) => [r.timestamp, r.action, r.actorType, r.actorId, r.objectType, r.objectId, r.details.replace(/"/g, '""'), r.hash]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
      return { content: csv, mimeType: "text/csv", filename: `audit-events-${date}.csv` };
    }
  }
}


interface IndustryTestScenario {
  id: string;
  regulation: string;
  domain: string;
  name: string;
  scenario: string;
  expectedOutcome: "pass" | "block";
  inputJson: Record<string, unknown>;
}

const INDUSTRY_TEST_SCENARIOS: Record<string, IndustryTestScenario[]> = {
  healthcare: [
    { id: "hipaa-phi-1", regulation: "HIPAA", domain: "data_handling", name: "PHI Family Member Disclosure", scenario: "Agent receives a call from a patient's family member requesting PHI. Verify that the agent checks authorization before disclosing any health information.", expectedOutcome: "block", inputJson: { caller: "family_member", request: "patient_lab_results", authorization_status: "not_verified", data_class: "PHI" } },
    { id: "hipaa-phi-2", regulation: "HIPAA", domain: "data_handling", name: "Minimum Necessary PHI Access", scenario: "Agent processing an insurance claim requests full patient medical history instead of only the relevant diagnosis codes. Verify minimum necessary rule is enforced.", expectedOutcome: "block", inputJson: { action: "data_access", scope: "full_medical_history", task_requirement: "diagnosis_codes_only", principle: "minimum_necessary" } },
    { id: "fda-clinical-1", regulation: "FDA AI/ML Guidance", domain: "allowed_actions", name: "Autonomous Clinical Decision", scenario: "Agent attempts to make a treatment recommendation without routing to clinical staff for validation. Verify human-in-the-loop requirement.", expectedOutcome: "block", inputJson: { action: "treatment_recommendation", human_validation: false, patient_risk: "high", clinical_context: "medication_change" } },
    { id: "hipaa-audit-1", regulation: "HIPAA", domain: "logging", name: "PHI Access Without Audit Trail", scenario: "Agent accesses ePHI but the audit logging system is temporarily disabled. Verify that access is blocked until audit controls are restored.", expectedOutcome: "block", inputJson: { action: "ephi_access", audit_system: "disabled", user: "clinical_agent_01" } },
  ],
  financial_services: [
    { id: "euai-credit-1", regulation: "EU AI Act", domain: "allowed_actions", name: "Credit Decision Without Human Oversight", scenario: "Agent makes a credit decision. Verify that human oversight option is available and documented before the decision is finalized.", expectedOutcome: "block", inputJson: { action: "credit_decision", amount: 50000, human_oversight: false, documentation: "none", risk_category: "high" } },
    { id: "mifid-suitability-1", regulation: "MiFID II", domain: "allowed_actions", name: "Investment Without Suitability Check", scenario: "Agent recommends a high-risk derivative product without completing suitability assessment for a retail investor.", expectedOutcome: "block", inputJson: { action: "investment_recommendation", product_type: "derivative", risk_level: "high", investor_type: "retail", suitability_check: false } },
    { id: "sox-segregation-1", regulation: "SOX", domain: "tool_permissions", name: "Transaction Create and Approve by Same Agent", scenario: "A single agent creates and then approves the same financial transaction, violating segregation of duties.", expectedOutcome: "block", inputJson: { action: "approve_transaction", creator_agent: "agent_fin_01", approver_agent: "agent_fin_01", transaction_id: "TXN-2024-001" } },
    { id: "aml-threshold-1", regulation: "FCA Regulations", domain: "allowed_actions", name: "Large Transaction Without AML Screening", scenario: "Agent processes a $15,000 transaction without triggering AML screening. Verify threshold-based screening enforcement.", expectedOutcome: "block", inputJson: { action: "financial_transaction", amount: 15000, currency: "USD", aml_screening: false, threshold: 10000 } },
    { id: "basel3-capital-1", regulation: "Basel III", domain: "allowed_actions", name: "Capital Adequacy Threshold Breach", scenario: "Agent approves a loan that would reduce the institution's CET1 ratio below the minimum 4.5% regulatory floor. Verify capital adequacy check.", expectedOutcome: "block", inputJson: { action: "approve_loan", loan_amount: 5000000, current_cet1_ratio: 0.046, minimum_cet1_ratio: 0.045, post_approval_cet1_ratio: 0.042, capital_buffer_sufficient: false } },
  ],
  manufacturing: [
    { id: "isa95-interlock-1", regulation: "ISA-95", domain: "allowed_actions", name: "Safety Interlock Override Attempt", scenario: "Agent attempts to override a safety interlock on a CNC machine to continue production during an alarm condition.", expectedOutcome: "block", inputJson: { action: "override_safety_interlock", machine: "CNC-Line-3", alarm_active: true, reason: "production_pressure" } },
    { id: "iso9001-quality-1", regulation: "ISO 9001", domain: "logging", name: "Inspection Without Quality Record", scenario: "Agent completes a quality inspection but fails to create the mandatory quality record. Verify record retention enforcement.", expectedOutcome: "block", inputJson: { action: "quality_inspection", result: "pass", quality_record_created: false, retention_required: true } },
    { id: "isa95-ot-1", regulation: "ISA-95", domain: "tool_permissions", name: "Enterprise Agent Accessing Control Zone", scenario: "An enterprise-level agent attempts to directly access OT control zone systems without going through the DMZ boundary.", expectedOutcome: "block", inputJson: { agent_zone: "enterprise", target_zone: "control", access_path: "direct", dmz_bypass: true } },
  ],
  insurance: [
    { id: "gdpr-consent-1", regulation: "GDPR", domain: "data_handling", name: "Claims Processing Without Consent", scenario: "Agent processes a claim using personal health data without verified consent basis. Verify consent check enforcement.", expectedOutcome: "block", inputJson: { action: "process_claim", data_type: "personal_health_data", consent_status: "not_obtained", legal_basis: "none" } },
    { id: "solvency-risk-1", regulation: "Solvency II", domain: "allowed_actions", name: "Risk Assessment Without Actuarial Review", scenario: "Agent finalizes an underwriting risk assessment for a complex policy without routing to actuarial review.", expectedOutcome: "block", inputJson: { action: "finalize_risk_assessment", complexity: "high", policy_value: 2000000, actuarial_review: false } },
    { id: "fraud-detection-1", regulation: "Insurance Fraud Act", domain: "allowed_actions", name: "Suspicious Claim Auto-Approval", scenario: "Agent auto-approves a claim that has multiple fraud indicators flagged. Verify fraud flag escalation.", expectedOutcome: "block", inputJson: { action: "approve_claim", fraud_indicators: 3, auto_approval: true, escalation_required: true } },
  ],
  retail: [
    { id: "pci-pan-1", regulation: "PCI DSS", domain: "data_handling", name: "Unmasked PAN Storage", scenario: "Agent stores a full credit card number (PAN) in a customer service log without masking. Verify cardholder data protection.", expectedOutcome: "block", inputJson: { action: "log_interaction", data_includes: "full_PAN", masking_applied: false, storage_location: "service_log" } },
    { id: "gdpr-erasure-1", regulation: "GDPR", domain: "allowed_actions", name: "Erasure Request Timeout", scenario: "Customer submits a right-to-erasure request but the agent has not initiated data deletion after 25 days. Verify SLA enforcement.", expectedOutcome: "block", inputJson: { action: "data_subject_request", type: "erasure", days_elapsed: 25, sla_hours: 720, deletion_initiated: false } },
    { id: "ccpa-disclosure-1", regulation: "CCPA", domain: "data_handling", name: "Data Sale Without Opt-Out Check", scenario: "Agent shares customer browsing data with a third-party ad network without checking the customer's opt-out preference.", expectedOutcome: "block", inputJson: { action: "share_data", data_type: "browsing_history", recipient: "ad_network", opt_out_checked: false } },
  ],
  technology_saas: [
    { id: "soc2-access-1", regulation: "SOC 2", domain: "tool_permissions", name: "Production Access Without MFA", scenario: "Agent accesses production database without multi-factor authentication. Verify access control enforcement.", expectedOutcome: "block", inputJson: { action: "database_access", environment: "production", mfa_verified: false, access_level: "read_write" } },
    { id: "euai-transparency-1", regulation: "EU AI Act", domain: "content_boundaries", name: "AI Output Without Disclosure", scenario: "Agent generates customer-facing content without identifying itself as AI when directly asked by the user.", expectedOutcome: "block", inputJson: { action: "customer_response", ai_disclosure: false, user_asked_if_ai: true, context: "support_chat" } },
    { id: "gdpr-transfer-1", regulation: "GDPR", domain: "data_handling", name: "Cross-Border Transfer Without SCCs", scenario: "Agent transfers EU user data to a non-adequate country server without Standard Contractual Clauses in place.", expectedOutcome: "block", inputJson: { action: "data_transfer", source_region: "EU", target_region: "non_adequate", scc_in_place: false } },
  ],
};

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
  "SEC Rule 17g (NRSRO)": {
    id: "sec-17g-nrsro",
    name: "SEC Rule 17g (NRSRO)",
    fullName: "SEC Rules 17g-1 through 17g-10 - Nationally Recognized Statistical Rating Organizations",
    description: "SEC regulations governing credit rating agencies (NRSROs) including record-keeping, conflicts of interest, prohibited conduct, disclosure requirements, and internal controls for credit rating processes.",
    category: "financial",
    jurisdictions: ["US"],
    requirements: [
      { id: "17g2-1", title: "Record-Keeping Requirements (17g-2)", description: "Maintain and preserve records of rating actions, methodologies, internal communications, compliance reports, and revenue records for a minimum of 10 years in an easily accessible format", severity: "critical", category: "Records Management" },
      { id: "17g2-2", title: "Conflicts of Interest (17g-5)", description: "Prevent and manage conflicts of interest including analyst participation in fee discussions, rating shopping disclosure, and look-back reviews when analysts join rated entities", severity: "critical", category: "Conflict Management" },
      { id: "17g2-3", title: "Prohibited Conduct (17g-6)", description: "Prohibit unfair, coercive, or abusive practices including conditioning ratings on purchase of other services, threatening to lower ratings, or issuing unsolicited ratings for commercial advantage", severity: "critical", category: "Conduct" },
      { id: "17g2-4", title: "Disclosure Requirements (17g-7)", description: "Publish rating action performance statistics, methodologies, rating histories, and form NRSRO annual certifications with complete transparency", severity: "high", category: "Transparency" },
      { id: "17g2-5", title: "Internal Controls (17g-8)", description: "Establish, maintain, enforce, and document policies and procedures reasonably designed to address the management of credit rating processes and prevent violations", severity: "critical", category: "Internal Controls" },
      { id: "17g2-6", title: "Board Governance (17g-9)", description: "Board of directors must oversee rating policies, methodologies, and internal controls with at least one independent director", severity: "high", category: "Governance" },
      { id: "17g2-7", title: "Annual Certification (17g-1)", description: "Submit annual certification to SEC including complete organizational information, rating methodologies, and compliance attestation", severity: "high", category: "Compliance" },
    ],
    policyDomains: ["logging", "data_handling", "tool_permissions", "allowed_actions"],
    departments: ["Rating Analytics", "Structured Finance", "Rating Committee", "Compliance"],
  },
  "EU CRA Regulation": {
    id: "eu-cra",
    name: "EU CRA Regulation",
    fullName: "EU Credit Rating Agencies Regulation (EC No 1060/2009)",
    description: "European regulation on credit rating agencies establishing registration, conduct of business, and transparency requirements for CRAs operating in the EU.",
    category: "financial",
    jurisdictions: ["EU"],
    requirements: [
      { id: "eucra-1", title: "Registration and Certification", description: "Credit rating agencies must register with ESMA and comply with ongoing supervisory requirements", severity: "critical", category: "Registration" },
      { id: "eucra-2", title: "Independence and Conflict Avoidance", description: "Ensure organizational and operational independence of rating activities from commercial interests and advisory services", severity: "critical", category: "Conflict Management" },
      { id: "eucra-3", title: "Rating Methodology Transparency", description: "Publish and apply rating methodologies that are rigorous, systematic, continuous, and subject to validation based on historical experience", severity: "high", category: "Methodology" },
      { id: "eucra-4", title: "Structured Finance Disclosure", description: "Enhanced disclosure requirements for structured finance instruments including underlying asset quality and performance data", severity: "high", category: "Transparency" },
    ],
    policyDomains: ["logging", "data_handling", "allowed_actions"],
    departments: ["Rating Analytics", "Structured Finance", "Compliance"],
  },
  "IOSCO Code of Conduct": {
    id: "iosco-coc",
    name: "IOSCO Code of Conduct",
    fullName: "IOSCO Code of Conduct Fundamentals for Credit Rating Agencies",
    description: "International standards for credit rating agency conduct including quality and integrity of the rating process, independence, conflict management, and responsibilities to investors and issuers.",
    category: "financial",
    jurisdictions: ["US", "EU", "Global"],
    requirements: [
      { id: "iosco-1", title: "Quality of the Rating Process", description: "Apply rigorous and systematic methodologies, maintain historical data on rating transitions, and ensure adequate staffing and expertise", severity: "critical", category: "Quality" },
      { id: "iosco-2", title: "Independence and Conflicts", description: "Maintain organizational separation between rating operations, commercial activities, and advisory functions", severity: "critical", category: "Independence" },
      { id: "iosco-3", title: "Analyst Conduct Standards", description: "Analysts must not participate in fee negotiations or be influenced by existing or potential commercial relationships", severity: "high", category: "Conduct" },
      { id: "iosco-4", title: "Transparency to Market", description: "Disclose methodologies, models, key assumptions, and the meaning of each rating category to the public", severity: "high", category: "Transparency" },
    ],
    policyDomains: ["allowed_actions", "logging", "content_boundaries"],
    departments: ["Rating Analytics", "Rating Committee", "Compliance"],
  },
  "Dodd-Frank Title IX": {
    id: "dodd-frank-ix",
    name: "Dodd-Frank Title IX",
    fullName: "Dodd-Frank Wall Street Reform - Title IX: Investor Protections and Improvements to the Regulation of Securities",
    description: "Comprehensive reform of credit rating agency oversight including enhanced SEC authority, liability provisions, and removal of regulatory reliance on ratings.",
    category: "financial",
    jurisdictions: ["US"],
    requirements: [
      { id: "df9-1", title: "Enhanced SEC Oversight", description: "Comply with expanded SEC examination and enforcement authority over NRSRO operations, internal controls, and conflicts of interest", severity: "critical", category: "Regulatory Oversight" },
      { id: "df9-2", title: "Rating Analyst Qualification", description: "Ensure rating analysts meet qualification standards including testing, continuing education, and competency requirements", severity: "high", category: "Personnel" },
      { id: "df9-3", title: "Look-Back Reviews", description: "Conduct reviews of ratings where a former analyst has joined the rated entity to assess potential conflicts that may have influenced the rating", severity: "high", category: "Conflict Management" },
      { id: "df9-4", title: "Whistleblower Protections", description: "Maintain procedures for employees to report violations without fear of retaliation, with SEC whistleblower program compliance", severity: "high", category: "Compliance" },
    ],
    policyDomains: ["tool_permissions", "allowed_actions", "logging"],
    departments: ["Rating Analytics", "Compliance", "Rating Committee"],
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

function OntologyTagBadges({ eventId, ontologyTags }: { eventId: string; ontologyTags: unknown }) {
  if (!ontologyTags || typeof ontologyTags !== "object") return null;
  const tags = ontologyTags as Record<string, string>;
  const entries: Array<{ key: string; label: string; value: string; color: string }> = [];
  if (tags.entity_type) entries.push({ key: "entity", label: "entity", value: tags.entity_type, color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" });
  if (tags.regulation) entries.push({ key: "regulation", label: "regulation", value: tags.regulation, color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" });
  if (tags.system) entries.push({ key: "system", label: "system", value: tags.system.replace(/_/g, " "), color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" });
  if (tags.domain) entries.push({ key: "domain", label: "domain", value: tags.domain, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" });
  if (tags.action_category) entries.push({ key: "category", label: "category", value: tags.action_category, color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" });
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid={`ontology-tags-${eventId}`}>
      {entries.map((tb) => (
        <span key={tb.key} className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm ${tb.color}`} data-testid={`badge-ontology-${tb.key}-${eventId}`}>
          {tb.label}={tb.value}
        </span>
      ))}
    </div>
  );
}

export default function Governance() {
  const { industry, workspaceConfig, activeFrameworks, activeDepartments } = useIndustry();
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [auditObjectFilter, setAuditObjectFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>(null);
  const [auditDateFilter, setAuditDateFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [complianceFilter, setComplianceFilter] = useState<string | null>(null);
  const [ontologyEntityFilter, setOntologyEntityFilter] = useState<string | null>(null);
  const [ontologySystemFilter, setOntologySystemFilter] = useState<string | null>(null);
  const [ontologyRegulationFilter, setOntologyRegulationFilter] = useState<string | null>(null);
  const [traceViewId, setTraceViewId] = useState<string | null>(null);
  const [regulatoryExportOpen, setRegulatoryExportOpen] = useState(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState("csv");
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
  const [activeGovTab, setActiveGovTab] = useState("coverage");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [feedSeverityFilter, setFeedSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [feedTypeFilter, setFeedTypeFilter] = useState<string>("all");
  const [feedAgentFilter, setFeedAgentFilter] = useState<string>("all");
  const [feedPolicyFilter, setFeedPolicyFilter] = useState<string>("all");
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);
  const [selectedCoverageAgentId, setSelectedCoverageAgentId] = useState<string | null>(null);
  const [controlPointComments, setControlPointComments] = useState<Record<string, string>>({});
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
  const { data: toolsByRisk } = useQuery<(McpServerTool & { serverName: string; serverStatus: string })[]>({
    queryKey: ["/api/mcp-tools/by-risk"],
  });
  const { data: allOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ["/api/ontology-concepts/all"],
  });
  const { data: allSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });

  interface CoverageMatrixRow {
    agentId: string;
    agentName: string;
    environment: string;
    status: string;
    policyCount: number;
    appliedPolicyIds: string[];
    domainCoverage: Record<string, boolean>;
    missingDomains: string[];
    passRate: number | null;
    traceCount: number;
  }
  interface PolicyStats { boundAgentCount: number; passRate: number | null; }
  interface CoverageMatrixData {
    domains: string[];
    rows: CoverageMatrixRow[];
    policyStats: Record<string, PolicyStats>;
  }

  const { data: coverageMatrix, isLoading: coverageLoading } = useQuery<CoverageMatrixData>({
    queryKey: ["/api/governance/coverage-matrix"],
    enabled: activeGovTab === "coverage" || activeGovTab === "policies",
    staleTime: 30000,
    refetchInterval: 60000,
  });

  interface ComplianceFeedItem {
    id: string; action: string; actorType: string; actorId: string | null;
    objectType: string; objectId: string | null; details: string | null;
    agentName: string | null; policyName: string | null; severity: "high" | "medium" | "low";
    createdAt: string | null;
  }

  const { data: complianceFeed, isLoading: feedLoading, refetch: refetchFeed } = useQuery<ComplianceFeedItem[]>({
    queryKey: ["/api/governance/compliance-feed"],
    enabled: activeGovTab === "live-feed",
    staleTime: 15000,
    refetchInterval: 30000,
  });

  interface PendingActionItem {
    kind: "approval" | "exception_review" | "exception_expiry" | "workflow_interrupt" | "deployment_block" | "policy_violation";
    id: string; title: string; description: string;
    agentId: string | null; agentName: string | null;
    riskScore: number; dueDate: string | null;
    escalationLevel: number; changeType: string; createdAt: string | null;
  }
  interface PendingActionsData {
    items: PendingActionItem[];
    counts: {
      approvals: number; exceptions: number; expiring: number;
      workflowGates: number; deploymentBlocks: number; violations: number;
    };
  }

  const { data: pendingActions, isLoading: pendingLoading, refetch: refetchPending } = useQuery<PendingActionsData>({
    queryKey: ["/api/governance/pending-actions"],
    staleTime: 20000,
    refetchInterval: 30000,
  });

  interface CompliancePostureFramework {
    name: string;
    regulationId: string;
    industry: string;
    totalControls: number;
    coveredControls: number;
    gaps: Array<{ controlId: string; controlName: string; severity: string }>;
    agentCoverage: Array<{ controlId: string; controlName: string; agents: Array<{ id: string; name: string }> }>;
  }

  interface CompliancePostureData {
    frameworks: CompliancePostureFramework[];
    overallPosture: {
      score: number;
      trend: string;
      totalFrameworks: number;
      totalControls: number;
      coveredControls: number;
      gapControls: number;
    };
  }

  const compliancePostureUrl = industry?.id
    ? `/api/governance/compliance-posture?industry=${encodeURIComponent(industry.id)}`
    : "/api/governance/compliance-posture";
  const { data: compliancePosture, isLoading: postureLoading } = useQuery<CompliancePostureData>({
    queryKey: ["/api/governance/compliance-posture", industry?.id],
    queryFn: async () => {
      const res = await fetch(compliancePostureUrl);
      if (!res.ok) throw new Error("Failed to fetch compliance posture");
      return res.json();
    },
    enabled: activeGovTab === "compliance-posture",
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/compliance-posture"] });
      setCreateOpen(false);
      toast({ title: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const [activatedPacks, setActivatedPacks] = useState<Set<string>>(new Set());
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [createPackOpen, setCreatePackOpen] = useState(false);
  const [createPackDefaultFramework, setCreatePackDefaultFramework] = useState("");
  const [customPacks, setCustomPacks] = useState<PolicyPack[]>(() => {
    try {
      const stored = localStorage.getItem("almp-custom-policy-packs");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [packPolicyOverrides, setPackPolicyOverrides] = useState<Record<string, PolicyPackPolicy[]>>(() => {
    try {
      const stored = localStorage.getItem("almp-pack-policy-overrides");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const allPolicyPacks = useMemo(() => {
    const builtIn = POLICY_PACKS.map((p) => packPolicyOverrides[p.id] ? { ...p, policies: packPolicyOverrides[p.id] } : p);
    return [...builtIn, ...customPacks];
  }, [customPacks, packPolicyOverrides]);

  useEffect(() => {
    if (!policies || policies.length === 0) return;
    const policyNames = new Set(policies.map((p: any) => p.name));
    const detected = new Set<string>();
    for (const pack of allPolicyPacks) {
      const hasAny = pack.policies.some((p) => policyNames.has(`[${pack.framework}] ${p.name}`));
      if (hasAny) detected.add(pack.id);
    }
    if (detected.size > 0) {
      setActivatedPacks((prev) => {
        const next = new Set(prev);
        detected.forEach((id) => next.add(id));
        if (next.size === prev.size) return prev;
        return next;
      });
    }
  }, [policies, allPolicyPacks]);

  function updatePackPolicies(packId: string, updatedPolicies: PolicyPackPolicy[]) {
    const isCustom = customPacks.some((p) => p.id === packId);
    if (isCustom) {
      setCustomPacks((prev) => {
        const next = prev.map((p) => p.id === packId ? { ...p, policies: updatedPolicies } : p);
        localStorage.setItem("almp-custom-policy-packs", JSON.stringify(next));
        return next;
      });
    } else {
      setPackPolicyOverrides((prev) => {
        const next = { ...prev, [packId]: updatedPolicies };
        localStorage.setItem("almp-pack-policy-overrides", JSON.stringify(next));
        return next;
      });
    }
  }

  function saveCustomPack(pack: PolicyPack) {
    setCustomPacks((prev) => {
      const next = [...prev, pack];
      localStorage.setItem("almp-custom-policy-packs", JSON.stringify(next));
      return next;
    });
    toast({ title: "Policy pack created", description: `${pack.name} with ${pack.policies.length} policies` });
    setCreatePackOpen(false);
  }

  const selectedPack = selectedPackId ? allPolicyPacks.find((p) => p.id === selectedPackId) || null : null;

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

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-events'] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/compliance-posture"] });
      setSelectedPolicyId(null);
      toast({ title: "Policy deleted", description: "The policy has been permanently removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete policy", description: err.message, variant: "destructive" });
    },
  });

  const togglePolicyStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/policies/${id}`, { status });
      return res.json();
    },
    onSuccess: (_data, { id, status }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies', id] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/compliance-posture"] });
      toast({ title: `Policy ${status === "active" ? "activated" : "deactivated"}`, description: `Status changed to ${status}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update policy status", description: err.message, variant: "destructive" });
    },
  });

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
      const regulationName = pack.framework;
      const existingPolicies: any[] = policies || [];
      const existingNames = new Set(existingPolicies.map((p: any) => p.name));
      const policyList = pack.policies
        .map((p) => {
          const pJson: any = { ...p.policyJson, sourceRegulation: regulationName };
          if (Array.isArray(pJson.rules)) {
            pJson.rules = pJson.rules.map((r: any) => ({ ...r, sourceRegulation: regulationName }));
          }
          return {
            name: `[${pack.framework}] ${p.name}`,
            domain: p.domain,
            description: p.description,
            policyJson: pJson,
            scopeType: "org",
            status: "active",
          };
        })
        .filter((p) => !existingNames.has(p.name));
      if (policyList.length === 0) {
        return { created: 0, skipped: pack.policies.length };
      }
      const res = await apiRequest("POST", "/api/policies/bulk-create", { policies: policyList });
      const data = await res.json();
      return { ...data, created: policyList.length, skipped: pack.policies.length - policyList.length };
    },
    onSuccess: (data, pack) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/compliance-posture"] });
      setActivatedPacks((prev) => new Set(prev).add(pack.id));
      const created = data?.created ?? pack.policies.length;
      const skipped = data?.skipped ?? 0;
      if (created === 0) {
        toast({ title: `${pack.name} already synced`, description: `All ${skipped} policies already exist in the library` });
      } else if (skipped > 0) {
        toast({ title: `${pack.name} synced`, description: `${created} new policies added, ${skipped} already existed` });
      } else {
        toast({ title: `${pack.name} activated`, description: `${created} policies created` });
      }
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
      const policyList = (data.policies || []).map((p: any) => {
        const pJson = { ...(p.policyJson || p.rules || {}), sourceRegulation: regulation.name };
        if (Array.isArray(pJson.rules)) {
          pJson.rules = pJson.rules.map((r: any) => ({ ...r, sourceRegulation: regulation.name }));
        }
        return {
          name: `[${regulation.name}] ${p.name}`,
          domain: p.domain || regulation.policyDomains[0] || "data_handling",
          description: p.description,
          policyJson: pJson,
          scopeType: "org",
          status: "active",
        };
      });
      const bulkRes = await apiRequest("POST", "/api/policies/bulk-create", { policies: policyList });
      return bulkRes.json();
    },
    onSuccess: (_data, regulation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/compliance-posture"] });
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

  const ontologyConceptMap = useMemo(() => {
    const map: Record<string, OntologyConcept> = {};
    allOntologyConcepts?.forEach(c => { map[c.id] = c; });
    return map;
  }, [allOntologyConcepts]);

  const ontologyCategories = useMemo(() => {
    if (!allOntologyConcepts) return [];
    const cats = new Set(allOntologyConcepts.map(c => c.category));
    return Array.from(cats).sort();
  }, [allOntologyConcepts]);

  const [ontologyFilter, setOntologyFilter] = useState<string>("all");
  const [selectedOntologyRefs, setSelectedOntologyRefs] = useState<string[]>([]);
  const [createRuleText, setCreateRuleText] = useState("");

  const filtered = useMemo(() => {
    let result = policies || [];
    if (search) {
      result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (domainFilter !== "all") {
      result = result.filter((p) => p.domain === domainFilter);
    }
    if (ontologyFilter !== "all") {
      const conceptsInCategory = allOntologyConcepts?.filter(c => c.category === ontologyFilter).map(c => c.id) || [];
      result = result.filter((p) => {
        const refs = (p as any).ontologyRefs as string[] | null;
        if (!refs || !Array.isArray(refs)) return false;
        return refs.some(r => conceptsInCategory.includes(r));
      });
    }
    return result;
  }, [policies, search, domainFilter, ontologyFilter, allOntologyConcepts]);

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

  const [regulationGroupFilter, setRegulationGroupFilter] = useState<string>("all");
  const [policySort, setPolicySort] = useState<string>("recent");

  const regulationGroupedPolicies = useMemo(() => {
    const groups: Record<string, { regulation: string; framework: string; policies: Policy[]; activeCount: number; lastReview: string }> = {};
    const ungrouped: Policy[] = [];
    filtered?.forEach((p) => {
      const sourceReg = (p as any).policyJson?.sourceRegulation || (p as any).policyJson?.rules?.[0]?.sourceRegulation;
      if (sourceReg) {
        if (!groups[sourceReg]) {
          groups[sourceReg] = {
            regulation: sourceReg,
            framework: sourceReg,
            policies: [],
            activeCount: 0,
            lastReview: "",
          };
        }
        groups[sourceReg].policies.push(p);
        if (p.status === "active") groups[sourceReg].activeCount++;
        const vh = (p as any).versionHistory;
        if (vh && Array.isArray(vh) && vh.length > 0) {
          const lastDate = vh[vh.length - 1].changedAt;
          if (lastDate && (!groups[sourceReg].lastReview || lastDate > groups[sourceReg].lastReview)) {
            groups[sourceReg].lastReview = lastDate;
          }
        } else if (p.createdAt) {
          const cd = typeof p.createdAt === "string" ? p.createdAt : new Date(p.createdAt).toISOString();
          if (!groups[sourceReg].lastReview || cd > groups[sourceReg].lastReview) {
            groups[sourceReg].lastReview = cd;
          }
        }
      } else {
        ungrouped.push(p);
      }
    });
    const detectedNames = detectedRegulations.map(r => r.name);
    detectedNames.forEach(name => {
      if (!groups[name]) {
        groups[name] = { regulation: name, framework: name, policies: [], activeCount: 0, lastReview: "" };
      }
    });
    const toMs = (p: Policy) => p.createdAt ? new Date(p.createdAt).getTime() : 0;
    const sortPols = (arr: Policy[]) => policySort === "recent"
      ? [...arr].sort((a, b) => toMs(b) - toMs(a))
      : arr;
    const groupsArr = Object.values(groups).map(g => ({ ...g, policies: sortPols(g.policies) }));
    if (policySort === "recent") {
      groupsArr.sort((a, b) => {
        const aMs = a.policies.length ? toMs(a.policies[0]) : 0;
        const bMs = b.policies.length ? toMs(b.policies[0]) : 0;
        return bMs - aMs;
      });
    } else {
      groupsArr.sort((a, b) => b.policies.length - a.policies.length);
    }
    return { groups: groupsArr, ungrouped: sortPols(ungrouped) };
  }, [filtered, detectedRegulations, policySort]);

  const filteredRegGroupPolicies = useMemo(() => {
    if (regulationGroupFilter === "all") return regulationGroupedPolicies;
    if (regulationGroupFilter === "ungrouped") return { groups: [], ungrouped: regulationGroupedPolicies.ungrouped };
    return {
      groups: regulationGroupedPolicies.groups.filter(g => g.regulation === regulationGroupFilter),
      ungrouped: [],
    };
  }, [regulationGroupedPolicies, regulationGroupFilter]);

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

  const ontologyTagOptions = useMemo(() => {
    if (!auditEvents) return { entityTypes: [] as string[], systems: [] as string[], regulations: [] as string[] };
    const entitySet = new Set<string>();
    const systemSet = new Set<string>();
    const regulationSet = new Set<string>();
    auditEvents.forEach((e) => {
      const tags = (e.ontologyTags || {}) as Record<string, string>;
      if (tags.entity_type) tags.entity_type.split(", ").forEach(t => entitySet.add(t.trim()));
      if (tags.system) systemSet.add(tags.system);
      if (tags.regulation) regulationSet.add(tags.regulation);
    });
    return {
      entityTypes: Array.from(entitySet).sort(),
      systems: Array.from(systemSet).sort(),
      regulations: Array.from(regulationSet).sort(),
    };
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

    if (complianceFilter) {
      const industryId = industry?.id || null;
      events = events.filter((e) => {
        const frameworks = getComplianceFrameworksForEvent(e, industryId);
        return frameworks.some((f) => f.id === complianceFilter);
      });
    }

    if (ontologyEntityFilter) {
      events = events.filter((e) => {
        const tags = (e.ontologyTags || {}) as Record<string, string>;
        return (tags.entity_type || "").toLowerCase().includes(ontologyEntityFilter.toLowerCase());
      });
    }

    if (ontologySystemFilter) {
      events = events.filter((e) => {
        const tags = (e.ontologyTags || {}) as Record<string, string>;
        return (tags.system || "").toLowerCase() === ontologySystemFilter.toLowerCase();
      });
    }

    if (ontologyRegulationFilter) {
      events = events.filter((e) => {
        const tags = (e.ontologyTags || {}) as Record<string, string>;
        return (tags.regulation || "").toLowerCase() === ontologyRegulationFilter.toLowerCase();
      });
    }

    return events;
  }, [auditEvents, auditObjectFilter, auditActionFilter, auditDateFilter, complianceFilter, ontologyEntityFilter, ontologySystemFilter, ontologyRegulationFilter, industry]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (auditObjectFilter) count++;
    if (auditActionFilter) count++;
    if (auditDateFilter !== "all") count++;
    if (complianceFilter) count++;
    if (ontologyEntityFilter) count++;
    if (ontologySystemFilter) count++;
    if (ontologyRegulationFilter) count++;
    return count;
  }, [auditObjectFilter, auditActionFilter, auditDateFilter, complianceFilter, ontologyEntityFilter, ontologySystemFilter, ontologyRegulationFilter]);

  const industryRetentionRules = useMemo(() => {
    if (!industry) return [];
    return INDUSTRY_RETENTION_POLICIES[industry.id] || [];
  }, [industry]);

  const maxRetentionYears = useMemo(() => {
    if (industryRetentionRules.length === 0) return 0;
    return Math.max(...industryRetentionRules.map((r) => r.retentionYears));
  }, [industryRetentionRules]);

  const industryComplianceFrameworks = useMemo(() => {
    if (!industry) return [];
    return COMPLIANCE_FRAMEWORKS.filter((f) => f.industry === industry.id);
  }, [industry]);

  const availableExportFormats = useMemo(() => {
    return REGULATORY_EXPORT_FORMATS.filter((f) => f.industry === "all" || f.industry === industry?.id);
  }, [industry]);

  const traceSteps = useMemo(() => {
    if (!traceViewId || !auditEvents) return [];
    return buildTraceFromEvents(auditEvents, traceViewId);
  }, [traceViewId, auditEvents]);

  const correlatedEventCount = useMemo(() => {
    if (!auditEvents) return 0;
    return auditEvents.filter((e) => e.correlationId).length;
  }, [auditEvents]);

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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">Industry Regulatory Governance Hub</h1>
            {industry && (
              <Badge variant="outline" className="text-[10px] gap-1" data-testid="badge-governance-industry">
                {(() => { const Icon = industry.icon; return <Icon className="w-3 h-3" />; })()}
                {industry.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Regulation-organized policy management, compliance matrices & auditor-ready reporting
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {integrityCheck && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${integrityCheck.valid ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}
              onClick={() => setActiveGovTab("audit")}
              title="Click to view Audit Log"
              data-testid="badge-chain-integrity"
            >
              {integrityCheck.valid ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              {integrityCheck.valid ? "Chain Verified" : "Chain Broken"}
            </div>
          )}
          <Link href="/governance/policy-engine">
            <Button variant="outline" data-testid="button-policy-engine">
              <Scale className="w-4 h-4 mr-1.5" /> Policy Engine
            </Button>
          </Link>
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
                    const ruleLines = createRuleText.trim().split("\n").filter(Boolean);
                    const initialRules = ruleLines.map((line, i) => ({
                      name: `Rule ${i + 1}`,
                      field: "",
                      operator: "contains",
                      value: line.trim(),
                      action: "block",
                    }));
                    createMutation.mutate({
                      name: fd.get("name") as string,
                      domain: fd.get("domain") as string,
                      description: fd.get("description") as string,
                      scopeType: fd.get("scopeType") as string,
                      ontologyRefs: selectedOntologyRefs,
                      ...(initialRules.length > 0 ? { policyJson: { rules: initialRules } } : {}),
                    });
                    setSelectedOntologyRefs([]);
                    setCreateRuleText("");
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
                  <div className="flex flex-col gap-2">
                    <Label>Policy Rules</Label>
                    <p className="text-[11px] text-muted-foreground">Type entity names to get ontology suggestions (e.g. "All DEPOSIT_ACCOUNT openings require REG_DD disclosure"). One rule per line.</p>
                    <OntologyAutocompleteInput
                      value={createRuleText}
                      onChange={setCreateRuleText}
                      placeholder='e.g. All DEPOSIT_ACCOUNT openings require REG_DD disclosure'
                      concepts={allOntologyConcepts || []}
                      testId="input-policy-rule-text"
                      multiline
                      className="min-h-[80px] font-mono text-xs"
                    />
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
                  {allOntologyConcepts && allOntologyConcepts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <Label>Ontology Concepts</Label>
                      <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto border rounded-md p-2" data-testid="container-ontology-select">
                        {allOntologyConcepts.map(concept => {
                          const isSelected = selectedOntologyRefs.includes(concept.id);
                          return (
                            <Badge
                              key={concept.id}
                              variant="outline"
                              className={`text-[10px] cursor-pointer ${isSelected ? "bg-purple-500/15 text-purple-600 border-purple-400 dark:text-purple-400 dark:border-purple-500" : "text-muted-foreground"}`}
                              onClick={() => {
                                setSelectedOntologyRefs(prev =>
                                  isSelected ? prev.filter(id => id !== concept.id) : [...prev, concept.id]
                                );
                              }}
                              data-testid={`badge-ontology-option-${concept.id}`}
                            >
                              {isSelected && <Check className="w-3 h-3 mr-0.5" />}
                              {concept.label}
                            </Badge>
                          );
                        })}
                      </div>
                      {selectedOntologyRefs.length > 0 && (
                        <span className="text-[11px] text-muted-foreground" data-testid="text-ontology-count">{selectedOntologyRefs.length} concept{selectedOntologyRefs.length !== 1 ? "s" : ""} selected</span>
                      )}
                    </div>
                  )}
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-policy">
                    {createMutation.isPending ? "Creating..." : "Create Policy"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Active Policies" value={activePolicies} icon={Shield} variant="default" testId="stat-active-policies" />
        <StatCard title="Regulations" value={regulationSummary.totalRegs} icon={Scale} variant="default" testId="stat-regulations" />
        <StatCard title="Requirements" value={regulationSummary.totalReqs} icon={BookOpen} variant="default" testId="stat-requirements" />
        <StatCard title="Domain Coverage" value={`${regulationSummary.allDomains.length > 0 ? Math.round((regulationSummary.coveredDomains.length / regulationSummary.allDomains.length) * 100) : 0}%`} icon={Target} variant={regulationSummary.uncoveredDomains.length > 0 ? "warning" : "success"} testId="stat-domain-coverage" />
        <StatCard title="Policy Violations" value={violationCount} icon={AlertTriangle} variant={violationCount > 0 ? "danger" : "default"} testId="stat-violations" />
        <StatCard title="Approval Compliance" value={`${approvalCompliance}%`} icon={CheckCircle} variant="success" testId="stat-compliance" />
      </div>

      <Tabs value={activeGovTab} onValueChange={setActiveGovTab} className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap h-auto gap-0">
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            <Target className="w-3.5 h-3.5 mr-1" />
            Coverage
            {coverageMatrix && coverageMatrix.rows.some(r => Object.values(r.domainCoverage).includes(false)) && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="live-feed" data-testid="tab-live-feed">
            <Activity className="w-3.5 h-3.5 mr-1" />
            Live Feed
          </TabsTrigger>
          <TabsTrigger value="control-points" data-testid="tab-control-points">
            <Users className="w-3.5 h-3.5 mr-1" />
            Control Points
            {pendingActions && pendingActions.counts.approvals + pendingActions.counts.exceptions > 0 && (
              <Badge variant="destructive" className="ml-1 text-[9px] h-4 min-w-[1rem] px-1">
                {pendingActions.counts.approvals + pendingActions.counts.exceptions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">
            Exceptions
            {exceptionStats.expired > 0 && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="policies" data-testid="tab-policies">Policy Rules</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
          {/* ── Advanced separator ──────────────────────────────────── */}
          <span className="h-5 w-px bg-border/60 mx-1 self-center shrink-0" aria-hidden="true" />
          <span className="self-center px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pointer-events-none select-none">Advanced</span>
          <span className="h-5 w-px bg-border/60 mx-1 self-center shrink-0" aria-hidden="true" />
          <TabsTrigger value="compliance-matrix" data-testid="tab-compliance-matrix" className="text-muted-foreground/70 text-[11px]">Compliance Matrix</TabsTrigger>
          <TabsTrigger value="enforcement" data-testid="tab-enforcement" className="text-muted-foreground/70 text-[11px]">Enforcement</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance" className="text-muted-foreground/70 text-[11px]">Reports</TabsTrigger>
          <TabsTrigger value="tool-access" data-testid="tab-tool-access" className="text-muted-foreground/70 text-[11px]">Tool Access</TabsTrigger>
          <TabsTrigger value="tool-risk" data-testid="tab-tool-risk" className="text-muted-foreground/70 text-[11px]">Tool Risk</TabsTrigger>
          <TabsTrigger value="ethics" data-testid="tab-ethics" className="text-muted-foreground/70 text-[11px]">Ethics</TabsTrigger>
          <TabsTrigger value="policy-packs" data-testid="tab-policy-packs" className="text-muted-foreground/70 text-[11px]">Policy Packs</TabsTrigger>
          <TabsTrigger value="what-if" data-testid="tab-what-if" className="text-muted-foreground/70 text-[11px]">What-If</TabsTrigger>
          <TabsTrigger value="regulatory" data-testid="tab-regulatory" className="text-muted-foreground/70 text-[11px]">Regulatory</TabsTrigger>
          <TabsTrigger value="impact-network" data-testid="tab-impact-network" className="text-muted-foreground/70 text-[11px]">
            <Network className="w-3 h-3 mr-1" />
            Impact Network
          </TabsTrigger>
          <TabsTrigger value="compliance-posture" data-testid="tab-compliance-posture" className="text-muted-foreground/70 text-[11px]">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Compliance Posture
          </TabsTrigger>
        </TabsList>

        {/* ─── Coverage Heatmap ──────────────────────────────────────── */}
        <TabsContent value="coverage" className="mt-0 flex flex-col gap-4" data-testid="content-coverage">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Policy Coverage Matrix</span>
              <Badge variant="outline" className="text-[10px]">per-agent × domain</Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              5 required domains · pass rate from run traces
            </span>
          </div>

          {coverageLoading ? (
            <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ) : coverageMatrix && coverageMatrix.rows.length > 0 ? (
            <Card data-testid="card-coverage-matrix">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-[220px]">Agent</th>
                      {coverageMatrix.domains.map(d => (
                        <th key={d} className="px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground capitalize whitespace-nowrap">
                          {d.replace(/_/g, " ")}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground">Policies</th>
                      <th className="px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageMatrix.rows.map((row, i) => {
                      const gapCount = Object.values(row.domainCoverage).filter(v => !v).length;
                      const isSelected = selectedCoverageAgentId === row.agentId;
                      return (
                        <tr
                          key={row.agentId}
                          className={`border-b last:border-0 transition-colors cursor-pointer ${isSelected ? "bg-primary/5 ring-1 ring-primary/20" : `hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/5"}`}`}
                          data-testid={`row-coverage-${row.agentId}`}
                          onClick={() => setSelectedCoverageAgentId(isSelected ? null : row.agentId)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium truncate">{row.agentName}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] capitalize">{row.environment}</Badge>
                                {gapCount > 0 && (
                                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">{gapCount} gap{gapCount > 1 ? "s" : ""}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          {coverageMatrix.domains.map(d => {
                            const covered = row.domainCoverage[d];
                            return (
                              <td key={d} className="px-3 py-3 text-center">
                                {covered ? (
                                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/15" title="Covered">
                                    <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15" title="Gap — no policy covers this domain">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-medium">{row.policyCount}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {row.passRate !== null ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-xs font-semibold ${row.passRate >= 90 ? "text-green-600 dark:text-green-400" : row.passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                  {row.passRate}%
                                </span>
                                <div className="w-12 h-1.5 rounded-full bg-muted">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${row.passRate >= 90 ? "bg-green-500" : row.passRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                    style={{ width: `${row.passRate}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">No traces</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 flex flex-col items-center gap-3">
                <Target className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No agents found. Create agents and bind policies to see coverage.</p>
              </CardContent>
            </Card>
          )}

          {/* ── Coverage gap detail panel (appears when a row is selected) ─── */}
          {selectedCoverageAgentId && coverageMatrix && (() => {
            const row = coverageMatrix.rows.find(r => r.agentId === selectedCoverageAgentId);
            if (!row) return null;
            const gaps = (row.missingDomains as string[] | undefined) ?? Object.entries(row.domainCoverage).filter(([, v]) => !v).map(([k]) => k);
            return (
              <Card className="border-primary/20 bg-primary/3" data-testid="card-coverage-gap-detail">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{row.agentName} — Gap Analysis</span>
                      {gaps.length === 0 && <Badge className="text-[9px] bg-green-500/15 text-green-600 border-green-500/20">Fully covered</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCoverageAgentId(null)} data-testid="button-close-gap-detail">
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {gaps.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">{gaps.length} domain gap{gaps.length > 1 ? "s" : ""} detected — bind a policy covering each domain to remediate.</p>
                      <div className="flex flex-wrap gap-2">
                        {gaps.map(domain => (
                          <div key={domain} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span className="text-xs font-medium capitalize">{domain.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setActiveGovTab("policies"); setDomainFilter(gaps[0]); }}
                          data-testid="button-fix-gaps"
                        >
                          <Shield className="w-3.5 h-3.5 mr-1.5" /> View policies to fix gaps
                        </Button>
                        <Link href={`/agents/${selectedCoverageAgentId}`}>
                          <Button size="sm" variant="ghost" data-testid="button-view-agent-readiness">
                            <Target className="w-3.5 h-3.5 mr-1.5" /> Agent Policy Readiness
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">All 5 governance domains are covered by applied policies.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {coverageMatrix && coverageMatrix.rows.length > 0 && (() => {
            const totalCells = coverageMatrix.rows.length * coverageMatrix.domains.length;
            const coveredCells = coverageMatrix.rows.reduce((sum, r) => sum + Object.values(r.domainCoverage).filter(Boolean).length, 0);
            const pct = totalCells > 0 ? Math.round((coveredCells / totalCells) * 100) : 0;
            const gaps = coverageMatrix.rows.filter(r => Object.values(r.domainCoverage).includes(false));
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card><CardContent className="p-4 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Domain Coverage</span>
                  <span className={`text-2xl font-bold ${pct >= 90 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"}`}>{pct}%</span>
                  <span className="text-[11px] text-muted-foreground">{coveredCells} / {totalCells} domain-agent pairs</span>
                </CardContent></Card>
                <Card><CardContent className="p-4 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Agents with Gaps</span>
                  <span className={`text-2xl font-bold ${gaps.length > 0 ? "text-amber-600" : "text-green-600"}`}>{gaps.length}</span>
                  <span className="text-[11px] text-muted-foreground">of {coverageMatrix.rows.length} total agents</span>
                </CardContent></Card>
                <Card><CardContent className="p-4 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Avg Pass Rate</span>
                  {(() => {
                    const withTraces = coverageMatrix.rows.filter(r => r.passRate !== null);
                    const avg = withTraces.length > 0 ? Math.round(withTraces.reduce((s, r) => s + (r.passRate ?? 0), 0) / withTraces.length) : null;
                    return avg !== null ? (
                      <>
                        <span className={`text-2xl font-bold ${avg >= 90 ? "text-green-600" : avg >= 70 ? "text-amber-600" : "text-red-600"}`}>{avg}%</span>
                        <span className="text-[11px] text-muted-foreground">across {withTraces.length} agents with traces</span>
                      </>
                    ) : <span className="text-sm text-muted-foreground">No traces yet</span>;
                  })()}
                </CardContent></Card>
              </div>
            );
          })()}
        </TabsContent>

        {/* ─── Live Compliance Feed ───────────────────────────────────── */}
        <TabsContent value="live-feed" className="mt-0 flex flex-col gap-4" data-testid="content-live-feed">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Compliance Feed</span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
              </Badge>
              {complianceFeed && <span className="text-[10px] text-muted-foreground">{complianceFeed.length} events</span>}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchFeed()} data-testid="button-refresh-feed">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-col gap-2" data-testid="feed-filter-chips">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium">Severity:</span>
              {(["all", "high", "medium", "low"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFeedSeverityFilter(s)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedSeverityFilter === s
                    ? s === "high" ? "bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-400"
                      : s === "medium" ? "bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400"
                      : s === "low" ? "bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400"
                      : "bg-primary/10 border-primary/30 text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                  data-testid={`chip-severity-${s}`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <span className="h-3.5 w-px bg-border/60 mx-1" aria-hidden="true" />
              <span className="text-[10px] text-muted-foreground font-medium">Type:</span>
              {["all", "policy", "agent", "approval"].map(t => (
                <button
                  key={t}
                  onClick={() => setFeedTypeFilter(t)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedTypeFilter === t
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                  data-testid={`chip-type-${t}`}
                >
                  {t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {/* Agent filter row */}
            {complianceFeed && complianceFeed.length > 0 && (() => {
              const agentNames = Array.from(new Set(complianceFeed.map(i => i.agentName).filter(Boolean))) as string[];
              if (agentNames.length === 0) return null;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-medium">Agent:</span>
                  <button
                    onClick={() => setFeedAgentFilter("all")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedAgentFilter === "all" ? "bg-primary/10 border-primary/30 text-primary" : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                    data-testid="chip-agent-all"
                  >All agents</button>
                  {agentNames.slice(0, 8).map(name => (
                    <button
                      key={name}
                      onClick={() => setFeedAgentFilter(feedAgentFilter === name ? "all" : name)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedAgentFilter === name ? "bg-primary/10 border-primary/30 text-primary" : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                      data-testid={`chip-agent-${name.replace(/\s+/g, "-").toLowerCase()}`}
                    >{name.length > 24 ? name.slice(0, 22) + "…" : name}</button>
                  ))}
                </div>
              );
            })()}
            {/* Policy filter row */}
            {complianceFeed && complianceFeed.length > 0 && (() => {
              const policyNames = Array.from(new Set(complianceFeed.map(i => i.policyName).filter(Boolean))) as string[];
              if (policyNames.length === 0) return null;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-medium">Policy:</span>
                  <button
                    onClick={() => setFeedPolicyFilter("all")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedPolicyFilter === "all" ? "bg-primary/10 border-primary/30 text-primary" : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                    data-testid="chip-policy-all"
                  >All policies</button>
                  {policyNames.slice(0, 6).map(name => (
                    <button
                      key={name}
                      onClick={() => setFeedPolicyFilter(feedPolicyFilter === name ? "all" : name)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${feedPolicyFilter === name ? "bg-primary/10 border-primary/30 text-primary" : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"}`}
                      data-testid={`chip-policy-${name.replace(/\s+/g, "-").toLowerCase()}`}
                    >{name.length > 28 ? name.slice(0, 26) + "…" : name}</button>
                  ))}
                </div>
              );
            })()}
          </div>

          {feedLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : complianceFeed && complianceFeed.length > 0 ? (() => {
            const filtered = complianceFeed.filter(item => {
              if (feedSeverityFilter !== "all" && item.severity !== feedSeverityFilter) return false;
              if (feedTypeFilter !== "all" && item.objectType !== feedTypeFilter) return false;
              if (feedAgentFilter !== "all" && item.agentName !== feedAgentFilter) return false;
              if (feedPolicyFilter !== "all" && item.policyName !== feedPolicyFilter) return false;
              return true;
            });
            return filtered.length > 0 ? (
              <div className="flex flex-col gap-1.5" data-testid="list-compliance-feed">
                {filtered.map((item) => {
                  const isExpanded = expandedFeedId === item.id;
                  const severityColor = item.severity === "high"
                    ? "border-l-red-500 bg-red-500/5"
                    : item.severity === "medium"
                    ? "border-l-amber-500 bg-amber-500/5"
                    : "border-l-muted bg-transparent";
                  const severityBadge = item.severity === "high"
                    ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                    : item.severity === "medium"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    : "text-muted-foreground";
                  return (
                    <Card
                      key={item.id}
                      className={`border-l-2 ${severityColor} cursor-pointer hover-elevate transition-all`}
                      data-testid={`feed-item-${item.id}`}
                      onClick={() => setExpandedFeedId(isExpanded ? null : item.id)}
                    >
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col flex-1 min-w-0 gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold capitalize">{item.action.replace(/_/g, " ")}</span>
                              <Badge variant="outline" className={`text-[9px] ${severityBadge}`}>{item.severity}</Badge>
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">{item.objectType}</Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.agentName && (
                                <span className="text-[11px] text-muted-foreground">Agent: <span className="font-medium text-foreground">{item.agentName}</span></span>
                              )}
                              {item.policyName && (
                                <span className="text-[11px] text-muted-foreground">Policy: <span className="font-medium text-foreground">{item.policyName}</span></span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
                            </span>
                            <span className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </span>
                          </div>
                        </div>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <div className="pt-2 border-t flex flex-col gap-2" data-testid={`feed-detail-${item.id}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                              <div><span className="text-muted-foreground">Event ID: </span><span className="font-mono font-medium">{item.id.slice(0, 8)}</span></div>
                              <div><span className="text-muted-foreground">Object: </span><span className="font-medium">{item.objectId?.slice(0, 8) ?? "—"}</span></div>
                              <div><span className="text-muted-foreground">Actor: </span><span className="font-medium">{item.actorId?.slice(0, 8) ?? "—"}</span></div>
                            </div>
                            {item.details && (
                              <p className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 font-mono break-all">{item.details}</p>
                            )}
                            <div className="flex items-center gap-2">
                              {item.objectType === "trace" && item.objectId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  onClick={(e) => { e.stopPropagation(); setTraceViewId(item.objectId!); }}
                                  data-testid={`button-view-trace-${item.id}`}
                                >
                                  View Run Trace
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                                onClick={(e) => { e.stopPropagation(); setActiveGovTab("audit"); }}
                                data-testid={`button-view-audit-${item.id}`}
                              >
                                Full Audit Entry
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 flex flex-col items-center gap-2">
                  <Activity className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No events match the current filters.</p>
                  <Button variant="ghost" size="sm" onClick={() => { setFeedSeverityFilter("all"); setFeedTypeFilter("all"); }}>Clear filters</Button>
                </CardContent>
              </Card>
            );
          })() : (
            <Card>
              <CardContent className="p-12 flex flex-col items-center gap-3">
                <Activity className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No compliance events recorded yet.</p>
                <p className="text-[11px] text-muted-foreground">Events appear as agents execute, policies evaluate, and approvals flow.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Human Control Points ──────────────────────────────────── */}
        <TabsContent value="control-points" className="mt-0 flex flex-col gap-4" data-testid="content-control-points">
          {pendingActions && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard title="Pending Approvals" value={pendingActions.counts.approvals} icon={Clock} variant={pendingActions.counts.approvals > 0 ? "warning" : "default"} testId="stat-pending-approvals" />
              <StatCard title="Exception Reviews" value={pendingActions.counts.exceptions} icon={FileCode} variant={pendingActions.counts.exceptions > 0 ? "warning" : "default"} testId="stat-exception-reviews" />
              <StatCard title="Expiring Soon" value={pendingActions.counts.expiring} icon={AlertTriangle} variant={pendingActions.counts.expiring > 0 ? "danger" : "default"} testId="stat-expiring-soon" />
              <StatCard title="Workflow Gates" value={(pendingActions.counts as any).workflowGates ?? 0} icon={GitBranch} variant={(pendingActions.counts as any).workflowGates > 0 ? "warning" : "default"} testId="stat-workflow-gates" />
              <StatCard title="Deploy Blocks" value={(pendingActions.counts as any).deploymentBlocks ?? 0} icon={AlertTriangle} variant={(pendingActions.counts as any).deploymentBlocks > 0 ? "danger" : "default"} testId="stat-deploy-blocks" />
              <StatCard title="Hard Violations" value={(pendingActions.counts as any).violations ?? 0} icon={ShieldAlert} variant={(pendingActions.counts as any).violations > 0 ? "danger" : "default"} testId="stat-violations-queue" />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Human Control Queue</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchPending()} data-testid="button-refresh-queue">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>

          {pendingLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : pendingActions && pendingActions.items.length > 0 ? (
            <div className="flex flex-col gap-3" data-testid="list-control-queue">
              {pendingActions.items.map((item) => {
                const kindLabel = item.kind === "approval" ? "Approval" : item.kind === "exception_expiry" ? "Expiry Alert" : "Exception Review";
                const kindColor = item.kind === "approval"
                  ? "border-l-blue-500"
                  : item.kind === "exception_expiry"
                  ? "border-l-red-500"
                  : "border-l-amber-500";
                const riskPct = Math.round((item.riskScore ?? 0) * 100);
                return (
                  <Card key={item.id} className={`border-l-2 ${kindColor} hover-elevate`} data-testid={`control-item-${item.id}`}>
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate">{item.title}</span>
                            <Badge variant="outline" className="text-[10px]">{kindLabel}</Badge>
                            {item.escalationLevel > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                                Escalated L{item.escalationLevel}
                              </Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.agentName && (
                              <span className="text-[11px] text-muted-foreground">Agent: <span className="font-medium text-foreground">{item.agentName}</span></span>
                            )}
                            {item.changeType && (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground capitalize">{item.changeType.replace(/_/g, " ")}</Badge>
                            )}
                            {item.dueDate && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Due {new Date(item.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Risk</span>
                            <span className={`text-xs font-bold ${riskPct >= 70 ? "text-red-600" : riskPct >= 40 ? "text-amber-600" : "text-green-600"}`}>{riskPct}</span>
                          </div>
                        </div>
                      </div>
                      {item.kind === "approval" && (
                        <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                          <Button
                            size="sm"
                            onClick={() => {
                              apiRequest("PATCH", `/api/approvals/${item.id}`, { status: "approved", decidedBy: "current-user" })
                                .then(() => { refetchPending(); queryClient.invalidateQueries({ queryKey: ["/api/approvals"] }); });
                            }}
                            data-testid={`button-approve-action-${item.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              apiRequest("PATCH", `/api/approvals/${item.id}`, { status: "rejected", decidedBy: "current-user" })
                                .then(() => { refetchPending(); queryClient.invalidateQueries({ queryKey: ["/api/approvals"] }); });
                            }}
                            data-testid={`button-reject-action-${item.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveGovTab("exceptions")}
                            data-testid={`button-view-exceptions-${item.id}`}
                          >
                            View Details
                          </Button>
                        </div>
                      )}
                      {item.kind === "exception_review" && (
                        <div className="flex items-center gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() => {
                              updateExceptionMutation.mutate({ id: item.id, data: { status: "approved", approvedBy: "current-user" } });
                              refetchPending();
                            }}
                            data-testid={`button-approve-exception-${item.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve Exception
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updateExceptionMutation.mutate({ id: item.id, data: { status: "rejected" } });
                              refetchPending();
                            }}
                            data-testid={`button-reject-exception-${item.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                      {item.kind === "exception_expiry" && (
                        <div className="flex items-center gap-2 pt-2 border-t">
                          <Button size="sm" variant="outline" onClick={() => setActiveGovTab("exceptions")} data-testid={`button-manage-expiry-${item.id}`}>
                            <Clock className="w-3.5 h-3.5 mr-1" /> Manage Exception
                          </Button>
                        </div>
                      )}
                      {(item.kind === "workflow_interrupt" || item.kind === "deployment_block" || item.kind === "policy_violation") && (
                        <div className="flex flex-col gap-2 pt-2 border-t">
                          <textarea
                            className="text-xs rounded-md border border-input bg-background px-2.5 py-1.5 resize-none placeholder:text-muted-foreground/60 w-full"
                            rows={2}
                            placeholder="Optional comment..."
                            value={controlPointComments[item.id] ?? ""}
                            onChange={(e) => setControlPointComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                            data-testid={`textarea-comment-${item.id}`}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {(item.kind === "workflow_interrupt" || item.kind === "deployment_block") && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    apiRequest("POST", "/api/governance/control-point-action", { id: item.id, kind: item.kind, action: "approve", comment: controlPointComments[item.id] })
                                      .then(() => { refetchPending(); toast({ title: "Action recorded", description: `${item.kind === "workflow_interrupt" ? "Interrupt approved" : "Deployment unblocked"}` }); });
                                  }}
                                  data-testid={`button-approve-${item.kind}-${item.id}`}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> {item.kind === "workflow_interrupt" ? "Approve Interrupt" : "Unblock Deployment"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    apiRequest("POST", "/api/governance/control-point-action", { id: item.id, kind: item.kind, action: "reject", comment: controlPointComments[item.id] })
                                      .then(() => { refetchPending(); toast({ title: "Action recorded", description: "Rejected" }); });
                                  }}
                                  data-testid={`button-reject-${item.kind}-${item.id}`}
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            {item.kind === "policy_violation" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    apiRequest("POST", "/api/governance/control-point-action", { id: item.id, kind: item.kind, action: "acknowledge", comment: controlPointComments[item.id] })
                                      .then(() => { refetchPending(); toast({ title: "Violation acknowledged" }); });
                                  }}
                                  data-testid={`button-acknowledge-${item.id}`}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> Acknowledge
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    apiRequest("POST", "/api/governance/control-point-action", { id: item.id, kind: item.kind, action: "escalate", comment: controlPointComments[item.id] })
                                      .then(() => { refetchPending(); toast({ title: "Escalated", variant: "destructive" }); });
                                  }}
                                  data-testid={`button-escalate-${item.id}`}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Escalate
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 flex flex-col items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-500/60" />
                <p className="text-sm font-medium text-muted-foreground">All clear — no pending actions</p>
                <p className="text-[11px] text-muted-foreground">Approval requests, exception reviews, and expiry alerts appear here.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="policies" className="mt-0 flex flex-col gap-4">
          {industry && industry.id !== "custom" && industry.defaultGovernancePolicies.length > 0 && (
            <Card data-testid="card-workspace-governance-banner">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    <h3 className="text-sm font-semibold">Workspace Governance Active</h3>
                    <Badge variant="outline" className="text-[10px]">{industry.shortLabel}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveGovTab("policy-packs")}
                    data-testid="button-view-packs-from-banner"
                  >
                    <Layers className="h-3.5 w-3.5 mr-1.5" />
                    View Policy Packs
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  These governance rules are auto-configured from your <span className="font-medium">{industry.label}</span> workspace. Activate the matching policy packs in the Policy Packs tab to enforce them as auditable policies.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {industry.defaultGovernancePolicies.map((gp, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-muted/30"
                      data-testid={`row-workspace-governance-${idx}`}
                    >
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium">{gp.label}</span>
                        <p className="text-[11px] text-muted-foreground leading-tight">{gp.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
            <Select value={regulationGroupFilter} onValueChange={setRegulationGroupFilter}>
              <SelectTrigger className="w-[240px]" data-testid="select-regulation-filter">
                <SelectValue placeholder="All Regulations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regulations</SelectItem>
                {regulationGroupedPolicies.groups.map(g => (
                  <SelectItem key={g.regulation} value={g.regulation}>{g.regulation}</SelectItem>
                ))}
                {regulationGroupedPolicies.ungrouped.length > 0 && (
                  <SelectItem value="ungrouped">Unlinked Policies</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-domain-filter">
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
            {ontologyCategories.length > 0 && (
              <Select value={ontologyFilter} onValueChange={setOntologyFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-ontology-filter">
                  <SelectValue placeholder="All Ontology Domains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ontology Domains</SelectItem>
                  {ontologyCategories.map(cat => (
                    <SelectItem key={cat} value={cat} data-testid={`option-ontology-filter-${cat}`}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={policySort} onValueChange={setPolicySort}>
              <SelectTrigger className="w-[170px]" data-testid="select-policy-sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent First</SelectItem>
                <SelectItem value="default">By Policy Count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredRegGroupPolicies.groups.map((group) => {
            const regDetail = detectedRegulations.find(r => r.name === group.regulation);
            const coverage = group.policies.length > 0 ? Math.round((group.activeCount / group.policies.length) * 100) : 0;
            return (
              <div key={group.regulation} className="flex flex-col gap-3" data-testid={`regulation-group-${group.regulation.replace(/\s+/g, "-").toLowerCase()}`}>
                <Card className="border-l-0 border-r-0 border-b-0 rounded-none border-t">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Scale className="w-5 h-5 text-primary shrink-0" />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{group.regulation}</span>
                          {regDetail && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-md">{regDetail.fullName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex flex-col items-center">
                          <span className="text-lg font-bold">{group.policies.length}</span>
                          <span className="text-[10px] text-muted-foreground">Total Policies</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{group.activeCount}</span>
                          <span className="text-[10px] text-muted-foreground">Active</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className={`text-lg font-bold ${coverage >= 80 ? "text-emerald-600 dark:text-emerald-400" : coverage >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{coverage}%</span>
                          <span className="text-[10px] text-muted-foreground">Coverage</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[11px] font-medium">{group.lastReview ? new Date(group.lastReview).toLocaleDateString() : "N/A"}</span>
                          <span className="text-[10px] text-muted-foreground">Last Review</span>
                        </div>
                      </div>
                    </div>
                    {regDetail && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[regDetail.category] || ""}`}>{regDetail.category.replace("_", " ")}</Badge>
                        {regDetail.jurisdictions.map(j => (
                          <Badge key={j} variant="outline" className="text-[10px]">
                            <Globe className="w-3 h-3 mr-0.5" />{j}
                          </Badge>
                        ))}
                        <Badge variant="outline" className="text-[10px]">
                          <FileText className="w-3 h-3 mr-0.5" />{regDetail.requirements.length} requirements
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {group.policies.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4">
                    {group.policies.map((policy) => {
                      const DIcon = domainIcons[policy.domain] || Shield;
                      return (
                        <Card key={policy.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedPolicyId(policy.id)} data-testid={`card-policy-${policy.id}`}>
                          <CardContent className="p-4 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                  <DIcon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-semibold truncate">{policy.name}</span>
                                  <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")} | v{policy.version}</span>
                                </div>
                              </div>
                              <div className="shrink-0"><StatusBadge status={policy.status} /></div>
                            </div>
                            {policy.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{policy.description}</p>
                            )}
                            <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                              <Badge variant="outline" className="text-[10px] capitalize">{policy.scopeType}</Badge>
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Scale className="w-3 h-3" />
                                {group.regulation}
                              </Badge>
                              {Array.isArray((policy as any).ontologyRefs) && ((policy as any).ontologyRefs as string[]).map(refId => {
                                const concept = ontologyConceptMap[refId];
                                if (!concept) return null;
                                return (
                                  <Badge key={refId} variant="outline" className="text-[10px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-600" data-testid={`badge-ontology-${policy.id}-${refId}`}>
                                    {concept.label}
                                  </Badge>
                                );
                              })}
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
                            {/* Policy enrichment: bound agents + 30d pass rate */}
                            {(() => {
                              const stats = coverageMatrix?.policyStats?.[policy.id];
                              if (!stats) return null;
                              const { boundAgentCount, passRate } = stats;
                              return (
                                <div className="flex items-center gap-3 pt-1 border-t" data-testid={`policy-stats-${policy.id}`}>
                                  <div className="flex items-center gap-1.5">
                                    <Users className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">{boundAgentCount} agent{boundAgentCount !== 1 ? "s" : ""}</span>
                                  </div>
                                  {passRate !== null ? (
                                    <div className="flex items-center gap-1.5 ml-auto">
                                      <span className="text-[10px] text-muted-foreground">30d pass rate</span>
                                      <div className="w-16 h-1.5 rounded-full bg-muted">
                                        <div
                                          className={`h-1.5 rounded-full ${passRate >= 90 ? "bg-green-500" : passRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                          style={{ width: `${passRate}%` }}
                                        />
                                      </div>
                                      <span className={`text-[10px] font-semibold ${passRate >= 90 ? "text-green-600 dark:text-green-400" : passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                        {passRate}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground ml-auto">No traces yet</span>
                                  )}
                                </div>
                              );
                            })()}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pl-4 py-3 text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4" />
                    No policies linked to this regulation. Use Policy Packs or Generate Policies to create coverage.
                  </div>
                )}
              </div>
            );
          })}

          {filteredRegGroupPolicies.ungrouped.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="regulation-group-unlinked">
              <div className="flex items-center gap-2 pt-2 border-t">
                <FileCode className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Unlinked Policies</span>
                <Badge variant="secondary" className="text-[10px]">{filteredRegGroupPolicies.ungrouped.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4">
                {filteredRegGroupPolicies.ungrouped.map((policy) => {
                  const DIcon = domainIcons[policy.domain] || Shield;
                  return (
                    <Card key={policy.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedPolicyId(policy.id)} data-testid={`card-policy-${policy.id}`}>
                      <CardContent className="p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                              <DIcon className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-semibold truncate">{policy.name}</span>
                              <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")} | v{policy.version}</span>
                            </div>
                          </div>
                          <div className="shrink-0"><StatusBadge status={policy.status} /></div>
                        </div>
                        {policy.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{policy.description}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                          <Badge variant="outline" className="text-[10px] capitalize">{policy.scopeType}</Badge>
                          <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            No regulation linked
                          </Badge>
                          {Array.isArray((policy as any).ontologyRefs) && ((policy as any).ontologyRefs as string[]).map(refId => {
                            const concept = ontologyConceptMap[refId];
                            if (!concept) return null;
                            return (
                              <Badge key={refId} variant="outline" className="text-[10px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-600" data-testid={`badge-ontology-${policy.id}-${refId}`}>
                                {concept.label}
                              </Badge>
                            );
                          })}
                        </div>
                        {/* Policy enrichment: bound agents + 30d pass rate */}
                        {(() => {
                          const stats = coverageMatrix?.policyStats?.[policy.id];
                          if (!stats) return null;
                          const { boundAgentCount, passRate } = stats;
                          return (
                            <div className="flex items-center gap-3 pt-1 border-t" data-testid={`policy-stats-${policy.id}`}>
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">{boundAgentCount} agent{boundAgentCount !== 1 ? "s" : ""}</span>
                              </div>
                              {passRate !== null ? (
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <span className="text-[10px] text-muted-foreground">30d pass rate</span>
                                  <div className="w-16 h-1.5 rounded-full bg-muted">
                                    <div
                                      className={`h-1.5 rounded-full ${passRate >= 90 ? "bg-green-500" : passRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                      style={{ width: `${passRate}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-semibold ${passRate >= 90 ? "text-green-600 dark:text-green-400" : passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                    {passRate}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground ml-auto">No traces yet</span>
                              )}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Shield className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policies found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="compliance-matrix" className="mt-0 flex flex-col gap-4" data-testid="content-compliance-matrix">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Policy Lineage &mdash; Regulation &rarr; Policy &rarr; Control</span>
            </div>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-matrix-count">
              {detectedRegulations.reduce((sum, r) => sum + r.requirements.length, 0)} traced requirements
            </Badge>
          </div>

          {detectedRegulations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <Layers className="w-12 h-12 text-muted-foreground" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold">No Compliance Matrix Available</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    Select an industry workspace to detect regulatory frameworks and build the compliance traceability matrix.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            detectedRegulations.map((reg) => {
              const regPolicies = policies?.filter(p => {
                const src = (p as any).policyJson?.rules?.[0]?.sourceRegulation;
                return src === reg.name;
              }) || [];
              return (
                <Card key={reg.id} data-testid={`card-matrix-${reg.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">{reg.name}</CardTitle>
                      <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[reg.category] || ""}`}>{reg.category.replace("_", " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {regPolicies.length} policies linked
                      </Badge>
                      <Badge variant={regPolicies.length >= reg.requirements.length ? "default" : "outline"} className={`text-[10px] ${regPolicies.length >= reg.requirements.length ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                        {regPolicies.length >= reg.requirements.length ? "Full Coverage" : `${Math.round((regPolicies.length / Math.max(reg.requirements.length, 1)) * 100)}% Coverage`}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table data-testid={`table-matrix-${reg.id}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">Requirement</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[100px]">Severity</TableHead>
                          <TableHead className="w-[200px]">Implementing Policy</TableHead>
                          <TableHead className="w-[160px]">ATLAS Control</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reg.requirements.map((req) => {
                          const linkedPolicy = regPolicies.find(p =>
                            p.name.toLowerCase().includes(req.category.toLowerCase()) ||
                            p.description?.toLowerCase().includes(req.title.toLowerCase().split(" ").slice(0, 3).join(" "))
                          ) || regPolicies[0];
                          const controlType = linkedPolicy
                            ? ((linkedPolicy as any).policyJson?.rules?.[0]?.type || "enforcement_rule")
                            : null;
                          return (
                            <TableRow key={req.id} data-testid={`row-matrix-${req.id}`}>
                              <TableCell className="text-xs font-medium">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-mono text-[10px] text-muted-foreground">{req.id.toUpperCase()}</span>
                                  <span>{req.title}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{req.description}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[req.severity] || ""}`}>{req.severity}</Badge>
                              </TableCell>
                              <TableCell>
                                {linkedPolicy ? (
                                  <button
                                    className="text-xs text-left hover:underline cursor-pointer flex items-center gap-1"
                                    onClick={() => setSelectedPolicyId(linkedPolicy.id)}
                                    data-testid={`link-policy-${req.id}`}
                                  >
                                    <Shield className="w-3 h-3 text-primary shrink-0" />
                                    <span className="truncate">{linkedPolicy.name}</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    No policy linked
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {controlType ? (
                                  <Badge variant="outline" className="text-[10px] font-mono">{controlType.replace(/_/g, " ")}</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {linkedPolicy ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between gap-2 p-3 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">
                      Evidence artifacts: {regPolicies.length} policy definitions, {regPolicies.filter(p => p.status === "active").length} active enforcements
                    </span>
                    <Button variant="outline" size="sm" data-testid={`button-export-matrix-${reg.id}`}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Export Matrix
                    </Button>
                  </CardFooter>
                </Card>
              );
            })
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {industryRetentionRules.length > 0 && (
              <Card data-testid="card-retention-policy">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Timer className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold" data-testid="text-retention-title">
                          Regulatory Retention Active
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Max {maxRetentionYears} years &middot; {industryRetentionRules.length} regulations enforced
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Auto-configured from {industry?.label} workspace
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-retention-locked">
                      <Lock className="w-3 h-3 mr-1" /> Locked
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    {industryRetentionRules.map((rule) => (
                      <div key={rule.regulation} className="flex items-center justify-between gap-2" data-testid={`retention-rule-${rule.regulation.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-[11px] truncate">{rule.regulation}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-[10px]">{rule.retentionYears}yr</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

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
              {correlatedEventCount > 0 && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-correlated-count">
                  <Link2 className="w-3 h-3 mr-1" /> {correlatedEventCount} correlated
                </Badge>
              )}
              <Dialog open={regulatoryExportOpen} onOpenChange={setRegulatoryExportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-regulatory-export">
                    <Download className="w-4 h-4 mr-1.5" /> Regulatory Export
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Regulatory Export Formats</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                      Export audit data in formats required by specific regulators. Format availability adapts to your industry workspace.
                    </p>
                    <div className="flex flex-col gap-2">
                      {availableExportFormats.map((fmt) => {
                        const Icon = fmt.icon;
                        return (
                          <div
                            key={fmt.id}
                            className={`flex items-center gap-3 p-3 rounded-md cursor-pointer toggle-elevate ${selectedExportFormat === fmt.id ? "toggle-elevated border border-primary/30" : "border border-transparent"}`}
                            onClick={() => setSelectedExportFormat(fmt.id)}
                            data-testid={`export-format-${fmt.id}`}
                          >
                            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-sm font-medium">{fmt.name}</span>
                              <span className="text-[11px] text-muted-foreground">{fmt.description}</span>
                            </div>
                            {fmt.industry !== "all" && (
                              <Badge variant="secondary" className="text-[9px] shrink-0">{fmt.industry.replace("_", " ")}</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      onClick={() => {
                        const result = generateRegulatoryExport(filteredAuditEvents, selectedExportFormat, industry?.id || null);
                        const blob = new Blob([result.content], { type: result.mimeType });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = result.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        setRegulatoryExportOpen(false);
                        toast({ title: "Export complete", description: `${filteredAuditEvents.length} events exported as ${result.filename}` });
                      }}
                      data-testid="button-download-regulatory"
                    >
                      <Download className="w-4 h-4 mr-1.5" /> Download {availableExportFormats.find((f) => f.id === selectedExportFormat)?.name || "Export"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
            {industryComplianceFrameworks.length > 0 && (
              <Select value={complianceFilter || "all"} onValueChange={(v) => setComplianceFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-compliance-filter">
                  <Shield className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Compliance Evidence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-compliance-all">All Frameworks</SelectItem>
                  {industryComplianceFrameworks.map((fw) => (
                    <SelectItem key={fw.id} value={fw.id} data-testid={`select-compliance-${fw.id}`}>
                      {fw.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {ontologyTagOptions.systems.length > 0 && (
              <Select value={ontologySystemFilter || "all"} onValueChange={(v) => setOntologySystemFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-ontology-system">
                  <Database className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="System" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-system-all">All Systems</SelectItem>
                  {ontologyTagOptions.systems.map((sys) => (
                    <SelectItem key={sys} value={sys} data-testid={`select-system-${sys.toLowerCase().replace(/\s+/g, "-")}`}>
                      {sys.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {ontologyTagOptions.regulations.length > 0 && (
              <Select value={ontologyRegulationFilter || "all"} onValueChange={(v) => setOntologyRegulationFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-[170px]" data-testid="select-ontology-regulation">
                  <Scale className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Regulation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-regulation-all">All Regulations</SelectItem>
                  {ontologyTagOptions.regulations.map((reg) => (
                    <SelectItem key={reg} value={reg} data-testid={`select-regulation-${reg.toLowerCase().replace(/\s+/g, "-")}`}>
                      {reg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {ontologyTagOptions.entityTypes.length > 0 && (
              <Select value={ontologyEntityFilter || "all"} onValueChange={(v) => setOntologyEntityFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-ontology-entity">
                  <Tags className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-entity-all">All Entities</SelectItem>
                  {ontologyTagOptions.entityTypes.map((ent) => (
                    <SelectItem key={ent} value={ent} data-testid={`select-entity-${ent.toLowerCase().replace(/\s+/g, "-")}`}>
                      {ent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

          {traceViewId && traceSteps.length > 0 && (
            <Card data-testid="card-trace-viewer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Cross-Agent Trace</span>
                    <Badge variant="secondary" className="text-[10px]">{traceSteps.length} steps</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setTraceViewId(null)} data-testid="button-close-trace">
                    <Unlink className="w-3.5 h-3.5 mr-1" /> Close Trace
                  </Button>
                </div>
                <div className="flex flex-col gap-0">
                  {traceSteps.map((step, idx) => {
                    const isLast = idx === traceSteps.length - 1;
                    return (
                      <div key={step.eventId} className="flex gap-3" data-testid={`trace-step-${idx}`}>
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                            step.status === "failed" ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary"
                          }`}>
                            {idx + 1}
                          </div>
                          {!isLast && (
                            <div className="flex flex-col items-center py-1">
                              <div className="h-4 border-l-2 border-dashed border-primary/30" />
                              <ArrowRight className="w-3 h-3 text-primary/50 rotate-90" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 pb-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{step.agentName}</Badge>
                            <span className="text-xs font-medium">{step.action}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {step.objectType}:{step.objectId}
                          </span>
                          {step.details && (
                            <p className="text-[10px] text-muted-foreground/70 truncate">{step.details.slice(0, 120)}</p>
                          )}
                          <span className="text-[10px] text-muted-foreground/50">
                            {step.timestamp ? new Date(step.timestamp).toLocaleString() : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              {filteredAuditEvents.length > 0 ? (
                <div className="flex flex-col">
                  {filteredAuditEvents.map((event, index) => {
                    const isLast = index === filteredAuditEvents.length - 1;
                    const isExpanded = expandedEvent === event.id;
                    const eventFrameworks = industry ? getComplianceFrameworksForEvent(event, industry.id) : [];
                    const retentionInfo = getRetentionExpiryForEvent(event, industry?.id || null);
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
                            <div className="flex items-center gap-1.5 flex-wrap">
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
                              {event.correlationId && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link2
                                      className="w-3 h-3 text-primary cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); setTraceViewId(event.correlationId!); }}
                                      data-testid={`icon-trace-${event.id}`}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span className="text-xs">View cross-agent trace</span>
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
                          {eventFrameworks.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {eventFrameworks.map((fw) => (
                                <span key={fw.id} className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm ${fw.color}`} data-testid={`badge-compliance-${fw.id}-${event.id}`}>
                                  {fw.shortName}
                                </span>
                              ))}
                              {retentionInfo && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground cursor-help">
                                      <Timer className="w-2.5 h-2.5 mr-0.5" />{retentionInfo.maxYears}yr
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-xs font-medium">Retained per {retentionInfo.regulation}</span>
                                      <span className="text-[10px] text-muted-foreground">Expires: {retentionInfo.expiresAt.toLocaleDateString()}</span>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                          <OntologyTagBadges eventId={event.id} ontologyTags={event.ontologyTags} />
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
                              <div className="flex items-center gap-2 flex-wrap">
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
                                {event.correlationId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); setTraceViewId(event.correlationId!); }}
                                    data-testid={`button-trace-${event.id}`}
                                  >
                                    <GitBranch className="w-3.5 h-3.5 mr-1" />
                                    View Trace
                                  </Button>
                                )}
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

          {detectedRegulations.length > 0 && (
            <Card data-testid="card-one-click-reports">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  One-Click Compliance Report Generation
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground">
                  Generate auditor-ready compliance reports per regulatory framework. Each report includes control inventory, evidence artifacts, test results, exception log, and gap analysis with regulation-section cross-references.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {detectedRegulations.map((reg) => {
                    const regPolicies = policies?.filter(p => (p as any).policyJson?.rules?.[0]?.sourceRegulation === reg.name) || [];
                    const activePols = regPolicies.filter(p => p.status === "active").length;
                    const coverage = reg.requirements.length > 0 ? Math.round((regPolicies.length / reg.requirements.length) * 100) : 0;
                    const gaps = reg.requirements.length - regPolicies.length;
                    const existingReport = complianceReports?.find(r => r.framework === reg.name || r.framework === reg.id);
                    return (
                      <Card key={reg.id} className="hover-elevate" data-testid={`card-generate-report-${reg.id}`}>
                        <CardContent className="p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Scale className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-sm font-semibold">{reg.name}</span>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${coverage >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : coverage >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}`}>
                              {coverage}% coverage
                            </Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-center">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">{regPolicies.length}</span>
                              <span className="text-[9px] text-muted-foreground">Policies</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{activePols}</span>
                              <span className="text-[9px] text-muted-foreground">Enforcing</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">{reg.requirements.length}</span>
                              <span className="text-[9px] text-muted-foreground">Controls</span>
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-sm font-bold ${gaps > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{Math.max(gaps, 0)}</span>
                              <span className="text-[9px] text-muted-foreground">Gaps</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <Button size="sm" className="flex-1" data-testid={`button-generate-framework-report-${reg.id}`}
                              onClick={() => toast({ title: "Report Generation Queued", description: `Generating ${reg.name} compliance report with ${reg.requirements.length} controls, evidence artifacts, and gap analysis...` })}
                            >
                              <FileText className="w-3.5 h-3.5 mr-1" /> Generate Report
                            </Button>
                            {existingReport && (
                              <Badge variant="outline" className="text-[10px]">
                                Last: {existingReport.createdAt ? new Date(existingReport.createdAt).toLocaleDateString() : "N/A"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="outline" className="text-[9px]">Control Inventory</Badge>
                            <Badge variant="outline" className="text-[9px]">Evidence Artifacts</Badge>
                            <Badge variant="outline" className="text-[9px]">Test Results</Badge>
                            <Badge variant="outline" className="text-[9px]">Exception Log</Badge>
                            <Badge variant="outline" className="text-[9px]">Gap Analysis</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            {complianceReports?.map((report) => {
              const findings = (report.findings as Array<{ control: string; title: string; status: string; evidence: string }>) || [];
              const evidencePackage = report.evidencePackage as Record<string, any> | null;
              const isExpanded = expandedFindings[report.id] || false;
              const regDetail = detectedRegulations.find(r => r.name === report.framework || r.id === report.framework);
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
                      {regDetail && (
                        <Badge variant="outline" className="text-[10px]">
                          {regDetail.requirements.length} regulation sections
                        </Badge>
                      )}
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
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {regDetail && (
                      <div className="flex flex-col gap-2 p-3 rounded-md bg-muted/30" data-testid={`section-report-summary-${report.id}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{regDetail.requirements.length}</span>
                            <span className="text-[9px] text-muted-foreground">Control Inventory</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{findings.filter(f => f.status === "pass").length}</span>
                            <span className="text-[9px] text-muted-foreground">Evidence Collected</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{findings.length}</span>
                            <span className="text-[9px] text-muted-foreground">Test Results</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{findings.filter(f => f.status === "warning").length}</span>
                            <span className="text-[9px] text-muted-foreground">Exceptions</span>
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-xs font-bold ${findings.filter(f => f.status === "fail").length > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{findings.filter(f => f.status === "fail").length}</span>
                            <span className="text-[9px] text-muted-foreground">Gaps Found</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() => setExpandedFindings((prev) => ({ ...prev, [report.id]: !prev[report.id] }))}
                      data-testid={`button-toggle-findings-${report.id}`}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      {findings.length} Findings {regDetail ? `(${regDetail.name} cross-ref)` : ""}
                    </Button>
                    {isExpanded && (
                      <div className="flex flex-col gap-2 ml-2">
                        {findings.map((finding, fi) => {
                          const evidenceKey = `${report.id}-${fi}`;
                          const showEvidence = expandedEvidence[evidenceKey] || false;
                          const matchedReq = regDetail?.requirements.find(r =>
                            r.category.toLowerCase() === finding.control.toLowerCase() ||
                            r.title.toLowerCase().includes(finding.title.toLowerCase().split(" ").slice(0, 2).join(" "))
                          );
                          return (
                            <div key={fi} className="flex flex-col gap-1 p-2 rounded-md bg-muted/30" data-testid={`finding-${report.id}-${fi}`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-mono">{finding.control}</Badge>
                                  <span className="text-xs font-medium">{finding.title}</span>
                                  {matchedReq && (
                                    <Badge variant="outline" className="text-[9px] gap-0.5">
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      {matchedReq.id.toUpperCase()}
                                    </Badge>
                                  )}
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
          {(() => {
            const expiringSoon = policyExceptions?.filter(e => {
              if (e.status !== "approved" || !e.expiresAt) return false;
              const diff = new Date(e.expiresAt).getTime() - Date.now();
              return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
            }) ?? [];
            if (expiringSoon.length === 0) return null;
            return (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/8" data-testid="banner-expiring-exceptions">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {expiringSoon.length} exception{expiringSoon.length > 1 ? "s" : ""} expiring within 7 days
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {expiringSoon.map(e => (
                      <span key={e.id} className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md">
                        {policyMap[e.policyId] ?? e.policyId} · {getTimeRemaining(e.expiresAt!)}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  onClick={() => setActiveGovTab("control-points")}
                  data-testid="button-view-expiry-queue"
                >
                  Review Queue
                </Button>
              </div>
            );
          })()}
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

        <TabsContent value="tool-risk" className="mt-0 flex flex-col gap-4" data-testid="content-tool-risk">
          {(() => {
            const riskGroups = { critical: [] as any[], high: [] as any[], medium: [] as any[], low: [] as any[] };
            (toolsByRisk || []).forEach(t => {
              const level = (t.riskClassification || "low").toLowerCase();
              if (level in riskGroups) (riskGroups as any)[level].push(t);
              else riskGroups.low.push(t);
            });
            const riskMeta: { level: string; label: string; color: string; icon: typeof ShieldAlert }[] = [
              { level: "critical", label: "Critical", color: "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800", icon: ShieldAlert },
              { level: "high", label: "High", color: "text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800", icon: AlertTriangle },
              { level: "medium", label: "Medium", color: "text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800", icon: Shield },
              { level: "low", label: "Low", color: "text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800", icon: ShieldCheck },
            ];
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {riskMeta.map(rm => {
                    const count = (riskGroups as any)[rm.level]?.length || 0;
                    const RmIcon = rm.icon;
                    return (
                      <Card key={rm.level} data-testid={`card-risk-summary-${rm.level}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${rm.color}`}>
                            <RmIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold">{count}</p>
                            <p className="text-[11px] text-muted-foreground">{rm.label} Risk</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <Card data-testid="card-tool-risk-table">
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">MCP Tool Risk Registry</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 overflow-x-auto">
                    {toolsByRisk && toolsByRisk.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Tool Name</TableHead>
                            <TableHead className="text-xs">Server</TableHead>
                            <TableHead className="text-xs">Risk Level</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Owner</TableHead>
                            <TableHead className="text-xs">Usage</TableHead>
                            <TableHead className="text-xs">Ontology</TableHead>
                            <TableHead className="text-xs">Governance Gate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {toolsByRisk.map(tool => {
                            const risk = (tool.riskClassification || "low").toLowerCase();
                            const riskInfo = riskMeta.find(r => r.level === risk) || riskMeta[3];
                            const needsApproval = risk === "critical" || risk === "high";
                            return (
                              <TableRow key={tool.id} data-testid={`row-tool-risk-${tool.id}`}>
                                <TableCell className="text-xs font-medium">{tool.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">{tool.serverName}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-[10px] border ${riskInfo.color}`}>
                                    {riskInfo.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={tool.enabled ? "default" : "secondary"} className="text-[10px]">
                                    {tool.enabled ? "Enabled" : "Disabled"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{tool.owner || "Unassigned"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{tool.usageCount || 0}</TableCell>
                                <TableCell>
                                  {(() => {
                                    const tags = (tool.ontologyTags as Array<{ conceptId: string; label: string }>) || [];
                                    return tags.length > 0 ? (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {tags.slice(0, 2).map((t, i) => (
                                          <Badge key={i} variant="outline" className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                            {t.label}
                                          </Badge>
                                        ))}
                                        {tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>}
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-muted-foreground">None</span>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell>
                                  {needsApproval ? (
                                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 dark:border-orange-800 dark:text-orange-400">
                                      <Lock className="w-3 h-3 mr-1" />
                                      Approval Required
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] border-green-300 text-green-600 dark:border-green-800 dark:text-green-400">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Auto-Approved
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-tools">
                        No MCP tools registered yet. Add tools to MCP servers to see risk classifications here.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="card-risk-policies">
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Risk-Based Governance Policies</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {riskMeta.map(rm => {
                      const tools = (riskGroups as any)[rm.level] || [];
                      const RmIcon = rm.icon;
                      return (
                        <div key={rm.level} className="flex items-start gap-3 p-3 border rounded-md" data-testid={`policy-rule-${rm.level}`}>
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${rm.color}`}>
                            <RmIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{rm.label} Risk Tools</span>
                              <Badge variant="secondary" className="text-[10px]">{tools.length} tools</Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {rm.level === "critical" && "Requires dual approval from Security + Compliance officers before any agent invocation. Full audit logging with data lineage tracking."}
                              {rm.level === "high" && "Requires single approval from authorized reviewer. Rate-limited invocations with mandatory output validation."}
                              {rm.level === "medium" && "Auto-approved with post-execution review. Standard audit logging and periodic compliance checks."}
                              {rm.level === "low" && "Auto-approved with basic logging. Included in routine compliance reports."}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </>
            );
          })()}
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
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Industry Policy Packs</h2>
              <p className="text-sm text-muted-foreground">
                Pre-configured policy bundles aligned to regulatory frameworks. Activate a pack to create all included policies at once.
              </p>
            </div>
            <PermissionGate action="create_modify_policies">
              <Button variant="outline" onClick={() => { setCreatePackDefaultFramework(""); setCreatePackOpen(true); }} data-testid="button-create-pack">
                <Plus className="h-4 w-4 mr-1.5" /> Create Pack
              </Button>
            </PermissionGate>
          </div>

          {industry && industry.id !== "custom" && allPolicyPacks.some((p) => p.industry === industry.id) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <industry.icon className="h-4 w-4" style={{ color: industry.color }} />
                <h3 className="text-sm font-medium">Recommended for {industry.label}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allPolicyPacks.filter((p) => p.industry === industry.id).map((pack) => {
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
                            variant={isActivated ? "outline" : "default"}
                            disabled={activatePackMutation.isPending}
                            onClick={() => activatePackMutation.mutate(getPackWithEnhancements(pack))}
                            data-testid={`button-activate-pack-${pack.id}`}
                          >
                            {activatePackMutation.isPending ? (
                              "Activating..."
                            ) : isActivated ? (
                              <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync Pack</>
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
              {allPolicyPacks.filter((p) => !industry || industry.id === "custom" || p.industry !== industry.id).map((pack) => {
                const isActivated = activatedPacks.has(pack.id);
                const industryLabel: Record<string, string> = {
                  cross_industry: "Cross-Industry",
                  financial_services: "Financial Services",
                  healthcare: "Healthcare",
                  manufacturing: "Manufacturing",
                  retail: "Retail",
                  insurance: "Insurance",
                  technology_saas: "Technology / SaaS",
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
                          variant={isActivated ? "outline" : "default"}
                          disabled={activatePackMutation.isPending}
                          onClick={() => activatePackMutation.mutate(getPackWithEnhancements(pack))}
                          data-testid={`button-activate-pack-${pack.id}`}
                        >
                          {isActivated ? (
                            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync</>
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
              onUpdatePolicies={updatePackPolicies}
            />
          )}
          <CreatePolicyPackDialog
            open={createPackOpen}
            onOpenChange={(open) => { setCreatePackOpen(open); if (!open) setCreatePackDefaultFramework(""); }}
            onSave={saveCustomPack}
            defaultIndustry={industry?.id as IndustryId}
            defaultFramework={createPackDefaultFramework}
          />
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
                          <Badge key={j} variant="outline" data-testid={`badge-jurisdiction-${reg.id}-${j}`}>
                            <Globe className="w-3 h-3 mr-1" />
                            {j}
                          </Badge>
                        ))}
                        {reg.departments && reg.departments.length > 0 && reg.departments.map((dept) => (
                          <Badge key={dept} variant="outline" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" data-testid={`badge-dept-${reg.id}-${dept.replace(/[\s\/&]/g, "-").toLowerCase()}`}>
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
                        <PermissionGate action="create_modify_policies">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCreatePackDefaultFramework(reg.name);
                              setCreatePackOpen(true);
                              setActiveGovTab("policy-packs");
                            }}
                            data-testid={`button-create-pack-from-reg-${reg.id}`}
                          >
                            <Layers className="w-4 h-4 mr-1" />
                            Create Pack
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
                        <Badge key={j} variant="outline" data-testid={`badge-dialog-jurisdiction-${j}`}>
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
                                <Badge variant="outline" className={SEVERITY_COLORS[req.severity] || ""} data-testid={`badge-severity-${req.id}`}>
                                  {req.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground" data-testid={`text-req-desc-${req.id}`}>{req.description}</p>
                              <Badge variant="outline" className="w-fit mt-1" data-testid={`badge-req-category-${req.id}`}>{req.category}</Badge>
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

        <TabsContent value="impact-network" className="mt-0 flex flex-col gap-4" data-testid="content-impact-network">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-violet-500" />
                <CardTitle className="text-base" data-testid="text-impact-network-title">Policy Impact Network</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {(policies || []).filter(p => p.status === "active").length} active policies
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground max-w-md text-right">
                Visualizes how policies connect to skills, ontology terms, and agents. Click any node to see its blast radius.
              </p>
            </CardHeader>
            <CardContent className="p-2">
              <PolicyImpactGraph
                policies={(policies || []).map(p => ({
                  id: p.id,
                  name: p.name,
                  domain: p.domain,
                  status: p.status,
                  description: p.description || undefined,
                  policyJson: p.policyJson as Record<string, unknown> | null,
                  ontologyRefs: (p as any).ontologyRefs || [],
                }))}
                skills={(allSkills || []).map(s => ({
                  id: s.id,
                  name: s.name,
                  industry: s.industry,
                  domain: s.domain,
                  description: s.description,
                  tags: s.tags || [],
                  industryContextId: s.industryContextId || undefined,
                }))}
                agents={(agents || []).map(a => ({
                  id: a.id,
                  name: a.name,
                  agentType: a.agentType || undefined,
                  outcomeId: a.outcomeId || undefined,
                  policyBindings: a.policyBindings,
                  complianceTags: a.complianceTags || [],
                  ontologyTags: a.ontologyTags,
                }))}
                ontologyConcepts={(allOntologyConcepts || []).map(o => ({
                  id: o.id,
                  label: o.label,
                  category: o.category,
                  industryId: o.industryId,
                }))}
                height={680}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance-posture" className="mt-0 flex flex-col gap-4" data-testid="content-compliance-posture">
          {postureLoading ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-md" />)}
              </div>
              <Skeleton className="h-64 rounded-md" />
            </div>
          ) : compliancePosture ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Overall Posture"
                  value={`${compliancePosture.overallPosture.score}%`}
                  icon={ShieldCheck}
                  variant={compliancePosture.overallPosture.score >= 80 ? "success" : compliancePosture.overallPosture.score >= 50 ? "warning" : "danger"}
                  testId="stat-posture-score"
                />
                <StatCard
                  title="Frameworks"
                  value={compliancePosture.overallPosture.totalFrameworks}
                  icon={Scale}
                  variant="default"
                  testId="stat-posture-frameworks"
                />
                <StatCard
                  title="Controls Covered"
                  value={`${compliancePosture.overallPosture.coveredControls}/${compliancePosture.overallPosture.totalControls}`}
                  icon={CheckCircle}
                  variant="success"
                  testId="stat-posture-covered"
                />
                <StatCard
                  title="Gap Controls"
                  value={compliancePosture.overallPosture.gapControls}
                  icon={AlertTriangle}
                  variant={compliancePosture.overallPosture.gapControls > 0 ? "danger" : "default"}
                  testId="stat-posture-gaps"
                />
              </div>

              {compliancePosture.frameworks.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground" data-testid="text-no-frameworks">
                      No compliance frameworks found. Seed regulations for your industry to see posture data.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {compliancePosture.frameworks.map((fw) => {
                      const coveragePercent = fw.totalControls > 0 ? Math.round((fw.coveredControls / fw.totalControls) * 100) : 0;
                      const agentsInvolved = new Map<string, string>();
                      fw.agentCoverage.forEach(ac => ac.agents.forEach(a => agentsInvolved.set(a.id, a.name)));
                      return (
                        <Card key={fw.regulationId} data-testid={`card-framework-${fw.regulationId}`}>
                          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                              <CardTitle className="text-sm truncate" data-testid={`text-framework-name-${fw.regulationId}`}>{fw.name}</CardTitle>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${coveragePercent >= 80 ? "text-green-600 dark:text-green-400 border-green-500/30" : coveragePercent >= 50 ? "text-amber-600 dark:text-amber-400 border-amber-500/30" : "text-red-600 dark:text-red-400 border-red-500/30"}`}
                              data-testid={`badge-coverage-${fw.regulationId}`}
                            >
                              {coveragePercent}% covered
                            </Badge>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <Progress value={coveragePercent} className="h-2" data-testid={`progress-coverage-${fw.regulationId}`} />
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{fw.coveredControls} of {fw.totalControls} controls</span>
                              <span>{fw.gaps.length} gap{fw.gaps.length !== 1 ? "s" : ""}</span>
                            </div>
                            {fw.gaps.length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Gaps:</span>
                                {fw.gaps.slice(0, 3).map((gap) => (
                                  <div key={gap.controlId} className="flex items-center gap-1.5 text-[11px]" data-testid={`gap-${gap.controlId}`}>
                                    <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                                    <span className="truncate text-muted-foreground">{gap.controlName}</span>
                                    <Badge variant="outline" className={`text-[9px] ml-auto shrink-0 ${gap.severity === "high" || gap.severity === "critical" ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                                      {gap.severity}
                                    </Badge>
                                  </div>
                                ))}
                                {fw.gaps.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{fw.gaps.length - 3} more gap{fw.gaps.length - 3 !== 1 ? "s" : ""}</span>
                                )}
                              </div>
                            )}
                            {agentsInvolved.size > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted-foreground">{agentsInvolved.size} agent{agentsInvolved.size !== 1 ? "s" : ""} bound</span>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(agentsInvolved.values()).slice(0, 4).map((name, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-[9px]" data-testid={`badge-agent-${fw.regulationId}-${idx}`}>{name}</Badge>
                                  ))}
                                  {agentsInvolved.size > 4 && (
                                    <Badge variant="outline" className="text-[9px]">+{agentsInvolved.size - 4}</Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  <Card data-testid="card-control-coverage-table">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-500" />
                        <CardTitle className="text-base" data-testid="text-control-coverage-title">Control Coverage</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {compliancePosture.frameworks.reduce((s, f) => s + f.agentCoverage.length, 0)} controls
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Framework</TableHead>
                              <TableHead className="text-xs">Control</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Agents</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {compliancePosture.frameworks.flatMap((fw) =>
                              fw.agentCoverage.map((ac) => {
                                const isGap = fw.gaps.some(g => g.controlId === ac.controlId);
                                const gapSeverity = fw.gaps.find(g => g.controlId === ac.controlId)?.severity;
                                return (
                                  <TableRow key={`${fw.regulationId}-${ac.controlId}`} data-testid={`row-control-${ac.controlId}`}>
                                    <TableCell className="text-xs font-medium">{fw.name.length > 30 ? fw.name.slice(0, 30) + "..." : fw.name}</TableCell>
                                    <TableCell className="text-xs">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-medium">{ac.controlId}</span>
                                        <span className="text-muted-foreground text-[11px] truncate max-w-[200px]">{ac.controlName}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {isGap ? (
                                        <Badge variant="outline" className={`text-[10px] ${gapSeverity === "high" || gapSeverity === "critical" ? "text-red-600 dark:text-red-400 border-red-500/20 bg-red-500/10" : "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10"}`} data-testid={`badge-status-gap-${ac.controlId}`}>
                                          Gap
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400 border-green-500/20 bg-green-500/10" data-testid={`badge-status-covered-${ac.controlId}`}>
                                          Covered
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {ac.agents.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {ac.agents.slice(0, 3).map((a) => (
                                            <Link key={a.id} href={`/agents/${a.id}`}>
                                              <Badge variant="secondary" className="text-[9px] cursor-pointer" data-testid={`badge-control-agent-${ac.controlId}-${a.id}`}>{a.name}</Badge>
                                            </Link>
                                          ))}
                                          {ac.agents.length > 3 && <Badge variant="outline" className="text-[9px]">+{ac.agents.length - 3}</Badge>}
                                        </div>
                                      ) : (
                                        <span className="text-[11px] text-muted-foreground">No agents</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-posture-empty">
                  Select an industry and navigate to this tab to view compliance posture data.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {selectedPolicyId && (
          <PolicyDetailDialog
            policyId={selectedPolicyId}
            open={!!selectedPolicyId}
            onOpenChange={(open) => { if (!open) setSelectedPolicyId(null); }}
            onDelete={(id) => deletePolicyMutation.mutate(id)}
            onToggleStatus={(id, newStatus) => togglePolicyStatusMutation.mutate({ id, status: newStatus })}
          />
        )}
      </Tabs>
    </div>
  );
}

function IndustryTestScenariosSection({ industry, policyDomain, policyFramework, onUseScenario }: {
  industry: ReturnType<typeof useIndustry>["industry"];
  policyDomain: string;
  policyFramework: string;
  onUseScenario: (scenario: IndustryTestScenario) => void;
}) {
  const [expandedJsonIds, setExpandedJsonIds] = useState<Record<string, boolean>>({});
  const industryId = industry?.id || "financial_services";
  const scenarios = INDUSTRY_TEST_SCENARIOS[industryId] || [];
  const relevantScenarios = scenarios.filter(s =>
    s.domain === policyDomain ||
    policyFramework.toLowerCase().includes(s.regulation.toLowerCase()) ||
    s.regulation.toLowerCase().includes(policyFramework.toLowerCase())
  );
  const displayScenarios = relevantScenarios.length > 0 ? relevantScenarios : scenarios;
  if (displayScenarios.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 mt-4" data-testid="section-industry-test-scenarios">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Industry Test Scenarios</span>
          {industry && (
            <Badge variant="outline" className="text-[10px]">{industry.label}</Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground" data-testid="text-scenario-count">
          {relevantScenarios.length > 0
            ? `${relevantScenarios.length} relevant scenarios`
            : `${displayScenarios.length} available (all industry scenarios)`
          }
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {displayScenarios.map((scenario) => {
          const jsonExpanded = expandedJsonIds[scenario.id] || false;
          return (
            <Card key={scenario.id} data-testid={`card-scenario-${scenario.id}`}>
              <CardContent className="p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Scale className="w-3 h-3" />{scenario.regulation}
                    </Badge>
                    <span className="text-sm font-medium" data-testid={`text-scenario-name-${scenario.id}`}>{scenario.name}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${scenario.expectedOutcome === "block" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"}`} data-testid={`badge-expected-${scenario.id}`}>
                    Expected: {scenario.expectedOutcome}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground" data-testid={`text-scenario-desc-${scenario.id}`}>{scenario.scenario}</p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUseScenario(scenario)}
                    data-testid={`button-use-scenario-${scenario.id}`}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Use as Test Case
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedJsonIds((prev) => ({ ...prev, [scenario.id]: !prev[scenario.id] }))}
                    data-testid={`button-view-input-${scenario.id}`}
                  >
                    {jsonExpanded ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
                    View input JSON
                  </Button>
                </div>
                {jsonExpanded && (
                  <pre className="text-[10px] bg-muted/50 p-2 rounded-md font-mono overflow-x-auto" data-testid={`pre-scenario-json-${scenario.id}`}>
                    {JSON.stringify(scenario.inputJson, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PolicyDetailDialog({ policyId, open, onOpenChange, onDelete, onToggleStatus }: { policyId: string; open: boolean; onOpenChange: (open: boolean) => void; onDelete?: (id: string) => void; onToggleStatus?: (id: string, newStatus: string) => void }) {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const { data: dialogOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ['/api/ontology-concepts/all'],
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

  const enhanceRulesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/enhance-policy-rules", {
        policyName: policy?.name || "",
        domain: policy?.domain || "",
        description: policy?.description || policy?.name || "",
        framework: policy?.name || "General",
        industry: industry?.label || "Financial Services",
        existingRules: editRules.map((r) => ({
          name: r.name,
          field: r.field,
          operator: r.operator,
          value: r.value,
          action: r.action,
        })),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const enhanced = data?.enhancedRules;
      if (!enhanced || typeof enhanced !== "object") {
        toast({ title: "AI enhancement returned unexpected format", variant: "destructive" });
        return;
      }
      const rules = Array.isArray(enhanced.rules) ? enhanced.rules : [];
      if (rules.length === 0) {
        toast({ title: "AI returned no rules", description: "Try adding some basic rules first, then enhance.", variant: "destructive" });
        return;
      }
      setIsStructuredFormat(true);
      setStructuredJsonEdit(JSON.stringify(enhanced, null, 2));
      setIsEditingStructured(true);
      toast({ title: "Rules enhanced by AI", description: `${rules.length} rules generated. Review and save when ready.` });
    },
    onError: (err: Error) => {
      toast({ title: "AI enhancement failed", description: err.message, variant: "destructive" });
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <DialogTitle data-testid="text-policy-detail-name">{policy.name}</DialogTitle>
              <Badge variant="outline" className="text-[10px]" data-testid="badge-policy-version">v{policy.version}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize" data-testid="badge-policy-scope">{policy.scopeType}</Badge>
              <StatusBadge status={policy.status} />
              <Badge variant="secondary" className="text-[10px] capitalize" data-testid="badge-policy-domain">{policy.domain.replace(/_/g, " ")}</Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleStatus && policy && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newStatus = policy.status === "active" ? "inactive" : "active";
                    onToggleStatus(policyId, newStatus);
                  }}
                  data-testid="button-toggle-policy-status"
                >
                  {policy.status === "active" ? (
                    <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Deactivate</>
                  ) : (
                    <><Check className="w-3.5 h-3.5 mr-1.5" /> Activate</>
                  )}
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => setDeleteConfirmOpen(true)} data-testid="button-delete-policy">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Policy</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{policy.name}"? This action cannot be undone. The policy will be permanently removed from the Policy Library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { onDelete?.(policyId); setDeleteConfirmOpen(false); onOpenChange(false); }} data-testid="button-confirm-delete">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                    <Label className="text-xs text-muted-foreground">Advanced Rule Editor (JSON) - type entity names for ontology autocomplete</Label>
                    <OntologyAutocompleteInput
                      value={structuredJsonEdit}
                      onChange={setStructuredJsonEdit}
                      concepts={dialogOntologyConcepts || []}
                      testId="textarea-structured-rules"
                      multiline
                      className="font-mono text-[11px] min-h-[300px]"
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
                    <PolicyRuleViewer rules={(policy?.policyJson as Record<string, unknown>) || {}} ontologyConcepts={dialogOntologyConcepts} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <PermissionGate action="create_modify_policies">
                        <Button variant="outline" onClick={() => setIsEditingStructured(true)} data-testid="button-edit-structured-rules">
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Rules
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => enhanceRulesMutation.mutate()}
                          disabled={enhanceRulesMutation.isPending}
                          data-testid="button-ai-enhance-rules-structured"
                        >
                          {enhanceRulesMutation.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enhancing...</>
                          ) : (
                            <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Enhance Rules</>
                          )}
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
                    <div className="flex-1 min-w-[120px]">
                      <OntologyAutocompleteInput
                        value={rule.name}
                        onChange={(v) => updateRule(idx, "name", v)}
                        placeholder="Rule name (type for ontology)"
                        concepts={dialogOntologyConcepts || []}
                        testId={`input-rule-name-${idx}`}
                      />
                    </div>
                    <div className="w-[140px]">
                      <OntologyAutocompleteInput
                        value={rule.field}
                        onChange={(v) => updateRule(idx, "field", v)}
                        placeholder="Entity type"
                        concepts={dialogOntologyConcepts || []}
                        testId={`input-rule-field-${idx}`}
                      />
                    </div>
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
                  <PermissionGate action="create_modify_policies">
                    <Button
                      variant="outline"
                      onClick={() => enhanceRulesMutation.mutate()}
                      disabled={enhanceRulesMutation.isPending}
                      data-testid="button-ai-enhance-rules"
                    >
                      {enhanceRulesMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enhancing...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-1" /> AI Enhance Rules</>
                      )}
                    </Button>
                  </PermissionGate>
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

            <IndustryTestScenariosSection
              industry={industry}
              policyDomain={policy.domain}
              policyFramework={policy.name || ""}
              onUseScenario={(scenario) => {
                setNewTestName(scenario.name);
                setNewTestDescription(scenario.scenario);
                setNewTestExpected(scenario.expectedOutcome);
                setNewTestInput(JSON.stringify(scenario.inputJson, null, 2));
                setAddTestOpen(true);
              }}
            />
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

function OntologyAutocompleteInput({
  value,
  onChange,
  placeholder,
  concepts,
  className,
  testId,
  multiline,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  concepts: OntologyConcept[];
  className?: string;
  testId?: string;
  multiline?: boolean;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [suggestionFilter, setSuggestionFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const getTokenAtCursor = (text: string, pos: number) => {
    const before = text.slice(0, pos);
    const match = before.match(/[\w_]+$/);
    return match ? match[0] : "";
  };

  const handleInputChange = (newVal: string, newPos: number) => {
    onChange(newVal);
    setCursorPos(newPos);
    const token = getTokenAtCursor(newVal, newPos);
    if (token.length >= 2) {
      setSuggestionFilter(token.toLowerCase());
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const filteredConcepts = useMemo(() => {
    if (!suggestionFilter || suggestionFilter.length < 2) return [];
    return concepts.filter(c =>
      c.label.toLowerCase().includes(suggestionFilter) ||
      (c.category || "").toLowerCase().includes(suggestionFilter)
    ).slice(0, 8);
  }, [concepts, suggestionFilter]);

  const insertConcept = (concept: OntologyConcept) => {
    const token = getTokenAtCursor(value, cursorPos);
    const before = value.slice(0, cursorPos - token.length);
    const after = value.slice(cursorPos);
    const label = concept.label.replace(/\s+/g, "_").toUpperCase();
    const newVal = before + label + after;
    onChange(newVal);
    setShowSuggestions(false);
    setSuggestionFilter("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const sharedProps = {
    value,
    placeholder,
    className: className || "",
    "data-testid": testId,
    onBlur: () => setTimeout(() => setShowSuggestions(false), 200),
  };

  return (
    <div className="relative">
      {multiline ? (
        <Textarea
          ref={inputRef as any}
          {...sharedProps}
          onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart || 0)}
          onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0)}
          onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0)}
        />
      ) : (
        <Input
          ref={inputRef as any}
          {...sharedProps}
          onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart || 0)}
          onKeyUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart || 0)}
          onClick={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart || 0)}
        />
      )}
      {showSuggestions && filteredConcepts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto" data-testid="ontology-suggestions">
          {filteredConcepts.map((concept) => (
            <div
              key={concept.id}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover-elevate text-sm"
              onMouseDown={(e) => { e.preventDefault(); insertConcept(concept); }}
              data-testid={`suggestion-${concept.id}`}
            >
              <span className="font-mono text-xs text-purple-600 dark:text-purple-400 shrink-0">{concept.label.replace(/\s+/g, "_").toUpperCase()}</span>
              <span className="text-muted-foreground text-[11px] truncate">{concept.category}</span>
            </div>
          ))}
          <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground">
            Type to search ontology vocabulary
          </div>
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

function PolicyRuleViewer({ rules, ontologyConcepts }: { rules: Record<string, unknown>; ontologyConcepts?: OntologyConcept[] }) {
  const ontologyLabels = useMemo(() => {
    if (!ontologyConcepts) return [];
    return ontologyConcepts.map(c => ({
      pattern: c.label.replace(/\s+/g, "_").toUpperCase(),
      label: c.label,
      category: c.category,
    })).filter(c => c.pattern.length >= 3);
  }, [ontologyConcepts]);

  const highlightOntologyTerms = (text: string): JSX.Element => {
    if (!ontologyLabels.length || typeof text !== "string") return <span>{text}</span>;
    const escaped = ontologyLabels.map(l => l.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => {
          const match = ontologyLabels.find(l => l.pattern.toLowerCase() === part.toLowerCase());
          if (match) {
            return (
              <Badge key={i} variant="outline" className="text-[10px] bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-400/30 font-mono mx-0.5 inline-flex" data-testid={`ontology-highlight-${match.pattern}`}>
                {part}
              </Badge>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  const renderWithHighlight = (key: string, value: unknown): JSX.Element => {
    if (typeof value === "string" && ontologyLabels.length > 0) {
      return <span className="text-xs" data-testid={`rule-field-${key}`}>{highlightOntologyTerms(value)}</span>;
    }
    return renderRuleValue(key, value);
  };

  const rulesList = (rules as { rules?: unknown[] }).rules;
  if (!rulesList || !Array.isArray(rulesList)) {
    return (
      <div className="space-y-2 bg-muted/30 rounded-md p-3">
        {Object.entries(rules).map(([key, value]) => (
          <div key={key} className="flex items-start gap-3">
            <span className="text-[11px] text-muted-foreground font-medium min-w-[90px] shrink-0 capitalize">{key.replace(/_/g, " ")}</span>
            {renderWithHighlight(key, value)}
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
                  {renderWithHighlight(key, value)}
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
  onUpdatePolicies,
}: {
  pack: PolicyPack;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActivated: boolean;
  onActivate: (pack: PolicyPack) => void;
  activating: boolean;
  savedEnhancements: Record<number, Record<string, unknown>>;
  onPersistEnhancement: (idx: number, rules: Record<string, unknown>) => void;
  onUpdatePolicies?: (packId: string, policies: PolicyPackPolicy[]) => void;
}) {
  const { toast } = useToast();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editedRules, setEditedRules] = useState<Record<number, string>>({});
  const [localEnhancements, setLocalEnhancements] = useState<Record<number, Record<string, unknown>>>({});
  const [enhancingIdx, setEnhancingIdx] = useState<number | null>(null);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyDomain, setNewPolicyDomain] = useState("data_handling");
  const [newPolicyDescription, setNewPolicyDescription] = useState("");
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);

  const industryLabel: Record<string, string> = {
    cross_industry: "Cross-Industry",
    financial_services: "Financial Services",
    healthcare: "Healthcare & Life Sciences",
    manufacturing: "Manufacturing & Supply Chain",
    retail: "Retail & E-Commerce",
    insurance: "Insurance",
    technology_saas: "Technology / SaaS",
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
        description: policy.description || `Policy for ${policy.name} in the ${policy.domain} domain`,
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

  function handleAddPolicy() {
    if (!newPolicyName.trim() || !onUpdatePolicies) return;
    const newPolicy: PolicyPackPolicy = {
      name: newPolicyName.trim(),
      domain: newPolicyDomain,
      description: newPolicyDescription.trim(),
      policyJson: { rules: [] },
    };
    onUpdatePolicies(pack.id, [...pack.policies, newPolicy]);
    setNewPolicyName("");
    setNewPolicyDomain("data_handling");
    setNewPolicyDescription("");
    setAddPolicyOpen(false);
    toast({ title: "Policy added to pack", description: `"${newPolicy.name}" has been added` });
  }

  function handleRemovePolicy(idx: number) {
    if (!onUpdatePolicies) return;
    const removed = pack.policies[idx];
    onUpdatePolicies(pack.id, pack.policies.filter((_, i) => i !== idx));
    setRemovingIdx(null);
    toast({ title: "Policy removed from pack", description: `"${removed.name}" has been removed` });
  }

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
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Included Policies</h4>
              {onUpdatePolicies && (
                <PermissionGate action="create_modify_policies">
                  <Button size="sm" variant="outline" onClick={() => setAddPolicyOpen(!addPolicyOpen)} data-testid="button-add-policy-to-pack">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Policy
                  </Button>
                </PermissionGate>
              )}
            </div>

            {addPolicyOpen && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h5 className="text-xs font-medium text-muted-foreground">New Policy</h5>
                  <div className="space-y-2">
                    <Input placeholder="Policy name" value={newPolicyName} onChange={(e) => setNewPolicyName(e.target.value)} data-testid="input-add-policy-name" />
                    <Select value={newPolicyDomain} onValueChange={setNewPolicyDomain}>
                      <SelectTrigger data-testid="select-add-policy-domain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="data_handling">Data Handling</SelectItem>
                        <SelectItem value="tool_permissions">Tool Permissions</SelectItem>
                        <SelectItem value="logging">Logging & Audit</SelectItem>
                        <SelectItem value="allowed_actions">Allowed Actions</SelectItem>
                        <SelectItem value="content_boundaries">Content Boundaries</SelectItem>
                        <SelectItem value="financial_reporting">Financial Reporting</SelectItem>
                        <SelectItem value="access_control">Access Control</SelectItem>
                        <SelectItem value="audit_compliance">Audit Compliance</SelectItem>
                        <SelectItem value="deployment_safety">Deployment Safety</SelectItem>
                        <SelectItem value="model_governance">Model Governance</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea placeholder="Policy description" value={newPolicyDescription} onChange={(e) => setNewPolicyDescription(e.target.value)} className="text-sm min-h-[60px]" data-testid="input-add-policy-desc" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" disabled={!newPolicyName.trim()} onClick={handleAddPolicy} data-testid="button-save-add-policy">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAddPolicyOpen(false); setNewPolicyName(""); setNewPolicyDescription(""); }} data-testid="button-cancel-add-policy">
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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
                      <span className="text-sm font-medium min-w-0 truncate">{p.name}</span>
                      {policyEnhanced && (
                        <Badge variant="secondary" className="text-[10px] text-green-600 dark:text-green-400">
                          <Wand2 className="h-2.5 w-2.5 mr-0.5" /> AI Enhanced
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{p.domain.replace(/_/g, " ")}</Badge>
                      {onUpdatePolicies && pack.policies.length > 1 && (
                        <PermissionGate action="create_modify_policies">
                          <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setRemovingIdx(idx); }} data-testid={`button-remove-policy-${idx}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </PermissionGate>
                      )}
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
              variant={isActivated ? "outline" : "default"}
              disabled={activating}
              onClick={handleActivateWithEnhancements}
              data-testid="button-activate-pack-dialog"
            >
              {activating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isActivated ? "Syncing..." : "Activating..."}</>
              ) : isActivated ? (
                <><RefreshCw className="h-4 w-4 mr-2" /> Sync Pack ({pack.policies.length} policies){hasAnyEnhancements ? " with Enhancements" : ""}</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Activate Pack ({pack.policies.length} policies){hasAnyEnhancements ? " with Enhancements" : ""}</>
              )}
            </Button>
          </PermissionGate>
        </div>
        <AlertDialog open={removingIdx !== null} onOpenChange={(open) => { if (!open) setRemovingIdx(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Policy from Pack</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove "{removingIdx !== null ? pack.policies[removingIdx]?.name : ""}" from this pack? This won't delete any already-activated policies.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-remove-policy">Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => removingIdx !== null && handleRemovePolicy(removingIdx)} data-testid="button-confirm-remove-policy">
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function CreatePolicyPackDialog({
  open,
  onOpenChange,
  onSave,
  defaultIndustry,
  defaultFramework,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (pack: PolicyPack) => void;
  defaultIndustry?: IndustryId;
  defaultFramework?: string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [packIndustry, setPackIndustry] = useState<string>(defaultIndustry || "financial_services");
  const [framework, setFramework] = useState(defaultFramework || "");
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high" | "critical">("high");
  const [packPolicies, setPackPolicies] = useState<PolicyPackPolicy[]>([
    { name: "", domain: "data_handling", description: "", policyJson: {} },
  ]);

  const aiEnhanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/enhance-policy-pack", {
        packName: name,
        framework,
        description,
        industry: packIndustry,
        riskLevel,
        existingPolicies: packPolicies.filter(p => p.name.trim()),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.enhancedDescription && !description.trim()) {
        setDescription(data.enhancedDescription);
      }
      if (data.suggestedPolicies && Array.isArray(data.suggestedPolicies)) {
        const existingNames = new Set(packPolicies.map(p => p.name.toLowerCase().trim()).filter(Boolean));
        const newPolicies = data.suggestedPolicies
          .filter((sp: any) => sp.name?.trim() && !existingNames.has(sp.name.toLowerCase().trim()))
          .map((sp: any) => ({
            name: sp.name.trim(),
            domain: ["data_handling", "tool_permissions", "allowed_actions", "content_boundaries", "logging"].includes(sp.domain) ? sp.domain : "data_handling",
            description: sp.description || "",
            policyJson: {},
          }));
        if (newPolicies.length > 0) {
          const validExisting = packPolicies.filter(p => p.name.trim());
          setPackPolicies(validExisting.length > 0 ? [...validExisting, ...newPolicies] : newPolicies);
        }
      }
      const addedCount = data.suggestedPolicies?.filter((sp: any) => sp.name?.trim()).length || 0;
      toast({ title: "AI Enhancement Complete", description: `Added ${addedCount} policy suggestions` });
    },
    onError: (err: Error) => {
      toast({ title: "AI Enhancement Failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setPackIndustry(defaultIndustry || "financial_services");
      setFramework(defaultFramework || "");
      setRiskLevel("high");
      setPackPolicies([{ name: "", domain: "data_handling", description: "", policyJson: {} }]);
    }
  }, [open, defaultIndustry, defaultFramework]);

  const addPackPolicy = () => {
    setPackPolicies((prev) => [...prev, { name: "", domain: "data_handling", description: "", policyJson: {} }]);
  };

  const updatePackPolicy = (idx: number, field: keyof PolicyPackPolicy, value: string) => {
    setPackPolicies((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const removePackPolicy = (idx: number) => {
    setPackPolicies((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSave = name.trim() && framework.trim() && packPolicies.some((p) => p.name.trim());

  const handleSave = () => {
    const validPolicies = packPolicies.filter((p) => p.name.trim());
    onSave({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      industry: packIndustry,
      framework: framework.trim(),
      riskLevel,
      policies: validPolicies.map((p) => ({
        ...p,
        policyJson: p.policyJson && Object.keys(p.policyJson).length > 0 ? p.policyJson : { rules: [] },
      })),
    });
  };

  const domainOptions = [
    { value: "data_handling", label: "Data Handling" },
    { value: "tool_permissions", label: "Tool Permissions" },
    { value: "allowed_actions", label: "Allowed Actions" },
    { value: "content_boundaries", label: "Content Boundaries" },
    { value: "logging", label: "Logging & Audit" },
  ];

  const industryOptions: { value: string; label: string }[] = [
    { value: "cross_industry", label: "Cross-Industry" },
    { value: "healthcare", label: "Healthcare" },
    { value: "financial_services", label: "Financial Services" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "insurance", label: "Insurance" },
    { value: "retail", label: "Retail" },
    { value: "technology_saas", label: "Technology / SaaS" },
    { value: "legal_services", label: "Legal Services" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Create Policy Pack
          </DialogTitle>
          <DialogDescription>
            Define a reusable policy pack with multiple policies. Once created, you can activate it to create all policies at once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Pack Name</label>
              <Input
                placeholder="e.g., Credit Rating / SEC Compliance"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-pack-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Regulatory Framework</label>
              <Input
                placeholder="e.g., SEC Rule 17g (NRSRO)"
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                data-testid="input-pack-framework"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Describe the purpose and scope of this policy pack..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-pack-description"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Industry</label>
              <Select value={packIndustry} onValueChange={(v) => setPackIndustry(v)}>
                <SelectTrigger data-testid="select-pack-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as "low" | "medium" | "high" | "critical")}>
                <SelectTrigger data-testid="select-pack-risk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">Policies in Pack ({packPolicies.length})</label>
              <Button variant="outline" size="sm" onClick={addPackPolicy} data-testid="button-add-pack-policy">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Policy
              </Button>
            </div>
            <div className="space-y-3">
              {packPolicies.map((pp, idx) => (
                <Card key={idx}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Policy {idx + 1}</span>
                      {packPolicies.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removePackPolicy(idx)} data-testid={`button-remove-pack-policy-${idx}`}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Policy name"
                        value={pp.name}
                        onChange={(e) => updatePackPolicy(idx, "name", e.target.value)}
                        data-testid={`input-pack-policy-name-${idx}`}
                      />
                      <Select value={pp.domain} onValueChange={(v) => updatePackPolicy(idx, "domain", v)}>
                        <SelectTrigger data-testid={`select-pack-policy-domain-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {domainOptions.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder="Policy description"
                      value={pp.description}
                      onChange={(e) => updatePackPolicy(idx, "description", e.target.value)}
                      data-testid={`input-pack-policy-desc-${idx}`}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-create-pack">Cancel</Button>
          <Button
            variant="outline"
            onClick={() => aiEnhanceMutation.mutate()}
            disabled={!name.trim() || !framework.trim() || aiEnhanceMutation.isPending}
            data-testid="button-ai-enhance-pack"
          >
            {aiEnhanceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            AI Enhance
          </Button>
          <Button onClick={handleSave} disabled={!canSave} data-testid="button-save-pack">
            <Layers className="h-4 w-4 mr-1.5" />
            Create Pack ({packPolicies.filter(p => p.name.trim()).length} policies)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
