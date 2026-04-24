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

type ScenarioType = "standard" | "fraud-ring" | "self-healing";

const FRAUD_RING_ALERT = {
  alertId: "MSA-2026-CRIT-001",
  segment: "Luxury SUV",
  severity: "RED",
  confidence: 0.94,
  estimatedLeadTime: "Detected today — immediate impact",
  headline: "Luxury SUV wholesale prices up +18.4% in 3 days — VIN washing ring artificially inflating segment values",
  fusedSignals: [
    { type: "Auction Volume Signal", detail: "11 Luxury SUVs cycling through 4 auction houses in 12 days — 23σ deviation from segment norm", confidence: 0.96 },
    { type: "Price Velocity Signal", detail: "Wholesale price +18.4% (3-day) vs segment norm +0.9%/week — consistent with artificial inflation", confidence: 0.92 },
    { type: "Geographic Arbitrage", detail: "VIN appearances in GA → AL → FL → NAAA Southeast — multi-state title jurisdiction manipulation", confidence: 0.94 },
    { type: "News Signal", detail: "No supply shock, OEM news, or legitimate fleet event to explain Luxury SUV price spike this week", confidence: 0.88 },
  ],
  projectedImpact: {
    nextTwoWeekPriceChange: 18.4,
    affectedValueRange: "$38,500 – $71,400",
    affectedLenderExposure: "$24.8M (estimated, 6 lender clients with Luxury SUV exposure)",
  },
  recommendedAction: "Quarantine all 11 flagged VINs from Luxury SUV pricing model. Notify lender clients with exposure. Escalate to BB Fraud Investigations.",
};

export default function BBScreen3MarketShift({ scenario, pipelineComplete = false }: { scenario?: ScenarioType; pipelineComplete?: boolean }) {
  const isFraudRing = scenario === "fraud-ring";
  const [expandedAlert, setExpandedAlert] = useState<string | null>(isFraudRing ? "MSA-2026-CRIT-001" : "MSA-2026-0089");

  const { data: shiftData, isLoading: sLoading } = useQuery<ShiftData>({
    queryKey: ["/api/mock/bb-market-data/shift-alerts"],
    refetchInterval: 60000,
    enabled: pipelineComplete,
  });

  const { data: priceData, isLoading: pLoading } = useQuery<PriceTrendData>({
    queryKey: ["/api/mock/bb-market-data/segment-price-trends"],
    refetchInterval: 60000,
    enabled: pipelineComplete,
  });

  if (!pipelineComplete || sLoading || pLoading) {
    const msg = !pipelineComplete
      ? "Waiting for agent pipeline to complete…"
      : "Agent analyzing regional price movements and market signals…";
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {msg}
        </div>
      </div>
    );
  }

  const shifts = shiftData!;
  const prices = priceData!;
  const displayAlerts = isFraudRing ? [FRAUD_RING_ALERT, ...shifts.activeAlerts] : shifts.activeAlerts;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${isFraudRing ? "border-red-500/30 bg-red-500/5" : "bg-card"}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${isFraudRing ? "bg-red-400" : "bg-amber-400"}`} />
          <span className="text-xs font-semibold">{displayAlerts.length} Active Alert{displayAlerts.length !== 1 ? "s" : ""}</span>
          {isFraudRing && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">1 CRITICAL</span>}
        </div>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="text-xs text-muted-foreground">{shifts.cleanSegments - (isFraudRing ? 1 : 0)}/{shifts.monitoringSegments} segments clean</span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="text-xs text-muted-foreground">BB-AGT-002 fusing 4 signal types in real time</span>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Alerts panel */}
        <div className="col-span-3 space-y-3">
          {displayAlerts.map(alert => {
            const isCrit = alert.alertId === "MSA-2026-CRIT-001";
            const borderCls = isCrit ? "border-red-500/40" : "border-amber-500/30";
            const bgCls = isCrit ? "bg-red-500/5" : "bg-amber-500/5";
            const badgeCls = isCrit ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30";
            const divideCls = isCrit ? "border-red-500/20" : "border-amber-500/20";
            return (
            <div key={alert.alertId} className={`rounded-xl border ${borderCls} ${bgCls}`} data-testid={`bb-shift-alert-${alert.alertId}`}>
              <button
                className="w-full flex items-start justify-between p-4 text-left"
                onClick={() => setExpandedAlert(expandedAlert === alert.alertId ? null : alert.alertId)}
                data-testid={`bb-shift-alert-toggle-${alert.alertId}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${badgeCls}`}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {alert.severity}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{(alert.confidence * 100) | 0}% confidence · {alert.estimatedLeadTime}</span>
                  </div>
                  <p className="text-xs font-semibold leading-snug">{alert.segment}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{alert.headline}</p>
                </div>
                <div className="ml-3 shrink-0 mt-1">
                  {expandedAlert === alert.alertId ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {expandedAlert === alert.alertId && (
                <div className={`px-4 pb-4 space-y-3 border-t ${divideCls} pt-3`}>
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
          );
          })}

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <h3 className="text-xs font-semibold text-green-400">{shifts.cleanSegments - (isFraudRing ? 1 : 0)} Segments Within Normal Range</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Mid-Size Car", "Compact Car", "Compact SUV/CUV", "Mid-Size SUV", "Full-Size SUV", "Full-Size Car", "Mid-Size Pickup", "Hybrid", "Luxury Car", ...(isFraudRing ? [] : ["Luxury SUV"])].map(s => (
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
