import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  Users, TrendingDown, Mail, BarChart2, AlertTriangle,
  CheckCircle2, Clock, ExternalLink, ShieldAlert,
} from "lucide-react";

const HNP_COLOR   = "#6B21A8";
const DEMO_TITLE  = "Subscriber Intelligence & Churn Prevention";
const CLIENT_NAME = "Hearst Newspapers";
const PIPELINE    = "HNP-SUBSCRIBER-CHURN-PREVENTION";
const SCN_ID      = "SCN-HNP-2";

type ScenarioKey = "happy" | "editor-modify" | "offer-boundary-breach";

interface LiveEvent {
  id:        number;
  type:      string;
  agentName: string;
  message:   string;
  timestamp: Date;
}

type AgentState = "idle" | "running" | "ok" | "fail";
interface LiveAgent {
  state:          AgentState;
  toolCalls:      number;
  summary?:       any;
  startedAt?:     number;
  finishedAt?:    number;
  agentId?:       string;
  currentAction?: string;
}

// ─── Tool / server humanisation ──────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_cohort_stats:               "Loading subscriber cohort statistics",
  get_engagement_signals:         "Fetching subscriber engagement signals",
  get_subscriber_profile:         "Pulling subscriber profile",
  update_subscriber_segment:      "Updating subscriber segment",
  send_trigger_event:             "Queuing re-engagement trigger event",
  get_churn_score:                "Scoring churn probability",
  get_feature_importance:         "Analysing churn feature importance",
  get_cohort_risk_distribution:   "Loading cohort risk distribution",
  classify_zip_by_storm_impact:   "Classifying zip code by storm impact",
  get_flood_zone_data:            "Fetching flood zone data",
  get_neighbourhood_profile:      "Loading neighbourhood storm profile",
  get_articles_by_interest_profile: "Fetching personalised articles",
  get_recovery_resource_content:  "Pulling county recovery resources",
  get_section_top_stories:        "Loading section top stories",
};

const SERVER_LABELS: Record<string, string> = {
  "hnp-subscriber":  "Subscriber Platform",
  "hnp-churn-model": "Churn Model",
  "hnp-geo":         "Geo Intelligence",
  "hnp-content-api": "Content API",
};

function labelTool(tool?: string)   { return tool   ? (TOOL_LABELS[tool]   ?? tool)   : ""; }
function labelServer(srv?: string)  { return srv    ? (SERVER_LABELS[srv]   ?? srv)   : ""; }

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string }[] = [
  {
    key:         "happy",
    label:       "Happy Path — Full Retention Pipeline",
    description: "Hurricane Mara landfall +24 hours. 64,400 storm-affected Houston Chronicle subscribers identified. SUB-01 classifies into green / amber / red cohorts. SUB-02 runs Harvey-calibrated churn model (23,400 at-risk). Audience Editor approves all three content sequences. SUB-03 queues re-engagement pipeline. SUB-04 sets baseline for outcome tracking.",
  },
  {
    key:         "editor-modify",
    label:       "Exception 1 — Audience Editor Modifies Cohort-B",
    badge:       "Exception",
    description: "Pipeline reaches Audience Editor gate with all three sequences ready. Editor Sarah Chen approves cohorts (a) and (c) but sends cohort (b) back: 'add the Harris County emergency resource links before queuing.' SUB-03 re-fetches the county resources via the Geo MCP, rebuilds the cohort-b template, and re-queues before completing.",
  },
  {
    key:         "offer-boundary-breach",
    label:       "Exception 2 — Offer Authority Boundary Breach",
    badge:       "Exception",
    description: "SUB-03 attempts to activate a 30% subscription discount for critical-tier red subscribers via send_trigger_event. The Offer Authority Boundary policy flags the violation and blocks the event. Pipeline pauses; subscription operations team is notified. Content-only sequences proceed normally.",
  },
];

const AGENTS = [
  { idx: 1, externalId: "HNP-SUB-01", name: "Subscriber Signal Monitor",     icon: Users         },
  { idx: 2, externalId: "HNP-SUB-02", name: "Churn Prediction Engine",        icon: TrendingDown  },
  { idx: 3, externalId: "HNP-SUB-03", name: "Re-engagement Content Generator", icon: Mail          },
  { idx: 4, externalId: "HNP-SUB-04", name: "Retention Outcome Tracker",       icon: BarChart2     },
];

