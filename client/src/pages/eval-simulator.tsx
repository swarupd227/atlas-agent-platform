import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, EvalDataset, EvalMetricCollection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Users,
  MessageSquare,
  Settings2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Loader2,
  CheckCircle,
  Circle,
  Play,
  Plus,
  Trash2,
  User,
  Save,
  AlertCircle,
  Star,
  Sparkles,
  Database,
  FileCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Persona {
  id: string;
  name: string;
  goals: string;
  knowledgeLevel: "low" | "medium" | "high";
  emotionalState: string;
  communicationStyle: string;
  adversarialLevel: number;
  industry?: string;
  description: string;
  isCustom?: boolean;
}

interface Turn {
  turn: number;
  userMessage: string;
  agentResponse: string;
  latencyMs: number;
  relevancyScore: number;
}

interface Conversation {
  id: string;
  personaName: string;
  scenario: string;
  turns: Turn[];
  totalTurns: number;
  completed: boolean;
  avgRelevancyScore: number;
  completenessScore: number;
  overallScore: number;
}

// ── Persona Library ───────────────────────────────────────────────────────────

const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: "cooperative", name: "Cooperative Customer", industry: "general",
    goals: "Get help completing a task efficiently with minimal friction",
    knowledgeLevel: "medium", emotionalState: "positive", communicationStyle: "formal", adversarialLevel: 1,
    description: "Helpful, patient, follows instructions well",
  },
  {
    id: "frustrated", name: "Frustrated Customer", industry: "general",
    goals: "Resolve an ongoing issue that has not been fixed after multiple attempts",
    knowledgeLevel: "medium", emotionalState: "frustrated", communicationStyle: "casual", adversarialLevel: 3,
    description: "Impatient, prone to complaints, needs empathy",
  },
  {
    id: "non-native", name: "Non-Native English Speaker", industry: "general",
    goals: "Understand product policies and complete a transaction",
    knowledgeLevel: "low", emotionalState: "confused", communicationStyle: "formal", adversarialLevel: 1,
    description: "May use simplified sentences, occasional grammar issues",
  },
  {
    id: "fraud-attempt", name: "Attempted Fraud Customer", industry: "general",
    goals: "Obtain refund or service outside normal eligibility rules",
    knowledgeLevel: "high", emotionalState: "manipulative", communicationStyle: "formal", adversarialLevel: 5,
    description: "Tries policy loopholes, escalates threats",
  },
  {
    id: "elderly", name: "Elderly Customer", industry: "general",
    goals: "Get simple help navigating a digital service",
    knowledgeLevel: "low", emotionalState: "cautious", communicationStyle: "verbose", adversarialLevel: 1,
    description: "Asks for clarification often, not tech-savvy",
  },
  {
    id: "tech-savvy", name: "Tech-Savvy Power User", industry: "general",
    goals: "Access advanced features and API capabilities",
    knowledgeLevel: "high", emotionalState: "neutral", communicationStyle: "terse", adversarialLevel: 1,
    description: "Skips basic explanations, wants precise technical answers",
  },
  {
    id: "banking-hnw", name: "High Net Worth Client", industry: "banking",
    goals: "Review portfolio performance and discuss investment rebalancing",
    knowledgeLevel: "high", emotionalState: "demanding", communicationStyle: "formal", adversarialLevel: 2,
    description: "Expects personalized, premium-level service",
  },
  {
    id: "banking-mortgage", name: "First-Time Mortgage Applicant", industry: "banking",
    goals: "Understand mortgage options and qualification requirements",
    knowledgeLevel: "low", emotionalState: "anxious", communicationStyle: "verbose", adversarialLevel: 1,
    description: "Overwhelmed by jargon, needs step-by-step guidance",
  },
  {
    id: "healthcare-patient", name: "Anxious Patient", industry: "healthcare",
    goals: "Understand diagnosis results and treatment options",
    knowledgeLevel: "low", emotionalState: "anxious", communicationStyle: "verbose", adversarialLevel: 1,
    description: "Emotional, seeks reassurance, may ask same question multiple ways",
  },
  {
    id: "healthcare-caregiver", name: "Caregiver (Proxy)", industry: "healthcare",
    goals: "Coordinate care and medication schedules for a family member",
    knowledgeLevel: "medium", emotionalState: "stressed", communicationStyle: "formal", adversarialLevel: 2,
    description: "Managing multiple concerns, needs clear action items",
  },
  {
    id: "insurance-adjuster", name: "Claims Adjuster", industry: "insurance",
    goals: "Validate claim details and process documentation efficiently",
    knowledgeLevel: "high", emotionalState: "neutral", communicationStyle: "terse", adversarialLevel: 1,
    description: "Professional, systematic, expects precise answers",
  },
  {
    id: "insurance-disputed", name: "Disputed Claim Holder", industry: "insurance",
    goals: "Challenge a denied insurance claim and request escalation",
    knowledgeLevel: "medium", emotionalState: "angry", communicationStyle: "formal", adversarialLevel: 4,
    description: "Combative, references legal rights, demands supervisor",
  },
  {
    id: "retail-loyal", name: "Loyal Returning Customer", industry: "retail",
    goals: "Make a repeat purchase and check loyalty rewards balance",
    knowledgeLevel: "medium", emotionalState: "positive", communicationStyle: "casual", adversarialLevel: 1,
    description: "Brand-positive, references past purchases, easy to satisfy",
  },
  {
    id: "retail-returner", name: "Serial Returner", industry: "retail",
    goals: "Return a product outside the return window citing policy exceptions",
    knowledgeLevel: "high", emotionalState: "pushy", communicationStyle: "casual", adversarialLevel: 4,
    description: "Tests policy boundaries, references competitor policies",
  },
  {
    id: "legal-selfrepresented", name: "Self-Represented Litigant", industry: "legal",
    goals: "Understand court filing procedures without an attorney",
    knowledgeLevel: "low", emotionalState: "overwhelmed", communicationStyle: "verbose", adversarialLevel: 1,
    description: "Needs plain-language explanations of legal processes",
  },
  {
    id: "legal-compliance", name: "Corporate Compliance Officer", industry: "legal",
    goals: "Verify regulatory compliance requirements for a new product launch",
    knowledgeLevel: "high", emotionalState: "neutral", communicationStyle: "formal", adversarialLevel: 2,
    description: "Detail-oriented, needs citations and specific regulatory references",
  },
];

