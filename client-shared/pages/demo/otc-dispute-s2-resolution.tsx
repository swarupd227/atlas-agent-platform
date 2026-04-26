import { CheckCircle2, AlertTriangle, FileText, Settings, Bell, ArrowRight, Lock } from "lucide-react";
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
  preventionRuleRecommended?: boolean;
  erpValidationStatus?: string;
  erpFailureReason?: string;
  openOrdersBlocking?: number;
  erpResolutionDays?: number;
  processingTimeHours?: number;
  apexCredit?: number;
  meridianCredit?: number;
  cascadeCredit?: number;
  stonebridgeCredit?: number;
  [key: string]: any;
}

interface OtcDisputeS2Props {
  pipelineComplete: boolean;
  scenario:         "happy" | "legal-hold" | "erp-fail";
  resultSummaries?: {
    "OTC-AGT-008"?: ResultSummary;
    "OTC-AGT-011"?: ResultSummary;
    "OTC-AGT-006"?: ResultSummary;
  };
}

const DISPUTE_COLOR  = "#EF4444";
const BILLING_COLOR  = "#10B981";
const CONTRACT_COLOR = "#8B5CF6";

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

// ─── Invoice Table ────────────────────────────────────────────────────────────
function InvoiceTable({ scenario, summary006 }: { scenario: string; summary006?: ResultSummary }) {
  const isErpFail  = scenario === "erp-fail";
  const isLegal    = scenario === "legal-hold";

  const rows = [
    { customer: "Apex Industries",        invoices: 34, original: 814000,  correct: 775700,  credit: isLegal ? 13400 : 38300,  status: isLegal ? "11 credited / 1 held" : "Credited",   held: isLegal },
    { customer: "Meridian Manufacturing", invoices: 31, original: 568000,  correct: 514000,  credit: 54000,  status: "Credited",  held: false },
    { customer: "Cascade Dynamics",       invoices: 26, original: 432000,  correct: 394000,  credit: 38000,  status: "Credited",  held: false },
    { customer: "Stonebridge Industries", invoices: 32, original: 498000,  correct: 463000,  credit: 35000,  status: "Credited",  held: false },
  ];

  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wide px-2">
        <span>Customer</span>
        <div className="flex gap-4 text-right">
          <span className="w-16">Invoices</span>
          <span className="w-18">Invoiced</span>
          <span className="w-18">Corrected</span>
          <span className="w-16">Credit</span>
          <span className="w-20">Status</span>
        </div>
      </div>
      {rows.map(r => (
        <div
          key={r.customer}
          className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
          style={r.held
            ? { background: "#F59E0B10", borderColor: "#F59E0B30" }
            : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {r.held && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
            <span className={r.held ? "text-amber-300/80" : "text-white/80"}>{r.customer}</span>
          </div>
          <div className="flex items-center gap-4 text-right shrink-0">
            <span className="text-white/50 tabular-nums w-16">{r.invoices}</span>
            <span className="text-white/50 tabular-nums w-18">{fmt$(r.original)}</span>
            <span className="text-white/50 tabular-nums w-18">{fmt$(r.correct)}</span>
            <span className="font-mono tabular-nums w-16" style={{ color: BILLING_COLOR }}>{fmt$(r.credit)}</span>
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 w-20 justify-center"
              style={r.held
                ? { borderColor: "#F59E0B60", color: "#F59E0B" }
                : { borderColor: `${BILLING_COLOR}60`, color: BILLING_COLOR }}
            >
              {r.status}
            </Badge>
          </div>
        </div>
      ))}
      {/* Total row */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <span className="font-semibold text-white">Total</span>
        <div className="flex items-center gap-4 text-right shrink-0">
          <span className="text-white/50 tabular-nums w-16">{rows.reduce((s,r)=>s+r.invoices,0)}</span>
          <span className="text-white/50 tabular-nums w-18">{fmt$(rows.reduce((s,r)=>s+r.original,0))}</span>
          <span className="text-white/50 tabular-nums w-18">{fmt$(rows.reduce((s,r)=>s+r.correct,0))}</span>
          <span className="font-mono font-bold tabular-nums w-16" style={{ color: BILLING_COLOR }}>{fmt$(totalCredit)}</span>
          <span className="text-white/30 text-[9px] w-20 text-center">
            {summary006?.creditsIssued || rows.reduce((s,r)=>s+r.invoices, 0)} issued
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Resolution Steps ─────────────────────────────────────────────────────────
function ResolutionSteps({ scenario, summary006, summary011 }: {
  scenario: string;
  summary006?: ResultSummary;
  summary011?: ResultSummary;
}) {
  const isLegal   = scenario === "legal-hold";
  const isErpFail = scenario === "erp-fail";

  const steps = [
    {
      n:      1,
      label:  "Issue credit memos for all eligible invoices",
      detail: isLegal
        ? `${summary006?.creditsIssued || 122} invoices credited (${fmt$(summary006?.totalCreditAmount || 140400)}). 1 invoice excluded — legal hold ${summary006?.holdRef || "REF-LEGAL-2026-047"}.`
        : `${summary006?.creditsIssued || 122} invoices credited totalling ${fmt$(summary006?.totalCreditAmount || 140400)} across 4 customers.`,
      status: "done",
      icon:   FileText,
      color:  BILLING_COLOR,
    },
    {
      n:      2,
      label:  "Correct ERP price list",
      detail: isErpFail
        ? `CR-${summary011?.erpCorrectionRequest || "CR-2026-PL-0047"} submitted. ⚠ ERP validation failed — ${summary011?.openOrdersBlocking || 8} open orders block PL switch. Manual resolution required (~${summary011?.erpResolutionDays || 3} business days).`
        : `Change request ${summary006?.erpCorrectionRef || "CR-2026-PL-0047"} submitted. Replace PL-2024-C → PL-2025-C-APEX. 48-hour staging period.`,
      status: isErpFail ? "blocked" : "done",
      icon:   Settings,
      color:  isErpFail ? "#F59E0B" : CONTRACT_COLOR,
    },
    {
      n:      3,
      label:  "Rebill open orders at correct rates",
      detail: `${isErpFail ? 8 : 0} open orders to be re-priced to PL-2025-C-APEX before next shipment.`,
      status: isErpFail ? "pending" : "done",
      icon:   ArrowRight,
      color:  "rgba(255,255,255,0.4)",
    },
    {
      n:      4,
      label:  "Proactive customer notifications sent",
      detail: `${summary006?.customersNotified || 4} customers notified. Meridian, Cascade &amp; Stonebridge contacted before filing disputes.`,
      status: "done",
      icon:   Bell,
      color:  BILLING_COLOR,
    },
    {
      n:      5,
      label:  "Prevention control recommended",
      detail: "Contract Pricing Verification Rule: alert if variance >1% on first 10 invoices after new contract effective date.",
      status: (summary006?.preventionRuleRecommended ?? true) ? "done" : "pending",
      icon:   CheckCircle2,
      color:  BILLING_COLOR,
    },
  ];

  return (
    <div className="space-y-2">
      {steps.map(s => {
        const Icon = s.icon;
        const isDone    = s.status === "done";
        const isBlocked = s.status === "blocked";
        return (
          <div
            key={s.n}
            className="rounded-lg border px-3 py-2.5 flex items-start gap-2.5"
            style={{
              background:   isDone ? `${s.color}08` : isBlocked ? "#F59E0B08" : "rgba(255,255,255,0.02)",
              borderColor:  isDone ? `${s.color}30` : isBlocked ? "#F59E0B30" : "rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{
                background: isDone ? `${s.color}20` : isBlocked ? "#F59E0B20" : "rgba(255,255,255,0.05)",
                color:      isDone ? s.color : isBlocked ? "#F59E0B" : "rgba(255,255,255,0.3)",
              }}
            >
              {isDone
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : isBlocked
                  ? <AlertTriangle className="w-3.5 h-3.5" />
                  : <Icon className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80">{s.label}</p>
              <p
                className="text-[11px] mt-0.5 leading-relaxed"
                style={{ color: isBlocked ? "#F59E0B" : "rgba(255,255,255,0.45)" }}
                dangerouslySetInnerHTML={{ __html: s.detail }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Pre-run placeholder ──────────────────────────────────────────────────────
function PreRunCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${BILLING_COLOR}20`, border: `1px solid ${BILLING_COLOR}40` }}
      >
        <FileText className="w-5 h-5" style={{ color: BILLING_COLOR }} />
      </div>
      <p className="text-sm text-white/50">
        Run the demo to see the bulk credit resolution plan, affected invoice table, and ERP correction.
      </p>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OtcDisputeS2Resolution({ pipelineComplete, scenario, resultSummaries }: OtcDisputeS2Props) {
  const s006  = resultSummaries?.["OTC-AGT-006"];
  const s011  = resultSummaries?.["OTC-AGT-011"];

  const isErpFail = scenario === "erp-fail";
  const isLegal   = scenario === "legal-hold";

  if (!pipelineComplete) return <PreRunCard />;

  const totalCredit  = s006?.totalCreditAmount || (isLegal ? 140400 : 140400);
  const creditsIssued = s006?.creditsIssued || 122;
  const excluded      = s006?.legalHoldExcluded || (isLegal ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Top Resolution Header */}
      <div className="rounded-lg border border-white/10 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">Bulk Resolution Recommendation</h3>
              <AgentBadge code="OTC-AGT-008" />
              <AgentBadge code="OTC-AGT-006" color={BILLING_COLOR} />
            </div>
            <p className="text-xs text-white/50 mt-1">
              {creditsIssued} credit memos · {fmt$(totalCredit)} total ·
              {excluded > 0 ? ` ${excluded} excluded (legal hold) ·` : ""}
              {" "}ERP correction: {isErpFail ? "⚠ Manual required" : `${s006?.erpCorrectionRef || "CR-2026-PL-0047"} submitted`} ·
              {" "}{s006?.customersNotified || 4} customers notified ·
              {" "}{s006?.processingTimeHours || 2}h estimated processing
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-white/30">Total Credit</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: BILLING_COLOR }}>{fmt$(totalCredit)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30">Invoices</p>
              <p className="text-xl font-bold tabular-nums text-white">{creditsIssued}</p>
            </div>
          </div>
        </div>

        {/* Exception callouts */}
        {isLegal && (
          <div
            className="mt-3 rounded-lg flex items-center gap-2 px-3 py-2 text-xs"
            style={{ background: "#F59E0B12", border: "1px solid #F59E0B40" }}
          >
            <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="text-amber-400">
              Legal hold on {s006?.holdInvoice || "CRN-2026-AX-0005"} ({s006?.holdRef || "REF-LEGAL-2026-047"}) — excluded from batch.
              $24,900 credit pending Legal clearance (est. {" "}Apr 15, 2026).
            </span>
          </div>
        )}
        {isErpFail && (
          <div
            className="mt-3 rounded-lg flex items-center gap-2 px-3 py-2 text-xs"
            style={{ background: "#F59E0B12", border: "1px solid #F59E0B40" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="text-amber-400">
              ERP price list switch failed validation — {s011?.openOrdersBlocking || 8} open orders reference PL-2024-C.
              Manual re-pricing required ({s011?.erpResolutionDays || 3} business days). Credits for completed invoices unaffected.
            </span>
          </div>
        )}
      </div>

      {/* Two columns: steps + invoice table */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: Resolution Steps */}
        <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Resolution Execution</h3>
            <AgentBadge code="OTC-AGT-006" color={BILLING_COLOR} />
          </div>
          <ResolutionSteps scenario={scenario} summary006={s006} summary011={s011} />
        </div>

        {/* Right: Invoice Table + Prevention */}
        <div className="flex flex-col gap-3">
          {/* Invoice table */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-4 flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Affected Invoice Summary</h3>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {isLegal ? "122 eligible / 1 held" : "123 invoices"} · 4 customers
                </p>
              </div>
              <AgentBadge code="OTC-AGT-006" color={BILLING_COLOR} />
            </div>
            <InvoiceTable scenario={scenario} summary006={s006} />
          </div>

          {/* ERP + Prevention panels */}
          <div className="grid grid-cols-2 gap-3">
            {/* ERP Price List Correction */}
            <div className="rounded-lg border p-3 flex flex-col gap-2"
              style={isErpFail
                ? { background: "#F59E0B08", borderColor: "#F59E0B30" }
                : { background: `${CONTRACT_COLOR}08`, borderColor: `${CONTRACT_COLOR}30` }}
            >
              <div className="flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" style={{ color: isErpFail ? "#F59E0B" : CONTRACT_COLOR }} />
                <span className="text-xs font-semibold" style={{ color: isErpFail ? "#F59E0B" : CONTRACT_COLOR }}>
                  ERP Price List Correction
                </span>
                <AgentBadge code="OTC-AGT-011" color={CONTRACT_COLOR} />
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-white/40">
                  <span>Before</span>
                  <span className="font-mono text-white/60">PL-2024-C</span>
                </div>
                <div className="text-center text-white/20 text-[9px]">▼</div>
                <div className="flex items-center justify-between text-white/40">
                  <span>After</span>
                  <span className="font-mono text-white/60">PL-2025-C-APEX</span>
                </div>
              </div>
              <div
                className="rounded px-2 py-1 text-[10px] text-center"
                style={isErpFail
                  ? { background: "#F59E0B20", color: "#F59E0B" }
                  : { background: `${CONTRACT_COLOR}20`, color: CONTRACT_COLOR }}
              >
                {isErpFail ? "⚠ Manual Required" : `${s006?.erpCorrectionRef || "CR-2026-PL-0047"} Submitted`}
              </div>
            </div>

            {/* Prevention Rule */}
            <div className="rounded-lg border p-3 flex flex-col gap-2"
              style={{ background: `${BILLING_COLOR}08`, borderColor: `${BILLING_COLOR}30` }}
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: BILLING_COLOR }} />
                <span className="text-xs font-semibold" style={{ color: BILLING_COLOR }}>New Validation Rule</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Contract Pricing Verification: When a new contract loads, compare invoiced prices vs contracted rates for first 10 invoices. Alert if variance &gt;1%.
              </p>
              <div
                className="rounded px-2 py-1 text-[10px] text-center"
                style={{ background: `${BILLING_COLOR}20`, color: BILLING_COLOR }}
              >
                Recommended ✓
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
