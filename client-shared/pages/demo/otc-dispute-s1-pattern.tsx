import { AlertTriangle, TrendingUp, CheckCircle2, Search, Activity, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ResultSummary {
  status?: string;
  customer?: string;
  disputes?: number;
  totalDisputed?: number;
  rootCause?: string;
  contract?: string;
  priceListError?: string;
  correctPriceList?: string;
  overchargePct?: number;
  apexInvoicesAffected?: number;
  apexExposure?: number;
  legalHoldFound?: boolean;
  legalHoldInvoice?: string;
  legalHoldRef?: string;
  totalCustomers?: number;
  totalInvoices?: number;
  totalOvercharge?: number;
  apexExposureValue?: number;
  meridianExposure?: number;
  cascadeExposure?: number;
  stonebridgeExposure?: number;
  proactiveOutreachRequired?: boolean;
  [key: string]: any;
}

interface OtcDisputeS1Props {
  pipelineComplete: boolean;
  scenario:         "happy" | "legal-hold" | "erp-fail";
  resultSummaries?: {
    "OTC-AGT-008"?: ResultSummary;
    "OTC-AGT-011"?: ResultSummary;
    "OTC-AGT-006"?: ResultSummary;
  };
}

const DISPUTE_COLOR = "#EF4444";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function AgentBadge({ code, color = DISPUTE_COLOR }: { code: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {code}
    </span>
  );
}

// ─── Dispute Bar Chart ────────────────────────────────────────────────────────
function DisputeTimeline() {
  const months = [
    { label: "Q1 2025", count: 1,  amount: 4.2,  historical: true  },
    { label: "Q2 2025", count: 0,  amount: 0,    historical: true  },
    { label: "Q3 2025", count: 1,  amount: 3.8,  historical: true  },
    { label: "Q4 2025", count: 1,  amount: 5.1,  historical: true  },
    { label: "Feb 14",  count: 2,  amount: 59.6, historical: false },
    { label: "Feb 24",  count: 2,  amount: 58.0, historical: false },
    { label: "Mar 4",   count: 3,  amount: 99.3, historical: false },
    { label: "Mar 13",  count: 2,  amount: 59.0, historical: false },
    { label: "Mar 21",  count: 3,  amount: 103.5, historical: false },
  ];
  const maxCount = 3;
  const maxAmount = 110;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-28">
        {months.map((m) => (
          <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: 96 }}>
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${(m.count / maxCount) * 100}%`,
                  background: m.historical ? "#3B82F620" : `${DISPUTE_COLOR}80`,
                  border: m.historical ? "1px solid #3B82F640" : `1px solid ${DISPUTE_COLOR}`,
                  minHeight: m.count > 0 ? 4 : 0,
                }}
              />
            </div>
            <span className="text-[9px] text-white/30 tabular-nums leading-none">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-white/40">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/40" />
          <span>Historical (quarterly)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border" style={{ background: `${DISPUTE_COLOR}50`, borderColor: DISPUTE_COLOR }} />
          <span>Post Feb 12, 2026 (daily)</span>
        </div>
      </div>
      <div
        className="flex items-center gap-2 rounded px-3 py-2 text-xs"
        style={{ background: `${DISPUTE_COLOR}15`, border: `1px solid ${DISPUTE_COLOR}40` }}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: DISPUTE_COLOR }} />
        <span style={{ color: DISPUTE_COLOR }}>
          Vertical dashed line: <strong>Contract MSA-2025-1104 effective Feb 12, 2026</strong> — perfectly aligned with dispute spike onset
        </span>
      </div>
    </div>
  );
}

// ─── Root Cause Tree ──────────────────────────────────────────────────────────
function RootCauseTree({ summary008 }: { summary008?: ResultSummary }) {
  const steps = [
    { n: 1, done: true,  text: "Classified 12 disputes — all Type: Pricing Discrepancy (100%)" },
    { n: 2, done: true,  text: "Identified common factor — all involve Industrial Controls (Category C)" },
    { n: 3, done: true,  text: `Cross-referenced contract ${summary008?.contract || "MSA-2025-1104"} effective Feb 12, 2026` },
    { n: 4, done: true,  text: `Compared contracted vs invoiced rates — systematic ${summary008?.overchargePct || 4.7}% overcharge on all Category C products` },
    { n: 5, done: !!summary008, text: `Root cause: ERP price list ${summary008?.priceListError || "PL-2024-C"} remained active — ${summary008?.correctPriceList || "PL-2025-C-APEX"} was never activated` },
  ];

  return (
    <div className="space-y-2">
      {steps.map(s => (
        <div key={s.n} className="flex items-start gap-2.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold"
            style={{
              background: s.done ? `${DISPUTE_COLOR}30` : "rgba(255,255,255,0.05)",
              color:      s.done ? DISPUTE_COLOR : "rgba(255,255,255,0.3)",
              border:     `1px solid ${s.done ? DISPUTE_COLOR + "60" : "rgba(255,255,255,0.1)"}`,
            }}
          >
            {s.done ? "✓" : s.n}
          </div>
          <span className={`text-xs leading-5 ${s.done ? "text-white/80" : "text-white/30"}`}>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Exposure grid ────────────────────────────────────────────────────────────
function ExposureGrid({ summary011 }: { summary011?: ResultSummary }) {
  const customers = [
    { name: "Apex Industries",        invoices: 34,  overcharge: summary011?.apexExposure    || 38300,  filed: true  },
    { name: "Meridian Manufacturing", invoices: 31,  overcharge: summary011?.meridianExposure || 54000,  filed: false },
    { name: "Cascade Dynamics",       invoices: 26,  overcharge: summary011?.cascadeExposure  || 38000,  filed: false },
    { name: "Stonebridge Industries", invoices: 32,  overcharge: summary011?.stonebridgeExposure || 35000, filed: false },
  ];
  const total = customers.reduce((s, c) => s + c.overcharge, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wide px-1">
        <span>Customer</span>
        <div className="flex gap-6">
          <span>Invoices</span>
          <span>Overcharge</span>
          <span>Status</span>
        </div>
      </div>
      {customers.map(c => (
        <div key={c.name} className="flex items-center justify-between rounded-lg bg-white/3 border border-white/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: c.filed ? DISPUTE_COLOR : "#F59E0B" }}
            />
            <span className="text-xs text-white/80">{c.name}</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span className="text-white/50 tabular-nums w-12 text-right">{c.invoices}</span>
            <span className="font-mono text-white/90 tabular-nums w-16 text-right">{fmt$(c.overcharge)}</span>
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5"
              style={c.filed
                ? { borderColor: `${DISPUTE_COLOR}60`, color: DISPUTE_COLOR }
                : { borderColor: "#F59E0B60", color: "#F59E0B" }}
            >
              {c.filed ? "Dispute Filed" : "Proactive ⚡"}
            </Badge>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 bg-white/5">
        <span className="text-xs font-semibold text-white">Total Systemic Exposure</span>
        <div className="flex items-center gap-6 text-xs">
          <span className="text-white/50 tabular-nums w-12 text-right">{summary011?.totalInvoices || 123}</span>
          <span className="font-mono font-bold tabular-nums w-16 text-right" style={{ color: DISPUTE_COLOR }}>{fmt$(summary011?.totalOvercharge || total)}</span>
          <span className="text-[9px] text-white/30 w-20 text-right">4 customers</span>
        </div>
      </div>
    </div>
  );
}

// ─── Pre-run placeholder ──────────────────────────────────────────────────────
function PreRunCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${DISPUTE_COLOR}20`, border: `1px solid ${DISPUTE_COLOR}40` }}
      >
        <Search className="w-5 h-5" style={{ color: DISPUTE_COLOR }} />
      </div>
      <p className="text-sm text-white/50">Run the demo to see the dispute pattern analysis, root cause investigation, and systemic exposure scan.</p>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function OtcDisputeS1Pattern({ pipelineComplete, scenario, resultSummaries }: OtcDisputeS1Props) {
  const s008 = resultSummaries?.["OTC-AGT-008"];
  const s011 = resultSummaries?.["OTC-AGT-011"];

  const isLegalHold = scenario === "legal-hold";

  if (!pipelineComplete) return <PreRunCard />;

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Top Alert Banner */}
      <div
        className="rounded-lg border p-3 flex items-start gap-3"
        style={{ background: `${DISPUTE_COLOR}12`, borderColor: `${DISPUTE_COLOR}50` }}
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: DISPUTE_COLOR }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: DISPUTE_COLOR }}>
              SYSTEMIC DISPUTE PATTERN DETECTED
            </span>
            <AgentBadge code="OTC-AGT-008" />
          </div>
          <p className="text-xs text-white/70 mt-0.5">
            <strong>Apex Industries:</strong> {s008?.disputes || 12} disputes ({fmt$(s008?.totalDisputed || 380000)}) in 45 days.
            Historical average: 1 dispute per quarter.
            Pattern: All disputes cite pricing discrepancy on Category C (Industrial Controls).
            Root cause: Contract {s008?.contract || "MSA-2025-1104"} effective date not synced to ERP.
          </p>
          {isLegalHold && s008?.legalHoldFound && (
            <p className="text-xs text-amber-400 mt-1">
              ⚠ Legal hold detected on invoice {s008.legalHoldInvoice} (Ref: {s008.legalHoldRef}) — excluded from credit batch.
            </p>
          )}
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: Dispute Timeline + Pattern */}
        <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Dispute Trend — Apex Industries</h3>
              <p className="text-[11px] text-white/40 mt-0.5">12-month history vs 45-day spike</p>
            </div>
            <AgentBadge code="OTC-AGT-008" />
          </div>
          <DisputeTimeline />

          {/* Portfolio Comparison */}
          <div className="rounded-lg bg-white/3 border border-white/8 p-3 space-y-2">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">vs NovaTech Portfolio</p>
            <div className="space-y-1.5">
              {[
                { label: "Apex Industries",     pct: 100, color: DISPUTE_COLOR, val: "12 disputes (45d)" },
                { label: "Portfolio Avg",       pct: 6,   color: "#3B82F6",     val: "0.75 per quarter" },
              ].map(r => (
                <div key={r.label} className="space-y-0.5">
                  <div className="flex justify-between text-[10px] text-white/50">
                    <span>{r.label}</span>
                    <span>{r.val}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/40 mt-1">Dispute frequency: <strong className="text-white/70">16× portfolio average</strong></p>
          </div>
        </div>

        {/* Right: Root Cause + Exposure */}
        <div className="flex flex-col gap-3">
          {/* Root Cause */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Automated Root Cause Analysis</h3>
                <p className="text-[11px] text-white/40 mt-0.5">5-step automated investigation</p>
              </div>
              <div className="flex gap-1">
                <AgentBadge code="OTC-AGT-008" />
                <AgentBadge code="OTC-AGT-011" color="#8B5CF6" />
              </div>
            </div>
            <RootCauseTree summary008={s008} />
            <div
              className="rounded p-2.5 text-xs"
              style={{ background: `${DISPUTE_COLOR}15`, border: `1px solid ${DISPUTE_COLOR}30` }}
            >
              <p className="font-semibold" style={{ color: DISPUTE_COLOR }}>Root cause confirmed (98% confidence)</p>
              <p className="text-white/60 mt-0.5">
                ERP price list <strong className="text-white/80">{s008?.priceListError || "PL-2024-C"}</strong> remained active after contract
                <strong className="text-white/80"> {s008?.contract || "MSA-2025-1104"}</strong> went live.
                Correct list <strong className="text-white/80">{s008?.correctPriceList || "PL-2025-C-APEX"}</strong> was never activated.
                All Category C invoices overcharged by <strong className="text-white/80">{s008?.overchargePct || 4.7}%</strong>.
              </p>
            </div>
          </div>

          {/* Systemic Exposure */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Enterprise Exposure Assessment</h3>
                <p className="text-[11px] text-white/40 mt-0.5">Full portfolio scan — {s011?.totalCustomers || 4} customers affected</p>
              </div>
              <AgentBadge code="OTC-AGT-011" color="#8B5CF6" />
            </div>
            <ExposureGrid summary011={s011} />
            {(s011?.proactiveOutreachRequired || true) && (
              <div className="rounded p-2 flex items-center gap-2 text-xs" style={{ background: "#F59E0B15", border: "1px solid #F59E0B30" }}>
                <Users className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="text-amber-400">
                  Meridian, Cascade &amp; Stonebridge have not filed disputes — proactive outreach required before they discover the error.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
