import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileText, TrendingUp, Zap, BarChart3 } from "lucide-react";
import {
  PKG_COLOR, KPI_PROJECTIONS, GANTT_MACHINES, RUSH_ORDERS,
  type PkgPipelineState,
} from "./pkg-sched-constants";

type SlotType = "rush" | "changeover" | "maintenance" | "buffer" | "standard";

const SLOT_STYLES: Record<SlotType, { bg: string; text: string; border: string }> = {
  rush:        { bg: "bg-red-500/20",     text: "text-red-300",    border: "border-red-500/40" },
  changeover:  { bg: "bg-amber-500/15",   text: "text-amber-400",  border: "border-amber-500/30" },
  maintenance: { bg: "bg-orange-500/15",  text: "text-orange-400", border: "border-orange-500/30" },
  buffer:      { bg: "bg-slate-500/15",   text: "text-slate-400",  border: "border-slate-500/20" },
  standard:    { bg: "bg-teal-500/10",    text: "text-teal-300",   border: "border-teal-500/20" },
};

function timeToX(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 7) * 60 + m) / 480 * 100;
}
function durationPct(start: string, end: string): number {
  return timeToX(end) - timeToX(start);
}

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS3Proposal({ pipelineState }: Props) {
  const { phase3Done, results, status } = pipelineState;
  const proposalDone = results.some(r => r.role === "schedule_proposal") || phase3Done;
  const isComplete   = status === "complete";

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-4">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card/40 px-5 py-3.5 flex items-center gap-4 shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,131,143,0.15)", border: "1px solid rgba(0,131,143,0.25)" }}>
          <FileText className="w-4 h-4" style={{ color: PKG_COLOR }} />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">PKG-004 — Schedule Proposal & Approval Agent</div>
          <div className="text-[10px] text-muted-foreground/60">Alternative A · Westfield Packaging Day Shift · April 15, 2026</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!proposalDone && (
            <Badge className="text-[9px] border animate-pulse" style={{ background: "rgba(0,131,143,0.15)", borderColor: "rgba(0,131,143,0.35)", color: PKG_COLOR }}>
              ⬤ Formatting proposal…
            </Badge>
          )}
          {proposalDone && (
            <>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-semibold text-emerald-400">Proposal published · Approval pending</span>
              </div>
              {isComplete && (
                <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                  ✓ Committed to Kiwiplan
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── KPI delta row ─────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-4 gap-3 shrink-0 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>
        {[
          { icon: TrendingUp, label: "OEE", baseline: `${KPI_PROJECTIONS.baseline.oee}%`, projected: `${KPI_PROJECTIONS.projected.oee}%`, delta: "+11.2pp", color: "text-emerald-400", borderColor: "border-emerald-500/25", bgColor: "bg-emerald-500/6" },
          { icon: BarChart3,  label: "OTIF Orders", baseline: `${KPI_PROJECTIONS.baseline.otifOrders}/47`, projected: `${KPI_PROJECTIONS.projected.otifOrders}/47`, delta: "+4 orders", color: "text-teal-400", borderColor: "border-teal-500/25", bgColor: "bg-teal-500/6" },
          { icon: Zap,        label: "Changeovers", baseline: `${KPI_PROJECTIONS.baseline.changeovers}`, projected: `${KPI_PROJECTIONS.projected.changeovers}`, delta: "-3", color: "text-sky-400", borderColor: "border-sky-500/20", bgColor: "bg-sky-500/5" },
          { icon: TrendingUp, label: "Substrate Waste", baseline: `${KPI_PROJECTIONS.baseline.substrateWastePct}%`, projected: `${KPI_PROJECTIONS.projected.substrateWastePct}%`, delta: "-8%", color: "text-violet-400", borderColor: "border-violet-500/20", bgColor: "bg-violet-500/5" },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.borderColor} ${kpi.bgColor} px-4 py-3`} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g,"-")}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <kpi.icon className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/60">{kpi.label}</span>
            </div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.projected}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-muted-foreground/40">Baseline: {kpi.baseline}</span>
              <Badge className={`text-[9px] border ${kpi.borderColor} ${kpi.color}`}>{kpi.delta}</Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 min-h-0">

        {/* ── Gantt chart ───────────────────────────────────────────────── */}
        <div className={`flex-1 rounded-xl border border-border/30 bg-card/40 p-4 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-foreground">Production Gantt — Day Shift 07:00–15:00</div>
            <div className="flex items-center gap-3 text-[9px]">
              {([["rush", "RUSH Order"], ["changeover", "Changeover"], ["maintenance", "Maintenance"], ["buffer", "Buffer"], ["standard", "Standard"]] as [SlotType, string][]).map(([t, l]) => (
                <div key={t} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-sm border ${SLOT_STYLES[t].bg} ${SLOT_STYLES[t].border}`} />
                  <span className="text-muted-foreground/50">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time axis */}
          <div className="flex mb-1 ml-24">
            {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00"].map(t => (
              <div key={t} className="flex-1 text-[8px] font-mono text-muted-foreground/30 text-center">{t}</div>
            ))}
          </div>

          {/* Machine rows */}
          <div className="flex flex-col gap-1">
            {GANTT_MACHINES.map(machine => (
              <div key={machine.id} className="flex items-center gap-2" data-testid={`gantt-row-${machine.id}`}>
                <div className="w-24 shrink-0 text-right">
                  <span className="text-[9px] font-mono text-muted-foreground/50">{machine.id}</span>
                  <span className="text-[8px] text-muted-foreground/35 ml-1 hidden xl:inline">{machine.label.split(" ").slice(0, 2).join(" ")}</span>
                </div>
                <div className="flex-1 h-6 bg-white/[0.03] rounded border border-border/10 relative overflow-hidden">
                  {machine.slots.map((slot, i) => {
                    const left = timeToX(slot.start);
                    const width = durationPct(slot.start, slot.end);
                    const style = SLOT_STYLES[slot.type as SlotType];
                    return (
                      <div
                        key={i}
                        className={`absolute inset-y-0 flex items-center px-1 border-r border-border/10 ${style.bg} ${style.border}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${slot.start}–${slot.end}: ${slot.label}`}
                      >
                        {width > 8 && (
                          <span className={`text-[8px] font-mono truncate ${style.text}`}>
                            {slot.type === "rush" ? "🔴 " : slot.type === "maintenance" ? "🔧 " : ""}
                            {slot.start}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-2 text-[9px] text-muted-foreground/40 text-center">
            2 orders deferred to Night Shift (B-Flute resupply) · 14 changeovers · M3 maintenance 10:00–11:30 respected
          </div>
        </div>

        {/* ── Approval + commit sidebar ─────────────────────────────────── */}
        <div className={`w-72 shrink-0 flex flex-col gap-3 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>

          {/* RUSH confirmation */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Order Coverage</span>
            </div>
            {RUSH_ORDERS.map(o => (
              <div key={o.orderId} className="flex items-center justify-between mb-1 last:mb-0" data-testid={`rush-confirm-${o.orderId}`}>
                <span className="text-[9px] text-muted-foreground/70">{o.customer} · {o.machine}</span>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400">{o.scheduledComplete}</span>
                </div>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-emerald-500/15 text-[9px] text-emerald-400/70">
              All 3 RUSH orders on-time with 2–3h margin
            </div>
          </div>

          {/* Approval gate */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold text-foreground">Approval Gate</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Ticket</span>
                <span className="font-mono text-foreground">{KPI_PROJECTIONS.approvalId}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Approver</span>
                <span className="text-foreground">{KPI_PROJECTIONS.approver}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Role</span>
                <span className="text-muted-foreground/70">{KPI_PROJECTIONS.approverTitle}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">SLA</span>
                <span className="text-foreground">15 minutes</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Channel</span>
                <span className="text-muted-foreground/70">Kiwiplan Planner Dashboard</span>
              </div>
              <div className="flex justify-between items-center text-[10px] mt-1">
                <span className="text-muted-foreground/60">Status</span>
                {isComplete ? (
                  <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">✓ APPROVED</Badge>
                ) : (
                  <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse">PENDING</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Kiwiplan commit */}
          <div className={`rounded-xl border p-4 ${isComplete ? "border-emerald-500/30 bg-emerald-500/6" : "border-border/25 bg-card/30 opacity-50"}`} data-testid="card-kiwiplan-commit">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className={`w-3.5 h-3.5 ${isComplete ? "text-emerald-400" : "text-muted-foreground/30"}`} />
              <span className={`text-[10px] font-semibold ${isComplete ? "text-emerald-400" : "text-muted-foreground/40"}`}>Kiwiplan Commit</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Schedule ID</span>
                <span className={`font-mono font-bold ${isComplete ? "text-emerald-400" : "text-muted-foreground/30"}`}>{KPI_PROJECTIONS.kiwiplanScheduleId}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">MES Board</span>
                <span className={isComplete ? "text-emerald-400" : "text-muted-foreground/30"}>Updated ✓</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Notifications</span>
                <span className={isComplete ? "text-emerald-400" : "text-muted-foreground/30"}>4 operators ✓</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Rollback window</span>
                <span className="text-muted-foreground/60">30 minutes</span>
              </div>
            </div>
          </div>

          {/* Annualised impact */}
          <div className="rounded-xl border border-border/25 bg-card/30 p-4">
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Annualised Impact</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Revenue gain (OEE)</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+$214K / yr</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Changeover savings</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+$28K / yr</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">OTIF improvement</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+8.5pp toward 95% target</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
