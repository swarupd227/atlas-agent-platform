import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  Newspaper, FileSearch, Users, FileText, Scale, CheckCircle2,
  AlertTriangle, Clock, ExternalLink,
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
  summary?:  any;
  startedAt?: number;
  finishedAt?: number;
  agentId?:  string;   // platform UUID — populated from agent_start / agent_complete SSE
  currentAction?: string;  // human-readable label for the in-flight tool call / reasoning step
}

function unwrapPayload(s: any): any {
  // Agent 01 returns { emergency_context_brief: {...} }; others return flat shape.
  if (s && typeof s === "object" && s.emergency_context_brief && typeof s.emergency_context_brief === "object") {
    return s.emergency_context_brief;
  }
  return s;
}

// Returns a short, human-readable one-liner for the agent card preview, or
// null if the only candidate is a raw JSON / fenced-markdown blob (in which
// case the caller should fall back to "Output ready — see Pipeline Output").
function summaryOneLine(raw: any): string | null {
  if (!raw) return null;
  const looksLikeJsonBlob = (s: string) =>
    /^\s*```/.test(s) || /^\s*[{[]/.test(s);
  if (typeof raw === "string") {
    if (looksLikeJsonBlob(raw)) return null;
    return raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
  }
  const s = unwrapPayload(raw) || {};
  if (typeof s.summary === "string" && !looksLikeJsonBlob(s.summary)) {
    return s.summary.length > 180 ? s.summary.slice(0, 177) + "…" : s.summary;
  }
  if (typeof s.headline === "string" && !looksLikeJsonBlob(s.headline)) {
    return s.headline.length > 180 ? s.headline.slice(0, 177) + "…" : s.headline;
  }
  return null;
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

// Friendly label for the underlying MCP tool/server. Tool names come through
// the backend as snake_case strings (e.g. "search_transcript_corpus"); we
// humanise them so the trace reads as a real reporter workflow rather than as
// a wall of identifiers.
const TOOL_LABELS: Record<string, string> = {
  search_transcript_corpus:    "Searching meeting transcript corpus",
  get_transcript_by_meeting:   "Pulling full meeting transcript",
  get_official_profile:        "Fetching official profile",
  get_jurisdiction_foia_rules: "Looking up FOIA rules",
  search_prior_requests:       "Checking prior records requests",
  submit_foia_request:         "Filing public-records request",
  get_foia_status:             "Checking records-request status",
  get_agency_officer:          "Identifying agency records officer",
  get_investigative_standards: "Loading newsroom investigative standards",
  publish_to_cms:              "Publishing draft to CMS",
};
const SERVER_LABELS: Record<string, string> = {
  "hnp-assembly":        "Hearst Assembly",
  "hnp-knowledge-base":  "Hearst Knowledge Base",
  "hnp-public-records":  "Public Records portal",
  "hnp-cms":             "CMS",
};
function labelTool(tool?: string)  { return tool   ? (TOOL_LABELS[tool]   ?? tool)   : ""; }
function labelServer(server?: string) { return server ? (SERVER_LABELS[server] ?? server) : ""; }

function formatEventMessage(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""} · ${d.assemblyCorpus?.transcripts ?? "?"} transcripts`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? d.agentName ?? ""} starting${d.model ? ` (${d.model})` : ""}`;
    case "agent_event": {
      // Backend nests tool details under `data` — pull them out so the trace
      // shows the actual MCP tool name + which server, not just "tool_call".
      const sub = d.data ?? {};
      const tool = labelTool(sub.tool);
      const server = labelServer(sub.server);
      const iter = sub.iteration != null ? ` · turn ${sub.iteration}` : "";
      if (d.type === "tool_call") {
        return `→ ${tool || "Tool call"}${server ? ` (${server})` : ""}${iter}`;
      }
      if (d.type === "tool_call_result") {
        const ok = sub.success === false ? " · FAILED" : "";
        const err = sub.error ? ` — ${String(sub.error).slice(0, 160)}` : "";
        return `← ${tool || "Tool result"}${server ? ` (${server})` : ""}${ok}${err}${iter}`;
      }
      if (d.type === "llm_response") {
        const tools = sub.toolsCalled != null ? ` · ${sub.toolsCalled} tool call${sub.toolsCalled === 1 ? "" : "s"}` : "";
        return `Claude reasoning${iter}${tools}`;
      }
      return d.message ?? d.type ?? JSON.stringify(d).slice(0, 200);
    }
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
      return d.message ?? JSON.stringify(d).slice(0, 200);
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

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-300",
  high:     "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
  medium:   "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  low:      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function AgentOutputCard({
  externalId, displayName, icon: Icon, raw,
}: {
  externalId: string;
  displayName: string;
  icon: React.ComponentType<{ className?: string; style?: any }>;
  raw: any;
}) {
  if (!raw) return null;
  const s = unwrapPayload(raw) || {};
  const severity = typeof s.severity === "string" ? s.severity.toLowerCase() : null;
  // Filter out nullish entries so map callbacks below can safely read fields.
  const findings = (Array.isArray(s.findings) ? s.findings : []).filter((x: any) => x != null);
  const actions  = (Array.isArray(s.recommendedActions) ? s.recommendedActions : []).filter((x: any) => x != null);
  const risks    = (Array.isArray(s.riskFactors) ? s.riskFactors : []).filter((x: any) => x != null);
  const records  = (Array.isArray(s.processedRecords) ? s.processedRecords : []).filter(
    (x: any) => x != null && typeof x === "object",
  );

  return (
    <div className="border rounded-lg bg-background p-5" data-testid={`output-${externalId}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <span className="text-xs font-mono text-muted-foreground">{externalId}</span>
        <span className="text-sm font-semibold">{displayName}</span>
        {severity && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded uppercase tracking-wide font-medium ${SEVERITY_COLORS[severity] ?? "bg-muted text-muted-foreground"}`}>
            severity: {severity}
          </span>
        )}
      </div>

      {typeof s.summary === "string" && !/^\s*(```|[{[])/.test(s.summary) && (
        <p className="text-sm text-foreground/90 leading-relaxed mb-4" data-testid={`summary-${externalId}`}>
          {s.summary}
        </p>
      )}

      {findings.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Findings ({findings.length})
          </div>
          <ul className="space-y-2">
            {findings.slice(0, 4).map((f: any, i: number) => (
              <li key={i} className="border rounded p-3 bg-muted/20 text-sm">
                {typeof f === "string" ? (
                  <div>{f}</div>
                ) : (
                  <>
                    {(f.category || f.angle) && (
                      <div className="text-[11px] font-mono text-muted-foreground mb-1">
                        {f.category ?? f.angle}
                      </div>
                    )}
                    {f.observation && <div className="font-medium">{f.observation}</div>}
                    {f.implication && (
                      <div className="text-xs text-muted-foreground mt-1">→ {f.implication}</div>
                    )}
                    {Array.isArray(f.keyQuotes) && f.keyQuotes.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {f.keyQuotes.slice(0, 2).map((q: string, j: number) => (
                          <li key={j} className="text-xs italic text-foreground/80 pl-2 border-l-2 border-muted">
                            {q}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(f.citations != null || f.urgency) && (
                      <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground font-mono">
                        {f.citations != null && <span>{f.citations} citations</span>}
                        {f.urgency && <span>· {f.urgency}</span>}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Recommended actions ({actions.length})
          </div>
          <ul className="space-y-1.5">
            {actions.slice(0, 4).map((a: any, i: number) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                <span>{typeof a === "string" ? a : JSON.stringify(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Risk factors ({risks.length})
          </div>
          <ul className="space-y-1">
            {risks.slice(0, 3).map((r: any, i: number) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-amber-600 dark:text-amber-400 shrink-0">!</span>
                <span>{typeof r === "string" ? r : JSON.stringify(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {records.length > 0 && (
        <details className="border-t border-border/50 pt-3">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground font-medium hover:text-foreground">
            Top processed records ({records.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {records.slice(0, 8).map((r: any, i: number) => (
              <li key={i} className="text-xs flex items-baseline gap-2">
                {r.score != null && (
                  <span className="font-mono tabular-nums text-muted-foreground shrink-0 w-8 text-right">{r.score}</span>
                )}
                <span className="font-medium truncate">{r.name ?? r.id ?? `Record ${i + 1}`}</span>
                {r.decision && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase shrink-0">
                    {r.decision}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PipelineOutputPanel({
  liveAgents, hasRun,
}: {
  liveAgents: Record<string, LiveAgent>;
  hasRun: boolean;
}) {
  const a01 = liveAgents["HNP-GOVT-01"]?.summary;
  const a02 = liveAgents["HNP-GOVT-02"]?.summary;
  const a03 = liveAgents["HNP-GOVT-03"]?.summary;
  const a04 = liveAgents["HNP-GOVT-04"]?.summary;
  const anyOutput = a01 || a02 || a03 || a04;
  if (!hasRun || !anyOutput) return null;

  return (
    <div className="mt-8 space-y-4" data-testid="pipeline-output">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Pipeline Output — Reporter Brief</h2>
      </div>

      <AgentOutputCard externalId="HNP-GOVT-01" displayName="Meeting Corpus Analyst — Hurricane Mara Brief" icon={FileSearch} raw={a01} />
      <AgentOutputCard externalId="HNP-GOVT-02" displayName="Investigation Angle Detector — Ranked Angles" icon={Newspaper} raw={a02} />
      <AgentOutputCard externalId="HNP-GOVT-03" displayName="Story Draft Agent — Sourcing Pack" icon={FileText} raw={a03} />
      <AgentOutputCard externalId="HNP-GOVT-04" displayName="FOIA Request Generator — Texas PIA Filings" icon={Scale} raw={a04} />
    </div>
  );
}

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
  // 200ms wall-clock tick — purely so each card's elapsed counter visibly
  // advances during the run. Without this the elapsed text only re-renders
  // when an SSE event arrives, which makes long Claude reasoning turns feel
  // frozen even though work is happening.
  const [, setNowTick] = useState(0);
  const eventIdRef = useRef(0);
  const evtSrcRef  = useRef<EventSource | null>(null);

  // Server returns { pipeline, agents, scenario } — `agents` (not `agentRuns`)
  // is the correct key. Each row carries agentId + traceUrl so the demo cards
  // can deep-link into the Agent Registry trace.
  const { data: runs, refetch: refetchRuns } = useQuery<{ agents: any[] }>({
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
        updateAgent(externalId, {
          state: "running", toolCalls: 0, summary: undefined,
          startedAt: Date.now(), agentId: data.agentId,
          currentAction: "Initialising on Claude…",
        });
      } else if (eventName === "agent_event") {
        const sub = data.data ?? {};
        if (data.type === "tool_call") {
          // Show what the agent is reaching for right now.
          const tool   = labelTool(sub.tool);
          const server = labelServer(sub.server);
          updateAgent(externalId, prev => ({
            ...prev,
            currentAction: `${tool || "Calling tool"}${server ? ` · ${server}` : ""}`,
          }));
        } else if (data.type === "tool_call_result") {
          updateAgent(externalId, prev => ({
            ...prev,
            toolCalls: prev.toolCalls + 1,
            currentAction: sub.success === false
              ? `Tool failed — ${labelTool(sub.tool) || "unknown tool"}`
              : "Reasoning over results…",
          }));
        } else if (data.type === "llm_response") {
          updateAgent(externalId, prev => ({
            ...prev,
            currentAction: sub.iteration != null
              ? `Reasoning · turn ${sub.iteration}`
              : "Reasoning…",
          }));
        }
      } else if (eventName === "agent_complete") {
        updateAgent(externalId, prev => ({
          ...prev,
          state:      data.success === false ? "fail" : "ok",
          summary:    data.resultSummary ?? data.summary ?? prev.summary,
          finishedAt: Date.now(),
          agentId:    data.agentId ?? prev.agentId,
          currentAction: undefined,
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

  // Drive the per-card elapsed timer while the run is active. Cleared as soon
  // as the run finishes so we don't burn cycles on idle pages.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowTick(n => n + 1), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const activeScenario = SCENARIOS.find(s => s.key === scenario)!;
  const runsByAgent: Record<string, any> = {};
  (runs?.agents ?? []).forEach((r: any) => {
    const key = r.externalId ?? r.agentExternalId ?? r.agentName ?? "";
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
              const summary   = live?.summary   ?? polled?.resultSummary ?? polled?.summary ?? polled?.message;
              const elapsedMs = live?.startedAt
                ? (live.finishedAt ?? Date.now()) - live.startedAt
                : null;
              // Prefer the live SSE-captured agentId, fall back to the row from
              // the post-run /agent-runs poll. Either way we deep-link into the
              // Agent Registry detail page so the user can open the full trace.
              const agentTraceId: string | undefined = live?.agentId ?? polled?.agentId;
              const statusText =
                runState === "running"
                  ? (live?.currentAction ?? "Running on Claude…")
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
                    <div className="text-xs text-muted-foreground line-clamp-3">
                      {summaryOneLine(summary) ?? "Output ready — see Pipeline Output below."}
                    </div>
                  )}
                  {(toolCalls != null || elapsedMs != null) && (
                    <div className="text-[11px] text-muted-foreground border-t pt-2 flex items-center justify-between">
                      {toolCalls != null && (
                        <span>Tool calls <span className="font-mono ml-1">{toolCalls}</span></span>
                      )}
                      {elapsedMs != null && (
                        <span className="font-mono">{(elapsedMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  )}
                  {agentTraceId && (runState === "ok" || runState === "fail") && (
                    <Link
                      href={`/agents/${agentTraceId}`}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 text-[11px] font-medium border rounded px-2 py-1.5 hover:bg-muted/40 hover:border-foreground/30 transition"
                      data-testid={`link-trace-${a.externalId}`}
                    >
                      Open trace in Agent Registry
                      <ExternalLink className="w-3 h-3" />
                    </Link>
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

          <PipelineOutputPanel liveAgents={liveAgents} hasRun={hasRun} />
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
