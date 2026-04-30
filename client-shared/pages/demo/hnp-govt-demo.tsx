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

function LiveFeedPanel({ events, onClose }: { events: LiveEvent[]; onClose: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, collapsed]);

  const colorMap: Record<string, string> = {
    run_start:        "text-blue-400",
    setup:            "text-white/40",
    agent_start:      "text-emerald-400",
    tool_call_result: "text-purple-400",
    llm_response:     "text-white/40",
    agent_complete:   "text-emerald-300",
    run_complete:     "text-emerald-400",
    error:            "text-red-400",
  };

  return (
    <div className="border-t border-border/50 bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 shrink-0">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 min-w-0"
          data-testid="btn-toggle-sse-log"
        >
          <Terminal className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <span className="text-xs text-white/40 font-mono">Agent SSE Trace Log</span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          {collapsed
            ? <ChevronDown className="w-3 h-3 text-white/30 shrink-0 ml-1" />
            : <ChevronUp className="w-3 h-3 text-white/30 shrink-0 ml-1" />}
        </button>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs shrink-0 ml-2" data-testid="btn-close-sse-log">✕</button>
      </div>
      {!collapsed && (
        <div className="overflow-y-auto px-4 py-2 font-mono text-xs space-y-1" style={{ height: 240 }}>
          {events.map(ev => (
            <div key={ev.id} className={`flex items-start gap-2 ${colorMap[ev.type] ?? "text-white/50"}`}>
              <span className="shrink-0 text-white/20 tabular-nums">
                {ev.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-white/25 shrink-0">[{ev.agentName?.split(" ")[0] ?? "system"}]</span>
              <span className="min-w-0 break-all">{ev.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

export default function HnpGovtDemo() {
  const [scenario,   setScenario]   = useState<ScenarioKey>("happy");
  const [running,    setRunning]    = useState(false);
  const [hasRun,     setHasRun]     = useState(false);
  const [events,     setEvents]     = useState<LiveEvent[]>([]);
  const [showLog,    setShowLog]    = useState(false);
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
    eventIdRef.current = 0;

    const es = new EventSource(`/demo-api/hnp-govt/live-run?scenario=${scenario}`);
    evtSrcRef.current = es;

    es.addEventListener("agent_event", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setEvents(prev => [...prev, {
          id:        ++eventIdRef.current,
          type:      data.type ?? "agent_event",
          agentName: data.agentName ?? data.agent ?? "system",
          message:   data.message ?? data.summary ?? JSON.stringify(data).slice(0, 300),
          timestamp: new Date(),
        }]);
      } catch {}
    });

    es.addEventListener("error", () => {
      setRunning(false);
      setHasRun(true);
      es.close();
      evtSrcRef.current = null;
      refetchRuns();
    });

    es.addEventListener("done", () => {
      setRunning(false);
      setHasRun(true);
      es.close();
      evtSrcRef.current = null;
      refetchRuns();
    });
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
              const run = runsByAgent[a.externalId];
              const Icon = a.icon;
              const runState = run?.success === true ? "ok" : run?.success === false ? "fail" : run ? "running" : "idle";
              return (
                <div
                  key={a.externalId}
                  className="border rounded-lg bg-background p-4 flex flex-col gap-3 min-h-[140px]"
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
                    {runState === "ok"   && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {runState === "fail" && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {runState === "running" && <Activity className="w-4 h-4 text-blue-500 animate-pulse" />}
                    {runState === "idle" && <Clock className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-4 min-h-[3.5rem]">
                    {run?.summary ?? run?.message ?? (running ? "Awaiting trace…" : "Idle — start a live run to populate.")}
                  </div>
                  {run?.toolCalls != null && (
                    <div className="text-[11px] text-muted-foreground border-t pt-2 flex items-center justify-between">
                      <span>Tool calls</span>
                      <span className="font-mono">{run.toolCalls}</span>
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

      {showLog && <LiveFeedPanel events={events} onClose={() => setShowLog(false)} />}
    </div>
  );
}
