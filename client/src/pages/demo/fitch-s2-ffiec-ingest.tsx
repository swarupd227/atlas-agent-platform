import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, TrendingUp, TrendingDown, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { useFitchPipeline, FITCH_AGENTS } from "./fitch-constants";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";

const CAMELS_COMPONENTS = [
  { id: "capital",   label: "Capital Adequacy",  weight: "20%", color: "#6366f1", description: "Tier-1 ratio, CET1, leverage ratio" },
  { id: "assets",    label: "Asset Quality",     weight: "30%", color: "#ef4444", description: "NPL ratio, NCO rate, classified assets" },
  { id: "mgmt",      label: "Management",        weight: "10%", color: "#8b5cf6", description: "Risk governance, control environment" },
  { id: "earnings",  label: "Earnings",          weight: "15%", color: "#f59e0b", description: "ROA, ROE, NIM, efficiency ratio" },
  { id: "liquidity", label: "Liquidity",         weight: "20%", color: "#3b82f6", description: "LTD ratio, wholesale funding, HTM losses" },
  { id: "sensitivity", label: "Sensitivity",    weight: "5%",  color: "#06b6d4", description: "Rate gap, duration, CRE concentration" },
];

const SAMPLE_CAMELS_CHART = [
  { bank: "SVB",      capital: 28, assets: 45, earnings: 22, liquidity: 69, sensitivity: 38 },
  { bank: "PacWest",  capital: 22, assets: 38, earnings: 18, liquidity: 42, sensitivity: 31 },
  { bank: "Signature",capital: 25, assets: 32, earnings: 20, liquidity: 36, sensitivity: 28 },
  { bank: "Heartland",capital: 18, assets: 24, earnings: 15, liquidity: 28, sensitivity: 22 },
  { bank: "Columbia", capital: 16, assets: 19, earnings: 12, liquidity: 24, sensitivity: 19 },
];

const TREND_DATA = [
  { quarter: "2023-Q1", watchList: 18, critical: 3, highRisk: 22 },
  { quarter: "2023-Q2", watchList: 21, critical: 4, highRisk: 26 },
  { quarter: "2023-Q3", watchList: 28, critical: 5, highRisk: 29 },
  { quarter: "2023-Q4", watchList: 31, critical: 5, highRisk: 31 },
  { quarter: "2024-Q1", watchList: 34, critical: 5, highRisk: 30 },
  { quarter: "2024-Q2", watchList: 33, critical: 6, highRisk: 31 },
  { quarter: "2024-Q3", watchList: 36, critical: 6, highRisk: 31 },
  { quarter: "2024-Q4", watchList: 37, critical: 6, highRisk: 31 },
];

export default function FitchS2FfiecIngest() {
  const { state } = useFitchPipeline();
  const agentDef = FITCH_AGENTS.find(a => a.role === "ffiec_ingestor")!;

  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/ffiec-ingest"],
    refetchInterval: 120_000,
  });

  const result = state.results.find(r => r.role === "ffiec_ingestor");
  const liveData = result?.resultSummary;
  const isCurrent = state.currentRole === "ffiec_ingestor";

  const banksIngested = liveData?.banksIngested ?? data?.banksIngested ?? 847;
  const watchListCount = liveData?.watchListCount ?? data?.watchListCount ?? 37;
  const dataQuality = liveData?.dataQualityScore ?? data?.dataQualityScore ?? 98.4;
  const topFlags: string[] = liveData?.topWatchFlags ?? data?.topWatchFlags ?? ["cre_concentration","liquidity_pressure","earnings_decline"];

  return (
    <div className="flex flex-col gap-4">
      {/* Agent header */}
      <Card className={`${agentDef.borderColor} ${agentDef.bgColor}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Database className={`w-5 h-5 ${agentDef.color}`} />
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

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Banks Ingested</p>
            <p className="text-2xl font-bold text-blue-400">{banksIngested.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">FFIEC-reporting institutions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Watch List</p>
            <p className="text-2xl font-bold text-amber-400">{watchListCount}</p>
            <p className="text-[11px] text-muted-foreground">Flagged for elevated review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data Quality</p>
            <p className="text-2xl font-bold text-green-400">{dataQuality}%</p>
            <p className="text-[11px] text-muted-foreground">Field completion rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data Points</p>
            <p className="text-2xl font-bold">{(liveData?.totalDataPoints ?? 24800).toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">This quarter's ingestion</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        {/* CAMELS scoring model */}
        <Card className="flex-[5]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">CAMELS Composite Score — Top 5 Flagged Banks</CardTitle>
            <p className="text-[11px] text-muted-foreground">Per-component risk scores (higher = more risk)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={SAMPLE_CAMELS_CHART} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                <XAxis dataKey="bank" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 80]} />
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="capital"   name="Capital"   fill="#6366f1" stackId="a" />
                <Bar dataKey="assets"    name="Assets"    fill="#ef4444" stackId="a" />
                <Bar dataKey="earnings"  name="Earnings"  fill="#f59e0b" stackId="a" />
                <Bar dataKey="liquidity" name="Liquidity" fill="#3b82f6" stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Watch list trend */}
        <Card className="flex-[5]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Watch List Trend — 8 Quarters</CardTitle>
            <p className="text-[11px] text-muted-foreground">Banks at elevated and critical risk levels</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={TREND_DATA} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="watchList" name="Watch List" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="critical"  name="Critical"   stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="highRisk"  name="High Risk"  stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* CAMELS component breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">CAMELS Component Weighting — Scoring Model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {CAMELS_COMPONENTS.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: c.color }} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">{c.label}</span>
                    <Badge variant="secondary" className="text-[9px]">{c.weight}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top watch flags */}
      {topFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-sm font-medium">Top Systemic Risk Flags This Quarter</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topFlags.map((flag: string) => (
                <span key={flag} className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {flag.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
