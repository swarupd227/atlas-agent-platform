import { useState } from "react";
import { Play, RotateCcw, Activity, Terminal, ChevronRight, Landmark, DollarSign, Zap } from "lucide-react";
import { useOtcCashPipeline, OTC_CASH_COLOR, type CashLogEntry } from "./otc-cash-constants";
import OtcCashS1Dashboard from "./otc-cash-s1-dashboard";
import OtcCashS2Resolution from "./otc-cash-s2-resolution";

// ─── Log entry component ──────────────────────────────────────────────────────
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
      <span className="shrink-0 text-white/20 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <span className="text-white/30 shrink-0">[{entry.agentCode}]</span>
      <span className="min-w-0 break-all">{entry.message}</span>
    </div>
  );
}

// ─── Screen tab pills ─────────────────────────────────────────────────────────
type ScreenTab = "dashboard" | "resolution";
function ScreenTabs({ active, onChange }: { active: ScreenTab; onChange: (s: ScreenTab) => void }) {
  const tabs: { id: ScreenTab; label: string }[] = [
    { id: "dashboard",  label: "5.1 — Cash Application Command Center" },
    { id: "resolution", label: "5.2 — GlobalTech Complex Resolution" },
  ];
  return (
    <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          data-testid={`tab-${t.id}`}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all
            ${active === t.id
              ? "text-white"
              : "text-white/40 hover:text-white/70"}`}
          style={active === t.id ? { background: OTC_CASH_COLOR } : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Agent step pills ─────────────────────────────────────────────────────────
function AgentStepPill({ code, label, status }: { code: string; label: string; status: string }) {
  const running  = status === "running";
  const complete = status === "complete";
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all
      ${running  ? "border-emerald-500/40 bg-emerald-500/10"
      : complete ? "border-white/20 bg-white/5"
      :            "border-white/5 opacity-40"}`}>
      {running && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {complete && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
      {!running && !complete && <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
      <span className="font-mono text-white/50 text-[10px]">{code}</span>
      <span className={running ? "text-emerald-300" : complete ? "text-white" : "text-white/30"}>{label}</span>
    </div>
  );
}

// ─── Main Demo Component ──────────────────────────────────────────────────────
export default function OtcCashDemo() {
  const { state, trigger, reset } = useOtcCashPipeline();
  const [screen, setScreen] = useState<ScreenTab>("dashboard");
  const [logOpen, setLogOpen] = useState(true);

  const isRunning   = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const hasStarted  = state.phase !== "idle";
  const isComplete  = state.phase === "complete";
  const isError     = state.phase === "error";

  const handleRun = () => {
    trigger();
    setScreen("dashboard");
  };

  return (
    <div className="flex flex-col gap-0 h-full min-h-screen bg-[#0D0D0D] text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Agent pills */}
          {state.agents.map((a, i) => (
            <AgentStepPill key={`${a.code}-${i}`} code={a.code} label={a.label.split("—")[0].trim()} status={a.status} />
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
          <button
            onClick={handleRun}
            disabled={isRunning}
            data-testid="button-run-pipeline"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
            style={{ background: OTC_CASH_COLOR, color: "white" }}
          >
            {isRunning
              ? <><Activity className="w-4 h-4 animate-pulse" /> Running…</>
              : <><Play className="w-4 h-4" /> Run Demo</>}
          </button>
        </div>
      </div>

      {/* ── Scenario banner (idle) ─────────────────────────────────────────── */}
      {!hasStarted && (
        <div className="mx-6 mt-5 rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${OTC_CASH_COLOR}20` }}>
              <DollarSign className="w-5 h-5" style={{ color: OTC_CASH_COLOR }} />
            </div>
            <div>
              <div className="text-base font-semibold text-white">Month-End Cash Application — March 28, 2026</div>
              <div className="text-sm text-white/50">$42.3M in payments received · 387 transactions · 2 AI agents</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Zap,
                title: "OTC-AGT-009 (Step 1)",
                body:  "Ingests $42.3M batch, runs intelligent auto-matching to achieve 94.1% match rate, identifies exception queue with GlobalTech Corp as Priority 1",
              },
              {
                icon: DollarSign,
                title: "OTC-AGT-009 (Step 2)",
                body:  "Resolves GlobalTech's $2.3M payment: parses EDI 820, matches 47 invoices, validates 3 deductions, quantifies $38.1K overpayment",
              },
              {
                icon: Landmark,
                title: "OTC-AGT-006 (Step 3)",
                body:  "Validates deduction policy, posts AR journal entries, issues credit memo, closes 47 invoices, reports AR aging impact ($3.1M → $0.73M)",
              },
            ].map(step => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: OTC_CASH_COLOR }} />
                    <span className="text-sm font-semibold text-white">{step.title}</span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">{step.body}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40 border-t border-white/10 pt-4">
            <ChevronRight className="w-3.5 h-3.5" />
            Click <span className="text-white font-semibold">Run Demo</span> to launch live agents — SSE trace logs will stream in real-time below
          </div>
        </div>
      )}

      {/* ── Status bar (running/complete/error) ───────────────────────────── */}
      {hasStarted && (
        <div className={`mx-6 mt-5 rounded-xl border px-4 py-3 flex items-center justify-between gap-4
          ${isComplete ? "border-emerald-500/30 bg-emerald-500/8"
          : isError    ? "border-red-500/30 bg-red-500/8"
          :              "border-emerald-500/20 bg-white/3"}`}
        >
          <div className="flex items-center gap-3">
            {isRunning && <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />}
            {isComplete && <Zap className="w-4 h-4 text-emerald-400" />}
            {isError    && <span className="text-red-400 text-sm">✗</span>}
            <div>
              {isRunning  && <div className="text-sm font-medium text-white">Pipeline running — AI agents processing…</div>}
              {isComplete && <div className="text-sm font-semibold text-emerald-400">Pipeline complete — 94.1% auto-match · $2.37M AR reduction · 47 invoices closed</div>}
              {isError    && <div className="text-sm text-red-400">{state.error ?? "Pipeline error"}</div>}
              <div className="text-xs text-white/40">Elapsed: {state.metrics.elapsed_secs}s</div>
            </div>
          </div>
          {isComplete && (
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center"><div className="text-white/40">Match rate</div><div className="font-bold text-emerald-400">94.1%</div></div>
              <div className="text-center"><div className="text-white/40">Auto-matched</div><div className="font-bold text-white">$39.8M</div></div>
              <div className="text-center"><div className="text-white/40">AR reduced</div><div className="font-bold text-emerald-400">$2.37M</div></div>
              <div className="text-center"><div className="text-white/40">Invoices closed</div><div className="font-bold text-white">47</div></div>
            </div>
          )}
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      {hasStarted && (
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Screens */}
          <div className="flex-1 min-w-0 flex flex-col gap-5 p-6 overflow-y-auto">
            <ScreenTabs active={screen} onChange={setScreen} />
            {screen === "dashboard"
              ? <OtcCashS1Dashboard state={state} onDeepDive={() => setScreen("resolution")} />
              : <OtcCashS2Resolution state={state} />}
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
                {state.log.length === 0 ? (
                  <div className="text-xs text-white/20 italic text-center mt-4">Awaiting agent events…</div>
                ) : (
                  state.log.map((entry, i) => <LogEntry key={i} entry={entry} />)
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
