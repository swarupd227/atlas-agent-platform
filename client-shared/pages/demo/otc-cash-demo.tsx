import { useState } from "react";
import {
  Play, RotateCcw, Activity, Terminal, Landmark, DollarSign, Zap, CheckCircle2,
  ArrowRight, FileSearch, AlertCircle, Clock, ChevronRight,
} from "lucide-react";
import {
  useOtcCashPipeline, OTC_CASH_COLOR, SCENARIO_INFO,
  type CashLogEntry, type ScenarioKey,
} from "./otc-cash-constants";
import OtcCashS1Dashboard from "./otc-cash-s1-dashboard";
import OtcCashS2Resolution from "./otc-cash-s2-resolution";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ─── Log entry ────────────────────────────────────────────────────────────────
function LogEntry({ entry }: { entry: CashLogEntry }) {
  const colorMap: Record<string, string> = {
    info:      "text-white/50",
    tool_call: "text-blue-400",
    analysis:  "text-purple-400",
    complete:  "text-emerald-400",
    error:     "text-red-400",
  };
  return (
    <div className={`flex items-start gap-2 text-xs font-mono ${colorMap[entry.type] ?? "text-white/50"}`}>
      <span className="shrink-0 text-white/20 tabular-nums">
        {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <span className="text-white/30 shrink-0">[{entry.agentCode}]</span>
      <span className="min-w-0 break-all">{entry.message}</span>
    </div>
  );
}

// ─── Agent step pill ──────────────────────────────────────────────────────────
function AgentStepPill({ code, label, status }: { code: string; label: string; status: string }) {
  const running  = status === "running";
  const complete = status === "complete";
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all
      ${running  ? "border-emerald-500/40 bg-emerald-500/10"
      : complete ? "border-white/20 bg-white/5"
      :            "border-white/5 opacity-40"}`}>
      {running  && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {complete && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
      {!running && !complete && <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
      <span className="font-mono text-white/50 text-[10px]">{code}</span>
      <span className={running ? "text-emerald-300" : complete ? "text-white" : "text-white/30"}>
        {label.split("—")[0].trim()}
      </span>
    </div>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────
function ScenarioCard({ scenarioKey, onRun, isRunning }:
  { scenarioKey: ScenarioKey; onRun: (k: ScenarioKey) => void; isRunning: boolean }) {
  const info = SCENARIO_INFO[scenarioKey];
  const icons: Record<ScenarioKey, typeof DollarSign> = {
    main:     DollarSign,
    vertex:   FileSearch,
    regional: AlertCircle,
  };
  const Icon = icons[scenarioKey];

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4 hover:border-white/20 transition-all"
      data-testid={`card-scenario-${scenarioKey}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${info.color}20`, border: `1px solid ${info.color}40` }}>
          <Icon className="w-4 h-4" style={{ color: info.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{info.label}</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
              style={{ color: info.color, borderColor: `${info.color}40`, background: `${info.color}10` }}>
              {info.badge}
            </span>
          </div>
          <div className="text-xs text-white/40 mt-0.5">{info.subtitle}</div>
        </div>
      </div>

      <p className="text-xs text-white/50 leading-relaxed">{info.description}</p>

      <div className="flex items-center gap-1.5 flex-wrap">
        {info.agentCodes.map((code, i) => (
          <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-white/40">
            {code}
          </span>
        ))}
      </div>

      <button
        onClick={() => onRun(scenarioKey)}
        disabled={isRunning}
        data-testid={`button-run-${scenarioKey}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
        style={{ background: info.color, color: "white" }}
      >
        <Play className="w-3.5 h-3.5" />
        Run Scenario
      </button>
    </div>
  );
}

