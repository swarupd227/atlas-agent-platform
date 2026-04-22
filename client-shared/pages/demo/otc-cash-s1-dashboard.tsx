import { DollarSign, Zap, AlertTriangle, CheckCircle2, Clock, RefreshCw, TrendingUp, BarChart3, FileText, Database } from "lucide-react";
import { type CashPipelineState } from "./otc-cash-constants";

const CASH_COLOR = "#10B981";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, highlight = false }:
  { icon: any; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-2 transition-all
        ${highlight
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-white/10 bg-white/5"}`}
    >
      <div className="flex items-center gap-2 text-xs text-white/50 uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5" style={{ color: highlight ? CASH_COLOR : undefined }} />
        {label}
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-white/40">{sub}</div>}
    </div>
  );
}

// ─── Match funnel ─────────────────────────────────────────────────────────────
const FUNNEL_ROWS = [
  { label: "Perfect Match",           usd: 31_202_400, pct: 73.8, count: 298, color: "bg-emerald-500",    textColor: "text-emerald-400"  },
  { label: "High-Confidence Match",   usd:  8_624_447, pct: 20.4, count:  52, color: "bg-emerald-400",    textColor: "text-emerald-300"  },
  { label: "Low-Confidence Suggested", usd: 1_796_800, pct:  4.2, count:  23, color: "bg-amber-500",      textColor: "text-amber-400"    },
  { label: "Unmatched (Exception)",   usd:    690_200, pct:  1.6, count:  14, color: "bg-red-500",        textColor: "text-red-400"      },
];

