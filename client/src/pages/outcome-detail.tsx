import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Target,
  DollarSign,
  Shield,
  AlertTriangle,
  BarChart3,
  Scale,
  GitBranch,
  CheckCircle,
  XCircle,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Lock,
  Layers,
  Zap,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition } from "@shared/schema";

export default function OutcomeDetail() {
  const [, params] = useRoute("/outcomes/:id");
  const outcomeId = params?.id;
  const { toast } = useToast();
  const [createKpiOpen, setCreateKpiOpen] = useState(false);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editKpiData, setEditKpiData] = useState<Record<string, any>>({});

  const { data: outcome, isLoading } = useQuery<OutcomeContract>({
    queryKey: ["/api/outcomes", outcomeId],
    enabled: !!outcomeId,
  });

  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/outcomes", outcomeId, "kpis"],
    enabled: !!outcomeId,
  });

  const createKpiMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/kpis", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setCreateKpiOpen(false);
      toast({ title: "KPI created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create KPI", description: err.message, variant: "destructive" });
    },
  });

  const deleteKpiMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kpis/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      toast({ title: "KPI deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete KPI", description: err.message, variant: "destructive" });
    },
  });

  const updateKpiMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/kpis/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setEditingKpiId(null);
      toast({ title: "KPI updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update KPI", description: err.message, variant: "destructive" });
    },
  });

  const startEditKpi = (kpi: KpiDefinition) => {
    setEditingKpiId(kpi.id);
    setEditKpiData({
      baseline: kpi.baseline ?? 0,
      target: kpi.target,
      weight: kpi.weight ?? 1,
      slaThreshold: kpi.slaThreshold ?? "",
      breachLevel: kpi.breachLevel ?? "warning",
    });
  };

  const saveEditKpi = (id: string) => {
    updateKpiMutation.mutate({
      id,
      data: {
        baseline: parseFloat(editKpiData.baseline) || 0,
        target: parseFloat(editKpiData.target) || 0,
        weight: parseFloat(editKpiData.weight) || 1,
        slaThreshold: editKpiData.slaThreshold !== "" ? parseFloat(editKpiData.slaThreshold) : null,
        breachLevel: editKpiData.breachLevel,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!outcome) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Target className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Outcome contract not found</p>
        <Link href="/outcomes">
          <Button variant="outline" data-testid="button-back-outcomes">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Outcomes
          </Button>
        </Link>
      </div>
    );
  }

  const sla = (outcome.slaConfig || {}) as Record<string, any>;
  const attribution = (outcome.attributionRules || {}) as Record<string, any>;
  const gates = (outcome.approvalGates || []) as Array<Record<string, any>>;
  const tiers = (outcome.pricingTiers || []) as Array<Record<string, any>>;
  const avgProgress = kpis?.length
    ? kpis.reduce((sum, k) => sum + (k.target ? ((k.currentValue || 0) / k.target) * 100 : 0), 0) / kpis.length
    : 0;
  const weightedProgress = kpis?.length
    ? kpis.reduce((sum, k) => {
        const progress = k.target ? ((k.currentValue || 0) / k.target) * 100 : 0;
        return sum + progress * (k.weight || 1);
      }, 0) / kpis.reduce((sum, k) => sum + (k.weight || 1), 0)
    : 0;

  const breachCount = kpis?.filter(k => {
    if (!k.slaThreshold || !k.currentValue) return false;
    if (k.name.includes("Time") || k.name.includes("Latency")) return k.currentValue > k.slaThreshold;
    return k.currentValue < k.slaThreshold;
  }).length || 0;

  const trendIcon = (trend: string | null) => {
    if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-outcome-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/outcomes">
          <Button variant="ghost" size="icon" data-testid="button-back-outcomes">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-outcome-name">{outcome.name}</h1>
            <StatusBadge status={outcome.status} />
            <StatusBadge status={outcome.riskTier} />
            <Badge variant="outline" className="text-[10px]">v{outcome.version}</Badge>
          </div>
          {outcome.description && (
            <p className="text-sm text-muted-foreground">{outcome.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Weighted Progress"
          value={`${Math.round(weightedProgress)}%`}
          icon={Target}
          variant={weightedProgress >= 80 ? "success" : weightedProgress >= 50 ? "warning" : "danger"}
          testId="stat-weighted-progress"
        />
        <StatCard
          title="KPIs Tracked"
          value={kpis?.length || 0}
          icon={BarChart3}
          subtitle={`${breachCount} breaching SLA`}
          variant={breachCount > 0 ? "danger" : "default"}
          testId="stat-kpis-count"
        />
        <StatCard
          title="Price per Unit"
          value={`${outcome.currency || "USD"} ${outcome.pricePerUnit?.toFixed(2)}`}
          icon={DollarSign}
          subtitle={outcome.pricingModel?.replace(/_/g, " ")}
          variant="default"
          testId="stat-price"
        />
        <StatCard
          title="Risk Threshold"
          value={`${((outcome.riskThreshold || 0) * 100).toFixed(0)}%`}
          icon={Shield}
          subtitle={outcome.autoPauseTrigger ? "Auto-pause ON" : "Auto-pause OFF"}
          variant={outcome.autoPauseTrigger ? "warning" : "default"}
          testId="stat-risk-threshold"
        />
      </div>

      <Tabs defaultValue="kpis" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kpis" data-testid="tab-kpis">KPI Definitions</TabsTrigger>
          <TabsTrigger value="sla" data-testid="tab-sla">SLA Configuration</TabsTrigger>
          <TabsTrigger value="attribution" data-testid="tab-attribution">Attribution Rules</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing & Billing</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">Risk Tolerance</TabsTrigger>
          <TabsTrigger value="gates" data-testid="tab-gates">Approval Gates</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">KPI Definitions</h2>
              <p className="text-sm text-muted-foreground">Baselines, targets, weights, and SLA thresholds</p>
            </div>
            <Dialog open={createKpiOpen} onOpenChange={setCreateKpiOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-kpi">
                  <Plus className="w-4 h-4 mr-1.5" /> Add KPI
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add KPI Definition</DialogTitle>
                </DialogHeader>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    createKpiMutation.mutate({
                      outcomeId: outcomeId,
                      name: fd.get("name") as string,
                      unit: fd.get("unit") as string,
                      baseline: parseFloat(fd.get("baseline") as string) || 0,
                      target: parseFloat(fd.get("target") as string) || 0,
                      weight: parseFloat(fd.get("weight") as string) || 1,
                      slaThreshold: parseFloat(fd.get("slaThreshold") as string) || null,
                      breachLevel: fd.get("breachLevel") as string,
                      expression: fd.get("expression") as string,
                    });
                  }}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-name">Name</Label>
                      <Input id="kpi-name" name="name" required placeholder="e.g., Resolution Rate" data-testid="input-kpi-name" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-unit">Unit</Label>
                      <select name="unit" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="count" data-testid="select-kpi-unit">
                        <option value="count">Count</option>
                        <option value="percent">Percent</option>
                        <option value="score">Score</option>
                        <option value="seconds">Seconds</option>
                        <option value="milliseconds">Milliseconds</option>
                        <option value="dollars">Dollars</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-baseline">Baseline</Label>
                      <Input id="kpi-baseline" name="baseline" type="number" step="any" placeholder="0" data-testid="input-kpi-baseline" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-target">Target</Label>
                      <Input id="kpi-target" name="target" type="number" step="any" required placeholder="100" data-testid="input-kpi-target" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-weight">Weight</Label>
                      <Input id="kpi-weight" name="weight" type="number" step="0.01" defaultValue="1" placeholder="1.0" data-testid="input-kpi-weight" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-sla">SLA Threshold</Label>
                      <Input id="kpi-sla" name="slaThreshold" type="number" step="any" placeholder="Minimum acceptable" data-testid="input-kpi-sla" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Breach Level</Label>
                      <select name="breachLevel" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="warning" data-testid="select-kpi-breach">
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="kpi-expression">Expression</Label>
                    <Input id="kpi-expression" name="expression" placeholder="e.g., count(events WHERE status='success')" data-testid="input-kpi-expression" />
                  </div>
                  <Button type="submit" disabled={createKpiMutation.isPending} data-testid="button-submit-kpi">
                    {createKpiMutation.isPending ? "Creating..." : "Add KPI"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {kpis?.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <BarChart3 className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No KPIs defined yet</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {kpis?.map((kpi) => {
              const progress = kpi.target ? ((kpi.currentValue || 0) / kpi.target) * 100 : 0;
              const baselineProgress = kpi.target && kpi.baseline ? ((kpi.baseline || 0) / kpi.target) * 100 : 0;
              const isInverse = kpi.name.includes("Time") || kpi.name.includes("Latency");
              const isBreaching = kpi.slaThreshold != null && kpi.currentValue != null && (
                isInverse ? kpi.currentValue > kpi.slaThreshold : kpi.currentValue < kpi.slaThreshold
              );

              return (
                <Card key={kpi.id} data-testid={`card-kpi-${kpi.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                            <Gauge className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{kpi.name}</span>
                              {isBreaching && (
                                <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                                  {kpi.breachLevel === "critical" ? "SLA BREACH" : "SLA WARNING"}
                                </Badge>
                              )}
                              {trendIcon(kpi.trend)}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              Weight: {((kpi.weight || 1) * 100).toFixed(0)}% | Unit: {kpi.unit}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {editingKpiId === kpi.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => saveEditKpi(kpi.id)}
                                disabled={updateKpiMutation.isPending}
                                data-testid={`button-save-kpi-${kpi.id}`}
                              >
                                <Save className="w-3.5 h-3.5 text-emerald-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingKpiId(null)}
                                data-testid={`button-cancel-kpi-${kpi.id}`}
                              >
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditKpi(kpi)}
                                data-testid={`button-edit-kpi-${kpi.id}`}
                              >
                                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteKpiMutation.mutate(kpi.id)}
                                data-testid={`button-delete-kpi-${kpi.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingKpiId === kpi.id ? (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</span>
                            <Input
                              type="number"
                              step="any"
                              value={editKpiData.baseline}
                              onChange={(e) => setEditKpiData({ ...editKpiData, baseline: e.target.value })}
                              className="h-8 text-sm"
                              data-testid={`input-edit-baseline-${kpi.id}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</span>
                            <Input
                              type="number"
                              step="any"
                              value={editKpiData.target}
                              onChange={(e) => setEditKpiData({ ...editKpiData, target: e.target.value })}
                              className="h-8 text-sm"
                              data-testid={`input-edit-target-${kpi.id}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={editKpiData.weight}
                              onChange={(e) => setEditKpiData({ ...editKpiData, weight: e.target.value })}
                              className="h-8 text-sm"
                              data-testid={`input-edit-weight-${kpi.id}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA Threshold</span>
                            <Input
                              type="number"
                              step="any"
                              value={editKpiData.slaThreshold}
                              onChange={(e) => setEditKpiData({ ...editKpiData, slaThreshold: e.target.value })}
                              className="h-8 text-sm"
                              data-testid={`input-edit-sla-${kpi.id}`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Breach Level</span>
                            <select
                              value={editKpiData.breachLevel}
                              onChange={(e) => setEditKpiData({ ...editKpiData, breachLevel: e.target.value })}
                              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                              data-testid={`select-edit-breach-${kpi.id}`}
                            >
                              <option value="warning">Warning</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</span>
                            <span className="text-sm font-medium" data-testid={`text-baseline-${kpi.id}`}>{kpi.baseline ?? "N/A"} {kpi.unit}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</span>
                            <span className="text-sm font-medium">{kpi.currentValue ?? 0} {kpi.unit}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</span>
                            <span className="text-sm font-medium" data-testid={`text-target-${kpi.id}`}>{kpi.target} {kpi.unit}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA Threshold</span>
                            <span className="text-sm font-medium" data-testid={`text-sla-${kpi.id}`}>{kpi.slaThreshold ?? "N/A"} {kpi.unit}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Progress to Target</span>
                          <span className="text-xs font-medium">{Math.min(Math.round(progress), 100)}%</span>
                        </div>
                        <div className="relative">
                          <Progress value={Math.min(progress, 100)} className="h-2" />
                          {baselineProgress > 0 && (
                            <div
                              className="absolute top-0 h-2 w-0.5 bg-muted-foreground/50"
                              style={{ left: `${Math.min(baselineProgress, 100)}%` }}
                              title={`Baseline: ${kpi.baseline}`}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Confidence: {((kpi.confidence || 0) * 100).toFixed(0)}%</span>
                          {kpi.expression && (
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[50%]" title={kpi.expression}>
                              {kpi.expression}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">SLA Configuration</h2>
            <p className="text-sm text-muted-foreground">Service level agreement thresholds and breach penalties</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Success Rate SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Minimum Success Rate</span>
                    <span className="text-sm font-semibold">{sla.minSuccessRate ? `${(sla.minSuccessRate * 100).toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {sla.minSuccessRate && (
                    <Progress value={sla.minSuccessRate * 100} className="h-1.5" />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Latency SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Max P95 Latency</span>
                  <span className="text-sm font-semibold">{sla.maxP95LatencyMs ? `${(sla.maxP95LatencyMs / 1000).toFixed(1)}s` : "N/A"}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Uptime SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Minimum Uptime</span>
                  <span className="text-sm font-semibold">{sla.uptimePercent ? `${sla.uptimePercent}%` : "N/A"}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" /> Breach Penalty
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Penalty Rate</span>
                    <span className="text-sm font-semibold">{sla.breachPenaltyPercent ? `${sla.breachPenaltyPercent}%` : "N/A"}</span>
                  </div>
                  {sla.maxPolicyViolationRate != null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Max Policy Violation Rate</span>
                      <span className="text-sm font-semibold">{(sla.maxPolicyViolationRate * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attribution" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Attribution Rules</h2>
            <p className="text-sm text-muted-foreground">How outcome events get attributed to agent runs</p>
          </div>
          {attribution.model ? (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                      <GitBranch className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold capitalize">{attribution.model.replace(/_/g, " ")} Attribution</span>
                      <span className="text-xs text-muted-foreground">{attribution.description}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</span>
                      <span className="text-sm font-medium capitalize">{attribution.model?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Window</span>
                      <span className="text-sm font-medium">{attribution.windowHours}h</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trace Link</span>
                      <span className="text-sm font-medium flex items-center gap-1">
                        {attribution.requireTraceLink ? (
                          <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Required</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5 text-muted-foreground" /> Optional</>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Escalated</span>
                      <span className="text-sm font-medium flex items-center gap-1">
                        {attribution.excludeEscalated ? (
                          <><XCircle className="w-3.5 h-3.5 text-red-500" /> Excluded</>
                        ) : (
                          <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Included</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <GitBranch className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No attribution rules configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Pricing & Billing</h2>
            <p className="text-sm text-muted-foreground">Outcome-based pricing model, tiers, and volume caps</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" /> Pricing Model
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Model</span>
                    <span className="text-sm font-semibold">{outcome.pricingModel?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Base Price</span>
                    <span className="text-sm font-semibold">{outcome.currency} {outcome.pricePerUnit?.toFixed(2)} / unit</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Currency</span>
                    <span className="text-sm font-semibold">{outcome.currency || "USD"}</span>
                  </div>
                  {outcome.volumeCap && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Volume Cap</span>
                      <span className="text-sm font-semibold">{outcome.volumeCap.toLocaleString()} units/period</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> Pricing Tiers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {tiers.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {tiers.map((tier, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">
                          {tier.minVolume.toLocaleString()} - {tier.maxVolume ? tier.maxVolume.toLocaleString() : "Unlimited"}
                        </span>
                        <span className="text-sm font-semibold">{outcome.currency} {tier.pricePerUnit.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Flat pricing (no tiers)</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Risk Tolerance</h2>
            <p className="text-sm text-muted-foreground">Thresholds, drift limits, and automatic safety controls</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Risk Tier
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <StatusBadge status={outcome.riskTier} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Risk Threshold</span>
                    <span className="text-sm font-semibold">{((outcome.riskThreshold || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(outcome.riskThreshold || 0) * 100} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" /> Max Drift
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Max Drift Allowed</span>
                    <span className="text-sm font-semibold">{outcome.maxDriftPercent || 0}%</span>
                  </div>
                  <Progress value={outcome.maxDriftPercent || 0} className="h-1.5" />
                  <span className="text-xs text-muted-foreground">Performance drift beyond this triggers alert</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" /> Auto-Pause
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {outcome.autoPauseTrigger ? (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {outcome.autoPauseTrigger
                      ? "Agent will be automatically paused if risk threshold is exceeded"
                      : "Manual intervention required when risk threshold exceeded"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gates" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Approval Gates</h2>
            <p className="text-sm text-muted-foreground">Lifecycle stages requiring expert validation before proceeding</p>
          </div>
          {gates.length > 0 ? (
            <div className="space-y-3">
              {gates.map((gate, i) => (
                <Card key={i} data-testid={`card-gate-${i}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                          <Lock className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold capitalize">{gate.stage?.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground capitalize">Approver: {gate.approverRole?.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={gate.required
                        ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                        : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20"
                      }>
                        {gate.required ? "Required" : "Optional"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Lock className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No approval gates configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
