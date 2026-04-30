import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  Newspaper, FileSearch, Users, FileText, Scale, CheckCircle2,
  AlertTriangle, Clock,
} from "lucide-react";

const HNP_COLOR    = "#6B21A8";
const DEMO_TITLE   = "Government Beat Intelligence";
const CLIENT_NAME  = "Hearst Newspapers";
const PIPELINE     = "HNP-HOUSTON-GOVT-BEAT";

type ScenarioKey = "happy" | "attribution-block" | "foia-routing-fail";

interface LiveEvent {
  id:        number;
  type:      string;
  agentName: string;
  message:   string;
  timestamp: Date;
}

type AgentState = "idle" | "running" | "ok" | "fail";
interface LiveAgent {
  state:     AgentState;
  toolCalls: number;
  summary?:  string;
  startedAt?: number;
  finishedAt?: number;
}

const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string }[] = [
  {
    key:         "happy",
    label:       "Happy Path — Drainage Bond Investigation",
    description: "Hurricane Mara 36-hour landfall. 4 agents process 47 Houston transcripts (90 days), surface the $340M drainage bond / 34% delivery story (Allied Hydro contractor, Mayor Whitmire, Council Pollard/Huffman), reporter approves at the brief gate, story skeleton drafted with citations, FOIA filings to HCFCD/TCEQ/TxDOT.",
  },
  {
    key:         "attribution-block",
    label:       "Exception: Source Attribution Block",
    badge:       "Exception",
    description: "Story Draft attempts to land an uncited claim at the CMS. The source-attribution gate refuses the draft. Agent must re-cite back to a transcript timestamp before the draft is accepted.",
  },
  {
    key:         "foia-routing-fail",
    label:       "Exception: FOIA Routing Failure",
    badge:       "Exception",
    description: "FOIA agent attempts to file against an unknown agency. Public-records portal rejects the request. Agent re-confirms the correct records officer via the entity ontology, then refiles successfully.",
  },
];

const AGENTS = [
  { idx: 1, externalId: "HNP-GOVT-01", name: "Meeting Corpus Analyst",     icon: FileSearch  },
  { idx: 2, externalId: "HNP-GOVT-02", name: "Investigation Angle Detector", icon: Newspaper },
  { idx: 3, externalId: "HNP-GOVT-03", name: "Story Draft Agent",           icon: FileText   },
  { idx: 4, externalId: "HNP-GOVT-04", name: "FOIA Request Generator",      icon: Scale      },
];

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message: s }; }
}

function formatEventMessage(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  if (d.message) return String(d.message);
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""} · ${d.assemblyCorpus?.transcripts ?? "?"} transcripts`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? d.agentName ?? ""} starting${d.model ? ` (${d.model})` : ""}`;
    case "agent_event":
      if (d.type === "tool_call_result") {
        const args = d.toolName ? ` ${d.toolName}` : "";
        const res = d.preview ?? d.summary ?? "";
        return `tool_call${args}${res ? ` → ${String(res).slice(0, 200)}` : ""}`;
      }
      if (d.type === "llm_response") return `llm: ${String(d.text ?? d.preview ?? "").slice(0, 200)}`;
      return d.summary ?? d.type ?? JSON.stringify(d).slice(0, 200);
    case "agent_complete":
      return `Agent ${d.externalId ?? d.agentName ?? ""} complete${d.toolCalls != null ? ` · ${d.toolCalls} tool calls` : ""}${d.success === false ? " · FAILED" : ""}`;
    case "approval_gate":
      return `Gate: ${d.gate ?? ""} · ${d.reporter ?? ""} (${d.desk ?? ""}, ${d.newspaper ?? ""}) · action=${d.action ?? "approved"}`;
    case "phase_start":
      return `Phase ${d.phase ?? ""} → ${(d.agents ?? []).join(", ")}`;
    case "audit_trail":
      return `Provenance chain captured for ${(d.tracesAvailableAt ?? []).length} agents`;
    case "run_complete":
      return d.message ?? `Run complete · scenario: ${d.scenario ?? ""}`;
    case "error":
      return `ERROR: ${d.message ?? "unknown"}`;
    default:
      return JSON.stringify(d).slice(0, 200);
  }
}

