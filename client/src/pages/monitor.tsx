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
import type { Agent, RunTrace } from "@shared/schema";

interface DriftSignal {
  id: string;
  agentId: string;
  agentName: string;
  suiteName: string;
  suiteType: string;
  metric: string;
  baseline: number;
  current: number;
  driftPercent: number;
  severity: string;
  status: string;
  detectedAt: string;
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

  const { toast } = useToast();

  const remediateMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      await apiRequest("POST", "/api/recommendations", {
        agentId: signal.agentId,
        source: "drift",
        type: signal.metric === "pass_rate" ? "retrain" : "workflow_optimization",
        title: `Auto-remediate: ${signal.agentName} ${signal.suiteName} ${signal.metric} drift`,
        description: `${signal.metric === "pass_rate" ? "Pass rate" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}% (${signal.severity} severity). Baseline: ${signal.baseline}, Current: ${signal.current}.`,
        severity: signal.severity,
        status: "pending",
        impact: signal.metric === "pass_rate" 
          ? `Restore pass rate from ${(signal.current * 100).toFixed(1)}% back to ${(signal.baseline * 100).toFixed(1)}% baseline`
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
        description: `Policy guardrail blocked auto-remediation for ${signal.agentName}. ${signal.metric === "pass_rate" ? "Pass rate" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}%. Requires expert validation.`,
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
    return "Suggested: Investigate root cause and update agent configuration";
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-monitor">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Real-time observability, SLOs, and outcome assurance
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-refresh-monitor">
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Success Rate" value={`${successRate}%`} icon={CheckCircle} variant="success" trend="up" trendValue="0.3%" testId="stat-success-rate" />
        <StatCard title="Avg Latency" value={`${avgLatency}ms`} icon={Clock} variant="default" trend="down" trendValue="12ms" testId="stat-avg-latency" />
        <StatCard title="Total Cost" value={`$${totalCost.toFixed(2)}`} icon={BarChart3} variant="default" testId="stat-total-cost" />
        <StatCard title="Policy Violations" value={policyViolations} icon={Shield} variant={policyViolations > 0 ? "danger" : "success"} testId="stat-policy-violations" />
      </div>

      <OutcomeKpiStrip compact />

      <Tabs defaultValue="sla" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="sla" data-testid="tab-sla">SLA Dashboard</TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">Live Runs</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift Detection</TabsTrigger>
        </TabsList>

        <TabsContent value="sla" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents?.map((agent) => (
              <Card key={agent.id} data-testid={`sla-card-${agent.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
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
                <div className="flex items-center justify-between gap-2">
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
                    return (
                      <div key={signal.id} className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[signal.severity] || ""}`} data-testid={`drift-signal-${signal.id}`}>
                        {signal.severity === "critical" || signal.severity === "high" ? (
                          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[signal.severity]}`} />
                        ) : isImproved ? (
                          <TrendingUp className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                        ) : (
                          <Activity className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[signal.severity]}`} />
                        )}
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{signal.agentName}</span>
                            <Badge variant="outline" className="text-[9px]">{signal.suiteName}</Badge>
                            <Badge variant={signal.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{signal.severity}</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {signal.metric === "pass_rate" ? "Pass rate" : "Avg latency"} {isImproved ? "improved" : "degraded"} by{" "}
                            <span className="font-medium">{Math.abs(signal.driftPercent)}%</span>
                            {" "}(baseline: {signal.metric === "pass_rate" ? `${(signal.baseline * 100).toFixed(1)}%` : `${signal.baseline}ms`}
                            {" "}&rarr; current: {signal.metric === "pass_rate" ? `${(signal.current * 100).toFixed(1)}%` : `${signal.current}ms`})
                          </span>
                          <span className="text-[10px] text-muted-foreground">Detected: {new Date(signal.detectedAt).toLocaleString()}</span>
                          {!isImproved && (
                            <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-dashed" data-testid={`drift-remediation-${signal.id}`}>
                              <span className="text-[10px] text-muted-foreground">
                                {getRemediationSuggestion(signal)}
                              </span>
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
