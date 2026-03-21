import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  TrendingUp, Mail, PauseCircle, DollarSign, AlertTriangle, Info, Star,
  CheckCircle2, Clock, ExternalLink, Bot, ShieldCheck,
  Play, Activity, Database, ChevronDown, User, Check, SendHorizonal, Pause,
} from "lucide-react";
import {
  ensureHearstAgentConfig,
  useNBARun,
  HEARST_PERSONAS,
  type NBARunStep,
} from "./hearst-constants";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

interface Props {
  onBrandClick: (brandId: string) => void;
}

function KpiCard({ label, value, sub, icon: Icon, color, badge }: { label: string; value: string; sub: string; icon: any; color: string; badge?: string }) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color} shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
          {badge && <span className="text-[10px] text-green-400 font-medium">{badge}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  return `${days}d ago`;
}

const PIPELINE_ROLE: Record<string, string> = {
  subscriberProfileEngine: "Nightly subscriber profile refresh",
  contentInventory:        "Daily content catalog scoring",
  nbaEmailDecision:        "Per-subscriber SEND / HOLD decision",
  sendTimeOptimizer:       "Personalized send window computation",
  performanceLearning:     "Outcome tracking + model update",
};

const PIPELINE_METRIC: Record<string, (rs: any) => string> = {
  subscriberProfileEngine: rs => rs?.subscribersProcessed ? `${(rs.subscribersProcessed / 1e6).toFixed(1)}M profiles refreshed` : "—",
  contentInventory:        rs => rs?.emailSendable       ? `${rs.emailSendable} email-sendable / ${rs.articlesScored} scored` : "—",
  nbaEmailDecision:        rs => rs?.decisionsEvaluated  ? `${(rs.sendDecisions / 1e6).toFixed(2)}M SEND · ${(rs.holdDecisions / 1000).toFixed(0)}K HOLD` : "—",
  sendTimeOptimizer:       rs => rs?.subscribersOptimized ? `${(rs.subscribersOptimized / 1e6).toFixed(1)}M send windows` : "—",
  performanceLearning:     rs => rs?.outcomesTracked     ? `${(rs.outcomesTracked / 1e6).toFixed(2)}M outcomes · ${rs.anomaliesDetected} alerts` : "—",
};

const TRIGGER_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  event: "Event-triggered",
  manual: "Manual",
};

const TOOL_SERVER_COLORS: Record<string, string> = {
  "Hearst Data Platform": "text-indigo-400",
  "Hearst CMS":           "text-violet-400",
  "Hearst Email Queue":   "text-blue-400",
  "Hearst Analytics":     "text-cyan-400",
};

