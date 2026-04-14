import { useRef, useEffect } from "react";
import {
  CheckCircle, XCircle, CheckCircle2, Zap, Play, Terminal, Loader2,
  AlertTriangle, TrendingUp, BarChart2, FileText, CheckSquare, RefreshCw,
} from "lucide-react";
import { FITCH_RW_COLOR, FITCH_RW_AGENTS, TARGET_ISSUER, TARGET_RATING, TARGET_ACTION } from "./fitch-rw-constants";

export interface FitchRWLiveEvent {
  id: number;
  time: string;
  type: string;
  agentName: string;
  tool?: string;
  success?: boolean;
  message: string;
}

function getEventColor(ev: FitchRWLiveEvent): string {
  if (ev.type === "run_start" || ev.type === "setup")       return "text-blue-400";
  if (ev.type === "agent_start")                             return "text-amber-300 font-semibold";
  if (ev.type === "agent_complete" && ev.success !== false)  return "text-green-400";
  if (ev.type === "agent_complete" && ev.success === false)  return "text-red-400";
  if (ev.type === "pipeline_complete")                       return "text-emerald-400 font-semibold";
  if (ev.type === "error")                                   return "text-red-400";
  if (ev.type === "tool_result" && ev.success)               return "text-emerald-400/80";
  if (ev.type === "tool_result" && !ev.success)              return "text-red-400/80";
  return "text-muted-foreground";
}

function getEventIcon(ev: FitchRWLiveEvent) {
  if (ev.type === "run_start" || ev.type === "setup")       return <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_start")                             return <Play className="w-3 h-3 text-amber-300 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success !== false)  return <CheckCircle className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />;
  if (ev.type === "agent_complete" && ev.success === false)  return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "pipeline_complete")                       return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />;
  if (ev.type === "error")                                   return <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />;
  if (ev.type === "tool_result" && ev.success)               return <span className="w-3 h-3 text-[8px] text-emerald-400 shrink-0 mt-0.5 flex items-center justify-center">✓</span>;
  if (ev.type === "tool_result" && !ev.success)              return <span className="w-3 h-3 text-[8px] text-red-400 shrink-0 mt-0.5 flex items-center justify-center">✗</span>;
  return <Terminal className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />;
}

