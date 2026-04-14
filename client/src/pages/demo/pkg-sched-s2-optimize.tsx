import { Badge } from "@/components/ui/badge";
import { Cpu, CheckCircle2, TrendingUp, BarChart3, Zap, Lock } from "lucide-react";
import {
  PKG_COLOR, SCHEDULE_ALTERNATIVES, PKG_SCHED_PIPELINE_STEPS, RUSH_ORDERS,
  type PkgPipelineState,
} from "./pkg-sched-constants";

function DeltaBadge({ value, good }: { value: string; good: boolean }) {
  const cls = good ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-amber-500/15 text-amber-400 border-amber-500/25";
  return <Badge className={`text-[9px] border ${cls}`}>{value}</Badge>;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS2Optimize({ pipelineState }: Props) {
  const { results, phase1Done, phase2Done, parallelRunning, status } = pipelineState;

  const optimizerRunning = !!(
    status === "running" && phase1Done && !phase2Done &&
    !results.some(r => r.role === "schedule_optimization")
  );
  const optimizerDone = results.some(r => r.role === "schedule_optimization") || phase2Done;
  const showData = optimizerDone;

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-3">

      {/* ── 4-step pipeline strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
        {PKG_SCHED_PIPELINE_STEPS.map((step, i) => {
          const done = results.some(r => r.role === step.role) ||
            (step.role === "order_intelligence"    && phase1Done) ||
            (step.role === "capacity_mapping"      && phase1Done) ||
            (step.role === "schedule_optimization" && phase2Done) ||
            (step.role === "schedule_proposal"     && pipelineState.phase3Done);
          const running = parallelRunning.includes(step.agentCode) ||
            (step.role === "schedule_optimization" && optimizerRunning);

          const borderCls = done ? "border-emerald-500/30" : running ? step.borderColor : "border-border/15";
          const bgCls     = done ? "bg-emerald-500/6"     : running ? step.bgColor     : "bg-card/15";
          const opacity   = !done && !running ? "opacity-35" : "";

          return (
            <div key={step.role} className={`rounded-xl border px-3 py-2.5 transition-all ${borderCls} ${bgCls} ${opacity}`}
              data-testid={`pipeline-step-${step.role}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-mono uppercase tracking-wide ${done ? "text-emerald-400" : running ? step.color : "text-muted-foreground/40"}`}>
                  {step.agentCode}
                </span>
                {done    && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {running && <span className="text-[8px] text-amber-400 animate-pulse">⬤ running</span>}
                {!done && !running && <Lock className="w-2.5 h-2.5 text-muted-foreground/25" />}
              </div>
              <div className={`text-[11px] font-semibold ${done ? "text-emerald-300" : running ? "text-foreground" : "text-muted-foreground/35"}`}>
                {step.label}
              </div>
              <div className={`text-[9px] mt-0.5 ${done ? "text-emerald-400" : running ? "text-foreground/60 animate-pulse" : "text-muted-foreground/25"}`}>
                {done ? "✓ complete" : running ? "processing…" : "waiting"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alternatives grid — asymmetric: recommended 2/3, others 1/3 ──── */}
      <div className={`grid grid-cols-12 gap-3 flex-1 min-h-0 transition-opacity ${showData ? "opacity-100" : "opacity-25"}`}>

        {/* ── Recommended (Alternative A) — wide card ───────────────────── */}
        {(() => {
          const alt = SCHEDULE_ALTERNATIVES[0];
          return (
            <div className="col-span-7 rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-5 flex flex-col"
              data-testid="card-alternative-ALT-A">
              {/* Header */}
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">{alt.label}</span>
                    <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">★ Recommended</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">{alt.sublabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-muted-foreground/40 uppercase">Composite Score</div>
                  <div className="text-2xl font-bold text-emerald-400 tabular-nums">{alt.compositeScore}</div>
                </div>
              </div>

              {/* Score bar */}
              <div className="mb-4 mt-1">
                <ScoreBar score={alt.compositeScore} color="#10b981" />
              </div>

              {/* KPI grid — 2×2 */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { icon: TrendingUp, label: "OEE",          value: `${alt.oee}%`,        delta: alt.oeeDelta },
                  { icon: BarChart3,  label: "OTIF Orders",  value: `${alt.otifOrders}/47`, delta: alt.otifDelta },
                  { icon: Zap,        label: "Changeovers",  value: `${alt.changeovers}`,   delta: alt.changeoverDelta },
                  { icon: CheckCircle2, label: "RUSH Cover", value: alt.rushCoverage,        delta: "All on-time" },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <kpi.icon className="w-3 h-3 text-muted-foreground/40" />
                      <span className="text-[9px] text-muted-foreground/60">{kpi.label}</span>
                    </div>
                    <div className="text-lg font-bold text-emerald-400 tabular-nums">{kpi.value}</div>
                    <DeltaBadge value={kpi.delta} good={true} />
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4">
                {alt.description}
              </div>

              {/* RUSH details */}
              {showData && (
                <div className="mt-auto pt-3 border-t border-emerald-500/15">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Order Schedule</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {RUSH_ORDERS.map(o => (
                      <div key={o.orderId} className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground/70">{o.customer} · {o.machine}</span>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Done {o.scheduledComplete} · Deadline {o.deadline}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Alternatives B & C — stacked in the right third ──────────── */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">
          {SCHEDULE_ALTERNATIVES.slice(1).map(alt => (
            <div key={alt.id} className="flex-1 rounded-xl border border-border/25 bg-card/30 p-4 flex flex-col"
              data-testid={`card-alternative-${alt.id}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-foreground">{alt.label}</div>
                  <div className="text-[10px] text-muted-foreground/55 mt-0.5">{alt.sublabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-muted-foreground/40">Score</div>
                  <div className="text-lg font-bold text-muted-foreground/80 tabular-nums">{alt.compositeScore}</div>
                </div>
              </div>
              <div className="mb-3">
                <ScoreBar score={alt.compositeScore} color="#6b7280" />
              </div>

              {/* Compact 2-col KPI */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: "OEE",         value: `${alt.oee}%`,         delta: alt.oeeDelta },
                  { label: "OTIF",        value: `${alt.otifOrders}/47`, delta: alt.otifDelta },
                  { label: "Changeovers", value: `${alt.changeovers}`,   delta: alt.changeoverDelta },
                  { label: "RUSH Cover",  value: alt.rushCoverage,        delta: "All on-time" },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-md border border-border/15 bg-card/20 px-2.5 py-2">
                    <div className="text-[9px] text-muted-foreground/50 mb-0.5">{kpi.label}</div>
                    <div className="text-sm font-bold text-foreground">{kpi.value}</div>
                    <DeltaBadge value={kpi.delta} good={true} />
                  </div>
                ))}
              </div>

              <div className="text-[9px] text-muted-foreground/60 leading-relaxed mt-auto">
                {alt.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pareto recommendation banner ─────────────────────────────────── */}
      {optimizerDone && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">Pareto-Optimal: Alternative A — OEE-Priority</span>
          </div>
          <div className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Alternative A achieves the highest composite score (87.4) — maximising OEE at 82.2% (+11.2pp) through substrate batch clustering while covering all 3 RUSH orders with margins of 2–3 hours. Recommendation passed to PKG-004 for proposal formatting.
          </div>
        </div>
      )}
    </div>
  );
}
