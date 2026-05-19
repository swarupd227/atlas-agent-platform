import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRole } from "@/components/role-provider";
import type { Agent, EvalTestRun, EvalDataset, AuditEvent, EvalGate } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  TrendingDown,
  TrendingUp,
  Minus,
  Bot,
  BookOpen,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Play,
  DollarSign,
  ArrowRight,
  ListChecks,
  ShieldAlert,
  Plus,
  Activity,
  Database,
  PlusCircle,
  Sparkles,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Sparkline({
  data,
  color = "default",
  height = 24,
  width = 80,
}: {
  data: number[];
  color?: "default" | "green" | "red" | "amber";
  height?: number;
  width?: number;
}) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} data-testid="sparkline-empty">
        {Array.from({ length: 5 }).map((_, i) => (
          <circle key={i} cx={10 + i * ((width - 20) / 4)} cy={height / 2} r={2} fill="currentColor" opacity={0.2} />
        ))}
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = (1 - (v - min) / range) * (height - pad * 2) + pad;
    return `${x},${y}`;
  }).join(" ");

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const trending = lastVal >= firstVal;

  const strokeColor =
    color === "green" ? "hsl(var(--chart-2))"
    : color === "red" ? "hsl(var(--destructive))"
    : color === "amber" ? "hsl(var(--chart-4))"
    : trending ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  return (
    <svg width={width} height={height} data-testid="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function passRateColor(rate: number | null | undefined): string {
  if (rate == null) return "text-muted-foreground";
  if (rate >= 0.9) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 0.75) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function runsToSparkline(sortedRunsAsc: EvalTestRun[]): number[] {
  return sortedRunsAsc
    .filter(r => r.passRate != null)
    .map(r => r.passRate as number);
}

function buildDailyCostSparkline(runs: EvalTestRun[], days = 30): number[] {
  const dayMs = 86_400_000;
  const now = Date.now();
  const buckets: number[] = new Array(days).fill(0);
  for (const run of runs) {
    if (!run.startedAt || run.costUsd == null) continue;
    const age = now - new Date(run.startedAt).getTime();
    const dayIdx = Math.floor(age / dayMs);
    if (dayIdx >= 0 && dayIdx < days) {
      buckets[days - 1 - dayIdx] += run.costUsd;
    }
  }
  return buckets;
}

interface EvalSummary {
  agentsUnderEval: number;
  sevenDayPassRate: number;
  openRegressions: number;
  productionAlerts: number;
  totalRuns: number;
  totalDatasets: number;
  totalMetrics: number;
  evalCostUsd: number;
}

