import { CheckCircle2, Clock, Truck, Mail, FileText, Shield, TrendingUp, Server, Warehouse, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_CONTEXT, BLOCKING_ISSUES, RELEASE_ACTIONS, type OrderPipelineState } from "./otc-order-constants";

interface Props {
  pipelineState: OrderPipelineState;
}

const ACTION_ICONS: Record<string, any> = {
  server:    Server,
  warehouse: Warehouse,
  truck:     Truck,
  mail:      Mail,
  file:      FileText,
  shield:    Shield,
  trending:  TrendingUp,
};

const AGENT_COLOR: Record<string, string> = {
  "OTC-AGT-002": "text-orange-400",
  "OTC-AGT-003": "text-blue-400",
  "OTC-AGT-004": "text-violet-400",
  "OTC-AGT-005": "text-cyan-400",
  "OTC-AGT-006": "text-pink-400",
  "OTC-AGT-007": "text-indigo-400",
  "OTC-AGT-012": "text-teal-400",
  "SYSTEM":      "text-muted-foreground/60",
};

const AUDIT_EVENTS = [
  { time: "T+0:00", agent: "SYSTEM",      event: "RUSH order ORD-2026-78432 received — initiating parallel validation" },
  { time: "T+0:04", agent: "OTC-AGT-002", event: "Address validation started — comparing ERP master vs. PO ship-to" },
  { time: "T+0:04", agent: "OTC-AGT-003", event: "Credit exposure analysis started — limit $500K at 91.9% utilisation" },
  { time: "T+0:04", agent: "OTC-AGT-004", event: "Inventory availability check started — Chicago DC + Atlanta Hub" },
  { time: "T+0:38", agent: "OTC-AGT-004", event: "VAL-003 CLEARED — Chicago-only fulfillment confirmed, $840 saved" },
  { time: "T+0:51", agent: "OTC-AGT-002", event: "VAL-004 CLEARED — Suite 110 removed, ERP master updated" },
  { time: "T+1:12", agent: "OTC-AGT-003", event: "VAL-002 CLEARED — Temp limit $950K approved, 60-day window" },
  { time: "T+1:18", agent: "OTC-AGT-002", event: "Resolution synthesis complete — 8/8 checks PASS" },
  { time: "T+1:44", agent: "OTC-AGT-002", event: "Order released — ERP confirmed — pick ticket to Chicago DC" },
  { time: "T+1:44", agent: "SYSTEM",      event: "Pipeline complete — order ORD-2026-78432 in fulfilment" },
];

