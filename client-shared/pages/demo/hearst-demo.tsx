import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  BarChart3,
  User,
  Globe,
  Shield,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ArrowRight,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
  Zap,
  Terminal,
  CheckCircle,
  XCircle,
} from "lucide-react";

import Screen1CommandCenter from "./hearst-s1-command-center";
import Screen2BrandDeepdive from "./hearst-s2-brand-deepdive";
import Screen3SubscriberExplorer from "./hearst-s3-subscriber-explorer";
import Screen4SendTimeMap from "./hearst-s4-sendtime-map";
import Screen5FatigueProtection from "./hearst-s5-fatigue-protection";
import Screen6Revenue from "./hearst-s6-revenue";

type ScreenId = "command-center" | "brand-deepdive" | "subscriber-explorer" | "send-time-map" | "fatigue-protection" | "revenue";

interface LiveEvent {
  id: number;
  time: string;
  agentName: string;
  type: string;
  tool?: string;
  success?: boolean;
  message: string;
}

const SCREENS: { id: ScreenId; label: string; sub: string; icon: any }[] = [
  { id: "command-center",      label: "Command Center",       sub: "Portfolio-wide overview",    icon: LayoutDashboard },
  { id: "brand-deepdive",      label: "Brand Deep-Dive",      sub: "Per-brand optimization",     icon: BarChart3 },
  { id: "subscriber-explorer", label: "Subscriber Explorer",  sub: "Individual NBA decisions",   icon: User },
  { id: "send-time-map",       label: "Send Time Map",        sub: "Global send distribution",   icon: Globe },
  { id: "fatigue-protection",  label: "Fatigue Protection",   sub: "Suppression analytics",      icon: Shield },
  { id: "revenue",             label: "Revenue Attribution",  sub: "Email → dollar impact",      icon: DollarSign },
];

const STATUS_MAP: Record<string, { icon: any; color: string; dot: string; label: string }> = {
  active:    { icon: CheckCircle2, color: "text-green-400",  dot: "bg-green-400",  label: "Active" },
  idle:      { icon: CheckCircle2, color: "text-blue-400",   dot: "bg-blue-400",   label: "Idle" },
  running:   { icon: Loader2,      color: "text-indigo-400", dot: "bg-indigo-400", label: "Running" },
  error:     { icon: AlertCircle,  color: "text-red-400",    dot: "bg-red-400",    label: "Error" },
  inactive:  { icon: AlertCircle,  color: "text-yellow-400", dot: "bg-yellow-400", label: "Inactive" },
  completed: { icon: CheckCircle2, color: "text-green-400",  dot: "bg-green-400",  label: "Done" },
};

const TRIGGER_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  event:     "Event-triggered",
  manual:    "Manual",
};

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  return `${days}d ago`;
}

const PIPELINE_ROLE: Record<string, string> = {
  subscriberProfileEngine: "Profiles 6.2M subscribers",
  contentInventory:        "Scores today's content",
  nbaEmailDecision:        "SEND / HOLD per subscriber",
  sendTimeOptimizer:       "Personalized send window",
  performanceLearning:     "Closes the feedback loop",
};

const PIPELINE_METRIC: Record<string, (rs: any) => string> = {
  subscriberProfileEngine: rs => rs?.subscribersProcessed  ? `${(rs.subscribersProcessed / 1e6).toFixed(1)}M profiles`  : "—",
  contentInventory:        rs => rs?.emailSendable         ? `${rs.emailSendable} sendable`                              : "—",
  nbaEmailDecision:        rs => rs?.decisionsEvaluated    ? `${(rs.decisionsEvaluated / 1e6).toFixed(2)}M decisions`   : "—",
  sendTimeOptimizer:       rs => rs?.subscribersOptimized  ? `${(rs.subscribersOptimized / 1e6).toFixed(1)}M windows`   : "—",
  performanceLearning:     rs => rs?.outcomesTracked       ? `${(rs.outcomesTracked / 1e6).toFixed(2)}M outcomes`       : "—",
};

