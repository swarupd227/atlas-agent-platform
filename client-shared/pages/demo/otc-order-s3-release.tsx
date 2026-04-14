import { CheckCircle2, Clock, Truck, Mail, FileText, Shield, TrendingUp, Server, Warehouse, Zap, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ORDER_CONTEXT, BLOCKING_ISSUES, RELEASE_ACTIONS,
  type OrderPipelineState, type AuditTimelineEvent,
} from "./otc-order-constants";

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
  "SYSTEM":      "text-muted-foreground/50",
};

const AGENT_BG: Record<string, string> = {
  "OTC-AGT-002": "bg-orange-500/10 border-orange-500/20 text-orange-400",
  "OTC-AGT-003": "bg-blue-500/10 border-blue-500/20 text-blue-400",
  "OTC-AGT-004": "bg-violet-500/10 border-violet-500/20 text-violet-400",
  "SYSTEM":      "bg-muted/20 border-border/20 text-muted-foreground/60",
};

// Static fallback events shown before pipeline runs
const STATIC_AUDIT_EVENTS: AuditTimelineEvent[] = [
  { time: "T+0:00", agent: "SYSTEM",      role: "start",                event: "RUSH order received — initiating parallel validation",           elapsedMs: 0     },
  { time: "T+0:04", agent: "OTC-AGT-002", role: "address_validation",   event: "Address validation — ERP master vs. PO ship-to",                 elapsedMs: 4000  },
  { time: "T+0:04", agent: "OTC-AGT-003", role: "credit_validation",    event: "Credit exposure analysis — $500K limit at 91.9%",                elapsedMs: 4000  },
  { time: "T+0:04", agent: "OTC-AGT-004", role: "inventory_validation", event: "Inventory check — Chicago DC + Atlanta Hub",                     elapsedMs: 4000  },
  { time: "T+0:38", agent: "OTC-AGT-004", role: "inventory_validation", event: "VAL-003 CLEARED — Chicago-only, $840 saved",                     elapsedMs: 38000 },
  { time: "T+0:51", agent: "OTC-AGT-002", role: "address_validation",   event: "VAL-004 CLEARED — Suite 110 removed, ERP updated",               elapsedMs: 51000 },
  { time: "T+1:12", agent: "OTC-AGT-003", role: "credit_validation",    event: "VAL-002 CLEARED — $950K temp limit approved (60 days)",          elapsedMs: 72000 },
  { time: "T+1:18", agent: "OTC-AGT-002", role: "resolution_synthesis", event: "Resolution synthesis — 8/8 checks PASS",                        elapsedMs: 78000 },
  { time: "T+1:44", agent: "OTC-AGT-002", role: "order_release",        event: "Order released — ERP confirmed — pick ticket to Chicago DC",     elapsedMs: 104000},
  { time: "T+1:44", agent: "SYSTEM",      role: "complete",             event: "Pipeline complete — ORD-2026-78432 in fulfilment",               elapsedMs: 104000},
];

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Credit Exposure Bar + Payment History ────────────────────────────────────
function CreditExposureBar({ exposurePct, projectedPct, approvedLimit, approvedLimitDays, riskScore, released }: {
  exposurePct: number | null;
  projectedPct: number | null;
  approvedLimit: number | null;
  approvedLimitDays: number | null;
  riskScore: string | null;
  released: boolean;
}) {
  const current  = exposurePct ?? 91.9;
  const newLimit = released ? (approvedLimit ?? 950_000) : 500_000;
  const barPct   = released ? Math.min((459_500 / newLimit) * 100, 100) : Math.min(current, 100);
  const barColor = released ? "bg-green-500" : barPct > 90 ? "bg-red-400" : "bg-yellow-400";

  return (
    <div className="mt-2 space-y-1.5">
      {/* Exposure bar */}
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground/70">Credit Exposure</span>
        <span className={`font-semibold ${released ? "text-green-400" : "text-red-400"}`}>
          {released
            ? `${((459_500 / newLimit) * 100).toFixed(1)}% of $${(newLimit / 1000).toFixed(0)}K`
            : `${current}% of $${(newLimit / 1000).toFixed(0)}K`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-muted-foreground/50">
        <span>$0</span>
        <span>Limit: ${(newLimit / 1000).toFixed(0)}K{released && approvedLimitDays ? ` (${approvedLimitDays}-day temp)` : ""}</span>
      </div>

      {/* Payment history snippet */}
      <div className="mt-1.5 rounded border border-border/20 bg-muted/10 px-2 py-1.5">
        <p className="text-[8px] font-semibold text-muted-foreground/70 mb-1 uppercase tracking-wide">Payment History</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {[
            ["Rating",     "A+ (EXCELLENT)"],
            ["Avg Pay",    "32 days"],
            ["Tenure",     "7 years"],
            ["NSF / Late", "0 / 0 (12 mo)"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-[8px] text-muted-foreground/55">{k}</span>
              <span className={`text-[8px] font-medium ${released ? "text-green-400" : "text-foreground/70"}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      {released ? (
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[9px] text-green-400 font-medium">
            {riskScore ?? "LOW"} Risk — Auto pre-auth approved · 60-day window
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[9px] text-red-400/80">
          <span>⚠ 91.9% utilisation — VAL-002 HOLD · awaiting credit agent</span>
        </div>
      )}
    </div>
  );
}

// ─── Address Before/After Diff ────────────────────────────────────────────────
function AddressDiff({ originalAddress, correctedAddress, confidenceScore, released }: {
  originalAddress: string;
  correctedAddress: string | null;
  confidenceScore: number | null;
  released: boolean;
}) {
  const before = originalAddress;
  const after  = correctedAddress ?? "2847 Industrial Parkway, Detroit MI 48210";

  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className={`rounded border px-2 py-1.5 ${released ? "border-border/20 bg-muted/15 opacity-70" : "border-red-500/30 bg-red-500/5"}`}>
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`text-[7px] uppercase tracking-wide font-semibold ${released ? "text-muted-foreground/50" : "text-red-400/80"}`}>
              {released ? "ERP (before)" : "⚠ ERP Master"}
            </span>
          </div>
          <p className="text-[9px] leading-relaxed text-foreground/60 font-mono">{before}</p>
        </div>
        <div className={`rounded border px-2 py-1.5 ${released ? "border-green-500/30 bg-green-500/5" : "border-border/20 bg-muted/15 opacity-50"}`}>
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`text-[7px] uppercase tracking-wide font-semibold ${released ? "text-green-400/80" : "text-muted-foreground/50"}`}>
              {released ? "✓ Corrected" : "PO ship-to"}
            </span>
          </div>
          <p className="text-[9px] leading-relaxed text-foreground/60 font-mono">{after}</p>
        </div>
      </div>
      {released && (
        <div className="flex items-center gap-1.5 text-[9px] text-green-400">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>Confidence {confidenceScore ?? 94}% · 8 prior deliveries matched · ERP master updated</span>
        </div>
      )}
      {!released && (
        <div className="text-[9px] text-muted-foreground/60">
          "Suite 110" appears in ERP master but absent from all prior delivery records
        </div>
      )}
    </div>
  );
}

// ─── Inventory Warehouse Summary + Pick Tickets ───────────────────────────────
const _WH_STOCK = [
  { id: "CHI", label: "Chicago DC",   units: 8,  transit: "1 day",  recommended: true  },
  { id: "ATL", label: "Atlanta Hub",  units: 4,  transit: "3 days", recommended: false },
  { id: "DAL", label: "Dallas DC",    units: 0,  transit: "2 days", recommended: false },
];

function InventoryPickTickets({ pickTickets, atpDate, savingsAmount, released }: {
  pickTickets: string[];
  atpDate: string | null;
  savingsAmount: number;
  released: boolean;
}) {
  const tickets = released ? (pickTickets.length > 0 ? pickTickets : ["PT-CHI-7842-A", "PT-CHI-7842-B", "PT-CHI-7842-C"]) : [];

  return (
    <div className="mt-2 space-y-1.5">
      {/* Warehouse stock summary — always visible */}
      <div className="rounded border border-border/20 bg-muted/10 px-2 py-1.5">
        <p className="text-[8px] font-semibold text-muted-foreground/70 mb-1 uppercase tracking-wide">Warehouse Stock</p>
        <div className="flex gap-1.5">
          {_WH_STOCK.map(wh => (
            <div
              key={wh.id}
              className={`flex-1 rounded border text-center px-1 py-1 transition-all ${
                released && wh.recommended
                  ? "border-green-500/30 bg-green-500/8"
                  : wh.units > 0
                  ? "border-border/25 bg-muted/8"
                  : "border-border/15 bg-muted/5 opacity-40"
              }`}
            >
              <p className={`text-[8px] font-semibold ${released && wh.recommended ? "text-green-400" : "text-muted-foreground/60"}`}>{wh.id}</p>
              <p className={`text-[11px] font-bold font-mono leading-tight ${released && wh.recommended ? "text-green-400" : wh.units > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>{wh.units}</p>
              <p className={`text-[7px] ${released && wh.recommended ? "text-green-400/70" : "text-muted-foreground/40"}`}>{wh.transit}</p>
            </div>
          ))}
        </div>
      </div>

      {released ? (
        <>
          <div className="flex flex-wrap gap-1">
            {tickets.map(pt => (
              <span key={pt} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
                {pt}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">ATP Date</span>
              <span className="text-[9px] text-foreground/80 font-medium">{atpDate ?? "May 2, 2026"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">Surcharge saved</span>
              <span className="text-[9px] text-green-400 font-medium">${savingsAmount > 0 ? savingsAmount : 840}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-[9px] text-muted-foreground/60">
          ERP flag: TX-7250-A split Chicago (8) + Atlanta (4) — evaluating single-source option
        </div>
      )}
    </div>
  );
}

// ─── Horizontal Audit Timeline ────────────────────────────────────────────────
function HorizontalTimeline({ events, released }: { events: AuditTimelineEvent[]; released: boolean }) {
  const displayEvents = events.length > 0 ? events : (released ? STATIC_AUDIT_EVENTS : STATIC_AUDIT_EVENTS.slice(0, 4));

  return (
    <div className="overflow-x-auto pb-2" data-testid="audit-timeline">
      <div className="flex items-start gap-0 min-w-max">
        {displayEvents.map((ev, i) => {
          const isLast   = i === displayEvents.length - 1;
          const isSystem = ev.agent === "SYSTEM";
          const isFinal  = isSystem && (ev.role === "complete" || ev.event.toLowerCase().includes("complete"));
          const prevMs   = i > 0 ? displayEvents[i - 1].elapsedMs : 0;
          const durationMs = ev.elapsedMs - prevMs;
          const isVisible = released || i < 4;

          return (
            <div key={i} className={`flex items-start transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-20"}`}>
              {/* Event node */}
              <div className="flex flex-col items-center" style={{ width: 120 }}>
                {/* Time label */}
                <span className="text-[8px] font-mono text-muted-foreground/50 mb-1">{ev.time}</span>

                {/* Dot */}
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isFinal && released
                    ? "border-green-500 bg-green-500/20"
                    : released
                    ? "border-green-500/60 bg-green-500/10"
                    : isSystem
                    ? "border-muted-foreground/30 bg-muted/20"
                    : "border-orange-500/40 bg-orange-500/10"
                }`}>
                  {(isFinal && released) && <CheckCircle2 className="w-2 h-2 text-green-400" />}
                </div>

                {/* Agent badge */}
                <span className={`mt-1 text-[7px] font-mono font-semibold px-1 py-0.5 rounded border ${
                  AGENT_BG[ev.agent] ?? "bg-muted/20 border-border/20 text-muted-foreground/60"
                }`}>
                  {ev.agent === "SYSTEM" ? "SYS" : ev.agent.replace("OTC-", "")}
                </span>

                {/* Event text */}
                <p className={`mt-1 text-[8px] leading-tight text-center px-1 ${
                  isFinal && released ? "text-green-300/90 font-medium" : "text-foreground/60"
                }`} style={{ maxWidth: 108 }}>
                  {ev.event}
                </p>

                {/* Duration badge */}
                {released && i > 0 && durationMs > 0 && (
                  <div className="mt-1 flex items-center gap-0.5">
                    <Timer className="w-2 h-2 text-muted-foreground/40" />
                    <span className="text-[7px] text-muted-foreground/40">{fmtMs(durationMs)}</span>
                  </div>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex items-center" style={{ width: 16, marginTop: 20 }}>
                  <div className={`h-0.5 w-full rounded ${
                    released ? "bg-green-500/40" : "bg-border/30"
                  }`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function OtcOrderS3Release({ pipelineState }: Props) {
  const { status, elapsedSeconds, results, creditPanel, inventoryPanel, addressPanel, auditTimeline } = pipelineState;
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
            <div className="flex-1 rounded-lg border border-border/30 bg-muted/15 px-3 py-2 text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Traditional Process</p>
              <p className="text-[18px] font-bold text-muted-foreground/50 tabular-nums leading-none">~2.3 days</p>
              <p className="text-[7px] text-muted-foreground/40 mt-0.5">Manual review · email approvals · ERP re-keying</p>
            </div>
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="w-8 h-0.5 bg-gradient-to-r from-muted-foreground/20 to-orange-400/60 rounded" />
              <span className="text-[8px] text-orange-400 font-semibold">→</span>
              <div className="text-[7px] text-green-400 font-bold">97.5% faster</div>
            </div>
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
              {released && <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">RELEASED ✓</Badge>}
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

        {/* ── Left — Resolution panels with live SSE state ─────────────── */}
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-foreground">{issue.title}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/50">{issue.checkId}</span>
                      <span className={`text-[9px] font-mono font-semibold ${AGENT_COLOR[issue.agent] ?? "text-muted-foreground/50"}`}>{issue.agent}</span>
                    </div>
                    <p className={`text-[10px] leading-relaxed ${released ? "text-green-300/80" : "text-muted-foreground/60"}`}>
                      {released ? issue.resolution : issue.detail}
                    </p>

                    {/* ── VAL-002: Credit exposure bar ── */}
                    {issue.checkId === "VAL-002" && (
                      <CreditExposureBar
                        exposurePct={creditPanel.exposurePct}
                        projectedPct={creditPanel.projectedPct}
                        approvedLimit={creditPanel.approvedLimit}
                        approvedLimitDays={creditPanel.approvedLimitDays}
                        riskScore={creditPanel.riskScore}
                        released={released}
                      />
                    )}

                    {/* ── VAL-003: Inventory pick tickets ── */}
                    {issue.checkId === "VAL-003" && (
                      <InventoryPickTickets
                        pickTickets={inventoryPanel.pickTickets}
                        atpDate={inventoryPanel.atpDate}
                        savingsAmount={inventoryPanel.savingsAmount}
                        released={released}
                      />
                    )}

                    {/* ── VAL-004: Address before/after diff ── */}
                    {issue.checkId === "VAL-004" && (
                      <AddressDiff
                        originalAddress={addressPanel.originalAddress}
                        correctedAddress={addressPanel.correctedAddress}
                        confidenceScore={addressPanel.confidenceScore}
                        released={released}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Downstream actions */}
          <h3 className="text-[11px] font-semibold text-foreground mb-3">Downstream Actions</h3>
          <div className="space-y-1.5">
            {RELEASE_ACTIONS.map(action => {
              const Icon    = ACTION_ICONS[action.icon] || FileText;
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
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${done ? "bg-green-500/15" : "bg-muted/30"}`}>
                    <Icon className={`w-3 h-3 ${done ? "text-green-400" : "text-muted-foreground/60"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-foreground/80">{action.label}</span>
                      <span className={`text-[8px] font-mono font-semibold ${AGENT_COLOR[action.agentCode] ?? "text-muted-foreground/50"}`}>
                        {action.agentCode}
                      </span>
                      {pending && <span className="text-[8px] px-1 rounded bg-muted/30 text-muted-foreground/60 border border-border/20">pending ship</span>}
                      {done && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                    </div>
                    <p className="text-[9px] text-muted-foreground/60 leading-relaxed">{action.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right — Horizontal Audit Timeline ──────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold text-foreground mb-3">
            Audit Timeline
            {released && (
              <span className="ml-2 text-[9px] text-green-400 font-normal">
                Complete in {runtimeLabel} ✓
              </span>
            )}
            {isRunning && !released && (
              <span className="ml-2 text-[9px] text-orange-400 font-normal animate-pulse">
                Live…
              </span>
            )}
          </h3>

          {/* Horizontal timeline */}
          <div className="rounded-lg border border-border/30 bg-muted/5 p-3">
            <HorizontalTimeline
              events={auditTimeline.length > 0 ? auditTimeline : (released ? STATIC_AUDIT_EVENTS : [])}
              released={released}
            />
            {!released && !isRunning && (
              <div className="mt-3 text-center">
                <Truck className="w-5 h-5 text-muted-foreground/30 mx-auto mb-1" />
                <p className="text-[9px] text-muted-foreground/50">Audit timeline populates as the pipeline runs.</p>
              </div>
            )}
            {isRunning && !released && (
              <div className="mt-3 rounded border border-orange-500/20 bg-orange-500/5 px-3 py-1.5 animate-pulse">
                <p className="text-[9px] text-orange-400/80">Pipeline running — awaiting release confirmation…</p>
              </div>
            )}
          </div>

          {/* Fulfillment summary card */}
          {released && (
            <div className="mt-3 rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-[10px] font-semibold text-foreground mb-2">Fulfilment Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["Fulfillment",    "Chicago DC"],
                  ["Ship Date",      "May 2–3, 2026"],
                  ["Delivery",       "May 2–3, 2026"],
                  ["Transit",        "1 day"],
                  ["Split-Ship",     "Avoided — $840 saved"],
                  ["RUSH Surcharge", "$1,800 (MSA §7.4(b))"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground/60">{k}</span>
                    <span className="text-[9px] text-foreground/80 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