export default function OtcOrderS3Release({ pipelineState }: Props) {
  const { status, elapsedSeconds, results } = pipelineState;
  const isComplete = status === "complete";
  const isRunning  = status === "running";
  const released   = isComplete || results.some(r => r.role === "order_release");

  const runtimeLabel = elapsedSeconds > 0
    ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
    : "4 min 12 sec";

  return (
    <div className="h-full overflow-y-auto px-6 py-5">

      {/* ── Time-saved comparison callout ────────────────────────────────── */}
      {released && (
        <div
          data-testid="time-saved-callout"
          className="mb-4 rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] font-semibold text-foreground">Time Saved vs. Manual Process</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Before */}
            <div className="flex-1 rounded-lg border border-border/30 bg-muted/15 px-3 py-2 text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Traditional Process</p>
              <p className="text-[18px] font-bold text-muted-foreground/50 tabular-nums leading-none">~2.3 days</p>
              <p className="text-[7px] text-muted-foreground/40 mt-0.5">Manual review · email approvals · ERP re-keying</p>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="w-8 h-0.5 bg-gradient-to-r from-muted-foreground/20 to-orange-400/60 rounded" />
              <span className="text-[8px] text-orange-400 font-semibold">→</span>
              <div className="text-[7px] text-green-400 font-bold">97.5% faster</div>
            </div>

            {/* After */}
            <div className="flex-1 rounded-lg border border-green-500/30 bg-green-500/6 px-3 py-2 text-center">
              <p className="text-[8px] text-green-400/80 uppercase tracking-wide mb-0.5">AI Agent Orchestration</p>
              <p className="text-[18px] font-bold text-green-400 tabular-nums leading-none">{runtimeLabel}</p>
              <p className="text-[7px] text-green-400/50 mt-0.5">3 agents · parallel · fully automated</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Green release banner ─────────────────────────────────────────── */}
      <div className={`rounded-xl border mb-5 p-4 transition-all duration-700 ${
        released
          ? "border-green-500/30 bg-green-500/8"
          : isRunning
          ? "border-orange-500/20 bg-orange-500/5 animate-pulse"
          : "border-border/30 bg-muted/10"
      }`}>
        <div className="flex items-center gap-3">
          {released ? (
            <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-muted-foreground/60" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-foreground">{ORDER_CONTEXT.orderId}</h2>
              <Badge className="text-[9px] px-1.5" style={{ background: "rgba(255,107,53,0.15)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.3)" }}>
                RUSH
              </Badge>
              {released && (
                <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                  RELEASED ✓
                </Badge>
              )}
              {isRunning && !released && (
                <Badge className="text-[9px] animate-pulse" style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.25)" }}>
                  Processing…
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ORDER_CONTEXT.customer} · {ORDER_CONTEXT.valueLabel} · {ORDER_CONTEXT.lineCount} SKUs · Requested ship {ORDER_CONTEXT.requestedShipDate}
            </p>
            {released && (
              <p className="text-[10px] text-green-400 mt-1">
                All 8 validation checks cleared in {runtimeLabel} · Delivery promise May 2–3, 2026 · Chicago DC
              </p>
            )}
          </div>
          {released && (
            <div className="text-right shrink-0">
              <p className="text-xl font-bold text-green-400">{ORDER_CONTEXT.valueLabel}</p>
              <p className="text-[10px] text-muted-foreground">Net order value</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">

        {/* ── Left — Resolutions summary ──────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold text-foreground mb-3">Blocking Issues Resolved</h3>
          <div className="space-y-2 mb-5">
            {BLOCKING_ISSUES.map(issue => (
              <div
                key={issue.checkId}
                data-testid={`release-issue-${issue.checkId}`}
                className={`rounded-lg border p-3 transition-all ${
                  released || isComplete ? "border-green-500/20 bg-green-500/5" : "border-border/30 bg-muted/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  {(released || isComplete)
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                    : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-foreground">{issue.title}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/50">{issue.checkId}</span>
                      <span className={`text-[9px] font-mono font-semibold ${AGENT_COLOR[issue.agent] ?? "text-muted-foreground/50"}`}>{issue.agent}</span>
                    </div>
                    <p className={`text-[10px] leading-relaxed ${released ? "text-green-300/80" : "text-muted-foreground/60"}`}>
                      {released ? issue.resolution : issue.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Downstream actions with agent attribution */}
          <h3 className="text-[11px] font-semibold text-foreground mb-3">Downstream Actions</h3>
          <div className="space-y-1.5">
            {RELEASE_ACTIONS.map(action => {
              const Icon = ACTION_ICONS[action.icon] || FileText;
              const done    = released && action.status === "complete";
              const pending = action.status === "pending";
              return (
                <div
                  key={action.id}
                  data-testid={`release-action-${action.id}`}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-all ${
                    done    ? "border-green-500/20 bg-green-500/5"
                    : pending ? "border-border/20 bg-muted/10 opacity-70"
                    : "border-border/20 bg-muted/10"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                    done ? "bg-green-500/15" : "bg-muted/30"
                  }`}>
                    <Icon className={`w-3 h-3 ${done ? "text-green-400" : "text-muted-foreground/60"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-foreground/80">{action.label}</span>
                      {/* Agent attribution */}
                      <span className={`text-[8px] font-mono font-semibold ${AGENT_COLOR[action.agentCode] ?? "text-muted-foreground/50"}`}>
                        {action.agentCode}
                      </span>
                      {pending && (
                        <span className="text-[8px] px-1 rounded bg-muted/30 text-muted-foreground/60 border border-border/20">pending ship</span>
                      )}
                      {done && (
                        <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/60 leading-relaxed">{action.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right — Audit timeline ──────────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold text-foreground mb-3">
            Audit Timeline
            {released && (
              <span className="ml-2 text-[9px] text-green-400 font-normal">
                Complete in {runtimeLabel} ✓
              </span>
            )}
          </h3>
          <div className="border border-border/30 rounded-lg overflow-hidden">
            {AUDIT_EVENTS.map((ev, i) => {
              const isSystem = ev.agent === "SYSTEM";
              const isFinal  = ev.agent === "SYSTEM" && ev.event.includes("complete");
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-3 py-2 border-b border-border/20 last:border-0 transition-all ${
                    !released && i >= 4 ? "opacity-25" : ""
                  } ${isFinal && released ? "bg-green-500/5" : isSystem ? "bg-muted/10" : ""}`}
                >
                  <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0 mt-0.5 w-10">{ev.time}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[9px] font-mono font-semibold shrink-0 ${AGENT_COLOR[ev.agent] ?? "text-muted-foreground/60"}`}>
                      [{ev.agent}]
                    </span>
                    <p className={`text-[10px] mt-0.5 leading-relaxed ${isFinal ? "text-green-300/90 font-medium" : "text-foreground/70"}`}>
                      {ev.event}
                    </p>
                  </div>
                  {released && (isFinal || i < AUDIT_EVENTS.length - 1) && (
                    <CheckCircle2 className={`w-3 h-3 shrink-0 mt-0.5 ${isFinal ? "text-green-400" : "text-green-400/50"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Fulfillment summary card */}
          {released && (
            <div className="mt-3 rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-[10px] font-semibold text-foreground mb-2">Fulfilment Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["Fulfillment",     "Chicago DC"],
                  ["Ship Date",       "May 2–3, 2026"],
                  ["Delivery",        "May 2–3, 2026"],
                  ["Transit",         "1 day"],
                  ["Split-Ship",      "Avoided — $840 saved"],
                  ["RUSH Surcharge",  "$1,800 (MSA §7.4(b))"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground/60">{k}</span>
                    <span className="text-[9px] text-foreground/80 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!released && !isRunning && (
            <div className="mt-3 px-3 py-3 rounded-lg border border-border/20 bg-muted/10 text-center">
              <Truck className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground/50">Order release audit will appear here after pipeline completes.</p>
            </div>
          )}

          {isRunning && !released && (
            <div className="mt-3 px-3 py-2 rounded-lg border border-orange-500/20 bg-orange-500/5 animate-pulse">
              <p className="text-[10px] text-orange-400/80">Pipeline running — awaiting release confirmation…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
