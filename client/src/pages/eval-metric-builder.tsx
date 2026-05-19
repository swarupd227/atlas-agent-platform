import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EvalMetric, EvalDataset } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  FlaskConical,
  Save,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  GitBranch,
  Target,
  Brain,
  Code2,
  Zap,
  Info,
  Coins,
  History,
  TerminalSquare,
  Settings2,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const EVAL_PARAMS = [
  { id: "input", label: "INPUT" },
  { id: "actual_output", label: "ACTUAL_OUTPUT" },
  { id: "expected_output", label: "EXPECTED_OUTPUT" },
  { id: "retrieval_context", label: "RETRIEVAL_CONTEXT" },
  { id: "tools_called", label: "TOOLS_CALLED" },
];

const JUDGE_MODELS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet (default)" },
  { value: "claude-opus-4-5", label: "Claude Opus" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o-mini" },
];

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "agent", label: "Agent" },
  { value: "rag", label: "RAG" },
  { value: "conversational", label: "Conversational" },
  { value: "safety", label: "Safety" },
  { value: "summarization", label: "Summarization" },
  { value: "compliance", label: "Compliance" },
  { value: "operational", label: "Operational" },
];

const PYTHON_SCAFFOLD = `from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase


class CustomMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.name = "CustomMetric"

    def measure(self, test_case: LLMTestCase) -> float:
        actual_output = test_case.actual_output
        expected_output = test_case.expected_output or ""

        # TODO: implement your scoring logic here
        # Example: simple length-ratio score
        score = min(len(actual_output) / max(len(expected_output), 1), 1.0)

        self.score = score
        self.success = score >= self.threshold
        self.reason = f"Score {score:.2f} — threshold {self.threshold}"
        return score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success
`;

// ── DAG Types ─────────────────────────────────────────────────────────────────

interface DagNode {
  id: string;
  type: "decision" | "score" | "llm-check";
  x: number;
  y: number;
  data: {
    question?: string;
    value?: number;
    prompt?: string;
    threshold?: number;
    label?: string;
  };
}

interface DagEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface DagState {
  nodes: DagNode[];
  edges: DagEdge[];
}

const NODE_DIMS: Record<DagNode["type"], { w: number; h: number }> = {
  decision: { w: 160, h: 56 },
  score: { w: 120, h: 56 },
  "llm-check": { w: 168, h: 64 },
};

