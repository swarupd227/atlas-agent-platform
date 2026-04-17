import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  Clock,
  DollarSign,
  Zap,
  RefreshCcw,
  ChevronUp,
  ChevronDown,
  Bell,
  BellOff,
  ExternalLink,
  MonitorCheck,
  ShieldAlert,
  TrendingDown,
  FlaskConical,
  XCircle,
  CalendarClock,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AgentRow {
  agentId: string;
  agentName: string;
  department: string;
  riskTier: string;
  successRate7d: number;
  errorRate7d: number;
  p50LatencyMs7d: number;
  p95LatencyMs7d: number;
  p99LatencyMs7d: number;
  costPerRun7d: number;
  totalRuns7d: number;
  healthScore: number;
  successRate30d: number;
  errorRate30d: number;
  p95LatencyMs30d: number;
  costPerRun30d: number;
  totalRuns30d: number;
}

interface FleetAggregate {
  avgSuccessRate: number;
  avgP95LatencyMs: number;
  totalCostUsd: number;
  totalRuns: number;
  avgErrorRate: number;
  agentCount: number;
}

interface FleetData {
  agents: AgentRow[];
  fleet7d: FleetAggregate;
  fleet30d: FleetAggregate;
  topOffenders: AgentRow[];
}

interface AgentAlert {
  id: string;
  agentId: string;
  agentName: string;
  alertType: string;
  severity: string;
  message: string;
  currentValue: number | null;
  baselineValue: number | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
}

interface SmokeTestCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface SmokeTestRun {
  id: string;
  completedAt: string | null;
  status: "pass" | "fail";
  durationMs: number | null;
  alertRaised: boolean;
  freshPassRate: number | null;
  checks: SmokeTestCheck[];
  pipelineSteps: Array<{ agentCode: string; success: boolean; toolCallCount: number }>;
}

interface SmokeTestData {
  runs: SmokeTestRun[];
  nextScheduledAt: string | null;
}

type SortKey = keyof AgentRow;

function formatMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function healthColor(score: number): string {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function healthBg(score: number): string {
  if (score >= 90) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
  if (score >= 70) return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
  return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
}

function severityBadgeVariant(severity: string): "destructive" | "secondary" | "outline" {
  if (severity === "critical" || severity === "high") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) return <span className="w-3 inline-block" />;
  return direction === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
}