const EVENT_COLORS: Record<string, string> = {
  run_start:        "text-blue-400",
  setup:            "text-white/40",
  agent_start:      "text-emerald-400",
  agent_event:      "text-purple-400",
  agent_complete:   "text-emerald-300",
  approval_gate:    "text-amber-400",
  phase_start:      "text-blue-300",
  audit_trail:      "text-cyan-400",
  run_complete:     "text-emerald-400",
  error:            "text-red-400",
};

function LiveFeedPanel({
  events, collapsed, onToggleCollapsed, onClose,
}: {
  events: LiveEvent[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, collapsed]);

  return (
    <div className="border-t border-border/50 bg-black/90 flex flex-col shrink-0">
      <button
        onClick={onToggleCollapsed}
        className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/5 hover:bg-white/5 transition-colors w-full text-left"
        data-testid="btn-toggle-sse-log"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-white/60 shrink-0" />
          <span className="text-xs text-white/70 font-mono uppercase tracking-wide">Agent SSE Trace Log</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">{events.length}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-white/50">{collapsed ? "Show" : "Hide"}</span>
          {collapsed
            ? <ChevronUp className="w-4 h-4 text-white/60" />
            : <ChevronDown className="w-4 h-4 text-white/60" />}
          <span
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="ml-1 px-1.5 py-0.5 rounded text-white/40 hover:text-white hover:bg-white/10 text-xs cursor-pointer"
            data-testid="btn-close-sse-log"
            role="button"
          >✕</span>
        </div>
      </button>
      {!collapsed && (
        <div className="overflow-y-auto px-4 py-2 font-mono text-xs space-y-1" style={{ height: 260 }}>
          {events.length === 0 ? (
            <div className="text-white/30 italic py-2">Waiting for first SSE event…</div>
          ) : events.map(ev => (
            <div key={ev.id} className={`flex items-start gap-2 ${EVENT_COLORS[ev.type] ?? "text-white/50"}`}>
              <span className="shrink-0 text-white/20 tabular-nums">
                {ev.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-white/25 shrink-0">[{(ev.agentName || "system").split(" ")[0]}]</span>
              <span className="text-white/30 shrink-0 uppercase tracking-wide text-[10px] mt-0.5">{ev.type}</span>
              <span className="min-w-0 break-words">{ev.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

export default function HnpGovtDemo() {
  const [scenario,     setScenario]     = useState<ScenarioKey>("happy");
  const [running,      setRunning]      = useState(false);
  const [hasRun,       setHasRun]       = useState(false);
  const [events,       setEvents]       = useState<LiveEvent[]>([]);
  const [showLog,      setShowLog]      = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [liveAgents,   setLiveAgents]   = useState<Record<string, LiveAgent>>({});
  const eventIdRef = useRef(0);
  const evtSrcRef  = useRef<EventSource | null>(null);

  const { data: runs, refetch: refetchRuns } = useQuery<{ agentRuns: any[] }>({
    queryKey: ["/demo-api/hnp-govt/agent-runs", scenario],
    queryFn:  () => fetch(`/demo-api/hnp-govt/agent-runs?scenario=${scenario}`).then(r => r.json()),
    enabled:  hasRun,
    refetchInterval: running ? 2000 : false,
  });

  const startRun = useCallback(() => {
    if (running) return;
    setEvents([]);
    setRunning(true);
    setShowLog(true);
    setLogCollapsed(false);
    setLiveAgents({});
    eventIdRef.current = 0;

    const es = new EventSource(`/demo-api/hnp-govt/live-run?scenario=${scenario}`);
    evtSrcRef.current = es;

    const updateAgent = (externalId: string | undefined, patch: Partial<LiveAgent> | ((prev: LiveAgent) => LiveAgent)) => {
      if (!externalId) return;
      setLiveAgents(prev => {
        const cur: LiveAgent = prev[externalId] ?? { state: "idle", toolCalls: 0 };
        const next: LiveAgent = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
        return { ...prev, [externalId]: next };
      });
    };

    const pushEvent = (eventName: string, raw: any) => {
      const data = typeof raw === "string" ? safeParse(raw) : raw;
      const agentName: string =
        data.agentName ?? data.agent ?? data.externalId ??
        (Array.isArray(data.agents) ? data.agents.join("+") : "") ??
        "system";
      const message: string = formatEventMessage(eventName, data);
      setEvents(prev => [...prev, {
        id:        ++eventIdRef.current,
        type:      eventName,
        agentName: agentName || "system",
        message,
        timestamp: new Date(),
      }]);

      // Drive the agent-card UI directly off SSE — don't wait for the
      // post-run /agent-runs poll, otherwise cards stay "Idle" the whole run.
      const externalId: string | undefined = data.externalId;
      if (eventName === "agent_start") {
        updateAgent(externalId, { state: "running", toolCalls: 0, summary: undefined, startedAt: Date.now() });
      } else if (eventName === "agent_event" && data.type === "tool_call_result") {
        updateAgent(externalId, prev => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
      } else if (eventName === "agent_complete") {
        updateAgent(externalId, prev => ({
          ...prev,
          state:      data.success === false ? "fail" : "ok",
          summary:    data.resultSummary ?? data.summary ?? prev.summary,
          finishedAt: Date.now(),
        }));
      }
    };

    // Backend emits each of these as a NAMED SSE event — EventSource only
    // delivers named events to handlers explicitly registered for that name,
    // so subscribe to every one we know about.
    const NAMED_EVENTS = [
      "run_start", "setup", "approval_gate", "phase_start",
      "agent_start", "agent_event", "agent_complete",
      "audit_trail", "run_complete",
    ];
    NAMED_EVENTS.forEach(name => {
      es.addEventListener(name, (e: MessageEvent) => pushEvent(name, e.data));
    });

    // server-sent "error" event (payload error, NOT a transport error)
    es.addEventListener("error" as any, (e: MessageEvent) => {
      if (e?.data) pushEvent("error", e.data);
    });

    const finish = () => {
      setRunning(false);
      setHasRun(true);
      try { es.close(); } catch {}
      evtSrcRef.current = null;
      refetchRuns();
    };

    es.addEventListener("run_complete", () => setTimeout(finish, 300));
    // EventSource fires onerror when the stream is closed by res.end() —
    // treat that as the run finishing if we already saw run_complete or as a
    // hard transport failure otherwise.
    es.onerror = () => finish();
  }, [running, scenario, refetchRuns]);

  const reset = useCallback(() => {
    if (evtSrcRef.current) { evtSrcRef.current.close(); evtSrcRef.current = null; }
    fetch(`/demo-api/hnp-govt/reset?scenario=${scenario}`, { method: "POST" }).catch(() => {});
    setRunning(false);
    setHasRun(false);
    setEvents([]);
    setShowLog(false);
  }, [scenario]);

  useEffect(() => () => { if (evtSrcRef.current) evtSrcRef.current.close(); }, []);

  const activeScenario = SCENARIOS.find(s => s.key === scenario)!;
  const runsByAgent: Record<string, any> = {};
  (runs?.agentRuns ?? []).forEach((r: any) => {
    const key = r.agentExternalId ?? r.externalId ?? r.agentName ?? "";
    if (key) runsByAgent[key] = r;
  });

  return (
    <div className="flex flex-col min-h-full bg-background" data-testid="page-hnp-govt-demo">
      {/* Header */}
      <div className="border-b bg-background px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>{CLIENT_NAME}</span>
                <span>·</span>
                <span>{PIPELINE}</span>
                <span>·</span>
                <span className="font-mono">SCN-HNP-1</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-hnp-govt">
                {DEMO_TITLE}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                Four live agents on real Claude. Compresses days of manual transcript synthesis
                into a 45-minute investigative brief with full provenance — a reporter approval
                gate sits between angle detection and story drafting.
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={reset}
                disabled={running}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border bg-background text-sm font-medium hover:bg-accent disabled:opacity-40"
                data-testid="btn-reset-demo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={startRun}
                disabled={running}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: HNP_COLOR }}
                data-testid="btn-start-run"
              >
                {running ? <Activity className="w-3.5 h-3.5 animate-pulse" /> : <Play className="w-3.5 h-3.5" />}
                {running ? "Running..." : "Start live run"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario selector */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Scenario</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {SCENARIOS.map(s => (
              <button
                key={s.key}
                onClick={() => !running && setScenario(s.key)}
                disabled={running}
                className={`text-left p-3 rounded-md border bg-background transition disabled:cursor-not-allowed ${scenario === s.key ? "border-purple-500 ring-1 ring-purple-500/30" : "hover:border-foreground/30"}`}
                data-testid={`btn-scenario-${s.key}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium">{s.label}</span>
                  {s.badge && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40 uppercase tracking-wide font-medium">
                      {s.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">{s.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main pipeline */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            {PIPELINE} · Active scenario: {activeScenario.label}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AGENTS.map(a => {
              const polled = runsByAgent[a.externalId];
              const live   = liveAgents[a.externalId];
              const Icon = a.icon;
              // Prefer the live SSE-derived state during the run; fall back to
              // the polled /agent-runs row after the run completes.
              const runState: AgentState =
                live?.state ??
                (polled?.success === true ? "ok"
                 : polled?.success === false ? "fail"
                 : polled ? "running" : "idle");
              const toolCalls = live?.toolCalls ?? polled?.toolCalls;
              const summary   = live?.summary   ?? polled?.summary ?? polled?.message;
              const elapsedMs = live?.startedAt
                ? (live.finishedAt ?? Date.now()) - live.startedAt
                : null;
              const statusText =
                runState === "running" ? "Running on Claude…"
                : runState === "ok"    ? "Completed"
                : runState === "fail"  ? "Failed"
                : running              ? "Queued"
                : "Idle — press Start live run.";
              return (
                <div
                  key={a.externalId}
                  className={`border rounded-lg bg-background p-4 flex flex-col gap-2 min-h-[140px] transition ${
                    runState === "running" ? "border-blue-500/60 ring-1 ring-blue-500/20"
                    : runState === "ok"    ? "border-emerald-500/40"
                    : runState === "fail"  ? "border-red-500/40"
                    : ""
                  }`}
                  data-testid={`card-agent-${a.externalId}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md grid place-items-center" style={{ backgroundColor: `${HNP_COLOR}1a` }}>
                        <Icon className="w-4 h-4" style={{ color: HNP_COLOR }} />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground">{a.externalId}</div>
                        <div className="text-sm font-medium leading-tight">{a.name}</div>
                      </div>
                    </div>
                    {runState === "ok"      && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {runState === "fail"    && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {runState === "running" && <Activity className="w-4 h-4 text-blue-500 animate-pulse" />}
                    {runState === "idle"    && <Clock className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className={`text-xs font-medium ${
                    runState === "running" ? "text-blue-500"
                    : runState === "ok"    ? "text-emerald-600 dark:text-emerald-400"
                    : runState === "fail"  ? "text-red-500"
                    : "text-muted-foreground"
                  }`}>
                    {statusText}
                  </div>
                  {summary && (
                    <div className="text-xs text-muted-foreground line-clamp-3">{summary}</div>
                  )}
                  {(toolCalls != null || elapsedMs != null) && (
                    <div className="mt-auto text-[11px] text-muted-foreground border-t pt-2 flex items-center justify-between">
                      {toolCalls != null && (
                        <span>Tool calls <span className="font-mono ml-1">{toolCalls}</span></span>
                      )}
                      {elapsedMs != null && (
                        <span className="font-mono">{(elapsedMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!hasRun && !running && (
            <div className="mt-8 rounded-lg border bg-muted/20 p-6 text-center">
              <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <div className="text-sm font-medium mb-1">Pick a scenario above and press <span className="font-semibold">Start live run</span></div>
              <div className="text-xs text-muted-foreground max-w-xl mx-auto">
                Real Claude executes all four agents through the platform runtime. Tool calls hit
                mock MCP servers (Hearst Assembly, Knowledge Base, Public Records portal, CMS).
                Agent traces persist to the Agent Registry on each run.
              </div>
            </div>
          )}
        </div>
      </div>

      {showLog && (
        <LiveFeedPanel
          events={events}
          collapsed={logCollapsed}
          onToggleCollapsed={() => setLogCollapsed(v => !v)}
          onClose={() => setShowLog(false)}
        />
      )}
      {!showLog && hasRun && (
        <button
          onClick={() => { setShowLog(true); setLogCollapsed(false); }}
          className="border-t bg-muted/30 hover:bg-muted/60 px-4 py-2 text-xs font-mono text-muted-foreground flex items-center gap-2 transition-colors"
          data-testid="btn-show-sse-log"
        >
          <Terminal className="w-3.5 h-3.5" />
          Show SSE Trace Log ({events.length} events)
          <ChevronUp className="w-3.5 h-3.5 ml-auto" />
        </button>
      )}
    </div>
  );
}
