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
import { InlineDiff } from "@/components/config-diff";
import { ActionCard } from "@/components/action-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Agent, RunTrace, EvalSuite, OutcomeContract, ImprovementRecommendation, AutonomousActionLog, AgentVersion, Deployment, Policy, Approval } from "@shared/schema";

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

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [replacementAgentId, setReplacementAgentId] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [retirementChecklist, setRetirementChecklist] = useState<boolean[]>([false, false, false, false, false, false]);

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
        <Button variant="outline" size="sm" data-testid="button-run-shadow-replay" onClick={() => toast({ title: "Shadow replay initiated" })}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Shadow Replay
        </Button>
        <Button variant="outline" size="sm" data-testid="button-request-approval" onClick={() => toast({ title: "Approval request submitted" })}>
          <Shield className="w-3.5 h-3.5 mr-1.5" /> Request Approval
        </Button>
        <Button variant="outline" size="sm" data-testid="button-rollback">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Rollback
        </Button>
        <Button size="sm" data-testid="button-deploy">
          <Rocket className="w-3.5 h-3.5 mr-1.5" /> Deploy
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
        </TabsContent>

        <TabsContent value="traces" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Run Traces</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentTraces.length > 0 ? recentTraces.map((trace) => (
                <Link key={trace.id} href={`/traces/${trace.id}`}>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer" data-testid={`trace-row-${trace.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                        <Terminal className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{trace.inputSummary || "Run"}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {trace.environment} | {trace.latencyMs}ms | ${trace.costUsd?.toFixed(4)}
                          {(trace as any).modelId ? ` | ${(trace as any).modelId}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={trace.status} />
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No traces recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evals" className="mt-0">
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
        </TabsContent>

        {/* RELEASES TAB */}
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
                    {agentVersions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(version => {
                      const versionDeployments = agentDeployments.filter(d => d.version === version.semver || d.versionId === version.id);
                      const deployedEnvs = [...new Set(versionDeployments.map(d => d.environment))];
                      const rollbackPlan = agent.rollbackPlan as any;
                      return (
                        <div key={version.id} className="relative pl-10" data-testid={`version-entry-${version.id}`}>
                          <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ring-2 ring-background z-10 ${
                            version.status === "deployed" ? "bg-emerald-500" :
                            version.status === "draft" ? "bg-slate-400" :
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
                            {deployedEnvs.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">Deployed to:</span>
                                {deployedEnvs.map(env => (
                                  <Badge key={env} variant="outline" className="text-[10px]" data-testid={`version-env-${version.id}-${env}`}>{env}</Badge>
                                ))}
                              </div>
                            )}
                            {rollbackPlan?.canaryConfig && version.status === "deployed" && (
                              <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                                <Gauge className="w-3 h-3" />
                                <span>Canary: {rollbackPlan.canaryConfig.startPercent}% start, {rollbackPlan.canaryConfig.stepPercent}% step, {rollbackPlan.canaryConfig.stepInterval} interval</span>
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
                <CardTitle className="text-sm font-medium">Environment Promotion Flow</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const stagingDep = agentDeployments.find(d => d.environment === "staging" && (d.status === "deployed" || d.status === "completed"));
                const pilotDep = agentDeployments.find(d => d.environment === "pilot" && (d.status === "deployed" || d.status === "completed"));
                const prodDep = agentDeployments.find(d => d.environment === "production" && (d.status === "deployed" || d.status === "completed"));
                return (
                  <div className="flex items-center gap-3 flex-wrap" data-testid="promotion-flow">
                    <div className="flex-1 min-w-[140px] p-3 rounded-md border flex flex-col gap-1 text-center" data-testid="promotion-staging">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Staging</span>
                      <span className="text-sm font-semibold">{stagingDep ? `v${stagingDep.version}` : "None"}</span>
                      {stagingDep && <StatusBadge status={stagingDep.status} />}
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Button variant="outline" size="sm" data-testid="button-promote-staging-pilot" onClick={() => toast({ title: "Promotion initiated" })}>
                        Promote <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                      <Button variant="ghost" size="sm" data-testid="button-rollback-pilot-staging" onClick={() => toast({ title: "Rollback initiated" })}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Rollback
                      </Button>
                    </div>
                    <div className="flex-1 min-w-[140px] p-3 rounded-md border flex flex-col gap-1 text-center" data-testid="promotion-pilot">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pilot</span>
                      <span className="text-sm font-semibold">{pilotDep ? `v${pilotDep.version}` : "None"}</span>
                      {pilotDep && <StatusBadge status={pilotDep.status} />}
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Button variant="outline" size="sm" data-testid="button-promote-pilot-prod" onClick={() => toast({ title: "Promotion initiated" })}>
                        Promote <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                      <Button variant="ghost" size="sm" data-testid="button-rollback-prod-pilot" onClick={() => toast({ title: "Rollback initiated" })}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Rollback
                      </Button>
                    </div>
                    <div className="flex-1 min-w-[140px] p-3 rounded-md border flex flex-col gap-1 text-center" data-testid="promotion-production">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Production</span>
                      <span className="text-sm font-semibold">{prodDep ? `v${prodDep.version}` : "None"}</span>
                      {prodDep && <StatusBadge status={prodDep.status} />}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blueprint" className="mt-0 space-y-4">
          <BlueprintModelConfig agent={agent} />
          <BlueprintWorkflowGraph blueprint={agent.blueprintJson as any} />
          <BlueprintToolsPermissions tools={agent.toolsConfig as any} permissions={agent.permissionsConfig as any} />
          <BlueprintMemoryRag config={agent.memoryRagConfig as any} />
          <BlueprintPolicyBindings bindings={agent.policyBindings as any} />
          <BlueprintEvalBindings bindings={agent.evalBindings as any} />
          <BlueprintRollbackPlan plan={agent.rollbackPlan as any} />
        </TabsContent>

        <TabsContent value="lifecycle" className="flex flex-col gap-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Agent Lifecycle</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
                  <p className="text-xs text-muted-foreground">Agent is draining active requests and preparing for archival.</p>
                  <Progress value={65} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Retirement Triggers</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {[
                  { metric: "Success Rate Drop", condition: "< 70% over 7 days", icon: TrendingUp },
                  { metric: "Monthly Cost Exceeds Revenue", condition: "Cost/Revenue ratio > 1.5", icon: DollarSign },
                  { metric: "No Active Runs", condition: "Zero runs for 30 days", icon: Clock },
                  { metric: "Newer Version Available", condition: "Successor agent deployed", icon: RefreshCw },
                ].map((trigger, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`retirement-trigger-${i}`}>
                    <div className="flex items-center gap-2">
                      <trigger.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{trigger.metric}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{trigger.condition}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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

          {/* Retirement Plan */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Retirement Plan</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Deprecation Status</span>
                  <span className="text-sm font-medium" data-testid="text-deprecation-status">
                    {agent.status === "retiring" ? "In Progress" : agent.status === "retired" ? "Completed" : "Active"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Target Retirement Date</span>
                  <span className="text-sm font-medium" data-testid="text-retirement-date">
                    {agent.status === "retiring" ? new Date(Date.now() + 30 * 86400000).toLocaleDateString() : "Not scheduled"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Replacement Candidate</span>
                  <span className="text-sm font-medium" data-testid="text-replacement-agent">
                    {replacementAgentId || "No replacement designated"}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium">Knowledge Transfer Checklist</span>
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-checklist-progress">
                    {retirementChecklist.filter(Boolean).length}/{retirementChecklist.length} completed
                  </Badge>
                </div>
                <Progress value={(retirementChecklist.filter(Boolean).length / retirementChecklist.length) * 100} className="h-2" data-testid="progress-checklist" />
                {[
                  "Document agent purpose and business context",
                  "Export evaluation suite results",
                  "Transfer tool configurations to replacement",
                  "Notify dependent outcome owners",
                  "Archive run traces and audit logs",
                  "Update routing rules to replacement agent",
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
                    <span className={`text-xs ${retirementChecklist[i] ? "line-through text-muted-foreground" : ""}`}>{item}</span>
                  </div>
                ))}
              </div>
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
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {[
                  { description: "PII detection bypass for internal testing", expiry: "2026-03-01", status: "active" },
                  { description: "Cost threshold override for Q1 pilot", expiry: "2026-04-15", status: "active" },
                ].map((exception, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-exception-${i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs">{exception.description}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">Expires {exception.expiry}</span>
                      <StatusBadge status={exception.status} />
                    </div>
                  </div>
                ))}
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

      <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire Agent</DialogTitle>
            <DialogDescription>
              Retiring an agent will archive it and stop it from processing new requests. Historical data will remain accessible.
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireDialogOpen(false)} data-testid="button-cancel-retire">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => retireMutation.mutate({ status: "retired", description: `Retired: ${retireReason}` })}
              disabled={retireMutation.isPending}
              data-testid="button-confirm-retire"
            >
              {retireMutation.isPending ? "Retiring..." : "Retire Agent"}
            </Button>
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
