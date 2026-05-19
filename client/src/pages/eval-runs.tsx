import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import type { Agent, EvalTestRun } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
  Bot,
  ArrowLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

function statusBadge(status: string, passRate: number | null) {
  if (status === "completed") {
    const pct = passRate != null ? Math.round(passRate * 100) : 0;
    if (pct >= 85) return { label: "Passed", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
    if (pct >= 70) return { label: "Warning", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
    return { label: "Failed", cls: "bg-red-500/10 text-red-600 border-red-500/20" };
  }
  if (status === "running") return { label: "Running", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" };
  if (status === "failed") return { label: "Error", cls: "bg-red-500/10 text-red-600 border-red-500/20" };
  return { label: status, cls: "bg-muted/50 text-muted-foreground" };
}

function statusIcon(status: string, passRate: number | null) {
  if (status === "running") return <Activity className="w-4 h-4 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (status === "completed") {
    const pct = passRate != null ? Math.round(passRate * 100) : 0;
    if (pct >= 70) return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  }
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

export default function EvalRuns() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const filterAgentId = params.get("agentId");

  const { data: runs, isLoading: runsLoading } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of (agents ?? [])) m.set(a.id, a);
    return m;
  }, [agents]);

  const filterAgent = filterAgentId ? agentMap.get(filterAgentId) : null;

  const displayRuns = useMemo(() => {
    const all = runs ?? [];
    const filtered = filterAgentId ? all.filter(r => r.agentId === filterAgentId) : all;
    return [...filtered].sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime());
  }, [runs, filterAgentId]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/evals">
              <button className="hover:text-foreground transition-colors flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Eval Studio
              </button>
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Runs</span>
            {filterAgent && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-foreground font-medium">{filterAgent.name}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-eval-runs">
            <Play className="w-6 h-6 text-primary" />
            Eval Runs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filterAgentId
              ? `Showing runs for ${filterAgent?.name ?? filterAgentId}`
              : "All evaluation test runs across your agents"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterAgentId && (
            <Link href="/evals/runs">
              <Button variant="outline" size="sm" data-testid="button-clear-filter">
                <Filter className="w-4 h-4 mr-1.5" />
                Clear filter
              </Button>
            </Link>
          )}
          <Link href="/evals">
            <Button variant="outline" size="sm" data-testid="button-back-to-eval-studio">
              <FlaskConical className="w-4 h-4 mr-1.5" />
              Eval Studio
            </Button>
          </Link>
        </div>
      </div>

      {/* Runs table */}
      <Card data-testid="card-eval-runs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            {displayRuns.length > 0 ? `${displayRuns.length} run${displayRuns.length !== 1 ? "s" : ""}` : "Runs"}
            {filterAgentId && (
              <Badge variant="outline" className="text-[10px] ml-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
                <Bot className="w-2.5 h-2.5 mr-1" />
                {filterAgent?.name ?? filterAgentId.slice(0, 8)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runsLoading ? (
            <div className="px-4 pb-4 flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : displayRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <FlaskConical className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">No runs yet</p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                {filterAgentId
                  ? "This agent has no eval runs. Configure metrics and trigger a run from the Eval Studio."
                  : "No eval runs have been recorded. Configure eval metrics on your agents to get started."}
              </p>
              <Link href="/evals">
                <Button variant="outline" size="sm" className="mt-1" data-testid="button-go-eval-studio">
                  <FlaskConical className="w-4 h-4 mr-1.5" />
                  Go to Eval Studio
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {displayRuns.map((run) => {
                const agent = agentMap.get(run.agentId);
                const agentName = agent?.name ?? `Agent ${run.agentId.slice(0, 8)}`;
                const passRate = run.passRate;
                const pct = passRate != null ? Math.round(passRate * 100) : null;
                const badge = statusBadge(run.status, passRate ?? null);
                return (
                  <div
                    key={run.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                    data-testid={`row-run-${run.id}`}
                  >
                    <div className="shrink-0">{statusIcon(run.status, passRate ?? null)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium font-mono text-muted-foreground">
                          {run.id.slice(0, 8)}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${badge.cls}`}>
                          {badge.label}
                        </Badge>
                        {pct != null && (
                          <span className={`text-xs font-semibold ${pct >= 85 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                            {pct}% pass
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Bot className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{agentName}</span>
                        {run.agentVersion && (
                          <span className="text-[10px] text-muted-foreground/60">· v{run.agentVersion}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">
                        {formatDate((run.completedAt ?? run.startedAt) as string)}
                      </div>
                      {run.totalCases != null && (
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {run.totalCases} cases
                        </div>
                      )}
                    </div>
                    <Link href={`/evals/runs/${run.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2 shrink-0" data-testid={`link-run-detail-${run.id}`}>
                        Detail
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
