import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Play, Loader2, Terminal, ChevronDown, ChevronUp,
  Activity, FileText, CheckCircle2, RotateCcw, ArrowRight, Clock, FileSignature,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ONESPAN_COLOR, ONESPAN_ACCENT, ONESPAN_AGENTS,
  TARGET_TXN_ID, TARGET_CLIENT, TARGET_AMOUNT, TARGET_PRODUCT,
} from "./onespan-constants";
import OnespanS1CommandCenter from "./onespan-s1-command-center";
import OnespanS2LiveRun, { type OnespanLiveEvent } from "./onespan-s2-live-run";
import OnespanS3AgentTraces from "./onespan-s3-agent-traces";
import OnespanS4Approvals from "./onespan-s4-approvals";

type TabId = "command-center" | "live-run" | "agent-traces" | "approvals";

const TABS: { id: TabId; label: string; icon: React.ElementType; sub: string }[] = [
  { id: "command-center", label: "Command Center",  icon: LayoutDashboard, sub: "Transaction watchlist & KPIs"    },
  { id: "live-run",       label: "Live Pipeline",    icon: Activity,        sub: "4-agent SSE execution"            },
  { id: "agent-traces",   label: "Agent Traces",     icon: Terminal,        sub: "Tool calls & timings"            },
  { id: "approvals",      label: "Approvals",        icon: FileText,        sub: "Intervention & compliance queue" },
];

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  active:    { dot: "bg-green-400",           label: "Active"   },
  idle:      { dot: "bg-blue-400",            label: "Idle"     },
  running:   { dot: "bg-amber-400",           label: "Running"  },
  completed: { dot: "bg-green-400",           label: "Done"     },
  success:   { dot: "bg-green-400",           label: "Done"     },
  failed:    { dot: "bg-red-400",             label: "Failed"   },
  pending:   { dot: "bg-muted-foreground/40", label: "Pending"  },
};

