import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Send,
  Target,
  Bot,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  Shield,
  Workflow,
  ClipboardCheck,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  Clock,
  Zap,
  Square,
  Play,
  Plus,
  Trash2,
  Users,
  AlertCircle,
  FileText,
  RefreshCw,
  BookOpen,
  Database,
  ChevronDown,
  Check,
  Minus,
  Settings2,
  CheckCircle2,
  ChevronLeft,
  Activity,
  X,
  Cpu,
  Info,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Star,
  AlertTriangle,
  DollarSign,
} from "lucide-react";
import { findPolicyPackName } from "@/lib/policy-packs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutcomeContract } from "@shared/schema";
import { useIndustry, OUTCOME_TEMPLATES, INDUSTRIES, type OutcomeTemplate, type OutcomeTemplateKpi } from "@/components/industry-provider";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import type { IndustryId } from "@/components/industry-provider";
import type { LucideIcon } from "lucide-react";
import { useRole } from "@/components/role-provider";

interface PlatformIntelTool {
  proposedName: string;
  status: "exists" | "partial" | "missing";
  matchedTool?: { id: string; name: string; riskClassification?: string | null; serverId?: string | null } | null;
}

interface PlatformIntelAgent {
  id: string;
  name: string;
  status: string;
  healthScore: number;
  totalRuns: number;
  autonomyMode?: string;
  riskTier?: string;
}

interface PlatformIntelMatchedAgent {
  role: string;
  matches: PlatformIntelAgent[];
}

interface PlatformIntelTemplate {
  id: string;
  name: string;
  description?: string | null;
  complexity: string;
  estimatedTimeToProd: string;
  deploymentCount: number;
  industry?: string | null;
  category?: string | null;
  avgKpiDelivery?: number | null;
  defaultRiskTier?: string | null;
  complianceCertifications?: string[];
  tags?: string[];
  toolNames?: string[];
}

interface PlatformIntelPolicy {
  id: string;
  name: string;
  domain: string;
  description?: string | null;
  enforcementType?: string | null;
  scopeType?: string | null;
  policyPack?: string | null;
}

interface PlatformIntelResponse {
  matchedAgents: PlatformIntelMatchedAgent[];
  matchedTemplates: PlatformIntelTemplate[];
  toolCoverage: PlatformIntelTool[];
  matchedPolicies: PlatformIntelPolicy[];
  compositeRisk?: { level: string; rationale: string[] } | null;
  summary: {
    liveAgentMatchCount: number;
    templateCount: number;
    matchedPolicyCount: number;
    toolCoveragePercent: number;
    hasApprovalGapRisk?: boolean;
  };
}

interface ProcessFlowStep {
  id: string;
  description: string;
  actor: string;
  timeMins: number;
  painPoints: string;
  improvementIdeas: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ApplicablePolicy {
  policyId: string;
  name: string;
  domain: string;
  packName?: string;
  rationale: string;
}

interface OutcomeProposal {
  type: "outcome_proposal";
  outcomeContract: {
    name: string;
    description: string;
    riskTier: string;
    pricingModel: string;
    pricePerUnit: number;
    riskThreshold: number;
    maxDriftPercent: number;
    slaDescription?: string;
    approvalGates?: unknown[];
  };
  kpis: Array<{
    name: string;
    target: number;
    unit: string;
    measurement: string;
    currentBaseline: number | null;
  }>;
  proposedAgents?: Array<{
    name?: string;
    description?: string;
    role?: string;
    workflowSteps?: string[];
    tools?: string[];
    riskTier?: string;
    autonomyMode?: string;
    estimatedImpact?: string;
  }>;
  validationChecklist: string[];
  regulatoryConstraints?: RegulatoryConstraint[];
  applicablePolicies?: ApplicablePolicy[];
  roiEstimate?: {
    annualizedSavingsMin: number;
    annualizedSavingsMax: number;
    paybackPeriodMonths: number | null;
    assumptionsSummary: string;
  };
}

interface StarterPrompt {
  icon: LucideIcon;
  label: string;
  prompt: string;
}

const INDUSTRY_STARTER_PROMPTS: Record<IndustryId | "null", StarterPrompt[]> = {
  financial_services: [
    { icon: Target, label: "Accelerate KYC Onboarding", prompt: "Our KYC onboarding process takes an average of 5 business days. We want to reduce it to under 24 hours while maintaining full regulatory compliance with BSA/AML requirements." },
    { icon: Shield, label: "Reduce False Positive Alert Rate", prompt: "Our transaction monitoring system generates over 95% false positives. We need to reduce the false positive rate to under 30% while ensuring zero missed true positives for SAR filing." },
    { icon: BarChart3, label: "Improve Trade Settlement Accuracy", prompt: "Our trade settlement failure rate is 3.2%. We need to bring it below 0.5% and reduce settlement time from T+2 to T+1 for eligible instruments." },
    { icon: Zap, label: "Automate Regulatory Reporting", prompt: "We spend 400+ hours per quarter on regulatory report preparation for SEC and FINRA. We want to automate data aggregation, validation, and draft generation." },
  ],
  healthcare: [
    { icon: Target, label: "Reduce Prior Auth Turnaround", prompt: "Prior authorization requests take 3-5 business days on average. We want to bring turnaround under 4 hours for standard requests while maintaining clinical accuracy and payer compliance." },
    { icon: BarChart3, label: "Improve Clinical Documentation", prompt: "Our clinical documentation completeness score is at 72%. We need to improve it to 95%+ to meet CMS quality reporting requirements and reduce claim denials." },
    { icon: Zap, label: "Accelerate Revenue Cycle", prompt: "Our average days in accounts receivable is 45 days with a 12% denial rate. We want to reduce A/R days to under 30 and denial rate below 5%." },
    { icon: Shield, label: "Automate Quality Measure Reporting", prompt: "We're manually tracking HEDIS measures and CMS Star ratings across 15 measures. We need automated data collection, gap identification, and intervention recommendations." },
  ],
  manufacturing: [
    { icon: Target, label: "Improve OEE", prompt: "Our Overall Equipment Effectiveness is at 65%. We want to bring it above 85% by reducing unplanned downtime and optimizing changeover processes across 12 production lines." },
    { icon: BarChart3, label: "Reduce Scrap Rate", prompt: "Our first-pass yield is 91% with a 4.2% scrap rate. We need to achieve 97%+ first-pass yield and reduce scrap below 1.5% to meet ISO 9001 targets." },
    { icon: Zap, label: "Predictive Maintenance", prompt: "We experience an average of 8 unplanned equipment failures per month, each costing $15K-$50K. We want to predict 90%+ of failures at least 48 hours in advance." },
    { icon: Shield, label: "Automate Compliance Audits", prompt: "ISO 9001 and industry-specific compliance audits consume 300+ staff hours per quarter. We need automated evidence collection, gap analysis, and corrective action tracking." },
  ],
  insurance: [
    { icon: Target, label: "Accelerate Claims Processing", prompt: "Average claims processing takes 14 days. We want to achieve straight-through processing for 60%+ of standard claims with an average cycle time under 3 days." },
    { icon: BarChart3, label: "Improve Underwriting Accuracy", prompt: "Our loss ratio is 72% with an expense ratio of 35%. We need to improve risk selection accuracy and reduce the combined ratio below 98%." },
    { icon: Zap, label: "Automate Policy Administration", prompt: "Policy issuance and endorsement processing requires 45 minutes of manual work per transaction. We want to automate 80%+ of standard policy administration tasks." },
    { icon: Shield, label: "Regulatory Filing Automation", prompt: "We file with 15 state insurance departments quarterly. Rate filings, form filings, and market conduct reports consume 500+ hours per quarter." },
  ],
  retail: [
    { icon: Target, label: "Optimize Demand Forecasting", prompt: "Our demand forecast accuracy is 68% leading to 15% overstock and 8% stockout rates. We want to achieve 90%+ forecast accuracy and reduce inventory carrying costs by 25%." },
    { icon: BarChart3, label: "Personalize Customer Experience", prompt: "Our email marketing conversion rate is 1.2% with generic campaigns. We want to achieve 4%+ conversion through personalized recommendations and dynamic content." },
    { icon: Zap, label: "Automate Vendor Management", prompt: "We manage 200+ vendors with manual PO processing, compliance checks, and performance reviews. We want to automate 75%+ of routine vendor operations." },
    { icon: Shield, label: "PCI Compliance Automation", prompt: "PCI-DSS compliance monitoring and evidence collection requires 2 FTEs. We need automated scanning, gap detection, and remediation tracking." },
  ],
  technology_saas: [
    { icon: Target, label: "Autonomous Package Deployment", prompt: "We deploy 200+ software packages across 15,000 endpoints monthly. Manual packaging takes 4 hours per app and deployment failures are at 12%. We want to achieve 95% first-attempt deployment success with zero untested packages reaching production." },
    { icon: BarChart3, label: "Reduce Incident MTTR", prompt: "Our mean time to resolution for production incidents is 45 minutes with 30% requiring manual intervention. We want to achieve <15 minute MTTR with 70%+ auto-resolution rate." },
    { icon: Zap, label: "Automate SOC 2 Compliance", prompt: "SOC 2 evidence collection and control monitoring consumes 3 FTEs. We want to automate continuous monitoring, evidence collection, and gap remediation for all trust service criteria." },
    { icon: Shield, label: "API Security Posture Management", prompt: "We have 400+ APIs across microservices with inconsistent security practices. We want automated API discovery, vulnerability scanning, and policy enforcement with zero unmonitored endpoints." },
  ],
  custom: [
    { icon: Target, label: "Reduce customer churn", prompt: "Our customer churn rate is around 8% monthly and we want to bring it down to under 4%. We're a SaaS company with about 2,000 customers." },
    { icon: BarChart3, label: "Speed up support resolution", prompt: "Our customer support tickets take an average of 48 hours to resolve. We want to get that under 4 hours for common issues." },
    { icon: Workflow, label: "Automate compliance checks", prompt: "We spend about 200 hours per month on manual compliance document reviews. We need to automate this while keeping accuracy above 99%." },
    { icon: Lightbulb, label: "Improve lead qualification", prompt: "Our sales team wastes time on unqualified leads. We get about 500 leads a month but only 10% convert. We want to pre-qualify them automatically." },
  ],
  "null": [
    { icon: Target, label: "Reduce customer churn", prompt: "Our customer churn rate is around 8% monthly and we want to bring it down to under 4%. We're a SaaS company with about 2,000 customers." },
    { icon: BarChart3, label: "Speed up support resolution", prompt: "Our customer support tickets take an average of 48 hours to resolve. We want to get that under 4 hours for common issues." },
    { icon: Workflow, label: "Automate compliance checks", prompt: "We spend about 200 hours per month on manual compliance document reviews. We need to automate this while keeping accuracy above 99%." },
    { icon: Lightbulb, label: "Improve lead qualification", prompt: "Our sales team wastes time on unqualified leads. We get about 500 leads a month but only 10% convert. We want to pre-qualify them automatically." },
  ],
};

interface IndustryKpi {
  name: string;
  target: string;
  benchmark: string;
}

const INDUSTRY_KPI_LIBRARY: Record<string, IndustryKpi[]> = {
  financial_services: [
    { name: "SLA Adherence", target: "99.5%", benchmark: "98.2%" },
    { name: "False Positive Rate", target: "<30%", benchmark: "45%" },
    { name: "Straight-Through Processing Rate", target: "85%", benchmark: "72%" },
    { name: "Customer Onboarding Time", target: "<24h", benchmark: "3.2 days" },
    { name: "Regulatory Report Accuracy", target: "99.9%", benchmark: "97.5%" },
  ],
  healthcare: [
    { name: "HEDIS Compliance Rate", target: "95%", benchmark: "88%" },
    { name: "CMS Star Rating", target: "4.5", benchmark: "3.8" },
    { name: "30-Day Readmission Rate", target: "<10%", benchmark: "14.2%" },
    { name: "Claim Denial Rate", target: "<5%", benchmark: "11.8%" },
    { name: "Prior Auth Turnaround", target: "<4h", benchmark: "3.2 days" },
  ],
  manufacturing: [
    { name: "OEE", target: "85%", benchmark: "72%" },
    { name: "MTBF", target: "720h", benchmark: "480h" },
    { name: "MTTR", target: "<2h", benchmark: "4.5h" },
    { name: "First-Pass Yield", target: "97%", benchmark: "91.3%" },
    { name: "Scrap Rate", target: "<1.5%", benchmark: "4.2%" },
  ],
  insurance: [
    { name: "Claims Cycle Time", target: "<3 days", benchmark: "14 days" },
    { name: "Loss Ratio", target: "<65%", benchmark: "72%" },
    { name: "STP Rate", target: "60%", benchmark: "35%" },
    { name: "Combined Ratio", target: "<98%", benchmark: "107%" },
    { name: "Policyholder Retention", target: "92%", benchmark: "85%" },
  ],
  retail: [
    { name: "Forecast Accuracy", target: "90%", benchmark: "68%" },
    { name: "Stockout Rate", target: "<3%", benchmark: "8%" },
    { name: "Conversion Rate", target: "4%", benchmark: "1.2%" },
    { name: "Inventory Turnover", target: "12x", benchmark: "8x" },
    { name: "Customer Lifetime Value", target: "+25%", benchmark: "baseline" },
  ],
};

interface RegulatoryConstraint {
  regulation: string;
  classification: "Critical" | "High-Risk" | "Medium";
  requirements: string[];
  autoApplied: boolean;
}

const INDUSTRY_REGULATORY_CONSTRAINTS: Record<string, RegulatoryConstraint[]> = {
  financial_services: [
    { regulation: "BSA/AML", classification: "High-Risk", requirements: ["Transaction monitoring", "SAR filing automation", "Customer due diligence"], autoApplied: true },
    { regulation: "SOX Section 404", classification: "Critical", requirements: ["Audit trail immutability", "Access control segregation", "Financial data integrity"], autoApplied: true },
    { regulation: "PCI-DSS", classification: "High-Risk", requirements: ["Data encryption at rest/transit", "Access logging", "Vulnerability scanning"], autoApplied: true },
    { regulation: "EU AI Act", classification: "High-Risk", requirements: ["Human oversight capability", "Bias testing", "Transparency documentation"], autoApplied: false },
  ],
  healthcare: [
    { regulation: "HIPAA", classification: "Critical", requirements: ["PHI encryption", "Access audit trails", "Minimum necessary standard"], autoApplied: true },
    { regulation: "HITECH", classification: "High-Risk", requirements: ["Breach notification", "EHR interoperability", "Meaningful use compliance"], autoApplied: true },
    { regulation: "FDA 21 CFR Part 11", classification: "High-Risk", requirements: ["Electronic signature validation", "Audit trails", "Data integrity"], autoApplied: false },
    { regulation: "CMS Conditions of Participation", classification: "Medium", requirements: ["Quality reporting", "Patient safety protocols", "Care coordination"], autoApplied: true },
  ],
  manufacturing: [
    { regulation: "ISO 9001", classification: "High-Risk", requirements: ["Quality management documentation", "Corrective action tracking", "Management review records"], autoApplied: true },
    { regulation: "OSHA", classification: "Critical", requirements: ["Safety incident reporting", "Hazard communication", "PPE compliance tracking"], autoApplied: true },
    { regulation: "EPA Regulations", classification: "Medium", requirements: ["Emissions monitoring", "Waste disposal tracking", "Environmental impact reporting"], autoApplied: false },
  ],
  insurance: [
    { regulation: "State Insurance Regulations", classification: "Critical", requirements: ["Rate filing compliance", "Market conduct standards", "Claims handling requirements"], autoApplied: true },
    { regulation: "NAIC Model Laws", classification: "High-Risk", requirements: ["Solvency monitoring", "Unfair trade practices", "Producer licensing"], autoApplied: true },
    { regulation: "ACORD Standards", classification: "Medium", requirements: ["Data format compliance", "Transaction standards", "Interoperability requirements"], autoApplied: true },
  ],
  retail: [
    { regulation: "PCI-DSS", classification: "High-Risk", requirements: ["Cardholder data protection", "Network security", "Access control"], autoApplied: true },
    { regulation: "CCPA/CPRA", classification: "High-Risk", requirements: ["Data subject rights", "Privacy notices", "Opt-out mechanisms"], autoApplied: true },
    { regulation: "FTC Act", classification: "Medium", requirements: ["Advertising compliance", "Consumer protection", "Data security standards"], autoApplied: false },
  ],
};

function extractProposal(content: string): OutcomeProposal | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.type === "outcome_proposal") return parsed;
    return null;
  } catch {
    return null;
  }
}

