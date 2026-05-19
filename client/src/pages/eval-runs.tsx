import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import type { Agent, EvalTestRun, EvalDataset, EvalMetric, EvalMetricCollection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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
  Database,
  ChevronDown,
  ChevronUp,
  Zap,
  ListChecks,
  Hash,
  DollarSign,
  User,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function statusBadge(status: string, passRate: number | null) {
  if (status === "completed") {
    const pct = passRate != null ? Math.round(passRate * 100) : 0;
    if (pct >= 85) return { label: "Passed", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
    if (pct >= 70) return { label: "Warning", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
    return { label: "Failed", cls: "bg-red-500/10 text-red-600 border-red-500/20" };
  }
  if (status === "running") return { label: "Running", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" };
  if (status === "pending") return { label: "Pending", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" };
  if (status === "failed") return { label: "Error", cls: "bg-red-500/10 text-red-600 border-red-500/20" };
  return { label: status, cls: "bg-muted/50 text-muted-foreground" };
}

function statusIcon(status: string, passRate: number | null) {
  if (status === "running") return <Activity className="w-4 h-4 text-blue-500" />;
  if (status === "pending") return <Clock className="w-4 h-4 text-yellow-500" />;
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [configOpen, setConfigOpen] = useState(false);
  const [runAgentId, setRunAgentId] = useState<string>("");
  const [runAgentVersion, setRunAgentVersion] = useState<string>("");
  const [runDatasetId, setRunDatasetId] = useState<string>("");
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("__none__");
  const [judgeModel, setJudgeModel] = useState<string>("__default__");

  const { data: runs, isLoading: runsLoading } = useQuery<EvalTestRun[]>({
    queryKey: ["/api/eval/runs"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: datasets } = useQuery<EvalDataset[]>({
    queryKey: ["/api/eval/datasets"],
  });

  const { data: metricsData } = useQuery<{ items: EvalMetric[]; total: number }>({
    queryKey: ["/api/eval/metrics"],
  });
  const metrics = metricsData?.items ?? [];

  const { data: metricCollections } = useQuery<EvalMetricCollection[]>({
    queryKey: ["/api/eval/metric-collections"],
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of (agents ?? [])) m.set(a.id, a);
    return m;
  }, [agents]);

  const datasetMap = useMemo(() => {
    const m = new Map<string, EvalDataset>();
    for (const d of (datasets ?? [])) m.set(d.id, d);
    return m;
  }, [datasets]);

  const filterAgent = filterAgentId ? agentMap.get(filterAgentId) : null;

  const displayRuns = useMemo(() => {
    const all = runs ?? [];
    let filtered = filterAgentId ? all.filter(r => r.agentId === filterAgentId) : all;
    if (runAgentId) filtered = filtered.filter(r => r.agentId === runAgentId);
    if (runDatasetId) filtered = filtered.filter(r => r.datasetId === runDatasetId);
    return [...filtered].sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime());
  }, [runs, filterAgentId, runAgentId, runDatasetId]);

  const startRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/eval/runs", {
        agentId: runAgentId,
        agentVersion: runAgentVersion.trim() || undefined,
        datasetId: runDatasetId,
        metricIds: selectedMetricIds,
        metricCollectionId: selectedCollectionId === "__none__" ? undefined : selectedCollectionId,
        judgeModelOverride: judgeModel === "__default__" ? undefined : judgeModel,
        triggeredBy: "user",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Failed to start run");
      }
      return res.json();
    },
    onSuccess: (data: EvalTestRun) => {
      qc.invalidateQueries({ queryKey: ["/api/eval/runs"] });
      toast({ title: "Run started", description: `Run ${data.id.slice(0, 8)} is now queued.` });
      setConfigOpen(false);
      navigate(`/evals/runs/${data.id}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const canStartRun = !!runAgentId && !!runDatasetId;

  const toggleMetric = (id: string) => {
    setSelectedMetricIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

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
          <Link href="/evals/datasets">
            <Button variant="outline" size="sm" data-testid="button-nav-datasets">
              <Database className="w-4 h-4 mr-1.5" />
              Datasets
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => setConfigOpen((o) => !o)}
            data-testid="button-new-run"
          >
            <Play className="w-4 h-4 mr-1.5" />
            New Run
          </Button>
        </div>
      </div>

      {/* New Run config card */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <CollapsibleContent>
          <Card className="border-primary/30 bg-primary/5" data-testid="card-run-config">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Configure New Eval Run
                </span>
                <button
                  onClick={() => setConfigOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-close-config"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Agent */}
                <div>
                  <Label className="text-xs mb-1.5 block font-medium">
                    <Bot className="w-3 h-3 inline mr-1" />
                    Agent *
                  </Label>
                  <Select value={runAgentId} onValueChange={setRunAgentId}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-run-agent">
                      <SelectValue placeholder="Select agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(agents ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Agent version */}
                <div>
                  <Label className="text-xs mb-1.5 block font-medium">Agent Version</Label>
                  <Input
                    value={runAgentVersion}
                    onChange={(e) => setRunAgentVersion(e.target.value)}
                    placeholder="e.g. v2.1 (optional)"
                    className="h-8 text-xs"
                    data-testid="input-run-agent-version"
                  />
                </div>

                {/* Dataset */}
                <div>
                  <Label className="text-xs mb-1.5 block font-medium">
                    <Database className="w-3 h-3 inline mr-1" />
                    Dataset *
                  </Label>
                  <Select value={runDatasetId} onValueChange={setRunDatasetId}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-run-dataset">
                      <SelectValue placeholder="Select dataset..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(datasets ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} · v{d.version ?? 1} · {d.goldenCount ?? 0} goldens
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Metric Collection */}
                <div>
                  <Label className="text-xs mb-1.5 block font-medium">
                    <Hash className="w-3 h-3 inline mr-1" />
                    Metric Collection
                  </Label>
                  <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-metric-collection">
                      <SelectValue placeholder="None (use individual metrics)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (use individual metrics)</SelectItem>
                      {(metricCollections ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Judge model */}
                <div>
                  <Label className="text-xs mb-1.5 block font-medium">Judge Model</Label>
                  <Select value={judgeModel} onValueChange={setJudgeModel}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-judge-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Default (auto)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Start button */}
                <div className="flex items-end">
                  <Button
                    className="w-full h-8"
                    disabled={!canStartRun || startRunMutation.isPending}
                    onClick={() => startRunMutation.mutate()}
                    data-testid="button-start-run"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    {startRunMutation.isPending ? "Starting..." : "Start Run"}
                  </Button>
                </div>
              </div>

              {/* Metric multi-select */}
              {metrics.length > 0 && (
                <div className="mt-4">
                  <Label className="text-xs mb-2 block font-medium">
                    <ListChecks className="w-3 h-3 inline mr-1" />
                    Individual Metrics ({selectedMetricIds.length} selected)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {metrics.slice(0, 30).map((m) => {
                      const active = selectedMetricIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMetric(m.id)}
                          className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary/50"
                          }`}
                          data-testid={`toggle-metric-${m.id}`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

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
                  ? "This agent has no eval runs. Configure metrics and trigger a run."
                  : "No eval runs have been recorded. Select an agent and dataset above to start."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => setConfigOpen(true)}
                data-testid="button-empty-new-run"
              >
                <Play className="w-4 h-4 mr-1.5" />
                Start First Run
              </Button>
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
                        {(run.status === "running" || run.status === "pending") && run.totalGoldens != null && (
                          <span className="text-xs text-muted-foreground">
                            {(run.passedCount ?? 0) + (run.failedCount ?? 0)}/{run.totalGoldens} evaluated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Bot className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{agentName}</span>
                        {run.agentVersion && (
                          <span className="text-[10px] text-muted-foreground/60">· v{run.agentVersion}</span>
                        )}
                        {run.datasetId && (
                          <span className="text-[10px] text-muted-foreground/60">
                            · dataset {run.datasetId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right flex flex-col gap-0.5">
                      <div className="text-xs text-muted-foreground">
                        {formatDate(run.completedAt ?? run.startedAt)}
                      </div>
                      {run.totalGoldens != null && (
                        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 justify-end">
                          <Hash className="w-2.5 h-2.5" />
                          {run.totalGoldens} cases
                        </div>
                      )}
                      {(() => {
                        const s = run.startedAt ? new Date(run.startedAt as unknown as string).getTime() : null;
                        const e = run.completedAt ? new Date(run.completedAt as unknown as string).getTime() : null;
                        const durSec = s && e ? Math.round((e - s) / 1000) : null;
                        return durSec != null ? (
                          <div className="text-[10px] text-muted-foreground/60">
                            {durSec < 60 ? `${durSec}s` : `${Math.floor(durSec / 60)}m ${durSec % 60}s`}
                          </div>
                        ) : null;
                      })()}
                      {run.costUsd != null && run.costUsd > 0 && (
                        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 justify-end">
                          <DollarSign className="w-2.5 h-2.5" />
                          {run.costUsd.toFixed(3)}
                        </div>
                      )}
                      {run.triggeredBy && (
                        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 justify-end">
                          <User className="w-2.5 h-2.5" />
                          {run.triggeredBy}
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