function PipelineHeader({ liveRunning, activeAgentKey, hasRun }: {
  liveRunning: boolean; activeAgentKey: string | null; hasRun: boolean;
}) {
  const { data } = useQuery<{ agentRuns: { key: string; agentName: string; step: number; runStatus: string }[] }>({
    queryKey: ["/demo-api/onespan/agent-runs"],
    refetchInterval: liveRunning ? 4000 : 30000,
  });
  const runs = data?.agentRuns ?? [];

  if (!runs.length) {
    return (
      <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {ONESPAN_AGENTS.map((a, i) => (
          <div key={a.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex-1 min-w-[120px] h-16 rounded-lg bg-muted/20 border border-border/50 animate-pulse" />
            {i < ONESPAN_AGENTS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
      {runs.map((run, i) => {
        const isRunning      = liveRunning && activeAgentKey === run.key;
        const effectiveStatus = isRunning ? "running" : (hasRun ? (run.runStatus || "idle") : "idle");
        const conf = STATUS_MAP[effectiveStatus] || STATUS_MAP.idle;
        return (
          <div key={run.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg border transition-colors ${
              isRunning ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/20 border-border/50 hover:border-border"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {run.step || i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} ${isRunning ? "animate-pulse" : ""}`} />
                  <span className="text-[9px] text-muted-foreground/60">{conf.label}</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold leading-tight block line-clamp-1" style={isRunning ? { color: ONESPAN_ACCENT } : {}} data-testid={`header-agent-${run.key}`}>
                {run.agentName}
              </span>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/50">
                <Clock className="w-2.5 h-2.5" />
                <span>sequential</span>
              </div>
            </div>
            {i < runs.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

export default function OnespanDemo() {
  const [activeTab, setActiveTab]           = useState<TabId>("command-center");
  const [hasRun, setHasRun]                 = useState(false);
  const [liveRunning, setLiveRunning]       = useState(false);
  const [liveComplete, setLiveComplete]     = useState(false);
  const [liveEvents, setLiveEvents]         = useState<OnespanLiveEvent[]>([]);
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null);
  const [completedKeys, setCompletedKeys]   = useState<string[]>([]);
  const [showSSELog, setShowSSELog]         = useState(false);
  const [reportText, setReportText]         = useState<string | null>(null);

  const abortRef   = useRef<AbortController | null>(null);
  const eventIdRef = useRef(0);
  const qc         = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/demo-api/onespan/reset"),
    onSuccess: () => {
      setHasRun(false);
      setLiveComplete(false);
      setLiveEvents([]);
      setCompletedKeys([]);
      setReportText(null);
      setShowSSELog(false);
      eventIdRef.current = 0;
      qc.invalidateQueries({ queryKey: ["/demo-api/onespan/agent-runs"] });
    },
  });

  const addEvent = useCallback((type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLiveEvents(prev => [...prev, { id: eventIdRef.current++, time, type, agentName, tool, success, message }]);
  }, []);

  const stopLiveRun = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setActiveAgentKey(null);
    setLiveRunning(false);
  }, []);

  const startLiveRun = useCallback(() => {
    stopLiveRun();
    setLiveEvents([]);
    setCompletedKeys([]);
    setReportText(null);
    eventIdRef.current = 0;
    setLiveRunning(true);
    setLiveComplete(false);
    setShowSSELog(true);
    setActiveTab("live-run");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const dispatch = (eventType: string, rawData: string) => {
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(rawData); } catch { /* malformed chunk — skip */ }

      if (eventType === "run_start") {
        addEvent("run_start", "ATLAS Runtime", (d.message as string) || "Initialising OneSpan Digital Agreements pipeline…");
      } else if (eventType === "setup") {
        addEvent("setup", "ATLAS Runtime", (d.message as string) || "Agents and knowledge bases verified.");
      } else if (eventType === "agent_start") {
        setActiveAgentKey((d.key as string) ?? null);
        addEvent("agent_start", (d.agentName as string) ?? "Agent", `▶ ${d.agentName as string} starting — step ${d.step as number}`);
        qc.invalidateQueries({ queryKey: ["/demo-api/onespan/agent-runs"] });
      } else if (eventType === "tool_call") {
        const args = d.args as Record<string, unknown> | undefined;
        const argSummary = args
          ? Object.entries(args).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ")
          : "";
        const callMsg = argSummary
          ? `Calling ${d.tool as string} (${argSummary})`
          : `Calling ${d.tool as string}…`;
        addEvent("tool_call", (d.agentName as string) ?? "Agent", callMsg, d.tool as string);
      } else if (eventType === "tool_result") {
        const label = d.success
          ? `${d.tool} → ${d.recordCount != null ? `${d.recordCount} records` : "OK"}`
          : `${d.tool} → ${(d.error as string) ?? "failed"}`;
        addEvent("tool_result", (d.agentName as string) ?? "Agent", label, d.tool as string, d.success as boolean);
      } else if (eventType === "agent_thinking") {
        const summary = (d.summary as string) ?? "";
        if (summary.length > 0) {
          addEvent("agent_thinking", (d.agentName as string) ?? "Agent", summary);
        }
      } else if (eventType === "iteration_done") {
        const iter  = d.iteration as number ?? 0;
        const tools = d.toolsCalled as number ?? 0;
        addEvent("iteration_done", (d.agentName as string) ?? "Agent", `Iteration ${iter} complete — ${tools} tool call${tools !== 1 ? "s" : ""} processed`);
      } else if (eventType === "agent_complete") {
        setCompletedKeys(prev => [...prev, (d.key as string) ?? ""]);
        setActiveAgentKey(null);
        addEvent("agent_complete", (d.agentName as string) ?? "Agent", `${d.success ? "✓ Complete" : "✗ Failed"}: ${d.agentName as string}`, undefined, d.success as boolean);
        qc.invalidateQueries({ queryKey: ["/demo-api/onespan/agent-runs"] });
      } else if (eventType === "pipeline_complete") {
        addEvent("pipeline_complete", "ATLAS Runtime", "All 4 agents complete — Portfolio Intelligence Report ready", undefined, true);
        if (d.reportText) setReportText(d.reportText as string);
        abortRef.current = null;
        setLiveRunning(false);
        setLiveComplete(true);
        setHasRun(true);
        setActiveAgentKey(null);
        qc.invalidateQueries({ queryKey: ["/demo-api/onespan/agent-runs"] });
      } else if (eventType === "error") {
        addEvent("error", "ATLAS Runtime", `Error: ${(d.message as string) ?? "Pipeline error"}`);
        abortRef.current = null;
        setLiveRunning(false);
        setActiveAgentKey(null);
      }
    };

    (async () => {
      try {
        const resp = await fetch("/demo-api/onespan/live-run", {
          method:  "POST",
          headers: { Accept: "text/event-stream" },
          signal:  ctrl.signal,
        });

        if (!resp.ok || !resp.body) {
          addEvent("error", "ATLAS Runtime", `Connection failed: HTTP ${resp.status}`);
          setLiveRunning(false);
          return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            let evType = "";
            let evData = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event: "))      evType = line.slice(7).trim();
              else if (line.startsWith("data: "))  evData = line.slice(6).trim();
            }
            if (evType && evData) dispatch(evType, evData);
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          addEvent("error", "ATLAS Runtime", "Stream connection error");
          setLiveRunning(false);
          setActiveAgentKey(null);
        }
      }
    })();
  }, [addEvent, stopLiveRun, qc]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ONESPAN_COLOR}22` }}>
            <FileSignature className="w-4 h-4" style={{ color: ONESPAN_COLOR }} />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">OneSpan Digital Agreements Intelligence</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              SCN-OS-1.0 · {TARGET_TXN_ID} · {TARGET_CLIENT} · {TARGET_AMOUNT} {TARGET_PRODUCT} · 4 agents · 284 envelopes monitored
            </p>
          </div>
          <Badge className="text-[10px] ml-1" style={{ backgroundColor: `${ONESPAN_ACCENT}20`, color: ONESPAN_ACCENT, borderColor: `${ONESPAN_ACCENT}40` }}>
            ⚠ VIP Declined
          </Badge>
          {liveComplete && (
            <Badge className="text-[10px]" style={{ backgroundColor: `${ONESPAN_COLOR}18`, color: ONESPAN_COLOR, borderColor: `${ONESPAN_COLOR}30` }}>
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
            style={!liveRunning ? { backgroundColor: ONESPAN_COLOR } : {}}
          >
            {liveRunning
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : <><Play className="w-3.5 h-3.5" /> Run Live Pipeline</>
            }
          </button>

          <Link href="/demo">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-demo-hub">← Demo Hub</button>
          </Link>
        </div>
      </div>

      {/* Inline SSE log */}
      {showSSELog && (
        <div className="shrink-0 px-6 pt-2 pb-1">
          <div className="border border-border/50 rounded-lg bg-black/40 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-muted/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: liveRunning ? ONESPAN_COLOR : "hsl(var(--muted-foreground) / 0.4)" }} />
                <span className="text-[11px] font-medium font-mono">SSE Trace Log — {TARGET_TXN_ID} Pipeline</span>
                {activeAgentKey && liveRunning && (
                  <span className="text-[10px] text-muted-foreground/70">— {ONESPAN_AGENTS.find(a => a.key === activeAgentKey)?.name ?? activeAgentKey}</span>
                )}
              </div>
              <button onClick={() => setShowSSELog(false)} className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]" data-testid="btn-hide-sse-log">hide ×</button>
            </div>
            <div className="h-32 overflow-y-auto px-3 py-2 space-y-0.5 font-mono">
              {liveEvents.slice(-30).map(ev => (
                <div key={ev.id} className="flex items-start gap-2">
                  <span className="text-[9px] text-muted-foreground/40 shrink-0 mt-0.5">{ev.time}</span>
                  {ev.tool && <span className="text-[9px] text-muted-foreground/50 shrink-0">[{ev.tool}]</span>}
                  <span className={`text-[10px] ${
                    ev.type === "agent_start"       ? "text-amber-300 font-semibold"
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
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: ONESPAN_COLOR }} />
                  <span className="text-[10px] animate-pulse" style={{ color: `${ONESPAN_COLOR}99` }}>Agents running…</span>
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
            const Icon     = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                  isActive ? "text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
                style={isActive ? { backgroundColor: ONESPAN_COLOR } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "approvals" && hasRun && (
                  <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: ONESPAN_ACCENT, color: "#fff" }}>1</span>
                )}
              </button>
            );
          })}
          <div className="ml-auto text-[10px] text-muted-foreground/50 pr-1 hidden sm:block">
            {activeTab === "command-center" ? "Transaction watchlist"
              : activeTab === "live-run"    ? "Pipeline execution"
              : activeTab === "agent-traces" ? "Registry traces"
              : "Intervention & compliance"}
          </div>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          {activeTab === "command-center" && (
            <OnespanS1CommandCenter onRunPipeline={startLiveRun} />
          )}
          {activeTab === "live-run" && (
            <OnespanS2LiveRun
              events={liveEvents}
              activeAgentKey={activeAgentKey}
              completedKeys={completedKeys}
              running={liveRunning}
              complete={liveComplete}
              reportText={reportText}
              onRun={startLiveRun}
            />
          )}
          {activeTab === "agent-traces" && (
            <OnespanS3AgentTraces hasRun={hasRun} />
          )}
          {activeTab === "approvals" && (
            <OnespanS4Approvals hasRun={hasRun} />
          )}
        </div>
      </div>
    </div>
  );
}