export default function Evals() {
  const { role } = useRole();

  const { data: summary, isLoading: summaryLoading } = useQuery<EvalSummary>({
    queryKey: ["/api/eval/summary"],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: datasets } = useQuery<EvalDataset[]>({
    queryKey: ["/api/eval/datasets"],
  });

  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });

  const { data: gates } = useQuery<EvalGate[]>({
    queryKey: ["/api/eval/gates"],
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of (agents || [])) m.set(a.id, a);
    return m;
  }, [agents]);

  const DEFAULT_RISK_THRESHOLD = 0.85;
  const sevenDaysAgo = useMemo(() => Date.now() - 7 * 86_400_000, []);

  const gateMap = useMemo(() => {
    const m = new Map<string, EvalGate>();
    for (const g of (gates || [])) m.set(g.agentId, g);
    return m;
  }, [gates]);

  function effectiveThreshold(agentId: string): number {
    const gate = gateMap.get(agentId);
    if (!gate?.thresholdOverrides) return DEFAULT_RISK_THRESHOLD;
    const overrides = gate.thresholdOverrides as Record<string, number>;
    const values = Object.values(overrides).filter(v => typeof v === "number");
    if (values.length === 0) return DEFAULT_RISK_THRESHOLD;
    return Math.min(...values);
  }

  const agentsAtRisk = useMemo(() => {
    if (!runs) return [];
    const runsByAgent = new Map<string, EvalTestRun[]>();
    for (const run of runs) {
      const list = runsByAgent.get(run.agentId) ?? [];
      list.push(run);
      runsByAgent.set(run.agentId, list);
    }
    const results: Array<{
      run: EvalTestRun;
      prevRun: EvalTestRun | null;
      reason: "below_threshold" | "trending_down";
      sparkline: number[];
      threshold: number;
    }> = [];
    for (const [agentId, agentRuns] of runsByAgent.entries()) {
      const allSorted = [...agentRuns]
        .filter(r => r.status === "completed" && r.passRate != null)
        .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
      if (allSorted.length === 0) continue;
      const latest = allSorted[allSorted.length - 1];
      const prev = allSorted.length >= 2 ? allSorted[allSorted.length - 2] : null;
      const sparkline = runsToSparkline(allSorted.slice(-7));
      const threshold = effectiveThreshold(agentId);

      const sevenDayRuns = allSorted.filter(r => r.startedAt && new Date(r.startedAt).getTime() >= sevenDaysAgo);
      const isBelowThreshold = latest.passRate != null && latest.passRate < threshold;
      let isTrendingDown = false;
      if (sevenDayRuns.length >= 2) {
        const firstOfWindow = sevenDayRuns[0].passRate ?? 0;
        const lastOfWindow = sevenDayRuns[sevenDayRuns.length - 1].passRate ?? 0;
        isTrendingDown = lastOfWindow < firstOfWindow - 0.03;
      } else if (prev?.passRate != null && latest.passRate != null) {
        isTrendingDown = latest.passRate < prev.passRate - 0.03;
      }

      if (isBelowThreshold) results.push({ run: latest, prevRun: prev, reason: "below_threshold", sparkline, threshold });
      else if (isTrendingDown) results.push({ run: latest, prevRun: prev, reason: "trending_down", sparkline, threshold });
    }
    return results
      .sort((a, b) => (a.run.passRate ?? 1) - (b.run.passRate ?? 1))
      .slice(0, 8);
  }, [runs, sevenDaysAgo, gateMap]);

  interface ActivityItem {
    id: string;
    type: "run_completed" | "run_regressed" | "run_started" | "run_failed" | "dataset_created" | "golden_added" | "audit_event";
    label: string;
    sublabel: string;
    actor?: string;
    targetLink?: string;
    timestamp: string;
  }

  const recentActivity = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = [];
    for (const run of (runs ?? [])) {
      const agentName = agentMap.get(run.agentId)?.name ?? `Agent ${run.agentId.slice(0, 8)}`;
      const ts = (run.completedAt ?? run.startedAt) as string;
      if (run.status === "completed") {
        const pct = run.passRate != null ? Math.round(run.passRate * 100) : 0;
        const regressed = pct < 70;
        items.push({
          id: `run-${run.id}`,
          type: regressed ? "run_regressed" : "run_completed",
          label: regressed ? "Regression detected" : "Eval run passed",
          sublabel: `${agentName} · ${pct}% pass rate`,
          actor: "system",
          targetLink: `/evals/runs/${run.id}`,
          timestamp: ts,
        });
      } else if (run.status === "running") {
        items.push({ id: `run-${run.id}`, type: "run_started", label: "Eval run started", sublabel: agentName, actor: "system", targetLink: `/evals/runs/${run.id}`, timestamp: ts });
      } else if (run.status === "failed") {
        items.push({ id: `run-${run.id}`, type: "run_failed", label: "Eval run failed", sublabel: agentName, actor: "system", targetLink: `/evals/runs/${run.id}`, timestamp: ts });
      } else {
        items.push({ id: `run-${run.id}`, type: "run_started", label: "Eval run queued", sublabel: agentName, actor: "system", targetLink: `/evals/runs/${run.id}`, timestamp: ts });
      }
    }
    for (const ds of (datasets ?? [])) {
      if (ds.goldenCount && ds.goldenCount > 0) {
        items.push({
          id: `ds-golden-${ds.id}`,
          type: "golden_added",
          label: `${ds.goldenCount} golden${ds.goldenCount !== 1 ? "s" : ""} in dataset`,
          sublabel: ds.name,
          actor: "system",
          targetLink: `/golden-datasets/${ds.id}`,
          timestamp: (ds.updatedAt ?? ds.createdAt) as string,
        });
      }
      items.push({
        id: `ds-${ds.id}`,
        type: "dataset_created",
        label: "Dataset created",
        sublabel: ds.name,
        actor: "system",
        targetLink: `/golden-datasets/${ds.id}`,
        timestamp: ds.createdAt as string,
      });
    }
    for (const evt of (auditEvents ?? []).slice(0, 30)) {
      const actorLabel = evt.actorId
        ? `${evt.actorType}:${String(evt.actorId).slice(0, 10)}`
        : evt.actorType;
      const targetLink = evt.objectType === "agent" ? `/agents/${evt.objectId}`
        : evt.objectType === "eval_run" ? `/evals/runs/${evt.objectId}`
        : evt.objectType === "policy" ? `/governance`
        : undefined;
      items.push({
        id: `audit-${evt.id}`,
        type: "audit_event",
        label: evt.action.replace(/\./g, " "),
        sublabel: `${evt.objectType}${evt.objectId ? ` · ${String(evt.objectId).slice(0, 10)}` : ""}`,
        actor: actorLabel,
        targetLink,
        timestamp: evt.createdAt as string,
      });
    }
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 14);
  }, [runs, datasets, auditEvents, agentMap]);

  const costSparkline = useMemo(() => {
    return buildDailyCostSparkline(runs ?? [], 30);
  }, [runs]);

  const kpiTiles = [
    {
      id: "agents-under-eval",
      label: "Agents Under Eval",
      value: summaryLoading ? null : (summary?.agentsUnderEval ?? 0),
      icon: Bot,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      suffix: "",
    },
    {
      id: "pass-rate",
      label: "7-Day Pass Rate",
      value: summaryLoading ? null : (summary?.sevenDayPassRate ?? 0),
      icon: CheckCircle,
      color: (summary?.sevenDayPassRate ?? 0) >= 90 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
      bg: (summary?.sevenDayPassRate ?? 0) >= 90 ? "bg-emerald-500/10" : "bg-amber-500/10",
      suffix: "%",
    },
    {
      id: "open-regressions",
      label: "Open Regressions",
      value: summaryLoading ? null : (summary?.openRegressions ?? 0),
      icon: AlertTriangle,
      color: (summary?.openRegressions ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      bg: (summary?.openRegressions ?? 0) > 0 ? "bg-amber-500/10" : "bg-muted/50",
      suffix: "",
    },
    {
      id: "production-alerts",
      label: "Production Alerts",
      value: summaryLoading ? null : (summary?.productionAlerts ?? 0),
      icon: ShieldAlert,
      color: (summary?.productionAlerts ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bg: (summary?.productionAlerts ?? 0) > 0 ? "bg-red-500/10" : "bg-muted/50",
      suffix: "",
    },
  ];

  const quickActions = useMemo(() => {
    const base = [
      { label: "Browse Metrics", icon: ListChecks, href: "/evals/metrics", variant: "outline" as const },
      { label: "Eval Datasets", icon: Database, href: "/golden-datasets", variant: "outline" as const },
    ];
    if (role.id === "compliance_security") {
      return [
        { label: "Generate Report", icon: BarChart3, href: "/governance", variant: "default" as const },
        ...base,
      ];
    }
    if (role.id === "ops_sre") {
      return [
        { label: "Monitor Fleet", icon: Activity, href: "/monitor", variant: "default" as const },
        ...base,
      ];
    }
    return [
      { label: "Test Runs", icon: Play, href: "/evals/runs", variant: "default" as const },
      ...base,
    ];
  }, [role]);

  const activityIconConfig = (type: string) => {
    switch (type) {
      case "run_completed": return { icon: CheckCircle, color: "text-emerald-500" };
      case "run_regressed": return { icon: AlertTriangle, color: "text-amber-500" };
      case "run_started": return { icon: Activity, color: "text-blue-500" };
      case "run_failed": return { icon: AlertTriangle, color: "text-red-500" };
      case "dataset_created": return { icon: Database, color: "text-violet-500" };
      case "golden_added": return { icon: PlusCircle, color: "text-emerald-500" };
      case "audit_event": return { icon: BookOpen, color: "text-slate-500" };
      default: return { icon: Clock, color: "text-muted-foreground" };
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-eval-studio">
            <FlaskConical className="w-6 h-6 text-primary" />
            Eval Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quality health across all agents under evaluation</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/evals/regression">
            <Button variant="outline" size="sm" data-testid="button-regression-hub">
              <GitBranch className="w-4 h-4 mr-1.5" />
              Regression Hub
            </Button>
          </Link>
          <Link href="/evals/synthesizer">
            <Button variant="outline" size="sm" data-testid="button-synthesizer">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Synthesizer
            </Button>
          </Link>
          <Link href="/evals/simulator">
            <Button variant="outline" size="sm" data-testid="button-simulator">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Simulator
            </Button>
          </Link>
          <Link href="/evals/metrics">
            <Button variant="outline" size="sm" data-testid="button-browse-metrics">
              <ListChecks className="w-4 h-4 mr-1.5" />
              Metric Library
            </Button>
          </Link>
          <Button size="sm" data-testid="button-test-runs" asChild>
            <Link href="/evals/runs">
              <Play className="w-4 h-4 mr-1.5" />
              Test Runs
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.id} data-testid={`card-kpi-${tile.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground font-medium">{tile.label}</span>
                  <div className={`p-1.5 rounded-md ${tile.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${tile.color}`} />
                  </div>
                </div>
                {tile.value == null ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className={`text-3xl font-bold ${tile.color}`} data-testid={`value-kpi-${tile.id}`}>
                    {tile.value}{tile.suffix}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Agents at Risk */}
        <Card className="lg:col-span-1" data-testid="card-agents-at-risk">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-500" />
              Agents at Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {runsLoading ? (
              <div className="px-4 pb-4 flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : agentsAtRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <CheckCircle className="w-8 h-8 text-emerald-500/50" />
                <p className="text-sm text-muted-foreground">All agents passing</p>
                <p className="text-xs text-muted-foreground/70">No agents below threshold</p>
              </div>
            ) : (
              <div className="divide-y">
                {agentsAtRisk.map(({ run, prevRun, reason, sparkline, threshold }) => {
                  const agent = agentMap.get(run.agentId);
                  const name = agent?.name ?? `Agent ${run.agentId.slice(0, 8)}`;
                  const passRate = run.passRate ?? 0;
                  const prevRate = prevRun?.passRate;
                  const trendDelta = prevRate != null ? passRate - prevRate : 0;
                  const TrendIcon = trendDelta > 0.01 ? TrendingUp : trendDelta < -0.01 ? TrendingDown : Minus;
                  const trendColor = trendDelta > 0.01 ? "text-emerald-500" : trendDelta < -0.01 ? "text-red-500" : "text-muted-foreground";
                  const sparkData = sparkline.length >= 2 ? sparkline : [passRate];
                  return (
                    <div key={run.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`row-agent-risk-${run.agentId}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${passRateColor(passRate)}`}>
                            {Math.round(passRate * 100)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">/ {Math.round(threshold * 100)}%</span>
                          <TrendIcon className={`w-3 h-3 ${trendColor}`} />
                          {reason === "trending_down" && passRate >= threshold && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 h-4">trend ↓</Badge>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Sparkline data={sparkData} color={passRate >= 0.75 ? "amber" : "red"} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link href={`/evals/runs/${run.id}?passFail=fail`}>
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid={`link-inspect-run-${run.id}`}>
                            Traces
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Center: Activity Feed */}
        <Card className="lg:col-span-1" data-testid="card-activity-feed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {runsLoading ? (
              <div className="px-4 pb-4 flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <FlaskConical className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground/70">Run your first eval to get started</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentActivity.map((item) => {
                  const { icon: Icon, color } = activityIconConfig(item.type);
                  const content = (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" data-testid={`row-activity-${item.id}`}>
                      <div className={`mt-0.5 shrink-0 ${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate capitalize">{item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>
                        {item.actor && (
                          <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5 font-mono">{item.actor}</p>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 whitespace-nowrap shrink-0 mt-0.5">
                        {formatDate(item.timestamp)}
                      </div>
                    </div>
                  );
                  return item.targetLink ? (
                    <Link key={item.id} href={item.targetLink}>{content}</Link>
                  ) : (
                    <div key={item.id}>{content}</div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Quick Actions */}
        <Card className="lg:col-span-1" data-testid="card-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} href={action.href}>
                  <Button
                    variant={action.variant}
                    className="w-full justify-start"
                    data-testid={`button-quick-action-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </Button>
                </Link>
              );
            })}

            <div className="border-t pt-3 mt-1">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Catalog</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md border p-2" data-testid="stat-total-metrics">
                  <div className="text-lg font-bold text-primary">
                    {summaryLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : (summary?.totalMetrics ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Metrics</div>
                </div>
                <div className="rounded-md border p-2" data-testid="stat-total-datasets">
                  <div className="text-lg font-bold text-primary">
                    {summaryLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : (summary?.totalDatasets ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Datasets</div>
                </div>
                <div className="rounded-md border p-2" data-testid="stat-total-runs">
                  <div className="text-lg font-bold text-primary">
                    {summaryLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : (summary?.totalRuns ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Test Runs</div>
                </div>
                <div className="rounded-md border p-2" data-testid="stat-eval-cost">
                  <div className="text-lg font-bold text-primary">
                    {summaryLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : `$${(summary?.evalCostUsd ?? 0).toFixed(2)}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Total Cost</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Sparkline */}
      <Card data-testid="card-cost-sparkline">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Judge-Model Token Spend — Last 30 Days
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Total:</span>
              <Badge variant="outline" className="text-xs font-mono">
                ${(summary?.evalCostUsd ?? 0).toFixed(2)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="w-full h-16">
              <svg viewBox={`0 0 ${costSparkline.length * 10} 48`} preserveAspectRatio="none" className="w-full h-full">
                {costSparkline.length >= 2 && (() => {
                  const min = Math.min(...costSparkline);
                  const max = Math.max(...costSparkline);
                  const range = max - min || 1;
                  const w = 10;
                  const h = 48;
                  const pad = 3;
                  const pts = costSparkline.map((v, i) => {
                    const x = i * w + w / 2;
                    const y = (1 - (v - min) / range) * (h - pad * 2) + pad;
                    return `${x},${y}`;
                  }).join(" ");
                  const firstPt = `${w / 2},${(1 - (costSparkline[0] - min) / range) * (h - pad * 2) + pad}`;
                  const lastPt = `${(costSparkline.length - 1) * w + w / 2},${(1 - (costSparkline[costSparkline.length - 1] - min) / range) * (h - pad * 2) + pad}`;
                  const fillPts = `${firstPt} ${pts} ${lastPt} ${(costSparkline.length - 1) * w + w / 2},${h} ${w / 2},${h}`;
                  return (
                    <>
                      <polygon points={fillPts} fill="hsl(var(--primary))" opacity={0.1} />
                      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinejoin="round" />
                    </>
                  );
                })()}
              </svg>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>

      {/* Eval Suites quick link */}
      <Card data-testid="card-eval-suites-link">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Legacy Eval Suites</p>
              <p className="text-xs text-muted-foreground">Manage classic evaluation suites and test cases</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/evals/metrics">
              <Button variant="outline" size="sm" data-testid="link-metric-library">
                <BookOpen className="w-4 h-4 mr-1.5" />
                Metric Library
              </Button>
            </Link>
            <Link href="/golden-datasets">
              <Button variant="outline" size="sm" data-testid="link-datasets">
                <Database className="w-4 h-4 mr-1.5" />
                Datasets
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
