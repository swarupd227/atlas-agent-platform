/**
 * Live monitoring view for a single team-pipeline DAG run (dag_execution_runs
 * row). Polls the run every 2s until it reaches a terminal status, rendering
 * wave-by-wave node progress and -- when the run is blocked on a human
 * decision -- a banner linking straight to the pending approval so the
 * person watching doesn't have to go hunt for it.
 */
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Network, Clock, Coins, Layers, CheckCircle2, XCircle,
  Loader2, ShieldQuestion, ArrowRight, MinusCircle, AlertTriangle,
  Play, Radio, ChevronRight, ChevronDown, Copy, Check,
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

const TERMINAL_STATUSES = new Set(["completed", "completed_with_skips", "failed"]);

// Mirror of server/dag-run-events.ts DagRunEvent -- the live SSE feed shape.
interface DagRunLiveEvent {
  type: "node_start" | "node_complete" | "wave_complete" | "approval_pending" | "run_complete";
  ts: string;
  wave?: number;
  totalWaves?: number;
  nodeId?: string;
  label?: string;
  status?: string;
  durationMs?: number;
  outputPreview?: string;
  error?: string;
  runStatus?: string;
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

// Names the wave shape this run's plan already executes -- a single wave of
// >1 nodes is "Concurrent", a chain of one-node waves is "Sequential",
// anything combining both is "Mixed". Purely a label; execution semantics
// are unchanged (dag-execution-engine.ts always ran waves this way).
const ORCHESTRATION_PATTERN_LABELS: Record<string, string> = {
  sequential: "Sequential",
  concurrent: "Concurrent",
  mixed: "Mixed",
  single: "Single Step",
  magentic: "Magentic (dynamic manager)",
};

type DagExecutionRunWithPattern = DagExecutionRun & { orchestrationPattern?: string };

function durationLabel(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default function DagRunMonitor() {
  const [, params] = useRoute("/dag-runs/:runId");
  const runId = params?.runId;

  const { data: run, isLoading } = useQuery<DagExecutionRunWithPattern>({
    queryKey: ["/api/dag-execution-runs", runId],
    enabled: !!runId,
    refetchInterval: (query) => {
      const d = query.state.data as DagExecutionRunWithPattern | undefined;
      if (d && TERMINAL_STATUSES.has(d.status)) return false;
      return 2000;
    },
  });

  const teamAgentId = run?.teamAgentId ?? undefined;

  const { data: teamAgent } = useQuery<Agent>({
    queryKey: ["/api/agents", teamAgentId],
    enabled: !!teamAgentId,
  });

  const isMagentic = run?.orchestrationPattern === "magentic";

  // A Magentic run has no blueprint graph, so there's no static wave plan to
  // fetch -- GET /api/team-agents/:id/dag-waves 400s for these teams. Node
  // labels come from each step's own persisted output instead (see below).
  const { data: wavePlan } = useQuery<ComputedWavePlan>({
    queryKey: ["/api/team-agents", teamAgentId, "dag-waves"],
    enabled: !!teamAgentId && !isMagentic,
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

  // Magentic steps have no blueprint node to look a label up against -- the
  // manager's chosen specialist name is embedded directly in the step's own
  // persisted output instead (see server/magentic-engine.ts).
  function labelForNode(node: DagWaveNodeResult): string {
    return nodeLabels[node.nodeId] || node.output?.selectedAgentName || node.nodeId;
  }

  /**
   * What THIS agent produced, as readable text.
   *
   * A node's output is a bag of state keys, and the run's final answer is those
   * bags merged -- so the individual contributions are all still here, they just
   * had nowhere to be read. Bookkeeping keys the pipeline adds for its own use
   * are dropped: they are noise to someone asking "what did this agent say?".
   */
  const OUTPUT_NOISE_KEYS = new Set(["selectedAgentName", "managerReasoning", "__meta"]);

  function outputEntries(node: DagWaveNodeResult): Array<{ key: string; text: string }> {
    const out = node.output;
    if (!out || typeof out !== "object") return [];
    return Object.entries(out)
      .filter(([k, v]) => !OUTPUT_NOISE_KEYS.has(k) && v != null && v !== "")
      .map(([key, value]) => ({
        key,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      }));
  }

  const pendingApproval = (approvals || [])
    .filter(a => a.status === "pending" && a.agentId === teamAgentId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

  // Live step-by-step activity via SSE -- the poll above keeps the summary
  // stats fresh, but only this stream can show "Copywriting agent started /
  // finished in 4.2s" the moment it happens.
  const [liveEvents, setLiveEvents] = useState<DagRunLiveEvent[]>([]);
  const [streamOpen, setStreamOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const runIsTerminal = run ? TERMINAL_STATUSES.has(run.status) : false;
  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`/api/dag-execution-runs/${runId}/events`);
    es.onopen = () => setStreamOpen(true);
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as DagRunLiveEvent;
        setLiveEvents(prev => (prev.length >= 400 ? [...prev.slice(-399), e] : [...prev, e]));
        // Poll intervals pause while the tab is backgrounded (react-query
        // default) -- drive the summary/timeline refresh off the stream too,
        // so status, waves, and final outputs land the moment they happen.
        if (e.type === "wave_complete" || e.type === "approval_pending" || e.type === "run_complete") {
          queryClient.invalidateQueries({ queryKey: ["/api/dag-execution-runs", runId] });
        }
        if (e.type === "run_complete") { es.close(); setStreamOpen(false); }
      } catch { /* ignore malformed frame */ }
    };
    es.onerror = () => setStreamOpen(false);
    return () => es.close();
  }, [runId]);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [liveEvents.length]);

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
  const skippedNodes = allNodes.filter(n => n.status === "skipped");
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
              {run.orchestrationPattern && (
                <Badge variant="outline" className="text-[11px]" data-testid="badge-orchestration-pattern">
                  {ORCHESTRATION_PATTERN_LABELS[run.orchestrationPattern] || run.orchestrationPattern}
                </Badge>
              )}
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

