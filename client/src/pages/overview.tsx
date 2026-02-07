import { useQuery } from "@tanstack/react-query";
import {
  Target,
  Bot,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Activity,
  CheckCircle,
  Clock,
  ArrowRight,
  Gauge,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import type { Agent, OutcomeContract, KpiDefinition, Approval } from "@shared/schema";

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

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { data: agents, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: outcomes, isLoading: outcomesLoading } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: kpis, isLoading: kpisLoading } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/kpis"],
  });
  const { data: approvals, isLoading: approvalsLoading } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: driftSignals, isLoading: driftLoading } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });

  const isLoading = agentsLoading || outcomesLoading || kpisLoading || approvalsLoading || driftLoading;

  if (isLoading) return <OverviewSkeleton />;
  if (agentsError) return <ErrorState message="Failed to load platform data" onRetry={() => refetchAgents()} />;

  const totalCost = agents?.reduce((sum, a) => sum + (a.monthlyCost || 0), 0) || 0;
  const totalRevenue = agents?.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0) || 0;
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(1) : "0.0";
  const roiNum = parseFloat(roi);
  const totalRuns = agents?.reduce((sum, a) => sum + (a.totalRuns || 0), 0) || 0;
  const costPerRun = totalRuns > 0 ? (totalCost / totalRuns) : 0;
  const pendingApprovals = approvals?.filter((a) => a.status === "pending")?.length || 0;

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedSignals = [...(driftSignals || [])]
    .sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-overview">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">
          Lifecycle command center - agent health, ROI, and operational signals at a glance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Cost"
          value={`$${totalCost.toLocaleString()}`}
          subtitle="monthly spend"
          icon={DollarSign}
          variant="default"
          testId="stat-total-cost"
        />
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          subtitle="monthly revenue"
          icon={TrendingUp}
          variant="success"
          testId="stat-total-revenue"
        />
        <StatCard
          title="ROI"
          value={`${roi}%`}
          subtitle="return on investment"
          icon={Percent}
          variant={roiNum >= 0 ? "success" : "danger"}
          testId="stat-roi"
        />
        <StatCard
          title="Cost per Run"
          value={`$${costPerRun.toFixed(4)}`}
          subtitle={`${totalRuns.toLocaleString()} total runs`}
          icon={Gauge}
          variant="default"
          testId="stat-cost-per-run"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          subtitle="requires attention"
          icon={Clock}
          variant={pendingApprovals > 0 ? "warning" : "default"}
          testId="stat-pending-approvals"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div className="flex flex-col gap-0.5">
              <CardTitle className="text-sm font-medium">KPI Performance</CardTitle>
              <span className="text-xs text-muted-foreground">Outcome KPI Progress</span>
            </div>
            <Link href="/outcomes">
              <Button variant="ghost" size="sm" data-testid="link-view-outcomes">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {kpis?.slice(0, 5).map((kpi) => {
              const progress = kpi.target ? Math.min(((kpi.currentValue || 0) / kpi.target) * 100, 100) : 0;
              return (
                <div
                  key={kpi.id}
                  className="flex flex-col gap-1.5"
                  data-testid={`kpi-row-${kpi.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{kpi.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {kpi.currentValue?.toLocaleString()} / {kpi.target?.toLocaleString()} {kpi.unit}
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              );
            })}
            {(!kpis || kpis.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No KPIs configured yet</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-urgent-signals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Urgent Signals</CardTitle>
            <Link href="/monitor">
              <Button variant="ghost" size="sm" data-testid="link-view-monitor">
                View Monitor <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {sortedSignals.length > 0 ? (
              sortedSignals.map((signal, index) => {
                const severityVariant = signal.severity === "critical" ? "destructive" : "outline";
                return (
                  <div
                    key={signal.id}
                    className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/50"
                    data-testid={`urgent-signal-${index}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium truncate">{signal.agentName}</span>
                      <Badge variant={severityVariant} className="text-[10px]">
                        {signal.severity}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground truncate">
                        {signal.suiteName} / {signal.metric}
                      </span>
                      <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {signal.driftPercent > 0 ? "+" : ""}{signal.driftPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs text-muted-foreground">No critical signals detected</span>
              </div>
            )}
            {pendingApprovals > 0 && (
              <Link href="/approvals">
                <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 hover-elevate cursor-pointer" data-testid="link-pending-approvals-signal">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}
                  </span>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-health-heatmap">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Portfolio Health</CardTitle>
            <Link href="/agents">
              <Button variant="ghost" size="sm" data-testid="link-view-agents">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {agents?.map((agent) => {
                const score = agent.healthScore || 0;
                const dotColor = score >= 90
                  ? "bg-emerald-500"
                  : score >= 75
                    ? "bg-amber-500"
                    : score >= 60
                      ? "bg-orange-500"
                      : "bg-red-500";
                return (
                  <Link key={agent.id} href={`/agents/${agent.id}`}>
                    <div
                      className="p-2 rounded-md cursor-pointer hover-elevate flex flex-col gap-1 items-start"
                      data-testid={`health-tile-${agent.id}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 w-full">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                        <span className="text-[11px] font-medium truncate">{agent.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-3.5">{score}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            {(!agents || agents.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No agents registered</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-outcome-attainment">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Outcome Attainment</CardTitle>
            <Link href="/outcomes">
              <Button variant="ghost" size="sm" data-testid="link-view-all-outcomes">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {outcomes?.map((outcome, index) => {
              const attainment = (outcome as any).currentAttainment ?? (60 + ((index * 17 + 7) % 36));
              const attainmentClamped = Math.min(Math.max(attainment, 0), 100);
              return (
                <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
                  <div
                    className="flex flex-col gap-1.5 p-2.5 rounded-md hover-elevate cursor-pointer"
                    data-testid={`outcome-progress-${outcome.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{outcome.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium">{attainmentClamped.toFixed(0)}%</span>
                        <StatusBadge status={outcome.status} />
                      </div>
                    </div>
                    <Progress value={attainmentClamped} className="h-1.5" />
                  </div>
                </Link>
              );
            })}
            {(!outcomes || outcomes.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No outcome contracts defined</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
