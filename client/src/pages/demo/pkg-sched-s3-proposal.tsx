import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, TrendingUp, BarChart3, Zap, AlertCircle, Lock } from "lucide-react";
import {
  PKG_COLOR, KPI_PROJECTIONS, GANTT_MACHINES, RUSH_ORDERS,
  type PkgPipelineState,
} from "./pkg-sched-constants";

type SlotType = "rush" | "changeover" | "maintenance" | "buffer" | "standard";

const SLOT_STYLES: Record<SlotType, { bg: string; text: string; border: string }> = {
  rush:        { bg: "bg-red-500/20",    text: "text-red-300",    border: "border-red-500/40" },
  changeover:  { bg: "bg-amber-500/15",  text: "text-amber-400",  border: "border-amber-500/30" },
  maintenance: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  buffer:      { bg: "bg-slate-500/15",  text: "text-slate-400",  border: "border-slate-500/20" },
  standard:    { bg: "bg-teal-500/10",   text: "text-teal-300",   border: "border-teal-500/20" },
};

function timeToX(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return ((h - 7) * 60 + m) / 480 * 100;
}
function durationPct(s: string, e: string): number {
  return timeToX(e) - timeToX(s);
}

function shortLabel(label: string, type: SlotType): string {
  if (type === "maintenance") return "🔧 Maintenance";
  if (type === "changeover")  return label.replace("Changeover ", "CO ");
  if (type === "buffer")      return "Buffer";
  const m = label.match(/·\s*([^·]+?)\s*(·|$)/);
  return m ? m[1].trim() : label.split("·")[0].trim();
}

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS3Proposal({ pipelineState }: Props) {
  const { phase3Done, results, status } = pipelineState;
  const proposalDone = results.some(r => r.role === "schedule_proposal") || phase3Done;
  const isComplete   = status === "complete";

  return (
    <div className="flex flex-col h-full overflow-hidden px-5 py-3 gap-3">

      {/* ── Compact KPI strip — 4 cells in a single row ──────────────────── */}
      <div className={`grid grid-cols-4 gap-3 shrink-0 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>
        {[
          { icon: TrendingUp,  label: "OEE",            base: `${KPI_PROJECTIONS.baseline.oee}%`,           val: `${KPI_PROJECTIONS.projected.oee}%`,           delta: "+11.2pp",  color: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/6" },
          { icon: BarChart3,   label: "OTIF Orders",    base: `${KPI_PROJECTIONS.baseline.otifOrders}/47`,   val: `${KPI_PROJECTIONS.projected.otifOrders}/47`,   delta: "+4 orders", color: "text-teal-400",    border: "border-teal-500/20",   bg: "bg-teal-500/5" },
          { icon: Zap,         label: "Changeovers",    base: `${KPI_PROJECTIONS.baseline.changeovers}`,     val: `${KPI_PROJECTIONS.projected.changeovers}`,     delta: "−3",        color: "text-sky-400",     border: "border-sky-500/20",    bg: "bg-sky-500/5" },
          { icon: TrendingUp,  label: "Substrate Waste",base: `${KPI_PROJECTIONS.baseline.substrateWastePct}%`, val: `${KPI_PROJECTIONS.projected.substrateWastePct}%`, delta: "−8%",   color: "text-violet-400",  border: "border-violet-500/20", bg: "bg-violet-500/5" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border ${k.border} ${k.bg} px-4 py-2.5 flex items-center gap-4`}
            data-testid={`kpi-${k.label.toLowerCase().replace(/\s/g, "-")}`}>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <k.icon className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/55">{k.label}</span>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.val}</div>
            </div>
            <div className="ml-auto text-right">
              <Badge className={`text-[9px] border ${k.border} ${k.color} mb-1`}>{k.delta}</Badge>
              <div className="text-[9px] text-muted-foreground/35">was {k.base}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content: Gantt (9/12) + Sidebar (3/12) ──────────────────── */}
      <div className={`grid grid-cols-12 gap-3 flex-1 min-h-0 transition-opacity ${proposalDone ? "opacity-100" : "opacity-30"}`}>

        {/* ── Gantt chart — col-span-9 ──────────────────────────────────── */}
        <div className="col-span-9 rounded-xl border border-border/30 bg-card/40 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-[11px] font-bold text-foreground">Production Gantt — Day Shift 07:00–15:00 · Alt A</span>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3">
              {(["rush","changeover","maintenance","buffer","standard"] as SlotType[]).map(t => (
                <div key={t} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded border ${SLOT_STYLES[t].bg} ${SLOT_STYLES[t].border}`} />
                  <span className="text-[8px] text-muted-foreground/45 capitalize">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time axis */}
          <div className="flex mb-1.5 ml-28 shrink-0">
            {["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00"].map(t => (
              <div key={t} className="flex-1 text-[8px] font-mono text-muted-foreground/30 text-center">{t}</div>
            ))}
          </div>

          {/* Machine rows — flex-1 so they share available height evenly */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            {GANTT_MACHINES.map(machine => (
              <div key={machine.id} className="flex items-center gap-2 flex-1 min-h-0" data-testid={`gantt-row-${machine.id}`}>
                {/* Machine label */}
                <div className="w-28 shrink-0 text-right pr-2 flex flex-col justify-center">
                  <div className="text-[9px] font-mono font-bold text-muted-foreground/60">{machine.id}</div>
                  <div className="text-[8px] text-muted-foreground/35 leading-tight">{machine.label}</div>
                </div>
                {/* Timeline */}
                <div className="flex-1 bg-white/[0.02] rounded border border-border/10 relative overflow-hidden" style={{ minHeight: 36 }}>
                  {machine.slots.map((slot, i) => {
                    const left  = timeToX(slot.start);
                    const width = durationPct(slot.start, slot.end);
                    const st    = SLOT_STYLES[slot.type as SlotType];
                    const label = shortLabel(slot.label, slot.type as SlotType);
                    const isRush = slot.type === "rush";
                    return (
                      <div
                        key={i}
                        className={`absolute inset-y-0 flex flex-col justify-center px-1.5 ${st.bg} border-l border-r ${st.border}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${slot.start}–${slot.end}: ${slot.label}`}
                      >
                        {width > 4 && (
                          <span className={`text-[8px] font-mono leading-none ${st.text} ${isRush ? "font-bold" : ""} truncate`}>
                            {isRush ? "🔴 " : ""}{slot.start}–{slot.end}
                          </span>
                        )}
                        {width > 11 && (
                          <span className={`text-[7px] leading-none mt-0.5 truncate ${st.text} opacity-75`}>
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border/15 shrink-0 text-[9px] text-muted-foreground/35 text-center">
            2 orders deferred to Night Shift (B-Flute resupply) · 14 changeovers · M3 maintenance 10:00–11:30 respected
          </div>
        </div>

        {/* ── Right sidebar — col-span-3 ─────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto">

          {/* RUSH confirmation */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 p-3.5 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Coverage</span>
              <Badge className="ml-auto text-[8px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">3/3</Badge>
            </div>
            {RUSH_ORDERS.map(o => (
              <div key={o.orderId} className="mb-1.5 last:mb-0" data-testid={`rush-confirm-${o.orderId}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-foreground/80">{o.customer}</span>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-[9px] text-emerald-400">{o.scheduledComplete}</span>
                  </div>
                </div>
                <div className="text-[8px] text-muted-foreground/45">{o.machine} · by {o.deadline}</div>
              </div>
            ))}
            <div className="mt-1.5 pt-1.5 border-t border-emerald-500/15 text-[8px] text-emerald-400/70">
              All 3 on-time · 2–3h margin
            </div>
          </div>

          {/* Plant Planner Gate — Approval + Commit merged */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-3.5 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold text-foreground">Plant Planner Gate</span>
            </div>

            {/* Approval */}
            <div className="flex flex-col gap-1.5 mb-3">
              {[
                ["Ticket",   KPI_PROJECTIONS.approvalId,    "font-mono text-foreground"],
                ["Approver", KPI_PROJECTIONS.approver,      "text-foreground"],
                ["SLA",      "15 minutes",                  "text-foreground"],
                ["Channel",  "Kiwiplan Dashboard",          "text-muted-foreground/55"],
              ].map(([k, v, cls]) => (
                <div key={k} className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground/45">{k}</span>
                  <span className={cls as string}>{v}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-[10px] pt-0.5">
                <span className="text-muted-foreground/45">Status</span>
                <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/25 animate-pulse"
                  data-testid="badge-approval-status">Awaiting</Badge>
              </div>
            </div>

            <div className="border-t border-border/20 mb-3" />

            {/* Kiwiplan commit */}
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className={`w-3 h-3 ${isComplete ? "text-emerald-400" : "text-muted-foreground/25"}`} />
              <span className={`text-[10px] font-semibold ${isComplete ? "text-emerald-400" : "text-muted-foreground/30"}`}>
                Kiwiplan Commit
              </span>
            </div>
            {[
              ["Schedule ID", KPI_PROJECTIONS.kiwiplanScheduleId, true],
              ["MES Board",   "Updated",     false],
              ["Operators",   "4 notified",  false],
              ["Rollback",    "30 min window", false],
            ].map(([k, v, mono]) => (
              <div key={k as string} className="flex justify-between text-[10px] mb-1">
                <span className="text-muted-foreground/45">{k}</span>
                <span className={`${isComplete ? (mono ? "font-mono font-bold text-emerald-400" : "text-emerald-400") : "text-muted-foreground/25"}`}>{v}</span>
              </div>
            ))}
          </div>

          {/* Annual impact */}
          <div className="rounded-xl border border-border/20 bg-card/30 p-3.5 shrink-0">
            <div className="text-[10px] font-semibold text-muted-foreground/55 uppercase tracking-wide mb-2">Annual Impact</div>
            {[
              ["OEE revenue",         "+$214K / yr"],
              ["Changeover savings",  "+$28K / yr"],
              ["OTIF gain",           "+8.5pp → 95%"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[10px] mb-1 last:mb-0">
                <span className="text-muted-foreground/55">{k}</span>
                <span className="font-bold" style={{ color: PKG_COLOR }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
