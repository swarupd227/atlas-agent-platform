import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFitchPipeline, FITCH_BANKS, FITCH_RISK_TIER_COLORS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

export default function FitchS4PeerBenchmarking({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();
  const [selectedBank, setSelectedBank] = useState(FITCH_BANKS[0].name);

  const result = state.results.find(r => r.role === "risk_scorer");
  const liveData = result?.resultSummary;
  const hasResults = !!liveData;

  const scores: Record<string, any> = liveData?.scores ?? {};
  const bankData = scores[selectedBank] ?? {};
  const peerDivergence: number = bankData.peerDivergence ?? 0;
  const tier: keyof typeof FITCH_RISK_TIER_COLORS = bankData.tier ?? "Green";
  const colors = FITCH_RISK_TIER_COLORS[tier] ?? FITCH_RISK_TIER_COLORS.Green;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">G-SIB Peer Benchmarking</h2>
          <p className="text-[11px] text-muted-foreground">
            Bank vs G-SIB cohort — composite scores and peer divergence — live from Composite Risk Scorer
          </p>
        </div>
        {hasResults && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Bank:</span>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger data-testid="fitch-s4-bank-select" className="h-7 text-[11px] w-[180px]">
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
          agentName="Composite Risk Scorer"
          agentRole="risk_scorer"
          description="Run the pipeline to generate peer benchmarking data for all 10 banks vs the G-SIB cohort median."
          onGoToCommandCenter={() => onScreenChange(1)}
        />
      ) : (
        <>
          {/* Selected bank summary */}
          <div className="grid grid-cols-4 gap-3">
            <Card className={`border ${colors.border}`}>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Composite Score</p>
                <p className={`text-2xl font-bold ${colors.text}`}>{bankData.score ?? "—"}</p>
                <Badge className={`text-[9px] mt-1 ${colors.badge}`}>{tier}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Trajectory</p>
                <p className="text-lg font-bold">{bankData.trajectory ?? "—"}</p>
                {bankData.delta != null && (
                  <p className={`text-[10px] ${bankData.delta > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {bankData.delta > 0 ? "+" : ""}{bankData.delta.toFixed(1)} pts QoQ
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Breach Count</p>
                <p className={`text-2xl font-bold ${(bankData.breachCount ?? 0) > 5 ? "text-rose-400" : (bankData.breachCount ?? 0) > 2 ? "text-amber-400" : "text-foreground"}`}>
                  {bankData.breachCount ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Peer Divergence</p>
                <p className={`text-2xl font-bold ${peerDivergence > 15 ? "text-rose-400" : peerDivergence > 8 ? "text-amber-400" : "text-emerald-400"}`}>
                  {peerDivergence > 0 ? "+" : ""}{peerDivergence.toFixed(1)}
                </p>
                <p className="text-[9px] text-muted-foreground/60">vs G-SIB median</p>
              </CardContent>
            </Card>
          </div>

          {/* All-bank ranking */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">G-SIB Cohort — Composite Score Ranking</CardTitle>
                <Badge variant="secondary" className="text-[10px] ml-auto">Click row to select bank</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">#</th>
                    <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Bank</th>
                    <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Score</th>
                    <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Tier</th>
                    <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Trajectory</th>
                    <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Peer Divergence</th>
                    <th className="text-right text-[10px] text-muted-foreground font-normal px-4 py-2">Breaches</th>
                  </tr>
                </thead>
                <tbody>
                  {FITCH_BANKS
                    .map(bank => ({ bank, s: scores[bank.name] ?? {} }))
                    .sort((a, b) => (b.s.score ?? 0) - (a.s.score ?? 0))
                    .map(({ bank, s }, i) => {
                      const t: keyof typeof FITCH_RISK_TIER_COLORS = s.tier ?? "Green";
                      const tc = FITCH_RISK_TIER_COLORS[t] ?? FITCH_RISK_TIER_COLORS.Green;
                      const isSelected = bank.name === selectedBank;
                      return (
                        <tr
                          key={bank.id}
                          data-testid={`fitch-peer-row-${bank.id}`}
                          onClick={() => setSelectedBank(bank.name)}
                          className={`border-b border-border/30 last:border-none cursor-pointer hover:bg-muted/20 ${isSelected ? "bg-muted/30" : ""}`}
                        >
                          <td className="px-4 py-2 text-muted-foreground/50">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{bank.name}</td>
                          <td className={`px-3 py-2 text-right font-bold ${tc.text}`}>{s.score ?? "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${tc.badge}`}>{t}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground/70">{s.trajectory ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span className={(s.peerDivergence ?? 0) > 15 ? "text-rose-400" : (s.peerDivergence ?? 0) > 8 ? "text-amber-400" : "text-emerald-400"}>
                              {(s.peerDivergence ?? 0) > 0 ? "+" : ""}{(s.peerDivergence ?? 0).toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={(s.breachCount ?? 0) > 5 ? "text-rose-400 font-bold" : (s.breachCount ?? 0) > 2 ? "text-amber-400" : "text-muted-foreground"}>
                              {s.breachCount ?? 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
