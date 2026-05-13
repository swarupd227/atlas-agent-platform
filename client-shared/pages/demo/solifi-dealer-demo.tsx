import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Play, RotateCcw, Activity, Terminal, ChevronUp, ChevronDown,
  CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Car, DollarSign, CalendarCheck, Users, FileText,
  ArrowUpCircle, Info, XCircle, ChevronRight, Mail,
} from "lucide-react";

const DEH_COLOR   = "#E8640A";
const DEH_AMBER   = "#F59E0B";
const DEMO_TITLE  = "Dealer Experience Hub";
const CLIENT      = "Solifi";
const PIPELINE    = "DEH-CONV-001";

type ScenarioKey = "floorplan-status" | "payoff-quote" | "audit-schedule" | "human-handoff";
type AgentState  = "idle" | "running" | "ok" | "fail";

interface LiveEvent {
  id:        number;
  type:      string;
  message:   string;
  timestamp: Date;
}

interface AgentRun {
  state:      AgentState;
  toolCalls:  number;
  summary?:   any;
  agentId?:   string;
  deploymentId?: string;
  startedAt?: number;
  finishedAt?: number;
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
    description: "Pacific Powersports asks: 'Pull up our floorplan — are any units overdue?' Agent retrieves 23 financed units, surfaces 2 units 15+ days past expected sale with curtailments due within 7 days, and recommends immediate action.",
  },
  {
    key:         "payoff-quote",
    label:       "Payoff Quote — Kawasaki Ninja ZX-6R",
    icon:        DollarSign,
    description: "Dealer has sold a unit and needs a payoff quote for Friday. Agent calls get_unit_details then get_payoff_quote, returns exact payoff amount, per-diem rate, wire instructions, and sends the quote by email via human approval gate.",
  },
  {
    key:         "audit-schedule",
    label:       "Audit Schedule + Policy Q&A",
    icon:        CalendarCheck,
    description: "Pacific Powersports asks when their next audit is, what to prepare, and what happens if a demo unit isn't on the lot. Agent retrieves the schedule then searches the policy KB to answer the absent-unit question.",
  },
  {
    key:         "human-handoff",
    label:       "Human Handoff — Bulk Curtailment",
    badge:       "Human Gate",
    icon:        Users,
    description: "$47,200 bulk curtailment deferral across 4 aged snowmobiles — exceeds the $25,000 autonomous threshold. Agent identifies the constraint via policy KB and routes to the assigned Solifi account manager with full context.",
  },
];

const EVENT_COLORS: Record<string, string> = {
  run_start:       "text-blue-400",
  setup:           "text-white/40",
  agent_start:     "text-emerald-400",
  agent_event:     "text-purple-400",
  agent_complete:  "text-emerald-300",
  human_gate:      "text-cyan-300",
  run_complete:    "text-emerald-400",
  error:           "text-red-400",
};

