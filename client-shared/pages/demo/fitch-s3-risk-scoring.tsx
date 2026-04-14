import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFitchPipeline, FITCH_BANKS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

function SentimentBar({ value }: { value: number }) {
  const pct = ((value + 2) / 4) * 100;
  const color = value < -0.5 ? "bg-rose-500" : value < 0 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono w-10 text-right">{value > 0 ? "+" : ""}{value.toFixed(2)}</span>
    </div>
  );
}

function ClassificationBadge({ cls }: { cls: string }) {
  const map: Record<string, string> = {
    crisis:   "bg-rose-500/20 text-rose-300 border-rose-500/30",
    material: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    emerging: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    routine:  "bg-muted/50 text-muted-foreground border-border/30",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${map[cls] ?? map.routine}`}>
      {cls}
    </span>
  );
}

export default function FitchS3NlpSignals({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();

  const transcriptResult = state.results.find(r => r.role === "transcript_analyst");
  const newsResult       = state.results.find(r => r.role === "news_processor");
  const hasTranscript    = !!transcriptResult;
  const hasNews          = !!newsResult;
  const hasAny           = hasTranscript || hasNews;

  const sentimentScores: Record<string, any> = transcriptResult?.resultSummary?.sentimentScores ?? {};
  const filingFlags:     Record<string, any> = transcriptResult?.resultSummary?.filingFlags      ?? {};
  const newsSeverity:    Record<string, any> = newsResult?.resultSummary?.newsSeverity           ?? {};
  const emergingRisks:   any[]               = newsResult?.resultSummary?.emergingRisks           ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold">NLP Signal Panel</h2>
        <p className="text-[11px] text-muted-foreground">
          Earnings transcript sentiment · MD&A language changes · News volume sigma-spikes — live from Transcript Analyst and News Signal Processor
        </p>
      </div>

      {!hasAny ? (
        <FitchEmptyState
          agentName="Transcript & Filing Analyst"
          agentRole="transcript_analyst"
          description="Run the pipeline to analyze earnings transcripts, 10-K filing language changes, and news signals."
          onGoToCommandCenter={() => onScreenChange(1)}
        />
      ) : (
        <>
          {/* Transcript sentiment heatmap */}
          {hasTranscript && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">Earnings Call Sentiment Heatmap</CardTitle>
                  <Badge variant="secondary" className="text-[10px] ml-auto">−2 = Highly Negative · +2 = Highly Positive</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Bank</th>
                        <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2 min-w-[140px]">Credit Quality</th>
                        <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2 min-w-[140px]">Fwd Guidance</th>
                        <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2 min-w-[140px]">Sector Concerns</th>
                        <th className="text-right text-[10px] text-muted-foreground font-normal px-4 py-2">Composite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FITCH_BANKS.map(bank => {
                        const s = sentimentScores[bank.name] ?? {};
                        const composite: number = s.composite ?? 0;
                        return (
                          <tr
                            key={bank.id}
                            data-testid={`fitch-sentiment-row-${bank.id}`}
                            className="border-b border-border/30 last:border-none hover:bg-muted/20"
                          >
                            <td className="px-4 py-2 font-medium">{bank.name}</td>
                            <td className="px-3 py-2">
                              <SentimentBar value={s.creditQuality ?? 0} />
                            </td>
                            <td className="px-3 py-2">
                              <SentimentBar value={s.forwardGuidance ?? 0} />
                            </td>
                            <td className="px-3 py-2">
                              <SentimentBar value={s.sectorConcerns ?? 0} />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className={`font-bold font-mono text-sm ${composite < -0.5 ? "text-rose-400" : composite < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                                {composite > 0 ? "+" : ""}{composite.toFixed(2)}
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
          )}

          {/* MD&A language changes */}
          {hasTranscript && Object.keys(filingFlags).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">10-K MD&A Language Changes (YoY)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Bank</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">New Risk Factors</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Strengthened Language</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">MD&A Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FITCH_BANKS.map(bank => {
                      const f = filingFlags[bank.name] ?? {};
                      return (
                        <tr
                          key={bank.id}
                          data-testid={`fitch-filing-row-${bank.id}`}
                          className="border-b border-border/30 last:border-none hover:bg-muted/20"
                        >
                          <td className="px-4 py-2 font-medium">{bank.name}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={f.newRiskFactors > 3 ? "text-rose-400 font-bold" : f.newRiskFactors > 1 ? "text-amber-400" : "text-muted-foreground"}>
                              {f.newRiskFactors ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={f.strengthenedLanguage > 5 ? "text-rose-400 font-bold" : f.strengthenedLanguage > 2 ? "text-amber-400" : "text-muted-foreground"}>
                              {f.strengthenedLanguage ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {f.mdaShift != null ? (
                              <span className={f.mdaShift < -0.05 ? "text-rose-400" : "text-muted-foreground"}>
                                {f.mdaShift > 0 ? "+" : ""}{(f.mdaShift * 100).toFixed(1)}%
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* News severity grid */}
          {hasNews && Object.keys(newsSeverity).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">News Volume & Classification</CardTitle>
                  <Badge variant="secondary" className="text-[10px] ml-auto">σ-spike = current vs 13-week baseline</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Bank</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Classification</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">Articles</th>
                      <th className="text-right text-[10px] text-muted-foreground font-normal px-3 py-2">σ-Spike</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FITCH_BANKS.map(bank => {
                      const n = newsSeverity[bank.name] ?? {};
                      return (
                        <tr
                          key={bank.id}
                          data-testid={`fitch-news-row-${bank.id}`}
                          className="border-b border-border/30 last:border-none hover:bg-muted/20"
                        >
                          <td className="px-4 py-2 font-medium">{bank.name}</td>
                          <td className="px-3 py-2 text-center">
                            <ClassificationBadge cls={n.classification ?? "routine"} />
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{n.articleCount ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span className={n.sigmaSpike > 2 ? "text-rose-400 font-bold" : n.sigmaSpike > 1 ? "text-amber-400" : "text-muted-foreground"}>
                              {n.sigmaSpike != null ? `${n.sigmaSpike > 0 ? "+" : ""}${n.sigmaSpike.toFixed(2)}σ` : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Emerging risks */}
          {emergingRisks.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-400">Emerging Risk Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {emergingRisks.map((risk: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-[11px] p-2 rounded bg-amber-500/[0.05] border border-amber-500/10">
                      <ClassificationBadge cls={risk.classification} />
                      <span className="font-medium">{risk.bankName}</span>
                      <span className="text-muted-foreground">—</span>
                      <span className="text-muted-foreground/80">{risk.topic}</span>
                      {risk.sigmaSpike > 0 && (
                        <span className="ml-auto font-mono text-amber-400">{risk.sigmaSpike.toFixed(2)}σ</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
