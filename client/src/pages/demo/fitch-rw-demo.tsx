import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Play, Loader2, Terminal, ChevronDown, ChevronUp,
  Activity, FileText, CheckCircle2, RotateCcw, ArrowRight, Clock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  FITCH_RW_COLOR, FITCH_RW_ACCENT, FITCH_RW_AGENTS,
  TARGET_ISSUER, TARGET_RATING, TARGET_ACTION,
} from "./fitch-rw-constants";
import FitchRWS1CommandCenter from "./fitch-rw-s1-command-center";
import FitchRWS2LiveRun, { type FitchRWLiveEvent } from "./fitch-rw-s2-live-run";
import FitchRWS3AgentTraces from "./fitch-rw-s3-agent-traces";
import FitchRWS4Approvals from "./fitch-rw-s4-approvals";

type TabId = "command-center" | "live-run" | "agent-traces" | "approvals";

const TABS: { id: TabId; label: string; icon: any; sub: string }[] = [
  { id: "command-center", label: "Command Center",  icon: LayoutDashboard, sub: "Issuer watchlist & KPIs"     },
  { id: "live-run",       label: "Live Pipeline",    icon: Activity,        sub: "4-agent SSE execution"       },
  { id: "agent-traces",   label: "Agent Traces",     icon: Terminal,        sub: "Tool calls & timings"        },
  { id: "approvals",      label: "Approvals",        icon: FileText,        sub: "Rating memo review queue"    },
];

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  active:    { dot: "bg-green-400",           label: "Active"   },
  idle:      { dot: "bg-blue-400",            label: "Idle"     },
  running:   { dot: "bg-amber-400",           label: "Running"  },
  completed: { dot: "bg-green-400",           label: "Done"     },
  failed:    { dot: "bg-red-400",             label: "Failed"   },
  pending:   { dot: "bg-muted-foreground/40", label: "Pending"  },
};

