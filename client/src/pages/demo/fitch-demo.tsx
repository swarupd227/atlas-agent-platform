import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Shield, BarChart2, Activity, MessageSquare, AlertTriangle, FileText,
  ChevronLeft, ChevronRight, Users, Play,
  CheckCircle, XCircle, CheckCircle2, Zap, Loader2, Terminal, ArrowRight,
  ExternalLink, Clock,
} from "lucide-react";
import FitchS1CommandCenter from "./fitch-s1-command-center";
import FitchS2FfiecIngest from "./fitch-s2-ffiec-ingest";
import FitchS3RiskScoring from "./fitch-s3-risk-scoring";
import FitchS4NlpSignals from "./fitch-s4-nlp-signals";
import FitchS5SvbBacktest from "./fitch-s5-svb-backtest";
import FitchS6ReportAssembly from "./fitch-s6-report-assembly";

const SCREENS = [
  { id: 1, label: "Risk Dashboard",    icon: Activity,      description: "10-bank composite risk scores — live from Composite Risk Scorer" },
  { id: 2, label: "Ratio Deep-Dive",   icon: BarChart2,     description: "18 CAMELS ratios with breach flags and peer median — live from Financial Ratio Engine" },
  { id: 3, label: "NLP Signals",       icon: MessageSquare, description: "Transcript sentiment · MD&A language · News sigma-spikes" },
  { id: 4, label: "Peer Benchmarking", icon: Users,         description: "G-SIB cohort comparison and peer divergence — live from Composite Risk Scorer" },
  { id: 5, label: "SVB Backtest",      icon: AlertTriangle, description: "SVB 182-day advance warning — from Assessment Report Generator (get_svb_backtest_data)" },
  { id: 6, label: "Assessment Package",icon: FileText,      description: "Analyst-ready credit packages — live from Assessment Report Generator" },
] as const;

const PIPELINE_ROLE: Record<string, string> = {
  ffiec_ingestor:      "FFIEC Call Report Ingest",
  ratio_engine:        "18-Ratio CAMELS Engine",
  transcript_analyst:  "Transcript & Filing NLP",
  news_processor:      "News Signal Processor",
  risk_scorer:         "Composite Risk Scorer",
  report_generator:    "Assessment Report Generator",
};

const PIPELINE_METRIC: Record<string, (rs: any) => string> = {
  ffiec_ingestor:      rs => rs?.banksIngested     ? `${rs.banksIngested} banks ingested`           : "—",
  ratio_engine:        rs => rs?.totalBreaches      ? `${rs.totalBreaches} breaches`                : "—",
  transcript_analyst:  rs => rs?.banksScored        ? `${rs.banksScored} banks scored`              : "—",
  news_processor:      rs => rs?.banksMonitored     ? `${rs.banksMonitored} banks monitored`        : "—",
  risk_scorer:         rs => rs?.banksScored        ? `${rs.banksScored} banks scored`              : "—",
  report_generator:    rs => rs?.svbComparison?.daysAdvanceWarning ? `${rs.svbComparison.daysAdvanceWarning}d advance warning` : "—",
};

const STATUS_MAP: Record<string, { icon: any; dot: string; label: string }> = {
  completed: { icon: CheckCircle2, dot: "bg-green-400",            label: "complete" },
  running:   { icon: Loader2,      dot: "bg-rose-400 animate-pulse", label: "running"  },
  failed:    { icon: XCircle,      dot: "bg-red-400",               label: "failed"   },
  idle:      { icon: Clock,        dot: "bg-muted-foreground/30",   label: "idle"     },
};

