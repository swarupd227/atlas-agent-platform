import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Bot, Database, Activity, AlertTriangle, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import {
  FITCH_AGENTS, FITCH_MCP_SERVERS, FITCH_BANKS, FITCH_RISK_TIER_COLORS,
  useFitchPipeline, type FitchPipelineState,
} from "./fitch-constants";
import FitchEmptyState from "./fitch-empty-state";

interface Props {
  onScreenChange: (screen: number) => void;
}

function AgentPipelinePanel({ state }: { state: FitchPipelineState }) {
  const isRunning = state.status === "running";
  const isComplete = state.status === "complete";

  return (
    <Card className="border-rose-500/20 bg-rose-500/[0.02]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-rose-400" />
          <CardTitle className="text-sm font-medium">Live Pipeline — 6 AI Agents</CardTitle>
          <Badge variant="secondary" className="text-[10px]">4 MCP Servers · 15 Tools</Badge>
          {isRunning && <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">⬤ Running…</Badge>}
          {isComplete && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30">✓ Complete</Badge>}
        </div>
        <p className="text-[11px] text-muted-foreground">
          FFIEC ingest → ratio engine → transcript NLP → news signals → composite scoring → report assembly.
          2–4 min total. All screens populate from live AI agent output.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-rose-400/60" />
            </div>
            <p className="text-sm text-muted-foreground">Click <span className="text-rose-400 font-medium">▶ Run Pipeline</span> above to start live AI agent execution</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Each agent calls real MCP tools and produces structured JSON output</p>
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
                <div
                  key={agent.role}
                  className={`rounded-lg border p-2.5 transition-all ${isCurrent ? `${agent.borderColor} ${agent.bgColor}` : isDone ? "border-border/30 bg-background/20" : "border-border/20 opacity-40"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-green-400" : isCurrent ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                    <span className={`text-[11px] font-medium ${agent.color}`}>{agent.name}</span>
                    {isCurrent && <span className="text-[9px] text-amber-400 animate-pulse ml-1">Processing…</span>}
                    {isDone && <CheckCircle2 className="w-3 h-3 text-green-400 ml-auto" />}
                    {tools.length > 0 && !isDone && <span className="text-[9px] text-muted-foreground/50 ml-auto">{tools.length} tool{tools.length !== 1 ? "s" : ""} called</span>}
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
          <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[11px] text-rose-400">
            {state.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FitchS1CommandCenter({ onScreenChange }: Props) {
  const { state } = useFitchPipeline();

  const riskScorerResult = state.results.find(r => r.role === "risk_scorer");
  const scores: Record<string, any> = riskScorerResult?.resultSummary?.scores ?? {};
  const watchList: string[] = riskScorerResult?.resultSummary?.watchList ?? [];
  const redAlerts: string[] = riskScorerResult?.resultSummary?.redAlerts ?? [];
  const hasResults = !!riskScorerResult;

  return (
    <div className="flex flex-col gap-4">
      {/* MCP Server registry */}
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
      <AgentPipelinePanel state={state} />

      {/* Risk Dashboard — 10-bank composite scores (live from risk_scorer) */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <CardTitle className="text-sm font-medium">10-Bank Composite Risk Scores</CardTitle>
            {hasResults && (
              <Badge className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/30 ml-auto">
                Live — from Composite Risk Scorer
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Composite CAMELS-enhanced score (0–100) for the G-SIB cohort. Scores &gt; 75 trigger Red alerts.
          </p>
        </CardHeader>
        <CardContent>
          {!hasResults ? (
            <FitchEmptyState
              agentName="Composite Risk Scorer"
              agentRole="risk_scorer"
              description="Run the pipeline to generate composite risk scores for all 10 banks."
              onGoToCommandCenter={() => onScreenChange(1)}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="fitch-s1-risk-grid">
              {FITCH_BANKS.map((bank) => {
                const s = scores[bank.name] ?? {};
                const score: number = s.score ?? 0;
                const tier: keyof typeof FITCH_RISK_TIER_COLORS = s.tier ?? "Green";
                const trajectory: string = s.trajectory ?? "Stable";
                const delta: number = s.delta ?? 0;
                const colors = FITCH_RISK_TIER_COLORS[tier] ?? FITCH_RISK_TIER_COLORS.Green;

                const TrajIcon = trajectory === "Improving" ? TrendingDown : trajectory === "Deteriorating" ? TrendingUp : Minus;

                return (
                  <Card
                    key={bank.id}
                    data-testid={`fitch-bank-card-${bank.id}`}
                    className={`border ${colors.border} ${score >= 75 ? "bg-red-500/[0.04]" : ""}`}
                  >
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] text-muted-foreground truncate mb-1">{bank.name}</p>
                      <p className={`text-2xl font-bold ${colors.text}`}>{score}</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>{tier}</span>
                        <TrajIcon className={`w-3 h-3 ${colors.text}`} />
                      </div>
                      {delta !== 0 && (
                        <p className={`text-[9px] mt-1 ${delta > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)} QoQ
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {hasResults && (watchList.length > 0 || redAlerts.length > 0) && (
            <div className="mt-4 flex gap-4 flex-wrap">
              {redAlerts.length > 0 && (
                <div className="flex-1 min-w-[200px] p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <p className="text-[10px] font-semibold text-rose-400 mb-1">Red Alerts</p>
                  {redAlerts.map(b => (
                    <div key={b} className="text-[11px] text-rose-300">• {b}</div>
                  ))}
                </div>
              )}
              {watchList.length > 0 && (
                <div className="flex-1 min-w-[200px] p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[10px] font-semibold text-amber-400 mb-1">Watch List</p>
                  {watchList.map(b => (
                    <div key={b} className="text-[11px] text-amber-300">• {b}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
