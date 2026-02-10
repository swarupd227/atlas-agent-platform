import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Zap,
  Shield,
  ShieldAlert,
  RefreshCcw,
  Wrench,
  Brain,
  Users,
  ArrowUpRight,
  Target,
  Database,
  GitCompareArrows,
  Plug,
  CircleDot,
  Eye,
  Ban,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { StatusBadge } from "@/components/status-badge";
import { PolicyViolationDialog } from "@/components/policy-violation-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Agent, RunTrace, Approval } from "@shared/schema";

interface ToolConnector {
  name: string;
  status: string;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  lastSeen: string;
}

interface PolicyViolation {
  id: string;
  traceId: string;
  agentId: string;
  agentName: string;
  policyName: string;
  rule: string;
  severity: string;
  timestamp: string;
  action: string;
  blocked: boolean;
}

interface DriftSignal {
  id: string;
  agentId: string;
  agentName: string;
  suiteName: string;
  suiteType: string;
  metric: "pass_rate" | "avg_latency" | "hallucination";
  baseline: number;
  current: number;
  driftPercent: number;
  severity: string;
  status: string;
  detectedAt: string;
}

interface OutcomeImpact {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  overallStatus: "at_risk" | "on_track" | "needs_attention";
  weightedProgress: number;
  breachedKpis: number;
  totalKpis: number;
  maxDriftPercent: number;
  autoPause: boolean;
  pendingApprovals: number;
  kpis: Array<{
    id: string;
    name: string;
    unit: string;
    baseline: number;
    current: number;
    target: number;
    slaThreshold: number;
    attainment: number;
    breachStatus: "exceeded" | "healthy" | "breached";
    trend: string;
    weight: number;
    confidence?: number;
  }>;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    healthScore: number;
    successRate: number;
    avgLatencyMs: number;
    autonomyMode: string;
    recentFailures: number;
    costPerRun: number;
  }>;
}

function generateTimeSeriesData(days: number, baseValue: number, variance: number, trend: "up" | "down" | "stable" = "stable") {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const trendFactor = trend === "up" ? i * 0.5 : trend === "down" ? -i * 0.3 : 0;
    const value = Math.max(0, baseValue + trendFactor + (Math.random() - 0.5) * variance);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(value * 100) / 100,
    };
  });
}

