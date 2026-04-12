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
  Lock,
  Users,
  FileText,
  AlertCircle,
  TrendingUp,
  BarChart3,
  UserCheck,
  ClipboardList,
  HeartHandshake,
  Scale,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "running" | "complete";

interface SkillInvoked {
  skillName: string;
  description: string;
  finding: string;
  duration: string;
}

interface ImpactRow {
  priority: string;
  count: number;
  sla: string;
  amount: number;
}

interface ModelFpr {
  before: number;
  after: number;
  threshold: number;
  restored: number;
}

interface Pipeline {
  id: string;
  stage: string;
  detectedAt: string;
  resolvedAt?: string;
  diagnosisDetails?: {
    rootCause?: string;
    modelFpr?: ModelFpr;
    affectedClaims?: number;
    estimatedMisclassified?: number;
    vulnerableClaimants?: number;
    totalAmountDelayed?: number;
    skillsInvoked?: SkillInvoked[];
    impactByPriority?: ImpactRow[];
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
    affectedClaims?: string;
    vulnerableClaimants?: string;
    amountRestored?: string;
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
  { key: "detected",    label: "Detect",      icon: Activity,      targetSec: 0  },
  { key: "diagnosed",   label: "Diagnose",    icon: Brain,         targetSec: 25 },
  { key: "hypothesis",  label: "Hypothesize", icon: Cpu,           targetSec: 45 },
  { key: "remediation", label: "Remediate",   icon: Wrench,        targetSec: 65 },
  { key: "resolved",    label: "Validate",    icon: Shield,        targetSec: 95 },
];

function stageIndex(key: string) {
  const i = STAGES.findIndex(s => s.key === key);
  return i >= 0 ? i : 0;
}

function fmtUsd(n: number) {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function PulsingDot({ color = "bg-rose-500" }: { color?: string }) {
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
              active ? "bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800" :
              done   ? "opacity-70" : "opacity-30"
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                active ? "bg-rose-600 text-white" :
                done   ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {active ? <Loader2 className="h-4 w-4 animate-spin" /> :
                 done   ? <CheckCircle2 className="h-4 w-4" /> :
                          <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold ${
                active ? "text-rose-700 dark:text-rose-300" :
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

// ─── FPR Gauge ────────────────────────────────────────────────────────────────

function FprGauge({ fpr }: { fpr: ModelFpr }) {
  const maxFpr = 30;
  const currentPct  = Math.min((fpr.after     / maxFpr) * 100, 100);
  const threshPct   = Math.min((fpr.threshold / maxFpr) * 100, 100);
  const color = fpr.after > fpr.threshold ? "bg-rose-500" : "bg-green-500";

  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>0%</span>
        <span className="text-orange-600 font-medium">Alert threshold {fpr.threshold}%</span>
        <span>{maxFpr}%</span>
      </div>
      <div className="relative h-4 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${currentPct}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-orange-500 opacity-80"
          style={{ left: `${threshPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground">Baseline: {fpr.before}%</span>
        <span className={`text-[11px] font-bold ${fpr.after > fpr.threshold ? "text-rose-600" : "text-green-600"}`}>
          Current FPR: {fpr.after}%
        </span>
      </div>
    </div>
  );
}

// ─── GDPR countdown ───────────────────────────────────────────────────────────

function GdprCountdown({ triggeredAt }: { triggeredAt: string }) {
  const [remaining, setRemaining] = useState(72 * 3600);
  useEffect(() => {
    const start = new Date(triggeredAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setRemaining(Math.max(0, 72 * 3600 - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [triggeredAt]);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const pct = (remaining / (72 * 3600)) * 100;
  const urgent = remaining < 4 * 3600;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">GDPR Art. 22 — Explanation Window</span>
        <span className={`font-mono text-sm font-bold ${urgent ? "text-rose-600 animate-pulse" : "text-amber-600"}`}>
          {h}h {m}m remaining
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${urgent ? "bg-rose-500" : "bg-amber-500"}`}
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
            <p className="text-sm font-semibold">Claims Workflow Recovery Agent</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monitoring fraud triage model · CUSUM FPR analysis · Supervised</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Fraud Model FPR</span>
            </div>
            <p className="text-2xl font-bold text-green-600">3.2%</p>
            <p className="text-[11px] text-muted-foreground">Baseline · Within 5% threshold</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Claims Queue</span>
            </div>
            <p className="text-sm font-semibold text-green-600">All clear</p>
            <p className="text-[11px] text-muted-foreground">No misclassification alerts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Claims Triage Health</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              Model Stable
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-2xl font-bold text-green-600">3.2%</p>
              <p className="text-[11px] text-muted-foreground">FPR (baseline)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-[11px] text-muted-foreground">Misclassified claims</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">$0</p>
              <p className="text-[11px] text-muted-foreground">Delayed payouts</p>
            </div>
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-[11px] text-muted-foreground">Compliance frameworks</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["NAIC Model Audit Reg.", "SFCH-01 (Fair Claims)", "GDPR Article 22", "SOX Internal Controls", "NAIC Unfair Claims Act"].map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px]">{fw}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 border-rose-200 dark:border-rose-800">
        <CardContent className="pt-6 pb-6 text-center">
          <TrendingUp className="h-8 w-8 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">Simulate Fraud Model FPR Spike</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Inject a biased training data incident — Zone 7 geographic over-representation
            causes the fraud triage model FPR to spike from 3.2% to 22.7%. Watch Atlas detect
            the drift in 2 hours using CUSUM analysis, isolate the model, route 620 misclassified
            claims to human review, and file 12 state regulator packages — all while enforcing
            NAIC, GDPR Article 22, and SOX guardrails autonomously.
          </p>
          <Button
            data-testid="button-trigger-incident"
            size="lg"
            className="bg-rose-600 hover:bg-rose-700 text-white gap-2 px-8"
            onClick={onTrigger}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
            Trigger FPR Spike Incident
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">Demo completes autonomously in ~95 seconds · 5 compliance frameworks enforced</p>
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
  const skills: SkillInvoked[] = Array.isArray(diag.skillsInvoked)  ? (diag.skillsInvoked  as SkillInvoked[]) : [];
  const impact: ImpactRow[]    = Array.isArray(diag.impactByPriority) ? (diag.impactByPriority as ImpactRow[]) : [];
  const hyp    = pipeline.hypothesis ?? {};
  const rem    = pipeline.remediation ?? {};
  const runbooks = Array.isArray(rem.runbooksTriggered) ? rem.runbooksTriggered : [];
  const policies = Array.isArray(rem.policiesEnforced)  ? rem.policiesEnforced  : [];

  const fpr               = diag.modelFpr         ?? { before: 3.2, after: 22.7, threshold: 5.0, restored: 2.8 };
  const affectedClaims    = diag.affectedClaims    ?? 847;
  const misclassified     = diag.estimatedMisclassified ?? 620;
  const vulnerable        = diag.vulnerableClaimants ?? 47;
  const amountDelayed     = diag.totalAmountDelayed ?? 2100000;

  const actionLog: Array<{ ts: number; text: string; type: "atlas" | "block" | "info" }> = [
    { ts: 0,  text: "CUSUM h-statistic 8.4 triggered — FPR 22.7% (threshold 5.0 = systemic failure)",             type: "atlas" },
    { ts: 2,  text: "CUSUM alert: Zone 7 ZIP codes FPR 41.3% vs. all other zones 3.6% — bias isolated",           type: "atlas" },
    { ts: 4,  text: "SOX material impact threshold exceeded: $2.1M delayed payouts > $500K trigger",               type: "block" },
  ];
  if (cur >= 1) {
    actionLog.push({ ts: 8,  text: "Root cause: Zone 7 training data 340% over-representation in fraud sample",   type: "atlas" });
    actionLog.push({ ts: 12, text: "Claimant Impact: 847 claims flagged, 620 estimated misclassified, 47 vulnerable", type: "atlas" });
    actionLog.push({ ts: 16, text: "Claims Re-Routing: 47 vulnerable → 24h, 94 high-value → 72h, 479 standard → 5-day", type: "atlas" });
    actionLog.push({ ts: 20, text: "Regulatory Disclosure: 12 state filings required, 11 EU claims → GDPR Art. 22 72h window", type: "atlas" });
    actionLog.push({ ts: 24, text: "SOX notification queued: CAO + external auditors ($2.1M > $500K threshold)",  type: "block" });
  }
  if (cur >= 2) {
    actionLog.push({ ts: 28, text: "Hypothesis locked: 4-phase recovery — isolate → re-route → notify → file (confidence 97%)", type: "atlas" });
    actionLog.push({ ts: 30, text: "NAIC Audit Gate: model recalibration to 0.65 BLOCKED until fairness audit completes", type: "block" });
    actionLog.push({ ts: 34, text: "SFCH-01: Priority 1 queue (47 vulnerable) receives 24h SLA — non-negotiable enforcement", type: "block" });
    actionLog.push({ ts: 38, text: "GDPR Art. 22: 72-hour explanation window started for 11 EU-linked claims",   type: "block" });
  }
  if (cur >= 3) {
    actionLog.push({ ts: 46, text: "Fraud Model Isolation: v2.3.1 isolated · Rules-based fallback activated · FPR: 22.7% → 2.8% ✓", type: "atlas" });
    actionLog.push({ ts: 50, text: "620 claims queued to human review · 47 vulnerable placed Priority 1 · 2 overflow adjusters allocated", type: "atlas" });
    actionLog.push({ ts: 54, text: "620 adverse action letters drafted · 47 expedited notifications queued for immediate send", type: "atlas" });
    actionLog.push({ ts: 58, text: "12 state insurance department filing packages generated · Awaiting regulatory officer sign-off", type: "block" });
    actionLog.push({ ts: 62, text: "GDPR Article 22 explanation packages prepared for 11 EU claims · 61 hours remaining", type: "atlas" });
    actionLog.push({ ts: 64, text: "Model v2.4.0 staged with threshold 0.65 · BLOCKED pending NAIC fairness audit (3 business days)", type: "block" });
  }

  const visibleActions = actionLog.filter(a => a.ts <= elapsedSeconds);

  return (
    <div className="space-y-5">
      {/* Active incident banner */}
      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4 flex items-center gap-3">
        <PulsingDot color="bg-rose-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-rose-700 dark:text-rose-400">FRAUD MODEL FPR SPIKE DETECTED</span>
            <span className="text-sm text-rose-600 dark:text-rose-400 font-mono">
              <ElapsedTimer triggeredAt={triggeredAt} />
            </span>
          </div>
          <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
            FPR {fpr.before}% → {fpr.after}% · {affectedClaims} Claims Flagged · {vulnerable} Vulnerable Claimants · {fmtUsd(amountDelayed)} Delayed
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Class-action exposure</p>
          <p className="text-xl font-bold text-rose-600">$25M+</p>
        </div>
      </div>

      {/* GDPR countdown */}
      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent className="px-4 py-3">
          <GdprCountdown triggeredAt={triggeredAt} />
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
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+0s · CUSUM</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-3">
              <FprGauge fpr={fpr} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-rose-600">{affectedClaims}</p>
                  <p className="text-[10px] text-muted-foreground">Claims flagged</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-orange-600">{misclassified}</p>
                  <p className="text-[10px] text-muted-foreground">Misclassified</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{vulnerable}</p>
                  <p className="text-[10px] text-muted-foreground">Vulnerable</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-red-600">{fmtUsd(amountDelayed)}</p>
                  <p className="text-[10px] text-muted-foreground">Delayed</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">CUSUM h-statistic 8.4 (systemic failure threshold 5.0) · Zone 7 ZIP codes 92101–92115 · FPR 41.3% vs 3.6% elsewhere</p>
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-2 mb-1">Impact by priority tier</p>
                {impact.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? "bg-rose-500" : i === 1 ? "bg-orange-500" : "bg-amber-500"}`} />
                    <span className="font-medium flex-1 min-w-0 truncate">{row.priority}</span>
                    <span className="text-muted-foreground font-mono ml-auto">{row.count} claims · {row.sla} · {fmtUsd(row.amount)}</span>
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
                  <span className="font-bold text-green-600">{((hyp.confidence ?? 0.97) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm">{hyp.primaryHypothesis}</p>
                {Array.isArray(hyp.runbookCandidates) && (hyp.runbookCandidates as any[]).map((rb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-rose-50 dark:bg-rose-950/30 rounded px-2 py-1.5">
                    <ClipboardList className="h-3 w-3 text-rose-600 shrink-0 mt-0.5" />
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
            <Card className={cur >= 4 ? "border-green-200 dark:border-green-800" : "border-rose-200 dark:border-rose-800"}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {cur >= 4
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Loader2 className="h-4 w-4 text-rose-600 animate-spin shrink-0" />}
                  <span className="text-sm font-semibold">Remediate</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+65s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {runbooks.map((rb: any, i: number) => (
                  <div key={i} className={`text-[11px] rounded px-2 py-1.5 ${rb.status === "completed" ? "bg-green-50 dark:bg-green-950/30" : "bg-rose-50 dark:bg-rose-950/30"}`}>
                    <span className="font-medium">{rb.runbookName}:</span>{" "}
                    <span className="text-muted-foreground">{rb.result}</span>
                  </div>
                ))}
                {policies.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5">
                    <Lock className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
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
                <Activity className="h-4 w-4 text-rose-600 animate-pulse" />
                <span className="text-sm font-semibold">Agent Action Log</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                  LIVE
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="space-y-2">
                {visibleActions.map((action, i) => (
                  <div key={i} data-testid={`action-log-item-${i}`} className="flex items-start gap-2 text-[11px]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      action.type === "atlas" ? "bg-rose-500" :
                      action.type === "block" ? "bg-amber-500" : "bg-muted-foreground"
                    }`} />
                    <div className="flex-1">
                      <span className={
                        action.type === "block" ? "text-amber-700 dark:text-amber-400 font-medium" :
                        action.type === "atlas" ? "text-foreground" : "text-muted-foreground"
                      }>{action.text}</span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0">T+{action.ts}s</span>
                  </div>
                ))}
                {visibleActions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">FPR spike detected — Atlas is analyzing claim triage patterns...</p>
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
            <span className="text-lg font-bold text-green-700 dark:text-green-400">CLAIMS WORKFLOW RESTORED</span>
            <Badge className="bg-green-600 text-white text-[10px]">FPR 2.8% — Stable</Badge>
            <Badge className="bg-rose-600 text-white text-[10px]">620 Claims Rerouted</Badge>
          </div>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            Model isolated in &lt;60s · 47 vulnerable claimants in 24h queue · 12 regulator filings prepared · Demo: <strong>{timeStr}</strong>
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
              <HeartHandshake className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">With Atlas</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-green-600">2 hrs</p>
                <p className="text-[11px] text-muted-foreground">Detection time</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">5 hrs</p>
                <p className="text-[11px] text-muted-foreground">Full remediation</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-400">{bi.withAtlas}</p>
            <div className="flex gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.vulnerableClaimants}</Badge>
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.amountRestored}</Badge>
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
                <p className="text-2xl font-bold text-red-600">5–10 days</p>
                <p className="text-[11px] text-muted-foreground">Detection lag</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">$25M+</p>
                <p className="text-[11px] text-muted-foreground">Class-action exposure</p>
              </div>
            </div>
            <p className="text-[11px] text-red-700 dark:text-red-400">{bi.withoutAtlas}</p>
            <p className="text-sm font-semibold text-red-600">{bi.penaltyAvoided}</p>
          </CardContent>
        </Card>
      </div>

      {/* Atlas vs Human */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-rose-600" />
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
              <UserCheck className="h-4 w-4 text-amber-600" />
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
              Atlas handled detection, model isolation, priority queue routing, letter generation, and regulator package preparation. Payment disbursements, regulatory filings, and new model deployment require authorized human sign-off.
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
          <div className="flex gap-0">
            {STAGES.map((st, i) => (
              <div key={st.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-[11px] font-semibold text-center">{st.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">T+{st.targetSec}s</p>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="flex-1 h-px bg-green-400 mb-5 mx-1" />
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

export default function SHInsuranceLive() {
  const qc = useQueryClient();

  const { data: demoState } = useQuery<DemoState>({
    queryKey: ["/api/demo/sh-insurance/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-insurance/trigger"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-insurance/status"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-insurance/reset"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-insurance/status"] }),
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
              <span className="text-sm font-semibold">Claims Workflow Recovery Agent</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">Insurance</Badge>
              {status === "running" && (
                <Badge className="text-[10px] shrink-0 bg-rose-600 text-white animate-pulse">LIVE</Badge>
              )}
              {status === "complete" && (
                <Badge className="text-[10px] shrink-0 bg-green-600 text-white">RESOLVED</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              Fraud Model FPR Spike Self-Healing · Live Interactive Demo
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
