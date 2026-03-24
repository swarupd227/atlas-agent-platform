import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Shield, TrendingDown, BarChart2, Play, CheckCircle2, Clock, Bot,
  Database, Activity, AlertCircle, Zap,
} from "lucide-react";
import {
  FITCH_AGENTS, FITCH_MCP_SERVERS, useFitchPipeline, type FitchPipelineState,
} from "./fitch-constants";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar,
} from "recharts";

interface Props {
  onScreenChange: (screen: number) => void;
}

function KpiCard({ label, value, sub, icon: Icon, color, alert }: { label: string; value: string; sub: string; icon: any; color: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-rose-500/30 bg-rose-500/[0.03]" : ""}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color} shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold leading-tight ${alert ? "text-rose-400" : ""}`}>{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#dc2626",
};

const PORTFOLIO_DIST = [
  { level: "Low Risk",  count: 512, color: "#22c55e" },
  { level: "Medium",   count: 298, color: "#f59e0b" },
  { level: "High",     count: 31,  color: "#ef4444" },
  { level: "Critical", count: 6,   color: "#dc2626" },
];

const WATCH_BANKS = [
  { name: "Silicon Valley Bank",    score: 87.3, trend: "↑",  level: "CRITICAL", driver: "Liquidity Risk" },
  { name: "Pacific Western Bank",   score: 61.2, trend: "↑",  level: "HIGH",     driver: "Asset Quality" },
  { name: "Signature Bank",         score: 54.8, trend: "→",  level: "HIGH",     driver: "CRE Concentration" },
  { name: "Heartland Financial",    score: 42.1, trend: "↓",  level: "HIGH",     driver: "Earnings Decline" },
  { name: "Columbia Banking System",score: 38.4, trend: "→",  level: "MEDIUM",   driver: "Rate Sensitivity" },
];

function AgentPipelinePanel({ state, trigger }: { state: FitchPipelineState; trigger: () => void }) {
  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";

  return (
    <Card className="border-rose-500/20 bg-rose-500/[0.02]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-rose-400" />
          <CardTitle className="text-sm font-medium">Live Pipeline — 6 GPT-4.1 Agents</CardTitle>
          <Badge variant="secondary" className="text-[10px]">4 MCP Servers · 15 Tools</Badge>
          {isComplete && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30 ml-1">✓ Complete</Badge>}
          <Button
            size="sm"
            data-testid="fitch-s1-run-pipeline-btn"
            className="ml-auto h-7 text-xs gap-1.5 bg-rose-700 hover:bg-rose-600"
            onClick={trigger}
            disabled={isRunning}
          >
            <Play className={`w-3 h-3 ${isRunning ? "animate-pulse" : ""}`} />
            {isRunning ? "Running…" : "▶ Run Assessment Pipeline"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Six specialized AI agents run sequentially: FFIEC ingest → ratio engine → transcript NLP → news signals → composite scoring → report assembly.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-rose-400/60" />
            </div>
            <p className="text-sm text-muted-foreground">Click ▶ Run Assessment Pipeline to start live GPT-4.1 execution</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Each agent calls real MCP tools and produces structured JSON output (2–4 min total)</p>
          </div>
        )}

        {(isRunning || isComplete) && (
          <div className="flex flex-col gap-2 mt-1">
            {FITCH_AGENTS.map((agent) => {
              const result = state.results.find(r => r.role === agent.role);
              const isCurrent = state.currentRole === agent.role;
              const isDone = !!result;
              const tools = state.toolEvents.filter(t => t.agentName === agent.name);

              return (
                <div key={agent.role} className={`rounded-lg border p-2.5 transition-all ${isCurrent ? `${agent.borderColor} ${agent.bgColor}` : isDone ? "border-border/30 bg-background/20" : "border-border/20 opacity-40"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-green-400" : isCurrent ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                    <span className={`text-[11px] font-medium ${agent.color}`}>{agent.name}</span>
                    {isCurrent && <span className="text-[9px] text-amber-400 animate-pulse">Processing…</span>}
                    {isDone && <CheckCircle2 className="w-3 h-3 text-green-400 ml-auto" />}
                    {tools.length > 0 && <span className="text-[9px] text-muted-foreground/50 ml-auto">{tools.length} tools called</span>}
                  </div>
                  {(isCurrent || isDone) && tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tools.slice(0, 6).map((t, i) => (
                        <span key={i} className="text-[9px] font-mono bg-muted/30 text-muted-foreground/70 px-1 py-0.5 rounded">
                          {t.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {state.error && (
          <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[11px] text-rose-400">{state.error}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FitchS1CommandCenter({ onScreenChange }: Props) {
  const { state, trigger } = useFitchPipeline();
  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/command-center"],
    refetchInterval: 120_000,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Banks Monitored" value={data?.kpi?.banksMonitored ?? "847"} sub="FFIEC-reporting institutions" icon={Database} color="bg-blue-600" />
        <KpiCard label="Watch List" value={data?.kpi?.watchList ?? "37"} sub="High + Critical risk" icon={AlertTriangle} color="bg-amber-600" alert />
        <KpiCard label="Early Warnings Fired" value={data?.kpi?.earlyWarnings ?? "14"} sub="Preceding CAMELS actions by 1–3 qtrs" icon={Zap} color="bg-rose-600" alert />
        <KpiCard label="Avg Composite Score" value={data?.kpi?.avgScore ?? "28.4"} sub="Portfolio-wide CAMELS-enhanced" icon={BarChart2} color="bg-violet-600" />
      </div>

      {/* Main content row */}
      <div className="flex gap-4">
        {/* Portfolio risk distribution */}
        <Card className="flex-[4]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Risk Distribution</CardTitle>
            <p className="text-[11px] text-muted-foreground">847 monitored banks by composite risk tier</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={PORTFOLIO_DIST} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                <XAxis dataKey="level" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [v, "Banks"]} />
                <Bar dataKey="count" name="Banks" radius={[4, 4, 0, 0]}>
                  {PORTFOLIO_DIST.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Watch list */}
        <Card className="flex-[6]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-sm font-medium">Top Watch List Institutions</CardTitle>
              <Badge variant="secondary" className="text-[10px] ml-auto">Live CAMELS scores</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Institution</th>
                  <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Score</th>
                  <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Risk</th>
                  <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Driver</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {WATCH_BANKS.map((bank, i) => (
                  <tr key={bank.name} className="border-b border-border/30 last:border-none hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-muted/30 text-[8px] font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="font-medium">{bank.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className={bank.level === "CRITICAL" ? "text-rose-400 font-bold" : bank.level === "HIGH" ? "text-amber-400 font-bold" : "text-yellow-400"}>{bank.score}</span>
                        <span className="text-muted-foreground/50">{bank.trend}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${bank.level === "CRITICAL" ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"}`}>
                        {bank.level}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground/70">{bank.driver}</td>
                    <td className="px-4 py-2.5">
                      <button
                        data-testid={`fitch-s1-watchbank-${i}`}
                        onClick={() => onScreenChange(3)}
                        className="text-[9px] text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded px-1.5 py-0.5"
                      >
                        Assess →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* MCP Server grid */}
      <div className="grid grid-cols-4 gap-3">
        {FITCH_MCP_SERVERS.map(srv => (
          <Card key={srv.name} className="border-border/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className={`w-3.5 h-3.5 ${srv.color}`} />
                <span className={`text-[11px] font-medium ${srv.color}`}>{srv.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-1">{srv.description}</p>
              <Badge variant="secondary" className="text-[9px]">{srv.tools} tools</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline runner */}
      <AgentPipelinePanel state={state} trigger={trigger} />
    </div>
  );
}
