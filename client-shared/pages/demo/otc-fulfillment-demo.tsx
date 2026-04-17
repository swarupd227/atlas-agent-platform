import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Factory, ChevronRight, AlertTriangle, Truck, Mail, Terminal, RotateCcw, Play, FlaskConical } from "lucide-react";
import {
  useOtcFulfillmentPipeline,
  type FulfillmentLogEntry,
  OTC_FULFILLMENT_COLOR,
} from "./otc-fulfillment-constants";
import OtcFulfillmentS1Disruption from "./otc-fulfillment-s1-disruption";
import OtcFulfillmentS2Rerouting  from "./otc-fulfillment-s2-rerouting";
import OtcFulfillmentS3Comms      from "./otc-fulfillment-s3-comms";

const ACCENT = OTC_FULFILLMENT_COLOR;

const SCREENS = [
  { id: 1, label: "Disruption Assessment", shortLabel: "3.3.1 Disruption", Icon: AlertTriangle },
  { id: 2, label: "Rerouting & Tracking",  shortLabel: "3.3.2 Rerouting",  Icon: Truck        },
  { id: 3, label: "Customer Comms",        shortLabel: "3.3.3 Comms",       Icon: Mail         },
];

const LOG_TYPE_COLOR: Record<FulfillmentLogEntry["type"], string> = {
  info:      "text-sky-400",
  tool_call: "text-violet-400",
  analysis:  "text-amber-400",
  complete:  "text-emerald-400",
  error:     "text-rose-400",
};

