import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RunTrace, Agent, RunStep } from "@shared/schema";

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

export default function RunDetail() {
  const [, params] = useRoute("/runtime/runs/:id");
  const runId = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
        <p className="text-muted-foreground">Run not found</p>
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
        <Link href={`/traces/${run.id}`}>
          <Button variant="outline" size="sm" data-testid="button-view-trace">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Full Trace
          </Button>
        </Link>
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
        <Card data-testid="section-output">
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
    </div>
  );
}