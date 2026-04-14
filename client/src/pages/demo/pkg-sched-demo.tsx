import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Factory, ChevronRight, Package, BarChart2, FileCheck,
  Terminal, RotateCcw, ChevronDown, ChevronUp, Lock, CheckCircle2,
} from "lucide-react";
import { usePkgSchedPipeline, type PkgLogEntry, PKG_COLOR } from "./pkg-sched-constants";
import PkgSchedS1Orders from "./pkg-sched-s1-orders";
import PkgSchedS2Optimize from "./pkg-sched-s2-optimize";
import PkgSchedS3Proposal from "./pkg-sched-s3-proposal";

const SCREENS = [
  { id: 1, label: "Analyze Orders",    shortLabel: "1  Analyze Orders",    Icon: Package },
  { id: 2, label: "Plan Alternatives", shortLabel: "2  Plan Alternatives", Icon: BarChart2 },
  { id: 3, label: "Approve & Commit",  shortLabel: "3  Approve & Commit",  Icon: FileCheck },
];

const LOG_TYPE_COLOR: Record<PkgLogEntry["type"], string> = {
  info:     "text-sky-400",
  progress: "text-amber-400",
  complete: "text-emerald-400",
  error:    "text-rose-400",
};

// ── Log drawer — absolute overlay, never steals content height ─────────────
function AgentLogPanel({
  entries,
  open,
  onToggle,
}: {
  entries: PkgLogEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, open]);

  return (
    // Absolute overlay anchored to bottom — zero content reflow
    <div
      className="absolute bottom-0 left-0 right-0 z-30 border-t border-border/50 transition-all duration-200"
      style={{ height: open ? "clamp(160px, 22vh, 240px)" : 32 }}
      data-testid="panel-pkg-logs"
    >
      {/* Persistent handle strip — always visible, click to toggle */}
      <button
        data-testid="button-toggle-pkg-logs-handle"
        onClick={onToggle}
        className="w-full h-8 flex items-center gap-2 px-4 bg-black/85 backdrop-blur-sm border-b border-border/30 hover:bg-black/90 transition-colors"
      >
        <Terminal className="w-3 h-3 text-muted-foreground/50 shrink-0" />
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
          Atlas Agent Log Stream
        </span>
        {entries.length > 0 && (
          <span className="text-[9px] font-mono rounded px-1.5 py-px ml-1"
            style={{ background: "rgba(0,131,143,0.18)", color: PKG_COLOR }}>
            {entries.length} events
          </span>
        )}
        <span className="ml-auto">
          {open
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
            : <ChevronUp   className="w-3.5 h-3.5 text-muted-foreground/50" />}
        </span>
      </button>

      {/* Scrollable log content */}
      {open && (
        <div
          className="overflow-y-auto bg-black/80 backdrop-blur-sm"
          style={{ height: "calc(clamp(160px, 22vh, 240px) - 32px)" }}
        >
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
      )}
    </div>
  );
}

