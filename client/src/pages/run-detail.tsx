import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useState } from "react";
import {
  ArrowLeft,
  Play,
  Clock,
  DollarSign,
  Cpu,
  Wrench,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Zap,
  Brain,
  Hash,
  Bot,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Send,
  FileText,
  Activity,
  Loader2,
  Server,
  ArrowRightLeft,
  Database,
  Globe,
  Plug,
  ScrollText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import type { RunTrace, RunStep, TraceSpan, McpTranscript } from "@shared/schema";

interface RunWithSteps extends RunTrace {
  steps: RunStep[];
}

const stepTypeConfig: Record<string, { icon: typeof Shield; label: string; color: string }> = {
  policy_resolve: { icon: ShieldCheck, label: "Policy Resolution", color: "text-blue-500" },
  run_started: { icon: Play, label: "Run Started", color: "text-emerald-500" },
  llm_plan: { icon: Brain, label: "LLM Planning", color: "text-purple-500" },
  tool_call: { icon: Wrench, label: "Tool Call", color: "text-amber-500" },
  tool_blocked: { icon: Ban, label: "Tool Blocked", color: "text-red-500" },
  llm_output: { icon: FileText, label: "LLM Output", color: "text-purple-500" },
  run_completed: { icon: CheckCircle, label: "Run Completed", color: "text-emerald-500" },
};

const mcpMethodConfig: Record<string, { icon: typeof Server; label: string; color: string }> = {
  "initialize": { icon: Plug, label: "Initialize", color: "text-blue-500" },
  "tools/list": { icon: Wrench, label: "Tools List", color: "text-amber-500" },
  "tools/call": { icon: Wrench, label: "Tool Call", color: "text-amber-600" },
  "resources/list": { icon: Database, label: "Resources List", color: "text-cyan-500" },
  "resources/read": { icon: Database, label: "Resource Read", color: "text-cyan-600" },
  "prompts/list": { icon: ScrollText, label: "Prompts List", color: "text-purple-500" },
  "prompts/get": { icon: ScrollText, label: "Prompt Get", color: "text-purple-600" },
  "notifications/initialized": { icon: CheckCircle, label: "Initialized", color: "text-emerald-500" },
  "completion": { icon: Brain, label: "Completion", color: "text-purple-500" },
};

function StepCard({ step, isLast }: { step: RunStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = stepTypeConfig[step.type] || { icon: Activity, label: step.type, color: "text-muted-foreground" };
  const Icon = config.icon;
  const input = step.input as Record<string, unknown> | null;
  const output = step.output as Record<string, unknown> | null;
  const policyResult = step.policyResult as Record<string, unknown> | null;
  const tokenUsage = step.tokenUsage as { prompt_tokens?: number; completion_tokens?: number } | null;

  return (
    <div className="flex gap-3" data-testid={`run-step-${step.stepIndex}`}>
      <div className="flex flex-col items-center shrink-0">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
          step.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10" :
          step.status === "blocked" ? "border-red-500/30 bg-red-500/10" :
          "border-border bg-muted/50"
        }`}>
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[24px] bg-border" />
        )}
      </div>

      <Card className="flex-1 mb-3">
        <div
          className="flex items-center justify-between gap-3 p-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          data-testid={`toggle-step-${step.stepIndex}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm font-medium">{config.label}</span>
            {step.toolName && (
              <Badge variant="outline" className="text-[10px] font-mono">{step.toolName}</Badge>
            )}
            {step.status === "blocked" && (
              <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {step.durationMs != null && step.durationMs > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <Clock className="w-3 h-3 mr-0.5" />
                {step.durationMs >= 1000 ? `${(step.durationMs / 1000).toFixed(1)}s` : `${step.durationMs}ms`}
              </Badge>
            )}
            {tokenUsage && (tokenUsage.prompt_tokens || tokenUsage.completion_tokens) && (
              <Badge variant="outline" className="text-[10px]">
                <Hash className="w-3 h-3 mr-0.5" />
                {(tokenUsage.prompt_tokens || 0) + (tokenUsage.completion_tokens || 0)}
              </Badge>
            )}
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <CardContent className="pt-0 pb-3 flex flex-col gap-3">
            <Separator />
            {input && Object.keys(input).length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Input</span>
                <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto" data-testid={`step-input-${step.stepIndex}`}>
                  {formatStepData(input)}
                </div>
              </div>
            )}
            {output && Object.keys(output).length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Output</span>
                <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto" data-testid={`step-output-${step.stepIndex}`}>
                  {formatStepData(output)}
                </div>
              </div>
            )}
            {policyResult && Object.keys(policyResult).length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Policy Check</span>
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40">
                  {(policyResult as any).allowed ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium">{(policyResult as any).tool || "Policy"}</span>
                    <span className="text-[11px] text-muted-foreground">{(policyResult as any).reason}</span>
                  </div>
                </div>
              </div>
            )}
            {step.error && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-red-500 uppercase tracking-wider font-medium">Error</span>
                <div className="p-2.5 rounded-md bg-red-500/10 text-[11px] text-red-600 dark:text-red-400 font-mono">
                  {step.error}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function formatStepData(data: Record<string, unknown>): string {
  if (data.plan && typeof data.plan === "string") return data.plan;
  if (data.response && typeof data.response === "string") return data.response;
  return JSON.stringify(data, null, 2);
}

function SpanCard({ span, children, isLast }: { span: TraceSpan; children?: React.ReactNode; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const method = span.mcpMethod || span.spanName;
  const config = mcpMethodConfig[method] || { icon: Activity, label: method, color: "text-muted-foreground" };
  const Icon = config.icon;
  const attrs = span.attributes as Record<string, unknown> | null;
  const evts = span.events as Array<Record<string, unknown>> | null;

  const statusColor = span.status === "ok" ? "border-emerald-500/30 bg-emerald-500/10" :
    span.status === "error" ? "border-red-500/30 bg-red-500/10" :
    "border-border bg-muted/50";

  const maxBarWidth = 200;
  const barWidth = span.durationMs ? Math.max(4, Math.min(maxBarWidth, (span.durationMs / 50) * maxBarWidth)) : 0;

  return (
    <div className="flex gap-3" data-testid={`trace-span-${span.id}`}>
      <div className="flex flex-col items-center shrink-0">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${statusColor}`}>
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[24px] bg-border" />
        )}
      </div>

      <div className="flex-1 mb-3 flex flex-col gap-1">
        <Card>
          <div
            className="flex items-center justify-between gap-3 p-3 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
            data-testid={`toggle-span-${span.id}`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-sm font-medium">{config.label}</span>
              {span.mcpServerName && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Server className="w-3 h-3 mr-0.5" />
                  {span.mcpServerName}
                </Badge>
              )}
              {span.mcpToolName && (
                <Badge variant="outline" className="text-[10px] font-mono">{span.mcpToolName}</Badge>
              )}
              {span.mcpResourceUri && (
                <Badge variant="outline" className="text-[10px] font-mono">{span.mcpResourceUri}</Badge>
              )}
              {span.spanKind !== "internal" && (
                <Badge variant="secondary" className="text-[10px]">{span.spanKind}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {span.durationMs != null && span.durationMs > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 rounded-full bg-primary/30" style={{ width: `${barWidth}px` }}>
                    <div
                      className={`h-full rounded-full ${span.status === "error" ? "bg-red-500" : "bg-primary"}`}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    <Clock className="w-3 h-3 mr-0.5" />
                    {span.durationMs >= 1000 ? `${(span.durationMs / 1000).toFixed(1)}s` : `${span.durationMs}ms`}
                  </Badge>
                </div>
              )}
              {span.status === "error" && (
                <Badge variant="destructive" className="text-[10px]">Error</Badge>
              )}
              {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>

          {expanded && (
            <CardContent className="pt-0 pb-3 flex flex-col gap-3">
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Span Kind</span>
                  <span className="text-xs">{span.spanKind}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Status</span>
                  <span className="text-xs">{span.status}</span>
                </div>
                {span.mcpMethod && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">MCP Method</span>
                    <span className="text-xs font-mono">{span.mcpMethod}</span>
                  </div>
                )}
                {span.mcpServerId && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Server ID</span>
                    <span className="text-xs font-mono">{span.mcpServerId}</span>
                  </div>
                )}
              </div>
              {span.statusMessage && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Status Message</span>
                  <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono">{span.statusMessage}</div>
                </div>
              )}
              {attrs && Object.keys(attrs).length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Attributes</span>
                  <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {JSON.stringify(attrs, null, 2)}
                  </div>
                </div>
              )}
              {evts && evts.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Events</span>
                  <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {JSON.stringify(evts, null, 2)}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
        {children}
      </div>
    </div>
  );
}

function TraceTimeline({ runId }: { runId: string }) {
  const { data: obsData, isLoading } = useQuery<{ spans: TraceSpan[]; transcripts: McpTranscript[] }>({
    queryKey: ["/api/runtime/runs", runId, "observability"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  const spans = obsData?.spans || [];

  if (spans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No MCP trace spans recorded for this run</p>
      </div>
    );
  }

  const rootSpans = spans.filter(s => !s.parentSpanId);
  const childMap = new Map<string, TraceSpan[]>();
  spans.forEach(s => {
    if (s.parentSpanId) {
      const list = childMap.get(s.parentSpanId) || [];
      list.push(s);
      childMap.set(s.parentSpanId, list);
    }
  });

  function renderSpan(span: TraceSpan, isLast: boolean): React.ReactNode {
    const children = childMap.get(span.id) || [];
    return (
      <SpanCard key={span.id} span={span} isLast={isLast && children.length === 0}>
        {children.length > 0 && (
          <div className="ml-4 mt-1">
            {children.map((child, ci) => renderSpan(child, ci === children.length - 1))}
          </div>
        )}
      </SpanCard>
    );
  }

  const totalDuration = spans.reduce((acc, s) => acc + (s.durationMs || 0), 0);
  const mcpMethods = new Set(spans.filter(s => s.mcpMethod).map(s => s.mcpMethod));
  const errorCount = spans.filter(s => s.status === "error").length;

  return (
    <div className="flex flex-col gap-4" data-testid="section-trace-timeline">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Total Spans</span>
            <span className="text-lg font-semibold" data-testid="stat-span-count">{spans.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">MCP Methods</span>
            <span className="text-lg font-semibold" data-testid="stat-mcp-methods">{mcpMethods.size}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Errors</span>
            <span className={`text-lg font-semibold ${errorCount > 0 ? "text-red-500" : ""}`} data-testid="stat-span-errors">{errorCount}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Total Duration</span>
            <span className="text-lg font-semibold" data-testid="stat-span-duration">
              {totalDuration >= 1000 ? `${(totalDuration / 1000).toFixed(1)}s` : `${totalDuration}ms`}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col">
        {rootSpans.map((span, i) => renderSpan(span, i === rootSpans.length - 1))}
      </div>
    </div>
  );
}

function McpTranscriptView({ runId }: { runId: string }) {
  const { data: obsData, isLoading } = useQuery<{ spans: TraceSpan[]; transcripts: McpTranscript[] }>({
    queryKey: ["/api/runtime/runs", runId, "observability"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  const transcripts = obsData?.transcripts || [];

  if (transcripts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <ScrollText className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No MCP transcript entries for this run</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="section-mcp-transcript">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{transcripts.length} entries</Badge>
        {transcripts[0]?.protocolVersion && (
          <Badge variant="secondary" className="text-[10px]">Protocol {transcripts[0].protocolVersion}</Badge>
        )}
      </div>

      {transcripts.map((t) => {
        const isRequest = t.direction === "request";
        const methodConfig = mcpMethodConfig[t.mcpMethod] || { icon: ArrowRightLeft, label: t.mcpMethod, color: "text-muted-foreground" };
        const MethodIcon = methodConfig.icon;

        return (
          <Card key={t.id} data-testid={`transcript-entry-${t.id}`}>
            <div className="p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full ${
                    isRequest ? "bg-blue-500/10" : t.error ? "bg-red-500/10" : "bg-emerald-500/10"
                  }`}>
                    {isRequest ? (
                      <Send className="w-3 h-3 text-blue-500" />
                    ) : t.error ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                    )}
                  </div>
                  <Badge variant={isRequest ? "default" : "secondary"} className="text-[10px]">
                    {isRequest ? "Request" : "Response"}
                  </Badge>
                  <span className="text-sm font-medium">{methodConfig.label}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{t.mcpMethod}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.mcpServerName && (
                    <Badge variant="outline" className="text-[10px]">
                      <Server className="w-3 h-3 mr-0.5" />
                      {t.mcpServerName}
                    </Badge>
                  )}
                  {t.durationMs != null && (
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="w-3 h-3 mr-0.5" />
                      {t.durationMs}ms
                    </Badge>
                  )}
                  {t.jsonrpcId && (
                    <span className="text-[10px] text-muted-foreground font-mono">id: {t.jsonrpcId}</span>
                  )}
                </div>
              </div>

              {t.params && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Params</span>
                  <div className="p-2.5 rounded-md bg-muted/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(t.params as Record<string, unknown>, null, 2)}
                  </div>
                </div>
              )}

              {t.result && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Result</span>
                  <div className="p-2.5 rounded-md bg-emerald-500/5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(t.result as Record<string, unknown>, null, 2)}
                  </div>
                </div>
              )}

              {t.error && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-red-500 uppercase tracking-wider font-medium">Error</span>
                  <div className="p-2.5 rounded-md bg-red-500/10 text-[11px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(t.error as Record<string, unknown>, null, 2)}
                  </div>
                </div>
              )}

              {t.sessionId && (
                <span className="text-[10px] text-muted-foreground">Session: {t.sessionId}</span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function RunDetail() {
  const [, params] = useRoute("/runtime/runs/:id");
  const runId = params?.id;

  const { data: run, isLoading } = useQuery<RunWithSteps>({
    queryKey: ["/api/runtime/runs", runId],
    enabled: !!runId,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4 max-w-5xl mx-auto overflow-y-auto h-full" data-testid="page-run-detail-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 py-20">
        <Activity className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Run not found</p>
        <Link href="/monitor">
          <Button variant="outline" data-testid="button-back-monitor">Back to Monitor</Button>
        </Link>
      </div>
    );
  }

  const steps = run.steps || [];
  const toolCalls = steps.filter(s => s.type === "tool_call" || s.type === "tool_blocked");
  const blockedCalls = steps.filter(s => s.type === "tool_blocked");
  const policySteps = steps.filter(s => s.policyResult);
  const tokenUsage = run.tokenUsage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null;
  const totalDuration = run.latencyMs || 0;

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto overflow-y-auto h-full" data-testid="page-run-detail">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/agents/${run.agentId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Activity className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold" data-testid="text-run-title">
              Agent Run
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono" data-testid="text-run-id">{run.id.substring(0, 12)}...</span>
              {run.modelId && (
                <Badge variant="outline" className="text-[10px]">
                  <Cpu className="w-3 h-3 mr-0.5" />
                  {run.modelId}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{run.environment}</Badge>
              <StatusBadge status={run.status} />
            </div>
          </div>
        </div>
      </div>

      {run.inputSummary && (
        <Card data-testid="section-input">
          <CardContent className="p-4 flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Input</span>
            <p className="text-sm" data-testid="text-run-input">{run.inputSummary}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px]">Duration</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-duration">
              {totalDuration >= 1000 ? `${(totalDuration / 1000).toFixed(1)}s` : `${totalDuration}ms`}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="w-3.5 h-3.5" />
              <span className="text-[11px]">Cost</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-cost">${run.costUsd?.toFixed(4)}</span>
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
              <Shield className="w-3.5 h-3.5" />
              <span className="text-[11px]">Policy Checks</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-policy-checks">{policySteps.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tokens</span>
            </div>
            <span className="text-lg font-semibold" data-testid="stat-tokens">
              {tokenUsage?.total_tokens?.toLocaleString() || "---"}
            </span>
          </CardContent>
        </Card>
      </div>

      {blockedCalls.length > 0 && (
        <Card className="border-red-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Policy Enforcement Active</span>
              <span className="text-xs text-muted-foreground">
                {blockedCalls.length} tool call{blockedCalls.length !== 1 ? "s" : ""} blocked by policy
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="execution" className="flex flex-col gap-4">
        <TabsList data-testid="run-detail-tabs">
          <TabsTrigger value="execution" data-testid="tab-execution">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Execution
          </TabsTrigger>
          <TabsTrigger value="mcp-trace" data-testid="tab-mcp-trace">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            MCP Trace
          </TabsTrigger>
          <TabsTrigger value="mcp-transcript" data-testid="tab-mcp-transcript">
            <ScrollText className="w-3.5 h-3.5 mr-1.5" />
            MCP Transcript
          </TabsTrigger>
        </TabsList>

        <TabsContent value="execution">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-base font-semibold" data-testid="heading-timeline">Execution Timeline</h2>
              <Badge variant="outline" className="text-[10px]">{steps.length} steps</Badge>
            </div>
            <div className="flex flex-col mt-3">
              {steps.map((step, i) => (
                <StepCard key={step.id} step={step} isLast={i === steps.length - 1} />
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No execution steps recorded</p>
              )}
            </div>
          </div>

          {run.outputSummary && (
            <Card className="mt-4" data-testid="section-output">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Final Output</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-3 rounded-md bg-muted/40 text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-run-output">
                  {run.outputSummary}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mcp-trace">
          <div className="flex flex-col gap-1 mb-3">
            <h2 className="text-base font-semibold" data-testid="heading-mcp-trace">MCP Trace Timeline</h2>
            <p className="text-xs text-muted-foreground">OpenTelemetry-style span waterfall for MCP interactions</p>
          </div>
          <TraceTimeline runId={run.id} />
        </TabsContent>

        <TabsContent value="mcp-transcript">
          <div className="flex flex-col gap-1 mb-3">
            <h2 className="text-base font-semibold" data-testid="heading-mcp-transcript">MCP Transcript</h2>
            <p className="text-xs text-muted-foreground">Structured JSON-RPC request/response log</p>
          </div>
          <McpTranscriptView runId={run.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}