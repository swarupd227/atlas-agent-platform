import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  BookOpen, CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Package, ShieldCheck, ShieldAlert, ShieldOff, Tag, FileText,
  ArrowUpCircle, Info,
} from "lucide-react";

const MCG_COLOR  = "#003087";
const MCG_RED    = "#E31837";
const DEMO_TITLE = "Knowledge Base Onboarding";
const CLIENT     = "MCG Health";
const PIPELINE   = "MCG-HEALTH-KB-INGEST";

type ScenarioKey = "happy" | "prohibited-term" | "missing-hash";
type AgentState  = "idle" | "running" | "ok" | "fail";

interface LiveEvent {
  id:        number;
  type:      string;
  agentName: string;
  message:   string;
  timestamp: Date;
}

interface AgentRun {
  externalId:   string;
  name:         string;
  agentId?:     string;
  deploymentId?: string;
  state:        AgentState;
  toolCalls:    number;
  summary?:     any;
  startedAt?:   number;
  finishedAt?:  number;
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message: s }; }
}

const TOOL_LABELS: Record<string, string> = {
  extract_brand_policy:    "Extracting brand policy",
  extract_language_policy: "Extracting language policy",
  extract_segment_lexicon: "Extracting segment lexicon",
  extract_naming_aliases:  "Extracting naming aliases",
  extract_dictionary_index:"Extracting dictionary index",
  extract_theme_tokens:    "Extracting theme tokens",
  derive_qa_rules:         "Deriving QA rules",
  produce_bundle:          "Producing knowledge bundle",
  run_qa_check:            "Running QA validation",
  promote_bundle:          "Promoting bundle to ACTIVE",
};
const SERVER_LABELS: Record<string, string> = {
  "mcg-knowledge-base": "MCG Knowledge Base",
  "mcg-bundle-store":   "Atlas Bundle Store",
};
function labelTool(t?: string)   { return t ? (TOOL_LABELS[t]   ?? t) : ""; }
function labelServer(s?: string) { return s ? (SERVER_LABELS[s] ?? s) : ""; }

const EXTRACTION_NODES = [
  "extract_brand_policy",
  "extract_language_policy",
  "extract_segment_lexicon",
  "extract_naming_aliases",
  "extract_dictionary_index",
  "extract_theme_tokens",
  "derive_qa_rules",
  "produce_bundle",
];

const ARTIFACT_NAMES = [
  "brand_policy", "language_policy", "segment_lexicon", "naming_alias_map",
  "dictionary_index", "theme_tokens", "qa_rules", "source_provenance",
  "token_usage", "passed_qa", "qa_score", "schema_version",
];

const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string }[] = [
  {
    key:         "happy",
    label:       "Happy Path — Full KB Ingestion",
    description: "MCG Brand Style Guide + Clinical Dictionary ingested across 7 extraction nodes. Bundle produces all 12 artifacts. QA passes at 97.4/100. 1 soft warning (missing SHA-256). Human Promote gate appears.",
  },
  {
    key:         "prohibited-term",
    label:       "Exception: Prohibited Term Detected",
    badge:       "Exception",
    description: "Brand guide content contains 'Milliman Care Guidelines' used as an approved alias. QA check detects this as a hard-block violation. Bundle is QA_BLOCKED — cannot be promoted until corrected.",
  },
  {
    key:         "missing-hash",
    label:       "Exception: Missing Source Hash",
    badge:       "Exception",
    description: "Source documents ingested without SHA-256 hashes. QA passes with score 71.2 and 2 warnings. Human must acknowledge the reduced reproducibility guarantee before promotion.",
  },
];