const NODE_COLORS: Record<DagNode["type"], string> = {
  decision: "border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  score: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "llm-check": "border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const NODE_ICONS: Record<DagNode["type"], typeof GitBranch> = {
  decision: GitBranch,
  score: Target,
  "llm-check": Brain,
};

function nodeLabel(node: DagNode): string {
  if (node.type === "decision") return node.data.question || "Decision";
  if (node.type === "score") return `Score: ${node.data.value ?? 0.5}`;
  return node.data.prompt ? node.data.prompt.slice(0, 28) + "…" : "LLM-Check";
}

function getPort(node: DagNode, port: "out" | "yes" | "no" | "in"): [number, number] {
  const { w, h } = NODE_DIMS[node.type];
  if (port === "in") return [node.x, node.y + h / 2];
  if (port === "yes") return node.type === "decision" ? [node.x + w, node.y + h / 2] : [node.x + w, node.y + h / 2];
  if (port === "no") return node.type === "decision" ? [node.x + w / 2, node.y + h] : [node.x + w, node.y + h / 2];
  return [node.x + w, node.y + h / 2];
}

// ── DAG Canvas ────────────────────────────────────────────────────────────────

function DagCanvas({
  dag,
  onChange,
}: {
  dag: DagState;
  onChange: (d: DagState) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [connectFrom, setConnectFrom] = useState<{ nodeId: string; label: string } | null>(null);
  const [connectTarget, setConnectTarget] = useState("");

  const selectedNode = dag.nodes.find((n) => n.id === selectedId) ?? null;

  const addNode = (type: DagNode["type"]) => {
    const id = `n${Date.now()}`;
    const offset = dag.nodes.length * 20;
    const defaults: DagNode["data"] =
      type === "decision" ? { question: "New condition?" }
      : type === "score" ? { value: 0.7 }
      : { prompt: "Evaluate: …", threshold: 0.5 };
    onChange({
      ...dag,
      nodes: [...dag.nodes, { id, type, x: 60 + offset, y: 60 + offset, data: defaults }],
    });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    onChange({
      nodes: dag.nodes.filter((n) => n.id !== selectedId),
      edges: dag.edges.filter((e) => e.source !== selectedId && e.target !== selectedId),
    });
    setSelectedId(null);
  };

  const updateNodeData = (id: string, patch: Partial<DagNode["data"]>) => {
    onChange({
      ...dag,
      nodes: dag.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    });
  };

  const confirmConnect = () => {
    if (!connectFrom || !connectTarget || connectTarget === connectFrom.nodeId) return;
    const id = `e${Date.now()}`;
    onChange({
      ...dag,
      edges: [...dag.edges, { id, source: connectFrom.nodeId, target: connectTarget, label: connectFrom.label }],
    });
    setConnectFrom(null);
    setConnectTarget("");
  };

  const deleteEdge = (edgeId: string) => {
    onChange({ ...dag, edges: dag.edges.filter((e) => e.id !== edgeId) });
  };

  const onMouseDownNode = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      setSelectedId(nodeId);
      const node = dag.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setDragging({ nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y });
    },
    [dag.nodes],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      onChange({
        ...dag,
        nodes: dag.nodes.map((n) =>
          n.id === dragging.nodeId ? { ...n, x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) } : n,
        ),
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const canvasW = 620;
  const canvasH = 380;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs text-muted-foreground font-medium mr-1">Add node:</span>
        {(["decision", "score", "llm-check"] as DagNode["type"][]).map((t) => {
          const Icon = NODE_ICONS[t];
          return (
            <Button key={t} variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => addNode(t)} data-testid={`button-dag-add-${t}`}>
              <Plus className="w-3 h-3" />
              <Icon className="w-3 h-3" />
              {t === "llm-check" ? "LLM-Check" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          );
        })}
        <div className="flex-1" />
        {selectedId && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1.5" onClick={deleteSelected} data-testid="button-dag-delete">
            <Trash2 className="w-3 h-3" />
            Delete selected
          </Button>
        )}
      </div>

      {/* Canvas + Property Panel */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative border rounded-lg bg-muted/20 overflow-hidden cursor-default flex-1 min-w-0"
          style={{ minHeight: canvasH }}
          onClick={() => setSelectedId(null)}
          data-testid="canvas-dag"
        >
          {/* Grid dots */}
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <defs>
              <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="currentColor" className="text-muted-foreground/20" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
            {/* Edges */}
            {dag.edges.map((edge) => {
              const src = dag.nodes.find((n) => n.id === edge.source);
              const tgt = dag.nodes.find((n) => n.id === edge.target);
              if (!src || !tgt) return null;
              const [sx, sy] = getPort(src, edge.label === "no" ? "no" : "yes");
              const [tx, ty] = getPort(tgt, "in");
              const cx1 = sx + Math.abs(tx - sx) * 0.5;
              const cy1 = sy;
              const cx2 = tx - Math.abs(tx - sx) * 0.5;
              const cy2 = ty;
              const mx = (sx + tx) / 2;
              const my = (sy + ty) / 2;
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${sx} ${sy} C ${cx1} ${cy1} ${cx2} ${cy2} ${tx} ${ty}`}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    strokeDasharray={edge.label === "no" ? "4 2" : undefined}
                    opacity={0.6}
                  />
                  {edge.label && (
                    <text x={mx} y={my - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--primary))" opacity={0.8}>
                      {edge.label}
                    </text>
                  )}
                  <circle cx={mx} cy={my} r={5} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={1} opacity={0.7}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                  />
                  <text x={mx} y={my + 3} textAnchor="middle" fontSize="8" fill="hsl(var(--destructive))" style={{ pointerEvents: "none" }}>×</text>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {dag.nodes.map((node) => {
            const { w, h } = NODE_DIMS[node.type];
            const Icon = NODE_ICONS[node.type];
            const isSelected = selectedId === node.id;
            return (
              <div
                key={node.id}
                className={`absolute rounded-md border-2 select-none cursor-grab active:cursor-grabbing px-2 py-1.5 flex items-center gap-1.5 transition-shadow ${NODE_COLORS[node.type]} ${isSelected ? "ring-2 ring-primary/60 shadow-lg" : "hover:shadow-md"}`}
                style={{ left: node.x, top: node.y, width: w, height: h, zIndex: isSelected ? 20 : 10 }}
                onMouseDown={(e) => onMouseDownNode(e, node.id)}
              >
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="text-[11px] font-medium truncate leading-tight">{nodeLabel(node)}</span>
              </div>
            );
          })}

          {dag.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <GitBranch className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/50">Add nodes from the toolbar above</p>
              </div>
            </div>
          )}
        </div>

        {/* Property Panel */}
        <div className="w-48 shrink-0 border rounded-lg bg-muted/10 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Settings2 className="w-3 h-3" />
              Properties
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {!selectedNode ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">Click a node to edit</p>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Type</p>
                    <Badge variant="outline" className={`text-[10px] ${NODE_COLORS[selectedNode.type]}`}>
                      {selectedNode.type}
                    </Badge>
                  </div>

                  {selectedNode.type === "decision" && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Condition</Label>
                      <Textarea
                        value={selectedNode.data.question ?? ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { question: e.target.value })}
                        className="text-xs mt-1 min-h-[60px] resize-none"
                        placeholder="Does the response…?"
                        data-testid="input-dag-question"
                      />
                    </div>
                  )}

                  {selectedNode.type === "score" && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Score Value: {selectedNode.data.value?.toFixed(2) ?? "0.50"}</Label>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[selectedNode.data.value ?? 0.5]}
                        onValueChange={([v]) => updateNodeData(selectedNode.id, { value: v })}
                        className="mt-2"
                        data-testid="slider-dag-score"
                      />
                    </div>
                  )}

                  {selectedNode.type === "llm-check" && (
                    <>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Sub-prompt</Label>
                        <Textarea
                          value={selectedNode.data.prompt ?? ""}
                          onChange={(e) => updateNodeData(selectedNode.id, { prompt: e.target.value })}
                          className="text-xs mt-1 min-h-[60px] resize-none"
                          placeholder="Evaluate whether…"
                          data-testid="input-dag-prompt"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Threshold: {selectedNode.data.threshold?.toFixed(2) ?? "0.50"}</Label>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[selectedNode.data.threshold ?? 0.5]}
                          onValueChange={([v]) => updateNodeData(selectedNode.id, { threshold: v })}
                          className="mt-2"
                          data-testid="slider-dag-threshold"
                        />
                      </div>
                    </>
                  )}

                  <Separator />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Add connection</p>
                    {connectFrom?.nodeId === selectedNode.id ? (
                      <div className="space-y-1.5">
                        <Select value={connectTarget} onValueChange={setConnectTarget}>
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue placeholder="Target node…" />
                          </SelectTrigger>
                          <SelectContent>
                            {dag.nodes.filter((n) => n.id !== selectedNode.id).map((n) => (
                              <SelectItem key={n.id} value={n.id} className="text-xs">
                                {nodeLabel(n).slice(0, 20)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedNode.type === "decision" && (
                          <Select value={connectFrom.label} onValueChange={(v) => setConnectFrom({ ...connectFrom, label: v })}>
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes" className="text-xs">yes</SelectItem>
                              <SelectItem value="no" className="text-xs">no</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[10px] flex-1" onClick={confirmConnect} data-testid="button-dag-confirm-connect">OK</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setConnectFrom(null)}>✕</Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] w-full gap-1"
                        onClick={() => setConnectFrom({ nodeId: selectedNode.id, label: selectedNode.type === "decision" ? "yes" : "out" })}
                        data-testid="button-dag-start-connect"
                      >
                        <Plus className="w-3 h-3" /> Connect →
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
          {dag.nodes.length > 0 && (
            <div className="p-2 border-t">
              <p className="text-[10px] text-muted-foreground text-center">
                {dag.nodes.length} node{dag.nodes.length !== 1 ? "s" : ""} · {dag.edges.length} edge{dag.edges.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── G-Eval Form ───────────────────────────────────────────────────────────────

function GEvalForm({
  criteria,
  setCriteria,
  evalParams,
  setEvalParams,
  judgeModel,
  setJudgeModel,
  threshold,
  setThreshold,
  strictMode,
  setStrictMode,
  asyncMode,
  setAsyncMode,
}: {
  criteria: string;
  setCriteria: (v: string) => void;
  evalParams: string[];
  setEvalParams: (v: string[]) => void;
  judgeModel: string;
  setJudgeModel: (v: string) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  strictMode: boolean;
  setStrictMode: (v: boolean) => void;
  asyncMode: boolean;
  setAsyncMode: (v: boolean) => void;
}) {
  const toggleParam = (id: string) => {
    setEvalParams(evalParams.includes(id) ? evalParams.filter((p) => p !== id) : [...evalParams, id]);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-1 pr-3">
        {/* Criteria */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="criteria" className="text-sm font-medium">Evaluation Criteria</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">Write criteria in plain English. The LLM judge will score the output against these criteria on a 0–1 scale. Be specific: instead of "good response", write "The response accurately answers the user's question, cites relevant evidence, and avoids hallucinated facts."</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            id="criteria"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder={`Describe what makes a response pass this metric.\n\nExample: "The response must (1) directly answer the user's question, (2) cite at least one source, and (3) avoid speculative claims not grounded in the input context."`}
            className="min-h-[140px] text-sm font-mono resize-none"
            data-testid="textarea-geval-criteria"
          />
          <p className="text-[11px] text-muted-foreground">
            Tip: list criteria as numbered points for clearer scoring.
          </p>
        </div>

        {/* Evaluation Params */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Evaluation Parameters</Label>
          <div className="flex flex-wrap gap-2">
            {EVAL_PARAMS.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleParam(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                  evalParams.includes(p.id)
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : "bg-muted/40 border-muted text-muted-foreground hover:border-muted-foreground/50"
                }`}
                data-testid={`toggle-param-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Judge Model */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Judge Model</Label>
          <Select value={judgeModel} onValueChange={setJudgeModel}>
            <SelectTrigger className="h-9" data-testid="select-judge-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUDGE_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Pass Threshold</Label>
            <span className="text-sm font-bold tabular-nums text-primary">{threshold.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[threshold]}
            onValueChange={([v]) => setThreshold(v)}
            data-testid="slider-threshold"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.0 (lenient)</span>
            <span>1.0 (strict)</span>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Strict Mode</p>
              <p className="text-[11px] text-muted-foreground">Exact threshold match required (score ≥ threshold, no rounding)</p>
            </div>
            <Switch checked={strictMode} onCheckedChange={setStrictMode} data-testid="switch-strict-mode" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Async Mode</p>
              <p className="text-[11px] text-muted-foreground">Run judge calls concurrently to reduce total eval latency</p>
            </div>
            <Switch checked={asyncMode} onCheckedChange={setAsyncMode} data-testid="switch-async-mode" />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ── QAG Form ──────────────────────────────────────────────────────────────────

function QAGForm({
  genPrompt,
  setGenPrompt,
  gradingPrompt,
  setGradingPrompt,
  evalParams,
  setEvalParams,
  judgeModel,
  setJudgeModel,
}: {
  genPrompt: string;
  setGenPrompt: (v: string) => void;
  gradingPrompt: string;
  setGradingPrompt: (v: string) => void;
  evalParams: string[];
  setEvalParams: (v: string[]) => void;
  judgeModel: string;
  setJudgeModel: (v: string) => void;
}) {
  const toggleParam = (id: string) => {
    setEvalParams(evalParams.includes(id) ? evalParams.filter((p) => p !== id) : [...evalParams, id]);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-1 pr-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Question-Generation Prompt</Label>
          <Textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder={`Describe what questions to generate from the context.\n\nExample: "Generate 3 factual questions that can be answered using the provided context. Focus on key entities and relationships."`}
            className="min-h-[120px] text-sm font-mono resize-none"
            data-testid="textarea-qag-gen-prompt"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Answer-Grading Prompt</Label>
          <Textarea
            value={gradingPrompt}
            onChange={(e) => setGradingPrompt(e.target.value)}
            placeholder={`Describe how to grade generated answers.\n\nExample: "Score each answer 0–1 based on: (1) factual accuracy against the context, (2) completeness, (3) absence of hallucination."`}
            className="min-h-[120px] text-sm font-mono resize-none"
            data-testid="textarea-qag-grading-prompt"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Evaluation Parameters</Label>
          <div className="flex flex-wrap gap-2">
            {EVAL_PARAMS.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleParam(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                  evalParams.includes(p.id)
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : "bg-muted/40 border-muted text-muted-foreground hover:border-muted-foreground/50"
                }`}
                data-testid={`toggle-qag-param-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Judge Model</Label>
          <Select value={judgeModel} onValueChange={setJudgeModel}>
            <SelectTrigger className="h-9" data-testid="select-qag-judge-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUDGE_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ScrollArea>
  );
}

// ── Code Tab ──────────────────────────────────────────────────────────────────

function CodeTab({
  code,
  setCode,
}: {
  code: string;
  setCode: (v: string) => void;
}) {
  const { toast } = useToast();
  const [validating, setValidating] = useState(false);
  const [validResult, setValidResult] = useState<{ valid: boolean; issues: string[] } | null>(null);

  const runDryRun = async () => {
    setValidating(true);
    setValidResult(null);
    try {
      const res = await apiRequest("POST", "/api/eval/metrics/validate-code", { code });
      const data = await res.json();
      setValidResult(data);
    } catch {
      toast({ title: "Validation failed", description: "Could not reach the validation endpoint.", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const hasClass = code.includes("class ") && code.includes("BaseMetric");
  const hasMeasure = code.includes("def measure");
  const hasSuccessful = code.includes("is_successful");

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Indicators */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">Syntax checks:</span>
        {[
          { ok: hasClass, label: "BaseMetric subclass" },
          { ok: hasMeasure, label: "measure()" },
          { ok: hasSuccessful, label: "is_successful()" },
        ].map(({ ok, label }) => (
          <div key={label} className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            {ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
            {label}
          </div>
        ))}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={runDryRun}
          disabled={validating}
          data-testid="button-dry-run"
        >
          {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TerminalSquare className="w-3.5 h-3.5" />}
          Dry Run
        </Button>
      </div>

      {/* Validation result */}
      {validResult && (
        <div className={`rounded-md border px-3 py-2 flex items-start gap-2 shrink-0 ${validResult.valid ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10"}`}>
          {validResult.valid ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
          <div>
            <p className="text-xs font-medium">{validResult.valid ? "Validation passed" : "Validation issues found"}</p>
            {validResult.issues.length > 0 && (
              <ul className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                {validResult.issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
        <Editor
          height="100%"
          language="python"
          value={code}
          onChange={(v) => setCode(v ?? "")}
          theme="vs-dark"
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            folding: true,
            tabSize: 4,
          }}
          data-testid="editor-code"
        />
      </div>
      <p className="text-[10px] text-muted-foreground shrink-0">
        Note: Python execution is simulated. True execution requires a DeepEval Python worker (future infrastructure milestone).
      </p>
    </div>
  );
}

// ── Preview Pane ──────────────────────────────────────────────────────────────

function PreviewPane({
  getPreviewConfig,
  defaultDatasetSize,
}: {
  getPreviewConfig: () => { name: string; criteria: string; metricType: string };
  defaultDatasetSize: number;
}) {
  const { toast } = useToast();
  const [sampleInput, setSampleInput] = useState("");
  const [sampleActual, setSampleActual] = useState("");
  const [sampleExpected, setSampleExpected] = useState("");
  const [result, setResult] = useState<{
    score: number;
    pass: boolean;
    reasoning: string;
    latencyMs: number;
    estimatedCostUsd: number;
  } | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const config = getPreviewConfig();
      const res = await apiRequest("POST", "/api/eval/metrics/preview", {
        metricConfig: { name: config.name, criteria: config.criteria },
        sampleInput,
        sampleActualOutput: sampleActual || undefined,
        sampleExpectedOutput: sampleExpected || undefined,
      });
      if (!res.ok) throw new Error("Preview failed");
      return res.json() as Promise<typeof result>;
    },
    onSuccess: (data) => setResult(data),
    onError: () => toast({ title: "Preview failed", description: "Could not run metric preview. Check your criteria.", variant: "destructive" }),
  });

  const costPerRun = result ? result.estimatedCostUsd * defaultDatasetSize : null;

  return (
    <div className="flex flex-col h-full border-l pl-4 gap-4">
      <div className="shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Live Preview
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Run a sample through this metric before saving</p>
      </div>

      <div className="space-y-3 shrink-0">
        <div className="space-y-1">
          <Label className="text-xs">Sample Input <span className="text-destructive">*</span></Label>
          <Textarea
            value={sampleInput}
            onChange={(e) => setSampleInput(e.target.value)}
            placeholder="What is the capital of France?"
            className="text-xs min-h-[56px] resize-none"
            data-testid="textarea-preview-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Actual Output</Label>
          <Textarea
            value={sampleActual}
            onChange={(e) => setSampleActual(e.target.value)}
            placeholder="Paris is the capital of France."
            className="text-xs min-h-[56px] resize-none"
            data-testid="textarea-preview-actual"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expected Output</Label>
          <Textarea
            value={sampleExpected}
            onChange={(e) => setSampleExpected(e.target.value)}
            placeholder="Paris"
            className="text-xs min-h-[44px] resize-none"
            data-testid="textarea-preview-expected"
          />
        </div>

        <Button
          className="w-full h-8 text-xs gap-1.5"
          onClick={() => previewMutation.mutate()}
          disabled={!sampleInput.trim() || previewMutation.isPending}
          data-testid="button-run-preview"
        >
          {previewMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running preview…</>
          ) : (
            <><Play className="w-3.5 h-3.5" />Preview Metric</>
          )}
        </Button>
      </div>

      {/* Result */}
      {previewMutation.isPending && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">Calling judge model…</p>
          </div>
        </div>
      )}

      {result && !previewMutation.isPending && (
        <div className="space-y-3 flex-1 overflow-auto">
          <Separator />
          {/* Score */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Score</span>
              <span className={`text-xl font-bold tabular-nums ${result.pass ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {result.score.toFixed(3)}
              </span>
            </div>
            {/* Score bar */}
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${result.pass ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${result.score * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className={`text-[10px] ${result.pass ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}`}>
                {result.pass ? <><CheckCircle className="w-2.5 h-2.5 mr-1" />PASS</> : <><XCircle className="w-2.5 h-2.5 mr-1" />FAIL</>}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{result.latencyMs}ms</span>
            </div>
          </div>

          {/* Reasoning */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Judge Reasoning</p>
            <div className="rounded-md border bg-muted/30 p-2.5">
              <p className="text-xs leading-relaxed">{result.reasoning}</p>
            </div>
          </div>

          {/* Cost */}
          <div className="rounded-md border p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Coins className="w-3 h-3" />
              Cost Estimate
            </p>
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Per golden</span>
                <span className="font-medium">~${result.estimatedCostUsd.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">× {defaultDatasetSize} goldens</span>
                <span className="font-semibold text-primary">~${costPerRun!.toFixed(2)}/run</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!result && !previewMutation.isPending && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <FlaskConical className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">Enter a sample and click Preview</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type TabKey = "g-eval" | "dag" | "qag" | "code";

const TAB_DEFS: { key: TabKey; label: string; icon: typeof FlaskConical }[] = [
  { key: "g-eval", label: "G-Eval", icon: Brain },
  { key: "dag", label: "DAG", icon: GitBranch },
  { key: "qag", label: "QAG", icon: FlaskConical },
  { key: "code", label: "Code", icon: Code2 },
];

export default function EvalMetricBuilder() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEdit = Boolean(params.id);
  const { toast } = useToast();

  // Shared header fields
  const [name, setName] = useState("Untitled Metric");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("g-eval");
  const [currentVersion, setCurrentVersion] = useState(1);

  // G-Eval state
  const [criteria, setCriteria] = useState("");
  const [evalParams, setEvalParams] = useState<string[]>(["input", "actual_output"]);
  const [judgeModel, setJudgeModel] = useState("claude-sonnet-4-5");
  const [threshold, setThreshold] = useState(0.5);
  const [strictMode, setStrictMode] = useState(false);
  const [asyncMode, setAsyncMode] = useState(true);

  // DAG state
  const [dag, setDag] = useState<DagState>({ nodes: [], edges: [] });

  // QAG state
  const [qagGenPrompt, setQagGenPrompt] = useState("");
  const [qagGradingPrompt, setQagGradingPrompt] = useState("");
  const [qagEvalParams, setQagEvalParams] = useState<string[]>(["input", "actual_output", "retrieval_context"]);
  const [qagJudgeModel, setQagJudgeModel] = useState("claude-sonnet-4-5");

  // Code state
  const [code, setCode] = useState(PYTHON_SCAFFOLD);

  // Load existing metric
  const { isLoading: loadingMetric } = useQuery<EvalMetric>({
    queryKey: ["/api/eval/metrics", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/eval/metrics/${params.id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: isEdit,
    staleTime: 60_000,
  });

  // Populate form when metric loads
  const { data: existingMetric } = useQuery<EvalMetric>({
    queryKey: ["/api/eval/metrics", params.id],
    enabled: isEdit,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!existingMetric) return;
    setName(existingMetric.name);
    setCategory(existingMetric.category);
    setDescription(existingMetric.description ?? "");
    setCurrentVersion(existingMetric.version ?? 1);
    setThreshold(existingMetric.threshold ?? 0.5);
    setStrictMode(existingMetric.strictMode ?? false);
    setAsyncMode(existingMetric.asyncMode ?? true);
    setJudgeModel(existingMetric.judgeModel ?? "claude-sonnet-4-5");
    if (Array.isArray(existingMetric.evaluationParams)) setEvalParams(existingMetric.evaluationParams);
    const mt = existingMetric.metricType ?? "g-eval";
    setActiveTab(mt as TabKey);

    if (mt === "g-eval" || mt === "general") {
      setCriteria(existingMetric.criteria ?? "");
    } else if (mt === "dag") {
      const dc = existingMetric.dagConfig as DagState | null;
      if (dc?.nodes) setDag(dc);
      setCriteria(existingMetric.criteria ?? "");
    } else if (mt === "qag") {
      const dc = existingMetric.dagConfig as { genPrompt?: string; gradingPrompt?: string } | null;
      if (dc?.genPrompt) setQagGenPrompt(dc.genPrompt);
      if (dc?.gradingPrompt) setQagGradingPrompt(dc.gradingPrompt);
    } else if (mt === "code") {
      setCriteria(existingMetric.criteria ?? PYTHON_SCAFFOLD);
      setCode(existingMetric.criteria ?? PYTHON_SCAFFOLD);
    }
  }, [existingMetric]);

  // Datasets (for cost estimator)
  const { data: datasets } = useQuery<EvalDataset[]>({
    queryKey: ["/api/eval/datasets"],
  });
  const defaultDatasetSize = Math.max(
    (datasets ?? []).reduce((sum, ds) => sum + (ds.goldenCount ?? 0), 0) / Math.max((datasets ?? []).length, 1),
    50,
  );

  const buildPayload = useCallback(() => {
    const metricType = activeTab;
    let effectiveCriteria = "";
    let dagConfig: Record<string, unknown> | null = null;

    if (metricType === "g-eval") {
      effectiveCriteria = criteria || "Evaluate the quality of the response.";
    } else if (metricType === "dag") {
      effectiveCriteria = `DAG metric: ${dag.nodes.length} nodes, ${dag.edges.length} edges. ${dag.nodes.map((n) => nodeLabel(n)).join("; ")}`.slice(0, 500) || "DAG metric";
      dagConfig = dag as unknown as Record<string, unknown>;
    } else if (metricType === "qag") {
      effectiveCriteria = [
        qagGenPrompt ? `Generation: ${qagGenPrompt}` : "",
        qagGradingPrompt ? `Grading: ${qagGradingPrompt}` : "",
      ].filter(Boolean).join("\n\n") || "QAG metric";
      dagConfig = { genPrompt: qagGenPrompt, gradingPrompt: qagGradingPrompt };
    } else {
      effectiveCriteria = code || PYTHON_SCAFFOLD;
    }

    const baseEvalParams = metricType === "qag" ? qagEvalParams : evalParams;
    const baseJudgeModel = metricType === "qag" ? qagJudgeModel : judgeModel;

    return {
      name,
      category,
      description: description || undefined,
      metricType,
      criteria: effectiveCriteria,
      evaluationParams: baseEvalParams,
      judgeModel: baseJudgeModel,
      threshold,
      strictMode,
      asyncMode,
      ...(dagConfig ? { dagConfig } : {}),
    };
  }, [activeTab, name, category, description, criteria, dag, qagGenPrompt, qagGradingPrompt, qagEvalParams, qagJudgeModel, evalParams, judgeModel, threshold, strictMode, asyncMode, code]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload.name.trim()) throw new Error("Metric name is required");
      if (isEdit && params.id) {
        const res = await apiRequest("PUT", `/api/eval/metrics/${params.id}`, payload);
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Update failed"); }
        return res.json() as Promise<EvalMetric>;
      }
      const res = await apiRequest("POST", "/api/eval/metrics", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Create failed"); }
      return res.json() as Promise<EvalMetric>;
    },
    onSuccess: (metric) => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/metrics"] });
      setCurrentVersion(metric.version ?? 1);
      toast({
        title: isEdit ? "Metric updated" : "Metric created",
        description: `"${metric.name}" v${metric.version} saved to your library.`,
      });
      if (!isEdit) setLocation(`/evals/metrics/${metric.id}/edit`);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const getPreviewConfig = useCallback((): { name: string; criteria: string; metricType: string } => {
    const payload = buildPayload();
    return { name: payload.name, criteria: payload.criteria, metricType: payload.metricType };
  }, [buildPayload]);

  if (isEdit && loadingMetric) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar */}
      <div className="shrink-0 border-b bg-background px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation("/evals/metrics")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
          data-testid="link-back-metrics"
        >
          <ArrowLeft className="w-4 h-4" />
          Library
        </button>

        <span className="text-muted-foreground/40">/</span>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm font-semibold max-w-72"
            placeholder="Metric name…"
            data-testid="input-metric-name"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs w-36" data-testid="select-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Version badge */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <History className="w-3.5 h-3.5" />
          v{isEdit ? currentVersion + 1 : 1}
          {isEdit && <span className="text-[10px] text-amber-600">(next)</span>}
        </div>

        <Button
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-metric"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{isEdit ? "Updating…" : "Creating…"}</>
          ) : (
            <><Save className="w-3.5 h-3.5" />{isEdit ? "Update Metric" : "Save Metric"}</>
          )}
        </Button>
      </div>

      {/* Tabs strip */}
      <div className="shrink-0 border-b bg-muted/20 px-4 flex items-end gap-0">
        {TAB_DEFS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            }`}
            data-testid={`tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="pb-2">
          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20">tenant-private</Badge>
        </div>
      </div>

      {/* Main content: tabs + preview pane */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: tab content — 65% */}
        <div className="flex-1 min-w-0 overflow-hidden p-4">
          {activeTab === "g-eval" && (
            <GEvalForm
              criteria={criteria}
              setCriteria={setCriteria}
              evalParams={evalParams}
              setEvalParams={setEvalParams}
              judgeModel={judgeModel}
              setJudgeModel={setJudgeModel}
              threshold={threshold}
              setThreshold={setThreshold}
              strictMode={strictMode}
              setStrictMode={setStrictMode}
              asyncMode={asyncMode}
              setAsyncMode={setAsyncMode}
            />
          )}
          {activeTab === "dag" && (
            <DagCanvas dag={dag} onChange={setDag} />
          )}
          {activeTab === "qag" && (
            <QAGForm
              genPrompt={qagGenPrompt}
              setGenPrompt={setQagGenPrompt}
              gradingPrompt={qagGradingPrompt}
              setGradingPrompt={setQagGradingPrompt}
              evalParams={qagEvalParams}
              setEvalParams={setQagEvalParams}
              judgeModel={qagJudgeModel}
              setJudgeModel={setQagJudgeModel}
            />
          )}
          {activeTab === "code" && (
            <CodeTab code={code} setCode={setCode} />
          )}
        </div>

        {/* Right: preview pane — ~35% */}
        <div className="w-[340px] shrink-0 overflow-hidden p-4">
          <PreviewPane
            getPreviewConfig={getPreviewConfig}
            defaultDatasetSize={Math.round(defaultDatasetSize)}
          />
        </div>
      </div>
    </div>
  );
}
