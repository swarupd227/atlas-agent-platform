import { CheckCircle2, AlertTriangle, Bell, Settings, Users, TrendingUp, Lock, ArrowRight, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ResultSummary {
  status?: string;
  creditsIssued?: number;
  totalCreditAmount?: number;
  legalHoldExcluded?: number;
  holdInvoice?: string;
  holdRef?: string;
  erpCorrectionRef?: string;
  erpCorrectionStatus?: string;
  customersNotified?: number;
  openOrdersBlocking?: number;
  erpResolutionDays?: number;
  processingTimeHours?: number;
  [key: string]: any;
}

interface OtcDisputeS3Props {
  pipelineComplete: boolean;
  scenario:         "happy" | "legal-hold" | "erp-fail";
  resultSummaries?: {
    "OTC-AGT-008"?: ResultSummary;
    "OTC-AGT-011"?: ResultSummary;
    "OTC-AGT-006"?: ResultSummary;
  };
}

// ─── Color constants ──────────────────────────────────────────────────────────
const DISPUTE_COLOR  = "#EF4444";
const CONTRACT_COLOR = "#8B5CF6";
const BILLING_COLOR  = "#10B981";
const WARN_COLOR     = "#F59E0B";

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

// ─── Customer portfolio rows ───────────────────────────────────────────────────
const PORTFOLIO = [
  {
    name:      "Apex Industries",
    tier:      "Tier 1",
    revenue:   "$12M/yr",
    contract:  "MSA-2025-1104",
    effective: "Feb 12, 2026",
    invoices:  34,
    overcharge: 38300,
    disputed:   true,
    notifType:  "Reactive",
    notifNote:  "12 disputes filed — resolution underway",
  },
  {
    name:      "Meridian Manufacturing",
    tier:      "Tier 2",
    revenue:   "$4.2M/yr",
    contract:  "MSA-2025-1187",
    effective: "Feb 01, 2026",
    invoices:  31,
    overcharge: 54000,
    disputed:   false,
    notifType:  "Proactive",
    notifNote:  "Notified before discovery — trust moment",
  },
  {
    name:      "Cascade Dynamics",
    tier:      "Tier 2",
    revenue:   "$3.1M/yr",
    contract:  "MSA-2025-1201",
    effective: "Feb 19, 2026",
    invoices:  26,
    overcharge: 38000,
    disputed:   false,
    notifType:  "Proactive",
    notifNote:  "Proactive outreach sent Apr 29, 2026",
  },
  {
    name:      "Stonebridge Industries",
    tier:      "Tier 2",
    revenue:   "$2.8M/yr",
    contract:  "MSA-2025-1219",
    effective: "Mar 01, 2026",
    invoices:  32,
    overcharge: 35000,
    disputed:   false,
    notifType:  "Proactive",
    notifNote:  "Most recent contract — outreach Mar 29, 2026",
  },
];

// ─── Portfolio customer table ─────────────────────────────────────────────────
function PortfolioTable({ scenario }: { scenario: string }) {
  const isLegal = scenario === "legal-hold";

  return (
    <div className="space-y-1.5">
      <div className="grid text-[10px] text-white/25 uppercase tracking-wide px-2"
        style={{ gridTemplateColumns: "1.8fr 0.6fr 0.7fr 1fr 0.6fr 0.7fr 1.1fr" }}
      >
        <span>Customer</span>
        <span>Tier</span>
        <span>Invoices</span>
        <span>Exposure</span>
        <span>Disputes</span>
        <span>Outreach</span>
        <span>Status</span>
      </div>

      {PORTFOLIO.map((c, i) => {
        const isApex = c.name === "Apex Industries";
        const isHeld = isLegal && isApex;
        return (
          <div
            key={c.name}
            className="grid items-center rounded-lg border px-3 py-2 text-xs gap-1"
            style={{
              gridTemplateColumns: "1.8fr 0.6fr 0.7fr 1fr 0.6fr 0.7fr 1.1fr",
              background: isApex ? `${DISPUTE_COLOR}08` : "rgba(255,255,255,0.02)",
              borderColor: isApex ? `${DISPUTE_COLOR}25` : "rgba(255,255,255,0.07)",
            }}
            data-testid={`row-customer-${i}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isApex && <div className="w-1 h-1 rounded-full shrink-0" style={{ background: DISPUTE_COLOR }} />}
              <span className={isApex ? "text-white/90 font-medium truncate" : "text-white/70 truncate"}>{c.name}</span>
            </div>
            <span className="text-white/40 text-[10px]">{c.tier}</span>
            <span className="text-white/50 tabular-nums">{c.invoices}</span>
            <span className="font-mono tabular-nums font-semibold" style={{ color: BILLING_COLOR }}>{fmt$(c.overcharge)}</span>
            <div>
              {c.disputed
                ? <Badge variant="outline" className="text-[9px] h-4 px-1" style={{ borderColor: `${DISPUTE_COLOR}50`, color: DISPUTE_COLOR }}>Active</Badge>
                : <Badge variant="outline" className="text-[9px] h-4 px-1" style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.35)" }}>None</Badge>
              }
            </div>
            <div>
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1.5"
                style={c.notifType === "Proactive"
                  ? { borderColor: `${BILLING_COLOR}50`, color: BILLING_COLOR }
                  : { borderColor: `${WARN_COLOR}50`, color: WARN_COLOR }}
              >
                {c.notifType}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              {isHeld && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
              <span className="text-[10px] leading-tight" style={{ color: isHeld ? WARN_COLOR : "rgba(255,255,255,0.35)" }}>
                {isHeld ? "1 invoice held — legal clearance pending" : c.notifNote}
              </span>
            </div>
          </div>
        );
      })}

      {/* Total row */}
      <div
        className="grid items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
        style={{ gridTemplateColumns: "1.8fr 0.6fr 0.7fr 1fr 0.6fr 0.7fr 1.1fr" }}
      >
        <span className="font-semibold text-white">Total — 4 Customers</span>
        <span />
        <span className="text-white/50 tabular-nums">123</span>
        <span className="font-mono font-bold tabular-nums" style={{ color: BILLING_COLOR }}>$165.3K</span>
        <span />
        <span className="text-white/30 text-[10px]">4 of 4</span>
        <span className="text-[10px] text-white/30">All notified</span>
      </div>
    </div>
  );
}

// ─── ERP CR approval workflow ─────────────────────────────────────────────────
function ErpApprovalWorkflow({ scenario }: { scenario: string }) {
  const isErpFail = scenario === "erp-fail";

  const steps = [
    {
      label:    "Contract Management",
      contact:  "Sarah Okonkwo",
      sla:      "4 hours",
      status:   isErpFail ? "blocked" : "approved",
    },
    {
      label:    "IT Change Advisory Board",
      contact:  "CAB Review",
      sla:      "24 hours",
      status:   isErpFail ? "pending" : "approved",
    },
    {
      label:    "ERP Production Deploy",
      contact:  "48-hour staging",
      sla:      "PL-2025-C-APEX",
      status:   isErpFail ? "pending" : "in_progress",
    },
  ];

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const isDone    = s.status === "approved";
        const isInProg  = s.status === "in_progress";
        const isBlocked = s.status === "blocked";
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs"
            style={{
              background:   isDone ? `${CONTRACT_COLOR}08` : isBlocked ? `${WARN_COLOR}08` : isInProg ? `${CONTRACT_COLOR}05` : "rgba(255,255,255,0.02)",
              borderColor:  isDone ? `${CONTRACT_COLOR}30` : isBlocked ? `${WARN_COLOR}30` : "rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: isDone ? `${CONTRACT_COLOR}20` : isBlocked ? `${WARN_COLOR}20` : "rgba(255,255,255,0.05)",
                color:      isDone ? CONTRACT_COLOR : isBlocked ? WARN_COLOR : "rgba(255,255,255,0.3)",
              }}
            >
              {isDone
                ? <CheckCircle2 className="w-2.5 h-2.5" />
                : isBlocked
                  ? <AlertTriangle className="w-2.5 h-2.5" />
                  : isInProg
                    ? <Settings className="w-2.5 h-2.5" />
                    : <ArrowRight className="w-2.5 h-2.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-white/70">{s.label}</p>
                <span className="text-[10px]" style={{ color: isDone ? CONTRACT_COLOR : isBlocked ? WARN_COLOR : "rgba(255,255,255,0.3)" }}>
                  {isDone ? "✓ Approved" : isBlocked ? "⚠ Blocked" : isInProg ? "Staging" : "Pending"}
                </span>
              </div>
              <p className="text-[10px] text-white/35">{s.contact} · {s.sla}</p>
            </div>
          </div>
        );
      })}

      {isErpFail && (
        <div
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{ background: `${WARN_COLOR}10`, borderColor: `${WARN_COLOR}40` }}
        >
          <p className="font-medium" style={{ color: WARN_COLOR }}>⚠ ERP Validation Failed</p>
          <p className="text-white/50 mt-0.5">8 open orders reference PL-2024-C. Manual re-pricing required before price list switch (~3 business days).</p>
        </div>
      )}
    </div>
  );
}

// ─── Pre-run placeholder ──────────────────────────────────────────────────────
function PreRunCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${CONTRACT_COLOR}20`, border: `1px solid ${CONTRACT_COLOR}40` }}
      >
        <Users className="w-5 h-5" style={{ color: CONTRACT_COLOR }} />
      </div>
      <p className="text-sm text-white/50">
        Run the demo to see the full portfolio exposure map, ERP corrective action workflow, and proactive notification status.
      </p>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OtcDisputeS3Portfolio({ pipelineComplete, scenario, resultSummaries }: OtcDisputeS3Props) {
  const s006 = resultSummaries?.["OTC-AGT-006"];
  const s011 = resultSummaries?.["OTC-AGT-011"];

  const isErpFail = scenario === "erp-fail";
  const isLegal   = scenario === "legal-hold";

  if (!pipelineComplete) return <PreRunCard />;

  const totalCredit     = 165300;
  const totalInvoices   = 123;
  const totalCustomers  = 4;
  const notified        = s006?.customersNotified ?? 4;
  const erpRef          = s006?.erpCorrectionRef ?? "CR-2026-PL-0047";

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">

      {/* ── Top stat bar ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Customers Affected", value: `${totalCustomers}`, color: DISPUTE_COLOR, icon: Users },
          { label: "Total Invoices",     value: `${totalInvoices}`,  color: "rgba(255,255,255,0.7)", icon: TrendingUp },
          { label: "Total Exposure",     value: fmt$(totalCredit),   color: BILLING_COLOR,  icon: TrendingUp },
          { label: "Customers Notified", value: `${notified} / 4`,   color: BILLING_COLOR,  icon: Bell },
          { label: "ERP Change Request", value: isErpFail ? "Manual" : "Submitted", color: isErpFail ? WARN_COLOR : CONTRACT_COLOR, icon: Settings },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-lg border border-white/8 bg-white/3 p-3 flex flex-col gap-1.5"
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3" style={{ color: stat.color }} />
                <span className="text-[10px] text-white/35 uppercase tracking-wide">{stat.label}</span>
              </div>
              <p className="text-xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── VP Finance approval callout ────────────────────────────────────── */}
      <div
        className="rounded-lg border px-4 py-2.5 flex items-center gap-3"
        style={{ background: `${CONTRACT_COLOR}08`, borderColor: `${CONTRACT_COLOR}30` }}
      >
        <Shield className="w-4 h-4 shrink-0" style={{ color: CONTRACT_COLOR }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: CONTRACT_COLOR }}>
            VP Finance Approval Required (batch ${totalCredit.toLocaleString()} &gt; $100K threshold)
          </p>
          <p className="text-[11px] text-white/45 mt-0.5">
            Jordan Silva, VP Finance — Escalation initiated ·{" "}
            <AgentBadge code="OTC-AGT-008" /> {" "}
            <AgentBadge code="OTC-AGT-011" color={CONTRACT_COLOR} />
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] shrink-0"
          style={{ borderColor: `${CONTRACT_COLOR}50`, color: CONTRACT_COLOR }}
        >
          Escalation Initiated
        </Badge>
      </div>

      {/* ── Main grid: table + right panels ───────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4 flex-1 min-h-0">

        {/* Left 3/5: Customer portfolio table */}
        <div className="col-span-3 rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Portfolio Systemic Exposure</h3>
              <p className="text-[11px] text-white/40 mt-0.5">
                4 customers · 123 invoices · 4.7% systematic overcharge (PL-2024-C vs PL-2025-C-APEX) ·
                {" "}<AgentBadge code="OTC-AGT-011" color={CONTRACT_COLOR} />
              </p>
            </div>
          </div>
          <PortfolioTable scenario={scenario} />

          {/* Aging breakdown */}
          <div className="mt-2 pt-3 border-t border-white/8 flex items-center gap-6">
            <p className="text-[10px] text-white/30 uppercase tracking-wide shrink-0">Aging by Month</p>
            {[
              { month: "Feb 2026", overcharge: 41700, invoices: 28 },
              { month: "Mar 2026", overcharge: 123600, invoices: 95 },
            ].map(a => (
              <div key={a.month} className="flex items-center gap-3">
                <span className="text-[11px] text-white/50">{a.month}</span>
                <span className="text-[11px] font-mono font-semibold" style={{ color: BILLING_COLOR }}>{fmt$(a.overcharge)}</span>
                <span className="text-[10px] text-white/30">({a.invoices} inv.)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 2/5: ERP CR + Prevention */}
        <div className="col-span-2 flex flex-col gap-3">

          {/* ERP CR approval workflow */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">ERP Correction Workflow</h3>
              <div className="flex items-center gap-1.5">
                <AgentBadge code="OTC-AGT-011" color={CONTRACT_COLOR} />
                <AgentBadge code="OTC-AGT-006" color={BILLING_COLOR} />
              </div>
            </div>
            <div
              className="rounded-lg px-3 py-1.5 text-[10px] font-mono text-center font-medium"
              style={{ background: `${CONTRACT_COLOR}15`, color: CONTRACT_COLOR, border: `1px solid ${CONTRACT_COLOR}30` }}
            >
              {erpRef} · PL-2024-C → PL-2025-C-APEX
            </div>
            <ErpApprovalWorkflow scenario={scenario} />
          </div>

          {/* Prevention rule */}
          <div
            className="rounded-lg border p-4 flex flex-col gap-2 flex-1"
            style={{ background: `${BILLING_COLOR}08`, borderColor: `${BILLING_COLOR}30` }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: BILLING_COLOR }} />
              <span className="text-xs font-semibold" style={{ color: BILLING_COLOR }}>Prevention Control Recommended</span>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">
              <strong className="text-white/70">Contract Pricing Verification Rule:</strong>{" "}
              When a new MSA contract loads, compare invoiced prices vs contracted rates for the first 10 invoices.
              Alert AR team if variance &gt;1%. Sprint target: 2026-04-18.
            </p>
            <div
              className="mt-auto rounded px-2 py-1.5 text-[10px] text-center"
              style={{ background: `${BILLING_COLOR}20`, color: BILLING_COLOR }}
            >
              Recommended by OTC-AGT-008 · Pending IT Sprint
            </div>
          </div>

          {/* Exception callouts */}
          {isLegal && (
            <div
              className="rounded-lg border px-3 py-2.5 text-[11px] flex items-start gap-2"
              style={{ background: `${WARN_COLOR}10`, borderColor: `${WARN_COLOR}40` }}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-400">Legal Hold — Invoice CRN-2026-AX-0005</p>
                <p className="text-white/50 mt-0.5">REF-LEGAL-2026-047 blocks $24,900 credit for Apex Industries. Legal clearance est. Apr 15, 2026. 122 invoices credited; 1 pending.</p>
              </div>
            </div>
          )}
          {isErpFail && (
            <div
              className="rounded-lg border px-3 py-2.5 text-[11px] flex items-start gap-2"
              style={{ background: `${WARN_COLOR}10`, borderColor: `${WARN_COLOR}40` }}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-400">ERP Validation Failed — Manual Required</p>
                <p className="text-white/50 mt-0.5">8 open orders block PL switch. Contract Management must amend orders before activation (~{s011?.erpResolutionDays ?? 3} business days).</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
