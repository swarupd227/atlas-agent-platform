import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Scale, ChevronRight, LayoutDashboard, Activity, BarChart2, FileText,
} from "lucide-react";
import { useLittlerPipeline } from "./littler-constants";
import LittlerS1ComplianceHub from "./littler-s1-compliance-hub";
import LittlerS2Orchestration from "./littler-s2-orchestration";
import LittlerS3GapAnalysis from "./littler-s3-gap-analysis";
import LittlerS4Deliverable from "./littler-s4-deliverable";

const SCREENS = [
  { id: 1, label: "Compliance Hub",     shortLabel: "2.1 Hub",         Icon: LayoutDashboard },
  { id: 2, label: "Agent Orchestration",shortLabel: "2.2 Orchestrate",  Icon: Activity },
  { id: 3, label: "Gap Analysis",       shortLabel: "2.3 Gaps",         Icon: BarChart2 },
  { id: 4, label: "Client Deliverable", shortLabel: "2.4 Deliverable",  Icon: FileText },
];

export default function LittlerDemo() {
  const [screen, setScreen] = useState(1);
  const { state, trigger } = useLittlerPipeline();

  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (id === 1) return "complete";
    if (id === 2 && (isRunning || isComplete)) return screen === 2 ? "active" : "complete";
    if (id === 3 && isComplete) return screen === 3 ? "active" : screen > 3 ? "complete" : "available";
    if (id === 4 && isComplete) return screen === 4 ? "active" : "available";
    if (id === screen) return "active";
    if (id < screen) return "complete";
    return "locked";
  };

  const handleRunAndNavigate = () => {
    trigger();
    setScreen(2);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">

      {/* ── Top header ───────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Scale className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Multi-State Policy Compliance Engine</h1>
            <p className="text-[10px] text-muted-foreground">
              Littler Mendelson · MegaRetail Corp · LIT-AGT-001 + LIT-AGT-010 · Matter 2024-LIT-04821
            </p>
          </div>

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
                        ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                        : isDone
                        ? "bg-green-500/10 border border-green-500/20 text-green-400/70 hover:text-green-400"
                        : isLocked
                        ? "opacity-30 cursor-not-allowed text-muted-foreground"
                        : "border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                    }`}
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

          {/* Live status */}
          <div className="flex items-center gap-2 ml-3">
            {isRunning && (
              <Badge className="text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/20 animate-pulse">⬤ LIT-AGT Running</Badge>
            )}
            {isComplete && (
              <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">✓ {state.gapCount} Gaps Found</Badge>
            )}
            {!isRunning && !isComplete && screen === 1 && (
              <Button
                data-testid="button-header-run"
                size="sm"
                onClick={handleRunAndNavigate}
                className="text-[10px] h-7 px-3 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              >
                ▶ Run Analysis
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Screen content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
        {screen === 1 && <LittlerS1ComplianceHub onScreenChange={setScreen} />}
        {screen === 2 && <LittlerS2Orchestration onScreenChange={setScreen} />}
        {screen === 3 && <LittlerS3GapAnalysis onScreenChange={setScreen} />}
        {screen === 4 && <LittlerS4Deliverable onScreenChange={setScreen} />}
      </div>
    </div>
  );
}
