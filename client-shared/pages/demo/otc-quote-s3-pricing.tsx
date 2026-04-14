import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, ArrowRight,
  TrendingDown, Shield, Send, Terminal,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  LINE_ITEMS, PRICING_WATERFALL, MERIDIAN_CONTEXT, useOtcQuotePipeline,
} from "./otc-quote-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

type SortField = "lineNo" | "sku" | "marginPct" | "extendedNetPrice" | "leadTimeWeeks";
type SortDir = "asc" | "desc";

function getMarginColor(pct: number): string {
  if (pct > 30) return "text-green-400";
  if (pct >= 20) return "text-amber-400";
  return "text-red-400";
}

function WaterfallChart() {
  const pw = PRICING_WATERFALL;
  const data = [
    { name: "List Price",      value: pw.listPrice,                 type: "base",     label: `$${(pw.listPrice/1000).toFixed(0)}K` },
    { name: "Volume Disc.",    value: -pw.volumeDiscount.amount,    type: "discount",  label: `-$${(pw.volumeDiscount.amount/1000).toFixed(0)}K (${pw.volumeDiscount.pct}%)` },
    { name: "Bundle P-220",   value: -pw.bundleDiscount.amount,    type: "discount",  label: `-$${(pw.bundleDiscount.amount/1000).toFixed(0)}K (${pw.bundleDiscount.pct}%)` },
    { name: "Net Price",       value: pw.netPrice,                  type: "result",    label: `$${(pw.netPrice/1000).toFixed(0)}K` },
  ];

  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#888" }} tickLine={false} axisLine={false} />
          <YAxis hide domain={[0, 520000]} />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 10 }}
            formatter={(v: number) => [`$${Math.abs(v).toLocaleString()}`, ""]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 8, fill: "#aaa", formatter: (_: any, entry: any) => entry?.label || "" }}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.type === "base"    ? "#FF6B35" :
                  entry.type === "discount"? "#ef4444" :
                  "#22c55e"
                }
                fillOpacity={0.75}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonBars() {
  const pw = PRICING_WATERFALL;
  const max = pw.listPrice;
  const atlasW = (pw.netPrice / max) * 100;
  const custW = (pw.customerRequested.amount / max) * 100;

  return (
    <div className="space-y-2">
      <div>
        <div className="flex justify-between text-[9px] mb-0.5">
          <span className="text-muted-foreground">Customer Requested (12%)</span>
          <span className="text-amber-400 font-semibold">${pw.customerRequested.amount.toLocaleString()}</span>
        </div>
        <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
          <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${custW}%` }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[9px] mb-0.5">
          <span className="text-muted-foreground">Atlas Optimised (11.8%)</span>
          <span className="text-green-400 font-semibold">${pw.netPrice.toLocaleString()}</span>
        </div>
        <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
          <div className="h-full rounded-full bg-green-500/60" style={{ width: `${atlasW}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded border border-green-500/20 bg-green-500/5 px-2 py-1">
        <TrendingDown className="w-3 h-3 text-green-400" />
        <span className="text-[9px] text-green-300 font-semibold">{pw.deltaLabel}</span>
        <span className="text-[8px] text-muted-foreground ml-1">via bundle mechanism — no authority breach</span>
      </div>
    </div>
  );
}