function formatEvent(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""} · ${d.extraction_nodes ?? 7} extraction nodes · ${d.bundle_artifacts ?? 12} bundle artifacts`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? ""} starting${d.model ? ` (${d.model})` : ""}`;
    case "agent_event": {
      const sub = d.data ?? {};
      const tool   = labelTool(sub.tool);
      const server = labelServer(sub.server);
      const iter   = sub.iteration != null ? ` · turn ${sub.iteration}` : "";
      if (d.type === "tool_call") return `→ ${tool || "Tool call"}${server ? ` (${server})` : ""}${iter}`;
      if (d.type === "tool_call_result") {
        const ok  = sub.success === false ? " · FAILED" : "";
        const err = sub.error ? ` — ${String(sub.error).slice(0, 160)}` : "";
        return `← ${tool || "Tool result"}${server ? ` (${server})` : ""}${ok}${err}${iter}`;
      }
      if (d.type === "llm_response") {
        const tc = sub.toolsCalled != null ? ` · ${sub.toolsCalled} tool call${sub.toolsCalled === 1 ? "" : "s"}` : "";
        return `Claude reasoning${iter}${tc}`;
      }
      return d.message ?? d.type ?? JSON.stringify(d).slice(0, 200);
    }
    case "agent_complete":
      return `Agent ${d.externalId ?? ""} complete · ${d.toolCalls ?? 0} tool calls${d.success === false ? " · FAILED" : ""}`;
    case "qa_gate":
      return `QA Gate · status: ${d.status ?? ""} · score: ${d.qa_score ?? "?"} · hard violations: ${d.hard_violations_count ?? 0} · warnings: ${d.soft_warnings_count ?? 0}`;
    case "promotion_gate":
      return `Promotion Gate · bundle: ${d.bundle_id ?? ""} · awaiting human reviewer (${d.reviewer ?? ""})`;
    case "phase_start":
      return `Phase ${d.phase ?? ""} → ${d.agent ?? ""}`;
    case "audit_trail":
      return d.message ?? "Audit trail captured";
    case "run_complete":
      return d.message ?? `Run complete · scenario: ${d.scenario ?? ""}`;
    case "error":
      return `ERROR: ${d.message ?? "unknown"}`;
    default:
      return d.message ?? JSON.stringify(d).slice(0, 200);
  }
}

const EVENT_COLORS: Record<string, string> = {
  run_start:       "text-blue-400",
  setup:           "text-white/40",
  agent_start:     "text-emerald-400",
  agent_event:     "text-purple-400",
  agent_complete:  "text-emerald-300",
  qa_gate:         "text-amber-400",
  promotion_gate:  "text-cyan-300",
  phase_start:     "text-blue-300",
  audit_trail:     "text-cyan-400",
  run_complete:    "text-emerald-400",
  error:           "text-red-400",
};

// ─── Extraction node progress tracker ─────────────────────────────────────────
function extractionNodeFromTool(tool?: string): string | null {
  if (!tool) return null;
  if (EXTRACTION_NODES.includes(tool)) return tool;
  return null;
}

