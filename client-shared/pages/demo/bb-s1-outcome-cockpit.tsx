import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, DollarSign, Bot, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface BBOutcomeData {
  outcome: { id: string; name: string; description: string; status: string; costToServeMonthly: number; agentCount: number };
  kpis: { id: string; name: string; value: number; target: number; unit: string; status: string; trend: string; description: string; lowerIsBetter?: boolean }[];
  confidenceHistory: { week: string; score: number }[];
}

function KpiCard({ kpi }: { kpi: BBOutcomeData["kpis"][0] }) {
  const passing = kpi.lowerIsBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target;
  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
  const trendColor = kpi.lowerIsBetter
    ? (kpi.trend === "down" ? "text-green-400" : "text-red-400")
    : (kpi.trend === "up" ? "text-green-400" : kpi.trend === "down" ? "text-red-400" : "text-muted-foreground");

  return (
    <div className="p-4 rounded-xl border bg-card" data-testid={`bb-kpi-${kpi.id}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-muted-foreground leading-tight max-w-[70%]">{kpi.name}</p>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
          passing
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-red-500/10 text-red-400 border-red-500/20"
        }`}>
          {passing ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
          {passing ? "On Target" : "Off Target"}
        </span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <div>
          <span className="text-2xl font-bold tabular-nums">{kpi.value}</span>
          <span className="text-sm text-muted-foreground ml-1">{kpi.unit}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <TrendIcon className={`w-4 h-4 ${trendColor}`} />
          <span className="text-[10px] text-muted-foreground">Target: {kpi.target}{kpi.unit.includes("%") ? "%" : ""}</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{kpi.description}</p>
    </div>
  );
}

export default function BBScreen1OutcomeCockpit() {
  const { data, isLoading } = useQuery<BBOutcomeData>({
    queryKey: ["/demo-api/blackbook/outcome"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data!;
  const maxConf = Math.max(...(d.confidenceHistory?.map(h => h.score) || [100]));
  const minConf = Math.min(...(d.confidenceHistory?.map(h => h.score) || [0]));

  return (
    <div className="space-y-5">
      {/* Outcome header card */}
      <div className="rounded-xl border bg-card p-5" data-testid="bb-outcome-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                All KPIs On Target
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug">{d.outcome.name}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">{d.outcome.description}</p>
          </div>
          <div className="flex gap-4 shrink-0 text-right">
            <div>
              <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="text-[10px]">Monthly cost</span>
              </div>
              <p className="text-lg font-bold">${d.outcome.costToServeMonthly.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">for {d.outcome.agentCount} agents</p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                <Bot className="w-3.5 h-3.5" />
                <span className="text-[10px]">Active agents</span>
              </div>
              <p className="text-lg font-bold">{d.outcome.agentCount}</p>
              <p className="text-[10px] text-muted-foreground">all healthy</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {d.kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
      </div>

      {/* Confidence trajectory */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold">Outcome Confidence Trajectory</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Composite model confidence over last 14 weeks — upward trend</p>
          </div>
          <span className="text-xs font-bold text-green-400">{d.confidenceHistory?.at(-1)?.score ?? 91}%</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {(d.confidenceHistory || []).map((h, i) => {
            const pct = ((h.score - minConf) / (maxConf - minConf + 1)) * 100;
            const isLast = i === d.confidenceHistory.length - 1;
            return (
              <div key={h.week} className="flex-1 flex flex-col items-center gap-0.5 group" data-testid={`bb-conf-bar-${i}`}>
                <div className="w-full rounded-sm transition-colors" style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: isLast ? "hsl(142 71% 45%)" : "hsl(142 71% 45% / 0.4)" }} />
                {i % 3 === 0 && <span className="text-[8px] text-muted-foreground/60 hidden group-hover:block">{h.week}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent pipeline */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-xs font-semibold mb-3">Agent Pipeline — 4 Agents Supporting This Outcome</h3>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {[
            { code: "BB-AGT-001", name: "Auction Data Quality Sentinel", role: "Data integrity gate — 142K+ daily transactions", color: "blue" },
            { code: "BB-AGT-002", name: "Market Shift Detector", role: "2-4 week early warning on segment shifts", color: "amber" },
            { code: "BB-AGT-003", name: "Competitive Intelligence Monitor", role: "KBB / NADA divergence tracking", color: "purple" },
            { code: "BB-AGT-004", name: "Narrative Insight Generator", role: "85% of weekly report auto-drafted in 3 min", color: "green" },
          ].map(agent => (
            <div key={agent.code} className="p-3 rounded-lg border bg-muted/20" data-testid={`bb-agent-card-${agent.code}`}>
              <span className="text-[10px] font-mono text-muted-foreground">{agent.code}</span>
              <p className="text-[11px] font-semibold mt-0.5 leading-tight">{agent.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{agent.role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
