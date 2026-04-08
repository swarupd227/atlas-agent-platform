import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, TrendingUp, User, CreditCard,
  Building2, FileText, Clock, Activity,
} from "lucide-react";
import { NOVATECH_RFQ_SEGMENTS, MERIDIAN_CONTEXT, LINE_ITEMS, useOtcQuotePipeline } from "./otc-quote-constants";

interface Props {
  onRunAndNavigate: () => void;
}

const ENTITY_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  product:  { bg: "bg-blue-500/10",   text: "text-blue-300",   border: "border-blue-500/20",   label: "[PRODUCT]"  },
  pricing:  { bg: "bg-green-500/10",  text: "text-green-300",  border: "border-green-500/20",  label: "[PRICING]"  },
  delivery: { bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/20", label: "[DELIVERY]" },
  timeline: { bg: "bg-amber-500/10",  text: "text-amber-300",  border: "border-amber-500/20",  label: "[TIMELINE]" },
};

const FAMILIES = [
  { key: "turbine",    label: "Turbine Assemblies",   color: "text-blue-400",   skus: 12 },
  { key: "filtration", label: "Filtration Systems",   color: "text-green-400",  skus: 30 },
  { key: "control",    label: "Control Electronics",  color: "text-violet-400", skus:  5 },
];

function DiscountTierBar() {
  const ytd = MERIDIAN_CONTEXT.ytdSpend;
  const target = 35_000_000;
  const pct = Math.min((ytd / target) * 100, 100);
  const tier2 = (30_000_000 / target) * 100;
  const tier3 = 100;

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
        <span>YTD: {MERIDIAN_CONTEXT.ytdSpendLabel}</span>
        <span>Target: $35M (12% tier)</span>
      </div>
      <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
        <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-orange-500/60 to-orange-400/60 transition-all"
          style={{ width: `${pct}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-blue-400/60" style={{ left: `${tier2}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-green-400/60" style={{ left: `${tier3 - 0.5}%` }} />
      </div>
      <div className="flex justify-between text-[8px] text-muted-foreground/60 mt-0.5">
        <span />
        <span className="text-blue-400/70">$30M 10%</span>
        <span className="text-green-400/70">$35M 12%</span>
      </div>
    </div>
  );
}

export default function OtcQuoteS1Intake({ onRunAndNavigate }: Props) {
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({
    0: true, 1: true, 2: true,
  });
  const { logs, isRunning, status } = useOtcQuotePipeline();
  const recentLogs = logs.slice(-5);

  const families = FAMILIES;
  const totalList = LINE_ITEMS.reduce((s, i) => s + i.extendedListPrice, 0);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* ── SSE Agent Trace Strip (S1 — always visible when running/complete) ── */}
      {(isRunning || status === "complete") && (
        <div className="shrink-0 border-b border-orange-500/20 bg-orange-500/5 px-6 py-2 flex items-center gap-3">
          <Activity className={`w-3 h-3 text-orange-400 shrink-0 ${isRunning ? "animate-pulse" : ""}`} />
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            {recentLogs.length > 0
              ? recentLogs.slice(-2).map((l, i) => (
                  <span key={i} className="text-[9px] font-mono text-muted-foreground truncate">
                    <span className="text-orange-400">[{l.agentCode}]</span>{" "}
                    <span className={l.type === "complete" ? "text-green-400" : l.type === "error" ? "text-red-400" : ""}>{l.message}</span>
                  </span>
                ))
              : <span className="text-[9px] font-mono text-orange-400/70">Atlas orchestration initiated — OTC-AGT-001 + OTC-AGT-011 starting…</span>
            }
          </div>
          {isRunning && <Badge className="text-[8px] shrink-0 animate-pulse" style={{ background: "rgba(255,107,53,0.12)", borderColor: "rgba(255,107,53,0.3)", color: "#FF6B35" }}>⬤ Live</Badge>}
          {status === "complete" && <Badge className="text-[8px] shrink-0 bg-green-500/10 text-green-400 border-green-500/20">Q-78432 ✓</Badge>}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden px-6 py-4 gap-4">

      {/* ── Left: RFQ Parser ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 w-1/2 min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/5">
            OTC-AGT-001
          </Badge>
          <span className="text-xs font-semibold text-foreground">RFQ Document Parser</span>
          <Badge className="text-[8px] ml-auto bg-green-500/10 text-green-400 border-green-500/20">NLP Ready</Badge>
        </div>

        {/* Document viewer */}
        <Card className="flex-1 min-h-0 overflow-hidden border-border/30">
          <CardHeader className="py-2 px-3 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <CardTitle className="text-[11px]">Meridian_RFQ_April2026.pdf</CardTitle>
              <div className="flex gap-1 ml-auto">
                {Object.entries(ENTITY_STYLES).map(([k, v]) => (
                  <span key={k} className={`text-[8px] px-1.5 py-0.5 rounded border ${v.bg} ${v.text} ${v.border}`}>{v.label}</span>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-y-auto h-full p-3">
            <div className="text-[11px] leading-relaxed font-mono text-foreground/80 whitespace-pre-line">
              {NOVATECH_RFQ_SEGMENTS.map((seg, i) => {
                if (!seg.entity) return <span key={i}>{seg.text}</span>;
                const style = ENTITY_STYLES[seg.entity];
                return (
                  <mark key={i} className={`rounded px-0.5 ${style.bg} ${style.text} not-italic`}
                    title={style.label}>
                    {seg.text}
                  </mark>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Extracted line items summary */}
        <Card className="shrink-0 border-border/30">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Auto-Extracted Line Items</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-1.5">
              {families.map((f, i) => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid={`checkbox-family-${f.key}`}
                    checked={confirmed[i] ?? true}
                    onChange={e => setConfirmed(prev => ({ ...prev, [i]: e.target.checked }))}
                    className="accent-orange-500"
                  />
                  <span className={`text-[10px] font-semibold ${f.color}`}>{f.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{f.skus} SKUs</span>
                </label>
              ))}
              <div className="pt-1 border-t border-border/20 flex justify-between text-[10px]">
                <span className="text-muted-foreground">Total (47 SKUs)</span>
                <span className="font-semibold text-foreground">${totalList.toLocaleString()} list</span>
              </div>
            </div>
            <Button
              data-testid="button-configure-price"
              onClick={onRunAndNavigate}
              className="w-full mt-3 text-[11px] font-semibold text-white h-8"
              style={{ background: "#FF6B35" }}
            >
              Configure & Price →
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Right: Customer 360 ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3 w-1/2 min-h-0 overflow-y-auto">
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-400 bg-violet-500/5">
            OTC-AGT-011
          </Badge>
          <span className="text-xs font-semibold text-foreground">Customer 360 Context</span>
        </div>

        {/* Customer card */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-400" />
              <CardTitle className="text-[12px]">{MERIDIAN_CONTEXT.name}</CardTitle>
              <Badge className="ml-auto text-[8px] border-orange-500/30 text-orange-300 bg-orange-500/8">
                {MERIDIAN_CONTEXT.tier}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2.5">
            {/* Spend & contract */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/20 bg-muted/10 p-2">
                <p className="text-[9px] text-muted-foreground">Annual Spend</p>
                <p className="text-[13px] font-bold text-foreground">{MERIDIAN_CONTEXT.annualSpendLabel}</p>
                <p className="text-[9px] text-muted-foreground">Tier 1 Account</p>
              </div>
              <div className="rounded-lg border border-border/20 bg-muted/10 p-2">
                <p className="text-[9px] text-muted-foreground">Active Contract</p>
                <p className="text-[11px] font-semibold text-foreground">{MERIDIAN_CONTEXT.contractNumber}</p>
                <p className="text-[9px] text-muted-foreground">Expires {MERIDIAN_CONTEXT.contractExpiry}</p>
              </div>
            </div>

            {/* Discount schedule */}
            <div>
              <p className="text-[9px] text-muted-foreground mb-1 font-medium">Contract Discount Schedule</p>
              <div className="flex gap-1.5">
                {MERIDIAN_CONTEXT.discountSchedule.map((d, i) => (
                  <div key={i} className={`flex-1 rounded border p-1.5 text-center ${i === 2 ? "border-green-500/30 bg-green-500/5" : "border-border/20 bg-muted/10"}`}>
                    <p className="text-[10px] font-bold text-foreground">{d.pct}%</p>
                    <p className="text-[8px] text-muted-foreground">{d.label}</p>
                    <p className="text-[8px] text-muted-foreground">{d.threshold}</p>
                  </div>
                ))}
              </div>
              <DiscountTierBar />
            </div>

            {/* YTD vs projected */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] text-muted-foreground">YTD Spend</p>
                <p className="text-[11px] font-bold text-foreground">{MERIDIAN_CONTEXT.ytdSpendLabel}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">Projected</p>
                <p className="text-[11px] font-bold text-amber-400">{MERIDIAN_CONTEXT.projectedSpendLabel}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">Gap to 12%</p>
                <p className="text-[11px] font-bold text-red-400">{MERIDIAN_CONTEXT.insightGapLabel}</p>
              </div>
            </div>

            {/* Credit & AR */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-1.5 rounded border border-green-500/20 bg-green-500/5 p-2">
                <CreditCard className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Credit</p>
                  <p className="text-[11px] font-bold text-green-400">{MERIDIAN_CONTEXT.creditStatus}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded border border-border/20 bg-muted/10 p-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Open AR</p>
                  <p className="text-[11px] font-semibold text-foreground">{MERIDIAN_CONTEXT.openAR}</p>
                  <p className="text-[8px] text-green-400">Current</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded border border-border/20 bg-muted/10 p-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Avg Pay</p>
                  <p className="text-[11px] font-semibold text-foreground">{MERIDIAN_CONTEXT.avgDaysToPay}d</p>
                </div>
              </div>
            </div>

            {/* RM & last quote */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">RM:</span>
                <span className="text-[10px] font-semibold text-foreground">{MERIDIAN_CONTEXT.rm}</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground">Last Quote:</span>
                <span className="text-[9px] text-foreground">{MERIDIAN_CONTEXT.lastQuote.number}</span>
                <Badge className="text-[8px] bg-green-500/10 text-green-400 border-green-500/20">{MERIDIAN_CONTEXT.lastQuote.outcome}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Atlas Insight */}
        <Card className="border-amber-500/30 bg-amber-500/5 shrink-0">
          <CardContent className="p-3">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-amber-300 mb-1">Atlas Pricing Insight</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  At current trajectory, Meridian is{" "}
                  <span className="text-amber-300 font-semibold">${MERIDIAN_CONTEXT.insightGapLabel} short</span> of the 12% tier.
                  A strategic push to $35M unlocks their requested discount AND adds{" "}
                  <span className="text-amber-300 font-semibold">$6M additional revenue</span> for NovaTech.
                  Consider attaching a service contract and FY27 expansion discussion to this quote.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing authority note */}
        <Card className="border-red-500/20 bg-red-500/5 shrink-0">
          <CardContent className="p-3">
            <div className="flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-red-300 mb-1">Discount Authority Check</p>
                <p className="text-[10px] text-muted-foreground">
                  Customer requests <span className="text-red-300 font-semibold">12%</span> — your authority is{" "}
                  <span className="font-semibold text-foreground">8%</span>. Atlas will route for approval once pricing is generated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
