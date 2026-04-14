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
  ShoppingCart,
  Truck,
  Bell,
  Package,
  DollarSign,
  TrendingDown,
  Server,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "running" | "complete";

interface SkillInvoked {
  skillName: string;
  description: string;
  finding: string;
  duration: string;
}

interface RoutingRow {
  destination: string;
  orderCount: number;
  eligibility: string;
}

interface Pipeline {
  id: string;
  stage: string;
  detectedAt: string;
  resolvedAt?: string;
  diagnosisDetails?: {
    rootCause?: string;
    wmsErrorRate?: number;
    queueDepth?: number;
    connectionPool?: { available: number; total: number };
    ordersAtRisk?: number;
    sameDayDeliveries?: number;
    slaExposure?: number;
    skillsInvoked?: SkillInvoked[];
    routingPlan?: RoutingRow[];
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
    ordersProtected?: string;
    slaReduction?: string;
    notificationCompliance?: string;
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
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

// ─── Shared components ────────────────────────────────────────────────────────

function PulsingDot({ color = "bg-emerald-500" }: { color?: string }) {
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
              active ? "bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800" :
              done   ? "opacity-70" : "opacity-30"
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                active ? "bg-emerald-600 text-white" :
                done   ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {active ? <Loader2 className="h-4 w-4 animate-spin" /> :
                 done   ? <CheckCircle2 className="h-4 w-4" /> :
                          <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold ${
                active ? "text-emerald-700 dark:text-emerald-300" :
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

// ─── WMS Error Rate Gauge ─────────────────────────────────────────────────────

function ErrorRateGauge({ rate }: { rate: number }) {
  const pct = Math.min(rate, 100);
  const color = pct > 50 ? "bg-red-500" : pct > 20 ? "bg-orange-500" : pct > 2 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>0%</span>
        <span className="text-red-600 font-medium">Critical: 20%</span>
        <span>100%</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground">Nominal: &lt;2%</span>
        <span className={`text-[11px] font-bold ${pct > 20 ? "text-red-600" : "text-green-600"}`}>{rate}% error rate</span>
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
              <PulsingDot />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">AGENT ACTIVE</span>
            </div>
            <p className="text-sm font-semibold">Order Fulfillment Recovery Agent</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monitoring WMS API · SLA watchdog · Supervised autonomy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">WMS API Error Rate</span>
            </div>
            <p className="text-2xl font-bold text-green-600">&lt;0.1%</p>
            <p className="text-[11px] text-muted-foreground">Nominal · DB pool: 198/200 available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Daily Orders</span>
            </div>
            <p className="text-sm font-semibold text-green-600">23,400 processed</p>
            <p className="text-[11px] text-muted-foreground">All SLAs met · 312 same-day on track</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">WMS System Health</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              All Systems Operational
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-2xl font-bold text-green-600">&lt;0.1%</p>
              <p className="text-[11px] text-muted-foreground">API error rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold">198/200</p>
              <p className="text-[11px] text-muted-foreground">DB connections</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">$0</p>
              <p className="text-[11px] text-muted-foreground">SLA exposure</p>
            </div>
            <div>
              <p className="text-2xl font-bold">4</p>
              <p className="text-[11px] text-muted-foreground">Compliance frameworks</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Consumer Protection CP-01", "PCI-DSS v4.0", "GDPR", "CCPA"].map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px]">{fw}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 border-red-200 dark:border-red-800">
        <CardContent className="pt-6 pb-6 text-center">
          <TrendingDown className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">Simulate WMS API Cascade Failure</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Inject a database connection pool exhaustion during peak flash sale traffic. Watch Atlas
            detect the outage in 4 minutes, preserve 1,847 in-flight orders, activate fallback
            routing across DC-West, 3PL-FedEx, and retail stores, and notify every customer within
            the CP-01 30-minute window — all autonomously.
          </p>
          <Button
            data-testid="button-trigger-incident"
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white gap-2 px-8"
            onClick={onTrigger}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Trigger WMS Outage
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
  const routing: RoutingRow[]  = Array.isArray(diag.routingPlan)   ? (diag.routingPlan   as RoutingRow[])   : [];
  const hyp  = pipeline.hypothesis ?? {};
  const rem  = pipeline.remediation ?? {};
  const runbooks = Array.isArray(rem.runbooksTriggered) ? rem.runbooksTriggered : [];
  const policies = Array.isArray(rem.policiesEnforced)  ? rem.policiesEnforced  : [];

  const actionLog: Array<{ ts: number; text: string; type: "atlas" | "block" | "info" }> = [
    { ts: 0,  text: "WMS API error rate: 87% — DB connection pool exhausted (0/200 available)", type: "atlas" },
    { ts: 2,  text: "WMS Health Monitoring: critical threshold breached · 1,847 in-flight orders at risk", type: "atlas" },
  ];
  if (cur >= 1) {
    actionLog.push({ ts: 6,  text: "Root cause: flash sale traffic 340% above baseline — DB thread pool saturated",       type: "atlas" });
    actionLog.push({ ts: 10, text: "SLA Breach Detection: $340K exposure · 312 same-day ($180/order) · 482 next-day ($45/order)", type: "info"  });
    actionLog.push({ ts: 15, text: "Fallback Routing Engine: DC-West (1,200) + 3PL-FedEx (400) + stores (247) — all 1,847 reroutable", type: "atlas" });
  }
  if (cur >= 2) {
    actionLog.push({ ts: 28, text: "Hypothesis: queue preservation + fallback routing + CP-01 notifications (96% confidence)", type: "atlas" });
    actionLog.push({ ts: 30, text: "CP-01: 30-minute customer notification window — queuing notification blast now",           type: "block" });
    actionLog.push({ ts: 32, text: "SLA Escalation Policy: $340K > $100K threshold — VP Operations escalation queued",        type: "block" });
  }
  if (cur >= 3) {
    actionLog.push({ ts: 46, text: "WMS degraded mode activated · 1,847 orders preserved to Kafka durable queue (zero loss)", type: "atlas" });
    actionLog.push({ ts: 50, text: "Routing: 1,200 → DC-West | 400 → 3PL-FedEx | 247 → retail stores · ERP updated",         type: "atlas" });
    actionLog.push({ ts: 55, text: "Customer notification blast: 1,847 SMS + email dispatched · T+22min (CP-01 met)",         type: "atlas" });
    actionLog.push({ ts: 58, text: "PCI-DSS check: zero PAN data in recovery queue — scope maintained ✓",                   type: "info"  });
    actionLog.push({ ts: 60, text: "GDPR/CCPA: 3PL data transfer minimized (order ID + address + items only) ✓",              type: "info"  });
    actionLog.push({ ts: 62, text: "SLA escalation: $340K → $28K net (proactive remediation credits applied)",                type: "atlas" });
  }

  const visibleActions = actionLog.filter(a => a.ts <= elapsedSeconds);
  const errorRate   = diag.wmsErrorRate   ?? 87;
  const ordersAtRisk = diag.ordersAtRisk  ?? 1847;
  const slaExposure  = diag.slaExposure   ?? 340000;

  return (
    <div className="space-y-5">
      {/* Active incident banner */}
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3">
        <PulsingDot color="bg-red-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-red-700 dark:text-red-400">WMS OUTAGE ACTIVE</span>
            <span className="text-sm text-red-600 dark:text-red-400 font-mono">
              <ElapsedTimer triggeredAt={triggeredAt} />
            </span>
          </div>
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
            Primary WMS API Cascade Failure — Flash Sale Peak Traffic
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">SLA exposure</p>
          <p className="text-xl font-bold text-red-600">{fmtUsd(slaExposure)}</p>
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
              <ErrorRateGauge rate={errorRate} />
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-red-600">{fmtNum(ordersAtRisk)}</p>
                  <p className="text-[10px] text-muted-foreground">Orders at risk</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-orange-600">0/200</p>
                  <p className="text-[10px] text-muted-foreground">DB connections</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{fmtNum(diag.queueDepth ?? 12847)}</p>
                  <p className="text-[10px] text-muted-foreground">Queue depth</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Detection: 4 minutes (vs 45–90 min daily batch review) · p99 latency: 42s
              </p>
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
                    <p className="text-lg font-bold text-red-600">{fmtUsd(slaExposure)}</p>
                    <p className="text-[10px] text-muted-foreground">SLA exposure</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-orange-600">{diag.sameDayDeliveries ?? 312}</p>
                    <p className="text-[10px] text-muted-foreground">Same-day at risk</p>
                  </div>
                </div>
                {/* Routing plan */}
                {routing.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Fallback routing capacity</p>
                    {routing.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                        <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">{r.destination}</span>
                        <span className="text-muted-foreground ml-auto">{fmtNum(r.orderCount)} orders · {r.eligibility}</span>
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
                  <span className="font-bold text-green-600">{((hyp.confidence ?? 0.96) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm">{hyp.primaryHypothesis}</p>
                {Array.isArray(hyp.runbookCandidates) && hyp.runbookCandidates.map((rb: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] bg-emerald-50 dark:bg-emerald-950/30 rounded px-2 py-1.5">
                    <Package className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
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
            <Card className={cur >= 4 ? "border-green-200 dark:border-green-800" : "border-emerald-200 dark:border-emerald-800"}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  {cur >= 4
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <Loader2 className="h-4 w-4 text-emerald-600 animate-spin shrink-0" />}
                  <span className="text-sm font-semibold">Remediate</span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">T+65s</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {runbooks.map((rb: any, i: number) => (
                  <div key={i} className={`text-[11px] rounded px-2 py-1.5 ${rb.status === "completed" ? "bg-green-50 dark:bg-green-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}`}>
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
                <Activity className="h-4 w-4 text-emerald-600 animate-pulse" />
                <span className="text-sm font-semibold">Agent Action Log</span>
                <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                  LIVE
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="space-y-2">
                {visibleActions.map((action, i) => (
                  <div key={i} data-testid={`action-log-item-${i}`} className="flex items-start gap-2 text-[11px]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      action.type === "atlas" ? "bg-emerald-500" :
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
                  <p className="text-[11px] text-muted-foreground">WMS outage detected — Atlas is analysing...</p>
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
            <span className="text-lg font-bold text-green-700 dark:text-green-400">ORDERS PROTECTED</span>
            <Badge className="bg-green-600 text-white text-[10px]">Zero Loss</Badge>
            <Badge className="bg-emerald-600 text-white text-[10px]">CP-01 Met</Badge>
          </div>
          <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
            1,847 orders preserved · All customers notified · Completed in <strong>{timeStr}</strong>
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
                <p className="text-2xl font-bold text-green-600">4 min</p>
                <p className="text-[11px] text-muted-foreground">Detection time</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">$28K</p>
                <p className="text-[11px] text-muted-foreground">Net SLA penalties</p>
              </div>
            </div>
            <p className="text-[11px] text-green-700 dark:text-green-400">{bi.withAtlas}</p>
            <div className="flex gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.ordersProtected}</Badge>
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">{bi.notificationCompliance}</Badge>
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
                <p className="text-2xl font-bold text-red-600">45–90 min</p>
                <p className="text-[11px] text-muted-foreground">Detection lag</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">$340K</p>
                <p className="text-[11px] text-muted-foreground">Full SLA penalties</p>
              </div>
            </div>
            <p className="text-[11px] text-red-700 dark:text-red-400">{bi.withoutAtlas}</p>
            <p className="text-sm font-semibold text-red-600">{bi.slaReduction}</p>
          </CardContent>
        </Card>
      </div>

      {/* What Atlas did vs human */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" />
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
              Atlas handled detection, order preservation, routing, and customer notifications autonomously.
              SLA penalty negotiation and root-cause infrastructure review require human judgment.
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

export default function SHRetailLive() {
  const qc = useQueryClient();

  const { data: demoState } = useQuery<DemoState>({
    queryKey: ["/api/demo/sh-retail/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-retail/trigger"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-retail/status"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/demo/sh-retail/reset"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/demo/sh-retail/status"] }),
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
              <span className="text-sm font-semibold">Order Fulfillment Recovery Agent</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                Self-Healing
              </Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">Retail / E-Commerce</Badge>
              {status === "running" && (
                <Badge className="text-[10px] shrink-0 bg-red-600 text-white animate-pulse">LIVE</Badge>
              )}
              {status === "complete" && (
                <Badge className="text-[10px] shrink-0 bg-green-600 text-white">RESOLVED</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
              WMS API Cascade Failure Self-Healing · Live Interactive Demo
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
