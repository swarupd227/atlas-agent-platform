import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import type { Agent, EvalTestRun } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
  Bot,
  ArrowLeft,
  ChevronRight,
  FlaskConical,
  Database,
  BarChart3,
  Hash,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

function passRateBadge(passRate: number | null | undefined) {
  if (passRate == null) return { label: "—", cls: "bg-muted/50 text-muted-foreground" };
  const pct = Math.round(passRate * 100);
  if (pct >= 85) return { label: `${pct}%`, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
  if (pct >= 70) return { label: `${pct}%`, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  return { label: `${pct}%`, cls: "bg-red-500/10 text-red-600 border-red-500/20" };
}

function statusIcon(status: string, passRate: number | null | undefined) {
  if (status === "running") return <Activity className="w-5 h-5 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="w-5 h-5 text-red-500" />;
  if (status === "completed") {
    const pct = passRate != null ? Math.round(passRate * 100) : 0;
    return pct >= 70
      ? <CheckCircle className="w-5 h-5 text-emerald-500" />
      : <AlertTriangle className="w-5 h-5 text-amber-500" />;
  }
  return <Clock className="w-5 h-5 text-muted-foreground" />;
}

export default function EvalRunDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: runs, isLoading } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const run = runs?.find(r => r.id === id);
  const agent = run ? agents?.find(a => a.id === run.agentId) : undefined;
  const agentName = agent?.name ?? (run ? `Agent ${run.agentId.slice(0, 8)}` : "");
  const passRatePct = run?.passRate != null ? Math.round(run.passRate * 100) : null;
  const badge = passRateBadge(run?.passRate);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1000px] mx-auto">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/evals">
            <button className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Eval Studio
            </button>
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/evals/runs">
            <button className="hover:text-foreground transition-colors">Runs</button>
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-mono">{id?.slice(0, 8)}</span>
        </div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-run-detail">
          <Play className="w-6 h-6 text-primary" />
          Run Detail
        </h1>
        {run && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {agentName} · started {formatDate(run.startedAt as string)}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !run ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FlaskConical className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Run not found</p>
            <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
              This run ID does not exist or has been removed.
            </p>
            <Link href="/evals/runs">
              <Button variant="outline" size="sm" data-testid="button-back-to-runs">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Runs
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary card */}
          <Card data-testid="card-run-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {statusIcon(run.status, run.passRate)}
                Run Summary
                <Badge variant="outline" className={`ml-1 text-[10px] ${badge.cls}`}>
                  {badge.label} pass rate
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-md border p-3">
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Bot className="w-2.5 h-2.5" /> Agent
                  </div>
                  <div className="text-sm font-semibold truncate">{agentName}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{run.agentVersion ?? "latest"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <BarChart3 className="w-2.5 h-2.5" /> Pass Rate
                  </div>
                  <div className={`text-2xl font-bold ${passRatePct != null && passRatePct >= 85 ? "text-emerald-600" : passRatePct != null && passRatePct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                    {passRatePct != null ? `${passRatePct}%` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">threshold 85%</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Hash className="w-2.5 h-2.5" /> Test Cases
                  </div>
                  <div className="text-2xl font-bold">{run.totalCases ?? "—"}</div>
                  {run.passedCases != null && run.failedCases != null && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {run.passedCases} passed · {run.failedCases} failed
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> Dataset
                  </div>
                  <div className="text-sm font-semibold font-mono truncate">
                    {run.datasetId?.slice(0, 12) ?? "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">v{run.datasetVersion ?? 1}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadata card */}
          <Card data-testid="card-run-metadata">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Run Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Run ID</span>
                  <span className="font-mono text-xs">{run.id}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="text-[10px]">{run.status}</Badge>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Started</span>
                  <span className="text-xs">{formatDate(run.startedAt as string)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-xs">{run.completedAt ? formatDate(run.completedAt as string) : "—"}</span>
                </div>
                {run.costUsd != null && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Eval Cost</span>
                    <span className="text-xs font-semibold">${run.costUsd.toFixed(4)}</span>
                  </div>
                )}
                {run.metricCollectionId && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Metric Collection</span>
                    <span className="text-xs font-mono">{run.metricCollectionId.slice(0, 12)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
