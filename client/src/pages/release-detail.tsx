import { useQuery, useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
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

export default function ReleaseDetail() {
  const [, params] = useRoute("/deployments/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

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
            </div>
            <p className="text-xs text-muted-foreground font-mono" data-testid="text-release-id">
              {deployment.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPromote && (
            <Button
              onClick={() => promoteMutation.mutate()}
              disabled={promoteMutation.isPending}
              data-testid="button-promote"
            >
              <ArrowRight className="w-4 h-4 mr-1.5" />
              {promoteMutation.isPending ? "Promoting..." : `Promote to ${envOrder[envOrder.indexOf(deployment.environment) + 1]}`}
            </Button>
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
        <CanaryRules deployment={deployment} />
        <RollbackTriggers deployment={deployment} />
        <PromotionHistory deployment={deployment} allDeployments={allDeployments || []} />
      </div>
    </div>
  );
}
