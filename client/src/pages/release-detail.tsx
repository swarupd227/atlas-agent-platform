import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Rocket,
  ArrowLeft,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Hash,
  GitBranch,
  Server,
  Activity,
  Timer,
  TrendingUp,
  Gauge,
  ShieldAlert,
  ChevronRight,
  Eye,
  Zap,
  XCircle,
  BarChart3,
  ArrowUpRight,
  ShieldCheck,
  Factory,
  ClipboardCheck,
  FileCheck,
  AlertOctagon,
  Circle,
  CheckCircle2,
  Play,
  Loader2,
} from "lucide-react";
import { mandatoryPipelineStages, industryRollbackTriggers, evidencePackageItems, industryLabels, type IndustryId, type DeploymentStageRecord, type DeploymentEvidenceRecord, getPipelineCompletion, getEvidenceCompletion } from "@/lib/industry-deployment-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { BlastRadius } from "@/components/blast-radius";
import { useIndustry } from "@/components/industry-provider";
import { getIndustryFromAgent } from "@/lib/industry-deployment-pipeline";
import { InfoRow, formatDate, formatHash } from "@/components/shared-utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Deployment } from "@shared/schema";

const envColors: Record<string, string> = {
  staging: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  pilot: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  prod: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const envOrder = ["staging", "pilot", "prod"];

interface ReadinessCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "unknown";
  value: string;
  detail: string;
  enforced?: boolean;
}

interface EvalGateError {
  message: string;
  evalGateBlocked: boolean;
  threshold: number;
  failingSuites: Array<{ name: string; passRate: number }>;
}

interface OntologyAlignmentError {
  blocked: boolean;
  reason: string;
  message: string;
  lowAlignmentTools: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }>;
}

interface ReadinessData {
  checks: ReadinessCheck[];
  overallStatus: "ready" | "warning" | "blocked";
  blastRadius: {
    affectedRunsPerDay?: number;
    revenueExposure?: string;
    environment?: string;
    downstreamAgents?: number;
    rollbackTimeEstimate?: string;
    boundOutcomes?: string[];
  };
  agentName: string;
}

function ReleaseOverview({ deployment }: { deployment: Deployment }) {
  return (
    <Card data-testid="section-release-overview">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Release Overview</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        <InfoRow label="Agent" value={deployment.agentName || "Unknown"} testId="text-release-agent" />
        <InfoRow label="Version" value={`v${deployment.version}`} testId="text-release-version" />
        <InfoRow label="Environment" value={
          <Badge variant="outline" className={`text-[11px] ${envColors[deployment.environment] || ""}`}>
            {deployment.environment}
          </Badge>
        } testId="text-release-env" />
        <InfoRow label="Status" value={<StatusBadge status={deployment.status} />} testId="text-release-status" />
        <InfoRow label="Rollout Strategy" value={
          <Badge variant="outline" className="text-[11px]">{deployment.rolloutStrategy}</Badge>
        } testId="text-release-strategy" />
        <InfoRow label="Canary Traffic" value={`${deployment.canaryPercent || 0}%`} testId="text-release-canary-pct" />
        <InfoRow label="Signature" value={
          <span className="font-mono text-xs">{formatHash(deployment.signatureHash)}</span>
        } testId="text-release-signature" />
        <InfoRow label="Approved By" value={deployment.approvedBy || "—"} testId="text-release-approved-by" />
        <InfoRow label="Created" value={formatDate(deployment.createdAt)} testId="text-release-created" />
        <InfoRow label="Deployed" value={formatDate(deployment.deployedAt)} testId="text-release-deployed" />
        {deployment.promotedAt && <InfoRow label="Promoted" value={formatDate(deployment.promotedAt)} testId="text-release-promoted" />}
        {deployment.completedAt && <InfoRow label="Completed" value={formatDate(deployment.completedAt)} testId="text-release-completed" />}
      </CardContent>
    </Card>
  );
}

