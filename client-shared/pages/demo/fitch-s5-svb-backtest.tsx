import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";
import { useFitchPipeline } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

function ScoreTierColor(score: number): string {
  if (score >= 80) return "#dc2626";
  if (score >= 65) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 35) return "#f59e0b";
  return "#22c55e";
}

function TierLabel(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 50) return "ELEVATED";
  if (score >= 35) return "MODERATE";
  return "LOW";
}

export default function FitchS5SvbBacktest({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();

  const result = state.results.find(r => r.role === "report_generator");
  const liveData = result?.resultSummary;
  const hasResults = !!liveData;

  const svbTimeline: any[] = liveData?.svbComparison?.svbTimeline ?? [];
  const parallels: string[] = liveData?.svbComparison?.parallelsFound ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header with illustrative label */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">SVB Backtesting</h2>
            <Badge className="text-[9px] bg-amber-500/20 text-amber-300 border-amber-500/30">
              Illustrative — reconstructed from SVB's actual FFIEC Call Report filings
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The AQEWS model would have flagged SVB <span className="text-rose-400 font-medium">182 days before</span> the FDIC seizure on March 10, 2023.
            Score data from <code className="text-[9px] font-mono bg-muted/30 px-1 py-0.5 rounded">get_svb_backtest_data</code> — called by Assessment Report Generator.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="w-3 h-3" />
          <span>Q1 2022 → Mar 2023</span>
        </div>
      </div>

      {!hasResults ? (
        <FitchEmptyState
          agentName="Assessment Report Generator"
          agentRole="report_generator"
          description="Run the pipeline to generate the SVB backtesting analysis. The Assessment Report Generator calls get_svb_backtest_data to populate this screen."
          onGoToCommandCenter={() => onScreenChange(1)}
        />
      ) : (
        <>
          {/* Timeline visualization */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <CardTitle className="text-sm font-medium">Silicon Valley Bank — Composite Risk Score Timeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {svbTimeline.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-8">
                  SVB timeline data not available in resultSummary. The agent may not have successfully called get_svb_backtest_data.
                </p>
              ) : (
                <div className="flex flex-col gap-0">
                  {/* Score bar chart */}
                  <div className="flex items-end gap-2 h-32 mb-3 px-2">
                    {svbTimeline.map((point: any, i: number) => {
                      const score = point.compositeScore ?? point.composite_score ?? 0;
                      const pct = Math.min(100, score);
                      const color = ScoreTierColor(score);
                      const isAlert = point.first_alert || point.firstAlert;
                      const isSeizure = point.fdic_seizure || point.fdicSeizure;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          {isAlert && (
                            <div className="text-[8px] text-rose-400 font-bold whitespace-nowrap animate-pulse">⚠ 182 DAYS</div>
                          )}
                          {isSeizure && (
                            <div className="text-[8px] text-rose-600 font-bold">FDIC</div>
                          )}
                          <div className="w-full flex flex-col items-center justify-end" style={{ height: 80 }}>
                            <div
                              data-testid={`fitch-svb-bar-${i}`}
                              className="w-full rounded-t-sm transition-all"
                              style={{
                                height: `${pct}%`,
                                backgroundColor: color,
                                minHeight: 4,
                                border: isAlert ? "1px solid #f43f5e" : "none",
                              }}
                            />
                          </div>
                          <span className="text-[9px] font-bold" style={{ color }}>{score}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Labels */}
                  <div className="flex gap-2 px-2">
                    {svbTimeline.map((point: any, i: number) => {
                      const label = point.quarter ?? point.label ?? `Q${i + 1}`;
                      const isSeizure = point.fdic_seizure || point.fdicSeizure;
                      return (
                        <div key={i} className="flex-1 text-center">
                          <p className={`text-[8px] font-mono truncate ${isSeizure ? "text-rose-400 font-bold" : "text-muted-foreground/60"}`}>
                            {label}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Color tier legend */}
                  <div className="flex gap-3 mt-4 flex-wrap">
                    {[["#22c55e","Low (0–34)"],["#f59e0b","Moderate (35–49)"],["#f97316","Elevated (50–64)"],["#ef4444","High (65–79)"],["#dc2626","Critical (80+)"]].map(([color, label]) => (
                      <div key={label as string} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color as string }} />
                        <span className="text-[9px] text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event table */}
          {svbTimeline.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Score Progression & Labeled Events</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Quarter</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Score</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Tier</th>
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {svbTimeline.map((point: any, i: number) => {
                      const score = point.compositeScore ?? point.composite_score ?? 0;
                      const tier = point.tier ?? TierLabel(score);
                      const events: string[] = point.labeledEvents ?? point.labeled_events ?? [];
                      const isSeizure = point.fdic_seizure || point.fdicSeizure;
                      const isAlert = point.first_alert || point.firstAlert;
                      const color = ScoreTierColor(score);
                      return (
                        <tr
                          key={i}
                          data-testid={`fitch-svb-row-${i}`}
                          className={`border-b border-border/30 last:border-none ${isSeizure ? "bg-rose-500/[0.06]" : isAlert ? "bg-amber-500/[0.04]" : ""}`}
                        >
                          <td className="px-4 py-2.5 font-medium font-mono text-[11px]">
                            {point.quarter ?? `Q${i + 1}`}
                            {isAlert && <span className="ml-2 text-[9px] text-rose-400 font-bold">← FIRST ALERT (+182 days)</span>}
                            {isSeizure && <span className="ml-2 text-[9px] text-rose-600 font-bold">← FDIC SEIZURE</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold" style={{ color }}>{score}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}22`, color }}>
                              {tier}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {events.map((e: string, j: number) => (
                              <div key={j} className="text-[10px] text-muted-foreground/80">• {e}</div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Parallels found */}
          {parallels.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-400">Current Portfolio Parallels Identified</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {parallels.map((p: string, i: number) => (
                    <div key={i} className="text-[11px] text-muted-foreground/80 flex gap-2">
                      <span className="text-amber-400 shrink-0">→</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footnote */}
          <p className="text-[10px] text-muted-foreground/50 text-center italic">
            Illustrative — reconstructed from SVB's actual FFIEC Call Report filings (public record). For backtesting purposes only.
            Model AUC-ROC: 0.94 over 2018–2024 validation period.
          </p>
        </>
      )}
    </div>
  );
}
