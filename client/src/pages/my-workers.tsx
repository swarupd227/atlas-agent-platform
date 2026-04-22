import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Zap,
  AlertTriangle,
  PauseCircle,
  ExternalLink,
  CheckCircle,
} from "lucide-react";
import type { Agent, OutcomeContract } from "@shared/schema";

type StatusFilter = "all" | "running" | "attention";

function workerStatus(agent: Agent): { label: string; dot: string; pillCls: string } {
  const isRunning = agent.status === "deployed" || agent.status === "active";
  const needsAttention = isRunning && agent.healthScore != null && agent.healthScore < 60;
  const isPaused = agent.status === "paused";
  const isDraft = agent.status === "draft";

  if (needsAttention) {
    return { label: "Needs Attention", dot: "bg-amber-500", pillCls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  }
  if (isRunning) {
    return { label: "Running", dot: "bg-emerald-500", pillCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" };
  }
  if (isPaused) {
    return { label: "Paused", dot: "bg-slate-400", pillCls: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" };
  }
  if (isDraft) {
    return { label: "Setting up", dot: "bg-blue-500", pillCls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20" };
  }
  return { label: "Inactive", dot: "bg-muted-foreground/30", pillCls: "bg-muted text-muted-foreground border-muted" };
}

function lastActivityLabel(agent: Agent): string {
  if (agent.totalRuns && agent.totalRuns > 0) {
    return `${agent.totalRuns.toLocaleString()} run${agent.totalRuns !== 1 ? "s" : ""} completed`;
  }
  if (agent.lastIncidentAt) {
    const days = Math.round((Date.now() - new Date(agent.lastIncidentAt).getTime()) / 86400000);
    if (days === 0) return "Incident today";
    if (days === 1) return "Incident yesterday";
    return `Incident ${days} days ago`;
  }
  return "Standing by";
}

export default function MyWorkers() {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: allAgents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: allOutcomes, isLoading: outcomesLoading } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
    staleTime: 60000,
  });

  const isLoading = agentsLoading || outcomesLoading;

  const outcomesById = (allOutcomes || []).reduce<Record<string, OutcomeContract>>((acc, o) => {
    acc[o.id] = o;
    return acc;
  }, {});

  const workerAgents = (allAgents || []).filter((a) => !!a.outcomeId);

  const filteredAgents = workerAgents.filter((a) => {
    if (filter === "running") return a.status === "deployed" || a.status === "active";
    if (filter === "attention") {
      const isRunning = a.status === "deployed" || a.status === "active";
      return isRunning && a.healthScore != null && a.healthScore < 60;
    }
    return true;
  });

  const runningCount = workerAgents.filter((a) => a.status === "deployed" || a.status === "active").length;
  const attentionCount = workerAgents.filter(
    (a) => (a.status === "deployed" || a.status === "active") && a.healthScore != null && a.healthScore < 60
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-my-workers">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">My Digital Workers</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          All workers running across your initiatives — {runningCount} currently active.
        </p>
      </div>

      {/* Filter strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setFilter("all")}
          data-testid="filter-all-workers"
        >
          All
          <span className="ml-1.5 text-[10px] font-bold opacity-70">{workerAgents.length}</span>
        </Button>
        <Button
          variant={filter === "running" ? "default" : "outline"}
          size="sm"
          className={`h-8 text-xs ${filter !== "running" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5" : ""}`}
          onClick={() => setFilter("running")}
          data-testid="filter-running-workers"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
          Running
          <span className="ml-1.5 text-[10px] font-bold opacity-70">{runningCount}</span>
        </Button>
        {attentionCount > 0 && (
          <Button
            variant={filter === "attention" ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs ${filter !== "attention" ? "border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/5" : ""}`}
            onClick={() => setFilter("attention")}
            data-testid="filter-attention-workers"
          >
            <AlertTriangle className="w-3 h-3 mr-1.5" />
            Needs Attention
            <span className="ml-1.5 text-[10px] font-bold opacity-70">{attentionCount}</span>
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 flex flex-col gap-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && workerAgents.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
            <Bot className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No Digital Workers yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create an outcome and launch your Digital Workers to see them here.
            </p>
          </div>
          <Link href="/outcomes/discover">
            <Button size="sm" data-testid="button-create-first-worker">
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Start an Initiative
            </Button>
          </Link>
        </div>
      )}

      {/* Empty filter state */}
      {!isLoading && workerAgents.length > 0 && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            {filter === "attention" ? "No workers need attention right now." : "No workers match this filter."}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")} data-testid="button-clear-filter">
            Show all workers
          </Button>
        </div>
      )}

      {/* Worker card grid */}
      {!isLoading && filteredAgents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => {
            const { label, dot, pillCls } = workerStatus(agent);
            const outcome = agent.outcomeId ? outcomesById[agent.outcomeId] : null;
            const healthPct = agent.healthScore ?? 80;
            const activity = lastActivityLabel(agent);

            return (
              <div
                key={agent.id}
                className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                data-testid={`card-worker-${agent.id}`}
              >
                {/* Header: name + status pill */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    <h3 className="text-sm font-semibold truncate" data-testid={`text-worker-name-${agent.id}`}>
                      {agent.name}
                    </h3>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${pillCls}`}
                    data-testid={`badge-worker-status-${agent.id}`}
                  >
                    {label}
                  </span>
                </div>

                {/* Initiative link */}
                {outcome ? (
                  <Link href={`/outcomes/${outcome.id}`}>
                    <div
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      data-testid={`link-worker-outcome-${agent.id}`}
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{outcome.name}</span>
                    </div>
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">No initiative linked</p>
                )}

                {/* Health bar */}
                <div className="flex flex-col gap-1">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-1 rounded-full transition-all ${healthPct >= 80 ? "bg-emerald-500" : healthPct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(healthPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Activity footer */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-muted-foreground" data-testid={`text-worker-activity-${agent.id}`}>
                    {activity}
                  </span>
                  {agent.status === "paused" && (
                    <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
