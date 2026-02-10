import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Play, Loader2, Bot, Clock, Shield,
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  CheckCircle, XCircle, Eye, EyeOff, BarChart3,
} from "lucide-react";

const timeWindows = [
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const redactionLevels = [
  { value: "none", label: "No redaction", description: "Full data visible", icon: Eye },
  { value: "pii", label: "Redact PII", description: "Mask personal information", icon: EyeOff },
  { value: "full", label: "Full redaction", description: "Anonymize all data", icon: Shield },
];

type ReplayResult = {
  summary: string;
  tracesReplayed: number;
  passCount: number;
  failCount: number;
  divergences: Array<{
    traceId: string;
    originalOutput: string;
    replayOutput: string;
    divergenceType: string;
  }>;
  metrics: {
    accuracy: number;
    policyBlocks: number;
    avgCostOriginal: number;
    avgCostReplay: number;
    avgLatencyOriginal: number;
    avgLatencyReplay: number;
  };
};

export default function ShadowReplay() {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState("");
  const [timeWindow, setTimeWindow] = useState("24h");
  const [candidateVersion, setCandidateVersion] = useState("");
  const [redactionLevel, setRedactionLevel] = useState("none");
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });

  const activeAgents = useMemo(() => {
    return (agents || []).filter((a) => a.status === "active" || a.status === "running");
  }, [agents]);

  const selectedAgentData = useMemo(() => {
    return agents?.find((a) => a.id === selectedAgent);
  }, [agents, selectedAgent]);

  const versionOptions = useMemo(() => {
    if (!selectedAgentData) return [];
    const current = Number(selectedAgentData.currentVersion) || 1;
    return Array.from({ length: Math.min(current + 1, 10) }, (_, i) => ({
      value: String(current - i),
      label: `v${current - i}${i === 0 ? " (current)" : ""}`,
    }));
  }, [selectedAgentData]);

  const replayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${selectedAgent}/shadow-replay`, {
        timeWindow,
        environment: "prod",
        sampleSize: 100,
        candidateVersion,
        redactionLevel,
      });
      return res.json();
    },
    onSuccess: (data: ReplayResult) => {
      setReplayResult(data);
      toast({ title: "Shadow replay complete", description: data.summary });
    },
    onError: (error: Error) => {
      toast({ title: "Replay failed", description: error.message, variant: "destructive" });
    },
  });

  const canRun = selectedAgent && timeWindow && candidateVersion;

  if (agentsLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-shadow-replay">
      <div className="flex items-center gap-3">
        <Link href="/evals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
          <Play className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Shadow Replay</h1>
          <p className="text-sm text-muted-foreground">Replay historical traces against a candidate version to detect behavioral divergences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Agent</Label>
                <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); setCandidateVersion(""); setReplayResult(null); }}>
                  <SelectTrigger data-testid="select-agent">
                    <Bot className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Prod Runs Time Window</Label>
                <Select value={timeWindow} onValueChange={setTimeWindow}>
                  <SelectTrigger data-testid="select-time-window">
                    <Clock className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeWindows.map((tw) => (
                      <SelectItem key={tw.value} value={tw.value}>{tw.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Candidate Version</Label>
                <Select value={candidateVersion} onValueChange={setCandidateVersion} disabled={!selectedAgent}>
                  <SelectTrigger data-testid="select-candidate-version">
                    <SelectValue placeholder={selectedAgent ? "Select version..." : "Select agent first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {versionOptions.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Redaction Level</Label>
                <div className="flex flex-col gap-2">
                  {redactionLevels.map((level) => {
                    const Icon = level.icon;
                    const isSelected = redactionLevel === level.value;
                    return (
                      <div
                        key={level.value}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer toggle-elevate ${isSelected ? "toggle-elevated border-primary/30" : "border-border"}`}
                        onClick={() => setRedactionLevel(level.value)}
                        data-testid={`option-redaction-${level.value}`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex flex-col gap-0">
                          <span className="text-xs font-medium">{level.label}</span>
                          <span className="text-[10px] text-muted-foreground">{level.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                className="w-full mt-2"
                disabled={!canRun || replayMutation.isPending}
                onClick={() => replayMutation.mutate()}
                data-testid="button-run-replay"
              >
                {replayMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Running Replay...</>
                ) : (
                  <><Play className="w-4 h-4 mr-1.5" /> Run Shadow Replay</>
                )}
              </Button>
            </CardContent>
          </Card>

          {selectedAgentData && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Selected Agent</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Name</span>
                  <span className="text-sm font-medium" data-testid="text-agent-name">{selectedAgentData.name}</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Current Version</span>
                  <Badge variant="outline" className="text-[10px]">v{selectedAgentData.currentVersion}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Badge variant="outline" className="text-[10px]">{selectedAgentData.modelProvider}/{selectedAgentData.modelName}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-muted-foreground">Risk Tier</span>
                  <Badge variant="outline" className="text-[10px]">{selectedAgentData.riskTier}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          {!replayResult && !replayMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Play className="w-12 h-12 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Configure and run a shadow replay</p>
                  <p className="text-xs text-muted-foreground mt-1">Select an agent, time window, and candidate version to compare behavior</p>
                </div>
              </CardContent>
            </Card>
          )}

          {replayMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-medium">Running shadow replay...</p>
                  <p className="text-xs text-muted-foreground mt-1">Replaying production traces against candidate version</p>
                </div>
              </CardContent>
            </Card>
          )}

          {replayResult && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Delta Summary</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {replayResult.tracesReplayed} traces replayed
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2 p-4 rounded-md border border-border" data-testid="delta-accuracy">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-muted-foreground font-medium">Accuracy</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold" data-testid="text-accuracy">
                          {(replayResult.metrics.accuracy * 100).toFixed(1)}%
                        </span>
                        {replayResult.metrics.accuracy >= 0.95 ? (
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                        ) : replayResult.metrics.accuracy >= 0.8 ? (
                          <TrendingUp className="w-4 h-4 text-amber-500" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <Progress
                        value={replayResult.metrics.accuracy * 100}
                        className={`h-2 ${replayResult.metrics.accuracy >= 0.95 ? "[&>div]:bg-emerald-500" : replayResult.metrics.accuracy >= 0.8 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
                      />
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{replayResult.passCount} matched</span>
                        <span>{replayResult.failCount} diverged</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 p-4 rounded-md border border-border" data-testid="delta-policy-blocks">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span className="text-xs text-muted-foreground font-medium">Policy Blocks</span>
                      </div>
                      <span className="text-2xl font-bold" data-testid="text-policy-blocks">
                        {replayResult.metrics.policyBlocks}
                      </span>
                      <div className="text-[10px] text-muted-foreground">
                        {replayResult.metrics.policyBlocks === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">No policy violations detected</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            {replayResult.metrics.policyBlocks} traces blocked by policy
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 p-4 rounded-md border border-border" data-testid="delta-cost">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-muted-foreground font-medium">Cost Comparison</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Original avg</span>
                          <span className="text-sm font-medium">${replayResult.metrics.avgCostOriginal.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Replay avg</span>
                          <span className="text-sm font-medium">${replayResult.metrics.avgCostReplay.toFixed(4)}</span>
                        </div>
                        {(() => {
                          const diff = replayResult.metrics.avgCostReplay - replayResult.metrics.avgCostOriginal;
                          const pct = replayResult.metrics.avgCostOriginal > 0
                            ? ((diff / replayResult.metrics.avgCostOriginal) * 100)
                            : 0;
                          return (
                            <div className={`flex items-center gap-1 text-xs font-medium mt-1 ${diff <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {diff <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                              {diff <= 0 ? "" : "+"}{pct.toFixed(1)}% cost change
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Latency Comparison</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground">Original Avg</span>
                        <span className="text-lg font-bold">{replayResult.metrics.avgLatencyOriginal}ms</span>
                      </div>
                      <div className="text-muted-foreground">→</div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground">Replay Avg</span>
                        <span className="text-lg font-bold">{replayResult.metrics.avgLatencyReplay}ms</span>
                      </div>
                      {(() => {
                        const diff = replayResult.metrics.avgLatencyReplay - replayResult.metrics.avgLatencyOriginal;
                        const pct = replayResult.metrics.avgLatencyOriginal > 0
                          ? ((diff / replayResult.metrics.avgLatencyOriginal) * 100)
                          : 0;
                        return (
                          <Badge variant="outline" className={`text-[10px] ${diff <= 0 ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "text-red-600 dark:text-red-400 border-red-500/20"}`}>
                            {diff <= 0 ? "" : "+"}{pct.toFixed(1)}%
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {replayResult.divergences.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <CardTitle className="text-sm font-medium">Divergences</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                      {replayResult.divergences.length} found
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      {replayResult.divergences.map((div, idx) => (
                        <div key={idx} className="flex flex-col gap-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5" data-testid={`divergence-${idx}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              <span className="text-xs font-medium font-mono">{div.traceId}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px]">{div.divergenceType}</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-muted-foreground font-medium">Original Output</span>
                              <pre className="text-[11px] font-mono text-muted-foreground p-2 rounded bg-muted/30 overflow-auto max-h-24 whitespace-pre-wrap">
                                {div.originalOutput}
                              </pre>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-muted-foreground font-medium">Replay Output</span>
                              <pre className="text-[11px] font-mono text-muted-foreground p-2 rounded bg-muted/30 overflow-auto max-h-24 whitespace-pre-wrap">
                                {div.replayOutput}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
