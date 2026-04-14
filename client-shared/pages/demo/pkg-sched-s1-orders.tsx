import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, Package, Cpu, Layers, ArrowRight, Zap } from "lucide-react";
import {
  PKG_COLOR, SHIFT_CONTEXT, RUSH_ORDERS, MACHINES, ROLL_STOCK, PKG_SCHED_PIPELINE_STEPS,
  PKG_AGT_001_CODE, PKG_AGT_002_CODE,
  type PkgPipelineState,
} from "./pkg-sched-constants";

function RiskBadge({ score }: { score: number }) {
  const level = score >= 85 ? "CRITICAL" : score >= 70 ? "HIGH" : "MEDIUM";
  const cls   = score >= 85 ? "bg-red-500/15 text-red-400 border-red-500/25"
              : score >= 70  ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
              :                "bg-amber-500/15 text-amber-400 border-amber-500/25";
  return <Badge className={`text-[9px] border ${cls}`}>{level} {score}</Badge>;
}

function PhaseTag({ code, running, done }: { code: string; running: boolean; done: boolean }) {
  if (done)    return <span className="text-[9px] font-mono text-emerald-400">✓</span>;
  if (running) return <span className="text-[8px] font-mono text-teal-400 animate-pulse">⬤ running</span>;
  return <span className="text-[8px] font-mono text-muted-foreground/30">idle</span>;
}

interface Props { pipelineState: PkgPipelineState; onRun: () => void; }

