import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { GoldenDataset, Agent } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Database, Search, TrendingUp, BarChart3, Trophy, ArrowRight, ArrowLeft, Tag, Users, Target, Layers, Sparkles, Filter, Plus, Loader2, Trash2, Check, Bot, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const industryOptions = [
  { label: "All", value: "all" },
  { label: "Financial Services", value: "financial_services" },
  { label: "Insurance", value: "insurance" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Manufacturing", value: "manufacturing" },
  { label: "Retail", value: "retail" },
  { label: "Technology/SaaS", value: "technology_saas" },
  { label: "Cross-Industry", value: "cross_industry" },
];

const industryLabels: Record<string, string> = {
  financial_services: "Financial Services",
  insurance: "Insurance",
  healthcare: "Healthcare",
  manufacturing: "Manufacturing",
  retail: "Retail",
  technology_saas: "Technology/SaaS",
  cross_industry: "Cross-Industry",
};

const scenarioCategoryColors: Record<string, string> = {
  happyPath: "text-emerald-600 dark:text-emerald-400",
  edgeCases: "text-amber-600 dark:text-amber-400",
  adversarial: "text-purple-600 dark:text-purple-400",
  complianceCritical: "text-red-600 dark:text-red-400",
};

const scenarioCategoryLabels: Record<string, string> = {
  happyPath: "Happy Path",
  edgeCases: "Edge Case",
  adversarial: "Adversarial",
  complianceCritical: "Compliance",
};

const rankColors = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-slate-300/20 text-slate-600 dark:text-slate-300 border-slate-400/30",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
];

const difficultyColors: Record<string, string> = {
  routine: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  complex: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20",
  edge_case: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
  adversarial: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20",
};

const scenarioBadgeColors: Record<string, string> = {
  happy_path: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  edge_case: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
  adversarial: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20",
  compliance_critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20",
};

type ScenarioMix = { happyPath: number; edgeCase: number; adversarial: number; complianceCritical: number };
type DifficultyMix = { routine: number; complex: number; edgeCase: number; adversarial: number };

function adjustMix<T extends Record<string, number>>(current: T, key: keyof T, newValue: number): T {
  const clamped = Math.max(0, Math.min(100, newValue));
  const others = (Object.keys(current) as (keyof T)[]).filter(k => k !== key);
  const otherTotal = others.reduce((s, k) => s + (current[k] as number), 0);
  const remaining = 100 - clamped;
  const updated = { ...current, [key]: clamped } as T;
  if (otherTotal === 0) {
    const each = Math.floor(remaining / others.length);
    others.forEach((k, i) => {
      (updated as any)[k] = i === others.length - 1 ? remaining - each * (others.length - 1) : each;
    });
  } else {
    let allocated = 0;
    others.forEach((k, i) => {
      if (i === others.length - 1) {
        (updated as any)[k] = Math.max(0, remaining - allocated);
      } else {
        const share = Math.round(((current[k] as number) / otherTotal) * remaining);
        (updated as any)[k] = share;
        allocated += share;
      }
    });
  }
  return updated;
}

function MixBar({ label, value, color, onInc, onDec }: {
  label: string; value: number; color: string;
  onInc: () => void; onDec: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-xs"
          onClick={onDec} disabled={value <= 0}>−</Button>
        <span className="text-sm font-medium w-9 text-center tabular-nums">{value}%</span>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-xs"
          onClick={onInc} disabled={value >= 100}>+</Button>
      </div>
    </div>
  );
}

const STEP_LABELS = ["Context", "Design", "Preview", "Save"];

