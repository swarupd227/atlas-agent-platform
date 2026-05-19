import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity, AlertTriangle, Bell, BellOff, Bot, CheckCircle2, ChevronRight,
  DollarSign, Eye, FlaskConical, Radio, RefreshCw, Shield, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MonitorSummary {
  activeAgents: number;
  sampledTraces24h: number;
  openAlerts: number;
  alertsByPriority: { P0: number; P1: number; P2: number };
  costToday: number;
}

interface EvalAlert {
  id: string;
  agentId: string;
  metricName: string;
  severity: string;
  currentValue: number | null;
  thresholdValue: number | null;
  baselineValue: number | null;
  windowHours: number | null;
  resolved: boolean;
  acknowledgedAt: string | null;
  triggeredAt: string;
}

interface AgentMonitorRow {
  agent: { id: string; name: string; description?: string };
  sparkline: (number | null)[];
  currentPassRate: number | null;
  totalRuns14d: number;
  openAlerts: EvalAlert[];
  config: { samplingRate: number; enabled: boolean };
}

// Inline sparkline SVG
function Sparkline({ data, color }: { data: (number | null)[]; color?: string }) {
  const filled = data.map(v => v ?? 0);
  const min = Math.min(...filled);
  const max = Math.max(...filled);
  const range = max - min || 1;
  const W = 80, H = 28, PAD = 2;
  const pts = filled.map((v, i) => {
    const x = (i / (filled.length - 1)) * (W - PAD * 2) + PAD;
    const y = (1 - (v - min) / range) * (H - PAD * 2) + PAD;
    return `${x},${y}`;
  }).join(" ");
  const stroke = color ?? "hsl(var(--primary))";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-7" preserveAspectRatio="none">
      {filled.length >= 2 && <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />}
    </svg>
  );
}

function severityColor(s: string) {
  if (s === "P0") return "bg-red-500/15 text-red-600 border-red-500/30";
  if (s === "P1") return "bg-orange-500/15 text-orange-600 border-orange-500/30";
  return "bg-yellow-500/15 text-yellow-600 border-yellow-500/30";
}

