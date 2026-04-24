import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ShieldCheck, TrendingDown, ArrowRight,
  ChevronRight, BarChart2, FileWarning, Search, CheckCircle2,
  Loader2, AlertCircle, MapPin,
} from "lucide-react";

const BB_COLOR = "#E8640A";

interface ScanData {
  success: boolean;
  scanDate: string;
  totalVinsScanned: number;
  rollbacksDetected: number;
  serviceConflicts: number;
  detectionRatePct: number;
  flaggedVins: {
    vin: string; make: string; model: string; year: number;
    severity: string; rollbackMiles: number; lastAuction: string; lastDate: string;
  }[];
  serviceConflictVins: {
    vin: string; make: string; model: string; year: number;
    status: string; discrepancy: number;
  }[];
}

interface FinancialData {
  success: boolean;
  confirmedRollbacks: number;
  totalValuationOverstatement: number;
  serviceConflictExposure: number;
  totalFinancialRisk: number;
  perMileAdjustmentRate: number;
  impacts: {
    vin: string; vehicle: string; rollbackMiles: number;
    valuationOverstatement: number; priceInflation: number;
    severity: string; salePrice: number; trueMarketValue: number;
  }[];
  industryContext: { annualOdometerFraudCost: string; fraudRatePct: number; bbDailyRisk: number };
}

interface ReportData {
  success: boolean;
  reportId: string;
  executive: {
    totalVinsScanned: number; rollbacksDetected: number;
    serviceConflictsEscalated: number; totalFinancialRisk: number;
    detectionRatePct: number; processingTimeSec: number;
  };
  findings: {
    rank: number; vin: string; vehicle: string; severity: string;
    rollbackMiles: number; valuationOverstatement: number;
    lastAuction: string; recommendedAction: string;
  }[];
  escalations: {
    vin: string; vehicle: string; type: string;
    reason: string; recommendedAction: string; exposureRisk: number;
  }[];
}

interface VinHistoryData {
  success: boolean;
  vin: string;
  vehicle: string;
  rollbackDetected: boolean;
  rollbackMiles: number;
  severity: string;
  history: { date: string; auction: string; miles: number; price: number; region: string }[];
  rollbackWindow: { from: any; to: any; milesReversed: number; daysElapsed: number };
}

function SeverityBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    CRITICAL: "bg-red-500/15 text-red-400 border-red-500/25",
    HIGH:     "bg-orange-500/15 text-orange-400 border-orange-500/25",
    MEDIUM:   "bg-amber-500/15 text-amber-400 border-amber-500/25",
    LOW:      "bg-blue-500/15 text-blue-400 border-blue-500/25",
  };
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${styles[level] || styles.LOW}`}>
      {level}
    </span>
  );
}

function StatCard({ label, value, sub, color = BB_COLOR }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-3">
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className="text-xl font-bold leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/50 mt-1">{sub}</p>}
    </div>
  );
}

function MileageTimeline({ history, rollbackWindow }: {
  history: { date: string; auction: string; miles: number; price: number; region: string }[];
  rollbackWindow?: { from: any; to: any; milesReversed: number; daysElapsed: number };
}) {
  return (
    <div className="space-y-1">
      {history.map((entry, i) => {
        const next = history[i + 1];
        const isRollback = rollbackWindow &&
          entry.date === rollbackWindow.from.date &&
          next?.date === rollbackWindow.to.date;
        const isRollbackEnd = rollbackWindow && entry.date === rollbackWindow.to.date;
        return (
          <div key={i}>
            <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-[11px] ${
              isRollbackEnd
                ? "border-red-500/30 bg-red-500/5"
                : "border-border/30 bg-muted/10"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isRollbackEnd ? "bg-red-400" : "bg-green-400/60"
              }`} />
              <span className="text-muted-foreground/50 font-mono w-20 shrink-0">{entry.date}</span>
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <MapPin className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                <span className="text-muted-foreground/70 truncate">{entry.auction}</span>
              </div>
              <span className={`font-semibold tabular-nums shrink-0 ${
                isRollbackEnd ? "text-red-400" : "text-foreground"
              }`}>
                {entry.miles.toLocaleString()} mi
              </span>
              <span className="text-muted-foreground/40 text-[10px] shrink-0">
                ${entry.price.toLocaleString()}
              </span>
            </div>
            {isRollback && (
              <div className="flex items-center gap-2 px-4 py-1">
                <div className="w-px h-4 bg-red-400/40 ml-0.5" />
                <span className="text-[9px] font-semibold text-red-400 uppercase tracking-wide">
                  ↓ {rollbackWindow!.milesReversed.toLocaleString()} mile rollback over {rollbackWindow!.daysElapsed} days — physically impossible
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type TabId = "rollbacks" | "aggressive" | "service-conflict";

export default function BBScreen6OdometerFraud({ pipelineComplete = false }: { pipelineComplete?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabId>("rollbacks");
  const [expandedVin, setExpandedVin] = useState<string | null>("1GCUYDED3NZ182741");

  const { data: scanData, isLoading: scanLoading } = useQuery<ScanData>({
    queryKey: ["/api/mock/bb-odometer-verify/scan-batch"],
    enabled: pipelineComplete,
    refetchInterval: false,
  });

  const { data: financialData, isLoading: finLoading } = useQuery<FinancialData>({
    queryKey: ["/api/mock/bb-odometer-verify/financial-impact"],
    enabled: pipelineComplete,
    refetchInterval: false,
  });

  const { data: reportData, isLoading: repLoading } = useQuery<ReportData>({
    queryKey: ["/api/mock/bb-odometer-verify/fraud-report"],
    enabled: pipelineComplete,
    refetchInterval: false,
  });

  const { data: aggressiveVinData } = useQuery<VinHistoryData>({
    queryKey: ["/api/mock/bb-odometer-verify/vin-history", "3TMCZ5AN1NM489012"],
    queryFn: () => fetch("/api/mock/bb-odometer-verify/vin-history?vin=3TMCZ5AN1NM489012").then(r => r.json()),
    enabled: pipelineComplete,
    refetchInterval: false,
  });

  const { data: expandedVinData } = useQuery<VinHistoryData>({
    queryKey: ["/api/mock/bb-odometer-verify/vin-history", expandedVin],
    queryFn: () => fetch(`/api/mock/bb-odometer-verify/vin-history?vin=${expandedVin}`).then(r => r.json()),
    enabled: pipelineComplete && !!expandedVin && activeTab === "rollbacks",
    refetchInterval: false,
  });

  const isLoading = pipelineComplete && (scanLoading || finLoading || repLoading);

  if (!pipelineComplete || isLoading) {
    const loadingMsg = !pipelineComplete
      ? "Waiting for agent pipeline to complete…"
      : "Agent analyzing 142,183 VINs — cross-referencing odometer history…";
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: BB_COLOR }} />
          {loadingMsg}
        </div>
      </div>
    );
  }

  const exec = reportData?.executive;

  const TABS: { id: TabId; label: string; badge?: string }[] = [
    { id: "rollbacks",       label: "Detected Rollbacks",      badge: String(exec?.rollbacksDetected || 3) },
    { id: "aggressive",      label: "Aggressive Rollback",      badge: "CRITICAL" },
    { id: "service-conflict", label: "Service Record Conflict",  badge: "Escalation" },
  ];

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="VINs Scanned"
          value={exec?.totalVinsScanned.toLocaleString() ?? "142,183"}
          sub="Today's full batch"
        />
        <StatCard
          label="Rollbacks Detected"
          value={String(exec?.rollbacksDetected ?? 3)}
          sub="Confirmed odometer fraud"
          color="#ef4444"
        />
        <StatCard
          label="Valuation Protected"
          value={`$${((exec?.totalFinancialRisk ?? 37600) / 1000).toFixed(1)}K`}
          sub="Overstatement quarantined"
          color="#22c55e"
        />
        <StatCard
          label="Detection Rate"
          value={`${exec?.detectionRatePct ?? 99.87}%`}
          sub="Agent accuracy"
        />
      </div>

      {/* Agent context banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border/40 bg-muted/10">
        <Search className="w-4 h-4 mt-0.5 shrink-0" style={{ color: BB_COLOR }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold">Odometer Fraud Detection Agent</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">Active</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-muted/20 text-muted-foreground/60 border-border/30 font-mono">BB Odometer Verification Service</span>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Cross-references declared mileage across all auction appearances · CARFAX validation · $3.00/mile valuation correction · {exec?.processingTimeSec ?? 214}s scan
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-mono text-muted-foreground/40">{reportData?.reportId ?? "BB-OFR-…"}</p>
        </div>
      </div>

      {/* Sub-scenario tabs */}
      <div>
        <div className="flex gap-1 border-b border-border/50 mb-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`bb-s6-tab-${tab.id}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={activeTab === tab.id ? { borderBottomColor: BB_COLOR, backgroundColor: `${BB_COLOR}08` } : {}}
            >
              {tab.label}
              {tab.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  tab.badge === "CRITICAL"
                    ? "bg-red-500/15 text-red-400"
                    : tab.badge === "Escalation"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-muted/30 text-muted-foreground/70"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Detected Rollbacks */}
        {activeTab === "rollbacks" && (
          <div className="space-y-3">
            {(scanData?.flaggedVins ?? []).map(v => {
              const isExpanded = expandedVin === v.vin;
              const impact = financialData?.impacts.find(i => i.vin === v.vin);
              return (
                <div key={v.vin} className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-muted/10 transition-colors"
                    onClick={() => setExpandedVin(isExpanded ? null : v.vin)}
                    data-testid={`bb-s6-vin-row-${v.vin}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold">{v.year} {v.make} {v.model}</span>
                            <SeverityBadge level={v.severity} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground/50">{v.vin}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <div>
                          <p className="text-[11px] font-semibold text-red-400">−{v.rollbackMiles.toLocaleString()} mi</p>
                          <p className="text-[9px] text-muted-foreground/50">rollback</p>
                        </div>
                        {impact && (
                          <div>
                            <p className="text-[11px] font-semibold text-amber-400">${impact.valuationOverstatement.toLocaleString()}</p>
                            <p className="text-[9px] text-muted-foreground/50">overstatement</p>
                          </div>
                        )}
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                  </button>

                  {isExpanded && expandedVinData && expandedVinData.vin === v.vin && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3">
                      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Auction Mileage Timeline</p>
                      <MileageTimeline
                        history={expandedVinData.history}
                        rollbackWindow={expandedVinData.rollbackWindow}
                      />
                      {impact && (
                        <div className="flex gap-3 text-[11px] mt-2">
                          <div className="flex-1 rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
                            <p className="text-muted-foreground/50 text-[9px] mb-0.5">Sale Price (Inflated)</p>
                            <p className="font-semibold">${impact.salePrice.toLocaleString()}</p>
                          </div>
                          <div className="flex-1 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2">
                            <p className="text-muted-foreground/50 text-[9px] mb-0.5">True Market Value</p>
                            <p className="font-semibold text-green-400">${impact.trueMarketValue.toLocaleString()}</p>
                          </div>
                          <div className="flex-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                            <p className="text-muted-foreground/50 text-[9px] mb-0.5">Price Inflation</p>
                            <p className="font-semibold text-red-400">+{impact.priceInflation}%</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{reportData?.findings.find(f => f.vin === v.vin)?.recommendedAction ?? "Quarantine and investigate"}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Financial summary */}
            {financialData && (
              <div className="rounded-xl border border-border/40 bg-muted/5 px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="w-3.5 h-3.5" style={{ color: BB_COLOR }} />
                  <span className="text-[11px] font-semibold">Total Financial Impact</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-red-400">${financialData.totalValuationOverstatement.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Confirmed overstatement</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-400">${financialData.serviceConflictExposure.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Conflict exposure</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-400">${financialData.totalFinancialRisk.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Total risk protected</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  <TrendingDown className="w-3 h-3 shrink-0" />
                  Industry baseline: ${financialData.industryContext.annualOdometerFraudCost} annual consumer cost · BB daily risk prevention: ${financialData.industryContext.bbDailyRisk.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Aggressive Rollback */}
        {activeTab === "aggressive" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-semibold text-red-400">Exception Sub-Scenario: Aggressive Rollback</span>
                  <SeverityBadge level="CRITICAL" />
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  VIN 3TMCZ5AN1NM489012 — 2022 Toyota Tacoma — appeared at Manheim LA on Jan 22 with 33,890 miles,
                  then reappeared 23 days later with <strong className="text-red-400">29,100 miles</strong> — a 4,790-mile rollback in under 4 weeks.
                  Physically impossible under any normal usage pattern.
                </p>
              </div>
            </div>

            {aggressiveVinData && (
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Mileage Timeline — CRITICAL</p>
                <MileageTimeline
                  history={aggressiveVinData.history}
                  rollbackWindow={aggressiveVinData.rollbackWindow}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/50 mb-1">Miles Reversed</p>
                <p className="text-2xl font-bold text-red-400">4,790 mi</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">In 23 days — 208 mi/day reversal rate</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/50 mb-1">Valuation Overstatement</p>
                <p className="text-2xl font-bold text-amber-400">$14,370</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">At $3.00/mi correction rate</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/5 px-4 py-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">Agent Actions Triggered</p>
              {[
                { icon: ShieldCheck, color: "text-red-400", text: "Immediate quarantine — removed from pricing model" },
                { icon: AlertTriangle, color: "text-amber-400", text: "Dealer network alert sent to Manheim LA" },
                { icon: FileWarning, color: "text-amber-400", text: "Title history pull requested — 4-hour SLA" },
                { icon: AlertCircle, color: "text-red-400", text: "Dealer license review flagged — NAAA notification" },
                { icon: CheckCircle2, color: "text-green-400", text: "Case logged: BB-OFR-CRIT-2026-0014 for fraud investigations team" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <item.icon className={`w-3 h-3 shrink-0 mt-0.5 ${item.color}`} />
                  <span className="text-muted-foreground/70">{item.text}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 text-[10px] text-muted-foreground/60 bg-muted/10 border border-border/30 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>
                CARFAX confirmed 34,500 miles at a Toyota dealer service on 2026-01-30 — 23 days before the 29,100-mile auction listing.
                Confidence score: <strong className="text-foreground">0.99</strong> (highest confidence category). Dealer face value ban recommended.
              </span>
            </div>
          </div>
        )}

        {/* Tab: Service Record Conflict */}
        {activeTab === "service-conflict" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <FileWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-semibold text-amber-400">Exception Sub-Scenario: Service Record Conflict</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/25 font-semibold">Escalation Required</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  VIN 5UXCR6C09N9J12843 — 2022 BMW X5 — CARFAX shows 71,400 miles from a BMW dealer service on April 2.
                  The same vehicle appears at auction on April 10 showing <strong className="text-amber-400">65,200 miles</strong> — 6,200 fewer miles
                  8 days later. Agent cannot auto-resolve: possible rollback OR CARFAX data entry error.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 bg-muted/5 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-2 font-semibold">CARFAX Service Record</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Date</span>
                    <span>April 2, 2026</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Recorded miles</span>
                    <span className="font-semibold">71,400 mi</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Service location</span>
                    <span>BMW of Chicago (dealer)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Source</span>
                    <span className="text-amber-400">CARFAX</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/5 px-4 py-3">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-2 font-semibold">Auction Record</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Date</span>
                    <span>April 10, 2026</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Declared miles</span>
                    <span className="font-semibold text-amber-400">65,200 mi</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Location</span>
                    <span>Manheim Chicago</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/60">Discrepancy</span>
                    <span className="text-red-400 font-semibold">6,200 mi</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/5 px-4 py-3 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">Why This Cannot Auto-Resolve</p>
              <div className="space-y-2">
                {[
                  "CARFAX records dealer-entered mileage — susceptible to typos (71,400 → 7,1400 transposition)",
                  "Auction records buyer-entered mileage — susceptible to intentional rollback or transcription error",
                  "Without title history, the direction of fraud (or error) cannot be determined algorithmically",
                  "Confidence score: 0.00 — both data sources could be wrong",
                ].map((reason, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className="w-3 h-3 rounded-full bg-amber-400/20 text-amber-400 text-[8px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                    <span className="text-muted-foreground/70">{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Escalation Actions Generated</p>
              {[
                { icon: FileWarning, text: "Manual review ticket created — BB Fraud Investigations (SLA: 8 hrs)" },
                { icon: ArrowRight, text: "Title history pull requested from DMV records (3 states: IL, WI, IN)" },
                { icon: ShieldCheck, text: "Vehicle held from pricing model — confidence weight set to 0 pending resolution" },
                { icon: AlertCircle, text: "Financial exposure: $18,600 (6,200 mi × $3.00/mi) — held in risk reserve" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <item.icon className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
                  <span className="text-muted-foreground/70">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
