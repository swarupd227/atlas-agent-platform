import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Wrench,
  MessageSquare,
  Database,
  RefreshCw,
  ArrowUpDown,
  DollarSign,
  Play,
  FlaskConical,
  CheckCircle,
  X,
  Plus,
  Shield,
  AlertTriangle,
  Clock,
  Beaker,
  Activity,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { WhyBadge } from "@/components/why-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/components/shared-utils";
import type { Patch, Experiment, Agent } from "@shared/schema";

interface TimelineEntry {
  id: string;
  type: string;
  agentId: string;
  agentName: string;
  trigger: string;
  change: string;
  changeType: string;
  proof: any;
  status: string;
  riskLevel: string;
  autoApplied: boolean;
  canRollback: boolean;
  createdAt: string;
}

const changeTypeConfig: Record<
  string,
  { label: string; icon: typeof MessageSquare; className: string }
> = {
  prompt_tweak: {
    label: "Prompt Tweak",
    icon: MessageSquare,
    className:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  retrieval_change: {
    label: "Retrieval Change",
    icon: Database,
    className:
      "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  tool_retry_fallback: {
    label: "Tool Retry/Fallback",
    icon: RefreshCw,
    className:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  model_upgrade_downgrade: {
    label: "Model Upgrade/Downgrade",
    icon: ArrowUpDown,
    className:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  cost_cap_tuning: {
    label: "Cost Cap Tuning",
    icon: DollarSign,
    className:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
};

const riskConfig: Record<string, { className: string }> = {
  low: {
    className:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  medium: {
    className:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  high: {
    className:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  critical: {
    className:
      "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

const experimentStatusConfig: Record<string, { className: string }> = {
  draft: {
    className:
      "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
  running: {
    className:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  completed: {
    className:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  cancelled: {
    className:
      "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

export default function Optimization() {
  const { toast } = useToast();

  const [changeTypeFilter, setChangeTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [generateAgentId, setGenerateAgentId] = useState("");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newExperiment, setNewExperiment] = useState({
    agentId: "",
    name: "",
    trafficPercent: 10,
    successMetric: "success_rate",
    evalGate: "",
    noPolicyViolationIncrease: true,
    maxLatencyIncrease: 20,
    minSuccessRate: 90,
  });

  const { data: patches, isLoading: patchesLoading } = useQuery<Patch[]>({
    queryKey: ["/api/patches"],
  });

  const { data: experiments, isLoading: experimentsLoading } = useQuery<
    Experiment[]
  >({
    queryKey: ["/api/experiments"],
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<
    TimelineEntry[]
  >({
    queryKey: ["/api/remediation-timeline"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const simulateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/patches/${id}/simulate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patches"] });
      toast({
        title: "Simulation started",
        description: "The patch simulation is running.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Simulation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const runEvalsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/patches/${id}/run-evals`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patches"] });
      toast({
        title: "Evals started",
        description: "Evaluation suite is running.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Evals failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/patches/${id}/request-approval`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patches"] });
      toast({
        title: "Approval requested",
        description: "The patch has been submitted for approval.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Approval request failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/patches/${id}`, { status: "rejected" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patches"] });
      toast({
        title: "Patch rejected",
        description: "The patch has been rejected.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Rejection failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const generatePatchesMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", "/api/ai/generate-patches", {
        agentId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patches"] });
      toast({
        title: "Patches generated",
        description: "AI-generated patches have been created.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Generation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const createExperimentMutation = useMutation({
    mutationFn: async (data: {
      agentId: string;
      name: string;
      trafficPercent: number;
      successMetric: string;
      evalGate: string;
      guardrails: Record<string, unknown>;
    }) => {
      const res = await apiRequest("POST", "/api/experiments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      setCreateDialogOpen(false);
      setNewExperiment({
        agentId: "",
        name: "",
        trafficPercent: 10,
        successMetric: "success_rate",
        evalGate: "",
        noPolicyViolationIncrease: true,
        maxLatencyIncrease: 20,
        minSuccessRate: 90,
      });
      toast({
        title: "Experiment created",
        description: "The experiment has been created successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Creation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateExperimentMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: string;
    }) => {
      await apiRequest("PATCH", `/api/experiments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({
        title: "Experiment updated",
        description: "The experiment status has been updated.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/patches/${id}/simulate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/remediation-timeline"],
      });
      toast({
        title: "Rollback initiated",
        description: "The remediation action is being rolled back.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Rollback failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const allPatches = patches || [];
  const allExperiments = experiments || [];
  const allTimeline = timeline || [];

  const totalPatches = allPatches.length;
  const pendingReview = allPatches.filter(
    (p) => p.status === "proposed"
  ).length;
  const activeExperiments = allExperiments.filter(
    (e) => e.status === "running"
  ).length;
  const autoRemediated =
    allPatches.filter((p) => p.status === "applied").length +
    allExperiments.filter((e) => e.status === "completed").length;

  const filteredPatches = allPatches.filter((p) => {
    if (changeTypeFilter !== "all" && p.changeType !== changeTypeFilter)
      return false;
    if (riskFilter !== "all" && p.riskLevel !== riskFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  const isLoading = patchesLoading || experimentsLoading || timelineLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-optimization">
      <div className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="text-page-title"
        >
          Optimization
        </h1>
        <p
          className="text-sm text-muted-foreground"
          data-testid="text-page-subtitle"
        >
          Autonomous Optimization & Self-Healing Patch Center
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Patches"
          value={totalPatches}
          icon={Wrench}
          variant="default"
          testId="stat-total-patches"
        />
        <StatCard
          title="Pending Review"
          value={pendingReview}
          icon={Clock}
          variant="warning"
          testId="stat-pending-review"
        />
        <StatCard
          title="Active Experiments"
          value={activeExperiments}
          icon={Beaker}
          variant="default"
          testId="stat-active-experiments"
        />
        <StatCard
          title="Auto-Remediated"
          value={autoRemediated}
          icon={CheckCircle}
          variant="success"
          testId="stat-auto-remediated"
        />
      </div>

      <Tabs defaultValue="patches">
        <TabsList>
          <TabsTrigger value="patches" data-testid="tab-patches">
            Patch Inbox
          </TabsTrigger>
          <TabsTrigger value="experiments" data-testid="tab-experiments">
            Experiment Manager
          </TabsTrigger>
          <TabsTrigger value="remediation" data-testid="tab-remediation">
            Auto-Remediation Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="patches">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px]"
                  data-testid="badge-sandbox-active"
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Patch Sandbox Active
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={generateAgentId}
                  onValueChange={setGenerateAgentId}
                >
                  <SelectTrigger
                    className="w-[180px]"
                    data-testid="select-generate-agent"
                  >
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => generatePatchesMutation.mutate(generateAgentId)}
                  disabled={
                    !generateAgentId || generatePatchesMutation.isPending
                  }
                  data-testid="button-generate-patches"
                >
                  <Beaker className="w-3.5 h-3.5 mr-1" />
                  Generate AI Patches
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={changeTypeFilter}
                onValueChange={setChangeTypeFilter}
              >
                <SelectTrigger
                  className="w-[200px]"
                  data-testid="select-change-type-filter"
                >
                  <SelectValue placeholder="Change type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Change Types</SelectItem>
                  <SelectItem value="prompt_tweak">Prompt Tweak</SelectItem>
                  <SelectItem value="retrieval_change">
                    Retrieval Change
                  </SelectItem>
                  <SelectItem value="tool_retry_fallback">
                    Tool Retry/Fallback
                  </SelectItem>
                  <SelectItem value="model_upgrade_downgrade">
                    Model Upgrade/Downgrade
                  </SelectItem>
                  <SelectItem value="cost_cap_tuning">
                    Cost Cap Tuning
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger
                  className="w-[160px]"
                  data-testid="select-risk-filter"
                >
                  <SelectValue placeholder="Risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="select-status-filter"
                >
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="proposed">Proposed</SelectItem>
                  <SelectItem value="pending_approval">
                    Pending Approval
                  </SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredPatches.some(
              (p) =>
                (p.riskLevel === "high" || p.riskLevel === "critical") &&
                p.status === "proposed"
            ) && (
              <div
                className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20"
                data-testid="warning-high-risk"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  High or critical risk patches detected. These require
                  additional approvals before deployment.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {filteredPatches.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center py-12 gap-3"
                  data-testid="empty-patches"
                >
                  <Wrench className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No patches match your filters
                  </p>
                </div>
              )}

              {filteredPatches.map((patch) => {
                const typeConfig = changeTypeConfig[patch.changeType] || {
                  label: patch.changeType,
                  icon: Wrench,
                  className: "bg-muted text-muted-foreground",
                };
                const TypeIcon = typeConfig.icon;
                const risk = riskConfig[patch.riskLevel] || riskConfig.low;
                const isProposed = patch.status === "proposed";
                const agentName =
                  agents?.find((a) => a.id === patch.agentId)?.name ||
                  "Agent";
                const evidence = patch.evidenceBundle as Record<
                  string,
                  any
                > | null;
                const evalResults = patch.evalBundle as Record<
                  string,
                  any
                > | null;
                const simulation = patch.simulationResult as Record<
                  string,
                  any
                > | null;
                const rollout = patch.rolloutPlan as Record<
                  string,
                  any
                > | null;

                return (
                  <Card
                    key={patch.id}
                    data-testid={`patch-card-${patch.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[11px] border ${typeConfig.className}`}
                            >
                              <TypeIcon className="w-3 h-3 mr-1" />
                              {typeConfig.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[11px] border ${risk.className}`}
                            >
                              {patch.riskLevel}
                            </Badge>
                            <StatusBadge status={patch.status} />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {agentName}
                          </span>
                        </div>

                        <div>
                          <h3
                            className="text-sm font-semibold"
                            data-testid={`text-patch-title-${patch.id}`}
                          >
                            {patch.title}
                          </h3>
                          {patch.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {patch.description}
                            </p>
                          )}
                        </div>

                        {evidence && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <WhyBadge
                              compact
                              trigger={(evidence.source as string) || (evidence.trigger as string) || "Signal detected"}
                              decision={patch.title || "Apply patch"}
                              evidence={(evidence.reason as string) || (evidence.metric as string) || "Evidence-based recommendation"}
                              rollback={patch.riskLevel === "high" || patch.riskLevel === "critical" ? "Requires approval" : undefined}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-4 flex-wrap text-xs">
                          {patch.expectedKpiImpact && (
                            <div>
                              <span className="text-muted-foreground">
                                KPI Impact:{" "}
                              </span>
                              <span
                                className={
                                  patch.expectedKpiImpact.startsWith("+") ||
                                  patch.expectedKpiImpact
                                    .toLowerCase()
                                    .includes("improve")
                                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                    : "font-medium"
                                }
                                data-testid={`text-kpi-impact-${patch.id}`}
                              >
                                {patch.expectedKpiImpact}
                              </span>
                            </div>
                          )}
                          {patch.expectedCostImpact && (
                            <div>
                              <span className="text-muted-foreground">
                                Cost Impact:{" "}
                              </span>
                              <span
                                className={
                                  patch.expectedCostImpact
                                    .toLowerCase()
                                    .includes("sav") ||
                                  patch.expectedCostImpact.startsWith("-")
                                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                    : "text-red-600 dark:text-red-400 font-medium"
                                }
                                data-testid={`text-cost-impact-${patch.id}`}
                              >
                                {patch.expectedCostImpact}
                              </span>
                            </div>
                          )}
                          {patch.requiredApprovals != null &&
                            patch.requiredApprovals > 0 && (
                              <div>
                                <span className="text-muted-foreground">
                                  Approvals Required:{" "}
                                </span>
                                <span className="font-medium">
                                  {patch.requiredApprovals}
                                </span>
                              </div>
                            )}
                          {rollout && (
                            <div>
                              <span className="text-muted-foreground">
                                Rollout:{" "}
                              </span>
                              <span className="font-medium">
                                {(rollout.strategy as string) || "standard"}
                                {rollout.trafficPercent
                                  ? ` (${rollout.trafficPercent}%)`
                                  : ""}
                              </span>
                            </div>
                          )}
                        </div>

                        {simulation && (
                          <div
                            className="p-3 rounded-md bg-muted/50"
                            data-testid={`simulation-results-${patch.id}`}
                          >
                            <span className="text-xs font-medium">
                              Simulation Results
                            </span>
                            <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
                              {simulation.kpiProjections &&
                                Object.entries(
                                  simulation.kpiProjections as Record<
                                    string,
                                    unknown
                                  >
                                ).map(([key, val]) => (
                                  <div key={key}>
                                    <span className="text-muted-foreground">
                                      {key}:{" "}
                                    </span>
                                    <span className="font-medium">
                                      {String(val)}
                                    </span>
                                  </div>
                                ))}
                              {simulation.status && (
                                <div>
                                  <span className="text-muted-foreground">
                                    Status:{" "}
                                  </span>
                                  <span className="font-medium">
                                    {String(simulation.status)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {evalResults && (
                          <div
                            className="p-3 rounded-md bg-muted/50"
                            data-testid={`eval-results-${patch.id}`}
                          >
                            <span className="text-xs font-medium">
                              Eval Results
                            </span>
                            <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
                              {evalResults.passRate != null && (
                                <div>
                                  <span className="text-muted-foreground">
                                    Pass Rate:{" "}
                                  </span>
                                  <span className="font-medium">
                                    {String(evalResults.passRate)}%
                                  </span>
                                </div>
                              )}
                              {evalResults.regressions != null && (
                                <div>
                                  <span className="text-muted-foreground">
                                    Regressions:{" "}
                                  </span>
                                  <span
                                    className={
                                      Number(evalResults.regressions) > 0
                                        ? "text-red-600 dark:text-red-400 font-medium"
                                        : "font-medium"
                                    }
                                  >
                                    {String(evalResults.regressions)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {isProposed && (
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                simulateMutation.mutate(patch.id)
                              }
                              disabled={simulateMutation.isPending}
                              data-testid={`button-simulate-${patch.id}`}
                            >
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Simulate
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                runEvalsMutation.mutate(patch.id)
                              }
                              disabled={runEvalsMutation.isPending}
                              data-testid={`button-run-evals-${patch.id}`}
                            >
                              <FlaskConical className="w-3.5 h-3.5 mr-1" />
                              Run Evals
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                requestApprovalMutation.mutate(patch.id)
                              }
                              disabled={requestApprovalMutation.isPending}
                              data-testid={`button-request-approval-${patch.id}`}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Request Approval
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                rejectMutation.mutate(patch.id)
                              }
                              disabled={rejectMutation.isPending}
                              data-testid={`button-reject-${patch.id}`}
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="experiments">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(true)}
                data-testid="button-create-experiment"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create Experiment
              </Button>
            </div>

            {allExperiments.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-12 gap-3"
                data-testid="empty-experiments"
              >
                <Beaker className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No experiments yet. Create one to start A/B testing.
                </p>
              </div>
            )}

            {allExperiments.map((exp) => {
              const expStatus =
                experimentStatusConfig[exp.status] ||
                experimentStatusConfig.draft;
              const agentName =
                agents?.find((a) => a.id === exp.agentId)?.name || "Agent";
              const results = exp.results as Record<string, any> | null;

              return (
                <Card
                  key={exp.id}
                  data-testid={`experiment-card-${exp.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex flex-col gap-1">
                          <h3
                            className="text-sm font-semibold"
                            data-testid={`text-experiment-name-${exp.id}`}
                          >
                            {exp.name}
                          </h3>
                          {exp.description && (
                            <p className="text-xs text-muted-foreground">
                              {exp.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[11px] border ${expStatus.className}`}
                          >
                            {exp.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {agentName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <div>
                          <span className="text-muted-foreground">
                            Success Metric:{" "}
                          </span>
                          <span className="font-medium">
                            {exp.successMetric}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Traffic:{" "}
                          </span>
                          <span className="font-medium">
                            {exp.trafficPercent}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">
                          Traffic Split
                        </span>
                        <Progress
                          value={exp.trafficPercent}
                          className="flex-1"
                          data-testid={`progress-traffic-${exp.id}`}
                        />
                        <span className="text-xs font-medium shrink-0">
                          {exp.trafficPercent}%
                        </span>
                      </div>

                      {results && (
                        <div
                          className="p-3 rounded-md bg-muted/50"
                          data-testid={`experiment-results-${exp.id}`}
                        >
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-medium">
                              Results
                            </span>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {results.variantA && (
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">
                                    Variant A
                                    {results.statisticallySignificant &&
                                      exp.status === "completed" &&
                                      results.variantA?.score >
                                        results.variantB?.score && (
                                        <Badge
                                          variant="outline"
                                          className="ml-2 text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                        >
                                          Winner
                                        </Badge>
                                      )}
                                  </span>
                                  {Object.entries(
                                    results.variantA as Record<string, unknown>
                                  ).map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-muted-foreground">
                                        {k}:{" "}
                                      </span>
                                      <span>{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {results.variantB && (
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">
                                    Variant B
                                    {results.statisticallySignificant &&
                                      exp.status === "completed" &&
                                      results.variantB?.score >
                                        results.variantA?.score && (
                                        <Badge
                                          variant="outline"
                                          className="ml-2 text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                        >
                                          Winner
                                        </Badge>
                                      )}
                                  </span>
                                  {Object.entries(
                                    results.variantB as Record<string, unknown>
                                  ).map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-muted-foreground">
                                        {k}:{" "}
                                      </span>
                                      <span>{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
                              {results.confidence != null && (
                                <div>
                                  <span className="text-muted-foreground">
                                    Confidence:{" "}
                                  </span>
                                  <span className="font-medium">
                                    {results.confidence}%
                                  </span>
                                </div>
                              )}
                              {results.pValue != null && (
                                <div>
                                  <span className="text-muted-foreground">
                                    P-Value:{" "}
                                  </span>
                                  <span className="font-medium">
                                    {results.pValue}
                                  </span>
                                </div>
                              )}
                              {results.statisticallySignificant && (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                >
                                  Statistically Significant
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {exp.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: exp.id,
                                status: "running",
                              })
                            }
                            disabled={updateExperimentMutation.isPending}
                            data-testid={`button-start-experiment-${exp.id}`}
                          >
                            <Play className="w-3.5 h-3.5 mr-1" />
                            Start
                          </Button>
                        )}
                        {exp.status === "running" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: exp.id,
                                status: "cancelled",
                              })
                            }
                            disabled={updateExperimentMutation.isPending}
                            data-testid={`button-stop-experiment-${exp.id}`}
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Experiment</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-agent">Agent</Label>
                  <Select
                    value={newExperiment.agentId}
                    onValueChange={(v) =>
                      setNewExperiment({ ...newExperiment, agentId: v })
                    }
                  >
                    <SelectTrigger
                      id="exp-agent"
                      data-testid="select-experiment-agent"
                    >
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {(agents || []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-name">Experiment Name</Label>
                  <Input
                    id="exp-name"
                    value={newExperiment.name}
                    onChange={(e) =>
                      setNewExperiment({
                        ...newExperiment,
                        name: e.target.value,
                      })
                    }
                    placeholder="Experiment name"
                    data-testid="input-experiment-name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>
                    Traffic Allocation: {newExperiment.trafficPercent}%
                  </Label>
                  <Slider
                    value={[newExperiment.trafficPercent]}
                    onValueChange={([v]) =>
                      setNewExperiment({
                        ...newExperiment,
                        trafficPercent: v,
                      })
                    }
                    min={1}
                    max={100}
                    step={1}
                    data-testid="slider-traffic-percent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-metric">Success Metric</Label>
                  <Select
                    value={newExperiment.successMetric}
                    onValueChange={(v) =>
                      setNewExperiment({
                        ...newExperiment,
                        successMetric: v,
                      })
                    }
                  >
                    <SelectTrigger
                      id="exp-metric"
                      data-testid="select-success-metric"
                    >
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="success_rate">
                        Success Rate
                      </SelectItem>
                      <SelectItem value="faithfulness_score">
                        Faithfulness Score
                      </SelectItem>
                      <SelectItem value="latency">Latency</SelectItem>
                      <SelectItem value="cost_efficiency">
                        Cost Efficiency
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exp-eval-gate">Eval Gate</Label>
                  <Input
                    id="exp-eval-gate"
                    value={newExperiment.evalGate}
                    onChange={(e) =>
                      setNewExperiment({
                        ...newExperiment,
                        evalGate: e.target.value,
                      })
                    }
                    placeholder="e.g. pass_rate > 0.95"
                    data-testid="input-eval-gate"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <Label>Guardrails</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="guard-policy"
                      checked={newExperiment.noPolicyViolationIncrease}
                      onCheckedChange={(v) =>
                        setNewExperiment({
                          ...newExperiment,
                          noPolicyViolationIncrease: v === true,
                        })
                      }
                      data-testid="checkbox-no-policy-violation"
                    />
                    <Label htmlFor="guard-policy" className="text-sm">
                      No policy violation increase
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm shrink-0">
                      Max latency increase:
                    </Label>
                    <Input
                      type="number"
                      value={newExperiment.maxLatencyIncrease}
                      onChange={(e) =>
                        setNewExperiment({
                          ...newExperiment,
                          maxLatencyIncrease: Number(e.target.value),
                        })
                      }
                      className="w-20"
                      data-testid="input-max-latency-increase"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm shrink-0">
                      Min success rate:
                    </Label>
                    <Input
                      type="number"
                      value={newExperiment.minSuccessRate}
                      onChange={(e) =>
                        setNewExperiment({
                          ...newExperiment,
                          minSuccessRate: Number(e.target.value),
                        })
                      }
                      className="w-20"
                      data-testid="input-min-success-rate"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-experiment"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    createExperimentMutation.mutate({
                      agentId: newExperiment.agentId,
                      name: newExperiment.name,
                      trafficPercent: newExperiment.trafficPercent,
                      successMetric: newExperiment.successMetric,
                      evalGate: newExperiment.evalGate,
                      guardrails: {
                        noPolicyViolationIncrease:
                          newExperiment.noPolicyViolationIncrease,
                        maxLatencyIncrease: newExperiment.maxLatencyIncrease,
                        minSuccessRate: newExperiment.minSuccessRate,
                      },
                    })
                  }
                  disabled={
                    !newExperiment.agentId ||
                    !newExperiment.name ||
                    createExperimentMutation.isPending
                  }
                  data-testid="button-submit-experiment"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="remediation">
          <div className="flex flex-col gap-4">
            {allTimeline.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-12 gap-3"
                data-testid="empty-timeline"
              >
                <Activity className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No auto-remediation actions yet
                </p>
              </div>
            )}

            <div className="relative">
              {allTimeline.length > 0 && (
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              )}
              <div className="flex flex-col gap-4">
                {allTimeline.map((entry) => {
                  const entryRisk =
                    riskConfig[entry.riskLevel] || riskConfig.low;

                  return (
                    <div
                      key={entry.id}
                      className="relative pl-10"
                      data-testid={`timeline-entry-${entry.id}`}
                    >
                      <div className="absolute left-2.5 top-3 w-3 h-3 rounded-full bg-border border-2 border-background" />
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(entry.createdAt)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[11px]"
                                >
                                  {entry.agentName}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[11px] border ${entryRisk.className}`}
                                >
                                  {entry.riskLevel}
                                </Badge>
                                {entry.autoApplied && (
                                  <Badge
                                    variant="outline"
                                    className="text-[11px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                  >
                                    Auto-Applied
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <WhyBadge
                              trigger={entry.trigger}
                              decision={entry.change}
                              evidence={
                                typeof entry.proof === "object" && entry.proof
                                  ? Object.entries(entry.proof)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(", ")
                                  : String(entry.proof || "Evidence available")
                              }
                              rollback={entry.canRollback ? "Available" : undefined}
                            />

                            {entry.canRollback && (
                              <div className="flex items-center pt-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    rollbackMutation.mutate(entry.id)
                                  }
                                  disabled={rollbackMutation.isPending}
                                  data-testid={`button-rollback-${entry.id}`}
                                >
                                  <Undo2 className="w-3.5 h-3.5 mr-1" />
                                  Rollback
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
