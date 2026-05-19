import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Star,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Users,
  ChevronRight,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Clock,
  Award,
  TrendingUp,
  Info,
  Eye,
  FileText,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface MetricRating {
  stars: number;
  passFail: boolean | null;
  note: string;
}

interface RatingMap {
  overall: MetricRating & { correctedOutput?: string };
  [metric: string]: MetricRating | (MetricRating & { correctedOutput?: string });
}

interface AnnotationQueueItem {
  trace: {
    id: string;
    runId: string;
    goldenId: string;
    scores: Record<string, { score: number; passed: boolean; reason?: string }> | null;
    passFail: boolean | null;
    latencyMs: number | null;
    costUsd: number | null;
    agentFailed: boolean;
    createdAt: string;
  };
  golden: {
    id: string;
    input: string;
    expectedOutput: string | null;
    retrievalContext?: string[] | null;
    tags: string[] | null;
  } | null;
  agentId: string | null;
  agentName: string | null;
  priority: "disagreement" | "failing" | "low_confidence" | "sampled";
  autoJudgeScore: number | null;
  existingAnnotations: Array<{
    id: string;
    annotatorId: string;
    ratings: Record<string, any>;
    comment: string | null;
    isEdgeCase: boolean | null;
    promotedToGoldenId: string | null;
    createdAt: string;
  }>;
  iaaStats: { kappa: number; consensus: number } | null;
}