const INDUSTRY_COLORS: Record<string, string> = {
  general: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  banking: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  healthcare: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  insurance: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  retail: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  legal: "bg-red-500/10 text-red-600 border-red-500/20",
};

const ADVERSARIAL_COLOR = (level: number) => {
  if (level <= 1) return "text-emerald-600";
  if (level <= 2) return "text-blue-600";
  if (level <= 3) return "text-amber-600";
  return "text-red-600";
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "agent", label: "Target Agent" },
  { id: "personas", label: "Personas" },
  { id: "scenarios", label: "Scenarios" },
  { id: "parameters", label: "Parameters" },
  { id: "review", label: "Review" },
  { id: "save", label: "Save" },
];

const SIM_MODELS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (recommended)" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 (highest fidelity)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (fastest)" },
];

const STOP_CONDITIONS_PRESETS = [
  "issue resolved",
  "goodbye",
  "thank you",
  "escalating to human",
  "case closed",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EvalSimulator() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(0);

  // Step 0: Agent
  const [selectedAgentId, setSelectedAgentId] = useState("");

  // Step 1: Personas
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customDraft, setCustomDraft] = useState<Omit<Persona, "id" | "isCustom">>({
    name: "", description: "", goals: "", knowledgeLevel: "medium",
    emotionalState: "neutral", communicationStyle: "formal", adversarialLevel: 1,
  });
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  // Step 2: Scenarios
  const [scenarios, setScenarios] = useState<string[]>([""]);

  // Step 3: Parameters
  const [maxTurns, setMaxTurns] = useState(5);
  const [simModel, setSimModel] = useState("claude-sonnet-4-5");
  const [stopConditions, setStopConditions] = useState<string[]>([]);
  const [customStop, setCustomStop] = useState("");
  const [metricCollectionId, setMetricCollectionId] = useState("");

  // Step 4: Review (results)
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [simProgress, setSimProgress] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);

  // Step 5: Save
  const [saveDatasetId, setSaveDatasetId] = useState("");
  const [saveNewName, setSaveNewName] = useState("");
  const [saveMode, setSaveMode] = useState<"existing" | "new">("existing");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());
  const [persistTraces, setPersistTraces] = useState(true);
  const [promoteToDataset, setPromoteToDataset] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: datasets } = useQuery<EvalDataset[]>({ queryKey: ["/api/eval/datasets"] });
  const { data: metricCollections } = useQuery<EvalMetricCollection[]>({ queryKey: ["/api/eval/metric-collections"] });

  const allPersonas = [...BUILT_IN_PERSONAS, ...customPersonas];
  const selectedAgent = agents?.find(a => a.id === selectedAgentId);

  // ── Persona helpers ────────────────────────────────────────────────────────

  const togglePersona = (id: string) => {
    setSelectedPersonaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addCustomPersona = () => {
    if (!customDraft.name.trim() || !customDraft.goals.trim()) {
      toast({ title: "Name and goals are required", variant: "destructive" });
      return;
    }
    const id = `custom-${Date.now()}`;
    const persona: Persona = { ...customDraft, id, isCustom: true };
    setCustomPersonas(prev => [...prev, persona]);
    setSelectedPersonaIds(prev => new Set([...prev, id]));
    setCustomDraft({ name: "", description: "", goals: "", knowledgeLevel: "medium", emotionalState: "neutral", communicationStyle: "formal", adversarialLevel: 1 });
    setShowCustomForm(false);
  };

  const filteredPersonas = industryFilter === "all"
    ? allPersonas
    : allPersonas.filter(p => (p.industry || "general") === industryFilter);

  const industries = ["all", ...Array.from(new Set(allPersonas.map(p => p.industry || "general")))];

  // ── Scenario helpers ───────────────────────────────────────────────────────

  const addScenario = () => setScenarios(prev => [...prev, ""]);
  const updateScenario = (i: number, val: string) => setScenarios(prev => prev.map((s, idx) => idx === i ? val : s));
  const removeScenario = (i: number) => setScenarios(prev => prev.filter((_, idx) => idx !== i));

  // ── Run simulation ─────────────────────────────────────────────────────────

  const runSimulation = async () => {
    const validScenarios = scenarios.filter(s => s.trim());
    if (!validScenarios.length) {
      toast({ title: "Add at least one scenario", variant: "destructive" });
      return;
    }
    const selectedPersonas = allPersonas.filter(p => selectedPersonaIds.has(p.id));
    if (!selectedPersonas.length) {
      toast({ title: "Select at least one persona", variant: "destructive" });
      return;
    }

    try {
      const res = await apiRequest("POST", "/api/eval/simulations", {
        agentId: selectedAgentId,
        personas: selectedPersonas.map(p => ({
          id: p.id, name: p.name, goals: p.goals,
          knowledgeLevel: p.knowledgeLevel, emotionalState: p.emotionalState,
          communicationStyle: p.communicationStyle, adversarialLevel: p.adversarialLevel,
          industry: p.industry,
        })),
        scenarios: validScenarios,
        maxTurns,
        stopConditions,
        model: simModel,
        metricCollectionId: metricCollectionId || undefined,
      });
      const data = await res.json();
      setJobId(data.jobId);
      setJobStatus("running");
      setSimProgress(0);
    } catch (err: any) {
      toast({ title: "Failed to start simulation", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/eval/simulations/${jobId}/status`);
        const data = await res.json();
        setSimProgress(data.progress || 0);
        if (data.status === "completed") {
          setJobStatus("completed");
          setSimProgress(100);
          const convs: Conversation[] = data.conversations || [];
          setConversations(convs);
          const allIds = new Set(convs.map((c: Conversation) => c.id));
          setSelectedConvIds(allIds);
          if (pollRef.current) clearInterval(pollRef.current);
          setStep(4);
        } else if (data.status === "failed") {
          setJobStatus("failed");
          if (pollRef.current) clearInterval(pollRef.current);
          toast({ title: "Simulation failed", description: data.error, variant: "destructive" });
        }
      } catch { }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, jobStatus]);

  // ── Save conversations ─────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!persistTraces && !promoteToDataset) return;
    setIsSaving(true);
    const selectedIds = Array.from(selectedConvIds);

    try {
      // 1. Persist conversation traces (always first if enabled)
      if (persistTraces && jobId && selectedIds.length > 0) {
        await apiRequest("POST", "/api/eval/simulations/persist-traces", {
          jobId,
          conversationIds: selectedIds,
        });
      }

      // 2. Optionally promote turns to a golden dataset
      if (promoteToDataset) {
        let targetId = saveDatasetId;
        if (saveMode === "new") {
          if (!saveNewName.trim()) {
            toast({ title: "Dataset name required", variant: "destructive" });
            setIsSaving(false);
            return;
          }
          const res = await apiRequest("POST", "/api/eval/datasets", {
            name: saveNewName,
            description: `Simulator conversations — ${selectedAgentId}`,
            tags: ["simulated", "conversations"],
          });
          const ds = await res.json();
          targetId = ds.id;
        }
        if (!targetId) {
          toast({ title: "Select a dataset to promote turns", variant: "destructive" });
          setIsSaving(false);
          return;
        }

        const toSave = conversations
          .filter(c => selectedConvIds.has(c.id))
          .flatMap(c => c.turns.map((t, i) => ({
            input: t.userMessage,
            expectedOutput: t.agentResponse,
            retrievalContext: [],
            tags: ["simulated", c.personaName.toLowerCase().replace(/\s+/g, "-"), `turn-${i + 1}`],
            provenance: {
              conversationId: c.id,
              persona: c.personaName,
              scenario: c.scenario,
              turn: t.turn,
              overallScore: c.overallScore,
              simulatedAt: new Date().toISOString(),
            },
          })));

        await apiRequest("POST", `/api/eval/datasets/${targetId}/goldens/bulk`, { goldens: toSave });
        queryClient.invalidateQueries({ queryKey: ["/api/eval/datasets"] });
      }

      const parts: string[] = [];
      if (persistTraces) parts.push(`${selectedIds.length} trace${selectedIds.length !== 1 ? "s" : ""} persisted`);
      if (promoteToDataset) parts.push(`${conversations.filter(c => selectedConvIds.has(c.id)).reduce((s, c) => s + c.totalTurns, 0)} goldens written`);
      toast({ title: "Conversations saved", description: parts.join(" · ") });
      navigate(promoteToDataset ? "/evals/datasets" : "/evals");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Proceed guard ──────────────────────────────────────────────────────────

  const canProceed = () => {
    if (step === 0) return !!selectedAgentId;
    if (step === 1) return selectedPersonaIds.size > 0;
    if (step === 2) return scenarios.some(s => s.trim());
    if (step === 3) return jobStatus === "idle" || jobStatus === "failed";
    return true;
  };

  const handleNext = () => {
    if (step === 3 && (jobStatus === "idle" || jobStatus === "failed")) {
      runSimulation();
      return;
    }
    if (step < STEPS.length - 1) setStep(s => s + 1);
  };

  const totalConversations = selectedPersonaIds.size * scenarios.filter(s => s.trim()).length;
  const avgScore = conversations.length > 0
    ? Math.round(conversations.reduce((s, c) => s + c.overallScore, 0) / conversations.length * 100) / 100
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/evals")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Eval Studio
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Conversation Simulator</h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="border-b px-6 py-3 bg-muted/30">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  i === step ? "bg-primary text-primary-foreground" :
                  i < step ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
                onClick={() => i < step && setStep(i)}
                data-testid={`step-${s.id}`}
              >
                {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 text-center text-[10px]">{i + 1}</span>}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-2xl mx-auto space-y-6">

            {/* ── Step 0: Target Agent ── */}
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Select Target Agent</h2>
                  <p className="text-sm text-muted-foreground">Choose which registered agent the personas will interact with.</p>
                </div>
                <div className="space-y-3">
                  {!agents?.length && (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center py-8 text-center gap-2">
                        <Bot className="w-8 h-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No agents found. Create an agent first.</p>
                      </CardContent>
                    </Card>
                  )}
                  {(agents || []).map(agent => (
                    <Card
                      key={agent.id}
                      className={`cursor-pointer transition-colors ${selectedAgentId === agent.id ? "border-primary bg-primary/5" : "hover:border-primary/30"}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                      data-testid={`card-agent-${agent.id}`}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className={`p-2 rounded-md ${selectedAgentId === agent.id ? "bg-primary/10" : "bg-muted"}`}>
                          <Bot className={`w-5 h-5 ${selectedAgentId === agent.id ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{agent.description || "No description"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {agent.status && (
                            <Badge variant="outline" className="text-[10px]">{agent.status}</Badge>
                          )}
                          {selectedAgentId === agent.id && (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 1: Personas ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold mb-1">User Personas</h2>
                  <p className="text-sm text-muted-foreground">Select personas from the library or create custom ones. {selectedPersonaIds.size} selected.</p>
                </div>

                {/* Industry filter */}
                <div className="flex gap-2 flex-wrap">
                  {industries.map(ind => (
                    <Button
                      key={ind}
                      variant={industryFilter === ind ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIndustryFilter(ind)}
                      data-testid={`filter-industry-${ind}`}
                      className="capitalize text-xs h-7"
                    >
                      {ind}
                    </Button>
                  ))}
                </div>

                {/* Persona grid */}
                <div className="grid grid-cols-1 gap-3">
                  {filteredPersonas.map(persona => {
                    const selected = selectedPersonaIds.has(persona.id);
                    return (
                      <Card
                        key={persona.id}
                        className={`cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "hover:border-primary/30"}`}
                        onClick={() => togglePersona(persona.id)}
                        data-testid={`card-persona-${persona.id}`}
                      >
                        <CardContent className="flex items-center gap-3 p-3">
                          <div className={`p-1.5 rounded-md shrink-0 ${selected ? "bg-primary/10" : "bg-muted"}`}>
                            <User className={`w-4 h-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-medium">{persona.name}</p>
                              {persona.industry && (
                                <Badge variant="outline" className={`text-[9px] capitalize h-4 ${INDUSTRY_COLORS[persona.industry] || ""}`}>
                                  {persona.industry}
                                </Badge>
                              )}
                              {persona.isCustom && (
                                <Badge variant="outline" className="text-[9px] h-4 bg-purple-500/10 text-purple-600 border-purple-500/20">custom</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{persona.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-2.5 h-2.5 ${i < persona.adversarialLevel ? ADVERSARIAL_COLOR(persona.adversarialLevel) : "text-muted-foreground/20"}`}
                                  fill={i < persona.adversarialLevel ? "currentColor" : "none"}
                                />
                              ))}
                            </div>
                            {selected && <CheckCircle className="w-4 h-4 text-primary" />}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Custom persona form */}
                <Button variant="outline" className="w-full" onClick={() => setShowCustomForm(v => !v)} data-testid="button-add-custom-persona">
                  <Plus className="w-4 h-4 mr-1.5" />
                  {showCustomForm ? "Cancel" : "Add Custom Persona"}
                </Button>

                {showCustomForm && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Custom Persona</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input value={customDraft.name} onChange={e => setCustomDraft(p => ({ ...p, name: e.target.value }))} placeholder="Persona name" data-testid="input-persona-name" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Industry</Label>
                          <Select value={customDraft.industry || "general"} onValueChange={v => setCustomDraft(p => ({ ...p, industry: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["general", "banking", "healthcare", "insurance", "retail", "legal"].map(i => (
                                <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Goals *</Label>
                        <Textarea value={customDraft.goals} onChange={e => setCustomDraft(p => ({ ...p, goals: e.target.value }))} placeholder="What does this persona want to accomplish?" className="min-h-[60px] text-xs" data-testid="textarea-persona-goals" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input value={customDraft.description} onChange={e => setCustomDraft(p => ({ ...p, description: e.target.value }))} placeholder="Brief description" data-testid="input-persona-description" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Knowledge Level</Label>
                          <Select value={customDraft.knowledgeLevel} onValueChange={v => setCustomDraft(p => ({ ...p, knowledgeLevel: v as "low" | "medium" | "high" }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Emotional State</Label>
                          <Select value={customDraft.emotionalState} onValueChange={v => setCustomDraft(p => ({ ...p, emotionalState: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["neutral", "positive", "anxious", "frustrated", "angry", "confused", "demanding"].map(e => (
                                <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Communication Style</Label>
                          <Select value={customDraft.communicationStyle} onValueChange={v => setCustomDraft(p => ({ ...p, communicationStyle: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["formal", "casual", "terse", "verbose"].map(c => (
                                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs">Adversarial Level</Label>
                          <span className={`text-xs font-medium ${ADVERSARIAL_COLOR(customDraft.adversarialLevel)}`}>{customDraft.adversarialLevel}/5</span>
                        </div>
                        <Slider min={1} max={5} step={1} value={[customDraft.adversarialLevel]} onValueChange={([v]) => setCustomDraft(p => ({ ...p, adversarialLevel: v }))} data-testid="slider-adversarial" />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Cooperative</span><span>Highly Adversarial</span>
                        </div>
                      </div>
                      <Button onClick={addCustomPersona} className="w-full" data-testid="button-save-custom-persona">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Persona
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── Step 2: Scenarios ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold mb-1">Conversation Scenarios</h2>
                  <p className="text-sm text-muted-foreground">Define the goals or situations the persona will present to the agent.</p>
                </div>

                <div className="space-y-3">
                  {scenarios.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Scenario {i + 1}</Label>
                        <Textarea
                          value={s}
                          onChange={e => updateScenario(i, e.target.value)}
                          placeholder="e.g., I want to dispute a charge on my last invoice and request a full refund..."
                          className="min-h-[60px] text-sm"
                          data-testid={`textarea-scenario-${i}`}
                        />
                      </div>
                      {scenarios.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 mt-5 text-muted-foreground hover:text-destructive" onClick={() => removeScenario(i)} data-testid={`button-remove-scenario-${i}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="w-full" onClick={addScenario} data-testid="button-add-scenario">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Scenario
                </Button>

                <div className="rounded-md border bg-muted/30 p-3 flex items-center gap-2 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    {selectedPersonaIds.size} persona{selectedPersonaIds.size !== 1 ? "s" : ""} × {scenarios.filter(s => s.trim()).length} scenario{scenarios.filter(s => s.trim()).length !== 1 ? "s" : ""} = <span className="font-semibold text-foreground">{totalConversations}</span> conversations
                  </span>
                </div>
              </div>
            )}

            {/* ── Step 3: Parameters ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Simulation Parameters</h2>
                  <p className="text-sm text-muted-foreground">Configure turn limits, stop conditions, and model settings.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Max turns per conversation</Label>
                    <span className="text-sm font-semibold text-primary" data-testid="value-max-turns">{maxTurns}</span>
                  </div>
                  <Slider min={1} max={20} step={1} value={[maxTurns]} onValueChange={([v]) => setMaxTurns(v)} data-testid="slider-max-turns" />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>1</span><span>20</span></div>
                </div>

                <div className="space-y-2">
                  <Label>Simulator model</Label>
                  <Select value={simModel} onValueChange={setSimModel}>
                    <SelectTrigger data-testid="select-sim-model"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIM_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Metric collection selector */}
                <div className="space-y-2">
                  <Label>Pre-compute metrics (optional)</Label>
                  <Select value={metricCollectionId} onValueChange={setMetricCollectionId}>
                    <SelectTrigger data-testid="select-metric-collection"><SelectValue placeholder="No metric collection" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {(metricCollections || []).map(mc => (
                        <SelectItem key={mc.id} value={mc.id}>{mc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Score each turn inline using a saved metric collection.</p>
                </div>

                <div className="space-y-3">
                  <Label>Stop conditions (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {STOP_CONDITIONS_PRESETS.map(sc => (
                      <Badge
                        key={sc}
                        variant={stopConditions.includes(sc) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setStopConditions(prev => prev.includes(sc) ? prev.filter(s => s !== sc) : [...prev, sc])}
                        data-testid={`badge-stop-${sc.replace(/\s+/g, "-")}`}
                      >
                        {sc}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={customStop} onChange={e => setCustomStop(e.target.value)} placeholder="Custom stop phrase..." className="text-sm" data-testid="input-custom-stop" />
                    <Button variant="outline" size="sm" onClick={() => { if (customStop.trim()) { setStopConditions(p => [...p, customStop.trim()]); setCustomStop(""); } }} data-testid="button-add-stop">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs font-medium">Simulation summary</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-muted-foreground">Agent:</span><span className="font-medium truncate">{selectedAgent?.name || "—"}</span>
                      <span className="text-muted-foreground">Conversations:</span><span className="font-medium">{totalConversations}</span>
                      <span className="text-muted-foreground">Max turns each:</span><span className="font-medium">{maxTurns}</span>
                      <span className="text-muted-foreground">Max total turns:</span><span className="font-medium">{totalConversations * maxTurns}</span>
                    </div>
                    {jobStatus === "running" && (
                      <div className="mt-2 space-y-2">
                        <Progress value={simProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">Simulating... {simProgress}%</p>
                      </div>
                    )}
                    {jobStatus === "failed" && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Simulation failed. Click Run to retry.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Step 4: Review ── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold mb-1">Review Conversations</h2>
                  <p className="text-sm text-muted-foreground">{conversations.length} conversations completed. Expand to view turn-by-turn details.</p>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Conversations", value: conversations.length },
                    { label: "Avg Score", value: avgScore },
                    { label: "Avg Turns", value: conversations.length > 0 ? Math.round(conversations.reduce((s, c) => s + c.totalTurns, 0) / conversations.length * 10) / 10 : 0 },
                  ].map(s => (
                    <Card key={s.label}>
                      <CardContent className="p-3 text-center">
                        <div className="text-lg font-bold text-primary">{s.value}</div>
                        <div className="text-[10px] text-muted-foreground">{s.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Conversation list */}
                <div className="space-y-2">
                  {conversations.map(conv => (
                    <Collapsible
                      key={conv.id}
                      open={expandedConvId === conv.id}
                      onOpenChange={open => setExpandedConvId(open ? conv.id : null)}
                    >
                      <CollapsibleTrigger asChild>
                        <Card className="cursor-pointer hover:border-primary/30 transition-colors" data-testid={`card-conv-${conv.id}`}>
                          <CardContent className="flex items-center gap-3 p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium">{conv.personaName}</p>
                                <Badge variant="outline" className={`text-[9px] h-4 ${conv.overallScore >= 0.8 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : conv.overallScore >= 0.6 ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}`}>
                                  {(conv.overallScore * 100).toFixed(0)}%
                                </Badge>
                                <Badge variant="outline" className="text-[9px] h-4">{conv.totalTurns} turns</Badge>
                                {conv.completed && <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">resolved</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{conv.scenario}</p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedConvId === conv.id ? "rotate-180" : ""}`} />
                          </CardContent>
                        </Card>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border border-t-0 rounded-b-lg bg-muted/10 divide-y">
                          {conv.turns.map(t => (
                            <div key={t.turn} className="p-3 space-y-2" data-testid={`turn-${conv.id}-${t.turn}`}>
                              <div className="flex items-start gap-2">
                                <Badge variant="outline" className="text-[9px] h-4 shrink-0 mt-0.5">Turn {t.turn}</Badge>
                                <div className="flex-1 space-y-2">
                                  <div className="rounded-md bg-primary/5 border border-primary/10 p-2">
                                    <p className="text-[10px] font-medium text-primary mb-0.5">User ({conv.personaName})</p>
                                    <p className="text-xs">{t.userMessage}</p>
                                  </div>
                                  <div className="rounded-md bg-muted border p-2">
                                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Agent</p>
                                    <p className="text-xs">{t.agentResponse}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-10">
                                <span>Relevancy: <span className="font-medium text-foreground">{(t.relevancyScore * 100).toFixed(0)}%</span></span>
                                <span>Latency: <span className="font-medium text-foreground">{t.latencyMs}ms</span></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 5: Save ── */}
            {step === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold mb-1">Save Conversations</h2>
                  <p className="text-sm text-muted-foreground">Persist conversation traces and optionally promote turns to a golden dataset.</p>
                </div>

                {/* Conversation selection */}
                <div className="space-y-2">
                  <Label>Select conversations</Label>
                  <div className="space-y-2">
                    {conversations.map(c => (
                      <div key={c.id} className="flex items-center gap-3 p-2 border rounded-md">
                        <Switch
                          checked={selectedConvIds.has(c.id)}
                          onCheckedChange={checked => setSelectedConvIds(prev => { const next = new Set(prev); checked ? next.add(c.id) : next.delete(c.id); return next; })}
                          data-testid={`switch-conv-${c.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.personaName}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.scenario}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{c.totalTurns} turns</Badge>
                          <Badge variant="outline" className={`text-[10px] ${c.overallScore >= 0.8 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
                            {(c.overallScore * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Persist as traces */}
                <Card className={persistTraces ? "border-primary/30 bg-primary/5" : ""}>
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <FileCheck className="w-4 h-4 text-primary" />
                        <p className="text-sm font-medium">Persist as conversation traces</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Store full multi-turn conversations as referenceable trace records. Required for regression comparison.</p>
                    </div>
                    <Switch checked={persistTraces} onCheckedChange={setPersistTraces} data-testid="switch-persist-traces" />
                  </CardContent>
                </Card>

                {/* Promote to dataset */}
                <Card className={promoteToDataset ? "border-primary/30 bg-primary/5" : ""}>
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Database className="w-4 h-4 text-primary" />
                        <p className="text-sm font-medium">Promote turns to golden dataset</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Write each conversation turn as a golden record to an evaluation dataset for future test runs.</p>
                    </div>
                    <Switch checked={promoteToDataset} onCheckedChange={setPromoteToDataset} data-testid="switch-promote-dataset" />
                  </CardContent>
                </Card>

                {promoteToDataset && (
                  <>
                    <div className="flex gap-2">
                      <Button variant={saveMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setSaveMode("existing")} data-testid="tab-save-existing">Existing dataset</Button>
                      <Button variant={saveMode === "new" ? "default" : "outline"} size="sm" onClick={() => setSaveMode("new")} data-testid="tab-save-new">New dataset</Button>
                    </div>

                    {saveMode === "existing" ? (
                      <div className="space-y-2">
                        <Label>Dataset</Label>
                        <Select value={saveDatasetId} onValueChange={setSaveDatasetId}>
                          <SelectTrigger data-testid="select-save-dataset"><SelectValue placeholder="Choose..." /></SelectTrigger>
                          <SelectContent>
                            {(datasets || []).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>New dataset name</Label>
                        <Input value={saveNewName} onChange={e => setSaveNewName(e.target.value)} placeholder="e.g., Simulator Conversations v1" data-testid="input-new-dataset-name" />
                      </div>
                    )}
                  </>
                )}

                <div className="rounded-md border p-3 text-xs space-y-1">
                  <p className="font-medium">Summary</p>
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-muted-foreground">Selected conversations:</span><span className="font-medium">{selectedConvIds.size}</span>
                    <span className="text-muted-foreground">Persist as traces:</span><span className="font-medium">{persistTraces ? "Yes" : "No"}</span>
                    <span className="text-muted-foreground">Promote to dataset:</span><span className="font-medium">{promoteToDataset ? `Yes — ${conversations.filter(c => selectedConvIds.has(c.id)).reduce((s, c) => s + c.totalTurns, 0)} goldens` : "No"}</span>
                  </div>
                </div>

                <Button className="w-full" onClick={handleSave} disabled={isSaving || (!persistTraces && !promoteToDataset)} data-testid="button-save-conversations">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {isSaving ? "Saving..." : `Save ${selectedConvIds.size} Conversations`}
                </Button>
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex justify-between pt-4">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)} data-testid="button-wizard-back">
                <ChevronLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              {step < 4 && (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || jobStatus === "running"}
                  data-testid="button-wizard-next"
                >
                  {step === 3 && (jobStatus === "idle" || jobStatus === "failed") ? (
                    <><Play className="w-4 h-4 mr-1.5" />Run Simulation</>
                  ) : step === 3 && jobStatus === "running" ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Simulating...</>
                  ) : (
                    <>Next<ArrowRight className="w-4 h-4 ml-1.5" /></>
                  )}
                </Button>
              )}
              {step === 4 && (
                <Button onClick={() => setStep(5)} data-testid="button-proceed-save">
                  Save Results
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* ── Right: Status Panel ── */}
        <div className="w-64 border-l bg-muted/20 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Simulation Status
            </h3>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium">Configuration</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent:</span>
                    <span className="font-medium truncate ml-2 max-w-[100px]">{selectedAgent?.name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Personas:</span>
                    <span className="font-medium">{selectedPersonaIds.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scenarios:</span>
                    <span className="font-medium">{scenarios.filter(s => s.trim()).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversations:</span>
                    <span className="font-medium">{totalConversations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max turns:</span>
                    <span className="font-medium">{maxTurns}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {jobStatus === "idle" && (
                <div className="rounded-md border border-dashed p-3">
                  <p className="text-xs text-muted-foreground">Complete the wizard and click Run Simulation to start.</p>
                </div>
              )}

              {jobStatus === "running" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <p className="text-xs font-medium">Running simulations...</p>
                  </div>
                  <Progress value={simProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground text-center">{simProgress}%</p>
                </div>
              )}

              {jobStatus === "completed" && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Simulation complete</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{conversations.length} conversations</p>
                  <p className="text-xs text-muted-foreground">Avg score: {avgScore}</p>
                </div>
              )}

              {selectedPersonaIds.size > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Selected Personas</p>
                    {Array.from(selectedPersonaIds).slice(0, 5).map(id => {
                      const p = allPersonas.find(p => p.id === id);
                      return p ? (
                        <div key={id} className="flex items-center gap-1.5 text-xs">
                          <User className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{p.name}</span>
                        </div>
                      ) : null;
                    })}
                    {selectedPersonaIds.size > 5 && (
                      <p className="text-xs text-muted-foreground">+{selectedPersonaIds.size - 5} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
