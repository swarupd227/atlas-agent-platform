import { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Clock, Zap, Database,
  ShieldCheck, RefreshCw, Wifi, WifiOff, Play, RotateCcw, Terminal,
  ChevronDown, ChevronUp,
} from "lucide-react";

type ScenarioType = "standard" | "fraud-ring" | "self-healing";


const STAGE_ICONS: Record<string, any> = {
  Detect: AlertTriangle,
  Diagnose: Database,
  Remediate: Zap,
  Backfill: RefreshCw,
  Validate: ShieldCheck,
};

const STAGE_COLORS: Record<string, { card: string; dot: string }> = {
  Detect:    { card: "text-red-400 bg-red-500/10 border-red-500/20",       dot: "bg-red-400"    },
  Diagnose:  { card: "text-amber-400 bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400"  },
  Remediate: { card: "text-blue-400 bg-blue-500/10 border-blue-500/20",    dot: "bg-blue-400"   },
  Backfill:  { card: "text-purple-400 bg-purple-500/10 border-purple-500/20", dot: "bg-purple-400" },
  Validate:  { card: "text-green-400 bg-green-500/10 border-green-500/20", dot: "bg-green-400"  },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const LIVE_STAGES = [
  { stage: "Detect",    label: "Detecting outage",     durationMs: 6000,  detail: "Data feed heartbeat missed — 0 transactions received from Manheim SE for 3 minutes" },
  { stage: "Diagnose",  label: "Diagnosing root cause", durationMs: 9000,  detail: "API authentication token expired (confirmed by 401 response). Root cause: 24-hour token TTL not refreshed by cron job." },
  { stage: "Remediate", label: "Applying fix",          durationMs: 5000,  detail: "Auto-rotated to backup authentication credential. Manheim SE API responding normally. Feed resumed." },
  { stage: "Backfill",  label: "Backfilling 8,200 txns",durationMs: 11000, detail: "Backfill request queued for 8,200 missed transactions. SE regional valuations flagged with reduced confidence weighting pending full backfill." },
  { stage: "Validate",  label: "Validating recovery",   durationMs: 5000,  detail: "Feed health score restored to 99.2%. Valuation model confidence weight restored to full after backfill validation." },
];

type LogLevel = "info" | "warn" | "error" | "success";
interface LogEntry { id: number; time: string; level: LogLevel; msg: string; }

const STAGE_LOGS: Record<string, { delay: number; level: LogLevel; msg: string }[]> = {
  Detect: [
    { delay: 400,  level: "warn",    msg: "[MONITOR] Heartbeat check: Manheim Southeast — MISSED (0 txns in 3m window)" },
    { delay: 1400, level: "error",   msg: "[ALERT] Feed health score: 100% → 0% · Manheim Southeast unreachable" },
    { delay: 2800, level: "error",   msg: "[INCIDENT] INC-20260421-001 raised — severity: HIGH · 8,200 daily txns at risk" },
    { delay: 5000, level: "info",    msg: "[DETECT] Anomaly confirmed — dispatching self-healing pipeline" },
  ],
  Diagnose: [
    { delay: 600,  level: "info",    msg: "[DIAG] Probing Manheim SE API: GET /v2/auction/feed/status" },
    { delay: 1800, level: "error",   msg: "[DIAG] HTTP 401 Unauthorized — token mhse_tok_...a4f2 rejected" },
    { delay: 3500, level: "info",    msg: "[DIAG] Token metadata: TTL=24h · last_rotated=24h 3m ago (cron missed)" },
    { delay: 5500, level: "warn",    msg: "[DIAG] Root cause: OAuth token expiry — not infrastructure failure" },
    { delay: 8000, level: "success", msg: "[DIAG] Diagnosis complete — remediation path: credential rotation" },
  ],
  Remediate: [
    { delay: 400,  level: "info",    msg: "[REMEDIATE] Fetching backup credential from vault: MHSE_OAUTH_BACKUP" },
    { delay: 1400, level: "info",    msg: "[REMEDIATE] Rotating token: mhse_tok_...a4f2 → mhse_tok_...9c1d" },
    { delay: 2600, level: "info",    msg: "[REMEDIATE] Re-testing: GET /v2/auction/feed/status — HTTP 200 OK ✓" },
    { delay: 4200, level: "success", msg: "[REMEDIATE] Feed live — Manheim SE transactions flowing normally" },
  ],
  Backfill: [
    { delay: 400,  level: "info",    msg: "[BACKFILL] Gap window: 14:12:00Z → 14:15:47Z (3m 47s @ ~36 txns/sec)" },
    { delay: 1800, level: "info",    msg: "[BACKFILL] Requesting historical batch: 8,200 missed transactions" },
    { delay: 4200, level: "info",    msg: "[BACKFILL] Ingesting… 2,050 / 8,200 transactions processed" },
    { delay: 6500, level: "info",    msg: "[BACKFILL] Ingesting… 6,140 / 8,200 transactions processed" },
    { delay: 8500, level: "warn",    msg: "[BACKFILL] SE valuations flagged: confidence −15% pending validation" },
    { delay: 10200,level: "success", msg: "[BACKFILL] Complete — 8,200 / 8,200 transactions ingested" },
  ],
  Validate: [
    { delay: 400,  level: "info",    msg: "[VALIDATE] Running feed health check: Manheim Southeast" },
    { delay: 1400, level: "success", msg: "[VALIDATE] Feed health: 99.2% — within normal threshold" },
    { delay: 2600, level: "success", msg: "[VALIDATE] Backfill integrity confirmed: 8,200 / 8,200 verified" },
    { delay: 3800, level: "success", msg: "[VALIDATE] SE region confidence weight restored to baseline" },
    { delay: 4600, level: "success", msg: "[VALIDATE] INC-20260421-001 RESOLVED — fully automated · no analyst required" },
  ],
};

type LivePhase = "idle" | "running" | "complete";

const LOG_COLORS: Record<LogLevel, string> = {
  info:    "text-muted-foreground/80",
  warn:    "text-amber-400",
  error:   "text-red-400",
  success: "text-green-400",
};

function SystemLogPanel({ logs, show, onToggle }: { logs: LogEntry[]; show: boolean; onToggle: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, show]);

  return (
    <div className="rounded-xl border border-border/50 bg-black/40 overflow-hidden" data-testid="bb-healing-log">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors"
        data-testid="bb-healing-log-toggle"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground/60" />
          <span className="text-[11px] font-medium font-mono">System Log</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">{logs.length} entries</span>
        </div>
        {show ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </button>
      {show && (
        <div ref={scrollRef} className="h-36 overflow-y-auto px-3 py-2 space-y-0.5 font-mono">
          {logs.length === 0 && (
            <p className="text-[10px] text-muted-foreground/40 italic">Waiting for system events…</p>
          )}
          {logs.map(entry => (
            <div key={entry.id} className="flex items-start gap-2" data-testid={`bb-log-entry-${entry.id}`}>
              <span className="text-[9px] text-muted-foreground/40 shrink-0 mt-px">{entry.time}</span>
              <span className={`text-[10px] leading-snug ${LOG_COLORS[entry.level]}`}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveSelfHealingDemo() {
  const [phase, setPhase]             = useState<LivePhase>("idle");
  const [stageIdx, setStageIdx]       = useState(-1);
  const [stageStart, setStageStart]   = useState<Date | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [showLog, setShowLog]         = useState(true);

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logTimersRef  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logIdRef      = useRef(0);

  const BB_COLOR = "#E8640A";

  const addLog = useCallback((level: LogLevel, msg: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLogs(prev => [...prev, { id: logIdRef.current++, time, level, msg }]);
  }, []);

  useEffect(() => {
    if (phase === "running") {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  function clearLogTimers() {
    logTimersRef.current.forEach(t => clearTimeout(t));
    logTimersRef.current = [];
  }

  function scheduleLogsForStage(stageName: string) {
    const entries = STAGE_LOGS[stageName] || [];
    entries.forEach(({ delay, level, msg }) => {
      const t = setTimeout(() => addLog(level, msg), delay);
      logTimersRef.current.push(t);
    });
  }

  function advanceStage(idx: number) {
    if (idx >= LIVE_STAGES.length) {
      setPhase("complete");
      setCompletedAt(new Date());
      return;
    }
    setStageIdx(idx);
    setStageStart(new Date());
    scheduleLogsForStage(LIVE_STAGES[idx].stage);
    stageTimerRef.current = setTimeout(() => advanceStage(idx + 1), LIVE_STAGES[idx].durationMs);
  }

  function triggerOutage() {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    clearLogTimers();
    setPhase("running");
    setStageIdx(-1);
    setElapsed(0);
    setCompletedAt(null);
    setLogs([]);
    logIdRef.current = 0;
    setShowLog(true);
    setTimeout(() => advanceStage(0), 1000);
  }

  function reset() {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    clearLogTimers();
    setPhase("idle");
    setStageIdx(-1);
    setElapsed(0);
    setCompletedAt(null);
    setLogs([]);
    logIdRef.current = 0;
    setShowLog(true);
  }

  useEffect(() => () => {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    clearLogTimers();
  }, []);

  if (phase === "idle") {
    return (
      <div className="space-y-4">
        {/* Feed health - all nominal */}
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5" data-testid="bb-feeds-nominal">
          <div className="flex items-center gap-3 mb-4">
            <Wifi className="w-5 h-5 text-green-400" />
            <div>
              <h2 className="text-sm font-bold text-green-400">All Data Feeds Nominal</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">5 auction data sources connected · Real-time health monitoring active</p>
            </div>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">HEALTHY</span>
          </div>
          <div className="space-y-2">
            {[
              { source: "Manheim (national)", health: 100, txns: "41,200" },
              { source: "Manheim Southeast",  health: 100, txns: "8,200"  },
              { source: "Adesa",              health: 100, txns: "38,500" },
              { source: "Dealer-Direct",      health: 100, txns: "32,800" },
              { source: "Independent",        health: 100, txns: "21,483" },
            ].map(f => (
              <div key={f.source} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[11px] font-medium w-44">{f.source}</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30">
                  <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${f.health}%` }} />
                </div>
                <span className="text-[10px] text-green-400 font-mono w-10 text-right">{f.health}%</span>
                <span className="text-[10px] text-muted-foreground w-16 text-right">{f.txns} txns</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trigger card */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <WifiOff className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Simulate a Data Feed Outage</h3>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-lg">
                Trigger a simulated Manheim Southeast authentication failure — the same scenario that happens in production.
                Watch the Atlas self-healing pipeline run live through 5 automated stages: Detect → Diagnose → Remediate → Backfill → Validate.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={triggerOutage}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                  style={{ backgroundColor: BB_COLOR }}
                  data-testid="bb-trigger-outage"
                >
                  <Play className="w-4 h-4" />
                  Trigger Simulated Outage
                </button>
                <span className="text-[11px] text-muted-foreground">Takes ~40 seconds to complete all 5 healing stages</span>
              </div>
            </div>
          </div>
        </div>

        {/* Historical context */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Last 30 Days — Self-Healing Events</h3>
          <div className="space-y-2">
            {[
              { id: "HLG-2026-0091", source: "Manheim SE",      issue: "OAuth token expired",   resolved: "4 min", date: "Apr 21" },
              { id: "HLG-2026-0084", source: "Adesa",            issue: "Schema field mismatch", resolved: "7 min", date: "Apr 14" },
              { id: "HLG-2026-0079", source: "Dealer-Direct API",issue: "Rate limit exceeded",   resolved: "2 min", date: "Apr 9"  },
            ].map(e => (
              <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold">{e.source} — {e.issue}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{e.id} · {e.date}</p>
                  </div>
                </div>
                <span className="text-[10px] text-green-400 font-mono">{e.resolved}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    const activeStage = stageIdx >= 0 ? LIVE_STAGES[stageIdx] : null;
    return (
      <div className="space-y-4">
        {/* Live incident banner */}
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 animate-pulse" data-testid="bb-incident-live">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <WifiOff className="w-5 h-5 text-red-400" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">ACTIVE INCIDENT</span>
                  <span className="text-[10px] font-mono text-muted-foreground">INC-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001</span>
                </div>
                <h2 className="text-sm font-bold text-red-400 mt-0.5">Manheim Southeast data feed offline</h2>
                <p className="text-[11px] text-muted-foreground">OAuth token expired · 8,200 transactions at risk</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-red-400 justify-end">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[10px] font-mono">Self-healing active</span>
              </div>
              <p className="text-2xl font-bold text-red-400 font-mono">{elapsed}s</p>
              <p className="text-[10px] text-muted-foreground">elapsed</p>
            </div>
          </div>
        </div>

        {/* Live stage pipeline */}
        <div className="space-y-2">
          {LIVE_STAGES.map((ls, i) => {
            const isActive   = i === stageIdx;
            const isComplete = i < stageIdx;
            const isPending  = i > stageIdx;
            const colors     = STAGE_COLORS[ls.stage];
            const Icon       = STAGE_ICONS[ls.stage];
            return (
              <div
                key={ls.stage}
                className={`rounded-xl border p-4 transition-all duration-500 ${
                  isComplete ? colors.card :
                  isActive   ? `${colors.card} shadow-sm` :
                  "bg-muted/10 border-border/30 opacity-50"
                }`}
                data-testid={`bb-live-stage-${ls.stage.toLowerCase()}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      isComplete ? "bg-green-500/20 border border-green-500/30" :
                      isActive   ? `${colors.card} border` :
                      "bg-muted/20 border border-border/30"
                    }`}>
                      {isComplete
                        ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                        : isActive
                          ? <Loader2 className={`w-3.5 h-3.5 animate-spin`} />
                          : <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      }
                    </div>
                    {i < LIVE_STAGES.length - 1 && (
                      <div className={`w-px h-4 ${isComplete ? "bg-green-400/40" : "bg-border/20"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${isPending ? "text-muted-foreground/40" : ""}`} />
                        <span className="text-[11px] font-semibold">{ls.stage}</span>
                        <span className="text-[10px] text-muted-foreground">— {ls.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[9px]">
                        {isComplete && <span className="text-green-400 font-mono">✓ done</span>}
                        {isActive   && <span className="animate-pulse font-mono">running…</span>}
                        <span className="text-muted-foreground/50">~{Math.round(ls.durationMs / 1000)}s</span>
                      </div>
                    </div>
                    {(isActive || isComplete) && (
                      <p className="text-[10px] leading-relaxed opacity-90">{ls.detail}</p>
                    )}
                    {isActive && (
                      <div className="mt-2 h-1 rounded-full bg-current/20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-current opacity-80 transition-all"
                          style={{
                            width: "100%",
                            animation: `pulse 1s ease-in-out infinite`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feed status during run */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Data Feed Status</h3>
          <div className="space-y-2">
            {[
              { source: "Manheim (national)", health: 100, ok: true  },
              { source: "Manheim Southeast",  health: stageIdx >= 2 ? 100 : 0, ok: stageIdx >= 2 },
              { source: "Adesa",              health: 100, ok: true  },
              { source: "Dealer-Direct",      health: 100, ok: true  },
              { source: "Independent",        health: 100, ok: true  },
            ].map(f => (
              <div key={f.source} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${f.ok ? "bg-green-400" : "bg-red-400 animate-pulse"}`} />
                <span className="text-[11px] w-44">{f.source}</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${f.ok ? "bg-green-400" : "bg-red-400"}`}
                    style={{ width: `${f.health}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono w-10 text-right ${f.ok ? "text-green-400" : "text-red-400"}`}>
                  {f.health}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <SystemLogPanel logs={logs} show={showLog} onToggle={() => setShowLog(v => !v)} />
      </div>
    );
  }

  // Resolved
  const totalSec = LIVE_STAGES.reduce((s, st) => s + st.durationMs, 0) / 1000;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4" data-testid="bb-healing-banner">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">RESOLVED</span>
              <span className="text-[10px] text-muted-foreground font-mono">HLG-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001</span>
            </div>
            <h2 className="text-sm font-bold">Manheim Southeast data feed offline — self-healed in {Math.round(elapsed / 60) || 1} min</h2>
            <p className="text-[11px] text-muted-foreground mt-1">OAuth token expired — 401 response from Manheim Southeast API</p>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-muted-foreground justify-end mb-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px]">Resolution time</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{elapsed}s</p>
            <p className="text-[10px] text-muted-foreground">fully automated</p>
          </div>
        </div>
      </div>

      {/* Completed stages */}
      <div className="space-y-2">
        {LIVE_STAGES.map((ls, i) => {
          const colors = STAGE_COLORS[ls.stage];
          const Icon   = STAGE_ICONS[ls.stage];
          return (
            <div key={ls.stage} className={`rounded-xl border p-4 ${colors.card}`} data-testid={`bb-healing-stage-${ls.stage.toLowerCase()}`}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-500/20 border border-green-500/30">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  </div>
                  {i < LIVE_STAGES.length - 1 && <div className="w-px h-4 bg-green-400/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold">{ls.stage}</span>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <span className="text-[9px] opacity-70">~{Math.round(ls.durationMs / 1000)}s</span>
                  </div>
                  <p className="text-[10px] leading-relaxed opacity-90">{ls.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <SystemLogPanel logs={logs} show={showLog} onToggle={() => setShowLog(v => !v)} />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Impact Avoided</h3>
          <div className="space-y-2">
            {[
              { label: "Time saved vs manual",      value: "~243 min (4 hrs)" },
              { label: "Transactions recovered",     value: "8,200" },
              { label: "Valuations protected",       value: "31,000" },
              { label: "Client exposure",            value: "Zero — resolved before customers noticed" },
              { label: "Analyst intervention",       value: "None required" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className="text-[10px] font-semibold text-green-400">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold mb-2">Feed Health Restored</h3>
            {[
              { source: "Manheim (national)", status: 100 },
              { source: "Adesa",              status: 100 },
              { source: "Manheim SE",         status: 99  },
              { source: "Dealer-Direct",      status: 100 },
              { source: "Independent",        status: 100 },
            ].map(f => (
              <div key={f.source} className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground">{f.source}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-12 h-1 rounded-full bg-muted/30">
                    <div className="h-full rounded-full bg-green-400" style={{ width: `${f.status}%` }} />
                  </div>
                  <span className="text-[10px] text-green-400 font-mono">{f.status}%</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={reset}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all"
            data-testid="bb-healing-reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Run Again
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BBScreen5SelfHealing({ scenario }: { scenario?: ScenarioType }) {
  if (scenario === "self-healing") {
    return <LiveSelfHealingDemo />;
  }

  return (
    <div className="flex items-center justify-center h-64">
      <div className="max-w-sm text-center space-y-3 px-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold">No outage events in this run</p>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            The pipeline completed cleanly — no data feed interruptions detected. Switch to the <span className="text-foreground font-medium">Feed Outage + Self-Healing</span> scenario to see the live 5-stage recovery in action.
          </p>
        </div>
      </div>
    </div>
  );
}
