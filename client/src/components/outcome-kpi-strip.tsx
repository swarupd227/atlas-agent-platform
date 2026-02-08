import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { OutcomeContract, KpiDefinition } from "@shared/schema";

interface OutcomeKpiStripProps {
  agentId?: string;
  compact?: boolean;
}

export function OutcomeKpiStrip({ agentId, compact = false }: OutcomeKpiStripProps) {
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/kpis"],
  });
  const { data: agents } = useQuery<Array<{ id: string; outcomeId: string | null }>>({
    queryKey: ["/api/agents"],
  });

  if (!outcomes?.length || !kpis?.length) return null;

  let relevantOutcomeIds: string[] = [];
  if (agentId) {
    const agent = agents?.find(a => a.id === agentId);
    if (agent?.outcomeId) relevantOutcomeIds = [agent.outcomeId];
    else return null;
  } else {
    relevantOutcomeIds = outcomes.map(o => o.id);
  }

  const relevantKpis = kpis.filter(k => relevantOutcomeIds.includes(k.outcomeId));
  if (!relevantKpis.length) return null;

  const kpiStats = relevantKpis.map(k => {
    const attainment = k.target > 0 ? ((k.currentValue || 0) / k.target) * 100 : 0;
    return {
      name: k.name,
      current: k.currentValue || 0,
      target: k.target,
      attainment,
      trend: k.trend || "stable",
      unit: k.unit,
      outcomeName: outcomes?.find(o => o.id === k.outcomeId)?.name || "",
    };
  });

  const overallAttainment = kpiStats.length > 0
    ? kpiStats.reduce((sum, k) => sum + k.attainment, 0) / kpiStats.length
    : 0;

  const atRisk = kpiStats.filter(k => k.attainment < 80);
  const onTrack = kpiStats.filter(k => k.attainment >= 80 && k.attainment < 100);
  const exceeded = kpiStats.filter(k => k.attainment >= 100);

  const statusColor = overallAttainment >= 100
    ? "text-emerald-600 dark:text-emerald-400"
    : overallAttainment >= 80
    ? "text-blue-600 dark:text-blue-400"
    : "text-amber-600 dark:text-amber-400";

  const StatusIcon = overallAttainment >= 100 ? CheckCircle : overallAttainment >= 80 ? TrendingUp : AlertTriangle;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-muted/30 flex-wrap" data-testid="outcome-kpi-strip-compact">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">KPI Delivery</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
          <span className={`text-xs font-semibold ${statusColor}`}>{overallAttainment.toFixed(0)}%</span>
        </div>
        {atRisk.length > 0 && (
          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400" data-testid="badge-kpis-at-risk">
            {atRisk.length} at risk
          </Badge>
        )}
        {exceeded.length > 0 && (
          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400" data-testid="badge-kpis-exceeded">
            {exceeded.length} exceeded
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 rounded-md bg-muted/30" data-testid="outcome-kpi-strip">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Outcome KPI Delivery</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          <span className={`text-sm font-semibold ${statusColor}`}>{overallAttainment.toFixed(1)}% overall</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {exceeded.length > 0 && <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400" data-testid="badge-exceeded-count">{exceeded.length} exceeded</Badge>}
            {onTrack.length > 0 && <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400" data-testid="badge-ontrack-count">{onTrack.length} on track</Badge>}
            {atRisk.length > 0 && <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400" data-testid="badge-atrisk-count">{atRisk.length} at risk</Badge>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {kpiStats.slice(0, 6).map((kpi, idx) => (
          <div key={idx} className="flex flex-col gap-1 p-2 rounded-md bg-background/50" data-testid={`kpi-mini-${idx}`}>
            <span className="text-[10px] text-muted-foreground truncate">{kpi.name}</span>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-xs font-semibold">{typeof kpi.current === 'number' && kpi.current % 1 !== 0 ? kpi.current.toFixed(1) : kpi.current}</span>
              <span className="text-[9px] text-muted-foreground">/ {kpi.target} {kpi.unit}</span>
            </div>
            <Progress value={Math.min(100, kpi.attainment)} className="h-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
