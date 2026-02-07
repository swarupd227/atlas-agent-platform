import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Zap,
  Shield,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
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
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/traces"],
  });
  const { data: driftSignals } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });

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
    </div>
  );
}