export default function McgKbDemo() {
  const [scenario, setScenario] = useState<ScenarioKey>("happy");
  const [running, setRunning]   = useState(false);
  const [logOpen, setLogOpen]   = useState(true);
  const [events, setEvents]     = useState<LiveEvent[]>([]);
  const [evtCounter, setEvtCounter] = useState(0);
  const [agentRun, setAgentRun] = useState<AgentRun>({
    externalId: "MCG-KB-INGEST-001",
    name:       "Knowledge Base Ingestion Agent",
    state:      "idle",
    toolCalls:  0,
  });
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [qaResult, setQaResult]             = useState<any>(null);
  const [promotionGate, setPromotionGate]   = useState<any>(null);
  const [runComplete, setRunComplete]        = useState<any>(null);
  const [promoting, setPromoting]           = useState(false);

  const esRef      = useRef<EventSource | null>(null);
  const logEndRef  = useRef<HTMLDivElement | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const addEvent = useCallback((type: string, d: any) => {
    counterRef.current += 1;
    const id = counterRef.current;
    setEvtCounter(id);
    const message = formatEvent(type, d);
    setEvents(prev => [...prev, { id, type, agentName: d.agentName ?? d.externalId ?? "", message, timestamp: new Date() }]);
  }, []);

  const handleRun = useCallback(() => {
    if (running) return;
    esRef.current?.close();

    setRunning(true);
    setEvents([]);
    setCompletedNodes(new Set());
    setQaResult(null);
    setPromotionGate(null);
    setRunComplete(null);
    counterRef.current = 0;
    setAgentRun(prev => ({ ...prev, state: "idle", toolCalls: 0, summary: undefined, startedAt: undefined, finishedAt: undefined }));

    const es = new EventSource(`/demo-api/mcg-kb/live-run?scenario=${scenario}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const d = safeParse(e.data);
      addEvent("message", d);
    };

    const handle = (name: string) => {
      es.addEventListener(name, (e: any) => {
        const d = safeParse(e.data);
        addEvent(name, d);

        if (name === "agent_start") {
          setAgentRun(prev => ({
            ...prev,
            state: "running",
            agentId: d.agentId,
            deploymentId: d.deploymentId,
            startedAt: Date.now(),
          }));
        }
        if (name === "agent_event") {
          if (d.type === "tool_call_result" && d.data?.success !== false) {
            const node = extractionNodeFromTool(d.data?.tool);
            if (node) setCompletedNodes(prev => new Set([...prev, node]));
          }
          if (d.type === "tool_call_result") {
            setAgentRun(prev => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
          }
        }
        if (name === "agent_complete") {
          setAgentRun(prev => ({
            ...prev,
            state: d.success === false ? "fail" : "ok",
            finishedAt: Date.now(),
            summary: d.resultSummary,
          }));
        }
        if (name === "qa_gate") {
          setQaResult(d);
        }
        if (name === "promotion_gate") {
          setPromotionGate(d);
        }
        if (name === "run_complete") {
          setRunComplete(d);
          setRunning(false);
          es.close();
        }
        if (name === "error") {
          setRunning(false);
          es.close();
        }
      });
    };

    ["run_start", "setup", "agent_start", "agent_event", "agent_complete",
     "qa_gate", "promotion_gate", "phase_start", "audit_trail", "run_complete", "error",
    ].forEach(handle);

    es.onerror = () => { setRunning(false); es.close(); };
  }, [running, scenario, addEvent]);

  const handleReset = useCallback(async () => {
    esRef.current?.close();
    setRunning(false);
    setEvents([]);
    setCompletedNodes(new Set());
    setQaResult(null);
    setPromotionGate(null);
    setRunComplete(null);
    setAgentRun({ externalId: "MCG-KB-INGEST-001", name: "Knowledge Base Ingestion Agent", state: "idle", toolCalls: 0 });
    await fetch("/demo-api/mcg-kb/reset", { method: "POST" }).catch(() => {});
  }, []);

  const handlePromote = useCallback(async () => {
    if (!promotionGate?.bundle_id || promoting) return;
    setPromoting(true);
    try {
      const res = await fetch("/api/mock/mcg-bundle-store/promote-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_id: promotionGate.bundle_id, promoted_by: "Knowledge Management Lead", acknowledgement: "Reviewer acknowledges QA warnings and approves bundle for production use." }),
      });
      const data = await res.json();
      addEvent("promote_action", { message: `Bundle ${data.bundle_id} promoted to ACTIVE by ${data.promoted_by}. ${data.downstream_agents_notified?.length ?? 0} downstream agents notified.` });
      setPromotionGate(null);
    } catch {
      addEvent("error", { message: "Promotion request failed." });
    } finally {
      setPromoting(false);
    }
  }, [promotionGate, promoting, addEvent]);

  const { data: agentRunsData } = useQuery({
    queryKey: ["/demo-api/mcg-kb/agent-runs"],
    refetchInterval: running ? 3000 : false,
  });

  const agentRegistryId = (agentRunsData as any)?.[0]?.agentId ?? agentRun.agentId;

  const scenarioDef = SCENARIOS.find(s => s.key === scenario)!;
  const elapsedSec  = agentRun.startedAt && agentRun.finishedAt
    ? ((agentRun.finishedAt - agentRun.startedAt) / 1000).toFixed(1)
    : agentRun.startedAt && running
      ? null
      : null;

  const qaStatusColor = !qaResult ? "" :
    qaResult.status === "QA_BLOCKED" ? "text-red-400" :
    qaResult.status === "QA_WARN"    ? "text-amber-400" :
    "text-emerald-400";

  const qaStatusIcon = !qaResult ? null :
    qaResult.status === "QA_BLOCKED" ? <ShieldOff   className="w-4 h-4 text-red-400" /> :
    qaResult.status === "QA_WARN"    ? <ShieldAlert  className="w-4 h-4 text-amber-400" /> :
    <ShieldCheck className="w-4 h-4 text-emerald-400" />;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: MCG_COLOR }}>
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{CLIENT}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs font-mono text-muted-foreground">{PIPELINE}</span>
              </div>
              <h1 className="text-lg font-bold leading-tight">{DEMO_TITLE}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border hover:bg-muted/40 disabled:opacity-40 transition-colors"
              data-testid="button-reset"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
              style={{ background: running ? "#6b7280" : MCG_COLOR }}
              data-testid="button-run"
            >
              {running
                ? <><Activity className="w-4 h-4 animate-pulse" /> Running…</>
                : <><Play className="w-4 h-4" /> Run Demo</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Description ──────────────────────────────────────────────────────── */}
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Live agent ingests MCG Brand Style Guide + Clinical Dictionary. Runs 7 structured extraction nodes, 
          produces a 12-artifact typed JSON bundle, validates via QA check, and surfaces a human promotion gate.
          Manual review required before any proposal agent can be bound to the bundle.
        </p>

        {/* ── Scenario selector ─────────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Scenario</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SCENARIOS.map(s => (
              <button
                key={s.key}
                onClick={() => !running && setScenario(s.key)}
                disabled={running}
                data-testid={`scenario-${s.key}`}
                className={`text-left rounded-lg border p-4 transition-all ${
                  scenario === s.key
                    ? "border-2 bg-muted/20"
                    : "border-border hover:border-muted-foreground/40"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={scenario === s.key ? { borderColor: MCG_COLOR } : {}}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">{s.label}</span>
                  {s.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                          style={{ background: MCG_RED + "22", color: MCG_RED }}>
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Pipeline header ───────────────────────────────────────────────────── */}
        <div className="border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
            {PIPELINE} · Active Scenario: {scenarioDef.label}
          </div>
          <div className="flex items-center gap-4">
            {/* Agent card */}
            <div className={`flex-1 rounded-lg border p-4 transition-colors ${
              agentRun.state === "running" ? "border-blue-500/50 bg-blue-500/5" :
              agentRun.state === "ok"      ? "border-emerald-500/50 bg-emerald-500/5" :
              agentRun.state === "fail"    ? "border-red-500/50 bg-red-500/5" :
              "border-border"
            }`} data-testid="agent-card-MCG-KB-INGEST-001">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" style={{ color: MCG_COLOR }} />
                  <span className="text-[10px] font-mono text-muted-foreground">MCG-KB-INGEST-001</span>
                </div>
                {agentRegistryId && (
                  <Link href={`/agents/${agentRegistryId}`}>
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">
                      <ExternalLink className="w-3 h-3" /> Registry
                    </span>
                  </Link>
                )}
              </div>
              <div className="text-sm font-medium mb-1">Knowledge Base Ingestion Agent</div>
              {agentRun.state === "running" && (
                <div className="flex items-center gap-1.5 text-xs text-blue-400">
                  <Activity className="w-3 h-3 animate-pulse" />
                  Running on Claude…
                  {agentRun.toolCalls > 0 && <span className="text-muted-foreground">· {agentRun.toolCalls} tool calls</span>}
                </div>
              )}
              {agentRun.state === "ok" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Complete · {agentRun.toolCalls} tool calls{elapsedSec ? ` · ${elapsedSec}s` : ""}
                </div>
              )}
              {agentRun.state === "fail" && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle className="w-3 h-3" /> Failed
                </div>
              )}
              {agentRun.state === "idle" && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Idle
                </div>
              )}
            </div>

            {/* Extraction node progress */}
            <div className="w-80 shrink-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">
                Extraction Nodes ({completedNodes.size}/8)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {EXTRACTION_NODES.map(node => {
                  const done = completedNodes.has(node);
                  const shortLabel = node.replace(/^(extract_|derive_|produce_)/, "").replace(/_/g, " ");
                  return (
                    <div key={node}
                      className={`text-[10px] px-2 py-1 rounded font-mono truncate transition-colors ${
                        done
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-muted/20 text-muted-foreground border border-transparent"
                      }`}
                      data-testid={`node-${node}`}
                    >
                      {done ? "✓ " : "· "}{shortLabel}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── QA Gate result ────────────────────────────────────────────────────── */}
        {qaResult && (
          <div className={`border rounded-lg p-5 ${
            qaResult.status === "QA_BLOCKED" ? "border-red-500/50 bg-red-500/5" :
            qaResult.status === "QA_WARN"    ? "border-amber-500/50 bg-amber-500/5" :
            "border-emerald-500/50 bg-emerald-500/5"
          }`} data-testid="qa-result-panel">
            <div className="flex items-center gap-3 mb-4">
              {qaStatusIcon}
              <span className={`font-semibold text-sm ${qaStatusColor}`}>
                QA {qaResult.status?.replace("_", " ") ?? ""}
              </span>
              {qaResult.qa_score != null && (
                <span className={`text-2xl font-bold tabular-nums ${qaStatusColor}`}>
                  {qaResult.qa_score}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
              )}
              {qaResult.bundle_id && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  Bundle: {qaResult.bundle_id}
                </span>
              )}
            </div>

            {qaResult.hard_violations_count > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-red-400 font-medium mb-1">
                  Hard Violations ({qaResult.hard_violations_count})
                </div>
                <div className="text-xs text-red-300 bg-red-950/20 border border-red-500/20 rounded p-3">
                  {agentRun.summary?.hard_violations?.map((v: any, i: number) => (
                    <div key={i} className="mb-1 last:mb-0">
                      <span className="font-mono">[{v.rule_id ?? v.rule}]</span> {v.detail ?? v.description}
                      {v.remediation && <div className="text-red-400/70 mt-0.5">→ {v.remediation}</div>}
                    </div>
                  )) ?? <span>{qaResult.narrative}</span>}
                </div>
              </div>
            )}

            {qaResult.soft_warnings_count > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-1">
                  Warnings ({qaResult.soft_warnings_count})
                </div>
                <div className="text-xs text-amber-300/80 bg-amber-950/10 border border-amber-500/20 rounded p-3">
                  {agentRun.summary?.soft_warnings?.map((w: any, i: number) => (
                    <div key={i} className="mb-1 last:mb-0">
                      <span className="font-mono">[{w.rule_id ?? w.rule}]</span> {w.detail ?? w.description}
                    </div>
                  )) ?? <span>{qaResult.narrative}</span>}
                </div>
              </div>
            )}

            {qaResult.hard_violations_count === 0 && qaResult.soft_warnings_count === 0 && (
              <p className="text-xs text-emerald-300/80">{qaResult.narrative}</p>
            )}
          </div>
        )}

        {/* ── Bundle artifacts grid ─────────────────────────────────────────────── */}
        {agentRun.state === "ok" && agentRun.summary && (
          <div className="border rounded-lg p-5" data-testid="bundle-artifacts">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4" style={{ color: MCG_COLOR }} />
              <span className="font-semibold text-sm">Bundle Artifacts</span>
              <span className="text-xs text-muted-foreground">
                {agentRun.summary.artifacts_in_bundle ?? 12} / 12 required
              </span>
              {agentRun.summary.bundle_id && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {agentRun.summary.bundle_id} · v1.0.0
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {ARTIFACT_NAMES.map(name => (
                <div key={name}
                  className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded border border-emerald-500/25 bg-emerald-500/8"
                  data-testid={`artifact-${name}`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-foreground/80 font-mono truncate">{name}</span>
                </div>
              ))}
            </div>

            {/* Segment lexicon preview */}
            {agentRun.summary.summary && (
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{agentRun.summary.summary}</p>
            )}
          </div>
        )}

        {/* ── Human Promotion Gate ──────────────────────────────────────────────── */}
        {promotionGate && (
          <div className="border border-cyan-500/50 bg-cyan-500/5 rounded-lg p-5" data-testid="promotion-gate">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-sm text-cyan-300">Human Bundle Promotion Gate</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Bundle <span className="font-mono text-foreground">{promotionGate.bundle_id}</span> has passed QA
              {promotionGate.qa_score != null && ` (score: ${promotionGate.qa_score}/100)`} and is awaiting
              promotion by <strong>{promotionGate.reviewer}</strong>. Until promoted, no proposal agent can
              be bound to this bundle. Promotion is immutably recorded in the audit trail.
            </p>
            {promotionGate.requires_acknowledgement && (
              <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded p-3 mb-4">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>This bundle has QA warnings (missing source hashes). By promoting, you acknowledge the reduced reproducibility guarantee.</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePromote}
                disabled={promoting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50 transition-opacity"
                style={{ background: MCG_COLOR }}
                data-testid="button-promote"
              >
                {promoting
                  ? <><Activity className="w-4 h-4 animate-pulse" /> Promoting…</>
                  : <><ArrowUpCircle className="w-4 h-4" /> Promote Bundle to ACTIVE</>}
              </button>
              <span className="text-xs text-muted-foreground">Requires: {promotionGate.policy_ref}</span>
            </div>
          </div>
        )}

        {/* ── SSE Trace Log ─────────────────────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden" data-testid="sse-trace-log">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
            onClick={() => setLogOpen(o => !o)}
            data-testid="button-toggle-log"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-mono font-medium uppercase tracking-wide text-muted-foreground">
                Agent SSE Trace Log
              </span>
              {events.length > 0 && (
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">
                  {events.length}
                </span>
              )}
            </div>
            {logOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {logOpen && (
            <div className="bg-black/90 font-mono text-xs p-4 h-72 overflow-y-auto">
              {events.length === 0 && (
                <div className="text-white/20 italic">Run the demo to see live agent SSE trace…</div>
              )}
              {events.map(ev => (
                <div key={ev.id} className="flex gap-2 mb-0.5 leading-relaxed">
                  <span className="text-white/25 shrink-0 tabular-nums">
                    {ev.timestamp.toTimeString().slice(0, 8)}
                  </span>
                  <span className={`shrink-0 font-semibold ${EVENT_COLORS[ev.type] ?? "text-white/60"}`}>
                    [{ev.type}]
                  </span>
                  <span className="text-white/80 break-all">{ev.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* ── Key Talking Points ────────────────────────────────────────────────── */}
        <div className="border rounded-lg p-5 bg-muted/10">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> Key Demo Talking Points
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-xs text-muted-foreground leading-relaxed">
            <div>
              <span className="text-foreground font-medium">Atlas vs. Manual System: </span>
              The manual LangGraph approach produces a bundle.json with no versioning, no QA gate, no promotion
              workflow, and no audit trail. Atlas Bundle Store provides semantic versioning, immutable ACTIVE bundles,
              a human promotion gate, SHA-256 source provenance, and a complete QA audit trail.
            </div>
            <div>
              <span className="text-foreground font-medium">Automatic Policy Enforcement: </span>
              Any proposal agent bound to this bundle will automatically fail QA if it uses prohibited terms
              (Milliman, MCG™) or applies the wrong segment messaging frame — no human review required at generation time.
            </div>
            <div>
              <span className="text-foreground font-medium">Segment-Aware Proposals: </span>
              The segment_lexicon artifact carries three distinct messaging frames. The proposal agent uses the correct
              frame automatically based on account type — health plan, hospital system, or employer.
            </div>
            <div>
              <span className="text-foreground font-medium">Reproducibility Guarantee: </span>
              Every proposal run records the bundle_id. Any proposal can be reproduced exactly by re-loading the bundle
              snapshot — the difference between a prototype and a production system.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
