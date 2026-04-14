import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Factory, ChevronRight, ShieldCheck, Package, Send, Terminal, RotateCcw } from "lucide-react";
import { useOtcOrderPipeline, OrderLogEntry } from "./otc-order-constants";
import OtcOrderS1Validation from "./otc-order-s1-validation";
import OtcOrderS2Inventory from "./otc-order-s2-inventory";
import OtcOrderS3Release from "./otc-order-s3-release";

const OTC_COLOR = "#FF6B35";

const SCREENS = [
  { id: 1, label: "Order Validation",  shortLabel: "3.1 Validation", Icon: ShieldCheck },
  { id: 2, label: "Inventory Promise", shortLabel: "3.2 Inventory",  Icon: Package },
  { id: 3, label: "Order Release",     shortLabel: "3.3 Release",    Icon: Send },
];

const LOG_TYPE_COLOR: Record<OrderLogEntry["type"], string> = {
  info:     "text-sky-400",
  progress: "text-amber-400",
  complete: "text-emerald-400",
  error:    "text-rose-400",
};

function AgentLogPanel({ entries, open }: { entries: OrderLogEntry[]; open: boolean }) {
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
                <span
                  className="text-[10px] font-mono shrink-0 pt-px"
                  style={{ color: `${OTC_COLOR}bb`, minWidth: 84 }}
                >
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


export default function OtcOrderDemo() {
  const [screen, setScreen]   = useState(1);
  const [logOpen, setLogOpen] = useState(false);
  const { state, trigger, reset } = useOtcOrderPipeline();

  const isRunning  = state.status === "running";
  const isComplete = state.status === "complete";
  const lastAdvancedRef = useRef(0);

  // Auto-open log panel when run starts
  useEffect(() => {
    if (isRunning) setLogOpen(true);
  }, [isRunning]);

  // Auto-advance screens as pipeline progresses
  useEffect(() => {
    const hasInventory = state.results.some(r =>
      r.role === "inventory_validation" || r.role === "resolution_synthesis"
    );
    const hasRelease = state.results.some(r => r.role === "order_release") || isComplete;

    if (hasRelease && screen === 2 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 1800);
      return () => clearTimeout(t);
    }
    if (hasInventory && screen === 1 && lastAdvancedRef.current < 2) {
      const t = setTimeout(() => { lastAdvancedRef.current = 2; setScreen(2); }, 1800);
      return () => clearTimeout(t);
    }
  }, [state.results, screen, isComplete]);

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (id === 1) return isComplete ? "complete" : "available";
    if (id === 2) {
      const unlocked = state.results.some(r =>
        r.role === "inventory_validation" || r.role === "resolution_synthesis" || isComplete
      );
      if (!unlocked && !isRunning) return "locked";
      return screen > 2 ? "complete" : "available";
    }
    if (id === 3) {
      if (isComplete) return screen === 3 ? "active" : "available";
      if (state.results.some(r => r.role === "order_release")) return "available";
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

      {/* ── Top header ──────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,107,53,0.12)", border: "1px solid rgba(255,107,53,0.25)" }}>
            <Factory className="w-4 h-4" style={{ color: OTC_COLOR }} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Order Validation & Promise Engine</h1>
            <p className="text-[10px] text-muted-foreground">
              NovaTech Industries · Meridian Manufacturing ORD-2026-78432 · OTC-AGT-002 · OTC-AGT-003 · OTC-AGT-004
            </p>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-1 ml-auto">
            {SCREENS.map((s, i) => {
              const status   = getScreenStatus(s.id);
              const isActive = status === "active";
              const isDone   = status === "complete";
              const isLocked = status === "locked";
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                    data-testid={`screen-tab-${s.id}`}
                    onClick={() => !isLocked && setScreen(s.id)}
                    disabled={isLocked}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      isActive
                        ? "border text-orange-300"
                        : isDone
                        ? "bg-green-500/10 border border-green-500/20 text-green-400/70 hover:text-green-400"
                        : isLocked
                        ? "opacity-30 cursor-not-allowed text-muted-foreground"
                        : "border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                    }`}
                    style={isActive ? { background: "rgba(255,107,53,0.12)", borderColor: "rgba(255,107,53,0.3)" } : {}}
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

          {/* Status / CTA */}
          <div className="flex items-center gap-2 ml-3">
            {isRunning && (
              <Badge className="text-[9px] border animate-pulse"
                style={{ background: "rgba(255,107,53,0.12)", borderColor: "rgba(255,107,53,0.3)", color: OTC_COLOR }}>
                ⬤ Atlas Running
              </Badge>
            )}
            {isRunning && state.parallelAgentsRunning.length > 0 && (
              <Badge className="text-[9px] bg-violet-500/10 text-violet-400 border-violet-500/20">
                3 parallel agents
              </Badge>
            )}
            {isComplete && (
              <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                ✓ ORD-2026-78432 Released
              </Badge>
            )}
            {isComplete && anyFallback && !anyLive && (
              <Badge className="text-[9px] bg-slate-500/10 text-slate-400 border-slate-500/20">
                Scripted Agents
              </Badge>
            )}
            {isComplete && anyLive && (
              <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">
                Live LLM Agents
              </Badge>
            )}
            {!isRunning && !isComplete && (
              <button
                data-testid="button-run-atlas"
                onClick={trigger}
                className="flex items-center gap-1.5 text-[10px] h-7 px-3 rounded-lg font-semibold text-white"
                style={{ background: OTC_COLOR }}
              >
                ▶ Run Atlas
              </button>
            )}
            {(isRunning || isComplete) && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {state.elapsedSeconds}s
              </span>
            )}

            {/* Log panel toggle */}
            <button
              data-testid="button-toggle-logs"
              onClick={() => setLogOpen(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border transition-all ${
                logOpen
                  ? "border-orange-500/30 text-orange-400 bg-orange-500/8"
                  : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
              }`}
              title="Toggle agent log stream"
            >
              <Terminal className="w-3 h-3" />
              <span className="hidden sm:inline">Logs</span>
              {state.logEntries.length > 0 && (
                <span
                  className="text-[8px] font-mono rounded px-1"
                  style={{ background: "rgba(255,107,53,0.15)", color: OTC_COLOR }}
                >
                  {state.logEntries.length}
                </span>
              )}
            </button>

            {/* Reset button — only when not running */}
            {!isRunning && (isComplete || state.status === "error") && (
              <button
                data-testid="button-reset-demo"
                onClick={handleReset}
                className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all"
                title="Reset demo to initial state"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            <Link href="/demo">
              <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1" data-testid="link-back-demo-hub">
                ← Demo Hub
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Screen content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {screen === 1 && (
          <OtcOrderS1Validation
            pipelineState={state}
            onRunAndNavigate={trigger}
          />
        )}
        {screen === 2 && (
          <OtcOrderS2Inventory pipelineState={state} />
        )}
        {screen === 3 && (
          <OtcOrderS3Release pipelineState={state} />
        )}
      </div>

      {/* ── Agent SSE log panel ──────────────────────────────────────────── */}
      <AgentLogPanel entries={state.logEntries} open={logOpen} />
    </div>
  );
}