function AgentLogPanel({ entries, open }: { entries: FulfillmentLogEntry[]; open: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, open]);

  if (!open) return null;

  return (
    <div
      className="shrink-0 border-t border-border/40 bg-black/60 backdrop-blur-sm overflow-y-auto"
      style={{ height: 192 }}
      data-testid="panel-agent-logs"
    >
      <div className="px-4 py-2 flex items-center gap-2 border-b border-border/20 sticky top-0 bg-black/80">
        <Terminal className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">Atlas Agent Log Stream</span>
        {entries.length > 0 && (
          <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">{entries.length} events</span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-3 text-[10px] font-mono text-muted-foreground/30 italic">
          Waiting for Atlas agents… press ▶ Run Atlas to begin.
        </div>
      ) : (
        <div className="px-4 py-2 flex flex-col gap-0.5">
          {entries.map((entry, i) => {
            const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
            return (
              <div key={i} className="flex items-start gap-2 leading-tight" data-testid={`log-entry-${i}`}>
                <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0 pt-px">{ts}</span>
                <span
                  className="text-[10px] font-mono shrink-0 pt-px"
                  style={{ color: `${ACCENT}cc`, minWidth: 84 }}
                >
                  [{entry.agentCode}]
                </span>
                <span className={`text-[10px] font-mono ${LOG_TYPE_COLOR[entry.type]}`}>
                  {entry.message}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

type SmokeTestStatus = "idle" | "queuing" | "queued" | "error";

export default function OtcFulfillmentDemo() {
  const [screen, setScreen]   = useState(1);
  const [logOpen, setLogOpen] = useState(false);
  const { state, start, reset } = useOtcFulfillmentPipeline();
  const lastAdvancedRef = useRef(0);
  const [smokeStatus, setSmokeStatus] = useState<SmokeTestStatus>("idle");
  const [smokeJobId, setSmokeJobId]   = useState<string | null>(null);
  const [smokeError, setSmokeError]   = useState<string | null>(null);

  const runSmokeTest = async () => {
    setSmokeStatus("queuing");
    setSmokeJobId(null);
    setSmokeError(null);
    try {
      const res = await fetch("/api/otc-fulfillment/smoke-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSmokeError(data.error || "Failed to queue smoke test");
        setSmokeStatus("error");
      } else {
        setSmokeJobId(data.jobId);
        setSmokeStatus("queued");
        setTimeout(() => setSmokeStatus("idle"), 6000);
      }
    } catch (err: unknown) {
      setSmokeError(err instanceof Error ? err.message : "Network error");
      setSmokeStatus("error");
    }
  };

  const isRunning  = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const isComplete = state.phase === "complete";
  const isError    = state.phase === "error";

  // Auto-open log panel when run starts
  useEffect(() => {
    if (isRunning) setLogOpen(true);
  }, [isRunning]);

  // Auto-advance screens as pipeline phase changes
  useEffect(() => {
    if (state.phase === "rerouting" && screen === 1 && lastAdvancedRef.current < 2) {
      const t = setTimeout(() => { lastAdvancedRef.current = 2; setScreen(2); }, 1400);
      return () => clearTimeout(t);
    }
    if (state.phase === "notification" && screen === 2 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 1400);
      return () => clearTimeout(t);
    }
    if (isComplete && screen < 3 && lastAdvancedRef.current < 3) {
      const t = setTimeout(() => { lastAdvancedRef.current = 3; setScreen(3); }, 1400);
      return () => clearTimeout(t);
    }
  }, [state.phase, screen, isComplete]);

  const getScreenStatus = (id: number): "active" | "complete" | "available" | "locked" => {
    if (id === screen) return "active";
    if (isComplete) return id < screen ? "complete" : "available";
    if (id === 1) return screen > 1 ? "complete" : "available";
    if (id === 2) {
      const unlocked = state.phase === "rerouting" || state.phase === "notification" || isComplete;
      if (!unlocked) return "locked";
      return screen > 2 ? "complete" : "available";
    }
    if (id === 3) {
      const unlocked = state.phase === "notification" || isComplete;
      if (!unlocked) return "locked";
      return "available";
    }
    return id < screen ? "complete" : "locked";
  };

  const handleReset = () => {
    lastAdvancedRef.current = 0;
    setScreen(1);
    reset();
  };

  const agt005Running = state.agents.find(a => a.code === "OTC-AGT-005")?.status === "running";
  const agt007Running = state.agents.find(a => a.code === "OTC-AGT-007")?.status === "running";
  const agt012Running = state.agents.find(a => a.code === "OTC-AGT-012")?.status === "running";

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">

      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm px-6 py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}30` }}
          >
            <Factory className="w-4 h-4" style={{ color: ACCENT }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground">Fulfillment Exception Command Center</h1>
            <p className="text-[10px] text-muted-foreground">
              NovaTech Industries · Winter Storm Stella · OTC-AGT-005 · OTC-AGT-007 · OTC-AGT-012
            </p>
          </div>

          {/* Screen tabs */}
          <div className="flex items-center gap-1 ml-auto">
            {SCREENS.map((s, i) => {
              const status   = getScreenStatus(s.id);
              const isActive = status === "active";
              const isDone   = status === "complete";
              const isLocked = status === "locked";
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                    data-testid={`screen-tab-${s.id}`}
                    onClick={() => !isLocked && setScreen(s.id)}
                    disabled={isLocked}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      isActive
                        ? "border"
                        : isDone
                        ? "bg-green-500/10 border border-green-500/20 text-green-400/70 hover:text-green-400"
                        : isLocked
                        ? "opacity-30 cursor-not-allowed text-muted-foreground"
                        : "border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                    }`}
                    style={isActive
                      ? { background: `${ACCENT}15`, borderColor: `${ACCENT}35`, color: ACCENT }
                      : {}
                    }
                  >
                    <s.Icon className="w-3 h-3" />
                    <span>{s.shortLabel}</span>
                    {isDone && !isActive && <span className="text-[9px]">✓</span>}
                  </button>
                  {i < SCREENS.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-border/50 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Status badges + CTA */}
          <div className="flex items-center gap-2 ml-3">
            {/* Running agents */}
            {agt005Running && (
              <Badge className="text-[9px] border animate-pulse"
                style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}35`, color: ACCENT }}>
                ⬤ AGT-005 Active
              </Badge>
            )}
            {agt007Running && (
              <Badge className="text-[9px] border animate-pulse"
                style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}35`, color: ACCENT }}>
                ⬤ AGT-007 Active
              </Badge>
            )}
            {agt012Running && (
              <Badge className="text-[9px] border animate-pulse"
                style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}35`, color: ACCENT }}>
                ⬤ AGT-012 Active
              </Badge>
            )}

            {isComplete && (
              <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                ✓ 847 Customers Notified
              </Badge>
            )}
            {isComplete && (
              <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">
                Live LLM Agents
              </Badge>
            )}
            {isError && (
              <Badge className="text-[9px] bg-rose-500/15 text-rose-400 border-rose-500/20">
                ✗ Pipeline Error
              </Badge>
            )}

            {/* Run button */}
            {!isRunning && !isComplete && !isError && (
              <button
                data-testid="button-run-atlas"
                onClick={start}
                className="flex items-center gap-1.5 text-[10px] h-7 px-3 rounded-lg font-semibold text-white"
                style={{ background: ACCENT }}
              >
                <Play className="w-3 h-3" />
                Run Atlas
              </button>
            )}

            {/* Elapsed time */}
            {(isRunning || isComplete) && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {state.metrics.elapsed_secs}s
              </span>
            )}

            {/* Log toggle */}
            <button
              data-testid="button-toggle-logs"
              onClick={() => setLogOpen(v => !v)}
              className={`flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border transition-all ${
                logOpen
                  ? "border-orange-500/30 text-orange-400 bg-orange-500/8"
                  : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
              }`}
              title="Toggle agent log stream"
            >
              <Terminal className="w-3 h-3" />
              <span className="hidden sm:inline">Logs</span>
              {state.log.length > 0 && (
                <span
                  className="text-[8px] font-mono rounded px-1"
                  style={{ background: `${ACCENT}18`, color: ACCENT }}
                >
                  {state.log.length}
                </span>
              )}
            </button>

            {/* Reset */}
            {!isRunning && (isComplete || isError) && (
              <button
                data-testid="button-reset-demo"
                onClick={handleReset}
                className="flex items-center gap-1 text-[10px] px-2 h-7 rounded-md border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all"
                title="Reset demo to initial state"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            {/* Smoke test trigger */}
            <button
              data-testid="button-run-smoke-test"
              onClick={runSmokeTest}
              disabled={smokeStatus === "queuing"}
              className={`flex items-center gap-1.5 text-[10px] h-7 px-3 rounded-md border transition-all ${
                smokeStatus === "queued"
                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/8"
                  : smokeStatus === "error"
                  ? "border-rose-500/30 text-rose-400 bg-rose-500/8"
                  : smokeStatus === "queuing"
                  ? "border-border/30 text-muted-foreground opacity-60 cursor-not-allowed"
                  : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
              }`}
              title={smokeStatus === "queued" && smokeJobId ? `Job queued: ${smokeJobId}` : smokeStatus === "error" ? (smokeError ?? "Error") : "Trigger OTC smoke test immediately"}
            >
              <FlaskConical className="w-3 h-3" />
              <span className="hidden sm:inline">
                {smokeStatus === "queuing" ? "Queuing…" : smokeStatus === "queued" ? "Queued ✓" : smokeStatus === "error" ? "Failed" : "Run Now"}
              </span>
            </button>

            <Link href="/demo">
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
                data-testid="link-back-demo-hub"
              >
                ← Demo Hub
              </button>
            </Link>
          </div>
        </div>

        {/* Pipeline progress bar */}
        {(isRunning || isComplete) && (
          <div className="mt-2 flex items-center gap-2" data-testid="pipeline-progress-bar">
            {state.agents.map((agent, i) => (
              <div key={agent.code} className="flex items-center gap-1 flex-1">
                <div
                  className="flex-1 h-1 rounded-full transition-all duration-700 overflow-hidden bg-border/30"
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: agent.status === "complete" ? "100%"
                            : agent.status === "running"  ? "60%"
                            :                               "0%",
                      background: agent.status === "complete" ? "#10b981"
                                : agent.status === "running"  ? ACCENT
                                :                               "transparent",
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono shrink-0" style={{ color:
                  agent.status === "complete" ? "#10b981" :
                  agent.status === "running"  ? ACCENT    : "#475569"
                }}>
                  {agent.code}
                  {agent.status === "complete" ? " ✓" : agent.status === "running" ? " ↻" : ""}
                </span>
                {i < state.agents.length - 1 && <ChevronRight className="w-3 h-3 text-border/40 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Screen content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {screen === 1 && <OtcFulfillmentS1Disruption state={state} />}
        {screen === 2 && <OtcFulfillmentS2Rerouting  state={state} />}
        {screen === 3 && <OtcFulfillmentS3Comms      state={state} />}
      </div>

      {/* ── Agent SSE log panel ────────────────────────────────────────────── */}
      <AgentLogPanel entries={state.log} open={logOpen} />
    </div>
  );
}
