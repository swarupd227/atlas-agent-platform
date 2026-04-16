import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, CheckCircle2, XCircle, Clock, Activity } from "lucide-react";
import { ONESPAN_AGENTS, ONESPAN_COLOR, ONESPAN_ACCENT } from "./onespan-constants";

interface AgentRunRecord {
  key: string;
  agentId: string | null;
  agentName: string;
  step: number;
  agentStatus: string;
  runId: string | null;
  runStatus: string;
  triggerType: string | null;
  latencyMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: Record<string, unknown> | null;
}

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "success" || status === "completed")
    return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />Done</span>;
  if (status === "running")
    return <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 animate-pulse"><Activity className="w-3 h-3" />Running</span>;
  if (status === "failed")
    return <span className="inline-flex items-center gap-1 text-[10px] text-red-400"><XCircle className="w-3 h-3" />Failed</span>;
  if (status === "idle" || !status)
    return <span className="text-[10px] text-muted-foreground/40">Idle</span>;
  return <span className="text-[10px] text-muted-foreground">{status}</span>;
}

function ToolCallList({ tools }: { tools: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tools.map((t, i) => (
        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-muted/30 text-muted-foreground/70 border border-border/40">{t}</span>
      ))}
    </div>
  );
}

function SummaryKV({ summary }: { summary: Record<string, unknown> | null }) {
  if (!summary || typeof summary !== "object") return null;
  const entries = Object.entries(summary).filter(([, v]) => v != null && v !== "" && typeof v !== "object").slice(0, 6);
  if (!entries.length) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2 text-[10px]">
          <span className="text-muted-foreground/50 font-mono shrink-0">{k.replace(/_/g, " ")}:</span>
          <span className="text-foreground/80 truncate">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OnespanS3AgentTraces({ hasRun }: { hasRun: boolean }) {
  const { data, isLoading } = useQuery<{ agentRuns: AgentRunRecord[]; scenario: string }>({
    queryKey: ["/demo-api/onespan/agent-runs"],
    refetchInterval: hasRun ? 15000 : false,
  });

  const runs = data?.agentRuns ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" data-testid="heading-traces">Agent Traces — Runtime Registry</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Registered agents, last run status, and result summaries</p>
        </div>
        {data?.scenario && (
          <span className="text-[10px] text-muted-foreground/60">{data.scenario}</span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-12 justify-center">
          <div className="w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: ONESPAN_COLOR }} />
          <span className="text-sm text-muted-foreground">Loading agent registry…</span>
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="rounded-xl border border-border/50 py-16 flex flex-col items-center gap-3" data-testid="traces-empty-state">
          <Activity className="w-8 h-8 text-muted-foreground/30" />
          <span className="text-sm text-muted-foreground">Run the pipeline to populate agent traces</span>
        </div>
      )}

      <div className="space-y-3">
        {runs.map((run, idx) => {
          const agentDef = ONESPAN_AGENTS.find(a => a.key === run.key);
          return (
            <div
              key={run.key}
              className="rounded-xl border border-border/50 bg-muted/5 p-4 hover:border-border transition-colors"
              data-testid={`trace-row-${run.key}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: `${ONESPAN_COLOR}20`, color: ONESPAN_COLOR }}
                >
                  {run.step || idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {run.agentId ? (
                      <Link href={`/agents/${run.agentId}`}>
                        <span className="text-[12px] font-semibold hover:underline cursor-pointer" data-testid={`link-agent-${run.key}`}>{run.agentName}</span>
                      </Link>
                    ) : (
                      <span className="text-[12px] font-semibold">{run.agentName}</span>
                    )}
                    <RunStatusBadge status={run.runStatus} />
                    {run.agentId && (
                      <Link href={`/agents/${run.agentId}`}>
                        <ExternalLink className="w-3 h-3 text-muted-foreground/40 hover:text-foreground cursor-pointer" data-testid={`link-agent-ext-${run.key}`} />
                      </Link>
                    )}
                    {run.runId && (
                      <Link href={`/runs/${run.runId}`}>
                        <span className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground cursor-pointer transition-colors" data-testid={`link-run-${run.key}`}>
                          #{run.runId.slice(0, 8)}
                        </span>
                      </Link>
                    )}
                  </div>

                  {agentDef && <p className="text-[10px] text-muted-foreground mt-0.5">{agentDef.role}</p>}

                  <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatLatency(run.latencyMs)}</span>
                    {run.startedAt && <span>Started {formatTime(run.startedAt)}</span>}
                    {run.completedAt && <span>Ended {formatTime(run.completedAt)}</span>}
                    {run.triggerType && <span className="font-mono">{run.triggerType}</span>}
                  </div>

                  {agentDef && <ToolCallList tools={agentDef.tools} />}
                  {run.resultSummary && <SummaryKV summary={run.resultSummary} />}

                  {/* MCP servers */}
                  {agentDef && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agentDef.mcpServers.map(s => (
                        <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground/60 border border-border/40">{s}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[9px] text-muted-foreground/40 font-mono">gpt-4.1</div>
                  <div className="text-[9px] text-muted-foreground/40 mt-0.5">autonomous</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {runs.length > 0 && (
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/agents">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" data-testid="link-full-agent-registry">
              Full Agent Registry <ExternalLink className="w-3 h-3" />
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