function PipelineHeader({ liveRunning, activeAgentKey, hasRun }: {
  liveRunning: boolean; activeAgentKey: string | null; hasRun: boolean;
}) {
  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch-rw/agent-runs"],
    refetchInterval: liveRunning ? 4000 : 30000,
  });
  const runs: any[] = data?.agentRuns || [];

  if (!runs.length) {
    return (
      <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {FITCH_RW_AGENTS.map((a, i) => (
          <div key={a.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex-1 min-w-[120px] h-16 rounded-lg bg-muted/20 border border-border/50 animate-pulse" />
            {i < FITCH_RW_AGENTS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
      {runs.map((run: any, i: number) => {
        const isRunning = liveRunning && activeAgentKey === run.key;
        const effectiveStatus = isRunning ? "running" : (hasRun ? (run.runStatus || "idle") : "idle");
        const conf = STATUS_MAP[effectiveStatus] || STATUS_MAP.idle;
        return (
          <div key={run.agentId || run.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg border transition-colors ${
              isRunning ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/20 border-border/50 hover:border-border"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {run.step || i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} ${isRunning ? "animate-pulse" : ""}`} />
                  <span className="text-[9px] text-muted-foreground/60">{conf.label}</span>
                </div>
              </div>
              {run.agentId ? (
                <Link href={`/agents/${run.agentId}`}>
                  <span className="text-[10px] font-semibold leading-tight hover:underline cursor-pointer block line-clamp-1" style={isRunning ? { color: FITCH_RW_ACCENT } : {}}>
                    {run.agentName}
                  </span>
                </Link>
              ) : (
                <span className="text-[10px] font-semibold leading-tight block line-clamp-1">{run.agentName}</span>
              )}
              <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/50">
                <Clock className="w-2.5 h-2.5" />
                <span>{run.triggerType || "sequential"}</span>
              </div>
            </div>
            {i < runs.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

export default function FitchRWDemo() {
  const [activeTab, setActiveTab]         = useState<TabId>("command-center");
  const [hasRun, setHasRun]               = useState(false);
  const [liveRunning, setLiveRunning]     = useState(false);
  const [liveComplete, setLiveComplete]   = useState(false);
  const [liveEvents, setLiveEvents]       = useState<FitchRWLiveEvent[]>([]);
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null);
  const [completedKeys, setCompletedKeys] = useState<string[]>([]);
  const [showSSELog, setShowSSELog]       = useState(false);
  const [memoText, setMemoText]           = useState<string | null>(null);

  const esRef       = useRef<EventSource | null>(null);
  const eventIdRef  = useRef(0);
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/fitch-rw/reset"),
    onSuccess: () => {
      setHasRun(false);
      setLiveComplete(false);
      setLiveEvents([]);
      setCompletedKeys([]);
      setMemoText(null);
      setShowSSELog(false);
      eventIdRef.current = 0;
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch-rw/agent-runs"] });
    },
  });

  const addEvent = useCallback((type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLiveEvents(prev => [...prev, { id: eventIdRef.current++, time, type, agentName, tool, success, message }]);
  }, []);

  const stopLiveRun = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setActiveAgentKey(null);
    setLiveRunning(false);
  }, []);

  const startLiveRun = useCallback(() => {
    stopLiveRun();
    setLiveEvents([]);
    setCompletedKeys([]);
    setMemoText(null);
    eventIdRef.current = 0;
    setLiveRunning(true);
    setLiveComplete(false);
    setShowSSELog(true);
    setActiveTab("live-run");

    const es = new EventSource("/demo-api/fitch-rw/live-run");
    esRef.current = es;

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "ATLAS Runtime", d.message || "Initialising Fitch RW pipeline…");
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "ATLAS Runtime", d.message || "Agents and knowledge bases verified.");
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setActiveAgentKey(d.key || null);
      addEvent("agent_start", d.agentName, `▶ ${d.agentName} starting — step ${d.step}`);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch-rw/agent-runs"] });
    });

    es.addEventListener("tool_call", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("tool_call", d.agentName, `Calling ${d.tool}…`, d.tool);
    });

    es.addEventListener("tool_result", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const label = d.success
        ? `${d.tool} → ${d.recordCount != null ? `${d.recordCount} records` : "OK"}`
        : `${d.tool} → ${d.error || "failed"}`;
      addEvent("tool_result", d.agentName, label, d.tool, d.success);
    });

    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setCompletedKeys(prev => [...prev, d.key]);
      setActiveAgentKey(null);
      addEvent("agent_complete", d.agentName, `${d.success ? "✓ Complete" : "✗ Failed"}: ${d.agentName}`, undefined, d.success);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch-rw/agent-runs"] });
    });

    es.addEventListener("pipeline_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addEvent("pipeline_complete", "ATLAS Runtime", "All 4 agents complete — Rating Action Memo ready for review", undefined, true);
      if (d.memoText) setMemoText(d.memoText);
      else if (d.memoAgentRawOutput) setMemoText(d.memoAgentRawOutput);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setLiveComplete(true);
      setHasRun(true);
      setActiveAgentKey(null);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/fitch-rw/agent-runs"] });
    });

    es.addEventListener("error", (e: MessageEvent) => {
      let msg = "Pipeline error";
      try { msg = JSON.parse(e.data)?.message || msg; } catch {}
      addEvent("error", "ATLAS Runtime", `Error: ${msg}`);
      es.close();
      esRef.current = null;
      setLiveRunning(false);
      setActiveAgentKey(null);
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLiveRunning(false);
        esRef.current = null;
        setActiveAgentKey(null);
      }
    };
  }, [addEvent, stopLiveRun, queryClient]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${FITCH_RW_COLOR}22` }}>
            <span className="text-[9px] font-bold" style={{ color: FITCH_RW_COLOR }}>FRW</span>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">Fitch Ratings — Automated Rating Watch Intelligence</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              SCN-1.1 · {TARGET_ISSUER} · {TARGET_RATING} {TARGET_ACTION} · 4 agents · 847 issuers monitored
            </p>
          </div>
          <Badge className="text-[10px] ml-1" style={{ backgroundColor: `${FITCH_RW_ACCENT}20`, color: FITCH_RW_ACCENT, borderColor: `${FITCH_RW_ACCENT}40` }}>
            ⚠ RWN
          </Badge>
          {liveComplete && (
            <Badge className="text-[10px]" style={{ backgroundColor: `${FITCH_RW_COLOR}18`, color: FITCH_RW_COLOR, borderColor: `${FITCH_RW_COLOR}30` }}>
              Run Complete
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {(liveEvents.length > 0 || liveRunning) && (
            <button
              onClick={() => setShowSSELog(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-toggle-sse-log"
            >
              <Terminal className="w-3.5 h-3.5" />
              SSE log
              {showSSELog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {liveComplete && (
            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              data-testid="btn-reset-demo"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-50"
            >
              {resetMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resetting…</>
                : <><RotateCcw className="w-3.5 h-3.5" /> Reset Demo</>}
            </button>
          )}

          <button
            onClick={startLiveRun}
            disabled={liveRunning}
            data-testid="btn-run-live-pipeline"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              liveRunning ? "opacity-50 cursor-not-allowed border border-border/40 bg-muted/20 text-muted-foreground" : "text-white hover:opacity-90 active:scale-95 shadow-sm"
            }`}
            style={!liveRunning ? { backgroundColor: FITCH_RW_COLOR } : {}}
          >
            {liveRunning
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : <><Play className="w-3.5 h-3.5" /> Run Live Pipeline</>
            }
          </button>

          <Link href="/demo">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">← Demo Hub</button>
          </Link>
        </div>
      </div>

      {/* Inline SSE log (global) */}
      {showSSELog && (
        <div className="shrink-0 px-6 pt-2 pb-1">
          <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: liveRunning ? FITCH_RW_COLOR : "hsl(var(--muted-foreground) / 0.4)" }} />
                <span className="text-[11px] font-medium font-mono">SSE Trace Log — {TARGET_ISSUER} Pipeline</span>
                {activeAgentKey && liveRunning && (
                  <span className="text-[10px] text-muted-foreground/70">— {FITCH_RW_AGENTS.find(a => a.key === activeAgentKey)?.name || activeAgentKey}</span>
                )}
              </div>
              <button onClick={() => setShowSSELog(false)} className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]">hide ×</button>
            </div>
            <div className="h-32 overflow-y-auto px-3 py-2 space-y-0.5 font-mono">
              {liveEvents.slice(-30).map(ev => (
                <div key={ev.id} className="flex items-start gap-2">
                  <span className="text-[9px] text-muted-foreground/40 shrink-0 mt-0.5">{ev.time}</span>
                  {ev.tool && <span className="text-[9px] text-muted-foreground/50 shrink-0">[{ev.tool}]</span>}
                  <span className={`text-[10px] ${
                    ev.type === "agent_start" ? "text-amber-300 font-semibold"
                    : ev.type === "pipeline_complete" ? "text-emerald-400 font-semibold"
                    : ev.type === "agent_complete" && ev.success !== false ? "text-green-400"
                    : ev.type === "tool_result" && ev.success ? "text-emerald-400/80"
                    : ev.type === "tool_result" && !ev.success ? "text-red-400/80"
                    : ev.type === "error" ? "text-red-400"
                    : "text-muted-foreground"
                  }`}>{ev.message}</span>
                </div>
              ))}
              {liveRunning && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: FITCH_RW_COLOR }} />
                  <span className="text-[10px] animate-pulse" style={{ color: `${FITCH_RW_COLOR}99` }}>Agents running…</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline header */}
      <div className="shrink-0 px-6">
        <PipelineHeader liveRunning={liveRunning} activeAgentKey={activeAgentKey} hasRun={hasRun} />
      </div>

      {/* Tab bar */}
      <div className="shrink-0 px-6 border-b border-border/50">
        <div className="flex items-center gap-0.5 py-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
                style={isActive ? { backgroundColor: FITCH_RW_COLOR } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "approvals" && hasRun && (
                  <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: FITCH_RW_ACCENT, color: "#000" }}>1</span>
                )}
              </button>
            );
          })}
          <div className="ml-auto text-[10px] text-muted-foreground/50 pr-1 hidden sm:block">
            {activeTab === "command-center" ? "Issuer watchlist" : activeTab === "live-run" ? "Pipeline execution" : activeTab === "agent-traces" ? "Registry traces" : "Approval queue"}
          </div>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          {activeTab === "command-center" && (
            <FitchRWS1CommandCenter onRunPipeline={startLiveRun} />
          )}
          {activeTab === "live-run" && (
            <FitchRWS2LiveRun
              events={liveEvents}
              activeAgentKey={activeAgentKey}
              completedKeys={completedKeys}
              running={liveRunning}
              complete={liveComplete}
              memoText={memoText}
              onRun={startLiveRun}
            />
          )}
          {activeTab === "agent-traces" && (
            <FitchRWS3AgentTraces hasRun={hasRun} />
          )}
          {activeTab === "approvals" && (
            <FitchRWS4Approvals hasRun={hasRun} />
          )}
        </div>
      </div>
    </div>
  );
}
