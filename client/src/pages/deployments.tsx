import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Rocket,
  Plus,
  ArrowRight,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Server,
  Hash,
  ChevronRight,
  Activity,
  Timer,
  Zap,
  Lock,
  Unlock,
  ShieldAlert,
  Ban,
  ChevronLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { StatusBadge } from "@/components/status-badge";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Deployment, Agent, Approval, EvalSuite } from "@shared/schema";

const envColors: Record<string, string> = {
  staging: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  pilot: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  prod: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

interface EnvHealth {
  successRate: number;
  avgLatency: number;
  errorCount: number;
  traceCount: number;
}

interface FreezeStatus {
  frozen: boolean;
  scope?: string;
  reason?: string;
  frozenBy?: string;
  frozenAt?: string;
}

function EnvironmentPanel({
  env,
  deployments,
  onSelect,
  onNavigate,
  health,
  approvals,
  freezeStatus,
}: {
  env: string;
  deployments: Deployment[];
  onSelect: (id: string) => void;
  onNavigate: (path: string) => void;
  health?: EnvHealth;
  approvals?: Approval[];
  freezeStatus?: FreezeStatus;
}) {
  const envDeploys = deployments.filter((d) => d.environment === env);
  const active = envDeploys.filter((d) => d.status === "deployed" || d.status === "active");
  const pendingApprovals = approvals?.filter(
    (a) =>
      a.status === "pending" &&
      a.objectType === "deployment" &&
      envDeploys.some((d) => d.id === a.objectId)
  );

  const healthColor =
    !health || health.traceCount === 0
      ? "text-muted-foreground"
      : health.successRate >= 95
        ? "text-emerald-600 dark:text-emerald-400"
        : health.successRate >= 85
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <Card data-testid={`env-panel-${env}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${envColors[env] || "bg-muted"}`}
            >
              <Server className="w-3.5 h-3.5" />
            </div>
            <CardTitle className="text-sm font-medium capitalize">{env}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {freezeStatus?.frozen && (
              <Badge variant="destructive" className="text-[10px]" data-testid={`freeze-badge-${env}`}>
                <Lock className="w-3 h-3 mr-0.5" />
                Frozen
              </Badge>
            )}
            <Badge variant="outline" className="text-[11px]">
              {active.length} active
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pendingApprovals && pendingApprovals.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid={`pending-approvals-${env}`}>
            {pendingApprovals.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/10"
              >
                <Shield className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="text-[10px] text-amber-700 dark:text-amber-300 truncate">
                  {a.objectName || a.type} — awaiting approval
                </span>
              </div>
            ))}
          </div>
        )}

        {health && health.traceCount > 0 && (
          <div className="grid grid-cols-3 gap-2" data-testid={`health-${env}`}>
            <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Success</span>
              </div>
              <span
                className={`text-xs font-semibold ${healthColor}`}
                data-testid={`health-success-${env}`}
              >
                {health.successRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Latency</span>
              </div>
              <span className="text-xs font-semibold" data-testid={`health-latency-${env}`}>
                {health.avgLatency}ms
              </span>
            </div>
            <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Errors</span>
              </div>
              <span
                className={`text-xs font-semibold ${health.errorCount > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                data-testid={`health-errors-${env}`}
              >
                {health.errorCount}
              </span>
            </div>
          </div>
        )}
        {envDeploys.length > 0 ? (
          envDeploys.slice(0, 5).map((dep) => {
            const rollbackCfg = dep.rollbackConfig as { autoRollbackEnabled?: boolean; triggers?: any[] } | null;
            const triggersArmed = rollbackCfg?.autoRollbackEnabled && (rollbackCfg?.triggers?.length || 0) > 0;
            const lastApproval = approvals?.find(
              (a) => a.objectType === "deployment" && a.objectId === dep.id
            );
            return (
              <div
                key={dep.id}
                className="flex flex-col gap-2 p-2.5 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                onClick={() => onSelect(dep.id)}
                data-testid={`deploy-env-row-${dep.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{dep.agentName || "Agent"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      v{dep.version} | {dep.rolloutStrategy}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={dep.status} />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {dep.canaryPercent != null && dep.canaryPercent > 0 && (
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-canary-${dep.id}`}>
                      {dep.canaryPercent}% canary
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${dep.shadowEnabled ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "text-muted-foreground"}`}
                    data-testid={`badge-shadow-${dep.id}`}
                  >
                    {dep.shadowEnabled ? "Shadow ON" : "Shadow OFF"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${triggersArmed ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                    data-testid={`badge-rollback-${dep.id}`}
                  >
                    <ShieldAlert className="w-3 h-3 mr-0.5" />
                    {triggersArmed ? "Triggers Armed" : "No Triggers"}
                  </Badge>
                  {lastApproval && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] cursor-pointer ${lastApproval.status === "approved" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : lastApproval.status === "pending" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(`/approvals`);
                      }}
                      data-testid={`badge-approval-${dep.id}`}
                    >
                      <Shield className="w-3 h-3 mr-0.5" />
                      {lastApproval.status === "approved" ? "Approved" : lastApproval.status === "pending" ? "Pending Approval" : lastApproval.status}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">No deployments</p>
        )}
      </CardContent>
    </Card>
  );
}

interface AutopromoteRule {
  id: string;
  evalSuiteId: string;
  evalSuiteName: string;
  noViolationsWindowHours: number;
  targetCanaryPercent: number;
  enabled: boolean;
}

function CreateReleaseWizard({
  open,
  onOpenChange,
  agents,
  approvals,
  evalSuites,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  approvals: Approval[];
  evalSuites: EvalSuite[];
  onSubmit: (data: Record<string, any>) => void;
  isPending: boolean;
}) {
  const wizardStagingPerm = usePermission("deploy_staging_pilot");
  const wizardProdPerm = usePermission("deploy_prod");
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    agentId: "",
    environment: "staging",
    version: "1.0.0",
    rolloutStrategy: "canary",
    canaryPercent: 10,
    shadowEnabled: false,
    evalRegressionEnabled: true,
    evalRegressionThreshold: 10,
    policyViolationEnabled: true,
    policyViolationThreshold: 5,
    kpiDropEnabled: true,
    kpiDropThreshold: 0.7,
    autoRollbackEnabled: true,
  });
  const [autopromoteRules, setAutopromoteRules] = useState<AutopromoteRule[]>([]);

  const selectedAgent = agents?.find((a) => a.id === formData.agentId);
  const requiresApproval = formData.environment === "prod" || (formData.environment === "pilot" && selectedAgent?.riskTier === "HIGH");
  const existingPendingApprovals = approvals?.filter(
    (a) =>
      a.status === "pending" &&
      a.objectType === "deployment" &&
      selectedAgent &&
      a.objectName?.includes(selectedAgent.name)
  );

  const handleSubmit = () => {
    const rollbackConfig = {
      autoRollbackEnabled: formData.autoRollbackEnabled,
      triggers: [] as any[],
      cooldownMinutes: 15,
    };
    if (formData.evalRegressionEnabled) {
      rollbackConfig.triggers.push({
        metric: "eval_pass_rate_drop",
        operator: ">",
        value: `${formData.evalRegressionThreshold}%`,
        windowMinutes: 30,
      });
    }
    if (formData.policyViolationEnabled) {
      rollbackConfig.triggers.push({
        metric: "policy_violations",
        operator: ">",
        value: `${formData.policyViolationThreshold}`,
        windowMinutes: 60,
      });
    }
    if (formData.kpiDropEnabled) {
      rollbackConfig.triggers.push({
        metric: "kpi_confidence",
        operator: "<",
        value: `${formData.kpiDropThreshold}`,
        windowMinutes: 60,
      });
    }

    const canaryConfig =
      formData.rolloutStrategy === "canary"
        ? {
            startPercent: formData.canaryPercent,
            stepPercent: 25,
            intervalMinutes: 15,
            successThreshold: 0.95,
            maxErrorRate: 0.05,
          }
        : undefined;

    const autopromoteConfig = autopromoteRules.filter(r => r.enabled).length > 0
      ? {
          rules: autopromoteRules.filter(r => r.enabled).map(r => ({
            evalSuiteId: r.evalSuiteId,
            evalSuiteName: r.evalSuiteName,
            noViolationsWindowHours: r.noViolationsWindowHours,
            targetCanaryPercent: r.targetCanaryPercent,
          })),
        }
      : undefined;

    onSubmit({
      agentId: formData.agentId,
      agentName: selectedAgent?.name,
      environment: formData.environment,
      version: formData.version,
      rolloutStrategy: formData.rolloutStrategy,
      canaryPercent: formData.canaryPercent,
      shadowEnabled: formData.shadowEnabled,
      rollbackConfig,
      canaryConfig,
      autopromoteConfig,
    });
  };

  const resetAndClose = (val: boolean) => {
    if (!val) {
      setStep(1);
    }
    onOpenChange(val);
  };

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Release</DialogTitle>
          <DialogDescription>
            Step {step} of 4 — {step === 1 ? "Source & Target" : step === 2 ? "Rollback Safeguards" : step === 3 ? "Autopromote Rules" : "Review & Submit"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              data-testid={`wizard-step-indicator-${s}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4" data-testid="wizard-step-1">
            <div className="flex flex-col gap-2">
              <Label>Agent</Label>
              <select
                className={selectClass}
                value={formData.agentId}
                onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                data-testid="select-wizard-agent"
              >
                <option value="">Select agent...</option>
                {agents?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (v{a.currentVersion})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Target Environment</Label>
                <select
                  className={selectClass}
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                  data-testid="select-wizard-environment"
                >
                  <option value="staging">Staging</option>
                  <option value="pilot">Pilot</option>
                  <option value="prod">Production</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Rollout Strategy</Label>
                <select
                  className={selectClass}
                  value={formData.rolloutStrategy}
                  onChange={(e) => setFormData({ ...formData, rolloutStrategy: e.target.value })}
                  data-testid="select-wizard-strategy"
                >
                  <option value="shadow">Shadow</option>
                  <option value="canary">Canary</option>
                  <option value="direct">Direct with Safeguards</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Version</Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  data-testid="input-wizard-version"
                />
              </div>
              {formData.rolloutStrategy === "canary" && (
                <div className="flex flex-col gap-2">
                  <Label>Initial Canary %</Label>
                  <Input
                    type="number"
                    value={formData.canaryPercent}
                    onChange={(e) => setFormData({ ...formData, canaryPercent: parseInt(e.target.value) || 0 })}
                    data-testid="input-wizard-canary"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium">Shadow Mode</span>
                  <span className="text-[10px] text-muted-foreground">Mirror traffic to candidate in dry-run</span>
                </div>
              </div>
              <Switch
                checked={formData.shadowEnabled}
                onCheckedChange={(val: boolean) => setFormData({ ...formData, shadowEnabled: val })}
                data-testid="switch-shadow-enabled"
              />
            </div>
            {formData.rolloutStrategy === "shadow" && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-indigo-500/5 border border-indigo-500/10">
                <Shield className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  Shadow mode runs the candidate version in parallel with no side effects. Traffic is mirrored via a dry-run tool proxy.
                </span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4" data-testid="wizard-step-2">
            <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/30">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Auto-Rollback</span>
              </div>
              <Switch
                checked={formData.autoRollbackEnabled}
                onCheckedChange={(val: boolean) => setFormData({ ...formData, autoRollbackEnabled: val })}
                data-testid="switch-auto-rollback"
              />
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-muted-foreground">Rollback Triggers</span>

              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/20" data-testid="trigger-eval-regression">
                <div className="flex items-center gap-2 min-w-0">
                  <Switch
                    checked={formData.evalRegressionEnabled}
                    onCheckedChange={(val: boolean) => setFormData({ ...formData, evalRegressionEnabled: val })}
                    data-testid="switch-eval-regression"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium">Eval Regression</span>
                    <span className="text-[10px] text-muted-foreground">Rollback if eval pass rate drops</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{">"}</span>
                  <Input
                    type="number"
                    className="w-16 h-8 text-xs"
                    value={formData.evalRegressionThreshold}
                    onChange={(e) => setFormData({ ...formData, evalRegressionThreshold: parseInt(e.target.value) || 0 })}
                    disabled={!formData.evalRegressionEnabled}
                    data-testid="input-eval-threshold"
                  />
                  <span className="text-[10px] text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/20" data-testid="trigger-policy-violation">
                <div className="flex items-center gap-2 min-w-0">
                  <Switch
                    checked={formData.policyViolationEnabled}
                    onCheckedChange={(val: boolean) => setFormData({ ...formData, policyViolationEnabled: val })}
                    data-testid="switch-policy-violation"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium">Policy Violations Spike</span>
                    <span className="text-[10px] text-muted-foreground">Rollback on violation count spike</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{">"}</span>
                  <Input
                    type="number"
                    className="w-16 h-8 text-xs"
                    value={formData.policyViolationThreshold}
                    onChange={(e) => setFormData({ ...formData, policyViolationThreshold: parseInt(e.target.value) || 0 })}
                    disabled={!formData.policyViolationEnabled}
                    data-testid="input-policy-threshold"
                  />
                  <span className="text-[10px] text-muted-foreground">/hr</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/20" data-testid="trigger-kpi-drop">
                <div className="flex items-center gap-2 min-w-0">
                  <Switch
                    checked={formData.kpiDropEnabled}
                    onCheckedChange={(val: boolean) => setFormData({ ...formData, kpiDropEnabled: val })}
                    data-testid="switch-kpi-drop"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium">KPI Drop Confidence</span>
                    <span className="text-[10px] text-muted-foreground">Rollback when KPI confidence falls</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{"<"}</span>
                  <Input
                    type="number"
                    step="0.1"
                    className="w-16 h-8 text-xs"
                    value={formData.kpiDropThreshold}
                    onChange={(e) => setFormData({ ...formData, kpiDropThreshold: parseFloat(e.target.value) || 0 })}
                    disabled={!formData.kpiDropEnabled}
                    data-testid="input-kpi-threshold"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4" data-testid="wizard-step-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Autopromote Rules</span>
              <p className="text-[11px] text-muted-foreground">
                Define conditions under which the canary percentage automatically increases. Each rule specifies an eval suite that must pass and a violation-free window before promotion.
              </p>
            </div>

            {autopromoteRules.map((rule, idx) => {
              const agentSuites = evalSuites?.filter((s) => s.agentId === formData.agentId) || [];
              return (
                <div key={rule.id} className="flex flex-col gap-3 p-3 rounded-md bg-muted/20" data-testid={`autopromote-rule-${idx}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(val: boolean) => {
                          const updated = [...autopromoteRules];
                          updated[idx] = { ...rule, enabled: val };
                          setAutopromoteRules(updated);
                        }}
                        data-testid={`switch-autopromote-${idx}`}
                      />
                      <span className="text-xs font-medium">Rule {idx + 1}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAutopromoteRules(autopromoteRules.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-rule-${idx}`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-[11px]">If eval suite</Label>
                    <select
                      className={selectClass}
                      value={rule.evalSuiteId}
                      onChange={(e) => {
                        const suite = agentSuites.find((s) => s.id === e.target.value);
                        const updated = [...autopromoteRules];
                        updated[idx] = { ...rule, evalSuiteId: e.target.value, evalSuiteName: suite?.name || "" };
                        setAutopromoteRules(updated);
                      }}
                      data-testid={`select-eval-suite-${idx}`}
                    >
                      <option value="">Select eval suite...</option>
                      {agentSuites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">passes and no violations in</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          className="text-xs"
                          value={rule.noViolationsWindowHours}
                          onChange={(e) => {
                            const updated = [...autopromoteRules];
                            updated[idx] = { ...rule, noViolationsWindowHours: parseInt(e.target.value) || 1 };
                            setAutopromoteRules(updated);
                          }}
                          data-testid={`input-window-hours-${idx}`}
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">hours</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[11px]">raise canary to</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          className="text-xs"
                          value={rule.targetCanaryPercent}
                          onChange={(e) => {
                            const updated = [...autopromoteRules];
                            updated[idx] = { ...rule, targetCanaryPercent: parseInt(e.target.value) || 0 };
                            setAutopromoteRules(updated);
                          }}
                          data-testid={`input-target-canary-${idx}`}
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                  {rule.enabled && rule.evalSuiteId && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                      <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">
                        If <span className="font-medium text-foreground">{rule.evalSuiteName || "suite"}</span> passes and no violations in {rule.noViolationsWindowHours}h, raise canary to {rule.targetCanaryPercent}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            <Button
              variant="outline"
              onClick={() => setAutopromoteRules([
                ...autopromoteRules,
                {
                  id: crypto.randomUUID(),
                  evalSuiteId: "",
                  evalSuiteName: "",
                  noViolationsWindowHours: 2,
                  targetCanaryPercent: 25,
                  enabled: true,
                },
              ])}
              data-testid="button-add-autopromote-rule"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add Autopromote Rule
            </Button>

            {autopromoteRules.length === 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/20">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  No autopromote rules. Canary percentage will only change manually.
                </span>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4" data-testid="wizard-step-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Release Summary</span>
              <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Agent</span>
                  <span className="text-xs font-medium" data-testid="review-agent">{selectedAgent?.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-xs font-medium" data-testid="review-version">v{formData.version}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Environment</span>
                  <Badge variant="outline" className={`text-[10px] ${envColors[formData.environment] || ""}`}>
                    {formData.environment}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Strategy</span>
                  <span className="text-xs font-medium" data-testid="review-strategy">{formData.rolloutStrategy}</span>
                </div>
                {formData.rolloutStrategy === "canary" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Initial Canary</span>
                    <span className="text-xs font-medium">{formData.canaryPercent}%</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Shadow Mode</span>
                  <Badge variant="outline" className={`text-[10px] ${formData.shadowEnabled ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : ""}`}>
                    {formData.shadowEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Rollback Safeguards</span>
              <div className="flex flex-col gap-1.5">
                {formData.evalRegressionEnabled && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20" data-testid="review-trigger-eval">
                    <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px]">Eval regression {">"} {formData.evalRegressionThreshold}%</span>
                  </div>
                )}
                {formData.policyViolationEnabled && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20" data-testid="review-trigger-policy">
                    <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px]">Policy violations {">"} {formData.policyViolationThreshold}/hr</span>
                  </div>
                )}
                {formData.kpiDropEnabled && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20" data-testid="review-trigger-kpi">
                    <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px]">KPI confidence {"<"} {formData.kpiDropThreshold}</span>
                  </div>
                )}
                {!formData.evalRegressionEnabled && !formData.policyViolationEnabled && !formData.kpiDropEnabled && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">No rollback triggers configured</span>
                  </div>
                )}
              </div>
            </div>

            {autopromoteRules.filter(r => r.enabled).length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Autopromote Rules</span>
                <div className="flex flex-col gap-1.5">
                  {autopromoteRules.filter(r => r.enabled).map((rule, idx) => (
                    <div key={rule.id} className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/10" data-testid={`review-autopromote-${idx}`}>
                      <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="text-[11px]">
                        If <span className="font-medium">{rule.evalSuiteName || "suite"}</span> passes and no violations in {rule.noViolationsWindowHours}h, raise canary to {rule.targetCanaryPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {requiresApproval && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10" data-testid="review-approval-required">
                <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  {formData.environment === "prod"
                    ? "A launch readiness approval will be auto-created for expert validation before this release goes live."
                    : "This agent has HIGH risk tier — pilot deployment requires expert approval."}
                </span>
              </div>
            )}

            {existingPendingApprovals && existingPendingApprovals.length > 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] text-amber-700 dark:text-amber-300">
                  {existingPendingApprovals.length} pending approval(s) exist for this agent
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} data-testid="button-wizard-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !formData.agentId}
              data-testid="button-wizard-next"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isPending || !formData.agentId || (formData.environment === "prod" && !wizardProdPerm.allowed) || (formData.environment !== "prod" && !wizardStagingPerm.allowed)}
              title={formData.environment === "prod" && !wizardProdPerm.allowed ? "You do not have permission to deploy to production" : formData.environment !== "prod" && !wizardStagingPerm.allowed ? "You do not have permission to deploy" : undefined}
              data-testid="button-wizard-submit"
            >
              {isPending ? "Creating..." : "Create Release"}
              {formData.environment === "prod" && wizardProdPerm.allowed && wizardProdPerm.permission.access === "conditional" && wizardProdPerm.permission.annotation && (
                <Badge variant="secondary" className="text-[10px] ml-1">{wizardProdPerm.permission.annotation}</Badge>
              )}
              {formData.environment !== "prod" && wizardStagingPerm.allowed && wizardStagingPerm.permission.access === "conditional" && wizardStagingPerm.permission.annotation && (
                <Badge variant="secondary" className="text-[10px] ml-1">{wizardStagingPerm.permission.annotation}</Badge>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreezeCenter({
  agents,
  deployments,
}: {
  agents: Agent[];
  deployments: Deployment[];
}) {
  const { toast } = useToast();
  const [freezeScope, setFreezeScope] = useState<"agent" | "org">("agent");
  const [freezeTargetId, setFreezeTargetId] = useState("");
  const [freezeReason, setFreezeReason] = useState("");

  const { data: freezeStatus } = useQuery<Record<string, FreezeStatus>>({
    queryKey: ["/api/deployments/freeze-status"],
  });

  const freezeMutation = useMutation({
    mutationFn: async (data: { action: string; scope: string; targetId?: string; reason?: string }) => {
      const res = await apiRequest("POST", "/api/deployments/freeze", data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments/freeze-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-events"] });
      toast({ title: vars.action === "freeze" ? "Deployments frozen" : "Deployments unfrozen" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const activeFreezes = freezeStatus ? Object.entries(freezeStatus).filter(([, v]) => v.frozen) : [];

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

  return (
    <Card data-testid="section-freeze-center">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Freeze Center</CardTitle>
          </div>
          {activeFreezes.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {activeFreezes.length} active freeze(s)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {activeFreezes.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Freezes</span>
            {activeFreezes.map(([key, freeze]) => (
              <div key={key} className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-red-500/5 border border-red-500/10" data-testid={`active-freeze-${key}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{key}</span>
                    {freeze.reason && (
                      <span className="text-[10px] text-muted-foreground truncate">{freeze.reason}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    freezeMutation.mutate({
                      action: "unfreeze",
                      scope: freeze.scope || "agent",
                      targetId: key,
                    })
                  }
                  disabled={freezeMutation.isPending}
                  data-testid={`button-unfreeze-${key}`}
                >
                  <Unlock className="w-3 h-3 mr-1" /> Unfreeze
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">New Freeze</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Scope</Label>
              <select
                className={selectClass}
                value={freezeScope}
                onChange={(e) => setFreezeScope(e.target.value as "agent" | "org")}
                data-testid="select-freeze-scope"
              >
                <option value="agent">Agent</option>
                <option value="org">Organization-wide</option>
              </select>
            </div>
            {freezeScope === "agent" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Agent</Label>
                <select
                  className={selectClass}
                  value={freezeTargetId}
                  onChange={(e) => setFreezeTargetId(e.target.value)}
                  data-testid="select-freeze-target"
                >
                  <option value="">Select agent...</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Reason</Label>
            <Input
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              placeholder="Incident investigation, change freeze..."
              data-testid="input-freeze-reason"
            />
          </div>
          <Button
            variant="destructive"
            onClick={() =>
              freezeMutation.mutate({
                action: "freeze",
                scope: freezeScope,
                targetId: freezeScope === "agent" ? freezeTargetId : "org",
                reason: freezeReason,
              })
            }
            disabled={freezeMutation.isPending || (freezeScope === "agent" && !freezeTargetId)}
            data-testid="button-freeze-submit"
          >
            <Lock className="w-4 h-4 mr-1.5" />
            {freezeMutation.isPending ? "Freezing..." : "Freeze Deployments"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Deployments() {
  const [createOpen, setCreateOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const stagingPerm = usePermission("deploy_staging_pilot");
  const prodPerm = usePermission("deploy_prod");

  const { data: deployments, isLoading } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: envHealth } = useQuery<Record<string, EnvHealth>>({
    queryKey: ["/api/deployments/health"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: freezeStatus } = useQuery<Record<string, FreezeStatus>>({
    queryKey: ["/api/deployments/freeze-status"],
  });
  const { data: evalSuites } = useQuery<EvalSuite[]>({
    queryKey: ["/api/eval-suites"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/deployments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      setCreateOpen(false);
      toast({ title: "Release created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create release", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const allDeploys = deployments || [];
  const activeDeploys = allDeploys.filter((d) => d.status === "deployed" || d.status === "active").length;
  const pendingDeploys = allDeploys.filter((d) => d.status === "pending").length;

  const envFreezeMap: Record<string, FreezeStatus | undefined> = {};
  if (freezeStatus) {
    for (const env of ["staging", "pilot", "prod"]) {
      const orgFreeze = freezeStatus["org"];
      if (orgFreeze?.frozen) {
        envFreezeMap[env] = { ...orgFreeze, scope: "org" };
        continue;
      }
      const envFreeze = freezeStatus[env];
      if (envFreeze?.frozen) {
        envFreezeMap[env] = envFreeze;
        continue;
      }
      const envDeploys = allDeploys.filter((d) => d.environment === env);
      for (const d of envDeploys) {
        if (freezeStatus[d.agentId]?.frozen) {
          envFreezeMap[env] = freezeStatus[d.agentId];
          break;
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-deployments">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground">
            Controlled rollout and release orchestration across environments
          </p>
        </div>
        {!stagingPerm.allowed ? (
          <Button disabled title="You do not have permission to create deployments" data-testid="button-create-deployment">
            <Plus className="w-4 h-4 mr-1.5" /> New Release
          </Button>
        ) : (
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-deployment">
            <Plus className="w-4 h-4 mr-1.5" /> New Release
            {stagingPerm.permission.access === "conditional" && stagingPerm.permission.annotation && (
              <Badge variant="secondary" className="text-[10px] ml-1">{stagingPerm.permission.annotation}</Badge>
            )}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Releases" value={allDeploys.length} icon={Rocket} variant="default" testId="stat-total-deploys" />
        <StatCard title="Active" value={activeDeploys} icon={CheckCircle} variant="success" testId="stat-active-deploys" />
        <StatCard title="Pending" value={pendingDeploys} icon={Clock} variant="warning" testId="stat-pending-deploys" />
      </div>

      <OutcomeKpiStrip compact />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EnvironmentPanel
          env="staging"
          deployments={allDeploys}
          onSelect={(id) => navigate(`/deployments/${id}`)}
          onNavigate={navigate}
          health={envHealth?.staging}
          approvals={approvals}
          freezeStatus={envFreezeMap.staging}
        />
        <EnvironmentPanel
          env="pilot"
          deployments={allDeploys}
          onSelect={(id) => navigate(`/deployments/${id}`)}
          onNavigate={navigate}
          health={envHealth?.pilot}
          approvals={approvals}
          freezeStatus={envFreezeMap.pilot}
        />
        <EnvironmentPanel
          env="prod"
          deployments={allDeploys}
          onSelect={(id) => navigate(`/deployments/${id}`)}
          onNavigate={navigate}
          health={envHealth?.prod}
          approvals={approvals}
          freezeStatus={envFreezeMap.prod}
        />
      </div>

      <FreezeCenter agents={agents || []} deployments={allDeploys} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All Releases</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {allDeploys.map((dep) => (
            <div
              key={dep.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer"
              onClick={() => navigate(`/deployments/${dep.id}`)}
              data-testid={`release-row-${dep.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-500/10 shrink-0">
                  <Rocket className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{dep.agentName || "Agent"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    v{dep.version} → {dep.environment} | {dep.rolloutStrategy}
                    {dep.canaryPercent ? ` (${dep.canaryPercent}% canary)` : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dep.signatureHash && (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    <Hash className="w-3 h-3 mr-0.5" />
                    {dep.signatureHash.split(":")[1]?.substring(0, 8) || "signed"}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] ${envColors[dep.environment] || ""}`}>
                  {dep.environment}
                </Badge>
                <StatusBadge status={dep.status} />
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
          ))}
          {allDeploys.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No releases yet</p>
          )}
        </CardContent>
      </Card>

      <CreateReleaseWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents || []}
        approvals={approvals || []}
        evalSuites={evalSuites || []}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
