import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { HealingPipeline } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Search,
  ChevronRight,
  Activity,
  DollarSign,
  Clock,
  Filter,
  Zap,
  Beaker,
  Stethoscope,
  Play,
  CheckCircle,
  CircleDot,
  Wrench,
  FlaskConical,
  Rocket,
  FileCheck,
} from "lucide-react";

const PIPELINE_STAGES = [
  "detected",
  "diagnosed",
  "hypothesis",
  "experiment",
  "verified",
  "approved",
  "deployed",
  "resolved",
] as const;

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "diagnosed", label: "Diagnosed" },
  { key: "experiment", label: "Experiment" },
  { key: "resolved", label: "Resolved" },
];

function getSeverityVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s?.toLowerCase()) {
    case "critical": return "destructive";
    case "high": return "default";
    case "medium": return "secondary";
    default: return "outline";
  }
}

function getSeverityColor(s: string) {
  switch (s?.toLowerCase()) {
    case "critical": return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "high": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "medium": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "low": return "bg-green-500/15 text-green-700 dark:text-green-400";
    default: return "";
  }
}

function getStageColor(s: string) {
  switch (s?.toLowerCase()) {
    case "detected": return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/50";
    case "diagnosed": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/50";
    case "hypothesis": return "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/50";
    case "experiment": return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/50";
    case "verified": return "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/50";
    case "approved": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/50";
    case "deployed": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/50";
    case "resolved": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/50";
    default: return "";
  }
}

function getStageIndex(stage: string) {
  return PIPELINE_STAGES.indexOf(stage as any);
}

