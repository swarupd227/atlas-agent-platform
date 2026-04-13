import { useQuery } from "@tanstack/react-query";
import { ExternalLink, CheckCircle2, AlertCircle, Clock, Loader2, Wrench, Hash } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { FITCH_RW_AGENTS, FITCH_RW_COLOR } from "./fitch-rw-constants";

const TOOL_LABELS: Record<string, string> = {
  get_cds_spreads:           "CDS Spread Ingest — 8 issuers, 7-day window",
  get_equity_prices:         "Equity Price Pull — 30-day trailing",
  get_news_sentiment:        "News NLP Scoring — 47 articles classified",
  get_credit_watch_signals:  "Credit Watch Signal Scan — threshold breach detection",
  get_filing_extracts:       "SEC Filing Extraction — 10-K & 10-Q, FY2024",
  get_financial_ratios:      "Financial Ratio Computation — leverage, coverage, liquidity",
  get_risk_factors:          "Risk Factor NLP Parse — new/strengthened language",
  get_management_discussion: "MD&A Language Analysis — YoY delta scoring",
  get_peer_cohort:           "Peer Cohort Selection — RTX, LMT, GE, HON",
  get_ratio_benchmarks:      "Ratio Benchmarking — 6 metrics vs peer median",
  get_rating_distribution:   "Rating Distribution Pull — IG corp universe",
  compute_relative_position: "Relative Position Score — 0–100 composite",
  get_validator_queue:       "Validator Queue Check — pending approvals",
  submit_rating_memo:        "Rating Memo Submission — committee draft",
  get_committee_decision:    "Committee Decision Fetch — prior actions",
  log_regulatory_disclosure: "Regulatory Disclosure Log — NI 31-103",
};

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function AgentCard({ agentDef, run, hasRun }: { agentDef: typeof FITCH_RW_AGENTS[0]; run: any | null; hasRun: boolean }) {
  const status = run?.runStatus || "idle";
  const isComplete = status === "completed" || status === "active";
  const isFailed   = status === "failed";
  const runId      = run?.runId ?? null;
  const agentId    = run?.agentId ?? null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid={`agent-card-${agentDef.key}`}>
      <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground/60">STEP {agentDef.step}</span>
            {isComplete && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                <CheckCircle2 className="w-2.5 h-2.5" />Complete
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle className="w-2.5 h-2.5" />Failed
              </span>
            )}
            {!hasRun && <span className="text-[10px] text-muted-foreground/40 italic">Not yet run</span>}
          </div>
          <p className={`text-[11px] font-semibold leading-tight ${agentDef.color}`}>{agentDef.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{agentDef.role}</p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${agentDef.bgColor} ${agentDef.color}`}>
            {agentDef.model}
          </Badge>
          {agentId && (
            <Link href={`/agents/${agentId}`}>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <ExternalLink className="w-3 h-3" />Agent
              </span>
            </Link>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Run metadata row */}
        {(runId || run?.latencyMs != null || agentDef.tools.length > 0) && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/20 border border-border/30 px-2 py-1.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Tools</p>
              <p className={`text-sm font-bold tabular-nums ${agentDef.color}`}>{agentDef.tools.length}</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/30 px-2 py-1.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Duration</p>
              <p className="text-sm font-bold tabular-nums">{formatMs(run?.latencyMs ?? null)}</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/30 px-2 py-1.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p>
              <p className={`text-sm font-bold ${isComplete ? "text-green-400" : isFailed ? "text-red-400" : "text-muted-foreground/40"}`}>
                {isComplete ? "✓" : isFailed ? "✗" : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Run ID + trace links */}
        {runId && agentId && (
          <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg border border-border/30 bg-muted/10">
            <Hash className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            <span className="text-[9px] font-mono text-muted-foreground/60 truncate flex-1" data-testid={`text-run-id-${agentDef.key}`}>Run ID: {runId}</span>
            <Link href={`/agents/${agentId}/runs/${runId}`}>
              <span className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors shrink-0" data-testid={`link-run-trace-${agentDef.key}`}>
                <ExternalLink className="w-3 h-3" />View Trace
              </span>
            </Link>
          </div>
        )}

        {/* Tools list */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Tool Calls ({agentDef.tools.length})
          </p>
          <div className="space-y-1">
            {agentDef.tools.map(tool => {
              const called = isComplete;
              return (
                <div key={tool} className="flex items-start gap-2" data-testid={`tool-row-${tool}`}>
                  <Wrench className={`w-3 h-3 shrink-0 mt-0.5 ${called ? agentDef.color : "text-muted-foreground/20"}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-[10px] font-mono ${called ? "" : "text-muted-foreground/40"}`}>{tool}</span>
                    {called && (
                      <p className="text-[9px] text-muted-foreground/60 mt-0.5">{TOOL_LABELS[tool] || tool}</p>
                    )}
                  </div>
                  {called && <span className="text-[9px] text-emerald-400 shrink-0 mt-0.5">✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timing footer */}
        {run?.completedAt && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <Clock className="w-3 h-3 shrink-0" />
            <span>Completed {new Date(run.completedAt).toLocaleTimeString()}</span>
          </div>
        )}

        {/* Result summary */}
        {isComplete && run?.resultSummary && Object.keys(run.resultSummary).length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-2.5 mt-1">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Result Summary</p>
            {Object.entries(run.resultSummary).slice(0, 4).map(([k, v]) => (
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
            4 agents · Boeing Co. (BA) BBB- Rating Watch Negative pipeline ·
            {hasRun ? " run trace available" : " run the pipeline to populate traces"}
          </p>
        </div>
        {hasRun && runs.some((r: any) => r.agentId) && (
          <Link href="/agents">
            <button
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all flex items-center gap-1.5"
              data-testid="btn-view-all-agents"
            >
              <ExternalLink className="w-3 h-3" />
              Agent Registry
            </button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {FITCH_RW_AGENTS.map(agentDef => {
          const run = runs.find((r: any) => r.key === agentDef.key) || null;
          return <AgentCard key={agentDef.key} agentDef={agentDef} run={run} hasRun={hasRun} />;
        })}
      </div>

      {!hasRun && (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
            <Wrench className="w-5 h-5" style={{ color: FITCH_RW_COLOR }} />
          </div>
          <p className="text-sm font-medium">No traces yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run the live pipeline to see per-agent tool calls, timings, run IDs, and result summaries.</p>
        </div>
      )}
    </div>
  );
}
