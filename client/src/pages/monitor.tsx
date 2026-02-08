import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { StatusBadge } from "@/components/status-badge";
import { PolicyViolationDialog } from "@/components/policy-violation-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, RunTrace, Approval } from "@shared/schema";

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

export default function Monitor() {
  const [policyCheckResult, setPolicyCheckResult] = useState<{
    signal: DriftSignal;
    allowed: boolean;
    violations: Array<{ policyName: string; rule: string; severity: string; message: string }>;
    sandboxAvailable: boolean;
  } | null>(null);

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
  const policyViolations = allTraces.filter((t) => t.status === "blocked").length;

  const customerImpactCount = impactData
    ? impactData.filter(o => o.breachedKpis > 0).length
    : 0;

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
        <StatCard title="Policy Violations" value={policyViolations} icon={Shield} variant={policyViolations > 0 ? "danger" : "success"} testId="stat-policy-violations" />
        <StatCard title="Customer Impact" value={customerImpactCount} icon={Users} variant={customerImpactCount > 0 ? "warning" : "success"} subtitle="outcomes with breached KPIs" testId="stat-customer-impact" />
      </div>

      <OutcomeKpiStrip compact />

      <Tabs defaultValue="outcome-sla" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="outcome-sla" data-testid="tab-outcome-sla">Outcome SLA Dashboard</TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">Live Runs</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift Detection</TabsTrigger>
          <TabsTrigger value="agent-health" data-testid="tab-agent-health">Agent Health</TabsTrigger>
        </TabsList>

        <TabsContent value="outcome-sla" className="mt-0">
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
        </TabsContent>

        <TabsContent value="live" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Run Stream</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {allTraces.slice(0, 15).map((trace) => (
                <div key={trace.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 hover-elevate" data-testid={`live-trace-${trace.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-2 h-2 rounded-full shrink-0 ${trace.status === "completed" ? "bg-emerald-500" : trace.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{trace.inputSummary || "Run execution"}</span>
                      <span className="text-[11px] text-muted-foreground">{trace.environment} | {trace.latencyMs}ms | ${trace.costUsd?.toFixed(4)}</span>
                    </div>
                  </div>
                  <StatusBadge status={trace.status} />
                </div>
              ))}
              {allTraces.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No runs recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift" className="mt-0">
          <div className="flex flex-col gap-4">
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
          </div>
        </TabsContent>

        <TabsContent value="agent-health" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents?.map((agent) => (
              <Card key={agent.id} data-testid={`sla-card-${agent.id}`}>
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
                  <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}
