import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ContextProfile } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import {
  Brain, Layers, BookOpen, Shield, MessageSquare, Database, Wrench,
  ArrowUp, ArrowDown, Plus, Trash2, Settings, Sparkles, Eye, BarChart3,
  ChevronDown, ChevronRight, Loader2, Lightbulb, RefreshCcw, Zap,
} from "lucide-react";

type ContextSource = {
  id: string;
  name: string;
  category: string;
  description: string;
  tokenAllocation: number;
  maxTokens: number;
  enabled: boolean;
  priority: number;
  refreshStrategy: string;
};

const CATEGORIES = [
  "System Instructions",
  "Industry Ontology",
  "Regulatory Context",
  "Skill Instructions",
  "Conversation History",
  "Retrieved Knowledge",
  "Tool Descriptions",
] as const;

const CATEGORY_ICONS: Record<string, typeof Settings> = {
  "System Instructions": Settings,
  "Industry Ontology": BookOpen,
  "Regulatory Context": Shield,
  "Skill Instructions": Layers,
  "Conversation History": MessageSquare,
  "Retrieved Knowledge": Database,
  "Tool Descriptions": Wrench,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "System Instructions": "Core agent persona and behavioral rules",
  "Industry Ontology": "Domain concepts, relationships, terminology from Knowledge Graph",
  "Regulatory Context": "Active policies from Policy-as-Code engine",
  "Skill Instructions": "Procedural knowledge from active Agent Skills",
  "Conversation History": "Prior interactions in the session",
  "Retrieved Knowledge": "Documents and data from RAG/vector stores",
  "Tool Descriptions": "Available tool schemas and usage instructions",
};

const DEFAULT_ALLOCATIONS: Record<string, number> = {
  "System Instructions": 4000,
  "Industry Ontology": 16000,
  "Regulatory Context": 24000,
  "Skill Instructions": 12000,
  "Conversation History": 20000,
  "Retrieved Knowledge": 18000,
  "Tool Descriptions": 8000,
};

const INDUSTRY_PRESETS: Record<string, string[]> = {
  healthcare: [
    "Regulatory Context", "Skill Instructions", "Industry Ontology",
    "Conversation History", "Tool Descriptions", "Retrieved Knowledge", "System Instructions",
  ],
  financial_services: [
    "Regulatory Context", "System Instructions", "Industry Ontology",
    "Skill Instructions", "Conversation History", "Tool Descriptions", "Retrieved Knowledge",
  ],
  insurance: [
    "Regulatory Context", "Industry Ontology", "Skill Instructions",
    "System Instructions", "Conversation History", "Tool Descriptions", "Retrieved Knowledge",
  ],
};

const TASK_TYPES = [
  "Compliance Check",
  "Risk Assessment",
  "Claims Processing",
  "Customer Inquiry",
  "Data Analysis",
];