export default function PkgSchedDemo() {
  const [screen, setScreen]     = useState(1);
  const [logOpen, setLogOpen]   = useState(true);
  const [selectedAlt, setSelectedAlt] = useState("ALT-A");
  const { state, trigger, reset, isRunning, isComplete } = usePkgSchedPipeline();
  const lastAdvancedRef = useRef(0);

  // Auto-advance S1 → S2 only (S2 → S3 requires user to click "Proceed")
  useEffect(() => {
    const hasOptimizer = state.phase2Done || state.results.some(r => r.role === "schedule_optimization");
    if (hasOptimizer && screen === 1 && lastAdvancedRef.current < 2) {
      const t = setTimeout(() => { lastAdvancedRef.current = 2; setScreen(2); }, 1800);
      return () => clearTimeout(t);
    }
  }, [state.results, state.phase2Done, screen]);

  // Phase completion — derived once, used everywhere
  const phase1Complete = state.phase1Done
    || state.results.some(r => r.role === "order_intelligence")
    || state.results.some(r => r.role === "capacity_mapping");
  const phase2Complete = state.phase2Done
    || state.results.some(r => r.role === "schedule_optimization");
  const phase3Complete = state.phase3Done
    || state.results.some(r => r.role === "schedule_proposal")
    || isComplete;

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (id === 1) return phase1Complete ? "complete" : "available";
    if (id === 2) {
      if (!phase1Complete) return "locked";
      return phase2Complete ? "complete" : "available";
    }
    if (id === 3) {
      if (!phase2Complete) return "locked";
      return phase3Complete ? "complete" : "available";
    }
    return "locked";
  };

  const handleReset = () => {
    lastAdvancedRef.current = 0;
    setScreen(1);
    setLogOpen(true);
    setSelectedAlt("ALT-A");
    reset();
  };

  return (
    // relative so the log overlay can absolute-position to bottom
    <div className="relative flex flex-col h-screen max-h-screen bg-background overflow-hidden">

      {/* ══ HEADER — ROW A: identity + actions ══════════════════════════════ */}
      <div className="border-b border-border/30 bg-background/90 backdrop-blur-sm shrink-0">
        <div className="px-5 h-12 flex items-center gap-3">
          {/* Logo */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(0,131,143,0.12)", border: "1px solid rgba(0,131,143,0.25)" }}>
            <Factory className="w-4 h-4" style={{ color: PKG_COLOR }} />
          </div>

          {/* Title */}
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground leading-none truncate">
              Predictive Production Scheduling & Capacity Optimization
            </h1>
            <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5 truncate">
              Advantive · Westfield Packaging · 47 orders · 8 machines · PKG-001–004
            </p>
          </div>

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 ml-auto shrink-0">

            {/* Idle */}
            {!isRunning && !isComplete && state.status !== "error" && (
              <button
                data-testid="button-run-pkg-atlas"
                onClick={trigger}
                className="flex items-center gap-1.5 text-[10px] h-7 px-3 rounded-lg font-semibold text-white"
                style={{ background: PKG_COLOR }}
              >
                ▶ Run Atlas
              </button>
            )}

            {/* Running */}
            {isRunning && (
              <>
                <Badge className="text-[9px] border animate-pulse"
                  style={{ background: "rgba(0,131,143,0.12)", borderColor: "rgba(0,131,143,0.30)", color: PKG_COLOR }}>
                  {state.parallelRunning.length > 0
                    ? "⬤ PKG-001 ∥ PKG-002 parallel"
                    : "⬤ Atlas Running"}
                </Badge>
                <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">{state.elapsedSeconds}s</span>
              </>
            )}

            {/* Complete */}
            {isComplete && (
              <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                ✓ Pipeline complete · {state.elapsedSeconds}s
              </Badge>
            )}

            {/* Error */}
            {!isRunning && !isComplete && state.status === "error" && (
              <Badge className="text-[9px] bg-rose-500/15 text-rose-400 border-rose-500/20">
                ✗ Pipeline error
              </Badge>
            )}

            {/* Reset */}
            {!isRunning && (isComplete || state.status === "error") && (
              <button
                data-testid="button-reset-pkg-demo"
                onClick={handleReset}
                className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all"
                title="Reset demo"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}

            <Link href="/demo">
              <button className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors px-1" data-testid="link-back-demo-hub-pkg">
                ← Hub
              </button>
            </Link>
          </div>
        </div>

        {/* ══ HEADER — ROW B: pipeline progress tabs ══════════════════════ */}
        <div className="px-5 pb-0 flex items-stretch gap-0 border-t border-border/20">
          {SCREENS.map((s, i) => {
            const status   = getScreenStatus(s.id);
            const isActive = status === "active";
            const isDone   = status === "complete";
            const isLocked = status === "locked";

            return (
              <div key={s.id} className="flex items-stretch">
                <button
                  data-testid={`screen-tab-pkg-${s.id}`}
                  onClick={() => !isLocked && setScreen(s.id)}
                  disabled={isLocked}
                  className={`relative flex items-center gap-2 px-5 py-2.5 text-[11px] font-medium transition-all select-none ${
                    isActive  ? "text-foreground"
                    : isDone  ? "text-emerald-400/80 hover:text-emerald-400 cursor-pointer"
                    : isLocked ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground/60 hover:text-foreground cursor-pointer"
                  }`}
                >
                  {/* Active bottom indicator */}
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                      style={{ background: PKG_COLOR }} />
                  )}
                  {/* Icon */}
                  {isDone
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : isLocked
                    ? <Lock className="w-3 h-3 shrink-0" />
                    : <s.Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "" : "opacity-60"}`}
                        style={isActive ? { color: PKG_COLOR } : {}} />
                  }
                  <span>{s.shortLabel}</span>
                </button>
                {i < SCREENS.length - 1 && (
                  <div className="flex items-center px-1">
                    <ChevronRight className="w-3 h-3 text-border/40" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Log toggle — lives in tab row, right-aligned */}
          <button
            data-testid="button-toggle-pkg-logs"
            onClick={() => setLogOpen(v => !v)}
            className={`ml-auto flex items-center gap-1.5 text-[10px] px-3 py-2 transition-all ${
              logOpen
                ? "text-teal-400"
                : "text-muted-foreground/50 hover:text-foreground"
            }`}
            title="Toggle agent log panel"
          >
            <Terminal className="w-3 h-3" />
            <span>Logs</span>
            {state.logEntries.length > 0 && (
              <span className="text-[8px] font-mono rounded px-1 py-px"
                style={{ background: "rgba(0,131,143,0.15)", color: PKG_COLOR }}>
                {state.logEntries.length}
              </span>
            )}
            {logOpen
              ? <ChevronDown className="w-3 h-3 opacity-60" />
              : <ChevronUp   className="w-3 h-3 opacity-60" />}
          </button>
        </div>
      </div>

      {/* ══ SCREEN CONTENT ═══════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {screen === 1 && <PkgSchedS1Orders pipelineState={state} onRun={trigger} />}
        {screen === 2 && (
          <PkgSchedS2Optimize
            pipelineState={state}
            selectedAlt={selectedAlt}
            onSelectAlt={setSelectedAlt}
            onProceed={() => { lastAdvancedRef.current = 3; setScreen(3); }}
          />
        )}
        {screen === 3 && <PkgSchedS3Proposal pipelineState={state} selectedAlt={selectedAlt} />}
      </div>

      {/* ══ LOG DRAWER — absolute overlay, zero content reflow ═══════════════ */}
      <AgentLogPanel
        entries={state.logEntries}
        open={logOpen}
        onToggle={() => setLogOpen(v => !v)}
      />
    </div>
  );
}
