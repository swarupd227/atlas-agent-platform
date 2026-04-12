import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Brain,
  Cpu,
  Loader2,
  RotateCcw,
  Shield,
  Wrench,
  Zap,
  Settings,
  Package,
  CalendarClock,
  BarChart3,
  TrendingUp,
  Lock,
  Users,
  DollarSign,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "running" | "complete";

interface SkillInvoked {
  skillName: string;
  description: string;
  finding: string;
  duration: string;
}

interface ActiveOrder {
  orderId: string;
  partFamily: string;
  quantity: number;
  dueDate: string;
}

interface VibrationAmplitude {
  current: number;
  baseline: number;
  threshold: number;
  unit: string;
}

interface Pipeline {
  id: string;
  stage: string;
  detectedAt: string;
  resolvedAt?: string;
  diagnosisDetails?: {
    rootCause?: string;
    vibrationAmplitude?: VibrationAmplitude;
    bearingStage?: number;
    predictedDaysToFailure?: number;
    skillsInvoked?: SkillInvoked[];
    activeOrders?: ActiveOrder[];
    estimatedFailureCost?: number;
    scheduledMaintenanceCost?: number;
  };
  hypothesis?: {
    confidence?: number;
    primaryHypothesis?: string;
    runbookCandidates?: Array<{
      runbookName: string;
      expectedOutcome: string;
      estimatedDuration: string;
      triggerCondition: string;
    }>;
  };
  remediation?: {
    status?: string;
    runbooksTriggered?: Array<{ runbookName: string; status: string; result: string }>;
    policiesEnforced?: Array<{ policyName: string; rule: string; decision: string; outcome: string }>;
  };
  resolution?: {
    atlasAutonomousActions?: string[];
    requiresHumanAction?: string[];
    withoutAtlas?: string;
  };
  businessImpact?: {
    withAtlas?: string;
    withoutAtlas?: string;
    maintenanceCost?: string;
    downtimeAvoided?: string;
    ordersProtected?: string;
  };
  industryGuardrails?: Array<{ framework: string; constraint: string; status: string }>;
}

