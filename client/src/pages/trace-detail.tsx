import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Terminal,
  Clock,
  Cpu,
  Wrench,
  GitBranch,
  Shield,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Brain,
  MessageSquare,
  Timer,
  Bot,
  Play,
  Square,
  Users,
  Network,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMs } from "@/components/shared-utils";
import type { RunTrace } from "@shared/schema";

interface ToolCall {
  name?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  latencyMs?: number;
  status?: string;
  server?: string;
}


interface Decision {
  step: string;
  reasoning: string;
  confidence: number;
  outcome: string;
}

interface PolicyCheck {
  policyName: string;
  passed: boolean;
  details: string;
  checkedAt: string;
}


interface PromptInputs {
  systemPrompt: string;
  userMessage: string;
  contextVariables: Record<string, unknown>;
}

interface PipelineStepData {
  name: string;
  status: string;
  output?: any;
  error?: string;
  workerSteps?: any[];
  startedAt?: string;
  completedAt?: string;
}

type TimelineStep =
  | { type: "prompt"; data: PromptInputs | null }
  | { type: "decision"; data: Decision; originalIndex: number }
  | { type: "toolcall"; data: ToolCall; originalIndex: number }
  | { type: "policycheck"; data: PolicyCheck; originalIndex: number }
  | { type: "output"; data: string | null }
  | { type: "orchestration"; data: PipelineStepData }
  | { type: "worker_execution"; data: PipelineStepData }
  | { type: "orchestration_summary"; data: PipelineStepData };

function buildTimelineSteps(
  promptInputs: PromptInputs | null,
  decisions: Decision[],
  toolCalls: ToolCall[],
  policyChecks: PolicyCheck[],
  outputSummary: string | null | undefined,
  stepsJson?: any[],
): TimelineStep[] {
  const steps: TimelineStep[] = [];

  const isTeamPipeline = stepsJson?.some(s => s.type === "orchestration" || s.type === "worker_execution" || s.type === "orchestration_summary");

  steps.push({ type: "prompt", data: promptInputs });

  if (isTeamPipeline && stepsJson) {
    for (const s of stepsJson) {
      if (s.type === "orchestration") {
        steps.push({ type: "orchestration", data: s });
      } else if (s.type === "worker_execution") {
        steps.push({ type: "worker_execution", data: s });
      } else if (s.type === "orchestration_summary") {
        steps.push({ type: "orchestration_summary", data: s });
      } else if (s.type === "approval_gate") {
        steps.push({ type: "orchestration", data: { ...s, name: s.name || "Approval Gate" } });
      }
    }
  } else {
    const maxInterleave = Math.max(decisions.length, toolCalls.length);
    for (let i = 0; i < maxInterleave; i++) {
      if (i < decisions.length) {
        steps.push({ type: "decision", data: decisions[i], originalIndex: i });
      }
      if (i < toolCalls.length) {
        steps.push({ type: "toolcall", data: toolCalls[i], originalIndex: i });
      }
    }

    policyChecks.forEach((pc, i) => {
      steps.push({ type: "policycheck", data: pc, originalIndex: i });
    });
  }

  steps.push({ type: "output", data: outputSummary || null });

  return steps;
}

function getStepDotColor(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
    case "output":
      return "bg-emerald-500";
    case "decision":
      return "bg-purple-500";
    case "toolcall":
      return "bg-blue-500";
    case "policycheck":
      return "bg-amber-500";
    case "orchestration":
    case "orchestration_summary":
      return "bg-indigo-500";
    case "worker_execution":
      return "bg-cyan-500";
  }
}

function getStepLineColor(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
    case "output":
      return "border-emerald-500/30";
    case "decision":
      return "border-purple-500/30";
    case "toolcall":
      return "border-blue-500/30";
    case "policycheck":
      return "border-amber-500/30";
    case "orchestration":
    case "orchestration_summary":
      return "border-indigo-500/30";
    case "worker_execution":
      return "border-cyan-500/30";
  }
}

function getStepTypeBadge(type: TimelineStep["type"]) {
  switch (type) {
    case "prompt":
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <MessageSquare className="w-3 h-3 mr-0.5" />
          Prompt Input
        </Badge>
      );
    case "decision":
      return (
        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
          <Brain className="w-3 h-3 mr-0.5" />
          Decision
        </Badge>
      );
    case "toolcall":
      return (
        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
          <Wrench className="w-3 h-3 mr-0.5" />
          Tool Call
        </Badge>
      );
    case "policycheck":
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          <Shield className="w-3 h-3 mr-0.5" />
          Policy Check
        </Badge>
      );
    case "output":
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <Square className="w-3 h-3 mr-0.5" />
          Output
        </Badge>
      );
    case "orchestration":
      return (
        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
          <Network className="w-3 h-3 mr-0.5" />
          Pipeline
        </Badge>
      );
    case "worker_execution":
      return (
        <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">
          <Bot className="w-3 h-3 mr-0.5" />
          Worker Agent
        </Badge>
      );
    case "orchestration_summary":
      return (
        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
          <Layers className="w-3 h-3 mr-0.5" />
          Pipeline Summary
        </Badge>
      );
  }
}

