import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useFitchPipeline, FITCH_BANKS, FITCH_RATIO_DEFS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

function BreachIcon({ breached, severity }: { breached: boolean; severity?: string }) {
  if (!breached) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (severity === "CRITICAL") return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const map: Record<string, string> = {
    CRITICAL: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    HIGH:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
    MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${map[severity] ?? map.MEDIUM}`}>
      {severity}
    </span>
  );
}

export default function FitchS2RatioDeepDive({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();
  const [selectedBank, setSelectedBank] = useState(FITCH_BANKS[0].name);

  const result = state.results.find(r => r.role === "ratio_engine");
  const liveData = result?.resultSummary;
  const hasResults = !!liveData;

  const ratioTable: Record<string, Record<string, any>> = liveData?.ratioTable ?? {};
  const breachLeaderboard: any[] = liveData?.breachLeaderboard ?? [];
  const bankRatios: Record<string, any> = ratioTable[selectedBank] ?? {};

  const sortedRatios = [...FITCH_RATIO_DEFS].sort((a, b) => {
    const aBreached = bankRatios[a.id]?.breached ? 1 : 0;
    const bBreached = bankRatios[b.id]?.breached ? 1 : 0;
    return bBreached - aBreached;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">18-Ratio Deep-Dive</h2>
          <p className="text-[11px] text-muted-foreground">CAMELS-derived ratios with G-SIB peer benchmarks — live from Financial Ratio Engine</p>
        </div>
        {hasResults && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Bank:</span>
            <Select value={selectedBank} onValueChange={(v) => setSelectedBank(v as any)}>
              <SelectTrigger data-testid="fitch-s2-bank-select" className="h-7 text-[11px] w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FITCH_BANKS.map(b => (
                  <SelectItem key={b.id} value={b.name} className="text-[11px]">{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!hasResults ? (
        <FitchEmptyState
          agentName="Financial Ratio Engine"
          agentRole="ratio_engine"
          description="Run the pipeline to compute 18 CAMELS ratios with breach flags for all 10 banks."
          onGoToCommandCenter={() => onScreenChange(1)}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Banks Analyzed</p>
                <p className="text-2xl font-bold">{liveData.banksAnalyzed ?? FITCH_BANKS.length}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Breaches</p>
                <p className="text-2xl font-bold text-amber-400">{liveData.totalBreaches ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Breach Leaderboard</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {breachLeaderboard[0] ? `${breachLeaderboard[0].bankName}: ${breachLeaderboard[0].breachCount} breaches` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ratio table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">
                  {selectedBank} — 18 Ratios
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] ml-auto">Sorted by breach severity</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Ratio</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Value</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Threshold</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Status</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">QoQ Δ</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Peer Median</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Schedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRatios.map((ratio) => {
                      const r = bankRatios[ratio.id] ?? {};
                      const val = r.value;
                      const threshold = r.threshold ?? ratio.threshold;
                      const breached: boolean = r.breached ?? false;
                      const qoqDelta: number = r.qoqDelta ?? 0;
                      const peerMedian = r.peerMedian;

                      return (
                        <tr
                          key={ratio.id}
                          data-testid={`fitch-ratio-row-${ratio.id}`}
                          className={`border-b border-border/30 last:border-none hover:bg-muted/20 ${breached ? "bg-rose-500/[0.02]" : ""}`}
                        >
                          <td className="px-4 py-2">
                            <div>
                              <span className="font-medium">{ratio.name}</span>
                              <span className="text-[9px] text-muted-foreground/50 ml-1.5 font-mono">{ratio.id}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {val != null ? (
                              <span className={breached ? "text-rose-400 font-bold" : "text-foreground"}>
                                {val.toFixed(2)}{ratio.unit}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground/70">
                            {threshold.toFixed(2)}{ratio.unit}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <BreachIcon breached={breached} severity={r.severity} />
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {val != null ? (
                              <span className={qoqDelta > 0 ? "text-rose-400" : qoqDelta < 0 ? "text-emerald-400" : "text-muted-foreground"}>
                                {qoqDelta > 0 ? "+" : ""}{qoqDelta.toFixed(2)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground/70">
                            {peerMedian != null ? `${peerMedian.toFixed(2)}${ratio.unit}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-[9px] font-mono bg-muted/30 px-1 py-0.5 rounded text-muted-foreground/70">
                              {ratio.schedule}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Breach leaderboard */}
          {breachLeaderboard.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Breach Leaderboard — All Banks</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">#</th>
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Bank</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Breaches</th>
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Worst Ratio</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breachLeaderboard.map((entry: any, i: number) => (
                      <tr
                        key={entry.bankName}
                        data-testid={`fitch-breach-row-${i}`}
                        className="border-b border-border/30 last:border-none hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 text-muted-foreground/50">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{entry.bankName}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={entry.breachCount > 5 ? "text-rose-400 font-bold" : entry.breachCount > 2 ? "text-amber-400" : "text-foreground"}>
                            {entry.breachCount}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground/70">{entry.worstRatio ?? "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <SeverityBadge severity={entry.severity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