function formatEvent(eventName: string, d: any): string {
  if (!d || typeof d !== "object") return String(d ?? "");
  switch (eventName) {
    case "run_start":
      return `Pipeline ${d.pipeline ?? ""} starting · scenario: ${d.scenario ?? ""}`;
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
        const err = sub.error ? ` — ${String(sub.error).slice(0, 160)}` : "";
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

// ─── Tool result card components ─────────────────────────────────────────────

function FloorplanStatusCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const flagged: any[] = summary.units_requiring_action ?? [];
  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">{summary.total_units ?? "—"}</div>
          <div className="text-muted-foreground mt-0.5">Units Financed</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold tabular-nums" style={{ color: DEH_COLOR }}>
            {summary.flagged_units ?? 0}
          </div>
          <div className="text-muted-foreground mt-0.5">Units Flagged</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            ${summary.total_balance != null ? (summary.total_balance / 1000).toFixed(0) + "K" : "—"}
          </div>
          <div className="text-muted-foreground mt-0.5">Total Balance</div>
        </div>
      </div>

      {flagged.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide font-medium mb-2" style={{ color: DEH_COLOR }}>
            Units Requiring Immediate Action
          </div>
          <div className="space-y-2">
            {flagged.map((u: any, i: number) => (
              <div key={i} className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">{u.make_model_year ?? `Unit ${i + 1}`}</span>
                  <span className="font-mono text-muted-foreground">{u.vin}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div>Days on floor: <span className="text-foreground font-medium">{u.days_on_floor}</span></div>
                  <div>Curtailment due: <span className="text-foreground font-medium">{u.curtailment_due}</span></div>
                  <div>Amount due: <span className="text-foreground font-medium">${u.amount_due?.toLocaleString()}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.recommended_action && (
        <div className="flex items-start gap-2 text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border">
          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: DEH_COLOR }} />
          <span>{summary.recommended_action}</span>
        </div>
      )}
    </div>
  );
}

function PayoffQuoteCard({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-foreground text-sm">{summary.make_model_year ?? "Unit"}</div>
          <div className="font-mono text-muted-foreground">{summary.vin}</div>
        </div>
        {summary.quote_id && (
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Quote ID</div>
            <div className="font-mono text-foreground">{summary.quote_id}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[11px]">
          <tbody>
            {[
              ["Current Balance",    `$${summary.current_balance?.toLocaleString() ?? "—"}`],
              ["Accrued Interest",   `$${summary.accrued_interest?.toLocaleString() ?? "—"}`],
              ["Per-Diem Rate",      `$${summary.per_diem?.toFixed(2) ?? "—"} / day`],
              ["Payoff Date",        summary.payoff_date ?? "—"],
              ["Quote Expiry",       summary.quote_expiry ?? "—"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-muted-foreground w-40">{label}</td>
                <td className="px-3 py-2 font-medium text-foreground tabular-nums">{value}</td>
              </tr>
            ))}
            <tr className="bg-emerald-500/5 border-t-2 border-emerald-500/30">
              <td className="px-3 py-2.5 font-semibold text-emerald-300">Total Payoff</td>
              <td className="px-3 py-2.5 font-bold text-emerald-300 tabular-nums text-sm">
                ${((summary.current_balance ?? 0) + (summary.accrued_interest ?? 0)).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {summary.email_sent_to && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/5 px-3 py-2">
          <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-cyan-300">
            Quote emailed to <span className="font-medium">{summary.email_sent_to}</span>
            {summary.email_status && ` · ${summary.email_status}`}
          </span>
        </div>
      )}
    </div>
  );
}

function AuditScheduleCard({ summary }: { summary: any }) {
  if (!summary) return null;
  const docs: string[] = summary.required_docs ?? [];
  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">{summary.days_until_audit ?? "—"}</div>
          <div className="text-muted-foreground mt-0.5">Days Until Audit</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="font-semibold text-foreground">{summary.next_audit_date ?? "—"}</div>
          <div className="text-muted-foreground mt-0.5">Audit Date</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="font-semibold" style={{ color: DEH_COLOR }}>{summary.audit_type ?? "—"}</div>
          <div className="text-muted-foreground mt-0.5">Audit Type</div>
        </div>
      </div>

      {docs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Required Documentation Checklist
          </div>
          <div className="space-y-1.5">
            {docs.map((doc: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.absent_unit_policy && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Absent Unit Policy
          </div>
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/25 rounded-lg p-3">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span className="text-amber-300/90 leading-relaxed">{summary.absent_unit_policy}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HumanHandoffCard({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-lg border border-cyan-500/50 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
          <span className="font-semibold text-sm text-cyan-300">Human Review Required</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground mb-3">
          <div>Request type: <span className="text-foreground capitalize">{(summary.request_type ?? "").replace(/_/g, " ")}</span></div>
          <div>Units in scope: <span className="text-foreground font-medium">{summary.units_in_scope ?? "—"}</span></div>
          <div>Requested: <span className="text-foreground font-medium">${summary.requested_amount?.toLocaleString() ?? "—"}</span></div>
          <div>Auto limit: <span className="text-foreground font-medium">${summary.autonomous_limit?.toLocaleString() ?? "—"}</span></div>
        </div>
        <div className="text-muted-foreground">
          Routed to: <span className="text-foreground font-medium">{summary.routed_to ?? "—"}</span>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-1">Reason</div>
        <p className="text-amber-300/90 leading-relaxed">{summary.reason ?? "—"}</p>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        <span>Expected response: <span className="text-foreground">{summary.estimated_response ?? "—"}</span></span>
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
  const [scenario, setScenario] = useState<ScenarioKey>("floorplan-status");
  const [running, setRunning]   = useState(false);
  const [events, setEvents]     = useState<LiveEvent[]>([]);
  const [logOpen, setLogOpen]   = useState(false);
  const [agentRun, setAgentRun] = useState<AgentRun>({ state: "idle", toolCalls: 0 });
  const [humanGate, setHumanGate] = useState<any>(null);
  const [runComplete, setRunComplete] = useState<any>(null);

  const esRef     = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef(0);

  const addEvent = useCallback((type: string, d: any) => {
    const message = formatEvent(type, d);
    setEvents(prev => [...prev, {
      id:        ++eventIdRef.current,
      type,
      message,
      timestamp: new Date(),
    }]);
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
    setLogOpen(true);

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
        if (name === "agent_event") {
          if (d.type === "tool_call_result") {
            setAgentRun(prev => ({ ...prev, toolCalls: prev.toolCalls + 1 }));
          }
        }
        if (name === "agent_complete") {
          setAgentRun(prev => ({
            ...prev,
            state:      d.success === false ? "fail" : "ok",
            finishedAt: Date.now(),
            summary:    d.resultSummary,
          }));
        }
        if (name === "human_gate") setHumanGate(d);
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
     "human_gate", "run_complete", "error",
    ].forEach(handle);

    es.onerror = () => { setRunning(false); es.close(); };
  }, [running, scenario, addEvent]);

  const handleReset = useCallback(async () => {
    esRef.current?.close();
    setRunning(false);
    setEvents([]);
    setHumanGate(null);
    setRunComplete(null);
    setAgentRun({ state: "idle", toolCalls: 0 });
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

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: DEH_COLOR }}>
              <Car className="w-4 h-4 text-white" />
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

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Description ───────────────────────────────────────────────────── */}
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Live conversational AI agent (DEH-CONV-001 on real Claude) serves Pacific Powersports — a Solifi-financed
          powersports dealer. Natural-language dealer queries resolve via 8 Solifi Experience Hub MCP tools: floorplan
          status, payoff quotes, audit schedules, credit applications, payment history, and policy KB. Transactional
          actions above threshold route to human approval.
        </p>

        {/* ── Scenario selector ─────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Scenario</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCENARIOS.map(s => {
              const Icon = s.icon;
              return (
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
                  style={scenario === s.key ? { borderColor: DEH_COLOR } : {}}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 shrink-0" style={scenario === s.key ? { color: DEH_COLOR } : { color: "var(--muted-foreground)" }} />
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
        </div>

        {/* ── Agent status card ─────────────────────────────────────────────── */}
        <div className="border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
            {PIPELINE} · Active Scenario: {scenarioDef.label}
          </div>
          <div className={`rounded-lg border p-4 transition-colors ${
            agentRun.state === "running" ? "border-blue-500/50 bg-blue-500/5" :
            agentRun.state === "ok"      ? "border-emerald-500/50 bg-emerald-500/5" :
            agentRun.state === "fail"    ? "border-red-500/50 bg-red-500/5" :
            "border-border"
          }`} data-testid="agent-card-DEH-CONV-001">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4" style={{ color: DEH_COLOR }} />
                <span className="text-[10px] font-mono text-muted-foreground">DEH-CONV-001</span>
              </div>
              {agentRegistryId && (
                <Link href={`/agents/${agentRegistryId}`}>
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">
                    <ExternalLink className="w-3 h-3" /> Registry
                  </span>
                </Link>
              )}
            </div>
            <div className="text-sm font-medium mb-1">Solifi Dealer Experience Agent</div>
            <div className="text-[11px] text-muted-foreground mb-2">
              1 MCP server · 8 tools · Claude claude-haiku-4-5 · Automotive Finance
            </div>
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
                <Clock className="w-3 h-3" /> Idle — select a scenario and click Run Demo
              </div>
            )}
          </div>
        </div>

        {/* ── Human Gate panel ─────────────────────────────────────────────── */}
        {humanGate && (
          <div className="border border-cyan-500/50 bg-cyan-500/5 rounded-lg p-5" data-testid="human-gate-panel">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-sm text-cyan-300">Human Approval Gate</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-400 uppercase tracking-wide">
                {humanGate.gate_type ?? "review"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{humanGate.message}</p>
            {humanGate.context && (
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {Object.entries(humanGate.context).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>
                    <span className="text-foreground font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {humanGate.policy_ref && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <FileText className="w-3 h-3 shrink-0" />
                Policy: <span className="font-mono">{humanGate.policy_ref}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Result panel ─────────────────────────────────────────────────── */}
        {agentRun.state === "ok" && agentRun.summary && (
          <div className="border rounded-lg overflow-hidden" data-testid="result-panel">
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm">Agent Result</span>
              <span className="text-xs text-muted-foreground">· {scenarioDef.label}</span>
              {agentRun.summary.status && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted/30">
                  {agentRun.summary.status}
                </span>
              )}
            </div>
            <div className="px-5 py-4">
              <ResultCard scenario={scenario} summary={agentRun.summary} />
            </div>

            {agentRun.summary.summary && (
              <div className="px-5 pb-5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Agent Summary</div>
                <p className="text-xs text-muted-foreground leading-relaxed border-l-2 pl-3" style={{ borderColor: DEH_COLOR }}>
                  {agentRun.summary.summary}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Completion banner ────────────────────────────────────────────── */}
        {runComplete && (
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded-lg p-4 flex items-center gap-3" data-testid="run-complete-banner">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-emerald-300">Run complete</div>
              <div className="text-xs text-muted-foreground mt-0.5">{runComplete.message ?? scenarioDef.label}</div>
            </div>
          </div>
        )}

        {/* ── SSE Trace Log ────────────────────────────────────────────────── */}
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

        {/* ── Platform intelligence strip ──────────────────────────────────── */}
        <div className="border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
            Platform Intelligence — Solifi Experience Hub MCP
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "get_floorplan_status",          desc: "Full inventory + overdue flags" },
              { label: "get_unit_details",               desc: "Per-VIN finance terms" },
              { label: "get_payoff_quote",               desc: "Exact payoff + wire details" },
              { label: "send_payoff_email",              desc: "Quote delivery (human gate)" },
              { label: "get_audit_schedule",             desc: "Upcoming audit + checklist" },
              { label: "get_credit_application_status", desc: "Pipeline + LTV + next action" },
              { label: "get_payment_history",            desc: "Recent payments + balance" },
              { label: "search_dealer_policy_kb",        desc: "Policy + product Q&A" },
            ].map(tool => (
              <div key={tool.label} className="rounded border border-border p-2.5">
                <div className="font-mono text-[10px] text-foreground/80 mb-0.5 truncate">{tool.label}</div>
                <div className="text-[10px] text-muted-foreground leading-snug">{tool.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