export default function OtcQuoteS3Pricing({ onScreenChange }: Props) {
  const { state } = useOtcQuotePipeline();
  const [sortField, setSortField] = useState<SortField>("lineNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [approvalClicked, setApprovalClicked] = useState(false);
  const [approved, setApproved] = useState(false);

  const pw = PRICING_WATERFALL;
  const isComplete = state.status === "complete";
  const hasQuote = state.results.some(r => r.role === "quote_generation");

  const items = [...LINE_ITEMS].sort((a, b) => {
    const av = a[sortField as keyof typeof a] as number | string;
    const bv = b[sortField as keyof typeof b] as number | string;
    if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const toggleRow = (sku: string) => setExpandedRows(s => {
    const ns = new Set(s);
    ns.has(sku) ? ns.delete(sku) : ns.add(sku);
    return ns;
  });

  const handleRouteApproval = () => {
    setApprovalClicked(true);
    setTimeout(() => setApproved(true), 2000);
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    sortField === field
      ? sortDir === "asc" ? <ChevronUp className="w-2.5 h-2.5 inline" /> : <ChevronDown className="w-2.5 h-2.5 inline" />
      : <span className="text-muted-foreground/30 text-[8px]">⇅</span>
  );

  const totalExtNet = items.reduce((s, i) => s + i.extendedNetPrice, 0);
  const totalExtList = items.reduce((s, i) => s + i.extendedListPrice, 0);

  return (
    <div className="flex flex-col h-full min-h-0 px-6 py-4 gap-3 overflow-hidden">

      {/* ── Top 40%: Pricing Waterfall ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 shrink-0" style={{ height: "38%" }}>
        <Card className="border-border/30 overflow-hidden">
          <CardHeader className="py-2 px-3 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-400 bg-violet-500/5">OTC-AGT-011</Badge>
              <CardTitle className="text-[11px]">Pricing Waterfall</CardTitle>
              <Badge className="ml-auto text-[8px] bg-muted/20 text-muted-foreground border-border/30">
                List ${(pw.listPrice / 1000).toFixed(0)}K → Net ${(pw.netPrice / 1000).toFixed(0)}K
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 overflow-hidden">
            <WaterfallChart />
            <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[9px]">
              <div>
                <p className="text-muted-foreground">List</p>
                <p className="font-bold text-foreground">${pw.listPrice.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Discounts</p>
                <p className="font-bold text-red-400">-${(pw.volumeDiscount.amount + pw.bundleDiscount.amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Net</p>
                <p className="font-bold text-green-400">${pw.netPrice.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/30 overflow-hidden">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Pricing Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ComparisonBars />
            <div className="mt-2 rounded border border-green-500/20 bg-green-500/5 p-2">
              <p className="text-[9px] text-green-300 font-semibold">Atlas Insight</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
                Bundle P-220 achieves equivalent economics to 12% without exceeding contract tier.
                Effective discount 11.8% — customer goal met, NovaTech saves $975.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Centre 35%: Line Item Table ──────────────────────────────── */}
      <Card className="border-border/30 flex flex-col overflow-hidden" style={{ height: "37%" }}>
        <CardHeader className="py-2 px-3 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-[11px]">Line Item Detail — {items.length} SKUs</CardTitle>
            <span className="text-[9px] text-muted-foreground ml-auto">Click header to sort · Click row to expand margin analysis</span>
          </div>
        </CardHeader>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[9px]">
            <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
              <tr className="border-b border-border/20">
                {[
                  { f: "lineNo" as SortField, l: "#" },
                  { f: "sku" as SortField, l: "SKU" },
                  { l: "Description" },
                  { l: "Qty" },
                  { l: "Unit List" },
                  { l: "Disc %" },
                  { l: "Unit Net" },
                  { l: "Extended" },
                  { f: "marginPct" as SortField, l: "Margin %" },
                  { f: "leadTimeWeeks" as SortField, l: "Lead" },
                ].map((col, i) => (
                  <th key={i}
                    onClick={() => col.f && toggleSort(col.f)}
                    className={`px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap ${col.f ? "cursor-pointer hover:text-foreground" : ""}`}>
                    {col.l} {col.f && <SortIcon field={col.f} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const isExpanded = expandedRows.has(item.sku);
                return [
                  <tr key={item.sku}
                    data-testid={`row-lineitem-${item.lineNo}`}
                    onClick={() => toggleRow(item.sku)}
                    className={`border-b border-border/10 cursor-pointer transition-colors hover:bg-muted/10 ${idx % 2 === 0 ? "" : "bg-muted/5"} ${item.addedByAi ? "bg-green-500/5" : ""}`}>
                    <td className="px-2 py-1 text-muted-foreground">{item.lineNo}</td>
                    <td className="px-2 py-1 font-mono text-foreground/80">{item.sku}</td>
                    <td className="px-2 py-1 text-foreground/70 max-w-32 truncate">{item.description}{item.addedByAi && " ✦"}</td>
                    <td className="px-2 py-1 text-center">{item.qty}</td>
                    <td className="px-2 py-1 text-right">${item.unitListPrice.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-orange-400">{item.discountPct}%</td>
                    <td className="px-2 py-1 text-right">${item.unitNetPrice.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right font-semibold">${item.extendedNetPrice.toLocaleString()}</td>
                    <td className={`px-2 py-1 text-right font-bold ${getMarginColor(item.marginPct)}`}>{item.marginPct}%</td>
                    <td className={`px-2 py-1 text-center ${item.leadTimeWeeks >= 8 ? "text-amber-400" : "text-muted-foreground"}`}>{item.leadTimeWeeks}w</td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${item.sku}-expanded`} className="bg-muted/10 border-b border-border/10">
                      <td colSpan={10} className="px-3 py-2">
                        <div className="flex gap-6 text-[9px]">
                          <div>
                            <p className="text-muted-foreground font-semibold mb-1">Margin Analysis</p>
                            <div className="flex gap-3">
                              <span>Cost basis: ${Math.round(item.unitNetPrice * (1 - item.marginPct / 100)).toLocaleString()}</span>
                              <span>Contribution: ${Math.round(item.unitNetPrice * item.marginPct / 100).toLocaleString()}/unit</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-semibold mb-1">Competitive Context</p>
                            <span className={getMarginColor(item.marginPct)}>
                              {item.marginPct > 30 ? "Above target margin — strong position" :
                               item.marginPct >= 20 ? "Within acceptable margin range" :
                               "Below target — flag for review"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-background/95 backdrop-blur-sm">
              <tr className="border-t border-border/30 font-bold">
                <td colSpan={7} className="px-2 py-1.5 text-foreground">Total ({items.length} line items)</td>
                <td className="px-2 py-1.5 text-right text-foreground">${totalExtNet.toLocaleString()}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── Bottom 25%: Approval Routing ─────────────────────────────── */}
      <Card className="border-border/30 shrink-0" style={{ height: "25%" }}>
        <CardHeader className="py-2 px-3 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/5">OTC-AGT-001</Badge>
            <CardTitle className="text-[11px]">Approval Routing Decision</CardTitle>
            {approved && (
              <Badge className="ml-auto text-[10px] bg-green-500/15 text-green-400 border-green-500/30 animate-pulse">
                ✓ APPROVED — Sarah Chen
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 flex gap-4 h-full overflow-hidden">
          <div className="flex-1 min-w-0">
            <div className={`flex items-start gap-2 rounded border p-2 mb-2 ${approved ? "border-green-500/30 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
              {approved
                ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                : <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <div>
                <p className={`text-[10px] font-semibold ${approved ? "text-green-300" : "text-amber-300"}`}>
                  {approved ? "APPROVED by Sarah Chen, Regional VP" : pw.approvalNote}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Deal: Meridian Manufacturing · {MERIDIAN_CONTEXT.tier} · $429,711 net · 48 SKUs · 4-plant delivery
                  {" · "}Margin impact: +$975 vs customer request · ASC 606 compliant · Robinson-Patman validated
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!approved ? (
                <>
                  <Button
                    data-testid="button-route-approval"
                    onClick={handleRouteApproval}
                    disabled={approvalClicked}
                    className="h-7 text-[10px] px-3 font-semibold text-white"
                    style={{ background: "#FF6B35" }}
                  >
                    {approvalClicked && !approved ? (
                      <><span className="animate-pulse">Sending to Sarah Chen…</span></>
                    ) : (
                      <><Send className="w-3 h-3 mr-1.5" /> Route for Approval</>
                    )}
                  </Button>
                  <Button variant="outline" data-testid="button-adjust-pricing" className="h-7 text-[10px] px-3 border-border/40">
                    Adjust Pricing
                  </Button>
                </>
              ) : (
                <Button
                  data-testid="button-generate-quote"
                  onClick={() => onScreenChange(4)}
                  disabled={!hasQuote && state.status !== "complete"}
                  className="h-7 text-[10px] px-3 font-semibold text-white"
                  style={{ background: "#FF6B35" }}
                >
                  Generate Quote Document <ArrowRight className="w-3 h-3 ml-1.5" />
                </Button>
              )}
            </div>
          </div>

          {/* SSE mini trace */}
          <div className="w-52 shrink-0 flex flex-col">
            <div className="flex items-center gap-1.5 mb-1">
              <Terminal className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground">Live Trace</span>
              {state.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 ml-auto animate-pulse" />}
            </div>
            <div className="flex-1 overflow-y-auto font-mono space-y-0.5 bg-muted/10 rounded border border-border/20 p-1.5">
              {state.logEntries.slice(-8).map((log, i) => (
                <div key={i} className={`text-[8px] leading-relaxed truncate ${
                  log.type === "complete" ? "text-green-400" :
                  log.type === "error"    ? "text-red-400"   :
                  log.type === "progress" ? "text-orange-300/70" :
                  "text-muted-foreground/60"}`}>
                  <span className="text-orange-400/50 mr-1">[{log.agentCode}]</span>
                  {log.message}
                </div>
              ))}
              {state.logEntries.length === 0 && <p className="text-[8px] text-muted-foreground/40 italic">No events yet</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
