import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Send, CheckCircle2, Download, Mail, Globe,
  TrendingUp, AlertTriangle, ChevronRight, Activity,
} from "lucide-react";
import {
  QUOTE_DOC, MERIDIAN_CONTEXT, DELIVERY_SCHEDULE, PRICING_WATERFALL,
  LINE_ITEMS, useOtcQuotePipeline,
} from "./otc-quote-constants";

const FORMAT_OPTIONS = [
  { id: "pdf",    label: "PDF",    Icon: FileText },
  { id: "word",   label: "Word",   Icon: Download },
  { id: "email",  label: "Email",  Icon: Mail },
  { id: "portal", label: "Portal", Icon: Globe },
];

const STATUS_LIFECYCLE = [
  { key: "approved", label: "Approved",  done: true  },
  { key: "sent",     label: "Sent",      done: false },
  { key: "viewed",   label: "Viewed",    done: false },
  { key: "accepted", label: "Accepted",  done: false },
];

function QuoteDocument() {
  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const families = [
    { label: "Turbine Assemblies", items: LINE_ITEMS.filter(i => i.family === "turbine") },
    { label: "Filtration Systems", items: LINE_ITEMS.filter(i => i.family === "filtration") },
    { label: "Control Electronics", items: LINE_ITEMS.filter(i => i.family === "control") },
  ];

  return (
    <div className="relative bg-white dark:bg-zinc-900 rounded-lg border border-border/40 overflow-hidden text-[10px]">
      {/* APPROVED watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 opacity-[0.06] select-none">
        <span className="text-green-600 dark:text-green-400 font-black text-7xl transform -rotate-12">APPROVED</span>
      </div>

      {/* Cover */}
      <div className="relative z-20 border-b border-border/30 p-5" style={{ background: "linear-gradient(135deg, rgba(255,107,53,0.06) 0%, rgba(255,107,53,0.01) 100%)" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,107,53,0.15)" }}>
                <FileText className="w-4 h-4" style={{ color: "#FF6B35" }} />
              </div>
              <div>
                <p className="font-black text-[13px] text-foreground">NovaTech Industries</p>
                <p className="text-[9px] text-muted-foreground">Capital Equipment Division</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-[13px] text-foreground">{QUOTE_DOC.quoteNumber}</p>
            <p className="text-muted-foreground">Issued: {fmtDate(today)}</p>
            <p className="text-muted-foreground">Valid: {fmtDate(validUntil)}</p>
            <Badge className="mt-1 text-[8px] bg-green-500/15 text-green-400 border-green-500/30">
              ✓ {QUOTE_DOC.approvalStatus} — {QUOTE_DOC.approver}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground text-[8px] uppercase font-semibold tracking-wide mb-0.5">Prepared For</p>
            <p className="font-bold text-foreground">{MERIDIAN_CONTEXT.name}</p>
            <p className="text-muted-foreground">{QUOTE_DOC.contact}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[8px] uppercase font-semibold tracking-wide mb-0.5">Total Value</p>
            <p className="font-black text-[16px] text-foreground">{QUOTE_DOC.totalNetPrice}</p>
            <p className="text-muted-foreground">Effective {QUOTE_DOC.effectiveDiscount} discount off {QUOTE_DOC.totalListPrice} list</p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="relative z-20 border-b border-border/30 p-4">
        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wide mb-2">Executive Summary</p>
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded border border-border/30 p-2 text-center">
            <p className="font-bold text-[12px] text-foreground">{QUOTE_DOC.skuCount}</p>
            <p className="text-muted-foreground">SKUs</p>
          </div>
          <div className="rounded border border-border/30 p-2 text-center">
            <p className="font-bold text-[12px] text-foreground">4</p>
            <p className="text-muted-foreground">Plants</p>
          </div>
          <div className="rounded border border-border/30 p-2 text-center">
            <p className="font-bold text-[12px] text-foreground">{QUOTE_DOC.validityDays}d</p>
            <p className="text-muted-foreground">Validity</p>
          </div>
          <div className="rounded border border-border/30 p-2 text-center">
            <p className="font-bold text-[12px] text-foreground">{PRICING_WATERFALL.effectiveDiscountPct}%</p>
            <p className="text-muted-foreground">Eff. Discount</p>
          </div>
        </div>
      </div>

      {/* Line items preview */}
      <div className="relative z-20 border-b border-border/30 p-4">
        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wide mb-2">Line Items Summary</p>
        {families.map(fam => {
          const famTotal = fam.items.reduce((s, i) => s + i.extendedNetPrice, 0);
          return (
            <div key={fam.label} className="flex justify-between py-0.5 border-b border-border/10 last:border-0">
              <span className="text-foreground/80">{fam.label} ({fam.items.length} SKUs)</span>
              <span className="font-semibold text-foreground">${famTotal.toLocaleString()}</span>
            </div>
          );
        })}
        <div className="flex justify-between mt-1 pt-1 border-t border-border/30 font-bold text-foreground">
          <span>Total ({QUOTE_DOC.skuCount} line items)</span>
          <span>{QUOTE_DOC.totalNetPrice}</span>
        </div>
      </div>

      {/* Delivery Schedule */}
      <div className="relative z-20 border-b border-border/30 p-4">
        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wide mb-2">Delivery Schedule</p>
        <div className="space-y-1">
          {DELIVERY_SCHEDULE.map(loc => (
            <div key={loc.plant} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${loc.primary ? "bg-orange-400" : "bg-muted-foreground/40"}`} />
              <span className="font-semibold text-foreground w-16 shrink-0">{loc.plant}, {loc.state}</span>
              <span className="text-muted-foreground">{loc.skus} SKUs · {loc.value}</span>
              <span className="ml-auto text-foreground">{loc.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Terms & Signature */}
      <div className="relative z-20 p-4">
        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wide mb-2">Terms & Conditions</p>
        <p className="text-muted-foreground leading-relaxed">
          Payment Net 30 days from invoice date. Title and risk of loss pass to Buyer upon delivery. NovaTech standard warranty applies (12 months parts & labour). Force majeure clause per MSA-2024-0892 terms. Prices valid for 30 days from quote date. Subject to final credit approval.
        </p>
        <div className="grid grid-cols-2 gap-6 mt-4 pt-3 border-t border-border/20">
          <div>
            <div className="h-6 border-b border-foreground/30 mb-1" />
            <p className="text-muted-foreground">Authorised — NovaTech Industries</p>
          </div>
          <div>
            <div className="h-6 border-b border-foreground/30 mb-1" />
            <p className="text-muted-foreground">Accepted — {MERIDIAN_CONTEXT.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OtcQuoteS4Document() {
  const { state, logs } = useOtcQuotePipeline();
  const completionLogs = logs.filter(l => l.type === "complete" || l.agentCode === "SYSTEM");
  const [format, setFormat] = useState("pdf");
  const [sent, setSent] = useState(false);
  const [coverEmail, setCoverEmail] = useState(
    `Dear Jim,\n\nPlease find attached our formal quotation ${QUOTE_DOC.quoteNumber} for the capital equipment package discussed. We've optimised the pricing to ${QUOTE_DOC.effectiveDiscount} effective discount via our bundle mechanism — achieving your cost targets while meeting our margin requirements.\n\nKey points:\n• ${QUOTE_DOC.skuCount} SKUs, ${QUOTE_DOC.totalNetPrice} net (eff. ${QUOTE_DOC.effectiveDiscount} off ${QUOTE_DOC.totalListPrice} list)\n• Delivery across 4 plants, committed through ${DELIVERY_SCHEDULE[DELIVERY_SCHEDULE.length - 1].date}\n• APPROVED by ${QUOTE_DOC.approver}\n• Valid until ${QUOTE_DOC.validUntil}\n\nI'd also welcome a conversation about NovaTech's service contract offering — which, combined with your FY27 expansion, would unlock the 12% discount tier on all future orders.\n\nBest regards,\nNovaTech Sales Team`
  );

  const [lifecycleStep, setLifecycleStep] = useState(0);

  const handleSend = () => {
    setSent(true);
    let step = 0;
    const tick = () => {
      step++;
      setLifecycleStep(step);
      if (step < STATUS_LIFECYCLE.length - 1) setTimeout(tick, 1200);
    };
    setTimeout(tick, 800);
  };

  return (
    <div className="flex h-full min-h-0 gap-4 px-6 py-4">

      {/* ── Main: Document Preview ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/5">OTC-AGT-001</Badge>
          <span className="text-xs font-semibold text-foreground">Quote Document Preview</span>
          <Badge className="ml-auto text-[8px] bg-green-500/10 text-green-400 border-green-500/20">
            {QUOTE_DOC.quoteNumber} · APPROVED
          </Badge>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <QuoteDocument />
        </div>
      </div>

      {/* ── Right: Delivery & Tracking ──────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Format selector */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Output Format</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-4 gap-1.5">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  data-testid={`format-${opt.id}`}
                  onClick={() => setFormat(opt.id)}
                  className={`flex flex-col items-center gap-1 py-2 rounded border text-[9px] font-semibold transition-all ${
                    format === opt.id
                      ? "text-orange-300 border-orange-500/40"
                      : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                  }`}
                  style={format === opt.id ? { background: "rgba(255,107,53,0.08)" } : {}}>
                  <opt.Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Contact & email */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="rounded border border-border/20 bg-muted/10 p-2">
              <p className="text-[9px] text-muted-foreground">To</p>
              <p className="text-[10px] font-semibold text-foreground">{QUOTE_DOC.contact}</p>
              <p className="text-[9px] text-muted-foreground">{MERIDIAN_CONTEXT.name}</p>
            </div>
            <Textarea
              data-testid="textarea-cover-email"
              value={coverEmail}
              onChange={e => setCoverEmail(e.target.value)}
              className="text-[9px] font-mono resize-none bg-muted/5 border-border/30"
              rows={8}
            />
            <Button
              data-testid="button-send-quote"
              onClick={handleSend}
              disabled={sent}
              className="w-full h-8 text-[11px] font-semibold text-white"
              style={{ background: "#FF6B35" }}
            >
              {sent ? (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Quote Sent</>
              ) : (
                <><Send className="w-3.5 h-3.5 mr-1.5" /> Send Quote</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Quote lifecycle tracking */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Quote Tracking</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex items-center gap-1">
              {STATUS_LIFECYCLE.map((s, i) => {
                const isReached = sent ? i <= lifecycleStep : s.done;
                const isCurrent = sent && i === lifecycleStep;
                return (
                  <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isReached ? "border-green-500/50 bg-green-500/15" :
                        isCurrent ? "border-orange-500/50 bg-orange-500/10 animate-pulse" :
                        "border-border/30 bg-muted/10"}`}>
                        {isReached && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                      </div>
                      <span className={`text-[8px] mt-0.5 text-center ${isReached ? "text-green-400" : "text-muted-foreground/50"}`}>{s.label}</span>
                    </div>
                    {i < STATUS_LIFECYCLE.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-border/40 shrink-0 -mt-4" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Win probability */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Win Probability</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[22px] font-black text-foreground">{QUOTE_DOC.winProbability}%</span>
              <div className="flex-1">
                <div className="h-2.5 rounded-full bg-muted/20 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-green-500" style={{ width: `${QUOTE_DOC.winProbability}%` }} />
                </div>
                <p className="text-[8px] text-muted-foreground mt-0.5">Based on Meridian history & deal characteristics</p>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-[9px] text-muted-foreground">
              <TrendingUp className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
              <span>Previous win rate with this customer: 82% on quotes &gt;$300K</span>
            </div>
          </CardContent>
        </Card>

        {/* Upsell callout */}
        <Card className="border-amber-500/30 bg-amber-500/5 shrink-0">
          <CardContent className="p-3">
            <div className="flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-amber-300 mb-1">Upsell Opportunity</p>
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  {QUOTE_DOC.upsellPath}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SSE Execution Trace (S4) */}
        <Card className="border-border/30 shrink-0" data-testid="s4-agent-trace">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px] flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-orange-400" />
              Pipeline Execution Trace
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {completionLogs.length > 0 ? (
              <div className="flex flex-col gap-1">
                {completionLogs.map((l, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className={`text-[8px] font-mono shrink-0 ${l.type === "complete" ? "text-green-400" : "text-orange-400"}`}>[{l.agentCode}]</span>
                    <span className="text-[8px] text-muted-foreground leading-tight">{l.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {[
                  { code: "OTC-AGT-001", msg: "rfq intake complete ✓ · OTC-AGT-011 parallel ✓" },
                  { code: "OTC-AGT-001", msg: "product config complete ✓ · 3 substitutions applied" },
                  { code: "OTC-AGT-011", msg: "pricing optimisation complete ✓ · $429,711 net" },
                  { code: "OTC-AGT-001", msg: "quote generation complete ✓ · Q-78432 ready" },
                  { code: "SYSTEM", msg: "Quote Q-78432 approved — Sarah Chen, Regional VP" },
                ].map((l, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-[8px] font-mono shrink-0 text-green-400">[{l.code}]</span>
                    <span className="text-[8px] text-muted-foreground leading-tight">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Talking point */}
        <Card className="border-border/20 bg-muted/5 shrink-0">
          <CardContent className="p-3">
            <p className="text-[9px] text-muted-foreground/80 leading-relaxed italic">
              "A 47-SKU multi-site quote with compatibility checks, tiered pricing, bundle optimisation, discount approval, and professional document generation — done in 90 seconds. Manual process: 4–6 hours with 3–5% error rate. Atlas eliminated errors, optimised the deal ($975 incremental margin), and identified a $6M upsell path."
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