export default function GoldenDatasetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("browser");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIndustry, setNewIndustry] = useState("financial_services");
  const [newUseCase, setNewUseCase] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wIndustry, setWIndustry] = useState("financial_services");
  const [wAgentId, setWAgentId] = useState("none");
  const [wUseCase, setWUseCase] = useState("");
  const [suggestedUseCases, setSuggestedUseCases] = useState<string[]>([]);
  const [wCount, setWCount] = useState(10);
  const [wScenarioMix, setWScenarioMix] = useState<ScenarioMix>({ happyPath: 30, edgeCase: 25, adversarial: 25, complianceCritical: 20 });
  const [wDifficultyMix, setWDifficultyMix] = useState<DifficultyMix>({ routine: 40, complex: 30, edgeCase: 20, adversarial: 10 });
  const [wIncludeDataRecords, setWIncludeDataRecords] = useState(false);
  const [previewCases, setPreviewCases] = useState<any[]>([]);
  const [wName, setWName] = useState("");
  const [wVersion, setWVersion] = useState("1.0.0");

  const resetWizard = () => {
    setWizardStep(1);
    setWIndustry("financial_services");
    setWAgentId("none");
    setWUseCase("");
    setSuggestedUseCases([]);
    setWCount(10);
    setWScenarioMix({ happyPath: 30, edgeCase: 25, adversarial: 25, complianceCritical: 20 });
    setWDifficultyMix({ routine: 40, complex: 30, edgeCase: 20, adversarial: 10 });
    setWIncludeDataRecords(false);
    setPreviewCases([]);
    setWName("");
    setWVersion("1.0.0");
  };

  const { data: datasets = [], isLoading } = useQuery<GoldenDataset[]>({ queryKey: ["/api/golden-datasets"] });
  const { data: agents = [] } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/golden-datasets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Dataset created" });
      setCreateOpen(false);
      setNewName(""); setNewDescription(""); setNewUseCase("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/golden-datasets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Dataset deleted" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/golden-datasets/seed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Sample datasets loaded" });
    },
  });

  const suggestMutation = useMutation({
    mutationFn: (industry: string) => apiRequest("POST", "/api/ai/suggest-golden-use-cases", { industry }),
    onSuccess: (data: any) => setSuggestedUseCases(data.useCases || []),
    onError: () => toast({ title: "Could not fetch suggestions", variant: "destructive" }),
  });

  const generatePreviewMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/generate-golden-dataset", data),
    onSuccess: (data: any) => {
      const cases = data.testCases || [];
      setPreviewCases(cases);
      setWName(`${wUseCase} Evaluation Suite`);
      setWizardStep(3);
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/commit-golden-dataset", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Dataset created", description: `${data.testCases?.length} test cases saved` });
      setWizardOpen(false);
      resetWizard();
      if (data.dataset?.id) navigate(`/golden-datasets/${data.dataset.id}`);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return datasets.filter((d) => {
      if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (industryFilter !== "all" && d.industry !== industryFilter) return false;
      return true;
    });
  }, [datasets, searchQuery, industryFilter]);

  const stats = useMemo(() => {
    const totalDatasets = datasets.length;
    const totalTestCases = datasets.reduce((sum, d) => sum + (d.testCaseCount || 0), 0);
    const withCoverage = datasets.filter((d) => d.qualityCoverage !== null && d.qualityCoverage !== undefined);
    const avgCoverage = withCoverage.length > 0 ? withCoverage.reduce((sum, d) => sum + (d.qualityCoverage || 0), 0) / withCoverage.length : 0;
    const withBenchmark = datasets.filter((d) => d.benchmarkAvg !== null && d.benchmarkAvg !== undefined);
    const avgBenchmark = withBenchmark.length > 0 ? withBenchmark.reduce((sum, d) => sum + (d.benchmarkAvg || 0), 0) / withBenchmark.length : 0;
    return { totalDatasets, totalTestCases, avgCoverage, avgBenchmark };
  }, [datasets]);

  const leaderboard = useMemo(() => [...datasets].sort((a, b) => (b.benchmarkAvg || 0) - (a.benchmarkAvg || 0)), [datasets]);

  const topContributors = useMemo(() => {
    const contributorMap = new Map<string, { name: string; count: number }>();
    datasets.forEach((d) => {
      const contribs = d.contributors as Array<{ name?: string; org?: string; count?: number }> | null;
      if (Array.isArray(contribs)) {
        contribs.forEach((c) => {
          const name = c.name || c.org || "Unknown";
          const existing = contributorMap.get(name);
          if (existing) { existing.count += (c.count || 1); }
          else { contributorMap.set(name, { name, count: c.count || 1 }); }
        });
      }
    });
    return Array.from(contributorMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [datasets]);

  const maxTestCaseCount = useMemo(() => Math.max(...datasets.map((d) => d.testCaseCount || 0), 1), [datasets]);

  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (!wUseCase.trim()) { toast({ title: "Please enter a use case", variant: "destructive" }); return; }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      generatePreviewMutation.mutate({
        industry: wIndustry,
        useCase: wUseCase,
        count: wCount,
        agentId: wAgentId !== "none" ? wAgentId : undefined,
        scenarioMix: wScenarioMix,
        difficultyMix: wDifficultyMix,
        preview: true,
      });
    } else if (wizardStep === 3) {
      setWizardStep(4);
    } else if (wizardStep === 4) {
      if (!wName.trim()) { toast({ title: "Please enter a dataset name", variant: "destructive" }); return; }
      commitMutation.mutate({
        industry: wIndustry,
        useCase: wUseCase,
        agentId: wAgentId !== "none" ? wAgentId : undefined,
        testCases: previewCases,
        name: wName,
        version: wVersion,
      });
    }
  };

  if (isLoading) return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-datasets-loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-datasets">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Eval Datasets</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Industry-specific evaluation datasets & benchmarks</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* AI Wizard */}
          <Dialog open={wizardOpen} onOpenChange={(open) => { setWizardOpen(open); if (!open) resetWizard(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-ai-generate-dataset">
                <Sparkles className="w-4 h-4 mr-1.5" />
                AI Generate Dataset
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-ai-wizard">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI-Assisted Golden Dataset
                </DialogTitle>
              </DialogHeader>

              {/* Step indicator */}
              <div className="flex items-center gap-0 mb-2">
                {STEP_LABELS.map((label, idx) => {
                  const step = idx + 1;
                  const done = wizardStep > step;
                  const active = wizardStep === step;
                  return (
                    <div key={step} className={`flex items-center ${idx < STEP_LABELS.length - 1 ? "flex-1" : ""}`}>
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors
                          ${active ? "border-primary bg-primary text-primary-foreground" :
                            done ? "border-primary bg-primary/10 text-primary" :
                            "border-muted-foreground/30 text-muted-foreground"}`}>
                          {done ? <Check className="w-3.5 h-3.5" /> : step}
                        </div>
                        <span className={`text-[10px] font-medium ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>
                          {label}
                        </span>
                      </div>
                      {idx < STEP_LABELS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${done ? "bg-primary" : "bg-muted"}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Context */}
              {wizardStep === 1 && (
                <div className="flex flex-col gap-5" data-testid="wizard-step-1">
                  <div className="flex flex-col gap-2">
                    <Label>Industry</Label>
                    <Select value={wIndustry} onValueChange={(v) => { setWIndustry(v); setSuggestedUseCases([]); }}>
                      <SelectTrigger data-testid="select-wizard-industry">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {industryOptions.filter(o => o.value !== "all").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                      Bind to Agent <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Select value={wAgentId} onValueChange={setWAgentId}>
                      <SelectTrigger data-testid="select-wizard-agent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No agent binding</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {wAgentId !== "none" && (
                      <p className="text-xs text-muted-foreground">Test cases will be grounded in what this agent actually processes.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Use Case</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => suggestMutation.mutate(wIndustry)}
                        disabled={suggestMutation.isPending}
                        data-testid="button-suggest-use-cases"
                      >
                        {suggestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {suggestMutation.isPending ? "Suggesting..." : "Suggest for this industry"}
                      </Button>
                    </div>
                    <Input
                      placeholder="e.g., Fraud Detection Triage, Loan Origination Review..."
                      value={wUseCase}
                      onChange={(e) => setWUseCase(e.target.value)}
                      data-testid="input-wizard-usecase"
                    />
                    {suggestedUseCases.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1" data-testid="suggested-use-cases">
                        {suggestedUseCases.map((uc) => (
                          <button
                            key={uc}
                            type="button"
                            onClick={() => setWUseCase(uc)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer
                              ${wUseCase === uc
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
                            data-testid={`chip-usecase-${uc.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {uc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Scenario Design */}
              {wizardStep === 2 && (
                <div className="flex flex-col gap-5" data-testid="wizard-step-2">
                  <div className="flex flex-col gap-2">
                    <Label>Number of Test Cases</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[5, 10, 20, 50].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setWCount(n)}
                          className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                            ${wCount === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          data-testid={`button-count-${n}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Label>Scenario Distribution</Label>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Total: {Object.values(wScenarioMix).reduce((s, v) => s + v, 0)}%
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/20">
                      <MixBar label="Happy Path" value={wScenarioMix.happyPath} color="bg-emerald-500"
                        onInc={() => setWScenarioMix(adjustMix(wScenarioMix, "happyPath", wScenarioMix.happyPath + 5))}
                        onDec={() => setWScenarioMix(adjustMix(wScenarioMix, "happyPath", wScenarioMix.happyPath - 5))} />
                      <MixBar label="Edge Cases" value={wScenarioMix.edgeCase} color="bg-amber-500"
                        onInc={() => setWScenarioMix(adjustMix(wScenarioMix, "edgeCase", wScenarioMix.edgeCase + 5))}
                        onDec={() => setWScenarioMix(adjustMix(wScenarioMix, "edgeCase", wScenarioMix.edgeCase - 5))} />
                      <MixBar label="Adversarial" value={wScenarioMix.adversarial} color="bg-purple-500"
                        onInc={() => setWScenarioMix(adjustMix(wScenarioMix, "adversarial", wScenarioMix.adversarial + 5))}
                        onDec={() => setWScenarioMix(adjustMix(wScenarioMix, "adversarial", wScenarioMix.adversarial - 5))} />
                      <MixBar label="Compliance Critical" value={wScenarioMix.complianceCritical} color="bg-red-500"
                        onInc={() => setWScenarioMix(adjustMix(wScenarioMix, "complianceCritical", wScenarioMix.complianceCritical + 5))}
                        onDec={() => setWScenarioMix(adjustMix(wScenarioMix, "complianceCritical", wScenarioMix.complianceCritical - 5))} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Label>Difficulty Distribution</Label>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Total: {Object.values(wDifficultyMix).reduce((s, v) => s + v, 0)}%
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/20">
                      <MixBar label="Routine" value={wDifficultyMix.routine} color="bg-emerald-500"
                        onInc={() => setWDifficultyMix(adjustMix(wDifficultyMix, "routine", wDifficultyMix.routine + 5))}
                        onDec={() => setWDifficultyMix(adjustMix(wDifficultyMix, "routine", wDifficultyMix.routine - 5))} />
                      <MixBar label="Complex" value={wDifficultyMix.complex} color="bg-blue-500"
                        onInc={() => setWDifficultyMix(adjustMix(wDifficultyMix, "complex", wDifficultyMix.complex + 5))}
                        onDec={() => setWDifficultyMix(adjustMix(wDifficultyMix, "complex", wDifficultyMix.complex - 5))} />
                      <MixBar label="Edge Case" value={wDifficultyMix.edgeCase} color="bg-amber-500"
                        onInc={() => setWDifficultyMix(adjustMix(wDifficultyMix, "edgeCase", wDifficultyMix.edgeCase + 5))}
                        onDec={() => setWDifficultyMix(adjustMix(wDifficultyMix, "edgeCase", wDifficultyMix.edgeCase - 5))} />
                      <MixBar label="Adversarial" value={wDifficultyMix.adversarial} color="bg-red-500"
                        onInc={() => setWDifficultyMix(adjustMix(wDifficultyMix, "adversarial", wDifficultyMix.adversarial + 5))}
                        onDec={() => setWDifficultyMix(adjustMix(wDifficultyMix, "adversarial", wDifficultyMix.adversarial - 5))} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-sm">Include Data Records</Label>
                      <p className="text-xs text-muted-foreground">Also generate input/output record pairs for automated scoring</p>
                    </div>
                    <Switch
                      checked={wIncludeDataRecords}
                      onCheckedChange={setWIncludeDataRecords}
                      data-testid="switch-include-data-records"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Preview & Curate */}
              {wizardStep === 3 && (
                <div className="flex flex-col gap-4" data-testid="wizard-step-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">{previewCases.length} test cases generated</p>
                      <p className="text-xs text-muted-foreground">Remove any that don't fit. Nothing is saved yet.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => generatePreviewMutation.mutate({
                        industry: wIndustry, useCase: wUseCase, count: wCount,
                        agentId: wAgentId !== "none" ? wAgentId : undefined,
                        scenarioMix: wScenarioMix, difficultyMix: wDifficultyMix, preview: true,
                      })}
                      disabled={generatePreviewMutation.isPending}
                      data-testid="button-regenerate-all"
                    >
                      {generatePreviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Regenerate All
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
                    {previewCases.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                        <Database className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No test cases — click Regenerate All</p>
                      </div>
                    )}
                    {previewCases.map((tc, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10 group"
                        data-testid={`preview-case-${idx}`}
                      >
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate">{tc.name || "Untitled"}</span>
                            <Badge variant="outline" className={`text-[10px] ${scenarioBadgeColors[tc.scenarioCategory] || ""}`}>
                              {tc.scenarioCategory?.replace(/_/g, " ") || "—"}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${difficultyColors[tc.difficultyTier] || ""}`}>
                              {tc.difficultyTier?.replace(/_/g, " ") || "—"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{tc.expectedBehavior}</p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => setPreviewCases(prev => prev.filter((_, i) => i !== idx))}
                          data-testid={`button-remove-case-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {previewCases.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {["happy_path", "edge_case", "adversarial", "compliance_critical"].map((cat) => {
                        const count = previewCases.filter(tc => tc.scenarioCategory === cat).length;
                        if (count === 0) return null;
                        return (
                          <Badge key={cat} variant="outline" className={`text-[10px] ${scenarioBadgeColors[cat]}`}>
                            {count} {cat.replace(/_/g, " ")}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Save */}
              {wizardStep === 4 && (
                <div className="flex flex-col gap-4" data-testid="wizard-step-4">
                  <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">{previewCases.length} test cases ready to save</p>
                      <p className="text-xs text-muted-foreground">{wUseCase} · {industryLabels[wIndustry] || wIndustry}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Dataset Name</Label>
                    <Input
                      value={wName}
                      onChange={(e) => setWName(e.target.value)}
                      placeholder="Dataset name..."
                      data-testid="input-wizard-name"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Version</Label>
                    <Input
                      value={wVersion}
                      onChange={(e) => setWVersion(e.target.value)}
                      placeholder="1.0.0"
                      className="w-32"
                      data-testid="input-wizard-version"
                    />
                  </div>
                </div>
              )}

              {/* Wizard navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : setWizardOpen(false)}
                  disabled={generatePreviewMutation.isPending || commitMutation.isPending}
                  data-testid="button-wizard-back"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {wizardStep === 1 ? "Cancel" : "Back"}
                </Button>
                <Button
                  type="button"
                  onClick={handleWizardNext}
                  disabled={
                    generatePreviewMutation.isPending || commitMutation.isPending ||
                    (wizardStep === 1 && !wUseCase.trim()) ||
                    (wizardStep === 3 && previewCases.length === 0) ||
                    (wizardStep === 4 && !wName.trim())
                  }
                  data-testid="button-wizard-next"
                >
                  {(generatePreviewMutation.isPending || commitMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  )}
                  {wizardStep === 2 && !generatePreviewMutation.isPending && <Sparkles className="w-4 h-4 mr-1.5" />}
                  {wizardStep === 4 ? (commitMutation.isPending ? "Saving..." : "Save Dataset") :
                   wizardStep === 2 ? (generatePreviewMutation.isPending ? "Generating..." : "Generate Preview") :
                   wizardStep === 3 ? "Looks Good →" :
                   "Next →"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Manual create dialog */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-dataset">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Eval Dataset</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input placeholder="Dataset name..." value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-create-name" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description</Label>
                  <Textarea placeholder="Describe the evaluation dataset..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} data-testid="input-create-description" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Industry</Label>
                  <Select value={newIndustry} onValueChange={setNewIndustry}>
                    <SelectTrigger data-testid="select-create-industry"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {industryOptions.filter(o => o.value !== "all").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Use Case</Label>
                  <Input placeholder="e.g., Customer Support, Risk Assessment..." value={newUseCase} onChange={(e) => setNewUseCase(e.target.value)} data-testid="input-create-usecase" />
                </div>
                <Button
                  onClick={() => createMutation.mutate({ name: newName, description: newDescription, industry: newIndustry, useCase: newUseCase, version: "1.0.0", status: "active" })}
                  disabled={!newName.trim() || !newUseCase.trim() || createMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                  {createMutation.isPending ? "Creating..." : "Create Dataset"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="h-auto gap-1 flex-wrap" data-testid="golden-datasets-tabs">
          <TabsTrigger value="browser" data-testid="tab-browser" className="gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Dataset Browser
          </TabsTrigger>
          <TabsTrigger value="evolution" data-testid="tab-evolution" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Evolution Dashboard
          </TabsTrigger>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard" className="gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            Benchmark Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browser" className="mt-0">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 flex-wrap" data-testid="filter-bar">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search datasets..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-datasets"
                />
              </div>
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-industry-filter">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                  <Database className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-state">No datasets found</p>
                  {datasets.length === 0 && !searchQuery && industryFilter === "all" && (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs text-muted-foreground">Get started by loading sample datasets or generating with AI</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-load-samples">
                          {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Database className="w-4 h-4 mr-1.5" />}
                          {seedMutation.isPending ? "Loading..." : "Load Sample Datasets"}
                        </Button>
                        <Button variant="outline" onClick={() => setWizardOpen(true)} data-testid="button-empty-ai-generate">
                          <Sparkles className="w-4 h-4 mr-1.5" />
                          AI Generate Dataset
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((dataset) => {
                  const scenarios = dataset.scenarioCategories as Record<string, number> | null;
                  const coveragePercent = (dataset.qualityCoverage || 0) * 100;
                  return (
                    <div key={dataset.id}>
                      <Card className="hover-elevate cursor-pointer" data-testid={`card-dataset-${dataset.id}`} onClick={() => navigate(`/golden-datasets/${dataset.id}`)}>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium truncate" data-testid={`text-dataset-name-${dataset.id}`}>
                            {dataset.name}
                          </CardTitle>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-version-${dataset.id}`}>
                              v{dataset.version}
                            </Badge>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()} data-testid={`button-delete-dataset-${dataset.id}`}>
                                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Dataset</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete "{dataset.name}" and all its test cases. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(dataset.id); }}
                                    className="bg-destructive text-destructive-foreground"
                                    disabled={deleteMutation.isPending}
                                    data-testid="button-confirm-delete"
                                  >
                                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-dataset-desc-${dataset.id}`}>
                            {dataset.description}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid={`badge-industry-${dataset.id}`}>
                              {industryLabels[dataset.industry] || dataset.industry}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" data-testid={`badge-usecase-${dataset.id}`}>
                              {dataset.useCase}
                            </Badge>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Layers className="w-3 h-3" />
                              <span data-testid={`text-test-count-${dataset.id}`}>{dataset.testCaseCount} test cases</span>
                            </div>
                            {scenarios && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {Object.entries(scenarioCategoryLabels).map(([key, label]) => {
                                  const count = scenarios[key] || 0;
                                  if (count === 0) return null;
                                  return (
                                    <span key={key} className={`text-[10px] font-medium ${scenarioCategoryColors[key]}`}>
                                      {count} {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-muted-foreground">Quality Coverage</span>
                              <span className="text-[10px] font-medium" data-testid={`text-coverage-${dataset.id}`}>{coveragePercent.toFixed(0)}%</span>
                            </div>
                            <Progress value={coveragePercent} className="h-1.5" data-testid={`progress-coverage-${dataset.id}`} />
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Target className="w-3 h-3" />
                              <span data-testid={`text-benchmark-${dataset.id}`}>Benchmark: {((dataset.benchmarkAvg || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span data-testid={`text-contributors-${dataset.id}`}>{dataset.contributorCount}</span>
                            </div>
                          </div>

                          {dataset.tags && dataset.tags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap" data-testid={`tags-${dataset.id}`}>
                              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                              {dataset.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end">
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="evolution" className="mt-0">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="evolution-stats">
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Datasets</span>
                <span className="text-2xl font-semibold" data-testid="stat-total-datasets">{stats.totalDatasets}</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Test Cases</span>
                <span className="text-2xl font-semibold" data-testid="stat-total-test-cases">{stats.totalTestCases}</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Avg Quality Coverage</span>
                <span className="text-2xl font-semibold" data-testid="stat-avg-coverage">{(stats.avgCoverage * 100).toFixed(1)}%</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Avg Benchmark Score</span>
                <span className="text-2xl font-semibold" data-testid="stat-avg-benchmark">{(stats.avgBenchmark * 100).toFixed(1)}%</span>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Dataset Sizes</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">{datasets.length} datasets</Badge>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {datasets.map((d) => (
                    <div key={d.id} className="flex items-center gap-3" data-testid={`growth-bar-${d.id}`}>
                      <span className="text-xs text-muted-foreground w-32 truncate shrink-0">{d.name}</span>
                      <div className="flex-1 h-5 rounded-md bg-muted/50 relative">
                        <div className="h-full rounded-md bg-chart-2" style={{ width: `${((d.testCaseCount || 0) / maxTestCaseCount) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium w-12 text-right shrink-0">{d.testCaseCount}</span>
                    </div>
                  ))}
                  {datasets.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No datasets available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Top Contributors</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">{topContributors.length} contributors</Badge>
              </CardHeader>
              <CardContent>
                {topContributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No contributor data available</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {topContributors.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border" data-testid={`contributor-${i}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{c.count} contributions</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Trophy className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Benchmark Leaderboard</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">{leaderboard.length} datasets</Badge>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Trophy className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No datasets to rank</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {leaderboard.map((dataset, i) => {
                    const rank = i + 1;
                    const rankColor = rank <= 3 ? rankColors[rank - 1] : "bg-muted/50 text-muted-foreground border-border";
                    return (
                      <Link key={dataset.id} href={`/golden-datasets/${dataset.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-md border border-border hover-elevate cursor-pointer" data-testid={`leaderboard-row-${dataset.id}`}>
                          <Badge variant="outline" className={`text-xs font-bold w-8 justify-center shrink-0 ${rankColor}`}>
                            {rank}
                          </Badge>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-sm font-medium truncate" data-testid={`leaderboard-name-${dataset.id}`}>{dataset.name}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{industryLabels[dataset.industry] || dataset.industry}</Badge>
                              <span className="text-xs text-muted-foreground">{dataset.testCaseCount} cases</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 flex-wrap">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-muted-foreground">Benchmark</span>
                              <span className="text-sm font-semibold" data-testid={`leaderboard-benchmark-${dataset.id}`}>
                                {((dataset.benchmarkAvg || 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-muted-foreground">Coverage</span>
                              <span className="text-sm font-medium" data-testid={`leaderboard-coverage-${dataset.id}`}>
                                {((dataset.qualityCoverage || 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
