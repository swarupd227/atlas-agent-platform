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

export default function Monitor() {
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/traces"],
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Drift & Change Detection</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-3 rounded-md bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium">Knowledge Base Freshness</span>
                  <span className="text-[11px] text-muted-foreground">3 knowledge sources haven't been updated in 14+ days</span>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 ml-auto">Investigate</Button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md bg-blue-500/5 border border-blue-500/20">
                <Zap className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium">Model Version Update Available</span>
                  <span className="text-[11px] text-muted-foreground">GPT-4.1-mini is available as a cost-optimized fallback</span>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 ml-auto">Review</Button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium">Input Distribution Stable</span>
                  <span className="text-[11px] text-muted-foreground">No significant drift detected in the last 7 days</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
