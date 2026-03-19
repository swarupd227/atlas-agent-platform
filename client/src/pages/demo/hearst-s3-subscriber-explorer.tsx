import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ChevronDown, Check, AlertTriangle, Pause, User,
  ChevronRight, Bot, Database, ExternalLink, Clock,
  CheckCircle2, XCircle,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from "recharts";

const PERSONAS = [
  { id: "sarah-m",    label: "Sarah M. — New York, NY",    tier: "Premium", stage: "Engaged Reader" },
  { id: "marcus-t",   label: "Marcus T. — Chicago, IL",    tier: "Free",    stage: "At-Risk" },
  { id: "jennifer-k", label: "Jennifer K. — Austin, TX",   tier: "Premium", stage: "VIP" },
];

const STAGE_COLORS: Record<string, string> = {
  "Engaged Reader": "bg-green-500/20 text-green-400 border-green-500/30",
  "At-Risk":        "bg-red-500/20 text-red-400 border-red-500/30",
  VIP:              "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "New Subscriber": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};
const ENGAGEMENT_COLORS: Record<string, string> = {
  HIGH: "text-green-400", MEDIUM: "text-yellow-400", LOW: "text-red-400", BROWSE_ONLY: "text-muted-foreground",
};

const STEP_COLORS = [
  "border-indigo-500/40 bg-indigo-500/[0.03]",
  "border-violet-500/40 bg-violet-500/[0.03]",
  "border-blue-500/40 bg-blue-500/[0.03]",
  "border-cyan-500/40 bg-cyan-500/[0.03]",
];
const STEP_ICON_COLORS = ["text-indigo-400", "text-violet-400", "text-blue-400", "text-cyan-400"];
const STEP_NUM_COLORS  = ["bg-indigo-500/20 text-indigo-300", "bg-violet-500/20 text-violet-300", "bg-blue-500/20 text-blue-300", "bg-cyan-500/20 text-cyan-300"];

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold w-8 text-right">{score}</span>
    </div>
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

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000)    return `${ms}ms`;
  if (ms < 60000)   return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

interface TraceStep {
  key: string;
  order: number;
  agentId: string;
  agentName: string;
  traceId: string | null;
  runAt: string | null;
  latencyMs: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  toolCalls: { tool: string | null; server: string | null; durationMs: number | null; status: string | null }[];
  decisions: any;
}

