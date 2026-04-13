import { useQuery } from "@tanstack/react-query";
import { ExternalLink, CheckCircle2, AlertCircle, Clock, Loader2, Wrench } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { FITCH_RW_AGENTS, FITCH_RW_COLOR } from "./fitch-rw-constants";

const TOOL_LABELS: Record<string, string> = {
  get_cds_spreads:           "CDS Spread Ingest",
  get_equity_prices:         "Equity Price Pull",
  get_news_sentiment:        "News NLP Scoring",
  get_credit_watch_signals:  "Credit Watch Signal Scan",
  get_filing_extracts:       "SEC Filing Extraction",
  get_financial_ratios:      "Financial Ratio Computation",
  get_risk_factors:          "Risk Factor NLP Parse",
  get_management_discussion: "MD&A Language Analysis",
  get_peer_cohort:           "Peer Cohort Selection",
  get_ratio_benchmarks:      "Ratio Benchmarking",
  get_rating_distribution:   "Rating Distribution Pull",
  compute_relative_position: "Relative Position Score",
  get_validator_queue:       "Validator Queue Check",
  submit_rating_memo:        "Rating Memo Submission",
  get_committee_decision:    "Committee Decision Fetch",
  log_regulatory_disclosure: "Regulatory Disclosure Log",
};

function AgentCard({ agentDef, run, hasRun }: { agentDef: typeof FITCH_RW_AGENTS[0]; run: any | null; hasRun: boolean }) {
  const status = run?.runStatus || "idle";
  const isComplete = status === "completed" || status === "active";
  const isFailed = status === "failed";

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid={`agent-card-${agentDef.key}`}>
      <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground">STEP {agentDef.step}</span>
            {isComplete && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"><CheckCircle2 className="w-2.5 h-2.5" />Complete</span>}
            {isFailed && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20"><AlertCircle className="w-2.5 h-2.5" />Failed</span>}
            {!hasRun && <span className="text-[10px] text-muted-foreground/50">Not yet run</span>}
          </div>
          <p className={`text-[11px] font-semibold leading-tight ${agentDef.color}`}>{agentDef.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{agentDef.role}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${agentDef.bgColor} ${agentDef.color} border-current/20`}>
            {agentDef.model}
          </Badge>
          {run?.agentId && (
            <Link href={`/agents/${run.agentId}`}>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <ExternalLink className="w-3 h-3" />View Agent
              </span>
            </Link>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Knowledge bases */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Knowledge Bases</p>
          <div className="flex flex-wrap gap-1">
            {run?.knowledgeBases?.length > 0
              ? run.knowledgeBases.map((kb: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-muted/40 border border-border/40 text-muted-foreground">{kb}</span>
                ))
              : ["Rating Methodology Library", "Historical Rating Actions DB"].slice(0, agentDef.step <= 2 ? 2 : 1).map((kb, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-muted/40 border border-border/40 text-muted-foreground">{kb}</span>
                ))
            }
          </div>
        </div>

        {/* Tools */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Tools Called ({agentDef.tools.length})
          </p>
          <div className="space-y-1">
            {agentDef.tools.map(tool => {
              const called = isComplete;
              return (
                <div key={tool} className="flex items-center gap-2" data-testid={`tool-row-${tool}`}>
                  <Wrench className={`w-3 h-3 shrink-0 ${called ? agentDef.color : "text-muted-foreground/30"}`} />
                  <span className={`text-[10px] font-mono ${called ? "" : "text-muted-foreground/50"}`}>{tool}</span>
                  {called && (
                    <span className="text-[9px] text-muted-foreground/60 ml-auto">{TOOL_LABELS[tool] || tool}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timing */}
        {run?.completedAt && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <Clock className="w-3 h-3 shrink-0" />
            <span>Completed · {new Date(run.completedAt).toLocaleTimeString()}</span>
            {run.durationMs && <span className="ml-auto">{(run.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )}

        {/* Result summary highlight */}
        {isComplete && run?.resultSummary && (
          <div className="rounded-lg border bg-muted/20 p-2.5 mt-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Result Summary</p>
            {Object.entries(run.resultSummary).slice(0, 3).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2 py-0.5">
                <span className="text-[10px] text-muted-foreground">{k.replace(/_/g, " ")}</span>
                <span className="text-[10px] font-medium text-right">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FitchRWS3AgentTraces({ hasRun }: { hasRun: boolean }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/fitch-rw/agent-runs"],
    refetchInterval: 15000,
  });
  const runs: any[] = data?.agentRuns || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Agent Registry · Execution Traces</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            4 agents · Boeing Co. (BA) BBB- Rating Watch Negative pipeline
            {hasRun ? " — most recent run results shown" : " — run the pipeline to populate traces"}
          </p>
        </div>
        {runs.length > 0 && runs[0]?.agentId && (
          <Link href={`/agents/${runs[0].agentId}`}>
            <button
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center gap-1.5"
              data-testid="btn-view-all-agents"
            >
              <ExternalLink className="w-3 h-3" />
              View in Agent Registry
            </button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {FITCH_RW_AGENTS.map(agentDef => {
          const run = runs.find((r: any) => r.key === agentDef.key) || null;
          return (
            <AgentCard key={agentDef.key} agentDef={agentDef} run={run} hasRun={hasRun} />
          );
        })}
      </div>

      {!hasRun && (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
            <Wrench className="w-5 h-5" style={{ color: FITCH_RW_COLOR }} />
          </div>
          <p className="text-sm font-medium">No traces yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run the live pipeline to see per-agent tool calls, timings, and result summaries.</p>
        </div>
      )}
    </div>
  );
}