export default function PkgSchedS1Orders({ pipelineState, onRun }: Props) {
  const { status, parallelRunning, phase1Done, results } = pipelineState;
  const isRunning   = status === "running";
  const isComplete  = status === "complete" || phase1Done;

  const agent1Done    = results.some(r => r.role === "order_intelligence");
  const agent2Done    = results.some(r => r.role === "capacity_mapping");
  const agent1Running = parallelRunning.includes(PKG_AGT_001_CODE);
  const agent2Running = parallelRunning.includes(PKG_AGT_002_CODE);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-4">

      {/* ── Mission statement ─────────────────────────────────────────────── */}
      <div className="rounded-xl border px-5 py-3.5 flex items-center gap-5 shrink-0"
        style={{ borderColor: "rgba(0,131,143,0.25)", background: "rgba(0,131,143,0.06)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,131,143,0.15)", border: "1px solid rgba(0,131,143,0.30)" }}>
          <Zap className="w-4 h-4" style={{ color: PKG_COLOR }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground">What is Atlas doing?</div>
          <div className="text-[11px] text-muted-foreground/80 mt-0.5">
            Atlas is running <span className="font-semibold text-foreground">4 AI agents</span> to automatically build today's production schedule for Westfield Packaging.
            It will analyse <span className="font-semibold text-foreground">47 orders</span>, resolve a <span className="font-semibold text-amber-400">B-Flute stock constraint</span>, cover <span className="font-semibold text-red-400">3 RUSH deadlines</span>, then generate and commit an optimised schedule directly to <span className="font-semibold text-foreground">Kiwiplan</span> — all without manual planner intervention.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground/50">
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[9px]">PKG-001</span>
            <span className="font-mono text-[9px]">PKG-002</span>
            <span className="text-[8px]">parallel</span>
          </div>
          <ArrowRight className="w-3 h-3" />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[9px]">PKG-003</span>
            <span className="text-[8px]">optimizer</span>
          </div>
          <ArrowRight className="w-3 h-3" />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[9px]">PKG-004</span>
            <span className="text-[8px]">commit</span>
          </div>
        </div>
        {status === "idle" && (
          <button
            data-testid="button-run-pkg-mission"
            onClick={onRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold text-white shrink-0"
            style={{ background: PKG_COLOR }}
          >
            ▶ Run Atlas
          </button>
        )}
        {isRunning && (
          <Badge className="text-[9px] border animate-pulse shrink-0"
            style={{ background: "rgba(0,131,143,0.12)", borderColor: "rgba(0,131,143,0.35)", color: PKG_COLOR }}>
            ⬤ Agents running…
          </Badge>
        )}
        {phase1Done && (
          <div className="flex items-center gap-1.5 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-semibold text-emerald-400">Phase 1 complete</span>
          </div>
        )}
      </div>

      {/* ── Shift context banner ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-card/40 px-5 py-3.5 flex items-center gap-6 shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Plant</span>
          <span className="text-sm font-semibold text-foreground">{SHIFT_CONTEXT.plant}</span>
        </div>
        <div className="w-px h-8 bg-border/30" />
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Shift</span>
          <span className="text-sm font-semibold text-foreground">{SHIFT_CONTEXT.shiftLabel} · {SHIFT_CONTEXT.shiftHours}</span>
        </div>
        <div className="w-px h-8 bg-border/30" />
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Date</span>
          <span className="text-sm font-semibold text-foreground">{SHIFT_CONTEXT.shiftDate}</span>
        </div>
        <div className="w-px h-8 bg-border/30" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Orders</span>
          <span className="text-sm font-bold" style={{ color: PKG_COLOR }}>{SHIFT_CONTEXT.orderCount}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Machines</span>
          <span className="text-sm font-bold" style={{ color: PKG_COLOR }}>{SHIFT_CONTEXT.machineCount}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">RUSH</span>
          <span className="text-sm font-bold text-red-400">{SHIFT_CONTEXT.rushCount}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">B-Flute Stock</span>
          <span className="text-sm font-bold text-amber-400">{SHIFT_CONTEXT.bFluteLevel}%</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">OEE Baseline</span>
          <span className="text-sm font-bold text-foreground">{SHIFT_CONTEXT.oeeBaseline}%</span>
        </div>
      </div>

      {/* ── Two columns: left = order + substrate intel, right = capacity ─── */}
      <div className="flex gap-4 min-h-0">

        {/* Left column */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">

          {/* Agent PKG-001 card */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,131,143,0.15)", border: "1px solid rgba(0,131,143,0.25)" }}>
                  <Package className="w-3 h-3" style={{ color: PKG_COLOR }} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground">PKG-001 — Order Intelligence</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-2">Production Order Intelligence Agent</span>
                </div>
              </div>
              <PhaseTag code={PKG_AGT_001_CODE} running={agent1Running} done={agent1Done} />
            </div>

            {/* 3 RUSH orders */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">3 RUSH Orders at Delivery Risk</span>
              </div>
              {RUSH_ORDERS.map(o => (
                <div key={o.orderId} className="flex items-start justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5" data-testid={`card-rush-order-${o.orderId}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-red-400/80">{o.orderId}</span>
                      <Badge className="text-[8px] bg-red-500/10 text-red-400 border-red-500/20">RUSH</Badge>
                    </div>
                    <div className="text-xs font-semibold text-foreground mt-0.5">{o.customer} · {o.product}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {o.flute}-Flute · {o.qty} · Deadline {o.deadline} · {o.machine}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    <RiskBadge score={o.riskScore} />
                    {isComplete && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] text-emerald-400">Complete {o.scheduledComplete}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Substrate status */}
            <div className="mt-3 pt-3 border-t border-border/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wide">Substrate Inventory Status</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {ROLL_STOCK.map(r => (
                  <div key={r.flute} className={`rounded-lg border px-2.5 py-2 text-center ${r.status === "at_risk" ? "border-amber-500/30 bg-amber-500/8" : "border-border/20 bg-card/20"}`} data-testid={`card-substrate-${r.flute}`}>
                    <div className="text-[11px] font-bold text-foreground">{r.flute}-Flute</div>
                    <div className={`text-[13px] font-bold ${r.status === "at_risk" ? "text-amber-400" : "text-emerald-400"}`}>{r.pct}%</div>
                    <div className={`text-[9px] ${r.status === "at_risk" ? "text-amber-400/80" : "text-muted-foreground/50"}`}>
                      {r.status === "at_risk" ? "⚠ AT RISK" : "OK"}
                    </div>
                  </div>
                ))}
              </div>
              {isComplete && (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-400/90">
                  B-Flute mitigation: 6 orders front-loaded to 07:00–10:45 window — depletion risk eliminated
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right column — PKG-002 Capacity */}
        <div className="flex flex-col gap-4 w-72 shrink-0">
          <div className="rounded-xl border border-border/30 bg-card/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,131,143,0.12)", border: "1px solid rgba(0,131,143,0.20)" }}>
                  <Cpu className="w-3 h-3" style={{ color: PKG_COLOR }} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground">PKG-002 — Capacity Mapper</span>
                </div>
              </div>
              <PhaseTag code={PKG_AGT_002_CODE} running={agent2Running} done={agent2Done} />
            </div>

            <div className="flex flex-col gap-1.5">
              {MACHINES.map(m => {
                const isMaint = m.id === "M3";
                const isReduced = m.id === "M4";
                return (
                  <div key={m.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 border ${isMaint ? "border-orange-500/25 bg-orange-500/6" : isReduced ? "border-amber-500/20 bg-amber-500/5" : "border-border/15 bg-card/20"}`} data-testid={`card-machine-${m.id}`}>
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground/50 mr-1.5">{m.id}</span>
                      <span className="text-[10px] font-semibold text-foreground">{m.label}</span>
                      {m.note && <div className="text-[9px] text-orange-400/80 mt-0.5">{m.note}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isMaint ? (
                        <div className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-orange-400" />
                          <span className="text-[9px] text-orange-400 font-mono">{m.availPct}% avail</span>
                        </div>
                      ) : (
                        <span className={`text-[9px] font-mono ${m.availPct < 100 ? "text-amber-400" : "text-emerald-400"}`}>{m.availPct}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OEE comparison */}
            <div className="mt-3 pt-3 border-t border-border/20">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground/60">OEE Baseline</span>
                <span className="text-[13px] font-bold text-foreground">{SHIFT_CONTEXT.oeeBaseline}%</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-muted-foreground/60">Stretch Target</span>
                <span className="text-[13px] font-bold" style={{ color: PKG_COLOR }}>≥80%</span>
              </div>
              {isComplete && (
                <div className="mt-2 flex justify-between items-center rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold text-emerald-400">Achieved (Alt A)</span>
                  <span className="text-sm font-bold text-emerald-400">82.2%</span>
                </div>
              )}
            </div>
          </div>

          {/* Phase 1 status summary */}
          {(isRunning || isComplete) && (
            <div className="rounded-xl border border-border/30 bg-card/40 px-4 py-3">
              <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-2">Phase 1 — Parallel Analysis</div>
              {PKG_SCHED_PIPELINE_STEPS.filter(s => s.phase === 1).map(step => {
                const done = results.some(r => r.role === step.role);
                const running = parallelRunning.includes(step.agentCode);
                return (
                  <div key={step.role} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 mb-1.5 ${step.bgColor} ${step.borderColor}`}>
                    <span className={`text-[10px] font-semibold ${step.color}`}>{step.agentCode} {step.label}</span>
                    <PhaseTag code={step.agentCode} running={running} done={done} />
                  </div>
                );
              })}
              {phase1Done && (
                <div className="mt-1 text-[10px] text-emerald-400">✓ Phase 1 complete — ready for optimizer</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
