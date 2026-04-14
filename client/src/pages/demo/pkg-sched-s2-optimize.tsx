import { Badge } from "@/components/ui/badge";
import { Cpu, CheckCircle2, TrendingUp, BarChart3, Zap } from "lucide-react";
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
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS2Optimize({ pipelineState }: Props) {
  const { results, phase1Done, phase2Done, parallelRunning, status } = pipelineState;

  const optimizerRunning = !!(
    status === "running" &&
    phase1Done &&
    !phase2Done &&
    !results.some(r => r.role === "schedule_optimization")
  );
  const optimizerDone = results.some(r => r.role === "schedule_optimization") || phase2Done;

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-4">

      {/* ── PKG-003 agent header ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card/40 px-5 py-3.5 flex items-center gap-4 shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,131,143,0.15)", border: "1px solid rgba(0,131,143,0.25)" }}>
          <Cpu className="w-4 h-4" style={{ color: PKG_COLOR }} />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">PKG-003 — Schedule Optimization Agent</div>
          <div className="text-[10px] text-muted-foreground/60">Constraint solver · 47 orders · 8 machines · 480-minute window · 3 alternatives</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {optimizerRunning && (
            <Badge className="text-[9px] border animate-pulse" style={{ background: "rgba(0,131,143,0.15)", borderColor: "rgba(0,131,143,0.35)", color: PKG_COLOR }}>
              ⬤ Running solver…
            </Badge>
          )}
          {optimizerDone && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-400">Solver complete — Alternative A recommended</span>
            </div>
          )}
          {!optimizerRunning && !optimizerDone && (
            <span className="text-[10px] text-muted-foreground/40">Awaiting Phase 1 completion…</span>
          )}
        </div>
      </div>

      {/* ── Phase pipeline status ─────────────────────────────────────────── */}
      <div className="flex gap-2 shrink-0">
        {PKG_SCHED_PIPELINE_STEPS.map((step, i) => {
          const done = results.some(r => r.role === step.role) ||
            (step.role === "order_intelligence" && phase1Done) ||
            (step.role === "capacity_mapping"   && phase1Done) ||
            (step.role === "schedule_optimization" && phase2Done) ||
            (step.role === "schedule_proposal"  && pipelineState.phase3Done);
          const running = parallelRunning.includes(step.agentCode) || (step.role === "schedule_optimization" && optimizerRunning);

          return (
            <div key={step.role} className={`flex-1 rounded-lg border px-2.5 py-2 ${done ? "border-emerald-500/25 bg-emerald-500/6" : running ? `${step.borderColor} ${step.bgColor}` : "border-border/20 bg-card/20 opacity-40"}`}>
              <div className={`text-[9px] font-mono uppercase ${done ? "text-emerald-400" : running ? step.color : "text-muted-foreground/40"}`}>{step.agentCode}</div>
              <div className={`text-[10px] font-semibold mt-0.5 ${done ? "text-emerald-300" : running ? "text-foreground" : "text-muted-foreground/40"}`}>{step.label}</div>
              <div className={`text-[9px] mt-0.5 ${done ? "text-emerald-400" : running ? "text-foreground/60 animate-pulse" : "text-muted-foreground/30"}`}>
                {done ? "✓ complete" : running ? "⬤ running" : "waiting"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Three alternatives grid ───────────────────────────────────────── */}
      <div className="flex gap-3 min-h-0">
        {SCHEDULE_ALTERNATIVES.map(alt => {
          const showData = optimizerDone;
          return (
            <div
              key={alt.id}
              data-testid={`card-alternative-${alt.id}`}
              className={`flex-1 rounded-xl border p-4 transition-all ${
                alt.recommended
                  ? "border-emerald-500/35 bg-emerald-500/6"
                  : "border-border/25 bg-card/30"
              } ${!showData ? "opacity-30" : ""}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs font-bold text-foreground">{alt.label}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{alt.sublabel}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {alt.recommended && (
                    <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                      ★ Recommended
                    </Badge>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground/50">Score</span>
                </div>
              </div>

              {/* Composite score bar */}
              <div className="mb-3">
                <ScoreBar score={alt.compositeScore} color={alt.recommended ? "#10b981" : "#6b7280"} />
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`rounded-lg p-2 border ${alt.recommended ? "border-emerald-500/20 bg-emerald-500/8" : "border-border/15 bg-card/20"}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="w-2.5 h-2.5 text-muted-foreground/50" />
                    <span className="text-[9px] text-muted-foreground/60">OEE</span>
                  </div>
                  <div className={`text-base font-bold ${alt.recommended ? "text-emerald-400" : "text-foreground"}`}>{alt.oee}%</div>
                  <DeltaBadge value={alt.oeeDelta} good={true} />
                </div>
                <div className={`rounded-lg p-2 border ${alt.recommended ? "border-emerald-500/20 bg-emerald-500/8" : "border-border/15 bg-card/20"}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <BarChart3 className="w-2.5 h-2.5 text-muted-foreground/50" />
                    <span className="text-[9px] text-muted-foreground/60">OTIF Orders</span>
                  </div>
                  <div className={`text-base font-bold ${alt.recommended ? "text-emerald-400" : "text-foreground"}`}>{alt.otifOrders}/47</div>
                  <DeltaBadge value={alt.otifDelta} good={true} />
                </div>
                <div className="rounded-lg p-2 border border-border/15 bg-card/20">
                  <div className="text-[9px] text-muted-foreground/60 mb-0.5">Changeovers</div>
                  <div className="text-sm font-bold text-foreground">{alt.changeovers}</div>
                  <DeltaBadge value={alt.changeoverDelta} good={true} />
                </div>
                <div className="rounded-lg p-2 border border-border/15 bg-card/20">
                  <div className="text-[9px] text-muted-foreground/60 mb-0.5">RUSH Coverage</div>
                  <div className="text-sm font-bold text-foreground">{alt.rushCoverage}</div>
                  <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">All on-time</Badge>
                </div>
              </div>

              {/* Description */}
              <div className="text-[9px] text-muted-foreground/60 leading-relaxed">{alt.description}</div>

              {/* RUSH coverage detail (winning only) */}
              {alt.recommended && showData && (
                <div className="mt-3 pt-3 border-t border-emerald-500/15">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Zap className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Order Schedule</span>
                  </div>
                  {RUSH_ORDERS.map(o => (
                    <div key={o.orderId} className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-muted-foreground/70">{o.customer} · {o.machine}</span>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-emerald-400">Done {o.scheduledComplete} · Deadline {o.deadline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pareto recommendation banner (post-completion) ────────────────── */}
      {optimizerDone && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">Pareto-Optimal Recommendation: Alternative A — OEE-Priority</span>
          </div>
          <div className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Alternative A achieves the highest composite score (87.4) — maximising OEE at 82.2% (+11.2pp) through substrate batch clustering while covering all 3 RUSH orders with margins of 2–3 hours. Alternative B adds one more OTIF order but at the cost of 2 additional changeovers and 2.6pp OEE loss. Recommendation passed to PKG-004 for proposal formatting.
          </div>
        </div>
      )}
    </div>
  );
}
