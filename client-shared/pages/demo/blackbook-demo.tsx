import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import {
  LayoutDashboard,
  AlertTriangle,
  TrendingDown,
  FileText,
  Activity,
  Gauge,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
  Zap,
  Terminal,
  CheckCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";

import BBScreen1OutcomeCockpit from "./bb-s1-outcome-cockpit";
import BBScreen2AnomalyDetection from "./bb-s2-anomaly-detection";
import BBScreen3MarketShift from "./bb-s3-market-shift";
import BBScreen4WeeklyReport from "./bb-s4-weekly-report";
import BBScreen5SelfHealing from "./bb-s5-self-healing";
import BBScreen6OdometerFraud from "./bb-s6-odometer-fraud";

type ScreenId = "outcome" | "anomaly" | "market-shift" | "weekly-report" | "self-healing" | "odometer-fraud";
type ScenarioId = "standard" | "fraud-ring" | "self-healing" | "odometer-fraud";

const SCENARIOS: {
  id: ScenarioId;
  label: string;
  sub: string;
  tags: string[];
  description: string;
  defaultScreen: ScreenId;
}[] = [
  {
    id: "standard",
    label: "Standard Weekly Run",
    sub: "Routine pipeline — all signals green",
    tags: ["Routine", "All Clear", "Report Generated"],
    description: "Normal weekly pipeline: 142K transactions scanned, 1 fraud pattern quarantined, market shift detected 2.8 weeks ahead, report 85% auto-drafted.",
    defaultScreen: "outcome",
  },
  {
    id: "fraud-ring",
    label: "Multi-Region Fraud Ring",
    sub: "11 VINs across 4 auctions · Escalation required",
    tags: ["Critical", "Fraud Alert", "Human Escalation"],
    description: "Coordinated VIN washing ring detected: 11 Luxury SUVs across Manheim Atlanta, Adesa Birmingham, Manheim Orlando. 96% confidence · 3 VINs require analyst review.",
    defaultScreen: "anomaly",
  },
  {
    id: "self-healing",
    label: "Feed Outage + Self-Healing",
    sub: "Manheim SE offline — watch live recovery",
    tags: ["Operational", "Live Demo", "Automated Recovery"],
    description: "Manheim Southeast data feed goes offline mid-run. Watch Atlas self-healing pipeline animate through 5 stages in real time: Detect → Diagnose → Remediate → Backfill → Validate.",
    defaultScreen: "self-healing",
  },
  {
    id: "odometer-fraud",
    label: "Odometer Fraud Detection",
    sub: "3 VIN rollbacks · $55K valuation risk",
    tags: ["Fraud Detection", "5 Agents"],
    description: "Dedicated odometer verification agent cross-references mileage across all auction appearances. Catches 3 confirmed rollbacks including a 4,790-mile reversal. Sub-scenarios: aggressive rollback + CARFAX service record conflict escalation.",
    defaultScreen: "odometer-fraud",
  },
];

interface LiveEvent {
  id: number;
  time: string;
  agentName: string;
  type: string;
  tool?: string;
  success?: boolean;
  message: string;
}

const SCREENS: { id: ScreenId; label: string; sub: string; icon: any; step: number }[] = [
  { id: "outcome",        label: "Outcome Cockpit",           sub: "KPIs & agent portfolio",      icon: LayoutDashboard, step: 1 },
  { id: "anomaly",        label: "Anomaly Detection",         sub: "142K transactions scanned",   icon: AlertTriangle,   step: 2 },
  { id: "market-shift",   label: "Market Shift Alerts",       sub: "2-4 week early warning",      icon: TrendingDown,    step: 3 },
  { id: "weekly-report",  label: "Weekly Report Draft",       sub: "85% auto-generated",          icon: FileText,        step: 4 },
  { id: "self-healing",   label: "Self-Healing",              sub: "Outage detection & recovery", icon: Activity,        step: 5 },
  { id: "odometer-fraud", label: "Odometer Fraud",            sub: "Odometer verification",       icon: Gauge,           step: 6 },
];

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  active:   { dot: "bg-green-400",             label: "Active"   },
  idle:     { dot: "bg-blue-400",              label: "Idle"     },
  running:  { dot: "bg-amber-400",             label: "Running"  },
  deployed: { dot: "bg-green-400",             label: "Done"     },
  failed:   { dot: "bg-red-400",               label: "Failed"   },
  pending:  { dot: "bg-muted-foreground/40",   label: "Pending"  },
};

const BB_COLOR = "#E8640A";

// ─── Pre-run placeholder ──────────────────────────────────────────────────────

