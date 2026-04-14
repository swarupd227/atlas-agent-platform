import { useState, useRef, useEffect } from "react";
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
import {
  useFitchPipeline, type FitchPipelineState, type FitchToolEvent,
} from "./fitch-constants";
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
  report_generator:    rs => rs?.svbComparison?.daysAdvanceWarning
                               ? `${rs.svbComparison.daysAdvanceWarning}d advance warning`
                               : "—",
};

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  completed: { dot: "bg-green-400",              label: "complete" },
  running:   { dot: "bg-rose-400 animate-pulse",  label: "running"  },
  failed:    { dot: "bg-red-400",                 label: "failed"   },
  idle:      { dot: "bg-muted-foreground/30",     label: "idle"     },
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PipelineHeader({
  pipelineState,
  onRunPipeline,
}: {
  pipelineState: FitchPipelineState;
  onRunPipeline: () => void;
}) {
  const liveRunning = pipelineState.status === "running";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/fitch/agent-runs"],
    refetchInterval: liveRunning ? 20000 : false,
    placeholderData: (prev: any) => prev,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 pb-3 pt-2 border-b border-border/50 overflow-x-auto">
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
          const isCurrentlyRunning = liveRunning && pipelineState.currentRole === run.key;
          const statusToShow = isCurrentlyRunning ? "running" : (run.runStatus || run.agentStatus);
          const statusConf = STATUS_MAP[statusToShow] || STATUS_MAP.idle;

          const result = pipelineState.results.find(r => r.role === run.key);
          const metric = result?.resultSummary
            ? PIPELINE_METRIC[run.key]?.(result.resultSummary)
            : PIPELINE_METRIC[run.key]?.(run.resultSummary);
          const role = PIPELINE_ROLE[run.key] || "";

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

function getEventStyle(ev: FitchToolEvent & { synthType?: string }): string {
  const t = ev.synthType;
  if (t === "run_start" || t === "setup")    return "text-blue-400";
  if (t === "agent_start")                  return "text-indigo-300 font-semibold";
  if (t === "agent_complete" && ev.success) return "text-green-400";
  if (t === "agent_complete" && !ev.success)return "text-red-400";
  if (t === "run_complete")                 return "text-rose-400 font-semibold";
  if (ev.success)                           return "text-emerald-400/80";
  return "text-red-400/80";
}

function getEventIcon(ev: FitchToolEvent & { synthType?: string }) {
  const t = ev.synthType;
  if (t === "run_start" || t === "setup")    return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (t === "agent_start")                  return <Play className="w-3 h-3 text-indigo-300 shrink-0 mt-0.5" />;
  if (t === "agent_complete" && ev.success) return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (t === "agent_complete" && !ev.success)return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (t === "run_complete")                 return <CheckCircle2 className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />;
  if (ev.success)                           return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
  return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  get_call_report_schedules:   "Ingesting RC-N / RC-C / RI-B / RC-R call report schedules",
  get_npa_schedule:            "Retrieving NPA and 90+ day past-due loan data",
  get_charge_off_schedule:     "Pulling gross and net charge-off data by loan category",
  get_capital_adequacy:        "Fetching CET1, Tier 1, total capital and leverage ratios",
  get_peer_cohort_ratios:      "Loading G-SIB cohort median benchmarks across 18 ratios",
  get_ratio_trends:            "Computing 8-quarter CAMELS ratio trend vectors",
  get_threshold_breaches:      "Detecting threshold breaches with severity and QoQ delta",
  get_transcript_sentiment:    "Running NLP on earnings call transcripts — credit / guidance / sector dims",
  get_filing_language_changes: "Scanning 10-K filings for new and strengthened risk factors YoY",
  get_news_signals:            "Classifying news articles (routine / emerging / material / crisis)",
  get_news_volume_trend:       "Computing rolling 13-week news volume σ-deviation per bank",
  get_report_template:         "Loading AQEWS-QUARTERLY-V3 assessment package template scaffold",
  get_analyst_notes:           "Retrieving prior-quarter analyst observations for watch-list banks",
  get_svb_backtest_data:       "Running SVB Q1 2022→Mar 2023 backtesting — 182-day advance warning",
  get_rating_history:          "Fetching Fitch Viability Rating 8-quarter history for flagged banks",
};

function LiveFeedPanel({
  pipelineState,
  onClose,
}: {
  pipelineState: FitchPipelineState;
  onClose: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const running = pipelineState.status === "running";

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [pipelineState.toolEvents.length]);

  return (
    <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden mb-4" data-testid="fitch-live-feed">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${running ? "bg-rose-400 animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-[11px] font-medium font-mono">Live Pipeline Execution</span>
          {pipelineState.currentRole && running && (
            <span className="text-[10px] text-muted-foreground/70">— {pipelineState.currentRole}</span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]">
          hide ×
        </button>
      </div>
      <div ref={feedRef} className="h-48 overflow-y-auto px-3 py-2 space-y-1 font-mono">
        {pipelineState.toolEvents.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40 italic">Waiting for pipeline to start…</p>
        )}
        {pipelineState.toolEvents.map((ev, idx) => (
          <div key={idx} className="flex items-start gap-2" data-testid={`fitch-live-event-${idx}`}>
            {getEventIcon(ev as any)}
            <div className="flex-1 min-w-0">
              <span className="text-[9px] text-muted-foreground/40 mr-2">{formatTime(ev.timestamp)}</span>
              <span className="text-[9px] text-muted-foreground/60 mr-1">[{ev.tool}]</span>
              <span className={`text-[10px] ${getEventStyle(ev as any)}`}>
                <span className="text-muted-foreground/50">{ev.agentName} — </span>
                {TOOL_DESCRIPTIONS[ev.tool] ?? ev.tool}
                {ev.success
                  ? ev.recordCount != null
                    ? <span className="text-muted-foreground/50"> — {ev.recordCount} records returned</span>
                    : <span className="text-emerald-400/60"> ✓</span>
                  : <span className="text-red-400"> ✗ failed</span>}
              </span>
            </div>
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-rose-400 animate-spin shrink-0" />
            <span className="text-[10px] text-rose-400/70 animate-pulse">Agents running…</span>
          </div>
        )}
        {pipelineState.status === "error" && pipelineState.error && (
          <div className="flex items-center gap-2 text-red-400">
            <Terminal className="w-3 h-3 shrink-0" />
            <span className="text-[10px]">Error: {pipelineState.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FitchDemo() {
  const [activeScreen, setActiveScreen] = useState(1);
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const queryClient                     = useQueryClient();

  const { state, trigger } = useFitchPipeline();

  const liveRunning  = state.status === "running";
  const liveComplete = state.status === "complete";

  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current === "running" && state.status === "complete") {
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch/agent-runs"] });
    }
    prevStatusRef.current = state.status;
  }, [state.status, queryClient]);

  const handleRunPipeline = () => {
    setShowLiveFeed(true);
    trigger();
  };

  const screen     = SCREENS.find(s => s.id === activeScreen)!;
  const ScreenIcon = screen.icon;
  const goNext = () => setActiveScreen(s => Math.min(6, s + 1));
  const goPrev = () => setActiveScreen(s => Math.max(1, s - 1));

  return (
    <div className="flex flex-col h-full">
      {/* Demo header */}
      <div className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 pt-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title */}
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-rose-400" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm font-semibold">ABC Ratings</h1>
                  <Badge variant="secondary" className="text-[10px]">Asset Quality Early Warning System</Badge>
                  <Badge className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/30">Live Demo</Badge>
                  {liveComplete && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30">✓ Run Complete</Badge>}
                  {state.status === "error" && <Badge className="text-[10px] bg-red-500/20 text-red-300 border-red-500/30">⚠ Error</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  6 AI agents · 4 MCP servers · 15 tools · SVB 182-day advance warning
                </p>
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
            pipelineState={state}
            onRunPipeline={handleRunPipeline}
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
          {/* Live feed panel — driven by shared useFitchPipeline state */}
          {showLiveFeed && (
            <LiveFeedPanel
              pipelineState={state}
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