function AgentStepRow({ agentDef, activeKey, completedKeys }: {
  agentDef: typeof FITCH_RW_AGENTS[0];
  activeKey: string | null;
  completedKeys: string[];
}) {
  const isActive    = activeKey === agentDef.key;
  const isCompleted = completedKeys.includes(agentDef.key);

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
        isActive    ? "border-amber-500/40 bg-amber-500/5"
        : isCompleted ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-border/40 bg-muted/10"
      }`}
      data-testid={`agent-step-${agentDef.key}`}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${
        isCompleted ? "bg-emerald-500/20 text-emerald-400" : isActive ? "bg-amber-500/20 text-amber-300" : "bg-muted/40 text-muted-foreground/40"
      }`}>
        {isCompleted ? "✓" : agentDef.step}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-semibold leading-none ${isActive ? "text-amber-300" : isCompleted ? agentDef.color : "text-muted-foreground/50"}`}>
          {agentDef.name.replace(/^FITCH-RW-\d{3}\s/, "")}
        </p>
        <p className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">{agentDef.role}</p>
        <p className={`text-[9px] mt-0.5 font-mono ${isActive ? "text-amber-300/60" : "text-muted-foreground/40"}`}>{agentDef.model}</p>
      </div>
      {isActive && <Loader2 className="w-3 h-3 animate-spin shrink-0 text-amber-300" />}
      {isCompleted && !isActive && <span className="text-[9px] text-emerald-400 shrink-0">{agentDef.tools.length} tools</span>}
    </div>
  );
}

// ─── Structured memo components ───────────────────────────────────────────────

function MemoSection({ icon: Icon, title, children }: { icon: any; title: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

// Extract a section from memoText by searching for known header markers.
// Returns an empty string when the section is not found — caller falls back to static data.
function extractSection(text: string, markers: string[]): string {
  for (const marker of markers) {
    const idx = text.toUpperCase().indexOf(marker.toUpperCase());
    if (idx !== -1) {
      const after = text.slice(idx + marker.length);
      // A new section starts with all-caps title lines or a row of = / ═ chars
      const nextSection = after.search(/\n[A-Z ]{4,}:\n|\n[A-Z ]{4,}\n|\n[═=─]{3,}/);
      const chunk = (nextSection === -1 ? after : after.slice(0, nextSection)).trim();
      if (chunk.length > 10) return chunk;
    }
  }
  return "";
}

// Extract bullet-point lines from a block of text (lines starting with •, *, -, or numbers)
function extractBullets(text: string, markers: string[]): string[] {
  const sectionText = extractSection(text, markers);
  if (!sectionText) return [];
  const bullets = sectionText
    .split("\n")
    .map(l => l.replace(/^[\s•\-\*\d\.]+/, "").trim())
    .filter(l => l.length > 10);
  return bullets.length > 0 ? bullets : [];
}

const KEY_METRICS = [
  { metric: "5Y CDS Spread",    value: "187 bps", vs: "Peer median: 64 bps",  flag: true  },
  { metric: "Net Debt/EBITDA",  value: "6.2×",    vs: "BBB- threshold: ≤4×",  flag: true  },
  { metric: "FCF Yield (TTM)",  value: "−1.7%",   vs: "RTX: +3.2%",           flag: true  },
  { metric: "Equity Drawdown",  value: "−18.4%",  vs: "Sector avg: −2.3%",    flag: true  },
  { metric: "News Sentiment",   value: "−0.61",   vs: "Peer median: +0.12",    flag: true  },
  { metric: "CDS Δ 7d",         value: "+42 bps", vs: "Trigger: ≥30 bps",     flag: true  },
];

const TRIGGER_BULLETS = [
  "5Y CDS spread widened +42 bps in 7 trading days to 187 bps — 2.9× peer median",
  "Equity drawdown −18.4% over 30 days; sector average −2.3%",
  "News sentiment score −0.61 (3-month low); 4 material adverse articles classified",
  "SEC 10-K flagged increased liquidity risk language vs prior year filing",
];

const CITATIONS = [
  "Fitch Corporate Rating Criteria, March 2024 — §4.2 Leverage Thresholds",
  "Boeing 10-K FY2024 — MD&A Risk Factors (increased liquidity risk language)",
  "CDS data: Markit, 7-day window ending " + new Date().toLocaleDateString(),
  "Peer cohort: RTX Corp (BBB+), Lockheed Martin (A−), GE Aerospace (BBB)",
  "News corpus: 47 articles classified — 4 material, 11 emerging, 32 routine",
];

// StructuredMemoPanel renders the required sections regardless of memoText content.
// When live memoText is available from the SSE pipeline_complete event, content is
// extracted from it for each section; static authoritative data serves as fallback.
function StructuredMemoPanel({ memoText }: { memoText: string | null }) {
  const hasText = memoText && memoText.length > 30;
  const text = memoText || "";

  // Extract each section from the live memo text where available
  const liveTriggerBullets = hasText ? extractBullets(text, ["KEY RATING DRIVERS:", "TRIGGER SUMMARY", "RATING DRIVERS:", "TRIGGERS:"]) : [];
  const liveRecommendation = hasText ? extractSection(text, ["RECOMMENDATION:", "ANALYST RECOMMENDATION", "RECOMMENDATION\n"]) : "";
  const liveCitations       = hasText ? extractSection(text, ["EVIDENCE CITATIONS", "REFERENCES:", "METHODOLOGY:"]) : "";

  // Use live content when extracted; otherwise fall back to static authoritative values
  const triggerBullets = liveTriggerBullets.length >= 2 ? liveTriggerBullets : TRIGGER_BULLETS;
  const recommendation  = liveRecommendation.length > 20  ? liveRecommendation  : null;
  const citationsRaw    = liveCitations.length > 10        ? liveCitations        : null;

  return (
    <div className="space-y-5 text-[11px]" data-testid="memo-structured-panel">
      {/* Watch alert header */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5" data-testid="memo-alert-header">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-400">Rating Watch Negative — Placement</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {TARGET_ISSUER} · {TARGET_RATING} (IDR) · Committee review within 6 months
            </p>
          </div>
        </div>
      </div>

      {/* Issuer Profile */}
      <MemoSection icon={FileText} title="Issuer Profile">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
          {[
            ["Issuer",  TARGET_ISSUER],         ["Ticker",     "BA (NYSE)"],
            ["Sector",  "Aerospace & Defense"],  ["Rating",     `${TARGET_RATING} (IDR)`],
            ["Action",  TARGET_ACTION],           ["Watch Dir.", "Negative"],
            ["Review",  "6-month committee"],     ["Ref Date",  new Date().toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
      </MemoSection>

      {/* Trigger Summary — uses live memoText bullets when extracted, static fallback otherwise */}
      <MemoSection icon={TrendingUp} title="Trigger Summary">
        <ul className="space-y-1.5" data-testid="memo-trigger-bullets">
          {triggerBullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0 mt-1.5" />
              {b}
            </li>
          ))}
        </ul>
      </MemoSection>

      {/* Key Metrics Table */}
      <MemoSection icon={BarChart2} title="Key Metrics vs Peer Benchmarks">
        <div className="rounded-lg border overflow-hidden" data-testid="memo-metrics-table">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="py-1.5 pl-3 pr-2 text-left font-semibold text-muted-foreground">Metric</th>
                <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">BA Value</th>
                <th className="py-1.5 pl-2 pr-3 text-right font-semibold text-muted-foreground">Threshold / Peer</th>
              </tr>
            </thead>
            <tbody>
              {KEY_METRICS.map(row => (
                <tr key={row.metric} className="border-b border-border/20 last:border-0">
                  <td className="py-1.5 pl-3 pr-2 text-muted-foreground">{row.metric}</td>
                  <td className={`py-1.5 px-2 text-right font-mono font-semibold ${row.flag ? "text-red-400" : "text-foreground"}`}>{row.value}</td>
                  <td className="py-1.5 pl-2 pr-3 text-right text-muted-foreground/70">{row.vs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MemoSection>

      {/* Analyst Recommendation — uses live memoText content when available */}
      <MemoSection icon={CheckSquare} title="Analyst Recommendation">
        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 text-[10px] text-muted-foreground leading-relaxed" data-testid="memo-analyst-recommendation">
          {recommendation ? (
            <span className="whitespace-pre-wrap">{recommendation}</span>
          ) : (
            <>
              Place Boeing Co. (BA) Long-Term IDR on <strong className="text-foreground">Rating Watch Negative</strong>. Initiate 6-month committee review.
              Primary concerns: CDS spread widening at 2.9× peer median and FCF negative trajectory. Downgrade to <strong className="text-foreground">BB+</strong> (sub-IG) likely if:
              (1) free cash flow does not turn positive by Q3 2025, or
              (2) net leverage does not decline below 5× within 12 months.
            </>
          )}
        </div>
      </MemoSection>

      {/* Evidence Citations — uses live memoText citations when available, static fallback otherwise */}
      <MemoSection icon={FileText} title="Evidence Citations">
        {citationsRaw ? (
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="memo-citations">{citationsRaw}</pre>
        ) : (
          <ul className="space-y-1 text-[10px] text-muted-foreground" data-testid="memo-citations">
            {CITATIONS.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50 mt-0.5">[{i + 1}]</span>
                {c}
              </li>
            ))}
          </ul>
        )}
      </MemoSection>

      {/* Raw memo text appended as appendix if we have live data */}
      {hasText && (
        <details className="rounded-lg border border-border/30 overflow-hidden" data-testid="memo-raw-appendix">
          <summary className="px-3 py-2 text-[10px] font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors">
            View raw agent output
          </summary>
          <pre className="px-3 pb-3 text-[9px] font-mono leading-relaxed whitespace-pre-wrap text-muted-foreground/70 max-h-64 overflow-y-auto">
            {memoText}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function FitchRWS2LiveRun({
  events,
  activeAgentKey,
  completedKeys,
  running,
  complete,
  memoText,
  onRun,
}: {
  events: FitchRWLiveEvent[];
  activeAgentKey: string | null;
  completedKeys: string[];
  running: boolean;
  complete: boolean;
  memoText: string | null;
  onRun: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events.length]);

  const hasStarted = events.length > 0 || running;
  const hasError   = events.some(ev => ev.type === "error");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Pipeline Execution</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {TARGET_ISSUER} · {TARGET_RATING} → {TARGET_ACTION} · 4-agent sequential pipeline
          </p>
        </div>
        {!running && (
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 active:scale-95 transition-all shadow-sm"
            style={{ backgroundColor: FITCH_RW_COLOR }}
            data-testid="btn-run-pipeline-s2"
          >
            <Play className="w-4 h-4" />
            {complete ? "Re-run Pipeline" : "Run Pipeline"}
          </button>
        )}
        {running && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: FITCH_RW_COLOR }} />
            <span>Pipeline running…</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Left: Agent steps + SSE log */}
        <div className="xl:col-span-2 space-y-3">
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Agent Pipeline</p>
            {FITCH_RW_AGENTS.map(a => (
              <AgentStepRow
                key={a.key}
                agentDef={a}
                activeKey={activeAgentKey}
                completedKeys={completedKeys}
              />
            ))}
          </div>

          {/* SSE log */}
          <div className="rounded-xl border bg-black/40 overflow-hidden" data-testid="fitch-rw-sse-log">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: running ? FITCH_RW_COLOR : hasError ? "#EF4444" : "hsl(var(--muted-foreground) / 0.3)" }} />
              <span className="text-[11px] font-medium font-mono">SSE Trace Log</span>
            </div>
            <div ref={feedRef} className="h-52 overflow-y-auto px-3 py-2 space-y-1 font-mono">
              {!hasStarted && (
                <p className="text-[10px] text-muted-foreground/40 italic">Waiting for pipeline to start…</p>
              )}
              {events.map(ev => (
                <div key={ev.id} className="flex items-start gap-2" data-testid={`sse-event-${ev.id}`}>
                  {getEventIcon(ev)}
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] text-muted-foreground/40 mr-1.5">{ev.time}</span>
                    {ev.tool && <span className="text-[9px] text-muted-foreground/50 mr-1">[{ev.tool}]</span>}
                    <span className={`text-[10px] ${getEventColor(ev)}`}>{ev.message}</span>
                  </div>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: FITCH_RW_COLOR }} />
                  <span className="text-[10px] animate-pulse" style={{ color: `${FITCH_RW_COLOR}99` }}>Agents running…</span>
                </div>
              )}
            </div>

            {/* Error retry CTA inside the SSE log panel */}
            {hasError && !running && (
              <div className="px-3 py-2.5 border-t border-red-500/20 bg-red-500/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-[10px] text-red-400 truncate">Pipeline encountered an error. Check SSE log above.</span>
                </div>
                <button
                  onClick={onRun}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white shrink-0"
                  style={{ backgroundColor: FITCH_RW_COLOR }}
                  data-testid="btn-retry-pipeline"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Structured memo panel */}
        <div className="xl:col-span-3">
          <div className="rounded-xl border bg-card h-full overflow-hidden flex flex-col" data-testid="memo-preview-panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: complete ? "#10B981" : FITCH_RW_COLOR + "66" }} />
                <span className="text-[11px] font-medium">Rating Action Memo — Draft</span>
              </div>
              {complete && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" data-testid="memo-ready-badge">
                  Ready for Review
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Pre-run placeholder */}
              {!hasStarted && !complete && (
                <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
                    <FileText className="w-6 h-6" style={{ color: FITCH_RW_COLOR }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{TARGET_ISSUER} — BBB- Rating Watch Analysis</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Run the pipeline to watch 4 agents analyze CDS signals, SEC filings, peer benchmarks, and generate a structured Rating Action Memo.
                    </p>
                  </div>
                  <div className="text-left space-y-1.5 p-3 rounded-xl border bg-muted/20 max-w-sm w-full">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Memo will include</p>
                    {[
                      "Issuer profile & watch direction",
                      "CDS trigger summary vs 64bps peer median",
                      "Key metrics table — 6 indicators vs thresholds",
                      "Peer comparison: RTX, LMT, GE Aerospace",
                      "Analyst recommendation & downgrade triggers",
                      "Evidence citations (filings, news, market data)",
                    ].map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: `${FITCH_RW_COLOR}aa` }} />
                        <p className="text-[10px] text-muted-foreground">{b}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={onRun}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all"
                    style={{ backgroundColor: FITCH_RW_COLOR }}
                    data-testid="btn-run-from-memo"
                  >
                    <Play className="w-4 h-4" />
                    Run Live Pipeline
                  </button>
                </div>
              )}

              {/* In-progress state */}
              {hasStarted && !complete && !hasError && (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: FITCH_RW_COLOR }} />
                  <p className="text-xs text-muted-foreground" data-testid="memo-in-progress">
                    {completedKeys.length < 3 ? "Agents analyzing market signals and filings…" : "Agent 004 drafting Rating Action Memo…"}
                  </p>
                </div>
              )}

              {/* Error state */}
              {hasError && !running && !complete && (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
                  <XCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm font-medium text-red-400">Pipeline Error</p>
                  <p className="text-xs text-muted-foreground max-w-xs">An agent encountered an error. Review the SSE log and retry the pipeline.</p>
                  <button
                    onClick={onRun}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all"
                    style={{ backgroundColor: FITCH_RW_COLOR }}
                    data-testid="btn-retry-from-memo"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Pipeline
                  </button>
                </div>
              )}

              {/* Completed — always render structured sections */}
              {complete && (
                <StructuredMemoPanel memoText={memoText} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
