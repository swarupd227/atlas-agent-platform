import { useRef, useEffect } from "react";
import {
  CheckCircle, XCircle, CheckCircle2, Zap, Play, Terminal, Loader2,
  FileSignature, AlertTriangle, Brain, IterationCcw,
} from "lucide-react";
import { ONESPAN_COLOR, ONESPAN_AGENTS, TARGET_TXN_ID, TARGET_CLIENT, TARGET_AMOUNT, TARGET_PRODUCT } from "./onespan-constants";

export interface OnespanLiveEvent {
  id: number;
  time: string;
  type: string;
  agentName: string;
  tool?: string;
  success?: boolean;
  message: string;
}

function getEventColor(ev: OnespanLiveEvent): string {
  if (ev.type === "run_start" || ev.type === "setup")       return "text-blue-400";
  if (ev.type === "tool_call")                               return "text-blue-400";
  if (ev.type === "agent_thinking")                          return "text-purple-400/80";
  if (ev.type === "iteration_done")                          return "text-slate-400/70";
  if (ev.type === "agent_start")                             return "text-amber-300 font-semibold";
  if (ev.type === "agent_complete" && ev.success !== false)  return "text-green-400";
  if (ev.type === "agent_complete" && ev.success === false)  return "text-red-400";
  if (ev.type === "pipeline_complete")                       return "text-emerald-400 font-semibold";
  if (ev.type === "error")                                   return "text-red-400";
  if (ev.type === "tool_result" && ev.success)               return "text-emerald-400/80";
  if (ev.type === "tool_result" && !ev.success)              return "text-red-400/80";
  return "text-muted-foreground";
}

function getEventIcon(ev: OnespanLiveEvent) {
  if (ev.type === "run_start" || ev.type === "setup")       return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (ev.type === "tool_call")                               return <Terminal className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_thinking")                          return <Brain className="w-3 h-3 text-purple-400/80 shrink-0 mt-0.5" />;
  if (ev.type === "iteration_done")                          return <IterationCcw className="w-3 h-3 text-slate-400/60 shrink-0 mt-0.5" />;
  if (ev.type === "agent_start")                             return <Play className="w-3 h-3 text-amber-300 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success !== false)  return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success === false)  return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "pipeline_complete")                       return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />;
  if (ev.type === "error")                                   return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "tool_result" && ev.success)               return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
  if (ev.type === "tool_result" && !ev.success)              return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
  return <Terminal className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />;
}

