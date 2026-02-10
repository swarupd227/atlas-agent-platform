import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Bot,
  ArrowLeft,
  Activity,
  DollarSign,
  Clock,
  Shield,
  Zap,
  Play,
  RotateCcw,
  Rocket,
  CheckCircle,
  BarChart3,
  FileCode,
  AlertTriangle,
  Terminal,
  Cpu,
  Wrench,
  Lock,
  Unlock,
  Database,
  GitBranch,
  BookOpen,
  ShieldCheck,
  FlaskConical,
  History,
  Gauge,
  XCircle,
  ChevronRight,
  Archive,
  Power,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  AlertCircle,
  Download,
  Users,
  Tag,
  Eye,
  Layers,
  FileText,
  PenTool,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { InlineDiff } from "@/components/config-diff";
import { ActionCard } from "@/components/action-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Agent, RunTrace, EvalSuite, OutcomeContract, ImprovementRecommendation, AutonomousActionLog, AgentVersion, Deployment, Policy, Approval, PolicyException } from "@shared/schema";

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const agentId = params?.id;

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
    enabled: !!agentId,
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/agents", agentId, "traces"],
    enabled: !!agentId,
  });
  const { data: evals } = useQuery<EvalSuite[]>({
    queryKey: ["/api/agents", agentId, "evals"],
    enabled: !!agentId,
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: recommendations } = useQuery<ImprovementRecommendation[]>({
    queryKey: ["/api/agents", agentId, "recommendations"],
    enabled: !!agentId,
  });
  const { data: autonomousActions } = useQuery<AutonomousActionLog[]>({
    queryKey: ["/api/agents", agentId, "autonomous-actions"],
    enabled: !!agentId,
  });
  const { data: timeline } = useQuery<Array<{
    id: string;
    timestamp: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    diff?: { field: string; from: string; to: string }[];
    correlatedMetric?: { metric: string; before: number; after: number; change: string };
  }>>({
    queryKey: ["/api/agents", agentId, "timeline"],
    enabled: !!agentId,
  });
  const { data: agentVersions } = useQuery<AgentVersion[]>({
    queryKey: ["/api/agents", agentId, "versions"],
    enabled: !!agentId,
  });
  const { data: allDeployments } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });
  const { data: allPolicies } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: allApprovals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: agentExceptions } = useQuery<PolicyException[]>({
    queryKey: ["/api/policy-exceptions/agent", agentId],
  });

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const deployPerm = usePermission("deploy_staging_pilot");
  const tracesPerm = usePermission("view_traces");
  const approvalPerm = usePermission("approve_changes");
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [replacementAgentId, setReplacementAgentId] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [retirementChecklist, setRetirementChecklist] = useState<boolean[]>([false, false, false, false, false, false, false, false]);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const [shadowReplayOpen, setShadowReplayOpen] = useState(false);
  const [shadowTimeWindow, setShadowTimeWindow] = useState("24h");
  const [shadowEnvironment, setShadowEnvironment] = useState("staging");
  const [shadowSampleSize, setShadowSampleSize] = useState("10");
  const [shadowResult, setShadowResult] = useState<{ status: string; summary: string; tracesReplayed: number; passRate: number; divergences: Array<{ traceId: string; original: string; replay: string; divergenceType: string }> } | null>(null);
  const [blueprintView, setBlueprintView] = useState<"graph" | "json">("graph");
  const [diffVersionA, setDiffVersionA] = useState("");
  const [diffVersionB, setDiffVersionB] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"typescript" | "python">("typescript");
  const [exportLlmProvider, setExportLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [exportMaxIterations, setExportMaxIterations] = useState(20);
  const [exportCompletionPromise, setExportCompletionPromise] = useState("TASK_COMPLETE");
  const [exportPreview, setExportPreview] = useState<{ files: Record<string, string>; metadata: any } | null>(null);
  const [exportPreviewFile, setExportPreviewFile] = useState<string>("");
  const [exportStep, setExportStep] = useState<"configure" | "preview">("configure");

  const { data: deprecationSignals, isLoading: deprecationLoading, isError: deprecationError } = useQuery<{
    riskScore: number;
    recommendation: string;
    signals: Array<{ signal: string; severity: string; value: number | string; threshold: number | string; message: string }>;
    metadata: { recentSuccessRate: number; costRevenueRatio: number; daysSinceLastRun: number; avgEvalPassRate: number; healthScore: number; totalTraces7d: number; betterAgentExists: boolean; linkedOutcomeStatus: string };
    retirementCriteria: { lowROI: boolean; persistentInstability: boolean; replacedByBetter: boolean; workflowObsolete: boolean };
    computedAt: string;
  }>({
    queryKey: ["/api/agents", agentId, "deprecation-signals"],
    enabled: !!agentId,
  });

  const [replacementProposal, setReplacementProposal] = useState<any>(null);

  const proposalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/propose-replacement`, { agentId });
      return res.json();
    },
    onSuccess: (data) => {
      setReplacementProposal(data);
      toast({ title: "Replacement proposal generated" });
    },
    onError: () => toast({ title: "Failed to generate proposal", variant: "destructive" }),
  });

  const initiateRetirementMutation = useMutation({
    mutationFn: async (data: { reason: string; replacementAgentId?: string; requireApproval: boolean }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/initiate-retirement`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setRetireDialogOpen(false);
      toast({ title: data.status === "pending_approval" ? "Retirement sent for expert approval" : "Retirement initiated" });
    },
    onError: () => toast({ title: "Failed to initiate retirement", variant: "destructive" }),
  });

  const shadowReplayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/shadow-replay`, {
        timeWindow: shadowTimeWindow,
        environment: shadowEnvironment,
        sampleSize: parseInt(shadowSampleSize) || 10,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setShadowResult(data);
      toast({ title: "Shadow replay complete", description: `${data.tracesReplayed} traces replayed with ${Math.round(data.passRate * 100)}% pass rate` });
    },
    onError: (error: Error) => {
      toast({ title: "Shadow replay failed", description: error.message, variant: "destructive" });
    },
  });

  const completeRetirementMutation = useMutation({
    mutationFn: async (data: { handoverComplete: boolean; requireApproval: boolean }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/complete-retirement`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: data.status === "retired" ? "Agent archived successfully" : "Handover review submitted for approval" });
    },
    onError: () => toast({ title: "Failed to complete retirement", variant: "destructive" }),
  });

  const retireMutation = useMutation({
    mutationFn: async (data: { status: string; description?: string }) => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setRetireDialogOpen(false);
      toast({ title: "Agent status updated" });
    },
  });

  const applyRecMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}`, { status: "applied" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "recommendations"] });
      toast({ title: "Recommendation applied" });
    },
  });

  const dismissRecMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}`, { status: "dismissed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "recommendations"] });
      toast({ title: "Recommendation dismissed" });
    },
  });

  const exportCodeMutation = useMutation({
    mutationFn: async (params: { format: string; llmProvider: string; maxIterations: number; completionPromise: string }) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/export-code`, params);
      return res.json();
    },
    onSuccess: (data) => {
      setExportPreview(data);
      const fileNames = Object.keys(data.files || {});
      if (fileNames.length > 0) setExportPreviewFile(fileNames.find((f: string) => f.includes("entrypoint")) || fileNames[0]);
      setExportStep("preview");
    },
    onError: () => {
      toast({ title: "Export failed", description: "Could not generate code package", variant: "destructive" });
    },
  });

  function downloadExportPackage() {
    if (!exportPreview) return;
    const files = exportPreview.files;
    const blob = new Blob(
      [JSON.stringify({ files, metadata: exportPreview.metadata }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent?.name?.replace(/\s+/g, "-").toLowerCase() || "agent"}-export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Package downloaded" });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Bot className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Agent not found</p>
        <Link href="/agents">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Registry
          </Button>
        </Link>
      </div>
    );
  }

  const outcome = outcomes?.find((o) => o.id === agent.outcomeId);
  const recentTraces = traces?.slice(0, 10) || [];
  const successTraces = recentTraces.filter((t) => t.status === "completed").length;
  const failedTraces = recentTraces.filter((t) => t.status === "failed").length;
  const agentDeployments = allDeployments?.filter(d => d.agentId === agentId) || [];
  const agentApprovals = allApprovals?.filter(a => a.objectId === agentId) || [];
  const policyBindings = (agent.policyBindings || []) as Array<{ policyId: string; name: string; enforcement: string; description?: string }>;

  const handleExportJSON = () => {
    if (!timeline) return;
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name}-audit-log.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!timeline) return;
    const headers = ["id", "timestamp", "category", "title", "description", "severity"];
    const rows = timeline.map(e => headers.map(h => `"${String((e as any)[h] || "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name}-audit-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-detail">
      <div className="flex items-center gap-3">
        <Link href="/agents">
          <Button variant="ghost" size="icon" data-testid="button-back-agents">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-agent-name">{agent.name}</h1>
            <StatusBadge status={agent.status} />
            <StatusBadge status={agent.riskTier} />
            <StatusBadge status={agent.autonomyMode} />
          </div>
          <p className="text-sm text-muted-foreground">{agent.description || "No description"}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={agent.currentVersion || ""}
          onValueChange={(val) => toast({ title: `Switched to version ${val}` })}
        >
          <SelectTrigger className="w-auto" data-testid="select-version">
            <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">v{agent.currentVersion}</Badge>
          </SelectTrigger>
          <SelectContent>
            {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
              <SelectItem key={v.id} value={v.semver} data-testid={`version-option-${v.semver}`}>
                v{v.semver} ({v.status})
              </SelectItem>
            )) : (
              <SelectItem value={agent.currentVersion || "1.0.0"}>v{agent.currentVersion}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select
          value={agent.environment || "staging"}
          onValueChange={(val) => toast({ title: `Switched to environment ${val}` })}
        >
          <SelectTrigger className="w-auto" data-testid="select-environment">
            <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">{agent.environment}</Badge>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="pilot">Pilot</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{agent.modelProvider} / {agent.modelName}</Badge>
        {outcome && <Badge variant="outline" className="text-xs">{outcome.name}</Badge>}
        {agent.toolAccessClass && (
          <Badge variant="outline" className="text-xs" data-testid="badge-tool-access-class">
            <Wrench className="w-3 h-3 mr-1" />{agent.toolAccessClass}
          </Badge>
        )}
        {agent.complianceTags && (agent.complianceTags as string[]).length > 0 && (agent.complianceTags as string[]).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-compliance-${tag}`}>
            <Tag className="w-3 h-3 mr-1" />{tag}
          </Badge>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" data-testid="button-run-test">
          <Play className="w-3.5 h-3.5 mr-1.5" /> Run Test
        </Button>
        <Button variant="outline" size="sm" data-testid="button-run-shadow-replay" onClick={() => { setShadowReplayOpen(true); setShadowResult(null); }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Shadow Replay
        </Button>
        <Button variant="outline" size="sm" data-testid="button-request-approval" onClick={() => toast({ title: "Approval request submitted" })} disabled={!approvalPerm.allowed} title={!approvalPerm.allowed ? "You do not have permission to request approvals" : undefined}>
          <Shield className="w-3.5 h-3.5 mr-1.5" /> Request Approval
          {approvalPerm.allowed && approvalPerm.permission.access === "conditional" && approvalPerm.permission.annotation && (
            <Badge variant="secondary" className="text-[10px] ml-1">{approvalPerm.permission.annotation}</Badge>
          )}
        </Button>
        <Button variant="outline" size="sm" data-testid="button-rollback">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Rollback
        </Button>
        <Button size="sm" data-testid="button-deploy" disabled={!deployPerm.allowed} title={!deployPerm.allowed ? "You do not have permission to deploy" : undefined}>
          <Rocket className="w-3.5 h-3.5 mr-1.5" /> Deploy
          {deployPerm.allowed && deployPerm.permission.access === "conditional" && deployPerm.permission.annotation && (
            <Badge variant="secondary" className="text-[10px] ml-1">{deployPerm.permission.annotation}</Badge>
          )}
        </Button>
        {agent.status !== "retired" && (
          <Button variant="outline" size="sm" onClick={() => setRetireDialogOpen(true)} data-testid="button-retire-agent">
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Retire
          </Button>
        )}
        {agent.status === "retired" && (
          <Button variant="outline" size="sm" onClick={() => retireMutation.mutate({ status: "active" })} data-testid="button-reactivate-agent">
            <Power className="w-3.5 h-3.5 mr-1.5" /> Reactivate
          </Button>
        )}
      </div>

      <Tabs defaultValue="summary" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
          <TabsTrigger value="traces" data-testid="tab-traces">Runs & Traces</TabsTrigger>
          <TabsTrigger value="evals" data-testid="tab-evals">Evals</TabsTrigger>
          <TabsTrigger value="releases" data-testid="tab-releases">Releases</TabsTrigger>
          <TabsTrigger value="blueprint" data-testid="tab-blueprint">Blueprint</TabsTrigger>
          <TabsTrigger value="lifecycle" data-testid="tab-lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="monitor" data-testid="tab-monitor">Monitor</TabsTrigger>
          <TabsTrigger value="autonomous" data-testid="tab-autonomous">Autonomous</TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">Governance</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="flex flex-col gap-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Health Score" value={`${agent.healthScore}%`} icon={Activity} variant="success" testId="stat-agent-health" />
            <StatCard title="Success Rate" value={`${((agent.successRate || 0) * 100).toFixed(1)}%`} icon={CheckCircle} variant="success" testId="stat-agent-success" />
            <StatCard title="Avg Latency" value={`${agent.avgLatencyMs}ms`} icon={Clock} variant="default" testId="stat-agent-latency" />
            <StatCard title="Cost / Run" value={`$${agent.costPerRun?.toFixed(3)}`} icon={DollarSign} variant="default" testId="stat-agent-cost" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Outcome Contribution</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {outcome ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{outcome.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-md bg-muted/50">
                        <span className="text-xs text-muted-foreground block">Monthly Revenue</span>
                        <span className="text-lg font-semibold">${(agent.monthlyRevenue || 0).toLocaleString()}</span>
                      </div>
                      <div className="p-3 rounded-md bg-muted/50">
                        <span className="text-xs text-muted-foreground block">Total Runs</span>
                        <span className="text-lg font-semibold">{(agent.totalRuns || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No outcome linked</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Run Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-md bg-emerald-500/10 flex-1 text-center">
                    <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{successTraces}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Successful</span>
                  </div>
                  <div className="p-3 rounded-md bg-red-500/10 flex-1 text-center">
                    <span className="text-2xl font-semibold text-red-600 dark:text-red-400">{failedTraces}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Failed</span>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50 flex-1 text-center">
                    <span className="text-2xl font-semibold">{recentTraces.length}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">Total</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const pendingApprovals = agentApprovals.filter(a => a.status === "pending");
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            const hasRecentIncident = agent.lastIncidentAt && new Date(agent.lastIncidentAt) > sevenDaysAgo;
            const expiringExceptions = (agentExceptions || []).filter((ex: PolicyException) => {
              if (ex.status !== "approved" || !ex.expiresAt) return false;
              const expDate = new Date(ex.expiresAt);
              return expDate > now && expDate <= fourteenDaysFromNow;
            });

            function formatTimeAgo(dateStr: string | Date | null | undefined): string {
              if (!dateStr) return "Never";
              const d = new Date(dateStr);
              const diffMs = now.getTime() - d.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays === 0) return "Today";
              if (diffDays === 1) return "1d ago";
              if (diffDays < 30) return `${diffDays}d ago`;
              return `${Math.floor(diffDays / 30)}mo ago`;
            }

            return (
              <Card data-testid="card-open-items">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Open Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2" data-testid="section-pending-approvals">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Pending Approvals</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{pendingApprovals.length}</Badge>
                      </div>
                      {pendingApprovals.length > 0 ? pendingApprovals.map((approval) => (
                        <Link key={approval.id} href={`/approvals/${approval.id}`}>
                          <div className="p-2 rounded-md bg-muted/30 hover-elevate cursor-pointer" data-testid={`pending-approval-${approval.id}`}>
                            <span className="text-xs font-medium block">{(approval.type || "").replace(/_/g, " ")}</span>
                            <span className="text-[11px] text-muted-foreground truncate block">{(approval.description || "").slice(0, 60)}</span>
                          </div>
                        </Link>
                      )) : (
                        <p className="text-[11px] text-muted-foreground py-3 text-center">No pending approvals</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2" data-testid="section-active-incidents">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Active Incidents</span>
                      </div>
                      {hasRecentIncident ? (
                        <div className="p-2 rounded-md bg-amber-500/10 flex items-center gap-2" data-testid="incident-active">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs">Incident reported {formatTimeAgo(agent.lastIncidentAt)}</span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-md bg-emerald-500/10 flex items-center gap-2" data-testid="incident-none">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-xs">No recent incidents</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2" data-testid="section-expiring-exceptions">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-medium">Expiring Exceptions</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{expiringExceptions.length}</Badge>
                      </div>
                      {expiringExceptions.length > 0 ? expiringExceptions.map((ex: PolicyException) => {
                        const daysLeft = Math.ceil((new Date(ex.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={ex.id} className="p-2 rounded-md bg-muted/30" data-testid={`expiring-exception-${ex.id}`}>
                            <span className="text-xs font-medium block">Policy: {ex.policyId}</span>
                            <span className="text-[11px] text-muted-foreground">{daysLeft} day{daysLeft !== 1 ? "s" : ""} until expiry</span>
                          </div>
                        );
                      }) : (
                        <p className="text-[11px] text-muted-foreground py-3 text-center">No expiring exceptions</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        <TabsContent value="traces" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Run Traces</CardTitle>
                <Badge variant="outline" className="text-[10px]">{recentTraces.length} traces</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentTraces.length > 0 ? recentTraces.map((trace) => {
                const isExpanded = expandedTrace === trace.id;
                const decisions = trace.decisions as any[] | null;
                const toolCalls = trace.toolCalls as any[] | null;
                const policyChecks = trace.policyChecks as any[] | null;
                const tokenUsage = trace.tokenUsage as any | null;
                const promptInputs = trace.promptInputs as any | null;
                const retrievedDocs = trace.retrievedDocs as any[] | null;
                const hasExplainability = decisions || toolCalls || policyChecks || tokenUsage;
                return (
                  <div key={trace.id} className="flex flex-col">
                    <div
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                      data-testid={`trace-row-${trace.id}`}
                      onClick={() => setExpandedTrace(isExpanded ? null : trace.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                          <Terminal className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium truncate">{trace.inputSummary || "Run"}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {trace.environment} | {trace.latencyMs}ms | ${trace.costUsd?.toFixed(4)}
                            {trace.modelId ? ` | ${trace.modelId}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasExplainability && <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                        <StatusBadge status={trace.status} />
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="ml-10 mt-1 mb-2 flex flex-col gap-3 p-3 rounded-md border bg-background" data-testid={`explainability-panel-${trace.id}`}>
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-semibold">Explainability Report</span>
                        </div>

                        {trace.inputSummary && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Input</span>
                            <p className="text-xs bg-muted/30 p-2 rounded-md">{trace.inputSummary}</p>
                          </div>
                        )}

                        {trace.outputSummary && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Output</span>
                            <p className="text-xs bg-muted/30 p-2 rounded-md">{trace.outputSummary}</p>
                          </div>
                        )}

                        {decisions && decisions.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Decision Reasoning</span>
                            {decisions.map((decision: any, di: number) => (
                              <div key={di} className="flex items-start gap-2 p-2 rounded-md bg-muted/20" data-testid={`decision-${trace.id}-${di}`}>
                                <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">{di + 1}</span>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-medium">{decision.step || decision.action || `Step ${di + 1}`}</span>
                                  <span className="text-[11px] text-muted-foreground">{decision.reasoning || decision.description || JSON.stringify(decision)}</span>
                                  {decision.confidence !== undefined && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] text-muted-foreground">Confidence:</span>
                                      <Progress value={decision.confidence * 100} className="h-1 w-16" />
                                      <span className="text-[10px] font-medium">{(decision.confidence * 100).toFixed(0)}%</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {toolCalls && toolCalls.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Tool Calls</span>
                            <div className="flex flex-wrap gap-1.5">
                              {toolCalls.map((tc: any, ti: number) => (
                                <Badge key={ti} variant="outline" className="text-[10px]" data-testid={`tool-call-${trace.id}-${ti}`}>
                                  <Wrench className="w-2.5 h-2.5 mr-1" />
                                  {tc.tool || tc.name || `tool_${ti}`}
                                  {tc.status && <span className="ml-1 opacity-60">({tc.status})</span>}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {policyChecks && policyChecks.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Policy Checks</span>
                            {policyChecks.map((pc: any, pi: number) => (
                              <div key={pi} className="flex items-center gap-2 text-xs" data-testid={`policy-check-${trace.id}-${pi}`}>
                                {pc.passed || pc.result === "pass" ? (
                                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                                )}
                                <span>{pc.policy || pc.name || `Policy ${pi + 1}`}</span>
                                <span className="text-muted-foreground">{pc.reason || ""}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {retrievedDocs && retrievedDocs.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Retrieved Sources</span>
                            <div className="flex flex-wrap gap-1.5">
                              {retrievedDocs.map((doc: any, ri: number) => (
                                <Badge key={ri} variant="outline" className="text-[10px]">
                                  <Database className="w-2.5 h-2.5 mr-1" />
                                  {doc.title || doc.source || `Source ${ri + 1}`}
                                  {doc.relevance !== undefined && <span className="ml-1 opacity-60">({(doc.relevance * 100).toFixed(0)}%)</span>}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {tokenUsage && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Token Usage</span>
                            <div className="flex items-center gap-4 text-[11px]">
                              {tokenUsage.prompt !== undefined && (
                                <span>Prompt: <span className="font-medium">{tokenUsage.prompt?.toLocaleString()}</span></span>
                              )}
                              {tokenUsage.completion !== undefined && (
                                <span>Completion: <span className="font-medium">{tokenUsage.completion?.toLocaleString()}</span></span>
                              )}
                              {tokenUsage.total !== undefined && (
                                <span>Total: <span className="font-medium">{tokenUsage.total?.toLocaleString()}</span></span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-2 border-t">
                          {!tracesPerm.allowed ? (
                            <Button variant="outline" size="sm" disabled title="You do not have permission to view traces" data-testid={`button-view-full-trace-${trace.id}`}>
                              <Terminal className="w-3 h-3 mr-1" /> View Full Trace
                            </Button>
                          ) : (
                            <Link href={`/traces/${trace.id}`}>
                              <Button variant="outline" size="sm" data-testid={`button-view-full-trace-${trace.id}`}>
                                <Terminal className="w-3 h-3 mr-1" /> View Full Trace
                                {tracesPerm.permission.access === "conditional" && tracesPerm.permission.annotation && (
                                  <Badge variant="secondary" className="text-[10px] ml-1">{tracesPerm.permission.annotation}</Badge>
                                )}
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No traces recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evals" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Evaluation Suites</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {evals && evals.length > 0 ? evals.map((suite) => (
                <Link key={suite.id} href={`/evals/${suite.id}`}>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer" data-testid={`eval-row-${suite.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 shrink-0">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{suite.name}</span>
                        <span className="text-[11px] text-muted-foreground">{suite.totalCases} cases | {suite.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{((suite.passRate || 0) * 100).toFixed(0)}%</span>
                      <Progress value={(suite.passRate || 0) * 100} className="h-1.5 w-16" />
                    </div>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No eval suites configured</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-regression-diff">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Regression Diff</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Version A</Label>
                  <Select value={diffVersionA} onValueChange={(val) => { setDiffVersionA(val); setShowDiff(false); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-diff-version-a">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
                        <SelectItem key={v.id} value={v.semver} data-testid={`diff-version-a-${v.semver}`}>v{v.semver}</SelectItem>
                      )) : (
                        <SelectItem value="none" disabled>No versions</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Version B</Label>
                  <Select value={diffVersionB} onValueChange={(val) => { setDiffVersionB(val); setShowDiff(false); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-diff-version-b">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agentVersions && agentVersions.length > 0 ? agentVersions.map(v => (
                        <SelectItem key={v.id} value={v.semver} data-testid={`diff-version-b-${v.semver}`}>v{v.semver}</SelectItem>
                      )) : (
                        <SelectItem value="none" disabled>No versions</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground invisible">Action</Label>
                  <Button size="sm" disabled={!diffVersionA || !diffVersionB} onClick={() => setShowDiff(true)} data-testid="button-compare-diff">
                    Compare
                  </Button>
                </div>
              </div>

              {showDiff && diffVersionA && diffVersionB && (() => {
                const regressionMetrics = [
                  { metric: "Overall Pass Rate", versionA: 94.2, versionB: 91.8, unit: "%", higherIsBetter: true },
                  { metric: "Safety Suite", versionA: 98.0, versionB: 97.5, unit: "%", higherIsBetter: true },
                  { metric: "Compliance Suite", versionA: 96.1, versionB: 93.4, unit: "%", higherIsBetter: true },
                  { metric: "Edge Cases", versionA: 87.3, versionB: 85.1, unit: "%", higherIsBetter: true },
                  { metric: "Adversarial", versionA: 82.5, versionB: 79.0, unit: "%", higherIsBetter: true },
                  { metric: "Avg Latency", versionA: 245, versionB: 312, unit: "ms", higherIsBetter: false },
                  { metric: "Avg Cost", versionA: 0.023, versionB: 0.031, unit: "$", higherIsBetter: false },
                ];
                const regressions = regressionMetrics.filter(m => {
                  const delta = m.versionB - m.versionA;
                  return m.higherIsBetter ? delta < 0 : delta > 0;
                }).length;

                return (
                  <div className="flex flex-col gap-3" data-testid="regression-diff-results">
                    <div className={`text-xs font-medium p-2 rounded-md ${regressions > 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`} data-testid="text-regression-summary">
                      Comparing v{diffVersionA} → v{diffVersionB}: {regressions} regression{regressions !== 1 ? "s" : ""} detected
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-xs" data-testid="table-regression-diff">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Metric</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">v{diffVersionA}</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">v{diffVersionB}</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regressionMetrics.map((m) => {
                            const delta = m.versionB - m.versionA;
                            const isImprovement = m.higherIsBetter ? delta > 0 : delta < 0;
                            const isRegression = m.higherIsBetter ? delta < 0 : delta > 0;
                            const deltaStr = m.unit === "$" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
                            return (
                              <tr key={m.metric} className="border-b last:border-0" data-testid={`regression-row-${m.metric.replace(/\s+/g, "-").toLowerCase()}`}>
                                <td className="py-2 pr-4 font-medium">{m.metric}</td>
                                <td className="text-right py-2 px-4">{m.unit === "$" ? `$${m.versionA.toFixed(3)}` : `${m.versionA}${m.unit}`}</td>
                                <td className="text-right py-2 px-4">{m.unit === "$" ? `$${m.versionB.toFixed(3)}` : `${m.versionB}${m.unit}`}</td>
                                <td className={`text-right py-2 pl-4 font-medium flex items-center justify-end gap-1 ${isRegression ? "text-red-600 dark:text-red-400" : isImprovement ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                                  {isRegression ? <TrendingDown className="w-3 h-3" /> : isImprovement ? <TrendingUp className="w-3 h-3" /> : null}
                                  {deltaStr}{m.unit}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="releases" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Version Timeline</CardTitle>
                {agentVersions && <Badge variant="outline" className="text-[10px] ml-auto">{agentVersions.length} versions</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {agentVersions && agentVersions.length > 0 ? (
                <div className="relative" data-testid="version-timeline">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="flex flex-col gap-4">
                    {[...agentVersions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(version => {
                      const versionAny = version as any;
                      return (
                        <div key={version.id} className="relative pl-10" data-testid={`version-entry-${version.id}`}>
                          <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ring-2 ring-background z-10 ${
                            version.status === "active" || version.status === "deployed" ? "bg-emerald-500" :
                            version.status === "deprecated" ? "bg-slate-400" :
                            version.status === "draft" ? "bg-blue-400" :
                            "bg-blue-500"
                          }`} />
                          <div className="flex flex-col gap-2 p-3 rounded-md border bg-background">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-mono" data-testid={`version-semver-${version.id}`}>v{version.semver}</Badge>
                              <StatusBadge status={version.status} />
                              {version.createdBy && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Users className="w-3 h-3" /> {version.createdBy}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                            {versionAny.changelog && (
                              <p className="text-xs text-muted-foreground" data-testid={`version-changelog-${version.id}`}>
                                {versionAny.changelog}
                              </p>
                            )}
                            {versionAny.configSnapshot && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-testid={`version-diff-indicator-${version.id}`}>
                                <FileCode className="w-3 h-3" />
                                <span>Config snapshot available</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No versions recorded</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Linked Deployments</CardTitle>
                {agentDeployments.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{agentDeployments.length} deployments</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {agentDeployments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="linked-deployments">
                  {[...agentDeployments].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(dep => (
                    <Link key={dep.id} href={`/deployments/${dep.id}`}>
                      <Card className="hover-elevate" data-testid={`deployment-card-${dep.id}`}>
                        <CardContent className="p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={dep.environment} />
                            <StatusBadge status={dep.rolloutStrategy || "direct"} />
                            <StatusBadge status={dep.status} />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {dep.version && (
                              <Badge variant="outline" className="text-xs font-mono" data-testid={`deployment-version-${dep.id}`}>v{dep.version}</Badge>
                            )}
                            {dep.canaryPercent != null && dep.canaryPercent > 0 && (
                              <span className="text-[11px] text-muted-foreground" data-testid={`deployment-canary-${dep.id}`}>
                                <Gauge className="w-3 h-3 inline mr-1" />{dep.canaryPercent}% canary
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {dep.createdAt ? new Date(dep.createdAt).toLocaleDateString() : ""}
                          </span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No deployments found</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Version Diff Selector</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3 flex-wrap" data-testid="version-diff-selector">
                <Select value={diffVersionA} onValueChange={(val) => { setDiffVersionA(val); setShowDiff(false); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-diff-version-a">
                    <SelectValue placeholder="Version A" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentVersions && agentVersions.map(v => (
                      <SelectItem key={v.id} value={v.id} data-testid={`diff-version-a-${v.id}`}>v{v.semver}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">vs</span>
                <Select value={diffVersionB} onValueChange={(val) => { setDiffVersionB(val); setShowDiff(false); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-diff-version-b">
                    <SelectValue placeholder="Version B" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentVersions && agentVersions.map(v => (
                      <SelectItem key={v.id} value={v.id} data-testid={`diff-version-b-${v.id}`}>v{v.semver}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!diffVersionA || !diffVersionB || diffVersionA === diffVersionB}
                  onClick={() => setShowDiff(true)}
                  data-testid="button-compare-versions"
                >
                  Compare
                </Button>
              </div>
              {showDiff && diffVersionA && diffVersionB && (() => {
                const vA = agentVersions?.find(v => v.id === diffVersionA);
                const vB = agentVersions?.find(v => v.id === diffVersionB);
                if (!vA || !vB) return null;
                const snapshotA = (vA as any).configSnapshot;
                const snapshotB = (vB as any).configSnapshot;
                return (
                  <div className="flex flex-col gap-3" data-testid="version-diff-result">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-mono">v{vA.semver}</Badge>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <Badge variant="outline" className="text-xs font-mono">v{vB.semver}</Badge>
                    </div>
                    <Separator />
                    {snapshotA && snapshotB ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="diff-side-by-side">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-muted-foreground">v{vA.semver}</span>
                          <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md overflow-auto max-h-[400px]" data-testid="diff-snapshot-a">
                            <code>{JSON.stringify(snapshotA, null, 2)}</code>
                          </pre>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-muted-foreground">v{vB.semver}</span>
                          <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md overflow-auto max-h-[400px]" data-testid="diff-snapshot-b">
                            <code>{JSON.stringify(snapshotB, null, 2)}</code>
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {!snapshotA && !snapshotB
                            ? "Neither version has a config snapshot"
                            : !snapshotA
                              ? `v${vA.semver} has no config snapshot`
                              : `v${vB.semver} has no config snapshot`}
                        </p>
                        <InlineDiff
                          diffs={[
                            { field: "semver", from: vA.semver, to: vB.semver },
                            { field: "status", from: vA.status, to: vB.status },
                            { field: "createdBy", from: vA.createdBy || "unknown", to: vB.createdBy || "unknown" },
                            { field: "blueprintHash", from: vA.blueprintHash || "none", to: vB.blueprintHash || "none" },
                          ]}
                          testIdPrefix="version-diff"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blueprint" className="mt-0 space-y-4">
          <div className="flex items-center gap-2 flex-wrap" data-testid="blueprint-action-bar">
            <Link href={`/blueprints?agentId=${agent.id}`}>
              <Button variant="default" size="sm" data-testid="button-edit-in-studio">
                <PenTool className="w-3.5 h-3.5 mr-1.5" /> Edit in Blueprint Studio
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Draft saved" })} data-testid="button-save-draft">
              <FileCode className="w-3.5 h-3.5 mr-1.5" /> Save as Draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "New version created" })} data-testid="button-create-version">
              <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Create Version
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Eval suite triggered" })} data-testid="button-run-eval-suite">
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Run Eval Suite
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Version comparison opened" })} data-testid="button-compare-version">
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Compare vs Version...
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setExportStep("configure"); setExportPreview(null); setExportDialogOpen(true); }} data-testid="button-export-code">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export as Code
            </Button>
            <div className="flex-1" />
            <div className="flex items-center gap-1" data-testid="blueprint-view-toggle">
              <Button size="icon" variant="ghost" className={`toggle-elevate ${blueprintView === "graph" ? "toggle-elevated" : ""}`} onClick={() => setBlueprintView("graph")} data-testid="button-view-graph">
                <GitBranch className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className={`toggle-elevate ${blueprintView === "json" ? "toggle-elevated" : ""}`} onClick={() => setBlueprintView("json")} data-testid="button-view-json">
                <FileCode className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {blueprintView === "graph" ? (
            <div className="flex gap-4" data-testid="blueprint-split-view">
              <div className="flex-[2] min-w-0">
                <BlueprintWorkflowGraph blueprint={agent.blueprintJson as any} />
              </div>
              <div className="flex-1 min-w-0">
                <Card data-testid="card-node-inspector">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Node Inspector</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-node-inspector-placeholder">Click a node to inspect</p>
                    <Separator />
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Prompt Template</span>
                        <span className="text-xs text-muted-foreground/60">Select a node to view prompt</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Tool Selection</span>
                        <span className="text-xs text-muted-foreground/60">Select a node to view tools</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Budgets</span>
                        <span className="text-xs text-muted-foreground/60">Select a node to view budgets</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">Redaction Settings</span>
                        <span className="text-xs text-muted-foreground/60">Select a node to view redaction</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card data-testid="card-blueprint-json">
              <CardContent className="pt-6">
                <pre className="text-xs font-mono bg-muted/30 p-4 rounded-md overflow-auto max-h-[600px]" data-testid="blueprint-json-view">
                  <code>{JSON.stringify(agent.blueprintJson, null, 2)}</code>
                </pre>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="blueprint-config-grid">
            <BlueprintModelConfig agent={agent} />
            <BlueprintToolsPermissions tools={agent.toolsConfig as any} permissions={agent.permissionsConfig as any} />
            <BlueprintMemoryRag config={agent.memoryRagConfig as any} />
            <BlueprintPolicyBindings bindings={agent.policyBindings as any} />
            <BlueprintEvalBindings bindings={agent.evalBindings as any} />
            <BlueprintRollbackPlan plan={agent.rollbackPlan as any} />
          </div>
        </TabsContent>

        <TabsContent value="lifecycle" className="flex flex-col gap-4 mt-0">
          {/* Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Agent Lifecycle</CardTitle>
                </div>
                {(() => {
                  const retirementApprovals = (allApprovals || []).filter(a => a.objectId === agentId && (a.type === "retirement_review" || a.type === "handover_review"));
                  const hasPendingApproval = retirementApprovals.some(a => a.status === "pending");
                  const hasDeniedApproval = retirementApprovals.some(a => a.status === "denied" || a.status === "rejected");

                  if (hasPendingApproval) {
                    return (
                      <Badge variant="secondary" data-testid="badge-pending-approval">
                        <Clock className="w-3 h-3 mr-1" /> Awaiting Expert Approval
                      </Badge>
                    );
                  }

                  if (agent.status === "active" && !hasDeniedApproval) {
                    return (
                      <Button variant="outline" size="sm" onClick={() => setRetireDialogOpen(true)} data-testid="button-open-retire-dialog">
                        <Power className="w-3 h-3 mr-1" /> Initiate Retirement
                      </Button>
                    );
                  }

                  if (agent.status === "retiring") {
                    return (
                      <Button variant="outline" size="sm" onClick={() => completeRetirementMutation.mutate({ handoverComplete: retirementChecklist.every(Boolean), requireApproval: agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL" })} disabled={completeRetirementMutation.isPending} data-testid="button-complete-retirement">
                        <Archive className="w-3 h-3 mr-1" /> {completeRetirementMutation.isPending ? "Processing..." : "Complete Archival"}
                      </Button>
                    );
                  }

                  return null;
                })()}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Phase timeline */}
              {(() => {
                const phaseItems = [
                  { label: "Draft", phase: "draft" },
                  { label: "Staging", phase: "staging" },
                  { label: "Pilot", phase: "pilot" },
                  { label: "Prod", phase: "prod" },
                  { label: "Deprecated", phase: "deprecated" },
                  { label: "Retired", phase: "retired" },
                  { label: "Archived", phase: "archived" },
                ];
                const statusToPhaseMap: Record<string, string> = {
                  active: "prod",
                  retiring: "deprecated",
                  retired: "archived",
                };
                const currentPhase = statusToPhaseMap[agent.status] || "draft";
                const currentIdx = phaseItems.findIndex(p => p.phase === currentPhase);
                return (
                  <div className="flex items-center gap-0" data-testid="lifecycle-phase-timeline">
                    {phaseItems.map((p, i) => {
                      const isActive = currentPhase === p.phase;
                      const isPast = currentIdx > i;
                      return (
                        <div key={p.phase} className="flex items-center gap-0 flex-1" data-testid={`phase-${p.phase}`}>
                          <div className={`flex flex-col items-center gap-1 flex-1 p-2 rounded-md border text-center ${isActive ? "border-primary bg-primary/5" : isPast ? "bg-muted/50" : ""}`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-primary" : isPast ? "bg-muted-foreground" : "bg-muted"}`} />
                            <span className={`text-[10px] font-medium ${isActive ? "text-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/50"}`}>{p.label}</span>
                          </div>
                          {i < phaseItems.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mx-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Current Status</span>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Current Version</span>
                  <span className="text-sm font-medium">v{agent.currentVersion}</span>
                </div>
              </div>

              {agent.status === "retired" && (
                <div className="p-3 rounded-md bg-muted/50 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">This agent has been retired</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Archived and no longer processing new requests. Historical data and traces remain accessible.</p>
                </div>
              )}
              {agent.status === "retiring" && (
                <div className="p-3 rounded-md bg-amber-500/10 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">Retirement in progress</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Agent is draining active requests and preparing for archival. Complete the knowledge transfer checklist below before final archival.</p>
                  <Progress value={(retirementChecklist.filter(Boolean).length / retirementChecklist.length) * 100} className="h-2" />
                </div>
              )}

              {/* Approval gate status */}
              {(() => {
                const retirementApprovals = (allApprovals || []).filter(a => a.objectId === agentId && (a.type === "retirement_review" || a.type === "handover_review"));
                if (retirementApprovals.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2" data-testid="retirement-approvals">
                    <span className="text-xs font-medium">Approval Gates</span>
                    {retirementApprovals.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`approval-gate-${a.id}`}>
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">{a.type === "retirement_review" ? "Retirement Decision" : "Handover Review"}</span>
                            <span className="text-[10px] text-muted-foreground">{a.description}</span>
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Deprecation Signals Dashboard */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Deprecation Signals</CardTitle>
                </div>
                {deprecationSignals && (
                  <Badge variant={deprecationSignals.recommendation === "retire" ? "destructive" : deprecationSignals.recommendation === "review" ? "secondary" : "outline"} data-testid="badge-risk-recommendation">
                    {deprecationSignals.recommendation === "retire" ? "Recommend Retire" : deprecationSignals.recommendation === "review" ? "Needs Review" : "Healthy"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {deprecationLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : deprecationError ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50" data-testid="signals-error">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Unable to compute deprecation signals. The data may not be available yet.</span>
                </div>
              ) : deprecationSignals ? (
                <>
                  {/* Risk Score Gauge */}
                  <div className="flex flex-col gap-2" data-testid="deprecation-risk-score">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Retirement Risk Score</span>
                      <span className={`text-sm font-bold ${deprecationSignals.riskScore >= 60 ? "text-red-500" : deprecationSignals.riskScore >= 30 ? "text-amber-500" : "text-emerald-500"}`}>
                        {deprecationSignals.riskScore}/100
                      </span>
                    </div>
                    <Progress value={deprecationSignals.riskScore} className="h-2.5" data-testid="progress-risk-score" />
                  </div>

                  {/* Signal breakdown */}
                  {deprecationSignals.signals.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {deprecationSignals.signals.map((sig, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2.5 rounded-md border ${sig.severity === "high" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`} data-testid={`signal-${sig.signal}`}>
                          <AlertCircle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${sig.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{sig.message}</span>
                            <span className="text-[10px] text-muted-foreground">Threshold: {sig.threshold} | Current: {sig.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20" data-testid="signals-healthy">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">No deprecation signals detected — agent is operating normally</span>
                    </div>
                  )}

                  {/* Metadata summary */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="signal-metadata">
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">7d Success Rate</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.recentSuccessRate}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Cost/Revenue</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.costRevenueRatio}x</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Days Since Last Run</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.daysSinceLastRun >= 999 ? "N/A" : deprecationSignals.metadata.daysSinceLastRun}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Avg Eval Pass Rate</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.avgEvalPassRate}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Health Score</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.healthScore}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Traces (7d)</span>
                      <span className="text-xs font-medium">{deprecationSignals.metadata.totalTraces7d}</span>
                    </div>
                  </div>
                  {deprecationSignals.retirementCriteria && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <span className="text-xs font-medium">Retirement Criteria Assessment</span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Low ROI", met: deprecationSignals.retirementCriteria.lowROI, icon: TrendingDown },
                          { label: "Persistent Instability", met: deprecationSignals.retirementCriteria.persistentInstability, icon: AlertTriangle },
                          { label: "Replaced by Better Agent", met: deprecationSignals.retirementCriteria.replacedByBetter, icon: RefreshCw },
                          { label: "Workflow Obsolete", met: deprecationSignals.retirementCriteria.workflowObsolete, icon: Archive },
                        ].map((c) => (
                          <div key={c.label} className={`flex items-center gap-2 p-2 rounded-md border ${c.met ? "border-red-500/30 bg-red-500/5" : "border-muted"}`} data-testid={`criteria-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                            <c.icon className={`w-3 h-3 shrink-0 ${c.met ? "text-red-500" : "text-muted-foreground"}`} />
                            <span className={`text-[10px] ${c.met ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>{c.label}</span>
                            {c.met ? (
                              <Badge variant="destructive" className="text-[9px] ml-auto">Triggered</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] ml-auto">OK</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* AI Replacement Proposal */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Replacement Proposal</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => proposalMutation.mutate()} disabled={proposalMutation.isPending} data-testid="button-generate-replacement">
                  <Cpu className="w-3 h-3 mr-1" /> {proposalMutation.isPending ? "Analyzing..." : "Generate AI Proposal"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {replacementProposal ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" data-testid="badge-strategy">{replacementProposal.replacementStrategy?.replace(/_/g, " ")}</Badge>
                      <Badge variant={replacementProposal.migrationComplexity === "high" ? "destructive" : replacementProposal.migrationComplexity === "medium" ? "secondary" : "outline"} data-testid="badge-complexity">
                        {replacementProposal.migrationComplexity} complexity
                      </Badge>
                    </div>
                    {replacementProposal.estimatedTransitionDays && (
                      <span className="text-[10px] text-muted-foreground">Est. {replacementProposal.estimatedTransitionDays} days to transition</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-proposal-reasoning">{replacementProposal.reasoning}</p>

                  {replacementProposal.templateMatches?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Template Matches</span>
                      {replacementProposal.templateMatches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`template-match-${i}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{m.templateName}</span>
                            <span className="text-[10px] text-muted-foreground">{m.reasoning}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0">{m.matchScore}% match</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {replacementProposal.agentMatches?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Existing Agent Matches</span>
                      {replacementProposal.agentMatches.map((m: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`agent-match-${i}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{m.agentName}</span>
                            <span className="text-[10px] text-muted-foreground">{m.reasoning}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0">{m.matchScore}% match</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {replacementProposal.capabilityGaps?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Capability Gaps</span>
                      <div className="flex flex-wrap gap-1">
                        {replacementProposal.capabilityGaps.map((gap: string, i: number) => (
                          <Badge key={i} variant="secondary" data-testid={`gap-${i}`}>{gap}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {replacementProposal.templateMatches?.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <span className="text-xs font-medium">Old vs New Comparison</span>
                      <div className="overflow-auto">
                        <table className="w-full text-[11px]" data-testid="replacement-comparison-table">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Metric</th>
                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Current Agent</th>
                              <th className="text-left py-1.5 font-medium text-muted-foreground">Replacement Candidate</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Health Score</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.healthScore ?? "—"}/100</td>
                              <td className="py-1.5 font-medium text-emerald-600 dark:text-emerald-400">{replacementProposal.templateMatches[0]?.matchScore ? `${replacementProposal.templateMatches[0].matchScore}% match` : "—"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Success Rate (KPI)</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.successRate ? `${Math.round(agent.successRate * 100)}%` : "—"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.expectedSuccessRate ? `${Math.round(replacementProposal.expectedSuccessRate * 100)}%` : "Projected higher"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Eval Pass Rate</td>
                              <td className="py-1.5 pr-3 font-medium">{deprecationSignals?.metadata?.avgEvalPassRate != null ? `${Math.round(deprecationSignals.metadata.avgEvalPassRate * 100)}%` : "—"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.expectedEvalPassRate ? `${Math.round(replacementProposal.expectedEvalPassRate * 100)}%` : "Baseline TBD"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Monthly Cost</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.monthlyCost != null ? `$${agent.monthlyCost.toFixed(2)}` : "—"}</td>
                              <td className="py-1.5 font-medium">{replacementProposal.estimatedCostChange || "Similar"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Policy Compliance</td>
                              <td className="py-1.5 pr-3 font-medium">{agent?.status === "active" ? "Compliant" : "Under review"}</td>
                              <td className="py-1.5 font-medium text-muted-foreground">{replacementProposal.policyCompliance || "Requires binding"}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-1.5 pr-3 text-muted-foreground">Migration Complexity</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">—</td>
                              <td className="py-1.5 font-medium capitalize">{replacementProposal.migrationComplexity || "—"}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 pr-3 text-muted-foreground">Est. Transition</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">—</td>
                              <td className="py-1.5 font-medium">{replacementProposal.estimatedTransitionDays ? `${replacementProposal.estimatedTransitionDays} days` : "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {replacementProposal.knowledgeTransferSteps?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium">Recommended Transfer Steps</span>
                      {replacementProposal.knowledgeTransferSteps.map((step: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs" data-testid={`transfer-step-${i}`}>
                          <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">Click "Generate AI Proposal" to analyze this agent and suggest replacement strategies</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Knowledge Transfer Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Knowledge Transfer Checklist</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Complete these steps before archiving the agent</span>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-checklist-progress">
                  {retirementChecklist.filter(Boolean).length}/{retirementChecklist.length} completed
                </Badge>
              </div>
              <Progress value={(retirementChecklist.filter(Boolean).length / retirementChecklist.length) * 100} className="h-2" data-testid="progress-checklist" />
              {[
                { label: "Migrate memory sources and RAG configurations", icon: Database },
                { label: "Import resolved cases to replacement agent", icon: FileCode },
                { label: "Preserve audit artifacts and compliance evidence", icon: Shield },
                { label: "Export evaluation suite results", icon: FlaskConical },
                { label: "Transfer tool configurations to replacement", icon: Wrench },
                { label: "Revoke tool credentials for retired agent", icon: Lock },
                { label: "Notify dependent outcome owners", icon: Users },
                { label: "Generate final retirement report", icon: FileText },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`checklist-item-${i}`}>
                  <Checkbox
                    checked={retirementChecklist[i]}
                    onCheckedChange={(checked) => {
                      const next = [...retirementChecklist];
                      next[i] = !!checked;
                      setRetirementChecklist(next);
                    }}
                    data-testid={`checkbox-checklist-${i}`}
                  />
                  <item.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className={`text-xs ${retirementChecklist[i] ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Retirement Completion Requirements */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Retirement Completion</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Export Archive</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Download a complete archive of traces, evaluations, configurations, and audit trail.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/agents/${agentId}/export-archive`);
                        const archive = await res.json();
                        const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `agent-archive-${agent?.name?.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({ title: "Archive exported", description: `${archive.summary.totalTraces} traces, ${archive.summary.totalEvals} evals exported` });
                      } catch {
                        toast({ title: "Export failed", variant: "destructive" });
                      }
                    }}
                    data-testid="button-export-archive"
                  >
                    <Download className="w-3 h-3 mr-1" /> Download Archive
                  </Button>
                </div>

                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Final Report</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Generate a retirement report covering the reason, replacement, and outcome impact.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/agents/${agentId}/retirement-report`);
                        const report = await res.json();
                        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `retirement-report-${agent?.name?.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast({ title: "Report generated", description: `Retirement report for ${agent?.name}` });
                      } catch {
                        toast({ title: "Report generation failed", variant: "destructive" });
                      }
                    }}
                    data-testid="button-retirement-report"
                  >
                    <FileText className="w-3 h-3 mr-1" /> Generate Report
                  </Button>
                </div>

                <div className="flex flex-col gap-2 p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Revoke Credentials</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Revoke all tool credentials and API keys associated with this agent.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast({ title: "Credentials revoked", description: `All tool access for ${agent?.name} has been disabled` });
                    }}
                    data-testid="button-revoke-credentials"
                  >
                    <Lock className="w-3 h-3 mr-1" /> Revoke Access
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Improvement Recommendations */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Improvement Recommendations</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!recommendations || recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recommendations yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recommendations.filter(r => r.status === "pending").slice(0, 5).map((rec) => (
                    <ActionCard
                      key={rec.id}
                      testId={`rec-${rec.id}`}
                      title={rec.title}
                      description={rec.description}
                      status={rec.status}
                      severity={rec.severity}
                      source={rec.source}
                      type={rec.type}
                      suggestedChanges={rec.suggestedChanges as Record<string, unknown> | null}
                      secondaryActions={[{
                        label: "Dismiss",
                        variant: "ghost",
                        onClick: () => dismissRecMutation.mutate(rec.id),
                        testId: `button-dismiss-rec-${rec.id}`,
                      }]}
                      primaryActions={[{
                        label: "Apply",
                        variant: "outline",
                        onClick: () => applyRecMutation.mutate(rec.id),
                        testId: `button-apply-rec-${rec.id}`,
                      }]}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONITOR TAB */}
        <TabsContent value="monitor" className="flex flex-col gap-4 mt-0">
          {(() => {
            const actualAvailability = (agent.successRate || 0) * 100;
            const targetAvailability = 99.5;
            const availabilityOk = actualAvailability >= targetAvailability;

            const actualLatency = agent.avgLatencyMs || 0;
            const targetLatency = 500;
            const latencyOk = actualLatency <= targetLatency;

            const errorBudgetTarget = 100 - targetAvailability;
            const errorBudgetUsed = 100 - actualAvailability;
            const errorBudgetRemaining = errorBudgetTarget - errorBudgetUsed;
            const errorBudgetOk = errorBudgetRemaining >= 0;

            const monthlyCost = agent.monthlyCost || 0;
            const costBudget = monthlyCost * 1.2;
            const costUtilization = costBudget > 0 ? (monthlyCost / costBudget) * 100 : 0;
            const costOk = monthlyCost <= costBudget;

            const anomalies: Array<{ icon: typeof AlertCircle; severity: string; description: string; timestamp: string }> = [];
            if ((agent.healthScore || 0) < 80) anomalies.push({ icon: AlertTriangle, severity: "warning", description: "Health score degradation detected", timestamp: new Date(Date.now() - 3600000).toISOString() });
            if ((agent.successRate || 0) < 0.9) anomalies.push({ icon: XCircle, severity: "critical", description: "Success rate below threshold", timestamp: new Date(Date.now() - 7200000).toISOString() });
            if ((agent.avgLatencyMs || 0) > 400) anomalies.push({ icon: Clock, severity: "warning", description: "Latency spike detected", timestamp: new Date(Date.now() - 1800000).toISOString() });
            if ((agent.costPerRun || 0) > 0.1) anomalies.push({ icon: DollarSign, severity: "warning", description: "Cost per run exceeding budget", timestamp: new Date(Date.now() - 5400000).toISOString() });
            if (anomalies.length === 0) anomalies.push({ icon: CheckCircle, severity: "info", description: "No critical anomalies in last 24h", timestamp: new Date().toISOString() });

            const monthlyRevenue = agent.monthlyRevenue || 0;
            const roi = monthlyCost > 0 ? ((monthlyRevenue - monthlyCost) / monthlyCost * 100) : 0;
            const costEfficiency = (agent.totalRuns || 0) > 0 ? monthlyRevenue / (agent.totalRuns || 1) : 0;

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="slo-availability">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Availability SLO</span>
                        <Badge variant="outline" className={`text-[10px] ${availabilityOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {availabilityOk ? "Within SLO" : "Breaching"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{actualAvailability.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground mb-1">/ {targetAvailability}% target</span>
                      </div>
                      <Progress value={Math.min(actualAvailability, 100)} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-latency">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Latency P95 SLO</span>
                        <Badge variant="outline" className={`text-[10px] ${latencyOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {latencyOk ? "Within SLO" : "Breaching"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{actualLatency}ms</span>
                        <span className="text-xs text-muted-foreground mb-1">/ {targetLatency}ms target</span>
                      </div>
                      <Progress value={Math.min((actualLatency / targetLatency) * 100, 100)} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-error-budget">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Error Budget</span>
                        <Badge variant="outline" className={`text-[10px] ${errorBudgetOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                          {errorBudgetOk ? "Remaining" : "Exhausted"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">{errorBudgetRemaining.toFixed(2)}%</span>
                        <span className="text-xs text-muted-foreground mb-1">budget {errorBudgetOk ? "remaining" : "overdrawn"}</span>
                      </div>
                      <Progress value={errorBudgetOk ? ((errorBudgetRemaining / errorBudgetTarget) * 100) : 100} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card data-testid="slo-cost-budget">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Cost Budget</span>
                        <Badge variant="outline" className={`text-[10px] ${costOk ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                          {costOk ? "Within Budget" : "Over Budget"}
                        </Badge>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-semibold">${monthlyCost.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground mb-1">/ ${costBudget.toLocaleString()} budget</span>
                      </div>
                      <Progress value={Math.min(costUtilization, 100)} className="h-2" />
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Anomaly Detection</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      {anomalies.map((anomaly, i) => {
                        const AnomalyIcon = anomaly.icon;
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`anomaly-row-${i}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <AnomalyIcon className={`w-3.5 h-3.5 shrink-0 ${
                                anomaly.severity === "critical" ? "text-red-500" :
                                anomaly.severity === "warning" ? "text-amber-500" :
                                "text-emerald-500"
                              }`} />
                              <span className="text-xs" data-testid={`anomaly-desc-${i}`}>{anomaly.description}</span>
                              <Badge variant="outline" className={`text-[10px] ${
                                anomaly.severity === "critical" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                                anomaly.severity === "warning" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              }`}>{anomaly.severity}</Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{new Date(anomaly.timestamp).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Business Impact</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="business-impact">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Revenue</span>
                        <span className="text-lg font-semibold" data-testid="text-monthly-revenue">${monthlyRevenue.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Cost</span>
                        <span className="text-lg font-semibold" data-testid="text-monthly-cost">${monthlyCost.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ROI</span>
                        <span className={`text-lg font-semibold ${roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-roi">
                          {roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</span>
                        <span className="text-lg font-semibold" data-testid="text-total-runs">{(agent.totalRuns || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue / Run</span>
                        <span className="text-lg font-semibold" data-testid="text-cost-efficiency">${costEfficiency.toFixed(3)}</span>
                      </div>
                    </div>
                    {outcome && (
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap">
                        <span className="text-xs text-muted-foreground">Linked Outcome:</span>
                        <span className="text-xs font-medium" data-testid="text-linked-outcome">{outcome.name}</span>
                        <StatusBadge status={outcome.status} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="autonomous" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Autonomous Action Rules</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {[
                  { name: "Auto-Rollback on SLA Breach", description: "Automatically rollback to previous version when SLA breach is detected for > 5 minutes", type: "auto_rollback", enabled: true },
                  { name: "Auto-Promote on Canary Success", description: "Promote canary deployment to full rollout when success threshold is met for the configured duration", type: "auto_promote", enabled: true },
                  { name: "Auto-Scale on Load", description: "Scale agent instances based on request queue depth and latency targets", type: "auto_scale", enabled: false },
                  { name: "Auto-Pause on Budget Exceed", description: "Pause agent when monthly cost exceeds configured budget threshold", type: "auto_pause", enabled: agent.status !== "retired" },
                  { name: "Auto-Expand Eval Suites on Drift", description: "When drift detection finds pass rate degradation > 10%, automatically trigger AI-generated test cases targeting the drift pattern", type: "auto_expand_eval", enabled: true },
                  { name: "Auto-Quarantine on Confidence Drop", description: "Quarantine agent from production traffic when confidence score drops below 0.6, routing to shadow mode until eval pass rates recover", type: "auto_quarantine", enabled: true },
                ].map((rule, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`autonomous-rule-${rule.type}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium">{rule.name}</span>
                        <span className="text-[10px] text-muted-foreground">{rule.description}</span>
                      </div>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "outline"} className="text-[10px] shrink-0">
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Autonomous Action Log</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!autonomousActions || autonomousActions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No autonomous actions recorded yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {autonomousActions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 20).map((action) => (
                    <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`action-log-${action.id}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        action.status === "completed" ? "bg-emerald-500/10" :
                        action.status === "failed" ? "bg-red-500/10" :
                        "bg-amber-500/10"
                      }`}>
                        {action.actionType === "auto_rollback" ? <RotateCcw className="w-3 h-3" /> :
                         action.actionType === "auto_promote" ? <Rocket className="w-3 h-3" /> :
                         action.actionType === "auto_scale" ? <TrendingUp className="w-3 h-3" /> :
                         action.actionType === "auto_expand_eval" ? <FlaskConical className="w-3 h-3" /> :
                         action.actionType === "auto_quarantine" ? <Shield className="w-3 h-3" /> :
                         <Zap className="w-3 h-3" />}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{action.description || action.actionType.replace(/_/g, " ")}</span>
                          <StatusBadge status={action.status} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Trigger: {action.trigger}</span>
                          <span>{action.createdAt ? new Date(action.createdAt).toLocaleString() : ""}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* A/B Experiments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">A/B Experiments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {[
                  {
                    name: "Prompt v3.1 vs v3.0",
                    status: "active",
                    variantA: { label: "v3.0", success: 87 },
                    variantB: { label: "v3.1", success: 91 },
                    trafficSplit: "50/50",
                    detail: "Started 3 days ago",
                  },
                  {
                    name: "Temperature 0.3 vs 0.7",
                    status: "completed",
                    variantA: { label: "Temp 0.3", success: 94 },
                    variantB: { label: "Temp 0.7", success: 89.8 },
                    trafficSplit: "50/50",
                    detail: "Winner: Variant A (0.3), +4.2% accuracy",
                  },
                  {
                    name: "RAG top-k=5 vs top-k=10",
                    status: "pending",
                    variantA: { label: "top-k=5", success: 0 },
                    variantB: { label: "top-k=10", success: 0 },
                    trafficSplit: "50/50",
                    detail: "Scheduled start: Tomorrow",
                  },
                ].map((exp, i) => (
                  <div key={i} className="flex flex-col gap-2 p-3 rounded-md border" data-testid={`experiment-${i}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{exp.name}</span>
                        <StatusBadge status={exp.status} />
                        <Badge variant="outline" className="text-[10px]">{exp.trafficSplit} split</Badge>
                      </div>
                      <Button variant="outline" size="sm" data-testid={`button-view-experiment-${i}`} onClick={() => toast({ title: `Viewing experiment: ${exp.name}` })}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                      </Button>
                    </div>
                    {exp.status !== "pending" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2 rounded-md bg-muted/30 text-center">
                          <span className="text-[10px] text-muted-foreground block">Variant A: {exp.variantA.label}</span>
                          <span className="text-sm font-semibold">{exp.variantA.success}%</span>
                        </div>
                        <div className="p-2 rounded-md bg-muted/30 text-center">
                          <span className="text-[10px] text-muted-foreground block">Variant B: {exp.variantB.label}</span>
                          <span className="text-sm font-semibold">{exp.variantB.success}%</span>
                        </div>
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground">{exp.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cost Tuning */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Cost Tuning</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Per-Run Cost</span>
                  <span className="text-lg font-semibold" data-testid="text-per-run-cost">${(agent.costPerRun || 0).toFixed(4)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Projection</span>
                  <span className="text-lg font-semibold" data-testid="text-monthly-projection">${(agent.monthlyCost || 0).toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Budget Utilization</span>
                  <span className="text-lg font-semibold" data-testid="text-budget-utilization">
                    {((agent.monthlyCost || 0) > 0 ? ((agent.monthlyCost || 0) / ((agent.monthlyCost || 0) * 1.2) * 100).toFixed(0) : 0)}%
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium">Suggested Optimizations</span>
                {[
                  { suggestion: "Switch to gpt-4.1-mini for classification steps", saving: "-35% cost", id: "opt-model" },
                  { suggestion: "Reduce chunk overlap from 100 to 50", saving: "-12% retrieval cost", id: "opt-chunk" },
                  { suggestion: "Enable response caching for repeated queries", saving: "-18% token usage", id: "opt-cache" },
                ].map((opt) => (
                  <div key={opt.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`cost-opt-${opt.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs">{opt.suggestion}: <span className="font-medium text-emerald-600 dark:text-emerald-400">{opt.saving}</span></span>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`button-apply-${opt.id}`} onClick={() => toast({ title: `Applied: ${opt.suggestion}` })}>
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GOVERNANCE TAB */}
        <TabsContent value="governance" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Effective Policies</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {policyBindings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {policyBindings.map((binding) => {
                    const matchedPolicy = allPolicies?.find(p => p.id === binding.policyId);
                    return (
                      <div key={binding.policyId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`governance-policy-${binding.policyId}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          {binding.enforcement === "hard_block" ? (
                            <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className="text-xs font-medium">{binding.name}</span>
                          {matchedPolicy && (
                            <>
                              <Badge variant="outline" className="text-[10px]">{matchedPolicy.domain}</Badge>
                              <Badge variant="outline" className="text-[10px]">v{matchedPolicy.version}</Badge>
                              <StatusBadge status={matchedPolicy.status} />
                            </>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${binding.enforcement === "hard_block" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                          {binding.enforcement.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No policies bound to this agent</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Policy Exceptions</CardTitle>
                {agentExceptions && <Badge variant="outline" className="text-[10px] ml-auto">{agentExceptions.length}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {agentExceptions && agentExceptions.length > 0 ? agentExceptions.map((exception) => {
                  const policy = allPolicies?.find(p => p.id === exception.policyId);
                  return (
                    <div key={exception.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-exception-${exception.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium">{policy?.name || "Unknown Policy"}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{exception.reason}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {exception.expiresAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Expires {new Date(exception.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                        <StatusBadge status={exception.status} />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No policy exceptions for this agent</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Approval History</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {agentApprovals.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {agentApprovals.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((approval) => (
                    <div key={approval.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`approval-row-${approval.id}`}>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{approval.type}</span>
                          <StatusBadge status={approval.status} />
                        </div>
                        {approval.description && <span className="text-[10px] text-muted-foreground">{approval.description}</span>}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          {approval.requestedBy && <span>Requested by: {approval.requestedBy}</span>}
                          {approval.decidedBy && <span>Decided by: {approval.decidedBy}</span>}
                          {approval.decidedAt && <span>{new Date(approval.decidedAt).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No approval history</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="flex flex-col gap-4 mt-0">
          {(() => {
            const categoryConfig: Record<string, { icon: typeof GitBranch; color: string; dotColor: string }> = {
              blueprint: { icon: GitBranch, color: "text-purple-600 dark:text-purple-400", dotColor: "bg-purple-500" },
              model: { icon: Cpu, color: "text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500" },
              tools: { icon: Wrench, color: "text-indigo-600 dark:text-indigo-400", dotColor: "bg-indigo-500" },
              policy: { icon: Shield, color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500" },
              config: { icon: FileCode, color: "text-slate-600 dark:text-slate-400", dotColor: "bg-slate-500" },
              deployment: { icon: Rocket, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500" },
              evaluation: { icon: FlaskConical, color: "text-orange-600 dark:text-orange-400", dotColor: "bg-orange-500" },
              autopatch: { icon: RefreshCw, color: "text-cyan-600 dark:text-cyan-400", dotColor: "bg-cyan-500" },
              marker: { icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500" },
            };

            const filterCategories = ["all", "blueprint", "model", "tools", "policy", "config", "deployment", "evaluation", "autopatch"];
            const filteredTimeline = timeline?.filter(e => timelineFilter === "all" || e.category === timelineFilter);
            const markerEntry = filteredTimeline?.find(e => e.category === "marker");
            const changesSinceGood = markerEntry
              ? filteredTimeline?.filter(e => e.category !== "marker" && new Date(e.timestamp) > new Date(markerEntry.timestamp))
              : [];

            return (
              <>
                <div className="flex items-center gap-2 flex-wrap" data-testid="timeline-filters">
                  {filterCategories.map(cat => (
                    <Button
                      key={cat}
                      variant={timelineFilter === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTimelineFilter(cat)}
                      data-testid={`timeline-filter-${cat}`}
                      className="toggle-elevate"
                    >
                      {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Button>
                  ))}
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleExportJSON} data-testid="button-export-json">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                  </Button>
                </div>

                {markerEntry && changesSinceGood && changesSinceGood.length > 0 && (
                  <Card data-testid="timeline-changes-summary">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Changes Since Last Good State</span>
                        <Badge variant="outline" className="text-[10px]">{changesSinceGood.length} changes</Badge>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {Object.entries(
                          changesSinceGood.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + 1 }), {} as Record<string, number>)
                        ).map(([cat, count]) => (
                          <Badge key={cat} variant="outline" className="text-[10px]">{count} {cat}</Badge>
                        ))}
                      </div>
                      {markerEntry.correlatedMetric && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <TrendingDown className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-muted-foreground">
                            {markerEntry.correlatedMetric.metric}: {markerEntry.correlatedMetric.before}% &rarr; {markerEntry.correlatedMetric.after}% ({markerEntry.correlatedMetric.change})
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="relative" data-testid="timeline-list">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  {filteredTimeline && filteredTimeline.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {filteredTimeline.map(entry => {
                        const config = categoryConfig[entry.category] || categoryConfig.config;
                        const Icon = config.icon;
                        return (
                          <div key={entry.id} className="relative pl-10" data-testid={`timeline-entry-${entry.id}`}>
                            <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ${config.dotColor} ring-2 ring-background z-10`} />
                            {entry.category === "marker" ? (
                              <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex-wrap" data-testid={`marker-${entry.id}`}>
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{entry.title}</span>
                                <span className="text-[11px] text-muted-foreground">{entry.description}</span>
                              </div>
                            ) : (
                              <Card>
                                <CardContent className="p-3 flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
                                    <span className="text-sm font-medium" data-testid={`timeline-title-${entry.id}`}>{entry.title}</span>
                                    <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                                    {entry.severity === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                    {entry.severity === "critical" && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] text-muted-foreground">
                                      {new Date(entry.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  {entry.description && (
                                    <p className="text-xs text-muted-foreground" data-testid={`timeline-desc-${entry.id}`}>{entry.description}</p>
                                  )}
                                  {entry.diff && (
                                    <InlineDiff diffs={entry.diff} testIdPrefix={`timeline-diff-${entry.id}`} />
                                  )}
                                  {entry.correlatedMetric && (
                                    <div className="flex items-center gap-2 mt-1 flex-wrap" data-testid={`timeline-metric-${entry.id}`}>
                                      <TrendingDown className="w-3.5 h-3.5 text-amber-500" />
                                      <span className="text-[11px] text-muted-foreground">
                                        {entry.correlatedMetric.metric}: {entry.correlatedMetric.before}% &rarr; {entry.correlatedMetric.after}% ({entry.correlatedMetric.change})
                                      </span>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-2" data-testid="timeline-empty">
                      <History className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No timeline events found</p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={shadowReplayOpen} onOpenChange={setShadowReplayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shadow Replay</DialogTitle>
            <DialogDescription>
              Replay historical traces against the current agent version to detect behavioral divergences without affecting production.
            </DialogDescription>
          </DialogHeader>
          {!shadowResult ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Time Window</Label>
                <Select value={shadowTimeWindow} onValueChange={setShadowTimeWindow}>
                  <SelectTrigger data-testid="select-shadow-time-window">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">Last 1 hour</SelectItem>
                    <SelectItem value="6h">Last 6 hours</SelectItem>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Target Environment</Label>
                <Select value={shadowEnvironment} onValueChange={setShadowEnvironment}>
                  <SelectTrigger data-testid="select-shadow-environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="pilot">Pilot</SelectItem>
                    <SelectItem value="prod">Production (read-only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Sample Size</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={shadowSampleSize}
                  onChange={(e) => setShadowSampleSize(e.target.value)}
                  data-testid="input-shadow-sample-size"
                />
                <span className="text-xs text-muted-foreground">Number of historical traces to replay (1-100)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className="text-lg font-semibold">{shadowResult.tracesReplayed}</span>
                  <span className="text-[10px] text-muted-foreground">Traces Replayed</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className={`text-lg font-semibold ${shadowResult.passRate >= 0.9 ? "text-green-600" : shadowResult.passRate >= 0.7 ? "text-amber-500" : "text-red-500"}`}>
                    {Math.round(shadowResult.passRate * 100)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">Pass Rate</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/30">
                  <span className="text-lg font-semibold">{shadowResult.divergences.length}</span>
                  <span className="text-[10px] text-muted-foreground">Divergences</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{shadowResult.summary}</p>
              {shadowResult.divergences.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Divergences</span>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {shadowResult.divergences.map((div, i) => (
                      <div key={i} className="p-2.5 rounded-md bg-muted/30 space-y-1" data-testid={`divergence-${i}`}>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px]">{div.divergenceType}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{div.traceId.slice(0, 8)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted-foreground block mb-0.5">Original</span>
                            <span className="font-mono">{div.original.slice(0, 80)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block mb-0.5">Replay</span>
                            <span className="font-mono">{div.replay.slice(0, 80)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {shadowResult ? (
              <Button variant="outline" onClick={() => setShadowReplayOpen(false)} data-testid="button-close-shadow-replay">
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShadowReplayOpen(false)} data-testid="button-cancel-shadow-replay">
                  Cancel
                </Button>
                <Button
                  onClick={() => shadowReplayMutation.mutate()}
                  disabled={shadowReplayMutation.isPending}
                  data-testid="button-start-shadow-replay"
                >
                  {shadowReplayMutation.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Replaying...</>
                  ) : (
                    <><Play className="w-3.5 h-3.5 mr-1.5" /> Start Replay</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Retirement</DialogTitle>
            <DialogDescription>
              This will begin the retirement process. For HIGH or CRITICAL risk agents, an expert approval will be required before the retirement proceeds.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Retirement Reason</Label>
              <Textarea
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                placeholder="Why is this agent being retired?"
                data-testid="input-retire-reason"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Replacement Agent ID (optional)</Label>
              <Input
                value={replacementAgentId}
                onChange={(e) => setReplacementAgentId(e.target.value)}
                placeholder="UUID of replacement agent"
                data-testid="input-replacement-agent"
              />
            </div>
            {(agent?.riskTier === "HIGH" || agent?.riskTier === "CRITICAL") && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs text-muted-foreground">This is a {agent.riskTier} risk agent. Retirement will require expert approval before proceeding.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireDialogOpen(false)} data-testid="button-cancel-retire">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => initiateRetirementMutation.mutate({
                reason: retireReason,
                replacementAgentId: replacementAgentId || undefined,
                requireApproval: agent?.riskTier === "HIGH" || agent?.riskTier === "CRITICAL",
              })}
              disabled={initiateRetirementMutation.isPending || !retireReason.trim()}
              data-testid="button-confirm-retire"
            >
              {initiateRetirementMutation.isPending ? "Processing..." : "Begin Retirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={(open) => { setExportDialogOpen(open); if (!open) { setExportStep("configure"); setExportPreview(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export as Code
            </DialogTitle>
            <DialogDescription>
              Generate a deployable code package from this agent's blueprint using the Ralph Loop pattern.
            </DialogDescription>
          </DialogHeader>

          {exportStep === "configure" ? (
            <div className="flex flex-col gap-5 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Language</Label>
                  <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "typescript" | "python")}>
                    <SelectTrigger data-testid="select-export-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>LLM Provider</Label>
                  <Select value={exportLlmProvider} onValueChange={(v) => setExportLlmProvider(v as "openai" | "anthropic")}>
                    <SelectTrigger data-testid="select-export-llm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                      <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Ralph Loop Configuration</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Max Iterations</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={exportMaxIterations}
                        onChange={(e) => setExportMaxIterations(Number(e.target.value) || 20)}
                        data-testid="input-max-iterations"
                      />
                      <span className="text-[10px] text-muted-foreground">Safety limit to prevent infinite loops</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Completion Promise</Label>
                      <Input
                        value={exportCompletionPromise}
                        onChange={(e) => setExportCompletionPromise(e.target.value)}
                        placeholder="TASK_COMPLETE"
                        data-testid="input-completion-promise"
                      />
                      <span className="text-[10px] text-muted-foreground">Agent outputs this string when done</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">What Gets Generated</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: "agent.yaml", desc: "Agent manifest with config" },
                      { label: exportFormat === "typescript" ? "entrypoint.ts" : "entrypoint.py", desc: "Ralph Loop orchestration" },
                      { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                      { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                      { label: ".env.example", desc: "Environment variables" },
                    ].map(f => (
                      <div key={f.label} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                        <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-mono truncate">{f.label}</span>
                          <span className="text-[10px] text-muted-foreground">{f.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center gap-2 flex-wrap">
                {exportPreview && Object.keys(exportPreview.files).map(fname => (
                  <Button
                    key={fname}
                    size="sm"
                    variant={exportPreviewFile === fname ? "default" : "outline"}
                    onClick={() => setExportPreviewFile(fname)}
                    data-testid={`button-preview-file-${fname.replace(/[/.]/g, "-")}`}
                  >
                    <FileCode className="w-3 h-3 mr-1" />
                    {fname}
                  </Button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-auto rounded-md bg-muted/30 border">
                <pre className="text-xs font-mono p-4 whitespace-pre-wrap" data-testid="preview-code-content">
                  <code>{exportPreview?.files[exportPreviewFile] || ""}</code>
                </pre>
              </div>
              {exportPreview?.metadata && (
                <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.pattern}</Badge>
                  <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.format}</Badge>
                  <Badge variant="outline" className="text-[10px]">{exportPreview.metadata.llmProvider}</Badge>
                  <span>Generated {new Date(exportPreview.metadata.generatedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {exportStep === "preview" && (
              <Button variant="outline" onClick={() => setExportStep("configure")} data-testid="button-export-back">
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} data-testid="button-export-cancel">
              Cancel
            </Button>
            {exportStep === "configure" ? (
              <Button
                onClick={() => exportCodeMutation.mutate({ format: exportFormat, llmProvider: exportLlmProvider, maxIterations: exportMaxIterations, completionPromise: exportCompletionPromise })}
                disabled={exportCodeMutation.isPending}
                data-testid="button-export-generate"
              >
                {exportCodeMutation.isPending ? "Generating..." : "Generate Code"}
              </Button>
            ) : (
              <Button onClick={downloadExportPackage} data-testid="button-export-download">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download Package
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlueprintModelConfig({ agent }: { agent: Agent }) {
  return (
    <Card data-testid="section-model-config">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Cpu className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Model Configuration</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</span>
            <span className="text-sm font-medium" data-testid="text-model-provider">{agent.modelProvider}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</span>
            <span className="text-sm font-medium" data-testid="text-model-name">{agent.modelName}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Version</span>
            <span className="text-sm font-medium" data-testid="text-model-version">v{agent.currentVersion}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Environment</span>
            <span className="text-sm font-medium" data-testid="text-model-env">{agent.environment}</span>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
            <span className="text-sm font-medium">${agent.costPerRun?.toFixed(3)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
            <span className="text-sm font-medium">{agent.avgLatencyMs}ms</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Autonomy Mode</span>
            <span className="text-sm font-medium capitalize">{agent.autonomyMode}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BlueprintWorkflowGraph({ blueprint }: { blueprint: any }) {
  if (!blueprint?.nodes?.length) {
    return (
      <Card data-testid="section-workflow-graph">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Workflow Graph</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">No workflow graph defined</p>
        </CardContent>
      </Card>
    );
  }

  const nodes = blueprint.nodes as Array<{ id: string; type: string; label?: string; [k: string]: any }>;
  const edges = (blueprint.edges || []) as Array<{ from: string; to: string }>;

  const nodeTypeColor: Record<string, string> = {
    schema_validate: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rag: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    llm_plan: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_classify: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_score: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_generate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    llm_analyze: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    tool_call: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    policy_check: "bg-red-500/15 text-red-600 dark:text-red-400",
    response_format: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    conditional: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    file_intake: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    vision_extract: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    schema_map: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rule_validate: "bg-red-500/15 text-red-600 dark:text-red-400",
    rule_filter: "bg-red-500/15 text-red-600 dark:text-red-400",
    lookup: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    webhook: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    api_call: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    data_aggregate: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    notification: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
    queue_consumer: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    evidence_collect: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    audit_log: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    event_listener: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    human_review: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  };

  const orderedNodes: typeof nodes = [];
  const visited = new Set<string>();
  const startIds = nodes.map(n => n.id).filter(id => !edges.some(e => e.to === id));
  const queue = startIds.length > 0 ? [...startIds] : [nodes[0]?.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = nodes.find(n => n.id === current);
    if (node) orderedNodes.push(node);
    edges.filter(e => e.from === current).forEach(e => queue.push(e.to));
  }
  nodes.filter(n => !visited.has(n.id)).forEach(n => orderedNodes.push(n));

  return (
    <Card data-testid="section-workflow-graph">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Workflow Graph</CardTitle>
          <Badge variant="outline" className="text-[10px] ml-auto">{orderedNodes.length} nodes</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-0">
          {orderedNodes.map((node, i) => {
            const colorClass = nodeTypeColor[node.type] || "bg-muted text-muted-foreground";
            const details = Object.entries(node).filter(([k]) => !["id", "type", "label"].includes(k));
            return (
              <div key={node.id} className="flex flex-col items-center w-full">
                <div className="flex items-center gap-3 w-full max-w-xl p-3 rounded-md border bg-background" data-testid={`workflow-node-${node.id}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${colorClass}`}>
                      {node.type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm font-medium truncate">{node.label || node.id}</span>
                  </div>
                  {details.length > 0 && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[40%]" title={details.map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}>
                      {details.slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : '...') : v}`).join(' | ')}
                    </span>
                  )}
                </div>
                {i < orderedNodes.length - 1 && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-px h-3 bg-border" />
                    <ChevronRight className="w-3 h-3 text-muted-foreground rotate-90" />
                    <div className="w-px h-3 bg-border" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BlueprintToolsPermissions({ tools, permissions }: { tools: any; permissions: any }) {
  const toolList = (tools || []) as Array<{ name: string; type: string; description: string; rateLimit?: string; timeout?: number }>;
  const perms = permissions as { allowedActions?: string[]; deniedActions?: string[]; escalationTriggers?: string[]; maxTokenBudget?: number; maxCostPerRun?: number; requireHumanApproval?: string[] } | null;

  return (
    <Card data-testid="section-tools-permissions">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Wrench className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Tools & Permissions</CardTitle>
          {toolList.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{toolList.length} tools</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {toolList.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registered Tools</span>
            <div className="space-y-1.5">
              {toolList.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`tool-row-${tool.name}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${tool.type === "write" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                      {tool.type}
                    </Badge>
                    <span className="text-xs font-mono font-medium truncate">{tool.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {tool.rateLimit && <span className="text-[10px] text-muted-foreground">{tool.rateLimit}</span>}
                    {tool.timeout && <span className="text-[10px] text-muted-foreground">{tool.timeout}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {perms && (
          <>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Unlock className="w-3 h-3 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Allowed Actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.allowedActions?.map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`permission-allowed-${a}`}>{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-red-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Denied Actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.deniedActions?.map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" data-testid={`permission-denied-${a}`}>{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            </div>
            {perms.escalationTriggers && perms.escalationTriggers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Escalation Triggers</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.escalationTriggers.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">{t.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.requireHumanApproval && perms.requireHumanApproval.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Require Human Approval</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.requireHumanApproval.map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {perms.maxTokenBudget != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Token Budget</span>
                  <span className="text-sm font-medium">{perms.maxTokenBudget.toLocaleString()}</span>
                </div>
              )}
              {perms.maxCostPerRun != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Cost / Run</span>
                  <span className="text-sm font-medium">${perms.maxCostPerRun.toFixed(2)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {toolList.length === 0 && !perms && (
          <p className="text-sm text-muted-foreground text-center py-4">No tools or permissions configured</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintMemoryRag({ config }: { config: any }) {
  if (!config) {
    return (
      <Card data-testid="section-memory-rag">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Database className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Memory & RAG Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No memory/RAG configuration</p>
        </CardContent>
      </Card>
    );
  }

  const cfg = config as {
    embeddingModel?: string; chunkStrategy?: string; chunkSize?: number; chunkOverlap?: number;
    vectorStore?: string; citationsRequired?: boolean; maxRetrievedChunks?: number; similarityThreshold?: number;
    sources?: Array<{ id: string; name: string; type: string; docCount: number; lastSynced?: string }>;
  };

  return (
    <Card data-testid="section-memory-rag">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <Database className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Memory & RAG Configuration</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Embedding Model</span>
            <span className="text-xs font-medium font-mono" data-testid="text-embedding-model">{cfg.embeddingModel}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Chunk Strategy</span>
            <span className="text-sm font-medium capitalize">{cfg.chunkStrategy}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Chunk Size / Overlap</span>
            <span className="text-sm font-medium">{cfg.chunkSize} / {cfg.chunkOverlap}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Vector Store</span>
            <span className="text-sm font-medium">{cfg.vectorStore}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Chunks</span>
            <span className="text-sm font-medium">{cfg.maxRetrievedChunks}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Similarity Threshold</span>
            <span className="text-sm font-medium">{cfg.similarityThreshold}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Citations</span>
            <span className="text-sm font-medium">{cfg.citationsRequired ? "Required" : "Optional"}</span>
          </div>
        </div>

        {cfg.sources && cfg.sources.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Sources</span>
              <div className="space-y-1.5">
                {cfg.sources.map((src) => (
                  <div key={src.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`rag-source-${src.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{src.name}</span>
                        <span className="text-[10px] text-muted-foreground">{src.type.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{src.docCount.toLocaleString()} docs</span>
                      {src.lastSynced && (
                        <span className="text-[10px] text-muted-foreground">{new Date(src.lastSynced).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintPolicyBindings({ bindings }: { bindings: any }) {
  const policies = (bindings || []) as Array<{ policyId: string; name: string; enforcement: string; description?: string }>;

  return (
    <Card data-testid="section-policy-bindings">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Policy Bindings</CardTitle>
          {policies.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{policies.length} policies</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {policies.length > 0 ? (
          <div className="space-y-1.5">
            {policies.map((pol) => (
              <div key={pol.policyId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-binding-${pol.policyId}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {pol.enforcement === "hard_block" ? (
                    <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{pol.name}</span>
                    {pol.description && <span className="text-[10px] text-muted-foreground truncate">{pol.description}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${pol.enforcement === "hard_block" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                  {pol.enforcement.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No policies bound</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintEvalBindings({ bindings }: { bindings: any }) {
  const evals = (bindings || []) as Array<{
    suiteId: string; name: string; type: string; passThreshold: number;
    schedule: string; lastRun?: string; lastPassRate?: number;
  }>;

  return (
    <Card data-testid="section-eval-bindings">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <FlaskConical className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Eval Suite Bindings</CardTitle>
          {evals.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{evals.length} suites</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {evals.length > 0 ? (
          <div className="space-y-1.5">
            {evals.map((ev) => {
              const passing = ev.lastPassRate != null && ev.lastPassRate >= ev.passThreshold;
              return (
                <div key={ev.suiteId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`eval-binding-${ev.suiteId}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {passing ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{ev.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {ev.type.replace(/_/g, " ")} | {ev.schedule} | threshold: {(ev.passThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ev.lastPassRate != null && (
                      <>
                        <span className={`text-xs font-medium ${passing ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {(ev.lastPassRate * 100).toFixed(1)}%
                        </span>
                        <Progress value={ev.lastPassRate * 100} className="h-1.5 w-14" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No eval suites bound</p>
        )}
      </CardContent>
    </Card>
  );
}

function BlueprintRollbackPlan({ plan }: { plan: any }) {
  if (!plan) {
    return (
      <Card data-testid="section-rollback-plan">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <History className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No rollback plan configured</p>
        </CardContent>
      </Card>
    );
  }

  const rb = plan as {
    previousVersion: string; rollbackStrategy: string; healthCheckInterval: string;
    rollbackApprover: string; lastRollbackAt: string | null;
    autoRollbackTriggers?: Array<{ metric: string; operator: string; threshold: number; window: string }>;
    canaryConfig?: { startPercent: number; stepPercent: number; stepInterval: string; maxPercent: number };
  };

  return (
    <Card data-testid="section-rollback-plan">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
            <History className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Previous Version</span>
            <span className="text-sm font-medium font-mono" data-testid="text-rollback-version">v{rb.previousVersion}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategy</span>
            <span className="text-sm font-medium capitalize">{rb.rollbackStrategy.replace(/_/g, " ")}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Check</span>
            <span className="text-sm font-medium">{rb.healthCheckInterval}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Approver</span>
            <span className="text-sm font-medium capitalize">{rb.rollbackApprover.replace(/_/g, " ")}</span>
          </div>
        </div>

        {rb.lastRollbackAt && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Rollback</span>
            <span className="text-sm font-medium">{new Date(rb.lastRollbackAt).toLocaleString()}</span>
          </div>
        )}

        {rb.autoRollbackTriggers && rb.autoRollbackTriggers.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auto-Rollback Triggers</span>
              <div className="space-y-1.5">
                {rb.autoRollbackTriggers.map((trigger, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`rollback-trigger-${i}`}>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{trigger.metric.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {trigger.operator} {trigger.threshold} over {trigger.window}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {rb.canaryConfig && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Canary Configuration</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Start %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.startPercent}%</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Step %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.stepPercent}%</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Step Interval</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.stepInterval}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">Max %</span>
                  <span className="text-sm font-medium">{rb.canaryConfig.maxPercent}%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
