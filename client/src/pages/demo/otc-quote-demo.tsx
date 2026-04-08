import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Inbox, Settings2, BarChart2, Send } from "lucide-react";
import { useOtcQuotePipeline } from "./otc-quote-constants";
import OtcQuoteS1Intake from "./otc-quote-s1-intake";
import OtcQuoteS2Configuration from "./otc-quote-s2-configuration";
import OtcQuoteS3Pricing from "./otc-quote-s3-pricing";
import OtcQuoteS4Document from "./otc-quote-s4-document";

const SCREENS = [
  { id: 1, label: "RFQ Intake",      shortLabel: "2.1 Intake",      Icon: Inbox },
  { id: 2, label: "Configuration",   shortLabel: "2.2 Configure",   Icon: Settings2 },
  { id: 3, label: "Pricing",         shortLabel: "2.3 Pricing",     Icon: BarChart2 },
  { id: 4, label: "Quote Output",    shortLabel: "2.4 Output",      Icon: Send },
];

export default function OtcQuoteDemo() {
  const [screen, setScreen] = useState(1);
  const { state, trigger } = useOtcQuotePipeline();

  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";
  const lastAdvancedRef = useRef(0);

  // Auto-advance: S2→S3 after pricing_optimisation completes; S3→S4 after quote_generation completes.
  // A 2-second dwell ensures the user briefly sees each screen before advancing.
  useEffect(() => {
    const hasPricing = state.results.some(r => r.role === "pricing_optimisation");
    const hasQuote = state.results.some(r => r.role === "quote_generation");

    if (hasQuote && screen === 3 && lastAdvancedRef.current < 4) {
      const t = setTimeout(() => { lastAdvancedRef.current = 4; setScreen(4); }, 2000);
      return () => clearTimeout(t);
    }
    if (hasPricing && screen === 2 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 2000);
      return () => clearTimeout(t);
    }
  }, [state.results, screen]);

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (id === 1) return "complete";
    if (id === 2 && (isRunning || isComplete)) return screen === 2 ? "active" : screen > 2 ? "complete" : "available";
    if (id === 3 && state.results.some(r => r.role === "pricing_optimisation" || r.role === "quote_generation")) return screen === 3 ? "active" : screen > 3 ? "complete" : "available";
    if (id === 4 && isComplete) return screen === 4 ? "active" : "available";
    if (id < screen) return "complete";
    return "locked";
  };

  const handleRunAndNavigate = () => {
    trigger();
    setScreen(2);
  };

  const lastLogs = state.logEntries.slice(-2);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">

      {/* ── Top header ──────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,107,53,0.12)", border: "1px solid rgba(255,107,53,0.25)" }}>
            <FileText className="w-4 h-4" style={{ color: "#FF6B35" }} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Intelligent Quote Configuration</h1>
            <p className="text-[10px] text-muted-foreground">
              NovaTech Industries · Meridian Manufacturing RFQ · OTC-AGT-001 · OTC-AGT-011 · Pre-Order Stage
            </p>
          </div>

          {/* Mini SSE log strip */}
          {isRunning && lastLogs.length > 0 && (
            <div className="hidden xl:flex flex-col gap-0.5 ml-2 max-w-xs">
              {lastLogs.map((l, i) => (
                <span key={i} className="text-[9px] text-muted-foreground/70 font-mono truncate">
                  <span className="text-orange-400/80">[{l.agentCode}]</span> {l.message}
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
                style={{ background: "rgba(255,107,53,0.12)", borderColor: "rgba(255,107,53,0.3)", color: "#FF6B35" }}>
                ⬤ Atlas Running
              </Badge>
            )}
            {isComplete && (
              <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                ✓ Q-78432 Ready
              </Badge>
            )}
            {!isRunning && !isComplete && screen === 1 && (
              <Button
                data-testid="button-run-atlas"
                size="sm"
                onClick={handleRunAndNavigate}
                className="text-[10px] h-7 px-3 font-semibold text-white"
                style={{ background: "#FF6B35" }}
              >
                ▶ Run Atlas
              </Button>
            )}
            {(isRunning || isComplete) && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {state.elapsedSeconds}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Screen content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {screen === 1 && <OtcQuoteS1Intake onRunAndNavigate={handleRunAndNavigate} />}
        {screen === 2 && <OtcQuoteS2Configuration onScreenChange={setScreen} />}
        {screen === 3 && <OtcQuoteS3Pricing onScreenChange={setScreen} />}
        {screen === 4 && <OtcQuoteS4Document />}
      </div>
    </div>
  );
}
