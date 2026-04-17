import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { HeadsetIcon, ChevronRight, Tag, Search, Microscope, Package, Terminal, RotateCcw, Play } from "lucide-react";
import {
  useAdvSupportPipeline,
  type SupportLogEntry,
  ADV_SUPPORT_COLOR,
} from "./adv-support-constants";
import AdvSupportS1Triage     from "./adv-support-s1-triage";
import AdvSupportS2Resolution from "./adv-support-s2-resolution";
import AdvSupportS3Diagnostic from "./adv-support-s3-diagnostic";
import AdvSupportS4Escalation from "./adv-support-s4-escalation";

const ACCENT = ADV_SUPPORT_COLOR;

const SCREENS = [
  { id: 1, label: "Triage & Classification", shortLabel: "4.1 Triage",      Icon: Tag       },
  { id: 2, label: "KB Resolution Attempt",   shortLabel: "4.2 Resolution",  Icon: Search    },
  { id: 3, label: "Diagnostic Reasoning",    shortLabel: "4.3 Diagnostic",  Icon: Microscope },
  { id: 4, label: "T1→T2 Escalation",        shortLabel: "4.4 Escalation",  Icon: Package   },
];

const LOG_TYPE_COLOR: Record<SupportLogEntry["type"], string> = {
  info:      "text-sky-400",
  tool_call: "text-violet-400",
  analysis:  "text-amber-400",
  complete:  "text-emerald-400",
  error:     "text-rose-400",
};

