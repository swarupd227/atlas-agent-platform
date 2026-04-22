import { CheckCircle2, AlertTriangle, Search, Receipt, CreditCard, FileText, ArrowRight, TrendingDown, Clock } from "lucide-react";
import { type CashPipelineState } from "./otc-cash-constants";

const CASH_COLOR = "#10B981";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ─── Payment waterfall ────────────────────────────────────────────────────────
function PaymentWaterfall({ visible }: { visible: boolean }) {
  const rows = [
    { label: "47 Invoices (Gross)",         amount:  2_372_000, type: "base",     sign: "" },
    { label: "Freight Claim (FRGT-DMG)",    amount:    -28_500, type: "deduct",   sign: "−" },
    { label: "Early Pay Discount (EPD-2%)", amount:    -14_200, type: "deduct",   sign: "−" },
    { label: "Qty Short — INVESTIGATE",     amount:     -7_400, type: "hold",     sign: "⚠" },
    { label: "Net Amount Received",         amount:  2_262_747, type: "net",      sign: "" },
    { label: "Overpayment → Credit Memo",   amount:     38_100, type: "credit",   sign: "+" },
    { label: "Wire Received",               amount:  2_300_847, type: "total",    sign: "" },
  ];

  const colorMap: Record<string, string> = {
    base:   "text-white",
    deduct: "text-red-400",
    hold:   "text-amber-400",
    net:    "text-emerald-400",
    credit: "text-blue-400",
    total:  "text-white font-bold",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="text-sm font-semibold text-white flex items-center gap-2">
        <Receipt className="w-4 h-4 text-emerald-400" />
        Invoice Waterfall — GlobalTech Wire WF-20260328-7742
      </div>
      {visible ? (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i}
              className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg
                ${row.type === "net" || row.type === "total" ? "bg-white/8 border border-white/10" : ""}
                ${row.type === "hold" ? "bg-amber-500/5 border border-amber-500/10" : ""}
              `}>
              <span className="text-white/70 text-xs">{row.sign} {row.label}</span>
              <span className={`font-mono font-semibold ${colorMap[row.type]}`}>
                {row.type === "deduct" || row.type === "hold" ? `(${fmt$(Math.abs(row.amount))})` : fmt$(Math.abs(row.amount))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-white/30 italic">Awaiting EDI 820 parse and invoice matching…</div>
      )}
    </div>
  );
}

// ─── Deduction cards ──────────────────────────────────────────────────────────
const DEDUCTIONS = [
  {
    seq:     1,
    code:    "FRGT-DMG",
    label:   "Freight Damage Claim",
    amount:  28_500,
    verdict: "VALID" as const,
    gl:      "5400-FREIGHT-CLAIMS",
    icon:    CheckCircle2,
    color:   "emerald",
    evidence: ["POD BOL-2026-SHP77201 — damage notation at delivery", "Carrier DG-Freight acknowledged claim CLM-2026-0298"],
    note:    "Auto-approved: within $50K threshold with carrier POD",
    action:  "File carrier claim for $28,500 recovery",
  },
  {
    seq:     2,
    code:    "EPD-2PCT",
    label:   "Early Pay Discount",
    amount:  14_200,
    verdict: "VALID" as const,
    gl:      "4050-SALES-DISCOUNTS",
    icon:    CheckCircle2,
    color:   "emerald",
    evidence: ["Payment Day 9 — within 10-day discount window", "Contract PO-GT-2026-8821: 2/10 Net 45"],
    note:    "Auto-approved: timing verified, discount correctly calculated",
    action:  "Post to sales discounts GL",
  },
  {
    seq:     3,
    code:    "QTY-SHT",
    label:   "Quantity Short",
    amount:  7_400,
    verdict: "INVESTIGATE" as const,
    gl:      null,
    icon:    Search,
    color:   "amber",
    evidence: ["Delivery receipt: 50 units received", "WMS pick record: 55 units shipped"],
    note:    "Hold: 5-unit discrepancy between WMS and delivery receipt",
    action:  "Open carrier trace SHP-77201 · Target: April 4",
  },
];

function DeductionCards({ visible }: { visible: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="text-sm font-semibold text-white flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        Deduction Analysis & Validation
      </div>
      {visible ? (
        <div className="space-y-3">
          {DEDUCTIONS.map(d => {
            const Icon = d.icon;
            const isValid = d.verdict === "VALID";
            return (
              <div key={d.seq}
                className={`rounded-lg border p-4 flex flex-col gap-3
                  ${isValid ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${isValid ? "text-emerald-400" : "text-amber-400"}`} />
                    <div>
                      <div className="text-sm font-semibold text-white">{d.label}</div>
                      <div className="text-xs text-white/40 font-mono">{d.code}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{fmt$(d.amount)}</div>
                    <div className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1
                      ${isValid ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {d.verdict}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {d.evidence.map((ev, i) => (
                    <div key={i} className="text-xs text-white/60 flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
                      {ev}
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <div className={`rounded px-2 py-1 ${isValid ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {d.note}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <ArrowRight className="w-3 h-3" />
                  {d.action}
                  {d.gl && <span className="text-white/30">· GL {d.gl}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-white/30 italic">Awaiting deduction analysis…</div>
      )}
    </div>
  );
}

// ─── Exception sub-scenarios ──────────────────────────────────────────────────
function ExceptionSubscenarios({ visible }: { visible: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="text-sm font-semibold text-white flex items-center gap-2">
        <FileText className="w-4 h-4 text-white/50" />
        Exception Sub-Scenarios
      </div>
      {visible ? (
        <div className="space-y-3">
          {/* Vertex Systems */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Vertex Systems — ACH $487,200</div>
                <div className="text-xs text-white/40">ACH-2026-0328-0447 · Reference mismatch</div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">AUTO-RESOLVED</span>
            </div>
            <div className="text-xs text-white/60">
              ACH memo contained customer PO ref "VS-2026-MAR". Atlas fuzzy-matched to invoices INV-47210 through INV-47214 using customer PO cross-reference (91% confidence). Auto-confirm triggered — no manual intervention required.
            </div>
          </div>

          {/* Regional Supply */}
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Regional Supply Co — Check $127K</div>
                <div className="text-xs text-white/40">CHK-2026-77421 · No remittance data</div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">CONTACT CUSTOMER</span>
            </div>
            <div className="text-xs text-white/60">
              Check received with no remittance stub. Customer has 8 open invoices ($143K). AI suggests applying to oldest open invoices INV-45901 ($89.4K) + INV-45902 ($37.6K). Draft remittance request email generated — awaiting approval before send.
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-white/30 italic">Awaiting exception analysis…</div>
      )}
    </div>
  );
}

// ─── AR impact panel ──────────────────────────────────────────────────────────
function ArImpactPanel({ visible }: { visible: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="text-sm font-semibold text-white flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-emerald-400" />
        AR Impact — Post Posting
      </div>
      {visible ? (
        <div className="flex flex-col gap-4">
          {/* GlobalTech AR */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-white/50">GlobalTech Corp — AR Balance</div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-white/40 text-[10px]">BEFORE</span>
                <span className="text-lg font-bold text-white">$3.10M</span>
              </div>
              <ArrowRight className="w-5 h-5 text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-white/40 text-[10px]">AFTER</span>
                <span className="text-lg font-bold text-emerald-400">$0.73M</span>
              </div>
              <div className="ml-auto flex flex-col items-end">
                <span className="text-[10px] text-white/40">REDUCTION</span>
                <span className="text-sm font-bold text-emerald-400">−$2.37M</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: "76.5%" }} />
            </div>
            <div className="text-xs text-white/40">47 invoices closed · 3 remaining open ($0.73M current)</div>
          </div>

          {/* Credit Memo */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex flex-col gap-0.5 flex-1">
              <div className="text-xs font-semibold text-white">Credit Memo Issued: CM-2026-0328-GT</div>
              <div className="text-xs text-white/50">$38,100 overpayment credit · Available against future invoices · Expires 2027-03-28</div>
            </div>
            <div className="text-sm font-bold text-blue-400 shrink-0">$38.1K</div>
          </div>

          {/* DSO */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-center">
              <div className="text-white/40 mb-1">Invoices Closed</div>
              <div className="text-base font-bold text-white">47</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-center">
              <div className="text-white/40 mb-1">DSO Improvement</div>
              <div className="text-base font-bold text-emerald-400">4.2 days</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-center">
              <div className="text-white/40 mb-1">Bank Rec</div>
              <div className="text-base font-bold text-white">98.7%</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-white/30 italic">Awaiting AR posting…</div>
      )}
    </div>
  );
}

// ─── Resolution Summary Banner ────────────────────────────────────────────────
function ResolutionBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-white">GlobalTech $2.3M Payment — Fully Resolved</div>
          <div className="text-xs text-white/60 leading-relaxed">
            That $2.3M payment covering 47 invoices with 3 deductions and an overpayment? The current team takes 4–6 hours.
            Atlas matched all 47 invoices in seconds, validated two deductions automatically (freight claim $28.5K + early pay $14.2K),
            flagged one for investigation with carrier evidence ($7.4K quantity short), issued a $38.1K credit memo,
            posted all journal entries, and reduced GlobalTech's AR from $3.1M to $0.73M — all with one-click controller confirmation.
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <Clock className="w-3 h-3" />
              Traditional: 4–6 hours → Atlas: &lt;2 minutes
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── S2 Resolution Component ──────────────────────────────────────────────────
interface Props {
  state: CashPipelineState;
}

export default function OtcCashS2Resolution({ state }: Props) {
  const { phase, agents } = state;
  const step2Done = agents.find(a => a.step === 2)?.status === "complete";
  const step3Done = agents.find(a => a.step === 3)?.status === "complete";
  const hasResolution = step2Done || step3Done || phase === "complete";
  const hasPosting    = step3Done || phase === "complete";
  const isComplete    = phase === "complete";

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <ResolutionBanner visible={isComplete} />

      {/* Payment summary */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Wire Received",     value: "$2,300,847", sub: "WF-20260328-7742",         color: "text-white"      },
          { label: "Invoices Matched",  value: "47 of 47",   sub: "99.2% confidence",          color: "text-emerald-400" },
          { label: "Deductions",        value: "$50,100",    sub: "2 valid · 1 investigate",   color: "text-amber-400"  },
          { label: "Overpayment",       value: "$38,100",    sub: "→ Credit memo CM-2026-0328-GT", color: "text-blue-400" },
        ].map(item => (
          <div key={item.label} className="flex flex-col gap-1">
            <div className="text-xs text-white/40">{item.label}</div>
            <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-white/30">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Waterfall + deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PaymentWaterfall visible={hasResolution} />
        <DeductionCards   visible={hasResolution} />
      </div>

      {/* Exception sub-scenarios + AR impact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExceptionSubscenarios visible={hasResolution} />
        <ArImpactPanel         visible={hasPosting}    />
      </div>
    </div>
  );
}
