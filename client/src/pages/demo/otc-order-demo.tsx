import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Factory, ChevronRight, ShieldCheck, Package, Send } from "lucide-react";
import { useOtcOrderPipeline } from "./otc-order-constants";
import OtcOrderS1Validation from "./otc-order-s1-validation";
import OtcOrderS2Inventory from "./otc-order-s2-inventory";
import OtcOrderS3Release from "./otc-order-s3-release";

const OTC_COLOR = "#FF6B35";

const SCREENS = [
  { id: 1, label: "Order Validation",   shortLabel: "3.1 Validation",  Icon: ShieldCheck },
  { id: 2, label: "Inventory Promise",  shortLabel: "3.2 Inventory",   Icon: Package },
  { id: 3, label: "Order Release",      shortLabel: "3.3 Release",     Icon: Send },
];

export default function OtcOrderDemo() {
  const [screen, setScreen] = useState(1);
  const { state, trigger } = useOtcOrderPipeline();

  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";
  const lastAdvancedRef = useRef(0);

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
      const unlocked = state.results.some(r => r.role === "inventory_validation" || r.role === "resolution_synthesis" || isComplete);
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

  const handleRunAndNavigate = () => {
    trigger();
  };

  const lastLogs = state.logEntries.slice(-2);

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
              NovaTech Industries · Meridian Manufacturing ORD-2026-78432 · OTC-AGT-002 · OTC-AGT-003 · OTC-AGT-004 · Order Processing
            </p>
          </div>

          {/* Mini SSE log strip */}
          {isRunning && lastLogs.length > 0 && (
            <div className="hidden xl:flex flex-col gap-0.5 ml-2 max-w-xs">
              {lastLogs.map((l, i) => (
                <span key={i} className="text-[9px] text-muted-foreground/70 font-mono truncate">
                  <span style={{ color: `${OTC_COLOR}cc` }}>[{l.agentCode}]</span> {l.message}
                </span>
              ))}
            </div>
          )}

          {/* Step tabs */}
          <div className="flex items-center gap-1 ml-auto">
            {SCREENS.map((s, i) => {
              const status = getScreenStatus(s.id);
              const isActive = status === "active";
              const isDone = status === "complete";
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
            {!isRunning && !isComplete && (
              <button
                data-testid="button-run-atlas"
                onClick={handleRunAndNavigate}
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
            <Link href="/demo">
              <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1" data-testid="link-back-demo-hub">← Demo Hub</button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Screen content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {screen === 1 && (
          <OtcOrderS1Validation
            pipelineState={state}
            onRunAndNavigate={handleRunAndNavigate}
          />
        )}
        {screen === 2 && (
          <OtcOrderS2Inventory pipelineState={state} />
        )}
        {screen === 3 && (
          <OtcOrderS3Release pipelineState={state} />
        )}
      </div>
    </div>
  );
}