function TickerStep({ step, index }: { step: NBARunStep; index: number }) {
  const colors = ["text-indigo-400", "text-violet-400", "text-blue-400", "text-cyan-400", "text-teal-400", "text-sky-400"];
  const col = colors[index % colors.length];
  const serverCol = Object.entries(TOOL_SERVER_COLORS).find(([k]) => step.server.includes(k.split(" ")[2] || k))?.[1] || col;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/20 last:border-none">
      <div className="w-5 h-5 shrink-0 mt-0.5 rounded bg-muted/30 flex items-center justify-center">
        <Database className={`w-3 h-3 ${serverCol}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[11px] font-mono font-semibold ${col}`}>{step.tool}</span>
          <span className="text-[9px] text-muted-foreground/50 truncate max-w-[140px]">{step.server}</span>
          {step.durationMs > 0 && (
            <span className="ml-auto text-[9px] text-muted-foreground/50 shrink-0">{step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-relaxed">{step.outputSummary}</p>
      </div>
      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
    </div>
  );
}

function NBAPipelineSection() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(HEARST_PERSONAS[0].id);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const { run, isRunning, trigger } = useNBARun(selectedPersonaId);
  const persona = HEARST_PERSONAS.find(p => p.id === selectedPersonaId) || HEARST_PERSONAS[0];

  return (
    <Card className="border-indigo-500/20 bg-indigo-500/[0.02]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-indigo-400" />
          <CardTitle className="text-sm font-medium">Live NBA Pipeline Execution</CardTitle>
          <Badge variant="secondary" className="text-[10px]">Claude-powered</Badge>
          {run && !isRunning && (
            <Badge className={`text-[10px] ml-1 ${run.action === "SEND" ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
              {run.action === "SEND" ? "✓ SEND" : "⏸ HOLD"}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Persona picker */}
            <div className="relative">
              <button
                data-testid="s1-persona-picker"
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/50 rounded-md px-2 py-1 transition-colors"
                onClick={() => setShowPersonaMenu(v => !v)}
              >
                <User className="w-3 h-3" />
                <span>{persona.label.split(" — ")[0]}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showPersonaMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[200px]">
                  {HEARST_PERSONAS.map(p => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
                      onClick={() => { setSelectedPersonaId(p.id); setShowPersonaMenu(false); }}
                    >
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium">{p.label.split(" — ")[0]}</p>
                        <p className="text-[9px] text-muted-foreground">{p.tier} · {p.stage}</p>
                      </div>
                      {p.id === selectedPersonaId && <Check className="w-3 h-3 text-primary ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              size="sm"
              data-testid="s1-run-pipeline-btn"
              className="h-7 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500"
              onClick={() => trigger(persona.label)}
              disabled={isRunning}
            >
              <Play className={`w-3 h-3 ${isRunning ? "animate-pulse" : ""}`} />
              {isRunning ? "Running…" : "▶ Run Pipeline"}
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Calls the real NBA Email Decision Agent via Anthropic Claude — live MCP tool execution.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Idle state */}
        {!isRunning && !run && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-indigo-400/60" />
            </div>
            <p className="text-sm text-muted-foreground">Select a subscriber and click ▶ Run Pipeline</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Claude will call 6 MCP tools and produce a real SEND / HOLD decision (15–40s)</p>
          </div>
        )}

        {/* Running state — pulsing ticker */}
        {isRunning && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
              </span>
              <span className="text-sm font-medium text-indigo-300">NBA Orchestrator Agent is reasoning…</span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 ml-5.5 space-y-1">
              <p>Calling <span className="font-mono text-indigo-400">get_esp_events</span> → <span className="font-mono text-violet-400">get_subscription_status</span> → <span className="font-mono text-blue-400">get_cms_articles</span>…</p>
              <p>Applying <span className="font-mono text-cyan-400">NBEmail_Score</span> formula with 6 components…</p>
            </div>
            <div className="flex gap-1.5 mt-1 ml-5">
              {["get_esp_events","get_subscription_status","get_cms_articles","get_fatigue_rules","get_brand_email_queues","get_conversion_data"].map((t, i) => (
                <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/60 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {!isRunning && run && (
          <div className="flex flex-col gap-3">
            {/* Decision chip */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${run.action === "SEND" ? "bg-green-500/10 border-green-500/20" : "bg-orange-500/10 border-orange-500/20"}`}>
              {run.action === "SEND"
                ? <SendHorizonal className="w-4 h-4 text-green-400 shrink-0" />
                : <Pause className="w-4 h-4 text-orange-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-sm font-bold ${run.action === "SEND" ? "text-green-300" : "text-orange-300"}`}>
                    {run.action === "SEND" ? "SEND" : "HOLD"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">for {persona.label.split(" — ")[0]}</span>
                </div>
                {run.reasoning && (
                  <p className="text-[11px] text-muted-foreground/80 line-clamp-3 leading-relaxed">{run.reasoning}</p>
                )}
              </div>
            </div>

            {/* Tool call steps */}
            {run.steps.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  MCP Tool Calls ({run.steps.length})
                </p>
                <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-1">
                  {run.steps.map((step, i) => <TickerStep key={`${step.tool}-${i}`} step={step} index={i} />)}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[9px] text-muted-foreground/40 pt-1">
              <span>Completed {new Date(run.completedAt).toLocaleTimeString()}</span>
              <span>{run.steps.length} tool calls · real Anthropic execution</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentPipelineRunLog() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/agent-runs"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-medium">Agent Pipeline Runs</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/20 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const runs: any[] = data?.agentRuns || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-400" />
          <CardTitle className="text-sm font-medium">Agent Pipeline Runs</CardTitle>
          <Badge variant="secondary" className="text-[10px] ml-auto">Today's pipeline</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Each row is a real agent run stored in the platform — click to inspect the full trace.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left text-[10px] text-muted-foreground font-normal px-4 py-2">Agent</th>
              <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Trigger</th>
              <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Ran</th>
              <th className="text-left text-[10px] text-muted-foreground font-normal px-2 py-2">Output</th>
              <th className="text-[10px] text-muted-foreground font-normal px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const metric = PIPELINE_METRIC[run.key]?.(run.resultSummary);
              const role   = PIPELINE_ROLE[run.key] || "";
              return (
                <tr key={run.agentId} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i === runs.length - 1 ? "border-none" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-400 text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div>
                        <Link href={`/agents/${run.agentId}`}>
                          <div className="flex items-center gap-1 cursor-pointer group">
                            <span className="font-medium text-[11px] group-hover:text-[#E91E8C] transition-colors">{run.agentName}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 group-hover:text-[#E91E8C] transition-colors" />
                          </div>
                        </Link>
                        <p className="text-[9px] text-muted-foreground/60">{role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                      {TRIGGER_LABEL[run.triggerType] || run.triggerType || "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelative(run.completedAt)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 max-w-[240px]">
                    <span className="text-[10px] text-foreground/80 line-clamp-1">{metric || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span className="text-[10px] text-green-400 font-medium capitalize">{run.runStatus || "completed"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function Screen1CommandCenter({ onBrandClick }: Props) {
  const bootstrapRan = useRef(false);
  useEffect(() => {
    if (bootstrapRan.current) return;
    bootstrapRan.current = true;
    ensureHearstAgentConfig();
  }, []);

  const { data, isLoading } = useQuery<any>({ queryKey: ["/demo-api/hearst/command-center"] });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading command center data…</div>;
  }

  const { kpi, brandDist, donut, timeline, topPerformer, anomalyAlerts } = data;

  const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
  const fmtUsd = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1 — KPI Ribbon */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard
          label="Today's Decisions"
          value={fmt(kpi.evaluated)}
          sub={`${fmt(kpi.scheduled)} scheduled · ${fmt(kpi.held)} on HOLD`}
          icon={Mail}
          color="bg-indigo-500"
        />
        <KpiCard
          label="Projected Open Rate"
          value={`${kpi.projectedOpenRate}%`}
          sub={`vs. ${kpi.baseOpenRate}% 30-day baseline`}
          icon={TrendingUp}
          color="bg-green-500"
          badge={`+${kpi.liftPct}% lift ↑`}
        />
        <KpiCard
          label="Revenue Forecast"
          value={fmtUsd(kpi.revenueForecast)}
          sub={`${fmtUsd(kpi.revenueBreakdown.subscriptions)} subscriptions · ${fmtUsd(kpi.revenueBreakdown.affiliate)} affiliate`}
          icon={DollarSign}
          color="bg-emerald-600"
        />
        <KpiCard
          label="HOLD Rate"
          value={`${kpi.holdRate}%`}
          sub={`${fmt(kpi.held)} subscribers protected today`}
          icon={PauseCircle}
          color="bg-orange-500"
          badge="↑ next-day open rates +18–25%"
        />
        {kpi.aiInfluencedPct != null && (
          <KpiCard
            label="AI-Influenced Sends"
            value={`${kpi.aiInfluencedPct}%`}
            sub={`${kpi.personalizedPct ?? kpi.aiInfluencedPct - (kpi.holdRate ?? 0)}% personalized · ${kpi.holdPct ?? kpi.holdRate ?? 0}% protected HOLDs`}
            icon={Bot}
            color="bg-violet-500"
            badge="vs. 42% default send"
          />
        )}
        {kpi.portfolioFatigueScore != null && (
          <KpiCard
            label="Portfolio Fatigue Score"
            value={`${kpi.portfolioFatigueScore} / 100`}
            sub="subscribers near weekly email threshold"
            icon={ShieldCheck}
            color="bg-green-600"
            badge="↓ Low risk"
          />
        )}
      </div>

      {/* Row 2 — Brand Distribution + Donut */}
      <div className="flex gap-4">
        <Card className="flex-[6]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Brand Email Distribution Today</CardTitle>
            <p className="text-[11px] text-muted-foreground">Click a brand to drill down</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={brandDist} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
                onClick={(e) => { if (e?.activePayload?.[0]) { const brandId = brandDist.find((b: any) => b.name === e.activePayload![0].payload.name)?.id; if (brandId) onBrandClick(brandId); } }}>
                <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="shortName" tick={{ fontSize: 11 }} width={36} />
                <Tooltip formatter={(v: any) => [`${(v / 1000).toFixed(0)}K`, ""]} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="scheduled" name="Scheduled" stackId="a" fill="#6B7280" radius={[0, 0, 0, 0]} />
                <Bar dataKey="personalized" name="AI-Personalized" stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="hold" name="HOLD" stackId="a" fill="#F97316" radius={[0, 4, 4, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex-[4]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Decision Breakdown</CardTitle>
            <p className="text-[11px] text-muted-foreground">{fmt(kpi.scheduled + kpi.held)} total decisions</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={donut} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" nameKey="name">
                  {donut.map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1 w-full mt-1">
              {donut.map((d: any) => (
                <div key={d.name} className="flex items-center gap-2 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
                  <span className="font-medium">{d.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Live Send Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Live Send Timeline — 24h View</CardTitle>
            <div className="flex gap-3 text-[10px]">
              {[
                { label: "US East", color: "#6366F1" }, { label: "US Central", color: "#8B5CF6" },
                { label: "US West", color: "#3B82F6" }, { label: "Europe", color: "#10B981" },
                { label: "APAC", color: "#F59E0B" },
              ].map((tz) => (
                <span key={tz.label} className="flex items-center gap-1 text-muted-foreground">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: tz.color }} />
                  {tz.label}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Send volume by timezone. Shaded area = completed (actual open rates shown).</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9 }} width={32} />
              <Tooltip formatter={(v: any) => [`${(v / 1000).toFixed(1)}K sends`, ""]} />
              <Area type="monotone" dataKey="eastUs" stackId="1" stroke="#6366F1" fill="#6366F1" fillOpacity={0.7} name="US East" dot={false} />
              <Area type="monotone" dataKey="centralUs" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.7} name="US Central" dot={false} />
              <Area type="monotone" dataKey="westUs" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.7} name="US West" dot={false} />
              <Area type="monotone" dataKey="europe" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.7} name="Europe" dot={false} />
              <Area type="monotone" dataKey="apac" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.7} name="APAC" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Row 4 — Top Performer + Anomaly Alerts */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              <CardTitle className="text-sm font-medium">Top Performing Email Today</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold"
                style={{ background: topPerformer.brandColor }}>
                {topPerformer.brand.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{topPerformer.brand}</Badge>
                </div>
                <p className="text-sm font-medium leading-snug">{topPerformer.subject}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Send Volume</p>
                <p className="text-sm font-bold">{fmt(topPerformer.sendVolume)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-green-500/10">
                <p className="text-[10px] text-muted-foreground">Actual Open</p>
                <p className="text-sm font-bold text-green-400">{topPerformer.actualOpenRate}%</p>
                <p className="text-[9px] text-muted-foreground">pred. {topPerformer.predictedOpenRate}%</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                <p className="text-[10px] text-muted-foreground">Revenue</p>
                <p className="text-sm font-bold text-emerald-400">{fmtUsd(topPerformer.revenue)}</p>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-[10px] text-indigo-300 font-medium mb-0.5">Why it worked</p>
              <p className="text-[11px] text-muted-foreground">{topPerformer.whyItWorked}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <CardTitle className="text-sm font-medium">Anomaly Alerts</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{anomalyAlerts.length} active</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {anomalyAlerts.map((alert: any) => (
              <div key={alert.id} className={`p-3 rounded-lg border ${alert.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {alert.severity === "warning"
                      ? <AlertTriangle className="w-3 h-3 text-yellow-400" />
                      : <Info className="w-3 h-3 text-blue-400" />}
                    <Badge variant="outline" className="text-[10px]">{alert.brand}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{alert.time}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{alert.message}</p>
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[10px]"><span className="text-muted-foreground">{alert.metric}: </span><span className="font-medium">{alert.value}</span></span>
                  <span className="text-[10px] text-muted-foreground">vs. {alert.baseline} baseline</span>
                </div>
              </div>
            ))}
            {anomalyAlerts.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">No anomalies detected today</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Live NBA Pipeline Execution (real Anthropic LLM run) */}
      <NBAPipelineSection />

      {/* Row 6 — Agent Pipeline Run Log (sourced from real agent_runtime_runs) */}
      <AgentPipelineRunLog />
    </div>
  );
}
