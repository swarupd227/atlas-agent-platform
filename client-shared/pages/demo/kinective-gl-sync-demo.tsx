import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, Clock, XCircle, AlertTriangle, ArrowRight,
  Terminal, RotateCcw, ExternalLink, Play, Building2, Database,
  FileText, Shield, Zap, ChevronRight, GitMerge, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  GL_SYNC_AGENT_IDS,
  GL_SYNC_CONFIG,
  GL_SYNC_SCENARIOS,
  GL_SYNC_AGENT_COLORS,
  GL_SYNC_TOOL_AGENT_MAP,
  type GlSyncScenarioKey,
} from "./kinective-gl-sync-constants";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "running" | "complete" | "error";

interface AgentState {
  index: number;
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  toolCallCount: number;
  traceId: string | null;
  summary: string | null;
}

interface GlStatsState {
  businessDate: string;
  entriesExtracted: number;
  entriesPosted: number;
  entriesExcepted: number;
  debitTotal: number;
  creditTotal: number;
  intacctTotal: number;
  balanced: boolean | null;
  variance: number;
  controlHash: string;
  jeId: string | null;
}

interface TerminalLine {
  id: number;
  ts: string;
  kind: "info" | "success" | "warn" | "error" | "tool" | "agent" | "system";
  text: string;
  agentIndex?: number;
}

interface RunResult {
  scenario: GlSyncScenarioKey;
  success: boolean;
  message: string;
}

interface ExceptionState {
  count: number;
  reason: string;
  accounts: string[];
  queue: string;
}

interface HumanGate {
  gateType: string;
  message: string;
  context: Record<string, any>;
}

// ── Agent definitions (display) ──────────────────────────────────────────────

const AGENTS: Omit<AgentState, "status" | "toolCallCount" | "traceId" | "summary">[] = [
  { index: 0, id: GL_SYNC_AGENT_IDS.A0_ORCHESTRATOR,   name: "Sync Orchestrator",          role: "Idempotency & watermark" },
  { index: 1, id: GL_SYNC_AGENT_IDS.A1_CATALOG,        name: "GL Account Catalog",          role: "Account crosswalk validation" },
  { index: 2, id: GL_SYNC_AGENT_IDS.A2_EXTRACTION,     name: "Core GL Extraction",          role: "Symitar GL extraction" },
  { index: 3, id: GL_SYNC_AGENT_IDS.A3_TRANSFORMATION, name: "GL Transformation",           role: "Account code mapping" },
  { index: 4, id: GL_SYNC_AGENT_IDS.A4_DIMENSION,      name: "Dimension & Compliance",      role: "Branch/dept dimension attach" },
  { index: 5, id: GL_SYNC_AGENT_IDS.A5_POSTING,        name: "Journal Posting",             role: "Sage Intacct JE posting" },
  { index: 6, id: GL_SYNC_AGENT_IDS.A6_RECONCILIATION, name: "Reconciliation & Exception",  role: "Control total verification" },
];

function makeInitialAgents(): AgentState[] {
  return AGENTS.map(a => ({ ...a, status: "idle", toolCallCount: 0, traceId: null, summary: null }));
}

// ── Status icon ───────────────────────────────────────────────────────────────

function AgentStatusIcon({ status }: { status: AgentStatus }) {
  if (status === "idle")     return <Clock className="h-4 w-4 text-muted-foreground" />;
  if (status === "running")  return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "error")    return <XCircle className="h-4 w-4 text-red-400" />;
  return null;
}

// ── Terminal line color ───────────────────────────────────────────────────────

function lineColor(kind: TerminalLine["kind"]): string {
  switch (kind) {
    case "success": return "text-emerald-400";
    case "warn":    return "text-amber-400";
    case "error":   return "text-red-400";
    case "tool":    return "text-cyan-400";
    case "agent":   return "text-violet-400";
    case "system":  return "text-slate-400";
    default:        return "text-slate-300";
  }
}

let lineCounter = 0;
function mkLine(kind: TerminalLine["kind"], text: string, agentIndex?: number): TerminalLine {
  return {
    id: lineCounter++,
    ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
    kind, text, agentIndex,
  };
}

const AGENT_NAMES = AGENTS.map(a => a.name);

// ── Main Component ────────────────────────────────────────────────────────────