function DecisionTracePanel({ subscriberId }: { subscriberId: string }) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [altExpanded, setAltExpanded] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/subscriber", subscriberId, "trace"],
    queryFn: () => fetch(`/demo-api/hearst/subscriber/${subscriberId}/trace`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-medium">Decision Trace — How This Was Decided</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const steps: TraceStep[] = data?.steps || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-400" />
          <CardTitle className="text-sm font-medium">Decision Trace — How This Was Decided</CardTitle>
          <Badge variant="secondary" className="text-[10px] ml-auto">4 agents · real run records</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Step-by-step pipeline from real platform run traces and MCP tool call spans. Click a step to expand.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const isExpanded = expandedStep === step.key;
          const hasTrace   = !!step.traceId;
          const decisionData = step.decisions as any;
          const isDecisionStep = step.key === "nbaEmailDecision";

          return (
            <div
              key={step.key}
              className={`rounded-lg border transition-all ${STEP_COLORS[i % STEP_COLORS.length]} ${hasTrace ? "cursor-pointer" : "opacity-50"}`}
              onClick={() => hasTrace && setExpandedStep(isExpanded ? null : step.key)}
            >
              {/* Collapsed / summary row */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                {/* Step number */}
                <span className={`text-[10px] font-bold w-6 h-6 rounded flex items-center justify-center shrink-0 ${STEP_NUM_COLORS[i % STEP_NUM_COLORS.length]}`}>
                  {step.order}
                </span>

                {/* Agent name + link */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Bot className={`w-3 h-3 shrink-0 ${STEP_ICON_COLORS[i % STEP_ICON_COLORS.length]}`} />
                    <Link href={`/agents/${step.agentId}`} onClick={e => e.stopPropagation()}>
                      <span className={`text-[11px] font-semibold hover:underline ${STEP_ICON_COLORS[i % STEP_ICON_COLORS.length]}`}>
                        {step.agentName}
                      </span>
                    </Link>
                    <Link href={`/agents/${step.agentId}`} onClick={e => e.stopPropagation()}>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 hover:text-foreground" />
                    </Link>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-1">{step.outputSummary || "—"}</p>
                </div>

                {/* Metadata chips */}
                <div className="flex items-center gap-2 shrink-0">
                  {step.runAt && (
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{formatRelative(step.runAt)}</span>
                    </div>
                  )}
                  {step.toolCalls.length > 0 && (
                    <span className="text-[9px] text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">
                      {step.toolCalls.length} tool {step.toolCalls.length === 1 ? "call" : "calls"}
                    </span>
                  )}
                  {hasTrace && (
                    <ChevronRight className={`w-3 h-3 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && hasTrace && (
                <div className="px-3 pb-3 flex flex-col gap-3 border-t border-border/30 mt-0 pt-3">
                  {/* MCP Tool Calls */}
                  {step.toolCalls.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        MCP Tool Calls ({step.toolCalls.length})
                      </p>
                      <div className="flex flex-col gap-1">
                        {step.toolCalls.map((tc, ti) => (
                          <div key={ti} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-background/60 border border-border/30">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.status === "ok" ? "bg-green-400" : "bg-red-400"}`} />
                              <span className="font-mono font-medium text-foreground/90">{tc.tool}</span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground/60">
                              <span className="truncate max-w-[180px]">{tc.server}</span>
                              {tc.durationMs && <span>{formatMs(tc.durationMs)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Decision-agent specific: scoring formula + factors */}
                  {isDecisionStep && decisionData && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">NBEmail_Score Decision</p>
                      <div className={`p-2 rounded-lg text-center font-bold text-xs mb-2 ${decisionData.action === "SEND" ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"}`}>
                        {decisionData.action === "SEND" ? (
                          <>SEND — {decisionData.winningEmail?.brand}: "{decisionData.winningEmail?.subject}"</>
                        ) : (
                          <>HOLD — Score {decisionData.nbEmailScore?.toFixed(2)} &lt; threshold {decisionData.holdThreshold}</>
                        )}
                      </div>
                      {decisionData.scoringFactors && (
                        <div className="flex flex-col gap-1">
                          {decisionData.scoringFactors.map((f: any, fi: number) => (
                            <div key={fi} className="flex items-start justify-between text-[10px] gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="text-muted-foreground font-mono">{f.label}</span>
                                <p className="text-[9px] text-muted-foreground/50 mt-0.5">{f.detail}</p>
                              </div>
                              <span className={`font-bold shrink-0 ${(f.contribution ?? f.score) < 0 ? "text-red-400" : "text-green-400"}`}>
                                {(f.contribution ?? f.score) > 0 ? "+" : ""}{(f.contribution ?? f.score).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/30 mt-1">
                            <span className="font-medium">NBEmail_Score</span>
                            <span className="font-bold">{decisionData.nbEmailScore?.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      {decisionData.holdReason && (
                        <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/20">
                          <p className="text-[10px] text-orange-300 leading-snug">{decisionData.holdReason}</p>
                        </div>
                      )}
                      {decisionData.alternativesConsidered && decisionData.alternativesConsidered.length > 0 && (
                        <div className="mt-2 rounded-lg border border-border/30 overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-2 py-1.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
                            onClick={(e) => { e.stopPropagation(); setAltExpanded(v => !v); }}
                          >
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              Alternatives Considered ({decisionData.alternativesConsidered.length})
                            </span>
                            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${altExpanded ? "rotate-180" : ""}`} />
                          </button>
                          {altExpanded && (
                            <div className="flex flex-col divide-y divide-border/20">
                              {decisionData.alternativesConsidered.map((alt: any) => (
                                <div key={alt.rank} className="px-2 py-1.5 bg-muted/10">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground shrink-0">
                                      #{alt.rank} {alt.brand}
                                    </span>
                                    <p className="text-[9px] text-foreground/60 italic truncate flex-1">"{alt.subject}"</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[9px] text-muted-foreground shrink-0 w-20">NBEmail_Score</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-amber-400/70"
                                        style={{ width: `${Math.round(alt.nbEmailScore * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold text-amber-400 shrink-0 w-8 text-right">
                                      {alt.nbEmailScore.toFixed(2)}
                                    </span>
                                  </div>
                                  <p className="text-[9px] text-muted-foreground leading-snug">{alt.lossReason}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generic output summary for non-decision agents */}
                  {!isDecisionStep && step.inputSummary && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">Input: </span>{step.inputSummary}
                    </div>
                  )}
                  {!isDecisionStep && step.outputSummary && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">Output: </span>{step.outputSummary}
                    </div>
                  )}

                  {/* Run metadata */}
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground/40 pt-1">
                    <span>Run: {step.traceId?.slice(0, 8)}…</span>
                    <span>Latency: {formatMs(step.latencyMs)}</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                      <span className="text-green-400">completed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function Screen3SubscriberExplorer() {
  const [selectedPersona, setSelectedPersona] = useState("sarah-m");
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideBrand, setOverrideBrand] = useState("");
  const [overrideSubject, setOverrideSubject] = useState("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/subscriber", selectedPersona],
    queryFn: () => fetch(`/demo-api/hearst/subscriber/${selectedPersona}`).then(r => r.json()),
  });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/demo-api/hearst/subscriber/${selectedPersona}/override`, {
        brand: overrideBrand,
        subject: overrideSubject,
        reason: "Marketer override via demo",
      });
      return res.json();
    },
    onSuccess: (result) => {
      toast({ title: "Override logged", description: result.message });
      setShowOverride(false);
    },
  });

  const persona = PERSONAS.find(p => p.id === selectedPersona) || PERSONAS[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          {data ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{data.name}</h2>
                <Badge className={`text-[10px] ${STAGE_COLORS[data.lifecycleStage] || "bg-muted"}`}>{data.lifecycleStage}</Badge>
                <Badge variant="secondary" className="text-[10px]">{data.tier}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{data.location}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{persona.label}</p>
          )}
        </div>
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setShowPersonaMenu(v => !v)} className="gap-1">
            Switch Subscriber <ChevronDown className="w-3 h-3" />
          </Button>
          {showPersonaMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[220px]">
              {PERSONAS.map(p => (
                <button key={p.id} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                  onClick={() => { setSelectedPersona(p.id); setShowPersonaMenu(false); }}>
                  <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-[12px]">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground">{p.tier} · {p.stage}</p>
                  </div>
                  {p.id === selectedPersona && <Check className="w-3 h-3 text-primary ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading subscriber profile…</div>
      ) : (
        <>
          {/* Engagement Health */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-24">Engagement Health</span>
            <HealthBar score={data.healthScore} />
          </div>

          {/* Panels 1–3 */}
          <div className="grid grid-cols-[30%_40%_30%] gap-4">
            {/* Panel 1 — Brand Subscription Map */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Brand Subscriptions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.brandMap.map((b: any) => (
                  <div key={b.brand} className={`p-2 rounded-lg border ${b.optedIn ? "bg-card" : "bg-muted/20 opacity-60"}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                        {b.brand}
                      </span>
                      {b.optedIn ? <Check className="w-3 h-3 text-green-400" /> : <span className="text-[9px] text-muted-foreground">Browse only</span>}
                    </div>
                    {b.optedIn && (
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                        <span>Last open: {b.lastOpen}</span>
                        <span className={`font-medium ${ENGAGEMENT_COLORS[b.engagement] || ""}`}>{b.engagement}</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Panel 2 — Content Affinity Radar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Content Affinity</CardTitle>
                <p className="text-[10px] text-muted-foreground">Interest intensity by topic cluster</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={data.affinityRadar}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="topic" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Radar name="Affinity" dataKey="score" stroke="#6366F1" fill="#6366F1" fillOpacity={0.35} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Affinity"]} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Panel 3 — NBA Decision */}
            <Card className={`${data.todayDecision.action === "SEND" ? "border-green-500/30 bg-green-500/[0.02]" : "border-orange-500/30 bg-orange-500/[0.02]"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {data.todayDecision.action === "SEND"
                    ? <Check className="w-4 h-4 text-green-400" />
                    : <Pause className="w-4 h-4 text-orange-400" />}
                  <CardTitle className="text-sm font-medium">Today's Decision</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className={`p-2 rounded-lg text-center font-bold text-sm ${data.todayDecision.action === "SEND" ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"}`}>
                  {data.todayDecision.action === "SEND" ? "SEND" : "HOLD"}
                </div>
                {data.todayDecision.action === "SEND" ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-medium">{data.todayDecision.brand}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{data.todayDecision.subject}</p>
                    <p className="text-[10px] text-muted-foreground">⏱ {data.todayDecision.sendTime}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground leading-snug">{data.todayDecision.holdReason}</p>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">NBEmail Score</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${data.todayDecision.nbEmailScore * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-bold">{data.todayDecision.nbEmailScore.toFixed(2)}</span>
                </div>
                <p className="text-[9px] text-muted-foreground">HOLD threshold: {data.todayDecision.holdThreshold}</p>

                <div className="flex flex-col gap-1 pt-1 border-t border-border/50">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Scoring factors</p>
                  {data.todayDecision.factors.map((f: any) => (
                    <div key={f.label}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className={`font-medium ${f.score < 0 ? "text-red-400" : "text-green-400"}`}>
                          {f.score > 0 ? "+" : ""}{f.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/60">{f.detail}</p>
                    </div>
                  ))}
                </div>

                <Button variant="outline" size="sm" className="w-full text-xs mt-1" onClick={() => setShowOverride(true)}>
                  Override Decision
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Panel 4 — Decision Trace (sourced from real run_traces + trace_spans) */}
          <DecisionTracePanel subscriberId={selectedPersona} />

          {/* Panel 5 — Engagement Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">30-Day Engagement Timeline</CardTitle>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400" /> Email open</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> Website visit</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Subscription event</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-0.5 overflow-x-auto pb-1">
                {data.timeline.map((day: any, i: number) => (
                  <div key={i} className="flex flex-col items-center gap-0.5 min-w-[28px]">
                    <div className="flex flex-col gap-0.5 h-10">
                      {day.events.map((ev: any, ei: number) => (
                        <div key={ei} title={`${day.date}: ${ev.label}${ev.brand ? ` (${ev.brand})` : ""}`}
                          className={`w-2.5 h-2.5 rounded-full ${ev.type === "open" ? "bg-indigo-400" : ev.type === "visit" ? "bg-slate-400" : "bg-yellow-400"}`} />
                      ))}
                    </div>
                    {i % 7 === 0 && <span className="text-[8px] text-muted-foreground/50 mt-0.5 rotate-45 origin-left">{day.date}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Override Dialog */}
      <Dialog open={showOverride} onOpenChange={setShowOverride}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override NBA Decision</DialogTitle>
            <DialogDescription>
              Manually select an email for {data?.name}. This override will be logged and Atlas will learn from it to improve future recommendations.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Brand</label>
              <input value={overrideBrand} onChange={e => setOverrideBrand(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="e.g. Good Housekeeping" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Email Subject</label>
              <input value={overrideSubject} onChange={e => setOverrideSubject(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="e.g. Weekend Home Projects" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowOverride(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => overrideMutation.mutate()} disabled={!overrideBrand || !overrideSubject || overrideMutation.isPending}>
                {overrideMutation.isPending ? "Logging…" : "Log Override"}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-indigo-300">Atlas will record this override as a training signal. Model weights update weekly to incorporate marketer feedback.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