function getNextStage(stage: string) {
  const idx = getStageIndex(stage);
  if (idx < 0 || idx >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[idx + 1];
}

function getIndustryColor(ind: string) {
  switch (ind?.toLowerCase()) {
    case "financial_services": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "healthcare": return "bg-pink-500/15 text-pink-700 dark:text-pink-400";
    case "manufacturing": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "insurance": return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400";
    case "retail": return "bg-violet-500/15 text-violet-700 dark:text-violet-400";
    default: return "";
  }
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDollars(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const INDUSTRY_IMPACT: Record<string, Array<{ category: string; amount: number; description: string }>> = {
  financial_services: [
    { category: "Revenue at Risk", amount: 245000, description: "Projected revenue loss from degraded agent performance" },
    { category: "Regulatory Fine Exposure", amount: 500000, description: "Potential regulatory penalties for non-compliance" },
    { category: "Client Attrition Probability", amount: 180000, description: "Estimated cost of client churn due to service degradation" },
  ],
  healthcare: [
    { category: "Patient Safety Score Impact", amount: 120000, description: "Cost of patient safety incidents and remediation" },
    { category: "Reimbursement Risk", amount: 340000, description: "Potential loss of insurance reimbursements" },
    { category: "Readmission Rate Impact", amount: 275000, description: "Cost of increased readmission rates" },
  ],
  manufacturing: [
    { category: "Production Downtime Cost", amount: 450000, description: "Lost production output during downtime" },
    { category: "Quality Cost (Scrap + Rework)", amount: 185000, description: "Costs associated with defective products" },
    { category: "Warranty Exposure", amount: 95000, description: "Potential warranty claims from quality issues" },
  ],
  insurance: [
    { category: "Claims Processing Delay", amount: 210000, description: "Cost of delayed claims processing" },
    { category: "Fraud Exposure", amount: 380000, description: "Potential losses from undetected fraud" },
    { category: "Policyholder Attrition", amount: 155000, description: "Revenue loss from dissatisfied policyholders" },
  ],
  retail: [
    { category: "Cart Abandonment Loss", amount: 175000, description: "Revenue lost due to increased cart abandonment" },
    { category: "Customer Experience Impact", amount: 120000, description: "Long-term revenue impact from poor CX" },
    { category: "Inventory Mismatch Cost", amount: 85000, description: "Costs from inventory sync failures" },
  ],
};

const INDUSTRY_GUARDRAILS: Record<string, Array<{ label: string; status: "pass" | "fail" | "pending" }>> = {
  financial_services: [
    { label: "SOX compliance maintained", status: "pass" },
    { label: "Trading limits enforced", status: "pass" },
    { label: "Client data isolation verified", status: "pending" },
    { label: "Regulatory reporting unaffected", status: "fail" },
  ],
  healthcare: [
    { label: "HIPAA compliance verified", status: "pass" },
    { label: "Patient safety protocols active", status: "pass" },
    { label: "Clinical accuracy above threshold", status: "pending" },
    { label: "PHI data handling compliant", status: "pass" },
  ],
  manufacturing: [
    { label: "Safety interlock systems active", status: "pass" },
    { label: "Quality control thresholds met", status: "pass" },
    { label: "Equipment calibration verified", status: "fail" },
    { label: "Environmental compliance maintained", status: "pending" },
  ],
  insurance: [
    { label: "Solvency ratio maintained", status: "pass" },
    { label: "Claims accuracy above 95%", status: "pending" },
    { label: "Fraud detection active", status: "pass" },
    { label: "Policyholder notification compliant", status: "pass" },
  ],
  retail: [
    { label: "PCI DSS compliance verified", status: "pass" },
    { label: "Payment processing unaffected", status: "pass" },
    { label: "Inventory sync maintained", status: "pending" },
    { label: "Customer data protection active", status: "pass" },
  ],
};

const INDUSTRY_EXPERIMENT_CRITERIA: Record<string, string[]> = {
  financial_services: [
    "Trade execution accuracy > 99.5%",
    "Zero compliance violations during experiment",
    "Client portfolio risk within acceptable range",
  ],
  healthcare: [
    "Clinical accuracy above 97% threshold",
    "No adverse patient events",
    "PHI exposure within approved limits",
  ],
  manufacturing: [
    "Defect rate below 2% for 12 hours",
    "OEE maintained above 85%",
    "No safety incidents in production lines",
  ],
  insurance: [
    "Claims accuracy above 95%",
    "Fraud detection rate above baseline",
    "No regulatory filing delays",
  ],
  retail: [
    "Conversion rate within 2% of baseline",
    "No payment processing errors",
    "Customer satisfaction stable",
  ],
};

const INDUSTRY_DIAGNOSIS_TEMPLATES: Record<string, string> = {
  financial_services: "Analyze agent behavior for regulatory compliance drift, trade execution anomalies, and risk threshold violations. Check for unauthorized data access patterns.",
  healthcare: "Evaluate clinical decision accuracy, patient safety protocol adherence, HIPAA compliance status, and medication interaction checking performance.",
  manufacturing: "Assess production quality metrics, equipment control accuracy, safety system integration, and defect detection capabilities.",
  insurance: "Review claims processing accuracy, fraud detection sensitivity, underwriting model drift, and regulatory compliance status.",
  retail: "Examine recommendation engine accuracy, inventory prediction performance, payment processing reliability, and customer data handling.",
};

export default function HealingOperations() {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const industryId = industry?.id || "financial_services";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState("pipeline");

  const [createOpen, setCreateOpen] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: "",
    agentName: "",
    issueType: "drift",
    severity: "medium",
    industry: industryId,
    issueDescription: "",
  });

  const { data: pipelines = [], isLoading } = useQuery<HealingPipeline[]>({
    queryKey: ["/api/healing-pipelines"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/healing-pipelines", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "Healing issue created", description: created.title });
      setCreateOpen(false);
      setNewIssue({ title: "", agentName: "", issueType: "drift", severity: "medium", industry: industryId, issueDescription: "" });
      setSelectedId(created.id);
    },
    onError: (e: any) => toast({ title: "Failed to create issue", description: e.message, variant: "destructive" }),
  });

  const advanceStageMutation = useMutation({
    mutationFn: async ({ id, nextStage }: { id: string; nextStage: string }) => {
      const res = await apiRequest("PATCH", `/api/healing-pipelines/${id}`, {
        stage: nextStage,
        status: nextStage === "resolved" ? "resolved" : "active",
        ...(nextStage === "resolved" ? { resolvedAt: new Date().toISOString() } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "Pipeline advanced to next stage" });
    },
    onError: (e: any) => toast({ title: "Failed to advance stage", description: e.message, variant: "destructive" }),
  });

  const diagnoseMutation = useMutation({
    mutationFn: async (data: { pipelineId: string; industry: string; issueType: string; issueDescription: string; stage: string }) => {
      const res = await apiRequest("POST", "/api/ai/healing-diagnose", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "AI Diagnosis complete" });
    },
    onError: (e: any) => toast({ title: "Diagnosis failed", description: e.message, variant: "destructive" }),
  });

  const applyRemediationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/healing-pipelines/${id}`, {
        stage: "experiment",
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "Remediation applied, moving to experiment stage" });
    },
    onError: (e: any) => toast({ title: "Failed to apply remediation", description: e.message, variant: "destructive" }),
  });

  const startExperimentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/healing-pipelines/${id}`, {
        stage: "experiment",
        status: "active",
        experimentConfig: {
          name: "Healing Experiment",
          trafficPercent: 10,
          successMetric: "error_rate < 0.5%",
          duration: "2 hours",
          startedAt: new Date().toISOString(),
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "Experiment started" });
    },
    onError: (e: any) => toast({ title: "Failed to start experiment", description: e.message, variant: "destructive" }),
  });

  const verifyExperimentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/healing-pipelines/${id}`, {
        stage: "verified",
        status: "active",
        experimentResults: {
          passed: true,
          successRate: 99.2,
          errorRate: 0.3,
          verifiedAt: new Date().toISOString(),
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      toast({ title: "Experiment verified successfully" });
    },
    onError: (e: any) => toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  const filteredPipelines = useMemo(() => {
    let list = pipelines;
    if (statusFilter !== "all") {
      if (statusFilter === "diagnosed") {
        list = list.filter((p) => p.stage === "diagnosed" || p.stage === "hypothesis");
      } else if (statusFilter === "experiment") {
        list = list.filter((p) => p.stage === "experiment" || p.stage === "verified");
      } else if (statusFilter === "resolved") {
        list = list.filter((p) => p.status === "resolved" || p.stage === "resolved");
      } else {
        list = list.filter((p) => p.status === statusFilter);
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.agentName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pipelines, statusFilter, searchQuery]);

  const selected = useMemo(
    () => pipelines.find((p) => p.id === selectedId) || null,
    [pipelines, selectedId]
  );

  const selectedIndustry = selected?.industry || industryId;
  const impactItems = INDUSTRY_IMPACT[selectedIndustry] || INDUSTRY_IMPACT.financial_services;
  const totalImpact = impactItems.reduce((sum, item) => sum + item.amount, 0);
  const guardrails = INDUSTRY_GUARDRAILS[selectedIndustry] || INDUSTRY_GUARDRAILS.financial_services;
  const experimentCriteria = INDUSTRY_EXPERIMENT_CRITERIA[selectedIndustry] || INDUSTRY_EXPERIMENT_CRITERIA.financial_services;
  const diagnosisTemplate = INDUSTRY_DIAGNOSIS_TEMPLATES[selectedIndustry] || INDUSTRY_DIAGNOSIS_TEMPLATES.financial_services;

  function handleCreate() {
    createMutation.mutate({
      title: newIssue.title,
      agentName: newIssue.agentName,
      industry: newIssue.industry,
      severity: newIssue.severity,
      issueType: newIssue.issueType,
      issueDescription: newIssue.issueDescription,
      stage: "detected",
      status: "active",
      diagnosisDetails: {},
      hypothesis: {},
      businessImpact: {},
      remediation: {},
      industryGuardrails: [],
      experimentConfig: {},
      experimentResults: {},
      resolution: {},
    });
  }

  function handleAdvanceStage() {
    if (!selected) return;
    const next = getNextStage(selected.stage);
    if (!next) return;
    advanceStageMutation.mutate({ id: selected.id, nextStage: next });
  }

  function handleDiagnose() {
    if (!selected) return;
    diagnoseMutation.mutate({
      pipelineId: selected.id,
      industry: selectedIndustry,
      issueType: selected.issueType,
      issueDescription: selected.issueDescription || "",
      stage: selected.stage,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4" data-testid="page-healing-operations-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="flex gap-4">
          <div className="w-[300px] space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="page-healing-operations">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Healing Operations Center</h1>
          <p className="text-sm text-muted-foreground">Closed-loop autonomous issue detection, diagnosis, and remediation</p>
        </div>
        <Link href="/runbook-automation">
          <Button variant="outline" size="sm" data-testid="button-goto-runbooks">
            <FileCheck className="w-4 h-4 mr-1" />
            Runbooks
          </Button>
        </Link>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left Column */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-healing-issue"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Issue
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search pipelines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-healing"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={statusFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.key)}
                className="toggle-elevate text-xs"
                data-testid={`button-filter-${f.key}`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-2 pr-2">
              {filteredPipelines.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Stethoscope className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No healing pipelines found</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a new issue to start the healing pipeline</p>
                </div>
              )}
              {filteredPipelines.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setDetailTab("pipeline");
                  }}
                  className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                    selectedId === p.id ? "toggle-elevated border-blue-500/50" : ""
                  }`}
                  data-testid={`card-healing-${p.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" data-testid={`text-healing-title-${p.id}`}>{p.title}</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-healing-agent-${p.id}`}>{p.agentName}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <Badge variant={getSeverityVariant(p.severity)} className={`text-[10px] ${getSeverityColor(p.severity)}`} data-testid={`badge-severity-${p.id}`}>
                      {p.severity}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getStageColor(p.stage)}`} data-testid={`badge-stage-${p.id}`}>
                      {p.stage}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getIndustryColor(p.industry)}`} data-testid={`badge-industry-${p.id}`}>
                      {p.industry.replace("_", " ")}
                    </Badge>
                  </div>
                  {p.detectedAt && (
                    <div className="flex items-center gap-1 mt-2">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-healing-time-${p.id}`}>
                        {timeAgo(p.detectedAt as any)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right Column */}
        <div className="flex-1 min-w-0">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Stethoscope className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Select a pipeline</p>
              <p className="text-sm text-muted-foreground mt-1">Choose from the left panel to view healing details</p>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" data-testid="text-selected-title">{selected.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.agentName} - {selected.issueType.replace("_", " ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getSeverityVariant(selected.severity)} className={getSeverityColor(selected.severity)} data-testid="badge-selected-severity">
                    {selected.severity}
                  </Badge>
                  <Badge variant="outline" className={getStageColor(selected.stage)} data-testid="badge-selected-stage">
                    {selected.stage}
                  </Badge>
                </div>
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList>
                  <TabsTrigger value="pipeline" data-testid="tab-pipeline">
                    <Activity className="w-3.5 h-3.5 mr-1.5" />
                    Pipeline
                  </TabsTrigger>
                  <TabsTrigger value="impact" data-testid="tab-impact">
                    <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                    Business Impact
                  </TabsTrigger>
                  <TabsTrigger value="remediation" data-testid="tab-remediation">
                    <Wrench className="w-3.5 h-3.5 mr-1.5" />
                    Remediation
                  </TabsTrigger>
                  <TabsTrigger value="experiment" data-testid="tab-experiment">
                    <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
                    Experiment
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Pipeline */}
                <TabsContent value="pipeline" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                      <CardTitle className="text-base">Pipeline Progress</CardTitle>
                      <Button
                        size="sm"
                        onClick={handleAdvanceStage}
                        disabled={advanceStageMutation.isPending || getNextStage(selected.stage) === null}
                        data-testid="button-advance-stage"
                      >
                        {advanceStageMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                        Advance Stage
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center justify-center gap-1 py-4" data-testid="pipeline-visualization">
                        {PIPELINE_STAGES.map((stage, idx) => {
                          const currentIdx = getStageIndex(selected.stage);
                          const isCompleted = idx < currentIdx;
                          const isCurrent = idx === currentIdx;
                          const isFuture = idx > currentIdx;
                          return (
                            <div key={stage} className="flex items-center gap-1">
                              <div className="flex flex-col items-center gap-1">
                                <div
                                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                                    isCurrent
                                      ? "border-blue-500 bg-blue-500/20 animate-pulse"
                                      : isCompleted
                                      ? "border-green-500 bg-green-500/20"
                                      : "border-muted-foreground/30 bg-muted/30"
                                  }`}
                                  data-testid={`stage-dot-${stage}`}
                                >
                                  {isCompleted && <CheckCircle className="w-4 h-4 text-green-500" />}
                                  {isCurrent && <CircleDot className="w-4 h-4 text-blue-500" />}
                                  {isFuture && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
                                </div>
                                <span className={`text-[10px] ${isCurrent ? "font-semibold text-blue-600 dark:text-blue-400" : isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                  {stage}
                                </span>
                              </div>
                              {idx < PIPELINE_STAGES.length - 1 && (
                                <div className={`w-4 h-0.5 mb-4 ${idx < currentIdx ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <Progress
                        value={((getStageIndex(selected.stage) + 1) / PIPELINE_STAGES.length) * 100}
                        className="mt-2"
                        data-testid="progress-pipeline"
                      />
                    </CardContent>
                  </Card>

                  <Separator />

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Issue Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Type</span>
                          <Badge variant="outline" data-testid="text-issue-type">{selected.issueType.replace("_", " ")}</Badge>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Severity</span>
                          <Badge variant={getSeverityVariant(selected.severity)} className={getSeverityColor(selected.severity)} data-testid="text-issue-severity">
                            {selected.severity}
                          </Badge>
                        </div>
                      </div>
                      {selected.issueDescription && (
                        <div>
                          <span className="text-xs text-muted-foreground">Description</span>
                          <p className="text-sm mt-1" data-testid="text-issue-description">{selected.issueDescription}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                      <CardTitle className="text-base">Diagnosis</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDiagnose}
                        disabled={diagnoseMutation.isPending}
                        data-testid="button-run-diagnosis"
                      >
                        {diagnoseMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Beaker className="w-4 h-4 mr-1" />}
                        Run AI Diagnosis
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md bg-muted/50 p-3">
                        <span className="text-xs text-muted-foreground">Industry Diagnosis Template</span>
                        <p className="text-sm mt-1" data-testid="text-diagnosis-template">{diagnosisTemplate}</p>
                      </div>
                      {(() => {
                        const details = selected.diagnosisDetails as Record<string, unknown> | null;
                        if (!details || Object.keys(details).length === 0) return null;
                        return (
                          <div className="mt-3">
                            <span className="text-xs text-muted-foreground">AI Diagnosis Results</span>
                            <pre className="text-xs font-mono p-3 rounded-md bg-muted/50 overflow-auto max-h-[200px] whitespace-pre-wrap mt-1" data-testid="text-diagnosis-results">
                              {JSON.stringify(details, null, 2)}
                            </pre>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 2: Business Impact */}
                <TabsContent value="impact" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                      <CardTitle className="text-base">Total Business Impact</CardTitle>
                      <Badge variant={getSeverityVariant(selected.severity)} className={getSeverityColor(selected.severity)} data-testid="badge-risk-level">
                        {selected.severity} risk
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        <DollarSign className="w-8 h-8 text-muted-foreground" />
                        <div>
                          <div className="text-3xl font-bold" data-testid="text-total-impact">
                            {formatDollars(totalImpact)}
                          </div>
                          <p className="text-sm text-muted-foreground">Estimated total business impact</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Impact Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                              <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {impactItems.map((item, idx) => (
                              <tr key={idx} className="border-b last:border-b-0" data-testid={`impact-row-${idx}`}>
                                <td className="p-3 font-medium" data-testid={`impact-category-${idx}`}>{item.category}</td>
                                <td className="p-3 text-right font-medium" data-testid={`impact-amount-${idx}`}>{formatDollars(item.amount)}</td>
                                <td className="p-3 text-muted-foreground" data-testid={`impact-description-${idx}`}>{item.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Time to Impact</span>
                        </div>
                        <Badge variant="outline" data-testid="badge-time-to-impact">
                          {selected.severity === "critical" ? "Immediate" : selected.severity === "high" ? "< 4 hours" : selected.severity === "medium" ? "< 24 hours" : "< 72 hours"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 3: Remediation */}
                <TabsContent value="remediation" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        Proposed Fix
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" data-testid="badge-fix-type">
                          {selected.issueType === "drift" ? "Configuration Adjustment" :
                           selected.issueType === "hallucination" ? "Prompt Refinement" :
                           selected.issueType === "performance_degradation" ? "Resource Optimization" :
                           selected.issueType === "data_quality" ? "Data Pipeline Fix" :
                           "Policy Update"}
                        </Badge>
                        <Badge variant="secondary" data-testid="badge-resolution-time">
                          Est. {selected.severity === "critical" ? "1-2 hours" : selected.severity === "high" ? "2-4 hours" : "4-8 hours"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid="text-fix-description">
                        {selected.issueType === "drift" ? "Recalibrate agent parameters to align with baseline performance metrics. Apply updated configuration and validate against golden dataset." :
                         selected.issueType === "hallucination" ? "Refine system prompts and add guardrails to prevent confabulation. Increase retrieval augmentation context window." :
                         selected.issueType === "performance_degradation" ? "Optimize inference pipeline, adjust batch sizes, and review resource allocation. Consider model quantization if latency is primary concern." :
                         selected.issueType === "data_quality" ? "Clean and validate data pipeline inputs. Implement additional data quality checks and monitoring." :
                         "Update policy rules and compliance checks. Review and adjust agent permissions and access controls."}
                      </p>

                      <Separator />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Approval Required</span>
                        </div>
                        <Badge variant={selected.severity === "critical" || selected.severity === "high" ? "default" : "secondary"} data-testid="badge-approval-required">
                          {selected.severity === "critical" || selected.severity === "high" ? "Yes - Manual Approval" : "Auto-Approved"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Industry Guardrails
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {guardrails.map((guard, idx) => (
                          <div key={idx} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-b-0" data-testid={`guardrail-${idx}`}>
                            <span className="text-sm">{guard.label}</span>
                            <div className="flex items-center gap-1">
                              {guard.status === "pass" && (
                                <Badge variant="outline" className="bg-green-500/15 text-green-700 dark:text-green-400" data-testid={`guardrail-status-${idx}`}>
                                  <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                                  Pass
                                </Badge>
                              )}
                              {guard.status === "fail" && (
                                <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400" data-testid={`guardrail-status-${idx}`}>
                                  <XCircle className="w-3 h-3 mr-1 text-red-500" />
                                  Fail
                                </Badge>
                              )}
                              {guard.status === "pending" && (
                                <Badge variant="outline" className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" data-testid={`guardrail-status-${idx}`}>
                                  <Clock className="w-3 h-3 mr-1 text-yellow-500" />
                                  Pending
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    onClick={() => applyRemediationMutation.mutate(selected.id)}
                    disabled={applyRemediationMutation.isPending}
                    data-testid="button-apply-remediation"
                  >
                    {applyRemediationMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wrench className="w-4 h-4 mr-1" />}
                    Apply Remediation
                  </Button>
                </TabsContent>

                {/* Tab 4: Experiment */}
                <TabsContent value="experiment" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <FlaskConical className="w-4 h-4" />
                        Experiment Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const config = selected.experimentConfig as any;
                        const hasConfig = config && Object.keys(config).length > 0;
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Name</span>
                                <p className="text-sm font-medium" data-testid="text-experiment-name">{hasConfig ? config.name : "Not configured"}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Traffic %</span>
                                <p className="text-sm font-medium" data-testid="text-experiment-traffic">{hasConfig ? `${config.trafficPercent}%` : "—"}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Success Metric</span>
                                <p className="text-sm font-medium" data-testid="text-experiment-metric">{hasConfig ? config.successMetric : "—"}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Duration</span>
                                <p className="text-sm font-medium" data-testid="text-experiment-duration">{hasConfig ? config.duration : "—"}</p>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Industry Success Criteria</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {experimentCriteria.map((criteria, idx) => (
                          <div key={idx} className="flex items-center gap-2 py-1" data-testid={`success-criteria-${idx}`}>
                            <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm">{criteria}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                        Rollback Triggers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 py-1" data-testid="rollback-trigger-0">
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm">Error rate exceeds 1% during experiment</span>
                        </div>
                        <div className="flex items-center gap-2 py-1" data-testid="rollback-trigger-1">
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm">Any safety guardrail violation detected</span>
                        </div>
                        <div className="flex items-center gap-2 py-1" data-testid="rollback-trigger-2">
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm">Business impact exceeds acceptable threshold</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {(() => {
                    const results = selected.experimentResults as any;
                    const hasResults = results && Object.keys(results).length > 0;
                    if (!hasResults) return null;
                    return (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Experiment Results</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Status</span>
                              <Badge variant={results.passed ? "default" : "destructive"} data-testid="badge-experiment-result">
                                {results.passed ? "Passed" : "Failed"}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Success Rate</span>
                              <p className="text-sm font-medium" data-testid="text-experiment-success-rate">{results.successRate}%</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Error Rate</span>
                              <p className="text-sm font-medium" data-testid="text-experiment-error-rate">{results.errorRate}%</p>
                            </div>
                            {results.verifiedAt && (
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Verified At</span>
                                <p className="text-sm font-medium" data-testid="text-experiment-verified-at">{timeAgo(results.verifiedAt)}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => startExperimentMutation.mutate(selected.id)}
                      disabled={startExperimentMutation.isPending}
                      data-testid="button-start-experiment"
                    >
                      {startExperimentMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                      Start Experiment
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => verifyExperimentMutation.mutate(selected.id)}
                      disabled={verifyExperimentMutation.isPending}
                      data-testid="button-verify-experiment"
                    >
                      {verifyExperimentMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileCheck className="w-4 h-4 mr-1" />}
                      Verify Results
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Create Issue Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Healing Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newIssue.title}
                onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
                placeholder="e.g. Claims Agent Drift Detected"
                data-testid="input-healing-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                value={newIssue.agentName}
                onChange={(e) => setNewIssue({ ...newIssue, agentName: e.target.value })}
                placeholder="e.g. Claims Processing Agent"
                data-testid="input-healing-agent-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Issue Type</Label>
              <Select
                value={newIssue.issueType}
                onValueChange={(v) => setNewIssue({ ...newIssue, issueType: v })}
              >
                <SelectTrigger data-testid="select-healing-issue-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drift">Drift</SelectItem>
                  <SelectItem value="hallucination">Hallucination</SelectItem>
                  <SelectItem value="performance_degradation">Performance Degradation</SelectItem>
                  <SelectItem value="data_quality">Data Quality</SelectItem>
                  <SelectItem value="compliance_violation">Compliance Violation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={newIssue.severity}
                onValueChange={(v) => setNewIssue({ ...newIssue, severity: v })}
              >
                <SelectTrigger data-testid="select-healing-severity">
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
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select
                value={newIssue.industry}
                onValueChange={(v) => setNewIssue({ ...newIssue, industry: v as any })}
              >
                <SelectTrigger data-testid="select-healing-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial_services">Financial Services</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newIssue.issueDescription}
                onChange={(e) => setNewIssue({ ...newIssue, issueDescription: e.target.value })}
                placeholder="Describe the issue..."
                className="resize-none"
                data-testid="input-healing-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newIssue.title || !newIssue.agentName}
              data-testid="button-create-healing"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