export default function KinectiveGlSyncDemo() {
  const { toast } = useToast();

  const [scenario, setScenario] = useState<GlSyncScenarioKey>("happy");
  const [agents, setAgents] = useState<AgentState[]>(makeInitialAgents());
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [stats, setStats] = useState<GlStatsState>({
    businessDate: "", entriesExtracted: 0, entriesPosted: 0, entriesExcepted: 0,
    debitTotal: 0, creditTotal: 0, intacctTotal: 0,
    balanced: null, variance: 0, controlHash: "", jeId: null,
  });
  const [exception, setException] = useState<ExceptionState | null>(null);
  const [humanGate, setHumanGate] = useState<HumanGate | null>(null);

  const termRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const addLine = useCallback((kind: TerminalLine["kind"], text: string, agentIndex?: number) => {
    setLines(prev => [...prev.slice(-299), mkLine(kind, text, agentIndex)]);
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  const handleLaunch = useCallback(() => {
    if (running) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setRunning(true);
    setRunResult(null);
    setAgents(makeInitialAgents());
    setLines([]);
    setStats({ businessDate: "", entriesExtracted: 0, entriesPosted: 0, entriesExcepted: 0, debitTotal: 0, creditTotal: 0, intacctTotal: 0, balanced: null, variance: 0, controlHash: "", jeId: null });
    setException(null);
    setHumanGate(null);

    const url = `${GL_SYNC_CONFIG.streamPath}?scenario=${scenario}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      addLine("system", `◆ GL Sync pod starting — ${d.institution} | Business date: ${d.businessDate} | Scenario: ${d.scenario}`);
      if (d.businessDate) setStats(s => ({ ...s, businessDate: d.businessDate }));
    });

    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addLine("system", `  Setup: ${d.message}`);
    });

    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      const idx: number = d.agentIndex;
      setAgents(prev => prev.map(a => a.index === idx ? { ...a, status: "running" } : a));
      addLine("agent", `▶ A${idx} ${d.agentName} — starting`, idx);
    });

    es.addEventListener("agent_event", (e) => {
      const d = JSON.parse(e.data);
      const idx: number = d.agentIndex ?? (GL_SYNC_TOOL_AGENT_MAP[d.tool] ?? 0);
      if (d.type === "tool_call_start") {
        addLine("tool", `  └─ [A${idx}] ${d.tool} → ${d.system}`, idx);
      } else if (d.type === "tool_call_result") {
        if (d.success === false) {
          addLine("warn", `  └─ [A${idx}] ${d.tool} returned error: ${d.error || "failed"}`, idx);
        } else {
          addLine("tool", `  └─ [A${idx}] ${d.tool} ✓`, idx);
        }
        setAgents(prev => prev.map(a => a.index === idx ? { ...a, toolCallCount: a.toolCallCount + 1 } : a));
      }
    });

    es.addEventListener("gl_stats", (e) => {
      const d = JSON.parse(e.data);
      setStats(s => ({ ...s, entriesExtracted: d.entriesExtracted, debitTotal: d.debitTotal, creditTotal: d.creditTotal, controlHash: d.controlHash }));
      addLine("success", `  GL: ${d.entriesExtracted.toLocaleString()} entries extracted — Debit $${d.debitTotal.toLocaleString()} = Credit $${d.creditTotal.toLocaleString()} ✓`);
    });

    es.addEventListener("posting_result", (e) => {
      const d = JSON.parse(e.data);
      setStats(s => ({ ...s, entriesPosted: d.entriesPosted, entriesExcepted: d.entriesExcepted, intacctTotal: d.intacctTotal, jeId: d.jeId }));
      const msg = d.entriesExcepted > 0
        ? `  Intacct: ${d.entriesPosted.toLocaleString()} posted, ${d.entriesExcepted} excepted — JE ${d.jeId}`
        : `  Intacct: ${d.entriesPosted.toLocaleString()} entries posted — JE ${d.jeId} ✓`;
      addLine(d.entriesExcepted > 0 ? "warn" : "success", msg);
    });

    es.addEventListener("exception", (e) => {
      const d = JSON.parse(e.data);
      setException({ count: d.count, reason: d.reason, accounts: d.accounts, queue: d.queue });
      addLine("warn", `  ⚠ Exception: ${d.count} entries → ${d.reason}`);
    });

    es.addEventListener("human_gate", (e) => {
      const d = JSON.parse(e.data);
      setHumanGate({ gateType: d.gateType, message: d.message, context: d.context });
      addLine("warn", `  ⛔ Human gate: ${d.message.slice(0, 80)}...`);
    });

    es.addEventListener("agent_complete", (e) => {
      const d = JSON.parse(e.data);
      const idx: number = d.agentIndex;
      const status: AgentStatus = d.success ? "complete" : "error";
      setAgents(prev => prev.map(a => a.index === idx ? { ...a, status, traceId: d.traceId, summary: d.summary, toolCallCount: d.toolCallCount ?? a.toolCallCount } : a));
      addLine(d.success ? "success" : "error", `✓ A${idx} ${d.agentName} — ${d.summary || (d.success ? "complete" : "error")}`, idx);
    });

    es.addEventListener("run_complete", (e) => {
      const d = JSON.parse(e.data);
      setRunning(false);
      setRunResult({ scenario: d.scenario, success: d.success, message: d.message });
      addLine(d.success ? "success" : "warn", `\n◆ Run complete — ${d.message}`);
      es.close();
      esRef.current = null;
      if (d.stats) {
        setStats(s => ({ ...s, ...d.stats, balanced: d.stats.balanced }));
      }
    });

    es.addEventListener("error", (e) => {
      let msg = "Stream error";
      try { const d = JSON.parse((e as any).data); msg = d.message || msg; } catch {}
      setRunning(false);
      addLine("error", `✕ Error: ${msg}`);
      es.close();
      esRef.current = null;
    });

    es.onerror = () => {
      if (esRef.current) {
        setRunning(false);
        addLine("error", "Connection lost");
        es.close();
        esRef.current = null;
      }
    };
  }, [scenario, running, addLine]);

  const handleReset = useCallback(async () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    try {
      await fetch(GL_SYNC_CONFIG.resetPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
    } catch {}
    setRunning(false);
    setRunResult(null);
    setAgents(makeInitialAgents());
    setLines([]);
    setStats({ businessDate: "", entriesExtracted: 0, entriesPosted: 0, entriesExcepted: 0, debitTotal: 0, creditTotal: 0, intacctTotal: 0, balanced: null, variance: 0, controlHash: "", jeId: null });
    setException(null);
    setHumanGate(null);
  }, [scenario]);

  const scenarioDef = GL_SYNC_SCENARIOS[scenario];
  const anyRunning = running;
  const hasStarted = lines.length > 0;

  const completedCount = agents.filter(a => a.status === "complete").length;
  const progress = Math.round((completedCount / agents.length) * 100);

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-slate-100">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0d0e13]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/demo" className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 text-sm" data-testid="link-back-demo">
              ← Demo Center
            </Link>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                <GitMerge className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm text-white">Prior-Day GL Synchronization</div>
                <div className="text-xs text-slate-400">Cascade Ridge Credit Union — Symitar → Sage Intacct</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-400">7 Live Agents</Badge>
            <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400">5 MCP Servers</Badge>
            <Badge variant="outline" className="text-xs border-slate-500/40 text-slate-400">{GL_SYNC_CONFIG.syncSchedule}</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Institution & Scenario row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Institution card */}
          <Card className="bg-[#0d0e13] border-white/10 col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                  <Building2 className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-white">Cascade Ridge Credit Union</div>
                  <div className="text-xs text-slate-400">Anchor Customer · {GL_SYNC_CONFIG.assets} Assets</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Core:</span> <span className="text-slate-300">Symitar (Episys)</span></div>
                <div><span className="text-slate-500">GL:</span> <span className="text-slate-300">Sage Intacct</span></div>
                <div><span className="text-slate-500">Branches:</span> <span className="text-slate-300">14</span></div>
                <div><span className="text-slate-500">Daily Vol:</span> <span className="text-slate-300">~1,742 entries</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Scenario selector */}
          <div className="col-span-2 grid grid-cols-3 gap-3">
            {(Object.entries(GL_SYNC_SCENARIOS) as [GlSyncScenarioKey, typeof GL_SYNC_SCENARIOS[GlSyncScenarioKey]][]).map(([key, s]) => (
              <button
                key={key}
                onClick={() => !running && setScenario(key)}
                disabled={running}
                data-testid={`scenario-${key}`}
                className={`rounded-lg border p-3 text-left transition-all ${
                  scenario === key
                    ? `${s.color} border-current`
                    : "bg-[#0d0e13] border-white/10 hover:border-white/20 text-slate-400"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-medium text-sm mb-1">{s.label}</div>
                <div className="text-xs opacity-80 leading-tight">{s.description}</div>
                <div className="text-xs mt-1 opacity-60">{s.subLabel}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Agent Pod Map */}
        <Card className="bg-[#0d0e13] border-white/10">
          <CardHeader className="py-3 px-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-400" />
                GL Sync Agent Pod
                {hasStarted && (
                  <span className="text-xs font-normal text-slate-400">
                    {completedCount}/{agents.length} agents complete
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {hasStarted && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReset}
                    disabled={running}
                    className="h-7 text-xs border-white/20"
                    data-testid="button-reset"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleLaunch}
                  disabled={running}
                  className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                  data-testid="button-launch"
                >
                  {running ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running…</> : <><Play className="h-3 w-3 mr-1" />Launch GL Sync</>}
                </Button>
              </div>
            </div>
            {hasStarted && (
              <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-start gap-0 overflow-x-auto pb-2">
              {agents.map((agent, i) => (
                <div key={agent.id} className="flex items-start gap-0 flex-shrink-0">
                  <div
                    className={`w-36 rounded-lg border p-3 transition-all ${
                      agent.status === "running"  ? "border-blue-500/60 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.15)]" :
                      agent.status === "complete" ? "border-emerald-500/40 bg-emerald-500/5" :
                      agent.status === "error"    ? "border-red-500/40 bg-red-500/5" :
                      "border-white/10 bg-[#111218]"
                    }`}
                    data-testid={`agent-card-${i}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white ${GL_SYNC_AGENT_COLORS[i]}`}>
                        A{i}
                      </div>
                      <AgentStatusIcon status={agent.status} />
                    </div>
                    <div className="text-xs font-medium text-white leading-tight mb-1">{agent.name}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{agent.role}</div>
                    {agent.status !== "idle" && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{agent.toolCallCount} calls</span>
                        {agent.traceId && (
                          <Link href={`/agent-registry/${agent.id}`} className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5" data-testid={`link-trace-${i}`}>
                            Trace <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    )}
                    {agent.summary && (
                      <div className="mt-1 text-[9px] text-slate-400 leading-tight line-clamp-2">{agent.summary}</div>
                    )}
                  </div>
                  {i < agents.length - 1 && (
                    <div className="flex items-center self-center h-full px-0.5 mt-4">
                      <ArrowRight className="h-3 w-3 text-slate-600 flex-shrink-0" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main content: Terminal + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Terminal */}
          <Card className="bg-[#0d0e13] border-white/10 lg:col-span-2">
            <CardHeader className="py-2.5 px-4 border-b border-white/10">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Live Trace Log
                {running && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={termRef}
                className="h-80 overflow-y-auto font-mono text-[11px] p-4 space-y-0.5"
                data-testid="terminal-output"
              >
                {lines.length === 0 ? (
                  <div className="text-slate-600 italic">Select a scenario and click Launch GL Sync to begin…</div>
                ) : (
                  lines.map(line => (
                    <div key={line.id} className={`flex gap-2 leading-5 ${lineColor(line.kind)}`}>
                      <span className="text-slate-600 flex-shrink-0">{line.ts}</span>
                      <span className="whitespace-pre-wrap break-all">{line.text}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats panel */}
          <div className="space-y-3">
            {/* GL extraction stats */}
            <Card className="bg-[#0d0e13] border-white/10">
              <CardHeader className="py-2.5 px-4 border-b border-white/10">
                <CardTitle className="text-xs font-semibold text-white flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-cyan-400" />
                  GL Extraction
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <StatRow label="Business Date" value={stats.businessDate || "—"} />
                <StatRow label="Entries Extracted" value={stats.entriesExtracted > 0 ? stats.entriesExtracted.toLocaleString() : "—"} />
                <StatRow label="Debit Total" value={stats.debitTotal > 0 ? `$${stats.debitTotal.toLocaleString()}` : "—"} />
                <StatRow label="Credit Total" value={stats.creditTotal > 0 ? `$${stats.creditTotal.toLocaleString()}` : "—"} />
                <StatRow label="Control Hash" value={stats.controlHash ? stats.controlHash.slice(0, 16) + "…" : "—"} mono />
              </CardContent>
            </Card>

            {/* Posting result */}
            <Card className="bg-[#0d0e13] border-white/10">
              <CardHeader className="py-2.5 px-4 border-b border-white/10">
                <CardTitle className="text-xs font-semibold text-white flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  Intacct Posting
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <StatRow label="JE ID" value={stats.jeId || "—"} mono />
                <StatRow label="Entries Posted" value={stats.entriesPosted > 0 ? stats.entriesPosted.toLocaleString() : "—"} />
                <StatRow label="Entries Excepted" value={stats.entriesExcepted > 0 ? stats.entriesExcepted.toLocaleString() : stats.entriesPosted > 0 ? "0" : "—"} warn={stats.entriesExcepted > 0} />
                <StatRow label="Intacct Total" value={stats.intacctTotal > 0 ? `$${stats.intacctTotal.toLocaleString()}` : "—"} />
                <StatRow
                  label="Balance Check"
                  value={stats.balanced === null ? "—" : stats.balanced ? "BALANCED ✓" : `VARIANCE $${Math.abs(stats.variance).toLocaleString()}`}
                  success={stats.balanced === true}
                  warn={stats.balanced === false}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Exception Panel */}
        {exception && (
          <Card className="bg-amber-950/20 border-amber-500/30">
            <CardHeader className="py-3 px-4 border-b border-amber-500/20">
              <CardTitle className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Exception Queue — {exception.queue}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <div className="text-sm text-amber-200">
                    <span className="font-bold text-amber-300">{exception.count} entries</span> moved to exception queue
                  </div>
                  <div className="text-xs text-amber-400/80">{exception.reason}</div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {exception.accounts.map(a => (
                      <Badge key={a} className="bg-amber-900/40 text-amber-300 border-amber-500/30 text-xs">{a}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-amber-400/70 sm:max-w-xs">
                  Action required: Update branch dimension mapping for BR-14 (Kirkland) in Sage Intacct dimension table, then re-run affected entries.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Human Gate Panel */}
        {humanGate && (
          <Card className={`border ${humanGate.gateType === "control_total_variance" ? "bg-red-950/20 border-red-500/30" : "bg-amber-950/20 border-amber-500/30"}`}>
            <CardHeader className="py-3 px-4 border-b border-white/10">
              <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${humanGate.gateType === "control_total_variance" ? "text-red-300" : "text-amber-300"}`}>
                <AlertCircle className="h-4 w-4" />
                Human Review Required — {humanGate.gateType === "control_total_variance" ? "Control Total Variance" : "Dimension Remediation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="text-sm text-slate-300 mb-3">{humanGate.message}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(humanGate.context).map(([k, v]) => (
                  <div key={k} className="bg-white/5 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{k.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-200 font-mono">{String(v)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Run complete banner */}
        {runResult && (
          <Card className={`border ${runResult.success ? "bg-emerald-950/20 border-emerald-500/30" : "bg-red-950/20 border-red-500/30"}`}>
            <CardContent className="p-4 flex items-center gap-3">
              {runResult.success
                ? <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                : <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />}
              <div>
                <div className="font-semibold text-sm text-white">
                  {runResult.success ? "GL Sync Cycle Complete" : "GL Sync Cycle — Review Required"}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{runResult.message}</div>
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs border-white/20" onClick={handleReset} data-testid="button-run-again">
                  <RotateCcw className="h-3 w-3 mr-1" /> Run Again
                </Button>
                <Link href={`/agent-registry/${GL_SYNC_AGENT_IDS.A0_ORCHESTRATOR}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-violet-500/40 text-violet-400" data-testid="link-view-registry">
                    <ExternalLink className="h-3 w-3 mr-1" /> View in Registry
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agent Registry links */}
        {hasStarted && (
          <Card className="bg-[#0d0e13] border-white/10">
            <CardHeader className="py-2.5 px-4 border-b border-white/10">
              <CardTitle className="text-xs font-semibold text-white flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-violet-400" />
                Agent Registry — Runs & Traces
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {agents.map((agent) => (
                  <Link key={agent.id} href={`/agent-registry/${agent.id}`} data-testid={`link-registry-${agent.index}`}>
                    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-center">
                      <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white ${GL_SYNC_AGENT_COLORS[agent.index]}`}>
                        A{agent.index}
                      </div>
                      <div className="text-[9px] text-slate-400 leading-tight">{agent.name.split(" ").slice(0, 2).join(" ")}</div>
                      <AgentStatusIcon status={agent.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function StatRow({ label, value, mono, success, warn }: {
  label: string;
  value: string;
  mono?: boolean;
  success?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${success ? "text-emerald-400" : warn ? "text-amber-400" : "text-slate-300"} text-right`}>
        {value}
      </span>
    </div>
  );
}