export default function Monitor() {
  const [policyCheckResult, setPolicyCheckResult] = useState<{
    signal: DriftSignal;
    allowed: boolean;
    violations: Array<{ policyName: string; rule: string; severity: string; message: string }>;
    sandboxAvailable: boolean;
  } | null>(null);

  const [envFilter, setEnvFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toolFilter, setToolFilter] = useState("all");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/traces"],
  });
  const { data: driftSignals } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });
  const { data: impactData } = useQuery<OutcomeImpact[]>({
    queryKey: ["/api/monitor/impact"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: toolConnectors } = useQuery<ToolConnector[]>({
    queryKey: ["/api/monitor/tool-health"],
  });
  const { data: policyViolations } = useQuery<PolicyViolation[]>({
    queryKey: ["/api/monitor/policy-violations"],
  });

  const { toast } = useToast();

  const remediateMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      await apiRequest("POST", "/api/recommendations", {
        agentId: signal.agentId,
        source: "drift",
        type: signal.metric === "pass_rate" ? "retrain" : "workflow_optimization",
        title: `Auto-remediate: ${signal.agentName} ${signal.suiteName} ${signal.metric} drift`,
        description: `${signal.metric === "pass_rate" ? "Pass rate" : signal.metric === "hallucination" ? "Faithfulness" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}% (${signal.severity} severity). Baseline: ${signal.baseline}, Current: ${signal.current}.`,
        severity: signal.severity,
        status: "pending",
        impact: signal.metric === "pass_rate"
          ? `Restore pass rate from ${(signal.current * 100).toFixed(1)}% back to ${(signal.baseline * 100).toFixed(1)}% baseline`
          : signal.metric === "hallucination"
          ? `Restore faithfulness from ${(signal.current * 100).toFixed(1)}% back to ${(signal.baseline * 100).toFixed(1)}% baseline`
          : `Reduce latency from ${signal.current}ms back to ${signal.baseline}ms baseline`,
        suggestedChanges: {
          action: signal.metric === "pass_rate" ? "retrain" : "optimize_latency",
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          severity: signal.severity,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Remediation created", description: "An improvement recommendation has been created from this drift signal." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create remediation", description: err.message, variant: "destructive" });
    },
  });

  const policyCheckMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      const res = await apiRequest("POST", "/api/policy-check", {
        agentId: signal.agentId,
        actionType: signal.metric === "pass_rate" ? "retrain" : "workflow_optimization",
        changes: {
          action: signal.metric === "pass_rate" ? "retrain" : "optimize_latency",
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          severity: signal.severity,
        },
      });
      return res.json();
    },
  });

  const requestApprovalFromDriftMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      await apiRequest("POST", "/api/approvals", {
        type: "auto_patch",
        objectType: "drift_signal",
        objectId: signal.id,
        objectName: `Remediate: ${signal.agentName} ${signal.metric} drift`,
        riskScore: signal.severity === "critical" ? 0.9 : signal.severity === "high" ? 0.7 : 0.5,
        status: "pending",
        requestedBy: "system",
        description: `Policy guardrail blocked auto-remediation for ${signal.agentName}. ${signal.metric === "pass_rate" ? "Pass rate" : signal.metric === "hallucination" ? "Faithfulness" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}%. Requires expert validation.`,
        evidenceJson: {
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          driftPercent: signal.driftPercent,
          severity: signal.severity,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Approval requested", description: "This remediation has been escalated for expert review." });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request approval", description: err.message, variant: "destructive" });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (payload: { signal: DriftSignal; affectedOutcomes: string[] }) => {
      const { signal, affectedOutcomes } = payload;
      const riskScore = signal.severity === "critical" ? 0.95 : signal.severity === "high" ? 0.75 : signal.severity === "medium" ? 0.5 : 0.3;
      const metricLabel = signal.metric === "pass_rate" ? "pass_rate" : signal.metric === "hallucination" ? "hallucination" : "avg_latency";
      await apiRequest("POST", "/api/approvals", {
        type: "anomaly_review",
        objectType: "drift_signal",
        objectId: signal.id,
        objectName: `Anomaly Review: ${signal.agentName} ${metricLabel} drift`,
        riskScore,
        status: "pending",
        requestedBy: "monitoring_system",
        description: `Anomaly detected: ${metricLabel} drifted by ${signal.driftPercent}% for ${signal.agentName}. Requires expert root-cause analysis and remediation approval.`,
        evidenceJson: {
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          driftPercent: signal.driftPercent,
          severity: signal.severity,
          agentName: signal.agentName,
          suiteName: signal.suiteName,
          affectedOutcomes,
          suggestedRemediation: getRemediationSuggestion(signal),
          detectedAt: signal.detectedAt,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Escalated to expert", description: "An anomaly review approval has been created for expert analysis." });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to escalate", description: err.message, variant: "destructive" });
    },
  });

  function handleRemediate(signal: DriftSignal) {
    policyCheckMutation.mutate(signal, {
      onSuccess: (result: any) => {
        if (result.allowed) {
          remediateMutation.mutate(signal);
        } else {
          setPolicyCheckResult({ signal, ...result });
        }
      },
    });
  }

  function getRemediationSuggestion(signal: DriftSignal): string {
    if (signal.metric === "pass_rate") {
      if (signal.severity === "critical") {
        return "Suggested: Rollback to previous version or retrain on recent data";
      }
      return "Suggested: Review failing test cases and adjust configuration";
    }
    if (signal.metric === "avg_latency") {
      if (signal.severity === "critical") {
        return "Suggested: Scale resources or optimize workflow pipeline";
      }
      return "Suggested: Enable response caching or reduce token budget";
    }
    if (signal.metric === "hallucination") {
      if (signal.severity === "critical") {
        return "Suggested: Switch to grounded model or add retrieval-augmented generation";
      }
      return "Suggested: Tighten system prompt constraints and add factual guardrails";
    }
    return "Suggested: Investigate root cause and update agent configuration";
  }

  function getMetricLabel(metric: string): string {
    if (metric === "pass_rate") return "Pass rate";
    if (metric === "hallucination") return "Faithfulness";
    return "Avg latency";
  }

  function getAffectedOutcomes(agentId: string): OutcomeImpact[] {
    if (!impactData) return [];
    return impactData.filter(outcome =>
      outcome.agents.some(a => a.id === agentId)
    );
  }

  function isEscalated(signalId: string): boolean {
    if (!approvals) return false;
    return approvals.some(
      a => a.objectId === signalId && a.type === "anomaly_review" && a.status === "pending"
    );
  }

  function generateTraceEvents(trace: RunTrace) {
    const events: Array<{ type: string; label: string; detail: string; timestamp: string }> = [];
    const startTime = trace.startedAt ? new Date(trace.startedAt) : new Date();

    events.push({
      type: "run_started",
      label: "Run Started",
      detail: `Environment: ${trace.environment} | Model: ${trace.modelId || "default"} | Input: ${trace.inputSummary || "N/A"}`,
      timestamp: startTime.toLocaleTimeString(),
    });

    const tools = (trace.toolCalls as any[] | null) || [];
    tools.forEach((tc: any, i: number) => {
      const t = new Date(startTime.getTime() + (i + 1) * 150);
      events.push({
        type: "tool_called",
        label: `Tool: ${tc.tool || tc.name || tc.type || "unknown"}`,
        detail: `Args: ${JSON.stringify(tc.args || tc.input || {}).slice(0, 100)} | Status: ${tc.status || "ok"}`,
        timestamp: t.toLocaleTimeString(),
      });
    });

    const policyResults = (trace.policyChecks as any[] | null) || [];
    policyResults.forEach((pc: any) => {
      events.push({
        type: pc.blocked ? "policy_blocked" : "policy_passed",
        label: pc.blocked ? "Policy Blocked" : "Policy Passed",
        detail: `Policy: ${pc.policyName || pc.name || "unknown"} | Rule: ${pc.rule || "N/A"}`,
        timestamp: startTime.toLocaleTimeString(),
      });
    });

    events.push({
      type: "run_completed",
      label: trace.status === "completed" ? "Run Completed" : trace.status === "failed" ? "Run Failed" : "Run Blocked",
      detail: `Latency: ${trace.latencyMs}ms | Cost: $${(trace.costUsd || 0).toFixed(4)} | Output: ${(trace.outputSummary || "N/A").slice(0, 80)}`,
      timestamp: trace.endedAt ? new Date(trace.endedAt).toLocaleTimeString() : "\u2014",
    });

    return events;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const allTraces = traces || [];
  const successfulRuns = allTraces.filter((t) => t.status === "completed").length;
  const failedRuns = allTraces.filter((t) => t.status === "failed").length;
  const totalRuns = allTraces.length;
  const successRate = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : "0";
  const avgLatency = totalRuns > 0
    ? Math.round(allTraces.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / totalRuns)
    : 0;
  const totalCost = allTraces.reduce((sum, t) => sum + (t.costUsd || 0), 0);
  const policyViolationCount = allTraces.filter((t) => t.status === "blocked").length;

  const customerImpactCount = impactData
    ? impactData.filter(o => o.breachedKpis > 0).length
    : 0;

  const filteredTraces = allTraces.filter(t => {
    if (envFilter !== "all" && t.environment !== envFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (toolFilter !== "all") {
      const tools = t.toolCalls as any[] | null;
      if (!tools || !tools.some((tc: any) => tc.type === toolFilter || tc.tool === toolFilter)) return false;
    }
    return true;
  });

  const overallStatusColors: Record<string, string> = {
    at_risk: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    on_track: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    needs_attention: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  };

  const overallStatusLabels: Record<string, string> = {
    at_risk: "At Risk",
    on_track: "On Track",
    needs_attention: "Needs Attention",
  };

  const chartDefinitions = [
    { id: "success-rate", title: "Success Rate", currentValue: `${successRate}%`, color: "#10b981", type: "area" as const, data: generateTimeSeriesData(7, 95, 3, "stable") },
    { id: "p95-latency", title: "P95 Latency", currentValue: `${avgLatency || 800}ms`, color: "#3b82f6", type: "line" as const, data: generateTimeSeriesData(7, 800, 200, "stable") },
    { id: "cost-per-run", title: "Cost per Run", currentValue: `$0.12`, color: "#8b5cf6", type: "bar" as const, data: generateTimeSeriesData(7, 0.12, 0.05) },
    { id: "policy-violations", title: "Policy Violations", currentValue: `${policyViolationCount}`, color: "#ef4444", type: "area" as const, data: generateTimeSeriesData(7, 3, 2) },
    { id: "drift-score", title: "Hallucination/Drift Score", currentValue: "92%", color: "#f59e0b", type: "line" as const, data: generateTimeSeriesData(7, 92, 5, "down") },
    { id: "kpi-confidence", title: "KPI Confidence", currentValue: "87%", color: "#10b981", type: "area" as const, data: generateTimeSeriesData(7, 87, 8, "up") },
  ];

  const changeSignals = (() => {
    const signals: Array<{
      icon: any;
      iconColor: string;
      title: string;
      category: string;
      description: string;
      actions: Array<{ label: string; icon?: any }>;
    }> = [];

    const degradedDrift = driftSignals?.filter(s => s.status === "degraded") || [];

    if (degradedDrift.some(s => s.metric === "pass_rate" && s.severity === "critical")) {
      signals.push({
        icon: Brain,
        iconColor: "text-red-500",
        title: "Model Performance Regression",
        category: "Model Version",
        description: "Critical pass rate drop detected across eval suites \u2014 possible model version change or training data drift",
        actions: [
          { label: "Run Targeted Eval", icon: Zap },
          { label: "Compare Versions", icon: GitCompareArrows },
        ],
      });
    }

    if (degradedDrift.some(s => s.metric === "avg_latency" && Math.abs(s.driftPercent) > 30)) {
      signals.push({
        icon: Wrench,
        iconColor: "text-amber-500",
        title: "Tool Schema / API Change",
        category: "Tool Drift",
        description: "Significant latency shift detected \u2014 possible tool schema change, API version update, or upstream dependency modification",
        actions: [
          { label: "Check Tool Health", icon: Wrench },
          { label: "View Error Rates" },
        ],
      });
    }

    if (degradedDrift.some(s => s.metric === "hallucination")) {
      signals.push({
        icon: Database,
        iconColor: "text-violet-500",
        title: "Knowledge Base Freshness Drop",
        category: "Knowledge Drift",
        description: "Hallucination/faithfulness scores degraded \u2014 knowledge base may be stale, missing coverage, or failing citations",
        actions: [
          { label: "Patch Retrieval Settings", icon: RefreshCcw },
          { label: "Re-index Knowledge Base", icon: Database },
        ],
      });
    }

    if (degradedDrift.length > 3) {
      signals.push({
        icon: BarChart3,
        iconColor: "text-blue-500",
        title: "Input Distribution Shift",
        category: "Input Drift",
        description: `${degradedDrift.length} degradation signals across multiple agents \u2014 possible shift in input patterns or user segments`,
        actions: [
          { label: "Analyze Distribution", icon: BarChart3 },
          { label: "Re-train / Re-index", icon: RefreshCcw },
        ],
      });
    }

    return signals;
  })();

  const autonomyActions = (() => {
    const criticalDrift = driftSignals?.filter(s => s.severity === "critical" && s.status === "degraded") || [];
    const highDrift = driftSignals?.filter(s => (s.severity === "critical" || s.severity === "high") && s.status === "degraded") || [];

    return [
      {
        icon: AlertTriangle,
        title: "Auto-Create Incident",
        description: criticalDrift.length > 0
          ? `${criticalDrift.length} critical threshold violations detected \u2014 incidents auto-created for affected agents`
          : "Monitors SLO thresholds and auto-creates incidents when violated",
        triggered: criticalDrift.length > 0,
      },
      {
        icon: RefreshCcw,
        title: "Auto-Start Replay + Eval",
        description: highDrift.length > 0
          ? `Shadow replay initiated for ${highDrift.length} agents to isolate regression source`
          : "Automatically replays recent traces against current version to detect behavioral divergence",
        triggered: highDrift.length > 0,
      },
      {
        icon: ShieldAlert,
        title: "Auto-Suggest Rollback",
        description: criticalDrift.length > 0
          ? `Rollback recommended for ${criticalDrift.length} agents with critical degradation \u2014 evidence bundle prepared`
          : "Prepares rollback evidence bundles when critical regressions are confirmed",
        triggered: criticalDrift.length > 0,
      },
    ];
  })();

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-monitor">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Continuous monitoring, outcome assurance & drift detection
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-refresh-monitor">
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Success Rate" value={`${successRate}%`} icon={CheckCircle} variant="success" trend="up" trendValue="0.3%" testId="stat-success-rate" />
        <StatCard title="Avg Latency" value={`${avgLatency}ms`} icon={Clock} variant="default" trend="down" trendValue="12ms" testId="stat-avg-latency" />
        <StatCard title="Total Cost" value={`$${totalCost.toFixed(2)}`} icon={BarChart3} variant="default" testId="stat-total-cost" />
        <StatCard title="Policy Violations" value={policyViolationCount} icon={Shield} variant={policyViolationCount > 0 ? "danger" : "success"} testId="stat-policy-violations" />
        <StatCard title="Customer Impact" value={customerImpactCount} icon={Users} variant={customerImpactCount > 0 ? "warning" : "success"} subtitle="outcomes with breached KPIs" testId="stat-customer-impact" />
      </div>

      <OutcomeKpiStrip compact />

      <Tabs defaultValue="outcome-sla" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="outcome-sla" data-testid="tab-outcome-sla">Outcome SLA Dashboard</TabsTrigger>
          <TabsTrigger value="slo-heatmap" data-testid="tab-slo-heatmap">SLO Heatmap</TabsTrigger>
          <TabsTrigger value="violations" data-testid="tab-violations">Policy Violations</TabsTrigger>
          <TabsTrigger value="tool-health" data-testid="tab-tool-health">Tool Health</TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">Live Runs</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift Detection</TabsTrigger>
          <TabsTrigger value="agent-health" data-testid="tab-agent-health">Agent Health</TabsTrigger>
        </TabsList>

        <TabsContent value="outcome-sla" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {chartDefinitions.map((chart) => (
                <Card key={chart.id} data-testid={`chart-${chart.id}`}>
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium">{chart.title}</span>
                      <span className="text-lg font-semibold">{chart.currentValue}</span>
                    </div>
                    <div className="h-[120px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {chart.type === "area" ? (
                          <AreaChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Area type="monotone" dataKey="value" stroke={chart.color} fill={chart.color} fillOpacity={0.15} strokeWidth={2} />
                          </AreaChart>
                        ) : chart.type === "line" ? (
                          <LineChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={2} dot={false} />
                          </LineChart>
                        ) : (
                          <BarChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Bar dataKey="value" fill={chart.color} radius={[2, 2, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {impactData?.map((outcome) => (
                <Card key={outcome.id} data-testid={`outcome-sla-card-${outcome.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{outcome.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium border ${overallStatusColors[outcome.overallStatus] || ""}`}
                        >
                          {overallStatusLabels[outcome.overallStatus] || outcome.overallStatus}
                        </Badge>
                        <StatusBadge status={outcome.riskTier} />
                        <span className="text-xs font-semibold text-muted-foreground">{outcome.weightedProgress.toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {outcome.kpis.map((kpi) => {
                        const progressPercent = kpi.target > 0 ? Math.min(100, (kpi.current / kpi.target) * 100) : 0;
                        const slaPercent = kpi.target > 0 ? Math.min(100, (kpi.slaThreshold / kpi.target) * 100) : 0;

                        return (
                          <div key={kpi.id} className="flex flex-col gap-1 p-2 rounded-md bg-muted/30" data-testid={`kpi-row-${kpi.id}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-medium">{kpi.name} <span className="text-muted-foreground">({kpi.unit})</span></span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">{kpi.current} / {kpi.target}</span>
                                <Badge
                                  variant={kpi.breachStatus === "breached" ? "destructive" : "outline"}
                                  className={`text-[9px] ${kpi.breachStatus === "exceeded" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""}`}
                                  data-testid={`badge-breach-${kpi.id}`}
                                >
                                  {kpi.breachStatus}
                                </Badge>
                                <span className="text-[9px] text-muted-foreground" title="KPI delivery confidence" data-testid={`kpi-confidence-${kpi.id}`}>
                                  {Math.round((kpi as any).confidence ?? 85)}% conf
                                </span>
                              </div>
                            </div>
                            <div className="relative">
                              <Progress value={progressPercent} className="h-1.5" />
                              {slaPercent > 0 && slaPercent <= 100 && (
                                <div
                                  className="absolute top-0 h-full w-[2px] bg-foreground/40"
                                  style={{ left: `${slaPercent}%` }}
                                  title={`SLA Threshold: ${kpi.slaThreshold}`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {outcome.agents.map((agent) => (
                          <Badge key={agent.id} variant="outline" className="text-[9px] gap-1">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${agent.recentFailures > 2 || agent.healthScore < 60 ? "bg-red-500" : "bg-emerald-500"}`} />
                            {agent.name}
                          </Badge>
                        ))}
                      </div>
                      <a
                        href={`/outcomes/${outcome.id}`}
                        className="text-[10px] text-muted-foreground hover:underline flex items-center gap-0.5"
                        data-testid={`link-outcome-${outcome.id}`}
                      >
                        Details <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!impactData || impactData.length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center col-span-2">No outcome data available</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="slo-heatmap" className="mt-0">
          <Card data-testid="slo-heatmap-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm font-medium">SLO Heatmap by Agent</CardTitle>
                <span className="text-[10px] text-muted-foreground">Click any agent row for deep view</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="slo-heatmap-table">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Agent</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Success Rate</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">P95 Latency</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Health Score</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Cost / Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents?.map((agent) => {
                      const sr = (agent.successRate || 0) * 100;
                      const lat = agent.avgLatencyMs || 0;
                      const hs = agent.healthScore || 0;
                      const cpr = agent.costPerRun || 0;

                      const srColor = sr >= 95 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : sr >= 85 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const latColor = lat <= 500 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : lat <= 1500 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const hsColor = hs >= 80 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : hs >= 60 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const cprColor = cpr <= 0.10 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : cpr <= 0.30 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";

                      return (
                        <tr
                          key={agent.id}
                          className="border-b last:border-b-0 cursor-pointer hover-elevate"
                          onClick={() => setSelectedAgentId(agent.id)}
                          data-testid={`heatmap-row-${agent.id}`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                <Activity className="w-3 h-3 text-primary" />
                              </div>
                              <span className="font-medium">{agent.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <StatusBadge status={agent.status} />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${srColor}`}>
                              {sr.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${latColor}`}>
                              {lat}ms
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${hsColor}`}>
                              {hs}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${cprColor}`}>
                              ${cpr.toFixed(3)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!agents || agents.length === 0) && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No agents available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="violations" className="mt-0">
          <Card data-testid="policy-violation-stream">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Policy Violation Stream</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {policyViolations?.length || 0} violations
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {policyViolations && policyViolations.length > 0 ? (
                policyViolations.map((v) => {
                  const severityColors: Record<string, string> = {
                    critical: "bg-red-500/10 border-red-500/20",
                    high: "bg-amber-500/10 border-amber-500/20",
                    medium: "bg-blue-500/10 border-blue-500/20",
                    low: "bg-muted/30 border-transparent",
                  };
                  const severityIconColors: Record<string, string> = {
                    critical: "text-red-500",
                    high: "text-amber-500",
                    medium: "text-blue-500",
                    low: "text-muted-foreground",
                  };
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(v.timestamp).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    const hours = Math.floor(mins / 60);
                    if (hours < 24) return `${hours}h ago`;
                    return `${Math.floor(hours / 24)}d ago`;
                  })();

                  return (
                    <div
                      key={v.id}
                      className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[v.severity] || "bg-muted/30"}`}
                      data-testid={`violation-${v.id}`}
                    >
                      {v.blocked ? (
                        <Ban className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[v.severity] || "text-muted-foreground"}`} />
                      ) : (
                        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[v.severity] || "text-muted-foreground"}`} />
                      )}
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{v.agentName}</span>
                          <Badge variant="outline" className="text-[9px]">{v.policyName}</Badge>
                          <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{v.severity}</Badge>
                          {v.blocked && <Badge variant="destructive" className="text-[9px]">Blocked</Badge>}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{v.rule}</span>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                            <Badge variant="outline" className="text-[9px]">{v.action}</Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px]"
                            onClick={() => {
                              setExpandedTraceId(v.traceId);
                              const tabEl = document.querySelector('[value="live"]') as HTMLElement;
                              tabEl?.click();
                            }}
                            data-testid={`button-view-trace-${v.id}`}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Trace {v.traceId.slice(0, 8)}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">No policy violations detected</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tool-health" className="mt-0">
          <Card data-testid="tool-connector-health">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Tool Connector Health</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {toolConnectors?.filter(c => c.status === "healthy").length || 0}/{toolConnectors?.length || 0} healthy
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {toolConnectors?.map((connector) => {
                  const statusColor = connector.status === "healthy"
                    ? "bg-emerald-500"
                    : connector.status === "degraded"
                      ? "bg-amber-500"
                      : "bg-red-500";
                  const statusBgColor = connector.status === "healthy"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : connector.status === "degraded"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-red-500/5 border-red-500/20";
                  const toolLabel = connector.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                  const toolIcon = connector.name === "llm_call" ? Brain
                    : connector.name === "retrieval" ? Database
                    : connector.name === "api_call" ? Plug
                    : connector.name === "code_exec" ? Zap
                    : connector.name === "database" ? Database
                    : Wrench;
                  const ToolIcon = toolIcon;

                  return (
                    <div
                      key={connector.name}
                      className={`flex flex-col gap-3 p-4 rounded-md border ${statusBgColor}`}
                      data-testid={`tool-connector-${connector.name}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <ToolIcon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-medium">{toolLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                          <span className="text-[10px] text-muted-foreground capitalize">{connector.status}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Calls</span>
                          <span className="text-sm font-semibold">{connector.totalCalls}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Error Rate</span>
                          <span className={`text-sm font-semibold ${connector.errorRate > 10 ? "text-red-600 dark:text-red-400" : connector.errorRate > 5 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {connector.errorRate}%
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                          <span className="text-sm font-semibold">{connector.avgLatencyMs}ms</span>
                        </div>
                      </div>
                      {connector.errorCount > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-dashed">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] text-muted-foreground">{connector.errorCount} errors in last 7 days</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!toolConnectors || toolConnectors.length === 0) && (
                  <p className="text-sm text-muted-foreground py-8 text-center col-span-3">No tool connector data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Run Stream</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b mb-3">
                <Select value={envFilter} onValueChange={setEnvFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-env-filter">
                    <SelectValue placeholder="Environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Environments</SelectItem>
                    <SelectItem value="prod">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="pilot">Pilot</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={toolFilter} onValueChange={setToolFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-tool-filter">
                    <SelectValue placeholder="Tool" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tools</SelectItem>
                    <SelectItem value="llm_call">LLM Call</SelectItem>
                    <SelectItem value="retrieval">Retrieval</SelectItem>
                    <SelectItem value="api_call">API Call</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-filtered-count">
                  {filteredTraces.length} runs
                </Badge>
              </div>
              {filteredTraces.slice(0, 20).map((trace) => (
                <div key={trace.id}>
                  <div
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 hover-elevate cursor-pointer ${expandedTraceId === trace.id ? "ring-1 ring-primary/30" : ""}`}
                    onClick={() => setExpandedTraceId(expandedTraceId === trace.id ? null : trace.id)}
                    data-testid={`live-trace-${trace.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-2 h-2 rounded-full shrink-0 ${trace.status === "completed" ? "bg-emerald-500" : trace.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{trace.inputSummary || "Run execution"}</span>
                        <span className="text-[11px] text-muted-foreground">{trace.environment} | {trace.latencyMs}ms | ${trace.costUsd?.toFixed(4)}</span>
                      </div>
                    </div>
                    <StatusBadge status={trace.status} />
                  </div>
                  {expandedTraceId === trace.id && (
                    <div className="ml-4 mt-1 mb-2 p-3 rounded-md border bg-muted/10 flex flex-col gap-2" data-testid={`flight-recorder-${trace.id}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">Flight Recorder</Badge>
                          <span className="text-[10px] text-muted-foreground">Trace: {trace.id.slice(0, 8)}...</span>
                        </div>
                        <Link href={`/runtime/runs/${trace.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-run-${trace.id}`}>
                            <Eye className="w-3 h-3 mr-1" />
                            Run Details
                          </Button>
                        </Link>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {generateTraceEvents(trace).map((event, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-muted/20" data-testid={`trace-event-${idx}`}>
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${event.type === "run_started" ? "bg-blue-500" : event.type === "tool_called" ? "bg-violet-500" : event.type === "policy_blocked" ? "bg-red-500" : "bg-emerald-500"}`} />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-medium">{event.label}</span>
                                <span className="text-[10px] text-muted-foreground">{event.timestamp}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{event.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filteredTraces.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No runs recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift" className="mt-0">
          <div className="flex flex-col gap-4">
            <Card data-testid="what-changed-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">What Changed?</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{changeSignals.length} changes</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {changeSignals.map((change, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`change-signal-${idx}`}>
                    <change.icon className={`w-4 h-4 shrink-0 mt-0.5 ${change.iconColor}`} />
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{change.title}</span>
                        <Badge variant="outline" className="text-[9px]">{change.category}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{change.description}</span>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {change.actions.map((action, aidx) => (
                          <Button key={aidx} variant="outline" size="sm" data-testid={`button-change-action-${idx}-${aidx}`}>
                            {action.icon && <action.icon className="w-3 h-3 mr-1" />}
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {changeSignals.length === 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">No recent changes detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Drift & Change Detection</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {driftSignals?.length || 0} signals detected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {driftSignals && driftSignals.length > 0 && (
                  <div className="flex items-center gap-4 px-1 flex-wrap" data-testid="drift-summary">
                    <span className="text-xs text-muted-foreground">
                      {driftSignals.filter(s => s.status === "degraded").length} degraded
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {driftSignals.filter(s => s.status === "improved").length} improved
                    </span>
                  </div>
                )}
                {!driftSignals || driftSignals.length === 0 ? (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium">All Clear</span>
                      <span className="text-[11px] text-muted-foreground">No significant drift detected across all eval suites</span>
                    </div>
                  </div>
                ) : (
                  driftSignals.map((signal: DriftSignal) => {
                    const isImproved = signal.status === "improved";
                    const isDegraded = signal.status === "degraded";
                    const severityColors: Record<string, string> = {
                      critical: "bg-red-500/5 border-red-500/20",
                      high: "bg-amber-500/5 border-amber-500/20",
                      medium: "bg-blue-500/5 border-blue-500/20",
                      low: "bg-emerald-500/5 border-emerald-500/20",
                    };
                    const severityIconColors: Record<string, string> = {
                      critical: "text-red-500",
                      high: "text-amber-500",
                      medium: "text-blue-500",
                      low: "text-emerald-500",
                    };
                    const affected = getAffectedOutcomes(signal.agentId);
                    const alreadyEscalated = isEscalated(signal.id);

                    const SignalIcon = signal.metric === "hallucination"
                      ? Brain
                      : (signal.severity === "critical" || signal.severity === "high")
                        ? AlertTriangle
                        : isImproved
                          ? TrendingUp
                          : Activity;

                    const signalIconColor = signal.metric === "hallucination"
                      ? (severityIconColors[signal.severity] || "text-muted-foreground")
                      : isImproved
                        ? "text-emerald-500"
                        : (severityIconColors[signal.severity] || "text-muted-foreground");

                    return (
                      <div key={signal.id} className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[signal.severity] || ""}`} data-testid={`drift-signal-${signal.id}`}>
                        <SignalIcon className={`w-4 h-4 shrink-0 mt-0.5 ${signalIconColor}`} />
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{signal.agentName}</span>
                            <Badge variant="outline" className="text-[9px]">{signal.suiteName}</Badge>
                            <Badge variant={signal.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{signal.severity}</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {getMetricLabel(signal.metric)} {isImproved ? "improved" : "degraded"} by{" "}
                            <span className="font-medium">{Math.abs(signal.driftPercent)}%</span>
                            {" "}(baseline: {signal.metric === "avg_latency" ? `${signal.baseline}ms` : `${(signal.baseline * 100).toFixed(1)}%`}
                            {" "}&rarr; current: {signal.metric === "avg_latency" ? `${signal.current}ms` : `${(signal.current * 100).toFixed(1)}%`})
                          </span>
                          <span className="text-[10px] text-muted-foreground">Detected: {new Date(signal.detectedAt).toLocaleString()}</span>

                          {isDegraded && affected.length > 0 && (
                            <div className="flex flex-col gap-1 mt-1 p-2 rounded-md bg-muted/30" data-testid={`drift-impact-${signal.id}`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Users className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] font-medium text-muted-foreground">Customer Impact</span>
                              </div>
                              {affected.map(o => (
                                <div key={o.id} className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px]">{o.name}</span>
                                  {o.breachedKpis > 0 && (
                                    <Badge variant="outline" className="text-[9px] text-red-600 dark:text-red-400">{o.breachedKpis} KPI{o.breachedKpis > 1 ? "s" : ""} breached</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {isDegraded && (
                            <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-dashed flex-wrap" data-testid={`drift-remediation-${signal.id}`}>
                              <span className="text-[10px] text-muted-foreground">
                                {getRemediationSuggestion(signal)}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemediate(signal)}
                                  disabled={remediateMutation.isPending || policyCheckMutation.isPending || requestApprovalFromDriftMutation.isPending}
                                  data-testid={`button-remediate-${signal.id}`}
                                >
                                  <Wrench className="w-3 h-3 mr-1" />
                                  Remediate
                                </Button>
                                {alreadyEscalated ? (
                                  <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid={`badge-escalated-${signal.id}`}>
                                    Escalated
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const affectedNames = affected.map(o => o.name);
                                      escalateMutation.mutate({ signal, affectedOutcomes: affectedNames });
                                    }}
                                    disabled={escalateMutation.isPending}
                                    data-testid={`button-escalate-${signal.id}`}
                                  >
                                    <ArrowUpRight className="w-3 h-3 mr-1" />
                                    Escalate
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card data-testid="autonomy-hooks-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Autonomy Hooks</CardTitle>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {autonomyActions.map((action, idx) => (
                  <div key={idx} className={`flex items-start gap-3 p-2.5 rounded-md border ${action.triggered ? "bg-amber-500/5 border-amber-500/20" : "bg-muted/20 border-transparent"}`} data-testid={`autonomy-action-${idx}`}>
                    <action.icon className={`w-4 h-4 shrink-0 mt-0.5 ${action.triggered ? "text-amber-500" : "text-muted-foreground"}`} />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{action.title}</span>
                        <Badge variant={action.triggered ? "default" : "outline"} className="text-[9px]">
                          {action.triggered ? "Triggered" : "Standby"}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{action.description}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agent-health" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents?.map((agent) => (
              <Card key={agent.id} className="cursor-pointer hover-elevate" onClick={() => setSelectedAgentId(agent.id)} data-testid={`sla-card-${agent.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Activity className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success</span>
                      <span className="text-sm font-semibold">{((agent.successRate || 0) * 100).toFixed(1)}%</span>
                      <Progress value={(agent.successRate || 0) * 100} className="h-1" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">P95 Latency</span>
                      <span className="text-sm font-semibold">{agent.avgLatencyMs}ms</span>
                      <Progress value={Math.max(0, 100 - ((agent.avgLatencyMs || 0) / 50))} className="h-1" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health</span>
                      <span className="text-sm font-semibold">{agent.healthScore}%</span>
                      <Progress value={agent.healthScore || 0} className="h-1" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost/Run</span>
                      <span className="text-sm font-semibold">${(agent.costPerRun || 0.08).toFixed(3)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <PolicyViolationDialog
        open={policyCheckResult !== null}
        onClose={() => setPolicyCheckResult(null)}
        violations={policyCheckResult?.violations || []}
        sandboxAvailable={policyCheckResult?.sandboxAvailable}
        onRequestApproval={() => {
          if (policyCheckResult) {
            requestApprovalFromDriftMutation.mutate(policyCheckResult.signal);
          }
        }}
        requestApprovalPending={requestApprovalFromDriftMutation.isPending}
        testIdPrefix="monitor-policy"
      />

      <Dialog open={selectedAgentId !== null} onOpenChange={() => setSelectedAgentId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="agent-deep-view-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Agent Monitor Deep View
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const agent = agents?.find(a => a.id === selectedAgentId);
            if (!agent) return <p className="text-sm text-muted-foreground">Agent not found</p>;

            const agentTraces = allTraces.filter(t => t.agentId === agent.id).slice(0, 10);
            const agentDrift = driftSignals?.filter(s => s.agentId === agent.id) || [];
            const agentViolations = policyViolations?.filter(v => v.agentId === agent.id) || [];
            const agentOutcomes = getAffectedOutcomes(agent.id);
            const sr = (agent.successRate || 0) * 100;
            const hs = agent.healthScore || 0;

            const rootCauses: Array<{ category: string; icon: any; iconColor: string; description: string; confidence: number }> = [];
            const passDrift = agentDrift.filter(s => s.metric === "pass_rate" && s.status === "degraded");
            const latDrift = agentDrift.filter(s => s.metric === "avg_latency" && s.status === "degraded");
            const hallDrift = agentDrift.filter(s => s.metric === "hallucination" && s.status === "degraded");

            if (passDrift.length > 0) {
              rootCauses.push({
                category: "Model Drift",
                icon: Brain,
                iconColor: "text-red-500",
                description: `Pass rate degraded by ${passDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")} across ${passDrift.length} suite(s). Likely cause: model version change or training data shift.`,
                confidence: passDrift.some(s => s.severity === "critical") ? 92 : 75,
              });
            }
            if (latDrift.length > 0) {
              rootCauses.push({
                category: "Tool Errors",
                icon: Wrench,
                iconColor: "text-amber-500",
                description: `Latency spiked by ${latDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")}. Likely cause: upstream API degradation or tool schema changes.`,
                confidence: latDrift.some(s => Math.abs(s.driftPercent) > 30) ? 85 : 65,
              });
            }
            if (hallDrift.length > 0) {
              rootCauses.push({
                category: "Knowledge Staleness",
                icon: Database,
                iconColor: "text-violet-500",
                description: `Faithfulness scores dropped by ${hallDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")}. Likely cause: knowledge base is stale or missing recent data.`,
                confidence: hallDrift.some(s => s.severity === "critical") ? 88 : 70,
              });
            }
            if (rootCauses.length === 0) {
              rootCauses.push({
                category: "No Issues",
                icon: CheckCircle,
                iconColor: "text-emerald-500",
                description: "No significant degradation detected. All metrics within acceptable thresholds.",
                confidence: 95,
              });
            }

            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{agent.name}</span>
                    <span className="text-[11px] text-muted-foreground">v{agent.currentVersion} | {agent.environment} | {agent.modelName}</span>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</span>
                    <span className={`text-lg font-bold ${sr >= 95 ? "text-emerald-600 dark:text-emerald-400" : sr >= 85 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{sr.toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Score</span>
                    <span className={`text-lg font-bold ${hs >= 80 ? "text-emerald-600 dark:text-emerald-400" : hs >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{hs}%</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                    <span className="text-lg font-bold">{agent.avgLatencyMs}ms</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
                    <span className="text-lg font-bold">${(agent.costPerRun || 0).toFixed(3)}</span>
                  </div>
                </div>

                {agentOutcomes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> KPI Impact Estimate</span>
                    {agentOutcomes.map(outcome => (
                      <div key={outcome.id} className="p-2.5 rounded-md bg-muted/30 flex flex-col gap-1.5" data-testid={`deep-view-outcome-${outcome.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{outcome.name}</span>
                          <Badge variant="outline" className={`text-[9px] ${outcome.overallStatus === "at_risk" ? "text-red-600 dark:text-red-400" : outcome.overallStatus === "on_track" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {outcome.overallStatus === "at_risk" ? "At Risk" : outcome.overallStatus === "on_track" ? "On Track" : "Needs Attention"}
                          </Badge>
                        </div>
                        {outcome.kpis.slice(0, 3).map(kpi => (
                          <div key={kpi.id} className="flex items-center justify-between gap-2 px-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{kpi.name}</span>
                            <span className="text-[10px]">{kpi.current}/{kpi.target} {kpi.unit}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Root Cause Suggestions</span>
                  {rootCauses.map((rc, idx) => {
                    const RcIcon = rc.icon;
                    return (
                      <div key={idx} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`root-cause-${idx}`}>
                        <RcIcon className={`w-4 h-4 shrink-0 mt-0.5 ${rc.iconColor}`} />
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{rc.category}</span>
                            <Badge variant="outline" className="text-[9px]">{rc.confidence}% confidence</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{rc.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {agentDrift.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Active Drift Signals ({agentDrift.length})</span>
                    {agentDrift.map(signal => (
                      <div key={signal.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-drift-${signal.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={signal.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{signal.severity}</Badge>
                          <span className="text-[11px]">{signal.suiteName}</span>
                          <span className="text-[10px] text-muted-foreground">{getMetricLabel(signal.metric)} {signal.status === "improved" ? "+" : "-"}{Math.abs(signal.driftPercent).toFixed(1)}%</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(signal.detectedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {agentViolations.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Recent Policy Violations ({agentViolations.length})</span>
                    {agentViolations.slice(0, 5).map(v => (
                      <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-violation-${v.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{v.severity}</Badge>
                          <span className="text-[11px]">{v.policyName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{v.rule.slice(0, 50)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium flex items-center gap-1.5"><CircleDot className="w-3.5 h-3.5" /> Recent Traces ({agentTraces.length})</span>
                  {agentTraces.map(trace => (
                    <div key={trace.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-trace-${trace.id}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${trace.status === "completed" ? "bg-emerald-500" : trace.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="text-[11px] truncate">{trace.inputSummary || "Run"}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{trace.latencyMs}ms</span>
                        <span className="text-[10px] text-muted-foreground">${(trace.costUsd || 0).toFixed(4)}</span>
                        <StatusBadge status={trace.status} />
                      </div>
                    </div>
                  ))}
                  {agentTraces.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-2 text-center">No traces recorded</p>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