function MatchFunnel({ matchRatePct }: { matchRatePct: number }) {
  const shown = matchRatePct > 0;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Auto-Match Funnel</span>
        <span className={`text-lg font-bold ${shown ? "text-emerald-400" : "text-white/30"}`}>
          {shown ? fmtPct(matchRatePct) : "—"} matched
        </span>
      </div>
      <div className="space-y-2.5">
        {FUNNEL_ROWS.map(row => (
          <div key={row.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className={shown ? row.textColor : "text-white/30"}>{row.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-white/50">{row.count} pmts</span>
                <span className={`font-semibold ${shown ? row.textColor : "text-white/30"}`}>
                  {shown ? fmt$(row.usd) : "—"}
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${row.color} ${shown ? "opacity-90" : "opacity-0"}`}
                style={{ width: shown ? `${row.pct}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Exception queue ──────────────────────────────────────────────────────────
const EXCEPTIONS = [
  {
    rank:       1,
    customer:   "GlobalTech Corp",
    ref:        "WF-20260328-7742",
    amount:     2_300_847,
    complexity: "HIGH",
    type:       "COMPLEX_MULTI_INVOICE",
    detail:     "47 invoices · 3 deductions · $38.1K overpayment",
    aiNote:     "Full resolution in seconds with agent deep dive",
    badge:      { label: "HIGH", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  },
  {
    rank:       2,
    customer:   "Vertex Systems",
    ref:        "ACH-2026-0328-0447",
    amount:     487_200,
    complexity: "MEDIUM",
    type:       "REFERENCE_MISMATCH",
    detail:     "ACH ref VS-2026-MAR → fuzzy match INV-47210–47214 (91%)",
    aiNote:     "Auto-confirm available",
    badge:      { label: "REF MISMATCH", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  },
  {
    rank:       3,
    customer:   "Regional Supply Co",
    ref:        "CHK-2026-77421",
    amount:     127_000,
    complexity: "MEDIUM",
    type:       "NO_REMITTANCE",
    detail:     "Check · No remittance · 8 open invoices $143K",
    aiNote:     "Contact customer for allocation",
    badge:      { label: "NO REMITTANCE", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  },
];

function ExceptionQueue({ visible }: { visible: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Priority Exception Queue</span>
        <span className="text-xs text-white/40">14 total · showing top 3</span>
      </div>
      <div className="space-y-3">
        {EXCEPTIONS.map(ex => (
          <div key={ex.rank}
            className={`rounded-lg border p-3 transition-all duration-500
              ${visible ? "border-white/10 bg-white/5 opacity-100" : "opacity-25"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40 tabular-nums font-mono">#{ex.rank}</span>
                  <span className="text-sm font-semibold text-white truncate">{ex.customer}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${ex.badge.color}`}>
                    {ex.badge.label}
                  </span>
                </div>
                <div className="text-xs text-white/50">{ex.ref} · {ex.detail}</div>
                <div className="text-xs text-emerald-400 mt-0.5">↪ AI: {ex.aiNote}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-white">{fmt$(ex.amount)}</div>
                <div className="text-[10px] text-white/30">{ex.complexity}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bank reconciliation panel ────────────────────────────────────────────────
function BankRecPanel({ pct, visible }: { pct: number; visible: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Bank Reconciliation — March 2026</span>
        <span className={`text-sm font-bold ${visible && pct > 0 ? "text-emerald-400" : "text-white/30"}`}>
          {visible && pct > 0 ? fmtPct(pct) : "—"}
        </span>
      </div>
      {visible && pct > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: "Bank Statement", value: "$84.72M" },
              { label: "GL Cash Balance", value: "$84.70M" },
              { label: "Timing Differences", value: "$23.6K (4 items)" },
              { label: "Under Investigation", value: "$1.2K (bank fee)" },
            ].map(item => (
              <div key={item.label} className="flex flex-col">
                <span className="text-white/40">{item.label}</span>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-amber-400 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Target certified by: April 3, 2026 17:00 CT
          </div>
        </div>
      ) : (
        <div className="text-xs text-white/30 italic">Awaiting bank reconciliation data…</div>
      )}
    </div>
  );
}

// ─── S1 Dashboard Component ───────────────────────────────────────────────────
interface Props {
  state: CashPipelineState;
  onDeepDive: () => void;
}

export default function OtcCashS1Dashboard({ state, onDeepDive }: Props) {
  const { phase, metrics } = state;
  const isRunning = phase !== "idle" && phase !== "error";
  const hasIngestion = phase !== "idle" && phase !== "setup";
  const hasResolution = phase === "resolution" || phase === "posting" || phase === "complete";
  const hasPosting = phase === "posting" || phase === "complete";

  return (
    <div className="flex flex-col gap-6 min-h-0">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Payment Batch"
          value={fmt$(metrics.total_amount)}
          sub={`${metrics.total_payments} payments · March 2026`}
        />
        <KpiCard
          icon={Zap}
          label="Auto-Match Rate"
          value={hasIngestion && metrics.match_rate_pct > 0 ? fmtPct(metrics.match_rate_pct) : "Running…"}
          sub={hasIngestion && metrics.auto_matched_usd > 0 ? `${fmt$(metrics.auto_matched_usd)} matched` : "Matching in progress"}
          highlight={hasIngestion && metrics.match_rate_pct > 0}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Exception Queue"
          value={hasIngestion ? "14 items" : "—"}
          sub={hasIngestion ? "$690K · 1 HIGH complexity" : "Pending"}
        />
        <KpiCard
          icon={hasPosting ? CheckCircle2 : TrendingUp}
          label="AR Reduction"
          value={hasPosting && metrics.ar_reduction > 0 ? fmt$(metrics.ar_reduction) : hasResolution ? "Posting…" : "—"}
          sub={hasPosting ? "GlobalTech: $3.1M → $0.73M" : "Awaiting AR posting"}
          highlight={hasPosting && metrics.ar_reduction > 0}
        />
      </div>

      {/* Channel breakdown */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            Payment Channel Breakdown
          </span>
          <span className="text-xs text-white/40">BATCH-2026-0328-ME</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Wire Transfer", count: 89,  usd: 28_741_200, pct: 67.9, color: "bg-emerald-500" },
            { label: "ACH",           count: 156, usd:  8_920_100, pct: 21.1, color: "bg-blue-500"    },
            { label: "Check",         count: 87,  usd:  3_475_300, pct:  8.2, color: "bg-purple-500"  },
            { label: "EDI 820",       count: 55,  usd:  1_177_247, pct:  2.8, color: "bg-cyan-500"    },
          ].map(ch => (
            <div key={ch.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-xs text-white/50 mb-1">{ch.label}</div>
              <div className="text-base font-bold text-white">{fmt$(ch.usd)}</div>
              <div className="text-xs text-white/40">{ch.count} payments</div>
              <div className="h-1.5 mt-2 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${ch.color}`} style={{ width: `${ch.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Match funnel + exceptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MatchFunnel matchRatePct={metrics.match_rate_pct} />
        <ExceptionQueue visible={hasIngestion} />
      </div>

      {/* Bank rec + GlobalTech spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BankRecPanel pct={metrics.bank_rec_pct} visible={hasIngestion} />

        {/* GlobalTech spotlight with deep-dive CTA */}
        <div className={`rounded-xl border p-5 flex flex-col gap-4 transition-all
          ${hasIngestion ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/5"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-all ${hasIngestion ? "bg-red-500 animate-pulse" : "bg-white/20"}`} />
            <span className="text-sm font-semibold text-white">Priority 1 Exception — GlobalTech Corp</span>
          </div>
          {hasIngestion ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "Payment",    value: "$2,300,847" },
                  { label: "Invoices",   value: "47 open" },
                  { label: "Deductions", value: "3 codes ($50.1K)" },
                  { label: "Overpay",   value: "$38,100" },
                ].map(item => (
                  <div key={item.label} className="flex flex-col">
                    <span className="text-xs text-white/40">{item.label}</span>
                    <span className="text-sm font-semibold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                ⚠ Without AI: 4–6 hours manual research. With Atlas: resolution in seconds.
              </div>
              {(hasResolution || phase === "complete") && (
                <button
                  onClick={onDeepDive}
                  className="text-sm font-semibold rounded-lg px-4 py-2.5 transition-all hover:opacity-90 active:scale-95"
                  style={{ background: CASH_COLOR, color: "white" }}
                  data-testid="button-globaltech-deep-dive"
                >
                  View GlobalTech Resolution →
                </button>
              )}
            </>
          ) : (
            <div className="text-xs text-white/30 italic">Awaiting exception identification…</div>
          )}
        </div>
      </div>

      {/* Pipeline agent steps */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          Pipeline Agent Steps
        </div>
        <div className="flex flex-col gap-3">
          {state.agents.map((agent, i) => (
            <div key={`${agent.code}-${i}`}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-all
                ${agent.status === "running"   ? "border-emerald-500/40 bg-emerald-500/5"
                : agent.status === "complete"  ? "border-white/20 bg-white/5"
                : agent.status === "error"     ? "border-red-500/30 bg-red-500/5"
                :                                "border-white/5 bg-white/3"}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${agent.status === "running"  ? "bg-emerald-500 text-white animate-pulse"
                : agent.status === "complete" ? "bg-white/20 text-white"
                : agent.status === "error"    ? "bg-red-500 text-white"
                :                               "bg-white/10 text-white/30"}`}>
                {agent.status === "complete" ? "✓" : agent.status === "error" ? "✗" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/50 font-mono">{agent.code}</div>
                <div className={`text-sm font-medium ${agent.status === "idle" ? "text-white/30" : "text-white"}`}>
                  {agent.label}
                </div>
              </div>
              <div className="shrink-0">
                {agent.status === "running" && (
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                )}
                {agent.status === "complete" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