function getStepTitle(step: TimelineStep): string {
  switch (step.type) {
    case "prompt":
      return "System prompt & user message configured";
    case "decision":
      return step.data.step;
    case "toolcall":
      return step.data.name || step.data.tool || "Tool Call";
    case "policycheck":
      return step.data.policyName;
    case "output":
      return "Final output generated";
    case "orchestration":
    case "worker_execution":
    case "orchestration_summary":
      return step.data.name;
  }
}

function getStepStatus(step: TimelineStep): "success" | "fail" | "neutral" {
  switch (step.type) {
    case "prompt":
      return step.data ? "success" : "neutral";
    case "decision":
      return "success";
    case "toolcall": {
      const s = step.data.status;
      if (!s || s === "success" || s === "completed") return "success";
      return "fail";
    }
    case "policycheck":
      return step.data.passed ? "success" : "fail";
    case "output":
      return step.data ? "success" : "neutral";
    case "orchestration":
    case "worker_execution":
    case "orchestration_summary":
      return step.data.status === "completed" ? "success" : step.data.status === "failed" ? "fail" : "neutral";
  }
}

function TimelineStepContent({ step }: { step: TimelineStep }) {
  switch (step.type) {
    case "prompt": {
      const pi = step.data;
      if (!pi) return <p className="text-xs text-muted-foreground">No prompt data recorded</p>;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">System Prompt</span>
            <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed font-mono whitespace-pre-wrap" data-testid="prompt-system">
              {pi.systemPrompt}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">User Message</span>
            <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed" data-testid="prompt-user">
              {pi.userMessage}
            </div>
          </div>
          {pi.contextVariables && Object.keys(pi.contextVariables).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Context Variables</span>
              <div className="flex flex-col gap-1">
                {Object.entries(pi.contextVariables).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                    <span className="text-[11px] font-mono text-muted-foreground">{key}</span>
                    <span className="text-xs font-medium truncate max-w-[60%] text-right">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    case "decision": {
      const dec = step.data;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Confidence</span>
            <div className="w-16">
              <Progress value={dec.confidence * 100} className="h-1.5" />
            </div>
            <span className="text-[10px] font-medium">{(dec.confidence * 100).toFixed(0)}%</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{dec.reasoning}</p>
          <div className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium">{dec.outcome}</span>
          </div>
        </div>
      );
    }
    case "toolcall": {
      const tc = step.data;
      const args = tc.arguments || tc.input;
      const res = tc.result || tc.output;
      return (
        <div className="flex flex-col gap-2">
          {tc.server && (
            <span className="text-[10px] text-muted-foreground">Server: {tc.server}</span>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Arguments</span>
              <div className="p-2 rounded bg-background/50 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(args, null, 2)}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Result</span>
              <div className="p-2 rounded bg-background/50 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {typeof res === "string" ? res : JSON.stringify(res, null, 2)}
              </div>
            </div>
          </div>
        </div>
      );
    }
    case "policycheck": {
      const pc = step.data;
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{pc.details}</p>
          {pc.checkedAt && (
            <span className="text-[10px] text-muted-foreground">Checked at: {formatDate(pc.checkedAt)}</span>
          )}
        </div>
      );
    }
    case "output":
      return step.data ? (
        <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap">
          {typeof step.data === "string" && step.data.startsWith("{") ? (() => {
            try { const parsed = JSON.parse(step.data); return parsed.summary || parsed.analysis || step.data; } catch { return step.data; }
          })() : step.data}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No output recorded</p>
      );
    case "orchestration": {
      const d = step.data;
      return (
        <div className="flex flex-col gap-2">
          {d.output?.pattern && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Pattern:</span>
              <Badge variant="outline" className="text-[10px]">{d.output.pattern}</Badge>
              <span className="text-[11px] text-muted-foreground">Workers:</span>
              <Badge variant="outline" className="text-[10px]">{d.output.workerCount}</Badge>
              {d.output.errorHandling && (
                <>
                  <span className="text-[11px] text-muted-foreground">Error Handling:</span>
                  <Badge variant="outline" className="text-[10px]">{d.output.errorHandling}</Badge>
                </>
              )}
            </div>
          )}
          {d.output?.gateType && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                <Shield className="w-3 h-3 mr-0.5" />
                {d.output.autoApproved ? "Auto-approved" : "Manual Approval"}
              </Badge>
              {d.output.reason && <span className="text-[11px] text-muted-foreground">{d.output.reason}</span>}
            </div>
          )}
        </div>
      );
    }
    case "worker_execution": {
      const d = step.data;
      const workerSteps = d.workerSteps || [];
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Steps:</span>
              <Badge variant="outline" className="text-[10px]">{d.output?.passedSteps || 0}/{d.output?.stepsCount || 0}</Badge>
            </div>
            {d.output?.latencyMs != null && (
              <div className="flex items-center gap-1.5">
                <Timer className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{(d.output.latencyMs / 1000).toFixed(1)}s</span>
              </div>
            )}
            {d.output?.toolsUsed?.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{d.output.toolsUsed.map((t: any) => `${t.server}/${t.tool}`).join(", ")}</span>
              </div>
            )}
          </div>
          {d.output?.analysis && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">AI Analysis</span>
              <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap">
                {typeof d.output.analysis === "object" ? (d.output.analysis.summary || d.output.analysis.analysis || JSON.stringify(d.output.analysis, null, 2)) : String(d.output.analysis)}
              </div>
            </div>
          )}
          {workerSteps.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Execution Steps</span>
              <div className="flex flex-col gap-1 pl-3 border-l-2 border-cyan-500/20">
                {workerSteps.map((ws: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <div className={`w-2 h-2 rounded-full ${ws.status === "completed" ? "bg-emerald-500" : ws.status === "failed" ? "bg-red-500" : "bg-muted-foreground"}`} />
                    <span className="text-[11px] font-medium">{ws.name}</span>
                    <Badge variant="outline" className="text-[9px]">{ws.type}</Badge>
                    {ws.mcpTool && <span className="text-[10px] text-muted-foreground">{ws.mcpServer}/{ws.mcpTool}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.error && (
            <div className="p-2 rounded-md bg-red-500/10 text-xs text-red-600 dark:text-red-400">{d.error}</div>
          )}
        </div>
      );
    }
    case "orchestration_summary": {
      const d = step.data;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Workers Executed:</span>
              <span className="text-xs font-medium">{d.output?.workersExecuted || 0}</span>
            </div>
            <Badge variant={d.output?.allSuccess ? "default" : "destructive"} className="text-[10px]">
              {d.output?.allSuccess ? "All Passed" : "Has Failures"}
            </Badge>
          </div>
          {d.output?.finalOutput && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Final Pipeline Output</span>
              <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {typeof d.output.finalOutput === "string" && d.output.finalOutput.startsWith("{") ? (() => {
                  try { const p = JSON.parse(d.output.finalOutput); return p.summary || p.analysis || d.output.finalOutput; } catch { return d.output.finalOutput; }
                })() : String(d.output.finalOutput)}
              </div>
            </div>
          )}
        </div>
      );
    }
  }
}