export default function ObservabilityPage() {
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>("successRate7d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: fleetData, isLoading: fleetLoading, refetch: refetchFleet } = useQuery<FleetData>({
    queryKey: ["/api/observability/fleet"],
    refetchInterval: 120000,
  });

  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<AgentAlert[]>({
    queryKey: ["/api/observability/alerts"],
    refetchInterval: 60000,
  });

  const { data: smokeTestData, isLoading: smokeTestLoading, refetch: refetchSmokeTests } = useQuery<SmokeTestData>({
    queryKey: ["/api/observability/smoke-tests"],
    refetchInterval: 120000,
  });

  const acknowledgeAlert = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/observability/alerts/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/observability/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  const unacknowledgedAlerts = (alerts ?? []).filter(a => !a.acknowledgedAt);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedAgents = [...(fleetData?.agents ?? [])].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function ColHeader({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
        onClick={() => handleSort(k)}
        data-testid={`th-${k}`}
      >
        {label} <SortIcon direction={sortKey === k ? sortDir : null} />
      </th>
    );
  }

  const fleet = fleetData?.fleet7d;
  const topOffenders = fleetData?.topOffenders ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MonitorCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Fleet Health</h1>
            <p className="text-sm text-muted-foreground">Agent observability — last 7 days vs 30-day baseline</p>
          </div>
          {unacknowledgedAlerts.length > 0 && (
            <Badge variant="destructive" className="ml-2" data-testid="badge-unacked-alerts">
              {unacknowledgedAlerts.length} alert{unacknowledgedAlerts.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchFleet(); refetchAlerts(); refetchSmokeTests(); }}
            data-testid="button-refresh"
          >
            <RefreshCcw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-prometheus-link">
            <a href="/api/prometheus/metrics" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" />
              Prometheus
            </a>
          </Button>
        </div>
      </div>

      {/* Unacknowledged alert banner */}
      {!alertsLoading && unacknowledgedAlerts.length > 0 && (
        <div
          className="flex items-center gap-3 p-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          data-testid="banner-unacked-alerts"
        >
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {unacknowledgedAlerts.length} unacknowledged alert{unacknowledgedAlerts.length !== 1 ? "s" : ""} require attention
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 truncate">
              {unacknowledgedAlerts[0]?.agentName}: {unacknowledgedAlerts[0]?.message}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40 flex-shrink-0"
            onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="tab-alerts"]')?.click()}
            data-testid="button-view-alerts"
          >
            View Alerts
          </Button>
        </div>
      )}

      {/* Fleet summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-avg-success-rate">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <CheckCircle className="w-3.5 h-3.5" /> Avg Success Rate (7d)
            </div>
            {fleetLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${healthColor(fleet?.avgSuccessRate ?? 0)}`}>
                  {fleet?.avgSuccessRate?.toFixed(1) ?? "—"}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  30d: {fleetData?.fleet30d?.avgSuccessRate?.toFixed(1) ?? "—"}%
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-avg-p95-latency">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="w-3.5 h-3.5" /> Avg P95 Latency (7d)
            </div>
            {fleetLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {fleet ? formatMs(fleet.avgP95LatencyMs) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  30d: {fleetData?.fleet30d ? formatMs(fleetData.fleet30d.avgP95LatencyMs) : "—"}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-cost">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="w-3.5 h-3.5" /> Total Cost (7d)
            </div>
            {fleetLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  ${fleet?.totalCostUsd?.toFixed(2) ?? "0.00"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  30d: ${fleetData?.fleet30d?.totalCostUsd?.toFixed(2) ?? "0.00"}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-runs">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Zap className="w-3.5 h-3.5" /> Total Runs (7d)
            </div>
            {fleetLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {(fleet?.totalRuns ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  30d: {(fleetData?.fleet30d?.totalRuns ?? 0).toLocaleString()}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Health — OTC Smoke Tests */}
      <Card data-testid="card-pipeline-health">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Pipeline Health — OTC Smoke Tests
            </CardTitle>
            {smokeTestData?.nextScheduledAt && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-next-run">
                <CalendarClock className="w-3.5 h-3.5" />
                Next run: {new Date(smokeTestData.nextScheduledAt).toLocaleString()}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {smokeTestLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !smokeTestData || smokeTestData.runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2" data-testid="text-no-smoke-runs">
              <FlaskConical className="w-8 h-8 text-muted-foreground" />
              <div className="font-medium text-sm">No smoke test runs yet</div>
              <div className="text-xs text-muted-foreground">
                The OTC pipeline smoke test runs weekly.
                {smokeTestData?.nextScheduledAt && (
                  <> Next scheduled: {new Date(smokeTestData.nextScheduledAt).toLocaleString()}</>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Latest run summary */}
              {(() => {
                const latest = smokeTestData.runs[0];
                const passed = latest.checks.filter(c => c.passed).length;
                const total = latest.checks.length;
                return (
                  <div
                    className={`rounded-lg border p-4 ${latest.status === "pass"
                      ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                      : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                    }`}
                    data-testid="card-latest-smoke-run"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        {latest.status === "pass" ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold text-sm" data-testid="text-smoke-status">
                            {latest.status === "pass" ? "All checks passed" : "One or more checks failed"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {latest.completedAt ? new Date(latest.completedAt).toLocaleString() : "Unknown time"}
                            {latest.durationMs != null && ` · ${formatMs(latest.durationMs)}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={latest.status === "pass" ? "outline" : "destructive"}
                          className="text-xs"
                          data-testid="badge-smoke-result"
                        >
                          {passed}/{total} checks
                        </Badge>
                        {latest.freshPassRate != null && (
                          <Badge variant="secondary" className="text-xs" data-testid="badge-eval-pass-rate">
                            Eval {Math.round(latest.freshPassRate * 100)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {latest.checks.map((check, i) => (
                        <div
                          key={i}
                          className={`rounded-md border px-3 py-2 text-xs ${check.passed
                            ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
                            : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                          }`}
                          data-testid={`card-check-${i}`}
                        >
                          <div className="flex items-center gap-1.5 font-medium mb-0.5">
                            {check.passed ? (
                              <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
                            )}
                            {check.name}
                          </div>
                          <div className="text-muted-foreground leading-snug">{check.detail}</div>
                        </div>
                      ))}
                    </div>
                    {latest.pipelineSteps.length > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="font-medium text-foreground">Pipeline:</span>
                        {latest.pipelineSteps.map((step, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="w-3 h-3" />}
                            <span
                              className={step.success ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}
                              data-testid={`text-pipeline-step-${i}`}
                            >
                              {step.agentCode}
                            </span>
                            <span className="text-muted-foreground">({step.toolCallCount} tools)</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Run history */}
              {smokeTestData.runs.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Run History</div>
                  <div className="space-y-1.5">
                    {smokeTestData.runs.slice(1).map((run) => {
                      const passed = run.checks.filter(c => c.passed).length;
                      const total = run.checks.length;
                      return (
                        <div
                          key={run.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                          data-testid={`row-smoke-run-${run.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {run.status === "pass" ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            )}
                            <span className="text-muted-foreground">
                              {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={run.status === "pass" ? "text-green-700 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                              {run.status === "pass" ? "Pass" : "Fail"}
                            </span>
                            <span className="text-muted-foreground">{passed}/{total} checks</span>
                            {run.freshPassRate != null && (
                              <span className="text-muted-foreground">· eval {Math.round(run.freshPassRate * 100)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents" data-testid="tab-agents">All Agents</TabsTrigger>
          <TabsTrigger value="offenders" data-testid="tab-offenders">
            Top Offenders
            {topOffenders.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{topOffenders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            Alerts
            {unacknowledgedAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-xs">{unacknowledgedAlerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent Metrics — 7-Day Window</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {fleetLoading ? (
                <div className="p-6 space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <ColHeader label="Agent" k="agentName" />
                        <ColHeader label="Department" k="department" />
                        <ColHeader label="Success %" k="successRate7d" />
                        <ColHeader label="Error %" k="errorRate7d" />
                        <ColHeader label="P95 Latency" k="p95LatencyMs7d" />
                        <ColHeader label="Cost/Run" k="costPerRun7d" />
                        <ColHeader label="Runs" k="totalRuns7d" />
                        <ColHeader label="Health" k="healthScore" />
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">30d Baseline</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAgents.map((agent) => (
                        <tr
                          key={agent.agentId}
                          className="border-b hover:bg-muted/30 transition-colors"
                          data-testid={`row-agent-${agent.agentId}`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-sm leading-tight">{agent.agentName}</div>
                            <div className="text-xs text-muted-foreground">{agent.riskTier}</div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {agent.department}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${healthColor(agent.successRate7d)}`}>
                              {agent.successRate7d.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {agent.errorRate7d.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={agent.p95LatencyMs7d > 30000 ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                              {formatMs(agent.p95LatencyMs7d)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            ${agent.costPerRun7d.toFixed(4)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {agent.totalRuns7d.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${healthColor(agent.healthScore)}`}>
                              {agent.healthScore.toFixed(0)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">
                            {agent.successRate30d.toFixed(1)}% / {agent.totalRuns30d} runs
                          </td>
                          <td className="px-3 py-2.5">
                            <Link href={`/agents/${agent.agentId}`}>
                              <Button variant="ghost" size="sm" className="h-7 px-2" data-testid={`link-agent-detail-${agent.agentId}`}>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {sortedAgents.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-sm">
                            No agent data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offenders">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Top Offenders — Success Rate &lt;80% or P95 &gt;30s
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fleetLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : topOffenders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <div className="font-medium">All agents are healthy</div>
                  <div className="text-sm text-muted-foreground">No agents with success rate &lt;80% or P95 latency &gt;30s</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {topOffenders.map((agent) => (
                    <div
                      key={agent.agentId}
                      className={`rounded-lg border p-4 ${healthBg(agent.successRate7d)}`}
                      data-testid={`card-offender-${agent.agentId}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{agent.agentName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{agent.department}</div>
                        </div>
                        <Link href={`/agents/${agent.agentId}`}>
                          <Button variant="outline" size="sm" className="h-7">
                            <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                        </Link>
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Success Rate</div>
                          <div className={`font-semibold ${healthColor(agent.successRate7d)}`}>
                            {agent.successRate7d.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">P95 Latency</div>
                          <div className={`font-semibold ${agent.p95LatencyMs7d > 30000 ? "text-red-600 dark:text-red-400" : ""}`}>
                            {formatMs(agent.p95LatencyMs7d)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Error Rate</div>
                          <div className="font-semibold">{agent.errorRate7d.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">30d Baseline</div>
                          <div className="font-semibold text-muted-foreground">{agent.successRate30d.toFixed(1)}%</div>
                        </div>
                      </div>
                      {agent.successRate7d < agent.successRate30d - 5 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                          <TrendingDown className="w-3 h-3" />
                          {(agent.successRate30d - agent.successRate7d).toFixed(1)}pp below 30-day baseline
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (alerts ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <BellOff className="w-10 h-10 text-muted-foreground" />
                  <div className="font-medium">No alerts</div>
                  <div className="text-sm text-muted-foreground">Alert engine checks every 5 minutes</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {(alerts ?? []).map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-4 ${alert.acknowledgedAt ? "opacity-50" : ""}`}
                      data-testid={`card-alert-${alert.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                            alert.severity === "critical" ? "text-red-500" :
                            alert.severity === "high" ? "text-orange-500" :
                            "text-amber-500"
                          }`} />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{alert.agentName}</span>
                              <Badge variant={severityBadgeVariant(alert.severity)} className="text-xs h-5">
                                {alert.severity}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-xs h-5 font-mono"
                                data-testid={`badge-alert-type-${alert.id}`}
                              >
                                {alert.alertType}
                              </Badge>
                              {alert.acknowledgedAt && (
                                <Badge variant="outline" className="text-xs h-5">acknowledged</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(alert.triggeredAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {!alert.acknowledgedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0"
                            onClick={() => acknowledgeAlert.mutate(alert.id)}
                            disabled={acknowledgeAlert.isPending}
                            data-testid={`button-ack-alert-${alert.id}`}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" /> Prometheus Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Scrape metrics from this endpoint. Each metric is labeled with{" "}
            <code className="bg-muted px-1 rounded">agent_id</code>,{" "}
            <code className="bg-muted px-1 rounded">agent_name</code>, and{" "}
            <code className="bg-muted px-1 rounded">department</code>.
          </p>
          <div className="font-mono text-xs bg-muted rounded-md p-3 space-y-1">
            <div>scrape_configs:</div>
            <div className="pl-4">- job_name: atlas-agent-fleet</div>
            <div className="pl-6">static_configs:</div>
            <div className="pl-8">
              - targets: ['{window.location.hostname}']
            </div>
            <div className="pl-6">metrics_path: /api/prometheus/metrics</div>
            <div className="pl-6">scheme: https</div>
            <div className="pl-6">scrape_interval: 60s</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
