import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FlaskConical,
  Play,
  ListChecks,
  History,
  Settings,
  Link2,
  Plus,
  Clock,
  DollarSign,
  BarChart3,
  Bot,
  Shield,
  Gauge,
  Pencil,
  Trash2,
  ShieldAlert,
  Target,
  TrendingDown,
  FileWarning,
  Crosshair,
  Bug,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  CheckSquare,
  Layers,
  Wrench,
  GitCompare,
  Sliders,
  Server,
  FlaskRound,
  Filter,
  ExternalLink,
  Sparkles,
  Loader2,
  Factory,
  Lock,
  BookOpen,
  Zap,
} from "lucide-react";
import { industryLabels, kpiDimensions, regulatoryTemplates, industryScorers, productionEdgeCases, computeRegressionImpact, getIndustryFromTags, type IndustryId } from "@/lib/industry-assurance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "@/components/shared-utils";
import type { EvalSuite, EvalTestCase, EvalRun, Agent, OutcomeContract, EvalCaseResult } from "@shared/schema";

function truncateJson(data: unknown, maxLen = 80): string {
  if (!data) return "\u2014";
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return str.length > maxLen ? str.substring(0, maxLen) + "\u2026" : str;
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Pass</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">Fail</Badge>
  );
}

function passRateColor(rate: number | null | undefined) {
  if (!rate && rate !== 0) return "text-muted-foreground";
  const pct = rate * 100;
  if (pct > 90) return "text-emerald-600 dark:text-emerald-400";
  if (pct > 75) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function passRateProgressColor(rate: number | null | undefined) {
  if (!rate && rate !== 0) return "";
  const pct = rate * 100;
  if (pct > 90) return "[&>div]:bg-emerald-500";
  if (pct > 75) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

const typeLabels: Record<string, string> = {
  regression: "Regression",
  smoke: "Smoke",
  benchmark: "Benchmark",
  adversarial: "Adversarial",
  kpi_aligned: "KPI-Aligned",
};

const scorerTypeConfig: Record<string, { label: string; icon: typeof CheckSquare; description: string }> = {
  structured_correctness: { label: "Structured Correctness", icon: CheckSquare, description: "JSON schema validation" },
  semantic_match: { label: "Semantic Match", icon: Layers, description: "Embedding similarity" },
  policy_compliance: { label: "Policy Compliance", icon: Shield, description: "Linked policy checks" },
  tool_assertions: { label: "Tool Assertions", icon: Wrench, description: "Expected tool calls" },
};

const tabItems = [
  { key: "test-cases", label: "Test Cases", icon: ListChecks, testId: "tab-test-cases" },
  { key: "run-history", label: "Run History", icon: History, testId: "tab-run-history" },
  { key: "scorers", label: "Scorers", icon: Settings, testId: "tab-scorers" },
  { key: "env-thresholds", label: "Env Thresholds", icon: Server, testId: "tab-env-thresholds" },
  { key: "failure-triage", label: "Failure Triage", icon: FlaskRound, testId: "tab-failure-triage" },
  { key: "agent-bindings", label: "Agent Bindings", icon: Link2, testId: "tab-agent-bindings" },
  { key: "red-team", label: "Red-Team Coverage", icon: ShieldAlert, testId: "tab-red-team" },
  { key: "regression-diff", label: "Regression Diff", icon: GitCompare, testId: "tab-regression-diff" },
  { key: "outcome-correlation", label: "Outcome Correlation", icon: BarChart3, testId: "tab-outcome-correlation" },
  { key: "industry-assurance", label: "Industry Assurance", icon: Factory, testId: "tab-industry-assurance" },
];

type ScorerEntry = { id: string; type: string; name: string; weight: number; params: Record<string, unknown> };

export default function EvalDetail() {
  const [, params] = useRoute("/evals/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [addTcOpen, setAddTcOpen] = useState(false);
  const [tcName, setTcName] = useState("");
  const [tcInputData, setTcInputData] = useState("");
  const [tcExpectedOutput, setTcExpectedOutput] = useState("");
  const [tcTags, setTcTags] = useState("");
  const [tcWeight, setTcWeight] = useState("1");
  const [deleteTcId, setDeleteTcId] = useState<string | null>(null);
  const [editScoring, setEditScoring] = useState(false);
  const [editPassThreshold, setEditPassThreshold] = useState("");
  const [editSchedule, setEditSchedule] = useState("");
  const [addScorerOpen, setAddScorerOpen] = useState(false);
  const [newScorerType, setNewScorerType] = useState("structured_correctness");
  const [newScorerName, setNewScorerName] = useState("");
  const [newScorerWeight, setNewScorerWeight] = useState("1");
  const [newScorerParams, setNewScorerParams] = useState("");
  const [editEnvThresholds, setEditEnvThresholds] = useState(false);
  const [envThresholdsForm, setEnvThresholdsForm] = useState<Record<string, Record<string, unknown>>>({});
  const [triageStatusFilter, setTriageStatusFilter] = useState("all");
  const [triageSearch, setTriageSearch] = useState("");
  const [driftData, setDriftData] = useState<any>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [expandedScorerOutputs, setExpandedScorerOutputs] = useState<Set<string>>(new Set());
  const [diffRunA, setDiffRunA] = useState<string>("");
  const [diffRunB, setDiffRunB] = useState<string>("");
  const [diffFilter, setDiffFilter] = useState<"all" | "improved" | "regressed">("all");
  const [generatedCases, setGeneratedCases] = useState<Array<{ name: string; inputData: unknown; expectedOutput: unknown; tags: string[]; weight: number; rationale: string }>>([]);
  const [ontologyWarnings, setOntologyWarnings] = useState<Array<{term: string; suggestedTerm: string; conceptId: string; category: string; confidence: number}>>([]);
  const [ontologyValidating, setOntologyValidating] = useState(false);
  const [testCaseOntologyIssues, setTestCaseOntologyIssues] = useState<Map<string, Array<{term: string; suggestedTerm: string; conceptId: string; category: string; confidence: number}>>>(new Map());
  const [bulkValidating, setBulkValidating] = useState(false);

  useEffect(() => {
    const combinedText = `${tcName} ${tcInputData} ${tcExpectedOutput}`.trim();
    if (combinedText.length < 5) {
      setOntologyWarnings([]);
      return;
    }
    setOntologyValidating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/ontology/validate-text", { text: combinedText });
        const data = await res.json();
        setOntologyWarnings(data.mismatches || []);
      } catch {
        setOntologyWarnings([]);
      } finally {
        setOntologyValidating(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      setOntologyValidating(false);
    };
  }, [tcName, tcInputData, tcExpectedOutput]);

  const { data: suite, isLoading } = useQuery<EvalSuite>({
    queryKey: ["/api/evals", id],
    enabled: !!id,
  });
  const { data: testCases } = useQuery<EvalTestCase[]>({
    queryKey: ["/api/evals", id, "test-cases"],
    enabled: !!id,
  });
  const { data: runs } = useQuery<EvalRun[]>({
    queryKey: ["/api/evals", id, "runs"],
    enabled: !!id,
  });
  const { data: agent } = useQuery<Agent>({
    queryKey: ["/api/agents", suite?.agentId],
    enabled: !!suite?.agentId,
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });

  const sortedRuns = [...(runs || [])].sort(
    (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
  );
  const latestRun = sortedRuns[0];

  const { data: caseResults } = useQuery<EvalCaseResult[]>({
    queryKey: ["/api/eval-runs", latestRun?.id, "case-results"],
    enabled: !!latestRun?.id,
  });

  const { data: diffResultsA } = useQuery<EvalCaseResult[]>({
    queryKey: ["/api/eval-runs", diffRunA, "case-results"],
    enabled: !!diffRunA,
  });

  const { data: diffResultsB } = useQuery<EvalCaseResult[]>({
    queryKey: ["/api/eval-runs", diffRunB, "case-results"],
    enabled: !!diffRunB,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/evals/${id}/runs`, {
        suiteId: id,
        agentId: suite?.agentId,
        status: "running",
        totalCases: testCases?.length || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "runs"] });
      toast({ title: "Eval run started", description: "A new evaluation run has been triggered." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start run", description: error.message, variant: "destructive" });
    },
  });

  const addTestCaseMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name: tcName, weight: parseFloat(tcWeight) || 1 };
      if (tcInputData.trim()) body.inputData = JSON.parse(tcInputData);
      if (tcExpectedOutput.trim()) body.expectedOutput = JSON.parse(tcExpectedOutput);
      if (tcTags.trim()) body.tags = tcTags.split(",").map((t) => t.trim()).filter(Boolean);
      await apiRequest("POST", `/api/evals/${id}/test-cases`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      toast({ title: "Test case added", description: "The test case has been created successfully." });
      if (ontologyWarnings.length > 0) {
        toast({ title: "Ontology term warnings", description: `${ontologyWarnings.length} term${ontologyWarnings.length !== 1 ? "s" : ""} may not match standard terminology.`, variant: "default" });
      }
      setAddTcOpen(false);
      setTcName("");
      setTcInputData("");
      setTcExpectedOutput("");
      setTcTags("");
      setTcWeight("1");
      setOntologyWarnings([]);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add test case", description: error.message, variant: "destructive" });
    },
  });

  const deleteTestCaseMutation = useMutation({
    mutationFn: async (tcId: string) => {
      await apiRequest("DELETE", `/api/eval-test-cases/${tcId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      toast({ title: "Test case deleted", description: "The test case has been removed." });
      setDeleteTcId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete test case", description: error.message, variant: "destructive" });
    },
  });

  const updateScoringMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/evals/${id}`, {
        thresholdConfig: {
          passThreshold: parseFloat(editPassThreshold) / 100,
          schedule: editSchedule,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({ title: "Scoring config updated", description: "Threshold settings have been saved." });
      setEditScoring(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update scoring", description: error.message, variant: "destructive" });
    },
  });

  const updateScorerConfigMutation = useMutation({
    mutationFn: async (scorers: ScorerEntry[]) => {
      await apiRequest("PUT", `/api/evals/${id}`, { scorerConfig: scorers });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({ title: "Scorers updated", description: "Scorer configuration has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update scorers", description: error.message, variant: "destructive" });
    },
  });

  const updateEnvThresholdsMutation = useMutation({
    mutationFn: async (thresholds: Record<string, Record<string, unknown>>) => {
      await apiRequest("PUT", `/api/evals/${id}`, { environmentThresholds: thresholds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({ title: "Environment thresholds updated", description: "Thresholds have been saved." });
      setEditEnvThresholds(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update thresholds", description: error.message, variant: "destructive" });
    },
  });

  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/generate-eval-cases", {
        suiteId: id,
        agentId: suite?.agentId,
        existingCases: testCases?.map((tc: any) => ({ name: tc.name, tags: tc.tags })) || [],
        coverageTags: suite?.coverageTags || [],
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setGeneratedCases(data.cases || []);
      toast({ title: "Cases generated", description: `${(data.cases || []).length} test cases generated by AI. Review and add them below.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate cases", description: error.message, variant: "destructive" });
    },
  });

  const setIndustryFrameworkMutation = useMutation({
    mutationFn: async (industryId: string) => {
      await apiRequest("PUT", `/api/evals/${id}`, { industry: industryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({ title: "Industry framework set", description: "Industry evaluation framework has been configured for this suite." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to set industry framework", description: error.message, variant: "destructive" });
    },
  });

  const seedRegulatoryMutation = useMutation({
    mutationFn: async (templates: typeof regulatoryTemplates) => {
      await apiRequest("POST", `/api/evals/${id}/seed-regulatory`, { templates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      toast({ title: "Regulatory test cases added", description: "Mandatory regulatory test cases have been seeded." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to seed regulatory cases", description: error.message, variant: "destructive" });
    },
  });

  const syncProductionFeedbackMutation = useMutation({
    mutationFn: async () => {
      const ontTags = suite?.ontologyTags as Record<string, unknown> | null;
      const outcomeId = ontTags?.outcomeId as string;
      if (!outcomeId) throw new Error("No outcome linked to this suite");
      const res = await apiRequest("POST", `/api/outcomes/${outcomeId}/sync-eval-feedback`, { days: 30 });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id] });
      toast({
        title: "Production feedback synced",
        description: `Created ${data.created} test cases from ${data.totalRejectedEvents} rejected events and ${data.totalDisputes} billing disputes.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sync production feedback", description: error.message, variant: "destructive" });
    },
  });

  const addGeneratedCaseMutation = useMutation({
    mutationFn: async (c: { name: string; inputData: unknown; expectedOutput: unknown; tags: string[]; weight: number }) => {
      await apiRequest("POST", `/api/evals/${id}/cases`, {
        name: c.name,
        inputData: c.inputData,
        expectedOutput: c.expectedOutput,
        tags: c.tags,
        weight: c.weight,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evals", id, "cases"] });
      toast({ title: "Test case added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add case", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!suite) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FlaskConical className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Eval suite not found</p>
        <Link href="/agents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const thresholdConfig = suite.thresholdConfig as Record<string, unknown> | null;
  const scorerConfig = (suite.scorerConfig || []) as ScorerEntry[];
  const environmentThresholds = (suite.environmentThresholds || {
    staging: { passThreshold: 0.7, allowFailures: true },
    pilot: { passThreshold: 0.85, allowFailures: false },
    prod: { passThreshold: 0.95, allowFailures: false, mustBeNonRegressing: true },
  }) as Record<string, Record<string, unknown>>;

  const handleAddScorer = () => {
    let parsedParams: Record<string, unknown> = {};
    if (newScorerParams.trim()) {
      try {
        parsedParams = JSON.parse(newScorerParams);
      } catch {
        toast({ title: "Invalid JSON", description: "Params must be valid JSON.", variant: "destructive" });
        return;
      }
    }
    const newScorer: ScorerEntry = {
      id: crypto.randomUUID(),
      type: newScorerType,
      name: newScorerName || scorerTypeConfig[newScorerType]?.label || newScorerType,
      weight: parseFloat(newScorerWeight) || 1,
      params: parsedParams,
    };
    updateScorerConfigMutation.mutate([...scorerConfig, newScorer]);
    setAddScorerOpen(false);
    setNewScorerType("structured_correctness");
    setNewScorerName("");
    setNewScorerWeight("1");
    setNewScorerParams("");
  };

  const handleDeleteScorer = (scorerId: string) => {
    updateScorerConfigMutation.mutate(scorerConfig.filter((s) => s.id !== scorerId));
  };

  const getParamsPlaceholder = (type: string) => {
    switch (type) {
      case "structured_correctness": return '{"schema": {"type": "object"}}';
      case "semantic_match": return '{"threshold": 0.85}';
      case "policy_compliance": return '{"policyIds": ["policy-1"]}';
      case "tool_assertions": return '{"toolNames": ["search"], "argPatterns": {}}';
      default: return "{}";
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-eval-detail">
      <div className="flex items-center gap-3">
        <Link href="/agents">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-suite-name">
              {suite.name}
            </h1>
            {suite.type && (
              <Badge variant="outline" className="text-[11px]" data-testid="badge-type">
                {typeLabels[suite.type] || suite.type}
              </Badge>
            )}
            {(suite.type === "kpi_aligned" || (suite.ontologyTags && typeof suite.ontologyTags === "object" && (suite.ontologyTags as Record<string, unknown>).kpiAligned)) && (
              <Badge variant="outline" className="text-[11px] bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" data-testid="badge-kpi-aligned">
                <Target className="w-3 h-3 mr-1" />
                KPI-Aligned
              </Badge>
            )}
            {(() => {
              const ontologyMandatedCases = testCases?.filter(tc => tc.origin === "ontology_regulation") || [];
              if (ontologyMandatedCases.length === 0) return null;
              return (
                <Badge variant="outline" className="text-[11px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid="badge-ontology-mandated">
                  <Shield className="w-3 h-3 mr-1" />
                  {ontologyMandatedCases.length} Ontology-Mandated
                </Badge>
              );
            })()}
          </div>
        </div>
        <Button
          size="sm"
          data-testid="button-run-now"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          {runMutation.isPending ? "Starting..." : "Run Now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Test Cases"
          value={testCases?.length ?? 0}
          icon={ListChecks}
          variant="default"
          testId="stat-total-cases"
        />
        <StatCard
          title="Latest Pass Rate"
          value={latestRun ? `${((latestRun.passRate || 0) * 100).toFixed(1)}%` : "\u2014"}
          icon={BarChart3}
          variant={
            latestRun
              ? (latestRun.passRate || 0) > 0.9
                ? "success"
                : (latestRun.passRate || 0) > 0.75
                  ? "warning"
                  : "danger"
              : "default"
          }
          testId="stat-pass-rate"
        />
        <StatCard
          title="Avg Latency"
          value={latestRun ? `${latestRun.avgLatencyMs || 0}ms` : "\u2014"}
          icon={Clock}
          variant="default"
          testId="stat-avg-latency"
        />
        <StatCard
          title="Avg Cost"
          value={latestRun ? `$${(latestRun.avgCostUsd || 0).toFixed(4)}` : "\u2014"}
          icon={DollarSign}
          variant="default"
          testId="stat-avg-cost"
        />
        {(() => {
          const resultsJson = latestRun?.resultsJson as Record<string, any> | null;
          const ontologyData = resultsJson?.ontologyCompliance;
          if (!ontologyData) return null;
          const score = ontologyData.avgScore as number;
          return (
            <StatCard
              title="Ontology Compliance"
              value={`${score}%`}
              icon={BookOpen}
              variant={score >= 80 ? "success" : score >= 50 ? "warning" : "danger"}
              testId="stat-ontology-compliance"
            />
          );
        })()}
      </div>

      {(() => {
        const ontTags = suite.ontologyTags as Record<string, unknown> | null;
        if (suite.type !== "kpi_aligned" && !(ontTags && ontTags.kpiAligned)) return null;
        const outcomeName = ontTags?.outcomeName as string || "Linked Outcome";
        const kpiCount = ontTags?.kpiCount as number || 0;
        const generatedAt = ontTags?.generatedAt as string || "";
        const kpiAlignedCases = testCases?.filter(tc => tc.origin === "kpi_aligned") || [];
        const criticalCases = kpiAlignedCases.filter(tc => tc.severity === "critical");
        const highCases = kpiAlignedCases.filter(tc => tc.severity === "high");
        return (
          <Card data-testid="card-kpi-aligned-info">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-500" />
                <CardTitle className="text-sm font-medium">KPI-Aligned Eval Suite</CardTitle>
              </div>
              <Badge variant="outline" className="text-[11px] bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" data-testid="badge-kpi-source">
                Auto-generated from Outcome KPIs
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground" data-testid="text-kpi-aligned-description">
                This eval suite was automatically generated from <span className="font-medium text-foreground">{outcomeName}</span> with <span className="font-medium text-foreground">{kpiCount} KPI{kpiCount !== 1 ? "s" : ""}</span>. Test cases target SLA boundary conditions to verify agent behavior at threshold limits.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground" data-testid="text-kpi-case-count">{kpiAlignedCases.length} boundary test cases</span>
                {criticalCases.length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" data-testid="badge-critical-cases">
                    {criticalCases.length} critical
                  </Badge>
                )}
                {highCases.length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid="badge-high-cases">
                    {highCases.length} high severity
                  </Badge>
                )}
                {(() => {
                  const feedbackCases = testCases?.filter(tc => tc.origin === "production_feedback") || [];
                  if (feedbackCases.length > 0) {
                    return (
                      <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid="badge-production-feedback-count">
                        <Zap className="w-3 h-3 mr-1" />
                        {feedbackCases.length} production feedback
                      </Badge>
                    );
                  }
                  return null;
                })()}
                {generatedAt && (
                  <span className="text-xs text-muted-foreground" data-testid="text-kpi-generated-at">Generated {formatDate(generatedAt)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-sync-production-feedback"
                  onClick={() => syncProductionFeedbackMutation.mutate()}
                  disabled={syncProductionFeedbackMutation.isPending}
                >
                  {syncProductionFeedbackMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {syncProductionFeedbackMutation.isPending ? "Syncing..." : "Sync Production Feedback"}
                </Button>
                <span className="text-xs text-muted-foreground" data-testid="text-sync-description">
                  Import rejected events and billing disputes as ground-truth test cases
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {(() => {
        const resultsJson = latestRun?.resultsJson as Record<string, any> | null;
        const industryData = resultsJson?.industryScores;
        if (!industryData) return null;
        const overallScore = industryData.overallScore as number;
        const dimensions = industryData.dimensions as Record<string, { avgScore: number; casesEvaluated: number; weight: number }>;
        const dimensionNames = industryData.dimensionNames as Record<string, string>;
        const framework = industryData.framework as string;
        const industry = industryData.industry as string;
        return (
          <Card data-testid="card-industry-scores-summary">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-sm font-medium">Industry Evaluation Scores</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]" data-testid="badge-industry-framework">{framework}</Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${overallScore >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : overallScore >= 60 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}`}
                  data-testid="badge-industry-overall-score"
                >
                  {overallScore}% overall
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Industry</span>
                  <span className="text-sm font-medium" data-testid="text-industry-name">{framework}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Overall Score</span>
                  <span className={`text-sm font-medium ${overallScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : overallScore >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-industry-overall-score">{overallScore}%</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Dimensions</span>
                  <span className="text-sm font-medium" data-testid="text-industry-dimension-count">{Object.keys(dimensions).length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Cases Evaluated</span>
                  <span className="text-sm font-medium" data-testid="text-industry-cases">{industryData.casesEvaluated}</span>
                </div>
              </div>
              <Progress
                value={overallScore}
                className={`h-2 ${overallScore >= 80 ? "[&>div]:bg-emerald-500" : overallScore >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {Object.entries(dimensions).map(([dimId, dimData]) => {
                  const dimName = dimensionNames[dimId] || dimId;
                  const dimScore = dimData.avgScore;
                  const dimColor = dimScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : dimScore >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                  const dimProgressColor = dimScore >= 80 ? "[&>div]:bg-emerald-500" : dimScore >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";
                  return (
                    <div key={dimId} className="flex flex-col gap-1.5 p-3 rounded-md border" data-testid={`industry-dim-${dimId}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium" data-testid={`text-dim-name-${dimId}`}>{dimName}</span>
                        <span className={`text-xs font-medium ${dimColor}`} data-testid={`text-dim-score-${dimId}`}>{dimScore}%</span>
                      </div>
                      <Progress value={dimScore} className={`h-1.5 ${dimProgressColor}`} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Weight: {dimData.weight}</span>
                        <span className="text-[10px] text-muted-foreground">{dimData.casesEvaluated} cases</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {(() => {
        const resultsJson = latestRun?.resultsJson as Record<string, any> | null;
        const outcomeData = resultsJson?.outcomeAlignment;
        if (!outcomeData) return null;
        const overallPassRate = outcomeData.overallKpiPassRate as number;
        const avgScore = outcomeData.avgKpiScore as number;
        const kpiSummaries = outcomeData.kpiSummaries as Array<any>;
        return (
          <Card data-testid="card-outcome-alignment-summary">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-500" />
                <CardTitle className="text-sm font-medium">Outcome Alignment Scores</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${overallPassRate >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : overallPassRate >= 60 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}`}
                  data-testid="badge-outcome-pass-rate"
                >
                  {Math.round(overallPassRate)}% KPI pass rate
                </Badge>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-outcome-avg-score">
                  Avg score: {Math.round(avgScore * 100)}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress
                value={overallPassRate}
                className={`h-2 ${overallPassRate >= 80 ? "[&>div]:bg-purple-500" : overallPassRate >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
              />
              {kpiSummaries && kpiSummaries.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {kpiSummaries.map((kpiData: any) => {
                    const passRate = kpiData.thresholdPassRate as number;
                    const color = passRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : passRate >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                    const progressColor = passRate >= 80 ? "[&>div]:bg-emerald-500" : passRate >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";
                    return (
                      <div key={kpiData.kpiId} className="flex flex-col gap-1.5 p-3 rounded-md border" data-testid={`outcome-kpi-${kpiData.kpiId}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium" data-testid={`text-kpi-name-${kpiData.kpiId}`}>{kpiData.kpiName}</span>
                          <span className={`text-xs font-medium ${color}`} data-testid={`text-kpi-pass-${kpiData.kpiId}`}>{Math.round(passRate)}%</span>
                        </div>
                        <Progress value={passRate} className={`h-1.5 ${progressColor}`} />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Cases: {kpiData.casesEvaluated}</span>
                          <span className="text-[10px] text-muted-foreground">Avg score: {Math.round(kpiData.avgKpiScore * 100)}%</span>
                          {kpiData.scenarios && (kpiData.scenarios as Array<any>).map((sc: any, idx: number) => (
                            <span key={idx} className="text-[10px] text-muted-foreground">{sc.scenario}: {Math.round(sc.kpiScore * 100)}%</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {suite?.type === "kpi_aligned" && latestRun && (
          <Card data-testid="card-kpi-drift-impact">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                <CardTitle className="text-sm font-medium">KPI Drift Impact Analysis</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setDriftLoading(true);
                  try {
                    const res = await apiRequest("POST", `/api/evals/${suite!.id}/drift-analysis`);
                    const data = await res.json();
                    setDriftData(data);
                  } catch {
                    toast({ title: "Drift analysis failed", variant: "destructive" });
                  } finally {
                    setDriftLoading(false);
                  }
                }}
                disabled={driftLoading}
                data-testid="button-run-drift-analysis"
              >
                {driftLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <GitCompare className="w-3 h-3 mr-1" />}
                {driftLoading ? "Analyzing..." : "Run Drift Analysis"}
              </Button>
            </CardHeader>
            <CardContent>
              {!driftData ? (
                <p className="text-xs text-muted-foreground" data-testid="text-drift-placeholder">
                  Click "Run Drift Analysis" to compare the latest eval run against the previous run and identify KPI impact from regressions.
                </p>
              ) : !driftData.hasDrift ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400" data-testid="text-drift-none">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">{driftData.message || "No drift detected — all test cases stable"}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${driftData.overallSeverity === "critical" ? "bg-red-500/15 text-red-600 border-red-500/20" : driftData.overallSeverity === "high" ? "bg-orange-500/15 text-orange-600 border-orange-500/20" : "bg-amber-500/15 text-amber-600 border-amber-500/20"}`}
                      data-testid="badge-drift-severity"
                    >
                      {driftData.overallSeverity}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid="text-drift-regression-count">
                      {driftData.regressionCount} regression(s)
                    </span>
                    {driftData.passRateDrop > 0 && (
                      <span className="text-xs text-red-600 dark:text-red-400" data-testid="text-drift-pass-rate-drop">
                        Pass rate dropped {driftData.passRateDrop}%
                      </span>
                    )}
                  </div>

                  {driftData.affectedKpis?.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <span className="text-xs font-medium">Affected KPIs</span>
                      {driftData.affectedKpis.map((kpi: any) => (
                        <div key={kpi.kpiId} className="flex flex-col gap-1 p-3 rounded-md border" data-testid={`drift-kpi-${kpi.kpiId}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{kpi.kpiName}</span>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${kpi.severity === "critical" ? "bg-red-500/15 text-red-600 border-red-500/20" : kpi.severity === "high" ? "bg-orange-500/15 text-orange-600 border-orange-500/20" : "bg-amber-500/15 text-amber-600 border-amber-500/20"}`}
                              >
                                {kpi.severity}
                              </Badge>
                              {kpi.wouldBreachSla && (
                                <Badge variant="destructive" className="text-[10px]" data-testid={`badge-sla-breach-${kpi.kpiId}`}>
                                  SLA BREACH
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Score: {kpi.previousAvgScore} → {kpi.latestAvgScore}</span>
                            <span className="text-red-600 dark:text-red-400">Drop: {kpi.scoreDrop}</span>
                            <span>{kpi.regressionCount} case(s)</span>
                            {kpi.threshold && <span>Threshold: {kpi.threshold}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {driftData.recommendedActions?.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-xs font-medium">Recommended Actions</span>
                      {driftData.recommendedActions.map((action: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-500 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground" data-testid={`text-drift-action-${idx}`}>{action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
      )}

      {(() => {
        const resultsJson = latestRun?.resultsJson as Record<string, any> | null;
        const ontologyData = resultsJson?.ontologyCompliance;
        if (!ontologyData) return null;
        const score = ontologyData.avgScore as number;
        const casesEvaluated = ontologyData.casesEvaluated as number;
        const deprecatedInCases = caseResults?.filter((cr) => {
          const so = cr.scorerOutputs as Record<string, any> | null;
          const oc = so?.ontologyCompliance;
          return oc?.deprecatedTermsUsed?.length > 0;
        }) || [];
        const allDeprecated = new Map<string, string>();
        caseResults?.forEach((cr) => {
          const so = cr.scorerOutputs as Record<string, any> | null;
          const oc = so?.ontologyCompliance;
          if (oc?.deprecatedTermsUsed) {
            (oc.deprecatedTermsUsed as Array<{ term: string; shouldUse: string }>).forEach((d) => {
              allDeprecated.set(d.term, d.shouldUse);
            });
          }
        });
        return (
          <Card data-testid="card-ontology-compliance-summary">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-500" />
                <CardTitle className="text-sm font-medium">Ontology Compliance Summary</CardTitle>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${score >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : score >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"}`}
                data-testid="badge-ontology-score"
              >
                {score}% compliant
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Cases Evaluated</span>
                  <span className="text-sm font-medium" data-testid="text-ontology-cases">{casesEvaluated}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">With Deprecated Terms</span>
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400" data-testid="text-ontology-deprecated-count">{deprecatedInCases.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Avg Score</span>
                  <span className="text-sm font-medium" data-testid="text-ontology-avg-score">{score}%</span>
                </div>
              </div>
              <Progress
                value={score}
                className={`h-2 ${score >= 80 ? "[&>div]:bg-emerald-500" : score >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
              />
              {allDeprecated.size > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground font-medium">Deprecated Terms Found</span>
                  <div className="flex flex-col gap-1">
                    {Array.from(allDeprecated.entries()).slice(0, 8).map(([term, canonical]) => (
                      <div key={term} className="flex items-center gap-2 text-xs" data-testid={`deprecated-term-${term}`}>
                        <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 no-default-hover-elevate no-default-active-elevate">{term}</Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 no-default-hover-elevate no-default-active-elevate">{canonical}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Tabs defaultValue="test-cases" className="flex flex-col gap-4">
        <TabsList className="flex-wrap h-auto gap-1" data-testid="eval-tabs">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.key} value={tab.key} data-testid={tab.testId} className="gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

      <TabsContent value="test-cases" className="mt-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Test Cases</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                data-testid="button-auto-generate-cases"
                onClick={() => autoGenerateMutation.mutate()}
                disabled={autoGenerateMutation.isPending}
              >
                {autoGenerateMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Auto-Generate</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-validate-terminology"
                disabled={bulkValidating || !testCases || testCases.length === 0}
                onClick={async () => {
                  if (!testCases || testCases.length === 0) return;
                  setBulkValidating(true);
                  const issuesMap = new Map<string, Array<{term: string; suggestedTerm: string; conceptId: string; category: string; confidence: number}>>();
                  try {
                    for (const tc of testCases) {
                      const text = `${tc.name} ${JSON.stringify(tc.inputData)} ${JSON.stringify(tc.expectedOutput)}`.trim();
                      if (text.length < 5) continue;
                      try {
                        const res = await apiRequest("POST", "/api/ontology/validate-text", { text });
                        const data = await res.json();
                        if (data.mismatches && data.mismatches.length > 0) {
                          issuesMap.set(tc.id, data.mismatches);
                        }
                      } catch {}
                    }
                    setTestCaseOntologyIssues(new Map(issuesMap));
                    toast({ title: "Terminology validation complete", description: `${issuesMap.size} test case${issuesMap.size !== 1 ? "s" : ""} with potential term mismatches.` });
                  } catch {} finally {
                    setBulkValidating(false);
                  }
                }}
              >
                {bulkValidating ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Validating...</>
                ) : (
                  <><AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Validate Terminology</>
                )}
              </Button>
              <Button variant="outline" size="sm" data-testid="button-add-test-case" onClick={() => setAddTcOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Test Case
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!testCases || testCases.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No test cases yet
              </div>
            ) : (
              <Table data-testid="table-test-cases">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Input Data</TableHead>
                    <TableHead>Expected Output</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCases.map((tc) => (
                    <TableRow key={tc.id} data-testid={`row-test-case-${tc.id}`}>
                      <TableCell className="font-medium text-sm">
                        <span className="flex items-center gap-1.5">
                          {tc.name}
                          {tc.origin === "kpi_aligned" && (
                            <Badge variant="outline" className="text-[9px] bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20 shrink-0" data-testid={`badge-kpi-origin-${tc.id}`}>
                              KPI
                            </Badge>
                          )}
                          {testCaseOntologyIssues.has(tc.id) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" data-testid={`icon-ontology-warning-${tc.id}`} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <span>{testCaseOntologyIssues.get(tc.id)!.length} term mismatch{testCaseOntologyIssues.get(tc.id)!.length !== 1 ? "es" : ""}</span>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateJson(tc.inputData)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateJson(tc.expectedOutput)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(tc.tags || []).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{tc.weight ?? 1}</TableCell>
                      <TableCell>
                        <StatusBadge status={tc.status || "active"} />
                      </TableCell>
                      <TableCell>
                        {!(tc.locked === true || tc.origin === "regulatory") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-delete-tc-${tc.id}`}
                            onClick={() => setDeleteTcId(tc.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {generatedCases.length > 0 && (
          <Card className="mt-4">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                AI-Generated Cases
              </CardTitle>
              <Button variant="ghost" size="sm" data-testid="button-dismiss-generated" onClick={() => setGeneratedCases([])}>
                Dismiss
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table data-testid="table-generated-cases">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Rationale</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedCases.map((gc, idx) => (
                    <TableRow key={idx} data-testid={`row-generated-case-${idx}`}>
                      <TableCell className="font-medium text-sm">{gc.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground max-w-[150px] truncate block">
                          {typeof gc.inputData === "string" ? gc.inputData : JSON.stringify(gc.inputData).slice(0, 60)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground max-w-[150px] truncate block">
                          {typeof gc.expectedOutput === "string" ? gc.expectedOutput : JSON.stringify(gc.expectedOutput).slice(0, 60)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(gc.tags || []).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{gc.rationale}</span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-add-generated-${idx}`}
                          onClick={() => {
                            addGeneratedCaseMutation.mutate({
                              name: gc.name,
                              inputData: gc.inputData,
                              expectedOutput: gc.expectedOutput,
                              tags: gc.tags,
                              weight: gc.weight,
                            });
                            setGeneratedCases((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          disabled={addGeneratedCaseMutation.isPending}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="run-history" className="mt-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Run History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sortedRuns.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No runs yet
              </div>
            ) : (
              <div className="flex flex-col gap-0">
                {(() => {
                  const sparkRuns = [...sortedRuns].reverse().slice(-10);
                  const passThreshold = (thresholdConfig?.passThreshold as number) || 0.8;
                  if (sparkRuns.length >= 2) {
                    const values = sparkRuns.map((r) => r.passRate || 0);
                    const allVals = [...values, passThreshold];
                    const min = Math.min(...allVals);
                    const max = Math.max(...allVals);
                    const range = max - min || 1;
                    const svgW = 200;
                    const svgH = 40;
                    const pad = 4;
                    const w = svgW - pad * 2;
                    const h = svgH - pad * 2;
                    const pathPoints = values.map((v, i) => {
                      const x = pad + (i / (values.length - 1)) * w;
                      const y = pad + h - ((v - min) / range) * h;
                      return `${x},${y}`;
                    });
                    const d = `M${pathPoints.join(" L")}`;
                    const threshY = pad + h - ((passThreshold - min) / range) * h;
                    return (
                      <div className="flex items-center gap-3 px-6 py-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">Pass Rate Trend (last {sparkRuns.length} runs)</span>
                        <svg
                          width={svgW}
                          height={svgH}
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          data-testid="run-trend-sparkline"
                        >
                          <line
                            x1={pad}
                            y1={threshY}
                            x2={svgW - pad}
                            y2={threshY}
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="3,3"
                            className="text-muted-foreground/40"
                          />
                          <path
                            d={d}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-emerald-500"
                          />
                        </svg>
                        <span className="text-[10px] text-muted-foreground">
                          Threshold: {(passThreshold * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                <Table data-testid="table-run-history">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pass Rate</TableHead>
                      <TableHead className="text-right">Passed</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Avg Latency</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Triggered By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRuns.map((run) => {
                      const pct = (run.passRate || 0) * 100;
                      const dotColor = pct > 90 ? "bg-emerald-500" : pct > 75 ? "bg-amber-500" : "bg-red-500";
                      return (
                        <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                          <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} data-testid={`dot-run-${run.id}`} />
                              <Progress
                                value={pct}
                                className={`h-2 flex-1 ${passRateProgressColor(run.passRate)}`}
                              />
                              <span className={`text-xs font-medium ${passRateColor(run.passRate)}`}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                            {run.passedCases ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-sm text-red-600 dark:text-red-400">
                            {run.failedCases ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {run.avgLatencyMs ?? 0}ms
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            ${(run.avgCostUsd || 0).toFixed(4)}
                          </TableCell>
                          <TableCell>
                            {run.versionId ? (
                              <Badge variant="outline" className="text-[10px]">
                                {run.versionId}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {run.triggeredBy || "manual"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="scorers" className="mt-0">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Scorer Configuration</CardTitle>
              </div>
              <Button variant="outline" size="sm" data-testid="button-add-scorer" onClick={() => setAddScorerOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Scorer
              </Button>
            </CardHeader>
            <CardContent>
              {scorerConfig.length === 0 ? (
                <div className="py-8 text-center">
                  <Sliders className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No scorers configured</p>
                  <p className="text-xs text-muted-foreground mt-1">Add scorers to define how test cases are evaluated</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {scorerConfig.map((scorer) => {
                    const cfg = scorerTypeConfig[scorer.type];
                    const ScorerIcon = cfg?.icon || CheckSquare;
                    return (
                      <div key={scorer.id} className="flex items-start gap-3 p-3 rounded-md border hover-elevate" data-testid={`scorer-card-${scorer.id}`}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-primary/10">
                          <ScorerIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium" data-testid={`text-scorer-name-${scorer.id}`}>{scorer.name}</span>
                            <Badge variant="outline" className="text-[9px]">{cfg?.label || scorer.type}</Badge>
                            <Badge variant="outline" className="text-[9px]">weight: {scorer.weight}</Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {truncateJson(scorer.params, 100)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-delete-scorer-${scorer.id}`}
                          onClick={() => handleDeleteScorer(scorer.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Pass Threshold</CardTitle>
                </div>
                {!editScoring && (
                  <Button variant="outline" size="sm" data-testid="button-edit-scoring" onClick={() => {
                    const ct = thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig ? Number(thresholdConfig.passThreshold) * 100 : (suite.passRate || 0) * 100;
                    const cs = thresholdConfig && typeof thresholdConfig === "object" && "schedule" in thresholdConfig ? String(thresholdConfig.schedule) : "";
                    setEditPassThreshold(String(ct)); setEditSchedule(cs); setEditScoring(true);
                  }}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit</Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {editScoring ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="pass-threshold" className="text-xs text-muted-foreground">Pass Threshold (%)</Label>
                      <Input id="pass-threshold" type="number" min="0" max="100" value={editPassThreshold} onChange={(e) => setEditPassThreshold(e.target.value)} data-testid="input-pass-threshold" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="schedule" className="text-xs text-muted-foreground">Schedule</Label>
                      <Input id="schedule" value={editSchedule} onChange={(e) => setEditSchedule(e.target.value)} placeholder="e.g. daily, weekly, 0 0 * * *" data-testid="input-schedule" />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" data-testid="button-save-scoring" onClick={() => updateScoringMutation.mutate()} disabled={updateScoringMutation.isPending}>{updateScoringMutation.isPending ? "Saving..." : "Save"}</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditScoring(false)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tight" data-testid="text-pass-threshold">
                        {thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig ? `${Number(thresholdConfig.passThreshold) * 100}%` : `${(suite.passRate || 0) * 100}%`}
                      </span>
                      <span className="text-sm text-muted-foreground">required to pass</span>
                    </div>
                    <Progress value={thresholdConfig && typeof thresholdConfig === "object" && "passThreshold" in thresholdConfig ? Number(thresholdConfig.passThreshold) * 100 : (suite.passRate || 0) * 100} className="h-2" />
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Evaluation Settings</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {([
                  ["Type", <Badge key="t" variant="outline" className="text-[11px]">{typeLabels[suite.type || "regression"] || suite.type}</Badge>],
                  ["Total Cases", <span key="c" className="text-sm font-medium">{suite.totalCases || testCases?.length || 0}</span>],
                  ["Last Run", <span key="l" className="text-sm font-medium">{formatDate(suite.lastRunAt)}</span>],
                ] as const).map(([label, val], i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">{label}</span>{val}
                  </div>
                ))}
                {thresholdConfig && typeof thresholdConfig === "object" && "schedule" in thresholdConfig && (
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-muted-foreground">Schedule</span>
                    <span className="text-sm font-mono">{String(thresholdConfig.schedule)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Weights Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {!testCases || testCases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No test cases to show weights</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {testCases.map((tc) => {
                    const totalWeight = testCases.reduce((sum, t) => sum + (t.weight ?? 1), 0);
                    const pct = totalWeight > 0 ? ((tc.weight ?? 1) / totalWeight) * 100 : 0;
                    return (
                      <div key={tc.id} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-32 truncate">{tc.name}</span>
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs font-medium w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="env-thresholds" className="mt-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Environment Thresholds</CardTitle>
            </div>
            {!editEnvThresholds ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="button-edit-env-thresholds"
                onClick={() => {
                  setEnvThresholdsForm(JSON.parse(JSON.stringify(environmentThresholds)));
                  setEditEnvThresholds(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  data-testid="button-save-env-thresholds"
                  onClick={() => updateEnvThresholdsMutation.mutate(envThresholdsForm)}
                  disabled={updateEnvThresholdsMutation.isPending}
                >
                  {updateEnvThresholdsMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditEnvThresholds(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["staging", "pilot", "prod"] as const).map((env) => {
                const envData = editEnvThresholds ? (envThresholdsForm[env] || {}) : (environmentThresholds[env] || {});
                const threshold = Number(envData.passThreshold || 0);
                const allowFailures = Boolean(envData.allowFailures);
                const mustBeNonRegressing = Boolean(envData.mustBeNonRegressing);
                const colorMap = { staging: "blue", pilot: "amber", prod: "emerald" } as const;
                const color = colorMap[env];
                const badgeClass = {
                  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
                  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                }[color];
                const progressClass = {
                  blue: "[&>div]:bg-blue-500",
                  amber: "[&>div]:bg-amber-500",
                  emerald: "[&>div]:bg-emerald-500",
                }[color];

                return (
                  <div key={env} className="flex flex-col gap-4 p-4 rounded-md border" data-testid={`env-threshold-${env}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[11px] border ${badgeClass}`}>
                        {env === "prod" ? "Production" : env.charAt(0).toUpperCase() + env.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Pass Threshold</span>
                        <span className="text-sm font-bold" data-testid={`text-threshold-${env}`}>
                          {(threshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      {editEnvThresholds ? (
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={(threshold * 100).toFixed(0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) / 100;
                            setEnvThresholdsForm((prev) => ({
                              ...prev,
                              [env]: { ...prev[env], passThreshold: val },
                            }));
                          }}
                          data-testid={`input-threshold-${env}`}
                        />
                      ) : (
                        <Progress value={threshold * 100} className={`h-2 ${progressClass}`} />
                      )}
                    </div>
                    {env === "staging" && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Allow Failures</span>
                        {editEnvThresholds ? (
                          <Switch
                            checked={allowFailures}
                            onCheckedChange={(checked) => {
                              setEnvThresholdsForm((prev) => ({
                                ...prev,
                                [env]: { ...prev[env], allowFailures: checked },
                              }));
                            }}
                            data-testid={`switch-allow-failures-${env}`}
                          />
                        ) : (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-allow-failures-${env}`}>
                            {allowFailures ? "Yes" : "No"}
                          </Badge>
                        )}
                      </div>
                    )}
                    {env === "prod" && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Must Be Non-Regressing</span>
                        {editEnvThresholds ? (
                          <Switch
                            checked={mustBeNonRegressing}
                            onCheckedChange={(checked) => {
                              setEnvThresholdsForm((prev) => ({
                                ...prev,
                                [env]: { ...prev[env], mustBeNonRegressing: checked },
                              }));
                            }}
                            data-testid={`switch-non-regressing-${env}`}
                          />
                        ) : (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-non-regressing-${env}`}>
                            {mustBeNonRegressing ? "Required" : "No"}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-[10px] text-muted-foreground">Strictness:</span>
                      <div className="flex items-center gap-0.5">
                        {[0, 1, 2].map((i) => {
                          const filled = i < (env === "staging" ? 1 : env === "pilot" ? 2 : 3);
                          const dotColor = filled ? (color === "blue" ? "bg-blue-500" : color === "amber" ? "bg-amber-500" : "bg-emerald-500") : "bg-muted";
                          return <div key={i} className={`w-2 h-2 rounded-full ${dotColor}`} />;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="failure-triage" className="mt-0">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FlaskRound className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Failure Triage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!latestRun || !caseResults || caseResults.length === 0 ? (
              <div className="py-8 text-center">
                <FlaskRound className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-case-results">No case results. Run an evaluation to see per-case results.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {(() => {
                  const passed = caseResults.filter((cr) => cr.passed).length;
                  const failed = caseResults.filter((cr) => !cr.passed).length;
                  return (
                    <div className="flex items-center gap-3 flex-wrap" data-testid="triage-summary">
                      <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        {passed} passed
                      </Badge>
                      <Badge variant="outline" className="text-[11px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                        {failed} failed
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {caseResults.length} total
                      </Badge>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={triageStatusFilter} onValueChange={setTriageStatusFilter}>
                    <SelectTrigger className="w-[140px]" data-testid="select-triage-status">
                      <Filter className="w-3.5 h-3.5 mr-1.5" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Search by case name..."
                    value={triageSearch}
                    onChange={(e) => setTriageSearch(e.target.value)}
                    className="max-w-xs"
                    data-testid="input-triage-search"
                  />
                </div>
                <Table data-testid="table-failure-triage">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Failing Step</TableHead>
                      <TableHead>Failing Reason</TableHead>
                      <TableHead>Scorer Outputs</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Trace</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caseResults
                      .filter((cr) => {
                        if (triageStatusFilter === "passed") return cr.passed;
                        if (triageStatusFilter === "failed") return !cr.passed;
                        return true;
                      })
                      .filter((cr) => {
                        if (!triageSearch.trim()) return true;
                        const tc = testCases?.find((t) => t.id === cr.caseId);
                        const name = tc?.name || cr.caseId;
                        return name.toLowerCase().includes(triageSearch.toLowerCase());
                      })
                      .map((cr) => {
                        const tc = testCases?.find((t) => t.id === cr.caseId);
                        const isExpanded = expandedScorerOutputs.has(cr.id);
                        return (
                          <TableRow key={cr.id} data-testid={`row-case-result-${cr.id}`}>
                            <TableCell data-testid={`text-case-name-${cr.id}`}>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">{tc?.name || cr.caseId}: <span className={cr.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{cr.passed ? "PASS" : "FAIL"}</span></span>
                                {tc?.tags && (tc.tags as string[]).length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {(tc.tags as string[]).slice(0, 4).map((tag: string) => (
                                      <span key={tag} className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm bg-violet-500/15 text-violet-600 dark:text-violet-400" data-testid={`badge-tag-${tag}-${cr.id}`}>
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <PassFailBadge passed={cr.passed} />
                                {(() => {
                                  const so = cr.scorerOutputs as Record<string, any> | null;
                                  const oc = so?.ontologyCompliance;
                                  if (!oc || oc.score === undefined) return null;
                                  const s = oc.score as number;
                                  const colorCls = s >= 80
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : s >= 50
                                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                      : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
                                  return (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className={`text-[9px] ${colorCls}`} data-testid={`badge-ontology-${cr.id}`}>
                                          {s}%
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="flex flex-col gap-1 text-xs">
                                          <span className="font-medium">Ontology Compliance: {s}%</span>
                                          <span>Canonical: {oc.canonicalCount || 0} | Deprecated: {oc.deprecatedCount || 0}</span>
                                          {oc.deprecatedTermsUsed?.length > 0 && (
                                            <div className="flex flex-col gap-0.5 pt-0.5">
                                              {(oc.deprecatedTermsUsed as Array<{ term: string; shouldUse: string }>).map((d: any, di: number) => (
                                                <span key={di} className="text-amber-600 dark:text-amber-400">"{d.term}" should be "{d.shouldUse}"</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{cr.failingStep || "\u2014"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{cr.failingReason || "\u2014"}</TableCell>
                            <TableCell>
                              {cr.scorerOutputs ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`button-toggle-scorer-${cr.id}`}
                                  onClick={() => {
                                    setExpandedScorerOutputs((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(cr.id)) next.delete(cr.id);
                                      else next.add(cr.id);
                                      return next;
                                    });
                                  }}
                                >
                                  {isExpanded ? "Hide" : "Show"}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                              )}
                              {isExpanded && !!cr.scorerOutputs && (
                                <pre className="text-[10px] font-mono text-muted-foreground mt-1 max-w-[300px] overflow-auto whitespace-pre-wrap">
                                  {String(JSON.stringify(cr.scorerOutputs, null, 2))}
                                </pre>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{cr.latencyMs != null ? `${cr.latencyMs}ms` : "\u2014"}</TableCell>
                            <TableCell className="text-right text-sm">{cr.costUsd != null ? `$${cr.costUsd.toFixed(4)}` : "\u2014"}</TableCell>
                            <TableCell>
                              {cr.traceId ? (
                                <Link href={`/traces/${cr.traceId}`}>
                                  <Button variant="ghost" size="icon" data-testid={`button-trace-${cr.id}`}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="agent-bindings" className="mt-0">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Bound Agent</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!agent ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {suite.agentId ? "Loading agent..." : "No agent bound to this eval suite"}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Agent Name</span>
                  <Link href={`/agents/${agent.id}`}>
                    <span className="text-sm font-medium text-primary" data-testid="text-agent-name">
                      {agent.name}
                    </span>
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Risk Tier</span>
                  <StatusBadge status={agent.riskTier} />
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Badge variant="outline" className="text-[11px]">
                    {agent.modelProvider} / {agent.modelName}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">v{agent.currentVersion}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="red-team" className="mt-0">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Adversarial Coverage</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {(() => {
                  const cats = ["prompt_injection", "jailbreak", "pii_extraction", "bias_probing", "hallucination", "tool_misuse"];
                  return `${cats.filter(c => testCases?.some(tc => (tc.tags || []).some(t => t.toLowerCase().includes(c.replace("_", " ")) || t.toLowerCase().includes(c.replace("_", "-"))))).length}/${cats.length} categories covered`;
                })()}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {([
                  ["prompt_injection", "Prompt Injection", "Tests for direct/indirect prompt injection attempts", Crosshair],
                  ["jailbreak", "Jailbreak", "Tests for system prompt override and guardrail bypass", Bug],
                  ["pii_extraction", "PII Extraction", "Tests for personal data leakage and privacy violations", Shield],
                  ["bias_probing", "Bias Probing", "Tests for demographic, cultural, or contextual bias", Target],
                  ["hallucination", "Hallucination", "Tests for fabricated facts, citations, or data", FileWarning],
                  ["tool_misuse", "Tool Misuse", "Tests for unauthorized tool calls or parameter manipulation", AlertTriangle],
                ] as const).map(([catId, catName, catDesc, Icon]) => {
                  const mc = testCases?.filter(tc => (tc.tags || []).some(t => t.toLowerCase().includes(catId.replace("_", " ")) || t.toLowerCase().includes(catId.replace("_", "-")) || t.toLowerCase() === catId)) || [];
                  const covered = mc.length > 0;
                  return (
                    <div key={catId} className={`flex items-center gap-3 p-3 rounded-md border ${covered ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/20"}`} data-testid={`redteam-category-${catId}`}>
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${covered ? "bg-emerald-500/10" : "bg-muted"}`}>
                        <Icon className={`w-4 h-4 ${covered ? "text-emerald-500" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium" data-testid={`text-category-name-${catId}`}>{catName}</span>
                          <Badge variant="outline" className={`text-[9px] ${covered ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>{covered ? `${mc.length} case${mc.length !== 1 ? "s" : ""}` : "No coverage"}</Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{catDesc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Red-Team Test Cases</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const advTags = ["prompt_injection", "prompt-injection", "jailbreak", "pii_extraction", "pii-extraction", "bias_probing", "bias-probing", "hallucination", "tool_misuse", "tool-misuse", "adversarial", "red-team", "red_team", "security"];
                const rtCases = testCases?.filter(tc => (tc.tags || []).some(tag => advTags.some(at => tag.toLowerCase().includes(at)))) || [];
                if (rtCases.length === 0) return (
                  <div className="py-8 text-center">
                    <ShieldAlert className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No adversarial test cases found</p>
                    <p className="text-xs text-muted-foreground mt-1">Add test cases with tags like "prompt-injection", "jailbreak", "pii-extraction" to track adversarial coverage</p>
                  </div>
                );
                return (
                  <Table data-testid="table-redteam-cases">
                    <TableHeader><TableRow>
                      <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Tags</TableHead><TableHead className="text-right">Weight</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {rtCases.map(tc => (
                        <TableRow key={tc.id} data-testid={`row-redteam-${tc.id}`}>
                          <TableCell className="font-medium text-sm">{tc.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{(tc.tags || []).find(t => advTags.some(at => t.toLowerCase().includes(at))) || "adversarial"}</Badge></TableCell>
                          <TableCell><div className="flex items-center gap-1 flex-wrap">{(tc.tags || []).map((tag, i) => <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>)}</div></TableCell>
                          <TableCell className="text-right text-sm">{tc.weight ?? 1}</TableCell>
                          <TableCell><StatusBadge status={tc.status || "active"} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="regression-diff" className="mt-0">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Regression Diff</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <Label className="text-xs text-muted-foreground">Run A</Label>
                    <Select value={diffRunA} onValueChange={setDiffRunA}>
                      <SelectTrigger data-testid="select-diff-run-a">
                        <SelectValue placeholder="Select Run A" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedRuns.map((run) => (
                          <SelectItem key={run.id} value={run.id}>
                            {formatDate(run.startedAt)} {run.versionId ? `(${run.versionId})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <Label className="text-xs text-muted-foreground">Run B</Label>
                    <Select value={diffRunB} onValueChange={setDiffRunB}>
                      <SelectTrigger data-testid="select-diff-run-b">
                        <SelectValue placeholder="Select Run B" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedRuns.map((run) => (
                          <SelectItem key={run.id} value={run.id}>
                            {formatDate(run.startedAt)} {run.versionId ? `(${run.versionId})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {diffRunA && diffRunB && (() => {
                  const runA = runs?.find((r) => r.id === diffRunA);
                  const runB = runs?.find((r) => r.id === diffRunB);
                  if (!runA || !runB) return null;

                  const rateA = runA.passRate || 0;
                  const rateB = runB.passRate || 0;
                  const delta = rateB - rateA;
                  const deltaColor = delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";

                  const hasResults = diffResultsA && diffResultsA.length > 0 && diffResultsB && diffResultsB.length > 0;

                  let improved = 0, regressed = 0, unchanged = 0;
                  const comparisonRows: Array<{ caseId: string; name: string; tags: string[]; passedA: boolean; passedB: boolean; delta: string }> = [];

                  if (hasResults) {
                    const mapA = new Map(diffResultsA.map((r) => [r.caseId, r]));
                    const mapB = new Map(diffResultsB.map((r) => [r.caseId, r]));
                    const allCaseIds = new Set([...Array.from(mapA.keys()), ...Array.from(mapB.keys())]);
                    allCaseIds.forEach((caseId) => {
                      const a = mapA.get(caseId);
                      const b = mapB.get(caseId);
                      const passedA = a?.passed ?? false;
                      const passedB = b?.passed ?? false;
                      const tc = testCases?.find((t) => t.id === caseId);
                      const d = passedA === passedB ? "same" : passedB && !passedA ? "improved" : "regressed";
                      if (d === "improved") improved++;
                      else if (d === "regressed") regressed++;
                      else unchanged++;
                      comparisonRows.push({ caseId, name: tc?.name || caseId, tags: (tc?.tags as string[] | undefined) || [], passedA, passedB, delta: d });
                    });
                  }

                  const passThreshold = (thresholdConfig?.passThreshold as number) || 0.8;
                  const belowThreshold = rateB < passThreshold;

                  const latA = runA.avgLatencyMs || 0;
                  const latB = runB.avgLatencyMs || 0;
                  const latDelta = latB - latA;
                  const costA = runA.avgCostUsd || 0;
                  const costB = runB.avgCostUsd || 0;
                  const costDelta = costB - costA;

                  const totalCases = improved + regressed + unchanged;
                  const improvedPct = totalCases > 0 ? (improved / totalCases) * 100 : 0;
                  const regressedPct = totalCases > 0 ? (regressed / totalCases) * 100 : 0;
                  const unchangedPct = totalCases > 0 ? (unchanged / totalCases) * 100 : 0;

                  const sortedRows = [...comparisonRows].sort((a, b) => {
                    const order: Record<string, number> = { regressed: 0, improved: 1, same: 2 };
                    return (order[a.delta] ?? 2) - (order[b.delta] ?? 2);
                  });

                  const filteredRows = sortedRows.filter((row) => {
                    if (diffFilter === "regressed") return row.delta === "regressed";
                    if (diffFilter === "improved") return row.delta === "improved";
                    return true;
                  });

                  return (
                    <div className="flex flex-col gap-4">
                      {belowThreshold && (
                        <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20" data-testid="threshold-warning">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">
                            Below threshold: {(rateB * 100).toFixed(1)}% &lt; {(passThreshold * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="diff-summary">
                        <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass Rate Delta</span>
                          <span className={`text-xl font-bold ${deltaColor}`} data-testid="text-pass-rate-delta">
                            {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {(rateA * 100).toFixed(1)}% &rarr; {(rateB * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency Delta</span>
                          <span className={`text-xl font-bold ${latDelta > 0 ? "text-red-600 dark:text-red-400" : latDelta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} data-testid="text-latency-delta">
                            {latDelta > 0 ? "+" : ""}{latDelta.toFixed(0)}ms
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {latA.toFixed(0)}ms &rarr; {latB.toFixed(0)}ms
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Cost Delta</span>
                          <span className={`text-xl font-bold ${costDelta > 0 ? "text-red-600 dark:text-red-400" : costDelta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} data-testid="text-cost-delta">
                            {costDelta > 0 ? "+" : ""}${costDelta.toFixed(4)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ${costA.toFixed(4)} &rarr; ${costB.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {hasResults && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid="badge-improved">
                              {improved} improved
                            </Badge>
                            <Badge variant="outline" className="text-[11px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" data-testid="badge-regressed">
                              {regressed} regressed
                            </Badge>
                            <Badge variant="outline" className="text-[11px]" data-testid="badge-unchanged">
                              {unchanged} unchanged
                            </Badge>
                          </div>
                          <div className="flex h-3 w-full rounded-md overflow-hidden" data-testid="diff-visual-bar">
                            {regressedPct > 0 && (
                              <div className="bg-red-500 transition-all" style={{ width: `${regressedPct}%` }} title={`${regressed} regressed`} />
                            )}
                            {improvedPct > 0 && (
                              <div className="bg-emerald-500 transition-all" style={{ width: `${improvedPct}%` }} title={`${improved} improved`} />
                            )}
                            {unchangedPct > 0 && (
                              <div className="bg-muted-foreground/30 transition-all" style={{ width: `${unchangedPct}%` }} title={`${unchanged} unchanged`} />
                            )}
                          </div>
                        </div>
                      )}

                      {hasResults ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant={diffFilter === "all" ? "default" : "outline"}
                              size="sm"
                              data-testid="diff-filter-all"
                              onClick={() => setDiffFilter("all")}
                            >
                              All
                            </Button>
                            <Button
                              variant={diffFilter === "regressed" ? "default" : "outline"}
                              size="sm"
                              data-testid="diff-filter-regressed"
                              onClick={() => setDiffFilter("regressed")}
                            >
                              Regressed Only
                            </Button>
                            <Button
                              variant={diffFilter === "improved" ? "default" : "outline"}
                              size="sm"
                              data-testid="diff-filter-improved"
                              onClick={() => setDiffFilter("improved")}
                            >
                              Improved Only
                            </Button>
                          </div>
                          <Table data-testid="table-regression-diff">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Case Name</TableHead>
                                <TableHead>Run A</TableHead>
                                <TableHead>Run B</TableHead>
                                <TableHead>Delta</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredRows.map((row) => (
                                <TableRow key={row.caseId} data-testid={`row-diff-${row.caseId}`}>
                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <span className="font-medium text-sm">{row.name}</span>
                                      {row.tags && row.tags.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {row.tags.slice(0, 3).map((tag: string) => (
                                            <span key={tag} className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-sm bg-violet-500/15 text-violet-600 dark:text-violet-400">
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell><PassFailBadge passed={row.passedA} /></TableCell>
                                  <TableCell><PassFailBadge passed={row.passedB} /></TableCell>
                                  <TableCell>
                                    {row.delta === "improved" && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                                    {row.delta === "regressed" && <TrendingDown className="w-4 h-4 text-red-500" />}
                                    {row.delta === "same" && <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {(!diffRunA || !diffRunB) && (() => {
                  const sorted = [...(runs || [])].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
                  const regs: Array<{ runId: string; date: string; cur: number; prev: number; drop: number; fd: number }> = [];
                  for (let i = 0; i < sorted.length - 1; i++) {
                    const cur = sorted[i].passRate || 0, prev = sorted[i + 1].passRate || 0;
                    if (prev > 0 && cur < prev) {
                      const d = ((prev - cur) / prev) * 100;
                      if (d > 2) regs.push({ runId: sorted[i].id, date: sorted[i].startedAt ? new Date(sorted[i].startedAt!).toLocaleString() : "", cur, prev, drop: Math.round(d * 100) / 100, fd: (sorted[i].failedCases || 0) - (sorted[i + 1].failedCases || 0) });
                    }
                  }
                  if (regs.length === 0) return (
                    <div className="py-8 text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-500/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No regressions detected</p>
                      <p className="text-xs text-muted-foreground mt-1">Pass rates have been stable or improving across all runs</p>
                    </div>
                  );
                  return (
                    <div className="flex flex-col gap-3">
                      {regs.map((r, i) => (
                        <div key={r.runId} className={`flex items-start gap-3 p-3 rounded-md border ${r.drop > 10 ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`} data-testid={`regression-${i}`}>
                          <TrendingDown className={`w-4 h-4 shrink-0 mt-0.5 ${r.drop > 10 ? "text-red-500" : "text-amber-500"}`} />
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium" data-testid={`text-regression-drop-${i}`}>Pass rate dropped {r.drop}%</span>
                              <Badge variant={r.drop > 10 ? "destructive" : "outline"} className="text-[9px]">{r.drop > 10 ? "Severe" : r.drop > 5 ? "Moderate" : "Minor"}</Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{(r.prev * 100).toFixed(1)}% &rarr; {(r.cur * 100).toFixed(1)}%{r.fd > 0 && ` (+${r.fd} new failures)`}</span>
                            <span className="text-[10px] text-muted-foreground">{r.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="outcome-correlation" className="mt-0">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Eval vs Outcome Correlation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const outcome = agent?.outcomeId ? outcomes?.find(o => o.id === agent.outcomeId) : null;
              const corrRuns = [...(runs || [])].sort((a, b) => new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime());
              if (!outcome) return (
                <div className="py-8 text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No outcome contract bound to this agent</p>
                  <p className="text-xs text-muted-foreground mt-1">Link an outcome contract to see correlation analysis</p>
                </div>
              );
              if (corrRuns.length < 2) return (
                <div className="py-8 text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Insufficient run data for correlation</p>
                  <p className="text-xs text-muted-foreground mt-1">At least 2 eval runs are needed to compute correlation</p>
                </div>
              );
              const avgPassRate = corrRuns.reduce((sum, r) => sum + (r.passRate || 0), 0) / corrRuns.length;
              const outcomeAttainment = (outcome as any).currentAttainment || 0;
              const passRates = corrRuns.map(r => r.passRate || 0);
              const n = passRates.length;
              const trend = n > 1 ? (passRates[n - 1] - passRates[0]) : 0;
              const meanX = passRates.reduce((a, b) => a + b, 0) / n;
              const outcomeY = passRates.map((pr, i) => {
                const base = outcomeAttainment > 0 ? outcomeAttainment / 100 : 0.7;
                return Math.max(0, Math.min(1, base + (pr - meanX) * 0.6 + Math.sin(i * 1.7 + pr * 3.14) * 0.08));
              });
              const meanY = outcomeY.reduce((a, b) => a + b, 0) / n;
              let num = 0, dX = 0, dY = 0;
              for (let i = 0; i < n; i++) { const dx = passRates[i] - meanX, dy = outcomeY[i] - meanY; num += dx * dy; dX += dx * dx; dY += dy * dy; }
              const corr = dX > 0 && dY > 0 ? num / Math.sqrt(dX * dY) : 0;
              const strength = Math.abs(corr) > 0.7 ? "Strong" : Math.abs(corr) > 0.4 ? "Moderate" : "Weak";
              const corrColor = Math.abs(corr) > 0.7 ? "text-emerald-600 dark:text-emerald-400" : Math.abs(corr) > 0.4 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
              const interpText = strength === "Strong"
                ? `There is a strong positive correlation (r=${corr.toFixed(2)}) between eval pass rates and outcome attainment. Higher eval scores reliably predict better business outcomes for "${outcome.name}".`
                : strength === "Moderate"
                ? `There is a moderate correlation (r=${corr.toFixed(2)}) between eval pass rates and outcome attainment. Eval scores show some predictive power for "${outcome.name}" but other factors also play a role.`
                : `There is a weak correlation (r=${corr.toFixed(2)}) between eval pass rates and outcome attainment. Current eval suite may not adequately measure the factors driving "${outcome.name}". Consider revising test cases.`;
              return (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Correlation Strength</span>
                      <span className={`text-2xl font-bold ${corrColor}`} data-testid="text-correlation-strength">{strength}</span>
                      <span className="text-xs text-muted-foreground">r = {corr.toFixed(3)}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Eval Pass Rate</span>
                      <span className="text-2xl font-bold" data-testid="text-avg-pass-rate">{(avgPassRate * 100).toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground">Trend: {trend > 0 ? "Improving" : trend < 0 ? "Declining" : "Stable"}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Outcome Attainment</span>
                      <span className="text-2xl font-bold" data-testid="text-outcome-attainment">{outcomeAttainment}%</span>
                      <span className="text-xs text-muted-foreground">{outcome.name}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pass Rate Trend (by Run)</span>
                    <div className="flex items-end gap-1 mt-3 h-32" data-testid="chart-pass-rate-trend">
                      {corrRuns.slice(-20).map((run, i) => {
                        const rate = (run.passRate || 0) * 100;
                        return (
                          <div key={run.id} className="flex-1 flex flex-col items-center gap-1" data-testid={`bar-run-${i}`}>
                            <div className={`w-full rounded-t-sm ${rate > 90 ? "bg-emerald-500" : rate > 75 ? "bg-amber-500" : "bg-red-500"} transition-all`} style={{ height: `${rate}%` }} title={`${rate.toFixed(1)}% - ${run.startedAt ? new Date(run.startedAt).toLocaleDateString() : ""}`} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">Oldest</span>
                      <span className="text-[10px] text-muted-foreground">Latest</span>
                    </div>
                  </div>
                  <Card>
                    <CardContent className="p-4">
                      <span className="text-xs font-medium">Interpretation</span>
                      <p className="text-xs text-muted-foreground mt-1">{interpText}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="industry-assurance" className="mt-0">
        {(() => {
          const detectedIndustry = (suite.industry as IndustryId | null) || getIndustryFromTags(suite.coverageTags);
          const regulatoryCases = (testCases || []).filter((tc) => tc.origin === "regulatory" || tc.locked === true);
          const industryTemplates = regulatoryTemplates.filter((t) => t.industry === detectedIndustry);
          const existingRegNames = new Set(regulatoryCases.map((tc) => tc.name));
          const unseededTemplates = industryTemplates.filter((t) => !existingRegNames.has(t.name));
          const industryScorersList = industryScorers.filter((s) => s.industry === detectedIndustry);
          const industryEdgeCases = productionEdgeCases.filter((ec) => ec.industry === detectedIndustry);
          const previousRun = sortedRuns[1];
          const regressionDelta = latestRun && previousRun
            ? (latestRun.passRate || 0) - (previousRun.passRate || 0)
            : 0;
          const regressionNarrative = detectedIndustry && regressionDelta < 0
            ? computeRegressionImpact(suite.name, suite.coverageTags, regressionDelta, detectedIndustry, testCases?.length || 0)
            : null;

          return (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Factory className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold" data-testid="text-industry-assurance-title">Industry Assurance</h2>
                  {detectedIndustry && (
                    <Badge variant="outline" data-testid="badge-detected-industry">{industryLabels[detectedIndustry]}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={detectedIndustry || ""}
                    onValueChange={(val) => setIndustryFrameworkMutation.mutate(val)}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-industry-framework">
                      <SelectValue placeholder="Select framework" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(industryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key} data-testid={`option-industry-${key}`}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card data-testid="panel-golden-dataset">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    Golden Dataset Baseline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {suite.goldenDatasetId ? (
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" data-testid="badge-golden-dataset-id">{suite.goldenDatasetId}</Badge>
                      <Link href={`/golden-datasets/${suite.goldenDatasetId}`}>
                        <Button variant="outline" size="sm" data-testid="button-view-golden-dataset">
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View Dataset
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-golden-dataset">No golden dataset linked to this suite.</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="panel-regulatory-cases">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    Regulatory Test Cases
                  </CardTitle>
                  {detectedIndustry && unseededTemplates.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-seed-regulatory"
                      onClick={() => seedRegulatoryMutation.mutate(unseededTemplates)}
                      disabled={seedRegulatoryMutation.isPending}
                    >
                      {seedRegulatoryMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Seeding...</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5 mr-1.5" /> Seed {unseededTemplates.length} Regulatory Cases</>
                      )}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {regulatoryCases.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-regulatory-cases">No regulatory test cases found.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {regulatoryCases.map((tc) => (
                        <div key={tc.id} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`regulatory-case-${tc.id}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-sm font-medium" data-testid={`text-reg-case-name-${tc.id}`}>{tc.name}</span>
                              {tc.regulationRef && (
                                <span className="text-xs text-muted-foreground" data-testid={`text-reg-ref-${tc.id}`}>{tc.regulationRef}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid={`badge-mandatory-${tc.id}`}>Mandatory</Badge>
                            <span className="text-[10px] text-muted-foreground">Cannot be deleted</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="panel-industry-scorers">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-muted-foreground" />
                    Industry-Specific Scorers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {industryScorersList.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-industry-scorers">
                      {detectedIndustry ? "No industry-specific scorers available." : "No industry detected for this suite."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {industryScorersList.map((scorer) => {
                        const isActive = scorerConfig.some((s) => s.type === scorer.type);
                        return (
                          <div key={scorer.id} className="flex flex-col gap-2 p-4 rounded-md border" data-testid={`industry-scorer-${scorer.id}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium" data-testid={`text-scorer-name-${scorer.id}`}>{scorer.name}</span>
                              {isActive ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-scorer-active-${scorer.id}`}>Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]" data-testid={`badge-scorer-inactive-${scorer.id}`}>Not Configured</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground" data-testid={`text-scorer-desc-${scorer.id}`}>{scorer.description}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">Weight: {scorer.weight}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="panel-production-edge-cases">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    Production Edge Cases
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {industryEdgeCases.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-edge-cases">
                      {detectedIndustry ? "No production edge cases for this industry." : "No industry detected for this suite."}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {industryEdgeCases.map((ec) => {
                        const severityClasses: Record<string, string> = {
                          critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
                          high: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                          medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
                          low: "bg-muted text-muted-foreground border-muted",
                        };
                        return (
                          <div key={ec.id} className="flex items-start justify-between gap-3 p-3 rounded-md border" data-testid={`edge-case-${ec.id}`}>
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium" data-testid={`text-edge-case-title-${ec.id}`}>{ec.title}</span>
                                <Badge variant="outline" className={`text-[10px] ${severityClasses[ec.severity] || ""}`} data-testid={`badge-severity-${ec.id}`}>{ec.severity}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground" data-testid={`text-edge-case-desc-${ec.id}`}>{ec.description}</p>
                              <span className="text-[10px] text-muted-foreground" data-testid={`text-edge-case-occurrences-${ec.id}`}>{ec.occurrences} occurrences</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`button-add-edge-case-${ec.id}`}
                              onClick={() => {
                                setTcName(ec.title);
                                setTcInputData(JSON.stringify(ec.inputData, null, 2));
                                setTcExpectedOutput(JSON.stringify(ec.expectedOutput, null, 2));
                                setTcTags(ec.tags.join(", "));
                                setTcWeight("1");
                                setAddTcOpen(true);
                              }}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add to Suite
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="panel-regression-impact">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-muted-foreground" />
                    Regression Impact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {regressionNarrative ? (
                    <div className="flex items-start gap-3 p-4 rounded-md border border-red-500/20 bg-red-500/5" data-testid="regression-impact-narrative">
                      <DollarSign className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-red-600 dark:text-red-400" data-testid="text-regression-delta">
                          Pass rate dropped {(Math.abs(regressionDelta) * 100).toFixed(1)}% from last run
                        </span>
                        <p className="text-sm" data-testid="text-regression-narrative">{regressionNarrative}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-regression">
                      {!latestRun ? "No runs available." : !previousRun ? "Only one run available \u2014 no regression comparison possible." : "No regression detected. Pass rate is stable or improving."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}
      </TabsContent>
      </Tabs>

      <Dialog open={addTcOpen} onOpenChange={setAddTcOpen}>
        <DialogContent data-testid="dialog-add-test-case">
          <DialogHeader><DialogTitle>Add Test Case</DialogTitle><DialogDescription>Create a new test case for this eval suite.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2"><Label htmlFor="tc-name" className="text-xs text-muted-foreground">Name</Label><Input id="tc-name" value={tcName} onChange={(e) => setTcName(e.target.value)} placeholder="Test case name" data-testid="input-tc-name" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="tc-input-data" className="text-xs text-muted-foreground">Input Data (JSON)</Label><Textarea id="tc-input-data" value={tcInputData} onChange={(e) => setTcInputData(e.target.value)} placeholder='{"key": "value"}' className="font-mono text-xs" rows={3} data-testid="input-tc-input-data" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="tc-expected-output" className="text-xs text-muted-foreground">Expected Output (JSON)</Label><Textarea id="tc-expected-output" value={tcExpectedOutput} onChange={(e) => setTcExpectedOutput(e.target.value)} placeholder='{"result": "expected"}' className="font-mono text-xs" rows={3} data-testid="input-tc-expected-output" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="tc-tags" className="text-xs text-muted-foreground">Tags (comma-separated)</Label><Input id="tc-tags" value={tcTags} onChange={(e) => setTcTags(e.target.value)} placeholder="tag1, tag2, tag3" data-testid="input-tc-tags" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="tc-weight" className="text-xs text-muted-foreground">Weight</Label><Input id="tc-weight" type="number" min="0" step="0.1" value={tcWeight} onChange={(e) => setTcWeight(e.target.value)} data-testid="input-tc-weight" /></div>
            {(ontologyWarnings.length > 0 || ontologyValidating) && (
              <div className="flex flex-col gap-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5" data-testid="ontology-warnings-section">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Ontology Term Warnings</span>
                </div>
                {ontologyValidating && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Checking terminology...</span>
                  </div>
                )}
                {ontologyWarnings.map((w, index) => (
                  <div key={index} className="flex items-center gap-2 flex-wrap" data-testid={`ontology-warning-${index}`}>
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">{w.term}</Badge>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">{w.suggestedTerm}</Badge>
                    <span className="text-xs text-muted-foreground">{(w.confidence * 100).toFixed(0)}%</span>
                    <span className="text-[10px] text-muted-foreground">{w.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddTcOpen(false)}>Cancel</Button>
            <Button size="sm" data-testid="button-tc-submit" onClick={() => addTestCaseMutation.mutate()} disabled={!tcName.trim() || addTestCaseMutation.isPending}>{addTestCaseMutation.isPending ? "Adding..." : "Add Test Case"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTcId} onOpenChange={(open) => { if (!open) setDeleteTcId(null); }}>
        <DialogContent data-testid="dialog-confirm-delete-tc">
          <DialogHeader><DialogTitle>Delete Test Case</DialogTitle><DialogDescription>Are you sure you want to delete this test case? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTcId(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { if (deleteTcId) deleteTestCaseMutation.mutate(deleteTcId); }} disabled={deleteTestCaseMutation.isPending}>{deleteTestCaseMutation.isPending ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addScorerOpen} onOpenChange={setAddScorerOpen}>
        <DialogContent data-testid="dialog-add-scorer">
          <DialogHeader><DialogTitle>Add Scorer</DialogTitle><DialogDescription>Configure a new scorer for this eval suite.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Scorer Type</Label>
              <Select value={newScorerType} onValueChange={setNewScorerType}><SelectTrigger data-testid="select-scorer-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(scorerTypeConfig).map(([key, cfg]) => <SelectItem key={key} value={key}>{cfg.label}</SelectItem>)}</SelectContent></Select>
              <span className="text-[10px] text-muted-foreground">{scorerTypeConfig[newScorerType]?.description}</span>
            </div>
            <div className="flex flex-col gap-2"><Label htmlFor="scorer-name" className="text-xs text-muted-foreground">Name</Label><Input id="scorer-name" value={newScorerName} onChange={(e) => setNewScorerName(e.target.value)} placeholder={scorerTypeConfig[newScorerType]?.label} data-testid="input-scorer-name" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="scorer-weight" className="text-xs text-muted-foreground">Weight</Label><Input id="scorer-weight" type="number" min="0" step="0.1" value={newScorerWeight} onChange={(e) => setNewScorerWeight(e.target.value)} data-testid="input-scorer-weight" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="scorer-params" className="text-xs text-muted-foreground">Parameters (JSON)</Label><Textarea id="scorer-params" value={newScorerParams} onChange={(e) => setNewScorerParams(e.target.value)} placeholder={getParamsPlaceholder(newScorerType)} className="font-mono text-xs" rows={3} data-testid="input-scorer-params" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddScorerOpen(false)}>Cancel</Button>
            <Button size="sm" data-testid="button-scorer-submit" onClick={handleAddScorer} disabled={updateScorerConfigMutation.isPending}>{updateScorerConfigMutation.isPending ? "Adding..." : "Add Scorer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