function passRateBadge(rate: number | null) {
  if (rate === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(rate * 100);
  const cls = pct >= 90 ? "text-green-600" : pct >= 75 ? "text-amber-600" : "text-red-600";
  return <span className={`text-sm font-semibold tabular-nums ${cls}`}>{pct}%</span>;
}

export default function EvalMonitor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<EvalAlert | null>(null);
  const [samplingEdits, setSamplingEdits] = useState<Record<string, number>>({});

  const { data: summary, isLoading: summaryLoading } = useQuery<MonitorSummary>({
    queryKey: ["/api/eval/monitoring/summary"],
    refetchInterval: 60_000,
  });

  const { data: agentRows = [], isLoading: rowsLoading } = useQuery<AgentMonitorRow[]>({
    queryKey: ["/api/eval/monitor/agents"],
    refetchInterval: 60_000,
  });

  const { data: alerts = [] } = useQuery<EvalAlert[]>({
    queryKey: ["/api/eval/alerts", { resolved: false }],
    queryFn: () => apiRequest("GET", "/api/eval/alerts?resolved=false").then(r => r.json()),
    refetchInterval: 60_000,
  });

  const ackAlert = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/eval/alerts/${id}/acknowledge`, { acknowledgedBy: "current-user" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/eval/alerts"] }); qc.invalidateQueries({ queryKey: ["/api/eval/monitor/agents"] }); toast({ title: "Alert acknowledged" }); },
  });

  const resolveAlert = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/eval/alerts/${id}/resolve`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/eval/alerts"] }); qc.invalidateQueries({ queryKey: ["/api/eval/monitor/agents"] }); qc.invalidateQueries({ queryKey: ["/api/eval/monitoring/summary"] }); toast({ title: "Alert resolved" }); },
  });

  const saveSampling = useMutation({
    mutationFn: ({ agentId, samplingRate }: { agentId: string; samplingRate: number }) =>
      apiRequest("PUT", `/api/eval/monitoring/${agentId}`, { samplingRate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/eval/monitor/agents"] }); toast({ title: "Sampling rate saved" }); },
  });

  const p0 = summary?.alertsByPriority?.P0 ?? 0;
  const p1 = summary?.alertsByPriority?.P1 ?? 0;
  const p2 = summary?.alertsByPriority?.P2 ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto" data-testid="page-eval-monitor">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/evals"><span className="hover:text-foreground cursor-pointer">Evals</span></Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium flex items-center gap-1.5"><Radio className="w-4 h-4 text-primary" /> Production Monitor</span>
        </div>
        <div className="flex items-center gap-2">
          {(p0 + p1) > 0 && (
            <Badge variant="destructive" className="text-xs gap-1 animate-pulse" data-testid="badge-critical-alerts">
              <AlertTriangle className="w-3 h-3" /> {p0 + p1} critical
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["/api/eval/monitor/agents"] }); qc.invalidateQueries({ queryKey: ["/api/eval/monitoring/summary"] }); }} data-testid="button-refresh-monitor">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="strip-kpis">
        {[
          { label: "Active Agents", value: summaryLoading ? null : summary?.activeAgents ?? 0, icon: Bot, color: "text-blue-500" },
          { label: "Sampled Traces (24h)", value: summaryLoading ? null : summary?.sampledTraces24h ?? 0, icon: Activity, color: "text-purple-500" },
          { label: "Open Alerts", value: summaryLoading ? null : summary?.openAlerts ?? 0, icon: Bell, color: (summary?.openAlerts ?? 0) > 0 ? "text-orange-500" : "text-green-500" },
          { label: "Eval Cost Today", value: summaryLoading ? null : `$${(summary?.costToday ?? 0).toFixed(3)}`, icon: DollarSign, color: "text-emerald-500" },
        ].map(kpi => (
          <Card key={kpi.label} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="flex items-start justify-between pt-4 pb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                {kpi.value === null ? <Skeleton className="h-7 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
                )}
              </div>
              <kpi.icon className={`w-5 h-5 mt-0.5 ${kpi.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Priority Bar */}
      {!summaryLoading && (p0 + p1 + p2) > 0 && (
        <div className="flex items-center gap-3 text-xs p-3 rounded-lg border bg-muted/30" data-testid="bar-alert-priorities">
          <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground font-medium">Open alerts by priority:</span>
          {p0 > 0 && <Badge variant="outline" className={`${severityColor("P0")} text-xs`} data-testid="badge-p0">{p0} P0 — Critical (&gt;10% drop)</Badge>}
          {p1 > 0 && <Badge variant="outline" className={`${severityColor("P1")} text-xs`} data-testid="badge-p1">{p1} P1 — High (5–10%)</Badge>}
          {p2 > 0 && <Badge variant="outline" className={`${severityColor("P2")} text-xs`} data-testid="badge-p2">{p2} P2 — Low (&lt;5%)</Badge>}
        </div>
      )}

      {/* Per-Agent Monitor Table */}
      <Card data-testid="card-agent-monitor-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            Agent Quality Monitor — 14-day trend
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rowsLoading ? (
            <div className="p-4 flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : agentRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No agents found</p>
              <p className="text-xs text-muted-foreground/70">Deploy agents and run evals to see monitoring data</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[2fr_80px_80px_60px_140px_120px_80px] gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
                <span>Agent</span>
                <span className="text-center">Pass Rate</span>
                <span className="text-center">Runs (14d)</span>
                <span className="text-center">Alerts</span>
                <span className="text-center">14-day trend</span>
                <span className="text-center">Sampling Rate</span>
                <span></span>
              </div>
              <div className="divide-y">
                {agentRows.map((row) => {
                  const editRate = samplingEdits[row.agent.id];
                  const displayRate = editRate !== undefined ? editRate : row.config.samplingRate;
                  const hasAlerts = row.openAlerts.length > 0;
                  const topAlert = row.openAlerts[0];
                  const sparkColor = (row.currentPassRate ?? 0) >= 0.9 ? "#22c55e" : (row.currentPassRate ?? 0) >= 0.75 ? "#f59e0b" : "#ef4444";
                  return (
                    <div key={row.agent.id} className={`grid grid-cols-[2fr_80px_80px_60px_140px_120px_80px] gap-3 items-center px-4 py-3 hover:bg-muted/20 transition-colors ${hasAlerts ? "bg-orange-500/5" : ""}`} data-testid={`row-agent-monitor-${row.agent.id}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.agent.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.agent.description ?? "—"}</p>
                      </div>
                      <div className="flex justify-center">{passRateBadge(row.currentPassRate)}</div>
                      <div className="text-center text-sm text-muted-foreground">{row.totalRuns14d}</div>
                      <div className="flex justify-center">
                        {hasAlerts ? (
                          <button onClick={() => setSelectedAlert(topAlert)} data-testid={`button-alert-badge-${row.agent.id}`}>
                            <Badge variant="outline" className={`${severityColor(topAlert.severity)} text-xs cursor-pointer hover:opacity-80 gap-1`}>
                              <Bell className="w-2.5 h-2.5" /> {row.openAlerts.length}
                            </Badge>
                          </button>
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <div className="flex justify-center">
                        <Sparkline data={row.sparkline} color={sparkColor} />
                      </div>
                      <div className="flex flex-col gap-1 px-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{Math.round(displayRate * 100)}%</span>
                          <span className="text-muted-foreground/60 text-[10px]">~${(displayRate * 0.004 * 24).toFixed(3)}/day</span>
                        </div>
                        <Slider
                          min={1} max={100} step={1}
                          value={[Math.round(displayRate * 100)]}
                          onValueChange={([v]) => setSamplingEdits(p => ({ ...p, [row.agent.id]: v / 100 }))}
                          onValueCommit={([v]) => saveSampling.mutate({ agentId: row.agent.id, samplingRate: v / 100 })}
                          className="h-1"
                          data-testid={`slider-sampling-${row.agent.id}`}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Link href={`/evals/runs?agentId=${row.agent.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid={`link-view-runs-${row.agent.id}`}>
                            Runs <ChevronRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Open Alerts List */}
      {alerts.length > 0 && (
        <Card data-testid="card-open-alerts">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500" />
              Open Alerts
              <Badge variant="outline" className="text-xs">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {alerts.map(alert => {
                const agent = agentRows.find(r => r.agent.id === alert.agentId)?.agent;
                return (
                  <div key={alert.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20" data-testid={`row-alert-${alert.id}`}>
                    <Badge variant="outline" className={`${severityColor(alert.severity)} text-xs shrink-0`}>{alert.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{agent?.name ?? alert.agentId}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.metricName} — current: {alert.currentValue != null ? `${Math.round(alert.currentValue * 100)}%` : "—"}, baseline: {alert.baselineValue != null ? `${Math.round(alert.baselineValue * 100)}%` : "—"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(alert.triggeredAt).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!alert.acknowledgedAt && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => ackAlert.mutate(alert.id)} data-testid={`button-ack-alert-${alert.id}`}>
                          <Eye className="w-3 h-3 mr-1" /> Ack
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => resolveAlert.mutate(alert.id)} data-testid={`button-resolve-alert-${alert.id}`}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setSelectedAlert(alert)} data-testid={`button-detail-alert-${alert.id}`}>
                        Details <ChevronRight className="w-3 h-3 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert Detail Panel */}
      <Sheet open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto" data-testid="panel-alert-detail">
          {selectedAlert && <AlertDetailPanel alert={selectedAlert} agentRows={agentRows} onAck={() => ackAlert.mutate(selectedAlert.id)} onResolve={() => { resolveAlert.mutate(selectedAlert.id); setSelectedAlert(null); }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AlertDetailPanel({ alert, agentRows, onAck, onResolve }: { alert: EvalAlert; agentRows: AgentMonitorRow[]; onAck: () => void; onResolve: () => void }) {
  const row = agentRows.find(r => r.agent.id === alert.agentId);
  const currentPct = alert.currentValue != null ? Math.round(alert.currentValue * 100) : null;
  const baselinePct = alert.baselineValue != null ? Math.round(alert.baselineValue * 100) : null;
  const thresholdPct = alert.thresholdValue != null ? Math.round(alert.thresholdValue * 100) : null;
  const drop = (baselinePct != null && currentPct != null) ? baselinePct - currentPct : null;

  const sparkline = row?.sparkline ?? Array(14).fill(null);
  const sparkFilled = sparkline.map(v => v ?? (alert.baselineValue ?? 0));

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          Alert Detail
        </SheetTitle>
      </SheetHeader>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`${severityColor(alert.severity)} text-xs`}>{alert.severity}</Badge>
          <span className="text-sm font-semibold">{row?.agent.name ?? alert.agentId}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Current", value: currentPct != null ? `${currentPct}%` : "—", color: "text-red-600" },
            { label: "Threshold", value: thresholdPct != null ? `${thresholdPct}%` : "—", color: "text-orange-500" },
            { label: "Baseline", value: baselinePct != null ? `${baselinePct}%` : "—", color: "text-muted-foreground" },
          ].map(t => (
            <div key={t.label} className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t.label}</p>
              <p className={`text-lg font-bold ${t.color}`}>{t.value}</p>
            </div>
          ))}
        </div>

        {drop != null && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/8 border border-red-500/20 text-sm">
            <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-red-700 dark:text-red-400">{drop} percentage point drop from baseline over {alert.windowHours ?? 24}h window</span>
          </div>
        )}

        {/* 14-day trend chart */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">14-day pass rate trend</p>
          <div className="rounded-lg border bg-muted/10 p-3">
            <svg viewBox="0 0 300 60" className="w-full h-16" preserveAspectRatio="none">
              {(() => {
                const min = Math.min(...sparkFilled);
                const max = Math.max(...sparkFilled, 0.01);
                const range = max - min || 1;
                const pts = sparkFilled.map((v, i) => {
                  const x = (i / (sparkFilled.length - 1)) * 290 + 5;
                  const y = (1 - (v - min) / range) * 50 + 5;
                  return `${x},${y}`;
                }).join(" ");
                const threshY = alert.thresholdValue != null ? (1 - (alert.thresholdValue - min) / range) * 50 + 5 : null;
                return (
                  <>
                    {threshY != null && (
                      <line x1="5" y1={threshY} x2="295" y2={threshY} stroke="#f97316" strokeWidth={1} strokeDasharray="4 2" opacity={0.7} />
                    )}
                    <polyline points={pts} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinejoin="round" />
                    <circle cx={sparkFilled.length > 1 ? "295" : "5"} cy={(() => { const v = sparkFilled[sparkFilled.length - 1]; return (1 - (v - min) / range) * 50 + 5; })()} r="3" fill="#ef4444" />
                  </>
                );
              })()}
            </svg>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>14 days ago</span>
              <span className="text-orange-500">— threshold</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Alert info</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-muted-foreground">Metric</div><div className="font-medium capitalize">{alert.metricName.replace(/_/g, " ")}</div>
            <div className="text-muted-foreground">Window</div><div className="font-medium">{alert.windowHours ?? 24}h</div>
            <div className="text-muted-foreground">Triggered</div><div className="font-medium">{new Date(alert.triggeredAt).toLocaleString()}</div>
            <div className="text-muted-foreground">Acknowledged</div><div className="font-medium">{alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleTimeString() : "No"}</div>
          </div>
        </div>

        <div className="flex gap-2">
          {!alert.acknowledgedAt && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onAck} data-testid="button-panel-ack">
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Acknowledge
            </Button>
          )}
          <Button size="sm" className="flex-1" onClick={onResolve} data-testid="button-panel-resolve">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Resolve Alert
          </Button>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Recent test runs</p>
          <Link href={`/evals/runs?agentId=${alert.agentId}&passFail=fail`}>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" data-testid="link-failing-traces">
              <FlaskConical className="w-3.5 h-3.5" />
              View failing traces for this agent
              <ChevronRight className="w-3 h-3 ml-auto" />
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
