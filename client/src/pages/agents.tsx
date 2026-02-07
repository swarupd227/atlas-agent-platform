import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bot,
  Plus,
  Search,
  Activity,
  DollarSign,
  Clock,
  Shield,
  Zap,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import type { Agent, OutcomeContract } from "@shared/schema";

export default function Agents() {
  const [search, setSearch] = useState("");

  const { data: agents, isLoading, error, refetch } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });

  const filtered = agents?.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalCost = agents?.reduce((sum, a) => sum + (a.monthlyCost || 0), 0) || 0;
  const avgSuccess = agents?.length
    ? (agents.reduce((sum, a) => sum + (a.successRate || 0), 0) / agents.length * 100).toFixed(1)
    : "0";

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

  if (error) return <ErrorState message="Failed to load agents" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agents">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            System of record for all AI agents across your organization
          </p>
        </div>
        <Link href="/agents/wizard">
          <Button data-testid="button-create-agent">
            <Plus className="w-4 h-4 mr-1.5" /> Design New Agent
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-total-agents" />
        <StatCard title="Avg Success Rate" value={`${avgSuccess}%`} icon={Activity} trend="up" trendValue="1.2%" variant="success" testId="stat-avg-success" />
        <StatCard title="Monthly Cost" value={`$${totalCost.toLocaleString()}`} icon={DollarSign} variant="default" testId="stat-monthly-cost" />
        <StatCard title="Autonomous" value={agents?.filter((a) => a.autonomyMode === "autonomous")?.length || 0} icon={Zap} variant="default" subtitle="fully autonomous" testId="stat-autonomous" />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-agents"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Cost/Run</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((agent) => {
                const outcome = outcomes?.find((o) => o.id === agent.outcomeId);
                return (
                  <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`}>
                    <TableCell>
                      <Link href={`/agents/${agent.id}`}>
                        <div className="flex items-center gap-2.5 cursor-pointer">
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                            <Bot className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium hover:underline">{agent.name}</span>
                            <span className="text-[11px] text-muted-foreground">{agent.owner || "Unassigned"}</span>
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{outcome?.name || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">v{agent.currentVersion}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={agent.healthScore || 0} className="h-1.5 w-16" />
                        <span className="text-xs text-muted-foreground">{agent.healthScore}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={agent.autonomyMode} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={agent.riskTier} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-medium">${agent.costPerRun?.toFixed(3)}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/agents/${agent.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-agent-${agent.id}`}>
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Bot className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No agents found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