function AgentStepRow({ agentDef, activeKey, completedKeys }: {
  agentDef: typeof ONESPAN_AGENTS[0];
  activeKey: string | null;
  completedKeys: string[];
}) {
  const isActive    = activeKey === agentDef.key;
  const isCompleted = completedKeys.includes(agentDef.key);

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-all ${
        isActive    ? "border-amber-500/40 bg-amber-500/5 shadow-sm" :
        isCompleted ? "border-emerald-500/30 bg-emerald-500/5" :
                      "border-border/50 bg-muted/10"
      }`}
      data-testid={`agent-step-${agentDef.key}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
          isActive ? "bg-amber-500/20 text-amber-300" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/30 text-muted-foreground"
        }`}>
          {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : agentDef.step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold ${isActive ? "text-amber-300" : isCompleted ? "text-emerald-400" : "text-foreground"}`}>{agentDef.name}</span>
            {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 animate-pulse">Running</span>}
            {isCompleted && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Complete</span>}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{agentDef.role}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {agentDef.tools.map(t => (
              <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${agentDef.bgColor} ${agentDef.color} border-current/20`}>{t}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {agentDef.mcpServers.map(s => (
              <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/70 border border-border/40">{s}</span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-[9px] text-muted-foreground/40 font-mono">gpt-4.1</div>
      </div>
    </div>
  );
}

function ReportBlock({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5" data-testid="block-ops-report">
      <div className="flex items-center gap-2 mb-3">
        <FileSignature className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-bold text-emerald-400">Portfolio Operations Intelligence Report</span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto">AGR-004 · ATLAS</span>
      </div>
      <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">{text}</pre>
    </div>
  );
}

export default function OnespanS2LiveRun({
  events, activeAgentKey, completedKeys, running, complete, reportText, onRun,
}: {
  events: OnespanLiveEvent[];
  activeAgentKey: string | null;
  completedKeys: string[];
  running: boolean;
  complete: boolean;
  reportText: string | null;
  onRun: () => void;
}) {
  const logBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (!running && !complete && events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="live-run-empty-state">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${ONESPAN_COLOR}20` }}>
          <FileSignature className="w-7 h-7" style={{ color: ONESPAN_COLOR }} />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold mb-1">OneSpan Digital Agreements Intelligence</h3>
          <p className="text-[12px] text-muted-foreground max-w-md">
            4 agents will run sequentially to detect, classify, and remediate the VIP declined transaction&nbsp;
            <span className="font-mono">{TARGET_TXN_ID}</span> ({TARGET_CLIENT}, {TARGET_AMOUNT} {TARGET_PRODUCT}).
          </p>
        </div>
        <button
          onClick={onRun}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: ONESPAN_COLOR }}
          data-testid="btn-run-pipeline-empty"
        >
          <Play className="w-4 h-4" /> Run Live Pipeline
        </button>
        <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-2xl">
          {ONESPAN_AGENTS.map(agent => (
            <div key={agent.key} className="rounded-xl border border-border/40 bg-muted/10 p-3" data-testid={`card-agent-preview-${agent.key}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] font-bold ${agent.color}`}>STEP {agent.step}</span>
              </div>
              <div className="text-[11px] font-semibold line-clamp-1">{agent.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{agent.role}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agent steps */}
      <div className="space-y-2">
        {ONESPAN_AGENTS.map(agent => (
          <AgentStepRow key={agent.key} agentDef={agent} activeKey={activeAgentKey} completedKeys={completedKeys} />
        ))}
      </div>

      {/* SSE log */}
      <div className="rounded-xl border border-border/50 bg-black/30 overflow-hidden" data-testid="block-sse-log">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div
              data-testid={running ? "status-pipeline-running" : complete ? "status-pipeline-complete" : "status-pipeline-idle"}
              className={`w-1.5 h-1.5 rounded-full ${running ? "bg-amber-400 animate-pulse" : complete ? "bg-emerald-400" : "bg-muted-foreground/40"}`}
            />
            <span className="text-[11px] font-mono font-medium">SSE Trace Log — {TARGET_TXN_ID} Pipeline</span>
          </div>
          <span className="text-[10px] text-muted-foreground/50" data-testid="status-event-count">{events.length} events</span>
        </div>
        <div className="h-56 overflow-y-auto px-3 py-2 space-y-1 font-mono" data-testid="sse-log-body">
          {events.map(ev => (
            <div key={ev.id} className="flex items-start gap-2">
              <span className="text-[9px] text-muted-foreground/40 shrink-0 mt-0.5 w-14">{ev.time}</span>
              {getEventIcon(ev)}
              {ev.tool && <span className="text-[9px] text-muted-foreground/50 shrink-0 max-w-[100px] truncate">[{ev.tool}]</span>}
              <span className={`text-[10px] leading-tight ${getEventColor(ev)}`}>{ev.message}</span>
            </div>
          ))}
          {running && (
            <div className="flex items-center gap-2 pt-1">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: ONESPAN_COLOR }} />
              <span className="text-[10px] animate-pulse" style={{ color: `${ONESPAN_COLOR}99` }}>Agents running…</span>
            </div>
          )}
          <div ref={logBottomRef} />
        </div>
      </div>

      {/* Intervention summary */}
      {complete && completedKeys.includes("interventionOrchestrator") && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4" data-testid="block-intervention-summary">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-blue-400 mb-1">Intervention Complete — {TARGET_TXN_ID}</div>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li>✓ Envelope resent to Sarah Keating (VP Treasury) with document v1.4</li>
                <li>✓ CRM record updated — status: intervention_active, RM David Okafor attributed</li>
                <li>✓ Relationship Manager David Okafor notified — 2h response SLA active</li>
                <li>✓ Helpdesk ticket created (auto-resolved) — AML attestation gap remediated</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Ops Report */}
      {complete && reportText && <ReportBlock text={reportText} />}
    </div>
  );
}
