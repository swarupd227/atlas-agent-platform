import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, Fragment, Component, type ErrorInfo, type ReactNode } from "react";
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
  Plus,
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
  Package,
  Code,
  Settings,
  MessageSquare,
  Network,
  BookOpenCheck,
  Blocks,
  ArrowRight,
  Workflow,
  Cloud,
  Box,
  Boxes,
  KeyRound,
  Copy,
  Radio,
  Scan,
  Hammer,
  FlaskRound,
  CheckCircle2,
  Loader2,
  XOctagon,
  Circle,
  Globe,
  HelpCircle,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Agent, RunTrace, EvalSuite, OutcomeContract, ImprovementRecommendation, AutonomousActionLog, AgentVersion, Deployment, Policy, Approval, PolicyException, ToolConnector, RemoteAgent, AgentTeam, Skill, McpServer, McpServerTool, McpServerResource, AgentMcpServer, OntologyConcept, Blueprint } from "@shared/schema";
import { Wifi, WifiOff, Crown, Brain, Sparkles, ShieldAlert, Layers3, BookMarked, Binary, ScrollText, FileCheck } from "lucide-react";
import { useIndustry } from "@/components/industry-provider";


class AgentDetailErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AgentDetail error boundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            An error occurred while rendering this agent's details. Try refreshing the page.
          </p>
          <p className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded-md max-w-lg truncate">
            {this.state.error?.message}
          </p>
          <button
            className="text-sm text-primary underline"
            onClick={() => this.setState({ hasError: false, error: null })}
            data-testid="button-retry-error"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function McpServerLinkCard({ link, server, onUnlink, unlinking }: {
  link: AgentMcpServer;
  server?: McpServer;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  const { data: tools } = useQuery<McpServerTool[]>({
    queryKey: ["/api/mcp-servers", link.serverId, "tools"],
    queryFn: async () => {
      const res = await fetch(`/api/mcp-servers/${link.serverId}/tools`);
      return res.json();
    },
    enabled: !!link.serverId,
  });
  const { data: resources } = useQuery<McpServerResource[]>({
    queryKey: ["/api/mcp-servers", link.serverId, "resources"],
    queryFn: async () => {
      const res = await fetch(`/api/mcp-servers/${link.serverId}/resources`);
      return res.json();
    },
    enabled: !!link.serverId,
  });

  return (
    <Card data-testid={`card-mcp-link-${link.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-bold" data-testid={`text-mcp-server-name-${link.id}`}>
              {server?.name || link.serverId}
            </CardTitle>
            {server?.status && (
              <Badge variant={server.status === "verified" ? "default" : "secondary"} className="text-[10px]">
                {server.status}
              </Badge>
            )}
            {server?.riskTier && (
              <Badge variant={server.riskTier === "HIGH" || server.riskTier === "CRITICAL" ? "destructive" : "outline"} className="text-[10px]">
                <Shield className="w-3 h-3 mr-0.5" /> {server.riskTier}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnlink}
            disabled={unlinking}
            data-testid={`button-unlink-mcp-${link.id}`}
          >
            <XCircle className="w-4 h-4 mr-1" /> Unlink
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {server?.url && (
          <span className="text-xs font-mono text-muted-foreground">{server.url}</span>
        )}

        {tools && tools.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tools ({tools.length})</span>
            <div className="flex flex-wrap gap-1.5">
              {tools.map(t => (
                <Badge key={t.id} variant="outline" className="text-[10px] font-mono" data-testid={`badge-tool-${t.id}`}>
                  <Wrench className="w-3 h-3 mr-0.5" />
                  {t.name}
                  {t.riskClassification && t.riskClassification !== "low" && (
                    <span className={`ml-1 ${t.riskClassification === "critical" || t.riskClassification === "high" ? "text-red-500" : "text-yellow-600"}`}>
                      ({t.riskClassification})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {resources && resources.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Resources ({resources.length})</span>
            <div className="flex flex-wrap gap-1.5">
              {resources.map(r => (
                <Badge key={r.id} variant="outline" className="text-[10px] font-mono" data-testid={`badge-resource-${r.id}`}>
                  <Database className="w-3 h-3 mr-0.5" />
                  {r.name}
                  {r.sensitivityLevel && r.sensitivityLevel !== "public" && (
                    <span className="ml-1 text-yellow-600">
                      <Lock className="w-2.5 h-2.5 inline" />
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(!tools || tools.length === 0) && (!resources || resources.length === 0) && (
          <p className="text-xs text-muted-foreground">No tools or resources registered on this server yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AgentDetailInner() {
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
  const { data: allToolConnectors } = useQuery<ToolConnector[]>({
    queryKey: ["/api/tool-connectors"],
  });
  const { data: remoteAgents } = useQuery<RemoteAgent[]>({
    queryKey: ["/api/remote-agents"],
  });
  const { data: teamMembers } = useQuery<AgentTeam[]>({
    queryKey: ["/api/agent-teams", agentId, "members"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agent-teams/${agentId}/members`);
      return res.json();
    },
    enabled: !!agentId && agent?.agentType === "team",
  });
  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: allSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });
  const { data: agentMcpLinks } = useQuery<AgentMcpServer[]>({
    queryKey: ["/api/agents", agentId, "mcp-servers"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agents/${agentId}/mcp-servers`);
      return res.json();
    },
    enabled: !!agentId,
  });
  const { data: allMcpServers } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp-servers"],
  });
  const { data: allOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ["/api/ontology-concepts/all"],
  });
  const { data: allBlueprints } = useQuery<Blueprint[]>({
    queryKey: ["/api/blueprints"],
  });
  const agentBlueprint = allBlueprints?.find(b => b.agentId === agentId);
  const { industry } = useIndustry();

  const [, navigate] = useLocation();
  const { toast } = useToast();
  const deployPerm = usePermission("deploy_staging_pilot");
  const tracesPerm = usePermission("view_traces");
  const approvalPerm = usePermission("approve_changes");

  const [assignMcpOpen, setAssignMcpOpen] = useState(false);
  const [selectedMcpServerId, setSelectedMcpServerId] = useState("");

  const assignMcpMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/agents/${agentId}/mcp-servers`, { serverId: selectedMcpServerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "mcp-servers"] });
      setAssignMcpOpen(false);
      setSelectedMcpServerId("");
      toast({ title: "MCP Server linked", description: "The MCP server has been assigned to this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to link MCP server", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMcpMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiRequest("DELETE", `/api/agents/${agentId}/mcp-servers/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "mcp-servers"] });
      toast({ title: "MCP Server unlinked", description: "The MCP server has been removed from this agent." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to unlink", description: err.message, variant: "destructive" });
    },
  });

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
  const [exportFramework, setExportFramework] = useState<string>("generic");
  const [exportPreview, setExportPreview] = useState<{ files: Record<string, string>; metadata: any } | null>(null);
  const [exportPreviewFile, setExportPreviewFile] = useState<string>("");
  const [exportStep, setExportStep] = useState<"select" | "configure" | "tools" | "dependencies" | "envvars" | "observability" | "buildtest" | "preview" | "approval" | "delivery" | "guide">("select");
  const [exportApprovalSubmitted, setExportApprovalSubmitted] = useState(false);
  const [exportApprovalId, setExportApprovalId] = useState<string | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<"zip" | "git" | "replit">("zip");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [toolAdapterOverrides, setToolAdapterOverrides] = useState<Record<string, "builtin" | "customer" | "stub">>({});
  const [pinVersions, setPinVersions] = useState(true);
  const [otelEnabled, setOtelEnabled] = useState(true);
  const [spanGranularity, setSpanGranularity] = useState<"per-node" | "per-tool-call">("per-node");
  const [compileStatus, setCompileStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [compileOutput, setCompileOutput] = useState<string>("");
  const [evalStatus, setEvalStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [evalOutput, setEvalOutput] = useState<string>("");

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

  const existingRtConfig = (agent?.runtimeConfig as Record<string, any>) || {};
  const [rtPrompt, setRtPrompt] = useState(existingRtConfig?.prompt || "");
  const [rtInterval, setRtInterval] = useState<number>(existingRtConfig?.scheduleIntervalMinutes || 0);
  const [rtEditing, setRtEditing] = useState(false);

  const rtConfigMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/agents/${agentId}`, {
        runtimeConfig: {
          prompt: rtPrompt.trim(),
          scheduleIntervalMinutes: rtInterval,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      setRtEditing(false);
      toast({ title: "Runtime configuration saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save runtime config", description: err.message, variant: "destructive" });
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      const existingDeps = allDeployments?.filter(d => d.agentId === agentId) || [];
      const latestVersion = existingDeps.length > 0
        ? existingDeps.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]?.version || "1.0.0"
        : "1.0.0";
      const parts = latestVersion.split(".");
      const nextVersion = existingDeps.length > 0
        ? `${parts[0]}.${parts[1]}.${parseInt(parts[2] || "0") + 1}`
        : "1.0.0";

      const res = await apiRequest("POST", "/api/deployments", {
        agentId,
        agentName: agent?.name || "Agent",
        environment: "production",
        version: nextVersion,
        rolloutStrategy: "full",
        status: "pending",
        industry: industry?.id || (agent as any)?.industry || "technology",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      toast({ title: "Deployment created", description: `Version ${data.version} created. Configure the deployment pipeline.` });
      navigate(`/deployments/${data.id}`);
    },
    onError: () => toast({ title: "Failed to create deployment", variant: "destructive" }),
  });

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
    mutationFn: async (params: { format: string; llmProvider: string; maxIterations: number; completionPromise: string; framework?: string; toolAdapters?: Record<string, string>; pinVersions?: boolean; otelEnabled?: boolean; spanGranularity?: string }) => {
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
  const rawBindings = (Array.isArray(agent.policyBindings) ? agent.policyBindings : []) as Array<any>;
  const policyBindings = rawBindings.map((b: any) => {
    if (typeof b === "string") {
      const matched = allPolicies?.find(p => p.id === b);
      return { policyId: b, name: matched?.name || b, enforcement: "soft_warn", description: matched?.description || "" };
    }
    const displayName = b.name || b.policyName || "";
    const enforcement = b.enforcement === "hard" ? "hard_block" : (b.enforcement || "soft_warn");
    return { policyId: b.policyId || b.policyName || "", name: displayName, enforcement, description: b.description };
  });

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
        <Link href={`/agents/${agentId}/playground`}>
          <Button variant="outline" size="sm" data-testid="button-open-playground">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Playground
          </Button>
        </Link>
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
        {agentDeployments.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button size="sm" data-testid="button-view-deployment" onClick={() => {
              const latest = agentDeployments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
              if (latest) navigate(`/deployments/${latest.id}`);
            }}>
              <Rocket className="w-3.5 h-3.5 mr-1.5" /> View Deployment
            </Button>
            <Button variant="outline" size="sm" data-testid="button-new-deployment-version" disabled={!deployPerm.allowed || deployMutation.isPending} onClick={() => deployMutation.mutate()} title="Create a new deployment version">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" data-testid="button-deploy" disabled={!deployPerm.allowed || deployMutation.isPending} onClick={() => deployMutation.mutate()} title={!deployPerm.allowed ? "You do not have permission to deploy" : undefined}>
            <Rocket className="w-3.5 h-3.5 mr-1.5" /> {deployMutation.isPending ? "Creating..." : "Deploy"}
            {deployPerm.allowed && deployPerm.permission.access === "conditional" && deployPerm.permission.annotation && (
              <Badge variant="secondary" className="text-[10px] ml-1">{deployPerm.permission.annotation}</Badge>
            )}
          </Button>
        )}
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
        <TabsList className="w-fit flex-wrap h-auto gap-y-1 py-1">
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
          <TabsTrigger value="knowledge-graph" data-testid="tab-knowledge-graph">Knowledge Graph</TabsTrigger>
          <TabsTrigger value="skills" data-testid="tab-skills">Skills</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          <TabsTrigger value="context-profile" data-testid="tab-context-profile">Context Profile</TabsTrigger>
          <TabsTrigger value="mcp-servers" data-testid="tab-mcp-servers">MCP Servers</TabsTrigger>
          <TabsTrigger value="ontology" data-testid="tab-ontology">Ontology</TabsTrigger>
          <TabsTrigger value="api-gateway" data-testid="tab-api-gateway">API Gateway</TabsTrigger>
          <TabsTrigger value="channels" data-testid="tab-channels">Channels</TabsTrigger>
          {agent.agentType === "remote" && (
            <TabsTrigger value="a2a" data-testid="tab-a2a">A2A Card</TabsTrigger>
          )}
          {agent.agentType === "team" && (
            <TabsTrigger value="team" data-testid="tab-team">Team Members</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="summary" className="flex flex-col gap-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Health Score" value={`${agent.healthScore}%`} icon={Activity} variant="success" testId="stat-agent-health" />
            <StatCard title="Success Rate" value={`${((agent.successRate || 0) * 100).toFixed(1)}%`} icon={CheckCircle} variant="success" testId="stat-agent-success" />
            <StatCard title="Avg Latency" value={`${agent.avgLatencyMs}ms`} icon={Clock} variant="default" testId="stat-agent-latency" />
            <StatCard title="Cost / Run" value={`$${agent.costPerRun?.toFixed(3)}`} icon={DollarSign} variant="default" testId="stat-agent-cost" />
          </div>

          <Card data-testid="card-runtime-config" className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Agent Task</CardTitle>
                </div>
                {!rtEditing ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    const rc = (agent.runtimeConfig as Record<string, any>) || {};
                    setRtPrompt(rc?.prompt || "");
                    setRtInterval(rc?.scheduleIntervalMinutes || 0);
                    setRtEditing(true);
                  }} data-testid="button-edit-runtime-config">
                    <Settings className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRtEditing(false)} data-testid="button-cancel-runtime-config">Cancel</Button>
                    <Button size="sm" onClick={() => rtConfigMutation.mutate()} disabled={rtConfigMutation.isPending || !rtPrompt.trim()} data-testid="button-save-runtime-config">
                      {rtConfigMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!rtEditing ? (
                (() => {
                  const rc = (agent.runtimeConfig as Record<string, any>) || {};
                  const hasConfig = !!rc?.prompt;
                  return hasConfig ? (
                    <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30">
                      <span className="text-xs text-muted-foreground">What this agent does when it runs</span>
                      <p className="text-xs font-medium leading-relaxed" data-testid="text-rt-prompt">{rc.prompt}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground" data-testid="text-rt-interval">
                          {(rc.scheduleIntervalMinutes || 0) === 0
                            ? "On-demand (triggered manually)"
                            : `Runs every ${rc.scheduleIntervalMinutes} minute${rc.scheduleIntervalMinutes !== 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                      <Zap className="w-5 h-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">No task defined yet. Click Edit to describe what this agent should do when it runs.</p>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Describe what this agent should do</label>
                    <Textarea value={rtPrompt} onChange={e => setRtPrompt(e.target.value)} placeholder="e.g. 'Get weather update for Bangalore and assess any risk from severe conditions' or 'Analyze customer churn patterns for Q1 and flag high-risk accounts'" className="min-h-[80px] text-sm" data-testid="input-rt-prompt" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Schedule interval</label>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <select
                        value={rtInterval}
                        onChange={e => setRtInterval(Number(e.target.value))}
                        className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="select-rt-interval"
                      >
                        <option value={0}>On-demand (triggered manually)</option>
                        <option value={1}>Every 1 minute</option>
                        <option value={2}>Every 2 minutes</option>
                        <option value={5}>Every 5 minutes</option>
                        <option value={10}>Every 10 minutes</option>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every 1 hour</option>
                        <option value={120}>Every 2 hours</option>
                        <option value={360}>Every 6 hours</option>
                        <option value={720}>Every 12 hours</option>
                        <option value={1440}>Every 24 hours</option>
                      </select>
                    </div>
                    <span className="text-[10px] text-muted-foreground">The agent will use its connected tools (MCP Servers) to fulfill this task automatically on this schedule when deployed.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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

          {(() => {
            const pinnedVersions = (agentVersions || []).filter(v => v.status !== "draft");
            const hasPinnedVersion = pinnedVersions.length > 0;
            const latestPinned = hasPinnedVersion
              ? [...pinnedVersions].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]
              : null;

            const agentEvals = evals || [];
            const hasEvals = agentEvals.length > 0;
            const evalsPassed = agentEvals.filter(e => e.lastRunAt && (e.passRate || 0) >= 0.8);
            const evalsNotRun = agentEvals.filter(e => !e.lastRunAt);
            const allEvalsPassed = hasEvals && evalsPassed.length === agentEvals.length;
            const evalDetail = !hasEvals
              ? "No eval suites configured"
              : evalsNotRun.length > 0
                ? `${evalsPassed.length}/${agentEvals.length} passing (${evalsNotRun.length} not run)`
                : `${evalsPassed.length}/${agentEvals.length} passing`;

            const agentTools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig as any[] : [];
            const connectors = allToolConnectors || [];
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));
            const toolsWithAdapter = agentTools.filter(t => {
              const name = normalize(t.name || "");
              const connector = connectorMap.get(name);
              return connector && connector.status === "connected";
            });
            const allAdaptersComplete = agentTools.length > 0 && toolsWithAdapter.length === agentTools.length;
            const hasTools = agentTools.length > 0;

            const readyChecks = [
              { key: "version", label: "Pinned version", detail: latestPinned ? `v${latestPinned.semver}` : "No signed version", passed: hasPinnedVersion },
              { key: "evals", label: "Eval suites passed", detail: evalDetail, passed: allEvalsPassed },
              { key: "adapters", label: "Tool adapters complete", detail: hasTools ? `${toolsWithAdapter.length}/${agentTools.length} connected` : "No tools configured", passed: allAdaptersComplete },
            ];
            const readyCount = readyChecks.filter(c => c.passed).length;
            const isReady = readyCount === readyChecks.length;

            return (
              <Card data-testid="card-export-readiness">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">Export Readiness</CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isReady ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : readyCount > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}
                      data-testid="badge-export-readiness"
                    >
                      {isReady ? "Ready" : `${readyCount}/${readyChecks.length} checks`}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    {readyChecks.map(check => (
                      <div key={check.key} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`check-${check.key}`}>
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium">{check.label}</span>
                          <span className="text-[11px] text-muted-foreground">{check.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasPinnedVersion && (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={() => { setExportStep("select"); setExportPreview(null); setExportFramework("generic"); setExportDialogOpen(true); }}
                      data-testid="button-summary-export-code"
                    >
                      <Package className="w-3.5 h-3.5 mr-1.5" /> Export / Generate Code
                    </Button>
                  )}
                  {!hasPinnedVersion && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10" data-testid="warning-no-pinned-version">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground" data-testid="text-no-pinned-version">Create and pin a version before exporting</span>
                    </div>
                  )}
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
            <Button variant="outline" size="sm" onClick={() => { setExportStep("select"); setExportPreview(null); setExportFramework("generic"); setExportDialogOpen(true); }} data-testid="button-export-code">
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

          {(() => {
            const bp = (agent.blueprintJson as any) || (agentBlueprint?.blueprintJson as any);
            const hasBp = bp && !(Array.isArray(bp) && bp.length === 0) && !(typeof bp === "object" && !Array.isArray(bp) && !(bp?.nodes?.length) && !(bp?.steps?.length));
            return !hasBp;
          })() ? (
            <Card data-testid="card-blueprint-empty">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
                    <PenTool className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium">No blueprint configured yet</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">This agent doesn't have a workflow blueprint defined. Open the Blueprint Studio to design the agent's workflow graph, configure tools, and set up policies.</p>
                  </div>
                  <Link href={`/blueprints?agentId=${agent.id}`}>
                    <Button size="sm" data-testid="button-open-studio-empty">
                      <PenTool className="w-3.5 h-3.5 mr-1.5" /> Open Blueprint Studio
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {(() => {
                const effectiveBp = (agent.blueprintJson as any) || (agentBlueprint?.blueprintJson as any);
                return blueprintView === "graph" ? (
                <div className="flex gap-4" data-testid="blueprint-split-view">
                  <div className="flex-[2] min-w-0">
                    <BlueprintWorkflowGraph blueprint={effectiveBp} />
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
                      <code>{JSON.stringify(effectiveBp, null, 2)}</code>
                    </pre>
                  </CardContent>
                </Card>
              )
              })()}

              <ImplementationGraph
                agent={agent}
                toolConnectors={allToolConnectors || []}
                onGenerateExport={() => { setExportStep("select"); setExportPreview(null); setExportFramework("generic"); setExportDialogOpen(true); }}
              />
            </>
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
                          <span className="text-xs font-medium">{binding.name || matchedPolicy?.name || binding.policyId}</span>
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

        {/* Knowledge Graph Tab */}
        <TabsContent value="knowledge-graph" className="flex flex-col gap-4 mt-0" data-testid="tab-content-knowledge-graph">
          {(() => {
            const ontologyTags = (agent.ontologyTags as any) || {};
            const domains = Array.isArray(ontologyTags) ? ontologyTags : (ontologyTags.domains || Object.keys(ontologyTags).filter(k => k !== "domains"));
            const industryLabel = industry?.label || "General";

            const domainConceptMap: Record<string, Array<{ concept: string; relevance: string; usage: string }>> = {
              "KYC/AML": [
                { concept: "Customer Due Diligence", relevance: "high", usage: "Identity verification workflows" },
                { concept: "Beneficial Ownership", relevance: "high", usage: "Entity resolution chains" },
                { concept: "Risk Scoring Model", relevance: "medium", usage: "Risk assessment decisions" },
                { concept: "Sanctions List", relevance: "critical", usage: "Real-time screening" },
              ],
              "Clinical Documentation": [
                { concept: "ICD-10 Codes", relevance: "high", usage: "Diagnostic coding" },
                { concept: "FHIR Resources", relevance: "high", usage: "Interoperability standards" },
                { concept: "Clinical Terminology", relevance: "medium", usage: "Note summarization" },
                { concept: "CPT Procedures", relevance: "high", usage: "Billing code assignment" },
              ],
              "Quality Control": [
                { concept: "Defect Taxonomy", relevance: "high", usage: "Classification decisions" },
                { concept: "SPC Parameters", relevance: "medium", usage: "Process monitoring" },
                { concept: "ISO Standards", relevance: "high", usage: "Compliance validation" },
              ],
              "Trade Operations": [
                { concept: "Settlement Lifecycle", relevance: "high", usage: "Trade processing" },
                { concept: "Counterparty Risk", relevance: "medium", usage: "Exposure calculation" },
              ],
            };
            const agentDomain = agent.department || (domains.length > 0 ? String(domains[0]) : "");

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Brain className="w-4 h-4" /> Knowledge Graph Bindings
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Ontology domains this agent reasons within ({industryLabel} context)
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]" data-testid="badge-kg-domain-count">
                    {domains.length || 1} domain{(domains.length || 1) !== 1 ? "s" : ""} bound
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-kg-domains">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound Ontology Domains</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(domains.length > 0 ? domains.map(String) : [agentDomain || "General"]).map((domain: string, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`domain-${idx}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-sm font-medium">{domain || "General"}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {(domainConceptMap[domain] || []).length || 3} concepts
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-kg-concepts">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Key Concepts Used</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const concepts = domainConceptMap[agentDomain] || [
                          { concept: "Domain Entity Model", relevance: "high", usage: "Core reasoning" },
                          { concept: "Business Rules", relevance: "medium", usage: "Decision logic" },
                          { concept: "Relationship Types", relevance: "medium", usage: "Entity linking" },
                        ];
                        return (
                          <div className="space-y-2">
                            {concepts.map((c, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`concept-${i}`}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-sm font-medium">{c.concept}</span>
                                  <span className="text-[11px] text-muted-foreground">{c.usage}</span>
                                </div>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${
                                  c.relevance === "critical" ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                                  c.relevance === "high" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                  "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                }`}>
                                  {c.relevance}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>

                <Card data-testid="card-kg-coverage">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Ontology Coverage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Concepts Mapped</span>
                        <span className="text-lg font-semibold">{(domainConceptMap[agentDomain] || []).length || 3}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage Score</span>
                        <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">87%</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Synced</span>
                        <span className="text-sm font-medium">2 days ago</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Graph Version</span>
                        <span className="text-sm font-medium">v{agent.currentVersion || "1.0.0"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="flex flex-col gap-4 mt-0" data-testid="tab-content-skills">
          {(() => {
            const agentSkillBindings = (agent as any).agentSkills || [];
            const matchedSkills = allSkills?.filter((s: Skill) => {
              if (agentSkillBindings.length > 0) {
                return agentSkillBindings.some((b: any) => b.skillId === s.id || b === s.id);
              }
              const agentDept = agent.department || "";
              return s.industry === industry?.id && (s.domain === agentDept || !agentDept);
            }).slice(0, 8) || [];

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Active Skills
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Composable skill units bound to this agent with performance tracking
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]" data-testid="badge-skill-count">
                    {matchedSkills.length} skill{matchedSkills.length !== 1 ? "s" : ""} active
                  </Badge>
                </div>

                {matchedSkills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matchedSkills.map((skill: Skill, skillIdx: number) => {
                      const hash = (skill.name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                      const perfScore = skill.performanceScore || (70 + (hash % 26));
                      const activations = skill.activationCount || (100 + (hash * 3) % 400);
                      const perfColor = perfScore >= 90 ? "text-emerald-600 dark:text-emerald-400" : perfScore >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      const tags = (skill.tags as string[]) || [];
                      return (
                        <Card key={skill.id} data-testid={`card-skill-${skill.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{skill.name}</span>
                                  <Badge variant="outline" className="text-[10px]">v{skill.version || "1.0"}</Badge>
                                </div>
                                <span className="text-[11px] text-muted-foreground">{skill.domain || "General"}</span>
                                {skill.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`text-lg font-semibold ${perfColor}`}>{perfScore}%</span>
                                <span className="text-[10px] text-muted-foreground">performance</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-3 pt-2 border-t">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Activations</span>
                                <span className="text-xs font-medium">{activations.toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Trust Tier</span>
                                <span className="text-xs font-medium capitalize">{skill.trustTier || "standard"}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">Complexity</span>
                                <span className="text-xs font-medium capitalize">{skill.complexity || "medium"}</span>
                              </div>
                              {tags.length > 0 && (
                                <div className="flex items-center gap-1 ml-auto flex-wrap">
                                  {tags.slice(0, 3).map((t: string) => (
                                    <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                      <Sparkles className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No skills bound to this agent yet</p>
                      <p className="text-[11px] text-muted-foreground">Visit the Skills Library to browse and assign skills</p>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="flex flex-col gap-4 mt-0" data-testid="tab-content-compliance">
          {(() => {
            const compTags = ((agent.complianceTags as string[]) || []);
            const riskTier = agent.riskTier || "MEDIUM";
            const euAiActMap: Record<string, { label: string; color: string }> = {
              CRITICAL: { label: "Unacceptable Risk", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
              HIGH: { label: "High Risk", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
              MEDIUM: { label: "Limited Risk", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
              LOW: { label: "Minimal Risk", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
            };
            const euClassification = euAiActMap[riskTier] || euAiActMap["MEDIUM"];
            const agentApprovals = allApprovals?.filter(a => a.objectId === agentId) || [];
            const lastCompliance = agentApprovals.filter(a => a.type === "compliance_review" || a.type === "policy_override" || a.type === "agent_promotion").sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())[0];
            const daysSinceAttestation = lastCompliance ? Math.floor((Date.now() - new Date(lastCompliance.createdAt!).getTime()) / (1000 * 60 * 60 * 24)) : null;
            const boundPolicies = (agent.policyBindings as any[]) || [];

            const certificationStatus = compTags.map((tag, tagIdx) => {
              const tagHash = tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
              const passed = tagHash % 5 !== 0;
              return {
                name: tag,
                status: passed ? "certified" as const : "pending" as const,
                lastAudit: passed ? `${(tagHash % 28) + 1} days ago` : "Not yet audited",
                evidence: passed ? `${(tagHash % 5) + 1} artifacts` : "0 artifacts",
              };
            });

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Regulatory Compliance
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Per-agent compliance status, certifications, and evidence
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[11px] ${euClassification.color}`} data-testid="badge-eu-ai-act">
                    EU AI Act: {euClassification.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-compliance-status">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall Status</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${compTags.length > 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <span className="text-sm font-semibold">{compTags.length > 0 ? "Compliant" : "Uncertified"}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-certifications-count">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Certifications</span>
                      <p className="text-lg font-semibold mt-1">{compTags.length}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-days-since-attestation">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Since Attestation</span>
                      <p className={`text-lg font-semibold mt-1 ${daysSinceAttestation !== null && daysSinceAttestation > 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {daysSinceAttestation !== null ? daysSinceAttestation : "N/A"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-bound-policies-count">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bound Policies</span>
                      <p className="text-lg font-semibold mt-1">{boundPolicies.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {certificationStatus.length > 0 ? (
                  <Card data-testid="card-certifications">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Certification Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {certificationStatus.map((cert, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`cert-${cert.name}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${cert.status === "certified" ? "bg-emerald-500" : "bg-amber-500"}`} />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{cert.name}</span>
                              <span className="text-[11px] text-muted-foreground">Last audit: {cert.lastAudit}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{cert.evidence}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              cert.status === "certified" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            }`}>
                              {cert.status === "certified" ? "Certified" : "Pending"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                      <Shield className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No compliance certifications configured</p>
                      <p className="text-[11px] text-muted-foreground">Add compliance tags to this agent to track certifications</p>
                    </CardContent>
                  </Card>
                )}

                {boundPolicies.length > 0 && (
                  <Card data-testid="card-bound-policies">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bound Policies</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {boundPolicies.map((policy: any, i: number) => {
                        const policyName = policy.policyName || policy.policyId || "Unknown Policy";
                        const enforcement = policy.enforcement || "monitor";
                        const enforcementColor = enforcement === "hard_block" || enforcement === "hard" ? "text-red-600 dark:text-red-400" : enforcement === "soft_warn" || enforcement === "soft" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400";
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md border" data-testid={`policy-${i}`}>
                            <div className="flex items-center gap-2">
                              <ScrollText className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{policyName}</span>
                            </div>
                            <span className={`text-[11px] font-medium capitalize ${enforcementColor}`}>
                              {enforcement.replace(/_/g, " ")}
                            </span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>

        {/* Context Profile Tab */}
        <TabsContent value="context-profile" className="flex flex-col gap-4 mt-0" data-testid="tab-content-context-profile">
          {(() => {
            const contextCategories = [
              { key: "system", label: "System Instructions", icon: Settings, tokens: 2048, pct: 25, color: "bg-blue-500" },
              { key: "ontology", label: "Industry Ontology", icon: Brain, tokens: 1536, pct: 19, color: "bg-purple-500" },
              { key: "regulatory", label: "Regulatory Context", icon: ShieldAlert, tokens: 1024, pct: 12, color: "bg-red-500" },
              { key: "skills", label: "Skill Instructions", icon: Sparkles, tokens: 1280, pct: 16, color: "bg-amber-500" },
              { key: "history", label: "Conversation History", icon: History, tokens: 1024, pct: 12, color: "bg-green-500" },
              { key: "rag", label: "Retrieved Knowledge", icon: Database, tokens: 768, pct: 9, color: "bg-cyan-500" },
              { key: "tools", label: "Tool Descriptions", icon: Wrench, tokens: 512, pct: 6, color: "bg-orange-500" },
            ];
            const totalTokens = contextCategories.reduce((sum, c) => sum + c.tokens, 0);
            const budgetLimit = 8192;
            const utilization = Math.round((totalTokens / budgetLimit) * 100);
            const industryLabel = industry?.label || "General";
            const memoryConfig = (agent.memoryRagConfig as any) || {};

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Layers3 className="w-4 h-4" /> Context Profile
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      How context is allocated across source categories for this agent ({industryLabel})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px]" data-testid="badge-token-budget">
                      {totalTokens.toLocaleString()} / {budgetLimit.toLocaleString()} tokens
                    </Badge>
                    <Badge variant="outline" className={`text-[11px] ${
                      utilization > 90 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                      utilization > 70 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    }`} data-testid="badge-utilization">
                      {utilization}% utilized
                    </Badge>
                  </div>
                </div>

                <Card data-testid="card-context-budget">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Token Budget Allocation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex h-6 rounded-md overflow-hidden mb-4" data-testid="context-budget-bar">
                      {contextCategories.map((cat) => (
                        <div
                          key={cat.key}
                          className={`${cat.color} transition-all`}
                          style={{ width: `${cat.pct}%` }}
                          title={`${cat.label}: ${cat.tokens} tokens (${cat.pct}%)`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {contextCategories.map((cat) => {
                        const Icon = cat.icon;
                        return (
                          <div key={cat.key} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`context-source-${cat.key}`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${cat.color} shrink-0`} />
                            <div className="flex flex-col gap-0 min-w-0">
                              <div className="flex items-center gap-1">
                                <Icon className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[11px] font-medium truncate">{cat.label}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{cat.tokens.toLocaleString()} tokens ({cat.pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card data-testid="card-context-priority">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Context Priority Order</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {contextCategories.sort((a, b) => b.tokens - a.tokens).map((cat, idx) => {
                        const Icon = cat.icon;
                        return (
                          <div key={cat.key} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`priority-${idx}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-mono w-4">#{idx + 1}</span>
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{cat.label}</span>
                            </div>
                            <Progress value={cat.pct * 4} className="h-1 w-16" />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-context-config">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Configuration Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Max Context Window</span>
                        <span className="text-sm font-medium">{budgetLimit.toLocaleString()} tokens</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Memory Strategy</span>
                        <span className="text-sm font-medium capitalize">{memoryConfig.strategy || "sliding-window"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">RAG Retrieval</span>
                        <span className="text-sm font-medium">{memoryConfig.ragEnabled ? "Enabled" : "Configured"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                        <span className="text-sm">Industry Preset</span>
                        <Badge variant="outline" className="text-[10px]">{industryLabel}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {agent.agentType === "remote" && (() => {
          const ra = remoteAgents?.find(r => r.agentId === agentId);
          const trustColors: Record<string, string> = {
            untrusted: "text-red-600 dark:text-red-400",
            basic: "text-yellow-600 dark:text-yellow-400",
            verified: "text-blue-600 dark:text-blue-400",
            trusted: "text-green-600 dark:text-green-400",
            privileged: "text-purple-600 dark:text-purple-400",
          };
          const statusIcons: Record<string, typeof Wifi> = {
            online: Wifi,
            offline: WifiOff,
            degraded: AlertTriangle,
            unknown: HelpCircle,
          };
          return (
            <TabsContent value="a2a" className="flex flex-col gap-4 mt-0" data-testid="tab-content-a2a">
              {ra ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-base">Connectivity</CardTitle>
                      {(() => {
                        const StatusIcon = statusIcons[ra.connectivityStatus as string] || HelpCircle;
                        return <StatusIcon className={`h-5 w-5 ${ra.connectivityStatus === "online" ? "text-green-500" : ra.connectivityStatus === "offline" ? "text-red-500" : "text-yellow-500"}`} />;
                      })()}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant={ra.connectivityStatus === "online" ? "default" : "secondary"} data-testid="badge-a2a-status">{ra.connectivityStatus}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">Trust Tier</span>
                        <span className={`text-sm font-medium ${trustColors[ra.trustTier as string] || ""}`} data-testid="text-a2a-trust">{ra.trustTier}</span>
                      </div>
                      {ra.agentCardUrl && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">Agent Card URL</span>
                          <span className="text-sm truncate max-w-[200px]" title={ra.agentCardUrl} data-testid="text-a2a-url">{ra.agentCardUrl}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Allowed Skills</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {ra.allowedSkills && ra.allowedSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-2" data-testid="list-a2a-skills">
                          {ra.allowedSkills.map((skill, i) => (
                            <Badge key={i} variant="secondary" data-testid={`badge-skill-${i}`}>{skill}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No skills whitelisted</p>
                      )}
                    </CardContent>
                  </Card>

                  {ra.agentCardData && (
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Agent Card Details</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64" data-testid="pre-a2a-card">
                          {JSON.stringify(ra.agentCardData as Record<string, unknown>, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No A2A remote agent configuration found for this agent.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })()}

        {agent.agentType === "team" && (
          <TabsContent value="team" className="flex flex-col gap-4 mt-0" data-testid="tab-content-team">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Team Composition</CardTitle>
              </CardHeader>
              <CardContent>
                {teamMembers && teamMembers.length > 0 ? (
                  <div className="flex flex-col gap-2" data-testid="list-team-members">
                    {teamMembers.map((tm) => {
                      const memberAgent = allAgents?.find(a => a.id === tm.memberAgentId);
                      const memberRole = tm.role || "member";
                      const roleIcon = memberRole === "lead" ? Crown : memberRole === "observer" ? Eye : Users;
                      const RoleIcon = roleIcon;
                      return (
                        <div key={tm.id} className="flex items-center justify-between gap-2 p-3 rounded-md border" data-testid={`row-team-member-${tm.id}`}>
                          <div className="flex items-center gap-3">
                            <RoleIcon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{memberAgent?.name || tm.memberAgentId}</p>
                              {memberAgent && <p className="text-xs text-muted-foreground">{memberAgent.agentType} agent</p>}
                            </div>
                          </div>
                          <Badge variant="secondary" data-testid={`badge-role-${tm.id}`}>{memberRole}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No members assigned to this team yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="mcp-servers" className="flex flex-col gap-4 mt-0" data-testid="tab-content-mcp-servers">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Linked MCP Servers</span>
              {agentMcpLinks && agentMcpLinks.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{agentMcpLinks.length}</Badge>
              )}
            </div>
            <Dialog open={assignMcpOpen} onOpenChange={setAssignMcpOpen}>
              <Button size="sm" onClick={() => setAssignMcpOpen(true)} data-testid="button-assign-mcp">
                <Network className="w-4 h-4 mr-1.5" /> Assign MCP Server
              </Button>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Assign MCP Server</DialogTitle>
                  <DialogDescription>Link an MCP server to give this agent access to its tools, resources, and prompts.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>MCP Server</Label>
                    <Select value={selectedMcpServerId} onValueChange={setSelectedMcpServerId}>
                      <SelectTrigger data-testid="select-mcp-server">
                        <SelectValue placeholder="Select an MCP server" />
                      </SelectTrigger>
                      <SelectContent>
                        {allMcpServers?.filter(s => !agentMcpLinks?.some(l => l.serverId === s.id)).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => assignMcpMutation.mutate()}
                    disabled={!selectedMcpServerId || assignMcpMutation.isPending}
                    data-testid="button-confirm-assign-mcp"
                  >
                    {assignMcpMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Network className="w-4 h-4 mr-1.5" />}
                    Assign Server
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!agentMcpLinks || agentMcpLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Network className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-mcp-servers">
                  No MCP servers assigned. Link servers to give this agent access to tools and resources.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {agentMcpLinks.map((link) => {
                const server = allMcpServers?.find(s => s.id === link.serverId);
                return (
                  <McpServerLinkCard
                    key={link.id}
                    link={link}
                    server={server}
                    onUnlink={() => unlinkMcpMutation.mutate(link.id)}
                    unlinking={unlinkMcpMutation.isPending}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ontology" className="flex flex-col gap-4 mt-0" data-testid="tab-content-ontology">
          {(() => {
            const currentTags: Array<{ conceptId: string; label: string; category?: string }> = (() => {
              const raw = agent.ontologyTags as any;
              if (Array.isArray(raw)) return raw;
              if (raw && typeof raw === "object" && Array.isArray(raw.tags)) return raw.tags;
              return [];
            })();
            const conceptMap = new Map((allOntologyConcepts || []).map(c => [c.id, c]));
            const industryConcepts = (allOntologyConcepts || []).filter(c =>
              industry?.id ? c.industryId === industry.id : true
            );
            const categories = Array.from(new Set(industryConcepts.map(c => c.category))).sort();
            const taggedIds = new Set(currentTags.map(t => t.conceptId));
            const untaggedConcepts = industryConcepts.filter(c => !taggedIds.has(c.id));

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Ontology Tags</span>
                    <Badge variant="secondary" className="text-[10px]">{currentTags.length} mapped</Badge>
                  </div>
                  {industry && (
                    <Badge variant="outline" className="text-[10px]">{industry.ontology || industry.label}</Badge>
                  )}
                </div>

                {currentTags.length > 0 ? (
                  <Card data-testid="card-current-ontology-tags">
                    <CardHeader className="flex flex-row items-center gap-2 pb-3">
                      <Network className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">Mapped Concepts ({currentTags.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex flex-col gap-2">
                      {currentTags.map(tag => {
                        const concept = conceptMap.get(tag.conceptId);
                        return (
                          <div key={tag.conceptId} className="flex items-start gap-2 p-2.5 border rounded-md group" data-testid={`ontology-tag-${tag.conceptId}`}>
                            <Brain className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium">{tag.label || concept?.label || tag.conceptId}</span>
                                <Badge variant="outline" className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                  {tag.category || concept?.category || "General"}
                                </Badge>
                              </div>
                              {concept?.description && (
                                <p className="text-[11px] text-muted-foreground line-clamp-2">{concept.description}</p>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ visibility: "visible" }}
                              data-testid={`button-remove-ontology-${tag.conceptId}`}
                              onClick={async () => {
                                const updated = currentTags.filter(t => t.conceptId !== tag.conceptId);
                                try {
                                  await apiRequest("PATCH", `/api/agents/${agentId}`, { ontologyTags: updated });
                                  queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                                  toast({ title: "Ontology tag removed" });
                                } catch {
                                  toast({ title: "Failed to remove tag", variant: "destructive" });
                                }
                              }}
                            >
                              <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ) : (
                  <Card data-testid="card-no-ontology-tags">
                    <CardContent className="p-6 flex flex-col items-center gap-2 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium">No ontology tags mapped</p>
                      <p className="text-xs text-muted-foreground">Map this agent to domain concepts to enable ontology-aware governance and compliance.</p>
                    </CardContent>
                  </Card>
                )}

                <Card data-testid="card-add-ontology-tags">
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Add Ontology Concepts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {categories.length > 0 ? (
                      categories.map(cat => {
                        const catConcepts = untaggedConcepts.filter(c => c.category === cat);
                        if (catConcepts.length === 0) return null;
                        return (
                          <div key={cat} className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">{cat}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {catConcepts.map(c => (
                                <Badge
                                  key={c.id}
                                  variant="outline"
                                  className="text-[10px] cursor-pointer hover-elevate"
                                  data-testid={`badge-add-ontology-${c.id}`}
                                  onClick={async () => {
                                    const updated = [...currentTags, { conceptId: c.id, label: c.label, category: c.category }];
                                    try {
                                      await apiRequest("PATCH", `/api/agents/${agentId}`, { ontologyTags: updated });
                                      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
                                      toast({ title: `Tagged with "${c.label}"` });
                                    } catch {
                                      toast({ title: "Failed to add tag", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> {c.label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-concepts">
                        No ontology concepts available. Generate concepts from the Ontology Explorer first.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="api-gateway" className="flex flex-col gap-4 mt-0" data-testid="tab-content-api-gateway">
          <AgentApiGateway agent={agent} />
        </TabsContent>

        <TabsContent value="channels" className="flex flex-col gap-4 mt-0" data-testid="tab-content-channels">
          <AgentChannels agent={agent} />
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
                            <span className="font-mono">{(div.original || "N/A").slice(0, 80)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block mb-0.5">Replay</span>
                            <span className="font-mono">{(div.replay || "N/A").slice(0, 80)}</span>
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

      <Dialog open={exportDialogOpen} onOpenChange={(open) => { setExportDialogOpen(open); if (!open) { setExportStep("select"); setExportPreview(null); setToolAdapterOverrides({}); setOtelEnabled(true); setSpanGranularity("per-node"); setCompileStatus("idle"); setCompileOutput(""); setEvalStatus("idle"); setEvalOutput(""); setExportApprovalSubmitted(false); setExportApprovalId(null); setDeliveryTarget("zip"); setGitRepoUrl(""); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {exportStep === "select" ? (
                <><Package className="w-4 h-4" /> Export Agent</>
              ) : exportStep === "configure" ? (
                <><Code className="w-4 h-4" /> Configure Source Export</>
              ) : exportStep === "tools" ? (
                <><Wrench className="w-4 h-4" /> Tool Adapter Resolution</>
              ) : exportStep === "dependencies" ? (
                <><Layers className="w-4 h-4" /> Dependencies &amp; Reproducibility</>
              ) : exportStep === "envvars" ? (
                <><KeyRound className="w-4 h-4" /> Environment Variables &amp; Secrets</>
              ) : exportStep === "observability" ? (
                <><Radio className="w-4 h-4" /> Observability &amp; Trace Settings</>
              ) : exportStep === "buildtest" ? (
                <><Hammer className="w-4 h-4" /> Build &amp; Test Gate</>
              ) : exportStep === "preview" ? (
                <><FileCode className="w-4 h-4" /> Preview Source Files</>
              ) : exportStep === "delivery" ? (
                <><Package className="w-4 h-4" /> Delivery Target</>
              ) : exportStep === "guide" ? (
                <><BookOpen className="w-4 h-4" /> Deployment Guide</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Approval Preview</>
              )}
            </DialogTitle>
            <DialogDescription>
              {exportStep === "select"
                ? "Choose how this agent should be packaged for deployment."
                : exportStep === "configure"
                  ? "Configure source files for standalone deployment via your CI/CD pipeline."
                  : exportStep === "tools"
                    ? "Ensure every tool reference has an implementation path in the export package."
                    : exportStep === "dependencies"
                      ? "Review what will be installed and ensure reproducible builds."
                      : exportStep === "envvars"
                        ? "Review the environment variables your deployed agent will need at runtime."
                        : exportStep === "observability"
                          ? "Preserve the ALMP flight recorder by configuring OpenTelemetry trace settings."
                          : exportStep === "buildtest"
                            ? "Validate the generated export before finalizing — compile check and eval suite."
                            : exportStep === "preview"
                              ? "Review the generated source files before downloading."
                              : exportStep === "delivery"
                                ? "Choose how to receive the generated code package."
                                : exportStep === "guide"
                                  ? "Follow these steps to deploy your exported agent in production."
                                  : "Review governance requirements and request expert validation for this export package."}
            </DialogDescription>
          </DialogHeader>

          {exportStep === "select" && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">1</span>
                  <span className="font-medium">Export Type</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Configure</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Tools</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Deps</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Env</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Traces</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Gate</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Preview</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Approval</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="flex flex-col gap-3 p-4 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => {
                    setExportDialogOpen(false);
                    toast({ title: "Managed Runtime", description: "This agent is already configured for managed runtime deployment. No export needed." });
                  }}
                  data-testid="card-export-managed"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                      <Rocket className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">Managed Runtime Artifact</span>
                      <Badge variant="outline" className="text-[10px] w-fit mt-0.5">Default</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deploy through the platform runtime. No source files are exported — the agent runs using its declarative configuration.
                  </p>
                  <div className="flex flex-col gap-1.5 mt-auto">
                    {["Platform-managed lifecycle", "Automatic scaling and monitoring", "No CI/CD setup required"].map(f => (
                      <div key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-[11px] text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="flex flex-col gap-3 p-4 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => setExportStep("configure")}
                  data-testid="card-export-source"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                      <Code className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">Source Export</span>
                      <Badge variant="outline" className="text-[10px] w-fit mt-0.5">CI/CD &amp; Portability</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Generate source files for standalone deployment. Integrate into your CI/CD pipeline or run independently outside the platform.
                  </p>
                  <div className="flex flex-col gap-1.5 mt-auto">
                    {["Downloadable source files (TypeScript / Python)", "CI/CD pipeline integration ready", "Full portability — deploy anywhere"].map(f => (
                      <div key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-[11px] text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {exportStep === "configure" && (() => {
            const frameworkOptions = [
              { id: "generic", label: "Generic Tool-Calling Runtime", desc: "Minimal tool-calling agent — universal baseline", icon: Cpu, recommended: true },
              { id: "langgraph", label: "LangGraph Graph App", desc: "Graph-oriented state machine with nodes and edges", icon: Network },
              { id: "crewai", label: "CrewAI Project Scaffold", desc: "YAML-first multi-agent crew with role definitions", icon: Users },
              { id: "foundry", label: "Microsoft Foundry Agent", desc: "Foundry-compatible project with manifest and skills", icon: Boxes },
              { id: "bedrock", label: "AWS Bedrock Agent", desc: "Action groups with Lambda handlers and OpenAPI specs", icon: Cloud },
              { id: "n8n", label: "N8N Workflow", desc: "Workflow JSON with custom node stubs and credentials", icon: Workflow },
              { id: "vertex", label: "GCP Vertex AI Agent", desc: "Vertex Agent Builder layout with tools and extensions", icon: Box },
            ];
            const frameworkFileMap: Record<string, Array<{ label: string; desc: string }>> = {
              generic: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: exportFormat === "typescript" ? "entrypoint.ts" : "entrypoint.py", desc: "Ralph Loop orchestration" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
                { label: "Dockerfile", desc: "Container build for CI/CD" },
              ],
              langgraph: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: exportFormat === "typescript" ? "graph.ts" : "graph.py", desc: "LangGraph state graph definition" },
                { label: exportFormat === "typescript" ? "nodes/index.ts" : "nodes/__init__.py", desc: "Graph node implementations" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: "langgraph.json", desc: "LangGraph manifest and config" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
                { label: "Dockerfile", desc: "Container build for CI/CD" },
              ],
              crewai: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: "config/agents.yaml", desc: "CrewAI agent role definitions" },
                { label: "config/tasks.yaml", desc: "CrewAI task definitions" },
                { label: exportFormat === "typescript" ? "crew.ts" : "crew.py", desc: "Crew orchestration entry point" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
                { label: "Dockerfile", desc: "Container build for CI/CD" },
              ],
              foundry: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: "foundry.manifest.json", desc: "Foundry agent manifest" },
                { label: exportFormat === "typescript" ? "skills/index.ts" : "skills/__init__.py", desc: "Skill implementations" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: exportFormat === "typescript" ? "entrypoint.ts" : "entrypoint.py", desc: "Agent entry point" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
                { label: "Dockerfile", desc: "Container build for CI/CD" },
              ],
              bedrock: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: "agent-config.json", desc: "Bedrock agent configuration" },
                { label: "action-groups/openapi.yaml", desc: "OpenAPI spec for action groups" },
                { label: exportFormat === "typescript" ? "lambda/handler.ts" : "lambda/handler.py", desc: "Lambda function handler" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: "template.yaml", desc: "SAM/CloudFormation template" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
              ],
              n8n: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: "workflow.json", desc: "N8N workflow definition" },
                { label: exportFormat === "typescript" ? "nodes/AgentNode.ts" : "nodes/agent_node.py", desc: "Custom agent node" },
                { label: exportFormat === "typescript" ? "nodes/ToolNode.ts" : "nodes/tool_node.py", desc: "Custom tool node" },
                { label: "credentials/AgentCredentials.json", desc: "Credential type definitions" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
              ],
              vertex: [
                { label: "agent.yaml", desc: "Agent manifest with config" },
                { label: "agent-config.json", desc: "Vertex AI agent definition" },
                { label: exportFormat === "typescript" ? "extensions/index.ts" : "extensions/__init__.py", desc: "Extension implementations" },
                { label: exportFormat === "typescript" ? "tools/index.ts" : "tools/__init__.py", desc: "Tool adapter registry" },
                { label: exportFormat === "typescript" ? "entrypoint.ts" : "entrypoint.py", desc: "Agent entry point" },
                { label: exportFormat === "typescript" ? "package.json" : "requirements.txt", desc: "Dependencies" },
                { label: ".env.example", desc: "Environment variables" },
                { label: "Dockerfile", desc: "Container build for CI/CD" },
              ],
            };
            const currentFiles = frameworkFileMap[exportFramework] || frameworkFileMap.generic;
            return (
            <div className="flex flex-col gap-5 py-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">2</span>
                  <span className="font-medium">Configure</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Tools</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Deps</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Env</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Traces</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Gate</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Preview</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Approval</span>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Template & Framework</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {frameworkOptions.map(fw => {
                    const Icon = fw.icon;
                    const selected = exportFramework === fw.id;
                    return (
                      <div
                        key={fw.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer hover-elevate ${selected ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => setExportFramework(fw.id)}
                        data-testid={`framework-${fw.id}`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium truncate">{fw.label}</span>
                            {fw.recommended && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Recommended</Badge>}
                          </div>
                          <span className="text-[10px] text-muted-foreground leading-tight">{fw.desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
                    <span className="text-sm font-medium">Source Files Generated</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentFiles.map(f => (
                      <div key={f.label} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`source-file-${f.label.replace(/[/.]/g, "-")}`}>
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
            );
          })()}

          {exportStep === "tools" && (() => {
            const agentTools = Array.isArray(agent?.toolsConfig) ? agent.toolsConfig as any[] : [];
            const connectors = allToolConnectors || [];
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));

            type ToolResolution = {
              name: string;
              description: string;
              status: "builtin" | "customer" | "stub";
              connectorId?: string;
              connectorVersion?: string;
            };

            const resolvedTools: ToolResolution[] = agentTools.map((t: any) => {
              const override = toolAdapterOverrides[t.name];
              const normalized = normalize(t.name || "");
              const connector = connectorMap.get(normalized);
              let status: "builtin" | "customer" | "stub" = override || "stub";
              if (!override) {
                if (connector && connector.status === "connected") status = "builtin";
                else if (connector) status = "customer";
                else status = "stub";
              }
              return {
                name: t.name || "Unknown Tool",
                description: t.description || t.type || "No description",
                status,
                connectorId: connector?.id,
                connectorVersion: connector ? `v${connector.id.substring(0, 6)}` : undefined,
              };
            });

            const builtinCount = resolvedTools.filter(t => t.status === "builtin").length;
            const customerCount = resolvedTools.filter(t => t.status === "customer").length;
            const stubCount = resolvedTools.filter(t => t.status === "stub").length;

            return (
              <div className="flex flex-col gap-4 py-2 flex-1 min-h-0" data-testid="step-tool-adapters">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Configure</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">3</span>
                    <span className="font-medium">Tools</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Deps</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Env</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Traces</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Gate</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Preview</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Approval</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-adapter-builtin">
                    <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> {builtinCount} Built-in
                  </Badge>
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-adapter-customer">
                    <AlertCircle className="w-3 h-3 mr-1 text-amber-500" /> {customerCount} Customer Required
                  </Badge>
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-adapter-stub">
                    <FileCode className="w-3 h-3 mr-1 text-muted-foreground" /> {stubCount} Stubs
                  </Badge>
                </div>

                {resolvedTools.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 flex flex-col items-center gap-2 text-center">
                      <Wrench className="w-6 h-6 text-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">No tools referenced</span>
                      <span className="text-xs text-muted-foreground/60">This agent's blueprint has no tool references. You can proceed directly to generate source files.</span>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1">
                    {resolvedTools.map((tool, idx) => {
                      const statusConfig = {
                        builtin: { label: "Built-in adapter included", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle },
                        customer: { label: "Customer adapter required", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: AlertTriangle },
                        stub: { label: "Stub will be generated", color: "text-muted-foreground", bg: "bg-muted/50", icon: FileCode },
                      };
                      const cfg = statusConfig[tool.status];
                      const StatusIcon = cfg.icon;

                      return (
                        <div
                          key={tool.name}
                          className="flex items-center gap-3 p-3 rounded-md border"
                          data-testid={`tool-adapter-row-${idx}`}
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                            <Wrench className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate" data-testid={`tool-name-${idx}`}>{tool.name}</span>
                              <Badge variant="outline" className={`text-[9px] shrink-0 ${cfg.bg} ${cfg.color}`} data-testid={`tool-status-${idx}`}>
                                <StatusIcon className="w-2.5 h-2.5 mr-1" />
                                {cfg.label}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate">{tool.description}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tool.status === "builtin" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setToolAdapterOverrides(prev => ({ ...prev, [tool.name]: "stub" }))}
                                data-testid={`button-switch-to-stub-${idx}`}
                              >
                                <FileCode className="w-3 h-3 mr-1" /> Use Stub Instead
                              </Button>
                            )}
                            {tool.status === "customer" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setToolAdapterOverrides(prev => ({ ...prev, [tool.name]: "stub" }))}
                                  data-testid={`button-generate-stub-${idx}`}
                                >
                                  <FileCode className="w-3 h-3 mr-1" /> Generate Stub
                                </Button>
                                {tool.connectorId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setToolAdapterOverrides(prev => ({ ...prev, [tool.name]: "builtin" }))}
                                    data-testid={`button-attach-adapter-${idx}`}
                                  >
                                    <Layers className="w-3 h-3 mr-1" /> Attach Adapter
                                  </Button>
                                )}
                              </>
                            )}
                            {tool.status === "stub" && (
                              <>
                                {tool.connectorId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setToolAdapterOverrides(prev => ({ ...prev, [tool.name]: "builtin" }))}
                                    data-testid={`button-attach-adapter-${idx}`}
                                  >
                                    <Layers className="w-3 h-3 mr-1" /> Attach Adapter
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stubCount > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-dashed" data-testid="notice-stubs-info">
                    <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">Stub adapters will be generated</span>
                      <span className="text-[11px] text-muted-foreground">
                        {stubCount} tool{stubCount !== 1 ? "s" : ""} will have placeholder implementations in the export. You'll need to provide the actual implementation before deployment.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {exportStep === "dependencies" && (() => {
            const depData = (() => {
              const fw = exportFramework;
              const fmt = exportFormat;
              const llm = exportLlmProvider;

              if (fmt === "typescript") {
                const deps: Record<string, string> = {
                  "typescript": pinVersions ? "5.6.3" : "^5.0.0",
                  "ts-node": pinVersions ? "10.9.2" : "^10.9.0",
                  "js-yaml": pinVersions ? "4.1.0" : "^4.1.0",
                  "@types/js-yaml": pinVersions ? "4.0.9" : "^4.0.9",
                  "@types/node": pinVersions ? "20.17.12" : "^20.0.0",
                };
                if (llm === "openai") deps["openai"] = pinVersions ? "4.77.0" : "^4.0.0";
                else deps["@anthropic-ai/sdk"] = pinVersions ? "0.30.1" : "^0.30.0";

                if (fw === "langgraph") {
                  deps["@langchain/langgraph"] = pinVersions ? "0.2.36" : "^0.2.0";
                  deps["@langchain/core"] = pinVersions ? "0.3.26" : "^0.3.0";
                  if (llm === "openai") { deps["@langchain/openai"] = pinVersions ? "0.3.16" : "^0.3.0"; }
                  else { deps["@langchain/anthropic"] = pinVersions ? "0.3.12" : "^0.3.0"; }
                }
                if (fw === "bedrock") deps["@aws-sdk/client-bedrock-agent-runtime"] = pinVersions ? "3.712.0" : "^3.0.0";
                if (fw === "n8n") deps["n8n-workflow"] = pinVersions ? "1.69.2" : "^1.0.0";
                if (fw === "vertex") deps["@google-cloud/aiplatform"] = pinVersions ? "3.34.0" : "^3.0.0";

                return {
                  fileName: "package.json",
                  content: JSON.stringify({
                    name: (agent?.name || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    version: "1.0.0",
                    private: true,
                    scripts: { start: fw === "langgraph" ? "ts-node graph.ts" : "ts-node entrypoint.ts" },
                    dependencies: deps,
                  }, null, 2),
                  deps,
                };
              } else {
                const reqs: Array<{ name: string; pinned: string; range: string }> = [
                  { name: "pyyaml", pinned: "6.0.2", range: ">=6.0" },
                ];
                if (llm === "openai") reqs.push({ name: "openai", pinned: "1.58.1", range: ">=1.0" });
                else reqs.push({ name: "anthropic", pinned: "0.30.1", range: ">=0.30" });

                if (fw === "langgraph") {
                  reqs.push({ name: "langgraph", pinned: "0.2.60", range: ">=0.2.0" });
                  reqs.push({ name: "langchain-core", pinned: "0.3.28", range: ">=0.3.0" });
                  if (llm === "openai") reqs.push({ name: "langchain-openai", pinned: "0.2.14", range: ">=0.2.0" });
                  else reqs.push({ name: "langchain-anthropic", pinned: "0.2.8", range: ">=0.2.0" });
                }
                if (fw === "crewai") reqs.push({ name: "crewai", pinned: "0.80.0", range: ">=0.80.0" });
                if (fw === "bedrock") reqs.push({ name: "boto3", pinned: "1.34.162", range: ">=1.34.0" });
                if (fw === "vertex") reqs.push({ name: "google-cloud-aiplatform", pinned: "1.60.0", range: ">=1.60.0" });

                const content = reqs.map(r => pinVersions ? `${r.name}==${r.pinned}` : `${r.name}${r.range}`).join("\n") + "\n";
                const depsMap: Record<string, string> = {};
                reqs.forEach(r => { depsMap[r.name] = pinVersions ? r.pinned : r.range; });

                return {
                  fileName: "requirements.txt",
                  content,
                  deps: depsMap,
                };
              }
            })();

            const depCount = Object.keys(depData.deps).length;
            const warnings: string[] = [];

            if (exportFormat === "typescript") {
              if (depData.deps["@types/js-yaml"] && depData.deps["@types/node"]) {
                warnings.push("Type definition packages (@types/*) add build-time overhead — consider removing if not needed in production.");
              }
              if (depCount > 8) {
                warnings.push(`${depCount} dependencies detected — review if all are required for your deployment target.`);
              }
            }
            if (exportFormat === "python") {
              if (depCount > 5) {
                warnings.push(`${depCount} packages listed — verify all are needed for your deployment environment.`);
              }
            }
            if (exportFramework === "langgraph") {
              warnings.push("LangGraph + LangChain pull in transitive dependencies — consider pinning sub-dependencies in a lockfile.");
            }
            if (!pinVersions) {
              warnings.push("Unpinned versions may cause non-reproducible builds — enable pinning for production deployments.");
            }

            return (
              <div className="flex flex-col gap-4 py-2 flex-1 min-h-0" data-testid="step-dependencies">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Configure</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Tools</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">4</span>
                    <span className="font-medium">Deps</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Env</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Traces</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Gate</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Preview</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Approval</span>
                </div>

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="text-[10px]" data-testid="badge-dep-count">
                      <Package className="w-3 h-3 mr-1" /> {depCount} {depCount === 1 ? "dependency" : "dependencies"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]" data-testid="badge-dep-file">
                      <FileCode className="w-3 h-3 mr-1" /> {depData.fileName}
                    </Badge>
                    {warnings.length > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400" data-testid="badge-dep-warnings">
                        <AlertTriangle className="w-3 h-3 mr-1" /> {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pin-versions-toggle" className="text-xs cursor-pointer">Pin versions</Label>
                    <Switch
                      id="pin-versions-toggle"
                      checked={pinVersions}
                      onCheckedChange={setPinVersions}
                      data-testid="toggle-pin-versions"
                    />
                  </div>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b">
                      <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium font-mono">{depData.fileName}</span>
                      {pinVersions && (
                        <Badge variant="secondary" className="text-[9px] ml-auto">
                          <Lock className="w-2.5 h-2.5 mr-1" /> Pinned
                        </Badge>
                      )}
                      {!pinVersions && (
                        <Badge variant="secondary" className="text-[9px] ml-auto bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Unlock className="w-2.5 h-2.5 mr-1" /> Unpinned
                        </Badge>
                      )}
                    </div>
                    <div className="overflow-auto max-h-[200px]">
                      <pre className="text-xs font-mono p-4 whitespace-pre-wrap" data-testid="dep-file-preview">
                        <code>{depData.content}</code>
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                {warnings.length > 0 && (
                  <Card>
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-medium">Minimize Dependencies</span>
                        <Badge variant="secondary" className="text-[9px]">{warnings.length}</Badge>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground" data-testid={`dep-warning-${i}`}>
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500/70" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {pinVersions && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20" data-testid="notice-pinned-info">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">Reproducible build configured</span>
                      <span className="text-[11px] text-muted-foreground">
                        All {depCount} dependencies are pinned to exact versions. Builds will produce identical results across environments.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {exportStep === "envvars" && (() => {
            const envVars: Array<{ key: string; description: string; category: "llm" | "tool" | "infra" | "agent"; required: boolean; example: string }> = [];

            if (exportLlmProvider === "openai") {
              envVars.push({ key: "OPENAI_API_KEY", description: "OpenAI API key for LLM inference", category: "llm", required: true, example: "sk-proj-..." });
            } else {
              envVars.push({ key: "ANTHROPIC_API_KEY", description: "Anthropic API key for Claude inference", category: "llm", required: true, example: "sk-ant-..." });
            }

            if (exportFramework === "bedrock") {
              envVars.push({ key: "AWS_ACCESS_KEY_ID", description: "AWS access key for Bedrock API", category: "infra", required: true, example: "AKIA..." });
              envVars.push({ key: "AWS_SECRET_ACCESS_KEY", description: "AWS secret key for Bedrock API", category: "infra", required: true, example: "wJal..." });
              envVars.push({ key: "AWS_REGION", description: "AWS region for Bedrock service", category: "infra", required: true, example: "us-east-1" });
            }
            if (exportFramework === "vertex") {
              envVars.push({ key: "GOOGLE_APPLICATION_CREDENTIALS", description: "Path to GCP service account JSON", category: "infra", required: true, example: "/path/to/credentials.json" });
              envVars.push({ key: "GCP_PROJECT_ID", description: "Google Cloud project identifier", category: "infra", required: true, example: "my-project-123" });
            }

            const agentTools = Array.isArray(agent?.toolsConfig) ? agent.toolsConfig as any[] : [];
            const toolsWithTokens = agentTools.filter(t => {
              const override = toolAdapterOverrides[t.name];
              return override === "builtin" || override === "customer";
            });
            toolsWithTokens.forEach(t => {
              const envKey = `${(t.name || "TOOL").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
              envVars.push({ key: envKey, description: `API key / token for ${t.name} tool`, category: "tool", required: false, example: "tok-..." });
            });

            envVars.push({ key: "AGENT_LOG_LEVEL", description: "Logging verbosity (debug, info, warn, error)", category: "agent", required: false, example: "info" });
            envVars.push({ key: "AGENT_MAX_ITERATIONS", description: "Max Ralph Loop iterations before halting", category: "agent", required: false, example: String(exportMaxIterations) });

            if (exportFramework === "foundry") {
              envVars.push({ key: "DATABASE_URL", description: "Database connection string for persistence", category: "infra", required: false, example: "postgresql://user:pass@host:5432/db" });
            }

            if (otelEnabled) {
              envVars.push({ key: "OTEL_EXPORTER_OTLP_ENDPOINT", description: "OpenTelemetry collector endpoint for trace export", category: "infra", required: false, example: "http://localhost:4318" });
              envVars.push({ key: "OTEL_SERVICE_NAME", description: "Service name reported in trace spans", category: "infra", required: false, example: (agent?.name || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-") });
            }

            const envExampleContent = envVars.map(v => {
              const commentLine = `# ${v.description}${v.required ? " (REQUIRED)" : ""}`;
              return `${commentLine}\n${v.key}=`;
            }).join("\n\n") + "\n";

            const requiredCount = envVars.filter(v => v.required).length;
            const optionalCount = envVars.filter(v => !v.required).length;
            const categoryLabels: Record<string, string> = { llm: "LLM Provider", tool: "Tool Credentials", infra: "Infrastructure", agent: "Agent Config" };
            const grouped = envVars.reduce<Record<string, typeof envVars>>((acc, v) => {
              if (!acc[v.category]) acc[v.category] = [];
              acc[v.category].push(v);
              return acc;
            }, {});

            return (
              <div className="flex flex-col gap-4 py-2 flex-1 min-h-0 overflow-auto" data-testid="step-envvars">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Configure</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Tools</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Deps</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">5</span>
                    <span className="font-medium">Env</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Traces</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Gate</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Preview</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Approval</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-env-total">
                    <KeyRound className="w-3 h-3 mr-1" /> {envVars.length} variable{envVars.length !== 1 ? "s" : ""}
                  </Badge>
                  {requiredCount > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400" data-testid="badge-env-required">
                      <Lock className="w-3 h-3 mr-1" /> {requiredCount} required
                    </Badge>
                  )}
                  {optionalCount > 0 && (
                    <Badge variant="outline" className="text-[10px]" data-testid="badge-env-optional">
                      {optionalCount} optional
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {(["llm", "tool", "infra", "agent"] as const).filter(cat => grouped[cat]?.length).map(cat => (
                    <Card key={cat}>
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          {cat === "llm" && <Cpu className="w-3.5 h-3.5 text-muted-foreground" />}
                          {cat === "tool" && <Wrench className="w-3.5 h-3.5 text-muted-foreground" />}
                          {cat === "infra" && <Database className="w-3.5 h-3.5 text-muted-foreground" />}
                          {cat === "agent" && <Settings className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span className="text-xs font-medium">{categoryLabels[cat]}</span>
                          <Badge variant="secondary" className="text-[9px]">{grouped[cat].length}</Badge>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {grouped[cat].map(v => (
                            <div key={v.key} className="flex items-start gap-3 py-1.5 border-b last:border-0" data-testid={`env-var-${v.key}`}>
                              <code className="text-[11px] font-mono font-medium shrink-0 mt-0.5">{v.key}</code>
                              <span className="text-[11px] text-muted-foreground flex-1">{v.description}</span>
                              {v.required && (
                                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">required</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium font-mono">.env.example</span>
                      <Badge variant="secondary" className="text-[9px] ml-auto">
                        <Shield className="w-2.5 h-2.5 mr-1" /> No real values
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(envExampleContent);
                          toast({ title: "Copied", description: ".env.example content copied to clipboard." });
                        }}
                        data-testid="button-copy-env-example"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="overflow-auto max-h-[180px]">
                      <pre className="text-xs font-mono p-4 whitespace-pre-wrap" data-testid="env-example-preview">
                        <code>{envExampleContent}</code>
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/5 border border-blue-500/20" data-testid="notice-replit-secrets">
                  <Lock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">Deploying on Replit?</span>
                    <span className="text-[11px] text-muted-foreground">
                      Store these as encrypted Secrets in your Repl's "Secrets" tab instead of committing a .env file.
                      Secrets are injected as environment variables at runtime and never exposed in your source code.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-dashed" data-testid="notice-env-security">
                  <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">Never commit real secrets</span>
                    <span className="text-[11px] text-muted-foreground">
                      The .env.example file is safe to commit — it contains only variable names with empty values as documentation.
                      Add .env to your .gitignore and use your platform's secrets manager for actual values.
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {exportStep === "observability" && (
            <div className="flex flex-col gap-4 py-2 flex-1 min-h-0 overflow-auto" data-testid="step-observability">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Configure</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Tools</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Deps</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Env</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">6</span>
                  <span className="font-medium">Traces</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Gate</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Preview</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Approval</span>
              </div>

              <Card>
                <CardContent className="p-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">OpenTelemetry-Compatible Traces</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-6">
                        Emit trace data using the OpenTelemetry SDK so you can pipe spans to Jaeger, Datadog, Honeycomb, or any OTLP-compatible backend.
                      </span>
                    </div>
                    <Switch
                      checked={otelEnabled}
                      onCheckedChange={setOtelEnabled}
                      data-testid="switch-otel-enabled"
                    />
                  </div>

                  {otelEnabled && (
                    <div className="flex flex-col gap-3 pl-6 border-l-2 border-primary/20">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Span Granularity</Label>
                        <span className="text-[11px] text-muted-foreground">
                          Controls how much detail each trace captures. Higher granularity means more spans per trace.
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div
                          className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer hover-elevate ${spanGranularity === "per-node" ? "border-primary bg-primary/5" : ""}`}
                          onClick={() => setSpanGranularity("per-node")}
                          data-testid="option-granularity-per-node"
                        >
                          <div className={`flex items-center justify-center w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${spanGranularity === "per-node" ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                            {spanGranularity === "per-node" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">Per Node</span>
                            <span className="text-[11px] text-muted-foreground">
                              One span per workflow node (decision, action, tool-group). Balances visibility with low overhead.
                            </span>
                          </div>
                        </div>
                        <div
                          className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer hover-elevate ${spanGranularity === "per-tool-call" ? "border-primary bg-primary/5" : ""}`}
                          onClick={() => setSpanGranularity("per-tool-call")}
                          data-testid="option-granularity-per-tool-call"
                        >
                          <div className={`flex items-center justify-center w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${spanGranularity === "per-tool-call" ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                            {spanGranularity === "per-tool-call" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">Per Tool Call</span>
                            <span className="text-[11px] text-muted-foreground">
                              One span per individual tool invocation inside each node. Maximum detail for debugging tool-level latency and errors.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Scan className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Span Mapping Preview</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3 py-2 border-b">
                      <Badge variant="outline" className="text-[9px] shrink-0">root</Badge>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <code className="text-[11px] font-mono font-medium">agent.run</code>
                        <span className="text-[10px] text-muted-foreground">Root span wrapping the entire Ralph Loop execution</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 py-2 border-b">
                      <Badge variant="outline" className="text-[9px] shrink-0">node</Badge>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <code className="text-[11px] font-mono font-medium">agent.iteration.{"{n}"}</code>
                        <span className="text-[10px] text-muted-foreground">One child span per loop iteration — covers LLM call + tool execution</span>
                      </div>
                    </div>
                    {otelEnabled && spanGranularity === "per-tool-call" && (
                      <div className="flex items-start gap-3 py-2 border-b">
                        <Badge variant="outline" className="text-[9px] shrink-0">tool</Badge>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <code className="text-[11px] font-mono font-medium">tool.invoke.{"{toolName}"}</code>
                          <span className="text-[10px] text-muted-foreground">Nested span for each tool call with input/output attributes</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3 py-2">
                      <Badge variant="outline" className="text-[9px] shrink-0">llm</Badge>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <code className="text-[11px] font-mono font-medium">llm.chat.completion</code>
                        <span className="text-[10px] text-muted-foreground">LLM inference call with model, token count, and latency attributes</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {otelEnabled && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/5 border border-blue-500/20" data-testid="notice-otel-env">
                  <Radio className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">OTEL Endpoint Required</span>
                    <span className="text-[11px] text-muted-foreground">
                      Set <code className="font-mono text-[10px] bg-muted px-1 rounded">OTEL_EXPORTER_OTLP_ENDPOINT</code> at runtime to point at your collector (e.g. <code className="font-mono text-[10px] bg-muted px-1 rounded">http://localhost:4318</code>). This variable was added to your Env Vars step automatically.
                    </span>
                  </div>
                </div>
              )}

              {!otelEnabled && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-dashed" data-testid="notice-otel-disabled">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">Traces Disabled</span>
                    <span className="text-[11px] text-muted-foreground">
                      The exported code will not include OpenTelemetry instrumentation. You can enable it later by adding the SDK manually.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {exportStep === "buildtest" && (
            <div className="flex flex-col gap-4 py-2 flex-1 min-h-0 overflow-auto" data-testid="step-buildtest">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Configure</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Tools</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Deps</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Env</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Traces</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">7</span>
                  <span className="font-medium">Gate</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Preview</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Approval</span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="text-[10px]" data-testid="badge-gate-compile">
                  <Hammer className="w-3 h-3 mr-1" />
                  Compile: {compileStatus === "idle" ? "Not run" : compileStatus === "running" ? "Running..." : compileStatus === "passed" ? "Passed" : "Failed"}
                </Badge>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-gate-eval">
                  <FlaskRound className="w-3 h-3 mr-1" />
                  Eval: {evalStatus === "idle" ? "Not run" : evalStatus === "running" ? "Running..." : evalStatus === "passed" ? "Passed" : "Failed"}
                </Badge>
              </div>

              <Card>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Hammer className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Run Static Compile</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-6">
                        {exportFormat === "typescript"
                          ? "Runs tsc --noEmit against the generated TypeScript files to check for type errors and syntax issues."
                          : "Runs a Python AST parse and pyflakes check against the generated source files."}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={compileStatus === "passed" ? "outline" : "default"}
                      disabled={compileStatus === "running"}
                      onClick={async () => {
                        setCompileStatus("running");
                        setCompileOutput("");
                        try {
                          const res = await apiRequest("POST", `/api/agents/${agentId}/export-validate`, {
                            type: "compile",
                            format: exportFormat,
                            framework: exportFramework,
                            llmProvider: exportLlmProvider,
                          });
                          const data = await res.json();
                          setCompileStatus(data.passed ? "passed" : "failed");
                          setCompileOutput(data.output || (data.passed ? "All checks passed — no errors found." : "Compilation errors detected."));
                        } catch (err) {
                          setCompileStatus("failed");
                          setCompileOutput("Compile check could not complete — verify your export configuration and try again.");
                        }
                      }}
                      data-testid="button-run-compile"
                    >
                      {compileStatus === "running" ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Compiling...</>
                      ) : compileStatus === "passed" ? (
                        <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> Passed</>
                      ) : compileStatus === "failed" ? (
                        <><XOctagon className="w-3.5 h-3.5 mr-1.5" /> Re-run</>
                      ) : (
                        <><Terminal className="w-3.5 h-3.5 mr-1.5" /> Run Check</>
                      )}
                    </Button>
                  </div>
                  {compileOutput && (
                    <div className={`rounded-md p-3 text-xs font-mono whitespace-pre-wrap ${compileStatus === "passed" ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : compileStatus === "failed" ? "bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400" : "bg-muted"}`} data-testid="output-compile">
                      {compileOutput}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <FlaskRound className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Run Eval Suite Locally</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-6">
                        Executes the same evaluation bundles ALMP uses for this agent — scorer thresholds, regression checks, and assertion tests against the generated code.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={evalStatus === "passed" ? "outline" : "default"}
                      disabled={evalStatus === "running"}
                      onClick={async () => {
                        setEvalStatus("running");
                        setEvalOutput("");
                        try {
                          const res = await apiRequest("POST", `/api/agents/${agentId}/export-validate`, {
                            type: "eval",
                            format: exportFormat,
                            framework: exportFramework,
                            llmProvider: exportLlmProvider,
                          });
                          const data = await res.json();
                          setEvalStatus(data.passed ? "passed" : "failed");
                          setEvalOutput(data.output || (data.passed ? "All eval cases passed." : "Some eval cases failed."));
                        } catch (err) {
                          setEvalStatus("failed");
                          setEvalOutput("Eval suite could not complete — verify your export configuration and try again.");
                        }
                      }}
                      data-testid="button-run-eval"
                    >
                      {evalStatus === "running" ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Evaluating...</>
                      ) : evalStatus === "passed" ? (
                        <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> Passed</>
                      ) : evalStatus === "failed" ? (
                        <><XOctagon className="w-3.5 h-3.5 mr-1.5" /> Re-run</>
                      ) : (
                        <><FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Run Eval</>
                      )}
                    </Button>
                  </div>
                  {evalOutput && (
                    <div className={`rounded-md p-3 text-xs font-mono whitespace-pre-wrap ${evalStatus === "passed" ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : evalStatus === "failed" ? "bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400" : "bg-muted"}`} data-testid="output-eval">
                      {evalOutput}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-dashed" data-testid="notice-gate-info">
                <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">Pre-export health check</span>
                  <span className="text-[11px] text-muted-foreground">
                    These checks run against the export configuration, not the generated files. They verify that the selected framework, dependencies, and tool adapters produce a valid, compilable project that passes the agent's linked eval suite. You can proceed without running them.
                  </span>
                </div>
              </div>
            </div>
          )}

          {exportStep === "preview" && (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Configure</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Tools</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Deps</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Env</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Traces</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Gate</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">8</span>
                  <span className="font-medium">Preview</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Approval</span>
              </div>
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

          {exportStep === "approval" && (() => {
            const stubCount = Object.values(toolAdapterOverrides).filter(v => v === "stub").length;
            const customerCount = Object.values(toolAdapterOverrides).filter(v => v === "customer").length;
            const builtinCount = Object.values(toolAdapterOverrides).filter(v => v === "builtin").length;
            const totalTools = Object.keys(toolAdapterOverrides).length;
            const hasNewStubs = stubCount > 0;
            const hasCustomerAdapters = customerCount > 0;
            const compileGatePassed = compileStatus === "passed";
            const evalGatePassed = evalStatus === "passed";
            const fileCount = exportPreview ? Object.keys(exportPreview.files).length : 0;

            const riskTier = (() => {
              if (hasNewStubs && stubCount >= 3) return "critical";
              if (hasNewStubs || !compileGatePassed || !evalGatePassed) return "high";
              if (hasCustomerAdapters || !otelEnabled) return "medium";
              return "low";
            })();
            const riskTierColor = riskTier === "critical" ? "text-red-600 dark:text-red-400 border-red-500/20" : riskTier === "high" ? "text-amber-600 dark:text-amber-400 border-amber-500/20" : riskTier === "medium" ? "text-yellow-600 dark:text-yellow-400 border-yellow-500/20" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            const riskTierBg = riskTier === "critical" ? "bg-red-50 dark:bg-red-950/30" : riskTier === "high" ? "bg-amber-50 dark:bg-amber-950/30" : riskTier === "medium" ? "bg-yellow-50 dark:bg-yellow-950/30" : "bg-emerald-50 dark:bg-emerald-950/30";

            const changeSummary: string[] = [];
            changeSummary.push(`${fileCount} source file${fileCount !== 1 ? "s" : ""} generated`);
            changeSummary.push(`Framework: ${exportFramework}`);
            changeSummary.push(`Format: ${exportFormat}`);
            changeSummary.push(`LLM Provider: ${exportLlmProvider}`);
            if (pinVersions) changeSummary.push("Pinned dependency versions");
            if (otelEnabled) changeSummary.push(`OpenTelemetry traces enabled (${spanGranularity})`);
            else changeSummary.push("OpenTelemetry traces disabled");

            return (
              <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto" data-testid="step-approval">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] text-muted-foreground/40">Export Type</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Configure</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Tools</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Deps</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Env</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Traces</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Gate</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/40">Preview</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">9</span>
                    <span className="font-medium">Approval</span>
                  </div>
                </div>

                <Card data-testid="card-risk-tier">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-md ${riskTierBg}`}>
                          <Shield className={`w-5 h-5 ${riskTierColor.split(" ")[0]}`} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">Risk Assessment</span>
                          <span className="text-xs text-muted-foreground">Governance tier computed from export configuration</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs font-semibold uppercase ${riskTierColor}`} data-testid="badge-export-risk-tier">
                        {riskTier} risk
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-change-summary">
                  <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      What Changed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1.5">
                      {changeSummary.map((item, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`text-change-${i}`}>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-sm">{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-tool-permissions">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <Wrench className="w-4 h-4 text-muted-foreground" />
                      Tool Permissions
                    </CardTitle>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-tools-builtin">{builtinCount} built-in</Badge>
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-tools-customer">{customerCount} customer</Badge>
                      {hasNewStubs && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid="badge-tools-stub">{stubCount} stub</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1.5">
                      {totalTools === 0 ? (
                        <span className="text-xs text-muted-foreground">No tool adapters configured</span>
                      ) : (
                        Object.entries(toolAdapterOverrides).map(([name, status]) => (
                          <div key={name} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`tool-perm-${name}`}>
                            <span className="text-sm">{name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${status === "stub" ? "text-amber-600 dark:text-amber-400 border-amber-500/20" : status === "customer" ? "text-blue-600 dark:text-blue-400 border-blue-500/20" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/20"}`}
                            >
                              {status === "stub" ? "Stub (new permission)" : status === "customer" ? "Customer adapter" : "Built-in"}
                            </Badge>
                          </div>
                        ))
                      )}
                      {hasNewStubs && (
                        <div className="flex items-start gap-2 mt-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <span className="text-xs text-amber-700 dark:text-amber-300">{stubCount} stub adapter{stubCount !== 1 ? "s" : ""} will be generated with placeholder implementations. These introduce new tool permissions that require expert review.</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-gate-results">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <FlaskConical className="w-4 h-4 text-muted-foreground" />
                      Validation Gate Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="gate-compile-result">
                        <span className="text-sm">Static Compile</span>
                        <Badge variant="outline" className={`text-[10px] ${compileGatePassed ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : compileStatus === "failed" ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-muted-foreground"}`}>
                          {compileGatePassed ? "Passed" : compileStatus === "failed" ? "Failed" : "Not run"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="gate-eval-result">
                        <span className="text-sm">Eval Suite</span>
                        <Badge variant="outline" className={`text-[10px] ${evalGatePassed ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : evalStatus === "failed" ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-muted-foreground"}`}>
                          {evalGatePassed ? "Passed" : evalStatus === "failed" ? "Failed" : "Not run"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {exportApprovalSubmitted && exportApprovalId && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40" data-testid="notice-approval-submitted">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Export approval requested</span>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">An approval record has been created for expert validation. Reviewers can inspect the full evidence bundle including source files, dependencies, and eval results.</span>
                      <Link href={`/approvals/${exportApprovalId}`}>
                        <Button variant="outline" size="sm" className="mt-1 w-fit" data-testid="button-view-approval">
                          View Approval <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {exportStep === "delivery" && (
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto" data-testid="step-delivery">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {["Export Type", "Configure", "Tools", "Deps", "Env", "Traces", "Gate", "Preview", "Approval"].map((label, i) => (
                  <Fragment key={i}>
                    <span className="text-[11px] text-muted-foreground/40">{label}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                  </Fragment>
                ))}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">10</span>
                  <span className="font-medium">Delivery</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/40">Guide</span>
              </div>

              <div className="flex flex-col gap-2">
                <Card 
                  className={`cursor-pointer hover-elevate ${deliveryTarget === "zip" ? "border-primary" : ""}`}
                  onClick={() => setDeliveryTarget("zip")}
                  data-testid="card-delivery-zip"
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                        <Download className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-sm font-medium">Download ZIP</span>
                        <span className="text-xs text-muted-foreground">Download the complete source package as a ZIP archive. Always available.</span>
                      </div>
                      {deliveryTarget === "zip" && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer hover-elevate ${deliveryTarget === "git" ? "border-primary" : ""}`}
                  onClick={() => setDeliveryTarget("git")}
                  data-testid="card-delivery-git"
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                        <GitBranch className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-sm font-medium">Push to Git Repo</span>
                        <span className="text-xs text-muted-foreground">Push the generated source files to a Git repository for CI/CD workflows.</span>
                      </div>
                      {deliveryTarget === "git" && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer hover-elevate ${deliveryTarget === "replit" ? "border-primary" : ""}`}
                  onClick={() => setDeliveryTarget("replit")}
                  data-testid="card-delivery-replit"
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-sm font-medium">Publish to Replit via GitHub</span>
                        <span className="text-xs text-muted-foreground">Import the source package into a Replit app through GitHub for instant hosting.</span>
                      </div>
                      {deliveryTarget === "replit" && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {deliveryTarget === "git" && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium">Repository URL</span>
                      <Input
                        placeholder="https://github.com/org/repo.git"
                        value={gitRepoUrl}
                        onChange={(e) => setGitRepoUrl(e.target.value)}
                        data-testid="input-git-repo-url"
                      />
                      <span className="text-xs text-muted-foreground">The source package will be pushed to the main branch of this repository.</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {deliveryTarget === "replit" && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium">Replit Import Steps</span>
                      <div className="flex flex-col gap-1.5">
                        {[
                          "Push the source package to a GitHub repository",
                          "Navigate to replit.com and click 'Create Repl'",
                          "Select 'Import from GitHub'",
                          "Connect your GitHub account if not already connected",
                          "Select the repository containing the exported agent",
                          "Click 'Import' to create the Replit app"
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium shrink-0 mt-0.5">{i + 1}</span>
                            <span className="text-sm">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {exportStep === "guide" && (() => {
            const isReplit = deliveryTarget === "replit";
            const isGit = deliveryTarget === "git";
            return (
              <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto" data-testid="step-guide">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {["Export Type", "Configure", "Tools", "Deps", "Env", "Traces", "Gate", "Preview", "Approval", "Delivery"].map((label, i) => (
                    <Fragment key={i}>
                      <span className="text-[11px] text-muted-foreground/40">{label}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                    </Fragment>
                  ))}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">11</span>
                    <span className="font-medium">Deploy Guide</span>
                  </div>
                </div>

                {isReplit ? (
                  <>
                    <Card data-testid="card-guide-deployment-type">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <Rocket className="w-4 h-4 text-muted-foreground" />
                          Recommended Deployment Type
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          {[
                            { type: "Autoscale", desc: "Best for APIs and services that scale with traffic. Automatically adjusts resources based on demand.", recommended: true },
                            { type: "Reserved VM", desc: "Best for always-on workloads requiring persistent connections or background processing.", recommended: false },
                            { type: "Scheduled", desc: "Best for periodic tasks like cron jobs, batch processing, or scheduled reports.", recommended: false },
                          ].map(dt => (
                            <div key={dt.type} className={`flex items-start gap-3 p-2.5 rounded-md ${dt.recommended ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`} data-testid={`guide-deploy-type-${dt.type.toLowerCase()}`}>
                              {dt.recommended ? <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{dt.type}</span>
                                  {dt.recommended && <Badge variant="outline" className="text-[10px]">Recommended</Badge>}
                                </div>
                                <span className="text-xs text-muted-foreground">{dt.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-guide-publish-path">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          Publish Path
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-1.5">
                          {[
                            "Open your Replit app after GitHub import",
                            "Click 'Publish' in the top navigation",
                            "Select your deployment type (Autoscale recommended)",
                            "Configure your custom domain (optional)",
                            "Click 'Publish' to make your agent live",
                          ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium shrink-0 mt-0.5">{i + 1}</span>
                              <span className="text-sm">{step}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-guide-secrets">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <KeyRound className="w-4 h-4 text-muted-foreground" />
                          Configure Secrets
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <span className="text-sm">Use Replit's Secrets tool to store encrypted environment variables. Deployment secrets sync with workspace secrets.</span>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                              <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs font-mono">{exportLlmProvider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"}</span>
                            </div>
                            {otelEnabled && (
                              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                                <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs font-mono">OTEL_EXPORTER_OTLP_ENDPOINT</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-guide-monitoring">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          Monitoring
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <span className="text-sm">After publishing, monitor your deployment from the Replit dashboard. Check the deployment overview for status, health, and resource usage. {otelEnabled ? "OpenTelemetry traces will be exported to your configured OTEL endpoint for production observability." : ""}</span>
                      </CardContent>
                    </Card>
                  </>
                ) : isGit ? (
                  <>
                    <Card data-testid="card-guide-cicd">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <GitBranch className="w-4 h-4 text-muted-foreground" />
                          CI/CD Setup
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <span className="text-sm">Your source package is ready for CI/CD integration. Recommended steps:</span>
                          <div className="flex flex-col gap-1.5">
                            {[
                              "Add environment secrets to your CI/CD platform (GitHub Actions, GitLab CI, etc.)",
                              `Install dependencies: ${exportFormat === "typescript" ? "npm ci" : "pip install -r requirements.txt"}`,
                              `Run tests: ${exportFormat === "typescript" ? "npm test" : "python -m pytest tests/"}`,
                              `Build and deploy using your preferred hosting (Docker, serverless, or cloud VM)`,
                            ].map((step, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium shrink-0 mt-0.5">{i + 1}</span>
                                <span className="text-sm">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-guide-env-config">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <KeyRound className="w-4 h-4 text-muted-foreground" />
                          Environment Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <span className="text-sm">Copy <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.example</code> to <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> and fill in your secrets. Never commit real values to version control.</span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <>
                    <Card data-testid="card-guide-zip">
                      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <Download className="w-4 h-4 text-muted-foreground" />
                          Getting Started
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <span className="text-sm">After extracting the ZIP archive:</span>
                          <div className="flex flex-col gap-1.5">
                            {[
                              `Install dependencies: ${exportFormat === "typescript" ? "npm install" : "pip install -r requirements.txt"}`,
                              "Copy .env.example to .env and fill in your API keys",
                              `Run the agent: ${exportFormat === "typescript" ? "npm start" : "python src/runtime/orchestrator.py"}`,
                              `Run tests: ${exportFormat === "typescript" ? "npm test" : "python -m pytest tests/"}`,
                            ].map((step, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium shrink-0 mt-0.5">{i + 1}</span>
                                <span className="text-sm">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40" data-testid="notice-export-complete">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Export Complete</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Your agent source package has been generated and is ready for deployment. Follow the steps above to get your agent running in production.</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            {exportStep === "configure" && (
              <Button variant="outline" onClick={() => setExportStep("select")} data-testid="button-export-back-to-select">
                Back
              </Button>
            )}
            {exportStep === "tools" && (
              <Button variant="outline" onClick={() => setExportStep("configure")} data-testid="button-export-back-to-configure">
                Back
              </Button>
            )}
            {exportStep === "dependencies" && (
              <Button variant="outline" onClick={() => setExportStep("tools")} data-testid="button-export-back-to-tools">
                Back
              </Button>
            )}
            {exportStep === "envvars" && (
              <Button variant="outline" onClick={() => setExportStep("dependencies")} data-testid="button-export-back-to-deps">
                Back
              </Button>
            )}
            {exportStep === "observability" && (
              <Button variant="outline" onClick={() => setExportStep("envvars")} data-testid="button-export-back-to-envvars">
                Back
              </Button>
            )}
            {exportStep === "buildtest" && (
              <Button variant="outline" onClick={() => setExportStep("observability")} data-testid="button-export-back-to-observability">
                Back
              </Button>
            )}
            {exportStep === "preview" && (
              <Button variant="outline" onClick={() => setExportStep("buildtest")} data-testid="button-export-back">
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} data-testid="button-export-cancel">
              Cancel
            </Button>
            {exportStep === "configure" && (
              <Button
                onClick={() => {
                  const agentTools = Array.isArray(agent?.toolsConfig) ? agent.toolsConfig as any[] : [];
                  const connectors = allToolConnectors || [];
                  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const connectorMap = new Map(connectors.map(c => [normalize(c.name), c]));
                  const initialOverrides: Record<string, "builtin" | "customer" | "stub"> = {};
                  agentTools.forEach(t => {
                    const name = normalize(t.name || "");
                    const connector = connectorMap.get(name);
                    if (connector && connector.status === "connected") {
                      initialOverrides[t.name] = "builtin";
                    } else if (connector) {
                      initialOverrides[t.name] = "customer";
                    } else {
                      initialOverrides[t.name] = "stub";
                    }
                  });
                  setToolAdapterOverrides(initialOverrides);
                  setExportStep("tools");
                }}
                data-testid="button-export-next-tools"
              >
                Next: Tool Adapters <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "tools" && (
              <Button
                onClick={() => setExportStep("dependencies")}
                data-testid="button-export-next-deps"
              >
                Next: Dependencies <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "dependencies" && (
              <Button
                onClick={() => setExportStep("envvars")}
                data-testid="button-export-next-envvars"
              >
                Next: Env Vars <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "envvars" && (
              <Button
                onClick={() => setExportStep("observability")}
                data-testid="button-export-next-observability"
              >
                Next: Traces <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "observability" && (
              <Button
                onClick={() => setExportStep("buildtest")}
                data-testid="button-export-next-buildtest"
              >
                Next: Build &amp; Test <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "buildtest" && (
              <Button
                onClick={() => exportCodeMutation.mutate({ format: exportFormat, llmProvider: exportLlmProvider, maxIterations: exportMaxIterations, completionPromise: exportCompletionPromise, framework: exportFramework, toolAdapters: toolAdapterOverrides, pinVersions, otelEnabled, spanGranularity })}
                disabled={exportCodeMutation.isPending}
                data-testid="button-export-generate"
              >
                {exportCodeMutation.isPending ? "Generating Source Files..." : "Generate Source Files"}
              </Button>
            )}
            {exportStep === "preview" && (
              <Button
                onClick={() => setExportStep("approval")}
                data-testid="button-export-next-approval"
              >
                Next: Approval <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "preview" && (
              <Button onClick={downloadExportPackage} data-testid="button-export-download">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download Source Package
              </Button>
            )}
            {exportStep === "approval" && (
              <Button variant="outline" onClick={() => setExportStep("preview")} data-testid="button-export-back-to-preview">
                Back
              </Button>
            )}
            {exportStep === "delivery" && (
              <Button variant="outline" onClick={() => setExportStep("approval")} data-testid="button-export-back-to-approval">
                Back
              </Button>
            )}
            {exportStep === "guide" && (
              <Button variant="outline" onClick={() => setExportStep("delivery")} data-testid="button-export-back-to-delivery">
                Back
              </Button>
            )}
            {exportStep === "approval" && (
              <Button
                onClick={async () => {
                  try {
                    const stubCount = Object.values(toolAdapterOverrides).filter(v => v === "stub").length;
                    const riskTier = stubCount >= 3 ? "critical" : stubCount > 0 || compileStatus !== "passed" || evalStatus !== "passed" ? "high" : Object.values(toolAdapterOverrides).some(v => v === "customer") || !otelEnabled ? "medium" : "low";
                    const riskScore = riskTier === "critical" ? 9 : riskTier === "high" ? 7 : riskTier === "medium" ? 4 : 1;
                    const res = await apiRequest("POST", "/api/approvals", {
                      type: "export_review",
                      objectType: "export_package",
                      objectId: agentId,
                      objectName: `Export: ${agent?.name || "Agent"} (${exportFramework})`,
                      riskScore,
                      status: "pending",
                      requestedBy: "System",
                      requesterType: "system",
                      agentId,
                      description: `Code export package for ${agent?.name} using ${exportFramework} framework, ${exportFormat} format, ${exportLlmProvider} provider`,
                      changeType: "export",
                      toolPermissionClass: stubCount > 0 ? "elevated" : "standard",
                      diffSummary: `${exportPreview ? Object.keys(exportPreview.files).length : 0} files generated, ${stubCount} stub adapters, ${Object.values(toolAdapterOverrides).filter(v => v === "builtin").length} built-in adapters`,
                      evidenceJson: {
                        exportConfig: { framework: exportFramework, format: exportFormat, llmProvider: exportLlmProvider, pinVersions, otelEnabled, spanGranularity, maxIterations: exportMaxIterations },
                        fileTree: exportPreview ? Object.keys(exportPreview.files) : [],
                        fileContents: exportPreview?.files || {},
                        toolAdapters: toolAdapterOverrides,
                        gateResults: { compileStatus, compileOutput, evalStatus, evalOutput },
                        riskTier,
                        metadata: exportPreview?.metadata || {},
                      },
                    });
                    const data = await res.json();
                    setExportApprovalSubmitted(true);
                    setExportApprovalId(data.id);
                    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
                    toast({ title: "Export approval requested", description: "An expert validator will review the export package." });
                  } catch (err) {
                    toast({ title: "Failed to request approval", description: "Could not create approval record.", variant: "destructive" });
                  }
                }}
                disabled={exportApprovalSubmitted}
                data-testid="button-request-export-approval"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                {exportApprovalSubmitted ? "Approval Requested" : "Request Export Approval"}
              </Button>
            )}
            {exportStep === "approval" && (
              <Button
                onClick={() => setExportStep("delivery")}
                data-testid="button-export-next-delivery"
              >
                Next: Delivery <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
            {exportStep === "delivery" && (
              <Button
                onClick={() => {
                  if (deliveryTarget === "zip") {
                    downloadExportPackage();
                  } else if (deliveryTarget === "git") {
                    toast({ title: "Git push initiated", description: `Source package will be pushed to ${gitRepoUrl}. Configure repository access in your CI/CD settings.` });
                  }
                  setExportStep("guide");
                }}
                disabled={deliveryTarget === "git" && !gitRepoUrl.trim()}
                data-testid="button-export-deliver"
              >
                {deliveryTarget === "zip" ? (
                  <><Download className="w-3.5 h-3.5 mr-1.5" /> Download &amp; Continue</>
                ) : deliveryTarget === "git" ? (
                  <>Push &amp; Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>
                ) : (
                  <>Next: Deploy Guide <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>
                )}
              </Button>
            )}
            {exportStep === "guide" && (
              <Button onClick={() => setExportDialogOpen(false)} data-testid="button-export-done">
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AgentDetail() {
  return (
    <AgentDetailErrorBoundary>
      <AgentDetailInner />
    </AgentDetailErrorBoundary>
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

function ImplementationGraph({ agent, toolConnectors, onGenerateExport }: { agent: Agent; toolConnectors: ToolConnector[]; onGenerateExport: () => void }) {
  const blueprint = agent.blueprintJson as any;
  const tools = (Array.isArray(agent.toolsConfig) ? agent.toolsConfig : []) as Array<{ name: string; type?: string; description?: string }>;
  const memoryRag = agent.memoryRagConfig as any;
  const policyBindings = agent.policyBindings as any;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const connectorMap = new Map(toolConnectors.map(c => [normalize(c.name), c]));

  const nodes = (blueprint?.nodes || []) as Array<{ id: string; type: string; label?: string }>;
  const codeNodeTypes = new Set(["tool_call", "api_call", "webhook", "queue_consumer", "event_listener"]);
  const customNodes = nodes.filter(n => codeNodeTypes.has(n.type));
  const declarativeNodes = nodes.filter(n => !codeNodeTypes.has(n.type));

  type GraphItem = {
    id: string;
    label: string;
    category: "declarative" | "code";
    icon: typeof Settings;
    status: "present" | "missing" | "partial";
    detail: string;
  };

  const items: GraphItem[] = [];

  const hasInstructions = !!(blueprint?.instructions || blueprint?.systemPrompt || (agent as any).systemPrompt);
  items.push({
    id: "instructions",
    label: "Instructions / System Prompt",
    category: "declarative",
    icon: MessageSquare,
    status: hasInstructions ? "present" : "missing",
    detail: hasInstructions ? "Embedded in export config" : "Not configured",
  });

  const modelConfig = (agent as any).modelConfig || blueprint?.model;
  items.push({
    id: "orchestration",
    label: "Orchestration Config",
    category: "declarative",
    icon: Settings,
    status: modelConfig ? "present" : "missing",
    detail: modelConfig ? `${(modelConfig as any)?.provider || "LLM"} / ${(modelConfig as any)?.model || "default"}` : "No model configured",
  });

  if (declarativeNodes.length > 0) {
    items.push({
      id: "workflow-nodes",
      label: "Workflow Nodes",
      category: "declarative",
      icon: Network,
      status: "present",
      detail: `${declarativeNodes.length} declarative node${declarativeNodes.length !== 1 ? "s" : ""}`,
    });
  }

  const hasKnowledge = !!(memoryRag?.knowledgeSources?.length || memoryRag?.ragEndpoint || memoryRag?.vectorStore);
  items.push({
    id: "knowledge",
    label: "Knowledge / RAG Config",
    category: "declarative",
    icon: BookOpenCheck,
    status: hasKnowledge ? "present" : "missing",
    detail: hasKnowledge
      ? `${memoryRag?.knowledgeSources?.length || 0} source${(memoryRag?.knowledgeSources?.length || 0) !== 1 ? "s" : ""}`
      : "No knowledge sources",
  });

  const hasPolicies = Array.isArray(policyBindings) && policyBindings.length > 0;
  items.push({
    id: "policy-bindings",
    label: "Policy Bindings",
    category: "declarative",
    icon: Shield,
    status: hasPolicies ? "present" : "missing",
    detail: hasPolicies ? `${policyBindings.length} bound` : "No policies bound",
  });

  tools.forEach(tool => {
    const normalized = normalize(tool.name || "");
    const connector = connectorMap.get(normalized);
    const connected = connector && connector.status === "connected";
    items.push({
      id: `tool-${normalized}`,
      label: tool.name,
      category: "code",
      icon: Code,
      status: connected ? "present" : "missing",
      detail: connected ? "Adapter connected" : "Adapter needed",
    });
  });

  customNodes.forEach(node => {
    items.push({
      id: `custom-node-${node.id}`,
      label: node.label || node.id,
      category: "code",
      icon: Blocks,
      status: "partial",
      detail: `${node.type.replace(/_/g, " ")} — code stub generated`,
    });
  });

  const declarativeItems = items.filter(i => i.category === "declarative");
  const codeItems = items.filter(i => i.category === "code");

  const statusColor = (s: GraphItem["status"]) =>
    s === "present" ? "text-emerald-500" : s === "partial" ? "text-amber-500" : "text-muted-foreground";
  const statusIcon = (s: GraphItem["status"]) =>
    s === "present" ? CheckCircle : s === "partial" ? AlertCircle : XCircle;

  return (
    <Card data-testid="card-implementation-graph">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Network className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium" data-testid="title-implementation-graph">Implementation Graph</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]" data-testid="badge-impl-declarative-count">
              {declarativeItems.length} declarative
            </Badge>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-impl-code-count">
              {codeItems.length} code
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2" data-testid="impl-graph-declarative">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary" data-testid="badge-category-declarative">Declarative</Badge>
              <span className="text-[11px] text-muted-foreground" data-testid="text-declarative-desc">Embedded in export configuration</span>
            </div>
            {declarativeItems.map(item => {
              const SIcon = statusIcon(item.status);
              return (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-background" data-testid={`impl-node-${item.id}`}>
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate" data-testid={`impl-detail-${item.id}`}>{item.detail}</span>
                  </div>
                  <SIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor(item.status)}`} data-testid={`impl-status-${item.id}`} />
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2" data-testid="impl-graph-code">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive" data-testid="badge-category-code">Code Required</Badge>
              <span className="text-[11px] text-muted-foreground" data-testid="text-code-desc">Generated as application code</span>
            </div>
            {codeItems.length > 0 ? codeItems.map(item => {
              const SIcon = statusIcon(item.status);
              return (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-background" data-testid={`impl-node-${item.id}`}>
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate" data-testid={`impl-detail-${item.id}`}>{item.detail}</span>
                  </div>
                  <SIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor(item.status)}`} data-testid={`impl-status-${item.id}`} />
                </div>
              );
            }) : (
              <p className="text-[11px] text-muted-foreground text-center py-4" data-testid="text-no-code-items">No tool adapters or custom nodes configured</p>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium" data-testid="text-impl-summary">
              {items.filter(i => i.status === "present").length}/{items.length} components ready
            </span>
            <span className="text-[11px] text-muted-foreground" data-testid="text-impl-subtitle">
              {codeItems.filter(i => i.status === "missing").length > 0
                ? `${codeItems.filter(i => i.status === "missing").length} adapter${codeItems.filter(i => i.status === "missing").length !== 1 ? "s" : ""} will be generated`
                : "All components accounted for"}
            </span>
          </div>
          <Button size="sm" onClick={onGenerateExport} data-testid="button-generate-export-package">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Generate Export Package
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BlueprintWorkflowGraph({ blueprint }: { blueprint: any }) {
  const hasNodes = blueprint?.nodes?.length > 0;
  const hasSteps = blueprint?.steps?.length > 0;

  if (!hasNodes && !hasSteps) {
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

  const nodes: Array<{ id: string; type: string; label?: string; [k: string]: any }> = hasNodes
    ? blueprint.nodes
    : blueprint.steps.map((step: any) => ({
        id: step.id,
        type: step.type || "process",
        label: step.label,
        order: step.order,
      }));
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
    trigger: "bg-green-500/15 text-green-600 dark:text-green-400",
    process: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    output: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    evidence_collect: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    audit_log: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    event_listener: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    human_review: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    classifier: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    router: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    llm_call: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    output_format: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
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
  const rawTools = (Array.isArray(tools) ? tools : []) as Array<any>;
  const toolList = rawTools.map((t: any) => ({
    name: t.name || "Unknown",
    type: t.type || "",
    description: t.description || "",
    rateLimit: t.rateLimit,
    timeout: t.timeout,
    permissions: Array.isArray(t.permissions) ? t.permissions : [],
  }));
  const rawPerms = (permissions && typeof permissions === "object" && !Array.isArray(permissions)) ? permissions as any : null;
  const perms = rawPerms ? {
    allowedActions: Array.isArray(rawPerms.allowedActions) ? rawPerms.allowedActions : [],
    deniedActions: Array.isArray(rawPerms.deniedActions) ? rawPerms.deniedActions : [],
    escalationTriggers: Array.isArray(rawPerms.escalationTriggers) ? rawPerms.escalationTriggers : [],
    maxTokenBudget: rawPerms.maxTokenBudget,
    maxCostPerRun: rawPerms.maxCostPerRun,
    requireHumanApproval: Array.isArray(rawPerms.requireHumanApproval) ? rawPerms.requireHumanApproval : [],
    dataAccess: Array.isArray(rawPerms.dataAccess) ? rawPerms.dataAccess : [],
    writeAccess: Array.isArray(rawPerms.writeAccess) ? rawPerms.writeAccess : [],
    apiAccess: Array.isArray(rawPerms.apiAccess) ? rawPerms.apiAccess : [],
  } : null;

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
                    {tool.type && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${tool.type === "write" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                        {tool.type}
                      </Badge>
                    )}
                    <span className="text-xs font-mono font-medium truncate">{tool.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {tool.rateLimit && <span className="text-[10px] text-muted-foreground">{tool.rateLimit}</span>}
                    {tool.timeout && <span className="text-[10px] text-muted-foreground">{tool.timeout}ms</span>}
                    {tool.permissions.length > 0 && <span className="text-[10px] text-muted-foreground">{tool.permissions.length} perms</span>}
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
                  {perms.allowedActions?.map((a: string) => (
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
                  {perms.deniedActions?.map((a: string) => (
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
                  {perms.escalationTriggers.map((t: string) => (
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
                  {perms.requireHumanApproval.map((a: string) => (
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
            {perms.dataAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-cyan-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.dataAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.writeAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Write Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.writeAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
            {perms.apiAccess.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-violet-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">API Access</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.apiAccess.map((a: string) => (
                    <Badge key={a} variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">{a.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            )}
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

  const raw = config as any;
  const cfg = {
    embeddingModel: raw.embeddingModel || "",
    chunkStrategy: raw.chunkStrategy || raw.retrievalStrategy || "",
    chunkSize: raw.chunkSize || 0,
    chunkOverlap: raw.chunkOverlap || 0,
    vectorStore: raw.vectorStore || "",
    citationsRequired: raw.citationsRequired || false,
    maxRetrievedChunks: raw.maxRetrievedChunks || raw.topK || 0,
    similarityThreshold: raw.similarityThreshold || 0,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
  };

  const configEntries = [
    cfg.embeddingModel && { label: "Embedding Model", value: cfg.embeddingModel, mono: true },
    cfg.chunkStrategy && { label: "Retrieval Strategy", value: cfg.chunkStrategy },
    cfg.chunkSize > 0 && { label: cfg.chunkOverlap > 0 ? "Chunk Size / Overlap" : "Chunk Size", value: cfg.chunkOverlap > 0 ? `${cfg.chunkSize} / ${cfg.chunkOverlap}` : String(cfg.chunkSize) },
    cfg.vectorStore && { label: "Vector Store", value: cfg.vectorStore },
    cfg.maxRetrievedChunks > 0 && { label: "Max Chunks / Top K", value: String(cfg.maxRetrievedChunks) },
    cfg.similarityThreshold > 0 && { label: "Similarity Threshold", value: String(cfg.similarityThreshold) },
    { label: "Citations", value: cfg.citationsRequired ? "Required" : "Optional" },
  ].filter(Boolean) as Array<{ label: string; value: string; mono?: boolean }>;

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
          {configEntries.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{entry.label}</span>
              <span className={`text-sm font-medium ${entry.mono ? "font-mono text-xs" : ""} capitalize`} data-testid={`text-rag-${entry.label.toLowerCase().replace(/\s+/g, "-")}`}>{entry.value}</span>
            </div>
          ))}
        </div>

        {cfg.sources.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Sources</span>
              <div className="space-y-1.5">
                {cfg.sources.map((src: any, i: number) => (
                  <div key={src.id || `src-${i}`} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`rag-source-${src.id || i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{src.name || `Source ${i + 1}`}</span>
                        {src.type && <span className="text-[10px] text-muted-foreground">{src.type.replace(/_/g, " ")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {src.docCount != null && <span className="text-[10px] text-muted-foreground">{src.docCount.toLocaleString()} docs</span>}
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
  const rawPolicies = (Array.isArray(bindings) ? bindings : []) as Array<any>;
  const policies = rawPolicies.map((pol: any, i: number) => {
    if (typeof pol === "string") {
      return { id: pol, name: pol, enforcement: "soft_warn" as string, description: "" };
    }
    const name = pol.name || pol.policyName || pol.policyId || `Policy ${i + 1}`;
    const enforcement = pol.enforcement === "hard" ? "hard_block" : (pol.enforcement || "soft_warn");
    return { id: pol.policyId || pol.policyName || `pol-${i}`, name, enforcement, description: pol.description || "" };
  });

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
              <div key={pol.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`policy-binding-${pol.id}`}>
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
  const rawEvals = (Array.isArray(bindings) ? bindings : []) as Array<any>;
  const evals = rawEvals.map((ev: any, i: number) => ({
    suiteId: ev.suiteId || ev.suiteName || `eval-${i}`,
    name: ev.name || ev.suiteName || `Eval Suite ${i + 1}`,
    type: ev.type || "",
    passThreshold: ev.passThreshold ?? 0,
    schedule: ev.schedule || "",
    lastRun: ev.lastRun,
    lastPassRate: ev.lastPassRate,
  }));

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
              const passing = ev.lastPassRate != null && ev.passThreshold > 0 && ev.lastPassRate >= ev.passThreshold;
              return (
                <div key={ev.suiteId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`eval-binding-${ev.suiteId}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {ev.lastPassRate != null ? (
                      passing ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )
                    ) : (
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{ev.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {[ev.type && ev.type.replace(/_/g, " "), ev.schedule, ev.passThreshold > 0 && `threshold: ${(ev.passThreshold * 100).toFixed(0)}%`].filter(Boolean).join(" | ")}
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

  const raw = plan as any;
  const rb = {
    previousVersion: raw.previousVersion || "",
    rollbackStrategy: raw.rollbackStrategy || "",
    healthCheckInterval: raw.healthCheckInterval || "",
    rollbackApprover: raw.rollbackApprover || "",
    lastRollbackAt: raw.lastRollbackAt || null,
    autoRollbackTriggers: Array.isArray(raw.autoRollbackTriggers) ? raw.autoRollbackTriggers : [],
    canaryConfig: raw.canaryConfig || null,
    shadowModeDuration: raw.shadowModeDuration || "",
    canarySteps: Array.isArray(raw.canarySteps) ? raw.canarySteps : [],
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
          {rb.previousVersion && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Previous Version</span>
              <span className="text-sm font-medium font-mono" data-testid="text-rollback-version">v{rb.previousVersion}</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategy</span>
            <span className="text-sm font-medium capitalize">{(rb.rollbackStrategy || "N/A").replace(/_/g, " ")}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Check</span>
            <span className="text-sm font-medium">{rb.healthCheckInterval || "N/A"}</span>
          </div>
          {rb.rollbackApprover && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Approver</span>
              <span className="text-sm font-medium capitalize">{rb.rollbackApprover.replace(/_/g, " ")}</span>
            </div>
          )}
          {rb.shadowModeDuration && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Shadow Mode</span>
              <span className="text-sm font-medium">{rb.shadowModeDuration}</span>
            </div>
          )}
          {rb.canarySteps.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Canary Steps</span>
              <span className="text-sm font-medium">{rb.canarySteps.join("% → ")}%</span>
            </div>
          )}
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
                {rb.autoRollbackTriggers.map((trigger: any, i: number) => (
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

function AgentApiGateway({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [tryItInput, setTryItInput] = useState("");
  const [tryItResult, setTryItResult] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [tryItApiKey, setTryItApiKey] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const gatewayEndpoint = `${baseUrl}/api/gateway/v1/invoke/${agent.id}`;
  const agentInfoEndpoint = `${baseUrl}/api/gateway/v1/agents/${agent.id}`;

  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "api-keys"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/api-keys`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setTryItApiKey(data.key);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "api-keys"] });
      toast({ title: "API key created", description: "Copy the key now — it won't be shown again." });
    },
    onError: () => {
      toast({ title: "Failed to create API key", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/api/agents/${agent.id}/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "api-keys"] });
      toast({ title: "API key revoked" });
    },
  });

  const invokeMutation = useMutation({
    mutationFn: async ({ input, apiKey }: { input: string; apiKey: string }) => {
      const res = await fetch(`/api/gateway/v1/invoke/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ input }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTryItResult(data);
    },
    onError: () => {
      toast({ title: "Invocation failed", variant: "destructive" });
    },
  });

  const activeKeys = (apiKeys as any[]).filter((k: any) => k.isActive);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const curlExample = `curl -X POST "${gatewayEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"input": "Your prompt here"}'`;

  const jsExample = `const response = await fetch("${gatewayEndpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY",
  },
  body: JSON.stringify({ input: "Your prompt here" }),
});
const result = await response.json();
console.log(result.output);`;

  const pythonExample = `import requests

response = requests.post(
    "${gatewayEndpoint}",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "YOUR_API_KEY",
    },
    json={"input": "Your prompt here"},
)
result = response.json()
print(result["output"])`;

  return (
    <div className="flex flex-col gap-4">
      <Card data-testid="card-gateway-endpoint">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Globe className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">API Endpoint</CardTitle>
            <Badge variant={agent.status === "deployed" ? "default" : "secondary"} className="ml-auto text-[10px]">
              {agent.status === "deployed" ? "Live" : "Not Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {agent.status !== "deployed" && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md" data-testid="gateway-not-deployed-notice">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">This agent must be deployed before the API Gateway can be used. Deploy the agent through the Deployments pipeline first.</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Invoke Endpoint</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted/50 px-3 py-2 rounded-md overflow-x-auto" data-testid="text-gateway-url">
                POST {gatewayEndpoint}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(gatewayEndpoint)} data-testid="btn-copy-endpoint">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Agent Info Endpoint</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted/50 px-3 py-2 rounded-md overflow-x-auto">
                GET {agentInfoEndpoint}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(agentInfoEndpoint)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Request Body</span>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md">
{`{
  "input": "string (required)",
  "environment": "string (optional, default: production)",
  "metadata": "object (optional)"
}`}
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Authentication</span>
            <p className="text-xs text-muted-foreground">
              Include your API key via <code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">X-API-Key</code> header or <code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-api-keys">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
            <Badge variant="secondary" className="ml-auto text-[10px]">{activeKeys.length} active</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {createdKey && (
            <div className="flex flex-col gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md" data-testid="created-key-banner">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">API Key Created — Copy it now!</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono bg-white/80 dark:bg-black/40 px-2 py-1.5 rounded break-all" data-testid="text-created-key">{createdKey}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(createdKey)} data-testid="btn-copy-key">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="text-[11px] self-end" onClick={() => setCreatedKey(null)}>Dismiss</Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Key name (e.g., Production, CI/CD)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 h-8 text-xs"
              data-testid="input-key-name"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newKeyName.trim() || createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate(newKeyName.trim())}
              data-testid="btn-create-key"
            >
              {createKeyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Create Key
            </Button>
          </div>
          {keysLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : activeKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-keys">
              No API keys yet. Create one to start invoking this agent via API.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeKeys.map((k: any) => (
                <div key={k.id} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-md" data-testid={`api-key-${k.id}`}>
                  <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium block truncate">{k.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{k.keyPrefix}•••</span>
                  </div>
                  {k.lastUsedAt && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => revokeKeyMutation.mutate(k.id)}
                    data-testid={`btn-revoke-key-${k.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-try-it">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Terminal className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Try It</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">API Key</span>
            <Input
              type="password"
              placeholder="Paste your API key here (nous_...)"
              value={tryItApiKey}
              onChange={(e) => setTryItApiKey(e.target.value)}
              className="h-8 text-xs font-mono"
              data-testid="input-try-it-api-key"
            />
            {!tryItApiKey && (
              <p className="text-[10px] text-muted-foreground">
                Create an API key above and it will be auto-filled, or paste an existing key.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Input Prompt</span>
            <Textarea
              placeholder="Enter your input prompt..."
              value={tryItInput}
              onChange={(e) => setTryItInput(e.target.value)}
              className="min-h-[80px] text-xs font-mono"
              data-testid="textarea-try-it-input"
            />
          </div>
          <Button
            size="sm"
            className="self-end text-xs"
            disabled={!tryItInput.trim() || !tryItApiKey.trim() || invokeMutation.isPending || agent.status !== "deployed"}
            onClick={() => {
              invokeMutation.mutate({ input: tryItInput, apiKey: tryItApiKey });
            }}
            data-testid="btn-try-invoke"
          >
            {invokeMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Running...</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1" /> Invoke Agent</>
            )}
          </Button>
          {tryItResult && (
            <div className="flex flex-col gap-2 mt-2" data-testid="try-it-result">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">Response</span>
                {tryItResult.usage && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{tryItResult.usage.latencyMs}ms</span>
                    <span>${tryItResult.usage.costUsd?.toFixed(5)}</span>
                    <span>{tryItResult.usage.tokens?.total_tokens} tokens</span>
                  </div>
                )}
              </div>
              {tryItResult.error ? (
                <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-md">
                  {tryItResult.error}: {tryItResult.message}
                </div>
              ) : (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-xs whitespace-pre-wrap" data-testid="text-try-it-output">{tryItResult.output}</p>
                </div>
              )}
              {tryItResult.id && (
                <span className="text-[10px] text-muted-foreground">Trace ID: {tryItResult.id}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-code-examples">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Code className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Code Examples</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">cURL</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(curlExample)} data-testid="btn-copy-curl">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-curl">{curlExample}</pre>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">JavaScript / TypeScript</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(jsExample)} data-testid="btn-copy-js">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-js">{jsExample}</pre>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Python</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(pythonExample)} data-testid="btn-copy-python">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="code-python">{pythonExample}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const CHANNEL_TYPES = [
  { type: "slack", label: "Slack", icon: MessageSquare, color: "text-purple-500", bgColor: "bg-purple-500/10", description: "Publish your agent to Slack workspaces. Users can interact via direct messages or channels." },
  { type: "teams", label: "Microsoft Teams", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10", description: "Deploy as a Teams bot. Available in chats, channels, and meetings." },
  { type: "discord", label: "Discord", icon: MessageSquare, color: "text-indigo-500", bgColor: "bg-indigo-500/10", description: "Add your agent to Discord servers. Responds to commands and mentions." },
  { type: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-500", bgColor: "bg-green-500/10", description: "Connect via WhatsApp Business API for customer interactions." },
  { type: "email", label: "Email", icon: Globe, color: "text-orange-500", bgColor: "bg-orange-500/10", description: "Process incoming emails and auto-respond with agent intelligence." },
  { type: "web_widget", label: "Web Widget", icon: Code, color: "text-cyan-500", bgColor: "bg-cyan-500/10", description: "Embed a chat widget on any website. Copy the snippet to get started." },
] as const;

function AgentChannels({ agent }: { agent: any }) {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [configToken, setConfigToken] = useState("");

  const { data: channels = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/agents", agent.id, "channels"],
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: { channelType: string; name: string; config: any; botUsername: string }) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/channels`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      setConnectDialogOpen(false);
      setSelectedChannelType(null);
      setChannelName("");
      setBotUsername("");
      setConfigToken("");
      toast({ title: "Channel connected", description: "Your agent is now available on this channel." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to connect channel", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ channelId, data }: { channelId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/agents/${agent.id}/channels/${channelId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      toast({ title: "Channel updated" });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      await apiRequest("DELETE", `/api/agents/${agent.id}/channels/${channelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "channels"] });
      toast({ title: "Channel removed" });
    },
  });

  const testChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/channels/${channelId}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "Test successful" : "Test completed with issues", description: typeof data.response === "string" ? data.response.slice(0, 100) : "Response received" });
    },
    onError: () => {
      toast({ title: "Channel test failed", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const connectedTypes = new Set((channels as any[]).map((c: any) => c.channelType));

  const selectedMeta = CHANNEL_TYPES.find(ct => ct.type === selectedChannelType);

  const handleConnect = () => {
    if (!selectedChannelType || !channelName.trim()) return;
    const config: any = {};
    if (configToken.trim()) {
      config.botToken = configToken;
    }
    createChannelMutation.mutate({
      channelType: selectedChannelType,
      name: channelName.trim(),
      config,
      botUsername: botUsername.trim() || `${agent.name} Bot`,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {agent.status !== "deployed" && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md" data-testid="channels-not-deployed-notice">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">This agent must be deployed before publishing to channels. Deploy the agent through the Deployments pipeline first.</span>
        </div>
      )}

      <Card data-testid="card-channels-overview">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                <Radio className="w-3.5 h-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm font-medium">Channel Publishing</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{(channels as any[]).length} connected</Badge>
            </div>
            <Button
              size="sm"
              className="text-xs"
              disabled={agent.status !== "deployed"}
              onClick={() => setConnectDialogOpen(true)}
              data-testid="btn-add-channel"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Channel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (channels as any[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Radio className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No channels configured</p>
              <p className="text-xs mt-1">Publish your agent to messaging platforms like Slack, Teams, or Discord</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(channels as any[]).map((channel: any) => {
                const meta = CHANNEL_TYPES.find(ct => ct.type === channel.channelType);
                const Icon = meta?.icon || MessageSquare;
                const widgetToken = channel.channelType === "web_widget" && channel.webhookUrl
                  ? channel.webhookUrl.split("/").pop() || ""
                  : "";
                const embedSnippet = widgetToken
                  ? `<script src="${window.location.origin}/widget.js"\n  data-agent-channel="${widgetToken}"\n  data-title="${agent.name}"\n  data-theme="dark"\n  data-position="bottom-right"></script>`
                  : "";
                return (
                  <div key={channel.id} className="flex flex-col rounded-md border bg-card" data-testid={`channel-card-${channel.id}`}>
                    <div className="flex items-center gap-3 p-3">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-md ${meta?.bgColor || "bg-muted"} shrink-0`}>
                        <Icon className={`w-4 h-4 ${meta?.color || "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{channel.name}</span>
                          <Badge variant={channel.status === "connected" ? "default" : "secondary"} className="text-[10px]">
                            {channel.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{meta?.label || channel.channelType}</span>
                          <span className="text-[11px] text-muted-foreground">{channel.messageCount || 0} messages</span>
                          {channel.lastMessageAt && (
                            <span className="text-[11px] text-muted-foreground">Last: {new Date(channel.lastMessageAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => testChannelMutation.mutate(channel.id)}
                          disabled={testChannelMutation.isPending || channel.status !== "connected"}
                          data-testid={`btn-test-channel-${channel.id}`}
                        >
                          {testChannelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                          Test
                        </Button>
                        {channel.status === "connected" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => updateChannelMutation.mutate({ channelId: channel.id, data: { status: "paused" } })}
                            data-testid={`btn-pause-channel-${channel.id}`}
                          >
                            Pause
                          </Button>
                        ) : channel.status === "paused" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => updateChannelMutation.mutate({ channelId: channel.id, data: { status: "connected" } })}
                            data-testid={`btn-resume-channel-${channel.id}`}
                          >
                            Resume
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px]"
                          onClick={() => {
                            if (channel.webhookUrl) copyToClipboard(channel.webhookUrl);
                          }}
                          data-testid={`btn-copy-webhook-${channel.id}`}
                        >
                          <Copy className="w-3 h-3 mr-1" /> Webhook
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] text-destructive"
                          onClick={() => deleteChannelMutation.mutate(channel.id)}
                          data-testid={`btn-remove-channel-${channel.id}`}
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {channel.channelType === "web_widget" && embedSnippet && (
                      <div className="px-3 pb-3 border-t border-border/50 pt-2" data-testid={`widget-embed-${channel.id}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground">Embed Snippet — paste this into your website's HTML</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px] h-6"
                            onClick={() => copyToClipboard(embedSnippet)}
                            data-testid={`btn-copy-embed-${channel.id}`}
                          >
                            <Copy className="w-3 h-3 mr-1" /> Copy Snippet
                          </Button>
                        </div>
                        <pre className="text-[11px] font-mono bg-muted/30 p-3 rounded-md overflow-x-auto whitespace-pre select-all" data-testid={`code-embed-${channel.id}`}>{embedSnippet}</pre>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Add this script tag before the closing <code className="text-[10px] bg-muted/50 px-1 rounded">&lt;/body&gt;</code> tag. The widget will appear as a floating chat bubble. Customize with <code className="text-[10px] bg-muted/50 px-1 rounded">data-theme="light"</code> or <code className="text-[10px] bg-muted/50 px-1 rounded">data-position="bottom-left"</code>.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-available-channels">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
              <Globe className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Available Channels</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CHANNEL_TYPES.map((ct) => {
              const isConnected = connectedTypes.has(ct.type);
              const Icon = ct.icon;
              return (
                <div key={ct.type} className={`flex flex-col gap-2 p-3 rounded-md border ${isConnected ? "border-primary/30 bg-primary/5" : "bg-card"}`} data-testid={`available-channel-${ct.type}`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-md ${ct.bgColor} shrink-0`}>
                      <Icon className={`w-4 h-4 ${ct.color}`} />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{ct.label}</span>
                      {isConnected && <Badge variant="default" className="ml-2 text-[10px]">Connected</Badge>}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{ct.description}</p>
                  {!isConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs self-start mt-1"
                      disabled={agent.status !== "deployed"}
                      onClick={() => {
                        setSelectedChannelType(ct.type);
                        setChannelName(`${agent.name} — ${ct.label}`);
                        setBotUsername(`${agent.name} Bot`);
                        setConnectDialogOpen(true);
                      }}
                      data-testid={`btn-connect-${ct.type}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMeta && (
                <div className={`flex items-center justify-center w-7 h-7 rounded-md ${selectedMeta.bgColor}`}>
                  <selectedMeta.icon className={`w-3.5 h-3.5 ${selectedMeta.color}`} />
                </div>
              )}
              Connect {selectedMeta?.label || "Channel"}
            </DialogTitle>
            <DialogDescription>
              Configure the channel integration for your agent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {!selectedChannelType && (
              <div className="flex flex-col gap-2">
                <Label className="text-xs">Select Channel Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_TYPES.filter(ct => !connectedTypes.has(ct.type)).map((ct) => {
                    const Icon = ct.icon;
                    return (
                      <button
                        key={ct.type}
                        className={`flex items-center gap-2 p-2.5 rounded-md border text-left transition-colors hover:bg-muted/50 ${selectedChannelType === ct.type ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setSelectedChannelType(ct.type);
                          setChannelName(`${agent.name} — ${ct.label}`);
                          setBotUsername(`${agent.name} Bot`);
                        }}
                        data-testid={`select-channel-${ct.type}`}
                      >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${ct.bgColor} shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${ct.color}`} />
                        </div>
                        <span className="text-xs font-medium">{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-name" className="text-xs">Channel Name</Label>
              <Input
                id="channel-name"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g., Production Slack Bot"
                className="text-sm"
                data-testid="input-channel-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bot-username" className="text-xs">Bot Display Name</Label>
              <Input
                id="bot-username"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                placeholder="e.g., Weather Bot"
                className="text-sm"
                data-testid="input-bot-username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="config-token" className="text-xs">Bot Token / API Key (optional)</Label>
              <Input
                id="config-token"
                value={configToken}
                onChange={(e) => setConfigToken(e.target.value)}
                placeholder="Platform-specific bot token"
                className="text-sm font-mono"
                type="password"
                data-testid="input-config-token"
              />
              <p className="text-[10px] text-muted-foreground">
                {selectedChannelType === "slack" && "Enter your Slack Bot OAuth Token (xoxb-...)"}
                {selectedChannelType === "teams" && "Enter your Microsoft Bot Framework App Password"}
                {selectedChannelType === "discord" && "Enter your Discord Bot Token"}
                {selectedChannelType === "whatsapp" && "Enter your WhatsApp Business API Token"}
                {selectedChannelType === "email" && "Enter your email service API key (e.g., SendGrid)"}
                {selectedChannelType === "web_widget" && "No token needed — a webhook URL will be generated"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)} data-testid="btn-cancel-connect">Cancel</Button>
            <Button
              onClick={handleConnect}
              disabled={!selectedChannelType || !channelName.trim() || createChannelMutation.isPending}
              data-testid="btn-confirm-connect"
            >
              {createChannelMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Connecting...</> : <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Connect Channel</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
