import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Terminal,
  Clock,
  DollarSign,
  Cpu,
  MessageSquare,
  Wrench,
  FileText,
  GitBranch,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Zap,
  Brain,
  Search,
  BarChart3,
  Timer,
  Hash,
  Bot,
  Play,
  Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { InfoRow, formatDate, formatMs } from "@/components/shared-utils";
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

interface RetrievedDoc {
  source: string;
  title: string;
  relevanceScore: number;
  snippet: string;
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

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface PromptInputs {
  systemPrompt: string;
  userMessage: string;
  contextVariables: Record<string, unknown>;
}

type TimelineStep =
  | { type: "prompt"; data: PromptInputs | null }
  | { type: "decision"; data: Decision; originalIndex: number }
  | { type: "toolcall"; data: ToolCall; originalIndex: number }
  | { type: "policycheck"; data: PolicyCheck; originalIndex: number }
  | { type: "output"; data: string | null };

function buildTimelineSteps(
  promptInputs: PromptInputs | null,
  decisions: Decision[],
  toolCalls: ToolCall[],
  policyChecks: PolicyCheck[],
  outputSummary: string | null | undefined,
): TimelineStep[] {
  const steps: TimelineStep[] = [];

  steps.push({ type: "prompt", data: promptInputs });

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
        <div className="p-3 rounded-md bg-muted/40 text-xs leading-relaxed">
          {step.data}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No output recorded</p>
      );
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
  const stepsJson = (trace.stepsJson as Array<{ type?: string; output?: unknown; mcpTool?: string; input?: Record<string, unknown> }> | null) || [];
  const apiSteps = stepsJson.filter(s => s.type === "api_call");
  const toolCalls = rawToolCalls.map((tc, i) => {
    if (tc.output || tc.result) return tc;
    const matchStep = apiSteps[i];
    if (matchStep?.output) {
      return { ...tc, output: matchStep.output };
    }
    return tc;
  });
  const retrievedDocs = (trace.retrievedDocs as RetrievedDoc[] | null) || [];
  const decisions = (trace.decisions as Decision[] | null) || [];
  const policyChecks = (trace.policyChecks as PolicyCheck[] | null) || [];
  const tokenUsage = trace.tokenUsage as TokenUsage | null;

  const totalToolLatency = toolCalls.reduce((sum, tc) => sum + (tc.latencyMs || 0), 0);
  const modelLatency = (trace.latencyMs || 0) - totalToolLatency;

  const timelineSteps = buildTimelineSteps(promptInputs, decisions, toolCalls, policyChecks, trace.outputSummary);

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
            <span className="text-lg font-semibold" data-testid="stat-duration">{formatMs(trace.latencyMs)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="w-3.5 h-3.5" />
              <span className="text-[11px]">Cost</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-cost">${trace.costUsd?.toFixed(4)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wrench className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tool Calls</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tool-calls">{toolCalls.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tokens</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tokens">{tokenUsage ? tokenUsage.totalTokens.toLocaleString() : "\u2014"}</span>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="section-execution-summary">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Execution Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-0">
          <InfoRow label="Agent ID" value={<span className="font-mono text-xs">{trace.agentId.substring(0, 12)}...</span>} testId="info-agent-id" />
          {trace.versionId && <InfoRow label="Version" value={trace.versionId} testId="info-version" />}
          <InfoRow label="Environment" value={<Badge variant="outline" className="text-[10px]">{trace.environment}</Badge>} testId="info-env" />
          <InfoRow label="Status" value={<StatusBadge status={trace.status} />} testId="info-status" />
          <InfoRow label="Model" value={trace.modelId || "\u2014"} testId="info-model" />
          <InfoRow label="Started" value={formatDate(trace.startedAt)} testId="info-started" />
          <InfoRow label="Ended" value={formatDate(trace.endedAt)} testId="info-ended" />
          <InfoRow label="Duration" value={formatMs(trace.latencyMs)} testId="info-duration" />
          <InfoRow label="Cost" value={`$${trace.costUsd?.toFixed(4)}`} testId="info-cost" />
          {tokenUsage && (
            <>
              <InfoRow label="Prompt Tokens" value={tokenUsage.promptTokens.toLocaleString()} testId="info-prompt-tokens" />
              <InfoRow label="Completion Tokens" value={tokenUsage.completionTokens.toLocaleString()} testId="info-completion-tokens" />
              <InfoRow label="Total Tokens" value={tokenUsage.totalTokens.toLocaleString()} testId="info-total-tokens" />
            </>
          )}
          {trace.outputSummary && <InfoRow label="Output" value={trace.outputSummary} testId="info-output" />}
        </CardContent>
      </Card>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="section-retrieved-docs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Retrieved Documents</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">{retrievedDocs.length} docs</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {retrievedDocs.length > 0 ? retrievedDocs.map((doc, i) => (
              <div key={i} className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/30" data-testid={`retrieved-doc-${i}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{doc.title}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{doc.source}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">Relevance</span>
                    <div className="w-16">
                      <Progress value={doc.relevanceScore * 100} className="h-1.5" />
                    </div>
                    <span className="text-[10px] font-medium w-8 text-right">{(doc.relevanceScore * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="p-2 rounded bg-background/50 text-[11px] text-muted-foreground leading-relaxed">
                  {doc.snippet}
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No documents retrieved</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="section-cost-latency">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Cost & Latency Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Model Inference</span>
                <span className="text-xs font-medium">{formatMs(modelLatency > 0 ? modelLatency : 0)}</span>
              </div>
              <Progress value={trace.latencyMs ? (Math.max(0, modelLatency) / trace.latencyMs) * 100 : 0} className="h-2" />
            </div>
            {toolCalls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Tool Calls (total)</span>
                  <span className="text-xs font-medium">{formatMs(totalToolLatency)}</span>
                </div>
                <Progress value={trace.latencyMs ? (totalToolLatency / trace.latencyMs) * 100 : 0} className="h-2" />
              </div>
            )}
            <Separator />
            <div className="flex flex-col gap-1">
              {toolCalls.map((tc, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-[11px] text-muted-foreground font-mono">{tc.name}</span>
                  <span className="text-[11px] font-medium">{formatMs(tc.latencyMs)}</span>
                </div>
              ))}
            </div>
            {tokenUsage && (
              <>
                <Separator />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-[11px] text-muted-foreground">Prompt tokens</span>
                    <span className="text-[11px] font-medium">{tokenUsage.promptTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-[11px] text-muted-foreground">Completion tokens</span>
                    <span className="text-[11px] font-medium">{tokenUsage.completionTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1 font-medium">
                    <span className="text-[11px] text-muted-foreground">Total</span>
                    <span className="text-[11px]">{tokenUsage.totalTokens.toLocaleString()}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
