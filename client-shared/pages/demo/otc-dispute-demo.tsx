import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  AlertTriangle, FileText, Scale, CheckCircle2, Clock, Shield,
  ChevronRight,
} from "lucide-react";
import OtcDisputeS1Pattern    from "./otc-dispute-s1-pattern";
import OtcDisputeS2Resolution from "./otc-dispute-s2-resolution";

// ─── Constants ────────────────────────────────────────────────────────────────
const DISPUTE_COLOR  = "#EF4444";
const DEMO_TITLE     = "Dispute Resolution Intelligence";
const CLIENT_NAME    = "NovaTech Industries";

type ScenarioKey  = "happy" | "legal-hold" | "erp-fail";
type ScreenId     = "pattern" | "resolution";

interface LiveEvent {
  id:         number;
  type:       string;
  agentName:  string;
  message:    string;
  tool?:      string;
  success?:   boolean;
  timestamp:  Date;
}

// ─── Scenario config ──────────────────────────────────────────────────────────
const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string }[] = [
  {
    key:         "happy",
    label:       "Systemic Pricing Dispute — Full Resolution",
    description: "Apex Industries 12 disputes / $380K. Atlas detects pattern, confirms pricing error (MSA-2025-1104), finds 3 more affected customers, issues $165K in bulk credits.",
  },
  {
    key:         "legal-hold",
    label:       "Exception: Legal Hold Invoice",
    badge:       "Exception",
    description: "Same dispute pattern, but invoice CRN-2026-AX-0005 is under legal hold REF-LEGAL-2026-047. Credits issued for 122 invoices; held invoice routed to Legal.",
  },
  {
    key:         "erp-fail",
    label:       "Exception: ERP Validation Failure",
    badge:       "Exception",
    description: "ERP price list correction fails validation — 8 open orders block the switch. Credits still issued; ERP correction routed to manual process (3 business days).",
  },
];

const SCREENS: { id: ScreenId; label: string; icon: typeof Activity }[] = [
  { id: "pattern",    label: "6.1 — Dispute Pattern & Root Cause", icon: AlertTriangle },
  { id: "resolution", label: "6.2 — Bulk Resolution & Credits",     icon: FileText     },
];

