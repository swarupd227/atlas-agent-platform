import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Car, DollarSign, CalendarCheck, Users, FileText,
  ArrowUpCircle, Info, Mail,
} from "lucide-react";

const DEH_COLOR  = "#E8640A";
const DEMO_TITLE = "Dealer Experience Hub";
const CLIENT     = "Solifi";
const PIPELINE   = "DEH-CONV-001";

type ScenarioKey = "floorplan-status" | "payoff-quote" | "audit-schedule" | "human-handoff";
type AgentState  = "idle" | "running" | "ok" | "fail";

interface LiveEvent {
  id:        number;
  type:      string;
  message:   string;
  timestamp: Date;
}

interface AgentRun {
  state:        AgentState;
  toolCalls:    number;
  summary?:     any;
  agentId?:     string;
  deploymentId?: string;
  startedAt?:   number;
  finishedAt?:  number;
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message: s }; }
}

const TOOL_LABELS: Record<string, string> = {
  get_floorplan_status:          "Retrieving floorplan status",
  get_unit_details:              "Fetching unit details",
  get_payoff_quote:              "Generating payoff quote",
  send_payoff_email:             "Sending payoff email",
  get_audit_schedule:            "Retrieving audit schedule",
  get_credit_application_status: "Checking credit applications",
  get_payment_history:           "Fetching payment history",
  search_dealer_policy_kb:       "Searching policy knowledge base",
};

function labelTool(t?: string) { return t ? (TOOL_LABELS[t] ?? t) : ""; }

const SCENARIOS: { key: ScenarioKey; label: string; badge?: string; description: string; icon: any }[] = [
  {
    key:         "floorplan-status",
    label:       "Floorplan Status — Overdue Unit Alert",
    icon:        Car,
    description: "Pacific Powersports asks: 'Pull up our floorplan — are any units overdue?' Agent retrieves 23 financed units, surfaces 2 units past curtailment due dates, and recommends immediate action.",
  },
  {
    key:         "payoff-quote",
    label:       "Payoff Quote — Kawasaki Ninja ZX-6R",
    icon:        DollarSign,
    description: "Dealer has sold a unit and needs a payoff quote for Friday. Agent returns exact payoff amount, per-diem rate, wire instructions, and routes the quote email for Finance Manager approval.",
  },
  {
    key:         "audit-schedule",
    label:       "Audit Schedule + Policy Q&A",
    icon:        CalendarCheck,
    description: "Pacific Powersports asks when their next audit is, what documents to prepare, and what happens if a demo unit isn't on the lot during inspection.",
  },
  {
    key:         "human-handoff",
    label:       "Human Handoff — Bulk Curtailment",
    badge:       "Human Gate",
    icon:        Users,
    description: "$47,200 bulk curtailment deferral across 4 aged snowmobiles exceeds the $25,000 autonomous threshold. Agent identifies the limit via policy and routes to the assigned Solifi account manager.",
  },
];

const EVENT_COLORS: Record<string, string> = {
  run_start:      "text-blue-400",
  setup:          "text-white/30",
  agent_start:    "text-emerald-400",
  agent_event:    "text-purple-400",
  agent_complete: "text-emerald-300",
  human_gate:     "text-cyan-300",
  run_complete:   "text-emerald-400",
  error:          "text-red-400",
};

