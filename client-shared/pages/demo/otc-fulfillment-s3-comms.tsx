import { Mail, MessageSquare, Bell, CheckCircle, AlertCircle, TrendingUp, Braces, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FulfillmentPipelineState } from "./otc-fulfillment-constants";
import { OTC_FULFILLMENT_COLOR, parseAgentJson } from "./otc-fulfillment-constants";

const ACCENT = OTC_FULFILLMENT_COLOR;

const TIER_TEMPLATES = [
  {
    tier:    "Platinum",
    count:   87,
    channel: "Personal AM Email + SMS",
    icon:    "🥇",
    color:   "text-amber-400",
    border:  "border-amber-400/30",
    bg:      "bg-amber-400/5",
    subject: "Your NovaTech shipment ORD-78432 — revised delivery: Thursday, May 5",
    from:    "Sarah Chen <s.chen@novatech.com>",
    preview: "Hi James,\n\nI'm reaching out personally about your 14 pending shipments under ORD-78432. Due to Winter Storm Stella affecting our Chicago facility, I've proactively rerouted your order through our Dallas DC — your revised delivery date is Thursday, May 5.\n\nA $500 credit has been applied to your account in recognition of the inconvenience. I'll be monitoring your shipment personally and will reach out with any updates.\n\nBest,\nSarah Chen\nNovaTech Senior Account Manager",
    credit:  "$500 credit applied",
  },
  {
    tier:    "Gold",
    count:   225,
    channel: "Branded Email + SMS",
    icon:    "🥈",
    color:   "text-yellow-400",
    border:  "border-yellow-400/30",
    bg:      "bg-yellow-400/5",
    subject: "Your NovaTech Order ORD-77340 — Winter storm delay update",
    from:    "NovaTech Customer Experience <cx@novatech.com>",
    preview: "Dear Vertex Industrial team,\n\nWinter Storm Stella is affecting our Midwest distribution centres. Your shipment (ORD-77340) has been rerouted via our Dallas DC with a new estimated delivery of Thursday, May 5.\n\nA $200 credit has been applied to your account. Track your updated shipment at novatech.com/track.",
    credit:  "$200 credit applied",
  },
  {
    tier:    "Standard",
    count:   535,
    channel: "Portal Notification",
    icon:    "📋",
    color:   "text-slate-400",
    border:  "border-slate-400/30",
    bg:      "bg-slate-400/5",
    subject: null,
    from:    "NovaTech Customer Portal",
    preview: "Your order is experiencing a weather-related delay due to Winter Storm Stella affecting our Midwest facilities. Estimated recovery: 48–72 hours. We will update your delivery date once carrier service resumes. Track your order in your customer portal.",
    credit:  null,
  },
];

const ESCALATIONS = [
  { customer: "Delta Precision Parts",  tier: "Platinum", reason: "SLA breach risk — expedited air recommended",    am: "Maria Lopez",  urgency: "HIGH"   },
  { customer: "Pinnacle Aerospace",     tier: "Platinum", reason: "Callback request — referenced prior delay",       am: "David Kim",    urgency: "HIGH"   },
  { customer: "Western Hydraulics",     tier: "Gold",     reason: "Negative sentiment — contract SLA discussion",    am: "Lisa Torres",  urgency: "MEDIUM" },
];

interface Props { state: FulfillmentPipelineState; }

function JsonValue({ value }: { value: unknown }) {
  if (typeof value === "number") return <span className="text-emerald-400">{value}</span>;
  if (typeof value === "boolean") return <span className="text-amber-400">{String(value)}</span>;
  if (typeof value === "string") return <span className="text-sky-300">"{value}"</span>;
  if (value === null) return <span className="text-slate-400">null</span>;
  if (typeof value === "object") return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
  return <span className="text-foreground">{String(value)}</span>;
}

