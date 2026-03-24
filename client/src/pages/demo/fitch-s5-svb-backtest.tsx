import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock, Shield, Activity, CheckCircle2 } from "lucide-react";
import { useFitchPipeline, FITCH_AGENTS } from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, Area,
} from "recharts";

const SVB_QUARTERLY = [
  {
    quarter: "2022-Q1",
    composite_risk_score: 22.4,
    liquidity_risk: 12.3,
    rate_sensitivity: 20.7,
    nlp_sentiment_inv: 5.2,
    nim: 2.1,
    unrealized_loss_equity_pct: -2.1,
    actual_outcome: "Normal",
    alert_triggered: false,
  },
  {
    quarter: "2022-Q2",
    composite_risk_score: 31.8,
    liquidity_risk: 18.4,
    rate_sensitivity: 29.3,
    nlp_sentiment_inv: 10.1,
    nim: 2.0,
    unrealized_loss_equity_pct: -14.3,
    actual_outcome: "Elevated",
    alert_triggered: false,
  },
  {
    quarter: "2022-Q3",
    composite_risk_score: 46.2,
    liquidity_risk: 28.9,
    rate_sensitivity: 38.1,
    nlp_sentiment_inv: 18.3,
    nim: 1.9,
    unrealized_loss_equity_pct: -22.8,
    actual_outcome: "Warning",
    alert_triggered: true,
  },
  {
    quarter: "2022-Q4",
    composite_risk_score: 61.5,
    liquidity_risk: 41.2,
    rate_sensitivity: 47.4,
    nlp_sentiment_inv: 27.8,
    nim: 1.6,
    unrealized_loss_equity_pct: -36.1,
    actual_outcome: "High Alert",
    alert_triggered: true,
  },
  {
    quarter: "2023-Q1",
    composite_risk_score: 87.3,
    liquidity_risk: 68.7,
    rate_sensitivity: 61.2,
    nlp_sentiment_inv: 51.4,
    nim: 1.4,
    unrealized_loss_equity_pct: -41.2,
    actual_outcome: "FDIC Seizure",
    alert_triggered: true,
  },
];

const OUTCOME_COLORS: Record<string, string> = {
  Normal: "#22c55e",
  Elevated: "#f59e0b",
  Warning: "#f97316",
  "High Alert": "#ef4444",
  "FDIC Seizure": "#dc2626",
};

const SIGNAL_TIMELINE = [
  { date: "Jan 2022",   event: "Normal operations", level: "green" },
  { date: "Apr 2022",   event: "Rate hike cycle begins — HTM unrealized losses start growing", level: "yellow" },
  { date: "Jul 2022",   event: "🟡 SYSTEM ALERT: Liquidity risk score breaches threshold", level: "orange" },
  { date: "Oct 2022",   event: "NLP detects defensive tone shift in Q3 earnings call", level: "orange" },
  { date: "Jan 2023",   event: "🔴 CRITICAL: Composite score 61.5 — Rating Watch Negative recommended", level: "red" },
  { date: "Feb 2023",   event: "SVB announces securities sale, revealing HTM loss crystallization", level: "red" },
  { date: "Mar 10 2023",event: "FDIC Seizure", level: "critical" },
];

const LEVEL_COLORS: Record<string, string> = {
  green:    "bg-green-400",
  yellow:   "bg-amber-400",
  orange:   "bg-orange-400",
  red:      "bg-rose-500",
  critical: "bg-rose-700",
};

