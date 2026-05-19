import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import type { Agent, EvalTestRun, EvalTrace, EvalGolden } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Download,
  Timer,
  DollarSign,
  Cpu,
  GitCompare,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function passRateBadge(passRate: number | null | undefined) {
  if (passRate == null) return { label: "—", cls: "bg-muted/50 text-muted-foreground" };
  const pct = Math.round(passRate * 100);
  if (pct >= 85) return { label: `${pct}%`, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
  if (pct >= 70) return { label: `${pct}%`, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  return { label: `${pct}%`, cls: "bg-red-500/10 text-red-600 border-red-500/20" };
}

function statusIcon(status: string, passRate: number | null | undefined) {
  if (status === "running") return <Activity className="w-5 h-5 text-blue-500" />;
  if (status === "pending") return <Clock className="w-5 h-5 text-yellow-500" />;
  if (status === "failed") return <AlertTriangle className="w-5 h-5 text-red-500" />;
  if (status === "completed") {
    const pct = passRate != null ? Math.round(passRate * 100) : 0;
    return pct >= 70
      ? <CheckCircle className="w-5 h-5 text-emerald-500" />
      : <AlertTriangle className="w-5 h-5 text-amber-500" />;
  }
  return <Clock className="w-5 h-5 text-muted-foreground" />;
}

function ScoreCell({ scores }: { scores: unknown }) {
  if (!scores || typeof scores !== "object") return <span className="text-muted-foreground/40">—</span>;
  const entries = Object.entries(scores as Record<string, number>).slice(0, 3);
  if (!entries.length) return <span className="text-muted-foreground/40">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{k}:</span>
          <span className={`text-[11px] font-semibold ${typeof v === "number" && v >= 0.85 ? "text-emerald-600" : typeof v === "number" && v >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
            {typeof v === "number" ? `${(v * 100).toFixed(0)}%` : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(
  traces: EvalTrace[],
  goldenMap: Map<string, EvalGolden>,
  filename: string
) {
  const rows = [
    ["golden_id", "input", "expected_output", "pass_fail", "latency_ms", "cost_usd", "total_tokens"].join(","),
    ...traces.map((t) => {
      const g = goldenMap.get(t.goldenId);
      return [
        t.goldenId,
        JSON.stringify(g?.input ?? ""),
        JSON.stringify(g?.expectedOutput ?? ""),
        t.passFail ? "pass" : "fail",
        t.latencyMs ?? "",
        t.costUsd ?? "",
        t.totalTokens ?? "",
      ].join(",");
    }),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Progress bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  run: EvalTestRun;
}

function ProgressBar({ run }: ProgressBarProps) {
  const total = run.totalGoldens ?? 0;
  if (!total) return null;
  const passed = run.passedCount ?? 0;
  const failed = run.failedCount ?? 0;
  const running = run.runningCount ?? 0;
  const pending = run.pendingCount ?? total - passed - failed - running;
  const pctPassed = total > 0 ? (passed / total) * 100 : 0;
  const pctFailed = total > 0 ? (failed / total) * 100 : 0;
  const pctRunning = total > 0 ? (running / total) * 100 : 0;
  const evaluated = passed + failed;

  return (
    <Card data-testid="card-run-progress">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Progress
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            {evaluated} / {total} evaluated
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pctPassed}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${pctFailed}%` }}
          />
          <div
            className="h-full bg-blue-400 transition-all duration-500"
            style={{ width: `${pctRunning}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Passed:</span>
            <span className="font-semibold text-emerald-600">{passed}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Failed:</span>
            <span className="font-semibold text-red-600">{failed}</span>
          </div>
          {running > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-muted-foreground">Running:</span>
              <span className="font-semibold text-blue-600">{running}</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
              <span className="text-muted-foreground">Pending:</span>
              <span className="font-semibold">{pending}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function EvalRunDetail() {
  const { id } = useParams<{ id: string }>();
  const [tracesFilter, setTracesFilter] = useState<"all" | "pass" | "fail">("all");
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);

  const isActiveRun = useCallback((run: EvalTestRun | undefined) => {
    return run?.status === "pending" || run?.status === "running";
  }, []);

  const { data: run, isLoading } = useQuery<EvalTestRun>({
    queryKey: ["/api/eval/runs", id],
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as EvalTestRun | undefined;
      return data?.status === "pending" || data?.status === "running" ? 3000 : false;
    },
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // All runs for same agent (for comparison picker)
  const { data: agentRuns } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
    enabled: !!run?.agentId,
  });

  const comparableRuns = useMemo(() => {
    if (!agentRuns || !run) return [];
    return agentRuns.filter((r) => r.id !== run.id && r.status === "completed" && r.agentId === run.agentId);
  }, [agentRuns, run]);

  const tracesQueryKey = ["/api/eval/runs", id, "traces", tracesFilter];
  const { data: traces, isLoading: tracesLoading } = useQuery<EvalTrace[]>({
    queryKey: tracesQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (tracesFilter !== "all") params.set("passFail", tracesFilter);
      const res = await fetch(`/api/eval/runs/${id}/traces?${params}`);
      return res.json();
    },
    enabled: !!id && !!run,
    refetchInterval: run?.status === "pending" || run?.status === "running" ? 5000 : false,
  });

  // Comparison run traces
  const { data: compareTraces, isLoading: compareTracesLoading } = useQuery<EvalTrace[]>({
    queryKey: ["/api/eval/runs", compareRunId, "traces", "all"],
    queryFn: async () => {
      const res = await fetch(`/api/eval/runs/${compareRunId}/traces?limit=200`);
      return res.json();
    },
    enabled: !!compareRunId,
  });

  // Build comparison map: goldenId → { current: passFail, baseline: passFail }
  const comparisonMap = useMemo(() => {
    if (!traces || !compareTraces) return null;
    const baseMap = new Map<string, boolean | null>();
    for (const t of compareTraces) baseMap.set(t.goldenId, t.passFail ?? null);
    const result = new Map<string, { current: boolean | null; baseline: boolean | null; status: "regressed" | "improved" | "unchanged" | "new" }>();
    for (const t of traces) {
      const baseline = baseMap.has(t.goldenId) ? baseMap.get(t.goldenId)! : null;
      const current = t.passFail ?? null;
      let status: "regressed" | "improved" | "unchanged" | "new";
      if (baseline === null) status = "new";
      else if (baseline === true && current === false) status = "regressed";
      else if (baseline === false && current === true) status = "improved";
      else status = "unchanged";
      result.set(t.goldenId, { current, baseline, status });
    }
    return result;
  }, [traces, compareTraces]);

  const compareRun = comparableRuns.find((r) => r.id === compareRunId);

  const { data: goldens } = useQuery<EvalGolden[]>({
    queryKey: ["/api/eval/datasets", run?.datasetId, "goldens-all"],
    queryFn: async () => {
      const res = await fetch(`/api/eval/datasets/${run!.datasetId}/goldens?limit=200`);
      return res.json();
    },
    enabled: !!run?.datasetId,
  });

  const goldenMap = useMemo(() => {
    const m = new Map<string, EvalGolden>();
    for (const g of (goldens ?? [])) m.set(g.id, g);
    return m;
  }, [goldens]);

  const agent = run ? agents?.find(a => a.id === run.agentId) : undefined;
  const agentName = agent?.name ?? (run ? `Agent ${run.agentId.slice(0, 8)}` : "");
  const passRatePct = run?.passRate != null ? Math.round(run.passRate * 100) : null;
  const badge = passRateBadge(run?.passRate);
  const startedAtDate: Date | null = run?.startedAt instanceof Date ? run.startedAt : (run?.startedAt ? new Date(run.startedAt as unknown as string) : null);
  const completedAtDate: Date | null = run?.completedAt instanceof Date ? run.completedAt : (run?.completedAt ? new Date(run.completedAt as unknown as string) : null);

  const handleExportJson = () => {
    if (!run || !traces) return;
    exportJson({ run, traces: traces.map((t) => ({ ...t, golden: goldenMap.get(t.goldenId) })) }, `eval-run-${run.id.slice(0, 8)}.json`);
  };

  const handleExportCsv = () => {
    if (!run || !traces) return;
    exportCsv(traces, goldenMap, `eval-run-${run.id.slice(0, 8)}.csv`);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1100px] mx-auto">
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="heading-run-detail">
              <Play className="w-6 h-6 text-primary" />
              Run Detail
              {run && (isActiveRun(run)) && (
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse ml-1">
                  <Activity className="w-2.5 h-2.5 mr-1" /> Live
                </Badge>
              )}
            </h1>
            {run && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {agentName} · started {startedAtDate ? formatDate(startedAtDate) : "—"}
              </p>
            )}
          </div>
          {run && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareDialogOpen(true)}
                disabled={comparableRuns.length === 0}
                title={comparableRuns.length === 0 ? "No other completed runs for this agent" : undefined}
                data-testid="button-compare-run"
              >
                <GitCompare className="w-3.5 h-3.5 mr-1.5" />
                Compare
                {compareRunId && <span className="ml-1 text-primary">·</span>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!traces || traces.length === 0}
                data-testid="button-export-csv"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                disabled={!traces || traces.length === 0}
                data-testid="button-export-json"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                JSON
              </Button>
            </div>
          )}
        </div>
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
          {/* Progress bar (active runs) */}
          {(run.status === "pending" || run.status === "running" || (run.status === "completed" && run.totalGoldens != null)) && (
            <ProgressBar run={run} />
          )}

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
                  <div className="text-2xl font-bold">{run.totalGoldens ?? "—"}</div>
                  {run.passedCount != null && run.failedCount != null && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {run.passedCount} passed · {run.failedCount} failed
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

              {/* Cost / latency row */}
              {(run.costUsd != null || run.avgLatencyMs != null || run.totalTokens != null) && (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {run.avgLatencyMs != null && (
                    <div className="rounded-md border p-3">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <Timer className="w-2.5 h-2.5" /> Avg Latency
                      </div>
                      <div className="text-sm font-semibold">{run.avgLatencyMs.toLocaleString()}ms</div>
                    </div>
                  )}
                  {run.costUsd != null && (
                    <div className="rounded-md border p-3">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <DollarSign className="w-2.5 h-2.5" /> Cost
                      </div>
                      <div className="text-sm font-semibold">${run.costUsd.toFixed(4)}</div>
                    </div>
                  )}
                  {run.totalTokens != null && (
                    <div className="rounded-md border p-3">
                      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                        <Cpu className="w-2.5 h-2.5" /> Tokens
                      </div>
                      <div className="text-sm font-semibold">{run.totalTokens.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-golden traces table */}
          <Card data-testid="card-run-traces">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />
                  Per-Golden Results
                  {traces && (
                    <span className="text-muted-foreground font-normal text-xs">({traces.length} loaded)</span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={tracesFilter} onValueChange={(v) => setTracesFilter(v as "all" | "pass" | "fail")}>
                    <SelectTrigger className="h-7 w-24 text-xs" data-testid="select-traces-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pass">Passed</SelectItem>
                      <SelectItem value="fail">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tracesLoading ? (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !traces || traces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  {run.status === "pending" || run.status === "running" ? (
                    <>
                      <Activity className="w-8 h-8 text-blue-500 animate-pulse" />
                      <p className="text-sm text-muted-foreground font-medium">Evaluation in progress…</p>
                      <p className="text-xs text-muted-foreground/70">Results will appear here as each golden is evaluated.</p>
                    </>
                  ) : (
                    <>
                      <Hash className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground font-medium">No trace data yet</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Golden</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium min-w-[200px]">Input</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-20">Result</th>
                        {comparisonMap && <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-24">vs Baseline</th>}
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-32">Scores</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-24">Latency</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-20">Cost</th>
                        <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-16">Trace</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {traces.map((t) => {
                        const g = goldenMap.get(t.goldenId);
                        return (
                          <tr
                            key={t.id}
                            className="hover:bg-muted/20 transition-colors"
                            data-testid={`row-trace-${t.id}`}
                          >
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">
                              {t.goldenId.slice(0, 8)}
                            </td>
                            <td className="px-4 py-2.5 max-w-[200px]">
                              <span className="font-mono line-clamp-2 text-[11px] leading-relaxed">
                                {g?.input ?? <span className="italic text-muted-foreground/50">unknown golden</span>}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {t.passFail === true ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Pass</Badge>
                              ) : t.passFail === false ? (
                                <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">Fail</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">—</Badge>
                              )}
                              {t.agentFailed && (
                                <div className="text-[9px] text-red-500 mt-0.5">agent error</div>
                              )}
                            </td>
                            {comparisonMap && (() => {
                              const cmp = comparisonMap.get(t.goldenId);
                              if (!cmp) return <td className="px-4 py-2.5 text-muted-foreground text-[10px]">—</td>;
                              if (cmp.status === "regressed") return (
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                                    <TrendingDown className="w-3 h-3" /> Regressed
                                  </span>
                                </td>
                              );
                              if (cmp.status === "improved") return (
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                                    <TrendingUp className="w-3 h-3" /> Improved
                                  </span>
                                </td>
                              );
                              if (cmp.status === "new") return (
                                <td className="px-4 py-2.5">
                                  <span className="text-[10px] text-blue-500 font-medium">New</span>
                                </td>
                              );
                              return (
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Minus className="w-3 h-3" /> Same
                                  </span>
                                </td>
                              );
                            })()}
                            <td className="px-4 py-2.5">
                              <ScoreCell scores={t.scores} />
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {t.latencyMs != null ? `${t.latencyMs.toLocaleString()}ms` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {t.costUsd != null && t.costUsd > 0 ? `$${t.costUsd.toFixed(5)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <Link href={`/evals/traces/${t.id}`}>
                                <button
                                  className="flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary transition-colors"
                                  data-testid={`link-trace-${t.id}`}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  View
                                </button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
                  <span className="text-xs">{startedAtDate ? formatDate(startedAtDate) : "—"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-xs">{completedAtDate ? formatDate(completedAtDate) : "—"}</span>
                </div>
                {run.triggeredBy && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Triggered by</span>
                    <span className="text-xs">{run.triggeredBy}</span>
                  </div>
                )}
                {run.judgeModelOverride && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Judge Model</span>
                    <span className="text-xs font-mono">{run.judgeModelOverride}</span>
                  </div>
                )}
                {run.metricCollectionId && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Metric Collection</span>
                    <span className="text-xs font-mono">{run.metricCollectionId.slice(0, 12)}</span>
                  </div>
                )}
                {(run.metricIds ?? []).length > 0 && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Metrics</span>
                    <span className="text-xs">{(run.metricIds ?? []).length} attached</span>
                  </div>
                )}
                {run.isBaseline && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Baseline Run</span>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Yes</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Compare Run Picker Dialog */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-compare-run">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-primary" />
              Compare to a Prior Run
            </DialogTitle>
            <DialogDescription>
              Select a completed run for the same agent to compare pass/fail results golden-by-golden.
            </DialogDescription>
          </DialogHeader>
          {compareTracesLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Activity className="w-4 h-4 animate-pulse" /> Loading comparison traces…
            </div>
          )}
          {comparableRuns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No other completed runs found for this agent.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto py-1">
              {comparableRuns.map((r) => {
                const rDate: Date | null = r.startedAt ? new Date(r.startedAt as unknown as string) : null;
                const rPassPct = r.passRate != null ? Math.round(r.passRate * 100) : null;
                const isSelected = compareRunId === r.id;
                return (
                  <button
                    key={r.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${isSelected ? "border-primary bg-primary/5" : ""}`}
                    onClick={() => { setCompareRunId(r.id); setCompareDialogOpen(false); }}
                    data-testid={`option-compare-run-${r.id}`}
                  >
                    <div>
                      <div className="text-sm font-mono font-medium">{r.id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {rDate ? formatDate(rDate) : "—"}
                        {r.datasetId && <span className="ml-2 font-mono">{r.datasetId.slice(0, 8)}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {rPassPct != null ? (
                        <span className={`text-sm font-semibold ${rPassPct >= 85 ? "text-emerald-600" : rPassPct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                          {rPassPct}%
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                      <div className="text-[10px] text-muted-foreground">pass rate</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {compareRunId && (
            <div className="pt-2 border-t">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setCompareRunId(null); setCompareDialogOpen(false); }}
                data-testid="button-clear-compare"
              >
                Clear comparison
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