function formatEvent(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} · scenario: ${d.scenario ?? ""}`;
    case "setup":
      return d.message ?? "Setup complete";
    case "agent_start":
      return `Agent ${d.externalId ?? PIPELINE} starting${d.model ? ` (${d.model})` : ""}`;
    case "agent_event": {
      const sub = d.data ?? {};
      const tool = labelTool(sub.tool);
      const iter = sub.iteration != null ? ` · turn ${sub.iteration}` : "";
      if (d.type === "tool_call") return `→ ${tool || "Tool call"}${iter}`;
      if (d.type === "tool_call_result") {
        const ok  = sub.success === false ? " · FAILED" : "";
        const err = sub.error ? ` — ${String(sub.error).slice(0, 120)}` : "";
        return `← ${tool || "Tool result"}${ok}${err}${iter}`;
      }
      if (d.type === "llm_response") {
        const tc = sub.toolsCalled != null ? ` · ${sub.toolsCalled} tool call${sub.toolsCalled === 1 ? "" : "s"}` : "";
        return `Claude reasoning${iter}${tc}`;
      }
      return d.message ?? d.type ?? JSON.stringify(d).slice(0, 200);
    }
    case "agent_complete":
      return `Agent complete · ${d.toolCalls ?? 0} tool calls${d.success === false ? " · FAILED" : ""}`;
    case "human_gate":
      return `Human Gate · ${d.gate_type ?? ""} · ${d.message ?? ""}`;
    case "run_complete":
      return d.message ?? `Run complete · scenario: ${d.scenario ?? ""}`;
    case "error":
      return `ERROR: ${d.message ?? "unknown"}`;
    default:
      return d.message ?? JSON.stringify(d).slice(0, 200);
  }
}

// ─── Result card components ───────────────────────────────────────────────────

function FloorplanStatusCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const flagged: any[] = summary.units_requiring_action ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="text-3xl font-bold tabular-nums text-foreground">{summary.total_units ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Units Financed</div>
        </div>
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4">
          <div className="text-3xl font-bold tabular-nums" style={{ color: DEH_COLOR }}>{summary.flagged_units ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Overdue</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="text-3xl font-bold tabular-nums text-foreground">
            ${summary.total_balance != null ? (summary.total_balance / 1000).toFixed(0) + "K" : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Total Balance</div>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: DEH_COLOR }}>
            Units Requiring Immediate Action
          </div>
          {flagged.map((u: any, i: number) => (
            <div key={i} className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-foreground">{u.make_model_year ?? `Unit ${i + 1}`}</span>
                <span className="text-xs font-mono text-muted-foreground">{u.vin}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>Days on floor: <span className="text-foreground font-semibold">{u.days_on_floor}</span></div>
                <div>Curtailment due: <span className="text-foreground font-semibold">{u.curtailment_due}</span></div>
                <div>Amount due: <span className="text-foreground font-semibold">${u.amount_due?.toLocaleString()}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.recommended_action && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 px-4 py-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: DEH_COLOR }} />
          <p className="text-sm text-foreground leading-relaxed">{summary.recommended_action}</p>
        </div>
      )}
    </div>
  );
}

function PayoffQuoteCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const total = (summary.current_balance ?? 0) + (summary.accrued_interest ?? 0);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-semibold text-foreground">{summary.make_model_year ?? "Unit"}</div>
          <div className="text-xs font-mono text-muted-foreground mt-0.5">{summary.vin}</div>
        </div>
        {summary.quote_id && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Quote ID</div>
            <div className="font-mono text-sm text-foreground">{summary.quote_id}</div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Current Balance",  `$${summary.current_balance?.toLocaleString() ?? "—"}`],
              ["Accrued Interest", `$${summary.accrued_interest?.toLocaleString() ?? "—"}`],
              ["Per-Diem Rate",    `$${summary.per_diem?.toFixed(2) ?? "—"} / day`],
              ["Payoff Date",      summary.payoff_date ?? "—"],
              ["Quote Expires",    summary.quote_expiry ?? "—"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 text-muted-foreground w-44">{label}</td>
                <td className="px-4 py-2.5 font-medium text-foreground tabular-nums">{value}</td>
              </tr>
            ))}
            <tr className="bg-emerald-500/5 border-t-2 border-emerald-500/30">
              <td className="px-4 py-3 font-semibold text-emerald-300">Total Payoff</td>
              <td className="px-4 py-3 font-bold text-emerald-300 tabular-nums text-lg">${total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {summary.email_sent_to && (
        <div className="flex items-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-4 py-3">
          <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-sm text-cyan-300 font-medium">Quote emailed to {summary.email_sent_to}</div>
            {summary.email_status && <div className="text-xs text-muted-foreground mt-0.5">{summary.email_status}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditScheduleCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const docs: string[] = summary.required_docs ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="text-3xl font-bold tabular-nums text-foreground">{summary.days_until_audit ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Days Until Audit</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="font-semibold text-foreground">{summary.next_audit_date ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Audit Date</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="font-semibold capitalize" style={{ color: DEH_COLOR }}>{summary.audit_type ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Audit Type</div>
        </div>
      </div>

      {docs.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Required Documents ({docs.length})
          </div>
          <div className="space-y-2">
            {docs.map((doc: string, i: number) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.absent_unit_policy && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">Absent Unit Policy</span>
          </div>
          <p className="text-sm text-amber-300/90 leading-relaxed">{summary.absent_unit_policy}</p>
        </div>
      )}
    </div>
  );
}

function HumanHandoffCard({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-cyan-500/50 bg-cyan-500/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
          <span className="font-semibold text-cyan-300">Escalated — Human Review Required</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-muted-foreground mb-1">Requested</div>
            <div className="text-xl font-bold tabular-nums text-foreground">${summary.requested_amount?.toLocaleString() ?? "—"}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-muted-foreground mb-1">Autonomous Limit</div>
            <div className="text-xl font-bold tabular-nums text-foreground">${summary.autonomous_limit?.toLocaleString() ?? "—"}</div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Units in scope: <span className="text-foreground font-medium">{summary.units_in_scope ?? "—"}</span>
          <span className="mx-2">·</span>
          Routed to: <span className="text-foreground font-medium">{summary.routed_to ?? "—"}</span>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1.5">Reason for escalation</div>
        <p className="text-sm text-amber-300/90 leading-relaxed">{summary.reason ?? "—"}</p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4 shrink-0" />
        Expected response: <span className="text-foreground ml-1">{summary.estimated_response ?? "—"}</span>
      </div>
    </div>
  );
}

function ResultCard({ scenario, summary }: { scenario: ScenarioKey; summary: any }) {
  if (!summary) return null;
  switch (scenario) {
    case "floorplan-status": return <FloorplanStatusCard summary={summary} />;
    case "payoff-quote":     return <PayoffQuoteCard summary={summary} />;
    case "audit-schedule":   return <AuditScheduleCard summary={summary} />;
    case "human-handoff":    return <HumanHandoffCard summary={summary} />;
    default:                 return null;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SolifiDealerDemo() {
  const [scenario, setScenario]     = useState<ScenarioKey>("floorplan-status");
  const [running, setRunning]       = useState(false);
  const [events, setEvents]         = useState<LiveEvent[]>([]);
  const [logOpen, setLogOpen]       = useState(false);
  const [agentRun, setAgentRun]     = useState<AgentRun>({ state: "idle", toolCalls: 0 });
  const [humanGate, setHumanGate]   = useState<any>(null);
  const [runComplete, setRunComplete] = useState<any>(null);

  const esRef      = useRef<EventSource | null>(null);
  const logEndRef  = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef(0);

  const addEvent = useCallback((type: string, d: any) => {
    const message = formatEvent(type, d);
    setEvents(prev => [...prev, { id: ++eventIdRef.current, type, message, timestamp: new Date() }]);
  }, []);

  useEffect(() => {
    if (logOpen) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, logOpen]);

  const handleRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    setEvents([]);
    setHumanGate(null);
    setRunComplete(null);
    setAgentRun({ state: "idle", toolCalls: 0 });

    const url = `/demo-api/solifi-dealer/live-run?scenario=${encodeURIComponent(scenario)}`;
    const es  = new EventSource(url);
    esRef.current = es;

    const handle = (name: string) => {
      es.addEventListener(name, (evt: MessageEvent) => {
        const d = safeParse(evt.data);
        addEvent(name, d);

        if (name === "agent_start") {
          setAgentRun(prev => ({ ...prev, state: "running", agentId: d.agentId, deploymentId: d.deploymentId, startedAt: Date.now() }));
        }
        if (name === "agent_event" && d.type === "tool_call_result") {
          setAgentRun(prev => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
        }
        if (name === "agent_complete") {
          setAgentRun(prev => ({
            ...prev,
            state:       d.success === false ? "fail" : "ok",
            finishedAt:  Date.now(),
            summary:     d.resultSummary,
          }));
        }
        if (name === "human_gate")   setHumanGate(d);
        if (name === "run_complete") { setRunComplete(d); setRunning(false); es.close(); }
        if (name === "error")        { setRunning(false); es.close(); }
      });
    };

    ["run_start", "setup", "agent_start", "agent_event", "agent_complete",
     "human_gate", "run_complete", "error"].forEach(handle);

    es.onerror = () => { setRunning(false); es.close(); };
  }, [running, scenario, addEvent]);

  const handleReset = useCallback(async () => {
    esRef.current?.close();
    setRunning(false);
    setEvents([]);
    setHumanGate(null);
    setRunComplete(null);
    setAgentRun({ state: "idle", toolCalls: 0 });
    setLogOpen(false);
    await fetch("/demo-api/solifi-dealer/reset", { method: "POST" }).catch(() => {});
  }, []);

  const { data: agentRunsData } = useQuery({
    queryKey: ["/demo-api/solifi-dealer/agent-runs"],
    refetchInterval: running ? 3000 : false,
  });

  const agentRegistryId = (agentRunsData as any)?.[0]?.agentId ?? agentRun.agentId;
  const scenarioDef     = SCENARIOS.find(s => s.key === scenario)!;
  const elapsedSec      = agentRun.startedAt && agentRun.finishedAt
    ? ((agentRun.finishedAt - agentRun.startedAt) / 1000).toFixed(1)
    : null;

  const hasResult = agentRun.state === "ok" && agentRun.summary;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: DEH_COLOR }}>
              <Car className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted-foreground">{CLIENT} · {PIPELINE}</div>
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
              className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold rounded text-white disabled:opacity-50 transition-opacity"
              style={{ background: running ? "#6b7280" : DEH_COLOR }}
              data-testid="button-run"
            >
              {running
                ? <><Activity className="w-4 h-4 animate-pulse" /> Running…</>
                : <><Play className="w-4 h-4" /> Run Demo</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Scenario selector ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SCENARIOS.map(s => {
            const Icon = s.icon;
            const active = scenario === s.key;
            return (
              <button
                key={s.key}
                onClick={() => !running && setScenario(s.key)}
                disabled={running}
                data-testid={`scenario-${s.key}`}
                className={`text-left rounded-xl border p-4 transition-all ${
                  active
                    ? "border-2 bg-muted/20"
                    : "border-border hover:border-muted-foreground/40"
                } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                style={active ? { borderColor: DEH_COLOR } : {}}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 shrink-0" style={active ? { color: DEH_COLOR } : { color: "var(--muted-foreground)" }} />
                  <span className="text-sm font-semibold">{s.label}</span>
                  {s.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                          style={{ background: "#0891B222", color: "#06B6D4" }}>
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              </button>
            );
          })}
        </div>

        {/* ── Running pulse ───────────────────────────────────────────────── */}
        {running && (
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 px-5 py-4 flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-400 animate-pulse shrink-0" />
            <div>
              <div className="text-sm font-semibold text-blue-300">Agent running on Claude…</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {scenarioDef.label}
                {agentRun.toolCalls > 0 && <span className="ml-2">· {agentRun.toolCalls} tool call{agentRun.toolCalls !== 1 ? "s" : ""} completed</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Human Gate panel ────────────────────────────────────────────── */}
        {humanGate && (
          <div className="rounded-xl border border-cyan-500/50 bg-cyan-500/5 px-5 py-4" data-testid="human-gate-panel">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-cyan-300">Human Approval Required</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-400 uppercase tracking-wide">
                {humanGate.gate_type ?? "review"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{humanGate.message}</p>
            {humanGate.context && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3">
                {Object.entries(humanGate.context).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>
                    <span className="text-foreground font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {humanGate.policy_ref && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="w-3 h-3 shrink-0" />
                Policy: <span className="font-mono ml-1">{humanGate.policy_ref}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Result panel (hero) ─────────────────────────────────────────── */}
        {hasResult && (
          <div className="rounded-xl border overflow-hidden" data-testid="result-panel"
               style={{ borderColor: `${DEH_COLOR}55` }}>
            <div className="px-5 py-4 border-b flex items-center gap-3"
                 style={{ background: `${DEH_COLOR}11`, borderColor: `${DEH_COLOR}33` }}>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{scenarioDef.label}</div>
                {agentRun.summary?.summary && (
                  <div className="text-sm text-muted-foreground mt-0.5 leading-snug">{agentRun.summary.summary}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {elapsedSec && (
                  <span className="text-xs text-muted-foreground">{elapsedSec}s</span>
                )}
                {agentRegistryId && (
                  <Link href={`/agents/${agentRegistryId}`}>
                    <span className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
                      <ExternalLink className="w-3 h-3" /> Agent
                    </span>
                  </Link>
                )}
              </div>
            </div>
            <div className="px-5 py-5">
              <ResultCard scenario={scenario} summary={agentRun.summary} />
            </div>
          </div>
        )}

        {/* ── Idle / fail state ───────────────────────────────────────────── */}
        {agentRun.state === "idle" && !running && (
          <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
            <Car className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">
              Select a scenario above and click <span className="font-semibold text-foreground">Run Demo</span>
            </div>
          </div>
        )}
        {agentRun.state === "fail" && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 px-5 py-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="text-sm text-red-300">Agent run failed. Check the activity log below for details.</div>
          </div>
        )}

        {/* ── Activity log (collapsed by default) ────────────────────────── */}
        <div className="border rounded-xl overflow-hidden" data-testid="sse-trace-log">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors"
            onClick={() => setLogOpen(o => !o)}
            data-testid="button-toggle-log"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">Activity log</span>
              {events.length > 0 && (
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums text-muted-foreground">
                  {events.length} events
                </span>
              )}
            </div>
            {logOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {logOpen && (
            <div className="bg-black/90 font-mono text-xs p-4 h-64 overflow-y-auto">
              {events.length === 0 && (
                <div className="text-white/20 italic">No activity yet — run a scenario to see live events.</div>
              )}
              {events.map(ev => (
                <div key={ev.id} className="flex gap-2 mb-0.5 leading-relaxed">
                  <span className="text-white/20 shrink-0 tabular-nums">{ev.timestamp.toTimeString().slice(0, 8)}</span>
                  <span className={`shrink-0 font-semibold ${EVENT_COLORS[ev.type] ?? "text-white/60"}`}>[{ev.type}]</span>
                  <span className="text-white/70 break-all">{ev.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