interface AnnotationDetail {
  trace: AnnotationQueueItem["trace"];
  golden: AnnotationQueueItem["golden"] | null;
  rootSpan: { actualOutput: string | null; actualContext: any; durationMs: number | null } | null;
  existingAnnotations: AnnotationQueueItem["existingAnnotations"];
  perMetricIaa: Record<string, { kappa: number; consensus: string; annotatorCount: number }>;
}

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: AnnotationQueueItem["priority"] }) {
  const map = {
    disagreement: { label: "Disagreement", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertTriangle className="h-3 w-3" /> },
    failing: { label: "Failing", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <XCircle className="h-3 w-3" /> },
    low_confidence: { label: "Low Confidence", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <AlertTriangle className="h-3 w-3" /> },
    sampled: { label: "Sampled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <Zap className="h-3 w-3" /> },
  };
  const cfg = map[priority];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Star rating widget ────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          data-testid={`star-rating-${i}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={`h-5 w-5 transition-colors ${
              i <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ── Kappa color ───────────────────────────────────────────────────────────────

function KappaLabel({ kappa }: { kappa: number }) {
  const color = kappa >= 0.6 ? "text-green-600" : kappa >= 0.2 ? "text-yellow-600" : "text-red-600";
  return <span className={`text-xl font-bold ${color}`}>{kappa.toFixed(2)}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvalAnnotate() {
  const { toast } = useToast();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ratings, setRatings] = useState<RatingMap>({ overall: { stars: 0, passFail: null, note: "", correctedOutput: "" } });
  const [comment, setComment] = useState("");
  const [isEdgeCase, setIsEdgeCase] = useState(false);
  const [promoteToGolden, setPromoteToGolden] = useState(false);

  const { data: queue = [], isLoading } = useQuery<AnnotationQueueItem[]>({
    queryKey: ["/api/eval/annotation-queue"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/eval/annotations/stats"],
  });

  const currentItem = queue[selectedIdx];

  // Detailed annotation info: actual output, retrieval context, per-metric IAA
  const { data: detail } = useQuery<AnnotationDetail>({
    queryKey: ["/api/eval/traces", currentItem?.trace?.id, "annotation-detail"],
    queryFn: () =>
      apiRequest("GET", `/api/eval/traces/${currentItem!.trace.id}/annotation-detail`).then(r => r.json()),
    enabled: !!currentItem?.trace?.id,
  });

  const metricKeys = currentItem?.trace?.scores ? Object.keys(currentItem.trace.scores) : [];

  const setMetricRating = (metric: string, field: keyof MetricRating | "correctedOutput", value: any) => {
    setRatings(prev => ({
      ...prev,
      [metric]: { ...(prev[metric] ?? { stars: 0, passFail: null, note: "" }), [field]: value },
    }));
  };

  const saveAnnotation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/eval/annotations", data).then(r => r.json()),
    onSuccess: (result) => {
      toast({
        title: result.promotedToGoldenId ? "Annotation saved & promoted to golden" : "Annotation saved",
        description: result.promotedToGoldenId
          ? `Golden #${result.promotedToGoldenId.slice(0, 8)} created in source dataset.`
          : "Your rating has been recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/annotation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/annotations/stats"] });
      if (selectedIdx < queue.length - 1) {
        setSelectedIdx(idx => idx + 1);
      }
      resetForm();
    },
    onError: () => toast({ title: "Error saving annotation", variant: "destructive" }),
  });

  const resetForm = () => {
    setRatings({ overall: { stars: 0, passFail: null, note: "", correctedOutput: "" } });
    setComment("");
    setIsEdgeCase(false);
    setPromoteToGolden(false);
  };

  useEffect(() => { resetForm(); }, [selectedIdx]);

  const canSubmit = ratings.overall.stars > 0 || ratings.overall.passFail !== null;

  const existingAnnotations = detail?.existingAnnotations ?? currentItem?.existingAnnotations ?? [];
  const perMetricIaa = detail?.perMetricIaa ?? {};
  const actualOutput = detail?.rootSpan?.actualOutput ?? null;
  const retrievalContext: string[] = (detail?.golden?.retrievalContext ?? currentItem?.golden?.retrievalContext ?? []) as string[];

  return (
    <div className="flex h-full">
      {/* ── Left: queue list ── */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Annotation Queue</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${queue.length} traces pending`}
          </p>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              Queue is empty — all traces reviewed!
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {queue.map((item, i) => (
                <button
                  key={item.trace.id}
                  data-testid={`queue-item-${item.trace.id}`}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left rounded-lg p-3 transition-colors ${
                    i === selectedIdx
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{item.trace.id.slice(0, 8)}</span>
                    <PriorityBadge priority={item.priority} />
                  </div>
                  <p className="text-xs text-foreground line-clamp-2 mt-1">
                    {item.golden?.input ?? "No input available"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {item.existingAnnotations.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Users className="h-3 w-3" /> {item.existingAnnotations.length}
                      </span>
                    )}
                    {item.autoJudgeScore !== null && (
                      <span className="text-xs text-muted-foreground">
                        Judge: {Math.round(item.autoJudgeScore * 100)}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Center: annotation form ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!currentItem ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Select a trace to annotate</p>
              <p className="text-sm mt-1">Pick an item from the queue on the left</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6 max-w-3xl mx-auto">
              {/* Trace header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold">Trace {currentItem.trace.id.slice(0, 12)}…</h2>
                    <PriorityBadge priority={currentItem.priority} />
                    {currentItem.agentName && (
                      <Badge variant="outline" className="text-xs">{currentItem.agentName}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentItem.trace.createdAt ? new Date(currentItem.trace.createdAt).toLocaleString() : ""}
                    {currentItem.trace.latencyMs != null && ` · ${currentItem.trace.latencyMs}ms`}
                    {currentItem.trace.costUsd != null && ` · $${currentItem.trace.costUsd.toFixed(4)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="skip-trace-btn"
                    onClick={() => setSelectedIdx(idx => Math.min(idx + 1, queue.length - 1))}
                    disabled={selectedIdx >= queue.length - 1}
                  >
                    Skip <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Input / Expected / Actual Output */}
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Input Prompt</p>
                  <p className="text-sm whitespace-pre-wrap">{currentItem.golden?.input ?? "—"}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Expected Output</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {currentItem.golden?.expectedOutput ?? "No expected output defined"}
                  </p>
                </div>
                {actualOutput !== null && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10 p-4">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Actual Agent Output
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{actualOutput}</p>
                  </div>
                )}
                {retrievalContext.length > 0 && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Retrieval Context ({retrievalContext.length} chunk{retrievalContext.length !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {retrievalContext.map((chunk, i) => (
                        <div key={i} className="rounded bg-muted/40 p-2">
                          <p className="text-xs text-muted-foreground font-mono">Chunk {i + 1}</p>
                          <p className="text-xs whitespace-pre-wrap mt-0.5 line-clamp-3">{chunk}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {currentItem.trace.agentFailed && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4">
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Agent Failed</p>
                    <p className="text-sm text-red-700 dark:text-red-400">The agent invocation failed to produce a response.</p>
                  </div>
                )}
                {/* Auto-judge scores */}
                {currentItem.trace.scores && Object.keys(currentItem.trace.scores).length > 0 && (
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Auto-Judge Scores</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(currentItem.trace.scores).map(([metric, result]) => (
                        <div key={metric} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                          <span className="text-xs text-muted-foreground truncate">{metric}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-mono font-medium">{(result.score * 100).toFixed(0)}%</span>
                            {result.passed
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            {/* Per-metric IAA kappa inline */}
                            {perMetricIaa[metric] && (
                              <span className={`text-[10px] font-mono ml-1 ${
                                perMetricIaa[metric].kappa >= 0.6 ? "text-green-600" :
                                perMetricIaa[metric].kappa >= 0.2 ? "text-yellow-600" : "text-red-600"
                              }`}>
                                κ={perMetricIaa[metric].kappa.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Overall judge score</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {currentItem.autoJudgeScore !== null ? `${Math.round(currentItem.autoJudgeScore * 100)}%` : "—"}
                        </span>
                        {currentItem.trace.passFail !== null && (
                          currentItem.trace.passFail
                            ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">PASS</Badge>
                            : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">FAIL</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── IAA panel ── */}
              {existingAnnotations.length > 0 && (
                <Card className="border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      Inter-Annotator Agreement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Overall IAA */}
                    {currentItem.iaaStats && (
                      <div className="flex items-center gap-6 pb-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Overall κ</p>
                          <KappaLabel kappa={currentItem.iaaStats.kappa} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Consensus</p>
                          <p className="text-sm font-semibold">
                            {currentItem.iaaStats.consensus > 0 ? (
                              <span className="text-green-600 flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Pass</span>
                            ) : (
                              <span className="text-red-600 flex items-center gap-1"><ThumbsDown className="h-3.5 w-3.5" /> Fail</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Annotators</p>
                          <p className="text-sm font-semibold">{existingAnnotations.length}</p>
                        </div>
                      </div>
                    )}

                    {/* Per-metric IAA */}
                    {Object.keys(perMetricIaa).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Per-Metric IAA</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(perMetricIaa).map(([metric, iaa]) => (
                            <div key={metric} className="flex items-center justify-between text-xs bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
                              <span className="text-muted-foreground truncate mr-2">{metric}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <KappaLabel kappa={iaa.kappa} />
                                <span className={`text-[10px] ${
                                  iaa.consensus === "pass" ? "text-green-600" :
                                  iaa.consensus === "fail" ? "text-red-600" : "text-yellow-600"
                                }`}>
                                  {iaa.consensus}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Existing annotation list */}
                    <div className="space-y-1.5">
                      {existingAnnotations.map(ann => (
                        <div key={ann.id} className="flex items-center justify-between text-xs bg-white/60 dark:bg-white/5 rounded px-2 py-1.5">
                          <span className="font-mono text-muted-foreground">{ann.annotatorId.slice(0, 16)}</span>
                          <div className="flex items-center gap-2">
                            {ann.ratings?.overall?.stars && (
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {ann.ratings.overall.stars}/5
                              </span>
                            )}
                            {ann.ratings?.overall?.passFail === true && <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30">PASS</Badge>}
                            {ann.ratings?.overall?.passFail === false && <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30">FAIL</Badge>}
                            {ann.isEdgeCase && <Badge variant="outline" className="text-[10px]">Edge</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Rating form ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Your Annotation</h3>
                  <span className="text-xs text-muted-foreground">Overall rating required</span>
                </div>

                {/* Overall rating */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <Label className="font-semibold">Overall Quality</Label>
                      <div className="flex items-center gap-3">
                        <StarRating
                          value={ratings.overall?.stars ?? 0}
                          onChange={v => setMetricRating("overall", "stars", v)}
                        />
                        <Button
                          variant={ratings.overall?.passFail === true ? "default" : "outline"}
                          size="sm"
                          data-testid="overall-pass-btn"
                          className={`h-7 gap-1 ${ratings.overall?.passFail === true ? "bg-green-600 hover:bg-green-700" : ""}`}
                          onClick={() => setMetricRating("overall", "passFail", ratings.overall?.passFail === true ? null : true)}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" /> Pass
                        </Button>
                        <Button
                          variant={ratings.overall?.passFail === false ? "default" : "outline"}
                          size="sm"
                          data-testid="overall-fail-btn"
                          className={`h-7 gap-1 ${ratings.overall?.passFail === false ? "bg-red-600 hover:bg-red-700" : ""}`}
                          onClick={() => setMetricRating("overall", "passFail", ratings.overall?.passFail === false ? null : false)}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" /> Fail
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      placeholder="Note on overall quality (optional)…"
                      data-testid="overall-note-textarea"
                      value={(ratings.overall as any)?.note ?? ""}
                      onChange={e => setMetricRating("overall", "note", e.target.value)}
                      className="h-16 text-sm resize-none"
                    />
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Corrected Expected Output (optional)</Label>
                      <Textarea
                        placeholder="Provide the correct expected output if different from golden…"
                        data-testid="corrected-output-textarea"
                        value={(ratings.overall as any)?.correctedOutput ?? ""}
                        onChange={e => setMetricRating("overall", "correctedOutput", e.target.value)}
                        className="h-16 text-sm resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Per-metric ratings with notes */}
                {metricKeys.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per-Metric Ratings</p>
                    {metricKeys.map(metric => {
                      const judgeResult = currentItem.trace.scores?.[metric];
                      const myRating = ratings[metric] as MetricRating | undefined;
                      const iaa = perMetricIaa[metric];
                      return (
                        <Card key={metric} className="border-dashed">
                          <CardContent className="pt-3 pb-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{metric}</span>
                                {judgeResult && (
                                  <span className="text-xs text-muted-foreground">
                                    (Judge: {(judgeResult.score * 100).toFixed(0)}% — {judgeResult.passed ? "PASS" : "FAIL"})
                                  </span>
                                )}
                                {iaa && (
                                  <span className={`text-xs font-mono ${
                                    iaa.kappa >= 0.6 ? "text-green-600" :
                                    iaa.kappa >= 0.2 ? "text-yellow-600" : "text-red-600"
                                  }`}>
                                    κ={iaa.kappa.toFixed(2)} ({iaa.consensus}, n={iaa.annotatorCount})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <StarRating
                                  value={myRating?.stars ?? 0}
                                  onChange={v => setMetricRating(metric, "stars", v)}
                                />
                                <button
                                  data-testid={`metric-pass-${metric}`}
                                  onClick={() => setMetricRating(metric, "passFail", myRating?.passFail === true ? null : true)}
                                  className={`p-1 rounded transition-colors ${myRating?.passFail === true ? "text-green-600" : "text-muted-foreground hover:text-green-600"}`}
                                >
                                  <ThumbsUp className="h-4 w-4" />
                                </button>
                                <button
                                  data-testid={`metric-fail-${metric}`}
                                  onClick={() => setMetricRating(metric, "passFail", myRating?.passFail === false ? null : false)}
                                  className={`p-1 rounded transition-colors ${myRating?.passFail === false ? "text-red-600" : "text-muted-foreground hover:text-red-600"}`}
                                >
                                  <ThumbsDown className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <Textarea
                              placeholder={`Note on ${metric} (optional)…`}
                              data-testid={`metric-note-${metric}`}
                              value={myRating?.note ?? ""}
                              onChange={e => setMetricRating(metric, "note", e.target.value)}
                              className="h-12 text-xs resize-none"
                            />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Comment */}
                <div>
                  <Label className="text-sm mb-1.5 block">Comment</Label>
                  <Textarea
                    placeholder="Add a detailed annotation note…"
                    data-testid="annotation-comment-textarea"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="h-20 text-sm"
                  />
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-6 py-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="edge-case"
                      data-testid="edge-case-switch"
                      checked={isEdgeCase}
                      onCheckedChange={setIsEdgeCase}
                    />
                    <Label htmlFor="edge-case" className="text-sm">Tag as Edge Case</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="promote-golden"
                      data-testid="promote-golden-switch"
                      checked={promoteToGolden}
                      onCheckedChange={setPromoteToGolden}
                    />
                    <Label htmlFor="promote-golden" className="text-sm flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Promote to Golden
                    </Label>
                  </div>
                </div>

                {/* Auto-dataset info when promote is on */}
                {promoteToGolden && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <span>
                      A new golden will be created in the <strong>same dataset</strong> as the original golden.
                      The corrected expected output above (if provided) will be used.
                    </span>
                  </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="reset-annotation-btn"
                    onClick={resetForm}
                  >
                    Reset
                  </Button>
                  <Button
                    data-testid="save-annotation-btn"
                    disabled={!canSubmit || saveAnnotation.isPending}
                    onClick={() => saveAnnotation.mutate({
                      traceId: currentItem.trace.id,
                      ratings,
                      comment: comment || null,
                      promoteToGolden,
                      isEdgeCase,
                    })}
                  >
                    {saveAnnotation.isPending ? "Saving…" : "Save Annotation"}
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ── Right: annotator stats ── */}
      <div className="w-64 border-l flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm">Your Stats</h3>
          <p className="text-xs text-muted-foreground">Session annotator</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {stats ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Award className="h-3.5 w-3.5" /> Total Annotations
                    </div>
                    <span className="text-sm font-bold">{(stats as any).totalAnnotations}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> Peer Agreement
                    </div>
                    <span className={`text-sm font-bold ${
                      (stats as any).peerAgreementRate >= 80 ? "text-green-600" :
                      (stats as any).peerAgreementRate >= 60 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {(stats as any).peerAgreementRate !== null ? `${(stats as any).peerAgreementRate}%` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" /> Judge Agreement
                    </div>
                    <span className={`text-sm font-bold ${
                      (stats as any).judgeAgreementRate >= 80 ? "text-green-600" :
                      (stats as any).judgeAgreementRate >= 60 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {(stats as any).judgeAgreementRate !== null ? `${(stats as any).judgeAgreementRate}%` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Goldens Created
                    </div>
                    <span className="text-sm font-bold">{(stats as any).promotedToGolden}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" /> Edge Cases
                    </div>
                    <span className="text-sm font-bold">{(stats as any).edgeCasesTagged}</span>
                  </div>
                </div>

                <Separator />

                {/* Recent annotations */}
                {(stats as any).recentAnnotations?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent</p>
                    <div className="space-y-2">
                      {(stats as any).recentAnnotations.map((ann: any) => (
                        <div key={ann.id} className="text-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-muted-foreground">{ann.traceId.slice(0, 10)}…</span>
                            {ann.ratings?.overall?.passFail === true
                              ? <span className="text-green-600 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> Pass</span>
                              : ann.ratings?.overall?.passFail === false
                              ? <span className="text-red-600 flex items-center gap-0.5"><XCircle className="h-3 w-3" /> Fail</span>
                              : <span className="text-muted-foreground">—</span>}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(ann.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-6 rounded bg-muted animate-pulse" />)}
              </div>
            )}

            <Separator />

            <div className="text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>Rate each trace independently. Your ratings calibrate the auto-judge and improve golden datasets.</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
