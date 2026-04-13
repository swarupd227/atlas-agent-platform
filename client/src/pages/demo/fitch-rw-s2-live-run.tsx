import { useRef, useEffect } from "react";
import {
  CheckCircle, XCircle, CheckCircle2, Zap, Play, Terminal, Loader2,
} from "lucide-react";
import { FITCH_RW_COLOR, FITCH_RW_AGENTS, TARGET_ISSUER, TARGET_RATING, TARGET_ACTION } from "./fitch-rw-constants";

export interface FitchRWLiveEvent {
  id: number;
  time: string;
  type: string;
  agentName: string;
  tool?: string;
  success?: boolean;
  message: string;
}

function getEventColor(ev: FitchRWLiveEvent): string {
  if (ev.type === "run_start" || ev.type === "setup")      return "text-blue-400";
  if (ev.type === "agent_start")                            return "text-amber-300 font-semibold";
  if (ev.type === "agent_complete" && ev.success !== false) return "text-green-400";
  if (ev.type === "agent_complete" && ev.success === false) return "text-red-400";
  if (ev.type === "pipeline_complete")                      return "text-emerald-400 font-semibold";
  if (ev.type === "error")                                  return "text-red-400";
  if (ev.type === "tool_result" && ev.success)              return "text-emerald-400/80";
  if (ev.type === "tool_result" && !ev.success)             return "text-red-400/80";
  return "text-muted-foreground";
}

function getEventIcon(ev: FitchRWLiveEvent) {
  if (ev.type === "run_start" || ev.type === "setup")      return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_start")                            return <Play className="w-3 h-3 text-amber-300 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success !== false) return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success === false) return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "pipeline_complete")                      return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />;
  if (ev.type === "error")                                  return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "tool_result" && ev.success)              return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
  if (ev.type === "tool_result" && !ev.success)             return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
  return <Terminal className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />;
}

function AgentStepRow({ agentDef, activeKey, completedKeys, hasRun }: {
  agentDef: typeof FITCH_RW_AGENTS[0];
  activeKey: string | null;
  completedKeys: string[];
  hasRun: boolean;
}) {
  const isActive    = activeKey === agentDef.key;
  const isCompleted = completedKeys.includes(agentDef.key);
  const isPending   = !isActive && !isCompleted;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isActive    ? "border-amber-500/40 bg-amber-500/5"
        : isCompleted ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-border/40 bg-muted/10"
      }`}
      data-testid={`agent-step-${agentDef.key}`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
        isCompleted ? "bg-emerald-500/20 text-emerald-400" : isActive ? "bg-amber-500/20 text-amber-300" : "bg-muted/40 text-muted-foreground/40"
      }`}>
        {isCompleted ? "✓" : agentDef.step}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-semibold leading-none ${isActive ? "text-amber-300" : isCompleted ? agentDef.color : "text-muted-foreground/50"}`}>
          {agentDef.name.replace(/^FITCH-RW-\d{3}\s/, "")}
        </p>
        <p className="text-[9px] text-muted-foreground/60 mt-0.5">{agentDef.role}</p>
      </div>
      {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-amber-300" />}
    </div>
  );
}

export default function FitchRWS2LiveRun({
  events,
  activeAgentKey,
  completedKeys,
  running,
  complete,
  memoText,
  onRun,
}: {
  events: FitchRWLiveEvent[];
  activeAgentKey: string | null;
  completedKeys: string[];
  running: boolean;
  complete: boolean;
  memoText: string | null;
  onRun: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events.length]);

  const hasStarted = events.length > 0 || running;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Pipeline Execution</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {TARGET_ISSUER} · {TARGET_RATING} → {TARGET_ACTION} · 4-agent sequential pipeline
          </p>
        </div>
        {!running && (
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 active:scale-95 transition-all shadow-sm"
            style={{ backgroundColor: FITCH_RW_COLOR }}
            data-testid="btn-run-pipeline-s2"
          >
            <Play className="w-4 h-4" />
            {complete ? "Re-run Pipeline" : "Run Pipeline"}
          </button>
        )}
        {running && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: FITCH_RW_COLOR }} />
            <span>Pipeline running…</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Left: Agent steps + SSE log */}
        <div className="xl:col-span-2 space-y-3">
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Agent Pipeline</p>
            {FITCH_RW_AGENTS.map(a => (
              <AgentStepRow
                key={a.key}
                agentDef={a}
                activeKey={activeAgentKey}
                completedKeys={completedKeys}
                hasRun={hasStarted}
              />
            ))}
          </div>

          {/* SSE log */}
          <div className="rounded-xl border bg-black/40 overflow-hidden" data-testid="fitch-rw-sse-log">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: running ? FITCH_RW_COLOR : "hsl(var(--muted-foreground) / 0.3)" }} />
              <span className="text-[11px] font-medium font-mono">SSE Trace Log</span>
            </div>
            <div ref={feedRef} className="h-52 overflow-y-auto px-3 py-2 space-y-1 font-mono">
              {!hasStarted && (
                <p className="text-[10px] text-muted-foreground/40 italic">Waiting for pipeline to start…</p>
              )}
              {events.map(ev => (
                <div key={ev.id} className="flex items-start gap-2" data-testid={`sse-event-${ev.id}`}>
                  {getEventIcon(ev)}
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] text-muted-foreground/40 mr-1.5">{ev.time}</span>
                    {ev.tool && <span className="text-[9px] text-muted-foreground/50 mr-1">[{ev.tool}]</span>}
                    <span className={`text-[10px] ${getEventColor(ev)}`}>{ev.message}</span>
                  </div>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: FITCH_RW_COLOR }} />
                  <span className="text-[10px] animate-pulse" style={{ color: `${FITCH_RW_COLOR}99` }}>Agents running…</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Memo preview */}
        <div className="xl:col-span-3">
          <div className="rounded-xl border bg-card h-full overflow-hidden flex flex-col" data-testid="memo-preview-panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: complete ? "#10B981" : FITCH_RW_COLOR + "66" }} />
                <span className="text-[11px] font-medium">Rating Action Memo — Draft</span>
              </div>
              {complete && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready for Review
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!hasStarted && (
                <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
                    <Terminal className="w-6 h-6" style={{ color: FITCH_RW_COLOR }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{TARGET_ISSUER} — BBB- Rating Watch Analysis</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Run the pipeline to watch 4 agents analyze market signals, SEC filings, peer benchmarks, and generate a Rating Action Memo.
                    </p>
                  </div>
                  <div className="text-left space-y-1.5 p-3 rounded-xl border bg-muted/20 max-w-sm w-full">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Memo will include</p>
                    {[
                      "CDS spread analysis vs 64bps peer median",
                      "Net Debt / EBITDA vs 4× BBB- threshold",
                      "Peer comparison: RTX, LMT, Boeing",
                      "Fitch Corporate Rating Criteria alignment",
                      "Committee recommendation & next steps",
                    ].map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: `${FITCH_RW_COLOR}aa` }} />
                        <p className="text-[10px] text-muted-foreground">{b}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={onRun}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all"
                    style={{ backgroundColor: FITCH_RW_COLOR }}
                    data-testid="btn-run-from-memo"
                  >
                    <Play className="w-4 h-4" />
                    Run Live Pipeline
                  </button>
                </div>
              )}

              {hasStarted && !complete && !memoText && (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: FITCH_RW_COLOR }} />
                  <p className="text-xs text-muted-foreground">Agent 004 drafting Rating Action Memo…</p>
                </div>
              )}

              {memoText && (
                <pre
                  className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap text-foreground/80"
                  data-testid="memo-text-output"
                >
                  {memoText}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