const SAMPLE_CONTENT: Record<string, Record<string, string>> = {
  "System Instructions": {
    "Compliance Check": "You are a compliance verification agent. Always cite regulatory sources. Never provide legal advice directly. Escalate ambiguous cases to human reviewers.",
    "Risk Assessment": "You are a risk analysis agent. Quantify risks on a 1-10 scale. Consider both probability and impact. Flag any risk above threshold 7 for immediate review.",
    "Claims Processing": "You are a claims processing agent. Verify all documentation before approval. Follow the claims adjudication workflow. Maintain audit trail for every decision.",
    "Customer Inquiry": "You are a helpful customer service agent. Be professional and empathetic. Escalate complex issues. Never share internal policies or customer data.",
    "Data Analysis": "You are a data analysis agent. Present findings with statistical confidence. Visualize trends where possible. Flag anomalies and outliers.",
  },
  "Industry Ontology": {
    "Compliance Check": "Domain concepts: Regulatory Framework, Compliance Requirement, Control Objective, Risk Category, Audit Finding, Remediation Plan...",
    "Risk Assessment": "Domain concepts: Risk Factor, Exposure Level, Mitigation Strategy, Risk Appetite, Key Risk Indicator, Loss Event...",
    "Claims Processing": "Domain concepts: Claim Type, Coverage Verification, Adjudication, Subrogation, Reserve Estimation, Settlement...",
    "Customer Inquiry": "Domain concepts: Service Level, Customer Segment, Product Category, Issue Classification, Resolution Path...",
    "Data Analysis": "Domain concepts: Data Source, Metric Definition, Aggregation Method, Statistical Model, Trend Pattern...",
  },
  "Regulatory Context": {
    "Compliance Check": "Active policies: GDPR Article 22 (automated decisions), EU AI Act Article 14 (human oversight), SOX Section 404 (internal controls)...",
    "Risk Assessment": "Active policies: Basel III capital requirements, DORA operational resilience, MiFID II suitability requirements...",
    "Claims Processing": "Active policies: Solvency II reporting, NAIC Model Laws, state insurance regulations, IFRS 17 measurement...",
    "Customer Inquiry": "Active policies: TCPA communication rules, CCPA data access rights, FCA treating customers fairly...",
    "Data Analysis": "Active policies: GDPR data minimization, cross-border transfer restrictions, data retention limits...",
  },
  "Skill Instructions": {
    "Compliance Check": "Step 1: Identify applicable regulations. Step 2: Map controls to requirements. Step 3: Assess control effectiveness. Step 4: Document findings...",
    "Risk Assessment": "Step 1: Identify risk factors. Step 2: Assess probability and impact. Step 3: Calculate risk score. Step 4: Recommend mitigations...",
    "Claims Processing": "Step 1: Validate claim submission. Step 2: Verify coverage. Step 3: Assess damages. Step 4: Calculate settlement. Step 5: Issue decision...",
    "Customer Inquiry": "Step 1: Classify inquiry type. Step 2: Retrieve relevant information. Step 3: Formulate response. Step 4: Verify accuracy...",
    "Data Analysis": "Step 1: Connect to data sources. Step 2: Clean and validate data. Step 3: Apply analytical models. Step 4: Generate insights...",
  },
  "Conversation History": {
    "Compliance Check": "[Previous messages in session providing context about the compliance review in progress...]",
    "Risk Assessment": "[Previous messages discussing risk factors and assessment criteria...]",
    "Claims Processing": "[Previous messages about the claim being processed, including submitted documents...]",
    "Customer Inquiry": "[Previous messages from the customer describing their issue and any prior attempts to resolve...]",
    "Data Analysis": "[Previous messages specifying data requirements and analysis parameters...]",
  },
  "Retrieved Knowledge": {
    "Compliance Check": "Retrieved documents: Compliance Manual v3.2, Recent audit findings Q4 2025, Regulatory update bulletin...",
    "Risk Assessment": "Retrieved documents: Risk assessment framework, Historical loss data, Industry benchmark report...",
    "Claims Processing": "Retrieved documents: Policy terms and conditions, Claims handling procedures, Adjuster guidelines...",
    "Customer Inquiry": "Retrieved documents: Product FAQ, Service level agreements, Known issues database...",
    "Data Analysis": "Retrieved documents: Data dictionary, Previous analysis reports, Statistical methodology guide...",
  },
  "Tool Descriptions": {
    "Compliance Check": "Available tools: compliance_checker(regulation, control) -> ComplianceResult, evidence_collector(source) -> Evidence[], report_generator(findings) -> Report",
    "Risk Assessment": "Available tools: risk_scorer(factors) -> RiskScore, scenario_simulator(params) -> SimResult, alert_sender(risk, channel) -> void",
    "Claims Processing": "Available tools: document_verifier(doc) -> VerificationResult, coverage_checker(policy, claim) -> CoverageResult, payment_processor(amount) -> PaymentResult",
    "Customer Inquiry": "Available tools: knowledge_search(query) -> SearchResult[], ticket_creator(issue) -> TicketId, escalation_router(issue, priority) -> Assignment",
    "Data Analysis": "Available tools: data_query(sql) -> DataSet, chart_generator(data, type) -> Chart, anomaly_detector(series) -> Anomaly[]",
  },
};