      {run.status === "completed_with_skips" && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-run-skipped">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">This run finished, but not every step ran</span>
              <span className="text-xs text-muted-foreground" data-testid="text-run-skip-summary">
                {skippedNodes.length > 0
                  ? `${skippedNodes.length} step${skippedNodes.length !== 1 ? "s" : ""} didn't run because no condition leading into ${skippedNodes.length !== 1 ? "them" : "it"} was met${
                      skippedNodes.length <= 5 ? `: ${skippedNodes.map(n => labelForNode(n)).join(", ")}.` : "."
                    } This can be expected branching, or a sign a condition never matches — check the wave breakdown below.`
                  : "A step inside one of this run's nested teams was skipped. Open that team's own run to see which step and why."}
              </span>
            </div>
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
              <span className="text-[11px]">{isMagentic ? "Step" : "Wave"}</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-wave">
              {run.currentWave ?? 0}{isMagentic ? ` / ${run.totalWaves ?? 0} max` : `/${run.totalWaves ?? 0}`}
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

      {(liveEvents.length > 0 || (!runIsTerminal && streamOpen)) && (
        <div className="flex flex-col gap-2" data-testid="section-live-activity">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Live Activity</span>
            {streamOpen && !runIsTerminal && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400" data-testid="badge-live-stream">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <div ref={feedRef} className="max-h-64 overflow-y-auto p-3 flex flex-col gap-1 font-mono text-[11.5px]" data-testid="feed-live-activity">
                {liveEvents.length === 0 && (
                  <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Waiting for the first step…</span>
                )}
                {liveEvents.map((e, i) => {
                  const time = new Date(e.ts).toLocaleTimeString();
                  if (e.type === "node_start") return (
                    <div key={i} className="flex items-start gap-1.5" data-testid={`event-${i}`}>
                      <Play className="w-3 h-3 mt-0.5 text-sky-500 shrink-0" />
                      <span className="text-muted-foreground shrink-0">{time}</span>
                      <span className="truncate"><span className="font-semibold">{e.label}</span> started <span className="text-muted-foreground">(wave {e.wave}/{e.totalWaves})</span></span>
                    </div>
                  );
                  if (e.type === "node_complete") return (
                    <div key={i} className="flex flex-col gap-0.5" data-testid={`event-${i}`}>
                      <div className="flex items-start gap-1.5">
                        {e.status === "completed"
                          ? <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                          : e.status === "skipped"
                          ? <MinusCircle className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                          : <XCircle className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />}
                        <span className="text-muted-foreground shrink-0">{time}</span>
                        <span className="truncate"><span className="font-semibold">{e.label}</span> {e.status === "completed" ? "finished" : e.status}{e.durationMs ? ` in ${durationLabel(e.durationMs)}` : ""}</span>
                      </div>
                      {e.outputPreview && (
                        <div className="pl-[4.5rem] text-muted-foreground truncate" title={e.outputPreview}>→ {e.outputPreview}</div>
                      )}
                      {e.error && <div className="pl-[4.5rem] text-red-500 truncate">✗ {e.error}</div>}
                    </div>
                  );
                  if (e.type === "approval_pending") return (
                    <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400" data-testid={`event-${i}`}>
                      <ShieldQuestion className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="shrink-0">{time}</span>
                      <span className="truncate">Paused — <span className="font-semibold">{e.label}</span> is waiting for a human decision</span>
                    </div>
                  );
                  if (e.type === "wave_complete") return (
                    <div key={i} className="flex items-start gap-1.5 text-muted-foreground" data-testid={`event-${i}`}>
                      <Layers className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="shrink-0">{time}</span>
                      <span>Wave {e.wave}/{e.totalWaves} complete</span>
                    </div>
                  );
                  return (
                    <div key={i} className="flex items-start gap-1.5 font-semibold" data-testid={`event-${i}`}>
                      {e.runStatus === "failed" ? <XCircle className="w-3 h-3 mt-0.5 text-red-500 shrink-0" /> : <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />}
                      <span className="text-muted-foreground shrink-0 font-normal">{time}</span>
                      <span>Run {String(e.runStatus || "").replace(/_/g, " ")}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {isMagentic ? "Step-by-Step Progress" : "Wave-by-Wave Progress"}
        </span>
        {waveResults.map(wave => (
          <Card key={wave.waveNumber} data-testid={`card-wave-${wave.waveNumber}`}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{isMagentic ? "Step" : "Wave"} {wave.waveNumber}</span>
                {wave.durationMs > 0 && <span className="text-[11px] text-muted-foreground">{durationLabel(wave.durationMs)}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {wave.nodes.map(node => (
                  <div key={node.nodeId} className="flex flex-col gap-1" data-testid={`row-node-${node.nodeId}`}>
                    <div className="flex items-center gap-2 text-sm">
                      {node.status === "completed" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : node.status === "failed" ? (
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      ) : node.status === "skipped" ? (
                        <MinusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 animate-spin" />
                      )}
                      <span className={node.status === "skipped" ? "truncate text-muted-foreground" : "truncate"}>{labelForNode(node)}</span>
                      {node.durationMs > 0 && <span className="text-[11px] text-muted-foreground">{durationLabel(node.durationMs)}</span>}
                      {node.error && (
                        <span className={`text-[11px] truncate ${node.status === "skipped" ? "text-muted-foreground" : "text-red-500"}`}>
                          — {node.status === "skipped" ? "Condition not met" : node.error}
                        </span>
                      )}
                    </div>
                    {isMagentic && node.output?.managerReasoning && (
                      <span className="text-[11px] text-muted-foreground pl-5.5 truncate">Manager: {node.output.managerReasoning}</span>
                    )}
                    <NodeOutput node={node} label={labelForNode(node)} entries={outputEntries(node)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {run.status === "running" && waveResults.length === 0 && (
          <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="card-run-starting">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {isMagentic ? "Manager is deciding the first step…" : "Starting first wave…"}
          </CardContent></Card>
        )}

        {!isMagentic && pendingWaves > 0 && (
          <Card className="border-dashed" data-testid="card-pending-waves">
            <CardContent className="p-4 text-xs text-muted-foreground">
              {pendingWaves} wave{pendingWaves !== 1 ? "s" : ""} not started yet
            </CardContent>
          </Card>
        )}
        {isMagentic && run.status === "running" && (
          <Card className="border-dashed" data-testid="card-magentic-cap">
            <CardContent className="p-4 text-xs text-muted-foreground">
              Up to {(run.totalWaves ?? 0) - waveResults.length} more step{((run.totalWaves ?? 0) - waveResults.length) !== 1 ? "s" : ""} may run before the manager finishes or hits the step cap.
            </CardContent>
          </Card>
        )}
      </div>

      {(run.status === "completed" || run.status === "completed_with_skips") && !!run.finalState && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">What This Run Produced</span>
          <div className="flex flex-col gap-2" data-testid="section-run-outputs">
            {Object.entries(run.finalState as Record<string, unknown>)
              .filter(([key]) => key !== "request")
              .map(([key, value]) => (
                <Card key={key} data-testid={`card-output-${key}`}>
                  <CardContent className="p-4 flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">{humanizeKey(key)}</span>
                    {typeof value === "string" ? (
                      <p className="text-sm whitespace-pre-wrap break-words">{value}</p>
                    ) : (
                      <pre className="text-[11px] whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-48 overflow-y-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
          <details className="text-xs" data-testid="details-raw-final-state">
            <summary className="cursor-pointer text-muted-foreground">Raw final state (JSON)</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground border rounded-md p-3" data-testid="text-final-state">
              {JSON.stringify(run.finalState, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * One agent's own output, collapsed by default.
 *
 * The run already merged every agent's output into a single final state, which
 * answers "what did the team produce" but not "what did THIS agent contribute".
 * Both questions get asked, and until now only the first had an answer on
 * screen -- the per-node output was persisted and returned by the API, but the
 * view showed a single truncated line of it.
 *
 * Collapsed by default because a finished run has many of these and the
 * wave-by-wave list is a status view first; opening one is a deliberate act.
 */
function NodeOutput({
  node,
  label,
  entries,
}: {
  node: DagWaveNodeResult;
  label: string;
  entries: Array<{ key: string; text: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // A skipped node genuinely produced nothing; a failed one has its error shown
  // on the row already. Offering an empty panel in either case is worse than
  // offering nothing.
  if (!entries.length) return null;

  const plain = entries.map((e) => (entries.length > 1 ? `## ${e.key}\n\n${e.text}` : e.text)).join("\n\n");

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the text is on screen and
      // selectable either way, so this needs no error of its own.
    }
  }

  return (
    <div className="pl-5.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
        data-testid={`button-node-output-${node.nodeId}`}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? "Hide output" : `View output from ${label}`}
      </button>

      {open && (
        <div className="mt-1.5 border rounded-md bg-muted/30" data-testid={`panel-node-output-${node.nodeId}`}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {label}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={copyOutput}
              data-testid={`button-copy-output-${node.nodeId}`}
            >
              {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="p-3 flex flex-col gap-3 max-h-96 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.key} className="flex flex-col gap-1">
                {/* The key is only worth showing when there is more than one --
                    a single-output agent would just get a redundant heading. */}
                {entries.length > 1 && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{e.key}</span>
                )}
                <pre className="text-xs whitespace-pre-wrap break-words font-mono text-foreground m-0">{e.text}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