const SCREEN_PREVIEWS: Record<ScreenId, { description: string; bullets: string[] }> = {
  "outcome": {
    description: "Portfolio-level view of all 4 BB agents and their KPIs",
    bullets: [
      "Anomaly detection rate vs 95% target",
      "Market shift lead-time advantage (currently 2.8 weeks)",
      "Report automation percentage and analyst hours saved",
      "14-week outcome confidence trajectory chart",
    ],
  },
  "anomaly": {
    description: "Live scan results from 142,183 today's auction transactions",
    bullets: [
      "Price outliers flagged by 3-sigma deviation test",
      "Geographic arbitrage patterns across regions",
      "Multi-auction VIN fraud detection with decision context",
      "Quarantine summary protecting the valuation model",
    ],
  },
  "market-shift": {
    description: "Early warning alerts 2–4 weeks ahead of standard weekly reports",
    bullets: [
      "Segment shift alerts with fused signal breakdown",
      "Auction volume trends and OEM incentive signals",
      "Per-segment price velocity across all 12 segments",
      "Projected lender exposure for flagged segments",
    ],
  },
  "weekly-report": {
    description: "Auto-drafted Wholesale Insights report — 85% generated in 3 minutes",
    bullets: [
      "Full market summary section (auto-generated)",
      "Per-segment analysis for all 12 segments",
      "Analyst review flags for statistically unusual conditions",
      "8.5 analyst hours saved per weekly publication",
    ],
  },
  "self-healing": {
    description: "Real-time healing event: Manheim SE data feed offline for 4 minutes",
    bullets: [
      "5-stage autonomous pipeline: Detect → Diagnose → Remediate → Backfill → Validate",
      "8,200 transactions recovered without analyst intervention",
      "Comparison: 247 minutes vs 4 minutes without / with ATLAS",
      "All 5 data feed health scores restored to 99%+",
    ],
  },
  "odometer-fraud": {
    description: "Odometer verification agent cross-referencing 142K VINs for rollback fraud",
    bullets: [
      "3 confirmed rollbacks detected · highest: 4,790-mile reversal in 23 days",
      "$55,718 total valuation overstatement quarantined from pricing model",
      "CARFAX cross-validation for all flagged VINs with service record conflict escalation",
      "Exception sub-scenarios: aggressive rollback ring + service record conflict manual review",
    ],
  },
};

function PreRunPlaceholder({ screen, onRun }: { screen: ScreenId; onRun: () => void }) {
  const preview = SCREEN_PREVIEWS[screen];
  const ScreenIcon = SCREENS.find(s => s.id === screen)?.icon || LayoutDashboard;

  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="max-w-md w-full text-center space-y-5 px-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ backgroundColor: `${BB_COLOR}18` }}
        >
          <ScreenIcon className="w-7 h-7" style={{ color: BB_COLOR }} />
        </div>

        <div>
          <h3 className="text-base font-semibold">{preview.description}</h3>
          <p className="text-sm text-muted-foreground mt-1.5">
            Run the live pipeline to see real agent output on this screen.
          </p>
        </div>

        <div className="text-left space-y-2 p-4 rounded-xl border bg-muted/20">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What you'll see</p>
          {preview.bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: `${BB_COLOR}aa` }} />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{b}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onRun}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white mx-auto shadow-sm hover:opacity-90 active:scale-95 transition-all"
          style={{ backgroundColor: BB_COLOR }}
          data-testid="bb-placeholder-run-btn"
        >
          <Play className="w-4 h-4" />
          Run Live Pipeline
        </button>
      </div>
    </div>
  );
}

// ─── Event log styling ────────────────────────────────────────────────────────

function getEventStyle(ev: LiveEvent) {
  if (ev.type === "run_start" || ev.type === "setup") return "text-blue-400";
  if (ev.type === "agent_start")                      return "text-amber-300 font-semibold";
  if (ev.type === "agent_complete" && ev.success)     return "text-green-400";
  if (ev.type === "agent_complete" && !ev.success)    return "text-red-400";
  if (ev.type === "run_complete")                     return "text-green-400 font-semibold";
  if (ev.type === "error")                            return "text-red-400";
  if (ev.type === "tool_call_result" && ev.success)   return "text-emerald-400/80";
  if (ev.type === "tool_call_result" && !ev.success)  return "text-red-400/80";
  return "text-muted-foreground";
}

function getEventIcon(ev: LiveEvent) {
  if (ev.type === "run_start" || ev.type === "setup") return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_start")                      return <Play className="w-3 h-3 text-amber-300 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success)     return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && !ev.success)    return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "run_complete")                     return <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (ev.type === "error")                            return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "tool_call_result" && ev.success)   return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
  if (ev.type === "tool_call_result" && !ev.success)  return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
  return <Terminal className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />;
}