const industryOptions = [
  { label: "All", value: "all" },
  { label: "Financial Services", value: "financial_services" },
  { label: "Insurance", value: "insurance" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Manufacturing", value: "manufacturing" },
  { label: "Retail", value: "retail" },
];

function makeDefaultSources(industry: string): ContextSource[] {
  return CATEGORIES.map((cat, i) => ({
    id: `src-${Date.now()}-${i}`,
    name: cat,
    category: cat,
    description: CATEGORY_DESCRIPTIONS[cat],
    tokenAllocation: DEFAULT_ALLOCATIONS[cat],
    maxTokens: DEFAULT_ALLOCATIONS[cat] * 2,
    enabled: true,
    priority: i + 1,
    refreshStrategy: cat === "Conversation History" ? "per-request" : cat === "Retrieved Knowledge" ? "per-request" : "static",
  }));
}

function makeBudgetAllocations(sources: ContextSource[]): Record<string, number> {
  const allocs: Record<string, number> = {};
  sources.forEach((s) => {
    allocs[s.category] = (allocs[s.category] || 0) + s.tokenAllocation;
  });
  return allocs;
}

export default function ContextStudioPage() {
  const [activeTab, setActiveTab] = useState("source-inventory");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDesc, setNewProfileDesc] = useState("");
  const [newProfileIndustry, setNewProfileIndustry] = useState("financial_services");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceCategory, setNewSourceCategory] = useState<string>(CATEGORIES[0]);
  const [newSourceDesc, setNewSourceDesc] = useState("");
  const [newSourceTokens, setNewSourceTokens] = useState(4000);
  const [newSourceStrategy, setNewSourceStrategy] = useState("static");
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<string[] | null>(null);
  const [simulationScore, setSimulationScore] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [taskType, setTaskType] = useState("Compliance Check");
  const { toast } = useToast();
  const { industry: currentIndustry } = useIndustry();

  const { data: profiles = [], isLoading } = useQuery<ContextProfile[]>({
    queryKey: ["/api/context-profiles"],
  });

  const filteredProfiles = useMemo(() => {
    if (industryFilter === "all") return profiles;
    return profiles.filter((p) => p.industry === industryFilter);
  }, [profiles, industryFilter]);

  const activeProfile = useMemo(() => {
    if (selectedProfileId) return profiles.find((p) => p.id === selectedProfileId) || null;
    if (filteredProfiles.length > 0) return filteredProfiles[0];
    return null;
  }, [selectedProfileId, profiles, filteredProfiles]);

  const sources = useMemo(() => {
    if (!activeProfile) return [];
    return (activeProfile.sources as ContextSource[]) || [];
  }, [activeProfile]);

  const priorityOrder = useMemo(() => {
    if (!activeProfile) return [...CATEGORIES];
    const order = (activeProfile.priorityOrder as string[]) || [];
    if (order.length === 0) return [...CATEGORIES];
    return order;
  }, [activeProfile]);

  const budgetAllocations = useMemo(() => {
    if (!activeProfile) return {};
    return (activeProfile.budgetAllocations as Record<string, number>) || {};
  }, [activeProfile]);

  const totalUsed = useMemo(() => {
    return Object.values(budgetAllocations).reduce((s, v) => s + v, 0);
  }, [budgetAllocations]);

  const totalCapacity = activeProfile?.totalCapacity || 128000;

  const createProfileMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; industry: string }) => {
      const defaultSources = makeDefaultSources(data.industry);
      const body = {
        name: data.name,
        description: data.description,
        industry: data.industry,
        sources: defaultSources,
        priorityOrder: [...CATEGORIES],
        budgetAllocations: makeBudgetAllocations(defaultSources),
        totalCapacity: 128000,
        status: "active",
      };
      const res = await apiRequest("POST", "/api/context-profiles", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-profiles"] });
      setSelectedProfileId(data.id);
      setNewProfileOpen(false);
      setNewProfileName("");
      setNewProfileDesc("");
      toast({ title: "Profile created" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/context-profiles/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-profiles"] });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/context-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-profiles"] });
      setSelectedProfileId(null);
      toast({ title: "Profile deleted" });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/context-profiles/${id}/optimize`);
      return res.json();
    },
    onSuccess: (data) => {
      const suggestions = data.suggestions || data.recommendations || [];
      setOptimizeSuggestions(
        Array.isArray(suggestions) ? suggestions.map((s: string | { text?: string; suggestion?: string }) => typeof s === "string" ? s : s.text || s.suggestion || JSON.stringify(s)) : ["No specific suggestions available."]
      );
    },
  });

  function updateSources(newSources: ContextSource[]) {
    if (!activeProfile) return;
    const newAllocations = makeBudgetAllocations(newSources);
    updateProfileMutation.mutate({
      id: activeProfile.id,
      updates: { sources: newSources, budgetAllocations: newAllocations },
    });
  }

  function updatePriorityOrder(newOrder: string[]) {
    if (!activeProfile) return;
    updateProfileMutation.mutate({
      id: activeProfile.id,
      updates: { priorityOrder: newOrder },
    });
  }

  function toggleSourceEnabled(sourceId: string) {
    const updated = sources.map((s) => s.id === sourceId ? { ...s, enabled: !s.enabled } : s);
    updateSources(updated);
  }

  function updateSourceTokens(sourceId: string, tokens: number) {
    const updated = sources.map((s) => s.id === sourceId ? { ...s, tokenAllocation: tokens } : s);
    updateSources(updated);
  }

  function removeSource(sourceId: string) {
    const updated = sources.filter((s) => s.id !== sourceId);
    updateSources(updated);
  }

  function addSource() {
    const newSource: ContextSource = {
      id: `src-${Date.now()}`,
      name: newSourceName,
      category: newSourceCategory,
      description: newSourceDesc,
      tokenAllocation: newSourceTokens,
      maxTokens: newSourceTokens * 2,
      enabled: true,
      priority: sources.length + 1,
      refreshStrategy: newSourceStrategy,
    };
    updateSources([...sources, newSource]);
    setAddSourceOpen(false);
    setNewSourceName("");
    setNewSourceDesc("");
    setNewSourceTokens(4000);
    toast({ title: "Source added" });
  }

  function movePriority(index: number, direction: "up" | "down") {
    const order = [...priorityOrder];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    updatePriorityOrder(order);
  }

  function applyPreset(preset: string) {
    const order = INDUSTRY_PRESETS[preset];
    if (order) updatePriorityOrder(order);
    toast({ title: `Applied ${preset.replace("_", " ")} preset` });
  }

  function toggleSection(category: string) {
    setExpandedSections((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  function simulateQuality() {
    const regAlloc = budgetAllocations["Regulatory Context"] || 0;
    const ontAlloc = budgetAllocations["Industry Ontology"] || 0;
    const total = totalUsed || 1;
    const regRatio = regAlloc / total;
    const ontRatio = ontAlloc / total;
    const base = 65;
    const bonus = (regRatio * 20) + (ontRatio * 15);
    setSimulationScore(Math.min(98, Math.round(base + bonus)));
  }

  const qualityPrediction = useMemo(() => {
    const regAlloc = budgetAllocations["Regulatory Context"] || 0;
    const ontAlloc = budgetAllocations["Industry Ontology"] || 0;
    const total = totalUsed || 1;
    const base = 60;
    const bonus = ((regAlloc / total) * 25) + ((ontAlloc / total) * 15);
    return Math.min(98, Math.round(base + bonus));
  }, [budgetAllocations, totalUsed]);

  const groupedSources = useMemo(() => {
    const groups: Record<string, ContextSource[]> = {};
    CATEGORIES.forEach((cat) => { groups[cat] = []; });
    sources.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return groups;
  }, [sources]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6" data-testid="page-context-studio">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-context-studio">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
                Context Engineering Studio
              </h1>
              <Badge variant="outline" className="text-[10px]">NEW</Badge>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Systematic management of what agents know and when they know it
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-industry-filter">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              {industryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeProfile?.id || ""}
            onValueChange={(v) => setSelectedProfileId(v)}
          >
            <SelectTrigger className="w-[200px]" data-testid="select-profile">
              <SelectValue placeholder="Select profile..." />
            </SelectTrigger>
            <SelectContent>
              {filteredProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setNewProfileOpen(true)} data-testid="button-new-profile">
            <Plus className="w-4 h-4 mr-1.5" />
            New Profile
          </Button>
        </div>
      </div>

      {!activeProfile && profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Brain className="w-12 h-12 text-muted-foreground/40" />
            <h2 className="text-lg font-medium" data-testid="text-empty-title">Get Started</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Create your first context profile to define how context flows into your AI agent execution.
            </p>
            <Button
              onClick={() => {
                const ind = currentIndustry?.id || "financial_services";
                const defaultSources = makeDefaultSources(ind);
                createProfileMutation.mutate({
                  name: `${ind.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} Default Profile`,
                  description: `Default context profile for ${ind.replace("_", " ")}`,
                  industry: ind,
                });
              }}
              disabled={createProfileMutation.isPending}
              data-testid="button-get-started"
            >
              {createProfileMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
              Create Default Profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
          <TabsList className="h-auto gap-1 flex-wrap">
            <TabsTrigger value="source-inventory" data-testid="tab-source-inventory" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Source Inventory
            </TabsTrigger>
            <TabsTrigger value="priority-matrix" data-testid="tab-priority-matrix" className="gap-1.5">
              <ArrowUp className="w-3.5 h-3.5" />
              Priority Matrix
            </TabsTrigger>
            <TabsTrigger value="budget-visualizer" data-testid="tab-budget-visualizer" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Budget Visualizer
            </TabsTrigger>
            <TabsTrigger value="compilation-preview" data-testid="tab-compilation-preview" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Compilation Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="source-inventory" className="mt-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-medium">Context Sources</h2>
                <Button onClick={() => setAddSourceOpen(true)} data-testid="button-add-source">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Source
                </Button>
              </div>
              {CATEGORIES.map((cat) => {
                const catSources = groupedSources[cat] || [];
                if (catSources.length === 0) return null;
                const Icon = CATEGORY_ICONS[cat];
                return (
                  <div key={cat} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">{cat}</h3>
                      <Badge variant="outline" className="text-[10px]">{catSources.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {catSources.map((source) => (
                        <Card key={source.id} data-testid={`card-source-${source.id}`}>
                          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium truncate">{source.name}</CardTitle>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px]">
                                {source.refreshStrategy}
                              </Badge>
                              <Switch
                                checked={source.enabled}
                                onCheckedChange={() => toggleSourceEnabled(source.id)}
                                data-testid={`switch-source-${source.id}`}
                              />
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <p className="text-xs text-muted-foreground line-clamp-2">{source.description}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label className="text-xs">Tokens:</Label>
                              <Input
                                type="number"
                                className="w-24"
                                value={source.tokenAllocation}
                                onChange={(e) => updateSourceTokens(source.id, parseInt(e.target.value) || 0)}
                                data-testid={`input-tokens-${source.id}`}
                              />
                              <span className="text-xs text-muted-foreground">/ {source.maxTokens.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeSource(source.id)}
                                data-testid={`button-remove-source-${source.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="priority-matrix" className="mt-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">Industry Presets:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("healthcare")}
                  data-testid="button-preset-healthcare"
                >
                  Healthcare Default
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("financial_services")}
                  data-testid="button-preset-financial"
                >
                  Financial Services Default
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("insurance")}
                  data-testid="button-preset-insurance"
                >
                  Insurance Default
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {priorityOrder.map((cat, index) => {
                  const Icon = CATEGORY_ICONS[cat] || Settings;
                  const allocation = budgetAllocations[cat] || 0;
                  return (
                    <Card key={cat} data-testid={`card-priority-${index}`}>
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{cat}</p>
                          <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[cat]}</p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {allocation.toLocaleString()} tokens
                        </Badge>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={index === 0}
                            onClick={() => movePriority(index, "up")}
                            data-testid={`button-priority-up-${index}`}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={index === priorityOrder.length - 1}
                            onClick={() => movePriority(index, "down")}
                            data-testid={`button-priority-down-${index}`}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="budget-visualizer" className="mt-0">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Context Capacity</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {totalUsed.toLocaleString()} / {totalCapacity.toLocaleString()} tokens
                  </Badge>
                </CardHeader>
                <CardContent>
                  <Progress value={(totalUsed / totalCapacity) * 100} className="h-3" data-testid="progress-total-capacity" />
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      Used: {((totalUsed / totalCapacity) * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Remaining: {(totalCapacity - totalUsed).toLocaleString()} tokens
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Token Allocation by Category</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {CATEGORIES.map((cat) => {
                    const alloc = budgetAllocations[cat] || 0;
                    const pct = totalCapacity > 0 ? (alloc / totalCapacity) * 100 : 0;
                    const Icon = CATEGORY_ICONS[cat];
                    return (
                      <div key={cat} className="flex flex-col gap-1" data-testid={`budget-bar-${cat.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{cat}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{alloc.toLocaleString()} tokens</span>
                            <span className="text-xs text-muted-foreground">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Quality Prediction
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-semibold" data-testid="text-quality-score">{qualityPrediction}</span>
                      <span className="text-sm text-muted-foreground">/ 100</span>
                    </div>
                    <Progress value={qualityPrediction} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Score increases with higher regulatory and ontology context allocation
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Optimization Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button
                      variant="outline"
                      onClick={() => activeProfile && optimizeMutation.mutate(activeProfile.id)}
                      disabled={!activeProfile || optimizeMutation.isPending}
                      data-testid="button-optimize"
                    >
                      {optimizeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCcw className="w-4 h-4 mr-1.5" />
                      )}
                      Optimize
                    </Button>
                    {optimizeSuggestions && (
                      <div className="flex flex-col gap-2">
                        {optimizeSuggestions.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compilation-preview" className="mt-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value="default" onValueChange={() => {}}>
                  <SelectTrigger className="w-[200px]" data-testid="select-agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Agent</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={taskType} onValueChange={setTaskType}>
                  <SelectTrigger className="w-[200px]" data-testid="select-task-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <CardContent className="flex flex-col gap-0 p-0">
                  {priorityOrder.map((cat) => {
                    const alloc = budgetAllocations[cat] || 0;
                    const Icon = CATEGORY_ICONS[cat] || Settings;
                    const expanded = expandedSections[cat] ?? false;
                    const content = SAMPLE_CONTENT[cat]?.[taskType] || "No content available for this task type.";
                    return (
                      <div key={cat} className="border-b last:border-b-0">
                        <button
                          className="flex items-center gap-3 w-full p-4 text-left hover-elevate"
                          onClick={() => toggleSection(cat)}
                          data-testid={`button-toggle-${cat.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1">{cat}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {alloc.toLocaleString()} tokens
                          </Badge>
                        </button>
                        {expanded && (
                          <div className="px-4 pb-4 pl-11">
                            <div className="rounded-md bg-muted p-3">
                              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                                {content}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total tokens:</span>
                  <Badge variant="outline">{totalUsed.toLocaleString()}</Badge>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {simulationScore !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Quality:</span>
                      <Badge variant="outline" data-testid="badge-simulation-score">{simulationScore}/100</Badge>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={simulateQuality}
                    data-testid="button-simulate"
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Simulate Output Quality
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={newProfileOpen} onOpenChange={setNewProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Context Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input
                placeholder="Profile name..."
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                data-testid="input-profile-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this context profile..."
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                data-testid="input-profile-description"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <Select value={newProfileIndustry} onValueChange={setNewProfileIndustry}>
                <SelectTrigger data-testid="select-profile-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.filter((o) => o.value !== "all").map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                createProfileMutation.mutate({
                  name: newProfileName,
                  description: newProfileDesc,
                  industry: newProfileIndustry,
                })
              }
              disabled={!newProfileName.trim() || createProfileMutation.isPending}
              data-testid="button-submit-profile"
            >
              {createProfileMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1.5" />
              )}
              Create Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Context Source</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input
                placeholder="Source name..."
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                data-testid="input-source-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={newSourceCategory} onValueChange={setNewSourceCategory}>
                <SelectTrigger data-testid="select-source-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this source..."
                value={newSourceDesc}
                onChange={(e) => setNewSourceDesc(e.target.value)}
                data-testid="input-source-description"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Token Allocation</Label>
              <Input
                type="number"
                value={newSourceTokens}
                onChange={(e) => setNewSourceTokens(parseInt(e.target.value) || 0)}
                data-testid="input-source-tokens"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Refresh Strategy</Label>
              <Select value={newSourceStrategy} onValueChange={setNewSourceStrategy}>
                <SelectTrigger data-testid="select-source-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="per-request">Per Request</SelectItem>
                  <SelectItem value="periodic">Periodic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={addSource}
              disabled={!newSourceName.trim()}
              data-testid="button-submit-source"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}