function AgentJsonSummaryPanel({ agentCode, summary, label }: { agentCode: string; summary: string; label: string }) {
  const json = parseAgentJson(summary);
  const entries = json ? Object.entries(json) : null;
  return (
    <div
      className="rounded-lg border border-emerald-500/25 bg-black/70 p-4"
      data-testid={`json-summary-${agentCode.toLowerCase().replace(/-/g, "")}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Braces className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] font-mono font-semibold text-emerald-400">{agentCode}</span>
        <span className="text-[10px] text-muted-foreground">— {label}</span>
        <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/30 text-emerald-400">JSON Summary</Badge>
      </div>
      {entries ? (
        <div className="font-mono text-[11px] leading-relaxed">
          <span className="text-muted-foreground/60">{"{"}</span>
          <div className="pl-4 flex flex-col gap-0.5">
            {entries.map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-violet-400">"{key}"</span>
                <span className="text-muted-foreground/50">:</span>
                <JsonValue value={val} />
                <span className="text-muted-foreground/40">,</span>
              </div>
            ))}
          </div>
          <span className="text-muted-foreground/60">{"}"}</span>
        </div>
      ) : (
        <div className="font-mono text-[11px] text-muted-foreground/60 italic line-clamp-5 whitespace-pre-wrap">
          {summary || "No summary available"}
        </div>
      )}
    </div>
  );
}

export default function OtcFulfillmentS3Comms({ state }: Props) {
  const agt012   = state.agents.find(a => a.code === "OTC-AGT-012");
  const isRunning = agt012?.status === "running";
  const isDone    = agt012?.status === "complete";
  const notified  = state.metrics.notified;

  const SEND_STATS = isDone
    ? [
        { label: "Queued",    value: 847, color: "text-sky-400"     },
        { label: "Sent",      value: 623, color: "text-blue-400"    },
        { label: "Delivered", value: 589, color: "text-emerald-400" },
        { label: "Opened",    value: 234, color: "text-green-400"   },
      ]
    : [
        { label: "Queued",    value: notified > 0 ? 847 : 0, color: "text-sky-400"     },
        { label: "Sent",      value: 0,   color: "text-blue-400"    },
        { label: "Delivered", value: 0,   color: "text-emerald-400" },
        { label: "Opened",    value: 0,   color: "text-green-400"   },
      ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header status */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: isRunning ? `${ACCENT}10` : isDone ? "#10b98108" : "transparent", borderColor: isRunning ? `${ACCENT}40` : isDone ? "#10b98130" : "transparent" }}
      >
        <Mail className="w-5 h-5 shrink-0 mt-0.5" style={{ color: isRunning ? ACCENT : isDone ? "#10b981" : "#64748b" }} />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: isRunning ? ACCENT : isDone ? "#10b981" : "#64748b" }}>
              {isDone ? "Proactive Notification Complete" : isRunning ? "Sending Customer Notifications…" : "Customer Communication Engine — Awaiting Pipeline"}
            </span>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400 animate-pulse">OTC-AGT-012 Active</Badge>}
            {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">847 Notified</Badge>}
          </div>
          {isDone && (
            <p className="text-xs text-muted-foreground mt-0.5">
              All 847 affected customers notified before inbound call volume increased.
              3 escalation items routed to account managers.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notification preview */}
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            Notification Templates
          </div>
          {TIER_TEMPLATES.map(tmpl => (
            <div
              key={tmpl.tier}
              className={`rounded-lg border p-3 ${tmpl.bg} ${tmpl.border}`}
              data-testid={`notif-template-${tmpl.tier.toLowerCase()}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>{tmpl.icon}</span>
                <span className={`text-xs font-semibold ${tmpl.color}`}>{tmpl.tier}</span>
                <span className="text-[10px] text-muted-foreground">({tmpl.count} customers)</span>
                <Badge variant="outline" className="ml-auto text-[9px] border-border/40">{tmpl.channel}</Badge>
              </div>
              {tmpl.subject && (
                <div className="text-[10px] font-mono text-foreground/70 mb-1 truncate">
                  ✉ {tmpl.subject}
                </div>
              )}
              <div className="text-[10px] font-mono text-foreground/50 mb-1">
                From: {tmpl.from}
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-line">
                {tmpl.preview}
              </div>
              {tmpl.credit && (
                <div className="mt-1.5 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">{tmpl.credit}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Send status + responses */}
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            Communication Dashboard
          </div>

          {/* Live counters */}
          <div className="grid grid-cols-2 gap-2">
            {SEND_STATS.map(s => (
              <div key={s.label} className="rounded-md border border-border/30 bg-card/50 p-3 text-center" data-testid={`send-stat-${s.label.toLowerCase()}`}>
                <div className={`text-2xl font-bold tabular-nums ${s.color}`}>
                  {s.value.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Channel breakdown */}
          <div className="rounded-lg border border-border/40 bg-card/50 p-3">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Bell className="w-3 h-3" style={{ color: ACCENT }} />
              Channel Delivery
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                { ch: "Email",  count: 847, icon: <Mail className="w-3 h-3" />,          note: "All tiers"           },
                { ch: "SMS",    count: 312, icon: <MessageSquare className="w-3 h-3" />, note: "Platinum + Gold"     },
                { ch: "Portal", count: 535, icon: <Bell className="w-3 h-3" />,           note: "Standard (live)"     },
              ].map(c => (
                <div key={c.ch} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground/60">{c.icon}</span>
                  <span className="font-medium w-10">{c.ch}</span>
                  <span className="font-mono">{c.count}</span>
                  <span className="text-muted-foreground/60">{c.note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sentiment + escalations */}
          {isDone && (
            <div className="rounded-lg border border-border/40 bg-card/50 p-3">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-emerald-400" />
                Customer Responses (12)
              </div>
              <div className="flex gap-2 mb-2">
                {[
                  { label: "Positive", count: 7, color: "text-emerald-400" },
                  { label: "Neutral",  count: 2, color: "text-slate-400"   },
                  { label: "Negative", count: 3, color: "text-rose-400"    },
                ].map(s => (
                  <div key={s.label} className="text-center flex-1 rounded border border-border/30 py-1.5">
                    <div className={`text-lg font-bold ${s.color}`}>{s.count}</div>
                    <div className="text-[9px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-400" />
                Escalation Queue (3)
              </div>
              <div className="flex flex-col gap-1.5">
                {ESCALATIONS.map(esc => (
                  <div
                    key={esc.customer}
                    className="rounded border border-border/20 bg-background/30 p-2"
                    data-testid={`escalation-${esc.customer.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold">{esc.customer}</span>
                      <span className={`text-[9px] font-semibold ml-auto ${esc.urgency === "HIGH" ? "text-rose-400" : "text-amber-400"}`}>
                        {esc.urgency}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{esc.reason}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">→ {esc.am}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isDone && state.agentSummaries["OTC-AGT-012"] && (
        <AgentJsonSummaryPanel
          agentCode="OTC-AGT-012"
          summary={state.agentSummaries["OTC-AGT-012"]}
          label="Customer Notification Dispatch"
        />
      )}

      {state.phase === "complete" && (
        <div
          className="rounded-xl border-2 p-5"
          style={{ borderColor: "#10b98145", background: "linear-gradient(135deg, #10b98110 0%, #065f4610 100%)" }}
          data-testid="pipeline-complete-metrics-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-emerald-400" />
            <span className="text-base font-bold text-emerald-400">Pipeline Complete — Crisis Resolved</span>
            <Badge className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">OTC-SCN-003</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Customers Notified", value: "847",  color: "text-emerald-400",  sub: "zero inbound spike" },
              { label: "Shipments Rerouted", value: "312",  color: "text-sky-400",       sub: "Platinum + Gold priority" },
              { label: "SLA Protected",      value: "93%",  color: "text-amber-400",     sub: "289 of 312 compliant" },
              { label: "Incremental Cost",   value: "$47K", color: "text-violet-400",    sub: "Smart Reroute authority" },
            ].map(m => (
              <div
                key={m.label}
                className="rounded-lg border border-border/30 bg-background/40 p-3 text-center"
                data-testid={`pipeline-metric-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</div>
                <div className="text-[10px] font-semibold text-foreground/80 mt-0.5">{m.label}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{m.sub}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-sm font-semibold text-emerald-400 mb-1">
              "Within 8 minutes, Atlas assessed 847 shipments, protected 93% of SLA commitments for $47K, and notified every customer before a single one called."
            </div>
            <div className="text-xs text-muted-foreground">
              Without Atlas: 3–5 days of manual triage, emergency escalation calls, and a 40% spike in customer complaints.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