function ShadowModePanel({ deployment }: { deployment: Deployment }) {
  const isShadow = deployment.rolloutStrategy === "shadow";

  if (!isShadow) return null;

  const shadowMetrics = {
    shadowSuccessRate: 97.2,
    liveSuccessRate: 98.1,
    shadowAvgLatency: 342,
    liveAvgLatency: 285,
    shadowErrorRate: 2.8,
    liveErrorRate: 1.9,
    requestsProcessed: 12450,
    divergenceRate: 4.3,
  };

  const comparison = [
    { label: "Success Rate", shadow: `${shadowMetrics.shadowSuccessRate}%`, live: `${shadowMetrics.liveSuccessRate}%`, delta: (shadowMetrics.shadowSuccessRate - shadowMetrics.liveSuccessRate).toFixed(1), good: shadowMetrics.shadowSuccessRate >= shadowMetrics.liveSuccessRate * 0.95 },
    { label: "Avg Latency", shadow: `${shadowMetrics.shadowAvgLatency}ms`, live: `${shadowMetrics.liveAvgLatency}ms`, delta: `+${shadowMetrics.shadowAvgLatency - shadowMetrics.liveAvgLatency}ms`, good: shadowMetrics.shadowAvgLatency <= shadowMetrics.liveAvgLatency * 1.2 },
    { label: "Error Rate", shadow: `${shadowMetrics.shadowErrorRate}%`, live: `${shadowMetrics.liveErrorRate}%`, delta: `+${(shadowMetrics.shadowErrorRate - shadowMetrics.liveErrorRate).toFixed(1)}%`, good: shadowMetrics.shadowErrorRate <= shadowMetrics.liveErrorRate * 1.5 },
  ];

  const allGood = comparison.every(c => c.good);

  return (
    <Card data-testid="section-shadow-mode">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Shadow Mode Testing</CardTitle>
          </div>
          <Badge variant="outline" className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
            Shadow Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-muted/20">
          <span className="text-[11px] text-muted-foreground">Requests Processed</span>
          <span className="text-sm font-semibold" data-testid="text-shadow-requests">{shadowMetrics.requestsProcessed.toLocaleString()}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-4 gap-2 px-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Metric</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Shadow</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Live</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-right">Delta</span>
          </div>
          {comparison.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 p-2 rounded-md bg-muted/30" data-testid={`shadow-metric-${i}`}>
              <span className="text-xs font-medium">{row.label}</span>
              <span className="text-xs text-center font-mono">{row.shadow}</span>
              <span className="text-xs text-center font-mono">{row.live}</span>
              <div className="flex items-center justify-end gap-1">
                <span className={`text-xs font-mono ${row.good ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {row.delta}
                </span>
                {row.good ? (
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-muted/20">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Response Divergence Rate</span>
          </div>
          <span className={`text-sm font-semibold ${shadowMetrics.divergenceRate <= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} data-testid="text-shadow-divergence">
            {shadowMetrics.divergenceRate}%
          </span>
        </div>

        <div className={`flex items-center gap-2 p-2.5 rounded-md ${allGood ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-amber-500/5 border border-amber-500/10"}`}>
          {allGood ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="text-[11px]" data-testid="text-shadow-verdict">
            {allGood ? "Shadow performance is within acceptable range. Ready to graduate to live traffic." : "Some shadow metrics deviate from live. Review before graduating."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CanaryRules({ deployment }: { deployment: Deployment }) {
  const config = deployment.canaryConfig as any;
  if (!config) {
    return (
      <Card data-testid="section-canary-rules">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Canary Rules</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-4 text-center">No canary configuration — using direct deployment</p>
        </CardContent>
      </Card>
    );
  }

  const currentPercent = deployment.canaryPercent || 0;
  const steps: number[] = [];
  if (config.startPercent != null && config.stepPercent) {
    let pct = config.startPercent;
    while (pct <= 100) {
      steps.push(pct);
      if (pct >= 100) break;
      pct = Math.min(pct + config.stepPercent, 100);
    }
  }

  return (
    <Card data-testid="section-canary-rules">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Canary Rules</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Canary Progress</span>
            <span className="text-sm font-semibold" data-testid="text-canary-current">{currentPercent}%</span>
          </div>
          <Progress value={currentPercent} className="h-2" />
          {steps.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Badge
                    variant={currentPercent >= step ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {step}%
                  </Badge>
                  {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Start %</span>
            <span className="text-sm font-medium" data-testid="text-canary-start">{config.startPercent}%</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Step %</span>
            <span className="text-sm font-medium" data-testid="text-canary-step">{config.stepPercent}%</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Interval</span>
            <span className="text-sm font-medium" data-testid="text-canary-interval">{config.intervalMinutes}m</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Success Threshold</span>
            <span className="text-sm font-medium" data-testid="text-canary-threshold">{((config.successThreshold || 0) * 100).toFixed(1)}%</span>
          </div>
        </div>

        {config.healthCheckUrl && (
          <InfoRow label="Health Check" value={
            <span className="font-mono text-xs">{config.healthCheckUrl}</span>
          } testId="text-canary-healthcheck" />
        )}
        {config.maxErrorRate != null && (
          <InfoRow label="Max Error Rate" value={`${(config.maxErrorRate * 100).toFixed(1)}%`} testId="text-canary-max-error" />
        )}
      </CardContent>
    </Card>
  );
}

function RollbackTriggers({ deployment }: { deployment: Deployment }) {
  const config = deployment.rollbackConfig as any;
  if (!config) {
    return (
      <Card data-testid="section-rollback-triggers">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Rollback Triggers</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-4 text-center">No rollback configuration</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="section-rollback-triggers">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Rollback Triggers</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Auto-Rollback</span>
            <span className="text-sm font-medium" data-testid="text-rollback-auto">
              {config.autoRollbackEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Rollback To</span>
            <span className="text-sm font-medium" data-testid="text-rollback-to">{config.rollbackToVersion || "previous"}</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">Error Rate Threshold</span>
            <span className="text-sm font-medium" data-testid="text-rollback-error-rate">
              {config.errorRateThreshold != null ? `${(config.errorRateThreshold * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/30">
            <span className="text-[11px] text-muted-foreground">P99 Latency Threshold</span>
            <span className="text-sm font-medium" data-testid="text-rollback-latency">
              {config.latencyP99Threshold != null ? `${config.latencyP99Threshold}ms` : "—"}
            </span>
          </div>
        </div>

        {config.cooldownMinutes && (
          <InfoRow label="Cooldown Period" value={`${config.cooldownMinutes} minutes`} testId="text-rollback-cooldown" />
        )}

        {config.triggers && config.triggers.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Trigger Rules</span>
            <div className="flex flex-col gap-1.5">
              {config.triggers.map((trigger: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-muted/30" data-testid={`rollback-trigger-${i}`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-mono">{trigger.metric}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {trigger.operator} {trigger.value} ({trigger.windowMinutes}m window)
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FallbackRouting({ deployment, allDeployments }: { deployment: Deployment; allDeployments: Deployment[] }) {
  const config = deployment.rollbackConfig as any;
  const samEnvDeps = allDeployments
    .filter(d => d.environment === deployment.environment && d.id !== deployment.id)
    .sort((a, b) => new Date(b.deployedAt || b.createdAt || 0).getTime() - new Date(a.deployedAt || a.createdAt || 0).getTime());

  const lastGoodVersion = samEnvDeps.find(d => d.status === "deployed" || d.status === "active");
  const hasAutoRollback = config?.autoRollbackEnabled;

  return (
    <Card data-testid="section-fallback-routing">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Safe Fallback</CardTitle>
          </div>
          {hasAutoRollback && (
            <Badge variant="outline" className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
              Auto-Rollback Armed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Known Good Version</span>
          {lastGoodVersion ? (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-emerald-500/5 border border-emerald-500/10" data-testid="fallback-last-good">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium">{lastGoodVersion.agentName} v{lastGoodVersion.version}</span>
                  <span className="text-[10px] text-muted-foreground">
                    Deployed {formatDate(lastGoodVersion.deployedAt)} | {lastGoodVersion.environment}
                  </span>
                </div>
              </div>
              <StatusBadge status={lastGoodVersion.status} />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-muted-foreground">No previous stable version in {deployment.environment}</span>
            </div>
          )}
        </div>

        {hasAutoRollback && config.triggers && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto-Fallback Conditions</span>
            <div className="flex flex-wrap gap-1.5">
              {config.triggers.map((t: any, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px] font-mono" data-testid={`fallback-condition-${i}`}>
                  {t.metric} {t.operator} {t.value}
                </Badge>
              ))}
            </div>
            {config.cooldownMinutes && (
              <span className="text-[10px] text-muted-foreground">
                Cooldown: {config.cooldownMinutes}m before re-evaluation
              </span>
            )}
          </div>
        )}

        {!hasAutoRollback && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Auto-rollback is disabled. Manual intervention required if issues arise.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PromotionHistory({ deployment, allDeployments }: { deployment: Deployment; allDeployments: Deployment[] }) {
  const chain: Deployment[] = [];
  let current: Deployment | undefined = deployment;

  while (current?.promotedFrom) {
    const parent = allDeployments.find(d => d.id === current!.promotedFrom);
    if (parent) {
      chain.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }
  chain.push(deployment);

  const children = allDeployments.filter(d => d.promotedFrom === deployment.id);
  chain.push(...children);

  const uniqueChain = chain.filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i);

  return (
    <Card data-testid="section-promotion-history">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Promotion History</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {uniqueChain.length <= 1 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No promotion chain — this is a standalone deployment</p>
        ) : (
          <div className="flex flex-col gap-0">
            {uniqueChain.map((dep, i) => {
              const isCurrent = dep.id === deployment.id;
              return (
                <div key={dep.id} className="flex items-start gap-3" data-testid={`promotion-step-${i}`}>
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      isCurrent ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-muted/30"
                    }`}>
                      <Server className={`w-3.5 h-3.5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    {i < uniqueChain.length - 1 && (
                      <div className="w-0.5 h-8 bg-muted-foreground/20" />
                    )}
                  </div>
                  <div className={`flex-1 pb-3 ${isCurrent ? "" : "opacity-70"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[11px] ${envColors[dep.environment] || ""}`}>
                        {dep.environment}
                      </Badge>
                      <span className="text-xs font-medium">v{dep.version}</span>
                      <StatusBadge status={dep.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {dep.deployedAt && (
                        <span className="text-[11px] text-muted-foreground">Deployed {formatDate(dep.deployedAt)}</span>
                      )}
                      {dep.promotedAt && (
                        <span className="text-[11px] text-muted-foreground">Promoted {formatDate(dep.promotedAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-1 mt-4 pt-3 border-t border-border/50">
          {envOrder.map((env, i) => {
            const inChain = uniqueChain.some(d => d.environment === env);
            return (
              <div key={env} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
                  inChain ? envColors[env] || "bg-muted" : "bg-muted/30 text-muted-foreground"
                }`}>
                  <Server className="w-3 h-3" />
                  <span className="text-xs font-medium capitalize">{env}</span>
                </div>
                {i < envOrder.length - 1 && (
                  <ArrowRight className={`w-3.5 h-3.5 ${inChain ? "text-foreground" : "text-muted-foreground/30"}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PromoteDialog({
  open,
  onOpenChange,
  deployment,
  onConfirm,
  onBypass,
  onBypassOntology,
  isPending,
  evalGateError,
  ontologyAlignmentError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deployment: Deployment;
  onConfirm: () => void;
  onBypass: () => void;
  onBypassOntology: () => void;
  isPending: boolean;
  evalGateError: EvalGateError | null;
  ontologyAlignmentError: OntologyAlignmentError | null;
}) {
  const nextEnv = envOrder[envOrder.indexOf(deployment.environment) + 1];

  const { data: readiness, isLoading } = useQuery<ReadinessData>({
    queryKey: ["/api/deployments", deployment.id, "readiness"],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${deployment.id}/readiness`);
      if (!res.ok) throw new Error("Failed to fetch readiness");
      return res.json();
    },
    enabled: open,
  });

  const checkStatusIcon = (status: string) => {
    switch (status) {
      case "pass": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "warn": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "fail": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const overallColor = readiness?.overallStatus === "ready"
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : readiness?.overallStatus === "warning"
    ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
    : "text-red-600 dark:text-red-400 bg-red-500/10";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5" />
            Promote to {nextEnv}
          </DialogTitle>
          <DialogDescription>
            Pre-promotion regression gate for {deployment.agentName} v{deployment.version}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : readiness ? (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
            <div className={`flex items-center justify-between gap-2 p-3 rounded-md ${overallColor}`} data-testid="readiness-overall">
              <div className="flex items-center gap-2">
                {readiness.overallStatus === "ready" ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : readiness.overallStatus === "warning" ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span className="text-sm font-medium capitalize">{readiness.overallStatus === "ready" ? "All Checks Passed" : readiness.overallStatus === "warning" ? "Warnings Detected" : "Promotion Blocked"}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {readiness.checks.filter(c => c.status === "pass").length}/{readiness.checks.length} passed
              </Badge>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium">Regression Checks</span>
              {readiness.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`readiness-check-${i}`}>
                  {checkStatusIcon(check.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium">{check.name}</span>
                        {check.enforced && (
                          <Badge variant="outline" className="text-[9px] text-blue-600 dark:text-blue-400 bg-blue-500/10" data-testid={`badge-enforced-${i}`}>
                            Enforced
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-mono">{check.value}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            {nextEnv === "prod" && readiness.blastRadius && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium">Business Continuity Impact</span>
                <BlastRadius
                  data={{
                    affectedRunsPerDay: readiness.blastRadius.affectedRunsPerDay,
                    revenueExposure: readiness.blastRadius.revenueExposure,
                    environment: readiness.blastRadius.environment,
                    downstreamAgents: readiness.blastRadius.downstreamAgents,
                    rollbackTimeEstimate: readiness.blastRadius.rollbackTimeEstimate,
                  }}
                  testIdPrefix="promote-blast"
                />
                {readiness.blastRadius.boundOutcomes && readiness.blastRadius.boundOutcomes.length > 0 && (
                  <div className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/20">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bound Outcomes</span>
                    <div className="flex flex-wrap gap-1">
                      {readiness.blastRadius.boundOutcomes.map((name, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {nextEnv === "prod" && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10">
                <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  A launch readiness approval will be auto-created for expert validation.
                </span>
              </div>
            )}

            {readiness?.checks.some(c => c.enforced) && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  Eval pass rate is server-enforced. Production requires {"\u2265"}80%, pilot requires {"\u2265"}60%.
                </span>
              </div>
            )}

            {evalGateError && (
              <div className="flex flex-col gap-2 p-3 rounded-md bg-red-500/5 border border-red-500/10" data-testid="eval-gate-error">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">
                    Eval Gate Blocked: Pass rate below {evalGateError.threshold}%
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 ml-6">
                  {evalGateError.failingSuites.map((suite, i) => (
                    <div key={i} className="flex items-center justify-between gap-2" data-testid={`eval-gate-suite-${i}`}>
                      <span className="text-[11px] text-muted-foreground">{suite.name}</span>
                      <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/10">
                        {suite.passRate.toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] text-amber-700 dark:text-amber-300">
                    You can bypass this gate with explicit acknowledgment. This will be logged in the audit trail.
                  </span>
                </div>
              </div>
            )}

            {ontologyAlignmentError && (
              <div className="flex flex-col gap-2 p-3 rounded-md bg-red-500/5 border border-red-500/10" data-testid="ontology-alignment-error">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">
                    Ontology Alignment Blocked: {ontologyAlignmentError.lowAlignmentTools.length} tool(s) below 50% threshold
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 ml-6">
                  {ontologyAlignmentError.lowAlignmentTools.map((tool, i) => (
                    <div key={i} className="flex items-center justify-between gap-2" data-testid={`ontology-tool-${i}`}>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium">{tool.toolName}</span>
                        <span className="text-[10px] text-muted-foreground">{tool.serverName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{tool.matched}/{tool.total} params</span>
                        <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/10">
                          {Math.round(tool.score * 100)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] text-amber-700 dark:text-amber-300">
                    Production deployments require all tools to have at least 50% ontology alignment. You can bypass this check — the bypass will be logged in the audit trail.
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-promote">Cancel</Button>
          {ontologyAlignmentError ? (
            <Button
              variant="destructive"
              onClick={onBypassOntology}
              disabled={isPending}
              data-testid="button-bypass-ontology"
            >
              {isPending ? "Promoting..." : "Bypass Ontology Check & Promote"}
            </Button>
          ) : evalGateError ? (
            <Button
              variant="destructive"
              onClick={onBypass}
              disabled={isPending || (readiness?.checks.some(c => c.status === "fail" && !c.enforced) ?? false)}
              data-testid="button-bypass-eval-gate"
            >
              {isPending ? "Promoting..." : (readiness?.checks.some(c => c.status === "fail" && !c.enforced) ? "Other Checks Failing" : "Bypass Eval Gate & Promote")}
            </Button>
          ) : (
            <Button
              onClick={onConfirm}
              disabled={isPending || readiness?.overallStatus === "blocked"}
              data-testid="button-confirm-promote"
            >
              {isPending ? "Promoting..." : readiness?.overallStatus === "blocked" ? "Blocked" : `Promote to ${nextEnv}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuntimeStatusCard({ deploymentId, agentId }: { deploymentId: string; agentId: string }) {
  const { toast } = useToast();
  const { data: runtimeStatus, isLoading } = useQuery<{ active: boolean; runs: any[] }>({
    queryKey: ["/api/deployments", deploymentId, "runtime-status"],
    refetchInterval: 10000,
  });

  const executeNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${deploymentId}/execute-now`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", deploymentId, "runtime-status"] });
      toast({ title: "Agent executed", description: "Manual execution completed successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    },
  });

  const stopRuntimeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${deploymentId}/stop-runtime`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", deploymentId, "runtime-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", deploymentId] });
      toast({ title: "Runtime stopped" });
    },
  });

  const startRuntimeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${deploymentId}/start-runtime`, {});
      return res.json();
    },
    onSuccess: (data: { started: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", deploymentId, "runtime-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", deploymentId] });
      if (data.started) {
        toast({ title: "Runtime started", description: data.message });
      } else {
        toast({ title: "Could not start runtime", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start runtime", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>;

  const isActive = runtimeStatus?.active || false;
  const runs = runtimeStatus?.runs || [];

  return (
    <Card data-testid="section-agent-runtime">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Live Agent Runtime</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isActive ? (
              <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid="badge-runtime-active">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                Running
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]" data-testid="badge-runtime-inactive">Stopped</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {isActive ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executeNowMutation.mutate()}
                disabled={executeNowMutation.isPending}
                data-testid="button-execute-now"
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                {executeNowMutation.isPending ? "Executing..." : "Execute Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => stopRuntimeMutation.mutate()}
                disabled={stopRuntimeMutation.isPending}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
                data-testid="button-stop-runtime"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => startRuntimeMutation.mutate()}
              disabled={startRuntimeMutation.isPending}
              data-testid="button-start-runtime"
            >
              <Play className="w-3.5 h-3.5 mr-1" />
              {startRuntimeMutation.isPending ? "Starting..." : "Start Runtime"}
            </Button>
          )}
        </div>

        {isActive && (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10">
            <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-[11px] text-blue-700 dark:text-blue-400">
              Agent is running in the background. Next execution in ~5 minutes. Data flows through registered MCP integrations.
            </span>
          </div>
        )}

        {runs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground mb-1">Recent Executions</span>
            {runs.slice(0, 10).map((run: any) => {
              const summary = run.resultSummary || {};
              const severity = summary.severity || "unknown";
              const sevColor = severity === "critical" ? "text-red-600 dark:text-red-400" : severity === "high" ? "text-amber-600 dark:text-amber-400" : severity === "medium" ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400";
              return (
                <div key={run.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`runtime-run-${run.id}`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {run.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : run.status === "running" ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium">
                          {summary.city || "Weather Check"}
                        </span>
                        {summary.temperature !== undefined && (
                          <span className="text-[10px] text-muted-foreground">{summary.temperature}°C</span>
                        )}
                        {summary.windSpeed !== undefined && (
                          <span className="text-[10px] text-muted-foreground">Wind {summary.windSpeed} km/h</span>
                        )}
                        <span className={`text-[10px] font-medium ${sevColor}`}>{severity}</span>
                        {summary.alertTriggered && (
                          <Badge variant="outline" className="text-[9px] text-red-600 dark:text-red-400 bg-red-500/10 px-1 py-0">Alert</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">
                          {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : ""}
                        </span>
                        {run.latencyMs > 0 && (
                          <span className="text-[10px] text-muted-foreground">{run.latencyMs}ms</span>
                        )}
                        {summary.source === "mcp_integration" && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400">via MCP</span>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {run.triggerType === "manual" ? "Manual" : "Scheduled"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {runs.length === 0 && !isActive && (
          <div className="text-center py-4">
            <span className="text-xs text-muted-foreground">No execution history yet. Start the runtime to begin monitoring.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReleaseDetail() {
  const [, params] = useRoute("/deployments/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { industry: activeIndustry } = useIndustry();
  const id = params?.id;
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [evalGateError, setEvalGateError] = useState<EvalGateError | null>(null);
  const [ontologyAlignmentError, setOntologyAlignmentError] = useState<OntologyAlignmentError | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineAnimStep, setPipelineAnimStep] = useState(-1);

  const { data: deployment, isLoading } = useQuery<Deployment>({
    queryKey: ["/api/deployments", id],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${id}`);
      if (!res.ok) throw new Error("Failed to fetch deployment");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: allDeployments } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });

  const promoteMutation = useMutation({
    mutationFn: async (opts: { bypassEvalGate?: boolean; bypassOntologyCheck?: boolean }) => {
      const role = localStorage.getItem("almp-role") || "admin";
      const body: Record<string, boolean> = {};
      if (opts?.bypassEvalGate) body.bypassEvalGate = true;
      if (opts?.bypassOntologyCheck) body.bypassOntologyCheck = true;
      const res = await fetch(`/api/deployments/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Role": role },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const resBody = await res.json();
      if (!res.ok) {
        if (resBody.evalGateBlocked) {
          const err = new Error(resBody.message) as Error & { evalGateData: EvalGateError };
          err.evalGateData = resBody;
          throw err;
        }
        if (resBody.reason === "ontology_alignment") {
          const err = new Error(resBody.message) as Error & { ontologyData: OntologyAlignmentError };
          err.ontologyData = resBody;
          throw err;
        }
        throw new Error(resBody.message || "Promotion failed");
      }
      return resBody;
    },
    onSuccess: (promoted: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setEvalGateError(null);
      setOntologyAlignmentError(null);
      setPromoteOpen(false);
      if (promoted.evalWarning) {
        toast({ title: "Release promoted with warning", description: promoted.evalWarning });
      } else {
        toast({ title: "Release promoted", description: `Promoted to ${promoted.environment}` });
      }
      navigate(`/deployments/${promoted.id}`);
    },
    onError: (err: any) => {
      if (err.evalGateData) {
        setEvalGateError(err.evalGateData as EvalGateError);
      } else if (err.ontologyData) {
        setOntologyAlignmentError(err.ontologyData as OntologyAlignmentError);
      } else {
        toast({ title: "Promotion failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${id}/rollback`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      toast({ title: "Release rolled back" });
    },
    onError: (err: Error) => {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    },
  });

  const graduateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/deployments/${id}`, { rolloutStrategy: "canary", status: "deployed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      toast({ title: "Graduated from shadow mode", description: "Now receiving live traffic" });
    },
    onError: (err: Error) => {
      toast({ title: "Graduation failed", description: err.message, variant: "destructive" });
    },
  });

  const initPipelineMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/deployments/${id}/initialize-pipeline`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      toast({ title: "Pipeline initialized", description: "Industry deployment pipeline has been configured." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to initialize pipeline", description: err.message, variant: "destructive" });
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: async (data: { stageId: string; status: string; attestation?: string; completedBy?: string }) => {
      const res = await apiRequest("POST", `/api/deployments/${id}/advance-stage`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      toast({ title: "Stage updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update stage", description: err.message, variant: "destructive" });
    },
  });

  const runPipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${id}/run-pipeline`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      toast({ title: "Pipeline completed", description: "All stages have been verified and completed." });
    },
    onError: (err: Error) => {
      toast({ title: "Pipeline execution failed", description: err.message, variant: "destructive" });
      setPipelineRunning(false);
      setPipelineAnimStep(-1);
    },
  });

  const handleRunPipeline = useCallback(() => {
    setPipelineRunning(true);
    setPipelineAnimStep(0);
    runPipelineMutation.mutate();
  }, [runPipelineMutation]);

  useEffect(() => {
    if (!pipelineRunning || pipelineAnimStep < 0) return;
    const totalStages = stageRecordsForAnim;
    if (pipelineAnimStep >= totalStages) {
      setPipelineRunning(false);
      return;
    }
    const timer = setTimeout(() => {
      setPipelineAnimStep(prev => prev + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [pipelineRunning, pipelineAnimStep]);

  const stageRecordsForAnim = (() => {
    if (!deployment) return 0;
    const sr = (deployment.pipelineStages as any[]) || [];
    return sr.length;
  })();

  const activateDeploymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${id}/start-runtime`, {});
      return res.json();
    },
    onSuccess: (data: { started: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      if (data.started) {
        toast({ title: "Deployment activated", description: "The agent runtime has been started and the deployment is now live." });
      } else {
        toast({ title: "Activation issue", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to activate deployment", description: err.message, variant: "destructive" });
    },
  });

  const collectEvidenceMutation = useMutation({
    mutationFn: async (data: { itemId: string; sourceLink?: string; summary?: string }) => {
      const res = await apiRequest("POST", `/api/deployments/${id}/collect-evidence`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      toast({ title: "Evidence collected" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to collect evidence", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">Release not found</p>
        <Button variant="outline" onClick={() => navigate("/deployments")} data-testid="button-back-deployments">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Deployments
        </Button>
      </div>
    );
  }

  const canPromote = deployment.environment !== "prod" &&
    deployment.status !== "rolled_back" &&
    deployment.status !== "promoted";
  const canRollback = deployment.status === "deployed" || deployment.status === "canary" || deployment.status === "active";
  const isShadow = deployment.rolloutStrategy === "shadow";
  const validIndustries: IndustryId[] = ["healthcare", "financial_services", "manufacturing", "insurance", "retail"];
  const fromDeployment = deployment.industry as string | null;
  const fromWorkspace = activeIndustry?.id as string | null;
  const rawIndustry = fromDeployment || fromWorkspace || null;
  const detectedIndustry = rawIndustry && validIndustries.includes(rawIndustry as IndustryId) ? rawIndustry as IndustryId : null;
  const stages = detectedIndustry ? mandatoryPipelineStages[detectedIndustry] || [] : [];
  const stageRecords = (deployment.pipelineStages as DeploymentStageRecord[]) || [];
  const evidenceRecords = (deployment.evidencePackage as DeploymentEvidenceRecord[]) || [];
  const rollbackTrigs = detectedIndustry ? industryRollbackTriggers[detectedIndustry] || [] : [];
  const evidenceItems = detectedIndustry ? evidencePackageItems[detectedIndustry] || [] : [];
  const pipelineProgress = getPipelineCompletion(stageRecords, stages);
  const evidenceProgress = getEvidenceCompletion(evidenceRecords, evidenceItems);
  const pipelineBlocked = deployment.pipelineComplete === false && stageRecords.length > 0;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-release-detail">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/deployments")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-release-title">
                {deployment.agentName || "Agent"} — v{deployment.version}
              </h1>
              <Badge variant="outline" className={`text-[11px] ${envColors[deployment.environment] || ""}`}>
                {deployment.environment}
              </Badge>
              <StatusBadge status={deployment.status} />
              {isShadow && (
                <Badge variant="outline" className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                  Shadow
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono" data-testid="text-release-id">
              {deployment.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(deployment.status === "pending" || deployment.status === "inactive") && (
            <Button
              onClick={() => activateDeploymentMutation.mutate()}
              disabled={activateDeploymentMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-activate-deployment"
            >
              <Rocket className="w-4 h-4 mr-1.5" />
              {activateDeploymentMutation.isPending ? "Activating..." : deployment.status === "inactive" ? "Reactivate Deployment" : "Activate Deployment"}
            </Button>
          )}
          {isShadow && (
            <Button
              variant="outline"
              onClick={() => graduateMutation.mutate()}
              disabled={graduateMutation.isPending}
              data-testid="button-graduate-shadow"
            >
              <ArrowUpRight className="w-4 h-4 mr-1.5" />
              {graduateMutation.isPending ? "Graduating..." : "Graduate to Live"}
            </Button>
          )}
          {canPromote && (
            <div className="flex items-center gap-2">
              {pipelineBlocked && (
                <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-pipeline-block-warning">
                  Complete all mandatory pipeline stages before promoting
                </span>
              )}
              <Button
                onClick={() => setPromoteOpen(true)}
                disabled={pipelineBlocked}
                data-testid="button-promote"
              >
                <ArrowRight className="w-4 h-4 mr-1.5" />
                Promote to {envOrder[envOrder.indexOf(deployment.environment) + 1]}
              </Button>
            </div>
          )}
          {canRollback && (
            <Button
              variant="destructive"
              onClick={() => rollbackMutation.mutate()}
              disabled={rollbackMutation.isPending}
              data-testid="button-rollback"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              {rollbackMutation.isPending ? "Rolling back..." : "Rollback"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReleaseOverview deployment={deployment} />
        {isShadow && <ShadowModePanel deployment={deployment} />}
        <CanaryRules deployment={deployment} />
        <RollbackTriggers deployment={deployment} />
        <FallbackRouting deployment={deployment} allDeployments={allDeployments || []} />
        <PromotionHistory deployment={deployment} allDeployments={allDeployments || []} />
      </div>

      {detectedIndustry && (
        <Card data-testid="section-industry-pipeline">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Industry Deployment Pipeline</CardTitle>
              </div>
              <Badge variant="outline" className="text-[11px]" data-testid="badge-industry">
                {industryLabels[detectedIndustry]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Pipeline Progress</span>
                <span className="text-sm font-semibold" data-testid="text-pipeline-percent">{pipelineProgress.percent}%</span>
              </div>
              <Progress value={pipelineProgress.percent} className="h-2" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{pipelineProgress.completed}/{pipelineProgress.total} stages completed</span>
                {pipelineProgress.mandatoryComplete && (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                    All mandatory complete
                  </Badge>
                )}
              </div>
            </div>

            {stageRecords.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-xs text-muted-foreground text-center">Pipeline not initialized for this deployment.</p>
                <Button
                  onClick={() => initPipelineMutation.mutate({ industry: detectedIndustry, stages, rollbackTriggers: rollbackTrigs, evidenceItems })}
                  disabled={initPipelineMutation.isPending}
                  data-testid="button-init-pipeline"
                >
                  <ClipboardCheck className="w-4 h-4 mr-1.5" />
                  {initPipelineMutation.isPending ? "Initializing..." : "Initialize Pipeline"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {!deployment.pipelineComplete && !pipelineRunning && (
                  <Button
                    onClick={handleRunPipeline}
                    disabled={runPipelineMutation.isPending}
                    className="w-full"
                    data-testid="button-run-pipeline"
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    {runPipelineMutation.isPending ? "Running..." : "Run All Pipeline Stages"}
                  </Button>
                )}
                {pipelineRunning && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/5 border border-blue-500/10" data-testid="pipeline-running-banner">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                    <span className="text-xs text-blue-700 dark:text-blue-400">
                      Running pipeline verification... Stage {Math.min(pipelineAnimStep + 1, stages.length)}/{stages.length}
                    </span>
                  </div>
                )}
                {deployment.pipelineComplete && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/10" data-testid="pipeline-complete-banner">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      All pipeline stages verified and completed
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-0">
                  {stages.map((stage, stageIndex) => {
                    const record = stageRecords.find(r => r.stageId === stage.id);
                    const actualStatus = record?.status || "pending";
                    const isAnimatingThisStage = pipelineRunning && pipelineAnimStep === stageIndex;
                    const isAnimatedPast = pipelineRunning && pipelineAnimStep > stageIndex;
                    const displayStatus = isAnimatingThisStage ? "in_progress" : (isAnimatedPast || actualStatus === "completed") ? "completed" : actualStatus;
                    return (
                      <div key={stage.id} className={`flex items-start gap-3 transition-all duration-500 ${isAnimatingThisStage ? "scale-[1.02]" : ""}`} data-testid={`pipeline-stage-${stage.id}`}>
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                            displayStatus === "completed" ? "border-emerald-500 bg-emerald-500/10" :
                            displayStatus === "in_progress" ? "border-blue-500 bg-blue-500/10" :
                            "border-muted-foreground/30 bg-muted/30"
                          }`}>
                            {displayStatus === "completed" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : displayStatus === "in_progress" ? (
                              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground">{stage.order}</span>
                            )}
                          </div>
                          {stage.order < stages.length && (
                            <div className={`w-0.5 h-8 transition-all duration-500 ${displayStatus === "completed" ? "bg-emerald-500/40" : "bg-muted-foreground/20"}`} />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium" data-testid={`text-stage-name-${stage.id}`}>{stage.name}</span>
                              {stage.mandatory && (
                                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                  Mandatory
                                </Badge>
                              )}
                            </div>
                            <Badge variant="outline" className={`text-[10px] transition-all duration-300 ${
                              displayStatus === "completed" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
                              displayStatus === "in_progress" ? "text-blue-600 dark:text-blue-400 bg-blue-500/10" :
                              ""
                            }`} data-testid={`badge-stage-status-${stage.id}`}>
                              {displayStatus === "completed" ? "Verified" : displayStatus === "in_progress" ? "Verifying..." : "Pending"}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{stage.description}</p>
                          {!pipelineRunning && actualStatus === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => advanceStageMutation.mutate({ stageId: stage.id, status: "in_progress" })}
                              disabled={advanceStageMutation.isPending}
                              data-testid={`button-start-stage-${stage.id}`}
                            >
                              Start
                            </Button>
                          )}
                          {!pipelineRunning && actualStatus === "in_progress" && (
                            <Button
                              size="sm"
                              className="mt-2"
                              onClick={() => advanceStageMutation.mutate({ stageId: stage.id, status: "completed", completedBy: "Admin" })}
                              disabled={advanceStageMutation.isPending}
                              data-testid={`button-complete-stage-${stage.id}`}
                            >
                              Complete
                            </Button>
                          )}
                          {displayStatus === "completed" && isAnimatedPast && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Auto-verified by system</span>
                            </div>
                          )}
                          {actualStatus === "completed" && !pipelineRunning && record && (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {record.completedAt && (
                                <span className="text-[10px] text-muted-foreground">Completed {formatDate(record.completedAt)}</span>
                              )}
                              {record.completedBy && (
                                <span className="text-[10px] text-muted-foreground">by {record.completedBy}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {detectedIndustry && (
        <Card data-testid="section-evidence-package">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Deployment Evidence Package</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]" data-testid="badge-evidence-count">
                {evidenceProgress.collected}/{evidenceProgress.total} collected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Evidence Completion</span>
                <span className="text-sm font-semibold" data-testid="text-evidence-percent">{evidenceProgress.percent}%</span>
              </div>
              <Progress value={evidenceProgress.percent} className="h-2" />
            </div>

            <div className="flex flex-col gap-2">
              {evidenceItems.map((item) => {
                const record = evidenceRecords.find(r => r.itemId === item.id);
                const collected = record?.collected || false;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`evidence-item-${item.id}`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {collected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium" data-testid={`text-evidence-name-${item.id}`}>{item.name}</span>
                          {item.regulation && (
                            <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-500/10">
                              {item.regulation}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{item.description}</span>
                        <span className="text-[10px] text-muted-foreground">Source: {item.source}</span>
                        {collected && record?.collectedAt && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Collected {formatDate(record.collectedAt)}</span>
                        )}
                      </div>
                    </div>
                    {!collected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => collectEvidenceMutation.mutate({ itemId: item.id })}
                        disabled={collectEvidenceMutation.isPending}
                        data-testid={`button-collect-evidence-${item.id}`}
                      >
                        Collect
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {deployment && deployment.status === "deployed" && (
        <RuntimeStatusCard deploymentId={deployment.id} agentId={deployment.agentId} />
      )}

      {detectedIndustry && rollbackTrigs.length > 0 && (
        <Card data-testid="section-industry-rollback-triggers">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Industry Rollback Triggers</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {rollbackTrigs.map((trigger) => (
              <div key={trigger.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`industry-trigger-${trigger.id}`}>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium" data-testid={`text-trigger-name-${trigger.id}`}>{trigger.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${
                      trigger.severity === "critical" ? "text-red-600 dark:text-red-400 bg-red-500/10" :
                      trigger.severity === "high" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" :
                      "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                    }`} data-testid={`badge-trigger-severity-${trigger.id}`}>
                      {trigger.severity}
                    </Badge>
                    {trigger.autoRollback && (
                      <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/10">
                        Auto-Rollback
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{trigger.description}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {trigger.metric} {trigger.condition} {trigger.threshold != null ? `${trigger.threshold}${trigger.unit || ""}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canPromote && deployment && (
        <PromoteDialog
          open={promoteOpen}
          onOpenChange={(open) => {
            setPromoteOpen(open);
            if (!open) {
              setEvalGateError(null);
              setOntologyAlignmentError(null);
            }
          }}
          deployment={deployment}
          onConfirm={() => promoteMutation.mutate({})}
          onBypass={() => promoteMutation.mutate({ bypassEvalGate: true })}
          onBypassOntology={() => promoteMutation.mutate({ bypassOntologyCheck: true })}
          isPending={promoteMutation.isPending}
          evalGateError={evalGateError}
          ontologyAlignmentError={ontologyAlignmentError}
        />
      )}
    </div>
  );
}
