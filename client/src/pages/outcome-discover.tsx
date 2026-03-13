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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useIndustry, OUTCOME_TEMPLATES, type OutcomeTemplate, type OutcomeTemplateKpi } from "@/components/industry-provider";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import type { IndustryId } from "@/components/industry-provider";
import type { LucideIcon } from "lucide-react";

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
  };
  kpis: Array<{
    name: string;
    target: number;
    unit: string;
    measurement: string;
    currentBaseline: number | null;
  }>;
  proposedAgents: Array<{
    name: string;
    description: string;
    role: string;
    workflowSteps: string[];
    tools: string[];
    riskTier: string;
    autonomyMode: string;
    estimatedImpact: string;
  }>;
  validationChecklist: string[];
  regulatoryConstraints?: RegulatoryConstraint[];
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
            <span className="text-xs text-muted-foreground">Review the details in the panel on the right, then click "Create Outcome Contract" when you're satisfied.</span>
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
          outcomeContract: data,
          discoveryConversation: messages.length,
          createdKpis: result.kpis?.length || 0,
        },
      });
      return outcome;
    },
    onSuccess: async (outcome: OutcomeContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setCreatedOutcome(outcome);
      toast({ title: "Outcome Contract created", description: `"${outcome.name}" has been created with KPIs.` });
      try {
        await apiRequest("PATCH", `/api/outcomes/${outcome.id}`, { status: "awaiting_agent_plan" });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      } catch {}
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
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
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
        setProposal(extracted);
        setCheckedItems(new Set());
        setActiveRegConstraints(extracted.regulatoryConstraints ?? null);
        setExpandedRegulations(new Set());
      }
    } catch (err) {
      toast({ title: "Discovery assistant error", description: "Please try again.", variant: "destructive" });
    } finally {
      setStreaming(false);
    }
  }

  function handleAcceptProposal() {
    if (!proposal) return;
    createOutcomeMutation.mutate({
      name: proposal.outcomeContract.name,
      description: proposal.outcomeContract.description,
      riskTier: proposal.outcomeContract.riskTier,
      pricingModel: proposal.outcomeContract.pricingModel,
      pricePerUnit: proposal.outcomeContract.pricePerUnit,
      riskThreshold: proposal.outcomeContract.riskThreshold,
      maxDriftPercent: proposal.outcomeContract.maxDriftPercent,
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
        toast({ title: "No regulations detected", description: "No specific regulations found for this outcome. Industry defaults are shown.", variant: "destructive" });
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
                <Card className="hover-elevate cursor-pointer" onClick={() => { setFormName(""); setFormDescription(""); setFormStep(2); }} data-testid="card-form-blank">
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
                            <p className="font-medium">{t.name}</p>
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
                            <p className="font-medium">{t.name}</p>
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-sla">SLA Description</Label>
                    <Input id="form-sla" value={formSlaDescription} onChange={(e) => setFormSlaDescription(e.target.value)} placeholder="Describe the SLA terms..." data-testid="input-form-sla" />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button variant="outline" onClick={() => setFormStep(1)} data-testid="button-form-back-template">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button onClick={() => createFormOutcomeMutation.mutate()} disabled={!canProceedToReview || createFormOutcomeMutation.isPending} data-testid="button-form-create">
                    {createFormOutcomeMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating...</> : "Create Outcome Contract"}
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
                    <p className="text-xl font-semibold tracking-tight" data-testid="text-form-success">Outcome Contract Created</p>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Your outcome contract and KPIs have been saved. Continue to generate an AI-powered agent development plan.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle className="w-3 h-3" /> Contract Saved
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
                    <Sparkles className="w-4 h-4 mr-1.5" /> Continue to Agent Plan <ArrowRight className="w-4 h-4 ml-1.5" />
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
                <Sparkles className="w-4 h-4 mr-1.5" /> Chat Discovery
              </TabsTrigger>
              <TabsTrigger value="record" data-testid="tab-record-meeting">
                <Mic className="w-4 h-4 mr-1.5" /> Record Meeting
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
                <h1 className="text-xl font-semibold tracking-tight" data-testid="text-discover-title">What business outcome do you want to achieve?</h1>
                <p className="text-muted-foreground text-xs max-w-md leading-relaxed">
                  Describe your business challenge in plain language. The platform will map workflows, propose agent roles, define metrics, and draft an Outcome Contract.
                </p>
                <div className="flex items-center gap-2 flex-wrap justify-center" data-testid="hero-feature-pills">
                  {[
                    { label: "Workflow Mapping", icon: Workflow },
                    { label: "KPI Design", icon: BarChart3 },
                    { label: "Agent Proposals", icon: Bot },
                    { label: "Compliance", icon: Shield },
                  ].map((pill) => (
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
                            <ArrowRight className="w-3 h-3 mr-1" /> Create Outcome Contract
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
            <div className="lg:w-[420px] border-t lg:border-t-0 lg:border-l overflow-y-auto shrink-0" data-testid="panel-proposal">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/[0.04] to-transparent">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-violet-500/10 flex items-center justify-center">
                    <Target className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex flex-col gap-0">
                    <h3 className="text-sm font-semibold tracking-tight">Outcome Proposal</h3>
                    <span className="text-[10px] text-muted-foreground">Review and accept to create contract</span>
                  </div>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        Outcome Contract
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
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    <span className="text-sm font-semibold" data-testid="text-proposal-name">{proposal.outcomeContract.name}</span>
                    <span className="text-xs text-muted-foreground">{proposal.outcomeContract.description}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{proposal.outcomeContract.riskTier} Risk</Badge>
                      <Badge variant="outline" className="text-[10px]">{proposal.outcomeContract.pricingModel.replace(/_/g, " ")}</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Success Metrics ({proposal.kpis.length} KPIs)
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateKpis}
                        disabled={generatingKpis}
                        data-testid="button-ai-generate-kpis"
                      >
                        {generatingKpis ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        AI Generate KPIs
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    {proposal.kpis.map((kpi, i) => (
                      <div key={i} className="flex flex-col gap-1 p-2 rounded-md bg-muted/50" data-testid={`kpi-proposal-${i}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{kpi.name}</span>
                          <Badge variant="outline" className="text-[10px]">Target: {kpi.target}{kpi.unit}</Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{kpi.measurement}</span>
                        {kpi.currentBaseline !== null && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Current: {kpi.currentBaseline}{kpi.unit}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-green-600 dark:text-green-400">Target: {kpi.target}{kpi.unit}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {industryKpis && (
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle
                        className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-1.5 cursor-pointer flex-wrap"
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
                      <CardContent className="p-3 pt-0 flex flex-col gap-2">
                        {industryKpis.map((kpi, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50" data-testid={`industry-kpi-${i}`}>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-xs font-medium">{kpi.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-green-600 dark:text-green-400">Target: {kpi.target}</span>
                                <span className="text-[10px] text-muted-foreground">Benchmark: {kpi.benchmark}</span>
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
                  <CardContent className="p-3 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">Agent Development Plan</span>
                      <span className="text-[11px] text-muted-foreground">
                        After creating this outcome, you can request an Agent Development Plan. An Agent Engineer will then propose and create agents from the outcome detail page.
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {regulatoryConstraints && (
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5" />
                          Regulatory Constraints
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={handleDetectRegulations}
                          disabled={detectingRegulations}
                          title="Re-detect regulations for this outcome"
                          data-testid="button-refresh-regulations"
                        >
                          {detectingRegulations ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 flex flex-col gap-2">
                      {regulatoryConstraints.map((reg, i) => (
                        <div key={i} className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/50" data-testid={`regulatory-constraint-${i}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{reg.regulation}</span>
                              <Badge
                                variant={reg.classification === "Critical" ? "destructive" : reg.classification === "High-Risk" ? "default" : "outline"}
                                className="text-[9px]"
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
                                <span key={j} className="text-[10px] text-muted-foreground">{req}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {proposal.validationChecklist && proposal.validationChecklist.length > 0 && (
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Validation Checklist
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 flex flex-col gap-1.5">
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
                          <span className="text-[10px] text-muted-foreground">{checkedItems.size}/{proposal.validationChecklist.length} validated</span>
                          {allChecked && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">All confirmed</span>}
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
                          <span className="text-sm font-semibold" data-testid="text-discover-success-title">Outcome Contract Created</span>
                          <span className="text-xs text-muted-foreground">{createdOutcome.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Your outcome contract is ready. Continue to generate an AI-powered agent development plan.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full shadow-sm shadow-primary/10"
                        onClick={() => navigate(`/outcomes/${createdOutcome.id}?tab=agent-map`)}
                        data-testid="button-discover-continue-to-agents"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Continue to Agent Plan <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
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
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={handleAcceptProposal}
                      disabled={createOutcomeMutation.isPending}
                      className="w-full"
                      data-testid="button-accept-proposal"
                    >
                      {createOutcomeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                      )}
                      Create Outcome Contract
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground">
                      {allChecked
                        ? "All validation items confirmed — ready to create"
                        : `${(proposal.validationChecklist?.length || 0) - checkedItems.size} validation items remaining (optional)`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}