export default function TraceDetail() {
  const [, params] = useRoute("/traces/:id");
  const traceId = params?.id;
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const { data: trace, isLoading } = useQuery<RunTrace>({
    queryKey: ["/api/traces", traceId],
    enabled: !!traceId,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4" data-testid="page-trace-detail-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 py-20">
        <Terminal className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Trace not found</p>
        <Link href="/agents">
          <Button variant="outline" data-testid="button-back-agents">Back to Agents</Button>
        </Link>
      </div>
    );
  }

  const promptInputs = trace.promptInputs as PromptInputs | null;
  const rawToolCalls = (trace.toolCalls as ToolCall[] | null) || [];
  const stepsJson = (trace.stepsJson as Array<{ type?: string; output?: unknown; mcpTool?: string; mcpServer?: string; input?: Record<string, unknown>; startedAt?: string; completedAt?: string; name?: string; status?: string; workerSteps?: any[] }> | null) || [];
  const apiSteps = stepsJson.filter(s => s.type === "api_call");
  const toolCalls = rawToolCalls.map((tc, i) => {
    if (tc.output || tc.result) return tc;
    const matchStep = apiSteps[i];
    if (matchStep?.output) {
      return { ...tc, output: matchStep.output };
    }
    return tc;
  });
  const decisions = (trace.decisions as Decision[] | null) || [];
  const policyChecks = (trace.policyChecks as PolicyCheck[] | null) || [];

  const mcpCallSteps = stepsJson.filter(s => s.type === "api_call" && s.mcpTool);
  const mcpCallCount = mcpCallSteps.length;
  const isTeamPipeline = stepsJson.some(s => s.type === "orchestration" || s.type === "worker_execution");
  const workerSteps = stepsJson.filter(s => s.type === "worker_execution");

  const computedDuration = (() => {
    if (trace.latencyMs && trace.latencyMs > 0) return trace.latencyMs;
    if (stepsJson.length > 0) {
      const first = stepsJson[0];
      const last = stepsJson[stepsJson.length - 1];
      if (first?.startedAt && last?.completedAt) {
        return new Date(last.completedAt).getTime() - new Date(first.startedAt).getTime();
      }
    }
    if (trace.startedAt && trace.endedAt) {
      return new Date(trace.endedAt).getTime() - new Date(trace.startedAt).getTime();
    }
    return 0;
  })();

  const completedSteps = stepsJson.filter(s => s.status === "completed").length;
  const totalSteps = stepsJson.length;

  const mcpServers = Array.from(new Set(mcpCallSteps.map(s => s.mcpServer).filter(Boolean))) as string[];

  const timelineSteps = buildTimelineSteps(promptInputs, decisions, toolCalls, policyChecks, trace.outputSummary, stepsJson);

  return (
    <div className="p-6 flex flex-col gap-6 max-w-7xl mx-auto overflow-y-auto h-full" data-testid="page-trace-detail">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/agents/${trace.agentId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Terminal className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold" data-testid="text-trace-title">
              {trace.inputSummary || "Run Trace"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono" data-testid="text-trace-id">{trace.id.substring(0, 8)}...</span>
              {trace.modelId && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-model">
                  <Cpu className="w-3 h-3 mr-0.5" />
                  {trace.modelId}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]" data-testid="badge-env">{trace.environment}</Badge>
              <StatusBadge status={trace.status} />
              {trace.costUsd != null && trace.costUsd > 0 && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-cost">
                  ${trace.costUsd.toFixed(4)}
                </Badge>
              )}
              {(trace.tokenUsage as any)?.totalTokens > 0 && (
                <Badge variant="outline" className="text-[10px]" data-testid="badge-tokens">
                  {((trace.tokenUsage as any).totalTokens as number).toLocaleString()} tokens
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px]">Duration</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-duration">{computedDuration > 0 ? formatMs(computedDuration) : "\u2014"}</span>
            {trace.startedAt && (
              <span className="text-[10px] text-muted-foreground">{formatDate(trace.startedAt)}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wrench className="w-3.5 h-3.5" />
              <span className="text-[11px]">MCP Tool Calls</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tool-calls">{mcpCallCount}</span>
            {mcpServers.length > 0 && (
              <span className="text-[10px] text-muted-foreground truncate">{mcpServers.join(", ")}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Play className="w-3.5 h-3.5" />
              <span className="text-[11px]">Execution Steps</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-steps">
              {totalSteps > 0 ? `${completedSteps}/${totalSteps}` : "\u2014"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {totalSteps === 0 ? "No steps recorded" : completedSteps === totalSteps ? "All passed" : `${totalSteps - completedSteps} pending/failed`}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {isTeamPipeline ? <Users className="w-3.5 h-3.5" /> : <Brain className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{isTeamPipeline ? "Pipeline" : "Execution Type"}</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-type">
              {isTeamPipeline ? `${workerSteps.length} Workers` : "Single Agent"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isTeamPipeline ? "Team orchestration" : trace.modelId || "AI-powered"}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="execution-timeline">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Execution Timeline</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">{timelineSteps.length} steps</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 pl-6">
          {timelineSteps.map((step, index) => {
            const isExpanded = expandedSteps.has(index);
            const isLast = index === timelineSteps.length - 1;
            const status = getStepStatus(step);
            const dotColor = getStepDotColor(step.type);
            const lineColor = getStepLineColor(step.type);

            return (
              <div
                key={index}
                className={`relative pl-8 pb-6 ${!isLast ? `border-l-2 ${lineColor}` : ""}`}
                data-testid={`timeline-step-${index}`}
              >
                <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-background`} />

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex items-start justify-between gap-3 text-left w-full group"
                    onClick={() => toggleStep(index)}
                    data-testid={`button-toggle-step-${index}`}
                  >
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium truncate">{getStepTitle(step)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getStepTypeBadge(step.type)}
                        {step.type === "toolcall" && (
                          <>
                            {step.data.server && (
                              <Badge variant="outline" className="text-[10px]">
                                <Cpu className="w-3 h-3 mr-0.5" />
                                {step.data.server}
                              </Badge>
                            )}
                            {step.data.latencyMs != null && (
                              <Badge variant="outline" className="text-[10px]">
                                <Timer className="w-3 h-3 mr-0.5" />
                                {formatMs(step.data.latencyMs)}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                              Proxied
                            </Badge>
                          </>
                        )}
                        {status === "success" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            <CheckCircle className="w-3 h-3 mr-0.5" />
                            Success
                          </Badge>
                        )}
                        {status === "fail" && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                            <XCircle className="w-3 h-3 mr-0.5" />
                            Failed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 shrink-0 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 p-3 rounded-md bg-muted/30">
                      <TimelineStepContent step={step} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

    </div>
  );
}
