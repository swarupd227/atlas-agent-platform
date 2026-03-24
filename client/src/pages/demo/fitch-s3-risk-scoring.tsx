import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Shield, BarChart2, Activity, CheckCircle2 } from "lucide-react";
import { useFitchPipeline, FITCH_AGENTS, FITCH_DEMO_BANK_NAME, FITCH_DEMO_BANK_ID } from "./fitch-constants";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Cell,
} from "recharts";

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#ef4444", CRITICAL: "#dc2626",
};

const PORTFOLIO_SCATTER = [
  { name: "SVB",       score: 87.3, nim: 1.4, color: "#dc2626",  size: 200 },
  { name: "PacWest",   score: 61.2, nim: 2.1, color: "#ef4444",  size: 140 },
  { name: "Signature", score: 54.8, nim: 2.4, color: "#ef4444",  size: 120 },
  { name: "Heartland", score: 42.1, nim: 2.9, color: "#f59e0b",  size: 100 },
  { name: "Columbia",  score: 38.4, nim: 3.1, color: "#f59e0b",  size: 90  },
  { name: "Banner",    score: 29.2, nim: 3.4, color: "#f59e0b",  size: 80  },
  { name: "Glacier",   score: 22.1, nim: 3.6, color: "#22c55e",  size: 70  },
  { name: "Renasant",  score: 18.4, nim: 3.8, color: "#22c55e",  size: 60  },
  { name: "First Natl",score: 15.2, nim: 4.0, color: "#22c55e",  size: 55  },
  { name: "Heartland2",score: 12.8, nim: 4.2, color: "#22c55e",  size: 50  },
];

const SVB_RADAR = [
  { subject: "Capital",     A: 28, B: 18 },
  { subject: "Asset Qual.", A: 45, B: 22 },
  { subject: "Earnings",    A: 22, B: 14 },
  { subject: "Liquidity",   A: 69, B: 25 },
  { subject: "Sensitivity", A: 38, B: 20 },
  { subject: "NLP Score",   A: 41, B: 15 },
];

const TOP_RISK_BANKS = [
  { name: "Silicon Valley Bank",    id: FITCH_DEMO_BANK_ID, score: 87.3, trend: "↑ +25.8",  level: "CRITICAL", driver: "Liquidity · HTM Unrealized Losses",  prior: "BBB" },
  { name: "Pacific Western Bank",   id: "RSSD-1029867",     score: 61.2, trend: "↑ +12.3",  level: "HIGH",     driver: "Asset Quality · CRE Office Stress",  prior: "BBB" },
  { name: "Signature Bank",         id: "RSSD-1462895",     score: 54.8, trend: "→ +1.1",   level: "HIGH",     driver: "Crypto Deposit Concentration",       prior: "BBB-" },
  { name: "Heartland Financial",    id: "RSSD-2928050",     score: 42.1, trend: "↑ +4.2",   level: "HIGH",     driver: "Earnings Compression · NIM Decline", prior: "BBB+" },
  { name: "Columbia Banking System",id: "RSSD-3116158",     score: 38.4, trend: "→ -0.5",   level: "MEDIUM",   driver: "Rate Sensitivity · Duration Gap",     prior: "BBB" },
];