function PipelineHeader({ liveRunning, activeAgentName }: { liveRunning: boolean; activeAgentName: string | null }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/agent-runs"],
    refetchInterval: liveRunning ? 5000 : 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className="flex-1 h-16 rounded-lg bg-muted/20 animate-pulse min-w-[140px]" />
            {i < 4 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  const runs: any[] = data?.agentRuns || [];

  return (
    <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
      {runs.map((run, i) => {
        const isCurrentlyRunning = liveRunning && activeAgentName === run.agentName;
        const statusToShow = isCurrentlyRunning ? "running" : (run.runStatus || run.agentStatus);
        const statusConf = STATUS_MAP[statusToShow] || STATUS_MAP.idle;
        const StatusIcon = statusConf.icon;
        const metric = PIPELINE_METRIC[run.key]?.(run.resultSummary);
        const role   = PIPELINE_ROLE[run.key] || "";

        return (
          <div key={run.agentId} className="flex items-center gap-1 flex-1 min-w-[0]">
            <div className={`flex-1 min-w-[130px] px-3 py-2 rounded-lg border transition-colors group ${
              isCurrentlyRunning
                ? "bg-[#E91E8C]/5 border-[#E91E8C]/40"
                : "bg-muted/20 border-border/50 hover:border-border"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot} ${isCurrentlyRunning ? "animate-pulse" : ""}`} />
                  <span className="text-[9px] text-muted-foreground/60">{statusConf.label}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 mb-0.5">
                <Link href={`/agents/${run.agentId}`}>
                  <span className="text-[11px] font-semibold leading-tight hover:text-[#E91E8C] transition-colors line-clamp-1 cursor-pointer">
                    {run.agentName}
                  </span>
                </Link>
                <Link href={`/agents/${run.agentId}`}>
                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 hover:text-[#E91E8C] shrink-0 transition-colors" />
                </Link>
              </div>

              <p className="text-[9px] text-muted-foreground/60 mb-1 line-clamp-1">{role}</p>

              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formatRelative(run.completedAt)}</span>
                </div>
                {metric && metric !== "—" && (
                  <span className="text-[9px] text-indigo-400 font-medium truncate">{metric}</span>
                )}
              </div>

              {run.triggerType && (
                <div className="mt-1">
                  <span className="text-[8px] text-muted-foreground/40 bg-muted/30 px-1 py-0.5 rounded">
                    {TRIGGER_LABELS[run.triggerType] || run.triggerType}
                  </span>
                </div>
              )}
            </div>

            {i < runs.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LiveFeedPanel({ events, activeAgentName, running, onClose }: {
  events: LiveEvent[];
  activeAgentName: string | null;
  running: boolean;
  onClose: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  const getEventStyle = (ev: LiveEvent) => {
    if (ev.type === "run_start" || ev.type === "setup")    return "text-blue-400";
    if (ev.type === "agent_start")                         return "text-indigo-300 font-semibold";
    if (ev.type === "agent_complete" && ev.success)        return "text-green-400";
    if (ev.type === "agent_complete" && !ev.success)       return "text-red-400";
    if (ev.type === "run_complete")                        return "text-[#E91E8C] font-semibold";
    if (ev.type === "error")                               return "text-red-400";
    if (ev.type === "tool_call_result" && ev.success)      return "text-emerald-400/80";
    if (ev.type === "tool_call_result" && !ev.success)     return "text-red-400/80";
    return "text-muted-foreground";
  };

  const getEventIcon = (ev: LiveEvent) => {
    if (ev.type === "run_start" || ev.type === "setup")    return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
    if (ev.type === "agent_start")                         return <Play className="w-3 h-3 text-indigo-300 shrink-0 mt-0.5" />;
    if (ev.type === "agent_complete" && ev.success)        return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
    if (ev.type === "agent_complete" && !ev.success)       return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
    if (ev.type === "run_complete")                        return <CheckCircle2 className="w-3 h-3 text-[#E91E8C] shrink-0 mt-0.5" />;
    if (ev.type === "error")                               return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
    if (ev.type === "tool_call_result" && ev.success)      return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
    if (ev.type === "tool_call_result" && !ev.success)     return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
    return <Terminal className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />;
  };

  return (
    <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden" data-testid="hearst-live-feed">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${running ? "bg-[#E91E8C] animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-[11px] font-medium font-mono">Live Pipeline Execution</span>
          {activeAgentName && running && (
            <span className="text-[10px] text-muted-foreground/70">— {activeAgentName}</span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]">
          hide ×
        </button>
      </div>
      <div ref={feedRef} className="h-48 overflow-y-auto px-3 py-2 space-y-1 font-mono">
        {events.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40 italic">Waiting for pipeline to start…</p>
        )}
        {events.map(ev => (
          <div key={ev.id} className="flex items-start gap-2" data-testid={`hearst-live-event-${ev.id}`}>
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
            <Loader2 className="w-3 h-3 text-[#E91E8C] animate-spin shrink-0" />
            <span className="text-[10px] text-[#E91E8C]/70 animate-pulse">Agents running…</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function XYZDemo() {
  const [activeScreen, setActiveScreen]       = useState<ScreenId>("command-center");
  const [pendingBrand, setPendingBrand]       = useState<string | null>(null);
  const [liveRunning, setLiveRunning]         = useState(false);
  const [liveComplete, setLiveComplete]       = useState(false);
  const [liveEvents, setLiveEvents]           = useState<LiveEvent[]>([]);
  const [liveAgentName, setLiveAgentName]     = useState<string | null>(null);
  const [showLiveFeed, setShowLiveFeed]       = useState(false);

  const esRef        = useRef<EventSource | null>(null);
  const liveEventId  = useRef(0);
  const queryClient  = useQueryClient();

  const addEvent = useCallback((type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
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
    setShowLiveFeed(true);

    const es = new EventSource("/demo-api/hearst/live-run");
    esRef.current = es;

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "Atlas Runtime", d.message || "Starting pipeline…");
    });
    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "Atlas Runtime", d.message || "Setting up…");
    });
    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(d.agentName);
      addEvent("agent_start", d.agentName, `▶ Starting ${d.agentName}`);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/agent-runs"] });
    });
    es.addEventListener("agent_event", (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "tool_call_result") {
        const label = d.success
          ? `${d.data?.tool || d.tool} → ${d.data?.recordCount != null ? `${d.data.recordCount} records` : "OK"}`
          : `${d.data?.tool || d.tool} → ${d.data?.error || "failed"}`;
        addEvent("tool_call_result", d.agentName, label, d.data?.tool || d.tool, d.success);
      } else {
        addEvent(d.type || "agent_event", d.agentName, d.data?.message || "Agent thinking…");
      }
    });
    es.addEventListener("agent_complete", (e) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(null);
      addEvent("agent_complete", d.agentName, `${d.success ? "✓ Complete" : "✗ Failed"}: ${d.agentName}`, undefined, d.success);
      // Refresh agent runs pipeline header
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/agent-runs"] });
    });
    es.addEventListener("run_complete", (e) => {
      const d = JSON.parse(e.data);
      addEvent("run_complete", "Atlas Runtime", "All 5 NBA pipeline agents completed — traces available in Runs & Traces", undefined, true);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setLiveComplete(true);
      setLiveAgentName(null);
      // Invalidate all hearst screens so they pick up real data
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/command-center"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/agent-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/fatigue"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/send-time-map"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/hearst/revenue"] });
    });
    es.addEventListener("error", (e: any) => {
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
  }, [addEvent, stopLiveRun, queryClient]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  const handleBrandClick = (brandId: string) => {
    setPendingBrand(brandId);
    setActiveScreen("brand-deepdive");
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case "command-center":      return <Screen1CommandCenter onBrandClick={handleBrandClick} />;
      case "brand-deepdive":      return <Screen2BrandDeepdive />;
      case "subscriber-explorer": return <Screen3SubscriberExplorer />;
      case "send-time-map":       return <Screen4SendTimeMap />;
      case "fatigue-protection":  return <Screen5FatigueProtection />;
      case "revenue":             return <Screen6Revenue />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E91E8C]/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-[#E91E8C]">H</span>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">XYZ NBA Email Orchestration</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Atlas AI Agent Platform · 8 brands · 6.2M subscribers</p>
          </div>
          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 ml-2">Live</Badge>
          {liveComplete && (
            <Badge className="text-[10px] bg-[#E91E8C]/20 text-[#E91E8C] border-[#E91E8C]/30">Run complete</Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Live Feed Toggle */}
          {(liveEvents.length > 0 || liveRunning) && (
            <button
              onClick={() => setShowLiveFeed(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="hearst-toggle-live-feed"
            >
              <Terminal className="w-3.5 h-3.5" />
              Live log
              {showLiveFeed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {/* Run Live Pipeline button */}
          <button
            onClick={startLiveRun}
            disabled={liveRunning}
            data-testid="hearst-run-live-pipeline"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              liveRunning
                ? "bg-[#E91E8C]/10 text-[#E91E8C]/60 cursor-not-allowed border border-[#E91E8C]/20"
                : "bg-[#E91E8C] text-white hover:bg-[#E91E8C]/90 active:scale-95 shadow-sm"
            }`}
          >
            {liveRunning ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Run Live Pipeline</>
            )}
          </button>

          <span className="text-[11px] text-muted-foreground">
            Today's run: <span className="text-foreground font-medium">2.43M decisions</span>
          </span>
          <Link href="/demo">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">← Demo Hub</button>
          </Link>
        </div>
      </div>

      {/* Live feed panel */}
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

      {/* Agent pipeline header — sourced from real agent_runtime_runs records */}
      <div className="px-6 shrink-0">
        <PipelineHeader liveRunning={liveRunning} activeAgentName={liveAgentName} />
      </div>

      {/* Screen tab nav */}
      <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-border/50 shrink-0 overflow-x-auto">
        {SCREENS.map((s) => {
          const Icon = s.icon;
          const isActive = activeScreen === s.id;
          return (
            <button
              key={s.id}
              data-testid={`tab-${s.id}`}
              onClick={() => setActiveScreen(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-[#E91E8C] text-foreground bg-[#E91E8C]/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}>
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#E91E8C]" : ""}`} />
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
