import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingDown, Zap, Newspaper, Fuel, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ShiftData {
  success: boolean;
  activeAlerts: {
    alertId: string;
    segment: string;
    severity: string;
    confidence: number;
    estimatedLeadTime: string;
    headline: string;
    fusedSignals: { type: string; detail: string; confidence: number }[];
    projectedImpact: { nextTwoWeekPriceChange: number; affectedValueRange: string; affectedLenderExposure: string };
    recommendedAction: string;
  }[];
  monitoringSegments: number;
  cleanSegments: number;
}

interface PriceTrendData {
  success: boolean;
  segments: {
    segment: string;
    currentWeekAvgPrice: number;
    twoWeekAvgPrice?: number;
    threeWeekRollingChangeRate: number;
    historicalNormRate: number;
    deviationSigma: number;
    alert: string | null;
    alertMessage?: string;
    weeklyPrices?: { week: string; avgPrice: number }[];
    note?: string;
  }[];
}

function SignalIcon({ type }: { type: string }) {
  if (type.includes("Volume")) return <TrendingDown className="w-3.5 h-3.5" />;
  if (type.includes("OEM") || type.includes("Incentive")) return <Zap className="w-3.5 h-3.5" />;
  if (type.includes("Fuel")) return <Fuel className="w-3.5 h-3.5" />;
  return <Newspaper className="w-3.5 h-3.5" />;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "bg-green-400" : pct >= 75 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-muted/40">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

export default function BBScreen3MarketShift() {
  const [expandedAlert, setExpandedAlert] = useState<string | null>("MSA-2026-0089");

  const { data: shiftData, isLoading: sLoading } = useQuery<ShiftData>({
    queryKey: ["/api/mock/bb-market-data/shift-alerts"],
    refetchInterval: 60000,
  });

  const { data: priceData, isLoading: pLoading } = useQuery<PriceTrendData>({
    queryKey: ["/api/mock/bb-market-data/segment-price-trends"],
    refetchInterval: 60000,
  });

  if (sLoading || pLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const shifts = shiftData!;
  const prices = priceData!;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold">{shifts.activeAlerts.length} Active Alert{shifts.activeAlerts.length !== 1 ? "s" : ""}</span>
        </div>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="text-xs text-muted-foreground">{shifts.cleanSegments}/{shifts.monitoringSegments} segments clean</span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="text-xs text-muted-foreground">BB-AGT-002 fusing 4 signal types in real time</span>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Alerts panel */}
        <div className="col-span-3 space-y-3">
          {shifts.activeAlerts.map(alert => (
            <div key={alert.alertId} className="rounded-xl border border-amber-500/30 bg-amber-500/5" data-testid={`bb-shift-alert-${alert.alertId}`}>
              <button
                className="w-full flex items-start justify-between p-4 text-left"
                onClick={() => setExpandedAlert(expandedAlert === alert.alertId ? null : alert.alertId)}
                data-testid={`bb-shift-alert-toggle-${alert.alertId}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {alert.severity}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{alert.confidence * 100 | 0}% confidence · {alert.estimatedLeadTime}</span>
                  </div>
                  <p className="text-xs font-semibold leading-snug">{alert.segment}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{alert.headline}</p>
                </div>
                <div className="ml-3 shrink-0 mt-1">
                  {expandedAlert === alert.alertId ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {expandedAlert === alert.alertId && (
                <div className="px-4 pb-4 space-y-3 border-t border-amber-500/20 pt-3">
                  {/* Signal fusion */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fused Signals ({alert.fusedSignals.length})</p>
                    <div className="space-y-2">
                      {alert.fusedSignals.map((sig, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-muted/20 border border-border/50">
                          <div className="flex items-center gap-2 mb-1">
                            <SignalIcon type={sig.type} />
                            <p className="text-[11px] font-semibold">{sig.type}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{sig.detail}</p>
                          <div className="mt-1.5">
                            <ConfidenceBar value={sig.confidence} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Projected impact */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Projected Impact</p>
                    <div className="space-y-1">
                      <p className="text-[10px]"><span className="text-muted-foreground">2-week price change: </span><span className="text-red-400 font-semibold">{alert.projectedImpact.nextTwoWeekPriceChange}%</span></p>
                      <p className="text-[10px]"><span className="text-muted-foreground">Per-vehicle impact: </span>{alert.projectedImpact.affectedValueRange}</p>
                      <p className="text-[10px] text-amber-400">{alert.projectedImpact.affectedLenderExposure}</p>
                    </div>
                  </div>

                  {/* Recommended action */}
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-[10px] font-semibold text-blue-400 mb-1">Recommended Action</p>
                    <p className="text-[10px] text-foreground/80">{alert.recommendedAction}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <h3 className="text-xs font-semibold text-green-400">{shifts.cleanSegments} Segments Within Normal Range</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Mid-Size Car", "Compact Car", "Compact SUV/CUV", "Mid-Size SUV", "Full-Size SUV", "Luxury SUV", "Full-Size Car", "Mid-Size Pickup", "Hybrid", "Luxury Car"].map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Segment sparkline panel */}
        <div className="col-span-2 space-y-2">
          <p className="text-xs font-semibold">Segment Price Velocity</p>
          {prices.segments?.map(seg => {
            const deviation = Math.abs(seg.threeWeekRollingChangeRate - seg.historicalNormRate);
            const isAlert = !!seg.alert && seg.alert !== "GREEN";
            return (
              <div key={seg.segment} className={`p-3 rounded-lg border ${isAlert ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-muted/10"}`} data-testid={`bb-segment-velocity-${seg.segment.replace(/\s/g,"-").toLowerCase()}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-medium leading-tight">{seg.segment}</p>
                  {seg.alert && <span className={`text-[9px] px-1.5 py-0.5 rounded ${seg.alert === "AMBER" ? "bg-amber-500/10 text-amber-400" : seg.alert === "GREEN" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>{seg.alert}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Weekly change</p>
                    <p className={`text-xs font-bold tabular-nums ${seg.threeWeekRollingChangeRate < 0 ? "text-red-400" : "text-green-400"}`}>
                      {seg.threeWeekRollingChangeRate > 0 ? "+" : ""}{(seg.threeWeekRollingChangeRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">vs norm</p>
                    <p className="text-[10px] text-muted-foreground">{(seg.historicalNormRate * 100).toFixed(1)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">σ deviation</p>
                    <p className={`text-[10px] font-semibold ${seg.deviationSigma > 2.5 ? "text-red-400" : seg.deviationSigma > 1.5 ? "text-amber-400" : "text-muted-foreground"}`}>{seg.deviationSigma.toFixed(1)}σ</p>
                  </div>
                </div>
                {seg.weeklyPrices && (
                  <div className="flex items-end gap-0.5 h-8 mt-2">
                    {seg.weeklyPrices.map((wp, i) => {
                      const all = seg.weeklyPrices!.map(w => w.avgPrice);
                      const pct = ((wp.avgPrice - Math.min(...all)) / (Math.max(...all) - Math.min(...all) + 1)) * 100;
                      return <div key={i} className="flex-1 rounded-sm bg-amber-400/40" style={{ height: `${Math.max(pct, 10)}%` }} />;
                    })}
                  </div>
                )}
                {seg.note && <p className="text-[9px] text-muted-foreground mt-1">{seg.note}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