// ─── Log panel ────────────────────────────────────────────────────────────────
function LiveFeedPanel({ events, onClose }: { events: LiveEvent[]; onClose: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events]);

  const colorMap: Record<string, string> = {
    run_start:         "text-blue-400",
    setup:             "text-white/40",
    agent_start:       "text-emerald-400",
    tool_call_result:  "text-purple-400",
    llm_response:      "text-white/40",
    agent_complete:    "text-emerald-300",
    run_complete:      "text-emerald-400",
    error:             "text-red-400",
  };

  return (
    <div className="border-t border-border/50 bg-black/50 flex flex-col" style={{ height: 200 }}>
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-white/40" />
          <span className="text-xs text-white/40 font-mono">Agent SSE Trace Log</span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-1">
        {events.map(ev => (
          <div key={ev.id} className={`flex items-start gap-2 ${colorMap[ev.type] ?? "text-white/50"}`}>
            <span className="shrink-0 text-white/20 tabular-nums">
              {ev.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="text-white/25 shrink-0">[{ev.agentName.split(" ")[0]}]</span>
            <span className="min-w-0 break-all">{ev.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Pipeline header ──────────────────────────────────────────────────────────
function PipelineHeader({ hasRun, liveRunning, scenario }: {
  hasRun: boolean;
  liveRunning: boolean;
  scenario: ScenarioKey;
}) {
  const { data } = useQuery<any>({
    queryKey:  ["/demo-api/otc-dispute/agent-runs", scenario],
    queryFn:   () => fetch(`/demo-api/otc-dispute/agent-runs?scenario=${scenario}`).then(r => r.json()),
    enabled:   hasRun || liveRunning,
    refetchInterval: liveRunning ? 3000 : false,
    staleTime: 0,
  });

  const agents = data?.agents ?? [
    { step: 1, agentCode: "OTC-AGT-008", agentName: "Dispute Resolution Agent",            label: "Dispute Pattern & Root Cause",        runStatus: "idle" },
    { step: 2, agentCode: "OTC-AGT-011", agentName: "Contract & Pricing Compliance Agent", label: "Contract Compliance & Exposure",       runStatus: "idle" },
    { step: 3, agentCode: "OTC-AGT-006", agentName: "Billing & Collections Agent",         label: "Bulk Credit Resolution & ERP Fix",    runStatus: "idle" },
  ];

  return (
    <div className="flex items-center gap-1 px-6 py-2 border-b border-border/30 bg-black/20 overflow-x-auto shrink-0">
      {agents.map((a: any, i: number) => {
        const isDone    = a.runStatus === "deployed";
        const isFailed  = a.runStatus === "failed";
        const isRunning = liveRunning && a.runStatus === "pending";
        return (
          <div key={a.step} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />}
            <div
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-all"
              style={isDone
                ? { background: "#10B98115", border: "1px solid #10B98140", color: "#10B981" }
                : isFailed
                  ? { background: "#EF444415", border: "1px solid #EF444440", color: "#EF4444" }
                  : isRunning
                    ? { background: `${DISPUTE_COLOR}15`, border: `1px solid ${DISPUTE_COLOR}40`, color: DISPUTE_COLOR }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
            >
              {isRunning && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: DISPUTE_COLOR }} />}
              {isDone    && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {isFailed  && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
              {!isRunning && !isDone && !isFailed && <div className="w-1.5 h-1.5 rounded-full bg-white/15" />}
              <span className="font-mono text-[10px] opacity-70">{a.agentCode}</span>
              <span>{a.label || a.agentName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────
function ScenarioCard({
  sc, selected, onSelect, onRun, isRunning,
}: {
  sc:        typeof SCENARIOS[number];
  selected:  boolean;
  onSelect:  (k: ScenarioKey) => void;
  onRun:     (k: ScenarioKey) => void;
  isRunning: boolean;
}) {
  const icons: Record<ScenarioKey, typeof AlertTriangle> = {
    "happy":      Scale,
    "legal-hold": Shield,
    "erp-fail":   AlertTriangle,
  };
  const colors: Record<ScenarioKey, string> = {
    "happy":      DISPUTE_COLOR,
    "legal-hold": "#F59E0B",
    "erp-fail":   "#F59E0B",
  };
  const Icon  = icons[sc.key];
  const color = colors[sc.key];

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3 cursor-pointer transition-all"
      style={{
        borderColor: selected ? `${color}60` : "rgba(255,255,255,0.08)",
        background:  selected ? `${color}0C` : "rgba(255,255,255,0.03)",
      }}
      onClick={() => onSelect(sc.key)}
      data-testid={`card-scenario-${sc.key}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white">{sc.label}</p>
            {sc.badge && (
              <span className="text-[9px] font-semibold rounded px-1.5 py-0.5" style={{ background: `${color}25`, color }}>
                {sc.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-white/45 mt-1 leading-relaxed">{sc.description}</p>
        </div>
      </div>
      <button
        disabled={isRunning}
        onClick={e => { e.stopPropagation(); onRun(sc.key); }}
        className="w-full rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
        style={{
          background: isRunning ? "rgba(255,255,255,0.05)" : `${color}20`,
          border:     `1px solid ${isRunning ? "rgba(255,255,255,0.08)" : color + "50"}`,
          color:      isRunning ? "rgba(255,255,255,0.3)" : color,
        }}
        data-testid={`btn-run-${sc.key}`}
      >
        {isRunning && selected ? (
          <>
            <Activity className="w-4 h-4 animate-pulse" />
            Running…
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Run Demo
          </>
        )}
      </button>
    </div>
  );
}

// ─── Pre-run placeholder ──────────────────────────────────────────────────────
function PreRunPlaceholder({ screen, onRun }: { screen: ScreenId; onRun: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: `${DISPUTE_COLOR}20`, border: `1px solid ${DISPUTE_COLOR}40` }}
      >
        <AlertTriangle className="w-6 h-6" style={{ color: DISPUTE_COLOR }} />
      </div>
      <div>
        <p className="text-white/60 text-sm">Select a scenario and click <strong>Run Demo</strong> to start the pipeline.</p>
        <p className="text-white/30 text-xs mt-1">Atlas will invoke OTC-AGT-008 → 011 → 006 via live SSE.</p>
      </div>
      <button
        onClick={onRun}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
        style={{ background: `${DISPUTE_COLOR}20`, border: `1px solid ${DISPUTE_COLOR}40`, color: DISPUTE_COLOR }}
        data-testid="btn-prerun-start"
      >
        <Play className="w-4 h-4" />
        Run Demo
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OtcDisputeDemo() {
  const queryClient = useQueryClient();

  const [scenario, setScenario]       = useState<ScenarioKey>("happy");
  const [activeScreen, setActiveScreen] = useState<ScreenId>("pattern");
  const [hasRun, setHasRun]           = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveEvents, setLiveEvents]   = useState<LiveEvent[]>([]);
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const [resultSummaries, setResultSummaries] = useState<Record<string, any>>({});

  const esRef       = useRef<EventSource | null>(null);
  const liveEventId = useRef(0);

  const addEvent = useCallback((type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
    setLiveEvents(prev => [...prev, { id: liveEventId.current++, type, agentName, message, tool, success, timestamp: new Date() }]);
  }, []);

  const stopLiveRun = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  }, []);

  const clearAllCaches = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["/demo-api/otc-dispute/agent-runs"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/otc-dispute-resolution/dispute-queue"] });
    queryClient.removeQueries({ queryKey: ["/api/mock/otc-dispute-contract/contract-pricing"] });
  }, [queryClient]);

  const handleScenarioChange = useCallback((s: ScenarioKey) => {
    stopLiveRun();
    setScenario(s);
    setActiveScreen("pattern");
    setHasRun(false);
    setLiveRunning(false);
    setLiveEvents([]);
    setShowLiveFeed(false);
    setResultSummaries({});
    liveEventId.current = 0;
    clearAllCaches();
  }, [stopLiveRun, clearAllCaches]);

  const startLiveRun = useCallback((sc?: ScenarioKey) => {
    const activeScenario = sc ?? scenario;
    if (sc && sc !== scenario) setScenario(sc);

    stopLiveRun();
    setLiveEvents([]);
    liveEventId.current = 0;
    setLiveRunning(true);
    setHasRun(false);
    setShowLiveFeed(true);
    setResultSummaries({});
    clearAllCaches();

    const es = new EventSource(`/demo-api/otc-dispute/live-run?scenario=${activeScenario}`);
    esRef.current = es;

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "Atlas Runtime", d.message || "Starting dispute resolution pipeline…");
    });
    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "Atlas Runtime", d.message || "Agents verified");
    });
    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("agent_start", d.agentName, `▶ ${d.agentCode} starting`);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/otc-dispute/agent-runs"] });
    });
    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      if (d.type === "tool_call_result") {
        const label = d.success !== false
          ? `${d.data?.tool || "tool"} → OK`
          : `${d.data?.tool || "tool"} → ${d.data?.error || "failed"}`;
        addEvent("tool_call_result", d.agentName, label, d.data?.tool, d.success !== false);
      } else {
        addEvent(d.type || "agent_event", d.agentName, d.data?.message || "Agent reasoning…");
      }
    });
    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("agent_complete", d.agentName, `${d.success ? "✓" : "✗"} ${d.agentCode} complete`, undefined, d.success);
      if (d.resultSummary) {
        setResultSummaries(prev => ({ ...prev, [d.agentCode]: d.resultSummary }));
      }
      queryClient.invalidateQueries({ queryKey: ["/demo-api/otc-dispute/agent-runs"] });
    });
    es.addEventListener("run_complete", (e: MessageEvent) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("run_complete", "Atlas Runtime", d.message || "Dispute resolution pipeline complete — traces available in Runs & Traces", undefined, true);
      if (d.summaries) {
        setResultSummaries(prev => ({ ...prev, ...d.summaries }));
      }
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setHasRun(true);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/otc-dispute/agent-runs"] });
    });
    es.addEventListener("error", (e: MessageEvent) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("error", "Atlas Runtime", `Error: ${d.message || "Pipeline error"}`);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLiveRunning(false);
        esRef.current = null;
      }
    };
  }, [addEvent, stopLiveRun, queryClient, scenario, clearAllCaches]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  const pipelineComplete = hasRun && !liveRunning;

  const renderScreen = () => {
    if (!hasRun && !liveRunning) {
      return <PreRunPlaceholder screen={activeScreen} onRun={() => startLiveRun()} />;
    }
    switch (activeScreen) {
      case "pattern":    return <OtcDisputeS1Pattern    pipelineComplete={pipelineComplete} scenario={scenario} resultSummaries={resultSummaries} />;
      case "resolution": return <OtcDisputeS2Resolution pipelineComplete={pipelineComplete} scenario={scenario} resultSummaries={resultSummaries} />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${DISPUTE_COLOR}22` }}
          >
            <span className="text-[10px] font-bold" style={{ color: DISPUTE_COLOR }}>AR</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{CLIENT_NAME}</span>
              <span className="text-white/25">·</span>
              <span className="text-xs text-white/50">{DEMO_TITLE}</span>
              <span className="text-[9px] font-semibold rounded px-1.5 py-0.5 ml-1" style={{ background: `${DISPUTE_COLOR}25`, color: DISPUTE_COLOR }}>
                Demo 5
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-white/30">
              <span>OTC-AGT-008</span>
              <span>·</span>
              <span>OTC-AGT-011</span>
              <span>·</span>
              <span>OTC-AGT-006</span>
              <span>·</span>
              <span>Dispute Resolution · Financial</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(liveEvents.length > 0 || liveRunning) && (
            <button
              onClick={() => setShowLiveFeed(v => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border border-white/10 text-white/50 hover:text-white/80 transition-colors"
              data-testid="btn-toggle-live-feed"
            >
              <Terminal className="w-3 h-3" />
              SSE Log
              {showLiveFeed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
          )}
          {hasRun && !liveRunning && (
            <button
              onClick={() => {
                handleScenarioChange(scenario);
                fetch("/demo-api/otc-dispute/reset", { method: "POST" }).catch(() => {});
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border border-white/10 text-white/50 hover:text-white/80 transition-colors"
              data-testid="btn-reset-demo"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          {liveRunning && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: DISPUTE_COLOR }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: DISPUTE_COLOR }} />
              Atlas Running
            </div>
          )}
        </div>
      </div>

      {/* Pipeline header */}
      <PipelineHeader hasRun={hasRun} liveRunning={liveRunning} scenario={scenario} />

      {/* Screen nav */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border/30 shrink-0">
        {SCREENS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveScreen(s.id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all"
              style={activeScreen === s.id
                ? { background: `${DISPUTE_COLOR}18`, border: `1px solid ${DISPUTE_COLOR}40`, color: DISPUTE_COLOR }
                : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
              data-testid={`tab-screen-${s.id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — scenario cards */}
        <div className="w-72 shrink-0 border-r border-border/30 overflow-y-auto p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-white/30 px-1">Demo Scenarios</p>
          {SCENARIOS.map(sc => (
            <ScenarioCard
              key={sc.key}
              sc={sc}
              selected={scenario === sc.key}
              onSelect={handleScenarioChange}
              onRun={startLiveRun}
              isRunning={liveRunning}
            />
          ))}

          {/* Stats sidebar */}
          {pipelineComplete && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3 mt-2">
              <p className="text-[10px] uppercase tracking-widest text-white/30">Run Summary</p>
              {[
                { label: "Agents Invoked",      value: "3", color: DISPUTE_COLOR },
                { label: "Disputes Analysed",   value: "12", color: "rgba(255,255,255,0.7)" },
                { label: "Total Exposure",       value: "$165K", color: DISPUTE_COLOR },
                { label: "Customers Protected",  value: "4", color: "#10B981" },
                { label: "Invoices Credited",    value: scenario === "happy" ? "122" : "122", color: "#10B981" },
                { label: "ERP Correction",       value: scenario === "erp-fail" ? "Manual" : "Submitted", color: scenario === "erp-fail" ? "#F59E0B" : "#10B981" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{s.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content pane */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {renderScreen()}
          </div>

          {/* SSE log feed */}
          {showLiveFeed && (
            <LiveFeedPanel
              events={liveEvents}
              onClose={() => setShowLiveFeed(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