// ─── Live feed panel ──────────────────────────────────────────────────────────

function LiveFeedPanel({ events, activeAgentName, running, onClose }: {
  events: LiveEvent[]; activeAgentName: string | null; running: boolean; onClose: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  return (
    <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden" data-testid="bb-live-feed">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: running ? BB_COLOR : "hsl(var(--muted-foreground) / 0.4)" }}
          />
          <span className="text-[11px] font-medium font-mono">Agent SSE Log</span>
          {activeAgentName && running && (
            <span className="text-[10px] text-muted-foreground/70">— {activeAgentName}</span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]">hide ×</button>
      </div>
      <div ref={feedRef} className="h-48 overflow-y-auto px-3 py-2 space-y-1 font-mono">
        {events.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40 italic">Waiting for pipeline to start…</p>
        )}
        {events.map(ev => (
          <div key={ev.id} className="flex items-start gap-2" data-testid={`bb-live-event-${ev.id}`}>
            {getEventIcon(ev)}
            <div className="flex-1 min-w-0">
              <span className="text-[9px] text-muted-foreground/40 mr-2">{ev.time}</span>
              {ev.type === "tool_call_result" && ev.tool && (
                <span className="text-[9px] text-muted-foreground/60 mr-1">[{ev.tool}]</span>
              )}
              <span className={`text-[10px] ${getEventStyle(ev)}`}>{ev.message}</span>
            </div>
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: BB_COLOR }} />
            <span className="text-[10px] animate-pulse" style={{ color: `${BB_COLOR}99` }}>Agents running…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline header ──────────────────────────────────────────────────────────

function PipelineHeader({ liveRunning, activeAgentName, hasRun, scenario }: {
  liveRunning: boolean; activeAgentName: string | null; hasRun: boolean; scenario: ScenarioId;
}) {
  const { data } = useQuery<any>({
    queryKey: ["/demo-api/blackbook/agent-runs", scenario],
    queryFn: () => fetch(`/demo-api/blackbook/agent-runs?scenario=${scenario}`).then(r => r.json()),
    refetchInterval: liveRunning ? 4000 : 30000,
  });

  const runs: any[] = data?.agentRuns || [];
  const placeholders = scenario === "odometer-fraud"
    ? ["Auction Data Quality Sentinel", "Odometer Fraud Detection Agent"]
    : [
        "Auction Data Quality Sentinel",
        "Market Shift Detector",
        "Competitive Intelligence Monitor",
        "Narrative Insight Generator",
      ];

  if (!runs.length) {
    return (
      <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {placeholders.map((name, i) => (
          <div key={name} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex-1 min-w-[130px] h-16 rounded-lg bg-muted/20 border border-border/50 animate-pulse" />
            {i < placeholders.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
      {runs.map((run, i) => {
        const isRunning = liveRunning && activeAgentName === run.agentName;
        const effectiveStatus = isRunning ? "running" : (hasRun ? (run.runStatus || "idle") : "idle");
        const conf = STATUS_MAP[effectiveStatus] || STATUS_MAP.idle;
        return (
          <div key={run.agentId} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex-1 min-w-[130px] px-3 py-2 rounded-lg border transition-colors ${
              isRunning ? "border-[#E8640A]/40 bg-[#E8640A]/5" : "bg-muted/20 border-border/50 hover:border-border"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {run.step || i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} ${isRunning ? "animate-pulse" : ""}`} />
                  <span className="text-[9px] text-muted-foreground/60">{conf.label}</span>
                </div>
              </div>
              <Link href={`/agents/${run.agentId}`}>
                <span className="text-[11px] font-semibold leading-tight hover:text-[#E8640A] transition-colors line-clamp-1 cursor-pointer block">{run.agentName}</span>
              </Link>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/50">
                <Clock className="w-2.5 h-2.5" />
                <span>{run.triggerType || "scheduled"}</span>
              </div>
            </div>
            {i < runs.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main demo shell ──────────────────────────────────────────────────────────

export default function BlackBookDemo() {
  const [activeScreen, setActiveScreen]     = useState<ScreenId>("outcome");
  const [scenario, setScenario]             = useState<ScenarioId>("standard");
  const [hasRun, setHasRun]                 = useState(false);
  const [liveRunning, setLiveRunning]       = useState(false);
  const [liveComplete, setLiveComplete]     = useState(false);
  const [liveEvents, setLiveEvents]         = useState<LiveEvent[]>([]);
  const [liveAgentName, setLiveAgentName]   = useState<string | null>(null);
  const [showLiveFeed, setShowLiveFeed]     = useState(false);
  const [resetKey, setResetKey]             = useState(0);

  const esRef       = useRef<EventSource | null>(null);
  const liveEventId = useRef(0);
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/blackbook/reset"),
    onSuccess: () => {
      setHasRun(false);
      setLiveComplete(false);
      setLiveEvents([]);
      setShowLiveFeed(false);
      liveEventId.current = 0;
      setResetKey(k => k + 1);
      queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/agent-runs"] });
      queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/outcome"] });
      queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/self-healing"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-auction-data/outlier-detection"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-auction-data/fraud-patterns"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-market-data/shift-alerts"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-market-data/segment-price-trends"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/finalize-report"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/draft-market-summary"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/draft-segment-analysis"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/scan-batch"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/financial-impact"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/fraud-report"] });
      queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/vin-history"] });
    },
  });

  useEffect(() => {
    apiRequest("POST", "/demo-api/blackbook/reset").catch(() => {});
  }, []);

  const addEvent = useCallback((type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLiveEvents(prev => [...prev, { id: liveEventId.current++, time, agentName, type, tool, success, message }]);
  }, []);

  const stopLiveRun = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setLiveAgentName(null);
  }, []);

  const startLiveRun = useCallback(() => {
    stopLiveRun();
    setLiveEvents([]);
    liveEventId.current = 0;
    setLiveRunning(true);
    setLiveComplete(false);
    setHasRun(false);
    setResetKey(k => k + 1);
    queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/agent-runs"] });
    queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/outcome"] });
    queryClient.removeQueries({ queryKey: ["/demo-api/blackbook/self-healing"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-auction-data/outlier-detection"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-auction-data/fraud-patterns"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-market-data/shift-alerts"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-market-data/segment-price-trends"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/finalize-report"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/draft-market-summary"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-report-engine/draft-segment-analysis"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/scan-batch"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/financial-impact"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/fraud-report"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/bb-odometer-verify/vin-history"] });

    const es = new EventSource(`/demo-api/blackbook/live-run?scenario=${scenario}`);
    esRef.current = es;

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "Atlas Runtime", d.message || "Starting BB pipeline…");
    });
    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "Atlas Runtime", d.message || "Setting up agents…");
    });
    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(d.agentName);
      addEvent("agent_start", d.agentName, `▶ ${d.agentName} starting`);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/blackbook/agent-runs"] });
    });
    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      if (d.type === "tool_call_result") {
        const label = d.success
          ? `${d.data?.tool || d.tool} → ${d.data?.recordCount != null ? `${d.data.recordCount} records` : "OK"}`
          : `${d.data?.tool || d.tool} → ${d.data?.error || "failed"}`;
        addEvent("tool_call_result", d.agentName, label, d.data?.tool || d.tool, d.success);
      } else {
        addEvent(d.type || "agent_event", d.agentName, d.data?.message || "Agent reasoning…");
      }
    });
    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(null);
      addEvent("agent_complete", d.agentName, `${d.success ? "✓ Complete" : "✗ Failed"}: ${d.agentName}`, undefined, d.success);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/blackbook/agent-runs"] });
    });
    es.addEventListener("run_complete", (e: MessageEvent) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("run_complete", "Atlas Runtime", d.message || "BB pipeline completed — traces available in Runs & Traces", undefined, true);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setLiveComplete(true);
      setHasRun(true);
      setLiveAgentName(null);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/blackbook/agent-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/blackbook/outcome"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/blackbook/self-healing"] });
    });
    es.addEventListener("error", (e: MessageEvent) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("error", "Atlas Runtime", `Error: ${d.message || "Pipeline error"}`);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setLiveAgentName(null);
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLiveRunning(false);
        esRef.current = null;
        setLiveAgentName(null);
      }
    };
  }, [addEvent, stopLiveRun, queryClient, scenario]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  const handleScenarioChange = (s: ScenarioId) => {
    setScenario(s);
    setActiveScreen(SCENARIOS.find(sc => sc.id === s)?.defaultScreen ?? "outcome");
  };

  const renderScreen = () => {
    if (!hasRun && !liveRunning) {
      return <PreRunPlaceholder screen={activeScreen} onRun={startLiveRun} />;
    }
    switch (activeScreen) {
      case "outcome":        return <BBScreen1OutcomeCockpit />;
      case "anomaly":        return <BBScreen2AnomalyDetection scenario={scenario} pipelineComplete={hasRun && !liveRunning} />;
      case "market-shift":   return <BBScreen3MarketShift scenario={scenario} pipelineComplete={hasRun && !liveRunning} />;
      case "weekly-report":  return <BBScreen4WeeklyReport pipelineComplete={hasRun && !liveRunning} />;
      case "self-healing":   return <BBScreen5SelfHealing key={resetKey} scenario={scenario} />;
      case "odometer-fraud": return <BBScreen6OdometerFraud key={resetKey} pipelineComplete={hasRun && !liveRunning} />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${BB_COLOR}22` }}
          >
            <span className="text-[10px] font-bold" style={{ color: BB_COLOR }}>BB</span>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">Black Book Valuation Intelligence</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Atlas AI Agent Platform · {scenario === "odometer-fraud" ? "5 agents" : "4 agents"} · 142K+ daily auction transactions
            </p>
          </div>
          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 ml-2">Live</Badge>
          {liveComplete && (
            <Badge className="text-[10px] ml-1" style={{ backgroundColor: `${BB_COLOR}20`, color: BB_COLOR, borderColor: `${BB_COLOR}40` }}>
              Run complete
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* SSE log toggle — only when pipeline has been started */}
          {(liveEvents.length > 0 || liveRunning) && (
            <button
              onClick={() => setShowLiveFeed(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="bb-toggle-live-feed"
            >
              <Terminal className="w-3.5 h-3.5" />
              SSE log
              {showLiveFeed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {/* Reset Demo — always visible */}
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending || liveRunning}
            data-testid="bb-reset-demo"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-50"
          >
            {resetMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resetting…</>
              : <><RotateCcw className="w-3.5 h-3.5" /> Reset Demo</>}
          </button>

          {/* Run Pipeline */}
          <button
            onClick={startLiveRun}
            disabled={liveRunning}
            data-testid="bb-run-live-pipeline"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              liveRunning ? "opacity-50 cursor-not-allowed border border-border/40 bg-muted/20 text-muted-foreground" : "text-white hover:opacity-90 active:scale-95 shadow-sm"
            }`}
            style={!liveRunning ? { backgroundColor: BB_COLOR } : {}}
          >
            {liveRunning ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Run Live Pipeline</>
            )}
          </button>

          <Link href="/demo">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">← Demo Hub</button>
          </Link>
        </div>
      </div>

      {/* SSE live feed panel */}
      {showLiveFeed && (
        <div className="px-6 pt-3 shrink-0">
          <LiveFeedPanel
            events={liveEvents}
            activeAgentName={liveAgentName}
            running={liveRunning}
            onClose={() => setShowLiveFeed(false)}
          />
        </div>
      )}

      {/* Pipeline header — scenario-aware agent list */}
      <div className="px-6 shrink-0">
        <PipelineHeader liveRunning={liveRunning} activeAgentName={liveAgentName} hasRun={hasRun} scenario={scenario} />
      </div>

      {/* Scenario selector */}
      <div className="px-6 pt-3 shrink-0">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest">Scenario</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SCENARIOS.map(sc => {
            const isActive = scenario === sc.id;
            const tagStyle =
              sc.id === "fraud-ring"     ? "bg-red-500/10 text-red-400 border-red-500/20" :
              sc.id === "self-healing"   ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
              sc.id === "odometer-fraud" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                          "bg-green-500/10 text-green-400 border-green-500/20";
            return (
              <button
                key={sc.id}
                onClick={() => handleScenarioChange(sc.id)}
                data-testid={`bb-scenario-${sc.id}`}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                  isActive
                    ? "shadow-sm"
                    : "border-border/40 bg-muted/10 hover:border-border/70 hover:bg-muted/20"
                }`}
                style={isActive ? { borderColor: `${BB_COLOR}60`, backgroundColor: `${BB_COLOR}08` } : {}}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold leading-tight line-clamp-1">{sc.label}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: BB_COLOR }} />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {sc.tags.map(t => (
                    <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${tagStyle}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Screen tabs */}
      <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-border/50 shrink-0 overflow-x-auto">
        {SCREENS.map(s => {
          const Icon = s.icon;
          const isActive = activeScreen === s.id;
          return (
            <button
              key={s.id}
              data-testid={`bb-tab-${s.id}`}
              onClick={() => setActiveScreen(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
              style={isActive ? { borderBottomColor: BB_COLOR, backgroundColor: `${BB_COLOR}08` } : {}}
            >
              <Icon className="w-3.5 h-3.5" style={isActive ? { color: BB_COLOR } : {}} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {renderScreen()}
      </div>
    </div>
  );
}
