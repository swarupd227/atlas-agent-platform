import { useState, useEffect, useRef } from "react";
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
  Heart,
  Loader2,
  RotateCcw,
  Shield,
  Wrench,
  Zap,
  TrendingUp,
  Users,
  Lock,
  Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "running" | "complete";

interface SkillInvoked {
  skillName: string;
  description: string;
  finding: string;
  duration: string;
}

interface Pipeline {
  id: string;
  stage: string;
  detectedAt: string;
  resolvedAt?: string;
  diagnosisDetails?: {
    rootCause?: string;
    skillsInvoked?: SkillInvoked[];
    affectedPatients?: number;
    criticalPatients?: number;
    affectedResources?: number;
    detectionLatency?: string;
  };
  hypothesis?: {
    confidence?: number;
    primaryHypothesis?: string;
    runbookCandidates?: Array<{ runbookName: string; expectedOutcome: string; estimatedDuration: string }>;
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
    financialExposure?: string;
    patientsAtRisk?: number;
    criticalSafetyExposure?: string;
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
  { key: "detected",    label: "Detect",      icon: Activity, targetSec: 0  },
  { key: "diagnosed",   label: "Diagnose",    icon: Brain,    targetSec: 25 },
  { key: "hypothesis",  label: "Hypothesize", icon: Cpu,      targetSec: 45 },
  { key: "remediation", label: "Remediate",   icon: Wrench,   targetSec: 65 },
  { key: "resolved",    label: "Validate",    icon: Shield,   targetSec: 95 },
];

function stageIndex(key: string) {
  const i = STAGES.findIndex(s => s.key === key);
  return i >= 0 ? i : 0;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PulsingDot({ color = "bg-green-500" }: { color?: string }) {
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
        const done = i < cur;
        const active = i === cur;
        const waiting = i > cur;
        return (
          <div key={st.key} className="flex items-center">
            <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
              active  ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800" :
              done    ? "opacity-70" : "opacity-30"
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                active ? "bg-blue-600 text-white" :
                done   ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {active ? <Loader2 className="h-4 w-4 animate-spin" /> :
                 done   ? <CheckCircle2 className="h-4 w-4" /> :
                          <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold ${active ? "text-blue-700 dark:text-blue-300" : done ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                {st.label}
              </span>
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

// ─── Idle View ────────────────────────────────────────────────────────────────

function IdleView({ onTrigger, isPending }: { onTrigger: () => void; isPending: boolean }) {
  return (
    <div className="space-y-6">
      {/* Agent heartbeat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <PulsingDot color="bg-green-500" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">AGENT ACTIVE</span>
            </div>
            <p className="text-sm font-semibold">Clinical Data Integrity Monitor</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monitoring FHIR pipeline · Supervised autonomy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Health Score</span>
            </div>
            <p className="text-2xl font-bold text-green-600">99</p>
            <p className="text-[11px] text-muted-foreground">98% success rate · Last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Radio className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">FHIR Feed</span>
            </div>
            <p className="text-sm font-semibold text-green-600">Healthy</p>
            <p className="text-[11px] text-muted-foreground">Error rate: 0.02% · 1,847 resources/min</p>
          </CardContent>
        </Card>
      </div>

      {/* Patient population */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Patient Population Under Monitoring</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              All Systems Normal
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold">312</p>
              <p className="text-[11px] text-muted-foreground">Patients monitored</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">100%</p>
              <p className="text-[11px] text-muted-foreground">Drug-interaction coverage</p>
            </div>
            <div>
              <p className="text-2xl font-bold">4</p>
              <p className="text-[11px] text-muted-foreground">Compliance frameworks active</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["HIPAA", "FDA 21 CFR Part 11", "HL7 FHIR R4", "US Core 6.1"].map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px]">{fw}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trigger section */}
      <Card className="border-dashed border-2 border-orange-200 dark:border-orange-800">
        <CardContent className="pt-6 pb-6 text-center">
          <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">Simulate EHR Schema Drift Incident</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Inject a FHIR RxNorm value set version mismatch — the same class of incident that leaves
            drug-interaction checks offline for hours at typical hospitals. Watch Atlas detect and
            heal it in under 2 minutes.
          </p>
          <Button
            data-testid="button-trigger-incident"
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white gap-2 px-8"
            onClick={onTrigger}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Trigger Incident
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">
            Demo completes autonomously in ~95 seconds
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Running View ─────────────────────────────────────────────────────────────

function RunningView({ state }: { state: DemoState }) {
  const { pipeline, triggeredAt, elapsedSeconds } = state;
  if (!pipeline || !triggeredAt) return null;

  const cur = stageIndex(pipeline.stage);
  const diag = pipeline.diagnosisDetails ?? {};
  const skills: SkillInvoked[] = Array.isArray(diag.skillsInvoked) ? diag.skillsInvoked as SkillInvoked[] : [];
  const hyp = pipeline.hypothesis ?? {};
  const rem = pipeline.remediation ?? {};
  const runbooks = Array.isArray(rem.runbooksTriggered) ? rem.runbooksTriggered : [];
  const policies = Array.isArray(rem.policiesEnforced) ? rem.policiesEnforced : [];

  // Build progressive action log from all completed stage data
  const actionLog: Array<{ ts: number; text: string; type: "atlas" | "block" | "info" }> = [];
  const base = new Date(triggeredAt).getTime();
  actionLog.push({ ts: 0,  text: "Atlas monitoring detected FHIR ingestion anomaly — error rate 18.4%",   type: "atlas" });
  actionLog.push({ ts: 4,  text: "Anomaly classified: schema_change pattern, confidence 0.94",              type: "atlas" });
  if (cur >= 1) {
    actionLog.push({ ts: 8,  text: "FHIR Schema Validation Skill invoked — scanning 1,847 resources",       type: "atlas" });
    actionLog.push({ ts: 12, text: "Root cause confirmed: RxNorm value set v2025-03-01 mismatch",            type: "atlas" });
    actionLog.push({ ts: 12, text: "Drug-Interaction Cross-Check Skill: 312 patients at risk identified",    type: "atlas" });
    actionLog.push({ ts: 12, text: "CRITICAL: 3 patients with contraindicated pairs — clinical hold ACTIVATED", type: "block" });
  }
  if (cur >= 2) {
    actionLog.push({ ts: 30, text: "Hypothesis: non-breaking FHIR profile update (confidence 0.96)",         type: "atlas" });
    actionLog.push({ ts: 30, text: "Runbook selected: FHIR Schema Drift Response",                           type: "atlas" });
    actionLog.push({ ts: 30, text: "Parallel: EHR vendor rollback request queued",                           type: "info"  });
  }
  if (cur >= 3) {
    actionLog.push({ ts: 50, text: "Lenient validation mode activated — non-breaking changes accepted",       type: "atlas" });
    actionLog.push({ ts: 50, text: "312 patients routed to pharmacist review queue",                          type: "atlas" });
    actionLog.push({ ts: 50, text: "EHR vendor contacted with RxNorm diff report",                           type: "atlas" });
    actionLog.push({ ts: 50, text: "HIPAA: all PHI access logged with patient tokens only",                  type: "block" });
    actionLog.push({ ts: 50, text: "Clinical Informatics on-call paged. CMIO briefed.",                      type: "info"  });
  }

  const visibleActions = actionLog.filter(a => a.ts <= elapsedSeconds);

  return (
    <div className="space-y-5">
      {/* Active incident banner */}
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3">
        <PulsingDot color="bg-red-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-red-700 dark:text-red-400">INCIDENT ACTIVE</span>
            <span className="text-sm text-red-600 dark:text-red-400 font-mono">
              <ElapsedTimer triggeredAt={triggeredAt} />
            </span>
          </div>
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
            FHIR EHR Feed Schema Drift — Drug-Interaction Validation Gap
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Patients at risk</p>
          <p className="text-xl font-bold text-red-600">{diag.affectedPatients ?? 312}</p>
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
          <Card className={cur >= 0 ? "border-green-200 dark:border-green-800" : ""}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-semibold">Detect</span>
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+0s</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              <p className="text-sm">FHIR ingestion error rate spike: <strong className="text-red-600">18.4%</strong></p>
              <p className="text-sm">Pattern classified: <strong>schema_change</strong> (confidence 0.94)</p>
              <p className="text-[11px] text-muted-foreground">Detection latency: 4 minutes vs ~2.5 hours unmonitored</p>
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
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{diag.affectedResources ?? 1847}</p>
                    <p className="text-[10px] text-muted-foreground">Resources failing</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-orange-600">{diag.affectedPatients ?? 312}</p>
                    <p className="text-[10px] text-muted-foreground">Patients at risk</p>
                  </div>
                  <div className="bg-red-100 dark:bg-red-900/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-red-700">{diag.criticalPatients ?? 3}</p>
                    <p className="text-[10px] text-muted-foreground">Critical holds</p>
                  </div>
                </div>
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
                  <span className="font-bold text-green-600">{((hyp.confidence ?? 0.96) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm">{hyp.primaryHypothesis}</p>
                {Array.isArray(hyp.runbookCandidates) && hyp.runbookCandidates.map((rb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1.5">
                    <TrendingUp className="h-3 w-3 text-blue-600 shrink-0 mt-0.5" />
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
            <Card className={cur >= 4 ? "border-green-200 dark:border-green-800" : "border-blue-200 dark:border-blue-800"}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {cur >= 4 ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />}
                  <span className="text-sm font-semibold">Remediate</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+65s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {runbooks.map((rb: any, i: number) => (
                  <div key={i} className="text-[11px] bg-green-50 dark:bg-green-950/30 rounded px-2 py-1.5">
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

        {/* Right: live action log */}
        <div className="space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
                <span className="text-sm font-semibold">Agent Action Log</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                  LIVE
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="space-y-2">
                {visibleActions.map((action, i) => (
                  <div
                    key={i}
                    data-testid={`action-log-item-${i}`}
                    className="flex items-start gap-2 text-[11px]"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      action.type === "atlas" ? "bg-blue-500" :
                      action.type === "block" ? "bg-orange-500" : "bg-muted-foreground"
                    }`} />
                    <div className="flex-1">
                      <span className={
                        action.type === "block" ? "text-orange-700 dark:text-orange-400 font-medium" :
                        action.type === "atlas" ? "text-foreground" : "text-muted-foreground"
                      }>
                        {action.text}
                      </span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0">T+{action.ts}s</span>
                  </div>
                ))}
                {visibleActions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Incident triggered — Atlas is assessing...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Guardrails (show once remediation stage reached) */}
          {cur >= 3 && Array.isArray(pipeline.industryGuardrails) && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold">Guardrails Enforced</span>
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
  const { pipeline, triggeredAt, completedAt } = state;
  if (!pipeline) return null;

  const elapsedSec = triggeredAt && completedAt
    ? Math.floor((new Date(completedAt).getTime() - new Date(triggeredAt).getTime()) / 1000)
    : state.elapsedSeconds;
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const res = pipeline.resolution ?? {};
  const atlasActions: string[] = Array.isArray(res.atlasAutonomousActions) ? res.atlasAutonomousActions as string[] : [];
  const humanActions: string[] = Array.isArray(res.requiresHumanAction) ? res.requiresHumanAction as string[] : [];
  const bi = pipeline.businessImpact ?? {};

  return (
    <div className="space-y-5">
      {/* Resolution banner */}
      <div className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 p-5 flex items-center gap-4">
        <CheckCircle2 className="h-10 w-10 text-green-600 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-green-700 dark:text-green-400">INCIDENT RESOLVED</span>
            <Badge className="bg-green-600 text-white text-[10px]">Autonomous</Badge>
          </div>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            FHIR EHR Feed Schema Drift — fully remediated in <strong>{timeStr}</strong>
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
                <p className="text-2xl font-bold text-green-600">{timeStr}</p>
                <p className="text-[11px] text-muted-foreground">Time to resolution</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">0</p>
                <p className="text-[11px] text-muted-foreground">Patient harm events</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-400">{bi.withAtlas}</p>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">{bi.financialExposure}</p>
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
                <p className="text-2xl font-bold text-red-600">8+ hrs</p>
                <p className="text-[11px] text-muted-foreground">Detection + remediation</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">6–8</p>
                <p className="text-[11px] text-muted-foreground">FTE-hours required</p>
              </div>
            </div>
            <p className="text-[11px] text-red-700 dark:text-red-400">{bi.withoutAtlas}</p>
            <p className="text-[11px] text-muted-foreground">{bi.criticalSafetyExposure}</p>
          </CardContent>
        </Card>
      </div>

      {/* What Atlas did */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
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
              Atlas handled 87% of the response autonomously. Clinical judgment stays with humans.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stage timeline */}
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

export default function SHHealthLive() {
  const qc = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: demoState } = useQuery<DemoState>({
    queryKey: ["/api/demo/sh-health/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-health/trigger"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-health/status"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-health/reset"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-health/status"] }),
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
              <span className="text-sm font-semibold">Clinical Data Integrity Monitor</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">Healthcare</Badge>
              {status === "running" && (
                <Badge className="text-[10px] shrink-0 bg-red-600 text-white animate-pulse">
                  LIVE
                </Badge>
              )}
              {status === "complete" && (
                <Badge className="text-[10px] shrink-0 bg-green-600 text-white">
                  RESOLVED
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              FHIR EHR Feed Self-Healing · Live Interactive Demo
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
          <IdleView
            onTrigger={() => triggerMutation.mutate()}
            isPending={triggerMutation.isPending}
          />
        ) : status === "running" ? (
          <RunningView state={demoState} />
        ) : (
          <CompleteView state={demoState} onReset={() => resetMutation.mutate()} />
        )}
      </div>
    </div>
  );
}