const COHORT_COLORS: Record<string, string> = {
  green: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  red:   "text-red-700 dark:text-red-400",
};
const COHORT_BG: Record<string, string> = {
  green: "bg-emerald-100 dark:bg-emerald-950/40",
  amber: "bg-amber-100 dark:bg-amber-950/40",
  red:   "bg-red-100 dark:bg-red-950/40",
};

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message: s }; }
}

function summaryOneLine(raw: any): string | null {
  if (!raw) return null;
  const looksLikeJsonBlob = (s: string) => /^\s*```/.test(s) || /^\s*[{[]/.test(s);
  if (typeof raw === "string") {
    if (looksLikeJsonBlob(raw)) return null;
    return raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
  }
  if (typeof raw.summary === "string" && !looksLikeJsonBlob(raw.summary)) {
    return raw.summary.length > 180 ? raw.summary.slice(0, 177) + "…" : raw.summary;
  }
  return null;
}

// ─── SSE message formatter ────────────────────────────────────────────────────

function formatEventMessage(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""} · ${d.breakingEvent ?? ""}`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? d.agentName ?? ""} starting`;
    case "agent_event": {
      const sub = d.data ?? {};
      const tool = labelTool(sub.tool);
      const server = labelServer(sub.server);
      const iter = sub.iteration != null ? ` · turn ${sub.iteration}` : "";
      if (d.type === "tool_call") {
        return `→ ${tool || "Tool call"}${server ? ` (${server})` : ""}${iter}`;
      }
      if (d.type === "tool_call_result") {
        const ok  = sub.success === false ? " · FAILED" : "";
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
      return `Agent ${d.externalId ?? d.agentName ?? ""} complete${d.success === false ? " · FAILED" : ""}`;
    case "approval_gate":
      return `Gate: ${d.gate ?? ""} · ${d.editor ?? ""} (${d.role ?? ""}) · action=${d.action ?? "approved"}${d.modification ? ` · MODIFIED: ${String(d.modification).slice(0, 120)}` : ""}`;
    case "policy_violation":
      return `POLICY VIOLATION: ${d.policyName ?? ""} · blocked: ${d.blockedAction ?? ""} · ${d.reason ?? ""}`;
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
  policy_violation: "text-red-400",
  phase_start:      "text-blue-300",
  audit_trail:      "text-cyan-400",
  run_complete:     "text-emerald-400",
  error:            "text-red-400",
};

// ─── Pipeline Output Panel ────────────────────────────────────────────────────

function CohortPill({ label, count, color }: { label: string; count?: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${COHORT_BG[color]} ${COHORT_COLORS[color]}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
      {label}
      {count != null && <span className="font-mono">{count.toLocaleString()}</span>}
    </span>
  );
}

function Sub01OutputCard({ raw }: { raw: any }) {
  if (!raw) return null;
  const cohorts = raw.cohorts ?? {};
  return (
    <div className="border rounded-lg bg-background p-5" data-testid="output-HNP-SUB-01">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <span className="text-xs font-mono text-muted-foreground">HNP-SUB-01</span>
        <span className="text-sm font-semibold">Subscriber Signal Monitor</span>
        {raw.eventContext && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium">
            {raw.eventContext}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="rounded-md bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Total Subscribers</div>
          <div className="text-2xl font-semibold tabular-nums">{(raw.totalSubscribers ?? 280000).toLocaleString()}</div>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Storm-Affected</div>
          <div className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{(raw.stormAffectedCount ?? 64400).toLocaleString()}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {cohorts.green && <CohortPill label="Green" count={cohorts.green.count} color="green" />}
        {cohorts.amber && <CohortPill label="Amber" count={cohorts.amber.count} color="amber" />}
        {cohorts.red   && <CohortPill label="Red"   count={cohorts.red.count}   color="red" />}
      </div>
      {raw.harveyComparison && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-3">
          Harvey pattern: {raw.harveyComparison}
        </p>
      )}
    </div>
  );
}

function Sub02OutputCard({ raw }: { raw: any }) {
  if (!raw) return null;
  const samples = Array.isArray(raw.sampleSubscribers) ? raw.sampleSubscribers : [];
  const summary = raw.cohortSummary ?? {};
  return (
    <div className="border rounded-lg bg-background p-5" data-testid="output-HNP-SUB-02">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <span className="text-xs font-mono text-muted-foreground">HNP-SUB-02</span>
        <span className="text-sm font-semibold">Churn Prediction Engine</span>
        {raw.atRiskCohortTotal && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-medium">
            {(raw.atRiskCohortTotal).toLocaleString()} at-risk
          </span>
        )}
      </div>
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {Object.entries(summary).map(([cohort, data]: any) => (
            <div key={cohort} className={`rounded-md p-3 ${COHORT_BG[cohort] ?? "bg-muted/30"}`}>
              <div className={`text-[10px] uppercase tracking-wide font-medium mb-1 ${COHORT_COLORS[cohort] ?? "text-muted-foreground"}`}>
                {cohort.toUpperCase()} COHORT
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {data.count?.toLocaleString() ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.avgChurnProb30d != null && `30d: ${Math.round(data.avgChurnProb30d * 100)}%`}
                {data.avgChurnProb60d != null && ` · 60d: ${Math.round(data.avgChurnProb60d * 100)}%`}
              </div>
              {data.criticalCount != null && (
                <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                  {data.criticalCount.toLocaleString()} critical
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {samples.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Sample subscribers
          </div>
          <div className="space-y-2">
            {samples.slice(0, 3).map((sub: any, i: number) => (
              <div key={i} className="border rounded p-3 bg-muted/20 text-sm flex items-start gap-3">
                <CohortPill label={sub.cohort} color={sub.cohort} />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{sub.name ?? sub.subscriberId}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sub.primaryDriver}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-mono ml-auto">
                  <span className="text-red-600 dark:text-red-400">{sub.churnProb30d != null ? `${Math.round(sub.churnProb30d * 100)}%` : "—"}</span>
                  <div className="text-muted-foreground">30d churn</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sub03OutputCard({ raw }: { raw: any }) {
  if (!raw) return null;
  const cohortA = raw.cohortA ?? raw["cohort-a"] ?? null;
  const cohortB = raw.cohortB ?? raw["cohort-b"] ?? null;
  const cohortC = raw.cohortC ?? raw["cohort-c"] ?? null;
  return (
    <div className="border rounded-lg bg-background p-5" data-testid="output-HNP-SUB-03">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <span className="text-xs font-mono text-muted-foreground">HNP-SUB-03</span>
        <span className="text-sm font-semibold">Re-engagement Content Generator</span>
        {raw.sequencesGenerated != null && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium">
            {raw.sequencesGenerated} sequences
          </span>
        )}
      </div>
      <div className="space-y-3">
        {[cohortA, cohortB, cohortC].filter(Boolean).map((seq: any, i: number) => {
          const cohortColor = seq.cohort?.includes("amber") ? "amber" : seq.cohort?.includes("red") ? "red" : "green";
          return (
            <div key={i} className={`rounded-md p-3 border ${COHORT_BG[cohortColor]}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className={`text-[10px] uppercase tracking-wide font-medium ${COHORT_COLORS[cohortColor]}`}>
                  Cohort {seq.cohort ?? String.fromCharCode(65 + i)} — {seq.sequenceName}
                </div>
                {seq.queued && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </div>
              {seq.sendTiming && (
                <div className="text-xs text-muted-foreground mb-1">Send timing: {seq.sendTiming}</div>
              )}
              {seq.extensionOffer && (
                <div className="text-xs text-amber-700 dark:text-amber-400 italic mt-1">
                  {seq.extensionOffer}
                </div>
              )}
              {Array.isArray(seq.subjectVariants) && seq.subjectVariants.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {seq.subjectVariants.slice(0, 2).map((v: string, j: number) => (
                    <li key={j} className="text-xs text-foreground/80 pl-2 border-l-2 border-current">{v}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {raw.awaitingAudienceEditorApproval && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          Awaiting Audience Editor approval before activation
        </p>
      )}
    </div>
  );
}

function Sub04OutputCard({ raw }: { raw: any }) {
  if (!raw) return null;
  const baselines = raw.cohortBaselines ?? {};
  return (
    <div className="border rounded-lg bg-background p-5" data-testid="output-HNP-SUB-04">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4" style={{ color: HNP_COLOR }} />
        <span className="text-xs font-mono text-muted-foreground">HNP-SUB-04</span>
        <span className="text-sm font-semibold">Retention Outcome Tracker</span>
        {raw.trackerActive && (
          <span className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Tracking active
          </span>
        )}
      </div>
      {raw.pipelineRunId && (
        <div className="text-xs font-mono text-muted-foreground mb-3">{raw.pipelineRunId}</div>
      )}
      {Object.keys(baselines).length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {Object.entries(baselines).map(([cohort, b]: any) => (
            <div key={cohort} className={`rounded-md p-3 ${COHORT_BG[cohort] ?? "bg-muted/30"}`}>
              <div className={`text-[10px] uppercase font-medium mb-1 ${COHORT_COLORS[cohort] ?? "text-muted-foreground"}`}>
                {cohort.toUpperCase()}
              </div>
              <div className="text-sm font-semibold">{b.count?.toLocaleString() ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5 capitalize">{b.interventionType?.replace(/-/g, " ")}</div>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(raw.outcomeCheckpoints) && (
        <div className="flex flex-wrap gap-2">
          {raw.outcomeCheckpoints.map((cp: any, i: number) => {
            const label = typeof cp === "string"
              ? cp
              : cp?.week != null
                ? `Week ${cp.week}: ${cp.metric}`
                : cp?.day != null
                  ? `Day ${cp.day}: ${cp.metric}`
                  : JSON.stringify(cp);
            return (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">{label}</span>
            );
          })}
        </div>
      )}
      {raw.harveySentinel && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          {raw.harveySentinel}
        </p>
      )}
    </div>
  );
}

function PipelineOutputPanel({
  liveAgents, hasRun,
}: { liveAgents: Record<string, LiveAgent>; hasRun: boolean }) {
  const a01 = liveAgents["HNP-SUB-01"]?.summary;
  const a02 = liveAgents["HNP-SUB-02"]?.summary;
  const a03 = liveAgents["HNP-SUB-03"]?.summary;
  const a04 = liveAgents["HNP-SUB-04"]?.summary;
  if (!hasRun || !(a01 || a02 || a03 || a04)) return null;

  return (
    <div className="mt-8 space-y-4" data-testid="pipeline-output">
      <div className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
        <BarChart2 className="w-4 h-4" style={{ color: HNP_COLOR }} />
        Pipeline Output — Subscriber Intelligence Brief
      </div>
      {a01 && <Sub01OutputCard raw={a01} />}
      {a02 && <Sub02OutputCard raw={a02} />}
      {a03 && <Sub03OutputCard raw={a03} />}
      {a04 && <Sub04OutputCard raw={a04} />}
    </div>
  );
}

// ─── SSE trace log ────────────────────────────────────────────────────────────

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
          {collapsed ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function HnpSubDemo() {
  const [scenario,     setScenario]     = useState<ScenarioKey>("happy");
  const [running,      setRunning]      = useState(false);
  const [hasRun,       setHasRun]       = useState(false);
  const [events,       setEvents]       = useState<LiveEvent[]>([]);
  const [showLog,      setShowLog]      = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [liveAgents,   setLiveAgents]   = useState<Record<string, LiveAgent>>({});
  const [policyAlert,  setPolicyAlert]  = useState<any>(null);
  const [, setNowTick] = useState(0);
  const eventIdRef = useRef(0);
  const evtSrcRef  = useRef<EventSource | null>(null);

  const { data: runs, refetch: refetchRuns } = useQuery<{ agents: any[] }>({
    queryKey: ["/demo-api/hnp-sub/agent-runs", scenario],
    queryFn:  () => fetch(`/demo-api/hnp-sub/agent-runs?scenario=${scenario}`).then(r => r.json()),
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
    setPolicyAlert(null);
    eventIdRef.current = 0;

    const es = new EventSource(`/demo-api/hnp-sub/live-run?scenario=${scenario}`);
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
        (Array.isArray(data.agents) ? data.agents.join("+") : "") ?? "system";
      const message: string = formatEventMessage(eventName, data);
      setEvents(prev => [...prev, {
        id:        ++eventIdRef.current,
        type:      eventName,
        agentName: agentName || "system",
        message,
        timestamp: new Date(),
      }]);

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
              ? `Tool failed — ${labelTool(sub.tool) || "unknown"}`
              : "Reasoning over results…",
          }));
        } else if (data.type === "llm_response") {
          updateAgent(externalId, prev => ({
            ...prev,
            currentAction: sub.iteration != null ? `Reasoning · turn ${sub.iteration}` : "Reasoning…",
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
      } else if (eventName === "policy_violation") {
        setPolicyAlert(data);
      }
    };

    const NAMED_EVENTS = [
      "run_start", "setup", "approval_gate", "policy_violation", "phase_start",
      "agent_start", "agent_event", "agent_complete",
      "audit_trail", "run_complete",
    ];
    NAMED_EVENTS.forEach(name => {
      es.addEventListener(name, (e: MessageEvent) => pushEvent(name, e.data));
    });
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
    es.onerror = () => finish();
  }, [running, scenario, refetchRuns]);

  const reset = useCallback(() => {
    if (evtSrcRef.current) { evtSrcRef.current.close(); evtSrcRef.current = null; }
    fetch(`/demo-api/hnp-sub/reset?scenario=${scenario}`, { method: "POST" }).catch(() => {});
    setRunning(false);
    setHasRun(false);
    setEvents([]);
    setShowLog(false);
    setPolicyAlert(null);
    setLiveAgents({});
  }, [scenario]);

  useEffect(() => () => { if (evtSrcRef.current) evtSrcRef.current.close(); }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowTick(n => n + 1), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const runsByAgent: Record<string, any> = {};
  (runs?.agents ?? []).forEach((r: any) => {
    const key = r.externalId ?? r.agentExternalId ?? r.agentName ?? "";
    if (key) runsByAgent[key] = r;
  });

  const activeScenario = SCENARIOS.find(s => s.key === scenario)!;

  // Pipeline stage logic (mirrors backend pipeline)
  const stageForAgent: Record<string, number> = {
    "HNP-SUB-01": 1,
    "HNP-SUB-02": 2,
    "HNP-SUB-03": 4,
    "HNP-SUB-04": 4,
  };

  return (
    <div className="flex flex-col min-h-full bg-background" data-testid="page-hnp-sub-demo">
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
                <span className="font-mono">{SCN_ID}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-hnp-sub">
                {DEMO_TITLE}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                Four live agents on real Claude. Hurricane Mara landfall +24h — 64,400 storm-affected
                subscribers, Harvey-calibrated churn model, and an Audience Editor gate before any
                re-engagement sequence activates.
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
                {running ? "Running…" : "Start live run"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario selector */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Scenario</div>
          <div className="flex flex-wrap gap-3">
            {SCENARIOS.map(s => (
              <button
                key={s.key}
                onClick={() => { if (!running) { setScenario(s.key as ScenarioKey); reset(); } }}
                disabled={running}
                data-testid={`btn-scenario-${s.key}`}
                className={`flex flex-col items-start text-left px-4 py-3 rounded-lg border text-sm transition-colors disabled:opacity-40 max-w-xs
                  ${scenario === s.key
                    ? "border-purple-600 bg-purple-50 dark:bg-purple-950/20"
                    : "border-border hover:bg-accent"
                  }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{s.label}</span>
                  {s.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Policy violation banner */}
          {policyAlert && (
            <div className="mb-6 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 flex gap-3" data-testid="policy-violation-banner">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                  Policy Violation Blocked — {policyAlert.policyName}
                </div>
                <div className="text-xs text-red-700 dark:text-red-400 mb-1">
                  <strong>Blocked action:</strong> {policyAlert.blockedAction}
                </div>
                <div className="text-xs text-red-700/80 dark:text-red-400/80">
                  {policyAlert.reason}
                </div>
                {policyAlert.resolution && (
                  <div className="text-xs text-muted-foreground mt-2 italic">
                    Resolution: {policyAlert.resolution}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pipeline stage indicators */}
          <div className="flex items-center gap-2 mb-8 text-xs text-muted-foreground overflow-x-auto pb-2">
            {[
              { label: "Stage 1", name: "Signal Monitor",  ids: ["HNP-SUB-01"] },
              { label: "Stage 2", name: "Churn Prediction", ids: ["HNP-SUB-02"] },
              { label: "Gate",    name: "Audience Editor",  ids: [] },
              { label: "Stage 4", name: "Content + Tracker", ids: ["HNP-SUB-03", "HNP-SUB-04"] },
            ].map((stage, si) => {
              const allDone = stage.ids.length > 0 && stage.ids.every(id => liveAgents[id]?.state === "ok");
              const anyRunning = stage.ids.some(id => liveAgents[id]?.state === "running");
              return (
                <div key={si} className="flex items-center gap-2 shrink-0">
                  {si > 0 && <div className="w-6 h-px bg-border" />}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium
                    ${allDone      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                    : anyRunning   ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                    : stage.ids.length === 0 ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground"}`}
                  >
                    {allDone      && <CheckCircle2 className="w-3 h-3" />}
                    {anyRunning   && <Activity className="w-3 h-3 animate-pulse" />}
                    {!allDone && !anyRunning && <Clock className="w-3 h-3" />}
                    {stage.label} · {stage.name}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agent cards */}
          <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
            {AGENTS.map(agent => {
              const live = liveAgents[agent.externalId] ?? { state: "idle", toolCalls: 0 };
              const runRow = runsByAgent[agent.externalId];
              const agentId = live.agentId ?? runRow?.agentId ?? null;
              const elapsed = live.startedAt && live.state === "running"
                ? Math.floor((Date.now() - live.startedAt) / 1000)
                : live.startedAt && live.finishedAt
                  ? Math.floor((live.finishedAt - live.startedAt) / 1000)
                  : null;

              const stateColors: Record<AgentState, string> = {
                idle:    "border-border",
                running: "border-purple-500 dark:border-purple-400",
                ok:      "border-emerald-500 dark:border-emerald-400",
                fail:    "border-red-500 dark:border-red-400",
              };

              const oneline = summaryOneLine(live.summary);

              return (
                <div
                  key={agent.externalId}
                  className={`border-2 rounded-lg p-4 flex flex-col gap-2 transition-colors ${stateColors[live.state]}`}
                  data-testid={`card-agent-${agent.externalId}`}
                >
                  <div className="flex items-center gap-2">
                    <agent.icon className="w-4 h-4 shrink-0" style={{ color: HNP_COLOR }} />
                    <span className="text-[10px] font-mono text-muted-foreground">{agent.externalId}</span>
                    {live.state === "running" && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-purple-500 animate-pulse shrink-0" />
                    )}
                    {live.state === "ok" && (
                      <CheckCircle2 className="ml-auto w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    {live.state === "fail" && (
                      <AlertTriangle className="ml-auto w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-sm font-medium leading-tight">{agent.name}</div>
                  <div className="text-[11px] text-muted-foreground min-h-[2.5rem]">
                    {live.state === "running" && live.currentAction
                      ? live.currentAction
                      : live.state === "ok"
                        ? oneline ?? "Output ready — see Pipeline Output"
                        : live.state === "fail"
                          ? "Run failed"
                          : live.state === "idle" && hasRun
                            ? "Idle"
                            : "Waiting…"}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-auto">
                    <span>{live.toolCalls > 0 ? `${live.toolCalls} tool call${live.toolCalls === 1 ? "" : "s"}` : "—"}</span>
                    {elapsed != null && (
                      <span className="font-mono">{elapsed}s</span>
                    )}
                  </div>
                  {agentId && (
                    <a
                      href={`/agents/${agentId}`}
                      className="mt-1 text-[10px] flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline"
                      data-testid={`link-agent-registry-${agent.externalId}`}
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      View in Agent Registry
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {!running && !hasRun && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: HNP_COLOR + "20" }}>
                <TrendingDown className="w-7 h-7" style={{ color: HNP_COLOR }} />
              </div>
              <h2 className="text-lg font-semibold mb-2">Ready to run subscriber intelligence</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Hurricane Mara has made landfall. Select a scenario above and click <strong>Start live run</strong> to activate the four-agent churn prevention pipeline on real Claude.
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                {["280K subscribers", "64,400 storm-affected", "Harvey-calibrated model", "Audience Editor gate", "3 scenarios"].map(t => (
                  <span key={t} className="px-2.5 py-1 rounded-full bg-muted border">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline output */}
          <PipelineOutputPanel liveAgents={liveAgents} hasRun={hasRun} />
        </div>
      </div>

      {/* SSE trace log */}
      {showLog && (
        <LiveFeedPanel
          events={events}
          collapsed={logCollapsed}
          onToggleCollapsed={() => setLogCollapsed(c => !c)}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}
