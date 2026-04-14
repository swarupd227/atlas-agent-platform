import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Factory, ChevronRight, Package, BarChart2, FileCheck, Terminal, RotateCcw } from "lucide-react";
import { usePkgSchedPipeline, type PkgLogEntry, PKG_COLOR } from "./pkg-sched-constants";
import PkgSchedS1Orders from "./pkg-sched-s1-orders";
import PkgSchedS2Optimize from "./pkg-sched-s2-optimize";
import PkgSchedS3Proposal from "./pkg-sched-s3-proposal";

const SCREENS = [
  { id: 1, label: "Order Intelligence",   shortLabel: "1.1 Order Intel",   Icon: Package },
  { id: 2, label: "Schedule Optimizer",   shortLabel: "1.2 Optimize",      Icon: BarChart2 },
  { id: 3, label: "Schedule Proposal",    shortLabel: "1.3 Proposal",      Icon: FileCheck },
];

const LOG_TYPE_COLOR: Record<PkgLogEntry["type"], string> = {
  info:     "text-sky-400",
  progress: "text-amber-400",
  complete: "text-emerald-400",
  error:    "text-rose-400",
};

function AgentLogPanel({ entries, open }: { entries: PkgLogEntry[]; open: boolean }) {
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
      style={{ height: 164 }}
      data-testid="panel-pkg-logs"
    >
      <div className="px-4 py-2 flex items-center gap-2 border-b border-border/20 sticky top-0 bg-black/80">
        <Terminal className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">Atlas Agent Log Stream — PKG Scheduling Pipeline</span>
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
              <div key={i} className="flex items-start gap-2 leading-tight" data-testid={`log-entry-pkg-${i}`}>
                <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0 pt-px">{ts}</span>
                <span className="text-[10px] font-mono shrink-0 pt-px" style={{ color: `${PKG_COLOR}bb`, minWidth: 80 }}>
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

export default function PkgSchedDemo() {
  const [screen, setScreen]   = useState(1);
  const [logOpen, setLogOpen] = useState(false);
  const { state, trigger, reset, isRunning, isComplete } = usePkgSchedPipeline();
  const lastAdvancedRef = useRef(0);

  // Auto-open logs when running starts
  useEffect(() => {
    if (isRunning) setLogOpen(true);
  }, [isRunning]);

  // Auto-advance screens
  useEffect(() => {
    const hasOptimizer = state.results.some(r => r.role === "schedule_optimization") || state.phase2Done;
    const hasProposal  = state.results.some(r => r.role === "schedule_proposal") || state.phase3Done;

    if (hasProposal && screen === 2 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 1800);
      return () => clearTimeout(t);
    }
    if (hasOptimizer && screen === 1 && lastAdvancedRef.current < 2) {
      const t = setTimeout(() => { lastAdvancedRef.current = 2; setScreen(2); }, 1800);
      return () => clearTimeout(t);
    }
  }, [state.results, state.phase2Done, state.phase3Done, screen]);

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (id === 1) return isComplete ? "complete" : "available";
    if (id === 2) {
      const unlocked = state.phase1Done || state.results.some(r => r.role === "order_intelligence" || r.role === "capacity_mapping");
      if (!unlocked) return "locked";
      return screen > 2 ? "complete" : "available";
    }
    if (id === 3) {
      if (isComplete) return screen === 3 ? "active" : "available";
      if (state.phase3Done || state.results.some(r => r.role === "schedule_proposal")) return "available";
      return "locked";
    }
    if (id < screen) return "complete";
    return "locked";
  };

  const handleReset = () => {
    lastAdvancedRef.current = 0;
    setScreen(1);
    reset();
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">

      {/* ── Top header ────────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(0,131,143,0.12)", border: "1px solid rgba(0,131,143,0.25)" }}>
            <Factory className="w-4 h-4" style={{ color: PKG_COLOR }} />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-sm font-bold text-foreground">Predictive Production Scheduling & Capacity Optimization</h1>
            <p className="text-[10px] text-muted-foreground">
              Advantive · Westfield Packaging · Corrugated Plant · 47 orders · 8 machines · PKG-001 · PKG-002 · PKG-003 · PKG-004
            </p>
          </div>

          {/* Screen tabs */}
          <div className="flex items-center gap-1 ml-auto">
            {SCREENS.map((s, i) => {
              const status   = getScreenStatus(s.id);
              const isActive = status === "active";
              const isDone   = status === "complete";
              const isLocked = status === "locked";
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                    data-testid={`screen-tab-pkg-${s.id}`}
                    onClick={() => !isLocked && setScreen(s.id)}
                    disabled={isLocked}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      isActive ? "border text-teal-300"
                      : isDone  ? "bg-green-500/10 border border-green-500/20 text-green-400/70 hover:text-green-400"
                      : isLocked ? "opacity-30 cursor-not-allowed text-muted-foreground"
                      : "border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                    }`}
                    style={isActive ? { background: "rgba(0,131,143,0.12)", borderColor: "rgba(0,131,143,0.30)" } : {}}
                  >
                    <s.Icon className="w-3 h-3" />
                    <span>{s.shortLabel}</span>
                    {isDone && !isActive && <span className="text-[9px]">✓</span>}
                  </button>
                  {i < SCREENS.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-border/50 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Status + CTA — one contextual badge at a time */}
          <div className="flex items-center gap-2 ml-3">

            {/* Idle: run button */}
            {!isRunning && !isComplete && (
              <button
                data-testid="button-run-pkg-atlas"
                onClick={trigger}
                className="flex items-center gap-1.5 text-[10px] h-7 px-3 rounded-lg font-semibold text-white"
                style={{ background: PKG_COLOR }}
              >
                ▶ Run Atlas
              </button>
            )}

            {/* Running: single status badge + timer */}
            {isRunning && (
              <>
                <Badge className="text-[9px] border animate-pulse"
                  style={{ background: "rgba(0,131,143,0.12)", borderColor: "rgba(0,131,143,0.30)", color: PKG_COLOR }}>
                  {state.parallelRunning.length > 0
                    ? `⬤ PKG-001 ∥ PKG-002 parallel`
                    : "⬤ Atlas Running"}
                </Badge>
                <span className="text-[10px] text-muted-foreground/60 font-mono">{state.elapsedSeconds}s</span>
              </>
            )}

            {/* Complete: single success badge + timer */}
            {isComplete && (
              <>
                <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                  ✓ Pipeline complete · {state.elapsedSeconds}s
                </Badge>
                <button
                  data-testid="button-reset-pkg-demo"
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all"
                  title="Reset demo to initial state"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </>
            )}

            {/* Error reset */}
            {!isRunning && !isComplete && state.status === "error" && (
              <button
                data-testid="button-reset-pkg-demo"
                onClick={handleReset}
                className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border border-rose-500/30 text-rose-400 hover:border-rose-400/60 transition-all"
                title="Reset demo to initial state"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            {/* Log toggle — always visible */}
            <button
              data-testid="button-toggle-pkg-logs"
              onClick={() => setLogOpen(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border transition-all ${
                logOpen
                  ? "border-teal-500/30 text-teal-400 bg-teal-500/8"
                  : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
              }`}
              title="Toggle agent log stream"
            >
              <Terminal className="w-3 h-3" />
              <span className="hidden sm:inline">Logs</span>
              {state.logEntries.length > 0 && (
                <span className="text-[8px] font-mono rounded px-1" style={{ background: "rgba(0,131,143,0.15)", color: PKG_COLOR }}>
                  {state.logEntries.length}
                </span>
              )}
            </button>

            <Link href="/demo">
              <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-demo-hub-pkg">
                ← Hub
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Screen content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {screen === 1 && (
          <PkgSchedS1Orders pipelineState={state} onRun={trigger} />
        )}
        {screen === 2 && (
          <PkgSchedS2Optimize pipelineState={state} />
        )}
        {screen === 3 && (
          <PkgSchedS3Proposal pipelineState={state} />
        )}
      </div>

      {/* ── Agent log panel ─────────────────────────────────────────────────── */}
      <AgentLogPanel entries={state.logEntries} open={logOpen} />
    </div>
  );
}