// ─── Vertex result view ───────────────────────────────────────────────────────
function VertexResultView({ phase, metrics }: { phase: string; metrics: any }) {
  const step1Done = metrics.status === "MATCH_FOUND" || phase === "complete";
  const isComplete = phase === "complete";

  return (
    <div className="flex flex-col gap-5">
      {isComplete && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/8 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">Vertex Systems — Exception Resolved</div>
            <div className="text-xs text-white/50 mt-1 leading-relaxed">
              ACH reference mismatch resolved via PO cross-reference fuzzy matching. 5 invoices closed. $487.2K AR posted. Exception cleared.
            </div>
            <div className="text-[10px] text-indigo-400 mt-2">Traditional: queued for manual review all day → Atlas: &lt;30 seconds</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "ACH Payment",      value: "$487,200",  sub: "ACH-2026-0328-0447",    color: "text-white"     },
          { label: "Match Confidence", value: step1Done ? "91%" : "—",   sub: "PO cross-reference",    color: "text-indigo-400" },
          { label: "Invoices Matched", value: step1Done ? "5 of 5" : "—",  sub: "INV-47210 to INV-47214", color: "text-emerald-400" },
          { label: "Variance",         value: isComplete ? "$0.00" : "—", sub: "Exact amount match",    color: "text-emerald-400" },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-1">
            <div className="text-xs text-white/40 uppercase tracking-wider">{item.label}</div>
            <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-white/30">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
        <div className="text-sm font-semibold text-white">Fuzzy Match Resolution</div>
        {step1Done ? (
          <>
            <div className="rounded-lg bg-indigo-500/8 border border-indigo-500/20 p-3 text-xs text-white/60 leading-relaxed">
              ACH memo field "VS-2026-MAR" cross-referenced against customer PO history (VS-2026-JAN, VS-2026-FEB, VS-2026-MAR pattern).
              Amount waterfall matched to INV-47210 through INV-47214 totalling exactly $487,200 — zero variance.
              91% confidence exceeds NovaTech's 80% auto-confirm threshold.
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { ref: "INV-47210", amount: "$89,400",  status: isComplete ? "CLOSED-PAID" : "MATCHED" },
                { ref: "INV-47211", amount: "$98,700",  status: isComplete ? "CLOSED-PAID" : "MATCHED" },
                { ref: "INV-47212", amount: "$112,300", status: isComplete ? "CLOSED-PAID" : "MATCHED" },
                { ref: "INV-47213", amount: "$102,800", status: isComplete ? "CLOSED-PAID" : "MATCHED" },
                { ref: "INV-47214", amount: "$84,000",  status: isComplete ? "CLOSED-PAID" : "MATCHED" },
              ].map(inv => (
                <div key={inv.ref} className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5">
                  <span className="font-mono text-white/50">{inv.ref}</span>
                  <span className="text-white font-medium">{inv.amount}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    inv.status === "CLOSED-PAID" ? "bg-emerald-500/20 text-emerald-400" : "bg-indigo-500/20 text-indigo-400"
                  }`}>{inv.status}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs text-white/30 italic">Agent investigating Vertex ACH payment…</div>
        )}
      </div>

      {isComplete && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
          <div className="text-sm font-semibold text-white">AR Balance — Vertex Systems</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/50">Before: <span className="text-white font-bold">$512,800</span></span>
            <ArrowRight className="w-4 h-4 text-white/30" />
            <span className="text-white/50">After: <span className="text-emerald-400 font-bold">$25,600</span></span>
            <span className="ml-auto text-xs text-white/30">2 invoices remain (30/60-day)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Regional result view ─────────────────────────────────────────────────────
function RegionalResultView({ phase, agents }: { phase: string; agents: any[] }) {
  const step1Done  = agents.find((a: any) => a.step === 1)?.status === "complete";
  const isComplete = phase === "complete";

  return (
    <div className="flex flex-col gap-5">
      {isComplete && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">Regional Supply Co — Provisionally Posted & Chase Initiated</div>
            <div className="text-xs text-white/50 mt-1 leading-relaxed">
              $127K check provisionally applied to oldest invoices. Customer automatically notified — 3-day response window. Both 30-day overdue invoices cleared from aging.
            </div>
            <div className="text-[10px] text-amber-400 mt-2">No remittance → Atlas provisionally clears aging, contacts customer automatically, escalates if no response</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Check Amount",      value: "$127,000",      sub: "CHK-2026-77421",       color: "text-white"     },
          { label: "Open AR",           value: "$143,200",       sub: "8 open invoices",     color: "text-amber-400" },
          { label: "Invoices Cleared",  value: step1Done ? "3" : "—",   sub: "Provisional oldest-first", color: "text-emerald-400" },
          { label: "Chase Status",      value: isComplete ? "Active" : "—", sub: "Response due Mar 31",  color: "text-emerald-400" },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-1">
            <div className="text-xs text-white/40 uppercase tracking-wider">{item.label}</div>
            <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-white/30">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
          <div className="text-sm font-semibold text-white">Provisional Allocation</div>
          {step1Done ? (
            <div className="flex flex-col gap-2">
              {[
                { ref: "INV-45901", amount: "$52,400", applied: "$52,400", bucket: "30-day overdue", closed: true  },
                { ref: "INV-45902", amount: "$37,000", applied: "$37,000", bucket: "30-day overdue", closed: true  },
                { ref: "INV-46011", amount: "$24,800", applied: "$24,800", bucket: "Current",        closed: true  },
                { ref: "INV-46102", amount: "$11,200", applied: "$9,100",  bucket: "Current",        closed: false },
              ].map(inv => (
                <div key={inv.ref} className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5">
                  <div className="flex flex-col">
                    <span className="font-mono text-white/60">{inv.ref}</span>
                    <span className="text-white/30">{inv.bucket}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">{inv.applied}</div>
                    {inv.applied !== inv.amount && <div className="text-white/30">of {inv.amount}</div>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ml-2 ${
                    inv.closed
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}>{inv.closed ? "PROV-CLOSED" : "PARTIAL"}</span>
                </div>
              ))}
              <div className="text-xs text-white/40 border-t border-white/5 pt-2">
                $3,700 held as unapplied credit — pending remittance confirmation
              </div>
            </div>
          ) : (
            <div className="text-xs text-white/30 italic">Agent analysing Regional Supply open invoices…</div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
          <div className="text-sm font-semibold text-white">Automated Chase Workflow</div>
          {isComplete ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 p-3 text-xs text-white/60 leading-relaxed">
                <div className="font-semibold text-white mb-1">CHASE-2026-RSC-0328 · INITIATED</div>
                Email sent to Diane Howell (AP Manager) and Tom Reyes (Controller) requesting remittance confirmation for check #77421.
                Response deadline: March 31, 2026 17:00.
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Contact method</span>
                  <span className="text-white">Email + Customer Portal</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Response deadline</span>
                  <span className="text-amber-400">Mar 31 17:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Escalation</span>
                  <span className="text-white">AM call Apr 1 09:00 if no reply</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex flex-col gap-1">
                <div className="text-xs font-semibold text-white">Aging Impact</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-amber-400">30-day: <span className="font-bold">$89,400</span></span>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <span className="text-emerald-400">30-day: <span className="font-bold">$0</span></span>
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">Both overdue invoices cleared — customer no longer at credit hold risk</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-white/30 italic">Awaiting OTC-AGT-006 chase initiation…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Demo Component ──────────────────────────────────────────────────────
export default function OtcCashDemo() {
  const { state, trigger, reset } = useOtcCashPipeline();
  const [mainTab, setMainTab] = useState<"dashboard" | "resolution">("dashboard");
  const [logOpen, setLogOpen] = useState(true);

  const isIdle      = state.phase === "idle";
  const isRunning   = state.phase === "running" || state.phase === "setup";
  const isComplete  = state.phase === "complete";
  const isError     = state.phase === "error";
  const hasStarted  = !isIdle;
  const scenarioKey = state.scenarioKey;
  const info        = scenarioKey ? SCENARIO_INFO[scenarioKey] : null;

  const handleRun = (key: ScenarioKey) => {
    setMainTab("dashboard");
    trigger(key);
  };

  return (
    <div className="flex flex-col gap-0 h-full min-h-screen bg-[#0D0D0D] text-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${OTC_CASH_COLOR}25`, border: `1px solid ${OTC_CASH_COLOR}40` }}>
            <Landmark className="w-4 h-4" style={{ color: OTC_CASH_COLOR }} />
          </div>
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest font-medium">NovaTech Industries — Financial · Demo 4</div>
            <div className="text-base font-bold text-white">AI-Powered Cash Application</div>
          </div>
        </div>

        {/* Agent pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {state.agents.map((a, i) => (
            <AgentStepPill key={`${a.code}-${i}`} code={a.code} label={a.label} status={a.status} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasStarted && (
            <button
              onClick={reset}
              data-testid="button-reset-demo"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/60 hover:text-white text-xs transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
          {hasStarted && isRunning && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold opacity-60 cursor-not-allowed"
              style={{ background: info?.color ?? OTC_CASH_COLOR, color: "white" }}>
              <Activity className="w-4 h-4 animate-pulse" />
              Running…
            </div>
          )}
        </div>
      </div>

      {/* ── Idle: scenario selector ─────────────────────────────────────────── */}
      {isIdle && (
        <div className="p-6 flex flex-col gap-5 flex-1">
          <div className="flex flex-col gap-1">
            <div className="text-base font-semibold text-white">Choose a Scenario to Run</div>
            <div className="text-sm text-white/40">Each scenario runs independently with live AI agents — SSE trace logs stream in real time. March 28, 2026 · Month-end close.</div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ScenarioCard scenarioKey="main"     onRun={handleRun} isRunning={isRunning} />
            <ScenarioCard scenarioKey="vertex"   onRun={handleRun} isRunning={isRunning} />
            <ScenarioCard scenarioKey="regional" onRun={handleRun} isRunning={isRunning} />
          </div>
          <div className="flex items-center gap-2 text-xs text-white/30 mt-2">
            <ChevronRight className="w-3.5 h-3.5" />
            All scenarios use real LLM agents (Atlas Runtime) with mock enterprise MCP tool servers — realistic API latency included
          </div>
        </div>
      )}

      {/* ── Active: status bar ──────────────────────────────────────────────── */}
      {hasStarted && (
        <div className={`mx-6 mt-5 rounded-xl border px-4 py-3 flex items-center justify-between gap-4
          ${isComplete ? "border-emerald-500/30 bg-emerald-500/8"
          : isError    ? "border-red-500/30 bg-red-500/8"
          :              "border-white/10 bg-white/3"}`}
        >
          <div className="flex items-center gap-3">
            {isRunning  && <Activity className="w-4 h-4 animate-pulse" style={{ color: info?.color ?? OTC_CASH_COLOR }} />}
            {isComplete && <Zap className="w-4 h-4 text-emerald-400" />}
            {isError    && <span className="text-red-400 text-sm">✗</span>}
            <div>
              {info && (
                <div className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color: info.color }}>
                  {info.label}
                </div>
              )}
              {isRunning  && <div className="text-sm font-medium text-white">Pipeline running — AI agents processing…</div>}
              {isComplete && <div className="text-sm font-semibold text-emerald-400">
                {state.log[state.log.length - 1]?.message?.replace("✓ ", "") ?? "Pipeline complete"}
              </div>}
              {isError    && <div className="text-sm text-red-400">{state.error ?? "Pipeline error"}</div>}
              <div className="text-xs text-white/40">Elapsed: {state.elapsed_secs}s</div>
            </div>
          </div>

          {isComplete && scenarioKey === "main" && (
            <div className="flex items-center gap-4 text-xs shrink-0">
              <div className="text-center"><div className="text-white/40">Match rate</div><div className="font-bold text-emerald-400">94.1%</div></div>
              <div className="text-center"><div className="text-white/40">Auto-matched</div><div className="font-bold text-white">$39.8M</div></div>
              <div className="text-center"><div className="text-white/40">AR reduced</div><div className="font-bold text-emerald-400">$2.37M</div></div>
              <div className="text-center"><div className="text-white/40">Invoices</div><div className="font-bold text-white">47</div></div>
            </div>
          )}
          {isComplete && scenarioKey === "vertex" && (
            <div className="flex items-center gap-4 text-xs shrink-0">
              <div className="text-center"><div className="text-white/40">Invoices closed</div><div className="font-bold text-emerald-400">5</div></div>
              <div className="text-center"><div className="text-white/40">Match confidence</div><div className="font-bold text-white">91%</div></div>
              <div className="text-center"><div className="text-white/40">Posted</div><div className="font-bold text-emerald-400">$487.2K</div></div>
            </div>
          )}
          {isComplete && scenarioKey === "regional" && (
            <div className="flex items-center gap-4 text-xs shrink-0">
              <div className="text-center"><div className="text-white/40">Provisionally closed</div><div className="font-bold text-emerald-400">3</div></div>
              <div className="text-center"><div className="text-white/40">30-day cleared</div><div className="font-bold text-white">$89.4K</div></div>
              <div className="text-center"><div className="text-white/40">Chase</div><div className="font-bold text-amber-400">Active</div></div>
            </div>
          )}
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      {hasStarted && (
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Content pane */}
          <div className="flex-1 min-w-0 flex flex-col gap-5 p-6 overflow-y-auto">
            {/* "main" scenario: tabs to switch between S1 and S2 */}
            {scenarioKey === "main" && (
              <>
                <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
                  {[
                    { id: "dashboard" as const,  label: "5.1 — Batch Command Center" },
                    { id: "resolution" as const, label: "5.2 — GlobalTech Resolution" },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setMainTab(t.id)}
                      data-testid={`tab-${t.id}`}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all
                        ${mainTab === t.id ? "text-white" : "text-white/40 hover:text-white/70"}`}
                      style={mainTab === t.id ? { background: OTC_CASH_COLOR } : undefined}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {mainTab === "dashboard"
                  ? <OtcCashS1Dashboard state={state} onDeepDive={() => setMainTab("resolution")} />
                  : <OtcCashS2Resolution state={state} />}
              </>
            )}

            {scenarioKey === "vertex" && (
              <VertexResultView phase={state.phase} metrics={state.metrics} />
            )}

            {scenarioKey === "regional" && (
              <RegionalResultView phase={state.phase} agents={state.agents} />
            )}
          </div>

          {/* SSE Trace Log Panel */}
          <div
            className={`border-l border-white/10 flex flex-col transition-all duration-300
              ${logOpen ? "w-80 min-w-[18rem]" : "w-10 min-w-[2.5rem]"}`}
          >
            <button
              onClick={() => setLogOpen(p => !p)}
              className="flex items-center justify-between px-3 py-3 border-b border-white/10 hover:bg-white/5 transition-all w-full text-left"
              data-testid="button-toggle-log"
            >
              <Terminal className={`w-3.5 h-3.5 text-white/40 ${logOpen ? "" : "mx-auto"}`} />
              {logOpen && (
                <>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider ml-2 flex-1">SSE Trace Log</span>
                  <span className="text-[10px] text-white/30">{state.log.length}</span>
                </>
              )}
            </button>
            {logOpen && (
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5" data-testid="panel-sse-log">
                {state.log.length === 0
                  ? <div className="text-xs text-white/20 italic text-center mt-4">Awaiting agent events…</div>
                  : state.log.map((entry, i) => <LogEntry key={i} entry={entry} />)
                }
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