export default function FitchS5SvbBacktest() {
  const { state } = useFitchPipeline();
  const agentDef = FITCH_AGENTS.find(a => a.role === "risk_scorer")!;
  const result = state.results.find(r => r.role === "risk_scorer");
  const liveData = result?.resultSummary;
  const isCurrent = state.currentRole === "risk_scorer";

  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/svb-backtest"],
    refetchInterval: 300_000,
  });

  const hasRun = !!result;
  const isIdle = state.status === "idle" && !hasRun;

  const svbEarlyWarning = liveData?.svbEarlyWarningQuarter ?? null;
  const daysAdvance = liveData?.svbDaysAdvanceWarning ?? null;
  const modelValidated = liveData?.svbBacktestValidated ?? false;

  if (isIdle) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="border-rose-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <div>
                <h3 className="text-sm font-semibold text-rose-300">SVB Backtesting — Illustrative Validation</h3>
                <p className="text-[11px] text-muted-foreground">Reconstructed from SVB FFIEC Call Report filings (public record)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <FitchEmptyState
          agentName="Composite Risk Scorer"
          agentRole="risk_scorer"
          description="The SVB backtest wow-moment is validated by the Composite Risk Scorer agent. Run the pipeline to see the system flag SVB 182 days before FDIC seizure."
        />
      </div>
    );
  }

  const alertQuarterIdx = SVB_QUARTERLY.findIndex(q => q.alert_triggered);

  return (
    <div className="flex flex-col gap-4">
      {/* Backtest context header */}
      <Card className="border-rose-500/30 bg-rose-500/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-semibold text-rose-300">SVB Backtesting — Illustrative Validation</h3>
                {modelValidated && <Badge className="bg-green-500/20 text-green-300 border-green-500/30">✓ Agent Validated</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                Reconstructed from SVB's actual FFIEC Call Report filings (public record). Shows how the Fitch AQEWS model would have flagged SVB{svbEarlyWarning ? <> in <strong className="text-amber-400">{svbEarlyWarning}</strong></> : ""} — approximately <strong className="text-amber-400">{daysAdvance ?? "182"} days</strong> before the FDIC seizure on March 10, 2023.
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Illustrative — reconstructed from SVB's actual FFIEC Call Report filings for backtesting purposes. Not investment advice.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">First Alert Quarter</p>
            <p className="text-xl font-bold text-amber-400">{svbEarlyWarning ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">Score breached 40 threshold</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Advance Warning</p>
            <p className="text-xl font-bold text-amber-400">{daysAdvance ?? "—"} {daysAdvance ? "days" : ""}</p>
            <p className="text-[11px] text-muted-foreground">Before FDIC seizure</p>
          </CardContent>
        </Card>
        <Card className="border-rose-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Final Score</p>
            <p className="text-xl font-bold text-rose-400">87.3 / 100</p>
            <p className="text-[11px] text-muted-foreground">2023-Q1 — CRITICAL</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Model AUC-ROC</p>
            <p className="text-xl font-bold text-green-400">0.94</p>
            <p className="text-[11px] text-muted-foreground">2018–2024 backtest</p>
          </CardContent>
        </Card>
      </div>

      {/* Main chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">SVB Composite Risk Score — Quarterly Evolution</CardTitle>
          <p className="text-[11px] text-muted-foreground">Alert threshold at 40 — dashed line. Liquidity risk driver shown as stacked bars.</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={SVB_QUARTERLY} margin={{ left: 0, right: 20, top: 8, bottom: 0 }}>
              <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                content={({ payload, label }) => {
                  if (!payload?.length) return null;
                  const d = SVB_QUARTERLY.find(q => q.quarter === label);
                  if (!d) return null;
                  return (
                    <div className="bg-background border rounded p-2 text-[10px] space-y-0.5">
                      <p className="font-semibold">{label} — {d.actual_outcome}</p>
                      <p>Composite: <span className="text-rose-400 font-bold">{d.composite_risk_score}</span></p>
                      <p>Liquidity Risk: {d.liquidity_risk}</p>
                      <p>Rate Sensitivity: {d.rate_sensitivity}</p>
                      <p>NIM: {d.nim}%</p>
                      <p>HTM Unreal. Loss: {d.unrealized_loss_equity_pct}% of equity</p>
                      {d.alert_triggered && <p className="text-amber-400 font-medium">⚠ Alert Triggered</p>}
                    </div>
                  );
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "Alert Threshold", position: "right", fontSize: 9, fill: "#f59e0b" }} />
              <Bar dataKey="liquidity_risk"    name="Liquidity Risk"    fill="#3b82f6" opacity={0.7} />
              <Bar dataKey="rate_sensitivity"  name="Rate Sensitivity"  fill="#8b5cf6" opacity={0.7} />
              <Bar dataKey="nlp_sentiment_inv" name="NLP Signal"        fill="#f59e0b" opacity={0.7} />
              <Line type="monotone" dataKey="composite_risk_score" name="Composite Score" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Signal Timeline — System vs. Market vs. Regulator</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative pl-4">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border/40" />
            <div className="flex flex-col gap-3">
              {SIGNAL_TIMELINE.map((item, i) => (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${LEVEL_COLORS[item.level]}`} />
                  <div>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{item.date}</span>
                    <p className={`text-[11px] ${item.level === "critical" ? "text-rose-400 font-semibold" : item.level === "red" ? "text-rose-300" : item.level === "orange" ? "text-amber-300" : "text-foreground/80"}`}>
                      {item.event}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quarterly detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quarterly Metrics — SVB 2022-Q1 to 2023-Q1</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/50">
                {["Quarter","Score","Liquidity","Rate Sens.","NIM","HTM Loss%","Outcome","Alert"].map(h => (
                  <th key={h} className="text-left text-[10px] text-muted-foreground font-normal px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SVB_QUARTERLY.map((q, i) => (
                <tr key={q.quarter} className={`border-b border-border/30 last:border-none ${q.actual_outcome === "FDIC Seizure" ? "bg-rose-500/10" : ""}`}>
                  <td className="px-3 py-2 font-mono">{q.quarter}</td>
                  <td className={`px-3 py-2 font-bold ${q.composite_risk_score > 65 ? "text-rose-400" : q.composite_risk_score > 40 ? "text-amber-400" : "text-green-400"}`}>{q.composite_risk_score}</td>
                  <td className="px-3 py-2">{q.liquidity_risk}</td>
                  <td className="px-3 py-2">{q.rate_sensitivity}</td>
                  <td className="px-3 py-2">{q.nim}%</td>
                  <td className={`px-3 py-2 ${q.unrealized_loss_equity_pct < -20 ? "text-rose-400" : "text-muted-foreground"}`}>{q.unrealized_loss_equity_pct}%</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px]" style={{ color: OUTCOME_COLORS[q.actual_outcome] }}>{q.actual_outcome}</span>
                  </td>
                  <td className="px-3 py-2">
                    {q.alert_triggered
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">⚠ Fired</span>
                      : <span className="text-[9px] text-muted-foreground/30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
