import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, TrendingUp, BarChart3, Zap, Lock, ChevronRight, Star } from "lucide-react";
import {
  PKG_COLOR, SCHEDULE_ALTERNATIVES, PKG_SCHED_PIPELINE_STEPS, RUSH_ORDERS,
  type PkgPipelineState,
} from "./pkg-sched-constants";

function ScoreArc({ score, color }: { score: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform="rotate(-90 36 36)" strokeOpacity={0.85} />
      <text x={36} y={39} textAnchor="middle" fontSize={13} fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

const ALT_COLORS: Record<string, string> = {
  "ALT-A": "#10b981",
  "ALT-B": "#60a5fa",
  "ALT-C": "#a78bfa",
};

interface Props { pipelineState: PkgPipelineState; }

export default function PkgSchedS2Optimize({ pipelineState }: Props) {
  const [selectedAlt, setSelectedAlt] = useState("ALT-A");
  const { results, phase1Done, phase2Done, parallelRunning, status } = pipelineState;

  const optimizerRunning = !!(
    status === "running" && phase1Done && !phase2Done &&
    !results.some(r => r.role === "schedule_optimization")
  );
  const optimizerDone  = results.some(r => r.role === "schedule_optimization") || phase2Done;
  const selectedData   = SCHEDULE_ALTERNATIVES.find(a => a.id === selectedAlt) ?? SCHEDULE_ALTERNATIVES[0];
  const altColor       = ALT_COLORS[selectedAlt] ?? "#10b981";

  return (
    <div className="flex flex-col h-full px-5 py-3 gap-3 overflow-hidden">

      {/* ── Pipeline status strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
        {PKG_SCHED_PIPELINE_STEPS.map(step => {
          const done = results.some(r => r.role === step.role) ||
            (step.role === "order_intelligence"    && phase1Done) ||
            (step.role === "capacity_mapping"      && phase1Done) ||
            (step.role === "schedule_optimization" && phase2Done) ||
            (step.role === "schedule_proposal"     && pipelineState.phase3Done);
          const running = parallelRunning.includes(step.agentCode) ||
            (step.role === "schedule_optimization" && optimizerRunning);

          return (
            <div key={step.role}
              className={`rounded-xl border px-3 py-2 flex items-center gap-3 transition-all ${
                done    ? "border-emerald-500/30 bg-emerald-500/6"
                : running ? `${step.borderColor} ${step.bgColor}`
                :           "border-border/15 bg-card/10 opacity-35"
              }`}
              data-testid={`pipeline-step-${step.role}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                done ? "bg-emerald-500/15" : running ? "bg-white/8" : "bg-white/4"
              }`}>
                {done    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                : running ? <span className="text-[8px] animate-pulse" style={{ color: PKG_COLOR }}>⬤</span>
                :           <Lock className="w-3 h-3 text-muted-foreground/25" />}
              </div>
              <div>
                <div className={`text-[9px] font-mono uppercase ${done ? "text-emerald-400" : running ? step.color : "text-muted-foreground/35"}`}>
                  {step.agentCode}
                </div>
                <div className={`text-[10px] font-semibold ${done ? "text-emerald-300" : running ? "text-foreground" : "text-muted-foreground/30"}`}>
                  {step.label}
                </div>
              </div>
              {done && (
                <span className="ml-auto text-[8px] text-emerald-400/60">done</span>
              )}
              {running && (
                <span className="ml-auto text-[8px] text-amber-400/80 animate-pulse">running…</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Alternative selector cards + detail panel ────────────────────── */}
      <div className={`flex gap-3 flex-1 min-h-0 transition-opacity duration-300 ${optimizerDone ? "opacity-100" : "opacity-20 pointer-events-none"}`}>

        {/* LEFT — selector cards (stacked vertically) */}
        <div className="flex flex-col gap-2 w-56 shrink-0">
          <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide px-1 mb-0.5">
            {optimizerDone ? "3 Alternatives Generated — Select to Compare" : "Generating Alternatives…"}
          </div>
          {SCHEDULE_ALTERNATIVES.map(alt => {
            const isSelected = selectedAlt === alt.id;
            const color      = ALT_COLORS[alt.id];
            return (
              <button
                key={alt.id}
                data-testid={`selector-alt-${alt.id}`}
                onClick={() => setSelectedAlt(alt.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-all cursor-pointer ${
                  isSelected
                    ? "border-opacity-60 shadow-sm"
                    : "border-border/20 bg-card/25 hover:border-border/45 hover:bg-card/40"
                }`}
                style={isSelected ? {
                  borderColor: `${color}55`,
                  background: `${color}0d`,
                  boxShadow: `0 0 0 1px ${color}25`,
                } : {}}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-foreground">{alt.label}</span>
                      {alt.recommended && (
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground/55 mt-0.5">{alt.sublabel}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-xl font-bold tabular-nums" style={{ color }}>{alt.compositeScore}</div>
                    <div className="text-[8px] text-muted-foreground/40">score</div>
                  </div>
                </div>
                {/* Mini KPI row */}
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {[
                    { label: "OEE",   value: `${alt.oee}%`,          delta: alt.oeeDelta },
                    { label: "OTIF",  value: `${alt.otifOrders}/47`,  delta: alt.otifDelta },
                  ].map(k => (
                    <div key={k.label} className="rounded-md bg-white/4 border border-white/6 px-2 py-1.5">
                      <div className="text-[8px] text-muted-foreground/45">{k.label}</div>
                      <div className="text-[11px] font-bold text-foreground">{k.value}</div>
                      <div className="text-[8px]" style={{ color }}>{k.delta}</div>
                    </div>
                  ))}
                </div>
                {isSelected && (
                  <div className="mt-2 flex items-center gap-1 text-[9px] font-medium" style={{ color }}>
                    <ChevronRight className="w-3 h-3" />
                    <span>Viewing details →</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* RIGHT — full detail panel for selected alternative */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">

          {/* Detail card header */}
          <div className="rounded-xl border p-5 shrink-0"
            style={{
              borderColor: `${altColor}40`,
              background: `${altColor}08`,
            }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-foreground">{selectedData.label}</h2>
                  {selectedData.recommended && (
                    <Badge className="text-[10px] border" style={{ background: `${altColor}20`, borderColor: `${altColor}40`, color: altColor }}>
                      ★ PKG-003 Recommended
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/70">{selectedData.sublabel}</p>
              </div>
              <ScoreArc score={selectedData.compositeScore} color={altColor} />
            </div>

            {/* KPI grid — 4 across */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: TrendingUp,   label: "OEE",              value: `${selectedData.oee}%`,          delta: selectedData.oeeDelta,          baseline: "71.0% baseline" },
                { icon: BarChart3,    label: "OTIF Orders",      value: `${selectedData.otifOrders}/47`,  delta: selectedData.otifDelta,          baseline: "40/47 baseline" },
                { icon: Zap,          label: "Changeovers",      value: `${selectedData.changeovers}`,    delta: selectedData.changeoverDelta,    baseline: "17 baseline" },
                { icon: CheckCircle2, label: "Substrate Waste",  value: `${selectedData.substrateWastePct}%`, delta: selectedData.substrateDelta, baseline: "9.2% baseline" },
              ].map(k => (
                <div key={k.label} className="rounded-xl border px-4 py-3"
                  style={{ borderColor: `${altColor}25`, background: `${altColor}0a` }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <k.icon className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground/60">{k.label}</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums mb-1" style={{ color: altColor }}>{k.value}</div>
                  <Badge className="text-[9px] border" style={{ background: `${altColor}20`, borderColor: `${altColor}35`, color: altColor }}>
                    {k.delta}
                  </Badge>
                  <div className="text-[8px] text-muted-foreground/35 mt-1">{k.baseline}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Description + RUSH details side by side */}
          <div className="grid grid-cols-2 gap-3 shrink-0">

            {/* Rationale */}
            <div className="rounded-xl border border-border/25 bg-card/30 p-4">
              <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">
                Optimizer Rationale
              </div>
              <p className="text-[11px] text-foreground/80 leading-relaxed">
                {selectedData.description}
              </p>
              <div className="mt-3 flex items-center gap-4 text-[10px]">
                <div>
                  <span className="text-muted-foreground/50">Changeovers: </span>
                  <span className="font-bold text-foreground">{selectedData.changeovers}</span>
                  <span className="ml-1" style={{ color: altColor }}>{selectedData.changeoverDelta}</span>
                </div>
                <div>
                  <span className="text-muted-foreground/50">Substrate waste: </span>
                  <span className="font-bold text-foreground">{selectedData.substrateWastePct}%</span>
                  <span className="ml-1" style={{ color: altColor }}>{selectedData.substrateDelta}</span>
                </div>
              </div>
            </div>

            {/* RUSH order coverage */}
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">RUSH Coverage</div>
                <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">{selectedData.rushCoverage} on-time</Badge>
              </div>
              {RUSH_ORDERS.map(o => (
                <div key={o.orderId} className="flex items-center justify-between mb-2 last:mb-0 text-[10px]">
                  <div>
                    <div className="font-semibold text-foreground/90">{o.customer}</div>
                    <div className="text-muted-foreground/55">{o.machine} · Deadline {o.deadline}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Done {o.scheduledComplete}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pareto recommendation (only if viewing Alt A) */}
          {optimizerDone && selectedAlt === "ALT-A" && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 px-5 py-3.5 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">PKG-003 Recommendation: Alternative A — Pareto-optimal</span>
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                Alternative A achieves the highest composite score (87.4) — maximising OEE at 82.2% (+11.2pp) through substrate batch clustering while covering all 3 RUSH orders with 2–3h margins. Recommendation passed to PKG-004 for approval & Kiwiplan commit.
              </p>
            </div>
          )}
          {optimizerDone && selectedAlt !== "ALT-A" && (
            <div className="rounded-xl border border-border/25 bg-card/30 px-5 py-3 shrink-0">
              <div className="text-[11px] text-muted-foreground/70">
                <span className="font-semibold text-foreground">Comparing with recommended:</span> Alternative A scores {SCHEDULE_ALTERNATIVES[0].compositeScore} vs {selectedData.compositeScore} for {selectedData.label}. PKG-003 recommends Alternative A for the best combined OEE + OTIF outcome.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Placeholder when not yet generated */}
      {!optimizerDone && (
        <div className={`flex-1 flex items-center justify-center text-center transition-opacity ${optimizerRunning ? "opacity-100" : "opacity-50"}`}>
          <div>
            <div className="text-[13px] font-semibold text-foreground/60 mb-1">
              {optimizerRunning ? "PKG-003 is running the constraint solver…" : "Waiting for Phase 1 agents to complete"}
            </div>
            <div className="text-[11px] text-muted-foreground/40">
              {optimizerRunning ? "Evaluating 47 orders across 8 machines — 3 alternatives generating" : "PKG-001 + PKG-002 must finish before optimization can begin"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