export default function FitchS3RiskScoring() {
  const { state } = useFitchPipeline();
  const agentDef = FITCH_AGENTS.find(a => a.role === "risk_scorer")!;
  const result = state.results.find(r => r.role === "risk_scorer");
  const liveData = result?.resultSummary;
  const isCurrent = state.currentRole === "risk_scorer";

  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/risk-scoring"],
    refetchInterval: 120_000,
  });

  const institutionsScored = liveData?.institutionsScored ?? data?.institutionsScored ?? 847;
  const criticalCount = liveData?.criticalRisk ?? data?.criticalRisk ?? 6;
  const highCount = liveData?.highRisk ?? data?.highRisk ?? 31;
  const avgScore = liveData?.avgCompositeScore ?? data?.avgCompositeScore ?? 28.4;
  const modelAuc = liveData?.modelAccuracy?.auc_roc ?? 0.94;
  const svbValidated = liveData?.svbBacktestValidated ?? false;
  const topRisks: any[] = liveData?.topRiskInstitutions ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Agent header */}
      <Card className={`${agentDef.borderColor} ${agentDef.bgColor}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <BarChart2 className={`w-5 h-5 ${agentDef.color}`} />
            <div>
              <h3 className={`text-sm font-semibold ${agentDef.color}`}>{agentDef.name}</h3>
              <p className="text-[11px] text-muted-foreground">{agentDef.description}</p>
            </div>
            {isCurrent && <Badge className="ml-auto bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">Processing…</Badge>}
            {result && !isCurrent && <Badge className="ml-auto bg-green-500/20 text-green-300 border-green-500/30">✓ Complete</Badge>}
            {svbValidated && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">SVB Backtest ✓</Badge>}
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Institutions Scored</p>
            <p className="text-2xl font-bold">{institutionsScored.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Critical Risk</p>
            <p className="text-2xl font-bold text-rose-400">{criticalCount}</p>
            <p className="text-[11px] text-muted-foreground">Score &gt; 65</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">High Risk</p>
            <p className="text-2xl font-bold text-amber-400">{highCount}</p>
            <p className="text-[11px] text-muted-foreground">Score 45–65</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Model AUC-ROC</p>
            <p className="text-2xl font-bold text-green-400">{modelAuc}</p>
            <p className="text-[11px] text-muted-foreground">2018–2024 backtest</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        {/* SVB Radar */}
        <Card className="flex-[4]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SVB Risk Profile — 2022-Q3</CardTitle>
            <p className="text-[11px] text-muted-foreground">Red = SVB · Gray = peer median (higher = worse)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={SVB_RADAR}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <Radar name="SVB" dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                <Radar name="Peer Median" dataKey="B" stroke="#6b7280" fill="#6b7280" fillOpacity={0.15} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Portfolio scatter */}
        <Card className="flex-[6]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Risk vs NIM — Top 10 Banks</CardTitle>
            <p className="text-[11px] text-muted-foreground">X = composite score, Y = NIM. Higher score = more risk.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ left: 0, right: 20, top: 8, bottom: 0 }}>
                <XAxis dataKey="score" name="Risk Score" type="number" domain={[0, 100]} tick={{ fontSize: 10 }} label={{ value: "Risk Score", position: "insideBottom", fontSize: 10, offset: -2 }} />
                <YAxis dataKey="nim" name="NIM %" type="number" tick={{ fontSize: 10 }} label={{ value: "NIM %", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <ZAxis dataKey="size" range={[30, 200]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(val: any, name: string) => [val, name]} content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background border rounded p-2 text-[10px]">
                      <p className="font-medium">{d.name}</p>
                      <p>Risk Score: {d.score}</p>
                      <p>NIM: {d.nim}%</p>
                    </div>
                  );
                }} />
                <Scatter data={PORTFOLIO_SCATTER}>
                  {PORTFOLIO_SCATTER.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top risk table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <CardTitle className="text-sm font-medium">Top Risk Institutions — Composite CAMELS Score</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Institution</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Score / Trend</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Risk Level</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Primary Driver</th>
                <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Prior Rating</th>
              </tr>
            </thead>
            <tbody>
              {TOP_RISK_BANKS.map((bank, i) => (
                <tr key={bank.id} className="border-b border-border/30 last:border-none hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded bg-muted/30 text-[8px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="font-medium">{bank.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={bank.level === "CRITICAL" ? "text-rose-400 font-bold" : "text-amber-400 font-bold"}>{bank.score}</span>
                    <span className="text-muted-foreground/50 ml-1 text-[9px]">{bank.trend}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${bank.level === "CRITICAL" ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {bank.level}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground/80">{bank.driver}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[10px] bg-muted/30 px-1.5 py-0.5 rounded">{bank.prior}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {topRisks.length > 0 && (
            <div className="px-4 py-2 border-t border-border/30">
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Live agent data: {topRisks.length} institutions scored — {liveData?.svbEarlyWarningQuarter} SVB signal (
                {liveData?.svbDaysAdvanceWarning} days advance)
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