interface LiveEvent {
  id: number;
  time: string;
  agentName: string;
  type: string;
  tool?: string;
  success?: boolean;
  message: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PipelineHeader({ liveRunning, activeAgentName, onRunPipeline }: {
  liveRunning: boolean;
  activeAgentName: string | null;
  onRunPipeline: () => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/fitch/agent-runs"],
    refetchInterval: liveRunning ? 5000 : 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className="flex-1 h-16 rounded-lg bg-muted/20 animate-pulse min-w-[100px]" />
            {i < 5 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  const runs: any[] = data?.agentRuns || [];

  return (
    <div className="border-b border-border/50 pb-3">
      <div className="flex items-stretch gap-1 pt-2 overflow-x-auto">
        {runs.map((run, i) => {
          const isCurrentlyRunning = liveRunning && activeAgentName === run.agentName;
          const statusToShow = isCurrentlyRunning ? "running" : (run.runStatus || run.agentStatus);
          const statusConf = STATUS_MAP[statusToShow] || STATUS_MAP.idle;
          const metric = PIPELINE_METRIC[run.key]?.(run.resultSummary);
          const role   = PIPELINE_ROLE[run.key] || "";

          return (
            <div key={run.key || i} className="flex items-center gap-1 flex-1 min-w-0">
              <div className={`flex-1 min-w-[100px] px-2.5 py-2 rounded-lg border transition-colors ${
                isCurrentlyRunning
                  ? "bg-rose-500/5 border-rose-500/40"
                  : "bg-muted/20 border-border/50 hover:border-border"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                    <span className="text-[9px] text-muted-foreground/60">{statusConf.label}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-0.5">
                  {run.agentId ? (
                    <Link href={`/agents/${run.agentId}`}>
                      <span className="text-[10px] font-semibold leading-tight hover:text-rose-400 transition-colors line-clamp-1 cursor-pointer">
                        {run.agentName}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[10px] font-semibold leading-tight line-clamp-1">{run.agentName}</span>
                  )}
                  {run.agentId && (
                    <Link href={`/agents/${run.agentId}`}>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 hover:text-rose-400 shrink-0 transition-colors" />
                    </Link>
                  )}
                </div>

                <p className="text-[9px] text-muted-foreground/60 mb-1 line-clamp-1">{role}</p>

                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{formatRelative(run.completedAt)}</span>
                  </div>
                  {metric && metric !== "—" && (
                    <span className="text-[9px] text-rose-400 font-medium truncate">{metric}</span>
                  )}
                </div>
              </div>

              {i < runs.length - 1 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}

        {/* Run button */}
        <div className="shrink-0 flex items-center pl-2">
          <Button
            size="sm"
            onClick={onRunPipeline}
            disabled={liveRunning}
            data-testid="button-run-live-pipeline"
            className={`h-8 text-[11px] gap-1.5 ${liveRunning ? "bg-rose-600/40" : "bg-rose-600 hover:bg-rose-700"}`}
          >
            {liveRunning ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-3 h-3" /> Run Pipeline</>
            )}
          </Button>
        </div>
      </div>
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
    if (ev.type === "run_complete")                        return "text-rose-400 font-semibold";
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
    if (ev.type === "run_complete")                        return <CheckCircle2 className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />;
    if (ev.type === "error")                               return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
    if (ev.type === "tool_call_result" && ev.success)      return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
    if (ev.type === "tool_call_result" && !ev.success)     return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
    return <Terminal className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />;
  };

  return (
    <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden mb-4" data-testid="fitch-live-feed">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${running ? "bg-rose-400 animate-pulse" : "bg-muted-foreground/40"}`} />
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
          <div key={ev.id} className="flex items-start gap-2" data-testid={`fitch-live-event-${ev.id}`}>
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
            <Loader2 className="w-3 h-3 text-rose-400 animate-spin shrink-0" />
            <span className="text-[10px] text-rose-400/70 animate-pulse">Agents running…</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FitchDemo() {
  const [activeScreen, setActiveScreen]   = useState(1);
  const [liveRunning, setLiveRunning]     = useState(false);
  const [liveComplete, setLiveComplete]   = useState(false);
  const [liveEvents, setLiveEvents]       = useState<LiveEvent[]>([]);
  const [liveAgentName, setLiveAgentName] = useState<string | null>(null);
  const [showLiveFeed, setShowLiveFeed]   = useState(false);

  const esRef       = useRef<EventSource | null>(null);
  const liveEventId = useRef(0);
  const queryClient = useQueryClient();

  const screen    = SCREENS.find(s => s.id === activeScreen)!;
  const ScreenIcon = screen.icon;

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
    setShowLiveFeed(true);

    const es = new EventSource("/demo-api/fitch/live-run");
    esRef.current = es;

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "AQEWS Runtime", d.message || "Starting AQEWS pipeline…");
    });
    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "AQEWS Runtime", d.message || "Setting up MCP servers…");
    });
    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(d.agentName);
      addEvent("agent_start", d.agentName, `▶ Starting ${d.agentName}`);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch/agent-runs"] });
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
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch/agent-runs"] });
    });
    es.addEventListener("run_complete", () => {
      addEvent("run_complete", "AQEWS Runtime", "All 6 AQEWS agents completed — early warning scores ready", undefined, true);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setLiveComplete(true);
      setLiveAgentName(null);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch/agent-runs"] });
    });
    es.addEventListener("error", (e: any) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("error", "AQEWS Runtime", `Error: ${d.message || "Pipeline error"}`);
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

  const goNext = () => setActiveScreen(s => Math.min(6, s + 1));
  const goPrev = () => setActiveScreen(s => Math.max(1, s - 1));

  return (
    <div className="flex flex-col h-full">
      {/* Demo header */}
      <div className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 pt-3">
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
                    {liveComplete && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30">✓ Run Complete</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    6 GPT-4.1 agents · 4 MCP servers · 15 tools · SVB 182-day advance warning
                  </p>
                </div>
              </div>
            </div>

            {/* Screen navigation */}
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
                    className={`text-[10px] px-2.5 py-1 rounded transition-all whitespace-nowrap ${
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

          {/* Pipeline header — 6 agent steps + Run button */}
          <PipelineHeader
            liveRunning={liveRunning}
            activeAgentName={liveAgentName}
            onRunPipeline={startLiveRun}
          />

          {/* Current screen context bar */}
          <div className="flex items-center gap-2 py-2">
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
          {/* Live feed panel */}
          {showLiveFeed && (
            <LiveFeedPanel
              events={liveEvents}
              activeAgentName={liveAgentName}
              running={liveRunning}
              onClose={() => setShowLiveFeed(false)}
            />
          )}

          {activeScreen === 1 && <FitchS1CommandCenter onScreenChange={setActiveScreen} />}
          {activeScreen === 2 && <FitchS2FfiecIngest onScreenChange={setActiveScreen} />}
          {activeScreen === 3 && <FitchS3RiskScoring onScreenChange={setActiveScreen} />}
          {activeScreen === 4 && <FitchS4NlpSignals onScreenChange={setActiveScreen} />}
          {activeScreen === 5 && <FitchS5SvbBacktest onScreenChange={setActiveScreen} />}
          {activeScreen === 6 && <FitchS6ReportAssembly onScreenChange={setActiveScreen} />}
        </div>
      </div>
    </div>
  );
}
