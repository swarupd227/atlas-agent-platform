import { Microscope, FileSearch, Database, CheckCircle2, AlertTriangle, ChevronRight, ShieldAlert, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

const RESOLUTION_STEPS_A = [
  { n: 1, action: "Verify SQL service account permissions",  cmd: "SELECT IS_ROLEMEMBER('db_owner', 'IQS_ServiceAccount') AS has_permission;", risk: "low"  },
  { n: 2, action: "Run IQS-MIGRATE-930.sql manually",        cmd: "sqlcmd -S [SQL_SERVER] -d SPC_Analytics -i IQS-MIGRATE-930.sql -E",          risk: "low"  },
  { n: 3, action: "Restart InfinityQS SPC Engine service",   cmd: "services.msc → InfinityQS SPC Engine → Restart",                              risk: "low"  },
  { n: 4, action: "Validate Xbar-R chart data refresh",      cmd: "Open SPC dashboard → confirm charts load within 30s",                          risk: "none" },
  { n: 5, action: "Confirm ISO 9001 audit readiness",        cmd: "Export chart summary for QC manager confirmation",                              risk: "none" },
];

const RESOLUTION_STEPS_C = [
  { n: 1, action: "Preserve all sync logs (compliance requirement)",             cmd: "Copy PF_Sync.log + Windows Event Log entries to compliance-preserved location", risk: "none"  },
  { n: 2, action: "Enable DaemonAutoRestart in ParityFactory.config",           cmd: "Set DaemonAutoRestart=true in C:\\ProgramData\\ParityFactory\\ParityFactory.config", risk: "low" },
  { n: 3, action: "Restart ParityFactory Sync Service (compliance supervised)", cmd: "services.msc → ParityFactory Sync → Restart (document in validation log)",      risk: "low"   },
  { n: 4, action: "Re-trigger sync for LOT089-LOT094 under supervision",        cmd: "PF Admin Console → Data Sync → Manual Sync → 2026-04-17 05:00–06:30",          risk: "medium" },
  { n: 5, action: "Validate LOT089-094 in FDA repository",                      cmd: "Confirm all 6 records present with correct timestamps — show FDA auditors",      risk: "none"  },
];

interface Props { state: SupportPipelineState; }

export default function AdvSupportS3Diagnostic({ state }: Props) {
  const agentStatus = state.agents.find(a => a.code === "SUP-003")?.status ?? "idle";
  const isIdle    = agentStatus === "idle";
  const isRunning = agentStatus === "running";
  const isDone    = agentStatus === "complete";
  const sc        = state.scenario;
  const isC       = sc === "C";

  const steps = isC ? RESOLUTION_STEPS_C : RESOLUTION_STEPS_A;

  const bannerTitle = isC
    ? "DIAGNOSTIC REASONING — PARITYFACTORY COMPLIANCE LOG INTELLIGENCE"
    : "DIAGNOSTIC REASONING — LOG INTELLIGENCE";

  const bannerSub = isC
    ? "Querying Advantive ONE Product Log Intelligence — ParityFactory v8.2.1, PF-SYNC-DAEMON-EXIT-0, 22,140 log entries scanned"
    : "Querying Advantive ONE Product Log Intelligence — InfinityQS v9.3, error IQS-SQL-TMO-7891, 14,820 log entries scanned";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status Banner — always visible */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}35` }}
        data-testid="diagnostic-banner"
      >
        <Microscope className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>{bannerTitle}</span>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">SUP-003 Analysing</Badge>}
            {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">Root Cause Confirmed</Badge>}
            {isC && isDone && <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-300">FDA Regulatory Hold Active</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{bannerSub}</p>
        </div>
      </div>

      {/* Idle placeholder — gate content until SUP-003 starts */}
      {isIdle ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="diagnostic-idle-placeholder">
          <Cpu className="w-8 h-8" style={{ color: `${ACCENT}40` }} />
          <div className="text-sm text-muted-foreground/50 font-medium">SUP-003 standing by</div>
          <div className="text-xs text-muted-foreground/30">Waiting for KB resolution result before diagnostic reasoning begins</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Log Analysis Findings */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="log-analysis">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">Product Log Intelligence</span>
              </div>
              <div className="flex flex-col gap-2">
                {isC ? (
                  <>
                    {[
                      { code: "PF-SYNC-DAEMON-EXIT-0",    count: "1",    rate: "1 event",  severity: "CRITICAL" },
                      { code: "PF-DB-CONN-TIMEOUT-0041",  count: "1,847", rate: "3.8/min", severity: "HIGH"    },
                      { code: "PF-BATCH-WRITE-FAIL-0019", count: "6",    rate: "6 events", severity: "CRITICAL" },
                    ].map(e => (
                      <div key={e.code} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0" data-testid={`error-${e.code}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono font-medium">{e.code}</span>
                            <Badge variant="outline" className={`text-[9px] ${e.severity === "CRITICAL" ? "border-rose-500/50 text-rose-400" : "border-amber-500/50 text-amber-400"}`}>{e.severity}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">Count: <span className="font-mono text-foreground">{isDone ? e.count : "--"}</span></span>
                            <span className="text-[10px] text-muted-foreground">Rate: <span className="font-mono text-foreground">{isDone ? e.rate : "--"}</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isDone && (
                      <div className="mt-2 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                        <div className="text-[10px] font-semibold text-amber-400 mb-1">Root Cause Signal:</div>
                        <div className="text-[10px] text-muted-foreground">
                          Sync daemon exited silently (code 0) after DB maintenance connection pool recycle. Batch records <span className="font-mono text-amber-300">LOT089-094</span> were in the buffer but not committed. Root cause: <span className="text-rose-400 font-medium">DaemonAutoRestart=false</span> (PF-BUG-821-0033).
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {[
                      { code: "IQS-SQL-TMO-7891", count: "847", rate: "2.4/min", severity: "CRITICAL" },
                      { code: "IQS-SQL-CON-0019", count: "312", rate: "0.9/min", severity: "HIGH"     },
                    ].map(e => (
                      <div key={e.code} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0" data-testid={`error-${e.code}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono font-medium">{e.code}</span>
                            <Badge variant="outline" className={`text-[9px] ${e.severity === "CRITICAL" ? "border-rose-500/50 text-rose-400" : "border-amber-500/50 text-amber-400"}`}>{e.severity}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">Count: <span className="font-mono text-foreground">{isDone ? e.count : "--"}</span></span>
                            <span className="text-[10px] text-muted-foreground">Rate: <span className="font-mono text-foreground">{isDone ? e.rate : "--"}</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isDone && (
                      <div className="mt-2 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                        <div className="text-[10px] font-semibold text-amber-400 mb-1">Root Cause Signal:</div>
                        <div className="text-[10px] text-muted-foreground">
                          IQS_Measurement_930 table missing <span className="font-mono text-amber-300">IX_IQS_Meas_ChartId_Timestamp</span> index. IQS-MIGRATE-930.sql was <span className="text-rose-400 font-medium">silently skipped</span> at startup.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Error Pattern Match */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="error-pattern">
              <div className="flex items-center gap-2 mb-3">
                <FileSearch className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">Error Catalog Match</span>
                {isDone && <Badge variant="outline" className="ml-auto text-[9px]" style={{ borderColor: `${ACCENT}50`, color: ACCENT }}>{isC ? "0.94" : "0.97"} confidence</Badge>}
              </div>
              {isDone ? (
                <div className="flex flex-col gap-2">
                  {isC ? (
                    <>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Catalog Entry</span><span className="text-xs font-mono font-semibold">PF-BUG-821-0033</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Pattern</span><span className="text-[11px] font-medium">v8.2 Sync Daemon Non-Restart After DB Maintenance</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Affected Versions</span><Badge variant="outline" className="text-[9px] border-rose-500/30 text-rose-400">v8.2.0 · v8.2.1</Badge></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Fix Type</span><span className="text-[11px]">Config + batch record recovery (compliance supervised)</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Est. Fix Time</span><span className="text-[11px] font-mono font-semibold">20 minutes</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Patch ETA</span><span className="text-[11px] text-muted-foreground">v8.3.0 — Q3 2026</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Catalog Entry</span><span className="text-xs font-mono font-semibold">IQS-BUG-930-0042</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Pattern</span><span className="text-[11px] font-medium">v9.3 Post-Upgrade Migration Failure</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Affected Versions</span><Badge variant="outline" className="text-[9px] border-rose-500/30 text-rose-400">v9.3.0 only</Badge></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Fix Type</span><span className="text-[11px]">Config + manual migration script</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Remote Access</span><div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-[11px] text-emerald-400">Not required</span></div></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Est. Fix Time</span><span className="text-[11px] font-mono font-semibold">15 minutes</span></div>
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Patch ETA</span><span className="text-[11px] text-muted-foreground">v9.3.1 — 2026-04-28</span></div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/40 italic">Analysing error patterns…</div>
              )}
            </div>
          </div>

          {/* Resolution Path */}
          <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="resolution-path">
            <div className="flex items-center gap-2 mb-3">
              <ChevronRight className="w-4 h-4" style={{ color: ACCENT }} />
              <span className="text-sm font-semibold">Resolution Path (SUP-003 Generated)</span>
              {isDone && (
                <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/40 text-emerald-400">
                  {isC ? "5 steps · 20 min · Compliance supervised" : "5 steps · 15 min · Customer-executable"}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {steps.map(step => (
                <div key={step.n} className="flex items-start gap-3" data-testid={`resolution-step-${step.n}`}>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: isDone ? `${ACCENT}20` : "#1e293b", color: isDone ? ACCENT : "#64748b" }}
                  >
                    {step.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${isDone ? "font-medium" : "text-muted-foreground"}`}>{step.action}</span>
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${step.risk === "none" ? "border-emerald-500/30 text-emerald-400" : step.risk === "medium" ? "border-rose-500/30 text-rose-400" : "border-amber-500/30 text-amber-400"}`}>
                        {step.risk}
                      </Badge>
                    </div>
                    {isDone && <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/60 truncate">{step.cmd}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Escalation Assessment — only when done */}
          {isDone && (
            <div
              className="rounded-lg border px-4 py-3 flex items-start gap-3"
              style={{ background: `${ACCENT}0A`, borderColor: `${ACCENT}30` }}
              data-testid="escalation-assessment"
            >
              {isC
                ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
              }
              <div>
                <div className={`text-xs font-semibold ${isC ? "text-rose-400" : "text-amber-400"}`}>
                  {isC ? "Escalation Decision: P0 Regulatory Mandatory — FDA Legal Hold Activated" : "Escalation Decision: Parallel T2 Standby Required"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {isC
                    ? "21 CFR Part 11 active validation window mandates T2 and compliance officer co-supervision for all recovery steps. Legal hold placed on all sync logs. FDA advisory filed. SUP-004 activating regulatory fast-track escalation package."
                    : "Autonomous resolution is technically possible (confidence 0.91), but Enterprise + ISO audit deadline policy mandates T2 standby. Resolution path sent to customer; SUP-004 packaging T2 escalation simultaneously."}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
