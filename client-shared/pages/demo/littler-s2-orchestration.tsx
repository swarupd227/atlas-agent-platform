import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle2, Bot, Cpu, ArrowRight, Clock,
  AlertTriangle, ChevronRight, Terminal,
} from "lucide-react";
import {
  LITTLER_PIPELINE_STEPS, useLittlerPipeline, type LittlerPipelineState,
} from "./littler-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

const STEP_ICONS = [Bot, Cpu, Activity, CheckCircle2];

function PipelineNode({
  step,
  index,
  state,
  isLast,
}: {
  step: typeof LITTLER_PIPELINE_STEPS[number];
  index: number;
  state: LittlerPipelineState;
  isLast: boolean;
}) {
  const isDone = state.results.some(r => r.role === step.role);
  const isCurrent = state.currentRole === step.role;
  const isPending = !isDone && !isCurrent;

  const Icon = STEP_ICONS[index];

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <div className={`flex-1 rounded-xl border p-3 transition-all min-w-0 ${
        isDone
          ? `border-green-500/30 bg-green-500/[0.04]`
          : isCurrent
          ? `${step.borderColor} ${step.bgColor} ring-1 ring-offset-0 ${step.borderColor}`
          : "border-border/20 opacity-40"
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isDone ? "bg-green-500/15" : isCurrent ? step.bgColor : "bg-muted/20"
          }`}>
            {isDone
              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
              : <Icon className={`w-4 h-4 ${isCurrent ? step.color : "text-muted-foreground/40"}`} />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold ${isDone ? "text-green-400" : isCurrent ? step.color : "text-muted-foreground/50"}`}>
                {step.agentCode}
              </span>
              {isCurrent && (
                <span className="inline-flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <span key={i} className={`w-1 h-1 rounded-full bg-amber-400`}
                      style={{ animation: `pulse 1s ease-in-out ${i * 0.15}s infinite` }} />
                  ))}
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-foreground/80 leading-tight truncate">{step.label}</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/70 leading-tight line-clamp-2">{step.description}</p>
        {isDone && (
          <div className="mt-1.5 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
            <span className="text-[9px] text-green-400/80">Complete</span>
          </div>
        )}
        {isCurrent && (
          <div className="mt-1.5">
            <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400/70" style={{ width: "60%", animation: "progressPulse 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        )}
      </div>
      {!isLast && (
        <ArrowRight className={`w-4 h-4 shrink-0 ${isDone ? "text-green-400/60" : "text-border/50"}`} />
      )}
    </div>
  );
}

function LogPanel({ state }: { state: LittlerPipelineState }) {
  const entries = [...state.logEntries].reverse().slice(0, 30);

  const typeColor: Record<string, string> = {
    info: "text-blue-400/80",
    progress: "text-muted-foreground/60",
    complete: "text-green-400",
    error: "text-red-400",
  };

  return (
    <Card className="border-border/40 bg-background/40 flex-1 min-h-0 flex flex-col overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground/60" />
          <CardTitle className="text-xs font-semibold">Live Agent Log</CardTitle>
          {state.status === "running" && (
            <Badge className="ml-auto text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/20 animate-pulse">⬤ Streaming</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 overflow-y-auto flex-1 flex flex-col-reverse">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Bot className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground/50">Agent log will stream here</p>
          </div>
        ) : (
          <div className="space-y-0.5 font-mono">
            {entries.map((entry, i) => {
              const ts = new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
              return (
                <div key={i} className="flex gap-2 text-[10px] leading-relaxed">
                  <span className="text-muted-foreground/30 shrink-0 tabular-nums">{ts}</span>
                  <span className="text-amber-400/70 shrink-0 w-[76px] truncate">[{entry.agentCode}]</span>
                  <span className={typeColor[entry.type] || "text-muted-foreground/60"}>{entry.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LittlerS2Orchestration({ onScreenChange }: Props) {
  const { state, trigger } = useLittlerPipeline();

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";
  const isError = state.status === "error";

  const completedSteps = state.results.length;
  const totalSteps = LITTLER_PIPELINE_STEPS.length;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

  const mins = Math.floor(state.elapsedSeconds / 60);
  const secs = state.elapsedSeconds % 60;
  const elapsedStr = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">

      {/* ── Header bar ──────────────────────────────────── */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03] shrink-0">
        <CardContent className="py-2.5 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Activity className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-sm font-semibold">Multi-State Compliance Analysis</span>
              <span className="text-[11px] text-muted-foreground ml-2">MegaRetail Corp — MN · ME · IL</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {isRunning && (
                <>
                  <Clock className="w-3 h-3 text-amber-400/70" />
                  <span className="text-[11px] font-mono text-amber-400">{elapsedStr}</span>
                  <Badge className="text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/20 animate-pulse">⬤ Running</Badge>
                </>
              )}
              {isComplete && (
                <>
                  <Clock className="w-3 h-3 text-green-400/70" />
                  <span className="text-[11px] font-mono text-green-400">{elapsedStr}</span>
                  <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">✓ Complete</Badge>
                </>
              )}
              {isError && <Badge className="text-[9px] bg-red-500/15 text-red-400 border-red-500/20">✗ Error</Badge>}
              {isIdle && <Badge className="text-[9px] bg-muted/30 text-muted-foreground border-border/30">Idle</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Progress bar ────────────────────────────────── */}
      {(isRunning || isComplete) && (
        <div className="shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{completedSteps} of {totalSteps} steps complete</span>
            <span className="font-medium text-foreground/70">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Pipeline nodes ──────────────────────────────── */}
      <div className="flex items-stretch gap-1 shrink-0">
        {LITTLER_PIPELINE_STEPS.map((step, i) => (
          <PipelineNode
            key={step.role}
            step={step}
            index={i}
            state={state}
            isLast={i === LITTLER_PIPELINE_STEPS.length - 1}
          />
        ))}
      </div>

      {/* ── Log panel ──────────────────────────────────── */}
      <LogPanel state={state} />

      {/* ── Action row ──────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          {isError && state.error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{state.error}</span>
            </div>
          )}
          {isIdle && (
            <p className="text-[11px] text-muted-foreground">Click ▶ to invoke LIT-AGT-001 &amp; LIT-AGT-010 on Atlas</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(isIdle || isError) && (
            <Button
              data-testid="button-start-analysis"
              size="sm"
              onClick={trigger}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold h-8 px-4"
            >
              ▶ Run Analysis
            </Button>
          )}
          {isRunning && (
            <Button size="sm" disabled className="text-xs h-8 px-4 opacity-60">
              Running…
            </Button>
          )}
          {isComplete && (
            <Button
              data-testid="button-view-results"
              size="sm"
              onClick={() => onScreenChange(3)}
              className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold h-8 px-4"
            >
              View Gap Analysis <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