interface DemoState {
  status: DemoStatus;
  triggeredAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  pipeline: Pipeline | null;
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES = [
  { key: "detected",    label: "Detect",      icon: Activity,     targetSec: 0  },
  { key: "diagnosed",   label: "Diagnose",    icon: Brain,        targetSec: 25 },
  { key: "hypothesis",  label: "Hypothesize", icon: Cpu,          targetSec: 45 },
  { key: "remediation", label: "Remediate",   icon: Wrench,       targetSec: 65 },
  { key: "resolved",    label: "Validate",    icon: Shield,       targetSec: 95 },
];

function stageIndex(key: string) {
  const i = STAGES.findIndex(s => s.key === key);
  return i >= 0 ? i : 0;
}

function fmtUsd(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function PulsingDot({ color = "bg-amber-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

function ElapsedTimer({ triggeredAt }: { triggeredAt: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = new Date(triggeredAt).getTime();
    const tick = () => setSecs(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [triggeredAt]);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="font-mono tabular-nums">{m > 0 ? `${m}m ` : ""}{s}s</span>;
}

function StageRail({ currentStage }: { currentStage: string }) {
  const cur = stageIndex(currentStage);
  return (
    <div className="flex items-center gap-0" data-testid="stage-rail">
      {STAGES.map((st, i) => {
        const Icon = st.icon;
        const done   = i < cur;
        const active = i === cur;
        return (
          <div key={st.key} className="flex items-center">
            <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
              active ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800" :
              done   ? "opacity-70" : "opacity-30"
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                active ? "bg-amber-600 text-white" :
                done   ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {active ? <Loader2 className="h-4 w-4 animate-spin" /> :
                 done   ? <CheckCircle2 className="h-4 w-4" /> :
                          <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold ${
                active ? "text-amber-700 dark:text-amber-300" :
                done   ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
              }`}>{st.label}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-px w-6 transition-colors ${i < cur ? "bg-green-400" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Vibration Gauge ──────────────────────────────────────────────────────────

function VibrationGauge({ current, baseline, threshold }: { current: number; baseline: number; threshold: number }) {
  const pct = Math.min((current / threshold) * 100, 100);
  const color = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : "bg-green-500";
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>0</span>
        <span className="text-amber-600 font-medium">Threshold {threshold} mm/s²</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground">Baseline: {baseline} mm/s²</span>
        <span className={`text-[11px] font-bold ${pct > 65 ? "text-red-600" : "text-green-600"}`}>{current} mm/s²</span>
      </div>
    </div>
  );
}

// ─── Idle View ────────────────────────────────────────────────────────────────

function IdleView({ onTrigger, isPending }: { onTrigger: () => void; isPending: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <PulsingDot color="bg-green-500" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">AGENT ACTIVE</span>
            </div>
            <p className="text-sm font-semibold">Factory Floor Anomaly Recovery Agent</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monitoring 47 IoT vibration sensors · Predictive maintenance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">CNC-Line-7 Vibration</span>
            </div>
            <p className="text-2xl font-bold text-green-600">4.7 mm/s²</p>
            <p className="text-[11px] text-muted-foreground">Baseline nominal · ISO 10816 Zone A/B</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Production Orders</span>
            </div>
            <p className="text-sm font-semibold text-green-600">3 active orders on track</p>
            <p className="text-[11px] text-muted-foreground">OD-4417, OD-4421, OD-4433 · No schedule risk</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">CNC Equipment Health</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              All Systems Normal
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-2xl font-bold">4.7</p>
              <p className="text-[11px] text-muted-foreground">Vibration (mm/s²)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">Stage 1</p>
              <p className="text-[11px] text-muted-foreground">Bearing wear</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">72+ hrs</p>
              <p className="text-[11px] text-muted-foreground">Pre-failure horizon</p>
            </div>
            <div>
              <p className="text-2xl font-bold">4</p>
              <p className="text-[11px] text-muted-foreground">Compliance frameworks</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ISO 55001", "OSHA CFR 1910.217", "ISO 9001", "IEC 62443"].map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px]">{fw}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 border-amber-200 dark:border-amber-800">
        <CardContent className="pt-6 pb-6 text-center">
          <Wrench className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">Simulate CNC Bearing Wear Incident</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Inject a Stage 3 bearing wear event on CNC-Line-7. Watch Atlas detect the anomaly
            via FFT vibration analysis, classify wear severity, apply OSHA speed restrictions,
            schedule a maintenance window, and reroute production orders — autonomously.
          </p>
          <Button
            data-testid="button-trigger-incident"
            size="lg"
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 px-8"
            onClick={onTrigger}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Trigger Bearing Anomaly
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">Demo completes autonomously in ~95 seconds</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Running View ─────────────────────────────────────────────────────────────

function RunningView({ state }: { state: DemoState }) {
  const { pipeline, triggeredAt, elapsedSeconds } = state;
  if (!pipeline || !triggeredAt) return null;

  const cur  = stageIndex(pipeline.stage);
  const diag = pipeline.diagnosisDetails ?? {};
  const skills: SkillInvoked[] = Array.isArray(diag.skillsInvoked) ? (diag.skillsInvoked as SkillInvoked[]) : [];
  const orders: ActiveOrder[]  = Array.isArray(diag.activeOrders)  ? (diag.activeOrders  as ActiveOrder[])  : [];
  const hyp  = pipeline.hypothesis ?? {};
  const rem  = pipeline.remediation ?? {};
  const runbooks = Array.isArray(rem.runbooksTriggered) ? rem.runbooksTriggered : [];
  const policies = Array.isArray(rem.policiesEnforced)  ? rem.policiesEnforced  : [];
  const vib = diag.vibrationAmplitude ?? { current: 12.3, baseline: 4.7, threshold: 14.1, unit: "mm/s²" };

  const actionLog: Array<{ ts: number; text: string; type: "atlas" | "block" | "info" }> = [
    { ts: 0,  text: "CNC-Line-7 spindle bearing vibration: 12.3 mm/s² — ISO 10816 Zone C/D boundary crossed", type: "atlas" },
    { ts: 2,  text: "CUSUM alert fired · 15-minute rolling window breach · BPFO harmonic 162% above baseline", type: "atlas" },
  ];
  if (cur >= 1) {
    actionLog.push({ ts: 8,  text: "Bearing Wear Classification Skill: Stage 3 pattern detected (confidence 94%)",           type: "atlas" });
    actionLog.push({ ts: 12, text: "Predicted failure window: 8–12 days at current production load",                         type: "info"  });
    actionLog.push({ ts: 15, text: "Production Impact Analysis: 3 orders on CNC-Line-7 — CNC-Line-5 has 34% spare capacity", type: "atlas" });
    actionLog.push({ ts: 20, text: "Failure cost estimate: $340K unplanned vs $12K scheduled maintenance",                   type: "info"  });
  }
  if (cur >= 2) {
    actionLog.push({ ts: 30, text: "Hypothesis: OSHA speed reduction + Saturday maintenance window + order rerouting",       type: "atlas" });
    actionLog.push({ ts: 32, text: "OSHA CFR 1910.217: Stage 3 wear mandates immediate speed restriction — enforcing now",   type: "block" });
    actionLog.push({ ts: 34, text: "Maintenance window optimized: Saturday 02:00–06:00 (lowest demand slot identified)",     type: "atlas" });
  }
  if (cur >= 3) {
    actionLog.push({ ts: 50, text: "MTConnect parameter push: CNC-Line-7 spindle speed reduced to 60% rated RPM",            type: "atlas" });
    actionLog.push({ ts: 52, text: "CMMS WO-28834 raised · SKF 6210-2RS/C3 confirmed in inventory (bin A-14)",              type: "atlas" });
    actionLog.push({ ts: 55, text: "ISO 9001 cert check: CNC-Line-5 certified for all 3 part families ✓",                   type: "atlas" });
    actionLog.push({ ts: 58, text: "ERP update: OD-4417, OD-4421, OD-4433 rerouted to CNC-Line-5 — no schedule impact",    type: "atlas" });
    actionLog.push({ ts: 62, text: "IEC 62443: MTConnect changes logged under service account MFG-SVC-07 with MFA",         type: "info"  });
  }

  const visibleActions = actionLog.filter(a => a.ts <= elapsedSeconds);

  return (
    <div className="space-y-5">
      {/* Active incident banner */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center gap-3">
        <PulsingDot color="bg-amber-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">BEARING ANOMALY DETECTED</span>
            <span className="text-sm text-amber-600 dark:text-amber-400 font-mono">
              <ElapsedTimer triggeredAt={triggeredAt} />
            </span>
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            CNC-Line-7 · Stage 3 Bearing Wear · 10 Days to Predicted Failure
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Failure cost avoided</p>
          <p className="text-xl font-bold text-amber-600">{fmtUsd(diag.estimatedFailureCost ?? 340000)}</p>
        </div>
      </div>

      {/* Stage rail */}
      <Card>
        <CardContent className="pt-4 pb-4 overflow-x-auto">
          <StageRail currentStage={pipeline.stage} />
        </CardContent>
      </Card>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: stage detail */}
        <div className="space-y-4">
          {/* Detect */}
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-semibold">Detect</span>
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+0s</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-3">
              <VibrationGauge current={vib.current} baseline={vib.baseline} threshold={vib.threshold} />
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-red-600">Stage {diag.bearingStage ?? 3}</p>
                  <p className="text-[10px] text-muted-foreground">Bearing wear</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{diag.predictedDaysToFailure ?? 10} days</p>
                  <p className="text-[10px] text-muted-foreground">To predicted failure</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">IoT sensor: BPFO harmonic at 3× (187.5 Hz) · Detection latency: &lt;15 minutes vs shift-end manual check</p>
            </CardContent>
          </Card>

          {/* Diagnose */}
          {cur >= 1 && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm font-semibold">Diagnose</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+25s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Root Cause</p>
                <p className="text-sm">{diag.rootCause}</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{fmtUsd(diag.estimatedFailureCost ?? 340000)}</p>
                    <p className="text-[10px] text-muted-foreground">Unplanned failure cost</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-green-600">{fmtUsd(diag.scheduledMaintenanceCost ?? 12000)}</p>
                    <p className="text-[10px] text-muted-foreground">Planned maintenance</p>
                  </div>
                </div>
                {/* Active orders */}
                {orders.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Orders at risk</p>
                    {orders.map((o, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">{o.orderId}</span>
                        <span className="text-muted-foreground">— {o.partFamily} ({o.quantity} pcs)</span>
                      </div>
                    ))}
                  </div>
                )}
                {skills.slice(0, 2).map((sk, i) => (
                  <div key={i} className="text-[11px] bg-muted/50 rounded px-2 py-1.5">
                    <span className="font-medium">{sk.skillName}:</span>{" "}
                    <span className="text-muted-foreground">{sk.finding}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Hypothesize */}
          {cur >= 2 && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm font-semibold">Hypothesize</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+45s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Confidence</span>
                  <span className="font-bold text-green-600">{((hyp.confidence ?? 0.94) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm">{hyp.primaryHypothesis}</p>
                {Array.isArray(hyp.runbookCandidates) && hyp.runbookCandidates.map((rb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5">
                    <CalendarClock className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">{rb.runbookName}</span>
                      <span className="text-muted-foreground"> · {rb.estimatedDuration}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Remediate */}
          {cur >= 3 && (
            <Card className={cur >= 4 ? "border-green-200 dark:border-green-800" : "border-amber-200 dark:border-amber-800"}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {cur >= 4
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Loader2 className="h-4 w-4 text-amber-600 animate-spin shrink-0" />}
                  <span className="text-sm font-semibold">Remediate</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+65s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {runbooks.map((rb: any, i: number) => (
                  <div key={i} className={`text-[11px] rounded px-2 py-1.5 ${rb.status === "completed" ? "bg-green-50 dark:bg-green-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
                    <span className="font-medium">{rb.runbookName}:</span>{" "}
                    <span className="text-muted-foreground">{rb.result}</span>
                  </div>
                ))}
                {policies.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-1.5">
                    <Lock className="h-3 w-3 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">{p.policyName}: </span>
                      <span className="text-muted-foreground">{p.decision}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: live action log + guardrails */}
        <div className="space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-600 animate-pulse" />
                <span className="text-sm font-semibold">Agent Action Log</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                  LIVE
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="space-y-2">
                {visibleActions.map((action, i) => (
                  <div key={i} data-testid={`action-log-item-${i}`} className="flex items-start gap-2 text-[11px]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      action.type === "atlas" ? "bg-amber-500" :
                      action.type === "block" ? "bg-orange-500" : "bg-muted-foreground"
                    }`} />
                    <div className="flex-1">
                      <span className={
                        action.type === "block" ? "text-orange-700 dark:text-orange-400 font-medium" :
                        action.type === "atlas" ? "text-foreground" : "text-muted-foreground"
                      }>{action.text}</span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0">T+{action.ts}s</span>
                  </div>
                ))}
                {visibleActions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Bearing anomaly detected — Atlas is analysing...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {cur >= 3 && Array.isArray(pipeline.industryGuardrails) && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold">Regulatory Guardrails Enforced</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {(pipeline.industryGuardrails as any[]).map((g: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">{g.framework}: </span>
                      <span className="text-muted-foreground">{g.constraint}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Complete View ────────────────────────────────────────────────────────────

function CompleteView({ state, onReset }: { state: DemoState; onReset: () => void }) {
  const { pipeline, triggeredAt, completedAt, elapsedSeconds } = state;
  if (!pipeline) return null;

  const elapsed = triggeredAt && completedAt
    ? Math.floor((new Date(completedAt).getTime() - new Date(triggeredAt).getTime()) / 1000)
    : elapsedSeconds;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;

  const res = pipeline.resolution ?? {};
  const atlasActions: string[] = Array.isArray(res.atlasAutonomousActions) ? res.atlasAutonomousActions as string[] : [];
  const humanActions: string[] = Array.isArray(res.requiresHumanAction)    ? res.requiresHumanAction    as string[] : [];
  const bi = pipeline.businessImpact ?? {};

  return (
    <div className="space-y-5">
      {/* Resolution banner */}
      <div className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 p-5 flex items-center gap-4">
        <CheckCircle2 className="h-10 w-10 text-green-600 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-green-700 dark:text-green-400">PRODUCTION PROTECTED</span>
            <Badge className="bg-green-600 text-white text-[10px]">Maintenance Scheduled</Badge>
          </div>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            OSHA applied · Orders rerouted · Saturday window confirmed · Completed in <strong>{timeStr}</strong>
          </p>
        </div>
        <Button
          data-testid="button-reset-demo"
          variant="outline"
          size="sm"
          onClick={onReset}
          className="gap-1.5 shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      {/* Impact comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">With Atlas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-green-600">0 min</p>
                <p className="text-[11px] text-muted-foreground">Unplanned downtime</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">$12K</p>
                <p className="text-[11px] text-muted-foreground">Maintenance cost</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-400">{bi.withAtlas}</p>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">{bi.maintenanceCost}</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Without Atlas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-red-600">23 hrs</p>
                <p className="text-[11px] text-muted-foreground">Emergency shutdown</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">$340K</p>
                <p className="text-[11px] text-muted-foreground">Damage + lost production</p>
              </div>
            </div>
            <p className="text-[11px] text-red-700 dark:text-red-400">{bi.withoutAtlas}</p>
            <p className="text-sm font-semibold text-red-600">{bi.downtimeAvoided}</p>
          </CardContent>
        </Card>
      </div>

      {/* What Atlas did vs human */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold">Atlas Acted Autonomously</span>
              <Badge variant="outline" className="ml-auto text-[10px]">{atlasActions.length} actions</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {atlasActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                <span>{action}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold">Human Judgment Required</span>
              <Badge variant="outline" className="ml-auto text-[10px]">{humanActions.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {humanActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-2" />
                <span>{action}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground mt-1">
              Atlas handled all scheduling, rerouting, and compliance autonomously. The physical bearing swap and final post-maintenance sign-off require an on-site technician — Atlas prepared everything for them.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Resolution Timeline</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-0">
            {STAGES.map((st, i) => {
              const Icon = st.icon;
              return (
                <div key={st.key} className="flex sm:flex-col items-center sm:items-start flex-1">
                  <div className="flex sm:flex-row flex-col items-center gap-2 sm:gap-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-[11px] font-semibold">{st.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">T+{st.targetSec}s</p>
                    </div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className="flex-1 hidden sm:block h-px bg-green-400 mt-3.5 mr-2" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SHMfgLive() {
  const qc = useQueryClient();

  const { data: demoState } = useQuery<DemoState>({
    queryKey: ["/api/demo/sh-mfg/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-mfg/trigger"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-mfg/status"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-mfg/reset"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-mfg/status"] }),
  });

  const status = demoState?.status ?? "idle";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/demo">
            <Button data-testid="button-back" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Demo Center
            </Button>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Factory Floor Anomaly Recovery Agent</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">Manufacturing</Badge>
              {status === "running" && (
                <Badge className="text-[10px] shrink-0 bg-amber-600 text-white animate-pulse">LIVE</Badge>
              )}
              {status === "complete" && (
                <Badge className="text-[10px] shrink-0 bg-green-600 text-white">RESOLVED</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              CNC Bearing Wear Predictive Self-Healing · Live Interactive Demo
            </p>
          </div>
          {status !== "idle" && (
            <Button
              data-testid="button-reset-header"
              variant="ghost"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="gap-1.5 text-muted-foreground shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {!demoState ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : status === "idle" ? (
          <IdleView onTrigger={() => triggerMutation.mutate()} isPending={triggerMutation.isPending} />
        ) : status === "running" ? (
          <RunningView state={demoState} />
        ) : (
          <CompleteView state={demoState} onReset={() => resetMutation.mutate()} />
        )}
      </div>
    </div>
  );
}