function AgentLogPanel({ entries, open }: { entries: SupportLogEntry[]; open: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, open]);

  if (!open) return null;

  return (
    <div
      className="shrink-0 border-t border-border/40 bg-black/60 backdrop-blur-sm overflow-y-auto"
      style={{ height: 192 }}
      data-testid="panel-agent-logs"
    >
      <div className="px-4 py-2 flex items-center gap-2 border-b border-border/20 sticky top-0 bg-black/80">
        <Terminal className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">Atlas Agent Log Stream</span>
        {entries.length > 0 && (
          <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">{entries.length} events</span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-3 text-[10px] font-mono text-muted-foreground/30 italic">
          Waiting for Atlas agents… press ▶ Run Atlas to begin.
        </div>
      ) : (
        <div className="px-4 py-2 flex flex-col gap-0.5">
          {entries.map((entry, i) => {
            const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
            return (
              <div key={i} className="flex items-start gap-2 leading-tight" data-testid={`log-entry-${i}`}>
                <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0 pt-px">{ts}</span>
                <span className="text-[10px] font-mono shrink-0 pt-px" style={{ color: `${ACCENT}cc`, minWidth: 72 }}>
                  [{entry.agentCode}]
                </span>
                <span className={`text-[10px] font-mono ${LOG_TYPE_COLOR[entry.type]}`}>
                  {entry.message}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

export default function AdvSupportDemo() {
  const [screen, setScreen]   = useState(1);
  const [logOpen, setLogOpen] = useState(false);
  const { state, start, reset } = useAdvSupportPipeline();
  const lastAdvancedRef = useRef(0);

  const isRunning  = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const isComplete = state.phase === "complete";
  const isError    = state.phase === "error";

  // Auto-open log panel when run starts
  useEffect(() => {
    if (isRunning) setLogOpen(true);
  }, [isRunning]);

  // Auto-advance screens
  useEffect(() => {
    if (state.phase === "resolution" && screen === 1 && lastAdvancedRef.current < 2) {
      const t = setTimeout(() => { lastAdvancedRef.current = 2; setScreen(2); }, 1400);
      return () => clearTimeout(t);
    }
    if (state.phase === "diagnostic" && screen === 2 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 1400);
      return () => clearTimeout(t);
    }
    if (state.phase === "escalation" && screen === 3 && lastAdvancedRef.current < 4) {
      const t = setTimeout(() => { lastAdvancedRef.current = 4; setScreen(4); }, 1400);
      return () => clearTimeout(t);
    }
    if (isComplete && screen < 4 && lastAdvancedRef.current < 4) {
      const t = setTimeout(() => { lastAdvancedRef.current = 4; setScreen(4); }, 1400);
      return () => clearTimeout(t);
    }
  }, [state.phase, screen, isComplete]);

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (isComplete) return id < screen ? "complete" : "available";
    const phases: Record<number, string> = { 1: "triage", 2: "resolution", 3: "diagnostic", 4: "escalation" };
    const unlocked = Object.entries(phases).some(([sid, ph]) => parseInt(sid) < id &&
      (state.phase === ph || state.phase === "complete" ||
       ["triage","resolution","diagnostic","escalation","complete"].indexOf(state.phase) >=
       ["triage","resolution","diagnostic","escalation","complete"].indexOf(ph) + 1
      )
    );
    if (id === 1) return "available";
    if (unlocked) return "available";
    return "locked";
  };

  const handleTabClick = (id: number) => {
    const status = getScreenStatus(id);
    if (status !== "locked") setScreen(id);
  };

  const handleReset = async () => {
    reset();
    lastAdvancedRef.current = 0;
    setScreen(1);
    setLogOpen(false);
    await fetch("/demo-api/advantive-support/reset", { method: "POST" }).catch(() => {});
  };

  const runningAgentCode = state.agents.find(a => a.status === "running")?.code;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 bg-card/30 px-5 py-3 flex items-center gap-3">
        <Link href="/demo" data-testid="link-back-demo-hub" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          Demo Hub
        </Link>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <div className="flex items-center gap-2">
          <HeadsetIcon className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
          <span className="text-sm font-semibold text-foreground">Advantive ONE AI-First T1 Support</span>
          <Badge variant="outline" className="text-[10px] border-border/40">Cascade Polymers · InfinityQS v9.3 · ISO Audit</Badge>
        </div>

        {/* Elapsed */}
        {(isRunning || isComplete) && (
          <span className="ml-auto text-[11px] font-mono text-muted-foreground/50">
            {String(Math.floor(state.metrics.elapsed_secs / 60)).padStart(2, "0")}:{String(state.metrics.elapsed_secs % 60).padStart(2, "0")}
          </span>
        )}

        {/* Status pills */}
        <div className="flex items-center gap-1.5 ml-auto">
          {state.metrics.intent_classified && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">Intent ✓</Badge>
          )}
          {state.metrics.kb_confidence > 0 && (
            <Badge variant="outline" className="text-[9px] border-rose-500/40 text-rose-400">
              KB: {Math.round(state.metrics.kb_confidence * 100)}%
            </Badge>
          )}
          {state.metrics.diagnostic_complete && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">Diagnosis ✓</Badge>
          )}
          {state.metrics.sf_case_created && (
            <Badge variant="outline" className="text-[9px]" style={{ borderColor: `${ACCENT}50`, color: ACCENT }}>
              SF #00074821
            </Badge>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 ml-2">
          <button
            data-testid="button-toggle-logs"
            onClick={() => setLogOpen(o => !o)}
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground px-2 py-1 rounded border border-border/30 transition-colors"
          >
            {logOpen ? "Hide" : "Logs"}
          </button>
          {(isComplete || isError || state.phase !== "idle") && (
            <button
              data-testid="button-reset"
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground px-2 py-1 rounded border border-border/30 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          <button
            data-testid="button-run-atlas"
            disabled={isRunning}
            onClick={start}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded text-white transition-all disabled:opacity-50"
            style={{ background: isRunning ? "#64748b" : ACCENT }}
          >
            <Play className="w-3 h-3" />
            {isRunning ? "Running…" : isComplete ? "Re-run Atlas" : "Run Atlas"}
          </button>
        </div>
      </div>

      {/* Agent pipeline row */}
      <div className="shrink-0 border-b border-border/40 bg-card/20 px-5 py-2 flex items-center gap-3 overflow-x-auto">
        {state.agents.map((agent, idx) => {
          const statusColor =
            agent.status === "running"  ? ACCENT :
            agent.status === "complete" ? "#22c55e" :
            agent.status === "error"    ? "#ef4444" :
            "#64748b";
          return (
            <div key={agent.code} className="flex items-center gap-2 shrink-0">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/30" />}
              <div className="flex items-center gap-1.5" data-testid={`agent-status-${agent.code.toLowerCase()}`}>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: statusColor, boxShadow: agent.status === "running" ? `0 0 6px ${statusColor}` : undefined }}
                />
                <span className="text-[10px] font-mono" style={{ color: statusColor }}>{agent.code}</span>
                <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{agent.label}</span>
              </div>
            </div>
          );
        })}
        {runningAgentCode && (
          <div className="ml-auto text-[10px] font-mono animate-pulse" style={{ color: ACCENT }}>
            ↻ {runningAgentCode} reasoning…
          </div>
        )}
        {isComplete && (
          <div className="ml-auto text-[10px] font-mono text-emerald-400">
            ✔ Pipeline complete
          </div>
        )}
        {isError && (
          <div className="ml-auto text-[10px] font-mono text-rose-400">
            ✗ Error — {state.error}
          </div>
        )}
      </div>

      {/* Screen tabs */}
      <div className="shrink-0 border-b border-border/40 bg-card/10 px-4 flex items-center gap-1 overflow-x-auto">
        {SCREENS.map(({ id, shortLabel, Icon }) => {
          const status = getScreenStatus(id);
          const isActive   = status === "active";
          const isLocked   = status === "locked";
          const isComplete_ = status === "complete";
          return (
            <button
              key={id}
              data-testid={`screen-tab-${id}`}
              onClick={() => handleTabClick(id)}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-current"
                  : isComplete_
                  ? "border-transparent text-emerald-400/70"
                  : isLocked
                  ? "border-transparent text-muted-foreground/30 cursor-not-allowed"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
              }`}
              style={isActive ? { color: ACCENT, borderColor: ACCENT } : undefined}
            >
              <Icon className="w-3 h-3" />
              {shortLabel}
              {isLocked    && <span className="text-[9px] opacity-40">🔒</span>}
              {isComplete_ && <span className="text-[9px] text-emerald-400">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Main screen area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {screen === 1 && <AdvSupportS1Triage     state={state} />}
        {screen === 2 && <AdvSupportS2Resolution state={state} />}
        {screen === 3 && <AdvSupportS3Diagnostic state={state} />}
        {screen === 4 && <AdvSupportS4Escalation state={state} />}
      </div>

      {/* Log panel */}
      <AgentLogPanel entries={state.log} open={logOpen} />
    </div>
  );
}
