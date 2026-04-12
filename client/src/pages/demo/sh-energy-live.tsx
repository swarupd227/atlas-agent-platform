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
  Lock,
  Users,
  TrendingDown,
  Gauge,
  Radio,
  Wind,
  Flame,
  PlugZap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "running" | "complete";

interface SkillInvoked {
  skillName: string;
  description: string;
  finding: string;
  duration: string;
}

interface RecoveryRow {
  source: string;
  mw: number;
  timeMin: number;
}

interface FrequencyData {
  current: number;
  nominal: number;
  nercLimit: number;
  projectedMinimum: number;
}

interface Pipeline {
  id: string;
  stage: string;
  detectedAt: string;
  resolvedAt?: string;
  diagnosisDetails?: {
    rootCause?: string;
    frequencyHz?: FrequencyData;
    shortfallMW?: number;
    householdsAtRisk?: number;
    nercPenaltyExposure?: { min: number; max: number };
    nercWindowMinutes?: number;
    elapsedMinutes?: number;
    skillsInvoked?: SkillInvoked[];
    recoveryPlan?: RecoveryRow[];
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
    householdsProtected?: string;
    nercCompliance?: string;
    penaltyAvoided?: string;
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
  { key: "detected",    label: "Detect",      icon: Activity,  targetSec: 0  },
  { key: "diagnosed",   label: "Diagnose",    icon: Brain,     targetSec: 25 },
  { key: "hypothesis",  label: "Hypothesize", icon: Cpu,       targetSec: 45 },
  { key: "remediation", label: "Remediate",   icon: Wrench,    targetSec: 65 },
  { key: "resolved",    label: "Validate",    icon: Shield,    targetSec: 95 },
];

function stageIndex(key: string) {
  const i = STAGES.findIndex(s => s.key === key);
  return i >= 0 ? i : 0;
}

function fmtUsd(n: number) {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(0)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function PulsingDot({ color = "bg-sky-500" }: { color?: string }) {
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
              active ? "bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800" :
              done   ? "opacity-70" : "opacity-30"
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                active ? "bg-sky-600 text-white" :
                done   ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {active ? <Loader2 className="h-4 w-4 animate-spin" /> :
                 done   ? <CheckCircle2 className="h-4 w-4" /> :
                          <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold ${
                active ? "text-sky-700 dark:text-sky-300" :
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

// ─── Frequency Gauge ──────────────────────────────────────────────────────────

function FrequencyGauge({ freq }: { freq: FrequencyData }) {
  const range = freq.nominal - 59.2;
  const pct = Math.max(0, Math.min(((freq.current - 59.2) / range) * 100, 100));
  const nercPct = ((freq.nercLimit - 59.2) / range) * 100;
  const color = freq.current < freq.nercLimit ? "bg-red-500" : "bg-green-500";

  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>59.2 Hz</span>
        <span className="text-red-600 font-medium">NERC limit {freq.nercLimit} Hz</span>
        <span>{freq.nominal} Hz</span>
      </div>
      <div className="relative h-4 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-orange-500 opacity-80"
          style={{ left: `${nercPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground">Nominal: {freq.nominal} Hz</span>
        <span className={`text-[11px] font-bold ${freq.current < freq.nercLimit ? "text-red-600" : "text-green-600"}`}>
          {freq.current.toFixed(2)} Hz
        </span>
      </div>
    </div>
  );
}

// ─── NERC countdown ───────────────────────────────────────────────────────────

function NercCountdown({ triggeredAt }: { triggeredAt: string }) {
  const [remaining, setRemaining] = useState(600);
  useEffect(() => {
    const start = new Date(triggeredAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setRemaining(Math.max(0, 600 - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [triggeredAt]);
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  const pct = (remaining / 600) * 100;
  const urgent = remaining < 120;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">NERC BAL-003 Window</span>
        <span className={`font-mono text-sm font-bold ${urgent ? "text-red-600 animate-pulse" : "text-orange-600"}`}>
          {m}:{s.toString().padStart(2, "0")} remaining
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${urgent ? "bg-red-500" : "bg-orange-500"}`}
          style={{ width: `${pct}%` }}
        />
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
            <p className="text-sm font-semibold">Grid Operations Stability Agent</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monitoring grid telemetry · 50K SCADA points/4s · Supervised</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Gauge className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Grid Frequency</span>
            </div>
            <p className="text-2xl font-bold text-green-600">60.00 Hz</p>
            <p className="text-[11px] text-muted-foreground">Nominal · NERC BAL-003 compliant</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Wind className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Generation</span>
            </div>
            <p className="text-sm font-semibold text-green-600">All sources online</p>
            <p className="text-[11px] text-muted-foreground">W-12 Offshore Wind · 847 MW operational</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Grid Health Dashboard</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              All Systems Stable
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-2xl font-bold text-green-600">60.00</p>
              <p className="text-[11px] text-muted-foreground">Frequency (Hz)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">0 MW</p>
              <p className="text-[11px] text-muted-foreground">Generation shortfall</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">$0</p>
              <p className="text-[11px] text-muted-foreground">NERC exposure</p>
            </div>
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-[11px] text-muted-foreground">Compliance frameworks</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["NERC CIP-014", "FERC Order 881", "IEC 62351", "EPA Clean Air Act", "ERCOT Protocol"].map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px]">{fw}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 border-red-200 dark:border-red-800">
        <CardContent className="pt-6 pb-6 text-center">
          <Wind className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">Simulate Offshore Wind Farm Outage</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Inject an unplanned circuit breaker trip on Offshore Wind Array W-12 — 847 MW lost
            instantly. Watch Atlas detect the frequency deviation in under 4 seconds, activate
            350 MW demand response, dispatch three combustion turbine peaker units, and restore
            grid frequency within the mandatory NERC BAL-003 10-minute window.
          </p>
          <Button
            data-testid="button-trigger-incident"
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white gap-2 px-8"
            onClick={onTrigger}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Trigger Wind Farm Outage
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">Demo completes autonomously in ~95 seconds · NERC 10-min window simulated</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Running View ─────────────────────────────────────────────────────────────

function RunningView({ state }: { state: DemoState }) {
  const { pipeline, triggeredAt, elapsedSeconds } = state;
  if (!pipeline || !triggeredAt) return null;

  const cur    = stageIndex(pipeline.stage);
  const diag   = pipeline.diagnosisDetails ?? {};
  const skills: SkillInvoked[]  = Array.isArray(diag.skillsInvoked) ? (diag.skillsInvoked as SkillInvoked[]) : [];
  const recovery: RecoveryRow[] = Array.isArray(diag.recoveryPlan)  ? (diag.recoveryPlan  as RecoveryRow[])  : [];
  const hyp  = pipeline.hypothesis ?? {};
  const rem  = pipeline.remediation ?? {};
  const runbooks = Array.isArray(rem.runbooksTriggered) ? rem.runbooksTriggered : [];
  const policies = Array.isArray(rem.policiesEnforced)  ? rem.policiesEnforced  : [];

  const freq      = diag.frequencyHz ?? { current: 59.63, nominal: 60.00, nercLimit: 59.95, projectedMinimum: 59.40 };
  const shortfall = diag.shortfallMW ?? 847;
  const households = diag.householdsAtRisk ?? 680000;
  const penalty   = diag.nercPenaltyExposure ?? { min: 1000000, max: 25000000 };

  const actionLog: Array<{ ts: number; text: string; type: "atlas" | "block" | "info" }> = [
    { ts: 0,  text: "W-12 circuit breaker trip detected via SCADA · Frequency: 59.63 Hz (NERC limit: 59.95 Hz)", type: "atlas" },
    { ts: 1,  text: "NERC BAL-003 10-minute recovery window started · 847 MW shortfall confirmed",                type: "block" },
    { ts: 2,  text: "ERCOT emergency notification transmitted (frequency < 59.70 Hz threshold)",                  type: "atlas" },
  ];
  if (cur >= 1) {
    actionLog.push({ ts: 6,  text: "Generation Shortfall Detection: frequency falling 0.08 Hz/s · UFLS threshold in 3 minutes",     type: "atlas" });
    actionLog.push({ ts: 10, text: "Demand Response Skill: 12 industrial participants available · 350 MW curtailment capacity",      type: "atlas" });
    actionLog.push({ ts: 14, text: "Peaker Dispatch Skill: CT-3/CT-7/CT-11 available · 360 MW · EPA permit hours verified",         type: "atlas" });
    actionLog.push({ ts: 18, text: "Load Zone Rebalancing: 137 MW Zone 4B interchange available · N-1 path confirmed",              type: "atlas" });
    actionLog.push({ ts: 22, text: `Total recovery: ${shortfall} MW = DR 350 + Peakers 360 + Interchange 137 — full coverage`,     type: "info"  });
  }
  if (cur >= 2) {
    actionLog.push({ ts: 28, text: "Hypothesis locked: 3-vector recovery — DR + peakers + interchange (confidence 98%)",            type: "atlas" });
    actionLog.push({ ts: 30, text: "FERC Order 881: 5-minute market notification window starts on peaker commitment",               type: "block" });
    actionLog.push({ ts: 32, text: "EPA Clean Air Act: peaker permit hours pre-verified before dispatch commitment",                 type: "block" });
  }
  if (cur >= 3) {
    actionLog.push({ ts: 46, text: "Demand Response activated: 350 MW curtailed across 12 industrial participants in 90 seconds",    type: "atlas" });
    actionLog.push({ ts: 50, text: "CT-3/CT-7/CT-11 committed · FERC market notification sent T+4min (5-min window met) ✓",         type: "atlas" });
    actionLog.push({ ts: 55, text: "Zone 4B interchange: 137 MW adjustment applied · N-1 reliability maintained ✓",                 type: "atlas" });
    actionLog.push({ ts: 58, text: "IEC 62351: all SCADA commands authenticated and encrypted ✓",                                   type: "info"  });
    actionLog.push({ ts: 62, text: "NERC BAL-003 event report auto-generated (847 MW ≥ 300 MW threshold) · Awaiting human sign-off",type: "block" });
    actionLog.push({ ts: 64, text: "Frequency trajectory: recovering · On track for 9.2 min restoration",                           type: "atlas" });
  }

  const visibleActions = actionLog.filter(a => a.ts <= elapsedSeconds);

  return (
    <div className="space-y-5">
      {/* Active incident banner */}
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3">
        <PulsingDot color="bg-red-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-red-700 dark:text-red-400">GRID FREQUENCY DEVIATION</span>
            <span className="text-sm text-red-600 dark:text-red-400 font-mono">
              <ElapsedTimer triggeredAt={triggeredAt} />
            </span>
          </div>
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
            W-12 Offshore Wind Outage — {shortfall} MW Shortfall — {households.toLocaleString()} Households at Risk
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">NERC exposure</p>
          <p className="text-xl font-bold text-red-600">{fmtUsd(penalty.max)}</p>
        </div>
      </div>

      {/* NERC countdown */}
      <Card className="border-orange-200 dark:border-orange-800">
        <CardContent className="px-4 py-3">
          <NercCountdown triggeredAt={triggeredAt} />
        </CardContent>
      </Card>

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
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+0s · &lt;4 seconds</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-3">
              <FrequencyGauge freq={freq} />
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-red-600">{shortfall} MW</p>
                  <p className="text-[10px] text-muted-foreground">Shortfall</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-orange-600">{households >= 1000000 ? (households / 1_000_000).toFixed(1) + "M" : (households / 1000).toFixed(0) + "K"}</p>
                  <p className="text-[10px] text-muted-foreground">Households at risk</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{fmtUsd(penalty.max)}</p>
                  <p className="text-[10px] text-muted-foreground">Max NERC penalty</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">SCADA telemetry: 50K points/4s · W-12 circuit breaker trip · Frequency: {freq.projectedMinimum} Hz projected in 3 min</p>
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-2 mb-1">Recovery vector plan</p>
                {recovery.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                    {i === 0 ? <PlugZap className="h-3 w-3 text-sky-500 shrink-0" /> :
                     i === 1 ? <Flame className="h-3 w-3 text-orange-500 shrink-0" /> :
                               <Radio className="h-3 w-3 text-purple-500 shrink-0" />}
                    <span className="font-medium">{r.source}</span>
                    <span className="ml-auto text-muted-foreground font-mono">{r.mw} MW · T+{r.timeMin}min</span>
                  </div>
                ))}
                {skills.slice(0, 2).map((sk, i) => (
                  <div key={i} className="text-[11px] bg-muted/50 rounded px-2 py-1.5 mt-1">
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
                  <span className="font-bold text-green-600">{((hyp.confidence ?? 0.98) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm">{hyp.primaryHypothesis}</p>
                {Array.isArray(hyp.runbookCandidates) && hyp.runbookCandidates.map((rb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-sky-50 dark:bg-sky-950/30 rounded px-2 py-1.5">
                    <Zap className="h-3 w-3 text-sky-600 shrink-0 mt-0.5" />
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
            <Card className={cur >= 4 ? "border-green-200 dark:border-green-800" : "border-sky-200 dark:border-sky-800"}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {cur >= 4
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Loader2 className="h-4 w-4 text-sky-600 animate-spin shrink-0" />}
                  <span className="text-sm font-semibold">Remediate</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+65s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {runbooks.map((rb: any, i: number) => (
                  <div key={i} className={`text-[11px] rounded px-2 py-1.5 ${rb.status === "completed" ? "bg-green-50 dark:bg-green-950/30" : "bg-sky-50 dark:bg-sky-950/30"}`}>
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
                <Activity className="h-4 w-4 text-sky-600 animate-pulse" />
                <span className="text-sm font-semibold">Agent Action Log</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800">
                  LIVE
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="space-y-2">
                {visibleActions.map((action, i) => (
                  <div key={i} data-testid={`action-log-item-${i}`} className="flex items-start gap-2 text-[11px]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      action.type === "atlas" ? "bg-sky-500" :
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
                  <p className="text-[11px] text-muted-foreground">Grid frequency deviation detected — Atlas is activating recovery...</p>
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
            <span className="text-lg font-bold text-green-700 dark:text-green-400">GRID STABLE</span>
            <Badge className="bg-green-600 text-white text-[10px]">59.97 Hz Restored</Badge>
            <Badge className="bg-sky-600 text-white text-[10px]">NERC Compliant</Badge>
          </div>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            Frequency recovered in 9.2 minutes · Within NERC 10-min window · Completed in demo: <strong>{timeStr}</strong>
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
                <p className="text-2xl font-bold text-green-600">9.2 min</p>
                <p className="text-[11px] text-muted-foreground">Frequency restored</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">$0</p>
                <p className="text-[11px] text-muted-foreground">NERC penalties</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-400">{bi.withAtlas}</p>
            <div className="flex gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.householdsProtected}</Badge>
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.nercCompliance}</Badge>
            </div>
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
                <p className="text-2xl font-bold text-red-600">45+ min</p>
                <p className="text-[11px] text-muted-foreground">Detection lag</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">$25M</p>
                <p className="text-[11px] text-muted-foreground">NERC penalties</p>
              </div>
            </div>
            <p className="text-[11px] text-red-700 dark:text-red-400">{bi.withoutAtlas}</p>
            <p className="text-sm font-semibold text-red-600">{bi.penaltyAvoided}</p>
          </CardContent>
        </Card>
      </div>

      {/* What Atlas did vs human */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-sky-600" />
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
              <Users className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-semibold">Human Judgment Required</span>
              <Badge variant="outline" className="ml-auto text-[10px]">{humanActions.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {humanActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-2" />
                <span>{action}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground mt-1">
              Atlas handled all detection, DR activation, peaker dispatch, and interchange autonomously. Regulatory certification of the mandatory NERC event report and grid restoration planning require qualified human operators.
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
            {STAGES.map((st, i) => (
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
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SHEnergyLive() {
  const qc = useQueryClient();

  const { data: demoState } = useQuery<DemoState>({
    queryKey: ["/api/demo/sh-energy/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-energy/trigger"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-energy/status"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-energy/reset"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-energy/status"] }),
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
              <span className="text-sm font-semibold">Grid Operations Stability Agent</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">Energy / Utilities</Badge>
              {status === "running" && (
                <Badge className="text-[10px] shrink-0 bg-red-600 text-white animate-pulse">LIVE</Badge>
              )}
              {status === "complete" && (
                <Badge className="text-[10px] shrink-0 bg-green-600 text-white">STABLE</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              Offshore Wind Farm Outage Self-Healing · Live Interactive Demo
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
