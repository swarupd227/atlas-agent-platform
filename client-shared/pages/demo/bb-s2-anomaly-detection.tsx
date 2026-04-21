import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Search, TrendingDown, MapPin, Activity, Loader2, ChevronRight, X } from "lucide-react";

interface AnomalyData {
  success: boolean;
  totalAnalyzed: number;
  outlierTests: { testName: string; description: string; flagged: number; severity: string }[];
  priceOutliers: { vin: string; make: string; model: string; year: number; segment: string; salePrice: number; modelPrice: number; deviation: number; region: string; auctionSource: string; flagReason: string }[];
  geographicInconsistencies: any[];
  volumeAnomalies: any[];
}

interface FraudData {
  success: boolean;
  suspectedFraudPatterns: {
    patternId: string;
    patternType: string;
    confidence: number;
    affectedVINs: number;
    details: {
      vin: string;
      vehicleDescription: string;
      appearances: { auction: string; date: string; salePrice: number; buyerLicenseState: string | null; status: string }[];
      fraudIndicators: string[];
      historicalBaserate: string;
      recommendedAction: string;
    };
  }[];
  historicalAccuracy: { confirmedFraudRate: number; falsePositiveRate: number };
}

function SeverityBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-red-500/10 text-red-400 border-red-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${styles[level] || styles.LOW}`}>{level}</span>;
}

type ScenarioType = "standard" | "fraud-ring" | "self-healing";

const FRAUD_RING_BANNER = {
  patternId: "FRP-2026-0042",
  patternType: "Multi-Auction VIN Washing Ring — Luxury SUV",
  confidence: 0.96,
  affectedVINs: 11,
  details: {
    vin: "MULTIPLE (11 VINs)",
    vehicleDescription: "2022–2024 Lincoln Navigator, Cadillac Escalade, GMC Yukon Denali",
    appearances: [
      { auction: "Manheim Atlanta",  date: "Apr 7",  salePrice: 38500, buyerLicenseState: "GA", status: "sold" },
      { auction: "Adesa Birmingham", date: "Apr 9",  salePrice: 51200, buyerLicenseState: "AL", status: "sold" },
      { auction: "Manheim Orlando",  date: "Apr 14", salePrice: 68900, buyerLicenseState: "FL", status: "sold" },
      { auction: "NAAA Southeast",   date: "Apr 18", salePrice: 71400, buyerLicenseState: null,  status: "listed" },
    ],
    fraudIndicators: [
      "11 VINs appearing across 4 auction houses in 12 days — statistically improbable for normal resale",
      "Title jurisdiction changes in 3 states with no registration history",
      "Price escalation of 85% over 4 appearances without condition upgrade",
      "Same buyer license entity (masked) observed at Manheim Atlanta and Adesa Birmingham",
      "Odometer readings stationary across appearances despite 2-week gap",
    ],
    historicalBaserate: "Base rate for legitimate multi-auction resale of this type: 1.2%. Ring confidence: 96%.",
    recommendedAction: "Quarantine all 11 VINs. Escalate 3 highest-confidence VINs to Black Book Fraud Investigations (SLA: 4 hrs). Flag buyer entity for enhanced monitoring across all auction sources.",
  },
  historicalAccuracy: { confirmedFraudRate: 0.89, falsePositiveRate: 0.07 },
};

export default function BBScreen2AnomalyDetection({ scenario }: { scenario?: ScenarioType }) {
  const isFraudRing = scenario === "fraud-ring";
  const [selectedFraud, setSelectedFraud] = useState<any | null>(null);

  const { data: anomalyData, isLoading: aLoading } = useQuery<AnomalyData>({
    queryKey: ["/api/mock/bb-auction-data/outlier-detection"],
    refetchInterval: 60000,
  });

  const { data: fraudData, isLoading: fLoading } = useQuery<FraudData>({
    queryKey: ["/api/mock/bb-auction-data/fraud-patterns"],
    refetchInterval: 60000,
  });

  if (aLoading || fLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const anomaly = anomalyData!;
  const fraud = fraudData!;
  const totalFlagged = (anomaly.priceOutliers?.length || 0) + (anomaly.geographicInconsistencies?.length || 0) + (anomaly.volumeAnomalies?.length || 0) + (isFraudRing ? 11 : (fraud.suspectedFraudPatterns?.length || 0));

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {isFraudRing && (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-[11px] font-bold text-red-400">Critical: Multi-auction VIN washing ring detected — 11 vehicles across 4 auction houses</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Confidence: 96% · 3 VINs require analyst escalation within 4 hrs · All 11 flagged vehicles quarantined from pricing model</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Activity, label: "Transactions Today", value: "142,183", color: "text-blue-400" },
          { icon: AlertTriangle, label: "Anomalies Flagged", value: isFraudRing ? String(totalFlagged + 29) : String(totalFlagged + 19), color: isFraudRing ? "text-red-400" : "text-amber-400" },
          { icon: ShieldCheck, label: "Detection Rate", value: "97.2%", color: "text-green-400" },
          { icon: TrendingDown, label: "False Positive Rate", value: "7.8%", color: "text-purple-400" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="p-3 rounded-xl border bg-card" data-testid={`bb-anomaly-stat-${label.replace(/\s/g,"-").toLowerCase()}`}>
            <Icon className={`w-4 h-4 mb-1.5 ${color}`} />
            <p className="text-lg font-bold">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Left: anomaly categories */}
        <div className="col-span-3 space-y-3">
          {/* Price outliers */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <h3 className="text-xs font-semibold">Price Outliers <span className="text-muted-foreground font-normal">(15 flagged)</span></h3>
              </div>
              <SeverityBadge level="HIGH" />
            </div>
            <div className="space-y-2">
              {anomaly.priceOutliers?.slice(0, 3).map(o => (
                <div key={o.vin} className="flex items-start justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50" data-testid={`bb-price-outlier-${o.vin}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold">{o.year} {o.make} {o.model} <span className="font-normal text-muted-foreground">· {o.segment}</span></p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{o.vin}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{o.auctionSource} · {o.region} region</p>
                    <p className="text-[10px] text-red-400 mt-0.5">{o.flagReason}</p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-[11px] font-bold">${o.salePrice.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">model: ${o.modelPrice.toLocaleString()}</p>
                    <span className={`text-[10px] font-mono ${o.deviation > 0 ? "text-red-400" : "text-amber-400"}`}>
                      {o.deviation > 0 ? "+" : ""}{o.deviation.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Geographic inconsistencies */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold">Geographic Inconsistencies <span className="text-muted-foreground font-normal">(5 flagged)</span></h3>
              </div>
              <SeverityBadge level="MEDIUM" />
            </div>
            <div className="space-y-2">
              {anomaly.geographicInconsistencies?.map((g, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-muted/30 border border-border/50" data-testid={`bb-geo-${i}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold">{g.year} {g.make} {g.model} · {g.segment}</p>
                    <SeverityBadge level={g.riskLevel} />
                  </div>
                  <p className="text-[10px] text-amber-400 mt-1">
                    Phoenix ${g.pricePhoenix?.toLocaleString() ?? "—"} vs Atlanta ${g.priceAtlanta?.toLocaleString() ?? "—"} — ${g.variance?.toLocaleString()} spread without condition justification
                  </p>
                  {g.note && <p className="text-[10px] text-muted-foreground mt-0.5">{g.note}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Volume anomaly */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-semibold">Volume Anomalies <span className="text-muted-foreground font-normal">(2 detected)</span></h3>
              </div>
              <SeverityBadge level="HIGH" />
            </div>
            {anomaly.volumeAnomalies?.map((v, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-[11px] font-semibold">{v.segment} · {v.auctionSource}</p>
                <p className="text-[10px] text-purple-400 mt-0.5">
                  Volume down {Math.abs(v.changePercent).toFixed(0)}% week-over-week ({v.currentWeekVolume} vs avg {v.priorWeekAvg})
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{v.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: fraud pattern */}
        <div className="col-span-2 space-y-3">
          {isFraudRing ? (
            <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-4" data-testid="bb-fraud-ring-panel">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-semibold text-red-400">Coordinated Fraud Ring</h3>
                </div>
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-semibold">11 VINs · CRITICAL</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold">{FRAUD_RING_BANNER.patternType}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{FRAUD_RING_BANNER.details.vehicleDescription}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{FRAUD_RING_BANNER.patternId}</p>
                  </div>
                  <span className="text-[11px] font-bold text-red-400">{Math.round(FRAUD_RING_BANNER.confidence * 100)}% conf.</span>
                </div>
                <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] text-red-400 font-semibold mb-1">Cross-Auction Escalation Pattern</p>
                  <div className="space-y-1">
                    {FRAUD_RING_BANNER.details.appearances.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-red-500/5 border border-red-500/10">
                        <div>
                          <p className="text-[10px] font-semibold">{a.auction}</p>
                          <p className="text-[9px] text-muted-foreground">{a.date} · {a.status === "sold" ? "Sold" : "Listed"}{a.buyerLicenseState ? ` · ${a.buyerLicenseState}` : ""}</p>
                        </div>
                        <p className="text-[10px] font-mono font-bold">${a.salePrice.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400 font-semibold">⚑ Escalation Required</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">3 highest-confidence VINs require analyst review within 4 hrs per BB fraud SLA.</p>
                </div>
                <button
                  onClick={() => setSelectedFraud(FRAUD_RING_BANNER)}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] text-red-400 border border-red-500/30 rounded-lg py-2 hover:bg-red-500/10 transition-colors"
                  data-testid="bb-fraud-detail-btn"
                >
                  View Full Decision Context <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-semibold text-red-400">Suspected Fraud Pattern</h3>
                </div>
                <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">1 detected</span>
              </div>
              {fraud.suspectedFraudPatterns?.map(fp => (
                <div key={fp.patternId} className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold">{fp.patternType}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{fp.details.vin}</p>
                      <p className="text-[10px] text-muted-foreground">{fp.details.vehicleDescription}</p>
                    </div>
                    <span className="text-[10px] font-bold text-red-400">{Math.round(fp.confidence * 100)}% conf.</span>
                  </div>
                  <div className="space-y-1">
                    {fp.details.appearances.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-red-500/5 border border-red-500/10">
                        <div>
                          <p className="text-[10px] font-semibold">{a.auction}</p>
                          <p className="text-[9px] text-muted-foreground">{a.date} · {a.status === "sold" ? "Sold" : "Listed"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-mono">${a.salePrice.toLocaleString()}</p>
                          {a.buyerLicenseState && <p className="text-[9px] text-muted-foreground">{a.buyerLicenseState}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedFraud(fp)}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] text-red-400 border border-red-500/30 rounded-lg py-2 hover:bg-red-500/10 transition-colors"
                    data-testid="bb-fraud-detail-btn"
                  >
                    View Decision Context <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <div className="p-2 rounded bg-muted/20 border border-border/50">
                    <p className="text-[10px] text-muted-foreground font-semibold mb-1">Historical Accuracy</p>
                    <p className="text-[10px] text-muted-foreground">{fp.details.historicalBaserate}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">False positive rate: {Math.round(fraud.historicalAccuracy.falsePositiveRate * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fraud detail modal */}
      {selectedFraud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedFraud(null)}>
          <div className="bg-card border border-red-500/30 rounded-2xl max-w-lg w-full p-6 shadow-xl" onClick={e => e.stopPropagation()} data-testid="bb-fraud-detail-modal">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-red-400">Decision Context Card</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{selectedFraud.details.vin}</p>
                <p className="text-xs text-muted-foreground">{selectedFraud.details.vehicleDescription}</p>
              </div>
              <button onClick={() => setSelectedFraud(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-red-400">Agent Assessment: {Math.round(selectedFraud.confidence * 100)}% confidence fraud</p>
                <p className="text-[10px] text-muted-foreground">{selectedFraud.patternType}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Auction Appearances</p>
              {selectedFraud.details.appearances.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/50">
                  <div>
                    <p className="text-[11px] font-semibold">{a.auction}</p>
                    <p className="text-[10px] text-muted-foreground">{a.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold">${a.salePrice.toLocaleString()}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${a.status === "sold" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 mb-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Fraud Indicators</p>
              {selectedFraud.details.fraudIndicators.map((fi, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <p className="text-[10px] text-foreground/80">{fi}</p>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Recommended Action</p>
              <p className="text-[10px] text-foreground/80">{selectedFraud.details.recommendedAction}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
