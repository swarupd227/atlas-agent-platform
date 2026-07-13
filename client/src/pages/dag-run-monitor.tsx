/**
 * Live monitoring view for a single team-pipeline DAG run (dag_execution_runs
 * row). Polls the run every 2s until it reaches a terminal status, rendering
 * wave-by-wave node progress and -- when the run is blocked on a human
 * decision -- a banner linking straight to the pending approval so the
 * person watching doesn't have to go hunt for it.
 */
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, Network, Clock, Coins, Layers, CheckCircle2, XCircle,
  Loader2, ShieldQuestion, ArrowRight, MinusCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import type { DagExecutionRun, Agent, Approval } from "@shared/schema";

// Mirrors computeWaves()'s real output shape (server/dag-execution-engine.ts)
// -- GET /api/team-agents/:id/dag-waves returns this raw wave plan, where
// each wave's `nodes` is just an array of node ids; labels live separately
// in `nodeConfig` keyed by id.
interface WavePlanWave { wave_number: number; nodes: string[] }
interface ComputedWavePlan {
  totalWaves: number;
  maxParallelism: number;
  waves: WavePlanWave[];
  nodeConfig: Record<string, { label: string }>;
}

interface DagWaveNodeResult {
  nodeId: string;
  status: string;
  error?: string;
  durationMs: number;
  output: Record<string, any>;
}
interface DagWaveResult {
  waveNumber: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodes: DagWaveNodeResult[];
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

function durationLabel(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default function DagRunMonitor() {
  const [, params] = useRoute("/dag-runs/:runId");
  const runId = params?.runId;

  const { data: run, isLoading } = useQuery<DagExecutionRun>({
    queryKey: ["/api/dag-execution-runs", runId],
    enabled: !!runId,
    refetchInterval: (query) => {
      const d = query.state.data as DagExecutionRun | undefined;
      if (d && TERMINAL_STATUSES.has(d.status)) return false;
      return 2000;
    },
  });

  const teamAgentId = run?.teamAgentId ?? undefined;

  const { data: teamAgent } = useQuery<Agent>({
    queryKey: ["/api/agents", teamAgentId],
    enabled: !!teamAgentId,
  });

  const { data: wavePlan } = useQuery<ComputedWavePlan>({
    queryKey: ["/api/team-agents", teamAgentId, "dag-waves"],
    enabled: !!teamAgentId,
  });

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
    enabled: run?.status === "waiting_approval",
    refetchInterval: run?.status === "waiting_approval" ? 3000 : false,
  });

  const nodeLabels: Record<string, string> = {};
  for (const [nodeId, nc] of Object.entries(wavePlan?.nodeConfig || {})) {
    nodeLabels[nodeId] = nc.label;
  }

  const pendingApproval = (approvals || [])
    .filter(a => a.status === "pending" && a.agentId === teamAgentId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4 max-w-4xl mx-auto overflow-y-auto h-full" data-testid="page-dag-run-monitor-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 py-20">
        <Network className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Run not found</p>
        <Link href="/agents/teams">
          <Button variant="outline" data-testid="button-back-teams">Back to Teams</Button>
        </Link>
      </div>
    );
  }

  const waveResults = (run.waveResults as unknown as DagWaveResult[]) || [];
  const allNodes = waveResults.flatMap(w => w.nodes);
  const completedNodes = allNodes.filter(n => n.status === "completed").length;
  const errorNodes = allNodes.filter(n => n.status === "failed");
  const totalTokens = (run.totalPromptTokens ?? 0) + (run.totalCompletionTokens ?? 0);
  const startedMs = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const elapsedMs = startedMs
    ? (run.completedAt ? new Date(run.completedAt).getTime() : Date.now()) - startedMs
    : null;
  const pendingWaves = (run.totalWaves ?? 0) - waveResults.length;
  const backHref = (teamAgent as any)?.blueprintId ? `/blueprints/${(teamAgent as any).blueprintId}` : "/agents/teams";

  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto overflow-y-auto h-full" data-testid="page-dag-run-monitor">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Network className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold" data-testid="text-run-title">
              {teamAgent?.name || "Team Pipeline Run"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono" data-testid="text-run-id">{run.id.substring(0, 12)}...</span>
              <StatusBadge status={run.status} />
            </div>
          </div>
        </div>
      </div>

      {run.status === "waiting_approval" && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-awaiting-approval">
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <ShieldQuestion className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex flex-col flex-1 min-w-[200px]">
              <span className="text-sm font-medium">This run is waiting on a human decision</span>
              <span className="text-xs text-muted-foreground">Nothing else in this pipeline can proceed until it's approved or rejected.</span>
            </div>
            {pendingApproval && (
              <Link href={`/approvals/${pendingApproval.id}`}>
                <Button size="sm" data-testid="button-review-approval">
                  Review <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {run.status === "failed" && run.error && (
        <Card className="border-red-500/30 bg-red-500/5" data-testid="card-run-error">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Run failed</span>
              <span className="text-xs text-muted-foreground" data-testid="text-run-error">{run.error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px]">Elapsed</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-elapsed">
              {elapsedMs != null ? durationLabel(elapsedMs) : "—"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              <span className="text-[11px]">Wave</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-wave">
              {run.currentWave ?? 0}/{run.totalWaves ?? 0}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-[11px]">Steps Completed</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-completed">
              {completedNodes}{errorNodes.length > 0 && <span className="text-red-500 text-sm"> · {errorNodes.length} failed</span>}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Coins className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tokens</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tokens">{totalTokens}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Wave-by-Wave Progress</span>
        {waveResults.map(wave => (
          <Card key={wave.waveNumber} data-testid={`card-wave-${wave.waveNumber}`}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Wave {wave.waveNumber}</span>
                {wave.durationMs > 0 && <span className="text-[11px] text-muted-foreground">{durationLabel(wave.durationMs)}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {wave.nodes.map(node => (
                  <div key={node.nodeId} className="flex items-center gap-2 text-sm" data-testid={`row-node-${node.nodeId}`}>
                    {node.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : node.status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    ) : node.status === "skipped" ? (
                      <MinusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 animate-spin" />
                    )}
                    <span className={node.status === "skipped" ? "truncate text-muted-foreground" : "truncate"}>{nodeLabels[node.nodeId] || node.nodeId}</span>
                    {node.durationMs > 0 && <span className="text-[11px] text-muted-foreground">{durationLabel(node.durationMs)}</span>}
                    {node.error && (
                      <span className={`text-[11px] truncate ${node.status === "skipped" ? "text-muted-foreground" : "text-red-500"}`}>
                        — {node.status === "skipped" ? "Condition not met" : node.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {run.status === "running" && waveResults.length === 0 && (
          <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="card-run-starting">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting first wave…
          </CardContent></Card>
        )}

        {pendingWaves > 0 && (
          <Card className="border-dashed" data-testid="card-pending-waves">
            <CardContent className="p-4 text-xs text-muted-foreground">
              {pendingWaves} wave{pendingWaves !== 1 ? "s" : ""} not started yet
            </CardContent>
          </Card>
        )}
      </div>

      {run.status === "completed" && !!run.finalState && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Final State</span>
          <Card>
            <CardContent className="p-4">
              <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground" data-testid="text-final-state">
                {JSON.stringify(run.finalState, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