function renderMessageContent(content: string, isStreaming?: boolean) {
  const completedJsonMatch = content.match(/```json\s*[\s\S]*?```/);

  if (completedJsonMatch) {
    const beforeJson = content.substring(0, completedJsonMatch.index).trim();
    const afterJson = content.substring((completedJsonMatch.index || 0) + completedJsonMatch[0].length).trim();

    return (
      <div className="flex flex-col gap-2">
        {beforeJson && <p className="whitespace-pre-wrap text-sm">{beforeJson}</p>}
        <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/20 flex-wrap">
          <CheckCircle className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Outcome proposal ready</span>
            <span className="text-xs text-muted-foreground">Review the details in the panel on the right, then click "Launch This Plan" when you're ready.</span>
          </div>
        </div>
        {afterJson && <p className="whitespace-pre-wrap text-sm">{afterJson}</p>}
      </div>
    );
  }

  const partialFenceMatch = content.match(/`{1,3}(?:j(?:s(?:o(?:n)?)?)?)?$/);
  const openFenceMatch = content.match(/```json/);

  if (openFenceMatch || partialFenceMatch) {
    const fenceStart = openFenceMatch
      ? openFenceMatch.index!
      : partialFenceMatch
        ? partialFenceMatch.index!
        : content.length;
    const beforeJson = content.substring(0, fenceStart).trim();

    return (
      <div className="flex flex-col gap-2">
        {beforeJson && <p className="whitespace-pre-wrap text-sm">{beforeJson}</p>}
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted border flex-wrap">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <span className="text-sm text-muted-foreground">Building your outcome proposal...</span>
        </div>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap text-sm">{content}</p>;
}


export default function OutcomeDiscover() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { industry } = useIndustry();
  const { isBusinessMode } = useRole();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(prev => prev + text);
  }, []);

  const voiceInput = useSpeechToText({
    onTranscript: handleVoiceTranscript,
  });
  const [streaming, setStreaming] = useState(false);
  const [proposal, setProposal] = useState<OutcomeProposal | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState<{ transcript: string; opportunities: Array<{ name: string; description: string; businessValue: string; keyRequirements: string[]; suggestedSystems: string[] }> } | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "record">("chat");
  const [processSteps, setProcessSteps] = useState<ProcessFlowStep[]>([]);
  const [showProcessFlow, setShowProcessFlow] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [enhancingOutcome, setEnhancingOutcome] = useState(false);
  const [generatingKpis, setGeneratingKpis] = useState(false);
  const [detectingRegulations, setDetectingRegulations] = useState(false);
  const [showKpiBenchmarks, setShowKpiBenchmarks] = useState(false);
  const [expandedRegulations, setExpandedRegulations] = useState<Set<number>>(new Set());
  const [activeRegConstraints, setActiveRegConstraints] = useState<RegulatoryConstraint[] | null>(null);
  const [activeApplicablePolicies, setActiveApplicablePolicies] = useState<ApplicablePolicy[]>([]);
  const [createdOutcome, setCreatedOutcome] = useState<OutcomeContract | null>(null);
  const [planRequested, setPlanRequested] = useState(false);
  const [builderMode, setBuilderMode] = useState<"ai" | "form">("ai");
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRiskTier, setFormRiskTier] = useState("MEDIUM");
  const [formPricingModel, setFormPricingModel] = useState("PER_OUTCOME_EVENT");
  const [formPricePerUnit, setFormPricePerUnit] = useState(0);
  const [formRiskThreshold, setFormRiskThreshold] = useState(0.8);
  const [formMaxDriftPercent, setFormMaxDriftPercent] = useState(10);
  const [formSlaDescription, setFormSlaDescription] = useState("");
  const [formKpis, setFormKpis] = useState<Array<{name: string; target: number; unit: string; baseline: number; slaThreshold: number; weight: number; targetOperator: string}>>([]);
  const [formCreatedOutcome, setFormCreatedOutcome] = useState<OutcomeContract | null>(null);
  const [formPlanRequested, setFormPlanRequested] = useState(false);
  const [selectedFormTemplate, setSelectedFormTemplate] = useState<OutcomeTemplate | null>(null);
  const [selectedLibTemplate, setSelectedLibTemplate] = useState<PlatformIntelTemplate | null>(null);
  const [platformIntel, setPlatformIntel] = useState<PlatformIntelResponse | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [showPlatformMatch, setShowPlatformMatch] = useState(true);
  const [showRealPolicies, setShowRealPolicies] = useState(true);
  const [showFormIntel, setShowFormIntel] = useState(true);
  const [showRoiEstimate, setShowRoiEstimate] = useState(true);
  const [agentDecisions, setAgentDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [templateDecisions, setTemplateDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const setAgentDecision = (id: string, decision: 'accepted' | 'rejected') =>
    setAgentDecisions(prev => { const n = { ...prev }; if (n[id] === decision) delete n[id]; else n[id] = decision; return n; });
  const setTemplateDecision = (id: string, decision: 'accepted' | 'rejected') =>
    setTemplateDecisions(prev => { const n = { ...prev }; if (n[id] === decision) delete n[id]; else n[id] = decision; return n; });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const pendingChunksRef = useRef<Blob[]>([]);

  const starterPrompts = INDUSTRY_STARTER_PROMPTS[(industry?.id ?? "null") as keyof typeof INDUSTRY_STARTER_PROMPTS] || INDUSTRY_STARTER_PROMPTS["null"];

  const industryKpis = industry && industry.id !== "custom" ? INDUSTRY_KPI_LIBRARY[industry.id] : null;
  const regulatoryConstraints = activeRegConstraints ?? (!proposal && industry && industry.id !== "custom" ? INDUSTRY_REGULATORY_CONSTRAINTS[industry.id] : null);

  const industryTemplates = OUTCOME_TEMPLATES.filter((t) => t.industry === industry?.id);
  const otherTemplates = OUTCOME_TEMPLATES.filter((t) => t.industry !== industry?.id);

  const industryLabel = (id: string) => {
    const labels: Record<string, string> = {
      financial_services: "Financial Services",
      insurance: "Insurance",
      healthcare: "Healthcare",
      manufacturing: "Manufacturing",
      retail: "Retail",
      technology_saas: "Technology / SaaS",
      custom: "Custom",
    };
    return labels[id] || id;
  };

  function selectTemplate(template: OutcomeTemplate) {
    setFormName(template.name);
    setFormDescription(template.description);
    setFormRiskTier(template.riskTier);
    setFormPricingModel(template.pricingModel);
    setFormPricePerUnit(template.pricePerUnit);
    setFormRiskThreshold(template.riskThreshold);
    setFormMaxDriftPercent(template.maxDriftPercent);
    setFormSlaDescription(template.slaDescription);
    setFormKpis(
      template.kpis.map((k: OutcomeTemplateKpi) => ({
        name: k.name,
        target: k.target,
        unit: k.unit,
        baseline: k.baseline ?? 0,
        slaThreshold: k.slaThreshold ?? 0,
        weight: k.weight ?? 1,
        targetOperator: (k as any).targetOperator ?? ">=",
      }))
    );
    setSelectedFormTemplate(template);
    setSelectedLibTemplate(null);
    setFormStep(2);
  }

  function addFormKpi() {
    setFormKpis([...formKpis, { name: "", target: 0, unit: "percent", baseline: 0, slaThreshold: 0, weight: 1, targetOperator: ">=" }]);
  }

  function removeFormKpi(index: number) {
    setFormKpis(formKpis.filter((_, i) => i !== index));
  }

  function updateFormKpi(index: number, field: string, value: string | number) {
    const updated = [...formKpis];
    if (field === "name" || field === "unit" || field === "targetOperator") {
      updated[index] = { ...updated[index], [field]: value as string };
    } else {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    }
    setFormKpis(updated);
  }

  const governancePolicies = industry?.defaultGovernancePolicies || [];
  const canProceedToReview = formName.trim().length > 0;

  const createFormOutcomeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        outcome: {
          name: formName,
          description: formDescription,
          riskTier: formRiskTier,
          pricingModel: formPricingModel,
          pricePerUnit: formPricePerUnit,
          riskThreshold: formRiskThreshold,
          maxDriftPercent: formMaxDriftPercent,
          ...(formSlaDescription ? { slaConfig: { slaDescription: formSlaDescription } } : {}),
          approvalGates: [],
        },
        kpis: formKpis.map((k) => ({
          name: k.name,
          target: typeof k.target === "number" ? k.target : (parseFloat(k.target as any) || 0),
          unit: k.unit || "count",
          baseline: typeof k.baseline === "number" ? k.baseline : (parseFloat(k.baseline as any) || 0),
          slaThreshold: typeof k.slaThreshold === "number" ? k.slaThreshold : (parseFloat(k.slaThreshold as any) || 0),
          weight: k.weight ?? 1.0,
          targetOperator: k.targetOperator || ">=",
        })),
        constraints: governancePolicies.map((p) => ({
          label: p.label,
          description: p.description,
        })),
      };
      const res = await apiRequest("POST", "/api/outcomes/with-kpis", payload);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      const outcomeId = data?.outcome?.id;
      if (outcomeId) {
        try {
          await apiRequest("PATCH", `/api/outcomes/${outcomeId}`, { status: "awaiting_agent_plan" });
          queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
        } catch {}
        setFormCreatedOutcome(data.outcome);
        setFormStep(3);
      }
      toast({ title: "Outcome contract created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch live platform intelligence when a proposal is generated
  useEffect(() => {
    if (!proposal) return;
    const agents = proposal.proposedAgents ?? [];
    const roles: string[] = agents.map((a) => a.role || a.name || "");
    const tools: string[] = agents.flatMap((a) => a.tools || []);
    const autonomy: string[] = agents.map((a) => a.autonomyMode || "supervised");
    const riskTiers: string[] = agents.map((a) => a.riskTier || "MEDIUM");
    const gateCount = Array.isArray(proposal.outcomeContract?.approvalGates)
      ? proposal.outcomeContract.approvalGates.length
      : 0;
    const params = new URLSearchParams({
      industry: industry?.id || "",
      proposedTools: tools.join(","),
      proposedAgentRoles: JSON.stringify(roles),
      autonomyModes: JSON.stringify(autonomy),
      riskTiers: JSON.stringify(riskTiers),
      proposedApprovalGatesCount: String(gateCount),
    });
    setLoadingIntel(true);
    fetch(`/api/outcomes/intelligence?${params}`)
      .then((r) => r.json())
      .then((data) => { setPlatformIntel(data); setLoadingIntel(false); })
      .catch(() => setLoadingIntel(false));
  }, [proposal, industry?.id]);

  // Quick Create form intel query — use template industry with fallback to platform industry
  const formIntelIndustry = selectedLibTemplate?.industry || selectedFormTemplate?.industry || industry?.id || "cross_industry";
  const formIntelRoles: string[] = (() => {
    const src = selectedLibTemplate
      ? [selectedLibTemplate.name]
      : selectedFormTemplate
      ? [
          ...(selectedFormTemplate.subVertical ? [selectedFormTemplate.subVertical] : []),
          selectedFormTemplate.name,
        ]
      : [];
    return src.flatMap((s) => s.split(/[&/,]+/).map((p) => p.trim()).filter(Boolean)).slice(0, 4);
  })();
  const formIntelIndustryProfile = INDUSTRIES.find((i) => i.id === formIntelIndustry);
  // Tool names: DB lib template toolNames → static template tools config → industry integration systems
  const formIntelTools: string[] = (() => {
    if (selectedLibTemplate?.toolNames?.length) {
      return selectedLibTemplate.toolNames.filter(Boolean) as string[];
    }
    if (selectedFormTemplate?.tools?.length) {
      return selectedFormTemplate.tools;
    }
    return (formIntelIndustryProfile?.integrationSystems || industry?.integrationSystems || []).slice(0, 6).map((s) => s.name);
  })();
  // Autonomy mode: DB lib template complexity → static template complexity → risk-tier heuristic
  const formIntelAutonomy: string[] = (() => {
    const complexity = selectedLibTemplate?.complexity || selectedFormTemplate?.complexity;
    if (complexity) {
      const c = complexity.toLowerCase();
      if (c === "complex") return ["fully_autonomous"];
      if (c === "moderate") return ["assisted"];
      return ["supervised"];
    }
    const t = formRiskTier || selectedFormTemplate?.riskTier || "MEDIUM";
    if (t === "CRITICAL" || t === "HIGH") return ["fully_autonomous"];
    if (t === "MEDIUM") return ["assisted"];
    return ["supervised"];
  })();
  const formIntelRiskTiers = [formRiskTier || selectedFormTemplate?.riskTier || "MEDIUM"];
  // Approval gate count: DB lib template certs → static template certs → risk-tier heuristic
  const formIntelGateCount: string = (() => {
    const certs = selectedLibTemplate?.complianceCertifications ?? selectedFormTemplate?.complianceCertifications;
    if (certs !== undefined) return String(certs.length);
    const t = formRiskTier || selectedFormTemplate?.riskTier || "MEDIUM";
    if (t === "CRITICAL") return "2";
    if (t === "HIGH") return "1";
    return "0";
  })();
  const { data: formIntel, isPending: formIntelPending, isError: formIntelError } = useQuery<PlatformIntelResponse>({
    queryKey: ["/api/outcomes/intelligence/form", formIntelIndustry, formIntelRoles.join(","), formIntelRiskTiers[0], formIntelTools.join(","), formIntelAutonomy[0], formIntelGateCount],
    queryFn: async () => {
      const params = new URLSearchParams({ industry: formIntelIndustry });
      if (formIntelRoles.length > 0) params.set("proposedAgentRoles", JSON.stringify(formIntelRoles));
      if (formIntelTools.length > 0) params.set("proposedTools", formIntelTools.join(","));
      params.set("autonomyModes", JSON.stringify(formIntelAutonomy));
      params.set("riskTiers", JSON.stringify(formIntelRiskTiers));
      params.set("proposedApprovalGatesCount", formIntelGateCount);
      const r = await fetch(`/api/outcomes/intelligence?${params}`);
      if (!r.ok) throw new Error("Failed to fetch form intel");
      return r.json();
    },
    enabled: builderMode === "form",
  });

  const createOutcomeMutation = useMutation({
    mutationFn: async (data: any) => {
      const kpis = (proposal?.kpis || []).map((k: any) => {
        const target = typeof k.target === "number" ? k.target : (parseFloat(k.target) || 0);
        return {
          name: k.name,
          target,
          unit: k.unit || "count",
          baseline: k.currentBaseline ?? 0,
          slaThreshold: target * 0.9,
          weight: 1.0,
          measurement: k.measurement ?? "",
        };
      });
      const governanceConstraints = industry?.defaultGovernancePolicies || [];
      const res = await apiRequest("POST", "/api/outcomes/with-kpis", {
        outcome: data,
        kpis,
        constraints: governanceConstraints.length > 0 ? governanceConstraints : undefined,
      });
      const result = await res.json();
      const outcome = result.outcome;
      // Collect all accepted agents and templates from decisions
      const acceptedAgentIds = Object.entries(agentDecisions).filter(([, d]) => d === 'accepted').map(([id]) => id);
      const acceptedTemplateIds = Object.entries(templateDecisions).filter(([, d]) => d === 'accepted').map(([id]) => id);
      const allAgentMatches = platformIntel?.matchedAgents.flatMap(r => r.matches) ?? [];
      const acceptedAgentObjects = allAgentMatches.filter(a => acceptedAgentIds.includes(a.id));
      const acceptedTemplateObjects = (platformIntel?.matchedTemplates ?? []).filter(t => acceptedTemplateIds.includes(t.id));

      // Compute readiness score for evidence
      const hasKpisE = (proposal?.kpis?.length ?? 0) > 0;
      const hasRiskTierE = !!data.riskTier;
      const hasPoliciesE = (platformIntel?.summary?.matchedPolicyCount ?? 0) > 0;
      const hasApprovalGatesE = !platformIntel?.summary?.hasApprovalGapRisk;
      const hasDriftDefE = !!data.maxDriftPercent;
      const readinessScoreE = (hasKpisE ? 20 : 0) + (hasRiskTierE ? 15 : 0) + (hasPoliciesE ? 25 : 0) + (hasApprovalGatesE ? 15 : 0) + (hasDriftDefE ? 10 : 0) + 15;

      await apiRequest("POST", "/api/approvals", {
        type: "outcome_review",
        objectType: "outcome_contract",
        objectId: outcome.id,
        objectName: outcome.name,
        riskScore: data.riskTier === "HIGH" ? 8 : data.riskTier === "MEDIUM" ? 5 : 3,
        requestedBy: "system",
        status: "pending",
        evidencePackage: {
          proposedKpis: proposal?.kpis || [],
          proposedAgents: proposal?.proposedAgents || [],
          validationChecklist: proposal?.validationChecklist || [],
          regulatoryConstraints: activeRegConstraints || [],
          applicablePolicies: activeApplicablePolicies,
          outcomeContract: data,
          discoveryConversation: messages.length,
          createdKpis: result.kpis?.length || 0,
          // Platform intelligence — carried forward from proposal stage
          compositeRisk: platformIntel?.compositeRisk || null,
          matchedPolicies: platformIntel?.matchedPolicies || [],
          toolCoverage: platformIntel?.toolCoverage || [],
          governanceReadinessScore: readinessScoreE,
          // Agent / template decisions — only accepted carry to Agent Map
          acceptedAgentMatches: acceptedAgentObjects,
          acceptedTemplateMatches: acceptedTemplateObjects,
          rejectedAgentIds: Object.entries(agentDecisions).filter(([, d]) => d === 'rejected').map(([id]) => id),
          rejectedTemplateIds: Object.entries(templateDecisions).filter(([, d]) => d === 'rejected').map(([id]) => id),
        },
      });
      return outcome;
    },
    onSuccess: async (outcome: OutcomeContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setCreatedOutcome(outcome);
      toast({ title: "Plan created", description: `"${outcome.name}" has been created with success metrics.` });
      try {
        await apiRequest("PATCH", `/api/outcomes/${outcome.id}`, { status: "awaiting_agent_plan" });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      } catch {}
      // Assign ALL accepted live agents to the outcome
      const acceptedIds = Object.entries(agentDecisions).filter(([, d]) => d === 'accepted').map(([id]) => id);
      for (const agentId of acceptedIds) {
        try {
          await apiRequest("PATCH", `/api/agents/${agentId}`, { outcomeId: outcome.id });
        } catch { /* non-fatal */ }
      }
      if (acceptedIds.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
        toast({ title: `${acceptedIds.length} agent${acceptedIds.length > 1 ? "s" : ""} assigned`, description: `Accepted agents bound to outcome "${outcome.name}"` });
      }
      // Navigate to agent map seeded with first accepted template
      const firstAcceptedTemplate = Object.entries(templateDecisions).find(([, d]) => d === 'accepted')?.[0];
      if (firstAcceptedTemplate) {
        navigate(`/outcomes/${outcome.id}?tab=agent-map&template=${firstAcceptedTemplate}`);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    try {
      const discoveryContext: Record<string, unknown> = {};
      if (processSteps.length > 0) {
        discoveryContext.processSteps = processSteps;
      }
      if (transcriptResult) {
        discoveryContext.transcriptAnalysis = transcriptResult;
      }
      if (proposal) {
        discoveryContext.currentProposal = proposal;
      }

      const res = await fetch("/api/ai/outcome-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          industry: industry || undefined,
          discoveryContext: Object.keys(discoveryContext).length > 0 ? discoveryContext : undefined,
        }),
      });

      if (!res.ok) throw new Error("Discovery request failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let sseBuffer = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Accumulate into a buffer so partial lines across TCP chunks are rejoined
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer for the next read
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break outer;
            if (data.content) {
              assistantContent += data.content;
              const currentContent = assistantContent;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: currentContent };
                return updated;
              });
            }
          } catch {}
        }
      }

      const extracted = extractProposal(assistantContent);
      if (extracted) {
        extracted.regulatoryConstraints = extracted.regulatoryConstraints ?? [];
        extracted.applicablePolicies = extracted.applicablePolicies ?? [];
        setProposal(extracted);
        setCheckedItems(new Set());
        setActiveRegConstraints(extracted.regulatoryConstraints);
        setActiveApplicablePolicies(extracted.applicablePolicies);
        setExpandedRegulations(new Set());
        // Auto-detect regulations in the background — only when industry context is set
        if (extracted.outcomeContract?.description && industry?.id) {
          setDetectingRegulations(true);
          fetch("/api/ai/regulatory-constraints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: extracted.outcomeContract.description,
              industry: industry?.id || null,
            }),
          })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((data: Array<{ regulation: string; classification?: string; requirements?: string[]; autoApplied?: boolean }>) => {
              if (Array.isArray(data) && data.length > 0) {
                setActiveRegConstraints(data.map(d => ({
                  regulation: d.regulation || "Unknown",
                  classification: (d.classification as RegulatoryConstraint["classification"]) || "High-Risk",
                  requirements: d.requirements || [],
                  autoApplied: d.autoApplied ?? true,
                })));
              }
            })
            .catch(() => {})
            .finally(() => setDetectingRegulations(false));
        }
      }
    } catch (err) {
      toast({ title: "Discovery assistant error", description: "Please try again.", variant: "destructive" });
    } finally {
      setStreaming(false);
    }
  }

  function handleAcceptProposal() {
    if (!proposal) return;
    // Collect matched policy IDs from both platform intelligence and AI-selected applicable policies
    const intelPolicyIds = (platformIntel?.matchedPolicies || []).map((p) => p.id).filter(Boolean);
    const aiPolicyIds = (activeApplicablePolicies || []).map((p) => p.policyId).filter(Boolean);
    const matchedPolicyIds = [...new Set([...intelPolicyIds, ...aiPolicyIds])];
    createOutcomeMutation.mutate({
      name: proposal.outcomeContract.name,
      description: proposal.outcomeContract.description,
      riskTier: proposal.outcomeContract.riskTier,
      pricingModel: proposal.outcomeContract.pricingModel,
      pricePerUnit: proposal.outcomeContract.pricePerUnit,
      riskThreshold: proposal.outcomeContract.riskThreshold,
      maxDriftPercent: proposal.outcomeContract.maxDriftPercent,
      approvalGates: proposal.outcomeContract.approvalGates ?? [],
      slaConfig: (() => {
        const base = (proposal.outcomeContract as any).slaConfig ?? {};
        const withSla = proposal.outcomeContract.slaDescription
          ? { ...base, slaDescription: proposal.outcomeContract.slaDescription }
          : base;
        return processSteps.length > 0
          ? { ...withSla, processFlow: processSteps }
          : (Object.keys(withSla).length > 0 ? withSla : undefined);
      })(),
      ...(proposal.roiEstimate ? { roiEstimate: proposal.roiEstimate } : {}),
      ...(matchedPolicyIds.length > 0 ? { matchedPolicyIds } : {}),
      ...(activeApplicablePolicies.length > 0 ? { discoveryPolicies: activeApplicablePolicies } : {}),
    });
  }

  function toggleCheckItem(idx: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleRegulation(idx: number) {
    setExpandedRegulations((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleEnhanceOutcome() {
    if (!proposal || enhancingOutcome) return;
    setEnhancingOutcome(true);
    try {
      const res = await fetch("/api/ai/enhance-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      if (!res.ok) throw new Error("Enhancement failed");
      const data = await res.json();
      setProposal((prev) => prev ? { ...prev, outcomeContract: { ...prev.outcomeContract, ...data } } : prev);
      toast({ title: "Outcome enhanced", description: "AI has improved the outcome contract." });
    } catch (err: any) {
      toast({ title: "Enhancement failed", description: err.message || "Could not enhance outcome.", variant: "destructive" });
    } finally {
      setEnhancingOutcome(false);
    }
  }

  async function handleGenerateKpis() {
    if (!proposal || generatingKpis) return;
    setGeneratingKpis(true);
    try {
      const res = await fetch("/api/ai/generate-kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: proposal.outcomeContract.name,
          description: proposal.outcomeContract.description,
          industry: industry?.id || null,
        }),
      });
      if (!res.ok) throw new Error("KPI generation failed");
      const data = await res.json();
      setProposal((prev) => prev ? { ...prev, kpis: data.kpis || data } : prev);
      toast({ title: "KPIs generated", description: "AI has generated success metrics." });
    } catch (err: any) {
      toast({ title: "KPI generation failed", description: err.message || "Could not generate KPIs.", variant: "destructive" });
    } finally {
      setGeneratingKpis(false);
    }
  }

  function removeRegConstraint(idx: number) {
    const base = regulatoryConstraints || [];
    setActiveRegConstraints(base.filter((_, i) => i !== idx));
    setExpandedRegulations(prev => {
      const next = new Set<number>();
      prev.forEach(n => { if (n < idx) next.add(n); else if (n > idx) next.add(n - 1); });
      return next;
    });
  }

  async function handleDetectRegulations() {
    if (!proposal || detectingRegulations) return;
    setDetectingRegulations(true);
    try {
      const res = await fetch("/api/ai/regulatory-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: proposal.outcomeContract.description,
          industry: industry?.id || null,
        }),
      });
      if (!res.ok) throw new Error("Regulatory detection failed");
      const data: Array<{ regulation: string; classification?: string; requirements?: string[]; autoApplied?: boolean }> = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: RegulatoryConstraint[] = data.map(d => ({
          regulation: d.regulation || "Unknown",
          classification: (d.classification as RegulatoryConstraint["classification"]) || "High-Risk",
          requirements: d.requirements || [],
          autoApplied: d.autoApplied ?? true,
        }));
        setActiveRegConstraints(mapped);
        setExpandedRegulations(new Set());
        toast({ title: "Regulations updated", description: `Detected ${mapped.length} regulation${mapped.length !== 1 ? "s" : ""} specific to this outcome.` });
      } else {
        toast({ title: "No regulations detected", description: "No specific regulations found for this outcome. Try refining the outcome description.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Detection failed", description: err.message || "Could not detect regulations.", variant: "destructive" });
    } finally {
      setDetectingRegulations(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      pendingChunksRef.current = chunks;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const finalChunks = [...chunks];
        setAudioChunks(finalChunks);
        stream.getTracks().forEach(track => track.stop());
        analyzeChunks(finalChunks);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      setTranscriptResult(null);
      setAnalysisFailed(false);
      setLiveTranscript("");
      setInterimText("");

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        let active = true;

        let processedUpTo = 0;
        recognition.onresult = (event: any) => {
          let newFinalText = "";
          let interim = "";
          for (let i = processedUpTo; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              newFinalText += result[0].transcript + " ";
              processedUpTo = i + 1;
            } else {
              interim += result[0].transcript;
            }
          }
          if (newFinalText) {
            setLiveTranscript(prev => prev + newFinalText);
          }
          setInterimText(interim);
        };

        recognition.onerror = () => {};
        recognition.onend = () => {
          if (active && speechRecognitionRef.current) {
            try { speechRecognitionRef.current.start(); } catch {}
          }
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
        (recognition as any)._activeFlag = () => active;
        (recognition as any)._deactivate = () => { active = false; };
      }
    } catch (err) {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to record meetings.", variant: "destructive" });
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (speechRecognitionRef.current) {
        const ref = speechRecognitionRef.current;
        if (ref._deactivate) ref._deactivate();
        speechRecognitionRef.current = null;
        try { ref.stop(); } catch {}
      }
      setInterimText("");
    }
  }

  async function analyzeChunks(chunks: Blob[]) {
    if (chunks.length === 0) return;
    setAnalyzing(true);
    setAnalysisFailed(false);
    try {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const res = await fetch("/api/ai/transcribe-analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = "Analysis failed";
        try { errMsg = JSON.parse(errText).error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const result = await res.json();
      setTranscriptResult(result);
      toast({ title: "Analysis complete", description: `Found ${result.opportunities.length} automation opportunities.` });
    } catch (err: any) {
      setAnalysisFailed(true);
      toast({ title: "Analysis failed", description: err.message || "Could not analyze the recording. Please try again.", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function useOpportunityForDiscovery(opp: { name: string; description: string; keyRequirements: string[] }) {
    const processContext = processSteps.length > 0
      ? ` Current process has ${processSteps.length} steps: ${processSteps.map((s, i) => `Step ${i + 1}: ${s.description} (${s.actor}, ${s.timeMins} mins, Pain: ${s.painPoints})`).join("; ")}.`
      : "";
    const prompt = `I want to automate: ${opp.name}. ${opp.description}. Key requirements include: ${opp.keyRequirements.join(", ")}.${processContext} Please help me define an outcome contract for this.`;
    setActiveTab("chat");
    sendMessage(prompt);
  }

  function addProcessStep() {
    setProcessSteps(prev => [...prev, {
      id: `step_${Date.now()}`,
      description: "",
      actor: "",
      timeMins: 0,
      painPoints: "",
      improvementIdeas: "",
    }]);
  }

  function updateProcessStep(id: string, field: keyof ProcessFlowStep, value: string | number) {
    setProcessSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function removeProcessStep(id: string) {
    setProcessSteps(prev => prev.filter(s => s.id !== id));
  }

  const totalProcessTime = processSteps.reduce((sum, s) => sum + s.timeMins, 0);

  const allChecked = proposal ? checkedItems.size === (proposal.validationChecklist?.length || 0) : false;

  return (
    <div className="flex flex-col h-full" data-testid="page-outcome-discover">
      <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0 flex-wrap bg-gradient-to-r from-primary/[0.03] to-transparent">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/15 to-violet-500/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col gap-0">
          <h2 className="text-sm font-semibold tracking-tight">Outcome Builder</h2>
          <span className="text-[11px] text-muted-foreground">Define goals, KPIs, and agent requirements</span>
        </div>
        {builderMode === "ai" && proposal && <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400 border-green-500/30">Proposal Ready</Badge>}
        <div className="flex-1" />
        <div className="flex items-center border rounded-lg overflow-hidden bg-muted/30">
          <Button
            variant={builderMode === "ai" ? "default" : "ghost"}
            size="sm"
            className="rounded-none text-xs"
            onClick={() => setBuilderMode("ai")}
            data-testid="button-mode-ai"
          >
            <Sparkles className="w-3 h-3 mr-1" /> AI Assistant
          </Button>
          <Button
            variant={builderMode === "form" ? "default" : "ghost"}
            size="sm"
            className="rounded-none text-xs"
            onClick={() => setBuilderMode("form")}
            data-testid="button-mode-form"
          >
            <FileText className="w-3 h-3 mr-1" /> Quick Create
          </Button>
        </div>
      </div>

      {builderMode === "form" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-center gap-0" data-testid="form-steps">
              {[
                { num: 1, label: "Template", icon: FileText },
                { num: 2, label: "Configure", icon: Settings2 },
                { num: 3, label: "Handoff", icon: Bot },
              ].map((s, i) => (
                <div key={s.num} className="flex items-center gap-0">
                  {i > 0 && (
                    <div className={`w-12 h-0.5 ${formStep > i ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-border"}`} />
                  )}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      formStep > s.num
                        ? "bg-emerald-500/10 border-emerald-500/40"
                        : formStep === s.num
                          ? "bg-primary/10 border-primary/40 shadow-sm shadow-primary/10"
                          : "bg-muted/30 border-border"
                    }`}>
                      {formStep > s.num ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <s.icon className={`w-4 h-4 ${formStep === s.num ? "text-primary" : "text-muted-foreground/50"}`} />
                      )}
                    </div>
                    <span className={`text-[11px] ${formStep === s.num ? "font-semibold text-foreground" : formStep > s.num ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground/60"}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {formStep === 1 && (
              <div className="flex flex-col gap-4" data-testid="form-step-template">
                <Card className="hover-elevate cursor-pointer" onClick={() => { setFormName(""); setFormDescription(""); setSelectedFormTemplate(null); setSelectedLibTemplate(null); setFormStep(2); }} data-testid="card-form-blank">
                  <CardContent className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/[0.03] to-transparent border-l-2 border-l-primary/30">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Target className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Blank Contract</p>
                      <p className="text-sm text-muted-foreground">Start from scratch with an empty outcome contract</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>

                {industryTemplates.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-primary" />
                      <p className="text-sm font-semibold">{industry?.label} Templates</p>
                      <Badge variant="outline" className="text-[10px]">{industryTemplates.length}</Badge>
                    </div>
                    {industryTemplates.map((t) => (
                      <Card key={t.id} className="hover-elevate cursor-pointer" onClick={() => selectTemplate(t)} data-testid={`card-form-template-${t.id}`}>
                        <CardContent className="flex items-start gap-3 p-4">
                          <div className="flex-1 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{t.name}</p>
                              <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">Recommended</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-xs">{industryLabel(t.industry)}</Badge>
                              <Badge variant="outline" className="text-xs">{t.riskTier}</Badge>
                              <Badge variant="outline" className="text-xs">{t.kpis.length} KPIs</Badge>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {otherTemplates.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">Other Templates</p>
                      <Badge variant="outline" className="text-[10px]">{otherTemplates.length}</Badge>
                    </div>
                    {otherTemplates.map((t) => (
                      <Card key={t.id} className="hover-elevate cursor-pointer" onClick={() => selectTemplate(t)} data-testid={`card-form-template-${t.id}`}>
                        <CardContent className="flex items-start gap-3 p-4">
                          <div className="flex-1 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{t.name}</p>
                              <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">Recommended</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-xs">{industryLabel(t.industry)}</Badge>
                              <Badge variant="outline" className="text-xs">{t.riskTier}</Badge>
                              <Badge variant="outline" className="text-xs">{t.kpis.length} KPIs</Badge>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {(() => {
                  const staticNames = new Set(OUTCOME_TEMPLATES.map((t) => t.name.toLowerCase().trim()));
                  const libTemplates = (formIntel?.matchedTemplates || []).filter(
                    (t) => !staticNames.has(t.name.toLowerCase().trim())
                  );
                  if (libTemplates.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full bg-violet-500/60" />
                        <p className="text-sm font-medium">From Library</p>
                        <Badge variant="outline" className="text-[10px]">{libTemplates.length}</Badge>
                      </div>
                      {libTemplates.map((t) => (
                        <Card
                          key={t.id}
                          className="hover-elevate cursor-pointer"
                          onClick={() => {
                            setFormName(t.name);
                            setFormDescription(t.description || "");
                            setFormRiskTier(t.defaultRiskTier || "MEDIUM");
                            setSelectedFormTemplate(null);
                            setSelectedLibTemplate(t);
                            setFormStep(2);
                          }}
                          data-testid={`card-form-lib-template-${t.id}`}
                        >
                          <CardContent className="flex items-start gap-3 p-4">
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium">{t.name}</p>
                                <Badge variant="outline" className="text-[9px] border-violet-500/40 text-violet-600 dark:text-violet-400">From Library</Badge>
                              </div>
                              {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {t.industry && <Badge variant="outline" className="text-xs">{industryLabel(t.industry)}</Badge>}
                                {t.defaultRiskTier && <Badge variant="outline" className="text-xs">{t.defaultRiskTier}</Badge>}
                                {t.complexity && <Badge variant="outline" className="text-xs capitalize">{t.complexity}</Badge>}
                                {t.deploymentCount > 0 && (
                                  <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/40">{t.deploymentCount} deploys</Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {formStep === 2 && !formCreatedOutcome && (
              <div className="flex flex-col gap-5" data-testid="form-step-configure">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <Target className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <p className="text-sm font-semibold">Outcome Details</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="form-name">Name</Label>
                      <Input id="form-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Outcome name" data-testid="input-form-name" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="form-description">Description</Label>
                      <Textarea id="form-description" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe the outcome..." data-testid="input-form-description" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Risk Tier</Label>
                        <Select value={formRiskTier} onValueChange={setFormRiskTier}>
                          <SelectTrigger data-testid="select-form-risk-tier"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LOW">LOW</SelectItem>
                            <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                            <SelectItem value="HIGH">HIGH</SelectItem>
                            <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="form-risk-threshold">Risk Threshold</Label>
                        <Input id="form-risk-threshold" type="number" step="0.01" value={formRiskThreshold} onChange={(e) => setFormRiskThreshold(Number(e.target.value) || 0)} data-testid="input-form-risk-threshold" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="form-max-drift">Max Drift %</Label>
                        <Input id="form-max-drift" type="number" value={formMaxDriftPercent} onChange={(e) => setFormMaxDriftPercent(Number(e.target.value) || 0)} data-testid="input-form-max-drift" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="form-sla-desc">SLA Description</Label>
                      <Textarea id="form-sla-desc" value={formSlaDescription} onChange={(e) => setFormSlaDescription(e.target.value)} placeholder="Describe the SLA commitment — e.g. 99.5% uptime with 15-minute response time..." rows={2} data-testid="input-form-sla" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold">KPIs</p>
                      <Badge variant="outline" className="text-xs">{formKpis.length}</Badge>
                    </div>
                    <Button size="sm" variant="outline" onClick={addFormKpi} data-testid="button-form-add-kpi">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add KPI
                    </Button>
                  </div>
                  {formKpis.length === 0 && <p className="text-sm text-muted-foreground">No KPIs configured yet. Add one to get started.</p>}
                  {formKpis.map((kpi, i) => (
                    <div key={i} className="grid grid-cols-[1fr_90px_80px_80px_auto] gap-2 items-end bg-muted/30 rounded-md p-2" data-testid={`form-kpi-row-${i}`}>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input value={kpi.name} onChange={(e) => updateFormKpi(i, "name", e.target.value)} placeholder="KPI name" data-testid={`input-form-kpi-name-${i}`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Operator</Label>
                        <Select value={kpi.targetOperator} onValueChange={(v) => updateFormKpi(i, "targetOperator", v)}>
                          <SelectTrigger data-testid={`select-form-kpi-operator-${i}`} className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value=">">{">"} Greater than</SelectItem>
                            <SelectItem value=">=">{"≥"} Greater or equal</SelectItem>
                            <SelectItem value="<">{"<"} Less than</SelectItem>
                            <SelectItem value="<=">{"≤"} Less or equal</SelectItem>
                            <SelectItem value="=">{"="} Equal to</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Target</Label>
                        <Input type="number" value={kpi.target} onChange={(e) => updateFormKpi(i, "target", e.target.value)} data-testid={`input-form-kpi-target-${i}`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Unit</Label>
                        <Input value={kpi.unit} onChange={(e) => updateFormKpi(i, "unit", e.target.value)} data-testid={`input-form-kpi-unit-${i}`} />
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeFormKpi(i)} data-testid={`button-form-remove-kpi-${i}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                {governancePolicies.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                        <Shield className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <p className="text-sm font-semibold">Governance Constraints</p>
                      <Badge variant="outline" className="text-xs">{governancePolicies.length}</Badge>
                    </div>
                    {governancePolicies.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 bg-muted/30 rounded-md p-2" data-testid={`form-constraint-${i}`}>
                        <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm font-medium">{p.label}</p>
                          <p className="text-xs text-muted-foreground">{p.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                    <p className="text-sm font-semibold">Contract Model</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Pricing Model</Label>
                      <Select value={formPricingModel} onValueChange={setFormPricingModel}>
                        <SelectTrigger data-testid="select-form-pricing-model"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PER_OUTCOME_EVENT">Per Outcome Event</SelectItem>
                          <SelectItem value="FIXED_MONTHLY">Fixed Monthly</SelectItem>
                          <SelectItem value="TIERED">Tiered</SelectItem>
                          <SelectItem value="USAGE_BASED">Usage Based</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="form-price">Price per Unit</Label>
                      <Input id="form-price" type="number" step="0.01" value={formPricePerUnit} onChange={(e) => setFormPricePerUnit(Number(e.target.value) || 0)} data-testid="input-form-price" />
                    </div>
                  </div>
                </div>

                {/* Platform Intelligence Hint Panel (collapsible, Quick Create Step 2) */}
                {(formIntel || formIntelPending || formIntelError) && (
                  <div className="flex flex-col rounded-lg border border-primary/20 bg-primary/5 overflow-hidden" data-testid="form-intel-panel">
                    <button
                      type="button"
                      onClick={() => setShowFormIntel(!showFormIntel)}
                      className="flex items-center justify-between gap-2 p-3 w-full hover:bg-primary/5 transition-colors"
                      data-testid="button-toggle-form-intel"
                    >
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-primary">Platform Intelligence</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(formIntel?.summary?.liveAgentMatchCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">{formIntel!.summary.liveAgentMatchCount} live agents</Badge>
                        )}
                        {(formIntel?.summary?.templateCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">{formIntel!.summary.templateCount} templates</Badge>
                        )}
                        {(formIntel?.summary?.matchedPolicyCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">{formIntel!.summary.matchedPolicyCount} policies</Badge>
                        )}
                        <ChevronDown className={`w-3.5 h-3.5 text-primary transition-transform ${showFormIntel ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {showFormIntel && (
                    <div className="flex flex-col gap-2 px-3 pb-3">
                    {formIntelPending && !formIntel && (
                      <div className="flex flex-col gap-1.5 animate-pulse" data-testid="form-intel-loading">
                        <div className="h-3 w-24 bg-muted rounded" />
                        <div className="h-8 w-full bg-muted/50 rounded" />
                        <div className="h-3 w-20 bg-muted rounded mt-0.5" />
                        <div className="h-8 w-full bg-muted/50 rounded" />
                      </div>
                    )}
                    {formIntelError && !formIntelPending && !formIntel && (
                      <div className="flex items-center gap-2 p-2 rounded bg-background/30 text-muted-foreground/70" data-testid="form-intel-error">
                        <Cpu className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] italic">Platform intelligence unavailable — signals will appear once workspace data loads.</span>
                      </div>
                    )}
                    {formIntel && formIntel.matchedAgents.some((r) => r.matches.length > 0) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Live Agents</span>
                        <div className="flex flex-col gap-1">
                          {formIntel.matchedAgents.filter((r) => r.matches.length > 0).flatMap((r) =>
                            r.matches.slice(0, 1).map((a) => (
                              <div key={a.id} className="flex items-center gap-2 p-1.5 rounded bg-background/50" data-testid={`form-intel-agent-${a.id}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${a.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                <span className="text-[11px] font-medium truncate flex-1">{a.name}</span>
                                <span className="text-[10px] text-muted-foreground">{a.healthScore}/100</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                    {formIntel && formIntel.matchedTemplates.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Matching Templates</span>
                        <div className="flex flex-wrap gap-1.5">
                          {formIntel.matchedTemplates.slice(0, 3).map((t) => (
                            <span key={t.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-background/50" data-testid={`form-intel-template-${t.id}`}>
                              <span className="truncate max-w-[100px]">{t.name}</span>
                              {t.defaultRiskTier && (
                                <span className={`text-[9px] font-semibold px-1 rounded ${t.defaultRiskTier === "HIGH" || t.defaultRiskTier === "CRITICAL" ? "text-red-600 dark:text-red-400" : t.defaultRiskTier === "MEDIUM" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{t.defaultRiskTier}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {formIntel && formIntel.matchedPolicies.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Matched Policies</span>
                        <div className="flex flex-wrap gap-1">
                          {formIntel.matchedPolicies.slice(0, 4).map((p) => (
                            <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-primary truncate max-w-[140px]" data-testid={`form-intel-policy-${p.id}`}>{p.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {formIntel && formIntel.toolCoverage.length > 0 && (
                      <div className="flex flex-col gap-1" data-testid="form-intel-tool-coverage">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Tool Coverage</span>
                          <span className="text-[9px] text-muted-foreground">
                            {formIntel.toolCoverage.filter((t) => t.status !== "missing").length}/{formIntel.toolCoverage.length} in MCP catalog
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {formIntel.toolCoverage.map((tc, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded border ${
                                tc.status === "exists" ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" :
                                tc.status === "partial" ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5" :
                                "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5"
                              }`}
                              title={
                                tc.status === "exists" ? "Connected" :
                                tc.status === "partial" ? `Similar available: ${tc.matchedTool?.name || tc.proposedName}` :
                                "Not yet connected"
                              }
                              data-testid={`form-intel-tool-chip-${i}`}
                            >
                              {tc.status === "exists" ? <Check className="w-2 h-2" /> : tc.status === "partial" ? <Minus className="w-2 h-2" /> : <X className="w-2 h-2" />}
                              <span className="truncate max-w-[80px]">{tc.proposedName}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {formIntel && formIntel.compositeRisk && (
                      <div className="flex items-center gap-2 p-1.5 rounded bg-background/50" data-testid="form-intel-composite-risk">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">Risk Level</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          formIntel.compositeRisk.level === "CRITICAL" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                          formIntel.compositeRisk.level === "HIGH" ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" :
                          formIntel.compositeRisk.level === "MEDIUM" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}>{formIntel.compositeRisk.level}</span>
                        <span className="text-[9px] text-muted-foreground italic truncate">{formIntel.compositeRisk.rationale.join(" · ")}</span>
                      </div>
                    )}
                    {(() => {
                      const RLVL = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
                      const piLevel = formIntel?.compositeRisk?.level;
                      const piIdx = piLevel ? RLVL.indexOf(piLevel) : -1;
                      const tierIdx = formRiskTier ? RLVL.indexOf(formRiskTier) : -1;
                      if (piIdx < 0 || tierIdx < 0 || piIdx <= tierIdx) return null;
                      const suggestedTier = piLevel === "CRITICAL" ? "HIGH" : piLevel!;
                      if (suggestedTier === formRiskTier) return null;
                      return (
                        <div className="flex items-center gap-2 mx-3 mb-1 px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/30" data-testid="form-banner-risk-upgrade">
                          <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0" />
                          <span className="text-[10px] text-yellow-700 dark:text-yellow-300 flex-1">Platform analysis suggests upgrading risk tier to <strong>{suggestedTier}</strong></span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 px-2 text-[9px] border-yellow-500/40 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/10"
                            onClick={() => setFormRiskTier(suggestedTier)}
                            data-testid="button-form-apply-risk-upgrade"
                          >
                            Apply
                          </Button>
                        </div>
                      );
                    })()}
                    {formIntel && !formIntel.matchedAgents.some((r) => r.matches.length > 0) && formIntel.matchedTemplates.length === 0 && formIntel.matchedPolicies.length === 0 && formIntel.toolCoverage.length === 0 && (
                      <div className="flex items-center gap-2 p-2 rounded bg-background/30 text-muted-foreground/70" data-testid="text-form-intel-no-matches">
                        <Cpu className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] italic">No platform matches yet for this industry. Matches appear once agents, templates, or policies are configured for this domain.</span>
                      </div>
                    )}
                    <div className="px-3 pb-2">
                      <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed" data-testid="text-form-intel-risk-note">
                        Risk level is calculated from the systems required and how much human oversight is involved.
                      </p>
                    </div>
                    </div>
                    )}
                  </div>
                )}

                {(() => {
                  const coverPct = formIntel?.summary?.toolCoveragePercent;
                  if (coverPct === undefined || coverPct >= 60) return null;
                  const missingCount = (formIntel?.toolCoverage || []).filter((t) => t.status === "missing").length;
                  if (missingCount === 0) return null;
                  return (
                    <div className="flex items-start gap-2 px-1 py-1.5 rounded bg-amber-500/10 border border-amber-500/30" data-testid="form-banner-tool-gap">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-px" />
                      <span className="text-[10px] text-amber-700 dark:text-amber-300">{missingCount} tool{missingCount !== 1 ? "s" : ""} not yet in catalog — review before deploying</span>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setSelectedFormTemplate(null); setSelectedLibTemplate(null); setFormStep(1); }} data-testid="button-form-back-template">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button onClick={() => createFormOutcomeMutation.mutate()} disabled={!canProceedToReview || createFormOutcomeMutation.isPending} data-testid="button-form-create">
                    {createFormOutcomeMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating...</> : "Launch This Plan"}
                  </Button>
                </div>
              </div>
            )}

            {formStep === 3 && formCreatedOutcome && (
              <div className="flex flex-col gap-6 relative" data-testid="form-step-handoff">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.04] via-transparent to-transparent pointer-events-none rounded-lg" />
                <div className="flex flex-col items-center gap-4 py-6 relative z-10">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl scale-[2]" />
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-500/30 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <p className="text-xl font-semibold tracking-tight" data-testid="text-form-success">Plan Created</p>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Your plan and success metrics have been saved. Continue to configure and launch your automations.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle className="w-3 h-3" /> Plan Saved
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                      <BarChart3 className="w-3 h-3" /> KPIs Created
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] text-primary">
                      <Bot className="w-3 h-3" /> Ready for Agents
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3 relative z-10">
                  <Button onClick={() => navigate(`/outcomes/${formCreatedOutcome.id}?tab=agent-map`)} data-testid="button-form-continue-to-agents" className="w-full max-w-sm shadow-sm shadow-primary/10" size="lg">
                    <Sparkles className="w-4 h-4 mr-1.5" /> View Your Plan <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => { setFormStep(1); setFormCreatedOutcome(null); setFormPlanRequested(false); setFormName(""); setFormDescription(""); setFormRiskTier("MEDIUM"); setFormPricingModel("PER_OUTCOME_EVENT"); setFormPricePerUnit(0); setFormRiskThreshold(0.8); setFormMaxDriftPercent(10); setFormSlaDescription(""); setFormKpis([]); }} data-testid="button-form-new" className="text-muted-foreground">
                      Create Another
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/outcomes/${formCreatedOutcome.id}`)} data-testid="button-form-view-outcome" className="text-muted-foreground">
                      View Details
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : messages.length === 0 ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "record")} className="flex-1 flex flex-col">
          <div className="flex justify-center pt-3">
            <TabsList>
              <TabsTrigger value="chat" data-testid="tab-chat-discovery">
                <Sparkles className="w-4 h-4 mr-1.5" /> {isBusinessMode ? "Describe Your Goal" : "Chat Discovery"}
              </TabsTrigger>
              <TabsTrigger value="record" data-testid="tab-record-meeting">
                <Mic className="w-4 h-4 mr-1.5" /> {isBusinessMode ? "From a Meeting" : "Record Meeting"}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="chat" className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 max-w-2xl mx-auto relative">
              <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="flex flex-col items-center gap-2.5 text-center relative z-10" data-testid="hero-chat-discovery">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/25 to-violet-500/20 blur-xl scale-150" />
                  <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary/15 to-violet-500/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                  </div>
                </div>
                <h1 className="text-xl font-semibold tracking-tight" data-testid="text-discover-title">
                  {isBusinessMode ? "What business goal can AI help you achieve?" : "What business outcome do you want to achieve?"}
                </h1>
                <p className="text-muted-foreground text-xs max-w-md leading-relaxed">
                  {isBusinessMode
                    ? "Describe your challenge in plain language — we'll map it to Digital Workers, set success metrics, and track results for you."
                    : "Describe your business challenge in plain language. The platform will map your process, propose automation roles, define success metrics, and draft your automation plan."}
                </p>
                <div className="flex items-center gap-2 flex-wrap justify-center" data-testid="hero-feature-pills">
                  {(isBusinessMode ? [
                    { label: "Goal Planning", icon: Target },
                    { label: "Success Metrics", icon: BarChart3 },
                    { label: "Digital Workers", icon: Zap },
                    { label: "Value Tracking", icon: TrendingUp },
                  ] : [
                    { label: "Process Mapping", icon: Workflow },
                    { label: "Metrics Design", icon: BarChart3 },
                    { label: "Automation Plan", icon: Zap },
                    { label: "Compliance", icon: Shield },
                  ]).map((pill) => (
                    <div key={pill.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/50 text-[11px] text-muted-foreground">
                      <pill.icon className="w-3 h-3" />
                      {pill.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full relative z-10">
                {starterPrompts.map((sp, i) => {
                  const accentColors = [
                    "from-primary/10 to-primary/[0.02] border-l-primary/40",
                    "from-violet-500/10 to-violet-500/[0.02] border-l-violet-500/40",
                    "from-emerald-500/10 to-emerald-500/[0.02] border-l-emerald-500/40",
                    "from-amber-500/10 to-amber-500/[0.02] border-l-amber-500/40",
                  ];
                  const iconColors = ["text-primary bg-primary/10", "text-violet-500 bg-violet-500/10", "text-emerald-500 bg-emerald-500/10", "text-amber-500 bg-amber-500/10"];
                  return (
                    <Card
                      key={i}
                      className="hover-elevate cursor-pointer"
                      onClick={() => sendMessage(sp.prompt)}
                      data-testid={`card-starter-${i}`}
                    >
                      <CardContent className={`flex items-center gap-2.5 p-3 border-l-2 bg-gradient-to-r ${accentColors[i % accentColors.length]}`}>
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${iconColors[i % iconColors.length]}`}>
                          <sp.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-xs font-medium">{sp.label}</span>
                          <span className="text-[11px] text-muted-foreground line-clamp-1">{sp.prompt}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex flex-col gap-1 w-full relative z-10">
                {voiceInput.isListening && voiceInput.interimText && (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-xs text-muted-foreground italic truncate">{voiceInput.interimText}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Textarea
                    placeholder={voiceInput.isListening ? "Listening... speak now" : "Describe your business goal or challenge..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="resize-none text-sm"
                    rows={2}
                    data-testid="input-discover-message"
                  />
                  {voiceInput.isSupported && (
                    <Button
                      size="icon"
                      variant={voiceInput.isListening ? "destructive" : "outline"}
                      onClick={voiceInput.toggleListening}
                      data-testid="button-voice-discover"
                    >
                      {voiceInput.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    onClick={() => sendMessage()}
                    disabled={!input.trim()}
                    data-testid="button-send-discover"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="record" className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 max-w-2xl mx-auto">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording ? "bg-red-500/20 animate-pulse" : "bg-primary/10"}`}>
                  {isRecording ? <Mic className="w-10 h-10 text-red-500" /> : <Mic className="w-10 h-10 text-primary" />}
                </div>
                <h2 className="text-xl font-semibold">
                  {isRecording ? "Recording in progress..." : analyzing ? "Analyzing recording..." : transcriptResult ? "Analysis Complete" : "Record a Meeting"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  {isRecording
                    ? "Speak clearly. Live transcription appears below."
                    : analyzing
                      ? "Processing your recording with AI to identify automation opportunities..."
                      : transcriptResult
                        ? `Found ${transcriptResult.opportunities.length} automation opportunities from your conversation.`
                        : "Record a stakeholder conversation or workshop discussion. The AI will automatically transcribe and identify automation opportunities."}
                </p>
              </div>

              {isRecording && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-lg font-mono font-semibold" data-testid="text-recording-time">{formatTime(recordingTime)}</span>
                </div>
              )}

              {(isRecording || analyzing) && (liveTranscript || interimText) && (
                <Card className="w-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-primary" /> Live Transcription
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto" data-testid="text-live-transcript">
                      {liveTranscript}
                      {interimText && <span className="text-muted-foreground/50 italic">{interimText}</span>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {analyzing && !isRecording && (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Running AI analysis on your recording...</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                {!isRecording && !analyzing && !transcriptResult && !analysisFailed && (
                  <Button size="lg" onClick={startRecording} data-testid="button-start-recording">
                    <Mic className="w-4 h-4 mr-2" /> Start Recording
                  </Button>
                )}
                {isRecording && (
                  <Button size="lg" variant="destructive" onClick={stopRecording} data-testid="button-stop-recording">
                    <Square className="w-4 h-4 mr-2" /> Stop Recording
                  </Button>
                )}
                {!isRecording && analyzing && !transcriptResult && (
                  <Button size="lg" disabled data-testid="button-analyzing">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing recording...
                  </Button>
                )}
                {!isRecording && !analyzing && analysisFailed && !transcriptResult && (
                  <div className="flex items-center gap-2">
                    <Button variant="default" onClick={() => analyzeChunks(audioChunks)} data-testid="button-retry-analysis">
                      <RefreshCw className="w-4 h-4 mr-2" /> Retry Analysis
                    </Button>
                    <Button variant="outline" onClick={() => { setAudioChunks([]); setRecordingTime(0); setAnalysisFailed(false); setLiveTranscript(""); setInterimText(""); }} data-testid="button-discard-recording">
                      Discard
                    </Button>
                  </div>
                )}
                {transcriptResult && (
                  <Button variant="outline" onClick={() => { setAudioChunks([]); setRecordingTime(0); setTranscriptResult(null); setAnalysisFailed(false); setLiveTranscript(""); setInterimText(""); }} data-testid="button-new-recording">
                    <Mic className="w-4 h-4 mr-2" /> New Recording
                  </Button>
                )}
              </div>

              {transcriptResult && (
                <div className="w-full flex flex-col gap-4 mt-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        <Clock className="w-4 h-4 text-primary" /> Transcript
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto" data-testid="text-transcript">
                        {transcriptResult.transcript}
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-process-flow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Workflow className="w-4 h-4 text-primary" /> Process Flow Mapping
                        </div>
                        <div className="flex items-center gap-2">
                          {processSteps.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {processSteps.length} steps / {totalProcessTime} mins total
                            </Badge>
                          )}
                          {!showProcessFlow ? (
                            <Button variant="outline" size="sm" onClick={() => { setShowProcessFlow(true); if (processSteps.length === 0) addProcessStep(); }} data-testid="button-show-process-flow">
                              <Plus className="w-3 h-3 mr-1" /> Map Process
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setShowProcessFlow(false)} data-testid="button-hide-process-flow">
                              Collapse
                            </Button>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    {showProcessFlow && (
                      <CardContent className="flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">
                          Map out your current manual process steps. This information helps the AI propose better agent designs and estimate ROI.
                        </p>
                        {processSteps.map((step, i) => (
                          <div key={step.id} className="flex flex-col gap-2 p-3 rounded-md border bg-muted/30" data-testid={`process-step-${i}`}>
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="text-[10px]">Step {i + 1}</Badge>
                              <Button variant="ghost" size="icon" onClick={() => removeProcessStep(step.id)} data-testid={`button-remove-step-${i}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground">Step Description</Label>
                                <Input
                                  placeholder="What happens in this step?"
                                  value={step.description}
                                  onChange={(e) => updateProcessStep(step.id, "description", e.target.value)}
                                  className="h-8 text-xs"
                                  data-testid={`input-step-description-${i}`}
                                />
                              </div>
                              <div className="flex gap-2">
                                <div className="flex flex-col gap-1 flex-1">
                                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Actor</Label>
                                  <Input
                                    placeholder="Who does this?"
                                    value={step.actor}
                                    onChange={(e) => updateProcessStep(step.id, "actor", e.target.value)}
                                    className="h-8 text-xs"
                                    data-testid={`input-step-actor-${i}`}
                                  />
                                </div>
                                <div className="flex flex-col gap-1 w-24">
                                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Mins</Label>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    value={step.timeMins || ""}
                                    onChange={(e) => updateProcessStep(step.id, "timeMins", parseInt(e.target.value) || 0)}
                                    className="h-8 text-xs"
                                    data-testid={`input-step-time-${i}`}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pain Points</Label>
                                <Input
                                  placeholder="What goes wrong or is slow?"
                                  value={step.painPoints}
                                  onChange={(e) => updateProcessStep(step.id, "painPoints", e.target.value)}
                                  className="h-8 text-xs"
                                  data-testid={`input-step-pain-${i}`}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Improvement Ideas</Label>
                                <Input
                                  placeholder="How could this be automated?"
                                  value={step.improvementIdeas}
                                  onChange={(e) => updateProcessStep(step.id, "improvementIdeas", e.target.value)}
                                  className="h-8 text-xs"
                                  data-testid={`input-step-ideas-${i}`}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addProcessStep} data-testid="button-add-process-step">
                          <Plus className="w-3 h-3 mr-1" /> Add Step
                        </Button>
                      </CardContent>
                    )}
                  </Card>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" /> Identified Opportunities ({transcriptResult.opportunities.length})
                    </h3>
                    {transcriptResult.opportunities.map((opp, i) => (
                      <Card key={i} className="hover-elevate" data-testid={`card-opportunity-${i}`}>
                        <CardContent className="p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <span className="text-sm font-semibold">{opp.name}</span>
                              <span className="text-xs text-muted-foreground">{opp.description}</span>
                            </div>
                            <Badge variant={opp.businessValue === "high" ? "default" : "outline"} className="text-[10px] shrink-0">
                              {opp.businessValue} value
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {opp.suggestedSystems.map((sys, j) => (
                              <Badge key={j} variant="secondary" className="text-[9px]">{sys}</Badge>
                            ))}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => useOpportunityForDiscovery(opp)} data-testid={`button-use-opportunity-${i}`}>
                            <ArrowRight className="w-3 h-3 mr-1" /> Start Planning
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`rounded-md px-3 py-2 max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                    data-testid={`chat-message-${i}`}
                  >
                    {msg.role === "assistant" ? renderMessageContent(msg.content, streaming && i === messages.length - 1) : (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing your business goals...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-4 flex flex-col gap-1 shrink-0">
              {voiceInput.isListening && voiceInput.interimText && (
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-xs text-muted-foreground italic truncate">{voiceInput.interimText}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  placeholder={voiceInput.isListening ? "Listening... speak now" : "Tell me more about your goals..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  disabled={streaming}
                  data-testid="input-discover-chat"
                />
                {voiceInput.isSupported && (
                  <Button
                    size="icon"
                    variant={voiceInput.isListening ? "destructive" : "outline"}
                    onClick={voiceInput.toggleListening}
                    disabled={streaming}
                    data-testid="button-voice-discover-chat"
                  >
                    {voiceInput.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={streaming || !input.trim()}
                  data-testid="button-send-discover-chat"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {builderMode === "ai" && proposal && (
            <div className="lg:w-[480px] border-t lg:border-t-0 lg:border-l overflow-y-auto shrink-0" data-testid="panel-proposal">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/[0.04] to-transparent">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-violet-500/10 flex items-center justify-center">
                    <Target className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex flex-col gap-0">
                    <h3 className="text-sm font-semibold tracking-tight">Outcome Proposal</h3>
                    <span className="text-xs text-muted-foreground">Review, adjust, and launch when ready</span>
                  </div>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        Your Business Goal
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleEnhanceOutcome}
                        disabled={enhancingOutcome}
                        data-testid="button-ai-enhance-outcome"
                      >
                        {enhancingOutcome ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        AI Enhance
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-semibold leading-snug" data-testid="text-proposal-name">{proposal.outcomeContract.name}</span>
                      {proposal.outcomeContract.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-proposal-description">{proposal.outcomeContract.description}</p>
                      )}
                    </div>
                    {proposal.outcomeContract.slaDescription && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 border border-muted" data-testid="text-proposal-sla">
                        <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Commitment</span>
                          <span className="text-xs text-foreground/80 leading-relaxed">{proposal.outcomeContract.slaDescription}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {platformIntel?.compositeRisk ? (
                          <Badge
                            variant={platformIntel.compositeRisk.level === "CRITICAL" || platformIntel.compositeRisk.level === "HIGH" ? "destructive" : "outline"}
                            className={`text-xs ${platformIntel.compositeRisk.level === "LOW" ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" : platformIntel.compositeRisk.level === "MEDIUM" ? "border-amber-500/50 text-amber-600 dark:text-amber-400" : ""}`}
                            data-testid="badge-composite-risk"
                          >
                            {platformIntel.compositeRisk.level} Risk
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{proposal.outcomeContract.riskTier} Risk</Badge>
                        )}
                        {loadingIntel && <span className="text-xs text-muted-foreground animate-pulse">Analysing…</span>}
                      </div>
                      {platformIntel?.compositeRisk?.rationale && platformIntel.compositeRisk.rationale.length > 0 && (
                        <div className="flex flex-col gap-0.5" data-testid="text-composite-risk-rationale">
                          {platformIntel.compositeRisk.rationale.map((r, i) => (
                            <span key={i} className="text-xs text-muted-foreground leading-relaxed">· {r}</span>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const RLVL = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
                        const piLevel = platformIntel?.compositeRisk?.level;
                        const contractTier = proposal?.outcomeContract?.riskTier;
                        const piIdx = piLevel ? RLVL.indexOf(piLevel) : -1;
                        const tierIdx = contractTier ? RLVL.indexOf(contractTier) : -1;
                        if (piIdx < 0 || tierIdx < 0 || piIdx <= tierIdx) return null;
                        const suggestedTier = piLevel === "CRITICAL" ? "HIGH" : piLevel!;
                        if (suggestedTier === contractTier) return null;
                        return (
                          <div className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/30" data-testid="banner-risk-upgrade">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                            <span className="text-xs text-yellow-700 dark:text-yellow-300 flex-1">We recommend a higher oversight level: <strong>{suggestedTier}</strong></span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs border-yellow-500/40 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/10"
                              onClick={() => setProposal((prev) => prev ? { ...prev, outcomeContract: { ...prev.outcomeContract, riskTier: suggestedTier } } : prev)}
                              data-testid="button-apply-risk-upgrade"
                            >
                              Apply
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Success Metrics ({proposal.kpis.length})
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateKpis}
                        disabled={generatingKpis}
                        data-testid="button-ai-generate-kpis"
                      >
                        {generatingKpis ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        Suggest More
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 flex flex-col gap-2">
                    {proposal.kpis.map((kpi, i) => (
                      <div key={i} className="flex flex-col gap-1 p-2 rounded-md bg-muted/50" data-testid={`kpi-proposal-${i}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">{kpi.name}</span>
                          <Badge variant="outline" className="text-xs">Target: {kpi.target}{kpi.unit}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{kpi.measurement}</span>
                        {kpi.currentBaseline !== null && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">Current: {kpi.currentBaseline}{kpi.unit}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-green-600 dark:text-green-400">Target: {kpi.target}{kpi.unit}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {industryKpis && (
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle
                        className="text-sm font-medium flex items-center justify-between gap-1.5 cursor-pointer flex-wrap"
                        onClick={() => setShowKpiBenchmarks(!showKpiBenchmarks)}
                        data-testid="button-toggle-kpi-benchmarks"
                      >
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          Industry KPI Benchmarks
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showKpiBenchmarks ? "rotate-180" : ""}`} />
                      </CardTitle>
                    </CardHeader>
                    {showKpiBenchmarks && (
                      <CardContent className="p-4 pt-1 flex flex-col gap-2">
                        {industryKpis.map((kpi, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50" data-testid={`industry-kpi-${i}`}>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-medium">{kpi.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-green-600 dark:text-green-400">Target: {kpi.target}</span>
                                <span className="text-xs text-muted-foreground">Benchmark: {kpi.benchmark}</span>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" data-testid={`button-add-kpi-${i}`}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )}

                <Card>
                  <CardContent className="p-4 flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">Automation Build Plan</span>
                      <span className="text-xs text-muted-foreground">
                        After creating this outcome, you can request a full Automation Build Plan. The platform will design and configure the automations needed to deliver your target results.
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {(regulatoryConstraints || proposal) && (
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-medium flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5" />
                          Compliance Requirements
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={handleDetectRegulations}
                          disabled={detectingRegulations || !proposal}
                          title="Re-detect regulations for this outcome"
                          data-testid="button-refresh-regulations"
                        >
                          {detectingRegulations ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 flex flex-col gap-2">
                      {(!regulatoryConstraints || regulatoryConstraints.length === 0) && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-muted-foreground" data-testid="text-no-regulations">
                          <Shield className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs">
                            {!industry?.id
                              ? "Select an industry workspace to enable automatic compliance detection."
                              : detectingRegulations
                              ? "Detecting applicable regulations…"
                              : "No regulations detected. Click the refresh icon to detect applicable regulations for this outcome."}
                          </span>
                        </div>
                      )}
                      {regulatoryConstraints && regulatoryConstraints.map((reg, i) => (
                        <div key={i} className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/50" data-testid={`regulatory-constraint-${i}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{reg.regulation}</span>
                              <Badge
                                variant={reg.classification === "Critical" ? "destructive" : reg.classification === "High-Risk" ? "default" : "outline"}
                                className="text-xs"
                              >
                                {reg.classification}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {reg.autoApplied ? (
                                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-6 h-6"
                                onClick={() => toggleRegulation(i)}
                                data-testid={`button-toggle-regulation-${i}`}
                              >
                                <ChevronDown className={`w-3 h-3 transition-transform ${expandedRegulations.has(i) ? "rotate-180" : ""}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-6 h-6 text-muted-foreground hover:text-destructive"
                                onClick={() => removeRegConstraint(i)}
                                data-testid={`button-remove-regulation-${i}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {expandedRegulations.has(i) && (
                            <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted ml-1">
                              {reg.requirements.map((req, j) => (
                                <span key={j} className="text-xs text-muted-foreground">{req}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {proposal && (
                  <Card data-testid="card-platform-policies">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle
                        className="text-sm font-medium flex items-center justify-between gap-1.5 cursor-pointer flex-wrap"
                        onClick={() => setShowRealPolicies(!showRealPolicies)}
                        data-testid="button-toggle-policies"
                      >
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Governance Guardrails
                          {platformIntel?.summary?.matchedPolicyCount !== undefined && (
                            <Badge variant="outline" className="text-xs ml-1 border-primary/40 text-primary">
                              {platformIntel.summary.matchedPolicyCount} live
                            </Badge>
                          )}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRealPolicies ? "rotate-180" : ""}`} />
                      </CardTitle>
                    </CardHeader>
                    {showRealPolicies && (
                      <CardContent className="p-4 pt-1 flex flex-col gap-2">
                        {/* Real policies from intel endpoint with enforcement type */}
                        {platformIntel?.matchedPolicies && platformIntel.matchedPolicies.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {platformIntel.matchedPolicies.map((pol, i) => {
                              const packName = pol.policyPack ?? findPolicyPackName(pol.name, pol.domain);
                              return (
                                <div key={pol.id} className="flex flex-col gap-1 p-2 rounded-md bg-primary/5 border border-primary/10" data-testid={`real-policy-${i}`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{pol.name}</span>
                                    {pol.enforcementType && (
                                      <span className={`text-xs font-medium px-1 py-0.5 rounded-full border ${pol.enforcementType === "auto" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"}`}>
                                        {pol.enforcementType === "auto" ? "Auto-enforced" : "Review Required"}
                                      </span>
                                    )}
                                  </div>
                                  {packName && (
                                    <span className="text-xs text-muted-foreground/70 font-medium" data-testid={`text-real-policy-pack-${i}`}>{packName}</span>
                                  )}
                                  {pol.description && (
                                    <span className="text-xs text-muted-foreground leading-relaxed">{pol.description}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(!platformIntel?.matchedPolicies || platformIntel.matchedPolicies.length === 0) && (
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-muted-foreground" data-testid="text-no-applicable-policies">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs">No platform policies matched for this industry. Governance reviews will be triggered at agent deployment.</span>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )}

                {proposal.roiEstimate && (
                  <Card className="border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5" data-testid="card-roi-estimate">
                    <CardHeader className="p-3 pb-1">
                      <button
                        className="flex items-center justify-between w-full text-left"
                        onClick={() => setShowRoiEstimate(v => !v)}
                        data-testid="button-toggle-roi-estimate"
                        type="button"
                      >
                        <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Estimated ROI
                        </CardTitle>
                        <ChevronDown className={`w-3.5 h-3.5 text-emerald-600/60 transition-transform ${showRoiEstimate ? "rotate-180" : ""}`} />
                      </button>
                    </CardHeader>
                    {showRoiEstimate && (
                      <CardContent className="p-3 pt-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400" data-testid="text-roi-savings-range">
                            <DollarSign className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-semibold">
                              {`$${(proposal.roiEstimate.annualizedSavingsMin / 1000).toFixed(0)}K – $${(proposal.roiEstimate.annualizedSavingsMax / 1000).toFixed(0)}K`}
                            </span>
                            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">/ year</span>
                          </div>
                          {proposal.roiEstimate.paybackPeriodMonths != null && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-roi-payback">
                              <Clock className="w-3 h-3" />
                              <span>{proposal.roiEstimate.paybackPeriodMonths}mo payback</span>
                            </div>
                          )}
                        </div>
                        {proposal.roiEstimate.assumptionsSummary && (
                          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-roi-assumptions">{proposal.roiEstimate.assumptionsSummary}</p>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )}

                {proposal.validationChecklist && proposal.validationChecklist.length > 0 && (
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Pre-Launch Checklist
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 flex flex-col gap-1.5">
                      {proposal.validationChecklist.map((item, i) => (
                        <label
                          key={i}
                          className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer ${checkedItems.has(i) ? "bg-emerald-500/5" : ""}`}
                          data-testid={`check-validation-${i}`}
                        >
                          <Checkbox
                            checked={checkedItems.has(i)}
                            onCheckedChange={() => toggleCheckItem(i)}
                            className="mt-0.5"
                          />
                          <span className={`text-xs leading-relaxed ${checkedItems.has(i) ? "line-through text-muted-foreground" : ""}`}>{item}</span>
                        </label>
                      ))}
                      <div className="mt-2 flex flex-col gap-1">
                        <Progress value={(checkedItems.size / proposal.validationChecklist.length) * 100} className="h-1.5" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{checkedItems.size}/{proposal.validationChecklist.length} confirmed</span>
                          {allChecked && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">All confirmed</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {createdOutcome ? (
                  <Card className="border-emerald-500/30 overflow-hidden">
                    <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 flex flex-col gap-4">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-lg scale-150" />
                          <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-emerald-500" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold" data-testid="text-discover-success-title">Plan Created</span>
                          <span className="text-xs text-muted-foreground">{createdOutcome.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Your automation plan is ready. Continue to configure and launch your automations.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full shadow-sm shadow-primary/10"
                        onClick={() => navigate(`/outcomes/${createdOutcome.id}?tab=agent-map`)}
                        data-testid="button-discover-continue-to-agents"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> View Your Plan <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={() => navigate(`/outcomes/${createdOutcome.id}`)}
                        data-testid="button-discover-view-outcome"
                      >
                        View Outcome Details
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <>
                    {/* Governance Readiness Score card + create button with inline readiness signal */}
                    {(() => {
                      // Governance Readiness: KPIs, risk tier, SLA, policy match, approval gates, drift threshold
                      const hasKpis = (proposal.kpis?.length || 0) > 0;
                      const hasRiskTier = !!(proposal.outcomeContract?.riskTier);
                      const hasSla = !!(proposal.outcomeContract?.slaDescription);
                      const hasPolicies = (platformIntel?.summary?.matchedPolicyCount || 0) > 0;
                      const hasApprovalGates = !platformIntel?.summary?.hasApprovalGapRisk;
                      const hasDriftDef = !!(proposal.outcomeContract?.maxDriftPercent);
                      const kpiScore = hasKpis ? 20 : 0;
                      const riskTierScore = hasRiskTier ? 15 : 0;
                      const slaScore = hasSla ? 15 : 0;
                      const policyScore = hasPolicies ? 25 : 0;
                      const approvalGateScore = hasApprovalGates ? 15 : 0;
                      const driftScore = hasDriftDef ? 10 : 0;
                      const readinessScore = kpiScore + riskTierScore + slaScore + policyScore + approvalGateScore + driftScore;
                      const scoreColor = readinessScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : readinessScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      const progressColor = readinessScore >= 80 ? "bg-emerald-500" : readinessScore >= 50 ? "bg-amber-500" : "bg-red-500";
                      const _readiness = platformIntel ? readinessScore : null;
                      const _lowReadiness = _readiness !== null && _readiness < 60;
                      return (
                        <>
                          <Card className="border-dashed" data-testid="card-readiness-score">
                            <CardContent className="p-4 flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <Star className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-sm font-medium text-muted-foreground">Governance Readiness</span>
                                </div>
                                <span className={`text-xl font-bold tabular-nums ${scoreColor}`} data-testid="text-readiness-score">{readinessScore}<span className="text-xs font-normal">/100</span></span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full ${progressColor} transition-all duration-500`} style={{ width: `${readinessScore}%` }} />
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <span className="text-xs text-muted-foreground">KPIs defined: <span className={hasKpis ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{hasKpis ? `${proposal.kpis?.length} KPIs` : "none"}</span></span>
                                <span className="text-xs text-muted-foreground">Risk tier: <span className={hasRiskTier ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{proposal.outcomeContract?.riskTier || "unset"}</span></span>
                                <span className="text-xs text-muted-foreground">Platform policies: <span className={hasPolicies ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}>{platformIntel?.summary?.matchedPolicyCount || 0}</span></span>
                                <span className="text-xs text-muted-foreground">Approval gates: <span className={hasApprovalGates ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{hasApprovalGates ? "covered" : "gaps"}</span></span>
                                <span className="text-xs text-muted-foreground">Drift threshold: <span className={hasDriftDef ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}>{hasDriftDef ? `${proposal.outcomeContract?.maxDriftPercent}%` : "unset"}</span></span>
                                <span className="text-xs text-muted-foreground">SLA defined: <span className={hasSla ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}>{hasSla ? "yes" : "no"}</span></span>
                              </div>
                            </CardContent>
                          </Card>
                          <div className="flex flex-col gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    onClick={handleAcceptProposal}
                                    disabled={createOutcomeMutation.isPending}
                                    className={`w-full ${_lowReadiness ? "border-amber-500/40" : ""}`}
                                    variant={_lowReadiness ? "outline" : "default"}
                                    data-testid="button-accept-proposal"
                                  >
                                    {createOutcomeMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                    ) : _lowReadiness ? (
                                      <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-500" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4 mr-1.5" />
                                    )}
                                    Launch This Plan
                                    {_readiness !== null && !createOutcomeMutation.isPending && (
                                      <span className={`ml-2 text-xs font-normal tabular-nums ${_lowReadiness ? "text-amber-500" : "opacity-60"}`}>
                                        {_readiness}% ready
                                      </span>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                {_lowReadiness && (
                                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                                    Your plan is {_readiness}% complete — review the checklist items above before launching.
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            <p className="text-xs text-center text-muted-foreground">
                              {_lowReadiness
                                ? `Readiness ${_readiness}/100 — review governance gaps above before creating`
                                : allChecked
                                  ? "All validation items confirmed — ready to create"
                                  : `${(proposal.validationChecklist?.length || 0) - checkedItems.size} validation items remaining (optional)`}
                            </p>
                            {(() => {
                              const coverPct = platformIntel?.summary?.toolCoveragePercent;
                              if (coverPct === undefined || coverPct >= 60) return null;
                              const missingCount = (platformIntel?.toolCoverage || []).filter((t) => t.status === "missing").length;
                              if (missingCount === 0) return null;
                              return (
                                <div className="flex items-start gap-2 mt-1 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30" data-testid="banner-tool-gap">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-px" />
                                  <span className="text-xs text-amber-700 dark:text-amber-300">{missingCount} tool{missingCount !== 1 ? "s" : ""} not yet in catalog — review before deploying</span>
                                </div>
                              );
                            })()}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}