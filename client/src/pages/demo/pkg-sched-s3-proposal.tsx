import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileText, TrendingUp, Zap, BarChart3, AlertCircle } from "lucide-react";
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

// Extract a short display label from the full slot label
function shortLabel(label: string, type: SlotType): string {
  if (type === "maintenance") return "🔧 Maintenance";
  if (type === "changeover")  return label.replace("Changeover ", "");
  if (type === "buffer")      return "Buffer";
  // For rush/standard: show the customer name portion
  const match = label.match(/·\s*([^·]+?)\s*(·|$)/);
  if (match) return match[1].trim();
  return label.split("·")[0].trim();
}

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS3Proposal({ pipelineState }: Props) {
  const { phase3Done, results, status } = pipelineState;
  const proposalDone = results.some(r => r.role === "schedule_proposal") || phase3Done;
  const isComplete   = status === "complete";

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-3">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card/40 px-5 py-3 flex items-center gap-4 shrink-0">
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
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-400">
                {isComplete ? "Committed to Kiwiplan · KWP-SCHED-2026-0415-D" : "Proposal published · Awaiting planner approval"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI delta row ─────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-4 gap-3 shrink-0 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>
        {[
          { icon: TrendingUp, label: "OEE", baseline: `${KPI_PROJECTIONS.baseline.oee}%`, projected: `${KPI_PROJECTIONS.projected.oee}%`, delta: "+11.2pp", color: "text-emerald-400", borderColor: "border-emerald-500/25", bgColor: "bg-emerald-500/6" },
          { icon: BarChart3,  label: "OTIF Orders", baseline: `${KPI_PROJECTIONS.baseline.otifOrders}/47`, projected: `${KPI_PROJECTIONS.projected.otifOrders}/47`, delta: "+4 orders", color: "text-teal-400", borderColor: "border-teal-500/25", bgColor: "bg-teal-500/6" },
          { icon: Zap,        label: "Changeovers", baseline: `${KPI_PROJECTIONS.baseline.changeovers}`, projected: `${KPI_PROJECTIONS.projected.changeovers}`, delta: "−3", color: "text-sky-400", borderColor: "border-sky-500/20", bgColor: "bg-sky-500/5" },
          { icon: TrendingUp, label: "Substrate Waste", baseline: `${KPI_PROJECTIONS.baseline.substrateWastePct}%`, projected: `${KPI_PROJECTIONS.projected.substrateWastePct}%`, delta: "−8%", color: "text-violet-400", borderColor: "border-violet-500/20", bgColor: "bg-violet-500/5" },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.borderColor} ${kpi.bgColor} px-4 py-3`} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g,"-")}`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <kpi.icon className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/60">{kpi.label}</span>
            </div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.projected}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-muted-foreground/40">was {kpi.baseline}</span>
              <Badge className={`text-[9px] border ${kpi.borderColor} ${kpi.color}`}>{kpi.delta}</Badge>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content: Gantt + sidebar ────────────────────────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Gantt chart ───────────────────────────────────────────────── */}
        <div className={`flex-1 rounded-xl border border-border/30 bg-card/40 p-4 transition-opacity min-h-0 overflow-auto ${proposalDone ? "opacity-100" : "opacity-30"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-foreground">Production Gantt — Day Shift 07:00–15:00</div>
            <div className="flex items-center gap-3 text-[9px]">
              {([["rush", "RUSH"], ["changeover", "Changeover"], ["maintenance", "Maintenance"], ["buffer", "Buffer"], ["standard", "Standard"]] as [SlotType, string][]).map(([t, l]) => (
                <div key={t} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded border ${SLOT_STYLES[t].bg} ${SLOT_STYLES[t].border}`} />
                  <span className="text-muted-foreground/50">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time axis */}
          <div className="flex mb-2 ml-32">
            {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00"].map(t => (
              <div key={t} className="flex-1 text-[8px] font-mono text-muted-foreground/35 text-center">{t}</div>
            ))}
          </div>

          {/* Machine rows — h-10 gives 40px, enough for 2 lines of text */}
          <div className="flex flex-col gap-1.5">
            {GANTT_MACHINES.map(machine => (
              <div key={machine.id} className="flex items-center gap-2" data-testid={`gantt-row-${machine.id}`}>
                {/* Machine label */}
                <div className="w-32 shrink-0 text-right pr-1">
                  <div className="text-[9px] font-mono font-semibold text-muted-foreground/60">{machine.id}</div>
                  <div className="text-[8px] text-muted-foreground/35 leading-tight truncate">{machine.label}</div>
                </div>
                {/* Timeline bar */}
                <div className="flex-1 h-10 bg-white/[0.03] rounded border border-border/10 relative overflow-hidden">
                  {machine.slots.map((slot, i) => {
                    const left  = timeToX(slot.start);
                    const width = durationPct(slot.start, slot.end);
                    const style = SLOT_STYLES[slot.type as SlotType];
                    const label = shortLabel(slot.label, slot.type as SlotType);
                    const isRush = slot.type === "rush";
                    return (
                      <div
                        key={i}
                        className={`absolute inset-y-0 flex flex-col justify-center px-1.5 border-r border-border/15 ${style.bg} border-l ${style.border}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${slot.start}–${slot.end}: ${slot.label}`}
                      >
                        {width > 5 && (
                          <>
                            <span className={`text-[8px] font-mono leading-none ${style.text} ${isRush ? "font-bold" : ""}`}>
                              {isRush ? "🔴 " : ""}{slot.start}–{slot.end}
                            </span>
                            {width > 12 && (
                              <span className={`text-[7px] leading-none mt-0.5 truncate ${style.text} opacity-80`}>
                                {label}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="mt-3 pt-2 border-t border-border/15 text-[9px] text-muted-foreground/40 text-center">
            2 orders deferred to Night Shift (B-Flute resupply) · 14 changeovers · M3 maintenance 10:00–11:30 respected
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className={`w-60 shrink-0 flex flex-col gap-3 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>

          {/* RUSH confirmation */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Coverage</span>
              <Badge className="ml-auto text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">3/3</Badge>
            </div>
            {RUSH_ORDERS.map(o => (
              <div key={o.orderId} className="flex items-center justify-between mb-1 last:mb-0" data-testid={`rush-confirm-${o.orderId}`}>
                <div>
                  <div className="text-[9px] font-semibold text-foreground/80">{o.customer}</div>
                  <div className="text-[8px] text-muted-foreground/50">{o.machine} · by {o.deadline}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400">{o.scheduledComplete}</span>
                </div>
              </div>
            ))}
            <div className="mt-2 pt-1.5 border-t border-emerald-500/15 text-[8px] text-emerald-400/70">
              All 3 on-time with 2–3h margin
            </div>
          </div>

          {/* Approval + Commit — merged into one card */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-3.5 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold text-foreground">Plant Planner Gate</span>
            </div>

            {/* Approval fields */}
            <div className="flex flex-col gap-1.5 mb-3">
              {[
                ["Ticket",   KPI_PROJECTIONS.approvalId,    "font-mono text-foreground"],
                ["Approver", KPI_PROJECTIONS.approver,      "text-foreground"],
                ["SLA",      "15 minutes",                  "text-foreground"],
                ["Channel",  "Kiwiplan Planner Dashboard",  "text-muted-foreground/60"],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground/50">{k}</span>
                  <span className={cls as string}>{v}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-[10px] pt-0.5">
                <span className="text-muted-foreground/50">Status</span>
                <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse" data-testid="badge-approval-status">
                  Awaiting Approval
                </Badge>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/20 mb-3" />

            {/* Kiwiplan commit */}
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className={`w-3 h-3 ${isComplete ? "text-emerald-400" : "text-muted-foreground/25"}`} />
              <span className={`text-[10px] font-semibold ${isComplete ? "text-emerald-400" : "text-muted-foreground/35"}`}>Kiwiplan Commit</span>
            </div>
            <div className="flex flex-col gap-1">
              {[
                ["Schedule ID", KPI_PROJECTIONS.kiwiplanScheduleId, true],
                ["MES Board",   "Updated",                          false],
                ["Operators",   "4 notified",                       false],
                ["Rollback",    "30 min window",                    false],
              ].map(([k, v, mono]) => (
                <div key={k as string} className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/50">{k}</span>
                  <span className={`${isComplete ? (mono ? "font-mono font-bold text-emerald-400" : "text-emerald-400") : "text-muted-foreground/25"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Annualised impact */}
          <div className="rounded-xl border border-border/25 bg-card/30 p-3.5 shrink-0">
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Annual Impact</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">OEE revenue</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+$214K / yr</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">Changeover savings</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+$28K / yr</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground/60">OTIF gain</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>+8.5pp → 95% target</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
