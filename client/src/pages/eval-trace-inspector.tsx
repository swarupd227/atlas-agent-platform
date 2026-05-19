import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { marked } from "marked";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/components/role-provider";
import type { Agent, EvalTrace, EvalSpan, EvalGolden, EvalTestRun } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Bot,
  Sparkles,
  Wrench,
  BookOpen,
  Puzzle,
  ChevronRight,
  ChevronDown,
  Clock,
  DollarSign,
  Cpu,
  Shield,
  ShieldCheck,
  FlaskConical,
  GitCompare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Hash,
  Activity,
  Coins,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

// ── marked config ─────────────────────────────────────────────────────────────

marked.setOptions({ breaks: true });

function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SpanNode = EvalSpan & { children: SpanNode[] };

type TraceWithSpans = EvalTrace & {
  spans: EvalSpan[];
  spanTree: SpanNode[];
};

type ScoreEntry =
  | number
  | {
      score?: number;
      threshold?: number;
      passed?: boolean;
      reason?: string;
      judgeModel?: string;
      tokenCost?: number;
    };

function parseScores(scores: unknown): Record<string, ScoreEntry> {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return {};
  return scores as Record<string, ScoreEntry>;
}

function scoreValue(entry: ScoreEntry): number | null {
  if (typeof entry === "number") return entry;
  if (typeof entry === "object" && entry.score != null) return entry.score;
  return null;
}

function scoreThreshold(entry: ScoreEntry): number {
  if (typeof entry === "object" && entry.threshold != null) return entry.threshold;
  return 0.7;
}

function scorePassed(entry: ScoreEntry): boolean | null {
  if (typeof entry === "number") return null;
  if (typeof entry === "object" && entry.passed != null) return entry.passed;
  const v = scoreValue(entry);
  if (v == null) return null;
  return v >= scoreThreshold(entry);
}

function scoreReason(entry: ScoreEntry): string | null {
  if (typeof entry === "object" && entry.reason) return entry.reason;
  return null;
}

function scoreJudgeModel(entry: ScoreEntry): string | null {
  if (typeof entry === "object" && entry.judgeModel) return entry.judgeModel;
  return null;
}

function scoreTokenCost(entry: ScoreEntry): number | null {
  if (typeof entry === "object" && entry.tokenCost != null) return entry.tokenCost;
  return null;
}

// ── Span type helpers ─────────────────────────────────────────────────────────

function spanIcon(type: string) {
  switch (type) {
    case "llm": return Sparkles;
    case "tool": return Wrench;
    case "retriever": return BookOpen;
    case "agent": return Bot;
    default: return Puzzle;
  }
}

function spanTypeColor(type: string): string {
  switch (type) {
    case "llm": return "text-violet-500";
    case "tool": return "text-amber-500";
    case "retriever": return "text-blue-500";
    case "agent": return "text-emerald-500";
    default: return "text-muted-foreground";
  }
}

function spanTypeLabel(type: string): string {
  switch (type) {
    case "llm": return "LLM";
    case "tool": return "Tool";
    case "retriever": return "Retriever";
    case "agent": return "Agent";
    default: return type || "Custom";
  }
}

// ── Recursive span tree node ──────────────────────────────────────────────────

function SpanTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  highlightIds,
  missingIds,
}: {
  node: SpanNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  highlightIds?: Set<string>;
  missingIds?: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const Icon = spanIcon(node.spanType);
  const iconColor = spanTypeColor(node.spanType);
  const isSelected = selectedId === node.id;
  const scores = parseScores(node.scores);
  const scoreEntries = Object.entries(scores);
  const allPassed = scoreEntries.length > 0 && scoreEntries.every(([, v]) => scorePassed(v) !== false);
  const anyFailed = scoreEntries.some(([, v]) => scorePassed(v) === false);
  const dotColor = anyFailed
    ? "bg-red-500"
    : allPassed
    ? "bg-emerald-500"
    : "bg-muted-foreground/30";
  const isHighlighted = highlightIds?.has(node.id);
  const isMissing = missingIds?.has(node.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors text-xs ${
          isSelected
            ? "bg-primary/10 text-primary"
            : isMissing
            ? "bg-red-500/10 text-red-600/70 italic"
            : isHighlighted
            ? "bg-amber-500/10"
            : "hover:bg-muted/40"
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect(node.id)}
        data-testid={`span-node-${node.id}`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="w-3 h-3 shrink-0 flex items-center justify-center"
            data-testid={`span-toggle-${node.id}`}
          >
            {open ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
        <span className="flex-1 truncate font-medium">{node.name}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        {node.durationMs != null && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {node.durationMs < 1000
              ? `${node.durationMs}ms`
              : `${(node.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SpanTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              highlightIds={highlightIds}
              missingIds={missingIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── JSON / text renderer ──────────────────────────────────────────────────────

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  if (data == null) return null;
  const str =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const isLong = str.length > 300;
  const display = isLong && !expanded ? str.slice(0, 300) + "…" : str;
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <pre className="bg-muted/40 rounded-md p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-foreground/90 max-h-64 overflow-y-auto">
        {display}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-primary hover:underline mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// ── Markdown block ────────────────────────────────────────────────────────────

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-[11px] leading-relaxed [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_li]:mb-0.5 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

// ── Metric score card ─────────────────────────────────────────────────────────

function MetricCard({
  name,
  entry,
  defaultOpen,
}: {
  name: string;
  entry: ScoreEntry;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const v = scoreValue(entry);
  const t = scoreThreshold(entry);
  const passed = scorePassed(entry);
  const reason = scoreReason(entry);
  const judgeModel = scoreJudgeModel(entry);
  const tokenCost = scoreTokenCost(entry);
  const pct = v != null ? Math.round(v * 100) : null;

  return (
    <div className="border rounded-md overflow-hidden text-xs mb-2" data-testid={`metric-card-${name}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((x) => !x)}
      >
        <span className="font-medium flex-1 truncate">{name}</span>
        {passed === true ? (
          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            Pass
          </Badge>
        ) : passed === false ? (
          <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/20">
            Fail
          </Badge>
        ) : null}
        {pct != null && (
          <span
            className={`font-semibold tabular-nums ${
              pct >= 85 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
            }`}
          >
            {pct}%
          </span>
        )}
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>

      {/* Score bar always visible */}
      {v != null && (
        <div className="px-3 pb-2">
          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${
                v >= 0.85 ? "bg-emerald-500" : v >= 0.7 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${v * 100}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-foreground/40"
              style={{ left: `${t * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground">
            <span>0</span>
            <span className="text-foreground/60">threshold {Math.round(t * 100)}%</span>
            <span>100</span>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {open && (
        <div className="px-3 pb-3 border-t bg-muted/20 pt-2 space-y-2">
          {/* Judge model + token cost row */}
          {(judgeModel || tokenCost != null) && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {judgeModel && (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />{judgeModel}
                </span>
              )}
              {tokenCost != null && (
                <span className="flex items-center gap-1">
                  <Coins className="w-3 h-3" />{tokenCost.toLocaleString()} tokens
                </span>
              )}
            </div>
          )}
          {/* Reasoning rendered as markdown */}
          {reason ? (
            <div className="bg-muted/50 rounded-md p-2.5 max-h-48 overflow-y-auto">
              <MarkdownBlock text={reason} />
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No reasoning recorded</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Side-by-side span compare dialog ─────────────────────────────────────────

function SideBySideCompareDialog({
  open,
  onClose,
  currentTrace,
  baselineTrace,
}: {
  open: boolean;
  onClose: () => void;
  currentTrace: TraceWithSpans;
  baselineTrace: TraceWithSpans;
}) {
  const [leftSel, setLeftSel] = useState<string | null>(null);
  const [rightSel, setRightSel] = useState<string | null>(null);

  const currentNames = useMemo(
    () => new Set((currentTrace.spans ?? []).map((s) => s.name)),
    [currentTrace],
  );
  const baselineNames = useMemo(
    () => new Set((baselineTrace.spans ?? []).map((s) => s.name)),
    [baselineTrace],
  );

  const newSpanIds = useMemo(
    () => new Set(
      (currentTrace.spans ?? [])
        .filter((s) => !baselineNames.has(s.name))
        .map((s) => s.id),
    ),
    [currentTrace, baselineNames],
  );

  const removedSpanIds = useMemo(
    () => new Set(
      (baselineTrace.spans ?? [])
        .filter((s) => !currentNames.has(s.name))
        .map((s) => s.id),
    ),
    [baselineTrace, currentNames],
  );

  const currentScores = parseScores(currentTrace.scores);
  const baselineScores = parseScores(baselineTrace.scores);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0" data-testid="compare-dialog-sidebyside">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitCompare className="w-4 h-4 text-amber-600" />
            Trace Comparison
          </DialogTitle>
          <DialogDescription className="text-xs">
            Current run vs baseline &mdash; amber rows indicate differences
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left span tree — current */}
          <div className="w-1/2 border-r flex flex-col min-h-0">
            <div className="px-3 py-2 bg-muted/20 border-b shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
              <p className="text-[10px] text-muted-foreground">{currentTrace.runId.slice(0, 12)}</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {(currentTrace.spanTree ?? []).map((root) => (
                <SpanTreeNode
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedId={leftSel}
                  onSelect={setLeftSel}
                  highlightIds={newSpanIds}
                />
              ))}
            </div>
          </div>

          {/* Right span tree — baseline */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="px-3 py-2 bg-muted/20 border-b shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Baseline</p>
              <p className="text-[10px] text-muted-foreground">{baselineTrace.runId.slice(0, 12)}</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {(baselineTrace.spanTree ?? []).map((root) => (
                <SpanTreeNode
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedId={rightSel}
                  onSelect={setRightSel}
                  missingIds={removedSpanIds}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Metric delta table */}
        <div className="shrink-0 border-t overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Metric</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Current</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Baseline</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Latency */}
              {(() => {
                const changed = currentTrace.latencyMs !== baselineTrace.latencyMs;
                const delta = currentTrace.latencyMs != null && baselineTrace.latencyMs != null
                  ? currentTrace.latencyMs - baselineTrace.latencyMs : null;
                return (
                  <tr className={changed ? "bg-amber-500/5" : ""}>
                    <td className="px-3 py-1.5 font-medium text-muted-foreground">Latency</td>
                    <td className="px-3 py-1.5 font-mono">{currentTrace.latencyMs != null ? `${currentTrace.latencyMs}ms` : "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{baselineTrace.latencyMs != null ? `${baselineTrace.latencyMs}ms` : "—"}</td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${delta == null ? "" : delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {delta != null ? `${delta > 0 ? "+" : ""}${delta}ms` : "—"}
                    </td>
                  </tr>
                );
              })()}
              {/* Tokens */}
              {(() => {
                const changed = currentTrace.totalTokens !== baselineTrace.totalTokens;
                const delta = currentTrace.totalTokens != null && baselineTrace.totalTokens != null
                  ? currentTrace.totalTokens - baselineTrace.totalTokens : null;
                return (
                  <tr className={changed ? "bg-amber-500/5" : ""}>
                    <td className="px-3 py-1.5 font-medium text-muted-foreground">Tokens</td>
                    <td className="px-3 py-1.5 font-mono">{currentTrace.totalTokens ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{baselineTrace.totalTokens ?? "—"}</td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${delta == null ? "" : delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {delta != null ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
                    </td>
                  </tr>
                );
              })()}
              {/* Per-metric scores */}
              {Object.entries(currentScores).map(([metric, entry]) => {
                const baseEntry = (baselineScores as Record<string, ScoreEntry>)[metric];
                const cur = scoreValue(entry);
                const bas = baseEntry ? scoreValue(baseEntry) : null;
                const delta = cur != null && bas != null ? cur - bas : null;
                const changed = cur !== bas;
                return (
                  <tr key={metric} className={changed ? "bg-amber-500/5" : ""}>
                    <td className="px-3 py-1.5 font-medium text-muted-foreground">{metric}</td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${cur != null ? (cur >= 0.85 ? "text-emerald-600" : cur >= 0.7 ? "text-amber-600" : "text-red-600") : ""}`}>
                      {cur != null ? `${(cur * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${bas != null ? (bas >= 0.85 ? "text-emerald-600" : bas >= 0.7 ? "text-amber-600" : "text-red-600") : ""}`}>
                      {bas != null ? `${(bas * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${delta == null ? "" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {delta != null ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Metrics in baseline but not current */}
              {Object.keys(baselineScores)
                .filter((m) => !(m in currentScores))
                .map((metric) => {
                  const bas = scoreValue((baselineScores as Record<string, ScoreEntry>)[metric]);
                  return (
                    <tr key={metric} className="bg-amber-500/5">
                      <td className="px-3 py-1.5 font-medium text-muted-foreground">{metric}</td>
                      <td className="px-3 py-1.5 text-muted-foreground italic">—</td>
                      <td className="px-3 py-1.5 font-mono">{bas != null ? `${(bas * 100).toFixed(0)}%` : "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">removed</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 border-t px-4 py-3 flex justify-end gap-2">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mr-auto">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/20 border border-amber-500/40" /> New span</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/10 border border-red-500/20" /> Removed span</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Compare baseline run picker dialog ────────────────────────────────────────

function ComparePickerDialog({
  open,
  onClose,
  currentTrace,
  agentId,
  onSelectCompare,
}: {
  open: boolean;
  onClose: () => void;
  currentTrace: TraceWithSpans;
  agentId: string;
  onSelectCompare: (traceId: string) => void;
}) {
  const { data: runs } = useQuery<EvalTestRun[]>({ queryKey: ["/api/eval/runs"] });

  const candidates = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter(
        (r) =>
          r.id !== currentTrace.runId &&
          r.status === "completed" &&
          r.agentId === agentId,
      )
      .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime())
      .slice(0, 20);
  }, [runs, currentTrace.runId, agentId]);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!selectedRunId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/eval/runs/${selectedRunId}/traces?goldenId=${currentTrace.goldenId}&limit=1`,
      );
      const traces: EvalTrace[] = await res.json();
      if (!traces || traces.length === 0) {
        toast({ title: "No trace found", description: "This run has no trace for the same golden.", variant: "destructive" });
        return;
      }
      onSelectCompare(traces[0].id);
      onClose();
    } catch {
      toast({ title: "Failed to load comparison", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            Compare to Baseline Run
          </DialogTitle>
          <DialogDescription>
            Select a completed run for the same agent to compare spans and scores side-by-side.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto py-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No other completed runs for this agent</p>
          ) : (
            candidates.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRunId(r.id)}
                className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/40 ${
                  selectedRunId === r.id ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
                data-testid={`compare-run-${r.id}`}
              >
                <div className="font-mono font-medium">{r.id.slice(0, 16)}</div>
                <div className="text-muted-foreground mt-0.5">
                  {r.passRate != null ? `${Math.round(r.passRate * 100)}% pass` : "—"} ·{" "}
                  {r.startedAt ? formatDate(r.startedAt as string) : "—"}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selectedRunId || loading}
            onClick={handleConfirm}
            data-testid="button-confirm-compare"
          >
            {loading ? "Loading…" : "View Side-by-Side"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvalTraceInspector() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { role } = useRole();
  const isCompliance = role.id === "compliance_security";

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [compareTraceId, setCompareTraceId] = useState<string | null>(null);
  const [compareViewOpen, setCompareViewOpen] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: trace, isLoading } = useQuery<TraceWithSpans>({
    queryKey: ["/api/eval/traces", id],
    queryFn: async () => {
      const res = await fetch(`/api/eval/traces/${id}`);
      if (!res.ok) throw new Error("Trace not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: compareTrace } = useQuery<TraceWithSpans>({
    queryKey: ["/api/eval/traces", compareTraceId],
    queryFn: async () => {
      const res = await fetch(`/api/eval/traces/${compareTraceId}`);
      return res.json();
    },
    enabled: !!compareTraceId,
    onSuccess: () => setCompareViewOpen(true),
  } as any);

  const { data: run } = useQuery<EvalTestRun>({
    queryKey: ["/api/eval/runs", trace?.runId],
    queryFn: async () => {
      const res = await fetch(`/api/eval/runs/${trace!.runId}`);
      return res.json();
    },
    enabled: !!trace?.runId,
  });

  const { data: agent } = useQuery<Agent>({
    queryKey: ["/api/agents", run?.agentId],
    enabled: !!run?.agentId,
  });

  const { data: golden } = useQuery<EvalGolden>({
    queryKey: ["/api/eval/goldens", trace?.goldenId],
    queryFn: async () => {
      const res = await fetch(`/api/eval/goldens/${trace!.goldenId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!trace?.goldenId,
  });

  // ── Pin mutation ─────────────────────────────────────────────────────────

  const pinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/eval/traces/${id}`, {
        isPinned: true,
        pinnedBy: "compliance_security",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? "Failed to pin trace");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/traces", id] });
      toast({ title: "Trace pinned as evidence" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Flat map of spanTree nodes (for children lookup) ────────────────────

  const spanNodeMap = useMemo(() => {
    const map = new Map<string, SpanNode>();
    function walk(nodes: SpanNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        walk(n.children);
      }
    }
    walk(trace?.spanTree ?? []);
    return map;
  }, [trace]);

  // ── Derived state ────────────────────────────────────────────────────────

  const effectiveSelectedId = selectedSpanId ?? trace?.rootSpanId ?? trace?.spans?.[0]?.id ?? null;

  const selectedSpan = useMemo(() => {
    if (!trace) return null;
    return trace.spans?.find((s) => s.id === effectiveSelectedId) ?? null;
  }, [trace, effectiveSelectedId]);

  const activeScores = useMemo(() => {
    if (selectedSpan?.scores) {
      const s = parseScores(selectedSpan.scores);
      if (Object.keys(s).length > 0) return s;
    }
    return parseScores(trace?.scores);
  }, [selectedSpan, trace]);

  // ── Loading / not found states ───────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
          <Skeleton className="w-56 h-full shrink-0" />
          <Skeleton className="flex-1 h-full" />
          <Skeleton className="w-72 h-full shrink-0" />
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FlaskConical className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Trace not found</p>
        <Link href="/evals/runs">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Runs
          </Button>
        </Link>
      </div>
    );
  }

  const scoreEntries = Object.entries(activeScores);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b bg-background px-4 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/evals">
            <button className="hover:text-foreground transition-colors">Eval Studio</button>
          </Link>
          <ChevronRight className="w-3 h-3" />
          {trace.runId && (
            <>
              <Link href={`/evals/runs/${trace.runId}`}>
                <button className="hover:text-foreground transition-colors">Run</button>
              </Link>
              <ChevronRight className="w-3 h-3" />
            </>
          )}
          <span className="text-foreground font-medium">Trace</span>
        </div>

        <div className="h-4 w-px bg-border mx-0.5 shrink-0" />

        {/* Agent */}
        <div className="flex items-center gap-1.5 text-xs">
          <Bot className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold text-sm">{agent?.name ?? `Agent ${(run?.agentId ?? "").slice(0, 8)}`}</span>
          {run?.agentVersion && (
            <Badge variant="outline" className="text-[9px]">v{run.agentVersion}</Badge>
          )}
        </div>

        {/* Run ID */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-0.5 font-mono" data-testid="text-run-id">
          Run {trace.runId.slice(0, 12)}
        </div>

        {/* Golden input preview */}
        {golden?.input && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[240px] hidden xl:flex">
            <Hash className="w-3 h-3 shrink-0" />
            <span className="truncate italic">&ldquo;{golden.input.slice(0, 70)}{golden.input.length > 70 ? "…" : ""}&rdquo;</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {trace.latencyMs != null && (
            <span className="flex items-center gap-1" data-testid="text-latency">
              <Clock className="w-3 h-3" />
              {trace.latencyMs < 1000 ? `${trace.latencyMs}ms` : `${(trace.latencyMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {trace.totalTokens != null && trace.totalTokens > 0 && (
            <span className="flex items-center gap-1" data-testid="text-tokens">
              <Cpu className="w-3 h-3" />
              {trace.totalTokens.toLocaleString()} tok
            </span>
          )}
          {trace.costUsd != null && trace.costUsd > 0 && (
            <span className="flex items-center gap-1" data-testid="text-cost">
              <DollarSign className="w-3 h-3" />
              ${trace.costUsd.toFixed(5)}
            </span>
          )}
          {trace.createdAt && (
            <span className="hidden lg:block text-[10px]">{formatDate(trace.createdAt as string)}</span>
          )}
        </div>

        <div className="h-4 w-px bg-border mx-0.5 shrink-0" />

        {/* Pass/fail badge */}
        {trace.passFail === true ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20" data-testid="badge-pass">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Passed
          </Badge>
        ) : trace.passFail === false ? (
          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20" data-testid="badge-fail">
            <XCircle className="w-3 h-3 mr-1" /> Failed
          </Badge>
        ) : null}

        {/* Pinned badge */}
        {trace.isPinned && (
          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20" data-testid="badge-pinned">
            <ShieldCheck className="w-3 h-3 mr-1" /> Evidence
          </Badge>
        )}

        {/* Actions */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setComparePickerOpen(true)}
          data-testid="button-compare-trace"
        >
          <GitCompare className="w-3.5 h-3.5 mr-1.5" />
          Compare
        </Button>

        {compareTrace && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-amber-600 border-amber-500/30"
            onClick={() => setCompareViewOpen(true)}
            data-testid="button-view-compare"
          >
            <GitCompare className="w-3.5 h-3.5 mr-1.5" />
            View Diff
          </Button>
        )}

        {isCompliance && !trace.isPinned && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => pinMutation.mutate()}
            disabled={pinMutation.isPending}
            data-testid="button-pin-evidence"
          >
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            {pinMutation.isPending ? "Pinning…" : "Pin as Evidence"}
          </Button>
        )}
      </div>

      {/* ── Three-pane resizable layout ──────────────────────────────────────── */}
      <PanelGroup direction="horizontal" className="flex-1 min-h-0">

        {/* ── Left: Span tree (20%) ────────────────────────────────────────── */}
        <Panel defaultSize={20} minSize={14} maxSize={35}>
          <div className="flex flex-col h-full border-r">
            <div className="px-3 py-2 border-b bg-muted/20 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Spans ({trace.spans?.length ?? 0})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1" data-testid="span-tree">
              {!trace.spans || trace.spans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 px-3 text-center">
                  <Activity className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No spans recorded</p>
                </div>
              ) : (
                (trace.spanTree ?? []).map((root) => (
                  <SpanTreeNode
                    key={root.id}
                    node={root}
                    depth={0}
                    selectedId={effectiveSelectedId}
                    onSelect={setSelectedSpanId}
                  />
                ))
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

        {/* ── Center: Span detail (50%) ────────────────────────────────────── */}
        <Panel defaultSize={50} minSize={30}>
          <div className="h-full overflow-y-auto p-4" data-testid="span-detail">
            {!selectedSpan ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                <Activity className="w-10 h-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">Select a span to inspect</p>
              </div>
            ) : (
              <div className="max-w-2xl">
                {/* Span header */}
                <div className="flex items-center gap-2 mb-4">
                  {(() => {
                    const Icon = spanIcon(selectedSpan.spanType);
                    return <Icon className={`w-5 h-5 ${spanTypeColor(selectedSpan.spanType)}`} />;
                  })()}
                  <div>
                    <h2 className="font-semibold text-base">{selectedSpan.name}</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[9px] capitalize">
                        {spanTypeLabel(selectedSpan.spanType)}
                      </Badge>
                      {selectedSpan.durationMs != null && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {selectedSpan.durationMs < 1000
                            ? `${selectedSpan.durationMs}ms`
                            : `${(selectedSpan.durationMs / 1000).toFixed(2)}s`}
                        </span>
                      )}
                      <span className="font-mono text-[10px]">{selectedSpan.id.slice(0, 12)}</span>
                    </div>
                  </div>
                </div>

                {/* Agent failure */}
                {trace.agentFailed && selectedSpan.id === effectiveSelectedId && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-red-600">Agent error</p>
                      {trace.agentFailureReason && (
                        <p className="text-xs text-red-500/80 mt-0.5">{trace.agentFailureReason}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* LLM stats row */}
                {selectedSpan.spanType === "llm" && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(selectedSpan.attributes as any)?.inputTokens && (
                      <div className="text-xs bg-muted/40 rounded-md px-3 py-1.5">
                        <span className="text-muted-foreground">Input tokens: </span>
                        <span className="font-medium">{(selectedSpan.attributes as any).inputTokens}</span>
                      </div>
                    )}
                    {(selectedSpan.attributes as any)?.outputTokens && (
                      <div className="text-xs bg-muted/40 rounded-md px-3 py-1.5">
                        <span className="text-muted-foreground">Output tokens: </span>
                        <span className="font-medium">{(selectedSpan.attributes as any).outputTokens}</span>
                      </div>
                    )}
                    {(selectedSpan.attributes as any)?.model && (
                      <div className="text-xs bg-muted/40 rounded-md px-3 py-1.5">
                        <span className="text-muted-foreground">Model: </span>
                        <span className="font-medium">{(selectedSpan.attributes as any).model}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Inputs / Outputs */}
                <JsonBlock data={selectedSpan.inputs} label="Inputs" />
                <JsonBlock data={selectedSpan.outputs} label="Outputs" />

                {/* Attributes */}
                {selectedSpan.attributes && typeof selectedSpan.attributes === "object" && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Attributes</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedSpan.attributes as Record<string, unknown>)
                        .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
                        .map(([k, v]) => (
                          <div key={k} className="bg-muted/40 rounded px-2 py-1 text-[11px]">
                            <span className="text-muted-foreground">{k}: </span>
                            <span className="font-mono">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Child span chips */}
                {(spanNodeMap.get(selectedSpan.id)?.children ?? []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Child Spans ({(spanNodeMap.get(selectedSpan.id)?.children ?? []).length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(spanNodeMap.get(selectedSpan.id)?.children ?? []).map((child) => {
                        const ChildIcon = spanIcon(child.spanType);
                        return (
                          <button
                            key={child.id}
                            onClick={() => setSelectedSpanId(child.id)}
                            className="flex items-center gap-1 bg-muted/40 border rounded-full px-2.5 py-1 text-[11px] hover:bg-muted/70 transition-colors"
                            data-testid={`chip-child-${child.id}`}
                          >
                            <ChildIcon className={`w-3 h-3 ${spanTypeColor(child.spanType)}`} />
                            <span>{child.name}</span>
                            {child.durationMs != null && (
                              <span className="text-muted-foreground">·{child.durationMs}ms</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

        {/* ── Right: Metric panel (30%) ────────────────────────────────────── */}
        <Panel defaultSize={30} minSize={20} maxSize={45}>
          <div className="h-full flex flex-col border-l" data-testid="metric-panel">
            <Tabs defaultValue="scores" className="flex flex-col flex-1 min-h-0">
              <TabsList className="shrink-0 w-full rounded-none border-b bg-muted/20 h-9">
                <TabsTrigger value="scores" className="flex-1 text-xs rounded-none h-full" data-testid="tab-scores">
                  Scores
                </TabsTrigger>
                <TabsTrigger value="reasoning" className="flex-1 text-xs rounded-none h-full" data-testid="tab-reasoning">
                  Reasoning
                </TabsTrigger>
              </TabsList>

              {/* Scores tab */}
              <TabsContent value="scores" className="flex-1 overflow-y-auto p-3 mt-0">
                {scoreEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <FlaskConical className="w-7 h-7 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No metric scores for this span</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3 p-2 bg-muted/30 rounded-md">
                      {trace.passFail === true ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-600">Overall Passed</span>
                        </>
                      ) : trace.passFail === false ? (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-xs font-medium text-red-600">Overall Failed</span>
                        </>
                      ) : (
                        <>
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">No overall result</span>
                        </>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {scoreEntries.length} metric{scoreEntries.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {scoreEntries.map(([name, entry]) => (
                      <MetricCard key={name} name={name} entry={entry} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Reasoning tab */}
              <TabsContent value="reasoning" className="flex-1 overflow-y-auto p-3 mt-0">
                {scoreEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <FlaskConical className="w-7 h-7 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No judge reasoning available</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {scoreEntries
                      .filter(([, entry]) => scoreReason(entry) != null)
                      .map(([name, entry]) => {
                        const v = scoreValue(entry);
                        const judgeModel = scoreJudgeModel(entry);
                        const tokenCost = scoreTokenCost(entry);
                        const reason = scoreReason(entry)!;
                        return (
                          <div key={name} data-testid={`reasoning-${name}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-semibold">{name}</span>
                              {v != null && (
                                <span className={`text-[10px] font-semibold tabular-nums ${v >= 0.85 ? "text-emerald-600" : v >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
                                  {(v * 100).toFixed(0)}%
                                </span>
                              )}
                              <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                                {tokenCost != null && (
                                  <span className="flex items-center gap-0.5">
                                    <Coins className="w-2.5 h-2.5" />{tokenCost.toLocaleString()} tok
                                  </span>
                                )}
                                {judgeModel && (
                                  <span className="flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5" />{judgeModel}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="bg-muted/40 rounded-md p-2.5 max-h-64 overflow-y-auto">
                              <MarkdownBlock text={reason} />
                            </div>
                          </div>
                        );
                      })}
                    {scoreEntries.every(([, entry]) => scoreReason(entry) == null) && (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                        <FlaskConical className="w-7 h-7 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground">No judge chain-of-thought recorded</p>
                        <p className="text-[10px] text-muted-foreground/60">
                          Reasoning is captured when metrics use an LLM judge
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </Panel>

      </PanelGroup>

      {/* ── Compare picker dialog ────────────────────────────────────────────── */}
      {trace && run?.agentId && (
        <ComparePickerDialog
          open={comparePickerOpen}
          onClose={() => setComparePickerOpen(false)}
          currentTrace={trace}
          agentId={run.agentId}
          onSelectCompare={setCompareTraceId}
        />
      )}

      {/* ── Side-by-side compare dialog ──────────────────────────────────────── */}
      {trace && compareTrace && (
        <SideBySideCompareDialog
          open={compareViewOpen}
          onClose={() => setCompareViewOpen(false)}
          currentTrace={trace}
          baselineTrace={compareTrace}
        />
      )}
    </div>
  );
}
