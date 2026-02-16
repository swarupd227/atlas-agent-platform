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
  DollarSign,
  ChevronDown,
  Check,
  Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutcomeContract } from "@shared/schema";
import { useIndustry } from "@/components/industry-provider";
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

function getEstCost(riskTier: string): string {
  if (riskTier === "HIGH") return "$0.10-$0.30/run";
  if (riskTier === "MEDIUM") return "$0.05-$0.15/run";
  return "$0.01-$0.05/run";
}

function getMcpConnections(tools: string[]): string[] {
  return tools.filter(t => /api|system|platform/i.test(t)).slice(0, 2);
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const pendingChunksRef = useRef<Blob[]>([]);

  const starterPrompts = INDUSTRY_STARTER_PROMPTS[(industry?.id ?? "null") as keyof typeof INDUSTRY_STARTER_PROMPTS] || INDUSTRY_STARTER_PROMPTS["null"];

  const industryKpis = industry && industry.id !== "custom" ? INDUSTRY_KPI_LIBRARY[industry.id] : null;
  const regulatoryConstraints = industry && industry.id !== "custom" ? INDUSTRY_REGULATORY_CONSTRAINTS[industry.id] : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createOutcomeMutation = useMutation({
    mutationFn: async (data: any) => {
      const kpis = (proposal?.kpis || []).map((k: any) => ({
        name: k.name,
        target: k.target,
        unit: k.unit,
        baseline: k.currentBaseline ?? 0,
        slaThreshold: k.target * 0.9,
        weight: 1.0,
      }));
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
    onSuccess: (outcome: OutcomeContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Outcome Contract created", description: `"${outcome.name}" has been created with KPIs and sent for expert validation.` });
      navigate(`/outcomes/${outcome.id}`);
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
      const res = await fetch("/api/ai/outcome-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, industry: industry || undefined }),
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
      setProposal(data);
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
      const data = await res.json();
      toast({ title: "Regulations detected", description: `Found ${data.length || 0} applicable regulations.` });
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
      {messages.length === 0 ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "record")} className="flex-1 flex flex-col">
          <div className="flex justify-center pt-6">
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 max-w-2xl mx-auto">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold" data-testid="text-discover-title">What business outcome do you want to achieve?</h1>
                <p className="text-muted-foreground text-sm max-w-md">
                  Describe your business challenge in plain language. The platform will map your workflows, propose AI agent roles, define success metrics, and draft an Outcome Contract.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {starterPrompts.map((sp, i) => (
                  <Card
                    key={i}
                    className="hover-elevate cursor-pointer"
                    onClick={() => sendMessage(sp.prompt)}
                    data-testid={`card-starter-${i}`}
                  >
                    <CardContent className="flex items-start gap-3 p-4">
                      <sp.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-sm font-medium">{sp.label}</span>
                        <span className="text-xs text-muted-foreground line-clamp-2">{sp.prompt}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-col gap-1 w-full max-w-lg">
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
            <div className="flex items-center gap-2 p-4 border-b shrink-0 flex-wrap">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-medium">Outcome Builder</h2>
              {proposal && <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400">Proposal Ready</Badge>}
            </div>

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

          {proposal && (
            <div className="lg:w-[420px] border-t lg:border-t-0 lg:border-l overflow-y-auto shrink-0" data-testid="panel-proposal">
              <div className="p-4 border-b">
                <h3 className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <Target className="w-4 h-4 text-primary" />
                  Outcome Proposal
                </h3>
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
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Bot className="w-3.5 h-3.5" />
                      Proposed Agents ({proposal.proposedAgents.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    {proposal.proposedAgents.map((agent, i) => {
                      const skills = agent.tools.slice(0, 3);
                      const mcpConns = getMcpConnections(agent.tools);
                      const governanceLabel = industry && industry.id !== "custom"
                        ? `${industry.label} compliance policies`
                        : "Standard governance policies";
                      const estCost = getEstCost(agent.riskTier);

                      return (
                        <div key={i} className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/50" data-testid={`agent-proposal-${i}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{agent.name}</span>
                            <Badge variant="outline" className="text-[10px]">{agent.autonomyMode}</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{agent.description}</span>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">Workflow:</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {agent.workflowSteps.map((step, j) => (
                                <span key={j} className="flex items-center gap-0.5">
                                  {j > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                                  <Badge variant="secondary" className="text-[9px]">{step}</Badge>
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className="text-[10px] text-green-600 dark:text-green-400">{agent.estimatedImpact}</span>
                          {skills.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-medium text-muted-foreground">Recommended Skills:</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {skills.map((skill, j) => (
                                  <Badge key={j} variant="secondary" className="text-[9px]">{skill}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {mcpConns.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-medium text-muted-foreground">MCP Connections:</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {mcpConns.map((conn, j) => (
                                  <Badge key={j} variant="outline" className="text-[9px]">{conn}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Auto-applied: {governanceLabel}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <DollarSign className="w-3 h-3" /> {estCost}
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
                          size="sm"
                          onClick={handleDetectRegulations}
                          disabled={detectingRegulations}
                          data-testid="button-ai-detect-regulations"
                        >
                          {detectingRegulations ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                          AI Detect
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
                            <div className="flex items-center gap-1.5">
                              {reg.autoApplied ? (
                                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleRegulation(i)}
                                data-testid={`button-toggle-regulation-${i}`}
                              >
                                <ChevronDown className={`w-3 h-3 transition-transform ${expandedRegulations.has(i) ? "rotate-180" : ""}`} />
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
                          className="flex items-start gap-2 p-1.5 rounded-md cursor-pointer hover-elevate"
                          data-testid={`check-validation-${i}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={checkedItems.has(i)}
                            onChange={() => toggleCheckItem(i)}
                          />
                          <span className={`text-xs ${checkedItems.has(i) ? "line-through text-muted-foreground" : ""}`}>{item}</span>
                        </label>
                      ))}
                      <div className="mt-1">
                        <Progress value={(checkedItems.size / proposal.validationChecklist.length) * 100} className="h-1.5" />
                        <span className="text-[10px] text-muted-foreground">{checkedItems.size}/{proposal.validationChecklist.length} validated</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}