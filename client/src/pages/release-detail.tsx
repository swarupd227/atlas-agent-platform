import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deployment: Deployment;
  onConfirm: () => void;
  isPending: boolean;
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
                      <span className="text-xs font-medium">{check.name}</span>
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
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={isPending || readiness?.overallStatus === "blocked"}
            data-testid="button-confirm-promote"
          >
            {isPending ? "Promoting..." : readiness?.overallStatus === "blocked" ? "Blocked" : `Promote to ${nextEnv}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReleaseDetail() {
  const [, params] = useRoute("/deployments/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { industry: activeIndustry } = useIndustry();
  const id = params?.id;
  const [promoteOpen, setPromoteOpen] = useState(false);

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
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deployments/${id}/promote`, {});
      return res.json();
    },
    onSuccess: (promoted: Deployment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deployments", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setPromoteOpen(false);
      toast({ title: "Release promoted", description: `Promoted to ${promoted.environment}` });
      navigate(`/deployments/${promoted.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Promotion failed", description: err.message, variant: "destructive" });
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
              <div className="flex flex-col gap-0">
                {stages.map((stage) => {
                  const record = stageRecords.find(r => r.stageId === stage.id);
                  const status = record?.status || "pending";
                  return (
                    <div key={stage.id} className="flex items-start gap-3" data-testid={`pipeline-stage-${stage.id}`}>
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          status === "completed" ? "border-emerald-500 bg-emerald-500/10" :
                          status === "in_progress" ? "border-amber-500 bg-amber-500/10" :
                          "border-muted-foreground/30 bg-muted/30"
                        }`}>
                          {status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : status === "in_progress" ? (
                            <Circle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">{stage.order}</span>
                          )}
                        </div>
                        {stage.order < stages.length && (
                          <div className="w-0.5 h-8 bg-muted-foreground/20" />
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
                          <Badge variant="outline" className={`text-[10px] ${
                            status === "completed" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
                            status === "in_progress" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" :
                            ""
                          }`} data-testid={`badge-stage-status-${stage.id}`}>
                            {status === "completed" ? "Completed" : status === "in_progress" ? "In Progress" : "Pending"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{stage.description}</p>
                        {status === "pending" && (
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
                        {status === "in_progress" && (
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
                        {status === "completed" && record && (
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
          onOpenChange={setPromoteOpen}
          deployment={deployment}
          onConfirm={() => promoteMutation.mutate()}
          isPending={promoteMutation.isPending}
        />
      )}
    </div>
  );
}
