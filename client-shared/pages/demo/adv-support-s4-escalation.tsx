import { Package, Briefcase, ArrowRightCircle, Bell, ClipboardList, CheckCircle2, ExternalLink, ShieldAlert, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

const PIPELINE_TRACE_A = [
  { agent: "SUP-001", action: "Intent classified",    detail: "technical_troubleshooting (0.97) · InfinityQS v9.3 · Enterprise · CRITICAL"    },
  { agent: "SUP-002", action: "KB resolution failed", detail: "Confidence 0.58 (below 0.65 gate) · Additional pass 0.61 · Routed to Diagnostic" },
  { agent: "SUP-003", action: "Root cause confirmed", detail: "IQS-BUG-930-0042 · 5-step resolution path built · T2 standby required"           },
  { agent: "SUP-004", action: "Escalation packaging", detail: "18 fields auto-populated · T2 routed · AM notified"                               },
];
const PIPELINE_TRACE_C = [
  { agent: "SUP-001", action: "Intent classified",     detail: "compliance_critical (0.99) · ParityFactory v8.2.1 · Enterprise · REGULATORY-CRITICAL" },
  { agent: "SUP-002", action: "KB resolution failed",  detail: "Confidence 0.52 (below 0.65 gate) + FDA regulatory protocol → Diagnostic"              },
  { agent: "SUP-003", action: "Root cause confirmed",  detail: "PF-BUG-821-0033 · 5-step compliance recovery built · P0 regulatory mandatory"          },
  { agent: "SUP-004", action: "Regulatory escalation", detail: "21 fields auto-populated · Legal hold placed · FDA advisory filed · AM + Legal notified"},
];

interface Props { state: SupportPipelineState; }

export default function AdvSupportS4Escalation({ state }: Props) {
  const agentStatus = state.agents.find(a => a.code === "SUP-004")?.status ?? "idle";
  const isIdle    = agentStatus === "idle";
  const isRunning = agentStatus === "running";
  const isDone    = agentStatus === "complete";
  const isC       = state.scenario === "C";
  const trace     = isC ? PIPELINE_TRACE_C : PIPELINE_TRACE_A;
  const caseId    = isC ? "SF-CASE-2026-078034" : "SF-CASE-2026-074821";
  const caseUrl   = isC ? "advantive.lightning.force.com/r/Case/00078034" : "advantive.lightning.force.com/r/Case/00074821";

  const sfRows = isC ? [
    { field: "Case Number",    value: "00078034",                             highlight: false },
    { field: "Priority",       value: "Critical — Regulatory Emergency",      highlight: true  },
    { field: "Account",        value: "BioNexus Pharma Inc.",                  highlight: false },
    { field: "Contact",        value: "Rachel Kim",                            highlight: false },
    { field: "Product",        value: "ParityFactory v8.2.1",                  highlight: false },
    { field: "Error Code",     value: "PF-SYNC-DAEMON-EXIT-0",                 highlight: false },
    { field: "Root Cause",     value: "PF-BUG-821-0033 — DaemonAutoRestart=false", highlight: true },
    { field: "Recovery",       value: "5-step, 20 min, compliance supervised", highlight: false },
    { field: "T2 Queue",       value: "PF-COMP-T2-REGULATORY",                 highlight: true  },
    { field: "Specialist",     value: "Sofia Rodriguez",                        highlight: false },
    { field: "Legal Hold",     value: "Active — compliance@advantive.com CC",  highlight: true  },
    { field: "SLA Target",     value: "Response within 30 minutes",            highlight: true  },
    { field: "Auto-populated", value: "21 / 21 fields",                        highlight: false },
  ] : [
    { field: "Case Number",    value: "00074821",                             highlight: false },
    { field: "Priority",       value: "Critical",                             highlight: true  },
    { field: "Account",        value: "Cascade Polymers Inc.",                highlight: false },
    { field: "Contact",        value: "Priya Nair",                           highlight: false },
    { field: "Product",        value: "InfinityQS SPC Pro v9.3.0",            highlight: false },
    { field: "Error Code",     value: "IQS-SQL-TMO-7891",                     highlight: false },
    { field: "Root Cause",     value: "IQS-BUG-930-0042 — Migration fail",   highlight: true  },
    { field: "Resolution",     value: "Path provided — 5 steps, 15 min",      highlight: false },
    { field: "T2 Queue",       value: "IQS-DB-T2-URGENT",                     highlight: true  },
    { field: "Specialist",     value: "Marcus Chen",                           highlight: false },
    { field: "SLA Target",     value: "Response within 2 hours",              highlight: true  },
    { field: "Auto-populated", value: "18 / 18 fields",                       highlight: false },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status Banner — always visible */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}35` }}
        data-testid="escalation-banner"
      >
        {isC ? <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" /> : <Package className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: isC ? "#f87171" : ACCENT }}>
              {isC ? "REGULATORY FAST-TRACK ESCALATION — FDA 21 CFR PART 11" : "T1→T2 ESCALATION PACKAGING"}
            </span>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">{isC ? "SUP-004 Regulatory Packaging" : "SUP-004 Packaging"}</Badge>}
            {isDone && (
              <Badge variant="outline" className={`text-[10px] ${isC ? "border-rose-500/50 text-rose-300" : "border-emerald-500/50 text-emerald-400"}`}>
                {isC ? "Regulatory Case Created — Legal Hold Active" : "Salesforce Case Created"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isC
              ? "FDA regulatory escalation — legal hold placed, compliance team CC'd, Sofia Rodriguez (ParityFactory Compliance T2) assigned. P0 response <30 min."
              : "Building enriched T2 handoff — 18 fields pre-populated, zero re-investigation needed for Marcus Chen (InfinityQS DB Team)"}
          </p>
        </div>
      </div>

      {/* Idle placeholder */}
      {isIdle && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="escalation-idle-placeholder">
          <Cpu className="w-8 h-8" style={{ color: `${ACCENT}40` }} />
          <div className="text-sm text-muted-foreground/50 font-medium">SUP-004 standing by</div>
          <div className="text-xs text-muted-foreground/30">Waiting for SUP-003 diagnostic to complete before escalation packaging begins</div>
        </div>
      )}

      {/* Running placeholder */}
      {isRunning && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="escalation-running-placeholder">
          <Cpu className="w-8 h-8 animate-pulse" style={{ color: `${ACCENT}80` }} />
          <div className="text-sm text-muted-foreground/60 font-medium">SUP-004 packaging escalation…</div>
          <div className="text-xs text-muted-foreground/30">Escalation details will appear once packaging completes</div>
        </div>
      )}

      {/* All escalation intelligence — only after SUP-004 completes */}
      {isDone && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Salesforce Case */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="salesforce-case">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">{isC ? "Regulatory Case Created" : "Salesforce Case Created"}</span>
                <Badge variant="outline" className={`ml-auto text-[9px] ${isC ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-400"}`}>{caseId}</Badge>
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                {sfRows.map(row => (
                  <div key={row.field} className="flex items-start justify-between gap-2 py-0.5 border-b border-border/10 last:border-0">
                    <span className="text-muted-foreground shrink-0">{row.field}</span>
                    <span className={`text-right font-medium ${row.highlight ? "" : "text-foreground/80"}`} style={row.highlight ? { color: ACCENT } : undefined}>
                      {row.value}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-1.5">
                  <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-[10px] font-mono text-muted-foreground/50 truncate">{caseUrl}</span>
                </div>
              </div>
            </div>

            {/* T2 Routing + AM Notification */}
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="t2-routing">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightCircle className="w-4 h-4" style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold">T2 Specialist Assigned</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${ACCENT}20`, color: ACCENT }}>
                      {isC ? "S" : "M"}
                    </div>
                    <div>
                      <div className="text-xs font-semibold">{isC ? "Sofia Rodriguez" : "Marcus Chen"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {isC ? "ParityFactory Compliance Specialist · T2" : "InfinityQS DB Specialist · T2"}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/40 text-emerald-400">Available</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="rounded bg-muted/30 px-2 py-1.5">
                      <div className="text-[9px] text-muted-foreground">Queue Depth</div>
                      <div className="text-xs font-mono font-semibold">{isC ? "1 case" : "3 cases"}</div>
                    </div>
                    <div className="rounded bg-muted/30 px-2 py-1.5">
                      <div className="text-[9px] text-muted-foreground">Response ETA</div>
                      <div className="text-xs font-mono font-semibold" style={{ color: ACCENT }}>{isC ? "~30 min" : "~1.5 hours"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="am-notification">
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="w-4 h-4" style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold">{isC ? "AM + Legal Notified" : "Account Manager Notified"}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span>{isC ? "Tyler Brooks" : "James Whitfield"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Channel</span><span>{isC ? "Email + Slack + Phone" : "Email + Slack"}</span></div>
                  {isC && <div className="flex justify-between"><span className="text-muted-foreground">Legal CC</span><span className="text-rose-300 font-mono text-[10px]">compliance@advantive.com</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-emerald-400">Delivered</span></div>
                  <div className="mt-1 rounded bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground italic">
                    {isC
                      ? "🔴 P0 REGULATORY: BioNexus Pharma — ParityFactory FDA sync failure. LOT089-094 missing. Auditors on-site 10:00. Legal hold active. Sofia Rodriguez assigned, ETA 30 min."
                      : "🔴 P1: Cascade Polymers — InfinityQS outage. ISO audit tomorrow. Marcus Chen assigned, ETA 90 min."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline Audit Trace */}
          <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="pipeline-audit">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4" style={{ color: ACCENT }} />
              <span className="text-sm font-semibold">Pipeline Audit Trail</span>
              <Badge variant="outline" className="ml-auto text-[9px] border-emerald-500/40 text-emerald-400">
                {isC ? "15+ events · tamper-proof · FDA advisory filed" : "15 events · tamper-proof"}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {trace.map(row => (
                <div key={row.agent} className="flex items-start gap-3 py-1.5 border-b border-border/15 last:border-0" data-testid={`audit-${row.agent}`}>
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0" style={{ borderColor: `${ACCENT}50`, color: ACCENT }}>
                    {row.agent}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium">{row.action}</span>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">{row.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground">
                {isC ? "4 policies validated · FDA advisory: FDA-ADV-2026-04-17-001 · Audit hash: " : "3 policies validated · Audit hash: "}
                <span className="font-mono">sha256:f4a2b1c9…</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
