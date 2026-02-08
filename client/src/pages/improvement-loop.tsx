import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Zap, Shield, TrendingUp, AlertTriangle, Check, X,
  ChevronRight, Clock, Brain, Cpu, BarChart3, ArrowRight,
  Loader2, Eye, ChevronDown, Activity, Target, Workflow,
  Wrench, Bug, GitBranch, RotateCcw,
} from "lucide-react";
import type { ImprovementCycle, Agent } from "@shared/schema";

const triggerTypeConfig: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  drift_detected: { label: "Drift Detected", icon: Activity, color: "text-amber-500" },
  eval_regression: { label: "Eval Regression", icon: TrendingUp, color: "text-red-500" },
  cost_anomaly: { label: "Cost Anomaly", icon: BarChart3, color: "text-orange-500" },
  latency_spike: { label: "Latency Spike", icon: Clock, color: "text-yellow-500" },
  model_update_available: { label: "Model Update", icon: Cpu, color: "text-blue-500" },
  policy_violation: { label: "Policy Violation", icon: Shield, color: "text-red-600" },
  workflow_change: { label: "Workflow Change", icon: Workflow, color: "text-purple-500" },
};

const actionTypeConfig: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  prompt_optimization: { label: "Prompt Optimization", icon: Brain, color: "text-violet-500" },
  model_upgrade: { label: "Model Upgrade", icon: Cpu, color: "text-blue-500" },
  retrain_on_new_data: { label: "Retrain on Data", icon: RefreshCw, color: "text-emerald-500" },
  workflow_adaptation: { label: "Workflow Adapt", icon: Workflow, color: "text-purple-500" },
  failure_patching: { label: "Failure Patch", icon: Bug, color: "text-red-500" },
  policy_update: { label: "Policy Update", icon: Shield, color: "text-amber-500" },
  config_tuning: { label: "Config Tuning", icon: Wrench, color: "text-cyan-500" },
};

const riskConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low Risk", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  medium: { label: "Medium Risk", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  high: { label: "High Risk", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  detected: { label: "Detected", className: "" },
  proposed: { label: "Proposed", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  pending_review: { label: "Pending Review", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  evaluating: { label: "Evaluating", className: "" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  applied: { label: "Applied", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  dismissed: { label: "Dismissed", className: "" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
};

const cycleStages = [
  { key: "detect", label: "Detect", icon: Activity, desc: "Monitor for drift, regressions, cost anomalies" },
  { key: "analyze", label: "Analyze", icon: Brain, desc: "AI analyzes root cause and proposes fixes" },
  { key: "evaluate", label: "Evaluate", icon: BarChart3, desc: "Run evals to validate proposed changes" },
  { key: "decide", label: "Decide", icon: GitBranch, desc: "Auto-apply safe changes, escalate high-risk" },
  { key: "apply", label: "Apply", icon: Check, desc: "Deploy improvement and monitor results" },
];

export default function ImprovementLoop() {
  const { toast } = useToast();
  const [selectedCycle, setSelectedCycle] = useState<ImprovementCycle | null>(null);
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery<ImprovementCycle[]>({
    queryKey: ["/api/improvement-cycles"],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const analyzeMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", "/api/ai/improvement-analyze", { agentId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/improvement-cycles"] });
      toast({ title: "Analysis complete", description: `Generated ${data.cycles.length} improvement proposals.` });
    },
    onError: (err: any) => {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const updateCycleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ImprovementCycle> }) => {
      const res = await apiRequest("PATCH", `/api/improvement-cycles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/improvement-cycles"] });
      setSelectedCycle(null);
    },
  });

  const filteredCycles = cycles.filter(c => {
    if (filterRisk !== "all" && c.riskLevel !== filterRisk) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterAction !== "all" && c.actionType !== filterAction) return false;
    return true;
  });

  const autoAppliedCount = cycles.filter(c => c.autoApplied).length;
  const expertReviewCount = cycles.filter(c => c.expertRequired).length;
  const pendingCount = cycles.filter(c => ["proposed", "pending_review", "detected"].includes(c.status)).length;
  const appliedCount = cycles.filter(c => c.status === "applied").length;

  const stageForCycle = (c: ImprovementCycle) => {
    switch (c.status) {
      case "detected": return 0;
      case "proposed": return 1;
      case "evaluating": return 2;
      case "pending_review":
      case "approved": return 3;
      case "applied": return 4;
      default: return -1;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <OutcomeKpiStrip />
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Continuous Improvement Loop</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Autonomous optimization with expert validation for high-impact changes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-[200px]" data-testid="select-agent-analyze">
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => selectedAgentId && analyzeMutation.mutate(selectedAgentId)}
              disabled={!selectedAgentId || analyzeMutation.isPending}
              data-testid="button-run-analysis"
            >
              {analyzeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Brain className="w-4 h-4 mr-2" /> Run AI Analysis</>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Auto-Applied" value={autoAppliedCount} icon={Zap} subtitle="Low-risk improvements" />
          <StatCard title="Expert Validated" value={expertReviewCount} icon={Shield} subtitle="High-impact changes" />
          <StatCard title="Pending Action" value={pendingCount} icon={Clock} subtitle="Awaiting decision" />
          <StatCard title="Total Applied" value={appliedCount} icon={Check} subtitle="Successfully deployed" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> The Improvement Cycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
              {cycleStages.map((stage, i) => {
                const StageIcon = stage.icon;
                const activeCyclesAtStage = cycles.filter(c => stageForCycle(c) === i).length;
                return (
                  <div key={stage.key} className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${activeCyclesAtStage > 0 ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-muted/50"}`}>
                        <StageIcon className={`w-5 h-5 ${activeCyclesAtStage > 0 ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <span className="text-xs font-medium">{stage.label}</span>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{stage.desc}</span>
                      {activeCyclesAtStage > 0 && (
                        <Badge variant="default" className="text-[10px]">{activeCyclesAtStage} active</Badge>
                      )}
                    </div>
                    {i < cycleStages.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                <span>80% autonomous (low/medium risk auto-applied)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                <span>20% expert validated (high-risk changes escalated)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger className="w-[140px]" data-testid="filter-risk">
              <SelectValue placeholder="Risk level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="detected">Detected</SelectItem>
              <SelectItem value="proposed">Proposed</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="evaluating">Evaluating</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[180px]" data-testid="filter-action">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="prompt_optimization">Prompt Optimization</SelectItem>
              <SelectItem value="model_upgrade">Model Upgrade</SelectItem>
              <SelectItem value="retrain_on_new_data">Retrain</SelectItem>
              <SelectItem value="workflow_adaptation">Workflow Adapt</SelectItem>
              <SelectItem value="failure_patching">Failure Patch</SelectItem>
              <SelectItem value="policy_update">Policy Update</SelectItem>
              <SelectItem value="config_tuning">Config Tuning</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filteredCycles.length} cycles</span>
        </div>

        {cyclesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filteredCycles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RotateCcw className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-state">No improvement cycles yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select an agent and run AI analysis to generate improvement proposals
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredCycles.map(cycle => {
              const trigger = triggerTypeConfig[cycle.triggerType] || triggerTypeConfig.drift_detected;
              const action = actionTypeConfig[cycle.actionType] || actionTypeConfig.prompt_optimization;
              const risk = riskConfig[cycle.riskLevel] || riskConfig.low;
              const status = statusConfig[cycle.status] || statusConfig.detected;
              const TriggerIcon = trigger.icon;
              const ActionIcon = action.icon;
              const agent = agents.find(a => a.id === cycle.agentId);
              const stageIdx = stageForCycle(cycle);

              return (
                <Card
                  key={cycle.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedCycle(cycle)}
                  data-testid={`card-cycle-${cycle.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${trigger.color} bg-current/10`} style={{ backgroundColor: `color-mix(in srgb, currentColor 10%, transparent)` }}>
                        <TriggerIcon className={`w-5 h-5 ${trigger.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{cycle.detectedIssue}</span>
                          <Badge variant="outline" className={risk.className}>{risk.label}</Badge>
                          <Badge variant="outline" className={status.className}>{status.label}</Badge>
                          {cycle.expertRequired && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"><Shield className="w-3 h-3 mr-1" /> Expert Required</Badge>
                          )}
                          {cycle.autoApplied && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Zap className="w-3 h-3 mr-1" /> Auto-Applied</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          {agent && <span>{agent.name}</span>}
                          <span className="flex items-center gap-1"><ActionIcon className="w-3 h-3" /> {action.label}</span>
                          <span className="flex items-center gap-1"><TriggerIcon className="w-3 h-3" /> {trigger.label}</span>
                          {cycle.createdAt && <span>{new Date(cycle.createdAt).toLocaleDateString()}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{cycle.proposedAction}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cycleStages.map((stage, si) => (
                          <div
                            key={stage.key}
                            className={`w-2 h-2 rounded-full ${si <= stageIdx ? "bg-primary" : "bg-muted-foreground/20"}`}
                          />
                        ))}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selectedCycle} onOpenChange={(open) => !open && setSelectedCycle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCycle && (
            <CycleDetailDialog
              cycle={selectedCycle}
              agent={agents.find(a => a.id === selectedCycle.agentId)}
              onApply={() => updateCycleMutation.mutate({ id: selectedCycle.id, data: { status: "applied", autoApplied: false, appliedAt: new Date().toISOString() as any } })}
              onAutoApply={() => updateCycleMutation.mutate({ id: selectedCycle.id, data: { status: "applied", autoApplied: true, appliedAt: new Date().toISOString() as any } })}
              onDismiss={() => updateCycleMutation.mutate({ id: selectedCycle.id, data: { status: "dismissed" } })}
              onEscalate={() => updateCycleMutation.mutate({ id: selectedCycle.id, data: { status: "pending_review", expertRequired: true } })}
              isPending={updateCycleMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CycleDetailDialog({ cycle, agent, onApply, onAutoApply, onDismiss, onEscalate, isPending }: {
  cycle: ImprovementCycle;
  agent?: Agent;
  onApply: () => void;
  onAutoApply: () => void;
  onDismiss: () => void;
  onEscalate: () => void;
  isPending: boolean;
}) {
  const trigger = triggerTypeConfig[cycle.triggerType] || triggerTypeConfig.drift_detected;
  const action = actionTypeConfig[cycle.actionType] || actionTypeConfig.prompt_optimization;
  const risk = riskConfig[cycle.riskLevel] || riskConfig.low;
  const status = statusConfig[cycle.status] || statusConfig.detected;
  const TriggerIcon = trigger.icon;
  const currentConfig = cycle.currentConfig as Record<string, any> | null;
  const proposedConfig = cycle.proposedConfig as Record<string, any> | null;
  const evalResult = cycle.evaluationResult as Record<string, any> | null;
  const blastRadius = cycle.blastRadius as Record<string, any> | null;
  const stageIdx = (() => {
    switch (cycle.status) {
      case "detected": return 0;
      case "proposed": return 1;
      case "evaluating": return 2;
      case "pending_review":
      case "approved": return 3;
      case "applied": return 4;
      default: return -1;
    }
  })();

  const isActionable = ["proposed", "pending_review", "detected"].includes(cycle.status);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TriggerIcon className={`w-5 h-5 ${trigger.color}`} />
          Improvement Cycle Detail
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={risk.className}>{risk.label}</Badge>
          <Badge variant="outline" className={status.className}>{status.label}</Badge>
          {cycle.expertRequired && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"><Shield className="w-3 h-3 mr-1" /> Expert Required</Badge>}
          {cycle.autoApplied && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Zap className="w-3 h-3 mr-1" /> Auto-Applied</Badge>}
          {agent && <Badge variant="secondary">{agent.name}</Badge>}
        </div>

        <div className="flex items-center gap-1">
          {cycleStages.map((stage, i) => {
            const StageIcon = stage.icon;
            return (
              <div key={stage.key} className="flex items-center gap-1">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${i <= stageIdx ? "bg-primary/10 text-primary font-medium" : "bg-muted text-muted-foreground"}`}>
                  <StageIcon className="w-3 h-3" />
                  {stage.label}
                </div>
                {i < cycleStages.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detected Issue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{cycle.detectedIssue}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Category: {cycle.issueCategory}</span>
              <span>Trigger: {trigger.label}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Proposed Action</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{cycle.proposedAction}</p>
            <span className="text-xs text-muted-foreground mt-1 inline-block">Type: {action.label}</span>
          </CardContent>
        </Card>

        {(currentConfig || proposedConfig) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration Diff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-red-500 dark:text-red-400 mb-1 block">Current</span>
                  <pre className="text-xs bg-red-500/5 border border-red-500/20 rounded-md p-3 overflow-auto max-h-40" data-testid="text-current-config">
                    {JSON.stringify(currentConfig, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="text-xs font-medium text-emerald-500 dark:text-emerald-400 mb-1 block">Proposed</span>
                  <pre className="text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-md p-3 overflow-auto max-h-40" data-testid="text-proposed-config">
                    {JSON.stringify(proposedConfig, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {evalResult && Object.keys(evalResult).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Expected Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(evalResult).map(([key, value]) => (
                  <div key={key} className="text-center p-2 rounded-md bg-muted/50">
                    <span className="text-xs text-muted-foreground block">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="text-sm font-semibold" data-testid={`text-eval-${key}`}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {blastRadius && Object.keys(blastRadius).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Blast Radius
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(blastRadius).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground min-w-[120px] text-xs">{key.replace(/([A-Z])/g, " $1").trim()}:</span>
                    <span className="text-xs" data-testid={`text-blast-${key}`}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isActionable && (
          <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
            {cycle.riskLevel !== "high" && (
              <Button onClick={onAutoApply} disabled={isPending} data-testid="button-auto-apply">
                <Zap className="w-4 h-4 mr-2" /> Auto-Apply
              </Button>
            )}
            <Button variant="outline" onClick={onApply} disabled={isPending} data-testid="button-apply-manually">
              <Check className="w-4 h-4 mr-2" /> Apply Manually
            </Button>
            {cycle.riskLevel !== "high" && (
              <Button variant="outline" onClick={onEscalate} disabled={isPending} data-testid="button-escalate">
                <Shield className="w-4 h-4 mr-2" /> Escalate to Expert
              </Button>
            )}
            <Button variant="outline" onClick={onDismiss} disabled={isPending} data-testid="button-dismiss-cycle">
              <X className="w-4 h-4 mr-2" /> Dismiss
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
