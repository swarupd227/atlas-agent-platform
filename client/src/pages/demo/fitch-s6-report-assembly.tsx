import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle } from "lucide-react";
import { useFitchPipeline, FITCH_RATIO_DEFS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

function RecommendationBadge({ rec }: { rec: string }) {
  const map: Record<string, string> = {
    "Immediate Review": "bg-rose-500/20 text-rose-300 border-rose-500/30",
    "Watch":            "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "Active Monitor":   "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  return (
    <span className={`text-sm px-3 py-1 rounded-lg border font-semibold ${map[rec] ?? "bg-muted text-muted-foreground border-border/30"}`}>
      {rec}
    </span>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    HIGH:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
    MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${map[severity ?? "MEDIUM"] ?? map.MEDIUM}`}>
      {severity ?? "MEDIUM"}
    </span>
  );
}

export default function FitchS6AssessmentPackage({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();

  const result = state.results.find(r => r.role === "report_generator");
  const liveData = result?.resultSummary;
  const hasResults = !!liveData;

  const pkg = liveData?.assessmentPackage ?? {};
  const watchList: string[] = liveData?.watchList ?? [];
  const recommendation: string = liveData?.recommendation ?? "Active Monitor";
  const ratioHighlights: any[] = pkg.ratioHighlights ?? [];
  const nlpHighlights: any[] = pkg.nlpHighlights ?? [];
  const svbComparison = liveData?.svbComparison;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold">Assessment Package</h2>
        <p className="text-[11px] text-muted-foreground">
          Analyst-ready credit assessment package — live from Assessment Report Generator
        </p>
      </div>

      {!hasResults ? (
        <FitchEmptyState
          agentName="Assessment Report Generator"
          agentRole="report_generator"
          description="Run the full pipeline to generate the analyst-ready credit assessment package."
          onGoToCommandCenter={() => onScreenChange(1)}
        />
      ) : (
        <>
          {/* Composite score + recommendation */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="col-span-2">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Analyst Recommendation</p>
                <div className="flex items-center gap-3">
                  <RecommendationBadge rec={recommendation} />
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {watchList.length > 0 ? `Watch list: ${watchList.join(", ")}` : "No banks require immediate escalation"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/30">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Report Generated</p>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-cyan-400">Complete</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">AQEWS-QUARTERLY-V3</p>
              </CardContent>
            </Card>
          </div>

          {/* Executive summary */}
          {pkg.executiveSummary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Executive Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  data-testid="fitch-s6-exec-summary"
                  className="text-[12px] text-muted-foreground leading-relaxed"
                >
                  {pkg.executiveSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Ratio highlights */}
          {ratioHighlights.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Key Ratio Findings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Ratio</th>
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Finding</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratioHighlights.map((r: any, i: number) => {
                      const ratioDef = FITCH_RATIO_DEFS.find(d => d.id === r.ratio);
                      return (
                        <tr
                          key={i}
                          data-testid={`fitch-ratio-highlight-${i}`}
                          className="border-b border-border/30 last:border-none hover:bg-muted/20"
                        >
                          <td className="px-4 py-2">
                            <span className="font-medium">{ratioDef?.name ?? r.ratio}</span>
                            <span className="text-[9px] text-muted-foreground/50 ml-1.5 font-mono">{r.ratio}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground/80">{r.finding}</td>
                          <td className="px-3 py-2 text-center">
                            <SeverityBadge severity={r.severity} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* NLP highlights */}
          {nlpHighlights.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">NLP Signal Highlights</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Bank</th>
                      <th className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">Signal</th>
                      <th className="text-center text-[10px] text-muted-foreground font-normal px-3 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nlpHighlights.map((h: any, i: number) => (
                      <tr
                        key={i}
                        data-testid={`fitch-nlp-highlight-${i}`}
                        className="border-b border-border/30 last:border-none hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 font-medium">{h.bank}</td>
                        <td className="px-3 py-2 text-muted-foreground/80">{h.signal}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[9px] font-mono bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground">
                            {h.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Analyst note */}
          {pkg.analystNote && (
            <Card className="border-cyan-500/20 bg-cyan-500/[0.02]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <CardTitle className="text-sm font-medium text-cyan-400">Analyst Recommendation Note</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p
                  data-testid="fitch-s6-analyst-note"
                  className="text-[12px] text-muted-foreground leading-relaxed"
                >
                  {pkg.analystNote}
                </p>
              </CardContent>
            </Card>
          )}

          {/* SVB comparison footnote */}
          {svbComparison && (
            <Card className="border-rose-500/20 bg-rose-500/[0.02]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <CardTitle className="text-sm font-medium text-rose-400">SVB Comparison Footnote</CardTitle>
                  <Badge className="text-[9px] bg-amber-500/20 text-amber-300 border-amber-500/30 ml-auto">
                    Illustrative — see SVB Backtest screen for timeline
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {svbComparison.parallelsFound?.map((p: string, i: number) => (
                  <div key={i} className="text-[11px] text-muted-foreground/80 flex gap-2 mb-1">
                    <span className="text-rose-400 shrink-0">→</span>
                    <span>{p}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
