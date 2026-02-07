import { useQuery } from "@tanstack/react-query";
import {
  Target,
  Bot,
  Rocket,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Activity,
  CheckCircle,
  Clock,
  ArrowRight,
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
import type { Agent, OutcomeContract, KpiDefinition, Approval, Deployment } from "@shared/schema";

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
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
  const { data: deployments, isLoading: deploymentsLoading } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });

  const isLoading = agentsLoading || outcomesLoading || kpisLoading || approvalsLoading || deploymentsLoading;

  if (isLoading) return <OverviewSkeleton />;
  if (agentsError) return <ErrorState message="Failed to load platform data" onRetry={() => refetchAgents()} />;

  const activeAgents = agents?.filter((a) => a.status === "active")?.length || 0;
  const pendingApprovals = approvals?.filter((a) => a.status === "pending")?.length || 0;
  const avgHealthScore = agents?.length
    ? Math.round((agents.reduce((sum, a) => sum + (a.healthScore || 0), 0) / agents.length))
    : 0;
  const totalRevenue = agents?.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0) || 0;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-overview">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">
          Monitor your agent ecosystem health, outcomes, and operational status
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Agents"
          value={activeAgents}
          subtitle="across all environments"
          icon={Bot}
          variant="default"
          testId="stat-active-agents"
        />
        <StatCard
          title="Platform Health"
          value={`${avgHealthScore}%`}
          subtitle="avg score"
          icon={Activity}
          trend="up"
          trendValue="2.1%"
          variant="success"
          testId="stat-health"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          subtitle="requires attention"
          icon={CheckCircle}
          variant={pendingApprovals > 0 ? "warning" : "success"}
          testId="stat-approvals"
        />
        <StatCard
          title="Monthly Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          subtitle="outcome-driven"
          icon={DollarSign}
          trend="up"
          trendValue="12.5%"
          variant="success"
          testId="stat-revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">KPI Performance</CardTitle>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Link href="/approvals">
              <Button variant="ghost" size="sm" data-testid="link-view-approvals">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {approvals
              ?.filter((a) => a.status === "pending")
              .slice(0, 5)
              .map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-3 p-2.5 rounded-md bg-muted/50 hover-elevate"
                  data-testid={`approval-row-${approval.id}`}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{approval.objectName || approval.type}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{approval.description}</span>
                  </div>
                </div>
              ))}
            {(!approvals || approvals.filter((a) => a.status === "pending").length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending approvals</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Agent Health Overview</CardTitle>
            <Link href="/agents">
              <Button variant="ghost" size="sm" data-testid="link-view-agents">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {agents?.slice(0, 5).map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <div
                  className="flex items-center justify-between gap-3 p-2.5 rounded-md hover-elevate cursor-pointer"
                  data-testid={`agent-health-row-${agent.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{agent.name}</span>
                      <span className="text-[11px] text-muted-foreground">v{agent.currentVersion}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-medium">{agent.healthScore}%</span>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-sm font-medium">Recent Deployments</CardTitle>
            <Link href="/deployments">
              <Button variant="ghost" size="sm" data-testid="link-view-deployments">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {deployments?.slice(0, 5).map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-md hover-elevate"
                data-testid={`deploy-row-${dep.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/10 shrink-0">
                    <Rocket className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{dep.agentName || "Agent"}</span>
                    <span className="text-[11px] text-muted-foreground">v{dep.version} → {dep.environment}</span>
                  </div>
                </div>
                <StatusBadge status={dep.status} />
              </div>
            ))}
            {(!deployments || deployments.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No deployments yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
