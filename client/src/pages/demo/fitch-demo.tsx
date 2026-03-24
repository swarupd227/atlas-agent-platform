import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, BarChart2, Activity, MessageSquare, AlertTriangle, FileText,
  ChevronLeft, ChevronRight, TrendingDown, Database,
} from "lucide-react";
import FitchS1CommandCenter from "./fitch-s1-command-center";
import FitchS2FfiecIngest from "./fitch-s2-ffiec-ingest";
import FitchS3RiskScoring from "./fitch-s3-risk-scoring";
import FitchS4NlpSignals from "./fitch-s4-nlp-signals";
import FitchS5SvbBacktest from "./fitch-s5-svb-backtest";
import FitchS6ReportAssembly from "./fitch-s6-report-assembly";

const SCREENS = [
  {
    id: 1,
    label: "Command Center",
    icon: Activity,
    description: "Portfolio overview, live pipeline runner, watch list",
  },
  {
    id: 2,
    label: "FFIEC Ingest",
    icon: Database,
    description: "Call Report data ingestion, CAMELS sub-scoring",
  },
  {
    id: 3,
    label: "Risk Scoring",
    icon: BarChart2,
    description: "Composite CAMELS scores, portfolio risk distribution",
  },
  {
    id: 4,
    label: "NLP Signals",
    icon: MessageSquare,
    description: "Earnings transcripts, SEC filings, news sentiment",
  },
  {
    id: 5,
    label: "SVB Backtest",
    icon: AlertTriangle,
    description: "SVB early warning validation — the wow moment",
  },
  {
    id: 6,
    label: "Report Assembly",
    icon: FileText,
    description: "AI-assembled credit assessment packages",
  },
] as const;

export default function FitchDemo() {
  const [activeScreen, setActiveScreen] = useState(1);

  const screen = SCREENS.find(s => s.id === activeScreen)!;
  const ScreenIcon = screen.icon;

  const goNext = () => setActiveScreen(s => Math.min(6, s + 1));
  const goPrev = () => setActiveScreen(s => Math.max(1, s - 1));

  return (
    <div className="flex flex-col h-full">
      {/* Demo header */}
      <div className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-rose-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold">Fitch Ratings</h1>
                    <Badge variant="secondary" className="text-[10px]">Asset Quality Early Warning System</Badge>
                    <Badge className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/30">Live Demo</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    6 GPT-4.1 agents · 4 MCP servers · 15 tools · SVB backtesting
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={goPrev} disabled={activeScreen === 1} className="h-7 w-7 p-0">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1">
                {SCREENS.map(s => (
                  <button
                    key={s.id}
                    data-testid={`fitch-nav-screen-${s.id}`}
                    onClick={() => setActiveScreen(s.id)}
                    className={`text-[10px] px-2.5 py-1 rounded transition-all ${
                      activeScreen === s.id
                        ? "bg-rose-600 text-white font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {s.id}. {s.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={goNext} disabled={activeScreen === 6} className="h-7 w-7 p-0">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Current screen context bar */}
          <div className="flex items-center gap-2 mt-2">
            <ScreenIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium">{screen.label}</span>
            <span className="text-muted-foreground/40 text-[11px]">·</span>
            <span className="text-[11px] text-muted-foreground">{screen.description}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/40">{activeScreen} / 6</span>
          </div>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          {activeScreen === 1 && <FitchS1CommandCenter onScreenChange={setActiveScreen} />}
          {activeScreen === 2 && <FitchS2FfiecIngest />}
          {activeScreen === 3 && <FitchS3RiskScoring />}
          {activeScreen === 4 && <FitchS4NlpSignals />}
          {activeScreen === 5 && <FitchS5SvbBacktest />}
          {activeScreen === 6 && <FitchS6ReportAssembly />}
        </div>
      </div>
    </div>
  );
}
