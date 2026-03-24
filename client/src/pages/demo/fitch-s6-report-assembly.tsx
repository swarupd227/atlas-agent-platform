import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Clock, TrendingDown, Users, Zap, AlertTriangle } from "lucide-react";
import { useFitchPipeline, FITCH_AGENTS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

const RATING_ACTION_COLORS: Record<string, string> = {
  "Rating Watch Negative": "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "Downgrade":             "bg-red-500/20 text-red-400 border-red-500/30",
  "Affirm":                "bg-muted/30 text-muted-foreground border-border/30",
  "Upgrade":               "bg-green-500/20 text-green-400 border-green-500/30",
  "Positive Outlook":      "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const SAMPLE_PACKAGES = [
  {
    bank: "Silicon Valley Bank",
    rating: "BB",
    action: "Rating Watch Negative",
    outlook: "Negative",
    analyst: "J. Peterson",
    pages: 28,
    template: "Full Credit Assessment",
    key_concerns: ["HTM unrealized losses = 41% of equity","Wholesale funding dependency","Deposit base concentration"],
  },
  {
    bank: "Pacific Western Bank",
    rating: "BBB-",
    action: "Downgrade",
    outlook: "Negative",
    analyst: "M. Chen",
    pages: 26,
    template: "Full Credit Assessment",
    key_concerns: ["CRE office exposure 28% of portfolio","NPL ratio above peer median","Earnings compression"],
  },
  {
    bank: "Signature Bank",
    rating: "BBB-",
    action: "Rating Watch Negative",
    outlook: "Negative",
    analyst: "R. Williams",
    pages: 22,
    template: "Watch Alert",
    key_concerns: ["Crypto deposit concentration 20%","AML compliance gaps","Rapid balance sheet growth"],
  },
  {
    bank: "Heartland Financial",
    rating: "BBB",
    action: "Affirm",
    outlook: "Stable",
    analyst: "K. Patel",
    pages: 20,
    template: "Peer Comparison",
    key_concerns: ["NIM compression YoY","CRE concentration at regulatory limit"],
  },
  {
    bank: "Columbia Banking System",
    rating: "BBB+",
    action: "Affirm",
    outlook: "Stable",
    analyst: "J. Peterson",
    pages: 18,
    template: "Full Credit Assessment",
    key_concerns: ["Moderate rate sensitivity","Stable deposit franchise"],
  },
];

const SECTION_OUTLINE = [
  "1. Executive Summary & Rating Action",
  "2. CAMELS Score Summary",
  "3. Capital Adequacy Analysis",
  "4. Asset Quality Deep Dive",
  "5. Earnings & Revenue Analysis",
  "6. Liquidity & Funding Profile",
  "7. Sensitivity & Market Risk",
  "8. Management Quality Assessment",
  "9. Peer Comparison",
  "10. Scenario Analysis & Stress Testing",
  "11. Rating Rationale & Outlook",
  "12. Appendix: Key Financial Tables",
];

export default function FitchS6ReportAssembly() {
  const { state } = useFitchPipeline();
  const agentDef = FITCH_AGENTS.find(a => a.role === "report_generator")!;
  const result = state.results.find(r => r.role === "report_generator");
  const liveData = result?.resultSummary;
  const isCurrent = state.currentRole === "report_generator";

  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/report-assembly"],
    refetchInterval: 120_000,
  });

  const hasRun = !!result;
  const isIdle = state.status === "idle" && !hasRun;

  const packagesGenerated = liveData?.packagesGenerated ?? 0;
  const analystHoursSaved = liveData?.analystHoursSaved ?? 0;
  const avgTurnaround = liveData?.avgTurnaroundHours ?? null;
  const totalPages = liveData?.totalPagesGenerated ?? 0;
  const ratingActions = liveData?.ratingActions ?? { upgraded: 0, downgraded: 0, watch_negative: 0, affirmed: 0 };
  const topPkg = liveData?.topPackage ?? null;

  if (isIdle) {
    return (
      <div className="flex flex-col gap-4">
        <Card className={`${agentDef.borderColor} ${agentDef.bgColor}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className={`w-5 h-5 ${agentDef.color}`} />
              <div>
                <h3 className={`text-sm font-semibold ${agentDef.color}`}>{agentDef.name}</h3>
                <p className="text-[11px] text-muted-foreground">{agentDef.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {agentDef.tools.map(t => (
                <span key={t} className="text-[9px] font-mono bg-muted/30 text-muted-foreground/70 px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
          </CardContent>
        </Card>
        <FitchEmptyState agentName={agentDef.name} agentRole="report_generator" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Agent header */}
      <Card className={`${agentDef.borderColor} ${agentDef.bgColor}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <FileText className={`w-5 h-5 ${agentDef.color}`} />
            <div>
              <h3 className={`text-sm font-semibold ${agentDef.color}`}>{agentDef.name}</h3>
              <p className="text-[11px] text-muted-foreground">{agentDef.description}</p>
            </div>
            {isCurrent && <Badge className="ml-auto bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">Processing…</Badge>}
            {result && !isCurrent && <Badge className="ml-auto bg-green-500/20 text-green-300 border-green-500/30">✓ Complete</Badge>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {agentDef.tools.map(t => (
              <span key={t} className="text-[9px] font-mono bg-muted/30 text-muted-foreground/70 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Packages Generated</p>
            <p className="text-2xl font-bold text-cyan-400">{packagesGenerated}</p>
            <p className="text-[11px] text-muted-foreground">This assessment cycle</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Analyst Hours Saved</p>
            <p className="text-2xl font-bold text-green-400">{analystHoursSaved}</p>
            <p className="text-[11px] text-muted-foreground">vs. manual assembly</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Turnaround</p>
            <p className="text-2xl font-bold">{avgTurnaround}h</p>
            <p className="text-[11px] text-muted-foreground">vs. 48h manual baseline</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pages Generated</p>
            <p className="text-2xl font-bold">{totalPages.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Across all packages</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        {/* Rating actions summary */}
        <Card className="flex-[4]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rating Actions This Cycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {[
                { label: "Rating Watch Negative", count: ratingActions.watch_negative, color: "bg-rose-500/20 text-rose-400" },
                { label: "Downgraded",            count: ratingActions.downgraded,     color: "bg-red-500/20 text-red-400" },
                { label: "Affirmed",              count: ratingActions.affirmed,        color: "bg-muted/30 text-muted-foreground" },
                { label: "Upgraded",              count: ratingActions.upgraded,        color: "bg-green-500/20 text-green-400" },
              ].map(ra => (
                <div key={ra.label} className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded min-w-[160px] ${ra.color}`}>{ra.label}</span>
                  <div className="flex-1 bg-muted/20 rounded-full h-2">
                    <div className="h-2 rounded-full bg-current opacity-60" style={{ width: `${(ra.count / (packagesGenerated || 1)) * 100}%`, color: ra.color.split(" ")[1] }} />
                  </div>
                  <span className="text-sm font-bold w-6 text-right">{ra.count}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-muted/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[11px] font-medium">Automation Impact</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">Manual baseline:</span> <span className="font-medium">48h / package</span></div>
                <div><span className="text-muted-foreground">AI-assisted:</span> <span className="font-medium text-green-400">{avgTurnaround}h / package</span></div>
                <div><span className="text-muted-foreground">Time reduction:</span> <span className="font-medium text-green-400">{Math.round((1 - avgTurnaround / 48) * 100)}%</span></div>
                <div><span className="text-muted-foreground">Analyst FTEs freed:</span> <span className="font-medium text-green-400">~{Math.round(analystHoursSaved / 160)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Report template structure */}
        <Card className="flex-[6]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Full Credit Assessment Package — 28-Section Structure</CardTitle>
            <p className="text-[11px] text-muted-foreground">Standard Fitch template — auto-populated by AI agent</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {SECTION_OUTLINE.map(section => (
                <div key={section} className="flex items-center gap-2 py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                  <span className="text-[10px] text-muted-foreground/80">{section}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Package table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <CardTitle className="text-sm font-medium">Generated Credit Assessment Packages</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Institution</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Rating</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Action</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Analyst</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Key Concerns</th>
                <th className="text-right text-[10px] text-muted-foreground font-normal px-4 py-2">Pages</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_PACKAGES.map((pkg, i) => (
                <tr key={pkg.bank} className="border-b border-border/30 last:border-none hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded bg-muted/30 text-[8px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="font-medium">{pkg.bank}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-mono text-[10px] bg-muted/30 px-1.5 py-0.5 rounded">{pkg.rating}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RATING_ACTION_COLORS[pkg.action] || "bg-muted/20 text-muted-foreground border-border/30"}`}>
                      {pkg.action}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground/70">{pkg.analyst}</td>
                  <td className="px-2 py-2.5 max-w-[280px]">
                    <ul className="text-[10px] text-muted-foreground/80 space-y-0.5">
                      {pkg.key_concerns.slice(0, 2).map(c => (
                        <li key={c} className="flex items-start gap-1"><span className="text-amber-400 mt-0.5 shrink-0">·</span>{c}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground/70">{pkg.pages}pp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Live agent output callout */}
      {topPkg && (
        <Card className="border-green-500/30 bg-green-500/[0.02]">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <p className="text-[11px] font-semibold text-green-300">Live Agent Output — Top Package</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] flex-wrap">
              <span className="font-medium">{topPkg.bank_name}</span>
              <span className="font-mono bg-muted/30 px-1.5 py-0.5 rounded">{topPkg.rating}</span>
              <span className={`px-1.5 py-0.5 rounded border ${RATING_ACTION_COLORS[topPkg.action] || ""}`}>{topPkg.action}</span>
              <span className="text-muted-foreground/60">{topPkg.pages}pp · Analyst: {topPkg.analyst}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
